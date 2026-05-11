'use strict';

const db = require('./db');
const { buildAdvice, timingLabel } = require('./advice');
const hc = require('./healthCore');

const {
  parseSetup,
  parseBpLine,
  parseTimingReply,
  parseGlucoseNumber,
  parseCheckin,
  parseHHmm,
} = hc;

const HELP_TEXT = [
  '🏥 每日健康打卡（衛教參考，非醫療診斷）',
  '',
  '【個檔】健康設定 <年齡> <性別>',
  '　例：健康設定 68 女',
  '',
  '【逐步打卡】開始打卡 — 依序輸入血壓、空腹或飯後、血糖、運動（輸入「取消」可中止）',
  '',
  '【一次打卡】打卡 <收縮壓>/<舒張壓> [空腹|飯後] <血糖mg/dL> <運動>',
  '　例：打卡 122/78 空腹 95 散步',
  '　例：打卡 130/85 飯後 180 飯後快走15分鐘',
  '　（省略空腹／飯後則為「未註記」）',
  '',
  '【提醒】提醒 — 查看設定｜提醒 HH:mm — 開啟（台北時區）｜提醒 關閉',
  '',
  '【PWA】也可用手機瀏覽器開啟本站並加入主畫面。',
  '',
  '【查詢】健康個檔｜健康紀錄',
].join('\n');

function formatProfile(p) {
  if (!p) return '尚未設定個檔。請輸入：健康設定 <年齡> <性別>';
  const lines = [`👤 個檔`, `• 年齡：${p.age} 歲`, `• 性別：${p.gender}`];
  if (p.reminder_enabled && p.reminder_hhmm) {
    lines.push(`• 每日提醒：開（台北 ${p.reminder_hhmm}）`);
  } else if (p.reminder_hhmm && !p.reminder_enabled) {
    lines.push(`• 每日提醒：關（已存時間 ${p.reminder_hhmm}）`);
  } else {
    lines.push('• 每日提醒：未設定（輸入「提醒」可看說明）');
  }
  return lines.join('\n');
}

function formatHistory(rows) {
  if (!rows.length) return '尚無打卡紀錄。';
  const lines = rows.map((r) => {
    const ex = r.exercise_text ? r.exercise_text.replace(/\s+/g, ' ').slice(0, 32) : '';
    const gt = timingLabel(r.glucose_timing || 'unknown');
    return `${r.checkin_date}  ${r.systolic}/${r.diastolic}  ${gt} 血糖${r.blood_sugar}  ${ex}${ex.length >= 32 ? '…' : ''}`;
  });
  return ['📆 最近紀錄（最多7筆）', ...lines].join('\n');
}

async function finalizeCheckin(userId, parsed, reply) {
  const profile = db.getProfile(userId);
  db.upsertCheckin(userId, {
    systolic: parsed.systolic,
    diastolic: parsed.diastolic,
    bloodSugar: parsed.bloodSugar,
    exerciseText: parsed.exerciseText,
    glucoseTiming: parsed.glucoseTiming || 'unknown',
  });
  const gtLabel = timingLabel(parsed.glucoseTiming || 'unknown');
  const summary = [
    `✅ 已記錄 ${db.taipeiYmd()} 打卡`,
    `• 血壓 ${parsed.systolic}/${parsed.diastolic} mmHg`,
    `• 血糖時機：${gtLabel}`,
    `• 血糖 ${parsed.bloodSugar} mg/dL`,
    `• 運動：${parsed.exerciseText}`,
    profile ? `• 個檔：${profile.age} 歲／${profile.gender}` : '• 個檔：尚未設定（可輸入「健康設定」）',
    '',
    buildAdvice({
      profile,
      systolic: parsed.systolic,
      diastolic: parsed.diastolic,
      bloodSugar: parsed.bloodSugar,
      exerciseText: parsed.exerciseText,
      glucoseTiming: parsed.glucoseTiming || 'unknown',
    }),
  ].join('\n');
  await reply([{ type: 'text', text: summary }]);
}

async function handleReminderCommand(userId, t, reply) {
  if (!/^提醒/u.test(t)) return false;

  const rest = t.replace(/^\s*提醒\s*/u, '').trim();

  if (t === '提醒' || rest === '') {
    const p = db.getProfile(userId);
    if (!p) {
      await reply([{ type: 'text', text: '尚未有個檔。請先輸入「健康設定 <年齡> <性別>」。' }]);
      return true;
    }
    const msg = p.reminder_enabled && p.reminder_hhmm
      ? `⏰ 每日提醒：已開啟\n• 時間（台北）：${p.reminder_hhmm}\n• 若要修改：輸入「提醒 09:00」\n• 若要關閉：輸入「提醒 關閉」`
      : `⏰ 每日提醒：未開啟\n• 設定範例（台北時區）：提醒 08:30\n• 關閉：提醒 關閉`;
    await reply([{ type: 'text', text: msg }]);
    return true;
  }

  if (/^(關閉|取消|停用)$/u.test(rest)) {
    const ok = db.getProfile(userId);
    if (!ok) {
      await reply([{ type: 'text', text: '尚未有個檔，無法變更提醒。' }]);
      return true;
    }
    db.setReminder(userId, false, null);
    await reply([{ type: 'text', text: '已關閉每日提醒。若要再開啟，請輸入「提醒 HH:mm」（例：提醒 08:30）。' }]);
    return true;
  }

  const hhmm = parseHHmm(rest);
  if (!hhmm) {
    await reply([{ type: 'text', text: '時間格式請用 HH:mm（24 小時制，台北時區）。\n例：提醒 08:30 或 提醒 9:00' }]);
    return true;
  }

  if (!db.getProfile(userId)) {
    await reply([{ type: 'text', text: '請先完成「健康設定 <年齡> <性別>」，再設定提醒時間。' }]);
    return true;
  }
  db.setReminder(userId, true, hhmm);
  await reply([{ type: 'text', text: `已設定每日提醒（台北時區 ${hhmm}）。\n當日僅推播一次；若要關閉請輸入「提醒 關閉」。` }]);
  return true;
}

async function handleConversation(userId, text, reply) {
  const conv = db.getConversation(userId);
  if (!conv || conv.flow !== 'checkin') return false;

  const t = String(text || '').trim();

  if (conv.step === 'bp') {
    const bp = parseBpLine(t);
    if (!bp) {
      await reply([{ type: 'text', text: '請輸入血壓，格式：收縮壓/舒張壓（例：118/76），或 118 76。' }]);
      return true;
    }
    db.setConversation(userId, 'checkin', 'glucose_timing', { ...conv.payload, ...bp });
    await reply([{ type: 'text', text: '本次血糖測量時機？請回覆其中一個：\n空腹（含餐前）／飯後' }]);
    return true;
  }

  if (conv.step === 'glucose_timing') {
    const timing = parseTimingReply(t);
    if (!timing) {
      await reply([{ type: 'text', text: '請回覆「空腹」或「飯後」（若想表達餐前，也可輸入「空腹」）。' }]);
      return true;
    }
    db.setConversation(userId, 'checkin', 'glucose_value', { ...conv.payload, glucoseTiming: timing });
    await reply([{ type: 'text', text: '請輸入血糖數字（mg/dL），例：95' }]);
    return true;
  }

  if (conv.step === 'glucose_value') {
    const g = parseGlucoseNumber(t);
    if (g == null) {
      await reply([{ type: 'text', text: '請輸入合理的血糖數字（mg/dL），例：102。' }]);
      return true;
    }
    db.setConversation(userId, 'checkin', 'exercise', { ...conv.payload, bloodSugar: g });
    await reply([{ type: 'text', text: '請簡述今日運動（若尚未運動可填「無」）。' }]);
    return true;
  }

  if (conv.step === 'exercise') {
    const exerciseText = t.length ? t : '無';
    const p = conv.payload;
    db.clearConversation(userId);
    await finalizeCheckin(userId, {
      systolic: p.systolic,
      diastolic: p.diastolic,
      bloodSugar: p.bloodSugar,
      exerciseText,
      glucoseTiming: p.glucoseTiming || 'unknown',
    }, reply);
    return true;
  }

  return false;
}

/**
 * @returns {Promise<boolean>} 是否已處理（應停止後續邏輯）
 */
async function tryHandleHealth({ userId, text, reply }) {
  const t = String(text || '').trim();
  if (!t) return false;

  if (t === '取消') {
    db.clearConversation(userId);
    await reply([{ type: 'text', text: '已取消目前的逐步打卡。若要重新開始請輸入「開始打卡」。' }]);
    return true;
  }

  if (await handleConversation(userId, t, reply)) return true;

  if (t === '健康' || t === '健康說明') {
    await reply([{ type: 'text', text: HELP_TEXT }]);
    return true;
  }

  if (await handleReminderCommand(userId, t, reply)) return true;

  if (/^健康設定\s+/u.test(t)) {
    const parsed = parseSetup(t);
    if (!parsed) {
      await reply([{ type: 'text', text: '格式有誤。\n例：健康設定 68 女' }]);
      return true;
    }
    db.upsertProfile(userId, parsed.age, parsed.gender);
    await reply([{ type: 'text', text: `已更新個檔：${parsed.age} 歲、${parsed.gender}。\n\n可輸入「開始打卡」或依說明一次完成打卡。\n\n${HELP_TEXT}` }]);
    return true;
  }

  if (t === '健康個檔') {
    await reply([{ type: 'text', text: formatProfile(db.getProfile(userId)) }]);
    return true;
  }

  if (t === '健康紀錄') {
    const rows = db.listRecentCheckins(userId, 7);
    await reply([{ type: 'text', text: formatHistory(rows) }]);
    return true;
  }

  if (t === '開始打卡' || t === '逐步打卡') {
    db.setConversation(userId, 'checkin', 'bp', {});
    await reply([{
      type: 'text',
      text: [
        '📝 逐步健康打卡（台北日期累計）',
        '',
        '① 請輸入今日血壓：收縮壓/舒張壓（例：118/76）',
        '② 再依序輸入：空腹或飯後 → 血糖數字 → 運動',
        '',
        '隨時可輸入「取消」中止。',
      ].join('\n'),
    }]);
    return true;
  }

  if (/^打卡\s*$/u.test(t) || /^健康打卡\s*$/u.test(t)) {
    await reply([{
      type: 'text',
      text: [
        '請擇一：',
        '• 輸入「開始打卡」分步填寫',
        '• 或一次打卡：',
        '打卡 120/80 空腹 95 散步',
        '打卡 130/80 飯後 165 飯後散步',
      ].join('\n'),
    }]);
    return true;
  }

  if (/^打卡\s+/u.test(t) || /^健康打卡\s+/u.test(t)) {
    const parsed = parseCheckin(t);
    if (!parsed) {
      await reply([{
        type: 'text',
        text: [
          '無法解析。範例：',
          '打卡 122/78 空腹 95 散步20分鐘',
          '打卡 130/85 飯後 180 飯後快走',
          '（略過空腹／飯後則為未註記）',
        ].join('\n'),
      }]);
      return true;
    }
    await finalizeCheckin(userId, parsed, reply);
    return true;
  }

  return false;
}

module.exports = {
  tryHandleHealth,
};
