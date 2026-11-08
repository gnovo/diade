import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export interface DatabaseEnv {
  HYPERDRIVE?: {
    connectionString: string;
  };
  DATABASE_URL?: string;
}

export function createDb(env?: DatabaseEnv) {
  const globalProcess = (globalThis as unknown as { process?: { env?: Record<string, string> } })
    .process;
  const connectionString =
    env?.HYPERDRIVE?.connectionString || env?.DATABASE_URL || globalProcess?.env?.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      'Database connection string missing. Ensure HYPERDRIVE binding or DATABASE_URL is set.',
    );
  }

  // Disable prefetch for serverless connection pooling
  const client = postgres(connectionString, {
    prepare: false,
    max: 1, // Workers handle one request per instance
  });

  return drizzle(client, { schema });
}

export type DbClient = ReturnType<typeof createDb>;
