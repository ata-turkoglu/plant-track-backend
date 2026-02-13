import { db } from '../db/knex';

type TxnType = 'IN' | 'OUT' | 'TRANSFER' | 'ADJUST';
type TxnDirection = 'IN' | 'OUT';

interface UserRow {
  id: string;
  email: string;
}

interface ProductSeed {
  sku: string;
  name: string;
  unit: string;
  category: 'CONSUMABLE' | 'SPARE_PART' | 'MAINTENANCE' | 'FINISHED_PRODUCT';
  min_stock: number;
}

interface WarehouseSeed {
  code: string;
  name: string;
  locations: string[];
}

interface OrganizationSeed {
  code: string;
  name: string;
  city: string;
}

interface OrganizationUnitSeed {
  code: string;
  name: string;
  city: string;
  kind: string;
  organizationCode: string;
  parentCode?: string;
}

interface ProductRow {
  id: string;
  sku: string;
}

interface WarehouseRow {
  id: string;
  code: string;
}

interface OrganizationRow {
  id: string;
  code: string;
}

interface OrganizationUnitRow {
  id: string;
  code: string;
}

interface StockTransactionInsert {
  product_id: string;
  warehouse_id: string;
  type: TxnType;
  direction: TxnDirection;
  quantity: number;
  unit: string;
  reference_type: string;
  reference_id: string;
  note: string;
  created_by: string;
  created_at: string;
}

const products: ProductSeed[] = [
  { sku: 'CON-DIZEL', name: 'Motorin', unit: 'L', category: 'CONSUMABLE', min_stock: 12000 },
  { sku: 'CON-GREASE-EP2', name: 'Gres EP2', unit: 'KG', category: 'CONSUMABLE', min_stock: 450 },
  { sku: 'CON-OIL-68', name: 'Hidrolik Yag ISO 68', unit: 'L', category: 'CONSUMABLE', min_stock: 1800 },
  { sku: 'CON-BELT-REPAIR', name: 'Konveyor Bant Tamir Seti', unit: 'SET', category: 'CONSUMABLE', min_stock: 60 },
  { sku: 'CON-BOLT-M16', name: 'M16 Civata Somun Takimi', unit: 'SET', category: 'CONSUMABLE', min_stock: 2500 },
  { sku: 'CON-CHEM-FLOC', name: 'Flokulant', unit: 'KG', category: 'CONSUMABLE', min_stock: 900 },
  { sku: 'SP-ROLLER-108', name: 'Konveyor Rulosi 108mm', unit: 'PCS', category: 'SPARE_PART', min_stock: 220 },
  { sku: 'SP-IDLER-SET', name: 'Idler Seti', unit: 'SET', category: 'SPARE_PART', min_stock: 75 },
  { sku: 'SP-BEAR-22220', name: 'Rulman 22220', unit: 'PCS', category: 'SPARE_PART', min_stock: 140 },
  { sku: 'SP-BEAR-22320', name: 'Rulman 22320', unit: 'PCS', category: 'SPARE_PART', min_stock: 120 },
  { sku: 'SP-JAW-PLATE', name: 'Ceneli Kirici Cenesi', unit: 'PCS', category: 'SPARE_PART', min_stock: 20 },
  { sku: 'SP-MANTLE-CONE', name: 'Konik Kirici Manto', unit: 'PCS', category: 'SPARE_PART', min_stock: 12 },
  { sku: 'SP-SCREEN-MESH20', name: 'Elek Teli 20mm', unit: 'PCS', category: 'SPARE_PART', min_stock: 45 },
  { sku: 'SP-SCREEN-MESH40', name: 'Elek Teli 40mm', unit: 'PCS', category: 'SPARE_PART', min_stock: 40 },
  { sku: 'SP-PUMP-SLURRY', name: 'Slurry Pompa Rotoru', unit: 'PCS', category: 'SPARE_PART', min_stock: 16 },
  { sku: 'MNT-WELD-7018', name: 'Kaynak Elektrodu 7018', unit: 'KG', category: 'MAINTENANCE', min_stock: 500 },
  { sku: 'MNT-CABLE-4X16', name: 'Enerji Kablosu 4x16', unit: 'M', category: 'MAINTENANCE', min_stock: 750 },
  { sku: 'MNT-CONTACTOR-95A', name: 'Kontaktor 95A', unit: 'PCS', category: 'MAINTENANCE', min_stock: 24 },
  { sku: 'MNT-SENSOR-IND', name: 'Enduktif Sensor', unit: 'PCS', category: 'MAINTENANCE', min_stock: 36 },
  { sku: 'MNT-CHAIN-12B', name: 'Zincir 12B', unit: 'M', category: 'MAINTENANCE', min_stock: 280 },
  { sku: 'FG-KUVARS-0-5', name: 'Kuvars Kumu 0-5 mm', unit: 'TON', category: 'FINISHED_PRODUCT', min_stock: 600 },
  { sku: 'FG-KUVARS-5-12', name: 'Kuvars Agrega 5-12 mm', unit: 'TON', category: 'FINISHED_PRODUCT', min_stock: 450 },
  { sku: 'FG-KUVARS-12-25', name: 'Kuvars Agrega 12-25 mm', unit: 'TON', category: 'FINISHED_PRODUCT', min_stock: 500 },
  { sku: 'FG-KUVARS-MICRON', name: 'Mikronize Kuvars', unit: 'TON', category: 'FINISHED_PRODUCT', min_stock: 220 }
];

const warehouses: WarehouseSeed[] = [
  { code: 'MRO-ANA', name: 'MRO Ana Depo', locations: ['R1-A01', 'R1-A02', 'R1-B01', 'R1-B02', 'R1-C01'] },
  { code: 'MRO-ELEK', name: 'MRO Elektrik Deposu', locations: ['EL-A01', 'EL-A02', 'EL-B01', 'EL-B02'] },
  { code: 'MRO-MEK', name: 'MRO Mekanik Deposu', locations: ['MK-A01', 'MK-A02', 'MK-B01', 'MK-B02'] },
  { code: 'KIRMA-HAT', name: 'Kirma-Eleme Hat Stok Alani', locations: ['HAT-01', 'HAT-02', 'HAT-03'] },
  { code: 'SILO-ARA', name: 'Ara Silo Urun Stok', locations: ['SILO-01', 'SILO-02', 'SILO-03'] },
  { code: 'URUN-DEP', name: 'Urun Deposu', locations: ['U-01', 'U-02', 'U-03', 'U-04'] }
];

const organizations: OrganizationSeed[] = [
  { code: 'ORG-KVZ', name: 'Anadolu Kuvars Organizasyonu', city: 'Aydin' },
  { code: 'ORG-LOJ', name: 'Kuvars Lojistik Organizasyonu', city: 'Izmir' }
];

const organizationUnits: OrganizationUnitSeed[] = [
  {
    code: 'UNIT-KVZ-BIZ',
    name: 'Kuvars Isletme Birimi',
    city: 'Aydin',
    kind: 'BUSINESS',
    organizationCode: 'ORG-KVZ'
  },
  {
    code: 'UNIT-KVZ-FCT',
    name: 'Merkez Fabrika Birimi',
    city: 'Aydin',
    kind: 'FACTORY',
    organizationCode: 'ORG-KVZ',
    parentCode: 'UNIT-KVZ-BIZ'
  },
  {
    code: 'UNIT-KVZ-FCL-01',
    name: 'Kirma-Eleme Tesisi',
    city: 'Aydin',
    kind: 'FACILITY',
    organizationCode: 'ORG-KVZ',
    parentCode: 'UNIT-KVZ-FCT'
  },
  {
    code: 'UNIT-KVZ-FCL-02',
    name: 'Yikama ve Siniflandirma Hatti',
    city: 'Aydin',
    kind: 'FACILITY',
    organizationCode: 'ORG-KVZ',
    parentCode: 'UNIT-KVZ-FCT'
  },
  {
    code: 'UNIT-LOJ-BIZ',
    name: 'Lojistik Isletme Birimi',
    city: 'Izmir',
    kind: 'BUSINESS',
    organizationCode: 'ORG-LOJ'
  }
];

const qty = (base: number, variance: number, offset: number): number => {
  const amount = base + ((offset * 17) % variance);
  return Number(amount.toFixed(4));
};

const hoursAgoIso = (offset: number): string => {
  const hour = 60 * 60 * 1000;
  return new Date(Date.now() - offset * hour).toISOString();
};

const targetWarehouseCodes = (category: ProductSeed['category']): string[] => {
  if (category === 'FINISHED_PRODUCT') {
    return ['SILO-ARA', 'URUN-DEP'];
  }

  if (category === 'MAINTENANCE') {
    return ['MRO-ELEK', 'MRO-MEK', 'KIRMA-HAT'];
  }

  if (category === 'SPARE_PART') {
    return ['MRO-MEK', 'KIRMA-HAT'];
  }

  return ['MRO-ANA', 'KIRMA-HAT'];
};

const buildTransactions = (
  productRows: ProductRow[],
  warehouseByCode: Map<string, WarehouseRow>,
  createdBy: string
): StockTransactionInsert[] => {
  const rows: StockTransactionInsert[] = [];
  let hourOffset = 10;

  productRows.forEach((product, index) => {
    const seed = products.find((item) => item.sku === product.sku);
    if (!seed) {
      return;
    }

    const targetWarehouses = targetWarehouseCodes(seed.category)
      .map((code) => warehouseByCode.get(code))
      .filter((value): value is WarehouseRow => Boolean(value));

    targetWarehouses.forEach((warehouse, wIndex) => {
      const inQty = qty(seed.min_stock * 1.7, Math.max(12, seed.min_stock), index + wIndex + 1);
      const outQty = qty(seed.min_stock * 0.42, Math.max(10, Math.floor(seed.min_stock * 0.25)), index + wIndex + 5);
      const adjustQty = qty(seed.min_stock * 0.06, 9, index + wIndex + 9);

      rows.push({
        product_id: product.id,
        warehouse_id: warehouse.id,
        type: 'IN',
        direction: 'IN',
        quantity: inQty,
        unit: seed.unit,
        reference_type: seed.category === 'FINISHED_PRODUCT' ? 'PRODUCTION_RECEIPT' : 'PURCHASE_ORDER',
        reference_id: `IN-2026-${(1000 + index * 8 + wIndex).toString()}`,
        note: seed.category === 'FINISHED_PRODUCT' ? 'Kirma-eleme uretiminden urun girisi' : 'Planli satin alma girisi',
        created_by: createdBy,
        created_at: hoursAgoIso(hourOffset)
      });
      hourOffset += 8;

      rows.push({
        product_id: product.id,
        warehouse_id: warehouse.id,
        type: 'OUT',
        direction: 'OUT',
        quantity: outQty,
        unit: seed.unit,
        reference_type: seed.category === 'FINISHED_PRODUCT' ? 'SALES_SHIPMENT' : 'WORK_ORDER',
        reference_id: `OUT-2026-${(3000 + index * 11 + wIndex).toString()}`,
        note: seed.category === 'FINISHED_PRODUCT' ? 'Musteri sevkiyati' : 'Bakim/uretim tuketimi',
        created_by: createdBy,
        created_at: hoursAgoIso(hourOffset)
      });
      hourOffset += 6;

      rows.push({
        product_id: product.id,
        warehouse_id: warehouse.id,
        type: 'ADJUST',
        direction: 'IN',
        quantity: adjustQty,
        unit: seed.unit,
        reference_type: 'CYCLE_COUNT',
        reference_id: `CC-2026-${(5000 + index * 5 + wIndex).toString()}`,
        note: 'Donemsel sayim farki',
        created_by: createdBy,
        created_at: hoursAgoIso(hourOffset)
      });
      hourOffset += 4;
    });

    if (seed.category === 'FINISHED_PRODUCT') {
      const source = warehouseByCode.get('SILO-ARA');
      const target = warehouseByCode.get('URUN-DEP');
      if (source && target) {
        const transferQty = qty(seed.min_stock * 0.3, 25, index + 17);
        const reference = `TR-2026-${(7000 + index).toString()}`;

        rows.push({
          product_id: product.id,
          warehouse_id: source.id,
          type: 'TRANSFER',
          direction: 'OUT',
          quantity: transferQty,
          unit: seed.unit,
          reference_type: 'TRANSFER',
          reference_id: reference,
          note: 'Ara silodan urun deposuna transfer',
          created_by: createdBy,
          created_at: hoursAgoIso(hourOffset)
        });
        hourOffset += 5;

        rows.push({
          product_id: product.id,
          warehouse_id: target.id,
          type: 'TRANSFER',
          direction: 'IN',
          quantity: transferQty,
          unit: seed.unit,
          reference_type: 'TRANSFER',
          reference_id: reference,
          note: 'Ara silodan urun deposuna transfer',
          created_by: createdBy,
          created_at: hoursAgoIso(hourOffset)
        });
        hourOffset += 5;
      }
    }
  });

  return rows;
};

const main = async (): Promise<void> => {
  const user = await db<UserRow>('users').select('id', 'email').orderBy('created_at', 'asc').first();
  if (!user) {
    throw new Error('Seed icin once users tablosunda en az bir kullanici olmali.');
  }

  await db.raw(
    'TRUNCATE TABLE stock_transactions, warehouse_locations, products, warehouses, organization_units, organizations RESTART IDENTITY CASCADE'
  );

  const now = new Date().toISOString();

  await db('products').insert(
    products.map((item) => ({
      ...item,
      is_active: true,
      created_at: now,
      updated_at: now
    }))
  );

  await db('warehouses').insert(
    warehouses.map((item) => ({
      code: item.code,
      name: item.name,
      created_at: now,
      updated_at: now
    }))
  );

  await db('organizations').insert(
    organizations.map((item) => ({
      code: item.code,
      name: item.name,
      city: item.city,
      is_active: true,
      created_at: now,
      updated_at: now
    }))
  );

  const organizationRows = await db<OrganizationRow>('organizations').select('id', 'code').whereIn(
    'code',
    organizations.map((item) => item.code)
  );
  const organizationByCode = new Map(organizationRows.map((row) => [row.code, row]));
  const unitByCode = new Map<string, OrganizationUnitRow>();
  const pendingUnits = [...organizationUnits];

  while (pendingUnits.length > 0) {
    let insertedInPass = 0;

    for (let i = pendingUnits.length - 1; i >= 0; i -= 1) {
      const item = pendingUnits[i];
      const organization = organizationByCode.get(item.organizationCode);
      if (!organization) {
        pendingUnits.splice(i, 1);
        continue;
      }

      let parentUnitId: string | null = null;
      if (item.parentCode) {
        const parent = unitByCode.get(item.parentCode);
        if (!parent) {
          continue;
        }
        parentUnitId = parent.id;
      }

      const [inserted] = await db<OrganizationUnitRow>('organization_units')
        .insert({
          organization_id: organization.id,
          parent_unit_id: parentUnitId,
          code: item.code,
          name: item.name,
          kind: item.kind,
          city: item.city,
          is_active: true,
          created_at: now,
          updated_at: now
        })
        .returning(['id', 'code']);

      unitByCode.set(item.code, inserted);
      pendingUnits.splice(i, 1);
      insertedInPass += 1;
    }

    if (insertedInPass === 0) {
      throw new Error('organization unit parent hiyerarsisi cozumlenemedi.');
    }
  }

  const productRows = await db<ProductRow>('products').select('id', 'sku').whereIn(
    'sku',
    products.map((item) => item.sku)
  );

  const warehouseRows = await db<WarehouseRow>('warehouses').select('id', 'code').whereIn(
    'code',
    warehouses.map((item) => item.code)
  );
  const warehouseByCode = new Map(warehouseRows.map((row) => [row.code, row]));

  const locationRows = warehouses.flatMap((warehouse) => {
    const row = warehouseByCode.get(warehouse.code);
    if (!row) {
      return [];
    }

    return warehouse.locations.map((code) => ({
      warehouse_id: row.id,
      code,
      description: `${warehouse.name} ${code}`
    }));
  });

  await db('warehouse_locations').insert(locationRows);

  const transactionRows = buildTransactions(productRows, warehouseByCode, user.id);
  await db.batchInsert('stock_transactions', transactionRows, 120);

  const [productCount, organizationCount, unitCount, warehouseCount, locationCount, transactionCount] = await Promise.all([
    db('products').count<{ count: string }>('id as count').first(),
    db('organizations').count<{ count: string }>('id as count').first(),
    db('organization_units').count<{ count: string }>('id as count').first(),
    db('warehouses').count<{ count: string }>('id as count').first(),
    db('warehouse_locations').count<{ count: string }>('id as count').first(),
    db('stock_transactions').count<{ count: string }>('id as count').first()
  ]);

  // eslint-disable-next-line no-console
  console.log('Quartz operasyonu inventory seed tamamlandi');
  // eslint-disable-next-line no-console
  console.log(
    `organizations=${organizationCount?.count ?? 0}, organization_units=${unitCount?.count ?? 0}, products=${productCount?.count ?? 0}, warehouses=${warehouseCount?.count ?? 0}, warehouse_locations=${locationCount?.count ?? 0}, stock_transactions=${transactionCount?.count ?? 0}`
  );
  // eslint-disable-next-line no-console
  console.log(`created_by user: ${user.email} (${user.id})`);
};

void main()
  .catch((error: unknown) => {
    // eslint-disable-next-line no-console
    console.error('Inventory seed basarisiz:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.destroy();
  });
