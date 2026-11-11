import {pressureField} from '/admin/shared/sensor.js';
import {CHANNELS} from '/admin/shared/layout.js';
import {labels, channelIds, channelNames, currentView, pendingRequests, filterEvents, normalizeUserCode, sampleUsers, seatedDuration, userRecords} from './model.js';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
const time = at => new Date(at).toLocaleString('ko-KR', {month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit', hour12:false});
const storage = {
  get(key) { try {return sessionStorage.getItem(key);} catch {return null;} },
  set(key, value) { try {sessionStorage.setItem(key, value);} catch { /* Session can still run without persistence. */ } },
  remove(key) { try {sessionStorage.removeItem(key);} catch { /* No persistent token exists in this context. */ } },
};
let token = new URLSearchParams(location.hash.slice(1)).get('key') || '';
let endpoint = storage.get('seat-care-admin-endpoint') || `${location.origin}/api/telemetry`;
if (location.hash) history.replaceState(null, '', location.pathname + location.search);
let state = null, room = '', online = false, demo = false, busy = false, page = 'overview', filter = 'all', search = '';
let timer, abort, generation = 0, offset = 0, lastSuccess = 0;
let users = [], selectedUser = '01';
const signatures = new Map();
const detailDialog = $('#user-detail');
function closeDetail() {
  if (detailDialog.open) detailDialog.close();
  document.body.classList.remove('detail-open');
}
detailDialog.addEventListener('close', () => {
  document.body.classList.remove('detail-open');
  paint();
  if (demo && page === 'overview') $(`[data-user="${selectedUser}"]`)?.focus({preventScroll: true});
});
$('#close-detail').onclick = closeDetail;
detailDialog.addEventListener('click', e => {
  const bounds = detailDialog.getBoundingClientRect();
  if (e.target === detailDialog && (e.clientX < bounds.left || e.clientX > bounds.right || e.clientY < bounds.top || e.clientY > bounds.bottom)) closeDetail();
});
$('#today').textContent = new Date().toLocaleDateString('ko-KR', {year:'numeric', month:'long', day:'numeric', weekday:'long'});
$('#sensor-points').innerHTML = channelIds.map((id, i) => `<span class="point" title="${channelNames[i]}" style="left:${CHANNELS[id].x * 100}%;top:${CHANNELS[id].y * 100}%"></span>`).join('');

function showPage(next) {
  closeDetail();
  page = next;
  $$('.page').forEach(el => el.hidden = el.id !== `${page}-page`);
  $$('[data-page]').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
    if (el.dataset.page === page) el.setAttribute('aria-current', 'page');
    else el.removeAttribute('aria-current');
  });
  $('#breadcrumb').textContent = {overview:'현재 상태', records:'기록', settings:'설정'}[page];
  paint();
  $('#main').focus({preventScroll: true});
  window.scrollTo({top: 0});
}
function setFilter(next) {
  filter = next;
  $$('[data-filter]').forEach(el => {
    const selected = el.dataset.filter === filter;
    el.classList.toggle('selected', selected);
    el.setAttribute('aria-pressed', String(selected));
  });
  paint();
}
function draw(values) {
  const canvas = $('#map'), ctx = canvas.getContext('2d');
  ctx.fillStyle = '#3B424D'; ctx.fillRect(0, 0, 240, 300);
  if (values) {
    pressureField(values, 60, 48).forEach((row, y) => row.forEach((value, x) => {
      const p = Math.max(0, Math.min(1, value / 3200));
      // Match the user app's _pressureHeatColor palette and 3200 display maximum.
      const start = p < .5 ? [156,221,207] : [255,209,102];
      const end = p < .5 ? [255,209,102] : [255,92,92];
      const t = p < .5 ? p * 2 : (p - .5) * 2;
      ctx.fillStyle = p < .04 ? '#3B424D' : `rgb(${start.map((v, i) => Math.round(v + (end[i] - v) * t)).join(',')})`;
      ctx.fillRect(x * 5, y * 5, 5, 5);
    }));
  }
  $('#map-empty').hidden = !!values;
  $('#sensor-points').hidden = !values;
  canvas.setAttribute('aria-label', values ? channelNames.map((label, i) => `${label} ${Math.round(values[i])}`).join(', ') : '현재 센서값 없음');
}
function eventsHtml(events, allowActions = true) {
  if (!events.length) return '<li class="empty">표시할 기록이 없어요.</li>';
  return events.map(e => {
    const ownerState = demo && e.userId ? users.find(user => user.id === e.userId)?.state : state;
    const ack = ownerState?.acknowledgements[e.id];
    const owner = e.userName ? `<span class="event-owner">${escape(e.userName)}<small>${escape(e.device)}</small></span>` : '';
    const action = allowActions && ['help_requested', 'alert_created'].includes(e.type)
      ? ack ? `<span class="ack">확인 완료<time>${time(ack.at)}</time></span>`
        : `<button data-ack="${escape(e.id)}" data-owner="${escape(e.userId || '')}" aria-label="${escape(e.userName || '사용자')} ${escape(labels[e.type] || e.type)} 확인" ${busy || (!demo && !online) ? 'disabled' : ''}>안내 확인</button>`
      : '';
    return `<li><div class="event-content">${owner}<time datetime="${new Date(e.at).toISOString()}">${time(e.at)}</time><strong class="${e.type === 'help_requested' ? 'help-label' : ''}">${escape(labels[e.type] || e.type)}</strong><p>${escape(e.detail)}</p></div>${action}</li>`;
  }).join('');
}
function updateList(selector, events, actions) {
  const html = eventsHtml(events, actions);
  if (signatures.get(selector) !== html) {$(selector).innerHTML = html; signatures.set(selector, html);}
}
function paint() {
  const now = Date.now() + offset;
  if (demo && state) state.snapshot.at = now;
  const view = currentView(state, demo || online, now), s = state?.snapshot;
  const pending = pendingRequests(state), events = state?.events || [];
  const helpCount = pending.filter(e => e.type === 'help_requested').length;
  $('#join').hidden = demo || !!state;
  $('#user-picker').hidden = !demo || page !== 'overview';
  $('#main').classList.toggle('group-mode', demo);
  const overview = $('#overview-page');
  if (demo && overview.parentElement !== $('#sheet-content')) $('#sheet-content').append(overview);
  else if (!demo && overview.parentElement === $('#sheet-content')) {
    closeDetail();
    $('#overview-anchor').after(overview);
  }
  overview.hidden = demo ? !detailDialog.open : page !== 'overview';
  $('#sheet-notice').textContent = $('#notice').textContent;
  $('#session-duration').hidden = !demo;
  $('#detail-title').textContent = demo ? users.find(user => user.id === selectedUser).name : '현재 상태';
  $('#detail-description').textContent = demo ? '현재 착석 상태와 요청을 살펴보세요.' : '방석의 압력과 사용자의 안내 요청을 확인하세요.';
  if (demo) {
    const user = users.find(user => user.id === selectedUser);
    $('#selected-user').textContent = detailDialog.open ? `${user.name}님의 상세 상태를 보고 있어요` : '사용자를 눌러 상세 상태를 확인하세요';
    $('#seated-time').textContent = seatedDuration(user.seatedSince, now);
    $('#group-attention').textContent = `압력 완화 필요 ${users.filter(user => user.state.snapshot.bias.length).length}명`;
    const cards = users.map(user => {
      const requests = pendingRequests(user.state).length;
      const status = user.state.snapshot.bias.length ? '압력 완화 필요' : '안정적인 착석';
      return `<button class="user-card" data-user="${user.id}" aria-pressed="${detailDialog.open && user.id === selectedUser}" aria-haspopup="dialog" aria-controls="user-detail"><span class="seat-illustration" aria-hidden="true"><svg viewBox="0 0 80 80"><path d="M25 16v29c0 5 4 8 9 8h25M20 57h43M27 57l-5 15M57 57l5 15M26 21h27v20H26M53 41l9 12"/><circle cx="64" cy="16" r="10"/><path d="M64 10v6l4 3"/></svg></span><strong>${escape(user.name)}</strong><span class="user-duration" data-duration="${user.id}"></span><span class="user-status">${status}</span><span class="user-request">${requests ? '미확인 요청 ' + requests + '건' : '미확인 요청 없음'}</span></button>`;
    }).join('');
    if (signatures.get('users') !== cards) {$('#user-list').innerHTML = cards; signatures.set('users', cards);}
    $$('[data-duration]').forEach(el => {el.textContent = seatedDuration(users.find(user => user.id === el.dataset.duration).seatedSince, now);});
  }
  $('#connection').textContent = demo ? '압력 데이터' : online ? '공유 서버 연결됨' : token ? '공유 연결 확인 중' : '공유 연결 전';
  $('#connection').className = `connection${demo ? '' : online ? ' live' : ''}`;
  $('#refresh').disabled = busy || (!token && !demo);
  $('#disconnect').disabled = !token && !demo;
  $('#room-label').textContent = demo ? `${users.find(user => user.id === selectedUser).name} · ${s.device}` : room ? `공유방 ${room.slice(0, 8)}` : '연결된 공유방 없음';
  $('#summary-state').textContent = demo ? '사용 중' : !s ? '연결 대기' : view.fresh ? '수신 중' : '수신 중단';
  $('#summary-device').textContent = s?.device || '사용자 앱에서 공유를 켜 주세요';
  $('#help-count').textContent = state ? helpCount : '—';
  $('#completed').textContent = state ? events.filter(e => e.type === 'relief_completed').length : '—';
  const totalHelp = demo ? users.reduce((count, user) => count + pendingRequests(user.state).filter(event => event.type === 'help_requested').length, 0) : helpCount;
  $('#nav-count').textContent = totalHelp;
  $('#nav-count').hidden = totalHelp === 0;
  $('#data-kind').textContent = demo ? '압력 데이터' : view.fresh ? '실제 센서' : '수신 대기';
  $('#state-title').textContent = view.title;
  $('#guidance').textContent = view.guidance;
  $('.current-panel').dataset.tone = view.tone;
  $('#state-mark').textContent = view.tone === 'caution' ? '!' : view.tone === 'normal' ? '✓' : '—';
  $('#last-reading').textContent = s ? time(s.at) : '—';
  const signature = JSON.stringify(view.values);
  if (signatures.get('pressure') !== signature) {
    draw(view.values); signatures.set('pressure', signature);
    $('#readings').innerHTML = channelNames.map((name, i) => `<div><dt>${name}<small>${channelIds[i]}</small></dt><dd>${view.values ? Math.round(view.values[i]) : '—'}</dd></div>`).join('');
  }
  updateList('#requests', pending.slice(0, 2), true);
  updateList('#recent-events', [...events].reverse().slice(0, 3), false);
  const records = demo ? userRecords(users) : events.map(event => ({...event, userName: s?.device || '연결된 사용자', device: room ? `공유방 ${room.slice(0, 8)}` : ''}));
  const filtered = filterEvents(records, filter, search);
  updateList('#events', filtered, true);
  $('#records-meta').textContent = demo ? `사용자 ${users.length}명 · ${filtered.length}개 기록 · 최신순` : `${filtered.length}개 기록 · 최근 90일, 최대 2,000개`;
  $('#settings-connection').textContent = demo ? '저장된 데이터' : online ? '공유 서버 연결됨' : '연결 전 또는 수신 중단';
  $('#settings-device').textContent = s?.device || '—';
  $('#disconnect').textContent = demo ? '다른 방석 연결' : '공유방 연결 종료';
}
function fail(error) {
  online = false;
  $('#error').textContent = error.name === 'TimeoutError' ? '서버 응답이 늦어요. 잠시 후 다시 시도해 주세요.' : error.message || '공유 서버에 연결하지 못했어요.';
  $('#error').hidden = false;
}
function stop() {
  generation++; clearTimeout(timer); abort?.abort(); busy = false;
}
async function refresh(body) {
  clearTimeout(timer);
  if (demo) {paint(); return;}
  if (!token || document.hidden || busy) return;
  const current = generation, requestToken = token;
  busy = true;
  const controller = new AbortController(); abort = controller;
  const timeout = setTimeout(() => controller.abort(), 12000);
  paint();
  try {
    const res = await fetch(endpoint, {
      method: body ? 'POST' : 'GET', redirect: 'error', cache: 'no-store',
      headers: {Authorization: `Bearer ${requestToken}`, ...(body ? {'Content-Type': 'application/json'} : {})},
      body: body ? JSON.stringify(body) : undefined, signal: controller.signal,
    });
    const data = await res.json();
    if (current !== generation) return;
    if (!res.ok) throw Error(data.error || '공유 서버에 연결하지 못했어요.');
    if (data.role !== 'admin') throw Error('관리자용 초대 링크를 사용해 주세요.');
    if (room && room !== data.room) throw Error('공유방이 달라요. 초대 링크를 다시 확인해 주세요.');
    room = data.room; state = data.state; offset = data.serverNow - Date.now();
    online = true; lastSuccess = Date.now();
    storage.set('seat-care-admin', requestToken);
    storage.set('seat-care-admin-endpoint', endpoint);
    $('#error').hidden = true;
    if (body) $('#notice').textContent = '관리자 확인을 기록했어요.';
  } catch (error) {
    if (current === generation) fail(error.name === 'AbortError' ? Error('연결 시간이 초과됐어요. 다시 시도해 주세요.') : error);
  } finally {
    clearTimeout(timeout);
    if (current === generation) {
      busy = false; paint();
      if (token && !document.hidden) timer = setTimeout(() => refresh(), 5000);
    }
  }
}
function leave() {
  stop(); token = ''; state = null; room = ''; demo = false; online = false; offset = 0;
  storage.remove('seat-care-admin'); storage.remove('seat-care-admin-endpoint'); $('#error').hidden = true; signatures.clear();
  const url = new URL(location.href); url.searchParams.delete('preview');
  history.replaceState(null, '', url.pathname + url.search);
  $('#notice').textContent = ''; showPage('overview'); $('#invite').focus();
}
$('#join-form').addEventListener('submit', e => {
  e.preventDefault();
  connectWithCode($('#invite').value);
});
async function connectWithCode(value) {
  stop(); busy = true; paint();
  try {
    const code = normalizeUserCode(value);
    const connectEndpoint = new URL('/api/admin-connect', location.origin);
    const res = await fetch(connectEndpoint, {method: 'POST', cache: 'no-store', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({code})});
    const data = await res.json();
    if (!res.ok || !data.token || data.room !== code) throw Error(data.error || '사용자 코드로 연결하지 못했어요.');
    token = data.token; endpoint = new URL('/api/telemetry', connectEndpoint.origin).href;
    room = ''; state = null; demo = false; online = false;
    storage.remove('seat-care-admin'); storage.remove('seat-care-admin-endpoint');
    $('#invite').value = ''; busy = false; await refresh();
  } catch (error) {busy = false; fail(error); paint();}
}
function startPreview() {
  stop(); token = ''; storage.remove('seat-care-admin'); demo = true; offset = 0;
  if (!users.length) users = sampleUsers(Date.now());
  state = users.find(user => user.id === selectedUser).state;
  $('#notice').textContent = ''; $('#error').hidden = true; signatures.clear(); paint();
}
$('#user-list').onclick = e => {
  const button = e.target.closest('[data-user]');
  if (!demo || !button) return;
  const user = users.find(user => user.id === button.dataset.user);
  if (!user) return;
  selectedUser = user.id; state = user.state;
  search = ''; $('#search').value = ''; $('#notice').textContent = '';
  setFilter('all');
  showPage('overview');
  detailDialog.showModal();
  document.body.classList.add('detail-open');
  paint();
  detailDialog.scrollTop = 0;
  $('#close-detail').focus({preventScroll: true});
};
$('#sample-data').onclick = startPreview;
$('#disconnect').onclick = leave;
$('#refresh').onclick = () => refresh();
$$('[data-page]').forEach(button => button.onclick = () => showPage(button.dataset.page));
$$('[data-filter]').forEach(button => button.onclick = () => setFilter(button.dataset.filter));
$('#search').oninput = e => {search = e.target.value; paint();};
$('#view-help').onclick = () => {setFilter('help'); showPage('records');};
$('#view-requests').onclick = () => {setFilter('all'); showPage('records');};
$$('[data-open-records]').forEach(button => button.onclick = () => {setFilter('all'); showPage('records');});
document.addEventListener('click', e => {
  const button = e.target.closest('[data-ack]');
  if (!button || button.disabled) return;
  if (demo) {
    const owner = users.find(user => user.id === (button.dataset.owner || selectedUser));
    if (!owner || !owner.state.events.some(event => event.id === button.dataset.ack)) return;
    owner.state.acknowledgements[button.dataset.ack] = {at: Date.now()};
    $('#notice').textContent = `${owner.name}님의 요청 확인을 기록했어요.`;
    paint();
  } else refresh({action: 'acknowledge', eventId: button.dataset.ack});
});
$('#text-size').onclick = () => {
  const on = document.documentElement.classList.toggle('large-text');
  $('#text-size').setAttribute('aria-checked', String(on));
  storage.set('seat-care-large-text', String(on));
};
if (storage.get('seat-care-large-text') === 'true') {
  document.documentElement.classList.add('large-text'); $('#text-size').setAttribute('aria-checked', 'true');
}
setInterval(() => {
  if (Date.now() - lastSuccess > 15000) online = false;
  if (!document.hidden) paint();
}, 1000);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {stop(); online = false; paint();} else refresh();
});
if (!token) startPreview();
else {paint(); refresh();}
