// «База материалов» в программе (2.2, ui/matbase_link.js): цена, поставщик и фото — в смету, формат листа — в раскрой,
// «Списать по заказу» — листы раскроя и строки сметы, деловые обрезки; материала в базе нет — всё как раньше.
//   node test/t_mblink.js
for (const f of ['geom', 'cut', 'project', 'draw', 'm3d', 'drill', 'base', 'estimate', 'dbf', 'matbase']) require('../web/core/' + f + '.js');
const fs = require('fs'), path = require('path');
global.window = { UI: { esc: BM.draw.esc }, App: { S: { boot: {} } }, addEventListener() { } };
global.document = { addEventListener() { }, body: { classList: { contains() { return false; } } } };
global.location = { search: '' };
require('../web/ui/matbase_link.js');
const K = window.MatBase, MB = BM.mb, P = BM.project, E = BM.est;
let bad = 0, n = 0;
const ok = (c, text, extra) => { n++; if (!c) { bad++; console.log('НЕ ТАК', text, extra === undefined ? '' : '→ ' + JSON.stringify(extra).slice(0, 500)); } };
const raw = () => JSON.parse(fs.readFileSync(path.join(__dirname, 'out', 'est.bmk'), 'utf8').replace(/^﻿/, ''));
const nest = (st) => { for (const m of st.mats) if (m.cfg.on) P.nest(st, m.key, { quality: 0 }); return st; };

/* базы нет — смета та же */
MB.cur = null;
const st0 = nest(P.build(raw(), BM.defaults())), pl0 = E.newList('x');
const R0 = E.build(st0, E.conf(st0.set), pl0, st0.work.est, {}), K0 = K.build(st0, E.conf(st0.set), pl0, st0.work.est, {});
ok(JSON.stringify(R0.rows.map(w => [w.title, w.price, w.sum])) === JSON.stringify(K0.rows.map(w => [w.title, w.price, w.sum])), 'без базы смета та же');

/* база: плита, кромка, поставщик, фото */
const b = MB.fix(null), gS = MB.addGroup(b, '', 'Плиты', 'sheet'), gE = MB.addGroup(b, '', 'Кромка', 'edge');
const sup = MB.saveSupplier(b, { name: 'Плиты-Опт', url: 'plity.ru' });
const oak = MB.saveMat(b, Object.assign(MB.defMat(gS.id), { name: 'ЛДСП Дуб Сонома', unit: 'лист', price: 6200, th: 16, maxL: 2620, maxW: 2070, sup: sup.id, photo: 'data:image/jpeg;base64,AAAA', tex: 1 })).mat;
const edge = MB.saveMat(b, Object.assign(MB.defMat(gE.id), { name: 'Кромка Дуб Сонома 1.0x19', unit: 'м', price: 41 })).mat;
const mdf = MB.saveMat(b, Object.assign(MB.defMat(gS.id), { name: 'МДФ 16 мм', unit: 'м2', price: 1000, maxL: 2800, maxW: 2070 })).mat;
MB.addDoc(b, { kind: 'in', lines: [{ mat: oak.id, qty: 10 }, { mat: edge.id, qty: 100 }] });
MB.cur = b;

/* раскрой: формат листа нового материала — из базы */
const st = nest(P.build(raw(), BM.defaults())), mOak = st.mats.find(m => m.name === 'ЛДСП Дуб Сонома');
ok(P.fmtOf(mOak).L === 2620 && P.fmtOf(mOak).W === 2070, 'формат листа — из базы', P.fmtOf(mOak));
ok(P.fmtOf(st.mats.find(m => m.name === 'ЛДСП Белый')).L === 2800, 'материала нет в базе — формат как раньше');

/* смета */
const pl = E.newList('x'), R = K.build(st, E.conf(st.set), pl, st.work.est, {});
const rOak = R.rows.find(w => w.kind === 'panel' && /Дуб Сонома/.test(w.title)), rEdge = R.rows.find(w => w.title === 'Кромка Дуб Сонома 1.0x19'), rMdf = R.rows.find(w => w.kind === 'panel' && /^МДФ 16 мм  16/.test(w.title));
ok(rOak && rOak.price === 6200 && rOak.sup.shop === 'Плиты-Опт' && rOak.sup.img === oak.photo && rOak.mb && rOak.mb.id === oak.id, 'плита: цена, поставщик и фото — из базы', rOak && [rOak.price, rOak.sup]);
ok(rEdge && rEdge.price === 41, 'кромка: цена за метр — из базы', rEdge && rEdge.price);
ok(rMdf && rMdf.price === Math.round(1000 * 2.8 * 2.07 * 100) / 100, 'цена базы за м² — в цену листа', rMdf && rMdf.price);
ok(R.rows.find(w => w.kind === 'panel' && /ЛДСП Белый/.test(w.title)).price === 7000, 'материала нет в базе — цена прайса');
ok(!Object.keys(pl.P).length && R.pl === pl.name, 'прайс не тронут');
E.setPrice(rOak, 5900, pl, st.work.est);
const R2 = K.build(st, E.conf(st.set), pl, st.work.est, {});
ok(R2.rows.find(w => w.kind === 'panel' && /Дуб Сонома/.test(w.title)).price === 5900, 'своя цена в прайсе — главнее базы');
ok(R2.grand > 0 && R2.grand !== R0.grand, 'итог пересчитан');

/* списать по заказу */
const need = K.need(st, R);
const nOak = need.need.find(x => x.mat === oak.id), nEdge = need.need.find(x => x.mat === edge.id);
const sheets = st.work.layout[mOak.key].sheets.filter(s => !s.rem).length;
ok(nOak && nOak.qty === sheets && nEdge && nEdge.qty === rEdge.val, 'расход: листы раскроя и метры кромки', [nOak, nEdge, sheets]);
ok(need.need.filter(x => x.mat === oak.id).length === 1, 'плита не списывается дважды (раскрой и строка сметы)');
ok(need.miss.indexOf('ЛДСП Белый 25 мм') >= 0 || need.miss.some(x => /ЛДСП Белый/.test(x)), 'материалы не из базы — в списке «нет в базе»', need.miss);
ok(need.offcuts.length > 0 && need.offcuts.every(o => o.mat === oak.id || o.mat === mdf.id), 'свободные куски листов — кандидаты в обрезки', need.offcuts.length);
const w1 = MB.writeOff(b, 'Кухня.bmk', need.need, need.offcuts);
ok(MB.balance(b, oak.id) === 10 - sheets && MB.balance(b, edge.id) === Math.round((100 - rEdge.val) * 1e6) / 1e6, 'остатки после списания', [MB.balance(b, oak.id), MB.balance(b, edge.id)]);
ok(w1.offcuts.every(o => o.L >= 300 && o.W >= 200), 'на склад — только обрезки не меньше 300×200', w1.offcuts.length);
const w2 = MB.writeOff(b, 'Кухня.bmk', need.need, need.offcuts);
ok(w2.replaced === 1 && MB.balance(b, oak.id) === 10 - sheets && MB.offcuts(b, oak.id).length === w1.offcuts.filter(o => o.mat === oak.id).length, 'повтор заменяет прежнее списание');

/* единицы */
ok(K.unitOf('листов') === 'лист' && K.unitOf('метров (+20%)') === 'м' && K.unitOf('кв.м') === 'м2' && K.unitOf('шт.') === 'шт', 'единицы сметы и базы');
ok(K.priceIn({ price: 100, unit: 'шт' }, 'метров') === 0, 'разные единицы — цена базы не берётся');

/* групповые правки */
ok(MB.bulkSet(b, [oak.id, mdf.id], 'kCut', '1,1') === 2 && b.mats[mdf.id].kCut === 1.1, 'групповое редактирование');
ok(MB.renameMats(b, [oak.id], 'Дуб', 'Ясень').done === 1 && b.mats[oak.id].name === 'ЛДСП Ясень Сонома', 'переименовать выделенные');
b.mats[oak.id].rel = [{ mat: edge.id, qty: 2 }];
ok(MB.pasteRel(b, b.mats[oak.id].rel, [mdf.id, edge.id]) === 1 && b.mats[mdf.id].rel[0].mat === edge.id && !b.mats[edge.id].rel.length, 'вставить сопутствие из буфера (не себе)');
const v = MB.normMat(Object.assign({}, b.mats[oak.id], { vray: { ior: '1,4', fresnel: 0, diffuse: 'зелёный' }, photo: 'http://x' }));
ok(v.vray.ior === 1.4 && v.vray.fresnel === 0 && v.vray.diffuse === '#c8c8c8' && v.photo === '', 'V-Ray и фото проверяются при записи', v.vray);

console.log('проверок', n, '|', bad ? 'ОШИБОК: ' + bad : 'ошибок нет');
process.exit(bad ? 1 : 0);
