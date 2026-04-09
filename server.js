const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const nodemailer = require('nodemailer');
const { XMLParser } = require('fast-xml-parser');

const app = express();
const IS_VERCEL = process.env.VERCEL === '1';
const cron = IS_VERCEL ? null : require('node-cron');
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

const MONTHLY_REPORT_CRON = process.env.MONTHLY_REPORT_CRON || '0 9 1 * *';
const FREQUENT_REPORT_CRON = process.env.FREQUENT_REPORT_CRON || '0 */6 * * *';
const AUTO_REPORT_ENABLED = (process.env.AUTO_REPORT_ENABLED || (IS_VERCEL ? 'false' : 'true')).toLowerCase() === 'true';
const FREQUENT_REPORT_ENABLED = (process.env.FREQUENT_REPORT_ENABLED || (IS_VERCEL ? 'false' : 'true')).toLowerCase() === 'true';
const FREQUENT_REPORT_PERIOD_TYPE = process.env.FREQUENT_REPORT_PERIOD_TYPE || 'month';

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

const DATA_PATH = IS_VERCEL ? '/tmp/data.json' : path.join(__dirname, 'data.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

const RSS_SOURCES = [
  { source_name: '고용노동부', category: '법령 개정사항', url: 'https://www.moel.go.kr/rss/release/law.xml' },
  { source_name: '고용노동부', category: '행정해석', url: 'https://www.moel.go.kr/rss/policy/interpretation.xml' },
  { source_name: '고용노동부', category: '지침', url: 'https://www.moel.go.kr/rss/policy/guideline.xml' },
  { source_name: '대법원', category: '판례', url: 'https://www.scourt.go.kr/portal/information/events/rss.xml' },
  { source_name: '중앙노동위원회', category: '노동위원회 판정례', url: 'https://www.nlrc.go.kr/rss/case.xml' },
  { source_name: '고용노동부', category: '개정 설명자료', url: 'https://www.moel.go.kr/rss/news/explain.xml' }
];

const CATEGORY_KEYWORDS = {
  '법령 개정사항': ['법령', '시행령', '시행규칙', '개정'],
  '행정해석': ['행정해석', '해석례'],
  '지침': ['지침', '가이드라인', '매뉴얼'],
  '판례': ['판례', '대법원', '법원'],
  '노동위원회 판정례': ['노동위원회', '판정례', '중노위', '지노위'],
  '개정 설명자료': ['설명자료', '브리핑', '해설', 'Q&A']
};

const FIELD_KEYWORDS = {
  '근로기준': ['근로기준', '근로시간', '휴게', '휴일', '연차'],
  '임금/퇴직급여': ['임금', '통상임금', '최저임금', '퇴직금', '퇴직연금'],
  '노사관계': ['노사', '단체협약', '쟁의', '노동조합'],
  '산업안전/보건': ['산업안전', '중대재해', '보건', '위험성평가'],
  '비정규/차별': ['기간제', '파견', '비정규', '차별'],
  '고용보험/지원': ['고용보험', '실업급여', '지원금', '고용안정']
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

function persist() {
  try {
    fs.writeFileSync(DATA_PATH, JSON.stringify(state, null, 2), 'utf8');
  } catch {
    // 서버리스에서 쓰기 실패 시 메모리 상태만 유지
  }
}

app.use(cors());
app.use(express.json());
app.use(express.static(PUBLIC_DIR));

function requiredString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isValidPhone(phone) {
  return /^[0-9+\-\s]{9,20}$/.test(phone);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizeToArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function toKoreanDate(isoDate) {
  try {
    return new Date(isoDate).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
  } catch {
    return isoDate;
  }
}

function monthKeyFromDate(date) {
  const d = new Date(date);
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

function categoryFromText(titleText) {
  const lower = (titleText || '').toLowerCase();
  for (const [category, words] of Object.entries(CATEGORY_KEYWORDS)) {
    if (words.some((w) => lower.includes(w.toLowerCase()))) return category;
  }
  return '기타';
}

function fieldFromText(titleText) {
  const lower = (titleText || '').toLowerCase();
  for (const [field, words] of Object.entries(FIELD_KEYWORDS)) {
    if (words.some((w) => lower.includes(w.toLowerCase()))) return field;
  }
  return '기타';
}

async function fetchRssItems(source, limitPerSource = 50) {
  try {
    const response = await axios.get(source.url, { timeout: 12000 });
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '',
      parseTagValue: true,
      trimValues: true
    });
    const parsed = parser.parse(response.data);

    const channelItems = normalizeToArray(parsed?.rss?.channel?.item).concat(
      normalizeToArray(parsed?.feed?.entry)
    );

    return channelItems
      .map((it) => {
        const title = it.title?.['#text'] || it.title || '';
        const link = it.link?.href || it.link || '';
        const pubDate = it.pubDate || it.updated || it.published || new Date().toISOString();

        return {
          source_name: source.source_name,
          category: source.category || categoryFromText(title),
          field: fieldFromText(title),
          title: String(title).trim(),
          link: String(link).trim(),
          published_at: new Date(pubDate).toISOString()
        };
      })
      .filter((it) => it.title)
      .slice(0, limitPerSource);
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
    const items = await fetchRssItems(source, 60);
    fetched += items.length;

    for (const item of items) {
      if (monthKeyFromDate(item.published_at) !== month) continue;
      const exists = state.labor_news.some((n) => n.title === item.title && n.link === item.link);
      if (exists) continue;

      state.labor_news.push({
        id: state.seq.news++,
        ...item,
        period_month: month,
        collected_at: collectedAt
      });
      inserted += 1;
    }
  }

  persist();
  return { month, fetched, inserted };
}

function listNewsByPeriod(periodType, periodValue) {
  return state.labor_news.filter((row) => {
    const month = row.period_month;
    if (periodType === 'month') return month === periodValue;
    if (periodType === 'quarter') return quarterKey(month) === periodValue;
    if (periodType === 'half') return halfKey(month) === periodValue;
    if (periodType === 'year') return yearKey(month) === periodValue;
    return false;
  });
}

function summarizeBy(items, key) {
  const counter = new Map();
  for (const item of items) {
    const k = item[key] || '기타';
    counter.set(k, (counter.get(k) || 0) + 1);
  }
  return Array.from(counter.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
}

function buildReportHtml(items, label) {
  const byCategory = new Map();
  for (const item of items) {
    const key = item.category || '기타';
    if (!byCategory.has(key)) byCategory.set(key, []);
    byCategory.get(key).push(item);
  }

  const sections = Array.from(byCategory.entries()).map(([category, rows]) => {
    const line = rows.map((r) => `<li>[${r.field}] <a href="${r.link || '#'}">${r.title}</a> <small>(${toKoreanDate(r.published_at)})</small></li>`).join('');
    return `<h3>${category}</h3><ul>${line}</ul>`;
  }).join('');

  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.5;">
      <h2>고용노동부 소식 리포트 (${label})</h2>
      <p>생성 시각: ${toKoreanDate(new Date().toISOString())}</p>
      ${sections || '<p>해당 기간 신규 항목이 없습니다.</p>'}
    </div>
  `;
}

function buildReportText(items, label) {
  const lines = [`[고용노동부 소식 리포트] ${label}`, `생성: ${toKoreanDate(new Date().toISOString())}`, ''];
  const byCategory = new Map();

  for (const item of items) {
    const key = item.category || '기타';
    if (!byCategory.has(key)) byCategory.set(key, []);
    byCategory.get(key).push(item);
  }

  for (const [category, rows] of byCategory.entries()) {
    lines.push(`[${category}]`);
    rows.forEach((r, i) => {
      lines.push(`${i + 1}. [${r.field}] ${r.title}`);
      if (r.link) lines.push(`   - ${r.link}`);
    });
    lines.push('');
  }

  if (items.length === 0) lines.push('해당 기간 신규 항목이 없습니다.');
  return lines.join('\n');
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

async function sendPeriodReport(periodType, periodValue) {
  const items = listNewsByPeriod(periodType, periodValue);
  const emails = [...new Set(state.attendees.filter((a) => a.consent === 1).map((a) => String(a.email || '').trim().toLowerCase()).filter(Boolean))];

  const label = `${periodType}:${periodValue}`;
  const subject = `[고용노동부 소식] ${label} 리포트`;
  const text = buildReportText(items, label);
  const html = buildReportHtml(items, label);

  const now = new Date().toISOString();

  try {
    const emailResult = await sendEmailReport(emails, subject, text, html);
    const status = emailResult.skipped ? 'SKIPPED' : 'SENT';

    state.report_logs.push({
      id: state.seq.log++,
      sent_at: now,
      recipient_email_count: emails.length,
      recipient_phone_count: 0,
      item_count: items.length,
      status,
      detail: JSON.stringify({ periodType, periodValue, emailResult })
    });
    persist();

    return {
      status,
      period_type: periodType,
      period_value: periodValue,
      item_count: items.length,
      email_recipients: emails.length,
      email_result: emailResult
    };
  } catch (error) {
    const detail = String(error?.message || error);

    state.report_logs.push({
      id: state.seq.log++,
      sent_at: now,
      recipient_email_count: emails.length,
      recipient_phone_count: 0,
      item_count: items.length,
      status: 'ERROR',
      detail: JSON.stringify({ periodType, periodValue, error: detail })
    });
    persist();

    return { status: 'ERROR', message: detail };
  }
}

if (!IS_VERCEL && AUTO_REPORT_ENABLED && cron) {
  cron.schedule(MONTHLY_REPORT_CRON, async () => {
    const targetMonth = previousMonthKey(new Date());
    await collectLaborNewsForMonth(targetMonth);
    const result = await sendPeriodReport('month', targetMonth);
    console.log('[MONTHLY_AUTO_REPORT]', result);
  }, { timezone: 'Asia/Seoul' });
}

if (!IS_VERCEL && FREQUENT_REPORT_ENABLED && cron) {
  cron.schedule(FREQUENT_REPORT_CRON, async () => {
    const type = ['month', 'quarter', 'half', 'year'].includes(FREQUENT_REPORT_PERIOD_TYPE) ? FREQUENT_REPORT_PERIOD_TYPE : 'month';
    const month = monthKeyNow();
    await collectLaborNewsForMonth(month);

    const value = type === 'month' ? month : type === 'quarter' ? quarterKey(month) : type === 'half' ? halfKey(month) : yearKey(month);
    const result = await sendPeriodReport(type, value);
    console.log('[FREQUENT_AUTO_REPORT]', result);
  }, { timezone: 'Asia/Seoul' });
}

app.get('/api/health', (_, res) => {
  res.json({
    status: 'ok',
    time: new Date().toISOString(),
    runtime: IS_VERCEL ? 'vercel-serverless' : 'node-server',
    data_path: DATA_PATH
  });
});

app.get('/', (_, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));

app.get('/api/events', (_, res) => {
  const items = [...state.events].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  res.json({ items });
});

app.post('/api/events', (req, res) => {
  const { title, meeting_date } = req.body || {};
  if (!requiredString(title)) return res.status(400).json({ message: '회의명을 입력해 주세요.' });

  const event = {
    id: makeId(10),
    title: title.trim(),
    meeting_date: requiredString(meeting_date) ? meeting_date.trim() : null,
    created_at: new Date().toISOString()
  };

  state.events.push(event);
  persist();
  return res.status(201).json({ ...event, checkin_url: `${BASE_URL}/checkin.html?event=${event.id}` });
});

app.get('/api/events/:eventId', (req, res) => {
  const event = state.events.find((e) => e.id === req.params.eventId);
  if (!event) return res.status(404).json({ message: '회의를 찾을 수 없습니다.' });
  return res.json({ ...event, checkin_url: `${BASE_URL}/checkin.html?event=${event.id}` });
});

app.post('/api/events/:eventId/attendees', (req, res) => {
  const event = state.events.find((e) => e.id === req.params.eventId);
  if (!event) return res.status(404).json({ message: '유효하지 않은 회의입니다.' });

  const { consent, name, workplace, position, phone, email } = req.body || {};

  if (consent !== true) return res.status(400).json({ message: '개인정보 수집·이용 동의가 필요합니다.' });
  if (!requiredString(name) || !requiredString(workplace) || !requiredString(position)) {
    return res.status(400).json({ message: '필수 항목을 모두 입력해 주세요.' });
  }
  if (!requiredString(phone) || !isValidPhone(phone.trim())) {
    return res.status(400).json({ message: '휴대전화번호 형식이 올바르지 않습니다.' });
  }
  if (!requiredString(email) || !isValidEmail(email.trim())) {
    return res.status(400).json({ message: '이메일 형식이 올바르지 않습니다.' });
  }

  const phoneNorm = phone.trim();
  const emailNorm = email.trim().toLowerCase();
  const dup = state.attendees.some((a) => a.event_id === event.id && a.phone === phoneNorm && a.email === emailNorm);
  if (dup) return res.status(409).json({ message: '이미 등록된 참석자입니다.' });

  state.attendees.push({
    id: state.seq.attendee++,
    event_id: event.id,
    consent: 1,
    name: name.trim(),
    workplace: workplace.trim(),
    position: position.trim(),
    phone: phoneNorm,
    email: emailNorm,
    submitted_at: new Date().toISOString()
  });
  persist();

  return res.status(201).json({ message: '등록이 완료되었습니다.' });
});

app.get('/api/events/:eventId/attendees', (req, res) => {
  const event = state.events.find((e) => e.id === req.params.eventId);
  if (!event) return res.status(404).json({ message: '회의를 찾을 수 없습니다.' });

  const items = state.attendees
    .filter((a) => a.event_id === event.id)
    .sort((a, b) => new Date(a.submitted_at) - new Date(b.submitted_at));

  res.json({ event, count: items.length, items });
});

app.get('/api/events/:eventId/attendees.csv', (req, res) => {
  const event = state.events.find((e) => e.id === req.params.eventId);
  if (!event) return res.status(404).json({ message: '회의를 찾을 수 없습니다.' });

  const rows = state.attendees
    .filter((a) => a.event_id === event.id)
    .sort((a, b) => new Date(a.submitted_at) - new Date(b.submitted_at));

  const header = ['성명', '사업장명', '직책', '휴대전화번호', '이메일 주소', '제출시각'];
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
  const { month } = req.body || {};
  const result = await collectLaborNewsForMonth(month || monthKeyNow());
  res.json(result);
});

app.get('/api/reports/period', (req, res) => {
  const periodType = String(req.query.type || 'month');
  const periodValue = String(req.query.value || monthKeyNow());

  if (!['month', 'quarter', 'half', 'year'].includes(periodType)) {
    return res.status(400).json({ message: 'type은 month|quarter|half|year 중 하나여야 합니다.' });
  }

  const items = listNewsByPeriod(periodType, periodValue).sort((a, b) => new Date(b.published_at) - new Date(a.published_at));
  const byCategory = summarizeBy(items, 'category');
  const byField = summarizeBy(items, 'field');

  return res.json({ period_type: periodType, period_value: periodValue, count: items.length, by_category: byCategory, by_field: byField, items });
});

app.get('/api/reports/available-periods', (_, res) => {
  const months = [...new Set(state.labor_news.map((r) => r.period_month))].sort().reverse();
  const quarters = [...new Set(months.map(quarterKey))].sort().reverse();
  const halves = [...new Set(months.map(halfKey))].sort().reverse();
  const years = [...new Set(months.map(yearKey))].sort().reverse();
  res.json({ months, quarters, halves, years });
});

app.post('/api/reports/send-period', async (req, res) => {
  const periodType = String(req.body?.type || 'month');
  const periodValue = String(req.body?.value || previousMonthKey(new Date()));

  if (!['month', 'quarter', 'half', 'year'].includes(periodType)) {
    return res.status(400).json({ message: 'type은 month|quarter|half|year 중 하나여야 합니다.' });
  }

  const result = await sendPeriodReport(periodType, periodValue);
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
    console.log(`Server running on ${BASE_URL}`);
  });
}

module.exports = app;
