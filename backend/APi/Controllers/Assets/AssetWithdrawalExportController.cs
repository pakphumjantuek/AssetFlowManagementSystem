using System.Globalization;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using QuestPDF.Fluent;
using QuestPDF.Infrastructure;

namespace API.Controllers;

/// <summary>
/// ส่งออกใบเบิกครุภัณฑ์ (PDF) ใช้แม่แบบและเลขเล่มที่/เลขที่ชุดเดียวกับใบเบิกวัสดุ
/// แถวของตาราง = ครุภัณฑ์หลัก 1 รายการ สรุปจำนวนและมูลค่าจากครุภัณฑ์ย่อย
/// ผู้รับของเลือกได้เฉพาะผู้เบิกที่บันทึกไว้ในรายการเบิกครุภัณฑ์ของเอกสารจัดซื้อนี้
/// </summary>
public class AssetWithdrawalExportController(StoreContext db) : BaseApiController
{
    public sealed record AssetExportStaff(int StaffId, string FullName);

    // รายชื่อผู้เบิกจากรายการเบิกที่บันทึกไว้แล้ว (ล่าสุดอยู่บนสุด)
    [HttpGet("procurement/{id:int}/staffs")]
    public async Task<IActionResult> GetStaffs(int id)
    {
        var rows = await db.assetWithdrawals.AsNoTracking()
            .Where(x => x.procurement_record_id == id && x.is_active)
            .OrderByDescending(x => x.withdrawal_date).ThenByDescending(x => x.procurement_withdrawal_id)
            .Select(x => x.staff_id)
            .ToListAsync();
        var staffIds = rows.Distinct().ToList();

        var staffs = await db.staffs.AsNoTracking()
            .Where(x => staffIds.Contains(x.staff_id))
            .Join(db.prefixes.AsNoTracking(), s => s.prefix_id, p => p.prefix_id,
                (s, p) => new { s.staff_id, p.prefix_name, s.first_name, s.last_name })
            .ToListAsync();

        var result = staffIds
            .Select(staffId => staffs.FirstOrDefault(x => x.staff_id == staffId))
            .Where(x => x != null)
            .Select(x => new AssetExportStaff(x!.staff_id, $"{x.prefix_name}{x.first_name} {x.last_name}".Trim()))
            .ToList();
        return Ok(result);
    }

    [HttpPost("procurement/{id:int}/pdf")]
    public Task<IActionResult> ExportPdf(int id, [FromBody] MaterialWithdrawalExportRequest request)
        => GeneratePdf(id, issueNumber: false, request);

    [HttpPost("procurement/{id:int}/pdf/issue")]
    [Authorize]
    public Task<IActionResult> IssuePdf(int id, [FromBody] MaterialWithdrawalExportRequest request)
        => GeneratePdf(id, issueNumber: true, request);

    private async Task<IActionResult> GeneratePdf(int procurementId, bool issueNumber, MaterialWithdrawalExportRequest request)
    {
        if (request.ExportDate == default)
            return BadRequest("กรุณาระบุวันที่");
        if (request.StaffId <= 0)
            return BadRequest("กรุณาระบุผู้รับของ");

        var record = await db.procurement_records.AsNoTracking()
            .FirstOrDefaultAsync(x => x.procurement_record_id == procurementId && x.is_active);
        if (record == null)
            return NotFound("ไม่พบเอกสารจัดซื้อหลัก");

        // ผู้รับของต้องเป็นผู้เบิกที่บันทึกไว้ในรายการเบิกครุภัณฑ์ของเอกสารนี้
        var isWithdrawer = await db.assetWithdrawals.AsNoTracking().AnyAsync(x =>
            x.procurement_record_id == procurementId && x.is_active && x.staff_id == request.StaffId);
        if (!isWithdrawer)
            return BadRequest("ผู้รับของที่เลือกไม่ได้อยู่ในรายการเบิกครุภัณฑ์ของเอกสารนี้");

        var staff = await db.staffs.AsNoTracking()
            .Where(x => x.staff_id == request.StaffId && x.is_active)
            .Join(db.prefixes.AsNoTracking(), s => s.prefix_id, p => p.prefix_id,
                (s, p) => new { s.first_name, s.last_name, p.prefix_name })
            .FirstOrDefaultAsync();
        if (staff == null)
            return BadRequest("ไม่พบผู้รับของที่เลือก");

        // ครุภัณฑ์หลักของเอกสาร + ครุภัณฑ์ย่อย
        var assets = await db.assetItems.AsNoTracking()
            .Where(x => x.procurement_record_id == procurementId && x.is_active)
            .OrderBy(x => x.item_no).ThenBy(x => x.asset_id)
            .Select(x => new { x.asset_id, x.item_no, x.asset_name })
            .ToListAsync();
        var assetIds = assets.Select(x => x.asset_id).ToList();
        var subs = await db.assetSubItems.AsNoTracking()
            .Where(x => assetIds.Contains(x.asset_id) && x.is_active)
            .Join(db.units.AsNoTracking(), s => s.unit_id, u => u.unit_id,
                (s, u) => new { s.asset_id, s.quantity, s.unit_price, s.total_price, u.unit_name })
            .ToListAsync();

        var items = new List<ExportItem>();
        foreach (var asset in assets)
        {
            var mine = subs.Where(x => x.asset_id == asset.asset_id).ToList();
            if (mine.Count == 0) continue;

            var quantity = mine.Sum(x => x.quantity);
            var total = mine.Sum(x => x.total_price ?? x.quantity * (x.unit_price ?? 0));
            var units = mine.Select(x => x.unit_name).Distinct().ToList();
            items.Add(new ExportItem(
                items.Count + 1,
                asset.asset_name,
                quantity,
                string.Join(", ", units),
                quantity > 0 ? Math.Round(total / quantity, 2) : 0,
                total));
        }

        if (items.Count == 0)
            return BadRequest("เอกสารนี้ไม่มีรายการครุภัณฑ์");

        await using var transaction = issueNumber ? await db.Database.BeginTransactionAsync() : null;
        var issuedRecord = record;
        if (issueNumber)
        {
            await db.Database.ExecuteSqlRawAsync(
                "EXEC sp_getapplock @Resource = 'material-export-number', @LockMode = 'Exclusive', @LockOwner = 'Transaction'");
            issuedRecord = await db.procurement_records.FirstAsync(x => x.procurement_record_id == procurementId);
        }

        var exportSettings = await db.material_export_settings.FirstAsync(x => x.id == 1);
        if (string.IsNullOrWhiteSpace(exportSettings.department_name) ||
            string.IsNullOrWhiteSpace(exportSettings.supplies_officer) ||
            !exportSettings.responsibility_text.Contains("{date}"))
            return BadRequest("กรุณาตั้งค่าหน่วยงาน เจ้าหน้าที่พัสดุ และข้อความท้ายใบก่อนส่งออก");

        // เลขเล่มที่/เลขที่ ใช้ชุดเดียวกับใบเบิกวัสดุ (เอกสารหนึ่งฉบับออกเลขได้ครั้งเดียว)
        if (issueNumber && issuedRecord.export_book_number == null)
        {
            var maxUsed = await db.procurement_records
                .Where(x => x.export_book_number == exportSettings.book_number)
                .MaxAsync(x => x.export_serial_number) ?? 0;
            var next = Math.Max(exportSettings.next_number, maxUsed + 1);
            issuedRecord.export_book_number = exportSettings.book_number;
            issuedRecord.export_serial_number = next;
            exportSettings.next_number = next + 1;
            await db.SaveChangesAsync();
        }

        var culture = CultureInfo.GetCultureInfo("th-TH");
        var date = request.ExportDate.ToDateTime(TimeOnly.MinValue).ToString("d MMMM yyyy", culture);
        var recipient = $"{staff.prefix_name}{staff.first_name} {staff.last_name}";
        var responsibility = exportSettings.responsibility_text.Replace("{date}", date);

        var totalAmount = items.Sum(x => x.TotalAmount);
        if (issuedRecord.total_amount > 0)
            totalAmount = issuedRecord.total_amount;
        var amountText = string.IsNullOrWhiteSpace(issuedRecord.amount_text) ? "" : issuedRecord.amount_text;

        QuestPDF.Settings.License = LicenseType.Community;

        var activityDepartment = await db.departments.AsNoTracking()
            .Where(x => x.department_id == issuedRecord.department_id)
            .Select(x => x.department_name)
            .FirstOrDefaultAsync() ?? "";

        var pdf = API.Reports.WithdrawalFormPdf.Create(new API.Reports.WithdrawalFormData(
            issuedRecord.withdrawal_document_no ?? "-", date, issuedRecord.decree_document_no ?? "-",
            issuedRecord.document_no ?? "-", "", recipient,
            exportSettings.department_name, exportSettings.supplies_officer, responsibility,
            amountText, totalAmount, issuedRecord.export_book_number?.ToString() ?? "",
            issuedRecord.export_serial_number?.ToString("D3") ?? "",
            items.Select(x => new API.Reports.WithdrawalFormRow(x.ItemNo, x.Name, x.Quantity,
                x.Unit, x.UnitPrice, x.TotalAmount)).ToList(), activityDepartment)).GeneratePdf();
        if (transaction != null) await transaction.CommitAsync();

        return File(pdf, "application/pdf", $"asset-withdrawal-{procurementId}.pdf");
    }

    private sealed record ExportItem(
        int ItemNo, string Name, decimal Quantity, string Unit, decimal UnitPrice, decimal TotalAmount);
}
