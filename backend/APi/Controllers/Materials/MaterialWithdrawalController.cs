using APi.DTOs;
using API.RequestHelpers;
using AutoMapper;
using Core.Entities;
using Core.Interfaces;
using Core.Interfaces.Specifications.MaterialWithdrawal;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace API.Controllers;

public class MaterialWithdrawalController(IUnitOfWork unit, IMapper mapper, Infrastructure.StoreContext db) : BaseApiController
{
    [HttpGet]
    public async Task<ActionResult<Pagination<MaterialWithdrawalDto>>> GetMaterialWithdrawals(
        [FromQuery] MaterialWithdrawalSpecParams specParams
    )
    {
        var spec = new MaterialWithdrawalSpecification(specParams);
        var items = await unit.Repository<MaterialWithdrawal>().ListAsync(spec);
        var totalItems = await unit.Repository<MaterialWithdrawal>().CountAsync(spec);
        var data = mapper.Map<List<MaterialWithdrawalDto>>(items);
        await FillItemSummaries(data);

        return Ok(
            new Pagination<MaterialWithdrawalDto>(
                specParams.PageIndex,
                specParams.PageSize,
                totalItems,
                data
            )
        );
    }

    [HttpGet("by-procurement/{procurementRecordId:int}")]
    public async Task<ActionResult<Pagination<MaterialWithdrawalDto>>> GetMaterialWithdrawalsByProcurement(
        int procurementRecordId,
        [FromQuery] MaterialWithdrawalSpecParams specParams
    )
    {
        var spec = new MaterialWithdrawalSpecification(specParams, procurementRecordId);
        var items = await unit.Repository<MaterialWithdrawal>().ListAsync(spec);
        var totalItems = await unit.Repository<MaterialWithdrawal>().CountAsync(spec);
        var data = mapper.Map<List<MaterialWithdrawalDto>>(items);
        await FillItemSummaries(data);

        return Ok(
            new Pagination<MaterialWithdrawalDto>(
                specParams.PageIndex,
                specParams.PageSize,
                totalItems,
                data
            )
        );
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<MaterialWithdrawalDto>> GetMaterialWithdrawal(int id)
    {
        var materialWithdrawal = await unit.Repository<MaterialWithdrawal>().GetByIdAsync(id);

        if (materialWithdrawal == null || !materialWithdrawal.is_active)
        {
            return NotFound();
        }

        var result = mapper.Map<MaterialWithdrawalDto>(materialWithdrawal);
        await FillItemSummaries(new List<MaterialWithdrawalDto> { result });
        return Ok(result);
    }

    [HttpPost]
    public async Task<ActionResult<MaterialWithdrawalDto>> CreateMaterialWithdrawal(
        MaterialWithdrawalCreateDto dto
    )
    {
        var materialWithdrawal = mapper.Map<MaterialWithdrawal>(dto);

        var count = await unit.Repository<MaterialWithdrawal>().CountAsync(
            new MaterialWithdrawalSpecification(
                new MaterialWithdrawalSpecParams { PageIndex = 1, PageSize = int.MaxValue },
                dto.procurement_record_id
            )
        );

        materialWithdrawal.withdrawal_document_no = (count + 1).ToString();
        materialWithdrawal.is_active = true;
        materialWithdrawal.created_at = DateTime.UtcNow;

        unit.Repository<MaterialWithdrawal>().Add(materialWithdrawal);

        if (await unit.Complete())
        {
            return CreatedAtAction(
                nameof(GetMaterialWithdrawal),
                new { id = materialWithdrawal.material_withdrawal_id },
                mapper.Map<MaterialWithdrawalDto>(materialWithdrawal)
            );
        }

        return BadRequest("Problem creating material withdrawal");
    }

    [HttpPut("{id:int}")]
    public async Task<IActionResult> UpdateMaterialWithdrawal(int id, MaterialWithdrawalCreateDto dto)
    {
        if (await db.materialStockCards.AnyAsync(x => x.is_active &&
            x.material_withdrawal_id == id))
            return Conflict("ใบเบิกนี้มีการตัดสต็อกแล้ว ยังไม่รองรับการแก้ไข");

        var existing = await unit.Repository<MaterialWithdrawal>().GetByIdAsync(id);

        if (existing == null || !existing.is_active)
        {
            return NotFound();
        }

        mapper.Map(dto, existing);
        existing.updated_at = DateTime.UtcNow;

        if (await unit.Complete())
        {
            return NoContent();
        }

        return BadRequest("Problem updating material withdrawal");
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> DeleteMaterialWithdrawal(int id)
    {
        if (await db.materialStockCards.AnyAsync(x => x.is_active &&
            x.material_withdrawal_id == id))
            return Conflict("ใบเบิกนี้มีการตัดสต็อกแล้ว ยังไม่รองรับการลบ");

        var existing = await unit.Repository<MaterialWithdrawal>().GetByIdAsync(id);

        if (existing == null || !existing.is_active)
        {
            return NotFound();
        }

        existing.is_active = false;
        existing.updated_at = DateTime.UtcNow;
        unit.Repository<MaterialWithdrawal>().Update(existing);

        if (await unit.Complete())
        {
            return NoContent();
        }

        return BadRequest("Problem deleting material withdrawal");
    }

    private async Task FillItemSummaries(List<MaterialWithdrawalDto> withdrawals)
    {
        if (withdrawals.Count == 0) return;
        var withdrawalIds = withdrawals.Select(x => x.material_withdrawal_id).ToList();
        var cards = await db.materialStockCards.AsNoTracking()
            .Where(x => x.is_active && x.material_withdrawal_id.HasValue && withdrawalIds.Contains(x.material_withdrawal_id.Value))
            .ToListAsync();
        var ids = cards.Select(x => x.material_item_id).Distinct().ToList();
        var names = await db.materialItems.AsNoTracking()
            .Where(x => ids.Contains(x.material_item_id))
            .ToDictionaryAsync(x => x.material_item_id, x => x.material_name);
        var procurementIds = withdrawals.Select(x => x.procurement_record_id).Distinct().ToList();
        var documentWithdrawals = await db.materialWithdrawals.AsNoTracking()
            .Where(x => procurementIds.Contains(x.procurement_record_id))
            .OrderBy(x => x.created_at).ThenBy(x => x.material_withdrawal_id)
            .Select(x => new { x.procurement_record_id, x.material_withdrawal_id })
            .ToListAsync();
        var withdrawalNumbers = documentWithdrawals.GroupBy(x => x.procurement_record_id)
            .SelectMany(g => g.Select((x, index) => new { x.material_withdrawal_id, number = index + 1 }))
            .ToDictionary(x => x.material_withdrawal_id, x => x.number);
        var procurementRecords = await db.procurement_records.AsNoTracking()
            .Where(x => procurementIds.Contains(x.procurement_record_id))
            .ToDictionaryAsync(x => x.procurement_record_id);
        foreach (var withdrawal in withdrawals)
        {
            withdrawal.withdrawal_number = withdrawalNumbers[withdrawal.material_withdrawal_id];
            var withdrawalCards = cards.Where(x => x.material_withdrawal_id == withdrawal.material_withdrawal_id &&
                x.department_id == procurementRecords.GetValueOrDefault(withdrawal.procurement_record_id)?.department_id).ToList();
            if (withdrawalCards.Any())
            {
                withdrawal.withdrawal_date = withdrawalCards.First().transaction_date;
            }
            withdrawal.material_receive_id = procurementRecords.GetValueOrDefault(
                withdrawal.procurement_record_id)?.document_no ?? withdrawal.material_receive_id;
            withdrawal.items_summary = string.Join(", ", withdrawalCards
                .GroupBy(x => x.material_item_id)
                .Where(g => g.Sum(x => x.quantity_out - x.quantity_in) > 0)
                .Select(g => $"{names.GetValueOrDefault(g.Key) ?? "วัสดุ"} {g.Sum(x => x.quantity_out - x.quantity_in):0.##}"));
        }
    }
}

