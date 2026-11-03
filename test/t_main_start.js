// Запуск оболочки программы (main.js) с подменённым Electron: сервер поднимается, окно открывается, маршруты CRM на месте.   node test/t_main_start.js
const Module = require('module'), os = require('os'), path = require('path'), fs = require('fs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sthel-'));
let loaded = null;
class BW { constructor(o) { this.webContents = { on(){}, setWindowOpenHandler(){}, session: { on(){} }, once(){}, send(){} }; } loadURL(u) { loaded = u; return Promise.resolve(); } on(){} once(){} show(){} focus(){} isMinimized(){ return false; } setMenu(){} setMenuBarVisibility(){} maximize(){} static getAllWindows(){ return []; } }
const handlers = {};
const electron = { app: { whenReady: () => Promise.resolve(), getPath: () => tmp, getVersion: () => '2.0.0', isPackaged: false, requestSingleInstanceLock: () => true, on(e, f) { handlers[e] = f; }, quit(){}, setAppUserModelId(){} },
  BrowserWindow: BW, dialog: {}, shell: {}, Menu: { setApplicationMenu(){}, buildFromTemplate(){ return {}; } }, session: { fromPartition: () => ({ fetch(){}, on(){} }), defaultSession: { on(){}, setPermissionRequestHandler(){}, webRequest: { onBeforeSendHeaders(){} } } },
  safeStorage: { isEncryptionAvailable: () => true, encryptString: s => Buffer.from(s), decryptString: b => b.toString() }, ipcMain: { handle(){}, on(){} }, nativeTheme: {} };
const orig = Module._load;
Module._load = function (req, parent, isMain) { if (req === 'electron') return electron; if (req === 'electron-updater') return { autoUpdater: { on(){}, checkForUpdates: () => Promise.resolve() } }; return orig.apply(this, arguments); };
process.on('unhandledRejection', e => { console.log('СБОЙ ЗАПУСКА:', e && e.stack || e); process.exit(1); });
process.on('uncaughtException', e => { console.log('СБОЙ ЗАПУСКА:', e && e.stack || e); process.exit(1); });
require(path.join(__dirname, '..', 'main.js'));
setTimeout(async () => {
  if (!loaded) { console.log('окно не открылось'); process.exit(1); }
  const u = new URL(loaded), t = u.searchParams.get('t');
  const r = await fetch(u.origin + '/api/sth/crm/state', { headers: { 'X-BM-Token': t } });
  if (r.status !== 200) { console.log('НЕ ТАК: CRM не отвечает', r.status); process.exit(1); } console.log('проверок 2 | ошибок нет: программа запускается, CRM отвечает');
  process.exit(0);
}, 2500);
