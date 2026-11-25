namespace API.Helpers;

/// <summary>
/// อ่านรหัสแผนก "ส่วนกลางพัสดุ" จากการตั้งค่าระบบ (system_settings.central_department_id)
/// แทนการฮาร์ดโค้ดเลขแผนก เพราะแต่ละฐานข้อมูลมีรหัสไม่เหมือนกัน
/// </summary>
public class CentralDepartmentService(StoreContext db)
{
    public const string NotConfiguredMessage = "ยังไม่ได้กำหนดส่วนกลางพัสดุ กรุณาตั้งค่าที่เมนูตั้งค่าระบบก่อน";

    public async Task<int?> GetIdAsync() =>
        await db.system_settings.AsNoTracking()
            .Where(x => x.is_active)
            .Select(x => x.central_department_id)
            .FirstOrDefaultAsync();
}
