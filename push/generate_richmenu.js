'use strict';

const { createCanvas, registerFont } = require('canvas');
const fs = require('fs');
const path = require('path');

try {
  registerFont('C:/Windows/Fonts/msjhbd.ttc', { family: 'JhengHei', weight: 'bold' });
  registerFont('C:/Windows/Fonts/msjh.ttc', { family: 'JhengHei' });
} catch (_) {
  console.warn('[generate-richmenu] 未載入微軟正黑，將使用預設字型（版面可能略有差異）');
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
  { label: '使用教學', sub: 'PWA 操作說明', hint: '點擊開啟', icon: '📖', color: '#1565c0' },
  { label: '打卡', sub: '今日健康打卡', hint: '血壓・血糖・運動', icon: '✏️', color: '#2d7856' },
  { label: '紀錄', sub: '依時間排序', hint: 'LINE 分享', icon: '📋', color: '#c62828' },
  { label: '個人設定', sub: '資料與提醒', hint: '年齡性別・通知', icon: '⚙️', color: '#6a1b9a' },
];

const canvas = createCanvas(W, H);
const ctx = canvas.getContext('2d');

ctx.fillStyle = '#1e5c42';
ctx.fillRect(0, 0, W, HEADER_H);
const hg = ctx.createLinearGradient(0, 0, 0, HEADER_H);
hg.addColorStop(0, 'rgba(255,255,255,0.12)');
hg.addColorStop(1, 'rgba(0,0,0,0.12)');
ctx.fillStyle = hg;
ctx.fillRect(0, 0, W, HEADER_H);

ctx.textAlign = 'center';
ctx.textBaseline = 'middle';
ctx.fillStyle = '#FFFFFF';
ctx.font = 'bold 96px "JhengHei", sans-serif';
ctx.shadowColor = 'rgba(0,0,0,0.25)';
ctx.shadowBlur = 12;
ctx.fillText('每日健康打卡', W / 2, HEADER_H * 0.42);
ctx.shadowBlur = 0;
ctx.font = '48px "JhengHei", sans-serif';
ctx.fillStyle = 'rgba(255,255,255,0.9)';
ctx.fillText('Rich Menu · 教學與 PWA 分頁', W / 2, HEADER_H * 0.78);

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

    ctx.font = '160px sans-serif';
    ctx.fillStyle = 'white';
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 10;
    ctx.fillText(g.icon, cx, y + cellH * 0.28);
    ctx.shadowBlur = 0;

    ctx.font = 'bold 100px "JhengHei", sans-serif';
    ctx.fillStyle = 'white';
    ctx.shadowBlur = 8;
    ctx.fillText(g.label, cx, y + cellH * 0.52);
    ctx.shadowBlur = 0;

    ctx.font = '56px "JhengHei", sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fillText(g.sub, cx, y + cellH * 0.66);

    ctx.font = '48px "JhengHei", sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText(g.hint, cx, y + cellH * 0.86);
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
