import { NextRequest, NextResponse } from 'next/server';
import { scorecard } from '@/lib/metrics';
import { todayInTz } from '@/lib/dates';

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const today = todayInTz();
  const from = p.get('from') || `${today.slice(0, 7)}-01`; // month-to-date default
  const to = p.get('to') || today;
  const closer = p.get('closer') || 'All';
  const data = await scorecard({ closer, from, to });
  return NextResponse.json({ closer, from, to, ...data });
}
