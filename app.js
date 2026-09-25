
const SAMPLE_DATA = [
  {date:"2024-01-01", fasting_glucose:124, hba1c:5.5, creatinine:1.20, egfr:72, uric_acid:5.0, weight:88},
  {date:"2025-06-01", fasting_glucose:118, hba1c:5.8, creatinine:1.19, egfr:70, uric_acid:7.7, weight:88},
  {date:"2026-04-01", fasting_glucose:121, hba1c:6.0, creatinine:1.40, egfr:62, uric_acid:2.8, weight:88},
  {date:"2026-09-21", fasting_glucose:122, hba1c:5.6, creatinine:1.27, bun:25, egfr:72.79, uric_acid:3.2, alt:27, sodium:141, potassium:4.6, hb:14.3, hct:44.1, rbc:5.11, wbc:6.12, plt:278, mcv:86.3, mch:28.0, mchc:32.4, pt:9.8, inr:0.91, ptt:30.0, weight:88}
];
const HEIGHT_M=1.74;
let records=[], dailyLogs=[];
const $=s=>document.querySelector(s);
const n=v=>v===null||v===undefined||v===""?null:Number(v);
const fmt=(v,d=1)=>v===null||v===undefined||Number.isNaN(Number(v))?"—":Number(v).toFixed(d).replace(/\.0$/,"");
const titles={
  dashboard:["健康總覽","依長期趨勢安排下一步，而不是只看單次紅字"],
  trends:["趨勢分析","把血糖、腎功能、尿酸與體重分開看"],
  alerts:["異常提醒","紅黃綠燈＋需要提早回診的訊號"],
  lifestyle:["飲食・運動・作息","依目前數值自動調整建議"],
  daily:["每日紀錄","把執行狀況與檢驗趨勢連在一起"],
  weekly:["本週目標","每週重新計算可執行目標"],
  labs:["全部檢驗","查看歷次檢驗資料"],
  add:["新增檢驗","新增後自動更新趨勢與建議"],
  settings:["資料連線","Google Sheet + Apps Script"]
};
function sorted(){return [...records].sort((a,b)=>a.date.localeCompare(b.date))}
function latest(){const s=sorted();return s[s.length-1]||{}}
function previousWith(field){const s=sorted().filter(r=>n(r[field])!==null);return s.length>1?s[s.length-2]:null}
function values(field){return sorted().filter(r=>n(r[field])!==null).map(r=>n(r[field]))}
function labels(field){return sorted().filter(r=>n(r[field])!==null).map(r=>r.date.slice(0,7))}
function bmi(w){return w? w/(HEIGHT_M*HEIGHT_M):null}
function metric(label,value,unit,status=""){return `<article class="metric ${status}"><span>${label}</span><strong>${value}</strong><small>${unit}</small></article>`}

function drawLine(canvas, vals, labs, opts={}){
  if(!canvas) return;
  const rect=canvas.getBoundingClientRect(), ratio=window.devicePixelRatio||1;
  const w=Math.max(300,rect.width), h=Math.max(180,rect.height);
  canvas.width=w*ratio; canvas.height=h*ratio;
  const ctx=canvas.getContext("2d"); ctx.scale(ratio,ratio);
  ctx.clearRect(0,0,w,h);
  if(!vals.length){ctx.fillText("尚無資料",20,30);return}
  const pad={l:48,r:18,t:20,b:42};
  let min=Math.min(...vals), max=Math.max(...vals);
  if(opts.min!==undefined) min=Math.min(min,opts.min);
  if(opts.max!==undefined) max=Math.max(max,opts.max);
  if(max===min){max+=1;min-=1}
  const span=max-min, lo=min-span*.15, hi=max+span*.15;
  ctx.strokeStyle="#d9e1e3"; ctx.lineWidth=1;
  for(let i=0;i<4;i++){const y=pad.t+(h-pad.t-pad.b)*i/3;ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(w-pad.r,y);ctx.stroke()}
  ctx.fillStyle="#6b7478";ctx.font="12px -apple-system, sans-serif";
  for(let i=0;i<4;i++){const v=hi-(hi-lo)*i/3;const y=pad.t+(h-pad.t-pad.b)*i/3;ctx.fillText(fmt(v,1),4,y+4)}
  const xAt=i=>pad.l+(w-pad.l-pad.r)*(vals.length===1?.5:i/(vals.length-1));
  const yAt=v=>pad.t+(hi-v)/(hi-lo)*(h-pad.t-pad.b);
  ctx.strokeStyle="#0f766e";ctx.lineWidth=3;ctx.lineJoin="round";ctx.lineCap="round";ctx.beginPath();
  vals.forEach((v,i)=>{const x=xAt(i),y=yAt(v);i?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.stroke();
  ctx.fillStyle="#0f766e";
  vals.forEach((v,i)=>{ctx.beginPath();ctx.arc(xAt(i),yAt(v),4,0,Math.PI*2);ctx.fill()});
  ctx.fillStyle="#6b7478";ctx.textAlign="center";
  labs.forEach((lab,i)=>{if(i===0||i===labs.length-1||labs.length<=4)ctx.fillText(lab,xAt(i),h-14)});
  ctx.textAlign="left";
}

function render(){
  const l=latest(), w=n(l.weight)||88, B=bmi(w);
  $("#metricGrid").innerHTML =
    metric("體重",fmt(w,1),"kg")+
    metric("BMI",fmt(B,1),B>=27?"偏高":"")+
    metric("空腹血糖",fmt(l.fasting_glucose,0),"mg/dL・長期追蹤","warn")+
    metric("HbA1c",fmt(l.hba1c,1),"%")+
    metric("Creatinine",fmt(l.creatinine,2),"mg/dL","caution")+
    metric("eGFR",fmt(l.egfr,1),"mL/min/1.73m²","caution");

  const pri=[];
  if(n(l.fasting_glucose)>=100) pri.push(["優先管理","空腹血糖長期偏高：飲料、主食份量與餐後活動最值得先處理。","orange"]);
  if(B>=27) pri.push(["第二優先","體重偏高：先以 3–6 個月減少 5–7% 體重為階段目標。","yellow"]);
  if(n(l.egfr)!==null&&n(l.egfr)<90) pri.push(["持續追蹤","腎功能較前次改善，但仍應看 Creatinine/eGFR 與尿蛋白趨勢。","yellow"]);
  pri.push(["目前穩定","血球、凝血、電解質與 ALT 目前沒有明顯警訊。","green"]);
  $("#priorityList").innerHTML=pri.map(x=>`<div class="status-row ${x[2]}"><b>${x[0]}</b><span>${x[1]}</span></div>`).join("");

  const ch=[];
  for(const [f,lab] of [["creatinine","Creatinine"],["egfr","eGFR"],["fasting_glucose","空腹血糖"],["hba1c","HbA1c"]]){
    const p=previousWith(f); if(!p||n(l[f])===null) continue;
    const a=n(p[f]),b=n(l[f]), cls=b<a?"value-down":b>a?"value-up":"value-neutral";
    ch.push(`<div class="trend"><span>${lab}</span><b class="${cls}">${fmt(a,2)} → ${fmt(b,2)}</b><small>${p.date} → ${l.date}</small></div>`);
  }
  $("#changeList").innerHTML=ch.join("")||"<p>資料不足。</p>";

  const targetLow=w*.93,targetHigh=w*.95;
  $("#goalGrid").innerHTML=`
    <div><b>體重</b><span>先往 ${fmt(targetLow,1)}–${fmt(targetHigh,1)} kg 前進，不追求快速下降。</span></div>
    <div><b>有氧</b><span>每週 ≥150 分鐘；飯後走路是優先習慣。</span></div>
    <div><b>睡眠</b><span>盡量固定 7–9 小時。</span></div>
    <div><b>飲食</b><span>含糖飲接近零、主食減量約 1/4、每餐先蔬菜。</span></div>`;

  drawLine($("#chartGlucose"),values("fasting_glucose"),labels("fasting_glucose"));
  drawLine($("#chartKidney"),values("creatinine"),labels("creatinine"));
  renderTrends(); renderAlerts(); renderLifestyle(); renderLabs(); renderDaily(); renderWeekly();
  $("#settingsWeight").textContent=fmt(w,1)+" kg";
}
function renderTrends(){
  const configs=[
    ["trendGlucose","fasting_glucose","trendGlucoseText","空腹血糖","mg/dL"],
    ["trendA1c","hba1c","trendA1cText","HbA1c","%"],
    ["trendCr","creatinine","trendCrText","Creatinine","mg/dL"],
    ["trendEgfr","egfr","trendEgfrText","eGFR","mL/min/1.73m²"],
    ["trendUric","uric_acid","trendUricText","尿酸","mg/dL"],
    ["trendWeight","weight","trendWeightText","體重","kg"]
  ];
  configs.forEach(([cid,f,tid,label,unit])=>{
    const vals=values(f);drawLine($("#"+cid),vals,labels(f));
    let txt="資料不足。";
    if(vals.length>=2){
      const d=vals[vals.length-1]-vals[vals.length-2];
      txt=`<p>最近：${fmt(vals[vals.length-2],2)} → ${fmt(vals[vals.length-1],2)} ${unit}，${d<0?"下降":d>0?"上升":"持平"}。</p>`;
    }
    $("#"+tid).innerHTML=txt;
  });
}
function renderAlerts(){
  const l=latest(), B=bmi(n(l.weight)||88), cards=[];
  const fg=n(l.fasting_glucose), a1=n(l.hba1c), eg=n(l.egfr), cr=n(l.creatinine), ua=n(l.uric_acid);
  cards.push({c:fg>=126?"red":fg>=100?"yellow":"green",t:"空腹血糖",p:fg===null?"尚無資料":`${fmt(fg,0)} mg/dL；${fg>=126?"已達需要醫師確認的門檻":fg>=100?"屬持續偏高範圍":"目前在一般正常範圍"}`});
  cards.push({c:a1>=6.5?"red":a1>=5.7?"yellow":"green",t:"HbA1c",p:a1===null?"尚無資料":`${fmt(a1,1)}%；${a1>=6.5?"需醫師進一步確認":a1>=5.7?"偏高":"目前未達糖尿病前期門檻"}`});
  cards.push({c:eg!==null&&eg<60?"red":eg!==null&&eg<90?"yellow":"green",t:"eGFR",p:eg===null?"尚無資料":`${fmt(eg,1)}；${eg<60?"若持續超過 3 個月需進一步評估":eg<90?"需搭配尿蛋白與長期趨勢":"目前較理想"}`});
  cards.push({c:cr!==null&&cr>1.3?"yellow":"green",t:"Creatinine",p:cr===null?"尚無資料":`${fmt(cr,2)} mg/dL；重點是和過去基準比較，不用只看單次。`});
  cards.push({c:B>=27?"yellow":"green",t:"BMI",p:`${fmt(B,1)}；目前先以減重 5–7% 為可執行目標。`});
  cards.push({c:ua!==null&&ua>7?"yellow":"green",t:"尿酸",p:ua===null?"尚無資料":`${fmt(ua,1)} mg/dL；近期數值控制較先前改善。`});
  $("#alertCards").innerHTML=cards.map(x=>`<div class="alert-card ${x.c}"><h3>${x.t}</h3><p>${x.p}</p></div>`).join("");

  const flags=[];
  if(fg!==null&&fg>=126) flags.push("空腹血糖若不同日重複達到或超過 126 mg/dL，應安排醫師評估。");
  else flags.push("若未來空腹血糖不同日重複達到或超過 126 mg/dL，應安排醫師評估。");
  flags.push("若 eGFR 持續下降到 60 以下、Creatinine 持續上升，或出現尿蛋白、血尿、水腫、尿量改變，應提早回診。");
  flags.push("若出現明顯胸痛、呼吸困難、意識改變等急性症狀，應立即就醫，而不是等系統下一次提醒。");
  $("#doctorFlags").innerHTML=flags.map(x=>`<div class="advice-item">${x}</div>`).join("");
}
function renderLifestyle(){
  const l=latest(), w=n(l.weight)||88, B=bmi(w), diet=[];
  if(n(l.fasting_glucose)>=100){
    diet.push("每餐把白飯、麵、稀飯等精緻澱粉先減少約 1/4；優先換成糙米、燕麥、地瓜或豆類。");
    diet.push("含糖飲、果汁與加糖咖啡盡量歸零；水果吃完整水果，不用果汁取代。");
    diet.push("用餐順序優先：蔬菜 → 蛋白質 → 主食，並避免一餐吃進大量澱粉。");
  }
  if(B>=27) diet.push("先設定 3–6 個月減少 5–7% 體重，不用追求短期大量下降。");
  if(n(l.egfr)!==null&&n(l.egfr)<90){
    diet.push("避免自行採高蛋白減重法或大量蛋白粉；蛋白質以一般份量的魚、蛋、豆、雞肉與瘦肉平均分配。");
    diet.push("減少濃湯、加工肉、醃漬物與重鹹醬料，對血壓與腎臟都比較有利。");
  }
  diet.push("尿酸管理避免大量內臟、濃肉湯、啤酒、暴飲暴食與脫水；快速減重也可能造成尿酸波動。");
  $("#dietAdvice").innerHTML=`<div class="advice-list">${diet.map(x=>`<div class="advice-item">${x}</div>`).join("")}</div>`;

  const ex=[
    "每週累積至少 150 分鐘中等強度有氧，優先選快走、固定式腳踏車等容易長期做的活動。",
    "每餐後走 10–15 分鐘，比偶爾一次很高強度運動更容易直接幫助血糖管理。",
    "每週安排至少 2 次肌力訓練；左手肘仍在術後恢復時，先以腿部、臀部與不需左手承重的核心動作為主。",
    "運動量逐週增加；痛風急性發作或術後疼痛加劇時先降低強度。"
  ];
  $("#exerciseAdvice").innerHTML=`<div class="advice-list">${ex.map(x=>`<div class="advice-item">${x}</div>`).join("")}</div>`;

  const sl=[
    "睡眠目標 7–9 小時，並盡量固定就寢與起床時間。",
    "晚餐避免太晚、太飽；睡前 2–3 小時避免大量進食。",
    "炎熱、流汗或運動日規律補水，避免脫水；若未來醫師有限水指示則以醫囑為準。",
    "每週固定 2–3 次量體重，觀察週平均，不追逐單日變化。"
  ];
  $("#sleepAdvice").innerHTML=`<div class="advice-list">${sl.map(x=>`<div class="advice-item">${x}</div>`).join("")}</div>`;

  $("#actionAdvice").innerHTML=`<div class="advice-list">
    <div class="advice-item"><b>第一件事：</b>先把含糖飲降到接近零。</div>
    <div class="advice-item"><b>第二件事：</b>每餐後至少走 10 分鐘。</div>
    <div class="advice-item"><b>第三件事：</b>每餐主食減少約 1/4，先菜後飯。</div>
    <div class="advice-item"><b>第四件事：</b>把體重慢慢降到約 82–83.5 kg，再看下一階段。</div>
  </div>`;
}
function renderLabs(){
  const fields={fasting_glucose:["空腹血糖","mg/dL"],hba1c:["HbA1c","%"],creatinine:["Creatinine","mg/dL"],bun:["BUN","mg/dL"],egfr:["eGFR","mL/min/1.73m²"],uric_acid:["尿酸","mg/dL"],alt:["ALT","U/L"],weight:["體重","kg"]};
  const rows=[];
  sorted().slice().reverse().forEach(r=>Object.entries(fields).forEach(([k,v])=>{if(n(r[k])!==null)rows.push(`<tr><td>${r.date}</td><td>${v[0]}</td><td>${fmt(n(r[k]),2)}</td><td>${v[1]}</td></tr>`)}));
  $("#labTableBody").innerHTML=rows.join("");
}
function saveDaily(){
  const d={date:$("#dDate").value,weight:n($("#dWeight").value),exercise:n($("#dExercise").value)||0,postmeal:n($("#dPostMeal").value)||0,sleep:n($("#dSleep").value),water:n($("#dWater").value),sugary:$("#dSugary").checked,veg:$("#dVeg").checked,late:$("#dLate").checked};
  if(!d.date){$("#dailyMsg").textContent="請先選日期。";return}
  dailyLogs=dailyLogs.filter(x=>x.date!==d.date);dailyLogs.push(d);dailyLogs.sort((a,b)=>a.date.localeCompare(b.date));
  localStorage.setItem("healthDailyLogs",JSON.stringify(dailyLogs));$("#dailyMsg").textContent="已儲存今日紀錄。";renderDaily();renderWeekly();
}
function renderDaily(){
  dailyLogs=JSON.parse(localStorage.getItem("healthDailyLogs")||"[]");
  const last=[...dailyLogs].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,7);
  $("#dailyTableBody").innerHTML=last.map(d=>`<tr><td>${d.date}</td><td>${fmt(d.weight,1)}</td><td>${d.exercise||0} 分</td><td>${d.postmeal||0} 分</td><td>${fmt(d.sleep,1)} 小時</td><td>${d.sugary?"有":"無"}</td></tr>`).join("")||`<tr><td colspan="6">尚無每日紀錄</td></tr>`;
  if(!last.length){$("#weeklyScore").innerHTML="<p>開始記錄後，這裡會顯示最近 7 天完成度。</p>";return}
  let score=0,max=0;
  last.forEach(d=>{max+=4;if((d.exercise||0)>=20)score++;if((d.postmeal||0)>=10)score++;if(n(d.sleep)>=7)score++;if(!d.sugary)score++;});
  const pct=Math.round(score/max*100);
  $("#weeklyScore").innerHTML=`<div class="score-big">${pct}%</div><div class="progress"><span style="width:${pct}%"></span></div><p class="muted">依有氧、飯後走路、睡眠與含糖飲四項計算。</p>`;
}
function renderWeekly(){
  const last=[...dailyLogs].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,7), l=latest(), w=n(l.weight)||88;
  const totalEx=last.reduce((s,d)=>s+(d.exercise||0),0), postDays=last.filter(d=>(d.postmeal||0)>=10).length, noSugar=last.filter(d=>!d.sugary).length, sleepDays=last.filter(d=>n(d.sleep)>=7).length;
  $("#weeklyGoals").innerHTML=`
    <div><b>有氧</b><span>本週累積 150 分鐘以上。</span></div>
    <div><b>飯後走</b><span>至少 5 天，每天 ≥10 分鐘。</span></div>
    <div><b>含糖飲</b><span>至少 6 天不喝含糖飲。</span></div>
    <div><b>睡眠</b><span>至少 5 天達到 7 小時以上。</span></div>`;
  const exPct=Math.min(100,Math.round(totalEx/150*100)),postPct=Math.min(100,Math.round(postDays/5*100)),sugPct=Math.min(100,Math.round(noSugar/6*100)),slPct=Math.min(100,Math.round(sleepDays/5*100));
  $("#weeklyProgress").innerHTML=`
    <p>有氧 ${totalEx}/150 分鐘</p><div class="progress"><span style="width:${exPct}%"></span></div>
    <p>飯後走 ${postDays}/5 天</p><div class="progress"><span style="width:${postPct}%"></span></div>
    <p>無含糖飲 ${noSugar}/6 天</p><div class="progress"><span style="width:${sugPct}%"></span></div>
    <p>睡眠達標 ${sleepDays}/5 天</p><div class="progress"><span style="width:${slPct}%"></span></div>`;
  const advice=[];
  if(exPct<70) advice.push("下週先增加快走頻率，不必一次延長很多時間。");
  if(postPct<70) advice.push("把『飯後走 10 分鐘』綁定午餐或晚餐，會比靠意志力更容易執行。");
  if(sugPct<80) advice.push("含糖飲仍是最值得優先改善的項目，先改無糖茶或水。");
  if(slPct<70) advice.push("睡眠不足會影響食慾與血糖，優先固定上床時間。");
  if(!advice.length) advice.push("目前執行率不錯，下週維持相同節奏即可，不需要突然加量。");
  $("#nextWeekAdvice").innerHTML=`<div class="advice-list">${advice.map(x=>`<div class="advice-item">${x}</div>`).join("")}</div>`;
}
async function loadData(){
  dailyLogs=JSON.parse(localStorage.getItem("healthDailyLogs")||"[]");
  const api=localStorage.getItem("healthApiUrl")||"";$("#apiUrl").value=api;
  if(!api){records=JSON.parse(localStorage.getItem("healthLocalData")||JSON.stringify(SAMPLE_DATA));$("#syncStatus").textContent="本機資料";render();return}
  try{
    $("#syncStatus").textContent="同步中…";
    const res=await fetch(api+"?action=list",{cache:"no-store"});const data=await res.json();
    if(!data.ok||!Array.isArray(data.records))throw new Error(data.error||"格式錯誤");
    records=data.records;$("#syncStatus").textContent="Google Sheet 已同步";render();
  }catch(e){
    records=JSON.parse(localStorage.getItem("healthLocalData")||JSON.stringify(SAMPLE_DATA));
    $("#syncStatus").textContent="連線失敗・本機資料";render();
  }
}
async function saveLab(){
  const r={date:$("#fDate").value,fasting_glucose:n($("#fGlucose").value),hba1c:n($("#fA1c").value),creatinine:n($("#fCr").value),bun:n($("#fBun").value),egfr:n($("#fEgfr").value),uric_acid:n($("#fUric").value),alt:n($("#fAlt").value),weight:n($("#fWeight").value)};
  if(!r.date){$("#saveMsg").textContent="請先選日期。";return}
  const api=localStorage.getItem("healthApiUrl")||"";
  if(api){
    try{const res=await fetch(api,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify({action:"add",record:r})});const data=await res.json();if(!data.ok)throw new Error(data.error||"儲存失敗");$("#saveMsg").textContent="已儲存到 Google Sheet。";await loadData();return}catch(e){$("#saveMsg").textContent="Google Sheet 儲存失敗，已改存本機。"}
  }
  const local=JSON.parse(localStorage.getItem("healthLocalData")||JSON.stringify(SAMPLE_DATA));local.push(r);localStorage.setItem("healthLocalData",JSON.stringify(local));records=local;render();$("#saveMsg").textContent="已儲存在此裝置。";
}
document.querySelectorAll(".nav-btn").forEach(btn=>btn.addEventListener("click",()=>{
  const id=btn.dataset.page;document.querySelectorAll(".nav-btn").forEach(b=>b.classList.remove("active"));btn.classList.add("active");
  document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));$("#"+id).classList.add("active");
  $("#pageTitle").textContent=titles[id][0];$("#pageSub").textContent=titles[id][1];$("#sidebar").classList.remove("open");window.scrollTo(0,0);
  setTimeout(()=>{renderTrends();drawLine($("#chartGlucose"),values("fasting_glucose"),labels("fasting_glucose"));drawLine($("#chartKidney"),values("creatinine"),labels("creatinine"));},50);
}));
$("#menuBtn").addEventListener("click",()=>$("#sidebar").classList.toggle("open"));
$("#refreshBtn").addEventListener("click",loadData);
$("#saveLabBtn").addEventListener("click",saveLab);
$("#saveDailyBtn").addEventListener("click",saveDaily);
$("#saveApiBtn").addEventListener("click",()=>{localStorage.setItem("healthApiUrl",$("#apiUrl").value.trim());$("#apiMsg").textContent="已儲存。";loadData()});
$("#testApiBtn").addEventListener("click",async()=>{const u=$("#apiUrl").value.trim();if(!u){$("#apiMsg").textContent="請先貼上 /exec 網址。";return}try{const r=await fetch(u+"?action=ping",{cache:"no-store"});const d=await r.json();$("#apiMsg").textContent=d.ok?`連線成功：${d.version||""}`:"連線失敗。"}catch(e){$("#apiMsg").textContent="連線失敗："+e.message}});
const today=new Date().toISOString().slice(0,10);$("#fDate").value=today;$("#dDate").value=today;
window.addEventListener("resize",()=>{drawLine($("#chartGlucose"),values("fasting_glucose"),labels("fasting_glucose"));drawLine($("#chartKidney"),values("creatinine"),labels("creatinine"));renderTrends()});
if("serviceWorker" in navigator)navigator.serviceWorker.register("sw.js").catch(()=>{});
// V13.9.1: legacy startup disabled; unified startup runs at end.
/* ===== V13.3 Full Sync Overrides ===== */
let syncMode = "local";

async function apiGet(action, extra={}) {
  const api = localStorage.getItem("healthApiUrl") || "";
  if(!api) throw new Error("API not configured");
  const u = new URL(api);
  u.searchParams.set("action", action);
  Object.entries(extra).forEach(([k,v])=>u.searchParams.set(k,v));
  const res = await fetch(u.toString(), {cache:"no-store"});
  const data = await res.json();
  if(!data.ok) throw new Error(data.error || "API error");
  return data;
}
async function apiPost(payload) {
  const api = localStorage.getItem("healthApiUrl") || "";
  if(!api) throw new Error("API not configured");
  const res = await fetch(api, {
    method:"POST",
    headers:{"Content-Type":"text/plain;charset=utf-8"},
    body:JSON.stringify(payload)
  });
  const data = await res.json();
  if(!data.ok) throw new Error(data.error || "API error");
  return data;
}
function mergeDaily(localArr, remoteArr){
  const map = new Map();
  [...(localArr||[]), ...(remoteArr||[])].forEach(x=>{
    if(x && x.date) map.set(x.date, {...(map.get(x.date)||{}), ...x});
  });
  return [...map.values()].sort((a,b)=>a.date.localeCompare(b.date));
}
async function loadDataV133(){
  const api=localStorage.getItem("healthApiUrl")||"";
  $("#apiUrl").value=api;
  const localLabs=JSON.parse(localStorage.getItem("healthLocalData")||JSON.stringify(SAMPLE_DATA));
  const localDaily=JSON.parse(localStorage.getItem("healthDailyLogs")||"[]");
  if(!api){
    records=localLabs;
    dailyLogs=localDaily;
    syncMode="local";
    $("#syncStatus").textContent="本機資料";
    render();
    return;
  }
  try{
    $("#syncStatus").textContent="同步中…";
    const [labData,dailyData]=await Promise.all([apiGet("list"),apiGet("daily_list")]);
    records=Array.isArray(labData.records)?labData.records:localLabs;
    dailyLogs=mergeDaily(localDaily, Array.isArray(dailyData.records)?dailyData.records:[]);
    localStorage.setItem("healthDailyLogs",JSON.stringify(dailyLogs));
    syncMode="cloud";
    $("#syncStatus").textContent="Google Sheet 全資料已同步";
    render();
  }catch(e){
    records=localLabs;
    dailyLogs=localDaily;
    syncMode="fallback";
    $("#syncStatus").textContent="同步失敗・本機資料";
    render();
  }
}
async function saveDailyV133(){
  const d={date:$("#dDate").value,weight:n($("#dWeight").value),exercise:n($("#dExercise").value)||0,postmeal:n($("#dPostMeal").value)||0,sleep:n($("#dSleep").value),water:n($("#dWater").value),sugary:$("#dSugary").checked,veg:$("#dVeg").checked,late:$("#dLate").checked};
  if(!d.date){$("#dailyMsg").textContent="請先選日期。";return}
  dailyLogs=dailyLogs.filter(x=>x.date!==d.date);dailyLogs.push(d);dailyLogs.sort((a,b)=>a.date.localeCompare(b.date));
  localStorage.setItem("healthDailyLogs",JSON.stringify(dailyLogs));
  const api=localStorage.getItem("healthApiUrl")||"";
  if(api){
    try{
      await apiPost({action:"daily_upsert",record:d});
      $("#dailyMsg").textContent="已同步到 Google Sheet，其他裝置也會看到這筆紀錄。";
      syncMode="cloud";
    }catch(e){
      $("#dailyMsg").textContent="雲端同步失敗，但已先存本機。";
    }
  }else{
    $("#dailyMsg").textContent="已儲存在此裝置；設定 Apps Script 後可跨裝置同步。";
  }
  renderDaily();renderWeekly();
}
async function syncLocalDailyToCloud(){
  const api=localStorage.getItem("healthApiUrl")||"";
  if(!api){$("#apiMsg").textContent="請先設定 Apps Script /exec 網址。";return}
  const local=JSON.parse(localStorage.getItem("healthDailyLogs")||"[]");
  try{
    for(const row of local){ await apiPost({action:"daily_upsert",record:row}); }
    $("#apiMsg").textContent=`已將 ${local.length} 筆本機每日紀錄同步到 Google Sheet。`;
    await loadDataV133();
  }catch(e){
    $("#apiMsg").textContent="同步失敗："+e.message;
  }
}
function addSyncButton(){
  const settings = $("#settings .card");
  if(settings && !$("#syncDailyBtn")){
    const btn=document.createElement("button");
    btn.id="syncDailyBtn";
    btn.className="secondary-btn";
    btn.textContent="同步本機每日紀錄";
    const actions=settings.querySelector(".form-actions");
    if(actions) actions.appendChild(btn);
    btn.addEventListener("click",syncLocalDailyToCloud);
  }
}
window.addEventListener("load", addSyncButton);

const oldRenderDaily = renderDaily;
renderDaily = function(){
  const stored=JSON.parse(localStorage.getItem("healthDailyLogs")||"[]");
  if(syncMode==="local" || syncMode==="fallback") dailyLogs=stored;
  const last=[...dailyLogs].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,7);
  $("#dailyTableBody").innerHTML=last.map(d=>`<tr><td>${d.date}</td><td>${fmt(d.weight,1)}</td><td>${d.exercise||0} 分</td><td>${d.postmeal||0} 分</td><td>${fmt(d.sleep,1)} 小時</td><td>${d.sugary?"有":"無"}</td></tr>`).join("")||`<tr><td colspan="6">尚無每日紀錄</td></tr>`;
  if(!last.length){$("#weeklyScore").innerHTML="<p>開始記錄後，這裡會顯示最近 7 天完成度。</p>";return}
  let score=0,max=0;
  last.forEach(d=>{max+=4;if((d.exercise||0)>=20)score++;if((d.postmeal||0)>=10)score++;if(n(d.sleep)>=7)score++;if(!d.sugary)score++;});
  const pct=Math.round(score/max*100);
  $("#weeklyScore").innerHTML=`<div class="score-big">${pct}%</div><div class="progress"><span style="width:${pct}%"></span></div><p class="muted">依有氧、飯後走路、睡眠與含糖飲四項計算。${syncMode==="cloud"?" 已與 Google Sheet 同步。":""}</p>`;
};

$("#saveDailyBtn").replaceWith($("#saveDailyBtn").cloneNode(true));
$("#saveDailyBtn").addEventListener("click",saveDailyV133);

$("#refreshBtn").replaceWith($("#refreshBtn").cloneNode(true));
$("#refreshBtn").addEventListener("click",loadDataV133);

$("#saveApiBtn").replaceWith($("#saveApiBtn").cloneNode(true));
$("#saveApiBtn").addEventListener("click",()=>{
  localStorage.setItem("healthApiUrl",$("#apiUrl").value.trim());
  $("#apiMsg").textContent="已儲存。";
  loadDataV133();
});

// V13.9.1: intermediate startup disabled; unified startup runs at end.
/* ===== V13.4 Goals & Scoring ===== */
titles.score=["健康行動評分","把每天可控制的行為，轉成清楚的每週進度"];

function lastNDaysLogs(nDays=28){
  const cutoff = new Date();
  cutoff.setHours(0,0,0,0);
  cutoff.setDate(cutoff.getDate()-(nDays-1));
  return [...dailyLogs].filter(d=>{
    const dt=new Date(d.date+"T00:00:00");
    return dt>=cutoff;
  }).sort((a,b)=>a.date.localeCompare(b.date));
}

function calcWeekScore(logs){
  if(!logs.length) return {
    total:0, exercise:0, postmeal:0, sleep:0, sugar:0, nutrition:0,
    notes:["這週尚無足夠每日紀錄，先從每天記錄開始。"]
  };
  const days = Math.min(7, logs.length);
  const recent = logs.slice(-7);
  const totalExercise = recent.reduce((s,d)=>s+(Number(d.exercise)||0),0);
  const ex = Math.min(100, totalExercise/150*100);
  const post = Math.min(100, recent.filter(d=>(Number(d.postmeal)||0)>=10).length/5*100);
  const sleep = Math.min(100, recent.filter(d=>Number(d.sleep)>=7 && Number(d.sleep)<=9).length/5*100);
  const sugar = Math.min(100, recent.filter(d=>!d.sugary).length/6*100);
  const nutrition = Math.min(100, recent.filter(d=>d.veg && !d.late).length/5*100);

  // Weights prioritize glucose and weight related behaviors without pretending to predict disease risk
  const total = Math.round(ex*0.25 + post*0.25 + sleep*0.20 + sugar*0.20 + nutrition*0.10);
  const notes=[];
  if(ex<70) notes.push("有氧活動還可以增加，先補到每週 150 分鐘。");
  if(post<70) notes.push("飯後走路是目前最值得增加的項目，目標至少 5 天。");
  if(sugar<80) notes.push("含糖飲仍有改善空間，先把一週大部分天數改成無糖。");
  if(sleep<70) notes.push("睡眠達標率偏低，優先固定上床時間。");
  if(nutrition<70) notes.push("蔬菜與晚餐時間仍可再穩定一些。");
  if(!notes.length) notes.push("本週執行情況穩定，下週維持即可，不需要突然提高強度。");

  return {total:Math.max(0,Math.min(100,total)),exercise:Math.round(ex),postmeal:Math.round(post),sleep:Math.round(sleep),sugar:Math.round(sugar),nutrition:Math.round(nutrition),notes};
}

function calcFourWeekScores(){
  const logs = lastNDaysLogs(28);
  const buckets=[[],[],[],[]];
  if(!logs.length) return [];
  const now=new Date(); now.setHours(0,0,0,0);
  logs.forEach(d=>{
    const dt=new Date(d.date+"T00:00:00");
    const diff=Math.floor((now-dt)/(1000*60*60*24));
    const idx=3-Math.min(3,Math.floor(diff/7));
    if(idx>=0&&idx<4) buckets[idx].push(d);
  });
  return buckets.map((b,i)=>({label:`第${i+1}週`,score:calcWeekScore(b).total}));
}

function renderHealthScore(){
  const recent=[...dailyLogs].sort((a,b)=>a.date.localeCompare(b.date)).slice(-7);
  const sc=calcWeekScore(recent);

  $("#healthScore").innerHTML=`
    <div class="score-ring" style="--score:${sc.total}">
      <div class="inside"><strong>${sc.total}</strong><span>/ 100</span></div>
    </div>`;

  const arr=[
    ["有氧",sc.exercise,"每週 150 分鐘"],
    ["飯後走",sc.postmeal,"至少 5 天"],
    ["睡眠",sc.sleep,"7–9 小時"],
    ["無糖飲",sc.sugar,"至少 6 天"],
    ["飲食作息",sc.nutrition,"蔬菜＋晚餐時間"]
  ];
  $("#scoreBreakdown").innerHTML=arr.map(([nme,val,desc])=>`
    <div class="score-card">
      <span class="badge">${nme}</span>
      <b>${val}%</b>
      <small>${desc}</small>
      <div class="progress"><span style="width:${val}%"></span></div>
    </div>`).join("");

  $("#scorePriorities").innerHTML=sc.notes.map(x=>`<div class="advice-item">${x}</div>`).join("");

  const four=calcFourWeekScores();
  drawLine($("#scoreTrend"),four.map(x=>x.score),four.map(x=>x.label),{min:0,max:100});
  if(four.length){
    const vals=four.map(x=>x.score);
    const first=vals[0], last=vals[vals.length-1];
    $("#scoreTrendText").innerHTML=`<p>最近 4 週：${vals.join(" → ")} 分。${last>first?"整體執行有進步。":last<first?"最近執行率有下降，建議先抓一項最容易做到的習慣。":"整體大致持平。"}</p>`;
  } else {
    $("#scoreTrendText").innerHTML="<p>累積每日紀錄後，這裡會顯示 4 週趨勢。</p>";
  }

  const l=latest(), plan=[];
  const fg=n(l.fasting_glucose), eg=n(l.egfr), B=bmi(n(l.weight)||88);
  if(fg!==null && fg>=100){
    plan.push("維持「餐後走 10–15 分鐘」作為固定習慣，優先綁定晚餐。");
    plan.push("主食先減少約 1/4，含糖飲盡量維持零。");
  }
  if(B>=27) plan.push("減重速度以每週約 0.25–0.5 kg 為較容易長期維持的節奏。");
  if(eg!==null && eg<90) plan.push("避免高蛋白減重與大量蛋白粉，飲水與鈉攝取維持穩定。");
  if(sc.sleep<70) plan.push("本週先把睡眠固定下來，再考慮增加運動量。");
  if(sc.exercise<70) plan.push("若身體狀況允許，下週多增加 2 次 20–30 分鐘快走。");
  if(!plan.length) plan.push("目前執行情況穩定，下週保持相同節奏並繼續記錄即可。");
  $("#nextWeekPlan").innerHTML=plan.map(x=>`<div class="advice-item">${x}</div>`).join("");
}

const oldRenderV134 = render;
render = function(){
  oldRenderV134();
  renderHealthScore();
};

const oldRenderDailyV134 = renderDaily;
renderDaily = function(){
  oldRenderDailyV134();
  renderHealthScore();
};

const oldRenderWeeklyV134 = renderWeekly;
renderWeekly = function(){
  oldRenderWeeklyV134();
  renderHealthScore();
};


/* ===== V13.5 Lab × Lifestyle Link ===== */
titles.correlation=["檢驗 × 生活關聯","比較抽血前的生活紀錄與下一次檢驗變化"];

function parseDateLocal(s){
  if(!s) return null;
  const d=new Date(s+"T00:00:00");
  return Number.isNaN(d.getTime())?null:d;
}
function daysBetween(a,b){
  return Math.round((b-a)/(1000*60*60*24));
}
function logsBefore(dateStr, days){
  const target=parseDateLocal(dateStr);
  if(!target) return [];
  const start=new Date(target); start.setDate(start.getDate()-days);
  return [...dailyLogs].filter(d=>{
    const dt=parseDateLocal(d.date);
    return dt && dt < target && dt >= start;
  });
}
function lifestyleSummary(dateStr, days){
  const logs=logsBefore(dateStr,days);
  if(!logs.length) return {count:0};
  const weights=logs.map(x=>n(x.weight)).filter(x=>x!==null);
  const avg=(arr)=>arr.length?arr.reduce((a,b)=>a+b,0)/arr.length:null;
  return {
    count:logs.length,
    avgWeight:avg(weights),
    avgExercise:avg(logs.map(x=>Number(x.exercise)||0)),
    postmealRate:logs.filter(x=>(Number(x.postmeal)||0)>=10).length/logs.length*100,
    noSugarRate:logs.filter(x=>!x.sugary).length/logs.length*100,
    sleepRate:logs.filter(x=>n(x.sleep)>=7 && n(x.sleep)<=9).length/logs.length*100,
    vegRate:logs.filter(x=>x.veg).length/logs.length*100
  };
}
function correlation(xs,ys){
  if(xs.length!==ys.length || xs.length<3) return null;
  const mx=xs.reduce((a,b)=>a+b,0)/xs.length, my=ys.reduce((a,b)=>a+b,0)/ys.length;
  let num=0,dx=0,dy=0;
  for(let i=0;i<xs.length;i++){
    const a=xs[i]-mx,b=ys[i]-my;num+=a*b;dx+=a*a;dy+=b*b;
  }
  if(dx===0||dy===0) return null;
  return num/Math.sqrt(dx*dy);
}
function relationLabel(r){
  if(r===null) return "資料不足";
  const a=Math.abs(r);
  if(a<0.25) return "目前沒有明顯線性關聯";
  if(a<0.5) return r>0?"有輕度同向關聯":"有輕度反向關聯";
  return r>0?"有中度以上同向關聯":"有中度以上反向關聯";
}
function buildLabLifestylePairs(field, windowDays){
  return sorted()
    .filter(r=>n(r[field])!==null)
    .map(r=>({lab:r, life:lifestyleSummary(r.date,windowDays)}))
    .filter(x=>x.life.count>=3);
}
function renderCorrelation(){
  if(!$("#correlationSummary")) return;

  const labs=sorted().filter(r=>r.date);
  $("#preLabLifestyleBody").innerHTML=labs.slice().reverse().map(r=>{
    const s=lifestyleSummary(r.date,30);
    return `<tr>
      <td>${r.date}</td>
      <td>${s.count||0}</td>
      <td>${s.count?fmt(s.avgWeight,1):"—"}</td>
      <td>${s.count?fmt(s.avgExercise,0)+" 分/日":"—"}</td>
      <td>${s.count?fmt(s.postmealRate,0)+"%":"—"}</td>
      <td>${s.count?fmt(s.noSugarRate,0)+"%":"—"}</td>
      <td>${s.count?fmt(s.sleepRate,0)+"%":"—"}</td>
    </tr>`;
  }).join("");

  const a1pairs=buildLabLifestylePairs("hba1c",90);
  const gpairs=buildLabLifestylePairs("fasting_glucose",30);
  const crpairs=buildLabLifestylePairs("creatinine",30);

  const summaries=[];
  if(a1pairs.length>=2){
    const latest=a1pairs[a1pairs.length-1], prev=a1pairs[a1pairs.length-2];
    const delta=n(latest.lab.hba1c)-n(prev.lab.hba1c);
    summaries.push({
      cls:"corr-info",title:"HbA1c",
      strong:`${fmt(n(prev.lab.hba1c),1)} → ${fmt(n(latest.lab.hba1c),1)}%`,
      p:`最近一次 HbA1c ${delta<0?"下降":"上升或持平"}；抽血前 90 天生活紀錄共 ${latest.life.count} 天。`
    });
  } else {
    summaries.push({cls:"corr-neutral",title:"HbA1c",strong:"資料不足",p:"至少要有兩次檢驗，且每次檢驗前累積足夠生活紀錄。"});
  }

  const recent30 = lifestyleSummary(latest().date,30);
  summaries.push({
    cls:"corr-info", title:"最近檢驗前 30 天",
    strong:recent30.count?`${recent30.count} 天紀錄`:"尚無紀錄",
    p:recent30.count?`平均有氧 ${fmt(recent30.avgExercise,0)} 分/日、飯後走達標率 ${fmt(recent30.postmealRate,0)}%、無糖飲率 ${fmt(recent30.noSugarRate,0)}%。`:"開始每日記錄後，這裡會自動形成生活摘要。"
  });

  $("#correlationSummary").innerHTML=summaries.map(x=>`
    <div class="link-metric ${x.cls}">
      <h3>${x.title}</h3><strong>${x.strong}</strong><p>${x.p}</p>
    </div>`).join("");

  // HbA1c vs 90-day postmeal/no-sugar composite
  const a1x=[],a1y=[],a1labs=[];
  a1pairs.forEach(x=>{
    const score=(x.life.postmealRate+x.life.noSugarRate+x.life.sleepRate)/3;
    a1x.push(score); a1y.push(n(x.lab.hba1c)); a1labs.push(x.lab.date.slice(0,7));
  });
  drawLine($("#corrA1cChart"),a1y,a1labs);
  const ra1=correlation(a1x,a1y);
  $("#corrA1cText").innerHTML = a1pairs.length>=3
    ? `<p>生活達標綜合分數與 HbA1c 的線性相關係數約 ${fmt(ra1,2)}；${relationLabel(ra1)}。這只能做趨勢觀察，不能證明因果。</p>`
    : `<p>目前只有 ${a1pairs.length} 個可比較區間，還不足以做穩定關聯分析。繼續記錄 2–3 次抽血週期後會更有意義。</p>`;

  // fasting glucose trend with 30d summary
  const gx=[],gy=[],gl=[];
  gpairs.forEach(x=>{
    const score=(x.life.postmealRate+x.life.noSugarRate)/2;
    gx.push(score);gy.push(n(x.lab.fasting_glucose));gl.push(x.lab.date.slice(0,7));
  });
  drawLine($("#corrGlucoseChart"),gy,gl);
  const rg=correlation(gx,gy);
  $("#corrGlucoseText").innerHTML = gpairs.length>=3
    ? `<p>飯後走路＋無糖飲達標率與空腹血糖的相關係數約 ${fmt(rg,2)}；${relationLabel(rg)}。</p>`
    : `<p>目前可配對的空腹血糖區間只有 ${gpairs.length} 個，先累積每日紀錄。</p>`;

  // Weight vs fasting glucose on lab dates
  const wlabs=sorted().filter(r=>n(r.weight)!==null && n(r.fasting_glucose)!==null);
  const wv=wlabs.map(r=>n(r.weight)), gv=wlabs.map(r=>n(r.fasting_glucose)), labs2=wlabs.map(r=>r.date.slice(0,7));
  drawLine($("#corrWeightChart"),gv,labs2);
  const rw=correlation(wv,gv);
  $("#corrWeightText").innerHTML = wlabs.length>=3
    ? `<p>檢驗日體重與空腹血糖的線性相關係數約 ${fmt(rw,2)}；${relationLabel(rw)}。若每次體重都填相同數字，相關係數就沒有意義。</p>`
    : `<p>目前資料不足。之後每週記錄實際體重，這一區才會逐漸有參考價值。</p>`;

  // Kidney: show creatinine trend and hydration / exercise context
  const crv=crpairs.map(x=>n(x.lab.creatinine)), crl=crpairs.map(x=>x.lab.date.slice(0,7));
  drawLine($("#corrKidneyChart"),crv,crl);
  if(crpairs.length){
    const x=crpairs[crpairs.length-1];
    $("#corrKidneyText").innerHTML=`<p>最近一次 Creatinine ${fmt(n(x.lab.creatinine),2)} mg/dL；前 30 天共有 ${x.life.count} 天生活紀錄。腎功能受水分、飲食、運動、藥物與疾病等多因素影響，因此此區只提供背景脈絡，不做因果判定。</p>`;
  }else{
    $("#corrKidneyText").innerHTML="<p>尚無足夠生活紀錄可與腎功能配對。</p>";
  }
}

const renderBeforeCorr = render;
render = function(){
  renderBeforeCorr();
  renderCorrelation();
};

const renderDailyBeforeCorr = renderDaily;
renderDaily = function(){
  renderDailyBeforeCorr();
  renderCorrelation();
};

const renderWeeklyBeforeCorr = renderWeekly;
renderWeekly = function(){
  renderWeeklyBeforeCorr();
  renderCorrelation();
};


/* ===== V13.6 Full Labs & Automatic Report ===== */
titles.report=["健康報告","比較最近一次與歷史資料，整理下一步"];
titles.add=["新增完整檢驗","一次輸入代謝、腎臟、血脂、肝功能、尿液、血球與凝血"];

const LAB_META = {
  weight:{label:"體重",unit:"kg",digits:1,better:"down"},
  systolic_bp:{label:"收縮壓",unit:"mmHg",digits:0,better:"down"},
  diastolic_bp:{label:"舒張壓",unit:"mmHg",digits:0,better:"down"},
  fasting_glucose:{label:"空腹血糖",unit:"mg/dL",digits:0,better:"down"},
  hba1c:{label:"HbA1c",unit:"%",digits:1,better:"down"},
  creatinine:{label:"Creatinine",unit:"mg/dL",digits:2,better:"down"},
  bun:{label:"BUN",unit:"mg/dL",digits:1,better:"down"},
  egfr:{label:"eGFR",unit:"mL/min/1.73m²",digits:1,better:"up"},
  uric_acid:{label:"尿酸",unit:"mg/dL",digits:1,better:"context"},
  uacr:{label:"uACR",unit:"mg/g",digits:1,better:"down"},
  total_cholesterol:{label:"總膽固醇",unit:"mg/dL",digits:0,better:"down"},
  ldl:{label:"LDL-C",unit:"mg/dL",digits:0,better:"down"},
  hdl:{label:"HDL-C",unit:"mg/dL",digits:0,better:"up"},
  triglycerides:{label:"TG",unit:"mg/dL",digits:0,better:"down"},
  ast:{label:"AST",unit:"U/L",digits:0,better:"context"},
  alt:{label:"ALT",unit:"U/L",digits:0,better:"context"},
  ggt:{label:"γ-GT",unit:"U/L",digits:0,better:"context"},
  sodium:{label:"Na",unit:"mmol/L",digits:1,better:"context"},
  potassium:{label:"K",unit:"mmol/L",digits:1,better:"context"},
  hb:{label:"Hb",unit:"g/dL",digits:1,better:"context"},
  hct:{label:"Hct",unit:"%",digits:1,better:"context"},
  rbc:{label:"RBC",unit:"",digits:2,better:"context"},
  wbc:{label:"WBC",unit:"",digits:2,better:"context"},
  plt:{label:"PLT",unit:"",digits:0,better:"context"},
  mcv:{label:"MCV",unit:"fL",digits:1,better:"context"},
  mch:{label:"MCH",unit:"pg",digits:1,better:"context"},
  mchc:{label:"MCHC",unit:"g/dL",digits:1,better:"context"},
  pt:{label:"PT",unit:"sec",digits:1,better:"context"},
  inr:{label:"INR",unit:"",digits:2,better:"context"},
  ptt:{label:"PTT",unit:"sec",digits:1,better:"context"}
};

function statusFor(field,val){
  if(val===null) return {level:"none",text:"未檢驗"};
  switch(field){
    case "fasting_glucose":
      return val>=126?{level:"watch",text:"需醫師確認"}:val>=100?{level:"watch",text:"偏高"}:{level:"ok",text:"一般範圍"};
    case "hba1c":
      return val>=6.5?{level:"watch",text:"需醫師確認"}:val>=5.7?{level:"watch",text:"偏高"}:{level:"ok",text:"目前未達糖尿病前期門檻"};
    case "egfr":
      return val<60?{level:"watch",text:"若持續需評估"}:val<90?{level:"watch",text:"持續追蹤"}:{level:"ok",text:"較理想"};
    case "uacr":
      return val>=30?{level:"watch",text:"偏高，需追蹤"}:{level:"ok",text:"一般範圍"};
    case "systolic_bp":
      return val>=140?{level:"watch",text:"偏高"}:val>=130?{level:"watch",text:"需注意"}:{level:"ok",text:"較理想"};
    case "diastolic_bp":
      return val>=90?{level:"watch",text:"偏高"}:val>=80?{level:"watch",text:"需注意"}:{level:"ok",text:"較理想"};
    case "ldl":
      return val>=160?{level:"watch",text:"偏高"}:val>=130?{level:"watch",text:"需注意"}:{level:"ok",text:"目前較低"};
    case "triglycerides":
      return val>=200?{level:"watch",text:"偏高"}:val>=150?{level:"watch",text:"需注意"}:{level:"ok",text:"一般範圍"};
    case "hdl":
      return val<40?{level:"watch",text:"偏低"}:{level:"ok",text:"尚可"};
    case "alt":
    case "ast":
      return val>40?{level:"watch",text:"偏高"}:{level:"ok",text:"一般範圍"};
    case "sodium":
      return (val<135||val>145)?{level:"watch",text:"超出常見範圍"}:{level:"ok",text:"一般範圍"};
    case "potassium":
      return (val<3.5||val>5.1)?{level:"watch",text:"超出常見範圍"}:{level:"ok",text:"一般範圍"};
    case "hb":
      return val<13?{level:"watch",text:"男性常見下限以下"}:{level:"ok",text:"尚可"};
    case "plt":
      return (val<150||val>450)?{level:"watch",text:"需追蹤"}:{level:"ok",text:"一般範圍"};
    case "inr":
      return (val<0.8||val>1.2)?{level:"watch",text:"若未使用抗凝血藥需確認"}:{level:"ok",text:"一般範圍"};
    default:
      return {level:"neutral",text:"看趨勢"};
  }
}
function latestPrevious(field){
  const rows=sorted().filter(r=>n(r[field])!==null);
  return {latest:rows.length?rows[rows.length-1]:null, previous:rows.length>1?rows[rows.length-2]:null};
}
function changeAssessment(field, cur, prev){
  if(cur===null||prev===null) return {cls:"delta-neutral",txt:"—"};
  const meta=LAB_META[field]||{better:"context",digits:1};
  const d=cur-prev;
  if(Math.abs(d)<1e-9) return {cls:"delta-neutral",txt:"持平"};
  if(meta.better==="down") return d<0?{cls:"delta-good",txt:"↓ 改善"}:{cls:"delta-watch",txt:"↑ 上升"};
  if(meta.better==="up") return d>0?{cls:"delta-good",txt:"↑ 改善"}:{cls:"delta-watch",txt:"↓ 下降"};
  return {cls:"delta-neutral",txt:d>0?"↑ 上升":"↓ 下降"};
}
function reportText(){
  const l=latest();
  const lines=[];
  lines.push(`健康追蹤摘要｜${l.date||""}`);
  const fg=n(l.fasting_glucose),a1=n(l.hba1c),cr=n(l.creatinine),eg=n(l.egfr),w=n(l.weight);
  if(fg!==null) lines.push(`空腹血糖：${fmt(fg,0)} mg/dL`);
  if(a1!==null) lines.push(`HbA1c：${fmt(a1,1)}%`);
  if(cr!==null) lines.push(`Creatinine：${fmt(cr,2)} mg/dL`);
  if(eg!==null) lines.push(`eGFR：${fmt(eg,1)}`);
  if(w!==null) lines.push(`體重：${fmt(w,1)} kg，BMI 約 ${fmt(bmi(w),1)}`);
  lines.push("");
  lines.push("目前行動重點：");
  if(fg!==null&&fg>=100) lines.push("1. 含糖飲盡量歸零，餐後走 10–15 分鐘，主食先減約 1/4。");
  if(w!==null&&bmi(w)>=27) lines.push("2. 以 3–6 個月減重 5–7% 為階段目標。");
  if(eg!==null&&eg<90) lines.push("3. 避免高蛋白減重與大量蛋白粉，持續追蹤腎功能與尿蛋白。");
  lines.push("此摘要為健康管理用途，不取代醫師診斷與用藥調整。");
  return lines.join("\n");
}
function renderReport(){
  if(!$("#reportRoot")) return;
  const l=latest();
  $("#reportDate").textContent=l.date?`最近一次檢驗：${l.date}`:"尚無檢驗資料";

  const improved=[],watch=[],stable=[],tableRows=[];
  Object.keys(LAB_META).forEach(field=>{
    const pair=latestPrevious(field);
    if(!pair.latest) return;
    const cur=n(pair.latest[field]);
    const prev=pair.previous?n(pair.previous[field]):null;
    const meta=LAB_META[field];
    const st=statusFor(field,cur);
    const ch=changeAssessment(field,cur,prev);
    const prevText=prev===null?"—":`${fmt(prev,meta.digits)} ${meta.unit}`;
    tableRows.push(`<tr><td>${meta.label}</td><td>${fmt(cur,meta.digits)} ${meta.unit}</td><td>${prevText}</td><td class="${ch.cls}">${ch.txt}</td><td>${st.text}</td></tr>`);
    if(ch.cls==="delta-good") improved.push(`${meta.label}：${prev===null?"—":fmt(prev,meta.digits)} → ${fmt(cur,meta.digits)} ${meta.unit}`);
    if(st.level==="watch") watch.push(`${meta.label}：${fmt(cur,meta.digits)} ${meta.unit}（${st.text}）`);
    if(st.level==="ok") stable.push(`${meta.label}：${fmt(cur,meta.digits)} ${meta.unit}`);
  });
  // urine categorical
  if(l.urine_protein) (l.urine_protein==="negative"?stable:watch).push(`尿蛋白：${l.urine_protein==="negative"?"陰性":l.urine_protein}`);
  if(l.urine_blood) (l.urine_blood==="negative"?stable:watch).push(`尿潛血：${l.urine_blood==="negative"?"陰性":l.urine_blood}`);

  $("#reportImproved").innerHTML=(improved.length?improved:["目前沒有足夠前次資料可比較。"]).map(x=>`<div class="advice-item">${x}</div>`).join("");
  $("#reportWatch").innerHTML=(watch.length?watch:["目前沒有系統標記的明顯追蹤項目。"]).map(x=>`<div class="advice-item">${x}</div>`).join("");
  $("#reportStable").innerHTML=stable.slice(0,12).map(x=>`<div class="advice-item">${x}</div>`).join("")||`<div class="advice-item">資料不足。</div>`;
  $("#reportLabTable").innerHTML=tableRows.join("");

  const fg=n(l.fasting_glucose),a1=n(l.hba1c),eg=n(l.egfr),w=n(l.weight)||88, ua=n(l.uric_acid);
  const plan=[];
  if(fg!==null&&fg>=100){plan.push("未來 4–12 週先固定：含糖飲接近零、每餐後走 10–15 分鐘、主食份量先減約 1/4。");}
  if(bmi(w)>=27){plan.push(`體重先以 ${fmt(w*.93,1)}–${fmt(w*.95,1)} kg 左右作為第一階段目標。`);}
  if(eg!==null&&eg<90){plan.push("下一次複查腎功能時，最好同時確認 uACR / 尿蛋白，並避免自行高蛋白減重。");}
  if(ua!==null){plan.push("尿酸維持規律補水、避免暴飲暴食與快速減重。");}
  plan.push("檢驗複查頻率依醫師安排；若趨勢明顯惡化或出現症狀，提早就醫。");
  $("#reportPlan").innerHTML=plan.map(x=>`<div class="advice-item">${x}</div>`).join("");

  const highlights=[];
  if(fg!==null) highlights.push(`<div class="link-metric ${fg>=100?"corr-neutral":"corr-positive"}"><h3>空腹血糖</h3><strong>${fmt(fg,0)}</strong><p>${statusFor("fasting_glucose",fg).text}</p></div>`);
  if(a1!==null) highlights.push(`<div class="link-metric ${a1>=5.7?"corr-neutral":"corr-positive"}"><h3>HbA1c</h3><strong>${fmt(a1,1)}%</strong><p>${statusFor("hba1c",a1).text}</p></div>`);
  if(eg!==null) highlights.push(`<div class="link-metric ${eg<90?"corr-neutral":"corr-positive"}"><h3>eGFR</h3><strong>${fmt(eg,1)}</strong><p>${statusFor("egfr",eg).text}</p></div>`);
  highlights.push(`<div class="link-metric corr-info"><h3>體重 / BMI</h3><strong>${fmt(w,1)} / ${fmt(bmi(w),1)}</strong><p>${bmi(w)>=27?"先以 5–7% 減重為目標":"持續維持"}</p></div>`);
  $("#reportHighlights").innerHTML=highlights.join("");

  let overall="持續管理";
  if(watch.length>=4) overall="多項需追蹤";
  else if(watch.length===0) overall="目前大致穩定";
  $("#reportOverall").textContent=overall;
}
function labFormRecord(){
  const val=id=>n($(id).value);
  return {
    date:$("#fDate").value,
    weight:val("#fWeight"),
    systolic_bp:val("#fSBP"), diastolic_bp:val("#fDBP"),
    fasting_glucose:val("#fGlucose"), hba1c:val("#fA1c"),
    creatinine:val("#fCr"), bun:val("#fBun"), egfr:val("#fEgfr"), uric_acid:val("#fUric"), uacr:val("#fUacr"),
    urine_protein:$("#fUrineProtein").value||null, urine_blood:$("#fUrineBlood").value||null,
    total_cholesterol:val("#fTC"), ldl:val("#fLDL"), hdl:val("#fHDL"), triglycerides:val("#fTG"),
    ast:val("#fAST"), alt:val("#fAlt"), ggt:val("#fGGT"), sodium:val("#fNa"), potassium:val("#fK"),
    hb:val("#fHb"), hct:val("#fHct"), rbc:val("#fRBC"), wbc:val("#fWBC"), plt:val("#fPLT"),
    mcv:val("#fMCV"), mch:val("#fMCH"), mchc:val("#fMCHC"), pt:val("#fPT"), inr:val("#fINR"), ptt:val("#fPTT")
  };
}
async function saveLabV136(){
  const r=labFormRecord();
  if(!r.date){$("#saveMsg").textContent="請先選日期。";return}
  const api=localStorage.getItem("healthApiUrl")||"";
  if(api){
    try{
      await apiPost({action:"add",record:r});
      $("#saveMsg").textContent="已儲存到 Google Sheet。";
      await loadDataV133();
      renderReport();
      return;
    }catch(e){
      $("#saveMsg").textContent="Google Sheet 儲存失敗，已改存本機。";
    }
  }
  const local=JSON.parse(localStorage.getItem("healthLocalData")||JSON.stringify(SAMPLE_DATA));
  local.push(r); localStorage.setItem("healthLocalData",JSON.stringify(local)); records=local;
  render(); renderReport(); $("#saveMsg").textContent="已儲存在此裝置。";
}
function clearLabForm(){
  document.querySelectorAll("#add input").forEach(el=>{if(el.type!=="date")el.value=""});
  document.querySelectorAll("#add select").forEach(el=>el.value="");
  $("#saveMsg").textContent="";
}
const renderBeforeReport = render;
render = function(){
  renderBeforeReport();
  renderReport();
};

window.addEventListener("load",()=>{
  const s=$("#saveLabBtn");
  if(s){
    const c=s.cloneNode(true); s.replaceWith(c); c.addEventListener("click",saveLabV136);
  }
  const clr=$("#clearLabBtn"); if(clr) clr.addEventListener("click",clearLabForm);
  const pr=$("#printReportBtn"); if(pr) pr.addEventListener("click",()=>window.print());
  const cp=$("#copyReportBtn"); if(cp) cp.addEventListener("click",async()=>{
    try{await navigator.clipboard.writeText(reportText());cp.textContent="已複製";setTimeout(()=>cp.textContent="複製文字摘要",1500)}
    catch(e){alert(reportText())}
  });
  renderReport();
});


/* ===== V13.7 Stable + Xiaomi / Apple Health Bridge ===== */
titles.wearable=["小米手錶","活動量、睡眠與心率透過 Apple Health / 捷徑同步"];

let wearableRecords=[];

function wearableLatest(){
  const s=[...wearableRecords].sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  return s[s.length-1]||{};
}
function wearableMetric(label,value,unit){
  return `<article class="metric"><span>${label}</span><strong>${value}</strong><small>${unit}</small></article>`;
}
async function loadWearable(){
  const api=localStorage.getItem("healthApiUrl")||"";
  if(!api){
    wearableRecords=JSON.parse(localStorage.getItem("wearableLocalData")||"[]");
    renderWearable();
    return;
  }
  try{
    const d=await apiGet("wearable_list");
    wearableRecords=Array.isArray(d.records)?d.records:[];
    localStorage.setItem("wearableLocalData",JSON.stringify(wearableRecords));
    renderWearable();
  }catch(e){
    wearableRecords=JSON.parse(localStorage.getItem("wearableLocalData")||"[]");
    renderWearable();
  }
}
function renderWearable(){
  if(!$("#wearableMetrics")) return;
  const l=wearableLatest();
  $("#wearableMetrics").innerHTML =
    wearableMetric("步數",l.steps?Number(l.steps).toLocaleString():"—","steps")+
    wearableMetric("平均心率",fmt(n(l.avg_hr),0),"bpm")+
    wearableMetric("靜息心率",fmt(n(l.resting_hr),0),"bpm")+
    wearableMetric("睡眠",fmt(n(l.sleep_hours),1),"小時")+
    wearableMetric("血氧",fmt(n(l.spo2),1),"%")+
    wearableMetric("活動熱量",fmt(n(l.active_calories),0),"kcal");

  const api=localStorage.getItem("healthApiUrl")||"";
  const badge=$("#wearableSyncBadge");
  if(l.date){
    badge.textContent=`最新：${l.date}`;
    badge.className="report-overall "+(api?"wearable-ok":"wearable-local");
  }else{
    badge.textContent="尚未同步";
    badge.className="report-overall wearable-local";
  }

  const last14=[...wearableRecords].sort((a,b)=>String(a.date).localeCompare(String(b.date))).slice(-14);
  drawLine($("#wearableStepsChart"),last14.map(x=>Number(x.steps)||0),last14.map(x=>String(x.date).slice(5)),{min:0});
  drawLine($("#wearableSleepChart"),last14.map(x=>Number(x.sleep_hours)||0),last14.map(x=>String(x.date).slice(5)),{min:0,max:10});
}
async function saveWearableTest(){
  const rec={
    date:$("#wDate").value,
    steps:n($("#wSteps").value),
    avg_hr:n($("#wAvgHr").value),
    resting_hr:n($("#wRestHr").value),
    spo2:n($("#wSpo2").value),
    sleep_hours:n($("#wSleep").value),
    active_calories:n($("#wCalories").value),
    distance_km:n($("#wDistance").value),
    source:"manual_test"
  };
  if(!rec.date){$("#wearableMsg").textContent="請先選日期。";return}
  const api=localStorage.getItem("healthApiUrl")||"";
  if(api){
    try{
      await apiPost({action:"wearable_upsert",record:rec});
      $("#wearableMsg").textContent="已寫入 Google Sheet wearable_daily。";
      await loadWearable();
      return;
    }catch(e){
      $("#wearableMsg").textContent="雲端寫入失敗，先存本機："+e.message;
    }
  }
  const local=JSON.parse(localStorage.getItem("wearableLocalData")||"[]").filter(x=>x.date!==rec.date);
  local.push(rec);local.sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  localStorage.setItem("wearableLocalData",JSON.stringify(local));wearableRecords=local;renderWearable();
  $("#wearableMsg").textContent="已存本機。設定 Apps Script 後可同步雲端。";
}

const oldLoadDataV137 = (typeof loadDataV133==="function") ? loadDataV133 : null;
if(oldLoadDataV137){
  loadDataV133 = async function(){
    await oldLoadDataV137();
    await loadWearable();
  };
}
const oldRenderV137 = render;
render = function(){
  oldRenderV137();
  renderWearable();
};

window.addEventListener("load",()=>{
  if($("#wDate")) $("#wDate").value=new Date().toISOString().slice(0,10);
  const sw=$("#saveWearableBtn"); if(sw) sw.addEventListener("click",saveWearableTest);
  const rw=$("#refreshWearableBtn"); if(rw) rw.addEventListener("click",loadWearable);
  // V13.9.1: wearable data is loaded by the unified startup to avoid duplicate requests.
});


/* ===== V13.8 Xiaomi Smart Band 7 Tailored ===== */
titles.wearable=["小米手環 7・Zepp Life","由 Zepp Life 經 Apple Health 同步可用的健康資料"];

function bandAvg(field, days=14){
  const s=[...wearableRecords].sort((a,b)=>String(a.date).localeCompare(String(b.date))).slice(-days);
  const vals=s.map(x=>n(x[field])).filter(v=>v!==null);
  return vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:null;
}
function renderBandHealthLink(){
  if(!$("#bandHealthLink")) return;
  const avgSteps=bandAvg("steps"), avgSleep=bandAvg("sleep_hours"), avgRest=bandAvg("resting_hr"), avgSpo2=bandAvg("spo2");
  const l=latest(), fg=n(l.fasting_glucose), B=bmi(n(l.weight)||88);
  const items=[];
  if(avgSteps!==null){
    items.push(`近 14 天平均步數約 ${fmt(avgSteps,0)} 步/日。${avgSteps<6000?"目前活動量還有增加空間，可先多 1,000–1,500 步/日。":"目前日常活動量不錯，持續維持。"}`);
  }
  if(avgSleep!==null){
    items.push(`近 14 天平均睡眠 ${fmt(avgSleep,1)} 小時。${avgSleep<7?"睡眠仍低於目前目標，優先固定上床時間。":"睡眠時數達到目前設定目標。"}`);
  }
  if(avgRest!==null){
    items.push(`近 14 天平均靜息心率約 ${fmt(avgRest,0)} bpm。主要看個人長期基準與明顯變化，不以單次高低作診斷。`);
  }
  if(avgSpo2!==null){
    items.push(`近 14 天平均血氧約 ${fmt(avgSpo2,1)}%。手環血氧適合看趨勢，若出現症狀或持續異常需用醫療方式確認。`);
  }
  if(fg!==null && fg>=100){
    items.push("因空腹血糖長期偏高，系統會把步數、運動分鐘與餐後活動放在較高優先序。");
  }
  if(B>=27){
    items.push("因 BMI 偏高，會把每日步數、活動熱量與體重一起看，避免只追求一次大量運動。");
  }
  $("#bandHealthLink").innerHTML=items.map(x=>`<div class="advice-item">${x}</div>`).join("")||`<div class="advice-item">先累積 7–14 天手環資料後，這裡會開始產生個人化分析。</div>`;
}
function renderWearableV138(){
  if(!$("#wearableMetrics")) return;
  const l=wearableLatest();
  $("#wearableMetrics").innerHTML =
    wearableMetric("步數",l.steps?Number(l.steps).toLocaleString():"—","steps")+
    wearableMetric("活動熱量",fmt(n(l.active_calories),0),"kcal")+
    wearableMetric("睡眠",fmt(n(l.sleep_hours),1),"小時")+
    wearableMetric("靜息心率",fmt(n(l.resting_hr),0),"bpm")+
    wearableMetric("平均血氧",fmt(n(l.spo2),1),"%")+
    wearableMetric("運動",fmt(n(l.exercise_minutes),0),"分鐘");

  const api=localStorage.getItem("healthApiUrl")||"";
  const badge=$("#wearableSyncBadge");
  if(l.date){
    badge.textContent=`最新：${l.date}`;
    badge.className="report-overall "+(api?"wearable-ok":"wearable-local");
  }else{
    badge.textContent="尚未同步";
    badge.className="report-overall wearable-local";
  }

  const last14=[...wearableRecords].sort((a,b)=>String(a.date).localeCompare(String(b.date))).slice(-14);
  const labs=last14.map(x=>String(x.date).slice(5));
  drawLine($("#wearableStepsChart"),last14.map(x=>Number(x.steps)||0),labs,{min:0});
  drawLine($("#wearableCaloriesChart"),last14.map(x=>Number(x.active_calories)||0),labs,{min:0});
  drawLine($("#wearableSleepChart"),last14.map(x=>Number(x.sleep_hours)||0),labs,{min:0,max:10});
  drawLine($("#wearableHrChart"),last14.map(x=>Number(x.resting_hr)||0),labs,{min:40,max:110});
  drawLine($("#wearableSpo2Chart"),last14.map(x=>Number(x.spo2)||0),labs,{min:85,max:100});

  const avgSleep=bandAvg("sleep_hours");
  const avgDeep=bandAvg("deep_sleep_hours");
  const avgRem=bandAvg("rem_sleep_hours");
  $("#sleepSummary").innerHTML=`
    <div class="band-score"><span>平均總睡眠</span><b>${fmt(avgSleep,1)} 小時</b></div>
    <div class="band-score"><span>平均深睡</span><b>${fmt(avgDeep,1)} 小時</b></div>
    <div class="band-score"><span>平均 REM</span><b>${fmt(avgRem,1)} 小時</b></div>`;
  renderBandHealthLink();
}

async function saveWearableV138(){
  const rec={
    date:$("#wDate").value,
    steps:n($("#wSteps").value),
    distance_km:n($("#wDistance").value),
    active_calories:n($("#wCalories").value),
    exercise_minutes:n($("#wExerciseMinutes").value),
    avg_hr:n($("#wAvgHr").value),
    resting_hr:n($("#wRestHr").value),
    spo2:n($("#wSpo2").value),
    sleep_hours:n($("#wSleep").value),
    deep_sleep_hours:n($("#wDeepSleep").value),
    rem_sleep_hours:n($("#wRemSleep").value),
    min_spo2:n($("#wMinSpo2").value),
    source:"zepp_life_apple_health"
  };
  if(!rec.date){$("#wearableMsg").textContent="請先選日期。";return}
  const api=localStorage.getItem("healthApiUrl")||"";
  if(api){
    try{
      await apiPost({action:"wearable_upsert",record:rec});
      $("#wearableMsg").textContent="已寫入 Google Sheet wearable_daily。";
      await loadWearable();
      return;
    }catch(e){
      $("#wearableMsg").textContent="雲端寫入失敗，先存本機："+e.message;
    }
  }
  const local=JSON.parse(localStorage.getItem("wearableLocalData")||"[]").filter(x=>x.date!==rec.date);
  local.push(rec);local.sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  localStorage.setItem("wearableLocalData",JSON.stringify(local));
  wearableRecords=local;
  renderWearableV138();
  $("#wearableMsg").textContent="已存本機。";
}

renderWearable = renderWearableV138;

window.addEventListener("load",()=>{
  const old=$("#saveWearableBtn");
  if(old){
    const c=old.cloneNode(true);
    old.replaceWith(c);
    c.addEventListener("click",saveWearableV138);
  }
});


/* ===== V13.9 Zepp Life Sync ===== */
function zeppFieldStatus(){
  const l=wearableLatest();
  const fields=[
    ["步數","steps"],
    ["距離","distance_km"],
    ["活動熱量","active_calories"],
    ["運動分鐘","exercise_minutes"],
    ["平均心率","avg_hr"],
    ["靜息心率","resting_hr"],
    ["血氧","spo2"],
    ["睡眠總時數","sleep_hours"],
    ["深睡","deep_sleep_hours"],
    ["REM","rem_sleep_hours"]
  ];
  return fields.map(([label,key])=>({
    label,key,available:n(l[key])!==null
  }));
}

const renderWearableBeforeZepp = renderWearable;
renderWearable = function(){
  renderWearableBeforeZepp();
  if(!$("#bandHealthLink")) return;

  const statuses=zeppFieldStatus();
  const available=statuses.filter(x=>x.available).map(x=>x.label);
  const missing=statuses.filter(x=>!x.available).map(x=>x.label);

  const extra=[];
  extra.push(`<div class="advice-item"><span class="source-tag">資料來源</span> Zepp Life → Apple Health</div>`);
  if(available.length){
    extra.push(`<div class="advice-item"><b>目前已收到：</b>${available.join("、")}</div>`);
  }
  if(missing.length){
    extra.push(`<div class="advice-item"><b>目前未收到：</b>${missing.join("、")}。若 Apple Health 本身沒有資料，系統會保持空白，不自行估算。</div>`);
  }
  $("#bandHealthLink").innerHTML += extra.join("");
};

async function testZeppBridge(){
  const api=localStorage.getItem("healthApiUrl")||"";
  if(!api){return {ok:false,msg:"尚未設定 Apps Script"}}
  try{
    const ping=await apiGet("ping");
    const wear=await apiGet("wearable_list");
    return {ok:true,msg:`Apps Script ${ping.version||""} 可連線；wearable_daily 目前 ${Array.isArray(wear.records)?wear.records.length:0} 筆。`};
  }catch(e){
    return {ok:false,msg:"Zepp Life 橋接接收端測試失敗："+e.message};
  }
}

window.addEventListener("load",()=>{
  const card = document.querySelector("#wearable article.card");
  if(card && !document.querySelector("#zeppBridgeTestBtn")){
    const box=document.createElement("div");
    box.className="form-actions";
    box.innerHTML='<button id="zeppBridgeTestBtn" class="secondary-btn">測試 Zepp Life 橋接接收端</button><span id="zeppBridgeMsg" class="small"></span>';
    card.appendChild(box);
    document.querySelector("#zeppBridgeTestBtn").addEventListener("click",async()=>{
      const btn=document.querySelector("#zeppBridgeTestBtn");
      btn.disabled=true;
      document.querySelector("#zeppBridgeMsg").textContent="測試中…";
      const r=await testZeppBridge();
      document.querySelector("#zeppBridgeMsg").textContent=r.msg;
      btn.disabled=false;
    });
  }
});


/* ===== V13.9.1 Unified Startup ===== */
window.addEventListener("load", async ()=>{
  try{
    if(typeof loadDataV133 === "function"){
      await loadDataV133();
    }else if(typeof loadData === "function"){
      await loadData();
      if(typeof loadWearable === "function") await loadWearable();
    }
  }catch(e){
    console.error("V13.9.1 startup error", e);
    const el=document.querySelector("#syncStatus");
    if(el) el.textContent="啟動時發生錯誤・請重新整理";
  }
});
