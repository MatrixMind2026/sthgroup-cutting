const { contextBridge, ipcRenderer, webFrame } = require('electron');

const call = (ch) => (...a) => ipcRenderer.invoke(ch, ...a);

contextBridge.exposeInMainWorld('api', {
  setZoom: (f) => { try { webFrame.setZoomFactor(Math.max(0.6, Math.min(2.5, f))); } catch (_) {} return webFrame.getZoomFactor(); },
  getZoom: () => webFrame.getZoomFactor(),
  appInfo: call('app:info'),
  loadDb: call('db:load'),
  saveDb: call('db:save'),
  loadMaterials: call('materials:load'),
  chooseMaterials: call('materials:choose'),
  loadSmeta: call('smeta:load'),
  saveSmeta: call('smeta:save'),
  pickSmeta: call('smeta:pick'),
  exportSmeta: call('smeta:export'),
  pickFdb: call('fdb:read'),
  fetchLink: call('link:fetch'),
  shopLogin: call('shop:login'),
  openDataDir: call('shell:openDataDir'),
  openPath: call('shell:openPath'),
  showInFolder: call('shell:showInFolder'),
  pickImport: call('import:pick'),
  saveCsvTemplate: call('csv:saveTemplate'),
  attachFiles: call('files:attach'),
  makePdf: call('pdf:make')
});
