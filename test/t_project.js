// Проект целиком: чтение .bmk, раскладка всех материалов, группы, остатки, комплекты, ручные правки.
require('../web/core/geom.js'); require('../web/core/cut.js'); require('../web/core/project.js');
const fs = require('fs'), P = BM.project;
const file = process.argv[2] || __dirname + '/out/sample.bmk';
let bad = 0;
const load = () => P.build(JSON.parse(fs.readFileSync(file, 'utf8')), BM.defaults());
function report(st, tag) {
	const sm = P.summary(st);
	for (const r of sm.mats) {
		const v = r.on ? P.verify(st, r.mat.key) : [];
		bad += v.length;
		console.log(tag.padEnd(22), P.matTitle(r.mat).slice(0, 40).padEnd(40), '| дет.', String(r.n).padStart(3), '| листов', r.std, '+', r.rem, '| заполн.', r.fill.toFixed(1), '% | не вошло', r.unplaced, '| поворотов листа', r.rot, v.length ? '| НАРУШЕНИЯ: ' + v.slice(0, 3).join('; ') : '');
	}
}
let st = load();
console.log('типов', st.types.length, '| материалов', st.mats.length, '| присадка: в пласть', st.holes.face, 'в торец', st.holes.edge, 'не привязано', st.holes.lost, 'из', st.holes.total, '| ноль по толщине', st.holes.zmode, '| формы', JSON.stringify(st.shapeStat));
for (const t of st.types) if (t.holes && (t.holes.top.length || t.holes.bot.length || t.holes.thr.length || t.holes.edge)) { console.log('  ', t.name.padEnd(22), 'сверху', t.holes.top.length, 'снизу', t.holes.bot.length, 'сквозных', t.holes.thr.length, 'в торец', t.holes.edge, t.flip ? '→ переворачивается' : ''); }
for (const m of st.mats) P.nest(st, m.key, { quality: 0 });
report(st, 'ФР');
// группы: фасады 1–3 вместе
st = load();
const fac = st.types.filter(t => /Фасад распашной [123]$/.test(t.name));
fac.forEach(t => { P.tw(st, t.sig, true).grp = 1; });
st.types.filter(t => t.name === 'Фасад ящика').forEach(t => { P.tw(st, t.sig, true).grp = 2; });
st.work.sets = 2;
{
	for (const m of st.mats) { P.nest(st, m.key, { quality: 0 }); }
	report(st, 'группы, 2 компл.');
	const dub = st.mats.find(m => /Дуб/.test(m.name)), lay = st.work.layout[dub.key];
	const blocks = {};
	lay.sheets.forEach((sh, si) => sh.recs.forEach(rc => { if (rc.u) (blocks[rc.u] = blocks[rc.u] || []).push(si + ':' + Math.round(rc.x) + ',' + Math.round(rc.y) + ' ' + Math.round(rc.a) + 'x' + Math.round(rc.b)); }));
	console.log('   блоки:', JSON.stringify(blocks));
	for (const k in blocks) if (new Set(blocks[k].map(s => s.split(':')[0])).size !== 1) { bad++; console.log('   ОШИБКА: блок на разных листах'); }
}
// остатки и устаревание
st = load();
const ld = st.mats.find(m => /ЛДСП_16/.test(m.name));
P.nest(st, ld.key, { quality: 0 });
console.log('устарела после раскладки:', P.isStale(st, ld), '| после смены числа комплектов:', (st.work.sets = 2, P.isStale(st, ld)));
st.work.sets = 1;
ld.cfg.rem = [{ L: 1500, W: 900, n: 2 }];
P.nest(st, ld.key, { quality: 0 });
report(st, 'остатки 1500x900 x2');
// ручные правки: перенос на другой лист, на новый лист, закрепление и пересчёт
{
	st = load();
	const m = st.mats.find(x => /ЛДСП_16/.test(x.name));
	P.nest(st, m.key, { quality: 0 });
	const lay = st.work.layout[m.key], n0 = lay.sheets.length, last = lay.sheets.length - 1;
	let moved = 0, refused = 0;
	for (let i = 0; i < 6; i++) {
		const src = lay.sheets[0]; if (!src) break;
		const small = src.recs.map((r, j) => [r.a * r.b, j]).sort((a, b) => a[0] - b[0])[0][1];
		const why = P.moveToSheet(st, m.key, 0, small, lay.sheets.length - 1);
		if (why) refused++; else moved++;
	}
	const why2 = P.moveToSheet(st, m.key, 0, 0, -1);
	const v = P.verify(st, m.key); bad += v.length;
	console.log('перенос: перенесено', moved, 'отказано', refused, '| на новый лист:', why2 || 'ок', '| листов было', n0, 'стало', lay.sheets.length, '| закреплено', lay.sheets.filter(s => s.lock).length, v.length ? '| НАРУШЕНИЯ ' + v.slice(0, 3).join('; ') : '');
	const info = {};
	const w3 = P.repackSheet(st, m.key, 0, 1, info);
	const v3 = P.verify(st, m.key); bad += v3.length;
	console.log('   другой вариант листа 1:', w3 || 'ок', '(вариантов ' + info.count + ')', v3.length ? 'НАРУШЕНИЯ ' + v3.slice(0, 2).join('; ') : '');
	// пересчёт с закреплёнными листами
	const locked = lay.sheets.filter(s => s.lock).map(s => JSON.stringify(s.recs));
	st.work.sets = 2;
	const lay2 = P.nest(st, m.key, { quality: 0 });
	const still = lay2.sheets.filter(s => s.lock).map(s => JSON.stringify(s.recs));
	const v4 = P.verify(st, m.key); bad += v4.length;
	console.log('   пересчёт на 2 комплекта: закреплённые листы целы:', JSON.stringify(locked) === JSON.stringify(still), '| листов', lay2.sheets.length, '| не вошло', lay2.unplaced.length, v4.length ? 'НАРУШЕНИЯ ' + v4.slice(0, 2).join('; ') : '');
	if (JSON.stringify(locked) !== JSON.stringify(still)) bad++;
}
// изменение модели
const a = JSON.parse(fs.readFileSync(file, 'utf8')).model, b = JSON.parse(JSON.stringify(a));
b.parts = b.parts.filter(p => p.name !== 'Косынка'); b.parts.push(Object.assign({}, b.parts[0], { id: 9999, name: 'Новая полка', des: '99_01' })); b.parts.push(Object.assign({}, b.parts[2], { id: 9998 }));
const df = P.diff(a, b, 'all');
console.log('изменения модели: добавлено', df.added.map(x => x.name + ' x' + x.now), '| убрано', df.removed.map(x => x.name), '| количество', df.changed.map(x => x.name + ' ' + x.was + '→' + x.now));
console.log(bad ? 'ИТОГО НАРУШЕНИЙ: ' + bad : 'нарушений нет');
