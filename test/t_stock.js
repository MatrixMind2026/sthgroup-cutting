// Склад STHGroup (core/sth_stock.js): вкладки, приход/расход, резерв под заказ, ячейка, обрезки, поиск куска.   node test/t_stock.js
require('../web/core/dbf.js'); require('../web/core/matbase.js'); require('../web/core/sth_stock.js');
const MB = BM.mb, SK = BM.stock;
let bad = 0, n = 0;
const ok = (c, text, extra) => { n++; if (!c) { bad++; console.log('НЕ ТАК', text, extra === undefined ? '' : '→ ' + JSON.stringify(extra).slice(0, 500)); } };

const b = SK.fix(MB.fix(null));
const gS = MB.addGroup(b, '', 'Плитные', 'sheet'), gE = MB.addGroup(b, '', 'Кромка', 'edge'), gF = MB.addGroup(b, '', 'Фурнитура', 'fit');
const add = (name, group, unit, kind) => MB.saveMat(b, { name, group, unit, kind: kind || 'sheet', maxL: 2800, maxW: 2070, th: 16 }).mat;
const ld = add('ЛДСП Белый 16', gS.id, 'лист'), top = add('Столешница Дуб', gS.id, 'шт', 'top'), ed = add('Кромка белая 0,4×19', gE.id, 'м'), sh = add('Шкант 8×30', gF.id, 'шт');
ok(SK.tabOf(b, ld) === 'sheet' && SK.tabOf(b, top) === 'lin' && SK.tabOf(b, ed) === 'lin' && SK.tabOf(b, sh) === 'fit', 'вкладки: лист, погонаж и кромка, фурнитура');
ok(!SK.rows(b, 'sheet').length && SK.rows(b, 'sheet', '', true).length === 1, 'пустой склад: строк нет, «все из базы» — материалы вкладки');

const o1 = { id: 'o1', no: '124' }, o2 = { id: 'o2', no: '125' };
const d = SK.move(b, 'in', ld.id, '12', { price: 4500, note: 'МДМ' });
ok(d && MB.balance(b, ld.id) === 12 && b.mats[ld.id].price === 4500, 'приход 12 листов, цена в пустую карточку');
SK.reserve(b, ld.id, 5, o1); SK.reserve(b, ld.id, 3, o2);
let r = SK.rows(b, 'sheet')[0];
ok(r.bal === 12 && r.res === 8 && r.free === 4 && r.orders.join() === '124,125', 'резерв двух заказов: есть 12, резерв 8, свободно 4', r);
SK.reserve(b, ld.id, 2, o2);
ok(SK.reserved(b, ld.id) === 7, 'резерв того же заказа — заменяется');
SK.move(b, 'out', ld.id, 3, { order: o1 });
r = SK.rows(b, 'sheet')[0];
ok(r.bal === 9 && SK.resOf(b, ld.id).find(x => x.order === 'o1').qty === 2 && r.free === 5, 'расход по заказу уменьшает его резерв', r);
SK.move(b, 'out', ld.id, 2, { order: o1 });
ok(!SK.resOf(b, ld.id).some(x => x.order === 'o1'), 'резерв выбран полностью — снят');
SK.reserve(b, ld.id, 20, o1);
ok(SK.rows(b, 'sheet')[0].free < 0, 'резерв больше остатка — «докупить»');
SK.unreserveOrder(b, 'o1');
ok(SK.reserved(b, ld.id) === 2, 'снять все резервы заказа');
SK.setCell(b, ld.id, 'А-1');
ok(SK.rows(b, 'sheet', 'а-1')[0].cell === 'А-1' && !SK.rows(b, 'sheet', 'Б-2').length, 'ячейка и поиск по ячейке');
ok(!SK.move(b, 'in', ld.id, 0) && !SK.move(b, 'in', 'нет', 5), 'нулевое количество и чужой материал не пишутся');

MB.addOffcut(b, ld.id, 700, 2070, 1, { project: 'Заказ 120' });
const big = MB.addOffcut(b, ld.id, 2800, 900, 1, {});
const small = MB.addOffcut(b, ld.id, 500, 300, 1, {});
let f = SK.findOff(b, ld.id, 2070, 650);
ok(f.length === 2 && f[0].L === 2070 && f[0].W === 700, 'кусок 650×2070: подходят 700×2070 и 2800×900, меньший — первым', f);
SK.reserveOff(b, f[0].id, o2);
f = SK.findOff(b, ld.id, 2070, 650);
ok(f.length === 1 && f[0].id === big.id, 'зарезервированный обрезок не предлагается');
SK.unreserveOrder(b, 'o2');
ok(SK.findOff(b, ld.id, 2070, 650).length === 2, 'снять резервы заказа — обрезок снова свободен');
SK.dropOff(b, small.id);
ok(SK.offRows(b).length === 2 && SK.offRows(b, '2800').length === 1, 'удалённый обрезок не на складе; поиск по размеру');

const mv = SK.moves(b);
ok(mv.length === 3 && mv[0].kind === 'out' && SK.moves(b, 'мдм').length === 1, 'движения: новые сверху, поиск по примечанию', mv.map(x => x.kind));
const again = MB.fix(JSON.parse(JSON.stringify(b)));
SK.fix(again);
ok(again.stock.res.length === b.stock.res.length && again.stock.cells[ld.id] === 'А-1', 'резервы и ячейки сохраняются в файле базы');
console.log('проверок', n, '|', bad ? 'ОШИБОК: ' + bad : 'ошибок нет');
process.exit(bad ? 1 : 0);
