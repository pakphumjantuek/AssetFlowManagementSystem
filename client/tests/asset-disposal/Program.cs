using System.Security.Claims;
using System.Text;
using System.Text.Json;
using API.Controllers;
using Core.Entities;
using Infrastructure;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.FileProviders;

var folder = Path.Combine(Path.GetTempPath(), "asset-disposal-check-" + Guid.NewGuid().ToString("N"));
Directory.CreateDirectory(folder);
try
{
    await using var connection = new SqliteConnection("Data Source=:memory:");
    await connection.OpenAsync();
    await using var db = new StoreContext(new DbContextOptionsBuilder<StoreContext>().UseSqlite(connection).Options);
    await db.Database.EnsureCreatedAsync();
    var category = new AssetCategory { category_name = "ทดสอบ", is_active = true };
    var unit = new MaterialUnit { unit_name = "ชิ้น", is_active = true };
    var set = new AssetItem { asset_name = "ชุดทดสอบ", is_active = true, receive_date = DateTime.Today };
    var emptySet = new AssetItem { asset_name = "ไม่มีรายการย่อย", is_active = true, receive_date = DateTime.Today };
    db.AddRange(category, unit, set, emptySet);
    await db.SaveChangesAsync();
    var children = Enumerable.Range(1, 3).Select(i => new AssetSubItem { asset_id = set.asset_id,
        sub_item_name = "ชิ้น " + i, asset_category_id = category.asset_category_id, unit_id = unit.unit_id,
        status = "ปกติ", quantity = 1, is_active = true }).ToList();
    db.assetSubItems.AddRange(children);
    await db.SaveChangesAsync();
    var controller = new AssetDisposalController(db, new TestEnvironment { ContentRootPath = folder });
    controller.ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext { User =
        new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, "tester")], "test")) } };
    JsonElement Value(IActionResult result) => JsonSerializer.SerializeToElement(((OkObjectResult)result).Value);
    async Task<string> Status(int id) => Value(await controller.Summary(null, id))[0].GetProperty("status").GetString()!;
    void Check(bool valid, string message) { if (!valid) throw new Exception(message); }
    AssetDisposalController.UploadRequest Request(int? subId = null, string name = "proof.pdf", string contents = "%PDF-1.4\nfixture") => new() {
        asset_sub_item_id = subId, disposal_date = DateTime.Today, document_no = "DOC-1", notes = "ทดสอบ",
        file = new FormFile(new MemoryStream(Encoding.UTF8.GetBytes(contents)), 0, Encoding.UTF8.GetByteCount(contents), "file", name) };

    Check(await Status(set.asset_id) == "ใช้งานอยู่", "Initial status");
    Check(await controller.Upload(set.asset_id, Request(children[0].asset_sub_item_id, contents: "invalid")) is BadRequestObjectResult, "Reject spoofed PDF");
    Check(await db.assetDisposalDocuments.CountAsync() == 0 && await Status(set.asset_id) == "ใช้งานอยู่", "Invalid file changes no state");
    Check(await controller.Upload(set.asset_id, Request(99999)) is BadRequestObjectResult, "Reject foreign sub-item");
    var first = Value(await controller.Upload(set.asset_id, Request(children[0].asset_sub_item_id))).GetProperty("disposal_document_id").GetInt32();
    Check(await Status(set.asset_id) == "จำหน่ายบางส่วน", "Partial status");
    Check(Value(await controller.Documents(set.asset_id, children[0].asset_sub_item_id)).GetArrayLength() == 1, "Child document lookup");
    Check(await controller.Download(first) is PhysicalFileResult, "Authenticated download");
    Check(await controller.Upload(set.asset_id, Request(children[0].asset_sub_item_id)) is ConflictObjectResult, "Prevent double disposal");
    var whole = Value(await controller.Upload(set.asset_id, Request()));
    Check(whole.GetProperty("affected_count").GetInt32() == 2, "Whole set affects remaining children only");
    Check(await Status(set.asset_id) == "จำหน่ายแล้ว", "Complete status");
    Check(await db.assetSubItemDisposals.CountAsync() == 3, "History once per child");
    Check(Value(await controller.Documents(set.asset_id, children[0].asset_sub_item_id))[0].GetProperty("disposal_document_id").GetInt32() == first, "Preserve earlier child evidence");
    Check(Value(await controller.Documents(set.asset_id, children[1].asset_sub_item_id)).GetArrayLength() == 1, "Child inherits whole-set document");
    Check(await controller.Upload(set.asset_id, Request()) is ConflictObjectResult, "Reject repeated whole set");
    Check(await controller.Upload(emptySet.asset_id, Request()) is OkObjectResult && await Status(emptySet.asset_id) == "จำหน่ายแล้ว", "No-child asset disposal");
    Check((await db.assetDisposalDocuments.FirstAsync()).actor_id == "tester", "Audit actor stored");
    Console.WriteLine("PASS: validation, partial/all/no-child disposal, preserved evidence, inherited evidence, duplicates, download and audit");

    // Force a failure after file writing: evidence and status must both roll back.
    var failSet = new AssetItem { asset_name = "rollback", is_active = true, receive_date = DateTime.Today };
    db.assetItems.Add(failSet); await db.SaveChangesAsync();
    var fileCount = Directory.GetFiles(Path.Combine(folder, "App_Data", "asset-disposals")).Length;
    await db.Database.ExecuteSqlRawAsync("CREATE TRIGGER reject_disposal BEFORE INSERT ON assetDisposalDocuments BEGIN SELECT RAISE(ABORT, 'fixture failure'); END;");
    try { await controller.Upload(failSet.asset_id, Request()); throw new Exception("Expected failure"); }
    catch (DbUpdateException) { }
    db.ChangeTracker.Clear();
    Check(await Status(failSet.asset_id) == "ใช้งานอยู่", "Failed save changes no status");
    Check(Directory.GetFiles(Path.Combine(folder, "App_Data", "asset-disposals")).Length == fileCount, "Failed save cleans uploaded file");
    Console.WriteLine("PASS: failed database save rolls back status and removes file");
    await db.Database.ExecuteSqlRawAsync("DROP TRIGGER reject_disposal;");
    var failChild = new AssetSubItem { asset_id = failSet.asset_id, sub_item_name = "rollback child", asset_category_id = category.asset_category_id,
        unit_id = unit.unit_id, status = "ปกติ", quantity = 1, is_active = true };
    db.assetSubItems.Add(failChild); await db.SaveChangesAsync();
    var documentCount = await db.assetDisposalDocuments.CountAsync();
    await db.Database.ExecuteSqlRawAsync("CREATE TRIGGER reject_history BEFORE INSERT ON assetSubItemDisposals BEGIN SELECT RAISE(ABORT, 'fixture failure'); END;");
    try { await controller.Upload(failSet.asset_id, Request()); throw new Exception("Expected history failure"); }
    catch (DbUpdateException) { }
    db.ChangeTracker.Clear();
    Check(await Status(failSet.asset_id) == "ใช้งานอยู่" && await db.assetDisposalDocuments.CountAsync() == documentCount, "Status and evidence roll back together after second save fails");
    Check(Directory.GetFiles(Path.Combine(folder, "App_Data", "asset-disposals")).Length == fileCount, "Second save failure cleans file");
    Console.WriteLine("PASS: failure while writing history rolls back child status, document and file");
}
finally { Directory.Delete(folder, true); }

sealed class TestEnvironment : IWebHostEnvironment
{
    public string ApplicationName { get; set; } = "test";
    public string EnvironmentName { get; set; } = "test";
    public string ContentRootPath { get; set; } = "";
    public string WebRootPath { get; set; } = "";
    public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    public IFileProvider WebRootFileProvider { get; set; } = new NullFileProvider();
}
