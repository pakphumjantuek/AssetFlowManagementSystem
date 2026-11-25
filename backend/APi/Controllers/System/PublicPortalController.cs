namespace API.Controllers;

[AllowAnonymous] // หน้า public portal เปิดให้ทุกคนดูได้
// หมายเหตุ: ทุก endpoint กรองข้อมูลในฐานข้อมูลก่อนดึง (เดิมดึงทั้งตาราง) แล้วใช้ตรรกะเดิมต่อในหน่วยความจำ
// ทุก query เรียงตาม primary key เพื่อให้ลำดับผลลัพธ์คงที่เหมือนการอ่านทั้งตาราง
public class PublicPortalController(StoreContext db) : BaseApiController
{
    // ---------- ตัวช่วยดึงข้อมูลที่ผูกกับผู้เบิก / เอกสารจัดซื้อ ----------

    private Task<List<MaterialWithdrawal>> StaffMaterialWithdrawals(int staffId) =>
        db.materialWithdrawals.AsNoTracking().Where(x => x.is_active && x.staff_id == staffId)
            .OrderBy(x => x.material_withdrawal_id).ToListAsync();

    private Task<List<AssetWithdrawal>> StaffAssetWithdrawals(int staffId) =>
        db.assetWithdrawals.AsNoTracking().Where(x => x.is_active && x.staff_id == staffId)
            .OrderBy(x => x.procurement_withdrawal_id).ToListAsync();

    private Task<List<Procurement_records>> ProcurementsByIds(ICollection<int> ids) =>
        db.procurement_records.AsNoTracking().Where(x => ids.Contains(x.procurement_record_id))
            .OrderBy(x => x.procurement_record_id).ToListAsync();

    private Task<List<MaterialIssueDetail>> StaffMaterialIssues(int staffId) =>
        db.materialIssueDetails.AsNoTracking().Where(x => x.is_active && x.staff_id == staffId)
            .OrderBy(x => x.issue_detail_id).ToListAsync();

    /// <summary>stock card ที่เป็นการจ่ายออกของรายการเบิก (issue) ที่กำหนด</summary>
    private Task<List<MaterialStockCard>> StockOutsOfIssues(ICollection<int> issueIds) =>
        db.materialStockCards.AsNoTracking()
            .Where(x => x.is_active && x.quantity_out > 0 && x.issue_detail_id.HasValue &&
                issueIds.Contains(x.issue_detail_id.Value))
            .OrderBy(x => x.stock_card_id).ToListAsync();

    private Task<List<AssetItem>> AssetItemsOfProcurements(ICollection<int> procurementIds) =>
        db.assetItems.AsNoTracking()
            .Where(x => x.procurement_record_id.HasValue && procurementIds.Contains(x.procurement_record_id.Value))
            .OrderBy(x => x.asset_id).ToListAsync();

    private Task<List<AssetSubItem>> SubItemsOfAssets(ICollection<int> assetIds) =>
        db.assetSubItems.AsNoTracking().Where(x => assetIds.Contains(x.asset_id))
            .OrderBy(x => x.asset_sub_item_id).ToListAsync();

    private Task<List<HireDetail>> HireDetailsOfProcurements(ICollection<int> procurementIds) =>
        db.hireDetails.AsNoTracking().Where(x => procurementIds.Contains(x.procurement_record_id))
            .OrderBy(x => x.hire_detail_id).ToListAsync();

    /// <summary>ข้อมูลที่หน้ารายการเอกสารจัดซื้อของผู้เบิกใช้ (เฉพาะเอกสารที่ผู้เบิกเกี่ยวข้อง)</summary>
    private async Task<(List<Procurement_records> procurements, List<Departments> departments,
        List<Expense_types> expenseTypes, List<MaterialWithdrawal> materialWithdrawals,
        List<AssetWithdrawal> assetWithdrawals, List<MaterialIssueDetail> materialIssues,
        List<AssetItem> assetItems, List<AssetSubItem> assetSubItems, List<HireDetail> hireDetails)>
        LoadStaffProcurementData(int staffId)
    {
        var materialWithdrawals = await StaffMaterialWithdrawals(staffId);
        var assetWithdrawals = await StaffAssetWithdrawals(staffId);
        var procurementIds = materialWithdrawals.Select(x => x.procurement_record_id)
            .Concat(assetWithdrawals.Select(x => x.procurement_record_id)).Distinct().ToList();
        var procurements = await ProcurementsByIds(procurementIds);
        var materialIssues = await db.materialIssueDetails.AsNoTracking()
            .Where(x => x.staff_id == staffId && x.procurement_record_id.HasValue &&
                procurementIds.Contains(x.procurement_record_id.Value))
            .OrderBy(x => x.issue_detail_id).ToListAsync();
        var assetItems = await AssetItemsOfProcurements(procurementIds);
        var assetSubItems = await SubItemsOfAssets(assetItems.Select(x => x.asset_id).ToList());
        var hireDetails = await HireDetailsOfProcurements(procurementIds);
        return (procurements, await AllDepartments(), await AllExpenseTypes(), materialWithdrawals,
            assetWithdrawals, materialIssues, assetItems, assetSubItems, hireDetails);
    }

    /// <summary>ข้อมูลที่หน้ารายละเอียดเอกสารจัดซื้อใช้ (เฉพาะเอกสารเดียว)</summary>
    private async Task<(List<Procurement_records> procurements, List<Expense_types> expenseTypes,
        List<MaterialReceiveDetail> materialReceiveDetails, List<MaterialItem> materialItems,
        List<AssetWithdrawal> assetWithdrawals, List<AssetItem> assetItems, List<AssetSubItem> assetSubItems,
        List<HireDetail> hireDetails, List<MaterialWithdrawal> materialWithdrawals)>
        LoadProcurementDetailData(int procurementId)
    {
        int[] ids = [procurementId];
        var procurements = await ProcurementsByIds(ids);
        var receives = await db.materialReceiveDetails.AsNoTracking()
            .Where(x => x.procurement_record_id == procurementId)
            .OrderBy(x => x.receive_detail_id).ToListAsync();
        var materialIds = receives.Select(x => x.material_item_id).Distinct().ToList();
        var materialItems = await db.materialItems.AsNoTracking()
            .Where(x => materialIds.Contains(x.material_item_id))
            .OrderBy(x => x.material_item_id).ToListAsync();
        var assetWithdrawals = await db.assetWithdrawals.AsNoTracking()
            .Where(x => x.procurement_record_id == procurementId)
            .OrderBy(x => x.procurement_withdrawal_id).ToListAsync();
        var assetItems = await AssetItemsOfProcurements(ids);
        var assetSubItems = await SubItemsOfAssets(assetItems.Select(x => x.asset_id).ToList());
        var materialWithdrawals = await db.materialWithdrawals.AsNoTracking()
            .Where(x => x.procurement_record_id == procurementId)
            .OrderBy(x => x.material_withdrawal_id).ToListAsync();
        return (procurements, await AllExpenseTypes(), receives, materialItems, assetWithdrawals,
            assetItems, assetSubItems, await HireDetailsOfProcurements(ids), materialWithdrawals);
    }

    // ตารางอ้างอิงขนาดเล็ก ดึงทั้งตารางได้
    private Task<List<Departments>> AllDepartments() =>
        db.departments.AsNoTracking().OrderBy(x => x.department_id).ToListAsync();
    private Task<List<Prefixes>> AllPrefixes() =>
        db.prefixes.AsNoTracking().OrderBy(x => x.prefix_id).ToListAsync();
    private Task<List<Expense_types>> AllExpenseTypes() =>
        db.expense_types.AsNoTracking().OrderBy(x => x.expense_type_id).ToListAsync();
    private Task<List<Projects>> AllProjects() =>
        db.projects.AsNoTracking().OrderBy(x => x.project_id).ToListAsync();

    [HttpGet("staffs")]
    public async Task<ActionResult<IReadOnlyList<PublicPortalStaffLookupDto>>> GetStaffs(
        [FromQuery] string? search
    )
    {
        // หน้ารวมบุคลากรทั้งหมด ต้องใช้ข้อมูลทุกคน แต่ดึงเฉพาะแถวที่ใช้งานอยู่
        var staffs = await db.staffs.AsNoTracking().Where(x => x.is_active).OrderBy(x => x.staff_id).ToListAsync();
        var departments = await AllDepartments();
        var prefixes = await AllPrefixes();
        var procurements = await db.procurement_records.AsNoTracking().Where(x => x.is_active)
            .OrderBy(x => x.procurement_record_id).ToListAsync();
        var materialWithdrawals = await db.materialWithdrawals.AsNoTracking().Where(x => x.is_active)
            .OrderBy(x => x.material_withdrawal_id).ToListAsync();
        var materialIssues = await db.materialIssueDetails.AsNoTracking().Where(x => x.is_active && x.staff_id.HasValue)
            .OrderBy(x => x.issue_detail_id).ToListAsync();
        var stockCards = await db.materialStockCards.AsNoTracking()
            .Where(x => x.is_active && x.quantity_out > 0 && x.issue_detail_id.HasValue)
            .OrderBy(x => x.stock_card_id).ToListAsync();
        var assetWithdrawals = await db.assetWithdrawals.AsNoTracking().Where(x => x.is_active)
            .OrderBy(x => x.procurement_withdrawal_id).ToListAsync();

        var activeProcurements = procurements.Where(x => x.is_active).ToList();
        var activeMaterialWithdrawals = materialWithdrawals.Where(x => x.is_active).ToList();
        var activeMaterialIssues = materialIssues.Where(x => x.is_active).ToList();
        var activeMaterialStockOuts = stockCards
            .Where(x => x.is_active && IsStockOut(x) && x.quantity_out > 0)
            .ToList();
        var activeAssetWithdrawals = assetWithdrawals.Where(x => x.is_active).ToList();
        // เดิมวนหา issue ทุกตัวต่อ stock card ทุกใบ (ช้าเป็นกำลังสอง) ใช้ dictionary แทน ผลเหมือนเดิม
        var issueStaff = activeMaterialIssues
            .GroupBy(x => x.issue_detail_id)
            .ToDictionary(g => g.Key, g => g.Select(x => x.staff_id).ToHashSet());

        var data = staffs
            .Where(x => x.is_active)
            .Select(staff =>
            {
                var prefix = prefixes.FirstOrDefault(x => x.prefix_id == staff.prefix_id);
                var department = departments.FirstOrDefault(x => x.department_id == staff.department_id);

                var materialProcurementIds = activeMaterialWithdrawals
                    .Where(x => x.staff_id == staff.staff_id)
                    .Select(x => x.procurement_record_id);

                var assetProcurementIds = activeAssetWithdrawals
                    .Where(x => x.staff_id == staff.staff_id)
                    .Select(x => x.procurement_record_id);

                var projectCount = activeProcurements
                    .Where(x => materialProcurementIds.Contains(x.procurement_record_id) || assetProcurementIds.Contains(x.procurement_record_id))
                    .Select(x => x.project_id)
                    .Distinct()
                    .Count();

                return new PublicPortalStaffLookupDto
                {
                    staff_id = staff.staff_id,
                    full_name = $"{prefix?.prefix_name ?? ""}{staff.first_name} {staff.last_name}".Trim(),
                    department_name = department?.department_name,
                    project_count = projectCount,
                    material_withdrawal_count = activeMaterialWithdrawals.Count(x => x.staff_id == staff.staff_id) +
                        activeMaterialStockOuts.Count(x =>
                            x.issue_detail_id.HasValue &&
                            issueStaff.TryGetValue(x.issue_detail_id.Value, out var issueStaffIds) &&
                            issueStaffIds.Contains(staff.staff_id)
                        ),
                    asset_withdrawal_count = activeAssetWithdrawals.Count(x => x.staff_id == staff.staff_id)
                };
            })
            .Where(x =>
                string.IsNullOrWhiteSpace(search) ||
                x.full_name.Contains(search, StringComparison.OrdinalIgnoreCase) ||
                (x.department_name?.Contains(search, StringComparison.OrdinalIgnoreCase) ?? false)
            )
            .OrderBy(x => x.full_name)
            .ToList();

        return Ok(data);
    }

    [HttpGet("staffs/{staffId:int}/projects")]
    public async Task<ActionResult<IReadOnlyList<PublicPortalStaffProjectDto>>> GetProjectsByStaff(
        int staffId
    )
    {
        var projects = await AllProjects();
        var materialWithdrawals = await StaffMaterialWithdrawals(staffId);
        var assetWithdrawals = await StaffAssetWithdrawals(staffId);

        var materialProcurementIds = materialWithdrawals
            .Where(x => x.is_active && x.staff_id == staffId)
            .Select(x => x.procurement_record_id)
            .ToHashSet();

        var assetProcurementIds = assetWithdrawals
            .Where(x => x.is_active && x.staff_id == staffId)
            .Select(x => x.procurement_record_id)
            .ToHashSet();

        var procurements = await ProcurementsByIds(materialProcurementIds.Union(assetProcurementIds).ToList());

        var relatedProcurements = procurements
            .Where(x =>
                x.is_active &&
                (materialProcurementIds.Contains(x.procurement_record_id) || assetProcurementIds.Contains(x.procurement_record_id))
            )
            .ToList();

        var data = projects
            .Where(x => x.is_active)
            .Select(project =>
            {
                var projectProcurements = relatedProcurements
                    .Where(x => x.project_id == project.project_id)
                    .ToList();

                return new PublicPortalStaffProjectDto
                {
                    project_id = project.project_id,
                    project_code = project.project_code,
                    project_name = project.project_name,
                    project_budget_amount = project.project_budget_amount,
                    procurement_count = projectProcurements.Count,
                    material_withdrawal_count = projectProcurements.Count(x => materialProcurementIds.Contains(x.procurement_record_id)),
                    asset_withdrawal_count = projectProcurements.Count(x => assetProcurementIds.Contains(x.procurement_record_id))
                };
            })
            .Where(x => x.procurement_count > 0)
            .OrderBy(x => x.project_code)
            .ThenBy(x => x.project_name)
            .ToList();

        return Ok(data);
    }

    [HttpGet("staffs/{staffId:int}/fiscal-years")]
    public async Task<ActionResult<IReadOnlyList<PublicPortalFiscalYearDto>>> GetStaffFiscalYears(
        int staffId
    )
    {
        var fiscalYears = await db.fiscal_years.AsNoTracking().OrderBy(x => x.fiscal_year_id).ToListAsync();
        var materialWithdrawals = await StaffMaterialWithdrawals(staffId);
        var assetWithdrawals = await StaffAssetWithdrawals(staffId);
        var withdrawalProcurementIds = materialWithdrawals.Select(x => x.procurement_record_id)
            .Concat(assetWithdrawals.Select(x => x.procurement_record_id)).Distinct().ToList();
        var procurements = await db.procurement_records.AsNoTracking()
            .Where(x => withdrawalProcurementIds.Contains(x.procurement_record_id) || x.staff_id == staffId)
            .OrderBy(x => x.procurement_record_id).ToListAsync();
        var materialIssues = await StaffMaterialIssues(staffId);
        var stockCards = await StockOutsOfIssues(materialIssues.Select(x => x.issue_detail_id).ToList());

        var materialProcurementIds = materialWithdrawals
            .Where(x => x.is_active && x.staff_id == staffId)
            .Select(x => x.procurement_record_id);

        var assetProcurementIds = assetWithdrawals
            .Where(x => x.is_active && x.staff_id == staffId)
            .Select(x => x.procurement_record_id);

        var relatedProcurementIds = materialProcurementIds
            .Concat(assetProcurementIds)
            .Distinct()
            .ToHashSet();

        var relatedFiscalYearIds = procurements
            .Where(x => x.is_active &&
                (relatedProcurementIds.Contains(x.procurement_record_id) || x.staff_id == staffId))
            .Select(x => x.fiscal_year_id)
            .Concat(
                stockCards
                    .Where(stockCard =>
                        stockCard.is_active &&
                        IsStockOut(stockCard) &&
                        stockCard.quantity_out > 0 &&
                        stockCard.fiscal_year_id.HasValue &&
                        stockCard.issue_detail_id.HasValue &&
                        materialIssues.Any(issue =>
                            issue.is_active &&
                            issue.issue_detail_id == stockCard.issue_detail_id.Value &&
                            issue.staff_id == staffId
                        )
                    )
                    .Select(stockCard => stockCard.fiscal_year_id!.Value)
            )
            .Distinct()
            .ToHashSet();

        var data = fiscalYears
            .Where(x => x.is_active && relatedFiscalYearIds.Contains(x.fiscal_year_id))
            .OrderByDescending(x => x.fiscal_year)
            .Select(x => new PublicPortalFiscalYearDto
            {
                fiscal_year_id = x.fiscal_year_id,
                fiscal_year = x.fiscal_year,
                year_name = x.year_name
            })
            .ToList();

        return Ok(data);
    }

    [HttpGet("staffs/{staffId:int}/summary")]
    public async Task<ActionResult<PublicPortalStaffSummaryDto>> GetStaffSummary(
        int staffId,
        [FromQuery] int? fiscalYearId
    )
    {
        var staff = await db.staffs.AsNoTracking().FirstOrDefaultAsync(x => x.is_active && x.staff_id == staffId);
        if (staff == null)
        {
            return NotFound();
        }

        var departments = await AllDepartments();
        var prefixes = await AllPrefixes();
        var materialWithdrawals = await StaffMaterialWithdrawals(staffId);
        var assetWithdrawals = await StaffAssetWithdrawals(staffId);
        var procurements = await ProcurementsByIds(materialWithdrawals.Select(x => x.procurement_record_id)
            .Concat(assetWithdrawals.Select(x => x.procurement_record_id)).Distinct().ToList());
        var materialIssues = await StaffMaterialIssues(staffId);
        var stockCards = await StockOutsOfIssues(materialIssues.Select(x => x.issue_detail_id).ToList());
        var assetItems = await AssetItemsOfProcurements(procurements.Select(x => x.procurement_record_id).ToList());
        var assetSubItems = await SubItemsOfAssets(assetItems.Select(x => x.asset_id).ToList());

        var prefix = prefixes.FirstOrDefault(x => x.prefix_id == staff.prefix_id);
        var department = departments.FirstOrDefault(x => x.department_id == staff.department_id);

        var materialProcurementIds = materialWithdrawals
            .Where(x => x.is_active && x.staff_id == staffId)
            .Select(x => x.procurement_record_id)
            .ToHashSet();

        var relatedAssetWithdrawals = assetWithdrawals
            .Where(x => x.is_active && x.staff_id == staffId)
            .ToList();

        var assetProcurementIds = relatedAssetWithdrawals
            .Select(x => x.procurement_record_id)
            .ToHashSet();

        var relatedProcurementIds = materialProcurementIds
            .Concat(assetProcurementIds)
            .Distinct()
            .ToHashSet();

        var relatedProcurements = procurements
            .Where(x =>
                x.is_active &&
                relatedProcurementIds.Contains(x.procurement_record_id) &&
                (!fiscalYearId.HasValue || x.fiscal_year_id == fiscalYearId.Value)
            )
            .ToList();

        var filteredProcurementIds = relatedProcurements
            .Select(x => x.procurement_record_id)
            .ToHashSet();

        var filteredMaterialWithdrawals = materialWithdrawals
            .Where(x =>
                x.is_active &&
                x.staff_id == staffId &&
                filteredProcurementIds.Contains(x.procurement_record_id)
            )
            .ToList();

        var materialStockOutCount = stockCards.Count(stockCard =>
            stockCard.is_active &&
            IsStockOut(stockCard) &&
            stockCard.quantity_out > 0 &&
            (!fiscalYearId.HasValue || stockCard.fiscal_year_id == fiscalYearId.Value) &&
            stockCard.issue_detail_id.HasValue &&
            materialIssues.Any(issue =>
                issue.is_active &&
                issue.issue_detail_id == stockCard.issue_detail_id.Value &&
                issue.staff_id == staffId
            )
        );

        var filteredAssetWithdrawals = relatedAssetWithdrawals
            .Where(x => filteredProcurementIds.Contains(x.procurement_record_id))
            .ToList();

        var assetHoldingCount = relatedProcurements
            .SelectMany(procurement =>
            {
                var procurementAssetIds = assetItems
                    .Where(x => x.is_active && x.procurement_record_id == procurement.procurement_record_id)
                    .Select(x => x.asset_id)
                    .ToHashSet();

                return assetSubItems.Where(x => x.is_active && procurementAssetIds.Contains(x.asset_id));
            })
            .Count();

        return Ok(new PublicPortalStaffSummaryDto
        {
            staff_id = staff.staff_id,
            full_name = $"{prefix?.prefix_name ?? ""}{staff.first_name} {staff.last_name}".Trim(),
            department_name = department?.department_name,
            procurement_count = relatedProcurements.Count,
            project_count = relatedProcurements.Select(x => x.project_id).Distinct().Count(),
            material_withdrawal_count = filteredMaterialWithdrawals.Count + materialStockOutCount,
            asset_withdrawal_count = filteredAssetWithdrawals.Count,
            asset_holding_count = assetHoldingCount
        });
    }

    [HttpGet("projects")]
    public async Task<ActionResult<IReadOnlyList<PublicPortalProjectDto>>> GetProjects(
        [FromQuery] string? search
    )
    {
        // หน้ารวมโครงการทั้งหมด ต้องใช้ข้อมูลทุกโครงการ แต่ดึงเฉพาะแถวที่ใช้งานอยู่
        var projects = await db.projects.AsNoTracking().Where(x => x.is_active).OrderBy(x => x.project_id).ToListAsync();
        var procurements = await db.procurement_records.AsNoTracking().Where(x => x.is_active)
            .OrderBy(x => x.procurement_record_id).ToListAsync();
        var materialWithdrawals = await db.materialWithdrawals.AsNoTracking().Where(x => x.is_active)
            .OrderBy(x => x.material_withdrawal_id).ToListAsync();
        var assetWithdrawals = await db.assetWithdrawals.AsNoTracking().Where(x => x.is_active)
            .OrderBy(x => x.procurement_withdrawal_id).ToListAsync();

        var activeProjects = projects.Where(x => x.is_active);
        var activeProcurements = procurements.Where(x => x.is_active).ToList();
        var activeMaterialWithdrawals = materialWithdrawals.Where(x => x.is_active).ToList();
        var activeAssetWithdrawals = assetWithdrawals.Where(x => x.is_active).ToList();

        var data = activeProjects
            .Select(project =>
            {
                var projectProcurementIds = activeProcurements
                    .Where(x => x.project_id == project.project_id)
                    .Select(x => x.procurement_record_id)
                    .ToHashSet();

                var withdrawerIds = activeMaterialWithdrawals
                    .Where(x => projectProcurementIds.Contains(x.procurement_record_id))
                    .Select(x => x.staff_id)
                    .Concat(
                        activeAssetWithdrawals
                            .Where(x => projectProcurementIds.Contains(x.procurement_record_id))
                            .Select(x => x.staff_id)
                    )
                    .Distinct()
                    .Count();

                return new PublicPortalProjectDto
                {
                    project_id = project.project_id,
                    project_code = project.project_code,
                    project_name = project.project_name,
                    project_budget_amount = project.project_budget_amount,
                    procurement_count = projectProcurementIds.Count,
                    withdrawer_count = withdrawerIds
                };
            })
            .Where(x =>
                string.IsNullOrWhiteSpace(search) ||
                x.project_code.Contains(search, StringComparison.OrdinalIgnoreCase) ||
                x.project_name.Contains(search, StringComparison.OrdinalIgnoreCase)
            )
            .OrderBy(x => x.project_code)
            .ThenBy(x => x.project_name)
            .ToList();

        return Ok(data);
    }

    [HttpGet("projects/{projectId:int}/withdrawers")]
    public async Task<ActionResult<IReadOnlyList<PublicPortalWithdrawerDto>>> GetProjectWithdrawers(
        int projectId
    )
    {
        if (!await db.projects.AnyAsync(x => x.project_id == projectId && x.is_active))
        {
            return NotFound();
        }

        var procurements = await db.procurement_records.AsNoTracking().Where(x => x.project_id == projectId)
            .OrderBy(x => x.procurement_record_id).ToListAsync();
        var procurementIdList = procurements.Select(x => x.procurement_record_id).ToList();
        var materialWithdrawals = await db.materialWithdrawals.AsNoTracking()
            .Where(x => procurementIdList.Contains(x.procurement_record_id))
            .OrderBy(x => x.material_withdrawal_id).ToListAsync();
        var assetWithdrawals = await db.assetWithdrawals.AsNoTracking()
            .Where(x => procurementIdList.Contains(x.procurement_record_id))
            .OrderBy(x => x.procurement_withdrawal_id).ToListAsync();
        var staffIdList = materialWithdrawals.Select(x => x.staff_id)
            .Concat(assetWithdrawals.Select(x => x.staff_id)).Distinct().ToList();
        var staffs = await db.staffs.AsNoTracking().Where(x => staffIdList.Contains(x.staff_id))
            .OrderBy(x => x.staff_id).ToListAsync();
        var departments = await AllDepartments();
        var prefixes = await AllPrefixes();

        var projectProcurementIds = procurements
            .Where(x => x.is_active && x.project_id == projectId)
            .Select(x => x.procurement_record_id)
            .ToHashSet();

        var materialCounts = materialWithdrawals
            .Where(x => x.is_active && projectProcurementIds.Contains(x.procurement_record_id))
            .GroupBy(x => x.staff_id)
            .ToDictionary(x => x.Key, x => x.Count());

        var assetCounts = assetWithdrawals
            .Where(x => x.is_active && projectProcurementIds.Contains(x.procurement_record_id))
            .GroupBy(x => x.staff_id)
            .ToDictionary(x => x.Key, x => x.Count());

        var withdrawerIds = materialCounts.Keys
            .Concat(assetCounts.Keys)
            .Distinct()
            .ToHashSet();

        var data = staffs
            .Where(x => x.is_active && withdrawerIds.Contains(x.staff_id))
            .Select(staff =>
            {
                var prefix = prefixes.FirstOrDefault(x => x.prefix_id == staff.prefix_id);
                var department = departments.FirstOrDefault(x => x.department_id == staff.department_id);

                return new PublicPortalWithdrawerDto
                {
                    staff_id = staff.staff_id,
                    full_name = $"{prefix?.prefix_name ?? ""}{staff.first_name} {staff.last_name}".Trim(),
                    department_name = department?.department_name,
                    material_withdrawal_count = materialCounts.GetValueOrDefault(staff.staff_id, 0),
                    asset_withdrawal_count = assetCounts.GetValueOrDefault(staff.staff_id, 0)
                };
            })
            .OrderBy(x => x.full_name)
            .ToList();

        return Ok(data);
    }

    [HttpGet("projects/{projectId:int}/staffs/{staffId:int}/procurements")]
    public async Task<ActionResult<IReadOnlyList<PublicPortalProcurementSummaryDto>>> GetStaffProcurementsInProject(
        int projectId,
        int staffId
    )
    {
        var projects = await AllProjects();
        if (!projects.Any(x => x.project_id == projectId && x.is_active))
        {
            return NotFound();
        }

        var (procurements, departments, expenseTypes, materialWithdrawals, assetWithdrawals,
            materialIssues, assetItems, assetSubItems, hireDetails) = await LoadStaffProcurementData(staffId);

        var materialProcurementIds = materialWithdrawals
            .Where(x => x.is_active && x.staff_id == staffId)
            .Select(x => x.procurement_record_id)
            .ToHashSet();

        var assetProcurementIds = assetWithdrawals
            .Where(x => x.is_active && x.staff_id == staffId)
            .Select(x => x.procurement_record_id)
            .ToHashSet();

        var relatedProcurementIds = materialProcurementIds
            .Concat(assetProcurementIds)
            .Distinct()
            .ToHashSet();

        var data = procurements
            .Where(x =>
                x.is_active &&
                x.project_id == projectId &&
                relatedProcurementIds.Contains(x.procurement_record_id)
            )
            .Select(procurement =>
            {
                var department = departments.FirstOrDefault(x => x.department_id == procurement.department_id);
                var expenseType = expenseTypes.FirstOrDefault(x => x.expense_type_id == procurement.expense_type_id);
                var expenseTypeName = expenseType?.expense_type_name ?? "-";

                var category = materialProcurementIds.Contains(procurement.procurement_record_id)
                    ? "วัสดุ"
                    : assetProcurementIds.Contains(procurement.procurement_record_id)
                        ? "ครุภัณฑ์"
                        : expenseTypeName;

                var procurementAssetItems = assetItems
                    .Where(x => x.is_active && x.procurement_record_id == procurement.procurement_record_id)
                    .ToList();

                var assetIds = procurementAssetItems.Select(x => x.asset_id).ToHashSet();

                return new PublicPortalProcurementSummaryDto
                {
                    procurement_record_id = procurement.procurement_record_id,
                    project_id = procurement.project_id,
                    project_code = projects.FirstOrDefault(x => x.project_id == procurement.project_id)?.project_code ?? string.Empty,
                    project_name = projects.FirstOrDefault(x => x.project_id == procurement.project_id)?.project_name ?? string.Empty,
                    document_no = procurement.document_no,
                    document_date = procurement.document_date,
                    status = procurement.status,
                    total_amount = procurement.total_amount,
                    department_name = department?.department_name,
                    expense_type_name = expenseTypeName,
                    category = category,
                    material_issue_count = materialIssues.Count(x =>
                        x.is_active &&
                        x.procurement_record_id == procurement.procurement_record_id &&
                        x.staff_id == staffId
                    ),
                    asset_item_count = procurementAssetItems.Count,
                    asset_sub_item_count = assetSubItems.Count(x => x.is_active && assetIds.Contains(x.asset_id)),
                    hire_detail_count = hireDetails.Count(x =>
                        x.is_active && x.procurement_record_id == procurement.procurement_record_id
                    )
                };
            })
            .OrderByDescending(x => x.document_date)
            .ThenByDescending(x => x.procurement_record_id)
            .ToList();

        return Ok(data);
    }

    [HttpGet("staffs/{staffId:int}/procurements")]
    public async Task<ActionResult<IReadOnlyList<PublicPortalProcurementSummaryDto>>> GetStaffProcurements(
        int staffId,
        [FromQuery] int? fiscalYearId
    )
    {
        var projects = await AllProjects();
        var (procurements, departments, expenseTypes, materialWithdrawals, assetWithdrawals,
            materialIssues, assetItems, assetSubItems, hireDetails) = await LoadStaffProcurementData(staffId);

        var materialProcurementIds = materialWithdrawals
            .Where(x => x.is_active && x.staff_id == staffId)
            .Select(x => x.procurement_record_id)
            .ToHashSet();

        var assetProcurementIds = assetWithdrawals
            .Where(x => x.is_active && x.staff_id == staffId)
            .Select(x => x.procurement_record_id)
            .ToHashSet();

        var relatedProcurementIds = materialProcurementIds
            .Concat(assetProcurementIds)
            .Distinct()
            .ToHashSet();

        var data = procurements
            .Where(x =>
                x.is_active &&
                relatedProcurementIds.Contains(x.procurement_record_id) &&
                (!fiscalYearId.HasValue || x.fiscal_year_id == fiscalYearId.Value)
            )
            .Select(procurement =>
            {
                var department = departments.FirstOrDefault(x => x.department_id == procurement.department_id);
                var expenseType = expenseTypes.FirstOrDefault(x => x.expense_type_id == procurement.expense_type_id);
                var project = projects.FirstOrDefault(x => x.project_id == procurement.project_id);
                var expenseTypeName = expenseType?.expense_type_name ?? "-";

                var category = materialProcurementIds.Contains(procurement.procurement_record_id)
                    ? "วัสดุ"
                    : assetProcurementIds.Contains(procurement.procurement_record_id)
                        ? "ครุภัณฑ์"
                        : expenseTypeName;

                var procurementAssetItems = assetItems
                    .Where(x => x.is_active && x.procurement_record_id == procurement.procurement_record_id)
                    .ToList();

                var assetIds = procurementAssetItems.Select(x => x.asset_id).ToHashSet();

                return new PublicPortalProcurementSummaryDto
                {
                    procurement_record_id = procurement.procurement_record_id,
                    project_id = procurement.project_id,
                    project_code = project?.project_code ?? string.Empty,
                    project_name = project?.project_name ?? string.Empty,
                    document_no = procurement.document_no,
                    document_date = procurement.document_date,
                    status = procurement.status,
                    total_amount = procurement.total_amount,
                    department_name = department?.department_name,
                    expense_type_name = expenseTypeName,
                    category = category,
                    material_issue_count = materialIssues.Count(x =>
                        x.is_active &&
                        x.procurement_record_id == procurement.procurement_record_id &&
                        x.staff_id == staffId
                    ),
                    asset_item_count = procurementAssetItems.Count,
                    asset_sub_item_count = assetSubItems.Count(x => x.is_active && assetIds.Contains(x.asset_id)),
                    hire_detail_count = hireDetails.Count(x =>
                        x.is_active && x.procurement_record_id == procurement.procurement_record_id
                    )
                };
            })
            .OrderByDescending(x => x.document_date)
            .ThenByDescending(x => x.procurement_record_id)
            .ToList();

        return Ok(data);
    }

    [HttpGet("staffs/{staffId:int}/inspected-procurements")]
    public async Task<ActionResult<IReadOnlyList<PublicPortalProcurementSummaryDto>>> GetStaffInspectedProcurements(
        int staffId, [FromQuery] int? fiscalYearId)
    {
        var procurements = (await db.procurement_records.AsNoTracking()
                .Where(x => x.is_active && x.staff_id == staffId &&
                    (!fiscalYearId.HasValue || x.fiscal_year_id == fiscalYearId.Value))
                .OrderBy(x => x.procurement_record_id).ToListAsync())
            .OrderByDescending(x => x.document_date)
            .ThenByDescending(x => x.procurement_record_id)
            .ToList();
        var projectIds = procurements.Select(x => x.project_id).ToHashSet();
        var expenseTypeIds = procurements.Select(x => x.expense_type_id).ToHashSet();
        var departmentIds = procurements.Select(x => x.department_id).ToHashSet();
        var procurementIds = procurements.Select(x => x.procurement_record_id).ToHashSet();
        var projects = (await AllProjects())
            .Where(x => projectIds.Contains(x.project_id)).ToDictionary(x => x.project_id);
        var expenseTypes = (await AllExpenseTypes())
            .Where(x => expenseTypeIds.Contains(x.expense_type_id))
            .ToDictionary(x => x.expense_type_id);
        var departments = (await AllDepartments())
            .Where(x => departmentIds.Contains(x.department_id))
            .ToDictionary(x => x.department_id);
        var materialIssues = await db.materialIssueDetails.AsNoTracking()
            .Where(x => x.is_active && x.procurement_record_id.HasValue &&
                procurementIds.Contains(x.procurement_record_id.Value))
            .OrderBy(x => x.issue_detail_id).ToListAsync();
        var assetItems = (await AssetItemsOfProcurements(procurementIds)).Where(x => x.is_active).ToList();
        var assetIds = assetItems.Select(x => x.asset_id).ToHashSet();
        var assetSubItems = (await SubItemsOfAssets(assetIds)).Where(x => x.is_active).ToList();
        var hireDetails = (await HireDetailsOfProcurements(procurementIds)).Where(x => x.is_active).ToList();

        return Ok(procurements.Select(x => new PublicPortalProcurementSummaryDto
        {
            procurement_record_id = x.procurement_record_id,
            project_id = x.project_id,
            project_code = projects.GetValueOrDefault(x.project_id)?.project_code ?? "",
            project_name = projects.GetValueOrDefault(x.project_id)?.project_name ?? "",
            document_no = x.document_no,
            document_date = x.document_date,
            status = x.status,
            total_amount = x.total_amount,
            department_name = departments.GetValueOrDefault(x.department_id)?.department_name,
            expense_type_name = expenseTypes.GetValueOrDefault(x.expense_type_id)?.expense_type_name ?? "",
            category = expenseTypes.GetValueOrDefault(x.expense_type_id)?.expense_type_name ?? "",
            material_issue_count = materialIssues.Count(item => item.procurement_record_id == x.procurement_record_id),
            asset_item_count = assetItems.Count(item => item.procurement_record_id == x.procurement_record_id),
            asset_sub_item_count = assetSubItems.Count(item => assetItems.Any(asset =>
                asset.procurement_record_id == x.procurement_record_id && asset.asset_id == item.asset_id)),
            hire_detail_count = hireDetails.Count(item => item.procurement_record_id == x.procurement_record_id)
        }).ToList());
    }

    [HttpGet("staffs/{staffId:int}/hires")]
    public async Task<ActionResult<IReadOnlyList<PublicPortalStaffHireDto>>> GetStaffHires(
        int staffId, [FromQuery] int? fiscalYearId)
    {
        var expenseTypes = (await AllExpenseTypes())
            .Where(x => x.is_active && x.expense_type_name.Trim() == "จัดจ้าง")
            .Select(x => x.expense_type_id).ToHashSet();
        var procurements = (await db.procurement_records.AsNoTracking()
                .Where(x => x.is_active && x.staff_id == staffId &&
                    expenseTypes.Contains(x.expense_type_id) &&
                    (!fiscalYearId.HasValue || x.fiscal_year_id == fiscalYearId.Value))
                .OrderBy(x => x.procurement_record_id).ToListAsync())
            .OrderByDescending(x => x.document_date)
            .ThenByDescending(x => x.procurement_record_id)
            .ToList();
        var procurementIds = procurements.Select(x => x.procurement_record_id).ToHashSet();
        var projectIds = procurements.Select(x => x.project_id).ToHashSet();
        var vendorIds = procurements.Select(x => x.vendor_id).ToHashSet();
        var projects = (await AllProjects())
            .Where(x => projectIds.Contains(x.project_id))
            .ToDictionary(x => x.project_id);
        var vendors = (await db.vendors.AsNoTracking().Where(x => vendorIds.Contains(x.vendor_id))
                .OrderBy(x => x.vendor_id).ToListAsync())
            .ToDictionary(x => x.vendor_id);
        var hireItems = (await HireDetailsOfProcurements(procurementIds))
            .Where(x => x.is_active && procurementIds.Contains(x.procurement_record_id))
            .GroupBy(x => x.procurement_record_id)
            .ToDictionary(x => x.Key, x => x.OrderBy(item => item.item_no)
                .Select(item => new PublicPortalStaffHireItemDto
                {
                    hire_detail_id = item.hire_detail_id,
                    item_no = item.item_no,
                    hire_name = item.hire_name,
                    quantity = item.quantity,
                    unit_price = item.unit_price,
                    total_amount = item.total_amount,
                    operation_reason = item.operation_reason,
                    remark = item.remark
                }).ToList());

        return Ok(procurements.Select(x => new PublicPortalStaffHireDto
        {
            procurement_record_id = x.procurement_record_id,
            document_no = x.document_no,
            document_date = x.document_date,
            project_code = projects.GetValueOrDefault(x.project_id)?.project_code ?? "",
            project_name = projects.GetValueOrDefault(x.project_id)?.project_name ?? "",
            vendor_name = vendors.GetValueOrDefault(x.vendor_id)?.vendor_name ?? "",
            status = x.status,
            total_amount = x.total_amount,
            hire_items = hireItems.GetValueOrDefault(x.procurement_record_id) ?? new(),
            hire_names = hireItems.GetValueOrDefault(x.procurement_record_id)?
                .Select(item => item.hire_name).ToList() ?? new()
        }).ToList());
    }

    [HttpGet("staffs/{staffId:int}/asset-repairs")]
    public async Task<ActionResult<IReadOnlyList<PublicPortalStaffAssetRepairDto>>> GetStaffAssetRepairs(
        int staffId,
        [FromQuery] int? fiscalYearId)
    {
        var withdrawals = (await StaffAssetWithdrawals(staffId))
            .ToDictionary(x => x.procurement_withdrawal_id);
        var procurementIds = withdrawals.Values.Select(x => x.procurement_record_id)
            .Distinct().ToHashSet();
        var procurements = (await ProcurementsByIds(procurementIds))
            .Where(x => x.is_active && procurementIds.Contains(x.procurement_record_id) &&
                (!fiscalYearId.HasValue || x.fiscal_year_id == fiscalYearId.Value))
            .ToDictionary(x => x.procurement_record_id);
        var projectIds = procurements.Values.Select(x => x.project_id).ToHashSet();
        var projects = (await AllProjects())
            .Where(x => projectIds.Contains(x.project_id))
            .ToDictionary(x => x.project_id);
        var assetNames = (await AssetItemsOfProcurements(procurements.Keys.ToList()))
            .Where(x => x.is_active && x.procurement_record_id.HasValue &&
                procurements.ContainsKey(x.procurement_record_id.Value))
            .GroupBy(x => x.procurement_record_id!.Value)
            .ToDictionary(x => x.Key,
                x => string.Join(", ", x.Select(item => item.asset_name).Distinct()));

        var withdrawalIds = withdrawals.Keys.ToList();
        var repairs = (await db.assetRepairs.AsNoTracking()
                .Where(x => withdrawalIds.Contains(x.procurement_withdrawal_id))
                .OrderBy(x => x.asset_repair_id).ToListAsync())
            .Where(x => x.is_active &&
                withdrawals.TryGetValue(x.procurement_withdrawal_id, out var withdrawal) &&
                procurements.ContainsKey(withdrawal.procurement_record_id))
            .OrderByDescending(x => x.repair_date)
            .ThenByDescending(x => x.asset_repair_id)
            .Select(x =>
            {
                var withdrawal = withdrawals[x.procurement_withdrawal_id];
                var procurement = procurements[withdrawal.procurement_record_id];
                return new PublicPortalStaffAssetRepairDto
                {
                    asset_repair_id = x.asset_repair_id,
                    procurement_withdrawal_id = x.procurement_withdrawal_id,
                    repair_document_no = x.repair_document_no,
                    repair_date = x.repair_date,
                    status = x.status,
                    problem_description = x.problem_description,
                    repair_shop_name = x.repair_shop_name,
                    repair_cost = x.repair_cost,
                    asset_names = assetNames.GetValueOrDefault(procurement.procurement_record_id) ?? "",
                    project_code = projects.GetValueOrDefault(procurement.project_id)?.project_code ?? ""
                };
            })
            .ToList();

        return Ok(repairs);
    }

    [HttpGet("staffs/{staffId:int}/assets")]
    public async Task<ActionResult<IReadOnlyList<PublicPortalStaffAssetItemDto>>> GetStaffAssets(
        int staffId,
        [FromQuery] int? fiscalYearId
    )
    {
        var assetWithdrawals = await StaffAssetWithdrawals(staffId);
        var procurements = await ProcurementsByIds(assetWithdrawals.Select(x => x.procurement_record_id).Distinct().ToList());
        var projects = await AllProjects();
        var departments = await AllDepartments();
        var assetItems = await AssetItemsOfProcurements(procurements.Select(x => x.procurement_record_id).ToList());
        var assetSubItems = await SubItemsOfAssets(assetItems.Select(x => x.asset_id).ToList());
        var withdrawalIds = assetWithdrawals.Select(x => x.procurement_withdrawal_id).ToList();
        var assetHistories = await db.assetSubItemHistories.AsNoTracking()
            .Where(x => withdrawalIds.Contains(x.procurement_withdrawal_id))
            .OrderBy(x => x.sub_item_history_id).ToListAsync();
        var assetRepairs = await db.assetRepairs.AsNoTracking()
            .Where(x => withdrawalIds.Contains(x.procurement_withdrawal_id))
            .OrderBy(x => x.asset_repair_id).ToListAsync();

        var relatedAssetWithdrawals = assetWithdrawals
            .Where(x => x.is_active && x.staff_id == staffId)
            .OrderByDescending(x => x.withdrawal_date)
            .ToList();

        var data = relatedAssetWithdrawals
            .SelectMany(withdrawal =>
            {
                var procurement = procurements.FirstOrDefault(x =>
                    x.is_active &&
                    x.procurement_record_id == withdrawal.procurement_record_id &&
                    (!fiscalYearId.HasValue || x.fiscal_year_id == fiscalYearId.Value)
                );

                if (procurement == null)
                {
                    return Enumerable.Empty<PublicPortalStaffAssetItemDto>();
                }

                var project = projects.FirstOrDefault(x => x.project_id == procurement.project_id);
                var department = departments.FirstOrDefault(x => x.department_id == procurement.department_id);
                var procurementAssetItems = assetItems
                    .Where(x => x.is_active && x.procurement_record_id == procurement.procurement_record_id)
                    .ToList();

                return procurementAssetItems.Select(assetItem =>
                {
                    var assetLevelSubItems = assetSubItems
                        .Where(x =>
                            x.is_active &&
                            x.asset_id == assetItem.asset_id
                        )
                        .ToList();

                    var subItemCount = assetLevelSubItems.Count;
                    int? runningStartNo = assetLevelSubItems.Count == 0
                        ? null
                        : assetLevelSubItems.Min(x => x.running_start_no);
                    int? runningEndNo = assetLevelSubItems.Count == 0
                        ? null
                        : assetLevelSubItems.Max(x => x.running_end_no);
                    int? fiscalAssetYear = assetLevelSubItems.Count == 0
                        ? null
                        : assetLevelSubItems.FirstOrDefault()?.fiscal_asset_year;

                    return new PublicPortalStaffAssetItemDto
                    {
                        asset_id = assetItem.asset_id,
                        procurement_withdrawal_id = withdrawal.procurement_withdrawal_id,
                        procurement_record_id = procurement.procurement_record_id,
                        project_id = procurement.project_id,
                        project_code = project?.project_code ?? string.Empty,
                        project_name = project?.project_name ?? string.Empty,
                        document_no = procurement.document_no,
                        document_date = procurement.document_date,
                        department_name = department?.department_name,
                        withdrawal_document_no = withdrawal.withdrawal_document_no,
                        withdrawal_date = withdrawal.withdrawal_date,
                        end_date = withdrawal.end_date,
                        end_reason = withdrawal.end_reason,
                        asset_name = assetItem.asset_name,
                        receive_date = assetItem.receive_date,
                        storage_location = withdrawal.storage_location,
                        purpose = withdrawal.purpose,
                        running_start_no = runningStartNo,
                        running_end_no = runningEndNo,
                        fiscal_asset_year = fiscalAssetYear,
                        sub_item_count = subItemCount,
                        disposed_sub_item_count = assetLevelSubItems.Count(x => x.status == "จำหน่ายแล้ว"),
                        history_count = assetHistories.Count(x =>
                            x.is_active &&
                            x.procurement_withdrawal_id == withdrawal.procurement_withdrawal_id
                        ),
                        repair_count = assetRepairs.Count(x =>
                            x.is_active &&
                            x.procurement_withdrawal_id == withdrawal.procurement_withdrawal_id
                        )
                    };
                });
            })
            .OrderByDescending(x => x.withdrawal_date)
            .ThenBy(x => x.asset_name)
            .ToList();

        return Ok(data);
    }

    [HttpGet("staffs/{staffId:int}/material-withdrawals")]
    public async Task<ActionResult<IReadOnlyList<PublicPortalMaterialWithdrawalHistoryDto>>> GetStaffMaterialWithdrawals(
        int staffId,
        [FromQuery] int? fiscalYearId
    )
    {
        var staff = await db.staffs.AsNoTracking().FirstOrDefaultAsync(x => x.is_active && x.staff_id == staffId);
        if (staff == null)
        {
            return NotFound();
        }

        var prefixes = await AllPrefixes();
        var projects = await AllProjects();
        var materialUnits = await db.units.AsNoTracking().OrderBy(x => x.unit_id).ToListAsync();
        var materialWithdrawals = await StaffMaterialWithdrawals(staffId);
        var materialIssues = await StaffMaterialIssues(staffId);
        var staffIssueIds = materialIssues.Select(x => x.issue_detail_id).ToList();
        // stock card ของผู้เบิก: ผูกกับรายการเบิกของเขา หรือมีชื่อผู้เบิกบันทึกไว้ (เทียบชื่อต่อในหน่วยความจำ)
        var stockCards = await db.materialStockCards.AsNoTracking()
            .Where(x => x.is_active && x.quantity_out > 0 &&
                ((x.issue_detail_id.HasValue && staffIssueIds.Contains(x.issue_detail_id.Value)) ||
                 (x.StaffName != null && x.StaffName != "")))
            .OrderBy(x => x.stock_card_id).ToListAsync();
        var cardProcurementIds = stockCards.Where(x => x.procurement_record_id.HasValue)
            .Select(x => x.procurement_record_id!.Value)
            .Concat(materialIssues.Where(x => x.procurement_record_id.HasValue).Select(x => x.procurement_record_id!.Value))
            .Distinct().ToList();
        var procurements = await ProcurementsByIds(cardProcurementIds);
        var cardMaterialIds = stockCards.Select(x => x.material_item_id).Distinct().ToList();
        var materialItems = await db.materialItems.AsNoTracking()
            .Where(x => cardMaterialIds.Contains(x.material_item_id))
            .OrderBy(x => x.material_item_id).ToListAsync();

        var prefix = prefixes.FirstOrDefault(x => x.prefix_id == staff.prefix_id);
        var staffNameKeys = new[]
            {
                $"{staff.first_name ?? ""} {staff.last_name ?? ""}",
                $"{prefix?.prefix_name ?? ""}{staff.first_name ?? ""} {staff.last_name ?? ""}"
            }
            .Select(NormalizePersonName)
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Distinct()
            .ToList();

        var withdrawalByProcurement = materialWithdrawals
            .Where(x => x.is_active && x.staff_id == staffId)
            .GroupBy(x => x.procurement_record_id)
            .ToDictionary(
                x => x.Key,
                x => x.OrderByDescending(w => w.material_withdrawal_id).First()
            );

        var issueById = materialIssues
            .Where(x => x.is_active && x.staff_id == staffId)
            .ToDictionary(x => x.issue_detail_id);

        var data = stockCards
            .Where(stockCard =>
                stockCard.is_active &&
                IsStockOut(stockCard) &&
                stockCard.quantity_out > 0 &&
                (
                    (stockCard.issue_detail_id.HasValue && issueById.ContainsKey(stockCard.issue_detail_id.Value)) ||
                    StaffNameMatches(stockCard.StaffName, staffNameKeys)
                )
            )
            .Select(stockCard =>
            {
                MaterialIssueDetail? issue = null;
                if (stockCard.issue_detail_id.HasValue)
                {
                    issueById.TryGetValue(stockCard.issue_detail_id.Value, out issue);
                }

                var procurement = procurements.FirstOrDefault(x =>
                    x.is_active &&
                    x.procurement_record_id == (stockCard.procurement_record_id ?? issue?.procurement_record_id ?? 0)
                );

                var rowFiscalYearId = stockCard.fiscal_year_id ?? procurement?.fiscal_year_id;
                if (fiscalYearId.HasValue && rowFiscalYearId != fiscalYearId.Value)
                {
                    return null;
                }

                var project = procurement == null
                    ? null
                    : projects.FirstOrDefault(x => x.project_id == procurement.project_id);
                var material = materialItems.FirstOrDefault(x => x.material_item_id == stockCard.material_item_id);
                var unitName = material == null
                    ? null
                    : materialUnits.FirstOrDefault(x => x.unit_id == material.unit_id)?.unit_name;
                MaterialWithdrawal? withdrawal = null;
                if (procurement != null)
                {
                    withdrawalByProcurement.TryGetValue(procurement.procurement_record_id, out withdrawal);
                }

                return new PublicPortalMaterialWithdrawalHistoryDto
                {
                    stock_card_id = stockCard.stock_card_id,
                    department_id = stockCard.department_id,
                    issue_detail_id = issue?.issue_detail_id ?? stockCard.issue_detail_id ?? stockCard.stock_card_id,
                    material_withdrawal_id = withdrawal?.material_withdrawal_id,
                    procurement_record_id = procurement?.procurement_record_id ?? 0,
                    material_item_id = stockCard.material_item_id,
                    project_id = procurement?.project_id ?? 0,
                    project_code = project?.project_code ?? string.Empty,
                    project_name = project?.project_name ?? string.Empty,
                    document_no = procurement?.document_no ?? stockCard.reference_document_no ?? string.Empty,
                    document_date = procurement?.document_date,
                    withdrawal_document_no = withdrawal?.withdrawal_document_no ?? stockCard.reference_document_no ?? string.Empty,
                    issue_date = stockCard.transaction_date,
                    material_code = material?.material_code ?? string.Empty,
                    material_name = material?.material_name ?? "-",
                    unit_name = unitName,
                    quantity = stockCard.quantity_out,
                    unit_price = stockCard.unit_price,
                    total_amount = stockCard.quantity_out * stockCard.unit_price,
                    remark = issue?.remark
                };
            })
            .Where(x => x != null)
            .Select(x => x!)
            .OrderByDescending(x => x.issue_date)
            .ThenByDescending(x => x.issue_detail_id)
            .ToList();

        return Ok(data);
    }

    private static bool IsStockOut(MaterialStockCard stockCard)
    {
        return string.Equals(stockCard.transaction_type?.Trim(), "OUT", StringComparison.OrdinalIgnoreCase);
    }

    private static bool StaffNameMatches(string? stockCardStaffName, IReadOnlyCollection<string> staffNameKeys)
    {
        var normalizedStockCardStaffName = NormalizePersonName(stockCardStaffName);
        return !string.IsNullOrWhiteSpace(normalizedStockCardStaffName) &&
            staffNameKeys.Any(key =>
                normalizedStockCardStaffName.Contains(key, StringComparison.OrdinalIgnoreCase) ||
                key.Contains(normalizedStockCardStaffName, StringComparison.OrdinalIgnoreCase)
            );
    }

    private static string NormalizePersonName(string? value)
    {
        return new string((value ?? string.Empty).Where(x => !char.IsWhiteSpace(x)).ToArray());
    }

    [HttpGet("staffs/{staffId:int}/assets/{assetId:int}/withdrawals/{withdrawalId:int}")]
    public async Task<ActionResult<PublicPortalStaffAssetDetailDto>> GetStaffAssetDetail(
        int staffId,
        int assetId,
        int withdrawalId
    )
    {
        var withdrawal = await db.assetWithdrawals.AsNoTracking().FirstOrDefaultAsync(x =>
            x.is_active &&
            x.staff_id == staffId &&
            x.procurement_withdrawal_id == withdrawalId
        );

        if (withdrawal == null)
        {
            return NotFound();
        }

        var assetItem = await db.assetItems.AsNoTracking().FirstOrDefaultAsync(x =>
            x.is_active &&
            x.asset_id == assetId &&
            x.procurement_record_id == withdrawal.procurement_record_id
        );

        if (assetItem == null)
        {
            return NotFound();
        }

        var procurement = await db.procurement_records.AsNoTracking().FirstOrDefaultAsync(x =>
            x.is_active &&
            x.procurement_record_id == withdrawal.procurement_record_id
        );

        if (procurement == null)
        {
            return NotFound();
        }

        var projects = await AllProjects();
        var departments = await AllDepartments();
        var prefixes = await AllPrefixes();
        var usageTypes = await db.assetUsageTypes.AsNoTracking().OrderBy(x => x.usage_type_id).ToListAsync();
        var assetSubItems = await SubItemsOfAssets([assetItem.asset_id]);
        var assetCategories = await db.assetCategories.AsNoTracking().OrderBy(x => x.asset_category_id).ToListAsync();
        var subItemUnits = await db.units.AsNoTracking().OrderBy(x => x.unit_id).ToListAsync();
        var assetHistories = await db.assetSubItemHistories.AsNoTracking()
            .Where(x => x.procurement_withdrawal_id == withdrawal.procurement_withdrawal_id)
            .OrderBy(x => x.sub_item_history_id).ToListAsync();
        var assetRepairs = await db.assetRepairs.AsNoTracking()
            .Where(x => x.procurement_withdrawal_id == withdrawal.procurement_withdrawal_id)
            .OrderBy(x => x.asset_repair_id).ToListAsync();
        var personIds = assetHistories.Select(x => x.staff_id).Concat(assetRepairs.Select(x => x.staff_id))
            .Where(x => x.HasValue).Select(x => x!.Value)
            .Distinct().ToList();
        var staffs = await db.staffs.AsNoTracking().Where(x => personIds.Contains(x.staff_id))
            .OrderBy(x => x.staff_id).ToListAsync();

        var project = projects.FirstOrDefault(x => x.project_id == procurement.project_id);
        var department = departments.FirstOrDefault(x => x.department_id == procurement.department_id);

        var subItems = assetSubItems
            .Where(x => x.is_active && x.asset_id == assetItem.asset_id)
            .OrderBy(x => x.asset_sub_item_id)
            .Select(x => new PublicPortalAssetSubItemDto
            {
                asset_sub_item_id = x.asset_sub_item_id,
                sub_item_name = string.IsNullOrWhiteSpace(x.sub_item_name) ? "ครุภัณฑ์ย่อย" : x.sub_item_name,
                running_start_no = x.running_start_no,
                running_end_no = x.running_end_no,
                fiscal_asset_year = x.fiscal_asset_year,
                quantity = x.quantity,
                unit_price = x.unit_price,
                total_price = x.total_price,
                status = x.status,
                asset_code_start = !string.IsNullOrWhiteSpace(assetItem.asset_code_prefix) &&
                    x.running_start_no > 0 &&
                    x.fiscal_asset_year > 0
                        ? $"{assetItem.asset_code_prefix}-{x.running_start_no.ToString("D4")}/{x.fiscal_asset_year}"
                        : string.Empty,
                category_name = assetCategories
                    .FirstOrDefault(c => c.asset_category_id == x.asset_category_id)?.category_name,
                unit_name = subItemUnits.FirstOrDefault(u => u.unit_id == x.unit_id)?.unit_name,
                asset_code_end = assetItem != null &&
                    !string.IsNullOrWhiteSpace(assetItem.asset_code_prefix) &&
                    x.running_end_no > 0 &&
                    x.fiscal_asset_year > 0
                        ? $"{assetItem.asset_code_prefix}-{x.running_end_no.ToString("D4")}/{x.fiscal_asset_year}"
                        : string.Empty
            })
            .ToList();

        var histories = assetHistories
            .Where(x =>
                x.is_active &&
                x.procurement_withdrawal_id == withdrawal.procurement_withdrawal_id
            )
            .OrderByDescending(x => x.history_date)
            .ThenByDescending(x => x.sub_item_history_id)
            .Select(x =>
            {
                var usageType = usageTypes.FirstOrDefault(u => u.usage_type_id == x.usage_type_id);
                var staff = staffs.FirstOrDefault(s => s.staff_id == x.staff_id);
                var prefix = staff == null ? null : prefixes.FirstOrDefault(p => p.prefix_id == staff.prefix_id);

                return new PublicPortalAssetUsageHistoryDto
                {
                    sub_item_history_id = x.sub_item_history_id,
                    history_date = x.history_date,
                    history_type = x.history_type,
                    usage_type_name = usageType?.usage_type_name,
                    detail = x.detail,
                    full_name = staff == null
                        ? null
                        : $"{prefix?.prefix_name ?? ""}{staff.first_name} {staff.last_name}".Trim()
                };
            })
            .ToList();

        var repairs = assetRepairs
            .Where(x =>
                x.is_active &&
                x.procurement_withdrawal_id == withdrawal.procurement_withdrawal_id
            )
            .OrderByDescending(x => x.repair_date)
            .ThenByDescending(x => x.asset_repair_id)
            .Select(x =>
            {
                var staff = staffs.FirstOrDefault(s => s.staff_id == x.staff_id);
                var prefix = staff == null ? null : prefixes.FirstOrDefault(p => p.prefix_id == staff.prefix_id);

                return new PublicPortalAssetRepairDto
                {
                    asset_repair_id = x.asset_repair_id,
                    repair_document_no = x.repair_document_no,
                    repair_date = x.repair_date,
                    status = x.status,
                    problem_description = x.problem_description,
                    repair_description = x.repair_description,
                    repair_shop_name = x.repair_shop_name,
                    repair_cost = x.repair_cost,
                    decree_document_no = x.decree_document_no,
                    full_name = staff == null
                        ? null
                        : $"{prefix?.prefix_name ?? ""}{staff.first_name} {staff.last_name}".Trim()
                };
            })
            .ToList();

        return Ok(new PublicPortalStaffAssetDetailDto
        {
            asset_id = assetItem.asset_id,
            procurement_withdrawal_id = withdrawal.procurement_withdrawal_id,
            procurement_record_id = procurement.procurement_record_id,
            project_id = procurement.project_id,
            project_code = project?.project_code ?? string.Empty,
            project_name = project?.project_name ?? string.Empty,
            document_no = procurement.document_no,
            document_date = procurement.document_date,
            department_name = department?.department_name,
            withdrawal_document_no = withdrawal.withdrawal_document_no,
            withdrawal_date = withdrawal.withdrawal_date,
            end_date = withdrawal.end_date,
            end_reason = withdrawal.end_reason,
            asset_name = assetItem.asset_name,
            receive_date = assetItem.receive_date,
            storage_location = withdrawal.storage_location,
            purpose = withdrawal.purpose,
            running_start_no = subItems.Count == 0 ? null : subItems.Min(x => x.running_start_no),
            running_end_no = subItems.Count == 0 ? null : subItems.Max(x => x.running_end_no),
            fiscal_asset_year = subItems.Count == 0 ? null : subItems.First().fiscal_asset_year,
            sub_items = subItems,
            histories = histories,
            repairs = repairs
        });
    }

    [HttpGet("projects/{projectId:int}/staffs/{staffId:int}/procurements/{procurementId:int}")]
    public async Task<ActionResult<PublicPortalProcurementDetailDto>> GetProcurementDetail(
        int projectId,
        int staffId,
        int procurementId
    )
    {
        var (procurements, expenseTypes, materialReceiveDetails, materialItems, assetWithdrawals,
            assetItems, assetSubItems, hireDetails, materialWithdrawals) = await LoadProcurementDetailData(procurementId);

        var procurement = procurements.FirstOrDefault(x =>
            x.is_active &&
            x.project_id == projectId &&
            x.procurement_record_id == procurementId
        );

        if (procurement == null)
        {
            return NotFound();
        }

        var hasMaterialWithdrawal = materialWithdrawals.Any(x =>
            x.is_active &&
            x.staff_id == staffId &&
            x.procurement_record_id == procurementId
        );

        // The inspecting staff member may also view the whole document.
        var isInspector = procurement.staff_id == staffId;

        var relatedAssetWithdrawals = assetWithdrawals
            .Where(x =>
                x.is_active &&
                (isInspector || x.staff_id == staffId) &&
                x.procurement_record_id == procurementId
            )
            .OrderByDescending(x => x.withdrawal_date)
            .ToList();

        if (!isInspector && !hasMaterialWithdrawal && relatedAssetWithdrawals.Count == 0)
        {
            return NotFound();
        }

        var expenseTypeName = expenseTypes
            .FirstOrDefault(x => x.expense_type_id == procurement.expense_type_id)
            ?.expense_type_name ?? "-";

        var materialReceiveDetailDtos = materialReceiveDetails
            .Where(x =>
                x.is_active &&
                x.procurement_record_id == procurementId
            )
            .OrderBy(x => x.item_no)
            .ThenBy(x => x.receive_detail_id)
            .Select(receiveDetail =>
            {
                var material = materialItems.FirstOrDefault(x => x.material_item_id == receiveDetail.material_item_id);
                return new PublicPortalMaterialReceiveDetailDto
                {
                    receive_detail_id = receiveDetail.receive_detail_id,
                    item_no = receiveDetail.item_no,
                    procurement_record_id = receiveDetail.procurement_record_id,
                    material_item_id = receiveDetail.material_item_id,
                    material_name = material?.material_name ?? "-",
                    quantity = receiveDetail.quantity,
                    unit_price = receiveDetail.unit_price,
                    total_amount = receiveDetail.total_amount,
                    operation_reason = receiveDetail.operation_reason
                };
            })
            .ToList();

        var procurementAssetItems = assetItems
            .Where(x => x.is_active && x.procurement_record_id == procurementId)
            .ToList();

        var assetHistories = relatedAssetWithdrawals
            .SelectMany(withdrawal =>
                procurementAssetItems.SelectMany(assetItem =>
                {
                    var subItems = assetSubItems
                        .Where(x => x.is_active && x.asset_id == assetItem.asset_id)
                        .ToList();

                    if (subItems.Count == 0)
                    {
                        return
                        [
                            new PublicPortalAssetHistoryDto
                            {
                                procurement_withdrawal_id = withdrawal.procurement_withdrawal_id,
                                withdrawal_document_no = withdrawal.withdrawal_document_no,
                                withdrawal_date = withdrawal.withdrawal_date,
                                end_date = withdrawal.end_date,
                                end_reason = withdrawal.end_reason,
                                asset_name = assetItem.asset_name,
                                sub_item_name = "ครุภัณฑ์หลัก",
                                quantity = 1,
                                unit_price = null,
                                total_price = null,
                                storage_location = withdrawal.storage_location,
                                purpose = withdrawal.purpose
                            }
                        ];
                    }

                    return subItems.Select(subItem => new PublicPortalAssetHistoryDto
                    {
                        procurement_withdrawal_id = withdrawal.procurement_withdrawal_id,
                        withdrawal_document_no = withdrawal.withdrawal_document_no,
                        withdrawal_date = withdrawal.withdrawal_date,
                        end_date = withdrawal.end_date,
                        end_reason = withdrawal.end_reason,
                        asset_name = assetItem.asset_name,
                        sub_item_name = string.IsNullOrWhiteSpace(subItem.sub_item_name)
                            ? "ครุภัณฑ์ย่อย"
                            : subItem.sub_item_name,
                        quantity = subItem.quantity,
                        unit_price = subItem.unit_price,
                        total_price = subItem.total_price,
                        storage_location = withdrawal.storage_location,
                        purpose = withdrawal.purpose
                    });
                })
            )
            .ToList();

        var hireDetailDtos = hireDetails
            .Where(x => x.is_active && x.procurement_record_id == procurementId)
            .OrderBy(x => x.item_no)
            .Select(x => new PublicPortalHireDetailDto
            {
                hire_detail_id = x.hire_detail_id,
                item_no = x.item_no,
                hire_name = x.hire_name,
                quantity = x.quantity,
                unit_price = x.unit_price,
                total_amount = x.total_amount,
                operation_reason = x.operation_reason,
                remark = x.remark
            })
            .ToList();

        var category = hasMaterialWithdrawal
            ? "วัสดุ"
            : relatedAssetWithdrawals.Count > 0
                ? "ครุภัณฑ์"
                : expenseTypeName;

        return Ok(new PublicPortalProcurementDetailDto
        {
            procurement_record_id = procurement.procurement_record_id,
            document_no = procurement.document_no,
            document_date = procurement.document_date,
            status = procurement.status,
            total_amount = procurement.total_amount,
            expense_type_name = expenseTypeName,
            category = category,
            material_receive_details = materialReceiveDetailDtos,
            asset_histories = assetHistories,
            hire_details = hireDetailDtos
        });
    }

    [HttpGet("staffs/{staffId:int}/procurements/{procurementId:int}")]
    public async Task<ActionResult<PublicPortalProcurementDetailDto>> GetProcurementDetailByStaff(
        int staffId,
        int procurementId
    )
    {
        var (procurements, expenseTypes, materialReceiveDetails, materialItems, assetWithdrawals,
            assetItems, assetSubItems, hireDetails, materialWithdrawals) = await LoadProcurementDetailData(procurementId);

        var procurement = procurements.FirstOrDefault(x =>
            x.is_active &&
            x.procurement_record_id == procurementId
        );

        if (procurement == null)
        {
            return NotFound();
        }

        var hasMaterialWithdrawal = materialWithdrawals.Any(x =>
            x.is_active &&
            x.staff_id == staffId &&
            x.procurement_record_id == procurementId
        );

        // The inspecting staff member may also view the whole document.
        var isInspector = procurement.staff_id == staffId;

        var relatedAssetWithdrawals = assetWithdrawals
            .Where(x =>
                x.is_active &&
                (isInspector || x.staff_id == staffId) &&
                x.procurement_record_id == procurementId
            )
            .OrderByDescending(x => x.withdrawal_date)
            .ToList();

        if (!isInspector && !hasMaterialWithdrawal && relatedAssetWithdrawals.Count == 0)
        {
            return NotFound();
        }

        var expenseTypeName = expenseTypes
            .FirstOrDefault(x => x.expense_type_id == procurement.expense_type_id)
            ?.expense_type_name ?? "-";

        var materialReceiveDetailDtos = materialReceiveDetails
            .Where(x =>
                x.is_active &&
                x.procurement_record_id == procurementId
            )
            .OrderBy(x => x.item_no)
            .ThenBy(x => x.receive_detail_id)
            .Select(receiveDetail =>
            {
                var material = materialItems.FirstOrDefault(x => x.material_item_id == receiveDetail.material_item_id);
                return new PublicPortalMaterialReceiveDetailDto
                {
                    receive_detail_id = receiveDetail.receive_detail_id,
                    item_no = receiveDetail.item_no,
                    procurement_record_id = receiveDetail.procurement_record_id,
                    material_item_id = receiveDetail.material_item_id,
                    material_name = material?.material_name ?? "-",
                    quantity = receiveDetail.quantity,
                    unit_price = receiveDetail.unit_price,
                    total_amount = receiveDetail.total_amount,
                    operation_reason = receiveDetail.operation_reason
                };
            })
            .ToList();

        var procurementAssetItems = assetItems
            .Where(x => x.is_active && x.procurement_record_id == procurementId)
            .ToList();

        var assetHistories = relatedAssetWithdrawals
            .SelectMany(withdrawal =>
                procurementAssetItems.SelectMany(assetItem =>
                {
                    var subItems = assetSubItems
                        .Where(x => x.is_active && x.asset_id == assetItem.asset_id)
                        .ToList();

                    if (subItems.Count == 0)
                    {
                        return
                        [
                            new PublicPortalAssetHistoryDto
                            {
                                procurement_withdrawal_id = withdrawal.procurement_withdrawal_id,
                                withdrawal_document_no = withdrawal.withdrawal_document_no,
                                withdrawal_date = withdrawal.withdrawal_date,
                                end_date = withdrawal.end_date,
                                end_reason = withdrawal.end_reason,
                                asset_name = assetItem.asset_name,
                                sub_item_name = "ครุภัณฑ์หลัก",
                                quantity = 1,
                                unit_price = null,
                                total_price = null,
                                storage_location = withdrawal.storage_location,
                                purpose = withdrawal.purpose
                            }
                        ];
                    }

                    return subItems.Select(subItem => new PublicPortalAssetHistoryDto
                    {
                        procurement_withdrawal_id = withdrawal.procurement_withdrawal_id,
                        withdrawal_document_no = withdrawal.withdrawal_document_no,
                        withdrawal_date = withdrawal.withdrawal_date,
                        end_date = withdrawal.end_date,
                        end_reason = withdrawal.end_reason,
                        asset_name = assetItem.asset_name,
                        sub_item_name = string.IsNullOrWhiteSpace(subItem.sub_item_name)
                            ? "ครุภัณฑ์ย่อย"
                            : subItem.sub_item_name,
                        quantity = subItem.quantity,
                        unit_price = subItem.unit_price,
                        total_price = subItem.total_price,
                        storage_location = withdrawal.storage_location,
                        purpose = withdrawal.purpose
                    });
                })
            )
            .ToList();

        var hireDetailDtos = hireDetails
            .Where(x => x.is_active && x.procurement_record_id == procurementId)
            .OrderBy(x => x.item_no)
            .Select(x => new PublicPortalHireDetailDto
            {
                hire_detail_id = x.hire_detail_id,
                item_no = x.item_no,
                hire_name = x.hire_name,
                quantity = x.quantity,
                unit_price = x.unit_price,
                total_amount = x.total_amount,
                operation_reason = x.operation_reason,
                remark = x.remark
            })
            .ToList();

        var category = hasMaterialWithdrawal
            ? "วัสดุ"
            : relatedAssetWithdrawals.Count > 0
                ? "ครุภัณฑ์"
                : expenseTypeName;

        return Ok(new PublicPortalProcurementDetailDto
        {
            procurement_record_id = procurement.procurement_record_id,
            document_no = procurement.document_no,
            document_date = procurement.document_date,
            status = procurement.status,
            total_amount = procurement.total_amount,
            expense_type_name = expenseTypeName,
            category = category,
            material_receive_details = materialReceiveDetailDtos,
            asset_histories = assetHistories,
            hire_details = hireDetailDtos
        });
    }
}
