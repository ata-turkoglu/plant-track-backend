import db from '../db/knex.js';

const USER_COLUMNS = ['id', 'organization_id', 'name', 'email', 'role', 'default_currency_code'];

export async function createUser(trx, { organizationId, name, email, passwordHash, role, defaultCurrencyCode }) {
  const rows = await trx('users')
    .insert({
      organization_id: organizationId,
      name,
      email,
      password_hash: passwordHash,
      role: role ?? 'admin',
      default_currency_code: defaultCurrencyCode ?? null
    })
    .returning(USER_COLUMNS);

  return rows[0];
}

export async function getUserByEmail(email) {
  return db('users')
    .whereRaw('lower(email) = lower(?)', [email])
    .first(['id', 'organization_id', 'name', 'email', 'password_hash', 'role', 'default_currency_code']);
}

export async function getUserById(id) {
  return db('users').where({ id }).first(USER_COLUMNS);
}

export async function updateUserProfile(trx, { userId, organizationId, name, defaultCurrencyCode }) {
  const rows = await trx('users')
    .where({ id: userId, organization_id: organizationId })
    .update({
      name,
      default_currency_code: defaultCurrencyCode ?? null,
      updated_at: trx.fn.now()
    })
    .returning(USER_COLUMNS);

  return rows[0] ?? null;
}
