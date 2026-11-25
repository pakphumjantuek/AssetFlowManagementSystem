import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

export interface DisposalSummary { asset_id: number; status: string; disposal_status: string; disposed_count: number; sub_item_count: number; }
export interface DisposalDocument { disposal_document_id: number; asset_sub_item_id: number | null; disposal_date: string; document_no: string | null; notes: string | null; original_filename: string; created_at: string; affected_count: number; }

@Injectable({ providedIn: 'root' })
export class AssetDisposalService {
  private http = inject(HttpClient);
  private url = environment.baseUrl + 'AssetDisposal/';
  summary(procurementId?: number, assetId?: number) {
    let params = new HttpParams();
    if (procurementId) params = params.set('procurement_record_id', procurementId);
    if (assetId) params = params.set('asset_id', assetId);
    return this.http.get<DisposalSummary[]>(this.url + 'summary', { params });
  }
  documents(assetId: number, subId: number | null) {
    const params = subId ? new HttpParams().set('asset_sub_item_id', subId) : new HttpParams();
    return this.http.get<DisposalDocument[]>(this.url + assetId + '/documents', { params });
  }
  upload(assetId: number, subId: number | null, file: File, date: string, number: string, notes: string) {
    const form = new FormData();
    form.append('file', file);
    form.append('disposal_date', date);
    if (subId) form.append('asset_sub_item_id', String(subId));
    form.append('document_no', number);
    form.append('notes', notes);
    return this.http.post(this.url + assetId + '/documents', form);
  }
  download(id: number) { return this.http.get(this.url + 'documents/' + id + '/file', { responseType: 'blob' }); }
  legacyDisposal(subId: number) { return this.http.get<{ disposal_date: string; disposal_method: string; disposal_reason: string | null; notes: string | null }>(environment.baseUrl + 'AssetsubItem/' + subId + '/disposal'); }
}
