import { app } from './app';
import { env } from './config/env';
import { db } from './db/knex';

const start = async (): Promise<void> => {
  try {
    await db.raw('SELECT 1');
    app.listen(env.port, () => {
      // eslint-disable-next-line no-console
      console.log(`API listening on http://localhost:${env.port}`);
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

void start();
