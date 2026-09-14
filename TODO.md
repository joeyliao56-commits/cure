待辦事項（建議逐條建成 GitHub Issues）
這份清單是從 V3.9.5 交接文件整理出來的目前已知待辦。
建議做法：把下面每一條貼成一個 GitHub Issue（標題已經準備好，內文直接貼「內容」段落），
貼完就可以把這份 TODO.md 刪掉或清空——之後待辦狀態全部交給 Issues 的 open/closed 管理，
不用再手動維護這份文件。

Issue 1：Dimension Gate（最優先，下一個核心後端功能）
標題：feat: 新增 Dimension Gate — 強制 ai-authored 資料的 compatibility_tags 需含 entity/dimension

Label 建議：priority-high、backend

內容：

後端目前不會硬性要求 compatibility_tags 一定要有 entity: 和 dimension:，只靠 Prompt 要求 AI 這樣寫，沒有強制檢查（見 PRINCIPLES.md §6、§9）。

需要新增的檢查（只針對 ai-authored，或明確 Dimension-aware 的新資料，不可影響 legacy-promotion 路徑）：

compatibility_tags 必須同時包含 entity: 和 dimension:
entity 不可為空
dimension 不可為空
tag 必須是字串（不是 Array）
Batch level 可再加：同一批的 role / semantic_type / entity / dimension 是否一致。

驗收標準：跑一批缺 entity/dimension tag 的假資料，應該被擋在 Admission Gates（FAIL 或 REVIEW，視設計），而 legacy-promotion 的既有流程不受影響。

Issue 2：複合短語 CSV 轉換流程（技術債，中大型工作）
標題：feat: 設計候選 CSV 複合短語拆解流程

Label 建議：tech-debt、needs-design

內容：

13,799 筆候選元素 CSV（_療癒產生器_V3_TEST_csv_的副本.csv）裡的資料是複合短語（例如「銀色西施犬鬍鬚」＝品種＋毛色＋部位黏在一起），不能直接當成單一 dimension 值匯入 Elements_v4。目前只能拿來估算「這類別大概有多少料」，實際生成仍靠 AI Batch Prompt Helper 即時產生，這份 CSV 完全沒被自動化利用到。

需要設計：把複合短語拆解成乾淨的單一維度值（role/entity/dimension/value 結構化），再過 Admission Gates 的流程。可以先在資料量最大的類別（dog、flower）上做小規模實驗，驗證拆解品質，再決定要不要投入完整開發。

排序：排在 Dimension Gate（Issue 1）之後，Selection UI（Issue 4）之前，視情況決定是否排入開發排程。

Issue 3：植物類中小型 entity 的 target_count 偏低，待手動校準
標題：chore: 植物類中小型 entity target_count 待實測後手動微調

Label 建議：data-quality、low-priority

內容：

觀葉植物、多肉仙人掌、蕨類苔蘚、禾草竹類、藤本、食蟲植物這幾個 entity 的 target_count 都被壓在 9-12 之間（跟樹木灌木的 56 差距懸殊），是固定比例公式（target_sum = round(原始筆數 × 6%)，最低 8）的副作用，不代表這些類別本身沒有潛力，只是計算公式偏保守。

待辦：做過幾個 batch、實際看到生成品質後，再回頭手動調高這幾個類別的 target_count。目前這批數字主觀性較高，不是精確計算的結果，接手的人看到這些數字偏低時不用意外。

Issue 4：海洋無脊椎／昆蟲與節肢動物／魚類尚未建立 Roadmap
標題：decision: 海洋無脊椎/昆蟲/魚類（合計33筆）是否合併或不做
待辦事項（建議逐條建成 GitHub Issues）
這份清單是從 V3.9.5 交接文件整理出來的目前已知待辦。
建議做法：把下面每一條貼成一個 GitHub Issue（標題已經準備好，內文直接貼「內容」段落），
貼完就可以把這份 TODO.md 刪掉或清空——之後待辦狀態全部交給 Issues 的 open/closed 管理，
不用再手動維護這份文件。

Issue 1：Dimension Gate（最優先，下一個核心後端功能）
標題：feat: 新增 Dimension Gate — 強制 ai-authored 資料的 compatibility_tags 需含 entity/dimension

Label 建議：priority-high、backend

內容：

後端目前不會硬性要求 compatibility_tags 一定要有 entity: 和 dimension:，只靠 Prompt 要求 AI 這樣寫，沒有強制檢查（見 PRINCIPLES.md §6、§9）。

需要新增的檢查（只針對 ai-authored，或明確 Dimension-aware 的新資料，不可影響 legacy-promotion 路徑）：

compatibility_tags 必須同時包含 entity: 和 dimension:
entity 不可為空
dimension 不可為空
tag 必須是字串（不是 Array）
Batch level 可再加：同一批的 role / semantic_type / entity / dimension 是否一致。

驗收標準：跑一批缺 entity/dimension tag 的假資料，應該被擋在 Admission Gates（FAIL 或 REVIEW，視設計），而 legacy-promotion 的既有流程不受影響。

Issue 2：複合短語 CSV 轉換流程（技術債，中大型工作）
標題：feat: 設計候選 CSV 複合短語拆解流程

Label 建議：tech-debt、needs-design

內容：

13,799 筆候選元素 CSV（_療癒產生器_V3_TEST_csv_的副本.csv）裡的資料是複合短語（例如「銀色西施犬鬍鬚」＝品種＋毛色＋部位黏在一起），不能直接當成單一 dimension 值匯入 Elements_v4。目前只能拿來估算「這類別大概有多少料」，實際生成仍靠 AI Batch Prompt Helper 即時產生，這份 CSV 完全沒被自動化利用到。

需要設計：把複合短語拆解成乾淨的單一維度值（role/entity/dimension/value 結構化），再過 Admission Gates 的流程。可以先在資料量最大的類別（dog、flower）上做小規模實驗，驗證拆解品質，再決定要不要投入完整開發。

排序：排在 Dimension Gate（Issue 1）之後，Selection UI（Issue 4）之前，視情況決定是否排入開發排程。

Issue 3：植物類中小型 entity 的 target_count 偏低，待手動校準
標題：chore: 植物類中小型 entity target_count 待實測後手動微調

Label 建議：data-quality、low-priority

內容：

觀葉植物、多肉仙人掌、蕨類苔蘚、禾草竹類、藤本、食蟲植物這幾個 entity 的 target_count 都被壓在 9-12 之間（跟樹木灌木的 56 差距懸殊），是固定比例公式（target_sum = round(原始筆數 × 6%)，最低 8）的副作用，不代表這些類別本身沒有潛力，只是計算公式偏保守。

待辦：做過幾個 batch、實際看到生成品質後，再回頭手動調高這幾個類別的 target_count。目前這批數字主觀性較高，不是精確計算的結果，接手的人看到這些數字偏低時不用意外。

Issue 4：海洋無脊椎／昆蟲與節肢動物／魚類尚未建立 Roadmap
標題：decision: 海洋無脊椎/昆蟲/魚類（合計33筆）是否合併或不做

Label 建議：needs-decision、low-priority

內容：

這三類原始候選資料合計僅 33 筆（海洋無脊椎 17、昆蟲與節肢動物 12、魚類 4），資料量太少，目前刻意沒建立 Roadmap 項目。

需要做一個明確決定，不要讓它一直停在「暫緩」的灰色狀態：

選項 A：合併成單一 entity（例如 other-small-organism），給一個很低的 target_count（5-8）
選項 B：正式標記為「不做」，從 Roadmap 邏輯裡排除，不再列入待辦
排序：低優先，但建議儘早做決定，避免「暫緩」變成永遠沒人處理。

Issue 5（可選）：正式設計 V4 Prompt Builder Selection UI
標題：feat: 設計 Role → Entity → Dimension → Elements 階層式選擇 UI

Label 建議：frontend、needs-design

內容：

目前 Elements_v4 資料庫已經有 Role/Entity/Dimension 的分類邏輯，但終端使用者選擇元素組合 Prompt 時，還沒有對應的階層式 UI。

核心規則：選取邏輯不能再像舊 V3 那樣只用 Role 層級的 single:true 控制，因為同一 subject 底下 breed / coat-color / coat-pattern / coat-structure 這幾個 dimension 可以同時各選一個。應該改成 per-Dimension 選取規則，例如 subject/breed → max 1、subject/coat-color → max 1，以此類推。

排序：排在 Dimension Gate（Issue 1）之後，因為 Selection UI 依賴的資料完整性（是否每筆都有正確的 entity/dimension tag）要先靠 Dimension Gate 把關。

Issue 6（可選）：評估是否升 V4.1 schema，正式收編 entity/dimension 欄位
標題：decision: 評估 V4.1 — 是否把 entity/dimension 從 compatibility_tags 升格為正式欄位

Label 建議：needs-decision、schema

內容：

目前 entity/dimension 資訊塞在 compatibility_tags 字串裡（例如 entity:cat,dimension:breed），刻意不建立正式的 entity / dimension schema 欄位，原則是「資料與 UI 穩定前不要提前做」（見 PRINCIPLES.md §2）。

待辦：等 Dimension Gate、Selection UI 都上線並穩定運作一段時間後，重新評估是否值得投入 schema migration，把這兩個欄位正式收編進 Elements_v4。

排序：最低優先，排在所有其他項目之後，屬於長期觀察決定，不是立刻要做的事。
