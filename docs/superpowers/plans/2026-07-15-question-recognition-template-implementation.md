# 题目识别与模板优化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立保守、分层、可解释的题目识别流水线，并使七种题型模板转换能够保留和恢复原始选项、答案与填空位。

**Architecture:** 文档格式解析器先输出统一段落，随后依次经过结构规范化、题目分段、字段提取和证据评分；`question-extractor.ts` 只负责编排和现有 API 兼容。识别诊断只进入预览响应，不持久化数据库；模板通过可选 `preserved` 数据实现无损往返。

**Tech Stack:** TypeScript、Vitest、Next.js 16 Route Handler、现有 Word/PDF/PPT 解析依赖、React 19。

---

## 文件结构

- Create: `src/lib/parser/recognition-types.ts`：段落、题块、诊断和题型决定类型。
- Create: `src/lib/parser/structure-normalizer.ts`：全角符号、空白、页码和重复段落处理。
- Create: `src/lib/parser/question-segmenter.ts`：章节与题目边界识别。
- Create: `src/lib/parser/field-extractor.ts`：题干、选项、答案和解析提取。
- Create: `src/lib/parser/type-classifier.ts`：题型证据评分和保守决定。
- Modify: `src/lib/parser/question-extractor.ts`：接入分层流水线并保留格式解析入口。
- Modify: `src/lib/parser/question-templates.ts`：增加 preserved 数据和无损模板切换。
- Modify: `src/lib/parser/question-normalizer.ts`：新增诊断型质量问题。
- Modify: `src/lib/parser/quality-checker.ts`：合并识别诊断与格式质量报告。
- Modify: `src/app/api/questions/preview/route.ts`：返回识别诊断。
- Modify: `src/components/import/question-editor.tsx`：显示置信度与识别冲突。
- Create: `src/lib/parser/__tests__/structure-normalizer.test.ts`
- Create: `src/lib/parser/__tests__/question-segmenter.test.ts`
- Create: `src/lib/parser/__tests__/field-extractor.test.ts`
- Create: `src/lib/parser/__tests__/type-classifier.test.ts`
- Modify: `src/lib/parser/__tests__/question-extractor.test.ts`
- Modify: `src/lib/parser/__tests__/question-templates.test.ts`
- Modify: `src/lib/parser/__tests__/quality-checker.test.ts`

### Task 1: 建立识别共享类型与结构规范化

**Files:**
- Create: `src/lib/parser/recognition-types.ts`
- Create: `src/lib/parser/structure-normalizer.ts`
- Create: `src/lib/parser/__tests__/structure-normalizer.test.ts`

- [ ] **Step 1: 编写结构规范化失败测试**

测试必须覆盖：全角拉丁字母和标点；零宽字符；连续空白；PDF 页码；普通正文中的数字不被删除；PPT 重复段落只删除完全相同的相邻副本。

```ts
expect(normalizeParagraphs([
  { text: "Ａ．  React\u200b  框架", sourceIndex: 0, sourceKind: "pdf-line", styleHints: {} },
])).toEqual([
  { text: "A. React 框架", sourceIndex: 0, sourceKind: "pdf-line", styleHints: {} },
])

expect(normalizeParagraphs([
  paragraph("第 3 页", 0, "pdf-line"),
  paragraph("2024 年有 12 个月", 1, "pdf-line"),
])).toHaveLength(1)
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npx vitest run src/lib/parser/__tests__/structure-normalizer.test.ts`

Expected: FAIL，提示模块不存在。

- [ ] **Step 3: 定义共享类型**

`recognition-types.ts` 导出：

```ts
export interface StructuredParagraph {
  text: string
  sourceIndex: number
  sourceKind: "paragraph" | "table" | "slide" | "pdf-line"
  styleHints: { isRed?: boolean; isBold?: boolean; level?: number }
}

export type RecognitionWarningCode =
  | "uncertain_boundary"
  | "uncertain_type"
  | "uncertain_option"
  | "answer_option_mismatch"
  | "blank_answer_mismatch"
  | "conflicting_signals"

export interface RecognitionDiagnostic {
  confidence: number
  warnings: Array<{ code: RecognitionWarningCode; message: string; sourceText?: string }>
  evidence: string[]
}
```

- [ ] **Step 4: 实现纯函数结构规范化**

`normalizeParagraphs(paragraphs)` 必须：

- 转换全角 ASCII 范围到半角。
- 统一 `、．：）（【】` 中用于题号或选项的结构符号，但不改普通中文正文。
- 删除 `\u200b`、`\ufeff` 等不可见字符。
- 将行内连续空白压缩为一个空格。
- 对 `pdf-line` 删除 `第 N 页`、`N / M` 和孤立页码。
- 只合并相邻、规范化后完全相同且 sourceKind 为 `slide` 的段落。

- [ ] **Step 5: 运行测试**

Run: `npx vitest run src/lib/parser/__tests__/structure-normalizer.test.ts`

Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add src/lib/parser/recognition-types.ts src/lib/parser/structure-normalizer.ts src/lib/parser/__tests__/structure-normalizer.test.ts
git commit -m "refactor(parser): add structured paragraph normalization"
```

### Task 2: 实现保守的题目边界分段

**Files:**
- Create: `src/lib/parser/question-segmenter.ts`
- Create: `src/lib/parser/__tests__/question-segmenter.test.ts`

- [ ] **Step 1: 编写分段失败测试**

测试以下输入：

```ts
const paragraphs = [
  text("一、单项选择题"),
  text("1."),
  text("下列属于前端框架的是？"),
  text("A. Vue"),
  text("B. MySQL"),
  text("答案：A"),
  text("解析：Vue 是前端框架。"),
  text("2、下列属于数据库的是？"),
  text("A. React B. MySQL"),
]
```

断言输出两个题块；第一题解析不触发新边界；孤立题号与下一段合并；章节类型为 `single`。

增加低置信度测试：正文中的 `2024.`、`A.` 和“答案：”不得触发新题；疑似题号但前题结构不完整时合并并产生 `uncertain_boundary`。

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/lib/parser/__tests__/question-segmenter.test.ts`

Expected: FAIL，提示 `segmentQuestions` 不存在。

- [ ] **Step 3: 定义题块接口**

```ts
export interface QuestionBlock {
  paragraphs: StructuredParagraph[]
  sectionType?: QuestionType
  boundaryConfidence: number
  diagnostic: RecognitionDiagnostic
}
```

- [ ] **Step 4: 实现边界证据**

导出 `segmentQuestions(paragraphs)`，依次识别：

- 章节标题正则及对应 QuestionType。
- `1.`、`1、`、`(1)`、`（1）`、`第1题` 独立或同行题号。
- 字段标签和选项标记永远不是新题边界。
- 新题号只有在上一题已有题干，或已有两个选项，或已有明确答案时才以高置信度切分。
- 不满足强条件时将段落并入当前题块并记录警告。

- [ ] **Step 5: 运行测试**

Run: `npx vitest run src/lib/parser/__tests__/question-segmenter.test.ts`

Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add src/lib/parser/question-segmenter.ts src/lib/parser/__tests__/question-segmenter.test.ts
git commit -m "feat(parser): segment questions conservatively"
```

### Task 3: 分层提取答案、解析和跨段选项

**Files:**
- Create: `src/lib/parser/field-extractor.ts`
- Create: `src/lib/parser/__tests__/field-extractor.test.ts`

- [ ] **Step 1: 编写字段提取失败测试**

至少包含以下断言：

1. 同行 `A. Vue B. MySQL C. Redis` 分为三个选项。
2. `A. Vue` 后一段“渐进式框架”追加到 A，而不是题干。
3. 单独 `A.` 后没有 B 标记时保留在题干，并产生 `uncertain_option`。
4. `答案：A 解析：因为 A 正确` 正确分离。
5. 解析跨多个段落直到题块末尾。
6. 解析中出现“答案 A”不被再次提取。
7. 普通题干末尾字母 A 不作为答案。
8. 红色 `A` 只有在选择题候选且存在 A 选项时作为答案。

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/lib/parser/__tests__/field-extractor.test.ts`

Expected: FAIL，提示模块不存在。

- [ ] **Step 3: 定义字段提取结果**

```ts
export interface ExtractedFields {
  stem: string
  options: string[]
  answer: string | null
  explanation: string | null
  diagnostic: RecognitionDiagnostic
}
```

- [ ] **Step 4: 实现字段提取顺序**

`extractFields(block)` 必须严格按以下顺序：

1. 从明确解析标签开始截取解释段落。
2. 从剩余尾部提取明确答案标签或有效红色答案。
3. 识别至少两个连续选项标号后建立选项列表。
4. 将选项后的无标号短段落追加到前一选项，直到字段标签。
5. 剩余段落去掉题号后作为题干。

选项标号统一为 `A. 内容`，支持半角、全角、括号和中文顿号。

- [ ] **Step 5: 运行测试**

Run: `npx vitest run src/lib/parser/__tests__/field-extractor.test.ts`

Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add src/lib/parser/field-extractor.ts src/lib/parser/__tests__/field-extractor.test.ts
git commit -m "feat(parser): extract fields with conservative evidence"
```

### Task 4: 使用证据评分判定题型

**Files:**
- Create: `src/lib/parser/type-classifier.ts`
- Create: `src/lib/parser/__tests__/type-classifier.test.ts`

- [ ] **Step 1: 编写题型评分失败测试**

覆盖：

- 章节为单选、存在选项但无答案时保持单选。
- 无章节、有四个选项但无答案时回退 essay 并警告，不能武断判单选。
- 多个有效答案字母判多选。
- 判断答案 `对/错/√/×` 判判断。
- 两个填空标记判填空。
- 包含代码块和“编写程序”判编程。
- “计算”“求解”仅提供弱证据，不能覆盖明确章节题型。
- 最高与次高分差小于 20 时产生 `conflicting_signals`。

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/lib/parser/__tests__/type-classifier.test.ts`

Expected: FAIL。

- [ ] **Step 3: 实现评分模型**

导出：

```ts
export interface TypeDecision {
  type: QuestionType
  confidence: number
  evidence: string[]
  alternatives: Array<{ type: QuestionType; score: number }>
  warnings: RecognitionDiagnostic["warnings"]
}

export function classifyQuestion(input: {
  stem: string
  options: string[]
  answer: string | null
  sectionType?: QuestionType
}): TypeDecision
```

按规格表累加分数，分数限制到 0-100。章节题型为默认结果；没有章节且证据冲突时选择 essay。`confidence` 为最高分与次高分差值换算后的 0-100 数值。

- [ ] **Step 4: 运行测试**

Run: `npx vitest run src/lib/parser/__tests__/type-classifier.test.ts`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/lib/parser/type-classifier.ts src/lib/parser/__tests__/type-classifier.test.ts
git commit -m "feat(parser): classify question types by evidence"
```

### Task 5: 接入分层识别流水线

**Files:**
- Modify: `src/lib/parser/question-extractor.ts`
- Modify: `src/lib/parser/__tests__/question-extractor.test.ts`
- Modify: `src/lib/parser/index.ts`

- [ ] **Step 1: 添加端到端失败样例**

在 `question-extractor.test.ts` 增加至少六个样例：

- PDF 孤立题号和跨行选项。
- Word 同行答案与跨段解析。
- PPT 重复文本框。
- 题干末尾普通字母不被提取为答案。
- 无答案选择外观题回退 essay 并附加诊断。
- 章节单选与多字母答案冲突时保留章节类型并警告。

断言所有原始正文片段至少出现在 stem、options、answer 或 explanation 之一。

- [ ] **Step 2: 运行新增测试确认失败**

Run: `npx vitest run src/lib/parser/__tests__/question-extractor.test.ts`

Expected: 新样例 FAIL，现有样例保持 PASS。

- [ ] **Step 3: 扩展 ExtractedQuestion**

```ts
export interface ExtractedQuestion {
  type: QuestionType
  content: string
  options: string[] | null
  answer: string | null
  explanation: string | null
  contentHash: string
  diagnostic?: RecognitionDiagnostic
}
```

- [ ] **Step 4: 重构编排流程**

保留 Word/PDF/PPT 文档读取函数，但将通用文本识别改为：

```ts
const paragraphs = normalizeParagraphs(sourceParagraphs)
const blocks = segmentQuestions(paragraphs)
return blocks.map((block) => {
  const fields = extractFields(block)
  const decision = classifyQuestion({ ...fields, sectionType: block.sectionType })
  return normalizeQuestion({
    type: decision.type,
    content: fields.stem,
    options: fields.options.length ? fields.options : null,
    answer: fields.answer,
    explanation: fields.explanation,
    contentHash: generateHash(fields.stem),
    diagnostic: mergeDiagnostics(block.diagnostic, fields.diagnostic, decision),
  })
})
```

旧的公开函数签名保持不变。

- [ ] **Step 5: 删除被新模块替代的重复私有规则**

仅删除已经有新测试覆盖的边界、选项、答案和题型判断函数。文档解码、PPT/OLE2、PDF 文本读取和 HTML 解码逻辑保留。

- [ ] **Step 6: 运行解析器测试**

```bash
npx vitest run src/lib/parser/__tests__/question-extractor.test.ts
npx vitest run src/lib/parser/__tests__/powerpoint-parser.test.ts
npx vitest run src/lib/parser/__tests__/content-filter.test.ts
```

Expected: 全部 PASS。

- [ ] **Step 7: 提交**

```bash
git add src/lib/parser/question-extractor.ts src/lib/parser/index.ts src/lib/parser/__tests__/question-extractor.test.ts
git commit -m "refactor(parser): compose layered recognition pipeline"
```

### Task 6: 实现可逆题目模板转换

**Files:**
- Modify: `src/lib/parser/question-templates.ts`
- Modify: `src/lib/parser/__tests__/question-templates.test.ts`
- Modify: `src/components/import/question-editor.tsx`

- [ ] **Step 1: 编写模板往返失败测试**

增加至少十个断言：

- 单选转论述再转单选恢复选项和答案。
- 多选转判断时不把 `AC` 写成判断答案。
- 判断转多选再切回恢复 `√`。
- 填空转论述再切回恢复 blanks 与编号。
- `____{1}` 不重复编号。
- 未编号空位补连续编号。
- 空位比答案多时保留所有空位。
- 答案比空位多时额外答案进入 preserved 并产生警告。
- 用户修改目标模板答案后不被 preserved 覆盖。
- `fromEditable` 不把 preserved 写入数据库字段。

- [ ] **Step 2: 运行模板测试确认失败**

Run: `npx vitest run src/lib/parser/__tests__/question-templates.test.ts`

Expected: 新增往返测试 FAIL。

- [ ] **Step 3: 扩展编辑类型**

```ts
export interface PreservedTemplateData {
  sourceType: QuestionType
  options?: string[]
  answer?: string
  blanks?: BlankSlot[]
  warnings?: string[]
}

export interface EditableQuestion {
  // 现有字段
  preserved?: PreservedTemplateData
}
```

- [ ] **Step 4: 实现保存与恢复规则**

`applyTemplate` 在离开当前题型时保存不可表达字段；切回 `preserved.sourceType` 时恢复。恢复后保留 preserved 副本，直到用户明确修改对应字段，防止连续切换丢失数据。

判断模板只接受规范化后的 `√` 或 `×`；其他答案进入 preserved。非选择题的 `fromEditable` 始终返回 `options: null`。

- [ ] **Step 5: 修复填空编号**

将填空正则分成“已有编号”和“未编号”两类。先扫描已有 `____{n}` 建立 slots，再从最大编号之后为未编号空位分配 ID；最终按题干出现顺序排序。

- [ ] **Step 6: 在编辑器显示模板保留提示**

当 `question.preserved` 含数据时显示一行紧凑提示，例如“已保留原单选题的 4 个选项，切回可恢复”。不得显示为阻塞错误。

- [ ] **Step 7: 运行测试**

```bash
npx vitest run src/lib/parser/__tests__/question-templates.test.ts
npx tsc --noEmit --pretty false
```

Expected: PASS。

- [ ] **Step 8: 提交**

```bash
git add src/lib/parser/question-templates.ts src/lib/parser/__tests__/question-templates.test.ts src/components/import/question-editor.tsx
git commit -m "feat(parser): preserve data across template changes"
```

### Task 7: 将识别诊断接入质量报告与导入预览

**Files:**
- Modify: `src/lib/parser/question-normalizer.ts`
- Modify: `src/lib/parser/quality-checker.ts`
- Modify: `src/lib/parser/__tests__/quality-checker.test.ts`
- Modify: `src/app/api/questions/preview/route.ts`
- Modify: `src/components/import/question-editor.tsx`

- [ ] **Step 1: 编写诊断质量报告失败测试**

构造包含 `uncertain_type`、`answer_option_mismatch` 和 `blank_answer_mismatch` 的问题，断言：

- uncertain 类别生成 warning。
- 答案越界和填空数量不匹配生成 error。
- 识别 evidence 保留在报告中。
- 没有 diagnostic 的旧题目保持现有报告结构。

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/lib/parser/__tests__/quality-checker.test.ts`

Expected: 新增测试 FAIL。

- [ ] **Step 3: 合并诊断与格式问题**

扩展 `QuestionQuality`：

```ts
interface QuestionQuality {
  // 现有字段
  recognition?: RecognitionDiagnostic
}
```

在 `checkQuestionQuality` 中将 diagnostic warnings 映射到质量问题；同 code 和 field 的问题去重。

- [ ] **Step 4: 调整预览 API**

`POST /api/questions/preview` 返回的每道 `quality` 包含 recognition。`PUT` 正式导入前将 `preserved` 和 diagnostic 丢弃，只转换既有数据库字段。

- [ ] **Step 5: 更新编辑器诊断显示**

在错误和警告列表上方显示置信度：

- `>= 80`：不额外显示。
- `50-79`：显示“识别结果建议检查”。
- `< 50`：显示“识别置信度较低，请核对题型和字段”。

evidence 放入可展开详情，不占据默认编辑空间。

- [ ] **Step 6: 运行完整验证**

```bash
npm run lint
npx tsc --noEmit --pretty false
npm test
npm run build
npm audit --omit=dev
```

Expected: 全部通过；测试总断言新增不少于 25 项。

- [ ] **Step 7: 提交**

```bash
git add src/lib/parser/question-normalizer.ts src/lib/parser/quality-checker.ts src/lib/parser/__tests__/quality-checker.test.ts src/app/api/questions/preview/route.ts src/components/import/question-editor.tsx
git commit -m "feat(import): surface recognition diagnostics"
```

## 最终验收

- 新增结构、分段、字段、分类和模板测试全部经历 RED-GREEN。
- 现有 Word、PDF、PPT、JSON 和 CSV 导入接口保持兼容。
- 无明确答案标签时，不从普通题干末尾激进提取单个字母。
- 单独一个选项标号不建立选项数组，原文仍保留在题干。
- 无答案且无章节的选择外观题不武断判单选。
- 模板往返不静默丢失选项、答案、填空位或解析。
- 诊断只存在于预览与编辑状态，不进入数据库。
- `question-extractor.ts` 的通用识别规则迁移到独立模块。
- ESLint、TypeScript、全部测试、生产构建和生产依赖审计通过。
