using System.Security.Claims;
using API.DTOs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace API.Controllers;

public class BuggyController : BaseApiController
{
    [AllowAnonymous] // ใช้ในหน้าทดสอบ error
    [HttpGet("unauthorized")]
    public IActionResult GetUnauthorized()
    {
        return Unauthorized();
    }

    [AllowAnonymous] // ใช้ในหน้าทดสอบ error
    [HttpGet("badrequest")]
    public IActionResult GetBadRequest()
    {
        return BadRequest("This is not a good request");
    }

    [AllowAnonymous] // ใช้ในหน้าทดสอบ error
    [HttpGet("notfound")]
    public IActionResult GetNotFound()
    {
        return NotFound();
    }

    [AllowAnonymous] // ใช้ในหน้าทดสอบ error
    [HttpGet("internalerror")]
    public IActionResult GetInternalError()
    {
        throw new Exception("This is a test exception");
    }

    [AllowAnonymous] // ใช้ในหน้าทดสอบ error
    [HttpPost("validationerror")]
    public IActionResult GetValidationError()
    {
        return Ok();
    }

    [Authorize]
    [HttpGet("secret")]
    public IActionResult GetSecret()
    {
        var name = User.FindFirst(ClaimTypes.Name)?.Value;
        var id = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;

        return Ok("Hello " + name + " with the id of " + id);
    }

    [Authorize(Roles = "Admin")]
    [HttpGet("admin-secret")]
    public IActionResult GetAdminSecret()
    {
        var name = User.FindFirst(ClaimTypes.Name)?.Value;
        var id = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        var isAdmin = User.IsInRole("Admin");
        var roles = User.FindFirstValue(ClaimTypes.Role);

        return Ok(new
        {
            name,
            id,
            isAdmin,
            roles
        });
    }
}