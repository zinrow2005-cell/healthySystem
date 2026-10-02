const LAB_SHEET='health_records';

function doGet(e){
  const action=(e&&e.parameter&&e.parameter.action)||'list';
  if(action==='ping') return json_({ok:true,version:'V14.4'});
  if(action==='list') return list_();
  return json_({ok:false,error:'unknown action'});
}
function doPost(e){
  try{
    const body=JSON.parse((e&&e.postData&&e.postData.contents)||'{}');
    if(body.action==='upsert'||body.action==='add') return upsert_(body.record||{});
    if(body.action==='delete_weight') return deleteWeight_(body.date||'');
    return json_({ok:false,error:'unknown action'});
  }catch(err){return json_({ok:false,error:String(err)})}
}
function headers_(){
  return ['date','weight','systolic_bp','diastolic_bp','fasting_glucose','hba1c','creatinine','bun','egfr','uric_acid','uacr','urine_protein','urine_blood','total_cholesterol','ldl','hdl','triglycerides','ast','alt','ggt','sodium','potassium','hb','hct','rbc','wbc','plt','mcv','mch','mchc','pt','inr','ptt'];
}
function sheet_(){
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  let sh=ss.getSheetByName(LAB_SHEET);
  if(!sh){sh=ss.insertSheet(LAB_SHEET);sh.appendRow(headers_());return sh}
  if(sh.getLastRow()===0){sh.appendRow(headers_());return sh}
  const current=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(String);
  const missing=headers_().filter(h=>!current.includes(h));
  if(missing.length) sh.getRange(1,current.length+1,1,missing.length).setValues([missing]);
  return sh;
}
function currentHeaders_(sh){
  return sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(String);
}
function list_(){
  const sh=sheet_(),hs=currentHeaders_(sh),values=sh.getDataRange().getValues();
  if(values.length<2)return json_({ok:true,records:[]});
  const records=values.slice(1).filter(r=>r[0]).map(row=>{
    const o={};hs.forEach((h,i)=>{let v=row[i];if(v instanceof Date)v=Utilities.formatDate(v,Session.getScriptTimeZone(),'yyyy-MM-dd');o[h]=v});return o
  });
  return json_({ok:true,records});
}
function upsert_(record){
  if(!record.date)return json_({ok:false,error:'date required'});
  const sh=sheet_(),hs=currentHeaders_(sh),values=sh.getDataRange().getValues();
  let rowNum=-1;
  for(let i=1;i<values.length;i++){
    let d=values[i][0];if(d instanceof Date)d=Utilities.formatDate(d,Session.getScriptTimeZone(),'yyyy-MM-dd');
    if(String(d)===String(record.date)){rowNum=i+1;break}
  }
  const clean={};Object.keys(record).forEach(k=>{const v=record[k];if(v!==null&&v!==undefined&&v!=="")clean[k]=v});
  if(rowNum<0){
    sh.appendRow(hs.map(h=>clean[h]!==undefined?clean[h]:''));
  }else{
    const existing=sh.getRange(rowNum,1,1,hs.length).getValues()[0];
    hs.forEach((h,i)=>{if(clean[h]!==undefined)existing[i]=clean[h]});
    sh.getRange(rowNum,1,1,hs.length).setValues([existing]);
  }
  return json_({ok:true});
}
function json_(obj){return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON)}

function deleteWeight_(date){
  if(!date)return json_({ok:false,error:'date required'});
  const sh=sheet_(),hs=currentHeaders_(sh),values=sh.getDataRange().getValues();
  const widx=hs.indexOf('weight');
  if(widx<0)return json_({ok:false,error:'weight column missing'});
  for(let i=1;i<values.length;i++){
    let d=values[i][0];if(d instanceof Date)d=Utilities.formatDate(d,Session.getScriptTimeZone(),'yyyy-MM-dd');
    if(String(d)===String(date)){
      sh.getRange(i+1,widx+1).clearContent();
      const row=sh.getRange(i+1,1,1,hs.length).getValues()[0];
      const nonDate=row.slice(1).some(v=>v!==''&&v!==null);
      if(!nonDate) sh.deleteRow(i+1);
      return json_({ok:true});
    }
  }
  return json_({ok:true});
}
