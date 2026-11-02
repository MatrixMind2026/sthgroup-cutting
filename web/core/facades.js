/* STHGroup — деталировка фасадов: заказные (рамочные — профиль и стекло) и МДФ в плёнке или эмали.

   Один лист — один вид фасада: одинаковые (вид, название, размер, цвета, отверстия) склеены, n — сколько их.
   Фасад рисуется с лицевой стороны, как он виден в изделии: высота — по вертикали (верх модели — как в
   разделе «Модель»), лицо — сторона, противоположная чашкам петель (чашки сверлятся с тыльной стороны).
   Отверстия с тыльной стороны (не насквозь) рисуются пунктиром, остальные — сплошной линией.

   F.sheets(st, R, sup) → [{ kind: 'frame'|'film'|'enamel', name, art, h, w, d, n, area, prod,
                             prof, glass (рамочный), base, coat, sides (МДФ), hinge: { name, n },
                             holes: [{ x, y, d, back }], face: 'cups'|'guess', sup: { имя: {shop,url,img} } }] */
(function (G) {
	'use strict';
	var BM = G.BM = G.BM || {};
	var P = BM.project;
	var F = BM.fac = {};

	function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
	function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
	function mul(a, k) { return [a[0] * k, a[1] * k, a[2] * k]; }
	function r1(v) { return Math.round(v * 10) / 10; }
	function low(s) { return String(s || '').toLowerCase(); }
	function sgn(v) { return v < 0 ? -1 : 1; }

	/* Вид с лица. X, Y — оси плоскости фасада (глобальные векторы), T — ось толщины, box — габарит в
	   координатах X, Y, nf — куда смотрит лицо (глобальный вектор), up — верх модели.
	   Возвращает { W, H, map(lx, ly) → [от левого края, от верха] }. */
	F.faceView = function (X, Y, box, nf, up) {
		var hy = Math.abs(dot(Y, up)) >= Math.abs(dot(X, up)) - 1e-6;
		var hv = hy ? [0, sgn(dot(Y, up))] : [sgn(dot(X, up)), 0];          // верх листа в координатах X, Y
		var U = hy ? mul(Y, hv[1]) : mul(X, hv[0]);
		var R = cross(U, nf), rv = [dot(R, X), dot(R, Y)];                  // вправо на листе, если смотреть на лицо
		if (Math.abs(rv[0]) + Math.abs(rv[1]) < 0.5) rv = hy ? [1, 0] : [0, 1];
		var cs = [[box.x1, box.y1], [box.x2, box.y1], [box.x1, box.y2], [box.x2, box.y2]], sx0 = Infinity, sy0 = -Infinity, sx1 = -Infinity, sy1 = Infinity;
		for (var i = 0; i < 4; i++) {
			var a = cs[i][0] * rv[0] + cs[i][1] * rv[1], b = cs[i][0] * hv[0] + cs[i][1] * hv[1];
			sx0 = Math.min(sx0, a); sx1 = Math.max(sx1, a); sy0 = Math.max(sy0, b); sy1 = Math.min(sy1, b);
		}
		return { W: sx1 - sx0, H: sy0 - sy1, map: function (lx, ly) { return [lx * rv[0] + ly * rv[1] - sx0, sy0 - (lx * hv[0] + ly * hv[1])]; } };
	};

	function contourBox(p) {
		var xs = [], ys = [];
		for (var j = 0; j < (p.els || []).length; j++) {
			var e = p.els[j];
			if (!e) continue;
			if (e.t === 'C') { xs.push(e.c[0] - e.r, e.c[0] + e.r); ys.push(e.c[1] - e.r, e.c[1] + e.r); }
			else { xs.push(e.a[0], e.b[0]); ys.push(e.a[1], e.b[1]); }
		}
		if (!xs.length) return { x1: 0, y1: 0, x2: Number(p.w) || 0, y2: Number(p.h) || 0 };
		var b = { x1: Math.min.apply(null, xs), x2: Math.max.apply(null, xs), y1: Math.min.apply(null, ys), y2: Math.max.apply(null, ys) };
		if (b.x2 - b.x1 < p.w - 0.5) b.x2 = b.x1 + p.w;
		if (b.y2 - b.y1 < p.h - 0.5) b.y2 = b.y1 + p.h;
		return b;
	}
	function isCup(d) { return d >= 30 && d <= 40; }
	/* петля: название того крепежа, у которого больше всего чашек */
	function hingeOf(list) {
		var cnt = {}, best = '', n = 0;
		for (var i = 0; i < list.length; i++) if (isCup(list[i].d)) { var k = list[i].fast || ''; cnt[k] = (cnt[k] || 0) + 1; n++; }
		for (var k2 in cnt) if (cnt.hasOwnProperty(k2) && (!best || cnt[k2] > cnt[best])) best = k2;
		return { name: best, n: n };
	}
	/* Сторона навески и отступ петли от края: по петлям (рамочный) или по чашкам (МДФ).
	   Место петли по ответной планке бывает за краем фасада (планка — в боковине шкафа): тогда петля
	   рисуется у своего края, а отступ от края не пишется. */
	function sideOf(o) {
		var pts = (o.hinges && o.hinges.length) ? o.hinges : o.holes.filter(function (h) { return isCup(h.d); });
		if (!pts.length || !o.w) return;
		var mx = pts.reduce(function (t, h) { return t + h.x; }, 0) / pts.length;
		o.hinge.side = mx > o.w / 2 ? 'right' : 'left';
		o.hinge.edge = r1(o.hinge.side === 'right' ? o.w - mx : mx);
		if (!(o.hinge.edge > 0)) o.hinge.edge = null;
		if (o.hinges) for (var i = 0; i < o.hinges.length; i++) { var q = o.hinges[i], m = Math.min(12, o.w / 4); if (q.x < m || q.x > o.w - m) { q.out = (q.x < 0 || q.x > o.w) ? 1 : 0; q.x = r1(Math.max(m, Math.min(o.w - m, q.x))); } }
	}
	/* Куда смотрит лицо фасада по оси T: +1 / −1 — от середины изделия наружу; 0 — не понять
	   (фасад сам по себе или стоит посередине изделия). */
	function centerOf(bl) {
		if (!bl || !bl.fr || !bl.gs) return null;
		var f = bl.fr, g = bl.gs;
		return [0, 1, 2].map(function (k) { return f.o[k] + (f.x[k] * g[0] + f.y[k] * g[1] + f.z[k] * g[2]) / 2; });
	}
	function awayFrom(prod, fac, T) {
		var a = centerOf(prod), c = centerOf(fac);
		if (!a || !c) return 0;
		var d = dot([c[0] - a[0], c[1] - a[1], c[2] - a[2]], T);
		return Math.abs(d) < 20 ? 0 : sgn(d);
	}
	/* Сторона петель вручную (из листа деталировки): чертёж отражается — петли, отверстия и отступы. */
	F.mirror = function (o) {
		function m(list) { (list || []).forEach(function (q) { q.x = r1(o.w - q.x); }); }
		m(o.holes); m(o.hinges);
		if (o.hinge.side) o.hinge.side = o.hinge.side === 'right' ? 'left' : 'right';
	};
	function holesSig(holes) {
		return holes.map(function (h) { return Math.round(h.x) + ',' + Math.round(h.y) + ',' + r1(h.d) + (h.back ? 'b' : ''); }).sort().join(';');
	}

	/* ---------------------------- фасад МДФ (панель) ---------------------------- */
	function mdfSheet(st, p, f, up) {
		var fr = p.frame, box = contourBox(p), hb = (st.holes && st.holes.by) ? st.holes.by[p.id] : null;
		var top = hb ? hb.top : [], bot = hb ? hb.bot : [], thr = hb ? hb.thr : [];
		var cupT = top.filter(function (h) { return isCup(h.d); }).length, cupB = bot.filter(function (h) { return isCup(h.d); }).length;
		/* «top» — сверлили сверху вниз (против оси Z панели): тыл — верхняя пласть, лицо смотрит в −Z */
		var backTop = cupT || cupB ? cupT >= cupB : top.length >= bot.length, how = (cupT || cupB) ? 'cups' : 'guess';
		var size = P.facadeSize({ gs: [Number(p.w) || 0, Number(p.h) || 0, Number(p.th) || 0], fr: fr }, st.set);
		var o = { kind: f.kind, name: p.name || 'Фасад', art: '', h: size ? size.h : Math.round(Math.max(p.w, p.h)), w: size ? size.w : Math.round(Math.min(p.w, p.h)), d: Math.round(Number(p.th) || 0),
				  base: p.mat, baseArt: p.art || '', coat: f.coat, coatTitle: P.coatTitle(f), sides: f.sides, holes: [], hinge: { name: '', n: 0 }, face: how, prod: (p.path && p.path[0]) || '' };
		if (!fr) return o;
		var nf = backTop ? mul(fr.z, -1) : fr.z, v = F.faceView(fr.x, fr.y, box, nf, up);
		o.w = Math.round(v.W); o.h = Math.round(v.H);
		function add(list, back) { for (var i = 0; i < list.length; i++) { var q = v.map(list[i].x, list[i].y); o.holes.push({ x: r1(q[0]), y: r1(q[1]), d: list[i].d, back: back ? 1 : 0, fast: list[i].fast || '' }); } }
		add(backTop ? top : bot, true);
		add(backTop ? bot : top, false);
		add(thr, false);
		o.hinge = hingeOf(o.holes);
		sideOf(o);
		return o;
	}

	/* ------------------------- заказной (рамочный) фасад ------------------------ */
	function frameSheet(st, raw, idx, fac, cfg, up) {
		var b = raw.blocks[idx], size = P.facadeSize(b, st.set), o = { kind: 'frame', name: b.name, art: b.art || '', h: size ? size.h : 0, w: size ? size.w : 0, d: size ? size.d : 0,
				prof: '', glass: '', holes: [], hinge: { name: '', n: 0 }, face: 'guess', prod: '' };
		var top = b.up, guard = 0;
		while (top >= 0 && raw.blocks[top] && raw.blocks[top].up >= 0 && guard++ < 50) top = raw.blocks[top].up;
		var topB = (top >= 0 && top !== idx) ? raw.blocks[top] : null;
		if (top >= 0 && raw.blocks[top] && top !== idx) o.prod = raw.blocks[top].name;
		function inside(r) { return r && r.bk >= 0 && r.bk < fac.length && fac[r.bk] === idx; }
		var glassMask = String(cfg.glassMask || '').split(/[,;]+/).map(function (x) { return x.trim().toLowerCase(); }).filter(function (x) { return x; });
		var i, prof = raw.prof || [], parts = raw.parts || [], firstPart = '';
		for (i = 0; i < prof.length && !o.prof; i++) if (inside(prof[i])) o.prof = prof[i].name;
		for (i = 0; i < parts.length; i++) {
			if (!inside(parts[i]) || parts[i].plastic) continue;
			var m = parts[i].mat;
			if (!firstPart) firstPart = m;
			if (!o.glass && glassMask.some(function (g) { return low(m).indexOf(g) >= 0; })) o.glass = m;
			if (!o.prof && /профил/i.test(parts[i].name)) o.prof = m;
		}
		if (!o.glass && firstPart && firstPart !== o.prof) o.glass = firstPart;
		/* Отверстия и петли внутри блока-фасада — в его координатах (начало — угол габарита).
		   Петли рамочного фасада (для алюминиевых рамок) чашек в модели не имеют: место петли — по отверстиям
		   её ответной планки (середина), иначе — по самому блоку петли. Отверстия, которые лежат не в толщине
		   фасада (ответная планка сверлится в боковину шкафа), на чертёж не идут. */
		var fr = b.fr, s = b.gs, B = raw.blocks;
		if (!fr || !s) return o;
		var ax = [fr.x, fr.y, fr.z], idxs = [0, 1, 2].sort(function (p1, p2) { return s[p1] - s[p2]; }), t = idxs[0], a = idxs[1], c = idxs[2];
		if (a > c) { var sw = a; a = c; c = sw; }
		function loc(p) { var rel = [p[0] - fr.o[0], p[1] - fr.o[1], p[2] - fr.o[2]]; return [dot(rel, ax[0]), dot(rel, ax[1]), dot(rel, ax[2])]; }
		var isH = {}, j, k;
		for (j = 0; j < B.length; j++) {
			if (j === idx || fac[j] !== idx) continue;
			if (/петл/i.test(B[j].name) || (B[j].up >= 0 && isH[B[j].up])) isH[j] = 1;
		}
		function under(bk, top) { var g = 0; while (bk >= 0 && g++ < 60) { if (bk === top) return true; bk = B[bk] ? B[bk].up : -1; } return false; }
		/* блок, в котором лежат петли (группа петель), в толщину фасада не входит: его габарит — вместе с петлями */
		var hasH = {};
		for (j in isH) if (isH.hasOwnProperty(j)) { var g2 = 0, u2 = B[j].up; while (u2 >= 0 && u2 !== idx && g2++ < 60) { hasH[u2] = 1; u2 = B[u2].up; } }
		/* толщина самого фасада: детали и блоки внутри, кроме петель */
		var lo = Infinity, hi = -Infinity, nBlk = 0;
		function span(v) { if (v < lo) lo = v; if (v > hi) hi = v; }
		for (i = 0; i < parts.length; i++) {
			var pp = parts[i];
			if (!inside(pp) || pp.plastic || isH[pp.bk] || !pp.frame) continue;
			var z0 = loc(pp.frame.o)[t];
			span(z0); span(z0 + dot(pp.frame.z, ax[t]) * (Number(pp.th) || 0));
		}
		for (j = 0; j < B.length; j++) {
			if (j === idx || fac[j] !== idx || isH[j] || hasH[j] || !B[j].fr || !B[j].gs) continue;
			var bf = B[j].fr, bg = B[j].gs, bo = loc(bf.o)[t], dx = dot(bf.x, ax[t]) * bg[0], dy = dot(bf.y, ax[t]) * bg[1], dz = dot(bf.z, ax[t]) * bg[2];
			for (k = 0; k < 8; k++) span(bo + (k & 1 ? dx : 0) + (k & 2 ? dy : 0) + (k & 4 ? dz : 0));
			nBlk++;
		}
		/* профили — не блоками (тела выдавливания): толщина фасада — весь его габарит, если петель в нём нет */
		if (!nBlk && !Object.keys(hasH).length) { span(0); span(s[t]); }
		else if (!nBlk) span(0);
		if (!(hi > lo)) { lo = 0; hi = s[t]; }
		/* петли: верхние блоки «петля…» внутри фасада */
		var hingesL = [], holes = raw.holes || [];
		for (j = 0; j < B.length; j++) {
			if (!isH[j] || (B[j].up >= 0 && isH[B[j].up])) continue;
			var pts = [];
			for (i = 0; i < holes.length; i++) if (holes[i].p && holes[i].bk >= 0 && under(holes[i].bk, j)) pts.push(loc(holes[i].p));
			var at = null, by = 'block';
			if (pts.length) { at = [0, 0, 0]; pts.forEach(function (q) { at[0] += q[0] / pts.length; at[1] += q[1] / pts.length; at[2] += q[2] / pts.length; }); by = 'holes'; }
			else {
				var cup = -1;
				for (k = 0; k < B.length && cup < 0; k++) if (B[k].up >= 0 && under(B[k].up, j) && /чашк/i.test(B[k].name) && B[k].fr) cup = k;
				var src = cup >= 0 ? B[cup].fr : B[j].fr;
				if (src) at = loc(src.o);
			}
			if (at) hingesL.push({ u: at[a], v: at[c], t: at[t], by: by, name: B[j].name });
		}
		var hl = [];
		for (i = 0; i < holes.length; i++) {
			var h = holes[i];
			if (!inside(h) || !h.p || !(h.dia > 0)) continue;
			var l = loc(h.p);
			if (l[a] < -1 || l[a] > s[a] + 1 || l[c] < -1 || l[c] > s[c] + 1 || l[t] < lo - 1 || l[t] > hi + 1) continue;
			hl.push({ u: l[a], v: l[c], d: h.dia, dz: h.d ? dot(h.d, ax[t]) : 0, thr: h.mode === 1, fast: h.fast || '' });
		}
		var cups = hl.filter(function (q) { return isCup(q.d) && Math.abs(q.dz) > 0.9; }), any = hl.filter(function (q) { return Math.abs(q.dz) > 0.9; });
		var ref = cups.length ? cups : any, vote = 0;
		for (i = 0; i < ref.length; i++) vote += ref[i].dz;
		var nf, away = awayFrom(topB, b, ax[t]);
		if (away) {
			/* лицо смотрит от изделия наружу: середина фасада — впереди середины изделия */
			nf = mul(ax[t], away);
			o.face = 'prod';
		} else if (hingesL.length) {
			/* петли стоят с тыла: лицо — по другую сторону от середины толщины */
			var mt = hingesL.reduce(function (sum, q) { return sum + q.t; }, 0) / hingesL.length;
			nf = mul(ax[t], mt <= (lo + hi) / 2 ? 1 : -1);
			o.face = 'hinges';
		} else {
			/* сверло идёт с тыла к лицу: лицо смотрит туда же, куда сверлят */
			nf = vote ? mul(ax[t], sgn(vote)) : ax[t];
			o.face = cups.length ? 'cups' : 'guess';
		}
		var v = F.faceView(ax[a], ax[c], { x1: 0, y1: 0, x2: s[a], y2: s[c] }, nf, up);
		o.w = Math.round(v.W); o.h = Math.round(v.H);
		var backSign = sgn(dot(nf, ax[t])) * -1;                     // сверлят с тыла — в сторону лица
		for (i = 0; i < hl.length; i++) {
			var q = v.map(hl[i].u, hl[i].v);
			o.holes.push({ x: r1(q[0]), y: r1(q[1]), d: hl[i].d, back: (Math.abs(hl[i].dz) > 0.9 && !hl[i].thr && sgn(hl[i].dz) === -backSign) ? 1 : 0, fast: hl[i].fast });
		}
		o.hinges = hingesL.map(function (q) { var m = v.map(q.u, q.v); return { x: r1(m[0]), y: r1(m[1]), by: q.by }; });
		if (o.hinges.length) o.hinge = { name: hingesL[0].name, n: o.hinges.length };
		else {
			var kits = raw.kits || [], fast = raw.fast || [], hn = 0, hname = '';
			for (i = 0; i < kits.length; i++) if (inside(kits[i]) && /петл/i.test(kits[i].name)) { hn += kits[i].n; if (!hname) hname = kits[i].name; }
			if (!hn) for (i = 0; i < fast.length; i++) if (inside(fast[i]) && (fast[i].cup || /^\s*петл/i.test(fast[i].name))) { hn += fast[i].n; if (!hname) hname = fast[i].name; }
			o.hinge = hn ? { name: hname, n: hn } : hingeOf(o.holes);
		}
		sideOf(o);
		return o;
	}

	/* Листы деталировки по проекту. Считаются те же фасады, что и в смете: выделенное, скрытое и
	   комплекты — как там; заказные — по артикулу @ из настроек сметы. */
	F.sheets = function (st, cfg, sup, notes) {
		cfg = cfg || {};
		var raw = st.doc.model, sets = st.work.sets || 1, sel = st.work.scope === 'sel', inc = !!cfg.hidden, up = P.upVec(st.set), out = [], by = {}, i;
		function put(o, k) {
			var key = [o.kind, o.name, o.art, o.h, o.w, o.prof || '', o.glass || '', o.base || '', o.coat || '', o.sides || 0, holesSig(o.holes), holesSig((o.hinges || []).map(function (q) { return { x: q.x, y: q.y, d: 0 }; }))].join('|');
			if (!by[key]) { o.n = 0; o.key = key; by[key] = o; out.push(o); }
			by[key].n += k;
		}
		/* рамочные */
		var B = raw.blocks || [], fac = P.facadeOf(raw, st.set), mdfAll = P.mdfFacades(raw), inner = {}, innerList = [], innerHoles = null, rp = raw.parts || [];
		/* заказной фасад, внутри которого панель МДФ с покрытием (фасад в эмали, заказанный готовым), — лист фасада МДФ;
		   отверстия на неё накладываются отдельно: в раскрой и присадку такая панель не идёт */
		for (i = 0; i < rp.length; i++) {
			var ip = rp[i];
			if (ip.plastic || !mdfAll[ip.id] || !(ip.bk >= 0 && ip.bk < fac.length && fac[ip.bk] >= 0) || inner[fac[ip.bk]]) continue;
			inner[fac[ip.bk]] = ip; innerList.push(ip);
		}
		for (i = 0; i < B.length; i++) {
			if (fac[i] !== i) continue;
			if ((B[i].hid && !inc) || (sel && !B[i].sel)) continue;
			if (fac.keep && fac.keep.blk[i]) continue;               // МДФ этого фасада оставлен в раскрое — лист по детали ниже
			if (inner[i]) {
				if (!innerHoles) innerHoles = P.matchHoles({ parts: innerList, holes: (raw.holes || []).filter(function (h) { return h.bk >= 0 && h.bk < fac.length && fac[h.bk] >= 0; }) });
				var mo = mdfSheet({ holes: innerHoles, set: st.set }, inner[i], mdfAll[inner[i].id], up);
				mo.name = B[i].name || mo.name;
				put(mo, sets);
				continue;
			}
			put(frameSheet(st, raw, i, fac, cfg, up), sets);
		}
		/* МДФ: по деталям раскроя (без исключённых из раскроя) */
		var mdf = P.mdfFacades(raw), parts = st.model.parts || [], tOf = {};
		for (i = 0; i < (st.types || []).length; i++) for (var q = 0; q < st.types[i].ids.length; q++) tOf[st.types[i].ids[q]] = st.types[i];
		for (i = 0; i < parts.length; i++) {
			var p = parts[i], f = mdf[p.id];
			if (!f || (sel && !p.sel)) continue;
			var t = tOf[p.id], tw = t ? (st.work.parts[t.sig] || {}) : {};
			if (tw.off) continue;
			put(mdfSheet(st, p, f, up), sets);
		}
		var KO = { frame: 0, film: 1, enamel: 2 };
		out.sort(function (a, b) { return (KO[a.kind] - KO[b.kind]) || (low(a.name) < low(b.name) ? -1 : (low(a.name) > low(b.name) ? 1 : 0)) || (b.h - a.h) || (b.w - a.w); });
		var fside = (st.work.est && st.work.est.fside) || {};
		for (i = 0; i < out.length; i++) {
			var o = out[i];
			o.sideAuto = o.hinge.side || '';
			if (o.hinge.side && (fside[o.key] === 'left' || fside[o.key] === 'right')) { o.sideSet = fside[o.key]; if (o.sideSet !== o.hinge.side) F.mirror(o); }
			o.area = Math.round(o.n * o.h * o.w / 10000) / 100;
			o.holes.sort(function (a, b) { return (a.y - b.y) || (a.x - b.x); });
			/* поставщик и фото — по названию материала (как в смете) */
			o.sup = {};
			[o.prof, o.glass, o.base, o.coat, o.hinge.name, o.name].forEach(function (k) { if (k && BM.est && BM.est.supFor) o.sup[k] = BM.est.supFor(sup, k, notes); });
		}
		return out;
	};
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));
