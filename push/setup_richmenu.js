'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');

const ACCESS_TOKEN = (
  process.env.CHANNEL_Daily_Health_Check_ACCESS_TOKEN
  || process.env.LINE_CHANNEL_ACCESS_TOKEN
  || ''
).trim();
const PUBLIC_APP_URL = (process.env.PUBLIC_APP_URL || '').trim();

if (!ACCESS_TOKEN) {
  console.error(
    '[setup-richmenu] 缺少 Channel access token：請在 .env 設定 CHANNEL_Daily_Health_Check_ACCESS_TOKEN',
    '（或相容舊名 LINE_CHANNEL_ACCESS_TOKEN）',
  );
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
  const headers = { Authorization: `Bearer ${ACCESS_TOKEN}` };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(`https://api.line.me${endpoint}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`LINE API ${res.status}: ${text}`);
  return text ? JSON.parse(text) : {};
}

/** 取消「全體預設 Rich Menu」連結（404 視為本來就沒有） */
async function unlinkDefaultRichMenuAll() {
  const res = await fetch('https://api.line.me/v2/bot/user/all/richmenu', {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
  });
  if (res.status === 404) return;
  const text = await res.text();
  if (!res.ok) throw new Error(`取消預設 Rich Menu 失敗 ${res.status}: ${text}`);
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
  await unlinkDefaultRichMenuAll();
  console.log('[setup-richmenu] 已取消舊的「全體預設」連結（若存在）');

  const { richmenus = [] } = await lineApi('GET', '/v2/bot/richmenu/list');
  for (const rm of richmenus) {
    await lineApi('DELETE', `/v2/bot/richmenu/${rm.richMenuId}`);
    console.log(`[setup-richmenu] 刪除舊 Rich Menu 定義: ${rm.richMenuId}`);
  }

  /** chatBarText 最多 14 字元（LINE 限制） */
  const { richMenuId } = await lineApi('POST', '/v2/bot/richmenu', {
    size: { width: W, height: H },
    selected: true,
    name: 'Daily_Health_Check｜紀錄・查詢・設定・說明',
    chatBarText: '健康打卡',
    areas: [
      {
        bounds: { x: 0, y: gridTop, width: cellW, height: cellH },
        action: { type: 'uri', label: '📋 紀錄', uri: urlRecords },
      },
      {
        bounds: { x: cellW, y: gridTop, width: cellW, height: cellH },
        action: { type: 'uri', label: '✏️ 查詢', uri: urlCheckin },
      },
      {
        bounds: { x: 0, y: gridTop + cellH, width: cellW, height: cellH },
        action: { type: 'uri', label: '⚙️ 設定', uri: urlSettings },
      },
      {
        bounds: { x: cellW, y: gridTop + cellH, width: cellW, height: cellH },
        action: { type: 'uri', label: '📖 說明', uri: urlHelp },
      },
    ],
  });
  console.log(`[setup-richmenu] 建立 Rich Menu: ${richMenuId}`);

  await uploadImage(richMenuId);
  console.log('[setup-richmenu] 圖片上傳完成');

  await lineApi('POST', `/v2/bot/user/all/richmenu/${richMenuId}`);
  console.log('[setup-richmenu] 已設為全體預設 Rich Menu');

  try {
    const linked = await lineApi('GET', '/v2/bot/user/all/richmenu');
    console.log('[setup-richmenu] 驗證 GET /user/all/richmenu:', linked);
  } catch (e) {
    console.warn('[setup-richmenu] 驗證讀取失敗（可忽略）:', e.message);
  }

  console.log('[setup-richmenu] 連結:', { urlHelp, urlCheckin, urlRecords, urlSettings });
  console.log('[setup-richmenu] 若手機仍看不到：請關閉聊天室再重進、確認已加好友，並見 README「Rich Menu 疑難排解」');
}

main().catch((e) => {
  console.error('[setup-richmenu] 失敗:', e.message);
  process.exit(1);
});
