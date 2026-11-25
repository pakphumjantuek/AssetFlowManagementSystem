import { ThaiDatePipe } from '../../shared/pipes/thai-date-pipe';
import { Component, HostListener, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DataTableComponent } from '../../../shared/data-table/data-table.component';
import { Pagination } from '../../shared/models/pagination';
import { Params } from '../../shared/models/allType';
import { AlertService } from '../../../shared.service';
import { assetSubItemHistoryTypes } from './interface/assetSubItemHistoryTypes';
import { AssetSubItemHistoryService } from './service/assetSubItemHistory.service';
import { TableState } from '../../../shared/TableState';
import { AssetWithdrawalService } from '../assetWithdrawal/service/assetWithdrawal.service';

@Component({
  selector: 'app-departments',
  standalone: true,
  imports: [DataTableComponent, ThaiDatePipe],
  templateUrl: './assetSubItemHistory.component.html',
})
export class AssetSubItemHistoryComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private AssetSubItemHistoryService = inject(AssetSubItemHistoryService);
  private alertService = inject(AlertService);
  private assetWithdrawalService = inject(AssetWithdrawalService);
  private table = new TableState();

  headerColor = 'bg-orange-700';
  headerBorderColor = 'border-orange-800';
  butttonColor = 'bg-orange-700 hover:bg-orange-800 ';

  procurement_withdrawal_id = signal<number | null>(null);

  AssetSubItemHistory?: Pagination<assetSubItemHistoryTypes>;
  AssetSubItemHistorys = signal<assetSubItemHistoryTypes[]>([]);

  Params = new Params();
  totalCount = signal<number>(0);
  selectedHistory = signal<assetSubItemHistoryTypes | null>(null);

  openDetails(historyItem: assetSubItemHistoryTypes) {
    this.selectedHistory.set(historyItem);
  }

  closeDetails() {
    this.selectedHistory.set(null);
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    this.closeDetails();
  }

  ngOnInit(): void {
    const idParam = this.route.snapshot.paramMap.get('id');
    const id = idParam ? Number(idParam) : null;

    if (id && Number.isFinite(id)) {
      this.procurement_withdrawal_id.set(id);
      this.LoadgetAssetSubItemHistory(id);
    }
  }

  LoadgetAssetSubItemHistory(id: number) {
    this.AssetSubItemHistoryService.getassetSubItemHistoryby(this.table.params, id).subscribe({
      next: (response) => {
        this.AssetSubItemHistorys.set(response.data);
        this.totalCount.set(response.count);
      },
      error: (error) => console.error(error),
    });
  }

  onSearch(value: string) {
    const id = this.procurement_withdrawal_id();

    if (!id) return;

    this.table.onSearch(value, () => this.LoadgetAssetSubItemHistory(id));
  }

  onPageChange(page: number) {
    const id = this.procurement_withdrawal_id();

    if (!id) return;

    this.table.onPageChange(page, () => this.LoadgetAssetSubItemHistory(id));
  }

  onSort(value: string) {
    const id = this.procurement_withdrawal_id();

    if (!id) return;

    this.table.onSort(value, () => this.LoadgetAssetSubItemHistory(id));
  }

  deleteAssetSubItemHistory(id: number) {
    this.alertService.confirm('ยืนยันการลบ', 'คุณต้องการลบนี้หรือไม่?').then((result) => {
      if (result.isConfirmed) {
        this.confirmDelete(id);
        this.alertService.successNo('ลบเรียบร้อยแล้ว');
      }
    });
  }

  confirmDelete(id: number) {
    const procurementId = this.procurement_withdrawal_id();

    if (!procurementId) return;

    this.AssetSubItemHistoryService.deleteassetSubItemHistory(id).subscribe({
      next: () => {
        this.alertService.successNo('ลบรายการเรียบร้อยแล้ว');
        this.LoadgetAssetSubItemHistory(procurementId);
      },
      error: (error) => console.error(error),
    });
  }

  goToCreate() {
    const procurement_withdrawal_id = this.procurement_withdrawal_id();

    if (!procurement_withdrawal_id) return;

    this.router.navigate(['/admin/AssetSubItemHistory/create'], {
      queryParams: {
        procurement_withdrawal_id: procurement_withdrawal_id,
      },
    });
  }

  goToEdit(assetSubItem: assetSubItemHistoryTypes) {
    this.router.navigate(['/admin/AssetSubItemHistory/update', assetSubItem.sub_item_history_id], {
      state: {
        assetItem: assetSubItem,
      },
    });
  }
  cancel() {
    const procurementRecordId = Number(history.state?.procurement_record_id);
    if (Number.isInteger(procurementRecordId) && procurementRecordId > 0) {
      this.navigateToWithdrawals(procurementRecordId);
      return;
    }

    const withdrawalId = this.procurement_withdrawal_id();
    if (!withdrawalId) return;

    this.assetWithdrawalService.getAssetWithdrawalbyProcuremen(withdrawalId).subscribe({
      next: (withdrawal) => this.navigateToWithdrawals(withdrawal.procurement_record_id),
      error: () => this.alertService.error('ย้อนกลับไม่สำเร็จ', 'ไม่พบข้อมูลรายการเบิกครุภัณฑ์'),
    });
  }

  private navigateToWithdrawals(procurementRecordId: number) {
    this.router.navigate(['/admin/AssetWithdrawal', procurementRecordId], {
      state: { procurementrecord: history.state?.procurementrecord },
    });
  }
  sortOptions = [
    { label: 'ชื่อ ก-ฮ', value: 'nameAsc' },
    { label: 'ชื่อ ฮ-ก', value: 'nameDesc' },
    { label: 'ใหม่ล่าสุด', value: 'latest' },
    { label: 'เก่าสุด', value: 'oldest' },
  ];

  columns: { label: string; key: string; type?: 'text' | 'price' | 'badge'; pipe?: 'thaiDate' }[] =
    [
      { label: 'วันที่ทำรายการ', key: 'history_date', pipe: 'thaiDate' },
      { label: 'ผู้ใช้งานครุภัณฑ์', key: 'fullName' },
      { label: 'ประเภทการใช้งานครุภัณฑ์', key: 'usage_type_name' },
      { label: 'รายละเอียด', key: 'detail' },
    ];
}
