import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { DataTableComponent, TableAction } from '../../../shared/data-table/data-table.component';
import { TableState } from '../../../shared/TableState';
import { assetRegisterTypes } from './interface/assetItemsTypes';
import { AssetItemsService } from './service/assetItems.service';
import { AssetDisposalService } from './service/asset-disposal.service';
import { AssetDisposalDialogComponent } from './asset-disposal-dialog.component';
import { forkJoin } from 'rxjs';

type RegisterRow = assetRegisterTypes & { custodian_display: string };

@Component({
  selector: 'app-asset-register',
  standalone: true,
  imports: [DataTableComponent, AssetDisposalDialogComponent],
  template: `
    <app-data-table
      title="ทะเบียนครุภัณฑ์หลักทั้งหมด"
      subtitle="ค้นหาครุภัณฑ์ และดูผู้ดูแลที่ยังใช้งานอยู่ตามเอกสาร (แสดงพร้อมคำนำหน้า)"
      [data]="rows()"
      [columns]="columns"
      [idKey]="'asset_id'"
      [sortOptions]="sortOptions"
      [filterOptions]="filterOptions()"
      [totalItems]="totalCount()"
      [pageSize]="table.params.pageSize"
      [currentPage]="table.params.pageNumber"
      [showDetail]="true"
      [showPathTo]="true"
      [showDispose]="true"
      Namepath="ดูรายการย่อย"
      (search)="onSearch($event)"
      (sortChange)="onSort($event)"
      (filterChange)="onFilter($event)"
      (pageChange)="onPageChange($event)"
      (action)="onAction($event)"
      headerColor="bg-orange-700"
      headerBorderColor="border-orange-800"
      butttonColor="bg-orange-700 hover:bg-orange-800"
      [badgeColors]="badgeColors"
    />
    @if (disposalTarget(); as target) {
      <app-asset-disposal-dialog [assetId]="target.asset.asset_id" [name]="target.asset.asset_name"
        [readonly]="target.readonly" (closed)="disposalTarget.set(null)"
        (saved)="disposalTarget.set(null); load()" />
    }
  `,
})
export class AssetRegisterComponent {
  private readonly assets = inject(AssetItemsService);
  private readonly router = inject(Router);
  private readonly disposals = inject(AssetDisposalService);
  readonly disposalTarget = signal<{ asset: RegisterRow; readonly: boolean } | null>(null);
  readonly table = new TableState();
  readonly rows = signal<RegisterRow[]>([]);
  readonly totalCount = signal(0);
  readonly filterOptions = signal<{
    key: string;
    label: string;
    options: { label: string; value: number }[];
  }[]>([]);
  private departmentId?: number;
  private custodianStaffId?: number;

  readonly columns = [
    { label: 'รหัส', key: 'asset_code_prefix' },
    { label: 'ชื่อครุภัณฑ์', key: 'asset_name' },
    { label: 'หน่วยงาน', key: 'department_name' },
    { label: 'สถานะจำหน่าย', key: 'disposal_status', type: 'coloredText' as const },
    { label: 'ผู้ดูแลที่ยังใช้งานอยู่ตามเอกสาร', key: 'custodian_display' },
  ];
  readonly badgeColors: Record<string, string> = {
    'จำหน่ายแล้ว': 'border-red-400 bg-red-100 text-red-800',
    'จำหน่ายบางส่วน': 'border-orange-400 bg-orange-100 text-orange-900',
  };
  readonly sortOptions = [
    { label: 'ชื่อ ก-ฮ', value: 'nameAsc' },
    { label: 'ชื่อ ฮ-ก', value: 'nameDesc' },
    { label: 'ใหม่ล่าสุด', value: 'idDesc' },
  ];

  constructor() {
    this.assets.getAssetRegisterFilters().subscribe({
      next: (filters) => this.filterOptions.set([
        {
          key: 'departmentId', label: 'หน่วยงาน',
          options: filters.departments.map((item) => ({ label: item.name, value: item.id })),
        },
        {
          key: 'custodianStaffId', label: 'ผู้ดูแลที่ยังใช้งานอยู่',
          options: filters.custodians.map((item) => ({ label: item.name, value: item.id })),
        },
      ]),
      error: (error) => console.error('Unable to load asset register filters', error),
    });
    this.table.params.sort = 'idDesc';
    this.load();
  }

  load() {
    forkJoin({ rows: this.assets.getAssetRegister(this.table.params, this.departmentId, this.custodianStaffId), summaries: this.disposals.summary() }).subscribe({
      next: ({ rows: response, summaries }) => {
        this.rows.set(response.data.map((asset) => ({
          ...asset,
          ...summaries.find(summary => summary.asset_id === asset.asset_id),
          custodian_display: asset.current_custodian_names?.length
            ? asset.current_custodian_names.join(', ')
            : 'ไม่มีผู้ดูแลปัจจุบัน',
        })));
        this.totalCount.set(response.count);
      },
      error: (error) => console.error('Unable to load asset register', error),
    });
  }

  onSearch(value: string) {
    this.table.onSearch(value, () => this.load());
  }

  onSort(value: string) {
    this.table.onSort(value, () => this.load());
  }

  onPageChange(page: number) {
    this.table.onPageChange(page, () => this.load());
  }

  onFilter(event: { key: string; value: any }) {
    const id = event.value ? Number(event.value) : undefined;
    if (event.key === 'departmentId') this.departmentId = id;
    if (event.key === 'custodianStaffId') this.custodianStaffId = id;
    this.table.params.pageNumber = 1;
    this.load();
  }

  onAction(event: TableAction) {
    const asset = event.item as RegisterRow;
    if (event.type === 'dispose' || event.type === 'disposalDetail') {
      this.disposalTarget.set({ asset, readonly: event.type === 'disposalDetail' });
      return;
    }
    const state = { procurement_record_id: asset.procurement_record_id, fromRegister: true };
    if (event.type === 'pathTo') {
      this.router.navigate(['/admin/assetsubItems', asset.asset_id], { state });
    } else if (event.type === 'detail') {
      this.router.navigate(['/admin/assetItems/details', asset.asset_id], { state });
    }
  }
}
