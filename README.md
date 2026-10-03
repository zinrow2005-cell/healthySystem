# 健康監測 V16.2 — GitHub Pages 正式使用版

這是整理後可直接上傳到 GitHub 的乾淨版本。

## GitHub Pages
請把根目錄中的檔案上傳到 GitHub repository：

- `index.html`
- `styles.css`
- `app.js`
- `health_intelligence.js`
- `multi_marker_engine.js`
- `sw.js`
- `manifest.webmanifest`
- 各 JSON 規則／檢驗資料庫

GitHub Repository → Settings → Pages：
- Source：Deploy from a branch
- Branch：`main`
- Folder：`/ (root)`

## Google Apps Script
`apps-script/Code.gs` 不需要放到 GitHub Pages 執行。
請把它貼到 Google Sheet 的 Apps Script 專案後部署成 Web App。

## 第一次使用
1. 開啟 GitHub Pages 網址。
2. 到「資料連線」貼上 Apps Script `/exec` 網址。
3. 按「測試連線」。
4. 到「正式使用檢查中心」執行完整檢查。
5. 確認核心資料、自訂檢驗、智慧引擎與 PWA 均正常。

## 資料架構
- `health_records`：常用核心檢驗
- `custom_labs`：任意新增檢驗
- 146 項檢驗目錄
- 單項智慧分析
- 多指標聯合分析
- 趨勢、健康報告、異常提醒
- JSON / CSV 備份

## 版本
V16.2 Production Readiness
