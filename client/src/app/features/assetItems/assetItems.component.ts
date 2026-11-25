import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Location } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { DataTableComponent } from '../../../shared/data-table/data-table.component';
import { Pagination } from '../../shared/models/pagination';
import { Params } from '../../shared/models/allType';
import { AlertService } from '../../../shared.service';
import { assetItemsTypes } from './interface/assetItemsTypes';
import { AssetItemsService } from './service/assetItems.service';
import { TableState } from '../../../shared/TableState';
import { forkJoin } from 'rxjs';
import { AssetDisposalService } from './service/asset-disposal.service';
import { AssetDisposalDialogComponent } from './asset-disposal-dialog.component';

@Component({
  selector: 'app-departments',
  standalone: true,
  imports: [DataTableComponent, AssetDisposalDialogComponent],
  templateUrl: './assetItems.component.html',
})
export class AssetItemsComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private location = inject(Location);
  private assetItemsService = inject(AssetItemsService);
  private alertService = inject(AlertService);
  private table = new TableState();
  private disposalService = inject(AssetDisposalService);
  disposalTarget = signal<{ asset: assetItemsTypes; readonly: boolean } | null>(null);

  procurement_record_id = signal<number | null>(null);
  assetItem?: Pagination<assetItemsTypes>;
  assetItems = signal<assetItemsTypes[]>([]);
  assetsMissingCode = computed(() =>
    this.assetItems().filter((asset) => !asset.asset_code_prefix?.trim()),
  );
  Params = new Params();
  totalCount = signal<number>(0);

  headerColor = 'bg-orange-700';
  headerBorderColor = 'border-orange-800';
  butttonColor = 'bg-orange-700 hover:bg-orange-800 ';
  badgeColors: Record<string, string> = {
    'จำหน่ายแล้ว': 'border-red-400 bg-red-100 text-red-800',
    'จำหน่ายบางส่วน': 'border-orange-400 bg-orange-100 text-orange-900',
  };

  ngOnInit(): void {
    const idParam = this.route.snapshot.paramMap.get('id');
    const id = idParam ? Number(idParam) : null;

    if (id && Number.isFinite(id)) {
      this.procurement_record_id.set(id);
      this.LoadgetAssetItems(id);
    }
  }

  LoadgetAssetItems(id: number) {
    forkJoin({ rows: this.assetItemsService.getAssetItembyProcuremen(this.table.params, id),
      summaries: this.disposalService.summary(id) }).subscribe({
      next: ({ rows: response, summaries }) => {
        this.assetItem = response;
        this.assetItems.set(response.data.map(asset => ({ ...asset,
          ...summaries.find(summary => summary.asset_id === asset.asset_id) })));
        this.totalCount.set(response.count);
      },
      error: (error) => console.error(error),
    });
  }

  onSearch(value: string) {
    const id = this.procurement_record_id();

    if (!id) return;

    this.table.onSearch(value, () => this.LoadgetAssetItems(id));
  }

  onPageChange(page: number) {
    const id = this.procurement_record_id();

    if (!id) return;

    this.table.onPageChange(page, () => this.LoadgetAssetItems(id));
  }

  onSort(value: string) {
    const id = this.procurement_record_id();

    if (!id) return;

    this.table.onSort(value, () => this.LoadgetAssetItems(id));
  }

  deleteAssetItems(id: number) {
    this.alertService.confirm('ยืนยันการลบ', 'คุณต้องการลบคำนำหน้านี้หรือไม่?').then((result) => {
      if (result.isConfirmed) {
        this.confirmDelete(id);
        this.alertService.successNo('ลบเรียบร้อยแล้ว');
      }
    });
  }

  confirmDelete(id: number) {
    const procurementId = this.procurement_record_id();

    if (!procurementId) return;

    this.assetItemsService.deleteAssetItems(id).subscribe({
      next: () => {
        this.alertService.successNo('ลบรายการเรียบร้อยแล้ว');
        this.LoadgetAssetItems(procurementId);
      },
      error: (error) => console.error(error),
    });
  }

  /** ข้อมูลโครงการที่ต้องส่งต่อไปหน้าเพิ่ม/แก้ไข เพื่อให้กลับมาแล้วปุ่มย้อนกลับยังทำงาน */
  private projectState() {
    return {
      procurementrecord: history.state?.procurementrecord,
      project_id: history.state?.project_id,
      projectstate: history.state?.projectstate,
    };
  }

  goToWithdrawal() {
    const procurementId = this.procurement_record_id();
    if (!procurementId) return;

    this.router.navigate(['/admin/AssetWithdrawal', procurementId], {
      queryParams: {
        project_id: this.route.snapshot.queryParamMap.get('project_id'),
        fiscal_year_id: this.route.snapshot.queryParamMap.get('fiscal_year_id'),
      },
      state: this.projectState(),
    });
  }

  goToWithdrawalExport() {
    const procurementId = this.procurement_record_id();
    if (!procurementId) return;

    this.router.navigate(['/admin/AssetWithdrawal/export/procurement', procurementId], {
      queryParams: {
        project_id: this.route.snapshot.queryParamMap.get('project_id'),
        fiscal_year_id: this.route.snapshot.queryParamMap.get('fiscal_year_id'),
      },
      state: this.projectState(),
    });
  }

  goToCreate() {
    const procurementId = this.procurement_record_id();

    if (!procurementId) return;

    this.router.navigate(['/admin/assetItems/create'], {
      queryParams: {
        procurement_record_id: procurementId,
      },
      state: this.projectState(),
    });
  }

  goToEdit(mat: assetItemsTypes) {
    this.router.navigate(['/admin/assetItems/update', mat.asset_id], {
      state: { assetItem: mat, ...this.projectState() },
    });
  }

  onTableAction(event: { type: string; item: assetItemsTypes }) {
    const mat = event.item;
    if (event.type === 'dispose' || event.type === 'disposalDetail') {
      this.disposalTarget.set({ asset: mat, readonly: event.type === 'disposalDetail' });
      return;
    }

    const stateData = {
      assetItem: mat,
      procurementrecord: history.state?.procurementrecord,
      procurement_record_id: this.procurement_record_id(),
    };

    if (event.type === 'pathTo') {
      this.router.navigate(['/admin/assetsubItems', mat.asset_id], {
        state: stateData,
      });
      return;
    }

    if (event.type === 'detail') {
      this.router.navigate(['/admin/assetItems/details', mat.asset_id], {
        state: stateData,
      });
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
      { label: 'รหัส', key: 'asset_code_prefix' },
      { label: 'ชื่อครุภัณฑ์', key: 'asset_name' },
      { label: 'วันที่รับ', key: 'receive_date', pipe: 'thaiDate' },
      { label: 'สถานะจำหน่าย', key: 'disposal_status', type: 'badge' },
    ];

  cancel() {
    // ย้อนกลับไปหน้าที่เข้ามาจริง ๆ (เช่น หน้ารายละเอียดเอกสารจัดซื้อ) ถ้าไม่มีประวัติค่อยเดาปลายทางจากข้อมูลโครงการ
    if (window.history.length > 1) {
      this.location.back();
      return;
    }

    const state = history.state;
    const query = this.route.snapshot.queryParamMap;
    const projectId = state?.procurementrecord?.project_id ?? state?.project_id ?? query.get('project_id');

    // เปิดหน้านี้โดยตรงและไม่รู้ว่าเป็นโครงการไหน ให้ไปหน้ารายการเอกสารจัดซื้อรวม
    if (!projectId) {
      this.router.navigate(['/admin/procurementrecord']);
      return;
    }

    const fiscalYearId = query.get('fiscal_year_id');
    this.router.navigate(['/admin/project/procurementrecord'], {
      queryParams: { project_id: projectId, ...(fiscalYearId ? { fiscal_year_id: fiscalYearId } : {}) },
      state: {
        procurementrecord: state?.procurementrecord,
        project_id: state?.project_id,
        projectstate: state?.projectstate,
      },
    });
  }
}
