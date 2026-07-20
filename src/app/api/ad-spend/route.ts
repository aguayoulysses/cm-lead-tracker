import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { setAdSpend } from '@/lib/metrics';

const spendSchema = z.object({
  adSetName: z.string().min(1),
  spend: z.number().min(0),
});

export async function PUT(req: NextRequest) {
  const parsed = spendSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid spend' }, { status: 422 });
  }
  await setAdSpend(parsed.data.adSetName, parsed.data.spend);
  return NextResponse.json({ ok: true });
}
