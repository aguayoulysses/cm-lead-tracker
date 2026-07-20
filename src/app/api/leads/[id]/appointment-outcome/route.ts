import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { logNoShow, NotFoundError, rescheduleAppt } from '@/lib/leadService';

const schema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('no_show'),
    actor: z.string().optional(),
    note: z.string().optional(),
    followUpDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'followUpDate must be YYYY-MM-DD')
      .nullable()
      .optional(),
  }),
  z.object({
    kind: z.literal('rescheduled'),
    newDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'newDate must be YYYY-MM-DD'),
    newTime: z.string().min(1, 'newTime is required'),
    actor: z.string().optional(),
  }),
]);

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 422 });
  }
  try {
    const p = parsed.data;
    const lead =
      p.kind === 'no_show'
        ? await logNoShow(Number(id), p.actor, p.note, p.followUpDate)
        : await rescheduleAppt(Number(id), p.newDate, p.newTime, p.actor);
    return NextResponse.json({ lead });
  } catch (e) {
    if (e instanceof NotFoundError) return NextResponse.json({ error: e.message }, { status: 404 });
    throw e;
  }
}
