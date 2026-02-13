import type { Knex } from 'knex';
import { db } from '../db/knex';
import { env } from '../config/env';
import { ApiError } from '../utils/apiError';
import { nowIso } from '../utils/time';
import { projectOnHand, validateTransferWarehouses } from './inventoryDomain';
import type {
  BusinessRow,
  FactoryRow,
  InventoryDirection,
  InventoryTransactionType,
  PlantRow,
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

interface CreateBusinessInput {
  code: string;
  name: string;
  city?: string | null;
  isActive?: boolean;
}

interface UpdateBusinessInput {
  code?: string;
  name?: string;
  city?: string | null;
  isActive?: boolean;
}

interface CreateFactoryInput {
  businessId: number;
  code: string;
  name: string;
  city?: string | null;
  isActive?: boolean;
}

interface UpdateFactoryInput {
  businessId?: number;
  code?: string;
  name?: string;
  city?: string | null;
  isActive?: boolean;
}

interface CreateFacilityInput {
  factoryId: number;
  code: string;
  name: string;
  city?: string | null;
  isActive?: boolean;
}

interface UpdateFacilityInput {
  factoryId?: number;
  code?: string;
  name?: string;
  city?: string | null;
  isActive?: boolean;
}

interface CreatePlantInput {
  businessId?: number;
  factoryId?: number;
  code: string;
  name: string;
  city?: string | null;
  isActive?: boolean;
}

interface UpdatePlantInput {
  businessId?: number;
  factoryId?: number;
  code?: string;
  name?: string;
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

const mapBusiness = (row: BusinessRow) => ({
  id: row.id,
  code: row.code,
  name: row.name,
  city: row.city,
  isActive: row.is_active,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const mapFactory = (
  row: FactoryRow & {
    business_name?: string | null;
    business_code?: string | null;
  }
) => ({
  id: row.id,
  businessId: row.business_id,
  businessCode: row.business_code ?? null,
  businessName: row.business_name ?? null,
  code: row.code,
  name: row.name,
  city: row.city,
  isActive: row.is_active,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const mapFacility = (
  row: PlantRow & {
    business_name?: string | null;
    business_code?: string | null;
    factory_name?: string | null;
    factory_code?: string | null;
  }
) => ({
  id: row.id,
  businessId: row.business_id,
  businessCode: row.business_code ?? null,
  businessName: row.business_name ?? null,
  factoryId: row.factory_id,
  factoryCode: row.factory_code ?? null,
  factoryName: row.factory_name ?? null,
  code: row.code,
  name: row.name,
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

const getBusinessOrThrow = async (
  trx: Knex | Knex.Transaction,
  businessId: number
): Promise<BusinessRow> => {
  const business = await trx<BusinessRow>('businesses').where({ id: businessId }).first();
  if (!business) {
    throw new ApiError(404, 'Business not found');
  }
  return business;
};

const getFactoryOrThrow = async (
  trx: Knex | Knex.Transaction,
  factoryId: number
): Promise<FactoryRow> => {
  const factory = await trx<FactoryRow>('factories').where({ id: factoryId }).first();
  if (!factory) {
    throw new ApiError(404, 'Factory not found');
  }
  return factory;
};

const getFirstFactoryByBusinessOrThrow = async (
  trx: Knex | Knex.Transaction,
  businessId: number
): Promise<FactoryRow> => {
  const factory = await trx<FactoryRow>('factories').where({ business_id: businessId, is_active: true }).orderBy('id', 'asc').first();
  if (!factory) {
    throw new ApiError(400, 'No active factory found for the given business');
  }
  return factory;
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

  async listBusinesses() {
    const rows = await db<BusinessRow>('businesses').orderBy('name', 'asc');
    return rows.map(mapBusiness);
  },

  async createBusiness(input: CreateBusinessInput) {
    const timestamp = nowIso();
    try {
      const [row] = await db<BusinessRow>('businesses')
        .insert({
          code: input.code.trim(),
          name: input.name.trim(),
          city: input.city?.trim() || null,
          is_active: input.isActive ?? true,
          created_at: timestamp,
          updated_at: timestamp
        })
        .returning('*');
      return mapBusiness(row);
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new ApiError(409, 'Business code already exists');
      }
      throw error;
    }
  },

  async updateBusiness(businessId: number, input: UpdateBusinessInput) {
    const payload: Record<string, unknown> = { updated_at: nowIso() };
    if (input.code !== undefined) payload.code = input.code.trim();
    if (input.name !== undefined) payload.name = input.name.trim();
    if (input.city !== undefined) payload.city = input.city?.trim() || null;
    if (input.isActive !== undefined) payload.is_active = input.isActive;

    try {
      const [row] = await db<BusinessRow>('businesses').where({ id: businessId }).update(payload).returning('*');
      if (!row) throw new ApiError(404, 'Business not found');
      return mapBusiness(row);
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new ApiError(409, 'Business code already exists');
      }
      throw error;
    }
  },

  async deactivateBusiness(businessId: number) {
    const [row] = await db<BusinessRow>('businesses')
      .where({ id: businessId })
      .update({ is_active: false, updated_at: nowIso() })
      .returning('*');
    if (!row) throw new ApiError(404, 'Business not found');
    return mapBusiness(row);
  },

  async listFactories() {
    const rows = await db<FactoryRow>('factories')
      .leftJoin('businesses', 'factories.business_id', 'businesses.id')
      .select(
        'factories.id',
        'factories.business_id',
        'factories.code',
        'factories.name',
        'factories.city',
        'factories.is_active',
        'factories.created_at',
        'factories.updated_at',
        'businesses.name as business_name',
        'businesses.code as business_code'
      )
      .orderBy('factories.name', 'asc');
    return rows.map((row) => mapFactory(row as FactoryRow & { business_name?: string | null; business_code?: string | null }));
  },

  async createFactory(input: CreateFactoryInput) {
    const timestamp = nowIso();
    try {
      await getBusinessOrThrow(db, input.businessId);
      const [row] = await db<FactoryRow>('factories')
        .insert({
          business_id: input.businessId,
          code: input.code.trim(),
          name: input.name.trim(),
          city: input.city?.trim() || null,
          is_active: input.isActive ?? true,
          created_at: timestamp,
          updated_at: timestamp
        })
        .returning('*');
      return mapFactory(row);
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new ApiError(409, 'Factory code already exists');
      }
      throw error;
    }
  },

  async updateFactory(factoryId: number, input: UpdateFactoryInput) {
    const payload: Record<string, unknown> = { updated_at: nowIso() };
    if (input.businessId !== undefined) {
      await getBusinessOrThrow(db, input.businessId);
      payload.business_id = input.businessId;
    }
    if (input.code !== undefined) payload.code = input.code.trim();
    if (input.name !== undefined) payload.name = input.name.trim();
    if (input.city !== undefined) payload.city = input.city?.trim() || null;
    if (input.isActive !== undefined) payload.is_active = input.isActive;

    try {
      const [row] = await db<FactoryRow>('factories').where({ id: factoryId }).update(payload).returning('*');
      if (!row) throw new ApiError(404, 'Factory not found');
      return mapFactory(row);
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new ApiError(409, 'Factory code already exists');
      }
      throw error;
    }
  },

  async deactivateFactory(factoryId: number) {
    const [row] = await db<FactoryRow>('factories')
      .where({ id: factoryId })
      .update({ is_active: false, updated_at: nowIso() })
      .returning('*');
    if (!row) throw new ApiError(404, 'Factory not found');
    return mapFactory(row);
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

  async listFacilities() {
    const rows = await db<PlantRow>('plants')
      .leftJoin('businesses', 'plants.business_id', 'businesses.id')
      .leftJoin('factories', 'plants.factory_id', 'factories.id')
      .select(
        'plants.id',
        'plants.business_id',
        'plants.factory_id',
        'plants.code',
        'plants.name',
        'plants.city',
        'plants.is_active',
        'plants.created_at',
        'plants.updated_at',
        'businesses.name as business_name',
        'businesses.code as business_code',
        'factories.name as factory_name',
        'factories.code as factory_code'
      )
      .orderBy('plants.name', 'asc');
    return rows.map((row) =>
      mapFacility(
        row as PlantRow & {
          business_name?: string | null;
          business_code?: string | null;
          factory_name?: string | null;
          factory_code?: string | null;
        }
      )
    );
  },

  async createFacility(input: CreateFacilityInput) {
    const timestamp = nowIso();
    try {
      const factory = await getFactoryOrThrow(db, input.factoryId);
      const [row] = await db<PlantRow>('plants')
        .insert({
          business_id: factory.business_id,
          factory_id: factory.id,
          code: input.code.trim(),
          name: input.name.trim(),
          city: input.city?.trim() || null,
          is_active: input.isActive ?? true,
          created_at: timestamp,
          updated_at: timestamp
        })
        .returning('*');
      return mapFacility(row as PlantRow);
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new ApiError(409, 'Facility code already exists');
      }
      throw error;
    }
  },

  async updateFacility(facilityId: number, input: UpdateFacilityInput) {
    const payload: Record<string, unknown> = { updated_at: nowIso() };
    if (input.factoryId !== undefined) {
      const factory = await getFactoryOrThrow(db, input.factoryId);
      payload.factory_id = factory.id;
      payload.business_id = factory.business_id;
    }
    if (input.code !== undefined) payload.code = input.code.trim();
    if (input.name !== undefined) payload.name = input.name.trim();
    if (input.city !== undefined) payload.city = input.city?.trim() || null;
    if (input.isActive !== undefined) payload.is_active = input.isActive;

    try {
      const [row] = await db<PlantRow>('plants').where({ id: facilityId }).update(payload).returning('*');
      if (!row) throw new ApiError(404, 'Facility not found');
      return mapFacility(row as PlantRow);
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new ApiError(409, 'Facility code already exists');
      }
      throw error;
    }
  },

  async deactivateFacility(facilityId: number) {
    const [row] = await db<PlantRow>('plants')
      .where({ id: facilityId })
      .update({ is_active: false, updated_at: nowIso() })
      .returning('*');
    if (!row) throw new ApiError(404, 'Facility not found');
    return mapFacility(row as PlantRow);
  },

  // Backward compatibility aliases for previous "plant" naming.
  async listPlants() {
    return this.listFacilities();
  },

  async createPlant(input: CreatePlantInput) {
    let factoryId = input.factoryId;
    if (!factoryId) {
      if (!input.businessId) {
        throw new ApiError(400, 'factoryId is required');
      }
      const factory = await getFirstFactoryByBusinessOrThrow(db, input.businessId);
      factoryId = factory.id;
    }

    return this.createFacility({
      factoryId,
      code: input.code,
      name: input.name,
      city: input.city,
      isActive: input.isActive
    });
  },

  async updatePlant(plantId: number, input: UpdatePlantInput) {
    let factoryId = input.factoryId;
    if (!factoryId && input.businessId) {
      const factory = await getFirstFactoryByBusinessOrThrow(db, input.businessId);
      factoryId = factory.id;
    }

    return this.updateFacility(plantId, {
      factoryId,
      code: input.code,
      name: input.name,
      city: input.city,
      isActive: input.isActive
    });
  },

  async deactivatePlant(plantId: number) {
    return this.deactivateFacility(plantId);
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
