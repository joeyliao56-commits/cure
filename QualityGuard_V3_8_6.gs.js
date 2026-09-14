/**
 * 療癒產生器 V3.8-6
 * Element Quality Guard + Data Entry Rules
 *
 * 用法：在 Apps Script 專案新增一個 .gs 檔（例如 QualityGuard_V3_8_6.gs）
 * 與原 Code.gs 並存即可。
 *
 * 本檔只讀 Elements_v3_2；不新增、不刪除、不修改 Sheet。
 * 直接重用既有 V3.8-5g Audit constants/helpers：
 * V3_DATA_AUDIT_NEGATIVE_RULES
 * V3_DATA_AUDIT_TECH_REVIEW_PATTERN
 * V3_DATA_AUDIT_COLOR_MOOD_PATTERN
 * V3_DATA_AUDIT_COLOR_MOOD_ZH_PATTERN
 * V3_DATA_AUDIT_EXPLICIT_COLOR_PATTERN
 * V3_DATA_AUDIT_EXPLICIT_COLOR_ZH_PATTERN
 * getV3AuditConflictHits_()
 * normalizeSearch_()
 * readV3Rows_()
 * V3_ROLE_META
 */

function evaluateV3ElementQuality(element) {
  element = element || {};
  const role = clean_(element.role);
  const ch = clean_(element.ch || element.zh || element['元素中文']);
  const en = clean_(element.en || element['元素英文']);
  const tags = clean_(element.tags || element['Tag候選']);
  const text = [ch, en, tags].join(' ').trim();

  const flags = [];
  let severity = 'none';
  const rank = { none: 0, low: 1, medium: 2, high: 3 };

  function addFlag(level, type, label, suggestion) {
    flags.push({
      severity: level,
      type: type,
      label: label,
      suggestion: suggestion || ''
    });
    if ((rank[level] || 0) > (rank[severity] || 0)) severity = level;
  }

  if (!en) {
    addFlag(
      'medium',
      'missing-english',
      '缺少元素英文',
      '補上可直接嵌入 Prompt 的英文 phrase'
    );
  }

  let matchedNegativeRule = null;
  V3_DATA_AUDIT_NEGATIVE_RULES.some(function (rule) {
    if (rule.pattern.test(text)) {
      matchedNegativeRule = rule;
      return true;
    }
    return false;
  });

  // Known entity exception：屍花不是「屍體內容」。
  const corpseFlowerException =
    /\bcorpse\s+flower\b/i.test(en) || /屍花/.test(ch);

  if (matchedNegativeRule && !corpseFlowerException) {
    addFlag(
      'high',
      'positive-polarity-risk',
      '可能屬於 Avoid / quality defect：' + matchedNegativeRule.label,
      '建議換一個、移除，或明確選擇仍然使用'
    );
  }

  if (
    role === 'technical' &&
    !matchedNegativeRule &&
    V3_DATA_AUDIT_TECH_REVIEW_PATTERN.test(text)
  ) {
    addFlag(
      'medium',
      'technical-semantic-review',
      '品質控制語意需人工判斷',
      '可能是 positive-quality、avoid-defect 或 style-dependent'
    );
  }

  if (role === 'color') {
    const colorText = [ch, en].join(' ');
    const moodLike =
      V3_DATA_AUDIT_COLOR_MOOD_PATTERN.test(colorText) ||
      V3_DATA_AUDIT_COLOR_MOOD_ZH_PATTERN.test(colorText);

    const hasColorCarrier =
      V3_DATA_AUDIT_EXPLICIT_COLOR_PATTERN.test(en) ||
      V3_DATA_AUDIT_EXPLICIT_COLOR_ZH_PATTERN.test(ch);

    if (moodLike && !hasColorCarrier) {
      addFlag(
        'medium',
        'color-mood-role-risk',
        'Color 元素核心語意偏 Mood / Atmosphere',
        '建議換一個；新增資料時改放 Mood / Lighting / Tag'
      );
    }

    if (/\bpalette\s*$/i.test(en)) {
      addFlag(
        'low',
        'color-palette-suffix',
        'Color phrase 已自帶 palette',
        '新增資料時建議只保存核心色彩 phrase'
      );
    }

    if (/^\s*(?:a|an)\s+/i.test(en)) {
      addFlag(
        'low',
        'color-leading-article',
        'Color phrase 含前置冠詞',
        '新增資料時建議移除模板型冠詞'
      );
    }
  }

  const conflictHits = getV3AuditConflictHits_({
    ch: ch,
    en: en,
    tags: tags
  });

  if (conflictHits.length) {
    addFlag(
      'medium',
      'single-row-conflict-alias',
      '單一元素同時命中多個衝突概念',
      '建議人工確認是否為合法複合描述'
    );
  }

  return {
    appVersion: 'V3.8-6',
    severity: severity,
    hasIssue: flags.length > 0,
    flags: flags,
    role: role,
    ch: ch,
    en: en,
    recommendedDefault:
      severity === 'high' ? 'replace-or-remove' :
      severity === 'medium' ? 'review' :
      'allow',
    sheetWrite: 'NONE'
  };
}


/**
 * 批次評估 selected items，避免前端逐筆 google.script.run。
 */
function evaluateV3SelectedElementsQuality(items) {
  return (Array.isArray(items) ? items : []).map(function (item) {
    const result = evaluateV3ElementQuality(item);
    result.key = item && item.key ? item.key : '';
    return result;
  });
}


/**
 * 新增元素前的 Rules。
 * PASS：可進入新增流程
 * REVIEW：需要人工確認
 * FAIL：不建議寫入
 *
 * V3.8-6 本身不提供 Sheet write。
 */
function validateV3ElementEntryDraft(draft) {
  draft = draft || {};

  const role = clean_(draft.role);
  const ch = clean_(draft.ch || draft['元素中文']);
  const en = clean_(draft.en || draft['元素英文']);
  const tags = clean_(draft.tags || draft['Tag候選']);

  const checks = [];

  function addCheck(id, label, status, detail) {
    checks.push({
      id: id,
      label: label,
      status: status,
      detail: detail || ''
    });
  }

  if (!role || !V3_ROLE_META[role]) {
    addCheck('role-valid', 'Role 必須有效', 'FAIL', '請使用既有受控 Role');
  } else {
    addCheck('role-valid', 'Role 必須有效', 'PASS', role);
  }

  addCheck(
    'zh-required',
    '元素中文不可空白',
    ch ? 'PASS' : 'FAIL',
    ch
  );

  addCheck(
    'en-required',
    '元素英文不可空白',
    en ? 'PASS' : 'FAIL',
    en
  );

  const quality = evaluateV3ElementQuality({
    role: role,
    ch: ch,
    en: en,
    tags: tags
  });

  const highFlags = quality.flags.filter(function (flag) {
    return flag.severity === 'high';
  });

  addCheck(
    'positive-polarity',
    '不得含明確 Avoid / defect 語意',
    highFlags.length ? 'FAIL' : 'PASS',
    highFlags.map(function (flag) { return flag.label; }).join('；')
  );

  if (role === 'color') {
    const colorText = [ch, en].join(' ');
    const moodLike =
      V3_DATA_AUDIT_COLOR_MOOD_PATTERN.test(colorText) ||
      V3_DATA_AUDIT_COLOR_MOOD_ZH_PATTERN.test(colorText);

    const hasColorCarrier =
      V3_DATA_AUDIT_EXPLICIT_COLOR_PATTERN.test(en) ||
      V3_DATA_AUDIT_EXPLICIT_COLOR_ZH_PATTERN.test(ch);

    addCheck(
      'color-core',
      'Color 必須有明確色彩核心',
      moodLike && !hasColorCarrier ? 'REVIEW' : 'PASS',
      moodLike && !hasColorCarrier ? '目前核心語意偏 Mood / Atmosphere' : ''
    );
  }

  if (role === 'technical') {
    const technicalText = [ch, en, tags].join(' ');
    let negative = false;

    V3_DATA_AUDIT_NEGATIVE_RULES.some(function (rule) {
      if (rule.pattern.test(technicalText)) {
        negative = true;
        return true;
      }
      return false;
    });

    const ambiguous =
      !negative &&
      V3_DATA_AUDIT_TECH_REVIEW_PATTERN.test(technicalText);

    addCheck(
      'technical-semantic-type',
      'Technical 語意需明確',
      ambiguous ? 'REVIEW' : 'PASS',
      ambiguous
        ? '請人工標記 positive-quality / avoid-defect / style-dependent'
        : ''
    );
  }

  addCheck(
    'template-article',
    '避免模板型前置冠詞',
    /^\s*(?:a|an)\s+/i.test(en) ? 'REVIEW' : 'PASS',
    /^\s*(?:a|an)\s+/i.test(en)
      ? '建議移除 a/an，只保留核心 phrase'
      : ''
  );

  addCheck(
    'palette-suffix',
    '避免 palette suffix 組句風險',
    /\bpalette\s*$/i.test(en) ? 'REVIEW' : 'PASS',
    /\bpalette\s*$/i.test(en)
      ? 'Color 建議只保存核心色彩描述'
      : ''
  );

  const conflictHits = getV3AuditConflictHits_({
    ch: ch,
    en: en,
    tags: tags
  });

  addCheck(
    'conflict-alias',
    '避免單列跨衝突 bucket',
    conflictHits.length ? 'REVIEW' : 'PASS',
    conflictHits.map(function (hit) {
      return hit.ruleLabel + '：' + hit.bucketLabels.join(' / ');
    }).join('；')
  );

  let duplicateRows = [];
  if (role && en) {
    const normalized = normalizeSearch_(en);

    duplicateRows = readV3Rows_()
      .filter(function (row) {
        return (
          row.role === role &&
          normalizeSearch_(row.en) === normalized
        );
      })
      .map(function (row) {
        return row.rowNumber;
      });
  }

  addCheck(
    'duplicate-role-en',
    '同 Role 英文不可重複',
    duplicateRows.length ? 'REVIEW' : 'PASS',
    duplicateRows.length
      ? '既有 rows：' + duplicateRows.join(', ')
      : ''
  );

  const hasFail = checks.some(function (item) {
    return item.status === 'FAIL';
  });

  const hasReview = checks.some(function (item) {
    return item.status === 'REVIEW';
  });

  const status = hasFail ? 'FAIL' : hasReview ? 'REVIEW' : 'PASS';

  return {
    appVersion: 'V3.8-6',
    status: status,
    canAdd: status === 'PASS',
    checks: checks,
    quality: quality,
    sheetWrite: 'NONE'
  };
}


function testV386ElementQualityGuardConfig() {
  Logger.log('App version：V3.8-6');
  Logger.log('Element Quality Guard：selected item 使用當下標示品質風險');
  Logger.log('Actions：換一個 / 移除 / 仍使用');
  Logger.log('High：明確 Avoid/defect；Medium：語意需 review；Low：組句 hygiene');
  Logger.log('Data Entry Rules：PASS / REVIEW / FAIL');
  Logger.log('Entry checks：Role / 中英文 / polarity / Color core / Technical semantic / article / palette / conflict alias / duplicate');
  Logger.log('Known exception：corpse flower 不視為屍體／血腥內容');
  Logger.log('Sheet write：NONE（V3.8-6 只驗證，不新增、不刪除資料）');
  Logger.log('Data source：Elements_v3_2');
}


function testV386ElementQualityGuardFixtures() {
  const fixtures = [
    {
      name: 'gore technical',
      input: {
        role: 'technical',
        ch: '血腥與暴力內容',
        en: 'gore and violent content'
      },
      expected: 'high'
    },
    {
      name: 'corpse flower exception',
      input: {
        role: 'subject',
        ch: '屍花',
        en: 'corpse flower bloom'
      },
      expected: 'none'
    },
    {
      name: 'warm cosy atmosphere in color',
      input: {
        role: 'color',
        ch: '溫暖氛圍',
        en: 'a warm, cosy atmosphere'
      },
      expected: 'medium'
    },
    {
      name: 'safe color',
      input: {
        role: 'color',
        ch: '柔和霧藍色',
        en: 'soft pale mist-blue'
      },
      expected: 'none'
    }
  ];

  fixtures.forEach(function (fixture) {
    const result = evaluateV3ElementQuality(fixture.input);
    Logger.log(
      fixture.name +
      '：' +
      result.severity +
      ' / expected ' +
      fixture.expected +
      ' / ' +
      (result.severity === fixture.expected ? 'PASS' : 'FAIL')
    );
  });

  Logger.log('Sheet write：NONE');
}

