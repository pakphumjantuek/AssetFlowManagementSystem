using System.Text.Json;
using API.Reports;
using QuestPDF.Fluent;

namespace API.Controllers;

public partial class MaterialItemController
{
    [HttpGet("faculty-stock/pdf")]
    public async Task<IActionResult> ExportFacultyStockPdf([FromQuery] int? fiscal_year_id,
        [FromQuery] string scope = "faculty", [FromQuery] int? department_id = null,
        [FromQuery] string? search = null, [FromQuery] bool remaining = false)
    {
        if (scope != "faculty" && scope != "departments") return BadRequest("รูปแบบรายงานไม่ถูกต้อง");
        if (scope == "faculty" && department_id.HasValue) return BadRequest("รายงานทั้งคณะไม่ใช้ตัวกรองสาขา");
        var result = await GetFacultyStock(fiscal_year_id, null, search);
        if (result is not OkObjectResult ok) return result;
        var report = JsonSerializer.Deserialize<FacultyPdfReport>(JsonSerializer.Serialize(ok.Value))!;
        var sections = new List<FacultyPdfSection>();
        if (scope == "faculty")
        {
            sections.Add(new FacultyPdfSection("ทั้งคณะ", report.items
                .Where(x => !remaining || x.current_balance != 0).Select(x => x.ToRow()).ToList()));
        }
        else
        {
            var centralId = await central.GetIdAsync();
            var departments = (await unit.Repository<Departments>().ListAllAsync())
                .Where(x => x.is_active && (!department_id.HasValue || x.department_id == department_id))
                .OrderBy(x => x.department_id == centralId ? 0 : 1).ThenBy(x => x.department_id).ToList();
            if (departments.Count == 0) return BadRequest("ไม่พบสาขาที่เลือก");
            foreach (var department in departments)
            {
                var rows = report.items.Select(material => new { material,
                    stock = material.departments.FirstOrDefault(x => x.department_id == department.department_id) })
                    .Where(x => x.stock != null && (!remaining || x.stock.current_balance != 0))
                    .Select(x => x.material.ToRow(x.stock)).ToList();
                sections.Add(new FacultyPdfSection(department.department_name, rows));
            }
        }
        var pdf = FacultyStockPdf.Create(report.fiscal_year, sections, search, remaining).GeneratePdf();
        return File(pdf, "application/pdf", $"material-stock-{scope}-{report.fiscal_year?.ToString() ?? "all-years"}.pdf");
    }
}
