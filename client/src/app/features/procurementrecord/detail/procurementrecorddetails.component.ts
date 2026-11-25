import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  procurementRecordStatusHistoryTypes,
  procurementrecordTypes,
} from '../interface/procurementrecordTypes';
import { ThaiDatePipe } from '../../../shared/pipes/thai-date-pipe';
import { DecimalPipe, Location } from '@angular/common';
import { ProcurementrecordService } from '../service/procurementrecord.service';
@Component({
  selector: 'app-procurementrecord-details',
  imports: [ThaiDatePipe, DecimalPipe],
  templateUrl: './procurementrecorddetails.component.html',
})
export class ProcurementrecordDetailsComponent {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private location = inject(Location);
  private procurementrecordService = inject(ProcurementrecordService);

  isLoading = signal(false);

  procurementRecord = signal<procurementrecordTypes | null>(null);
  statusHistories = signal<procurementRecordStatusHistoryTypes[]>([]);
  procurement_record_id = signal<number | null>(null);

  ngOnInit() {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.procurement_record_id.set(id);

    // แสดงข้อมูลที่ส่งมาก่อนเพื่อไม่ให้หน้ากระพริบ แล้วโหลดใหม่เสมอเพราะยอดอาจถูกแก้จากหน้าครุภัณฑ์ย่อย
    const stateRecord = history.state?.procurementrecord as procurementrecordTypes | undefined;

    if (stateRecord) {
      this.procurementRecord.set(stateRecord);
      this.loadStatusHistory(id);
      this.procurementrecordService.getProcurementrecord(id).subscribe({
        next: (record) => this.procurementRecord.set(record),
      });
      return;
    }

    this.loadProcurementRecord(id);
  }

  private loadProcurementRecord(id: number) {
    this.isLoading.set(true);

    this.procurementrecordService.getProcurementrecord(id).subscribe({
      next: (record) => {
        this.procurementRecord.set(record);
        this.loadStatusHistory(id);
        this.isLoading.set(false);
      },
      error: () => {
        this.isLoading.set(false);
        this.procurementRecord.set(null);
      },
    });
  }

  private loadStatusHistory(id: number) {
    this.procurementrecordService.getProcurementrecordStatusHistory(id).subscribe({
      next: (histories) => this.statusHistories.set(histories),
      error: () => this.statusHistories.set([]),
    });
  }

  /** สีตามสถานะ: badge = ป้ายสถานะ, dot = จุดบนไทม์ไลน์, card = ขอบการ์ด */
  statusColor(status: string | null | undefined) {
    switch (status) {
      case 'รออนุมัติ':
      case 'รอเบิกจ่าย':
        return { badge: 'bg-amber-200 text-amber-950', dot: 'bg-amber-500 ring-amber-100', card: 'border-l-amber-500' };
      case 'อนุมัติแล้ว':
        return { badge: 'bg-blue-200 text-blue-950', dot: 'bg-blue-600 ring-blue-100', card: 'border-l-blue-600' };
      case 'เบิกจ่ายแล้ว':
      case 'ขึ้นทะเบียนแล้ว':
      case 'เสร็จสิ้น':
        return { badge: 'bg-emerald-200 text-emerald-950', dot: 'bg-emerald-600 ring-emerald-100', card: 'border-l-emerald-600' };
      case 'ยกเลิก':
        return { badge: 'bg-red-200 text-red-950', dot: 'bg-red-600 ring-red-100', card: 'border-l-red-600' };
      default: // ร่าง และสถานะอื่น ๆ
        return { badge: 'bg-slate-200 text-slate-900', dot: 'bg-slate-500 ring-slate-100', card: 'border-l-slate-500' };
    }
  }

  cancel() {
    if (history.state?.fromStaffDashboard && history.state?.staffId) {
      this.router.navigate(['/admin/staffs', history.state.staffId, 'dashboard'], {
        queryParams: {
          section: history.state.dashboardSection === 'inspections' ? 'inspections' : 'hires',
          ...(history.state.fiscalYearId ? { fiscal_year_id: history.state.fiscalYearId } : {}),
        },
      });
      return;
    }
    if (window.history.length > 1) {
      this.location.back();
    } else {
      this.router.navigate(['/admin/procurementrecord']);
    }
  }
}
