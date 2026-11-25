using System.ComponentModel.DataAnnotations;

namespace Core.Entities;

public class MaterialWithdrawalRevision
{
    [Key]
    public int revision_id { get; set; }
    public int material_withdrawal_id { get; set; }
    public string action { get; set; } = string.Empty;
    public string reason { get; set; } = string.Empty;
    public string? actor_id { get; set; }
    public DateTime created_at { get; set; } = DateTime.UtcNow;
    public string before_items_json { get; set; } = string.Empty;
    public string after_items_json { get; set; } = string.Empty;
}
