import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

export interface StaffDashboardFiscalYear {
  fiscal_year_id: number;
  fiscal_year: number;
  year_name?: string | null;
}

export interface StaffDashboardSummary {
  staff_id: number;
  full_name: string;
  department_name?: string | null;
  procurement_count: number;
  project_count: number;
  material_withdrawal_count: number;
  asset_withdrawal_count: number;
  asset_holding_count: number;
}

export interface StaffDashboardProcurement {
  procurement_record_id: number;
  project_id: number;
  project_code: string;
  project_name: string;
  document_no: string;
  document_date?: string | null;
  status: string;
  total_amount: number;
  department_name?: string | null;
  expense_type_name: string;
  category: string;
  material_issue_count: number;
  asset_item_count: number;
  asset_sub_item_count: number;
  hire_detail_count: number;
}

export interface StaffDashboardAsset {
  asset_id: number;
  procurement_withdrawal_id: number;
  procurement_record_id: number;
  project_id: number;
  project_code: string;
  project_name: string;
  document_no: string;
  withdrawal_document_no: string;
  withdrawal_date: string;
  asset_name: string;
  receive_date: string;
  storage_location?: string | null;
  running_start_no?: number | null;
  running_end_no?: number | null;
  fiscal_asset_year?: number | null;
  sub_item_count: number;
  history_count: number;
  repair_count: number;
}

export interface StaffDashboardAssetRepair {
  asset_repair_id: number;
  procurement_withdrawal_id: number;
  repair_document_no: string;
  repair_date: string;
  status: string;
  problem_description?: string | null;
  repair_shop_name?: string | null;
  repair_cost?: number | null;
  asset_names: string;
  project_code: string;
}

export interface StaffDashboardHire {
  procurement_record_id: number;
  document_no: string;
  document_date?: string | null;
  project_code: string;
  project_name: string;
  vendor_name: string;
  status: string;
  total_amount: number;
  hire_names: string[];
  hire_items: StaffDashboardHireItem[];
}

export interface StaffDashboardHireItem {
  hire_detail_id: number;
  item_no: number;
  hire_name: string;
  quantity: number;
  unit_price: number;
  total_amount: number;
  operation_reason?: string | null;
  remark?: string | null;
}

export interface StaffDashboardMaterialWithdrawal {
  stock_card_id: number;
  department_id: number | null;
  issue_detail_id: number;
  procurement_record_id: number;
  material_item_id: number;
  project_id: number;
  project_code: string;
  project_name: string;
  document_no: string;
  document_date?: string | null;
  withdrawal_document_no: string;
  issue_date?: string | null;
  material_code: string;
  material_name: string;
  unit_name?: string | null;
  quantity: number;
  unit_price: number;
  total_amount?: number | null;
  remark?: string | null;
}

export interface StaffDashboardLookup {
  staff_id: number;
  full_name: string;
  department_name?: string | null;
}

@Injectable({ providedIn: 'root' })
export class StaffDashboardService {
  private http = inject(HttpClient);
  private baseUrl = environment.baseUrl + 'PublicPortal/';

  getFiscalYears(staffId: number) {
    return this.http.get<StaffDashboardFiscalYear[]>(`${this.baseUrl}staffs/${staffId}/fiscal-years`);
  }

  getSummary(staffId: number, fiscalYearId: number | null) {
    return this.http.get<StaffDashboardSummary>(`${this.baseUrl}staffs/${staffId}/summary`, {
      params: this.fiscalYearParams(fiscalYearId),
    });
  }

  getProcurements(staffId: number, fiscalYearId: number | null) {
    return this.http.get<StaffDashboardProcurement[]>(`${this.baseUrl}staffs/${staffId}/procurements`, {
      params: this.fiscalYearParams(fiscalYearId),
    });
  }

  getInspectedProcurements(staffId: number, fiscalYearId: number | null) {
    return this.http.get<StaffDashboardProcurement[]>(
      `${this.baseUrl}staffs/${staffId}/inspected-procurements`,
      { params: this.fiscalYearParams(fiscalYearId) },
    );
  }

  getMaterialWithdrawals(staffId: number, fiscalYearId: number | null) {
    return this.http.get<StaffDashboardMaterialWithdrawal[]>(
      `${this.baseUrl}staffs/${staffId}/material-withdrawals`,
      { params: this.fiscalYearParams(fiscalYearId) },
    );
  }

  getAssets(staffId: number, fiscalYearId: number | null) {
    return this.http.get<StaffDashboardAsset[]>(`${this.baseUrl}staffs/${staffId}/assets`, {
      params: this.fiscalYearParams(fiscalYearId),
    });
  }

  getAssetRepairs(staffId: number, fiscalYearId: number | null) {
    return this.http.get<StaffDashboardAssetRepair[]>(`${this.baseUrl}staffs/${staffId}/asset-repairs`, {
      params: this.fiscalYearParams(fiscalYearId),
    });
  }

  getHires(staffId: number, fiscalYearId: number | null) {
    return this.http.get<StaffDashboardHire[]>(`${this.baseUrl}staffs/${staffId}/hires`, {
      params: this.fiscalYearParams(fiscalYearId),
    });
  }

  private fiscalYearParams(fiscalYearId: number | null) {
    return fiscalYearId ? new HttpParams().set('fiscalYearId', fiscalYearId) : new HttpParams();
  }
}
