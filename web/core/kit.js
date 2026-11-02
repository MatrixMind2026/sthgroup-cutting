/* STHGroup — «Сборка» 1.22: комплект чертежей, как образец автора «Стол компьютерный» (А3, тёмная шапка, штамп).
   Документ: общий вид изделия (виды, изометрия, блоки цветом и номером, таблица блоков) → для каждой сборочной
   единицы (блок с отметкой «Сборочная единица»; одинаковые — один комплект «× N»): обзор блока (виды, изометрия,
   номера деталей, «Деталировка», «Крепёж», примечания) → лист на каждую деталь (чертёж «Деталировки» с присадкой)
   → схема сборки (4 шага на листе, узлы крепления справа). Вложенная единица (ящик) — узлом: её детали в комплекте
   родителя, её шаги — отдельной схемой «Узел». Детали вне единиц — свои листы и «Монтаж» в конце.
   Шаги, крепёж по шагам и рисунки шагов — из core/asm.js (A.data, A.stepCell). Всё — в мм бумаги. */
(function (G) {
	'use strict';
	var BM = G.BM = G.BM || {};
	var P = BM.project, A = BM.asm, D = BM.draw, Dr = BM.drill, esc = D.esc;
	var K = BM.kit = {};
	K.PW = 420; K.PH = 297;
	var INK = '#1c2126', MUTE = '#5d6770', ACC = '#e8730c', DARK = '#23272c', GRID = '#c9cfd5', RED = '#d62828', WARN = '#c2410c';
	var PAL = ['#f2c14e', '#7fc8f8', '#9bd17b', '#f4a261', '#c8a2e8', '#f78fb3', '#5ec8b8', '#e9d985', '#a0c4ff', '#ffb38a', '#b8e0a8', '#d4a5a5'];
	var HEAD_H = 18, STAMP_H = 17, M0 = 8;                         // шапка, штамп, поле листа
	K.BODY = { x: M0 + 2, y: HEAD_H + 6, w: 420 - 2 * M0 - 4, h: 297 - HEAD_H - 6 - STAMP_H - M0 - 3 };

	function f2(v) { return String(Math.round(v * 100) / 100); }
	function g_() { return A._g; }
	function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
	function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
	function txt(x, y, s, o) {
		o = o || {};
		return '<text x="' + f2(x) + '" y="' + f2(y) + '" font-size="' + f2(o.fs || 2.6) + '"' + (o.a ? ' text-anchor="' + o.a + '"' : '') + (o.b ? ' font-weight="700"' : '') + (o.ls ? ' letter-spacing="' + o.ls + '"' : '') + (o.rot ? ' transform="rotate(-90 ' + f2(x) + ' ' + f2(y) + ')"' : '') + ' fill="' + (o.c || INK) + '">' + esc(s) + '</text>';
	}
	function line(x1, y1, x2, y2, w, c, dash) { return '<line x1="' + f2(x1) + '" y1="' + f2(y1) + '" x2="' + f2(x2) + '" y2="' + f2(y2) + '" stroke="' + (c || INK) + '" stroke-width="' + (w || 0.2) + '"' + (dash ? ' stroke-dasharray="' + dash + '"' : '') + '/>'; }
	function rect(x, y, w, h, fill, stroke, sw) { return '<rect x="' + f2(x) + '" y="' + f2(y) + '" width="' + f2(w) + '" height="' + f2(h) + '" fill="' + (fill || 'none') + '"' + (stroke ? ' stroke="' + stroke + '" stroke-width="' + (sw || 0.25) + '"' : '') + '/>'; }
	function tw(s, b) { return Dr.tw(String(s), b); }
	function clip(s, fs, w, b) { return g_().clip(s, fs, w, b); }
	function wrap(s, fs, w, b) { return g_().wrap(s, fs, w, b); }
	function balloon(x, y, n, r, fill) {
		n = String(n); var fs = r * (n.length > 2 ? 0.8 : (n.length > 1 ? 0.95 : 1.15));
		return '<circle cx="' + f2(x) + '" cy="' + f2(y) + '" r="' + f2(r) + '" fill="' + (fill || '#fff') + '" stroke="' + INK + '" stroke-width="0.3"/>' + txt(x, y + fs * 0.36, n, { fs: fs, b: 1, a: 'middle' });
	}
	function num(v) { return String(Math.round(v * 10) / 10).replace('.', ','); }
	function hexA(c, k) { var n = parseInt(c.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255; return 'rgb(' + Math.round(r * k) + ',' + Math.round(g * k) + ',' + Math.round(b * k) + ')'; }

	/* ----------------------------- состав документа ----------------------------- */
	K.plan = function (st) {
		if (st._kit && st._kit.doc === st.doc && st._kit.w === JSON.stringify(st.work.asm || {})) return st._kit.plan;
		var sc = A.scene(st), list = sc ? A.units(st) : [], tops = list.filter(function (u) { return !u.parent; }), pages = [], groups = [], gBy = {};
		var byKey = {}; list.forEach(function (u) { byKey[u.key] = u; });
		tops.forEach(function (u) { var s = A.sigOf(st, u); if (!gBy[s]) { gBy[s] = { key: u.key, units: [], name: u.name }; groups.push(gBy[s]); } gBy[s].units.push(u); });
		groups.forEach(function (g, k) { g.no = k + 1; g.color = PAL[k % PAL.length]; g.labels = g.units.map(function (u) { return u.label; }).filter(function (x) { return x; }); });
		var cards = sc ? Dr.cards(st) : [], cardOf = {};
		cards.forEach(function (c) { c.ids.forEach(function (id) { cardOf[id] = c; }); });
		function itemsOf(u) { return u.items.concat([].concat.apply([], u.subs.map(function (s) { var su = byKey[s.key]; return su ? itemsOf(su) : s.items; }))); }
		function cardsOf(idx, mult) {
			var by = {}, out = [];
			idx.forEach(function (i) { var c = cardOf[sc.items[i].id]; if (!c) return; if (!by[c.key]) { by[c.key] = { card: c, n: 0 }; out.push(by[c.key]); } by[c.key].n++; });
			out.forEach(function (x) { x.n *= mult; });
			out.sort(function (a, b) { return P.natCmp(String(a.card.t.pos || '~'), String(b.card.t.pos || '~')) || P.natCmp(a.card.t.name, b.card.t.name); });
			return out;
		}
		pages.push({ kind: 'over', title: 'Общий вид' });
		groups.forEach(function (g) {
			var u = g.units[0], cnt = g.units.length;
			g.items = itemsOf(u);
			pages.push({ kind: 'unit', g: g, title: u.name + (cnt > 1 ? ' — ' + cnt + ' шт' : '') });
			cardsOf(g.items, cnt).forEach(function (x) { pages.push({ kind: 'part', g: g, card: x.card, n: x.n, title: (x.card.t.name || 'Деталь') + (x.card.t.pos ? ', поз. ' + x.card.t.pos : '') + ' — ' + x.n + ' шт' }); });
			(function schemes(uu, sub) {
				var d = A.data(st, uu), n = d.steps.length;
				for (var k = 0; k < n; k += 4) pages.push({ kind: 'scheme', g: g, unit: uu, from: k, sub: sub, title: (sub ? 'Узел: ' + uu.name : 'Схема сборки') + (n > 4 ? ' (' + (k / 4 + 1) + ' из ' + Math.ceil(n / 4) + ')' : '') });
				uu.subs.forEach(function (s) { var su = byKey[s.key]; if (su) schemes(su, true); });
			})(u, false);
		});
		var loose = sc ? A.loose(st) : [];
		if (loose.length) {
			cardsOf(loose, 1).forEach(function (x) { pages.push({ kind: 'part', g: null, card: x.card, n: x.n, title: (x.card.t.name || 'Деталь') + (x.card.t.pos ? ', поз. ' + x.card.t.pos : '') + ' — ' + x.n + ' шт' }); });
			pages.push({ kind: 'mount', title: 'Монтаж' });
		}
		pages.forEach(function (p, k) { p.n = k + 1; });
		var plan = { pages: pages, groups: groups, sc: sc, loose: loose, cards: cards };
		groups.forEach(function (g) { g.pages = pages.filter(function (p) { return p.g === g; }).map(function (p) { return p.n; }); });
		st._kit = { doc: st.doc, w: JSON.stringify(st.work.asm || {}), plan: plan };
		return plan;
	};

	/* ----------------------------- виды ----------------------------- */
	/* Ортогональный вид: dir — откуда смотрим ('front' | 'left' | 'top'). list: [{ c: 8 углов, fill, dash }] → { polys, bb } */
	function ortho(sc, list, dir) {
		var X = g_().axes(sc), R, U, V;
		if (dir === 'left') { R = X.fr; U = X.up; V = cross(R, U); }
		else if (dir === 'top') { R = X.rt; U = X.fr.map(function (v) { return -v; }); V = X.up; }
		else { R = X.rt; U = X.up; V = X.fr; }
		var polys = [];
		list.forEach(function (b) {
			var pts = b.c.map(function (p) { return [dot(p, R), -dot(p, U)]; }), d = b.c.reduce(function (s, p) { return s + dot(p, V); }, 0) / 8;
			var x1 = Math.min.apply(null, pts.map(function (q) { return q[0]; })), x2 = Math.max.apply(null, pts.map(function (q) { return q[0]; }));
			var y1 = Math.min.apply(null, pts.map(function (q) { return q[1]; })), y2 = Math.max.apply(null, pts.map(function (q) { return q[1]; }));
			polys.push({ d: d, r: [x1, y1, x2, y2], b: b });
		});
		polys.sort(function (a, b) { return ((a.b.dash ? 1 : 0) - (b.b.dash ? 1 : 0)) || a.d - b.d; });
		var bb = [Infinity, Infinity, -Infinity, -Infinity];
		polys.forEach(function (p) { bb[0] = Math.min(bb[0], p.r[0]); bb[1] = Math.min(bb[1], p.r[1]); bb[2] = Math.max(bb[2], p.r[2]); bb[3] = Math.max(bb[3], p.r[3]); });
		if (!polys.length) bb = [0, 0, 1, 1];
		return { polys: polys, bb: bb, R: R, U: U };
	}
	function drawOrtho(O, T, sw) {
		return O.polys.map(function (p) {
			var a = T([p.r[0], p.r[1]]), b = T([p.r[2], p.r[3]]);
			return '<rect x="' + f2(a[0]) + '" y="' + f2(a[1]) + '" width="' + f2(Math.max(0.05, b[0] - a[0])) + '" height="' + f2(Math.max(0.05, b[1] - a[1])) + '" fill="' + (p.b.dash ? 'none' : (p.b.fill || '#e7edf0')) + '" stroke="' + (p.b.dash ? '#5d6770' : '#2b3138') + '" stroke-width="' + sw + '"' + (p.b.dash ? ' stroke-dasharray="1.6 0.9"' : '') + '/>';
		}).join('');
	}
	function drawIso(I, T, sw) {
		return I.polys.map(function (p) {
			var f = p.b.fill || '#e7edf0', k = [1, 0.86, 0.94][p.lit];
			return '<path d="M' + p.pts.map(function (q) { var s = T(q); return f2(s[0]) + ' ' + f2(s[1]); }).join('L') + 'Z" fill="' + (f.charAt(0) === '#' ? hexA(f, k) : f) + '" stroke="#2b3138" stroke-width="' + sw + '" stroke-linejoin="round"/>';
		}).join('');
	}
	/* размер: стрелки по краям, число над линией; vert — вертикальный */
	function dim(x1, y1, x2, y2, t, vert, c) {
		c = c || INK;
		var a = 1.2, s = '';
		if (vert) {
			s += line(x1, y1, x2, y2, 0.18, c) + '<path d="M' + f2(x1 - a / 2) + ' ' + f2(y1 + a * 1.6) + 'L' + f2(x1) + ' ' + f2(y1) + 'L' + f2(x1 + a / 2) + ' ' + f2(y1 + a * 1.6) + 'M' + f2(x2 - a / 2) + ' ' + f2(y2 - a * 1.6) + 'L' + f2(x2) + ' ' + f2(y2) + 'L' + f2(x2 + a / 2) + ' ' + f2(y2 - a * 1.6) + '" fill="none" stroke="' + c + '" stroke-width="0.18"/>';
			s += txt(x1 - 1, (y1 + y2) / 2, t, { fs: 2.6, a: 'middle', rot: 1, c: c });
		} else {
			s += line(x1, y1, x2, y2, 0.18, c) + '<path d="M' + f2(x1 + a * 1.6) + ' ' + f2(y1 - a / 2) + 'L' + f2(x1) + ' ' + f2(y1) + 'L' + f2(x1 + a * 1.6) + ' ' + f2(y1 + a / 2) + 'M' + f2(x2 - a * 1.6) + ' ' + f2(y2 - a / 2) + 'L' + f2(x2) + ' ' + f2(y2) + 'L' + f2(x2 - a * 1.6) + ' ' + f2(y2 + a / 2) + '" fill="none" stroke="' + c + '" stroke-width="0.18"/>';
			s += txt((x1 + x2) / 2, y1 - 1, t, { fs: 2.6, a: 'middle', c: c });
		}
		return s;
	}
	/* вид в рамке x, y, w, h с подписью и габаритами; out.T — перевод координат вида в лист */
	function viewBox(sc, list, dir, x, y, w, h, cap, out) {
		var O = ortho(sc, list, dir), g = [], pad = 9, bb = O.bb, k = Math.min((w - 2 * pad) / Math.max(1, bb[2] - bb[0]), (h - 6 - 2 * pad) / Math.max(1, bb[3] - bb[1]));
		var ox = x + (w - (bb[2] - bb[0]) * k) / 2 - bb[0] * k, oy = y + 6 + (h - 6 - (bb[3] - bb[1]) * k) / 2 - bb[1] * k, T = function (q) { return [ox + q[0] * k, oy + q[1] * k]; };
		T.k = k;
		g.push(txt(x, y + 3.2, cap, { fs: 3, b: 1 }));
		g.push(drawOrtho(O, T, 0.2));
		var a = T([bb[0], bb[1]]), b = T([bb[2], bb[3]]);
		g.push(line(a[0], b[1] + 1, a[0], b[1] + 5.5, 0.12, MUTE) + line(b[0], b[1] + 1, b[0], b[1] + 5.5, 0.12, MUTE) + dim(a[0], b[1] + 4.6, b[0], b[1] + 4.6, String(Math.round(bb[2] - bb[0]))));
		g.push(line(a[0] - 1, a[1], a[0] - 5.5, a[1], 0.12, MUTE) + line(a[0] - 1, b[1], a[0] - 5.5, b[1], 0.12, MUTE) + dim(a[0] - 4.6, a[1], a[0] - 4.6, b[1], String(Math.round(bb[3] - bb[1])), true));
		if (out) { out.T = T; out.O = O; out.k = k; out.P = function (p) { return T([dot(p, O.R), -dot(p, O.U)]); }; }
		return g.join('');
	}
	function isoBox(sc, list, x, y, w, h, cap, out) {
		var G = g_(), V = G.View(sc), I = G.iso(V, sc, list), T = G.fit(I.bb, x + 4, y + 8, w - 8, h - 10), g = [];
		if (cap) g.push(txt(x, y + 3.2, cap, { fs: 3, b: 1 }));
		g.push(drawIso(I, T, 0.2));
		if (out) { out.T = T; out.V = V; out.P = function (p) { return T(V.pr(p)); }; }
		return g.join('');
	}
	/* ---------- снимки 3D («Текстуры + Рентген») ----------
	   Картинки делает окно (ui/kitpics.js) по запросам K.picReqs; лист берёт готовую из st._kitPics[key],
	   а номера, линии, размеры и рамки рисует поверх. Нет картинки (Node.js, нет 3D) — рисунок линиями, как раньше. */
	var COL = null;
	function pic(st, key, spec, w, h) {
		if (COL && !COL[key]) COL[key] = { key: key, spec: spec, w: w, h: h };
		var p = st._kitPics && st._kitPics[key];
		return p && p.url ? p : null;
	}
	K.picReqs = function (st) {
		var plan = K.plan(st), out = [];
		COL = {};
		try { plan.pages.forEach(function (pg) { K.page(st, pg); }); } finally { var c = COL; COL = null; }
		Object.keys(c).forEach(function (k) { out.push(c[k]); });
		return out;
	};
	function extOf(list, ax) { var pts = []; list.forEach(function (b) { pts = pts.concat(b.c); }); var r = g_().extAx(pts, ax); return Math.round(r[1] - r[0]); }
	function projBox(P, cs) { var x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity; cs.forEach(function (p) { var q = P(p); x1 = Math.min(x1, q[0]); y1 = Math.min(y1, q[1]); x2 = Math.max(x2, q[0]); y2 = Math.max(y2, q[1]); }); return [x1, y1, x2, y2]; }
	/* вид снимком: подпись, картинка, габариты поверх; иначе — линиями */
	function viewPic(st, key, spec, sc, list, dir, x, y, w, h, cap, out) {
		var iso = dir === 'iso', ah = iso ? (cap ? 8 : 2) : 6 + 9, aw = iso ? 8 : 18;
		var pk = pic(st, key, spec, w - aw, h - ah);
		if (!pk) return iso ? isoBox(sc, list, x + 4, y, w - 8, h, cap, out) : viewBox(sc, list, dir, x, y, w, h, cap, out);
		var g = [];
		if (cap) g.push(txt(x, y + 3.2, cap, { fs: 3, b: 1 }));
		var PI = A.picPlace(pk, iso ? x + 4 : x + 9, iso ? y + (cap ? 6 : 1) : y + 6 + 2, w - aw, h - ah);
		g.push(PI.svg);
		var all = []; list.forEach(function (b) { all = all.concat(b.c); });
		var bx = projBox(PI.at, all);
		out = out || {};
		out.P = PI.at; out.pic = 1; out.box = bx;
		/* фасады — пунктиром поверх снимка */
		if (!iso) list.forEach(function (b) { if (!b.dash) return; var r = projBox(PI.at, b.c); g.push('<rect x="' + f2(r[0]) + '" y="' + f2(r[1]) + '" width="' + f2(r[2] - r[0]) + '" height="' + f2(r[3] - r[1]) + '" fill="none" stroke="#3d4650" stroke-width="0.25" stroke-dasharray="1.6 0.9"/>'); });
		if (!iso) {
			var X = g_().axes(sc), hx = dir === 'left' ? X.fr : X.rt, vy = dir === 'top' ? X.fr : X.up, mw = extOf(list, hx), mh = extOf(list, vy);
			out.k = (bx[2] - bx[0]) / Math.max(1, mw);
			g.push(line(bx[0], bx[3] + 1, bx[0], bx[3] + 5.5, 0.12, MUTE) + line(bx[2], bx[3] + 1, bx[2], bx[3] + 5.5, 0.12, MUTE) + dim(bx[0], bx[3] + 4.6, bx[2], bx[3] + 4.6, String(mw)));
			g.push(line(bx[0] - 1, bx[1], bx[0] - 5.5, bx[1], 0.12, MUTE) + line(bx[0] - 1, bx[3], bx[0] - 5.5, bx[3], 0.12, MUTE) + dim(bx[0] - 4.6, bx[1], bx[0] - 4.6, bx[3], String(mh), true));
		}
		return g.join('');
	}
	/* цветная рамка блока на снимке и номер в углу */
	function blockFrame(P, cs, color, no, r) {
		var b = projBox(P, cs), pad = 0.8;
		return '<rect x="' + f2(b[0] - pad) + '" y="' + f2(b[1] - pad) + '" width="' + f2(b[2] - b[0] + 2 * pad) + '" height="' + f2(b[3] - b[1] + 2 * pad) + '" fill="none" stroke="' + hexA(color, 0.82) + '" stroke-width="0.6" rx="0.8"/>' + balloon(b[0] - pad + r * 0.9, b[1] - pad + r * 0.9, no, r, color);
	}
	/* выноски: кружки по краю области, линии к точкам; pts: [{ p: [x, y], n }] */
	function callouts(pts, area, r, fills) {
		var g = [], L = pts.filter(function (q) { return q.p[0] <= area.x + area.w / 2; }), Rr = pts.filter(function (q) { return q.p[0] > area.x + area.w / 2; });
		function column(arr, cx) {
			arr.sort(function (a, b) { return a.p[1] - b.p[1]; });
			var step = Math.max(2 * r + 1.2, Math.min(9, area.h / Math.max(1, arr.length))), y0 = Math.max(area.y + r, Math.min(area.y + area.h - r - (arr.length - 1) * step, arr.reduce(function (s, q) { return s + q.p[1]; }, 0) / Math.max(1, arr.length) - (arr.length - 1) * step / 2));
			arr.forEach(function (q, k) {
				var by = y0 + k * step;
				g.push(line(q.p[0], q.p[1], cx + (cx < q.p[0] ? r : -r), by, 0.18) + '<circle cx="' + f2(q.p[0]) + '" cy="' + f2(q.p[1]) + '" r="0.55" fill="' + INK + '"/>' + balloon(cx, by, q.n, r, fills ? q.fill : '#fff'));
			});
		}
		column(L, area.x + r + 0.5);
		column(Rr, area.x + area.w - r - 0.5);
		return g.join('');
	}

	/* ----------------------------- таблицы ----------------------------- */
	/* cols: [[заголовок, ширина, 'r'?]], rows: [[ячейки]] → { svg, h } */
	function table(x, y, w, cap, cols, rows, opt) {
		opt = opt || {};
		var g = [], fs = opt.fs || 2.45, rh = opt.rh || 5, tot = cols.reduce(function (s, c) { return s + c[1]; }, 0), kx = w / tot, cy = y;
		if (cap) { g.push(txt(x, cy + 3.4, cap, { fs: 3.1, b: 1, ls: 0.15 }) + line(x, cy + 5, x + w, cy + 5, 0.5, ACC)); cy += 7; }
		var xs = [x]; cols.forEach(function (c) { xs.push(xs[xs.length - 1] + c[1] * kx); });
		g.push(rect(x, cy, w, rh, DARK));
		cols.forEach(function (c, k) { g.push(txt(c[2] ? xs[k + 1] - 1.2 : xs[k] + 1.2, cy + rh * 0.68, clip(c[0], fs * 0.92, xs[k + 1] - xs[k] - 2, true), { fs: fs * 0.92, b: 1, c: '#fff', a: c[2] ? 'end' : '' })); });
		cy += rh;
		rows.forEach(function (r, i) {
			var lines = r.map(function (v, k) { return k === (opt.wrapCol === undefined ? 1 : opt.wrapCol) ? wrap(String(v), fs, xs[k + 1] - xs[k] - 2.4) : [String(v)]; }), n = Math.max.apply(null, lines.map(function (l) { return l.length; })), h = rh + (n - 1) * fs * 1.25;
			if (r.sub) g.push(rect(x, cy, w, h, '#eef1f3'));
			else if (i % 2) g.push(rect(x, cy, w, h, '#f6f8f9'));
			lines.forEach(function (ls, k) { ls.forEach(function (t, q) { g.push(txt(cols[k][2] ? xs[k + 1] - 1.2 : xs[k] + 1.2, cy + rh * 0.68 + q * fs * 1.25, clip(t, fs, xs[k + 1] - xs[k] - 2), { fs: fs, a: cols[k][2] ? 'end' : '', b: r.sub ? 1 : 0 })); }); });
			g.push(line(x, cy + h, x + w, cy + h, 0.15, GRID));
			cy += h;
		});
		return { svg: g.join(''), h: cy - y };
	}

	/* ----------------------------- сведения ----------------------------- */
	function edgeText(st, it) {
		var t = null; for (var i = 0; i < st.types.length && !t; i++) if (st.types[i].sig === it.sig) t = st.types[i];
		if (!t) return '';
		var m = null; for (var j = 0; j < st.mats.length && !m; j++) if (st.mats[j].types.indexOf(t) >= 0) m = st.mats[j];
		var sh = m ? P.shapeFor(st, t, m) : null, s = sh ? sh.sides : {}, v = [s.T, s.B, s.L, s.R].filter(function (x) { return x > 0; });
		if (!v.length) return 'нет';
		var same = v.every(function (x) { return x === v[0]; });
		if (v.length === 4 && same) return 'вкруг, ' + num(v[0]);
		var n = { T: 'Д1', B: 'Д2', L: 'Ш1', R: 'Ш2' };
		return ['T', 'B', 'L', 'R'].filter(function (k) { return s[k] > 0; }).map(function (k) { return n[k] + (same ? '' : ' ' + num(s[k])); }).join(' ') + (same ? ', ' + num(v[0]) : '');
	}
	function partRows(st, sc, idx) {
		var by = {}, rows = [], rk = g_().rowKey;
		idx.forEach(function (i) { var it = sc.items[i], k = rk(it); if (by[k]) { by[k].n++; return; } by[k] = { it: it, n: 1, i: i }; rows.push(by[k]); });
		rows.sort(function (a, b) { return P.natCmp(String(a.it.pos || '~'), String(b.it.pos || '~')) || P.natCmp(a.it.name, b.it.name); });
		rows.forEach(function (r, k) { r.no = r.it.pos || String(k + 1); });
		return rows;
	}
	/* крепёж и фурнитура блока — только своё (из его структуры в модели); у каждого узла (ящика) — свой подзаголовок */
	function fastRows(st, u, mult) {
		var d = A.data(st, u), out = [];
		Object.keys(d.fast).sort().forEach(function (n) { out.push([A.shortName(n), String(d.fast[n] * mult), (d.art && d.art[n]) || '']); });
		Object.keys(d.hw).sort().forEach(function (n) { out.push([A.shortName(n), String(d.hw[n] * mult), (d.art && d.art[n]) || 'фурнитура']); });
		if (!out.length && u.subs.length) { var e = ['Корпус: крепёж в модели не задан', '', '']; e.sub = 0; out.push(e); }
		var cnt = {}; u.subs.forEach(function (s) { cnt[s.key] = (cnt[s.key] || 0) + 1; });
		A.units(st).filter(function (su) { return su.parent === u.key; }).forEach(function (su) {
			var t = A.totals(st, su), sd = A.data(st, su), rows = [];
			Object.keys(t.fast).sort().forEach(function (n) { rows.push([A.shortName(n), String(t.fast[n] * mult), (sd.art && sd.art[n]) || (d.art && d.art[n]) || '']); });
			Object.keys(t.hw).sort().forEach(function (n) { rows.push([A.shortName(n), String(t.hw[n] * mult), (sd.art && sd.art[n]) || 'фурнитура']); });
			if (!rows.length) return;
			var h = ['Узел: ' + su.name, '', '']; h.sub = 1; out.push(h);
			out = out.concat(rows);
		});
		return out;
	}
	function boxOf(sc, idx) { var G = g_(), pts = []; idx.forEach(function (i) { pts = pts.concat(G.corners(sc.items[i])); }); return G.aabb(pts); }
	function sizeOf(sc, idx) {
		var X = g_().axes(sc), pts = []; idx.forEach(function (i) { pts = pts.concat(g_().corners(sc.items[i])); });
		var e = function (ax) { var r = g_().extAx(pts, ax); return Math.round(r[1] - r[0]); };
		return [e(X.rt), e(X.up), e(X.fr)];
	}

	/* ----------------------------- узлы и сечения ----------------------------- */
	var WOOD = '#efe6d2', WOODL = '#b8a682', MET = '#9aa3aa', HOLE = '#ffffff';
	function sizes(name) { var m = /(\d+(?:[.,]\d+)?)\s*[xх×X*]\s*(\d+(?:[.,]\d+)?)/.exec(String(name)); return m ? [Number(m[1].replace(',', '.')), Number(m[2].replace(',', '.'))] : null; }
	function hatch(x, y, w, h) { return rect(x, y, w, h, WOOD, WOODL, 0.25); }
	/* Узел крепления в разрезе (как в образце): бок и полка (L-соединение), крепёж на месте, размеры. В поле x, y, w, h. */
	function nodeSvg(name, x, y, w, h, th) {
		th = th || 16;
		var n = String(name), g = [], k = Math.min((h - 4) / 44, (w - 26) / 84), sz = sizes(n);
		var sx = x + 6, sy = y + 1, side = function () { return hatch(sx, sy, th * k, 42 * k); }, shelfY = sy + 14 * k;
		function shelf(len) { return hatch(sx + th * k, shelfY, len * k, th * k); }
		var cy = shelfY + th * k / 2;
		if (/эксцентрик|стяжк|шток/i.test(n)) {
			var a = 34;
			g.push(side(), shelf(64));
			g.push(rect(sx + th * k * 0.35, cy - 3 * k, (th * 0.65 + a) * k, 6 * k, MET));                     // шток
			g.push('<circle cx="' + f2(sx + (th + a) * k) + '" cy="' + f2(shelfY + 7.5 * k) + '" r="' + f2(7.5 * k) + '" fill="#d5dade" stroke="' + INK + '" stroke-width="0.25"/>');
			g.push(dim(sx + th * k, shelfY + th * k + 4, sx + (th + a) * k, shelfY + th * k + 4, String(a)) + txt(sx + (th + a + 9) * k, shelfY + 5 * k, 'Ø15', { fs: 2.4 }));
		} else if (/конфирмат/i.test(n)) {
			var d = sz ? sz[0] : 7, L = sz ? sz[1] : 50;
			g.push(side(), shelf(64));
			g.push(rect(sx - 2.2 * k, cy - 4.5 * k, 2.2 * k, 9 * k, MET) + rect(sx, cy - d / 2 * k, (L) * k, d * k, MET) + line(sx + th * k, cy, sx + L * k, cy, 0.15, '#555', '0.8 0.6'));
			g.push(dim(sx, shelfY + th * k + 4, sx + L * k, shelfY + th * k + 4, String(L)) + txt(sx + (L + 3) * k, cy + 1, 'Ø' + num(d), { fs: 2.4 }));
		} else if (/шкант/i.test(n)) {
			var dd = sz ? sz[0] : 8, LL = sz ? sz[1] : 30, inS = Math.min(12, th - 4);
			g.push(side(), shelf(64));
			g.push('<rect x="' + f2(sx + (th - inS) * k) + '" y="' + f2(cy - dd / 2 * k) + '" width="' + f2(LL * k) + '" height="' + f2(dd * k) + '" rx="' + f2(dd / 2 * k) + '" fill="#d9b98a" stroke="#8a6a3a" stroke-width="0.25"/>');
			g.push(dim(sx + (th - inS) * k, shelfY + th * k + 4, sx + (th - inS + LL) * k, shelfY + th * k + 4, String(LL)) + txt(sx + (th - inS + LL + 3) * k, cy + 1, 'Ø' + num(dd) + ', на клей', { fs: 2.4 }));
		} else if (/полкодерж/i.test(n)) {
			g.push(side(), hatch(sx + th * k, shelfY, 64 * k, th * k));
			g.push(rect(sx + th * k * 0.4, shelfY + th * k, 16 * k, 5 * k, MET));
			g.push(txt(sx + (th + 18) * k, shelfY + th * k + 4.6 * k + 1, 'Ø5, гл. 10', { fs: 2.4 }));
		} else if (/евровинт|саморез|винт/i.test(n)) {
			var D2 = sz ? sz[0] : 6.3, L2 = sz ? sz[1] : 16;
			g.push(hatch(sx, shelfY, 70 * k, th * k));
			g.push(rect(sx + 20 * k, shelfY - 4 * k, 30 * k, 4 * k, '#cfd4d8', INK, 0.2) + rect(sx + 33 * k, shelfY - 4 * k, D2 * k, (L2 + 4) * k, MET));
			g.push(txt(sx + (36 + D2) * k, shelfY + L2 * k, 'Ø' + num(D2) + ' × ' + num(L2), { fs: 2.4 }) + txt(sx + 20 * k, shelfY - 6 * k, 'фурнитура', { fs: 2.2, c: MUTE }));
		} else {
			g.push('<g transform="translate(' + f2(sx) + ' ' + f2(sy + 8) + ') scale(1.1)">' + A.fastIcon(n).replace(/<\/?svg[^>]*>/g, '') + '</g>');
		}
		return g.join('');
	}
	/* Сечения отверстий детали (1 : 1, по одному на каждый вид отверстия): пласть или торец, Ø и глубина, сколько. */
	function holeSections(card, th, x, y, w, h) {
		var hs = card.hs || {}, kinds = {}, list = [];
		[['top', 'пласть'], ['bot', 'пласть'], ['thr', 'насквозь'], ['edge', 'торец']].forEach(function (q) {
			(hs[q[0]] || []).forEach(function (o) { var key = q[0] + '|' + o.d + '|' + (o.dep || 0); if (!kinds[key]) { kinds[key] = { side: q[0], where: q[1], d: o.d, dep: o.dep || th, n: 0, fast: o.fast || '' }; list.push(kinds[key]); } kinds[key].n++; });
		});
		if (!list.length) return { svg: '', h: 0 };
		list.sort(function (a, b) { return b.d - a.d; });
		var g = [txt(x, y + 3.4, 'СЕЧЕНИЯ ОТВЕРСТИЙ', { fs: 3.1, b: 1, ls: 0.15 }) + line(x, y + 5, x + w, y + 5, 0.5, ACC)], cw = 46, chh = 30, per = Math.max(1, Math.floor((w + 4) / (cw + 4))), shown = 0;
		list.forEach(function (o, i) {
			var col = i % per, row = Math.floor(i / per), cx = x + col * (cw + 4), cy = y + 8 + row * (chh + 4);
			if (cy + chh > y + h) return;
			shown++;
			var k = Math.min(1.2, 15 / Math.max(th, o.d)), px = cx + 3, py = cy + 3, L = 40;
			g.push(rect(cx, cy, cw, chh, '#fbfbfc', '#d5dbe0', 0.3));
			g.push(hatch(px, py, L, th * k));
			if (o.side === 'edge') g.push(rect(px, py + (th - o.d) / 2 * k, Math.min(L - 2, o.dep * k), o.d * k, HOLE, INK, 0.25));
			else if (o.side === 'thr') g.push(rect(px + L / 2 - o.d / 2 * k, py, o.d * k, th * k, HOLE, INK, 0.25));
			else g.push(rect(px + L / 2 - o.d / 2 * k, o.side === 'top' ? py : py + (th - Math.min(th, o.dep)) * k, o.d * k, Math.min(th, o.dep) * k, HOLE, INK, 0.25));
			g.push(txt(cx + 2, cy + chh - 5.6, 'Ø' + num(o.d) + (o.side === 'thr' ? ' насквозь' : ' × ' + num(o.dep)) + ' · ' + o.where + ' · ' + o.n + ' шт', { fs: 2.2, b: 1 }));
			g.push(txt(cx + 2, cy + chh - 2, clip(A.shortName(o.fast) || '', 2, cw - 4), { fs: 2, c: MUTE }));
		});
		return { svg: g.join(''), h: 8 + Math.ceil(shown / per) * (chh + 4) };
	}

	/* ----------------------------- шапка и штамп ----------------------------- */
	function frame(st, pg, plan, info) {
		var W = K.PW, H = K.PH, set = st.set || {}, g = [], name = P.modelName(st.model) || 'Изделие';
		g.push(rect(0, 0, W, H, '#fff'));
		g.push(rect(0, 0, W, HEAD_H, DARK) + rect(0, HEAD_H, W, 0.8, ACC));
		/* знак: кубик */
		g.push('<g transform="translate(' + (M0 + 1) + ' 3.2) scale(0.18)"><path d="M32 5 L55.5 18.5 V45.5 L32 59 L8.5 45.5 V18.5 Z M32 32 V59 M32 32 L8.5 18.5 M32 32 L55.5 18.5" fill="none" stroke="' + ACC + '" stroke-width="4" stroke-linejoin="round"/></g>');
		g.push(txt(M0 + 15, 9.3, 'STHGroup', { fs: 5.2, b: 1, c: '#fff' }) + txt(M0 + 15, 13.6, clip(set.org || 'сборочные чертежи', 2.2, 70), { fs: 2.2, c: '#aab3bb', ls: 0.2 }));
		g.push(txt(W / 2, 9.6, clip(pg.title, 5, 200, true), { fs: 5, b: 1, a: 'middle', c: '#fff' }) + txt(W / 2, 14, clip(info.sub || '', 2.4, 200), { fs: 2.4, a: 'middle', c: '#aab3bb' }));
		var rt = [set.phone || '', set.author ? 'составил ' + set.author : ''].filter(function (x) { return x; });
		rt.forEach(function (t, k) { g.push(txt(W - M0, 8.4 + k * 4.4, clip(t, k ? 2.4 : 3, 90, !k), { fs: k ? 2.4 : 3, b: !k, a: 'end', c: k ? '#aab3bb' : '#fff' })); });
		/* штамп */
		var sy = H - M0 - STAMP_H, cells = [['Наименование', name, 70], ['Габарит', info.size || '', 46], ['Материал', info.mat || '', 70], ['Кромка', info.edge || '', 46], ['Масштаб', info.scale || '', 30], ['Составил', set.author || '', 50], ['Дата', dateRu(), 34], ['Лист', pg.n + ' / ' + plan.pages.length, 0]];
		var x = M0, wl = W - 2 * M0;
		g.push(rect(M0, sy - 0.8, wl, 0.8, ACC) + rect(M0, sy, wl, STAMP_H, '#fff', INK, 0.3));
		var used = cells.reduce(function (s, c) { return s + c[2]; }, 0);
		cells.forEach(function (c, k) {
			var cw = c[2] || (wl - used);
			if (k) g.push(line(x, sy, x, sy + STAMP_H, 0.25));
			g.push(txt(x + 1.6, sy + 4, c[0].toUpperCase(), { fs: 1.9, c: MUTE, ls: 0.15 }) + txt(x + 1.6, sy + 11.5, clip(c[1], 3, cw - 3, true), { fs: 3, b: 1 }));
			x += cw;
		});
		return g.join('');
	}
	function dateRu() { var d = new Date(); return ('0' + d.getDate()).slice(-2) + '.' + ('0' + (d.getMonth() + 1)).slice(-2) + '.' + d.getFullYear(); }
	function matsOf(sc, idx) { var m = {}; idx.forEach(function (i) { var it = sc.items[i]; if (it.th) m[Math.round(it.th)] = 1; }); var t = Object.keys(m).map(Number).sort(function (a, b) { return a - b; }); return t.length ? 'плита ' + t.join(' и ') + ' мм' : ''; }
	function scaleTxt(k) { if (!(k > 0)) return ''; var s = [1, 2, 2.5, 4, 5, 8, 10, 12, 15, 20, 25, 30, 40, 50], v = 1 / k, best = s[s.length - 1]; for (var i = 0; i < s.length; i++) if (s[i] >= v * 0.97) { best = s[i]; break; } return '1 : ' + String(best).replace('.', ','); }

	/* ----------------------------- листы ----------------------------- */
	function overPage(st, plan, B) {
		var sc = plan.sc, g = [], colOf = {}, noOf = {};
		plan.groups.forEach(function (gr) { gr.units.forEach(function (u) { var its = u.items.concat([].concat.apply([], u.subs.map(function (s) { return s.items; }))); A.units(st).filter(function (x) { return x.parent && (x.parent === u.key); }).forEach(function (su) { its = its.concat(su.items); }); its.forEach(function (i) { colOf[i] = gr.color; noOf[i] = gr.no; }); }); });
		var all = sc.items.map(function (it, i) { return i; }), list = all.map(function (i) { return { c: g_().corners(sc.items[i]), fill: colOf[i] || '#e7edf0', i: i, dash: sc.items[i].facade ? 0 : 0 }; });
		var lw = B.w * 0.6, vh = (B.h - 4) / 2, fw = lw * 0.62, o1 = {}, o2 = {}, o3 = {}, o4 = {};
		function unitItems(st, u) { var its = u.items.concat([].concat.apply([], u.subs.map(function (s) { return s.items; }))); A.units(st).filter(function (x) { return x.parent === u.key; }).forEach(function (su) { its = its.concat(su.items); }); return its; }
		g.push(viewPic(st, 'over|front', { all: 1, dir: 'front' }, sc, list, 'front', B.x, B.y, fw, vh, 'Вид спереди', o1));
		g.push(viewPic(st, 'over|left', { all: 1, dir: 'left' }, sc, list, 'left', B.x + fw + 4, B.y, lw - fw - 4, vh, 'Вид слева', o2));
		g.push(viewPic(st, 'over|top', { all: 1, dir: 'top' }, sc, list, 'top', B.x, B.y + vh + 4, fw, vh, 'Вид сверху', o3));
		/* изометрия */
		var ix = B.x + lw + 4, iw = B.w - lw - 4, ih = B.h * 0.5;
		g.push(viewPic(st, 'over|iso', { all: 1, dir: 'iso' }, sc, list, 'iso', ix, B.y, iw, ih, 'Общий вид', o4));
		/* номера блоков: на снимке — цветная рамка блока и номер в углу; на рисунке линиями — номер у середины блока */
		var pts = [];
		plan.groups.forEach(function (gr) {
			gr.units.forEach(function (u) {
				var its = unitItems(st, u), cs = [], bx = boxOf(sc, its), c = [(bx.lo[0] + bx.hi[0]) / 2, (bx.lo[1] + bx.hi[1]) / 2, (bx.lo[2] + bx.hi[2]) / 2];
				its.forEach(function (i) { cs = cs.concat(g_().corners(sc.items[i])); });
				[o1, o4].forEach(function (o, q) {
					if (o.pic) g.push(blockFrame(o.P, cs, gr.color, gr.no, q ? 2.4 : 2.2));
					else if (q) pts.push({ p: o.P(c), n: gr.no, fill: gr.color });
					else g.push(balloon(o.P(c)[0], o.P(c)[1], gr.no, 2.6, '#fff'));
				});
			});
		});
		/* таблица блоков */
		var rows = plan.groups.map(function (gr) { var u = gr.units[0], s = sizeOf(sc, gr.items); return [gr.no, u.name + (gr.labels.length ? ' (поз. ' + gr.labels.join(', ') + ')' : ''), s.join('×'), gr.units.length, gr.pages.length ? gr.pages[0] + '–' + gr.pages[gr.pages.length - 1] : '']; });
		if (plan.loose.length) rows.push(['—', 'Детали вне блоков: ' + partRows(st, sc, plan.loose).map(function (r) { return r.it.name; }).slice(0, 4).join(', ') + (plan.loose.length > 4 ? '…' : ''), '', plan.loose.length, 'монтаж']);
		var T = table(ix, B.y + ih + 4, iw, 'БЛОКИ', [['№', 6], ['Блок', 38], ['Размер, мм', 16, 'r'], ['Шт', 6, 'r'], ['Листы', 10, 'r']], rows);
		g.push(T.svg);
		/* цветные метки у номеров таблицы */
		var y = B.y + ih + 4 + 7 + 5;
		plan.groups.forEach(function (gr) { g.push('<circle cx="' + f2(ix + 4.6) + '" cy="' + f2(y + 3.3) + '" r="1.3" fill="' + gr.color + '" stroke="' + INK + '" stroke-width="0.2"/>'); y += 5 + 0; });
		/* выноски изометрии поверх рисунка */
		g.push(pts.map(function (q) { return balloon(q.p[0], q.p[1], q.n, 2.6, '#fff'); }).join(''));
		var note = 'Номер в кружке — блок (сборочная единица) из таблицы. Одинаковые блоки — один номер. Размеры — габариты изделия, мм.';
		wrap(note, 2.3, iw).forEach(function (l, k) { g.push(txt(ix, B.y + B.h - 6 + k * 3, l, { fs: 2.3, c: MUTE })); });
		return { svg: g.join(''), info: { size: sizeOf(sc, all).join('×'), mat: matsOf(sc, all), scale: scaleTxt(o1.k), sub: (st.model.order ? st.model.order + ' · ' : '') + 'блоков ' + plan.groups.reduce(function (s, gr) { return s + gr.units.length; }, 0) + ' · листов ' + plan.pages.length } };
	}
	function unitPage(st, plan, pg, B) {
		var sc = plan.sc, gr = pg.g, u = gr.units[0], cnt = gr.units.length, idx = gr.items, g = [], rows = partRows(st, sc, idx), noOf = {};
		rows.forEach(function (r) { idx.forEach(function (i) { if (g_().rowKey(sc.items[i]) === g_().rowKey(r.it)) noOf[i] = r.no; }); });
		var list = idx.map(function (i) { return { c: g_().corners(sc.items[i]), fill: '#eef1f3', dash: sc.items[i].facade ? 1 : 0, i: i }; });
		var lw = B.w * 0.58, vh = (B.h - 4) / 2, fw = lw * 0.58, o1 = {}, o4 = {};
		var uk = 'unit|' + gr.key + '|', us = function (dir) { return { units: [u.key], dir: dir }; };
		g.push(viewPic(st, uk + 'front', us('front'), sc, list, 'front', B.x, B.y, fw, vh, 'Вид спереди', o1));
		g.push(viewPic(st, uk + 'left', us('left'), sc, list, 'left', B.x + fw + 4, B.y, lw - fw - 4, vh, 'Вид слева', {}));
		/* номера деталей на виде спереди: у середины видимой части, кружки не налезают друг на друга */
		var X0 = g_().axes(sc), placed = [];
		rows.forEach(function (r) {
			if (r.it.facade) return;
			var c = g_().center(g_().corners(r.it)), p = o1.P(c), q = [p[0], p[1]];
			for (var t = 0; t < 24 && placed.some(function (z) { return Math.hypot(z[0] - q[0], z[1] - q[1]) < 5; }); t++) q = [p[0] + Math.cos(t * 1.3) * (3 + t * 0.9), p[1] + Math.sin(t * 1.3) * (3 + t * 0.9)];
			placed.push(q);
			if (q[0] !== p[0] || q[1] !== p[1]) g.push(line(p[0], p[1], q[0], q[1], 0.15) + '<circle cx="' + f2(p[0]) + '" cy="' + f2(p[1]) + '" r="0.45" fill="' + INK + '"/>');
			g.push(balloon(q[0], q[1], r.no, 2.1));
		});
		g.push(viewPic(st, uk + 'top', us('top'), sc, list, 'top', B.x, B.y + vh + 4, fw, vh * 0.8, 'Вид сверху', {}));
		/* изометрия с номерами деталей */
		var ix = B.x + fw + 4, iy = B.y + vh + 4, iw = lw - fw - 4, ih = vh;
		var area = { x: ix, y: iy + 7, w: iw, h: ih - 8 };
		g.push(viewPic(st, uk + 'iso', us('iso'), sc, list.map(function (b) { return { c: b.c, fill: gr.color, i: b.i }; }), 'iso', ix + 4, iy + 6, iw - 8, ih - 6, '', o4) + txt(ix, iy + 3.2, 'Эскиз (общий вид)', { fs: 3, b: 1 }));
		var pts = [], done = {};
		rows.forEach(function (r) { var c = g_().center(g_().corners(r.it)); pts.push({ p: o4.P(c), n: r.no }); done[r.no] = 1; });
		g.push(callouts(pts, area, 2.4));
		/* справа: деталировка, крепёж, примечания */
		var rx = B.x + lw + 6, rw = B.w - lw - 6, y = B.y;
		var dt = table(rx, y, rw, 'ДЕТАЛИРОВКА', [['№', 6], ['Деталь', 30], ['Длина', 10, 'r'], ['Шир.', 10, 'r'], ['Т', 6, 'r'], ['Шт', 6, 'r'], ['Кромка', 22]],
			rows.map(function (r) { return [r.no, r.it.name, Math.round(r.it.L), Math.round(r.it.W), Math.round(r.it.th), r.n * cnt, edgeText(st, r.it)]; }), { fs: 2.3, rh: 4.6 });
		g.push(dt.svg); y += dt.h + 5;
		var fr = fastRows(st, u, cnt);
		if (fr.length) { var ft = table(rx, y, rw, 'КРЕПЁЖ И ФУРНИТУРА', [['Позиция', 44], ['Шт', 8, 'r'], ['Артикул / примечание', 28]], fr, { fs: 2.3, rh: 4.6, wrapCol: 0 }); g.push(ft.svg); y += ft.h + 5; }
		var notes = ['Размеры чистовые, мм.', cnt > 1 ? 'Одинаковых блоков: ' + cnt + (gr.labels.length ? ' (поз. ' + gr.labels.join(', ') + ')' : '') + '. Детали и крепёж — на все.' : '', u.subs.length ? 'Узлы: ' + u.subs.map(function (s) { return s.name; }).join(', ') + ' — собираются отдельно (схема «Узел»).' : '', 'Листы деталей и схема сборки — ' + gr.pages.slice(1).join(', ') + '.'].filter(function (x) { return x; });
		g.push(txt(rx, y + 3.4, 'ПРИМЕЧАНИЯ', { fs: 3.1, b: 1, ls: 0.15 }) + line(rx, y + 5, rx + rw, y + 5, 0.5, ACC)); y += 8;
		notes.forEach(function (n) { wrap(n, 2.4, rw - 4).forEach(function (l, k) { g.push((k ? '' : '<circle cx="' + f2(rx + 1) + '" cy="' + f2(y - 0.8) + '" r="0.6" fill="' + ACC + '"/>') + txt(rx + 3, y, l, { fs: 2.4 })); y += 3.3; }); y += 0.8; });
		var s = sizeOf(sc, idx);
		return { svg: g.join(''), info: { size: s.join('×'), mat: matsOf(sc, idx), scale: scaleTxt(o1.k), edge: '', sub: 'Обзор блока' + (cnt > 1 ? ' · ' + cnt + ' шт' : '') + ' · ' + s.join(' × ') + ' мм · деталей ' + idx.length } };
	}
	function partPage(st, plan, pg, B) {
		var t = pg.card.t, th = pg.card.mat ? pg.card.mat.th : (t.th || 16), lw = B.w * 0.5, g = [];
		var pgD = Det.page(st, pg.card, { W: lw, H: B.h }, { noPic: !!pg.g });
		g.push('<g transform="translate(' + f2(B.x) + ' ' + f2(B.y) + ')">' + pgD.svg + '</g>');
		var rx = B.x + lw + 6, rw0 = B.w - lw - 6, ww = pg.g ? Math.min(78, rw0 * 0.42) : 0, rw = rw0 - (ww ? ww + 4 : 0), sec = holeSections(pg.card, th, rx, 0, rw, 9999), secH = sec.h ? Math.min(sec.h, B.h * 0.42) : 0;
		var maps = [];
		try { maps = Dr.cardPages(st, pg.card, { W: rw, H: B.h - secH - 10 - 6 }, { small: 1 }); } catch (e) { maps = []; }
		if (!maps.length) try { maps = Dr.cardPages(st, pg.card, { W: rw, H: B.h - secH - 10 - 6 }); } catch (e) { maps = []; }
		g.push(txt(rx, B.y + 3.4, 'ПРИСАДКА', { fs: 3.1, b: 1, ls: 0.15 }) + line(rx, B.y + 5, rx + rw, B.y + 5, 0.5, ACC));
		if (maps.length) g.push('<g transform="translate(' + f2(rx) + ' ' + f2(B.y + 8) + ')">' + maps[0].svg + '</g>');
		else g.push(txt(rx, B.y + 12, 'Отверстий нет.', { fs: 2.6, c: MUTE }));
		if (sec.h) g.push(holeSections(pg.card, th, rx, B.y + B.h - secH, rw, secH).svg);
		/* где деталь: блок снимком, деталь — цветом */
		if (ww) {
			var wx = rx + rw + 4, wy = B.y, wh = Math.min(B.h, ww * 1.5), ids = {};
			pg.card.ids.forEach(function (id) { ids[id] = 1; });
			var its = pg.g.items.filter(function (i) { return ids[plan.sc.items[i].id]; });
			g.push(txt(wx, wy + 3.4, 'ГДЕ ДЕТАЛЬ', { fs: 3.1, b: 1, ls: 0.15 }) + line(wx, wy + 5, wx + ww, wy + 5, 0.5, ACC));
			var pw = pic(st, 'where|' + pg.g.key + '|' + pg.card.key, { units: [pg.g.units[0].key], hl: its, dir: 'iso' }, ww, wh - 16);
			if (pw) {
				var PW = A.picPlace(pw, wx, wy + 8, ww, wh - 16);
				g.push(PW.svg);
				if (its.length) { var c = g_().center(g_().corners(plan.sc.items[its[0]])), q = PW.at(c); g.push(line(q[0], q[1], wx + ww - 3, wy + 10, 0.2) + '<circle cx="' + f2(q[0]) + '" cy="' + f2(q[1]) + '" r="0.6" fill="' + INK + '"/>' + balloon(wx + ww - 3, wy + 10, plan.sc.items[its[0]].pos || '•', 2.4, '#ffd27a')); }
			} else {
				var lst = pg.g.items.map(function (i) { return { c: g_().corners(plan.sc.items[i]), fill: its.indexOf(i) >= 0 ? '#f2b230' : '#eef1f3', i: i }; });
				g.push(isoBox(plan.sc, lst, wx, wy + 6, ww, wh - 14, '', {}));
			}
			g.push(txt(wx, wy + wh - 3, clip(pg.g.units[0].name + ': деталь выделена цветом', 2.2, ww), { fs: 2.2, c: MUTE }));
		}
		return { svg: g.join(''), info: { size: Math.round(t.L) + '×' + Math.round(t.W) + '×' + Math.round(pg.card.mat ? pg.card.mat.th : t.th || 0), mat: pg.card.mat ? pg.card.mat.name : '', scale: scaleTxt(pgD.s), sub: (pg.g ? pg.g.units[0].name + ' · ' : 'Вне блоков · ') + 'деталировка и присадка' } };
	}
	var Det = null;
	function schemePage(st, plan, pg, B) {
		var u = pg.unit, d = A.data(st, u), g = [], boxes = [], cw = (B.w * 0.72 - 4) / 2, ch = (B.h - 4) / 2;
		for (var k = 0; k < 4; k++) {
			var si = pg.from + k; if (si >= d.steps.length) break;
			var pk = pic(st, 'step|' + u.key + '|' + si, { step: { u: u.key, si: si } }, cw * (cw < 100 ? 0.44 : 0.52), ch - 14 - 12);
			g.push(A.stepCell(st, d, si, B.x + (k % 2) * (cw + 4), B.y + Math.floor(k / 2) * (ch + 4), cw, ch, boxes, pk));
		}
		/* справа: узлы крепления — по крепежу этой части схемы */
		/* узлы — весь крепёж и фурнитура единицы, по 5 на лист схемы; сначала крепёж (соединения), потом фурнитура */
		var rx = B.x + B.w * 0.72 + 4, rw = B.w - B.w * 0.72 - 4, y = B.y, names = {}, tt = { fast: d.fast, hw: d.hw }, all = Object.keys(tt.fast).sort().concat(Object.keys(tt.hw).sort());
		var pgI = Math.floor(pg.from / 4);
		all.slice(pgI * 5, pgI * 5 + 5).forEach(function (n) { names[n] = tt.fast[n] || tt.hw[n] || 0; });
		g.push(txt(rx, y + 3.4, 'УЗЛЫ КРЕПЛЕНИЯ', { fs: 3.1, b: 1, ls: 0.15 }) + line(rx, y + 5, rx + rw, y + 5, 0.5, ACC)); y += 9;
		if (!all.length) { wrap('Крепёж этого блока в модели не задан — проверьте модель.' + (u.subs.length ? ' Крепёж узлов — на их схемах.' : ''), 2.4, rw).forEach(function (l) { g.push(txt(rx, y, l, { fs: 2.4, c: WARN })); y += 3.4; }); y += 3; }
		var keys = Object.keys(names), nh = Math.max(30, Math.min(44, (B.h - 42 - 9) / Math.max(1, Math.min(keys.length, 5)) - 3));
		keys.slice(0, 5).forEach(function (n, q) {
			g.push(rect(rx, y, rw, nh, '#fbfbfc', '#d5dbe0', 0.3));
			g.push(txt(rx + 2, y + 4, String.fromCharCode(1040 + pgI * 5 + q) + ' — ' + clip(A.shortName(n), 2.5, rw - 22, true), { fs: 2.5, b: 1 }) + txt(rx + rw - 2, y + 4, '× ' + names[n], { fs: 2.8, b: 1, a: 'end' }));
			g.push(nodeSvg(n, rx + 2, y + 6, rw - 4, nh - 8, 16));
			if (d.art && d.art[n]) g.push(txt(rx + rw - 2, y + nh - 1.8, 'арт. ' + d.art[n], { fs: 2, c: MUTE, a: 'end' }));
			y += nh + 3;
		});
		if (all.length > (pgI + 1) * 5 && pg.from + 4 >= d.steps.length) { g.push(txt(rx, y + 2, clip('… и ещё: ' + all.slice((pgI + 1) * 5).map(A.shortName).join(', '), 2.2, rw), { fs: 2.2, c: MUTE })); y += 5; }
		y += 2;
		g.push(txt(rx, y + 3.4, 'ИНСТРУМЕНТ', { fs: 3.1, b: 1, ls: 0.15 }) + line(rx, y + 5, rx + rw, y + 5, 0.5, ACC)); y += 9;
		var tools = ['Шуруповёрт, бита PZ2', 'Шестигранник 4 мм или отвёртка — эксцентрики', 'Киянка — шканты', 'Рулетка, уровень'];
		tools.forEach(function (t) { g.push('<circle cx="' + f2(rx + 1) + '" cy="' + f2(y - 0.8) + '" r="0.6" fill="' + ACC + '"/>' + txt(rx + 3, y, t, { fs: 2.4 })); y += 4; });
		return { svg: g.join(''), info: { size: d.size ? d.size.join('×') : '', mat: '', scale: '', sub: u.name + ' · шаги ' + (pg.from + 1) + '–' + Math.min(d.steps.length, pg.from + 4) + ' из ' + d.steps.length } };
	}
	function mountPage(st, plan, B) {
		var sc = plan.sc, g = [], lo = {}; plan.loose.forEach(function (i) { lo[i] = 1; });
		var list = sc.items.map(function (it, i) { return { c: g_().corners(it), fill: lo[i] ? '#f6c453' : '#eef0f2', i: i }; }), o = {};
		g.push(viewPic(st, 'mount', { all: 1, hl: plan.loose, dir: 'iso' }, sc, list, 'iso', B.x, B.y, B.w * 0.62, B.h, 'Монтаж: блоки на место, затем детали вне блоков (жёлтым)', o));
		var rows = partRows(st, sc, plan.loose), rx = B.x + B.w * 0.62 + 6, rw = B.w * 0.38 - 6;
		var t = table(rx, B.y, rw, 'ДЕТАЛИ ВНЕ БЛОКОВ', [['№', 6], ['Деталь', 34], ['Размер', 18, 'r'], ['Шт', 6, 'r']], rows.map(function (r) { return [r.no, r.it.name, Math.round(r.it.L) + '×' + Math.round(r.it.W), r.n]; }));
		g.push(t.svg);
		var steps = ['Расставить блоки по местам (номера — на общем виде).', 'Выровнять по уровню, стянуть соседние блоки между собой.', 'Поставить детали вне блоков: ' + rows.map(function (r) { return r.it.name; }).slice(0, 5).join(', ') + '.', 'Проверить зазоры фасадов, отрегулировать петли.'], y = B.y + t.h + 8;
		g.push(txt(rx, y + 3.4, 'ПОРЯДОК', { fs: 3.1, b: 1, ls: 0.15 }) + line(rx, y + 5, rx + rw, y + 5, 0.5, ACC)); y += 9;
		steps.forEach(function (s, k) { g.push(balloon(rx + 2.2, y - 0.9, k + 1, 2)); wrap(s, 2.5, rw - 7).forEach(function (l, q) { g.push(txt(rx + 6, y + q * 3.4, l, { fs: 2.5 })); }); y += Math.max(6, wrap(s, 2.5, rw - 7).length * 3.4 + 2.6); });
		return { svg: g.join(''), info: { size: sizeOf(sc, sc.items.map(function (x, i) { return i; })).join('×'), mat: '', scale: '', sub: 'установка блоков и деталей вне блоков' } };
	}

	/* Лист целиком: { W, H, svg, page } */
	K.page = function (st, pg) {
		Det = BM.detail;
		var plan = K.plan(st), B = K.BODY, r;
		try {
			if (pg.kind === 'over') r = overPage(st, plan, B);
			else if (pg.kind === 'unit') r = unitPage(st, plan, pg, B);
			else if (pg.kind === 'part') r = partPage(st, plan, pg, B);
			else if (pg.kind === 'scheme') r = schemePage(st, plan, pg, B);
			else r = mountPage(st, plan, B);
		} catch (e) { r = { svg: txt(B.x, B.y + 10, 'Лист не построен: ' + (e && e.message), { fs: 4, c: RED }), info: {} }; }
		return { W: K.PW, H: K.PH, svg: frame(st, pg, plan, r.info) + r.svg, page: pg };
	};
	K.pageSvg = function (pg, o) {
		o = o || {};
		var size = o.px > 0 ? 'width="' + Math.round(o.px) + '" height="' + Math.round(o.px * pg.H / pg.W) + '"' : 'width="' + pg.W + 'mm" height="' + pg.H + 'mm"';
		return '<svg xmlns="http://www.w3.org/2000/svg" version="1.1" ' + size + ' viewBox="0 0 ' + pg.W + ' ' + pg.H + '" font-family=\'' + D.FONT.replace(/"/g, '') + '\'>' + pg.svg + '</svg>';
	};
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));
