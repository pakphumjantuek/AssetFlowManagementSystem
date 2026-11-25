import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ThaiDatePipe } from '../../../shared/pipes/thai-date-pipe';
import { DataTableComponent, TableAction } from '../../../../shared/data-table/data-table.component';
import { TableState } from '../../../../shared/TableState';
import { Params } from '../../../shared/models/allType';
import { Pagination } from '../../../shared/models/pagination';
import { AssetItemsService } from '../../assetItems/service/assetItems.service';
import {
  assetSubItemDisposalTypes,
  assetSubItemTypes,
} from '../../assetsubItems/interface/assetsubItemsTypes';
import { AssetSubItemsService } from '../../assetsubItems/service/assetsubItem.service';
import { StaffDashboardAsset } from '../staff-dashboard/staff-dashboard.service';

@Component({
  selector: 'app-staff-sub-items',
  standalone: true,
  imports: [CommonModule, DataTableComponent, ThaiDatePipe],
  templateUrl: './staff-sub-items.component.html',
})
export class StaffSubItemsComponent {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private assetItemsService = inject(AssetItemsService);
  private assetSubItemsService = inject(AssetSubItemsService);
  private table = new TableState();

  staffId = Number(this.route.snapshot.paramMap.get('staffId'));
  assetId = Number(this.route.snapshot.paramMap.get('assetId'));
  fiscalYearId = this.getFiscalYearId();
  staff = history.state?.staff;
  assetFromState = history.state?.asset as StaffDashboardAsset | undefined;
  assetName = signal(this.assetFromState?.asset_name ?? '');
  assetCode = signal(this.getRunningCode(this.assetFromState));
  assets?: Pagination<assetSubItemTypes>;
  subItems = signal<assetSubItemTypes[]>([]);
  loading = signal(true);
  loadError = signal(false);
  disposalInfo = signal<assetSubItemDisposalTypes | null>(null);
  disposalItemName = signal('');
  disposalLoading = signal(false);
  Params = this.table.params;

  columns = [
    { label: 'รหัสเริ่มต้น', key: 'asset_code_start' },
    { label: 'รหัสสิ้นสุด', key: 'asset_code_end' },
    { label: 'ชื่อครุภัณฑ์ย่อย', key: 'sub_item_name' },
    { label: 'หมวดหมู่', key: 'category_name' },
    { label: 'จำนวน', key: 'quantity_with_unit' },
    { label: 'ราคา/หน่วย', key: 'unit_price', type: 'price' as const },
    { label: 'ราคารวม', key: 'total_price', type: 'price' as const },
    { label: 'สถานะ', key: 'status', type: 'badge' as const },
  ];

  badgeColors: Record<string, string> = {
    ปกติ: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    'จำหน่ายแล้ว': 'border-slate-300 bg-slate-100 text-slate-700',
  };

  sortOptions = [
    { label: 'ชื่อ ก-ฮ', value: 'nameAsc' },
    { label: 'ชื่อ ฮ-ก', value: 'nameDesc' },
    { label: 'ใหม่ล่าสุด', value: 'latest' },
    { label: 'เก่าสุด', value: 'oldest' },
  ];

  constructor() {
    if (!Number.isInteger(this.staffId) || this.staffId <= 0 || !Number.isInteger(this.assetId) || this.assetId <= 0) {
      this.loading.set(false);
      this.loadError.set(true);
      return;
    }

    if (!this.assetName()) this.loadParentAsset();
    this.loadSubItems();
  }

  loadParentAsset() {
    this.assetItemsService.getAssetItem(this.assetId).subscribe({
      next: (asset) => {
        this.assetName.set(asset.asset_name || '');
        this.assetCode.set(asset.asset_code_prefix || '');
      },
      error: (error) => console.error(error),
    });
  }

  loadSubItems() {
    this.loading.set(true);
    this.assetSubItemsService.getAssetSubItemsbyProcuremen(this.table.params, this.assetId).subscribe({
      next: (response) => {
        this.assets = response;
        this.subItems.set(response.data);
      },
      error: (error) => {
        console.error(error);
        this.loadError.set(true);
        this.loading.set(false);
      },
      complete: () => this.loading.set(false),
    });
  }

  onSearch(value: string) {
    this.table.onSearch(value, () => this.loadSubItems());
  }

  onPageChange(page: number) {
    this.table.onPageChange(page, () => this.loadSubItems());
  }

  onSort(value: string) {
    this.table.onSort(value, () => this.loadSubItems());
  }

  handleTableAction(event: TableAction) {
    if (event.type !== 'status' || event.item.status !== 'จำหน่ายแล้ว') return;

    this.disposalItemName.set(event.item.sub_item_name);
    this.disposalLoading.set(true);
    this.assetSubItemsService.getAssetSubItemDisposal(event.item.asset_sub_item_id).subscribe({
      next: (details) => this.disposalInfo.set(details),
      error: (error) => {
        console.error('ไม่สามารถโหลดรายละเอียดการจำหน่ายได้', error);
        this.disposalLoading.set(false);
      },
      complete: () => this.disposalLoading.set(false),
    });
  }

  closeDisposalDetails() {
    this.disposalInfo.set(null);
  }

  goBack() {
    this.router.navigate(['/admin/staffs', this.staffId, 'dashboard'], {
      queryParams: {
        section: 'assets',
        fiscal_year_id: this.fiscalYearId,
      },
      state: {
        staff: this.staff,
        fiscalYear: history.state?.fiscalYear,
      },
    });
  }

  private getFiscalYearId() {
    const value = this.route.snapshot.queryParamMap.get('fiscal_year_id');
    const fiscalYearId = value ? Number(value) : null;
    return fiscalYearId && Number.isFinite(fiscalYearId) && fiscalYearId > 0 ? fiscalYearId : null;
  }

  private getRunningCode(asset?: StaffDashboardAsset) {
    if (!asset?.running_start_no || !asset.running_end_no) return '';
    return `${asset.running_start_no}-${asset.running_end_no}/${asset.fiscal_asset_year ?? '-'}`;
  }
}
