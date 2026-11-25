import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin, finalize } from 'rxjs';
import { MaterialWithdrawalService } from '../service/materialWithdrawal.service';
import { MaterialWithdrawalImpact, MaterialWithdrawalRevision, MaterialWithdrawalTypes } from '../interface/materialWithdrawalTypes';
import { SnackbarService } from '../../../core/services/snackbar.service';
import { ThaiDatePipe } from '../../../shared/pipes/thai-date-pipe';

@Component({
  selector: 'app-material-withdrawal-adjust',
  standalone: true,
  imports: [CommonModule, FormsModule, ThaiDatePipe],
  templateUrl: './adjust.component.html',
})
export class MaterialWithdrawalAdjustComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private service = inject(MaterialWithdrawalService);
  private snackbar = inject(SnackbarService);

  readonly id = Number(this.route.snapshot.paramMap.get('id'));
  withdrawal = signal<MaterialWithdrawalTypes | null>(null);
  impact = signal<MaterialWithdrawalImpact | null>(null);
  revisions = signal<MaterialWithdrawalRevision[]>([]);
  quantities: Record<number, number> = {};
  reason = '';
  loading = signal(true);
  saving = signal(false);

  ngOnInit() { this.reload(); }

  reload() {
    if (!Number.isInteger(this.id) || this.id <= 0) {
      this.router.navigate(['/admin/project/procurementrecord']);
      return;
    }
    this.loading.set(true);
    forkJoin({
      withdrawal: this.service.getMaterialWithdrawal(this.id),
      impact: this.service.getImpact(this.id),
      revisions: this.service.getRevisions(this.id),
    }).pipe(finalize(() => this.loading.set(false))).subscribe({
      next: ({ withdrawal, impact, revisions }) => {
        this.withdrawal.set(withdrawal);
        this.impact.set(impact);
        this.revisions.set(revisions);
        this.quantities = Object.fromEntries(impact.items.map(item => [item.receive_detail_id, item.current_quantity]));
      },
      error: () => this.snackbar.error('โหลดข้อมูลใบเบิกและผลกระทบสต็อกไม่สำเร็จ'),
    });
  }

  validationError(): string | null {
    const impact = this.impact();
    if (!impact || impact.status === 'cancelled') return 'ใบเบิกนี้ยกเลิกแล้ว';
    if (!this.reason.trim()) return 'กรุณาระบุเหตุผล';
    for (const item of impact.items) {
      const quantity = Number(this.quantities[item.receive_detail_id]);
      if (!Number.isInteger(quantity) || quantity < 0) return 'จำนวนต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป';
      if (quantity < item.minimum_quantity)
        return `${item.material_name}: ต้องไม่น้อยกว่า ${item.minimum_quantity} ตามยอดที่หน่วยงานปลายทางมีอยู่`;
    }
    if (impact.items.every(item => Number(this.quantities[item.receive_detail_id]) === item.current_quantity))
      return 'จำนวนวัสดุไม่เปลี่ยนแปลง';
    if (impact.items.every(item => Number(this.quantities[item.receive_detail_id]) === 0))
      return 'หากต้องการลดทุกรายการเป็นศูนย์ ให้ใช้ปุ่มยกเลิกใบเบิก';
    return null;
  }

  save() {
    const error = this.validationError();
    if (error) { this.snackbar.error(error); return; }
    const items = this.impact()!.items
      .filter(item => Number(this.quantities[item.receive_detail_id]) > 0)
      .map(item => ({
        receive_detail_id: item.receive_detail_id,
        material_item_id: item.material_item_id,
        quantity: Number(this.quantities[item.receive_detail_id]),
      }));
    this.saving.set(true);
    this.service.adjustWithdrawal(this.id, items, this.reason.trim())
      .pipe(finalize(() => this.saving.set(false))).subscribe({
        next: () => { this.snackbar.success('ปรับปรุงใบเบิกสำเร็จ'); this.reason = ''; this.reload(); },
        error: err => this.snackbar.error(err.error?.message ?? (typeof err.error === 'string' ? err.error : 'ปรับปรุงใบเบิกไม่สำเร็จ')),
      });
  }

  cancelWithdrawal() {
    if (!this.impact()?.can_cancel) {
      this.snackbar.error('ยกเลิกไม่ได้ เพราะมีรายการเบิกต่อหรือยอดปลายทางไม่พอ');
      return;
    }
    if (!this.reason.trim()) { this.snackbar.error('กรุณาระบุเหตุผล'); return; }
    if (!window.confirm('ยืนยันยกเลิกใบเบิกและคืนยอดสต็อก?')) return;
    this.saving.set(true);
    this.service.cancelPostedWithdrawal(this.id, this.reason.trim())
      .pipe(finalize(() => this.saving.set(false))).subscribe({
        next: () => { this.snackbar.success('ยกเลิกใบเบิกและคืนยอดสต็อกสำเร็จ'); this.reason = ''; this.reload(); },
        error: err => this.snackbar.error(err.error?.message ?? (typeof err.error === 'string' ? err.error : 'ยกเลิกใบเบิกไม่สำเร็จ')),
      });
  }

  back() {
    const id = this.withdrawal()?.procurement_record_id;
    this.router.navigate(id ? ['/admin/MaterialWithdrawal', id] : ['/admin/project/procurementrecord']);
  }

  getItemDiff(item: { receive_detail_id: number; current_quantity: number }): number {
    const newQty = Number(this.quantities[item.receive_detail_id] ?? 0);
    const oldQty = Number(item.current_quantity ?? 0);
    return Math.round((newQty - oldQty) * 100) / 100;
  }

  getChangedItemsCount(): number {
    const items = this.impact()?.items;
    if (!items) return 0;
    return items.filter(
      (item) => Number(this.quantities[item.receive_detail_id] ?? 0) !== Number(item.current_quantity ?? 0)
    ).length;
  }

  getTotalCurrentQuantity(): number {
    const items = this.impact()?.items;
    if (!items) return 0;
    return items.reduce((sum, item) => sum + Number(item.current_quantity ?? 0), 0);
  }

  getTotalNewQuantity(): number {
    const items = this.impact()?.items;
    if (!items) return 0;
    return items.reduce((sum, item) => sum + Number(this.quantities[item.receive_detail_id] ?? 0), 0);
  }

  isBelowMinimum(item: { receive_detail_id: number; minimum_quantity: number }): boolean {
    const newQty = Number(this.quantities[item.receive_detail_id] ?? 0);
    return newQty < Number(item.minimum_quantity ?? 0);
  }
}
