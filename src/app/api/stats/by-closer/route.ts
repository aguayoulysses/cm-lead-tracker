import { NextRequest, NextResponse } from 'next/server';
import { byCloser } from '@/lib/metrics';

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const from = p.get('from');
  const to = p.get('to');
  const rows = await byCloser(from && to ? { from, to } : undefined);
  return NextResponse.json(rows);
}
