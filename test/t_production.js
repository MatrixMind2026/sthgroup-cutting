/* Сценарии производства без рабочих баз и моделей. node test/t_production.js */
const assert = require('node:assert/strict'), fs = require('fs');
for (const f of ['geom', 'cut', 'project', 'dbf', 'matbase', 'sth_stock', 'sth_order', 'sth_production']) require('../web/core/' + f + '.js');
const F = BM.sthProduction, O = BM.sth, MB = BM.mb, K = BM.stock, P = BM.project;
let count = 0;
function test(name, fn) { fn(); count++; console.log('ок', name); }
const clone = v => JSON.parse(JSON.stringify(v));
const book = O.empty(), order = O.addOrder(book, {}), base = K.fix(MB.fix(null));
const group = MB.addGroup(base, '', 'Плиты', 'sheet');
const mat = MB.saveMat(base, { name: 'ЛДСП Дуб', group: group.id, unit: 'лист', maxL: 2750, maxW: 1830, th: 16, price: 4500 }).mat;
K.move(base, 'in', mat.id, 5, { price: 4500 });
const other = { id: 'other', no: 'STH-0002' };
const need = { need: [{ mat: mat.id, qty: 6 }], miss: [], bad: [] };
test('Старый заказ сохраняет данные и получает операции при открытии производства', () => {
 const saved = clone(order); F.fix(order); assert.equal(F.fix(order).operations.length, 4); assert.deepEqual(order.items, saved.items); assert.equal(order.status, saved.status);
});
test('Чужой резерв исключён из доступного; необеспеченный резерв не становится физическим материалом', () => {
 K.reserve(base, mat.id, 3, other); K.reserve(base, mat.id, 6, order);
 const row = F.supply(base, order, need)[0]; assert.equal(row.reserved, 2); assert.equal(row.buy, 4); assert.equal(row.requestedReserve, 6);
});
test('Приход связан с заказом и увеличивает резерв; повторное чтение не создаёт движения', () => {
 F.receive(base, order, mat.id, 2, 4600, 'Накладная');
 let r = F.supply(base, order, need)[0]; assert.equal(r.received, 2); assert.equal(r.buy, 2); assert.equal(r.reserved, 4);
 const docs = base.stock.docs.length; F.supply(base, order, need); assert.equal(base.stock.docs.length, docs);
});
test('Выданное в цех уменьшает оставшуюся потребность; отмена прихода пересчитывает обеспечение', () => {
 K.move(base, 'out', mat.id, 2, { order }); const r = F.supply(base, order, need)[0]; assert.equal(r.issued, 2); assert.equal(r.remaining, 4); assert.equal(r.buy, 2);
 const receipt = base.stock.docs.find(d => d.kind === 'in' && d.order === order.id); receipt.off = true;
 assert.equal(F.supply(base, order, need)[0].received, 0); assert.equal(F.supply(base, order, need)[0].buy, 4); receipt.off = false;
});
test('Несколько изделий суммируют потребность; обрезки не прибавляются к листам', () => {
 const r = F.supply(base, order, { need: [{ mat: mat.id, qty: 2 }, { mat: mat.id, qty: 4 }] })[0]; assert.equal(r.need, 6);
 K.addRemainder(base, mat.id, 1000, 600, 2, {}); assert.equal(F.supply(base, order, need)[0].need, 6);
});
test('Заявка группируется по поставщику с округлением упаковки и не меняет склад', () => {
 const m = base.mats[mat.id]; m.round = 2; m.roundTo = 5; m.sup = 'supplier';
 const row = F.supply(base, order, need)[0]; assert.equal(row.purchaseQty, 5);
 const before = JSON.stringify(base.stock), docs = F.purchase(base, order, [row]); assert.equal(docs.length, 1); assert.equal(docs[0].lines[0].qty, 5); assert.equal(docs[0].supplier, 'supplier'); assert.equal(JSON.stringify(base.stock), before);
});
test('Ошибочные количества/цены не создают приход', () => {
 const before = JSON.stringify(base.stock); assert.throws(() => F.receive(base, order, mat.id, -1, 1, '')); assert.throws(() => F.receive(base, order, mat.id, 1, 'abc', '')); assert.throws(() => F.receive(base, order, mat.id, 0, 1, '')); assert.equal(JSON.stringify(base.stock), before);
});
test('Материал клиента виден в обеспечении, но не заказывается у поставщика', () => {
 order.ownMat = 0; const r = F.supply(base, order, need)[0]; assert.equal(r.customer, true); assert.equal(r.purchaseQty, 0); assert.ok(r.buy > 0); assert.deepEqual(F.purchase(base, order, [r]), []); order.ownMat = 1;
});
test('Операции сохраняют ответственного/срок и историю; повторное завершение не дублируется', () => {
 F.updateOperation(order, 'cut', { who: 'Мастер', due: '2026-11-10', status: 'work', note: 'Сохранить маркировку' });
 let op = F.updateOperation(order, 'cut', { status: 'done' }); assert.ok(op.finishedAt); const n = F.fix(order).history.length;
 F.updateOperation(order, 'cut', { status: 'done' }); assert.equal(F.fix(order).history.length, n); F.updateOperation(order, 'cut', { status: 'work' }); assert.equal(op.finishedAt, undefined);
 assert.throws(() => F.updateOperation(order, 'cut', { status: 'unknown' })); assert.equal(order.status, 'calc');
});
const snap = { title: 'Кухня', sheets: [{ name: 'ЛДСП', th: 16, n: 2, work: 'full' }], parts: 20, smallEdge: 0, smallDrill: 0, mat: 49000, fit: 19044, at: new Date().toISOString() };
order.items.push({ path: 'test.bmk', title: 'Кухня', snap });
test('План фиксируется независимо от дальнейшего пересчёта и не включает наценку на материалы', () => {
 const plan = clone(F.freezePlan(book, order)); assert.equal(plan.mat, 49000); assert.equal(plan.fit, 19044); order.items[0].snap.mat = 51000; assert.deepEqual(F.freezePlan(book, order), plan);
});
test('Невнесённые факты не подменяются нулём и не дают ложного итогового отклонения', () => {
 let q = F.planFact(order); assert.equal(q.complete, false); assert.equal(q.rows[0].fact, null); assert.equal(q.delta, null);
 F.addActual(order, { category: 'mat', amount: '51 000', note: 'Дополнительный лист' }); q = F.planFact(order); assert.equal(q.rows[0].delta, 2000); assert.equal(q.delta, null);
});
test('План/факт считает три статьи, отмена сохраняется в истории', () => {
 F.addActual(order, { category: 'fit', amount: 19644, note: 'Петли' }); const cost = F.addActual(order, { category: 'work', amount: 12788, note: 'Работы' });
 let q = F.planFact(order); assert.equal(q.fact, 83432); assert.equal(q.delta, O.r2(83432 - q.plan)); assert.equal(q.complete, true);
 assert.ok(F.removeActual(order, cost.id)); assert.equal(F.planFact(order).complete, false); assert.ok(F.fix(order).actuals.find(x => x.id === cost.id).void);
 assert.throws(() => F.addActual(order, { category: 'mat', amount: -1, note: 'Ошибка' }));
});
const source = JSON.parse(fs.readFileSync(__dirname + '/out/est.bmk', 'utf8'));
const st = P.build(clone(source), BM.defaults()), version = F.modelSnapshot(st);
test('Повторная выгрузка с другими id и порядком деталей не даёт ложных изменений', () => {
 const next = clone(source); next.model.parts.reverse(); // Отверстия сохраняют привязку по пространственным координатам.
 next.model.parts.forEach((p, i) => p.id = 5000 + i);
 const same = F.modelSnapshot(P.build(next, BM.defaults())); assert.deepEqual(F.diff(version, same), []);
});
test('Сравнение обнаруживает размеры, материал, количество, удаление и новую деталь', () => {
 const next = clone(version); const row = next.rows[0]; row.L += 20; row.material = 'Другой декор'; row.qty += 1; next.rows.splice(1, 1);
 next.rows.push(Object.assign({}, row, { identity: 'new', name: 'Новая планка' })); const diff = F.diff(version, next);
 assert.ok(diff.some(x => x.fields.includes('Размер') && x.fields.includes('Материал') && x.fields.includes('Количество'))); assert.ok(diff.some(x => x.kind === 'added')); assert.ok(diff.some(x => x.kind === 'removed'));
});
test('Кромка и присадка обнаруживаются отдельно от размера', () => {
 const next = clone(version); next.rows[0].edge = 'new-edge'; next.rows[0].holes = 'new-holes'; const diff = F.diff(version, next); assert.equal(diff.length, 1); assert.ok(diff[0].fields.includes('Кромка')); assert.ok(diff[0].fields.includes('Присадка'));
});
test('Изменение количества фурнитуры видно даже при неизменных панелях', () => {
 const next = clone(source); next.model.fast[0].n += 1; const diff = F.diff(version, F.modelSnapshot(P.build(next, BM.defaults()))); assert.ok(diff.some(x => x.name === next.model.fast[0].name && x.fields.includes('Количество')));
});
test('Замена декора кромки без изменения её толщины обнаруживается в реальной выгрузке', () => {
 const next = clone(source); next.model.parts[0].butts[0].mat = 'Кромка другого декора'; const diff = F.diff(version, F.modelSnapshot(P.build(next, BM.defaults()))); assert.ok(diff.some(x => x.fields.includes('Кромка')));
});
test('Снимок стандартной сводки дополняется деталями, не меняя сумму материала', () => {
 const snapshot = O.snapshot(st, { groups: { 'МАТЕРИАЛ': 1200, 'ФУРНИТУРА': 500 } }, book.cat, 'Тест', 'test.bmk'); assert.equal(snapshot.mat, 1200); assert.equal(snapshot.fit, 500); assert.ok(snapshot.modelVersion.rows.length > 0); assert.ok(snapshot.edgeM >= 0);
});
test('Задание — независимый снимок; скрытые примечания и карты не попадают в него', () => {
 F.fix(order).jobOptions = { who: 'Мастер', due: '2026-11-12', maps: false, notes: false, edges: false, note: 'Не включать' };
 const job = F.job(book, order, F.supply(base, order, need), [{ svg: '<svg/>' }]); assert.equal(job.options.note, ''); assert.equal(job.note, ''); assert.deepEqual(job.maps, []);
 const old = job.operations[0].who; F.updateOperation(order, 'cut', { who: 'Другой' }); assert.equal(job.operations[0].who, old);
});
test('Производственные данные и история переживают сохранение и обычное исправление книги', () => {
 const restored = O.fix(clone(book)); assert.deepEqual(restored.orders[0].production, order.production); assert.deepEqual(restored.orders[0].items, order.items);
});
console.log('Производство:', count, 'сценариев — ошибок нет');
