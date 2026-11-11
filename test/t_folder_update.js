// Обновления из папки (sth_folder_update.js): версия в папке, выбор самой новой, раздача файлов только из папки.   node test/t_folder_update.js
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const FU = require('../sth_folder_update');
let n = 0; const ok = (t) => { n++; console.log('ок     ' + t); };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sthupd-'));
assert.strictEqual(FU.folderVersion(dir), null); assert.strictEqual(FU.folderVersion(path.join(dir, 'нет')), null);
fs.writeFileSync(path.join(dir, 'latest.yml'), "version: 2.7.0\nfiles:\n  - url: STHGroup-Cutting-Setup-2.7.0.exe\n    sha512: x\npath: STHGroup-Cutting-Setup-2.7.0.exe\nsha512: x\nreleaseDate: '2026-11-11T10:00:00.000Z'\n");
assert.strictEqual(FU.folderVersion(dir), null); // установщика нет — выпуска нет
fs.writeFileSync(path.join(dir, 'STHGroup-Cutting-Setup-2.7.0.exe'), 'EXE');
assert.strictEqual(FU.folderVersion(dir), '2.7.0');
ok('версия в папке: только когда есть и latest.yml, и установщик');
assert.strictEqual(FU.cmpVer('2.6.10', '2.6.9'), 1); assert.strictEqual(FU.cmpVer('2.6.8', '2.6.8'), 0); assert.strictEqual(FU.cmpVer('2.6', '2.6.1'), -1);
assert.strictEqual(FU.pick('2.6.8', '2.6.9', '2.7.0'), 'folder');
assert.strictEqual(FU.pick('2.6.8', '2.7.1', '2.7.0'), 'github');
assert.strictEqual(FU.pick('2.6.8', '2.7.0', '2.7.0'), 'github');
assert.strictEqual(FU.pick('2.6.8', null, '2.7.0'), 'folder');
assert.strictEqual(FU.pick('2.6.8', '2.6.9', null), 'github');
assert.strictEqual(FU.pick('2.7.0', '2.6.9', '2.7.0'), null);
ok('выбор: берётся самая новая из GitHub и папки, не новее текущей — ничего');
fs.writeFileSync(path.join(os.tmpdir(), 'sthupd-secret.txt'), 'SECRET');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sthset-'));
assert.strictEqual(FU.folderDir(dataDir), FU.DEFAULT_DIR);
fs.writeFileSync(path.join(dataDir, 'settings.json'), JSON.stringify({ updFolder: dir }));
assert.strictEqual(FU.folderDir(dataDir), dir);
ok('папка: по умолчанию E:\\AI Разработка\\Обновления\\STHGroup, другая — из настроек (updFolder)');
(async () => {
  const url = await FU.serve(dir);
  assert.ok(/^http:\/\/127\.0\.0\.1:\d+\/$/.test(url));
  assert.strictEqual(await (await fetch(url + 'STHGroup-Cutting-Setup-2.7.0.exe')).text(), 'EXE');
  assert.ok((await (await fetch(url + 'latest.yml')).text()).includes('2.7.0'));
  for (const bad of ['..%2Fsthupd-secret.txt', '%2E%2E/sthupd-secret.txt', 'нет.exe', '']) assert.strictEqual((await fetch(url + bad)).status, 404, bad);
  assert.strictEqual(await FU.serve(dir), url);
  FU.stop();
  ok('раздача для установщика: файлы папки отдаются, выход за папку и чужие файлы — нет');
  console.log('проверок ' + n + ' | ошибок нет');
})().catch(e => { console.log('НЕ ТАК:', e); process.exit(1); });
