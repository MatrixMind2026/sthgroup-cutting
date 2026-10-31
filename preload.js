const { contextBridge, ipcRenderer } = require('electron');

const call = (ch) => (...a) => ipcRenderer.invoke(ch, ...a);

contextBridge.exposeInMainWorld('api', {
  appInfo: call('app:info'),
  loadDb: call('db:load'),
  saveDb: call('db:save'),
  loadMaterials: call('materials:load'),
  chooseMaterials: call('materials:choose'),
  loadSmeta: call('smeta:load'),
  saveSmeta: call('smeta:save'),
  pickSmeta: call('smeta:pick'),
  exportSmeta: call('smeta:export'),
  fetchLink: call('link:fetch'),
  openDataDir: call('shell:openDataDir'),
  openPath: call('shell:openPath'),
  showInFolder: call('shell:showInFolder'),
  pickImport: call('import:pick'),
  saveCsvTemplate: call('csv:saveTemplate'),
  attachFiles: call('files:attach'),
  makePdf: call('pdf:make')
});
