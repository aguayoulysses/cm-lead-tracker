import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq, ne, or } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/client';
import { leads } from '@/db/schema';
import { bucketize } from '@/lib/engine';
import { todayInTz } from '@/lib/dates';
import { createLead } from '@/lib/leadService';

export async function GET(req: NextRequest) {
  const closer = req.nextUrl.searchParams.get('closer') || 'All';
  const view = req.nextUrl.searchParams.get('view') || 'buckets';

  // Directory: every lead regardless of follow-up state, newest first.
  if (view === 'all') {
    const rows = await db
      .select({
        id: leads.id,
        firstName: leads.firstName,
        lastName: leads.lastName,
        phone: leads.phone,
        email: leads.email,
        status: leads.status,
        contactedBy: leads.contactedBy,
        dateSubmitted: leads.dateSubmitted,
        followUpDate: leads.followUpDate,
        followUpNeeded: leads.followUpNeeded,
        oneTimeValue: leads.oneTimeValue,
        mrrValue: leads.mrrValue,
        cashCollected: leads.cashCollected,
        dateClosed: leads.dateClosed,
        adSetName: leads.adSetName,
      })
      .from(leads)
      .orderBy(desc(leads.dateSubmitted), desc(leads.id))
      .limit(1000);
    return NextResponse.json({
      today: todayInTz(),
      leads: rows.map((l) => ({ ...l, name: `${l.firstName} ${l.lastName}`.trim() })),
    });
  }
  // Fresh pool: brand-new, never-contacted leads. Everyone sees these
  // regardless of the closer filter — first contact claims them. Oldest
  // first: the longest-waiting lead is the most urgent (speed to lead).
  const freshRows = await db
    .select({
      id: leads.id,
      firstName: leads.firstName,
      lastName: leads.lastName,
      status: leads.status,
      phone: leads.phone,
      contactedBy: leads.contactedBy,
      followUpDate: leads.followUpDate,
      dateSubmitted: leads.dateSubmitted,
      timeSubmitted: leads.timeSubmitted,
      attempt1At: leads.attempt1At,
      createdAt: leads.createdAt,
    })
    .from(leads)
    .where(and(eq(leads.status, 'New'), eq(leads.followUpNeeded, true)));
  freshRows.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));

  const rows = await db
    .select({
      id: leads.id,
      firstName: leads.firstName,
      lastName: leads.lastName,
      status: leads.status,
      phone: leads.phone,
      contactedBy: leads.contactedBy,
      followUpNeeded: leads.followUpNeeded,
      followUpDate: leads.followUpDate,
    })
    .from(leads)
    .where(
      and(
        eq(leads.followUpNeeded, true),
        ne(leads.status, 'New'),
        // A closer sees their own leads AND the unowned pool (nobody has made
        // contact yet, so those are still up for grabs).
        ...(closer !== 'All' ? [or(eq(leads.contactedBy, closer), eq(leads.contactedBy, ''))!] : []),
      ),
    );

  const today = todayInTz();
  const buckets = bucketize(rows, today);
  const shape = (l: (typeof rows)[number]) => ({
    id: l.id,
    name: `${l.firstName} ${l.lastName}`.trim(),
    status: l.status,
    phone: l.phone,
    by: l.contactedBy,
    date: l.followUpDate,
  });
  return NextResponse.json({
    today,
    fresh: freshRows.map((l) => ({
      id: l.id,
      name: `${l.firstName} ${l.lastName}`.trim(),
      status: l.status,
      phone: l.phone,
      by: l.contactedBy,
      date: l.followUpDate,
      dateSubmitted: l.dateSubmitted,
      timeSubmitted: l.timeSubmitted,
      attempted: !!l.attempt1At,
    })),
    overdue: buckets.overdue.map(shape),
    dueToday: buckets.dueToday.map(shape),
    next7: buckets.next7.map(shape),
  });
}

const newLeadSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  notes: z.string().optional(),
  leadSource: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = newLeadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid lead' }, { status: 422 });
  }
  const id = await createLead({ ...parsed.data, source: 'manual' });
  return NextResponse.json({ id }, { status: 201 });
}
