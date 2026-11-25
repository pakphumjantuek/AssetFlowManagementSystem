using Core.Interfaces;
using Core.Interfaces.Specifications;
using Microsoft.EntityFrameworkCore;
namespace API.Controllers;

public class DepartmentsController(IUnitOfWork unit, Infrastructure.StoreContext db, CentralDepartmentService central) : BaseApiController
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<Departments>>> GetDepartments([FromQuery] DepartmentsSpecParams departmentsParams)
    {
        var query = db.departments.AsNoTracking().Where(x => x.is_active);
        if (!string.IsNullOrWhiteSpace(departmentsParams.Search))
            query = query.Where(x => x.department_name.ToLower().Contains(departmentsParams.Search.ToLower()));
        var count = await query.CountAsync();
        var centralId = await central.GetIdAsync();
        var ordered = query.OrderBy(x => x.department_id == centralId ? 0 : 1);
        ordered = departmentsParams.Sort switch
        {
            "nameAsc" => ordered.ThenBy(x => x.department_name).ThenBy(x => x.department_id),
            "nameDesc" => ordered.ThenByDescending(x => x.department_name).ThenBy(x => x.department_id),
            "idDesc" or "latest" => ordered.ThenByDescending(x => x.department_id),
            _ => ordered.ThenBy(x => x.department_id)
        };
        var data = await ordered.Skip(departmentsParams.PageSize * (departmentsParams.PageIndex - 1))
            .Take(departmentsParams.PageSize).ToListAsync();
        return Ok(new Pagination<Departments>(departmentsParams.PageIndex,
            departmentsParams.PageSize, count, data));
    }


    [HttpGet("{id}")]
    public async Task<ActionResult<Departments>> GetDepartment(int id)
    {
        var department = await unit.Repository<Departments>().GetByIdAsync(id);

        if (department == null) return NotFound();
        return department;
    }

    //[Authorize(Roles = "Admin")]
    [HttpPost]
    public async Task<ActionResult<Departments>> CreateDepartment(Departments department)
    {
        department.is_active = true;
        department.updated_at = null;
        unit.Repository<Departments>().Add(department);

        if (await unit.Complete())
        {
            return CreatedAtAction("GetDepartment", new { id = department.department_id }, department);
        }
        ;

        return BadRequest("Problem creating department");
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> UpdateDepartment(int id, Departments department)
    {
        if (id != department.department_id)
            return BadRequest("Cannot update this department");

        var existingDepartment = await unit.Repository<Departments>().GetByIdAsync(id);

        if (existingDepartment == null)
            return NotFound("Department not found");

        existingDepartment.department_name = department.department_name;
        existingDepartment.is_active = department.is_active;
        existingDepartment.updated_at = DateTime.Now;

        if (await unit.Complete())
            return NoContent();

        return BadRequest("Problem updating the department");
    }

    //[Authorize(Roles = "Admin")]
    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteDepartment(int id)
    {
        var department = await unit.Repository<Departments>().GetByIdAsync(id);

        if (department == null) return NotFound();

        department.is_active = false;
        department.updated_at = DateTime.UtcNow;

        unit.Repository<Departments>().Update(department);

        if (await unit.Complete())
        {
            return NoContent();
        }

        return BadRequest("Problem deleting department");
    }

    private bool DepartmentExists(int id)
    {
        return unit.Repository<Departments>().GetByIdAsync(id).Result != null;
    }
}
