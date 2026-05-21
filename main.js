const { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage, screen } = require('electron');
const fs = require('fs/promises');
const path = require('path');

let mainWindow = null;
let tray = null;
let isQuitting = false;
let dragSession = null;

const WINDOW_SIZE = {
  width: 520,
  height: 420
};

const SILICONFLOW_API_URL = 'https://api.siliconflow.cn/v1/chat/completions';
const SILICONFLOW_MODEL = 'Qwen/Qwen3.5-27B';
const MAX_CHAT_HISTORY_ITEMS = 8;
const promptCache = new Map();

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
    backgroundColor: '#00000000',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.setAlwaysOnTop(true, 'screen-saver');
  mainWindow.loadFile('index.html');

  mainWindow.once('ready-to-show', () => {
    placeWindowNearTray();
    refreshTrayMenu();
  });

  mainWindow.on('close', (event) => {
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
  tray.setToolTip('桌面小植物');
  tray.setContextMenu(buildTrayMenu());

  tray.on('click', () => {
    togglePlantWindow();
  });
}

function buildTrayMenu() {
  const isVisible = Boolean(mainWindow && mainWindow.isVisible());

  return Menu.buildFromTemplate([
    {
      label: isVisible ? '隐藏植物' : '显示植物',
      click: () => togglePlantWindow()
    },
    {
      label: '随机模拟一次数据',
      click: () => sendToRenderer('sensor:mock-once')
    },
    {
      type: 'separator'
    },
    {
      label: '退出程序',
      click: quitApp
    }
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
  return nativeImage.createFromDataURL(`data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`);
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
    height: WINDOW_SIZE.height
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
  mainWindow.webContents.send('plant-window:shown');
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

  app.on('activate', () => {
    showPlantWindow();
  });
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('window-all-closed', () => {
  // Keep the app alive in the tray unless the user chooses "退出程序".
});

ipcMain.handle('plant-window:hide', () => {
  hidePlantWindow();
});

ipcMain.handle('plant-window:show', () => {
  showPlantWindow();
});

ipcMain.handle('plant-chat:send', async (_event, payload) => {
  return sendPlantChat(payload);
});

ipcMain.handle('plant-window:popup-menu', () => {
  const menu = Menu.buildFromTemplate([
    {
      label: '隐藏植物',
      click: hidePlantWindow
    },
    {
      label: '随机模拟一次数据',
      click: () => sendToRenderer('sensor:mock-once')
    },
    {
      type: 'separator'
    },
    {
      label: '退出程序',
      click: quitApp
    }
  ]);

  menu.popup({ window: mainWindow });
});

ipcMain.on('plant-window:drag-start', (_event, point) => {
  if (!mainWindow) {
    return;
  }

  dragSession = {
    startMouse: point,
    startWindow: mainWindow.getPosition()
  };
});

ipcMain.on('plant-window:drag-move', (_event, point) => {
  if (!mainWindow || !dragSession) {
    return;
  }

  const [startX, startY] = dragSession.startWindow;
  const dx = point.x - dragSession.startMouse.x;
  const dy = point.y - dragSession.startMouse.y;
  mainWindow.setPosition(Math.round(startX + dx), Math.round(startY + dy), false);
});

ipcMain.on('plant-window:drag-end', () => {
  dragSession = null;
});

async function sendPlantChat(payload = {}) {
  const apiKey = process.env.SILICONFLOW_API_KEY;

  if (!apiKey) {
    return {
      ok: false,
      error: '还没有配置 SiliconFlow API Key'
    };
  }

  try {
    const personality = normalizePersonality(payload.personality);
    const systemPrompt = await readPersonalityPrompt(personality);
    const sensorData = formatSensorDataForPrompt(payload.sensorData, payload.currentState);
    const chatHistory = formatChatHistoryForPrompt(payload.history);
    const userText = typeof payload.text === 'string' ? payload.text.trim() : '';

    if (!userText) {
      return {
        ok: false,
        error: '请输入聊天内容'
      };
    }

    const response = await fetch(SILICONFLOW_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: SILICONFLOW_MODEL,
        messages: [
          {
            role: 'system',
            content: systemPrompt
              .replace('{{sensor_data}}', sensorData)
              .replace('{{chat_history}}', chatHistory)
          },
          {
            role: 'user',
            content: userText
          }
        ],
        temperature: 0.9,
        max_tokens: 150,
        enable_thinking: false
      })
    });

    if (!response.ok) {
      return {
        ok: false,
        error: `SiliconFlow 请求失败：${response.status}`
      };
    }

    const data = await response.json();
    const reply = data?.choices?.[0]?.message?.content?.trim();

    if (!reply) {
      return {
        ok: false,
        error: '模型暂时没有返回内容'
      };
    }

    return {
      ok: true,
      reply
    };
  } catch (error) {
    return {
      ok: false,
      error: `连接失败：${error.message}`
    };
  }
}

function normalizePersonality(personality) {
  return personality === 'sassy' ? 'sassy' : 'healing';
}

async function readPersonalityPrompt(personality) {
  const normalized = normalizePersonality(personality);

  if (promptCache.has(normalized)) {
    return promptCache.get(normalized);
  }

  const promptPath = path.join(__dirname, 'prompts', `${normalized}.md`);
  const file = await fs.readFile(promptPath, 'utf8');
  const match = file.match(/```([\s\S]*?)```/);
  const prompt = (match ? match[1] : file).trim();
  promptCache.set(normalized, prompt);
  return prompt;
}

function formatSensorDataForPrompt(sensorData = {}, currentState = 'normal') {
  const soilMoisture = formatValue(sensorData.soilMoisture ?? sensorData.soil_moisture, '%');
  const temperature = formatValue(sensorData.temperature, '°C');
  const airHumidity = formatValue(sensorData.airHumidity ?? sensorData.air_humidity, '%');
  const light = formatValue(sensorData.light ?? sensorData.light_lux, ' lux');

  return [
    '当前传感器数据：',
    `- 土壤湿度: ${soilMoisture}`,
    `- 环境温度: ${temperature}`,
    `- 空气湿度: ${airHumidity}`,
    `- 光照强度: ${light}`,
    `- 当前状态: ${currentState || 'normal'}`
  ].join('\n');
}

function formatChatHistoryForPrompt(history = []) {
  const safeHistory = Array.isArray(history) ? history.slice(-MAX_CHAT_HISTORY_ITEMS) : [];

  if (safeHistory.length === 0) {
    return '最近对话：暂无';
  }

  const lines = safeHistory.map((item) => {
    const speaker = item.role === 'plant' ? '植物' : '主人';
    const text = typeof item.text === 'string' ? item.text : '';
    return `[${speaker}] ${text}`;
  });

  return ['最近对话：', ...lines].join('\n');
}

function formatValue(value, unit) {
  if (value === undefined || value === null || value === '') {
    return '未知';
  }

  return `${value}${unit}`;
}
