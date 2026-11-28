import { cp, lstat, mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import path from "node:path"
import { fileURLToPath } from "node:url"

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const outputRoot = path.join(projectRoot, "output")
const stagingRoot = path.join(outputRoot, "windows-package")
const nextBuildRoot = path.join(outputRoot, "windows-next-build")
const appStage = path.join(stagingRoot, "app")
const resourceRoot = path.join(appStage, "resources")
const serverStage = path.join(resourceRoot, "server")
const nodeStage = path.join(resourceRoot, "node")
const packageJson = JSON.parse(await readFile(path.join(projectRoot, "package.json"), "utf8"))

if (process.platform !== "win32" || process.arch !== "x64") {
  throw new Error("Windows 安装包必须在 64 位 Windows 环境下构建。")
}

const expectedStagingRoot = path.join(outputRoot, "windows-package")
if (path.resolve(stagingRoot) !== expectedStagingRoot) {
  throw new Error("安装包暂存目录不在项目 output 目录中。")
}

await rm(stagingRoot, { recursive: true, force: true })
await mkdir(serverStage, { recursive: true })
await mkdir(nodeStage, { recursive: true })

await cp(path.join(nextBuildRoot, "standalone"), serverStage, {
  recursive: true,
  dereference: true,
  filter: async (source) => {
    const name = path.basename(source).toLowerCase()
    if (/^\.env(?:\.|$)/.test(name)) return false
    if (/\.(?:db|sqlite|sqlite3|wal|shm|journal|log)$/.test(name)) return false
    return true
  },
})

await cp(
  path.join(nextBuildRoot, "static"),
  path.join(serverStage, "output", "windows-next-build", "static"),
  {
    recursive: true,
    dereference: true,
  },
)
await cp(path.join(projectRoot, "public"), path.join(serverStage, "public"), {
  recursive: true,
  dereference: true,
})

const electronModulePath = createRequire(import.meta.url).resolve("electron")
const electronPackagePath = path.join(path.dirname(electronModulePath), "package.json")
const electronPackage = JSON.parse(await readFile(electronPackagePath, "utf8"))
if (electronPackage.version !== packageJson.devDependencies.electron) {
  throw new Error(`Electron 版本不符，预期 ${packageJson.devDependencies.electron}，实际为 ${electronPackage.version}。`)
}

const electronDist = path.join(path.dirname(electronPackagePath), "dist")
await cp(electronDist, appStage, { recursive: true, dereference: true })
await rename(path.join(appStage, "electron.exe"), path.join(appStage, "question-bank.exe"))
await cp(process.execPath, path.join(nodeStage, "node.exe"))
await cp(path.join(projectRoot, "assets", "app-icon.ico"), path.join(resourceRoot, "app-icon.ico"))

const electronAppDirectory = path.join(appStage, "resources", "app")
await mkdir(electronAppDirectory, { recursive: true })
await cp(path.join(projectRoot, "electron", "main.cjs"), path.join(electronAppDirectory, "main.cjs"))
await cp(path.join(projectRoot, "assets", "app-icon.ico"), path.join(electronAppDirectory, "icon.ico"))
await writeFile(
  path.join(electronAppDirectory, "package.json"),
  `${JSON.stringify({ name: "question-bank-desktop", version: packageJson.version, main: "main.cjs" }, null, 2)}\n`,
  "utf8",
)

const nativeAddon = path.join(serverStage, "node_modules", "better-sqlite3", "build", "Release", "better_sqlite3.node")
await stat(nativeAddon)
await stat(path.join(serverStage, "server.js"))
await stat(path.join(serverStage, "output", "windows-next-build", "BUILD_ID"))
await stat(path.join(serverStage, "output", "windows-next-build", "static"))
await stat(path.join(serverStage, "public", "manifest.json"))

async function verifyStagedTree(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name)
    const metadata = await lstat(target)
    if (metadata.isSymbolicLink()) {
      throw new Error(`安装包中仍有不可移植的符号链接：${target}`)
    }

    if (metadata.isDirectory()) {
      await verifyStagedTree(target)
      continue
    }

    const lowerName = entry.name.toLowerCase()
    if (/^\.env(?:\.|$)/.test(lowerName)
      || /\.(?:db|sqlite|sqlite3|wal|shm|journal)$/.test(lowerName)
      || lowerName === "access-token.txt") {
      throw new Error(`安装包暂存目录中发现不应分发的配置或数据文件：${target}`)
    }
  }
}

await verifyStagedTree(appStage)
console.log(`Electron ${electronPackage.version} 与生产服务已准备到 ${stagingRoot}`)
