# V13.9.1 Stability Fix

本版已做程式結構測試並修正一個實際風險：先前累積版本會在啟動時重複呼叫資料載入，可能造成 Google Sheet 重複請求與畫面渲染競爭。V13.9.1 改成單一統一啟動流程。

# 健康監測 V13.9 Zepp Life Sync

## 這版改了什麼
- 正式改成 Zepp Life 為主，不再要求切換到 Mi Fitness。
- 串接流程固定為：
  Xiaomi Smart Band 7 → Zepp Life → Apple Health → iPhone 捷徑 → Apps Script → Google Sheet → 系統
- 新增 Zepp Life 串接檢查區
- 新增「測試 Zepp Life 橋接接收端」按鈕
- 系統會顯示哪些手環欄位目前真的有收到
- Apple Health 沒有的欄位保持空白，不自行估算
- Apps Script 版本升級為 V13.9

## 重要
若 Zepp Life 已經正常綁定小米手環 7，就維持現況即可。

## 最穩定的同步欄位
建議優先：
- 步數
- 睡眠
- 距離
- 活動熱量

再視 Apple Health 實際是否有資料加入：
- 心率
- 靜息心率
- SpO₂
- 運動分鐘
- 深睡 / REM

## 檔案
- `Zepp_Life_Smart_Band_7_Setup.md`：Zepp Life 專用串接說明
- `Code.gs`：V13.9 Apps Script
- `wearable_daily_template.csv`：手環資料表格式

## 部署
1. 備份 Google Sheet
2. 更新 Apps Script Code.gs
3. 建立新版本部署
4. 測試應顯示 V13.9
5. 系統內「小米手環 7・Zepp Life」頁先測試接收端
6. 再建立 iPhone 捷徑
