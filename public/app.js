/* global navigator, window, document, caches */
'use strict';

const STORAGE_USER = 'dailyHealthPwaUserId';
const STORAGE_REMINDER_LAST = 'dailyHealthReminderNotifiedYmd';

/** @type {Array<object>} */
let lastHistoryRows = [];

function taipeiYmd() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === 'year')?.value;
  const m = parts.find((p) => p.type === 'month')?.value;
  const d = parts.find((p) => p.type === 'day')?.value;
  return `${y}-${m}-${d}`;
}

function taipeiHHmm() {
  const s = new Date().toLocaleString('en-GB', {
    timeZone: 'Asia/Taipei',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return '00:00';
  return `${String(parseInt(m[1], 10)).padStart(2, '0')}:${m[2]}`;
}

function timingLabel(v) {
  if (v === 'fasting') return '空腹／餐前';
  if (v === 'postmeal') return '飯後';
  return '未註記';
}

function buildRecordShareText(r) {
  const timeLine = r.recorded_at_taipei || r.checkin_date || '—';
  return [
    '📋 健康打卡紀錄（僅供分享參考，非醫療診斷）',
    `⏰ 紀錄時間（台北）：${timeLine}`,
    `📅 打卡日：${r.checkin_date || '—'}`,
    '',
    `🩺 血壓：${r.systolic}/${r.diastolic} mmHg`,
    `🩸 血糖：${r.blood_sugar} mg/dL（${timingLabel(r.glucose_timing)}）`,
    `🚶 運動：${(r.exercise_text || '—').trim()}`,
    '',
    '— 每日健康打卡 PWA',
  ].join('\n');
}

function buildAllRecordsShareText(rows) {
  const lines = rows.map((r, i) => {
    const t = r.recorded_at_taipei || r.checkin_date;
    return `${i + 1}. ${t}｜血壓 ${r.systolic}/${r.diastolic}｜血糖 ${r.blood_sugar}（${timingLabel(r.glucose_timing)}）｜運動 ${(r.exercise_text || '').replace(/\n/g, ' ').slice(0, 40)}${(r.exercise_text || '').length > 40 ? '…' : ''}`;
  });
  return [
    '📋 健康紀錄摘要（僅供分享參考）',
    `共 ${rows.length} 筆 · 台北時區依紀錄時間排序`,
    '',
    ...lines,
    '',
    '— 每日健康打卡 PWA',
  ].join('\n');
}

function openLineShareText(text) {
  const url = `https://line.me/R/msg/text/?${encodeURIComponent(text)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

async function getOrCreateUserId() {
  let id = localStorage.getItem(STORAGE_USER);
  if (id && /^web:[0-9a-f-]{36}$/i.test(id)) return id;
  const r = await fetch('/api/pwa/new-id');
  const j = await r.json();
  if (!j.ok || !j.userId) throw new Error('無法取得使用者 ID');
  localStorage.setItem(STORAGE_USER, j.userId);
  return j.userId;
}

async function api(path, options = {}) {
  const userId = await getOrCreateUserId();
  const headers = {
    'Content-Type': 'application/json',
    'X-Web-User-Id': userId,
    ...(options.headers || {}),
  };
  const r = await fetch(path, { ...options, headers });
  const text = await r.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { ok: false, error: 'bad_json', raw: text };
  }
  if (!r.ok) {
    const err = new Error(data.error || `http_${r.status}`);
    err.data = data;
    err.status = r.status;
    throw err;
  }
  return data;
}

function setText(id, msg, isErr) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg || '';
  el.classList.toggle('err', !!isErr);
}

function updateOfflineBadge() {
  document.body.classList.toggle('offline', !navigator.onLine);
}

async function loadMe() {
  const data = await api('/api/pwa/me');
  document.getElementById('todayLabel').textContent = `伺服器今日日期（台北）：${data.today}`;
  if (data.profile) {
    document.getElementById('age').value = data.profile.age;
    document.getElementById('gender').value = data.profile.gender;
    document.getElementById('reminderEnabled').checked = !!data.profile.reminderEnabled;
    if (data.profile.reminderHhmm) {
      document.getElementById('reminderTime').value = data.profile.reminderHhmm;
    }
  }
}

async function saveProfile() {
  const age = parseInt(document.getElementById('age').value, 10);
  const gender = document.getElementById('gender').value;
  if (!age || !gender) {
    setText('profileStatus', '請填年齡與性別。', true);
    return;
  }
  await api('/api/pwa/profile', {
    method: 'PUT',
    body: JSON.stringify({ age, gender }),
  });
  setText('profileStatus', '個檔已儲存。');
}

async function submitCheckin() {
  const systolic = parseInt(document.getElementById('sys').value, 10);
  const diastolic = parseInt(document.getElementById('dia').value, 10);
  const bloodSugar = parseFloat(document.getElementById('glucose').value);
  const exerciseText = document.getElementById('exercise').value.trim() || '無';
  const glucoseTiming = document.getElementById('timing').value;
  try {
    const data = await api('/api/pwa/checkin', {
      method: 'POST',
      body: JSON.stringify({
        systolic,
        diastolic,
        bloodSugar,
        exerciseText,
        glucoseTiming,
      }),
    });
    document.getElementById('adviceOut').textContent = data.advice || '';
    setText('checkinStatus', `已記錄 ${data.date}（${data.timingLabel || ''}）`);
    loadHistory();
  } catch (e) {
    setText('checkinStatus', e.data?.error === 'invalid_checkin' ? '請檢查血壓、血糖與運動欄位。' : (e.message || '失敗'), true);
  }
}

async function loadHistory() {
  try {
    const data = await api('/api/pwa/history?limit=30');
    const rows = [...(data.rows || [])].sort((a, b) => (Number(b.created_at) || 0) - (Number(a.created_at) || 0));
    lastHistoryRows = rows;
    const container = document.getElementById('historyList');
    container.innerHTML = '';
    for (const r of rows) {
      const card = document.createElement('article');
      card.className = 'record-card';
      const timeStr = r.recorded_at_taipei || `${r.checkin_date}（無精確時間）`;
      const iso = r.created_at ? new Date(Number(r.created_at)).toISOString() : '';
      const dtAttr = iso ? ` datetime="${iso}"` : '';
      card.innerHTML = `
        <time${dtAttr}>${escapeHtml(timeStr)}</time>
        <div class="record-blocks">
          <div class="record-block record-block--bp">
            <span class="lbl">血壓</span>
            <span class="val">${escapeHtml(String(r.systolic))}／${escapeHtml(String(r.diastolic))} mmHg</span>
          </div>
          <div class="record-block record-block--glucose">
            <span class="lbl">血糖</span>
            <span class="val">${escapeHtml(String(r.blood_sugar))} mg/dL（${escapeHtml(timingLabel(r.glucose_timing))}）</span>
          </div>
          <div class="record-block record-block--exercise">
            <span class="lbl">運動</span>
            <span class="val">${escapeHtml((r.exercise_text || '—').trim() || '—')}</span>
          </div>
        </div>
      `;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-line';
      btn.textContent = 'LINE 分享此筆';
      btn.addEventListener('click', () => openLineShareText(buildRecordShareText(r)));
      card.appendChild(btn);
      container.appendChild(card);
    }
    setText('historyStatus', rows.length ? '' : '尚無紀錄');
  } catch (e) {
    lastHistoryRows = [];
    setText('historyStatus', '無法載入紀錄（離線？）', true);
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function hhmmFromTimeInput(val) {
  if (!val) return null;
  const m = /^(\d{2}):(\d{2})$/.exec(val);
  return m ? `${m[1]}:${m[2]}` : null;
}

async function saveReminder() {
  const enabled = document.getElementById('reminderEnabled').checked;
  const hhmm = hhmmFromTimeInput(document.getElementById('reminderTime').value);
  if (enabled && !hhmm) {
    setText('reminderStatus', '請選擇提醒時間。', true);
    return;
  }
  try {
    await api('/api/pwa/reminder', {
      method: 'PUT',
      body: JSON.stringify({ enabled, hhmm: hhmm || '08:00' }),
    });
    setText('reminderStatus', enabled ? `已同步：每日 ${hhmm}（台北）` : '已關閉伺服器端提醒（LINE 推播不適用於 PWA 帳號）。');
  } catch (e) {
    if (e.status === 400 && e.data?.error === 'need_profile') {
      setText('reminderStatus', '請先儲存個檔。', true);
    } else {
      setText('reminderStatus', '同步失敗', true);
    }
  }
}

function maybeFireLocalNotification(enabled, hhmm) {
  if (!enabled || !hhmm) return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const now = taipeiHHmm();
  if (now !== hhmm) return;
  const today = taipeiYmd();
  if (localStorage.getItem(STORAGE_REMINDER_LAST) === today) return;
  localStorage.setItem(STORAGE_REMINDER_LAST, today);
  try {
    new Notification('每日健康打卡', {
      body: '別忘了記錄今日血壓、血糖與運動。',
      tag: 'daily-health-' + today,
    });
  } catch (_) {}
}

function startReminderTicker() {
  setInterval(() => {
    const enabled = document.getElementById('reminderEnabled').checked;
    const hhmm = hhmmFromTimeInput(document.getElementById('reminderTime').value);
    maybeFireLocalNotification(enabled, hhmm);
  }, 30000);
}

async function registerSw() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    await reg.update();
  } catch (e) {
    console.warn('[sw]', e);
  }
}

function hideHelpBanner() {
  const el = document.getElementById('helpBanner');
  if (el) el.hidden = true;
}

function showHelpBanner() {
  const el = document.getElementById('helpBanner');
  if (el) {
    el.hidden = false;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function selectTab(tab) {
  const buttons = document.querySelectorAll('.tab-btn');
  const panels = {
    checkin: document.getElementById('panel-checkin'),
    records: document.getElementById('panel-records'),
    settings: document.getElementById('panel-settings'),
  };
  buttons.forEach((b) => {
    const on = b.dataset.tab === tab;
    b.classList.toggle('is-active', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  Object.entries(panels).forEach(([key, el]) => {
    if (!el) return;
    const on = key === tab;
    if (on) el.removeAttribute('hidden');
    else el.setAttribute('hidden', '');
  });
  if (tab === 'records') loadHistory();
  if (tab === 'settings') loadMe().catch(() => {});
}

function applyHashRouting() {
  const raw = (location.hash || '').replace(/^#/, '').trim().toLowerCase();
  if (raw === 'help') {
    showHelpBanner();
    selectTab('checkin');
    return;
  }
  hideHelpBanner();
  if (raw === 'records') {
    selectTab('records');
    return;
  }
  if (raw === 'settings') {
    selectTab('settings');
    return;
  }
  if (raw === 'checkin' || raw === '') {
    selectTab('checkin');
    return;
  }
  selectTab('checkin');
}

function initTabs() {
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      hideHelpBanner();
      if (history.replaceState) {
        history.replaceState(null, '', `${location.pathname}${location.search}#${btn.dataset.tab}`);
      }
      selectTab(btn.dataset.tab);
    });
  });
}

function initHelpClose() {
  const btn = document.getElementById('btnCloseHelp');
  if (btn) {
    btn.addEventListener('click', () => {
      hideHelpBanner();
      if (history.replaceState) {
        history.replaceState(null, '', `${location.pathname}${location.search}#checkin`);
      }
      selectTab('checkin');
    });
  }
}

document.getElementById('btnSaveProfile').addEventListener('click', () => {
  saveProfile().catch((e) => setText('profileStatus', e.message || '失敗', true));
});

document.getElementById('btnCheckin').addEventListener('click', () => {
  submitCheckin();
});

document.getElementById('btnRefreshHistory').addEventListener('click', () => {
  loadHistory();
});

document.getElementById('btnShareAllLine').addEventListener('click', () => {
  if (!lastHistoryRows.length) {
    setText('historyStatus', '沒有可分享的紀錄。', true);
    return;
  }
  openLineShareText(buildAllRecordsShareText(lastHistoryRows));
});

document.getElementById('btnSaveReminder').addEventListener('click', () => {
  saveReminder();
});

document.getElementById('btnNotifyPermission').addEventListener('click', async () => {
  if (!('Notification' in window)) {
    setText('reminderStatus', '此瀏覽器不支援通知。', true);
    return;
  }
  const p = await Notification.requestPermission();
  setText('reminderStatus', p === 'granted' ? '已允許通知。' : '未允許通知。', p !== 'granted');
});

window.addEventListener('online', updateOfflineBadge);
window.addEventListener('offline', updateOfflineBadge);
updateOfflineBadge();

registerSw();
initTabs();
initHelpClose();
startReminderTicker();
window.addEventListener('hashchange', applyHashRouting);

(async () => {
  try {
    await loadMe();
    await loadHistory();
    applyHashRouting();
  } catch (e) {
    setText('profileStatus', '無法連線伺服器，離線時可稍後再試。', true);
    applyHashRouting();
  }
})();
