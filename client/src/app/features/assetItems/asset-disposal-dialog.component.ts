import { Component, EventEmitter, inject, Input, OnInit, Output, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { DatePickerComponent } from '../../shared/date-picker/date-picker.component';
import { ThaiDatePipe } from '../../shared/pipes/thai-date-pipe';
import { FormsModule } from '@angular/forms';
import { AssetDisposalService, DisposalDocument } from './service/asset-disposal.service';

@Component({
  selector: 'app-asset-disposal-dialog', standalone: true, imports: [FormsModule, ReactiveFormsModule, DatePickerComponent, ThaiDatePipe],
  template: `
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
    <section role="dialog" aria-modal="true" aria-labelledby="disposal-heading" class="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-slate-300 bg-white shadow-2xl">
      <div class="border-b-2 border-orange-800 bg-orange-700 px-6 py-4">
        <h2 id="disposal-heading" class="text-xl font-bold text-white">{{ readonly ? 'เอกสารจำหน่าย' : 'จำหน่ายครุภัณฑ์' }}</h2>
        <p class="mt-1 text-base text-white">{{ name }}</p>
      </div>

      <div class="flex-1 space-y-5 overflow-y-auto px-6 py-5">
      @if (!readonly) {
        <form id="disposal-form" (ngSubmit)="save()" class="space-y-5">
          <!-- ขั้นที่ 1 -->
          <div class="flex gap-3">
            <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-700 text-base font-bold text-white">1</span>
            <div class="min-w-0 flex-1">
              <p class="text-lg font-bold text-slate-900">แนบเอกสารจำหน่าย <span class="text-red-700">*</span></p>
              <p class="text-base text-slate-700">ไฟล์ PDF, JPG หรือ PNG ขนาดไม่เกิน 10 MB</p>
              <input type="file" accept=".pdf,.jpg,.jpeg,.png" (change)="selectFile($event)" [disabled]="saving()" class="mt-2 block w-full rounded-lg border border-slate-400 bg-white p-2 text-base text-slate-800 file:mr-3 file:rounded-md file:border-0 file:bg-orange-700 file:px-4 file:py-2 file:text-base file:font-bold file:text-white" required />
              @if (file) { <p class="mt-1.5 text-base font-semibold text-green-800">✓ เลือกไฟล์แล้ว: {{ file.name }}</p> }
            </div>
          </div>

          <!-- ขั้นที่ 2 -->
          <div class="flex gap-3">
            <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-700 text-base font-bold text-white">2</span>
            <div class="min-w-0 flex-1 space-y-3">
              <p class="text-lg font-bold text-slate-900">ระบุรายละเอียด</p>
              <app-date-picker label="วันที่จำหน่าย *" [control]="dateControl" />
              <label class="block text-base font-semibold text-slate-800">เลขที่เอกสาร <span class="font-normal text-slate-700">(ไม่บังคับ)</span>
                <input [(ngModel)]="number" name="number" maxlength="200" [disabled]="saving()" class="mt-1 block w-full rounded-lg border border-slate-400 bg-white px-3 py-2.5 text-base font-normal text-slate-900 outline-none focus:border-orange-600 focus:ring-2 focus:ring-orange-600/30" />
              </label>
              <label class="block text-base font-semibold text-slate-800">หมายเหตุ <span class="font-normal text-slate-700">(ไม่บังคับ)</span>
                <textarea [(ngModel)]="notes" name="notes" maxlength="1000" rows="2" [disabled]="saving()" class="mt-1 block w-full rounded-lg border border-slate-400 bg-white px-3 py-2.5 text-base font-normal text-slate-900 outline-none focus:border-orange-600 focus:ring-2 focus:ring-orange-600/30"></textarea>
              </label>
            </div>
          </div>

          <!-- สิ่งที่จะเกิดขึ้น -->
          <div class="rounded-lg border border-orange-300 bg-orange-50 p-4 text-base text-orange-950">
            <p class="font-bold">เมื่อกดบันทึก</p>
            <p class="mt-1">{{ subId ? 'ครุภัณฑ์ชิ้นนี้จะเปลี่ยนสถานะเป็น "จำหน่ายแล้ว"' : 'ครุภัณฑ์ย่อยทุกชิ้นในชุดนี้ที่ยังไม่จำหน่าย จะเปลี่ยนสถานะเป็น "จำหน่ายแล้ว" (ชิ้นที่จำหน่ายไปก่อนหน้านี้ ยังเก็บเอกสารเดิมไว้)' }}</p>
          </div>

          @if (error()) { <p role="alert" class="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-base font-semibold text-red-800">{{ error() }}</p> }
        </form>
      }
      @if (loading()) { <p class="text-base text-slate-700">กำลังโหลดเอกสาร…</p> }
      @if (readonly && !loading() && documents().length === 0 && !error()) { <p class="rounded-lg border border-slate-300 bg-slate-50 p-4 text-base text-slate-800">รายการจำหน่ายจากระบบเดิม ยังไม่มีไฟล์เอกสาร</p> }
      @if (legacy(); as previous) {
        <div class="space-y-1 rounded-lg border border-slate-300 bg-slate-50 p-4 text-base text-slate-800"><p class="font-bold">วันที่จำหน่าย {{ previous.disposal_date | thaiDate: false : 'long' }}</p><p>{{ previous.disposal_method }}</p><p>{{ previous.disposal_reason }}</p><p>{{ previous.notes }}</p></div>
      }
      @for (doc of documents(); track doc.disposal_document_id) {
        <div class="rounded-lg border border-slate-300 bg-slate-50 p-4 text-base">
          <p class="break-all text-lg font-bold text-slate-900">{{ doc.original_filename }}</p>
          <dl class="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-slate-800">
            <dt class="font-semibold">วันที่จำหน่าย</dt><dd>{{ doc.disposal_date | thaiDate: false : 'long' }}</dd>
            <dt class="font-semibold">ขอบเขต</dt><dd>{{ doc.asset_sub_item_id ? 'ครุภัณฑ์ย่อยชิ้นนี้' : 'ทั้งชุด' }}</dd>
            @if (doc.document_no) { <dt class="font-semibold">เลขที่เอกสาร</dt><dd>{{ doc.document_no }}</dd> }
            @if (doc.notes) { <dt class="font-semibold">หมายเหตุ</dt><dd class="whitespace-pre-wrap">{{ doc.notes }}</dd> }
          </dl>
          <div class="mt-3 flex gap-2">
            <button type="button" (click)="download(doc, true)" [disabled]="downloading()" class="rounded-lg bg-orange-700 px-4 py-2 text-base font-bold text-white hover:bg-orange-800 disabled:opacity-50">เปิดเอกสาร</button>
            <button type="button" (click)="download(doc)" [disabled]="downloading()" class="rounded-lg border border-slate-400 bg-white px-4 py-2 text-base font-bold text-slate-800 hover:bg-slate-100 disabled:opacity-50">ดาวน์โหลด</button>
          </div>
        </div>
      }
      @if (readonly && error()) { <p role="alert" class="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-base font-semibold text-red-800">{{ error() }}</p> }
      </div>

      <div class="flex justify-end gap-3 border-t border-slate-300 bg-slate-50 px-6 py-4">
        @if (!readonly) {
          <button type="button" (click)="closed.emit()" [disabled]="saving()" class="rounded-lg border border-slate-400 bg-white px-5 py-2.5 text-base font-bold text-slate-800 hover:bg-slate-100 disabled:opacity-50">ยกเลิก</button>
          <button type="submit" form="disposal-form" [disabled]="saving() || !file || !date" class="rounded-lg bg-red-700 px-5 py-2.5 text-base font-bold text-white hover:bg-red-800 disabled:opacity-50">{{ saving() ? 'กำลังบันทึก…' : 'บันทึกและจำหน่าย' }}</button>
        } @else {
          <button type="button" (click)="closed.emit()" class="rounded-lg border border-slate-400 bg-white px-6 py-2.5 text-base font-bold text-slate-800 hover:bg-slate-100">ปิด</button>
        }
      </div>
    </section>
  </div>`
})
export class AssetDisposalDialogComponent implements OnInit {
  @Input({ required: true }) assetId!: number;
  @Input() subId: number | null = null;
  @Input() name = '';
  @Input() readonly = false;
  @Output() closed = new EventEmitter<void>();
  @Output() saved = new EventEmitter<void>();
  private service = inject(AssetDisposalService);
  documents = signal<DisposalDocument[]>([]);
  loading = signal(false);
  saving = signal(false);
  downloading = signal(false);
  error = signal('');
  legacy = signal<{ disposal_date: string; disposal_method: string; disposal_reason: string | null; notes: string | null } | null>(null);
  file: File | null = null;
  dateControl = new FormControl<string>((() => { const today = new Date(); return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`; })(), { nonNullable: true });
  get date(): string { return this.dateControl.value; }
  number = '';
  notes = '';
  ngOnInit(): void {
    this.loading.set(true);
    this.service.documents(this.assetId, this.subId).subscribe({ next: docs => {
      this.documents.set(docs); this.loading.set(false);
      if (this.readonly && this.subId && docs.length === 0) this.service.legacyDisposal(this.subId).subscribe({ next: history => this.legacy.set(history), error: () => {} });
    }, error: () => { this.error.set('โหลดเอกสารไม่สำเร็จ'); this.loading.set(false); } });
  }
  selectFile(event: Event): void {
    this.file = (event.target as HTMLInputElement).files?.[0] ?? null;
    this.error.set('');
    if (this.file && (this.file.size > 10 * 1024 * 1024 || !/\.(pdf|png|jpe?g)$/i.test(this.file.name))) {
      this.file = null;
      this.error.set('เลือกไฟล์ PDF, JPG หรือ PNG ขนาดไม่เกิน 10 MB');
    }
  }
  save(): void {
    if (!this.file || !this.date || this.saving()) return;
    this.saving.set(true);
    this.error.set('');
    this.service.upload(this.assetId, this.subId, this.file, this.date, this.number, this.notes).subscribe({ next: () => { this.saving.set(false); this.saved.emit(); }, error: err => { this.saving.set(false); this.error.set(typeof err.error === 'string' ? err.error : 'บันทึกเอกสารไม่สำเร็จ กรุณาลองใหม่'); } });
  }
  download(doc: DisposalDocument, preview = false): void {
    if (this.downloading()) return;
    this.downloading.set(true);
    const previewWindow = preview ? window.open('', '_blank') : null;
    if (previewWindow) previewWindow.opener = null;
    this.service.download(doc.disposal_document_id).subscribe({
      next: blob => {
        const url = URL.createObjectURL(blob);
        if (previewWindow) previewWindow.location.href = url;
        else { const a = document.createElement('a'); a.href = url; a.download = doc.original_filename; a.click(); }
        setTimeout(() => URL.revokeObjectURL(url), previewWindow ? 60000 : 1000);
        this.downloading.set(false);
      },
      error: () => { previewWindow?.close(); this.error.set('เปิดหรือดาวน์โหลดเอกสารไม่สำเร็จ'); this.downloading.set(false); }
    });
  }
}
