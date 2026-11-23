
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

const logPath = path.join(app.getPath("userData"), "sonora.log");

function writeLog(message) {
  try {
    const timestamp = new Date().toISOString();
    fs.appendFileSync(
      logPath,
      `[${timestamp}] ${message}\n`,
      "utf8"
    );
  } catch (error) {
    console.error("Impossible d'écrire le journal :", error);
  }
}

function loadLocalEnvironment() {
  const envPath = path.join(app.getPath("userData"), ".env");

  writeLog("Vérification du fichier .env");

  if (!fs.existsSync(envPath)) {
    writeLog("ERREUR : fichier .env introuvable.");

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

  writeLog("Fichier .env chargé.");
  return true;
}

function waitForServer() {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    let finished = false;

    const check = () => {
      if (finished) return;

      const socket = net.createConnection(PORT, "127.0.0.1");

      socket.setTimeout(2000);

      socket.once("connect", () => {
        if (finished) {
          socket.destroy();
          return;
        }

        finished = true;
        socket.destroy();

        writeLog("Serveur SONORA accessible sur le port " + PORT);
        resolve();
      });

      socket.once("timeout", () => {
        socket.destroy();
      });

      socket.once("error", (error) => {
        socket.destroy();

        if (finished) return;

        attempts++;

        if (attempts >= 60) {
          finished = true;

          reject(
            new Error(
              "Le serveur SONORA ne répond pas après 60 secondes. Consulte sonora.log."
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

  writeLog("Recherche du serveur : " + serverPath);

  if (!fs.existsSync(serverPath)) {
    writeLog("ERREUR : server.js introuvable.");

    throw new Error(
      `Fichier serveur Next.js introuvable :\n${serverPath}`
    );
  }

  writeLog("Fichier server.js trouvé.");
  writeLog("Démarrage du serveur Next.js...");

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
    writeLog("[SERVER] " + data.toString().trim());
  });

  serverProcess.stderr.on("data", (data) => {
    writeLog("[SERVER ERROR] " + data.toString().trim());
  });

  serverProcess.on("error", (error) => {
    writeLog("[START ERROR] " + error.stack);
  });

  serverProcess.on("exit", (code, signal) => {
    writeLog(
      `[SERVER EXIT] Code=${code}, Signal=${signal}`
    );
  });

  writeLog("Processus serveur lancé. PID : " + serverProcess.pid);
}

async function createWindow() {
  writeLog("Création de la fenêtre SONORA.");

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

  mainWindow.webContents.on("did-fail-load", (_event, code, description) => {
    writeLog(`[WINDOW LOAD ERROR] ${code}: ${description}`);
  });

  await mainWindow.loadURL(URL);

  writeLog("Fenêtre SONORA chargée.");
}

app.whenReady().then(async () => {
  try {
    writeLog("================================");
    writeLog("DÉMARRAGE DE SONORA");
    writeLog("Version : " + app.getVersion());
    writeLog("Plateforme : " + process.platform);
    writeLog("Ressources : " + process.resourcesPath);

    if (!loadLocalEnvironment()) {
      app.quit();
      return;
    }

    startServer();

    await waitForServer();

    await createWindow();

    writeLog("SONORA démarré avec succès.");
  } catch (error) {
    writeLog("[FATAL ERROR] " + (error.stack || error.message));

    dialog.showErrorBox(
      "Erreur SONORA",
      error.message || String(error)
    );

    app.quit();
  }
});

app.on("before-quit", () => {
  quitting = true;

  writeLog("Fermeture de SONORA.");

  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill();
    writeLog("Processus serveur arrêté.");
  }
});

app.on("window-all-closed", () => {
  app.quit();
});

process.on("uncaughtException", (error) => {
  writeLog("[UNCAUGHT EXCEPTION] " + (error.stack || error.message));
});

process.on("unhandledRejection", (reason) => {
  writeLog("[UNHANDLED REJECTION] " + String(reason));
});
