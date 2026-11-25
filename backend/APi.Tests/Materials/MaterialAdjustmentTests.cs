using Microsoft.AspNetCore.Mvc;

namespace APi.Tests.Materials;

/// <summary>การแก้ไขย้อนหลัง: ปรับ/ยกเลิกใบเบิก และปรับจำนวนรับเข้า</summary>
public class MaterialAdjustmentTests : IAsyncLifetime
{
    private readonly MaterialTestDb db = new();
    public Task InitializeAsync() => db.InitializeAsync();
    public Task DisposeAsync() => db.DisposeAsync();

    // ---------- 4. ปรับ / ยกเลิกใบเบิก ----------

    [Fact]
    public async Task Cancel_withdrawal_returns_stock_to_central()
    {
        var receiveId = await db.ReceiveOk(100);
        var withdrawalId = await db.WithdrawOk(receiveId, 30);

        Assert.IsType<NoContentResult>(await db.CancelWithdrawal(withdrawalId));

        var stock = await db.Stock(db.CurrentYearId);
        Assert.Equal(100, stock.Central);
        Assert.Equal(0, stock.Branch);
        Assert.Equal(100, stock.Balance);
        Assert.Equal("cancelled", await db.WithdrawalStatus(withdrawalId));
        Assert.Equal(100, Assert.Single(await db.Available()).available_quantity);
    }

    [Fact]
    public async Task Cannot_cancel_twice()
    {
        var receiveId = await db.ReceiveOk(100);
        var withdrawalId = await db.WithdrawOk(receiveId, 30);
        Assert.IsType<NoContentResult>(await db.CancelWithdrawal(withdrawalId));

        Assert.IsType<ConflictObjectResult>(await db.CancelWithdrawal(withdrawalId));
        Assert.Equal(100, (await db.Stock(db.CurrentYearId)).Central);
    }

    [Fact]
    public async Task Cannot_cancel_after_branch_issued_from_it()
    {
        var receiveId = await db.ReceiveOk(100);
        var withdrawalId = await db.WithdrawOk(receiveId, 30);
        Assert.IsAssignableFrom<CreatedAtActionResult>(await db.IssueFromBranch(5));

        Assert.IsType<ConflictObjectResult>(await db.CancelWithdrawal(withdrawalId));

        var stock = await db.Stock(db.CurrentYearId);
        Assert.Equal(70, stock.Central);
        Assert.Equal(25, stock.Branch);
        Assert.NotEqual("cancelled", await db.WithdrawalStatus(withdrawalId));
    }

    [Fact]
    public async Task Reduce_withdrawal_moves_difference_back_to_central()
    {
        var receiveId = await db.ReceiveOk(100);
        var withdrawalId = await db.WithdrawOk(receiveId, 30);

        Assert.IsType<NoContentResult>(await db.AdjustWithdrawal(withdrawalId, receiveId, 20));

        var stock = await db.Stock(db.CurrentYearId);
        Assert.Equal(80, stock.Central);
        Assert.Equal(20, stock.Branch);
        Assert.Equal(100, stock.Balance);
        Assert.False(stock.HasDiscrepancy);
        Assert.Equal(80, Assert.Single(await db.Available()).available_quantity);
    }

    [Fact]
    public async Task Increase_withdrawal_takes_more_from_central()
    {
        var receiveId = await db.ReceiveOk(100);
        var withdrawalId = await db.WithdrawOk(receiveId, 30);

        Assert.IsType<NoContentResult>(await db.AdjustWithdrawal(withdrawalId, receiveId, 50));

        var stock = await db.Stock(db.CurrentYearId);
        Assert.Equal(50, stock.Central);
        Assert.Equal(50, stock.Branch);
    }

    [Fact]
    public async Task Cannot_increase_withdrawal_beyond_central_stock()
    {
        var receiveId = await db.ReceiveOk(100);
        var withdrawalId = await db.WithdrawOk(receiveId, 30);

        Assert.IsType<ConflictObjectResult>(await db.AdjustWithdrawal(withdrawalId, receiveId, 101));

        var stock = await db.Stock(db.CurrentYearId);
        Assert.Equal(70, stock.Central);
        Assert.Equal(30, stock.Branch);
    }

    [Fact]
    public async Task Cannot_reduce_withdrawal_below_what_branch_already_used()
    {
        var receiveId = await db.ReceiveOk(100);
        var withdrawalId = await db.WithdrawOk(receiveId, 30);
        Assert.IsAssignableFrom<CreatedAtActionResult>(await db.IssueFromBranch(25)); // สาขาเหลือ 5

        // ลด 30 → 20 ต้องดึงคืน 10 แต่สาขาเหลือแค่ 5
        Assert.IsType<ConflictObjectResult>(await db.AdjustWithdrawal(withdrawalId, receiveId, 20));

        var stock = await db.Stock(db.CurrentYearId);
        Assert.Equal(70, stock.Central);
        Assert.Equal(5, stock.Branch);
    }

    // ---------- 5. ปรับจำนวนรับเข้า ----------

    [Fact]
    public async Task Increase_received_quantity()
    {
        var receiveId = await db.ReceiveOk(100);

        Assert.IsType<NoContentResult>(await db.AdjustReceive(receiveId, 120, expected: 100));

        Assert.Equal(120, await db.ReceivedQuantity(receiveId));
        var stock = await db.Stock(db.CurrentYearId);
        Assert.Equal(120, stock.Central);
        Assert.False(stock.HasDiscrepancy);
    }

    [Fact]
    public async Task Reduce_received_quantity_when_nothing_withdrawn()
    {
        var receiveId = await db.ReceiveOk(100);

        Assert.IsType<NoContentResult>(await db.AdjustReceive(receiveId, 80, expected: 100));

        Assert.Equal(80, (await db.Stock(db.CurrentYearId)).Central);
    }

    [Fact]
    public async Task Cannot_reduce_received_below_already_withdrawn()
    {
        var receiveId = await db.ReceiveOk(100);
        await db.WithdrawOk(receiveId, 30);

        Assert.IsType<ConflictObjectResult>(await db.AdjustReceive(receiveId, 29, expected: 100));

        Assert.Equal(100, await db.ReceivedQuantity(receiveId));
        Assert.Equal(70, (await db.Stock(db.CurrentYearId)).Central);
    }

    [Fact]
    public async Task Can_reduce_received_to_exactly_withdrawn()
    {
        var receiveId = await db.ReceiveOk(100);
        await db.WithdrawOk(receiveId, 30);

        Assert.IsType<NoContentResult>(await db.AdjustReceive(receiveId, 30, expected: 100));

        var stock = await db.Stock(db.CurrentYearId);
        Assert.Equal(0, stock.Central);
        Assert.Equal(30, stock.Branch);
        Assert.Equal(0, Assert.Single(await db.Available()).available_quantity);
    }

    [Fact]
    public async Task Adjust_receive_rejects_stale_expected_quantity()
    {
        var receiveId = await db.ReceiveOk(100);

        // หน้าจอของผู้ใช้ยังเห็นค่าเก่า 90 ขณะที่ในระบบเป็น 100 แล้ว
        Assert.IsType<ConflictObjectResult>(await db.AdjustReceive(receiveId, 120, expected: 90));
        Assert.Equal(100, await db.ReceivedQuantity(receiveId));
    }

    [Theory]
    [InlineData(0, "เหตุผล")]
    [InlineData(1.555, "เหตุผล")]
    [InlineData(50, "  ")]
    public async Task Adjust_receive_validates_input(double quantity, string reason)
    {
        var receiveId = await db.ReceiveOk(100);

        Assert.IsType<BadRequestObjectResult>(await db.AdjustReceive(receiveId, (decimal)quantity, 100, reason));
        Assert.Equal(100, await db.ReceivedQuantity(receiveId));
    }
}
