import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnInit, Output, inject, signal } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { InputComponent, SelectComponent, TextareaComponent } from '../../../../../../shared';
import { MaterialItemsService } from '../../../../MaterialItems/service/materialItems.service';
import { SnackbarService } from '../../../../../core/services/snackbar.service';
import { finalize, switchMap } from 'rxjs';

export interface MaterialSectionPayload {
  material_receive_details: {
    receive_detail_id: number;
    procurement_record_id: number;
    item_no: number;
    material_item_id: number | null;
    quantity: number;
    unit_price: number;
    total_amount: number;
    operation_reason: string | null;
  }[];
}

@Component({
  selector: 'app-procurement-material-section',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, InputComponent, SelectComponent],
  templateUrl: './procurement-material-section.component.html',
})
export class ProcurementMaterialSectionComponent implements OnInit {
  private fb = inject(FormBuilder);
  private materialItemsService = inject(MaterialItemsService);
  private snackbar = inject(SnackbarService);

  @Input() materialItems: any[] = [];
  @Input() units: any[] = [];
  @Input() fundCategorys: any[] = [];
  @Input() initialDetails: MaterialSectionPayload['material_receive_details'] = [];

  @Output() payloadChange = new EventEmitter<MaterialSectionPayload>();
  @Output() validityChange = new EventEmitter<boolean>();
  @Output() materialCreated = new EventEmitter<any>();

  materialDetails = new FormArray<FormGroup>([]);
  isCreateModalOpen = signal(false);
  isCreatingMaterial = signal(false);
  private targetDetailIndex = 0;
  newMaterialForm = this.fb.nonNullable.group({
    material_name: ['', Validators.required],
    unit_id: [null as number | null, Validators.required],
    fund_category_id: [null as number | null],
    unit_price: [0, [Validators.required, Validators.min(0)]],
  });

  openCreateModal(index: number) {
    this.targetDetailIndex = index;
    this.newMaterialForm.reset({ material_name: '', unit_id: null, fund_category_id: null, unit_price: 0 });
    this.isCreateModalOpen.set(true);
  }

  createMaterial() {
    if (this.newMaterialForm.invalid || !this.newMaterialForm.controls.material_name.value.trim()) {
      this.newMaterialForm.markAllAsTouched();
      return;
    }
    const value = this.newMaterialForm.getRawValue();
    const name = value.material_name.trim();
    const price = Number(value.unit_price);
    this.isCreatingMaterial.set(true);
    this.materialItemsService.createMaterialItems({
      material_name: name,
      unit_id: Number(value.unit_id),
      fund_category_id: value.fund_category_id ? Number(value.fund_category_id) : null,
      unit_price: price,
    }).pipe(
      switchMap(() => this.materialItemsService.getMaterialItems({
        sort: '', search: name, pageSize: 100, pageNumber: 1,
      })),
      finalize(() => this.isCreatingMaterial.set(false)),
    ).subscribe({
      next: (response) => {
        const item = [...(response.data ?? [])].reverse().find((candidate) =>
          candidate.material_name?.trim() === name &&
          Number(candidate.unit_id) === Number(value.unit_id) &&
          Number(candidate.unit_price) === price,
        );
        if (!item) {
          this.snackbar.error('บันทึกวัสดุแล้ว แต่ไม่พบรายการใหม่ กรุณาโหลดหน้าอีกครั้ง');
          return;
        }
        const createdMaterial = {
          ...item,
          display_name: `${item.material_code} - ${item.material_name} ราคา ${item.unit_price ?? 0} บาท`,
        };
        this.materialItems = [...this.materialItems, createdMaterial];
        this.materialCreated.emit(createdMaterial);
        this.materialDetails.at(this.targetDetailIndex)?.controls['material_item_id'].setValue(item.material_item_id);
        this.isCreateModalOpen.set(false);
        this.snackbar.success('เพิ่มรายการวัสดุสำเร็จ');
      },
      error: () => this.snackbar.error('เพิ่มรายการวัสดุไม่สำเร็จ'),
    });
  }

  private optionsCache = new Map<number, { key: string; options: any[] }>();

  /** รายการวัสดุที่เลือกได้ในแถวนี้ — ตัดรายการที่แถวอื่นเลือกไปแล้วออก */
  optionsFor(index: number): any[] {
    const takenByOthers = this.materialDetails.controls
      .filter((_, i) => i !== index)
      .map((g) => Number(g.controls['material_item_id'].value))
      .filter((id) => id);
    const key = `${this.materialItems.length}|${takenByOthers.join(',')}`;
    const cached = this.optionsCache.get(index);
    if (cached?.key === key) return cached.options;
    const taken = new Set(takenByOthers);
    const options = this.materialItems.filter((x) => !taken.has(Number(x.material_item_id)));
    this.optionsCache.set(index, { key, options });
    return options;
  }

  private isDuplicateMaterial(group: FormGroup, id: unknown): boolean {
    return this.materialDetails.controls.some(
      (g) => g !== group && Number(g.controls['material_item_id'].value) === Number(id),
    );
  }

  get materialDetailForms() {
    return this.materialDetails.controls;
  }

  ngOnInit(): void {
    if (this.initialDetails.length) {
      for (const detail of this.initialDetails) {
        this.addMaterialDetail();
        this.materialDetails.at(this.materialDetails.length - 1).patchValue(detail, {
          emitEvent: false,
        });
      }
    } else {
      this.addMaterialDetail();
    }
    this.emitPayload();
  }

  addMaterialDetail() {
    const group = this.fb.group({
      receive_detail_id: [0],
      procurement_record_id: [0],
      material_item_id: [null as number | null, Validators.required],
      quantity: [0, Validators.required],
      unit_price: [0, Validators.required],
      total_amount: [0],
      operation_reason: [''],
    });

    group.controls.material_item_id.valueChanges.subscribe((id) => {
      if (id && this.isDuplicateMaterial(group, id)) {
        this.snackbar.error('วัสดุรายการนี้ถูกเพิ่มไว้แล้ว');
        group.controls.material_item_id.setValue(null, { emitEvent: false });
        this.emitPayload();
        return;
      }

      const selectedItem = this.materialItems.find(
        (x) => Number(x.material_item_id) === Number(id),
      );

      if (!selectedItem) return;

      const quantity = Number(group.controls.quantity.value ?? 0);
      const unitPrice = Number(selectedItem.unit_price ?? 0);

      group.patchValue(
        {
          unit_price: unitPrice,
          total_amount: quantity * unitPrice,
        },
        { emitEvent: false },
      );

      this.emitPayload();
    });

    group.controls.quantity.valueChanges.subscribe((qty) => {
      const unitPrice = Number(group.controls.unit_price.value ?? 0);

      group.patchValue(
        {
          total_amount: Number(qty ?? 0) * unitPrice,
        },
        { emitEvent: false },
      );

      this.emitPayload();
    });

    this.materialDetails.push(group);
    this.emitPayload();
  }

  removeMaterialDetail(index: number) {
    this.materialDetails.removeAt(index);
    this.emitPayload();
  }

  isValid() {
    return this.materialDetails.valid && this.materialDetails.length > 0;
  }

  private emitPayload() {
    const payload: MaterialSectionPayload = {
      material_receive_details: this.materialDetails.getRawValue().map((x: any, index: number) => ({
        receive_detail_id: Number(x.receive_detail_id ?? 0),
        procurement_record_id: Number(x.procurement_record_id ?? 0),
        item_no: index + 1,
        material_item_id: x.material_item_id,
        quantity: Number(x.quantity ?? 0),
        unit_price: Number(x.unit_price ?? 0),
        total_amount: Number(x.quantity ?? 0) * Number(x.unit_price ?? 0),
        operation_reason: x.operation_reason || null,
      })),
    };

    this.payloadChange.emit(payload);
    this.validityChange.emit(this.isValid());
  }
}
