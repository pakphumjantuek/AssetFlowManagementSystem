import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { DataTableComponent } from '../../../shared/data-table/data-table.component';
import { Pagination } from '../../shared/models/pagination';
import { Params } from '../../shared/models/allType';
import { TableState } from '../../../shared/TableState';
import { AlertService } from '../../../shared.service';
import { StaffsService } from './service/staffsType.service';
import { staffsType, staffsTypeCreate } from './interface/staffsType';
import { DepartmentService } from '../departments/service/department.service';
import { DepartmentType } from '../departments/interface/departmentType';
import { PositionsService } from '../positions/service/positions.service';
import { positionsType } from '../positions/interface/positionsType';
import { forkJoin } from 'rxjs';

@Component({
  selector: 'app-departments',
  standalone: true,
  imports: [DataTableComponent],
  templateUrl: './staffs.component.html',
})
export class StaffsComponent implements OnInit {
  private router = inject(Router);
  private table = new TableState();
  private staffsService = inject(StaffsService);
  private departmentService = inject(DepartmentService);
  private positionsService = inject(PositionsService);
  private alertService = inject(AlertService);

  staff?: Pagination<staffsType>;
  staffs = signal<staffsType[]>([]);
  staffDetails = signal<staffsType | null>(null);
  departments = signal<DepartmentType[]>([]);
  positions = signal<positionsType[]>([]);
  departmentId = signal<number | null>(null);
  positionId = signal<number | null>(null);

  Params = this.table.params;

  filterOptions = computed(() => [
    {
      key: 'department_id',
      label: 'สาขาวิชา',
      options: this.departments().map((department) => ({
        label: department.department_name,
        value: department.department_id,
      })),
    },
    {
      key: 'position_id',
      label: 'ตำแหน่ง',
      options: this.positions().map((position) => ({
        label: position.position_name,
        value: position.position_id,
      })),
    },
  ]);

  ngOnInit(): void {
    this.loadFilterOptions();
    this.getStaffs();
  }

  getStaffs() {
    this.staffsService.getStaffs(this.table.params, this.departmentId(), this.positionId()).subscribe({
      next: (response) => {
        this.staff = response;
        this.staffs.set(response.data);
      },
      error: (error) => console.error(error),
    });
  }

  onSearch(value: string) {
    this.table.onSearch(value, () => this.getStaffs());
  }

  onPageChange(page: number) {
    this.table.onPageChange(page, () => this.getStaffs());
  }

  onSort(value: string) {
    this.table.onSort(value, () => this.getStaffs());
  }

  onFilterChange(event: { key: string; value: unknown }) {
    const selectedId = event.value ? Number(event.value) : null;
    const id = selectedId && Number.isFinite(selectedId) ? selectedId : null;

    if (event.key === 'department_id') {
      this.departmentId.set(id);
    } else if (event.key === 'position_id') {
      this.positionId.set(id);
    } else {
      return;
    }

    this.table.params.pageNumber = 1;
    this.getStaffs();
  }

  private loadFilterOptions() {
    const params = new Params();
    params.pageSize = 100;

    forkJoin({
      departments: this.departmentService.getDepartments(params),
      positions: this.positionsService.getPositions(params),
    }).subscribe({
      next: ({ departments, positions }) => {
        this.departments.set(departments.data);
        this.positions.set(positions.data);
      },
      error: (error) => console.error(error),
    });
  }

  deletePrefixes(id: number) {
    this.alertService.confirm('ยืนยันการลบ', 'คุณต้องการลบคำนำหน้านี้หรือไม่?').then((result) => {
      if (result.isConfirmed) {
        this.confirmDelete(id);
        this.alertService.successNo('ลบคำนำหน้านี้เรียบร้อยแล้ว');
      }
    });
  }
  confirmDelete(id: number) {
    this.staffsService.deleteStaff(id).subscribe({
      next: () => this.getStaffs(),
      error: (error) => console.error(error),
    });
  }

  goToCreate() {
    this.router.navigate(['/admin/staffs/create']);
  }

  goToEdit(staff: staffsTypeCreate) {
    this.router.navigate(['/admin/staffs/update', staff.staff_id], {
      state: { staff },
    });
  }

  handleTableAction(event: { type: string; item: staffsType }) {
    if (event.type === 'detail') {
      this.staffDetails.set(event.item);
      return;
    }

    if (event.type !== 'pathTo') return;

    this.router.navigate(['/admin/staffs', event.item.staff_id, 'dashboard'], {
      state: {
        staff: {
          staff_id: event.item.staff_id,
          full_name: event.item.full_name,
          department_name: event.item.department_name,
        },
      },
    });
  }

  closeStaffDetails() {
    this.staffDetails.set(null);
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
    type?: 'text' | 'price' | 'badge';
  }[] = [
    {
      label: 'ชื่อ-นามสกุล',
      key: 'full_name',
    },
    { label: 'สาขาวิชา', key: 'department_name' },
    { label: 'ตำเเหน่ง', key: 'position_name' },
  ];
}
