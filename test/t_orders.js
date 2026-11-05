// Заказы STHGroup: сводка изделия из проекта, расчёт КП «как у фабрики», заказ из выгрузки
for (const f of ['geom', 'cut', 'project', 'draw', 'zip', 'out_tab', 'base', 'estimate', 'out_est', 'facades', 'out_det', 'sth_order']) require('../web/core/' + f + '.js');
const assert = require('assert'), fs = require('fs'), P = BM.project, E = BM.est, O = BM.sth;
let n = 0; const ok = (name) => { n++; console.log('ок     ' + name); };
const load = (file) => { const st = P.build(JSON.parse(fs.readFileSync(__dirname + '/out/' + file, 'utf8')), BM.defaults()); for (const m of st.mats) if (m.cfg.on) P.nest(st, m.key, { quality: 0 }); return st; };
// книга до 0.9 (свой справочник STHGroup): виды работ по толщине добавляются из образца, свой «Распил» ХДФ остаётся
const old = O.empty(); delete old.cat.v2; old.cat.sheetWorks = [{ id: 'full', name: 'Распил, кромкооблицовка и присадка', price: 5250, match: '' }, { id: 'cut', name: 'Распил', price: 1050, match: 'хдф, двп, hdf, оргалит' }]; delete old.cat.groups;
const b = O.fix(JSON.parse(JSON.stringify(old))), cat = b.cat;
assert.ok(cat.v2 && cat.sheetWorks.some(w => w.id === 'f_ldsp16') && !cat.sheetWorks.some(w => w.id === 'f_hdf') && cat.groups.length === 3);
const st = load('est.bmk'), R = E.build(st, E.conf(st.set), E.newList('x'), st.work.est);
const sn = O.snapshot(st, R, cat, 'Кухня', '/x/Кухня.bmk');
const sm = P.summary(st), sheets = sm.mats.reduce((a, x) => a + x.std + x.rem, 0);
assert.strictEqual(sn.sheets.reduce((a, s) => a + s.n, 0), sheets); assert.ok(sn.parts > 50);
assert.ok(sn.sheets.find(s => /ХДФ/.test(s.name)).work === 'cut' && sn.sheets.find(s => /Дуб Сонома/.test(s.name)).work === 'f_ldsp16' && sn.sheets.find(s => /ЛДСП Белый/.test(s.name)).work === 'f_ldsp25');
assert.ok(sn.sheets.find(s => /МДФ 16/.test(s.name)).work === 'f_mdf19' && sn.sheets.find(s => /Кальцит/.test(s.name)).work === 'full');
assert.strictEqual(sn.mat, R.groups['МАТЕРИАЛ']); assert.strictEqual(sn.fit, R.groups['ФУРНИТУРА']);
assert.ok(sn.smallEdge >= 0 && sn.smallDrill >= 0);
ok('сводка изделия: листы по видам работ по материалу и толщине (ЛДСП 16 / 25, МДФ, ХДФ), детали, материалы и фурнитура из сметы');

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
o.extra = [{ name: '', unit: 'шт', qty: 1, price: 0 }, { name: 'Доставка', unit: 'за заказ', qty: 1, price: 3000 }];
const q3 = O.calc(b, o), ex = q3.blocks[2].lines.filter(l => l.extra);
assert.ok(ex.length === 2 && ex[0].name === '' && ex[1].sum === 3000 && O.r2(q3.serv - q2.serv) === 3000); ok('своя строка: пустая видна для правки, с ценой — в услугах');
// доп. работы и фасады — по количеству из заказа; срочно +30% к услугам, срок 3 дня
const nb = O.fix(null); assert.ok(nb.cat.sheetWorks.some(w => w.id === 'f_hdf') && O.workFor(nb.cat, 'ХДФ Белый', 3).price === 800 && O.workFor(nb.cat, 'Шпон Дуб на МДФ', 19).id === 'f_veneer');
o.svc['g:d_euro'] = { qty: 2 }; o.svc['g:e_m19'] = { qty: 1.5 };
const q4 = O.calc(b, o), gd = q4.blocks.find(x => x.id === 'g:dop'), gf = q4.blocks.find(x => x.id === 'g:fac');
assert.ok(gd.sum === 20000 && gf.sum === O.r2(7100 * 1.5) && O.r2(q4.serv - q3.serv) === O.r2(20000 + 10650));
o.urgent = 1; const q5 = O.calc(b, o);
assert.strictEqual(q5.urgent, O.r2(q5.servD * 0.3)); assert.strictEqual(q5.total, O.r2(q5.servD + q5.urgent + q5.pctSum + q5.mats));
assert.ok(/3 раб/.test(O.termsText(b, o, q5)[1])); ok('доп. работы и фасады за шт и м², срочный заказ +30% к услугам и срок 3 дня');
o.items[0].src = '/bazis/Кухня.bmk'; assert.ok(O.byItem(b, '/bazis/Кухня.bmk') === o && O.dirName(b, o) === 'STH-0042 Северная Венеция'); ok('изделие находится и по исходному файлу выгрузки; папка заказа «номер клиент»');
E.noWorks = true; const Rn = E.build(st, E.conf(st.set), E.newList('x'), st.work.est); E.noWorks = false;
assert.ok(R.rows.some(w => w.group === 'РАБОТЫ') && !Rn.rows.some(w => w.group === 'РАБОТЫ') && Rn.rows.every((w, i) => w.i === i) && Rn.groups['МАТЕРИАЛ'] === R.groups['МАТЕРИАЛ'] && !Rn.groups['РАБОТЫ']);
ok('смета STHGroup без работ: распил, кромкование, пазы и прочие работы — в заказе');
o.lineOrder = { svc: ['kit', 'up'] }; const q6 = O.calc(b, o), sv = q6.blocks[2].lines.map(l => l.key);
assert.ok(sv[0] === 'kit' && sv[1] === 'up' && sv.indexOf('pack') > 1); delete o.lineOrder; ok('порядок строк, заданный перетаскиванием, — в расчёте и КП');
assert.strictEqual(O.words(59428.05), 'Пятьдесят девять тысяч четыреста двадцать восемь рублей 05 копеек');
assert.strictEqual(O.words(1021001.31), 'Один миллион двадцать одна тысяча один рубль 31 копейка'); assert.strictEqual(O.words(2), 'Два рубля 00 копеек');
ok('сумма прописью');
const pl = O.priceList(nb, { pct: -10, hide: { 'sec:g:mill': 1 } }), w1 = pl.sections[0].rows[0];
assert.ok(w1.name === 'ЛДСП 8–16 мм' && w1.note === 'распил / кромка / присадка' && w1.price === 4950 && w1.unit === 'лист');
assert.ok(!pl.sections.some(x => x.id === 'g:mill') && pl.sections.some(x => x.id === 'g:fac') && pl.terms.length >= 4 && pl.sections[1].rows.every(r => r.unit !== '% от суммы'));
ok('прайс для клиента: разделы справочника, примечание из названия, скидка −10%, скрытые разделы, условия');
{ const c2 = E.conf(st.set); c2.edgeMode = 'mm'; c2.edgeMm = 30; const R2 = E.build(st, c2, E.newList('x'), st.work.est), e0 = R.rows.find(w => w.kind === 'edge'), e2 = R2.rows.find(w => w.title === e0.title);
  assert.ok(e2.calc > Number(e0.note.replace(/[^\d.]/g, '')) && e2.calc < e0.calc && /мм ×/.test(e2.unit)); ok('запас кромки «мм на сторону»: длина по модели + свес на каждую облицованную сторону'); }
{ const ob = O.fix({ format: O.FORMAT, v: 1, orders: [], clients: [], cat: { terms: { days: 5 } } }); assert.strictEqual(ob.cat.terms.title, 'Важно знать'); assert.strictEqual(O.empty().cat.terms.title, 'Важно знать'); ok('заголовок условий: по умолчанию «Важно знать», старый справочник получает его сам'); }
{ const oo = O.addOrder(O.empty(), {}), same = O.moveStatus(oo, 'calc', '2026-11-04T10:00:00.000Z'); assert.strictEqual(same.changed, false); const mv = O.moveStatus(oo, 'work', '2026-11-04T10:00:00.000Z'); assert.ok(mv.changed && mv.from === 'calc' && oo.status === 'work' && oo.statusAt === '2026-11-04T10:00:00.000Z' && oo.sthFlow.length === 1); assert.strictEqual(O.moveStatus(oo, 'unknown').changed, false); assert.strictEqual(oo.status, 'work'); ok('карточка заказа: переход только в известный этап, повтор не создаёт запись, история перехода сохраняется'); }
require('../web/core/sth_workspace.js');
// STHGroup: дата новой заявки фиксирована, чтобы порядок внимания не зависел от дня запуска теста.
{ const wb = O.empty(), a = O.addOrder(wb, {}), w = O.addOrder(wb, {}), r = O.addOrder(wb, {}); O.moveStatus(w, 'work', '2026-11-04T11:00:00.000Z'); O.moveStatus(r, 'ready', '2026-11-04T12:00:00.000Z'); a.source = 'crm'; a.date = '2026-11-04'; a.statusAt = '2026-11-04T09:00:00.000Z'; const ts = BM.sthWorkspace.summary(wb); assert.ok(ts.total === 3 && ts.active === 2 && ts.work === 1 && ts.ready === 1 && ts.crm === 1 && ts.attention[0] === w); assert.strictEqual(BM.sthWorkspace.summary(null).total, 0); ok('экран «Сегодня»: активные, работа, готовые, CRM и порядок внимания без DOM'); }
console.log('проверок ' + n + ' | ошибок нет');
