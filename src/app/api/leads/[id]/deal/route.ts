import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { NotFoundError, updateDeal } from '@/lib/leadService';

const dealSchema = z.object({
  oneTimeValue: z.number().min(0),
  mrrValue: z.number().min(0),
  cashCollected: z.number().min(0),
  actor: z.string().optional(),
});

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const parsed = dealSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid deal' }, { status: 422 });
  }
  const { actor, ...deal } = parsed.data;
  try {
    const lead = await updateDeal(Number(id), deal, actor);
    return NextResponse.json({ lead });
  } catch (e) {
    if (e instanceof NotFoundError) return NextResponse.json({ error: e.message }, { status: 404 });
    throw e;
  }
}
