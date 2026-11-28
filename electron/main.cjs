/* eslint-disable @typescript-eslint/no-require-imports */
const { app, BrowserWindow, dialog, shell } = require("electron")
const { spawn } = require("node:child_process")
const crypto = require("node:crypto")
const fs = require("node:fs")
const path = require("node:path")
const net = require("node:net")

const appName = "题库系统"
const baseDataPath = path.join(process.env.LOCALAPPDATA || app.getPath("appData"), "QuestionBank")
const userDataPath = path.join(baseDataPath, "Electron")

app.setName(appName)
app.setPath("userData", userDataPath)

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  let mainWindow
  let serverProcess
  let serverPort
  let isQuitting = false

  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(startApplication)

  app.on("window-all-closed", () => {
    app.quit()
  })

  app.on("before-quit", () => {
    isQuitting = true
    if (serverProcess && !serverProcess.killed) serverProcess.kill()
  })

  async function startApplication() {
    try {
      fs.mkdirSync(baseDataPath, { recursive: true })
      const databasePath = path.join(baseDataPath, "data", "question-bank.db")
      fs.mkdirSync(path.dirname(databasePath), { recursive: true })
      const accessToken = crypto.randomBytes(32).toString("hex")
      serverPort = await findAvailablePort()
      startServer(databasePath, accessToken)
      await waitForServer()
      await openApplicationWindow(accessToken)
    } catch (error) {
      if (serverProcess && !serverProcess.killed) serverProcess.kill()
      await dialog.showMessageBox({
        type: "error",
        title: appName,
        message: "题库启动失败",
        detail: error instanceof Error ? error.message : String(error),
      })
      app.quit()
    }
  }

  async function findAvailablePort() {
    return new Promise((resolve, reject) => {
      const probe = net.createServer()
      probe.once("error", reject)
      probe.listen(0, "127.0.0.1", () => {
        const address = probe.address()
        if (!address || typeof address === "string") {
          probe.close()
          reject(new Error("无法获取本机服务端口。"))
          return
        }

        const { port } = address
        probe.close((error) => error ? reject(error) : resolve(port))
      })
    })
  }

  function startServer(databasePath, accessToken) {
    const serverDirectory = path.join(process.resourcesPath, "server")
    const nodeExecutable = path.join(process.resourcesPath, "node", "node.exe")
    const serverEntry = path.join(serverDirectory, "server.js")
    const stdoutPath = path.join(baseDataPath, "server.log")
    const stderrPath = path.join(baseDataPath, "server.err.log")
    const stdout = fs.openSync(stdoutPath, "a")
    const stderr = fs.openSync(stderrPath, "a")
    const serverEnvironment = { ...process.env }

    for (const name of Object.keys(serverEnvironment)) {
      if (/^(APP_ACCESS_TOKEN|DATABASE_PATH|LLM_|PISTON_)/i.test(name)) delete serverEnvironment[name]
    }

    Object.assign(serverEnvironment, {
      APP_ACCESS_TOKEN: accessToken,
      DATABASE_PATH: databasePath,
      HOSTNAME: "127.0.0.1",
      NEXT_TELEMETRY_DISABLED: "1",
      NODE_ENV: "production",
      PORT: String(serverPort),
    })

    try {
      serverProcess = spawn(nodeExecutable, [serverEntry], {
        cwd: serverDirectory,
        env: serverEnvironment,
        stdio: ["ignore", stdout, stderr],
        windowsHide: true,
      })
    } finally {
      fs.closeSync(stdout)
      fs.closeSync(stderr)
    }

    serverProcess.once("error", (error) => {
      if (!isQuitting) {
        dialog.showErrorBox("题库服务启动失败", error.message)
        app.quit()
      }
    })
  }

  async function waitForServer() {
    const healthUrl = `http://127.0.0.1:${serverPort}/api/health`

    for (let attempt = 0; attempt < 60; attempt += 1) {
      if (serverProcess.exitCode !== null) {
        throw new Error(`题库服务已退出，日志位于 ${path.join(baseDataPath, "server.err.log")}`)
      }

      try {
        const response = await fetch(healthUrl, { signal: AbortSignal.timeout(1500) })
        if (response.ok) return
      } catch {
        // 服务启动期间暂不可访问，继续等待。
      }

      await new Promise((resolve) => setTimeout(resolve, 500))
    }

    throw new Error(`等待题库服务超时，请检查 ${path.join(baseDataPath, "server.err.log")}`)
  }

  async function openApplicationWindow(accessToken) {
    if (!mainWindow || mainWindow.isDestroyed()) {
      mainWindow = new BrowserWindow({
        width: 1280,
        height: 900,
        minWidth: 900,
        minHeight: 640,
        show: false,
        title: appName,
        icon: path.join(app.getAppPath(), "icon.ico"),
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        },
      })

      mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith("https://") || url.startsWith("http://")) {
          shell.openExternal(url)
        }
        return { action: "deny" }
      })

      mainWindow.webContents.on("will-navigate", (event, destination) => {
        const appOrigin = `http://127.0.0.1:${serverPort}`
        if (!destination.startsWith(`${appOrigin}/`) && destination !== appOrigin) {
          event.preventDefault()
          if (destination.startsWith("https://") || destination.startsWith("http://")) {
            shell.openExternal(destination)
          }
        }
      })
    }

    const appOrigin = `http://127.0.0.1:${serverPort}`
    // 主进程直接向桌面会话写入凭据，渲染页面无需接触访问令牌。
    await mainWindow.webContents.session.cookies.set({
      url: appOrigin,
      name: "question_bank_session",
      value: crypto.createHash("sha256").update(`question-bank-session:${accessToken}`).digest("hex"),
      path: "/",
      httpOnly: true,
      sameSite: "strict",
    })
    await mainWindow.loadURL(appOrigin)
    mainWindow.show()
  }
}
