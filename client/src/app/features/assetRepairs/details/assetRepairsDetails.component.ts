import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { assetRepairsTypes } from '../interface/assetRepairsTypes';
import { ThaiDatePipe } from '../../../shared/pipes/thai-date-pipe';
import { AssetRepairsService } from '../service/assetRepairs.service';

@Component({
  selector: 'app-details',
  imports: [ThaiDatePipe],
  templateUrl: './assetRepairsDetails.component.html',
})
export class AssetRepairsDetailsComponent {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private assetRepairsService = inject(AssetRepairsService);

  isLoading = signal(false);

  assetRepairs = signal<assetRepairsTypes | null>(null);
  asset_repair_id = signal<number | null>(null);

  ngOnInit() {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (!Number.isInteger(id) || id <= 0) return;
    this.asset_repair_id.set(id);

    const stateRecord = history.state?.assetRepairs as assetRepairsTypes | undefined;

    if (stateRecord?.asset_repair_id === id) {
      this.assetRepairs.set(stateRecord);
      return;
    }
    this.isLoading.set(true);
    this.assetRepairsService.getAssetRepair(id).subscribe({
      next: (record) => {
        this.assetRepairs.set(record);
        this.isLoading.set(false);
      },
      error: () => this.isLoading.set(false),
    });
  }

  cancel() {
    if (history.state?.fromStaffDashboard && history.state?.staffId) {
      this.router.navigate(['/admin/staffs', history.state.staffId, 'dashboard'], {
        queryParams: {
          section: 'repairs',
          ...(history.state.fiscalYearId ? { fiscal_year_id: history.state.fiscalYearId } : {}),
        },
      });
      return;
    }
    const assetId = this.assetRepairs()?.procurement_withdrawal_id;

    if (!assetId) {
      this.router.navigate(['/admin/procurements']);
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
