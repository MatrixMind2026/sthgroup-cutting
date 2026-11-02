// Скрипт выгрузки STHGroup: окно данных заказа (вариант «C»), отмена, латинская копия для БАЗИСа
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), { execFileSync } = require('child_process'), S = require('../server.js');
let n = 0; const ok = (name) => { n++; console.log('ок     ' + name); };
const mock = path.join(__dirname, 'mock_bazis.js'), out = path.join(__dirname, 'out');
function readProject(f) { const b = fs.readFileSync(f); return JSON.parse(b.slice(0, 2).toString() === 'PK' ? S.packRead(f, 'project.json').toString() : b.toString('utf8')); }
const run = (file, mode, env) => execFileSync(process.execPath, [mock, file, mode], { encoding: 'utf8', env: Object.assign({}, process.env, env || {}) });

// 1. окно открылось, человек ввёл данные заказа и нажал «Выгрузить и открыть»
const f1 = path.join(out, 'win.bmk');
run(f1, 'win', { BM_MOCK_ANSWER: JSON.stringify({ customer: 'ООО «Ромашка»', orderNo: 'STH-0042', title: 'Шкаф-купе', note: 'забор в пятницу', choice: 'open' }) });
const m1 = readProject(f1).model;
assert.strictEqual(m1.customer, 'ООО «Ромашка»'); assert.strictEqual(m1.orderNo, 'STH-0042'); assert.strictEqual(m1.title, 'Шкаф-купе'); assert.strictEqual(m1.note, 'забор в пятницу'); assert.strictEqual(m1.choice, 'open');
assert.ok(m1.parts.length > 10);
ok('данные заказа из окна попадают в проект');

// 2. закрыли окно — проект не пишется
const f2 = path.join(out, 'cancel.bmk'); try { fs.unlinkSync(f2); } catch (e) { /* нет */ }
const log2 = run(f2, 'win', { BM_MOCK_CANCEL: '1' });
assert.ok(/не записан/.test(log2) && !fs.existsSync(f2)); ok('окно закрыли — выгрузка отменена');

// 3. окна нет (mshta недоступна) — как раньше, данные из модели
const f3 = path.join(out, 'nowin.bmk'); run(f3, '');
const m3 = readProject(f3).model; assert.strictEqual(m3.customer, 'Северная Венеция'); assert.strictEqual(m3.title, 'СМД001_Кухня'); ok('без окна — данные заказа из модели БАЗИСа');

// 4. скрипт для БАЗИСа: только латиница, путь к программе вписан, выгружает то же самое
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sth-scr-'));
const js = S.installScript(dir, path.join(__dirname, '..', 'bazis'), 'C:\\Program Files\\STHGroup Cutting\\STHGroup Cutting.exe');
const txt = fs.readFileSync(js, 'latin1');
assert.ok(!/[^\x00-\x7f]/.test(txt)); assert.ok(txt.indexOf("var BM_EXE = 'C:\\\\Program Files\\\\STHGroup Cutting\\\\STHGroup Cutting.exe';") >= 0);
assert.ok(fs.existsSync(path.join(dir, 'STHGroup', 'STHGroup_Export.bmp')));
const f4 = path.join(out, 'ascii.bmk'); run(f4, 'win', { SCRIPT: js });
const m4 = readProject(f4).model; assert.strictEqual(m4.parts.length, m1.parts.length); assert.strictEqual(m4.customer, 'Северная Венеция');
ok('латинская копия для БАЗИСа: путь вписан, выгрузка та же');
console.log('проверок ' + n + ' | ошибок нет');
