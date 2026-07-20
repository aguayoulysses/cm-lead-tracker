import { NextRequest, NextResponse } from 'next/server';
import { logExtraTouch, NotFoundError } from '@/lib/leadService';

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  try {
    const lead = await logExtraTouch(Number(id), String(body.note ?? ''));
    return NextResponse.json({ lead });
  } catch (e) {
    if (e instanceof NotFoundError) return NextResponse.json({ error: e.message }, { status: 404 });
    throw e;
  }
}
