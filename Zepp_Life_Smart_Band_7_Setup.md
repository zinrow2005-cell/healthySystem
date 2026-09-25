# Xiaomi Smart Band 7 + Zepp Life → 健康監測 V13.9

## 最終架構
Xiaomi Smart Band 7
→ Zepp Life
→ Apple Health
→ iPhone 捷徑
→ Apps Script
→ Google Sheet `wearable_daily`
→ 健康監測 V13.9

## 重要原則
你的手環維持綁定 Zepp Life，不需要為了本系統改綁 Mi Fitness。

Zepp Life 與 Mi Fitness 不需要同時使用。
先以你現在已經穩定使用的 Zepp Life 為主。

## 第一步：確認 Zepp Life 已把資料寫入 Apple Health
iPhone：
1. 開啟「健康」App。
2. 點右上角個人頭像。
3. 找「App / 資料來源與存取權」。
4. 找到 Zepp Life。
5. 確認它有權限寫入你想同步的健康項目。

## 第二步：確認 Apple Health 真的有資料
不要只看 Zepp Life 裡有數值。
請直接在 Apple Health 裡確認是否看得到：
- 步數
- 睡眠
- 心率
- 血氧
- 距離
- 活動熱量

只同步 Apple Health 實際存在的欄位。

## 第三步：iPhone 捷徑
建立一個捷徑：
「同步 Zepp Life 健康資料」

建議先做最穩定的兩組：

### A. 早上
讀取：
- 昨晚睡眠總時數
- 靜息心率（若 Apple Health 有）
- 血氧（若 Apple Health 有）

### B. 晚上
讀取：
- 今日步數
- 今日距離
- 今日活動熱量
- 今日運動分鐘
- 平均心率（若 Apple Health 有）

## POST JSON 範例
{
  "action": "wearable_upsert",
  "record": {
    "date": "2026-09-25",
    "steps": 7800,
    "distance_km": 5.2,
    "active_calories": 410,
    "exercise_minutes": 32,
    "avg_hr": 77,
    "resting_hr": 64,
    "spo2": 97.0,
    "sleep_hours": 7.0,
    "source": "zepp_life_apple_health"
  }
}

## 如果某個欄位 Apple Health 沒有
例如：
- deep_sleep_hours
- rem_sleep_hours
- min_spo2

請留白，不要自行估算。

## 每日同步建議
- 08:00 左右：同步昨晚睡眠
- 22:00 左右：同步全天活動

## Google Sheet
資料會寫入：
`wearable_daily`

同一日期再次同步會更新同一天，不會重複新增。

## 安全原則
手環心率、SpO₂、睡眠數據主要用於長期趨勢。
若有胸痛、呼吸困難、昏厥、持續血氧異常或其他明顯症狀，應以正式醫療評估為主。
