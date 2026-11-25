using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Core.Entities;

public class MaterialReceiveAdjustment
{
    [Key]
    public int adjustment_id { get; set; }
    public int receive_detail_id { get; set; }
    [Column(TypeName = "decimal(18,2)")]
    public decimal old_quantity { get; set; }
    [Column(TypeName = "decimal(18,2)")]
    public decimal new_quantity { get; set; }
    public string reason { get; set; } = string.Empty;
    public string? actor_id { get; set; }
    public DateTime created_at { get; set; } = DateTime.UtcNow;
}
