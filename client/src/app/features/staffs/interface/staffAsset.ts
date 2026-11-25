export interface StaffAsset {
  asset_id: number;
  asset_code?: string;
  procurement_withdrawal_id: number;
  procurement_record_id: number;
  project_code: string;
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
}
