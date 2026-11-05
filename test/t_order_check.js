// STHGroup: реальные признаки раскроя, пропуски цен, маршруты проверки и допуск к КП.
for (const f of ['geom', 'cut', 'project', 'draw', 'zip', 'out_tab', 'base', 'estimate', 'out_est', 'facades', 'out_det', 'sth_order', 'sth_est', 'sth_order_check']) require('../web/core/' + f + '.js');
const assert = require('assert'), fs = require('fs'), vm = require('vm');
const P = BM.project, C = BM.sthOrderCheck, O = BM.sth;
const st = P.build(JSON.parse(fs.readFileSync(__dirname + '/out/est.bmk', 'utf8')), BM.defaults());
const rows = [
 { kind: 'panel', offKey: 'one', title: 'ЛДСП', val: 2, price: 0 },
 { kind: 'edge', offKey: 'two', title: 'Кромка', val: 12, price: 35 },
 { kind: 'fastener', offKey: 'three', title: 'Петля', val: 2, price: 0, off: true },
 { kind: 'fastener', offKey: 'four', title: 'Справочно', val: 2, price: 0, info: true },
 { kind: 'own', own: true, ownId: 'own', val: 1, price: 0 },
 { kind: 'profile', offKey: 'zero', val: 0, price: 0 }
];
const infoOf = w => w.kind === 'panel' ? { id: 'known' } : null;
let issues = C.inspect(st, { rows }, infoOf);
assert.strictEqual(issues.filter(i => i.kind === 'noPrice').length, 1);
assert.strictEqual(issues.filter(i => i.kind === 'unlinked').length, 1);
assert.strictEqual(issues.find(i => i.kind === 'noPrice').row, 'panel|one');
assert.ok(issues.some(i => i.kind === 'stale'));
for (const m of st.mats) if (m.cfg.on) P.nest(st, m.key, { quality: 0 });
const original = JSON.stringify(st.doc || st.work);
assert.ok(!C.inspect(st, { rows: [] }, infoOf).some(i => i.kind === 'stale'));
assert.strictEqual(JSON.stringify(st.doc || st.work), original);
const mat = st.mats.find(m => m.cfg.on && st.work.layout[m.key]);
st.work.layout[mat.key].buf = [{}];
assert.ok(C.inspect(st, { rows: [] }, infoOf).some(i => i.kind === 'unplaced' && i.mat === mat.key));
st.work.layout[mat.key].buf = [];
st.work.layout[mat.key].key = 'old';
assert.ok(C.inspect(st, { rows: [] }, infoOf).some(i => i.kind === 'stale' && i.mat === mat.key));

(async () => {
 const book = O.empty(), order = O.addOrder(book, {}), R = { rows: [], groups: { 'МАТЕРИАЛ': 100, 'ФУРНИТУРА': 0 } };
 O.putItem(order, 'current.bmk', O.snapshot(st, R, book.cat, 'Тест', 'current.bmk'));
 const state = { path: 'current.bmk', st, tabs: [], set: BM.defaults(), prices: { sup: {}, lists: [BM.est.newList('Основной')] } };
 const modals = [], docs = [];
 let choice = null, reads = 0;
 const X = { book, cur: order.id, doc(o, kind) { docs.push(kind); } };
 const U = { esc: String, baseOf: String, toast() {}, error(e) { throw e; },
  api: { async readText() { reads++; throw new Error('Нет файла'); } },
  async modal(options) { modals.push(options); return choice; }
 };
 const K = { async refresh() {}, build() { return R; }, rowInfo: infoOf };
 vm.runInNewContext(fs.readFileSync(__dirname + '/../web/ui/sth_order_check.js', 'utf8'), {
  BM, window: { STHO: X, UI: U, App: { S: state, tabOf(path) { return state.tabs.findIndex(t => t.path === path); } }, MatBase: K, Est: { cfg() { return {}; } } },
  document: { addEventListener() {} }
 });
 let found = await X.inspectOrder(order);
 assert.ok(found.some(i => i.kind === 'stale' && i.path === 'current.bmk'));
 assert.strictEqual(reads, 0, 'текущая модель проверяется в памяти');
 const before = JSON.stringify(order);
 await X.doc(order, 'kp');
 assert.strictEqual(docs.length, 0, 'закрытие предупреждений отменяет открытие КП');
 assert.strictEqual(JSON.stringify(order), before, 'проверка не меняет заказ');
 choice = 'quote'; await X.doc(order, 'kp'); assert.deepStrictEqual(docs, ['kp']);
 await X.doc(order, 'inv'); assert.deepStrictEqual(docs, ['kp', 'inv']);
 const second = { path: 'missing.bmk', title: 'Второе' }; order.items.push(second);
 found = await X.inspectOrder(order);
 assert.ok(found.some(i => i.kind === 'unreadable' && i.item === 'Второе'));
 state.tabs.push({ path: 'missing.bmk', st }); const readCount = reads;
 found = await X.inspectOrder(order);
 assert.ok(!found.some(i => i.kind === 'unreadable'));
 assert.strictEqual(reads, readCount, 'открытая другая вкладка проверяется без чтения файла');
 order.items.pop();
 for (const m of st.mats) if (m.cfg.on) P.nest(st, m.key, { quality: 0 });
 order.items[0].snap = O.snapshot(st, R, book.cat, 'Тест', 'current.bmk');
 const modalCount = modals.length;
 await X.doc(order, 'kp');
 assert.strictEqual(modals.length, modalCount, 'КП без замечаний открывается без дополнительного окна');
 assert.deepStrictEqual(docs, ['kp', 'inv', 'kp']);
 assert.strictEqual((await X.inspectOrder({ items: [] }))[0].kind, 'empty');
 console.log('ошибок нет: цены, сопоставление, раскрой, отсутствие файла, проверка перед КП без изменения заказа');
})().catch(e => { console.error(e); process.exitCode = 1; });
