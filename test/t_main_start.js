// Запуск оболочки программы (main.js) с подменённым Electron: сервер поднимается, окно открывается, маршруты CRM на месте.   node test/t_main_start.js
const Module = require('module'), os = require('os'), path = require('path'), fs = require('fs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sthel-'));
let loaded = null;
class BW { constructor(o) { this.webContents = { on(){}, setWindowOpenHandler(){}, session: { on(){} }, once(){}, send(){}, printToPDF: async () => Buffer.from('%PDF-test\n' + this.html) }; } loadURL(u) { loaded = u; return Promise.resolve(); } loadFile(file) { this.html = fs.readFileSync(file, 'utf8'); return Promise.resolve(); } destroy(){} on(){} once(){} show(){} focus(){} isMinimized(){ return false; } setMenu(){} setMenuBarVisibility(){} maximize(){} static getAllWindows(){ return []; } }
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
  if (r.status !== 200) { console.log('НЕ ТАК: CRM не отвечает', r.status); process.exit(1); }
  const pdfs = ['смета', 'счёт'].map(name => ({ path: path.join(tmp, 'новая папка', name + '.pdf'), html: '<h1>' + name + '</h1>' }));
  await Promise.all(pdfs.map(async d => {
    const res = await fetch(u.origin + '/api/pdf', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-BM-Token': t }, body: JSON.stringify(d) });
    if (!res.ok) throw new Error(await res.text());
    if (fs.readFileSync(d.path, 'utf8') !== '%PDF-test\n' + d.html) throw new Error('PDF содержит другой документ');
  }));
  if (fs.readdirSync(tmp).some(n => n.startsWith('sth-pdf-'))) throw new Error('Остались временные файлы PDF');
  console.log('проверок 5 | ошибок нет: запуск, CRM, две параллельные выгрузки PDF в новую папку и очистка временных файлов');
  process.exit(0);
}, 2500);
