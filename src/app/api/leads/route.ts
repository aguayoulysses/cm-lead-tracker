import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
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
    .where(and(eq(leads.followUpNeeded, true), ...(closer !== 'All' ? [eq(leads.contactedBy, closer)] : [])));

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
