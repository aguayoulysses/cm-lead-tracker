import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { EngineValidationError } from '@/lib/engine';
import { logOutcome, NotFoundError } from '@/lib/leadService';

const outcomeSchema = z.object({
  status: z.string().min(1, 'Pick an outcome first.'),
  nextDate: z.string().nullable().optional(),
  note: z.string().optional(),
  apptDate: z.string().nullable().optional(),
  apptTime: z.string().nullable().optional(),
  qualified: z.string().nullable().optional(),
  channel: z.string().optional(),
  callTaken: z.boolean().optional(),
  pickedUp: z.boolean().optional(),
  actingCloser: z.string().optional(),
  oneTimeValue: z.number().min(0).nullable().optional(),
  mrrValue: z.number().min(0).nullable().optional(),
  cashCollected: z.number().min(0).nullable().optional(),
});

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json();
  const parsed = outcomeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid outcome' }, { status: 422 });
  }
  try {
    const lead = await logOutcome(Number(id), parsed.data);
    return NextResponse.json({ lead });
  } catch (e) {
    if (e instanceof EngineValidationError) return NextResponse.json({ error: e.message }, { status: 422 });
    if (e instanceof NotFoundError) return NextResponse.json({ error: e.message }, { status: 404 });
    throw e;
  }
}
