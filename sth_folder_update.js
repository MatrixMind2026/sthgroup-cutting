/* STHGroup: обновления из папки на диске — вместе с GitHub.
   Решение автора 11.11.2026: обновления проверяются и на GitHub, и в папке; берётся самая новая версия.
   В папке лежит то же, что в выпуске на GitHub: latest.yml, STHGroup-Cutting-Setup-<версия>.exe и .blockmap
   (кладёт `npm run dist:folder` или вручную). Папка по умолчанию — E:\AI Разработка\Обновления\STHGroup,
   другую можно задать в settings.json полем updFolder. Нет папки или файлов — молча, работает только GitHub.
   Файлы папки отдаются electron-updater через маленький локальный сервер (провайдер generic понимает только http),
   поэтому скачивание, проверка контрольной суммы и установка — те же, что для GitHub. */
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');

const DEFAULT_DIR = 'E:\\AI Разработка\\Обновления\\STHGroup';

// папка обновлений: из настроек (updFolder) или по умолчанию
function folderDir(dataDir) {
  try {
    const set = JSON.parse(fs.readFileSync(path.join(dataDir, 'settings.json'), 'utf8'));
    if (set.updFolder && typeof set.updFolder === 'string') return set.updFolder;
  } catch (e) { /* настроек ещё нет */ }
  return DEFAULT_DIR;
}

// поле из latest.yml (плоские строки «ключ: значение» верхнего уровня)
function ymlField(text, key) {
  const m = new RegExp('^' + key + ':\\s*(.+?)\\s*$', 'm').exec(text);
  return m ? m[1].replace(/^['"]|['"]$/g, '') : '';
}

// версия выпуска в папке; null — если папки, latest.yml или самого установщика нет
function folderVersion(dir) {
  try {
    const yml = fs.readFileSync(path.join(dir, 'latest.yml'), 'utf8');
    const v = ymlField(yml, 'version'), exe = ymlField(yml, 'path');
    if (!v || !exe || !fs.existsSync(path.join(dir, path.basename(exe)))) return null;
    return v;
  } catch (e) { return null; }
}

// сравнение версий «2.6.10» > «2.6.9»; хвост вида -beta не учитывается
function cmpVer(a, b) {
  const pa = String(a || '0').split('-')[0].split('.').map(Number), pb = String(b || '0').split('-')[0].split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x !== y) return x > y ? 1 : -1;
  }
  return 0;
}

// откуда обновляться: 'folder' | 'github' | null (новее текущей нет). Равные версии — GitHub.
function pick(current, github, folder) {
  const g = github && cmpVer(github, current) > 0 ? github : null;
  const f = folder && cmpVer(folder, current) > 0 ? folder : null;
  if (f && (!g || cmpVer(f, g) > 0)) return 'folder';
  if (g) return 'github';
  return null;
}

// локальный сервер с файлами папки (только 127.0.0.1, только файлы из самой папки, без подпапок)
let srv = null, srvDir = '', srvUrl = '';
function serve(dir) {
  if (srv && srvDir === dir) return Promise.resolve(srvUrl);
  if (srv) { try { srv.close(); } catch (e) { /* нет */ } srv = null; }
  return new Promise(function (resolve, reject) {
    const s = http.createServer(function (req, res) {
      let name = '';
      try { name = decodeURIComponent(new URL(req.url, 'http://x').pathname.replace(/^\/+/, '')); } catch (e) { name = ''; }
      if (!name || name !== path.basename(name) || name === '.' || name === '..') { res.writeHead(404); return res.end(); }
      const file = path.join(dir, name);
      fs.stat(file, function (err, st) {
        if (err || !st.isFile()) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { 'Content-Length': st.size, 'Content-Type': 'application/octet-stream' });
        if (req.method === 'HEAD') return res.end();
        fs.createReadStream(file).pipe(res);
      });
    });
    s.on('error', reject);
    s.listen(0, '127.0.0.1', function () {
      srv = s; srvDir = dir; srvUrl = 'http://127.0.0.1:' + s.address().port + '/';
      resolve(srvUrl);
    });
  });
}
function stop() { if (srv) { try { srv.close(); } catch (e) { /* нет */ } srv = null; srvDir = ''; srvUrl = ''; } }

module.exports = { DEFAULT_DIR, folderDir, folderVersion, cmpVer, pick, serve, stop };
