using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace API.Reports;

public record WithdrawalFormRow(int Number, string Name, decimal Quantity, string Unit, decimal Price, decimal Amount);
public record WithdrawalFormData(string Number, string Date, string Approval, string Purchase,
    string Inspection, string Recipient, string Department, string Officer, string Responsibility,
    string AmountText, decimal Total, string Book, string Serial, List<WithdrawalFormRow> Items,
    string ActivityDepartment)
{
    /// <summary>แสดงแถวสรุปยอด (ส่วนต่าง/ส่วนลด/รวมเงิน) เฉพาะหน้าสุดท้าย</summary>
    public bool IsLastPage { get; init; } = true;
}

public static class WithdrawalFormPdf
{
    public static Document Create(WithdrawalFormData data) => CreatePages(Paginate(data));

    /// <summary>แบ่งรายการเป็นหน้า (สูงสุดหน้าละ 6 รายการ หรือน้อยกว่าถ้าข้อความยาวจนล้นหน้า)</summary>
    public static List<WithdrawalFormData> Paginate(WithdrawalFormData data)
    {
        QuestPDF.Settings.License = LicenseType.Community;
        var pages = new List<WithdrawalFormData>();
        var grandTotal = data.Items.Sum(x => x.Amount);
        var grandTotalText = ThaiBahtTextConverter.ToThaiBahtText(grandTotal);
        var offset = 0;
        do
        {
            var count = Math.Min(6, data.Items.Count - offset);
            while (true)
            {
                var rows = data.Items.Skip(offset).Take(count).ToList();
                // ยอดรวมทั้งใบ แสดงเฉพาะหน้าสุดท้าย
                var pageData = data with { Items = rows, Total = grandTotal,
                    AmountText = grandTotalText, IsLastPage = offset + count >= data.Items.Count };
                try
                {
                    // Let the PDF engine measure actual Thai text and row heights.
                    CreatePages([pageData]).GeneratePdf();
                    pages.Add(pageData);
                    offset += count;
                    break;
                }
                catch (QuestPDF.Drawing.Exceptions.DocumentLayoutException) when (count > 1)
                {
                    count--;
                }
            }
        } while (offset < data.Items.Count);
        return pages;
    }

    private static Document CreatePages(List<WithdrawalFormData> pages) => Document.Create(doc =>
    {
        foreach (var data in pages) doc.Page(page =>
        {
            page.Size(PageSizes.A4);
            page.MarginHorizontal(7);
            page.MarginVertical(24);
            page.PageColor(Colors.White);
            page.DefaultTextStyle(x => x.FontFamily("TH Sarabun New").FontSize(16).FontColor(Colors.Black));
            page.Content().ShowEntire().Column(c =>
            {
                c.Item().Height(48).Layers(header =>
                {
                    header.PrimaryLayer().Column(h =>
                    {
                        h.Item().AlignCenter().Text("มหาวิทยาลัยราชภัฏกาญจนบุรี").Bold().FontSize(18);
                        h.Item().AlignCenter().Text("ใบเบิกวัสดุ/ครุภัณฑ์").Bold().FontSize(18);
                    });
                    header.Layer().AlignRight().ShrinkHorizontal().Row(n =>
                    {
                        n.AutoItem().Height(24).AlignBottom().Text("ใบเบิกเลขที่ ");
                        n.ConstantItem(100).Element(x => Field(x, data.Number));
                    });
                });
                c.Item().PaddingTop(6).Row(r =>
                {
                    r.RelativeItem().Column(a =>
                    {
                        Reference(a, "อ้างอิงเอกสารขออนุมัติเลขที่", data.Approval);
                        Reference(a, "อ้างอิงเอกสารจัดซื้อเลขที่", data.Purchase);
                    });
                    r.ConstantItem(170).PaddingTop(22).Row(d =>
                    {
                        d.AutoItem().Height(24).AlignBottom().Text("วันที่ ");
                        d.RelativeItem().Element(x => Field(x, data.Date));
                    });
                });
                c.Item().Row(r => { r.ConstantItem(95).AlignRight().Text("ข้าพเจ้า"); r.RelativeItem().Element(x => Field(x, data.Recipient, textInset: 52)); });
                c.Item().Row(r => { r.ConstantItem(95).Text("สังกัดหน่วยงาน"); r.RelativeItem().Element(x => Field(x, data.Department, textInset: 52)); });
                c.Item().Row(r =>
                {
                    r.RelativeItem(1.1f).Text("มีความประสงค์จะขอเบิกวัสดุ/ครุภัณฑ์ดังต่อไปนี้");
                });
                c.Item().PaddingTop(20).Height(320).ShowEntire().Table(t =>
                {
                    t.ColumnsDefinition(cols => { foreach (var w in new float[] { .65f, 3.1f, .6f, .65f, 1.1f, 1.2f, 1 }) cols.RelativeColumn(w); });
                    t.Header(h =>
                    {
                        Box(h.Cell().Row(1).Column(1).RowSpan(2)).AlignCenter().Text("ลำดับที่");
                        Box(h.Cell().Row(1).Column(2)).AlignCenter().Text("รายการ");
                        Box(h.Cell().Row(1).Column(3).ColumnSpan(4)).AlignCenter().Text("ขอดำเนินการครั้งนี้");
                        Box(h.Cell().Row(1).Column(7).RowSpan(2)).AlignCenter().Text("จำนวนที่\nจะต้อง\nดำเนินการ").FontSize(14);
                        var labels = new[] { "ชื่อ ลักษณะ ขนาด ยี่ห้อ", "จำนวน", "หน่วยนับ", "ราคาต่อหน่วย", "รวมเงิน" };
                        for (uint i = 0; i < labels.Length; i++) Box(h.Cell().Row(2).Column(i + 2)).AlignCenter().Text(labels[i]).FontSize(14);
                    });
                    // หน้าที่ไม่มีแถวสรุปยอด ยืดแถวรายการให้เต็มพื้นที่แทน
                    var minRowHeight = (data.IsLastPage ? 180f : 250f) / Math.Max(1, data.Items.Count);
                    foreach (var item in data.Items)
                    {
                        var closing = !data.IsLastPage && item == data.Items[^1];
                        IContainer Body(IContainer x, float h) => closing ? WithdrawalFormPdf.Body(x.BorderBottom(.6f), h) : WithdrawalFormPdf.Body(x, h);
                        Body(t.Cell(), minRowHeight).AlignCenter().Text(item.Number.ToString());
                        Body(t.Cell(), minRowHeight).Text(item.Name);
                        Body(t.Cell(), minRowHeight).AlignCenter().Text(item.Quantity.ToString("0.##"));
                        Body(t.Cell(), minRowHeight).AlignCenter().Text(item.Unit);
                        Body(t.Cell(), minRowHeight).AlignRight().Text(item.Price.ToString("N2"));
                        Body(t.Cell(), minRowHeight).AlignRight().Text(item.Amount.ToString("N2"));
                        Body(t.Cell(), minRowHeight).Text("");
                    }
                    if (data.IsLastPage)
                    {
                        Total(t, "ผู้เบิกชำระส่วนต่างเอง", "0.00");
                        Total(t, "ส่วนลด", "0.00");
                        Box(t.Cell().ColumnSpan(5)).Row(r => { r.AutoItem().Text("รวมเงิน").Bold(); r.RelativeItem().AlignCenter().Text(data.AmountText).FontSize(15); });
                        Box(t.Cell()).AlignRight().Text(data.Total.ToString("N2")).Bold();
                        Box(t.Cell()).Text("");
                    }
                });
                c.Item().Row(r => { r.ConstantItem(150).PaddingLeft(8).Text("เพื่อนำไปใช้ในกิจการของ"); r.RelativeItem().Element(x => Field(x, data.ActivityDepartment)); });
                c.Item().PaddingTop(2).DefaultTextStyle(x => x.FontSize(15)).Column(certification =>
                {
                    certification.Item().Text("โดยข้าพเจ้าจะขอรับผิดชอบตามระเบียบกระทรวงการคลังว่าด้วยการจัดซื้อจัดจ้างและการบริหารพัสดุภาครัฐ พ.ศ. ๒๕๖๐");
                    certification.Item().Row(line =>
                    {
                        line.AutoItem().AlignBottom().Text("ทุกประการ และได้รับสิ่งของตามรายการนั้นไปเรียบร้อยแล้ว");
                        line.AutoItem().PaddingLeft(24).AlignBottom().Text("ตั้งแต่วันที่ ");
                        line.AutoItem().MinWidth(82).Element(x => Field(x, data.Date));
                        line.RelativeItem().PaddingLeft(24).AlignBottom().Text("หากสิ่งของที่ข้าพเจ้าได้รับไป");
                    });
                    certification.Item().Text("เกิดการสูญหายขึ้น ข้าพเจ้ายินยอมให้หักเงินเดือนชดใช้ตามที่มหาวิทยาลัยกำหนดจนครบเท่าราคาซื้อ");
                });
                c.Item().PaddingTop(22).ShowEntire().Row(r =>
                {
                    r.RelativeItem().Column(left =>
                    {
                        left.Item().Text("ได้จ่ายและลงหักบัญชีพัสดุเรียบร้อยแล้ว").FontSize(15);
                        left.Item().PaddingTop(5).Text($"บัญชีเล่มที่ ......{data.Book}...... เลขที่ ......{data.Serial}......").FontSize(15);
                    });
                    r.ConstantItem(210).Column(right =>
                    {
                        Signature(right, data.Recipient, "ผู้รับของ");
                        right.Item().Height(38);
                        Signature(right, data.Officer, "เจ้าหน้าที่พัสดุ");
                    });
                });
            });
        });
    });
    private static void Reference(ColumnDescriptor c, string label, string value) => c.Item().Height(22).Row(r => { r.ConstantItem(142).Text(label); r.RelativeItem().PaddingLeft(5).Text(value); });
    private static IContainer Box(IContainer x) => x.Border(.6f).PaddingHorizontal(3).PaddingVertical(2).AlignMiddle();
    private static IContainer Body(IContainer x, float minHeight) => x.ShowEntire().BorderVertical(.6f).MinHeight(minHeight).PaddingHorizontal(3).PaddingTop(3).AlignTop();
    private static void Total(TableDescriptor t, string label, string amount) { Box(t.Cell().ColumnSpan(5)).AlignRight().Text(label); Box(t.Cell()).AlignRight().Text(amount); Box(t.Cell()).Text(""); }
    private static void Field(IContainer x, string value, bool alignRight = false, float textInset = 5) => x.Height(24).Layers(layers =>
    {
        layers.Layer().AlignBottom().LineHorizontal(.5f).LineDashPattern(new float[] { 1, 1.5f });
        var textContainer = layers.PrimaryLayer().PaddingLeft(textInset).PaddingBottom(2).AlignBottom();
        if (alignRight) textContainer = textContainer.AlignRight();
        textContainer.Text(value);
    });
    private static void Signature(ColumnDescriptor c, string name, string role)
    {
        c.Item().DefaultTextStyle(x => x.FontSize(15)).Row(r => { r.AutoItem().Height(24).AlignBottom().Text("ลงชื่อ "); r.RelativeItem().Element(x => Field(x, "")); r.AutoItem().Height(24).AlignBottom().Text(role); });
        c.Item().AlignCenter().Text($"( {name} )").FontSize(15);
    }
}
