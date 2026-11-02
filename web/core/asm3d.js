/* STHGroup — 3D-шаги сборки (1.20): те же шаги, что на листах «Сборки», но на модели из 3D-файла БАЗИСа.
   seq(st) — порядок показа: для каждой разновидности модуля (первый из одинаковых) его шаги, затем шаги его узлов
   (ящиков), в конце — монтаж. map(st, O, Mt, An) — какой объект 3D-файла (или деталь, если файла нет) в каком
   шаге ставится: панель — шаг своей детали; фурнитура и крепёж — шаг детали, к которой привязаны (крепёж
   горизонтальной детали у правого бока — с правым боком), петли, направляющие, подвески — шаг фурнитуры.
   frame(...) — что видно на шаге и что ставится сейчас. Работает в окне, в файле сборщику (данные считаются
   в программе) и под Node.js. */
(function (G) {
	'use strict';
	var BM = G.BM = G.BM || {};
	var A = BM.asm, S3 = BM.asm3 = {};
	function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
	function unitBy(st, key) { var l = A.units(st); for (var i = 0; i < l.length; i++) if (l[i].key === key) return l[i]; return null; }

	/* [{ k, u (ключ единицы), si, id, title, lie, stand, mark, cnt, sub, n (номер шага в единице), of (шагов в единице), name }] + монтаж */
	S3.seq = function (st) {
		var plan = A.plan(st), out = [];
		function add(u, mark, cnt, sub) {
			var d = A.data(st, u);
			d.steps.forEach(function (s, si) { out.push({ k: u.key + '|' + s.id, u: u.key, si: si, id: s.id, title: s.title, lie: !!s.lie, stand: !!s.stand, kind: s.kind, mark: mark, cnt: cnt, sub: !!sub, n: si + 1, of: d.steps.length, name: u.name, size: d.size }); });
		}
		plan.groups.forEach(function (g) {
			var u = g.units[0];
			add(u, g.mtext, g.units.length, false);
			(function subs(uu, mult) {
				var seen = {};
				uu.subs.forEach(function (s) { var su = unitBy(st, s.key); if (!su) return; var key = su.name + '#' + su.items.length; if (seen[key]) return; seen[key] = 1; add(su, g.mtext, mult, true); subs(su, mult); });
			})(u, g.units.length);
		});
		if (plan.tops.length) out.push({ k: 'mount', u: '', si: 0, id: 'mount', title: plan.tops.length > 1 || A.loose(st).length ? 'Монтаж: модули по местам' : 'Поставить на место', mount: 1, kind: 'mount', mark: '', cnt: 1, n: 1, of: 1, name: 'Монтаж', size: null });
		return out;
	};

	/* Объект → цепочка { u: ключ единицы, s: id шага } от внешней единицы к внутренней (узел).
	   O — объекты 3D-файла (BM.glb.objects), Mt — сопоставление с деталями (BM.glb.match), An — привязка фурнитуры
	   (BM.glb.anchors). Без 3D-файла (O = null) — объекты = детали модели. → { of: [цепочка | null], loose: { объект: 1 } } */
	var RE_FAST = /конфирмат|эксцентрик|шток|шкант|стяжк|евровинт|саморез|полкодерж|винт|петл|чашк|направляющ|подвеск|ручк|опор|замок/i;
	S3.isFast = function (name) { return RE_FAST.test(String(name || '')) || A.isHw(name); };
	S3.map = function (st, O, Mt, An) {
		var sc = A.scene(st), units = A.units(st), owner = {}, N = O ? O.objs.length : sc.items.length;
		/* деталь → единицы (внешняя → узел) */
		units.forEach(function (u) { if (u.parent) return; u.items.forEach(function (i) { owner[i] = [u.key]; }); u.subs.forEach(function (s) { s.items.forEach(function (i) { owner[i] = [u.key, s.key]; }); }); });
		units.forEach(function (u) { if (!u.parent) return; u.subs.forEach(function (s) { s.items.forEach(function (i) { if (owner[i]) owner[i] = owner[i].concat([s.key]); }); }); });
		var loose = {}; A.loose(st).forEach(function (i) { loose[i] = 1; });
		var D = {}; function data(k) { if (!D[k]) { var u = unitBy(st, k); D[k] = u ? A.data(st, u) : null; } return D[k]; }
		function chainOfItem(i) {
			var ks = owner[i]; if (!ks) return null;
			return ks.map(function (k, q) { var d = data(k); if (!d) return null; var s = q < ks.length - 1 ? 'sub:' + ks[q + 1] : (d.info[i] ? d.info[i].step : ''); return { u: k, s: s }; }).filter(Boolean);
		}
		function namesUp(o) { var r = [], u = o, n = 0; while (u >= 0 && n < 4) { r.push(O.objs[u].name); u = O.objs[u].up; n++; } return r.join(' '); }
		function center(b) { return [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2]; }
		function bdist(bb, p) { var d2 = 0; for (var k = 0; k < 3; k++) { var e = Math.max(bb.lo[k] - p[k], 0, p[k] - bb.hi[k]); d2 += e * e; } return Math.sqrt(d2); }
		var of = new Array(N), loO = {}, itemOf = new Array(N);
		for (var oi = 0; oi < N; oi++) {
			itemOf[oi] = O ? (Mt.byObj[oi] !== undefined ? Mt.byObj[oi] : -1) : oi;
			if (!O) { of[oi] = chainOfItem(oi); if (loose[oi]) loO[oi] = 1; continue; }
			var o = O.objs[oi];
			if (!o.geo.length || /^(вырез|паз[\s_])/i.test(o.name)) { of[oi] = null; continue; }
			if (/^стен[аы](\s|\d|$)/i.test(String(o.name).trim()) && Mt.byObj[oi] === undefined) { of[oi] = null; continue; }      // стена помещения — не собирается
			var it = Mt.byObj[oi];
			if (it !== undefined) { of[oi] = chainOfItem(it); if (loose[it]) loO[oi] = 1; continue; }
			var an = An[oi], a = an ? (an.a >= 0 ? an.a : (an.grp && an.grp.length ? an.grp[0] : -1)) : -1;
			if (a < 0) { of[oi] = null; loO[oi] = 1; continue; }                       // ничья фурнитура (подвески на стену) — при монтаже
			var ch = chainOfItem(a);
			if (!ch || !ch.length) { of[oi] = null; if (loose[a]) loO[oi] = 1; continue; }
			ch = ch.map(function (x) { return { u: x.u, s: x.s }; });
			var last = ch[ch.length - 1], d = data(last.u), nm = namesUp(oi);
			/* фурнитура (петли, направляющие, подвески…) — в шаг фурнитуры этой единицы */
			if (A.isHw(nm) && d) {
				/* шаг этой фурнитуры — на том уровне, где он есть (направляющие ящика — шаг модуля, а не ящика) */
				var want = 'hw:' + A.hwTitle(nm), lvl = -1;
				for (var q = 0; q < ch.length && lvl < 0; q++) { var dq = data(ch[q].u); if (dq && dq.byId[want]) lvl = q; }
				if (lvl >= 0) { ch = ch.slice(0, lvl + 1); ch[lvl].s = want; }
				else { var hs = d.steps.filter(function (s) { return s.kind === 'hw'; }); if (hs.length && last.s.indexOf('sub:') !== 0) last.s = hs[0].id; }
			} else if (d && (last.s === 'body' || last.s === 'inner') && d.byId.side2 && d.byId.side2.items.length && !/полкодерж/i.test(nm) && o.box && o.box.min[0] <= o.box.max[0]) {
				/* крепёж у правого бока — с правым боком */
				var p = center(o.box), dR = Math.min.apply(null, d.byId.side2.items.map(function (i) { return bdist(d.info[i].bb, p); })), dO = Infinity;
				d.own.forEach(function (i) { if (d.info[i].step !== 'side2' && i !== a) dO = Math.min(dO, bdist(d.info[i].bb, p)); });
				if (dR < 25 && dR < dO) last.s = 'side2';
			}
			of[oi] = ch;
		}
		return { of: of, loose: loO, n: N, item: itemOf };
	};

	/* Шаг e (элемент seq) → { show: [объекты], nw: [объекты, что ставим], fit: [объекты единицы для камеры], dir: сдвиг «въезда», мм, tilt: 0 | 90 } */
	S3.frame = function (st, map, e) {
		var show = [], nw = [], fit = [], sc = A.scene(st), X = { up: sc.up || [0, 0, 1], fr: sc.front || [0, -1, 0] };
		X.rt = [X.up[1] * X.fr[2] - X.up[2] * X.fr[1], X.up[2] * X.fr[0] - X.up[0] * X.fr[2], X.up[0] * X.fr[1] - X.up[1] * X.fr[0]];
		if (e.mount) {
			for (var k = 0; k < map.n; k++) { if (map.of[k] || map.loose[k]) { show.push(k); fit.push(k); if (map.loose[k]) nw.push(k); } }
			return { show: show, nw: nw, fit: fit, dir: X.fr.map(function (v) { return v * 300; }), tilt: 0 };
		}
		var u = unitBy(st, e.u), d = u ? A.data(st, u) : null, ord = {};
		if (d) d.steps.forEach(function (s, q) { ord[s.id] = q; });
		for (var oi = 0; oi < map.n; oi++) {
			var ch = map.of[oi]; if (!ch) continue;
			var x = null; for (var q = 0; q < ch.length; q++) if (ch[q].u === e.u) { x = ch[q]; break; }
			if (!x) continue;
			/* деталь далеко от модуля (общий цоколь, ошибка в модели) — видна, но камеру не отодвигает */
			var it0 = map.item[oi], dx = x.u === e.u ? d : null, farI = dx && it0 >= 0 && dx.info[it0] && dx.info[it0].far;
			if (!farI) fit.push(oi);
			var p = ord[x.s]; if (p === undefined) p = 99;
			if (p > e.si) continue;
			show.push(oi); if (p === e.si) nw.push(oi);
		}
		/* камера — по панелям единицы (фурнитура без своей панели может стоять далеко) */
		var fitP = fit.filter(function (oi) { return map.item[oi] >= 0; });
		if (fitP.length) fit = fitP;
		var dir;
		if (e.lie) dir = X.rt.map(function (v) { return v * 350; });                // корпус лежит: сверху вниз
		else if (e.id === 'back') dir = X.fr.map(function (v) { return -v * 350; }); // задняя стенка — сзади
		else dir = X.fr.map(function (v) { return v * 300; });                       // фасады, фурнитура, узлы — спереди
		/* левый бок на первом шаге — уже лежит, не въезжает */
		var keep = {}, still = [];
		if (e.lie && e.id === 'body' && d) d.byId.body.items.forEach(function (i) { var n = d.info[i].it.n || [0, 0, 1]; if (Math.abs(dot(n, X.rt)) > 0.7) keep[i] = 1; });
		nw.forEach(function (oi) { if (keep[map.item[oi]]) still.push(oi); });
		return { show: show, nw: nw, fit: fit, dir: dir, tilt: e.lie ? 90 : 0, still: still };
	};
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));
