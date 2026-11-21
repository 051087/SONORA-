
const { app, BrowserWindow, dialog, shell } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const net = require("net");

const PORT = 3210;
const URL = `http://127.0.0.1:${PORT}`;

let serverProcess = null;
let mainWindow = null;
let quitting = false;

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
    let finished = false;

    const check = () => {
      if (finished) return;

      const socket = net.createConnection(PORT, "127.0.0.1");

      socket.once("connect", () => {
        if (finished) {
          socket.destroy();
          return;
        }

        finished = true;
        socket.destroy();
        resolve();
      });

      socket.once("error", () => {
        socket.destroy();
        attempts++;

        if (attempts >= 60) {
          finished = true;
          reject(
            new Error(
              "Le serveur SONORA ne répond pas après 60 secondes. Consulte les journaux pour connaître la cause."
            )
          );
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
    throw new Error(
      `Fichier serveur Next.js introuvable :\n${serverPath}`
    );
  }

  console.log("[SONORA] Démarrage du serveur :", serverPath);

  serverProcess = spawn(process.execPath, [serverPath], {
    cwd: path.dirname(serverPath),
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      NODE_ENV: "production",
      PORT: String(PORT),
      HOSTNAME: "127.0.0.1"
    }
  });

  serverProcess.stdout.on("data", (data) => {
    console.log("[SONORA SERVER]", data.toString());
  });

  serverProcess.stderr.on("data", (data) => {
    console.error("[SONORA ERROR]", data.toString());
  });

  serverProcess.on("error", (error) => {
    console.error("[SONORA START ERROR]", error);
  });

  serverProcess.on("exit", (code, signal) => {
    console.error(
      "[SONORA EXIT] Code :",
      code,
      "Signal :",
      signal
    );
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

    console.log("[SONORA] Application démarrée.");
  } catch (error) {
    console.error("[SONORA FATAL ERROR]", error);

    dialog.showErrorBox(
      "Erreur SONORA",
      error.message || String(error)
    );

    app.quit();
  }
});

app.on("before-quit", () => {
  quitting = true;

  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill();
  }
});

app.on("window-all-closed", () => {
  app.quit();
});
