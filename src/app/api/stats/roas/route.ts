import { NextRequest, NextResponse } from 'next/server';
import { adsForAdSet, roasByAdSet } from '@/lib/metrics';

export async function GET(req: NextRequest) {
  const adSet = req.nextUrl.searchParams.get('adSet');
  if (adSet) {
    return NextResponse.json(await adsForAdSet(adSet));
  }
  return NextResponse.json(await roasByAdSet());
}
