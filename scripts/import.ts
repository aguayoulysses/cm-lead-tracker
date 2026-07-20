/**
 * One-time cutover import from the "C.M Lead Tracking V2" Google Sheet.
 *
 * Input: tab-separated dumps (copy/paste of each tab) in data/import/:
 *   Leads.tsv, TouchLog.tsv, KPILog.tsv, Lists.tsv
 * Run:  pnpm import
 *
 * Wipe-and-reload inside one transaction; safe to re-run while iterating.
 * Leads parse errors are fatal; touch/KPI linkage problems are warnings.
 */
import fs from 'node:fs';
import path from 'node:path';
import { db } from '../src/db/client';
import { closers, kpiLog, leads, lists, touches } from '../src/db/schema';
import { dayOfWeek, nowInTz, parseSheetDate, parseSheetTimestamp, todayInTz } from '../src/lib/dates';
import { normalizeFollowUp } from '../src/lib/engine';

const IMPORT_DIR = path.join(process.cwd(), 'data', 'import');

// ---------- TSV parsing (Google Sheets clipboard format) ----------
// Cells containing tabs/newlines arrive wrapped in double quotes with "" escapes.
function parseTsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  let i = 0;
  const s = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  while (i < s.length) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      cell += ch;
      i++;
      continue;
    }
    if (ch === '"' && cell === '') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === '\t') {
      row.push(cell);
      cell = '';
      i++;
      continue;
    }
    if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      i++;
      continue;
    }
    cell += ch;
    i++;
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  // Drop fully-empty trailing rows.
  while (rows.length && rows[rows.length - 1].every((c) => c.trim() === '')) rows.pop();
  return rows;
}

// ---------- header resolution (port of the sheet's norm_/cols_) ----------
function norm(s: string): string {
  return String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function headerMap(hdr: string[]): Map<string, number> {
  const map = new Map<string, number>();
  hdr.forEach((h, i) => {
    const k = norm(h);
    if (k && !map.has(k)) map.set(k, i);
  });
  return map;
}

function makeFind(map: Map<string, number>, context: string) {
  return {
    find(name: string): number {
      const n = norm(name);
      if (map.has(n)) return map.get(n)!;
      for (const [k, v] of map) if (k.startsWith(n)) return v;
      throw new Error(`[${context}] Missing column: ${name}`);
    },
    opt(name: string): number {
      try {
        return this.find(name);
      } catch {
        return -1;
      }
    },
  };
}

// ---------- value parsing ----------
function money(s: string): number {
  const n = Number(String(s).replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
}
function intOr0(s: string): number {
  const n = Number(String(s).replace(/[,\s]/g, ''));
  return Number.isFinite(n) ? Math.round(n) : 0;
}
function yes(s: string): boolean {
  return String(s).trim().toLowerCase() === 'yes' || String(s).trim().toLowerCase() === 'true';
}

function readTsv(name: string): string[][] {
  const p = path.join(IMPORT_DIR, name);
  if (!fs.existsSync(p)) {
    console.error(`Missing ${p} — dump the sheet tab there first.`);
    process.exit(1);
  }
  return parseTsv(fs.readFileSync(p, 'utf8'));
}

async function main() {
  const warnings: string[] = [];
  const now = nowInTz();
  const today = todayInTz();

  // ----- Lists -----
  const listRows = readTsv('Lists.tsv');
  const listHeader = listRows[0] ?? [];
  const listData = listRows.slice(1);
  const kinds = ['lead_source', 'lead_type', 'service_interest', 'status'] as const; // cols A-D
  const listValues: { kind: string; value: string; sortOrder: number }[] = [];
  for (let c = 0; c < kinds.length; c++) {
    let order = 0;
    for (const r of listData) {
      const v = String(r[c] ?? '').trim();
      if (v) listValues.push({ kind: kinds[c], value: v, sortOrder: order++ });
    }
  }
  const closerNames: string[] = [];
  for (const r of listData) {
    const v = String(r[4] ?? '').trim(); // col E
    if (v && !closerNames.includes(v)) closerNames.push(v);
  }

  // ----- Leads -----
  const leadRows = readTsv('Leads.tsv');
  const lh = makeFind(headerMap(leadRows[0] ?? []), 'Leads');
  const col = {
    first: lh.find('First Name'),
    last: lh.find('Last Name'),
    phone: lh.find('Phone Number'),
    dateSub: lh.find('Date Submitted'),
    src: lh.find('Lead Source'),
    adset: lh.find('Ad Set Name'),
    adname: lh.find('Ad Name'),
    ltype: lh.find('Lead Type'),
    interest: lh.find('Service Interest'),
    email: lh.find('Email Address'),
    notes: lh.find('Lead Notes'),
    campaign: lh.find('Campaign Name'),
    status: lh.find('Contact Status'),
    a1: lh.find('First Contact Attempt'),
    a2: lh.find('Second Contact Attempt'),
    a3: lh.find('Third Contact Attempt'),
    by: lh.find('Contacted By'),
    apptSet: lh.find('Appointment Set'),
    apptDate: lh.find('Appointment Date'),
    apptTime: lh.find('Appointment Time'),
    qual: lh.find('Qualified'),
    fuNeed: lh.find('Follow-Up Needed'),
    fuDate: lh.find('Follow-Up Date'),
    oneTime: lh.find('One-Time Value'),
    mrr: lh.find('MRR Value'),
    cash: lh.opt('Cash Collected'),
    timeSub: lh.opt('Time Submitted'),
    dateClosed: lh.opt('Date Closed'),
  };

  interface ParsedLead {
    sheetRow: number;
    values: typeof leads.$inferInsert;
  }
  const parsedLeads: ParsedLead[] = [];
  const leadErrors: string[] = [];
  leadRows.slice(1).forEach((r, i) => {
    const sheetRow = i + 2;
    const first = String(r[col.first] ?? '').trim();
    const last = String(r[col.last] ?? '').trim();
    const status = String(r[col.status] ?? '').trim();
    // Skip rows that are truly empty (padding at the bottom of the sheet).
    if (!first && !last && !status && !String(r[col.phone] ?? '').trim()) return;

    const dateSubmitted = parseSheetDate(r[col.dateSub]);
    if (String(r[col.dateSub] ?? '').trim() && !dateSubmitted) {
      leadErrors.push(`Row ${sheetRow}: unparseable Date Submitted "${r[col.dateSub]}"`);
    }
    const fuDate = parseSheetDate(r[col.fuDate]);
    const norm = normalizeFollowUp({ status, followUpDate: fuDate }, today);

    parsedLeads.push({
      sheetRow,
      values: {
        sheetRow,
        source: 'import',
        firstName: first,
        lastName: last,
        phone: String(r[col.phone] ?? '').trim(),
        email: String(r[col.email] ?? '').trim(),
        notes: String(r[col.notes] ?? '').trim(),
        dateSubmitted,
        timeSubmitted: col.timeSub >= 0 ? String(r[col.timeSub] ?? '').trim() : '',
        dayOfWeek: dateSubmitted ? dayOfWeek(dateSubmitted) : '',
        leadSource: String(r[col.src] ?? '').trim(),
        leadType: String(r[col.ltype] ?? '').trim(),
        serviceInterest: String(r[col.interest] ?? '').trim(),
        campaignName: String(r[col.campaign] ?? '').trim(),
        adSetName: String(r[col.adset] ?? '').trim(),
        adName: String(r[col.adname] ?? '').trim(),
        status: status || 'New',
        attempt1At: parseSheetTimestamp(r[col.a1]),
        attempt2At: parseSheetTimestamp(r[col.a2]),
        attempt3At: parseSheetTimestamp(r[col.a3]),
        contactedBy: String(r[col.by] ?? '').trim(),
        qualified: yes(r[col.qual]) ? 'Yes' : String(r[col.qual] ?? '').trim() === 'No' ? 'No' : null,
        apptSet: yes(r[col.apptSet]),
        apptDate: parseSheetDate(r[col.apptDate]),
        apptTime: String(r[col.apptTime] ?? '').trim(),
        followUpNeeded: norm ? norm.followUpNeeded : yes(r[col.fuNeed]),
        followUpDate: norm ? norm.followUpDate : fuDate,
        oneTimeValue: money(r[col.oneTime]),
        mrrValue: money(r[col.mrr]),
        cashCollected: col.cash >= 0 ? money(r[col.cash]) : 0,
        dateClosed: col.dateClosed >= 0 ? parseSheetDate(r[col.dateClosed]) : null,
        createdAt: now,
        updatedAt: now,
      },
    });
  });

  if (leadErrors.length) {
    console.error('FATAL lead parse errors:\n' + leadErrors.join('\n'));
    process.exit(1);
  }

  // ----- Touch Log -----
  const touchRows = readTsv('TouchLog.tsv');
  const th = makeFind(headerMap(touchRows[0] ?? []), 'TouchLog');
  const tc = {
    ts: th.find('Timestamp'),
    lead: th.find('Lead'),
    phone: th.find('Phone'),
    what: th.find('What happened'),
    by: th.find('Contacted By'),
    next: th.find('Next Follow-Up'),
    note: th.find('Note'),
    row: th.find('Lead Row'),
    channel: th.opt('Channel'),
  };

  // ----- KPI Log -----
  const kpiRows = readTsv('KPILog.tsv');
  const kh = makeFind(headerMap(kpiRows[0] ?? []), 'KPILog');
  const kc = {
    date: kh.find('Date'),
    closer: kh.find('Closer'),
    taken: kh.find('Sales Calls Taken'),
    offers: kh.find('Offers Made'),
    dials: kh.find('Dials'),
    pickups: kh.find('Pickups'),
    noShows: kh.find('No-Shows'),
    resch: kh.find('Reschedules'),
    cancels: kh.find('Cancels'),
    row: kh.find('Lead Row'),
  };

  // ----- Load everything in one transaction -----
  let touchOrphans = 0;
  let touchNameFallbacks = 0;
  let kpiOrphans = 0;

  await db.transaction(async (tx) => {
    await tx.delete(touches);
    await tx.delete(kpiLog);
    await tx.delete(leads);
    await tx.delete(lists);

    for (const lv of listValues) await tx.insert(lists).values(lv);
    for (let i = 0; i < closerNames.length; i++) {
      await tx
        .insert(closers)
        .values({ name: closerNames[i], sortOrder: i })
        .onConflictDoUpdate({ target: closers.name, set: { sortOrder: i, active: true } });
    }

    const idBySheetRow = new Map<number, { id: number; name: string }>();
    for (const p of parsedLeads) {
      const inserted = await tx.insert(leads).values(p.values).returning({ id: leads.id });
      idBySheetRow.set(p.sheetRow, {
        id: inserted[0].id,
        name: `${p.values.firstName} ${p.values.lastName}`.trim(),
      });
    }
    const idByName = new Map<string, number>();
    for (const { id, name } of idBySheetRow.values()) {
      if (name && !idByName.has(name.toLowerCase())) idByName.set(name.toLowerCase(), id);
    }

    for (const r of touchRows.slice(1)) {
      const at = parseSheetTimestamp(r[tc.ts]) ?? now;
      const leadName = String(r[tc.lead] ?? '').trim();
      const rowNum = Number(String(r[tc.row] ?? '').trim());
      let leadId: number | null = null;
      if (Number.isFinite(rowNum) && rowNum >= 2 && idBySheetRow.has(rowNum)) {
        const link = idBySheetRow.get(rowNum)!;
        if (!leadName || link.name.toLowerCase() === leadName.toLowerCase()) {
          leadId = link.id;
        } else {
          // Lead Row points at a different name — sheet rows may have shifted.
          const byName = idByName.get(leadName.toLowerCase());
          if (byName) {
            leadId = byName;
            touchNameFallbacks++;
          } else {
            touchOrphans++;
          }
        }
      } else {
        const byName = idByName.get(leadName.toLowerCase());
        if (byName) {
          leadId = byName;
          touchNameFallbacks++;
        } else {
          touchOrphans++;
        }
      }
      await tx.insert(touches).values({
        leadId,
        leadNameSnapshot: leadName,
        phoneSnapshot: String(r[tc.phone] ?? '').trim(),
        at,
        what: String(r[tc.what] ?? '').trim(),
        by: String(r[tc.by] ?? '').trim(),
        nextFollowUp: parseSheetDate(r[tc.next]),
        note: String(r[tc.note] ?? '').trim(),
        channel: tc.channel >= 0 ? String(r[tc.channel] ?? '').trim() : '',
        createdAt: now,
      });
    }

    for (const r of kpiRows.slice(1)) {
      const date = parseSheetDate(r[kc.date]);
      if (!date) continue;
      const rawRow = String(r[kc.row] ?? '').trim();
      const isEod = rawRow.toUpperCase() === 'EOD';
      let leadId: number | null = null;
      if (!isEod) {
        const rowNum = Number(rawRow);
        if (Number.isFinite(rowNum) && idBySheetRow.has(rowNum)) leadId = idBySheetRow.get(rowNum)!.id;
        else if (rawRow) kpiOrphans++;
      }
      await tx.insert(kpiLog).values({
        date,
        closer: String(r[kc.closer] ?? '').trim(),
        salesCallsTaken: intOr0(r[kc.taken]),
        offersMade: intOr0(r[kc.offers]),
        dials: intOr0(r[kc.dials]),
        pickups: intOr0(r[kc.pickups]),
        noShows: intOr0(r[kc.noShows]),
        reschedules: intOr0(r[kc.resch]),
        cancels: intOr0(r[kc.cancels]),
        leadId,
        marker: isEod ? 'EOD' : null,
        createdAt: now,
      });
    }
  });

  console.log('Import complete:');
  console.log(`  leads:    ${parsedLeads.length}`);
  console.log(`  touches:  ${touchRows.length - 1} (${touchNameFallbacks} linked by name fallback, ${touchOrphans} orphaned)`);
  console.log(`  kpi rows: ${kpiRows.length - 1} (${kpiOrphans} with unresolvable lead row)`);
  console.log(`  lists:    ${listValues.length} values, closers: ${closerNames.join(', ')}`);
  if (warnings.length) console.log('Warnings:\n' + warnings.join('\n'));
}

main().then(() => process.exit(0));
