# Google Apps Script 部署

1. 建立或開啟要當資料庫使用的 Google Sheet。
2. 擴充功能 → Apps Script。
3. 將 `Code.gs` 全部貼上。
4. 儲存。
5. 部署 → 新增部署作業 → 網頁應用程式。
6. 執行身分：你自己。
7. 存取權限依你的帳號需求設定。
8. 部署後複製 `/exec` 網址。
9. 回到健康監測系統 → 資料連線 → 貼上 Apps Script URL → 測試連線。

系統會使用：
- `health_records`
- `custom_labs`

如工作表不存在，程式會依需要建立。
