/* STHGroup — оболочка Electron вокруг окна (копия окна BazisReborn в папке web).
   Окно общается с программой по локальному адресу /api/* (server.js) — так же, как с программой BazisReborn.
   Обновления — GitHub Releases этого репозитория и папка на диске (sth_folder_update.js), берётся самая новая версия.
   Принудительная проверка — кнопка «Проверить обновления» в настройках: окно зовёт /api/upd/check,
   сервер передаёт вызов сюда (hooks.updCheck), а проверяет и качает electron-updater. */
'use strict';
const { app, BrowserWindow, dialog, shell, Menu, session, safeStorage, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const server = require('./server');
const backupRoutes = require('./sth_backup'); // STHGroup 2.0
const crmRoutes = require('./sth_crm'); // STHGroup 2.0
const windowState = require('./sth_window_state'); // STHGroup: положение, размер и состояние окна
const folderUpd = require('./sth_folder_update'); // STHGroup 11.11.2026: обновления и из папки на диске

const APP_NAME = 'STHGroup';
let win = null, srv = null;

// ---- обновления: что знает оболочка (показывается в настройках, вкладка «Обновления») ----
const upd = { status: 'idle', latest: '', checked: 0, problem: '' };
let updChecking = false; // принудительная проверка уже идёт — вторую не запускаем

function updRepo() { // репозиторий выпусков из package.json — для подсказки в настройках
  try { const p = require('./package.json'); const pub = p.build && p.build.publish && p.build.publish[0]; if (pub && pub.owner && pub.repo) return pub.owner + '/' + pub.repo; } catch (e) { /* нет */ }
  return '';
}
function updErrText(e) {
  const m = String((e && e.message) || e || '');
  if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|net::|network|timed out/i.test(m)) return 'Нет связи с сервером обновлений. Проверьте интернет и попробуйте ещё раз.';
  if (/\b404\b/.test(m)) return 'Сервер обновлений ответил: выпусков не найдено.';
  if (/\b(401|403)\b/.test(m)) return 'Сервер обновлений отказал в доступе.';
  return m.slice(0, 300);
}

// Проверка обновлений: GitHub и папка на диске, берётся самая новая версия, она же качается.
// Возвращает { status: 'available' | 'none', version, source: 'github' | 'folder' }; ошибка — если не ответил ни один источник.
let feedIsFolder = false;
async function checkBoth() {
  const { autoUpdater } = require('electron-updater');
  const cur = app.getVersion();
  const dir = folderUpd.folderDir(app.getPath('userData'));
  const fv = folderUpd.folderVersion(dir);
  autoUpdater.autoDownload = false; // качаем сами — после выбора источника
  if (feedIsFolder) { const pub = require('./package.json').build.publish[0]; autoUpdater.setFeedURL(pub); feedIsFolder = false; }
  let gv = null, gErr = null;
  try { const r = await autoUpdater.checkForUpdates(); gv = (r && r.updateInfo && r.updateInfo.version) || null; } catch (e) { gErr = e; }
  const src = folderUpd.pick(cur, gv, fv);
  if (!src) {
    if (gErr && !fv) throw gErr; // ни GitHub, ни папки
    return { status: 'none', current: cur };
  }
  if (src === 'folder') {
    autoUpdater.setFeedURL({ provider: 'generic', url: await folderUpd.serve(dir) });
    feedIsFolder = true;
    await autoUpdater.checkForUpdates();
  }
  autoUpdater.downloadUpdate().catch(function (e) { upd.status = 'error'; upd.problem = updErrText(e); });
  return { status: 'available', current: cur, version: src === 'folder' ? fv : gv, source: src };
}

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
const PICK_IMAGE_JS = `(function () {
  var c = [];
  function add(u, s) { try { if (u && !/^data:/i.test(u)) c.push({ u: new URL(u, location.href).href, s: s }); } catch (e) {} }
  var m = document.querySelector('meta[property="og:image"], meta[name="og:image"], meta[property="og:image:url"]'); if (m) add(m.content, 1e12);
  var it = document.querySelector('[itemprop="image"]'); if (it) add(it.content || it.src || it.href || it.getAttribute('data-src'), 9e11);
  var l = document.querySelector('link[rel="image_src"]'); if (l) add(l.href, 8e11);
  [].forEach.call(document.images, function (i) {
    var r = i.getBoundingClientRect(), a = r.width * r.height, src = i.currentSrc || i.src || i.getAttribute('data-src') || '';
    if (a < 12000 || !src || /logo|icon|sprite|banner|avatar|placeholder|\\.svg(\\?|$)/i.test(src + ' ' + (i.className || '') + ' ' + (i.alt || ''))) return;
    var top = r.top + window.scrollY; add(src, a * (top < 1200 ? 1 : 0.3));
  });
  c.sort(function (x, y) { return y.s - x.s; });
  return c.length ? c[0].u : '';
})()`;
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
    const dir = fs.mkdtempSync(path.join(app.getPath('temp'), 'sth-pdf-'));
    const tmp = path.join(dir, 'document.html');
    let w;
    try {
      fs.writeFileSync(tmp, html, 'utf8');
      w = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: true } });
      await w.loadFile(tmp);
      await new Promise(function (r) { setTimeout(r, 300); });
      const pdf = await w.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true, margins: { marginType: 'none' } });
      server.writeAtomic(out, pdf);
    } finally {
      if (w) w.destroy();
      try { fs.unlinkSync(tmp); } catch (e) { /* файл мог не создаться */ }
      try { fs.rmdirSync(dir); } catch (e) { /* временная папка */ }
    }
  },
  open: async function (p) { const e = await shell.openPath(p); if (e) throw new Error(e); },
  openUrl: async function (u) { await shell.openExternal(u); },
  zoom: function (z) { if (win) win.webContents.setZoomFactor(z); },
  title: function (t) { if (win) win.setTitle(String(t).replace(/BazisReborn/g, APP_NAME)); },
  quit: function () { app.quit(); },
  toFront: function () { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } },
  // состояние обновлений для вкладки «Обновления» в настройках
  updState: function () {
    return { current: app.getVersion(), edition: 'sth', hasKey: app.isPackaged, keySrc: '', problem: upd.problem, repo: updRepo(), checked: upd.checked, seen: upd.latest, publisher: null, status: upd.status, packaged: app.isPackaged, folder: folderUpd.folderDir(app.getPath('userData')) };
  },
  // принудительная проверка: кнопка «Проверить обновления» — GitHub и папка (checkBoth). Новая версия качается сама,
  // по готовности показывается окно «Доступна новая версия» из setupAutoUpdate.
  updCheck: async function () {
    if (!app.isPackaged) return { status: 'dev', current: app.getVersion() };
    if (updChecking) return { status: 'checking', current: app.getVersion() };
    updChecking = true;
    try {
      const r = await Promise.race([checkBoth(), new Promise(function (_, no) { setTimeout(function () { no(new Error('timed out')); }, 40000); })]);
      upd.checked = Date.now(); // «проверено …» на вкладке «Обновления»
      if (r.status === 'available') { upd.status = 'available'; upd.latest = r.version; upd.problem = ''; }
      return r;
    } catch (e) { upd.checked = Date.now(); return { status: 'error', current: app.getVersion(), message: updErrText(e) }; }
    finally { updChecking = false; }
  }
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
        // фото товара: og:image / itemprop=image, иначе самая большая картинка в верхней части страницы (без логотипов и значков)
        let image = '';
        try { image = String(await w.webContents.executeJavaScript(PICK_IMAGE_JS) || ''); } catch (e) { image = ''; }
        json(res, 200, { ok: true, html: String(html || '').slice(0, 4 * 1024 * 1024), url: w.webContents.getURL() || u.toString(), image: image });
      } catch (e) { json(res, 502, { error: e.message }); }
      finally { if (w && !w.isDestroyed()) w.destroy(); }
    },
    // фото товара с сайта магазина — картинкой в базу (data:), под тем же входом; не больше 3 МБ
    'POST /api/shop/image': async function (req, res) {
      const d = await jbody(req);
      try {
        const u = checkShopUrl(d.url);
        const r = await session.fromPartition(SHOP_PARTITION).fetch(u.toString(), { headers: { 'User-Agent': SHOP_UA } });
        const type = String(r.headers.get('content-type') || '').split(';')[0].trim();
        if (!r.ok || !/^image\//.test(type)) throw new Error('по ссылке не картинка');
        const b = Buffer.from(await r.arrayBuffer());
        if (b.length > 3 * 1024 * 1024) throw new Error('картинка больше 3 МБ');
        json(res, 200, { ok: true, data: 'data:' + type + ';base64,' + b.toString('base64') });
      } catch (e) { json(res, 502, { error: e.message }); }
    }
  };
}

/* STHGroup: ссылки «в новой вкладке» внутри встроенной CRM открываются там же, не в браузере */
app.on('web-contents-created', function (e, contents) {
  if (contents.getType() !== 'webview') return;
  contents.setWindowOpenHandler(function (d) { if (/^https?:/i.test(d.url)) contents.loadURL(d.url); return { action: 'deny' }; });
});

function createWindow(url) {
  Menu.setApplicationMenu(null);
  const stateFile = path.join(app.getPath('userData'), 'window-state.json');
  const previous = windowState.read(stateFile);
  const placement = windowState.restore(previous, screen ? screen.getAllDisplays() : [], screen && screen.getPrimaryDisplay());
  win = new BrowserWindow({
    ...placement.bounds, minWidth: placement.minWidth, minHeight: placement.minHeight, show: false, title: APP_NAME, backgroundColor: '#202327',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, webviewTag: true }   // STHGroup: webview — CRM внутри программы
  });
  windowState.track(win, stateFile, screen, previous);
  win.once('ready-to-show', function () { if (placement.maximized) win.maximize(); if (placement.fullscreen) win.setFullScreen(true); win.show(); });
  const origin = new URL(url).origin;
  /* STHGroup: встроенный сайт (CRM) — только http(s), без доступа к компьютеру, своё хранилище входа */
  win.webContents.on('will-attach-webview', function (e, wp, params) {
    delete wp.preload; delete wp.preloadURL;
    wp.nodeIntegration = false; wp.contextIsolation = true; wp.sandbox = true; wp.webSecurity = true;
    if (!/^https?:\/\//i.test(params.src || '')) e.preventDefault();
  });
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
    autoUpdater.on('update-available', function (info) { upd.status = 'available'; upd.latest = (info && info.version) || ''; upd.problem = ''; });
    autoUpdater.on('update-not-available', function () { upd.status = 'none'; upd.checked = Date.now(); upd.problem = ''; });
    autoUpdater.on('update-downloaded', function (info) {
      upd.status = 'downloaded'; upd.latest = (info && info.version) || upd.latest; upd.checked = Date.now();
      const r = dialog.showMessageBoxSync({ type: 'info', buttons: ['Перезапустить сейчас', 'Позже'], defaultId: 0,
        title: APP_NAME, message: 'Доступна новая версия ' + info.version, detail: 'Обновление скачано. Установится при перезапуске.' });
      if (r === 0) autoUpdater.quitAndInstall();
    });
    autoUpdater.on('error', function (e) { upd.status = 'error'; upd.problem = updErrText(e); }); // нет сети или выпуска — молча, запись видна в настройках
    // проверка при запуске — молча; выключается в настройках: «Обновления» → «проверять обновления при запуске»
    let on = true;
    try { const set = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'settings.json'), 'utf8')); if (set.updateOnline === 0) on = false; } catch (e) { /* настроек ещё нет */ }
    if (on) checkBoth().then(function (r) { upd.checked = Date.now(); if (r.status === 'none') { upd.status = 'none'; upd.problem = ''; } }).catch(function (e) { upd.status = 'error'; upd.problem = updErrText(e); });
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
    file: fileArg(process.argv), hooks: hooks, extraRoutes: function (token) {
      /* STHGroup 2.0: копии и CRM — по отдельности; их ошибка не должна мешать запуску программы */
      const r = shopRoutes(token);
      try { Object.assign(r, backupRoutes(token)); } catch (e) { console.error('резервные копии не подключены', e); }
      try { Object.assign(r, crmRoutes.routes({ dataDir: dataDir, safeStorage: safeStorage })); } catch (e) { console.error('CRM не подключена', e); }
      return r;
    }
  });
  createWindow(srv.url);
  setupAutoUpdate();
});
app.on('window-all-closed', function () { app.quit(); });
