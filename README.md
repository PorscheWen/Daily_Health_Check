# Daily_Health_Check

每日健康打卡：**LINE Messaging API**（文字指令、逐步打卡、提醒推播）+ **PWA**（打卡／紀錄／個人設定）。

- **PWA**：個檔、打卡紀錄、提醒設定皆存在使用者**手機／瀏覽器的 IndexedDB**，**不會**經由本專案的 `/api/pwa` 上傳到伺服器；使用者主動按「LINE 分享」時才會把文字帶到 LINE。
- **LINE Bot**：聊天與伺服器端打卡仍寫入本機 **SQLite**（`data/health.sqlite`），與 PWA 資料**不互通**。

衛教內容僅供參考，**非醫療診斷**。

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
| `CHANNEL_Daily_Health_Check_ACCESS_TOKEN` | **建議**使用：LINE Messaging API 的 **Channel access token**（回覆、Rich Menu、Push） |
| `CHANNEL_Daily_Health_Check_SECRET` | **建議**使用：**Channel secret**（Webhook 簽章） |
| `LINE_CHANNEL_ACCESS_TOKEN` | 選填：相容舊名，未設上面時才會讀取 |
| `LINE_CHANNEL_SECRET` | 選填：相容舊名 |
| `PUBLIC_APP_URL` | **Rich Menu** 四格連結的 **PWA 基底網址**，必須為 `https://…`（與使用者實際開啟的網域一致，結尾 `/` 可有可無） |
| `PORT` | 選填，預設 `3000` |
| `HEALTH_DB_PATH` | 選填，自訂 SQLite 路徑；預設為專案下 `data/health.sqlite` |

請勿將 `.env` 或任何 **token／secret** 提交到 Git。

## Render 部署（建置失敗時請看這裡）

`canvas`（產生 Rich Menu 圖）只在 **`npm run generate-richmenu`** 用到，**執行 `server.js` 不需要**。在 Render 上若 **Build Command** 使用預設的 `npm install`，會嘗試編譯 `node-canvas`，常因缺少 Cairo 等系統套件而 **Exited with status 1**。

**作法（擇一）：**

1. **已內附 `render.yaml`**：Blueprint 會使用 `npm ci --omit=dev`，並設定 **`NODE_VERSION=20`**（勿用 Render 預設最新版：目前 **Node 26** 會讓 `better-sqlite3` 編譯失敗）。
2. **手動建立的 Web Service**：  
   - **Environment** 新增 **`NODE_VERSION`** = **`20`**（與 [Render 文件](https://render.com/docs/node-version) 一致；未設時常落到 Node 26）。  
   - **Build Command**：`npm ci --omit=dev`  
   - **Start Command**：`npm start`  

Rich Menu 圖請在本機或 **GitHub Actions**（workflow 已安裝 libcairo 等）執行 `generate-richmenu`／`setup-richmenu`；Render 上跑的程式**不需要**安裝 `canvas`。

## 在 GitHub 設定 PWA 網址（給 Rich Menu 用）

部署到 **Render／Railway／自有主機** 後，你的 **PWA 公開網址**（`https://…`）可只存在 GitHub，用 **Actions** 對 LINE 上傳 Rich Menu，而不必在本機 `.env` 填 `PUBLIC_APP_URL`。

1. 打開 GitHub 專案 → **Settings** → **Secrets and variables** → **Actions**
2. **Variables** → **New repository variable**
   - **Name**：`PUBLIC_APP_URL`
   - **Value**：例如 `https://your-app.onrender.com`（**不要**尾端空白；有無 `/` 皆可）
3. **Secrets** → **New repository secret**
   - **Name**：`CHANNEL_DAILY_HEALTH_CHECK_ACCESS_TOKEN`
   - **Value**：LINE Developers 的 **Channel access token**（與 `.env` 相同）
4. 到 **Actions** → **Setup LINE Rich Menu** → **Run workflow**（手動執行）

工作流程會在 Ubuntu 上 `npm ci` → `generate-richmenu` → `setup-richmenu`，並用 `vars.PUBLIC_APP_URL` 產生四格連結。

**注意**：GitHub 只負責「幫你跑 **setup-richmenu**」。**實際跑網站**的環境（Render 等）仍要在該平台設定 **`CHANNEL_Daily_Health_Check_*`**、**`PUBLIC_APP_URL`**（若程式或反向代理需要），與 GitHub Variables **分開管理**；兩邊的 `PUBLIC_APP_URL` 應指向**同一個**對外 HTTPS 網址。

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

1. 在 `.env` 設定 **`PUBLIC_APP_URL`**（`https`）與 **`CHANNEL_Daily_Health_Check_ACCESS_TOKEN`**
2. 產生 `richmenu.png`（專案根目錄，已列入 `.gitignore`）：

   ```bash
   npm run generate-richmenu
   ```

   若缺少 `canvas.node`，可參考 [node-canvas 安裝說明](https://github.com/Automattic/node-canvas)（Windows 可能需編譯工具）。

3. 上傳並套用至所有使用者：

   ```bash
   npm run setup-richmenu
   ```

腳本會先**取消全體預設連結**、刪除該 Channel 既有 Rich Menu 定義、建立新版、上傳圖片後再 **POST `/v2/bot/user/all/richmenu/{id}`** 設為預設（與 [LINE 官方流程](https://developers.line.biz/en/docs/messaging-api/using-rich-menus/) 一致）。

### Rich Menu 沒出現／沒開啟？

1. **確認腳本有跑成功**：終端機應出現「已設為全體預設」且 `GET /v2/bot/user/all/richmenu` 有回傳 `richMenuId`。若曾失敗，請修正 `.env` 後再執行 `npm run setup-richmenu`。
2. **聊天室下方橫條**：Rich Menu 在聊天畫面**底部**；建立時已設 `selected: true`，多數手機會**自動展開**大圖。若只看到一行小字（`chatBarText`），請**點那行**展開選單。
3. **必須是「好友」**：封鎖或未加官方帳為好友時，行為可能不同；請用**手機版 LINE** 開啟與該 Bot 的**一對一聊天**測試（與 [Messaging API 說明](https://developers.line.biz/en/reference/messaging-api/#set-default-rich-menu) 一致）。
4. **LINE Official Account Manager 衝突**：若在 [LINE Official Account Manager](https://manager.line.biz/) 另設了 Rich Menu，可能與 API 互相覆蓋。建議**擇一管理**（僅用 API 或僅用後台），改完後再執行一次 `setup-richmenu`。
5. **每人專屬 Rich Menu**：若曾對你的 userId 做過 **per-user** 連結，會蓋過全體預設。可呼叫 `DELETE https://api.line.me/v2/bot/user/{userId}/richmenu`（需 Channel access token）解除後，再重新執行 `setup-richmenu`。
6. **電腦版 LINE**：顯示方式可能與手機不同，請以手機為準。

## PWA 分頁與深層連結

- **打卡**：今日數值與衛教建議  
- **紀錄**：依時間排序、血壓／血糖／運動分區、LINE 分享  
- **個人設定**：個人資料、提醒與通知權限  

網址 hash：`#help`、`#checkin`、`#records`、`#settings` 與 Rich Menu 一致。

## LINE 與 PWA 資料

- LINE 使用者 ID 與 PWA 的 `web:…` ID **不同**，**資料不互通**（同一伺服器、同一資料庫檔內為不同列）。

## 授權

依專案慣例；若無特別聲明請於存放庫內補充 `LICENSE`。
