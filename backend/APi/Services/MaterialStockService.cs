namespace API.Services;

/// <summary>
/// ตรรกะยอดคงเหลือวัสดุที่ใช้ร่วมกันหลาย controller (รับเข้า / จ่ายออก)
/// ใช้ StoreContext ตัวเดียวกับ UnitOfWork ของ request นั้น การแก้ไขจึงถูกบันทึกพร้อม unit.Complete()
/// </summary>
public class MaterialStockService(StoreContext db)
{
    /// <summary>stock card ที่ใช้งานอยู่ ให้กรองต่อในฐานข้อมูล แทนการดึงทั้งตารางมากรองใน C#</summary>
    public IQueryable<MaterialStockCard> ActiveCards() => db.materialStockCards.Where(x => x.is_active);

    private IQueryable<MaterialStockCard> Cards(int materialItemId, int? departmentId) =>
        db.materialStockCards.Where(x =>
            x.is_active && x.material_item_id == materialItemId && x.department_id == departmentId);

    /// <summary>ยอดคงเหลือของวัสดุในหน่วยงาน (รับเข้า − จ่ายออก)</summary>
    public async Task<decimal> GetBalanceAsync(int materialItemId, int? departmentId) =>
        await Cards(materialItemId, departmentId).AsNoTracking()
            .SumAsync(x => x.quantity_in - x.quantity_out);

    /// <summary>ราคาต่อหน่วยล่าสุดในหน่วยงาน ถ้าไม่มีหรือเป็น 0 ใช้ค่า fallback</summary>
    public async Task<decimal> GetLatestUnitPriceAsync(int materialItemId, int? departmentId, decimal fallback)
    {
        var price = await Cards(materialItemId, departmentId).AsNoTracking()
            .OrderByDescending(x => x.transaction_date).ThenByDescending(x => x.stock_card_id)
            .Select(x => x.unit_price).FirstOrDefaultAsync();
        return price == 0 ? fallback : price;
    }

    /// <summary>คำนวณยอดยกไป (balance_qty) ของทุก stock card ในหน่วยงานใหม่ตามลำดับเวลา</summary>
    public async Task RecalculateBalancesAsync(int materialItemId, int? departmentId)
    {
        var cards = await Cards(materialItemId, departmentId)
            .OrderBy(x => x.transaction_date).ThenBy(x => x.stock_card_id).ToListAsync();
        decimal balance = 0;
        var now = DateTime.UtcNow;
        foreach (var card in cards)
        {
            balance += card.quantity_in - card.quantity_out;
            card.balance_qty = balance;
            card.total_amount = balance * card.unit_price;
            card.updated_at = now;
        }
    }

    /// <summary>อัปเดตยอดสรุปบนตัววัสดุ (รับรวม จ่ายรวม ราคาล่าสุด มูลค่าคงเหลือ) จาก stock card</summary>
    public async Task SyncMaterialItemAsync(int materialItemId)
    {
        var material = await db.materialItems.FindAsync(materialItemId);
        if (material == null) return;

        var cards = await db.materialStockCards.AsNoTracking()
            .Where(x => x.is_active && x.material_item_id == materialItemId)
            .OrderBy(x => x.transaction_date).ThenBy(x => x.stock_card_id).ToListAsync();
        // stock card ที่แก้ใน context นี้แต่ยังไม่ได้ save ต้องใช้ค่าล่าสุด
        var tracked = db.ChangeTracker.Entries<MaterialStockCard>()
            .ToDictionary(x => x.Entity.stock_card_id, x => x.Entity);
        cards = cards.Select(x => tracked.GetValueOrDefault(x.stock_card_id) ?? x).ToList();

        var balance = cards.GroupBy(x => x.department_id)
            .Sum(g => g.OrderByDescending(x => x.transaction_date)
                .ThenByDescending(x => x.stock_card_id).First().balance_qty);

        material.quantity_in = cards.Sum(x => x.quantity_in);
        material.quantity_out = cards.Sum(x => x.quantity_out);
        material.unit_price = cards.LastOrDefault()?.unit_price ?? material.unit_price;
        material.total_amount = balance * (material.unit_price ?? 0);
        material.updated_at = DateTime.UtcNow;
    }
}
