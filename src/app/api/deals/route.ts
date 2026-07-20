import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { logDirectDeal } from '@/lib/leadService';

const dealSchema = z.object({
  firstName: z.string().min(1, 'Buyer first name is required'),
  lastName: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  leadSource: z.string().optional(),
  notes: z.string().optional(),
  closer: z.string().min(1, 'Pick the closer who gets credit'),
  oneTimeValue: z.number().min(0),
  mrrValue: z.number().min(0),
  cashCollected: z.number().min(0),
  closedDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
});

export async function POST(req: NextRequest) {
  const parsed = dealSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid deal' }, { status: 422 });
  }
  const leadId = await logDirectDeal(parsed.data);
  return NextResponse.json({ leadId }, { status: 201 });
}
