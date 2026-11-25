import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DataTableComponent } from '../../../shared/data-table/data-table.component';
import { Pagination } from '../../shared/models/pagination';
import { Params } from '../../shared/models/allType';
import { AlertService } from '../../../shared.service';
import { assetWithdrawalTypes } from './interface/assetWithdrawalTypes';
import { AssetWithdrawalService } from './service/assetWithdrawal.service';
import { TableState } from '../../../shared/TableState';
import { ProcurementrecordService } from '../procurementrecord/service/procurementrecord.service';

@Component({
  selector: 'app-departments',
  standalone: true,
  imports: [DataTableComponent],
  templateUrl: './assetWithdrawal.component.html',
})
export class AssetWithdrawalComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private assetWithdrawalService = inject(AssetWithdrawalService);
  private alertService = inject(AlertService);
  private table = new TableState();
  private procurementrecordService = inject(ProcurementrecordService);

  procurement_record_id = signal<number | null>(null);
  assetWithdrawal?: Pagination<assetWithdrawalTypes>;
  assetWithdrawals = signal<(assetWithdrawalTypes & { status_display: string })[]>([]);
  Params = new Params();
  totalCount = signal<number>(0);

  badgeColors: Record<string, string> = {
    'ยังใช้งานอยู่': 'border-green-500 bg-green-100 text-green-900',
    'ย้ายผู้ดูแล': 'border-orange-400 bg-orange-100 text-orange-900',
    'จำหน่ายแล้ว': 'border-red-400 bg-red-100 text-red-800',
    'ส่งคืนแล้ว': 'border-slate-400 bg-slate-100 text-slate-800',
  };

  headerColor = 'bg-orange-700';
  headerBorderColor = 'border-orange-800';
  butttonColor = 'bg-orange-700 hover:bg-orange-800 ';

  ngOnInit(): void {
    const idParam = this.route.snapshot.paramMap.get('id');
    const id = idParam ? Number(idParam) : null;
    if (id && Number.isFinite(id)) {
      this.procurement_record_id.set(id);
      this.LoadgetAssetWithdrawal(id);
    }
  }

  LoadgetAssetWithdrawal(id: number) {
    this.assetWithdrawalService.getAssetWithdrawalbyProcuremens(this.table.params, id).subscribe({
      next: (response) => {
        // ยังไม่มีเหตุผลสิ้นสุดการดูแล = ผู้เบิกยังดูแลครุภัณฑ์อยู่
        this.assetWithdrawals.set(
          response.data.map((row) => ({ ...row, status_display: row.end_reason?.trim() || 'ยังใช้งานอยู่' })),
        );
        this.totalCount.set(response.count);
      },
      error: (error) => console.error(error),
    });
  }

  onSearch(value: string) {
    const id = this.procurement_record_id();

    if (!id) return;

    this.table.onSearch(value, () => this.LoadgetAssetWithdrawal(id));
  }

  onPageChange(page: number) {
    const id = this.procurement_record_id();

    if (!id) return;

    this.table.onPageChange(page, () => this.LoadgetAssetWithdrawal(id));
  }

  onSort(value: string) {
    const id = this.procurement_record_id();

    if (!id) return;

    this.table.onSort(value, () => this.LoadgetAssetWithdrawal(id));
  }

  deleteAssetWithdrawal(id: number) {
    this.alertService.confirm('ยืนยันการลบ', 'คุณต้องการลบหรือไม่?').then((result) => {
      if (result.isConfirmed) {
        this.confirmDelete(id);
        this.alertService.successNo('ลบเรียบร้อยแล้ว');
      }
    });
  }

  confirmDelete(id: number) {
    const procurementId = this.procurement_record_id();

    if (!procurementId) return;

    this.assetWithdrawalService.deleteAssetWithdrawal(id).subscribe({
      next: () => {
        this.alertService.successNo('ลบรายการเรียบร้อยแล้ว');
        this.LoadgetAssetWithdrawal(procurementId);
      },
      error: (error) => console.error(error),
    });
  }

  goToCreate() {
    const procurementId = this.procurement_record_id();
    const procurementrecord = history.state?.procurementrecord;

    if (!procurementId) return;

    this.router.navigate(['/admin/AssetWithdrawal/create'], {
      queryParams: {
        procurement_record_id: procurementId,
        ...this.projectQuery(),
      },
      state: {
        procurementrecord,
      },
    });
  }

  goToEdit(mat: assetWithdrawalTypes) {
    this.router.navigate(['/admin/AssetWithdrawal/update', mat.procurement_withdrawal_id], {
      queryParams: this.projectQuery(),
      state: {
        assetWithdrawal: mat,
        procurementrecord: history.state?.procurementrecord,
      },
    });
  }

  onTableAction(event: { type: string; item: assetWithdrawalTypes }) {
    const mat = event.item;

    const stateData = {
      assetItem: mat,
      procurementrecord: history.state?.procurementrecord,
      procurement_record_id: this.procurement_record_id(),
      procurement_withdrawal_id: mat.procurement_withdrawal_id,
    };

    if (event.type === 'repair') {
      this.router.navigate(['/admin/assetRepairs', mat.procurement_withdrawal_id], {
        state: stateData,
      });
      return;
    }

    if (event.type === 'history') {
      this.router.navigate(['/admin/AssetSubItemHistory', mat.procurement_withdrawal_id], {
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
      { label: 'ครั้งที่', key: 'withdrawal_document_no' },
      { label: 'วันที่เบิก', key: 'withdrawal_date', pipe: 'thaiDate' },
      { label: 'สิ้นสุดดูแล', key: 'end_date', pipe: 'thaiDate' },
      { label: 'สถานะ', key: 'status_display', type: 'badge' },
      { label: 'ผู้เบิก', key: 'staff_name' },
      { label: 'สถานที่เก็บ', key: 'storage_location' },
      { label: 'รายละเอียด', key: 'remark' },
    ];

  /** project_id / fiscal_year_id ที่ต้องส่งต่อไปทุกหน้า เพื่อให้ย้อนกลับไปหน้ารายการครุภัณฑ์ของโครงการเดิมได้ */
  private projectQuery() {
    const query = this.route.snapshot.queryParamMap;
    const state = history.state;
    const projectId = query.get('project_id') ?? state?.procurementrecord?.project_id ?? state?.project_id;
    const fiscalYearId = query.get('fiscal_year_id');
    return {
      ...(projectId ? { project_id: projectId } : {}),
      ...(fiscalYearId ? { fiscal_year_id: fiscalYearId } : {}),
    };
  }

  cancel() {
    const procurementRecordId = this.procurement_record_id();
    if (!procurementRecordId) return;

    // กลับไปหน้ารายการครุภัณฑ์ของเอกสารจัดซื้อนี้ (assetItems/:id)
    this.router.navigate(['/admin/assetItems', procurementRecordId], {
      queryParams: this.projectQuery(),
      state: {
        procurementrecord: history.state?.procurementrecord,
        project_id: history.state?.project_id,
        projectstate: history.state?.projectstate,
      },
    });
  }
}
