const params = new URLSearchParams(window.location.search);
const eventIdFromQuery = params.get('event');

const meetingInfo = document.getElementById('meetingInfo');
const reloadBtn = document.getElementById('reloadBtn');
const portalQrImage = document.getElementById('portalQrImage');
const portalCheckinLink = document.getElementById('portalCheckinLink');

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

async function getEventById(eventId) {
  const res = await fetch(`/api/events/${encodeURIComponent(eventId)}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || '회의 조회 실패');
  return data;
}

async function getLatestEvent() {
  const res = await fetch('/api/events');
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || '회의 목록 조회 실패');

  const items = data.items || [];
  if (!items.length) return null;

  const latest = items[0];
  return getEventById(latest.id);
}

function renderEvent(event) {
  const dateText = event.meeting_date ? event.meeting_date : '일자 미지정';
  meetingInfo.textContent = `회의일자: ${dateText} | 회의명: ${event.title}`;
  meetingInfo.className = 'msg success';

  portalCheckinLink.href = event.checkin_url;
  portalCheckinLink.textContent = event.checkin_url;
  portalQrImage.src = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(event.checkin_url)}`;
}

async function loadPortal() {
  meetingInfo.textContent = '회의 정보를 불러오는 중...';
  meetingInfo.className = 'msg';

  try {
    const event = eventIdFromQuery
      ? await getEventById(eventIdFromQuery)
      : await getLatestEvent();

    if (!event) {
      meetingInfo.textContent = '등록된 회의가 없습니다. 관리자에서 회의를 생성해 주세요.';
      meetingInfo.className = 'msg error';
      portalCheckinLink.textContent = '';
      portalCheckinLink.removeAttribute('href');
      portalQrImage.removeAttribute('src');
      return;
    }

    renderEvent(event);
  } catch (error) {
    meetingInfo.textContent = error.message;
    meetingInfo.className = 'msg error';
    portalCheckinLink.textContent = '';
    portalCheckinLink.removeAttribute('href');
    portalQrImage.removeAttribute('src');
  }
}

reloadBtn.addEventListener('click', loadPortal);

loadPortal();
