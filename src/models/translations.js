import db from '../db/knex.js';

export async function listTranslationsByOrganization(organizationId, { namespace } = {}) {
  const query = db('translations')
    .where({ organization_id: organizationId })
    .orderBy([
      { column: 'namespace', order: 'asc' },
      { column: 'entry_key', order: 'asc' }
    ])
    .select(['id', 'organization_id', 'namespace', 'entry_key', 'tr', 'en', 'created_at', 'updated_at']);

  if (namespace) query.andWhere({ namespace });

  return query;
}

export async function createTranslation(trx, { organizationId, namespace, entryKey, tr, en }) {
  const rows = await trx('translations')
    .insert({
      organization_id: organizationId,
      namespace,
      entry_key: entryKey,
      tr,
      en
    })
    .returning(['id', 'organization_id', 'namespace', 'entry_key', 'tr', 'en', 'created_at', 'updated_at']);

  return rows[0];
}

export async function updateTranslation(trx, { organizationId, translationId, namespace, entryKey, tr, en }) {
  const rows = await trx('translations')
    .where({ id: translationId, organization_id: organizationId })
    .update({
      namespace,
      entry_key: entryKey,
      tr,
      en,
      updated_at: trx.fn.now()
    })
    .returning(['id', 'organization_id', 'namespace', 'entry_key', 'tr', 'en', 'created_at', 'updated_at']);

  return rows[0] ?? null;
}

export async function getTranslationById(id) {
  return db('translations')
    .where({ id })
    .first(['id', 'organization_id', 'namespace', 'entry_key', 'tr', 'en']);
}

export async function deleteTranslationById(trx, { organizationId, translationId }) {
  return trx('translations').where({ id: translationId, organization_id: organizationId }).del();
}
