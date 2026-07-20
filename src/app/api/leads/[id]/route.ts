import { NextRequest, NextResponse } from 'next/server';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { lists } from '@/db/schema';
import { getLeadCard, NotFoundError } from '@/lib/leadService';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const card = await getLeadCard(Number(id));
    const statusRows = await db.query.lists.findMany({
      where: eq(lists.kind, 'status'),
      orderBy: [asc(lists.sortOrder)],
    });
    return NextResponse.json({ ...card, statuses: statusRows.map((s) => s.value) });
  } catch (e) {
    if (e instanceof NotFoundError) return NextResponse.json({ error: e.message }, { status: 404 });
    throw e;
  }
}
