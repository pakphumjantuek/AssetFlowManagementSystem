using System.Data;
using System.Security.Claims;
using Core.Entities;
using Infrastructure;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace API.Controllers;

[ApiController, Authorize, Route("api/AssetDisposal")]
public class AssetDisposalController(StoreContext db, IWebHostEnvironment env) : ControllerBase
{
    public sealed class UploadRequest
    {
        public IFormFile? file { get; set; }
        public DateTime disposal_date { get; set; }
        public int? asset_sub_item_id { get; set; }
        public string? document_no { get; set; }
        public string? notes { get; set; }
    }

    [HttpGet("summary")]
    public async Task<IActionResult> Summary([FromQuery] int? procurement_record_id, [FromQuery] int? asset_id)
    {
        var assets = await db.assetItems.AsNoTracking().Where(x => x.is_active &&
            (!procurement_record_id.HasValue || x.procurement_record_id == procurement_record_id) &&
            (!asset_id.HasValue || x.asset_id == asset_id)).Select(x => x.asset_id).ToListAsync();
        var children = await db.assetSubItems.AsNoTracking().Where(x => x.is_active && assets.Contains(x.asset_id)).ToListAsync();
        var disposedParents = await db.assetDisposalDocuments.AsNoTracking().Where(x => x.is_active &&
            assets.Contains(x.asset_id) && x.asset_sub_item_id == null).Select(x => x.asset_id).Distinct().ToListAsync();
        return Ok(assets.Select(id =>
        {
            var rows = children.Where(x => x.asset_id == id).ToList();
            var disposed = rows.Count(x => x.status == "จำหน่ายแล้ว");
            var status = rows.Count == 0 ? (disposedParents.Contains(id) ? "จำหน่ายแล้ว" : "ใช้งานอยู่")
                : disposed == rows.Count ? "จำหน่ายแล้ว" : disposed > 0 ? "จำหน่ายบางส่วน" : "ใช้งานอยู่";
            return new { asset_id = id, status, disposed_count = disposed, sub_item_count = rows.Count,
                disposal_status = status == "จำหน่ายบางส่วน" ? $"{status} ({disposed}/{rows.Count})" : status };
        }));
    }

    [HttpGet("{assetId:int}/documents")]
    public async Task<IActionResult> Documents(int assetId, [FromQuery] int? asset_sub_item_id)
    {
        var childDocumentIds = asset_sub_item_id.HasValue
            ? await db.assetSubItemDisposals.AsNoTracking().Where(x => x.is_active &&
                x.asset_sub_item_id == asset_sub_item_id.Value && x.document_no != null && x.document_no.StartsWith("DISPOSAL-DOC:"))
                .Select(x => x.document_no).ToListAsync() : [];
        return Ok(await db.assetDisposalDocuments.AsNoTracking().Where(x => x.is_active && x.asset_id == assetId &&
            (!asset_sub_item_id.HasValue || x.asset_sub_item_id == asset_sub_item_id ||
                childDocumentIds.Contains("DISPOSAL-DOC:" + x.disposal_document_id)))
            .OrderByDescending(x => x.created_at).Select(x => new { x.disposal_document_id, x.asset_sub_item_id,
                x.disposal_date, x.document_no, x.notes, x.original_filename, x.actor_id, x.created_at, x.affected_count }).ToListAsync());
    }

    [HttpPost("{assetId:int}/documents"), RequestSizeLimit(11 * 1024 * 1024)]
    public async Task<IActionResult> Upload(int assetId, [FromForm] UploadRequest request)
    {
        var file = request.file;
        if (file == null || file.Length == 0 || file.Length > 10 * 1024 * 1024)
            return BadRequest("กรุณาเลือกเอกสารขนาดไม่เกิน 10 MB");
        if (request.disposal_date == default || request.document_no?.Length > 200 || request.notes?.Length > 1000)
            return BadRequest("กรุณาระบุวันที่และตรวจสอบความยาวเลขเอกสาร/หมายเหตุ");
        var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
        var mime = ext switch { ".pdf" => "application/pdf", ".png" => "image/png", ".jpg" or ".jpeg" => "image/jpeg", _ => null };
        if (mime == null) return BadRequest("รองรับ PDF, JPG และ PNG เท่านั้น");
        if (Path.GetFileName(file.FileName).Length > 255) return BadRequest("ชื่อไฟล์ยาวเกิน 255 ตัวอักษร");
        await using (var input = file.OpenReadStream())
        {
            var header = new byte[8];
            var read = await input.ReadAsync(header);
            var valid = ext == ".pdf" ? read >= 5 && System.Text.Encoding.ASCII.GetString(header, 0, 5) == "%PDF-"
                : ext == ".png" ? read == 8 && header.SequenceEqual(new byte[] { 137,80,78,71,13,10,26,10 })
                : read >= 3 && header[0] == 255 && header[1] == 216 && header[2] == 255;
            if (!valid) return BadRequest("เนื้อหาไฟล์ไม่ตรงกับชนิดเอกสาร");
        }
        var folder = Path.Combine(env.ContentRootPath, "App_Data", "asset-disposals");
        var filename = Guid.NewGuid().ToString("N") + ext;
        var path = Path.Combine(folder, filename);
        var committed = false;
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
        try
        {
            var asset = await db.assetItems.FirstOrDefaultAsync(x => x.asset_id == assetId && x.is_active);
            if (asset == null) return NotFound("ไม่พบครุภัณฑ์");
            var children = await db.assetSubItems.Where(x => x.asset_id == assetId && x.is_active).ToListAsync();
            var target = request.asset_sub_item_id.HasValue
                ? children.Where(x => x.asset_sub_item_id == request.asset_sub_item_id).ToList() : children;
            if (request.asset_sub_item_id.HasValue && target.Count == 0) return BadRequest("ครุภัณฑ์ย่อยไม่อยู่ในชุดนี้");
            target = target.Where(x => x.status != "จำหน่ายแล้ว").ToList();
            if ((children.Count > 0 || request.asset_sub_item_id.HasValue) && target.Count == 0)
                return Conflict("รายการที่เลือกจำหน่ายแล้ว กรุณาโหลดข้อมูลใหม่");
            if (children.Count == 0 && await db.assetDisposalDocuments.AnyAsync(x => x.is_active && x.asset_id == assetId && x.asset_sub_item_id == null))
                return Conflict("ครุภัณฑ์นี้จำหน่ายแล้ว");
            Directory.CreateDirectory(folder);
            await using (var output = new FileStream(path, FileMode.CreateNew)) await file.CopyToAsync(output);
            var now = DateTime.UtcNow;
            var document = new AssetDisposalDocument { asset_id = assetId, asset_sub_item_id = request.asset_sub_item_id,
                disposal_date = request.disposal_date.Date, document_no = request.document_no?.Trim(), notes = request.notes?.Trim(),
                stored_filename = filename, original_filename = Path.GetFileName(file.FileName), content_type = mime,
                actor_id = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.Identity?.Name, affected_count = target.Count,
                is_active = true, created_at = now };
            db.assetDisposalDocuments.Add(document);
            await db.SaveChangesAsync();
            foreach (var child in target)
            {
                child.status = "จำหน่ายแล้ว";
                child.updated_at = now;
                db.assetSubItemDisposals.Add(new AssetSubItemDisposal { asset_sub_item_id = child.asset_sub_item_id,
                    disposal_date = document.disposal_date, disposal_method = "อ้างอิงเอกสารจำหน่าย",
                    document_no = "DISPOSAL-DOC:" + document.disposal_document_id, notes = document.notes,
                    quantity_disposed = child.quantity, is_active = true, created_at = now });
            }
            asset.updated_at = now;
            await db.SaveChangesAsync();
            await transaction.CommitAsync();
            committed = true;
            return Ok(new { document.disposal_document_id, document.affected_count });
        }
        finally
        {
            if (!committed && System.IO.File.Exists(path)) System.IO.File.Delete(path);
        }
    }

    [HttpGet("documents/{id:int}/file")]
    public async Task<IActionResult> Download(int id)
    {
        var doc = await db.assetDisposalDocuments.AsNoTracking().FirstOrDefaultAsync(x => x.is_active && x.disposal_document_id == id);
        if (doc == null) return NotFound();
        var path = Path.Combine(env.ContentRootPath, "App_Data", "asset-disposals", Path.GetFileName(doc.stored_filename));
        if (!System.IO.File.Exists(path)) return NotFound("ไม่พบไฟล์เอกสาร");
        return PhysicalFile(path, doc.content_type, doc.original_filename);
    }
}
