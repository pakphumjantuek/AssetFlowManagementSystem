using Microsoft.AspNetCore.Mvc;

namespace API.Controllers;

[AllowAnonymous] // ส่งหน้าเว็บ Angular
public class FallbackController : Controller
{
    public IActionResult Index()
    {
        return PhysicalFile(Path.Combine(Directory.GetCurrentDirectory(), "wwwroot", "myshop",
            "index.html"), "text/html");
    }
}