import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { Pagination } from '../../../shared/models/pagination';
import { Params } from '../../../shared/models/allType';
import {
  MaterialWithdrawalCreateTypes,
  MaterialWithdrawalTypes,
  MaterialWithdrawalDisplayItemTypes,
  MaterialWithdrawalImpact,
  MaterialWithdrawalRevision,
} from '../interface/materialWithdrawalTypes';
@Injectable({
  providedIn: 'root',
})
export class MaterialWithdrawalService {
  private baseUrl = environment.baseUrl;
  private http = inject(HttpClient);

  getMaterialWithdrawals(paramsData: Params) {
    let params = new HttpParams();

    if (paramsData.sort) {
      params = params.append('sort', paramsData.sort);
    }

    if (paramsData.search) {
      params = params.append('search', paramsData.search);
    }

    params = params.append('pageSize', paramsData.pageSize);
    params = params.append('pageIndex', paramsData.pageNumber);

    return this.http.get<Pagination<MaterialWithdrawalTypes>>(this.baseUrl + 'MaterialWithdrawal', {
      params,
    });
  }

  getMaterialWithdrawalbyProcuremens(paramsData: Params, procurement_record_id: number) {
    let params = new HttpParams();

    if (paramsData.sort) {
      params = params.append('sort', paramsData.sort);
    }

    if (paramsData.search) {
      params = params.append('search', paramsData.search);
    }

    params = params.append('pageSize', paramsData.pageSize);
    params = params.append('pageIndex', paramsData.pageNumber);

    return this.http.get<Pagination<MaterialWithdrawalTypes>>(
      this.baseUrl + 'MaterialWithdrawal/by-procurement/' + procurement_record_id,
      { params },
    );
  }

  getMaterialWithdrawal(id: number) {
    return this.http.get<MaterialWithdrawalTypes>(this.baseUrl + 'MaterialWithdrawal/' + id);
  }

  exportPdf(id: number, payload: { exportDate: string; staffId: number }) {
    return this.http.post(this.baseUrl + 'MaterialWithdrawalExport/' + id + '/pdf', payload, { responseType: 'blob' });
  }

  exportProcurementPdf(id: number, payload: { exportDate: string; staffId: number }) {
    return this.http.post(this.baseUrl + 'MaterialWithdrawalExport/procurement/' + id + '/pdf', payload, { responseType: 'blob' });
  }

  issuePdf(id: number, payload: { exportDate: string; staffId: number }) {
    return this.http.post(this.baseUrl + 'MaterialWithdrawalExport/' + id + '/pdf/issue', payload, { responseType: 'blob' });
  }

  issueProcurementPdf(id: number, payload: { exportDate: string; staffId: number }) {
    return this.http.post(this.baseUrl + 'MaterialWithdrawalExport/procurement/' + id + '/pdf/issue', payload, { responseType: 'blob' });
  }

  createMaterialWithdrawal(payload: Partial<MaterialWithdrawalCreateTypes>) {
    return this.http.post<void>(this.baseUrl + 'MaterialWithdrawal/with-items', payload);
  }

  getAvailableItems(procurementRecordId: number) {
    return this.http.get<import('../interface/materialWithdrawalTypes').MaterialWithdrawalItemTypes[]>(
      this.baseUrl + 'MaterialWithdrawal/available/' + procurementRecordId,
    );
  }

  getWithdrawalItems(withdrawalId: number) {
    return this.http.get<MaterialWithdrawalDisplayItemTypes[]>(
      this.baseUrl + 'MaterialWithdrawal/' + withdrawalId + '/items',
    );
  }

  updateMaterialWithdrawal(id: number, payload: Partial<MaterialWithdrawalCreateTypes>) {
    return this.http.put<void>(this.baseUrl + 'MaterialWithdrawal/' + id + '/with-items', payload);
  }

  getImpact(id: number) {
    return this.http.get<MaterialWithdrawalImpact>(this.baseUrl + 'MaterialWithdrawal/' + id + '/impact');
  }

  getRevisions(id: number) {
    return this.http.get<MaterialWithdrawalRevision[]>(this.baseUrl + 'MaterialWithdrawal/' + id + '/revisions');
  }

  adjustWithdrawal(id: number, items: Array<{ receive_detail_id: number; material_item_id: number; quantity: number }>, reason: string) {
    return this.http.post<void>(this.baseUrl + 'MaterialWithdrawal/' + id + '/adjust', { items, reason });
  }

  cancelPostedWithdrawal(id: number, reason: string) {
    return this.http.post<void>(this.baseUrl + 'MaterialWithdrawal/' + id + '/cancel', { reason });
  }

  deleteMaterialWithdrawal(id: number) {
    return this.http.delete<void>(this.baseUrl + 'MaterialWithdrawal/' + id);
  }
}
