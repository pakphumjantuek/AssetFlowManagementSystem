
using Core.Interfaces.Specifications.AssetRepair;
using Core.Interfaces.Specifications.MaterialIssueDetail;
using Core.Interfaces.Specifications.MaterialReceiveDetail;
using Microsoft.EntityFrameworkCore;
using System.Data;


namespace API.Controllers;

public class MaterialReceiveDetailController(IUnitOfWork unit, IMapper mapper, Infrastructure.StoreContext db, CentralDepartmentService central, MaterialStockService stock) : BaseApiController
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<MaterialReceiveDetailDto>>> GetMaterialReceiveDetail([FromQuery] MaterialReceiveDetailSpecParams materialReceiveDetailParams)
    {
        var spec = new MaterialReceiveDetailSpecification(materialReceiveDetailParams);

        var materialReceiveDetails = await unit.Repository<MaterialReceiveDetail>().ListAsync(spec);
        var countSpec = new MaterialReceiveDetailSpecification(materialReceiveDetailParams);
        var totalItems = await unit.Repository<MaterialReceiveDetail>()
            .CountAsync(countSpec);

        var data = mapper.Map<List<MaterialReceiveDetailDto>>(materialReceiveDetails);
        return Ok(new Pagination<MaterialReceiveDetailDto>(
            materialReceiveDetailParams.PageIndex,
            materialReceiveDetailParams.PageSize,
            totalItems,
            data
        ));
    }

    [HttpGet("by-procurement-record/{procurement_record_id:int}")]
    public async Task<ActionResult<Pagination<MaterialReceiveDetailDto>>> GetMaterialReceiveDetailsByProcurementRecordId(
      int procurement_record_id,
      [FromQuery] MaterialReceiveDetailSpecParams materialReceiveDetailParams)
    {
        materialReceiveDetailParams.procurement_record_id = procurement_record_id;
        var spec = new MaterialReceiveDetailSpecification(materialReceiveDetailParams);
        var materialReceiveDetails = await unit.Repository<MaterialReceiveDetail>().ListAsync(spec);

        var countSpec = new MaterialReceiveDetailSpecification(materialReceiveDetailParams);

        var totalItems = await unit.Repository<MaterialReceiveDetail>()
            .CountAsync(countSpec);

        var data = mapper.Map<List<MaterialReceiveDetailDto>>(materialReceiveDetails);

        return Ok(new Pagination<MaterialReceiveDetailDto>(
            materialReceiveDetailParams.PageIndex,
            materialReceiveDetailParams.PageSize,
            totalItems,
            data
        ));
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<MaterialReceiveDetailDto>> GetMaterialReceiveDetail(int id)
    {
        var materialReceiveDetail = await unit.Repository<MaterialReceiveDetail>().GetByIdAsync(id);

        if (materialReceiveDetail == null) return NotFound();
        return mapper.Map<MaterialReceiveDetailDto>(materialReceiveDetail);
    }


    [HttpPost]
    public async Task<ActionResult<MaterialReceiveDetailDto>> CreateMaterialReceiveDetail(MaterialReceiveDetailDto dto)
    {
        if (dto.quantity <= 0 || decimal.Round(dto.quantity, 2) != dto.quantity)
            return BadRequest("จำนวนรับเข้าต้องมากกว่า 0 และมีทศนิยมไม่เกิน 2 ตำแหน่ง");
        var centralId = await central.GetIdAsync();
        if (centralId is null) return BadRequest(CentralDepartmentService.NotConfiguredMessage);
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
        var materialReceiveDetail = mapper.Map<MaterialReceiveDetail>(dto);
        // หา item_no ล่าสุดของเอกสารนี้
        var allReceiveDetails = await unit.Repository<MaterialReceiveDetail>().ListAllAsync();

        var lastItemNo = allReceiveDetails
     .Where(x =>
         x.procurement_record_id == materialReceiveDetail.procurement_record_id &&
         x.is_active)
     .Select(x => x.item_no)
     .DefaultIfEmpty(0)
     .Max();

        materialReceiveDetail.item_no = lastItemNo + 1;

        materialReceiveDetail.is_active = true;
        materialReceiveDetail.total_amount = materialReceiveDetail.quantity * materialReceiveDetail.unit_price;

        var procurementRecord = await unit.Repository<Procurement_records>()
             .GetByIdAsync(materialReceiveDetail.procurement_record_id);

        if (procurementRecord == null)
            return BadRequest("Procurement record not found");

        var currentBalance = await stock.GetBalanceAsync(
            materialReceiveDetail.material_item_id,
            centralId
        );
        var newBalance = currentBalance + materialReceiveDetail.quantity;

        unit.Repository<MaterialReceiveDetail>().Add(materialReceiveDetail);

        if (!await unit.Complete())
            return BadRequest("Problem creating material receive detail");

        // เพิ่ม Stock Card / Transaction
        var stockCard = new MaterialStockCard
        {
            material_item_id = materialReceiveDetail.material_item_id,
            procurement_record_id = materialReceiveDetail.procurement_record_id,
            department_id = centralId,
            transaction_date = DateTime.UtcNow,
            transaction_type = "IN",
            reference_document_no = procurementRecord.document_no,
            receive_detail_id = materialReceiveDetail.receive_detail_id,
            issue_detail_id = null,

            quantity_in = materialReceiveDetail.quantity,
            quantity_out = 0,
            balance_qty = newBalance,
            unit_price = materialReceiveDetail.unit_price,
            total_amount = newBalance * materialReceiveDetail.unit_price,
            fiscal_year_id = procurementRecord.fiscal_year_id,

            is_active = true,
            created_at = DateTime.UtcNow
        };

        unit.Repository<MaterialStockCard>().Add(stockCard);

        if (!await unit.Complete())
            return BadRequest("Problem creating stock transaction");

        await stock.RecalculateBalancesAsync(materialReceiveDetail.material_item_id, centralId);
        await stock.SyncMaterialItemAsync(materialReceiveDetail.material_item_id);

        if (await unit.Complete())
        {
            await transaction.CommitAsync();
            return CreatedAtAction(
                nameof(GetMaterialReceiveDetail),
                new { id = materialReceiveDetail.receive_detail_id },
                mapper.Map<MaterialReceiveDetailDto>(materialReceiveDetail)
            );
        }

        return BadRequest("Problem updating stock balances");
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> UpdateMaterialReceiveDetail(int id, MaterialReceiveDetailDto dto)
    {
        if (id != dto.receive_detail_id) return BadRequest("Cannot update this material receive detail");
        var existing = await unit.Repository<MaterialReceiveDetail>().GetByIdAsync(id);
        if (existing == null || !existing.is_active) return NotFound();
        if (existing.quantity != dto.quantity || existing.unit_price != dto.unit_price ||
            existing.material_item_id != dto.material_item_id ||
            existing.procurement_record_id != dto.procurement_record_id)
            return Conflict("การเปลี่ยนจำนวนรับเข้าให้ใช้ขั้นตอนปรับจำนวนพร้อมเหตุผล; ไม่รองรับการเปลี่ยนวัสดุ เอกสารจัดซื้อ หรือราคาผ่านหน้านี้");
        existing.operation_reason = dto.operation_reason;
        existing.updated_at = DateTime.UtcNow;
        return await unit.Complete() ? NoContent() : BadRequest("Problem updating receive detail");
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteMaterialReceiveDetail(int id)
    {
        var detail = await unit.Repository<MaterialReceiveDetail>().GetByIdAsync(id);
        if (detail == null || !detail.is_active) return NotFound();
        if (await db.materialStockCards.AnyAsync(x => x.is_active && x.receive_detail_id == id))
            return Conflict("รายการรับเข้านี้มีประวัติสต็อกแล้ว ยังไม่รองรับการลบ กรุณาใช้การปรับจำนวน");
        detail.is_active = false;
        detail.updated_at = DateTime.UtcNow;
        return await unit.Complete() ? NoContent() : BadRequest("Problem deleting receive detail");
    }

    [HttpGet("stock-card/{material_item_id:int}")]
    public async Task<ActionResult<IReadOnlyList<MaterialStockCardDto>>> GetStockCardByMaterialItem(
    int material_item_id
)
    {
        var stockCards = await stock.ActiveCards().AsNoTracking()
            .Where(x => x.material_item_id == material_item_id).ToListAsync();

        var data = stockCards
            .Where(x => x.material_item_id == material_item_id && x.is_active)
            .OrderBy(x => x.transaction_date)
            .ThenBy(x => x.stock_card_id)
            .Select(x => new MaterialStockCardDto
            {
                stock_card_id = x.stock_card_id,
                material_item_id = x.material_item_id,
                transaction_date = x.transaction_date,
                transaction_type = x.transaction_type,
                reference_document_no = x.reference_document_no,
                quantity_in = x.quantity_in,
                quantity_out = x.quantity_out,
                balance_qty = x.balance_qty,
                unit_price = x.unit_price,
                total_amount = x.total_amount,
                procurement_record_id = x.procurement_record_id,
                staff_name = x.StaffName,
                fiscal_year_id = x.fiscal_year_id
            })
            .ToList();

        return Ok(data);
    }
}
