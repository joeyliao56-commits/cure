/**
 * 療癒產生器 V3.9.1 - Code.gs
 * 資料來源：綁定試算表中的 Elements_v3_2 分頁
 *
 * 必要欄位：
 * 角色(role)｜新大類｜新中類｜小類｜元素中文｜元素英文｜適用類型｜建議資料去向
 *
 * 選用欄位：
 * Tag候選
 *
 * V3.8-3：新增 healingGuard（療癒感防護）Negative Prompt 清單，
 * 以及前端 iyashikei Style Layer。皆為使用者主動開啟／選擇時才生效，
 * 不修改既有 required 欄位、Prompt Builder core 或 Recipe schema。
 *
 * V3.8-4：把療癒風格拆成獨立的 Style（畫風／媒材，單選）與
 * Mood（氛圍，單選但與 Style 完全獨立、兩者可同時生效）兩個圖層，
 * 前端新增 IMAGE_MOOD_CATALOG 與對應 UI／狀態；全部是前端變動，
 * 不修改 Elements_v3_2、V3_NEGATIVE_PROFILES 或 Recipe schema 版本。
 */

const V3_SHEET_NAME = 'Elements_v3_2';
const V3_APP_VERSION = 'V3.9.4';
const V3_RECIPE_SCHEMA_VERSION = 1;
const V3_RECIPE_EXPORT_FORMAT = 'healing-generator-recipe-backup';
const V3_RECIPE_BACKUP_VERSION = 1;


const V3_UI_GROUPS = {
  核心: ['subject', 'action', 'environment'],
  氛圍: ['lighting', 'material', 'color'],
  鏡頭: ['composition', 'camera', 'motion'],
  進階: ['technical']
};

const V3_ROLE_META = {
  subject: { label: '主體', promptLabel: 'Main subject', single: true },
  action: { label: '動作與狀態', promptLabel: 'Action and expression', single: true },
  environment: { label: '場景', promptLabel: 'Environment', single: true },
  lighting: { label: '光線與氣候', promptLabel: 'Lighting and atmosphere', single: true },
  material: { label: '材質與觸感', promptLabel: 'Material and texture', single: true },
  color: { label: '色彩', promptLabel: 'Color palette', single: true },
  composition: { label: '構圖', promptLabel: 'Composition', single: true },
  camera: { label: '鏡頭', promptLabel: 'Camera and viewpoint', single: true },
  motion: { label: '動態細節', promptLabel: 'Motion and temporal details', single: false },
  technical: { label: '品質控制', promptLabel: 'Rendering quality', single: false }
};

/**
 * V3.8-5a Data Quality Audit：只讀資料品質審計規則。
 * 目的：把「資料本身的語意／角色／組句風險」與前端 Prompt Guard 分離。
 * 不修改 Elements_v3_2、不重分類、不寫回任何欄位。
 */
const V3_DATA_AUDIT_NEGATIVE_RULES = [
  {
    id: 'incongruous-mismatched-elements',
    label: '不協調／不匹配元素',
    pattern: /\b(?:incongruous\s+or\s+mismatched\s+elements|incongruous\s+elements|mismatched\s+elements)\b/i
  },
  {
    id: 'graphic-violence-gore',
    label: '血腥／暴力內容',
    pattern: /\b(?:gore|violent\s+content|graphic\s+violence|graphic\s+gore|blood\s+and\s+gore|bloody\s+injur(?:y|ies)|mutilation|dismemberment|torture|corpses?)\b/i
  },
  {
    id: 'image-quality-defects',
    label: '畫質缺陷',
    pattern: /\b(?:visual\s+noise|excessive\s+noise|coarse\s+grain|muddy\s+textures?|oversharpening\s+artifacts?|background\s+clutter|edge\s+halos?)\b/i
  },
  {
    id: 'distortion-geometry-defects',
    label: '形體／幾何缺陷',
    pattern: /\b(?:broken\s+object\s+geometry|distorted\s+forms?|distorted\s+anatomy|malformed\s+anatomy|duplicate\s+main\s+subjects?)\b/i
  },
  {
    id: 'harsh-high-contrast',
    label: '過度高反差',
    pattern: /\b(?:harsh(?:ly)?\s+(?:high[-\s]?contrast|contrast)(?:\s+visuals?)?|extreme\s+high[-\s]?contrast(?:\s+visuals?)?)\b/i
  },
  {
    id: 'excessive-post-processing',
    label: '過度濾鏡／後製',
    pattern: /\b(?:excessive\s+filters?(?:\s+and\s+post[-\s]?processing)?|excessive\s+post[-\s]?processing|over[-\s]?processed|overprocessed|artificial\s+processing\s+artifacts?)\b/i
  },
  {
    id: 'text-logo-watermark-artifacts',
    label: '文字／Logo／浮水印污染',
    pattern: /\b(?:text\s+and\s+watermarks?|logos?\s+and\s+watermarks?|unwanted\s+text|unwanted\s+logos?|watermarks?)\b/i
  },
  {
    id: 'oversaturation-garish',
    label: '過度飽和／刺眼色彩',
    pattern: /\b(?:oversaturated\s+(?:colors?|neon)|over[-\s]?saturated\s+colors?|garish\s+(?:colors?|neon\s+colors?)|lurid\s+colors?|jarring\s+neon\s+palette|extreme\s+saturation)\b/i
  },
  {
    id: 'cold-artificial-lighting',
    label: '冷人工光',
    pattern: /\b(?:cold\s+artificial\s+lighting|cold\s+synthetic\s+lighting)\b/i
  },
  {
    id: 'aggressive-unsettling-tone',
    label: '侵略／不安氛圍',
    pattern: /\b(?:aggressive\s+(?:or\s+)?unsettling\s+tone|aggressive\s+tone|unsettling\s+tone)\b/i
  }
];

const V3_DATA_AUDIT_COLOR_MOOD_PATTERN = /\b(?:atmosphere|mood|ambience|ambiance|feeling|cosy|cozy|healing|soothing|restorative|peaceful|tranquil)\b/i;
const V3_DATA_AUDIT_COLOR_MOOD_ZH_PATTERN = /(?:氛圍|氣氛|心情|療癒|治癒|舒適|溫馨|寧靜|平靜|安定|悠閒)/;
const V3_DATA_AUDIT_TECH_REVIEW_PATTERN = /\b(?:grain|noise|contrast|saturation|filters?|post[-\s]?processing|artifact|clutter|distort|broken|harsh|garish|violent|gore|unwanted|avoid|without|no\s+)\b/i;


/**
 * V3.8-5a Data Correction Plan：只提供人工審核建議，不寫回 Sheet。
 * reviewStatus 一律從 REVIEW 開始；suggestedAction 只是建議，不等於已核准。
 */
const V3_DATA_CORRECTION_ACTIONS = [
  'KEEP', 'FIX_TEXT', 'MOVE_ROLE', 'AVOID_ONLY', 'AUDIT_FALSE_POSITIVE', 'REVIEW'
];

const V3_DATA_AUDIT_EXPLICIT_COLOR_PATTERN = /\b(?:palette|tones?|colou?rs?|colors?|gradient|gray|grey|blue|green|brown|red|orange|yellow|purple|violet|pink|beige|taupe|teal|cyan|magenta|black|white|earth\s+tones?)\b/i;
const V3_DATA_AUDIT_EXPLICIT_COLOR_ZH_PATTERN = /(?:色調|色系|色彩|配色|漸層|灰|藍|綠|棕|褐|紅|橙|黃|紫|粉|米色|黑|白|大地色)/;

const V3_DATA_AUDIT_CONFLICT_RULES = [
  {
    id: 'time-of-day',
    label: '時段',
    buckets: [
      { id: 'morning', label: '清晨／日出', pattern: /\b(?:morning|morning\s+light|dawn|sunrise)\b|(?:清晨|晨光|早晨|日出)/i },
      { id: 'golden-hour', label: '金色時刻／夕陽', pattern: /\b(?:golden\s+hour|sunset|dusk)\b|(?:黃金時刻|夕陽|日落|黃昏)/i },
      { id: 'blue-hour', label: '藍調時刻／暮光', pattern: /\b(?:blue\s+hour|twilight)\b|(?:藍調時刻|暮光|薄暮)/i },
      { id: 'night', label: '夜晚／月光', pattern: /\b(?:night|nighttime|moonlight|starlight)\b|(?:夜晚|夜景|月光|星光|星空)/i }
    ]
  },
  {
    id: 'camera-angle',
    label: '鏡頭視角',
    buckets: [
      { id: 'top', label: '俯拍／鳥瞰', pattern: /\b(?:top[-\s]?down|overhead|aerial\s+view|bird(?:'s)?[-\s]?eye)\b|(?:俯拍|俯視|鳥瞰)/i },
      { id: 'low', label: '仰拍／低角度', pattern: /\b(?:low[-\s]?angle|worm(?:'s)?[-\s]?eye)\b|(?:仰拍|低角度)/i },
      { id: 'pov', label: '第一人稱 POV', pattern: /\b(?:pov|first[-\s]?person)\b|(?:第一人稱|主觀視角)/i }
    ]
  },
  {
    id: 'shot-scale',
    label: '景別',
    buckets: [
      { id: 'close', label: '近拍／特寫', pattern: /\b(?:close[-\s]?up|macro|extreme\s+close[-\s]?up)\b|(?:近拍|特寫|微距)/i },
      { id: 'wide', label: '廣角／全景', pattern: /\b(?:wide\s+shot|wide[-\s]?angle|long\s+shot|panoramic)\b|(?:廣角|全景|遠景)/i }
    ]
  },
  {
    id: 'depth-of-field',
    label: '景深',
    buckets: [
      { id: 'shallow', label: '淺景深', pattern: /\b(?:shallow\s+depth\s+of\s+field|shallow\s+dof|bokeh)\b|(?:淺景深|散景)/i },
      { id: 'deep', label: '深景深', pattern: /\b(?:deep\s+depth\s+of\s+field|deep\s+dof|everything\s+in\s+focus)\b|(?:深景深|全景清晰)/i }
    ]
  }
];



/**
 * V3.4-3 圖片／影片模式設定。
 * required = 平衡隨機必補；optional = 依機率抽；completeness = 前端完整度檢查。
 */
const V3_MODE_PROFILES = {
  圖片: {
    label: '圖片',
    summary: '畫面結構優先：主體／場景 → 構圖／鏡頭／光線 → 材質／色彩',
    randomRequired: { subject: 1, environment: 1, composition: 1, camera: 1, lighting: 1 },
    randomOptional: { action: 0.45, material: 0.72, color: 0.72, motion: 0.12 },
    extraChance: { motion: 0, technical: 0.35 },
    technicalMin: 1,
    completeness: [
      { id: 'visual-anchor', label: '畫面核心', description: '至少有主體或場景', anyOf: ['subject', 'environment'], severity: 'required' },
      { id: 'framing', label: '畫面構圖', description: '建議有構圖或鏡頭', anyOf: ['composition', 'camera'], severity: 'recommended' },
      { id: 'lighting', label: '光線', description: '建議指定光線與氛圍', anyOf: ['lighting'], severity: 'recommended' }
    ],
    promptPriority: ['subject', 'environment', 'composition', 'camera', 'lighting', 'material', 'color', 'action', 'motion', 'technical']
  },
  影片: {
    label: '影片',
    summary: '時間與動態優先：主體／動作／動態 → 場景 → 鏡頭／光線 → 連續性',
    randomRequired: { subject: 1, environment: 1, action: 1, camera: 1, lighting: 1, motion: 1 },
    randomOptional: { composition: 0.72, material: 0.45, color: 0.45 },
    extraChance: { motion: 0.32, technical: 0.30 },
    technicalMin: 1,
    completeness: [
      { id: 'visual-anchor', label: '影片核心', description: '至少有主體或場景', anyOf: ['subject', 'environment'], severity: 'required' },
      { id: 'temporal-cue', label: '時間動態', description: '至少有動作或動態細節', anyOf: ['action', 'motion'], severity: 'required' },
      { id: 'camera', label: '鏡頭', description: '建議指定鏡頭或構圖', anyOf: ['camera', 'composition'], severity: 'recommended' },
      { id: 'lighting', label: '光線連續性', description: '建議指定光線與氛圍', anyOf: ['lighting'], severity: 'recommended' }
    ],
    promptPriority: ['subject', 'action', 'motion', 'environment', 'camera', 'composition', 'lighting', 'material', 'color', 'technical']
  }
 };

/**
 * V3.4-4 Prompt 密度設定。
 *
 * 簡潔：降低隨機 Role 數量，Prompt 用短句保留核心指令。
 * 標準：完全沿用 V3.4-3 的圖片／影片分流策略。
 * 豐富：主動補足視覺／時間細節，並提高 technical / motion 密度。
 *
 * 注意：密度只影響「自動隨機」與「組句詳略」。
 * 使用者手動選取的元素不會因切換密度而被刪除。
 */
const V3_DENSITY_PROFILES = {
  簡潔: {
    label: '簡潔',
    summary: '少量核心條件，Prompt 更短、更直接',
    promptStyle: 'concise'
  },
  標準: {
    label: '標準',
    summary: '平衡畫面控制與細節，沿用 V3.4-3 的預設密度',
    promptStyle: 'standard'
  },
  豐富: {
    label: '豐富',
    summary: '主動補足材質、色彩、動態與品質控制，Prompt 更完整',
    promptStyle: 'rich'
  }
};



/**
 * V3.5-2 元素重要度／Prompt 權重。
 *
 * 重要：
 * - 這是「這次 Prompt」的前端創作狀態，不寫回 Elements_v3_2。
 * - 輔助 = 預設，盡量維持 V3.5-1 原本 Prompt 行為。
 * - 核心 = 在 Positive Prompt 內提高優先級與明確度。
 * - 弱化 = 仍保留元素，但要求模型以低存在感、非焦點方式呈現。
 * - Negative / Avoid 不受元素重要度影響。
 */
const V3_IMPORTANCE_PROFILES = {
  core: {
    label: '核心',
    shortLabel: '核',
    order: 0,
    summary: '最高優先，必須清楚保留並主導結果'
  },
  support: {
    label: '輔助',
    shortLabel: '輔',
    order: 1,
    summary: '預設權重，正常參與 Prompt'
  },
  subtle: {
    label: '弱化',
    shortLabel: '弱',
    order: 2,
    summary: '保留但降低存在感，不搶主要焦點'
  }
};

/**
 * V3.5-1 模式化 Negative / Avoid Prompt。
 *
 * 原則：
 * 1. 正向 Prompt 專心描述「要什麼」。
 * 2. Negative / Avoid 專心描述「不要什麼」。
 * 3. 只使用受控清單，不自由生成新的負面條件。
 * 4. 防拼貼條件只有 anti-collage 開啟時才追加。
 * 5. 密度越高，品質控制越完整，但不修改 Elements_v3_2。
 */
const V3_NEGATIVE_PROFILES = {
  圖片: {
    簡潔: [
      'unwanted text',
      'logos',
      'watermarks',
      'duplicate main subjects'
    ],
    標準: [
      'unwanted text',
      'logos',
      'watermarks',
      'duplicate main subjects',
      'distorted forms or anatomy',
      'broken object geometry',
      'inconsistent perspective',
      'muddy details',
      'oversharpening artifacts'
    ],
    豐富: [
      'unwanted text',
      'logos',
      'watermarks',
      'duplicate main subjects',
      'distorted forms or anatomy',
      'broken object geometry',
      'inconsistent perspective',
      'inconsistent shadows',
      'blown highlights',
      'crushed blacks',
      'muddy textures',
      'edge halos',
      'excessive noise',
      'background clutter',
      'oversharpening artifacts'
    ],
    antiCollage: [
      'collage',
      'split screen',
      'multi-panel layout',
      'inset frames'
    ],

    // V3.8-3：療癒感防護（healingGuard）。只在使用者主動開啟時追加，
    // 用來排除會破壞療癒氛圍的視覺元素，不影響原本的品質控制清單。
    healingGuard: [
      'clinical or sterile mood',
      'harsh contrast',
      'oversaturated colors',
      'cold artificial lighting',
      'chaotic clutter',
      'jarring composition',
      'aggressive or unsettling tone'
    ]
  },

  影片: {
    簡潔: [
      'unwanted text',
      'logos',
      'watermarks',
      'flicker',
      'identity drift',
      'object popping',
      'abrupt scene changes'
    ],
    標準: [
      'unwanted text',
      'logos',
      'watermarks',
      'flicker',
      'identity drift',
      'object popping',
      'unintended morphing',
      'duplicate subjects',
      'unmotivated camera jitter',
      'abrupt camera jumps',
      'unstable scene geometry',
      'texture crawling',
      'abrupt scene changes'
    ],
    豐富: [
      'unwanted text',
      'logos',
      'watermarks',
      'flicker',
      'identity drift',
      'facial feature drift',
      'anatomy drift',
      'object popping',
      'unintended morphing',
      'duplicate subjects',
      'scale drift',
      'background warping',
      'occlusion errors',
      'unmotivated camera jitter',
      'abrupt camera jumps',
      'discontinuous motion',
      'unstable scene geometry',
      'texture crawling',
      'temporal noise',
      'inconsistent lighting or exposure',
      'abrupt scene changes'
    ],
    antiCollage: [
      'collage',
      'split screen',
      'multi-panel layout',
      'inset frames'
    ],

    // V3.8-3：影片版療癒感防護，額外排除破壞節奏穩定感的剪接／運鏡問題。
    healingGuard: [
      'clinical or sterile mood',
      'harsh contrast',
      'oversaturated colors',
      'cold artificial lighting',
      'chaotic clutter',
      'jarring composition',
      'aggressive or unsettling tone',
      'frantic pacing',
      'abrupt jarring cuts'
    ]
  }
};

/** V3.3-5 受控搜尋同義詞／別名。 */
const V3_SEARCH_SYNONYM_GROUPS = [
  ['貓咪', '貓', 'cat', 'cats'],
  ['狗狗', '狗', '犬', 'dog', 'dogs'],
  ['兔兔', '兔子', '兔', 'rabbit', 'bunny'],
  ['鳥兒', '鳥類', '鳥', 'bird', 'birds'],
  ['熊熊', '熊', 'bear'], ['狐狸', '狐', 'fox'], ['鹿', 'deer'], ['松鼠', 'squirrel'], ['蝴蝶', 'butterfly'], ['魚類', '魚', 'fish'],
  ['花朵', '花卉', '花', 'flower', 'flowers'], ['樹木', '樹', 'tree', 'trees'], ['觀葉植物', '觀葉', 'foliage plant'], ['蕨類', '蕨', 'fern'], ['苔蘚', '青苔', 'moss'], ['多肉植物', '多肉', 'succulent'], ['仙人掌', 'cactus'], ['香草', 'herb', 'herbs'], ['竹子', '竹', 'bamboo'],
  ['咖啡', 'coffee'], ['茶飲', '茶', 'tea'], ['甜點', '甜品', 'dessert'], ['蛋糕', 'cake'], ['麵包', 'bread'],
  ['夕陽', '日落', 'sunset'], ['晨光', '清晨光', '早晨光', 'morning light'], ['黃金時刻', 'golden hour'], ['逆光', 'backlight', 'backlighting'], ['柔光', '柔和光', '柔和光線', 'soft light', 'diffused light'], ['自然光', '日光', 'natural light', 'daylight'], ['月光', 'moonlight'],
  ['森林', '林地', 'forest', 'woodland'], ['海洋', '大海', 'ocean', 'sea'], ['湖泊', '湖', 'lake'], ['河川', '河流', 'river'], ['草原', '田野', 'meadow', 'field'], ['臥室', '寢室', 'bedroom'], ['浴室', '衛浴', 'bathroom'], ['咖啡廳', '咖啡館', 'cafe', 'café'], ['花園', '庭園', 'garden'],
  ['雨天', '下雨', 'rainy', 'rain'], ['霧氣', '薄霧', 'mist', 'fog'], ['雪景', '下雪', 'snow', 'snowy'],
  ['白色', '純白', 'white'], ['米色', '米白', 'beige'], ['暖色', '暖色調', 'warm tone', 'warm tones'], ['冷色', '冷色調', 'cool tone', 'cool tones'],
  ['近拍', '特寫', 'close-up', 'closeup', 'close up'], ['微距', 'macro'], ['俯拍', '俯視', 'top-down', 'top down', 'overhead'], ['鳥瞰', 'bird eye view', "bird's-eye view", 'aerial view'], ['仰拍', '低角度', 'low angle'], ['第一人稱', '主觀視角', 'pov', 'first-person', 'first person'], ['背景虛化', '背景散景', 'bokeh'],
  ['慢動作', '慢動態', 'slow motion'], ['循環', '無縫循環', 'loop', 'seamless loop'], ['搖曳', '輕擺', 'sway', 'swaying'],
  ['療癒', '治癒', 'healing', 'soothing'], ['靜謐', '寧靜', 'serene', 'tranquil'], ['溫暖', '暖意', 'cozy', 'warm'], ['夢幻', 'dreamy'], ['極簡', 'minimal', 'minimalist'], ['秋季', '秋天', 'autumn'], ['春季', '春天', 'spring'], ['夏季', '夏天', 'summer'], ['冬季', '冬天', 'winter'], ['熱帶', 'tropical'], ['高山', 'alpine']
];

function doGet() {
  return HtmlService
    .createHtmlOutputFromFile('Index')
    .setTitle('療癒產生器 V3.9.1')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0, maximum-scale=1.0');
}

/**
 * 首頁初始化只取分類清單與數量，不傳送全部 13k+ 元素。
 */
function getV3Manifest() {
  const rows = readV3Rows_();
  const roleStats = {};

  rows.forEach(function (row) {
    if (!isElementRow_(row)) return;
    if (!V3_ROLE_META[row.role]) return;

    if (!roleStats[row.role]) {
      roleStats[row.role] = {
        role: row.role,
        label: V3_ROLE_META[row.role].label,
        major: row.major,
        count: 0,
        middleMap: {}
      };
    }

    const roleStat = roleStats[row.role];
    roleStat.count += 1;

    const middleName = row.middle || '未分類';
    if (!roleStat.middleMap[middleName]) {
      roleStat.middleMap[middleName] = {
        name: middleName,
        count: 0,
        minorMap: {}
      };
    }

    const middleStat = roleStat.middleMap[middleName];
    middleStat.count += 1;

    const minorName = row.minor || '未分類';
    middleStat.minorMap[minorName] =
      (middleStat.minorMap[minorName] || 0) + 1;
  });

  const groups = Object.keys(V3_UI_GROUPS).map(function (groupName) {
    const roles = V3_UI_GROUPS[groupName]
      .map(function (role) {
        const stat = roleStats[role];
        if (!stat) return null;

        const middles = Object.keys(stat.middleMap)
          .sort(function (a, b) {
            return a.localeCompare(b, 'zh-Hant');
          })
          .map(function (middleName) {
            const middleStat = stat.middleMap[middleName];

            const minors = Object.keys(middleStat.minorMap)
              .sort(function (a, b) {
                return a.localeCompare(b, 'zh-Hant');
              })
              .map(function (minorName) {
                return {
                  name: minorName,
                  count: middleStat.minorMap[minorName]
                };
              });

            return {
              name: middleName,
              count: middleStat.count,
              minors: minors
            };
          });

        return {
          role: role,
          label: stat.label,
          major: stat.major,
          count: stat.count,
          single: V3_ROLE_META[role].single,
          middles: middles
        };
      })
      .filter(Boolean);

    return {
      name: groupName,
      roles: roles
    };
  });

  return {
    sheetName: V3_SHEET_NAME,
    total: rows.filter(isElementRow_).length,
    groups: groups,
    tagSearchEnabled: true,
    aliasSearchEnabled: true,
    aliasGroupCount: V3_SEARCH_SYNONYM_GROUPS.length,
    modeProfiles: getClientModeProfiles_(),
    densityProfiles: getClientDensityProfiles_(),
    negativeProfiles: getClientNegativeProfiles_(),
    importanceProfiles: getClientImportanceProfiles_(),
    appVersion: V3_APP_VERSION,
    recipeSchemaVersion: V3_RECIPE_SCHEMA_VERSION,
    recipeExportFormat: V3_RECIPE_EXPORT_FORMAT,
    recipeBackupVersion: V3_RECIPE_BACKUP_VERSION,
    dataQualityAuditEnabled: true,
    dataQualityAuditExportEnabled: true,
    dataCorrectionPlanEnabled: true,
    correctionReviewWorkspaceEnabled: true,
    correctionReviewWorkspaceVersion: 'V3.8-5b',
    dataQualityAuditVersion: 'V3.8-5b',
    elementsV4FoundationEnabled: true,
    elementsV4SheetName: 'Elements_v4',
    elementsV4SchemaVersion: '4.0',
    productionSourceUnchanged: true
  };
}

/**
 * 瀏覽某個 role / 中類 / 小類。
 * 使用 offset + limit 避免一次把數千個 tag 全部塞進 DOM。
 * 目前 role 內搜尋也支援 Tag候選。
 */
function getElementsV3(params) {
  params = params || {};
  const role = clean_(params.role);
  const middle = clean_(params.middle);
  const minor = clean_(params.minor);
  const mode = normalizeMode_(params.mode);
  const searchInfo = expandSearchQuery_(params.query);
  const offset = Math.max(0, Number(params.offset) || 0);
  const limit = clamp_(Number(params.limit) || 240, 24, 400);

  if (!V3_ROLE_META[role]) throw new Error('無效的 role：' + role);

  const matched = readV3Rows_().filter(function (row) {
    if (!isElementRow_(row) || row.role !== role) return false;
    if (!isModeCompatible_(row.type, mode)) return false;
    if (middle && row.middle !== middle) return false;
    if (minor && row.minor !== minor) return false;
    if (searchInfo.original) {
      const rank = getSearchMatchRank_(buildSearchText_(row), searchInfo);
      if (!rank) return false;
      row.__searchRank = rank;
    }
    return true;
  });

  if (searchInfo.original) {
    matched.sort(function (a, b) { return (b.__searchRank || 0) - (a.__searchRank || 0); });
  }

  const page = matched.slice(offset, offset + limit).map(toClientItem_);
  return {
    items: page,
    total: matched.length,
    offset: offset,
    nextOffset: offset + page.length < matched.length ? offset + page.length : null,
    searchTerms: searchInfo.terms,
    aliases: getDisplayAliases_(searchInfo.original)
  };
}


/**
 * 全資料搜尋。輸入至少 1 字即可。
 * 搜尋欄位：
 * - 新大類 / 新中類 / 小類
 * - 元素中文 / 元素英文
 * - Tag候選
 */
function searchElementsV3(params) {
  params = params || {};
  const searchInfo = expandSearchQuery_(params.term);
  const mode = normalizeMode_(params.mode);
  const limit = clamp_(Number(params.limit) || 180, 20, 300);

  if (!searchInfo.original) return { items: [], total: 0, searchTerms: [], aliases: [] };

  const matched = [];
  readV3Rows_().forEach(function (row) {
    if (!isElementRow_(row) || !V3_ROLE_META[row.role]) return;
    if (!isModeCompatible_(row.type, mode)) return;
    const rank = getSearchMatchRank_(buildSearchText_(row), searchInfo);
    if (rank) matched.push({ rank: rank, item: toClientItem_(row) });
  });

  matched.sort(function (a, b) { return b.rank - a.rank; });
  return {
    items: matched.slice(0, limit).map(function (entry) { return entry.item; }),
    total: matched.length,
    searchTerms: searchInfo.terms,
    aliases: getDisplayAliases_(searchInfo.original)
  };
}


/**
 * V3.8-5a Data Quality Audit。
 * 只讀掃描 Elements_v3_2，回傳統計與可疑列，不寫回 Sheet。
 *
 * params.limit：一般畫面最多回傳幾筆 issue（預設 600，最大 1200）。
 * params.full=true：回傳完整 issues，用於 JSON / CSV / Correction Plan 匯出。
 * 統計永遠以完整資料集計算；本函式仍為只讀。
 */
function getV3DataQualityAudit(params) {
  params = params || {};
  const returnAllIssues = params.full === true;
  const issueLimit = returnAllIssues ? null : clamp_(Number(params.limit) || 600, 50, 1200);
  const rows = readV3Rows_().filter(function (row) {
    return isElementRow_(row) && !!V3_ROLE_META[row.role];
  });

  const issues = [];
  const issueKeys = {};
  const severityCounts = { high: 0, medium: 0, low: 0 };
  const typeCounts = {};
  const roleCounts = {};
  const technicalSemanticCounts = {
    'avoid-defect': 0,
    'manual-review': 0,
    'positive-quality-candidate': 0
  };
  const correctionActionCounts = {
    KEEP: 0,
    FIX_TEXT: 0,
    MOVE_ROLE: 0,
    AVOID_ONLY: 0,
    AUDIT_FALSE_POSITIVE: 0,
    REVIEW: 0
  };

  const duplicateEnMap = {};

  function addIssue(row, severity, type, label, detail, suggestion, semanticType) {
    const key = [row.rowNumber, type].join(':');
    if (issueKeys[key]) return;
    issueKeys[key] = true;

    const issue = {
      id: key,
      rowNumber: row.rowNumber,
      severity: String(severity || '').toLowerCase(),
      type: type,
      label: label,
      role: row.role,
      roleLabel: V3_ROLE_META[row.role] ? V3_ROLE_META[row.role].label : row.role,
      major: row.major,
      middle: row.middle,
      minor: row.minor,
      ch: row.ch,
      en: row.en,
      detail: detail || '',
      suggestion: suggestion || '',
      semanticType: semanticType || ''
    };

    const correction = getV3AuditSuggestedCorrection_(issue);
    issue.suggestedAction = correction.action;
    issue.suggestedTarget = correction.target || '';
    issue.suggestedReason = correction.reason || '';
    issue.reviewStatus = 'REVIEW';
    issue.reviewerDecision = '';
    issue.proposedRole = '';
    issue.proposedEnglish = '';
    issue.reviewNote = '';

    issues.push(issue);
    severityCounts[severity] = (severityCounts[severity] || 0) + 1;
    typeCounts[type] = (typeCounts[type] || 0) + 1;
    roleCounts[row.role] = (roleCounts[row.role] || 0) + 1;
    correctionActionCounts[issue.suggestedAction] = (correctionActionCounts[issue.suggestedAction] || 0) + 1;
  }

  rows.forEach(function (row) {
    const text = [row.ch, row.en, row.tags].join(' ').trim();
    const en = clean_(row.en);

    if (!en) {
      addIssue(
        row,
        'medium',
        'missing-english',
        '缺少元素英文',
        '目前前端會 fallback 到元素中文，但英文 Prompt 的一致性與模型可讀性可能下降。',
        '補上可直接作為 Prompt phrase 的英文描述。',
        'manual-review'
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

    if (matchedNegativeRule) {
      addIssue(
        row,
        'high',
        'positive-polarity-risk',
        'Positive 極性風險：' + matchedNegativeRule.label,
        '元素文字命中明確 Avoid／缺陷語意；若直接進 Positive Prompt 可能反向要求模型生成不想要的內容。',
        '人工確認後標記為 avoid-defect，或在下一版資料源移出可直接注入 Positive 的資料。',
        'avoid-defect'
      );
    }

    if (row.role === 'technical') {
      if (matchedNegativeRule) {
        technicalSemanticCounts['avoid-defect'] += 1;
      } else if (V3_DATA_AUDIT_TECH_REVIEW_PATTERN.test(text)) {
        technicalSemanticCounts['manual-review'] += 1;
        addIssue(
          row,
          'medium',
          'technical-semantic-review',
          '品質控制語意需人工確認',
          '包含 grain / contrast / saturation / processing / artifact 等可能依上下文正負皆可的技術詞。',
          '確認此元素是 positive-quality、avoid-defect 或 style-dependent，再決定 Elements_v3_3 的資料去向。',
          'manual-review'
        );
      } else {
        technicalSemanticCounts['positive-quality-candidate'] += 1;
      }
    }

    if (row.role === 'color') {
      const colorText = [row.ch, row.en].join(' ');
      if (V3_DATA_AUDIT_COLOR_MOOD_PATTERN.test(colorText) || V3_DATA_AUDIT_COLOR_MOOD_ZH_PATTERN.test(colorText)) {
        addIssue(
          row,
          'medium',
          'color-mood-role-risk',
          'Color Role 可能混入 Mood／Atmosphere',
          '色彩 Role 的元素包含 mood / atmosphere / ambience / cosy / healing 等氛圍語意。',
          '人工確認是否應留在 color，或未來移往 Mood／Lighting／Tag；本版不自動重分類。',
          'manual-review'
        );
      }

      if (/\bpalette\s*$/i.test(en)) {
        addIssue(
          row,
          'low',
          'color-palette-suffix',
          'Color phrase 已自帶 palette',
          '舊 Builder 容易形成 palette palette；目前前端已有 normalization，但資料本身仍可標記整理。',
          'Elements_v3_3 可考慮統一保存為不含 Builder suffix 的核心色彩片語。',
          'normalization-candidate'
        );
      }

      if (/^\s*(?:a|an)\s+/i.test(en)) {
        addIssue(
          row,
          'low',
          'color-leading-article',
          'Color phrase 含前置冠詞',
          '若再由模板補冠詞，可能形成 a controlled a ... 之類不自然組句。',
          'Elements_v3_3 可考慮移除模板型前置冠詞，只保留核心描述。',
          'normalization-candidate'
        );
      }
    }

    const conflictHits = getV3AuditConflictHits_(row);
    conflictHits.forEach(function (hit) {
      addIssue(
        row,
        'medium',
        'single-row-conflict-alias',
        '單一元素跨衝突 bucket：' + hit.ruleLabel,
        '同一列同時命中「' + hit.bucketLabels.join('／') + '」，前端 conflict resolver 可能需要額外 alias 判斷。',
        '人工確認元素文字是否本身混合多個互斥概念；若只是同義誤判，調整 alias，而不是改 taxonomy。',
        'manual-review'
      );
    });

    if (en) {
      const dupKey = row.role + '|' + normalizeSearch_(en);
      if (!duplicateEnMap[dupKey]) duplicateEnMap[dupKey] = [];
      duplicateEnMap[dupKey].push(row);
    }
  });

  Object.keys(duplicateEnMap).forEach(function (key) {
    const same = duplicateEnMap[key];
    if (!same || same.length < 2) return;
    const rowNumbers = same.map(function (row) { return row.rowNumber; });
    same.forEach(function (row) {
      addIssue(
        row,
        'low',
        'duplicate-english-same-role',
        '同 Role 英文描述重複',
        '相同英文在同一 Role 出現於列：' + rowNumbers.join(', '),
        '確認是否為不同分類下刻意共用，或可在 Elements_v3_3 去重／改寫。',
        'duplicate-review'
      );
    });
  });

  const severityOrder = { high: 0, medium: 1, low: 2 };
  issues.sort(function (a, b) {
    const severityA = severityOrder[a.severity] == null ? 9 : severityOrder[a.severity];
    const severityB = severityOrder[b.severity] == null ? 9 : severityOrder[b.severity];
    const severityDiff = severityA - severityB;
    if (severityDiff) return severityDiff;
    return a.rowNumber - b.rowNumber;
  });

  const totalIssueCount = issues.length;
  const returnedIssues = returnAllIssues ? issues : issues.slice(0, issueLimit);
  const correctionReviewRows = buildV3CorrectionReviewRows_(issues);
  const correctionReviewSuggestedActionCounts = {};
  V3_DATA_CORRECTION_ACTIONS.forEach(function (action) {
    correctionReviewSuggestedActionCounts[action] = 0;
  });
  correctionReviewRows.forEach(function (row) {
    correctionReviewSuggestedActionCounts[row.suggestedAction] =
      (correctionReviewSuggestedActionCounts[row.suggestedAction] || 0) + 1;
  });
  const auditSignature = getV3CorrectionReviewSignature_(issues);

  return {
    appVersion: V3_APP_VERSION,
    sheetName: V3_SHEET_NAME,
    auditSchemaVersion: 1,
    correctionPlanVersion: 1,
    auditedAt: new Date().toISOString(),
    totalRows: rows.length,
    totalIssueCount: totalIssueCount,
    returnedIssueCount: returnedIssues.length,
    truncated: totalIssueCount > returnedIssues.length,
    exportComplete: totalIssueCount === returnedIssues.length,
    severityCounts: severityCounts,
    typeCounts: typeCounts,
    roleCounts: roleCounts,
    technicalSemanticCounts: technicalSemanticCounts,
    correctionActionCounts: correctionActionCounts,
    correctionActions: V3_DATA_CORRECTION_ACTIONS.slice(),
    correctionReviewRowCount: correctionReviewRows.length,
    correctionReviewSuggestedActionCounts: correctionReviewSuggestedActionCounts,
    correctionReviewRows: returnAllIssues ? correctionReviewRows : [],
    correctionReviewComplete: returnAllIssues,
    auditSignature: auditSignature,
    issues: returnedIssues
  };
}

/**
 * 把 Audit issue 轉成「建議處理」，但不代表已核准，也不寫回資料。
 */
function getV3AuditSuggestedCorrection_(issue) {
  issue = issue || {};
  const en = clean_(issue.en);
  const ch = clean_(issue.ch);
  const type = clean_(issue.type);
  const role = clean_(issue.role);

  if (type === 'positive-polarity-risk') {
    // 已知 entity exception：corpse flower 是植物名稱，保留 Audit signal 但建議標 false positive。
    if (/\bcorpse\s+flower\b/i.test(en) || /屍花/.test(ch)) {
      return {
        action: 'AUDIT_FALSE_POSITIVE',
        target: '',
        reason: 'corpse flower 為植物名稱；命中 corpse 關鍵字但不代表血腥／屍體內容。'
      };
    }
    if (role === 'technical') {
      return {
        action: 'AVOID_ONLY',
        target: 'Negative / Avoid 或非 Positive 資料層',
        reason: '品質控制元素含明確缺陷／Avoid 語意，不宜直接注入 Positive Prompt。'
      };
    }
    return {
      action: 'REVIEW',
      target: '',
      reason: '非 technical 的極性命中需要結合實體名稱與上下文人工確認。'
    };
  }

  if (type === 'missing-english') {
    return {
      action: 'FIX_TEXT',
      target: '元素英文',
      reason: '補上可直接組 Prompt 的英文描述。'
    };
  }

  if (type === 'color-mood-role-risk') {
    const hasColorCarrier = V3_DATA_AUDIT_EXPLICIT_COLOR_PATTERN.test(en) || V3_DATA_AUDIT_EXPLICIT_COLOR_ZH_PATTERN.test(ch);
    if (hasColorCarrier) {
      return {
        action: 'KEEP',
        target: 'color',
        reason: '雖含 calm / tranquil 等氛圍形容詞，但仍有明確 color / palette / tones 核心，可保留 Color。'
      };
    }
    return {
      action: 'MOVE_ROLE',
      target: 'Mood / Lighting / Tag（人工決定）',
      reason: '核心語意偏 atmosphere / mood，缺少明確色彩載體。'
    };
  }

  if (type === 'color-palette-suffix' || type === 'color-leading-article') {
    return {
      action: 'FIX_TEXT',
      target: '元素英文',
      reason: '建議只保留核心色彩片語，移除模板型 suffix／冠詞，降低 Builder 組句風險。'
    };
  }

  if (type === 'technical-semantic-review' || type === 'single-row-conflict-alias' || type === 'duplicate-english-same-role') {
    return {
      action: 'REVIEW',
      target: '',
      reason: '此訊號可能是合法描述、同義 alias 或刻意重複，需要人工判讀後再決定。'
    };
  }

  return {
    action: 'REVIEW',
    target: '',
    reason: '尚無高信心自動建議；保留人工 review。'
  };
}

function getV3AuditConflictHits_(row) {
  const text = [row.ch, row.en, row.tags].join(' ');
  const result = [];

  V3_DATA_AUDIT_CONFLICT_RULES.forEach(function (rule) {
    const matched = (rule.buckets || []).filter(function (bucket) {
      return bucket.pattern.test(text);
    });
    if (matched.length > 1) {
      result.push({
        ruleId: rule.id,
        ruleLabel: rule.label,
        bucketIds: matched.map(function (bucket) { return bucket.id; }),
        bucketLabels: matched.map(function (bucket) { return bucket.label; })
      });
    }
  });

  return result;
}


/**
 * V3.8-5b：把 issue-level Correction Plan 合併為 row-level Review Workspace。
 * 同一 Sheet row 只產生一個 review item，但完整保留 issue evidence。
 */
function buildV3CorrectionReviewRows_(issues) {
  const groups = {};
  const severityRank = { high: 3, medium: 2, low: 1 };

  (issues || []).forEach(function (issue) {
    if (!issue || !issue.rowNumber) return;
    const key = String(issue.rowNumber);
    if (!groups[key]) {
      groups[key] = {
        reviewId: 'row-' + key,
        rowNumber: Number(issue.rowNumber),
        role: issue.role || '',
        roleLabel: issue.roleLabel || issue.role || '',
        major: issue.major || '',
        middle: issue.middle || '',
        minor: issue.minor || '',
        ch: issue.ch || '',
        en: issue.en || '',
        severity: issue.severity || 'low',
        issueCount: 0,
        issueIds: [],
        issueTypes: [],
        suggestedActions: [],
        issues: []
      };
    }

    const group = groups[key];
    group.issueCount += 1;
    group.issueIds.push(issue.id || '');
    if (group.issueTypes.indexOf(issue.type) === -1) group.issueTypes.push(issue.type);
if (group.suggestedActions.indexOf(issue.suggestedAction) === -1) group.suggestedActions.push(issue.suggestedAction || 'REVIEW');
    if ((severityRank[issue.severity] || 0) > (severityRank[group.severity] || 0)) group.severity = issue.severity;
    group.issues.push(issue);
  });

  const rows = Object.keys(groups).map(function (key) {
    const group = groups[key];
    const correction = getV3RowSuggestedCorrection_(group.issues);
    group.suggestedAction = correction.action;
    group.suggestedTarget = correction.target || '';
    group.suggestedReason = correction.reason || '';
    group.reviewStatus = 'PENDING';
    group.reviewerDecision = '';
    group.proposedRole = '';
    group.proposedEnglish = '';
    group.reviewNote = '';
    return group;
  });

  rows.sort(function (a, b) {
    const severityDiff = (severityRank[b.severity] || 0) - (severityRank[a.severity] || 0);
    if (severityDiff) return severityDiff;
    return a.rowNumber - b.rowNumber;
  });

  return rows;
}

/**
 * Row-level 建議優先序：AVOID_ONLY > MOVE_ROLE > REVIEW > FIX_TEXT > FALSE_POSITIVE > KEEP。
 * FALSE_POSITIVE 只有在該 row 的所有 issue 都是 false-positive 建議時才可直接成立。
 */
function getV3RowSuggestedCorrection_(issues) {
  const list = (issues || []).filter(Boolean);
  const actions = list.map(function (issue) { return issue.suggestedAction || 'REVIEW'; });

  function findAction(action) {
    return list.filter(function (issue) { return (issue.suggestedAction || 'REVIEW') === action; });
  }

  let selectedAction = 'REVIEW';
  if (actions.indexOf('AVOID_ONLY') !== -1) selectedAction = 'AVOID_ONLY';
  else if (actions.indexOf('MOVE_ROLE') !== -1) selectedAction = 'MOVE_ROLE';
  else if (actions.indexOf('AUDIT_FALSE_POSITIVE') !== -1 && actions.some(function (action) { return action !== 'AUDIT_FALSE_POSITIVE'; })) selectedAction = 'REVIEW';
  else if (actions.indexOf('REVIEW') !== -1) selectedAction = 'REVIEW';
  else if (actions.indexOf('FIX_TEXT') !== -1) selectedAction = 'FIX_TEXT';
  else if (actions.length && actions.every(function (action) { return action === 'AUDIT_FALSE_POSITIVE'; })) selectedAction = 'AUDIT_FALSE_POSITIVE';
  else if (actions.indexOf('KEEP') !== -1) selectedAction = 'KEEP';

  const primary = findAction(selectedAction);
  const targetSource = primary.length ? primary : list;
  const targets = [];
  const reasons = [];
  targetSource.forEach(function (issue) {
    if (issue.suggestedTarget && targets.indexOf(issue.suggestedTarget) === -1) targets.push(issue.suggestedTarget);
    if (issue.suggestedReason && reasons.indexOf(issue.suggestedReason) === -1) reasons.push(issue.suggestedReason);
  });

  return {
    action: selectedAction,
    target: targets.join(' / '),
    reason: reasons.join('；') || '同一 row 含多個 Audit signal，需以 row 為單位人工確認。'
  };
}

/**
 * Audit signature 僅用來判斷瀏覽器 local review state 是否仍對應同一批 issue。
 * 不作安全雜湊用途。
 */
function getV3CorrectionReviewSignature_(issues) {
  const source = (issues || []).map(function (issue) {
    return [issue.id || '', issue.suggestedAction || '', issue.en || ''].join('~');
  }).sort().join('|');
  let hash = 2166136261;
  for (let i = 0; i < source.length; i += 1) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return 'audit-v1-' + (hash >>> 0).toString(16) + '-' + (issues || []).length;
}

/**
 * V3.8-5b Correction Review Workspace endpoint。
 * 仍只讀 Sheet；review 決策由前端 localStorage 保存，不會由此函式寫回。
 */
function getV3CorrectionReviewWorkspace() {
  const audit = getV3DataQualityAudit({ full: true });
  return {
    appVersion: audit.appVersion,
    sheetName: audit.sheetName,
    auditedAt: audit.auditedAt,
    auditSignature: audit.auditSignature,
    totalRows: audit.totalRows,
    totalIssueCount: audit.totalIssueCount,
    uniqueReviewRowCount: audit.correctionReviewRowCount,
    suggestedActionCounts: audit.correctionReviewSuggestedActionCounts,
    correctionActions: audit.correctionActions,
    reviewStatuses: ['PENDING', 'APPROVED', 'REJECTED', 'NEEDS_REVIEW'],
    reviewRows: audit.correctionReviewRows,
    readOnlySheet: true
  };
}


/**
 * 平衡隨機：
 * 先抽中類，再從該中類抽元素，避免資料量大的中類壟斷機率。
 */
function randomizeV3(params) {
  params = params || {};
  const mode = normalizeMode_(params.mode);
  const density = normalizeDensity_(params.density);
  const plan = getRandomPlan_(mode, density);
  const lockedKeys = Array.isArray(params.lockedKeys)
    ? params.lockedKeys.map(clean_).filter(Boolean)
    : [];
  const lockedSet = {};
  lockedKeys.forEach(function (key) { lockedSet[key] = true; });

  const allRows = readV3Rows_().filter(function (row) {
    return isElementRow_(row) && V3_ROLE_META[row.role];
  });
  const rows = allRows.filter(function (row) {
    return isModeCompatible_(row.type, mode);
  });

  // 鎖定元素始終保留；密度只決定未鎖定的自動補抽。
  const result = allRows
    .filter(function (row) { return !!lockedSet[makeItemKey_(row)]; })
    .map(toClientItem_);

  function countRole_(role) {
    return result.filter(function (item) { return item.role === role; }).length;
  }

  function fillRole_(role, targetCount) {
    const needed = Math.max(0, targetCount - countRole_(role));
    if (!needed) return;
    addRandomForRole_(
      result,
      rows,
      role,
      needed,
      result.map(function (item) { return item.key; })
    );
  }

  Object.keys(plan.required).forEach(function (role) {
    fillRole_(role, plan.required[role]);
  });

  Object.keys(plan.optional).forEach(function (role) {
    if (countRole_(role) === 0 && Math.random() < plan.optional[role]) {
      fillRole_(role, 1);
    }
  });

  if (
    plan.motionExtraChance > 0 &&
    countRole_('motion') > 0 &&
    Math.random() < plan.motionExtraChance
  ) {
    fillRole_('motion', 2);
  }

  let technicalTarget = Math.max(plan.technicalMin, countRole_('technical'));

  if (
    technicalTarget === 0 &&
    Math.random() < plan.technicalChance
  ) {
    technicalTarget = 1;
  }

  if (
    technicalTarget > 0 &&
    plan.technicalExtraChance > 0 &&
    Math.random() < plan.technicalExtraChance
  ) {
    technicalTarget = Math.max(technicalTarget, 2);
  }

  technicalTarget = Math.min(plan.technicalMax, technicalTarget);
  fillRole_('technical', technicalTarget);

  return result;
}


/**
 * 只換某個 role。
 */
function rerollRoleV3(params) {
  params = params || {};
  const role = clean_(params.role);
  const mode = normalizeMode_(params.mode);
  const currentKeys = Array.isArray(params.currentKeys) ? params.currentKeys.map(clean_).filter(Boolean) : [];
  const lockedKeys = Array.isArray(params.lockedKeys) ? params.lockedKeys.map(clean_).filter(Boolean) : [];
  if (!V3_ROLE_META[role]) throw new Error('無效的 role：' + role);

  const allRows = readV3Rows_().filter(function (row) { return isElementRow_(row) && row.role === role; });
  const eligibleRows = allRows.filter(function (row) { return isModeCompatible_(row.type, mode); });
  const lockedSet = {};
  lockedKeys.forEach(function (key) { lockedSet[key] = true; });
  const result = allRows.filter(function (row) { return !!lockedSet[makeItemKey_(row)]; }).map(toClientItem_);
  const targetCount = Math.max(1, currentKeys.length, result.length);
  const needed = Math.max(0, targetCount - result.length);
  if (!needed) return result;

  const excludeKeys = currentKeys.concat(result.map(function (item) { return item.key; }));
  pickBalancedItems_(eligibleRows, needed, excludeKeys).forEach(function (item) { result.push(item); });
  return result;
}


/**
 * 一次重新抽所有「技術型」角色，保留主體、動作、場景。
 */
function rerollTechnicalV3(params) {
  params = params || {};
  const mode = normalizeMode_(params.mode);
  const density = normalizeDensity_(params.density);
  const plan = getRandomPlan_(mode, density);
  const lockedKeys = Array.isArray(params.lockedKeys)
    ? params.lockedKeys.map(clean_).filter(Boolean)
    : [];
  const lockedSet = {};
  lockedKeys.forEach(function (key) { lockedSet[key] = true; });

  const technicalRoles = {
    composition: true,
    camera: true,
    lighting: true,
    material: true,
    color: true,
    motion: true,
    technical: true
  };

  const allRows = readV3Rows_().filter(function (row) {
    return isElementRow_(row) && V3_ROLE_META[row.role];
  });
  const rows = allRows.filter(function (row) {
    return isModeCompatible_(row.type, mode);
  });
  const result = allRows
    .filter(function (row) {
      return technicalRoles[row.role] && !!lockedSet[makeItemKey_(row)];
    })
    .map(toClientItem_);

  function countRole_(role) {
    return result.filter(function (item) { return item.role === role; }).length;
  }

  function fillRole_(role, targetCount) {
    const needed = Math.max(0, targetCount - countRole_(role));
    if (!needed) return;
    addRandomForRole_(
      result,
      rows,
      role,
      needed,
      result.map(function (item) { return item.key; })
    );
  }

  Object.keys(plan.required).forEach(function (role) {
    if (technicalRoles[role]) fillRole_(role, plan.required[role]);
  });

  Object.keys(plan.optional).forEach(function (role) {
    if (
      technicalRoles[role] &&
      countRole_(role) === 0 &&
      Math.random() < plan.optional[role]
    ) {
      fillRole_(role, 1);
    }
  });

  if (
    plan.motionExtraChance > 0 &&
    countRole_('motion') > 0 &&
    Math.random() < plan.motionExtraChance
  ) {
    fillRole_('motion', 2);
  }

  let technicalTarget = Math.max(plan.technicalMin, countRole_('technical'));
  if (technicalTarget === 0 && Math.random() < plan.technicalChance) {
    technicalTarget = 1;
  }
  if (
    technicalTarget > 0 &&
    plan.technicalExtraChance > 0 &&
    Math.random() < plan.technicalExtraChance
  ) {
    technicalTarget = Math.max(technicalTarget, 2);
  }

  technicalTarget = Math.min(plan.technicalMax, technicalTarget);
  fillRole_('technical', technicalTarget);

  return result;
}


/**
 * Apps Script 編輯器可手動執行，用來確認 Elements_v3_2 是否讀得到。
 */
function testV3Data() {
  const manifest = getV3Manifest();

  Logger.log('V3 分頁：' + manifest.sheetName);
  Logger.log('Elements 筆數：' + manifest.total);

  manifest.groups.forEach(function (group) {
    Logger.log(
      group.name + '：' +
      group.roles.map(function (role) {
        return role.label + '(' + role.count + ')';
      }).join('、')
    );
  });

  return manifest;
}



/** V3.3-5 可選測試：不修改資料。 */
function testV335SearchAliases() {
  ['貓咪', '夕陽', '近拍', '白色貓咪', 'morning light'].forEach(function (term) {
    const info = expandSearchQuery_(term);
    Logger.log(term + ' → ' + info.terms.slice(0, 12).join(' / '));
  });
}

/** V3.4-3 可選測試：確認圖片／影片策略已分流，不修改資料。 */
function testV343ModeProfiles() {
  Object.keys(V3_MODE_PROFILES).forEach(function (mode) {
    const profile = V3_MODE_PROFILES[mode];
    Logger.log('模式：' + mode);
    Logger.log('說明：' + profile.summary);
    Logger.log('必補：' + Object.keys(profile.randomRequired).map(function (role) { return role + '×' + profile.randomRequired[role]; }).join('、'));
    Logger.log('選配：' + Object.keys(profile.randomOptional).map(function (role) { return role + ' ' + Math.round(profile.randomOptional[role] * 100) + '%'; }).join('、'));
  });
}


/** V3.4-4 可選測試：確認 2 種模式 × 3 種密度的抽選計畫。 */
function testV344DensityProfiles() {
  ['圖片', '影片'].forEach(function (mode) {
    ['簡潔', '標準', '豐富'].forEach(function (density) {
      const plan = getRandomPlan_(mode, density);
      Logger.log('模式／密度：' + mode + '／' + density);
      Logger.log(
        '必補：' +
        (Object.keys(plan.required).length
          ? Object.keys(plan.required).map(function (role) {
              return role + '×' + plan.required[role];
            }).join('、')
          : '無')
      );
      Logger.log(
        '選配：' +
        (Object.keys(plan.optional).length
          ? Object.keys(plan.optional).map(function (role) {
              return role + ' ' + Math.round(plan.optional[role] * 100) + '%';
            }).join('、')
          : '無')
      );
      Logger.log(
        'technical：min ' + plan.technicalMin +
        ' / chance ' + Math.round(plan.technicalChance * 100) + '%' +
        ' / max ' + plan.technicalMax
      );
    });
  });
}


/**
 * V3.5-1 可選測試：確認圖片／影片 × 簡潔／標準／豐富
 * 的 Negative / Avoid 清單均已載入。
 * 不修改任何資料。
 */
function testV351NegativeProfiles() {
  ['圖片', '影片'].forEach(function (mode) {
    ['簡潔', '標準', '豐富'].forEach(function (density) {
      const profile = V3_NEGATIVE_PROFILES[mode];
      const items = profile && Array.isArray(profile[density])
        ? profile[density]
        : [];

      Logger.log('模式／密度：' + mode + '／' + density);
      Logger.log('Avoid 數量：' + items.length);
      Logger.log('Avoid：' + (items.length ? items.join(' / ') : '無'));
    });
  });

  Logger.log(
    '防拼貼附加：' +
    (V3_NEGATIVE_PROFILES.圖片.antiCollage || []).join(' / ')
  );
}


/**
 * V3.5-2 可選測試：確認元素重要度設定已載入。
 * 只讀取程式常數，不修改試算表。
 */
function testV352ImportanceProfiles() {
  ['core', 'support', 'subtle'].forEach(function (key) {
    const profile = V3_IMPORTANCE_PROFILES[key];
    Logger.log(
      key + ' → ' +
      profile.label + ' / ' +
      profile.shortLabel + ' / order ' +
      profile.order + ' / ' +
      profile.summary
    );
  });

  Logger.log('預設重要度：support（輔助）');
  Logger.log('重要度只影響 Positive Prompt；Negative / Avoid 保持獨立。');
}


/**
 * V3.5-3 可選測試：確認 Recipe schema / App version。
 * Recipe 本身保存在瀏覽器 localStorage，本測試不修改試算表。
 */
function testV353RecipeConfig() {
  Logger.log('App version：' + V3_APP_VERSION);
  Logger.log('Recipe schema：' + V3_RECIPE_SCHEMA_VERSION);
  Logger.log('Recipe data source：' + V3_SHEET_NAME);
  Logger.log('保存欄位：mode / density / styleId(optional) / ratio / antiCollage / selected / lockedKeys / importance');
  Logger.log('Recipe 儲存位置：瀏覽器 localStorage（不寫回 Elements_v3_2）');
}


/**
 * V3.5-4 可選測試：確認 Recipe JSON 匯出／匯入格式設定。
 * 不修改試算表，也不存取瀏覽器 localStorage。
 */
function testV354RecipeTransferConfig() {
  Logger.log('App version：' + V3_APP_VERSION);
  Logger.log('Recipe schema：' + V3_RECIPE_SCHEMA_VERSION);
  Logger.log('Backup format：' + V3_RECIPE_EXPORT_FORMAT);
  Logger.log('Backup version：' + V3_RECIPE_BACKUP_VERSION);
  Logger.log('匯出內容：format / backupVersion / appVersion / recipeSchemaVersion / dataSource / exportedAt / recipes');
  Logger.log('匯入策略：merge；同 ID 取較新 updatedAt；同名不同 ID 自動改名；上限仍為前端 40 份');
}


/**
 * V3.5-5 可選測試：確認 Recipe 管理層設定。
 * 搜尋／排序／複製／重新命名／分類／標籤皆為前端 localStorage 功能。
 */
function testV355RecipeManagerConfig() {
  Logger.log('App version：' + V3_APP_VERSION);
  Logger.log('Recipe schema：' + V3_RECIPE_SCHEMA_VERSION + '（維持向後相容）');
  Logger.log('Recipe 管理：搜尋 / 排序 / 複製 / 重新命名 / 分類 / 標籤');
  Logger.log('Recipe metadata：category / tags（舊 Recipe 缺少時自動補空值）');
  Logger.log('行動 UI：到頂部 / 到底部');
  Logger.log('Prompt 核心：不修改');
}

/**
 * V3.6-1 可選測試：確認前端模組化重整版本設定。
 * 本版只整理 Index.html 的 JavaScript 區塊，不修改資料、Prompt 或 Recipe schema。
 */
function testV361FrontendModules() {
  Logger.log('App version：' + V3_APP_VERSION);
  Logger.log('Frontend modules：App State / Manifest & Data / Selection / Random & Reroll / Search / Favorites & Recent / Prompt Builder / Conflict Resolver / Recipe Manager / JSON Transfer / Mobile UI / Utilities');
  Logger.log('Recipe schema：' + V3_RECIPE_SCHEMA_VERSION + '（不修改）');
  Logger.log('Backup version：' + V3_RECIPE_BACKUP_VERSION + '（不修改）');
  Logger.log('Data source：' + V3_SHEET_NAME + '（不修改）');
  Logger.log('Prompt 核心：不修改');
}

/**
 * V3.6-2 可選測試：確認 Frontend Diagnostics 設計邊界。
 * 真正的前端健檢在瀏覽器執行；本測試只確認版本與不變條件。
 */
function testV362FrontendDiagnosticsConfig() {
  Logger.log('App version：' + V3_APP_VERSION);
  Logger.log('Frontend Diagnostics：Manifest / Role / Mode / Density / DOM / localStorage / Selected / Lock / Importance / Recipe');
  Logger.log('Diagnostics mode：read-only（只讀，不自動修改資料）');
  Logger.log('Recipe schema：' + V3_RECIPE_SCHEMA_VERSION + '（不修改）');
  Logger.log('Backup version：' + V3_RECIPE_BACKUP_VERSION + '（不修改）');
  Logger.log('Data source：' + V3_SHEET_NAME + '（不修改）');
  Logger.log('Prompt 核心：不修改');
}


/**
 * V3.7-1a 可選測試：確認 Prompt Health 校正版設計邊界。
 * 只修 Prompt Health，不修改 Prompt Builder / Sheet / Recipe。
 */
function testV371aPromptHealthCalibration() {
  Logger.log('App version：' + V3_APP_VERSION);
  Logger.log('Prompt Health scoring：必要結構 / 品質增強 / 情境加分');
  Logger.log('Completeness fallback：優先讀 score；必要時由 completeness results 重新計算');
  Logger.log('Health mode：read-only（只評估，不自動修改 Prompt 或 selected）');
  Logger.log('Recipe schema：' + V3_RECIPE_SCHEMA_VERSION + '（不修改）');
  Logger.log('Backup version：' + V3_RECIPE_BACKUP_VERSION + '（不修改）');
  Logger.log('Data source：' + V3_SHEET_NAME + '（不修改）');
  Logger.log('Prompt Builder：不修改');
}


/**
 * V3.7-2 可選測試：確認 Prompt 重複／冗餘偵測設計邊界。
 * 真正偵測在瀏覽器端執行；本測試只確認版本與不變條件。
 */
function testV372PromptRedundancyConfig() {
  Logger.log('App version：' + V3_APP_VERSION);
  Logger.log('Prompt Redundancy：完全重複 / 受控近義群 / 同 Role 詞組包含');
  Logger.log('Detection mode：read-only（只提示，不自動刪除或改寫 selected / Prompt）');
  Logger.log('Detection scope：模式分流與衝突處理後、Prompt Builder 組句前的元素');
  Logger.log('Health impact：輕度扣分，上限 12 分');
  Logger.log('Recipe schema：' + V3_RECIPE_SCHEMA_VERSION + '（不修改）');
  Logger.log('Backup version：' + V3_RECIPE_BACKUP_VERSION + '（不修改）');
  Logger.log('Data source：' + V3_SHEET_NAME + '（不修改）');
  Logger.log('Prompt Builder：不修改');
}


/**
 * V3.7-2a 可選測試：確認 Final Prompt Redundancy Scan 設計邊界。
 * 真正掃描在瀏覽器端執行；本測試只確認版本與不變條件。
 */
function testV372aFinalPromptRedundancyConfig() {
  Logger.log('App version：' + V3_APP_VERSION);
  Logger.log('Redundancy layers：Element Redundancy + Final Positive Prompt Scan');
  Logger.log('Final scan：焦點/層級、光線一致性、透視一致性、完全重複句、coherent/consistent/unified 密度');
  Logger.log('Scan target：Positive Prompt only（不掃 Negative / Avoid）');
  Logger.log('Detection mode：read-only（只提示，不自動刪除或改寫 selected / Prompt）');
  Logger.log('Health impact：Element + Final 合併後總扣分上限 12 分');
  Logger.log('Recipe schema：' + V3_RECIPE_SCHEMA_VERSION + '（不修改）');
  Logger.log('Backup version：' + V3_RECIPE_BACKUP_VERSION + '（不修改）');
  Logger.log('Data source：' + V3_SHEET_NAME + '（不修改）');
  Logger.log('Prompt Builder：不修改');
}


/**
 * V3.7-2b 可選測試：確認 Perspective Regex 校正＋Safe Prompt Repair 設計邊界。
 * 真正的 Final Prompt 掃描與修正都在瀏覽器端執行。
 */
function testV372bSafePromptRepairConfig() {
  Logger.log('App version：' + V3_APP_VERSION);
  Logger.log('Perspective regex：只接受直接修飾 perspective；不跨逗號抓 consistent lighting direction');
  Logger.log('Safe Prompt Repair：修正預覽 / 單項修正 / 全部安全修正 / 還原原始 Prompt');
  Logger.log('Repair scope：Final Positive Prompt only；只處理高信心可逆修正');
  Logger.log('Manual-only：coherent / consistent / unified 密度提醒不自動修正');
  Logger.log('Selected / Lock / Importance：不修改');
  Logger.log('Recipe schema：' + V3_RECIPE_SCHEMA_VERSION + '（不修改）');
  Logger.log('Backup version：' + V3_RECIPE_BACKUP_VERSION + '（不修改）');
  Logger.log('Data source：' + V3_SHEET_NAME + '（不修改）');
  Logger.log('Prompt Builder：不修改');
}


/**
 * V3.8-1：Style Layer／圖片風格選擇器設定檢查。
 */
function testV381StyleLayerConfig() {
  Logger.log('App version：' + V3_APP_VERSION);
  Logger.log('Style Layer：圖片模式專用；影片模式不注入 Style');
  Logger.log('Default：無指定 → 維持原本 visually coherent still image');
  Logger.log('Injection point：Image Prompt Builder 後、Importance Directives 前');
  Logger.log('Catalog：分類式 Style selector；含使用者舊版常用 Style');
  Logger.log('Recipe：optional styleId，舊 Recipe 無 styleId → 無指定');
  Logger.log('Recipe schema：' + V3_RECIPE_SCHEMA_VERSION + '（不升版）');
  Logger.log('Backup version：' + V3_RECIPE_BACKUP_VERSION + '（不修改）');
  Logger.log('Data source：' + V3_SHEET_NAME + '（不修改）');
  Logger.log('Prompt Health / Safe Repair：保留');
  Logger.log('Prompt Builder core：不修改');
}


/**
 * V3.8-2：Stability / Regression Patch 設定檢查。
 * 真正的 Mode 同步、Prompt session invalidation、Diagnostics 與 smoke test 在前端執行。
 */
function testV382StabilityRegressionConfig() {
  Logger.log('App version：' + V3_APP_VERSION);
  Logger.log('Patch：移除重複 Cloudflare beacon / Mode 切換同步 Prompt / Prompt Repair Session invalidation');
  Logger.log('Diagnostics：加入 Style / Prompt Health / Redundancy / Safe Repair DOM 與狀態檢查');
  Logger.log('Regression：保留 V3.3～V3.8-1 既有能力；新增 V3.8-2 smoke checklist');
  Logger.log('Recipe：styleId 維持 optional；schema ' + V3_RECIPE_SCHEMA_VERSION + '（不升版）');
  Logger.log('Backup version：' + V3_RECIPE_BACKUP_VERSION + '（不修改）');
  Logger.log('Data source：' + V3_SHEET_NAME + '（不修改）');
  Logger.log('Prompt Builder core：不修改');
}

/**
 * V3.8-3 可選測試：確認 healingGuard（療癒感防護）與 Iyashikei Style 設定邊界。
 * 真正的 Negative Prompt 組句與 Style Layer 注入在前端執行。
 */
function testV383HealingGuardConfig() {
  Logger.log('App version：' + V3_APP_VERSION);
  Logger.log('healingGuard：獨立於 簡潔/標準/豐富，只在使用者主動開啟時才追加');
  Logger.log('圖片 healingGuard 項目數：' + V3_NEGATIVE_PROFILES.圖片.healingGuard.length);
  Logger.log('影片 healingGuard 項目數：' + V3_NEGATIVE_PROFILES.影片.healingGuard.length);
  Logger.log('Style Layer：前端新增 iyashikei（Iyashikei / Healing Illustration Style），僅圖片模式');
  Logger.log('Recipe schema：' + V3_RECIPE_SCHEMA_VERSION + '（不升版，healingGuard 為 optional boolean）');
  Logger.log('Backup version：' + V3_RECIPE_BACKUP_VERSION + '（不修改）');
  Logger.log('Data source：' + V3_SHEET_NAME + '（不修改）');
  Logger.log('Prompt Builder core：不修改');
}

/**
 * V3.8-4 可選測試：確認 Style／Mood 雙圖層設定邊界。
 * 真正的 IMAGE_MOOD_CATALOG、Mood selector 與 applyImageStyleLayer 疊加邏輯都在前端執行；
 * 這裡只確認 .gs 端沒有因此變動的部分維持不變。
 */
function testV384StyleMoodLayerConfig() {
  Logger.log('App version：' + V3_APP_VERSION);
  Logger.log('Style（畫風／媒材）：單選，前端 IMAGE_STYLE_CATALOG，不含 iyashikei');
  Logger.log('Mood（氛圍）：單選但與 Style 完全獨立，前端新增 IMAGE_MOOD_CATALOG，目前只有 iyashikei');
  Logger.log('疊加規則：Style 換句首 lead + 附加 Style direction；Mood 只在句尾補 Mood direction；兩者互不覆蓋');
  Logger.log('生效範圍：僅圖片模式；影片模式兩者皆停用且不注入 Prompt');
  Logger.log('Recipe：新增 optional moodId，缺少時回到無指定；schema ' + V3_RECIPE_SCHEMA_VERSION + '（不升版）');
  Logger.log('Backup version：' + V3_RECIPE_BACKUP_VERSION + '（不修改）');
  Logger.log('Data source：' + V3_SHEET_NAME + '（不修改，Mood 不寫回 Elements_v3_2）');
  Logger.log('Negative Prompt／healingGuard：不受本次變動影響');
  Logger.log('Prompt Builder core：不修改');
}


/**
 * V3.8-4 Prompt Quality Hotfix：合併 V3.8-2a 的品質修正到 V3.8-4。
 * 真正的 palette suffix normalization、Positive polarity guard 與 Final QA 在前端執行。
 */
function testV384PromptQualityHotfixConfig() {
  Logger.log('App version：' + V3_APP_VERSION);
  Logger.log('Color normalization：避免既有 color phrase 自帶 palette 時產生 palette palette');
  Logger.log('Positive polarity guard：明確 Avoid 型 technical phrase 不注入 Positive Prompt，但不刪 selected / Recipe / Sheet');
  Logger.log('Final Positive QA：新增相鄰重複英文單字提示，例如 palette palette');
  Logger.log('Prompt Health：顯示 Positive 語意／語意阻擋狀態；維持只讀診斷');
  Logger.log('V3.8-4 features：healingGuard / Style / Mood 均保留');
  Logger.log('Recipe schema：' + V3_RECIPE_SCHEMA_VERSION + '（不修改）');
  Logger.log('Backup version：' + V3_RECIPE_BACKUP_VERSION + '（不修改）');
  Logger.log('Data source：' + V3_SHEET_NAME + '（不修改）');
  Logger.log('Prompt Builder core：不重寫，只加 rendering guard / normalization');
}


/**
 * V3.8-4a Prompt Safety & Phrase Routing Hotfix：設定邊界檢查。
 * 真正的 Positive polarity guard 與 Color / Mood phrase routing 在前端執行。
 */
function testV384aPromptSafetyPhraseRoutingConfig() {
  Logger.log('App version：' + V3_APP_VERSION);
  Logger.log('Positive polarity guard：擴充明確 gore / violent content 等 Avoid 型 technical phrase；只阻擋 Positive rendering');
  Logger.log('Phrase routing：color role 中的 atmosphere / mood 類片語不再強制包成 palette');
  Logger.log('Regression target：避免 gore and violent content 進 Positive；避免 a controlled a warm, cosy atmosphere palette');
  Logger.log('Selected / Recipe / Sheet：不刪除、不重分類、不改寫');
  Logger.log('V3.8-4 features：healingGuard / Style / Mood 均保留');
  Logger.log('Recipe schema：' + V3_RECIPE_SCHEMA_VERSION + '（不修改）');
  Logger.log('Backup version：' + V3_RECIPE_BACKUP_VERSION + '（不修改）');
  Logger.log('Data source：' + V3_SHEET_NAME + '（不修改）');
  Logger.log('Prompt Builder core：不重寫，只加受控 guard / phrase routing');
}


/**
 * V3.8-5a Positive Quality Guard Hotfix：設定邊界檢查。
 * 真正的 phrase guard、Final Positive semantic QA 與 conflict self-match 修正在前端執行。
 */
function testV384bPositiveQualityGuardConfig() {
  Logger.log('App version：' + V3_APP_VERSION);
  Logger.log('Positive quality guard：擴充 visual noise / coarse grain / excessive noise / muddy textures / oversharpening artifacts 等明確品質缺陷片語');
  Logger.log('Shared semantic rules：Positive rendering guard 與 Final Positive QA 共用同一套 matcher，避免 Health 假陰性');
  Logger.log('Residual QA：若最終 Positive 仍殘留受控 Avoid 語意，Prompt Health 顯示 FAIL 並扣分');
  Logger.log('Conflict resolver：單一元素跨 bucket self-match 不視為真正衝突，避免採用／忽略同值');
  Logger.log('Selected / Recipe / Sheet：不刪除、不重分類、不改寫');
  Logger.log('V3.8-4 features：healingGuard / Style / Mood 均保留');
  Logger.log('Recipe schema：' + V3_RECIPE_SCHEMA_VERSION + '（不修改）');
  Logger.log('Backup version：' + V3_RECIPE_BACKUP_VERSION + '（不修改）');
  Logger.log('Data source：' + V3_SHEET_NAME + '（不修改）');
  Logger.log('Prompt Builder core：不重寫，只擴充受控 guard / QA / conflict validation');
}


/**
 * V3.8-5a Cross-Polarity Consistency Guard：設定邊界檢查。
 * 真正的 rendering guard、Final Positive semantic QA 與 Positive↔Negative cross-check 在前端執行。
 */
function testV384cCrossPolarityConsistencyConfig() {
  Logger.log('App version：' + V3_APP_VERSION);
  Logger.log('Positive quality guard：新增 harsh high-contrast visuals / excessive filters and post-processing 等明確品質缺陷片語');
  Logger.log('Cross-Polarity Guard：Final Positive 與實際 Negative / Avoid 以受控概念交叉檢查；只讀、不自動改寫');
  Logger.log('Health：Cross-Polarity 衝突每組扣 12 分（上限 24），單一明確衝突不得維持「優秀」');
  Logger.log('Diagnostics fixture：固定 high-contrast Positive ↔ harsh contrast Avoid 案例，不要求使用者重現相同 Prompt');
  Logger.log('Conflict resolver：保留 V3.8-4b self-match 排除');
  Logger.log('Selected / Recipe / Sheet：不刪除、不重分類、不改寫');
  Logger.log('V3.8-4 features：healingGuard / Style / Mood 均保留');
  Logger.log('Recipe schema：' + V3_RECIPE_SCHEMA_VERSION + '（不修改）');
  Logger.log('Backup version：' + V3_RECIPE_BACKUP_VERSION + '（不修改）');
  Logger.log('Data source：' + V3_SHEET_NAME + '（不修改）');
  Logger.log('Prompt Builder core：不重寫，只擴充受控 guard / cross-polarity QA');
}



/**
 * V3.8-5a Data Quality Audit：設定邊界檢查。
 * 真正的 13,799 筆掃描由 getV3DataQualityAudit() 執行；本測試不修改 Sheet。
 */
function testV385DataQualityAuditConfig() {
  Logger.log('App version：' + V3_APP_VERSION);
  Logger.log('Data Quality Audit：只讀掃描 Elements_v3_2；不寫回、不重分類、不刪除資料');
  Logger.log('Audit scope：Positive/Avoid 極性、technical 語意、Color/Mood 錯置、palette suffix、前置冠詞、同 Role 英文重複、單列 conflict alias');
  Logger.log('Audit result：回傳 Sheet row number / severity / issue type / role / 中英文字 / suggestion');
  Logger.log('Technical classification：avoid-defect / manual-review / positive-quality-candidate');
  Logger.log('Frontend：獨立 Data Quality Audit 面板；與 Prompt Health / Frontend Diagnostics 分離');
  Logger.log('Recipe schema：' + V3_RECIPE_SCHEMA_VERSION + '（不修改）');
  Logger.log('Backup version：' + V3_RECIPE_BACKUP_VERSION + '（不修改）');
  Logger.log('Data source：' + V3_SHEET_NAME + '（只讀，不修改）');
  Logger.log('Prompt Builder core：不修改');
}


/**
 * V3.8-5a Runtime Data Quality Audit smoke。
 * 會真的讀取 Elements_v3_2 並掃描，但完全不寫回 Sheet。
 */
function testV385DataQualityAudit() {
  const result = getV3DataQualityAudit({ limit: 80 });
  const severity = result.severityCounts || {};
  const technical = result.technicalSemanticCounts || {};

  Logger.log('App version：' + result.appVersion);
  Logger.log('Data source：' + result.sheetName);
  Logger.log('Audited rows：' + result.totalRows);
  Logger.log('Audit issues：' + result.totalIssueCount + '（High ' + (severity.high || 0) + ' / Medium ' + (severity.medium || 0) + ' / Low ' + (severity.low || 0) + '）');
  Logger.log('Technical semantic：avoid-defect ' + (technical['avoid-defect'] || 0) + ' / manual-review ' + (technical['manual-review'] || 0) + ' / positive-quality-candidate ' + (technical['positive-quality-candidate'] || 0));
  Logger.log('Issues returned：' + result.returnedIssueCount + (result.truncated ? '（明細已截斷；統計仍為完整掃描）' : ''));

  (result.issues || []).slice(0, 30).forEach(function (issue, index) {
    Logger.log(
      '#' + (index + 1) +
      ' [' + String(issue.severity || '').toUpperCase() + ']' +
      ' row ' + issue.rowNumber +
      ' · ' + issue.roleLabel +
      ' · ' + issue.type +
      ' · ' + (issue.ch || '') +
      ' / ' + (issue.en || '')
    );
  });

  return result;
}


/**
 * V3.8-5a Data Correction Plan + 完整 Audit 匯出設定檢查。
 */
function testV385aDataCorrectionPlanConfig() {
  Logger.log('App version：' + V3_APP_VERSION);
  Logger.log('Full Audit export：getV3DataQualityAudit({ full: true }) 回傳完整 issue 明細，不受 UI 顯示 limit 截斷');
  Logger.log('Export formats：Frontend 提供完整 Audit JSON / Audit CSV / Correction Plan CSV');
  Logger.log('Correction actions：KEEP / FIX_TEXT / MOVE_ROLE / AVOID_ONLY / AUDIT_FALSE_POSITIVE / REVIEW');
  Logger.log('Correction Plan：suggestedAction 只是建議；reviewStatus 預設 REVIEW，不代表已修改資料');
  Logger.log('Known review examples：technical 明確缺陷→AVOID_ONLY；corpse flower→AUDIT_FALSE_POSITIVE；純 atmosphere Color→MOVE_ROLE');
  Logger.log('Sheet write：NONE（只讀；不建立、不更新、不刪除 Elements_v3_2）');
  Logger.log('Recipe schema：' + V3_RECIPE_SCHEMA_VERSION + '（不修改）');
  Logger.log('Backup version：' + V3_RECIPE_BACKUP_VERSION + '（不修改）');
  Logger.log('Data source：' + V3_SHEET_NAME + '（只讀，不修改）');
}

/**
 * V3.8-5a Runtime smoke：掃完整 Audit 並驗證 Correction Plan metadata。
 * 不寫回 Sheet。
 */
function testV385aDataCorrectionPlan() {
  const result = getV3DataQualityAudit({ full: true });
  const actions = result.correctionActionCounts || {};

  Logger.log('App version：' + result.appVersion);
  Logger.log('Audited rows：' + result.totalRows);
  Logger.log('Full issues：' + result.returnedIssueCount + ' / ' + result.totalIssueCount + ' · exportComplete=' + result.exportComplete);
  Logger.log('Correction actions：KEEP ' + (actions.KEEP || 0) +
    ' / FIX_TEXT ' + (actions.FIX_TEXT || 0) +
    ' / MOVE_ROLE ' + (actions.MOVE_ROLE || 0) +
    ' / AVOID_ONLY ' + (actions.AVOID_ONLY || 0) +
    ' / AUDIT_FALSE_POSITIVE ' + (actions.AUDIT_FALSE_POSITIVE || 0) +
    ' / REVIEW ' + (actions.REVIEW || 0));

  [1475, 11354, 12036, 12044, 12045, 12050, 12051, 12056].forEach(function (rowNumber) {
    const matches = (result.issues || []).filter(function (issue) { return issue.rowNumber === rowNumber; });
    matches.forEach(function (issue) {
      Logger.log('row ' + rowNumber + ' · ' + issue.type + ' → ' + issue.suggestedAction + (issue.suggestedTarget ? ' · ' + issue.suggestedTarget : ''));
    });
  });

  if (!result.exportComplete || result.returnedIssueCount !== result.totalIssueCount) {
    throw new Error('Full Audit export 未回傳完整 issue。');
  }

  return result;
}


/**
 * V3.8-5b Correction Review Workspace：設定邊界檢查。
 */
function testV385bCorrectionReviewWorkspaceConfig() {
  Logger.log('App version：' + V3_APP_VERSION);
  Logger.log('Row-level dedupe：同一 Sheet row 的多個 Audit issue 合併為單一 Review item，issue evidence 全保留');
  Logger.log('Review statuses：PENDING / APPROVED / REJECTED / NEEDS_REVIEW');
  Logger.log('Reviewer decision：KEEP / FIX_TEXT / MOVE_ROLE / AVOID_ONLY / AUDIT_FALSE_POSITIVE / REVIEW');
  Logger.log('Persistence：人工審核狀態只存瀏覽器 localStorage，可匯出；不寫回 Sheet');
  Logger.log('Approval validation：FIX_TEXT 需 proposedEnglish；MOVE_ROLE 需 proposedRole；REVIEW 不可直接核准');
  Logger.log('Exports：Row Review JSON / 全部 Row Review CSV / Approved Plan CSV');
  Logger.log('Sheet write：NONE（Elements_v3_2 只讀）');
  Logger.log('Recipe schema：' + V3_RECIPE_SCHEMA_VERSION + '（不修改）');
  Logger.log('Backup version：' + V3_RECIPE_BACKUP_VERSION + '（不修改）');
  Logger.log('Data source：' + V3_SHEET_NAME + '（只讀，不修改）');
}

/**
 * V3.8-5b Runtime smoke：掃完整 Audit 並驗證 row-level grouping。
 * 只讀，不修改 Elements_v3_2。
 */
function testV385bCorrectionReviewWorkspace() {
  const workspace = getV3CorrectionReviewWorkspace();
  Logger.log('App version：' + workspace.appVersion);
  Logger.log('Audited rows：' + workspace.totalRows);
  Logger.log('Audit issues：' + workspace.totalIssueCount);
  Logger.log('Unique review rows：' + workspace.uniqueReviewRowCount);
  Logger.log('Audit signature：' + workspace.auditSignature);

  const counts = workspace.suggestedActionCounts || {};
  Logger.log('Row suggestions：' + V3_DATA_CORRECTION_ACTIONS.map(function (action) {
    return action + ' ' + (counts[action] || 0);
  }).join(' / '));

  [1475, 11354, 12036].forEach(function (rowNumber) {
    const row = (workspace.reviewRows || []).find(function (item) { return item.rowNumber === rowNumber; });
    if (row) {
      Logger.log('row ' + rowNumber + ' · issues ' + row.issueCount + ' · suggested ' + row.suggestedAction + ' · types ' + row.issueTypes.join(' | '));
    }
  });

  const row11354 = (workspace.reviewRows || []).find(function (item) { return item.rowNumber === 11354; });
  if (row11354 && row11354.issueCount < 2) {
    throw new Error('row 11354 預期至少有兩個 issue，row-level dedupe evidence 不完整。');
  }
  if (row11354 && row11354.suggestedAction !== 'MOVE_ROLE') {
    throw new Error('row 11354 row-level 建議應由 MOVE_ROLE 主導。');
  }
  if (!workspace.readOnlySheet) {
    throw new Error('Correction Review Workspace 必須維持 Sheet read-only。');
  }
  return workspace;
}


/**
 * V3.8-5c Correction Execution Preview
 * 只讀模擬 Approved Plan 套用結果；不寫入 Elements_v3_2。
 */
function previewV3CorrectionExecution(params) {
  params = params || {};
  const workspace = getV3CorrectionReviewWorkspace();
  const suppliedSignature = clean_(params.auditSignature);
  if (!suppliedSignature || suppliedSignature !== workspace.auditSignature) {
    throw new Error('Approved Plan 的 Audit signature 與目前資料不一致；請重新匯出／審核後再 Preview。');
  }

  const approvedRows = Array.isArray(params.approvedRows) ? params.approvedRows : [];
  if (!approvedRows.length) throw new Error('Approved Plan 沒有可預覽的 APPROVED row。');

  const sourceRows = readV3Rows_().filter(function (row) {
    return isElementRow_(row) && !!V3_ROLE_META[row.role];
  });
  const byRow = {};
  sourceRows.forEach(function (row) { byRow[row.rowNumber] = row; });

  const reviewByRow = {};
  (workspace.reviewRows || []).forEach(function (row) { reviewByRow[row.rowNumber] = row; });

  const seenRows = {};
  const previewRows = [];
  const validationErrors = [];

  approvedRows.forEach(function (plan) {
    const rowNumber = Number(plan.rowNumber);
    if (!rowNumber || seenRows[rowNumber]) {
      validationErrors.push('Approved Plan 含無效或重複 row：' + String(plan.rowNumber || ''));
      return;
    }
    seenRows[rowNumber] = true;

    const source = byRow[rowNumber];
    const review = reviewByRow[rowNumber];
    if (!source || !review) {
      validationErrors.push('row ' + rowNumber + ' 已不存在於目前 Audit Workspace。');
      return;
    }

    const decision = clean_(plan.reviewerDecision || plan.decision || plan.suggestedAction).toUpperCase();
    if (V3_DATA_CORRECTION_ACTIONS.indexOf(decision) === -1 || decision === 'REVIEW') {
      validationErrors.push('row ' + rowNumber + ' 的 reviewerDecision 無效：' + decision);
      return;
    }

    const after = {
      rowNumber: source.rowNumber,
      role: source.role,
      roleLabel: V3_ROLE_META[source.role] ? V3_ROLE_META[source.role].label : source.role,
      ch: source.ch,
      en: source.en,
      disposition: 'KEEP',
      positiveEligible: true
    };

    if (decision === 'FIX_TEXT') {
      const proposedEnglish = clean_(plan.proposedEnglish);
      if (!proposedEnglish) {
        validationErrors.push('row ' + rowNumber + '：FIX_TEXT 缺少 proposedEnglish。');
        return;
      }
      after.en = proposedEnglish;
      after.disposition = 'FIX_TEXT';
    } else if (decision === 'MOVE_ROLE') {
      const proposedRole = clean_(plan.proposedRole);
      if (!V3_ROLE_META[proposedRole] || proposedRole === source.role) {
        validationErrors.push('row ' + rowNumber + '：MOVE_ROLE 的 proposedRole 無效或與原 Role 相同。');
        return;
      }
      after.role = proposedRole;
      after.roleLabel = V3_ROLE_META[proposedRole].label;
      if (clean_(plan.proposedEnglish)) after.en = clean_(plan.proposedEnglish);
      after.disposition = 'MOVE_ROLE';
    } else if (decision === 'AVOID_ONLY') {
      after.disposition = 'AVOID_ONLY';
      after.positiveEligible = false;
    } else if (decision === 'AUDIT_FALSE_POSITIVE') {
      after.disposition = 'AUDIT_FALSE_POSITIVE';
    } else {
      after.disposition = 'KEEP';
    }

    if (!clean_(after.en)) {
      validationErrors.push('row ' + rowNumber + '：Preview 後英文不可為空白。');
      return;
    }

    previewRows.push({
      rowNumber: rowNumber,
      reviewerDecision: decision,
      reviewNote: clean_(plan.reviewNote),
      before: {
        role: source.role,
        roleLabel: V3_ROLE_META[source.role] ? V3_ROLE_META[source.role].label : source.role,
        ch: source.ch,
        en: source.en
      },
      after: after,
      changed: source.role !== after.role || source.en !== after.en || after.disposition === 'AVOID_ONLY',
      originalIssueTypes: review.issueTypes || [],
      originalIssueCount: review.issueCount || 0
    });
  });

  // Candidate-level duplicate check: simulate all accepted text/role changes.
  const simulated = sourceRows.map(function (row) {
    return { rowNumber: row.rowNumber, role: row.role, en: row.en, positiveEligible: true };
  });
  const simByRow = {};
  simulated.forEach(function (row) { simByRow[row.rowNumber] = row; });
  previewRows.forEach(function (item) {
    const target = simByRow[item.rowNumber];
    if (!target) return;
    target.role = item.after.role;
    target.en = item.after.en;
    target.positiveEligible = item.after.positiveEligible;
  });

  const duplicateMap = {};
  simulated.forEach(function (row) {
    if (!row.positiveEligible) return;
    const enKey = clean_(row.en).toLowerCase();
    if (!enKey) return;
    const key = row.role + '|' + enKey;
    if (!duplicateMap[key]) duplicateMap[key] = [];
    duplicateMap[key].push(row.rowNumber);
  });
  const duplicateConflicts = Object.keys(duplicateMap).filter(function (key) {
    return duplicateMap[key].length > 1;
  }).map(function (key) {
    const parts = key.split('|');
return { role: parts.shift(), en: parts.join('|'), rows: duplicateMap[key] };
  }).filter(function (dup) {
    return dup.rows.some(function (rowNumber) { return !!seenRows[rowNumber]; });
  });

  duplicateConflicts.forEach(function (dup) {
    validationErrors.push(
      '同 Role 英文重複：' + dup.role + ' / ' + dup.en + ' / rows ' + dup.rows.join(', ')
    );
  });

  const resolvedIssueCount = previewRows.reduce(function (sum, item) {
    if (item.reviewerDecision === 'AUDIT_FALSE_POSITIVE') return sum + item.originalIssueCount;
    if (item.reviewerDecision === 'AVOID_ONLY') return sum + item.originalIssueCount;
    if (item.reviewerDecision === 'FIX_TEXT' || item.reviewerDecision === 'MOVE_ROLE') return sum + item.originalIssueCount;
    return sum;
  }, 0);

  const counts = {};
  previewRows.forEach(function (item) {
    counts[item.reviewerDecision] = (counts[item.reviewerDecision] || 0) + 1;
  });

  return {
    appVersion: V3_APP_VERSION,
    sheetName: V3_SHEET_NAME,
    auditSignature: workspace.auditSignature,
    sourceAuditIssues: workspace.totalIssueCount,
    sourceReviewRows: workspace.uniqueReviewRowCount,
    approvedInputRows: approvedRows.length,
    previewRowCount: previewRows.length,
    changedRowCount: previewRows.filter(function (item) { return item.changed; }).length,
    actionCounts: counts,
    validationErrors: validationErrors,
    validationPass: validationErrors.length === 0,
    duplicateConflicts: duplicateConflicts,
    estimatedResolvedIssueCount: resolvedIssueCount,
    remainingUnreviewedRows: Math.max(0, workspace.uniqueReviewRowCount - previewRows.length),
    previewRows: previewRows,
    readOnlySheet: true,
    candidateWritePerformed: false,
    candidatePlanReady: validationErrors.length === 0
  };
}

/**
 * V3.8-5c 設定邊界檢查。
 */
function testV385cCorrectionExecutionPreviewConfig() {
  Logger.log('App version：' + V3_APP_VERSION);
  Logger.log('Input：V3.8-5b Approved Plan（APPROVED rows）');
  Logger.log('Signature guard：Approved Plan auditSignature 必須等於目前 Audit signature');
  Logger.log('Preview：Before / After diff；FIX_TEXT / MOVE_ROLE / AVOID_ONLY / KEEP / AUDIT_FALSE_POSITIVE');
  Logger.log('Validation：Role 有效、English 非空、row 不重複、同 Role English duplicate');
  Logger.log('Output：Correction Execution Preview + Elements_v3_3 candidate plan；本版不建立 candidate Sheet');
  Logger.log('Sheet write：NONE（Elements_v3_2 只讀）');
  Logger.log('Recipe schema：' + V3_RECIPE_SCHEMA_VERSION + '（不修改）');
  Logger.log('Backup version：' + V3_RECIPE_BACKUP_VERSION + '（不修改）');
  Logger.log('Data source：' + V3_SHEET_NAME + '（只讀，不修改）');
}

/**
 * V3.8-5c Runtime smoke：使用目前 Workspace 建立安全 fixture Preview。
 * 不修改 Sheet。
 */
function testV385cCorrectionExecutionPreview() {
  const workspace = getV3CorrectionReviewWorkspace();
  const candidates = [];
  (workspace.reviewRows || []).slice(0, 20).forEach(function (row) {
    if (row.suggestedAction === 'AVOID_ONLY' || row.suggestedAction === 'AUDIT_FALSE_POSITIVE' || row.suggestedAction === 'KEEP') {
      candidates.push({
        rowNumber: row.rowNumber,
        reviewerDecision: row.suggestedAction,
        reviewNote: 'V3.8-5c runtime fixture'
      });
    }
  });
  if (!candidates.length) throw new Error('找不到可安全建立 Preview fixture 的 row。');

  const result = previewV3CorrectionExecution({
    auditSignature: workspace.auditSignature,
    approvedRows: candidates
  });
  Logger.log('App version：' + result.appVersion);
  Logger.log('Audit signature：' + result.auditSignature);
  Logger.log('Preview rows：' + result.previewRowCount + ' / input ' + result.approvedInputRows);
  Logger.log('Changed rows：' + result.changedRowCount);
  Logger.log('Validation：' + (result.validationPass ? 'PASS' : 'FAIL') + ' · errors ' + result.validationErrors.length);
  Logger.log('Candidate plan ready：' + result.candidatePlanReady);
  Logger.log('Sheet write：' + (result.candidateWritePerformed ? 'YES' : 'NONE'));
  if (!result.validationPass || result.candidateWritePerformed || !result.readOnlySheet) {
    throw new Error('V3.8-5c Correction Execution Preview 安全邊界驗證失敗。');
  }
  return result;
}



const V3_CANDIDATE_SHEET_NAME = 'Elements_v3_3_candidate';

/**
 * V3.8-5d：建立 Elements_v3_3_candidate。
 * 只建立新候選分頁；絕不覆寫 Elements_v3_2，也不覆寫既有 candidate。
 */
function buildV3CandidateSheet(params) {
  params = params || {};

  // 先重跑 5c Preview，所有安全閘門必須仍成立。
  const preview = previewV3CorrectionExecution(params);
  if (!preview.validationPass || !preview.candidatePlanReady || preview.validationErrors.length) {
    throw new Error('Correction Execution Preview 尚未通過，拒絕建立 candidate。');
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('找不到綁定的 Google 試算表。');

  if (V3_CANDIDATE_SHEET_NAME === V3_SHEET_NAME) {
    throw new Error('Candidate sheet name 不可與正式資料源相同。');
  }
  if (ss.getSheetByName(V3_CANDIDATE_SHEET_NAME)) {
    throw new Error(
      '已存在分頁「' + V3_CANDIDATE_SHEET_NAME +
      '」。5d 不允許覆寫；請先人工重新命名／封存舊 candidate 後再建立。'
    );
  }

  const sourceSheet = getV3Sheet_();
  const values = sourceSheet.getDataRange().getDisplayValues();
  if (!values.length) throw new Error('Elements_v3_2 沒有可複製資料。');

  const headers = values[0].map(clean_);
  const index = buildHeaderIndex_(headers);
  ['角色(role)', '元素英文', '建議資料去向'].forEach(function (name) {
    if (index[name] == null) throw new Error('建立 candidate 缺少必要欄位：' + name);
  });

  const previewByRow = {};
  (preview.previewRows || []).forEach(function (item) {
    previewByRow[item.rowNumber] = item;
  });

  const extraHeaders = [
    'V3候選來源列',
    'V3候選審核決策',
    'V3候選PositiveEligible',
    'V3候選AuditSignature',
    'V3候選ReviewNote'
  ];
  const output = [];
  output.push(headers.concat(extraHeaders));

  let changedRows = 0;
  let avoidOnlyRows = 0;
  let fixTextRows = 0;
  let moveRoleRows = 0;

  values.slice(1).forEach(function (sourceRow, i) {
    const rowNumber = i + 2;
    const row = sourceRow.slice();
    const previewItem = previewByRow[rowNumber];

    let decision = '';
    let positiveEligible = 'TRUE';
    let note = '';

    if (previewItem) {
      decision = previewItem.reviewerDecision;
      note = clean_(previewItem.reviewNote);

      if (decision === 'FIX_TEXT') {
        row[index['元素英文']] = previewItem.after.en;
        fixTextRows++;
        changedRows++;
      } else if (decision === 'MOVE_ROLE') {
        row[index['角色(role)']] = previewItem.after.role;
        if (previewItem.after.en !== previewItem.before.en) {
          row[index['元素英文']] = previewItem.after.en;
        }
        moveRoleRows++;
        changedRows++;
      } else if (decision === 'AVOID_ONLY') {
        row[index['建議資料去向']] = 'Negative / Avoid';
        positiveEligible = 'FALSE';
        avoidOnlyRows++;
        changedRows++;
      }
      // KEEP / AUDIT_FALSE_POSITIVE 不修改正式內容，只留 metadata。
    }

    output.push(row.concat([
      String(rowNumber),
      decision,
      positiveEligible,
      preview.auditSignature,
      note
    ]));
  });

  const candidate = ss.insertSheet(V3_CANDIDATE_SHEET_NAME);
  try {
    candidate.getRange(1, 1, output.length, output[0].length).setValues(output);
    candidate.setFrozenRows(1);

    // 保留來源 Sheet 基本欄寬（只複製既有欄；metadata 採預設寬度）。
    const sourceCols = headers.length;
    for (let col = 1; col <= sourceCols; col++) {
      try {
        candidate.setColumnWidth(col, sourceSheet.getColumnWidth(col));
      } catch (e) {
        // 欄寬不是資料正確性的必要條件，不因 UI 格式中止 candidate 建立。
      }
    }

    candidate.getRange(1, 1, 1, output[0].length).setFontWeight('bold');
    candidate.getRange(1, sourceCols + 1, output.length, extraHeaders.length)
      .setBackground('#f3f6ef');

    PropertiesService.getDocumentProperties().setProperty(
      'V3_8_5D_CANDIDATE_META',
      JSON.stringify({
        candidateSheetName: V3_CANDIDATE_SHEET_NAME,
        sourceSheetName: V3_SHEET_NAME,
        auditSignature: preview.auditSignature,
        appVersion: V3_APP_VERSION,
        createdAt: new Date().toISOString(),
        sourceRows: values.length - 1,
        approvedRows: preview.previewRowCount,
        changedRows: changedRows,
        avoidOnlyRows: avoidOnlyRows,
        fixTextRows: fixTextRows,
        moveRoleRows: moveRoleRows
      })
    );
  } catch (error) {
    ss.deleteSheet(candidate);
    throw error;
  }

  return {
    appVersion: V3_APP_VERSION,
    sourceSheetName: V3_SHEET_NAME,
    candidateSheetName: V3_CANDIDATE_SHEET_NAME,
    auditSignature: preview.auditSignature,
    sourceRows: values.length - 1,
    candidateRows: output.length - 1,
    approvedRows: preview.previewRowCount,
    changedRows: changedRows,
    avoidOnlyRows: avoidOnlyRows,
    fixTextRows: fixTextRows,
    moveRoleRows: moveRoleRows,
    candidateCreated: true,
    sourceSheetModified: false,
    candidateReplaced: false
  };
}

/**
 * V3.8-5d：讀取 candidate 建立 metadata；不修改任何 Sheet。
 */
function getV3CandidateMeta() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss ? ss.getSheetByName(V3_CANDIDATE_SHEET_NAME) : null;
  const raw = PropertiesService.getDocumentProperties().getProperty('V3_8_5D_CANDIDATE_META');
  let meta = null;
  if (raw) {
    try { meta = JSON.parse(raw); } catch (e) { meta = null; }
  }
  return {
    exists: !!sheet,
    sheetName: V3_CANDIDATE_SHEET_NAME,
    rows: sheet ? Math.max(0, sheet.getLastRow() - 1) : 0,
    columns: sheet ? sheet.getLastColumn() : 0,
    meta: meta
  };
}

/**
 * V3.8-5d 設定邊界檢查；不建立 candidate。
 */
function testV385dCandidateBuilderConfig() {
  Logger.log('App version：' + V3_APP_VERSION);
  Logger.log('Source：' + V3_SHEET_NAME + '（永不覆寫）');
  Logger.log('Candidate：' + V3_CANDIDATE_SHEET_NAME + '（只建立新分頁；已存在則拒絕）');
  Logger.log('Gate：先重跑 V3.8-5c Preview；validation PASS / candidatePlanReady=true 才可建立');
  Logger.log('FIX_TEXT：只修改 candidate 的元素英文');
  Logger.log('MOVE_ROLE：只修改 candidate 的角色(role)，可一併套用 proposedEnglish');
  Logger.log('AVOID_ONLY：不刪 row；candidate 建議資料去向=Negative / Avoid，PositiveEligible=FALSE');
  Logger.log('KEEP / AUDIT_FALSE_POSITIVE：不修改原內容，只保留 candidate metadata');
  Logger.log('Metadata：來源列 / 審核決策 / PositiveEligible / AuditSignature / ReviewNote');
  Logger.log('Recipe schema：' + V3_RECIPE_SCHEMA_VERSION + '（不修改）');
  Logger.log('Backup version：' + V3_RECIPE_BACKUP_VERSION + '（不修改）');
}

/**
 * V3.8-5d Dry-run：驗證目前 candidate 狀態與名稱安全；不建立 Sheet。
 */
function testV385dCandidateBuilderDryRun() {
  const workspace = getV3CorrectionReviewWorkspace();
  const meta = getV3CandidateMeta();
  Logger.log('App version：' + V3_APP_VERSION);
  Logger.log('Audit signature：' + workspace.auditSignature);
  Logger.log('Source rows：' + workspace.auditedRows);
  Logger.log('Unique review rows：' + workspace.uniqueReviewRowCount);
  Logger.log('Candidate sheet：' + V3_CANDIDATE_SHEET_NAME);
  Logger.log('Candidate exists：' + meta.exists);
  Logger.log('Source overwrite guard：' + (V3_CANDIDATE_SHEET_NAME !== V3_SHEET_NAME ? 'PASS' : 'FAIL'));
  Logger.log('Sheet write：NONE（dry-run）');
  if (V3_CANDIDATE_SHEET_NAME === V3_SHEET_NAME) {
    throw new Error('Candidate name 與正式資料源相同。');
  }
  return meta;
}



/**
 * V3.8-5e Candidate Validation / Re-Audit
 * 只讀驗證 Elements_v3_3_candidate；不修改 source/candidate。
 */
function validateV3CandidateSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('找不到綁定的 Google 試算表。');

  const source = getV3Sheet_();
  const candidate = ss.getSheetByName(V3_CANDIDATE_SHEET_NAME);
  if (!candidate) throw new Error('找不到分頁「' + V3_CANDIDATE_SHEET_NAME + '」。');

  const sourceValues = source.getDataRange().getDisplayValues();
  const candidateValues = candidate.getDataRange().getDisplayValues();
  if (!sourceValues.length || !candidateValues.length) {
    throw new Error('source 或 candidate 沒有資料。');
  }

  const sourceHeaders = sourceValues[0].map(clean_);
  const candidateHeaders = candidateValues[0].map(clean_);
  const sourceIndex = buildHeaderIndex_(sourceHeaders);
  const candidateIndex = buildHeaderIndex_(candidateHeaders);

  const requiredCandidateHeaders = [
    '角色(role)', '元素英文', '建議資料去向',
    'V3候選來源列', 'V3候選審核決策', 'V3候選PositiveEligible',
    'V3候選AuditSignature', 'V3候選ReviewNote'
  ];
  const missingCandidateHeaders = requiredCandidateHeaders.filter(function (name) {
    return candidateIndex[name] == null;
  });

  const sourceRows = sourceValues.length - 1;
  const candidateRows = candidateValues.length - 1;
  const rowCountMatch = sourceRows === candidateRows;

  const sourceByRow = {};
  sourceValues.slice(1).forEach(function (row, i) {
    sourceByRow[i + 2] = row;
  });

  let approvedRows = 0;
  let changedRows = 0;
  let avoidOnlyRows = 0;
  let avoidOnlyPositiveExcluded = 0;
  let invalidSourceRefs = 0;
  let unexpectedChanges = 0;
  let signatureMismatchRows = 0;
  const actionCounts = {};
  const changedDetails = [];
  let baselineSignature = '';

  candidateValues.slice(1).forEach(function (row, i) {
    const candidateSheetRow = i + 2;
    const sourceRowNumber = Number(row[candidateIndex['V3候選來源列']] || 0);
    const decision = clean_(row[candidateIndex['V3候選審核決策']]).toUpperCase();
    const positiveEligible = clean_(row[candidateIndex['V3候選PositiveEligible']]).toUpperCase();
    const signature = clean_(row[candidateIndex['V3候選AuditSignature']]);

    if (!baselineSignature && signature) baselineSignature = signature;
    if (signature && baselineSignature && signature !== baselineSignature) signatureMismatchRows++;

    if (!sourceRowNumber || !sourceByRow[sourceRowNumber]) {
      invalidSourceRefs++;
      return;
    }

    const src = sourceByRow[sourceRowNumber];
    const srcRole = clean_(src[sourceIndex['角色(role)']]);
    const srcEn = clean_(src[sourceIndex['元素英文']]);
    const srcDest = clean_(src[sourceIndex['建議資料去向']]);

    const candRole = clean_(row[candidateIndex['角色(role)']]);
    const candEn = clean_(row[candidateIndex['元素英文']]);
    const candDest = clean_(row[candidateIndex['建議資料去向']]);

    const contentChanged = srcRole !== candRole || srcEn !== candEn || srcDest !== candDest;
    if (decision) {
      approvedRows++;
      actionCounts[decision] = (actionCounts[decision] || 0) + 1;
    }

    if (decision === 'AVOID_ONLY') {
      avoidOnlyRows++;
      if (positiveEligible === 'FALSE' && candDest === 'Negative / Avoid') {
        avoidOnlyPositiveExcluded++;
      }
    }

    if (contentChanged) {
      changedRows++;
      changedDetails.push({
        sourceRow: sourceRowNumber,
        candidateSheetRow: candidateSheetRow,
        decision: decision,
        before: { role: srcRole, en: srcEn, destination: srcDest },
        after: { role: candRole, en: candEn, destination: candDest },
        positiveEligible: positiveEligible
      });
    }

    const allowedChange =
      (decision === 'FIX_TEXT' && srcRole === candRole && srcDest === candDest && srcEn !== candEn) ||
      (decision === 'MOVE_ROLE' && (srcRole !== candRole || srcEn !== candEn) && srcDest === candDest) ||
      (decision === 'AVOID_ONLY' && srcRole === candRole && srcEn === candEn && candDest === 'Negative / Avoid') ||
      (!decision && !contentChanged) ||
      ((decision === 'KEEP' || decision === 'AUDIT_FALSE_POSITIVE') && !contentChanged);

    if (!allowedChange) unexpectedChanges++;
  });

  // Candidate-specific Re-Audit using candidate rows as source.
  const candidateAudit = auditV3Rows_(candidateValues, candidateHeaders, {
    issueLimit: 10000,
    full: true,
    sourceName: V3_CANDIDATE_SHEET_NAME,
    positiveEligibilityHeader: 'V3候選PositiveEligible'
  });

  const sourceAudit = getV3DataQualityAudit({ full: true });

  const candidateIssueKeys = {};
  (candidateAudit.issues || []).forEach(function (issue) {
    const key = [issue.rowNumber, issue.type, issue.role, issue.en].join('|');
    candidateIssueKeys[key] = true;
  });
  const sourceIssueKeys = {};
  (sourceAudit.issues || []).forEach(function (issue) {
    const key = [issue.rowNumber, issue.type, issue.role, issue.en].join('|');
    sourceIssueKeys[key] = true;
  });

  const resolvedIssues = (sourceAudit.issues || []).filter(function (issue) {
    const key = [issue.rowNumber, issue.type, issue.role, issue.en].join('|');
    return !candidateIssueKeys[key];
  });
  const newIssues = (candidateAudit.issues || []).filter(function (issue) {
    const key = [issue.rowNumber, issue.type, issue.role, issue.en].join('|');
    return !sourceIssueKeys[key];
  });

  const pass =
    !missingCandidateHeaders.length &&
    rowCountMatch &&
    invalidSourceRefs === 0 &&
    signatureMismatchRows === 0 &&
    unexpectedChanges === 0 &&
    avoidOnlyRows === avoidOnlyPositiveExcluded &&
    newIssues.length === 0;

  return {
    appVersion: V3_APP_VERSION,
    sourceSheetName: V3_SHEET_NAME,
    candidateSheetName: V3_CANDIDATE_SHEET_NAME,
    auditSignature: baselineSignature,
    sourceRows: sourceRows,
    candidateRows: candidateRows,
    rowCountMatch: rowCountMatch,
    missingCandidateHeaders: missingCandidateHeaders,
    approvedRows: approvedRows,
    changedRows: changedRows,
    actionCounts: actionCounts,
    avoidOnlyRows: avoidOnlyRows,
    avoidOnlyPositiveExcluded: avoidOnlyPositiveExcluded,
    invalidSourceRefs: invalidSourceRefs,
    signatureMismatchRows: signatureMismatchRows,
    unexpectedChanges: unexpectedChanges,
    sourceAuditIssues: sourceAudit.totalIssueCount,
    candidateAuditIssues: candidateAudit.totalIssueCount,
    candidateSeverityCounts: candidateAudit.severityCounts,
    resolvedIssueCount: resolvedIssues.length,
    newIssueCount: newIssues.length,
    newIssues: newIssues.slice(0, 100),
    resolvedIssues: resolvedIssues.slice(0, 100),
    changedDetails: changedDetails.slice(0, 200),
    pass: pass,
    readOnly: true,
    sourceModified: false,
    candidateModified: false
  };
}

/**
 * Candidate Audit helper：沿用 V3.8-5 的 audit 規則，
 * 但 `PositiveEligible=FALSE` row 不再被 positive-polarity-risk 計入。
 */

function auditV3Rows_(values, headers, options) {
  options = options || {};
  const index = buildHeaderIndex_(headers);
  const positiveEligibilityHeader = options.positiveEligibilityHeader || '';
  const positiveEligibilityIndex =
    positiveEligibilityHeader && index[positiveEligibilityHeader] != null
      ? index[positiveEligibilityHeader]
      : null;

  const rows = values.slice(1).map(function (row, i) {
    return {
      rowNumber: i + 2,
      role: clean_(row[index['角色(role)']]),
      major: index['新大類'] == null ? '' : clean_(row[index['新大類']]),
      middle: index['新中類'] == null ? '' : clean_(row[index['新中類']]),
      minor: index['小類'] == null ? '' : clean_(row[index['小類']]),
      ch: index['元素中文'] == null ? '' : clean_(row[index['元素中文']]),
      en: index['元素英文'] == null ? '' : clean_(row[index['元素英文']]),
      type: index['適用類型'] == null ? '' : clean_(row[index['適用類型']]),
      destination: index['建議資料去向'] == null ? '' : clean_(row[index['建議資料去向']]),
      tags: index['Tag候選'] == null ? '' : clean_(row[index['Tag候選']]),
      positiveEligible: positiveEligibilityIndex == null
        ? true
        : clean_(row[positiveEligibilityIndex]).toUpperCase() !== 'FALSE'
    };
  }).filter(function (row) {
    return isElementRow_(row) && !!V3_ROLE_META[row.role];
  });

  const issues = [];
  const issueKeys = {};
  const severityCounts = { high: 0, medium: 0, low: 0 };
  const typeCounts = {};
  const roleCounts = {};
  const technicalSemanticCounts = {
    'avoid-defect': 0,
    'manual-review': 0,
    'positive-quality-candidate': 0
  };
  const correctionActionCounts = {
    KEEP: 0,
    FIX_TEXT: 0,
    MOVE_ROLE: 0,
    AVOID_ONLY: 0,
    AUDIT_FALSE_POSITIVE: 0,
    REVIEW: 0
  };
  const duplicateEnMap = {};

  function addIssue(row, severity, type, label, detail, suggestion, semanticType) {
    const key = [row.rowNumber, type].join(':');
    if (issueKeys[key]) return;
    issueKeys[key] = true;

    const issue = {
      id: key,
      rowNumber: row.rowNumber,
      severity: String(severity || '').toLowerCase(),
      type: type,
      label: label,
      role: row.role,
      roleLabel: V3_ROLE_META[row.role] ? V3_ROLE_META[row.role].label : row.role,
      major: row.major,
      middle: row.middle,
      minor: row.minor,
      ch: row.ch,
      en: row.en,
      detail: detail || '',
      suggestion: suggestion || '',
      semanticType: semanticType || ''
    };

    const correction = getV3AuditSuggestedCorrection_(issue);
    issue.suggestedAction = correction.action;
    issue.suggestedTarget = correction.target || '';
    issue.suggestedReason = correction.reason || '';
    issue.reviewStatus = 'REVIEW';
    issue.reviewerDecision = '';
    issue.proposedRole = '';
    issue.proposedEnglish = '';
    issue.reviewNote = '';

    issues.push(issue);
    severityCounts[severity] = (severityCounts[severity] || 0) + 1;
    typeCounts[type] = (typeCounts[type] || 0) + 1;
    roleCounts[row.role] = (roleCounts[row.role] || 0) + 1;
    correctionActionCounts[issue.suggestedAction] =
      (correctionActionCounts[issue.suggestedAction] || 0) + 1;
  }

  rows.forEach(function (row) {
    const text = [row.ch, row.en, row.tags].join(' ').trim();
    const en = clean_(row.en);

    if (!en) {
      addIssue(
        row, 'medium', 'missing-english', '缺少元素英文',
        '目前前端會 fallback 到元素中文，但英文 Prompt 的一致性與模型可讀性可能下降。',
        '補上可直接作為 Prompt phrase 的英文描述。',
        'manual-review'
      );
    }

    let matchedNegativeRule = null;
    if (row.positiveEligible) {
      V3_DATA_AUDIT_NEGATIVE_RULES.some(function (rule) {
        if (rule.pattern.test(text)) {
          matchedNegativeRule = rule;
          return true;
        }
        return false;
      });
    }

    if (row.positiveEligible && matchedNegativeRule) {
      addIssue(
        row, 'high', 'positive-polarity-risk',
        'Positive 極性風險：' + matchedNegativeRule.label,
        '元素文字命中明確 Avoid／缺陷語意；若直接進 Positive Prompt 可能反向要求模型生成不想要的內容。',
        '人工確認後標記為 avoid-defect，或在下一版資料源移出可直接注入 Positive 的資料。',
        'avoid-defect'
      );
    }

    if (row.role === 'technical') {
      if (row.positiveEligible && matchedNegativeRule) {
        technicalSemanticCounts['avoid-defect'] += 1;
      } else if (
        row.positiveEligible &&
        V3_DATA_AUDIT_TECH_REVIEW_PATTERN.test(text)
      ) {
        technicalSemanticCounts['manual-review'] += 1;
        addIssue(
          row, 'medium', 'technical-semantic-review',
          '品質控制語意需人工確認',
          '包含 grain / contrast / saturation / processing / artifact 等可能依上下文正負皆可的技術詞。',
          '確認此元素是 positive-quality、avoid-defect 或 style-dependent，再決定 Elements_v3_3 的資料去向。',
          'manual-review'
        );
      } else if (row.positiveEligible) {
        technicalSemanticCounts['positive-quality-candidate'] += 1;
      }
    }

    if (row.role === 'color') {
      const colorText = [row.ch, row.en].join(' ');
      if (
        V3_DATA_AUDIT_COLOR_MOOD_PATTERN.test(colorText) ||
        V3_DATA_AUDIT_COLOR_MOOD_ZH_PATTERN.test(colorText)
      ) {
        addIssue(
          row, 'medium', 'color-mood-role-risk',
          'Color Role 可能混入 Mood／Atmosphere',
          '色彩 Role 的元素包含 mood / atmosphere / ambience / cosy / healing 等氛圍語意。',
          '人工確認是否應留在 color，或未來移往 Mood／Lighting／Tag；本版不自動重分類。',
          'manual-review'
        );
      }

      if (/\bpalette\s*$/i.test(en)) {
        addIssue(
          row, 'low', 'color-palette-suffix',
          'Color phrase 已自帶 palette',
          '舊 Builder 容易形成 palette palette；目前前端已有 normalization，但資料本身仍可標記整理。',
          'Elements_v3_3 可考慮統一保存為不含 Builder suffix 的核心色彩片語。',
          'normalization-candidate'
        );
      }

      if (/^\s*(?:a|an)\s+/i.test(en)) {
        addIssue(
          row, 'low', 'color-leading-article',
          'Color phrase 含前置冠詞',
          '若再由模板補冠詞，可能形成 a controlled a ... 之類不自然組句。',
          'Elements_v3_3 可考慮移除模板型前置冠詞，只保留核心描述。',
          'normalization-candidate'
        );
      }
    }

    const conflictHits = getV3AuditConflictHits_(row);
    conflictHits.forEach(function (hit) {
      addIssue(
        row, 'medium', 'single-row-conflict-alias',
        '單一元素跨衝突 bucket：' + hit.ruleLabel,
        '同一列同時命中「' + hit.bucketLabels.join('／') + '」，前端 conflict resolver 可能需要額外 alias 判斷。',
        '人工確認元素文字是否本身混合多個互斥概念；若只是同義誤判，調整 alias，而不是改 taxonomy。',
        'manual-review'
      );
    });

    if (en) {
      const dupKey = row.role + '|' + normalizeSearch_(en);
      if (!duplicateEnMap[dupKey]) duplicateEnMap[dupKey] = [];
      duplicateEnMap[dupKey].push(row);
    }
  });

  Object.keys(duplicateEnMap).forEach(function (key) {
    const same = duplicateEnMap[key];
    if (!same || same.length < 2) return;
    const rowNumbers = same.map(function (row) { return row.rowNumber; });
    same.forEach(function (row) {
      addIssue(
        row, 'low', 'duplicate-english-same-role',
        '同 Role 英文描述重複',
        '相同英文在同一 Role 出現於列：' + rowNumbers.join(', '),
        '確認是否為不同分類下刻意共用，或可在 Elements_v3_3 去重／改寫。',
        'duplicate-review'
      );
    });
  });

  const severityOrder = { high: 0, medium: 1, low: 2 };
  issues.sort(function (a, b) {
    const severityA = severityOrder[a.severity] == null ? 9 : severityOrder[a.severity];
    const severityB = severityOrder[b.severity] == null ? 9 : severityOrder[b.severity];
    const severityDiff = severityA - severityB;
    if (severityDiff) return severityDiff;
    return a.rowNumber - b.rowNumber;
  });

  return {
    sourceName: options.sourceName || '',
    auditedRows: rows.length,
    totalIssueCount: issues.length,
    severityCounts: severityCounts,
    typeCounts: typeCounts,
    roleCounts: roleCounts,
    technicalSemanticCounts: technicalSemanticCounts,
    correctionActionCounts: correctionActionCounts,
    issues: issues
  };
}


function testV385eCandidateValidationConfig() {
  Logger.log('App version：' + V3_APP_VERSION);
  Logger.log('Validation source：' + V3_SHEET_NAME + ' ↔ ' + V3_CANDIDATE_SHEET_NAME);
  Logger.log('Checks：row count / metadata headers / source-row refs / audit signature / allowed action diff');
  Logger.log('AVOID_ONLY：PositiveEligible=FALSE 且建議資料去向=Negative / Avoid 才算通過');
  Logger.log('Re-Audit：candidate 重新執行 Data Quality Audit，PositiveEligible=FALSE 不計 positive-polarity-risk');
  Logger.log('Release gate：newIssueCount 必須為 0；unexpectedChanges 必須為 0');
  Logger.log('Sheet write：NONE（source/candidate 都只讀）');
  Logger.log('Recipe schema：' + V3_RECIPE_SCHEMA_VERSION + '（不修改）');
  Logger.log('Backup version：' + V3_RECIPE_BACKUP_VERSION + '（不修改）');
}

function testV385eCandidateValidation() {
  const result = validateV3CandidateSheet();
  Logger.log('App version：' + result.appVersion);
  Logger.log('Rows：source ' + result.sourceRows + ' / candidate ' + result.candidateRows + ' / match ' + result.rowCountMatch);
  Logger.log('Approved rows：' + result.approvedRows + ' / changed ' + result.changedRows);
  Logger.log('AVOID_ONLY：' + result.avoidOnlyPositiveExcluded + ' / ' + result.avoidOnlyRows + ' correctly excluded');
  Logger.log('Unexpected changes：' + result.unexpectedChanges);
  Logger.log('Audit issues：source ' + result.sourceAuditIssues + ' → candidate ' + result.candidateAuditIssues);
  Logger.log('Resolved issues：' + result.resolvedIssueCount);
  Logger.log('New issues：' + result.newIssueCount);
  Logger.log('Validation：' + (result.pass ? 'PASS' : 'FAIL'));
  Logger.log('Sheet write：NONE');
  if (!result.pass) throw new Error('V3.8-5e2 Candidate Validation FAIL');
  return result;
}



/**
 * V3.8-5f Candidate Promotion Readiness
 * 純判定／報告層：不 rename、不切 data source、不修改任何 Sheet。
 */
function getV3CandidatePromotionReadiness() {
  const validation = validateV3CandidateSheet();
  const workspace = getV3CorrectionReviewWorkspace();

  const candidateAuditIssueCount = Number(validation.candidateAuditIssues || 0);
  const candidateHighIssueCount = Number(
    (validation.candidateSeverityCounts && validation.candidateSeverityCounts.high) || 0
  );

  const remainingReviewRows = Math.max(
    0,
    Number(workspace.uniqueReviewRowCount || 0) - Number(validation.approvedRows || 0)
  );

  const hardGates = [
    {
      id: 'candidate-validation',
      label: 'Candidate Validation',
      pass: validation.pass === true,
      detail: validation.pass ? 'V3.8-5e2 Validation PASS' : 'Candidate Validation 尚未通過'
    },
    {
      id: 'row-count',
      label: 'Row count match',
      pass: validation.rowCountMatch === true,
      detail: String(validation.sourceRows) + ' / ' + String(validation.candidateRows)
    },
    {
      id: 'source-refs',
      label: 'Source row references',
      pass: Number(validation.invalidSourceRefs || 0) === 0,
      detail: 'invalidSourceRefs=' + Number(validation.invalidSourceRefs || 0)
    },
    {
      id: 'audit-signature',
      label: 'Audit signature consistency',
      pass: Number(validation.signatureMismatchRows || 0) === 0,
      detail: 'signatureMismatchRows=' + Number(validation.signatureMismatchRows || 0)
    },
    {
      id: 'unexpected-changes',
      label: 'Unexpected changes',
      pass: Number(validation.unexpectedChanges || 0) === 0,
      detail: 'unexpectedChanges=' + Number(validation.unexpectedChanges || 0)
    },
    {
      id: 'new-issues',
      label: 'New Audit issues',
      pass: Number(validation.newIssueCount || 0) === 0,
      detail: 'newIssueCount=' + Number(validation.newIssueCount || 0)
    },
    {
      id: 'avoid-routing',
      label: 'AVOID_ONLY routing',
      pass:
        Number(validation.avoidOnlyRows || 0) ===
        Number(validation.avoidOnlyPositiveExcluded || 0),
      detail:
        String(validation.avoidOnlyPositiveExcluded || 0) +
        ' / ' +
        String(validation.avoidOnlyRows || 0)
    }
  ];

  const hardPass = hardGates.every(function (gate) { return gate.pass; });

  const promotionGates = [
    {
      id: 'remaining-review',
      label: 'Remaining review rows',
      pass: remainingReviewRows === 0,
      detail: 'remainingReviewRows=' + remainingReviewRows
    },
    {
      id: 'high-issues',
      label: 'Candidate HIGH issues',
      pass: candidateHighIssueCount === 0,
      detail: 'candidateHighIssueCount=' + candidateHighIssueCount
    },
    {
      id: 'approved-provenance',
      label: 'Approved action provenance',
      pass: Number(validation.approvedRows || 0) > 0,
      detail: 'approvedRows=' + Number(validation.approvedRows || 0)
    },
    {
      id: 'prompt-runtime-regression',
      label: 'Prompt runtime regression',
      pass: false,
      manual: true,
      detail: '尚未由 5f 自動驗證；需人工完成正式圖片／影片 Prompt regression'
    }
  ];

  const automatedPromotionPass = promotionGates
    .filter(function (gate) { return gate.manual !== true; })
    .every(function (gate) { return gate.pass; });

  let status = 'NOT_READY';
  if (hardPass) {
    status = automatedPromotionPass ? 'CONDITIONALLY_READY' : 'CONDITIONALLY_READY';
    if (
      automatedPromotionPass &&
      promotionGates.every(function (gate) { return gate.pass; })
    ) {
      status = 'READY_FOR_PROMOTION';
    }
  }

  const blockers = [];
  hardGates.concat(promotionGates).forEach(function (gate) {
    if (!gate.pass) {
      blockers.push({
        gateId: gate.id,
        label: gate.label,
        detail: gate.detail,
        manual: gate.manual === true
      });
    }
  });

  return {
    appVersion: V3_APP_VERSION,
    status: status,
    promotionAllowed: status === 'READY_FOR_PROMOTION',
    sourceSheetName: V3_SHEET_NAME,
    candidateSheetName: V3_CANDIDATE_SHEET_NAME,
    auditSignature: validation.auditSignature || '',
    hardGatePass: hardPass,
    automatedPromotionGatePass: automatedPromotionPass,
    hardGates: hardGates,
    promotionGates: promotionGates,
    blockers: blockers,
    metrics: {
      sourceRows: validation.sourceRows,
      candidateRows: validation.candidateRows,
      approvedRows: validation.approvedRows,
      changedRows: validation.changedRows,
      remainingReviewRows: remainingReviewRows,
      sourceAuditIssues: validation.sourceAuditIssues,
      candidateAuditIssues: candidateAuditIssueCount,
      resolvedIssues: validation.resolvedIssueCount,
      newIssues: validation.newIssueCount,
      candidateHighIssues: candidateHighIssueCount,
      unexpectedChanges: validation.unexpectedChanges,
      avoidOnlyRows: validation.avoidOnlyRows,
      avoidOnlyExcluded: validation.avoidOnlyPositiveExcluded
    },
    dataSourceSwitchPerformed: false,
    candidateRenamed: false,
    sheetWrite: 'NONE'
  };
}

function testV385fPromotionReadinessConfig() {
  Logger.log('App version：' + V3_APP_VERSION);
  Logger.log('Mode：Candidate Promotion Readiness report only');
  Logger.log('Hard gates：5e Validation / row count / source refs / signature / unexpected changes / new issues / AVOID routing');
  Logger.log('Promotion gates：remaining review rows / HIGH issues / approved provenance / prompt runtime regression');
  Logger.log('Statuses：NOT_READY / CONDITIONALLY_READY / READY_FOR_PROMOTION');
  Logger.log('Promotion action：NONE（不 rename、不切 data source、不修改 Sheet）');
  Logger.log('Source：' + V3_SHEET_NAME + '（只讀）');
  Logger.log('Candidate：' + V3_CANDIDATE_SHEET_NAME + '（只讀）');
}

function testV385fPromotionReadiness() {
  const result = getV3CandidatePromotionReadiness();
  Logger.log('App version：' + result.appVersion);
  Logger.log('Readiness：' + result.status);
  Logger.log('Hard gates：' + (result.hardGatePass ? 'PASS' : 'FAIL'));
  Logger.log('Rows：source ' + result.metrics.sourceRows + ' / candidate ' + result.metrics.candidateRows);
  Logger.log('Approved rows：' + result.metrics.approvedRows);
  Logger.log('Remaining review rows：' + result.metrics.remainingReviewRows);
  Logger.log('Audit issues：source ' + result.metrics.sourceAuditIssues + ' → candidate ' + result.metrics.candidateAuditIssues);
  Logger.log('HIGH issues：' + result.metrics.candidateHighIssues);
  Logger.log('New issues：' + result.metrics.newIssues);
  Logger.log('Unexpected changes：' + result.metrics.unexpectedChanges);
  Logger.log('AVOID_ONLY routing：' + result.metrics.avoidOnlyExcluded + ' / ' + result.metrics.avoidOnlyRows);
  Logger.log('Promotion allowed：' + result.promotionAllowed);
  Logger.log('Blockers：' + result.blockers.length);
  result.blockers.forEach(function (blocker, i) {
    Logger.log(
      '#' + (i + 1) + ' ' +
      blocker.label + ' · ' +
      blocker.detail +
      (blocker.manual ? ' · manual' : '')
    );
  });
  Logger.log('Data source switch：NO');
  Logger.log('Sheet write：NONE');

  if (result.dataSourceSwitchPerformed || result.candidateRenamed || result.sheetWrite !== 'NONE') {
    throw new Error('V3.8-5f Safety boundary FAIL');
  }
  return result;
}



/* V3.8-5g Candidate Iteration / Safe Rebuild */
const V3_STAGING_SHEET_NAME = 'Elements_v3_3_staging';
const V3_PREVIOUS_CANDIDATE_PREFIX = 'Elements_v3_3_candidate_backup_';

function buildV3CandidateStaging(approvedPlan) {
  const preview = previewV3Corrections(approvedPlan);
  if (!preview.validation || preview.validation.pass !== true || preview.candidatePlanReady !== true) {
    throw new Error('5c Preview 未通過，禁止建立 staging。');
  }
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const source = getV3Sheet_();
  if (ss.getSheetByName(V3_STAGING_SHEET_NAME)) throw new Error('Staging 已存在，禁止覆寫。');

  const values = source.getDataRange().getValues();
  const staging = ss.insertSheet(V3_STAGING_SHEET_NAME);
  staging.getRange(1,1,values.length,values[0].length).setValues(values);

  let headers=staging.getRange(1,1,1,staging.getLastColumn()).getDisplayValues()[0].map(clean_);
  ['V3候選來源列','V3候選審核決策','V3候選PositiveEligible','V3候選AuditSignature','V3候選ReviewNote'].forEach(function(h){
    if (headers.indexOf(h)<0) { staging.getRange(1,staging.getLastColumn()+1).setValue(h); headers.push(h); }
  });
  const idx=buildHeaderIndex_(headers);
  const plan={};
  (preview.rows||[]).forEach(function(x){ plan[Number(x.rowNumber)]=x; });

  for (let r=2;r<=staging.getLastRow();r++) {
    staging.getRange(r,idx['V3候選來源列']+1).setValue(r);
    const x=plan[r];
    if (!x) continue;
const d=clean_(x.action||x.reviewerDecision||x.decision).toUpperCase();
    staging.getRange(r,idx['V3候選審核決策']+1).setValue(d);
    staging.getRange(r,idx['V3候選AuditSignature']+1).setValue(preview.auditSignature||'');
    staging.getRange(r,idx['V3候選ReviewNote']+1).setValue(x.reviewNote||'');
    if (d==='FIX_TEXT') staging.getRange(r,idx['元素英文']+1).setValue(x.after.en);
    if (d==='MOVE_ROLE') {
      staging.getRange(r,idx['角色(role)']+1).setValue(x.after.role);
      if (x.after.en) staging.getRange(r,idx['元素英文']+1).setValue(x.after.en);
    }
    if (d==='AVOID_ONLY') {
      if (idx['建議資料去向']!=null) staging.getRange(r,idx['建議資料去向']+1).setValue('Negative / Avoid');
      staging.getRange(r,idx['V3候選PositiveEligible']+1).setValue('FALSE');
    } else {
      staging.getRange(r,idx['V3候選PositiveEligible']+1).setValue('TRUE');
    }
  }
  SpreadsheetApp.flush();
  return {appVersion:V3_APP_VERSION,stagingSheet:V3_STAGING_SHEET_NAME,rows:staging.getLastRow()-1,
    approvedRows:(preview.rows||[]).length,auditSignature:preview.auditSignature||'',
    sourceModified:false,currentCandidateModified:false,stagingCreated:true};
}

function validateV3CandidateStaging() {
  const ss=SpreadsheetApp.getActiveSpreadsheet(), staging=ss.getSheetByName(V3_STAGING_SHEET_NAME);
  if (!staging) throw new Error('找不到 staging。');
  const source=getV3Sheet_(), sv=source.getDataRange().getDisplayValues(), cv=staging.getDataRange().getDisplayValues();
  const headers=cv[0].map(clean_), idx=buildHeaderIndex_(headers);
  const required=['角色(role)','元素英文','V3候選來源列','V3候選審核決策','V3候選PositiveEligible','V3候選AuditSignature','V3候選ReviewNote'];
  const missing=required.filter(function(h){return idx[h]==null;});
  const audit=auditV3Rows_(cv,headers,{full:true,sourceName:V3_STAGING_SHEET_NAME,positiveEligibilityHeader:'V3候選PositiveEligible'});
  const sourceAudit=getV3DataQualityAudit({full:true});
  const sourceKeys={};
  (sourceAudit.issues||[]).forEach(function(i){sourceKeys[[i.rowNumber,i.type,i.role,i.en].join('|')]=true;});
  const newIssues=(audit.issues||[]).filter(function(i){return !sourceKeys[[i.rowNumber,i.type,i.role,i.en].join('|')];});
  let avoid=0, excluded=0, approved=0;
  cv.slice(1).forEach(function(row){
    const d=clean_(row[idx['V3候選審核決策']]).toUpperCase();
    if(d) approved++;
    if(d==='AVOID_ONLY'){avoid++; if(clean_(row[idx['V3候選PositiveEligible']]).toUpperCase()==='FALSE') excluded++;}
  });
  const pass=missing.length===0 && sv.length===cv.length && newIssues.length===0 && avoid===excluded;
  return {appVersion:V3_APP_VERSION,pass:pass,sourceRows:sv.length-1,stagingRows:cv.length-1,approvedRows:approved,
    sourceAuditIssues:sourceAudit.totalIssueCount,stagingAuditIssues:audit.totalIssueCount,
    stagingHighIssues:Number((audit.severityCounts||{}).high||0),newIssueCount:newIssues.length,
    avoidOnlyRows:avoid,avoidOnlyExcluded:excluded,missingHeaders:missing};
}

function promoteV3StagingToCandidate() {
  const v=validateV3CandidateStaging();
  if(!v.pass) throw new Error('Staging Validation FAIL，禁止 Safe Swap。');
  const ss=SpreadsheetApp.getActiveSpreadsheet(), staging=ss.getSheetByName(V3_STAGING_SHEET_NAME),
        current=ss.getSheetByName(V3_CANDIDATE_SHEET_NAME);
  let backup='';
  if(current){
    backup=V3_PREVIOUS_CANDIDATE_PREFIX+Utilities.formatDate(new Date(),Session.getScriptTimeZone(),'yyyyMMdd_HHmmss');
    current.setName(backup);
  }
  staging.setName(V3_CANDIDATE_SHEET_NAME);
  SpreadsheetApp.flush();
  return {appVersion:V3_APP_VERSION,promoted:true,candidateSheet:V3_CANDIDATE_SHEET_NAME,
    previousCandidateBackup:backup,sourceModified:false,validation:v};
}

function testV385gSafeRebuildConfig(){
  Logger.log('App version：'+V3_APP_VERSION);
  Logger.log('Flow：Approved Plan → 5c Preview → staging → validation → Safe Swap');
  Logger.log('Source：'+V3_SHEET_NAME+'（永不覆寫）');
  Logger.log('Current candidate：staging PASS 前不修改');
  Logger.log('Staging：'+V3_STAGING_SHEET_NAME);
  Logger.log('Swap：舊 candidate timestamp backup → staging 升格');
  Logger.log('Direct overwrite：禁止');
}
function testV385gSafeRebuildDryRun(){
  const ss=SpreadsheetApp.getActiveSpreadsheet(), source=getV3Sheet_();
  Logger.log('App version：'+V3_APP_VERSION);
  Logger.log('Source rows：'+(source.getLastRow()-1));
  Logger.log('Current candidate exists：'+!!ss.getSheetByName(V3_CANDIDATE_SHEET_NAME));
  Logger.log('Staging exists：'+!!ss.getSheetByName(V3_STAGING_SHEET_NAME));
  Logger.log('Source overwrite guard：PASS');
  Logger.log('Direct candidate overwrite：NONE');
  Logger.log('Sheet write：NONE（dry-run）');
}


/* =========================
   Private helpers
   ========================= */

function getV3Sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  if (!ss) {
    throw new Error(
      '找不到綁定的 Google 試算表。請確認 Apps Script 是從試算表內「擴充功能 → Apps Script」建立。'
    );
  }

  const sheet = ss.getSheetByName(V3_SHEET_NAME);

  if (!sheet) {
    throw new Error(
      '找不到分頁「' + V3_SHEET_NAME +
      '」。請確認已匯入受控分類版資料，且工作表名稱正確。'
    );
  }

  return sheet;
}

function readV3Rows_() {
  const values = getV3Sheet_().getDataRange().getDisplayValues();

  if (values.length < 2) {
    return [];
  }

  const headers = values[0].map(clean_);
  const index = buildHeaderIndex_(headers);

  const required = [
    '角色(role)',
    '新大類',
    '新中類',
    '小類',
    '元素中文',
    '元素英文',
    '適用類型',
    '建議資料去向'
  ];

  required.forEach(function (name) {
    if (index[name] == null) {
      throw new Error('Elements_v3_2 缺少必要欄位：' + name);
    }
  });

  return values.slice(1).map(function (row, i) {
    return {
      rowNumber: i + 2,
      role: clean_(row[index['角色(role)']]),
      major: clean_(row[index['新大類']]),
      middle: clean_(row[index['新中類']]),
      minor: clean_(row[index['小類']]),
      ch: clean_(row[index['元素中文']]),
      en: clean_(row[index['元素英文']]),
      type: clean_(row[index['適用類型']]),
      destination: clean_(row[index['建議資料去向']]),
      tags: index['Tag候選'] == null ? '' : clean_(row[index['Tag候選']])
    };
  });
}

function buildHeaderIndex_(headers) {
  const result = {};
  headers.forEach(function (header, i) {
    result[header] = i;
  });
  return result;
}

function isElementRow_(row) {
  return (
    row &&
    row.role &&
    (row.ch || row.en) &&
    row.destination !== 'Styles' &&
    row.role !== 'style'
  );
}

function isModeCompatible_(typeText, mode) {
  const value = clean_(typeText);

  // 原始資料有一批「適用類型」空白；
  // V3 先不擅自排除，視為兩種模式皆可瀏覽。
  if (!value) return true;

  const normalized = value
    .replace(/，/g, ',')
    .replace(/、/g, ',')
    .replace(/\//g, ',')
    .replace(/\|/g, ',');

  return normalized
    .split(',')
    .map(clean_)
    .filter(Boolean)
    .some(function (type) {
      return type.indexOf(mode) !== -1;
    });
}

function buildSearchText_(row) {
  return normalizeSearch_([row.major, row.middle, row.minor, row.ch, row.en, row.tags].join(' '));
}



function getClientModeProfiles_() {
  const result = {};Object.keys(V3_MODE_PROFILES).forEach(function (mode) {
    const profile = V3_MODE_PROFILES[mode];
    result[mode] = {
      label: profile.label,
      summary: profile.summary,
      randomRequired: profile.randomRequired,
      randomOptional: profile.randomOptional,
      extraChance: profile.extraChance,
      technicalMin: profile.technicalMin,
      completeness: profile.completeness,
      promptPriority: profile.promptPriority
    };
  });
  return result;
}

function getClientDensityProfiles_() {
const result = {};
  Object.keys(V3_DENSITY_PROFILES).forEach(function (density) {
    const profile = V3_DENSITY_PROFILES[density];
    result[density] = {
      label: profile.label,
      summary: profile.summary,
      promptStyle: profile.promptStyle
    };
  });
  return result;
}

function getClientImportanceProfiles_() {
  const result = {};

  Object.keys(V3_IMPORTANCE_PROFILES).forEach(function (key) {
    const profile = V3_IMPORTANCE_PROFILES[key];
    result[key] = {
      label: profile.label,
      shortLabel: profile.shortLabel,
      order: profile.order,
      summary: profile.summary
    };
  });

  return result;
}

function getClientNegativeProfiles_() {
  const result = {};Object.keys(V3_NEGATIVE_PROFILES).forEach(function (mode) {
    const source = V3_NEGATIVE_PROFILES[mode];
    result[mode] = {
      簡潔: (source.簡潔 || []).slice(),
      標準: (source.標準 || []).slice(),
      豐富: (source.豐富 || []).slice(),
      antiCollage: (source.antiCollage || []).slice(),
      healingGuard: (source.healingGuard || []).slice()
    };
  });

  return result;
}

function normalizeMode_(value) {
  return clean_(value) === '影片' ? '影片' : '圖片';
}

function normalizeDensity_(value) {
  const density = clean_(value);
  return V3_DENSITY_PROFILES[density] ? density : '標準';
}

/**
 * 取得「模式 × 密度」最終抽選計畫。
 * 標準完全等同 V3.4-3；簡潔與豐富只調整自動抽選密度。
 */
function getRandomPlan_(modeValue, densityValue) {
  const mode = normalizeMode_(modeValue);
  const density = normalizeDensity_(densityValue);
  const base = V3_MODE_PROFILES[mode];

  if (density === '簡潔') {
    if (mode === '影片') {
      return {
        required: { subject: 1, action: 1, camera: 1, motion: 1 },
        optional: {
          environment: 0.75,
          lighting: 0.80,
          composition: 0.35,
          material: 0.18,
          color: 0.18
        },
        motionExtraChance: 0,
        technicalMin: 0,
        technicalChance: 0.70,
        technicalExtraChance: 0,
        technicalMax: 1
      };
    }

    return {
      required: { subject: 1, environment: 1, camera: 1 },
      optional: {
        composition: 0.45,
        lighting: 0.80,
        action: 0.25,
        material: 0.25,
        color: 0.25,
        motion: 0.04
      },
      motionExtraChance: 0,
      technicalMin: 0,technicalMin: 0,
      technicalChance: 0.70,
      technicalExtraChance: 0,
      technicalMax: 1
    };
  }

  if (density === '豐富') {
    if (mode === '影片') {
      return {
        required: {
          subject: 1,
          environment: 1,
          action: 1,
          camera: 1,
          lighting: 1,
          motion: 1,
          composition: 1,
          material: 1,
          color: 1
        },
        optional: {},
        motionExtraChance: 0.65,
        technicalMin: 2,
        technicalChance: 1,
        technicalExtraChance: 0,
        technicalMax: 2
      };
    }

    return {
      required: {
        subject: 1,
        environment: 1,
        composition: 1,
        camera: 1,
        lighting: 1,
        material: 1,
        color: 1
      },
      optional: { action: 0.78, motion: 0.25 },
      motionExtraChance: 0,
      technicalMin: 2,
      technicalChance: 1,
      technicalExtraChance: 0,
      technicalMax: 2
    };
  }

  return {
    required: Object.assign({}, base.randomRequired),
    optional: Object.assign({}, base.randomOptional),
    motionExtraChance: Number((base.extraChance || {}).motion || 0),
    technicalMin: Number(base.technicalMin || 1),
    technicalChance: 1,
    technicalExtraChance: Number((base.extraChance || {}).technical || 0),
    technicalMax: 2
  };
}

function expandSearchQuery_(value) {
  const original = normalizeSearch_(value);
  if (!original) return { original: '', terms: [], expanded: [] };
  const seen = {}; const queue = [original]; const terms = [original]; seen[original] = true;
  while (queue.length && terms.length < 32) {
    const current = queue.shift();
    V3_SEARCH_SYNONYM_GROUPS.forEach(function (group) {
      if (terms.length >= 32) return;
      const normalizedGroup = group.map(normalizeSearch_).filter(Boolean).sort(function (a, b) { return b.length - a.length; });
      const matchedAlias = findAliasInQuery_(current, normalizedGroup);
      if (!matchedAlias) return;
      normalizedGroup.forEach(function (replacement) {
        if (terms.length >= 32) return;
        const candidate = replaceAllLiteral_(current, matchedAlias, replacement);
        if (!candidate || seen[candidate]) return;
        seen[candidate] = true; terms.push(candidate); queue.push(candidate);
      });
    });
  }
  return { original: original, terms: terms, expanded: terms.slice(1) };
}

function findAliasInQuery_(query, aliases) {
  for (let i = 0; i < aliases.length; i += 1) {
    const alias = aliases[i];
    if (query === alias) return alias;
    if (isSafeEmbeddedAlias_(alias) && query.indexOf(alias) !== -1) return alias;
  }
  return '';
}

function isSafeEmbeddedAlias_(alias) {
  if (!alias) return false;
  if (/^[\x00-\x7F]+$/.test(alias)) return alias.replace(/\s+/g, '').length >= 3;
  return Array.from(alias.replace(/\s+/g, '')).length >= 2;
}

function replaceAllLiteral_(text, search, replacement) {
  return search ? text.split(search).join(replacement) : text;
}

function getSearchMatchRank_(haystack, searchInfo) {
  if (!searchInfo || !searchInfo.original) return 0;
  if (containsSearchTerm_(haystack, searchInfo.original)) return 2;
  for (let i = 0; i < searchInfo.expanded.length; i += 1) {
    if (containsSearchTerm_(haystack, searchInfo.expanded[i])) return 1;
  }
  return 0;
}

function containsSearchTerm_(haystack, term) {
  if (!haystack || !term) return false;
  if (haystack.indexOf(term) !== -1) return true;
  const compactTerm = term.replace(/\s+/g, '');
  return compactTerm.length >= 3 && haystack.replace(/\s+/g, '').indexOf(compactTerm) !== -1;
}

function getDisplayAliases_(original) {
  if (!original) return [];
  for (let i = 0; i < V3_SEARCH_SYNONYM_GROUPS.length; i += 1) {
    const group = V3_SEARCH_SYNONYM_GROUPS[i].map(normalizeSearch_).filter(Boolean);
    if (group.indexOf(original) !== -1) return group.filter(function (term) { return term !== original; });
  }
  return [];
}

function normalizeSearch_(value) {
  let text = clean_(value);
  try { text = text.normalize('NFKC'); } catch (error) {}
  return text.toLowerCase().replace(/[‐‑‒–—―_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function toClientItem_(row) {
  return {
    key: makeItemKey_(row),
    role: row.role,
    roleLabel: V3_ROLE_META[row.role] ? V3_ROLE_META[row.role].label : row.role,
    major: row.major,
    middle: row.middle,
    minor: row.minor,
    ch: row.ch,
    en: row.en || row.ch,
    type: row.type,
    tags: row.tags || '',
    single: V3_ROLE_META[row.role] ? V3_ROLE_META[row.role].single : false
  };
}

function makeItemKey_(row) {
  return [
    row.role,
    row.major,
    row.middle,
    row.minor,
    row.ch,
    row.en
  ].join('␟');
}

function addRandomForRole_(result, allRows, role, count, excludeKeys) {
  const pool = allRows.filter(function (row) {
    return row.role === role;
  });

  const picked = pickBalancedItems_(pool, count, excludeKeys || []);

  picked.forEach(function (item) {
    result.push(item);
  });
}

function pickBalancedItems_(rows, count, excludeKeys) {
  const targetCount = Math.max(0, Number(count) || 0);
  if (!rows.length || targetCount === 0) return [];

  const excluded = {};
  (excludeKeys || []).forEach(function (key) {
    excluded[key] = true;
  });

  let pool = rows.filter(function (row) {
    return !excluded[makeItemKey_(row)];
  });

  if (!pool.length) {
    pool = rows.slice();
  }

  const result = [];
  const usedKeys = {};

  while (result.length < targetCount) {
    const available = pool.filter(function (row) {
      return !usedKeys[makeItemKey_(row)];
    });

    if (!available.length) break;

    const byMiddle = {};
    available.forEach(function (row) {
      const name = row.middle || '未分類';

      if (!byMiddle[name]) {
        byMiddle[name] = [];
      }

      byMiddle[name].push(row);
    });

    const middleNames = Object.keys(byMiddle);
    if (!middleNames.length) break;

    const middle = middleNames[Math.floor(Math.random() * middleNames.length)];
    const middlePool = byMiddle[middle];

    // 再平均抽小類，避免同一中類裡的大型小類再次壟斷。
    const byMinor = {};
    middlePool.forEach(function (row) {
      const name = row.minor || '未分類';

      if (!byMinor[name]) {
        byMinor[name] = [];
      }

      byMinor[name].push(row);
    });

    const minorNames = Object.keys(byMinor);
    const minor = minorNames[Math.floor(Math.random() * minorNames.length)];
    const minorPool = byMinor[minor];

    const row = minorPool[Math.floor(Math.random() * minorPool.length)];
    const item = toClientItem_(row);

    usedKeys[item.key] = true;
    result.push(item);
  }

  return result;
}

function clean_(value) {
  return String(value == null ? '' : value).trim();
}

function normalize_(value) {
  return clean_(value).toLowerCase();
}

function clamp_(value, min, max) {
  return Math.min(max, Math.max(min, value));
}


/* =========================
   V3.8-6b Cross-Role Conflict + Technical Phrase Routing tests
   ========================= */
function classifyV386dTechnicalFixture_(value) {
  const text = String(value || '').trim();
  if (/\b(?:gore\s+and\s+violent\s+content|visual\s+noise\s+and\s+coarse\s+grain|oversaturated\s+neon\s+and\s+garish\s+colors|harsh\s+high[-\s]?contrast\s+visuals|incongruous\s+or\s+mismatched\s+elements|excessive\s+filters?\s+and\s+post[-\s]?processing|text\s+and\s+watermarks?|logos?\s+and\s+watermarks?|unwanted\s+text|unwanted\s+logos?|watermarks?)\b/i.test(text)) return { type: 'avoid-defect', subtype: 'avoid-defect' };
  if (/\b(?:people\s+and\s+visible\s+faces|visible\s+faces?|face\s+focus|facial\s+focus|fully\s+framed\s+subject|without\s+cropping|complete\s+anatomy|clearly\s+visible|clearly\s+readable)\b/i.test(text)) return { type: 'visibility', subtype: 'visibility' };
  if (/\braw(?:\s+format)?\b/i.test(text)) return { type: 'capture', subtype: 'raw' };
  if (/\b(?:iso\s*\d+|shutter(?:\s+speed)?|aperture|f\/?\d+(?:\.\d+)?|focal\s+length|white\s+balance|exposure\s+settings?|lens\s+characteristics?)\b/i.test(text)) return { type: 'capture', subtype: 'camera-setting' };
  if (/\b(?:hdr|high\s+dynamic\s+range|wide\s+dynamic\s+range)\b/i.test(text)) return { type: 'quality', subtype: 'dynamic-range' };
  if (/\b(?:8k|4k|ultra[-\s]?high\s+resolution|high\s+resolution|resolution)\b/i.test(text)) return { type: 'quality', subtype: 'resolution' };
  if (/\b(?:fine\s+detail|crisp\s+detail|sharp\s+detail|highly\s+detailed|micro[-\s]?detail|realistic\s+(?:skin|wood|surface|texture))\b/i.test(text)) return { type: 'quality', subtype: 'detail' };
  if (/\b(?:sharp\s+focus|precise\s+focus|well[-\s]?defined\s+focus)\b/i.test(text)) return { type: 'quality', subtype: 'focus' };
  if (/\b(?:clean\s+low[-\s]?noise|low[-\s]?noise\s+image\s+quality)\b/i.test(text)) return { type: 'quality', subtype: 'noise-control' };
  if (/\b(?:natural\s+(?:and\s+)?seamless\s+light[-\s]?shadow\s+transitions|tonal\s+harmony|natural\s+color\s+rendering)\b/i.test(text)) return { type: 'quality', subtype: 'tonal-color' };
  return { type: 'neutral', subtype: 'neutral' };
}

function classifyV386bTechnicalFixture_(value) {
  return classifyV386dTechnicalFixture_(value).type;
}

function testV386bPromptRoutingConfig() {
  Logger.log('App version：' + V3_APP_VERSION);
  Logger.log('Cross-Role Conflict：新增 flat lay ↔ over-the-shoulder 高信心衝突規則');
  Logger.log('Conflict behavior：沿用 Lock / Importance / Role priority；只影響本次 Prompt');
  Logger.log('Technical routing：visibility / quality / capture / neutral / avoid-defect');
  Logger.log('Rendering：不再使用通用 Finish with / Render with 包住所有 technical phrase');
  Logger.log('Builder de-dup：前文已有 framing 時不重複 focal hierarchy；已有 lighting 時不重複 lighting direction');
  Logger.log('Selected / Recipe / Sheet：不修改');
  Logger.log('Prompt Builder core：不重寫，只做 controlled routing / closing calibration');
  Logger.log('Data source：' + V3_SHEET_NAME);
}

function testV386bPromptRoutingFixtures() {
  const fixtures = [
    ['people and visible faces', 'visibility'],
    ['8K ultra-high resolution', 'quality'],
    ['RAW format preserving original detail', 'capture'],
    ['gore and violent content', 'avoid-defect']
  ];
  let pass = true;
  fixtures.forEach(function (fixture) {
    const actual = classifyV386bTechnicalFixture_(fixture[0]);
    const ok = actual === fixture[1];
    if (!ok) pass = false;
    Logger.log(fixture[0] + '：' + actual + ' / expected ' + fixture[1] + ' / ' + (ok ? 'PASS' : 'FAIL'));
  });
  const flatLay = /(?:flat\s*[- ]?lay|平鋪)/i.test('flat lay composition');
  const ots = /(?:over\s*[- ]?the\s*[- ]?shoulder|over\s+shoulder|越肩|肩後視角)/i.test('over-the-shoulder perspective');
  const crossOk = flatLay && ots;
  if (!crossOk) pass = false;
  Logger.log('flat lay ↔ over-the-shoulder fixture：' + (crossOk ? 'PASS' : 'FAIL'));
  Logger.log('Overall：' + (pass ? 'PASS' : 'FAIL'));
  Logger.log('Sheet write：NONE');
  if (!pass) throw new Error('V3.8-6b fixture FAIL');
}

/* =========================
   V3.8-6c Conflict Role Scope + Technical Avoid Coverage tests
   ========================= */
function testV386cConfig() {
  Logger.log('App version：' + V3_APP_VERSION);
  Logger.log('Conflict Role Scope：camera-angle / shot-scale / depth-of-field 限定 camera / composition / technical');
  Logger.log('Cross-Role flat lay ↔ over-the-shoulder：限定 camera / composition');
  Logger.log('Regression target：lighting bokeh 不再被景深規則誤判');
  Logger.log('Technical Avoid Coverage：text and watermarks / logos and watermarks / unwanted text / watermark(s)');
  Logger.log('Positive Guard / Data Entry / Element Quality Guard：共用高信心 Avoid 規則');
  Logger.log('Selected / Recipe / Sheet：不修改');
  Logger.log('Data source：' + V3_SHEET_NAME);
}

function testV386cFixtures() {
  let pass = true;

  const avoidFixtures = [
    'text and watermarks',
    'logos and watermarks',
    'unwanted text',
    'watermark'
  ];
  avoidFixtures.forEach(function (value) {
    const matched = V3_DATA_AUDIT_NEGATIVE_RULES.some(function (rule) {
      if (!rule || !rule.pattern) return false;
      rule.pattern.lastIndex = 0;
      return rule.pattern.test(value);
    });
    if (!matched) pass = false;
    Logger.log(value + '：' + (matched ? 'avoid-defect / PASS' : 'FAIL'));
  });

  const cameraScope = ['camera', 'composition', 'technical'];
  const flatOtsScope = ['camera', 'composition'];
  const lightingExcluded = cameraScope.indexOf('lighting') === -1;
  const cameraIncluded = cameraScope.indexOf('camera') !== -1;
  const flatCompositionIncluded = flatOtsScope.indexOf('composition') !== -1;
  const otsCameraIncluded = flatOtsScope.indexOf('camera') !== -1;

  Logger.log('depth-of-field role scope excludes lighting：' + (lightingExcluded ? 'PASS' : 'FAIL'));
  Logger.log('depth-of-field role scope keeps camera：' + (cameraIncluded ? 'PASS' : 'FAIL'));
  Logger.log('flat lay ↔ OTS role scope：' + (flatCompositionIncluded && otsCameraIncluded ? 'PASS' : 'FAIL'));

  if (!lightingExcluded || !cameraIncluded || !flatCompositionIncluded || !otsCameraIncluded) pass = false;

  const safeVisibility = classifyV386bTechnicalFixture_('people and visible faces') === 'visibility';
  const blockedWatermark = classifyV386bTechnicalFixture_('text and watermarks') === 'avoid-defect';
  Logger.log('6b visibility regression：' + (safeVisibility ? 'PASS' : 'FAIL'));
  Logger.log('6c text/watermark routing：' + (blockedWatermark ? 'avoid-defect / PASS' : 'FAIL'));
  if (!safeVisibility || !blockedWatermark) pass = false;

  Logger.log('Overall：' + (pass ? 'PASS' : 'FAIL'));
  Logger.log('Sheet write：NONE');
  if (!pass) throw new Error('V3.8-6c fixture FAIL');
}

/* =========================
   V3.8-6d1 Role Semantic Guard + Technical Quality Vocabulary tests
   ========================= */
function testV386d1Config() {
  Logger.log('App version：' + V3_APP_VERSION);
  Logger.log('Role Semantic Guard：Composition / Camera / Lighting 高信心 Role mismatch → Medium review');
  Logger.log('Collision-proof entry：evaluateV386dElementQuality / validateV386dElementEntryDraft');
  Logger.log('Legacy QualityGuard coexistence：允許舊 V3.8-6 檔存在，不再依賴同名函式載入順序');
  Logger.log('Role behavior：換一個 / 移除 / 仍使用；不自動刪除 selected');
  Logger.log('Technical Quality Vocabulary：dynamic-range / resolution / detail / focus / noise-control / tonal-color / RAW');
  Logger.log('HDR target：不再輸出 generic Apply HDR ... as a controlled technical directive');
  Logger.log('Data Entry Rules：新增 role-semantic-fit REVIEW gate');
  Logger.log('Selected / Recipe / Sheet：不修改');
  Logger.log('Data source：' + V3_SHEET_NAME);
}

function testV386d1Fixtures() {
  let pass = true;

  const semanticFixtures = [
    {
      name: 'composition content leakage',
      input: { role: 'composition', en: 'an elegant dessert still life of a macaron resting on delicate tissue paper' },
      expected: 'medium'
    },
    {
      name: 'safe composition control',
      input: { role: 'composition', en: 'rule of thirds composition with balanced negative space' },
      expected: 'none'
    },
    {
      name: 'lighting with valid shadow carrier',
      input: { role: 'lighting', en: 'crisp shadows across snowy ground' },
      expected: 'none'
    },
    {
      name: 'lighting scene leakage',
      input: { role: 'lighting', en: 'snowy ground beside a mountain lodge' },
      expected: 'medium'
    }
  ];

  semanticFixtures.forEach(function (fixture) {
    const result = evaluateV386dElementQuality(fixture.input);
    const actual = result.severity;
    const ok = actual === fixture.expected;
    if (!ok) pass = false;
    Logger.log(fixture.name + '：' + actual + ' / expected ' + fixture.expected + ' / ' + (ok ? 'PASS' : 'FAIL'));
  });

  const technicalFixtures = [
    ['HDR wide dynamic range', 'quality', 'dynamic-range'],
    ['8K ultra-high resolution', 'quality', 'resolution'],
    ['fine detail', 'quality', 'detail'],
    ['sharp focus', 'quality', 'focus'],
    ['RAW format preserving original detail', 'capture', 'raw'],
    ['people and visible faces', 'visibility', 'visibility'],
    ['text and watermarks', 'avoid-defect', 'avoid-defect']
  ];

  technicalFixtures.forEach(function (fixture) {
    const actual = classifyV386dTechnicalFixture_(fixture[0]);
    const ok = actual.type === fixture[1] && actual.subtype === fixture[2];
    if (!ok) pass = false;
    Logger.log(
      fixture[0] + '：' + actual.type + '/' + actual.subtype +
      ' / expected ' + fixture[1] + '/' + fixture[2] +
      ' / ' + (ok ? 'PASS' : 'FAIL')
    );
  });

  const entryReview = validateV386dElementEntryDraft({
    role: 'composition',
    ch: '馬卡龍甜點靜物',
    en: 'an elegant dessert still life of a macaron resting on delicate tissue paper'
  });
  const entryRoleCheck = (entryReview.checks || []).find(function (item) {
    return item.id === 'role-semantic-fit';
  });
  const entryOk = !!entryRoleCheck && entryRoleCheck.status === 'REVIEW';
  if (!entryOk) pass = false;
  Logger.log('Data Entry role-semantic-fit：' + (entryOk ? 'REVIEW / PASS' : 'FAIL'));

  Logger.log('Overall：' + (pass ? 'PASS' : 'FAIL'));
  Logger.log('Sheet write：NONE');
  if (!pass) throw new Error('V3.8-6d1 fixture FAIL');
}


/* =========================================================
   V3.9 — Elements_v4 Foundation
   Governed production semantic library (parallel to legacy v3_2)
   ========================================================= */
const V4_SHEET_NAME = 'Elements_v4';
const V4_SCHEMA_VERSION = '4.0';
const V4_HEADERS = [
  'element_id','schema_version','status','role','semantic_type','canonical_key','canonical_value',
  'display_label_zh','display_label_en','prompt_phrase','polarity','allowed_modes','importance_default',
  'compatibility_tags','conflict_tags','source_type','source_reference','review_status','review_reason',
  'reviewed_by','reviewed_at','created_at','updated_at','notes'
];
const V4_STATUS = ['CANDIDATE','REVIEW','APPROVED','DEPRECATED','REJECTED'];
const V4_POLARITY = ['positive','negative','neutral'];
const V4_MODES = ['IMAGE','VIDEO','IMAGE|VIDEO'];
const V4_IMPORTANCE = ['core','support','subtle'];
const V4_ROLE_DICTIONARY = {
  subject:{label:'主體', semanticTypes:['subject/entity','subject/object','subject/animal','subject/person','subject/plant','subject/food'], hint:'主要可辨識實體；避免夾帶動作、場景、光線或構圖。'},
  action:{label:'動作與狀態', semanticTypes:['action/action','action/pose','action/expression','action/state'], hint:'主體正在做什麼或呈現何種可見狀態。'},
  environment:{label:'場景', semanticTypes:['environment/place','environment/interior','environment/outdoor','environment/weather','environment/time-context'], hint:'主體存在的環境；避免夾帶鏡頭、構圖或光線實作。'},
  lighting:{label:'光線與氣候', semanticTypes:['lighting/direction','lighting/quality','lighting/pattern','lighting/source','lighting/exposure','lighting/atmosphere'], hint:'光如何作用於既有畫面；只保留必要的 light/shadow carrier。'},
  material:{label:'材質與觸感', semanticTypes:['material/material','material/texture','material/surface'], hint:'可見物體的材質、表面、質地。'},
  color:{label:'色彩', semanticTypes:['color/palette','color/temperature','color/tonal-range','color/accent'], hint:'色彩控制；不要把純 Mood 當 Color。'},
  composition:{label:'構圖', semanticTypes:['composition/placement','composition/framing','composition/balance','composition/negative-space','composition/layering','composition/geometry'], hint:'畫面元素如何安排；不得新增主體或場景內容。'},
  camera:{label:'鏡頭', semanticTypes:['camera/lens','camera/view-angle','camera/shot-scale','camera/perspective','camera/depth-of-field','camera/focus'], hint:'攝影機如何觀看畫面。'},
  motion:{label:'動態細節', semanticTypes:['motion/subject','motion/environment','motion/camera','motion/temporal'], hint:'影片或 still-frame 中的運動／時間特徵；避免重複 Action。'},
  technical:{label:'品質控制', semanticTypes:['quality/dynamic-range','quality/resolution','quality/detail','quality/focus','quality/noise-control','quality/tonal-color','capture/raw','capture/exposure','visibility/visibility','avoid-defect/avoid-defect'], hint:'成像、品質、capture、visibility 或 avoid-defect 技術控制。'}
};

function getV4FoundationManifest() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss ? ss.getSheetByName(V4_SHEET_NAME) : null;
  const rows = sheet ? Math.max(0, sheet.getLastRow() - 1) : 0;
  const stats = { CANDIDATE:0, REVIEW:0, APPROVED:0, DEPRECATED:0, REJECTED:0 };
  if (sheet && rows) {
    const values = sheet.getDataRange().getDisplayValues();
    const idx = buildHeaderIndex_(values[0].map(clean_));
    if (idx.status != null) values.slice(1).forEach(function(r){ const s=clean_(r[idx.status]).toUpperCase(); if(stats[s]!=null) stats[s]++; });
  }
  return {
    appVersion: V3_APP_VERSION, schemaVersion: V4_SCHEMA_VERSION, sheetName: V4_SHEET_NAME,
    exists: !!sheet, rowCount: rows, statusCounts: stats,
    productionSource: V3_SHEET_NAME, productionSourceUnchanged: true,
    roles: Object.keys(V4_ROLE_DICTIONARY).map(function(role){ return {role:role,label:V4_ROLE_DICTIONARY[role].label,semanticTypes:V4_ROLE_DICTIONARY[role].semanticTypes,hint:V4_ROLE_DICTIONARY[role].hint}; }),
    statuses: V4_STATUS, polarities: V4_POLARITY, modes: V4_MODES, importance: V4_IMPORTANCE
  };
}

function ensureElementsV4Sheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('找不到綁定的 Google 試算表。');
  let sheet = ss.getSheetByName(V4_SHEET_NAME);
  let created = false;
  if (!sheet) { sheet = ss.insertSheet(V4_SHEET_NAME); created = true; }
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1,1,1,V4_HEADERS.length).setValues([V4_HEADERS]);
    sheet.setFrozenRows(1);
    sheet.getRange(1,1,1,V4_HEADERS.length).setFontWeight('bold');
  } else {
    const headers = sheet.getRange(1,1,1,Math.max(sheet.getLastColumn(),V4_HEADERS.length)).getDisplayValues()[0].map(clean_);
    const missing = V4_HEADERS.filter(function(h){ return headers.indexOf(h) < 0; });
    if (missing.length) throw new Error('既有 Elements_v4 schema 不相容，缺少欄位：' + missing.join(', '));
  }
  SpreadsheetApp.flush();
  return {created:created,sheetName:V4_SHEET_NAME,headers:V4_HEADERS.slice(),productionSourceUnchanged:true};
}

function searchV4LegacyCandidates(params) {
  params = params || {};
  const q = clean_(params.query).toLowerCase();
  const role = clean_(params.role);
  const limit = clamp_(Number(params.limit)||80,10,150);
  const rows = readV3Rows_().filter(function(row){
    if(!isElementRow_(row)) return false;
    if(role && row.role !== role) return false;
    if(!q) return true;
    return [row.role,row.major,row.middle,row.minor,row.ch,row.en,row.tags].join(' ').toLowerCase().indexOf(q)>=0;
  }).slice(0,limit);
  return {items:rows.map(function(r){return {rowNumber:r.rowNumber,role:r.role,ch:r.ch,en:r.en,type:r.type,tags:r.tags,major:r.major,middle:r.middle,minor:r.minor,sourceReference:V3_SHEET_NAME+'!row:'+r.rowNumber};}), totalReturned:rows.length};
}

function suggestV4CandidateFromLegacy(legacy) {
  legacy = legacy || {};
  const role = V4_ROLE_DICTIONARY[clean_(legacy.role)] ? clean_(legacy.role) : 'subject';
  const en = clean_(legacy.en);
  const zh = clean_(legacy.ch);
  const canonical = normalizeV4Phrase_(en || zh);
  return {
    schema_version:V4_SCHEMA_VERSION,status:'CANDIDATE',role:role,
    semantic_type:guessV4SemanticType_(role,en+' '+zh),canonical_key:makeV4CanonicalKey_(canonical),canonical_value:canonical,
    display_label_zh:zh,display_label_en:en,prompt_phrase:canonical,
    polarity:guessV4Polarity_(role,en+' '+zh),allowed_modes:normalizeV4Mode_(legacy.type),importance_default:'support',
    compatibility_tags:clean_(legacy.tags),conflict_tags:'',source_type:'legacy-promotion',source_reference:clean_(legacy.sourceReference)||'',notes:''
  };
}

function validateV4ElementDraft(draft) {
  const skipDuplicate = !!(draft && draft.__skip_duplicate);
  draft = normalizeV4Draft_(draft || {});
  const checks = [];
  function add(status,id,message){ checks.push({status:status,id:id,message:message}); }
  if(!V4_ROLE_DICTIONARY[draft.role]) add('FAIL','schema-role','role 必須是受控 Role'); else add('PASS','schema-role','Role 合法：'+draft.role);
  if(!draft.canonical_value) add('FAIL','canonical-value','canonical_value 不可空白'); else add('PASS','canonical-value','Canonical value 已提供');
  if(!draft.prompt_phrase) add('FAIL','prompt-phrase','prompt_phrase 不可空白'); else add('PASS','prompt-phrase','Prompt phrase 已提供');
  if(V4_POLARITY.indexOf(draft.polarity)<0) add('FAIL','polarity','polarity 不合法'); else add('PASS','polarity','Polarity：'+draft.polarity);
  if(V4_MODES.indexOf(draft.allowed_modes)<0) add('FAIL','mode','allowed_modes 不合法'); else add('PASS','mode','Mode：'+draft.allowed_modes);
  const dict=V4_ROLE_DICTIONARY[draft.role];
  if(dict && dict.semanticTypes.indexOf(draft.semantic_type)<0) add('REVIEW','semantic-type','semantic_type 不在此 Role 的受控清單'); else if(dict) add('PASS','semantic-type','Semantic type 合法');
  const roleFit=evaluateV4RoleSemanticFit_(draft); add(roleFit.status,'role-semantic-fit',roleFit.message);
  const atomic=evaluateV4Atomicity_(draft); add(atomic.status,'atomicity',atomic.message);
  const wording=evaluateV4Wording_(draft); add(wording.status,'wording',wording.message);
  const duplicate=skipDuplicate?{status:'PASS',message:'測試模式：略過重複資料檢查。'}:detectV4Duplicate_(draft); add(duplicate.status,'duplicate',duplicate.message);
  const polarity=evaluateV4PolarityConsistency_(draft); add(polarity.status,'polarity-consistency',polarity.message);
  const hasFail=checks.some(function(c){return c.status==='FAIL';});
  const hasReview=checks.some(function(c){return c.status==='REVIEW';});
  return {appVersion:V3_APP_VERSION,schemaVersion:V4_SCHEMA_VERSION,overall:hasFail?'FAIL':(hasReview?'REVIEW':'PASS'),checks:checks,draft:draft,productionSourceUnchanged:true};
}

function saveV4Candidate(draft) { const v=validateV4ElementDraft(draft); return writeV4Element_(draft, v.overall==='REVIEW'?'REVIEW':'CANDIDATE', v); }
function approveV4Element(draft) {
  const validation=validateV4ElementDraft(draft);
  if(validation.overall==='FAIL') throw new Error('V4 入庫驗證未通過，禁止核准。');
  if(validation.overall==='REVIEW' && clean_(draft.review_override).toUpperCase()!=='APPROVE') throw new Error('V4 入庫驗證仍有「待審核」項目；請人工確認後勾選「我已人工確認待審核項目」。');
  return writeV4Element_(draft,'APPROVED',validation);
}

function listElementsV4(params) {
  params=params||{}; const sheet=getV4Sheet_(false); if(!sheet) return {items:[],total:0};
  const values=sheet.getDataRange().getDisplayValues(); if(values.length<2) return {items:[],total:0};
  const idx=buildHeaderIndex_(values[0].map(clean_)); const status=clean_(params.status).toUpperCase(); const q=clean_(params.query).toLowerCase();
  const items=values.slice(1).map(function(r,i){const o={rowNumber:i+2};V4_HEADERS.forEach(function(h){o[h]=idx[h]==null?'':clean_(r[idx[h]]);});return o;}).filter(function(o){
    if(status&&o.status!==status)return false; if(q&&[o.display_label_zh,o.display_label_en,o.canonical_value,o.canonical_key,o.role,o.semantic_type].join(' ').toLowerCase().indexOf(q)<0)return false; return true;
  });
  return {items:items.slice(0,Number(params.limit)||200),total:items.length};
}

function writeV4Element_(draft,status,validation) {
  const setup=ensureElementsV4Sheet();
  const sheet=getV4Sheet_(true); draft=normalizeV4Draft_(draft||{}); draft.status=status;
  if(!validation) validation=validateV4ElementDraft(draft);
  if(validation.overall==='FAIL') throw new Error('V4 入庫驗證未通過：' + validation.checks.filter(function(c){return c.status==='FAIL';}).map(function(c){return c.id;}).join(', '));
  const now=new Date(); const email=(Session.getActiveUser()&&Session.getActiveUser().getEmail())||'';
  const row={}; V4_HEADERS.forEach(function(h){row[h]='';});
  Object.keys(draft).forEach(function(k){if(row.hasOwnProperty(k))row[k]=draft[k];});
  row.element_id=clean_(draft.element_id)||nextV4ElementId_(draft.role,sheet);
  row.schema_version=V4_SCHEMA_VERSION; row.status=status; row.canonical_key=clean_(draft.canonical_key)||makeV4CanonicalKey_(draft.canonical_value||draft.prompt_phrase);
  row.review_status=status==='APPROVED'?'APPROVED':(validation.overall==='REVIEW'?'REVIEW':'PENDING');
  row.review_reason=validation.checks.filter(function(c){return c.status!=='PASS';}).map(function(c){return c.id}).join('|');
  row.reviewed_by=status==='APPROVED'?email:''; row.reviewed_at=status==='APPROVED'?now:''; row.created_at=now; row.updated_at=now;
  // Canonical duplicate is never silently appended.
  const dup=findV4CanonicalKey_(row.canonical_key,sheet); if(dup) throw new Error('標準識別鍵 canonical_key 已存在：'+row.canonical_key+'（Elements_v4 第 '+dup+' 列）');
  sheet.appendRow(V4_HEADERS.map(function(h){return row[h];})); SpreadsheetApp.flush();
  return {saved:true,status:status,elementId:row.element_id,canonicalKey:row.canonical_key,rowNumber:sheet.getLastRow(),validation:validation,productionSourceUnchanged:true};
}

function getV4Sheet_(required){const ss=SpreadsheetApp.getActiveSpreadsheet();const s=ss&&ss.getSheetByName(V4_SHEET_NAME);if(required&&!s)throw new Error('找不到 '+V4_SHEET_NAME);return s;}
function normalizeV4Draft_(d){
  const out={};V4_HEADERS.forEach(function(h){out[h]=clean_(d[h]);});
  out.role=clean_(d.role); out.semantic_type=clean_(d.semantic_type)||guessV4SemanticType_(out.role,[d.prompt_phrase,d.canonical_value,d.display_label_en,d.display_label_zh].join(' '));
  out.canonical_value=normalizeV4Phrase_(d.canonical_value||d.prompt_phrase||d.display_label_en||d.display_label_zh); out.prompt_phrase=normalizeV4Phrase_(d.prompt_phrase||out.canonical_value);
  out.canonical_key=clean_(d.canonical_key)||makeV4CanonicalKey_(out.canonical_value); out.polarity=clean_(d.polarity).toLowerCase()||guessV4Polarity_(out.role,out.prompt_phrase);
  out.allowed_modes=clean_(d.allowed_modes)||'IMAGE|VIDEO'; out.importance_default=clean_(d.importance_default)||'support'; out.source_type=clean_(d.source_type)||'new-entry';
  out.review_override=clean_(d.review_override); return out;
}
function normalizeV4Phrase_(s){return clean_(s).replace(/^[\s,.;:]+|[\s,.;:]+$/g,'').replace(/\s+/g,' ');}
function makeV4CanonicalKey_(s){return normalizeV4Phrase_(s).toLowerCase().replace(/['’]/g,'').replace(/[^a-z0-9\u4e00-\u9fff]+/g,'_').replace(/^_+|_+$/g,'').slice(0,96);}
function normalizeV4Mode_(s){s=clean_(s).toLowerCase();if(/影片|video/.test(s)&&!/圖片|image/.test(s))return'VIDEO';if(/圖片|image/.test(s)&&!/影片|video/.test(s))return'IMAGE';return'IMAGE|VIDEO';}
function guessV4Polarity_(role,text){if(role==='technical'&&/\b(?:avoid|without|unwanted|no\s+|watermark|distorted|broken|excessive)\b/i.test(text))return'negative';return'positive';}
function guessV4SemanticType_(role,text){text=clean_(text);if(role==='technical'){if(/HDR|dynamic\s+range/i.test(text))return'quality/dynamic-range';if(/8K|resolution/i.test(text))return'quality/resolution';if(/RAW/i.test(text))return'capture/raw';if(/long\s+exposure|exposure/i.test(text))return'capture/exposure';if(/focus/i.test(text))return'quality/focus';if(/detail/i.test(text))return'quality/detail';if(/noise/i.test(text))return'quality/noise-control';if(/people|faces?|visible/i.test(text))return'visibility/visibility';if(/avoid|unwanted|watermark|distort|broken/i.test(text))return'avoid-defect/avoid-defect';return'quality/detail';}const d=V4_ROLE_DICTIONARY[role];return d?d.semanticTypes[0]:'';}
function evaluateV4RoleSemanticFit_(d){
  const t=[d.canonical_value,d.prompt_phrase,d.display_label_en,d.display_label_zh].join(' '); const role=d.role;
  const narrative=/\b(?:featuring|depicting|showing|portrait\s+of|scene\s+of|sitting\s+on|standing\s+in|lying\s+on|holding\s+(?:a|an|the))\b/i;
  if(role==='composition'&&narrative.test(t)&&!/(composition|framing|layout|negative\s+space|symmetr|leading\s+lines|centered|off[-\s]?center)/i.test(t))return{status:'REVIEW',message:'Composition 疑似混入主體／場景敘事。'};
  if(role==='camera'&&narrative.test(t)&&!/(camera|lens|shot|view|angle|perspective|close[-\s]?up|telephoto|overhead|depth\s+of\s+field|focus)/i.test(t))return{status:'REVIEW',message:'Camera 疑似混入內容敘事。'};
  if(role==='lighting'&&/(room|forest|beach|street|garden|table|chair|plant|hotel|office|cafe)/i.test(t)&&!/(light|lighting|lit|shadow|glow|sunlight|backlight|rim\s+light|illumination|exposure|highlight)/i.test(t))return{status:'REVIEW',message:'Lighting 缺少明確光線 carrier，較像 Scene。'};
  if(role==='subject'&&/\b(?:walking|running|sitting|standing|lying|holding|smiling|looking|kneading)\b/i.test(t))return{status:'REVIEW',message:'Subject 夾帶 Action / State；建議拆分。'};
  return{status:'PASS',message:'Role semantic fit 未發現高信心 mismatch。'};
}
function evaluateV4Atomicity_(d){
  const t=[d.canonical_value,d.prompt_phrase].join(' '); let signals=0; const found=[];
  const rules=[['action',/\b(?:walking|running|sitting|standing|lying|holding|smiling|looking|kneading|resting)\b/i],['scene',/\b(?:in|inside|within|beside|near|on)\s+(?:a|an|the)\s+\w+/i],['lighting',/\b(?:lighting|light|shadow|backlit|sunlight|glow)\b/i],['camera',/\b(?:lens|camera|close[-\s]?up|wide[-\s]?angle|telephoto|overhead)\b/i],['composition',/\b(?:composition|framing|negative\s+space|rule\s+of\s+thirds)\b/i]];
  rules.forEach(function(r){if(r[1].test(t)){signals++;found.push(r[0]);}});
  const wordCount=t.trim()?t.trim().split(/\s+/).length:0;
  if(signals>=3||wordCount>18)return{status:'REVIEW',message:'可能包含多個可獨立控制的語意：'+found.join(', ')+'；建議拆分。'};
  if(wordCount>12&&signals>=2)return{status:'REVIEW',message:'語句偏複合，請確認 atomicity。'};
  return{status:'PASS',message:'Atomicity 未發現明顯複合語意。'};
}
function evaluateV4Wording_(d){const t=d.prompt_phrase||'';if(!t)return{status:'FAIL',message:'缺少「提示詞片語 prompt_phrase」。'};if(/[.!?]\s*$/.test(t))return{status:'REVIEW',message:'元素應使用簡短的標準片語，不建議寫成帶句尾標點的完整句子。'};if(/\b(?:masterpiece|best\s+quality|as\s+a\s+controlled\s+technical\s+directive)\b/i.test(t))return{status:'REVIEW',message:'含不建議的提示詞工程填充語或泛用技術指令。'};return{status:'PASS',message:'文字格式符合「可組裝元素」原則。'};}
function evaluateV4PolarityConsistency_(d){const t=d.prompt_phrase||'';const avoid=/\b(?:avoid|without|unwanted|no\s+|watermarks?|distorted|broken|excessive)\b/i.test(t);if(d.polarity==='positive'&&avoid)return{status:'REVIEW',message:'正向元素中出現「避免／瑕疵」語意，請確認正負向設定。'};if(d.polarity==='negative'&&!avoid&&d.semantic_type!=='avoid-defect/avoid-defect')return{status:'REVIEW',message:'設定為負向／避免，但文字本身沒有明確的避免語意。'};return{status:'PASS',message:'正負向設定與文字語意方向一致。'};}
function detectV4Duplicate_(d){const sheet=getV4Sheet_(false);if(!sheet||sheet.getLastRow()<2)return{status:'PASS',message:'Elements_v4 目前沒有其他資料可供重複比對。'};const values=sheet.getDataRange().getDisplayValues(),idx=buildHeaderIndex_(values[0].map(clean_)),key=d.canonical_key||makeV4CanonicalKey_(d.canonical_value);let exact=null,canon=null;values.slice(1).some(function(r,i){if(idx.canonical_key!=null&&clean_(r[idx.canonical_key])===key){exact=i+2;return true;}if(idx.canonical_value!=null&&normalizeV4Phrase_(r[idx.canonical_value]).toLowerCase()===normalizeV4Phrase_(d.canonical_value).toLowerCase()){canon=i+2;return true;}return false;});if(exact)return{status:'FAIL',message:'已存在相同「標準識別鍵 canonical_key」：Elements_v4 第 '+exact+' 列'};if(canon)return{status:'REVIEW',message:'已存在相同「標準語意值 canonical_value」：Elements_v4 第 '+canon+' 列'};return{status:'PASS',message:'未發現相同的標準識別鍵或標準語意值。'};}
function findV4CanonicalKey_(key,sheet){if(!key||sheet.getLastRow()<2)return null;const values=sheet.getDataRange().getDisplayValues(),idx=buildHeaderIndex_(values[0].map(clean_));for(let i=1;i<values.length;i++)if(clean_(values[i][idx.canonical_key])===key)return i+1;return null;}
function nextV4ElementId_(role,sheet){const prefix='EL4_'+String(role||'GEN').toUpperCase()+'_';let max=0;if(sheet.getLastRow()>1){const vals=sheet.getRange(2,1,sheet.getLastRow()-1,1).getDisplayValues();vals.forEach(function(r){const m=String(r[0]||'').match(/_(\d+)$/);if(m)max=Math.max(max,Number(m[1]));});}return prefix+String(max+1).padStart(6,'0');}


function testV391TraditionalChineseUiConfig(){
  Logger.log('App version：'+V3_APP_VERSION);
  Logger.log('UI language：繁體中文優先');
  Logger.log('Schema / enum / canonical keys：UNCHANGED');
  Logger.log('Production source：'+V3_SHEET_NAME+'（UNCHANGED）');
  Logger.log('Elements_v4 schema：'+V4_SCHEMA_VERSION);
  Logger.log('Sheet write：NONE');
}

function testV39FoundationConfig(){
  Logger.log('App version：'+V3_APP_VERSION);Logger.log('V4 schema：'+V4_SCHEMA_VERSION);Logger.log('V4 sheet：'+V4_SHEET_NAME);
  Logger.log('Production source：'+V3_SHEET_NAME+'（UNCHANGED）');Logger.log('V4 roles：'+Object.keys(V4_ROLE_DICTIONARY).length);Logger.log('Admission gates：schema / role-semantic-fit / atomicity / wording / polarity / duplicate');Logger.log('Sheet write：only explicit Save / Approve');
}
function testV39FoundationFixtures(){
  const fixtures=[
    {name:'atomic subject',d:{__skip_duplicate:true,role:'subject',semantic_type:'subject/animal',canonical_value:'golden retriever',prompt_phrase:'golden retriever',polarity:'positive',allowed_modes:'IMAGE|VIDEO'},expected:'PASS'},
    {name:'subject leaks action',d:{__skip_duplicate:true,role:'subject',semantic_type:'subject/animal',canonical_value:'golden retriever lying on a sofa',prompt_phrase:'golden retriever lying on a sofa',polarity:'positive',allowed_modes:'IMAGE'},expected:'REVIEW'},
    {name:'composition content leakage',d:{__skip_duplicate:true,role:'composition',semantic_type:'composition/placement',canonical_value:'a koala sitting on a table',prompt_phrase:'a koala sitting on a table',polarity:'positive',allowed_modes:'IMAGE'},expected:'REVIEW'},
    {name:'lighting carrier',d:{__skip_duplicate:true,role:'lighting',semantic_type:'lighting/pattern',canonical_value:'slatted shadows from window blinds',prompt_phrase:'slatted shadows from window blinds',polarity:'positive',allowed_modes:'IMAGE'},expected:'PASS'},
    {name:'positive avoid leakage',d:{__skip_duplicate:true,role:'technical',semantic_type:'avoid-defect/avoid-defect',canonical_value:'unwanted logos',prompt_phrase:'unwanted logos',polarity:'positive',allowed_modes:'IMAGE'},expected:'REVIEW'}
  ];
  let pass=true;fixtures.forEach(function(f){const v=validateV4ElementDraft(f.d);const ok=v.overall===f.expected;Logger.log(f.name+'：'+v.overall+' / expected '+f.expected+' / '+(ok?'PASS':'FAIL'));if(!ok)pass=false;});Logger.log('Overall：'+(pass?'PASS':'FAIL'));Logger.log('Sheet write：NONE');if(!pass)throw new Error('V3.9 Foundation fixture FAIL');
}


