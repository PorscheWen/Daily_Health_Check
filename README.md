# Daily_Health_Check

每日健康打卡：**LINE Messaging API**（文字指令、逐步打卡、提醒推播）+ **PWA**（打卡／紀錄／個人設定），資料儲存在本機 **SQLite**（`data/health.sqlite`）。衛教內容僅供參考，**非醫療診斷**。

- 原始碼：<https://github.com/PorscheWen/Daily_Health_Check>

## 需求環境

- **Node.js 18+**
- 公開 **HTTPS** 網址（LINE Webhook、Rich Menu 連結、PWA 安裝皆建議 HTTPS）

## 安裝與啟動

```bash
npm install
cp .env.example .env
# 編輯 .env 填入 LINE token、secret、PUBLIC_APP_URL 等
npm start
```

預設監聽 `PORT`（未設定則 **3000**）。PWA 首頁：`http://localhost:PORT/`（本機僅能自測 UI；手機安裝需 HTTPS）。

## 環境變數（`.env`）

| 變數 | 說明 |
|------|------|
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE Messaging API 的 **Channel access token**（回覆訊息、Rich Menu、Push 必填） |
| `LINE_CHANNEL_SECRET` | **Channel secret**，用於驗證 Webhook 簽章（`X-Line-Signature`） |
| `PUBLIC_APP_URL` | **Rich Menu** 四格連結的 **PWA 基底網址**，必須為 `https://…`（與使用者實際開啟的網域一致，結尾 `/` 可有可無） |
| `PORT` | 選填，預設 `3000` |
| `HEALTH_DB_PATH` | 選填，自訂 SQLite 路徑；預設為專案下 `data/health.sqlite` |

請勿將 `.env` 或任何 **token／secret** 提交到 Git。

## Webhook（LINE 聊天）

1. LINE Developers → Messaging API → **Webhook URL**：`https://你的網域/webhook`
2. 啟用 **Use webhook**，並執行 **Verify**
3. 本機開發請用 **ngrok／Cloudflare Tunnel** 等提供 HTTPS

若**只使用 PWA**、不用 LINE 對話，可不設定 Webhook，但仍需 token／secret 若你要使用 Rich Menu 或 Push。

## Rich Menu（底部選單：教學 + 三個分頁連結）

選單圖為 **2500×1686**，四格對應 PWA 錨點（與站內三個分頁 + 教學）：

| 區塊 | 連結 |
|------|------|
| 使用教學 | `{PUBLIC_APP_URL}#help` |
| 打卡 | `{PUBLIC_APP_URL}#checkin` |
| 紀錄 | `{PUBLIC_APP_URL}#records` |
| 個人設定 | `{PUBLIC_APP_URL}#settings` |

### 產生圖檔並上傳到 LINE

1. 在 `.env` 設定 **`PUBLIC_APP_URL`**（`https`）與 **`LINE_CHANNEL_ACCESS_TOKEN`**
2. 產生 `richmenu.png`（專案根目錄，已列入 `.gitignore`）：

   ```bash
   npm run generate-richmenu
   ```

   若缺少 `canvas.node`，可參考 [node-canvas 安裝說明](https://github.com/Automattic/node-canvas)（Windows 可能需編譯工具）。

3. 上傳並套用至所有使用者：

   ```bash
   npm run setup-richmenu
   ```

腳本會刪除該 Channel 既有 Rich Menu 後再建立新版，並設定為 **預設選單**。

## PWA 分頁與深層連結

- **打卡**：今日數值與衛教建議  
- **紀錄**：依時間排序、血壓／血糖／運動分區、LINE 分享  
- **個人設定**：個人資料、提醒與通知權限  

網址 hash：`#help`、`#checkin`、`#records`、`#settings` 與 Rich Menu 一致。

## LINE 與 PWA 資料

- LINE 使用者 ID 與 PWA 的 `web:…` ID **不同**，**資料不互通**（同一伺服器、同一資料庫檔內為不同列）。

## 授權

依專案慣例；若無特別聲明請於存放庫內補充 `LICENSE`。
