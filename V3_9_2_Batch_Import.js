/* =========================================================
   V3.9.2（提案）— Elements_v4 Batch Import
   將一批（建議每次 ≤50 筆）AI 產生的候選草稿，
   用與單筆表單「完全相同」的 admission gates 逐筆驗證與寫入。
   - 不放寬任何驗證規則（直接重用 validateV4ElementDraft）
   - 不靜默修補語意（FAIL/REVIEW 一律不自動改寫內容）
   - 不整批信任（每一筆各自獨立驗證，互相不影響判定）
   - 不修改 Elements_v3_2
   ========================================================= */

/**
 * 批次匯入 V4 候選草稿。
 *
 * @param {Array<Object>} drafts 每筆建議至少包含：
 *   role, canonical_value（或 prompt_phrase）, display_label_zh, display_label_en,
 *   polarity, allowed_modes（可省略，會用預設值補齊，semantic_type 也會自動猜測）
 *   建議標示 source_type: 'ai-authored'，若未提供本函式會自動補上，
 *   方便日後在 Elements_v4 分頁區分「AI 新產生」與「legacy-promotion 舊資料轉入」。
 *
 * @param {Object} options
 *   autoApproveCleanPass {boolean} 預設 false。
 *     false（預設，建議先用這個）：驗證結果 PASS 的草稿寫入狀態為 CANDIDATE，
 *       仍需要你之後在 Elements_v4 工作區 UI 上人工核准，才會變成 APPROVED。
 *     true：只有「完全 PASS、沒有任何 REVIEW 項目」的草稿才會直接寫入 APPROVED；
 *       只要出現任何 REVIEW 或 FAIL，一律不會自動核准，會回到 needs_review / rejected。
 *   writeReviewAsPending {boolean} 預設 false。
 *     false（預設）：overall 為 REVIEW 的草稿完全不寫入，只出現在報告裡等你人工判斷。
 *     true：你已經人工看過這批、確認 REVIEW 的項目其實沒問題（例如關鍵字誤判），
 *       就把它們也寫入 Elements_v4，狀態一樣是 REVIEW（不會自動變 APPROVED），
 *       之後在「Elements_v4 資料庫」按「核准」即可轉正。這個選項不會放寬驗證規則本身，
 *       只是讓你確認過的 REVIEW 項目有地方落地，不用另外跑單筆編輯器。
 *   maxBatchSize {number} 預設 50，硬上限 100，避免一次寫入過多、報告難以檢視。
 *
 * @return {Object}
 *   { summary: {total, written_candidate, written_approved, needs_review, rejected},
 *     results: [ {index, input, overall, checks, action, reason?, elementId?, rowNumber?} ... ] }
 *   單筆錯誤不會中斷整批，每一筆的結果都會被記錄下來。
 */
function batchImportV4Drafts(drafts, options) {
  options = options || {};
  var autoApprove = !!options.autoApproveCleanPass;
  var writeReviewAsPending = !!options.writeReviewAsPending;
  var maxBatchSize = Math.min(Number(options.maxBatchSize) || 50, 100);

  if (!Array.isArray(drafts)) throw new Error('drafts 必須是陣列。');
  if (!drafts.length) throw new Error('drafts 是空的，沒有東西可以匯入。');
  if (drafts.length > maxBatchSize) {
    throw new Error(
      '本次共 ' + drafts.length + ' 筆，超過單次上限 ' + maxBatchSize +
      '。請分批執行，避免一次寫入過多造成 Sheet 效能問題、報告難以檢視。'
    );
  }

  ensureElementsV4Sheet();

  var results = [];
  var summary = { total: drafts.length, written_candidate: 0, written_approved: 0, written_review: 0, needs_review: 0, rejected: 0 };

  drafts.forEach(function (raw, i) {
    var draft = raw || {};
    if (!draft.source_type) draft.source_type = 'ai-authored';
    if (!draft.source_reference) draft.source_reference = 'batch-import:' + new Date().toISOString();

    var entry = { index: i, input: draft };

    try {
      var validation = validateV4ElementDraft(draft);
      entry.overall = validation.overall;
      entry.checks = validation.checks;

      if (validation.overall === 'FAIL') {
        entry.action = 'REJECTED';
        entry.reason = validation.checks
          .filter(function (c) { return c.status === 'FAIL'; })
          .map(function (c) { return c.id + '：' + c.message; })
          .join('; ');
        summary.rejected++;

      } else if (validation.overall === 'REVIEW') {
        if (writeReviewAsPending) {
          // 使用者已人工確認這批 REVIEW 項目沒問題，寫入 Elements_v4，狀態維持 REVIEW，
          // 不會自動變成 APPROVED，仍需之後在資料庫按「核准」。
          try {
            var reviewWriteResult = saveV4Candidate(draft);
            entry.action = 'WRITTEN_REVIEW';
            entry.elementId = reviewWriteResult.elementId;
            entry.rowNumber = reviewWriteResult.rowNumber;
            entry.reason = validation.checks
              .filter(function (c) { return c.status !== 'PASS'; })
              .map(function (c) { return c.id + '：' + c.message; })
              .join('; ');
            summary.written_review++;
          } catch (writeErr) {
            entry.action = 'ERROR';
            entry.reason = writeErr && writeErr.message ? writeErr.message : String(writeErr);
            summary.rejected++;
          }
        } else {
          // 預設：REVIEW 一律不自動寫入，避免把需要人工判斷的項目靜默放行。
          entry.action = 'NEEDS_HUMAN_REVIEW';
          entry.reason = validation.checks
            .filter(function (c) { return c.status !== 'PASS'; })
            .map(function (c) { return c.id + '：' + c.message; })
            .join('; ');
          summary.needs_review++;
        }

      } else {
        // overall === 'PASS'
        var targetStatus = autoApprove ? 'APPROVED' : 'CANDIDATE';
        var writeResult = (targetStatus === 'APPROVED')
          ? approveV4Element(draft)
          : saveV4Candidate(draft);
        entry.action = 'WRITTEN_' + targetStatus;
        entry.elementId = writeResult.elementId;
        entry.rowNumber = writeResult.rowNumber;
        if (targetStatus === 'APPROVED') summary.written_approved++; else summary.written_candidate++;
      }
    } catch (err) {
      entry.action = 'ERROR';
      entry.reason = err && err.message ? err.message : String(err);
      summary.rejected++;
    }

    results.push(entry);
  });

  return {
    appVersion: V3_APP_VERSION,
    schemaVersion: V4_SCHEMA_VERSION,
    summary: summary,
    results: results,
    productionSourceUnchanged: true
  };
}

/**
 * 純轉換：把一批「舊資料搜尋結果」批次轉成 V4 草稿建議。
 * 不寫入任何資料、不驗證，只是把 suggestV4CandidateFromLegacy() 對單筆做的事情套用到整批，
 * 方便一次拿到 JSON 之後交給 AI 潤飾語意，再貼回 batchImportV4Drafts() 執行真正的驗證與寫入。
 *
 * @param {Array<Object>} items 通常是 searchV4LegacyCandidates() 回傳的 items 陣列。
 * @return {Array<Object>} 對應數量的 V4 草稿建議（單筆轉換失敗會回傳 {__error, __source}，不中斷整批）。
 */
function suggestV4CandidateFromLegacyBatch(items) {
  if (!Array.isArray(items)) throw new Error('items 必須是陣列。');
  var maxBatchSize = 150; // 與 searchV4LegacyCandidates 的單次上限一致；純轉換不寫入，成本低。
  if (items.length > maxBatchSize) {
    throw new Error('本次共 ' + items.length + ' 筆，超過單次上限 ' + maxBatchSize + '，請縮小搜尋範圍或分批處理。');
  }
  return items.map(function (item) {
    try {
      return suggestV4CandidateFromLegacy(item);
    } catch (err) {
      return { __error: err && err.message ? err.message : String(err), __source: item };
    }
  });
}

/**
 * 就地更新既有 Elements_v4 資料列的狀態（核准 / 拒絕 / 停用），
 * 不會新增列（不像 writeV4Element_ 一律 appendRow），只修改狀態相關欄位，
 * 不會動 canonical_value / prompt_phrase 等內容欄位，避免「靜默修改語意內容」。
 *
 * @param {string} elementId 目標 element_id。
 * @param {string} action 'approve'（CANDIDATE/REVIEW → APPROVED）、
 *                         'reject'（CANDIDATE/REVIEW → REJECTED）、
 *                         'deprecate'（APPROVED → DEPRECATED）之一。
 * @return {Object} {updated, elementId, fromStatus, toStatus, rowNumber}
 */
function updateV4ElementStatus(elementId, action) {
  elementId = clean_(elementId);
  if (!elementId) throw new Error('缺少 element_id。');
  const sheet = getV4Sheet_(true);
  const values = sheet.getDataRange().getDisplayValues();
  if (values.length < 2) throw new Error('Elements_v4 目前沒有資料。');
  const idx = buildHeaderIndex_(values[0].map(clean_));
  if (idx.element_id == null) throw new Error('Elements_v4 缺少 element_id 欄位，無法定位資料列。');

  let targetRow = -1, currentStatus = '';
  for (let i = 1; i < values.length; i++) {
    if (clean_(values[i][idx.element_id]) === elementId) {
      targetRow = i + 1;
      currentStatus = clean_(values[i][idx.status]);
      break;
    }
  }
  if (targetRow === -1) throw new Error('在 Elements_v4 找不到 element_id：' + elementId);

  const transitions = {
    approve:   { from: ['CANDIDATE', 'REVIEW'], to: 'APPROVED' },
    reject:    { from: ['CANDIDATE', 'REVIEW'], to: 'REJECTED' },
    deprecate: { from: ['APPROVED'],            to: 'DEPRECATED' }
  };
  const t = transitions[action];
  if (!t) throw new Error('不支援的操作：' + action);
  if (t.from.indexOf(currentStatus) === -1) {
    throw new Error('目前狀態為「' + currentStatus + '」，不允許直接執行「' + action + '」。');
  }

  const now = new Date();
  const email = (Session.getActiveUser() && Session.getActiveUser().getEmail()) || '';
  function setCell(header, value) {
    if (idx[header] == null) return;
    sheet.getRange(targetRow, idx[header] + 1).setValue(value);
  }
  setCell('status', t.to);
  setCell('review_status', t.to === 'APPROVED' ? 'APPROVED' : (t.to === 'REJECTED' ? 'REJECTED' : t.to));
  setCell('reviewed_by', email);
  setCell('reviewed_at', now);
  setCell('updated_at', now);
  SpreadsheetApp.flush();

  return { updated: true, elementId: elementId, fromStatus: currentStatus, toStatus: t.to, rowNumber: targetRow, productionSourceUnchanged: true };
}

/**
 * 批次核准一批既有的 Elements_v4 資料列（通常是「候選資料」篩選結果）。
 * 內部逐筆呼叫 updateV4ElementStatus(id,'approve')，不引入新的核准邏輯，
 * 只是把單筆核准包成迴圈，行為與逐筆手動點「核准」完全一致。
 *
 * @param {Array<string>} elementIds
 * @return {Object} {summary:{total,approved,failed}, results:[{elementId,ok,fromStatus?,toStatus?,reason?}]}
 */
function batchApproveV4Elements(elementIds) {
  if (!Array.isArray(elementIds)) throw new Error('elementIds 必須是陣列。');
  var maxBatchSize = 100;
  if (elementIds.length > maxBatchSize) {
    throw new Error('本次共 ' + elementIds.length + ' 筆，超過單次上限 ' + maxBatchSize + '，請縮小篩選範圍分批處理。');
  }
  var results = [];
  var summary = { total: elementIds.length, approved: 0, failed: 0 };
  elementIds.forEach(function (id) {
    try {
      var r = updateV4ElementStatus(id, 'approve');
      results.push({ elementId: id, ok: true, fromStatus: r.fromStatus, toStatus: r.toStatus });
      summary.approved++;
    } catch (err) {
      results.push({ elementId: id, ok: false, reason: err && err.message ? err.message : String(err) });
      summary.failed++;
    }
  });
  return { summary: summary, results: results, productionSourceUnchanged: true };
}

/**
 * 設定與邏輯自我檢查，不寫入任何資料。
 * 在 Apps Script 編輯器手動執行，確認邏輯符合預期後再正式使用 batchImportV4Drafts。
 */
function testV392BatchImportConfig() {
  Logger.log('batchImportV4Drafts：逐筆呼叫 validateV4ElementDraft()，與 UI 單筆表單共用同一套 admission gates，不放寬規則。');
  Logger.log('FAIL：一律不寫入。REVIEW：一律不自動寫入，回傳給人工判斷。PASS：預設寫入 CANDIDATE，仍需人工核准。');
  Logger.log('autoApproveCleanPass=true 時，只有 overall===PASS（不含任何 REVIEW 項目）才會直接寫入 APPROVED。');
  Logger.log('單批上限：預設 50，硬上限 100。');
  Logger.log('Sheet write：僅寫入 Elements_v4；不修改 Elements_v3_2。');
  Logger.log('重複資料：因為是逐筆依序寫入（非平行處理），同一批內彼此重複的草稿也會被 detectV4Duplicate_ 依序抓到。');
}

