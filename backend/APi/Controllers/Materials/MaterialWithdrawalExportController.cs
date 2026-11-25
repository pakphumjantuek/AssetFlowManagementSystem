using System.Globalization;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace API.Controllers;

public sealed record MaterialWithdrawalExportRequest(
    DateOnly ExportDate,
    int StaffId
);

public class MaterialWithdrawalExportController(StoreContext db)
    : BaseApiController
{
    // =========================================================
    // Export จาก Material Withdrawal
    // =========================================================
    [HttpPost("{id:int}/pdf")]
    public async Task<IActionResult> ExportPdf(
        int id,
        [FromBody] MaterialWithdrawalExportRequest request)
    {
        return await GeneratePdf(
            id,
            isProcurementId: false,
            issueNumber: false,
            request
        );
    }

    [HttpPost("{id:int}/pdf/issue")]
    [Authorize]
    public Task<IActionResult> IssuePdf(int id, [FromBody] MaterialWithdrawalExportRequest request)
        => GeneratePdf(id, isProcurementId: false, issueNumber: true, request);

    // =========================================================
    // Export จาก Procurement Record โดยตรง
    // =========================================================
    [HttpPost("procurement/{id:int}/pdf")]
    public async Task<IActionResult> ExportProcurementPdf(
        int id,
        [FromBody] MaterialWithdrawalExportRequest request)
    {
        return await GeneratePdf(
            id,
            isProcurementId: true,
            issueNumber: false,
            request
        );
    }

    [HttpPost("procurement/{id:int}/pdf/issue")]
    [Authorize]
    public Task<IActionResult> IssueProcurementPdf(int id, [FromBody] MaterialWithdrawalExportRequest request)
        => GeneratePdf(id, isProcurementId: true, issueNumber: true, request);

    // =========================================================
    // Generate PDF
    // =========================================================
    private async Task<IActionResult> GeneratePdf(
       int id,
       bool isProcurementId,
       bool issueNumber,
       MaterialWithdrawalExportRequest request)
    {
        // =========================================================
        // Validate
        // =========================================================
        if (request.ExportDate == default)
            return BadRequest("กรุณาระบุวันที่");

        if (request.StaffId <= 0)
            return BadRequest("กรุณาระบุผู้รับของ");

        // =========================================================
        // หา Procurement ID
        // =========================================================
        var procurementId = id;

        if (!isProcurementId)
        {
            var withdrawal = await db.materialWithdrawals
                .AsNoTracking()
                .FirstOrDefaultAsync(x =>
                    x.material_withdrawal_id == id &&
                    x.is_active
                );

            if (withdrawal == null)
                return NotFound("ไม่พบใบเบิกวัสดุ");

            procurementId = withdrawal.procurement_record_id;
        }

        // =========================================================
        // Procurement Record
        // =========================================================
        var record = await db.procurement_records
            .AsNoTracking()
            .FirstOrDefaultAsync(x =>
                x.procurement_record_id == procurementId &&
                x.is_active
            );

        if (record == null)
            return NotFound("ไม่พบเอกสารจัดซื้อหลัก");

        // =========================================================
        // ผู้รับของ
        // =========================================================
        var staff = await db.staffs
            .AsNoTracking()
            .Where(x =>
                x.staff_id == request.StaffId &&
                x.is_active
            )
            .Join(
                db.prefixes.AsNoTracking(),
                s => s.prefix_id,
                p => p.prefix_id,
                (s, p) => new
                {
                    s.first_name,
                    s.last_name,
                    p.prefix_name
                }
            )
            .FirstOrDefaultAsync();

        if (staff == null)
            return BadRequest("ไม่พบผู้รับของที่เลือก");

        // =========================================================
        // รายการวัสดุ
        // =========================================================
        var items = await db.materialReceiveDetails
            .AsNoTracking()
            .Where(x =>
                x.procurement_record_id == record.procurement_record_id &&
                x.is_active
            )
            .Join(
                db.materialItems.AsNoTracking(),
                d => d.material_item_id,
                m => m.material_item_id,
                (d, m) => new
                {
                    d.item_no,
                    d.quantity,
                    d.unit_price,
                    d.total_amount,
                    m.material_name,
                    m.unit_id
                }
            )
            .Join(
                db.units.AsNoTracking(),
                x => x.unit_id,
                u => u.unit_id,
                (x, u) => new
                {
                    x.item_no,
                    x.material_name,
                    x.quantity,
                    u.unit_name,
                    x.unit_price,
                    x.total_amount
                }
            )
            .OrderBy(x => x.item_no)
            .Select(x => new ExportItem(
                x.item_no,
                x.material_name,
                x.quantity,
                x.unit_name,
                x.unit_price,
                x.total_amount ?? 0
            ))
            .ToListAsync();

        if (items.Count == 0)
            return BadRequest("เอกสารนี้ไม่มีรายการวัสดุ");

        await using var transaction = issueNumber ? await db.Database.BeginTransactionAsync() : null;
        if (issueNumber)
        {
            await db.Database.ExecuteSqlRawAsync(
                "EXEC sp_getapplock @Resource = 'material-export-number', @LockMode = 'Exclusive', @LockOwner = 'Transaction'");
            record = await db.procurement_records.FirstAsync(x => x.procurement_record_id == procurementId);
        }

        var exportSettings = await db.material_export_settings.FirstAsync(x => x.id == 1);
        if (string.IsNullOrWhiteSpace(exportSettings.department_name) ||
            string.IsNullOrWhiteSpace(exportSettings.supplies_officer) ||
            !exportSettings.responsibility_text.Contains("{date}"))
            return BadRequest("กรุณาตั้งค่าหน่วยงาน เจ้าหน้าที่พัสดุ และข้อความท้ายใบก่อนส่งออก");

        if (issueNumber && record.export_book_number == null)
        {
            var maxUsed = await db.procurement_records
                .Where(x => x.export_book_number == exportSettings.book_number)
                .MaxAsync(x => x.export_serial_number) ?? 0;
            var next = Math.Max(exportSettings.next_number, maxUsed + 1);
            record.export_book_number = exportSettings.book_number;
            record.export_serial_number = next;
            exportSettings.next_number = next + 1;
            await db.SaveChangesAsync();
        }

        // =========================================================
        // เตรียมข้อมูล
        // =========================================================
        var culture = CultureInfo.GetCultureInfo("th-TH");

        var exportDate = request.ExportDate
            .ToDateTime(TimeOnly.MinValue);

        var date = exportDate.ToString(
            "d MMMM yyyy",
            culture
        );

        var recipient =
            $"{staff.prefix_name}{staff.first_name} {staff.last_name}";

        var responsibility =
            exportSettings.responsibility_text.Replace(
                "{date}",
                date
            );

        var totalAmount = items.Sum(x => x.TotalAmount);

        if (record.total_amount > 0)
            totalAmount = record.total_amount;

        var amountText =
            string.IsNullOrWhiteSpace(record.amount_text)
                ? ""
                : record.amount_text;

        QuestPDF.Settings.License = LicenseType.Community;

        // =========================================================
        // Generate PDF
        // =========================================================
        var activityDepartment = await db.departments.AsNoTracking()
            .Where(x => x.department_id == record.department_id)
            .Select(x => x.department_name)
            .FirstOrDefaultAsync() ?? "";

        var pdf = API.Reports.WithdrawalFormPdf.Create(new API.Reports.WithdrawalFormData(
            record.withdrawal_document_no ?? "-", date, record.decree_document_no ?? "-",
            record.document_no ?? "-", "", recipient,
            exportSettings.department_name, exportSettings.supplies_officer, responsibility,
            amountText, totalAmount, record.export_book_number?.ToString() ?? "",
            record.export_serial_number?.ToString("D3") ?? "",
            items.Select(x => new API.Reports.WithdrawalFormRow(x.ItemNo, x.Name, x.Quantity,
                x.Unit, x.UnitPrice, x.TotalAmount)).ToList(), activityDepartment)).GeneratePdf();
        if (transaction != null) await transaction.CommitAsync();

        return File(
            pdf,
            "application/pdf",
            $"material-withdrawal-{id}.pdf"
        );
    }

    // =========================================================
    private sealed record ExportItem(
        int ItemNo,
        string Name,
        decimal Quantity,
        string Unit,
        decimal UnitPrice,
        decimal TotalAmount
    );
}
