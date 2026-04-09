const createForm = document.getElementById('createEventForm');
const createMsg = document.getElementById('createMsg');
const portalLink = document.getElementById('portalLink');
const portalPageQr = document.getElementById('portalPageQr');
const copyPortalBtn = document.getElementById('copyPortalBtn');
const portalMsg = document.getElementById('portalMsg');
const eventPanel = document.getElementById('eventPanel');
const rosterPanel = document.getElementById('rosterPanel');
const eventInfo = document.getElementById('eventInfo');
const checkinLink = document.getElementById('checkinLink');
const eventPortalLink = document.getElementById('eventPortalLink');
const rosterBody = document.getElementById('rosterBody');
const rosterCount = document.getElementById('rosterCount');
const refreshBtn = document.getElementById('refreshBtn');
const printBtn = document.getElementById('printBtn');
const copyEventPortalBtn = document.getElementById('copyEventPortalBtn');
const downloadCsv = document.getElementById('downloadCsv');
const csvFileInput = document.getElementById('csvFileInput');
const importCsvBtn = document.getElementById('importCsvBtn');
const importMsg = document.getElementById('importMsg');

const collectMonthInput = document.getElementById('collectMonthInput');
const collectMonthBtn = document.getElementById('collectMonthBtn');
const periodType = document.getElementById('periodType');
const periodValue = document.getElementById('periodValue');
const loadSummaryBtn = document.getElementById('loadSummaryBtn');
const sendPeriodBtn = document.getElementById('sendPeriodBtn');
const sendNowBtn = document.getElementById('sendNowBtn');
const reportMsg = document.getElementById('reportMsg');
const collectSourceStats = document.getElementById('collectSourceStats');
const categorySummary = document.getElementById('categorySummary');
const fieldSummary = document.getElementById('fieldSummary');
const reportPreview = document.getElementById('reportPreview');
const loadLogsBtn = document.getElementById('loadLogsBtn');
const reportLogsBody = document.getElementById('reportLogsBody');

let currentEventId = null;
let currentEventTitle = '';
let currentEventDate = '';

const portalUrl = `${window.location.origin}/portal.html`;

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function monthNowKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function renderChips(container, items) {
  container.innerHTML = items.map((it) => `<span class="chip">${escapeHtml(it.name)} ${it.count}건</span>`).join('');
  if (!items.length) container.innerHTML = '<span class="chip">데이터 없음</span>';
}

async function copyText(text, msgEl, okMessage) {
  try {
    await navigator.clipboard.writeText(text);
    msgEl.textContent = okMessage;
    msgEl.className = 'msg success';
  } catch {
    msgEl.textContent = '복사에 실패했습니다. 직접 선택해서 복사해 주세요.';
    msgEl.className = 'msg error';
  }
}

async function createEvent(payload) {
  const res = await fetch('/api/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || '회의 생성 실패');
  return data;
}

async function loadRoster(eventId) {
  const res = await fetch(`/api/events/${eventId}/attendees`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || '명부 조회 실패');

  rosterCount.textContent = `총 ${data.count}명`;
  rosterBody.innerHTML = data.items.map((it) => `
    <tr>
      <td>${escapeHtml(it.name)}</td>
      <td>${escapeHtml(it.workplace)}</td>
      <td>${escapeHtml(it.position)}</td>
      <td>${escapeHtml(it.phone)}</td>
      <td>${escapeHtml(it.email)}</td>
      <td>${escapeHtml(it.submitted_at)}</td>
    </tr>
  `).join('');
}

async function renderEvent(event) {
  currentEventId = event.id;
  currentEventTitle = event.title;
  currentEventDate = event.meeting_date || '';

  eventPanel.classList.remove('hidden');
  rosterPanel.classList.remove('hidden');

  const title = event.meeting_date ? `${event.title} (${event.meeting_date})` : event.title;
  eventInfo.textContent = `회의: ${title}`;
  checkinLink.href = event.checkin_url;
  checkinLink.textContent = event.checkin_url;
  eventPortalLink.href = `${portalUrl}?event=${encodeURIComponent(event.id)}`;
  eventPortalLink.textContent = `이 회의 QR페이지: ${eventPortalLink.href}`;
  downloadCsv.href = `/api/events/${event.id}/attendees.csv`;

  await QRCode.toCanvas(document.getElementById('qrcode'), event.checkin_url, {
    width: 220,
    margin: 1
  });

  try {
    await loadRoster(event.id);
  } catch (error) {
    rosterCount.textContent = '명부를 불러오지 못했습니다. 새로고침 버튼으로 다시 시도해 주세요.';
    rosterBody.innerHTML = '';
    console.error(error);
  }
}

async function loadAvailablePeriods() {
  const res = await fetch('/api/reports/available-periods');
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || '기간 목록 조회 실패');

  const type = periodType.value;
  const values = type === 'month' ? data.months
    : type === 'quarter' ? data.quarters
    : type === 'half' ? data.halves
    : data.years;

  periodValue.innerHTML = values.map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
}

async function collectMonthlyNews() {
  const month = (collectMonthInput.value || '').trim() || monthNowKey();
  const res = await fetch('/api/news/collect-monthly', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ month })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || '월간 수집 실패');
  return data;
}

async function importAttendeesCsv(eventId, csvText) {
  const res = await fetch(`/api/events/${eventId}/attendees/import-csv`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ csv_text: csvText })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'CSV 업로드 실패');
  return data;
}

async function loadPeriodSummary() {
  const type = periodType.value;
  const value = periodValue.value;
  const res = await fetch(`/api/reports/period?type=${encodeURIComponent(type)}&value=${encodeURIComponent(value)}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || '기간 리포트 조회 실패');

  renderChips(categorySummary, data.by_category || []);
  renderChips(fieldSummary, data.by_field || []);

  reportPreview.innerHTML = (data.items || []).map((item) => `
    <div class="report-item">
      <strong>[${escapeHtml(item.category)} / ${escapeHtml(item.field)}]</strong>
      <a href="${escapeHtml(item.link || '#')}" target="_blank" rel="noopener">${escapeHtml(item.title)}</a>
      <span>${escapeHtml(item.published_at)}</span>
    </div>
  `).join('');

  if (!data.items || !data.items.length) {
    reportPreview.innerHTML = '<p>해당 기간 데이터가 없습니다.</p>';
  }

  return data;
}

async function sendPeriodReport() {
  const payload = {
    type: periodType.value,
    value: periodValue.value
  };

  const res = await fetch('/api/reports/send-period', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.message || '기간 리포트 발송 실패');
  return data;
}

async function sendNowReport() {
  const res = await fetch('/api/reports/send-now', { method: 'POST' });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || '수시 즉시 발송 실패');
  return data;
}

async function loadReportLogs() {
  const res = await fetch('/api/reports/logs');
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || '발송 로그 조회 실패');

  reportLogsBody.innerHTML = data.items.map((it) => `
    <tr>
      <td>${escapeHtml(it.sent_at)}</td>
      <td>${escapeHtml(it.recipient_email_count)}</td>
      <td>${escapeHtml(it.item_count)}</td>
      <td>${escapeHtml(it.status)}</td>
      <td>${escapeHtml(it.detail || '')}</td>
    </tr>
  `).join('');
}

function printRoster() {
  if (!currentEventId) return;
  const url = `/print.html?event=${encodeURIComponent(currentEventId)}&title=${encodeURIComponent(currentEventTitle)}&meeting_date=${encodeURIComponent(currentEventDate)}`;
  window.open(url, '_blank', 'noopener');
}

createForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const formData = new FormData(createForm);

  createMsg.textContent = '회의 생성 중...';
  createMsg.className = 'msg';

  try {
    const event = await createEvent({
      title: formData.get('title'),
      meeting_date: formData.get('meeting_date')
    });

    await renderEvent(event);
    createMsg.textContent = '회의가 생성되었고 QR이 즉시 생성되었습니다.';
    createMsg.className = 'msg success';
  } catch (err) {
    createMsg.textContent = err.message;
    createMsg.className = 'msg error';
  }
});

refreshBtn.addEventListener('click', async () => {
  if (!currentEventId) return;
  await loadRoster(currentEventId);
});

printBtn.addEventListener('click', printRoster);
copyPortalBtn.addEventListener('click', async () => {
  await copyText(portalUrl, portalMsg, '포털 링크를 복사했습니다.');
});
copyEventPortalBtn.addEventListener('click', async () => {
  if (!currentEventId) return;
  await copyText(`${portalUrl}?event=${encodeURIComponent(currentEventId)}`, portalMsg, '이 회의 QR페이지 링크를 복사했습니다.');
});

periodType.addEventListener('change', async () => {
  try {
    await loadAvailablePeriods();
  } catch (err) {
    reportMsg.textContent = err.message;
    reportMsg.className = 'msg error';
  }
});

collectMonthBtn.addEventListener('click', async () => {
  reportMsg.textContent = '월간 신규 수집 중...';
  reportMsg.className = 'msg';
  try {
    const data = await collectMonthlyNews();
    await loadAvailablePeriods();
    const failedSources = (data.source_stats || []).filter((s) => s.error);
    const failText = failedSources.length ? `, 실패 소스 ${failedSources.length}개` : '';
    reportMsg.textContent = `${data.month} 수집 완료: 수집 ${data.fetched}건, 신규 저장 ${data.inserted}건${failText}`;
    reportMsg.className = 'msg success';

    collectSourceStats.innerHTML = (data.source_stats || []).map((s) => {
      const status = s.error ? `실패: ${escapeHtml(s.error)}` : '정상';
      return `<div class="report-item"><strong>[${escapeHtml(s.category)}] ${escapeHtml(s.source)}</strong><span>수집 ${s.fetched} / 저장 ${s.inserted} / ${status}</span></div>`;
    }).join('');
  } catch (err) {
    reportMsg.textContent = err.message;
    reportMsg.className = 'msg error';
  }
});

loadSummaryBtn.addEventListener('click', async () => {
  reportMsg.textContent = '기간 리포트 조회 중...';
  reportMsg.className = 'msg';
  try {
    const data = await loadPeriodSummary();
    reportMsg.textContent = `${data.period_type}:${data.period_value} 총 ${data.count}건`;
    reportMsg.className = 'msg success';
  } catch (err) {
    reportMsg.textContent = err.message;
    reportMsg.className = 'msg error';
  }
});

sendPeriodBtn.addEventListener('click', async () => {
  reportMsg.textContent = '기간 리포트 발송 중...';
  reportMsg.className = 'msg';
  try {
    const data = await sendPeriodReport();
    await loadReportLogs();
    reportMsg.textContent = `발송 완료: ${data.period_type}:${data.period_value}, 뉴스 ${data.item_count}건, 이메일 ${data.email_recipients}명`;
    reportMsg.className = 'msg success';
  } catch (err) {
    reportMsg.textContent = err.message;
    reportMsg.className = 'msg error';
  }
});

sendNowBtn.addEventListener('click', async () => {
  reportMsg.textContent = '현재월 기준 수시 즉시 발송 중...';
  reportMsg.className = 'msg';
  try {
    const data = await sendNowReport();
    await loadReportLogs();
    reportMsg.textContent = `즉시 발송 완료: month:${monthNowKey()}, 뉴스 ${data.item_count}건, 이메일 ${data.email_recipients}명`;
    reportMsg.className = 'msg success';
  } catch (err) {
    reportMsg.textContent = err.message;
    reportMsg.className = 'msg error';
  }
});

loadLogsBtn.addEventListener('click', async () => {
  reportMsg.textContent = '발송 로그 조회 중...';
  reportMsg.className = 'msg';
  try {
    await loadReportLogs();
    reportMsg.textContent = '발송 로그를 불러왔습니다.';
    reportMsg.className = 'msg success';
  } catch (err) {
    reportMsg.textContent = err.message;
    reportMsg.className = 'msg error';
  }
});

importCsvBtn.addEventListener('click', async () => {
  if (!currentEventId) {
    importMsg.textContent = '먼저 회의를 생성/선택해 주세요.';
    importMsg.className = 'msg error';
    return;
  }

  const file = csvFileInput.files && csvFileInput.files[0];
  if (!file) {
    importMsg.textContent = 'CSV 파일을 선택해 주세요.';
    importMsg.className = 'msg error';
    return;
  }

  importMsg.textContent = 'CSV 업로드 중...';
  importMsg.className = 'msg';

  try {
    const csvText = await file.text();
    const result = await importAttendeesCsv(currentEventId, csvText);
    await loadRoster(currentEventId);
    importMsg.textContent = `업로드 완료: 등록 ${result.inserted}건, 건너뜀 ${result.skipped}건`;
    importMsg.className = 'msg success';
  } catch (err) {
    importMsg.textContent = err.message;
    importMsg.className = 'msg error';
  }
});

(async () => {
  portalLink.href = portalUrl;
  portalLink.textContent = portalUrl;
  try {
    await QRCode.toCanvas(portalPageQr, portalUrl, {
      width: 220,
      margin: 1
    });
  } catch (error) {
    console.error(error);
  }

  collectMonthInput.value = monthNowKey();
  try {
    await loadAvailablePeriods();
  } catch {
    // no data yet
  }
})();
