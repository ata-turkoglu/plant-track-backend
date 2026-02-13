import { describe, expect, it } from 'vitest';
import { ApiError } from '../src/utils/apiError';
import { projectOnHand, validateTransferWarehouses } from '../src/services/inventoryDomain';

describe('inventory domain rules', () => {
  it('creating IN increases on-hand', () => {
    const onHand = projectOnHand(10, 'IN', 5, false);
    expect(onHand).toBe(15);
  });

  it('creating OUT decreases on-hand', () => {
    const onHand = projectOnHand(10, 'OUT', 3, false);
    expect(onHand).toBe(7);
  });

  it('OUT that exceeds on-hand is rejected when negative stock is disabled', () => {
    expect(() => projectOnHand(2, 'OUT', 3, false)).toThrowError(ApiError);
  });

  it('TRANSFER keeps net stock preserved across warehouses', () => {
    const srcBefore = 12;
    const dstBefore = 4;
    const transferQty = 5;

    validateTransferWarehouses(1, 2);

    const srcAfter = projectOnHand(srcBefore, 'OUT', transferQty, false);
    const dstAfter = projectOnHand(dstBefore, 'IN', transferQty, false);

    expect(srcAfter).toBe(7);
    expect(dstAfter).toBe(9);
    expect(srcAfter + dstAfter).toBe(srcBefore + dstBefore);
  });
});
