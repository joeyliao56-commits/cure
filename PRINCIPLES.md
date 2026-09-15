# 療癒產生器 — 架構原則（PRINCIPLES）

> 本文件只記錄「為什麼」與「規則」，不記錄檔案清單、函式清單、版本異動細節。
> 那些用 `git log`、`git blame`、`grep -rn "^function" *.gs *.html` 即時取得。
> 每次架構有根本性改變才更新本文件；日常異動寫進 commit message 或對應的 GitHub Issue。

---

## 0. 最重要的一句話

> 整個 V4 架構的核心不是「生成很多元素」，而是建立一個**可以長期治理、可以組裝、可以被 UI 控制、可以被 AI 安全補充、可以逐步取代舊 V3 語意混雜資料**的元素庫。

優先順序永遠是：

```text
語意清楚 > Dimension 正確 > 可組裝 > 可治理 > 數量
```

target_count 是目標上限，不是 KPI。AI 不得為了湊數加入同義詞、近義詞、微小 wording 變體、跨 Dimension 項目、低價值候選。

---

## 1. 資料流（核心架構，很少變動）

```text
Roadmap
→ UI 選 Batch
→ 自動查 Elements_v4 既有資料（排除已存在，避免重複生成）
→ 自動產生 Dimension-aware AI Prompt
→ AI 回傳固定 V4 JSON
→ Batch Import
→ Admission Gates
→ Elements_v4
```


兩條資料源並存，不可混淆：

- `Elements_v3_2`：舊 production source，**保留、不動**
- `Elements_v4`：新的語意化、可治理元素庫，**所有新資料的目的地**

不直接把 AI 輸出視為可信資料——一切都要過 Admission Gates。

---

## 2. 分類架構：Role → Entity → Dimension → Element

- **Role**：元素在 Prompt 中扮演的功能（subject / action / environment / lighting / camera / composition / color / material / motion / technical...）
- **Entity**：元素主要適用的實體／內容範圍（cat / dog / flower / any...）。`any` 代表跨主體通用（camera、lighting、composition、technical 通常是 entity:any）
- **Dimension**：使用者在同一組選項中要回答的「同一個選擇問題」（breed、coat-color、coat-pattern...）

**命名鐵律：Entity 與 Dimension 必須分離。**

```text
不要：cat-breed、dog-coat-color（把 entity 和 dimension 黏在一起）
要： entity:cat + dimension:breed（分開表達）
```

**目前承載方式**：透過 `compatibility_tags` 字串欄位承載，例如 `entity:cat,dimension:breed`。**不是** Array。

**目前刻意不做**：新增正式的 `entity` / `dimension` 欄位到 Elements_v4 schema。等資料與 UI 穩定後才評估要不要升 V4.1 schema 正式收編。**現在不要提前做。**

entity_tag 的分類邊界，長期原則是**直接對齊真實候選資料的分類體系**（例如依 CSV 的「小類」劃分），而不是憑經驗／常識法設計——第一輪憑經驗設計過一次，跟真實資料比對後發現分類邊界和資料量都對不上，整批作廢重做。這是個踩過的坑，之後擴充 entity 前務必先比對真實候選資料，不要再犯。

---

## 3. Schema 與欄位紀律

Elements_v4 目前正式欄位（schema_version 4.0）：element_id、status、role、semantic_type、canonical_key、canonical_value、display_label_zh/en、prompt_phrase、polarity、allowed_modes、importance_default、compatibility_tags、conflict_tags、source_type、source_reference、review_status、review_reason、reviewed_by、reviewed_at、created_at、updated_at、notes。

**AI 產出的 JSON 禁止新增欄位**（尤其是 entity / entity_tag / dimension / dimension_zh / scope / target_count 這些——這些是 Roadmap／Index 的管理欄位，不是 element 本身的欄位，AI 曾經自行加過，Prompt 已修正禁止）。

`compatibility_tags` 與 `conflict_tags` **都是字串，不是 Array**。沒有衝突就是空字串 `""`，不要用 JSON 陣列。同一 Dimension 不代表一定互相 conflict——單選／多選邏輯是 UI 的事，不是 conflict_tags 的事。

`canonical_value` 建議避免裸名稱歧義（`Persian cat` 優於 `Persian`），但如果正式名稱本身已包含實體詞就不要疊加（`Norwegian Forest Cat`，不要再加 `cat`）。

---

## 4. Status 狀態機

```text
CANDIDATE / REVIEW → APPROVED
CANDIDATE / REVIEW → REJECTED
APPROVED → DEPRECATED
```

狀態更新**只准**改：status、review_status、reviewed_by、reviewed_at、updated_at。

**絕對不可以**藉由「核准」這個動作偷偷順便改掉 canonical_value / prompt_phrase / semantic_type——核准是狀態轉換，不是編輯的機會。

---

## 5. Admission Gates（資料的守門邏輯）

判定邏輯：

```text
任一 FAIL → FAIL
無 FAIL 但有 REVIEW → REVIEW
全部 PASS → PASS
```

Duplicate Gate 目前只做 **exact match**（canonical_key 完全相同、canonical_value normalize 後完全相同），**不是語意相似度比對**。這代表「soft side lighting」和「gentle lateral illumination」這種語意重疊但字面不同的東西會被放行——跨批次的語意重疊仍然需要 Existing Exclusion Prompt + 人工治理來擋，Gate 本身擋不住。

`writeV4Element_` 是寫入前的最後硬防線：即使前面驗證都過了，相同 canonical_key 仍然禁止 append。

**Existing Exclusion 的設計哲學**：Dimension Helper 查詢時，CANDIDATE / REVIEW / APPROVED / DEPRECATED / REJECTED **全部視為已存在**並排除，不是只排除 APPROVED。原因是 Prompt exclusion policy 必須等於 database duplicate policy——如果只排除 APPROVED，AI 可能重新生成一個之前被 REJECTED 的 canonical，最後還是會被 duplicate gate 擋掉，等於白做工。

Helper 查詢是 **fail-closed**：如果 Helper 不存在／server error／schema error，或是命中 1000 筆截斷上限（truncated），Index 必須**停止產生 Prompt、不複製、顯示錯誤**，絕不能偷偷退回一個沒有排除清單的舊 Prompt——寧可什麼都不做，也不能生成品質不可信的資料。

---

## 6. 已知限制（目前後端做不到、只能靠 Prompt + 人工的地方）

- **沒有 Dimension Gate**：後端目前不會硬性要求 `compatibility_tags` 一定要有 `entity:` 和 `dimension:`，只靠 Prompt 要求 AI 這樣寫，沒有後端強制檢查。**這是目前最優先要補的後端功能**（見下方優先順序）。
- **沒有 semantic near-duplicate 偵測**：沒有 embedding／語意相似度比對，仍需人工。
- **沒有 conflict taxonomy**：conflict_tags 目前沒有正式 vocabulary，AI 對明顯先天衝突（例如同一物種的互斥品種特徵）有時仍會漏標，建議只標高信心衝突，不要為了完整性硬建一套龐大 taxonomy。
- **沒有 importance distribution gate**：Prompt 要求 core/support/subtle 不要整批一樣，但後端不強制檢查分布，仍需人工抽查。
- **display_label 空值不是硬 FAIL**：Prompt 有要求，後端目前寬容處理。

---

## 7. 手機 UX 原則（所有新功能都要照這個設計）

使用者主要用手機操作，任何新功能的設計優先序：

```text
少打字、少長按、少選取長文字、少上下捲動、一鍵複製、狀態清楚
```

技術上優先考慮：Accordion（手機上主要區塊預設收合、同層一次只展開一個、記住上次展開位置）、大按鈕、Roadmap 下拉選單、自動帶值、自動複製、系統產生結果後自動展開對應區塊。

版本號只有單一來源（Code.gs 的 `V3_APP_VERSION` 常數），Index 不應自己維護獨立版本號——曾經因為 Index 換了新版但版本號沒同步更新，導致畫面顯示舊版本號誤導判斷，這是踩過的坑。

---

## 8. 絕對不要做的事

```text
不要全量搬 Elements_v3_2 的資料進 Elements_v4（那是舊語意混雜資料，V4 的存在意義就是不重蹈覆轍）
不要讓 AI 直接自動 APPROVE 全部（Admission Gates 的存在意義就是不信任 AI 輸出）
不要移除或放寬 admission gates，即使因為 false positive 太多也不行——先修規則本身，不要繞過
不要為了湊 target_count 塞低價值候選
不要把 compatibility_tags / conflict_tags 改成 Array
不要讓 Prompt Helper 繞過 Batch Import 直接寫入
不要提前把 entity/dimension 升格為正式 schema 欄位（除非資料與 UI 已經穩定，且真的評估要升 V4.1）
不要用「cat-breed」這種黏在一起的 dimension 命名法
```

---

## 9. 目前推薦開發優先順序

```text
1. 用 Roadmap 實際生成幾批 Dimension-aware 資料，驗證品質與 Admission Gates 通過率
2. 觀察 Existing Exclusion 實際效果
3. 【下一個核心後端功能】Dimension Gate：
   強制 ai-authored（或明確 Dimension-aware 新資料）的 compatibility_tags
   必須同時有 entity: 和 dimension:，值不可為空、tag 必須是字串；
   batch level 可再檢查同批 role / semantic_type / entity / dimension 是否一致。
   不可破壞 legacy-promotion 的既有路徑。
4. 正式設計 V4 Prompt Builder 的 Selection UI（Role → Entity → Dimension → Elements 的階層式選擇，
   選取規則要用 per-Dimension，例如 subject/breed → max 1、subject/coat-color → max 1，
   不能再像舊 V3 那樣只用 Role 層級的 single:true 控制，因為同一 subject 底下
   breed / coat-color / coat-pattern / coat-structure 這幾個 dimension 可以同時各選一個）
5. 評估是否升 V4.1 schema（正式收編 entity/dimension 欄位）
```

目前最大的技術債是：候選 CSV（13,799 筆）是複合短語（例如「銀色西施犬鬍鬚」＝品種＋毛色＋部位黏在一起），沒有自動化流程把它拆解成乾淨的單一維度值餵給 Elements_v4，只能靠 AI Batch Prompt Helper 即時生成。這份 CSV 目前只能拿來估算「這類別大概有多少料、值不值得開 batch」，不能直接匯入。這件事排在 Dimension Gate 之後、Selection UI 之前，視情況決定是否排入開發排程（屬於中大型新功能）。

---

## 10. Elements_v3_2 → Elements_v4 過渡期策略

目前專案處於**兩套資料源並存**的過渡期，這不是設計失誤，是刻意的漸進式切換策略：

```text
現在：
  Elements_v3_2 ← 正式產品仍在用，QualityGuard（V3.8-6d1 沿用至今）在這裡跑全套語意品質檢查
  Elements_v4   ← 平行建置中，用 Admission Gates 把關，逐步累積語意乾淨的新資料

切換時機（量化標準）：
  251 個 Roadmap batch 全部跑過一輪之後

切換方式：
  Elements_v4 完全取代 Elements_v3_2，V3_2 之後正式退場
```

**這代表幾件事**：

- QualityGuard（`evaluateV386dElementQuality` / `validateV386dElementEntryDraft`）不是可以晾著不管的舊系統，而是**只讀 Elements_v3_2**、專門給正式產品把關的驗證邏輯，跟 Elements_v4 的 Admission Gates（`validateV4ElementDraft`）是兩條平行運作、互不影響的驗證線。
- QualityGuard 裡的 `getV386dRoleSemanticRisk_`（判斷 composition/camera/lighting 的內容是不是誤把場景描述當成控制參數）跟 V4 那邊的 `evaluateV4RoleSemanticFit_` 概念高度相似，未來合併/切換時，V4 的驗證強度應該至少要對齊 QualityGuard 現有的檢查項目（負面語意偵測、role-semantic-fit、color-mood 風險、conflict alias 偵測），不要退步。
- 在切換發生之前，**不要提前把 Elements_v3_2 停用或砍掉**，兩邊都要維持運作。
- 251 個 batch 全部跑完，只是「切換的必要條件」，不等於「切換的充分條件」——實際執行切換前，仍建議先確認 Elements_v4 的資料品質（尤其是 Dimension Gate 上線後、Selection UI 可用之後）足以撐起正式產品，而不是筆數一到就自動切換。
