
using Core.Interfaces.Specifications.AssetSubItem;


namespace API.Controllers;

public class AssetsubItemController(IUnitOfWork unit, IMapper mapper) : BaseApiController
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<AssetSubItem>>> GetAssetSubItems([FromQuery] AssetSubItemSpecParams assetSubItemParams)
    {
        var spec = new AssetSubItemSpecification(assetSubItemParams);

        var assetSubItems = await unit.Repository<AssetSubItem>().ListAsync(spec);
         
        var countSpec = new AssetSubItemForCountSpecification(assetSubItemParams);    
        var totalItems = await unit.Repository<AssetSubItem>()
            .CountAsync(countSpec);

        var data = mapper.Map<List<AssetSubItemDto>>(assetSubItems);

        return Ok(new Pagination<AssetSubItemDto>(
            assetSubItemParams.PageIndex,
            assetSubItemParams.PageSize,
            totalItems,
            data
        ));
    }

    [HttpGet("by-assetitem/{asset_id}")]
    public async Task<ActionResult<Pagination<AssetSubItemDto>>> GetAssetSubItemsByAssetId(
      int asset_id,
      [FromQuery] AssetSubItemSpecParams assetSubItemParams)
    {
        assetSubItemParams.Asset_id = asset_id;
        var spec = new AssetSubItemSpecification(assetSubItemParams);

        var assetSubItems = await unit.Repository<AssetSubItem>().ListAsync(spec);

        var countSpec = new AssetSubItemForCountSpecification(assetSubItemParams);

        var totalItems = await unit.Repository<AssetSubItem>()
            .CountAsync(countSpec);

        var data = mapper.Map<List<AssetSubItemDto>>(assetSubItems);

        return Ok(new Pagination<AssetSubItemDto>(
            assetSubItemParams.PageIndex,
            assetSubItemParams.PageSize,
            totalItems,
            data
        ));
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<AssetSubItem>> GetAssetSubItem(int id)
    {
        var assetSubItem = await unit.Repository<AssetSubItem>().GetByIdAsync(id);

        if (assetSubItem == null) return NotFound();
        return assetSubItem;
    }

    [HttpPost]
    public async Task<ActionResult<AssetSubItemCreateDto>> CreateAssetSubItem(
         AssetSubItemCreateDto dto)
        {
        var siblings = (await unit.Repository<AssetSubItem>().ListAllAsync())
            .Where(x => x.is_active && x.asset_id == dto.asset_id).ToList();
        var parentDisposed = (await unit.Repository<AssetDisposalDocument>().ListAllAsync())
            .Any(x => x.is_active && x.asset_id == dto.asset_id && x.asset_sub_item_id == null);
        if (parentDisposed || (siblings.Count > 0 && siblings.All(x => x.status == "จำหน่ายแล้ว")))
            return Conflict("ไม่สามารถเพิ่มรายการย่อยในชุดที่จำหน่ายแล้ว");
        if (dto.status == "จำหน่ายแล้ว") return BadRequest("กรุณาจำหน่ายผ่านการอัปโหลดเอกสาร");
        var assetSubItem = mapper.Map<AssetSubItem>(dto);

        assetSubItem.is_active = true;

        unit.Repository<AssetSubItem>().Add(assetSubItem);
        if (await unit.Complete())
        {
            await SyncProcurementTotalAsync(assetSubItem.asset_id);
            return CreatedAtAction(
                nameof(GetAssetSubItem),
                new { id = assetSubItem.asset_sub_item_id },
                assetSubItem
            );
        }

        return BadRequest("Problem creating project");
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> UpdateAssetSubItem(int id, AssetSubItemCreateDto dto)
    {
        if (id != dto.asset_sub_item_id)
            return BadRequest("Cannot update this asset sub item");

        var existingAssetSubItem = await unit.Repository<AssetSubItem>().GetByIdAsync(id);

        if (existingAssetSubItem == null)
            return NotFound("Asset sub item not found");
        if (existingAssetSubItem.asset_id != dto.asset_id)
            return Conflict("ไม่สามารถย้ายครุภัณฑ์ย่อยไปชุดอื่นผ่านการแก้ไข");

        if (dto.status != null && dto.status != existingAssetSubItem.status &&
            (dto.status == "จำหน่ายแล้ว" || existingAssetSubItem.status == "จำหน่ายแล้ว"))
            return Conflict("การเปลี่ยนสถานะจำหน่ายต้องใช้ขั้นตอนเอกสารจำหน่าย");
        if (existingAssetSubItem.status == "จำหน่ายแล้ว" && dto.quantity != existingAssetSubItem.quantity)
            return Conflict("ไม่สามารถเปลี่ยนจำนวนของรายการจำหน่ายแล้ว");
        var savedStatus = existingAssetSubItem.status;
        mapper.Map(dto, existingAssetSubItem);
        if (dto.status == null) existingAssetSubItem.status = savedStatus;

        existingAssetSubItem.updated_at = DateTime.Now;
        if (await unit.Complete())
        {
            await SyncProcurementTotalAsync(existingAssetSubItem.asset_id);
            return NoContent();
        }

        return BadRequest("Problem updating the asset sub item");
    }

    //[Authorize(Roles = "Admin")]
    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteAssetSubItem(int id)
    {
        var assetSubItem = await unit.Repository<AssetSubItem>().GetByIdAsync(id);

        if (assetSubItem == null) return NotFound();
        if (assetSubItem.status == "จำหน่ายแล้ว") return Conflict("รายการจำหน่ายแล้วต้องเก็บไว้ตรวจย้อนหลัง");
        assetSubItem.is_active = false;
        assetSubItem.updated_at = DateTime.UtcNow;

        unit.Repository<AssetSubItem>().Update(assetSubItem);

        if (await unit.Complete())
        {
            await SyncProcurementTotalAsync(assetSubItem.asset_id);
            return NoContent();
        }

        return BadRequest("Problem deleting asset sub item");
    }

    // ยอดรวมของใบจัดซื้อ = ผลรวมครุภัณฑ์ย่อยทุกชุดในใบนั้น (เหมือนตอน create-with-assets)
    private async Task SyncProcurementTotalAsync(int assetId)
    {
        var asset = await unit.Repository<AssetItem>().GetByIdAsync(assetId);
        if (asset?.procurement_record_id == null) return;

        var procurement = await unit.Repository<Procurement_records>().GetByIdAsync(asset.procurement_record_id.Value);
        if (procurement == null) return;

        var assetIds = (await unit.Repository<AssetItem>().ListAllAsync())
            .Where(x => x.procurement_record_id == procurement.procurement_record_id)
            .Select(x => x.asset_id)
            .ToHashSet();
        var total = (await unit.Repository<AssetSubItem>().ListAllAsync())
            .Where(x => x.is_active && assetIds.Contains(x.asset_id))
            .Sum(x => x.quantity * (x.unit_price ?? 0));

        procurement.total_amount = total;
        procurement.amount_text = ThaiBahtTextConverter.ToThaiBahtText(total);
        unit.Repository<Procurement_records>().Update(procurement);
        await unit.Complete();
    }

    [HttpPost("{id}/dispose")]
    public IActionResult DisposeAssetSubItem(int id, AssetSubItemDisposalDto dto)
        => Conflict("กรุณาจำหน่ายผ่านการอัปโหลดเอกสารจำหน่าย");

    [HttpGet("{id}/disposal")]
    public async Task<ActionResult<AssetSubItemDisposalDto>> GetAssetSubItemDisposal(int id)
    {
        var spec = new Core.Specifications.BaseSpecification<AssetSubItemDisposal>(x => x.asset_sub_item_id == id);
        var disposal = await unit.Repository<AssetSubItemDisposal>().GetEntityWithSpec(spec);

        if (disposal == null) return NotFound("Disposal record not found for this sub item");

        return mapper.Map<AssetSubItemDisposalDto>(disposal);
    }
}
