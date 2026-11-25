using System.ComponentModel.DataAnnotations;

namespace Core.Entities;

public class AssetDisposalDocument : BaseEntity
{
    [Key] public int disposal_document_id { get; set; }
    public int asset_id { get; set; }
    public int? asset_sub_item_id { get; set; }
    public DateTime disposal_date { get; set; }
    [MaxLength(200)] public string? document_no { get; set; }
    [MaxLength(1000)] public string? notes { get; set; }
    [MaxLength(300)] public string stored_filename { get; set; } = "";
    [MaxLength(255)] public string original_filename { get; set; } = "";
    [MaxLength(100)] public string content_type { get; set; } = "";
    [MaxLength(450)] public string? actor_id { get; set; }
    public int affected_count { get; set; }
}
