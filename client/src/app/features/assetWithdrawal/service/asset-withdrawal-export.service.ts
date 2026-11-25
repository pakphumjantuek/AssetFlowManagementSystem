import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

export interface AssetExportStaff {
  staffId: number;
  fullName: string;
}

/** ส่งออกใบเบิกครุภัณฑ์ (PDF) ตามเอกสารจัดซื้อ */
@Injectable({ providedIn: 'root' })
export class AssetWithdrawalExportService {
  private baseUrl = environment.baseUrl + 'AssetWithdrawalExport/procurement/';
  private http = inject(HttpClient);

  /** ผู้เบิกที่บันทึกไว้ในรายการเบิกครุภัณฑ์ของเอกสารจัดซื้อนี้ */
  getStaffs(procurementId: number) {
    return this.http.get<AssetExportStaff[]>(this.baseUrl + procurementId + '/staffs');
  }

  exportPdf(procurementId: number, payload: { exportDate: string; staffId: number }) {
    return this.http.post(this.baseUrl + procurementId + '/pdf', payload, { responseType: 'blob' });
  }

  issuePdf(procurementId: number, payload: { exportDate: string; staffId: number }) {
    return this.http.post(this.baseUrl + procurementId + '/pdf/issue', payload, { responseType: 'blob' });
  }
}
