import { NextRequest, NextResponse } from 'next/server';
import { and, eq, or } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/client';
import { leads } from '@/db/schema';
import { createLead } from '@/lib/leadService';
import { parseSheetDate, todayInTz } from '@/lib/dates';

/**
 * DORMANT lead-intake webhook. See docs/WEBHOOK-SETUP.md for the full
 * integration SOP. Enable with WEBHOOK_ENABLED=1 + WEBHOOK_TOKEN in .env.local.
 */

const payloadSchema = z.object({
  externalId: z.string().optional(),
  firstName: z.string().min(1, 'firstName is required'),
  lastName: z.string().optional().default(''),
  phone: z.string().optional().default(''),
  email: z.string().optional().default(''),
  dateSubmitted: z.string().optional(), // YYYY-MM-DD or M/d/yyyy; defaults to today
  timeSubmitted: z.string().optional().default(''),
  leadSource: z.string().optional().default(''),
  leadType: z.string().optional().default(''),
  serviceInterest: z.string().optional().default(''),
  campaignName: z.string().optional().default(''),
  adSetName: z.string().optional().default(''),
  adName: z.string().optional().default(''),
  notes: z.string().optional().default(''),
});

export async function POST(req: NextRequest) {
  if (process.env.WEBHOOK_ENABLED !== '1') {
    return NextResponse.json({ error: 'webhook disabled' }, { status: 503 });
  }
  const auth = req.headers.get('authorization') ?? '';
  const token = process.env.WEBHOOK_TOKEN ?? '';
  if (!token || auth !== `Bearer ${token}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const parsed = payloadSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') },
      { status: 422 },
    );
  }
  const p = parsed.data;
  const dateSubmitted = parseSheetDate(p.dateSubmitted) ?? todayInTz();

  // Dedupe: externalId first, then (phone or email) + same submit date.
  if (p.externalId) {
    const dup = await db.query.leads.findFirst({ where: eq(leads.externalId, p.externalId) });
    if (dup) return NextResponse.json({ deduped: true, leadId: dup.id });
  }
  if (p.phone || p.email) {
    const dup = await db.query.leads.findFirst({
      where: and(
        eq(leads.dateSubmitted, dateSubmitted),
        or(...(p.phone ? [eq(leads.phone, p.phone)] : []), ...(p.email ? [eq(leads.email, p.email)] : [])),
      ),
    });
    if (dup) return NextResponse.json({ deduped: true, leadId: dup.id });
  }

  const leadId = await createLead({
    ...p,
    dateSubmitted,
    externalId: p.externalId || null,
    source: 'webhook',
  });
  return NextResponse.json({ leadId }, { status: 201 });
}
