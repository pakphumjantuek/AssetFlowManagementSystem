using Core.Entities;
using Core.Interfaces.Specifications.Procurement_records;
using Core.Specifications;

public class Procurement_recordForCountSpecification : BaseSpecification<Procurement_records>
{
    public Procurement_recordForCountSpecification(Procurement_recordsSpecParams specParams)
        : base(x =>
            x.is_active &&
            (specParams.ProjectId == null || x.project_id == specParams.ProjectId) &&
            (specParams.ExpenseTypeId == null || x.expense_type_id == specParams.ExpenseTypeId) &&
            (specParams.FiscalYearId == null || x.fiscal_year_id == specParams.FiscalYearId) &&
            (string.IsNullOrEmpty(specParams.Status) || x.status == specParams.Status) &&
            (
                string.IsNullOrEmpty(specParams.Search) ||
                x.document_no.ToLower().Contains(specParams.Search) ||
                (x.decree_document_no != null && x.decree_document_no.ToLower().Contains(specParams.Search)) ||
                x.expense_Types.expense_type_name.ToLower().Contains(specParams.Search) ||
                x.fiscal_Years.year_name.ToLower().Contains(specParams.Search)
            ))
    {
    }
}
