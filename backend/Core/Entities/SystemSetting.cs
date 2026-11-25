using System.ComponentModel.DataAnnotations;

namespace Core.Entities
{
    public class SystemSetting : BaseEntity
    {
        [Key]
        public int id { get; set; }

        [Required]
        public string project_name { get; set; } = string.Empty;

        [Required]
        public string logo_path { get; set; } = string.Empty;

        // แผนกที่เป็น "ส่วนกลางพัสดุ" (รหัสต่างกันในแต่ละฐานข้อมูล จึงให้เลือกในหน้าตั้งค่า)
        public int? central_department_id { get; set; }
    }
}
