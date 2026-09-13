# BoxHax 安裝教學（圖文版）

本教學假設你完全沒有 Cloudflare 經驗，照著做就能完成。

---

## 事前準備

你需要：

- [ ] 一個 GitHub 帳號
- [ ] 一個 Cloudflare 帳號
- [ ] 一個自訂網域（可選，但建議）
- [ ] 一個 LINE 官方帳號（可選，但建議）

---

## 第一步：Fork 專案

1. 打開 BoxHax 的 GitHub 頁面
2. 點右上角 **Fork**
3. 選擇你的帳號
4. 等待完成

---

## 第二步：建立資料庫

1. 登入 [Cloudflare](https://dash.cloudflare.com/)
2. 左側選單點 **Workers & Pages**
3. 上方切換到 **D1**
4. 點 **Create database**
5. 名稱填 `boxhax-db`
6. 點 **Create**
7. 進入資料庫，點 **Console**
8. 打開專案裡的 `schema.sql`，全部複製
9. 貼進 Console，點 **Execute**
10. 看到 Success 就完成了

---

## 第三步：部署 Worker

1. Cloudflare → **Workers & Pages**
2. 點 **Create**
3. 選 **Import a repository**
4. 授權 GitHub，選擇你 Fork 的 `boxhax`
5. Build command 留空
6. Deploy command 填 `npx wrangler deploy`
7. 點 **Save and Deploy**
8. 等待部署完成

---

## 第四步：綁定資料庫

1. 進入剛建立的 Worker
2. 點 **Settings**
3. 左側選 **Bindings**
4. 點 **Add** → **D1 Database**
5. Variable name 填 `DB`
6. 選擇 `boxhax-db`
7. 點 **Save**

---

## 第五步：設定環境變數

1. 在 Worker 的 **Settings** → **Variables and Secrets**
2. 逐一新增以下變數：

| 名稱 | 類型 | 值 |
|---|---|---|
| `ADMIN_USERNAME` | Text | `admin` |
| `ADMIN_PASSWORD` | Secret | 你自己設一組強密碼 |
| `SECRET_SALT` | Secret | 你自己設一組亂碼 |
| `LICENSE_KEY` | Secret | 留空（免費版） |
| `LINE_DEFAULT_GROUP_ID` | Text | 你的 LINE 群組 ID |
| `LINE_CHANNEL_ACCESS_TOKEN` | Secret | 你的 LINE 權杖 |

3. 每個變數新增後點 **Save**

> **重要**：`SECRET_SALT` 和 `ADMIN_PASSWORD` 一定要選 **Secret** 類型，這樣才不會被看到。

---

## 第六步：綁定網域

1. Worker → **Settings** → **Domains & Routes**
2. 點 **Add** → **Custom domain**
3. 輸入你的網域，例如 `inbox.example.com`
4. 依照指示設定 DNS
5. 等待生效（通常幾分鐘）

---

## 第七步：部署前端

1. Cloudflare → **Workers & Pages** → **Pages**
2. 點 **Create** → **Connect to Git**
3. 選擇同一個 `boxhax` 儲存庫
4. Build output directory 填 `.`
5. 點 **Save and Deploy**
6. 完成後，將 Pages 的網域綁定至你的自訂網域

---

## 第八步：測試

1. 打開你的網域
2. 應該看到登入頁
3. 輸入 `ADMIN_USERNAME` 和 `ADMIN_PASSWORD`
4. 登入後應該看到面板

---

## 第九步：設定 LINE（可選）

1. 前往 [LINE Developers](https://developers.line.biz/)
2. 建立 Provider
3. 建立 Messaging API Channel
4. 取得 **Channel Access Token**
5. 將 Bot 邀請至目標群組
6. 取得群組 ID
7. 回到 BoxHax 面板 → LINE 設定 → 新增

---

## 常見問題

### 部署失敗怎麼辦？

檢查 `wrangler.toml` 的 `main` 是否對應正確的檔名。

### 登入後空白？

打開瀏覽器 Console（F12），看有沒有錯誤訊息。

### LINE 推播沒收到？

確認：
1. Channel Access Token 正確
2. 群組 ID 正確
3. Bot 已被邀請進群組

### 序號驗證失敗？

確認：
1. 序號格式正確（`BHX-YYYYMMDD-XXXXXXXXXXXX-CCCC`）
2. `SECRET_SALT` 與產生序號時一致
3. 網域與序號綁定的一致

---

## 完成

到這裡就全部完成了。  
如果有問題，請聯繫作者 Nova。