import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { StaffAsset } from '../interface/staffAsset';

@Injectable({ providedIn: 'root' })
export class StaffAssetsService {
  private baseUrl = environment.baseUrl;
  private http = inject(HttpClient);

  getStaffAssets(staffId: number) {
    return this.http.get<StaffAsset[]>(this.baseUrl + `PublicPortal/staffs/${staffId}/assets`);
  }
}
