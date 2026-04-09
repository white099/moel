const eventSelect = document.getElementById('eventSelect');
const refreshEventsBtn = document.getElementById('refreshEventsBtn');
const portalInfo = document.getElementById('portalInfo');
const portalCheckinLink = document.getElementById('portalCheckinLink');
const portalQr = document.getElementById('portalQr');

const params = new URLSearchParams(window.location.search);
const initialEventId = params.get('event');

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

async function loadEvents() {
  const res = await fetch('/api/events');
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || '회의 목록 조회 실패');

  const items = data.items || [];
  eventSelect.innerHTML = items.map((e) => {
    const label = e.meeting_date ? `${e.title} (${e.meeting_date})` : e.title;
    return `<option value="${escapeHtml(e.id)}">${escapeHtml(label)}</option>`;
  }).join('');

  if (!items.length) {
    portalInfo.textContent = '현재 생성된 회의가 없습니다.';
    portalInfo.className = 'msg error';
    portalCheckinLink.textContent = '';
    portalCheckinLink.removeAttribute('href');
    return;
  }

  const targetId = initialEventId && items.some((e) => e.id === initialEventId)
    ? initialEventId
    : items[0].id;
  eventSelect.value = targetId;
  await renderSelectedEvent();
}

async function renderSelectedEvent() {
  const eventId = eventSelect.value;
  if (!eventId) return;

  const res = await fetch(`/api/events/${encodeURIComponent(eventId)}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || '회의 조회 실패');

  portalInfo.textContent = `선택된 회의: ${data.meeting_date ? `${data.title} (${data.meeting_date})` : data.title}`;
  portalInfo.className = 'msg success';

  portalCheckinLink.href = data.checkin_url;
  portalCheckinLink.textContent = data.checkin_url;

  await QRCode.toCanvas(portalQr, data.checkin_url, { width: 260, margin: 1 });
}

eventSelect.addEventListener('change', async () => {
  try {
    await renderSelectedEvent();
  } catch (error) {
    portalInfo.textContent = error.message;
    portalInfo.className = 'msg error';
  }
});

refreshEventsBtn.addEventListener('click', async () => {
  portalInfo.textContent = '회의 목록 불러오는 중...';
  portalInfo.className = 'msg';
  try {
    await loadEvents();
  } catch (error) {
    portalInfo.textContent = error.message;
    portalInfo.className = 'msg error';
  }
});

(async () => {
  try {
    await loadEvents();
  } catch (error) {
    portalInfo.textContent = error.message;
    portalInfo.className = 'msg error';
  }
})();
