using Core.Interfaces.Specifications.AssetItem;
using Core.Specifications;

public class AssetItemSpecification : BaseSpecification<AssetItem>
{
    public AssetItemSpecification(AssetItemSpecParams specParams)
        : base(x => x.is_active &&
            (
                string.IsNullOrEmpty(specParams.Search) ||
                x.asset_name.ToLower().Contains(specParams.Search.ToLower())
            ) &&
            (
                !specParams.ProcurementRecordId.HasValue ||
                x.procurement_record_id == specParams.ProcurementRecordId.Value
            ) &&
            (!specParams.DepartmentId.HasValue || x.department_id == specParams.DepartmentId.Value) &&
            (specParams.CustodianProcurementIds == null ||
                (x.procurement_record_id.HasValue &&
                 specParams.CustodianProcurementIds.Contains(x.procurement_record_id.Value))
            )
        )
    {
        AddInclude(x => x.FundCategory);
        AddInclude(x => x.Department);
        //AddInclude(x => x.Staff);
        //AddInclude(x => x.Staff.Prefixes);
        //AddInclude(x => x.Vendor);
       


        switch (specParams.Sort)
        {
            case "nameAsc":
                AddOrderBy(x => x.item_no);
                break;

            case "nameDesc":
                AddOrderByDescending(x => x.item_no);
                break;

            case "idDesc":
                AddOrderByDescending(x => x.created_at);
                break;

            default:
                AddOrderBy(x => x.item_no);
                break;
        }

        ApplyPaging(
            specParams.PageSize * (specParams.PageIndex - 1),
            specParams.PageSize
        );
    }
}
