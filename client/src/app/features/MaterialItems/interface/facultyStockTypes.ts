export interface FacultyDepartmentStock {
  department_id: number;
  department_name: string;
  opening_balance: number;
  quantity_in: number;
  quantity_out: number;
  current_balance: number;
}

export interface FacultyMaterialStock {
  material_item_id: number;
  material_code: string | null;
  material_name: string;
  specification: string | null;
  unit_name: string | null;
  fiscal_year_id: number | null;
  opening_balance: number;
  quantity_in: number;
  quantity_out: number;
  current_balance: number;
  unit_price: number | null;
  total_amount: number | null;
  department_balance: number;
  fiscal_year_mismatch_count: number;
  unknown_department_balance: number;
  has_discrepancy: boolean;
  valuation_available: boolean;
  departments: FacultyDepartmentStock[];
}

export interface FacultyStockResponse {
  fiscal_year_id: number | null;
  fiscal_year: number | null;
  start_date: string | null;
  end_date: string | null;
  items: FacultyMaterialStock[];
}
