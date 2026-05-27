// ─── SETUP INSTRUCTIONS ───────────────────────────────────────────────────────
// 1. Open your Google Sheet → Extensions → Apps Script
// 2. Replace everything here with this file's contents
// 3. Click Deploy → New deployment → Web app
//    - Execute as: Me
//    - Who has access: Anyone
// 4. Copy the Web app URL → add as GitHub secret GAS_URL
// 5. Pick any random string for API_KEY below → add the same value as GitHub secret API_KEY

const API_KEY      = 'REPLACE_WITH_YOUR_KEY';
const SHEET_NAME   = 'Daily Log';
const DATA_START_ROW = 3;

// Column numbers (1-indexed) for each user's push/pull
const COLS = {
  angel:  { push: 6, pull: 7 },  // F, G
  cherie: { push: 3, pull: 4 },  // C, D
};

function doGet(e) {
  if (e.parameter.key !== API_KEY) return reply({ error: 'Unauthorized' });

  const sheet   = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const lastRow = sheet.getLastRow();
  if (lastRow < DATA_START_ROW) return reply({ values: [] });

  const numRows = lastRow - DATA_START_ROW + 1;
  const values  = sheet.getRange(DATA_START_ROW, 1, numRows, 9).getDisplayValues();
  return reply({ values });
}

function doPost(e) {
  const body = JSON.parse(e.postData.contents);
  if (body.key !== API_KEY) return reply({ error: 'Unauthorized' });

  const { user, sheetRow, push, pull } = body;
  if (!COLS[user]) return reply({ error: 'Unknown user' });

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  sheet.getRange(sheetRow, COLS[user].push).setValue(push);
  sheet.getRange(sheetRow, COLS[user].pull).setValue(pull);

  return reply({ ok: true });
}

function reply(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
