import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges, inject } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { InputComponent, SelectComponent } from '../../../../../../shared';
import { DatePickerComponent } from '../../../../../shared/date-picker/date-picker.component';

export interface AssetSectionPayload {
  asset_items: {
    asset_item: {
      asset_id: number;
      procurement_record_id: number;
      item_no: number;
      asset_code_prefix?: string | null;
      asset_name: string;
      receive_date: string;
      fund_category_id: number | null;
      department_id: number | null;
      acquisition_method_id: number | null;
    };

    asset_sub_items: {
      asset_sub_item_id: number;
      asset_id: number;
      item_no: number;
      sub_item_name: string;
      asset_category_id: number | null;
      quantity: number;
      unit_id: number | null;
      unit_price: number;
      total_price: number;
      useful_life_year: number;
      running_start_no?: number;
      running_end_no?: number;
      fiscal_asset_year?: number;
      status?: string | null;
    }[];
  }[];
}

@Component({
  selector: 'app-procurement-asset-section',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    InputComponent,
    SelectComponent,
    DatePickerComponent,
  ],
  templateUrl: './procurement-asset-section.component.html',
})
export class ProcurementAssetSectionComponent implements OnInit, OnChanges {
  private fb = inject(FormBuilder);

  @Input() fundCategorys: any[] = [];
  @Input() departments: any[] = [];
  @Input() acquisitionMethods: any[] = [];
  @Input() assetCategories: any[] = [];
  @Input() units: any[] = [];
  @Input() initialData: AssetSectionPayload['asset_items'] = [];
  /** สังกัดหน่วยงานของเอกสาร ใช้เป็นค่าเริ่มต้นของ "หน่วยงานผู้รับผิดชอบ" ในแต่ละรายการ (เปลี่ยนเองได้) */
  @Input() defaultDepartmentId: number | null = null;

  @Output() payloadChange = new EventEmitter<AssetSectionPayload>();
  @Output() validityChange = new EventEmitter<boolean>();

  assetItems = new FormArray<FormGroup>([]);

  get assetItemForms() {
    return this.assetItems.controls;
  }

  ngOnChanges(changes: SimpleChanges): void {
    const change = changes['defaultDepartmentId'];
    if (!change || change.firstChange) return;

    // ตามสังกัดหน่วยงานที่เปลี่ยน เฉพาะแถวที่ยังว่าง หรือยังเป็นค่าเดิมของสังกัด (ไม่ทับที่ผู้ใช้เลือกเอง)
    const previous = change.previousValue as number | null;
    const next = change.currentValue as number | null;
    for (let i = 0; i < this.assetItems.length; i++) {
      const control = this.getAssetItemForm(i).controls['department_id'];
      const current = control.value;
      if (current === null || current === previous) control.setValue(next);
    }
  }

  ngOnInit(): void {
    this.assetItems.valueChanges.subscribe(() => this.emitPayload());

    if (this.initialData.length) {
      for (const item of this.initialData) {
        this.addAssetItem();
        const assetIndex = this.assetItems.length - 1;
        this.getAssetItemForm(assetIndex).patchValue(item.asset_item, { emitEvent: false });
        const subItems = item.asset_sub_items ?? [];
        for (let subIndex = 0; subIndex < subItems.length; subIndex++) {
          if (subIndex > 0) this.addAssetSubItem(assetIndex);
          this.getSubItems(assetIndex).at(subIndex).patchValue(subItems[subIndex], {
            emitEvent: false,
          });
        }
      }
    } else if (this.assetItems.length === 0) {
      this.addAssetItem();
    }

    this.emitPayload();
  }

  getAssetItemForm(assetIndex: number): FormGroup {
    return this.assetItems.at(assetIndex).get('asset_item') as FormGroup;
  }

  getSubItems(assetIndex: number): FormArray<FormGroup> {
    return this.assetItems.at(assetIndex).get('asset_sub_items') as FormArray<FormGroup>;
  }

  getSubItemForms(assetIndex: number) {
    return this.getSubItems(assetIndex).controls;
  }

  addAssetItem() {
    const group = this.fb.group({
      asset_item: this.fb.group({
        asset_id: [0],
        procurement_record_id: [0],
        item_no: [this.assetItems.length + 1],
        asset_code_prefix: [''],
        asset_name: ['', Validators.required],
        receive_date: [new Date().toISOString().split('T')[0], Validators.required],
        fund_category_id: [null as number | null, Validators.required],
        department_id: [this.defaultDepartmentId, Validators.required],
        acquisition_method_id: [null as number | null, Validators.required],
      }),

      asset_sub_items: this.fb.array<FormGroup>([]),
    });

    this.assetItems.push(group);
    this.addAssetSubItem(this.assetItems.length - 1);
    this.emitPayload();
  }

  removeAssetItem(assetIndex: number) {
    this.assetItems.removeAt(assetIndex);

    this.assetItems.controls.forEach((control, index) => {
      const assetItemForm = control.get('asset_item') as FormGroup;
      assetItemForm.patchValue({ item_no: index + 1 });
    });

    this.emitPayload();
  }

  addAssetSubItem(assetIndex: number) {
    const subItems = this.getSubItems(assetIndex);

    const group = this.fb.group({
      asset_sub_item_id: [0],
      asset_id: [0],
      item_no: [subItems.length + 1],
      sub_item_name: ['', Validators.required],
      asset_category_id: [null as number | null, Validators.required],
      quantity: [1, Validators.required],
      unit_id: [null as number | null, Validators.required],
      unit_price: [0],
      total_price: [0],
      useful_life_year: [0, Validators.required],
      running_start_no: [0],
      running_end_no: [0],
      fiscal_asset_year: [0],
      status: [null as string | null],
    });

    group.valueChanges.subscribe(() => {
      const quantity = Number(group.controls.quantity.value || 0);
      const unitPrice = Number(group.controls.unit_price.value || 0);

      group.patchValue(
        {
          total_price: quantity * unitPrice,
        },
        { emitEvent: false },
      );

      this.emitPayload();
    });

    subItems.push(group);
    this.emitPayload();
  }

  removeAssetSubItem(assetIndex: number, subIndex: number) {
    const subItems = this.getSubItems(assetIndex);
    subItems.removeAt(subIndex);

    subItems.controls.forEach((control, index) => {
      control.patchValue({ item_no: index + 1 });
    });

    this.emitPayload();
  }

  markAllAsTouched() {
    this.assetItems.controls.forEach((assetGroup) => {
      assetGroup.markAllAsTouched();

      const assetItemForm = assetGroup.get('asset_item') as FormGroup;
      assetItemForm.markAllAsTouched();

      const subItems = assetGroup.get('asset_sub_items') as FormArray<FormGroup>;
      subItems.controls.forEach((subGroup) => subGroup.markAllAsTouched());
    });
  }

  isValid() {
    return this.assetItems.length > 0 && this.assetItems.valid;
  }

  private formatDate(value: any): string {
    if (!value) return '';

    if (value instanceof Date) {
      return value.toISOString().split('T')[0];
    }

    return value;
  }

  private emitPayload() {
    const payload: AssetSectionPayload = {
      asset_items: this.assetItems.controls.map((assetGroup, assetIndex) => {
        const assetItemForm = assetGroup.get('asset_item') as FormGroup;
        const assetItemRaw = assetItemForm.getRawValue();

        const subItems = assetGroup.get('asset_sub_items') as FormArray<FormGroup>;

        return {
          asset_item: {
            asset_id: Number(assetItemRaw.asset_id ?? 0),
            procurement_record_id: Number(assetItemRaw.procurement_record_id ?? 0),
            item_no: assetIndex + 1,
            asset_code_prefix: assetItemRaw.asset_code_prefix ?? '',
            asset_name: assetItemRaw.asset_name ?? '',
            receive_date: this.formatDate(assetItemRaw.receive_date),
            fund_category_id: assetItemRaw.fund_category_id,
            department_id: assetItemRaw.department_id,
            acquisition_method_id: assetItemRaw.acquisition_method_id,
          },

          asset_sub_items: subItems.getRawValue().map((x: any, subIndex: number) => ({
            asset_sub_item_id: Number(x.asset_sub_item_id ?? 0),
            asset_id: Number(x.asset_id ?? 0),
            item_no: subIndex + 1,
            sub_item_name: x.sub_item_name ?? '',
            asset_category_id: x.asset_category_id,
            quantity: Number(x.quantity || 0),
            unit_id: x.unit_id,
            unit_price: Number(x.unit_price || 0),
            total_price: Number(x.quantity || 0) * Number(x.unit_price || 0),
            useful_life_year: Number(x.useful_life_year || 0),
            running_start_no: Number(x.running_start_no || 0),
            running_end_no: Number(x.running_end_no || 0),
            fiscal_asset_year: Number(x.fiscal_asset_year || 0),
            status: x.status ?? null,
          })),
        };
      }),
    };

    this.payloadChange.emit(payload);
    this.validityChange.emit(this.isValid());
  }
}
