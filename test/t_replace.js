// Замена строки сметы материалом базы: позиция, артикул, цена, поставщик и фото; количество модели/базы;
// локальные и общие замены, возврат строки модели, итоги и документы.
//   node test/t_replace.js
for (const f of ['geom', 'cut', 'project', 'draw', 'm3d', 'drill', 'base', 'estimate', 'dbf', 'matbase']) require('../web/core/' + f + '.js');
const fs = require('fs'), path = require('path');
global.window = {
	UI: { esc: BM.draw.esc }, App: { S: { boot: {} }, save() { }, pushUndo() { } },
	Est: { R: null, render() { }, we() { return st.work.est; } }, STH: { picked() { }, mbBtn() { return ''; } },
	addEventListener() { }, focus() { }
};
global.document = { addEventListener() { }, body: { classList: { contains() { return false; } } }, getElementById() { return null; } };
global.location = { search: '' };
require('../web/ui/matbase_link.js');
require('../web/ui/sth_kits.js');
require('../web/ui/sth_replace.js');
const K = window.MatBase, MB = BM.mb, P = BM.project, E = BM.est;
let bad = 0, n = 0;
const ok = (c, text, extra) => { n++; if (!c) { bad++; console.log('НЕ ТАК', text, extra === undefined ? '' : '→ ' + JSON.stringify(extra).slice(0, 600)); } };
const low = s => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
const key = w => w.kind + '|' + low(w.name0 || w.skey || w.title);
const raw = () => JSON.parse(fs.readFileSync(path.join(__dirname, 'out', 'est.bmk'), 'utf8').replace(/^﻿/, ''));
const nest = st => { for (const m of st.mats) if (m.cfg.on) P.nest(st, m.key, { quality: 0 }); return st; };
const st = nest(P.build(raw(), BM.defaults())), pl = E.newList('x'), we = st.work.est;
const b = MB.fix(null), grp = MB.addGroup(b, '', 'Свои товары', 'fit');
const sup = MB.saveSupplier(b, { name: 'Свой поставщик', url: 'example.ru' });
const R0 = E.build(st, E.conf(st.set), pl, we, {});
const fast0 = R0.rows.find(w => w.kind === 'fastener' && w.val > 0), panel0 = R0.rows.find(w => w.kind === 'panel' && w.val > 0), edge0 = R0.rows.find(w => w.kind === 'edge' && w.val > 0);
ok(!!fast0 && !!panel0 && !!edge0, 'в примере есть фурнитура, плита и кромка');
function mat(name, unit, price, extra) {
	return MB.saveMat(b, Object.assign(MB.defMat(grp.id), { name: name, art: 'ART-' + name, unit: unit, price: price, sup: sup.id, photo: 'data:image/png;base64,AAAA' }, extra || {})).mat;
}
const own = mat('Петля СВОЯ', fast0.unit, 123.45, { round: 2, roundTo: 5, pack: 10, packWhole: 1 });
const other = mat('Чужое сопоставление', fast0.unit, 999);
MB.cur = b;

/* Локальная замена: подменяется сама строка, а не только источник цены. */
const fk = key(fast0);
we.sthReplace = {}; we.sthReplace[fk] = { mat: own.id, mode: 'model' };
b.links = {}; b.links[fk] = other.id;
let R = K.build(st, E.conf(st.set), pl, we, {});
let w = R.rows.find(x => x.offKey === fast0.offKey);
ok(w && w.title === own.name && w.art === own.art && w.name0 === fast0.name0, 'название и артикул из базы, ключ модели сохранён', w && [w.title, w.art, w.name0]);
ok(w && w.price === 123.45 && w.val === fast0.val && w.sum === Math.round(fast0.val * 123.45 * (1 + w.mk / 100)), 'количество модели, цена и сумма базы', w && [w.val, w.price, w.sum]);
ok(w && w.sup.shop === 'Свой поставщик' && w.sup.img === own.photo && w.mb.id === own.id, 'поставщик, фото и материал склада — из замены', w && w.sup);
ok(w && w.price !== other.price, 'прежнее сопоставление не перезаписывает замену');
ok(R.grand !== R0.grand && JSON.stringify(R.sections).includes(own.name), 'новая позиция в итогах, разделах и документах');
ok(w && w.val === fast0.val && w.sthPack && w.sthPack.pack === 10 && !w.sthPack.whole, '«как в модели»: упаковка только пометка, количество не округляется', w && [w.val, w.sthPack]);
const choice = E.unitChoice(R, w); E.setUnit(R, w, 'off', pl, we); const roff = K.build(st, E.conf(st.set), pl, we, {}).rows.find(x => x.offKey === fast0.offKey);
ok(choice.value === 'on' && roff.off && roff.sum === 0 && roff.title === own.name, 'заменённую строку можно исключить из расчёта');
E.setUnit(R, roff, 'on', pl, we);

/* «Как в базе»: округление до 5, затем целая упаковка 10. */
we.sthReplace[fk].mode = 'base';
R = K.build(st, E.conf(st.set), pl, we, {}); w = R.rows.find(x => x.offKey === fast0.offKey);
ok(w && w.val === 10 && w.unit === own.unit && w.price === 123.45, 'количество и единица базы с округлением и упаковкой', w && [w.val, w.unit, w.price]);
ok(w && w.sthPack && w.sthPack.pack === 10 && w.sthReplace.modelVal === fast0.val && w.sthReplace.modelUnit === fast0.unit, 'исходные количество и единица доступны для повторного окна замены', w && w.sthReplace);

/* Общая замена действует без локальной записи; исключение проекта возвращает исходную строку. */
delete we.sthReplace[fk]; b.sthReplace = {}; b.sthReplace[fk] = { mat: own.id, mode: 'model' };
R = K.build(st, E.conf(st.set), pl, we, {});
ok(R.rows.find(x => x.offKey === fast0.offKey).title === own.name, 'общая замена применяется в другом проекте');
we.sthNoReplace = {}; we.sthNoReplace[fk] = 1;
R = K.build(st, E.conf(st.set), pl, we, {});
w = R.rows.find(x => x.offKey === fast0.offKey);
ok(w.title === fast0.title && w.art === fast0.art && !w.sthReplace, 'возврат только в этом проекте восстанавливает строку модели', [w.title, w.art]);
delete we.sthNoReplace[fk];

/* Плита и кромка заменяются тем же способом. */
const ownPanel = mat('Плита СВОЯ', panel0.unit, 2345), ownEdge = mat('Кромка СВОЯ', edge0.unit, 67);
we.sthReplace[key(panel0)] = { mat: ownPanel.id, mode: 'model' };
we.sthReplace[key(edge0)] = { mat: ownEdge.id, mode: 'model' };
R = K.build(st, E.conf(st.set), pl, we, {});
const wp = R.rows.find(x => x.offKey === panel0.offKey), weRow = R.rows.find(x => x.offKey === edge0.offKey);
ok(wp && wp.title === ownPanel.name && wp.price === 2345 && wp.art === ownPanel.art, 'плита заменяется материалом базы', wp && [wp.title, wp.price]);
ok(weRow && weRow.title === ownEdge.name && weRow.price === 67 && weRow.art === ownEdge.art, 'кромка заменяется материалом базы', weRow && [weRow.title, weRow.price]);

/* Пересчёт лист ↔ м² для варианта «как в базе». */
const panelSq = mat('Плита по площади', 'кв.м', 500, { maxL: 2000, maxW: 1000 });
we.sthReplace[key(panel0)] = { mat: panelSq.id, mode: 'base' };
R = K.build(st, E.conf(st.set), pl, we, {}); const wq = R.rows.find(x => x.offKey === panel0.offKey);
const expectedQ = K.unitOf(panel0.unit) === 'лист' ? Math.round(panel0.val * 2 * 10000) / 10000 : panel0.val;
ok(wq && wq.unit === 'кв.м' && Math.abs(wq.val - expectedQ) < 0.0001 && wq.price === 500, 'листы пересчитываются в м² по формату базы', wq && [wq.val, expectedQ, wq.unit]);

/* Без база поведение прежнее, данные замены остаются безопасно сериализуемыми. */
MB.cur = null; R = K.build(st, E.conf(st.set), pl, we, {});
ok(R.rows.find(x => x.offKey === fast0.offKey).title === fast0.title && JSON.parse(JSON.stringify(we)).sthReplace, 'без базы смета прежняя, настройки проекта сохраняются');

console.log('проверок', n, '|', bad ? 'ОШИБОК: ' + bad : 'ошибок нет');
process.exit(bad ? 1 : 0);
