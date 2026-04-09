const params = new URLSearchParams(window.location.search);
const eventId = params.get('event');

const form = document.getElementById('checkinForm');
const submitMsg = document.getElementById('submitMsg');
const eventTitle = document.getElementById('eventTitle');

if (!eventId) {
  eventTitle.textContent = '유효하지 않은 접근입니다. QR 코드를 다시 확인해 주세요.';
  form.classList.add('hidden');
}

async function loadEvent() {
  const res = await fetch(`/api/events/${eventId}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || '회의 정보를 불러올 수 없습니다.');

  eventTitle.textContent = data.meeting_date
    ? `${data.title} (${data.meeting_date})`
    : data.title;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const fd = new FormData(form);
  const payload = {
    consent: !!fd.get('consent'),
    name: String(fd.get('name') || ''),
    workplace: String(fd.get('workplace') || ''),
    position: String(fd.get('position') || ''),
    phone: String(fd.get('phone') || ''),
    email: String(fd.get('email') || '')
  };

  submitMsg.textContent = '등록 중...';
  submitMsg.className = 'msg';

  try {
    const res = await fetch(`/api/events/${eventId}/attendees`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.message || '등록 실패');

    submitMsg.textContent = '참석 등록이 완료되었습니다.';
    submitMsg.className = 'msg success';
    form.reset();
  } catch (err) {
    submitMsg.textContent = err.message;
    submitMsg.className = 'msg error';
  }
});

(async () => {
  if (!eventId) return;

  try {
    await loadEvent();
  } catch (err) {
    eventTitle.textContent = err.message;
    form.classList.add('hidden');
  }
})();
