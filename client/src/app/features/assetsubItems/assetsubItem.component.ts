import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Location } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { DataTableComponent, TableAction } from '../../../shared/data-table/data-table.component';
import { Pagination } from '../../shared/models/pagination';
import { Params } from '../../shared/models/allType';
import { AlertService } from '../../../shared.service';
import { assetSubItemTypes } from './interface/assetsubItemsTypes';
import { AssetSubItemsService } from './service/assetsubItem.service';
import { TableState } from '../../../shared/TableState';
import { AssetItemsService } from '../assetItems/service/assetItems.service';
import { AssetDisposalDialogComponent } from '../assetItems/asset-disposal-dialog.component';

@Component({
  selector: 'app-departments',
  standalone: true,
  imports: [DataTableComponent, AssetDisposalDialogComponent],
  templateUrl: './assetsubItem.component.html',
})
export class AssetSubItemsComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private location = inject(Location);
  private assetSubItemsService = inject(AssetSubItemsService);
  private assetItemsService = inject(AssetItemsService);
  private alertService = inject(AlertService);
  private table = new TableState();

  headerColor = 'bg-orange-700';
  headerBorderColor = 'border-orange-800';
  butttonColor = 'bg-orange-700 hover:bg-orange-800 ';
  badgeColors: Record<string, string> = {
    'จำหน่ายแล้ว': 'border-red-400 bg-red-100 text-red-800',
    'จำหน่ายบางส่วน': 'border-orange-400 bg-orange-100 text-orange-900',
  };

  asset_id = signal<number | null>(null);
  parentAssetRecordId = signal<number | null>(null);

  assetsubItem?: Pagination<assetSubItemTypes>;
  assetsubItems = signal<assetSubItemTypes[]>([]);
  missingRunningNumbers = computed(() =>
    this.assetsubItems().filter((item) =>
      !item.running_start_no || item.running_start_no <= 0 ||
      !item.running_end_no || item.running_end_no <= 0),
  );

  Params = new Params();
  totalCount = signal<number>(0);

  disposalTarget = signal<{ id: number; name: string; readonly: boolean } | null>(null);

  ngOnInit(): void {
    const idParam = this.route.snapshot.paramMap.get('id');
    const id = idParam ? Number(idParam) : null;

    if (id && Number.isFinite(id)) {
      this.asset_id.set(id);
      this.LoadgetAssetSubItems(id);
      this.loadParentAsset(id);
    }
  }

  loadParentAsset(id: number) {
    this.assetItemsService.getAssetItem(id).subscribe({
      next: (asset) => {
        if (asset && asset.procurement_record_id) {
          this.parentAssetRecordId.set(asset.procurement_record_id);
        }
      },
      error: (error) => console.error(error)
    });
  }

  LoadgetAssetSubItems(id: number) {
    this.assetSubItemsService.getAssetSubItemsbyProcuremen(this.table.params, id).subscribe({
      next: (response) => {
        this.assetsubItem = response;
        this.assetsubItems.set(response.data);
        this.totalCount.set(response.count);
      },
      error: (error) => console.error(error),
    });
  }

  onSearch(value: string) {
    const id = this.asset_id();

    if (!id) return;

    this.table.onSearch(value, () => this.LoadgetAssetSubItems(id));
  }

  onPageChange(page: number) {
    const id = this.asset_id();

    if (!id) return;

    this.table.onPageChange(page, () => this.LoadgetAssetSubItems(id));
  }

  onSort(value: string) {
    const id = this.asset_id();

    if (!id) return;

    this.table.onSort(value, () => this.LoadgetAssetSubItems(id));
  }

  deleteAssetSubItems(id: number) {
    this.alertService.confirm('ยืนยันการลบ', 'คุณต้องการลบคำนำหน้านี้หรือไม่?').then((result) => {
      if (result.isConfirmed) {
        this.confirmDelete(id);
        this.alertService.successNo('ลบเรียบร้อยแล้ว');
      }
    });
  }

  confirmDelete(id: number) {
    const procurementId = this.asset_id();

    if (!procurementId) return;

    this.assetSubItemsService.deleteAssetSubItems(id).subscribe({
      next: () => {
        this.alertService.successNo('ลบรายการเรียบร้อยแล้ว');
        this.LoadgetAssetSubItems(procurementId);
      },
      error: (error) => console.error(error),
    });
  }

  goToCreate() {
    const asset_id = this.asset_id();

    if (!asset_id) return;

    this.router.navigate(['/admin/assetsubItems/create'], {
      queryParams: {
        asset_id: asset_id,
      },
    });
  }

  goToEdit(assetSubItem: assetSubItemTypes) {
    this.router.navigate(['/admin/assetsubItems/update', assetSubItem.asset_sub_item_id], {
      state: {
        assetItem: assetSubItem,
      },
    });
  }
  cancel() {
    // ย้อนกลับด้วยประวัติเบราว์เซอร์ เพื่อไม่ให้หน้ารายการครุภัณฑ์หลักซ้อนใน history จนกดย้อนวนกลับมาที่หน้านี้
    if (window.history.length > 1) {
      this.location.back();
      return;
    }
    if (history.state?.fromRegister) {
      this.router.navigate(['/admin/assetItems']);
      return;
    }
    const procurementRecordId = this.parentAssetRecordId();
    if (procurementRecordId) {
      this.router.navigate(['/admin/assetItems', procurementRecordId]);
    } else {
      this.router.navigate(['/admin/assetItems']);
    }
  }
  sortOptions = [
    { label: 'ชื่อ ก-ฮ', value: 'nameAsc' },
    { label: 'ชื่อ ฮ-ก', value: 'nameDesc' },
    { label: 'ใหม่ล่าสุด', value: 'latest' },
    { label: 'เก่าสุด', value: 'oldest' },
  ];

  columns: { label: string; key: string; type?: 'text' | 'price' | 'badge'; pipe?: 'thaiDate' }[] =
    [
      { label: 'รหัสเริ่มต้น', key: 'asset_code_start' },
      { label: 'รหัสสิ้นสุด', key: 'asset_code_end' },
      { label: 'ชื่อครุภัณฑ์ย่อย', key: 'sub_item_name' },
      { label: 'หมวดหมู่', key: 'category_name' },
      { label: 'ราคา', key: 'unit_price' },
      { label: 'จำนวน', key: 'quantity_with_unit' },
      { label: 'ราคารวม', key: 'total_price' },
      { label: 'สถานะ', key: 'status', type: 'badge' },
    ];

  handleAction(event: TableAction) {
    if (event.type === 'dispose' || event.type === 'disposalDetail') {
      this.disposalTarget.set({ id: event.item.asset_sub_item_id, name: event.item.sub_item_name,
        readonly: event.type === 'disposalDetail' });
    }
  }
}
