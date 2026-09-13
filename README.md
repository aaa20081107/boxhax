# BoxHax by Nova

> 通用型團隊信箱驗證碼安全共享軟體大禮包（Self-Hosted Shared Inbox Package）

BoxHax 是一套完全獨立部署、核心閉源的團隊信箱驗證碼共享系統。  
在不共享原始信箱密碼的前提下，實現安全、分組、自動化檢視日常工作與娛樂軟體發送的 4–6 位數臨時驗證碼。

---

## 核心特色

- **純軍火商模式**：作者不架設中央伺服器、不經手任何使用者數據
- **雙軌制版本**：社群免費版 / 商業續租版
- **多租戶架構**：多團隊、多成員、多網域、多 LINE 群組
- **本地密碼學時間鎖**：序號綁定網域與到期日，無法偽造
- **LINE 分流推播**：不同團隊推送至不同 LINE 群組
- **完全自架**：部署在你自己的 Cloudflare 帳號

---

## 系統需求

| 項目 | 需求 |
|---|---|
| Cloudflare 帳號 | 免費即可 |
| GitHub 帳號 | 免費即可 |
| 自訂網域 | 建議，可綁定至 Cloudflare |
| LINE 官方帳號 | 需開通 Messaging API |

---

## 安裝流程

### 步驟 1：Fork 此儲存庫

點擊右上角 **Fork**，將此專案複製到你的 GitHub 帳號。

### 步驟 2：建立 Cloudflare D1 資料庫

1. 登入 Cloudflare Dashboard
2. 左側選單 → **Workers & Pages** → **D1**
3. 點 **Create database**，命名為 `boxhax-db`
4. 進入資料庫 → **Console**
5. 將 `schema.sql` 的全部內容貼上，點 **Execute**

### 步驟 3：連接 GitHub 儲存庫

1. Cloudflare Dashboard → **Workers & Pages**
2. 點 **Create** → **Import a repository**
3. 選擇你 Fork 的 `boxhax` 儲存庫
4. Build command 留空
5. Deploy command 填 `npx wrangler deploy`
6. 點 **Save and Deploy**

### 步驟 4：綁定 D1 資料庫

1. 進入剛建立的 Worker
2. **Settings** → **Bindings** → **Add** → **D1 Database**
3. Variable name 填 `DB`
4. 選擇 `boxhax-db`

### 步驟 5：設定環境變數

**Settings** → **Variables and Secrets**，逐一新增：

| 變數名稱 | 類型 | 說明 |
|---|---|---|
| `ADMIN_USERNAME` | Text | 管理員帳號（預設 `admin`） |
| `ADMIN_PASSWORD` | Secret | 管理員密碼（必填） |
| `SESSION_SECRET` | Secret | Session 簽章用（可留空） |
| `SECRET_SALT` | Secret | 序號驗證鹽巴（必填） |
| `LICENSE_KEY` | Secret | 續租序號（沒有就留空） |
| `LINE_DEFAULT_GROUP_ID` | Text | 預設 LINE 群組 ID |
| `LINE_CHANNEL_ACCESS_TOKEN` | Secret | LINE Bot 權杖 |

### 步驟 6：部署前端面板

`dashboard.html` 建議用 **Cloudflare Pages** 部署：

1. Cloudflare Dashboard → **Workers & Pages** → **Pages**
2. 連接同一個 GitHub 儲存庫
3. Build output directory 填 `.`（根目錄）
4. 部署完成後，將 Pages 的網域綁定至你的自訂網域

或者直接將 `dashboard.html` 放在 Worker 的靜態資源中（需另外設定）。

### 步驟 7：設定 LINE Bot

1. 前往 [LINE Developers](https://developers.line.biz/)
2. 建立 Provider → 建立 Messaging API Channel
3. 取得 **Channel Access Token**
4. 將 Bot 邀請至目標 LINE 群組
5. 取得群組 ID（可透過 Webhook 或第三方工具）
6. 回到 BoxHax 面板 → LINE 設定 → 新增綁定

---

## 版本說明

### 社群免費版（Community Edition）

- 觸發條件：`LICENSE_KEY` 留空或填寫錯誤
- 限制：
  - 1 個團隊（最多 5 名成員）
  - 1 個自訂網域
  - 1 組 LINE 群組通知

### 商業續租版（Enterprise Edition）

- 觸發條件：填入有效的續租序號
- 序號格式：`BHX-YYYYMMDD-XXXXXXXXXXXX-CCCC`
- 解鎖：
  - 團隊數量無限制
  - 成員數量無限制
  - 多網域動態映射
  - 多組 LINE 分流推播

---

## 序號取得

商業續租序號由作者 Nova 離線生成，綁定你的架設網域與到期日。  
請聯繫作者取得專屬序號。

---

## 常見問題

### Q：序號可以給別人用嗎？

不行。序號綁定你的架設網域，換網域即失效。

### Q：免費版可以升級嗎？

可以。取得序號後，在 Cloudflare 環境變數 `LICENSE_KEY` 填入即可。

### Q：資料存在哪裡？

全部存在你自己的 Cloudflare D1 資料庫，作者完全不會接觸。

### Q：可以自訂網域嗎？

可以。在 Worker 的 **Settings → Domains & Routes** 綁定。

### Q：LINE 推播免費嗎？

LINE Messaging API 有免費額度，超過需付費。詳見 LINE 官方說明。

---

## 授權

本專案為商業軟體，核心閉源。  
詳細條款見 `LICENSE.txt`。

---

## 聯絡

- 作者：Nova
- 專案：BoxHax