'use strict';

/** 衛教參考用，非醫療診斷；與伺服器 src/advice.js 對齊。 */

function classifyBp(sys, dia) {
  if (sys >= 180 || dia >= 120) {
    return { level: 'crisis', label: '血壓明顯偏高（危急區間）' };
  }
  if (sys >= 140 || dia >= 90) {
    return { level: 'high2', label: '血壓偏高（第二期）' };
  }
  if ((sys >= 130 && sys <= 139) || (dia >= 80 && dia <= 89)) {
    return { level: 'high1', label: '血壓偏高（第一期）' };
  }
  if (sys >= 120 && sys <= 129 && dia < 80) {
    return { level: 'elevated', label: '血壓略高（正常高值）' };
  }
  if (sys < 120 && dia < 80) {
    return { level: 'normal', label: '血壓數值大致在正常範圍' };
  }
  return { level: 'unknown', label: '血壓分類需由醫師依完整病史判讀' };
}

/** @param {'fasting'|'postmeal'|'unknown'} timing */
function classifyGlucose(mgdl, timing) {
  if (timing === 'postmeal') {
    if (mgdl < 140) {
      return { level: 'normal', label: '若以「飯後血糖」理解，數值大致落在常見目標區間內（仍請依醫師個別目標為準）。' };
    }
    if (mgdl < 200) {
      return { level: 'borderline', label: '飯後血糖偏高，建議與醫師討論飲食與追蹤方式。' };
    }
    return { level: 'high', label: '飯後血糖明顯偏高，建議儘快諮詢醫師。' };
  }
  if (timing === 'fasting') {
    if (mgdl < 100) return { level: 'normal', label: '空腹／餐前血糖大致落在理想區間。' };
    if (mgdl <= 125) return { level: 'borderline', label: '空腹／餐前血糖略高，需留意並建議門診追蹤。' };
    return { level: 'high', label: '空腹／餐前血糖偏高，建議與醫師討論。' };
  }
  if (mgdl < 100) {
    return { level: 'normal', label: '數值大致偏低風險區（若為空腹參考較佳）；若未註明時機，請以醫師判讀為準。' };
  }
  if (mgdl <= 125) {
    return { level: 'borderline', label: '血糖略高；建議下次標註「空腹」或「飯後」以便解讀。' };
  }
  return { level: 'high', label: '血糖偏高；建議標註測量時機並諮詢醫師。' };
}

export function timingLabel(timing) {
  if (timing === 'fasting') return '空腹／餐前';
  if (timing === 'postmeal') return '飯後';
  return '未註記';
}

function exerciseHints(text, age) {
  const t = (text || '').trim();
  const lines = [];
  if (!t || /^無$|^沒有$|^無運動$/u.test(t)) {
    lines.push('今日運動較少：建議每天安排溫和活動（如快走 15–30 分鐘），量力而為。');
    return lines;
  }
  if (/沒運動|沒動|坐整天|久坐|0分|零分/i.test(t)) {
    lines.push('若今天較少活動：可從短時間散步或伸展開始，避免久坐逾時。');
  }
  if (/跑步|慢跑|游泳|爬山|重訓|健身房/i.test(t)) {
    lines.push('有中強度活動時，注意暖身與水分；若有心血管病史或久未運動，建議先諮詢醫師。');
  }
  if (typeof age === 'number' && age >= 65) {
    lines.push('長者運動以「穩定、可持續」為優先，留意平衡與跌倒預防。');
  }
  if (lines.length === 0) {
    lines.push('維持規律運動習慣有助血壓與血糖穩定；循序漸進最為安全。');
  }
  return lines;
}

export function buildAdvice({
  profile, systolic, diastolic, bloodSugar, exerciseText, glucoseTiming,
}) {
  const age = profile?.age;
  const bp = classifyBp(systolic, diastolic);
  const gl = classifyGlucose(bloodSugar, glucoseTiming || 'unknown');
  const ex = exerciseHints(exerciseText, age);
  const tlab = timingLabel(glucoseTiming || 'unknown');

  const parts = [
    '📋 今日衛教建議（僅供參考，非醫療診斷）',
    '',
    `• 血壓 ${systolic}/${diastolic} mmHg：${bp.label}。`,
    `• 血糖時機：${tlab}`,
    `• 血糖 ${bloodSugar} mg/dL：${gl.label}`,
    '',
    '▸ 血壓／血糖解讀會受測量時間、飲食、情緒與藥物影響；請以醫師判讀為準。',
  ];

  if (bp.level === 'crisis') {
    parts.push('▸ 若伴隨胸悶、呼吸困難、意識異常或嚴重頭痛，請儘速就醫或撥打 119。');
  } else if (bp.level === 'high2' || gl.level === 'high') {
    parts.push('▸ 建議安排門診追蹤，並依醫囑量測與用藥。');
  }

  parts.push('', '🚶 運動習慣');
  for (const line of ex) parts.push(`• ${line}`);

  return parts.join('\n');
}
