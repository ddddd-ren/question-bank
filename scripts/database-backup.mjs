import path from "node:path"
import { loadEnvConfig } from "@next/env"
import { backupDatabase, restoreDatabase, verifyDatabase } from "../src/lib/db/backup.mjs"

loadEnvConfig(process.cwd())
const [action, file, ...flags] = process.argv.slice(2)
const database = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "question-bank.db")

try {
  if (action === "backup" && file && flags.length === 0) {
    console.log("完整备份已保存：" + await backupDatabase(database, file))
  } else if (action === "verify" && file && flags.length === 0) {
    console.log("备份校验通过：" + JSON.stringify(verifyDatabase(file)))
  } else if (action === "restore" && file && flags.length === 1 && flags[0] === "--stopped") {
    const result = await restoreDatabase(file, database, { stopped: true })
    console.log("恢复完成：" + result.path)
    if (result.previousPath) console.log("恢复前的原库已保留：" + result.previousPath)
  } else {
    console.log("用法：node scripts/database-backup.mjs backup|verify <备份文件.db>")
    console.log("恢复：停止题库服务后，node scripts/database-backup.mjs restore <备份文件.db> --stopped")
    if (action !== "--help") process.exitCode = 1
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "数据库操作失败")
  process.exitCode = 1
}
