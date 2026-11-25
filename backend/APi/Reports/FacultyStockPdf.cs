using System.Globalization;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace API.Reports;

public sealed class FacultyPdfReport
{
    public int? fiscal_year { get; set; }
    public List<FacultyPdfMaterial> items { get; set; } = [];
}
public sealed class FacultyPdfMaterial
{
    public string material_name { get; set; } = "";
    public string? unit_name { get; set; }
    public string? fund_name { get; set; }
    public decimal opening_balance { get; set; }
    public decimal quantity_in { get; set; }
    public decimal quantity_out { get; set; }
    public decimal current_balance { get; set; }
    public decimal? unit_price { get; set; }
    public List<FacultyPdfDepartment> departments { get; set; } = [];
    public FacultyPdfRow ToRow(FacultyPdfDepartment? department = null) => new(material_name, unit_name ?? "-",
        department?.opening_balance ?? opening_balance, department?.quantity_in ?? quantity_in,
        department?.quantity_out ?? quantity_out, department?.current_balance ?? current_balance, unit_price, fund_name);
}
public sealed class FacultyPdfDepartment
{
    public int department_id { get; set; }
    public decimal opening_balance { get; set; }
    public decimal quantity_in { get; set; }
    public decimal quantity_out { get; set; }
    public decimal current_balance { get; set; }
}
public sealed record FacultyPdfRow(string Name, string Unit, decimal Opening, decimal Received,
    decimal Issued, decimal Balance, decimal? Price, string? Fund);
public sealed record FacultyPdfSection(string Name, List<FacultyPdfRow> Rows);

public static class FacultyStockPdf
{
    private static readonly CultureInfo Numbers = CultureInfo.InvariantCulture;
    public static Document Create(int? year, List<FacultyPdfSection> sections, string? search = null, bool remaining = false)
    {
        QuestPDF.Settings.License = LicenseType.Community;
        return Document.Create(document =>
        {
            foreach (var section in sections)
                document.Page(page =>
                {
                    page.Size(PageSizes.A4.Landscape());
                    page.PageColor(Colors.White);
                    page.MarginHorizontal(18);
                    page.MarginVertical(16);
                    page.DefaultTextStyle(x => x.FontFamily("TH Sarabun New").FontSize(12).FontColor(Colors.Black));
                    page.Header().PaddingBottom(8).Column(header =>
                    {
                        header.Item().AlignCenter().Text(year.HasValue
                            ? $"รายงานวัสดุคงเหลือ ประจำปีงบประมาณ พ.ศ. {year}"
                            : "รายงานวัสดุคงเหลือ ทุกปีงบประมาณ").FontSize(16).Bold();
                        header.Item().AlignCenter().Text("คณะวิทยาศาสตร์และเทคโนโลยี มหาวิทยาลัยราชภัฏกาญจนบุรี").FontSize(14).Bold();
                        header.Item().AlignCenter().Text(section.Name).FontSize(13);
                        if (!string.IsNullOrWhiteSpace(search) || remaining)
                            header.Item().AlignCenter().Text(string.Join(" · ", new[] {
                                string.IsNullOrWhiteSpace(search) ? null : $"ค้นหา: {search}",
                                remaining ? "เฉพาะรายการที่มีคงเหลือ" : null }.Where(x => x != null))).FontSize(11);
                    });
                    page.Content().Table(table =>
                    {
                        table.ColumnsDefinition(columns =>
                        {
                            foreach (var width in new float[] { .6f, 3.5f, .65f, .8f, .65f, .65f, .8f, .95f, 1.15f, .9f, 1.1f, .9f, .95f, .85f, 1.4f })
                                columns.RelativeColumn(width);
                        });
                        table.Header(header =>
                        {
                            var labels = new[] { "ลำดับ", "รายละเอียดรายการ", "หน่วย", "ยอดยกมา", "รับ", "จ่าย" };
                            for (uint i = 0; i < labels.Length; i++)
                                Cell(header.Cell().Row(1).Column(i + 1).RowSpan(2)).AlignCenter().Text(labels[i]).Bold();
                            Cell(header.Cell().Row(1).Column(7).ColumnSpan(3)).AlignCenter().Text("คงเหลือ").Bold();
                            var extras = new[] { "ประเภทเงิน", "หมายเหตุ", "ร้านค้า", "หน่วยงาน", "ผู้เบิก", "เลขที่เอกสาร" };
                            for (uint i = 0; i < extras.Length; i++)
                                Cell(header.Cell().Row(1).Column(i + 10).RowSpan(2)).AlignCenter().Text(extras[i]).Bold();
                            var balanceLabels = new[] { "คงเหลือ", "ราคา/หน่วย", "รวมเป็นเงิน" };
                            for (uint i = 0; i < balanceLabels.Length; i++)
                                Cell(header.Cell().Row(2).Column(i + 7)).AlignCenter().Text(balanceLabels[i]).Bold();
                        });
                        var index = 0;
                        foreach (var row in section.Rows)
                        {
                            Cell(table.Cell()).AlignCenter().Text((++index).ToString(Numbers));
                            Cell(table.Cell()).Text(row.Name);
                            Cell(table.Cell()).AlignCenter().Text(row.Unit);
                            foreach (var quantity in new[] { row.Opening, row.Received, row.Issued, row.Balance })
                                Cell(table.Cell()).AlignRight().Text(quantity.ToString("0.##", Numbers));
                            Cell(table.Cell()).AlignRight().Text(row.Price?.ToString("N2", Numbers) ?? "-");
                            Cell(table.Cell()).AlignRight().Text(row.Price.HasValue
                                ? (row.Balance * row.Price.Value).ToString("N2", Numbers) : "-");
                            Cell(table.Cell()).AlignCenter().Text(row.Fund ?? "");
                            for (var i = 0; i < 5; i++) Cell(table.Cell()).Text("");
                        }
                        if (section.Rows.Count == 0) Cell(table.Cell().ColumnSpan(15)).AlignCenter().Text("ไม่พบรายการวัสดุตามตัวกรอง");
                        Cell(table.Cell().ColumnSpan(8)).AlignRight().Text("รวมมูลค่าคงเหลือ").Bold();
                        var missingPrice = section.Rows.Any(x => x.Balance != 0 && !x.Price.HasValue);
                        Cell(table.Cell()).AlignRight().Text(missingPrice ? "รอตรวจสอบ" : section.Rows
                            .Sum(x => x.Balance * (x.Price ?? 0)).ToString("N2", Numbers)).Bold();
                        for (var i = 0; i < 6; i++) Cell(table.Cell()).Text("");
                    });
                    page.Footer().PaddingTop(6).AlignRight().Text(text =>
                    {
                        text.Span("หน้า "); text.CurrentPageNumber(); text.Span(" / "); text.TotalPages();
                    });
                });
        });
    }
    private static IContainer Cell(IContainer container) => container.ShowEntire().Border(.5f)
        .BorderColor(Colors.Black).PaddingHorizontal(3).PaddingVertical(2).MinHeight(17).AlignMiddle();
}
