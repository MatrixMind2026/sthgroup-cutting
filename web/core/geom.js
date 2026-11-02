/* STHGroup — геометрия деталей: чтение контура из файла проекта, многоугольники,
   повороты, расстояния. Работает в окне программы, в фоновом потоке и в Node. */
(function (G) {
	'use strict';
	var BM = G.BM = G.BM || {};
	var geom = BM.geom = {};

	var GEOM_TOL = 0.1;       // допуск совпадения координат, мм
	var JOIN_TOL = 0.2;       // допуск стыковки элементов в петлю, мм
	var SHAPE_TOL = 0.3;      // отклонение ломаной от дуги, мм
	var TWO = Math.PI * 2;

	geom.stat = { curve: 0, ok: 0, fail: 0, why: {}, dirSame: 0, dirDiff: 0 };
	geom.resetStat = function () { geom.stat = { curve: 0, ok: 0, fail: 0, why: {}, dirSame: 0, dirDiff: 0 }; };
	function fail(why) { geom.stat.why[why] = (geom.stat.why[why] || 0) + 1; return null; }

	/* ----------------------------- многоугольники ---------------------------- */

	geom.area2 = function (pts) {
		var s = 0;
		for (var i = 0; i < pts.length; i++) { var a = pts[i], b = pts[(i + 1) % pts.length]; s += a[0] * b[1] - b[0] * a[1]; }
		return s;
	};
	geom.perim = function (pts) {
		var s = 0;
		for (var i = 0; i < pts.length; i++) { var a = pts[i], b = pts[(i + 1) % pts.length]; s += Math.sqrt((a[0] - b[0]) * (a[0] - b[0]) + (a[1] - b[1]) * (a[1] - b[1])); }
		return s;
	};
	geom.box = function (pts) {
		var b = { x1: pts[0][0], y1: pts[0][1], x2: pts[0][0], y2: pts[0][1] };
		for (var i = 1; i < pts.length; i++) {
			if (pts[i][0] < b.x1) b.x1 = pts[i][0];
			if (pts[i][0] > b.x2) b.x2 = pts[i][0];
			if (pts[i][1] < b.y1) b.y1 = pts[i][1];
			if (pts[i][1] > b.y2) b.y2 = pts[i][1];
		}
		return b;
	};
	geom.hash = function (pts) {
		var h = 5381;
		for (var i = 0; i < pts.length; i++) {
			h = ((h * 33) ^ Math.round(pts[i][0] * 10)) | 0;
			h = ((h * 33) ^ Math.round(pts[i][1] * 10)) | 0;
		}
		return pts.length + '.' + (h >>> 0).toString(36);
	};
	geom.pointIn = function (pts, x, y) {
		var c = false;
		for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
			var a = pts[i], b = pts[j];
			if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c;
		}
		return c;
	};

	/* ------------------- элемент контура: отрезок или дуга -------------------- */
	/*  Элемент — { a, b, g }: концы и «выпуклость» дуги g = tg(угол/4); g > 0 —
	    дуга идёт от a к b против часовой стрелки (в осях этих же координат),
	    g = 0 — отрезок. При зеркальном преобразовании знак g меняется.          */

	/* Точки элемента от a до b включительно. */
	geom.tess = function (el, tol) {
		var a = el.a, b = el.b, g = el.g || 0;
		if (Math.abs(g) < 1e-9) return [[a[0], a[1]], [b[0], b[1]]];
		var dx = b[0] - a[0], dy = b[1] - a[1], d = Math.sqrt(dx * dx + dy * dy);
		if (d < 1e-9) return [[a[0], a[1]], [b[0], b[1]]];
		var th = 4 * Math.atan(g), R = d / (2 * Math.sin(Math.abs(th) / 2));
		var off = (d / 2) * (1 - g * g) / (2 * g);                    // центр — слева от a→b на off
		var cx = (a[0] + b[0]) / 2 - dy / d * off, cy = (a[1] + b[1]) / 2 + dx / d * off;
		var t = Math.min(tol || SHAPE_TOL, R * 0.5), stepA = 2 * Math.acos(1 - t / R);
		var n = Math.max(2, Math.min(96, Math.ceil(Math.abs(th) / stepA)));
		n = Math.ceil(n / 2) * 2;                                     // чётное: полукруг при повороте на 90° даёт тот же многоугольник
		var a1 = Math.atan2(a[1] - cy, a[0] - cx), pts = [[a[0], a[1]]];
		for (var i = 1; i < n; i++) { var an = a1 + th * i / n; pts.push([cx + R * Math.cos(an), cy + R * Math.sin(an)]); }
		pts.push([b[0], b[1]]);
		return pts;
	};
	geom.elLen = function (el) {
		var dx = el.b[0] - el.a[0], dy = el.b[1] - el.a[1], d = Math.sqrt(dx * dx + dy * dy), g = Math.abs(el.g || 0);
		if (g < 1e-9 || d < 1e-9) return d;
		var th = 4 * Math.atan(g);
		return d / (2 * Math.sin(th / 2)) * th;
	};
	/* Центр и радиус дуги (для DXF и подписей). */
	geom.arcOf = function (el) {
		var a = el.a, b = el.b, g = el.g;
		var dx = b[0] - a[0], dy = b[1] - a[1], d = Math.sqrt(dx * dx + dy * dy);
		var th = 4 * Math.atan(g), R = d / (2 * Math.sin(Math.abs(th) / 2)), off = (d / 2) * (1 - g * g) / (2 * g);
		return { c: [(a[0] + b[0]) / 2 - dy / d * off, (a[1] + b[1]) / 2 + dx / d * off], r: R, sweep: th };
	};
	/* Преобразование элементов: f — отображение точки, flip — оно зеркальное. */
	geom.mapEls = function (els, f, flip) {
		var out = [];
		for (var i = 0; i < els.length; i++) out.push({ a: f(els[i].a), b: f(els[i].b), g: flip ? -(els[i].g || 0) : (els[i].g || 0), src: els[i].src });
		return out;
	};
	geom.elsPts = function (els, tol) {
		var poly = [];
		for (var i = 0; i < els.length; i++) { var p = geom.tess(els[i], tol); for (var q = 0; q < p.length - 1; q++) poly.push(p[q]); }
		return poly;
	};

	/* Элемент из файла проекта → { a, b, g } в координатах контура БАЗИСа.
	   Дуга (T2DArc): концы, Center, ArcDir (true — против часовой от Pos1 к
	   Pos2), длина. Какая из двух дуг между концами наша — по длине; ArcDir
	   нужен только для ровного полукруга и когда центра нет. */
	function arcEl(e) {
		var x1 = e.a[0], y1 = e.a[1], x2 = e.b[0], y2 = e.b[1], len = e.len || 0;
		var c = e.c ? { x: e.c[0], y: e.c[1] } : null, dir = (e.ccw === true || e.ccw === false) ? e.ccw : null;
		var dx = x2 - x1, dy = y2 - y1, chord = Math.sqrt(dx * dx + dy * dy), R, ccw, sweep;
		if (chord < JOIN_TOL) return fail('дуга с совпадающими концами');
		if (!c) {
			if (dir === null) return fail('у дуги нет Center и ArcDir');
			if (!(len > chord + 1e-6)) return fail('у дуги нет Center');
			var lo = 1e-6, hi = TWO - 1e-6, th = 0;
			for (var it = 0; it < 60; it++) { th = (lo + hi) / 2; if (Math.sin(th / 2) / (th / 2) > chord / len) lo = th; else hi = th; }
			return { a: [x1, y1], b: [x2, y2], g: (dir ? 1 : -1) * Math.tan(th / 4) };
		}
		var r1 = Math.sqrt((x1 - c.x) * (x1 - c.x) + (y1 - c.y) * (y1 - c.y)), r2 = Math.sqrt((x2 - c.x) * (x2 - c.x) + (y2 - c.y) * (y2 - c.y));
		if (!(r1 > 1e-6) || Math.abs(r1 - r2) > Math.max(1, r1 * 0.01)) return fail('центр дуги не сходится с концами');
		R = (r1 + r2) / 2;
		sweep = Math.atan2(y2 - c.y, x2 - c.x) - Math.atan2(y1 - c.y, x1 - c.x);       // против часовой, 0..2π
		while (sweep <= 1e-9) sweep += TWO;
		while (sweep > TWO + 1e-9) sweep -= TWO;
		var lenCcw = R * sweep, lenCw = R * (TWO - sweep);
		if (len > 0 && Math.abs(lenCcw - lenCw) > Math.max(1, len * 0.01)) {
			ccw = Math.abs(lenCcw - len) < Math.abs(lenCw - len);
			if (dir !== null) { if (dir === ccw) geom.stat.dirSame++; else geom.stat.dirDiff++; }
		} else if (dir !== null) {
			ccw = (geom.stat.dirDiff > geom.stat.dirSame) ? !dir : dir;      // полукруг: смысл ArcDir сверяем по остальным дугам
		} else return fail('у полукруга нет ArcDir');
		var ang = ccw ? sweep : (TWO - sweep);
		return { a: [x1, y1], b: [x2, y2], g: (ccw ? 1 : -1) * Math.tan(ang / 4) };
	}

	/* Список элементов файла → элементы { a, b, g, src }. Окружность — две полудуги.
	   Нечитаемый элемент даёт null на своём месте (номера сохраняются в src). */
	geom.readEls = function (src) {
		var out = [];
		for (var i = 0; i < (src ? src.length : 0); i++) {
			var e = src[i], r = null;
			if (!e) { out.push(null); continue; }
			if (e.t === 'L') r = { a: [e.a[0], e.a[1]], b: [e.b[0], e.b[1]], g: 0 };
			else if (e.t === 'A') r = arcEl(e);
			else if (e.t === 'C') {
				var p1 = [e.c[0] + e.r, e.c[1]], p2 = [e.c[0] - e.r, e.c[1]];
				out.push({ a: p1, b: p2, g: 1, src: i, half: 1 }, { a: p2, b: p1, g: 1, src: i, half: 2 });
				continue;
			}
			if (r) r.src = i;
			out.push(r);
		}
		return out;
	};

	/* Петли: цепочки элементов, сходящиеся концами. */
	geom.loops = function (els) {
		var used = [], loops = [], i;
		function near(p, q) { return Math.abs(p[0] - q[0]) <= JOIN_TOL && Math.abs(p[1] - q[1]) <= JOIN_TOL; }
		for (i = 0; i < els.length; i++) used[i] = !els[i];
		for (var st = 0; st < els.length; st++) {
			if (used[st]) continue;
			var loop = [els[st]], end = els[st].b, start = els[st].a;
			used[st] = true;
			var grown = true, closed = near(end, start);
			while (grown && !closed) {
				grown = false;
				for (var j = 0; j < els.length && !closed; j++) {
					if (used[j]) continue;
					if (near(els[j].a, end)) { loop.push(els[j]); end = els[j].b; used[j] = true; grown = true; }
					else if (near(els[j].b, end)) { loop.push({ a: els[j].b, b: els[j].a, g: -(els[j].g || 0), src: els[j].src }); end = els[j].a; used[j] = true; grown = true; }
					closed = near(end, start);
				}
			}
			loops.push({ els: loop, closed: closed });
		}
		return loops;
	};

	/* ------------------------------ форма детали ------------------------------ */
	/*  Рамка детали («лицом вверх», как видно в БАЗИСе): X — вдоль длинной
	    стороны, Y — вниз. Контур вытянут по X — рамка совпадает с видом в
	    БАЗИСе; вытянут по Y — деталь повёрнута на 90° по часовой.

	    Возвращает { L, W, wide, curve, ok, pts, area, perim, sg, outer, inner,
	    innerPts, perimIn, edges, sides, fr }:
	      pts   — наружный контур-многоугольник в рамке (null — прямоугольник);
	      outer — наружный контур элементами с настоящими дугами (для DXF);
	      inner — внутренние вырезы элементами, innerPts — они же многоугольниками;
	      edges — ломаные закромлённых элементов { line, th, mat };
	      sides — толщина кромки по сторонам габарита { T, B, L, R }.            */
	geom.readShape = function (part) {
		var cw = Number(part.w) || 0, ch = Number(part.h) || 0;
		var wide = cw >= ch, L = Math.max(cw, ch), W = Math.min(cw, ch);
		var res = { L: L, W: W, wide: wide, curve: false, ok: true, pts: null, area: cw * ch, perim: 2 * (cw + ch), sg: 'R',
					outer: null, inner: [], innerPts: [], perimIn: 0, edges: [], sides: { T: 0, B: 0, L: 0, R: 0 }, fr: null, why: '' };
		var whyBefore = JSON.stringify(geom.stat.why);
		var els = geom.readEls(part.els), i, k;
		var good = [];
		for (i = 0; i < els.length; i++) if (els[i]) good.push(els[i]);

		var rectEls = function () { return [{ a: [0, 0], b: [L, 0], g: 0 }, { a: [L, 0], b: [L, W], g: 0 }, { a: [L, W], b: [0, W], g: 0 }, { a: [0, W], b: [0, 0], g: 0 }]; };
		var loops = good.length ? geom.loops(els) : [], best = null, others = [];
		for (i = 0; i < loops.length; i++) {
			if (!loops[i].closed) continue;
			var poly = geom.elsPts(loops[i].els);
			if (poly.length < 3) continue;
			var ar = Math.abs(geom.area2(poly)) / 2;
			var rec = { els: loops[i].els, poly: poly, ar: ar };
			if (!best || ar > best.ar) { if (best) others.push(best); best = rec; } else others.push(rec);
		}
		if (!best) {
			/* контур не прочитан: если в нём были дуги или он не замкнулся — деталь считаем криволинейной, но кроим по габариту */
			var anyArc = false;
			for (i = 0; i < (part.els ? part.els.length : 0); i++) if (part.els[i] && part.els[i].t !== 'L') anyArc = true;
			if (anyArc || (good.length && good.length !== 4)) {
				res.curve = true; res.ok = false; res.why = 'наружный контур не замкнут';
				if (JSON.stringify(geom.stat.why) === whyBefore) fail(res.why);
				else { var w0 = JSON.parse(whyBefore); for (var wk in geom.stat.why) if (geom.stat.why[wk] !== w0[wk]) { res.why = wk; break; } }
				geom.stat.curve++; geom.stat.fail++;
			}
			res.outer = rectEls();
			res.fr = { wide: wide, x1: 0, y1: 0, y2: ch, L: L, W: W };
			return res;
		}

		var bb = geom.box(best.poly);
		var fr = { wide: wide, x1: bb.x1, y1: bb.y1, y2: bb.y2, L: L, W: W };
		res.fr = fr;
		var toF = function (p) { return geom.toFrame(fr, p); };

		/* прямоугольник: все наружные элементы — отрезки по сторонам габарита */
		var straight = best.els.length >= 4;
		for (k = 0; k < best.els.length && straight; k++) {
			var e = best.els[k];
			if (Math.abs(e.g || 0) > 1e-9) { straight = false; break; }
			var sx = Math.abs(e.a[0] - e.b[0]) <= GEOM_TOL, sy = Math.abs(e.a[1] - e.b[1]) <= GEOM_TOL;
			if (sx && (Math.abs(e.a[0] - bb.x1) <= GEOM_TOL || Math.abs(e.a[0] - bb.x2) <= GEOM_TOL)) continue;
			if (sy && (Math.abs(e.a[1] - bb.y1) <= GEOM_TOL || Math.abs(e.a[1] - bb.y2) <= GEOM_TOL)) continue;
			straight = false;
		}
		var sizeOk = Math.abs((bb.x2 - bb.x1) - cw) <= 1.5 && Math.abs((bb.y2 - bb.y1) - ch) <= 1.5;

		if (!straight) {
			res.curve = true;
			if (!sizeOk) { res.ok = false; res.why = fail('габарит контура не сходится с формой') || 'габарит контура не сходится с формой'; }
			else {
				var out = [];
				for (i = 0; i < best.poly.length; i++) out.push(toF(best.poly[i]));
				var area = Math.abs(geom.area2(out)) / 2;
				if (!(area > 1)) { res.ok = false; res.why = 'площадь контура нулевая'; fail(res.why); }
				else { res.pts = out; res.area = Math.min(area, cw * ch); res.perim = geom.perim(out); res.sg = geom.hash(out); }
			}
		}
		res.outer = (res.pts || (!res.curve && sizeOk)) ? geom.mapEls(best.els, toF, true) : rectEls();

		/* внутренние вырезы (окна): в раскладке не участвуют, нужны на карте и в DXF */
		if (sizeOk) for (i = 0; i < others.length; i++) {
			var ip = [];
			for (k = 0; k < others[i].poly.length; k++) ip.push(toF(others[i].poly[k]));
			res.inner.push(geom.mapEls(others[i].els, toF, true));
			res.innerPts.push(ip);
			res.perimIn += geom.perim(ip);
		}

		/* кромка */
		var bySrc = {};
		for (i = 0; i < els.length; i++) if (els[i]) (bySrc[els[i].src] = bySrc[els[i].src] || []).push(els[i]);
		var sawSeen = {};
		res.saw = { known: false, T: 0, B: 0, L: 0, R: 0 };
		var butts = part.butts || [];
		for (i = 0; i < butts.length; i++) {
			var list = bySrc[butts[i].el];
			if (!list || !sizeOk) continue;
			for (k = 0; k < list.length; k++) {
				var src = geom.tess(list[k]), line = [];
				for (var q = 0; q < src.length; q++) line.push(toF(src[q]));
				var th = Number(butts[i].th) || 0, side = '';
				if (Math.abs(list[k].g || 0) < 1e-9) {
					var p1 = line[0], p2 = line[line.length - 1], t = GEOM_TOL * 2;
					if (Math.abs(p1[1]) <= t && Math.abs(p2[1]) <= t) side = 'T';
					else if (Math.abs(p1[1] - W) <= t && Math.abs(p2[1] - W) <= t) side = 'B';
					else if (Math.abs(p1[0]) <= t && Math.abs(p2[0]) <= t) side = 'L';
					else if (Math.abs(p1[0] - L) <= t && Math.abs(p2[0] - L) <= t) side = 'R';
				}
				if (side && !(res.sides[side] > th)) res.sides[side] = th > 0 ? th : 0.4;
				var clip = butts[i].clip, al = Number(butts[i].al) || 0;
				res.edges.push({ line: line, th: th, mat: butts[i].mat || '', side: side, clip: clip === undefined ? -1 : (clip ? 1 : 0), al: al });
				/* пильный размер (скрипт 1.8): кромка с подрезом уменьшает заготовку на свою толщину, припуск на прифуговку
				   увеличивает — по каждому прямому краю габарита один раз */
				if (side && clip !== undefined && !sawSeen[side]) { sawSeen[side] = 1; res.saw.known = true; res.saw[side] = (clip ? -th : 0) + al; }
			}
		}
		geom.stat.curve += res.curve ? 1 : 0;
		if (res.curve) { if (res.ok) geom.stat.ok++; else geom.stat.fail++; }
		return res;
	};

	geom.toFrame = function (fr, p) {
		var X, Y;
		if (fr.wide) { X = p[0] - fr.x1; Y = fr.y2 - p[1]; }
		else { X = p[1] - fr.y1; Y = p[0] - fr.x1; }
		return [Math.max(0, Math.min(fr.L, X)), Math.max(0, Math.min(fr.W, Y))];
	};
	/* То же без обрезки по габариту — для точек внутри детали (отверстия, пазы). */
	geom.toFrameRaw = function (fr, p) {
		return fr.wide ? [p[0] - fr.x1, fr.y2 - p[1]] : [p[1] - fr.y1, p[0] - fr.x1];
	};

	/* Деталь, перевёрнутая другой пластью вверх: зеркало по длине. */
	geom.mirror = function (sh) {
		var L = sh.L, f = function (p) { return [L - p[0], p[1]]; }, i;
		var out = {};
		for (var k in sh) if (sh.hasOwnProperty(k)) out[k] = sh[k];
		if (sh.pts) { out.pts = []; for (i = sh.pts.length - 1; i >= 0; i--) out.pts.push(f(sh.pts[i])); out.sg = geom.hash(out.pts); }
		out.outer = sh.outer ? geom.mapEls(sh.outer, f, true) : null;
		out.inner = []; out.innerPts = [];
		for (i = 0; i < sh.inner.length; i++) { out.inner.push(geom.mapEls(sh.inner[i], f, true)); out.innerPts.push(sh.innerPts[i].map(f)); }
		out.edges = sh.edges.map(function (e) { return { line: e.line.map(f), th: e.th, mat: e.mat, side: e.side === 'L' ? 'R' : (e.side === 'R' ? 'L' : e.side), clip: e.clip, al: e.al }; });
		out.sides = { T: sh.sides.T, B: sh.sides.B, L: sh.sides.R, R: sh.sides.L };
		if (sh.saw) out.saw = { known: sh.saw.known, T: sh.saw.T, B: sh.saw.B, L: sh.saw.R, R: sh.saw.L };
		out.mir = !sh.mir;
		return out;
	};

	/* ------------------------------- повороты --------------------------------- */
	/* q — число четвертей оборота по часовой стрелке (ось Y вниз); l x w — габарит до поворота. */
	geom.rotPt = function (p, l, w, q) {
		if (q === 1) return [w - p[1], p[0]];
		if (q === 2) return [l - p[0], w - p[1]];
		if (q === 3) return [p[1], l - p[0]];
		return [p[0], p[1]];
	};
	geom.rotPts = function (pts, l, w, q) {
		var out = [];
		for (var i = 0; i < pts.length; i++) out.push(geom.rotPt(pts[i], l, w, q));
		return out;
	};
	geom.rectPts = function (l, w) { return [[0, 0], [l, 0], [l, w], [0, w]]; };

	/* Контур уложенной детали в координатах листа: pts (или прямоугольник) в рамке l x w,
	   поворот q, сдвиг (x, y). */
	geom.placed = function (pts, l, w, q, x, y) {
		var src = pts || geom.rectPts(l, w), out = [];
		for (var i = 0; i < src.length; i++) { var p = geom.rotPt(src[i], l, w, q); out.push([p[0] + x, p[1] + y]); }
		return out;
	};

	/* ------------------------------ расстояния -------------------------------- */
	function segDist2(p, a, b) {
		var dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy, t = 0;
		if (l2 > 1e-12) { t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2; if (t < 0) t = 0; else if (t > 1) t = 1; }
		var x = a[0] + t * dx - p[0], y = a[1] + t * dy - p[1];
		return x * x + y * y;
	}
	function segCross(a, b, c, d) {
		function o(p, q, r) { return (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]); }
		var d1 = o(c, d, a), d2 = o(c, d, b), d3 = o(a, b, c), d4 = o(a, b, d);
		return ((d1 > 1e-9 && d2 < -1e-9) || (d1 < -1e-9 && d2 > 1e-9)) && ((d3 > 1e-9 && d4 < -1e-9) || (d3 < -1e-9 && d4 > 1e-9));
	}
	/* Наименьшее расстояние между двумя многоугольниками; 0 — пересекаются или один внутри другого.
	   stop — можно не уточнять, если расстояние уже меньше stop. */
	geom.polyDist = function (P, Q, stop) {
		var i, j, best = Infinity, n = P.length, m = Q.length;
		for (i = 0; i < n; i++) {
			var a = P[i], b = P[(i + 1) % n];
			for (j = 0; j < m; j++) {
				var c = Q[j], d = Q[(j + 1) % m];
				if (segCross(a, b, c, d)) return 0;
				var v = Math.min(segDist2(a, c, d), segDist2(b, c, d), segDist2(c, a, b), segDist2(d, a, b));
				if (v < best) { best = v; if (stop !== undefined && best < stop * stop * 0.25) return Math.sqrt(best); }
			}
		}
		if (geom.pointIn(Q, P[0][0], P[0][1]) || geom.pointIn(P, Q[0][0], Q[0][1])) return 0;
		return Math.sqrt(best);
	};

	geom.JOIN_TOL = JOIN_TOL; geom.GEOM_TOL = GEOM_TOL; geom.SHAPE_TOL = SHAPE_TOL;
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));
