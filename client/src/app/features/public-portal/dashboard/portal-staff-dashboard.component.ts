import { SystemSettingsService } from '../../../core/services/system-settings.service';
import { CommonModule, DecimalPipe } from '@angular/common';
import { Component, HostListener, inject, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  PublicPortalService,
  PublicPortalStaffLookup,
  PublicPortalStaffSummary,
  PublicPortalProcurementSummary,
  PublicPortalStaffAssetItem,
  PublicPortalFiscalYear,
  PublicPortalMaterialWithdrawalHistory,
  PublicPortalStaffHire,
} from '../shared/public-portal.service';
import { ThaiDatePipe } from '../shared/thai-date.pipe';
import { catchError, forkJoin, of } from 'rxjs';
import {
  AssetDisposalService,
  DisposalDocument,
} from '../../assetItems/service/asset-disposal.service';
import { MaterialStockCardService } from '../../materialStockCard/service/materialStockCard.service';
import { MaterialStockCardTypes } from '../../materialStockCard/interface/materialStockCardTypes';

type PortalMaterialMovement = {
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
  procurementRecordId: number;
};

type PortalSection = 'procurements' | 'materials' | 'assets' | 'hires' | 'inspections';
const PORTAL_SECTIONS: PortalSection[] = ['procurements', 'materials', 'assets', 'hires', 'inspections'];

@Component({
  selector: 'app-portal-staff-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, DecimalPipe, ThaiDatePipe],
  templateUrl: './portal-staff-dashboard.component.html',
})
export class PortalStaffDashboardComponent {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private service = inject(PublicPortalService);
  private stockCardService = inject(MaterialStockCardService);
  private settings = inject(SystemSettingsService);
  private disposalService = inject(AssetDisposalService);

  disposalAsset = signal<PublicPortalStaffAssetItem | null>(null);
  disposalDocs = signal<DisposalDocument[]>([]);
  loadingDisposal = signal(false);

  staffId = Number(this.route.snapshot.paramMap.get('staffId'));
  staff = history.state?.staff as PublicPortalStaffLookup | undefined;
  fiscalYearId: number | null = this.getFiscalYearId();
  fiscalYear = history.state?.fiscalYear as { fiscal_year?: number; year_name?: string | null } | undefined;
  loading = signal(false);
  loadingYears = signal(false);
  selectedSection = signal<PortalSection | null>(null);
  searchQuery = signal('');

  summary = signal<PublicPortalStaffSummary | null>(null);
  procurements = signal<PublicPortalProcurementSummary[]>([]);
  materialWithdrawals = signal<PublicPortalMaterialWithdrawalHistory[]>([]);
  assets = signal<PublicPortalStaffAssetItem[]>([]);
  fiscalYears = signal<PublicPortalFiscalYear[]>([]);
  inspectedProcurements = signal<PublicPortalProcurementSummary[]>([]);
  hires = signal<PublicPortalStaffHire[]>([]);
  selectedHire = signal<PublicPortalStaffHire | null>(null);
  materialReceipts = signal<MaterialStockCardTypes[]>([]);
  loadingMaterialHistory = signal(false);
  loadingHires = signal(false);
  loadingInspections = signal(false);

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

  materialMovements = computed<PortalMaterialMovement[]>(() => {
    const withdrawals = this.materialWithdrawals();
    const relatedByIssueId = new Map<number, PublicPortalMaterialWithdrawalHistory>();
    for (const item of withdrawals) relatedByIssueId.set(item.issue_detail_id, item);

    const inMovements: PortalMaterialMovement[] = this.materialReceipts()
      .filter((item) => item.transaction_type === 'IN' && Number(item.quantity_in) > 0)
      .flatMap((item) => {
        const related = relatedByIssueId.get(Number(item.issue_detail_id));
        if (!related) return [];
        const quantity = Number(item.quantity_in || 0);
        const unitPrice = Number(item.unit_price || 0);
        return [
          {
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
            quantity,
            unitPrice,
            totalAmount: quantity * unitPrice,
            remark: null,
            procurementRecordId: related.procurement_record_id,
          },
        ];
      });

    const outMovements: PortalMaterialMovement[] = withdrawals
      .filter((item) => item.department_id != null && item.department_id !== this.settings.centralDepartmentId() && Number(item.quantity) > 0)
      .map((item) => ({
        direction: 'OUT' as const,
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

  filteredMaterialMovements = computed(() => {
    const list = this.materialMovements();
    const query = this.searchQuery().toLowerCase().trim();
    if (!query) return list;
    return list.filter((item) =>
      [
        item.materialName,
        item.documentNo,
        item.withdrawalDocumentNo,
        item.materialCode,
        item.projectName,
        item.projectCode,
        item.remark,
      ].some((value) => value?.toLowerCase().includes(query)),
    );
  });

  constructor() {
    const sectionParam = this.route.snapshot.queryParamMap.get('section');
    if (PORTAL_SECTIONS.includes(sectionParam as PortalSection)) {
      this.selectedSection.set(sectionParam as PortalSection);
    }

    if (this.fiscalYearId) {
      this.loadData();
    } else {
      this.loadFiscalYears();
    }
  }

  loadFiscalYears() {
    this.loadingYears.set(true);
    this.service.getStaffFiscalYears(this.staffId).subscribe({
      next: (data) => this.fiscalYears.set(data),
      error: (error) => console.error(error),
      complete: () => this.loadingYears.set(false),
    });
  }

  changeFiscalYear() {
    this.fiscalYearId = null;
    this.fiscalYear = undefined;
    this.selectedSection.set(null);
    this.searchQuery.set('');
    this.summary.set(null);
    this.router.navigate(['/portal/staffs', this.staffId, 'dashboard'], {
      state: { staff: this.staff },
    });
    this.loadFiscalYears();
  }

  selectFiscalYear(year: PublicPortalFiscalYear) {
    this.fiscalYearId = year.fiscal_year_id;
    this.fiscalYear = year;
    this.searchQuery.set('');
    this.summary.set(null);
    this.procurements.set([]);
    this.materialWithdrawals.set([]);
    this.assets.set([]);
    this.inspectedProcurements.set([]);
    this.hires.set([]);

    this.router.navigate(['/portal/staffs', this.staffId, 'dashboard'], {
      queryParams: { fiscal_year_id: year.fiscal_year_id },
      queryParamsHandling: 'merge',
      state: { staff: this.staff, fiscalYear: year },
    });

    this.loadData();
  }

  loadData() {
    this.loading.set(true);
    // Fetch summary
    this.service.getStaffSummary(this.staffId, this.fiscalYearId).subscribe({
      next: (data) => this.summary.set(data),
      error: (error) => console.error(error),
    });

    // Fetch procurements
    this.service.getStaffProcurements(this.staffId, this.fiscalYearId).subscribe({
      next: (data) => this.procurements.set(data),
      error: (error) => console.error(error),
    });

    this.materialReceipts.set([]);
    this.loadingMaterialHistory.set(true);
    this.service.getStaffMaterialWithdrawals(this.staffId, this.fiscalYearId).subscribe({
      next: (data) => {
        this.materialWithdrawals.set(data);
        this.loadMaterialReceipts(data);
      },
      error: (error) => {
        console.error(error);
        this.materialWithdrawals.set([]);
        this.loadingMaterialHistory.set(false);
      },
    });

    // Fetch assets
    this.service.getStaffAssets(this.staffId, this.fiscalYearId).subscribe({
      next: (data) => this.assets.set(data),
      error: (error) => console.error(error),
      complete: () => this.loading.set(false),
    });

    this.loadingInspections.set(true);
    this.service.getStaffInspectedProcurements(this.staffId, this.fiscalYearId).subscribe({
      next: (data) => this.inspectedProcurements.set(data),
      error: (error) => {
        console.error(error);
        this.loadingInspections.set(false);
      },
      complete: () => this.loadingInspections.set(false),
    });

    this.loadingHires.set(true);
    this.service.getStaffHires(this.staffId, this.fiscalYearId).subscribe({
      next: (data) => this.hires.set(data),
      error: (error) => {
        console.error(error);
        this.loadingHires.set(false);
      },
      complete: () => this.loadingHires.set(false),
    });
  }

  filteredInspections = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    const list = this.inspectedProcurements();
    if (!query) return list;
    return list.filter((item) =>
      [item.document_no, item.project_name, item.project_code, item.expense_type_name, item.status].some(
        (value) => value?.toLowerCase().includes(query),
      ),
    );
  });

  filteredHires = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    const list = this.hires();
    if (!query) return list;
    return list.filter((hire) =>
      [hire.document_no, hire.project_code, hire.project_name, hire.vendor_name, hire.status, ...hire.hire_names].some(
        (value) => value?.toLowerCase().includes(query),
      ),
    );
  });

  private loadMaterialReceipts(withdrawals: PublicPortalMaterialWithdrawalHistory[]) {
    const materialIds = [...new Set(withdrawals.map((item) => item.material_item_id))];
    const relevantIssueIds = new Set(withdrawals.map((item) => item.issue_detail_id));
    if (materialIds.length === 0) {
      this.loadingMaterialHistory.set(false);
      return;
    }

    forkJoin(
      materialIds.map((id) =>
        this.stockCardService.getStockCard(id, this.fiscalYearId).pipe(
          catchError((error) => {
            console.error(error);
            return of([] as MaterialStockCardTypes[]);
          }),
        ),
      ),
    ).subscribe({
      next: (cardsByMaterial) => {
        this.materialReceipts.set(
          cardsByMaterial
            .flat()
            .filter(
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

  openMaterialDocument(item: PortalMaterialMovement) {
    this.router.navigate(
      ['/portal/staffs', this.staffId, 'procurements', item.procurementRecordId],
      {
        queryParams: {
          ...(this.fiscalYearId ? { fiscal_year_id: this.fiscalYearId } : {}),
          section: 'materials',
        },
        state: { staff: this.staff || this.summary() },
      },
    );
  }

  openHireDetail(hire: PublicPortalStaffHire) {
    this.router.navigate(['/portal/staffs', this.staffId, 'procurements', hire.procurement_record_id], {
      queryParams: { ...(this.fiscalYearId ? { fiscal_year_id: this.fiscalYearId } : {}), section: 'hires' },
      state: { staff: this.staff || this.summary() },
    });
  }

  showHireItems(hire: PublicPortalStaffHire) {
    this.selectedHire.set(hire);
  }

  closeHireItems() {
    this.selectedHire.set(null);
  }

  openDisposalDocs(asset: PublicPortalStaffAssetItem, event: Event) {
    event.stopPropagation();
    this.disposalAsset.set(asset);
    this.disposalDocs.set([]);
    this.loadingDisposal.set(true);
    this.disposalService.documents(asset.asset_id, null).subscribe({
      next: (docs) => this.disposalDocs.set(docs),
      error: (error) => {
        console.error(error);
        this.loadingDisposal.set(false);
      },
      complete: () => this.loadingDisposal.set(false),
    });
  }

  closeDisposalDocs() {
    this.disposalAsset.set(null);
  }

  openDisposalFile(doc: DisposalDocument) {
    this.disposalService.download(doc.disposal_document_id).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      },
      error: (error) => console.error(error),
    });
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    this.closeHireItems();
    this.closeDisposalDocs();
  }

  selectSection(section: PortalSection) {
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

  openProcurementDetail(procurement: PublicPortalProcurementSummary) {
    this.router.navigate(
      ['/portal/staffs', this.staffId, 'procurements', procurement.procurement_record_id],
      {
        queryParams: {
          ...(this.fiscalYearId ? { fiscal_year_id: this.fiscalYearId } : {}),
          ...(this.selectedSection() ? { section: this.selectedSection() } : {}),
        },
        state: { project: procurement, staff: this.staff || this.summary(), procurement },
      }
    );
  }

  openAssetDetail(asset: PublicPortalStaffAssetItem) {
    this.router.navigate(
      ['/portal/staffs', this.staffId, 'assets', asset.asset_id, 'withdrawals', asset.procurement_withdrawal_id],
      {
        queryParams: this.fiscalYearId ? { fiscal_year_id: this.fiscalYearId } : {},
        state: { staff: this.staff || this.summary(), asset },
      }
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
