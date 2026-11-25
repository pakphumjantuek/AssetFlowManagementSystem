import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { Pagination } from '../../../shared/models/pagination';
import { Params } from '../../../shared/models/allType';
import {
  assetItemsTypes,
  assetItemsCreateTypes,
  assetItemsdetailsTypes,
  assetRegisterTypes,
  AssetRegisterFilters,
} from '../interface/assetItemsTypes';

@Injectable({
  providedIn: 'root',
})
export class AssetItemsService {
  private baseUrl = environment.baseUrl;
  private http = inject(HttpClient);

  getAssetRegister(paramsData: Params, departmentId?: number, custodianStaffId?: number) {
    let params = new HttpParams()
      .set('pageSize', paramsData.pageSize)
      .set('pageIndex', paramsData.pageNumber);
    if (paramsData.sort) params = params.set('sort', paramsData.sort);
    if (paramsData.search) params = params.set('search', paramsData.search);
    if (departmentId) params = params.set('departmentId', departmentId);
    if (custodianStaffId) params = params.set('custodianStaffId', custodianStaffId);
    return this.http.get<Pagination<assetRegisterTypes>>(this.baseUrl + 'AssetItem/register', {
      params,
    });
  }

  getAssetRegisterFilters() {
    return this.http.get<AssetRegisterFilters>(this.baseUrl + 'AssetItem/register/filters');
  }

  getAssetItems(paramsData: Params) {
    let params = new HttpParams();

    if (paramsData.sort) {
      params = params.append('sort', paramsData.sort);
    }

    if (paramsData.search) {
      params = params.append('search', paramsData.search);
    }

    params = params.append('pageSize', paramsData.pageSize);
    params = params.append('pageIndex', paramsData.pageNumber);

    return this.http.get<Pagination<assetItemsTypes>>(this.baseUrl + 'AssetItem', {
      params,
    });
  }

  getAssetItembyProcuremen(paramsData: Params, procurement_record_id: number) {
    let params = new HttpParams();

    if (paramsData.sort) {
      params = params.append('sort', paramsData.sort);
    }

    if (paramsData.search) {
      params = params.append('search', paramsData.search);
    }

    params = params.append('pageSize', paramsData.pageSize);
    params = params.append('pageIndex', paramsData.pageNumber);

    return this.http.get<Pagination<assetItemsTypes>>(
      this.baseUrl + 'AssetItem/by-procurement/' + procurement_record_id,
      { params },
    );
  }

  getAssetItem(id: number) {
    return this.http.get<assetItemsCreateTypes>(this.baseUrl + 'AssetItem/' + id);
  }
  getAssetItemDetails(id: number) {
    return this.http.get<assetItemsdetailsTypes>(this.baseUrl + 'AssetItem/details/' + id);
  }

  createAssetItems(payload: Partial<assetItemsCreateTypes>) {
    return this.http.post<void>(this.baseUrl + 'AssetItem', payload);
  }

  createAssetItemReturning(payload: Partial<assetItemsCreateTypes>) {
    return this.http.post<assetItemsCreateTypes>(this.baseUrl + 'AssetItem', payload);
  }

  updateAssetItems(id: number, payload: Partial<assetItemsCreateTypes>) {
    return this.http.put<void>(this.baseUrl + 'AssetItem/' + id, payload);
  }

  deleteAssetItems(id: number) {
    return this.http.delete<void>(this.baseUrl + 'AssetItem/' + id);
  }
}
