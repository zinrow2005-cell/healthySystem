const SAMPLE_DATA = [];
const HEIGHT_M=1.74;
let records=[];
let trendRangeDays="all", weightRangeDays="all";
let lastSyncAt=null;

const $=s=>document.querySelector(s);
const n=v=>v===null||v===undefined||v===""?null:Number(v);
const fmt=(v,d=1)=>v===null||v===undefined||Number.isNaN(Number(v))?"—":Number(v).toFixed(d).replace(/\.0$/,"");
const bmi=w=>w? w/(HEIGHT_M*HEIGHT_M):null;
const TZ="Asia/Taipei";
function dateKey(raw){
  if(!raw) return "";
  const s=String(raw);
  if(/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d=new Date(s);
  if(Number.isNaN(d.getTime())) return s.slice(0,10);
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone:TZ,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(d);
  const o=Object.fromEntries(parts.map(p=>[p.type,p.value]));
  return `${o.year}-${o.month}-${o.day}`;
}
function displayDate(raw, short=false){
  const k=dateKey(raw);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(k)) return String(raw||"—");
  const [y,m,d]=k.split("-");
  return short ? `${m}/${d}` : `${y}/${m}/${d}`;
}
function recordsInRange(field,days="all"){
  const all=sorted().filter(r=>n(r[field])!==null);
  if(days==="all"||!all.length) return all;
  const lastKey=dateKey(all[all.length-1].date);
  const lastDate=new Date(lastKey+"T00:00:00+08:00");
  const cutoff=new Date(lastDate.getTime()-Number(days)*86400000);
  return all.filter(r=>new Date(dateKey(r.date)+"T00:00:00+08:00")>=cutoff);
}
function seriesFor(field,days="all"){
  const rows=recordsInRange(field,days);
  return {
    values:rows.map(r=>n(r[field])),
    short:rows.map(r=>displayDate(r.date,true)),
    full:rows.map(r=>displayDate(r.date,false)),
    dates:rows.map(r=>dateKey(r.date))
  };
}
function compareText(vals,i,unit=""){
  if(i<=0||i>=vals.length)return "第一筆紀錄";
  const d=vals[i]-vals[i-1];
  if(Math.abs(d)<1e-9)return "與前次相同";
  return `較前次 ${d>0?"+":""}${fmt(d,2)}${unit?" "+unit:""}`;
}

const titles={
  dashboard:["健康總覽","長期趨勢優先，不只看單次紅字"],
  weightlog:["體重紀錄","定期記錄體重並自動計算 BMI 與趨勢"],
  trends:["趨勢分析","血糖、腎功能、尿酸與體重分開追蹤"],
  intelligence:["健康智慧","依最新值、趨勢與組合規則產生不同分析與建議"],
  alerts:["異常提醒","紅黃綠燈提示需要追蹤的健康項目"],
  lifestyle:["健康建議","依目前檢驗與體重提供飲食、運動與作息建議"],
  report:["健康報告","比較最近一次與歷史資料，整理下一步"],
  labs:["全部檢驗","查看歷次健康與檢驗資料"],
  add:["新增檢驗","常用整批、資料庫搜尋與未知檢驗都從這裡輸入"],
  settings:["資料連線","Google Sheet + Apps Script"],
  more:["更多","異常提醒、健康建議、報告、檢驗與設定"]
};

function sorted(){
  return [...records].filter(r=>r&&r.date).sort((a,b)=>dateKey(a.date).localeCompare(dateKey(b.date)));
}
function latest(){
  const s=sorted(); return s[s.length-1]||{};
}

function latestNonNull(field){
  const a=sorted().filter(r=>n(r[field])!==null);
  return a.length ? n(a[a.length-1][field]) : null;
}
function latestNonNullRecord(field){
  const a=sorted().filter(r=>n(r[field])!==null);
  return a.length ? a[a.length-1] : null;
}
function latestLabRecord(){
  const labFields=["fasting_glucose","hba1c","creatinine","bun","egfr","uric_acid","uacr","total_cholesterol","ldl","hdl","triglycerides","ast","alt","ggt","sodium","potassium","hb","hct","rbc","wbc","plt","mcv","mch","mchc","pt","inr","ptt","systolic_bp","diastolic_bp"];
  const a=sorted().filter(r=>labFields.some(f=>n(r[f])!==null));
  return a.length ? a[a.length-1] : {};
}
function values(field){
  return sorted().filter(r=>n(r[field])!==null).map(r=>n(r[field]));
}
function labels(field){
  return sorted().filter(r=>n(r[field])!==null).map(r=>displayDate(r.date,true));
}
function fullLabels(field){
  return sorted().filter(r=>n(r[field])!==null).map(r=>displayDate(r.date,false));
}
function previousValue(field){
  const a=sorted().filter(r=>n(r[field])!==null);
  return a.length>1 ? a[a.length-2] : null;
}
function latestValue(field){
  const a=sorted().filter(r=>n(r[field])!==null);
  return a.length ? a[a.length-1] : null;
}

function drawLine(canvas, vals, labs, opts={}){
  if(!canvas) return;
  canvas.__chartState={
    vals:[...vals],
    labs:[...labs],
    fullLabels:opts.fullLabels||labs,
    unit:opts.unit||"",
    selected:canvas.__chartState?.selected ?? null,
    hover:null,
    min:opts.min,
    max:opts.max
  };
  if(!canvas.__interactiveBound){
    canvas.__interactiveBound=true;
    canvas.style.touchAction="pan-y";
    canvas.addEventListener("pointermove",e=>{
      if(e.pointerType==="touch") return;
      selectNearestChartPoint(canvas,e,false);
    });
    canvas.addEventListener("pointerleave",()=>{
      if(!canvas.__chartState) return;
      canvas.__chartState.hover=null;
      renderInteractiveLine(canvas);
    });
    canvas.addEventListener("pointerdown",e=>{
      selectNearestChartPoint(canvas,e,true);
    });
  }
  renderInteractiveLine(canvas);
}
function selectNearestChartPoint(canvas,e,persist){
  const s=canvas.__chartState;
  if(!s||!s.vals.length||!s.points?.length) return;
  const rect=canvas.getBoundingClientRect();
  const x=e.clientX-rect.left, y=e.clientY-rect.top;
  let best=0,dist=Infinity;
  s.points.forEach((p,i)=>{
    const d=(p.x-x)*(p.x-x)+(p.y-y)*(p.y-y);
    if(d<dist){dist=d;best=i}
  });
  if(persist) s.selected=best;
  else s.hover=best;
  renderInteractiveLine(canvas);
}
function renderInteractiveLine(canvas){
  const s=canvas.__chartState;if(!s)return;
  const rect=canvas.getBoundingClientRect();
  const ratio=window.devicePixelRatio||1;
  const w=Math.max(300,rect.width||600),h=Math.max(190,rect.height||260);
  canvas.width=w*ratio;canvas.height=h*ratio;
  const ctx=canvas.getContext("2d");ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,w,h);
  const vals=s.vals,labs=s.labs;
  if(!vals.length){ctx.fillStyle="#6b7478";ctx.font="14px sans-serif";ctx.fillText("尚無資料",20,32);s.points=[];return}
  const pad={l:52,r:20,t:24,b:46};
  let min=Math.min(...vals),max=Math.max(...vals);
  if(s.min!==undefined)min=Math.min(min,s.min);
  if(s.max!==undefined)max=Math.max(max,s.max);
  if(max===min){max+=1;min-=1}
  const span=max-min,lo=min-span*.15,hi=max+span*.15;
  ctx.strokeStyle="#d9e1e3";ctx.lineWidth=1;
  for(let i=0;i<4;i++){const y=pad.t+(h-pad.t-pad.b)*i/3;ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(w-pad.r,y);ctx.stroke()}
  ctx.fillStyle="#6b7478";ctx.font="12px sans-serif";
  for(let i=0;i<4;i++){const v=hi-(hi-lo)*i/3,y=pad.t+(h-pad.t-pad.b)*i/3;ctx.fillText(fmt(v,1),5,y+4)}
  const xAt=i=>pad.l+(w-pad.l-pad.r)*(vals.length===1?.5:i/(vals.length-1));
  const yAt=v=>pad.t+(hi-v)/(hi-lo)*(h-pad.t-pad.b);
  s.points=vals.map((v,i)=>({x:xAt(i),y:yAt(v)}));
  ctx.strokeStyle="#0f766e";ctx.lineWidth=3;ctx.lineJoin="round";ctx.lineCap="round";ctx.beginPath();
  s.points.forEach((p,i)=>{i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y)});ctx.stroke();

  const active=s.hover!==null?s.hover:s.selected;
  s.points.forEach((p,i)=>{
    ctx.beginPath();ctx.arc(p.x,p.y,i===active?6:4,0,Math.PI*2);
    ctx.fillStyle=i===active?"#115e59":"#0f766e";ctx.fill();
    if(i===active){ctx.strokeStyle="#ffffff";ctx.lineWidth=2;ctx.stroke()}
  });

  ctx.fillStyle="#6b7478";ctx.font="12px sans-serif";ctx.textAlign="center";
  labs.forEach((lab,i)=>{if(i===0||i===labs.length-1||labs.length<=6)ctx.fillText(lab,xAt(i),h-16)});
  ctx.textAlign="left";

  if(active!==null && active>=0 && active<vals.length){
    const p=s.points[active],date=s.fullLabels[active]||labs[active]||"",value=`${fmt(vals[active],2)}${s.unit?" "+s.unit:""}`,cmp=compareText(vals,active,s.unit);
    ctx.font="13px sans-serif";
    const line1=date,line2=value;
    const tw=Math.max(ctx.measureText(line1).width,ctx.measureText(line2).width,ctx.measureText(cmp).width)+24,th=72;
    let tx=p.x+12,ty=p.y-th-10;
    if(tx+tw>w-8)tx=p.x-tw-12;
    if(tx<8)tx=8;if(ty<8)ty=p.y+12;
    ctx.fillStyle="rgba(17,24,39,.92)";
    ctx.beginPath();
    if(ctx.roundRect)ctx.roundRect(tx,ty,tw,th,9);else ctx.rect(tx,ty,tw,th);
    ctx.fill();
    ctx.fillStyle="#fff";ctx.font="12px sans-serif";ctx.fillText(line1,tx+12,ty+20);
    ctx.font="bold 14px sans-serif";ctx.fillText(line2,tx+12,ty+40);ctx.font="11px sans-serif";ctx.fillStyle="#d1d5db";ctx.fillText(cmp,tx+12,ty+60);
  }
}
function statusFor(field,val){
  if(val===null) return {level:"none",text:"未檢驗"};
  switch(field){
    case "fasting_glucose": return val>=126?{level:"watch",text:"需醫師確認"}:val>=100?{level:"watch",text:"偏高"}:{level:"ok",text:"一般範圍"};
    case "hba1c": return val>=6.5?{level:"watch",text:"需醫師確認"}:val>=5.7?{level:"watch",text:"偏高"}:{level:"ok",text:"目前未達糖尿病前期門檻"};
    case "egfr": return val<60?{level:"watch",text:"若持續需評估"}:val<90?{level:"watch",text:"持續追蹤"}:{level:"ok",text:"較理想"};
    case "uacr": return val>=30?{level:"watch",text:"偏高"}:{level:"ok",text:"一般範圍"};
    case "systolic_bp": return val>=140?{level:"watch",text:"偏高"}:val>=130?{level:"watch",text:"需注意"}:{level:"ok",text:"較理想"};
    case "diastolic_bp": return val>=90?{level:"watch",text:"偏高"}:val>=80?{level:"watch",text:"需注意"}:{level:"ok",text:"較理想"};
    case "ldl": return val>=160?{level:"watch",text:"偏高"}:val>=130?{level:"watch",text:"需注意"}:{level:"ok",text:"目前較低"};
    case "triglycerides": return val>=200?{level:"watch",text:"偏高"}:val>=150?{level:"watch",text:"需注意"}:{level:"ok",text:"一般範圍"};
    case "hdl": return val<40?{level:"watch",text:"偏低"}:{level:"ok",text:"尚可"};
    case "alt": case "ast": return val>40?{level:"watch",text:"偏高"}:{level:"ok",text:"一般範圍"};
    case "sodium": return (val<135||val>145)?{level:"watch",text:"超出常見範圍"}:{level:"ok",text:"一般範圍"};
    case "potassium": return (val<3.5||val>5.1)?{level:"watch",text:"超出常見範圍"}:{level:"ok",text:"一般範圍"};
    case "hb": return val<13?{level:"watch",text:"偏低"}:{level:"ok",text:"尚可"};
    case "plt": return (val<150||val>450)?{level:"watch",text:"需追蹤"}:{level:"ok",text:"一般範圍"};
    default: return {level:"neutral",text:"看趨勢"};
  }
}

function renderDashboard(){
  const l=latestLabRecord(), w=latestNonNull("weight"), B=bmi(w);
  const metric=(label,value,unit,status="")=>`<article class="metric ${status}"><span>${label}</span><strong>${value}</strong><small>${unit}</small></article>`;
  $("#metricGrid").innerHTML=
    metric("體重",fmt(w,1),"kg")+
    metric("BMI",fmt(B,1),B>=27?"偏高":"")+
    metric("空腹血糖",fmt(latestNonNull("fasting_glucose"),0),"mg/dL","warn")+
    metric("HbA1c",fmt(latestNonNull("hba1c"),1),"%")+
    metric("Creatinine",fmt(latestNonNull("creatinine"),2),"mg/dL","caution")+
    metric("eGFR",fmt(latestNonNull("egfr"),1),"mL/min/1.73m²","caution");

  const pri=[];
  if(latestNonNull("fasting_glucose")>=100) pri.push(["優先管理","空腹血糖長期偏高：先從含糖飲、精緻澱粉與體重管理著手。","orange"]);
  if(B>=27) pri.push(["第二優先","體重偏高：先以 3–6 個月減少 5–7% 為階段目標。","yellow"]);
  if(latestNonNull("egfr")!==null&&latestNonNull("egfr")<90) pri.push(["持續追蹤","腎功能較前次改善，但仍應搭配 Creatinine、eGFR 與尿蛋白 / uACR 追蹤。","yellow"]);
  pri.push(["目前穩定","血球、凝血、電解質與 ALT 目前沒有明顯警訊。","green"]);
  $("#priorityList").innerHTML=pri.map(x=>`<div class="status-row ${x[2]}"><b>${x[0]}</b><span>${x[1]}</span></div>`).join("");

  const changes=[];
  [["creatinine","Creatinine",2],["egfr","eGFR",1],["fasting_glucose","空腹血糖",0],["hba1c","HbA1c",1]].forEach(([f,label,d])=>{
    const p=previousValue(f), c=latestValue(f);
    if(!p||!c) return;
    const a=n(p[f]),b=n(c[f]),cls=b<a?"value-down":b>a?"value-up":"value-neutral";
    changes.push(`<div class="trend"><span>${label}</span><b class="${cls}">${fmt(a,d)} → ${fmt(b,d)}</b><small>${displayDate(p.date)} → ${displayDate(c.date)}</small></div>`);
  });
  $("#changeList").innerHTML=changes.join("")||"<p>資料不足。</p>";

  $("#goalGrid").innerHTML=`
    <div><b>體重</b><span>先以 3–6 個月減少 5–7% 體重為階段目標，重點是緩慢且可持續。</span></div>
    <div><b>血糖</b><span>持續追蹤空腹血糖與 HbA1c，優先減少精緻澱粉與含糖飲。</span></div>
    <div><b>腎功能</b><span>持續追蹤 Creatinine、eGFR、BUN 與尿蛋白 / uACR。</span></div>
    <div><b>尿酸</b><span>避免暴飲暴食、脫水與快速減重，配合醫師用藥與追蹤。</span></div>`;

  drawLine($("#chartGlucose"),values("fasting_glucose"),labels("fasting_glucose"),{fullLabels:fullLabels("fasting_glucose"),unit:"mg/dL"});
  drawLine($("#chartKidney"),values("creatinine"),labels("creatinine"),{fullLabels:fullLabels("creatinine"),unit:"mg/dL"});
}

function renderTrends(){
  const configs=[
    ["trendGlucose","fasting_glucose","trendGlucoseText","mg/dL"],
    ["trendA1c","hba1c","trendA1cText","%"],
    ["trendCr","creatinine","trendCrText","mg/dL"],
    ["trendEgfr","egfr","trendEgfrText",""],
    ["trendUric","uric_acid","trendUricText","mg/dL"],
    ["trendWeight","weight","trendWeightText","kg"]
  ];
  configs.forEach(([cid,f,tid,unit])=>{
    const s=seriesFor(f,trendRangeDays), vals=s.values; drawLine($("#"+cid),vals,s.short,{fullLabels:s.full,unit});
    if(vals.length>=2){
      const a=vals[vals.length-2],b=vals[vals.length-1];
      $("#"+tid).innerHTML=`<p>最近：${fmt(a,2)} → ${fmt(b,2)} ${unit}，${b<a?"下降":b>a?"上升":"持平"}。</p>`;
    }else $("#"+tid).innerHTML="<p>資料不足。</p>";
  });
}

function renderAlerts(){
  const l=latestLabRecord(), w=latestNonNull("weight"), B=bmi(w);
  const cards=[];
  const add=(title,val,field,display)=>{if(val===null)return;const st=statusFor(field,val);cards.push(`<div class="alert-card ${st.level==="watch"?"yellow":"green"}"><h3>${title}</h3><p><b>${display}</b><br>${st.text}</p></div>`)};
  add("空腹血糖",latestNonNull("fasting_glucose"),"fasting_glucose",`${fmt(latestNonNull("fasting_glucose"),0)} mg/dL`);
  add("HbA1c",latestNonNull("hba1c"),"hba1c",`${fmt(latestNonNull("hba1c"),1)}%`);
  add("eGFR",latestNonNull("egfr"),"egfr",fmt(latestNonNull("egfr"),1));
  cards.push(`<div class="alert-card ${B>=27?"yellow":"green"}"><h3>BMI</h3><p><b>${fmt(B,1)}</b><br>${B>=27?"目前偏高，先以 5–7% 減重為目標":"目前較理想"}</p></div>`);
  $("#alertCards").innerHTML=cards.join("");

  const flags=[
    "若空腹血糖不同日重複達到或超過 126 mg/dL，應由醫師進一步確認。",
    "若 eGFR 明顯持續下降、Creatinine 持續上升，或出現蛋白尿、血尿、水腫、尿量改變，應提早回診。",
    "若出現胸痛、呼吸困難、意識改變等急性症狀，應立即就醫。"
  ];
  $("#doctorFlags").innerHTML=flags.map(x=>`<div class="advice-item">${x}</div>`).join("");
}

function renderLifestyle(){
  const l=latest(), w=n(l.weight), B=bmi(w), diet=[];
  if(latestNonNull("fasting_glucose")>=100){
    diet.push("每餐把白飯、麵、稀飯等精緻澱粉先減少約 1/4，優先選較高纖來源。");
    diet.push("含糖飲、果汁與加糖咖啡盡量歸零；水果吃完整水果，不以果汁取代。");
    diet.push("用餐順序可改成蔬菜 → 蛋白質 → 主食，並避免單餐大量澱粉。");
  }
  if(B>=27) diet.push("先設定 3–6 個月減少 5–7% 體重，不採快速減重。");
  if(latestNonNull("egfr")!==null&&latestNonNull("egfr")<90){
    diet.push("避免自行採高蛋白減重法或大量蛋白粉；蛋白質以一般份量平均分配。");
    diet.push("少濃湯、加工肉、醃漬物與重鹹醬料，對血壓與腎臟較有利。");
  }
  diet.push("尿酸管理避免大量內臟、濃肉湯、啤酒、暴飲暴食與脫水；快速減重也可能造成尿酸波動。");
  $("#dietAdvice").innerHTML=`<div class="advice-list">${diet.map(x=>`<div class="advice-item">${x}</div>`).join("")}</div>`;

  const ex=[
    "每週累積至少 150 分鐘中等強度有氧，優先選快走、固定式腳踏車等容易長期維持的活動。",
    "每週至少 2 次肌力訓練；若左手肘仍有限制，先避開需要左手承重、推拉或高負荷的動作。",
    "運動量逐週增加，不需要一次追求高強度；痛風急性發作或術後疼痛加劇時先降低強度。"
  ];
  $("#exerciseAdvice").innerHTML=`<div class="advice-list">${ex.map(x=>`<div class="advice-item">${x}</div>`).join("")}</div>`;

  const sl=[
    "睡眠目標 7–9 小時，並盡量固定就寢與起床時間。",
    "晚餐避免太晚、太飽；睡前 2–3 小時避免大量進食。",
    "炎熱、流汗或運動日規律補水，避免脫水；若醫師有特殊限水指示則以醫囑為準。",
    "每週固定 2–3 次量體重，觀察週平均，不追逐單日波動。"
  ];
  $("#sleepAdvice").innerHTML=`<div class="advice-list">${sl.map(x=>`<div class="advice-item">${x}</div>`).join("")}</div>`;

  $("#actionAdvice").innerHTML=`<div class="advice-list">
    <div class="advice-item"><b>第一優先：</b>把含糖飲降到接近零。</div>
    <div class="advice-item"><b>第二優先：</b>每餐主食先減少約 1/4。</div>
    <div class="advice-item"><b>第三優先：</b>維持規律運動與睡眠。</div>
    <div class="advice-item"><b>第四優先：</b>以目前體重的 5–7% 作為第一階段減重目標。</div>
  </div>`;
}

function weightRows(){
  return sorted().filter(r=>n(r.weight)!==null).map(r=>({date:dateKey(r.date),weight:n(r.weight)}));
}
function renderWeightLog(){
  const rows=weightRows(), rev=[...rows].reverse();
  $("#weightLogBody").innerHTML=rev.map((r,idx)=>{
    const prev=rev[idx+1],d=prev?r.weight-prev.weight:null,cls=d===null?"delta-neutral":d<0?"delta-good":d>0?"delta-watch":"delta-neutral";
    return `<tr><td>${displayDate(r.date)}</td><td>${fmt(r.weight,1)} kg</td><td>${fmt(bmi(r.weight),1)}</td><td class="${cls}">${d===null?"—":`${d>0?"+":""}${fmt(d,1)} kg`}</td><td><div class="table-action"><button class="edit-weight" data-date="${dateKey(r.date)}">編輯</button><button class="delete-weight" data-date="${dateKey(r.date)}">刪除</button></div></td></tr>`;
  }).join("")||`<tr><td colspan="5">尚無體重紀錄</td></tr>`;
  const wSeries=seriesFor("weight",weightRangeDays);
  drawLine($("#weightLogChart"),wSeries.values,wSeries.short,{fullLabels:wSeries.full,unit:"kg"});
  if(rows.length){
    const first=rows[0],last=rows[rows.length-1],diff=last.weight-first.weight;
    const recent7=rows.slice(-7);
    const prior7=rows.slice(-14,-7);
    const avg=a=>a.length?a.reduce((s,x)=>s+x.weight,0)/a.length:null;
    const avg7=avg(recent7),avgPrev=avg(prior7),avgDiff=(avg7!==null&&avgPrev!==null)?avg7-avgPrev:null;
    $("#weightSummary").innerHTML=`<div class="weight-kpi">
      <div><span>最新體重</span><b>${fmt(last.weight,1)} kg</b></div>
      <div><span>BMI</span><b>${fmt(bmi(last.weight),1)}</b></div>
      <div><span>最近 7 筆平均</span><b>${fmt(avg7,1)} kg</b><small>${avgDiff===null?"資料累積中":`較前 7 筆 ${avgDiff>0?"+":""}${fmt(avgDiff,1)} kg`}</small></div>
    </div>`;
    $("#weightTrendText").innerHTML=`<p>從 ${displayDate(first.date)} 到 ${displayDate(last.date)}，體重 ${diff<0?"下降":diff>0?"上升":"持平"} ${fmt(Math.abs(diff),1)} kg。</p>`;
  }else{
    $("#weightSummary").innerHTML="<p>尚無體重紀錄。</p>";$("#weightTrendText").innerHTML="<p>開始記錄後，這裡會顯示體重變化。</p>";
  }
}

const LAB_META={
  weight:["體重","kg",1],systolic_bp:["收縮壓","mmHg",0],diastolic_bp:["舒張壓","mmHg",0],
  fasting_glucose:["空腹血糖","mg/dL",0],hba1c:["HbA1c","%",1],creatinine:["Creatinine","mg/dL",2],
  bun:["BUN","mg/dL",1],egfr:["eGFR","",1],uric_acid:["尿酸","mg/dL",1],uacr:["uACR","mg/g",1],
  total_cholesterol:["總膽固醇","mg/dL",0],ldl:["LDL-C","mg/dL",0],hdl:["HDL-C","mg/dL",0],
  triglycerides:["TG","mg/dL",0],ast:["AST","U/L",0],alt:["ALT","U/L",0],ggt:["γ-GT","U/L",0],
  sodium:["Na","mmol/L",1],potassium:["K","mmol/L",1],hb:["Hb","g/dL",1],hct:["Hct","%",1],
  rbc:["RBC","",2],wbc:["WBC","",2],plt:["PLT","",0],mcv:["MCV","fL",1],mch:["MCH","pg",1],
  mchc:["MCHC","g/dL",1],pt:["PT","sec",1],inr:["INR","",2],ptt:["PTT","sec",1]
};
function renderLabs(){
  const rows=[];
  sorted().slice().reverse().forEach(r=>{
    Object.entries(LAB_META).forEach(([k,m])=>{if(n(r[k])!==null)rows.push(`<tr><td>${displayDate(r.date)}</td><td>${m[0]}</td><td>${fmt(n(r[k]),m[2])}</td><td>${m[1]}</td></tr>`)});
  });
  $("#labTableBody").innerHTML=rows.join("")||`<tr><td colspan="4">尚無資料</td></tr>`;
}

function renderReport(){
  const l=latestLabRecord();
  $("#reportDate").textContent=l.date?`最近一次資料：${displayDate(l.date)}`:"尚無資料";
  const improved=[],watch=[],stable=[],table=[];
  Object.entries(LAB_META).forEach(([f,m])=>{
    const c=latestValue(f); if(!c)return;
    const p=previousValue(f),cur=n(c[f]),prev=p?n(p[f]):null,st=statusFor(f,cur);
    let change=`<span class="change-badge change-none">無前次</span>`,cls="delta-neutral";
    if(prev!==null){
      const d=cur-prev;
      const amount=fmt(Math.abs(d),m[2]);
      if(d<0){change=`<span class="change-badge change-down"><b>↓</b><span>下降 ${amount}${m[1]?" "+m[1]:""}</span></span>`;cls="delta-neutral"}
      else if(d>0){change=`<span class="change-badge change-up"><b>↑</b><span>上升 ${amount}${m[1]?" "+m[1]:""}</span></span>`;cls="delta-neutral"}
      else change=`<span class="change-badge change-flat"><b>—</b><span>持平</span></span>`;
    }
    if(st.level==="watch") watch.push(`${m[0]}：${fmt(cur,m[2])} ${m[1]}（${st.text}）`);
    else if(st.level==="ok") stable.push(`${m[0]}：${fmt(cur,m[2])} ${m[1]}`);
    if(prev!==null && ((f==="creatinine"&&cur<prev)||(f==="egfr"&&cur>prev)||(f==="hba1c"&&cur<prev))) improved.push(`${m[0]}：${fmt(prev,m[2])} → ${fmt(cur,m[2])} ${m[1]}`);
    table.push(`<tr><td>${m[0]}</td><td>${fmt(cur,m[2])} ${m[1]}</td><td>${prev===null?"—":fmt(prev,m[2])+" "+m[1]}</td><td class="${cls} report-change-cell">${change}</td><td>${st.text}</td></tr>`);
  });
  $("#reportImproved").innerHTML=(improved.length?improved:["目前沒有足夠前次資料可比較。"]).map(x=>`<div class="advice-item">${x}</div>`).join("");
  $("#reportWatch").innerHTML=(watch.length?watch:["目前沒有系統標記的明顯追蹤項目。"]).map(x=>`<div class="advice-item">${x}</div>`).join("");
  $("#reportStable").innerHTML=(stable.length?stable:["資料不足。"]).slice(0,12).map(x=>`<div class="advice-item">${x}</div>`).join("");
  $("#reportLabTable").innerHTML=table.join("");

  const w=n(l.weight),plan=[];
  if(latestNonNull("fasting_glucose")>=100) plan.push("未來 4–12 週先固定：含糖飲接近零、主食份量先減約 1/4。");
  if(bmi(w)>=27) plan.push(`體重第一階段可先往約 ${fmt(w*.93,1)}–${fmt(w*.95,1)} kg 前進。`);
  if(latestNonNull("egfr")!==null&&latestNonNull("egfr")<90) plan.push("下一次複查腎功能時，可一併確認 uACR / 尿蛋白，並避免自行高蛋白減重。");
  plan.push("複查頻率依醫師安排；若趨勢明顯惡化或出現症狀，提早就醫。");
  $("#reportPlan").innerHTML=plan.map(x=>`<div class="advice-item">${x}</div>`).join("");

  const highlights=[];
  [["空腹血糖","fasting_glucose",0,"mg/dL"],["HbA1c","hba1c",1,"%"],["eGFR","egfr",1,""],["體重","weight",1,"kg"]].forEach(([label,f,d,u])=>{
    const v=n(l[f]);if(v===null)return;const st=f==="weight"?{level:bmi(v)>=27?"watch":"ok",text:`BMI ${fmt(bmi(v),1)}`} : statusFor(f,v);
    highlights.push(`<div class="link-metric ${st.level==="watch"?"corr-neutral":"corr-positive"}"><h3>${label}</h3><strong>${fmt(v,d)}${u?" "+u:""}</strong><p>${st.text}</p></div>`);
  });
  $("#reportHighlights").innerHTML=highlights.join("");
  $("#reportOverall").textContent=watch.length>=4?"多項需追蹤":watch.length?"持續管理":"目前大致穩定";
}
function reportText(){
  const l=latest(),w=n(l.weight);
  return [
    `健康追蹤摘要｜${l.date||""}`,
    latestNonNull("fasting_glucose")!==null?`空腹血糖：${fmt(latestNonNull("fasting_glucose"),0)} mg/dL`:"",
    latestNonNull("hba1c")!==null?`HbA1c：${fmt(latestNonNull("hba1c"),1)}%`:"",
    latestNonNull("creatinine")!==null?`Creatinine：${fmt(latestNonNull("creatinine"),2)} mg/dL`:"",
    latestNonNull("egfr")!==null?`eGFR：${fmt(latestNonNull("egfr"),1)}`:"",
    `體重：${fmt(w,1)} kg，BMI 約 ${fmt(bmi(w),1)}`,
    "",
    "本摘要為健康管理用途，不取代醫師診斷與用藥調整。"
  ].filter(x=>x!==null).join("\n");
}

async function apiGet(action){
  const api=localStorage.getItem("healthApiUrl")||"";
  if(!api) throw new Error("尚未設定 Apps Script URL");
  const u=new URL(api);u.searchParams.set("action",action);
  const r=await fetch(u.toString(),{cache:"no-store"}),d=await r.json();
  if(!d.ok) throw new Error(d.error||"API error"); return d;
}
async function apiPost(payload){
  const api=localStorage.getItem("healthApiUrl")||"";
  if(!api) throw new Error("尚未設定 Apps Script URL");
  const r=await fetch(api,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify(payload)});
  const d=await r.json();if(!d.ok) throw new Error(d.error||"API error");return d;
}

async function loadData(){
  const api=localStorage.getItem("healthApiUrl")||"";$("#apiUrl").value=api;
  const local=JSON.parse(localStorage.getItem("healthLocalData")||JSON.stringify(SAMPLE_DATA));
  if(!api){records=local.map(r=>({...r,date:dateKey(r.date)}));lastSyncAt=new Date();$("#syncStatus").textContent="本機資料・未連線";renderAll();return;}
  try{
    $("#syncStatus").textContent="同步中…";
    const d=await apiGet("list");
    records=(Array.isArray(d.records)?d.records:local).map(r=>({...r,date:dateKey(r.date)}));
    lastSyncAt=new Date(); $("#syncStatus").textContent=`Google Sheet 已同步・${records.length} 筆`;
  }catch(e){
    records=local.map(r=>({...r,date:dateKey(r.date)}));lastSyncAt=new Date(); $("#syncStatus").textContent="同步失敗・目前為本機資料";
  }
  renderAll();
}
async function saveRecord(record,msgEl){
  if(record.date) record.date=dateKey(record.date);
  const api=localStorage.getItem("healthApiUrl")||"";
  if(api){
    try{await apiPost({action:"upsert",record});if(msgEl)msgEl.textContent="已儲存到 Google Sheet。";await loadData();return true}
    catch(e){if(msgEl)msgEl.textContent="Google Sheet 儲存失敗，已改存本機。";}
  }
  const local=JSON.parse(localStorage.getItem("healthLocalData")||JSON.stringify(SAMPLE_DATA));
  const idx=local.findIndex(x=>x.date===record.date);
  if(idx>=0)local[idx]={...local[idx],...Object.fromEntries(Object.entries(record).filter(([,v])=>v!==null&&v!==""))};
  else local.push(record);
  localStorage.setItem("healthLocalData",JSON.stringify(local));records=local.map(r=>({...r,date:dateKey(r.date)}));renderAll();
  if(msgEl)msgEl.textContent="已儲存在此裝置。";return false;
}
async function saveWeight(){
  const date=$("#wtDate").value,weight=n($("#wtWeight").value);
  if(!date){$("#weightMsg").textContent="請先選日期。";return}
  if(weight===null||weight<30||weight>250){$("#weightMsg").textContent="請確認體重數值是否正確。";return}
  await saveRecord({date,weight},$("#weightMsg"));$("#wtWeight").value="";
}
function labFormRecord(){
  const val=id=>n($(id).value);
  return {
    date:$("#fDate").value,weight:val("#fWeight"),systolic_bp:val("#fSBP"),diastolic_bp:val("#fDBP"),
    fasting_glucose:val("#fGlucose"),hba1c:val("#fA1c"),creatinine:val("#fCr"),bun:val("#fBun"),egfr:val("#fEgfr"),
    uric_acid:val("#fUric"),uacr:val("#fUacr"),urine_protein:$("#fUrineProtein").value||null,urine_blood:$("#fUrineBlood").value||null,
    total_cholesterol:val("#fTC"),ldl:val("#fLDL"),hdl:val("#fHDL"),triglycerides:val("#fTG"),ast:val("#fAST"),alt:val("#fAlt"),
    ggt:val("#fGGT"),sodium:val("#fNa"),potassium:val("#fK"),hb:val("#fHb"),hct:val("#fHct"),rbc:val("#fRBC"),wbc:val("#fWBC"),
    plt:val("#fPLT"),mcv:val("#fMCV"),mch:val("#fMCH"),mchc:val("#fMCHC"),pt:val("#fPT"),inr:val("#fINR"),ptt:val("#fPTT")
  };
}
async function saveLab(){
  const r=labFormRecord();if(!r.date){$("#saveMsg").textContent="請先選日期。";return}
  if(!validateLabRecord(r)) return;
  await saveRecord(r,$("#saveMsg"));
}
function clearLabForm(){
  document.querySelectorAll("#add input").forEach(el=>{if(el.type!=="date")el.value=""});
  document.querySelectorAll("#add select").forEach(el=>el.value="");$("#saveMsg").textContent="";
}

function renderAll(){
  renderDashboard();renderWeightLog();renderTrends();renderAlerts();renderLifestyle();renderLabs();renderReport();renderCompleteness();renderSyncDiagnostics(); if(window.HealthIntel?.getDB?.()) window.HealthIntel.render(window.HealthIntel.analyze(records)); if(window.MultiMarker?.getDB?.()) window.MultiMarker.render();
  const l=latest();const sw=latestNonNull("weight"); $("#settingsWeight").textContent=sw===null?"尚無體重":`${fmt(sw,1)} kg`;
}
function setPage(id){
  document.querySelectorAll(".nav-btn").forEach(b=>b.classList.toggle("active",b.dataset.page===id));
  document.querySelectorAll(".page").forEach(p=>p.classList.toggle("active",p.id===id));
  if(titles[id]){$("#pageTitle").textContent=titles[id][0];$("#pageSub").textContent=titles[id][1]}
  $("#sidebar").classList.remove("open");window.scrollTo(0,0);
  requestAnimationFrame(()=>renderAll());
}

document.querySelectorAll(".nav-btn").forEach(btn=>btn.addEventListener("click",()=>setPage(btn.dataset.page)));
$("#menuBtn").addEventListener("click",()=>$("#sidebar").classList.toggle("open"));
$("#refreshBtn").addEventListener("click",loadData);
$("#saveWeightBtn").addEventListener("click",saveWeight);
$("#saveLabBtn").addEventListener("click",saveLab);
$("#clearLabBtn").addEventListener("click",clearLabForm);
$("#saveApiBtn").addEventListener("click",()=>{localStorage.setItem("healthApiUrl",$("#apiUrl").value.trim());$("#apiMsg").textContent="已儲存。";loadData()});
$("#testApiBtn").addEventListener("click",async()=>{
  const u=$("#apiUrl").value.trim();if(!u){$("#apiMsg").textContent="請先貼上 /exec 網址。";return}
  try{localStorage.setItem("healthApiUrl",u);const d=await apiGet("ping");const list=await apiGet("list"); $("#apiMsg").textContent=`連線成功：${d.version||""}・health_records ${Array.isArray(list.records)?list.records.length:0} 筆`}
  catch(e){$("#apiMsg").textContent="連線失敗："+e.message}
});
$("#printReportBtn").addEventListener("click",()=>window.print());
$("#copyReportBtn").addEventListener("click",async()=>{
  try{await navigator.clipboard.writeText(reportText());$("#copyReportBtn").textContent="已複製";setTimeout(()=>$("#copyReportBtn").textContent="複製文字摘要",1200)}
  catch(e){alert(reportText())}
});
const today=new Date().toISOString().slice(0,10);$("#fDate").value=today;$("#wtDate").value=today;
window.addEventListener("resize",()=>requestAnimationFrame(renderAll));
if("serviceWorker" in navigator)navigator.serviceWorker.register("sw.js").catch(()=>{});
loadData();

async function deleteWeightRecord(date){
  if(!confirm(`確定刪除 ${displayDate(date)} 的體重紀錄嗎？`)) return;
  const api=localStorage.getItem("healthApiUrl")||"";
  if(api){
    try{
      await apiPost({action:"delete_weight",date});
      await loadData(); return;
    }catch(e){ alert("雲端刪除失敗："+e.message); return; }
  }
  const local=JSON.parse(localStorage.getItem("healthLocalData")||"[]");
  const idx=local.findIndex(x=>dateKey(x.date)===dateKey(date));
  if(idx>=0){
    local[idx].weight=null;
    if(Object.entries(local[idx]).filter(([k,v])=>k!=="date"&&v!==null&&v!==""&&v!==undefined).length===0) local.splice(idx,1);
  }
  localStorage.setItem("healthLocalData",JSON.stringify(local));records=local.map(r=>({...r,date:dateKey(r.date)}));renderAll();
}
function editWeightRecord(date){
  const r=sorted().find(x=>dateKey(x.date)===dateKey(date));
  if(!r) return;
  $("#wtDate").value=dateKey(date);
  $("#wtWeight").value=n(r.weight)??"";
  setPage("weightlog");
  $("#wtWeight").focus();
}
document.addEventListener("click",e=>{
  const edit=e.target.closest(".edit-weight"); if(edit) editWeightRecord(edit.dataset.date);
  const del=e.target.closest(".delete-weight"); if(del) deleteWeightRecord(del.dataset.date);
  const more=e.target.closest(".more-card"); if(more) setPage(more.dataset.openPage);
});

function validateLabRecord(r){
  const limits={
    weight:[30,250],systolic_bp:[60,260],diastolic_bp:[30,160],fasting_glucose:[30,600],hba1c:[3,20],
    creatinine:[0.2,20],bun:[2,200],egfr:[1,200],uric_acid:[0.5,20],uacr:[0,5000],
    total_cholesterol:[50,800],ldl:[10,500],hdl:[5,200],triglycerides:[10,3000],
    ast:[1,2000],alt:[1,2000],ggt:[1,3000],sodium:[100,180],potassium:[1.5,9],
    hb:[3,25],hct:[10,75],rbc:[1,9],wbc:[0.5,100],plt:[10,1500],mcv:[40,150],mch:[10,60],mchc:[15,50],
    pt:[5,60],inr:[0.3,10],ptt:[10,150]
  };
  const odd=[];
  Object.entries(limits).forEach(([f,[lo,hi]])=>{
    const v=n(r[f]); if(v!==null&&(v<lo||v>hi)) odd.push(`${LAB_META[f]?.[0]||f}: ${v}`);
  });
  if(!odd.length) return true;
  return confirm("以下數值看起來不尋常：\n\n"+odd.join("\n")+"\n\n仍要儲存嗎？");
}

const LAB_GROUPS={
  glucose:["fasting_glucose","hba1c"],
  kidney:["creatinine","bun","egfr","uacr","urine_protein","urine_blood"],
  uric:["uric_acid"],
  lipid:["total_cholesterol","ldl","hdl","triglycerides"],
  liver:["ast","alt","ggt"],
  cbc:["hb","hct","rbc","wbc","plt","mcv","mch","mchc"],
  bp:["systolic_bp","diastolic_bp"]
};
const renderLabsBase=renderLabs;
renderLabs=function(){
  const filter=$("#labFilter")?.value||"all";
  const q=($("#labSearch")?.value||"").trim().toLowerCase();
  const fields=filter==="all"?Object.keys(LAB_META):(LAB_GROUPS[filter]||[]);
  const rows=[];
  sorted().slice().reverse().forEach(r=>{
    fields.forEach(k=>{
      const m=LAB_META[k]; if(!m||n(r[k])===null)return;
      if(q && !m[0].toLowerCase().includes(q)) return;
      rows.push(`<tr><td>${displayDate(r.date)}</td><td>${m[0]}</td><td>${fmt(n(r[k]),m[2])}</td><td>${m[1]}</td></tr>`);
    });
  });
  $("#labTableBody").innerHTML=rows.join("")||`<tr><td colspan="4">沒有符合條件的資料</td></tr>`;
  const grouped={};
  sorted().slice().reverse().forEach(r=>{
    const items=[];
    fields.forEach(k=>{
      const m=LAB_META[k]; if(!m||n(r[k])===null)return;
      if(q && !m[0].toLowerCase().includes(q))return;
      items.push({label:m[0],value:fmt(n(r[k]),m[2]),unit:m[1]});
    });
    if(items.length) grouped[dateKey(r.date)]={date:displayDate(r.date),items};
  });
  const holder=$("#labGroupedList");
  if(holder){
    holder.innerHTML=Object.values(grouped).map((g,idx)=>`<div class="lab-date-group ${idx===0?"open":""}">
      <button class="lab-date-toggle" type="button"><b>${g.date}</b><span>${g.items.length} 項檢驗</span></button>
      <div class="lab-date-body">${g.items.map(x=>`<div class="lab-mini-row"><span>${x.label}</span><strong>${x.value}</strong><em>${x.unit||""}</em></div>`).join("")}</div>
    </div>`).join("")||"<p class='small'>沒有符合條件的資料。</p>";
  }
};
window.addEventListener("load",()=>{
  $("#labFilter")?.addEventListener("change",renderLabs);
  $("#labSearch")?.addEventListener("input",renderLabs);
});

function renderCompleteness(){
  const groups={
    "血糖":["fasting_glucose","hba1c"],
    "腎功能":["creatinine","bun","egfr","uacr"],
    "血脂":["total_cholesterol","ldl","hdl","triglycerides"],
    "肝功能":["ast","alt","ggt"],
    "血壓":["systolic_bp","diastolic_bp"],
    "體重":["weight"]
  };
  const el=$("#dataCompleteness"); if(!el)return;
  el.innerHTML=Object.entries(groups).map(([name,fields])=>{
    const dates=new Set();
    sorted().forEach(r=>{if(fields.some(f=>n(r[f])!==null))dates.add(dateKey(r.date))});
    const last=[...sorted()].reverse().find(r=>fields.some(f=>n(r[f])!==null));
    return `<div class="completeness-item"><b>${name}</b><span>${dates.size} 次紀錄</span><span>${last?`最近 ${displayDate(last.date)}`:"尚無資料"}</span></div>`;
  }).join("");
}
function renderSyncDiagnostics(){
  const el=$("#syncDiagnostics"); if(!el)return;
  const count=records.length;
  const latestDate=count?displayDate(sorted()[sorted().length-1]?.date):"—";
  const api=localStorage.getItem("healthApiUrl")||"";
  const mode=$("#syncStatus")?.textContent||"";
  el.innerHTML=`
    <div class="diagnostic-item ${count===0?"warn":""}"><span>health_records</span><b>${count} 筆資料</b></div>
    <div class="diagnostic-item"><span>最新日期</span><b>${latestDate}</b></div>
    <div class="diagnostic-item"><span>同步狀態</span><b>${mode||"—"}</b></div>
    <div class="diagnostic-item"><span>最後整理</span><b>${lastSyncAt?lastSyncAt.toLocaleTimeString("zh-TW",{hour:"2-digit",minute:"2-digit"}):"—"}</b></div>`;
}

document.addEventListener("click",e=>{
  const rb=e.target.closest(".range-switch button");
  if(rb){
    const box=rb.closest(".range-switch");
    box.querySelectorAll("button").forEach(b=>b.classList.toggle("active",b===rb));
    if(box.id==="trendRange")trendRangeDays=rb.dataset.range;
    if(box.id==="weightRange")weightRangeDays=rb.dataset.range;
    renderAll();
  }
  const labToggle=e.target.closest(".lab-date-toggle");
  if(labToggle)labToggle.closest(".lab-date-group")?.classList.toggle("open");
});


/* ===== V15.3 Dynamic Lab Registry ===== */
let customLabs=[];
let dynamicLabRegistry=null;

function normalizeCustomLabCode(name,code){
  const base=(code||name||"").toLowerCase().trim()
    .replace(/[^\p{L}\p{N}]+/gu,"_").replace(/^_+|_+$/g,"");
  return base||"custom_test";
}
function customLabStatus(r){
  const v=n(r.value);
  if(v===null)return {level:"none",text:"未輸入數值"};
  const lo=n(r.ref_low),hi=n(r.ref_high);
  if(lo!==null&&v<lo)return {level:"watch",text:`低於參考下限 ${lo}`};
  if(hi!==null&&v>hi)return {level:"watch",text:`高於參考上限 ${hi}`};
  if(lo!==null||hi!==null)return {level:"ok",text:"位於輸入的參考範圍內"};
  if(r.ref_text)return {level:"none",text:`參考：${r.ref_text}`};
  return {level:"none",text:"尚未提供參考範圍"};
}
function customLabRuleSupport(r){
  if(!dynamicLabRegistry)return false;
  const name=String(r.test_name||"").toLowerCase();
  const code=String(r.test_code||"").toLowerCase();
  return Object.entries(dynamicLabRegistry.known_examples||{}).some(([k,v])=>
    k===code || (v.aliases||[]).some(a=>name===String(a).toLowerCase())
  );
}
function renderCustomLabs(){
  const q=($("#customLabSearch")?.value||"").trim().toLowerCase();
  const list=$("#customLabList");
  if(list){
    const rows=[...customLabs].sort((a,b)=>dateKey(b.date).localeCompare(dateKey(a.date)))
      .filter(r=>!q||String(r.test_name||"").toLowerCase().includes(q)||String(r.test_code||"").toLowerCase().includes(q));
    list.innerHTML=rows.map(r=>{
      const st=customLabStatus(r),supported=customLabRuleSupport(r);
      return `<div class="custom-lab-row">
        <div><b>${r.test_name||r.test_code}</b><span>${displayDate(r.date)}</span></div>
        <div><strong>${fmt(n(r.value),3)}${r.unit?" "+r.unit:""}</strong><small>${st.text}</small></div>
        <div><span class="support-pill ${supported?"supported":"unsupported"}">${supported?"已識別・待專屬規則":"未支援專屬規則"}</span></div>
        <div class="table-action"><button class="edit-custom-lab" data-id="${r.id}">編輯</button><button class="delete-custom-lab" data-id="${r.id}">刪除</button></div>
      </div>`;
    }).join("")||"<p class='small'>尚無自訂檢驗資料。</p>";
  }
  const unsupported=$("#unsupportedLabList");
  if(unsupported){
    const map=new Map();
    customLabs.filter(r=>!customLabRuleSupport(r)).forEach(r=>{
      const k=r.test_code||r.test_name;
      if(!map.has(k))map.set(k,{name:r.test_name||k,count:0,last:r.date});
      const x=map.get(k);x.count++;if(dateKey(r.date)>dateKey(x.last))x.last=r.date;
    });
    unsupported.innerHTML=[...map.values()].map(x=>`<div class="unsupported-item"><b>${x.name}</b><span>${x.count} 筆紀錄</span><small>最近 ${displayDate(x.last)}・目前僅做保存與參考範圍判讀</small></div>`).join("")||"<p class='small'>目前沒有未知檢驗項目。</p>";
  }
}
function previewCustomLab(){
  const r={
    value:val("#customLabValue"),ref_low:val("#customLabLow"),ref_high:val("#customLabHigh"),
    ref_text:$("#customLabRefText")?.value||"",test_name:$("#customLabName")?.value||"",test_code:$("#customLabCode")?.value||""
  };
  const st=customLabStatus(r),box=$("#customLabPreview");
  if(box)box.innerHTML=`<div class="preview-status ${st.level}"><b>${st.text}</b><span>${customLabRuleSupport(r)?"系統已識別此類檢驗，但仍以檢驗單參考範圍優先。":"尚未有專屬智慧規則，系統不會自行診斷。"}</span></div>`;
}
function customLabFormRecord(){
  const name=$("#customLabName")?.value.trim()||"";
  const code=normalizeCustomLabCode(name,$("#customLabCode")?.value||"");
  return {
    id:$("#customLabName")?.dataset.editId||crypto.randomUUID?.()||("cl_"+Date.now()),
    date:$("#customLabDate")?.value||"",
    test_name:name,
    test_code:code,
    loinc_code:$("#customLabLoinc")?.value.trim()||"",
    value:val("#customLabValue"),
    unit:$("#customLabUnit")?.value.trim()||"",
    ref_low:val("#customLabLow"),
    ref_high:val("#customLabHigh"),
    ref_text:$("#customLabRefText")?.value.trim()||"",
    note:$("#customLabNote")?.value.trim()||""
  };
}
function clearCustomLabForm(){
  ["#customLabName","#customLabCode","#customLabLoinc","#customLabValue","#customLabUnit","#customLabLow","#customLabHigh","#customLabRefText","#customLabNote"].forEach(s=>{const e=$(s);if(e)e.value=""});
  if($("#customLabName"))delete $("#customLabName").dataset.editId;
  $("#customLabMsg").textContent="";
  previewCustomLab();
}
async function saveCustomLab(){
  const r=customLabFormRecord();
  if(!r.date||!r.test_name||r.value===null){$("#customLabMsg").textContent="請至少填日期、檢驗名稱與數值。";return}
  if(r.ref_low!==null&&r.ref_high!==null&&r.ref_low>r.ref_high){$("#customLabMsg").textContent="參考下限不能大於上限。";return}
  const api=localStorage.getItem("healthApiUrl")||"";
  if(api){
    try{
      const d=await apiPost({action:"custom_lab_upsert",record:r});
      if(!d.ok)throw new Error(d.error||"儲存失敗");
      await loadCustomLabs();
      $("#customLabMsg").textContent="已儲存到 Google Sheet。";
      clearCustomLabForm();return;
    }catch(e){$("#customLabMsg").textContent="雲端儲存失敗："+e.message;return}
  }
  const idx=customLabs.findIndex(x=>x.id===r.id);
  if(idx>=0)customLabs[idx]=r;else customLabs.push(r);
  localStorage.setItem("healthCustomLabs",JSON.stringify(customLabs));
  renderCustomLabs();clearCustomLabForm();
}
async function deleteCustomLab(id){
  if(!confirm("確定刪除這筆自訂檢驗嗎？"))return;
  const api=localStorage.getItem("healthApiUrl")||"";
  if(api){
    try{await apiPost({action:"custom_lab_delete",id});await loadCustomLabs();return}catch(e){alert("刪除失敗："+e.message);return}
  }
  customLabs=customLabs.filter(x=>x.id!==id);localStorage.setItem("healthCustomLabs",JSON.stringify(customLabs));renderCustomLabs();
}
function editCustomLab(id){
  const r=customLabs.find(x=>x.id===id);if(!r)return;
  $("#customLabDate").value=dateKey(r.date);
  $("#customLabName").value=r.test_name||"";
  $("#customLabName").dataset.editId=r.id;
  $("#customLabCode").value=r.test_code||"";
  if($("#customLabLoinc"))$("#customLabLoinc").value=r.loinc_code||"";
  $("#customLabValue").value=r.value??"";
  $("#customLabUnit").value=r.unit||"";
  $("#customLabLow").value=r.ref_low??"";
  $("#customLabHigh").value=r.ref_high??"";
  $("#customLabRefText").value=r.ref_text||"";
  $("#customLabNote").value=r.note||"";
  previewCustomLab();
  setPage("add"); setEntryMode("catalog");
  window.scrollTo({top:0,behavior:"smooth"});
}
async function loadCustomLabs(){
  const local=JSON.parse(localStorage.getItem("healthCustomLabs")||"[]");
  const api=localStorage.getItem("healthApiUrl")||"";
  if(!api){customLabs=local;renderCustomLabs();return}
  try{
    const d=await apiGet("custom_lab_list");
    customLabs=Array.isArray(d.records)?d.records:local;
  }catch(e){customLabs=local}
  renderCustomLabs();
}
async function initDynamicLabRegistry(){
  await loadCustomLabProfiles();
  try{dynamicLabRegistry=await fetch("dynamic_lab_registry_v15.json",{cache:"no-store"}).then(r=>r.json())}catch(e){dynamicLabRegistry={known_examples:{}}}
  await loadCustomLabs();
  const today=new Date();const y=today.getFullYear(),m=String(today.getMonth()+1).padStart(2,"0"),d=String(today.getDate()).padStart(2,"0");
  if($("#customLabDate")&&!$("#customLabDate").value)$("#customLabDate").value=`${y}-${m}-${d}`;
  renderCustomLabs();previewCustomLab();
}
window.addEventListener("load",()=>{
  $("#saveCustomLabBtn")?.addEventListener("click",saveCustomLab);
  $("#clearCustomLabBtn")?.addEventListener("click",clearCustomLabForm);
  $("#customLabSearch")?.addEventListener("input",renderCustomLabs);
  $("#customLabTrendSelect")?.addEventListener("change",renderCustomLabTrend);
  $("#customLabName")?.addEventListener("change",()=>{applyCustomLabProfileHints();previewCustomLab()});
  ["#customLabName","#customLabCode","#customLabValue","#customLabLow","#customLabHigh","#customLabRefText"].forEach(s=>$(s)?.addEventListener("input",previewCustomLab));
  document.addEventListener("click",e=>{
    const edit=e.target.closest(".edit-custom-lab");if(edit)editCustomLab(edit.dataset.id);
    const del=e.target.closest(".delete-custom-lab");if(del)deleteCustomLab(del.dataset.id);
  });
  initDynamicLabRegistry();
});


/* ===== V15.4 Dynamic Lab Intelligence ===== */
let customLabProfiles={};

function customLabCanonical(r){
  const rawCode=String(r.test_code||"").trim().toLowerCase();
  const rawName=String(r.test_name||"").trim().toLowerCase();
  if(dynamicLabRegistry?.known_examples){
    for(const [code,meta] of Object.entries(dynamicLabRegistry.known_examples)){
      if(rawCode===code)return code;
      if((meta.aliases||[]).some(a=>String(a).toLowerCase()===rawName))return code;
    }
  }
  return rawCode||normalizeCustomLabCode(rawName,"");
}
function customLabGroups(){
  const map=new Map();
  customLabs.forEach(r=>{
    const code=customLabCanonical(r);
    if(!map.has(code))map.set(code,{code,name:r.test_name||code,unit:r.unit||"",rows:[]});
    const g=map.get(code);g.rows.push(r);
    if(!g.unit&&r.unit)g.unit=r.unit;
    if(r.test_name)g.name=r.test_name;
  });
  for(const g of map.values())g.rows.sort((a,b)=>dateKey(a.date).localeCompare(dateKey(b.date)));
  return [...map.values()].sort((a,b)=>a.name.localeCompare(b.name,"zh-Hant"));
}
function renderCustomLabTrendSelect(){
  const sel=$("#customLabTrendSelect");if(!sel)return;
  const groups=customLabGroups();
  const prev=sel.value;
  sel.innerHTML=groups.map(g=>`<option value="${g.code}">${g.name} (${g.rows.length})</option>`).join("")||'<option value="">尚無資料</option>';
  if(groups.some(g=>g.code===prev))sel.value=prev;
}
function renderCustomLabTrend(){
  const sel=$("#customLabTrendSelect"),canvas=$("#customLabTrendChart"),box=$("#customLabTrendSummary");
  if(!sel||!canvas||!box)return;
  const g=customLabGroups().find(x=>x.code===sel.value);
  if(!g){
    drawLine(canvas,[],[]);
    box.innerHTML="<p class='small'>尚無可顯示的自訂檢驗資料。</p>";return;
  }
  const vals=g.rows.map(r=>n(r.value)).filter(v=>v!==null);
  const usable=g.rows.filter(r=>n(r.value)!==null);
  drawLine(canvas,usable.map(r=>n(r.value)),usable.map(r=>displayDate(r.date,true)),{
    fullLabels:usable.map(r=>displayDate(r.date,false)),
    unit:g.unit||""
  });
  const first=usable[0],last=usable.at(-1);
  const prev=usable.length>1?usable.at(-2):null;
  const d=prev?n(last.value)-n(prev.value):null;
  const st=customLabStatus(last||{});
  let direction="資料不足";
  if(d!==null)direction=d>0?`較前次上升 ${fmt(Math.abs(d),3)}${g.unit?" "+g.unit:""}`:d<0?`較前次下降 ${fmt(Math.abs(d),3)}${g.unit?" "+g.unit:""}`:"與前次相同";
  const refParts=[];
  if(n(last?.ref_low)!==null)refParts.push(`下限 ${last.ref_low}`);
  if(n(last?.ref_high)!==null)refParts.push(`上限 ${last.ref_high}`);
  if(last?.ref_text)refParts.push(last.ref_text);
  box.innerHTML=`<div class="custom-trend-kpis">
    <div><span>最新</span><b>${fmt(n(last?.value),3)}${g.unit?" "+g.unit:""}</b></div>
    <div><span>最近變化</span><b>${direction}</b></div>
    <div><span>參考判讀</span><b>${st.text}</b></div>
    <div><span>紀錄次數</span><b>${usable.length}</b></div>
  </div>
  <p class="small">${refParts.length?`最近一筆參考：${refParts.join("・")}`:"最近一筆未提供參考範圍，系統不自行推定正常值。"}</p>`;
}
function renderRulePromotionQueue(){
  const holder=$("#unsupportedLabList");if(!holder)return;
  const items=customLabGroups().filter(g=>!customLabRuleSupport(g.rows.at(-1)||{}));
  holder.innerHTML=items.map(g=>{
    const count=g.rows.length;
    const last=g.rows.at(-1);
    const priority=count>=3?"priority":count===2?"medium":"low";
    return `<div class="unsupported-item promotion-${priority}">
      <b>${g.name}</b>
      <span>${count} 筆紀錄</span>
      <small>最近 ${displayDate(last.date)}・${count>=3?"已累積足夠趨勢資料，建議優先建立專屬規則":count===2?"已有 2 筆，可先觀察趨勢":"先累積更多資料"}</small>
    </div>`;
  }).join("")||"<p class='small'>目前沒有需要升級規則的未知檢驗。</p>";
}
function applyCustomLabProfileHints(){
  const name=$("#customLabName")?.value.trim().toLowerCase()||"";
  if(!name||!customLabProfiles)return;
  const p=Object.values(customLabProfiles).find(x=>String(x.name||"").toLowerCase()===name||String(x.code||"").toLowerCase()===name);
  if(!p)return;
  if($("#customLabCode")&&!$("#customLabCode").value)$("#customLabCode").value=p.code||"";
  if($("#customLabUnit")&&!$("#customLabUnit").value)$("#customLabUnit").value=p.unit||"";
}
async function loadCustomLabProfiles(){
  try{
    const d=await fetch("custom_lab_profiles_v15.json",{cache:"no-store"}).then(r=>r.json());
    customLabProfiles={};
    (d.profiles||[]).forEach(p=>customLabProfiles[p.code]=p);
  }catch(e){customLabProfiles={}}
}


/* ===== V15.5 Comprehensive Lab Catalog ===== */
let labCatalog=null;
async function loadLabCatalog(){
  try{labCatalog=await fetch("lab_catalog_v15.json",{cache:"no-store"}).then(r=>r.json())}
  catch(e){labCatalog={tests:[],categories:[],count:0}}
  const cat=$("#labCatalogCategory");
  if(cat){
    cat.innerHTML='<option value="all">全部分類</option>'+labCatalog.categories.map(x=>`<option value="${x}">${x}</option>`).join("");
  }
  renderLabCatalog();
}
function labCatalogText(t){
  return [t.code,t.name_en,t.name_zh,...(t.aliases||[])].join(" ").toLowerCase();
}
function renderLabCatalog(){
  const root=$("#labCatalogResults");if(!root||!labCatalog)return;
  const q=($("#labCatalogSearch")?.value||"").trim().toLowerCase();
  const cat=$("#labCatalogCategory")?.value||"all";
  let rows=labCatalog.tests.filter(t=>(cat==="all"||t.category===cat)&&(!q||labCatalogText(t).includes(q)));
  rows=rows.slice(0,80);
  root.innerHTML=rows.map(t=>`<button type="button" class="lab-catalog-item" data-catalog-code="${t.code}">
      <div><b>${t.name_zh||t.name_en}</b><span>${t.name_en}</span></div>
      <div><small>${t.category}</small><strong>${t.unit_hint||"單位依報告"}</strong></div>
    </button>`).join("")||"<p class='small'>找不到項目。你仍可以在上方直接輸入新的檢驗名稱。</p>";
  const st=$("#catalogStats");if(st)st.textContent=`已預載 ${labCatalog.count} 項・${labCatalog.categories.length} 類`;
}
function useCatalogItem(code){
  const t=labCatalog?.tests?.find(x=>x.code===code);if(!t)return;
  $("#customLabName").value=t.name_en||t.name_zh||t.code;
  $("#customLabCode").value=t.code;
  if(!$("#customLabUnit").value)$("#customLabUnit").value=t.unit_hint||"";
  if($("#customLabLoinc")&&t.loinc_code)$("#customLabLoinc").value=t.loinc_code;
  previewCustomLab();
  $("#customLabValue")?.focus();
}
window.addEventListener("load",()=>{
  loadLabCatalog();
  $("#labCatalogSearch")?.addEventListener("input",renderLabCatalog);
  $("#labCatalogCategory")?.addEventListener("change",renderLabCatalog);
  document.addEventListener("click",e=>{
    const b=e.target.closest(".lab-catalog-item");
    if(b)useCatalogItem(b.dataset.catalogCode);
  });
});


/* ===== V15.6 Unified Lab Entry ===== */
function setEntryMode(mode){
  const valid=["batch","catalog","manage"];
  if(!valid.includes(mode))mode="batch";
  document.querySelectorAll("#entryModeSwitch button").forEach(b=>b.classList.toggle("active",b.dataset.entryMode===mode));
  document.querySelectorAll("#add .entry-mode-panel").forEach(p=>{
    const panel=p.dataset.entryPanel||"";
    if(panel==="batch")p.classList.toggle("active",mode==="batch");
    else p.classList.toggle("active",mode!=="batch");
  });
  const catalogArea=document.querySelector("#add [data-entry-panel='catalog']");
  if(catalogArea){
    catalogArea.classList.toggle("manage-mode",mode==="manage");
    catalogArea.classList.toggle("catalog-mode",mode==="catalog");
  }
  localStorage.setItem("healthEntryMode",mode);
  if(mode!=="batch")renderCustomLabs?.();
}
window.addEventListener("load",()=>{
  const mode=localStorage.getItem("healthEntryMode")||"batch";
  setEntryMode(mode);
  document.querySelectorAll("#entryModeSwitch button").forEach(b=>b.addEventListener("click",()=>setEntryMode(b.dataset.entryMode)));
});


/* ===== V16.2 Production Readiness ===== */
function downloadTextFile(filename,text,type="application/json"){
  const blob=new Blob([text],{type:`${type};charset=utf-8`});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function csvEscape(v){
  if(v===null||v===undefined)return "";
  const s=String(v);
  return /[",\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s;
}
function rowsToCsv(rows){
  if(!rows.length)return "";
  const keys=[...new Set(rows.flatMap(r=>Object.keys(r)))];
  return [keys.join(","),...rows.map(r=>keys.map(k=>csvEscape(r[k])).join(","))].join("\n");
}
function exportBackupJson(){
  const payload={
    format:"HealthMonitorBackup",
    version:"16.2",
    exported_at:new Date().toISOString(),
    core_records:typeof records!=="undefined"?records:[],
    custom_labs:typeof customLabs!=="undefined"?customLabs:[],
    settings:{
      height_m:typeof HEIGHT_M!=="undefined"?HEIGHT_M:null,
      api_configured:!!localStorage.getItem("healthApiUrl")
    }
  };
  downloadTextFile(`health-backup-${new Date().toISOString().slice(0,10)}.json`,JSON.stringify(payload,null,2));
}
function exportCoreCsv(){
  downloadTextFile(`health-core-${new Date().toISOString().slice(0,10)}.csv`,rowsToCsv(records||[]),"text/csv");
}
function exportCustomCsv(){
  downloadTextFile(`health-custom-labs-${new Date().toISOString().slice(0,10)}.csv`,rowsToCsv(typeof customLabs!=="undefined"?customLabs:[]),"text/csv");
}
function duplicateHealthDates(){
  const counts={};(records||[]).forEach(r=>{const d=dateKey(r.date);counts[d]=(counts[d]||0)+1});
  return Object.entries(counts).filter(([,n])=>n>1);
}
function duplicateCustomLabs(){
  const counts={};
  (typeof customLabs!=="undefined"?customLabs:[]).forEach(r=>{
    const k=`${dateKey(r.date)}|${String(r.test_code||r.test_name||"").trim().toLowerCase()}`;
    counts[k]=(counts[k]||0)+1;
  });
  return Object.entries(counts).filter(([,n])=>n>1);
}
function suspiciousCoreValues(){
  const limits={
    weight:[25,300],systolic_bp:[60,260],diastolic_bp:[30,180],fasting_glucose:[20,700],hba1c:[2,20],
    creatinine:[0.1,20],bun:[1,200],egfr:[1,180],uric_acid:[0.5,25],sodium:[90,180],potassium:[1.5,8],
    hb:[3,25],wbc:[0.2,100],plt:[5,1500],inr:[0.3,15]
  };
  const out=[];
  (records||[]).forEach(r=>Object.entries(limits).forEach(([f,[lo,hi]])=>{
    const v=n(r[f]);if(v!==null&&(v<lo||v>hi))out.push({date:r.date,field:f,value:v});
  }));
  return out;
}
async function productionChecks(){
  const checks=[];
  const push=(name,status,detail)=>checks.push({name,status,detail});
  push("核心健康資料",records?.length?"pass":"warn",records?.length?`${records.length} 筆資料已載入`:"目前沒有核心健康資料");
  const cl=typeof customLabs!=="undefined"?customLabs:[];
  push("自訂檢驗資料","pass",`${cl.length} 筆`);
  const dup=duplicateHealthDates();
  push("核心資料重複日期",dup.length?"warn":"pass",dup.length?`${dup.length} 個日期有重複列，建議整理；同日多項資料應合併在同一列`:"未發現重複日期");
  const cdup=duplicateCustomLabs();
  push("自訂檢驗重複",cdup.length?"warn":"pass",cdup.length?`${cdup.length} 組同日同項重複`:"未發現同日同項重複");
  const suspect=suspiciousCoreValues();
  push("極端／疑似輸入錯誤值",suspect.length?"warn":"pass",suspect.length?`${suspect.length} 筆需要人工確認`:"未發現明顯超出防呆範圍的數值");
  push("多指標智慧引擎",window.MultiMarker?.getDB?.()?"pass":"fail",window.MultiMarker?.getDB?.()?`${window.MultiMarker.getDB().systems?.length||0} 個聯合分析群組已載入`:"多指標規則庫尚未載入");
  push("單項智慧引擎",window.HealthIntel?.getDB?.()?"pass":"fail",window.HealthIntel?.getDB?.()?"規則庫已載入":"規則庫尚未載入");
  push("瀏覽器儲存",(()=>{try{localStorage.setItem("__health_test","1");localStorage.removeItem("__health_test");return true}catch(e){return false}})()?"pass":"fail","localStorage");
  push("目前網路",navigator.onLine?"pass":"warn",navigator.onLine?"已連線":"目前離線");
  if("serviceWorker" in navigator){
    try{
      const reg=await navigator.serviceWorker.ready;
      push("PWA Service Worker",reg?"pass":"warn",reg?"已啟用":"尚未 ready");
    }catch(e){push("PWA Service Worker","warn","註冊失敗或尚未啟用")}
  }else push("PWA Service Worker","warn","此瀏覽器不支援");
  const api=localStorage.getItem("healthApiUrl")||"";
  if(api){
    try{
      const ping=await apiGet("ping");
      const list=await apiGet("list");
      let customCount="未檢查";
      try{const c=await apiGet("custom_lab_list");customCount=Array.isArray(c.records)?c.records.length:0}catch(e){}
      push("Google Apps Script","pass",`${ping.version||""}・核心 ${Array.isArray(list.records)?list.records.length:0} 筆・自訂 ${customCount} 筆`);
    }catch(e){push("Google Apps Script","fail","連線或讀取失敗："+e.message)}
  }else push("Google Apps Script","warn","尚未設定，現在使用本機資料");
  return checks;
}
function renderProductionChecks(checks){
  const pass=checks.filter(x=>x.status==="pass").length;
  const warn=checks.filter(x=>x.status==="warn").length;
  const fail=checks.filter(x=>x.status==="fail").length;
  const sum=$("#productionCheckSummary");
  if(sum)sum.innerHTML=`<div><b>${pass}</b><span>通過</span></div><div><b>${warn}</b><span>注意</span></div><div><b>${fail}</b><span>失敗</span></div>`;
  const list=$("#productionCheckList");
  if(list)list.innerHTML=checks.map(x=>`<div class="production-check-row status-${x.status}"><span>${x.status==="pass"?"✓":x.status==="warn"?"!":"×"}</span><div><b>${x.name}</b><small>${x.detail}</small></div></div>`).join("");
}
async function runProductionChecks(){
  const btn=$("#runProductionCheckBtn");if(btn){btn.disabled=true;btn.textContent="檢查中…"}
  try{renderProductionChecks(await productionChecks())}
  finally{if(btn){btn.disabled=false;btn.textContent="重新檢查"}}
}
async function importBackupLocal(){
  const file=$("#importJsonFile")?.files?.[0];
  if(!file){$("#backupMsg").textContent="請先選擇 JSON 備份檔。";return}
  try{
    const d=JSON.parse(await file.text());
    if(d.format!=="HealthMonitorBackup"||!Array.isArray(d.core_records)||!Array.isArray(d.custom_labs))throw new Error("不是相容的健康系統備份格式");
    if(!confirm(`將把 ${d.core_records.length} 筆核心資料與 ${d.custom_labs.length} 筆自訂檢驗寫入此裝置的本機資料。Google Sheet 不會被覆蓋。確定繼續？`))return;
    localStorage.setItem("healthLocalData",JSON.stringify(d.core_records));
    localStorage.setItem("healthCustomLabs",JSON.stringify(d.custom_labs));
    $("#backupMsg").textContent="已匯入本機。若目前有設定 Google Sheet，重新整理時仍會以雲端資料為主。";
    if(!localStorage.getItem("healthApiUrl"))location.reload();
  }catch(e){$("#backupMsg").textContent="匯入失敗："+e.message}
}
function renderPwaStatus(){
  const box=$("#pwaStatus");if(!box)return;
  const installed=window.matchMedia?.("(display-mode: standalone)")?.matches||navigator.standalone===true;
  box.innerHTML=`<div><span>網路</span><b>${navigator.onLine?"已連線":"離線"}</b></div>
  <div><span>開啟模式</span><b>${installed?"PWA / 主畫面":"瀏覽器"}</b></div>
  <div><span>Service Worker</span><b>${"serviceWorker" in navigator?"支援":"不支援"}</b></div>`;
}
function updateOnlineState(){
  const b=$("#offlineBanner");if(b)b.hidden=navigator.onLine;
  renderPwaStatus();
}
window.addEventListener("online",updateOnlineState);
window.addEventListener("offline",updateOnlineState);
window.addEventListener("load",()=>{
  updateOnlineState();
  $("#runProductionCheckBtn")?.addEventListener("click",runProductionChecks);
  $("#exportJsonBtn")?.addEventListener("click",exportBackupJson);
  $("#exportCoreCsvBtn")?.addEventListener("click",exportCoreCsv);
  $("#exportCustomCsvBtn")?.addEventListener("click",exportCustomCsv);
  $("#importJsonBtn")?.addEventListener("click",importBackupLocal);
});
