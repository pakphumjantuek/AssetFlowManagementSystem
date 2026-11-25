export interface materialItemsTypes {
  material_item_id: number;
  material_code: string;
  material_name: string;
  specification: string;
  unit_id: number | null;
  unit_name?: string;
  fund_category_id?: number | null;
  fund_name?: string | null;
  opening_balance: number;
  quantity_in: number;
  quantity_out: number;
  current_balance: number;
  unit_price: number;
  total_amount: number;
  remark: string;
  min_stock: number;
}

export interface CentralMaterialRow {
  receive_detail_id: number;
  procurement_record_id: number;
  document_no: string;
  fiscal_year_id: number;
  material_item_id: number;
  quantity: number;
  quantity_out: number;
  current_balance: number;
  unit_price: number;
}

export interface CentralMaterialItem extends materialItemsTypes {
  rows: CentralMaterialRow[];
  has_unassigned_outgoing: boolean;
}

export interface CentralMaterialResponse {
  items: CentralMaterialItem[];
  unassigned: Array<{ procurement_record_id: number; material_item_id: number; quantity: number }>;
}
