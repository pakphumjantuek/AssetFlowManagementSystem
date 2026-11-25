import { Params } from './../../shared/models/allType';
import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Location } from '@angular/common';
import { CommonModule } from '@angular/common';
import { HostListener } from '@angular/core';
import { finalize } from 'rxjs';

import { DataTableComponent, TableAction, TableColumn } from '../../../shared/data-table/data-table.component';
import { Pagination } from '../../shared/models/pagination';
import { AlertService } from '../../../shared.service';
import { MaterialWithdrawalService } from './service/materialWithdrawal.service';
import { TableState } from '../../../shared/TableState';
import { MaterialWithdrawalDisplayItemTypes, MaterialWithdrawalTypes } from './interface/materialWithdrawalTypes';
import { SnackbarService } from '../../core/services/snackbar.service';

@Component({
  selector: 'app-material-withdrawal',
  standalone: true,
  imports: [CommonModule, DataTableComponent],
  templateUrl: './materialWithdrawal.component.html',
})
export class MaterialWithdrawalComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private materialWithdrawalService = inject(MaterialWithdrawalService);
  private alertService = inject(AlertService);
  private snackbar = inject(SnackbarService);
  private location = inject(Location);
  private table = new TableState();
  Params = new Params();

  procurement_record_id = signal<number | null>(null);

  materialWithdrawal?: Pagination<MaterialWithdrawalTypes>;
  materialWithdrawals = signal<MaterialWithdrawalTypes[]>([]);
  totalCount = signal<number>(0);
  selectedWithdrawal = signal<MaterialWithdrawalTypes | null>(null);
  withdrawalItems = signal<MaterialWithdrawalDisplayItemTypes[]>([]);
  itemsLoading = signal(false);

  @HostListener('document:keydown.escape')
  closeItemsModal() {
    this.selectedWithdrawal.set(null);
    this.withdrawalItems.set([]);
  }

  onTableAction(action: TableAction) {
    if (action.type !== 'detail') return;
    const withdrawal = action.item as MaterialWithdrawalTypes;
    this.router.navigate(['/admin/MaterialWithdrawal/detail', withdrawal.material_withdrawal_id], {
      state: {
        materialWithdrawal: withdrawal,
        procurementrecord: history.state?.procurementrecord,
      },
    });
  }

  headerColor = 'bg-green-800';
  headerBorderColor = 'border-green-950';
  butttonColor = 'bg-green-800 hover:bg-green-900';

  ngOnInit(): void {
    const idParam = this.route.snapshot.paramMap.get('id');
    const id = idParam ? Number(idParam) : null;

    if (id && Number.isFinite(id)) {
      this.procurement_record_id.set(id);
      this.loadMaterialWithdrawal(id);
    }
  }

  loadMaterialWithdrawal(id: number) {
    this.materialWithdrawalService
      .getMaterialWithdrawalbyProcuremens(this.table.params, id)
      .subscribe({
        next: (response) => {
          this.materialWithdrawal = response;
          this.materialWithdrawals.set(response.data.map(item => ({
            ...item,
            stock_status_label: item.stock_status === 'cancelled'
              ? 'ยกเลิกแล้ว'
              : item.items_summary ? 'ตัดสต็อกแล้ว' : 'ยังไม่ตัดสต็อก',
          })));
          this.totalCount.set(response.count);
        },
        error: (error) => console.error(error),
      });
  }

  onSearch(value: string) {
    const id = this.procurement_record_id();
    if (!id) return;

    this.table.onSearch(value, () => this.loadMaterialWithdrawal(id));
  }

  onPageChange(page: number) {
    const id = this.procurement_record_id();
    if (!id) return;

    this.table.onPageChange(page, () => this.loadMaterialWithdrawal(id));
  }

  onSort(value: string) {
    const id = this.procurement_record_id();
    if (!id) return;

    this.table.onSort(value, () => this.loadMaterialWithdrawal(id));
  }

  deleteMaterialWithdrawal(id: number) {
    this.alertService.confirm('ยืนยันการลบ', 'คุณต้องการลบหรือไม่?').then((result) => {
      if (result.isConfirmed) {
        this.confirmDelete(id);
      }
    });
  }

  confirmDelete(id: number) {
    const procurementId = this.procurement_record_id();
    if (!procurementId) return;

    this.materialWithdrawalService.deleteMaterialWithdrawal(id).subscribe({
      next: () => {
        this.alertService.successNo('ลบรายการเรียบร้อยแล้ว');
        this.loadMaterialWithdrawal(procurementId);
      },
      error: (error) => this.snackbar.error(error.error?.message ??
        (typeof error.error === 'string' ? error.error : 'ลบใบเบิกไม่สำเร็จ')),
    });
  }

  goToCreate() {
    const procurementId = this.procurement_record_id();
    if (!procurementId) return;

    this.router.navigate(['/admin/MaterialWithdrawal/create'], {
      queryParams: {
        procurement_record_id: procurementId,
      },
      state: {
        procurementrecord: history.state?.procurementrecord,
      },
    });
  }

  goToEdit(mat: MaterialWithdrawalTypes) {
    this.router.navigate(['/admin/MaterialWithdrawal/update', mat.material_withdrawal_id], {
      state: {
        materialWithdrawal: mat,
        procurementrecord: history.state?.procurementrecord,
      },
    });
  }

  sortOptions = [
    { label: 'ใบเบิก ก-ฮ', value: 'nameAsc' },
    { label: 'ใบเบิก ฮ-ก', value: 'nameDesc' },
    { label: 'ใหม่ล่าสุด', value: 'latest' },
    { label: 'เก่าสุด', value: 'oldest' },
  ];

  columns: TableColumn[] = [
    { label: 'ครั้งที่', key: 'withdrawal_number' },
    { label: 'วันที่เบิก', key: 'withdrawal_date', pipe: 'thaiDate' },
    { label: 'อ้างอิงเอกสารขออนุมัติเลขที่', key: 'withdrawal_document_no' },
    { label: 'อ้างอิงเอกสารจัดซื้อเลขที่', key: 'material_receive_id' },
    { label: 'ผู้เบิก', key: 'staff_name' },
    { label: 'รายการที่เบิก', key: 'items_summary' },
    { label: 'หมายเหตุ', key: 'remark' },
    { label: 'รายละเอียดการเบิก', key: 'material_withdrawal_id', type: 'button', actionLabel: 'ดูรายละเอียดการเบิก' },
  ];

  cancel() {
    const procurementId = this.procurement_record_id();
    if (!procurementId) return;

    this.router.navigate(['/admin/materialReceiveDetails', procurementId], {
      state: {
        procurementrecord: history.state?.procurementrecord,
      },
    });
  }
}
