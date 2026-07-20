import { NextResponse } from 'next/server';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { closers } from '@/db/schema';

export async function GET() {
  const rows = await db.query.closers.findMany({
    where: eq(closers.active, true),
    orderBy: [asc(closers.sortOrder)],
  });
  return NextResponse.json(rows.map((r) => ({ id: r.id, name: r.name })));
}
