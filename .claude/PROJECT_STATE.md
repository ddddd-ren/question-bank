# 当前项目状态快照

更新时间：2026-06-08

## 运行入口

- 本地地址：http://localhost:3000
- 桌面快捷方式：`C:\Users\asus\Desktop\题库系统.lnk`
- 快捷方式目标：`D:\question-bank\scripts\open-local.cmd`
- 图标：`D:\question-bank\assets\app-icon.ico`

## 关键页面

- 仪表盘：`/`
- 导入题库：`/import`
- 题库列表：`/bank`
- 题目详情编辑：`/bank/[id]`
- 组卷与在线作答：`/paper`
- 刷题练习：`/practice`
- 错题：`/mistakes`
- 收藏：`/favorites`
- 设置：`/settings`

## 关键接口

- Dashboard：`/api/dashboard`
- 题目：`/api/questions`
- 导入预览：`/api/questions/preview`
- 组卷与 Word 导出：`/api/papers`
- 练习记录：`/api/practice`

## 最近验证

最近一次完整验证通过：

- `npm.cmd run lint`
- `npm.cmd test`
- `npm.cmd run build`

浏览器实测通过：

- `/paper` 生成试卷。
- 进入在线作答。
- 选择答案。
- 提交本题。
