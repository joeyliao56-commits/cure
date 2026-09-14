/**
 * 療癒產生器 V3.2 - BulkImport.gs
 *
 * 用途：
 * 1. 從 Google Drive 找最新版 Elements_v3.2.csv
 * 2. 驗證必要欄位與資料筆數
 * 3. 將既有 Elements_v3_2 分頁先備份
 * 4. 分批寫入新的 Elements_v3_2
 * 5. 驗證 role 與受控分類數量
 *
 * 使用前：
 * - 將 Elements_v3.2.csv 上傳到此 Apps Script 帳號可存取的 Google Drive
 * - 此 Apps Script 必須綁定你的 V3 測試 Google 試算表
 */

const BULK_IMPORT_CSV_NAME = 'Elements_v3.2.csv';
const BULK_IMPORT_TARGET_SHEET = 'Elements_v3_2';
const BULK_IMPORT_EXPECTED_ROWS = 13799;
const BULK_IMPORT_CHUNK_SIZE = 2000;
const BULK_IMPORT_BACKUP_EXISTING = true;

const BULK_IMPORT_REQUIRED_HEADERS = [
  '角色(role)',
  '新大類',
  '新中類',
  '小類',
  '元素中文',
  '元素英文',
  '適用類型',
  '建議資料去向'
];

const BULK_IMPORT_EXPECTED_L3_COUNTS = {
  subject: 75,
  action: 25,
  environment: 43,
  lighting: 33,
  material: 25,
  color: 15,
  composition: 14,
  camera: 33,
  motion: 24,
  technical: 23
};

/**
 * 主執行函式。
 * Apps Script 上方函式選單選這個執行即可。
 */
function bulkImportElementsV32() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  if (!ss) {
    throw new Error(
      '找不到綁定的 Google 試算表。請從試算表內「擴充功能 → Apps Script」執行。'
    );
  }

  const file = findLatestDriveFileByNameV32_(BULK_IMPORT_CSV_NAME);

  Logger.log('讀取 CSV：' + file.getName());
  Logger.log('最後更新：' + file.getLastUpdated());

  let csvText = file
    .getBlob()
    .getDataAsString('UTF-8');

  // 移除 UTF-8 BOM。
  csvText = csvText.replace(/^\uFEFF/, '');

  const values = Utilities
    .parseCsv(csvText)
    .filter(function (row, index) {
      if (index === 0) return true;
      return row.some(function (cell) {
        return String(cell || '').trim() !== '';
      });
    });

  if (values.length < 2) {
    throw new Error('CSV 沒有可匯入的資料。');
  }

  const headers = values[0].map(function (value) {
    return String(value || '').trim();
  });

  validateHeadersV32_(headers);

  const dataRowCount = values.length - 1;

  if (dataRowCount !== BULK_IMPORT_EXPECTED_ROWS) {
    throw new Error(
      '資料筆數不符。預期 ' +
      BULK_IMPORT_EXPECTED_ROWS +
      ' 筆，但 CSV 為 ' +
      dataRowCount +
      ' 筆。為避免匯入錯誤，本次已停止。'
    );
  }

  const oldSheet = ss.getSheetByName(
    BULK_IMPORT_TARGET_SHEET
  );

  if (
    oldSheet &&
    BULK_IMPORT_BACKUP_EXISTING
  ) {
    const backupName =
      BULK_IMPORT_TARGET_SHEET +
      '_backup_' +
      Utilities.formatDate(
        new Date(),
        Session.getScriptTimeZone() || 'Asia/Taipei',
        'yyyyMMdd_HHmmss'
      );

    oldSheet
      .copyTo(ss)
      .setName(backupName);

    Logger.log(
      '已備份既有分頁：' + backupName
    );
  }

  let sheet = oldSheet;

  if (!sheet) {
    sheet = ss.insertSheet(
      BULK_IMPORT_TARGET_SHEET
    );
  } else {
    const filter = sheet.getFilter();

    if (filter) {
      filter.remove();
    }

    sheet.clear();
  }

  // 先寫入標題列。
  sheet
    .getRange(
      1,
      1,
      1,
      headers.length
    )
    .setValues([headers]);

  // 分批寫入，避免一次 setValues 過大。
  const dataRows = values.slice(1);

  for (
    let start = 0;
    start < dataRows.length;
    start += BULK_IMPORT_CHUNK_SIZE
  ) {
    const chunk = dataRows.slice(
      start,
      start + BULK_IMPORT_CHUNK_SIZE
    );

    sheet
      .getRange(
        start + 2,
        1,
        chunk.length,
        headers.length
      )
      .setValues(chunk);

    SpreadsheetApp.flush();

    Logger.log(
      '已寫入 ' +
      Math.min(
        start + chunk.length,
        dataRows.length
      ) +
      ' / ' +
      dataRows.length
    );
  }

  formatImportedSheetV32_(
    sheet,
    headers,
    dataRowCount
  );

  SpreadsheetApp.flush();

  const report =
    validateImportedElementsV32_(
      sheet
    );

  Logger.log('========================');
  Logger.log('V3.2 匯入完成');
  Logger.log(
    '分頁：' + BULK_IMPORT_TARGET_SHEET
  );
  Logger.log(
    '資料筆數：' + report.total
  );

  Object.keys(report.roles)
    .sort()
    .forEach(function (role) {
      Logger.log(
        role +
        '：' +
        report.roles[role] +
        ' 筆；03小類 ' +
        report.l3Counts[role] +
        ' 個'
      );
    });

  Logger.log('========================');

  return report;
}

/**
 * 可單獨執行，檢查已匯入的 Elements_v3_2。
 */
function validateElementsV32() {
  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const sheet = ss.getSheetByName(
    BULK_IMPORT_TARGET_SHEET
  );

  if (!sheet) {
    throw new Error(
      '找不到分頁：' +
      BULK_IMPORT_TARGET_SHEET
    );
  }

  const report =
    validateImportedElementsV32_(
      sheet
    );

  Logger.log(
    JSON.stringify(
      report,
      null,
      2
    )
  );

  return report;
}

/**
 * 從 Drive 找同名檔案中最後更新的一份。
 */
function findLatestDriveFileByNameV32_(
  fileName
) {
  const files =
    DriveApp.getFilesByName(fileName);

  let latest = null;

  while (files.hasNext()) {
    const file = files.next();

    if (
      !latest ||
      file.getLastUpdated().getTime() >
        latest.getLastUpdated().getTime()
    ) {
      latest = file;
    }
  }

  if (!latest) {
    throw new Error(
      'Google Drive 找不到「' +
      fileName +
      '」。請先把 CSV 上傳到目前帳號可存取的 Drive。'
    );
  }

  return latest;
}

function validateHeadersV32_(headers) {
  BULK_IMPORT_REQUIRED_HEADERS
    .forEach(function (name) {
      if (headers.indexOf(name) === -1) {
        throw new Error(
          'CSV 缺少必要欄位：' + name
        );
      }
    });
}

function formatImportedSheetV32_(
  sheet,
  headers,
  dataRowCount
) {
  sheet.setFrozenRows(1);

  const headerRange =
    sheet.getRange(
      1,
      1,
      1,
      headers.length
    );

  headerRange
    .setBackground('#596A53')
    .setFontColor('#FFFFFF')
    .setFontWeight('bold')
    .setVerticalAlignment('middle');

  sheet.setRowHeight(1, 30);

  // 主要欄位固定寬度，避免英文 prompt 把整張表撐得太寬。
  const widthMap = {
    '角色(role)': 100,
    '新大類': 130,
    '新中類': 170,
    '小類': 190,
    '元素中文': 260,
    '元素英文': 420,
    '適用類型': 100,
    '建議資料去向': 120,
    'Tag候選': 180,
    '分類信心': 90,
    '分類依據': 260,
    '原角色': 90,
    '原大類': 180,
    '原中類': 220,
    '原新中類': 180,
    '原小類': 220
  };

  headers.forEach(
    function (header, index) {
      if (widthMap[header]) {
        sheet.setColumnWidth(
          index + 1,
          widthMap[header]
        );
      }
    }
  );

  const fullRange =
    sheet.getRange(
      1,
      1,
      dataRowCount + 1,
      headers.length
    );

  fullRange
    .setVerticalAlignment('top');

  // 建立篩選。
  fullRange.createFilter();
}

/**
 * 檢查資料筆數、role 分布、每個 role 的受控 03 數量。
 */
function validateImportedElementsV32_(
  sheet
) {
  const values =
    sheet
      .getDataRange()
      .getDisplayValues();

  if (values.length < 2) {
    throw new Error(
      'Elements_v3_2 沒有資料。'
    );
  }

  const headers =
    values[0].map(function (v) {
      return String(v || '').trim();
    });

  validateHeadersV32_(headers);

  const index = {};

  headers.forEach(
    function (header, i) {
      index[header] = i;
    }
  );

  const roles = {};
  const l3Sets = {};

  values
    .slice(1)
    .forEach(function (row) {
      const role =
        String(
          row[index['角色(role)']] || ''
        ).trim();

      const middle =
        String(
          row[index['新中類']] || ''
        ).trim();

      const small =
        String(
          row[index['小類']] || ''
        ).trim();

      const ch =
        String(
          row[index['元素中文']] || ''
        ).trim();

      if (!role && !ch) {
        return;
      }

      if (
        !role ||
        !middle ||
        !small ||
        !ch
      ) {
        throw new Error(
          '發現必要分類欄位空白：' +
          JSON.stringify({
            role: role,
            middle: middle,
            small: small,
            ch: ch
          })
        );
      }

      roles[role] =
        (roles[role] || 0) + 1;

      if (!l3Sets[role]) {
        l3Sets[role] = {};
      }

      l3Sets[role][
        middle + ' → ' + small
      ] = true;
    });

  const total = Object.keys(roles)
    .reduce(function (sum, role) {
      return sum + roles[role];
    }, 0);

  if (
    total !==
    BULK_IMPORT_EXPECTED_ROWS
  ) {
    throw new Error(
      '匯入後資料筆數不符：' +
      total
    );
  }

  const l3Counts = {};

  Object.keys(l3Sets)
    .forEach(function (role) {
      l3Counts[role] =
        Object.keys(
          l3Sets[role]
        ).length;

      const expected =
        BULK_IMPORT_EXPECTED_L3_COUNTS[
          role
        ];

      if (
        expected != null &&
        l3Counts[role] !== expected
      ) {
        throw new Error(
          role +
          ' 的受控 03 小類數量不符。預期 ' +
          expected +
          '，實際 ' +
          l3Counts[role]
        );
      }
    });

  return {
    total: total,
    roles: roles,
    l3Counts: l3Counts
  };
}

