import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize, forkJoin, map, switchMap } from 'rxjs';

import { SnackbarService } from '../../../core/services/snackbar.service';
import { StaffsService } from '../../staffs/service/staffsType.service';
import { SelectComponent, TextareaComponent } from '../../../../shared';
import { MaterialWithdrawalService } from '../service/materialWithdrawal.service';
import {
  MaterialWithdrawalCreateTypes,
  MaterialWithdrawalDisplayItemTypes,
  MaterialWithdrawalItemTypes,
} from '../interface/materialWithdrawalTypes';
import { ProcurementrecordService } from '../../procurementrecord/service/procurementrecord.service';
import { procurementrecordTypes } from '../../procurementrecord/interface/procurementrecordTypes';
import { ProjectsService } from '../../projects/service/projects.service';
import { FiscalyearsService } from '../../fiscalyears/service/fiscalyears.service';

@Component({
  selector: 'app-material-withdrawal-addupdate',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, SelectComponent, TextareaComponent],
  templateUrl: './addupdate.component.html',
})
export class MaterialWithdrawalAddUpdateComponent implements OnInit {
  private fb = inject(FormBuilder);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private materialWithdrawalService = inject(MaterialWithdrawalService);
  private snackbar = inject(SnackbarService);
  private staffsService = inject(StaffsService);
  private procurementrecordService = inject(ProcurementrecordService);
  private projectsService = inject(ProjectsService);
  private fiscalyearsService = inject(FiscalyearsService);

  material_withdrawal_id = signal<number | null>(null);
  isViewMode = computed(() => this.material_withdrawal_id() !== null);
  isEditMode = this.isViewMode;

  name = 'ใบเบิกวัสดุ';
  title = computed(() => (this.isViewMode() ? `รายละเอียด${this.name}` : `สร้าง${this.name}`));

  isLoading = signal(false);
  isSubmitting = signal(false);

  procurementrecord = history.state?.procurementrecord;
  procurementDetail = signal<procurementrecordTypes | null>(null);
  projectCode = signal('');
  fiscalYearName = signal('');
  projectYearLoadFailed = signal(false);
  staffs = signal<any[]>([]);
  availableItems = signal<MaterialWithdrawalItemTypes[]>([]);
  issuedItems = signal<MaterialWithdrawalDisplayItemTypes[]>([]);
  stockStatus = signal('posted');
  procurementDocumentNo = signal('');
  procurementApprovalNo = signal('');

  quantities: Record<number, number> = {};
  quantitiesMap = signal<Record<number, number>>({});

  searchTerm = signal('');
  activeFilter = signal<'all' | 'selected' | 'in_stock'>('all');

  selectedDepartment() {
    const staff = this.staffs().find((x) => x.staff_id === Number(this.form.controls.staff_id.value));
    return staff?.department_name ?? '';
  }

  selectedStaffName() {
    const staff = this.staffs().find((x) => x.staff_id === Number(this.form.controls.staff_id.value));
    return staff?.full_name ?? '';
  }

  goToExport() {
    const id = this.material_withdrawal_id();
    if (id) this.router.navigate(['/admin/MaterialWithdrawal/export', id]);
  }

  form = this.fb.group({
    material_withdrawal_id: [0],
    procurement_record_id: [null as number | null, Validators.required],
    staff_id: [this.procurementrecord?.staff_id ?? null, Validators.required],
    remark: [''],
  });

  // Computed metrics for intuitive withdrawal handling
  selectedItemsCount = computed(() => {
    const qMap = this.quantitiesMap();
    return this.availableItems().filter((item) => (qMap[item.receive_detail_id] ?? 0) > 0).length;
  });

  inStockCount = computed(() => {
    return this.availableItems().filter((item) => Number(item.available_quantity ?? 0) > 0).length;
  });

  totalWithdrawalQuantity = computed(() => {
    const qMap = this.quantitiesMap();
    return this.availableItems().reduce((acc, item) => acc + (qMap[item.receive_detail_id] ?? 0), 0);
  });

  totalWithdrawalAmount = computed(() => {
    const qMap = this.quantitiesMap();
    return this.availableItems().reduce((acc, item) => {
      const qty = qMap[item.receive_detail_id] ?? 0;
      return acc + qty * Number(item.unit_price ?? 0);
    }, 0);
  });

  hasOverLimitItems = computed(() => {
    const qMap = this.quantitiesMap();
    return this.availableItems().some(
      (item) => (qMap[item.receive_detail_id] ?? 0) > Number(item.available_quantity ?? 0)
    );
  });

  filteredAvailableItems = computed(() => {
    const term = this.searchTerm().trim().toLowerCase();
    const filter = this.activeFilter();
    const qMap = this.quantitiesMap();

    return this.availableItems().filter((item) => {
      const name = (item.material_name ?? '').toLowerCase();
      const matchesSearch = !term || name.includes(term) || String(item.material_item_id).includes(term);
      if (!matchesSearch) return false;

      const qty = qMap[item.receive_detail_id] ?? 0;
      const available = Number(item.available_quantity ?? 0);

      if (filter === 'selected') {
        return qty > 0;
      }
      if (filter === 'in_stock') {
        return available > 0;
      }
      return true;
    });
  });

  totalIssuedQuantity = computed(() => {
    return this.issuedItems().reduce((acc, item) => acc + Number(item.quantity ?? 0), 0);
  });

  totalIssuedAmount = computed(() => {
    return this.issuedItems().reduce(
      (acc, item) => acc + Number(item.quantity ?? 0) * Number(item.unit_price ?? 0),
      0
    );
  });

  ngOnInit(): void {
    this.loadDropdowns();

    const idParam = this.route.snapshot.paramMap.get('id');
    const id = idParam ? Number(idParam) : null;

    if (id && Number.isFinite(id)) {
      this.material_withdrawal_id.set(id);
      this.loadMaterialWithdrawal(id);
    }

    const procurementRecordIdParam = this.route.snapshot.queryParamMap.get('procurement_record_id');
    const procurementRecordId = procurementRecordIdParam ? Number(procurementRecordIdParam) : null;

    if (procurementRecordId && Number.isFinite(procurementRecordId)) {
      this.form.patchValue({
        procurement_record_id: procurementRecordId,
      });
      if (!this.isEditMode()) this.loadCreateDetails(procurementRecordId);
    }
  }

  private loadCreateDetails(procurementRecordId: number) {
    this.isLoading.set(true);
    forkJoin({
      procurement: this.procurementrecordService.getProcurementrecord(procurementRecordId),
      available: this.materialWithdrawalService.getAvailableItems(procurementRecordId),
    })
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: ({ procurement, available }) => {
          this.procurementDetail.set(procurement);
          this.loadProjectAndFiscalYear(procurement);
          this.procurementDocumentNo.set(procurement.document_no ?? '');
          this.procurementApprovalNo.set(procurement.decree_document_no ?? '');
          this.availableItems.set(available);

          const initialMap: Record<number, number> = {};
          available.forEach((item) => {
            initialMap[item.receive_detail_id] = 0;
            this.quantities[item.receive_detail_id] = 0;
          });
          this.quantitiesMap.set(initialMap);

          if (!this.form.controls.staff_id.value && procurement.staff_id) {
            this.form.patchValue({ staff_id: procurement.staff_id });
          }
        },
        error: () => this.snackbar.error('โหลดเอกสารจัดซื้อและจำนวนวัสดุคงเหลือไม่สำเร็จ'),
      });
  }

  getQuantity(receiveDetailId: number): number {
    return this.quantitiesMap()[receiveDetailId] ?? this.quantities[receiveDetailId] ?? 0;
  }

  setQuantity(receiveDetailId: number, value: number | string | Event) {
    let num = 0;
    if (typeof value === 'object' && value !== null && 'target' in value) {
      const targetVal = (value.target as HTMLInputElement).value;
      num = targetVal === '' ? 0 : Number(targetVal);
    } else {
      num = Number(value);
    }
    if (isNaN(num) || num < 0) num = 0;

    this.quantities[receiveDetailId] = num;
    this.quantitiesMap.update((map) => ({ ...map, [receiveDetailId]: num }));
  }

  incrementQuantity(item: MaterialWithdrawalItemTypes) {
    const current = this.getQuantity(item.receive_detail_id);
    const max = Number(item.available_quantity ?? 0);
    if (current < max) {
      this.setQuantity(item.receive_detail_id, current + 1);
    }
  }

  decrementQuantity(item: MaterialWithdrawalItemTypes) {
    const current = this.getQuantity(item.receive_detail_id);
    if (current > 0) {
      this.setQuantity(item.receive_detail_id, current - 1);
    }
  }

  setMaxQuantity(item: MaterialWithdrawalItemTypes) {
    const max = Number(item.available_quantity ?? 0);
    this.setQuantity(item.receive_detail_id, max);
  }

  clearQuantity(item: MaterialWithdrawalItemTypes) {
    this.setQuantity(item.receive_detail_id, 0);
  }

  fillAllMax() {
    const newMap: Record<number, number> = {};
    for (const item of this.availableItems()) {
      const max = Number(item.available_quantity ?? 0);
      newMap[item.receive_detail_id] = max;
      this.quantities[item.receive_detail_id] = max;
    }
    this.quantitiesMap.set(newMap);
  }

  clearAllQuantities() {
    const newMap: Record<number, number> = {};
    for (const item of this.availableItems()) {
      newMap[item.receive_detail_id] = 0;
      this.quantities[item.receive_detail_id] = 0;
    }
    this.quantitiesMap.set(newMap);
  }

  private loadMaterialWithdrawal(id: number) {
    this.isLoading.set(true);
    this.materialWithdrawalService
      .getMaterialWithdrawal(id)
      .pipe(
        switchMap((item) =>
          forkJoin({
            procurement: this.procurementrecordService.getProcurementrecord(item.procurement_record_id),
            available: this.materialWithdrawalService.getAvailableItems(item.procurement_record_id),
            issued: this.materialWithdrawalService.getWithdrawalItems(id),
          }).pipe(map((details) => ({ item, ...details })))
        )
      )
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: ({ item, procurement, available, issued }) => {
          this.stockStatus.set(item.stock_status ?? 'posted');
          this.procurementDetail.set(procurement);
          this.loadProjectAndFiscalYear(procurement);
          this.patchForm(item);
          this.procurementDocumentNo.set(procurement.document_no ?? '');
          this.procurementApprovalNo.set(procurement.decree_document_no ?? '');
          this.issuedItems.set(issued);
          this.quantities = Object.fromEntries(issued.map((row) => [row.receive_detail_id, Number(row.quantity)]));
          this.quantitiesMap.set({ ...this.quantities });
          this.availableItems.set(
            available.map((row) => ({
              ...row,
              available_quantity:
                Number(row.available_quantity ?? 0) + Number(this.quantities[row.receive_detail_id] ?? 0),
            }))
          );
        },
        error: () => {
          this.snackbar.error('ไม่สามารถโหลดข้อมูลได้');
          this.router.navigate(['/admin/MaterialWithdrawal']);
        },
      });
  }

  private loadProjectAndFiscalYear(procurement: procurementrecordTypes) {
    this.projectYearLoadFailed.set(false);
    this.projectCode.set(procurement.project_code || this.procurementrecord?.project_code || '');
    this.fiscalYearName.set(procurement.fiscal_year_name || this.procurementrecord?.fiscal_year_name || '');

    // The detail endpoint returns the entity without its related display names.
    // The list endpoint maps those names, so use the matching record as the
    // primary source and keep direct lookups below as a fallback.
    if (!this.projectCode() || !this.fiscalYearName()) {
      this.procurementrecordService.getProcurementrecords(
        { sort: '', search: procurement.document_no, pageSize: 100, pageNumber: 1 },
      ).subscribe({
        next: (response) => {
          const record = response.data.find(
            (item) => item.procurement_record_id === procurement.procurement_record_id,
          );
          if (record?.project_code) this.projectCode.set(record.project_code);
          if (record?.fiscal_year_name) this.fiscalYearName.set(record.fiscal_year_name);
          this.projectYearLoadFailed.set(!this.projectCode() || !this.fiscalYearName());
        },
        error: () => this.projectYearLoadFailed.set(!this.projectCode() || !this.fiscalYearName()),
      });
    }

    if (!this.projectCode() && procurement.project_id) {
      this.projectsService.getProject(procurement.project_id).subscribe({
        next: (project) => {
          if (project.project_code) this.projectCode.set(project.project_code);
          if (!this.fiscalYearName() && project.fiscal_year_name) {
            this.fiscalYearName.set(project.fiscal_year_name);
          }
          if (!this.fiscalYearName() && !procurement.fiscal_year_id && project.fiscal_year_id) {
            this.loadFiscalYear(project.fiscal_year_id);
          }
        },
        error: () => this.projectYearLoadFailed.set(!this.projectCode() || !this.fiscalYearName()),
      });
    }

    if (!this.fiscalYearName() && procurement.fiscal_year_id) {
      this.loadFiscalYear(procurement.fiscal_year_id);
    }
  }

  private loadFiscalYear(id: number) {
    this.fiscalyearsService.getFiscalyear(id).subscribe({
      next: (year) => {
        if (!this.fiscalYearName()) this.fiscalYearName.set(String(year.fiscal_year ?? year.year_name ?? ''));
        this.projectYearLoadFailed.set(!this.projectCode() || !this.fiscalYearName());
      },
      error: () => this.projectYearLoadFailed.set(!this.projectCode() || !this.fiscalYearName()),
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

  private patchForm(item: MaterialWithdrawalCreateTypes) {
    this.form.patchValue({
      material_withdrawal_id: item.material_withdrawal_id ?? 0,
      procurement_record_id: item.procurement_record_id ?? null,
      staff_id: item.staff_id ?? null,
      remark: item.remark ?? '',
    });
  }

  submit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    let items: Array<{ receive_detail_id: number; material_item_id: number; quantity: number }> = [];

    if (this.isEditMode()) {
      items = this.issuedItems().map((item) => ({
        receive_detail_id: item.receive_detail_id,
        material_item_id: item.material_item_id,
        quantity: Number(item.quantity),
      }));
    } else {
      if (
        this.availableItems().some((item) => {
          const quantity = this.getQuantity(item.receive_detail_id);
          return (
            !Number.isFinite(quantity) ||
            quantity < 0 ||
            !Number.isInteger(quantity) ||
            quantity > Number(item.available_quantity ?? 0)
          );
        })
      ) {
        this.snackbar.error('จำนวนที่เบิกต้องเป็นจำนวนเต็มตั้งแต่ 0 ถึงยอดคงเหลือ');
        return;
      }

      items = this.availableItems()
        .filter((item) => this.getQuantity(item.receive_detail_id) > 0)
        .map((item) => ({
          receive_detail_id: item.receive_detail_id,
          material_item_id: item.material_item_id,
          quantity: this.getQuantity(item.receive_detail_id),
        }));

      if (!items.length) {
        this.snackbar.error('กรุณาระบุจำนวนวัสดุที่ต้องการเบิกอย่างน้อย 1 รายการ');
        return;
      }
    }

    const payload: Partial<MaterialWithdrawalCreateTypes> = {
      material_withdrawal_id: this.material_withdrawal_id() ?? 0,
      procurement_record_id: this.form.controls.procurement_record_id.value!,
      staff_id: this.form.controls.staff_id.value!,
      remark: this.form.controls.remark.value,
      items,
    };

    this.isSubmitting.set(true);

    const request$ = this.isEditMode()
      ? this.materialWithdrawalService.updateMaterialWithdrawal(this.material_withdrawal_id()!, payload)
      : this.materialWithdrawalService.createMaterialWithdrawal(payload);

    request$.pipe(finalize(() => this.isSubmitting.set(false))).subscribe({
      next: () => {
        this.snackbar.success(this.isEditMode() ? 'แก้ไขข้อมูลสำเร็จ' : 'เพิ่มข้อมูลสำเร็จ');

        const procurementRecordId = this.form.controls.procurement_record_id.value;

        this.router.navigate(['/admin/MaterialWithdrawal', procurementRecordId], {
          state: {
            procurementrecord: history.state?.procurementrecord,
          },
        });
      },
      error: (err) => {
        this.snackbar.error(
          err.error?.message ?? (typeof err.error === 'string' ? err.error : 'บันทึกใบเบิกไม่สำเร็จ')
        );
      },
    });
  }

  cancel() {
    const procurementRecordId =
      this.form.controls.procurement_record_id.value ??
      this.procurementDetail()?.procurement_record_id ??
      history.state?.procurementrecord?.procurement_record_id;

    if (procurementRecordId) {
      this.router.navigate(['/admin/MaterialWithdrawal', procurementRecordId], {
        state: {
          procurementrecord: history.state?.procurementrecord,
        },
      });
    } else {
      this.router.navigate(['/admin/project/procurementrecord']);
    }
  }

  openAdjustment() {
    const id = this.material_withdrawal_id();
    if (id) this.router.navigate(['/admin/MaterialWithdrawal/adjust', id]);
  }
}
