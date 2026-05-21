const { contextBridge, ipcRenderer } = require('electron');

// preload.js is the safe bridge between the page and Electron.
// Keep this API small: the renderer can request window actions, but it cannot
// access Node.js, the filesystem, or arbitrary Electron internals.
contextBridge.exposeInMainWorld('plantPet', {
  hideWindow() {
    return ipcRenderer.invoke('plant-window:hide');
  },
  showWindow() {
    return ipcRenderer.invoke('plant-window:show');
  },
  openMenu() {
    return ipcRenderer.invoke('plant-window:popup-menu');
  },
  startDrag(point) {
    ipcRenderer.send('plant-window:drag-start', point);
  },
  moveDrag(point) {
    ipcRenderer.send('plant-window:drag-move', point);
  },
  endDrag() {
    ipcRenderer.send('plant-window:drag-end');
  },
  sendChatMessage(payload) {
    return ipcRenderer.invoke('plant-chat:send', payload);
  },
  onMockSensor(callback) {
    ipcRenderer.on('sensor:mock-once', callback);
  },
  onWindowShown(callback) {
    ipcRenderer.on('plant-window:shown', callback);
  }
});
