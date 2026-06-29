import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

if (!process.env.SUPABASE_SECRET_KEY) {
  throw new Error('SUPABASE_SECRET_KEY is not set');
}

// Supabase Postgres connection string from the secret key
// Format: postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
const connectionString = process.env.DATABASE_URL!;

const sql = postgres(connectionString, { prepare: false });
export const db = drizzle(sql, { schema });
export type DB = typeof db;
