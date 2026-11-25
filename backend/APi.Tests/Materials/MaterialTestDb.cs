using System.Text.Json;
using API.Controllers;
using API.Helpers;
using API.Services;
using APi.DTOs;
using AutoMapper;
using Core.Entities;
using Infrastructure;
using Infrastructure.Data;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;

namespace APi.Tests.Materials;

/// <summary>
/// ฐานข้อมูลทดสอบบน LocalDB สร้างใหม่ทุก test และลบทิ้งเมื่อจบ (ไม่แตะฐานข้อมูลจริง)
/// ปิดการตรวจ foreign key เพื่อไม่ต้อง seed ตารางที่ไม่เกี่ยวกับวัสดุ (ร้านค้า โครงการ ฯลฯ)
/// </summary>
public sealed class MaterialTestDb : IAsyncLifetime
{
    // ค่าเริ่มต้นใช้ LocalDB ในเครื่อง; บน CI ตั้ง TEST_SQL_SERVER เป็น connection string ของ SQL Server (ไม่ต้องใส่ Database)
    private readonly string connectionString =
        (Environment.GetEnvironmentVariable("TEST_SQL_SERVER")
            ?? "Server=(localdb)\\MSSQLLocalDB;Trusted_Connection=True;TrustServerCertificate=True")
        + $";Database=AssetFlow_Test_{Guid.NewGuid():N}";

    private static readonly IMapper Mapper = new MapperConfiguration(
        cfg => cfg.AddProfile<MappingProfiles>(), NullLoggerFactory.Instance).CreateMapper();

    public int CentralId { get; private set; }
    public int BranchId { get; private set; }
    public int BranchStaffId { get; private set; }
    public int CurrentYearId { get; private set; }
    public int PreviousYearId { get; private set; }
    public int ProcurementId { get; private set; }
    public int MaterialId { get; private set; }

    public StoreContext NewContext() =>
        new(new DbContextOptionsBuilder<StoreContext>().UseSqlServer(connectionString).Options);

    public async Task InitializeAsync()
    {
        await using var db = NewContext();
        await db.Database.EnsureDeletedAsync();
        await db.Database.EnsureCreatedAsync();
        await db.Database.ExecuteSqlRawAsync("""
            DECLARE @sql nvarchar(max) = N'';
            SELECT @sql += N'ALTER TABLE ' + QUOTENAME(SCHEMA_NAME(schema_id)) + N'.' + QUOTENAME(name) + N' NOCHECK CONSTRAINT ALL;'
            FROM sys.tables;
            EXEC sp_executesql @sql;
            """);

        var today = DateTime.UtcNow.Date;
        var previousYear = new Fiscal_years { fiscal_year = 2569, year_name = "2569", is_active = true,
            start_date = today.AddYears(-1).AddDays(-30), end_date = today.AddDays(-31) };
        var currentYear = new Fiscal_years { fiscal_year = 2570, year_name = "2570", is_active = true,
            start_date = today.AddDays(-30), end_date = today.AddYears(1).AddDays(-31) };
        var central = new Departments { department_name = "ส่วนกลางพัสดุ", is_active = true };
        var branch = new Departments { department_name = "สาขา ก", is_active = true };
        db.AddRange(previousYear, currentYear, central, branch);
        await db.SaveChangesAsync();

        db.system_settings.Add(new SystemSetting { project_name = "test", logo_path = "",
            central_department_id = central.department_id, is_active = true });
        var staff = new Staffs { first_name = "สมชาย", last_name = "ใจดี",
            department_id = branch.department_id, is_active = true };
        var unitOfMeasure = new MaterialUnit { unit_name = "รีม", is_active = true };
        db.AddRange(staff, unitOfMeasure);
        await db.SaveChangesAsync();

        var material = new MaterialItem { material_code = "M-001", material_name = "กระดาษ A4",
            unit_id = unitOfMeasure.unit_id, unit_price = 120, is_active = true };
        var record = new Procurement_records { document_no = "PR-001", decree_document_no = "DC-001",
            status = "approved", fiscal_year_id = currentYear.fiscal_year_id,
            department_id = central.department_id, is_active = true };
        db.AddRange(material, record);
        await db.SaveChangesAsync();

        (CentralId, BranchId, BranchStaffId) = (central.department_id, branch.department_id, staff.staff_id);
        (CurrentYearId, PreviousYearId) = (currentYear.fiscal_year_id, previousYear.fiscal_year_id);
        (ProcurementId, MaterialId) = (record.procurement_record_id, material.material_item_id);
    }

    public async Task DisposeAsync()
    {
        await using var db = NewContext();
        await db.Database.EnsureDeletedAsync();
    }

    // ---------- ขั้นตอนของระบบ เรียกผ่าน controller จริง ----------

    public async Task<IActionResult> Receive(decimal quantity, decimal unitPrice = 120)
    {
        await using var db = NewContext();
        var controller = new MaterialReceiveDetailController(new UnitOfWork(db), Mapper, db,
            new CentralDepartmentService(db), new MaterialStockService(db));
        var result = await controller.CreateMaterialReceiveDetail(new MaterialReceiveDetailDto
        {
            procurement_record_id = ProcurementId, material_item_id = MaterialId,
            quantity = quantity, unit_price = unitPrice,
        });
        return result.Result!;
    }

    public async Task<int> ReceiveOk(decimal quantity)
    {
        var result = Assert.IsType<CreatedAtActionResult>(await Receive(quantity));
        return ((MaterialReceiveDetailDto)result.Value!).receive_detail_id;
    }

    public async Task<IActionResult> Withdraw(params (int receiveDetailId, decimal quantity)[] items)
    {
        await using var db = NewContext();
        var controller = new MaterialWithdrawalItemsController(db, new MaterialStockService(db));
        return await controller.Create(new MaterialWithdrawalItemsController.WithdrawalRequest(
            ProcurementId, BranchStaffId, null, null, null, null,
            items.Select(x => new MaterialWithdrawalItemsController.WithdrawalItem(
                x.receiveDetailId, MaterialId, x.quantity)).ToList()));
    }

    public async Task<int> WithdrawOk(int receiveDetailId, decimal quantity)
    {
        var ok = Assert.IsType<OkObjectResult>(await Withdraw((receiveDetailId, quantity)));
        return JsonSerializer.SerializeToElement(ok.Value).GetProperty("material_withdrawal_id").GetInt32();
    }

    private static ControllerContext Anonymous() => new() { HttpContext = new DefaultHttpContext() };

    public async Task<IActionResult> AdjustReceive(int receiveDetailId, decimal quantity, decimal expected,
        string reason = "นับจำนวนใหม่")
    {
        await using var db = NewContext();
        var controller = new MaterialReceiveQuantityAdjustmentController(db) { ControllerContext = Anonymous() };
        return await controller.AdjustQuantity(receiveDetailId,
            new MaterialReceiveQuantityAdjustmentController.AdjustRequest(quantity, expected, reason, null));
    }

    public async Task<IActionResult> AdjustWithdrawal(int withdrawalId, int receiveDetailId, decimal quantity)
    {
        await using var db = NewContext();
        var controller = new MaterialWithdrawalAdjustmentController(db, new MaterialStockService(db)) { ControllerContext = Anonymous() };
        return await controller.Adjust(withdrawalId, new MaterialWithdrawalAdjustmentController.AdjustmentRequest(
            [new MaterialWithdrawalAdjustmentController.AdjustmentItem(receiveDetailId, MaterialId, quantity)],
            "แก้จำนวน"));
    }

    public async Task<IActionResult> CancelWithdrawal(int withdrawalId)
    {
        await using var db = NewContext();
        var controller = new MaterialWithdrawalAdjustmentController(db, new MaterialStockService(db)) { ControllerContext = Anonymous() };
        return await controller.Cancel(withdrawalId, new MaterialWithdrawalAdjustmentController.CancelRequest("เบิกผิด"));
    }

    public async Task<string?> WithdrawalStatus(int withdrawalId)
    {
        await using var db = NewContext();
        return (await db.materialWithdrawals.FindAsync(withdrawalId))?.stock_status;
    }

    public async Task<decimal> ReceivedQuantity(int receiveDetailId)
    {
        await using var db = NewContext();
        return (await db.materialReceiveDetails.FindAsync(receiveDetailId))!.quantity;
    }

    public async Task<List<MaterialWithdrawalItemsController.AvailableItem>> Available()
    {
        await using var db = NewContext();
        var result = await new MaterialWithdrawalItemsController(db, new MaterialStockService(db)).Available(ProcurementId);
        return result.Value ?? (List<MaterialWithdrawalItemsController.AvailableItem>)
            ((OkObjectResult)result.Result!).Value!;
    }

    public async Task<IActionResult> IssueFromBranch(decimal quantity)
    {
        await using var db = NewContext();
        var controller = new MaterialIssueDetailController(new UnitOfWork(db), Mapper, new MaterialStockService(db));
        var result = await controller.CreateMaterialIssueDetail(new MaterialIssueDetailDto
        {
            department_id = BranchId, material_item_id = MaterialId,
            staff_id = BranchStaffId, quantity = quantity, unit_price = 120,
        });
        return result.Result!;
    }

    /// <summary>รายงานวัสดุคงเหลือ (แถวของวัสดุทดสอบ)</summary>
    public async Task<StockRow> Stock(int? fiscalYearId = null)
    {
        await using var db = NewContext();
        var controller = new MaterialItemController(new UnitOfWork(db), Mapper, new CentralDepartmentService(db), new MaterialStockService(db));
        var ok = Assert.IsType<OkObjectResult>(await controller.GetFacultyStock(fiscalYearId, MaterialId, null));
        var json = JsonSerializer.SerializeToElement(ok.Value).GetProperty("items")[0];
        decimal Dept(int id) => json.GetProperty("departments").EnumerateArray()
            .First(x => x.GetProperty("department_id").GetInt32() == id)
            .GetProperty("current_balance").GetDecimal();
        return new StockRow(
            json.GetProperty("opening_balance").GetDecimal(),
            json.GetProperty("quantity_in").GetDecimal(),
            json.GetProperty("quantity_out").GetDecimal(),
            json.GetProperty("current_balance").GetDecimal(),
            Dept(CentralId), Dept(BranchId),
            json.GetProperty("has_discrepancy").GetBoolean());
    }

    public async Task<int> StockCardCount()
    {
        await using var db = NewContext();
        return await db.materialStockCards.CountAsync(x => x.is_active);
    }

    /// <summary>เลื่อนวันที่ของรายการเคลื่อนไหวทั้งหมดไปอยู่ในปีงบก่อนหน้า</summary>
    public async Task MoveAllCardsToPreviousYear()
    {
        await using var db = NewContext();
        var previous = await db.Set<Fiscal_years>().FindAsync(PreviousYearId);
        foreach (var card in db.materialStockCards)
        {
            card.transaction_date = previous!.start_date.AddDays(10);
            card.fiscal_year_id = PreviousYearId;
        }
        await db.SaveChangesAsync();
    }
}

public sealed record StockRow(decimal Opening, decimal Received, decimal Issued, decimal Balance,
    decimal Central, decimal Branch, bool HasDiscrepancy);
