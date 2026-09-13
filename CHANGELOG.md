# Changelog

本專案所有重要變更都會記錄在此檔案。

格式依據 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.0.0/)。

---

## [1.0.0] - 2025-01-01

### 新增

- 核心 Worker 引擎
- 雙軌制版本（社群免費版 / 商業續租版）
- 本地密碼學時間鎖（SHA-256 + Salt）
- 網域與時間雙重鎖定
- 三段式防篡改序號驗證
- 多租戶架構（團隊、成員、網域）
- 成員權限階層（owner / admin / member / viewer）
- 驗證碼自動解析（4–6 位數）
- LINE 多群組綁定與分流推播
- 收信入口（轉寄 token）
- 完整 REST API
- 前端控制面板
- 登入驗證（Cookie Session）
- 免費版硬性限制（團隊、成員、網域、LINE）
- 稽核紀錄（system_events）
- 錯誤處理

### 檔案

- `schema.sql`
- `worker.js`（開發版）
- `boxhax-core.min.js`（混淆版）
- `dashboard.html`
- `wrangler.toml`
- `README.md`
- `install-guide.md`
- `LICENSE.txt`
- `CHANGELOG.md`
- `nova-generator.html`（不隨大禮包發布）

### 已知限制

- LINE 推播需自行申請 Messaging API
- 多網域動態映射需商業版
- 前端面板需另外部署至 Cloudflare Pages

---

## [未發布]

### 計劃中

- LINE Webhook 指令回覆
- 驗證碼自動過期清理
- 團隊邀請連結
- 郵件範本自訂
- 多語系支援
- 深色 / 淺色主題切換
- 匯出驗證碼紀錄
- 使用者雙因素驗證