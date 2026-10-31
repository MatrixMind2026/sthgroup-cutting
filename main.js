const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const APP_NAME = 'STHGroup Cutting'; // рабочее название, программу переименуем позже
let win = null;

const userDir = () => app.getPath('userData');
const dbPath = () => path.join(userDir(), 'database.json');
const defaultMaterialsPath = () => path.join(userDir(), 'materials.json');

function writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, text, 'utf8');
  fs.renameSync(tmp, file);
}

function sampleMaterials() {
  return {
    _comment: 'База материалов и фурнитуры. Ведите этот файл сами: размеры в мм, цены в рублях. Программа его только читает.',
    materials: [
      { id: 'ldsp16-white', name: 'ЛДСП 16 Белый', thickness: 16, sheetW: 2800, sheetH: 2070, servicePerM2: 350, salePerSheet: 2400, grain: false },
      { id: 'ldsp16-oak', name: 'ЛДСП 16 Дуб', thickness: 16, sheetW: 2800, sheetH: 2070, servicePerM2: 350, salePerSheet: 2800, grain: true },
      { id: 'mdf16', name: 'МДФ 16 под покраску', thickness: 16, sheetW: 2800, sheetH: 2070, servicePerM2: 450, salePerSheet: 3600, grain: false },
      { id: 'dvp3-white', name: 'ХДФ 3 Белый', thickness: 3, sheetW: 2800, sheetH: 2070, servicePerM2: 200, salePerSheet: 600, grain: false }
    ],
    edges: [
      { id: 'abs04-white', name: 'ABS 0,4 Белый', servicePerM: 20, salePerM: 15 },
      { id: 'abs2-white', name: 'ABS 2 Белый', servicePerM: 35, salePerM: 40 },
      { id: 'abs04-oak', name: 'ABS 0,4 Дуб', servicePerM: 20, salePerM: 18 }
    ],
    hardware: [
      { id: 'confirmat', name: 'Конфирмат 7×50', unit: 'шт.', salePrice: 3 },
      { id: 'eccentric', name: 'Эксцентрик 15 мм', unit: 'шт.', salePrice: 8 }
    ]
  };
}

function loadMaterials(customPath) {
  const file = customPath && fs.existsSync(customPath) ? customPath : defaultMaterialsPath();
  if (!fs.existsSync(file)) writeAtomic(file, JSON.stringify(sampleMaterials(), null, 2));
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
    return { ok: true, path: file, data: data };
  } catch (e) {
    return { ok: false, path: file, error: 'Файл базы материалов повреждён: ' + e.message, data: { materials: [], edges: [], hardware: [] } };
  }
}

function createWindow() {
  Menu.setApplicationMenu(null);
  win = new BrowserWindow({
    width: 1400, height: 880, minWidth: 1100, minHeight: 680,
    title: APP_NAME, backgroundColor: '#f3f1ec',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false }
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.on('closed', () => { win = null; });
}

function setupAutoUpdate() {
  if (!app.isPackaged) return;
  try {
    const { autoUpdater } = require('electron-updater');
    autoUpdater.autoDownload = true;
    autoUpdater.on('update-downloaded', (info) => {
      const r = dialog.showMessageBoxSync({ type: 'info', buttons: ['Перезапустить сейчас', 'Позже'], defaultId: 0,
        title: APP_NAME, message: 'Доступна новая версия ' + info.version, detail: 'Обновление скачано. Установится при перезапуске.' });
      if (r === 0) autoUpdater.quitAndInstall();
    });
    autoUpdater.on('error', () => {}); // нет сети или релиза — молча
    autoUpdater.checkForUpdates().catch(() => {});
  } catch (e) { /* без обновлений */ }
}

app.whenReady().then(() => {
  createWindow();
  setupAutoUpdate();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// ---------- IPC ----------
ipcMain.handle('app:info', () => ({ name: APP_NAME, version: app.getVersion(), dataDir: userDir() }));

ipcMain.handle('db:load', () => {
  try {
    if (!fs.existsSync(dbPath())) return { db: null };
    return { db: JSON.parse(fs.readFileSync(dbPath(), 'utf8')) };
  } catch (e) {
    // повреждённый файл: сохранить копию и начать с чистой базы
    try { fs.copyFileSync(dbPath(), dbPath() + '.broken-' + Date.now()); } catch (_) {}
    return { db: null, error: 'Файл базы заказов был повреждён, копия сохранена рядом. Начата новая база.' };
  }
});

ipcMain.handle('db:save', (_e, db) => {
  try {
    writeAtomic(dbPath(), JSON.stringify(db));
    // ежедневная резервная копия
    const day = new Date().toISOString().slice(0, 10);
    const bdir = path.join(userDir(), 'backups');
    const bfile = path.join(bdir, 'database-' + day + '.json');
    if (!fs.existsSync(bfile)) {
      fs.mkdirSync(bdir, { recursive: true });
      fs.copyFileSync(dbPath(), bfile);
      const files = fs.readdirSync(bdir).filter(f => f.startsWith('database-')).sort();
      files.slice(0, Math.max(0, files.length - 30)).forEach(f => { try { fs.unlinkSync(path.join(bdir, f)); } catch (_) {} });
    }
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('materials:load', (_e, customPath) => loadMaterials(customPath));

ipcMain.handle('materials:choose', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Файл базы материалов', properties: ['openFile'], filters: [{ name: 'JSON', extensions: ['json'] }] });
  if (r.canceled || !r.filePaths[0]) return null;
  return loadMaterials(r.filePaths[0]);
});

ipcMain.handle('shell:openDataDir', () => shell.openPath(userDir()));
ipcMain.handle('shell:openPath', (_e, p) => (p && fs.existsSync(p)) ? shell.openPath(p) : 'Файл не найден: ' + p);
ipcMain.handle('shell:showInFolder', (_e, p) => { if (p && fs.existsSync(p)) shell.showItemInFolder(p); });

ipcMain.handle('import:pick', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: 'Список деталей или модель', properties: ['openFile'],
    filters: [{ name: 'Модель .bmk или CSV из Excel', extensions: ['bmk', 'csv', 'txt', 'tsv'] }, { name: 'Все файлы', extensions: ['*'] }]
  });
  if (r.canceled || !r.filePaths[0]) return null;
  const file = r.filePaths[0];
  const ext = path.extname(file).toLowerCase();
  const buf = fs.readFileSync(file);
  const out = { path: file, name: path.basename(file), ext: ext };
  if (buf.length > 1 && buf[0] === 0x50 && buf[1] === 0x4b) { // PK — zip-архив
    try {
      const AdmZip = require('adm-zip');
      const zip = new AdmZip(buf);
      out.jsonTexts = zip.getEntries()
        .filter(en => !en.isDirectory && /\.json$/i.test(en.entryName))
        .map(en => ({ name: en.entryName, text: zip.readAsText(en) }));
      out.kind = 'zip';
    } catch (e) { out.error = 'Не удалось открыть архив: ' + e.message; }
  } else {
    let text = buf.toString('utf8');
    if (text.indexOf('�') >= 0 && (ext === '.csv' || ext === '.txt' || ext === '.tsv')) {
      try { text = new TextDecoder('windows-1251').decode(buf); } catch (_) {} // CSV из русского Excel
    }
    out.text = text; out.kind = 'text';
  }
  return out;
});

ipcMain.handle('csv:saveTemplate', async (_e, text) => {
  const r = await dialog.showSaveDialog(win, { title: 'Шаблон списка деталей', defaultPath: 'detali-shablon.csv', filters: [{ name: 'CSV', extensions: ['csv'] }] });
  if (r.canceled || !r.filePath) return null;
  fs.writeFileSync(r.filePath, text, 'utf8');
  return r.filePath;
});

ipcMain.handle('files:attach', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Прикрепить файлы к заказу', properties: ['openFile', 'multiSelections'] });
  if (r.canceled) return [];
  return r.filePaths.map(p => ({ path: p, name: path.basename(p), added: new Date().toISOString() }));
});

ipcMain.handle('pdf:make', async (_e, { html, name }) => {
  const r = await dialog.showSaveDialog(win, { title: 'Сохранить PDF', defaultPath: (name || 'document') + '.pdf', filters: [{ name: 'PDF', extensions: ['pdf'] }] });
  if (r.canceled || !r.filePath) return null;
  const tmp = path.join(os.tmpdir(), 'sth-cutting-' + Date.now() + '.html');
  fs.writeFileSync(tmp, html, 'utf8');
  const pw = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
  try {
    await pw.loadFile(tmp);
    const pdf = await pw.webContents.printToPDF({ pageSize: 'A4', printBackground: true, margins: { top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 } });
    fs.writeFileSync(r.filePath, pdf);
    return { path: r.filePath, name: path.basename(r.filePath) };
  } finally {
    pw.destroy();
    try { fs.unlinkSync(tmp); } catch (_) {}
  }
});
