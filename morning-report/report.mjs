// NNC Issaquah morning report
// Runs overnight from GitHub Actions. Reads yesterday's logs and upcoming
// caterings from Firestore (read-only key) and writes today's page in the
// Notion Daily Checklist with a short report at the top.
//
// Env:
//   FIREBASE_SERVICE_ACCOUNT  full JSON of the read-only service account key
//   NOTION_TOKEN              Notion internal integration secret
//   NOTION_DATABASE_ID        Daily Checklist database id
//   REPORT_DATE (optional)    YYYY-MM-DD to treat as "today" (for re-runs)
//   DRY_RUN=1 (optional)      print the page instead of writing to Notion

const TZ = 'America/Los_Angeles';
const LOC = 'nnc-iss';
const NOTION_VERSION = '2022-06-28';

// ---------- dates (all in Pacific time) ----------
export function todayKey(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
export function addDays(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n, 12));
  return dt.toISOString().slice(0, 10);
}
function weekdayIdx(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
}
export function niceDay(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' });
}
const n = (v) => Number(v) || 0;
function t12(t) {
  if (!t || !/^\d{1,2}:\d{2}/.test(t)) return t || '';
  let [h, m] = t.split(':').map(Number);
  const ap = h >= 12 ? 'pm' : 'am';
  h = h % 12 || 12;
  return m ? `${h}:${String(m).padStart(2, '0')}${ap}` : `${h}${ap}`;
}

// ---------- data ----------
export async function loadData(db, logDate, today) {
  const rec = (col) => db.doc(`${col}/${LOC}/records/${logDate}`).get().then((s) => (s.exists ? s.data() : null));
  const [settings, day, naanPrep, naanUsage, rice, chicken, tikka, produce, packing, varSnap, catSnap] = await Promise.all([
    db.doc('config/settings').get().then((s) => (s.exists ? s.data() : {})),
    db.doc(`days/${logDate}`).get().then((s) => (s.exists ? s.data() : {})),
    rec('naan-roti-prep'), rec('naan-roti-usage'), rec('rice-usage'), rec('chicken-prep'),
    rec('tikka-prep'), rec('produce-prep'), rec('packing-log'),
    db.collection('variance_logs').where('dateKey', '==', logDate).get(),
    db.collection('caterings').where('event.date', '>=', today).where('event.date', '<=', addDays(today, 7)).get(),
  ]);
  return {
    items: settings.items || [], day, naanPrep, naanUsage, rice, chicken, tikka, produce, packing,
    variances: varSnap.docs.map((d) => d.data()),
    caterings: catSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
  };
}

// ---------- analysis (same thresholds as daily-report.html) ----------
export function buildReport(data, logDate, today) {
  const flags = [];   // things that need you: { level: 'red'|'amber', text }
  const sections = []; // { title, lines: [] }
  const red = (text) => flags.push({ level: 'red', text });
  const amber = (text) => flags.push({ level: 'amber', text });
  const dayAbbr = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][weekdayIdx(logDate)];

  // Missing logs: the most common real problem is a log nobody filled in
  const missing = [];
  if (!data.chicken) missing.push('chicken prep');
  if (!data.tikka) missing.push('tikka prep');
  if (!data.rice) missing.push('rice usage');
  if (!data.naanPrep && !data.naanUsage) missing.push('naan/roti');
  if (!data.produce) missing.push('produce prep');
  if (missing.length) red(`No log entered for: ${missing.join(', ')}`);

  // Kitchen + produce daily order
  for (const cat of ['kitchen', 'produce']) {
    const items = data.items.filter((i) => i.category === cat);
    let tracked = 0, ordered = 0;
    for (const item of items) {
      const d = data.day[item.id];
      if (!d) continue;
      tracked++;
      const order = n(d.normalOrder) + n(d.extraOrder);
      ordered += order;
      const par = item.par ? n(item.par[dayAbbr]) : 0;
      if (n(d.pm) === 0 && par > 0) red(`${item.name}: PM count is 0 (par ${par})`);
      if (n(d.extraOrder) > 0) amber(`${item.name}: extra order of ${d.extraOrder} ${item.unit || ''}${cat === 'kitchen' ? `, reason: ${d.reason || 'none given'}` : ''}`.trim());
      if (cat === 'kitchen' && order === 0 && par > 0) amber(`${item.name}: nothing ordered (par ${par})`);
    }
    if (items.length) {
      if (tracked === 0) red(`${cat === 'kitchen' ? 'Kitchen' : 'Produce'} daily order: nothing entered`);
      sections.push({ title: cat === 'kitchen' ? 'Kitchen order' : 'Produce order', lines: [`${tracked} of ${items.length} items counted, ${ordered} units ordered`] });
    }
  }

  // Chicken
  if (data.chicken) {
    const c = data.chicken;
    const cases = n(c.cases_opened), total = n(c.total_chicken_weight) || cases * 40, fat = n(c.weight_fat);
    if (cases === 0) red('No chicken cases processed');
    if (fat > 0 && total > 0 && fat / total > 0.15) amber(`Chicken fat ratio ${(fat / total * 100).toFixed(1)}%, above 15%`);
    sections.push({ title: 'Chicken prep', lines: [`${cases} cases, ${n(c.bags_15lb)} x 15lb bags, ${total} lbs total, ${fat} lbs fat, ${n(c.total_water)} lbs water loss`] });
  }
  // Tikka
  if (data.tikka) {
    const t = data.tikka, waste = n(t.dark_wastage_oz) + n(t.white_wastage_oz);
    if (n(t.total_raw) === 0) red('No tikka raw processed');
    if (waste > 32) amber(`Tikka waste ${waste} oz, over 2 lbs`);
    sections.push({ title: 'Tikka prep', lines: [`${n(t.total_raw)} lbs raw, ${n(t.total_cooked)} lbs cooked, ${n(t.total_cut)} lbs cut, ${waste} oz waste`] });
  }
  // Rice
  if (data.rice) {
    const made = n(data.rice.rice_made), left = n(data.rice.rice_pm);
    if (made === 0) red('No rice made');
    if (left > 2) amber(`${left} pots of rice left over`);
    sections.push({ title: 'Rice', lines: [`${made} pots made, ${made - left} used, ${left} left over`] });
  }
  // Naan / roti
  if (data.naanPrep || data.naanUsage) {
    const p = data.naanPrep || {}, u = data.naanUsage || {};
    if (data.naanPrep && n(p.naan_batches) === 0) red('No naan batches prepped');
    if (n(u.naan_waste) > 2) amber(`Naan waste ${u.naan_waste} trays`);
    if (n(u.roti_waste) > 1) amber(`Roti waste ${u.roti_waste} trays`);
    const lines = [];
    if (data.naanPrep) lines.push(`Prep: ${n(p.naan_batches)} naan batches (${n(p.naan_total_doughballs)} balls), ${n(p.roti_total_doughballs)} roti balls`);
    if (data.naanUsage) lines.push(`Used: ${n(u.naan_usage)} naan trays (${n(u.naan_waste)} waste), ${n(u.roti_usage)} roti trays (${n(u.roti_waste)} waste)`);
    sections.push({ title: 'Naan and roti', lines });
  }
  // Produce prep
  if (data.produce) {
    const p = data.produce;
    if (n(p.onion_bags) === 0) amber('No onions prepped');
    if (n(p.potato_pounds) === 0) amber('No potatoes prepped');
    sections.push({ title: 'Produce prep', lines: [`${n(p.onion_bags)} onion bags, ${n(p.potato_pounds)} lbs potato, paneer ${n(p.paneer_large)} large / ${n(p.paneer_small)} small`] });
  }

  // Variances staff explained during the day
  for (const v of data.variances) {
    amber(`Variance on ${v.itemName || v.itemId}: entered ${v.enteredValue} (expected up to ${v.expectedMax}). ${v.explanation || v.reason} (${v.enteredBy})`);
  }

  // Caterings: today and tomorrow in detail, the rest of the week as a count
  const live = data.caterings.filter((c) => c.status !== 'cancelled' && c.status !== 'completed' && c.event && c.event.date);
  live.sort((a, b) => (a.event.date + (a.fulfillment?.readyTime || '')).localeCompare(b.event.date + (b.fulfillment?.readyTime || '')));
  const name = (c) => { const x = c.customer || {}; return `${x.firstName || ''} ${x.lastName || ''}`.trim() || x.name || '(no name)'; };
  const catLines = [];
  for (const c of live) {
    const when = c.event.date === today ? 'Today' : c.event.date === addDays(today, 1) ? 'Tomorrow' : null;
    if (!when) continue;
    const f = c.fulfillment || {};
    const mode = f.mode === 'pickup' ? `pickup ${t12(f.pickupTime || f.readyTime)}` : `${f.mode || 'delivery'}, leaves ${t12(f.departureTime) || '?'}`;
    catLines.push(`${when}: ${name(c)}, ${n(c.guests?.total)} guests, ready by ${t12(f.readyTime) || '?'} (${mode}) [${c.status}]`);
    if (c.status !== 'confirmed') red(`${when}'s catering for ${name(c)} is still "${c.status}", not confirmed`);
    if (when === 'Today' && !f.readyTime) amber(`Today's catering for ${name(c)} has no ready-by time`);
  }
  const later = live.filter((c) => c.event.date > addDays(today, 1)).length;
  if (later) catLines.push(`${later} more in the next 7 days`);
  sections.unshift({ title: 'Caterings', lines: catLines.length ? catLines : ['None today or tomorrow'] });

  return { flags, sections };
}

// ---------- Notion ----------
const txt = (content, opts = {}) => ({ type: 'text', text: { content: String(content).slice(0, 1900) }, annotations: opts });
const para = (s, opts) => ({ object: 'block', type: 'paragraph', paragraph: { rich_text: [txt(s, opts)] } });
const bullet = (s) => ({ object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [txt(s)] } });
const h3 = (s) => ({ object: 'block', type: 'heading_3', heading_3: { rich_text: [txt(s)] } });

export function toBlocks(report, logDate) {
  const blocks = [];
  const reds = report.flags.filter((f) => f.level === 'red');
  const ambers = report.flags.filter((f) => f.level === 'amber');
  const headline = report.flags.length
    ? `${reds.length} urgent, ${ambers.length} to look at`
    : 'Nothing flagged. All logs in, nothing out of range.';
  blocks.push({
    object: 'block', type: 'callout',
    callout: {
      icon: { type: 'emoji', emoji: reds.length ? '🔴' : ambers.length ? '🟡' : '🟢' },
      color: reds.length ? 'red_background' : ambers.length ? 'yellow_background' : 'green_background',
      rich_text: [txt(`Issaquah morning report: ${headline}`, { bold: true }), txt(`\nLogs from ${niceDay(logDate)}. Check "Handled report flags" once you've dealt with these.`)],
    },
  });
  for (const f of reds) blocks.push(bullet(`🔴 ${f.text}`));
  for (const f of ambers) blocks.push(bullet(`🟡 ${f.text}`));
  for (const s of report.sections) {
    blocks.push(h3(s.title));
    for (const l of s.lines) blocks.push(bullet(l));
  }
  blocks.push(para(`Generated ${new Date().toLocaleString('en-US', { timeZone: TZ })} from the NNC app.`, { italic: true, color: 'gray' }));
  return blocks.slice(0, 100);
}

async function notion(path, method, body) {
  const res = await fetch(`https://api.notion.com/v1/${path}`, {
    method,
    headers: { Authorization: `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': NOTION_VERSION, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Notion ${method} ${path} failed: ${res.status} ${json.message || JSON.stringify(json)}`);
  return json;
}

async function writeToNotion(today, blocks) {
  const dbId = process.env.NOTION_DATABASE_ID;
  // Reuse today's page if it already exists (made by hand or by an earlier run)
  const found = await notion(`databases/${dbId}/query`, 'POST', { filter: { property: 'Date', date: { equals: today } } });
  if (found.results.length) {
    const pageId = found.results[0].id;
    await notion(`blocks/${pageId}/children`, 'PATCH', { children: blocks });
    return `updated ${found.results[0].url}`;
  }
  const page = await notion('pages', 'POST', {
    parent: { database_id: dbId },
    icon: { type: 'emoji', emoji: '☀️' },
    properties: {
      Day: { title: [txt(niceDay(today))] },
      Date: { date: { start: today } },
    },
    children: blocks,
  });
  return `created ${page.url}`;
}

// ---------- main ----------
async function main() {
  const today = process.env.REPORT_DATE || todayKey();
  const logDate = addDays(today, -1);
  const admin = (await import('firebase-admin')).default;
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
  const data = await loadData(admin.firestore(), logDate, today);
  const report = buildReport(data, logDate, today);
  const blocks = toBlocks(report, logDate);
  if (process.env.DRY_RUN) { console.log(JSON.stringify(blocks, null, 2)); return; }
  console.log(await writeToNotion(today, blocks));
  console.log(`${report.flags.length} flags for ${today}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
