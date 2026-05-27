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
  setMousePassthrough(enabled) {
    ipcRenderer.send('plant-window:set-ignore-mouse-events', Boolean(enabled));
  },
  getRuntimeConfig() {
    const supabaseUrl = process.env.VITE_SUPABASE_URL || "";
    const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || "";

    if (!supabaseUrl || !supabaseAnonKey) {
      console.warn(
        "[runtime config] Missing Supabase config. 请复制 .env.example 为 .env，并填写 Supabase anon key。"
      );
    }

    return {
      supabaseUrl,
      supabaseAnonKey,
      VITE_SUPABASE_URL: supabaseUrl,
      VITE_SUPABASE_ANON_KEY: supabaseAnonKey,
    };
  },
  onMockSensor(callback) {
    ipcRenderer.on('sensor:mock-once', callback);
  },
  onWindowShown(callback) {
    ipcRenderer.on('plant-window:shown', callback);
  }
});
