import db from '../db/knex.js';

export async function createUser(trx, { organizationId, name, email, passwordHash, role }) {
  const rows = await trx('users')
    .insert({
      organization_id: organizationId,
      name,
      email,
      password_hash: passwordHash,
      role: role ?? 'admin'
    })
    .returning(['id', 'organization_id', 'name', 'email', 'role']);

  return rows[0];
}

export async function getUserByEmail(email) {
  return db('users')
    .whereRaw('lower(email) = lower(?)', [email])
    .first(['id', 'organization_id', 'name', 'email', 'password_hash', 'role']);
}
