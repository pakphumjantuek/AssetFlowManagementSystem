using API.Reports;

namespace APi.Tests;

public class WithdrawalFormPdfTests
{
    private static WithdrawalFormData Form(int itemCount, decimal amount = 100) => new(
        "W-1", "21/10/2569", "A-1", "P-1", "I-1", "ผู้เบิก", "สาขา", "เจ้าหน้าที่", "ผู้รับผิดชอบ",
        "", 0, "1", "1",
        Enumerable.Range(1, itemCount)
            .Select(i => new WithdrawalFormRow(i, $"วัสดุ {i}", 1, "ชิ้น", amount, amount))
            .ToList(),
        "คณะ");

    [Theory]
    [InlineData(1, 1)]
    [InlineData(6, 1)]
    [InlineData(7, 2)]
    [InlineData(12, 2)]
    [InlineData(13, 3)]
    public void Splits_at_most_six_items_per_page(int items, int expectedPages)
    {
        var pages = WithdrawalFormPdf.Paginate(Form(items));

        Assert.Equal(expectedPages, pages.Count);
        Assert.All(pages, p => Assert.InRange(p.Items.Count, 1, 6));
        Assert.Equal(Enumerable.Range(1, items), pages.SelectMany(p => p.Items).Select(x => x.Number));
    }

    [Fact]
    public void Only_last_page_shows_summary()
    {
        var pages = WithdrawalFormPdf.Paginate(Form(13));

        Assert.Equal([false, false, true], pages.Select(p => p.IsLastPage));
    }

    [Fact]
    public void Summary_uses_grand_total_of_all_items()
    {
        var pages = WithdrawalFormPdf.Paginate(Form(8, amount: 316.25m));
        var last = pages[^1];

        Assert.Equal(2530m, last.Total);
        Assert.Equal("สองพันห้าร้อยสามสิบบาทถ้วน", last.AmountText);
    }

    [Fact]
    public void Long_item_names_push_items_to_next_page()
    {
        var data = Form(6);
        var longName = string.Concat(Enumerable.Repeat("กระดาษถ่ายเอกสาร A4 80 แกรม ยี่ห้อดับเบิ้ลเอ ", 8));
        data = data with { Items = data.Items.Select(x => x with { Name = longName }).ToList() };

        var pages = WithdrawalFormPdf.Paginate(data);

        Assert.True(pages.Count > 1);
        Assert.Equal(6, pages.Sum(p => p.Items.Count));
    }

    [Fact]
    public void Create_generates_pdf()
    {
        var pdf = QuestPDF.Fluent.GenerateExtensions.GeneratePdf(WithdrawalFormPdf.Create(Form(7)));

        Assert.True(pdf.Length > 0);
    }
}
