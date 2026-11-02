// База материалов (2.1, core/matbase.js): группы, материалы, уникальность, фильтры, справочники, склад, импорт/экспорт, перенос.
//   node test/t_matbase.js
require('../web/core/dbf.js'); require('../web/core/matbase.js');
const MB = BM.mb;
let bad = 0, n = 0;
const ok = (c, text, extra) => { n++; if (!c) { bad++; console.log('НЕ ТАК', text, extra === undefined ? '' : '→ ' + JSON.stringify(extra).slice(0, 500)); } };

let b = MB.fix(null);
ok(!b.groups.length && !Object.keys(b.mats).length && b.units.indexOf('шт') >= 0 && b.set.unique === 'and', 'новая база пустая, единицы по умолчанию');
const gS = MB.addGroup(b, '', 'Листовые', 'sheet'), gL = MB.addGroup(b, gS.id, 'ЛДСП'), gE = MB.addGroup(b, '', 'Кромка', 'edge');
ok(gL.type === 'sheet' && MB.path(b, gL.id).join('/') === 'Листовые/ЛДСП', 'подгруппа берёт тип родителя, путь');
ok(!MB.moveGroup(b, gS.id, gL.id) && MB.moveGroup(b, gE.id, gS.id) && MB.moveGroup(b, gE.id, ''), 'группу нельзя перенести внутрь себя');
const m1 = MB.saveMat(b, Object.assign(MB.defMat(gL.id), { name: ' ЛДСП  16 Белый ', art: 'W980', unit: 'лист', price: '4 850,5', th: 16, maxL: 2800, maxW: 2070 })).mat;
ok(m1 && m1.name === 'ЛДСП 16 Белый' && m1.price === 4850.5, 'материал: пробелы, цена с запятой', m1);
ok(MB.saveMat(b, Object.assign(MB.defMat(gL.id), { name: 'ЛДСП 16 Белый', art: 'w980' })).errors, 'уникальность «артикул И наименование»');
ok(!MB.saveMat(b, Object.assign(MB.defMat(gL.id), { name: 'ЛДСП 16 Белый', art: 'W981' })).errors, 'другой артикул — можно');
b.set.unique = 'or';
ok(MB.saveMat(b, Object.assign(MB.defMat(gL.id), { name: 'Другое', art: 'W980' })).errors, 'уникальность «ИЛИ»');
b.set.unique = 'and';
ok(MB.saveMat(b, MB.defMat('')).errors.length === 2, 'без названия и группы — ошибки');
const m2 = MB.saveMat(b, Object.assign(MB.defMat(gE.id), { name: 'Кромка ПВХ 0,8×19 Белая', art: 'K1', unit: 'м', price: 22, round: 1 })).mat;
const cp = MB.copyMat(b, m1.id);
ok(cp && cp.name === 'ЛДСП 16 Белый (копия)' && cp.id !== m1.id && MB.copyMat(b, m1.id).name === 'ЛДСП 16 Белый (копия) 2', 'на основе текущего');
ok(MB.list(b, { group: gS.id }).length === 4 && (b.set.showSub = 0, MB.list(b, { group: gS.id }).length === 0), 'подгруппы — по настройке');
b.set.showSub = 1;
ok(MB.list(b, { filters: { price: '>100' } }).length === 3 && MB.list(b, { filters: { price: '<100' } }).length === 2 && MB.list(b, { filters: { name: 'копия' } }).length === 2 && MB.list(b, { filters: { th: '10..20' } }).length === 3, 'фильтры столбцов');
ok(MB.list(b, { q: 'w98', sort: { col: 'art', dir: -1 } })[0].art === 'W981', 'поиск и сортировка');
ok(MB.roundQty(m2, 12.2) === 13 && MB.roundQty(Object.assign({}, m2, { round: 2, roundTo: 5 }), 12.2) === 15, 'округление количества');
/* справочники */
const cg = MB.addClassGroup(b, 'Поставщики'), c1 = MB.addClass(b, 'Egger', cg.code), c2 = MB.addClass(b, 'Blum', cg.code);
ok(cg.code === 'GM0' && c1.code === 'M0' && c2.code === 'M1', 'коды классов как в БАЗИСе');
b.mats[m1.id].cls = [c1.code, c2.code]; MB.dropClass(b, c2.code);
ok(b.mats[m1.id].cls.join() === 'M0' && MB.cell(b, b.mats[m1.id], 'cls') === 'M0', 'удалённый класс снят с материалов');
MB.setCurrencies(b, [{ name: 'EUR', rate: '98,5' }, { name: '' }]);
b.mats[m2.id].altCur = 'EUR'; b.mats[m2.id].altPrice = 0.5;
ok(MB.priceOf(b, b.mats[m2.id]) === 49.25, 'цена по альтернативной валюте');
const s1 = MB.saveSupplier(b, { name: 'Склад плит', url: 'plity.ru' });
b.mats[m1.id].sup = s1.id;
/* инструменты */
ok(MB.updatePrices(b, [m1.id], { pct: 10 }) === 1 && b.mats[m1.id].price === 5335.55, 'обновление цен на процент');
ok(MB.duplicates(b).length === 0, 'дубликатов нет');
b.mats.dup = Object.assign(JSON.parse(JSON.stringify(b.mats[m1.id])), { id: 'dup' });
ok(MB.duplicates(b).length === 1, 'дубликат найден');
MB.dropMat(b, 'dup');
/* склад */
const d1 = MB.addDoc(b, { kind: 'in', sup: s1.id, lines: [{ mat: m1.id, qty: 10, price: 5000 }, { mat: m2.id, qty: 200 }, { mat: 'нет', qty: 1 }] });
ok(d1 && d1.lines.length === 2 && MB.balance(b, m1.id) === 10 && MB.cell(b, b.mats[m2.id], 'stock') === 200, 'приход');
const w1 = MB.writeOff(b, 'Кухня', [{ mat: m1.id, qty: 3 }, { mat: m2.id, qty: 40.5 }, { mat: m1.id, qty: 1 }], [{ mat: m1.id, L: 900, W: 600 }, { mat: m1.id, L: 250, W: 900 }, { mat: m1.id, L: 1200, W: 150 }]);
ok(MB.balance(b, m1.id) === 6 && MB.balance(b, m2.id) === 159.5 && w1.offcuts.length === 2 && MB.offcuts(b, m1.id)[1].W === 250, 'списание по заказу и обрезки не меньше 300×200 (1200×150 — нет)', w1.offcuts);
const w2 = MB.writeOff(b, 'Кухня', [{ mat: m1.id, qty: 2 }], []);
ok(w2.replaced === 1 && MB.balance(b, m1.id) === 8 && MB.offcuts(b, m1.id).length === 0, 'повторное списание заменяет прежнее');
MB.addDoc(b, { kind: 'adj', lines: [{ mat: m1.id, qty: -1 }] });
ok(MB.balance(b, m1.id) === 7 && MB.moves(b, m1.id).length === 4, 'корректировка и движения');
const oc = MB.addOffcut(b, m1.id, 500, 700, 2);
ok(oc.L === 700 && MB.useOffcut(b, oc.id, 'Шкаф') && !MB.offcuts(b, m1.id).length, 'обрезок вручную и взят в раскрой');
/* связь со сметой и раскроем */
const inf = MB.infoFor(b, 'лдсп 16 белый', 'W980');
ok(inf && inf.price === 5335.55 && inf.L === 2800 && inf.shop === 'Склад плит' && inf.stock === 7 && !MB.infoFor(b, 'Нет такого', ''), 'данные для сметы и раскроя', inf);
/* импорт / экспорт */
const recs = MB.exportRecs(b);
ok(recs.length === 5 && recs.find(r => r.ITEMCODE === 'K1').ISTAPE === 1 && recs[0].GRP_NAME.indexOf('Листовые') === 0, 'запись в полях БАЗИСа');
const csv = MB.toCSV(recs), xml = MB.toXML(recs), dbf = MB.toDBF(recs);
ok(MB.fromCSV(csv).length === 5 && MB.fromXML(xml).length === 5 && MB.fromDBF(dbf).length === 5 && MB.fromDBF(dbf)[0].ITEMNAME === recs[0].ITEMNAME, 'CSV, XML, DBF читаются обратно', MB.fromDBF(dbf)[0]);
const b2 = MB.fix(null), r2 = MB.importRecs(b2, MB.fromDBF(dbf));
const r2b = MB.importRecs(b2, MB.fromXML(xml));
ok(r2.add === 5 && b2.groups.length === 3 && MB.list(b2, { q: 'W980' })[0].maxL === 2800 && r2b.upd === 4 && r2b.add === 1, 'импорт в пустую базу и повторно — обновление (знака «×» нет в кодировке .dbf — та кромка из XML новая)', [r2, r2b, b2.groups.length, MB.list(b2, { q: 'W980' }).map(m => m.maxL)]);
ok(MB.fromCSV('ITEMNAME;PRICE\r\n"А; ""Б""";12,5\r\n')[0].ITEMNAME === 'А; "Б"', 'CSV: кавычки и разделитель');
/* перенос из прежней «Базы» */
const old = { sup: [{ id: 'a', name: 'Мебельная фурнитура', url: 'mf.ru' }], groups: [{ code: 'G1', name: 'Вид материала', classes: [{ code: 'C1', name: 'Петли' }] }],
	mats: { 'Петля Blum': { art: 'P1', kind: '', cls: { G1: ['C1'] }, sup: 'a' }, 'ЛДСП 16 Белый': { art: 'W980', kind: 'плита', cls: {}, bz: { L: 2750, W: 1830, grp: 'Плиты/ЛДСП' } } } };
const r3 = MB.fromOld(b, old);
ok(r3.sup === 1 && r3.cls === 1 && r3.mats === 1 && r3.skip === 1 && MB.byName(b, 'Петля Blum').cls.length === 1, 'перенос: уже заведённое не трогается', r3);
/* файл */
const again = MB.fix(JSON.parse(JSON.stringify(b)));
ok(Object.keys(again.mats).length === Object.keys(b.mats).length && again.stock.docs.length === b.stock.docs.length && MB.fix({ format: 'x' }).groups.length === 0, 'запись и чтение файла');
ok(MB.dropGroup(b, gS.id).mats === 4 && !MB.list(b, {}).some(m => m.group === gL.id), 'удаление группы с подгруппами и материалами');
console.log('проверок', n, '|', bad ? 'ОШИБОК: ' + bad : 'ошибок нет');
process.exit(bad ? 1 : 0);
