using System.ComponentModel.DataAnnotations;

namespace Core.Entities;

public class MaterialExportSetting
{
    [Key]
    public int id { get; set; }
    public int book_number { get; set; } = 1;
    public int next_number { get; set; } = 1;
    public string department_name { get; set; } = string.Empty;
    public string supplies_officer { get; set; } = "นางสาวเสาวณีย์ หกประเสริฐ";
    public string responsibility_text { get; set; } = "โดยข้าพเจ้าจะขอรับผิดชอบตามระเบียบกระทรวงการคลังว่าด้วยการจัดซื้อจัดจ้างและบริหารพัสดุภาครัฐ พ.ศ. ๒๕๖๐ ทุกประการ และได้รับสิ่งของตามรายการนั้นไปเรียบร้อยแล้ว ตั้งแต่วันที่ {date} หากสิ่งของที่ข้าพเจ้าได้รับไปเกิดการสูญหายขึ้น ข้าพเจ้ายินยอมให้หักเงินเดือนชดใช้ตามที่มหาวิทยาลัยกำหนดจนครบเท่าราคาซื้อ";
}
