import {
  Component,
  DestroyRef,
  OnDestroy,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { HttpErrorResponse } from '@angular/common/http';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  Subscription,
  combineLatest,
  debounceTime,
  distinctUntilChanged,
  finalize,
  forkJoin,
  map,
  of,
  startWith,
  switchMap,
} from 'rxjs';
import Swal from 'sweetalert2';

import { MaterialWithdrawalService } from '../service/materialWithdrawal.service';
import { AssetWithdrawalExportService } from '../../assetWithdrawal/service/asset-withdrawal-export.service';
import { ProcurementrecordService } from '../../procurementrecord/service/procurementrecord.service';
import { StaffsService } from '../../staffs/service/staffsType.service';
import { staffsType } from '../../staffs/interface/staffsType';
import { procurementrecordTypes } from '../../procurementrecord/interface/procurementrecordTypes';
import {
  defaultMaterialExportSettings,
  MaterialExportSettings,
} from './material-export-settings';
import { MaterialExportSettingsService } from './material-export-settings.service';
import { SelectComponent } from '../../../../shared';
import { DatePickerComponent } from '../../../shared/date-picker/date-picker.component';

@Component({
  selector: 'app-material-export',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterLink,
    SelectComponent,
    DatePickerComponent,
  ],
  templateUrl: './material-export.component.html',
  styleUrl: './material-export.component.scss',
})
export class MaterialExportComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private sanitizer = inject(DomSanitizer);
  private withdrawalService = inject(MaterialWithdrawalService);
  private assetExportService = inject(AssetWithdrawalExportService);
  private procurementService = inject(ProcurementrecordService);
  private staffsService = inject(StaffsService);
  private settingsService = inject(MaterialExportSettingsService);
  private destroyRef = inject(DestroyRef);

  loading = signal(true);
  generating = signal(false);
  error = signal('');
  staffs = signal<staffsType[]>([]);
  procurement = signal<procurementrecordTypes | null>(null);
  previewUrl = signal<SafeResourceUrl | null>(null);

  exportDateControl = new FormControl<string>(this.getTodayDateString(), {
    nonNullable: true,
  });
  staffControl = new FormControl<number | null>(null);

  settings: MaterialExportSettings = { ...defaultMaterialExportSettings };

  private pdfBlob: Blob | null = null;
  objectUrl: string | null = null;
  private activeExportSub?: Subscription;

  get documentId(): number {
    return Number(this.route.snapshot.paramMap.get('id'));
  }

  /** ใช้หน้าเดียวกันส่งออกทั้งใบเบิกวัสดุและครุภัณฑ์ แยกด้วยค่า exportKind ใน route */
  get isAsset(): boolean {
    return this.route.snapshot.data['exportKind'] === 'asset';
  }

  get fromProcurement(): boolean {
    return (
      this.route.snapshot.routeConfig?.path?.includes('procurement') ?? false
    );
  }

  get formattedExportDate(): string {
    return this.formatDate(this.exportDateControl.value);
  }

  get selectedStaff(): staffsType | undefined {
    const id = Number(this.staffControl.value);
    return this.staffs().find((s) => s.staff_id === id);
  }

  get isFormValid(): boolean {
    const staffId = Number(this.staffControl.value);
    const date = this.formattedExportDate;
    return (
      !this.loading() &&
      !!date &&
      this.staffs().some((staff) => staff.staff_id === staffId) &&
      !!this.settings.departmentName?.trim() &&
      !!this.settings.suppliesOfficer?.trim() &&
      (this.settings.responsibilityText?.includes('{date}') ?? false)
    );
  }

  get canGenerate(): boolean {
    return this.isFormValid && !this.generating();
  }

  get canDownload(): boolean {
    return this.isFormValid && !!this.previewUrl() && !this.generating();
  }

  ngOnInit(): void {
    const id = this.documentId;
    if (!Number.isInteger(id) || id < 1) {
      this.error.set('ไม่พบเลขเอกสาร');
      this.loading.set(false);
      return;
    }

    this.setupAutoPreviewListener();

    (this.fromProcurement
      ? of(id)
      : this.withdrawalService.getMaterialWithdrawal(id).pipe(
          map((withdrawal) => withdrawal.procurement_record_id),
        )
    )
      .pipe(
        switchMap((procurementId) =>
          this.procurementService.getProcurementrecord(procurementId),
        ),
        switchMap((procurement) =>
          forkJoin({
            staffs: this.isAsset ? this.loadAssetStaffs(procurement.procurement_record_id) : this.loadAllStaffs(),
            settings: this.settingsService.get(),
          }).pipe(map((data) => ({ procurement, ...data }))),
        ),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: ({ procurement, staffs, settings }) => {
          this.staffs.set(staffs);
          this.procurement.set(procurement);
          this.settings = settings;

          if (this.isAsset) {
            // ผู้รับของมาจากรายการเบิกครุภัณฑ์ที่บันทึกไว้ เลือกคนล่าสุดให้ก่อน
            if (staffs.length) this.staffControl.setValue(staffs[0].staff_id);
            else this.error.set('ยังไม่มีรายการเบิกครุภัณฑ์ของเอกสารนี้ กรุณาบันทึกการเบิกครุภัณฑ์ก่อนส่งออกใบเบิก');
          } else if (procurement.staff_id) {
            // ถ้าเอกสารมี staff_id ให้เลือกเริ่มต้นทันที
            this.staffControl.setValue(procurement.staff_id);
          }

          // ตรวจสอบและแสดงตัวอย่างทันทีหากข้อมูลครบ
          if (this.isFormValid) {
            this.generatePreview();
          }
        },
        error: () => this.error.set('โหลดข้อมูลสำหรับส่งออกไม่สำเร็จ'),
      });
  }

  private setupAutoPreviewListener(): void {
    combineLatest([
      this.exportDateControl.valueChanges.pipe(
        startWith(this.exportDateControl.value),
      ),
      this.staffControl.valueChanges.pipe(startWith(this.staffControl.value)),
    ])
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        debounceTime(250),
        distinctUntilChanged(
          ([prevDate, prevStaff], [currDate, currStaff]) =>
            this.formatDate(prevDate) === this.formatDate(currDate) &&
            prevStaff === currStaff,
        ),
      )
      .subscribe(() => {
        if (this.isFormValid) {
          this.generatePreview();
        } else if (!this.loading()) {
          this.clearPreview();
        }
      });
  }

  private loadAssetStaffs(procurementId: number) {
    return this.assetExportService.getStaffs(procurementId).pipe(
      map((rows) => rows.map((r) => ({ staff_id: r.staffId, full_name: r.fullName }) as unknown as staffsType)),
    );
  }

  private loadAllStaffs() {
    const fetch = (
      pageNumber: number,
      accumulated: staffsType[] = [],
    ): ReturnType<StaffsService['getStaffs']> =>
      this.staffsService
        .getStaffs({ sort: '', search: '', pageSize: 100, pageNumber })
        .pipe(
          switchMap((page) => {
            const all = [...accumulated, ...page.data];
            return all.length < page.count && page.data.length
              ? fetch(pageNumber + 1, all)
              : [{ ...page, data: all }];
          }),
        );
    return fetch(1).pipe(map((page) => page.data));
  }

  clearPreview(): void {
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = null;
    this.pdfBlob = null;
    this.previewUrl.set(null);
  }

  generatePreview(): void {
    if (!this.isFormValid) return;

    if (this.activeExportSub) {
      this.activeExportSub.unsubscribe();
    }

    this.generating.set(true);
    this.error.set('');

    const payload = this.payload();
    this.activeExportSub = (
      this.isAsset
        ? this.assetExportService.exportPdf(this.documentId, payload)
        : this.fromProcurement
          ? this.withdrawalService.exportProcurementPdf(this.documentId, payload)
          : this.withdrawalService.exportPdf(this.documentId, payload)
    )
      .pipe(finalize(() => this.generating.set(false)))
      .subscribe({
        next: (blob) => this.showPdf(blob),
        error: (response) => this.showError(response),
      });
  }

  private payload() {
    return {
      exportDate: this.formattedExportDate,
      staffId: Number(this.staffControl.value),
    };
  }

  async downloadPdf(): Promise<void> {
    if (!this.canDownload) return;

    const hasIssued =
      !!this.procurement()?.export_book_number &&
      !!this.procurement()?.export_serial_number;

    if (!hasIssued) {
      const confirmResult = await Swal.fire({
        title: 'ยืนยันการออกเลขและดาวน์โหลด?',
        text: 'ระบบจะทำการจองเล่มที่และเลขที่ใบเบิกในฐานข้อมูล และสร้างไฟล์ PDF',
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'ยืนยันออกเลขและดาวน์โหลด',
        cancelButtonText: 'ยกเลิก',
        confirmButtonColor: '#166534',
        cancelButtonColor: '#64748b',
      });
      if (!confirmResult.isConfirmed) return;
    }

    this.generating.set(true);
    this.error.set('');

    (this.isAsset
      ? this.assetExportService.issuePdf(this.documentId, this.payload())
      : this.fromProcurement
        ? this.withdrawalService.issueProcurementPdf(this.documentId, this.payload())
        : this.withdrawalService.issuePdf(this.documentId, this.payload())
    )
      .pipe(finalize(() => this.generating.set(false)))
      .subscribe({
        next: (blob) => {
          this.showPdf(blob);
          this.savePdf();
          this.reloadProcurementInfo();
          Swal.fire({
            title: 'ออกเลขสำเร็จ',
            text: 'ระบบได้ออกเลขที่ใบเบิกและเริ่มดาวน์โหลดไฟล์ PDF เรียบร้อยแล้ว',
            icon: 'success',
            timer: 2000,
            showConfirmButton: false,
          });
        },
        error: (response) => this.showError(response),
      });
  }

  private reloadProcurementInfo(): void {
    const id = this.documentId;
    (this.fromProcurement
      ? of(id)
      : this.withdrawalService.getMaterialWithdrawal(id).pipe(
          map((w) => w.procurement_record_id),
        )
    )
      .pipe(
        switchMap((procurementId) =>
          this.procurementService.getProcurementrecord(procurementId),
        ),
      )
      .subscribe({
        next: (p) => this.procurement.set(p),
        error: () => {},
      });
  }

  openInNewTab(): void {
    if (this.objectUrl) {
      window.open(this.objectUrl, '_blank');
    }
  }

  private showPdf(blob: Blob): void {
    this.clearPreview();
    this.pdfBlob = blob;
    this.objectUrl = URL.createObjectURL(blob);
    this.previewUrl.set(
      this.sanitizer.bypassSecurityTrustResourceUrl(this.objectUrl),
    );
  }

  private savePdf(): void {
    if (!this.pdfBlob || !this.objectUrl) return;
    const link = document.createElement('a');
    link.href = this.objectUrl;
    link.download = `${this.isAsset ? 'asset' : 'material'}-withdrawal-${this.documentId}.pdf`;
    link.click();
  }

  private showError(response: HttpErrorResponse): void {
    if (response.error instanceof Blob && response.error.type.includes('json')) {
      response.error.text().then((text) => {
        try {
          this.error.set(JSON.parse(text).message || 'สร้าง PDF ไม่สำเร็จ');
        } catch {
          this.error.set('สร้าง PDF ไม่สำเร็จ');
        }
      });
    } else if (typeof response.error === 'string') {
      this.error.set(response.error);
    } else {
      this.error.set('สร้าง PDF ไม่สำเร็จ กรุณาลองอีกครั้ง');
    }
  }

  back(): void {
    if (this.isAsset) {
      // กลับไปหน้ารายการครุภัณฑ์ของเอกสารจัดซื้อ พร้อมโครงการและปีงบประมาณเดิม
      this.router.navigate(['/admin/assetItems', this.documentId], {
        queryParams: this.route.snapshot.queryParams,
        state: { procurementrecord: history.state?.procurementrecord, project_id: history.state?.project_id, projectstate: history.state?.projectstate },
      });
      return;
    }
    this.router.navigate(
      this.fromProcurement
        ? ['/admin/materialReceiveDetails', this.documentId]
        : ['/admin/MaterialWithdrawal/detail', this.documentId],
    );
  }

  private getTodayDateString(): string {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private formatDate(value: any): string {
    if (!value) return '';
    if (value instanceof Date) {
      const year = value.getFullYear();
      const month = String(value.getMonth() + 1).padStart(2, '0');
      const day = String(value.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    if (typeof value === 'string') {
      return value.includes('T') ? value.split('T')[0] : value.trim();
    }
    return String(value);
  }

  ngOnDestroy(): void {
    if (this.activeExportSub) {
      this.activeExportSub.unsubscribe();
    }
    this.clearPreview();
  }
}
