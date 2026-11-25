using Core.Entities;
using Microsoft.AspNetCore.Identity;

namespace Infrastructure.Data;

public record SeedAdmin(string Email, string Password);

public class StoreContextSeed
{
    public static async Task SeedAsync(
        StoreContext context,
        UserManager<AppUser> userManager,
        IEnumerable<SeedAdmin>? admins = null)
    {
        // =========================
        // Seed Admin Users
        // =========================

        // Admin accounts come from configuration (SeedAdmins), never from source code.
        foreach (var admin in admins ?? Enumerable.Empty<SeedAdmin>())
        {
            var existingUser = await userManager.FindByEmailAsync(admin.Email);

            if (existingUser == null)
            {
                var user = new AppUser
                {
                    UserName = admin.Email,
                    Email = admin.Email
                };

                var result = await userManager.CreateAsync(
                    user,
                    admin.Password
                );

                if (result.Succeeded)
                {
                    await userManager.AddToRoleAsync(user, "Admin");
                }
                else
                {
                    foreach (var error in result.Errors)
                    {
                        Console.WriteLine(
                            $"{admin.Email}: {error.Description}"
                        );
                    }
                }
            }
        }

        // =========================
        // Seed System Setting
        // =========================

        if (!context.system_settings.Any())
        {
            context.system_settings.Add(new SystemSetting
            {
                project_name = "ระบบบริหารพัสดุ",
                logo_path = "/institute-Logo.png",
                is_active = true,
                created_at = DateTime.UtcNow
            });

            await context.SaveChangesAsync();
        }
    }
}