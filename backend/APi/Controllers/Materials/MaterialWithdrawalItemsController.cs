using System.Data;
using Core.Entities;
using Infrastructure;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace API.Controllers;

[ApiController]
[Route("api/MaterialWithdrawal")]
public class MaterialWithdrawalItemsController(StoreContext db, MaterialStockService stock) : ControllerBase
{
    public record WithdrawalItem(int receive_detail_id, int material_item_id, decimal quantity);
    public record WithdrawalRequest(int procurement_record_id, int staff_id,
        string? material_receive_id, string? receive_document_no,
        string? withdrawal_document_no, string? remark,
        List<WithdrawalItem> items);
    public record AvailableItem(int receive_detail_id, int material_item_id,
        string material_name, decimal received_quantity, decimal available_quantity, decimal unit_price,
        int source_department_id);
    public record WithdrawalDisplayItem(int receive_detail_id, int material_item_id,
        string material_name, decimal quantity, decimal unit_price);

    [HttpGet("{withdrawalId:int}/items")]
    public async Task<ActionResult<List<WithdrawalDisplayItem>>> Items(int withdrawalId)
    {
        var withdrawal = await db.materialWithdrawals.AsNoTracking().FirstOrDefaultAsync(x =>
            x.material_withdrawal_id == withdrawalId && x.is_active);
        if (withdrawal == null) return NotFound();

        var cards = await db.materialStockCards.AsNoTracking()
            .Where(x => x.is_active && x.material_withdrawal_id == withdrawalId)
            .ToListAsync();
        var materialIds = cards.Select(x => x.material_item_id).Distinct().ToList();
        var names = await db.materialItems.AsNoTracking()
            .Where(x => materialIds.Contains(x.material_item_id))
            .ToDictionaryAsync(x => x.material_item_id, x => x.material_name);

        return cards.Where(x => x.transaction_type == "OUT")
            .GroupBy(x => new { x.receive_detail_id, x.material_item_id, x.unit_price })
            .Select(g => new WithdrawalDisplayItem(
                g.Key.receive_detail_id ?? 0,
                g.Key.material_item_id,
                names.GetValueOrDefault(g.Key.material_item_id) ?? "วัสดุ",
                g.Sum(x => x.quantity_out - x.quantity_in),
                g.Key.unit_price))
            .Where(x => x.quantity > 0).ToList();
    }

    [HttpGet("available/{procurementRecordId:int}")]
    public async Task<ActionResult<List<AvailableItem>>> Available(int procurementRecordId)
    {
        var record = await db.procurement_records.AsNoTracking()
            .FirstOrDefaultAsync(x => x.procurement_record_id == procurementRecordId && x.is_active);
        if (record == null) return NotFound();
        return await GetAvailableItems(procurementRecordId, record.department_id);
    }

    [HttpPut("{withdrawalId:int}/with-items")]
    public async Task<IActionResult> Update(int withdrawalId, [FromBody] WithdrawalRequest request)
    {
        if (request.items == null || request.items.Count == 0 ||
            request.items.Any(x => x.quantity <= 0 || x.quantity != decimal.Truncate(x.quantity)) ||
            request.items.Select(x => x.receive_detail_id).Distinct().Count() != request.items.Count)
            return BadRequest("กรุณาระบุจำนวนเบิกเป็นจำนวนเต็มมากกว่า 0 โดยไม่เลือกรายการซ้ำ");

        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
        try
        {
            var withdrawal = await db.materialWithdrawals.FirstOrDefaultAsync(x =>
                x.material_withdrawal_id == withdrawalId && x.is_active);
            if (withdrawal == null) return NotFound();
            if (withdrawal.stock_status == "cancelled") return Conflict("ใบเบิกนี้ยกเลิกแล้ว");
            if (withdrawal.procurement_record_id != request.procurement_record_id)
                return BadRequest("ไม่สามารถเปลี่ยนเอกสารจัดซื้อของใบเบิกได้");
            var record = await db.procurement_records.FirstOrDefaultAsync(x =>
                x.procurement_record_id == request.procurement_record_id && x.is_active);
            var staff = await db.staffs.FirstOrDefaultAsync(x =>
                x.staff_id == request.staff_id && x.is_active);
            if (record == null || staff == null) return BadRequest("ไม่พบเอกสารจัดซื้อหรือผู้เบิก");

            var oldCards = await db.materialStockCards.Where(x =>
                x.is_active && x.material_withdrawal_id == withdrawalId).ToListAsync();
            var oldOut = oldCards.Where(x => x.transaction_type == "OUT").ToList();
            var sameItems = oldOut.Count == request.items.Count && request.items.All(item =>
                oldOut.Any(card => card.receive_detail_id == item.receive_detail_id &&
                    card.material_item_id == item.material_item_id && card.quantity_out == item.quantity));
            var oldDestination = oldCards.FirstOrDefault(x => x.transaction_type == "IN")?.department_id
                ?? oldOut.FirstOrDefault()?.department_id ?? record.department_id;
            if (sameItems && oldDestination == staff.department_id)
            {
                withdrawal.staff_id = request.staff_id;
                withdrawal.material_receive_id = record.document_no;
                withdrawal.receive_document_no = null;
                withdrawal.withdrawal_document_no = record.decree_document_no?.Trim();
                withdrawal.remark = request.remark;
                withdrawal.updated_at = DateTime.UtcNow;
                var sameStaffName = $"{staff.first_name} {staff.last_name}".Trim();
                foreach (var card in oldCards)
                {
                    card.StaffName = sameStaffName;
                    card.updated_at = DateTime.UtcNow;
                }
                var linkedIds = oldCards.Where(x => x.issue_detail_id.HasValue)
                    .Select(x => x.issue_detail_id!.Value).Distinct().ToList();
                var linkedIssues = await db.materialIssueDetails.Where(x =>
                    linkedIds.Contains(x.issue_detail_id)).ToListAsync();
                foreach (var issue in linkedIssues)
                {
                    issue.staff_id = request.staff_id;
                    issue.remark = $"อ้างอิงเอกสารขออนุมัติ {withdrawal.withdrawal_document_no}";
                    issue.updated_at = DateTime.UtcNow;
                }
                await db.SaveChangesAsync();
                await transaction.CommitAsync();
                return NoContent();
            }
            return Conflict("การแก้จำนวนวัสดุให้ใช้ขั้นตอนปรับปรุงใบเบิกพร้อมเหตุผล");
        }
        catch (DbUpdateException)
        {
            await transaction.RollbackAsync();
            return Conflict("ข้อมูลสต็อกเปลี่ยนระหว่างบันทึก กรุณาโหลดข้อมูลใหม่");
        }
    }

    private async Task<bool> RecalculateBalances(
        IEnumerable<(int material_item_id, int departmentId)> affected,
        bool requireNonNegative = true)
    {
        foreach (var (materialItemId, departmentId) in affected)
        {
            var cards = await db.materialStockCards.Where(x => x.is_active &&
                x.material_item_id == materialItemId && x.department_id == departmentId)
                .OrderBy(x => x.transaction_date).ThenBy(x => x.stock_card_id).ToListAsync();
            decimal balance = 0;
            foreach (var card in cards)
            {
                balance += card.quantity_in - card.quantity_out;
                if (requireNonNegative && balance < 0) return false;
                card.balance_qty = balance;
                card.total_amount = balance * card.unit_price;
                card.updated_at = DateTime.UtcNow;
            }
        }
        return true;
    }

    private async Task SyncMaterials(IEnumerable<int> materialIds, DateTime now)
    {
        foreach (var materialItemId in materialIds)
        {
            var material = await db.materialItems.FindAsync(materialItemId);
            if (material == null) continue;
            var cards = await db.materialStockCards.Where(x => x.is_active &&
                x.material_item_id == materialItemId).ToListAsync();
            material.quantity_in = cards.Sum(x => x.quantity_in);
            material.quantity_out = cards.Sum(x => x.quantity_out);
            var balance = cards.GroupBy(x => x.department_id).Sum(g =>
                g.OrderByDescending(x => x.transaction_date)
                 .ThenByDescending(x => x.stock_card_id).First().balance_qty);
            material.total_amount = balance * (material.unit_price ?? 0);
            material.updated_at = now;
        }
    }

    [HttpPost("with-items")]
    public async Task<IActionResult> Create([FromBody] WithdrawalRequest request)
    {
        if (request.items == null || request.items.Count == 0 ||
            request.items.Any(x => x.quantity <= 0 || x.quantity != decimal.Truncate(x.quantity)) ||
            request.items.Select(x => x.receive_detail_id).Distinct().Count() != request.items.Count)
            return BadRequest("กรุณาระบุจำนวนเบิกเป็นจำนวนเต็มมากกว่า 0 โดยไม่เลือกรายการซ้ำ");

        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
        try
        {
            var record = await db.procurement_records.FirstOrDefaultAsync(x =>
                x.procurement_record_id == request.procurement_record_id && x.is_active);
            var staff = await db.staffs.FirstOrDefaultAsync(x => x.staff_id == request.staff_id && x.is_active);
            if (record == null || staff == null) return BadRequest("ไม่พบเอกสารจัดซื้อหรือผู้เบิก");

            var available = await GetAvailableItems(record.procurement_record_id, record.department_id);
            foreach (var item in request.items)
            {
                var row = available.FirstOrDefault(x => x.receive_detail_id == item.receive_detail_id);
                if (row == null || row.material_item_id != item.material_item_id ||
                    item.quantity > row.available_quantity)
                    return BadRequest($"วัสดุรายการ {item.receive_detail_id} คงเหลือไม่พอ กรุณาโหลดข้อมูลใหม่");
            }

            var withdrawal = new MaterialWithdrawal
            {
                procurement_record_id = request.procurement_record_id,
                staff_id = request.staff_id,
                material_receive_id = record.document_no,
                receive_document_no = null,
                withdrawal_document_no = record.decree_document_no?.Trim(),
                remark = request.remark,
                is_active = true,
                created_at = DateTime.UtcNow
            };
            db.materialWithdrawals.Add(withdrawal);
            await db.SaveChangesAsync();

            var staffName = $"{staff.first_name} {staff.last_name}".Trim();
            var now = DateTime.UtcNow;
            foreach (var item in request.items)
            {
                var row = available.First(x => x.receive_detail_id == item.receive_detail_id);
                var issue = new MaterialIssueDetail
                {
                    procurement_record_id = request.procurement_record_id,
                    material_item_id = item.material_item_id,
                    staff_id = request.staff_id,
                    issue_date = now,
                    quantity = item.quantity,
                    unit_price = row.unit_price,
                    total_amount = item.quantity * row.unit_price,
                    remark = $"อ้างอิงเอกสารขออนุมัติ {withdrawal.withdrawal_document_no}",
                    is_active = true,
                    created_at = now
                };
                db.materialIssueDetails.Add(issue);
                await db.SaveChangesAsync();

                var sourceBalance = await LatestBalance(item.material_item_id, row.source_department_id);
                if (sourceBalance < item.quantity)
                    return BadRequest($"วัสดุ {row.material_name} ในหน่วยงานต้นทางคงเหลือไม่พอ");
                db.materialStockCards.Add(new MaterialStockCard
                {
                    material_item_id = item.material_item_id,
                    procurement_record_id = request.procurement_record_id,
                    department_id = row.source_department_id,
                    fiscal_year_id = record.fiscal_year_id,
                    transaction_date = now,
                    transaction_type = "OUT",
                    reference_document_no = record.document_no,
                    material_withdrawal_id = withdrawal.material_withdrawal_id,
                    receive_detail_id = item.receive_detail_id,
                    issue_detail_id = issue.issue_detail_id,
                    StaffName = staffName,
                    quantity_out = item.quantity,
                    balance_qty = sourceBalance - item.quantity,
                    unit_price = row.unit_price,
                    total_amount = (sourceBalance - item.quantity) * row.unit_price,
                    is_active = true,
                    created_at = now
                });
                if (staff.department_id != row.source_department_id)
                {
                    var destinationBalance = await LatestBalance(item.material_item_id, staff.department_id);
                    db.materialStockCards.Add(new MaterialStockCard
                    {
                        material_item_id = item.material_item_id,
                        procurement_record_id = request.procurement_record_id,
                        department_id = staff.department_id,
                        fiscal_year_id = record.fiscal_year_id,
                        transaction_date = now,
                        transaction_type = "IN",
                        reference_document_no = record.document_no,
                        material_withdrawal_id = withdrawal.material_withdrawal_id,
                        receive_detail_id = item.receive_detail_id,
                        issue_detail_id = issue.issue_detail_id,
                        StaffName = staffName,
                        quantity_in = item.quantity,
                        balance_qty = destinationBalance + item.quantity,
                        unit_price = row.unit_price,
                        total_amount = (destinationBalance + item.quantity) * row.unit_price,
                        is_active = true,
                        created_at = now
                    });
                }
                await db.SaveChangesAsync();
            }

            foreach (var materialItemId in request.items.Select(x => x.material_item_id).Distinct())
            {
                var material = await db.materialItems.FindAsync(materialItemId);
                if (material == null) continue;
                var cards = await db.materialStockCards.Where(x => x.is_active &&
                    x.material_item_id == materialItemId).ToListAsync();
                material.quantity_in = cards.Sum(x => x.quantity_in);
                material.quantity_out = cards.Sum(x => x.quantity_out);
                var balance = cards.GroupBy(x => x.department_id).Sum(g =>
                    g.OrderByDescending(x => x.transaction_date)
                     .ThenByDescending(x => x.stock_card_id).First().balance_qty);
                material.total_amount = balance * (material.unit_price ?? 0);
                material.updated_at = now;
            }
            await db.SaveChangesAsync();
            await transaction.CommitAsync();
            return Ok(new { withdrawal.material_withdrawal_id });
        }
        catch (DbUpdateException)
        {
            await transaction.RollbackAsync();
            return Conflict("ข้อมูลสต็อกเปลี่ยนระหว่างบันทึก กรุณาโหลดข้อมูลใหม่");
        }
    }

    private Task<decimal> LatestBalance(int materialItemId, int departmentId) =>
        stock.GetBalanceAsync(materialItemId, departmentId);

    private async Task<List<AvailableItem>> GetAvailableItems(int procurementRecordId, int sourceDepartmentId)
    {
        var receives = await db.materialReceiveDetails.AsNoTracking()
            .Where(x => x.is_active && x.procurement_record_id == procurementRecordId)
            .OrderBy(x => x.item_no).ThenBy(x => x.receive_detail_id)
            .ToListAsync();
        var itemIds = receives.Select(x => x.material_item_id).Distinct().ToList();
        var materials = await db.materialItems.AsNoTracking()
            .Where(x => itemIds.Contains(x.material_item_id))
            .ToDictionaryAsync(x => x.material_item_id, x => x.material_name);
        var relevantCards = await db.materialStockCards.AsNoTracking()
            .Where(x => x.is_active && x.procurement_record_id == procurementRecordId &&
                x.receive_detail_id.HasValue)
            .ToListAsync();
        var receiptSources = relevantCards.Where(x => !x.material_withdrawal_id.HasValue &&
                x.quantity_in > 0)
            .GroupBy(x => x.receive_detail_id!.Value)
            .ToDictionary(g => g.Key, g => g.OrderBy(x => x.transaction_date)
                .ThenBy(x => x.stock_card_id).First().department_id ?? sourceDepartmentId);
        var outCards = relevantCards.Where(x => x.material_withdrawal_id.HasValue).ToList();
        var unassigned = (await db.materialStockCards.AsNoTracking()
            .Where(x => x.is_active && x.procurement_record_id == procurementRecordId &&
                !x.receive_detail_id.HasValue && x.quantity_out > 0 &&
                x.department_id == sourceDepartmentId).ToListAsync())
            .GroupBy(x => x.material_item_id)
            .ToDictionary(g => g.Key, g => g.Sum(x => x.quantity_out - x.quantity_in));
        var result = new List<AvailableItem>();
        foreach (var receive in receives)
        {
            var actualSource = receiptSources.GetValueOrDefault(receive.receive_detail_id, sourceDepartmentId);
            var rowIssued = outCards.Where(x => x.receive_detail_id == receive.receive_detail_id &&
                x.department_id == actualSource).Sum(x => x.quantity_out - x.quantity_in);
            var legacyIssued = actualSource == sourceDepartmentId
                ? unassigned.GetValueOrDefault(receive.material_item_id) : 0;
            var rowRemaining = Math.Max(0, receive.quantity - rowIssued);
            var available = Math.Max(0, rowRemaining - legacyIssued);
            if (actualSource == sourceDepartmentId)
                unassigned[receive.material_item_id] = Math.Max(0, legacyIssued - rowRemaining);
            var sourceBalance = await LatestBalance(receive.material_item_id, actualSource);
            result.Add(new AvailableItem(receive.receive_detail_id, receive.material_item_id,
                materials.GetValueOrDefault(receive.material_item_id) ?? "วัสดุ",
                receive.quantity, Math.Max(0, Math.Min(available, sourceBalance)), receive.unit_price,
                actualSource));
        }
        return result;
    }
}
