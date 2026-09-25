# 小米手錶 → 健康監測：iPhone 捷徑設定

## 建議架構
小米手錶
→ Mi Fitness（小米運動健康）
→ Apple Health
→ iPhone「捷徑」
→ Apps Script `/exec`
→ Google Sheet `wearable_daily`
→ V13.7 健康監測

## 先確認 Mi Fitness 有寫入 Apple Health
iPhone：
1. 開啟 Mi Fitness。
2. 個人資料 / 第三方資料 / Health（名稱可能依版本略有差異）。
3. 開啟允許同步的健康類別。
4. iPhone「健康」App → 個人頭像 → 隱私權 / App → Mi Fitness。
5. 開啟你希望允許寫入的類別，例如心率、血氧、睡眠等。

注意：不同小米手錶型號支援的資料類別不同。

## 建立捷徑
在 iPhone「捷徑」App 建立一個新捷徑，例如：
「同步小米健康到我的健康系統」

### 建議抓取的資料
- 今日步數：Find Health Samples / 尋找健康樣本 → Steps → 今天 → 加總
- 今日步行距離：Walking + Running Distance → 今天 → 加總
- 今日活動熱量：Active Energy → 今天 → 加總
- 今日平均心率：Heart Rate → 今天 → 平均
- 今日靜息心率：Resting Heart Rate → 今天 → 最新或平均
- 今日血氧：Oxygen Saturation → 今天 → 平均
- 昨晚睡眠：Sleep → 昨晚到今天早上 → 加總睡眠時數
- 運動分鐘：Exercise Time → 今天 → 加總

### 最後組成 JSON
範例：
{
  "action": "wearable_upsert",
  "record": {
    "date": "2026-09-24",
    "steps": 7421,
    "distance_km": 5.1,
    "active_calories": 438,
    "avg_hr": 78,
    "resting_hr": 64,
    "spo2": 97.2,
    "sleep_hours": 7.1,
    "exercise_minutes": 36,
    "source": "apple_health_shortcut"
  }
}

### POST 到 Apps Script
使用「取得 URL 內容」：
- URL：你的 Apps Script `/exec`
- 方法：POST
- Request Body：JSON
- 內容：上面的 Dictionary / 字典

## 自動執行時間
建議每天早上約 08:00 同步一次昨晚睡眠，
晚上約 22:00 再同步一次全天步數、心率與活動量。

如果你不想每天跳確認，可依你 iPhone / iOS 版本允許的捷徑自動化設定調整。

## 為什麼不能直接讓 GitHub PWA 讀 Apple Health？
Safari / GitHub Pages 網頁沒有 HealthKit 權限，不能直接讀 iPhone 健康資料。
因此需要「捷徑」或原生 iOS App 當中介。
