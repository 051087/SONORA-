
const { app, BrowserWindow, dialog, shell } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const net = require("net");

const PORT = 3210;
const URL = `http://127.0.0.1:${PORT}`;

let serverProcess;
let mainWindow;

function loadLocalEnvironment() {
  const envPath = path.join(app.getPath("userData"), ".env");

  if (!fs.existsSync(envPath)) {
    dialog.showErrorBox(
      "Configuration SONORA manquante",
      `Crée ton fichier de configuration ici :\n${envPath}`
    );
    return false;
  }

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
    if (!match || line.trim().startsWith("#")) continue;

    let value = match[2].trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[match[1]]) {
      process.env[match[1]] = value;
    }
  }

  return true;
}

function waitForServer() {
  return new Promise((resolve, reject) => {
    let attempts = 0;

    const check = () => {
      const socket = net.createConnection(PORT, "127.0.0.1");

      socket.once("connect", () => {
        socket.destroy();
        resolve();
      });

      socket.once("error", () => {
        socket.destroy();
        attempts++;

        if (attempts >= 60) {
          reject(new Error("Le serveur SONORA ne démarre pas."));
          return;
        }

        setTimeout(check, 1000);
      });
    };

    check();
  });
}

function startServer() {
  const serverPath = path.join(
    process.resourcesPath,
    "next",
    "server.js"
  );

  if (!fs.existsSync(serverPath)) {
    throw new Error("Fichier serveur Next.js introuvable.");
  }

  serverProcess = spawn(process.execPath, [serverPath], {
    cwd: path.dirname(serverPath),
    windowsHide: true,
    stdio: "ignore",
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      NODE_ENV: "production",
      PORT: String(PORT),
      HOSTNAME: "127.0.0.1"
    }
  });
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1000,
    minHeight: 650,
    title: "SONORA",
    backgroundColor: "#121212",
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  await mainWindow.loadURL(URL);
}

app.whenReady().then(async () => {
  try {
    if (!loadLocalEnvironment()) {
      app.quit();
      return;
    }

    startServer();
    await waitForServer();
    await createWindow();
  } catch (error) {
    dialog.showErrorBox(
      "Erreur SONORA",
      error.message || String(error)
    );
    app.quit();
  }
});

app.on("before-quit", () => {
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill();
  }
});

app.on("window-all-closed", () => {
  app.quit();
});
