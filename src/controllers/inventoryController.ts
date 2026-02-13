import type { Request, Response } from 'express';
import { ApiError } from '../utils/apiError';
import { requirePositiveId, requirePositiveQuantity } from '../utils/validators';
import { inventoryService } from '../services/inventoryService';
import type { InventoryDirection } from '../types/inventory';

const toOptionalString = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const parseDirection = (value: unknown): InventoryDirection | undefined => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (value === 'IN' || value === 'OUT') {
    return value;
  }
  throw new ApiError(400, 'direction must be IN or OUT');
};

export const listProducts = async (_req: Request, res: Response): Promise<void> => {
  const products = await inventoryService.listProducts();
  res.status(200).json({ success: true, data: products });
};

export const createProduct = async (req: Request, res: Response): Promise<void> => {
  const { sku, name, unit, category, barcode, minStock, isActive } = req.body as {
    sku?: string;
    name?: string;
    unit?: string;
    category?: string;
    barcode?: string;
    minStock?: number | string;
    isActive?: boolean;
  };

  if (!sku || !name || !unit) {
    throw new ApiError(400, 'sku, name and unit are required');
  }

  const created = await inventoryService.createProduct({
    sku,
    name,
    unit,
    category: toOptionalString(category),
    barcode: toOptionalString(barcode),
    minStock: minStock === undefined ? undefined : Number(minStock),
    isActive
  });

  res.status(201).json({ success: true, data: created });
};

export const listWarehouses = async (_req: Request, res: Response): Promise<void> => {
  const warehouses = await inventoryService.listWarehouses();
  res.status(200).json({ success: true, data: warehouses });
};

export const createWarehouse = async (req: Request, res: Response): Promise<void> => {
  const { name, code } = req.body as { name?: string; code?: string };
  if (!name || !code) {
    throw new ApiError(400, 'name and code are required');
  }

  const created = await inventoryService.createWarehouse({ name, code });
  res.status(201).json({ success: true, data: created });
};

export const listBusinesses = async (_req: Request, res: Response): Promise<void> => {
  const businesses = await inventoryService.listBusinesses();
  res.status(200).json({ success: true, data: businesses });
};

export const createBusiness = async (req: Request, res: Response): Promise<void> => {
  const { code, name, city, isActive } = req.body as {
    code?: string;
    name?: string;
    city?: string;
    isActive?: boolean;
  };
  if (!code || !name) {
    throw new ApiError(400, 'code and name are required');
  }

  const created = await inventoryService.createBusiness({
    code,
    name,
    city: toOptionalString(city),
    isActive
  });
  res.status(201).json({ success: true, data: created });
};

export const updateBusiness = async (req: Request, res: Response): Promise<void> => {
  const id = requirePositiveId(req.params.id, 'id');
  const { code, name, city, isActive } = req.body as {
    code?: string;
    name?: string;
    city?: string;
    isActive?: boolean;
  };

  const updated = await inventoryService.updateBusiness(id, {
    code,
    name,
    city: city === undefined ? undefined : toOptionalString(city),
    isActive
  });
  res.status(200).json({ success: true, data: updated });
};

export const deactivateBusiness = async (req: Request, res: Response): Promise<void> => {
  const id = requirePositiveId(req.params.id, 'id');
  const updated = await inventoryService.deactivateBusiness(id);
  res.status(200).json({ success: true, data: updated });
};

export const listFactories = async (_req: Request, res: Response): Promise<void> => {
  const factories = await inventoryService.listFactories();
  res.status(200).json({ success: true, data: factories });
};

export const createFactory = async (req: Request, res: Response): Promise<void> => {
  const { businessId, code, name, city, isActive } = req.body as {
    businessId?: number | string;
    code?: string;
    name?: string;
    city?: string;
    isActive?: boolean;
  };
  if (!businessId || !code || !name) {
    throw new ApiError(400, 'businessId, code and name are required');
  }

  const created = await inventoryService.createFactory({
    businessId: requirePositiveId(businessId, 'businessId'),
    code,
    name,
    city: toOptionalString(city),
    isActive
  });
  res.status(201).json({ success: true, data: created });
};

export const updateFactory = async (req: Request, res: Response): Promise<void> => {
  const id = requirePositiveId(req.params.id, 'id');
  const { businessId, code, name, city, isActive } = req.body as {
    businessId?: number | string;
    code?: string;
    name?: string;
    city?: string;
    isActive?: boolean;
  };

  const updated = await inventoryService.updateFactory(id, {
    businessId: businessId === undefined ? undefined : requirePositiveId(businessId, 'businessId'),
    code,
    name,
    city: city === undefined ? undefined : toOptionalString(city),
    isActive
  });
  res.status(200).json({ success: true, data: updated });
};

export const deactivateFactory = async (req: Request, res: Response): Promise<void> => {
  const id = requirePositiveId(req.params.id, 'id');
  const updated = await inventoryService.deactivateFactory(id);
  res.status(200).json({ success: true, data: updated });
};

export const listFacilities = async (_req: Request, res: Response): Promise<void> => {
  const facilities = await inventoryService.listFacilities();
  res.status(200).json({ success: true, data: facilities });
};

export const createFacility = async (req: Request, res: Response): Promise<void> => {
  const { factoryId, code, name, city, isActive } = req.body as {
    factoryId?: number | string;
    code?: string;
    name?: string;
    city?: string;
    isActive?: boolean;
  };
  if (!factoryId || !code || !name) {
    throw new ApiError(400, 'factoryId, code and name are required');
  }

  const created = await inventoryService.createFacility({
    factoryId: requirePositiveId(factoryId, 'factoryId'),
    code,
    name,
    city: toOptionalString(city),
    isActive
  });
  res.status(201).json({ success: true, data: created });
};

export const updateFacility = async (req: Request, res: Response): Promise<void> => {
  const id = requirePositiveId(req.params.id, 'id');
  const { factoryId, code, name, city, isActive } = req.body as {
    factoryId?: number | string;
    code?: string;
    name?: string;
    city?: string;
    isActive?: boolean;
  };

  const updated = await inventoryService.updateFacility(id, {
    factoryId: factoryId === undefined ? undefined : requirePositiveId(factoryId, 'factoryId'),
    code,
    name,
    city: city === undefined ? undefined : toOptionalString(city),
    isActive
  });
  res.status(200).json({ success: true, data: updated });
};

export const deactivateFacility = async (req: Request, res: Response): Promise<void> => {
  const id = requirePositiveId(req.params.id, 'id');
  const updated = await inventoryService.deactivateFacility(id);
  res.status(200).json({ success: true, data: updated });
};

// Backward compatibility aliases.
export const listPlants = listFacilities;
export const createPlant = createFacility;
export const updatePlant = updateFacility;
export const deactivatePlant = deactivateFacility;

export const createStockTransaction = async (req: Request, res: Response): Promise<void> => {
  const createdBy = req.user?.userId;
  if (!createdBy) {
    throw new ApiError(401, 'Unauthorized');
  }

  const { productId, warehouseId, type, quantity, direction, referenceType, referenceId, note } = req.body as {
    productId?: number | string;
    warehouseId?: number | string;
    type?: 'IN' | 'OUT' | 'ADJUST';
    quantity?: number | string;
    direction?: InventoryDirection;
    referenceType?: string;
    referenceId?: string;
    note?: string;
  };

  if (!type || !['IN', 'OUT', 'ADJUST'].includes(type)) {
    throw new ApiError(400, 'type must be one of IN, OUT, ADJUST');
  }

  const result = await inventoryService.createStockTransaction({
    productId: requirePositiveId(productId, 'productId'),
    warehouseId: requirePositiveId(warehouseId, 'warehouseId'),
    type,
    quantity: requirePositiveQuantity(quantity),
    adjustDirection: parseDirection(direction),
    referenceType: toOptionalString(referenceType),
    referenceId: toOptionalString(referenceId),
    note: toOptionalString(note),
    createdBy: String(createdBy)
  });

  res.status(201).json({ success: true, data: result });
};

export const createTransfer = async (req: Request, res: Response): Promise<void> => {
  const createdBy = req.user?.userId;
  if (!createdBy) {
    throw new ApiError(401, 'Unauthorized');
  }

  const { productId, sourceWarehouseId, destinationWarehouseId, quantity, referenceType, referenceId, note } =
    req.body as {
      productId?: number | string;
      sourceWarehouseId?: number | string;
      destinationWarehouseId?: number | string;
      quantity?: number | string;
      referenceType?: string;
      referenceId?: string;
      note?: string;
    };

  const result = await inventoryService.createTransfer({
    productId: requirePositiveId(productId, 'productId'),
    sourceWarehouseId: requirePositiveId(sourceWarehouseId, 'sourceWarehouseId'),
    destinationWarehouseId: requirePositiveId(destinationWarehouseId, 'destinationWarehouseId'),
    quantity: requirePositiveQuantity(quantity),
    referenceType: toOptionalString(referenceType),
    referenceId: toOptionalString(referenceId),
    note: toOptionalString(note),
    createdBy: String(createdBy)
  });

  res.status(201).json({ success: true, data: result });
};

export const getOnHand = async (req: Request, res: Response): Promise<void> => {
  const productId = req.query.productId ? requirePositiveId(req.query.productId, 'productId') : undefined;
  const warehouseId = req.query.warehouseId
    ? requirePositiveId(req.query.warehouseId, 'warehouseId')
    : undefined;

  const rows = await inventoryService.getOnHand({ productId, warehouseId });
  res.status(200).json({ success: true, data: rows });
};

export const getLedger = async (req: Request, res: Response): Promise<void> => {
  const productId = req.query.productId ? requirePositiveId(req.query.productId, 'productId') : undefined;
  const warehouseId = req.query.warehouseId
    ? requirePositiveId(req.query.warehouseId, 'warehouseId')
    : undefined;

  const from = typeof req.query.from === 'string' ? req.query.from : undefined;
  const to = typeof req.query.to === 'string' ? req.query.to : undefined;

  const rows = await inventoryService.getLedger({ productId, warehouseId, from, to });
  res.status(200).json({ success: true, data: rows });
};
