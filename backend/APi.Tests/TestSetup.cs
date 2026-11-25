using System.Runtime.CompilerServices;
using QuestPDF.Drawing;

namespace APi.Tests;

internal static class TestSetup
{
    /// <summary>
    /// ลงทะเบียนฟอนต์ TH Sarabun New จาก APi/Fonts แบบเดียวกับ Program.cs
    /// ให้ test สร้าง PDF ได้บนเครื่องที่ไม่ได้ติดตั้งฟอนต์ (เช่น GitHub Actions)
    /// </summary>
    [ModuleInitializer]
    internal static void RegisterFonts()
    {
        var folder = Path.Combine(AppContext.BaseDirectory, "Fonts");
        if (!Directory.Exists(folder)) return;
        foreach (var path in Directory.GetFiles(folder, "*.ttf"))
        {
            using var stream = File.OpenRead(path);
            FontManager.RegisterFont(stream);
        }
    }
}
