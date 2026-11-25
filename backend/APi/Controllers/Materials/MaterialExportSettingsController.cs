using Microsoft.AspNetCore.Authorization;

namespace API.Controllers;

public sealed record MaterialExportSettingsRequest(
    int BookNumber, int NextNumber, string DepartmentName,
    string SuppliesOfficer, string ResponsibilityText);

public class MaterialExportSettingsController(StoreContext db) : BaseApiController
{
    [HttpGet]
    public async Task<IActionResult> Get()
    {
        var settings = await db.material_export_settings.AsNoTracking().FirstAsync(x => x.id == 1);
        return Ok(ToResponse(settings));
    }

    [Authorize(Roles = "Admin")]
    [HttpPut]
    public async Task<IActionResult> Update(MaterialExportSettingsRequest request)
    {
        if (request.BookNumber < 1 || request.NextNumber < 1 ||
            string.IsNullOrWhiteSpace(request.DepartmentName) ||
            string.IsNullOrWhiteSpace(request.SuppliesOfficer) ||
            !request.ResponsibilityText.Contains("{date}"))
            return BadRequest("ข้อมูลตั้งค่าใบเบิกวัสดุไม่ครบหรือไม่ถูกต้อง");

        await using var transaction = await db.Database.BeginTransactionAsync();
        await db.Database.ExecuteSqlRawAsync(
            "EXEC sp_getapplock @Resource = 'material-export-number', @LockMode = 'Exclusive', @LockOwner = 'Transaction'");
        var maxUsed = await db.procurement_records
            .Where(x => x.export_book_number == request.BookNumber)
            .MaxAsync(x => x.export_serial_number) ?? 0;
        if (request.NextNumber <= maxUsed)
            return Conflict($"เล่มที่ {request.BookNumber} ใช้เลขถึง {maxUsed:D3} แล้ว");

        var settings = await db.material_export_settings.FirstAsync(x => x.id == 1);
        settings.book_number = request.BookNumber;
        settings.next_number = request.NextNumber;
        settings.department_name = request.DepartmentName.Trim();
        settings.supplies_officer = request.SuppliesOfficer.Trim();
        settings.responsibility_text = request.ResponsibilityText;
        await db.SaveChangesAsync();
        await transaction.CommitAsync();
        return Ok(ToResponse(settings));
    }

    private static object ToResponse(MaterialExportSetting value) => new
    {
        bookNumber = value.book_number,
        nextNumber = value.next_number,
        departmentName = value.department_name,
        suppliesOfficer = value.supplies_officer,
        responsibilityText = value.responsibility_text,
    };
}
