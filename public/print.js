const params = new URLSearchParams(window.location.search);
const eventId = params.get('event');
const eventTitle = params.get('title') || '';
const eventDate = params.get('meeting_date') || '';

const info = document.getElementById('printEventInfo');
const body = document.getElementById('printRosterBody');

document.getElementById('printNowBtn').addEventListener('click', () => {
  window.print();
});

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

(async () => {
  if (!eventId) {
    info.textContent = '유효한 회의 ID가 없습니다.';
    return;
  }

  const titleText = eventDate ? `${eventTitle} (${eventDate})` : eventTitle;
  info.textContent = `회의: ${titleText}`;

  const res = await fetch(`/api/events/${eventId}/attendees`);
  const data = await res.json();

  if (!res.ok) {
    info.textContent = data.message || '명부를 불러오지 못했습니다.';
    return;
  }

  body.innerHTML = data.items.map((it) => `
    <tr>
      <td>${escapeHtml(it.name)}</td>
      <td>${escapeHtml(it.workplace)}</td>
      <td>${escapeHtml(it.position)}</td>
      <td>${escapeHtml(it.phone)}</td>
      <td>${escapeHtml(it.email)}</td>
      <td>${escapeHtml(it.submitted_at)}</td>
    </tr>
  `).join('');
})();
