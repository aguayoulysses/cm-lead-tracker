import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import path from 'node:path';
import * as schema from './schema';

// Resolve relative to the project root so API routes and scripts agree on the file.
const url = process.env.DATABASE_URL ?? `file:${path.join(process.cwd(), 'data', 'cm.db')}`;

const client = createClient({ url: url.startsWith('file:./') ? `file:${path.join(process.cwd(), url.slice(5))}` : url });

export const db = drizzle(client, { schema });
export type Db = typeof db;
