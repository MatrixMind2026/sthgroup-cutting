/* STHGroup — связь окна (копия окна BazisReborn, папка web) с программой.
   Повторяет локальный сервер BazisReborn (app/go/server.go): те же адреса /api/*, тот же токен X-BM-Token.
   Системное (окна выбора файла, PDF, масштаб, заголовок, открыть файл) делает оболочка Electron через hooks. */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const zlib = require('zlib');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.bmp': 'image/bmp', '.tif': 'image/tiff', '.tiff': 'image/tiff', '.json': 'application/json',
  '.wav': 'audio/wav', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8'
};
const TEX = { '.jpg': 1, '.jpeg': 1, '.png': 1, '.bmp': 1, '.gif': 1, '.webp': 1, '.tif': 1, '.tiff': 1 };

// ---------------- проект одним файлом: zip без сжатия внутри .bmk (app/go/pack.go) ----------------
const PACK_MAIN = 'project.json';
function isPacked(p) {
  if (path.extname(p).toLowerCase() !== '.bmk') return false;
  try { const fd = fs.openSync(p, 'r'); const b = Buffer.alloc(4); fs.readSync(fd, b, 0, 4, 0); fs.closeSync(fd); return b.equals(Buffer.from([0x50, 0x4b, 3, 4])); } catch (e) { return false; }
}
function splitInner(p) {
  const i = p.toLowerCase().indexOf('.bmk!'); if (i < 0) return null;
  const rest = p.slice(i + 5).replace(/\\/g, '/').replace(/^\/+/, '');
  if (!rest || ('/' + rest + '/').indexOf('/../') >= 0) return null;
  return { bmk: p.slice(0, i + 4), inner: rest };
}
// чтение zip: центральный каталог
function zipEntries(buf) {
  let e = buf.length - 22;
  while (e >= 0 && buf.readUInt32LE(e) !== 0x06054b50) e--;
  if (e < 0) throw new Error('файл проекта повреждён');
  const n = buf.readUInt16LE(e + 10); let p = buf.readUInt32LE(e + 16); const out = [];
  for (let i = 0; i < n; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10), crc = buf.readUInt32LE(p + 16), csize = buf.readUInt32LE(p + 20), usize = buf.readUInt32LE(p + 24);
    const nl = buf.readUInt16LE(p + 28), xl = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32), loc = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nl);
    out.push({ name: name, method: method, crc: crc, csize: csize, usize: usize, loc: loc });
    p += 46 + nl + xl + cl;
  }
  return out;
}
function zipData(buf, en) {
  const nl = buf.readUInt16LE(en.loc + 26), xl = buf.readUInt16LE(en.loc + 28), st = en.loc + 30 + nl + xl;
  const raw = buf.subarray(st, st + en.csize);
  return en.method === 8 ? zlib.inflateRawSync(raw) : Buffer.from(raw);
}
function findEntry(list, name) {
  return list.find(function (x) { return x.name === name; }) || list.find(function (x) { return x.name.toLowerCase() === name.toLowerCase(); });
}
function packRead(bmk, name) {
  const buf = fs.readFileSync(bmk), en = findEntry(zipEntries(buf), name);
  if (!en) { const e = new Error('в проекте нет файла ' + name); e.code = 'ENOENT'; throw e; }
  return zipData(buf, en);
}
function packStat(bmk, name) {
  try { const en = findEntry(zipEntries(fs.readFileSync(bmk)), name); return en ? en.usize : -1; } catch (e) { return -1; }
}
let crcTable = null;
function crc32(b) {
  if (!crcTable) { crcTable = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c; } }
  let c = -1; for (let i = 0; i < b.length; i++) c = crcTable[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0;
}
function zipWrite(file, items) { // items: [{name, data}] — без сжатия, размеры в заголовке (как pack.go)
  const parts = [], cen = []; let off = 0;
  const dt = new Date(), dosT = (dt.getHours() << 11) | (dt.getMinutes() << 5) | (dt.getSeconds() >> 1), dosD = ((dt.getFullYear() - 1980) << 9) | ((dt.getMonth() + 1) << 5) | dt.getDate();
  items.forEach(function (it) {
    const nm = Buffer.from(it.name, 'utf8'), d = it.data, c = crc32(d);
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x800, 6); h.writeUInt16LE(0, 8);
    h.writeUInt16LE(dosT, 10); h.writeUInt16LE(dosD, 12); h.writeUInt32LE(c, 14); h.writeUInt32LE(d.length, 18); h.writeUInt32LE(d.length, 22); h.writeUInt16LE(nm.length, 26); h.writeUInt16LE(0, 28);
    parts.push(h, nm, d);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x800, 8); ch.writeUInt16LE(0, 10);
    ch.writeUInt16LE(dosT, 12); ch.writeUInt16LE(dosD, 14); ch.writeUInt32LE(c, 16); ch.writeUInt32LE(d.length, 20); ch.writeUInt32LE(d.length, 24); ch.writeUInt16LE(nm.length, 28); ch.writeUInt32LE(off, 42);
    cen.push(ch, nm);
    off += 30 + nm.length + d.length;
  });
  const cenBuf = Buffer.concat(cen), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(items.length, 8); end.writeUInt16LE(items.length, 10); end.writeUInt32LE(cenBuf.length, 12); end.writeUInt32LE(off, 16);
  writeAtomic(file, Buffer.concat(parts.concat([cenBuf, end])));
}
function packPut(bmk, from, puts) {
  const src = fs.readFileSync(from || bmk), list = zipEntries(src), items = [], done = {};
  if (puts[PACK_MAIN]) { items.push({ name: PACK_MAIN, data: puts[PACK_MAIN] }); done[PACK_MAIN] = 1; }
  list.forEach(function (en) {
    if (puts[en.name]) { if (!done[en.name]) { items.push({ name: en.name, data: puts[en.name] }); done[en.name] = 1; } return; }
    items.push({ name: en.name, data: zipData(src, en) });
  });
  Object.keys(puts).forEach(function (n) { if (!done[n]) items.push({ name: n, data: puts[n] }); });
  zipWrite(bmk, items);
}

// ---------------- скрипт выгрузки для БАЗИСа ----------------
/* Только латиницей: каждый не-ASCII знак — кодом \uXXXX (БАЗИС может читать скрипт как Windows-1251), путь к программе вписан. */
function asciiScript(src, exePath) {
  const js = String(exePath || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const text = String(src).replace(/^\uFEFF/, '').replace("'%%BM_EXE%%'", "'" + js + "'");
  let out = '';
  for (let i = 0; i < text.length; i++) { const c = text.charCodeAt(i); out += c < 128 ? text[i] : '\\u' + ('000' + c.toString(16)).slice(-4); }
  return out;
}
/* Папка STHGroup в папке скриптов БАЗИСа: скрипт и его значок. Возвращает путь к скрипту. */
function installScript(scriptsDir, bazisDir, exePath) {
  let root = path.resolve(scriptsDir);
  if (path.basename(root).toLowerCase() === 'sthgroup') root = path.dirname(root);
  const dir = path.join(root, 'STHGroup');
  fs.mkdirSync(dir, { recursive: true });
  const js = path.join(dir, 'STHGroup_Export.js');
  fs.writeFileSync(js, asciiScript(fs.readFileSync(path.join(bazisDir, 'STHGroup_Export.js'), 'utf8'), exePath), 'ascii');
  fs.writeFileSync(path.join(dir, 'STHGroup_Export.bmp'), fs.readFileSync(path.join(bazisDir, 'STHGroup_Export.bmp')));          // copyFileSync из app.asar не работает
  return js;
}

function writeAtomic(p, data) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = p + '.tmp' + process.pid;
  fs.writeFileSync(tmp, data);
  try { fs.renameSync(tmp, p); } catch (e) { try { fs.copyFileSync(tmp, p); } finally { try { fs.unlinkSync(tmp); } catch (_) { /* нет */ } } }
}
function fileErr(e, p) {
  if (e && e.code === 'ENOENT') return 'Файл не найден: ' + p;
  if (e && (e.code === 'EACCES' || e.code === 'EPERM')) return 'Нет доступа к файлу: ' + p;
  if (e && e.code === 'EBUSY') return 'Файл занят другой программой: ' + p;
  return (e && e.message) || String(e);
}
function documentsDir() {
  const d = path.join(os.homedir(), 'Documents');
  return fs.existsSync(d) ? d : os.homedir();
}
function isDir(p) { try { return fs.statSync(p).isDirectory(); } catch (e) { return false; } }
function listRoots() {
  if (process.platform !== 'win32') return ['/'];
  const out = [];
  for (let c = 67; c <= 90; c++) { const r = String.fromCharCode(c) + ':\\'; if (fs.existsSync(r)) out.push(r); }
  return out;
}
function imageTree(root) {
  const out = []; let more = false;
  (function walk(dir, depth) {
    if (more || depth > 8) return;
    let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
    for (const e of ents) {
      if (e.name[0] === '.' || e.name[0] === '$') continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { walk(p, depth + 1); continue; }
      if (TEX[path.extname(e.name).toLowerCase()]) { if (out.length >= 50000) { more = true; return; } out.push(p); }
    }
  })(root, 0);
  return { files: out, more: more };
}

/**
 * opt: { webDir, dataDir, version, file, hooks: { dialog, pdf, open, openUrl, zoom, title, quit, toFront } }
 * Возвращает Promise<{ port, token, url, close, activate(path) }>.
 */
function start(opt) {
  const token = crypto.randomBytes(16).toString('hex');
  const hooks = opt.hooks || {};
  const st = { reload: [], current: [] };
  fs.mkdirSync(opt.dataDir, { recursive: true });

  function json(res, code, v) {
    const b = Buffer.from(JSON.stringify(v));
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(b);
  }
  function fail(res, code, msg) { json(res, code, { error: msg }); }
  function body(req) {
    return new Promise(function (ok, bad) { const ch = []; req.on('data', function (c) { ch.push(c); }); req.on('end', function () { ok(Buffer.concat(ch)); }); req.on('error', bad); });
  }
  async function jbody(req) { const b = await body(req); try { return b.length ? JSON.parse(b.toString('utf8')) : {}; } catch (e) { return {}; } }

  function indexPage() {
    let page = fs.readFileSync(path.join(opt.webDir, 'index.html'), 'utf8');
    let set = {}; try { set = JSON.parse(fs.readFileSync(path.join(opt.dataDir, 'settings.json'), 'utf8')); } catch (e) { /* нет */ }
    let attr = 'data-theme="dark" data-skin="sth"';          // STHGroup: одна тема — графит и оранжевый
    if (set.anim === 0) attr += ' class="noanim"';
    return page.replace('data-theme="light"', attr);
  }

  const routes = {
    'GET /api/boot': function (req, res) {
      json(res, 200, {
        version: opt.version, file: opt.file || '', os: process.platform === 'win32' ? 'windows' : process.platform, home: os.homedir(), docs: documentsDir(),
        dataDir: opt.dataDir, exeDir: path.dirname(process.execPath), sep: path.sep, nativeDialogs: !!hooks.dialog, browser: true,
        arch: process.arch, edition: 'sth', core: false, app: 'STHGroup'
      });
    },
    'GET /api/settings': function (req, res) {
      try { const b = fs.readFileSync(path.join(opt.dataDir, 'settings.json')); res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(b); }
      catch (e) { json(res, 200, {}); }
    },
    'PUT /api/settings': async function (req, res) {
      const b = await body(req);
      try { JSON.parse(b.toString('utf8')); } catch (e) { return fail(res, 400, 'настройки не записаны: повреждённые данные'); }
      try { writeAtomic(path.join(opt.dataDir, 'settings.json'), b); json(res, 200, { ok: true }); } catch (e) { fail(res, 500, fileErr(e)); }
    },
    'GET /api/file': function (req, res, q) {
      const p = q.get('path') || '';
      if (!p || !path.isAbsolute(p)) return fail(res, 400, 'не указан путь к файлу');
      let b;
      try {
        const sp = splitInner(p);
        if (sp) b = packRead(sp.bmk, sp.inner);
        else if (isPacked(p)) b = packRead(p, PACK_MAIN);
        else b = fs.readFileSync(p);
      } catch (e) { return fail(res, 404, fileErr(e, p)); }
      const ext = path.extname(p).toLowerCase();
      res.writeHead(200, { 'Content-Type': TEX[ext] ? (MIME[ext] || 'image/' + ext.slice(1)) : 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(b);
    },
    'PUT /api/file': async function (req, res, q) {
      const p = q.get('path') || '', from = q.get('from') || '';
      if (!p || !path.isAbsolute(p)) return fail(res, 400, 'не указан путь к файлу');
      const b = await body(req);
      try {
        const sp = splitInner(p);
        if (sp) { if (!isPacked(sp.bmk)) return fail(res, 400, 'проект не одним файлом: ' + sp.bmk); packPut(sp.bmk, '', { [sp.inner]: b }); }
        else if (isPacked(p)) packPut(p, '', { [PACK_MAIN]: b });
        else if (from && path.resolve(from).toLowerCase() !== path.resolve(p).toLowerCase() && isPacked(from)) packPut(p, from, { [PACK_MAIN]: b });
        else writeAtomic(p, b);
      } catch (e) { return fail(res, 500, fileErr(e, p)); }
      json(res, 200, { ok: true, path: p });
    },
    'GET /api/tree': function (req, res, q) {
      const dir = q.get('dir') || '';
      if (!dir || !path.isAbsolute(dir) || !isDir(dir)) return fail(res, 404, 'папка не найдена: ' + dir);
      const t = imageTree(path.resolve(dir)); json(res, 200, { dir: dir, files: t.files, more: t.more });
    },
    'GET /api/stat': function (req, res, q) {
      const p = q.get('path') || '', sp = splitInner(p);
      if (sp) {
        const size = packStat(sp.bmk, sp.inner); if (size < 0) return json(res, 200, { exists: false });
        let mt = 0; try { mt = fs.statSync(sp.bmk).mtimeMs; } catch (e) { /* нет */ }
        return json(res, 200, { exists: true, dir: false, size: size, mtime: Math.round(mt) });
      }
      let s; try { s = fs.statSync(p); } catch (e) { return json(res, 200, { exists: false }); }
      json(res, 200, { exists: true, dir: s.isDirectory(), size: s.size, mtime: Math.round(s.mtimeMs), packed: !s.isDirectory() && isPacked(p) });
    },
    'GET /api/ls': function (req, res, q) {
      let dir = q.get('dir') || ''; if (!dir || !isDir(dir)) dir = os.homedir();
      dir = path.resolve(dir);
      let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return fail(res, 500, fileErr(e, dir)); }
      const list = [];
      ents.forEach(function (e) {
        if (e.name[0] === '.' || e.name[0] === '$') return;
        let s; try { s = fs.statSync(path.join(dir, e.name)); } catch (x) { return; }
        list.push({ name: e.name, dir: s.isDirectory(), size: s.size, mtime: Math.round(s.mtimeMs) });
      });
      list.sort(function (a, b) { return a.dir !== b.dir ? (a.dir ? -1 : 1) : a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1; });
      const parent = path.dirname(dir);
      json(res, 200, { dir: dir, parent: parent === dir ? '' : parent, entries: list, roots: listRoots(), sep: path.sep });
    },
    'POST /api/mkdir': function (req, res, q) {
      const p = q.get('path') || '';
      if (!p || !path.isAbsolute(p)) return fail(res, 400, 'не указана папка');
      try { fs.mkdirSync(p, { recursive: true }); json(res, 200, { ok: true }); } catch (e) { fail(res, 500, fileErr(e, p)); }
    },
    'POST /api/dialog': async function (req, res) {
      const d = await jbody(req);
      if (!hooks.dialog) return json(res, 200, { unsupported: true, why: 'нет системного окна' });
      try { const p = await hooks.dialog(d); json(res, 200, p ? { path: p } : { cancel: true }); }
      catch (e) { json(res, 200, { unsupported: true, why: e.message }); }
    },
    'POST /api/pdf': async function (req, res) {
      const d = await jbody(req);
      if (!d.path) return fail(res, 400, 'не указан файл PDF');
      if (!hooks.pdf) return fail(res, 500, 'PDF здесь не записать');
      try { await hooks.pdf(d.html || '', d.path); json(res, 200, { ok: true, path: d.path }); } catch (e) { fail(res, 500, e.message); }
    },
    'POST /api/open': async function (req, res) {
      const d = await jbody(req);
      if (!d.path) return fail(res, 400, 'не указан путь');
      if (!fs.existsSync(d.path)) return fail(res, 404, 'Файл не найден: ' + d.path);
      try { if (hooks.open) await hooks.open(d.path); json(res, 200, { ok: true }); } catch (e) { fail(res, 500, e.message); }
    },
    'POST /api/openurl': async function (req, res) {
      const d = await jbody(req); let u;
      try { u = new URL(String(d.url || '').trim()); } catch (e) { u = null; }
      if (!u || (u.protocol !== 'http:' && u.protocol !== 'https:')) return fail(res, 400, 'это не ссылка на сайт: ' + d.url);
      try { if (hooks.openUrl) await hooks.openUrl(u.toString()); json(res, 200, { ok: true }); } catch (e) { fail(res, 500, e.message); }
    },
    'GET /api/md5': function (req, res, q) {
      const p = q.get('path') || '';
      try { json(res, 200, { md5: crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex') }); } catch (e) { fail(res, 404, fileErr(e, p)); }
    },
    'POST /api/zoom': async function (req, res) {
      const d = await jbody(req); let z = Number(d.z); if (!(z >= 0.5 && z <= 2)) z = 1;
      if (hooks.zoom) hooks.zoom(z);
      json(res, 200, { ok: true, native: !!hooks.zoom });
    },
    'POST /api/title': async function (req, res) { const d = await jbody(req); if (hooks.title && d.title) hooks.title(d.title); json(res, 200, { ok: true }); },
    'POST /api/ping': function (req, res) { json(res, 200, { ok: true, reload: st.reload.shift() || '' }); },
    'POST /api/bye': function (req, res) { json(res, 200, { ok: true }); },
    'POST /api/current': async function (req, res) { const d = await jbody(req); st.current = d.paths || [d.path]; json(res, 200, { ok: true }); },
    'POST /api/activate': function (req, res, q) { if (q.get('path')) st.reload.push(q.get('path')); if (hooks.toFront) hooks.toFront(); json(res, 200, { ok: true }); },
    'POST /api/quit': function (req, res) { json(res, 200, { ok: true }); if (hooks.quit) setTimeout(hooks.quit, 150); },
    // Ядро C++ BazisReborn здесь не используется: считает JS (окно само переходит на него при ошибке).
    'POST /api/core': function (req, res) { fail(res, 503, 'ядро C++ не подключено'); },
    // Обновления — у оболочки STHGroup (GitHub, electron-updater): состояние и принудительная проверка
    // (кнопка «Проверить обновления» в настройках) идут через hooks. Без оболочки (тесты, браузер) — «проверять не нужно».
    'GET /api/upd/state': function (req, res) { json(res, 200, hooks.updState ? hooks.updState() : { current: opt.version, edition: 'sth', hasKey: false, keySrc: '', problem: '', repo: '', checked: 0, seen: '', publisher: null }); },
    'POST /api/upd/check': async function (req, res) {
      if (!hooks.updCheck) return json(res, 200, { status: 'skip' });
      try { json(res, 200, await hooks.updCheck()); } catch (e) { json(res, 200, { status: 'error', message: String((e && e.message) || e) }); }
    },
    'POST /api/upd/install': function (req, res) { json(res, 200, { ok: !!(hooks.updInstall && hooks.updInstall()) }); }, // STHGroup: перезапуск со скачанным обновлением
    'GET /api/tester/state': function (req, res) { json(res, 200, { edition: 'sth', ack: true, name: '', pings: false }); },
    'POST /api/tester/sec': function (req, res) { json(res, 200, { ok: true }); },
    'POST /api/tester/hello': function (req, res) { json(res, 200, { name: '' }); },
    'GET /api/feedback/state': function (req, res) { json(res, 200, { enabled: false, tester: false }); },
    'GET /api/reg/state': function (req, res) { json(res, 200, { code: '', name: '', ok: true }); },
    // STHGroup: положить скрипт выгрузки в папку скриптов БАЗИСа
    'POST /api/sth/script': async function (req, res) {
      const d = await jbody(req);
      if (!d.dir || !path.isAbsolute(d.dir)) return fail(res, 400, 'не указана папка скриптов БАЗИСа');
      try { json(res, 200, { ok: true, path: installScript(d.dir, opt.bazisDir || path.join(__dirname, 'bazis'), opt.exePath || process.execPath) }); }
      catch (e) { fail(res, 500, fileErr(e, d.dir)); }
    },
    // STHGroup: копия файла модели в папку заказа (.bmk целиком; если проект не одним файлом — и файлы рядом с тем же именем: .glb, .uv, текстуры)
    'POST /api/sth/copy': async function (req, res) {
      const d = await jbody(req), src = String(d.src || ''), dst = String(d.dst || '');
      if (!path.isAbsolute(src) || !path.isAbsolute(dst)) return fail(res, 400, 'не указан путь');
      if (path.resolve(src).toLowerCase() === path.resolve(dst).toLowerCase()) return json(res, 200, { ok: true, path: dst, same: true });
      try {
        fs.mkdirSync(path.dirname(dst), { recursive: true });
        fs.writeFileSync(dst, fs.readFileSync(src));
        const extra = [];
        if (!isPacked(src)) {
          const stem = path.basename(src, path.extname(src)), sd = path.dirname(src), dd = path.dirname(dst), nstem = path.basename(dst, path.extname(dst));
          fs.readdirSync(sd).forEach(function (n) {
            if (n === path.basename(src) || n.indexOf(stem + '.') !== 0) return;
            const f = path.join(sd, n); if (!fs.statSync(f).isFile()) return;
            const t = path.join(dd, nstem + n.slice(stem.length)); fs.writeFileSync(t, fs.readFileSync(f)); extra.push(t);
          });
        }
        json(res, 200, { ok: true, path: dst, extra: extra });
      } catch (e) { fail(res, 500, fileErr(e, src)); }
    },
    'POST /api/sound/play': function (req, res) { json(res, 200, { ok: true, played: false }); },
    'POST /api/sound/stop': function (req, res) { json(res, 200, { ok: true }); }
  };
  if (opt.extraRoutes) Object.assign(routes, opt.extraRoutes(token));

  const server = http.createServer(async function (req, res) {
    try {
      const host = req.headers.host || '', port = ':' + server.address().port;
      if (host !== '127.0.0.1' + port && host !== 'localhost' + port) { res.writeHead(403); return res.end('forbidden'); }
      const origin = req.headers.origin;
      if (origin && origin !== 'http://127.0.0.1' + port && origin !== 'http://localhost' + port) { res.writeHead(403); return res.end('forbidden'); }
      const u = new URL(req.url, 'http://x'), pth = decodeURIComponent(u.pathname);
      if (pth.indexOf('/api/') === 0) {
        const t = req.headers['x-bm-token'] || u.searchParams.get('t');
        if (t !== token) return fail(res, 403, 'нет доступа');
        const h = routes[req.method + ' ' + pth] || (req.method === 'HEAD' ? null : null);
        if (!h) return fail(res, 404, 'нет такой команды: ' + pth);
        return await h(req, res, u.searchParams);
      }
      // окно
      if (pth === '/' || pth === '/index.html') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); return res.end(indexPage());
      }
      const f = path.join(opt.webDir, path.normalize(pth).replace(/^([/\\])+/, ''));
      if (f.indexOf(path.resolve(opt.webDir)) !== 0 || !fs.existsSync(f) || isDir(f)) { res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      fs.createReadStream(f).pipe(res);
    } catch (e) {
      try { fail(res, 500, e.message); } catch (_) { /* ответ уже ушёл */ }
    }
  });
  return new Promise(function (ok) {
    server.listen(opt.port || 0, '127.0.0.1', function () {
      const port = server.address().port;
      ok({
        port: port, token: token, url: 'http://127.0.0.1:' + port + '/?t=' + token,
        close: function () { server.close(); },
        activate: function (p) { if (p) st.reload.push(p); }
      });
    });
  });
}

module.exports = { asciiScript: asciiScript, installScript: installScript, start: start, isPacked: isPacked, packRead: packRead, packPut: packPut, zipWrite: zipWrite, writeAtomic: writeAtomic };

// Запуск без Electron — для проверок окна в Chromium: node server.js <папка данных> [проект.bmk] [порт]
if (require.main === module) {
  const dataDir = process.argv[2] || path.join(os.tmpdir(), 'sth-test-data');
  start({
    webDir: path.join(__dirname, 'web'), dataDir: dataDir, version: require('./package.json').version, file: process.argv[3] || '', port: Number(process.argv[4]) || 0,
    // для проверок: подставной магазин — страница товара из файла STH_SHOP_HTML
    extraRoutes: function () { return {
      'POST /api/shop/login': function (req, res) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true}'); },
      'POST /api/shop/image': function (req, res) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true, data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==' })); },
      'POST /api/shop/fetch': function (req, res) { const h = process.env.STH_SHOP_HTML ? fs.readFileSync(process.env.STH_SHOP_HTML, 'utf8') : '<html></html>'; res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true, html: h, url: 'https://www.mdm-complect.ru/catalog/x/111185/' })); }
    }; },
    hooks: {
      pdf: async function (html, out) { fs.writeFileSync(out, '%PDF-test\n' + html.length); },
      dialog: async function (d) { return process.env.STH_DIALOG || null; }
    }
  }).then(function (s) { console.log(s.url); });
}
