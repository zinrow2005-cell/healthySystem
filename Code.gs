const LAB_SHEET = 'health_records';

function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || 'list';
  if (action === 'ping') return json_({ok:true, version:'V14.0'});
  if (action === 'list') return listSheet_(LAB_SHEET, getLabHeaders_());
  return json_({ok:false,error:'unknown action'});
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents || '{}');
    if (body.action === 'add') return appendRecord_(LAB_SHEET, getLabHeaders_(), body.record || {});
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

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
