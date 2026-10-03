
/* Multi-Marker Clinical Pattern Engine V16.0
   Descriptive decision support only; not diagnostic. */
(function(){
  let DB=null;
  const rank={stable:0,watch:1,priority:2,urgent:3};
  const labels={stable:"改善 / 穩定",watch:"持續追蹤",priority:"優先評估",urgent:"高度警示"};

  const num=v=>v===null||v===undefined||v===""?null:Number(v);
  const coreSeries=(field)=>{
    if(typeof records==="undefined")return [];
    return [...records].filter(r=>r&&r.date&&num(r[field])!==null)
      .map(r=>({date:dateKey(r.date),value:num(r[field]),source:"core"}))
      .sort((a,b)=>a.date.localeCompare(b.date));
  };
  const customSeries=(code)=>{
    if(typeof customLabs==="undefined")return [];
    return [...customLabs].filter(r=>{
      const c=typeof customLabCanonical==="function"?customLabCanonical(r):String(r.test_code||"").toLowerCase();
      return c===code && num(r.value)!==null;
    }).map(r=>({date:dateKey(r.date),value:num(r.value),ref_low:num(r.ref_low),ref_high:num(r.ref_high),source:"custom"}))
      .sort((a,b)=>a.date.localeCompare(b.date));
  };
  function series(field){
    const core=coreSeries(field);
    return core.length?core:customSeries(field);
  }
  const latest=field=>series(field).at(-1)||null;
  const latestVal=field=>latest(field)?.value??null;
  const previousVal=field=>series(field).length>1?series(field).at(-2).value:null;
  const change=field=>{
    const s=series(field); if(s.length<2)return null;
    return s.at(-1).value-s.at(-2).value;
  };
  const refState=field=>{
    const x=latest(field); if(!x)return "missing";
    if(x.ref_low!==null&&x.ref_low!==undefined&&x.value<x.ref_low)return "low";
    if(x.ref_high!==null&&x.ref_high!==undefined&&x.value>x.ref_high)return "high";
    if((x.ref_low!==null&&x.ref_low!==undefined)||(x.ref_high!==null&&x.ref_high!==undefined))return "normal";
    return "unknown";
  };
  const coreLow=(field,v)=>{
    if(v===null)return false;
    const limits={hb:13,mcv:80,potassium:3.5,egfr:60};
    return limits[field]!==undefined?v<limits[field]:false;
  };
  const coreHigh=(field,v)=>{
    if(v===null)return false;
    const limits={fasting_glucose:100,hba1c:5.7,creatinine:1.3,uacr:30,systolic_bp:130,diastolic_bp:80,
      triglycerides:150,ldl:130,alt:40,ast:40,ggt:60,uric_acid:7,potassium:5.1,mcv:100,wbc:10};
    return limits[field]!==undefined?v>=(limits[field]):false;
  };
  function isHigh(f){const s=refState(f);return s==="high" || (s==="unknown"&&coreHigh(f,latestVal(f)))}
  function isLow(f){const s=refState(f);return s==="low" || (s==="unknown"&&coreLow(f,latestVal(f)))}
  function has(f){return latestVal(f)!==null}
  function rising(f,abs=0){const d=change(f);return d!==null&&d>abs}
  function falling(f,abs=0){const d=change(f);return d!==null&&d<-abs}
  function bpElevated(){return (latestVal("systolic_bp")??0)>=130 || (latestVal("diastolic_bp")??0)>=80}
  function kidneyAbnormal(){return (latestVal("egfr")!==null&&latestVal("egfr")<60)||isHigh("uacr")||isHigh("creatinine")}
  function weightHigh(){
    const w=latestVal("weight");if(w===null)return false;
    return (w/(HEIGHT_M*HEIGHT_M))>=24;
  }
  function glucoseAbnormal(){return isHigh("fasting_glucose")||isHigh("hba1c")}
  function urineProteinPositive(){
    if(typeof records==="undefined")return false;
    const rows=[...records].filter(r=>r?.urine_protein).sort((a,b)=>dateKey(a.date).localeCompare(dateKey(b.date)));
    if(!rows.length)return false;
    const v=String(rows.at(-1).urine_protein).toLowerCase();
    return !["negative","陰性","none","0",""].includes(v);
  }

  function finding(system,id,level,title,message,evidence,missing=[]){
    return {system,id,level,title,message,evidence,missing};
  }


  function persistent(field, predicate, n=2){
    const s=series(field); if(s.length<n)return false;
    return s.slice(-n).every(x=>predicate(x.value,x));
  }
  function customHigh(field){return refState(field)==="high"}
  function customLow(field){return refState(field)==="low"}
  function customNormal(field){return refState(field)==="normal"}
  function abnormalCount(fields){
    return fields.filter(f=>isHigh(f)||isLow(f)||customHigh(f)||customLow(f)).length;
  }

  function analyze(){
    const out=[];
    // Kidney
    const eg=latestVal("egfr"), egPrev=previousVal("egfr"), cr=latestVal("creatinine");
    const egDrop=eg!==null&&egPrev!==null&&eg<egPrev;
    const kidneyDamage=isHigh("uacr")||urineProteinPositive();
    if((eg!==null&&(eg<60||egDrop)) && (rising("creatinine",0.05)||kidneyDamage)){
      out.push(finding("kidney_integrated","kidney_concordant_worsening","priority","多項腎臟相關指標呈一致惡化方向",
        "腎功能與腎損傷相關指標呈同方向變化，比單一 eGFR 波動更值得優先複查。",
        evidence(["egfr","creatinine","uacr","systolic_bp","diastolic_bp"])));
    }else if(eg!==null&&eg>=60&&eg<90&&!kidneyDamage&&!rising("creatinine",0.15)){
      out.push(finding("kidney_integrated","kidney_isolated_fluctuation","watch","目前缺乏多項一致性腎損傷訊號",
        "eGFR 介於較低區間，但目前沒有同步出現 uACR / 尿蛋白明顯異常或 Creatinine 大幅上升。",
        evidence(["egfr","creatinine","uacr"])));
    }
    if(kidneyAbnormal()&&bpElevated()){
      out.push(finding("kidney_integrated","kidney_bp_cluster","priority","腎臟指標與血壓同時需要追蹤",
        "腎臟指標與血壓同時偏離理想狀態，建議把兩者當成同一組風險背景評估。",
        evidence(["egfr","uacr","creatinine","systolic_bp","diastolic_bp"])));
    }

    // Metabolic
    if(glucoseAbnormal()&&weightHigh()&&(isHigh("triglycerides")||bpElevated())){
      out.push(finding("metabolic","metabolic_cluster","priority","多個代謝風險因子集中",
        "血糖、體位以及血脂或血壓同時出現不理想訊號，適合用整體代謝風險方式管理。",
        evidence(["fasting_glucose","hba1c","weight","triglycerides","systolic_bp","diastolic_bp"])));
    }
    if(isHigh("fasting_glucose")&&has("hba1c")&&!isHigh("hba1c")){
      out.push(finding("metabolic","glycemia_discordance","watch","空腹血糖與 HbA1c 方向不完全一致",
        "空腹血糖偏高，但 HbA1c 尚未同步進入異常區間；兩者代表不同時間尺度，應持續一起追蹤。",
        evidence(["fasting_glucose","hba1c"])));
    }
    if(falling("fasting_glucose")&&falling("weight")&&(falling("triglycerides")||(!bpElevated()&&has("systolic_bp")))){
      out.push(finding("metabolic","metabolic_improving","stable","多項代謝指標呈改善方向",
        "血糖、體重以及血脂 / 血壓有同步改善訊號，代表目前生活管理方向可能具有一致性效果。",
        evidence(["fasting_glucose","weight","triglycerides","systolic_bp","diastolic_bp"])));
    }

    // Liver + metabolic
    if((isHigh("alt")||isHigh("ast")||isHigh("ggt"))&&(weightHigh()||isHigh("triglycerides")||glucoseAbnormal())){
      out.push(finding("liver_metabolic","liver_metabolic_cluster","watch","肝酵素與代謝指標同時偏離",
        "肝酵素異常同時伴隨體位、血脂或血糖問題，建議在代謝背景下整體評估，並以檢驗單參考範圍為主。",
        evidence(["alt","ast","ggt","weight","triglycerides","fasting_glucose","hba1c"])));
    }

    // Iron / anemia
    if(isLow("hb")&&isLow("mcv")&&(isLow("ferritin")||isLow("transferrin_saturation")||isLow("iron"))){
      out.push(finding("iron_anemia","microcytic_iron_pattern","priority","小球性貧血合併缺鐵方向的組合",
        "血紅素、MCV 與鐵代謝指標呈一致方向，符合缺鐵相關模式；仍需確認原因與臨床背景。",
        evidence(["hb","mcv","ferritin","iron","tibc","transferrin_saturation"])));
    }else if(isLow("hb")&&isHigh("mcv")){
      out.push(finding("iron_anemia","macrocytic_pattern","watch","血紅素下降且 MCV 偏高",
        "此組合需要再搭配 Vitamin B12、葉酸、肝功能與甲狀腺等資料判讀。",
        evidence(["hb","mcv","vitamin_b12","folate","tsh","alt"])));
    }

    // Thyroid, only using lab-provided custom ranges for TSH/FT4
    if(refState("tsh")==="high"&&refState("free_t4")==="low"){
      out.push(finding("thyroid","tsh_high_ft4_low","priority","TSH 高、Free T4 低的甲狀腺功能低下方向",
        "此組合與原發性甲狀腺功能低下方向相符，但仍需依症狀與醫療評估確認。",
        evidence(["tsh","free_t4"])));
    }
    if(refState("tsh")==="low"&&refState("free_t4")==="high"){
      out.push(finding("thyroid","tsh_low_ft4_high","priority","TSH 低、Free T4 高的甲狀腺功能亢進方向",
        "此組合與甲狀腺功能亢進方向相符，但仍需依症狀與醫療評估確認。",
        evidence(["tsh","free_t4"])));
    }

    // Inflammation
    if((refState("crp")==="high"||refState("hs_crp")==="high")&&(isHigh("wbc")||refState("neutrophils")==="high"||refState("procalcitonin")==="high")){
      out.push(finding("inflammation","inflammation_concordant","priority","多項發炎相關指標同步升高",
        "多個發炎相關指標同方向升高，比單一 CRP 更值得結合症狀與臨床情況評估。",
        evidence(["crp","hs_crp","wbc","neutrophils","procalcitonin"])));
    }

    // Electrolytes + renal
    if((isHigh("potassium")||isLow("potassium"))&&kidneyAbnormal()){
      out.push(finding("electrolyte_renal","potassium_kidney","priority","鉀離子異常合併腎功能異常",
        "鉀離子與腎功能同時異常時需要更謹慎，建議及早複查與醫療評估，不自行大量補鉀或限鉀。",
        evidence(["potassium","creatinine","egfr"])));
    }

    // Lipid/cardiometabolic
    if(isHigh("ldl")&&(isHigh("triglycerides")||refState("apob")==="high"||refState("lpa")==="high")&&(glucoseAbnormal()||bpElevated()||weightHigh())){
      out.push(finding("lipid_cardiometabolic","atherogenic_cluster","priority","多個心血管代謝風險指標集中",
        "血脂與血糖、血壓或體位風險同時存在，適合做整體心血管風險評估。",
        evidence(["ldl","triglycerides","apob","lpa","fasting_glucose","hba1c","weight","systolic_bp","diastolic_bp"])));
    }

    // Uric / kidney
    if(isHigh("uric_acid")&&kidneyAbnormal()){
      out.push(finding("uric_kidney","uric_kidney_cluster","watch","尿酸偏高且腎功能同時需要追蹤",
        "尿酸與腎功能應一起解讀，避免只追求單一尿酸數字。",
        evidence(["uric_acid","creatinine","egfr","uacr"])));
    }

    // Pancreatic enzymes: custom ranges only
    if(refState("lipase")==="high"&&refState("amylase")==="high"){
      out.push(finding("pancreas","pancreatic_enzymes_high","priority","胰臟酵素同時高於檢驗單參考範圍",
        "兩項胰臟酵素同時升高需結合腹痛、噁心等症狀與醫療評估；系統不以此直接診斷胰臟炎。",
        evidence(["lipase","amylase"])));
    }


    // Kidney: persistent / albuminuria with preserved eGFR
    if((isHigh("uacr")||urineProteinPositive()) && latestVal("egfr")!==null && latestVal("egfr")>=60){
      out.push(finding("kidney_integrated","kidney_albuminuria_without_low_egfr","watch","eGFR 尚可但尿白蛋白／蛋白尿異常",
        "eGFR 尚未明顯下降，但腎損傷標記出現異常，仍需要確認是否持續。",
        evidence(["egfr","uacr","urine_protein"])));
    }
    if(persistent("egfr",v=>v<60,2)){
      out.push(finding("kidney_integrated","kidney_persistent_low_egfr","priority","eGFR 持續偏低",
        "最近至少兩次 eGFR 都低於 60，持續性比單次異常更值得醫療評估。",
        evidence(["egfr","creatinine","uacr"])));
    }

    // Glucose concordant worsening / weight relation
    if(rising("fasting_glucose")&&rising("hba1c")){
      out.push(finding("metabolic","glycemia_concordant_worsening","priority","空腹血糖與 HbA1c 同時惡化",
        "短期與較長期血糖指標呈同方向惡化，代表趨勢一致性較高。",
        evidence(["fasting_glucose","hba1c","weight"])));
    }
    if(rising("weight")&&rising("fasting_glucose")){
      out.push(finding("metabolic","weight_glucose_link","watch","體重與血糖呈同方向惡化",
        "體重與空腹血糖同時上升，適合一起檢視飲食、活動與近期生活變化。",
        evidence(["weight","fasting_glucose","hba1c"])));
    }

    // Liver patterning - custom tests depend on entered lab range
    if((isHigh("alt")||isHigh("ast")) && !(customHigh("alp")||customHigh("ggt"))){
      out.push(finding("liver_metabolic","hepatocellular_pattern","priority","轉胺酶為主的肝細胞型異常方向",
        "ALT / AST 的異常比 ALP / GGT 更突出，屬肝細胞型方向；仍需結合幅度、症狀與病因評估。",
        evidence(["alt","ast","alp","ggt","bilirubin_total"])));
    }
    if((customHigh("alp")||isHigh("ggt")) && !(isHigh("alt")&&isHigh("ast"))){
      out.push(finding("liver_metabolic","cholestatic_pattern","priority","ALP / GGT 為主的膽汁鬱積型異常方向",
        "ALP / GGT 的異常較突出，需再搭配膽紅素與臨床背景判讀。",
        evidence(["alp","ggt","bilirubin_total","bilirubin_direct","alt","ast"])));
    }
    if(customHigh("bilirubin_total")||customHigh("bilirubin_direct")){
      out.push(finding("liver_metabolic","bilirubin_pattern","watch","膽紅素異常需要進一步分型",
        "總膽紅素或直接膽紅素超出檢驗單參考範圍，建議與其他肝膽指標一起解讀。",
        evidence(["bilirubin_total","bilirubin_direct","alt","ast","alp","ggt"])));
    }
    if(customLow("albumin")&&(isHigh("alt")||isHigh("ast")||customHigh("bilirubin_total"))){
      out.push(finding("liver_metabolic","liver_synthetic_signal","priority","白蛋白下降合併其他肝功能異常",
        "白蛋白偏低且同時有其他肝膽異常訊號，需整體評估；白蛋白也可能受營養與發炎影響。",
        evidence(["albumin","total_protein","alt","ast","bilirubin_total","crp"])));
    }

    // Anemia extensions
    if(isLow("hb") && !isLow("mcv") && !isHigh("mcv")){
      out.push(finding("iron_anemia","normocytic_anemia_pattern","watch","正球性貧血方向",
        "Hb 偏低而 MCV 沒有明顯偏高或偏低，需結合腎功能、發炎與鐵代謝資料進一步判讀。",
        evidence(["hb","mcv","creatinine","egfr","ferritin","crp"])));
    }
    if(customLow("ferritin") && !isLow("hb")){
      out.push(finding("iron_anemia","iron_depletion_without_anemia","watch","鐵儲存下降但血紅素尚未明顯下降",
        "Ferritin 已低於檢驗單參考範圍，但 Hb 尚未下降，可能屬較早期的鐵儲存不足方向。",
        evidence(["ferritin","hb","mcv","iron","transferrin_saturation"])));
    }
    if(isLow("hb")&&isHigh("mcv")&&(customLow("vitamin_b12")||customLow("folate"))){
      out.push(finding("iron_anemia","b12_folate_pattern","priority","巨球性變化合併 B12 / 葉酸不足方向",
        "Hb 偏低、MCV 偏高且 B12 或葉酸低於參考範圍，呈現一致的營養性巨球性變化方向。",
        evidence(["hb","mcv","vitamin_b12","folate"])));
    }

    // Thyroid subclinical + antibodies
    if(refState("tsh")==="high"&&customNormal("free_t4")){
      out.push(finding("thyroid","subclinical_hypothyroid_pattern","watch","TSH 高但 Free T4 尚在參考範圍",
        "這是常見的亞臨床低功能方向模式，仍需結合持續性、症狀與醫療評估。",
        evidence(["tsh","free_t4","anti_tpo"])));
    }
    if(refState("tsh")==="low"&&customNormal("free_t4")){
      out.push(finding("thyroid","subclinical_hyperthyroid_pattern","watch","TSH 低但 Free T4 尚在參考範圍",
        "這是亞臨床高功能方向模式之一，仍需依重複檢驗與臨床背景確認。",
        evidence(["tsh","free_t4","free_t3"])));
    }
    if(customHigh("anti_tpo")||customHigh("anti_tg")){
      out.push(finding("thyroid","thyroid_autoimmune_signal","watch","甲狀腺自體抗體異常訊號",
        "甲狀腺自體抗體超出檢驗單參考範圍，需和 TSH / Free T4 及症狀一起解讀。",
        evidence(["anti_tpo","anti_tg","tsh","free_t4"])));
    }

    // Inflammation extensions
    if((customHigh("crp")||customHigh("hs_crp")) && !(isHigh("wbc")||customHigh("neutrophils")||customHigh("procalcitonin"))){
      out.push(finding("inflammation","isolated_crp_signal","watch","單一 CRP / hs-CRP 升高",
        "目前主要是 CRP 類指標異常，其他發炎指標未形成一致模式，應結合症狀與後續變化。",
        evidence(["crp","hs_crp","wbc","neutrophils","procalcitonin"])));
    }
    if(isHigh("wbc")&&customHigh("neutrophils")){
      out.push(finding("inflammation","wbc_neutrophil_pattern","watch","白血球與嗜中性球同時升高",
        "白血球與嗜中性球同方向升高，代表發炎 / 感染訊號較單一 WBC 更一致，但仍需症狀背景。",
        evidence(["wbc","neutrophils","crp","procalcitonin"])));
    }
    if(falling("crp")&&falling("wbc")){
      out.push(finding("inflammation","inflammation_resolving","stable","多項發炎指標同步下降",
        "CRP 與 WBC 同步下降，呈現發炎訊號緩解方向。",
        evidence(["crp","wbc","neutrophils"])));
    }

    // Electrolytes
    if(customHigh("sodium")||customLow("sodium")||isHigh("sodium")||isLow("sodium")){
      out.push(finding("electrolyte_renal","sodium_abnormal_pattern","priority","鈉離子明顯異常",
        "鈉離子超出參考範圍時需結合水分狀態、用藥與腎功能評估。",
        evidence(["sodium","creatinine","egfr","glucose"])));
    }
    if((customHigh("bicarbonate")||customLow("bicarbonate"))&&kidneyAbnormal()){
      out.push(finding("electrolyte_renal","bicarbonate_renal_pattern","watch","碳酸氫根異常合併腎功能變化",
        "酸鹼相關指標與腎功能同時異常時，需進一步確認原因。",
        evidence(["bicarbonate","creatinine","egfr","potassium"])));
    }
    if((customHigh("calcium")||customLow("calcium"))&&(customHigh("magnesium")||customLow("magnesium"))){
      out.push(finding("electrolyte_renal","calcium_magnesium_pattern","watch","鈣 / 鎂同時異常",
        "鈣與鎂同時超出檢驗單參考範圍，建議確認是否持續並結合相關用藥與腎功能。",
        evidence(["calcium","magnesium","phosphorus","egfr"])));
    }

    // Lipids
    if(has("apob")&&has("ldl") && ((customHigh("apob")&&!isHigh("ldl")) || (!customHigh("apob")&&isHigh("ldl")))){
      out.push(finding("lipid_cardiometabolic","ldl_apob_discordance","watch","LDL-C 與 ApoB 訊號不一致",
        "LDL-C 與 ApoB 呈現不同風險訊號，單看 LDL-C 可能不足，適合一起解讀。",
        evidence(["ldl","apob","non_hdl","triglycerides"])));
    }
    if(isHigh("triglycerides")&&customLow("hdl")){
      out.push(finding("lipid_cardiometabolic","tg_hdl_pattern","watch","TG 偏高合併 HDL 偏低方向",
        "TG 與 HDL 呈現較不利的代謝組合，建議與體重、血糖與血壓一起管理。",
        evidence(["triglycerides","hdl","weight","fasting_glucose","systolic_bp"])));
    }
    if(falling("ldl")&&falling("triglycerides")){
      out.push(finding("lipid_cardiometabolic","lipid_improving","stable","多項血脂指標同步改善",
        "LDL-C 與 TG 同步下降，呈現血脂整體改善方向。",
        evidence(["ldl","triglycerides","hdl","apob"])));
    }

    // Uric improvement
    if(falling("uric_acid") && !kidneyAbnormal()){
      out.push(finding("uric_kidney","uric_improving_kidney_stable","stable","尿酸改善且腎功能相對穩定",
        "尿酸下降且目前沒有形成明顯腎功能異常模式，方向上屬較有利變化。",
        evidence(["uric_acid","egfr","creatinine","uacr"])));
    }

    // Pancreas isolated
    if(customHigh("lipase")&&!customHigh("amylase")){
      out.push(finding("pancreas","isolated_lipase_high","watch","Lipase 單獨升高",
        "Lipase 超出檢驗單範圍但 Amylase 未同步升高，需結合症狀與重複檢驗判讀。",
        evidence(["lipase","amylase"])));
    }

    // Bone / mineral
    if(customLow("vitamin_d")){
      out.push(finding("bone_mineral","vitd_low_pattern","watch","Vitamin D 低於檢驗單參考範圍",
        "Vitamin D 偏低時可和鈣、磷、PTH 及骨骼風險一起評估。",
        evidence(["vitamin_d","calcium","phosphorus","pth"])));
    }
    if((customHigh("pth")||customLow("pth"))&&(customHigh("calcium")||customLow("calcium"))){
      out.push(finding("bone_mineral","pth_calcium_pattern","priority","PTH 與鈣異常的組合訊號",
        "PTH 與鈣同時異常需要整體判讀，單看其中一項容易誤解。",
        evidence(["pth","calcium","phosphorus","vitamin_d","egfr"])));
    }
    if((customHigh("calcium")||customLow("calcium"))&&(customHigh("phosphorus")||customLow("phosphorus"))){
      out.push(finding("bone_mineral","calcium_phosphate_pattern","watch","鈣磷同時異常",
        "鈣與磷同時異常時，可進一步搭配 PTH、Vitamin D 與腎功能評估。",
        evidence(["calcium","phosphorus","pth","vitamin_d","egfr"])));
    }

    // Coagulation
    const coagAb=abnormalCount(["pt","inr","ptt","fibrinogen","d_dimer"]);
    if(coagAb>=2){
      out.push(finding("coagulation","coag_multiple_abnormal","priority","多項凝血指標同時異常",
        "兩項以上凝血指標同時超出參考範圍，需結合用藥與臨床背景評估。",
        evidence(["pt","inr","ptt","fibrinogen","d_dimer"])));
    }
    if((isLow("plt")||customLow("plt"))&&coagAb>=1){
      out.push(finding("coagulation","platelet_coag_cluster","priority","血小板與凝血指標同時異常",
        "血小板與凝血檢驗同時異常時，需要比單一項目更謹慎。",
        evidence(["plt","pt","inr","ptt","fibrinogen"])));
    }
    if(customHigh("d_dimer")&&coagAb===1){
      out.push(finding("coagulation","isolated_d_dimer","watch","D-Dimer 單獨升高需結合臨床背景",
        "D-Dimer 缺乏特異性，單獨升高不能直接代表血栓，需依症狀與臨床風險判讀。",
        evidence(["d_dimer","pt","ptt","plt"])));
    }

    // Urinalysis
    if(urineProteinPositive()&&(String(latestVal("urine_blood")||"").toLowerCase().includes("+")||customHigh("urine_rbc"))){
      out.push(finding("urinalysis","protein_blood_cluster","priority","尿蛋白與尿潛血 / 尿紅血球同時異常",
        "尿蛋白與血尿訊號同時存在時，比單一尿液項目更值得進一步確認。",
        evidence(["uacr","urine_rbc","egfr","creatinine"])));
    }
    if((customHigh("urine_wbc")||String(latestVal("urine_leukocyte")||"").toLowerCase().includes("+")) &&
       String(latestVal("urine_nitrite")||"").toLowerCase().includes("+")){
      out.push(finding("urinalysis","pyuria_nitrite_pattern","watch","尿白血球 / 白血球酯酶合併亞硝酸鹽異常",
        "這組尿液訊號較支持泌尿道感染方向，但仍需結合症狀與必要時培養確認。",
        evidence(["urine_wbc","urine_leukocyte","urine_nitrite"])));
    }
    if((String(latestVal("urine_blood")||"").toLowerCase().includes("+")||customHigh("urine_rbc"))&&!urineProteinPositive()){
      out.push(finding("urinalysis","isolated_hematuria_signal","watch","單獨血尿訊號需持續確認",
        "目前主要是血尿訊號，沒有形成蛋白尿群聚，仍建議依持續性與臨床背景追蹤。",
        evidence(["urine_rbc","uacr","egfr"])));
    }

    // Cardiac markers - reference-range based only
    if(customHigh("troponin_i")||customHigh("troponin_t")){
      out.push(finding("cardiac_markers","troponin_high","priority","Troponin 高於檢驗單參考範圍",
        "Troponin 異常屬需要優先結合症狀與臨床評估的心肌損傷訊號，系統不自行判定心肌梗塞。",
        evidence(["troponin_i","troponin_t","ck_mb"])));
    }
    if(customHigh("bnp")||customHigh("nt_probnp")){
      out.push(finding("cardiac_markers","natriuretic_peptide_high","priority","BNP / NT-proBNP 高於檢驗單參考範圍",
        "利鈉胜肽升高需結合年齡、腎功能、症狀與心臟評估，不以單一數值直接診斷心衰竭。",
        evidence(["bnp","nt_probnp","egfr","creatinine"])));
    }
    if(abnormalCount(["troponin_i","troponin_t","ck_mb","bnp","nt_probnp"])>=2){
      out.push(finding("cardiac_markers","multi_cardiac_marker","priority","多項心臟相關標記同時異常",
        "多個心臟相關標記同時超出參考範圍，建議優先臨床評估。",
        evidence(["troponin_i","troponin_t","ck_mb","bnp","nt_probnp"])));
    }

    // Nutrition / protein
    if(customLow("albumin")&&customLow("prealbumin")){
      out.push(finding("nutrition_protein","albumin_prealbumin_low","watch","Albumin / Prealbumin 下降",
        "兩項蛋白營養相關指標同時偏低，需要結合發炎、肝腎功能與攝食情況，不宜直接等同營養不良。",
        evidence(["albumin","prealbumin","total_protein","crp","weight"])));
    }
    if((customLow("albumin")||customLow("prealbumin"))&&(customHigh("crp")||customHigh("hs_crp"))){
      out.push(finding("nutrition_protein","protein_inflammation_context","watch","低蛋白指標合併發炎訊號",
        "蛋白相關指標偏低同時伴隨發炎訊號時，發炎本身可能影響解讀。",
        evidence(["albumin","prealbumin","crp","hs_crp","weight"])));
    }

    return out.sort((a,b)=>rank[b.level]-rank[a.level]);
  }

  function evidence(fields){
    return fields.map(f=>{
      const s=series(f),x=s.at(-1);
      if(!x)return null;
      const d=s.length>1?x.value-s.at(-2).value:null;
      return {field:f,value:x.value,date:x.date,change:d,ref_state:refState(f)};
    }).filter(Boolean);
  }

  function systemGaps(){
    if(!DB)return [];
    return DB.systems.map(sys=>{
      const present=sys.markers.filter(f=>has(f));
      const missing=sys.markers.filter(f=>!has(f));
      const coverage=Math.round(present.length/sys.markers.length*100);
      return {id:sys.id,label:sys.label,present,missing,coverage};
    }).sort((a,b)=>a.coverage-b.coverage);
  }

  function displayName(f){
    const names={creatinine:"Creatinine",egfr:"eGFR",uacr:"uACR",urine_protein:"尿蛋白",
      systolic_bp:"收縮壓",diastolic_bp:"舒張壓",fasting_glucose:"空腹血糖",hba1c:"HbA1c",weight:"體重",
      triglycerides:"TG",ldl:"LDL-C",hdl:"HDL-C",alt:"ALT",ast:"AST",ggt:"GGT",hb:"Hb",mcv:"MCV",
      ferritin:"Ferritin",iron:"Iron",tibc:"TIBC",transferrin_saturation:"TSAT",tsh:"TSH",free_t4:"Free T4",
      crp:"CRP",hs_crp:"hs-CRP",wbc:"WBC",neutrophils:"Neutrophils",procalcitonin:"Procalcitonin",
      potassium:"K",uric_acid:"尿酸",apob:"ApoB",lpa:"Lp(a)",lipase:"Lipase",amylase:"Amylase",
      vitamin_b12:"Vitamin B12",folate:"Folate"};
    return names[f]||f;
  }

  function render(){
    if(!DB)return;
    const findings=analyze();
    const sum=document.querySelector("#patternSummary");
    const out=document.querySelector("#patternFindings");
    const gaps=document.querySelector("#patternDataGaps");
    const stats=document.querySelector("#patternEngineStats");

    if(stats)stats.innerHTML=`<b>${DB.systems.length}</b><span>聯合分析群組</span><b>${DB.systems.reduce((s,x)=>s+x.patterns.length,0)}</b><span>模式規則</span>`;
    if(sum){
      const by={};
      findings.forEach(f=>{if(!by[f.system]||rank[f.level]>rank[by[f.system].level])by[f.system]=f});
      sum.innerHTML=Object.entries(by).map(([id,f])=>{
        const sys=DB.systems.find(x=>x.id===id);
        return `<div class="pattern-summary-card level-${f.level}"><span>${sys?.label||id}</span><b>${labels[f.level]}</b><small>${f.title}</small></div>`;
      }).join("")||"<p class='small'>目前資料沒有形成已建立的多指標風險模式；仍需持續累積資料。</p>";
    }
    if(out){
      out.innerHTML=findings.map(f=>{
        const ev=f.evidence.map(e=>`<span><b>${displayName(e.field)}</b> ${fmt(e.value,2)}${e.change===null?"":` (${e.change>0?"+":""}${fmt(e.change,2)})`}</span>`).join("");
        const evCount=f.evidence.length;
        const confidence=evCount>=4?"較高":evCount>=2?"中等":"有限";
        return `<article class="pattern-finding level-${f.level}">
          <div class="pattern-head"><span>${labels[f.level]}</span><b>${f.title}</b><em class="pattern-confidence">證據完整度：${confidence}</em></div>
          <p>${f.message}</p>
          <div class="pattern-evidence">${ev||"目前主要依可用資料判讀"}</div>
          <small>此為模式辨識，不等同疾病診斷。</small>
        </article>`;
      }).join("")||"<p class='small'>目前沒有符合既有聯合模式的結果。</p>";
    }
    if(gaps){
      const rows=systemGaps().slice(0,6);
      gaps.innerHTML=rows.map(g=>`<div class="gap-row">
        <div><b>${g.label}</b><span>資料覆蓋 ${g.coverage}%</span></div>
        <div class="gap-bar"><i style="width:${g.coverage}%"></i></div>
        <small>${g.missing.length?`若未來有檢驗，可補：${g.missing.slice(0,5).map(displayName).join("、")}`:"目前主要指標已具備"}</small>
      </div>`).join("");
    }
  }

  async function init(){
    try{
      DB=await fetch("multi_marker_patterns_v16.json",{cache:"no-store"}).then(r=>r.json());
      render();
    }catch(e){
      const x=document.querySelector("#patternFindings");if(x)x.innerHTML=`<p class="small">多指標規則庫載入失敗：${e.message}</p>`;
    }
  }

  window.MultiMarker={init,render,analyze,getDB:()=>DB};
  window.addEventListener("load",init);
})();
