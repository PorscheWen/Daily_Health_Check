'use strict';

function normalizeGender(raw) {
  const s = String(raw || '').trim();
  if (/^男|^M|^m/i.test(s)) return '男';
  if (/^女|^F|^f/i.test(s)) return '女';
  if (/^其他|^其她|^O|^o/i.test(s)) return '其他';
  return '';
}

function parseSetup(text) {
  const rest = text.replace(/^\s*健康設定\s*/u, '').trim();
  const m = /^(\d{1,3})\s+(\S+)/u.exec(rest);
  if (!m) return null;
  const age = parseInt(m[1], 10);
  const gender = normalizeGender(m[2]);
  if (!Number.isFinite(age) || age < 1 || age > 120) return null;
  if (!gender) return null;
  return { age, gender };
}

function validateBp(systolic, diastolic) {
  if (systolic < 60 || systolic > 260 || diastolic < 30 || diastolic > 200) return null;
  return { systolic, diastolic };
}

function parseBpLine(t) {
  const s = String(t || '').trim();
  let m = /^(\d{2,3})\s*\/\s*(\d{2,3})$/.exec(s);
  if (m) return validateBp(parseInt(m[1], 10), parseInt(m[2], 10));
  m = /^(\d{2,3})\s+(\d{2,3})$/.exec(s);
  if (m) return validateBp(parseInt(m[1], 10), parseInt(m[2], 10));
  return null;
}

function parseTimingReply(t) {
  const x = String(t || '').trim();
  if (/^(空腹|餐前)$/u.test(x)) return 'fasting';
  if (/^飯後$/u.test(x)) return 'postmeal';
  return null;
}

function parseGlucoseNumber(t) {
  const m = /^(\d{2,3}(?:\.\d+)?)$/.exec(String(t || '').trim());
  if (!m) return null;
  const v = parseFloat(m[1]);
  if (!Number.isFinite(v) || v < 20 || v > 600) return null;
  return v;
}

/** @returns {'fasting'|'postmeal'|'unknown'} */
function normalizeTimingKeyword(word) {
  if (!word) return 'unknown';
  const w = String(word).trim();
  if (w === '餐前' || w === '空腹' || w === 'fasting') return 'fasting';
  if (w === '飯後' || w === 'postmeal') return 'postmeal';
  return 'unknown';
}

function parseCheckin(text) {
  const rest = text
    .replace(/^\s*健康打卡\s*/u, '')
    .replace(/^\s*打卡\s*/u, '')
    .trim();

  const withTiming = /^(\d{2,3})\s*\/\s*(\d{2,3})\s+(空腹|飯後|餐前)\s+(\d{2,3}(?:\.\d+)?)\s+([\s\S]+)$/u.exec(rest);
  if (withTiming) {
    const sys = parseInt(withTiming[1], 10);
    const dia = parseInt(withTiming[2], 10);
    const gl = parseFloat(withTiming[4]);
    const exerciseText = String(withTiming[5] || '').trim();
    const bp = validateBp(sys, dia);
    if (!bp || !Number.isFinite(gl) || !exerciseText) return null;
    return {
      systolic: bp.systolic,
      diastolic: bp.diastolic,
      bloodSugar: gl,
      exerciseText,
      glucoseTiming: normalizeTimingKeyword(withTiming[3]),
    };
  }

  const plain = /^(\d{2,3})\s*\/\s*(\d{2,3})\s+(\d{2,3}(?:\.\d+)?)\s+([\s\S]+)$/u.exec(rest);
  if (plain) {
    const sys = parseInt(plain[1], 10);
    const dia = parseInt(plain[2], 10);
    const gl = parseFloat(plain[3]);
    const exerciseText = String(plain[4] || '').trim();
    const bp = validateBp(sys, dia);
    if (!bp || !Number.isFinite(gl) || !exerciseText) return null;
    return {
      systolic: bp.systolic,
      diastolic: bp.diastolic,
      bloodSugar: gl,
      exerciseText,
      glucoseTiming: 'unknown',
    };
  }

  return null;
}

function parseHHmm(raw) {
  const s = String(raw || '').trim();
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/**
 * PWA / JSON API 用
 * @returns {null | { systolic, diastolic, bloodSugar, exerciseText, glucoseTiming }}
 */
function validateCheckinBody(body) {
  if (!body || typeof body !== 'object') return null;
  const sys = typeof body.systolic === 'number' ? body.systolic : parseInt(body.systolic, 10);
  const dia = typeof body.diastolic === 'number' ? body.diastolic : parseInt(body.diastolic, 10);
  const glRaw = body.bloodSugar ?? body.blood_sugar;
  const gl = typeof glRaw === 'number' ? glRaw : parseFloat(glRaw);
  const exerciseText = String(body.exerciseText ?? body.exercise_text ?? '').trim();
  let glucoseTiming = body.glucoseTiming ?? body.glucose_timing ?? 'unknown';
  if (glucoseTiming !== 'fasting' && glucoseTiming !== 'postmeal' && glucoseTiming !== 'unknown') {
    glucoseTiming = normalizeTimingKeyword(glucoseTiming);
  }
  const bp = validateBp(sys, dia);
  if (!bp || !Number.isFinite(gl) || gl < 20 || gl > 600 || !exerciseText) return null;
  return {
    systolic: bp.systolic,
    diastolic: bp.diastolic,
    bloodSugar: gl,
    exerciseText,
    glucoseTiming,
  };
}

module.exports = {
  normalizeGender,
  parseSetup,
  validateBp,
  parseBpLine,
  parseTimingReply,
  parseGlucoseNumber,
  normalizeTimingKeyword,
  parseCheckin,
  parseHHmm,
  validateCheckinBody,
};
