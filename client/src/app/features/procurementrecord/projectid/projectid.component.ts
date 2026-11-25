import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TableState } from '../../../../shared/TableState';
import { ProcurementrecordService } from '../service/procurementrecord.service';
import { AlertService } from '../../../../shared.service';
import { procurementrecordTypes } from '../interface/procurementrecordTypes';
import { Pagination } from '../../../shared/models/pagination';
import { environment } from '../../../../environments/environment.development';
import { Params } from '../../../shared/models/allType';
import { DataTableComponent } from '../../../../shared/data-table/data-table.component';
import { projectsTypes } from '../../projects/interface/projectsTypes';
import { ExpensetypesService } from '../../expenseTypes/service/expenseTypes.service';
import { expenseTypes } from '../../expenseTypes/interface/expenseTypes';
import { ProjectsService } from '../../projects/service/projects.service';

@Component({
  selector: 'app-projectid',
  imports: [DataTableComponent],
  templateUrl: './projectid.component.html',
})
export class ProjectidComponent {
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private table = new TableState();
  private procurementrecordService = inject(ProcurementrecordService);
  private expenseTypesService = inject(ExpensetypesService);
  private projectsService = inject(ProjectsService);
  private alertService = inject(AlertService);

  project_id = signal<number | null>(null);
  expense_type_id = signal<number | null>(null);
  status = signal<string | null>(null);
  expenseTypes = signal<expenseTypes[]>([]);
  procurementrecord?: Pagination<procurementrecordTypes>;
  procurementrecords = signal<procurementrecordTypes[]>([]);

  baseFileUrl = environment.baseFileUrl;
  projectstate: projectsTypes | null = history.state?.projects?.projects ?? history.state?.projects ?? null;
  Params = this.table.params;

  private readonly statusOptions = {
    ร่าง: 'ร่าง',
    รออนุมัติ: 'รออนุมัติ',
    อนุมัติแล้ว: 'อนุมัติแล้ว',
    รอเบิกจ่าย: 'รอเบิกจ่าย',
    เบิกจ่ายแล้ว: 'เบิกจ่ายแล้ว',
    ขึ้นทะเบียนแล้ว: 'ขึ้นทะเบียนแล้ว',
    เสร็จสิ้น: 'เสร็จสิ้น',
    ยกเลิก: 'ยกเลิก',
  };

  filterOptions = computed(() => [
    {
      key: 'expense_type_id',
      label: 'เบิกจ่าย',
      options: this.expenseTypes().map((type) => ({
        label: type.expense_type_name,
        value: type.expense_type_id,
      })),
    },
    {
      key: 'status',
      label: 'สถานะ',
      options: Object.values(this.statusOptions).map((status) => ({
        label: status,
        value: status,
      })),
    },
  ]);

  ngOnInit(): void {
    this.loadExpenseTypes();
    this.route.queryParamMap.subscribe((params) => {
      const projectId = Number(params.get('project_id'));

      if (projectId && Number.isFinite(projectId)) {
        this.project_id.set(projectId);
        if (this.projectstate?.project_id !== projectId) {
          this.projectsService.getProject(projectId).subscribe({
            next: (project) => this.projectstate = project,
            error: () => this.projectstate = null,
          });
        }
      } else {
        this.project_id.set(null);
      }

      this.getProcurementrecord();
    });
  }

  getProcurementrecord() {
    this.procurementrecordService
      .getProcurementrecords(this.table.params, this.project_id(), this.expense_type_id(), null, this.status())
      .subscribe({
        next: (response) => {
          this.procurementrecord = response;
          this.procurementrecords.set(response.data);
        },
        error: (error) => console.error(error),
      });
  }

  onSearch(value: string) {
    this.table.onSearch(value, () => this.getProcurementrecord());
  }

  onPageChange(page: number) {
    this.table.onPageChange(page, () => this.getProcurementrecord());
  }

  onSort(value: string) {
    this.table.onSort(value, () => this.getProcurementrecord());
  }

  onFilterChange(event: { key: string; value: unknown }) {
    if (event.key === 'expense_type_id') {
      const expenseTypeId = event.value ? Number(event.value) : null;
      this.expense_type_id.set(expenseTypeId && Number.isFinite(expenseTypeId) ? expenseTypeId : null);
    } else if (event.key === 'status') {
      this.status.set(typeof event.value === 'string' && event.value ? event.value : null);
    } else {
      return;
    }

    this.table.params.pageNumber = 1;
    this.getProcurementrecord();
  }

  private loadExpenseTypes() {
    const params = new Params();
    params.pageSize = 100;

    this.expenseTypesService.getExpenseTypes(params).subscribe({
      next: (response) => this.expenseTypes.set(response.data),
      error: (error) => console.error(error),
    });
  }

  goToCreate() {
    this.router.navigate(['/admin/project/procurementrecord/create'], {
      queryParams: this.projectQueryParams(),
      state: { projects: this.projectstate },
    });
  }

  goToEdit(procurementrecord: procurementrecordTypes) {
    this.router.navigate(
      ['/admin/project/procurementrecord/update', procurementrecord.procurement_record_id],
      {
        queryParams: this.projectQueryParams(),
        state: { procurementrecord, projects: this.projectstate },
      },
    );
  }

  private projectQueryParams() {
    return {
      project_id: this.project_id(),
      fiscal_year_id: this.projectstate?.fiscal_year_id ??
        (Number(this.route.snapshot.queryParamMap.get('fiscal_year_id')) || null),
    };
  }

  onTableAction(event: { type: string; item: procurementrecordTypes }) {
    const procurementrecord = event.item;

    switch (event.type) {
      case 'detail':
        this.router.navigate(
          ['/admin/procurements/detail', procurementrecord.procurement_record_id],
          {
            queryParams: this.projectQueryParams(),
            state: { procurementrecord },
          },
        );
        break;

      case 'pathTo':
        if (procurementrecord.expense_type_name === 'ครุภัณฑ์') {
          this.router.navigate(['/admin/assetItems', procurementrecord.procurement_record_id], {
            queryParams: this.projectQueryParams(),
            state: { procurementrecord },
          });
        } else if (procurementrecord.expense_type_name === 'จัดจ้าง') {
          this.router.navigate(['/admin/hireDetails', procurementrecord.procurement_record_id], {
            queryParams: this.projectQueryParams(),
            state: { procurementrecord },
          });
        } else if (procurementrecord.expense_type_name === 'วัสดุ') {
          this.router.navigate(
            ['/admin/materialReceiveDetails', procurementrecord.procurement_record_id],
            {
              queryParams: this.projectQueryParams(),
              state: {
                procurementrecord,
                project_id: this.project_id(),
                projectstate: this.projectstate,
              },
            },
          );
        }
        break;

      case 'status':
        this.openStatusPicker(procurementrecord);
        break;
    }
  }

  private openStatusPicker(procurementrecord: procurementrecordTypes) {
    this.alertService
      .select(
        'เปลี่ยนสถานะเอกสาร',
        `เลขที่เอกสาร ${procurementrecord.document_no}`,
        this.statusOptions,
        procurementrecord.status,
      )
      .then((result) => {
        const nextStatus = result.value;
        if (!result.isConfirmed || !nextStatus || nextStatus === procurementrecord.status) {
          return;
        }

        const saveStatus = (approvalDate?: string) => {
          this.procurementrecordService
            .updateProcurementrecordStatus(procurementrecord.procurement_record_id, {
              to_status: nextStatus,
              ...(approvalDate ? { approval_date: approvalDate } : {}),
            })
            .subscribe({
              next: () => {
                this.alertService.successNo('เปลี่ยนสถานะเรียบร้อยแล้ว');
                this.getProcurementrecord();
              },
              error: () => {
                this.alertService.error('เปลี่ยนสถานะไม่สำเร็จ', 'กรุณาลองใหม่อีกครั้ง');
              },
            });
        };

        let approvalDate: string | undefined;
        if (nextStatus === 'อนุมัติแล้ว') {
          const today = new Date();
          today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
          approvalDate = today.toISOString().slice(0, 10);
        }

        saveStatus(approvalDate);
      });
  }
  cancel() {
    this.router.navigate(['/admin/projects'], {
      queryParams: { fiscal_year_id: this.projectQueryParams().fiscal_year_id },
    });
  }
  sortOptions = [
    { label: 'ชื่อ ก-ฮ', value: 'nameAsc' },
    { label: 'ชื่อ ฮ-ก', value: 'nameDesc' },
    { label: 'ใหม่ล่าสุด', value: 'latest' },
    { label: 'เก่าสุด', value: 'oldest' },
  ];

  badgeColors: Record<string, string> = {
    ร่าง: 'border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200',
    รออนุมัติ: 'border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100',
    อนุมัติแล้ว: 'border-sky-300 bg-sky-50 text-sky-900 hover:bg-sky-100',
    รอเบิกจ่าย: 'border-violet-300 bg-violet-50 text-violet-900 hover:bg-violet-100',
    เบิกจ่ายแล้ว: 'border-teal-300 bg-teal-50 text-teal-900 hover:bg-teal-100',
    ขึ้นทะเบียนแล้ว: 'border-indigo-300 bg-indigo-50 text-indigo-900 hover:bg-indigo-100',
    เสร็จสิ้น: 'border-green-300 bg-green-50 text-green-900 hover:bg-green-100',
    ยกเลิก: 'border-red-300 bg-red-50 text-red-800 hover:bg-red-100',
    // สีตามประเภทการเบิกจ่าย ให้ตรงกับสีของหน้าที่เกี่ยวข้อง (ครุภัณฑ์=ส้ม วัสดุ=เขียว จัดจ้าง=ม่วง)
    ครุภัณฑ์: 'border-orange-400 bg-orange-100 text-orange-900',
    วัสดุ: 'border-green-500 bg-green-100 text-green-900',
    จัดจ้าง: 'border-purple-400 bg-purple-100 text-purple-900',
  };

  columns: {
    label: string;
    key: string;
    type?: 'text' | 'price' | 'badge' | 'file';
    pipe?: 'thaiDate';
    dateFormat?: 'short' | 'long';
  }[] = [
    { label: 'วันที่', key: 'document_date', pipe: 'thaiDate', dateFormat: 'long' },
    { label: 'เลขที่เอกสาร', key: 'document_no' },
    { label: 'เอกสารขออนุมัติเลขที่', key: 'decree_document_no' },
    { label: 'เบิกจ่าย', key: 'expense_type_name' },
    // { label: 'ชื่อบริษัท', key: 'vendor_name' },
    { label: 'สถานะ', key: 'status', type: 'badge'},
    { label: 'ไฟล์แนบ', key: 'attachment_file_path', type: 'file' },
  ];
}
