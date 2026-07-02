// ─── SETUP INSTRUCTIONS ───────────────────────────────────────────────────────
// 1. Open your Google Sheet → Extensions → Apps Script
// 2. Replace everything here with this file's contents
// 3. Click Deploy → New deployment → Web app
//    - Execute as: Me
//    - Who has access: Anyone
// 4. Copy the Web app URL → add as GitHub secret GAS_URL
// 5. Pick any random string for API_KEY below → add the same value as GitHub secret API_KEY

const API_KEY        = 'REPLACE_WITH_YOUR_KEY';
const SHEET_NAME     = 'Daily Log';
const DATA_START_ROW = 3;
const HEADER_ROW     = 2;

function doGet(e) {
  if (e.parameter.key !== API_KEY) return reply({ error: 'Unauthorized' });

  const sheet   = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();

  const headers = sheet.getRange(HEADER_ROW, 1, 1, lastCol).getValues()[0];

  if (lastRow < DATA_START_ROW) return reply({ headers, values: [] });

  const numRows = lastRow - DATA_START_ROW + 1;
  const values  = sheet.getRange(DATA_START_ROW, 1, numRows, lastCol).getDisplayValues();
  return reply({ headers, values });
}

function doPost(e) {
  const body = JSON.parse(e.postData.contents);
  if (body.key !== API_KEY) return reply({ error: 'Unauthorized' });

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);

  if (body.action === 'addUser') return addUser(sheet, body.userName);

  // Save reps — look up columns from headers at runtime
  const { user, sheetRow, push, pull } = body;
  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(HEADER_ROW, 1, 1, lastCol).getValues()[0];

  const pushCol = headers.indexOf(user + ' Push') + 1; // 1-indexed
  const pullCol = headers.indexOf(user + ' Pull') + 1;

  if (pushCol === 0 || pullCol === 0) return reply({ error: 'Unknown user: ' + user });

  sheet.getRange(sheetRow, pushCol).setValue(push);
  sheet.getRange(sheetRow, pullCol).setValue(pull);

  return reply({ ok: true });
}

function addUser(sheet, userName) {
  if (!userName || !userName.trim()) return reply({ error: 'Invalid name' });
  userName = userName.trim();

  const lastCol = sheet.getLastColumn();
  const lastRow = sheet.getLastRow();
  const headers = sheet.getRange(HEADER_ROW, 1, 1, lastCol).getValues()[0];

  if (headers.some(h => h.toLowerCase() === (userName + ' Push').toLowerCase())) {
    return reply({ error: 'User already exists' });
  }

  const pushCol = lastCol + 1;
  const pullCol = lastCol + 2;

  sheet.getRange(HEADER_ROW, pushCol).setValue(userName + ' Push');
  sheet.getRange(HEADER_ROW, pullCol).setValue(userName + ' Pull');

  if (lastRow >= DATA_START_ROW) {
    const numRows = lastRow - DATA_START_ROW + 1;
    const zeros   = Array.from({ length: numRows }, () => [0]);
    sheet.getRange(DATA_START_ROW, pushCol, numRows, 1).setValues(zeros);
    sheet.getRange(DATA_START_ROW, pullCol, numRows, 1).setValues(zeros);
  }

  return reply({ ok: true });
}

function reply(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
