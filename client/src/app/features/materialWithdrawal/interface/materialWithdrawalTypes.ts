export interface MaterialWithdrawalTypes {
  material_withdrawal_id: number;
  withdrawal_number: number;
  material_receive_id?: string | null;
  receive_document_no?: string | null;
  withdrawal_document_no?: string | null;
  staff_id: number;
  staff_name?: string | null;
  items_summary?: string | null;
  stock_status?: string;
  stock_status_label?: string;
  procurement_record_id: number;
  remark?: string | null;
  withdrawal_date?: string | null;
  created_at?: string | null;
}

export interface MaterialWithdrawalCreateTypes {
  material_withdrawal_id: number;
  material_receive_id?: string | null;
  receive_document_no?: string | null;
  withdrawal_document_no?: string | null;
  staff_id: number;
  procurement_record_id: number;
  remark?: string | null;
  items?: MaterialWithdrawalItemTypes[];
}

export interface MaterialWithdrawalItemTypes {
  receive_detail_id: number;
  material_item_id: number;
  material_name?: string | null;
  received_quantity?: number;
  available_quantity?: number;
  quantity: number;
  unit_price?: number;
}

export interface MaterialWithdrawalDisplayItemTypes {
  receive_detail_id: number;
  material_item_id: number;
  material_name: string;
  quantity: number;
  unit_price: number;
}

export interface MaterialWithdrawalImpact {
  status: string;
  can_cancel: boolean;
  items: Array<{
    receive_detail_id: number;
    material_item_id: number;
    material_name: string;
    current_quantity: number;
    destination_balance: number;
    minimum_quantity: number;
  }>;
}

export interface MaterialWithdrawalRevision {
  revision_id: number;
  action: string;
  reason: string;
  actor_id?: string | null;
  created_at: string;
  before_items_json: string;
  after_items_json: string;
}
