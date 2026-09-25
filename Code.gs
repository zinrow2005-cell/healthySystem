const LAB_SHEET = 'health_records';
const DAILY_SHEET = 'daily_logs';
const WEARABLE_SHEET = 'wearable_daily';

function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || 'list';
  if (action === 'ping') return json_({ok:true, version:'V13.9.1'});
  if (action === 'list') return listSheet_(LAB_SHEET, getLabHeaders_());
  if (action === 'daily_list') return listSheet_(DAILY_SHEET, getDailyHeaders_());
  if (action === 'wearable_list') return listSheet_(WEARABLE_SHEET, getWearableHeaders_());
  return json_({ok:false,error:'unknown action'});
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents || '{}');
    if (body.action === 'add') return appendRecord_(LAB_SHEET, getLabHeaders_(), body.record || {});
    if (body.action === 'daily_upsert') return upsertDaily_(body.record || {});
    if (body.action === 'wearable_upsert') return upsertWearable_(body.record || {});
    return json_({ok:false,error:'unknown action'});
  } catch (err) {
    return json_({ok:false,error:String(err)});
  }
}

function listSheet_(sheetName, headers) {
  const sh = getSheet_(sheetName, headers);
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return json_({ok:true,records:[]});
  const hs = values[0].map(String);
  const records = values.slice(1).filter(r=>r[0]).map(row=>{
    const obj = {};
    hs.forEach((h,i)=>{
      let v=row[i];
      if (v instanceof Date) v=Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      obj[h]=v;
    });
    return obj;
  });
  return json_({ok:true,records:records});
}

function appendRecord_(sheetName, headers, record) {
  if (!record.date) return json_({ok:false,error:'date required'});
  const sh = getSheet_(sheetName, headers);
  sh.appendRow(headers.map(h => record[h] === undefined || record[h] === null ? '' : record[h]));
  return json_({ok:true});
}

function upsertDaily_(record) {
  if (!record.date) return json_({ok:false,error:'date required'});
  const headers = getDailyHeaders_();
  const sh = getSheet_(DAILY_SHEET, headers);
  const values = sh.getDataRange().getValues();
  let targetRow = -1;
  for (let i=1;i<values.length;i++) {
    let d=values[i][0];
    if (d instanceof Date) d=Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    if (String(d) === String(record.date)) { targetRow=i+1; break; }
  }
  const row=headers.map(h => record[h] === undefined || record[h] === null ? '' : record[h]);
  if (targetRow > 0) sh.getRange(targetRow,1,1,headers.length).setValues([row]);
  else sh.appendRow(row);
  return json_({ok:true});
}


function upsertWearable_(record) {
  if (!record.date) return json_({ok:false,error:'date required'});
  const headers = getWearableHeaders_();
  const sh = getSheet_(WEARABLE_SHEET, headers);
  const values = sh.getDataRange().getValues();
  let targetRow = -1;
  for (let i=1;i<values.length;i++) {
    let d=values[i][0];
    if (d instanceof Date) d=Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    if (String(d) === String(record.date)) { targetRow=i+1; break; }
  }
  const row=headers.map(h => record[h] === undefined || record[h] === null ? '' : record[h]);
  if (targetRow > 0) sh.getRange(targetRow,1,1,headers.length).setValues([row]);
  else sh.appendRow(row);
  return json_({ok:true});
}

function getWearableHeaders_() {
  return [
    'date','steps','distance_km','active_calories','exercise_minutes',
    'avg_hr','resting_hr','spo2','min_spo2',
    'sleep_hours','deep_sleep_hours','rem_sleep_hours','source'
  ];
}

function getSheet_(sheetName, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(sheetName);
  if (!sh) {
    sh = ss.insertSheet(sheetName);
    sh.appendRow(headers);
  } else if (sh.getLastRow() === 0) {
    sh.appendRow(headers);
  }
  return sh;
}

function getLabHeaders_() {
  return [
    'date','weight','systolic_bp','diastolic_bp',
    'fasting_glucose','hba1c',
    'creatinine','bun','egfr','uric_acid','uacr','urine_protein','urine_blood',
    'total_cholesterol','ldl','hdl','triglycerides',
    'ast','alt','ggt','sodium','potassium',
    'hb','hct','rbc','wbc','plt','mcv','mch','mchc','pt','inr','ptt'
  ];
}
function getDailyHeaders_() {
  return ['date','weight','exercise','postmeal','sleep','water','sugary','veg','late'];
}
function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
