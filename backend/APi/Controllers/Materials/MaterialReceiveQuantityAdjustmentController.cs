using System.Data;
using System.Security.Claims;
using Core.Entities;
using Infrastructure;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace API.Controllers;

[ApiController]
[Authorize]
[Route("api/MaterialReceiveDetail")]
public class MaterialReceiveQuantityAdjustmentController(StoreContext db) : ControllerBase
{
    public record AdjustRequest(decimal quantity, decimal expected_quantity, string reason, string? operation_reason);

    [HttpGet("by-procurement-record/{procurementId:int}/issue-summary")]
    public async Task<IActionResult> IssueSummary(int procurementId)
    {
        var record = await db.procurement_records.AsNoTracking().FirstOrDefaultAsync(x =>
            x.procurement_record_id == procurementId && x.is_active);
        if (record == null) return NotFound();
        var receives = await db.materialReceiveDetails.AsNoTracking().Where(x =>
            x.is_active && x.procurement_record_id == procurementId).ToListAsync();
        var cards = await db.materialStockCards.AsNoTracking().Where(x =>
            x.is_active && x.procurement_record_id == procurementId).ToListAsync();
        var result = receives.Select(receive =>
        {
            var original = cards.Where(x => x.receive_detail_id == receive.receive_detail_id &&
                x.transaction_type == "IN" && !x.material_withdrawal_id.HasValue)
                .OrderBy(x => x.transaction_date).ThenBy(x => x.stock_card_id).FirstOrDefault();
            var sourceDepartmentId = original?.department_id ?? record.department_id;
            var issued = cards.Where(x => x.receive_detail_id == receive.receive_detail_id &&
                x.department_id == sourceDepartmentId && x.material_withdrawal_id.HasValue)
                .Sum(x => x.quantity_out - x.quantity_in);
            var unassigned = original != null && cards.Any(x =>
                x.department_id == sourceDepartmentId &&
                x.material_item_id == receive.material_item_id && !x.receive_detail_id.HasValue &&
                x.quantity_out > 0 &&
                (x.transaction_date > original.transaction_date ||
                 (x.transaction_date == original.transaction_date &&
                  x.stock_card_id > original.stock_card_id)));
            return new { receive_detail_id = receive.receive_detail_id,
                issued_quantity = issued, has_unassigned_outgoing = unassigned };
        }).ToList();
        return Ok(result);
    }

    [HttpGet("{id:int}/adjustment-history")]
    public async Task<IActionResult> History(int id) => Ok(await db.materialReceiveAdjustments
        .AsNoTracking().Where(x => x.receive_detail_id == id)
        .OrderByDescending(x => x.created_at).ThenByDescending(x => x.adjustment_id).ToListAsync());

    [HttpPut("{id:int}/adjust-quantity")]
    public async Task<IActionResult> AdjustQuantity(int id, [FromBody] AdjustRequest request)
    {
        if (request.quantity <= 0 || decimal.Round(request.quantity, 2) != request.quantity)
            return BadRequest("จำนวนรับเข้าต้องมากกว่า 0 และมีทศนิยมไม่เกิน 2 ตำแหน่ง");
        if (string.IsNullOrWhiteSpace(request.reason) || request.reason.Length > 1000)
            return BadRequest("กรุณาระบุเหตุผลการปรับจำนวนไม่เกิน 1000 ตัวอักษร");

        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
        try
        {
            var detail = await db.materialReceiveDetails.FirstOrDefaultAsync(x =>
                x.receive_detail_id == id && x.is_active);
            if (detail == null) return NotFound();
            if (detail.quantity != request.expected_quantity)
                return Conflict("จำนวนรับเข้าเปลี่ยนไปแล้ว กรุณาโหลดข้อมูลใหม่ก่อนปรับจำนวน");
            var record = await db.procurement_records.AsNoTracking().FirstOrDefaultAsync(x =>
                x.procurement_record_id == detail.procurement_record_id && x.is_active);
            if (record == null) return Conflict("ไม่พบเอกสารจัดซื้อที่ใช้งานอยู่");
            var originalCard = await db.materialStockCards.AsNoTracking().FirstOrDefaultAsync(x =>
                x.is_active && x.receive_detail_id == id && x.transaction_type == "IN" &&
                !x.material_withdrawal_id.HasValue);
            if (originalCard == null || originalCard.material_item_id != detail.material_item_id ||
                originalCard.department_id != record.department_id)
                return Conflict("รายการรับเข้าไม่ตรงกับ stock card เดิม กรุณาตรวจสอบข้อมูลก่อนปรับยอด");

            var delta = request.quantity - detail.quantity;
            if (delta == 0) return BadRequest("จำนวนรับเข้าไม่เปลี่ยนแปลง");
            var linkedIssued = await db.materialStockCards.AsNoTracking()
                .Where(x => x.is_active && x.receive_detail_id == id &&
                    x.department_id == record.department_id && x.material_withdrawal_id.HasValue)
                .SumAsync(x => x.quantity_out - x.quantity_in);
            if (request.quantity < linkedIssued)
                return Conflict($"ลดจำนวนรับเข้าไม่ได้ มีการเบิกจากรายการนี้แล้ว {linkedIssued:0.##} หน่วย");

            if (delta < 0)
            {
                var hasUnassignedOut = await db.materialStockCards.AsNoTracking().AnyAsync(x =>
                    x.is_active && x.material_item_id == detail.material_item_id &&
                    x.procurement_record_id == detail.procurement_record_id &&
                    x.department_id == record.department_id && !x.receive_detail_id.HasValue &&
                    x.quantity_out > 0 &&
                    (x.transaction_date > originalCard.transaction_date ||
                     (x.transaction_date == originalCard.transaction_date &&
                      x.stock_card_id > originalCard.stock_card_id)));
                if (hasUnassignedOut)
                    return Conflict("มีรายการเบิกที่ไม่ผูกกับรายการรับเข้า จึงยังลดจำนวนรับเข้าไม่ได้");
            }

            var currentBalance = await db.materialStockCards.AsNoTracking()
                .Where(x => x.is_active && x.material_item_id == detail.material_item_id &&
                    x.department_id == record.department_id)
                .SumAsync(x => x.quantity_in - x.quantity_out);
            if (delta < 0 && currentBalance < -delta)
                return Conflict($"วัสดุในหน่วยงานต้นทางคงเหลือ {currentBalance:0.##} ลดจำนวนรับเข้า {-delta:0.##} ไม่ได้");

            var now = DateTime.UtcNow;
            var oldQuantity = detail.quantity;
            db.materialStockCards.Add(new MaterialStockCard
            {
                material_item_id = detail.material_item_id,
                procurement_record_id = detail.procurement_record_id,
                department_id = record.department_id,
                fiscal_year_id = record.fiscal_year_id,
                transaction_date = now,
                transaction_type = delta > 0 ? "RECEIVE_ADJUST_IN" : "RECEIVE_ADJUST_OUT",
                reference_document_no = record.document_no,
                receive_detail_id = id,
                quantity_in = Math.Max(delta, 0),
                quantity_out = Math.Max(-delta, 0),
                unit_price = detail.unit_price,
                is_active = true,
                created_at = now
            });
            detail.quantity = request.quantity;
            detail.total_amount = request.quantity * detail.unit_price;
            detail.operation_reason = request.operation_reason;
            detail.updated_at = now;
            db.materialReceiveAdjustments.Add(new MaterialReceiveAdjustment
            {
                receive_detail_id = id,
                old_quantity = oldQuantity,
                new_quantity = request.quantity,
                reason = request.reason.Trim(),
                actor_id = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.Identity?.Name,
                created_at = now
            });
            await db.SaveChangesAsync();

            var ordered = await db.materialStockCards.Where(x => x.is_active &&
                x.material_item_id == detail.material_item_id && x.department_id == record.department_id)
                .OrderBy(x => x.transaction_date).ThenBy(x => x.stock_card_id).ToListAsync();
            decimal balance = 0;
            foreach (var card in ordered)
            {
                balance += card.quantity_in - card.quantity_out;
                if (balance < 0)
                    return Conflict("ปรับจำนวนไม่ได้ เพราะยอดสต็อกติดลบตามลำดับรายการ");
                card.balance_qty = balance;
                card.total_amount = balance * card.unit_price;
                card.updated_at = now;
            }
            var material = await db.materialItems.FindAsync(detail.material_item_id);
            if (material != null)
            {
                var cards = await db.materialStockCards.Where(x => x.is_active &&
                    x.material_item_id == detail.material_item_id).ToListAsync();
                material.quantity_in = cards.Sum(x => x.quantity_in);
                material.quantity_out = cards.Sum(x => x.quantity_out);
                var totalBalance = cards.GroupBy(x => x.department_id).Sum(g =>
                    g.OrderByDescending(x => x.transaction_date)
                     .ThenByDescending(x => x.stock_card_id).First().balance_qty);
                material.total_amount = totalBalance * (material.unit_price ?? 0);
                material.updated_at = now;
            }
            await db.SaveChangesAsync();
            await transaction.CommitAsync();
            return NoContent();
        }
        catch (DbUpdateException)
        {
            await transaction.RollbackAsync();
            return Conflict("ข้อมูลสต็อกเปลี่ยนระหว่างบันทึก กรุณาโหลดข้อมูลใหม่");
        }
    }
}
