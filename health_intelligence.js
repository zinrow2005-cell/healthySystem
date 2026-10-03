
/* Health Intelligence Engine V15.1 */
(function(){
  const LEVEL_RANK={stable:0,watch:1,priority:2,urgent:3};
  const LEVEL_LABEL={stable:"穩定 / 維持",watch:"持續追蹤",priority:"優先處理",urgent:"高度警示"};
  const LEVEL_CLASS={stable:"intel-stable",watch:"intel-watch",priority:"intel-priority",urgent:"intel-urgent"};
  let DB=null, TESTS=null, REF=null, ADVICE=null, lastResult=null;

  const num=v=>v===null||v===undefined||v===""?null:Number(v);
  const key=d=>{
    if(typeof dateKey==="function")return dateKey(d);
    const s=String(d||""); return s.slice(0,10);
  };
  const disp=d=>typeof displayDate==="function"?displayDate(d):key(d).replaceAll("-","/");
  const bmiValue=w=>w?Number(w)/(HEIGHT_M*HEIGHT_M):null;

  async function loadDB(){
    const [r,t,ref,advice]=await Promise.all([
      fetch("health_rules_v15.json",{cache:"no-store"}).then(x=>x.json()),
      fetch("scenario_tests_v15.json",{cache:"no-store"}).then(x=>x.json()),
      fetch("lab_reference_ranges_v15.json",{cache:"no-store"}).then(x=>x.json()),
      fetch("advice_rules_v15.json",{cache:"no-store"}).then(x=>x.json())
    ]);
    DB=r; TESTS=t; REF=ref; ADVICE=advice; return DB;
  }

  function sortRows(rows){
    return [...(rows||[])].filter(r=>r&&r.date).sort((a,b)=>key(a.date).localeCompare(key(b.date)));
  }
  function latestRowWith(rows,field){
    const a=sortRows(rows).filter(r=>num(r[field])!==null);
    return a.length?a[a.length-1]:null;
  }
  function fieldSeries(rows,field){
    return sortRows(rows).filter(r=>num(r[field])!==null).map(r=>({date:key(r.date),value:num(r[field])}));
  }
  function rangeRule(value,rules){
    if(value===null||!rules)return null;
    return rules.find(r=>{
      if(r.min!==undefined && value<r.min)return false;
      if(r.max_exclusive!==undefined && value>=r.max_exclusive)return false;
      return true;
    })||null;
  }
  function refFinding(module,field,value){
    const r=REF?.fields?.[field];
    if(!r||value===null)return null;
    const {low,high,label,unit,severity_margin_pct=30}=r;
    if(value>=low&&value<=high){
      return finding(module,"stable",label,`${label} 目前位於系統參考範圍內。`,`${value}${unit?" "+unit:""}・參考 ${low}–${high}${unit?" "+unit:""}`,"LAB_RANGE");
    }
    const below=value<low;
    const boundary=below?low:high;
    const pct=Math.abs(value-boundary)/Math.max(Math.abs(boundary),1)*100;
    const level=pct>=severity_margin_pct?"priority":"watch";
    return finding(module,level,label,`${label} ${below?"低於":"高於"}目前設定的參考範圍。`,`目前 ${value}${unit?" "+unit:""}・參考 ${low}–${high}${unit?" "+unit:""}；正式判讀以該次檢驗單範圍為準。`,"LAB_RANGE");
  }
  function finding(module,level,title,message,detail="",source="",meta={}){
    return {module,level,title,message,detail,source,...meta};
  }
  function confidenceFor(rows,fields){
    const dates=new Set();
    let related=0;
    sortRows(rows).forEach(r=>{
      if(fields.some(f=>num(r[f])!==null)){dates.add(key(r.date));related++;}
    });
    if(dates.size>=3)return {level:"high",label:"趨勢信心較高",reason:`已有 ${dates.size} 次相關紀錄`};
    if(dates.size===2)return {level:"medium",label:"趨勢信心中等",reason:"目前只有 2 次相關紀錄"};
    return {level:"low",label:"趨勢信心有限",reason:"目前只有 1 次或沒有可比較紀錄"};
  }
  function worstLevel(findings){
    return findings.reduce((a,f)=>LEVEL_RANK[f.level]>LEVEL_RANK[a]?f.level:a,"stable");
  }
  function trendDirection(series){
    if(series.length<2)return {dir:"insufficient",change:null,pct:null};
    const a=series[series.length-2].value,b=series[series.length-1].value;
    const change=b-a, pct=a!==0?change/Math.abs(a)*100:null;
    return {dir:change>0?"up":change<0?"down":"flat",change,pct};
  }
  function consecutiveDirection(series,n=3){
    const a=series.slice(-n);
    if(a.length<n)return "insufficient";
    const ds=a.slice(1).map((x,i)=>x.value-a[i].value);
    if(ds.every(x=>x>0))return "up";
    if(ds.every(x=>x<0))return "down";
    return "mixed";
  }

  function analyze(rows,opts={}){
    const findings=[], metrics={};
    const all=sortRows(rows);
    const lastField=f=>latestRowWith(all,f);
    const latestNum=f=>{const r=lastField(f);return r?num(r[f]):null};
    const source=id=>id;

    // glucose
    ["fasting_glucose","hba1c"].forEach(f=>{
      const v=latestNum(f); if(v===null)return;
      metrics[f]=v;
      const rr=rangeRule(v,DB.modules.glucose.thresholds[f]);
      if(rr)findings.push(finding("glucose",rr.level,f==="fasting_glucose"?"空腹血糖":"HbA1c",rr.message,`${v}${f==="hba1c"?"%":" mg/dL"}`,source("ADA2026")));
    });
    const fpgS=fieldSeries(all,"fasting_glucose");
    if(fpgS.length>=3 && consecutiveDirection(fpgS,3)==="up" && fpgS.at(-1).value-fpgS.at(-3).value>=DB.modules.glucose.trend.rise_abs.fasting_glucose){
      findings.push(finding("glucose","watch","空腹血糖連續上升","最近 3 次空腹血糖呈連續上升，而且總升幅已超過系統趨勢門檻。","建議檢查近期體重、飲食、睡眠與是否有感染/壓力等因素。","ADA2026"));
    }
    const a1cS=fieldSeries(all,"hba1c");
    if(a1cS.length>=2 && a1cS.at(-1).value<a1cS.at(-2).value && latestNum("fasting_glucose")>=100){
      findings.push(finding("glucose","watch","HbA1c 改善，但空腹血糖仍偏高","長期平均血糖方向改善，但空腹血糖仍在需追蹤範圍。","保留兩種指標一起觀察，不要用單一數字取代整體趨勢。","ADA2026"));
    }

    // kidney
    const egfr=latestNum("egfr");
    if(egfr!==null){
      metrics.egfr=egfr;
      const rr=rangeRule(egfr,DB.modules.kidney.thresholds.egfr);
      if(rr)findings.push(finding("kidney",rr.level,"eGFR",rr.message,`${egfr} mL/min/1.73m²`,"KDIGO2024"));
      const s=fieldSeries(all,"egfr");
      if(s.length>=2){
        const prev=s.at(-2).value,cur=s.at(-1).value;
        const drop=(prev-cur)/Math.abs(prev)*100;
        if(drop>20)findings.push(finding("kidney","priority","eGFR 變化幅度較大","最近一次 eGFR 較前次下降超過 20%。","KDIGO 對已知 CKD 人群指出 >20% 變化超過預期變異並值得評估；一般使用者也應先複查確認。","KDIGO2024"));
      }
    }
    const uacr=latestNum("uacr");
    if(uacr!==null){
      metrics.uacr=uacr;
      const rr=rangeRule(uacr,DB.modules.kidney.thresholds.uacr);
      if(rr)findings.push(finding("kidney",rr.level,"uACR",rr.message,`${uacr} mg/g`,"KDIGO2024"));
      const s=fieldSeries(all,"uacr");
      if(s.length>=2 && s.at(-2).value>0 && s.at(-1).value/s.at(-2).value>=2){
        findings.push(finding("kidney","priority","uACR 較前次倍增","尿白蛋白/肌酸酐比值已較前次至少倍增。","建議複查確認是否為持續變化。","KDIGO2024"));
      }
    }

    // BP
    const sbp=latestNum("systolic_bp"),dbp=latestNum("diastolic_bp");
    if(sbp!==null||dbp!==null){
      metrics.systolic_bp=sbp;metrics.diastolic_bp=dbp;
      let cat=null;
      const cats=DB.modules.blood_pressure.categories;
      if((sbp!==null&&sbp>180)||(dbp!==null&&dbp>120))cat=cats.find(x=>x.id==="severe");
      else if((sbp!==null&&sbp>=140)||(dbp!==null&&dbp>=90))cat=cats.find(x=>x.id==="stage2");
      else if((sbp!==null&&sbp>=130)||(dbp!==null&&dbp>=80))cat=cats.find(x=>x.id==="stage1");
      else if(sbp!==null&&sbp>=120&&sbp<=129&&(dbp===null||dbp<80))cat=cats.find(x=>x.id==="elevated");
      else cat=cats.find(x=>x.id==="normal");
      findings.push(finding("blood_pressure",cat.level,"血壓",cat.message,`${sbp??"—"}/${dbp??"—"} mmHg`,"AHA_BP"));
    }

    // lipids
    ["ldl","triglycerides"].forEach(f=>{
      const v=latestNum(f);if(v===null)return;
      metrics[f]=v;
      const rr=rangeRule(v,DB.modules.lipids.thresholds[f]);
      if(rr)findings.push(finding("lipids",rr.level,f==="ldl"?"LDL-C":"三酸甘油酯",rr.message,`${v} mg/dL`,f==="ldl"?"ACC_AHA_2026_LIPID":"AHA_CHOL"));
    });

    // uric acid
    const ua=latestNum("uric_acid");
    if(ua!==null){
      metrics.uric_acid=ua;
      const rr=rangeRule(ua,DB.modules.uric_acid.thresholds);
      if(rr)findings.push(finding("uric_acid",rr.level,"尿酸",rr.message,`${ua} mg/dL`,"ACR_GOUT_2020"));
    }

    // liver: generic ULN, explicit caveat
    ["alt","ast","ggt"].forEach(f=>{
      const v=latestNum(f);if(v===null)return;
      metrics[f]=v;
      const uln=DB.modules.liver.generic_uln[f];
      const ratio=v/uln;
      let level="stable",msg="目前未超過系統的一般示意上限；正式判讀以檢驗單參考範圍為準。";
      if(ratio>3){level="priority";msg="肝酵素已超過系統一般示意上限 3 倍；建議依檢驗單範圍及醫療評估確認原因。";}
      else if(ratio>1){level="watch";msg="肝酵素高於系統一般示意上限；請優先以該次檢驗單參考範圍判讀並追蹤。";}
      findings.push(finding("liver",level,f.toUpperCase(),msg,`${v} U/L（示意 ULN ${uln}）`,""));
    });

    // weight / BMI
    const w=latestNum("weight");
    if(w!==null){
      metrics.weight=w;
      const b=bmiValue(w);metrics.bmi=b;
      const rr=rangeRule(b,DB.modules.weight.bmi);
      if(rr)findings.push(finding("weight",rr.level,"體重 / BMI",rr.message,`${w.toFixed(1)} kg・BMI ${b.toFixed(1)}`,"TW_HPA_BMI"));
    }


    // Configurable laboratory reference range modules
    [
      ["electrolytes",["sodium","potassium"]],
      ["cbc",["hb","hct","rbc","wbc","plt","mcv","mch","mchc"]],
      ["coagulation",["pt","inr","ptt"]]
    ].forEach(([module,fields])=>{
      fields.forEach(f=>{
        const v=latestNum(f); if(v===null)return;
        metrics[f]=v;
        const rf=refFinding(module,f,v);
        if(rf)findings.push(rf);
      });
    });

    // Combination logic
    const fpg=latestNum("fasting_glucose"), tg=latestNum("triglycerides"), ldl=latestNum("ldl");
    const bmi=metrics.bmi;
    if(fpg!==null&&fpg>=100&&bmi!==undefined&&bmi>=24&&((tg!==null&&tg>=150)||(sbp!==null&&sbp>=130)||(dbp!==null&&dbp>=80))){
      findings.push(finding("combination","priority","多個心血管代謝風險因子集中","血糖、體位與血脂 / 血壓同時出現不理想訊號。","建議把體重、血糖、血壓與血脂當成同一組長期目標管理，而不是逐一處理。",""));
    }
    if(((egfr!==null&&egfr<60)||(uacr!==null&&uacr>=30))&&((sbp!==null&&sbp>=130)||(dbp!==null&&dbp>=80))){
      findings.push(finding("combination","priority","腎臟指標與血壓同時需注意","腎臟指標與血壓同時出現需追蹤訊號。","建議帶完整數值與日期趨勢給醫療人員整體評估。","KDIGO2024"));
    }

    // De-duplicate by title+message, sort by severity
    const seen=new Set();
    const unique=findings.filter(f=>{const k=f.title+"|"+f.message;if(seen.has(k))return false;seen.add(k);return true;})
      .sort((a,b)=>LEVEL_RANK[b.level]-LEVEL_RANK[a.level]);

    const confidences={};
    Object.entries(DB.modules).forEach(([k,m])=>{
      confidences[k]=confidenceFor(all,m.fields||[]);
    });
    return {
      level:worstLevel(unique),
      findings:unique,
      metrics,
      confidences,
      generated_at:new Date().toISOString(),
      record_count:all.length
    };
  }

  function moduleSummary(result){
    const mods={};
    result.findings.forEach(f=>{
      if(!mods[f.module]||LEVEL_RANK[f.level]>LEVEL_RANK[mods[f.module].level])mods[f.module]=f;
    });
    return mods;
  }

  function render(result){
    lastResult=result||analyze(records||[]);
    const root=document.querySelector("#intelligenceSummary");
    const detail=document.querySelector("#intelligenceFindings");
    const coverage=document.querySelector("#intelligenceCoverage");
    if(root){
      const mods=moduleSummary(lastResult);
      root.innerHTML=Object.entries(mods).map(([k,f])=>`<div class="intel-summary-card ${LEVEL_CLASS[f.level]}">
        <span>${DB.modules[k]?.label||({combination:"綜合判讀"}[k]||k)}</span>
        <b>${LEVEL_LABEL[f.level]}</b>
        <small>${f.title}</small>
        ${lastResult.confidences?.[k]?`<em class="intel-confidence ${lastResult.confidences[k].level}">${lastResult.confidences[k].label}</em>`:""}
      </div>`).join("") || "<p>目前沒有足夠資料產生分析。</p>";
    }
    if(detail){
      detail.innerHTML=lastResult.findings.map(f=>`<article class="intel-finding ${LEVEL_CLASS[f.level]}">
        <div class="intel-finding-head"><span>${LEVEL_LABEL[f.level]}</span><b>${f.title}</b></div>
        <p>${f.message}</p>
        ${f.detail?`<div class="intel-detail">${f.detail}</div>`:""}
        ${f.source?`<small>規則來源：${f.source}</small>`:""}
        <details class="intel-why"><summary>為什麼出現這個提醒？</summary><p>系統依目前數值、可用前次紀錄、趨勢與相關規則產生此提醒。${lastResult.confidences?.[f.module]?` ${lastResult.confidences[f.module].reason}。`:""}</p></details>
      </article>`).join("") || "<p>目前資料不足。</p>";
    }
    if(coverage){
      coverage.innerHTML=`<div><b>${Object.keys(DB.modules).length}</b><span>分析模組</span></div>
        <div><b>${TESTS?.count||0}</b><span>情境測試</span></div>
        <div><b>${DB.sources.length}</b><span>指引來源</span></div>
        <div><b>V${DB.version}</b><span>規則庫版本</span></div>`;
    }
    renderReferenceRanges();
    renderAdaptiveLifestyle();
    renderTestStatus();
  }
  function renderReferenceRanges(){
    const el=document.querySelector("#referenceRangeTable"); if(!el||!REF)return;
    el.innerHTML=Object.entries(REF.fields).map(([k,r])=>`<div class="reference-range-item">
      <b>${r.label}</b>
      <span>${r.low}–${r.high}${r.unit?` ${r.unit}`:""}</span>
      <small>可依檢驗單調整</small>
    </div>`).join("");
  }

  function simulatorRecord(){
    const ids=["fasting_glucose","hba1c","creatinine","egfr","uacr","uric_acid","ldl","triglycerides","alt","ast","systolic_bp","diastolic_bp","weight"];
    const r={date:document.querySelector("#simDate")?.value||"2099-01-01"};
    ids.forEach(f=>{const el=document.querySelector("#sim_"+f);if(el&&el.value!=="")r[f]=Number(el.value)});
    return r;
  }
  function runSimulation(){
    const r=simulatorRecord();
    const base=sortRows(records||[]);
    const merged=[...base,r];
    const result=analyze(merged,{simulation:true});
    const box=document.querySelector("#simulationResult");
    if(!box)return;
    box.innerHTML=`<div class="sim-level ${LEVEL_CLASS[result.level]}">模擬結果：${LEVEL_LABEL[result.level]}</div>`+
      result.findings.slice(0,10).map(f=>`<div class="sim-finding ${LEVEL_CLASS[f.level]}"><b>${f.title}</b><p>${f.message}</p>${f.detail?`<small>${f.detail}</small>`:""}</div>`).join("");
  }
  function fillLatest(){
    const fields=["fasting_glucose","hba1c","creatinine","egfr","uacr","uric_acid","ldl","triglycerides","alt","ast","systolic_bp","diastolic_bp","weight"];
    fields.forEach(f=>{const r=latestRowWith(records||[],f),el=document.querySelector("#sim_"+f);if(el)el.value=r?num(r[f]):""});
    const d=document.querySelector("#simDate");
    if(d){
      const s=sortRows(records||[]);const last=s.length?new Date(key(s.at(-1).date)+"T00:00:00+08:00"):new Date();
      last.setDate(last.getDate()+90);d.value=last.toISOString().slice(0,10);
    }
  }

  function preset(name){
    fillLatest();
    const set=(f,v)=>{const e=document.querySelector("#sim_"+f);if(e)e.value=v};
    if(name==="glucose"){set("fasting_glucose",132);set("hba1c",6.6);}
    if(name==="kidney"){set("egfr",52);set("uacr",80);}
    if(name==="bp"){set("systolic_bp",155);set("diastolic_bp",96);}
    if(name==="lipid"){set("ldl",195);set("triglycerides",260);}
    if(name==="improve"){set("fasting_glucose",96);set("hba1c",5.5);set("egfr",82);set("uacr",10);set("ldl",110);set("triglycerides",110);set("systolic_bp",118);set("diastolic_bp",76);}
    runSimulation();
  }

  function evaluateSingleTest(t){
    const prev=t.previous&&Object.keys(t.previous).length?{date:"2026-01-01",...t.previous}:null;
    const cur={date:"2026-06-01",...t.current};
    const rr=analyze(prev?[prev,cur]:[cur],{test:true});
    const exact=(t.match||"exact")==="exact";
    return {pass:exact?rr.level===t.expected_level:LEVEL_RANK[rr.level]>=LEVEL_RANK[t.expected_level],actual:rr.level,expected:t.expected_level};
  }
  function runTests(){
    if(!TESTS)return {pass:0,total:0,failed:[]};
    let pass=0;const failed=[];
    TESTS.tests.forEach(t=>{
      const r=evaluateSingleTest(t);
      if(r.pass)pass++;else failed.push({id:t.id,name:t.name,actual:r.actual,expected:r.expected});
    });
    return {pass,total:TESTS.tests.length,failed};
  }
  function renderTestStatus(){
    const el=document.querySelector("#scenarioTestStatus");if(!el||!TESTS)return;
    const r=runTests();
    el.innerHTML=`<div class="test-pass"><b>${r.pass}/${r.total}</b><span>規則情境測試完全符合預期層級</span></div>
      ${r.failed.length?`<details><summary>${r.failed.length} 個需再檢查</summary><pre>${r.failed.slice(0,20).map(x=>`${x.id} ${x.name}: ${x.actual} / expected ${x.expected}`).join("\n")}</pre></details>`:"<p>目前測試未發現嚴重度低估。</p>"}`;
  }


  function adaptiveAdvice(result){
    const out={diet:[],exercise:[],sleep:[],action:[],followup:[]};
    if(!ADVICE)return out;
    ADVICE.rules.forEach(rule=>{
      const hit=result.findings.some(f=>f.module===rule.module && rule.levels.includes(f.level));
      if(hit && !out[rule.category].includes(rule.text))out[rule.category].push(rule.text);
    });
    Object.entries(ADVICE.defaults||{}).forEach(([k,arr])=>{
      if(out[k] && out[k].length===0)out[k].push(...arr);
    });
    if(out.sleep.length===0)out.sleep.push("維持規律睡眠與固定作息，並觀察睡眠、壓力與代謝數值是否同步變化。");
    return out;
  }
  function renderAdaptiveLifestyle(){
    if(!DB||!ADVICE||typeof records==="undefined")return;
    const result=analyze(records||[]);
    const a=adaptiveAdvice(result);
    const list=x=>`<div class="advice-list">${x.map(v=>`<div class="advice-item">${v}</div>`).join("")}</div>`;
    const diet=document.querySelector("#dietAdvice");
    const ex=document.querySelector("#exerciseAdvice");
    const sl=document.querySelector("#sleepAdvice");
    const act=document.querySelector("#actionAdvice");
    if(diet)diet.innerHTML=list(a.diet);
    if(ex)ex.innerHTML=list(a.exercise);
    if(sl)sl.innerHTML=list(a.sleep);
    if(act){
      const actions=[...a.action,...a.followup];
      act.innerHTML=list(actions.length?actions:["目前以持續記錄與維持既有健康習慣為主。"]);
    }
  }

  function bind(){
    document.querySelector("#runSimulationBtn")?.addEventListener("click",runSimulation);
    document.querySelector("#fillLatestBtn")?.addEventListener("click",fillLatest);
    document.querySelectorAll("[data-sim-preset]").forEach(b=>b.addEventListener("click",()=>preset(b.dataset.simPreset)));
  }

  async function init(){
    try{
      await loadDB();
      bind();
      fillLatest();
      render(analyze(records||[]));
    }catch(e){
      const el=document.querySelector("#intelligenceFindings");
      if(el)el.innerHTML=`<p>健康規則庫載入失敗：${e.message}</p>`;
    }
  }

  window.HealthIntel={init,analyze,render,runTests,fillLatest,runSimulation,getDB:()=>DB,adaptiveAdvice,renderAdaptiveLifestyle};
})();
