// Сервер оболочки STHGroup: те же ответы, что у программы BazisReborn (адреса /api/*, токен, проект одним файлом)
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), S = require('../server.js');
let n = 0; const ok = (name) => { n++; console.log('ок     ' + name); };
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sth-')), web = path.join(__dirname, '..', 'web');
  const s = await S.start({ webDir: web, dataDir: dir, version: '9.9.9', hooks: {} });
  const base = 'http://127.0.0.1:' + s.port, H = { 'X-BM-Token': s.token };
  let r = await fetch(base + '/api/boot'); assert.strictEqual(r.status, 403); ok('без токена — нет доступа');
  r = await (await fetch(base + '/api/boot', { headers: H })).json(); assert.strictEqual(r.edition, 'sth'); assert.strictEqual(r.version, '9.9.9'); ok('boot');
  const f = path.join(dir, 'a.txt');
  r = await fetch(base + '/api/file?path=' + encodeURIComponent(f), { method: 'PUT', headers: H, body: 'привет' }); assert.ok(r.ok);
  r = await fetch(base + '/api/file?path=' + encodeURIComponent(f), { headers: H }); assert.strictEqual(await r.text(), 'привет'); ok('запись и чтение файла');
  r = await (await fetch(base + '/api/stat?path=' + encodeURIComponent(f), { headers: H })).json(); assert.ok(r.exists && !r.dir); ok('stat');
  // проект одним файлом
  const bmk = path.join(dir, 'p.bmk');
  S.zipWrite(bmk, [{ name: 'project.json', data: Buffer.from('{"a":1}') }, { name: 'p — 3D.glb', data: Buffer.from('GLB') }]);
  r = await fetch(base + '/api/file?path=' + encodeURIComponent(bmk), { headers: H }); assert.strictEqual(await r.text(), '{"a":1}');
  r = await fetch(base + '/api/file?path=' + encodeURIComponent(bmk + '!p — 3D.glb'), { headers: H }); assert.strictEqual(await r.text(), 'GLB');
  r = await fetch(base + '/api/file?path=' + encodeURIComponent(bmk), { method: 'PUT', headers: H, body: '{"a":2}' }); assert.ok(r.ok);
  assert.strictEqual(S.packRead(bmk, 'project.json').toString(), '{"a":2}'); assert.strictEqual(S.packRead(bmk, 'p — 3D.glb').toString(), 'GLB'); ok('проект одним файлом: чтение, запись, 3D сохраняется');
  r = await (await fetch(base + '/api/upd/check', { method: 'POST', headers: H })).json(); assert.strictEqual(r.status, 'skip'); ok('обновления окна выключены (их делает оболочка)');
  r = await fetch(base + '/', {}); const html = await r.text(); assert.ok(/STHGroup/.test(html) && !/data-s="drill"/.test(html)); ok('окно: STHGroup, без «Присадки»');
  s.close();
  // принудительная проверка из настроек: сервер передаёт вызов оболочке (hooks.updCheck) и отдаёт её ответ
  const s2 = await S.start({ webDir: web, dataDir: dir, version: '9.9.9', hooks: {
    updCheck: async () => ({ status: 'none', current: '9.9.9' }),
    updState: () => ({ current: '9.9.9', edition: 'sth', hasKey: true, keySrc: '', problem: '', repo: 'o/r', checked: 123, seen: '', publisher: null, status: 'none', packaged: true })
  } });
  const base2 = 'http://127.0.0.1:' + s2.port, H2 = { 'X-BM-Token': s2.token };
  r = await (await fetch(base2 + '/api/upd/check', { method: 'POST', headers: H2 })).json(); assert.strictEqual(r.status, 'none'); assert.strictEqual(r.current, '9.9.9'); ok('принудительная проверка идёт в оболочку');
  r = await (await fetch(base2 + '/api/upd/state', { headers: H2 })).json(); assert.strictEqual(r.current, '9.9.9'); assert.strictEqual(r.checked, 123); assert.strictEqual(r.repo, 'o/r'); ok('состояние обновлений — от оболочки');
  s2.close(); console.log('проверок ' + n + ' | ошибок нет');
})().catch((e) => { console.error(e); process.exit(1); });
