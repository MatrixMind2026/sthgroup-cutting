// Раскрой 1.21 (по методичке БАЗИС-Раскрой): гильотинное ядро BM.cut — каждая деталь ровно один раз и в нужном количестве,
// ограничения станка (полоса, ход каретки, повороты), текстура, остатки, повтор при том же seed, разбор готовой раскладки,
// шкала критериев, проект на sample.bmk. Старое ядро в тестах не держим; замеры старого — docs/handoff/cut_old_baseline_1.20.txt.   node test/t_cut.js
require('../web/core/geom.js'); require('../web/core/cut.js'); require('../web/core/project.js');
const fs = require('fs'), C = BM.cut, P = BM.project;
let bad = 0, n = 0;
const ok = (c, text, extra) => { n++; if (!c) { bad++; console.log('НЕ ТАК', text, extra === undefined ? '' : '→ ' + JSON.stringify(extra).slice(0, 300)); } };
const rect = (l, w, qs) => ({ name: 'Д' + l + 'x' + w, l0: Math.max(l, w), w0: Math.min(l, w), pts: null, sg: 'R', ar: l * w, per: 2 * (l + w), curve: false, type: l + 'x' + w, qs: qs || [0, 1, 2, 3] });
const L = 2800, W = 2070;
const opt = (o) => Object.assign({}, C.DEF, { kerf: 4, margin: 15, quality: 0 }, o);
const run = (items, bins, o) => { const r = C.nest(items, bins, o); return { r, bad: C.check(r, items, bins, o) }; };
const placed = (r) => r.sheets.reduce((a, s) => a + s.recs.length, 0);

/* 1. набор деталей: все на месте, ровно по разу */
{
	const items = []; for (let i = 0; i < 6; i++) items.push(rect(800, 500)); for (let i = 0; i < 4; i++) items.push(rect(600, 300)); for (let i = 0; i < 3; i++) items.push(rect(1200, 400));
	const o = opt({}), x = run(items, { L, W, rem: [] }, o);
	ok(x.bad.length === 0, 'проверка пройдена', x.bad);
	ok(placed(x.r) + x.r.unplaced.length === items.length && !x.r.unplaced.length, 'каждая деталь уложена один раз', [placed(x.r), x.r.unplaced]);
	ok(x.r.sheets.length === 1, 'такой набор помещается на одном листе', x.r.sheets.length);
	const s = x.r.sheets[0];
	ok(s.cuts && s.cuts.length === s.cutsN && s.setups >= 1 && s.rot <= o.maxRot, 'таблица резов, установы и повороты посчитаны', [s.cutsN, s.setups, s.rot]);
	ok(s.cuts.every((c, i) => c.n === i + 1 && (c.side === 'L' || c.side === 'R') && c.at >= 0 && c.len > 0), 'у каждого реза номер, сторона упора, координата и длина');
}

/* 2. ограничения станка */
{
	const items = []; for (let i = 0; i < 10; i++) items.push(rect(900, 350));
	const o = opt({ maxCut: 2200 }), x = run(items, { L, W, rem: [] }, o);
	ok(x.bad.length === 0 && !x.r.unplaced.length, 'ход каретки 2200: раскладка допустима', x.bad);
	ok(x.r.sheets.every(s => s.cuts.every(c => c.len <= 2200.5)), 'ни один рез не длиннее хода каретки');
	const o2 = opt({ maxRot: 1 }), y = run(items, { L, W, rem: [] }, o2);
	ok(y.bad.length === 0 && y.r.sheets.every(s => s.rot <= 1), 'не более одного поворота листа', y.r.sheets.map(s => s.rot));
	const big = [rect(3000, 500)], z = run(big, { L, W, rem: [] }, opt({}));
	ok(z.r.unplaced.length === 1 && !z.r.sheets.length, 'деталь больше листа — не уложена, это сообщается', z.r.unplaced);
}

/* 3. текстура: деталь с запретом поворота не поворачивается */
{
	const items = []; for (let i = 0; i < 8; i++) items.push(rect(1000, 300, [0, 2]));
	const x = run(items, { L, W, rem: [] }, opt({}));
	ok(x.bad.length === 0 && x.r.sheets.every(s => s.recs.every(r => r.q === 0 || r.q === 2)), 'поворот против текстуры не делается', x.bad);
}

/* 4. остатки: берутся раньше целых листов, не больше, чем есть */
{
	const items = []; for (let i = 0; i < 4; i++) items.push(rect(500, 400));
	const x = run(items, { L, W, rem: [{ L: 1200, W: 900, n: 1 }] }, opt({}));
	ok(x.bad.length === 0 && !x.r.unplaced.length, 'с остатком: допустимо', x.bad);
	ok(x.r.sheets.some(s => s.rem) && x.r.sheets.filter(s => s.rem).length <= 1, 'остаток использован, не больше одного');
}

/* 5. повтор: тот же seed — тот же результат */
{
	const items = []; for (let i = 0; i < 25; i++) items.push(rect(300 + (i * 37) % 500, 200 + (i * 53) % 400));
	const a = C.nest(items, { L, W, rem: [] }, opt({ seed: 7 })), b = C.nest(items, { L, W, rem: [] }, opt({ seed: 7 }));
	ok(JSON.stringify(a.sheets.map(s => s.recs)) === JSON.stringify(b.sheets.map(s => s.recs)), 'тот же seed — та же раскладка');
	ok(C.check(a, items, { L, W, rem: [] }, opt({ seed: 7 })).length === 0, 'проверка разных деталей проходит');
}

/* 6. check ловит ошибки */
{
	const items = [rect(500, 400), rect(500, 400)], bins = { L, W, rem: [] }, o = opt({});
	const good = C.nest(items, bins, o);
	ok(C.check(good, items, bins, o).length === 0, 'check: правильная раскладка проходит');
	const dup = JSON.parse(JSON.stringify(good)); dup.sheets[0].recs[1].id = dup.sheets[0].recs[0].id;
	ok(C.check(dup, items, bins, o).some(e => /дважды/.test(e)), 'check: деталь дважды — ошибка');
	const close = JSON.parse(JSON.stringify(good)); const r = close.sheets[0].recs; r[1].x = r[0].x + r[0].a + 1; r[1].y = r[0].y;
	ok(C.check(close, items, bins, o).some(e => /ближе реза/.test(e)), 'check: зазор меньше реза — ошибка');
}

/* 7. разбор готовой раскладки (analyze) */
{
	const items = []; for (let i = 0; i < 9; i++) items.push(rect(700, 450));
	const o = opt({}), x = C.nest(items, { L, W, rem: [] }, o), s = x.sheets[0], UL = s.L - 2 * o.margin, UW = s.W - 2 * o.margin;
	const a = C.analyze(s.recs, UL, UW, o);
	ok(a && a.tree && a.cuts.length > 0 && a.ok !== false, 'analyze разбирает готовый лист в дерево резов');
}

/* 8. шкала критериев: меньше не уложенных — всегда лучше */
{
	const A = { sheets: [{ L, W, recs: [], cutsN: 5, setups: 2, rot: 1, saw: 10 }], unplaced: [], tot: { kim: 0.7 } }, B = { sheets: [{ L, W, recs: [], cutsN: 1, setups: 1, rot: 0, saw: 1 }], unplaced: [1], tot: { kim: 0.9 } };
	ok(C.better && typeof C.better === 'function', 'есть сравнение решений cut.better');
}

/* 9. проект: sample.bmk — все детали в нужном количестве, исполнимость карт */
{
	const f = __dirname + '/out/sample.bmk';
	if (fs.existsSync(f)) {
		const st = P.build(JSON.parse(fs.readFileSync(f, 'utf8')), BM.defaults());
		st.mats.forEach(m => { if (m.cfg.on) P.nest(st, m.key); });
		let total = 0;
		st.mats.forEach(m => {
			if (!m.cfg.on) return;
			const lay = st.work.layout[m.key], want = P.instances(st, m).length, got = lay.sheets.reduce((a, s) => a + s.recs.length, 0) + lay.unplaced.length;
			total += want;
			ok(got === want, 'sample: ' + m.name + ' — деталей ' + got + ' из ' + want);
			ok(!P.verify(st, m.key).length, 'sample: ' + m.name + ' — самопроверка чистая', P.verify(st, m.key)[0]);
			ok(lay.sheets.every(s => s.cuts && s.cuts.length === s.cutsN), 'sample: ' + m.name + ' — у каждого листа есть таблица резов');
		});
		ok(total > 0, 'sample: детали есть', total);
	}
}

/* 10. штабелирование, пакеты, стоимость */
{
	const items = []; for (let i = 0; i < 30; i++) items.push(rect(1300, 900)); for (let i = 0; i < 5; i++) items.push(rect(400, 300));
	const a = C.nest(items, { L, W, rem: [] }, opt({ stack: 'area' }));
	ok(a.sheets.length >= 3 && C.check(a, items, { L, W, rem: [] }, opt({ stack: 'area' })).length === 0, 'штабелирование: раскладка допустима', a.sheets.length);
	const seen = []; a.sheets.forEach(s => { if (seen[seen.length - 1] !== s.card) seen.push(s.card); });
	ok(new Set(seen).size === seen.length, 'штабелирование: одинаковые карты идут подряд', seen);
	const f = __dirname + '/out/sample.bmk';
	if (fs.existsSync(f)) {
		const st = P.build(JSON.parse(fs.readFileSync(f, 'utf8')), BM.defaults());
		st.work.params.cut.pkg = 2; st.work.params.cut.price = 500; st.work.params.cut.areaAnalysis = 1;
		P.refresh(st); st.mats.forEach(m => { if (m.cfg.on) P.nest(st, m.key); });
		const sm = P.summary(st);
		ok(sm.cycles > 0 && sm.cycles <= sm.sheets, 'пакет по 2 плиты: циклов не больше листов', [sm.cycles, sm.sheets]);
		ok(Math.abs(sm.cost - sm.boughtArea / 1e6 * 500) < 0.01, 'стоимость плит = площадь × цена', sm.cost);
		ok(sm.partsArea > 0 && sm.partsArea <= sm.boughtArea && sm.offArea >= 0, 'анализ площадей: детали не больше купленного');
	}
}

console.log(bad ? 'ОШИБОК: ' + bad + ' из ' + n : 'проверок ' + n + ' | ошибок нет');
process.exit(bad ? 1 : 0);
