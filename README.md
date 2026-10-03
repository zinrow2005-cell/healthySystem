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
V16.2.2 App Icon Integrated


## APP 小圖示
這版已經整合新的 APP 圖示：
- `icon-192.png`
- `icon-512.png`
- `apple-touch-icon.png`
- `favicon-32.png`
- `favicon-16.png`

上傳到 GitHub 後，手機加入主畫面時會使用新的 APP 圖示。
如果手機仍顯示舊圖示，請重新整理一次並重新加入主畫面，讓 PWA 快取更新。

## V16.2.3 手機 Apps Script 連線修正
本版修正 iPhone / iPad PWA 可能出現：
`FetchEvent.respondWith received an error: Returned response is null`

原因是舊版 Service Worker 會攔截跨網域的 Google Apps Script 請求。
現在 Service Worker 只處理 GitHub Pages 自己網域的檔案，
Google Apps Script 請求會直接交給瀏覽器，不再經過 PWA 快取 fallback。

上傳 GitHub 後：
1. 等 GitHub Pages 更新。
2. iPhone/iPad 先關閉 APP。
3. 若仍是舊版，刪除主畫面 APP 後重新加入。
4. 重新進入「資料連線」測試 Apps Script。
