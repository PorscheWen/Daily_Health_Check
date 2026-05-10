'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const dataDir = path.join(__dirname, '..', 'data');
const dbPath = process.env.HEALTH_DB_PATH || path.join(dataDir, 'health.sqlite');

let db;

function migrate(getDbInstance) {
  const d = getDbInstance;
  const cols = d.prepare('PRAGMA table_info(user_profile)').all().map((c) => c.name);
  if (!cols.includes('reminder_hhmm')) {
    d.exec('ALTER TABLE user_profile ADD COLUMN reminder_hhmm TEXT');
  }
  if (!cols.includes('reminder_enabled')) {
    d.exec('ALTER TABLE user_profile ADD COLUMN reminder_enabled INTEGER NOT NULL DEFAULT 0');
  }
  if (!cols.includes('last_reminder_date')) {
    d.exec('ALTER TABLE user_profile ADD COLUMN last_reminder_date TEXT');
  }

  const checkCols = d.prepare('PRAGMA table_info(daily_checkin)').all().map((c) => c.name);
  if (!checkCols.includes('glucose_timing')) {
    d.exec("ALTER TABLE daily_checkin ADD COLUMN glucose_timing TEXT NOT NULL DEFAULT 'unknown'");
  }

  d.exec(`
    CREATE TABLE IF NOT EXISTS conversation_state (
      user_id TEXT PRIMARY KEY,
      flow TEXT NOT NULL,
      step TEXT NOT NULL,
      payload TEXT NOT NULL DEFAULT '{}',
      updated_at INTEGER NOT NULL
    );
  `);
}

function getDb() {
  if (!db) {
    fs.mkdirSync(dataDir, { recursive: true });
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.exec(`
      CREATE TABLE IF NOT EXISTS user_profile (
        user_id TEXT PRIMARY KEY,
        age INTEGER NOT NULL,
        gender TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS daily_checkin (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        checkin_date TEXT NOT NULL,
        systolic INTEGER NOT NULL,
        diastolic INTEGER NOT NULL,
        blood_sugar REAL NOT NULL,
        exercise_text TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL,
        UNIQUE(user_id, checkin_date)
      );
      CREATE INDEX IF NOT EXISTS idx_checkin_user_date ON daily_checkin(user_id, checkin_date DESC);
    `);
    migrate(db);
  }
  return db;
}

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

/** 台北時區目前 HH:mm（24 小時制） */
function taipeiHHmm() {
  const s = new Date().toLocaleString('en-GB', {
    timeZone: 'Asia/Taipei',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return '00:00';
  const hh = String(parseInt(m[1], 10)).padStart(2, '0');
  return `${hh}:${m[2]}`;
}

function getProfile(userId) {
  return getDb().prepare(`
    SELECT user_id, age, gender, updated_at,
           reminder_hhmm, reminder_enabled, last_reminder_date
    FROM user_profile WHERE user_id = ?
  `).get(userId) || null;
}

function upsertProfile(userId, age, gender) {
  const now = Date.now();
  getDb().prepare(`
    INSERT INTO user_profile (user_id, age, gender, updated_at)
    VALUES (@user_id, @age, @gender, @updated_at)
    ON CONFLICT(user_id) DO UPDATE SET
      age = excluded.age,
      gender = excluded.gender,
      updated_at = excluded.updated_at
  `).run({ user_id: userId, age, gender, updated_at: now });
}

function setReminder(userId, enabled, hhmmOrNull) {
  const now = Date.now();
  getDb().prepare(`
    UPDATE user_profile SET
      reminder_enabled = @enabled,
      reminder_hhmm = CASE WHEN @hhmm IS NOT NULL THEN @hhmm ELSE reminder_hhmm END,
      updated_at = @updated_at
    WHERE user_id = @user_id
  `).run({
    user_id: userId,
    enabled: enabled ? 1 : 0,
    hhmm: hhmmOrNull,
    updated_at: now,
  });
}

/** 若個檔不存在則無法更新提醒（需先健康設定） */
function markReminderSent(userId, ymd) {
  getDb().prepare(`
    UPDATE user_profile SET last_reminder_date = @ymd, updated_at = @t WHERE user_id = @user_id
  `).run({ user_id: userId, ymd, t: Date.now() });
}

function listUsersDueReminder(hhmm, todayYmd) {
  return getDb().prepare(`
    SELECT user_id FROM user_profile
    WHERE reminder_enabled = 1
      AND reminder_hhmm = @hhmm
      AND IFNULL(last_reminder_date, '') != @todayYmd
  `).all({ hhmm, todayYmd });
}

function upsertCheckin(userId, row) {
  const checkinDate = row.checkinDate || taipeiYmd();
  const now = Date.now();
  const timing = row.glucoseTiming || 'unknown';
  getDb().prepare(`
    INSERT INTO daily_checkin (
      user_id, checkin_date, systolic, diastolic, blood_sugar, exercise_text, glucose_timing, created_at
    ) VALUES (@user_id, @checkin_date, @systolic, @diastolic, @blood_sugar, @exercise_text, @glucose_timing, @created_at)
    ON CONFLICT(user_id, checkin_date) DO UPDATE SET
      systolic = excluded.systolic,
      diastolic = excluded.diastolic,
      blood_sugar = excluded.blood_sugar,
      exercise_text = excluded.exercise_text,
      glucose_timing = excluded.glucose_timing,
      created_at = excluded.created_at
  `).run({
    user_id: userId,
    checkin_date: checkinDate,
    systolic: row.systolic,
    diastolic: row.diastolic,
    blood_sugar: row.bloodSugar,
    exercise_text: row.exerciseText || '',
    glucose_timing: timing,
    created_at: now,
  });
}

function listRecentCheckins(userId, limit) {
  return getDb().prepare(`
    SELECT checkin_date, systolic, diastolic, blood_sugar, exercise_text, glucose_timing, created_at
    FROM daily_checkin
    WHERE user_id = ?
    ORDER BY created_at DESC, checkin_date DESC
    LIMIT ?
  `).all(userId, limit);
}

function getConversation(userId) {
  const row = getDb().prepare('SELECT user_id, flow, step, payload, updated_at FROM conversation_state WHERE user_id = ?').get(userId);
  if (!row) return null;
  let payload = {};
  try { payload = JSON.parse(row.payload || '{}'); } catch (_) {}
  return { ...row, payload };
}

function setConversation(userId, flow, step, payloadObj) {
  getDb().prepare(`
    INSERT INTO conversation_state (user_id, flow, step, payload, updated_at)
    VALUES (@user_id, @flow, @step, @payload, @updated_at)
    ON CONFLICT(user_id) DO UPDATE SET
      flow = excluded.flow,
      step = excluded.step,
      payload = excluded.payload,
      updated_at = excluded.updated_at
  `).run({
    user_id: userId,
    flow,
    step,
    payload: JSON.stringify(payloadObj || {}),
    updated_at: Date.now(),
  });
}

function clearConversation(userId) {
  getDb().prepare('DELETE FROM conversation_state WHERE user_id = ?').run(userId);
}

module.exports = {
  getDb,
  taipeiYmd,
  taipeiHHmm,
  getProfile,
  upsertProfile,
  setReminder,
  markReminderSent,
  listUsersDueReminder,
  upsertCheckin,
  listRecentCheckins,
  getConversation,
  setConversation,
  clearConversation,
};
