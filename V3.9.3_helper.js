/**
 * V3.9.3 — Dimension-aware helper for Elements_v4
 *
 * Purpose:
 * - Read existing Elements_v4 items for one AI batch scope.
 * - Match by role / semantic_type / entity tag / dimension tag.
 * - Return canonical values so the Index Prompt Helper can tell AI what NOT to regenerate.
 *
 * Important:
 * - READ ONLY. This file never writes to Elements_v4 or Elements_v3_2.
 * - Does not modify admission gates.
 * - Does not add entity/dimension columns to the V4 schema.
 * - All statuses are intentionally treated as "existing" to mirror the current canonical duplicate policy.
 */

function getV4ExistingElementsForBatch(params) {
  var filter = v393NormalizeBatchFilter_(params || {});
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('找不到綁定的 Google 試算表。');

  var sheetName = v393V4SheetName_();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) {
    return v393EmptyBatchResult_(sheetName, filter, 0);
  }

  var values = sheet.getDataRange().getDisplayValues();
  var headers = values[0].map(v393Clean_);
  var idx = v393HeaderIndex_(headers);
  var required = ['role', 'semantic_type', 'canonical_value', 'compatibility_tags'];
  var missing = required.filter(function(h) { return idx[h] == null; });
  if (missing.length) {
    throw new Error('Elements_v4 缺少必要欄位：' + missing.join(', '));
  }

  var rows = values.slice(1).map(function(r, i) {
    return {
      rowNumber: i + 2,
      element_id: idx.element_id == null ? '' : v393Clean_(r[idx.element_id]),
      status: idx.status == null ? '' : v393Clean_(r[idx.status]).toUpperCase(),
      role: v393Clean_(r[idx.role]),
      semantic_type: v393Clean_(r[idx.semantic_type]),
      canonical_value: v393Clean_(r[idx.canonical_value]),
      display_label_en: idx.display_label_en == null ? '' : v393Clean_(r[idx.display_label_en]),
      display_label_zh: idx.display_label_zh == null ? '' : v393Clean_(r[idx.display_label_zh]),
      compatibility_tags: v393Clean_(r[idx.compatibility_tags])
    };
  });

  var filtered = v393FilterExistingRows_(rows, filter);
  return {
    appVersion: 'V3.9.3',
    sheetName: sheetName,
    readOnly: true,
    duplicatePolicy: 'all-statuses',
    filters: filter,
    scanned: rows.length,
    total: filtered.total,
    truncated: filtered.truncated,
    canonicalValues: filtered.canonicalValues,
    items: filtered.items,
    productionSourceUnchanged: true
  };
}

function v393NormalizeBatchFilter_(params) {
  params = params || {};
  var filter = {
    role: v393Clean_(params.role).toLowerCase(),
    semantic_type: v393Clean_(params.semantic_type).toLowerCase(),
    entity_tag: v393Clean_(params.entity_tag || params.entity).toLowerCase(),
    dimension: v393Clean_(params.dimension).toLowerCase(),
    limit: Number(params.limit) || 1000
  };

  if (!filter.entity_tag) throw new Error('entity_tag 不可空白。');
  if (!filter.dimension) throw new Error('dimension 不可空白。');

  filter.limit = Math.max(1, Math.min(1000, Math.floor(filter.limit)));
  return filter;
}

function v393FilterExistingRows_(rows, filter) {
  filter = v393NormalizeBatchFilter_(filter || {});
  rows = Array.isArray(rows) ? rows : [];

  var entityNeedle = 'entity:' + filter.entity_tag;
  var dimensionNeedle = 'dimension:' + filter.dimension;
  var seen = {};
  var matched = [];

  rows.forEach(function(row) {
    row = row || {};
    var role = v393Clean_(row.role).toLowerCase();
    var semanticType = v393Clean_(row.semantic_type).toLowerCase();
    if (filter.role && role !== filter.role) return;
    if (filter.semantic_type && semanticType !== filter.semantic_type) return;

    var tags = v393ParseTags_(row.compatibility_tags);
    if (tags.indexOf(entityNeedle) < 0 || tags.indexOf(dimensionNeedle) < 0) return;

    var canonical = v393Clean_(row.canonical_value);
    if (!canonical) return;
    var canonicalKey = canonical.toLowerCase();
    if (seen[canonicalKey]) return;
    seen[canonicalKey] = true;

    matched.push({
      rowNumber: Number(row.rowNumber) || '',
      element_id: v393Clean_(row.element_id),
      status: v393Clean_(row.status).toUpperCase(),
      role: v393Clean_(row.role),
      semantic_type: v393Clean_(row.semantic_type),
      canonical_value: canonical,
      display_label_en: v393Clean_(row.display_label_en),
      display_label_zh: v393Clean_(row.display_label_zh),
      compatibility_tags: v393Clean_(row.compatibility_tags)
    });
  });

  var totalBeforeLimit = matched.length;
  matched = matched.slice(0, filter.limit);

  return {
    total: matched.length,
    totalBeforeLimit: totalBeforeLimit,
    truncated: totalBeforeLimit > matched.length,
    canonicalValues: matched.map(function(x) { return x.canonical_value; }),
    items: matched
  };
}

function v393ParseTags_(value) {
  return v393Clean_(value)
    .split(',')
    .map(function(tag) { return v393Clean_(tag).toLowerCase(); })
    .filter(function(tag) { return !!tag; });
}

function v393HeaderIndex_(headers) {
  var idx = {};
  (headers || []).forEach(function(h, i) {
    var key = v393Clean_(h);
    if (key && idx[key] == null) idx[key] = i;
  });
  return idx;
}

function v393V4SheetName_() {
  try {
    if (typeof V4_SHEET_NAME !== 'undefined' && v393Clean_(V4_SHEET_NAME)) {
      return v393Clean_(V4_SHEET_NAME);
    }
  } catch (e) {}
  return 'Elements_v4';
}

function v393EmptyBatchResult_(sheetName, filter, scanned) {
  return {
    appVersion: 'V3.9.3',
    sheetName: sheetName,
    readOnly: true,
    duplicatePolicy: 'all-statuses',
    filters: filter,
    scanned: Number(scanned) || 0,
    total: 0,
    truncated: false,
    canonicalValues: [],
    items: [],
    productionSourceUnchanged: true
  };
}

function v393Clean_(value) {
  return String(value == null ? '' : value).trim();
}

/**
 * Manual self-test. Safe to run in Apps Script editor.
 * Does NOT read or write Sheets.
 */
function testV393DimensionHelperConfig() {
  var rows = [
    {
      rowNumber: 2,
      element_id: 'E1',
      status: 'APPROVED',
      role: 'subject',
      semantic_type: 'subject/animal',
      canonical_value: 'British Shorthair cat',
      display_label_en: 'British Shorthair',
      display_label_zh: '英國短毛貓',
      compatibility_tags: 'entity:cat,dimension:breed'
    },
    {
      rowNumber: 3,
      element_id: 'E2',
      status: 'REJECTED',
      role: 'subject',
      semantic_type: 'subject/animal',
      canonical_value: 'Persian cat',
      display_label_en: 'Persian',
      display_label_zh: '波斯貓',
      compatibility_tags: 'dimension:breed, entity:cat'
    },
    {
      rowNumber: 4,
      element_id: 'E3',
      status: 'APPROVED',
      role: 'subject',
      semantic_type: 'subject/animal',
      canonical_value: 'blue-gray coat',
      display_label_en: 'Blue-gray',
      display_label_zh: '藍灰色',
      compatibility_tags: 'entity:cat,dimension:coat-color'
    },
    {
      rowNumber: 5,
      element_id: 'E4',
      status: 'APPROVED',
      role: 'subject',
      semantic_type: 'subject/animal',
      canonical_value: 'British Shorthair cat',
      display_label_en: 'Duplicate label',
      display_label_zh: '',
      compatibility_tags: 'entity:cat,dimension:breed'
    }
  ];

  var result = v393FilterExistingRows_(rows, {
    role: 'subject',
    semantic_type: 'subject/animal',
    entity_tag: 'cat',
    dimension: 'breed',
    limit: 1000
  });

  var checks = [
    {name: 'matches exact entity + dimension', ok: result.total === 2},
    {name: 'deduplicates canonical_value', ok: result.canonicalValues.length === 2},
    {name: 'includes rejected/deprecated style statuses', ok: result.items[1] && result.items[1].status === 'REJECTED'},
    {name: 'excludes other dimensions', ok: result.canonicalValues.indexOf('blue-gray coat') < 0}
  ];

  var pass = checks.every(function(c) { return c.ok; });
  checks.forEach(function(c) { Logger.log((c.ok ? 'PASS' : 'FAIL') + '：' + c.name); });
  Logger.log('Sheet write：NONE');
  Logger.log('Overall：' + (pass ? 'PASS' : 'FAIL'));
  if (!pass) throw new Error('V3.9.3 Dimension Helper self-test FAIL');
  return {pass: true, checks: checks};
}

