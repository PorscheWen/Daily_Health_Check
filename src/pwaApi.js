'use strict';

const express = require('express');
const crypto = require('crypto');
const db = require('./db');
const hc = require('./healthCore');
const { buildAdvice, timingLabel } = require('./advice');

const router = express.Router();

const WEB_USER_RE = /^web:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 紀錄時間顯示（台北） */
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

function webUserMiddleware(req, res, next) {
  const id = String(req.header('X-Web-User-Id') || '').trim();
  if (!WEB_USER_RE.test(id)) {
    return res.status(401).json({ ok: false, error: 'missing_or_invalid_web_user' });
  }
  req.webUserId = id;
  next();
}

router.get('/new-id', (_req, res) => {
  res.json({ ok: true, userId: `web:${crypto.randomUUID()}` });
});

router.use(webUserMiddleware);

router.get('/me', (req, res) => {
  const profile = db.getProfile(req.webUserId);
  res.json({
    ok: true,
    today: db.taipeiYmd(),
    profile: profile
      ? {
        age: profile.age,
        gender: profile.gender,
        reminderEnabled: !!profile.reminder_enabled,
        reminderHhmm: profile.reminder_hhmm || null,
      }
      : null,
  });
});

router.put('/profile', (req, res) => {
  const age = parseInt(req.body?.age, 10);
  const gender = hc.normalizeGender(req.body?.gender);
  if (!Number.isFinite(age) || age < 1 || age > 120 || !gender) {
    return res.status(400).json({ ok: false, error: 'invalid_profile' });
  }
  db.upsertProfile(req.webUserId, age, gender);
  res.json({ ok: true });
});

router.post('/checkin', (req, res) => {
  const parsed = hc.validateCheckinBody(req.body);
  if (!parsed) {
    return res.status(400).json({ ok: false, error: 'invalid_checkin' });
  }
  const profile = db.getProfile(req.webUserId);
  db.upsertCheckin(req.webUserId, {
    systolic: parsed.systolic,
    diastolic: parsed.diastolic,
    bloodSugar: parsed.bloodSugar,
    exerciseText: parsed.exerciseText,
    glucoseTiming: parsed.glucoseTiming || 'unknown',
  });
  const advice = buildAdvice({
    profile,
    systolic: parsed.systolic,
    diastolic: parsed.diastolic,
    bloodSugar: parsed.bloodSugar,
    exerciseText: parsed.exerciseText,
    glucoseTiming: parsed.glucoseTiming || 'unknown',
  });
  res.json({
    ok: true,
    date: db.taipeiYmd(),
    timingLabel: timingLabel(parsed.glucoseTiming || 'unknown'),
    advice,
  });
});

router.get('/history', (req, res) => {
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const rows = db.listRecentCheckins(req.webUserId, limit);
  res.json({
    ok: true,
    rows: rows.map((r) => ({
      checkin_date: r.checkin_date,
      systolic: r.systolic,
      diastolic: r.diastolic,
      blood_sugar: r.blood_sugar,
      exercise_text: r.exercise_text,
      glucose_timing: r.glucose_timing,
      created_at: r.created_at,
      recorded_at_taipei: formatTaipeiDateTime(r.created_at),
    })),
  });
});

router.put('/reminder', (req, res) => {
  if (!db.getProfile(req.webUserId)) {
    return res.status(400).json({ ok: false, error: 'need_profile' });
  }
  const enabled = !!req.body?.enabled;
  if (enabled) {
    const hhmm = hc.parseHHmm(req.body?.hhmm ?? req.body?.time);
    if (!hhmm) {
      return res.status(400).json({ ok: false, error: 'bad_time' });
    }
    db.setReminder(req.webUserId, true, hhmm);
  } else {
    db.setReminder(req.webUserId, false, null);
  }
  res.json({ ok: true });
});

module.exports = router;
