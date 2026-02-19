function normalizeAscii(input) {
  return String(input ?? '')
    .toLowerCase()
    .replace(/[ç]/g, 'c')
    .replace(/[ğ]/g, 'g')
    .replace(/[ı]/g, 'i')
    .replace(/[ö]/g, 'o')
    .replace(/[ş]/g, 's')
    .replace(/[ü]/g, 'u');
}

function toTitle(value) {
  return String(value)
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function canonicalizeUnit(row) {
  const rawCode = normalizeAscii(row.code).trim();
  const rawName = normalizeAscii(row.name).trim();
  const rawSymbol = String(row.symbol ?? '').trim() || null;
  const key = rawCode || rawName;

  if (['adet', 'ad', 'piece', 'pieces', 'pcs', 'pc'].includes(key)) {
    return { code: 'piece', name: 'Piece', symbol: null };
  }

  if (['kg', 'kilo', 'kilogram'].includes(key)) {
    return { code: 'kg', name: 'Kilogram', symbol: 'kg' };
  }

  if (['g', 'gram'].includes(key)) {
    return { code: 'g', name: 'Gram', symbol: 'g' };
  }

  if (['t', 'ton'].includes(key)) {
    return { code: 't', name: 'Ton', symbol: 't' };
  }

  if (['l', 'lt', 'liter', 'litre'].includes(key)) {
    return { code: 'l', name: 'Liter', symbol: 'l' };
  }

  if (['ml', 'milliliter', 'millilitre'].includes(key)) {
    return { code: 'ml', name: 'Milliliter', symbol: 'ml' };
  }

  if (['m', 'meter', 'metre'].includes(key)) {
    return { code: 'm', name: 'Meter', symbol: 'm' };
  }

  if (['cm', 'centimeter', 'centimetre', 'santimetre'].includes(key)) {
    return { code: 'cm', name: 'Centimeter', symbol: 'cm' };
  }

  if (['mm', 'millimeter', 'millimetre', 'milimetre'].includes(key)) {
    return { code: 'mm', name: 'Millimeter', symbol: 'mm' };
  }

  if (['micron', 'mikron', 'um'].includes(key)) {
    return { code: 'micron', name: 'Micron', symbol: 'um' };
  }

  if (['mesh'].includes(key)) {
    return { code: 'mesh', name: 'Mesh', symbol: 'mesh' };
  }

  const sanitizedCode = key
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 16);
  const fallbackCode = sanitizedCode || `unit_${row.id}`;
  return {
    code: fallbackCode,
    name: toTitle(fallbackCode),
    symbol: rawSymbol
  };
}

function trNameByCode(code, fallback) {
  switch (code) {
    case 'piece':
      return 'Adet';
    case 'kg':
      return 'Kilogram';
    case 'g':
      return 'Gram';
    case 't':
      return 'Ton';
    case 'l':
      return 'Litre';
    case 'ml':
      return 'Mililitre';
    case 'm':
      return 'Metre';
    case 'cm':
      return 'Santimetre';
    case 'mm':
      return 'Milimetre';
    case 'micron':
      return 'Mikron';
    case 'mesh':
      return 'Mesh';
    default:
      return fallback;
  }
}

/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
  const hasUnits = await knex.schema.hasTable('units');
  if (!hasUnits) return;

  const hasItems = await knex.schema.hasTable('items');
  const hasLines = await knex.schema.hasTable('inventory_movement_lines');
  const hasTranslations = await knex.schema.hasTable('translations');

  await knex.transaction(async (trx) => {
    const rows = await trx('units')
      .select(['id', 'organization_id', 'code', 'name', 'symbol', 'system', 'active'])
      .orderBy([
        { column: 'organization_id', order: 'asc' },
        { column: 'system', order: 'desc' },
        { column: 'active', order: 'desc' },
        { column: 'id', order: 'asc' }
      ]);

    const grouped = new Map();
    for (const row of rows) {
      const canonical = canonicalizeUnit(row);
      const key = `${row.organization_id}::${canonical.code}`;
      const arr = grouped.get(key) ?? [];
      arr.push({ row, canonical });
      grouped.set(key, arr);
    }

    const keepRows = [];

    for (const entries of grouped.values()) {
      const [keep, ...duplicates] = entries;
      keepRows.push(keep);

      for (const dup of duplicates) {
        if (hasItems) {
          await trx('items').where({ unit_id: dup.row.id }).update({ unit_id: keep.row.id });
          await trx('items').where({ size_unit_id: dup.row.id }).update({ size_unit_id: keep.row.id });
        }
        if (hasLines) {
          await trx('inventory_movement_lines').where({ unit_id: dup.row.id }).update({ unit_id: keep.row.id });
        }
        await trx('units').where({ id: dup.row.id }).del();
      }
    }

    for (const entry of keepRows) {
      await trx('units')
        .where({ id: entry.row.id })
        .update({
          code: entry.canonical.code,
          name: entry.canonical.name,
          symbol: entry.canonical.code === 'piece' ? null : entry.canonical.symbol,
          updated_at: trx.fn.now()
        });
    }

    if (hasTranslations) {
      const units = await trx('units').select(['organization_id', 'code', 'name']);
      const codesByOrg = new Map();

      for (const unit of units) {
        const key = unit.organization_id;
        const arr = codesByOrg.get(key) ?? [];
        arr.push(String(unit.code).toLowerCase());
        codesByOrg.set(key, arr);

        const unitCode = String(unit.code).toLowerCase();
        const enName = String(unit.name);
        const trName = trNameByCode(unitCode, enName);

        await trx('translations')
          .insert({
            organization_id: unit.organization_id,
            namespace: 'unit',
            entry_key: unitCode,
            tr: trName,
            en: enName
          })
          .onConflict(['organization_id', 'namespace', 'entry_key'])
          .merge({ tr: trName, en: enName, updated_at: trx.fn.now() });
      }

      for (const [organizationId, codes] of codesByOrg.entries()) {
        await trx('translations')
          .where({ organization_id: organizationId, namespace: 'unit' })
          .whereNotIn('entry_key', Array.from(new Set(codes)))
          .del();
      }
    }
  });
};

/** @param {import('knex').Knex} knex */
exports.down = async function down() {
  // No-op: normalization is data-destructive and should not be auto-reverted.
};
