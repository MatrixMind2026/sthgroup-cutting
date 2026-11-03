// STHGroup 2.0: фильтры сметы отделены от расчёта.   node test/t_est_v2.js
global.BM = {};
require('../web/core/sth_est.js');
const C = BM.sthEst;
let bad = 0, n = 0;
const ok = (c, text, extra) => { n++; if (!c) { bad++; console.log('НЕ ТАК', text, extra === undefined ? '' : '→ ' + JSON.stringify(extra)); } };
const rows = [
	{ kind: 'panel', offKey: 'p1', val: 2, price: 100, title: 'Плита' },
	{ kind: 'fastener', offKey: 'f1', val: 4, price: 0, title: 'Петля' },
	{ kind: 'edge', offKey: 'e1', val: 3, price: 20, bad: 'Нет цвета', title: 'Кромка' },
	{ kind: 'panel', offKey: 'p2', val: 1, price: 200, sthReplace: { mat: 'm2' }, title: 'Замена' },
	{ kind: 'panel', offKey: 'p3', val: 1, price: 100, off: true, title: 'Не считать' },
	{ kind: 'own', ownId: 'own1', val: 1, price: 0, title: 'Своя строка' }
];
const infos = { p1: { stock: 5 }, f1: null, e1: { stock: 0 }, p2: { stock: 2 }, p3: { stock: 1 }, own1: null };
const info = w => infos[w.offKey || w.ownId];
ok(C.rowKey(rows[0]) === 'panel|p1' && C.rowKey(rows[5]) === 'own|own1', 'ключи строк совпадают с таблицей сметы');
ok(C.rows(rows, 'all', info).length === 6, 'фильтр «все» не меняет состав');
ok(C.rows(rows, 'problem', info).map(w => w.offKey).join() === 'f1,e1', 'проблемные: нет материала базы или есть предупреждение');
ok(C.rows(rows, 'replaced', info).length === 1 && C.rows(rows, 'replaced', info)[0].offKey === 'p2', 'заменённые строки');
ok(C.rows(rows, 'noPrice', info).length === 1 && C.rows(rows, 'noPrice', info)[0].offKey === 'f1', 'без цены: только активные материальные строки');
ok(C.rows(rows, 'stock', info).map(w => w.offKey).join() === 'p1,p2', 'со склада: положительный остаток у активной строки');
const counts = C.counts(rows, info);
ok(counts.all === 6 && counts.problem === 2 && counts.replaced === 1 && counts.noPrice === 1 && counts.stock === 2, 'счётчики постоянных фильтров', counts);
ok(rows.length === 6 && rows[0].price === 100, 'фильтрация не мутирует расчётные строки');
console.log('проверок', n, '|', bad ? 'ОШИБОК: ' + bad : 'ошибок нет');
process.exit(bad ? 1 : 0);
