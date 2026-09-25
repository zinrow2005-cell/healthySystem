# Xiaomi Smart Band 7 → 健康監測 V13.8

## 建議路徑
Xiaomi Smart Band 7
→ Mi Fitness
→ Apple Health
→ iPhone 捷徑
→ Apps Script
→ Google Sheet wearable_daily
→ 健康監測 V13.8

## 優先同步欄位
- steps
- distance_km
- active_calories
- exercise_minutes
- avg_hr
- resting_hr
- spo2
- sleep_hours

## 可選欄位
- min_spo2
- deep_sleep_hours
- rem_sleep_hours

如果 Apple Health 裡沒有深睡 / REM 等細項，留空即可，不要自行估算。

## 建議一天兩次
### 早上
同步昨晚：
- 睡眠總時數
- 深睡 / REM（若有）
- 平均 / 最低血氧
- 靜息心率

### 晚上
同步今天：
- 步數
- 距離
- 活動熱量
- 運動分鐘
- 平均心率

## POST JSON 範例
{
  "action": "wearable_upsert",
  "record": {
    "date": "2026-09-25",
    "steps": 8000,
    "distance_km": 5.5,
    "active_calories": 420,
    "exercise_minutes": 35,
    "avg_hr": 78,
    "resting_hr": 63,
    "spo2": 97.1,
    "min_spo2": 93,
    "sleep_hours": 7.2,
    "deep_sleep_hours": 1.4,
    "rem_sleep_hours": 1.6,
    "source": "xiaomi_smart_band_7"
  }
}
