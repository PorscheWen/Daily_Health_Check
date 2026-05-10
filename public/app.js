/* global navigator, window, document, caches */
'use strict';

import { buildAdvice, timingLabel } from './advice-client.js';
import { validateCheckinBody, normalizeGender } from './health-core-client.js';
import { openDb, getProfile, putProfile, addCheckin, listCheckins } from './local-db.js';

const STORAGE_REMINDER_LAST = 'dailyHealthReminderNotifiedYmd';

/** @type {IDBDatabase | undefined} */
let db;

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

function formatTaipeiDateTime(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n)) return '';
  return new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(n));
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

function setText(id, msg, isErr) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg || '';
  el.classList.toggle('err', !!isErr);
}

function updateOfflineBadge() {
  document.body.classList.toggle('offline', !navigator.onLine);
}

function profileForAdvice(p) {
  if (!p || !p.age || !p.gender) return null;
  return { age: p.age, gender: p.gender };
}

async function loadMe() {
  if (!db) return;
  const profile = await getProfile(db);
  document.getElementById('todayLabel').textContent = `今日日期（台北）：${taipeiYmd()}`;
  if (profile) {
    document.getElementById('age').value = profile.age ?? '';
    document.getElementById('gender').value = profile.gender ?? '';
    document.getElementById('reminderEnabled').checked = !!profile.reminderEnabled;
    if (profile.reminderHhmm) {
      document.getElementById('reminderTime').value = profile.reminderHhmm;
    }
  }
}

async function saveProfile() {
  if (!db) {
    setText('profileStatus', '本機資料庫未就緒。', true);
    return;
  }
  const age = parseInt(document.getElementById('age').value, 10);
  const gender = normalizeGender(document.getElementById('gender').value);
  if (!age || !gender) {
    setText('profileStatus', '請填年齡與性別。', true);
    return;
  }
  const prev = (await getProfile(db)) || {};
  await putProfile(db, {
    ...prev,
    age,
    gender,
  });
  setText('profileStatus', '個檔已儲存在此裝置（不上傳伺服器）。');
}

async function submitCheckin() {
  if (!db) {
    setText('checkinStatus', '本機資料庫未就緒。', true);
    return;
  }
  const body = {
    systolic: parseInt(document.getElementById('sys').value, 10),
    diastolic: parseInt(document.getElementById('dia').value, 10),
    bloodSugar: parseFloat(document.getElementById('glucose').value),
    exerciseText: document.getElementById('exercise').value.trim() || '無',
    glucoseTiming: document.getElementById('timing').value,
  };
  const parsed = validateCheckinBody(body);
  if (!parsed) {
    setText('checkinStatus', '請檢查血壓、血糖與運動欄位。', true);
    return;
  }
  const profile = profileForAdvice(await getProfile(db));
  const date = taipeiYmd();
  const created_at = Date.now();
  await addCheckin(db, {
    checkin_date: date,
    systolic: parsed.systolic,
    diastolic: parsed.diastolic,
    blood_sugar: parsed.bloodSugar,
    exercise_text: parsed.exerciseText,
    glucose_timing: parsed.glucoseTiming,
    created_at,
  });
  document.getElementById('adviceOut').textContent = buildAdvice({
    profile,
    systolic: parsed.systolic,
    diastolic: parsed.diastolic,
    bloodSugar: parsed.bloodSugar,
    exerciseText: parsed.exerciseText,
    glucoseTiming: parsed.glucoseTiming,
  });
  setText('checkinStatus', `已記錄 ${date}（${timingLabel(parsed.glucoseTiming)}）· 僅存此裝置`);
  loadHistory();
}

async function loadHistory() {
  if (!db) {
    lastHistoryRows = [];
    setText('historyStatus', '本機資料庫未就緒。', true);
    return;
  }
  try {
    const rowsRaw = await listCheckins(db, 30);
    const rows = rowsRaw.map((r) => ({
      checkin_date: r.checkin_date,
      systolic: r.systolic,
      diastolic: r.diastolic,
      blood_sugar: r.blood_sugar,
      exercise_text: r.exercise_text,
      glucose_timing: r.glucose_timing,
      created_at: r.created_at,
      recorded_at_taipei: formatTaipeiDateTime(r.created_at),
    }));
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
    setText('historyStatus', '無法讀取本機紀錄。', true);
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
  if (!db) {
    setText('reminderStatus', '本機資料庫未就緒。', true);
    return;
  }
  const enabled = document.getElementById('reminderEnabled').checked;
  const hhmm = hhmmFromTimeInput(document.getElementById('reminderTime').value);
  if (enabled && !hhmm) {
    setText('reminderStatus', '請選擇提醒時間。', true);
    return;
  }
  const prev = (await getProfile(db)) || {};
  await putProfile(db, {
    ...prev,
    reminderEnabled: enabled,
    reminderHhmm: enabled ? (hhmm || '08:00') : (prev.reminderHhmm || null),
  });
  setText(
    'reminderStatus',
    enabled ? `已儲存：每日 ${hhmm || '08:00'}（台北）本機通知 · 資料未上傳` : '已關閉本機每日提醒。',
  );
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

function setTabTheme(tab) {
  const key = tab === 'records' || tab === 'settings' ? tab : 'checkin';
  document.body.classList.remove('tab-theme-checkin', 'tab-theme-records', 'tab-theme-settings');
  document.body.classList.add('tab-theme-' + key);
}

function selectTab(tab) {
  setTabTheme(tab);
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
  submitCheckin().catch((e) => setText('checkinStatus', e.message || '失敗', true));
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
  saveReminder().catch((e) => setText('reminderStatus', e.message || '失敗', true));
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

initTabs();
initHelpClose();
startReminderTicker();
window.addEventListener('hashchange', applyHashRouting);

(async () => {
  try {
    db = await openDb();
    await registerSw();
    await loadMe();
    await loadHistory();
    applyHashRouting();
  } catch (e) {
    setText('profileStatus', '無法開啟本機資料庫（例如私密瀏覽）。請用一般分頁再試。', true);
    applyHashRouting();
  }
})();
