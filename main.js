/* STHGroup — оболочка Electron вокруг окна (копия окна BazisReborn в папке web).
   Окно общается с программой по локальному адресу /api/* (server.js) — так же, как с программой BazisReborn.
   Обновления — как раньше: GitHub Releases этого репозитория через electron-updater. */
'use strict';
const { app, BrowserWindow, dialog, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const server = require('./server');

const APP_NAME = 'STHGroup';
let win = null, srv = null;

// файл проекта из командной строки (скрипт выгрузки STHGroup открывает программу с файлом .bmk)
function fileArg(argv) {
  const a = (argv || []).slice(1).filter(function (x) { return /\.bmk$/i.test(x) && fs.existsSync(x); });
  return a.length ? path.resolve(a[a.length - 1]) : '';
}

if (!app.requestSingleInstanceLock()) { app.quit(); }
else {
  app.on('second-instance', function (_e, argv) {
    const f = fileArg(argv);
    if (srv && f) srv.activate(f);
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });
}

const SHOP_PARTITION = 'persist:shops'; // общий профиль для магазинов: вход сохраняется между запусками
const SHOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
function checkShopUrl(url) {
  const u = new URL(String(url).trim());
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('Нужна ссылка http или https');
  if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.0\.0\.0|\[)/i.test(u.hostname) || /^172\.(1[6-9]|2\d|3[01])\./.test(u.hostname)) throw new Error('Локальные адреса не открываются');
  return u;
}

function dialogFilters(d) {
  return (d.filters || []).map(function (f) { return { name: f.name || '', extensions: (f.ext || []).map(function (e) { return String(e).replace(/^\*?\./, ''); }) }; });
}

const hooks = {
  dialog: async function (d) {
    const o = { title: d.title || '', defaultPath: d.dir ? (d.name ? path.join(d.dir, d.name) : d.dir) : (d.name || undefined), filters: dialogFilters(d) };
    if (d.kind === 'save') { const r = await dialog.showSaveDialog(win, o); return r.canceled ? null : r.filePath; }
    if (d.kind === 'folder') { o.properties = ['openDirectory', 'createDirectory']; const r = await dialog.showOpenDialog(win, o); return r.canceled ? null : r.filePaths[0]; }
    o.properties = ['openFile']; const r = await dialog.showOpenDialog(win, o); return r.canceled ? null : r.filePaths[0];
  },
  // PDF: страница печатается встроенным Chromium (у BazisReborn — через Edge)
  pdf: async function (html, out) {
    const tmp = path.join(app.getPath('temp'), 'sth-pdf-' + Date.now() + '.html');
    fs.writeFileSync(tmp, html, 'utf8');
    const w = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: true } });
    try {
      await w.loadFile(tmp);
      await new Promise(function (r) { setTimeout(r, 300); });
      const pdf = await w.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true, margins: { marginType: 'none' } });
      fs.writeFileSync(out, pdf);
    } finally { w.destroy(); try { fs.unlinkSync(tmp); } catch (e) { /* нет */ } }
  },
  open: async function (p) { const e = await shell.openPath(p); if (e) throw new Error(e); },
  openUrl: async function (u) { await shell.openExternal(u); },
  zoom: function (z) { if (win) win.webContents.setZoomFactor(z); },
  title: function (t) { if (win) win.setTitle(String(t).replace(/BazisReborn/g, APP_NAME)); },
  quit: function () { app.quit(); },
  toFront: function () { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } }
};

// Дополнительные команды STHGroup: вход на сайт магазина и чтение страницы товара под этим входом.
function shopRoutes() {
  function json(res, code, v) { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(v)); }
  function jbody(req) { return new Promise(function (ok) { const ch = []; req.on('data', function (c) { ch.push(c); }); req.on('end', function () { try { ok(JSON.parse(Buffer.concat(ch).toString('utf8') || '{}')); } catch (e) { ok({}); } }); }); }
  return {
    'POST /api/shop/login': async function (req, res) {
      const d = await jbody(req);
      try {
        const u = checkShopUrl(d.url);
        await new Promise(function (resolve) {
          const w = new BrowserWindow({ width: 1100, height: 800, parent: win || undefined, title: 'Вход на сайт: ' + u.hostname, autoHideMenuBar: true,
            webPreferences: { partition: SHOP_PARTITION, contextIsolation: true, sandbox: true } });
          w.webContents.setUserAgent(SHOP_UA);
          w.webContents.setWindowOpenHandler(function (x) { w.loadURL(x.url); return { action: 'deny' }; });
          w.on('closed', resolve);
          w.loadURL(u.origin + '/').catch(function () {});
        });
        json(res, 200, { ok: true });
      } catch (e) { json(res, 400, { error: e.message }); }
    },
    'POST /api/shop/fetch': async function (req, res) {
      const d = await jbody(req); let w = null;
      try {
        const u = checkShopUrl(d.url);
        w = new BrowserWindow({ show: false, width: 1280, height: 900, webPreferences: { partition: SHOP_PARTITION, contextIsolation: true, sandbox: true, backgroundThrottling: false } });
        w.webContents.setUserAgent(SHOP_UA);
        await Promise.race([w.loadURL(u.toString()), new Promise(function (_, rej) { setTimeout(function () { rej(new Error('Сайт не ответил за 25 секунд')); }, 25000); })]);
        await new Promise(function (r) { setTimeout(r, 2500); }); // дать скриптам дорисовать цену
        const html = await w.webContents.executeJavaScript('document.documentElement.outerHTML');
        json(res, 200, { ok: true, html: String(html || '').slice(0, 4 * 1024 * 1024), url: w.webContents.getURL() || u.toString() });
      } catch (e) { json(res, 502, { error: e.message }); }
      finally { if (w && !w.isDestroyed()) w.destroy(); }
    }
  };
}

function createWindow(url) {
  Menu.setApplicationMenu(null);
  win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1000, minHeight: 640, title: APP_NAME, backgroundColor: '#f3f1ec',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  const origin = new URL(url).origin;
  // окно «База материалов» открывается через window.open — пускаем только свои страницы
  win.webContents.setWindowOpenHandler(function (d) {
    if (d.url.indexOf(origin + '/') === 0) {
      return { action: 'allow', overrideBrowserWindowOptions: { width: 1400, height: 900, autoHideMenuBar: true, icon: path.join(__dirname, 'assets', 'icon.png'), webPreferences: { contextIsolation: true, sandbox: true } } };
    }
    if (/^https?:/i.test(d.url)) shell.openExternal(d.url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', function (e, u) { if (u.indexOf(origin + '/') !== 0) { e.preventDefault(); if (/^https?:/i.test(u)) shell.openExternal(u); } });
  win.webContents.on('page-title-updated', function (e, t) { e.preventDefault(); win.setTitle(String(t).replace(/BazisReborn/g, APP_NAME)); });
  win.loadURL(url);
  win.on('closed', function () { win = null; });
}

function setupAutoUpdate() {
  if (!app.isPackaged) return;
  try {
    const { autoUpdater } = require('electron-updater');
    autoUpdater.autoDownload = true;
    autoUpdater.on('update-downloaded', function (info) {
      const r = dialog.showMessageBoxSync({ type: 'info', buttons: ['Перезапустить сейчас', 'Позже'], defaultId: 0,
        title: APP_NAME, message: 'Доступна новая версия ' + info.version, detail: 'Обновление скачано. Установится при перезапуске.' });
      if (r === 0) autoUpdater.quitAndInstall();
    });
    autoUpdater.on('error', function () {}); // нет сети или выпуска — молча
    autoUpdater.checkForUpdates().catch(function () {});
  } catch (e) { /* без обновлений */ }
}

app.whenReady().then(async function () {
  const dataDir = app.getPath('userData');
  // путь к программе — для скрипта выгрузки (он открывает проект в STHGroup); скрипт в БАЗИСе обновляется вместе с программой
  if (app.isPackaged) {
    try { fs.mkdirSync(dataDir, { recursive: true }); fs.writeFileSync(path.join(dataDir, 'exe.txt'), process.execPath, 'utf8'); } catch (e) { /* нет */ }
    try {
      const set = JSON.parse(fs.readFileSync(path.join(dataDir, 'settings.json'), 'utf8'));
      if (set.sthScripts && fs.existsSync(set.sthScripts)) server.installScript(set.sthScripts, path.join(__dirname, 'bazis'), process.execPath);
    } catch (e) { /* скрипт ещё не ставили */ }
  }
  srv = await server.start({
    webDir: path.join(__dirname, 'web'), dataDir: dataDir, version: app.getVersion(), bazisDir: path.join(__dirname, 'bazis'), exePath: process.execPath,
    file: fileArg(process.argv), hooks: hooks, extraRoutes: shopRoutes
  });
  createWindow(srv.url);
  setupAutoUpdate();
});
app.on('window-all-closed', function () { app.quit(); });
