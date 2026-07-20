import { NextRequest, NextResponse } from 'next/server';
import { and, eq, gte, inArray, lt, or } from 'drizzle-orm';
import { db } from '@/db/client';
import { leads, touches } from '@/db/schema';
import { addDays, todayInTz } from '@/lib/dates';

/**
 * Appointments for a day (default today), each flagged with whether an update
 * has been logged since that day started. Every appointment is expected to get
 * an outcome — the flag drives the "Needs update" / "Updated" UI.
 */
export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get('date') || todayInTz();
  const closer = req.nextUrl.searchParams.get('closer') || 'All';
  const closerCond = closer !== 'All' ? [or(eq(leads.contactedBy, closer), eq(leads.contactedBy, ''))!] : [];

  const rows = await db
    .select({
      id: leads.id,
      firstName: leads.firstName,
      lastName: leads.lastName,
      phone: leads.phone,
      status: leads.status,
      contactedBy: leads.contactedBy,
      apptDate: leads.apptDate,
      apptTime: leads.apptTime,
    })
    .from(leads)
    .where(and(eq(leads.apptDate, date), ...closerCond));

  let updatedIds = new Set<number>();
  if (rows.length) {
    const touched = await db
      .select({ leadId: touches.leadId })
      .from(touches)
      .where(
        and(
          inArray(touches.leadId, rows.map((r) => r.id)),
          gte(touches.at, `${date}T00:00:00`),
          lt(touches.at, `${addDays(date, 1)}T00:00:00`),
        ),
      );
    updatedIds = new Set(touched.map((t) => t.leadId).filter((x): x is number => x != null));
  }

  rows.sort((a, b) => (a.apptTime < b.apptTime ? -1 : 1));
  return NextResponse.json({
    date,
    appointments: rows.map((r) => ({
      id: r.id,
      name: `${r.firstName} ${r.lastName}`.trim(),
      phone: r.phone,
      status: r.status,
      by: r.contactedBy,
      time: r.apptTime,
      updated: updatedIds.has(r.id),
    })),
  });
}
