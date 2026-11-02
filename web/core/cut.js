/* STHGroup — раскрой (гильотинный), по методике БАЗИС-Раскрой.
   Лист режется только сквозными резами. Раскладка — дерево резов: уровень 1 — полосы, уровень 2 — куски полосы
   (плита после поворота на 90°), уровень 3 — стопки внутри куска и т. д. Число уровней ограничено числом поворотов.

   Вход:  items[]  { l0, w0, qs, curve, ... }   — детали (qs — разрешённые повороты, как раньше)
          bins     { L, W, rem:[{L,W,n}] }      — формат листа и остатки
          opt      настройки (cut.DEF)
   Выход: { sheets:[{ L,W,rem,ri,rot,saw,recs,tree,cuts,card,setups,cutsN }], unplaced, rounds, saw, cards }
          recs[j] = { id,x,y,a,b,q,ba } — как у прежнего ядра: x,y от угла полезной зоны, a×b — занятый прямоугольник.
   Дерево tree: { t:'s'|'i'|'w', x,y,w,h, dir:'h'|'v', kids:[], r:номер записи } (в координатах полезной зоны). */
(function (G) {
	'use strict';
	var BM = G.BM = G.BM || {};
	var cut = BM.cut = {};
	var EPS = 0.01, SAME = 0.05;

	/* Критерии оптимизации (порядок по умолчанию — как в методичке). */
	cut.CRIT = ['kim', 'setups', 'rot', 'cuts', 'len', 'cards', 'offcut'];
	cut.DEF = {
		kerf: 3.2,            // ширина реза, мм
		margin: 10,           // отступ от края плиты, мм
		minStrip: 10,         // минимальный размер полосы, мм (0 — не проверять)
		maxStrip: 2500,       // максимальный размер полосы (ход левого упора), мм (0 — без предела)
		maxCut: 3200,         // максимальная длина реза (ход каретки), мм (0 — без предела)
		oneBig: 1700,         // на полосе не больше одной панели длиннее, мм (0 — не проверять)
		minLeft: 120,         // меньше этого размера база — правый упор, мм
		ratio: 3,             // длина/ширина полосы больше — база правый упор (0 — не проверять)
		edgeL: 95,            // расстояние от диска до левой линейки, мм (в таблицу резов)
		maxRot: 3,            // поворотов плиты не больше
		first: 'any',         // первые резы: 'along' — вдоль плиты, 'across' — поперёк, 'any' — любые
		corner: 'ur',         // начало укладки: 'ul','ur','dl','dr'
		sort: 0,              // способ сортировки полос (0…5)
		narrowIn: false,      // узкие полосы первого уровня — внутри плиты
		crit: cut.CRIT.slice(),
		critOff: {},          // { ключ: true } — критерий выключен
		pkg: 1,               // плит в пакете
		pkgMode: 'mix',       // 'mix' — пакеты и плиты, 'only' — только пакеты
		minWaste: 6,          // обрезок уже этого не оставляем (мелочь меньше зазора каретки), мм
		offL: 400, offW: 80,  // деловой обрезок не меньше, мм
		offGrain: true,       // у деловых обрезков учитывать текстуру
		minKimRem: 80,        // КИМ при раскрое обрезков не ниже, %
		draft: 0, draftAllow: 0, // черновой раскрой: припуск на сторону всем деталям
		allow: 0,             // припуск на сторону криволинейным
		round: 0,             // размеры деталей округляются вверх до кратного, мм (0 — не округлять)
		texUnknown: 'l',      // направление текстуры, если модель его не сообщила: 'l' вдоль длины, 'w' поперёк, 'n' нет
		stack: 'off',         // штабелирование: 'off', 'area', 'count', 'name'
		showCuts: 1, showCutNo: 1, hatch: 1, showStat: 1,      // карта: линии резов, номера резов, штриховка обрезков, статистика
		posPrefix: '',        // префикс номеров позиций, например «ШУ/»
		wb: { prod: 1, blank: 1, off: 1 },                     // накладные: в производство, на заготовки, на обрезки
		areaAnalysis: 0,      // «анализ площадей»: в сводке — сколько ушло в детали, обрезки и отходы
		price: 0,             // цена плиты за м² для расчёта стоимости (0 — не считать)
		useStock: 0,          // кроить на текущих обрезках и складе заготовок
		quality: 1, seed: 0
	};
	function merge(opt) { var o = {}, k; for (k in cut.DEF) o[k] = cut.DEF[k]; if (opt) for (k in opt) if (opt[k] !== undefined && k !== 'progress') o[k] = opt[k]; o.progress = opt && opt.progress; return o; }
	function rnd2(v) { return Math.round(v * 100) / 100; }
	function rand(seed) { var s = (seed >>> 0) || 1; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
	function up(v, m) { return m > 0 ? Math.ceil(v / m - 1e-9) * m : v; }

	/* ------------------------------ виды деталей ------------------------------- */
	/* Одинаковые по размеру, поворотам и припуску детали — один «вид», в нём список номеров. */
	function prepKinds(items, o) {
		var kinds = [], by = {}, i;
		for (i = 0; i < items.length; i++) {
			var it = items[i], ba = o.draft ? Math.max(0, o.draftAllow) : ((o.allow > 0 && it.curve) ? o.allow : 0);
			if (o.draft && o.allow > 0 && it.curve) ba = Math.max(ba, o.allow);
			var l = up(it.l0 + 2 * ba, o.round), w = up(it.w0 + 2 * ba, o.round);
			var qs = (it.qs && it.qs.length) ? it.qs : [0, 2], par = [], k;
			for (k = 0; k < qs.length; k++) { var p = qs[k] & 1; if (par.indexOf(p) < 0) par.push(p); }
			if (Math.abs(l - w) < EPS && par.length > 1) par = [par[0]];
			var key = rnd2(l) + '|' + rnd2(w) + '|' + par.join('') + '|' + qs.join('') + '|' + ba;
			var kd = by[key];
			if (!kd) { kd = by[key] = { l: l, w: w, ba: ba, par: par, qs: qs, ids: [], area: l * w, idx: kinds.length }; kinds.push(kd); }
			kd.ids.push(i);
		}
		return kinds;
	}
	function qOf(kd, p) { for (var k = 0; k < kd.qs.length; k++) if ((kd.qs[k] & 1) === p) return kd.qs[k]; return p ? 1 : 0; }

	/* Варианты укладки вида при направлении резов H (полосы вдоль X): a — вдоль полосы, b — поперёк. */
	function setOpts(kinds, H) {
		for (var i = 0; i < kinds.length; i++) {
			var kd = kinds[i], opts = [];
			for (var j = 0; j < kd.par.length; j++) {
				var p = kd.par[j], sx = p ? kd.w : kd.l, sy = p ? kd.l : kd.w;
				opts.push({ a: H ? sx : sy, b: H ? sy : sx, q: qOf(kd, p), sx: sx, sy: sy });
			}
			kd.opts = opts;
		}
	}

	/* ------------------------- поиск раскладки одного листа --------------------- */
	/* Всё считается в «рабочих» осях: A — вдоль полосы, B — поперёк (полосы лежат друг на друге по B).
	   Узел: { n:'i', A,B, k,o } — деталь; { n:'w', A,B } — обрезок; { n:'x', ax:'B'|'A', A,B, kids:[] } — рез. */
	function S_new(kinds, o, P, rng, ops) {
		var cnt = []; for (var i = 0; i < kinds.length; i++) cnt.push(kinds[i].ids.length);
		return { kinds: kinds, cnt: cnt, o: o, P: P, rng: rng, kerf: o.kerf, minWaste: o.minWaste, maxLvl: Math.min(6, o.maxRot + 1),
				 minStrip: o.minStrip, maxStrip: o.maxStrip, maxCut: o.maxCut, oneBig: o.oneBig, ops: ops || { n: 0, cap: 1e9 } };
	}
	function takeK(S, k) { S.cnt[k]--; }
	function putK(S, k) { S.cnt[k]++; }
	function undo(S, takes) { for (var i = takes.length - 1; i >= 0; i--) putK(S, takes[i]); }
	function redo(S, takes) { for (var i = 0; i < takes.length; i++) takeK(S, takes[i]); }
	function okLeft(S, l) { return l <= EPS || l >= S.kerf + S.minWaste - EPS; }
	function sizeOk(S, s) { return (!(S.minStrip > 0) || s >= S.minStrip - EPS) && (!(S.maxStrip > 0) || s <= S.maxStrip + EPS); }

	/* Строка (полоса) длиной A и толщиной t: колонки подряд вдоль A. Каждая колонка — деталь точно по толщине
	   либо внутренний кусок (c × t), который режется дальше на полосы следующих уровней. */
	function fillStrip(S, A, t, lvl) {
		var kerf = S.kerf, kinds = S.kinds, cols = [], takes = [], area = 0, end = 0, big = 0;
		for (;;) {
			var off = cols.length ? end + kerf : 0, avail = A - off, best = null, ki, oi;
			if (avail < EPS) break;
			var canCol = lvl + 1 <= S.maxLvl;
			var nestSeeds = [];
			for (ki = 0; ki < kinds.length; ki++) {
				if (S.cnt[ki] <= 0) continue;
				var kd = kinds[ki];
				for (oi = 0; oi < kd.opts.length; oi++) {
					var op = kd.opts[oi];
					if (op.b > t + EPS || op.a > avail + EPS) continue;
					if (!okLeft(S, avail - op.a)) continue;
					if (!sizeOk(S, op.a) && Math.abs(avail - op.a) > EPS) continue;
					if (S.oneBig > 0 && op.a > S.oneBig + EPS && big >= 1) continue;
					if (Math.abs(op.b - t) <= SAME) {
						if (!canCol && cols.length === 0 && Math.abs(op.a - A) > EPS && !okLeft(S, A - op.a)) continue;
						if (!canCol && !(cols.length === 0 && Math.abs(op.a - A) <= EPS)) continue;
						var sc = [1, op.a * t, 0];
						if (!best || sc[0] > best.sc[0] || (sc[0] === best.sc[0] && sc[1] > best.sc[1])) best = { sc: sc, kind: 'i', k: ki, op: op, c: op.a, area: op.a * op.b };
					} else if (lvl + 2 <= S.maxLvl && canCol) {
						nestSeeds.push({ c: op.a, k: ki, area: op.a * op.b });
					}
				}
			}
			if (nestSeeds.length) {
				nestSeeds.sort(function (x, y) { return y.area - x.area; });
				var seen = {}, tried = 0, lim = S.P.k3;
				for (var s = 0; s < nestSeeds.length && tried < lim; s++) {
					var c = nestSeeds[s].c, key = Math.round(c * 20);
					if (seen[key]) continue; seen[key] = 1; tried++;
					if (S.ops.n > S.ops.cap) break;
					var inner = fillRect(S, c, t, lvl + 2);
					if (!inner || inner.area <= 0) { if (inner) undo(S, inner.takes); continue; }
					undo(S, inner.takes);
					var dens = inner.area / (c * t);
					if (dens < S.P.minDens) continue;
					var noise = S.P.noise ? (1 + S.P.noise * (S.rng() - 0.5)) : 1;
					var sc2 = [Math.round(dens * noise * 1000) / 1000 < 1 ? Math.round(dens * noise * 1000) / 1000 : 0.999, inner.area, 0];
					if (!best || sc2[0] > best.sc[0] || (sc2[0] === best.sc[0] && sc2[1] > best.sc[1])) best = { sc: sc2, kind: 'n', c: c, inner: inner, area: inner.area };
				}
			}
			if (!best) break;
			var node;
			if (best.kind === 'i') { takeK(S, best.k); takes.push(best.k); node = { n: 'i', A: best.c, B: t, k: best.k, o: best.op }; if (S.oneBig > 0 && best.c > S.oneBig + EPS) big++; }
			else { redo(S, best.inner.takes); for (var q = 0; q < best.inner.takes.length; q++) takes.push(best.inner.takes[q]); node = best.inner.node; if (S.oneBig > 0 && best.c > S.oneBig + EPS) big++; }
			cols.push(node); area += best.area; end = off + best.c;
		}
		if (!cols.length) return { node: null, area: 0, takes: takes };
		var rest = A - end;
		var kids = cols.slice();
		if (rest > EPS) kids.push({ n: 'w', A: rest - kerf, B: t });
		if (kids.length === 1) return { node: kids[0], area: area, takes: takes };
		return { node: { n: 'x', ax: 'A', A: A, B: t, kids: kids }, area: area, takes: takes };
	}

	/* Прямоугольник A × B (A — вдоль полос): полосы одна за другой по B. */
	function fillRect(S, A, B, lvl) {
		S.ops.n++;
		var kerf = S.kerf, kinds = S.kinds, kids = [], takes = [], area = 0, end = 0;
		if (lvl > S.maxLvl) return null;
		if (S.maxCut > 0 && A > S.maxCut + EPS) return null;
		for (;;) {
			var off = kids.length ? end + kerf : 0, avail = B - off;
			if (avail < EPS) break;
			var ts = [], seen = {}, ki, oi;
			for (ki = 0; ki < kinds.length; ki++) {
				if (S.cnt[ki] <= 0) continue;
				for (oi = 0; oi < kinds[ki].opts.length; oi++) {
					var op = kinds[ki].opts[oi];
					if (op.b > avail + EPS || op.a > A + EPS) continue;
					if (!okLeft(S, avail - op.b) || !sizeOk(S, op.b)) continue;
					var key = Math.round(op.b * 20);
					if (seen[key]) { if (seen[key].tot < kinds[ki].area * S.cnt[ki]) seen[key].tot = kinds[ki].area * S.cnt[ki]; continue; }
					seen[key] = { t: op.b, tot: kinds[ki].area * S.cnt[ki] }; ts.push(seen[key]);
				}
			}
			if (!ts.length) break;
			ts.sort(function (x, y) { return y.tot - x.tot; });
			var K = lvl <= 1 ? S.P.k1 : S.P.k2, best = null, ti;
			for (ti = 0; ti < ts.length && ti < K; ti++) {
				if (S.ops.n > S.ops.cap && best) break;
				var st = fillStrip(S, A, ts[ti].t, lvl);
				if (!st.node) { undo(S, st.takes); continue; }
				undo(S, st.takes);
				var dens = st.area / (A * ts[ti].t), noise = S.P.noise ? (1 + S.P.noise * (S.rng() - 0.5)) : 1;
				var sc = Math.round(dens * noise * 1000) / 1000, val = sc * (S.P.areaW ? 1 : 1);
				if (!best || val > best.val + 1e-9 || (Math.abs(val - best.val) <= 1e-9 && (st.area > best.st.area))) best = { val: val, st: st, t: ts[ti].t };
			}
			if (!best) break;
			redo(S, best.st.takes); for (var q = 0; q < best.st.takes.length; q++) takes.push(best.st.takes[q]);
			kids.push(best.st.node); area += best.st.area; end = off + best.t;
		}
		if (!kids.length) return { node: null, area: 0, takes: takes };
		var rest = B - end;
		if (rest > EPS) kids.push({ n: 'w', A: A, B: rest - kerf });
		if (kids.length === 1) return { node: kids[0], area: area, takes: takes };
		return { node: { n: 'x', ax: 'B', A: A, B: B, kids: kids }, area: area, takes: takes };
	}

	/* Абстрактный узел → узел листа (оси x,y), H — полосы вдоль X. */
	function toTree(nd, H, kinds, items) {
		if (nd.n === 'w') return { t: 'w', w: H ? nd.A : nd.B, h: H ? nd.B : nd.A };
		if (nd.n === 'i') return { t: 'i', w: nd.o.sx, h: nd.o.sy, k: nd.k, q: nd.o.q, a: nd.o.sx, b: nd.o.sy };
		var dir = nd.ax === 'B' ? (H ? 'h' : 'v') : (H ? 'v' : 'h');
		var node = { t: 's', dir: dir, w: H ? nd.A : nd.B, h: H ? nd.B : nd.A, kids: [] };
		for (var i = 0; i < nd.kids.length; i++) node.kids.push(toTree(nd.kids[i], H, kinds, items));
		return node;
	}

	/* ------------------------------ дерево резов -------------------------------- */
	function areaOf(n) { if (n.t === 'i') return n.w * n.h; if (n.t === 'w') return 0; var s = 0; for (var i = 0; i < n.kids.length; i++) s += areaOf(n.kids[i]); return s; }
	function sizeOf(n, dir) { return dir === 'h' ? n.h : n.w; }
	function depthOf(n) { if (n.t !== 's') return 0; var m = 0; for (var i = 0; i < n.kids.length; i++) m = Math.max(m, depthOf(n.kids[i])); return m + 1; }

	/* Порядок вложенных полос внутри реза: способ сортировки из методики (0…5). */
	function orderKids(n, o, lvl) {
		var real = [], waste = [], i;
		for (i = 0; i < n.kids.length; i++) (n.kids[i].t === 'w' ? waste : real).push(n.kids[i]);
		var sz = function (k) { return sizeOf(k, n.dir); }, dens = function (k) { return areaOf(k) / (k.w * k.h); };
		var mode = o.sort, byNarrow = false;
		if (lvl === 1 && o.narrowIn) byNarrow = true;
		if (mode === 3 && !byNarrow) byNarrow = true;
		var desc = function (x, y) { return sz(y) - sz(x); };
		if (byNarrow) {
			var s = real.slice().sort(desc), L = [], R = [];
			s.forEach(function (k, j) { (j % 2 === 0 ? L : R).push(k); });
			real = L.concat(R.reverse());
			if (lvl > 1 || !o.narrowIn) { /* способ 3 действует на все уровни */ }
			if (lvl === 1 && o.narrowIn && mode !== 3) { /* внутри полос — по выбранному способу, ниже */ }
		} else if (mode === 0) {
			real.sort(function (x, y) { var d = dens(y) - dens(x); return Math.abs(d) > 1e-9 ? d : sz(y) - sz(x); });
		} else if (mode === 1) real.sort(desc);
		else if (mode === 2) real.sort(function (x, y) { return sz(x) - sz(y); });
		else if (mode === 4) {
			real.sort(desc);
			if (real.length > 1) { var w0 = real.shift(); real.push(w0); }
		} else if (mode === 5) {
			var leaf = real.filter(function (k) { return k.t === 'i'; }).sort(desc);
			var sub = real.filter(function (k) { return k.t !== 'i'; }).sort(function (x, y) { var d = dens(y) - dens(x); return Math.abs(d) > 1e-9 ? d : sz(y) - sz(x); });
			if (sub.length > 1) { var mi = 0; sub.forEach(function (k, j) { if (sz(k) > sz(sub[mi])) mi = j; }); var wide = sub.splice(mi, 1)[0]; sub.push(wide); }
			real = leaf.concat(sub);
		}
		n.kids = real.concat(waste);
		for (i = 0; i < n.kids.length; i++) if (n.kids[i].t === 's') orderKids(n.kids[i], o, lvl + 1);
	}

	/* Координаты узлов и записи деталей. kerf — между соседями. */
	function place(n, x, y, kerf, recs) {
		n.x = x; n.y = y;
		if (n.t === 'i') { n.r = recs.length; recs.push(n); return; }
		if (n.t !== 's') return;
		var cx = x, cy = y;
		for (var i = 0; i < n.kids.length; i++) {
			var k = n.kids[i];
			if (n.dir === 'h') { k.w = n.w; if (k.t === 'w' && i === n.kids.length - 1) k.h = Math.max(0, y + n.h - cy); place(k, x, cy, kerf, recs); cy += k.h + kerf; }
			else { k.h = n.h; if (k.t === 'w' && i === n.kids.length - 1) k.w = Math.max(0, x + n.w - cx); place(k, cx, y, kerf, recs); cx += k.w + kerf; }
		}
	}

	/* Зеркало по углу начала укладки. */
	function mirror(n, UL, UW, mx, my) {
		if (mx) n.x = UL - n.x - n.w;
		if (my) n.y = UW - n.y - n.h;
		if (n.kids) for (var i = 0; i < n.kids.length; i++) mirror(n.kids[i], UL, UW, mx, my);
	}

	/* Таблица резов: порядок работы на станке, упоры. Резы одного узла идут подряд, затем — вложенные. */
	function cutsOf(tree, o, mx, my) {
		var out = [], kerf = o.kerf;
		(function walk(n, lvl) {
			if (n.t !== 's') return;
			var ord = n.kids.slice(), i;
			var mir = (n.dir === 'v' && mx) || (n.dir === 'h' && my);
			for (i = 0; i < ord.length - 1; i++) {
				var k = ord[i], s = sizeOf(k, n.dir), len = n.dir === 'h' ? n.w : n.h;
				var thin = s < o.minLeft - EPS || (o.ratio > 0 && len / Math.max(s, 1) > o.ratio + EPS);
				var at = n.dir === 'h' ? (mir ? k.y - kerf : k.y + k.h) : (mir ? k.x - kerf : k.x + k.w);
				out.push({ lvl: lvl, dir: n.dir, size: rnd2(s), len: rnd2(len), side: thin ? 'R' : 'L', part: k.t === 'i' ? k.r : -1, at: rnd2(at), from: rnd2(n.dir === 'h' ? n.x : n.y) });
			}
			for (i = 0; i < ord.length; i++) walk(ord[i], lvl + 1);
		})(tree, 1);
		/* установы: подряд идущие резы одного размера и базы — один установ */
		var setups = 0, lp = null;
		for (var j = 0; j < out.length; j++) {
			var c = out[j];
			if (!lp || lp.side !== c.side || Math.abs(lp.size - c.size) > SAME) setups++;
			c.setup = setups; c.n = j + 1; lp = c;
		}
		return { cuts: out, setups: setups };
	}
	function describe(tree, o, mx, my) {
		var ct = cutsOf(tree, o, mx, my), len = 0, i;
		for (i = 0; i < ct.cuts.length; i++) len += ct.cuts[i].len;
		var d = depthOf(tree);
		return { cuts: ct.cuts, setups: ct.setups, cutsN: ct.cuts.length, len: len, depth: d, rot: Math.max(0, d - 1) };
	}

	/* ------------------------------- обрезки ------------------------------------ */
	function wasteRects(tree) {
		var out = [];
		(function w(n) { if (n.t === 'w') { if (n.w > 0 && n.h > 0) out.push({ x: n.x, y: n.y, w: n.w, h: n.h }); } else if (n.kids) n.kids.forEach(w); })(tree);
		return out;
	}
	/* Оценка обрезков листа: чем крупнее деловые куски, тем больше (сумма квадратов площадей, тыс. м⁴ условно). */
	function offcutScore(tree, o) {
		var off = 0;
		wasteRects(tree).forEach(function (w) { if (isBusiness(w, o)) off += (w.w * w.h) * (w.w * w.h) / 1e6; });
		return off;
	}
	cut.offcutScore = function (tree, opt) { return offcutScore(tree, merge(opt)); };
	cut.wasteRects = wasteRects;
	function isBusiness(r, o) {
		var a = r.w, b = r.h;
		if (o.offGrain) return a >= o.offL - EPS && b >= o.offW - EPS;
		return Math.max(a, b) >= o.offL - EPS && Math.min(a, b) >= o.offW - EPS;
	}

	/* ------------------------- один лист: лучшая раскладка ---------------------- */
	function sheetScore(r) { return r.area; }
	function buildSheet(S, UL, UW, dirs) {
		var best = null, kinds = S.kinds;
		for (var di = 0; di < dirs.length; di++) {
			var H = dirs[di] === 'h';
			setOpts(kinds, H);
			var A = H ? UL : UW, B = H ? UW : UL;
			var r = fillRect(S, A, B, 1);
			if (!r || !r.node || r.area <= 0) { if (r) undo(S, r.takes); continue; }
			undo(S, r.takes);
			var tree = toTree(r.node, H, kinds);
			tree.w = tree.t === 's' ? UL : tree.w; tree.h = tree.t === 's' ? UW : tree.h;
			var d = depthOf(tree);
			if (!best || r.area > best.area + 1e-6 || (Math.abs(r.area - best.area) <= 1e-6 && d < best.depth)) best = { area: r.area, takes: r.takes, tree: tree, depth: d, H: H };
		}
		if (best) { redo(S, best.takes); }
		return best;
	}

	/* Сколько раз можно повторить раскладку на таких же плитах. */
	function repeatOf(S, takes, avail) {
		var need = {}, i, k, rep = avail;
		for (i = 0; i < takes.length; i++) need[takes[i]] = (need[takes[i]] || 0) + 1;
		for (k in need) rep = Math.min(rep, Math.floor((S.cnt[k] + need[k]) / need[k]));
		return Math.max(1, rep);
	}

	/* ------------------------------ раскладка задания --------------------------- */
	function jobRun(kinds, B, o, P, seed, ops) {
		var S = S_new(kinds, o, P, rand(seed), ops), sheets = [], total = 0, i;
		for (i = 0; i < kinds.length; i++) total += kinds[i].ids.length;
		var dirs = o.first === 'along' ? ['h'] : o.first === 'across' ? ['v'] : ['h', 'v'];
		var left = total, guard = 0;
		function addSheet(bin, best, reps) {
			var sh = { bin: bin, tree: best.tree, takes: best.takes, area: best.area, H: best.H, reps: reps };
			sheets.push(sh);
			left -= best.takes.length * 1;
		}
		/* остатки — первыми */
		for (var ri = 0; ri < B.rem.length && left > 0; ri++) {
			var rb = B.rem[ri];
			if (S.ops.n > S.ops.cap) break;
			var best = buildSheet(S, rb.UL, rb.UW, dirs);
			if (!best) continue;
			if (best.area / (rb.UL * rb.UW) * 100 < o.minKimRem - 1e-6 && best.takes.length < left) { undo(S, best.takes); continue; }
			addSheet(rb, best, 1);
		}
		while (left > 0 && B.std && guard++ < 5000) {
			var best2 = buildSheet(S, B.std.UL, B.std.UW, dirs);
			if (!best2) break;
			var rep = 1;
			if (P.rep) {
				rep = repeatOf(S, best2.takes, 999);
				for (var r = 1; r < rep; r++) redo(S, best2.takes);
			}
			addSheet(B.std, best2, rep);
			left -= best2.takes.length * (rep - 1);
		}
		var un = [];
		for (i = 0; i < kinds.length; i++) for (var c = 0; c < S.cnt[i]; c++) un.push([i, c]);
		return { sheets: sheets, left: left, cnt: S.cnt.slice(), S: S };
	}

	/* Из решения — листы с записями, таблицей резов и показателями. */
	function finish(job, kinds, items, o, B) {
		var out = [], taken = kinds.map(function () { return 0; }), cards = {}, nCards = 0, tot = { kim: 0, setups: 0, rot: 0, cuts: 0, len: 0, offcut: 0, area: 0, sheetsArea: 0 };
		var mx = o.corner === 'ur' || o.corner === 'dr', my = o.corner === 'dl' || o.corner === 'dr';
		job.sheets.forEach(function (sh) {
			var tr0 = sh.tree, bin = sh.bin;
			for (var rp = 0; rp < sh.reps; rp++) {
				var tree = cloneTree(tr0), recs = [];
				if (tree.t === 's') orderKids(tree, o, 1);
				if (tree.t !== 's') { tree.x = 0; tree.y = 0; if (tree.t === 'i') { tree.r = 0; recs.push(tree); } }
				else place(tree, 0, 0, o.kerf, recs);
				if (mx || my) mirror(tree, bin.UL, bin.UW, mx, my);
				/* recs: порядок обхода после сортировки; номера деталей берём из видов */
				var rr = [];
				for (var i = 0; i < recs.length; i++) {
					var lf = recs[i], kd = kinds[lf.k], id = kd.ids[taken[lf.k]++];
					rr.push({ id: id, x: rnd2(lf.x), y: rnd2(lf.y), a: rnd2(lf.w), b: rnd2(lf.h), q: lf.q, ba: kd.ba, _k: lf.k });
					lf.r = i;
				}
				var d = describe(tree, o, mx, my);
				var sig = bin.L + 'x' + bin.W + ':' + rr.map(function (r) { return r._k + '@' + Math.round(r.x) + ',' + Math.round(r.y) + ',' + Math.round(r.a) + 'x' + Math.round(r.b) + ',' + r.q; }).join(';');
				if (cards[sig] === undefined) cards[sig] = nCards++;
				rr.forEach(function (r) { delete r._k; });
				var off = offcutScore(tree, o);
				var area = rr.reduce(function (s, r) { return s + (r.a * r.b); }, 0);
				var itemArea = 0; rr.forEach(function (r) { var it = items[r.id]; itemArea += it.ar > 0 ? it.ar : it.l0 * it.w0; });
				out.push({ L: bin.L, W: bin.W, rem: bin.rem ? 1 : 0, ri: bin.ri === undefined ? -1 : bin.ri, rot: d.rot, saw: rnd2(d.len), recs: rr, tree: tree,
						   cuts: d.cuts, setups: d.setups, cutsN: d.cutsN, card: cards[sig], depth: d.depth, offcut: off, itemArea: itemArea });
				tot.setups += d.setups; tot.rot += d.rot; tot.cuts += d.cutsN; tot.len += d.len; tot.offcut += off; tot.area += itemArea; tot.sheetsArea += bin.L * bin.W;
			}
		});
		/* штабелирование: одинаковые карты рядом, группы — по площади деталей, по числу деталей или по названию первой детали */
		if (o.stack && o.stack !== 'off') {
			var gk = {}, groups = [];
			out.forEach(function (s, i) { var g = gk[s.card]; if (!g) { g = gk[s.card] = { first: i, list: [], area: s.itemArea, n: s.recs.length, name: '' }; if (s.recs[0] && items[s.recs[0].id]) g.name = String(items[s.recs[0].id].name || ''); groups.push(g); } g.list.push(s); });
			groups.sort(function (a, b) {
				var d = o.stack === 'area' ? b.area - a.area : o.stack === 'count' ? b.n - a.n : (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
				return d || a.first - b.first;
			});
			out = []; groups.forEach(function (g) { out = out.concat(g.list); });
		}
		tot.kim = tot.sheetsArea > 0 ? tot.area / tot.sheetsArea : 0;
		tot.cards = nCards;
		var unplaced = [];
		for (var k = 0; k < kinds.length; k++) for (var j = taken[k]; j < kinds[k].ids.length; j++) unplaced.push(kinds[k].ids[j]);
		unplaced.sort(function (a, b) { return a - b; });
		return { sheets: out, unplaced: unplaced, saw: tot.len, cards: nCards, tot: tot, rounds: 0 };
	}
	function cloneTree(n) { var c = {}; for (var k in n) if (k !== 'kids') c[k] = n[k]; if (n.kids) c.kids = n.kids.map(cloneTree); return c; }

	/* Сравнение решений по шкале критериев: сначала меньше не уложено, затем по порядку критериев пользователя. */
	function keyOf(res, kind) {
		var t = res.tot;
		switch (kind) {
			case 'kim': return -t.kim;
			case 'setups': return t.setups;
			case 'rot': return t.rot;
			case 'cuts': return t.cuts;
			case 'len': return t.len;
			case 'cards': return t.cards;
			case 'offcut': return -t.offcut;
		}
		return 0;
	}
	function better(a, b, o) {
		if (!b) return true;
		if (a.unplaced.length !== b.unplaced.length) return a.unplaced.length < b.unplaced.length;
		/* чем меньше листов, тем лучше: КИМ по реальному листу сравнивается точно, остальные — по порядку */
		for (var i = 0; i < o.crit.length; i++) {
			var c = o.crit[i];
			if (o.critOff && o.critOff[c]) continue;
			var x = keyOf(a, c), y = keyOf(b, c), tol = c === 'kim' ? 1e-7 : 1e-6;
			if (c === 'len') tol = 1;
			if (c === 'offcut') tol = 1e-3;
			if (x < y - tol) return true;
			if (x > y + tol) return false;
		}
		return false;
	}
	cut.better = better;

	/* Листы: отступ от края. */
	function prepBins(bins, margin) {
		var B = { std: null, rem: [] }, i, k;
		if (bins.L > 0 && bins.W > 0) B.std = { L: bins.L, W: bins.W, UL: bins.L - 2 * margin, UW: bins.W - 2 * margin, rem: 0, ri: -1 };
		var rem = bins.rem || [];
		for (i = 0; i < rem.length; i++) {
			var n = Math.max(0, Math.min(500, Math.round(rem[i].n === undefined ? 1 : rem[i].n)));
			var L = Math.max(rem[i].L, rem[i].W), W = Math.min(rem[i].L, rem[i].W);
			if (!(L - 2 * margin > 1) || !(W - 2 * margin > 1)) continue;
			for (k = 0; k < n; k++) B.rem.push({ L: L, W: W, UL: L - 2 * margin, UW: W - 2 * margin, rem: 1, ri: i });
		}
		B.rem.sort(function (a, b) { return b.UL * b.UW - a.UL * a.UW; });
		return B;
	}

	/* Основной вход. */
	cut.nest = function (items, bins, opt) {
		var o = merge(opt), t0 = Date.now();
		var kinds = prepKinds(items, o), B = prepBins(bins, o.margin);
		var Q = Math.max(0, Math.min(2, o.quality | 0)), R = [6, 24, 90][Q], best = null, rounds = 0;
		var base = { k1: [8, 14, 24][Q], k2: [4, 6, 9][Q], k3: [2, 3, 4][Q], noise: 0, minDens: 0.25, rep: false, areaW: 0 };
		var cap = [6e3, 3e4, 12e4][Q];
		for (var r = 0; r < R; r++) {
			var P = { k1: base.k1, k2: base.k2, k3: base.k3, noise: r < 2 ? 0 : 0.06 + 0.02 * (r % 5), minDens: base.minDens, rep: (r % 2 === 1), areaW: 0 };
			var ops = { n: 0, cap: cap };
			var job = jobRun(kinds, B, o, P, 12345 + o.seed * 7919 + r * 101, ops);
			var res = finish(job, kinds, items, o, B);
			rounds++;
			if (better(res, best, o)) best = res;
			if (o.progress) o.progress((r + 1) / R);
			if (Date.now() - t0 > 4000 * (Q + 1) && r >= 1) break;
		}
		best.rounds = rounds;
		return best;
	};

	/* Проверка результата: каждая деталь ровно один раз, поворот разрешён, размеры, границы, зазор на рез,
	   дерево резов согласовано с деталями и укладывается в ограничения станка. Возвращает список нарушений. */
	cut.check = function (res, items, bins, opt) {
		var o = merge(opt), bad = [], seen = {}, i, j;
		var err = function (m) { if (bad.length < 40) bad.push(m); };
		var remLeft = (bins.rem || []).map(function (r) { return r.n === undefined ? 1 : r.n; });
		res.sheets.forEach(function (sh, si) {
			var UL = sh.L - 2 * o.margin, UW = sh.W - 2 * o.margin, tag = 'лист ' + (si + 1) + ': ';
			if (sh.rem) { if (sh.ri < 0 || --remLeft[sh.ri] < 0) err(tag + 'остатков взято больше, чем есть'); }
			else if (!(bins.L > 0 && bins.W > 0)) err(tag + 'целых листов нет');
			sh.recs.forEach(function (r) {
				var it = items[r.id];
				if (!it) { err(tag + 'нет детали ' + r.id); return; }
				if (seen[r.id]) err(tag + 'деталь ' + r.id + ' уложена дважды'); seen[r.id] = 1;
				var qs = (it.qs && it.qs.length) ? it.qs : [0, 2];
				if (qs.indexOf(r.q) < 0) err(tag + 'деталь ' + r.id + ' повёрнута запрещённым образом (' + r.q + ')');
				var ba = r.ba || 0, ew = up((it.l0) + 2 * ba, o.round), eh = up((it.w0) + 2 * ba, o.round);
				var ea = (r.q & 1) ? eh : ew, eb = (r.q & 1) ? ew : eh;
				if (r.a < ea - 0.06 || r.b < eb - 0.06) err(tag + 'деталь ' + r.id + ' меньше нужного: ' + r.a + '×' + r.b + ' вместо ' + ea + '×' + eb);
				if (r.a > ea + 0.5 || r.b > eb + 0.5) err(tag + 'деталь ' + r.id + ' занимает лишнее: ' + r.a + '×' + r.b + ' при ' + ea + '×' + eb);
				if (r.x < -EPS || r.y < -EPS || r.x + r.a > UL + EPS || r.y + r.b > UW + EPS) err(tag + 'деталь ' + r.id + ' вышла за лист');
			});
			for (i = 0; i < sh.recs.length; i++) for (j = i + 1; j < sh.recs.length; j++) {
				var p = sh.recs[i], q = sh.recs[j];
				var gx = Math.max(q.x - (p.x + p.a), p.x - (q.x + q.a)), gy = Math.max(q.y - (p.y + p.b), p.y - (q.y + q.b));
				if (Math.max(gx, gy) < o.kerf - 0.06) err(tag + 'детали ' + p.id + ' и ' + q.id + ' ближе реза (' + rnd2(Math.max(gx, gy)) + ' мм)');
			}
			if (sh.rot > o.maxRot) err(tag + 'поворотов ' + sh.rot + ' больше допустимого ' + o.maxRot);
			if (sh.tree) (function chk(n) {
				if (n.t !== 's') return;
				var len = n.dir === 'h' ? n.w : n.h, sum = 0, k;
				if (o.maxCut > 0 && len > o.maxCut + 0.5) err(tag + 'рез длиннее хода каретки: ' + rnd2(len));
				for (k = 0; k < n.kids.length; k++) {
					var kd = n.kids[k], sz = sizeOf(kd, n.dir); sum += sz + (k ? o.kerf : 0);
					if (kd.t === 'w' && sz < o.minWaste - 0.01 && sz > 0.01) err(tag + 'обрезок уже ' + o.minWaste + ' мм: ' + rnd2(sz));
					if (kd.t !== 'w' && o.maxStrip > 0 && sz > o.maxStrip + 0.5) err(tag + 'полоса больше хода упора: ' + rnd2(sz));
					chk(kd);
				}
				var tot = n.dir === 'h' ? n.h : n.w;
				if (Math.abs(sum - tot) > 0.3) err(tag + 'размеры полос не сходятся: ' + rnd2(sum) + ' и ' + rnd2(tot));
			})(sh.tree);
		});
		for (i = 0; i < items.length; i++) if (!seen[i] && (res.unplaced || []).indexOf(i) < 0) err('деталь ' + i + ' потеряна');
		(res.unplaced || []).forEach(function (u) { if (seen[u]) err('деталь ' + u + ' и уложена, и в «не вошло»'); });
		return bad;
	};

	/* Разбор готовой раскладки (ручной или с другого листа): ищет сквозные резы. recs — { x,y,a,b }, зазор — рез.
	   Возвращает { ok, tree, cuts, setups, rot, len, cutsN, depth }; ok=false — сквозными резами не вырезать. */
	cut.analyze = function (recs, UL, UW, opt) {
		var o = merge(opt), kerf = o.kerf, memo = {}, tol = 0.06;
		var mx = o.corner === 'ur' || o.corner === 'dr', my = o.corner === 'dl' || o.corner === 'dr';
		function leafOf(i) { var r = recs[i]; return { t: 'i', x: r.x, y: r.y, w: r.a, h: r.b, r: i, q: r.q }; }
		function solve(ids, x0, y0, x1, y1) {
			if (!ids.length) return { t: 'w', x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
			if (ids.length === 1) {
				var r0 = recs[ids[0]];
				if (Math.abs(r0.x - x0) < 0.5 && Math.abs(r0.y - y0) < 0.5 && Math.abs(r0.x + r0.a - x1) < 0.5 && Math.abs(r0.y + r0.b - y1) < 0.5) return leafOf(ids[0]);
			}
			var key = ids.join(',') + '|' + rnd2(x0) + ',' + rnd2(y0) + ',' + rnd2(x1) + ',' + rnd2(y1);
			if (memo.hasOwnProperty(key)) return memo[key];
			memo[key] = null;
			var best = null;
			['h', 'v'].forEach(function (dir) {
				var H = dir === 'h', lo = H ? y0 : x0, hi = H ? y1 : x1;
				var iv = ids.map(function (i) { var r = recs[i]; return { s: H ? r.y : r.x, e: H ? r.y + r.b : r.x + r.a, i: i }; }).sort(function (p, q) { return p.s - q.s; });
				var groups = [], cur = null;
				iv.forEach(function (v) { if (cur && v.s < cur.e + kerf - tol) { cur.e = Math.max(cur.e, v.e); cur.list.push(v.i); } else { cur = { s: v.s, e: v.e, list: [v.i] }; groups.push(cur); } });
				var kids = [], pos = lo, okAll = true, g;
				var lead = groups[0].s - lo;
				if (groups.length === 1 && lead < tol && hi - groups[0].e < tol) return;      // резать нечего — это не рез
				for (g = 0; g < groups.length && okAll; g++) {
					var G = groups[g], st = pos, en = G.e, last = g === groups.length - 1;
					if (g === 0 && lead > kerf + tol) { /* обрезок спереди */
						var wsz = lead - kerf;
						kids.push(H ? { t: 'w', x: x0, y: y0, w: x1 - x0, h: wsz } : { t: 'w', x: x0, y: y0, w: wsz, h: y1 - y0 });
						st = lo + lead; pos = st;
					}
					if (last) { var tail = hi - G.e; if (tail < kerf + tol) en = hi; }
					var sub = H ? solve(G.list, x0, st, x1, en) : solve(G.list, st, y0, en, y1);
					if (!sub) { okAll = false; break; }
					kids.push(sub);
					pos = en + kerf;
					if (last && en < hi - tol) kids.push(H ? { t: 'w', x: x0, y: en + kerf, w: x1 - x0, h: hi - en - kerf } : { t: 'w', x: en + kerf, y: y0, w: hi - en - kerf, h: y1 - y0 });
				}
				if (!okAll) return;
				var node = { t: 's', dir: dir, x: x0, y: y0, w: x1 - x0, h: y1 - y0, kids: kids };
				var d = depthOf(node);
				if (!best || d < best.d) best = { d: d, node: node };
			});
			memo[key] = best ? best.node : null;
			return memo[key];
		}
		var all = recs.map(function (r, i) { return i; });
		if (!all.length) return { ok: true, tree: { t: 'w', x: 0, y: 0, w: UL, h: UW }, cuts: [], setups: 0, rot: 0, len: 0, cutsN: 0, depth: 0 };
		var tree = solve(all, 0, 0, UL, UW);
		if (!tree) return { ok: false, tree: null, cuts: [], setups: 0, rot: 0, len: Infinity, cutsN: 0, depth: Infinity };
		(function rev(n) { if (!n.kids) return; if ((n.dir === 'v' && mx) || (n.dir === 'h' && my)) n.kids.reverse(); n.kids.forEach(rev); })(tree);
		var d = describe(tree, o, mx, my);
		return { ok: true, tree: tree, cuts: d.cuts, setups: d.setups, rot: d.rot, len: d.len, cutsN: d.cutsN, depth: d.depth };
	};

	/* Все разные раскладки одного листа, в которых помещаются все детали («Другой вариант»). Лучшие — первыми. */
	cut.variants = function (items, sheet, opt) {
		var o = merge(opt), t0 = Date.now(), lim = o.timeMs || 3000, out = [], seen = {};
		var kinds = prepKinds(items, o), B = prepBins({ L: 0, W: 0, rem: [{ L: sheet.L, W: sheet.W, n: 1 }] }, o.margin);
		var firsts = o.first === 'along' ? ['along'] : o.first === 'across' ? ['across'] : ['along', 'across'];
		for (var r = 0; r < 40 && Date.now() - t0 < lim; r++) {
			var oo = merge(opt); oo.first = firsts[r % firsts.length]; oo.minKimRem = 0;
			if (r >= 4) oo.sort = r % 6;
			var P = { k1: 10, k2: 5, k3: 3, noise: r < 2 ? 0 : 0.12, minDens: 0.2, rep: false, areaW: 0 };
			var job = jobRun(kinds, B, oo, P, 777 + r * 131, { n: 0, cap: 2e4 });
			var res = finish(job, kinds, items, oo, B);
			if (res.unplaced.length || res.sheets.length !== 1) continue;
			var sh = res.sheets[0], sig = sh.recs.map(function (q) { return items[q.id].l0 + 'x' + items[q.id].w0 + '@' + Math.round(q.x) + ',' + Math.round(q.y) + ',' + q.q; }).sort().join(';');
			if (seen[sig]) continue; seen[sig] = 1;
			out.push(sh);
		}
		out.sort(function (a, b) { return (a.rot - b.rot) || (a.saw - b.saw); });
		return out;
	};
	cut._int = { prepKinds: prepKinds, setOpts: setOpts, fillRect: fillRect, S_new: S_new, depthOf: depthOf, describe: describe, orderKids: orderKids, place: place };
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));
