import { sqliteTable, text, integer, real, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

// Date-only values are TEXT 'YYYY-MM-DD'; timestamps are TEXT ISO-8601.
// Never round-trip date-only strings through new Date(str) — see src/lib/dates.ts.

export const closers = sqliteTable('closers', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
});

export const lists = sqliteTable(
  'lists',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    kind: text('kind').notNull(), // status | lead_source | lead_type | service_interest
    value: text('value').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [uniqueIndex('lists_kind_value').on(t.kind, t.value)],
);

export const leads = sqliteTable(
  'leads',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    sheetRow: integer('sheet_row').unique(), // original Leads-tab row number (import linkage)
    externalId: text('external_id').unique(), // webhook dedupe
    source: text('source').notNull().default('import'), // import | manual | webhook

    firstName: text('first_name').notNull().default(''),
    lastName: text('last_name').notNull().default(''),
    phone: text('phone').notNull().default(''),
    email: text('email').notNull().default(''),
    notes: text('notes').notNull().default(''),

    dateSubmitted: text('date_submitted'), // YYYY-MM-DD
    timeSubmitted: text('time_submitted').notNull().default(''), // display text e.g. "3:14 PM"
    dayOfWeek: text('day_of_week').notNull().default(''),
    leadSource: text('lead_source').notNull().default(''),
    leadType: text('lead_type').notNull().default(''),
    serviceInterest: text('service_interest').notNull().default(''),

    campaignName: text('campaign_name').notNull().default(''),
    adSetName: text('ad_set_name').notNull().default(''),
    adName: text('ad_name').notNull().default(''),

    status: text('status').notNull().default('New'),
    attempt1At: text('attempt1_at'), // ISO timestamp
    attempt2At: text('attempt2_at'),
    attempt3At: text('attempt3_at'),
    contactedBy: text('contacted_by').notNull().default(''), // closer name, matches sheet semantics
    qualified: text('qualified'), // 'Yes' | 'No' | null

    apptSet: integer('appt_set', { mode: 'boolean' }).notNull().default(false),
    apptDate: text('appt_date'), // YYYY-MM-DD
    apptTime: text('appt_time').notNull().default(''),

    followUpNeeded: integer('follow_up_needed', { mode: 'boolean' }).notNull().default(true),
    followUpDate: text('follow_up_date'), // YYYY-MM-DD

    oneTimeValue: real('one_time_value').notNull().default(0),
    mrrValue: real('mrr_value').notNull().default(0),
    cashCollected: real('cash_collected').notNull().default(0),
    dateClosed: text('date_closed'), // YYYY-MM-DD

    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [
    index('leads_followup').on(t.followUpNeeded, t.followUpDate),
    index('leads_contacted_by').on(t.contactedBy),
    index('leads_status').on(t.status),
    index('leads_appt_date').on(t.apptDate),
    index('leads_ad_set').on(t.adSetName),
    index('leads_date_closed').on(t.dateClosed),
    index('leads_date_submitted').on(t.dateSubmitted),
  ],
);

export const touches = sqliteTable(
  'touches',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    leadId: integer('lead_id').references(() => leads.id),
    leadNameSnapshot: text('lead_name_snapshot').notNull().default(''),
    phoneSnapshot: text('phone_snapshot').notNull().default(''),
    at: text('at').notNull(), // ISO timestamp
    what: text('what').notNull(),
    by: text('by').notNull().default(''),
    nextFollowUp: text('next_follow_up'), // YYYY-MM-DD or null
    note: text('note').notNull().default(''),
    channel: text('channel').notNull().default(''), // Call | Text | Email | DM | ''
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('touches_lead_at').on(t.leadId, t.at), index('touches_at').on(t.at)],
);

export const kpiLog = sqliteTable(
  'kpi_log',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    date: text('date').notNull(), // YYYY-MM-DD
    closer: text('closer').notNull(),
    salesCallsTaken: integer('sales_calls_taken').notNull().default(0),
    offersMade: integer('offers_made').notNull().default(0),
    dials: integer('dials').notNull().default(0),
    pickups: integer('pickups').notNull().default(0),
    noShows: integer('no_shows').notNull().default(0),
    reschedules: integer('reschedules').notNull().default(0),
    cancels: integer('cancels').notNull().default(0),
    leadId: integer('lead_id').references(() => leads.id),
    marker: text('marker'), // 'EOD' | null
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('kpi_date_closer').on(t.date, t.closer)],
);

export const adSpend = sqliteTable('ad_spend', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  adSetName: text('ad_set_name').notNull().unique(),
  spend: real('spend').notNull().default(0),
  updatedAt: text('updated_at').notNull(),
});

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});
