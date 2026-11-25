import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Params } from '../../../shared/models/allType';
import { FiscalyearsService } from '../../fiscalyears/service/fiscalyears.service';
import { FacultyDepartmentStock, FacultyMaterialStock } from '../interface/facultyStockTypes';
import { MaterialItemsService } from '../service/materialItems.service';
import { DepartmentService } from '../../departments/service/department.service';
import { SystemSettingsService } from '../../../core/services/system-settings.service';

@Component({
  selector: 'app-faculty-stock', standalone: true,
  imports: [DecimalPipe, FormsModule, RouterLink],
  templateUrl: './faculty-stock.component.html',
})
export class FacultyStockComponent implements OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private service = inject(MaterialItemsService);
  private fiscalyears = inject(FiscalyearsService);
  private departmentsService = inject(DepartmentService);
  private settings = inject(SystemSettingsService);
  isCentral = (departmentId: number) => departmentId === this.settings.centralDepartmentId();
  private centralFirst = (a: { department_id: number }, b: { department_id: number }) =>
    this.isCentral(a.department_id) ? -1 : this.isCentral(b.department_id) ? 1 : a.department_id - b.department_id;
  years = signal<Array<{ fiscal_year_id: number; fiscal_year: number }>>([]);
  yearId = signal<number | null>(null);
  yearLabel = signal<number | null>(null);
  items = signal<FacultyMaterialStock[]>([]);
  tab = signal<'faculty' | 'departments'>('faculty');
  departmentId = signal<number | null>(null);
  departmentOptions = signal<Array<{ department_id: number; department_name: string }>>([]);
  onlyRemaining = signal(false);
  collapsedDepartments = signal<Set<number>>(new Set());
  visibleItems = computed(() => this.items().filter(item =>
    !this.onlyRemaining() || item.current_balance !== 0));
  departmentGroups = computed(() => {
    const groups = new Map<number, { department_id: number; department_name: string;
      rows: Array<FacultyMaterialStock & FacultyDepartmentStock>; total: number; missingPrice: boolean }>();
    for (const material of this.items()) {
      for (const department of material.departments) {
        let group = groups.get(department.department_id);
        if (!group) {
          group = { department_id: department.department_id, department_name: department.department_name,
            rows: [], total: 0, missingPrice: false };
          groups.set(department.department_id, group);
        }
        if (this.onlyRemaining() && department.current_balance === 0) continue;
        group.rows.push({ ...material, ...department });
        if (material.unit_price === null && department.current_balance !== 0) group.missingPrice = true;
        group.total += department.current_balance * (material.unit_price ?? 0);
      }
    }
    return [...groups.values()].sort(this.centralFirst);
  });
  search = '';
  visibleDepartmentGroups = computed(() => this.departmentGroups().filter(group =>
    !this.departmentId() || group.department_id === this.departmentId()));
  loading = signal(false);
  error = signal(false);
  exportOpen = signal(false);
  exporting = signal(false);
  exportError = signal('');
  exportYearId: number | null = null;
  exportScope: 'faculty' | 'departments' = 'faculty';
  exportDepartmentId: number | null = null;
  private searchTimer?: ReturnType<typeof setTimeout>;
  private loadedQueryKey?: string;

  // Computed summary metrics
  totalAllItems = computed(() => this.items().length);
  totalVisibleItems = computed(() => this.visibleItems().length);
  inStockCount = computed(() => this.items().filter(item => item.current_balance > 0).length);
  outOfStockCount = computed(() => this.items().filter(item => item.current_balance <= 0).length);
  discrepancyCount = computed(() => this.visibleItems().filter(item => item.has_discrepancy || item.current_balance < 0).length);

  totalStockValue = computed(() => {
    return this.visibleItems().reduce((sum, item) => {
      if (item.total_amount !== null && !isNaN(item.total_amount)) {
        return sum + item.total_amount;
      }
      if (item.unit_price !== null && !isNaN(item.unit_price)) {
        return sum + (item.current_balance * item.unit_price);
      }
      return sum;
    }, 0);
  });

  hasMissingPrices = computed(() =>
    this.visibleItems().some(item => item.unit_price === null && item.current_balance > 0)
  );

  totalOpeningBalance = computed(() =>
    this.visibleItems().reduce((sum, item) => sum + (item.opening_balance || 0), 0)
  );

  totalQuantityIn = computed(() =>
    this.visibleItems().reduce((sum, item) => sum + (item.quantity_in || 0), 0)
  );

  totalQuantityOut = computed(() =>
    this.visibleItems().reduce((sum, item) => sum + (item.quantity_out || 0), 0)
  );

  totalCurrentBalance = computed(() =>
    this.visibleItems().reduce((sum, item) => sum + (item.current_balance || 0), 0)
  );

  ngOnInit(): void {
    const params = new Params();
    params.pageSize = 100;
    this.fiscalyears.getFiscalyears(params).subscribe({
      next: (res) => this.years.set(res.data),
    });
    const departmentParams = new Params();
    departmentParams.pageSize = 1000;
    this.departmentsService.getDepartments(departmentParams).subscribe({
      next: (res) => this.departmentOptions.set([...res.data].sort(this.centralFirst)),
    });
    this.route.queryParamMap.subscribe((query) => {
      this.yearId.set(Number(query.get('fiscal_year_id')) || null);
      this.search = query.get('search') ?? '';
      this.tab.set(query.get('tab') === 'departments' ? 'departments' : 'faculty');
      this.departmentId.set(Number(query.get('department_id')) || null);
      this.onlyRemaining.set(query.get('remaining') === 'true');
      const key = `${this.yearId()}:${this.search}`;
      if (key !== this.loadedQueryKey) {
        this.loadedQueryKey = key;
        this.load();
      }
    });
  }

  load(): void {
    this.loading.set(true);
    this.error.set(false);
    this.service.getFacultyStock(this.yearId(), this.search).subscribe({
      next: (res) => {
        this.items.set(res.items);
        this.yearLabel.set(res.fiscal_year);
        this.loading.set(false);
      },
      error: () => { this.error.set(true); this.loading.set(false); },
    });
  }

  onYearChange(value: number | null): void {
    this.router.navigate([], { relativeTo: this.route,
      queryParams: { fiscal_year_id: value || null }, queryParamsHandling: 'merge' });
  }

  onSearch(value: string): void {
    this.search = value;
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.router.navigate([], { relativeTo: this.route,
      queryParams: { search: value || null }, queryParamsHandling: 'merge', replaceUrl: true }), 300);
  }

  onTabChange(tab: 'faculty' | 'departments'): void {
    this.router.navigate([], { relativeTo: this.route,
      queryParams: { tab: tab === 'departments' ? tab : null }, queryParamsHandling: 'merge' });
  }

  onRemainingChange(value: boolean): void {
    this.router.navigate([], { relativeTo: this.route,
      queryParams: { remaining: value ? 'true' : null }, queryParamsHandling: 'merge' });
  }

  onDepartmentChange(value: number | null): void {
    this.router.navigate([], { relativeTo: this.route,
      queryParams: { department_id: value || null }, queryParamsHandling: 'merge' });
  }

  toggleDepartment(id: number): void {
    this.collapsedDepartments.update(current => {
      const next = new Set(current);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  expandAllDepartments(): void {
    this.collapsedDepartments.set(new Set());
  }

  collapseAllDepartments(): void {
    this.collapsedDepartments.set(new Set(this.departmentGroups().map(group => group.department_id)));
  }

  clearSearch(): void {
    this.search = '';
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { search: null },
      queryParamsHandling: 'merge',
      replaceUrl: true
    });
  }

  resetFilters(): void {
    this.search = '';
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { search: null, fiscal_year_id: null, remaining: null, department_id: null },
      queryParamsHandling: 'merge'
    });
  }

  refresh(): void {
    this.load();
  }

  openPdfExport(): void {
    this.exportYearId = this.yearId();
    this.exportScope = this.tab();
    this.exportDepartmentId = this.departmentId();
    this.exportError.set('');
    this.exportOpen.set(true);
  }

  downloadPdf(): void {
    if (this.exporting()) return;
    this.exporting.set(true);
    this.exportError.set('');
    const scope = this.exportScope;
    const year = this.years().find(x => x.fiscal_year_id === this.exportYearId)?.fiscal_year ?? 'all-years';
    this.service.exportFacultyStockPdf(this.exportYearId, scope, this.exportDepartmentId, this.search, this.onlyRemaining()).subscribe({
      next: blob => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `material-stock-${scope}-${year}.pdf`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        this.exporting.set(false);
        this.exportOpen.set(false);
      },
      error: () => {
        this.exporting.set(false);
        this.exportError.set('ส่งออก PDF ไม่สำเร็จ กรุณาลองอีกครั้ง');
      },
    });
  }

  ngOnDestroy(): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
  }
}
