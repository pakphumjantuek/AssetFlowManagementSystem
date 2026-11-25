import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize, forkJoin } from 'rxjs';
import { InputComponent } from '../../../../shared/input/input.component';
import { SnackbarService } from '../../../core/services/snackbar.service';
import { assetRepairsTypes } from '../interface/assetRepairsTypes';
import { AssetRepairsService } from '../service/assetRepairs.service';
import { DatePickerComponent } from '../../../shared/date-picker/date-picker.component';
import { TextareaComponent, SelectComponent } from '../../../../shared';
import { StaffsService } from '../../staffs/service/staffsType.service';
import { AssetWithdrawalService } from '../../assetWithdrawal/service/assetWithdrawal.service';
import { VendorsService } from '../../vendors/service/vendors.service';
import { ProcurementVendorQuickCreateModalComponent } from '../../procurementrecord/components/procurement-vendor-quick-create-modal/procurement-vendor-quick-create-modal.component';

@Component({
  selector: 'app-addupdate',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    DatePickerComponent,
    InputComponent,
    TextareaComponent,
    SelectComponent,
    ProcurementVendorQuickCreateModalComponent,
  ],
  templateUrl: './addupdate.component.html',
})
export class AssetRepairsAddUpdateComponent implements OnInit {
  private fb = inject(FormBuilder);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private assetRepairsService = inject(AssetRepairsService);
  private staffsService = inject(StaffsService);
  private assetWithdrawalService = inject(AssetWithdrawalService);
  private vendorsService = inject(VendorsService);
  private snackbar = inject(SnackbarService);

  procurement_withdrawal_id = signal<number | null>(null);
  asset_repair_id = signal<number | null>(null);

  staffs = signal<any[]>([]);
  // เจ้าของครุภัณฑ์ (ผู้เบิก) ที่ใช้เป็นค่าเริ่มต้นของผู้รับผิดชอบ
  private owner = signal<{ staff_id: number; full_name: string } | null>(null);
  // รายชื่อบุคลากรที่โหลดมาอาจไม่ครบ จึงเติมเจ้าของเข้าไปถ้ายังไม่มี เพื่อให้ช่องเลือกแสดงชื่อได้
  staffOptions = computed(() => {
    const owner = this.owner();
    const list = this.staffs();
    return owner && !list.some((s) => s.staff_id === owner.staff_id) ? [owner, ...list] : list;
  });
  vendors = signal<{ vendor_id: number; vendor_name: string }[]>([]);
  isVendorModalOpen = signal(false);
  isCreatingVendor = signal(false);
  pendingVendorName = signal('');

  isEditMode = computed(() => this.asset_repair_id() !== null);

  name = 'ประวัติการซ่อมบำรุงรักษาทรัพย์สิน';
  title = computed(() => (this.isEditMode() ? `แก้ไข${this.name}` : `เพิ่ม${this.name}`));

  isLoading = signal(false);
  isSubmitting = signal(false);

  statusOptions = [
    { label: 'ส่งซ่อม', value: 'ส่งซ่อม' },
    { label: 'ซ่อมเสร็จ', value: 'ซ่อมเสร็จ' },
    { label: 'ยกเลิก', value: 'ยกเลิก' },
  ];

  form = this.fb.group({
    repair_document_no: [''],
    repair_date: [new Date(), [Validators.required]],
    problem_description: [''],
    repair_description: [''],
    repair_shop_name: [''],
    vendor_id: [null as number | null],
    repair_cost: [0],
    decree_document_no: [''],
    status: ['ส่งซ่อม', Validators.required],
    procurement_withdrawal_id: [0, Validators.required],
    staff_id: [null as number | null],
  });

  ngOnInit(): void {
    this.loadDropdowns();
    this.loadVendors();
    const idParam = this.route.snapshot.paramMap.get('id');
    const repairId = idParam ? Number(idParam) : null;

    const assetIdParam = this.route.snapshot.queryParamMap.get('asset_id');
    const assetId = assetIdParam ? Number(assetIdParam) : null;

    // โหมดแก้ไข
    if (repairId && Number.isFinite(repairId)) {
      this.asset_repair_id.set(repairId);
      this.loadAssetRepair(repairId);
      return;
    }

    // โหมดเพิ่ม
    if (assetId && Number.isFinite(assetId)) {
      this.procurement_withdrawal_id.set(assetId);
      this.form.patchValue({
        procurement_withdrawal_id: assetId,
      });
      this.loadOwnerAsDefaultStaff(assetId);
      return;
    }

    this.snackbar.error('ไม่พบรหัสครุภัณฑ์');
    this.cancel();
  }

  /** ตั้งผู้รับผิดชอบเริ่มต้นเป็นเจ้าของครุภัณฑ์ (ผู้เบิก) ผู้ใช้เลือกเปลี่ยนเป็นคนอื่นได้ */
  private loadOwnerAsDefaultStaff(withdrawalId: number) {
    this.assetWithdrawalService.getAssetWithdrawalbyProcuremen(withdrawalId).subscribe({
      next: (withdrawal) => {
        if (!withdrawal.staff_id) return;
        this.owner.set({ staff_id: withdrawal.staff_id, full_name: withdrawal.staff_name });
        // ไม่ทับค่าที่ผู้ใช้เลือกไปแล้วระหว่างรอข้อมูล
        if (this.form.controls.staff_id.value === null) {
          this.form.controls.staff_id.setValue(withdrawal.staff_id);
        }
      },
      error: () => {},
    });
  }

  private loadAssetRepair(id: number) {
    const stateAssetRepair = history.state?.assetRepair as assetRepairsTypes | undefined;

    if (stateAssetRepair?.asset_repair_id === id) {
      this.patchForm(stateAssetRepair);
      return;
    }

    this.isLoading.set(true);

    this.assetRepairsService
      .getAssetRepair(id)
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: (response) => this.patchForm(response),
        error: () => {
          this.snackbar.error('ไม่สามารถโหลดข้อมูลได้');
          this.cancel();
        },
      });
  }

  private loadDropdowns() {
    forkJoin({
      staff: this.staffsService.getStaffs({
        sort: '',
        search: '',
        pageSize: 100,
        pageNumber: 1,
      }),
    }).subscribe({
      next: (res) => {
        this.staffs.set(res.staff.data);
      },
      error: () => {
        this.snackbar.error('โหลดข้อมูลตัวเลือกไม่สำเร็จ');
      },
    });
  }

  private loadVendors(page = 1, accumulated: { vendor_id: number; vendor_name: string }[] = []) {
    this.vendorsService.getVendors({ sort: '', search: '', pageSize: 50, pageNumber: page })
      .subscribe({
        next: (response) => {
          const all = [...accumulated, ...response.data];
          this.setVendorOptions(all);
          if (all.length < response.count && response.data.length > 0) {
            this.loadVendors(page + 1, all);
          }
        },
        error: () => this.snackbar.error('โหลดรายชื่อบริษัท/ร้านไม่สำเร็จ'),
      });
  }

  private setVendorOptions(vendors: { vendor_id: number; vendor_name: string }[]) {
    const currentName = this.form.controls.repair_shop_name.value?.trim();
    const selectedId = this.form.controls.vendor_id.value;
    this.vendors.set(currentName && !vendors.some((vendor) => vendor.vendor_id === (selectedId ?? 0))
      ? [{ vendor_id: selectedId ?? 0, vendor_name: currentName }, ...vendors]
      : vendors);
  }

  openVendorQuickCreate(name: string) {
    this.pendingVendorName.set(name.trim());
    this.isVendorModalOpen.set(true);
  }

  closeVendorQuickCreate() {
    if (this.isCreatingVendor()) return;
    this.isVendorModalOpen.set(false);
    this.pendingVendorName.set('');
  }

  createVendorQuick(name: string) {
    const vendorName = name.trim();
    if (!vendorName) return;
    this.isCreatingVendor.set(true);
    this.vendorsService.createVendorReturning({ vendor_name: vendorName })
      .pipe(finalize(() => this.isCreatingVendor.set(false)))
      .subscribe({
        next: (created) => {
          this.vendors.set([created, ...this.vendors()]);
          this.form.controls.vendor_id.setValue(created.vendor_id);
          this.form.controls.repair_shop_name.setValue(vendorName);
          this.isVendorModalOpen.set(false);
          this.pendingVendorName.set('');
          this.snackbar.success('เพิ่มบริษัท/ร้านสำเร็จ');
        },
        error: () => this.snackbar.error('เพิ่มบริษัท/ร้านไม่สำเร็จ'),
      });
  }

  private patchForm(item: assetRepairsTypes) {
    this.procurement_withdrawal_id.set(item.procurement_withdrawal_id);

    this.form.patchValue({
      repair_document_no: item.repair_document_no ?? '',
      repair_date: new Date(item.repair_date),
      problem_description: item.problem_description ?? '',
      repair_description: item.repair_description ?? '',
      repair_shop_name: item.repair_shop_name ?? '',
      vendor_id: item.vendor_id ?? (item.repair_shop_name ? 0 : null),
      repair_cost: item.repair_cost ?? 0,
      decree_document_no: item.decree_document_no ?? '',
      status: item.status ?? 'ส่งซ่อม',
      procurement_withdrawal_id: item.procurement_withdrawal_id ?? 0,
      staff_id: item.staff_id ?? null,
    });
    this.setVendorOptions(this.vendors());
  }

  submit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    const selectedVendor = this.vendors().find((vendor) => vendor.vendor_id === value.vendor_id);
    const repairShopName = value.vendor_id === 0
      ? value.repair_shop_name?.trim() || null
      : selectedVendor?.vendor_name ?? null;

    const payload: assetRepairsTypes = {
      asset_repair_id: this.asset_repair_id() ?? 0,
      procurement_withdrawal_id: value.procurement_withdrawal_id ?? 0,
      repair_document_no: value.repair_document_no?.trim() ?? '',
      repair_date: value.repair_date ? value.repair_date.toISOString() : new Date().toISOString(),
      problem_description: value.problem_description?.trim() ?? '',
      repair_description: value.repair_description?.trim() || null,
      repair_shop_name: repairShopName,
      vendor_id: value.vendor_id && value.vendor_id > 0 ? value.vendor_id : null,
      repair_cost: value.repair_cost ?? 0,
      decree_document_no: value.decree_document_no?.trim() || null,
      status: value.status ?? 'ส่งซ่อม',
      staff_id: value.staff_id ?? null,
    };

    console.log('payload:', payload);
    this.isSubmitting.set(true);

    const request$ = this.isEditMode()
      ? this.assetRepairsService.updateAssetRepairs(this.asset_repair_id()!, payload)
      : this.assetRepairsService.createAssetRepairs(payload);

    request$.pipe(finalize(() => this.isSubmitting.set(false))).subscribe({
      next: () => {
        this.snackbar.success(this.isEditMode() ? 'แก้ไขข้อมูลสำเร็จ' : 'เพิ่มข้อมูลสำเร็จ');
        this.cancel();
      },
      error: (error) => {
        console.log('error:', error.error);
        this.snackbar.error(this.isEditMode() ? 'แก้ไขข้อมูลไม่สำเร็จ' : 'เพิ่มข้อมูลไม่สำเร็จ');
      },
    });
  }

  cancel() {
    const assetId = this.procurement_withdrawal_id() || this.form.controls.procurement_withdrawal_id.value;

    if (!assetId) {
      this.snackbar.error('ไม่พบรหัสการเบิกครุภัณฑ์');
      return;
    }

    this.router.navigate(['/admin/assetRepairs', assetId], {
      state: {
        assetItem: history.state?.assetItem,
        procurementrecord: history.state?.procurementrecord,
        procurement_record_id: history.state?.procurement_record_id,
      },
    });
  }
}
