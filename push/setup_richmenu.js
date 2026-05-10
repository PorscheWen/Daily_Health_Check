'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');

const ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const PUBLIC_APP_URL = (process.env.PUBLIC_APP_URL || '').trim();

if (!ACCESS_TOKEN) {
  console.error('[setup-richmenu] 缺少 LINE_CHANNEL_ACCESS_TOKEN');
  process.exit(1);
}
if (!PUBLIC_APP_URL || !/^https:\/\//i.test(PUBLIC_APP_URL)) {
  console.error('[setup-richmenu] 請在 .env 設定 PUBLIC_APP_URL（必須為 https，例如 https://你的網域/ ）');
  process.exit(1);
}

const base = PUBLIC_APP_URL.replace(/\/?$/, '/');
const urlHelp = `${base}#help`;
const urlCheckin = `${base}#checkin`;
const urlRecords = `${base}#records`;
const urlSettings = `${base}#settings`;

/* 與 push/generate_richmenu.js 網格一致：頂 200px + 2×2 */
const W = 2500;
const H = 1686;
const HEADER_H = 200;
const COLS = 2;
const ROWS = 2;
const gridTop = HEADER_H;
const gridH = H - HEADER_H;
const cellW = Math.floor(W / COLS);
const cellH = Math.floor(gridH / ROWS);

async function lineApi(method, endpoint, body) {
  const res = await fetch(`https://api.line.me${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`LINE API ${res.status}: ${text}`);
  return text ? JSON.parse(text) : {};
}

async function uploadImage(richMenuId) {
  const imgPath = path.join(__dirname, '..', 'richmenu.png');
  if (!fs.existsSync(imgPath)) {
    throw new Error('找不到 richmenu.png，請先執行 npm run generate-richmenu');
  }
  const img = fs.readFileSync(imgPath);
  const res = await fetch(`https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'image/png',
    },
    body: img,
  });
  if (!res.ok) throw new Error(`圖片上傳失敗 ${res.status}: ${await res.text()}`);
}

async function main() {
  const { richmenus = [] } = await lineApi('GET', '/v2/bot/richmenu/list');
  for (const rm of richmenus) {
    await lineApi('DELETE', `/v2/bot/richmenu/${rm.richMenuId}`);
    console.log(`[setup-richmenu] 刪除舊 Rich Menu: ${rm.richMenuId}`);
  }

  const { richMenuId } = await lineApi('POST', '/v2/bot/richmenu', {
    size: { width: W, height: H },
    selected: true,
    name: 'Daily_Health_Check｜教學與分頁',
    chatBarText: '🏥 健康打卡選單',
    areas: [
      {
        bounds: { x: 0, y: gridTop, width: cellW, height: cellH },
        action: { type: 'uri', label: '使用教學', uri: urlHelp },
      },
      {
        bounds: { x: cellW, y: gridTop, width: cellW, height: cellH },
        action: { type: 'uri', label: '打卡', uri: urlCheckin },
      },
      {
        bounds: { x: 0, y: gridTop + cellH, width: cellW, height: cellH },
        action: { type: 'uri', label: '紀錄', uri: urlRecords },
      },
      {
        bounds: { x: cellW, y: gridTop + cellH, width: cellW, height: cellH },
        action: { type: 'uri', label: '個人設定', uri: urlSettings },
      },
    ],
  });
  console.log(`[setup-richmenu] 建立 Rich Menu: ${richMenuId}`);

  await uploadImage(richMenuId);
  console.log('[setup-richmenu] 圖片上傳完成');

  await lineApi('POST', `/v2/bot/user/all/richmenu/${richMenuId}`);
  console.log('[setup-richmenu] 已套用至所有用戶');
  console.log('[setup-richmenu] 連結:', { urlHelp, urlCheckin, urlRecords, urlSettings });
}

main().catch((e) => {
  console.error('[setup-richmenu] 失敗:', e.message);
  process.exit(1);
});
