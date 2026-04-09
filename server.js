const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const nodemailer = require('nodemailer');
const { XMLParser } = require('fast-xml-parser');

const app = express();
const IS_VERCEL = process.env.VERCEL === '1';
const PORT = Number(process.env.PORT || 3000);
const BASE_URL = process.env.BASE_URL || '';

const DATA_PATH = IS_VERCEL ? '/tmp/data.json' : path.join(__dirname, 'data.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

const MAIL_PROVIDER = (process.env.MAIL_PROVIDER || 'korea').toLowerCase();
const smtpDefaults = MAIL_PROVIDER === 'korea'
  ? { host: 'smtp.korea.com', port: 465, secure: true }
  : { host: '', port: 587, secure: false };

const SMTP_HOST = process.env.SMTP_HOST || smtpDefaults.host;
const SMTP_PORT = Number(process.env.SMTP_PORT || smtpDefaults.port);
const SMTP_SECURE = (process.env.SMTP_SECURE || String(smtpDefaults.secure)).toLowerCase() === 'true';
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER || 'no-reply@example.com';

const RSS_SOURCES = [
  { source_name: 'MOEL', category: 'Law Amendments', url: 'https://www.moel.go.kr/rss/release/law.xml' },
  { source_name: 'MOEL', category: 'Administrative Interpretation', url: 'https://www.moel.go.kr/rss/policy/interpretation.xml' },
  { source_name: 'MOEL', category: 'Guidelines', url: 'https://www.moel.go.kr/rss/policy/guideline.xml' },
  { source_name: 'Supreme Court', category: 'Court Cases', url: 'https://www.scourt.go.kr/portal/information/events/rss.xml' },
  { source_name: 'NLRC', category: 'Labor Commission Decisions', url: 'https://www.nlrc.go.kr/rss/case.xml' },
  { source_name: 'MOEL', category: 'Amendment Briefings', url: 'https://www.moel.go.kr/rss/news/explain.xml' }
];

const FIELD_KEYWORDS = {
  'Labor Standards': ['work', 'leave', 'holiday', 'labor standards'],
  'Wages and Retirement': ['wage', 'minimum wage', 'retirement', 'pension'],
  'Labor Relations': ['union', 'collective', 'strike', 'labor relations'],
  'Safety and Health': ['safety', 'accident', 'health', 'risk'],
  'Non-Regular and Discrimination': ['fixed term', 'dispatch', 'non-regular', 'discrimination'],
  'Employment Insurance and Support': ['employment insurance', 'benefit', 'support']
};

function makeId(length = 10) {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`.slice(0, length);
}

function defaultState() {
  return {
    events: [],
    attendees: [],
    labor_news: [],
    report_logs: [],
    seq: { attendee: 1, news: 1, log: 1 }
  };
}

function loadState() {
  try {
    if (!fs.existsSync(DATA_PATH)) return defaultState();
    const parsed = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
    return {
      events: parsed.events || [],
      attendees: parsed.attendees || [],
      labor_news: parsed.labor_news || [],
      report_logs: parsed.report_logs || [],
      seq: parsed.seq || { attendee: 1, news: 1, log: 1 }
    };
  } catch {
    return defaultState();
  }
}

let state = loadState();

function saveState() {
  try {
    fs.writeFileSync(DATA_PATH, JSON.stringify(state, null, 2), 'utf8');
  } catch {
    // no-op for serverless ephemeral fs failures
  }
}

function requiredString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function isValidPhone(phone) {
  return /^[0-9+\-\s]{9,20}$/.test(phone);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function resolveBaseUrl(req) {
  if (BASE_URL && !BASE_URL.includes('localhost')) return BASE_URL;
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}

function monthKeyFromDate(dateValue) {
  const d = new Date(dateValue);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function monthKeyNow() {
  return monthKeyFromDate(new Date().toISOString());
}

function previousMonthKey(base = new Date()) {
  const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), 1));
  d.setUTCMonth(d.getUTCMonth() - 1);
  return monthKeyFromDate(d.toISOString());
}

function quarterKey(monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  return `${y}-Q${Math.floor((m - 1) / 3) + 1}`;
}

function halfKey(monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  return `${y}-H${m <= 6 ? 1 : 2}`;
}

function yearKey(monthKey) {
  return String(monthKey).slice(0, 4);
}

function inferField(title) {
  const lower = String(title || '').toLowerCase();
  for (const [field, words] of Object.entries(FIELD_KEYWORDS)) {
    if (words.some((w) => lower.includes(w.toLowerCase()))) return field;
  }
  return 'General';
}

function normalizeItems(raw) {
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw];
}

async function fetchRssItems(source, limit = 60) {
  try {
    const response = await axios.get(source.url, { timeout: 12000 });
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '',
      parseTagValue: true,
      trimValues: true
    });

    const parsed = parser.parse(response.data);
    const items = normalizeItems(parsed?.rss?.channel?.item).concat(normalizeItems(parsed?.feed?.entry));

    return items
      .map((it) => {
        const title = it.title?.['#text'] || it.title || '';
        const link = it.link?.href || it.link || '';
        const pubDate = it.pubDate || it.updated || it.published || new Date().toISOString();
        return {
          source_name: source.source_name,
          category: source.category,
          field: inferField(title),
          title: String(title).trim(),
          link: String(link).trim(),
          published_at: new Date(pubDate).toISOString()
        };
      })
      .filter((x) => x.title)
      .slice(0, limit);
  } catch {
    return [];
  }
}

async function collectLaborNewsForMonth(targetMonth) {
  const month = requiredString(targetMonth) ? targetMonth.trim() : monthKeyNow();
  const collectedAt = new Date().toISOString();

  let fetched = 0;
  let inserted = 0;

  for (const source of RSS_SOURCES) {
    const items = await fetchRssItems(source, 80);
    fetched += items.length;

    for (const item of items) {
      if (monthKeyFromDate(item.published_at) !== month) continue;
      const dup = state.labor_news.some((n) => n.title === item.title && n.link === item.link);
      if (dup) continue;

      state.labor_news.push({
        id: state.seq.news++,
        ...item,
        period_month: month,
        collected_at: collectedAt
      });
      inserted += 1;
    }
  }

  saveState();
  return { month, fetched, inserted };
}

function listNewsByPeriod(type, value) {
  return state.labor_news.filter((row) => {
    if (type === 'month') return row.period_month === value;
    if (type === 'quarter') return quarterKey(row.period_month) === value;
    if (type === 'half') return halfKey(row.period_month) === value;
    if (type === 'year') return yearKey(row.period_month) === value;
    return false;
  });
}

function summarizeBy(items, key) {
  const map = new Map();
  for (const item of items) {
    const k = item[key] || 'General';
    map.set(k, (map.get(k) || 0) + 1);
  }
  return Array.from(map.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
}

function buildReportText(items, label) {
  const lines = [`[MOEL Report] ${label}`, `Generated: ${new Date().toISOString()}`, ''];
  const byCat = new Map();

  for (const item of items) {
    const cat = item.category || 'General';
    if (!byCat.has(cat)) byCat.set(cat, []);
    byCat.get(cat).push(item);
  }

  for (const [cat, rows] of byCat.entries()) {
    lines.push(`[${cat}]`);
    rows.forEach((r, i) => {
      lines.push(`${i + 1}. [${r.field}] ${r.title}`);
      if (r.link) lines.push(`   - ${r.link}`);
    });
    lines.push('');
  }

  if (items.length === 0) lines.push('No new items in this period.');
  return lines.join('\n');
}

function buildReportHtml(items, label) {
  const body = items
    .map((r) => `<li>[${r.category}] [${r.field}] <a href="${r.link || '#'}">${r.title}</a></li>`)
    .join('');

  return `
  <div style="font-family:Arial,sans-serif;line-height:1.5;">
    <h2>MOEL Report (${label})</h2>
    <p>Generated: ${new Date().toISOString()}</p>
    <ul>${body || '<li>No new items in this period.</li>'}</ul>
  </div>`;
}

async function sendEmailReport(recipients, subject, textBody, htmlBody) {
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || recipients.length === 0) {
    return { sent: 0, skipped: true, reason: 'SMTP not configured or no recipients' };
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });

  await transporter.sendMail({
    from: SMTP_FROM,
    bcc: recipients,
    subject,
    text: textBody,
    html: htmlBody
  });

  return { sent: recipients.length, skipped: false };
}

async function sendPeriodReport(type, value) {
  const items = listNewsByPeriod(type, value);
  const emails = [...new Set(state.attendees.filter((a) => a.consent === 1).map((a) => String(a.email || '').trim().toLowerCase()).filter(Boolean))];

  const label = `${type}:${value}`;
  const subject = `[MOEL] ${label} report`;
  const text = buildReportText(items, label);
  const html = buildReportHtml(items, label);

  try {
    const emailResult = await sendEmailReport(emails, subject, text, html);
    const status = emailResult.skipped ? 'SKIPPED' : 'SENT';

    state.report_logs.push({
      id: state.seq.log++,
      sent_at: new Date().toISOString(),
      recipient_email_count: emails.length,
      recipient_phone_count: 0,
      item_count: items.length,
      status,
      detail: JSON.stringify({ type, value, emailResult })
    });
    saveState();

    return { status, period_type: type, period_value: value, item_count: items.length, email_recipients: emails.length, email_result: emailResult };
  } catch (error) {
    const detail = String(error?.message || error);
    state.report_logs.push({
      id: state.seq.log++,
      sent_at: new Date().toISOString(),
      recipient_email_count: emails.length,
      recipient_phone_count: 0,
      item_count: items.length,
      status: 'ERROR',
      detail
    });
    saveState();
    return { status: 'ERROR', message: detail };
  }
}

app.use(cors());
app.use(express.json());
app.use(express.static(PUBLIC_DIR));

app.get('/', (_, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));

app.get('/api/health', (_, res) => {
  res.json({ status: 'ok', runtime: IS_VERCEL ? 'vercel-serverless' : 'node-server', time: new Date().toISOString(), data_path: DATA_PATH });
});

app.get('/api/events', (_, res) => {
  const items = [...state.events].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  res.json({ items });
});

app.post('/api/events', (req, res) => {
  const { title, meeting_date } = req.body || {};
  if (!requiredString(title)) return res.status(400).json({ message: 'Meeting title is required.' });

  const event = {
    id: makeId(10),
    title: String(title).trim(),
    meeting_date: requiredString(meeting_date) ? String(meeting_date).trim() : null,
    created_at: new Date().toISOString()
  };

  state.events.push(event);
  saveState();
  const checkinUrl = resolveBaseUrl(req) + '/checkin.html?event=' + event.id;
  return res.status(201).json({ ...event, checkin_url: checkinUrl });
});

app.get('/api/events/:eventId', (req, res) => {
  const event = state.events.find((e) => e.id === req.params.eventId);
  if (!event) return res.status(404).json({ message: 'Event not found.' });
  const checkinUrl = resolveBaseUrl(req) + '/checkin.html?event=' + event.id;
  return res.json({ ...event, checkin_url: checkinUrl });
});

app.post('/api/events/:eventId/attendees', (req, res) => {
  const event = state.events.find((e) => e.id === req.params.eventId);
  if (!event) return res.status(404).json({ message: 'Invalid event.' });

  const { consent, name, workplace, position, phone, email } = req.body || {};

  if (consent !== true) return res.status(400).json({ message: 'Consent is required.' });
  if (!requiredString(name) || !requiredString(workplace) || !requiredString(position)) {
    return res.status(400).json({ message: 'Required fields are missing.' });
  }
  if (!requiredString(phone) || !isValidPhone(String(phone).trim())) {
    return res.status(400).json({ message: 'Invalid phone format.' });
  }
  if (!requiredString(email) || !isValidEmail(String(email).trim())) {
    return res.status(400).json({ message: 'Invalid email format.' });
  }

  const phoneNorm = String(phone).trim();
  const emailNorm = String(email).trim().toLowerCase();
  const dup = state.attendees.some((a) => a.event_id === event.id && a.phone === phoneNorm && a.email === emailNorm);
  if (dup) return res.status(409).json({ message: 'Already registered.' });

  state.attendees.push({
    id: state.seq.attendee++,
    event_id: event.id,
    consent: 1,
    name: String(name).trim(),
    workplace: String(workplace).trim(),
    position: String(position).trim(),
    phone: phoneNorm,
    email: emailNorm,
    submitted_at: new Date().toISOString()
  });
  saveState();

  return res.status(201).json({ message: 'Registered.' });
});

app.get('/api/events/:eventId/attendees', (req, res) => {
  const event = state.events.find((e) => e.id === req.params.eventId);
  if (!event) return res.status(404).json({ message: 'Event not found.' });

  const items = state.attendees
    .filter((a) => a.event_id === event.id)
    .sort((a, b) => new Date(a.submitted_at) - new Date(b.submitted_at));

  res.json({ event, count: items.length, items });
});

app.get('/api/events/:eventId/attendees.csv', (req, res) => {
  const event = state.events.find((e) => e.id === req.params.eventId);
  if (!event) return res.status(404).json({ message: 'Event not found.' });

  const rows = state.attendees
    .filter((a) => a.event_id === event.id)
    .sort((a, b) => new Date(a.submitted_at) - new Date(b.submitted_at));

  const header = ['Name', 'Workplace', 'Position', 'Phone', 'Email', 'Submitted At'];
  const csvLines = [
    header.join(','),
    ...rows.map((row) => [row.name, row.workplace, row.position, row.phone, row.email, row.submitted_at]
      .map((v) => `"${String(v).replaceAll('"', '""')}"`).join(','))
  ];

  const csv = `\ufeff${csvLines.join('\n')}`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename=attendees_${event.id}.csv`);
  return res.send(csv);
});

app.post('/api/news/collect-monthly', async (req, res) => {
  const month = req.body?.month || monthKeyNow();
  const result = await collectLaborNewsForMonth(month);
  res.json(result);
});

app.get('/api/reports/period', (req, res) => {
  const type = String(req.query.type || 'month');
  const value = String(req.query.value || monthKeyNow());

  if (!['month', 'quarter', 'half', 'year'].includes(type)) {
    return res.status(400).json({ message: 'Invalid type.' });
  }

  const items = listNewsByPeriod(type, value).sort((a, b) => new Date(b.published_at) - new Date(a.published_at));
  const by_category = summarizeBy(items, 'category');
  const by_field = summarizeBy(items, 'field');

  res.json({ period_type: type, period_value: value, count: items.length, by_category, by_field, items });
});

app.get('/api/reports/available-periods', (_, res) => {
  const months = [...new Set(state.labor_news.map((n) => n.period_month))].sort().reverse();
  const quarters = [...new Set(months.map(quarterKey))].sort().reverse();
  const halves = [...new Set(months.map(halfKey))].sort().reverse();
  const years = [...new Set(months.map(yearKey))].sort().reverse();
  res.json({ months, quarters, halves, years });
});

app.post('/api/reports/send-period', async (req, res) => {
  const type = String(req.body?.type || 'month');
  const value = String(req.body?.value || previousMonthKey(new Date()));
  if (!['month', 'quarter', 'half', 'year'].includes(type)) {
    return res.status(400).json({ message: 'Invalid type.' });
  }
  const result = await sendPeriodReport(type, value);
  res.json(result);
});

app.post('/api/reports/send-now', async (_, res) => {
  const month = monthKeyNow();
  await collectLaborNewsForMonth(month);
  const result = await sendPeriodReport('month', month);
  res.json(result);
});

app.get('/api/reports/logs', (_, res) => {
  const items = [...state.report_logs].sort((a, b) => new Date(b.sent_at) - new Date(a.sent_at)).slice(0, 50);
  res.json({ items });
});

if (!IS_VERCEL) {
  app.listen(PORT, () => {
    console.log(`Server running on ${BASE_URL || `http://localhost:${PORT}`}`);
  });
}

module.exports = app;
