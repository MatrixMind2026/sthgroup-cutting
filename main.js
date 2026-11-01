const { app, BrowserWindow, ipcMain, dialog, shell, Menu, net } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const APP_NAME = 'STHGroup Cutting'; // рабочее название, программу переименуем позже
let win = null;

const userDir = () => app.getPath('userData');
const dbPath = () => path.join(userDir(), 'database.json');
const defaultMaterialsPath = () => path.join(userDir(), 'materials.json');
const smetaPath = () => path.join(userDir(), 'smeta-base.json');

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


// ---------- «Смета»: база материалов ----------
function decodeBuffer(buf, hint) {
  let enc = hint || '';
  if (!enc) {
    if (buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) enc = 'utf-8';
    else if (buf[0] === 0xFF && buf[1] === 0xFE) enc = 'utf-16le';
    else {
      const head = Buffer.from(buf.subarray(0, 300)).toString('latin1');
      const m = head.match(/encoding\s*=\s*["']([\w-]+)["']/i);
      if (m) enc = m[1];
    }
  }
  if (!enc) { try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (_) { enc = 'windows-1251'; } }
  try { return new TextDecoder(enc).decode(buf); } catch (_) { return new TextDecoder('utf-8').decode(buf); }
}

ipcMain.handle('smeta:load', () => {
  const f = smetaPath();
  try {
    if (!fs.existsSync(f)) return { path: f, data: null };
    return { path: f, data: JSON.parse(fs.readFileSync(f, 'utf8')) };
  } catch (e) {
    try { fs.copyFileSync(f, f + '.broken-' + Date.now()); } catch (_) {}
    return { path: f, data: null, error: 'Файл базы «Смета» был повреждён, копия сохранена рядом. Взята база из materials.json.' };
  }
});

ipcMain.handle('smeta:save', (_e, data) => {
  try {
    writeAtomic(smetaPath(), JSON.stringify(data));
    const day = new Date().toISOString().slice(0, 10);
    const bdir = path.join(userDir(), 'backups');
    const bfile = path.join(bdir, 'smeta-' + day + '.json');
    if (!fs.existsSync(bfile)) {
      fs.mkdirSync(bdir, { recursive: true });
      fs.copyFileSync(smetaPath(), bfile);
      const files = fs.readdirSync(bdir).filter(f => f.startsWith('smeta-')).sort();
      files.slice(0, Math.max(0, files.length - 30)).forEach(f => { try { fs.unlinkSync(path.join(bdir, f)); } catch (_) {} });
    }
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('smeta:pick', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Файл с материалами или ценами', properties: ['openFile'],
    filters: [{ name: 'XML и CSV', extensions: ['xml', 'csv', 'txt', 'tsv'] }, { name: 'Все файлы', extensions: ['*'] }] });
  if (r.canceled || !r.filePaths.length) return null;
  const p = r.filePaths[0];
  try {
    const buf = fs.readFileSync(p);
    if (buf.length > 60 * 1024 * 1024) return { error: 'Файл больше 60 МБ' };
    return { path: p, name: path.basename(p), text: decodeBuffer(buf) };
  } catch (e) { return { error: 'Не удалось прочитать файл: ' + e.message }; }
});

ipcMain.handle('fdb:read', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'База Базис-Мебельщика (NK_BAZE.FDB)', properties: ['openFile'],
    filters: [{ name: 'База Firebird', extensions: ['fdb', 'gdb'] }, { name: 'Все файлы', extensions: ['*'] }] });
  if (r.canceled || !r.filePaths.length) return null;
  const p = r.filePaths[0];
  try {
    const st = fs.statSync(p);
    if (st.size > 1024 * 1024 * 1024) return { error: 'Файл больше 1 ГБ' };
    const res = require('./core/fdb.js').readMaterials(fs.readFileSync(p));
    return { path: p, name: path.basename(p), records: res.records, groups: res.groups };
  } catch (e) { return { error: 'Не удалось прочитать базу: ' + e.message }; }
});

ipcMain.handle('smeta:export', async (_e, o) => {
  const ext = o.ext === 'csv' ? 'csv' : 'xml';
  const r = await dialog.showSaveDialog(win, { title: 'Экспорт базы материалов', defaultPath: path.join(app.getPath('documents'), o.name + '.' + ext),
    filters: [{ name: ext.toUpperCase(), extensions: [ext] }] });
  if (r.canceled || !r.filePath) return null;
  try { fs.writeFileSync(r.filePath, o.content, 'utf8'); return { path: r.filePath }; }
  catch (e) { return { error: e.message }; }
});

ipcMain.handle('link:fetch', async (_e, url) => {
  try {
    const u = new URL(String(url).trim());
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return { ok: false, error: 'Нужна ссылка http или https' };
    if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.0\.0\.0|\[)/i.test(u.hostname) || /^172\.(1[6-9]|2\d|3[01])\./.test(u.hostname)) return { ok: false, error: 'Локальные адреса не открываются' };
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 20000);
    const res = await net.fetch(u.toString(), { signal: ctl.signal, redirect: 'follow', headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml', 'Accept-Language': 'ru-RU,ru;q=0.9' } });
    const buf = Buffer.from(await res.arrayBuffer());
    clearTimeout(timer);
    if (!res.ok) return { ok: false, error: 'Сайт ответил кодом ' + res.status + (res.status === 403 || res.status === 401 ? ' (доступ закрыт для программ)' : '') };
    let cs = ((res.headers.get('content-type') || '').match(/charset=([\w-]+)/i) || [])[1] || '';
    if (!cs) { const m = buf.subarray(0, 4096).toString('latin1').match(/<meta[^>]+charset\s*=\s*["']?([\w-]+)/i); cs = m ? m[1] : ''; }
    return { ok: true, html: decodeBuffer(buf.subarray(0, 4 * 1024 * 1024), cs || 'utf-8'), url: res.url || u.toString() };
  } catch (e) {
    return { ok: false, error: e.name === 'AbortError' ? 'Сайт не ответил за 20 секунд' : 'Не удалось открыть страницу: ' + e.message };
  }
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
    filters: [{ name: 'Модель Базис (.b3d), .bmk или CSV из Excel', extensions: ['b3d', 'bmk', 'csv', 'txt', 'tsv'] }, { name: 'Все файлы', extensions: ['*'] }]
  });
  if (r.canceled || !r.filePaths[0]) return null;
  const file = r.filePaths[0];
  const ext = path.extname(file).toLowerCase();
  const buf = fs.readFileSync(file);
  const out = { path: file, name: path.basename(file), ext: ext };
  if (buf.length > 4 && buf.toString('latin1', 0, 4) === 'BZ85') { // .b3d Базис-Мебельщик
    try { out.parsed = require('./core/b3d.js').parse(buf, require('zlib')); out.kind = 'b3d'; }
    catch (e) { out.error = 'Не удалось прочитать модель .b3d: ' + e.message; }
  } else if (buf.length > 1 && buf[0] === 0x50 && buf[1] === 0x4b) { // PK — zip-архив
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
