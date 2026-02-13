import type { Knex } from 'knex';
import { db } from '../db/knex';
import { env } from '../config/env';
import { ApiError } from '../utils/apiError';
import { nowIso } from '../utils/time';
import { projectOnHand, validateTransferWarehouses } from './inventoryDomain';
import type {
  InventoryDirection,
  InventoryTransactionType,
  OrganizationRow,
  OrganizationUnitRow,
  ProductRow,
  StockTransactionRow,
  WarehouseRow
} from '../types/inventory';

interface CreateProductInput {
  sku: string;
  name: string;
  unit: string;
  category?: string | null;
  barcode?: string | null;
  minStock?: number;
  isActive?: boolean;
}

interface CreateWarehouseInput {
  name: string;
  code: string;
}

interface CreateOrganizationInput {
  code: string;
  name: string;
  city?: string | null;
  isActive?: boolean;
}

interface UpdateOrganizationInput {
  code?: string;
  name?: string;
  city?: string | null;
  isActive?: boolean;
}

interface CreateOrganizationUnitInput {
  organizationId: number;
  parentUnitId?: number | null;
  code: string;
  name: string;
  kind?: string | null;
  city?: string | null;
  isActive?: boolean;
}

interface UpdateOrganizationUnitInput {
  organizationId?: number;
  parentUnitId?: number | null;
  code?: string;
  name?: string;
  kind?: string | null;
  city?: string | null;
  isActive?: boolean;
}

interface CreateStockTransactionInput {
  productId: number;
  warehouseId: number;
  type: 'IN' | 'OUT' | 'ADJUST';
  quantity: number;
  adjustDirection?: InventoryDirection;
  referenceType?: string | null;
  referenceId?: string | null;
  note?: string | null;
  createdBy: string;
}

interface CreateTransferInput {
  productId: number;
  sourceWarehouseId: number;
  destinationWarehouseId: number;
  quantity: number;
  referenceType?: string | null;
  referenceId?: string | null;
  note?: string | null;
  createdBy: string;
}

interface LedgerFilters {
  productId?: number;
  warehouseId?: number;
  from?: string;
  to?: string;
}

interface OnHandFilters {
  productId?: number;
  warehouseId?: number;
}

export interface OnHandRow {
  productId: number;
  warehouseId: number;
  quantityOnHand: number;
}

const mapProduct = (row: ProductRow) => ({
  id: row.id,
  sku: row.sku,
  name: row.name,
  unit: row.unit,
  category: row.category,
  barcode: row.barcode,
  minStock: Number(row.min_stock),
  isActive: row.is_active,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const mapWarehouse = (row: WarehouseRow) => ({
  id: row.id,
  name: row.name,
  code: row.code,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const mapOrganization = (row: OrganizationRow) => ({
  id: row.id,
  code: row.code,
  name: row.name,
  city: row.city,
  isActive: row.is_active,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const mapOrganizationUnit = (
  row: OrganizationUnitRow & {
    organization_name?: string | null;
    organization_code?: string | null;
    parent_name?: string | null;
    parent_code?: string | null;
  }
) => ({
  id: row.id,
  organizationId: row.organization_id,
  organizationCode: row.organization_code ?? null,
  organizationName: row.organization_name ?? null,
  parentUnitId: row.parent_unit_id,
  parentCode: row.parent_code ?? null,
  parentName: row.parent_name ?? null,
  code: row.code,
  name: row.name,
  kind: row.kind,
  city: row.city,
  isActive: row.is_active,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const mapStockTransaction = (row: StockTransactionRow) => ({
  id: row.id,
  productId: row.product_id,
  warehouseId: row.warehouse_id,
  type: row.type,
  direction: row.direction,
  quantity: Number(row.quantity),
  unit: row.unit,
  referenceType: row.reference_type,
  referenceId: row.reference_id,
  note: row.note,
  createdBy: row.created_by,
  createdAt: row.created_at
});

const getProductOrThrow = async (trx: Knex | Knex.Transaction, productId: number): Promise<ProductRow> => {
  const product = await trx<ProductRow>('products').where({ id: productId, is_active: true }).first();
  if (!product) {
    throw new ApiError(404, 'Product not found');
  }
  return product;
};

const getWarehouseOrThrow = async (
  trx: Knex | Knex.Transaction,
  warehouseId: number
): Promise<WarehouseRow> => {
  const warehouse = await trx<WarehouseRow>('warehouses').where({ id: warehouseId }).first();
  if (!warehouse) {
    throw new ApiError(404, 'Warehouse not found');
  }
  return warehouse;
};

const getOrganizationOrThrow = async (
  trx: Knex | Knex.Transaction,
  organizationId: number
): Promise<OrganizationRow> => {
  const organization = await trx<OrganizationRow>('organizations').where({ id: organizationId }).first();
  if (!organization) {
    throw new ApiError(404, 'Organization not found');
  }
  return organization;
};

const getOrganizationUnitOrThrow = async (
  trx: Knex | Knex.Transaction,
  unitId: number
): Promise<OrganizationUnitRow> => {
  const unit = await trx<OrganizationUnitRow>('organization_units').where({ id: unitId }).first();
  if (!unit) {
    throw new ApiError(404, 'Organization unit not found');
  }
  return unit;
};

const rawOnHand = (trx: Knex | Knex.Transaction, productId: number, warehouseId: number) =>
  trx<StockTransactionRow>('stock_transactions')
    .where({ product_id: productId, warehouse_id: warehouseId })
    .sum<{ quantity_on_hand: string }[]>({
      quantity_on_hand: trx.raw("CASE WHEN direction = 'IN' THEN quantity WHEN direction = 'OUT' THEN -quantity ELSE 0 END")
    });

const getOnHandForProductWarehouse = async (
  trx: Knex | Knex.Transaction,
  productId: number,
  warehouseId: number
): Promise<number> => {
  const [aggregate] = await rawOnHand(trx, productId, warehouseId);
  return Number(aggregate?.quantity_on_hand ?? 0);
};

const ensureNonNegative = async (
  trx: Knex | Knex.Transaction,
  productId: number,
  warehouseId: number,
  quantityToDeduct: number
): Promise<void> => {
  const onHand = await getOnHandForProductWarehouse(trx, productId, warehouseId);
  projectOnHand(onHand, 'OUT', quantityToDeduct, env.allowNegativeStock);
};

const resolveDirection = (
  type: CreateStockTransactionInput['type'],
  adjustDirection?: InventoryDirection
): InventoryDirection => {
  if (type === 'IN') {
    return 'IN';
  }
  if (type === 'OUT') {
    return 'OUT';
  }
  if (!adjustDirection) {
    throw new ApiError(400, 'adjustDirection is required when type is ADJUST');
  }
  return adjustDirection;
};

export const inventoryService = {
  async listProducts() {
    const rows = await db<ProductRow>('products').orderBy('name', 'asc');
    return rows.map(mapProduct);
  },

  async createProduct(input: CreateProductInput) {
    const timestamp = nowIso();
    try {
      const [row] = await db<ProductRow>('products')
        .insert({
          sku: input.sku.trim(),
          name: input.name.trim(),
          unit: input.unit.trim(),
          category: input.category?.trim() || null,
          barcode: input.barcode?.trim() || null,
          min_stock: String(input.minStock ?? 0),
          is_active: input.isActive ?? true,
          created_at: timestamp,
          updated_at: timestamp
        })
        .returning('*');
      return mapProduct(row);
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new ApiError(409, 'SKU already exists');
      }
      throw error;
    }
  },

  async listOrganizations() {
    const rows = await db<OrganizationRow>('organizations').orderBy('name', 'asc');
    return rows.map(mapOrganization);
  },

  async createOrganization(input: CreateOrganizationInput) {
    const timestamp = nowIso();
    try {
      const [row] = await db<OrganizationRow>('organizations')
        .insert({
          code: input.code.trim(),
          name: input.name.trim(),
          city: input.city?.trim() || null,
          is_active: input.isActive ?? true,
          created_at: timestamp,
          updated_at: timestamp
        })
        .returning('*');
      return mapOrganization(row);
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new ApiError(409, 'Organization code already exists');
      }
      throw error;
    }
  },

  async updateOrganization(organizationId: number, input: UpdateOrganizationInput) {
    const payload: Record<string, unknown> = { updated_at: nowIso() };
    if (input.code !== undefined) payload.code = input.code.trim();
    if (input.name !== undefined) payload.name = input.name.trim();
    if (input.city !== undefined) payload.city = input.city?.trim() || null;
    if (input.isActive !== undefined) payload.is_active = input.isActive;

    try {
      const [row] = await db<OrganizationRow>('organizations')
        .where({ id: organizationId })
        .update(payload)
        .returning('*');
      if (!row) throw new ApiError(404, 'Organization not found');
      return mapOrganization(row);
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new ApiError(409, 'Organization code already exists');
      }
      throw error;
    }
  },

  async deactivateOrganization(organizationId: number) {
    const [row] = await db<OrganizationRow>('organizations')
      .where({ id: organizationId })
      .update({ is_active: false, updated_at: nowIso() })
      .returning('*');
    if (!row) throw new ApiError(404, 'Organization not found');
    return mapOrganization(row);
  },

  async listOrganizationUnits() {
    const rows = await db<OrganizationUnitRow>('organization_units')
      .leftJoin('organizations', 'organization_units.organization_id', 'organizations.id')
      .leftJoin('organization_units as parent', 'organization_units.parent_unit_id', 'parent.id')
      .select(
        'organization_units.id',
        'organization_units.organization_id',
        'organization_units.parent_unit_id',
        'organization_units.code',
        'organization_units.name',
        'organization_units.kind',
        'organization_units.city',
        'organization_units.is_active',
        'organization_units.created_at',
        'organization_units.updated_at',
        'organizations.name as organization_name',
        'organizations.code as organization_code',
        'parent.name as parent_name',
        'parent.code as parent_code'
      )
      .orderBy('organization_units.name', 'asc');

    return rows.map((row) =>
      mapOrganizationUnit(
        row as OrganizationUnitRow & {
          organization_name?: string | null;
          organization_code?: string | null;
          parent_name?: string | null;
          parent_code?: string | null;
        }
      )
    );
  },

  async createOrganizationUnit(input: CreateOrganizationUnitInput) {
    const timestamp = nowIso();
    try {
      const organization = await getOrganizationOrThrow(db, input.organizationId);
      let parentUnitId: number | null = null;

      if (input.parentUnitId) {
        const parent = await getOrganizationUnitOrThrow(db, input.parentUnitId);
        if (parent.organization_id !== organization.id) {
          throw new ApiError(400, 'parentUnitId must belong to the same organization');
        }
        parentUnitId = parent.id;
      }

      const [row] = await db<OrganizationUnitRow>('organization_units')
        .insert({
          organization_id: organization.id,
          parent_unit_id: parentUnitId,
          code: input.code.trim(),
          name: input.name.trim(),
          kind: input.kind?.trim() || null,
          city: input.city?.trim() || null,
          is_active: input.isActive ?? true,
          created_at: timestamp,
          updated_at: timestamp
        })
        .returning('*');
      return mapOrganizationUnit(row);
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new ApiError(409, 'Organization unit code already exists');
      }
      throw error;
    }
  },

  async updateOrganizationUnit(unitId: number, input: UpdateOrganizationUnitInput) {
    const current = await getOrganizationUnitOrThrow(db, unitId);

    const payload: Record<string, unknown> = { updated_at: nowIso() };

    let targetOrganizationId = current.organization_id;
    if (input.organizationId !== undefined) {
      const organization = await getOrganizationOrThrow(db, input.organizationId);
      payload.organization_id = organization.id;
      targetOrganizationId = organization.id;
    }

    if (input.parentUnitId !== undefined) {
      if (input.parentUnitId === null) {
        payload.parent_unit_id = null;
      } else {
        if (input.parentUnitId === unitId) {
          throw new ApiError(400, 'parentUnitId cannot be the same as unit id');
        }
        const parent = await getOrganizationUnitOrThrow(db, input.parentUnitId);
        if (parent.organization_id !== targetOrganizationId) {
          throw new ApiError(400, 'parentUnitId must belong to the same organization');
        }
        payload.parent_unit_id = parent.id;
      }
    }

    if (input.code !== undefined) payload.code = input.code.trim();
    if (input.name !== undefined) payload.name = input.name.trim();
    if (input.kind !== undefined) payload.kind = input.kind?.trim() || null;
    if (input.city !== undefined) payload.city = input.city?.trim() || null;
    if (input.isActive !== undefined) payload.is_active = input.isActive;

    try {
      const [row] = await db<OrganizationUnitRow>('organization_units')
        .where({ id: unitId })
        .update(payload)
        .returning('*');
      if (!row) throw new ApiError(404, 'Organization unit not found');
      return mapOrganizationUnit(row);
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new ApiError(409, 'Organization unit code already exists');
      }
      throw error;
    }
  },

  async deactivateOrganizationUnit(unitId: number) {
    const [row] = await db<OrganizationUnitRow>('organization_units')
      .where({ id: unitId })
      .update({ is_active: false, updated_at: nowIso() })
      .returning('*');
    if (!row) throw new ApiError(404, 'Organization unit not found');
    return mapOrganizationUnit(row);
  },

  async listWarehouses() {
    const rows = await db<WarehouseRow>('warehouses').orderBy('name', 'asc');
    return rows.map(mapWarehouse);
  },

  async createWarehouse(input: CreateWarehouseInput) {
    const timestamp = nowIso();
    try {
      const [row] = await db<WarehouseRow>('warehouses')
        .insert({
          name: input.name.trim(),
          code: input.code.trim(),
          created_at: timestamp,
          updated_at: timestamp
        })
        .returning('*');
      return mapWarehouse(row);
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new ApiError(409, 'Warehouse code already exists');
      }
      throw error;
    }
  },

  async createStockTransaction(input: CreateStockTransactionInput) {
    return db.transaction(async (trx) => {
      const product = await getProductOrThrow(trx, input.productId);
      await getWarehouseOrThrow(trx, input.warehouseId);

      const direction = resolveDirection(input.type, input.adjustDirection);
      if (direction === 'OUT') {
        await ensureNonNegative(trx, input.productId, input.warehouseId, input.quantity);
      }

      const [row] = await trx<StockTransactionRow>('stock_transactions')
        .insert({
          product_id: input.productId,
          warehouse_id: input.warehouseId,
          type: input.type,
          direction,
          quantity: String(input.quantity),
          unit: product.unit,
          reference_type: input.referenceType?.trim() || null,
          reference_id: input.referenceId?.trim() || null,
          note: input.note?.trim() || null,
          created_by: input.createdBy,
          created_at: nowIso()
        })
        .returning('*');

      const onHand = await getOnHandForProductWarehouse(trx, input.productId, input.warehouseId);

      return {
        transaction: mapStockTransaction(row),
        onHand
      };
    });
  },

  async createTransfer(input: CreateTransferInput) {
    validateTransferWarehouses(input.sourceWarehouseId, input.destinationWarehouseId);

    return db.transaction(async (trx) => {
      const product = await getProductOrThrow(trx, input.productId);
      await getWarehouseOrThrow(trx, input.sourceWarehouseId);
      await getWarehouseOrThrow(trx, input.destinationWarehouseId);

      await ensureNonNegative(trx, input.productId, input.sourceWarehouseId, input.quantity);
      const createdAt = nowIso();

      const rows = await trx<StockTransactionRow>('stock_transactions')
        .insert([
          {
            product_id: input.productId,
            warehouse_id: input.sourceWarehouseId,
            type: 'TRANSFER',
            direction: 'OUT',
            quantity: String(input.quantity),
            unit: product.unit,
            reference_type: input.referenceType?.trim() || 'TRANSFER',
            reference_id: input.referenceId?.trim() || null,
            note: input.note?.trim() || null,
            created_by: input.createdBy,
            created_at: createdAt
          },
          {
            product_id: input.productId,
            warehouse_id: input.destinationWarehouseId,
            type: 'TRANSFER',
            direction: 'IN',
            quantity: String(input.quantity),
            unit: product.unit,
            reference_type: input.referenceType?.trim() || 'TRANSFER',
            reference_id: input.referenceId?.trim() || null,
            note: input.note?.trim() || null,
            created_by: input.createdBy,
            created_at: createdAt
          }
        ])
        .returning('*');

      const sourceOnHand = await getOnHandForProductWarehouse(trx, input.productId, input.sourceWarehouseId);
      const destinationOnHand = await getOnHandForProductWarehouse(
        trx,
        input.productId,
        input.destinationWarehouseId
      );

      return {
        transactions: rows.map(mapStockTransaction),
        sourceOnHand,
        destinationOnHand
      };
    });
  },

  async getOnHand(filters: OnHandFilters): Promise<OnHandRow[]> {
    const query = db<StockTransactionRow>('stock_transactions')
      .select('product_id as productId', 'warehouse_id as warehouseId')
      .sum<{ quantityOnHand: string }[]>({
        quantityOnHand: db.raw("CASE WHEN direction = 'IN' THEN quantity WHEN direction = 'OUT' THEN -quantity ELSE 0 END")
      })
      .groupBy('product_id', 'warehouse_id');

    if (filters.productId) {
      query.where('product_id', filters.productId);
    }
    if (filters.warehouseId) {
      query.where('warehouse_id', filters.warehouseId);
    }

    const rows = (await query) as Array<{
      productId: string | number;
      warehouseId: string | number;
      quantityOnHand: string | number | null;
    }>;
    return rows.map((row) => ({
      productId: Number(row.productId),
      warehouseId: Number(row.warehouseId),
      quantityOnHand: Number(row.quantityOnHand ?? 0)
    }));
  },

  async getLedger(filters: LedgerFilters) {
    const query = db<StockTransactionRow>('stock_transactions')
      .leftJoin('products', 'stock_transactions.product_id', 'products.id')
      .leftJoin('warehouses', 'stock_transactions.warehouse_id', 'warehouses.id')
      .select(
        'stock_transactions.id',
        'stock_transactions.product_id',
        'stock_transactions.warehouse_id',
        'stock_transactions.type',
        'stock_transactions.direction',
        'stock_transactions.quantity',
        'stock_transactions.unit',
        'stock_transactions.reference_type',
        'stock_transactions.reference_id',
        'stock_transactions.note',
        'stock_transactions.created_by',
        'stock_transactions.created_at',
        'products.sku as product_sku',
        'products.name as product_name',
        'warehouses.code as warehouse_code',
        'warehouses.name as warehouse_name'
      )
      .orderBy('stock_transactions.created_at', 'desc');

    if (filters.productId) {
      query.where('stock_transactions.product_id', filters.productId);
    }
    if (filters.warehouseId) {
      query.where('stock_transactions.warehouse_id', filters.warehouseId);
    }
    if (filters.from) {
      query.where('stock_transactions.created_at', '>=', filters.from);
    }
    if (filters.to) {
      query.where('stock_transactions.created_at', '<=', filters.to);
    }

    const rows = await query;
    return rows.map((row) => ({
      id: row.id,
      productId: row.product_id,
      warehouseId: row.warehouse_id,
      type: row.type as InventoryTransactionType,
      direction: row.direction as InventoryDirection,
      quantity: Number(row.quantity),
      unit: row.unit,
      referenceType: row.reference_type,
      referenceId: row.reference_id,
      note: row.note,
      createdBy: row.created_by,
      createdAt: row.created_at,
      productSku: (row as { product_sku?: string | null }).product_sku ?? null,
      productName: (row as { product_name?: string | null }).product_name ?? null,
      warehouseCode: (row as { warehouse_code?: string | null }).warehouse_code ?? null,
      warehouseName: (row as { warehouse_name?: string | null }).warehouse_name ?? null
    }));
  }
};
