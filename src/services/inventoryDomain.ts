import { ApiError } from '../utils/apiError';

export type MovementDirection = 'IN' | 'OUT';

export const projectOnHand = (
  currentOnHand: number,
  direction: MovementDirection,
  quantity: number,
  allowNegativeStock: boolean
): number => {
  const delta = direction === 'IN' ? quantity : -quantity;
  const next = currentOnHand + delta;

  if (!allowNegativeStock && next < 0) {
    throw new ApiError(400, `Insufficient stock. On-hand: ${currentOnHand}, requested: ${quantity}`);
  }

  return next;
};

export const validateTransferWarehouses = (
  sourceWarehouseId: number,
  destinationWarehouseId: number
): void => {
  if (sourceWarehouseId === destinationWarehouseId) {
    throw new ApiError(400, 'sourceWarehouseId and destinationWarehouseId must be different');
  }
};
