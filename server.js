const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const nodemailer = require('nodemailer');
const PDFDocument = require('pdfkit');
const { XMLParser } = require('fast-xml-parser');

const app = express();
const IS_VERCEL = process.env.VERCEL === '1';
const PORT = Number(process.env.PORT || 3000);
const BASE_URL = process.env.BASE_URL || '';

const DATA_PATH = IS_VERCEL ? '/tmp/data.json' : path.join(__dirname, 'data.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
const FONT_REGULAR_PATH = path.join(__dirname, 'assets', 'fonts', 'malgun.ttf');
const FONT_BOLD_PATH = path.join(__dirname, 'assets', 'fonts', 'malgunbd.ttf');

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
  { source_name: '대한민국법령정보', category: '고용노동부 소관 법령', url: 'https://www.law.go.kr/' },
  { source_name: '고용노동부', category: '고용노동부 소관 법령', url: 'https://www.moel.go.kr/rss/news/recent.xml' },
  { source_name: '고용노동부', category: '행정해석', url: 'https://www.moel.go.kr/rss/policy/interpretation.xml' },
  { source_name: '고용노동부', category: '지침', url: 'https://www.moel.go.kr/rss/policy/guideline.xml' },
  { source_name: '대법원', category: '노동법 관련 판례', url: 'https://www.scourt.go.kr/portal/information/events/rss.xml' },
  { source_name: '중앙노동위원회', category: '노동위원회 판정례', url: 'https://www.nlrc.go.kr/rss/case.xml' },
  { source_name: '고용노동부', category: '질의회시', url: 'https://www.moel.go.kr/rss/news/explain.xml' },
  { source_name: 'Google News', category: '고용노동부 소관 법령', url: 'https://news.google.com/rss/search?q=%EA%B3%A0%EC%9A%A9%EB%85%B8%EB%8F%99%EB%B6%80+%EC%86%8C%EA%B4%80+%EB%B2%95%EB%A0%B9+%EA%B0%9C%EC%A0%95&hl=ko&gl=KR&ceid=KR:ko' },
  { source_name: 'Google News', category: '노동법 관련 판례', url: 'https://news.google.com/rss/search?q=%EB%85%B8%EB%8F%99%EB%B2%95+%ED%8C%90%EB%A1%80&hl=ko&gl=KR&ceid=KR:ko' },
  { source_name: 'Google News', category: '노동위원회 판정례', url: 'https://news.google.com/rss/search?q=%EB%85%B8%EB%8F%99%EC%9C%84%EC%9B%90%ED%9A%8C+%ED%8C%90%EC%A0%95%EB%A1%80&hl=ko&gl=KR&ceid=KR:ko' },
  { source_name: 'Google News', category: '행정해석', url: 'https://news.google.com/rss/search?q=%EA%B3%A0%EC%9A%A9%EB%85%B8%EB%8F%99%EB%B6%80+%ED%96%89%EC%A0%95%ED%95%B4%EC%84%9D&hl=ko&gl=KR&ceid=KR:ko' },
  { source_name: 'Google News', category: '질의회시', url: 'https://news.google.com/rss/search?q=%EA%B3%A0%EC%9A%A9%EB%85%B8%EB%8F%99%EB%B6%80+%EC%A7%88%EC%9D%98%ED%9A%8C%EC%8B%9C&hl=ko&gl=KR&ceid=KR:ko' },
  { source_name: 'Google News', category: '지침', url: 'https://news.google.com/rss/search?q=%EA%B3%A0%EC%9A%A9%EB%85%B8%EB%8F%99%EB%B6%80+%EC%A7%80%EC%B9%A8&hl=ko&gl=KR&ceid=KR:ko' },
  { source_name: '고용노동부(보완)', category: '고용노동부 소관 법령', url: 'https://news.google.com/rss/search?q=site%3Amoel.go.kr+%EB%B2%95%EB%A0%B9+%EA%B0%9C%EC%A0%95&hl=ko&gl=KR&ceid=KR:ko' },
  { source_name: '고용노동부(보완)', category: '행정해석', url: 'https://news.google.com/rss/search?q=site%3Amoel.go.kr+%ED%96%89%EC%A0%95%ED%95%B4%EC%84%9D&hl=ko&gl=KR&ceid=KR:ko' },
  { source_name: '고용노동부(보완)', category: '질의회시', url: 'https://news.google.com/rss/search?q=site%3Amoel.go.kr+%EC%A7%88%EC%9D%98%ED%9A%8C%EC%8B%9C&hl=ko&gl=KR&ceid=KR:ko' },
  { source_name: '고용노동부(보완)', category: '지침', url: 'https://news.google.com/rss/search?q=site%3Amoel.go.kr+%EC%A7%80%EC%B9%A8&hl=ko&gl=KR&ceid=KR:ko' }
];

const KOREA_LAW_LINKS = [
  '근로기준법',
  '근로자퇴직급여 보장법',
  '최저임금법',
  '근로자참여 및 협력증진에 관한 법률',
  '노동조합 및 노동관계조정법',
  '기간제 및 단시간근로자 보호 등에 관한 법률',
  '파견근로자보호 등에 관한 법률',
  '산업안전보건법',
  '고용보험법',
  '남녀고용평등과 일·가정 양립 지원에 관한 법률'
];

const FIELD_KEYWORDS = {
  '근로기준': ['근로기준', '근로시간', '연차', '휴게', '휴일'],
  '임금/퇴직': ['임금', '통상임금', '최저임금', '퇴직금', '퇴직연금'],
  '노사관계': ['노사', '노동조합', '쟁의', '단체협약'],
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

function quarterNowKey() {
  return quarterKey(monthKeyNow());
}

function halfNowKey() {
  return halfKey(monthKeyNow());
}

function yearNowKey() {
  return yearKey(monthKeyNow());
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

function monthsFromPeriod(type, value) {
  if (type === 'month') {
    const match = String(value).match(/^(\d{4})-(\d{2})$/);
    if (!match) return [];
    return [String(value)];
  }
  if (type === 'quarter') {
    const match = String(value).match(/^(\d{4})-Q([1-4])$/);
    if (!match) return [];
    const y = Number(match[1]);
    const q = Number(match[2]);
    const startMonth = (q - 1) * 3 + 1;
    return [0, 1, 2].map((i) => `${y}-${String(startMonth + i).padStart(2, '0')}`);
  }
  if (type === 'half') {
    const match = String(value).match(/^(\d{4})-H([1-2])$/);
    if (!match) return [];
    const y = Number(match[1]);
    const h = Number(match[2]);
    const startMonth = h === 1 ? 1 : 7;
    return [0, 1, 2, 3, 4, 5].map((i) => `${y}-${String(startMonth + i).padStart(2, '0')}`);
  }
  if (type === 'year') {
    const match = String(value).match(/^(\d{4})$/);
    if (!match) return [];
    const y = Number(match[1]);
    return Array.from({ length: 12 }, (_, i) => `${y}-${String(i + 1).padStart(2, '0')}`);
  }
  return [];
}

function inferField(title) {
  const lower = String(title || '').toLowerCase();
  for (const [field, words] of Object.entries(FIELD_KEYWORDS)) {
    if (words.some((w) => lower.includes(w.toLowerCase()))) return field;
  }
  return '기타';
}

function normalizeItems(raw) {
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw];
}

function stripHtml(text) {
  return String(text || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function safeDateIso(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return new Date().toISOString();
  return d.toISOString();
}

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    const next = line[i + 1];
    if (ch === '"') {
      if (inQuotes && next === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) {
      out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function parseCsvRows(text) {
  const cleaned = String(text || '').replace(/^\uFEFF/, '');
  const lines = cleaned.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length <= 1) return [];
  return lines.slice(1).map(parseCsvLine);
}

async function fetchRssItems(source, limit = 60) {
  if (source.source_name === '대한민국법령정보') {
    return [];
  }
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
        const rawSummary = it.description?.['#text']
          || it.description
          || it.summary?.['#text']
          || it.summary
          || it.content?.['#text']
          || it.content
          || '';
        const summary = stripHtml(rawSummary).slice(0, 700);
        return {
          source_name: source.source_name,
          category: source.category,
          field: inferField(title),
          title: String(title).trim(),
          link: String(link).trim(),
          published_at: safeDateIso(pubDate),
          summary
        };
      })
      .filter((x) => x.title)
      .slice(0, limit);
  } catch (error) {
    return { items: [], error: String(error?.message || error) };
  }
}

async function collectLaborNewsForMonths(targetMonths) {
  const months = (Array.isArray(targetMonths) ? targetMonths : [targetMonths])
    .map((m) => String(m || '').trim())
    .filter((m) => /^\d{4}-\d{2}$/.test(m));
  const monthSet = new Set(months.length ? months : [monthKeyNow()]);
  const representativeMonth = [...monthSet][0];
  const collectedAt = new Date().toISOString();

  let fetched = 0;
  let inserted = 0;
  const source_stats = [];

  for (const source of RSS_SOURCES) {
    const result = await fetchRssItems(source, 100);
    const items = Array.isArray(result) ? result : result.items;
    const error = Array.isArray(result) ? null : result.error;
    fetched += items.length;
    let sourceInserted = 0;
    const sourcePreview = [];

    for (const item of items) {
      const parsedMonth = monthKeyFromDate(item.published_at);
      const periodMonth = monthSet.has(parsedMonth) ? parsedMonth : representativeMonth;
      const dup = state.labor_news.some((n) => n.title === item.title && n.link === item.link);
      if (dup) continue;

      if (!monthSet.has(parsedMonth) && !error) {
        // Period filtering is intentionally relaxed to avoid missing labor references.
      }

      const newsId = state.seq.news++;
      state.labor_news.push({
        id: newsId,
        ...item,
        period_month: periodMonth,
        collected_at: collectedAt
      });
      sourcePreview.push({
        id: newsId,
        title: item.title,
        link: item.link,
        summary: item.summary || '',
        published_at: item.published_at
      });
      inserted += 1;
      sourceInserted += 1;
    }

    source_stats.push({
      source: source.source_name,
      category: source.category,
      fetched: items.length,
      inserted: sourceInserted,
      items_preview: sourcePreview.slice(0, 20),
      error
    });
  }

  let lawInserted = 0;
  const lawPreview = [];
  for (const lawName of KOREA_LAW_LINKS) {
    const link = `https://www.law.go.kr/lsSc.do?menuId=1&subMenuId=15&query=${encodeURIComponent(lawName)}#liBgcolor0`;
    const title = `대한민국법령정보: ${lawName}`;
    const dup = state.labor_news.some((n) => n.title === title && n.link === link);
    if (dup) continue;

    const lawId = state.seq.news++;
    state.labor_news.push({
      id: lawId,
      source_name: '대한민국법령정보',
      category: '고용노동부 소관 법령',
      field: inferField(lawName),
      title,
      link,
      summary: `대한민국법령정보센터에서 ${lawName} 관련 최신 조문/개정 정보를 확인할 수 있습니다.`,
      published_at: collectedAt,
      period_month: representativeMonth,
      collected_at: collectedAt
    });
    lawPreview.push({
      id: lawId,
      title,
      link,
      summary: `대한민국법령정보센터에서 ${lawName} 관련 최신 조문/개정 정보를 확인할 수 있습니다.`,
      published_at: collectedAt
    });
    inserted += 1;
    lawInserted += 1;
  }

  source_stats.push({
    source: '대한민국법령정보',
    category: '고용노동부 소관 법령',
    fetched: KOREA_LAW_LINKS.length,
    inserted: lawInserted,
    items_preview: lawPreview.slice(0, 20),
    error: null
  });

  saveState();
  return { months: [...monthSet], fetched, inserted, source_stats };
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
    const k = item[key] || '기타';
    map.set(k, (map.get(k) || 0) + 1);
  }
  return Array.from(map.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
}

function parseIssueIds(input) {
  if (!Array.isArray(input)) return [];
  const out = [];
  for (const v of input) {
    const n = Number(v);
    if (!Number.isFinite(n)) continue;
    out.push(n);
  }
  return [...new Set(out)];
}

function pickIssues(items, issueIds) {
  const ids = parseIssueIds(issueIds);
  if (ids.length === 0) return items;
  const set = new Set(ids);
  return items.filter((row) => set.has(Number(row.id)));
}

function buildPeriodItems(type, value, issueIds = []) {
  const items = listNewsByPeriod(type, value).sort((a, b) => new Date(b.published_at) - new Date(a.published_at));
  return pickIssues(items, issueIds);
}

function buildReportSummaryLines(items, label) {
  const byCategory = summarizeBy(items, 'category').slice(0, 8);
  const byField = summarizeBy(items, 'field').slice(0, 8);
  const lines = [
    `리포트 기간: ${label}`,
    `생성시각: ${new Date().toISOString()}`,
    `총 이슈 수: ${items.length}건`,
    ''
  ];
  lines.push('[카테고리 요약]');
  if (byCategory.length === 0) lines.push('- 데이터 없음');
  byCategory.forEach((it) => lines.push(`- ${it.name}: ${it.count}건`));
  lines.push('');
  lines.push('[분야 요약]');
  if (byField.length === 0) lines.push('- 데이터 없음');
  byField.forEach((it) => lines.push(`- ${it.name}: ${it.count}건`));
  return lines;
}

function applyPdfKoreanFont(doc, bold = false) {
  try {
    if (fs.existsSync(FONT_REGULAR_PATH)) {
      doc.registerFont('KoreanRegular', FONT_REGULAR_PATH);
      doc.font('KoreanRegular');
    }
    if (bold && fs.existsSync(FONT_BOLD_PATH)) {
      doc.registerFont('KoreanBold', FONT_BOLD_PATH);
      doc.font('KoreanBold');
    }
  } catch {
    // Fall back to built-in font if custom font registration fails.
  }
}

function generateLaborReportPdfBuffer(items, label) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    applyPdfKoreanFont(doc, true);
    doc.fontSize(20).text('노동 이슈 리포트', { align: 'left' });
    doc.moveDown(0.5);
    applyPdfKoreanFont(doc, false);
    doc.fontSize(12);
    const summaryLines = buildReportSummaryLines(items, label);
    summaryLines.forEach((line) => doc.text(line));

    doc.addPage();
    applyPdfKoreanFont(doc, true);
    doc.fontSize(16).text('상세 이슈 목록', { align: 'left' });
    doc.moveDown(0.5);
    applyPdfKoreanFont(doc, false);
    doc.fontSize(10);
    if (items.length === 0) {
      doc.text('선택된 이슈가 없습니다.');
    } else {
      items.forEach((item, idx) => {
        doc.text(`${idx + 1}. [${item.category}] [${item.field}]`);
        doc.text(`${item.title || ''}`);
        doc.text(`발행일: ${item.published_at || ''}`);
        if (item.link) doc.text(`링크: ${item.link}`);
        doc.moveDown(0.7);
      });
    }

    doc.end();
  });
}

function buildReportText(items, label) {
  const lines = [`[MOEL Report] ${label}`, `Generated: ${new Date().toISOString()}`, ''];
  const byCat = new Map();

  for (const item of items) {
    const cat = item.category || '기타';
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

async function sendEmailReport(recipients, subject, textBody, htmlBody, attachments = []) {
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
    html: htmlBody,
    attachments
  });

  return { sent: recipients.length, skipped: false };
}

function selectRecipientEmails(selectedEmails = []) {
  const allConsentEmails = [...new Set(
    state.attendees
      .filter((a) => a.consent === 1)
      .map((a) => String(a.email || '').trim().toLowerCase())
      .filter(Boolean)
  )];

  if (!Array.isArray(selectedEmails) || selectedEmails.length === 0) return allConsentEmails;

  const selected = new Set(
    selectedEmails
      .map((e) => String(e || '').trim().toLowerCase())
      .filter(isValidEmail)
  );
  return allConsentEmails.filter((email) => selected.has(email));
}

async function sendPeriodReport(type, value, selectedEmails = [], issueIds = []) {
  const items = buildPeriodItems(type, value, issueIds);
  const emails = selectRecipientEmails(selectedEmails);

  const label = `${type}:${value}`;
  const subject = `[MOEL] ${label} report`;
  const text = buildReportText(items, label);
  const html = buildReportHtml(items, label);

  try {
    const pdfBuffer = await generateLaborReportPdfBuffer(items, label);
    const fileSafeLabel = label.replace(/[^a-zA-Z0-9:_-]/g, '_').replace(':', '_');
    const attachments = [{
      filename: `labor_report_${fileSafeLabel}.pdf`,
      content: pdfBuffer,
      contentType: 'application/pdf'
    }];

    const emailResult = await sendEmailReport(emails, subject, text, html, attachments);
    const status = emailResult.skipped ? 'SKIPPED' : 'SENT';

    state.report_logs.push({
      id: state.seq.log++,
      sent_at: new Date().toISOString(),
      recipient_email_count: emails.length,
      recipient_phone_count: 0,
      item_count: items.length,
      status,
      detail: JSON.stringify({ type, value, selected_count: selectedEmails.length, selected_issue_count: parseIssueIds(issueIds).length, emailResult })
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

app.post('/api/events/:eventId/attendees/import-csv', (req, res) => {
  const event = state.events.find((e) => e.id === req.params.eventId);
  if (!event) return res.status(404).json({ message: 'Invalid event.' });

  const csvText = req.body?.csv_text || '';
  const rows = parseCsvRows(csvText);
  if (!rows.length) return res.status(400).json({ message: 'CSV rows are empty.' });

  let inserted = 0;
  let skipped = 0;

  for (const row of rows) {
    const [name, workplace, position, phone, email] = row;
    if (!requiredString(name) || !requiredString(workplace) || !requiredString(position)) {
      skipped += 1;
      continue;
    }
    if (!requiredString(phone) || !isValidPhone(String(phone).trim())) {
      skipped += 1;
      continue;
    }
    if (!requiredString(email) || !isValidEmail(String(email).trim())) {
      skipped += 1;
      continue;
    }

    const phoneNorm = String(phone).trim();
    const emailNorm = String(email).trim().toLowerCase();
    const dup = state.attendees.some((a) => a.event_id === event.id && a.phone === phoneNorm && a.email === emailNorm);
    if (dup) {
      skipped += 1;
      continue;
    }

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
    inserted += 1;
  }

  saveState();
  return res.json({ inserted, skipped, total_rows: rows.length });
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

app.get('/api/rosters', (req, res) => {
  const meetingDate = requiredString(req.query.meeting_date) ? String(req.query.meeting_date).trim() : null;
  const eventId = requiredString(req.query.event_id) ? String(req.query.event_id).trim() : null;

  let events = [...state.events];
  if (meetingDate) events = events.filter((e) => e.meeting_date === meetingDate);
  if (eventId) events = events.filter((e) => e.id === eventId);

  events.sort((a, b) => {
    const aKey = `${a.meeting_date || ''}|${a.created_at || ''}`;
    const bKey = `${b.meeting_date || ''}|${b.created_at || ''}`;
    return aKey.localeCompare(bKey);
  });

  const rows = events.map((event) => {
    const attendees = state.attendees
      .filter((a) => a.event_id === event.id)
      .sort((a, b) => new Date(a.submitted_at) - new Date(b.submitted_at));

    return {
      event: {
        id: event.id,
        title: event.title,
        meeting_date: event.meeting_date,
        created_at: event.created_at
      },
      attendee_count: attendees.length,
      attendees
    };
  });

  const totalAttendees = rows.reduce((sum, r) => sum + r.attendee_count, 0);
  return res.json({
    filters: { meeting_date: meetingDate, event_id: eventId },
    total_events: rows.length,
    total_attendees: totalAttendees,
    rows
  });
});

app.get('/api/recipients', (req, res) => {
  const meetingDate = requiredString(req.query.meeting_date) ? String(req.query.meeting_date).trim() : null;
  const eventId = requiredString(req.query.event_id) ? String(req.query.event_id).trim() : null;

  const eventMap = new Map(state.events.map((e) => [e.id, e]));
  const filteredEventIds = new Set(
    state.events
      .filter((e) => (!meetingDate || e.meeting_date === meetingDate) && (!eventId || e.id === eventId))
      .map((e) => e.id)
  );

  const byEmail = new Map();
  for (const attendee of state.attendees) {
    if (attendee.consent !== 1) continue;
    if (!filteredEventIds.has(attendee.event_id)) continue;

    const email = String(attendee.email || '').trim().toLowerCase();
    if (!isValidEmail(email)) continue;

    const event = eventMap.get(attendee.event_id);
    const eventTitle = event ? event.title : '';
    const eventDate = event ? event.meeting_date : '';
    const label = eventDate ? `${eventDate} | ${eventTitle}` : eventTitle;

    if (!byEmail.has(email)) {
      byEmail.set(email, {
        email,
        name: attendee.name || '',
        phone: attendee.phone || '',
        workplace: attendee.workplace || '',
        position: attendee.position || '',
        events: new Set([label])
      });
      continue;
    }

    const prev = byEmail.get(email);
    prev.events.add(label);
  }

  const items = Array.from(byEmail.values())
    .map((x) => ({ ...x, events: Array.from(x.events).filter(Boolean).sort() }))
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko'));

  res.json({
    filters: { meeting_date: meetingDate, event_id: eventId },
    count: items.length,
    items
  });
});

app.post('/api/news/collect-period', async (req, res) => {
  const type = String(req.body?.type || 'month');
  const value = String(req.body?.value || monthKeyNow());
  if (!['month', 'quarter', 'half', 'year'].includes(type)) {
    return res.status(400).json({ message: 'Invalid type.' });
  }
  const months = monthsFromPeriod(type, value);
  if (!months.length) return res.status(400).json({ message: 'Invalid period value.' });
  const result = await collectLaborNewsForMonths(months);
  res.json({ period_type: type, period_value: value, ...result });
});

app.get('/api/reports/period', (req, res) => {
  const type = String(req.query.type || 'month');
  const value = String(req.query.value || monthKeyNow());

  if (!['month', 'quarter', 'half', 'year'].includes(type)) {
    return res.status(400).json({ message: 'Invalid type.' });
  }

  const issueIds = String(req.query.issue_ids || '')
    .split(',')
    .map((x) => Number(x))
    .filter((n) => Number.isFinite(n));

  const items = buildPeriodItems(type, value, issueIds);
  const by_category = summarizeBy(items, 'category');
  const by_field = summarizeBy(items, 'field');

  res.json({ period_type: type, period_value: value, count: items.length, by_category, by_field, items });
});

app.get('/api/reports/period-pdf', async (req, res) => {
  const type = String(req.query.type || 'month');
  const value = String(req.query.value || monthKeyNow());
  if (!['month', 'quarter', 'half', 'year'].includes(type)) {
    return res.status(400).json({ message: 'Invalid type.' });
  }

  const issueIds = String(req.query.issue_ids || '')
    .split(',')
    .map((x) => Number(x))
    .filter((n) => Number.isFinite(n));
  const items = buildPeriodItems(type, value, issueIds);
  const label = `${type}:${value}`;

  try {
    const pdfBuffer = await generateLaborReportPdfBuffer(items, label);
    const preview = String(req.query.preview || '0') === '1';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${preview ? 'inline' : 'attachment'}; filename=labor_report_${type}_${value}.pdf`);
    return res.send(pdfBuffer);
  } catch (error) {
    return res.status(500).json({ message: String(error?.message || error) });
  }
});

app.get('/api/reports/available-periods', (_, res) => {
  const existingMonths = [...new Set(state.labor_news.map((n) => n.period_month))];
  const now = new Date();

  const generatedMonths = [];
  for (let i = 0; i < 36; i += 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    d.setUTCMonth(d.getUTCMonth() - i);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    generatedMonths.push(`${y}-${m}`);
  }

  const months = [...new Set([...existingMonths, ...generatedMonths])].sort().reverse();
  const existingQuarters = existingMonths.map(quarterKey);
  const existingHalves = existingMonths.map(halfKey);
  const existingYears = existingMonths.map(yearKey);

  const generatedQuarters = [];
  for (let i = 0; i < 16; i += 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    d.setUTCMonth(d.getUTCMonth() - (i * 3));
    generatedQuarters.push(quarterKey(monthKeyFromDate(d.toISOString())));
  }

  const generatedHalves = [];
  for (let i = 0; i < 10; i += 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    d.setUTCMonth(d.getUTCMonth() - (i * 6));
    generatedHalves.push(halfKey(monthKeyFromDate(d.toISOString())));
  }

  const generatedYears = [];
  for (let i = 0; i < 10; i += 1) {
    generatedYears.push(String(now.getUTCFullYear() - i));
  }

  const quarters = [...new Set([...existingQuarters, ...generatedQuarters])].sort().reverse();
  const halves = [...new Set([...existingHalves, ...generatedHalves])].sort().reverse();
  const years = [...new Set([...existingYears, ...generatedYears])].sort().reverse();
  res.json({ months, quarters, halves, years });
});

app.post('/api/reports/send-period', async (req, res) => {
  const type = String(req.body?.type || 'month');
  const value = String(req.body?.value || monthKeyNow());
  const recipientEmails = Array.isArray(req.body?.recipient_emails) ? req.body.recipient_emails : [];
  const issueIds = Array.isArray(req.body?.issue_ids) ? req.body.issue_ids : [];
  if (!['month', 'quarter', 'half', 'year'].includes(type)) {
    return res.status(400).json({ message: 'Invalid type.' });
  }
  const result = await sendPeriodReport(type, value, recipientEmails, issueIds);
  res.json(result);
});

app.post('/api/reports/send-now', async (req, res) => {
  const quarter = quarterNowKey();
  const months = monthsFromPeriod('quarter', quarter);
  const recipientEmails = Array.isArray(req.body?.recipient_emails) ? req.body.recipient_emails : [];
  const issueIds = Array.isArray(req.body?.issue_ids) ? req.body.issue_ids : [];
  await collectLaborNewsForMonths(months);
  const result = await sendPeriodReport('quarter', quarter, recipientEmails, issueIds);
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
