import { db } from '../db/knex';
import { hashPassword } from '../utils/password';
import { validateEmail, validateName, validateStrongPassword } from '../utils/validators';
import { nowIso } from '../utils/time';

interface UserRow {
  id: number;
  email: string;
  role: 'admin' | 'user';
  is_active: boolean;
}

const required = (value: string | undefined, key: string): string => {
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
};

const main = async (): Promise<void> => {
  const email = required(process.env.SUPERUSER_EMAIL, 'SUPERUSER_EMAIL').toLowerCase();
  const password = required(process.env.SUPERUSER_PASSWORD, 'SUPERUSER_PASSWORD');
  const firstName = required(process.env.SUPERUSER_FIRST_NAME, 'SUPERUSER_FIRST_NAME').trim();
  const lastName = required(process.env.SUPERUSER_LAST_NAME, 'SUPERUSER_LAST_NAME').trim();

  validateEmail(email);
  validateStrongPassword(password);
  validateName(firstName, 'SUPERUSER_FIRST_NAME');
  validateName(lastName, 'SUPERUSER_LAST_NAME');

  const passwordHash = await hashPassword(password);
  const timestamp = nowIso();

  const existing = await db<UserRow>('users').where({ email }).first();

  if (existing) {
    await db('users').where({ id: existing.id }).update({
      password_hash: passwordHash,
      first_name: firstName,
      last_name: lastName,
      role: 'admin',
      is_active: true,
      updated_at: timestamp
    });

    // eslint-disable-next-line no-console
    console.log(`Super user updated: ${email}`);
  } else {
    await db('users').insert({
      email,
      password_hash: passwordHash,
      first_name: firstName,
      last_name: lastName,
      role: 'admin',
      is_active: true,
      created_at: timestamp,
      updated_at: timestamp
    });

    // eslint-disable-next-line no-console
    console.log(`Super user created: ${email}`);
  }
};

void main()
  .catch((error: unknown) => {
    // eslint-disable-next-line no-console
    console.error('Failed to create super user:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.destroy();
  });
