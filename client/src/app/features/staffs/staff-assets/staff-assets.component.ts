import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DataTableComponent } from '../../../../shared/data-table/data-table.component';
import { StaffAsset } from '../interface/staffAsset';
import { StaffAssetsService } from '../service/staff-assets.service';

interface StaffSummary {
  staff_id: number;
  full_name: string;
  department_name?: string | null;
}

@Component({
  selector: 'app-staff-assets',
  standalone: true,
  imports: [CommonModule, DataTableComponent],
  templateUrl: './staff-assets.component.html',
})
export class StaffAssetsComponent {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private staffAssetsService = inject(StaffAssetsService);

  staffId = Number(this.route.snapshot.paramMap.get('staffId'));
  staff = signal<StaffSummary | null>(history.state?.staff ?? null);
  assets = signal<StaffAsset[]>([]);
  loading = signal(true);
  loadError = signal(false);

  columns = [
    { label: 'เลขครุภัณฑ์', key: 'asset_code' },
    { label: 'ชื่อครุภัณฑ์', key: 'asset_name' },
    { label: 'เลขที่ใบเบิก', key: 'withdrawal_document_no' },
    { label: 'วันที่เบิก', key: 'withdrawal_date', pipe: 'thaiDate' as const },
    { label: 'สถานที่จัดเก็บ', key: 'storage_location' },
    { label: 'จำนวนรายการย่อย', key: 'sub_item_count' },
  ];

  constructor() {
    if (!Number.isInteger(this.staffId) || this.staffId <= 0) {
      this.loading.set(false);
      this.loadError.set(true);
      return;
    }

    this.staffAssetsService.getStaffAssets(this.staffId).subscribe({
      next: (assets) =>
        this.assets.set(
          assets.map((asset) => ({
            ...asset,
            asset_code:
              asset.running_start_no && asset.running_end_no
                ? `${asset.running_start_no}-${asset.running_end_no}/${asset.fiscal_asset_year ?? '-'}`
                : '-',
          })),
        ),
      error: (error) => {
        console.error(error);
        this.loadError.set(true);
        this.loading.set(false);
      },
      complete: () => this.loading.set(false),
    });
  }

  goBack() {
    this.router.navigate(['/admin/staffs']);
  }
}
