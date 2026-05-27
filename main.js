const fs = require("fs");
const {
  app,
  BrowserWindow,
  Menu,
  Tray,
  ipcMain,
  nativeImage,
  screen,
} = require("electron");
const path = require("path");

loadRuntimeEnv();

let mainWindow = null;
let tray = null;
let isQuitting = false;
let dragSession = null;
let isIgnoringMouseEvents = false;

const WINDOW_SIZE = {
  width: 700,
  height: 700,
};

// This Electron app does not use a Vite build step, so VITE_* variables are
// not injected automatically. Load only the safe public Supabase config from
// .env for the preload bridge; never read service_role, AI keys, or passwords.
function loadRuntimeEnv() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) {
    return;
  }

  const allowedKeys = new Set(["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"]);

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    if (!allowedKeys.has(key) || process.env[key]) {
      continue;
    }

    process.env[key] = parseEnvValue(trimmed.slice(separatorIndex + 1));
  }
}

function parseEnvValue(value) {
  const trimmed = value.trim();
  const quote = trimmed[0];
  if ((quote === '"' || quote === "'") && trimmed.endsWith(quote)) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

// main.js is Electron's main process. It owns native desktop behavior:
// transparent window creation, tray/menu lifecycle, hide-vs-quit behavior,
// and manual window dragging.
function createWindow() {
  mainWindow = new BrowserWindow({
    width: WINDOW_SIZE.width,
    height: WINDOW_SIZE.height,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    backgroundColor: "#00000000",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.setAlwaysOnTop(true, "screen-saver");
  mainWindow.loadFile("index.html");

  mainWindow.once("ready-to-show", () => {
    placeWindowNearTray();
    refreshTrayMenu();
  });

  mainWindow.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      hidePlantWindow();
    }
  });

  // Uncomment this while developing if you need DevTools.
  // mainWindow.webContents.openDevTools({ mode: 'detach' });
}

function createTray() {
  tray = new Tray(createTrayIcon());
  tray.setToolTip("桌面小植物");
  tray.setContextMenu(buildTrayMenu());

  tray.on("click", () => {
    togglePlantWindow();
  });
}

function buildTrayMenu() {
  const isVisible = Boolean(mainWindow && mainWindow.isVisible());

  return Menu.buildFromTemplate([
    {
      label: isVisible ? "隐藏植物" : "显示植物",
      click: () => togglePlantWindow(),
    },
    {
      label: "随机模拟一次数据",
      click: () => sendToRenderer("sensor:mock-once"),
    },
    {
      type: "separator",
    },
    {
      label: "退出程序",
      click: quitApp,
    },
  ]);
}

function refreshTrayMenu() {
  if (tray) {
    tray.setContextMenu(buildTrayMenu());
  }
}

function createTrayIcon() {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
      <rect width="32" height="32" rx="8" fill="#1f8f58"/>
      <path d="M16 25c0-5 0-10 0-15" stroke="#f2fff7" stroke-width="2.8" stroke-linecap="round"/>
      <path d="M16 14c-6-.2-9-3.4-9-7 6 .1 9.4 3.2 9 7Z" fill="#c9f7d9"/>
      <path d="M16 15c6-.2 9-3.4 9-7-6 .1-9.4 3.2-9 7Z" fill="#e3ffe9"/>
      <ellipse cx="16" cy="25" rx="8" ry="3" fill="#8b5e34"/>
    </svg>`;
  return nativeImage.createFromDataURL(
    `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
  );
}

function placeWindowNearTray() {
  if (!mainWindow) {
    return;
  }

  const display = screen.getPrimaryDisplay();
  const { x, y, width, height } = display.workArea;
  const margin = 18;

  mainWindow.setBounds({
    x: Math.round(x + width - WINDOW_SIZE.width - margin),
    y: Math.round(y + height - WINDOW_SIZE.height - margin),
    width: WINDOW_SIZE.width,
    height: WINDOW_SIZE.height,
  });
}

function showPlantWindow() {
  if (!mainWindow) {
    createWindow();
    return;
  }

  if (!mainWindow.isVisible()) {
    mainWindow.showInactive();
  }

  mainWindow.moveTop();
  mainWindow.webContents.send("plant-window:shown");
  refreshTrayMenu();
}

function hidePlantWindow() {
  if (mainWindow) {
    mainWindow.hide();
  }

  refreshTrayMenu();
}

function togglePlantWindow() {
  if (!mainWindow || !mainWindow.isVisible()) {
    showPlantWindow();
  } else {
    hidePlantWindow();
  }
}

function quitApp() {
  isQuitting = true;
  app.quit();
}

function sendToRenderer(channel, payload) {
  if (!mainWindow) {
    return;
  }

  showPlantWindow();
  mainWindow.webContents.send(channel, payload);
}

app.whenReady().then(() => {
  createWindow();
  createTray();

  app.on("activate", () => {
    showPlantWindow();
  });
});

app.on("before-quit", () => {
  isQuitting = true;
});

app.on("window-all-closed", () => {
  // Keep the app alive in the tray unless the user chooses "退出程序".
});

ipcMain.handle("plant-window:hide", () => {
  hidePlantWindow();
});

ipcMain.handle("plant-window:show", () => {
  showPlantWindow();
});

ipcMain.handle("plant-window:popup-menu", () => {
  const menu = Menu.buildFromTemplate([
    {
      label: "隐藏植物",
      click: hidePlantWindow,
    },
    {
      label: "随机模拟一次数据",
      click: () => sendToRenderer("sensor:mock-once"),
    },
    {
      type: "separator",
    },
    {
      label: "退出程序",
      click: quitApp,
    },
  ]);

  menu.popup({ window: mainWindow });
});

ipcMain.on("plant-window:set-ignore-mouse-events", (_event, shouldIgnore) => {
  if (!mainWindow || isIgnoringMouseEvents === shouldIgnore) {
    return;
  }

  isIgnoringMouseEvents = shouldIgnore;
  mainWindow.setIgnoreMouseEvents(shouldIgnore, { forward: true });
});

ipcMain.on("plant-window:drag-start", (_event, point) => {
  if (!mainWindow) {
    return;
  }

  dragSession = {
    startMouse: point,
    startWindow: mainWindow.getPosition(),
  };
});

ipcMain.on("plant-window:drag-move", (_event, point) => {
  if (!mainWindow || !dragSession) {
    return;
  }

  const [startX, startY] = dragSession.startWindow;
  const dx = point.x - dragSession.startMouse.x;
  const dy = point.y - dragSession.startMouse.y;
  mainWindow.setPosition(
    Math.round(startX + dx),
    Math.round(startY + dy),
    false,
  );
});

ipcMain.on("plant-window:drag-end", () => {
  dragSession = null;
});
