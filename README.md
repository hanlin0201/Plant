# 桌面小植物 MVP

这是一个 Electron 桌面植物宠物 MVP。当前版本的设计目标不是“按钮调试面板”，而是更接近真实桌面宠物：

- 程序启动后先常驻 Windows 系统托盘。
- 桌面上只显示植物本体和气泡，不显示调试按钮。
- 植物窗口透明、无边框、置顶，不出现在任务栏应用列表里。
- 点击植物会互动说话，拖动植物可以移动窗口。
- 右键植物或右键托盘图标，可以隐藏植物、随机模拟一次数据或退出程序。
- 双击植物会隐藏桌面窗口，但程序仍在托盘后台运行。
- “隐藏植物”和“退出程序”是两个概念：隐藏只是不显示桌面宠物，退出才会结束应用。
- 状态由模拟传感器数据自动驱动，后续可以替换成真实硬件或数据库接口。

## 安装依赖

```bash
npm install
```

## 本地运行

```bash
npm run dev
```

运行后会出现：

运行后会先出现 Windows 系统托盘里的“小植物”图标。点击托盘图标后，桌面右下方附近会出现透明植物浮窗。

如果桌面植物被隐藏，可以再次点击托盘图标重新显示。

## 打包 Windows exe

```bash
npm run dist:win
```

打包产物会输出到 `dist` 目录。当前使用 `electron-builder` 的 NSIS 安装包目标。

## 交互说明

- 单击植物：出现一句互动文案。
- 拖动植物：移动桌面小组件位置。
- 右键植物：打开菜单，可隐藏、模拟一次数据、退出程序。
- 双击植物：隐藏桌面植物，程序继续在托盘运行。
- 点击托盘图标：显示或隐藏植物。
- 右键托盘图标：打开托盘菜单。

## 文件说明

- `main.js`：Electron 主进程，负责透明置顶窗口、系统托盘、菜单、隐藏/退出逻辑和窗口拖动。
- `preload.js`：安全桥接层，只暴露必要的窗口控制和事件监听 API。
- `renderer.js`：植物状态、气泡文案、自动模拟传感器、点击互动和拖拽手势逻辑。
- `index.html`：植物窗口的 DOM 结构。
- `styles.css`：透明窗口、气泡、植物动画和状态样式。
- `assets/`：预留给后续替换植物设计图。

## 状态逻辑

状态判断集中在 `renderer.js` 的 `decidePlantState(sensorData)`：

```js
function decidePlantState(sensorData) {
  if (sensorData.soilMoisture < 30) {
    return 'thirsty';
  }

  if (sensorData.temperature > 32) {
    return 'hot';
  }

  return 'normal';
}
```

当前规则：

- `soilMoisture < 30`：进入 `thirsty` 缺水状态
- `temperature > 32`：进入 `hot` 太热状态
- 其他情况：进入 `normal` 正常状态

## 自动数据驱动

现在 `renderer.js` 每 5 秒调用一次：

```js
getLatestSensorData()
```

当前这个函数内部暂时返回 `mockSensorData()`。也就是说，程序会自动生成模拟土壤湿度、温度、光照数据，并根据数据自动切换植物状态。状态变化时，植物会主动冒泡。

## 后续接数据库或真实硬件

建议不要让 Electron 直接强依赖数据库连接。更稳的方式是让硬件或数据库通过一个接口提供最新数据：

```text
真实硬件 / 数据库
        ↓
本地服务或远程 API
        ↓
Electron getLatestSensorData()
        ↓
decidePlantState(sensorData)
        ↓
植物状态和气泡
```

例如后续可以把 `getLatestSensorData()` 改成：

```js
async function getLatestSensorData() {
  const response = await fetch('http://localhost:3000/sensor/latest');
  return response.json();
}
```

接口返回结构保持一致即可：

```json
{
  "soilMoisture": 45,
  "temperature": 26,
  "light": 520
}
```

这样无论数据来自数据库、串口、蓝牙、HTTP 服务还是云端，都可以复用现有状态判断和 UI 逻辑。

## 替换植物形象

当前默认使用 `🌱` emoji 作为占位。你可以在 `assets/` 目录中放入以下图片文件：

- `plant-normal.png`
- `plant-thirsty.png`
- `plant-hot.png`
- `plant-idle.png`

只要文件存在，程序会自动用图片替换 emoji。图片不存在时会自动回退到 emoji，不影响运行。

气泡文案集中在 `renderer.js` 的 `bubbleLines` 对象里，后续可以按状态直接替换。
