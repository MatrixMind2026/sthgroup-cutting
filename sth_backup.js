/* STHGroup 2.0 — автоматические резервные копии базы материалов перед записью.
   Копии лежат рядом с базой в .sth-backups, основной файл не заменяется; хранится не более 12 последних. */
'use strict';
const fs = require('fs');
const path = require('path');

function stamp(d) {
  function z(n, l) { return String(n).padStart(l || 2, '0'); }
  return d.getFullYear() + z(d.getMonth() + 1) + z(d.getDate()) + '-' + z(d.getHours()) + z(d.getMinutes()) + z(d.getSeconds()) + '-' + z(d.getMilliseconds(), 3);
}
function backupFile(file, opt) {
  opt = opt || {};
  if (!path.isAbsolute(file)) throw new Error('Нужен полный путь к базе материалов');
  const st = fs.statSync(file);
  if (!st.isFile()) throw new Error('Это не файл базы материалов');
  const dir = path.join(path.dirname(file), '.sth-backups');
  const base = path.basename(file), prefix = base + '.', suffix = '.bak';
  fs.mkdirSync(dir, { recursive: true });
  const list = fs.readdirSync(dir).filter(n => n.startsWith(prefix) && n.endsWith(suffix)).map(n => {
    const p = path.join(dir, n); let s; try { s = fs.statSync(p); } catch (e) { s = null; }
    return { name: n, path: p, mtime: s ? s.mtimeMs : 0 };
  }).filter(x => x.mtime).sort((a, b) => b.mtime - a.mtime);
  const now = opt.now ? opt.now() : Date.now(), interval = opt.intervalMs === undefined ? 30 * 60 * 1000 : opt.intervalMs;
  if (list[0] && now - list[0].mtime < interval) return { ok: true, skipped: true, path: list[0].path, count: list.length };
  const out = path.join(dir, prefix + stamp(new Date(now)) + suffix), tmp = out + '.tmp' + process.pid;
  fs.copyFileSync(file, tmp);
  try { fs.renameSync(tmp, out); } catch (e) { fs.copyFileSync(tmp, out); try { fs.unlinkSync(tmp); } catch (_) { /* нет */ } }
  const keep = Math.max(1, Number(opt.keep) || 12), all = [{ path: out, mtime: now }].concat(list).sort((a, b) => b.mtime - a.mtime);
  all.slice(keep).forEach(x => { try { fs.unlinkSync(x.path); } catch (e) { /* нет */ } });
  return { ok: true, skipped: false, path: out, count: Math.min(keep, all.length) };
}
function routes() {
  function json(res, code, v) { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(v)); }
  function jbody(req) { return new Promise(ok => { const ch = []; req.on('data', c => ch.push(c)); req.on('end', () => { try { ok(JSON.parse(Buffer.concat(ch).toString('utf8') || '{}')); } catch (e) { ok({}); } }); }); }
  return {
    'POST /api/sth/materials-backup': async function (req, res) {
      const d = await jbody(req);
      try { json(res, 200, backupFile(String(d.path || ''), { keep: d.keep })); }
      catch (e) { json(res, 400, { error: e.message }); }
    }
  };
}
module.exports = routes;
module.exports.backupFile = backupFile;
