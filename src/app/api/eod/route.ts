import { NextRequest, NextResponse } from 'next/server';
import { and, asc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/client';
import { closers, kpiLog, leads } from '@/db/schema';
import { todayInTz } from '@/lib/dates';
import { saveEod } from '@/lib/leadService';

// End-of-day report: per closer, today's sales-call count (appts today, like the
// sheet's Calendar EOD block) plus whether their EOD row is already saved.
export async function GET() {
  const today = todayInTz();
  const roster = await db.query.closers.findMany({
    where: eq(closers.active, true),
    orderBy: [asc(closers.sortOrder)],
  });
  const out = [];
  for (const c of roster) {
    const callsRows = await db
      .select({ n: sql<number>`count(*)` })
      .from(leads)
      .where(and(eq(leads.apptDate, today), eq(leads.contactedBy, c.name)));
    const eodRow = await db.query.kpiLog.findFirst({
      where: and(eq(kpiLog.date, today), eq(kpiLog.closer, c.name), eq(kpiLog.marker, 'EOD')),
    });
    out.push({
      closer: c.name,
      salesCallsToday: callsRows[0].n,
      done: !!eodRow,
      noShows: eodRow?.noShows ?? null,
      reschedules: eodRow?.reschedules ?? null,
    });
  }
  return NextResponse.json({ date: today, closers: out });
}

const eodSchema = z.object({
  closer: z.string().min(1),
  noShows: z.number().int().min(0),
  reschedules: z.number().int().min(0),
});

export async function POST(req: NextRequest) {
  const parsed = eodSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid EOD' }, { status: 422 });
  }
  await saveEod(parsed.data.closer, parsed.data.noShows, parsed.data.reschedules);
  return NextResponse.json({ ok: true });
}
