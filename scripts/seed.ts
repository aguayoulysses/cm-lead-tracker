import { db } from '../src/db/client';
import { closers, lists, settings } from '../src/db/schema';

// Baseline seed — the real roster/lists come from the sheet import, but this
// makes a fresh clone usable without import files.

const CLOSERS = ['Ulysses', 'Jack', 'Cody'];

const STATUSES = [
  'New',
  'Attempted - No Answer',
  'Left Voicemail',
  'Contacted',
  'Nurture',
  'Booked',
  'Closed Won',
  'Closed Lost',
  'Not Interested',
  'Bad Number',
  'Disqualified',
];

async function main() {
  for (let i = 0; i < CLOSERS.length; i++) {
    await db
      .insert(closers)
      .values({ name: CLOSERS[i], sortOrder: i })
      .onConflictDoNothing();
  }
  for (let i = 0; i < STATUSES.length; i++) {
    await db
      .insert(lists)
      .values({ kind: 'status', value: STATUSES[i], sortOrder: i })
      .onConflictDoNothing();
  }
  const defaults: Record<string, string> = {
    'commission.oneTimeRate': '0',
    'commission.mrrRate': '0',
    'commission.mrrFactor': '0',
    'app.timezone': process.env.APP_TZ || 'America/Chicago',
  };
  for (const [key, value] of Object.entries(defaults)) {
    await db.insert(settings).values({ key, value }).onConflictDoNothing();
  }
  console.log('Seeded closers, statuses, settings.');
}

main().then(() => process.exit(0));
