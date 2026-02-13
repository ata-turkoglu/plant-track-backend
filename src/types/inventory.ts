export type InventoryTransactionType = 'IN' | 'OUT' | 'TRANSFER' | 'ADJUST';
export type InventoryDirection = 'IN' | 'OUT';

export interface ProductRow {
  id: number;
  sku: string;
  name: string;
  unit: string;
  category: string | null;
  barcode: string | null;
  min_stock: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface WarehouseRow {
  id: number;
  name: string;
  code: string;
  created_at: string;
  updated_at: string;
}

export interface OrganizationRow {
  id: number;
  code: string;
  name: string;
  city: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface OrganizationUnitRow {
  id: number;
  organization_id: number;
  parent_unit_id: number | null;
  code: string;
  name: string;
  kind: string | null;
  city: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface StockTransactionRow {
  id: number;
  product_id: number;
  warehouse_id: number;
  type: InventoryTransactionType;
  direction: InventoryDirection;
  quantity: string;
  unit: string;
  reference_type: string | null;
  reference_id: string | null;
  note: string | null;
  created_by: string;
  created_at: string;
}
