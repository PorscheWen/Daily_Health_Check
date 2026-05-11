'use strict';

const { createCanvas, registerFont } = require('canvas');
const fs = require('fs');
const path = require('path');
const os = require('os');

// 根據作業系統載入適當的中文字型
const platform = os.platform();
let fontLoaded = false;

try {
  if (platform === 'win32') {
    // Windows: 微軟正黑體
    registerFont('C:/Windows/Fonts/msjhbd.ttc', { family: 'JhengHei', weight: 'bold' });
    registerFont('C:/Windows/Fonts/msjh.ttc', { family: 'JhengHei' });
    fontLoaded = true;
    console.log('[generate-richmenu] 已載入微軟正黑體');
  } else if (platform === 'linux') {
    // Linux: Noto Sans CJK TC
    registerFont('/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc', { family: 'JhengHei', weight: 'bold' });
    registerFont('/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc', { family: 'JhengHei' });
    try {
      registerFont('/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf', { family: 'NotoEmoji' });
    } catch (_) {}
    fontLoaded = true;
    console.log('[generate-richmenu] 已載入 Noto Sans CJK TC + Color Emoji');
  } else if (platform === 'darwin') {
    // macOS: 可能需要調整路徑
    registerFont('/System/Library/Fonts/PingFang.ttc', { family: 'JhengHei' });
    fontLoaded = true;
    console.log('[generate-richmenu] 已載入蘋方體');
  }
} catch (err) {
  console.warn('[generate-richmenu] 字型載入失敗，將使用預設字型（可能出現方框）:', err.message);
}

if (!fontLoaded) {
  console.warn('[generate-richmenu] 未載入中文字型，版面可能出現亂碼');
}

const W = 2500;
const H = 1686;
const HEADER_H = 200;
const COLS = 2;
const ROWS = 2;
const gridTop = HEADER_H;
const gridH = H - HEADER_H;
const cellW = Math.floor(W / COLS);
const cellH = Math.floor(gridH / ROWS);

const cells = [
  { label: '打卡',     sub: '記錄血壓・血糖・運動', hint: '點擊立即打卡', emoji: '✏',  color: '#00B900' },
  { label: '查詢',     sub: '健康紀錄一目了然',     hint: '依紀錄時間排序', emoji: '🔍', color: '#0097FF' },
  { label: '個人設定', sub: '個人資料與提醒時間',   hint: '年齡・性別・通知', emoji: '⚙',  color: '#FF9B00' },
  { label: '使用說明', sub: '操作教學與功能介紹',   hint: '點擊查看說明',   emoji: '📖', color: '#A65FDB' },
];

const canvas = createCanvas(W, H);
const ctx = canvas.getContext('2d');

ctx.fillStyle = '#06C755';
ctx.fillRect(0, 0, W, HEADER_H);
const hg = ctx.createLinearGradient(0, 0, 0, HEADER_H);
hg.addColorStop(0, 'rgba(255,255,255,0.18)');
hg.addColorStop(1, 'rgba(0,0,0,0.15)');
ctx.fillStyle = hg;
ctx.fillRect(0, 0, W, HEADER_H);

ctx.textAlign = 'center';
ctx.textBaseline = 'middle';
ctx.fillStyle = '#FFFFFF';
ctx.font = 'bold 96px "JhengHei", sans-serif';
ctx.shadowColor = 'rgba(0,0,0,0.30)';
ctx.shadowBlur = 14;
ctx.fillText('每日健康打卡', W / 2, HEADER_H * 0.42);
ctx.shadowBlur = 0;
ctx.font = '48px "JhengHei", sans-serif';
ctx.fillStyle = 'rgba(255,255,255,0.92)';
ctx.fillText('追蹤血壓・血糖・運動，守護每日健康', W / 2, HEADER_H * 0.78);

for (let row = 0; row < ROWS; row++) {
  for (let col = 0; col < COLS; col++) {
    const g = cells[row * COLS + col];
    const x = col * cellW;
    const y = gridTop + row * cellH;

    ctx.fillStyle = g.color;
    ctx.fillRect(x, y, cellW, cellH);

    const grad = ctx.createLinearGradient(x, y, x, y + cellH);
    grad.addColorStop(0, 'rgba(255,255,255,0.12)');
    grad.addColorStop(1, 'rgba(0,0,0,0.14)');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, cellW, cellH);

    const cx = x + cellW / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // emoji / icon（優先 NotoEmoji，回退 JhengHei）
    ctx.font = '180px "NotoEmoji", "JhengHei", sans-serif';
    ctx.fillStyle = 'white';
    ctx.shadowColor = 'rgba(0,0,0,0.40)';
    ctx.shadowBlur = 14;
    ctx.fillText(g.emoji, cx, y + cellH * 0.28);
    ctx.shadowBlur = 0;

    ctx.font = 'bold 100px "JhengHei", sans-serif';
    ctx.fillStyle = 'white';
    ctx.shadowBlur = 8;
    ctx.fillText(g.label, cx, y + cellH * 0.52);
    ctx.shadowBlur = 0;

    ctx.font = '112px "JhengHei", sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.fillText(g.sub, cx, y + cellH * 0.68);

    ctx.font = '48px "JhengHei", sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.72)';
    ctx.fillText(g.hint, cx, y + cellH * 0.88);
  }
}

ctx.strokeStyle = 'rgba(0,0,0,0.18)';
ctx.lineWidth = 6;
ctx.beginPath();
ctx.moveTo(cellW, gridTop);
ctx.lineTo(cellW, H);
ctx.stroke();
ctx.beginPath();
ctx.moveTo(0, gridTop + cellH);
ctx.lineTo(W, gridTop + cellH);
ctx.stroke();

const outPath = path.join(__dirname, '..', 'richmenu.png');
fs.writeFileSync(outPath, canvas.toBuffer('image/png'));
console.log(`[generate-richmenu] 已寫入 ${outPath}（${W}×${H}）`);
