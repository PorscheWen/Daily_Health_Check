'use strict';

export function normalizeGender(raw) {
  const s = String(raw || '').trim();
  if (/^男|^M|^m/i.test(s)) return '男';
  if (/^女|^F|^f/i.test(s)) return '女';
  if (/^其他|^其她|^O|^o/i.test(s)) return '其他';
  return '';
}

function validateBp(systolic, diastolic) {
  if (systolic < 60 || systolic > 260 || diastolic < 30 || diastolic > 200) return null;
  return { systolic, diastolic };
}

function normalizeTimingKeyword(word) {
  if (!word) return 'unknown';
  const w = String(word).trim();
  if (w === '餐前' || w === '空腹' || w === 'fasting') return 'fasting';
  if (w === '飯後' || w === 'postmeal') return 'postmeal';
  return 'unknown';
}

/**
 * @returns {null | { systolic, diastolic, bloodSugar, exerciseText, glucoseTiming }}
 */
export function validateCheckinBody(body) {
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
