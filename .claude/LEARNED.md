# 项目记忆：question-bank

更新时间：2026-06-08

## 高优先级规则

1. 始终中文回复。
   - 来源：项目 `AGENTS.md` 明确要求。
   - 行动：所有说明、交付、报错解释都使用中文。

2. 这是 Next.js 16.2.6，不要按旧 Next 经验硬写。
   - 来源：`AGENTS.md` 提醒该版本有破坏性变化。
   - 行动：改 Route Handler、fetch、构建配置前，优先查 `node_modules/next/dist/docs/`。

3. PowerShell 显示中文乱码不等于文件实际乱码。
   - 失误背景：多次 `Get-Content` 输出 mojibake，但浏览器和 Node UTF-8 读取可能正常。
   - 行动：判断乱码时，用构建、浏览器页面、Node UTF-8 读取共同验证；不要只信终端显示。

4. 但如果源码本身已经写成 mojibake，要主动重写成正常 UTF-8。
   - 失误背景：`src/app/paper/page.tsx` 曾有乱码中文源码，浏览器表面能显示正常，维护风险很高。
   - 行动：新改动避免复制乱码文案；必要时重写整段 UI 文案。

5. 桌面快捷方式不要再直接调用 `powershell.exe`。
   - 失误背景：用户遇到 `powershell.exe - 系统错误：Exception Processing Message 0xc0000005`。
   - 行动：桌面入口使用 `scripts/open-local.cmd`；快捷方式指向 `.cmd`，图标用 `assets/app-icon.ico`。

6. 本地服务默认地址是 `http://localhost:3000`。
   - 行动：桌面快捷方式和本地浏览器验证都使用该地址；如果端口被占用再另行处理。

## 已实现能力

1. 导入预览后可套用题型模板。
2. 已导入题目详情页可修改题型、题干、选项、答案、解析。
3. `/api/dashboard` 已修复 better-sqlite3 查询。
4. 组卷功能：
   - 随机组卷：按题型设置数量。
   - 自主选题：搜索、筛选、勾选题目。
   - Word 导出：`/api/papers` 支持 `format: "docx"`。
   - 在线作答：生成试卷后可在 `/paper` 直接做题、提交、交卷、回看。

## 验证习惯

每次功能性修改后至少跑：

```bash
npm.cmd run lint
npm.cmd test
npm.cmd run build
```

前端交互修改后，再用浏览器实际检查核心路径。例如组卷功能应验证：

1. 打开 `/paper`。
2. 点击“生成试卷”。
3. 点击“开始在线做题”。
4. 选择答案并“提交本题”。
5. 能看到提交状态或交卷结果。

## 设计方向

用户指定设计语言：

- 高级 iOS 风格。
- 本地专业工具感。
- 干净、克制、专业。
- 不要商城化。
- 不要游戏化。
- 不要复杂 ERP 风格。

行动：新增页面优先使用清晰工具布局、轻量卡片、克制色彩、明确按钮，不做营销式首屏。

## 下次优先改进

1. 抽出组卷在线作答逻辑为组件，避免 `src/app/paper/page.tsx` 继续变大。
2. 修复全局 `src/lib/constants.ts` 中终端可见的乱码源码，降低后续误读风险。
3. 给 `/api/papers` 增加单元测试：随机规则、手动题目、docx content-type。
4. 在线作答可进一步保存历史记录，目前是当前页面临时试卷作答。
