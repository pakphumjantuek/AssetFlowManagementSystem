using Core.Interfaces.Specifications.AssetItem;
using Core.Specifications;

public class AssetItemForCountSpecification : BaseSpecification<AssetItem>
{
    public AssetItemForCountSpecification(AssetItemSpecParams specParams)
        : base(x =>
            x.is_active &&
            (
              string.IsNullOrEmpty(specParams.Search) ||
      x.asset_name.ToLower().Contains(specParams.Search.ToLower())
            ) &&
            (!specParams.ProcurementRecordId.HasValue ||
             x.procurement_record_id == specParams.ProcurementRecordId.Value) &&
            (!specParams.DepartmentId.HasValue || x.department_id == specParams.DepartmentId.Value) &&
            (specParams.CustodianProcurementIds == null ||
                (x.procurement_record_id.HasValue &&
                 specParams.CustodianProcurementIds.Contains(x.procurement_record_id.Value))))
    {
    }
}
