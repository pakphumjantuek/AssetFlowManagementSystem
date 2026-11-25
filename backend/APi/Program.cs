global using System.ComponentModel.DataAnnotations;
global using APi.DTOs;
global using API.Helpers;
global using API.Middleware;
global using API.RequestHelpers;
global using API.Services;
global using AutoMapper;
global using Core.Entities;
global using Core.Interfaces;
global using Infrastructure;
global using Infrastructure.Data;
global using Microsoft.AspNetCore.Authorization;
global using Microsoft.AspNetCore.Mvc;
global using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Identity;
using QuestPDF.Drawing;

var builder = WebApplication.CreateBuilder(args);


// ทุก controller ต้องล็อกอิน ยกเว้นที่ติด [AllowAnonymous] (หน้า public portal, สถานะล็อกอิน)
builder.Services.AddControllers(options =>
    options.Filters.Add(new Microsoft.AspNetCore.Mvc.Authorization.AuthorizeFilter()));
builder.Services.AddSwaggerGen();
builder.Services.AddScoped<FileService>();
builder.Services.AddScoped<CentralDepartmentService>();
builder.Services.AddScoped<API.Services.MaterialStockService>();

builder.Services.AddDbContext<StoreContext>(opt =>
{
    opt.UseSqlServer(builder.Configuration.GetConnectionString("DefaultConnection"));
});

builder.Services.AddCors();
builder.Services.AddAuthentication();
builder.Services.AddAuthorization();
builder.Services.AddIdentityApiEndpoints<AppUser>()
    .AddRoles<IdentityRole>()
    .AddEntityFrameworkStores<StoreContext>();

builder.Services.AddScoped(typeof(IGenericRepository<>), typeof(GenericRepository<>));
builder.Services.AddScoped<IUnitOfWork, UnitOfWork>();
builder.Services.AddSignalR();

builder.Services.AddAutoMapper(cfg =>
{
    cfg.AddProfile<MappingProfiles>();
});

var fontFolder = Path.Combine(
    builder.Environment.ContentRootPath,
    "Fonts"
);

var regularFontPath = Path.Combine(
    fontFolder,
    "THSarabunNew.ttf"
);

if (File.Exists(regularFontPath))
{
    FontManager.RegisterFont(
        File.OpenRead(regularFontPath)
    );
}
foreach (var fontName in new[] { "THSarabunNew Bold.ttf", "THSarabunNew Italic.ttf", "THSarabunNew BoldItalic.ttf" })
{
    var fontPath = Path.Combine(fontFolder, fontName);
    if (File.Exists(fontPath))
    {
        using var fontStream = File.OpenRead(fontPath);
        FontManager.RegisterFont(fontStream);
    }
}

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment() || app.Configuration.GetValue<bool>("Swagger:Enabled"))
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseHttpsRedirection();
app.UseMiddleware<ExceptionMiddleware>();

app.UseCors(x => x
    .AllowAnyHeader()
    .AllowAnyMethod()
    .AllowCredentials()
    .WithOrigins("http://localhost:4200", "https://localhost:4200"));

app.UseAuthentication();
app.UseAuthorization();
app.UseDefaultFiles();
app.UseStaticFiles(new StaticFileOptions
{
    OnPrepareResponse = ctx =>
    {
        if (string.Equals(ctx.File.Name, "index.html", StringComparison.OrdinalIgnoreCase))
            ctx.Context.Response.Headers.CacheControl = "no-cache, no-store, must-revalidate";
    }
});

app.MapControllers();
//app.UseStaticFiles();


app.MapGroup("api").MapIdentityApi<AppUser>();
// SPA fallback: เส้นทางของ Angular (เช่น /admin/projects) ที่ไม่ใช่ไฟล์หรือ API ให้ส่ง index.html
// ไม่ครอบคลุม /api/** เพราะ MapControllers/MapIdentityApi match ก่อน
app.MapFallbackToFile("index.html", new StaticFileOptions
{
    OnPrepareResponse = ctx =>
        ctx.Context.Response.Headers.CacheControl = "no-cache, no-store, must-revalidate"
});

try
{
    using var scope = app.Services.CreateScope();
    var services = scope.ServiceProvider;
    var context = services.GetRequiredService<StoreContext>();
    var userManager = services.GetRequiredService<UserManager<AppUser>>();
    await context.Database.MigrateAsync();
    // Admin accounts are read from configuration (user-secrets / environment), not source code:
    //   SeedAdmins:0:Email, SeedAdmins:0:Password, ...
    var seedAdmins = app.Configuration.GetSection("SeedAdmins").Get<List<SeedAdmin>>() ?? new List<SeedAdmin>();
    if (seedAdmins.Count == 0)
        app.Logger.LogWarning("No SeedAdmins configured; skipping admin user seeding");
    await StoreContextSeed.SeedAsync(context, userManager, seedAdmins);
}
catch (Exception e)
{
    // Don't crash the host (HTTP 500.30) when the DB is unreachable or a migration fails;
    // keep the app up so swagger/diagnostics still work.
    app.Logger.LogError(e, "Database migration/seed failed during startup");
}

app.Run();
