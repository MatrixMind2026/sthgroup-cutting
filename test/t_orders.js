// Заказы STHGroup: сводка изделия из проекта, расчёт КП «как у фабрики», заказ из выгрузки
for (const f of ['geom', 'cut', 'project', 'draw', 'zip', 'out_tab', 'base', 'estimate', 'out_est', 'facades', 'out_det', 'sth_order']) require('../web/core/' + f + '.js');
const assert = require('assert'), fs = require('fs'), P = BM.project, E = BM.est, O = BM.sth;
let n = 0; const ok = (name) => { n++; console.log('ок     ' + name); };
const load = (file) => { const st = P.build(JSON.parse(fs.readFileSync(__dirname + '/out/' + file, 'utf8')), BM.defaults()); for (const m of st.mats) if (m.cfg.on) P.nest(st, m.key, { quality: 0 }); return st; };
const b = O.fix(null), cat = b.cat;
const st = load('est.bmk'), R = E.build(st, E.conf(st.set), E.newList('x'), st.work.est);
const sn = O.snapshot(st, R, cat, 'Кухня', '/x/Кухня.bmk');
const sm = P.summary(st), sheets = sm.mats.reduce((a, x) => a + x.std + x.rem, 0);
assert.strictEqual(sn.sheets.reduce((a, s) => a + s.n, 0), sheets); assert.ok(sn.parts > 50);
assert.ok(sn.sheets.find(s => /ХДФ/.test(s.name)).work === 'cut' && sn.sheets.find(s => /ЛДСП/.test(s.name)).work === 'full');
assert.strictEqual(sn.mat, R.groups['МАТЕРИАЛ']); assert.strictEqual(sn.fit, R.groups['ФУРНИТУРА']);
assert.ok(sn.smallEdge >= 0 && sn.smallDrill >= 0);
ok('сводка изделия: листы по видам работ (ХДФ — только распил), детали, материалы и фурнитура из сметы');

// заказ из выгрузки: номер из окна скрипта, клиент заводится сам; повторная выгрузка — то же изделие
const r1 = O.forProject(b, '/x/Кухня.bmk', { orderNo: 'STH-0042', customer: 'Северная Венеция', note: '' });
assert.ok(r1.made && r1.order.no === 'STH-0042' && O.client(b, r1.order.clientId).name === 'Северная Венеция');
const r2 = O.forProject(b, '/x/Кухня.bmk', { orderNo: '', customer: 'Северная Венеция' });
assert.ok(!r2.made && r2.order === r1.order && r1.order.items.length === 1);
const r3 = O.forProject(b, '/x/Шкаф.bmk', { orderNo: 'STH-0042', customer: 'Северная Венеция' });
assert.ok(!r3.made && r1.order.items.length === 2 && b.clients.length === 1);
const r4 = O.forProject(b, '/x/Другое.bmk', { customer: 'Иванов' });
assert.ok(r4.made && r4.order.no === 'STH-0001'); ok('заказ из выгрузки: по номеру или файлу, иначе новый STH-0001 с клиентом');

// расчёт
const o = r1.order; O.putItem(o, '/x/Кухня.bmk', sn); O.putItem(o, '/x/Шкаф.bmk', Object.assign({}, sn, { title: 'Шкаф' }));
const q = O.calc(b, o);
const full = q.blocks[0].lines.find(l => l.key === 'w:full'), cut = q.blocks[0].lines.find(l => l.key === 'w:cut');
const fullN = 2 * sn.sheets.filter(s => s.work === 'full').reduce((a, s) => a + s.n, 0);
assert.strictEqual(full.qty, fullN); assert.strictEqual(full.sum, fullN * 5250); assert.ok(cut && cut.price === 1050);
const up = q.blocks[2].lines.find(l => l.key === 'up'), pack = q.blocks[2].lines.find(l => l.key === 'pack'), unload = q.blocks[2].lines.find(l => l.key === 'unload');
assert.ok(up.qty === 2 && pack.qty === q.sheets && unload.sum === 0);
assert.strictEqual(q.discount, O.r2(q.serv * 0.04));
assert.strictEqual(q.mats, O.r2(O.r2(2 * sn.mat * 1.15) + O.r2(2 * sn.fit * 1.15)));
assert.strictEqual(q.total, O.r2(q.servD + q.mats)); assert.strictEqual(q.advance, O.r2(q.servD * 0.7 + q.mats));
ok('расчёт: за лист по виду работы, услуги за изделие/лист, скидка 4% от услуг, материалы +15%, аванс 70%+100%');
o.complex = 0; o.ownFit = 0; o.svc.cashless = { on: 1 }; o.payments.push({ date: '2026-11-02', amount: 1000 });
const q2 = O.calc(b, o), cl = q2.blocks[2].lines.find(l => l.key === 'cashless');
assert.ok(q2.discount === 0 && q2.matLines[1].sum === 0 && cl.sum === O.r2((q2.servD + q2.mats) * 0.07));
assert.strictEqual(q2.debt, O.r2(q2.total - 1000)); ok('без скидки, без нашей фурнитуры, безнал 7%, долг по оплатам');
const t = O.termsText(b, o, q2); assert.ok(t.length === 4 && /средняя/.test(t[1]) && /10 раб/.test(t[1]) && /3-го/.test(t[3])); ok('условия «Важно знать» с подстановкой');
console.log('проверок ' + n + ' | ошибок нет');
