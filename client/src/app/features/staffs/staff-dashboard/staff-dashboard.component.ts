import { SystemSettingsService } from '../../../core/services/system-settings.service';
import { CommonModule, DecimalPipe } from '@angular/common';
import { Component, HostListener, inject, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  StaffDashboardAsset,
  StaffDashboardAssetRepair,
  StaffDashboardHire,
  StaffDashboardFiscalYear,
  StaffDashboardLookup,
  StaffDashboardMaterialWithdrawal,
  StaffDashboardProcurement,
  StaffDashboardService,
  StaffDashboardSummary,
} from './staff-dashboard.service';
import { ThaiDatePipe } from '../../../shared/pipes/thai-date-pipe';
import { catchError, forkJoin, of } from 'rxjs';
import { MaterialStockCardService } from '../../materialStockCard/service/materialStockCard.service';
import { MaterialStockCardTypes } from '../../materialStockCard/interface/materialStockCardTypes';

type StaffDashboardMaterialMovement = {
  direction: 'IN' | 'OUT';
  id: string;
  date: string | null | undefined;
  documentNo: string;
  withdrawalDocumentNo?: string | null;
  materialCode: string;
  materialName: string;
  projectCode: string;
  projectName: string;
  unitName: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  remark?: string | null;
  procurementRecordId?: number | null;
};

@Component({
  selector: 'app-staff-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, DecimalPipe, ThaiDatePipe],
  templateUrl: './staff-dashboard.component.html',
})
export class StaffDashboardComponent {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private service = inject(StaffDashboardService);
  private stockCardService = inject(MaterialStockCardService);
  private settings = inject(SystemSettingsService);

  staffId = Number(this.route.snapshot.paramMap.get('staffId'));
  staff = history.state?.staff as StaffDashboardLookup | undefined;
  fiscalYearId: number | null = this.getFiscalYearId();
  fiscalYear = history.state?.fiscalYear as { fiscal_year?: number; year_name?: string | null } | undefined;
  loading = signal(false);
  loadingYears = signal(false);
  loadingMaterialHistory = signal(false);
  loadingRepairs = signal(false);
  selectedSection = signal<'procurements' | 'materials' | 'assets' | 'repairs' | 'hires' | 'inspections' | null>(null);
  searchQuery = signal('');

  summary = signal<StaffDashboardSummary | null>(null);
  procurements = signal<StaffDashboardProcurement[]>([]);
  inspectedProcurements = signal<StaffDashboardProcurement[]>([]);
  loadingInspections = signal(false);
  materialWithdrawals = signal<StaffDashboardMaterialWithdrawal[]>([]);
  materialReceipts = signal<MaterialStockCardTypes[]>([]);
  assets = signal<StaffDashboardAsset[]>([]);
  repairs = signal<StaffDashboardAssetRepair[]>([]);
  hires = signal<StaffDashboardHire[]>([]);
  selectedHire = signal<StaffDashboardHire | null>(null);
  loadingHires = signal(false);
  fiscalYears = signal<StaffDashboardFiscalYear[]>([]);

  materialMovements = computed<StaffDashboardMaterialMovement[]>(() => {
    const withdrawals = this.materialWithdrawals();
    const relatedByIssueId = new Map<number, StaffDashboardMaterialWithdrawal>();
    for (const item of withdrawals) {
      relatedByIssueId.set(item.issue_detail_id, item);
    }

    const receipts = this.materialReceipts();
    const inMovements: StaffDashboardMaterialMovement[] = receipts
      .filter((item) => item.transaction_type === 'IN' && Number(item.quantity_in) > 0)
      .flatMap((item) => {
        const related = relatedByIssueId.get(Number(item.issue_detail_id));
        if (!related) return [];

        const quantity = Number(item.quantity_in || 0);
        const unitPrice = Number(item.unit_price || 0);
        return [{
          direction: 'IN' as const,
          id: `IN-${item.stock_card_id}`,
          date: item.transaction_date,
          documentNo: item.reference_document_no || related.document_no || '',
          withdrawalDocumentNo: related.withdrawal_document_no || null,
          materialCode: related.material_code || '',
          materialName: related.material_name || '-',
          projectCode: related.project_code || '',
          projectName: related.project_name || '',
          unitName: related.unit_name || '',
          quantity: quantity,
          unitPrice,
          totalAmount: quantity * unitPrice,
          remark: null,
          procurementRecordId: related.procurement_record_id,
        }];
      });

    const outMovements: StaffDashboardMaterialMovement[] = withdrawals
      .filter(item => item.department_id != null && item.department_id !== this.settings.centralDepartmentId() && Number(item.quantity) > 0)
      .map(item => ({
        direction: 'OUT',
        id: `OUT-${item.stock_card_id}`,
        date: item.issue_date,
        documentNo: item.document_no || '',
        withdrawalDocumentNo: item.withdrawal_document_no,
        materialCode: item.material_code || '',
        materialName: item.material_name || '-',
        projectCode: item.project_code || '',
        projectName: item.project_name || '',
        unitName: item.unit_name || '',
        quantity: Number(item.quantity),
        unitPrice: Number(item.unit_price || 0),
        totalAmount: Number(item.quantity) * Number(item.unit_price || 0),
        remark: item.remark,
        procurementRecordId: item.procurement_record_id,
      }));

    return [...inMovements, ...outMovements].sort(
      (a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime(),
    );
  });

  // Client-side search filters
  filteredProcurements = computed(() => {
    const list = this.procurements();
    const query = this.searchQuery().toLowerCase().trim();
    if (!query) return list;
    return list.filter(
      (p) =>
        p.document_no.toLowerCase().includes(query) ||
        (p.project_name && p.project_name.toLowerCase().includes(query)) ||
        (p.project_code && p.project_code.toLowerCase().includes(query)) ||
        (p.category && p.category.toLowerCase().includes(query)) ||
        (p.expense_type_name && p.expense_type_name.toLowerCase().includes(query))
    );
  });

  filteredInspections = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    if (!query) return this.inspectedProcurements();
    return this.inspectedProcurements().filter((item) =>
      [item.document_no, item.project_name, item.project_code,
        item.expense_type_name, item.status]
        .some((value) => value?.toLowerCase().includes(query)));
  });

  filteredAssets = computed(() => {
    const list = this.assets();
    const query = this.searchQuery().toLowerCase().trim();
    if (!query) return list;
    return list.filter(
      (a) =>
        a.asset_name.toLowerCase().includes(query) ||
        a.document_no.toLowerCase().includes(query) ||
        (a.storage_location && a.storage_location.toLowerCase().includes(query)) ||
        (a.project_name && a.project_name.toLowerCase().includes(query))
    );
  });

  filteredRepairs = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    if (!query) return this.repairs();
    return this.repairs().filter((repair) =>
      [repair.asset_names, repair.project_code, repair.repair_document_no,
        repair.repair_shop_name, repair.problem_description, repair.status]
        .some((value) => value?.toLowerCase().includes(query)));
  });

  filteredHires = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    if (!query) return this.hires();
    return this.hires().filter((hire) =>
      [hire.document_no, hire.project_code, hire.project_name, hire.vendor_name,
        hire.status, ...hire.hire_names]
        .some((value) => value?.toLowerCase().includes(query)));
  });

  filteredMaterialMovements = computed(() => {
    const list = this.materialMovements();
    const query = this.searchQuery().toLowerCase().trim();
    if (!query) return list;
    return list.filter(
      (item) =>
        item.materialName.toLowerCase().includes(query) ||
        item.documentNo.toLowerCase().includes(query) ||
        (item.withdrawalDocumentNo && item.withdrawalDocumentNo.toLowerCase().includes(query)) ||
        item.materialCode.toLowerCase().includes(query) ||
        item.projectName.toLowerCase().includes(query) ||
        item.projectCode.toLowerCase().includes(query) ||
        (item.remark && item.remark.toLowerCase().includes(query))
    );
  });

  constructor() {
    const sectionParam = this.route.snapshot.queryParamMap.get('section');
    if (sectionParam === 'procurements' || sectionParam === 'materials' || sectionParam === 'assets' || sectionParam === 'repairs' || sectionParam === 'hires' || sectionParam === 'inspections') {
      this.selectedSection.set(sectionParam);
    }

    this.loadFiscalYears();
    this.loadData();
  }

  loadFiscalYears() {
    this.loadingYears.set(true);
    this.service.getFiscalYears(this.staffId).subscribe({
      next: (data) => this.fiscalYears.set(data),
      error: (error) => console.error(error),
      complete: () => this.loadingYears.set(false),
    });
  }

  selectFiscalYear(year: StaffDashboardFiscalYear) {
    this.fiscalYearId = year.fiscal_year_id;
    this.fiscalYear = year;
    this.searchQuery.set('');
    this.summary.set(null);
    this.procurements.set([]);
    this.inspectedProcurements.set([]);
    this.materialWithdrawals.set([]);
    this.materialReceipts.set([]);
    this.assets.set([]);
    this.repairs.set([]);
    this.hires.set([]);
    this.loadingRepairs.set(false);

    this.router.navigate(['/admin/staffs', this.staffId, 'dashboard'], {
      queryParams: { fiscal_year_id: year.fiscal_year_id },
      queryParamsHandling: 'merge',
      state: { staff: this.staff, fiscalYear: year },
    });

    this.loadData();
  }

  onFiscalYearChange(value: string) {
    if (!value) {
      this.fiscalYearId = null;
      this.fiscalYear = undefined;
      this.searchQuery.set('');
      this.summary.set(null);
      this.procurements.set([]);
      this.inspectedProcurements.set([]);
      this.materialWithdrawals.set([]);
      this.materialReceipts.set([]);
      this.assets.set([]);
      this.repairs.set([]);
      this.hires.set([]);
      this.loadingRepairs.set(false);
      this.router.navigate(['/admin/staffs', this.staffId, 'dashboard'], {
        queryParams: { fiscal_year_id: null },
        queryParamsHandling: 'merge',
        state: { staff: this.staff },
      });
      this.loadData();
      return;
    }

    const yearId = Number(value);
    const year = this.fiscalYears().find((item) => item.fiscal_year_id === yearId);
    if (year) this.selectFiscalYear(year);
  }

  loadData() {
    this.loading.set(true);
    this.loadingMaterialHistory.set(true);
    this.loadingRepairs.set(true);
    this.loadingHires.set(true);
    this.loadingInspections.set(true);
    // Fetch summary
    this.service.getSummary(this.staffId, this.fiscalYearId).subscribe({
      next: (data) => this.summary.set(data),
      error: (error) => console.error(error),
    });

    // Fetch procurements
    this.service.getProcurements(this.staffId, this.fiscalYearId).subscribe({
      next: (data) => this.procurements.set(data),
      error: (error) => console.error(error),
    });

    this.service.getInspectedProcurements(this.staffId, this.fiscalYearId).subscribe({
      next: (data) => this.inspectedProcurements.set(data),
      error: (error) => {
        console.error(error);
        this.loadingInspections.set(false);
      },
      complete: () => this.loadingInspections.set(false),
    });

    this.materialReceipts.set([]);
    this.service.getMaterialWithdrawals(this.staffId, this.fiscalYearId).subscribe({
      next: (data) => {
        this.materialWithdrawals.set(data);
        this.loadMaterialReceipts(data);
      },
      error: (error) => {
        console.error(error);
        this.materialWithdrawals.set([]);
        this.materialReceipts.set([]);
        this.loadingMaterialHistory.set(false);
      },
    });

    // Fetch assets
    this.service.getAssets(this.staffId, this.fiscalYearId).subscribe({
      next: (data) => this.assets.set(data),
      error: (error) => console.error(error),
      complete: () => this.loading.set(false),
    });

    this.service.getAssetRepairs(this.staffId, this.fiscalYearId).subscribe({
      next: (data) => this.repairs.set(data),
      error: (error) => {
        console.error(error);
        this.loadingRepairs.set(false);
      },
      complete: () => this.loadingRepairs.set(false),
    });

    this.service.getHires(this.staffId, this.fiscalYearId).subscribe({
      next: (data) => this.hires.set(data),
      error: (error) => {
        console.error(error);
        this.loadingHires.set(false);
      },
      complete: () => this.loadingHires.set(false),
    });
  }

  private loadMaterialReceipts(withdrawals: StaffDashboardMaterialWithdrawal[]) {
    this.materialReceipts.set([]);
    this.loadingMaterialHistory.set(true);
    const materialIds = [...new Set(withdrawals.map((item) => item.material_item_id))];
    const relevantIssueIds = new Set(withdrawals.map((item) => item.issue_detail_id));
    if (materialIds.length === 0) {
      this.loadingMaterialHistory.set(false);
      return;
    }

    forkJoin(
      materialIds.map((id) =>
        this.stockCardService
          .getStockCard(id, this.fiscalYearId)
          .pipe(catchError((error) => {
            console.error(error);
            return of([]);
          })),
      ),
    ).subscribe({
      next: (cardsByMaterial) => {
        this.materialReceipts.set(
          cardsByMaterial.flat().filter(
            (card) =>
              card.transaction_type === 'IN' &&
              card.issue_detail_id != null &&
              relevantIssueIds.has(card.issue_detail_id),
          ),
        );
        this.loadingMaterialHistory.set(false);
      },
    });
  }

  selectSection(section: 'procurements' | 'materials' | 'assets' | 'repairs' | 'hires' | 'inspections') {
    this.selectedSection.set(section);
    this.searchQuery.set('');
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { section: section },
      queryParamsHandling: 'merge'
    });
  }

  clearSection() {
    this.selectedSection.set(null);
    this.searchQuery.set('');
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { section: null },
      queryParamsHandling: 'merge'
    });
  }

  openProcurementDetail(procurement: StaffDashboardProcurement) {
    this.router.navigate(
      ['/admin/procurements/detail', procurement.procurement_record_id],
      {
        queryParams: this.fiscalYearId ? { fiscal_year_id: this.fiscalYearId } : {},
        state: { project: procurement, staff: this.staff || this.summary(), procurement },
      }
    );
  }

  openInspectedProcurementDetail(procurement: StaffDashboardProcurement) {
    this.router.navigate(['/admin/procurements/detail', procurement.procurement_record_id], {
      state: { fromStaffDashboard: true, staffId: this.staffId,
        fiscalYearId: this.fiscalYearId, dashboardSection: 'inspections' },
    });
  }

  openAssetDetail(asset: StaffDashboardAsset) {
    this.router.navigate(
      ['/admin/assetItems/details', asset.asset_id],
      {
        queryParams: this.fiscalYearId ? { fiscal_year_id: this.fiscalYearId } : {},
        state: { staff: this.staff || this.summary(), asset },
      }
    );
  }

  openRepairDetail(repair: StaffDashboardAssetRepair) {
    this.router.navigate(['/admin/assetRepairs/detail', repair.asset_repair_id], {
      state: { fromStaffDashboard: true, staffId: this.staffId, fiscalYearId: this.fiscalYearId },
    });
  }

  openHireDetail(hire: StaffDashboardHire) {
    this.router.navigate(['/admin/procurements/detail', hire.procurement_record_id], {
      state: { fromStaffDashboard: true, staffId: this.staffId, fiscalYearId: this.fiscalYearId },
    });
  }

  showHireItems(hire: StaffDashboardHire) {
    this.selectedHire.set(hire);
  }

  closeHireItems() {
    this.selectedHire.set(null);
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    this.closeHireItems();
  }

  openAssetSubItems(asset: StaffDashboardAsset) {
    this.router.navigate(
      ['/admin/staffs', this.staffId, 'dashboard', 'assets', asset.asset_id, 'sub-items'],
      {
        queryParams: {
          section: 'assets',
          ...(this.fiscalYearId ? { fiscal_year_id: this.fiscalYearId } : {}),
        },
        state: {
          staff: this.staff || this.summary(),
          fiscalYear: this.fiscalYear,
          asset,
        },
      },
    );
  }

  private getFiscalYearId() {
    const value =
      this.route.snapshot.queryParamMap.get('fiscal_year_id') ??
      this.route.snapshot.queryParamMap.get('fiscalYearId');
    const fiscalYearId = value ? Number(value) : null;
    return fiscalYearId && Number.isFinite(fiscalYearId) && fiscalYearId > 0 ? fiscalYearId : null;
  }
}
