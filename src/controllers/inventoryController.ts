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

export const listOrganizations = async (_req: Request, res: Response): Promise<void> => {
  const organizations = await inventoryService.listOrganizations();
  res.status(200).json({ success: true, data: organizations });
};

export const createOrganization = async (req: Request, res: Response): Promise<void> => {
  const { code, name, city, isActive } = req.body as {
    code?: string;
    name?: string;
    city?: string;
    isActive?: boolean;
  };
  if (!code || !name) {
    throw new ApiError(400, 'code and name are required');
  }

  const created = await inventoryService.createOrganization({
    code,
    name,
    city: toOptionalString(city),
    isActive
  });
  res.status(201).json({ success: true, data: created });
};

export const updateOrganization = async (req: Request, res: Response): Promise<void> => {
  const id = requirePositiveId(req.params.id, 'id');
  const { code, name, city, isActive } = req.body as {
    code?: string;
    name?: string;
    city?: string;
    isActive?: boolean;
  };

  const updated = await inventoryService.updateOrganization(id, {
    code,
    name,
    city: city === undefined ? undefined : toOptionalString(city),
    isActive
  });
  res.status(200).json({ success: true, data: updated });
};

export const deactivateOrganization = async (req: Request, res: Response): Promise<void> => {
  const id = requirePositiveId(req.params.id, 'id');
  const updated = await inventoryService.deactivateOrganization(id);
  res.status(200).json({ success: true, data: updated });
};

export const listOrganizationUnits = async (_req: Request, res: Response): Promise<void> => {
  const units = await inventoryService.listOrganizationUnits();
  res.status(200).json({ success: true, data: units });
};

export const createOrganizationUnit = async (req: Request, res: Response): Promise<void> => {
  const { organizationId, parentUnitId, code, name, kind, city, isActive } = req.body as {
    organizationId?: number | string;
    parentUnitId?: number | string | null;
    code?: string;
    name?: string;
    kind?: string;
    city?: string;
    isActive?: boolean;
  };
  if (!organizationId || !code || !name) {
    throw new ApiError(400, 'organizationId, code and name are required');
  }

  const created = await inventoryService.createOrganizationUnit({
    organizationId: requirePositiveId(organizationId, 'organizationId'),
    parentUnitId:
      parentUnitId === undefined || parentUnitId === null || parentUnitId === ''
        ? undefined
        : requirePositiveId(parentUnitId, 'parentUnitId'),
    code,
    name,
    kind: toOptionalString(kind),
    city: toOptionalString(city),
    isActive
  });
  res.status(201).json({ success: true, data: created });
};

export const updateOrganizationUnit = async (req: Request, res: Response): Promise<void> => {
  const id = requirePositiveId(req.params.id, 'id');
  const { organizationId, parentUnitId, code, name, kind, city, isActive } = req.body as {
    organizationId?: number | string;
    parentUnitId?: number | string | null;
    code?: string;
    name?: string;
    kind?: string;
    city?: string;
    isActive?: boolean;
  };

  const updated = await inventoryService.updateOrganizationUnit(id, {
    organizationId: organizationId === undefined ? undefined : requirePositiveId(organizationId, 'organizationId'),
    parentUnitId:
      parentUnitId === undefined
        ? undefined
        : parentUnitId === null || parentUnitId === ''
          ? null
          : requirePositiveId(parentUnitId, 'parentUnitId'),
    code,
    name,
    kind: kind === undefined ? undefined : toOptionalString(kind),
    city: city === undefined ? undefined : toOptionalString(city),
    isActive
  });
  res.status(200).json({ success: true, data: updated });
};

export const deactivateOrganizationUnit = async (req: Request, res: Response): Promise<void> => {
  const id = requirePositiveId(req.params.id, 'id');
  const updated = await inventoryService.deactivateOrganizationUnit(id);
  res.status(200).json({ success: true, data: updated });
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
