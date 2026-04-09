const createForm = document.getElementById('createEventForm');
const createMsg = document.getElementById('createMsg');
const jumpToQrBtn = document.getElementById('jumpToQrBtn');
const eventPanel = document.getElementById('eventPanel');
const rosterPanel = document.getElementById('rosterPanel');
const eventInfo = document.getElementById('eventInfo');
const qrcodeCanvas = document.getElementById('qrcode');
const checkinQrImage = document.getElementById('checkinQrImage');
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
const eventMsg = document.getElementById('eventMsg');
const rosterFilterDate = document.getElementById('rosterFilterDate');
const rosterFilterEvent = document.getElementById('rosterFilterEvent');
const rosterSearchBtn = document.getElementById('rosterSearchBtn');
const rosterResetBtn = document.getElementById('rosterResetBtn');
const rosterQueryMsg = document.getElementById('rosterQueryMsg');
const rosterQuerySummary = document.getElementById('rosterQuerySummary');
const rosterQueryBody = document.getElementById('rosterQueryBody');

const collectPeriodBtn = document.getElementById('collectPeriodBtn');
const periodType = document.getElementById('periodType');
const periodValue = document.getElementById('periodValue');
const sendPeriodBtn = document.getElementById('sendPeriodBtn');
const sendNowBtn = document.getElementById('sendNowBtn');
const toggleRecipientsBtn = document.getElementById('toggleRecipientsBtn');
const recipientPanel = document.getElementById('recipientPanel');
const recipientFilterDate = document.getElementById('recipientFilterDate');
const recipientFilterEvent = document.getElementById('recipientFilterEvent');
const loadRecipientsBtn = document.getElementById('loadRecipientsBtn');
const selectAllRecipientsBtn = document.getElementById('selectAllRecipientsBtn');
const clearRecipientsBtn = document.getElementById('clearRecipientsBtn');
const recipientSummary = document.getElementById('recipientSummary');
const recipientList = document.getElementById('recipientList');
const reportMsg = document.getElementById('reportMsg');
const collectSourceStats = document.getElementById('collectSourceStats');
const reportPreview = document.getElementById('reportPreview');
const previewPdfBtn = document.getElementById('previewPdfBtn');
const downloadPdfBtn = document.getElementById('downloadPdfBtn');
const issueSelectMsg = document.getElementById('issueSelectMsg');
const pdfPreviewPanel = document.getElementById('pdfPreviewPanel');
const pdfPreviewFrame = document.getElementById('pdfPreviewFrame');
const loadLogsBtn = document.getElementById('loadLogsBtn');
const reportLogsBody = document.getElementById('reportLogsBody');

let currentEventId = null;
let currentEventTitle = '';
let currentEventDate = '';
let recipientCandidates = [];
let currentReportItems = [];

const portalUrl = `${window.location.origin}/portal.html`;

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function quarterNowKey() {
  const d = new Date();
  const y = d.getFullYear();
  const q = Math.floor(d.getMonth() / 3) + 1;
  return `${y}-Q${q}`;
}

function halfNowKey() {
  const d = new Date();
  const y = d.getFullYear();
  const h = d.getMonth() < 6 ? 1 : 2;
  return `${y}-H${h}`;
}

function yearNowKey() {
  return String(new Date().getFullYear());
}

function currentPeriodValue(type) {
  if (type === 'month') {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }
  if (type === 'quarter') return quarterNowKey();
  if (type === 'half') return halfNowKey();
  return yearNowKey();
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

function eventLabel(event) {
  if (event.meeting_date) return `${event.meeting_date} | ${event.title}`;
  return event.title;
}

function renderEventSelect(selectEl, events, selectedId = '') {
  const options = ['<option value="">전체 회의</option>']
    .concat(events.map((ev) => `<option value="${escapeHtml(ev.id)}">${escapeHtml(eventLabel(ev))}</option>`));
  selectEl.innerHTML = options.join('');
  if (selectedId) selectEl.value = selectedId;
}

async function loadEventOptions(selectedId = '') {
  const res = await fetch('/api/events');
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || '회의 목록 조회 실패');

  const events = data.items || [];
  renderEventSelect(rosterFilterEvent, events, selectedId);
  renderEventSelect(recipientFilterEvent, events, selectedId);
}

function getSelectedRecipientEmails() {
  return Array.from(document.querySelectorAll('.recipient-check:checked'))
    .map((el) => el.value)
    .filter(Boolean);
}

function updateRecipientSummaryText(total) {
  const selected = getSelectedRecipientEmails().length;
  recipientSummary.textContent = `대상 ${total}명 중 ${selected}명 선택`;
  recipientSummary.className = 'msg';
}

function renderRecipientCandidates(items) {
  recipientCandidates = items || [];
  recipientList.innerHTML = recipientCandidates.map((it) => `
    <label class="chip">
      <input class="recipient-check" type="checkbox" value="${escapeHtml(it.email)}" />
      ${escapeHtml(it.name || '이름없음')} (${escapeHtml(it.email)})
    </label>
  `).join('');

  if (!recipientCandidates.length) {
    recipientList.innerHTML = '<span class="chip">대상자가 없습니다.</span>';
  }

  document.querySelectorAll('.recipient-check').forEach((el) => {
    el.addEventListener('change', () => updateRecipientSummaryText(recipientCandidates.length));
  });
  updateRecipientSummaryText(recipientCandidates.length);
}

function getSelectedIssueIds() {
  return [...new Set(
    Array.from(document.querySelectorAll('.issue-check:checked'))
      .map((el) => Number(el.value))
      .filter((v) => Number.isFinite(v))
  )];
}

function updateIssueSelectionMessage() {
  const selected = getSelectedIssueIds().length;
  issueSelectMsg.textContent = `이슈 ${currentReportItems.length}건 중 ${selected}건 선택 (항목별 체크로 선택)`;
  issueSelectMsg.className = 'msg';
}

function groupIssuesByField(items) {
  const map = new Map();
  items.forEach((item) => {
    const field = item.field || '기타';
    if (!map.has(field)) map.set(field, []);
    map.get(field).push(item);
  });
  return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0], 'ko'));
}

async function loadRecipientCandidates() {
  const params = new URLSearchParams();
  if (recipientFilterDate.value) params.set('meeting_date', recipientFilterDate.value);
  if (recipientFilterEvent.value) params.set('event_id', recipientFilterEvent.value);

  const query = params.toString();
  const url = query ? `/api/recipients?${query}` : '/api/recipients';
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || '발송 대상 조회 실패');
  renderRecipientCandidates(data.items || []);
  return data;
}

async function queryRosters() {
  const params = new URLSearchParams();
  if (rosterFilterDate.value) params.set('meeting_date', rosterFilterDate.value);
  if (rosterFilterEvent.value) params.set('event_id', rosterFilterEvent.value);

  const query = params.toString();
  const url = query ? `/api/rosters?${query}` : '/api/rosters';
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || '명부 통합 조회 실패');

  const rowsHtml = [];
  (data.rows || []).forEach((row) => {
    const dateText = row.event?.meeting_date || '-';
    const titleText = row.event?.title || '-';
    const attendees = row.attendees || [];

    if (!attendees.length) {
      rowsHtml.push(`
        <tr>
          <td>${escapeHtml(dateText)}</td>
          <td>${escapeHtml(titleText)}</td>
          <td colspan="6">등록된 참석자가 없습니다.</td>
        </tr>
      `);
      return;
    }

    attendees.forEach((it) => {
      rowsHtml.push(`
        <tr>
          <td>${escapeHtml(dateText)}</td>
          <td>${escapeHtml(titleText)}</td>
          <td>${escapeHtml(it.name)}</td>
          <td>${escapeHtml(it.workplace)}</td>
          <td>${escapeHtml(it.position)}</td>
          <td>${escapeHtml(it.phone)}</td>
          <td>${escapeHtml(it.email)}</td>
          <td>${escapeHtml(it.submitted_at)}</td>
        </tr>
      `);
    });
  });

  rosterQueryBody.innerHTML = rowsHtml.join('');
  if (!rowsHtml.length) {
    rosterQueryBody.innerHTML = '<tr><td colspan="8">조회 결과가 없습니다.</td></tr>';
  }

  rosterQuerySummary.textContent = `조회 회의 ${data.total_events}건, 참석자 ${data.total_attendees}명`;
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

  if (window.QRCode && typeof QRCode.toCanvas === 'function') {
    qrcodeCanvas.classList.remove('hidden');
    checkinQrImage.classList.add('hidden');
    await QRCode.toCanvas(qrcodeCanvas, event.checkin_url, {
      width: 220,
      margin: 1
    });
  } else {
    qrcodeCanvas.classList.add('hidden');
    checkinQrImage.classList.remove('hidden');
    checkinQrImage.src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(event.checkin_url)}`;
  }

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

  const resolvedValues = values && values.length ? values : [currentPeriodValue(type)];
  periodValue.innerHTML = resolvedValues.map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
  periodValue.value = resolvedValues[0];
}

async function collectPeriodNews() {
  const type = periodType.value;
  const value = periodValue.value || currentPeriodValue(type);
  const res = await fetch('/api/news/collect-period', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, value })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || '기간 수집 실패');
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
  const value = periodValue.value || currentPeriodValue(type);
  const res = await fetch(`/api/reports/period?type=${encodeURIComponent(type)}&value=${encodeURIComponent(value)}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || '기간 리포트 조회 실패');

  currentReportItems = data.items || [];
  const grouped = groupIssuesByField(currentReportItems);
  reportPreview.innerHTML = grouped.map(([field, rows]) => `
    <div class="report-item">
      <strong>${escapeHtml(field)} (${rows.length}건)</strong>
      ${rows.map((item) => `
        <label><input class="issue-check" type="checkbox" value="${Number(item.id)}" /> 이 이슈 선택</label>
        <details>
          <summary>${escapeHtml(item.title)}</summary>
          <div>출처: ${escapeHtml(item.source_name || '-')}</div>
          <div>카테고리: ${escapeHtml(item.category || '-')}</div>
          <div>분야: ${escapeHtml(item.field || '-')}</div>
          <div>발행일: ${escapeHtml(item.published_at || '-')}</div>
          <div>내용: ${escapeHtml(item.summary || '요약 정보가 없습니다.')}</div>
          <div><a href="${escapeHtml(item.link || '#')}" target="_blank" rel="noopener">${escapeHtml(item.link || '')}</a></div>
        </details>
      `).join('')}
    </div>
  `).join('');

  if (!currentReportItems.length) {
    reportPreview.innerHTML = '<p>해당 기간 수집 데이터가 없습니다. "선택 기간 신규 수집" 후 다시 조회해 주세요.</p>';
  }
  document.querySelectorAll('.issue-check').forEach((el) => {
    el.addEventListener('change', updateIssueSelectionMessage);
  });
  updateIssueSelectionMessage();

  return data;
}

async function sendPeriodReport() {
  const recipientEmails = getSelectedRecipientEmails();
  const issueIds = getSelectedIssueIds();
  const type = periodType.value;
  const value = periodValue.value || currentPeriodValue(type);
  const payload = {
    type,
    value,
    recipient_emails: recipientEmails,
    issue_ids: issueIds
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
  const payload = {
    recipient_emails: getSelectedRecipientEmails(),
    issue_ids: getSelectedIssueIds()
  };
  const res = await fetch('/api/reports/send-now', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
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

function downloadPeriodPdf() {
  window.open(buildPeriodPdfUrl(false), '_blank', 'noopener');
}

function buildPeriodPdfUrl(preview = false) {
  const type = periodType.value;
  const value = periodValue.value || currentPeriodValue(type);
  const issueIds = getSelectedIssueIds();
  const params = new URLSearchParams({ type, value });
  if (issueIds.length > 0) params.set('issue_ids', issueIds.join(','));
  if (preview) params.set('preview', '1');
  return `/api/reports/period-pdf?${params.toString()}`;
}

function previewPeriodPdf() {
  pdfPreviewPanel.classList.remove('hidden');
  pdfPreviewFrame.src = buildPeriodPdfUrl(true);
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

    await loadEventOptions(event.id);
    await renderEvent(event);
    await queryRosters();
    jumpToQrBtn.classList.remove('hidden');
    eventPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
copyEventPortalBtn.addEventListener('click', async () => {
  if (!currentEventId) return;
  await copyText(`${portalUrl}?event=${encodeURIComponent(currentEventId)}`, eventMsg, '이 회의 QR페이지 링크를 복사했습니다.');
});
jumpToQrBtn.addEventListener('click', () => {
  eventPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
});
toggleRecipientsBtn.addEventListener('click', async () => {
  recipientPanel.classList.toggle('hidden');
  if (!recipientPanel.classList.contains('hidden')) {
    try {
      await loadRecipientCandidates();
    } catch (err) {
      recipientSummary.textContent = err.message;
      recipientSummary.className = 'msg error';
    }
  }
});
loadRecipientsBtn.addEventListener('click', async () => {
  recipientSummary.textContent = '발송 대상 조회 중...';
  recipientSummary.className = 'msg';
  try {
    const data = await loadRecipientCandidates();
    recipientSummary.textContent = `발송 대상 ${data.count}명을 불러왔습니다.`;
    recipientSummary.className = 'msg success';
    updateRecipientSummaryText(data.count);
  } catch (err) {
    recipientSummary.textContent = err.message;
    recipientSummary.className = 'msg error';
  }
});
selectAllRecipientsBtn.addEventListener('click', () => {
  document.querySelectorAll('.recipient-check').forEach((el) => { el.checked = true; });
  updateRecipientSummaryText(recipientCandidates.length);
});
clearRecipientsBtn.addEventListener('click', () => {
  document.querySelectorAll('.recipient-check').forEach((el) => { el.checked = false; });
  updateRecipientSummaryText(recipientCandidates.length);
});
previewPdfBtn.addEventListener('click', () => {
  previewPeriodPdf();
});
downloadPdfBtn.addEventListener('click', () => {
  downloadPeriodPdf();
});
rosterSearchBtn.addEventListener('click', async () => {
  rosterQueryMsg.textContent = '명부 조회 중...';
  rosterQueryMsg.className = 'msg';
  try {
    await queryRosters();
    rosterQueryMsg.textContent = '명부 조회가 완료되었습니다.';
    rosterQueryMsg.className = 'msg success';
  } catch (err) {
    rosterQueryMsg.textContent = err.message;
    rosterQueryMsg.className = 'msg error';
  }
});
rosterResetBtn.addEventListener('click', async () => {
  rosterFilterDate.value = '';
  rosterFilterEvent.value = '';
  rosterQueryMsg.textContent = '초기화 후 전체 명부를 조회합니다...';
  rosterQueryMsg.className = 'msg';
  try {
    await queryRosters();
    rosterQueryMsg.textContent = '전체 명부 조회가 완료되었습니다.';
    rosterQueryMsg.className = 'msg success';
  } catch (err) {
    rosterQueryMsg.textContent = err.message;
    rosterQueryMsg.className = 'msg error';
  }
});

periodType.addEventListener('change', async () => {
  try {
    await loadAvailablePeriods();
  } catch (err) {
    reportMsg.textContent = err.message;
    reportMsg.className = 'msg error';
  }
});

collectPeriodBtn.addEventListener('click', async () => {
  reportMsg.textContent = '선택 기간 수집/조회 중...';
  reportMsg.className = 'msg';
  try {
    const data = await collectPeriodNews();
    await loadAvailablePeriods();
    await loadPeriodSummary();
    const failedSources = (data.source_stats || []).filter((s) => s.error);
    const failText = failedSources.length ? `, 실패 소스 ${failedSources.length}개` : '';
    reportMsg.textContent = `${data.period_type}:${data.period_value} 수집/조회 완료: 수집 ${data.fetched}건, 신규 저장 ${data.inserted}건${failText} (아래에서 이슈 선택 가능)`;
    reportMsg.className = 'msg success';

    collectSourceStats.innerHTML = (data.source_stats || []).map((s) => {
      const status = s.error ? `실패: ${escapeHtml(s.error)}` : '정상';
      const preview = (s.items_preview || []).map((it) => `
        <label><input class="issue-check" type="checkbox" value="${Number(it.id)}" /> 이 이슈 선택</label>
        <details class="report-item">
          <summary>${escapeHtml(it.title || '')}</summary>
          <span>${escapeHtml(it.published_at || '-')}</span>
          <span>${escapeHtml(it.summary || '요약 없음')}</span>
          <a href="${escapeHtml(it.link || '#')}" target="_blank" rel="noopener">${escapeHtml(it.link || '')}</a>
        </details>
      `).join('');
      return `
        <div class="report-item">
          <strong>[${escapeHtml(s.category)}] ${escapeHtml(s.source)}</strong>
          <span>수집 ${s.fetched} / 저장 ${s.inserted} / ${status}</span>
          <details>
            <summary>세부 내용 보기</summary>
            ${preview || '<span>해당 소스에서 새로 저장된 항목이 없습니다.</span>'}
          </details>
        </div>
      `;
    }).join('');
    document.querySelectorAll('.issue-check').forEach((el) => {
      el.addEventListener('change', updateIssueSelectionMessage);
    });
    updateIssueSelectionMessage();
  } catch (err) {
    reportMsg.textContent = err.message;
    reportMsg.className = 'msg error';
  }
});

sendPeriodBtn.addEventListener('click', async () => {
  const selectedIssues = getSelectedIssueIds().length;
  reportMsg.textContent = '기간 리포트 발송 중...';
  reportMsg.className = 'msg';
  try {
    const data = await sendPeriodReport();
    await loadReportLogs();
    reportMsg.textContent = `발송 완료: ${data.period_type}:${data.period_value}, 뉴스 ${data.item_count}건(선택 ${selectedIssues}건), 이메일 ${data.email_recipients}명`;
    reportMsg.className = 'msg success';
  } catch (err) {
    reportMsg.textContent = err.message;
    reportMsg.className = 'msg error';
  }
});

sendNowBtn.addEventListener('click', async () => {
  const selectedIssues = getSelectedIssueIds().length;
  reportMsg.textContent = '현재분기 기준 수시 즉시 발송 중...';
  reportMsg.className = 'msg';
  try {
    const data = await sendNowReport();
    await loadReportLogs();
    reportMsg.textContent = `즉시 발송 완료: quarter:${quarterNowKey()}, 뉴스 ${data.item_count}건(선택 ${selectedIssues}건), 이메일 ${data.email_recipients}명`;
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
  updateIssueSelectionMessage();
  try {
    await loadEventOptions();
    await loadRecipientCandidates();
    await queryRosters();
    await loadAvailablePeriods();
    await loadPeriodSummary();
  } catch {
    // no data yet
  }
})();
