import { Params } from './../../shared/models/allType';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DataTableComponent } from '../../../shared/data-table/data-table.component';
import { Pagination } from '../../shared/models/pagination';
import { TableState } from '../../../shared/TableState';
import { AlertService } from '../../../shared.service';
import { projectsTypes } from './interface/projectsTypes';
import { ProjectsService } from './service/projects.service';
import { environment } from '../../../environments/environment.development';
import { FiscalyearsService } from '../fiscalyears/service/fiscalyears.service';
import { ProcurementrecordService } from '../procurementrecord/service/procurementrecord.service';
import { procurementrecordTypes } from '../procurementrecord/interface/procurementrecordTypes';
import { catchError, forkJoin, Observable, of, Subscription, switchMap } from 'rxjs';

type ProjectListRow = projectsTypes & {
  project_budget_remaining: number | null;
};

@Component({
  selector: 'app-departments',
  standalone: true,
  imports: [DataTableComponent],
  templateUrl: './projects.component.html',
})
export class ProjectsComponent implements OnInit, OnDestroy {
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  table = new TableState();
  private projectsService = inject(ProjectsService);
  private fiscalYearService = inject(FiscalyearsService);
  private procurementRecordService = inject(ProcurementrecordService);
  private alertService = inject(AlertService);
  private budgetSummarySubscription?: Subscription;

  project?: Pagination<projectsTypes>;
  projects = signal<ProjectListRow[]>([]);
  baseFileUrl = environment.baseFileUrl;

  fiscalYears = signal<any[]>([]);
  fiscal_year_id = signal<number | null>(null);

  Params = new Params();

  ngOnInit(): void {
    const yearId = Number(this.route.snapshot.queryParamMap.get('fiscal_year_id'));
    this.fiscal_year_id.set(yearId > 0 ? yearId : null);
    this.loadDropdowns();
    this.getProject();
  }

  ngOnDestroy(): void {
    this.budgetSummarySubscription?.unsubscribe();
  }

  getProject() {
    this.projectsService.getProjects(this.table.params, this.fiscal_year_id()).subscribe({
      next: (response) => {
        this.project = response;
        const rows: ProjectListRow[] = response.data.map((project) => ({
          ...project,
          project_budget_remaining: null,
        }));
        this.projects.set(rows);
        this.loadProjectBudgetSummaries(rows);
      },
      error: (error) => console.error(error),
    });
  }

  private loadProjectBudgetSummaries(projects: ProjectListRow[]) {
    this.budgetSummarySubscription?.unsubscribe();
    if (projects.length === 0) return;

    this.budgetSummarySubscription = forkJoin(
      projects.map((project) =>
        this.getProjectProcurementTotal(project.project_id).pipe(
          catchError((error) => {
            console.error(`โหลดสรุปงบประมาณโครงการ ${project.project_id} ไม่สำเร็จ`, error);
            return of(null);
          }),
        ),
      ),
    ).subscribe((totals) => {
      this.projects.update((rows) =>
        rows.map((row) => {
          const index = projects.findIndex((project) => project.project_id === row.project_id);
          if (index < 0 || totals[index] === null) return row;

          const procurementTotal = totals[index] ?? 0;
          return {
            ...row,
            project_budget_remaining: Number(row.project_budget_amount || 0) - procurementTotal,
          };
        }),
      );
    });
  }

  private getProjectProcurementTotal(projectId: number): Observable<number> {
    const loadPage = (
      pageNumber: number,
      collected: procurementrecordTypes[],
    ): Observable<number> => {
      const params = new Params();
      params.pageSize = 50;
      params.pageNumber = pageNumber;

      return this.procurementRecordService.getProcurementrecords(params, projectId).pipe(
        switchMap((response) => {
          const records = [...collected, ...response.data];
          if (records.length < response.count) {
            return loadPage(pageNumber + 1, records);
          }

          return of(
            records
              .filter((record) => record.status?.trim() !== 'ยกเลิก')
              .reduce((sum, record) => sum + Number(record.total_amount || 0), 0),
          );
        }),
      );
    };

    return loadPage(1, []);
  }

  loadDropdowns() {
    const params = new Params();
    params.pageSize = 100;

    this.fiscalYearService.getFiscalyears(params).subscribe({
      next: (res) => this.fiscalYears.set(res.data),
      error: (err) => console.error(err),
    });
  }

  onSearch(value: string) {
    this.table.onSearch(value, () => this.getProject());
  }

  onPageChange(page: number) {
    this.table.onPageChange(page, () => this.getProject());
  }

  onSort(value: string) {
    this.table.onSort(value, () => this.getProject());
  }

  onFilterChange(event: any) {
    this.fiscal_year_id.set(Number(event.value) || null);
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { fiscal_year_id: this.fiscal_year_id() },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
    this.table.params.pageNumber = 1;
    this.getProject();
  }

  deleteProject(id: number) {
    this.alertService.confirm('ยืนยันการลบ', 'คุณต้องการลบคำนำหน้านี้หรือไม่?').then((result) => {
      if (result.isConfirmed) {
        this.confirmDelete(id);
        this.alertService.successNo('ลบเรียบร้อยแล้ว');
      }
    });
  }

  confirmDelete(id: number) {
    this.projectsService.deleteProjects(id).subscribe({
      next: () => this.getProject(),
      error: (error) => console.error(error),
    });
  }

  goToCreate() {
    this.router.navigate(['/admin/projects/create']);
  }

  goToEdit(projects: projectsTypes) {
    this.router.navigate(['/admin/projects/update', projects.project_id], {
      state: { projects },
    });
  }

  gotoPathTo(event: { type: string; item: projectsTypes }) {
    const projects = event.item;

    if (event.type !== 'pathTo') return;

    this.router.navigate(['/admin/project/procurementrecord'], {
      queryParams: {
        project_id: projects.project_id,
        fiscal_year_id: projects.fiscal_year_id,
      },
      state: { projects },
    });
  }

  sortOptions = [
    { label: 'ชื่อ ก-ฮ', value: 'nameAsc' },
    { label: 'ชื่อ ฮ-ก', value: 'nameDesc' },
    { label: 'ใหม่ล่าสุด', value: 'latest' },
    { label: 'เก่าสุด', value: 'oldest' },
  ];

  columns: {
    label: string;
    key: string;
    type?: 'text' | 'price' | 'badge' | 'file';
    pipe?: 'thaiDate';
    sortAsc?: string;
    sortDesc?: string;
  }[] = [
    {
      label: 'วันที่สร้าง',
      key: 'created_at',
      pipe: 'thaiDate',
      sortDesc: 'latest',
      sortAsc: 'oldest',
    },
    {
      label: 'รหัสโครงการ',
      key: 'project_code',
      sortAsc: 'nameAsc',
      sortDesc: 'nameDesc',
    },
    {
      label: 'ปีโครงการ',
      key: 'fiscal_year_name',
    },
    {
      label: 'งบประมาณ',
      key: 'project_budget_amount',
      type: 'price',
    },
    {
      label: 'งบคงเหลือ',
      key: 'project_budget_remaining',
      type: 'price',
    },
    {
      label: 'ผู้รับผิดชอบ',
      key: 'staff_name',
    },
    {
      label: 'ไฟล์แนบ',
      key: 'filePath',
      type: 'file',
    },
  ];
  filterOptions = computed(() => [
    {
      key: 'fiscal_year_id',
      label: 'ปีงบประมาณ',
      options: this.fiscalYears().map((x) => ({
        label: x.fiscal_year,
        value: x.fiscal_year_id,
      })),
    },
  ]);
}
