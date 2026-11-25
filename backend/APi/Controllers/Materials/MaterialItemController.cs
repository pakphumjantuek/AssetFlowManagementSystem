using Core.Interfaces.Specifications.MaterialItem;

namespace API.Controllers;

public partial class MaterialItemController(IUnitOfWork unit, IMapper mapper, CentralDepartmentService central, MaterialStockService stock) : BaseApiController
{
    [HttpGet("faculty-stock")]
    public async Task<ActionResult> GetFacultyStock(
        [FromQuery] int? fiscal_year_id, [FromQuery] int? material_item_id,
        [FromQuery] string? search)
    {
        var years = (await unit.Repository<Fiscal_years>().ListAllAsync())
            .OrderByDescending(x => x.start_date).ToList();
        var year = fiscal_year_id.HasValue
            ? years.FirstOrDefault(x => x.fiscal_year_id == fiscal_year_id.Value)
            : null;
        if (fiscal_year_id.HasValue && year == null) return BadRequest("ไม่พบปีงบประมาณ");
        var start = year?.start_date.Date ?? DateTime.MinValue;
        var endExclusive = year?.end_date.Date.AddDays(1) ?? DateTime.MaxValue;
        var departments = (await unit.Repository<Departments>().ListAllAsync())
            .Where(x => x.is_active).ToDictionary(x => x.department_id, x => x.department_name);
        var units = (await unit.Repository<MaterialUnit>().ListAllAsync())
            .ToDictionary(x => x.unit_id, x => x.unit_name);
        // ประเภทเงินในรายงาน ใช้ชื่อย่อหมวดเงิน ถ้าไม่มีใช้ชื่อเต็ม
        var funds = (await unit.Repository<Fund_categories>().ListAllAsync())
            .ToDictionary(x => x.fund_category_id, x => string.IsNullOrWhiteSpace(x.fund_short_name) ? x.fund_name : x.fund_short_name);
        var materials = (await unit.Repository<MaterialItem>().ListAllAsync())
            .Where(x => x.is_active && (!material_item_id.HasValue || x.material_item_id == material_item_id.Value) &&
                (string.IsNullOrWhiteSpace(search) ||
                 x.material_name.Contains(search, StringComparison.OrdinalIgnoreCase) ||
                 (x.material_code?.Contains(search, StringComparison.OrdinalIgnoreCase) ?? false)))
            .OrderBy(x => x.material_name).ToList();
        var allCards = await stock.ActiveCards().AsNoTracking()
            .Where(x => !material_item_id.HasValue || x.material_item_id == material_item_id.Value)
            .ToListAsync();
        var cards = allCards.Where(x => x.transaction_date < endExclusive).ToList();
        var records = (await unit.Repository<Procurement_records>().ListAllAsync())
            .ToDictionary(x => x.procurement_record_id);
        var staffDepartments = (await unit.Repository<Staffs>().ListAllAsync())
            .ToDictionary(x => x.staff_id, x => x.department_id);
        var withdrawals = (await unit.Repository<MaterialWithdrawal>().ListAllAsync())
            .ToDictionary(x => x.material_withdrawal_id);

        var data = materials.Select(material =>
        {
            var fiscalMismatchCount = allCards.Count(x =>
                x.material_item_id == material.material_item_id && x.fiscal_year_id.HasValue &&
                (year == null
                    ? years.All(y => y.fiscal_year_id != x.fiscal_year_id ||
                        x.transaction_date < y.start_date.Date ||
                        x.transaction_date >= y.end_date.Date.AddDays(1))
                    : (x.fiscal_year_id == year.fiscal_year_id &&
                       (x.transaction_date < start || x.transaction_date >= endExclusive)) ||
                      (x.transaction_date >= start && x.transaction_date < endExclusive &&
                       x.fiscal_year_id != year.fiscal_year_id)));
            var itemCards = cards.Where(x => x.material_item_id == material.material_item_id).ToList();
            var periodCards = itemCards.Where(x => x.transaction_date >= start).ToList();
            var opening = itemCards.Where(x => x.transaction_date < start)
                .Sum(x => x.quantity_in - x.quantity_out);
            var events = periodCards.GroupBy(x => x.material_withdrawal_id.HasValue
                ? $"W:{x.material_withdrawal_id}:{x.transaction_date.Date:yyyyMMdd}"
                : x.issue_detail_id.HasValue
                    ? $"I:{x.issue_detail_id}:{x.transaction_date.Date:yyyyMMdd}"
                    : x.receive_detail_id.HasValue
                        ? $"R:{x.receive_detail_id}:{x.transaction_date.Date:yyyyMMdd}"
                        : $"C:{x.stock_card_id}")
                .Select(g => g.Sum(x => x.quantity_in - x.quantity_out)).ToList();
            var received = events.Where(x => x > 0).Sum();
            var issued = -events.Where(x => x < 0).Sum();
            var balance = itemCards.Sum(x => x.quantity_in - x.quantity_out);
            var departmentRows = departments.Select(department =>
            {
                var scoped = itemCards.Where(x => x.department_id == department.Key).ToList();
                var inPeriod = scoped.Where(x => x.transaction_date >= start).ToList();
                return new
                {
                    department_id = department.Key,
                    department_name = department.Value,
                    opening_balance = scoped.Where(x => x.transaction_date < start)
                        .Sum(x => x.quantity_in - x.quantity_out),
                    quantity_in = inPeriod.Sum(x => x.quantity_in),
                    quantity_out = inPeriod.Sum(x => x.quantity_out),
                    current_balance = scoped.Sum(x => x.quantity_in - x.quantity_out)
                };
            }).OrderBy(x => x.department_name).ToList();
            var departmentBalance = departmentRows.Sum(x => x.current_balance);
            var unknownDepartment = balance - itemCards.Where(x => x.department_id.HasValue &&
                departments.ContainsKey(x.department_id.Value))
                .Sum(x => x.quantity_in - x.quantity_out);
            var incompleteTransfer = itemCards.Where(x => x.material_withdrawal_id.HasValue)
                .GroupBy(x => new { x.material_withdrawal_id, Date = x.transaction_date.Date })
                .Any(g =>
                {
                    var withdrawalId = g.Key.material_withdrawal_id!.Value;
                    if (!withdrawals.TryGetValue(withdrawalId, out var withdrawal) ||
                        !records.TryGetValue(withdrawal.procurement_record_id, out var record) ||
                        !staffDepartments.TryGetValue(withdrawal.staff_id, out var destination))
                        return true;
                    return g.Any(x => x.transaction_type == "OUT" &&
                        x.department_id != destination) &&
                        g.Sum(x => x.quantity_in - x.quantity_out) != 0;
                });
            decimal? unitPrice = material.unit_price;
            decimal? value = unitPrice.HasValue ? balance * unitPrice.Value : null;
            return new
            {
                material_item_id = material.material_item_id,
                material.material_code, material.material_name, material.specification,
                unit_name = units.GetValueOrDefault(material.unit_id),
                fund_name = material.fund_category_id.HasValue ? funds.GetValueOrDefault(material.fund_category_id.Value) : null,
                fiscal_year_id = year?.fiscal_year_id,
                opening_balance = opening, quantity_in = received, quantity_out = issued,
                current_balance = balance, unit_price = unitPrice, total_amount = value,
                department_balance = departmentBalance,
                fiscal_year_mismatch_count = fiscalMismatchCount,
                unknown_department_balance = unknownDepartment,
                has_discrepancy = unknownDepartment != 0 || incompleteTransfer ||
                    fiscalMismatchCount > 0 ||
                    opening + received - issued != balance ||
                    departmentRows.Any(x => x.current_balance < 0),
                valuation_available = value.HasValue,
                departments = departmentRows
            };
        }).ToList();
        return Ok(new { fiscal_year_id = year?.fiscal_year_id, fiscal_year = year?.fiscal_year,
            start_date = year?.start_date.Date, end_date = year?.end_date.Date, items = data });
    }

    // Document rows backed by receipts physically held in the central warehouse.
    [HttpGet("central-available")]
    public async Task<ActionResult> GetCentralAvailable(
        [FromQuery] int? fiscal_year_id, [FromQuery] string? search,
        [FromQuery] int? material_item_id)
    {
        var centralId = await central.GetIdAsync();
        var records = (await unit.Repository<Procurement_records>().ListAllAsync())
            .Where(x => x.is_active && (!fiscal_year_id.HasValue || x.fiscal_year_id == fiscal_year_id.Value))
            .ToDictionary(x => x.procurement_record_id);
        var allReceives = (await unit.Repository<MaterialReceiveDetail>().ListAllAsync())
            .Where(x => x.is_active && records.ContainsKey(x.procurement_record_id) &&
                (!material_item_id.HasValue || x.material_item_id == material_item_id.Value)).ToList();
        var activeStockCards = (await unit.Repository<MaterialStockCard>().ListAllAsync())
            .Where(x => x.is_active).ToList();
        var centralReceiptIds = activeStockCards.Where(x => x.department_id == centralId &&
                x.receive_detail_id.HasValue && !x.material_withdrawal_id.HasValue && x.quantity_in > 0)
            .Select(x => x.receive_detail_id!.Value).ToHashSet();
        var receives = allReceives.Where(x => centralReceiptIds.Contains(x.receive_detail_id)).ToList();
        var materials = (await unit.Repository<MaterialItem>().ListAllAsync())
            .Where(x => x.is_active).ToDictionary(x => x.material_item_id);
        var units = (await unit.Repository<MaterialUnit>().ListAllAsync())
            .ToDictionary(x => x.unit_id, x => x.unit_name);
        var cards = activeStockCards
            .Where(x =>
                (!material_item_id.HasValue || x.material_item_id == material_item_id.Value) &&
                (x.material_withdrawal_id.HasValue || x.issue_detail_id.HasValue) &&
                x.department_id == centralId).ToList();
        var receiveById = receives.ToDictionary(x => x.receive_detail_id);
        bool HasValidReceipt(MaterialStockCard card) =>
            card.receive_detail_id.HasValue &&
            receiveById.TryGetValue(card.receive_detail_id.Value, out var receive) &&
            receive.procurement_record_id == card.procurement_record_id &&
            receive.material_item_id == card.material_item_id;
        var issued = cards.Where(HasValidReceipt)
            .GroupBy(x => x.receive_detail_id!.Value)
            .ToDictionary(g => g.Key, g => g.Sum(x => x.quantity_out - x.quantity_in));
        var unassigned = cards.Where(x => !HasValidReceipt(x))
            .GroupBy(x => new { x.procurement_record_id, x.material_item_id })
            .Select(g => new { g.Key.procurement_record_id, g.Key.material_item_id,
                quantity = g.Sum(x => x.quantity_out - x.quantity_in) })
            .Where(x => x.quantity != 0).ToList();
        var rows = receives.Where(x => materials.ContainsKey(x.material_item_id))
            .Select(x =>
            {
                var used = issued.GetValueOrDefault(x.receive_detail_id);
                var record = records[x.procurement_record_id];
                return new
                {
                    x.receive_detail_id, x.procurement_record_id, record.document_no,
                    record.fiscal_year_id, x.material_item_id, x.quantity,
                    quantity_out = used, current_balance = x.quantity - used, x.unit_price
                };
            }).ToList();
        var items = rows.GroupBy(x => x.material_item_id)
            .Where(g => string.IsNullOrWhiteSpace(search) ||
                materials[g.Key].material_name.Contains(search, StringComparison.OrdinalIgnoreCase) ||
                (materials[g.Key].material_code?.Contains(search, StringComparison.OrdinalIgnoreCase) ?? false))
            .Select(g => new
            {
                material_item_id = g.Key,
                materials[g.Key].material_code,
                materials[g.Key].material_name,
                materials[g.Key].specification,
                unit_name = units.GetValueOrDefault(materials[g.Key].unit_id),
                quantity_in = g.Sum(x => x.quantity),
                quantity_out = g.Sum(x => x.quantity_out),
                current_balance = g.Sum(x => x.current_balance),
                unit_price = g.OrderByDescending(x => x.receive_detail_id).First().unit_price,
                total_amount = g.Sum(x => x.current_balance * x.unit_price),
                rows = g.OrderBy(x => x.document_no).ThenBy(x => x.receive_detail_id).ToList(),
                has_unassigned_outgoing = unassigned.Any(x => x.material_item_id == g.Key)
            }).OrderBy(x => x.material_name).ToList();
        return Ok(new { items, unassigned });
    }
    [HttpGet]
    public async Task<ActionResult<Pagination<MaterialItemDto>>> GetMaterialItems(
       [FromQuery] MaterialItemSpecParams materialItemParams
   )
    {
        var spec = new MaterialItemSpecification(materialItemParams);
        var materialItems = await unit.Repository<MaterialItem>().ListAsync(spec);

        var countSpec = new MaterialItemSpecification(materialItemParams);
        var totalItems = await unit.Repository<MaterialItem>().CountAsync(countSpec);

        var data = mapper.Map<List<MaterialItemDto>>(materialItems);

        // ดึงเฉพาะ stock card ของวัสดุในหน้านี้
        var pageItemIds = data.Select(x => x.material_item_id).ToList();
        var stockCards = await stock.ActiveCards().AsNoTracking()
            .Where(x => pageItemIds.Contains(x.material_item_id)).ToListAsync();
        var scopedStockCards = stockCards
            .Where(x =>
                x.is_active &&
                (
                    !materialItemParams.FiscalYearId.HasValue ||
                    x.fiscal_year_id == materialItemParams.FiscalYearId.Value
                )
            )
            .ToList();

        foreach (var item in data)
        {
            var itemStockCards = scopedStockCards
                .Where(x => x.material_item_id == item.material_item_id)
                .OrderBy(x => x.transaction_date)
                .ThenBy(x => x.stock_card_id)
                .ToList();

            var quantityIn = itemStockCards.Sum(x => x.quantity_in);
            var quantityOut = itemStockCards.Sum(x => x.quantity_out);
            var lastStockCard = itemStockCards.LastOrDefault();
            var currentBalance = itemStockCards
                .GroupBy(x => x.department_id)
                .Select(g => g
                    .OrderByDescending(x => x.transaction_date)
                    .ThenByDescending(x => x.stock_card_id)
                    .First()
                    .balance_qty)
                .Sum();

            item.quantity_in = quantityIn;
            item.quantity_out = quantityOut;
            item.current_balance = currentBalance;
            item.unit_price = lastStockCard?.unit_price ?? item.unit_price;
            item.total_amount = item.current_balance * item.unit_price;
        }

        return Ok(new Pagination<MaterialItemDto>(
            materialItemParams.PageIndex,
            materialItemParams.PageSize,
            totalItems,
            data
        ));
    }

    [HttpGet("by-department/{departmentId:int}")]
    public async Task<ActionResult<List<MaterialItemDto>>> GetMaterialItemsByDepartment(
      int departmentId,
      [FromQuery] int? fiscal_year_id,
      [FromQuery] string? search
  )
    {
        var spec = new MaterialItemSpecification(new MaterialItemSpecParams
        {
            PageIndex = 1,
            PageSize = 1000
        });

        var materialItems = await unit.Repository<MaterialItem>().ListAsync(spec);
        var stockCards = await stock.ActiveCards().AsNoTracking()
            .Where(x => x.department_id == departmentId).ToListAsync();

        var stockCardsByDepartment = stockCards
            .Where(x =>
                x.is_active &&
                x.department_id == departmentId &&
                (!fiscal_year_id.HasValue || x.fiscal_year_id == fiscal_year_id.Value)
            )
            .ToList();

        var data = materialItems
            .Where(x =>
                x.is_active &&
                (
                    string.IsNullOrWhiteSpace(search) ||
                    x.material_name.Contains(search) ||
                    x.material_code.Contains(search)
                )
            )
            .Select(item =>
            {
                var itemStockCards = stockCardsByDepartment
                    .Where(sc => sc.material_item_id == item.material_item_id)
                    .OrderBy(sc => sc.transaction_date)
                    .ThenBy(sc => sc.stock_card_id)
                    .ToList();

                var quantityIn = itemStockCards.Sum(x => x.quantity_in);
                var quantityOut = itemStockCards.Sum(x => x.quantity_out);

                var lastStockCard = itemStockCards
                    .OrderByDescending(x => x.transaction_date)
                    .ThenByDescending(x => x.stock_card_id)
                    .FirstOrDefault();

                var balance = lastStockCard?.balance_qty ?? 0;
                var unitPrice = lastStockCard?.unit_price ?? item.unit_price;

                return new MaterialItemDto
                {
                    material_item_id = item.material_item_id,
                    material_code = item.material_code,
                    material_name = item.material_name,
                    unit_price = unitPrice,
                    unit_id = item.unit_id,
                    unit_name = item.Unit != null ? item.Unit.unit_name : null,
                    quantity_in = quantityIn,
                    quantity_out = quantityOut,
                    current_balance = balance,
                    total_amount = balance * unitPrice
                };
            })
            .Where(x => x.current_balance > 0 || x.quantity_in > 0 || x.quantity_out > 0)
            .ToList();

        return Ok(data);
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<MaterialItemDto>> GetMaterialItem(int id)
    {
        var materialItem = await unit.Repository<MaterialItem>().GetByIdAsync(id);

        if (materialItem == null) return NotFound();
        return mapper.Map<MaterialItemDto>(materialItem);
    }

    [HttpPost]
    public async Task<ActionResult<MaterialItemDto>> CreateMaterialItem(MaterialItemDto dto)
    {
        var materialItems = await unit.Repository<MaterialItem>().ListAllAsync();

        var materialItem = mapper.Map<MaterialItem>(dto);
        materialItem.is_active = true;
        materialItem.created_at = DateTime.UtcNow;

        unit.Repository<MaterialItem>().Add(materialItem);

        if (await unit.Complete())
        {
            return CreatedAtAction(
                nameof(GetMaterialItem),
                new { id = materialItem.material_item_id },
                mapper.Map<MaterialItemDto>(materialItem)
            );
        }

        return BadRequest("Problem creating material item");
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> UpdateMaterialItem(int id, MaterialItemDto dto)
    {
        if (id != dto.material_item_id)
            return BadRequest("Cannot update this material item");

        var existingMaterialItem = await unit.Repository<MaterialItem>().GetByIdAsync(id);

        if (existingMaterialItem == null)
            return NotFound("Material item not found");

        mapper.Map(dto, existingMaterialItem);

        existingMaterialItem.updated_at = DateTime.Now;
        if (await unit.Complete())
            return NoContent();

        return BadRequest("Problem updating the material item");
    }

    //[Authorize(Roles = "Admin")]
    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteMaterialItem(int id)
    {
        var materialItem = await unit.Repository<MaterialItem>().GetByIdAsync(id);

        if (materialItem == null) return NotFound();
        materialItem.is_active = false;
        materialItem.updated_at = DateTime.UtcNow;

        unit.Repository<MaterialItem>().Update(materialItem);

        if (await unit.Complete())
        {
            return NoContent();
        }

        return BadRequest("Problem deleting material item");
    }

    [HttpPost("{id}/copy")]
    public async Task<ActionResult<MaterialItemDto>> CopyMaterialItem(int id)
    {
        var existingMaterialItem = await unit.Repository<MaterialItem>()
            .GetByIdAsync(id);

        if (existingMaterialItem == null)
            return NotFound("Material item not found");

        var newMaterialItem = new MaterialItem
        {
            material_code = existingMaterialItem.material_code + "-COPY",
            material_name = existingMaterialItem.material_name + " (Copy)",
            specification = existingMaterialItem.specification,
            unit_id = existingMaterialItem.unit_id,
            fund_category_id = existingMaterialItem.fund_category_id,

            opening_balance = 0,
            quantity_in = 0,
            quantity_out = 0,
            unit_price = existingMaterialItem.unit_price,
            total_amount = 0,

            remark = existingMaterialItem.remark,
            min_stock = existingMaterialItem.min_stock,

            is_active = true,
            created_at = DateTime.UtcNow
        };

        unit.Repository<MaterialItem>().Add(newMaterialItem);

        if (await unit.Complete())
        {
            return CreatedAtAction(
                nameof(GetMaterialItem),
                new { id = newMaterialItem.material_item_id },
                mapper.Map<MaterialItemDto>(newMaterialItem)
            );
        }

        return BadRequest("Problem copying material item");
    }
}
