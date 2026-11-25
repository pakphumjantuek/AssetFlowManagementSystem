using Microsoft.AspNetCore.Mvc;

namespace APi.Tests.Materials;

/// <summary>เส้นทางหลักของวัสดุ: รับเข้า → เบิกจากส่วนกลางให้สาขา → สาขาจ่ายออก → ยอดคงเหลือ</summary>
public class MaterialStockTests : IAsyncLifetime
{
    private readonly MaterialTestDb db = new();
    public Task InitializeAsync() => db.InitializeAsync();
    public Task DisposeAsync() => db.DisposeAsync();

    // ---------- 1. ยอดคงเหลือ ----------

    [Fact]
    public async Task Receive_adds_stock_to_central()
    {
        await db.ReceiveOk(100);

        var stock = await db.Stock(db.CurrentYearId);
        Assert.Equal(new StockRow(0, 100, 0, 100, Central: 100, Branch: 0, HasDiscrepancy: false), stock);
    }

    [Fact]
    public async Task Multiple_receipts_accumulate()
    {
        await db.ReceiveOk(100);
        await db.ReceiveOk(50);

        var stock = await db.Stock(db.CurrentYearId);
        Assert.Equal(150, stock.Balance);
        Assert.Equal(150, stock.Central);
    }

    [Fact]
    public async Task Branch_issue_reduces_branch_and_faculty_balance()
    {
        var receiveId = await db.ReceiveOk(100);
        Assert.IsType<OkObjectResult>(await db.Withdraw((receiveId, 30)));

        Assert.IsAssignableFrom<CreatedAtActionResult>(await db.IssueFromBranch(10));

        var stock = await db.Stock(db.CurrentYearId);
        Assert.Equal(70, stock.Central);
        Assert.Equal(20, stock.Branch);
        Assert.Equal(90, stock.Balance);
        Assert.Equal(10, stock.Issued);
        Assert.False(stock.HasDiscrepancy);
    }

    [Fact]
    public async Task Previous_year_balance_becomes_opening_balance()
    {
        await db.ReceiveOk(100);
        await db.MoveAllCardsToPreviousYear();

        var stock = await db.Stock(db.CurrentYearId);
        Assert.Equal(100, stock.Opening);
        Assert.Equal(0, stock.Received);
        Assert.Equal(100, stock.Balance);
        Assert.Equal(stock.Opening + stock.Received - stock.Issued, stock.Balance);
    }

    // ---------- 2. ห้ามเบิกเกินยอด ----------

    [Fact]
    public async Task Cannot_withdraw_more_than_received()
    {
        var receiveId = await db.ReceiveOk(100);
        var cardsBefore = await db.StockCardCount();

        Assert.IsType<BadRequestObjectResult>(await db.Withdraw((receiveId, 101)));

        Assert.Equal(cardsBefore, await db.StockCardCount());
        Assert.Equal(100, (await db.Stock(db.CurrentYearId)).Central);
    }

    [Fact]
    public async Task Second_withdrawal_cannot_exceed_what_is_left()
    {
        var receiveId = await db.ReceiveOk(100);
        Assert.IsType<OkObjectResult>(await db.Withdraw((receiveId, 60)));

        Assert.IsType<BadRequestObjectResult>(await db.Withdraw((receiveId, 41)));
        Assert.IsType<OkObjectResult>(await db.Withdraw((receiveId, 40)));

        var stock = await db.Stock(db.CurrentYearId);
        Assert.Equal(0, stock.Central);
        Assert.Equal(100, stock.Branch);
    }

    [Fact]
    public async Task Branch_cannot_issue_more_than_its_balance()
    {
        var receiveId = await db.ReceiveOk(100);
        Assert.IsType<OkObjectResult>(await db.Withdraw((receiveId, 30)));

        Assert.IsType<BadRequestObjectResult>(await db.IssueFromBranch(31));
        Assert.Equal(30, (await db.Stock(db.CurrentYearId)).Branch);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-5)]
    [InlineData(2.5)]
    public async Task Withdrawal_quantity_must_be_positive_whole_number(double quantity)
    {
        var receiveId = await db.ReceiveOk(100);

        Assert.IsType<BadRequestObjectResult>(await db.Withdraw((receiveId, (decimal)quantity)));
    }

    [Fact]
    public async Task Cannot_withdraw_same_receipt_row_twice_in_one_request()
    {
        var receiveId = await db.ReceiveOk(100);

        Assert.IsType<BadRequestObjectResult>(await db.Withdraw((receiveId, 10), (receiveId, 10)));
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    [InlineData(1.555)]
    public async Task Receive_quantity_must_be_positive_with_two_decimals(double quantity)
    {
        Assert.IsType<BadRequestObjectResult>(await db.Receive((decimal)quantity));
        Assert.Equal(0, await db.StockCardCount());
    }

    // ---------- 3. เบิกจากส่วนกลางให้สาขา ----------

    [Fact]
    public async Task Withdrawal_moves_stock_from_central_to_branch_without_changing_total()
    {
        var receiveId = await db.ReceiveOk(100);

        Assert.IsType<OkObjectResult>(await db.Withdraw((receiveId, 30)));

        var stock = await db.Stock(db.CurrentYearId);
        Assert.Equal(70, stock.Central);
        Assert.Equal(30, stock.Branch);
        Assert.Equal(100, stock.Balance);
        Assert.Equal(0, stock.Issued); // โอนภายในคณะ ไม่นับเป็นการจ่ายออก
        Assert.False(stock.HasDiscrepancy);
    }

    [Fact]
    public async Task Available_quantity_reflects_previous_withdrawals()
    {
        var receiveId = await db.ReceiveOk(100);
        Assert.IsType<OkObjectResult>(await db.Withdraw((receiveId, 35)));

        var row = Assert.Single(await db.Available());
        Assert.Equal(100, row.received_quantity);
        Assert.Equal(65, row.available_quantity);
        Assert.Equal(db.CentralId, row.source_department_id);
    }
}
