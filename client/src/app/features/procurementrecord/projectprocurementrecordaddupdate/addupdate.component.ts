import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, concatMap, finalize, forkJoin, from, of, switchMap, toArray } from 'rxjs';

import { InputComponent } from '../../../../shared/input/input.component';
import { SelectComponent } from '../../../../shared';
import { DatePickerComponent } from '../../../shared/date-picker/date-picker.component';

import { SnackbarService } from '../../../core/services/snackbar.service';
import { toThaiBahtText } from '../../../shared/thai-baht-text';

import {
  procurementrecordCreateTypes,
  updateProcurementRecordStatusTypes,
  procurementWithAssetsCreateTypes,
} from '../interface/procurementrecordTypes';

import { ProcurementrecordService } from '../service/procurementrecord.service';

import { FiscalyearsService } from '../../fiscalyears/service/fiscalyears.service';
import { StaffsService } from '../../staffs/service/staffsType.service';
import { OperationsTypeService } from '../../operationTypes/service/operationTypes.service';
import { ExpensetypesService } from '../../expenseTypes/service/expenseTypes.service';
import { DepartmentService } from '../../departments/service/department.service';
import { VendorsService } from '../../vendors/service/vendors.service';
import { vendorsTypes } from '../../vendors/interface/vendorsTypes';
import { FundcategorysService } from '../../fundcategorys/service/fundcategorys.service';
import { BudgetsourceService } from '../../budgetsource/service/budgetSource.service';
import { ProjectsService } from '../../projects/service/projects.service';
import { MaterialReceiveDetailService } from '../../materialReceiveDetail/service/materialReceiveDetail.service';
import { HireDetailsService } from '../../hireDetails/service/hireDetail.service';
import { AssetItemsService } from '../../assetItems/service/assetItems.service';
import { AssetSubItemsService } from '../../assetsubItems/service/assetsubItem.service';

import { AssetCategoriesService } from '../../assetCategories/service/assetCategories.service';
import { MaterialUnitsService } from '../../materialUnits/service/materialUnits.service';
import { AcquisitionMethodService } from '../../acquisitionMethod/service/acquisitionMethod.service';
import { MaterialItemsService } from '../../MaterialItems/service/materialItems.service';

import {
  AssetSectionPayload,
  ProcurementAssetSectionComponent,
} from '../components/procurement-asset-section/procurement-asset-section/procurement-asset-section.component';

import {
  HireSectionPayload,
  ProcurementHireSectionComponent,
} from '../components/procurement-asset-section/procurement-hire-section/procurement-hire-section.component';

import {
  MaterialSectionPayload,
  ProcurementMaterialSectionComponent,
} from '../components/procurement-asset-section/procurement-material-section/procurement-material-section.component';
import {
  ProcurementSaveConfirmationModalComponent,
  ProcurementSaveSummarySection,
} from '../components/procurement-save-confirmation-modal/procurement-save-confirmation-modal.component';
import { ProcurementVendorQuickCreateModalComponent } from '../components/procurement-vendor-quick-create-modal/procurement-vendor-quick-create-modal.component';

@Component({
  selector: 'app-addupdate',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    InputComponent,
    SelectComponent,
    DatePickerComponent,
    ProcurementAssetSectionComponent,
    ProcurementHireSectionComponent,
    ProcurementMaterialSectionComponent,
    ProcurementSaveConfirmationModalComponent,
    ProcurementVendorQuickCreateModalComponent,
  ],
  templateUrl: './addupdate.component.html',
})
export class ProcurementsAddUpdateComponent implements OnInit {
  // =========================
  // Inject Services
  // =========================
  private fb = inject(FormBuilder);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private snackbar = inject(SnackbarService);

  private procurementrecordService = inject(ProcurementrecordService);

  private fiscalyearsService = inject(FiscalyearsService);
  private staffsService = inject(StaffsService);
  private operationsTypeService = inject(OperationsTypeService);
  private expensetypesService = inject(ExpensetypesService);
  private departmentService = inject(DepartmentService);
  private vendorsService = inject(VendorsService);
  private fundcategorysService = inject(FundcategorysService);
  private budgetsourceService = inject(BudgetsourceService);
  private projectsService = inject(ProjectsService);
  private materialReceiveDetailService = inject(MaterialReceiveDetailService);
  private hireDetailsService = inject(HireDetailsService);
  private assetItemsService = inject(AssetItemsService);
  private assetSubItemsService = inject(AssetSubItemsService);

  private assetCategoriesService = inject(AssetCategoriesService);
  private materialUnitsService = inject(MaterialUnitsService);
  private acquisitionMethodsService = inject(AcquisitionMethodService);
  private materialItemsService = inject(MaterialItemsService);

  // =========================
  // State
  // =========================
  procurement_record_id = signal<number | null>(null);
  originalProcurementRecord = signal<procurementrecordCreateTypes | null>(null);
  projectstate = history.state?.projects?.projects ?? history.state?.projects ?? null;

  isLoading = signal(false);
  isSubmitting = signal(false);

  selectedFile: File | null = null;
  isConfirmModalOpen = signal(false);
  isVendorModalOpen = signal(false);
  isCreatingVendor = signal(false);
  pendingVendorName = signal('');

  name = 'เอกสารการจัดซื้อจัดจ้าง';

  // =========================
  // Dropdown Signals
  // =========================
  fiscal_years = signal<any[]>([]);
  staffs = signal<any[]>([]);
  operation_types = signal<any[]>([]);
  expense_types = signal<any[]>([]);
  departments = signal<any[]>([]);
  vendors = signal<any[]>([]);
  fund_categorys = signal<any[]>([]);
  budget_sources = signal<any[]>([]);
  projects = signal<any[]>([]);

  asset_category = signal<any[]>([]);
  unit = signal<any[]>([]);
  aquisition_methods = signal<any[]>([]);
  material_items = signal<any[]>([]);

  // =========================
  // Child Section Payloads
  // =========================
  assetPayload = signal<AssetSectionPayload | null>(null);
  isAssetSectionValid = signal(false);

  hirePayload = signal<HireSectionPayload | null>(null);
  isHireSectionValid = signal(false);

  materialPayload = signal<MaterialSectionPayload | null>(null);
  isMaterialSectionValid = signal(false);
  isEditDetailsLoading = signal(false);
  isEditDetailsLoadFailed = signal(false);
  initialAssetData = signal<AssetSectionPayload['asset_items']>([]);
  initialHireDetails = signal<HireSectionPayload['hire_details']>([]);
  initialMaterialDetails = signal<MaterialSectionPayload['material_receive_details']>([]);

  // =========================
  // Expense Type State
  // =========================
  selectedExpenseTypeId = signal<number | null>(null);

  // =========================
  // Form
  // =========================
  form = this.fb.group({
    procurement_record_id: [0],
    document_no: ['', Validators.required],
    document_date: [new Date().toISOString().split('T')[0]],
    // ว่างได้ ถ้ายังไม่ตรวจรับ
    inspection_date: [null as string | Date | null],
    total_amount: [0, Validators.required],
    amount_text: [''],
    approval_date: [null as string | null],
    reference_no: [''],
    decree_document_no: [''],
    withdrawal_document_no: [''],
    status: ['ร่าง'],
    remark: [''],

    project_id: [null as number | null],
    fiscal_year_id: [null as number | null],
    operation_type_id: [null as number | null],
    expense_type_id: [null as number | null],
    department_id: [null as number | null],
    vendor_id: [null as number | null],
    fund_category_id: [null as number | null],
    budget_source_id: [null as number | null],
    staff_id: [null as number | null],

    attachment_file_path: [''],
  });

  // =========================
  // Computed
  // =========================
  isEditMode = computed(() => this.procurement_record_id() !== null);

  title = computed(() => (this.isEditMode() ? `แก้ไข${this.name}` : `เพิ่ม${this.name}`));

  selectedExpenseTypeName = computed(() => {
    const id = this.selectedExpenseTypeId();

    return (
      this.expense_types().find((x) => Number(x.expense_type_id) === Number(id))
        ?.expense_type_name ?? ''
    );
  });

  isAssetType = computed(() => {
    const type = this.selectedExpenseTypeName();

    return type === 'ครุภัณฑ์' || type.includes('ครุ') || type.includes('คุรุ');
  });

  isHireType = computed(() => this.selectedExpenseTypeName() === 'จัดจ้าง');

  isMaterialType = computed(() => {
    const type = this.selectedExpenseTypeName();

    return type === 'วัสดุ' || type === 'พัสดุ';
  });

  confirmationSections = computed<ProcurementSaveSummarySection[]>(() => {
    if (this.isEditMode()) return [];
    if (this.isAssetType()) {
      return this.buildAssetSummarySections();
    }

    if (this.isHireType()) {
      return this.buildHireSummarySections();
    }

    if (this.isMaterialType()) {
      return this.buildMaterialSummarySections();
    }

    return [
      {
        title: 'ข้อมูลการบันทึก',
        items: [
          {
            title: this.form.controls.remark.value || 'ไม่มีรายละเอียดรายการเพิ่มเติม',
            totalPrice: Number(this.form.controls.total_amount.value || 0),
          },
        ],
      },
    ];
  });

  confirmationModeLabel = computed(() =>
    this.isEditMode() ? 'ยืนยันบันทึกการแก้ไข' : 'ยืนยันบันทึกข้อมูล',
  );

  selectedVendorName = () =>
    this.vendors().find((x) => Number(x.vendor_id) === Number(this.form.controls.vendor_id.value))
      ?.vendor_name ?? '';

  // อ่านจาก form โดยตรง (ไม่ใช่ signal) จึงต้องเป็นฟังก์ชัน ไม่ใช่ computed ไม่เช่นนั้นค่าจะค้างที่ 0
  confirmationTotalAmount = () => Number(this.form.controls.total_amount.value || 0);

  // =========================
  // Lifecycle
  // =========================
  ngOnInit(): void {
    this.patchProjectState();
    this.loadDropdowns();
    this.watchTotalAmount();
    this.watchExpenseType();
    this.watchApprovalDateRequirement();
    this.checkEditMode();
  }

  private watchApprovalDateRequirement() {
    const setApprovalDate = (status: string | null) => {
      if (status === 'อนุมัติแล้ว') {
        const today = new Date();
        today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
        this.form.controls.approval_date.setValue(today.toISOString().slice(0, 10), {
          emitEvent: false,
        });
      }
    };

    this.form.controls.status.valueChanges.subscribe(setApprovalDate);
  }

  // =========================
  // Initial Setup
  // =========================
  private patchProjectState() {
    // Navigation state is only a default for a new record. In edit mode the
    // record loaded from the URL must remain the source of these values.
    if (this.route.snapshot.paramMap.has('id')) {
      return;
    }

    const projectId = Number(this.route.snapshot.queryParamMap.get('project_id')) ||
      this.projectstate?.project_id || null;
    const fiscalYearId = Number(this.route.snapshot.queryParamMap.get('fiscal_year_id')) ||
      this.projectstate?.fiscal_year_id || null;
    this.form.patchValue({ project_id: projectId, fiscal_year_id: fiscalYearId });
    if (projectId && !fiscalYearId) {
      this.projectsService.getProject(projectId).subscribe({
        next: (project) => {
          this.projectstate = project;
          this.form.controls.fiscal_year_id.setValue(project.fiscal_year_id);
          this.ensureSelectedProjectAndFiscalYear();
        },
        error: () => this.snackbar.error('ไม่สามารถโหลดปีงบประมาณของโครงการได้'),
      });
    }
  }

  private watchTotalAmount() {
    this.form.controls.total_amount.valueChanges.subscribe((amount) => {
      const value = Number(amount || 0);

      this.form.patchValue(
        {
          amount_text: toThaiBahtText(value),
        },
        { emitEvent: false },
      );
    });
  }

  private watchExpenseType() {
    this.selectedExpenseTypeId.set(this.form.controls.expense_type_id.value);

    this.form.controls.expense_type_id.valueChanges.subscribe((id) => {
      this.selectedExpenseTypeId.set(id ? Number(id) : null);
    });
  }

  private checkEditMode() {
    const idParam = this.route.snapshot.paramMap.get('id');
    const id = idParam ? Number(idParam) : null;

    if (id && Number.isFinite(id)) {
      this.procurement_record_id.set(id);
      this.loadProcurement(id);
    }
  }

  // =========================
  // Load Data
  // =========================
  private loadProcurement(id: number) {
    const stateProcurementrecord = history.state?.procurementrecord as
      | procurementrecordCreateTypes
      | undefined;

    if (stateProcurementrecord?.procurement_record_id === id) {
      this.patchForm(stateProcurementrecord);
      return;
    }

    this.isLoading.set(true);

    this.procurementrecordService
      .getProcurementrecord(id)
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: (response) => this.patchForm(response),
        error: () => {
          this.snackbar.error('ไม่สามารถโหลดข้อมูลได้');
          this.router.navigate(['/admin/procurements']);
        },
      });
  }

  private loadDropdowns() {
    forkJoin({
      fiscal_year: this.fiscalyearsService.getFiscalyears(this.dropdownParams()),
      staff: this.staffsService.getStaffs(this.dropdownParams()),
      operation_type: this.operationsTypeService.getOperationtypes(this.dropdownParams()),
      expense_type: this.expensetypesService.getExpenseTypes(this.dropdownParams()),
      department: this.departmentService.getDepartments(this.dropdownParams()),
      vendor: this.vendorsService.getVendors(this.dropdownParams()),
      fund_category: this.fundcategorysService.getFundcategorys(this.dropdownParams()),
      budget_source: this.budgetsourceService.getBudgetsources(this.dropdownParams()),
      project: this.projectsService.getProjects(this.dropdownParams()),

      assetCategories: this.assetCategoriesService.getAssetCategories(this.dropdownParams()),
      unit: this.materialUnitsService.getMaterialUnits(this.dropdownParams()),
      aquisition_methods: this.acquisitionMethodsService.getAcquisitionMethods(
        this.dropdownParams(),
      ),
      material_items: this.materialItemsService.getMaterialItems(this.dropdownParams()),
    }).subscribe({
      next: (res) => {
        this.fiscal_years.set(res.fiscal_year.data);
        this.staffs.set(res.staff.data);
        this.operation_types.set(res.operation_type.data);
        this.expense_types.set(res.expense_type.data);
        this.departments.set(res.department.data);
        this.vendors.set(res.vendor.data);
        this.fund_categorys.set(
          res.fund_category.data.map((category) => ({
            ...category,
            fund_display_label: `${category.fund_code} ${category.fund_name}`,
          })),
        );
        this.budget_sources.set(res.budget_source.data);
        this.projects.set(res.project.data);

        this.asset_category.set(res.assetCategories.data);
        this.unit.set(res.unit.data);
        this.aquisition_methods.set(res.aquisition_methods.data);
        this.material_items.set(
          res.material_items.data.map((x: any) => ({
            ...x,
            display_name: `${x.material_code} - ${x.material_name} ราคา ${x.unit_price ?? 0} บาท`,
          })),
        );

        this.patchProjectState();
        this.ensureSelectedProjectAndFiscalYear();
      },
      error: () => {
        this.snackbar.error('โหลดข้อมูลตัวเลือกไม่สำเร็จ');
      },
    });
  }

  private dropdownParams() {
    return {
      sort: '',
      search: '',
      pageSize: 100,
      pageNumber: 1,
    };
  }

  // =========================
  // Patch Form
  // =========================
  private patchForm(exp: procurementrecordCreateTypes) {
    this.originalProcurementRecord.set({
      ...exp,
    });

    this.form.patchValue(
      {
        procurement_record_id: exp.procurement_record_id,
        document_no: exp.document_no,
        document_date: exp.document_date,
        inspection_date: exp.inspection_date,
        total_amount: exp.total_amount,
        amount_text: exp.amount_text,
        approval_date: exp.approval_date,
        reference_no: exp.reference_no,
        decree_document_no: exp.decree_document_no ?? '',
        withdrawal_document_no: exp.withdrawal_document_no ?? '',
        status: exp.status,
        remark: exp.remark,

        project_id: exp.project_id,
        fiscal_year_id: exp.fiscal_year_id,
        operation_type_id: exp.operation_type_id,
        expense_type_id: exp.expense_type_id,
        department_id: exp.department_id,
        vendor_id: exp.vendor_id,
        fund_category_id: exp.fund_category_id,
        budget_source_id: exp.budget_source_id,
        staff_id: exp.staff_id,

        attachment_file_path: exp.attachment_file_path,
      },
      { emitEvent: false },
    );

    this.selectedExpenseTypeId.set(exp.expense_type_id);
    this.ensureSelectedProjectAndFiscalYear();

  }

  private ensureSelectedProjectAndFiscalYear() {
    const projectId = this.form.controls.project_id.value;
    if (projectId && this.projects().length && !this.projects().some(
      (project) => Number(project.project_id) === Number(projectId),
    )) {
      this.projectsService.getProject(projectId).subscribe({
        next: (project) => this.projects.update((projects) => [...projects, project]),
        error: () => this.snackbar.error('ไม่สามารถโหลดข้อมูลโครงการได้'),
      });
    }

    const fiscalYearId = this.form.controls.fiscal_year_id.value;
    if (fiscalYearId && this.fiscal_years().length && !this.fiscal_years().some(
      (year) => Number(year.fiscal_year_id) === Number(fiscalYearId),
    )) {
      this.fiscalyearsService.getFiscalyear(fiscalYearId).subscribe({
        next: (year) => this.fiscal_years.update((years) => [...years, year]),
        error: () => this.snackbar.error('ไม่สามารถโหลดข้อมูลปีงบประมาณได้'),
      });
    }
  }

  private loadExistingSections(procurementRecordId: number) {
    this.isEditDetailsLoadFailed.set(false);
    this.isEditDetailsLoading.set(true);
    const params = { sort: '', search: '', pageSize: 1000, pageNumber: 1 };

    forkJoin({
      materials: this.materialReceiveDetailService.getMaterialReceiveDetailbyProcuremens(
        params,
        procurementRecordId,
      ),
      hires: this.hireDetailsService.getHireDetailsbyProcuremen(procurementRecordId),
      assets: this.assetItemsService.getAssetItembyProcuremen(params, procurementRecordId),
    })
      .pipe(
        switchMap(({ materials, hires, assets }) => {
          const assetRequests = assets.data.map((asset) =>
            this.assetSubItemsService
              .getAssetSubItemsbyProcuremen(params, asset.asset_id)
              .pipe(switchMap((subItems) => of({ asset, subItems: subItems.data }))),
          );

          return (assetRequests.length ? forkJoin(assetRequests) : of([])).pipe(
            switchMap((assetRows) => of({ materials: materials.data, hires, assetRows })),
          );
        }),
        finalize(() => this.isEditDetailsLoading.set(false)),
      )
      .subscribe({
        next: ({ materials, hires, assetRows }) => {
          this.initialMaterialDetails.set(
            materials.map((detail) => ({
              receive_detail_id: detail.receive_detail_id,
              procurement_record_id: detail.procurement_record_id,
              item_no: detail.item_no ?? 0,
              material_item_id: detail.material_item_id,
              quantity: Number(detail.quantity),
              unit_price: Number(detail.unit_price),
              total_amount: Number(detail.total_amount),
              operation_reason: detail.operation_reason || null,
            })),
          );
          this.initialHireDetails.set(
            hires.map((detail) => ({
              hire_detail_id: detail.hire_detail_id,
              procurement_record_id: detail.procurement_record_id,
              item_no: detail.item_no,
              hire_name: detail.hire_name,
              quantity: Number(detail.quantity),
              unit_id: detail.unit_id,
              unit_price: Number(detail.unit_price),
              total_amount: Number(detail.total_amount),
              total_text: detail.total_text || '',
              operation_reason: detail.operation_reason || null,
              remark: detail.remark || null,
            })),
          );
          this.initialAssetData.set(
            assetRows.map(({ asset, subItems }) => ({
              asset_item: {
                asset_id: asset.asset_id,
                procurement_record_id: asset.procurement_record_id ?? procurementRecordId,
                item_no: asset.item_no,
                asset_code_prefix: asset.asset_code_prefix,
                asset_name: asset.asset_name,
                receive_date: asset.receive_date,
                fund_category_id: asset.fund_category_id,
                department_id: asset.department_id,
                acquisition_method_id: asset.acquisition_method_id,
              },
              asset_sub_items: subItems.map((item) => ({
                asset_sub_item_id: item.asset_sub_item_id,
                asset_id: item.asset_id,
                item_no: item.item_no ?? 0,
                sub_item_name: item.sub_item_name,
                asset_category_id: item.asset_category_id,
                quantity: Number(item.quantity),
                unit_id: item.unit_id,
                unit_price: Number(item.unit_price ?? 0),
                total_price: Number(item.total_price ?? 0),
                useful_life_year: Number(item.useful_life_year ?? 0),
                running_start_no: Number(item.running_start_no ?? 0),
                running_end_no: Number(item.running_end_no ?? 0),
                fiscal_asset_year: Number(item.fiscal_asset_year ?? 0),
                status: item.status,
              })),
            })),
          );
        },
        error: () => {
          this.isEditDetailsLoadFailed.set(true);
          this.snackbar.error('ไม่สามารถโหลดรายละเอียดรายการเดิมได้');
        },
      });
  }

  retryLoadExistingSections() {
    const recordId = this.procurement_record_id();
    if (recordId) this.loadExistingSections(recordId);
  }

  // =========================
  // File
  // =========================
  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;

    if (!input.files || input.files.length === 0) {
      this.selectedFile = null;
      return;
    }

    this.selectedFile = input.files[0];
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

  createVendorQuick(vendorName: string) {
    const normalizedName = vendorName.trim();

    if (!normalizedName) return;

    this.isCreatingVendor.set(true);

    this.vendorsService
      .createVendors({
        vendor_name: normalizedName,
      })
      .pipe(finalize(() => this.isCreatingVendor.set(false)))
      .subscribe({
        next: () => {
          this.afterVendorCreated(normalizedName);
        },
        error: () => {
          this.snackbar.error('เพิ่มบริษัท/ร้านไม่สำเร็จ');
        },
      });
  }

  // =========================
  // Payload Builders
  // =========================
  private formatDates(value: any): string | null {
    if (!value) return null;

    if (value instanceof Date) {
      return value.toISOString().split('T')[0];
    }

    return value;
  }

  private buildProcurementPayload(filePath?: string): procurementrecordCreateTypes {
    const raw = this.form.getRawValue();
    const totalAmount = Number(raw.total_amount || 0);

    return {
      procurement_record_id: this.procurement_record_id() ?? 0,
      document_no: raw.document_no ?? '',
      document_date: this.formatDates(raw.document_date) ?? '',
      inspection_date: this.formatDates(raw.inspection_date),
      total_amount: totalAmount,
      amount_text: toThaiBahtText(totalAmount),
      approval_date: this.formatDates(raw.approval_date),
      reference_no: raw.reference_no ?? '',
      decree_document_no: raw.decree_document_no ?? '',
      status: raw.status ?? 'ร่าง',
      remark: raw.remark ?? '',

      project_id: raw.project_id ?? 0,
      fiscal_year_id: raw.fiscal_year_id ?? 0,
      operation_type_id: raw.operation_type_id ?? 0,
      expense_type_id: this.isEditMode()
        ? (this.originalProcurementRecord()?.expense_type_id ?? raw.expense_type_id ?? 0)
        : (raw.expense_type_id ?? 0),
      department_id: raw.department_id ?? 0,
      vendor_id: raw.vendor_id ?? 0,
      fund_category_id: raw.fund_category_id ?? 0,
      budget_source_id: raw.budget_source_id ?? 0,
      staff_id: raw.staff_id && Number(raw.staff_id) > 0 ? Number(raw.staff_id) : null,

      attachment_file_path: filePath ?? raw.attachment_file_path ?? '',
    };
  }

  private buildFullAssetPayload(
    procurementPayload: procurementrecordCreateTypes,
    asset: AssetSectionPayload,
  ): procurementWithAssetsCreateTypes {
    return {
      procurement_record: procurementPayload,
      asset_items: asset.asset_items,
    };
  }

  onAssetPayloadChange(payload: AssetSectionPayload) {
    this.assetPayload.set(payload);
    this.syncTotalAmountFromSections();
  }

  onHirePayloadChange(payload: HireSectionPayload) {
    this.hirePayload.set(payload);
    this.syncTotalAmountFromSections();
  }

  onMaterialPayloadChange(payload: MaterialSectionPayload) {
    this.materialPayload.set(payload);
    this.syncTotalAmountFromSections();
  }

  onMaterialCreated(material: any) {
    this.material_items.update((items) => [
      ...items.filter((item) => Number(item.material_item_id) !== Number(material.material_item_id)),
      material,
    ]);
  }

  // =========================
  // Submit
  // =========================
  submit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    if (!this.validateChildSections()) return;

    this.isConfirmModalOpen.set(true);
  }

  closeConfirmModal() {
    if (this.isSubmitting()) return;
    this.isConfirmModalOpen.set(false);
  }

  confirmSave() {
    if (this.isSubmitting()) return;

    this.isSubmitting.set(true);

    if (this.selectedFile) {
      this.uploadFileAndSave();
      return;
    }

    this.saveData();
  }

  private validateChildSections(): boolean {
    if (this.isEditMode()) return true;
    if (this.isAssetType() && (!this.assetPayload() || !this.isAssetSectionValid())) {
      this.snackbar.error('กรุณากรอกข้อมูลครุภัณฑ์ให้ครบถ้วน');
      return false;
    }

    if (this.isHireType() && (!this.hirePayload() || !this.isHireSectionValid())) {
      this.snackbar.error('กรุณากรอกข้อมูลจัดจ้างให้ครบถ้วน');
      return false;
    }

    if (this.isMaterialType() && (!this.materialPayload() || !this.isMaterialSectionValid())) {
      this.snackbar.error('กรุณากรอกข้อมูลพัสดุให้ครบถ้วน');
      return false;
    }

    return true;
  }

  private uploadFileAndSave() {
    this.procurementrecordService.uploadFile(this.selectedFile!).subscribe({
      next: (res) => this.saveData(res.filePath),
      error: (err: any) => {
        console.error('Upload error:', err);
        this.isSubmitting.set(false);
        this.snackbar.error('อัปโหลดไฟล์ไม่สำเร็จ');
      },
    });
  }

  private saveData(filePath?: string) {
    const procurementPayload = this.buildProcurementPayload(filePath);
    const request$ = this.getSaveRequest(procurementPayload);

    if (!request$) {
      this.isSubmitting.set(false);
      return;
    }

    request$.pipe(finalize(() => this.isSubmitting.set(false))).subscribe({
      next: () => {
        this.isConfirmModalOpen.set(false);
        this.snackbar.success(this.isEditMode() ? 'แก้ไขข้อมูลสำเร็จ' : 'เพิ่มข้อมูลสำเร็จ');
        this.goBackToProcurementList();
      },
      error: (err: any) => {
        console.error('Save error:', err);
        this.snackbar.error(this.isEditMode() ? 'แก้ไขข้อมูลไม่สำเร็จ' : 'เพิ่มข้อมูลไม่สำเร็จ');
      },
    });
  }

  private getSaveRequest(procurementPayload: procurementrecordCreateTypes): Observable<any> | null {
    if (this.isEditMode()) {
      const originalRecord = this.originalProcurementRecord();
      const recordId = this.procurement_record_id()!;
      const hasStatusChanged =
        !!originalRecord && originalRecord.status !== procurementPayload.status;

      const updatePayload =
        hasStatusChanged && originalRecord
          ? {
              ...procurementPayload,
              status: originalRecord.status,
            }
          : procurementPayload;

      const updateRequest$ = this.procurementrecordService.updateProcurementrecord(
        recordId,
        updatePayload,
      );

      let saveHeader$ = updateRequest$;
      if (hasStatusChanged) {
        const statusPayload: updateProcurementRecordStatusTypes = {
          to_status: procurementPayload.status,
          approval_date: procurementPayload.approval_date,
          remark: procurementPayload.remark ?? null,
        };

        saveHeader$ = saveHeader$.pipe(
          switchMap(() =>
            this.procurementrecordService.updateProcurementrecordStatus(recordId, statusPayload),
          ),
        );
      }

      return saveHeader$;
    }

    if (this.isAssetType()) {
      const asset = this.assetPayload();

      if (!asset) {
        this.snackbar.error('ไม่พบข้อมูลครุภัณฑ์');
        return null;
      }

      return this.procurementrecordService.createProcurementWithAssets(
        this.buildFullAssetPayload(procurementPayload, asset),
      );
    }

    if (this.isHireType()) {
      const hire = this.hirePayload();
      if (!hire) {
        this.snackbar.error('ไม่พบข้อมูลจัดจ้าง');
        return null;
      }

      return this.procurementrecordService.createProcurementWithHire({
        procurement_record: procurementPayload,
        hire_details: hire.hire_details,
      });
    }

    if (this.isMaterialType()) {
      const material = this.materialPayload();
      if (!material) {
        this.snackbar.error('ไม่พบข้อมูลพัสดุ');
        return null;
      }

      return this.procurementrecordService.createProcurementWithMaterials({
        procurement_record: procurementPayload,
        material_receive_details: material.material_receive_details,
      });
    }

    return this.procurementrecordService.createProcurementrecord(procurementPayload);
  }

  private saveEditedSections(
    procurementPayload: procurementrecordCreateTypes,
  ): Observable<unknown> {
    if (this.isMaterialType()) {
      return this.runSaveOperations([
        ...this.materialOperations(
          this.materialPayload()?.material_receive_details ?? [],
          procurementPayload.procurement_record_id,
        ),
        ...this.hireOperations([], procurementPayload.procurement_record_id),
        ...this.assetOperations([], procurementPayload.procurement_record_id),
      ]);
    }

    if (this.isHireType()) {
      return this.runSaveOperations([
        ...this.hireOperations(
          this.hirePayload()?.hire_details ?? [],
          procurementPayload.procurement_record_id,
        ),
        ...this.materialOperations([], procurementPayload.procurement_record_id),
        ...this.assetOperations([], procurementPayload.procurement_record_id),
      ]);
    }

    if (this.isAssetType()) {
      return this.runSaveOperations([
        ...this.assetOperations(
          this.assetPayload()?.asset_items ?? [],
          procurementPayload.procurement_record_id,
        ),
        ...this.materialOperations([], procurementPayload.procurement_record_id),
        ...this.hireOperations([], procurementPayload.procurement_record_id),
      ]);
    }

    return this.runSaveOperations([
      ...this.materialOperations([], procurementPayload.procurement_record_id),
      ...this.hireOperations([], procurementPayload.procurement_record_id),
      ...this.assetOperations([], procurementPayload.procurement_record_id),
    ]);
  }

  private materialOperations(
    details: MaterialSectionPayload['material_receive_details'],
    procurementRecordId: number,
  ): Array<() => Observable<unknown>> {
    const oldDetails = this.initialMaterialDetails();
    const operations: Array<() => Observable<unknown>> = details.map((detail, index) => () => {
      const body = {
        ...detail,
        procurement_record_id: procurementRecordId,
        item_no: index + 1,
        material_item_id: detail.material_item_id ?? 0,
        operation_reason: detail.operation_reason ?? '',
      };
      return detail.receive_detail_id
        ? this.materialReceiveDetailService.updateMaterialReceiveDetail(
            detail.receive_detail_id,
            body,
          )
        : this.materialReceiveDetailService.createMaterialReceiveDetail(body);
    });

    const keptIds = new Set(details.map((detail) => detail.receive_detail_id).filter(Boolean));
    for (const oldDetail of oldDetails) {
      if (!keptIds.has(oldDetail.receive_detail_id)) {
        operations.push(() =>
          this.materialReceiveDetailService.deleteMaterialReceiveDetail(
            oldDetail.receive_detail_id,
          ),
        );
      }
    }
    return operations;
  }

  private hireOperations(
    details: HireSectionPayload['hire_details'],
    procurementRecordId: number,
  ): Array<() => Observable<unknown>> {
    const oldDetails = this.initialHireDetails();
    const operations: Array<() => Observable<unknown>> = details.map((detail, index) => () => {
      const quantity = Number(detail.quantity ?? 0);
      const unitPrice = Number(detail.unit_price ?? 0);
      const body = {
        ...detail,
        procurement_record_id: procurementRecordId,
        item_no: index + 1,
        total_amount: quantity * unitPrice,
        total_text: toThaiBahtText(quantity * unitPrice),
        operation_reason: detail.operation_reason ?? '',
        remark: detail.remark ?? '',
      };
      return detail.hire_detail_id
        ? this.hireDetailsService.updateHireDetails(detail.hire_detail_id, body)
        : this.hireDetailsService.createHireDetails(body);
    });

    const keptIds = new Set(details.map((detail) => detail.hire_detail_id).filter(Boolean));
    for (const oldDetail of oldDetails) {
      if (!keptIds.has(oldDetail.hire_detail_id)) {
        operations.push(() => this.hireDetailsService.deleteHireDetails(oldDetail.hire_detail_id));
      }
    }
    return operations;
  }

  private assetOperations(
    rows: AssetSectionPayload['asset_items'],
    procurementRecordId: number,
  ): Array<() => Observable<unknown>> {
    const oldRows = this.initialAssetData();
    const operations: Array<() => Observable<unknown>> = rows.map((row, index) => () => {
      const asset = {
        ...row.asset_item,
        procurement_record_id: procurementRecordId,
        item_no: index + 1,
      };
      const assetRequest$ = asset.asset_id
        ? this.assetItemsService
            .updateAssetItems(asset.asset_id, asset)
            .pipe(switchMap(() => of(asset.asset_id)))
        : this.assetItemsService
            .createAssetItemReturning(asset)
            .pipe(
              switchMap((created: any) =>
                of(Number(created?.asset_id ?? created?.assetItem?.asset_id ?? 0)),
              ),
            );

      return assetRequest$.pipe(
        switchMap((assetId) => {
          if (!assetId) throw new Error('ไม่สามารถบันทึกครุภัณฑ์หลักได้');
          const oldRow = oldRows.find((old) => old.asset_item.asset_id === row.asset_item.asset_id);
          return this.runSaveOperations(
            this.assetSubItemOperations(
              row.asset_sub_items,
              oldRow?.asset_sub_items ?? [],
              assetId,
            ),
          );
        }),
      );
    });

    const keptIds = new Set(rows.map((row) => row.asset_item.asset_id).filter(Boolean));
    for (const oldRow of oldRows) {
      if (!keptIds.has(oldRow.asset_item.asset_id)) {
        operations.push(() =>
          this.runSaveOperations([
            ...oldRow.asset_sub_items.map(
              (item) => () => this.assetSubItemsService.deleteAssetSubItems(item.asset_sub_item_id),
            ),
            () => this.assetItemsService.deleteAssetItems(oldRow.asset_item.asset_id),
          ]),
        );
      }
    }
    return operations;
  }

  private assetSubItemOperations(
    items: AssetSectionPayload['asset_items'][number]['asset_sub_items'],
    oldItems: AssetSectionPayload['asset_items'][number]['asset_sub_items'],
    assetId: number,
  ): Array<() => Observable<unknown>> {
    const operations: Array<() => Observable<unknown>> = items.map((item, index) => () => {
      const body = {
        ...item,
        asset_id: assetId,
        item_no: index + 1,
        asset_category_id: item.asset_category_id ?? 0,
        unit_id: item.unit_id ?? 0,
      };
      return item.asset_sub_item_id
        ? this.assetSubItemsService.updateAssetSubItems(item.asset_sub_item_id, body)
        : this.assetSubItemsService.createAssetSubItems(body);
    });
    const keptIds = new Set(items.map((item) => item.asset_sub_item_id).filter(Boolean));
    for (const oldItem of oldItems) {
      if (!keptIds.has(oldItem.asset_sub_item_id)) {
        operations.push(() =>
          this.assetSubItemsService.deleteAssetSubItems(oldItem.asset_sub_item_id),
        );
      }
    }
    return operations;
  }

  private runSaveOperations(operations: Array<() => Observable<unknown>>): Observable<unknown> {
    return operations.length
      ? from(operations).pipe(
          concatMap((operation) => operation()),
          toArray(),
        )
      : of([]);
  }

  // =========================
  // Navigation
  // =========================
  cancel() {
    this.goBackToProcurementList();
  }

  private goBackToProcurementList() {
    this.router.navigate(['/admin/project/procurementrecord'], {
      queryParams: {
        project_id: this.form.controls.project_id.value,
        fiscal_year_id: this.form.controls.fiscal_year_id.value,
      },
      state: {
        projects: this.projectstate,
      },
    });
  }

  private buildAssetSummarySections(): ProcurementSaveSummarySection[] {
    const assetPayload = this.assetPayload();

    if (!assetPayload?.asset_items?.length) {
      return [];
    }

    return assetPayload.asset_items.map((asset, index) => ({
      title: `ครุภัณฑ์รายการที่ ${index + 1}: ${asset.asset_item.asset_name || '-'}`,
      items: asset.asset_sub_items.map((subItem) => ({
        title: subItem.sub_item_name || '-',
        subtitle: this.findOptionName(
          this.asset_category(),
          'asset_category_id',
          subItem.asset_category_id,
          'asset_category_name',
        ),
        quantity: subItem.quantity,
        unitLabel: this.findOptionName(this.unit(), 'unit_id', subItem.unit_id, 'unit_name'),
        unitPrice: subItem.unit_price,
        totalPrice: subItem.total_price,
        note: `อายุการใช้งาน ${subItem.useful_life_year} ปี`,
      })),
    }));
  }

  private buildHireSummarySections(): ProcurementSaveSummarySection[] {
    const hirePayload = this.hirePayload();

    if (!hirePayload?.hire_details?.length) {
      return [];
    }

    return [
      {
        title: 'รายการจัดจ้าง',
        items: hirePayload.hire_details.map((detail) => ({
          title: detail.hire_name || '-',
          subtitle: detail.operation_reason || undefined,
          quantity: detail.quantity,
          unitLabel: this.findOptionName(this.unit(), 'unit_id', detail.unit_id, 'unit_name'),
          unitPrice: detail.unit_price,
          totalPrice: detail.total_amount,
          note: detail.remark || undefined,
        })),
      },
    ];
  }

  private buildMaterialSummarySections(): ProcurementSaveSummarySection[] {
    const materialPayload = this.materialPayload();

    if (!materialPayload?.material_receive_details?.length) {
      return [];
    }

    return [
      {
        title: 'รายการวัสดุ',
        items: materialPayload.material_receive_details.map((detail) => {
          const material = this.material_items().find(
            (x) => Number(x.material_item_id) === Number(detail.material_item_id),
          );

          return {
            title: material?.material_name || material?.display_name || '-',
            subtitle: material?.material_code ? `รหัส ${material.material_code}` : undefined,
            quantity: detail.quantity,
            unitPrice: detail.unit_price,
            totalPrice: detail.total_amount,
            note: detail.operation_reason || undefined,
          };
        }),
      },
    ];
  }

  private findOptionName(
    options: any[],
    valueKey: string,
    value: number | null | undefined,
    labelKey: string,
  ): string | undefined {
    return options.find((option) => Number(option[valueKey]) === Number(value))?.[labelKey];
  }

  private syncTotalAmountFromSections() {
    let totalAmount = Number(this.form.controls.total_amount.value || 0);

    if (this.isMaterialType()) {
      totalAmount =
        this.materialPayload()?.material_receive_details.reduce(
          (sum, item) => sum + Number(item.total_amount || 0),
          0,
        ) ?? 0;
    } else if (this.isHireType()) {
      totalAmount =
        this.hirePayload()?.hire_details.reduce(
          (sum, item) => sum + Number(item.total_amount || 0),
          0,
        ) ?? 0;
    } else if (this.isAssetType()) {
      totalAmount =
        this.assetPayload()?.asset_items.reduce(
          (assetSum, asset) =>
            assetSum +
            asset.asset_sub_items.reduce(
              (subSum, subItem) => subSum + Number(subItem.total_price || 0),
              0,
            ),
          0,
        ) ?? 0;
    }

    this.form.patchValue(
      {
        total_amount: totalAmount,
      },
      { emitEvent: true },
    );
  }

  private afterVendorCreated(vendorName: string) {
    this.vendorsService
      .getVendors({
        sort: '',
        search: vendorName,
        pageSize: 100,
        pageNumber: 1,
      })
      .subscribe({
        next: (response) => {
          const vendors = response.data ?? [];
          const createdVendor =
            vendors.find((x) => x.vendor_name?.trim() === vendorName) ??
            vendors.find((x) => x.vendor_name?.trim().toLowerCase() === vendorName.toLowerCase()) ??
            null;

          this.mergeVendorOptions(vendors);

          if (createdVendor) {
            this.form.patchValue({
              vendor_id: createdVendor.vendor_id,
            });
          }

          this.isVendorModalOpen.set(false);
          this.pendingVendorName.set('');
          this.snackbar.success('เพิ่มบริษัท/ร้านสำเร็จ');
        },
        error: () => {
          this.snackbar.error('เพิ่มบริษัท/ร้านสำเร็จ แต่โหลดรายการกลับมาไม่สำเร็จ');
          this.isVendorModalOpen.set(false);
          this.pendingVendorName.set('');
        },
      });
  }

  private mergeVendorOptions(newVendors: vendorsTypes[]) {
    const merged = [...this.vendors()];

    newVendors.forEach((vendor) => {
      const index = merged.findIndex((item) => Number(item.vendor_id) === Number(vendor.vendor_id));

      if (index >= 0) {
        merged[index] = vendor;
      } else {
        merged.unshift(vendor);
      }
    });

    this.vendors.set(merged);
  }

  // =========================
  // Options
  // =========================
  statusOptions: {
    label: ProcurementRecordStatus;
    value: ProcurementRecordStatus;
  }[] = [
    { label: 'ร่าง', value: 'ร่าง' },
    { label: 'รออนุมัติ', value: 'รออนุมัติ' },
    { label: 'อนุมัติแล้ว', value: 'อนุมัติแล้ว' },
    { label: 'รอเบิกจ่าย', value: 'รอเบิกจ่าย' },
    { label: 'เบิกจ่ายแล้ว', value: 'เบิกจ่ายแล้ว' },
    { label: 'ขึ้นทะเบียนแล้ว', value: 'ขึ้นทะเบียนแล้ว' },
    { label: 'เสร็จสิ้น', value: 'เสร็จสิ้น' },
    { label: 'ยกเลิก', value: 'ยกเลิก' },
  ];
}

export type ProcurementRecordStatus =
  | 'ร่าง'
  | 'รออนุมัติ'
  | 'อนุมัติแล้ว'
  | 'เบิกจ่ายแล้ว'
  | 'ขึ้นทะเบียนแล้ว'
  | 'รอเบิกจ่าย'
  | 'เสร็จสิ้น'
  | 'ยกเลิก';
