using System.Data;
using System.Security.Claims;
using System.Text.Json;
using Core.Entities;
using Infrastructure;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace API.Controllers;

[ApiController]
[Authorize]
[Route("api/MaterialWithdrawal")]
public class MaterialWithdrawalAdjustmentController(StoreContext db, MaterialStockService stock) : ControllerBase
{
    public record AdjustmentItem(int receive_detail_id, int material_item_id, decimal quantity);
    public record AdjustmentRequest(List<AdjustmentItem> items, string reason);
    public record CancelRequest(string reason);
    public record ImpactItem(int receive_detail_id, int material_item_id, string material_name,
        decimal current_quantity, decimal destination_balance, decimal minimum_quantity);

    [HttpGet("{id:int}/impact")]
    public async Task<IActionResult> Impact(int id)
    {
        var withdrawal = await db.materialWithdrawals.AsNoTracking()
            .FirstOrDefaultAsync(x => x.material_withdrawal_id == id && x.is_active);
        if (withdrawal == null) return NotFound();
        var record = await db.procurement_records.AsNoTracking()
            .FirstOrDefaultAsync(x => x.procurement_record_id == withdrawal.procurement_record_id);
        if (record == null) return NotFound();
        var cards = await db.materialStockCards.AsNoTracking()
            .Where(x => x.is_active && x.material_withdrawal_id == id).ToListAsync();
        if (!cards.Any(x => x.transaction_type == "OUT")) return Conflict("ไม่พบคลังต้นทางของใบเบิก");
        var destinationId = cards.FirstOrDefault(x => x.transaction_type == "IN")?.department_id;
        var rows = EffectiveItems(cards);
        var ids = rows.Select(x => x.material_item_id).Distinct().ToList();
        var names = await db.materialItems.AsNoTracking()
            .Where(x => ids.Contains(x.material_item_id))
            .ToDictionaryAsync(x => x.material_item_id, x => x.material_name);
        var hasFollowup = await HasDestinationFollowup(cards, destinationId, id);
        var result = new List<ImpactItem>();
        foreach (var row in rows)
        {
            var balance = destinationId.HasValue
                ? await Balance(row.material_item_id, destinationId.Value)
                : await Balance(row.material_item_id, SourceDepartment(cards, row.receive_detail_id));
            result.Add(new ImpactItem(row.receive_detail_id, row.material_item_id,
                names.GetValueOrDefault(row.material_item_id) ?? "วัสดุ", row.quantity,
                balance, destinationId.HasValue ? Math.Max(0, row.quantity - balance) : 0));
        }
        return Ok(new { status = withdrawal.stock_status, items = result,
            can_cancel = withdrawal.stock_status != "cancelled" &&
                !hasFollowup && (!destinationId.HasValue || result.All(x => x.destination_balance >= x.current_quantity)) });
    }

    [HttpGet("{id:int}/revisions")]
    public async Task<IActionResult> Revisions(int id) => Ok(await db.materialWithdrawalRevisions
        .AsNoTracking().Where(x => x.material_withdrawal_id == id)
        .OrderByDescending(x => x.created_at).ThenByDescending(x => x.revision_id).ToListAsync());

    [HttpPost("{id:int}/adjust")]
    public async Task<IActionResult> Adjust(int id, [FromBody] AdjustmentRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.reason) || request.reason.Length > 1000 || request.items == null ||
            request.items.Count == 0 || request.items.Any(x => x.quantity <= 0 ||
                x.quantity != decimal.Truncate(x.quantity)) ||
            request.items.Select(x => x.receive_detail_id).Distinct().Count() != request.items.Count)
            return BadRequest("กรุณาระบุเหตุผลและจำนวนเต็มมากกว่า 0 โดยไม่เลือกรายการซ้ำ");
        return await Apply(id, request.items, request.reason.Trim(), false);
    }

    [HttpPost("{id:int}/cancel")]
    public async Task<IActionResult> Cancel(int id, [FromBody] CancelRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.reason) || request.reason.Length > 1000) return BadRequest("กรุณาระบุเหตุผลการยกเลิกไม่เกิน 1000 ตัวอักษร");
        return await Apply(id, [], request.reason.Trim(), true);
    }

    private async Task<IActionResult> Apply(int id, List<AdjustmentItem> requested,
        string reason, bool cancel)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
        try
        {
            var withdrawal = await db.materialWithdrawals.FirstOrDefaultAsync(x =>
                x.material_withdrawal_id == id && x.is_active);
            if (withdrawal == null) return NotFound();
            if (withdrawal.stock_status == "cancelled") return Conflict("ใบเบิกนี้ยกเลิกแล้ว");
            var record = await db.procurement_records.FirstOrDefaultAsync(x =>
                x.procurement_record_id == withdrawal.procurement_record_id && x.is_active);
            if (record == null) return Conflict("ไม่พบเอกสารจัดซื้อที่ใช้งานอยู่");
            var cards = await db.materialStockCards.Where(x =>
                x.is_active && x.material_withdrawal_id == id).ToListAsync();
            if (cards.Count == 0) return Conflict("ใบเบิกนี้ไม่มีรายการสต็อก");
            if (!cards.Any(x => x.transaction_type == "OUT")) return Conflict("ไม่พบคลังต้นทางของใบเบิก");
            var originalDestination = cards.FirstOrDefault(x => x.transaction_type == "IN")?.department_id;
            if (cancel && await HasDestinationFollowup(cards, originalDestination, id))
                return Conflict("ยกเลิกไม่ได้ เพราะหน่วยงานปลายทางมีการเบิกหรือโอนวัสดุต่อแล้ว");
            var original = EffectiveItems(cards);
            var originalMap = original.ToDictionary(x => x.receive_detail_id);
            var requestedMap = requested.ToDictionary(x => x.receive_detail_id);
            if (requested.Any(x => !originalMap.TryGetValue(x.receive_detail_id, out var old) ||
                old.material_item_id != x.material_item_id))
                return BadRequest("การเพิ่มวัสดุหรือเปลี่ยนรายการต้องสร้างใบเบิกใหม่");

            var now = DateTime.UtcNow;
            var affected = new HashSet<(int materialId, int departmentId)>();
            foreach (var old in original)
            {
                var desired = requestedMap.GetValueOrDefault(old.receive_detail_id)?.quantity ?? 0;
                var difference = desired - old.quantity;
                if (difference == 0) continue;
                var sourceDepartmentId = SourceDepartment(cards, old.receive_detail_id);
                var sourceBalance = await Balance(old.material_item_id, sourceDepartmentId);
                var destinationBalance = originalDestination.HasValue
                    ? await Balance(old.material_item_id, originalDestination.Value) : 0;
                if (difference > 0 && sourceBalance < difference)
                    return Conflict($"วัสดุ {old.material_item_id} ในหน่วยงานต้นทางคงเหลือไม่พอ");
                if (difference < 0 && originalDestination.HasValue && destinationBalance < -difference)
                    return Conflict($"วัสดุ {old.material_item_id} ในหน่วยงานปลายทางถูกเบิกต่อแล้ว คงเหลือ {destinationBalance:0.##} ลดได้ไม่เกิน {destinationBalance:0.##}");
                var price = cards.First(x => x.receive_detail_id == old.receive_detail_id &&
                    x.material_item_id == old.material_item_id).unit_price;
                db.materialStockCards.Add(NewCard(old, record, id, sourceDepartmentId,
                    difference < 0 ? -difference : 0, difference > 0 ? difference : 0,
                    price, now));
                affected.Add((old.material_item_id, sourceDepartmentId));
                if (originalDestination.HasValue)
                {
                    db.materialStockCards.Add(NewCard(old, record, id, originalDestination.Value,
                        difference > 0 ? difference : 0, difference < 0 ? -difference : 0,
                        price, now));
                    affected.Add((old.material_item_id, originalDestination.Value));
                }
            }
            if (affected.Count == 0 && !cancel)
                return BadRequest("จำนวนวัสดุไม่เปลี่ยนแปลง");
            await db.SaveChangesAsync();
            foreach (var (materialId, departmentId) in affected)
            {
                var ordered = await db.materialStockCards.Where(x => x.is_active &&
                    x.material_item_id == materialId && x.department_id == departmentId)
                    .OrderBy(x => x.transaction_date).ThenBy(x => x.stock_card_id).ToListAsync();
                decimal balance = 0;
                foreach (var card in ordered)
                {
                    balance += card.quantity_in - card.quantity_out;
                    if (balance < 0) return Conflict($"วัสดุ {materialId} ในหน่วยงาน {departmentId} ติดลบตามลำดับรายการ");
                    card.balance_qty = balance;
                    card.total_amount = balance * card.unit_price;
                    card.updated_at = now;
                }
            }
            foreach (var materialId in affected.Select(x => x.materialId).Distinct())
            {
                var material = await db.materialItems.FindAsync(materialId);
                if (material == null) continue;
                var active = await db.materialStockCards.Where(x => x.is_active &&
                    x.material_item_id == materialId).ToListAsync();
                material.quantity_in = active.Sum(x => x.quantity_in);
                material.quantity_out = active.Sum(x => x.quantity_out);
                material.total_amount = active.GroupBy(x => x.department_id).Sum(g =>
                    g.OrderByDescending(x => x.transaction_date)
                     .ThenByDescending(x => x.stock_card_id).First().balance_qty) *
                     (material.unit_price ?? 0);
                material.updated_at = now;
            }
            var linkedIssueIds = cards.Where(x => x.issue_detail_id.HasValue)
                .Select(x => x.issue_detail_id!.Value).Distinct().ToList();
            var issues = await db.materialIssueDetails.Where(x =>
                linkedIssueIds.Contains(x.issue_detail_id)).ToListAsync();
            foreach (var issue in issues)
            {
                var issueCard = cards.FirstOrDefault(x => x.issue_detail_id == issue.issue_detail_id &&
                    x.transaction_type == "OUT");
                var desired = requested.FirstOrDefault(x => x.receive_detail_id == issueCard?.receive_detail_id)?.quantity ?? 0;
                issue.quantity = desired;
                issue.total_amount = desired * issue.unit_price;
                issue.is_active = desired > 0;
                issue.updated_at = now;
            }
            if (cancel) withdrawal.stock_status = "cancelled";
            withdrawal.updated_at = now;
            db.materialWithdrawalRevisions.Add(new MaterialWithdrawalRevision
            {
                material_withdrawal_id = id,
                action = cancel ? "cancel" : "adjust",
                reason = reason,
                actor_id = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.Identity?.Name,
                created_at = now,
                before_items_json = JsonSerializer.Serialize(original),
                after_items_json = JsonSerializer.Serialize(requested)
            });
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

    private async Task<bool> HasDestinationFollowup(List<MaterialStockCard> cards,
        int? destinationId, int withdrawalId)
    {
        var departmentId = destinationId ?? cards.FirstOrDefault(x => x.transaction_type == "OUT")?.department_id;
        if (!departmentId.HasValue) return false;
        var incoming = destinationId.HasValue
            ? cards.Where(x => x.transaction_type == "IN" && x.department_id == departmentId).ToList()
            : cards.Where(x => x.transaction_type == "OUT" && x.department_id == departmentId).ToList();
        foreach (var card in incoming)
        {
            if (await db.materialStockCards.AsNoTracking().AnyAsync(x => x.is_active &&
                x.material_item_id == card.material_item_id &&
                x.department_id == departmentId && x.quantity_out > 0 &&
                x.material_withdrawal_id != withdrawalId &&
                (x.transaction_date > card.transaction_date ||
                 (x.transaction_date == card.transaction_date && x.stock_card_id > card.stock_card_id))))
                return true;
        }
        return false;
    }

    private static int SourceDepartment(List<MaterialStockCard> cards, int receiveDetailId) =>
        cards.First(x => x.transaction_type == "OUT" && x.receive_detail_id == receiveDetailId)
            .department_id!.Value;

    private static List<AdjustmentItem> EffectiveItems(List<MaterialStockCard> cards) =>
        cards.Where(x => x.transaction_type == "OUT" ||
            ((x.transaction_type == "ADJUST_IN" || x.transaction_type == "ADJUST_OUT") && x.department_id ==
                cards.FirstOrDefault(y => y.transaction_type == "OUT" &&
                    y.receive_detail_id == x.receive_detail_id)?.department_id))
            .GroupBy(x => new { x.receive_detail_id, x.material_item_id })
            .Select(g => new AdjustmentItem(g.Key.receive_detail_id ?? 0,
                g.Key.material_item_id, g.Sum(x => x.quantity_out - x.quantity_in)))
            .Where(x => x.quantity > 0).ToList();

    private Task<decimal> Balance(int materialId, int departmentId) =>
        stock.GetBalanceAsync(materialId, departmentId);

    private static MaterialStockCard NewCard(AdjustmentItem item,
        Procurement_records record, int withdrawalId, int departmentId,
        decimal quantityIn, decimal quantityOut, decimal price, DateTime now) => new()
    {
        material_item_id = item.material_item_id,
        procurement_record_id = record.procurement_record_id,
        department_id = departmentId,
        fiscal_year_id = record.fiscal_year_id,
        transaction_date = now,
        transaction_type = quantityIn > 0 ? "ADJUST_IN" : "ADJUST_OUT",
        reference_document_no = record.document_no,
        material_withdrawal_id = withdrawalId,
        receive_detail_id = item.receive_detail_id,
        quantity_in = quantityIn,
        quantity_out = quantityOut,
        unit_price = price,
        is_active = true,
        created_at = now
    };
}
