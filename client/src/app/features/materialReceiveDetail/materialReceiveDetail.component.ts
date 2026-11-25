import { Component, OnInit, inject, signal, Pipe } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DataTableComponent } from '../../../shared/data-table/data-table.component';
import { Pagination } from '../../shared/models/pagination';
import { Params } from '../../shared/models/allType';
import { materialReceiveDetailTypes } from './interface/materialReceiveDetailTypes';
import { TableState } from '../../../shared/TableState';
import { DecimalPipe, Location } from '@angular/common';
import { MaterialReceiveDetailService } from './service/materialReceiveDetail.service';
import { MaterialWithdrawalService } from '../materialWithdrawal/service/materialWithdrawal.service';
import { ProcurementrecordService } from '../procurementrecord/service/procurementrecord.service';
import { procurementrecordTypes } from '../procurementrecord/interface/procurementrecordTypes';
import { catchError, finalize, forkJoin, of } from 'rxjs';

@Component({
  selector: 'app-material-receive-detail',
  standalone: true,
  imports: [DecimalPipe],
  templateUrl: './materialReceiveDetail.component.html',
})
export class MaterialReceiveDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private materialReceiveDetailService = inject(MaterialReceiveDetailService);
  private materialWithdrawalService = inject(MaterialWithdrawalService);
  private procurementrecordService = inject(ProcurementrecordService);
  private table = new TableState();

  procurement_record_id = signal<number | null>(null);
  MaterialReceiveDetail?: Pagination<materialReceiveDetailTypes>;
  MaterialReceiveDetails = signal<materialReceiveDetailTypes[]>([]);
  availableByDetail = signal<Record<number, number>>({});
  issuedByDetail = signal<Record<number, number>>({});
  unassignedByDetail = signal<Record<number, boolean>>({});
  balanceLoadFailed = signal(false);
  isBalanceLoading = signal(false);
  Params = new Params();
  totalCount = signal<number>(0);
  procurementrecord: procurementrecordTypes | undefined = history.state?.procurementrecord;

  ngOnInit(): void {
    const idParam = this.route.snapshot.paramMap.get('id');
    const id = idParam ? Number(idParam) : null;

    if (id && Number.isFinite(id)) {
      this.procurement_record_id.set(id);
      this.LoadgetMaterialReceiveDetail(id);
      if (!this.procurementrecord) {
        this.procurementrecordService.getProcurementrecord(id).subscribe({
          next: (record) => this.procurementrecord = record,
          error: (error) => console.error(error),
        });
      }
    }
  }

  LoadgetMaterialReceiveDetail(id: number) {
    this.balanceLoadFailed.set(false);
    this.isBalanceLoading.set(true);
    forkJoin({
      details: this.materialReceiveDetailService.getMaterialReceiveDetailbyProcuremens(this.table.params, id),
      available: this.materialWithdrawalService.getAvailableItems(id).pipe(
        catchError((error) => {
          this.balanceLoadFailed.set(true);
          console.error(error);
          return of(null);
        }),
      ),
      issueSummary: this.materialReceiveDetailService.getIssueSummary(id).pipe(
        catchError((error) => {
          this.balanceLoadFailed.set(true);
          console.error(error);
          return of(null);
        }),
      ),
    }).pipe(finalize(() => this.isBalanceLoading.set(false)))
      .subscribe({
        next: ({ details, available, issueSummary }) => {
          this.MaterialReceiveDetails.set(details.data);
          this.totalCount.set(details.count);
          this.availableByDetail.set(Object.fromEntries(
            (available ?? []).map((item) => [item.receive_detail_id, Number(item.available_quantity ?? 0)]),
          ));
          this.issuedByDetail.set(Object.fromEntries(
            (issueSummary ?? []).map((item) => [item.receive_detail_id, Number(item.issued_quantity ?? 0)]),
          ));
          this.unassignedByDetail.set(Object.fromEntries(
            (issueSummary ?? []).map((item) => [item.receive_detail_id, item.has_unassigned_outgoing]),
          ));
        },
        error: (error) => {
          this.balanceLoadFailed.set(true);
          console.error(error);
        },
      });
  }

  availableQuantity(item: materialReceiveDetailTypes): number {
    return this.availableByDetail()[item.receive_detail_id] ?? 0;
  }

  withdrawnQuantity(item: materialReceiveDetailTypes): number {
    return this.issuedByDetail()[item.receive_detail_id] ?? 0;
  }

  hasUnassignedIssues(): boolean {
    return Object.values(this.unassignedByDetail()).some(Boolean);
  }

  onSearch(value: string) {
    const id = this.procurement_record_id();

    if (!id) return;

    this.table.onSearch(value, () => this.LoadgetMaterialReceiveDetail(id));
  }

  onPageChange(page: number) {
    const id = this.procurement_record_id();

    if (!id) return;

    this.table.onPageChange(page, () => this.LoadgetMaterialReceiveDetail(id));
  }

  onSort(value: string) {
    const id = this.procurement_record_id();

    if (!id) return;

    this.table.onSort(value, () => this.LoadgetMaterialReceiveDetail(id));
  }

  goToCreate() {
    const procurementId = this.procurement_record_id();
    const procurementrecord = history.state?.procurementrecord;

    if (!procurementId) return;

    this.router.navigate(['/admin/materialReceiveDetails/create'], {
      queryParams: {
        procurement_record_id: procurementId,
      },
      state: {
        procurementrecord,
      },
    });
  }

  goToWithdrawal() {
    const procurementId = this.procurement_record_id();
    if (!procurementId) return;

    this.router.navigate(['/admin/MaterialWithdrawal', procurementId], {
      state: { procurementrecord: history.state?.procurementrecord },
    });
  }

  goToExport() {
    const procurementId = this.procurement_record_id();
    if (procurementId) this.router.navigate(['/admin/MaterialWithdrawal/export/procurement', procurementId]);
  }

  goToEdit(mat: materialReceiveDetailTypes) {
    this.router.navigate(['/admin/materialReceiveDetails/update', mat.receive_detail_id], {
      state: {
        MaterialReceiveDetail: mat,
        procurementrecord: history.state?.procurementrecord,
      },
    });
  }

  getTotalAmount() {
    return this.MaterialReceiveDetails().reduce((sum, item) => {
      return sum + Number(item.total_amount || 0);
    }, 0);
  }

  cancel() {
    const procurementId = this.procurement_record_id();
    if (!this.procurementrecord?.project_id && procurementId) {
      this.procurementrecordService.getProcurementrecord(procurementId).subscribe({
        next: (record) => this.navigateBack(record),
        error: () => this.navigateBack(),
      });
      return;
    }
    this.navigateBack(this.procurementrecord);
  }

  private navigateBack(record?: procurementrecordTypes) {
    this.router.navigate(['/admin/project/procurementrecord'], {
      queryParams: record?.project_id ? {
        project_id: record.project_id,
        fiscal_year_id: record.fiscal_year_id,
      } : undefined,
      state: {
        procurementrecord: record,
        project_id: record?.project_id,
        projectstate: history.state?.projectstate,
      },
    });
  }
}
