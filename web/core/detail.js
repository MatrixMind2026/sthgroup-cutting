/* STHGroup — деталировка: чертёж каждой детали на своём листе — для распила и кромления в цеху, заказа у
   подрядчика и проверки готовых деталей. Деталь нарисована лицевой стороной (как на карте присадки), у краёв —
   где они в изделии; форма (радиусы, скосы), вырезы, пазы, кромка, текстура, отверстия; сведения о детали.

   Стиль — как у карт присадки (1.13.0): высота цифр из настройки присадки, тонкие линии, те же цвета.
   Цвета: зелёный — кромка, красный — лицевая кромка (край ПЕРЕД), оранжевый — вырезы, пазы, большие отверстия
   и радиусы: размер и отступы от краёв детали; синий — от пола (от нуля по высоте БАЗИСа) и от стены (от задней
   плоскости изделия).

   Вид листа (кнопками над листом): Список — чертёж и список обработок под ним; Таблица — сведения справа;
   Крупно — чертёж на весь лист, сведения строкой. Галки: размеры, кромка и текстура, отверстия, «где деталь»,
   сведения, выносы (выносной вид каждого выреза; без галки — карточки с текстом).

   Главное правило, как у присадки: надписи не накладываются. Каждая надпись ставится только туда, где она
   никого не задевает; не нашлось места — на чертеже её нет, а сведения остаются в списке, выносе или таблице.
   Длинный текст переносится на следующую строку, «…» нет. Det.check(page) проверяет готовый лист. Всё — в мм. */
(function (G) {
	'use strict';
	var BM = G.BM = G.BM || {};
	var P = BM.project, geom = BM.geom, D = BM.draw, Dr = BM.drill, esc = D.esc;
	var Det = BM.detail = {};

	var CAPF = 0.69;                                     // высота прописной — доля кегля
	var FS = 2.6, FSN = 2.6, FSE = 2.6, RH = 4.8, CAPH = 5, LNH = 3.1;   // кегли и шаги строк — от высоты цифр присадки (useStyle)
	var GREEN = '#0E6B5A', FRONT = '#d62828', CUT = '#e8730c', BLUE = '#1f6fd1', TEX = '#8a6d3b';
	var SCALES = [1, 1 / 1.5, 1 / 2, 1 / 2.5, 1 / 3, 1 / 4, 1 / 5, 1 / 6, 1 / 8, 1 / 10, 1 / 12, 1 / 15, 1 / 20, 1 / 25, 1 / 30, 1 / 40, 1 / 50];
	Det.STYLES = { V: 'Список', A: 'Таблица', B: 'Крупно' };
	Det.STYLE_HINT = { V: 'чертёж и под ним список обработок', A: 'чертёж и сведения справа', B: 'чертёж на весь лист, сведения строкой' };
	Det.TOGGLES = [['dims', 'Размеры'], ['edge', 'Кромка'], ['holes', 'Отверстия'], ['pic', 'Где деталь'], ['info', 'Сведения'], ['callouts', 'Выносы']];
	Det.DEF = { style: 'V', dims: 1, edge: 1, holes: 1, pic: 1, info: 1, callouts: 1 };
	Det.conf = function (set) {
		var s = (set && set.detail) || {}, c = {}, k;
		for (k in Det.DEF) c[k] = s[k] === undefined || s[k] === null ? Det.DEF[k] : s[k];
		if (!Det.STYLES[c.style]) c.style = Det.DEF.style;
		return c;
	};
	/* Кегли — от высоты цифр присадки (настройка «Высота цифр»): все чертежи программы в одном стиле. */
	function useStyle(st) {
		var cap = Dr.conf(st && st.set).cap, q = Math.max(0.72, cap / 3);
		FS = cap / CAPF; FSN = Math.max(2.4, Math.min(3.6, FS)); FSE = Math.min(2.9, FS); CAPH = FSN + 2.4; LNH = FS * 1.18; RH = cap + 2.6 * q + 0.4;
	}

	function f2(v) { return String(Math.round(v * 100) / 100); }
	function num(v) { return String(Math.round(v * 10) / 10).replace('.', ','); }
	function tw(str, bold) { return Dr.tw(str, bold); }
	function txt(x, y, s, o) {
		o = o || {};
		return '<text x="' + f2(x) + '" y="' + f2(y) + '" font-size="' + f2(o.fs || FS) + '"' + (o.anchor ? ' text-anchor="' + o.anchor + '"' : '') + (o.bold ? ' font-weight="700"' : '') +
			(o.fill ? ' fill="' + o.fill + '"' : '') + (o.rot ? ' transform="rotate(-90 ' + f2(x) + ' ' + f2(y) + ')"' : '') + '>' + esc(s) + '</text>';
	}
	function line(x1, y1, x2, y2, w, col, dash) { return '<line x1="' + f2(x1) + '" y1="' + f2(y1) + '" x2="' + f2(x2) + '" y2="' + f2(y2) + '" stroke="' + (col || '#000') + '" stroke-width="' + w + '"' + (dash ? ' stroke-dasharray="' + dash + '"' : '') + '/>'; }
	function hit(a, b, pad) { return a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad; }
	function scaleText(s) { return s >= 1 ? num(s) + ' : 1' : '1 : ' + num(1 / s); }
	/* Перенос по словам в ширину width (мм); слово длиннее строки режется по буквам — без «…». */
	function wrap(text, fs, width, bold) {
		var words = String(text).split(' '), out = [], cur = '';
		words.forEach(function (w) {
			while (tw(w, bold) * fs > width && w.length > 1) {
				var k = w.length; while (k > 1 && tw((cur ? cur + ' ' : '') + w.slice(0, k), bold) * fs > width) k--;
				if (k <= 1 && cur) { out.push(cur); cur = ''; continue; }
				out.push((cur ? cur + ' ' : '') + w.slice(0, k)); cur = ''; w = w.slice(k);
			}
			var t = cur ? cur + ' ' + w : w;
			if (tw(t, bold) * fs > width && cur) { out.push(cur); cur = w; } else cur = t;
		});
		if (cur) out.push(cur);
		return out.length ? out : [''];
	}
	function badge(x, y, n, r) { r = r || Math.max(1.5, FS * 0.62); return '<circle cx="' + f2(x) + '" cy="' + f2(y) + '" r="' + f2(r) + '" fill="' + CUT + '"/>' + txt(x, y + FS * CAPF * 0.42, String(n), { anchor: 'middle', bold: 1, fill: '#fff', fs: FS * 0.82 }); }
	var CIRC = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';
	function circNum(n) { return n >= 1 && n <= 20 ? CIRC.charAt(n - 1) : '(' + n + ')'; }

	/* ================================ данные ================================== */

	/* Карты деталировки: все детали с количеством, одинаковые — одной картой (как в присадке). */
	Det.cards = function (st) { return Dr.cards(st); };

	/* Для списка деталей: сколько обработок (вырезы, пазы, радиусы, отверстия) и есть ли вырезы. */
	function stat(st, c) {
		if (!c._dst) { try { var M = Det.model(st, c); c._dst = { ops: M.ops.filter(function (o) { return !/кромка/i.test(o.what) && !o.hole; }).length, holes: M.holes.length, cut: M.num.length > 0 || M.inner.length > 0 }; } catch (e) { c._dst = { ops: 0, holes: 0, cut: false }; } }
		return c._dst;
	}
	Det.stat = stat;
	Det.hasCut = function (st, c) { return stat(st, c).cut; };
	/* Порядок деталей — как в списке раздела (общая настройка с присадкой). all — без отбора (для PDF). */
	Det.groups = function (st, cards, all) { return Dr.listOrder(st, cards, { all: all, what: 'обработки', score: function (c) { var s = stat(st, c); return s.ops + s.holes; }, cut: function (c) { return stat(st, c).cut; } }); };
	Det.order = function (st, cards, all) { var out = []; Det.groups(st, cards, all).forEach(function (g) { out = out.concat(g.cards); }); return out; };
	/* Всё о детали в осях её лицевой стороны: контур, вырезы, пазы, кромка, отверстия, подписи краёв, обработки. */
	Det.model = function (st, card) {
		var t = card.t, L = t.L, W = t.W, sh = t.shape || {}, views = Dr.views(st, card), O = card._or || {};
		var fv = null, bv = null;
		views.forEach(function (v) { if (v.kind === 'face') { if (v.face) fv = v; else bv = v; } });
		var faceB = O.face === 'B', my = function (y) { return faceB ? W - y : y; };
		var M = { L: L, W: W, th: t.th, faceB: faceB, lab: fv && fv.elab ? fv.elab : (O.lab ? O.lab[faceB ? 'B' : 'A'] : null), ops: [], holes: [], cuts: [], inner: [], edges: [], outline: null, base: fv ? fv.cn : null, num: [] };
		M.sawL = t.sL || L; M.sawW = t.sW || W; M.saw = Math.abs(M.sawL - L) > 0.05 || Math.abs(M.sawW - W) > 0.05;
		M.outline = sh.pts ? sh.pts.map(function (p) { return [p[0], my(p[1])]; }) : null;
		M.outer = (sh.outer || []).map(function (e) { return { a: [e.a[0], my(e.a[1])], b: [e.b[0], my(e.b[1])], g: faceB ? -(e.g || 0) : (e.g || 0) }; });
		(sh.innerPts || []).forEach(function (ip, i) {
			var pts = ip.map(function (p) { return [p[0], my(p[1])]; }), b = bbox(pts), r = 0;
			(sh.inner[i] || []).forEach(function (e) { if (e && e.g) { var R = arcR(e); if (R > r) r = R; } });
			M.inner.push({ pts: pts, box: b, r: r });
		});
		(sh.edges || []).forEach(function (e) { M.edges.push({ pts: (e.line || []).map(function (p) { return [p[0], my(p[1])]; }), th: Number(e.th) || 0, mat: e.mat || '', side: e.side ? sideAfter(e.side, faceB) : '', clip: e.clip, al: e.al || 0 }); });
		/* отверстия: лицевой стороны — сплошные, обратной — пунктиром (обратная — зеркало по Y лицевой) */
		if (fv) fv.holes.forEach(function (h) { M.holes.push({ x: h.x, y: h.y, d: h.d, dep: h.dep, back: 0 }); });
		if (bv) bv.holes.forEach(function (h) { M.holes.push({ x: h.x, y: W - h.y, d: h.d, dep: h.dep, back: 1 }); });
		/* пазы и выемки: из панели модели, в оси детали; сторона — по свойству паза БАЗИСа (скрипт 1.8) */
		var parts = st.model.parts || [], part = null, ids = card.ids || t.ids || [];
		for (var i = 0; i < parts.length && !part; i++) if (ids.indexOf(parts[i].id) >= 0) part = parts[i];
		M.cutsOff = [];
		if (part && sh.fr) (part.cuts || []).forEach(function (ct, gi) {
			var els = geom.readEls(ct.path || []), pts = [];
			els.forEach(function (e) { if (!e) return; var tp = geom.tess(e, 0.5); for (var k = pts.length ? 1 : 0; k < tp.length; k++) { var q = geom.toFrameRaw(sh.fr, tp[k]); pts.push([q[0], my(q[1])]); } });
			if (pts.length < 2) return;
			var fs = ct.fs === undefined || ct.fs === null ? -1 : (ct.fs ? 1 : 0);
			if (Dr.grvOff && Dr.grvOff(st, card, gi)) { M.cutsOff.push({ pts: pts, gi: gi, w: Number(ct.pw) || Number(ct.sw) || 0 }); return; }        // паз отключён вручную (1.16)
			M.cuts.push({ gi: gi, pts: pts, w: Number(ct.pw) || Number(ct.sw) || 0, dep: Number(ct.pd) || Number(ct.sh) || Number(ct.th) || 0, name: String(ct.name || '').replace(/\s+/g, ' ').trim(), len: Number(ct.len) || 0,
						  face: fs < 0 ? '' : ((fs === 1) === !faceB ? 'лицевая' : 'обратная') });
		});
		M.grain = P.grainOf(st, t, card.mat);
		try { M.place = Dr.place ? Dr.place(st, card, faceB) : null; } catch (e) { M.place = null; }
		ops(M);
		return M;
	};
	function isFront(M, e) { return Dr.isFront(M.lab, e.side); }
	function sideAfter(sd, faceB) { return faceB ? ({ T: 'B', B: 'T' }[sd] || sd) : sd; }
	function bbox(pts) { var b = { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity }; pts.forEach(function (p) { b.x1 = Math.min(b.x1, p[0]); b.y1 = Math.min(b.y1, p[1]); b.x2 = Math.max(b.x2, p[0]); b.y2 = Math.max(b.y2, p[1]); }); return b; }
	function arcR(e) { var dx = e.b[0] - e.a[0], dy = e.b[1] - e.a[1], c = Math.sqrt(dx * dx + dy * dy), g = Math.abs(e.g); return g ? c * (1 + g * g) / (4 * g) : 0; }
	/* середина дуги (из двух возможных — та, что ближе к самому контуру) */
	function arcMid(e, pts) {
		var mx = (e.a[0] + e.b[0]) / 2, my2 = (e.a[1] + e.b[1]) / 2, dx = e.b[0] - e.a[0], dy = e.b[1] - e.a[1], c = Math.sqrt(dx * dx + dy * dy) || 1, s = e.g * c / 2;
		var n = [-dy / c, dx / c], m1 = [mx + n[0] * s, my2 + n[1] * s], m2 = [mx - n[0] * s, my2 - n[1] * s];
		if (!pts || !pts.length) return m1;
		function dist(m) { var best = Infinity; pts.forEach(function (p) { var d = (p[0] - m[0]) * (p[0] - m[0]) + (p[1] - m[1]) * (p[1] - m[1]); if (d < best) best = d; }); return best; }
		return dist(m1) <= dist(m2) ? m1 : m2;
	}
	function sideWord(M, sd) { return (M.lab && M.lab[sd]) || { T: 'верхнего края', B: 'нижнего края', L: 'левого края', R: 'правого края' }[sd]; }
	/* где на детали: «угол ПЕРЕД–СЛЕВА», «край ЗАД» — по подписям краёв */
	function where(M, x, y) {
		var lab = M.lab || {}, nx = x < M.L * 0.2 ? 'L' : (x > M.L * 0.8 ? 'R' : ''), ny = y < M.W * 0.2 ? 'T' : (y > M.W * 0.8 ? 'B' : '');
		var n = function (sd) { return lab[sd] || { T: 'верхний край', B: 'нижний край', L: 'левый край', R: 'правый край' }[sd]; };
		if (nx && ny) return lab[ny] && lab[nx] ? 'угол ' + lab[ny] + '–' + lab[nx] : 'угол ' + { TL: 'левый верхний', TR: 'правый верхний', BL: 'левый нижний', BR: 'правый нижний' }[ny + nx];
		if (ny) return lab[ny] ? 'край ' + lab[ny] : n(ny);
		if (nx) return lab[nx] ? 'край ' + lab[nx] : n(nx);
		return 'в поле детали';
	}
	/* отступы прямоугольника от ближайших краёв детали: [[край, мм], [край, мм]] */
	function nearest(M, b) {
		var dl = b.x1, dr = M.L - b.x2, dt = b.y1, db = M.W - b.y2;
		return [dl <= dr ? ['L', dl] : ['R', dr], dt <= db ? ['T', dt] : ['B', db]];
	}
	function offText(M, nr) { return nr.map(function (q) { return num(Math.max(0, q[1])) + ' от ' + sideWord(M, q[0]); }).join(', '); }
	/* по изделию: от пола (нуля по высоте БАЗИСа) и от стены (задней плоскости изделия) — по самой низкой и самой
	   близкой к стене точке */
	function bluePts(M, pts) {
		if (!M.place) return '';
		var h = Infinity, w = Infinity;
		pts.forEach(function (p) { var a = M.place.h(p[0], p[1]), b = M.place.wall(p[0], p[1]); if (a < h) h = a; if (b !== null && b < w) w = b; });
		var out = [];
		if (isFinite(h)) out.push('от пола ' + num(h));
		if (isFinite(w)) out.push('от стены ' + num(Math.max(0, w)));
		return out.join(' · ');
	}
	function boxPts(b) { return [[b.x1, b.y1], [b.x2, b.y1], [b.x2, b.y2], [b.x1, b.y2]]; }
	/* вырезы по краю у фигуры из прямых по осям: клетки сетки габарита вне контура, связные — один вырез */
	function notches(M) {
		var xs = M.chain.xs, ys = M.chain.ys, out = [], seen = {}, nx = xs.length - 1, ny = ys.length - 1, i, j;
		function inside(x, y) { var c = false, p = M.outline; for (var a = 0, b = p.length - 1; a < p.length; b = a++) if (((p[a][1] > y) !== (p[b][1] > y)) && (x < (p[b][0] - p[a][0]) * (y - p[a][1]) / (p[b][1] - p[a][1]) + p[a][0])) c = !c; return c; }
		var outC = {};
		for (i = 0; i < nx; i++) for (j = 0; j < ny; j++) if (!inside((xs[i] + xs[i + 1]) / 2, (ys[j] + ys[j + 1]) / 2)) outC[i + ',' + j] = 1;
		Object.keys(outC).forEach(function (k) {
			if (seen[k]) return;
			var st = [k], b = { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity };
			seen[k] = 1;
			while (st.length) {
				var c = st.pop().split(',').map(Number);
				b.x1 = Math.min(b.x1, xs[c[0]]); b.x2 = Math.max(b.x2, xs[c[0] + 1]); b.y1 = Math.min(b.y1, ys[c[1]]); b.y2 = Math.max(b.y2, ys[c[1] + 1]);
				[[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) { var q = (c[0] + d[0]) + ',' + (c[1] + d[1]); if (outC[q] && !seen[q]) { seen[q] = 1; st.push(q); } });
			}
			if (b.x2 - b.x1 > 0.5 && b.y2 - b.y1 > 0.5) out.push(b);
		});
		return out;
	}
	/* Список обработок: радиусы, скосы, фигурный контур, вырезы, пазы, большие отверстия, кромка, отверстия.
	   Вырезы, пазы и отверстия больше Ø 35 получают номер — тот же, что в списке, на чертеже и в выносах. */
	function ops(M) {
		var L = M.L, W = M.W, out = M.ops, rs = {}, curves = 0;
		M.feat = [];
		M.outer.forEach(function (e) {
			if (e.g) {
				var R = arcR(e), m = arcMid(e, M.outline);
				if (R > 0.4 && R < Math.max(L, W) * 2) { var k = Math.round(R * 10) / 10, f = { kind: 'r', R: k, at: m, a: e.a, b: e.b }; f.tan = tangents(M, f); (rs[k] = rs[k] || []).push(f); M.feat.push(f); }
				else curves++;
				return;
			}
			var dx = Math.abs(e.b[0] - e.a[0]), dy = Math.abs(e.b[1] - e.a[1]);
			if (dx > 0.5 && dy > 0.5) { var mm = [(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2]; out.push({ what: 'Скос', size: num(dx) + ' × ' + num(dy), where: where(M, mm[0], mm[1]), side: '—' }); M.feat.push({ kind: 'c', dx: dx, dy: dy, at: mm, a: e.a, b: e.b }); }
		});
		Object.keys(rs).forEach(function (k) {
			var l = rs[k];
			l.slice().reverse().forEach(function (f) {
				var tt = f.tan.map(function (q) { return num(q.v) + ' от ' + sideWord(M, q.from); }).join(', ');
				out.unshift({ what: 'Радиус', size: 'R' + num(Number(k)), where: where(M, f.at[0], f.at[1]) + (tt ? ': ' + tt : ''), side: '—' });
			});
		});
		if (curves) out.push({ what: 'Фигурный контур', size: '', where: 'по чертежу', side: '—' });
		else if (M.outline && !M.feat.length) {
			/* контур из прямых по осям (Г-образная, с выступом): вырезы по краю и цепочки размеров на чертеже */
			var ux = uniq(M.outline.map(function (p) { return p[0]; })), uy = uniq(M.outline.map(function (p) { return p[1]; }));
			if (ux.length > 2 || uy.length > 2) {
				M.chain = { xs: ux, ys: uy };
				var ns = notches(M);
				if (ns.length) ns.forEach(function (b) { var f = { kind: 'notch', box: b }; M.num.push(f); out.push({ what: 'Вырез по краю', size: num(b.x2 - b.x1) + ' × ' + num(b.y2 - b.y1), where: where(M, (b.x1 + b.x2) / 2, (b.y1 + b.y2) / 2), side: 'насквозь', ref: f }); f.blue = bluePts(M, boxPts(b)); });
				else out.push({ what: 'Форма', size: 'по цепочке размеров', where: (ux.length - 1) + ' × ' + (uy.length - 1) + ' участков', side: '—' });
			}
		}
		M.inner.forEach(function (c) {
			var b = c.box, f = { kind: 'cut', box: b, r: c.r, pts: c.pts };
			f.near = nearest(M, b); f.blue = bluePts(M, boxPts(b));
			M.num.push(f);
			out.push({ what: 'Вырез', size: num(b.x2 - b.x1) + ' × ' + num(b.y2 - b.y1) + (c.r ? ', R' + num(c.r) : ''), where: offText(M, f.near), side: 'насквозь', ref: f });
		});
		M.cuts.forEach(function (c) {
			var b = bbox(c.pts), horiz = (b.x2 - b.x1) >= (b.y2 - b.y1), what = /четверт/i.test(c.name) ? 'Четверть' : (/выем/i.test(c.name) ? 'Выемка' : 'Паз');
			var off = horiz ? Math.min((b.y1 + b.y2) / 2, W - (b.y1 + b.y2) / 2) : Math.min((b.x1 + b.x2) / 2, L - (b.x1 + b.x2) / 2);
			var near = horiz ? ((b.y1 + b.y2) / 2 < W / 2 ? 'T' : 'B') : ((b.x1 + b.x2) / 2 < L / 2 ? 'L' : 'R');
			if (c.w && off <= c.w / 2 + 0.6 && what === 'Паз') what = 'Четверть';
			var len = horiz ? b.x2 - b.x1 : b.y2 - b.y1, full = len >= (horiz ? L : W) - 1;
			c.what = what; c.horiz = horiz; c.near = near; c.off = Math.max(0, off - c.w / 2); c.full = full; c.lenV = len;
			var f = { kind: 'groove', c: c, box: b };
			M.num.push(f);
			out.push({ what: what + (c.name && !/^(паз|четверть|выемка)$/i.test(c.name) ? ' «' + c.name + '»' : ''), size: (c.w ? num(c.w) + ' × ' + num(c.dep) : num(c.dep)),
					   where: (what === 'Четверть' ? 'вдоль ' + sideWord(M, near) : num(c.off) + ' от ' + sideWord(M, near)) + (full ? ', на всю ' + (horiz ? 'длину' : 'ширину') : ', длина ' + num(len)),
					   side: c.face || 'по БАЗИСу', ref: f });
		});
		M.holes.filter(function (h) { return h.d > 35.05; }).forEach(function (h) {
			var b = { x1: h.x - h.d / 2, y1: h.y - h.d / 2, x2: h.x + h.d / 2, y2: h.y + h.d / 2 }, f = { kind: 'hole', h: h, box: b };
			f.near = nearest(M, b); f.blue = bluePts(M, boxPts(b));
			M.num.push(f);
			out.push({ what: 'Отверстие', size: 'Ø' + num(h.d) + (h.dep ? ' × ' + num(h.dep) : ', насквозь'), where: 'центр: ' + offText(M, nearest(M, { x1: h.x, y1: h.y, x2: h.x, y2: h.y })), side: h.dep ? (h.back ? 'обратная' : 'лицевая') : 'насквозь', ref: f });
		});
		var es = {};
		M.edges.forEach(function (e) {
			var k = (isFront(M, e) ? 'F' : '') + num(e.th) + ' мм' + (e.clip === 1 ? ' · подрез' : '') + (e.al > 0 ? ' · припуск ' + num(e.al) : '') + (e.mat ? ' · ' + e.mat : '');
			(es[k] = es[k] || []).push(e.side ? (M.lab && M.lab[e.side] ? M.lab[e.side] : sideWord(M, e.side)) : 'по кривой');
		});
		Object.keys(es).forEach(function (k) { var l = es[k].filter(function (v, i, a) { return a.indexOf(v) === i; }); out.push({ what: k.charAt(0) === 'F' ? 'Лицевая кромка' : 'Кромка', size: k.replace(/^F/, ''), where: l.join(', '), side: '—' }); });
		var hs = {};
		M.holes.filter(function (h) { return !(h.d > 35.05); }).forEach(function (h) { var k = 'Ø' + num(h.d) + (h.dep ? ' × ' + num(h.dep) : ' скв.') + '|' + (h.back ? 'обратная' : 'лицевая'); hs[k] = (hs[k] || 0) + 1; });
		Object.keys(hs).forEach(function (k) { var p2 = k.split('|'); out.push({ what: 'Отверстия × ' + hs[k], size: p2[0], where: 'см. карту присадки', side: p2[1], hole: 1 }); });
		out.forEach(function (o, i) { if (o.ref) o.ref.n = i + 1; });
		M.num.sort(function (a, b) { return a.n - b.n; });
	}
	/* Радиус: где начинается — на каждом из двух краёв, от дальнего края (как принято: «373 от верха, 73 от
	   правого края»). Точка касания на вертикальном краю меряется по Y, на горизонтальном — по X. */
	function tangents(M, f) {
		var out = [], t = 0.8;
		[[f.a, f.b], [f.b, f.a]].forEach(function (pq) {
			var p = pq[0], q = pq[1];
			if (Math.abs(p[0]) < t || Math.abs(p[0] - M.L) < t) {
				if (p[1] < t || p[1] > M.W - t) return;
				if (q[1] > p[1]) out.push({ axis: 'y', from: 'T', v: p[1], p: p, edge: Math.abs(p[0]) < t ? 'L' : 'R' });
				else out.push({ axis: 'y', from: 'B', v: M.W - p[1], p: p, edge: Math.abs(p[0]) < t ? 'L' : 'R' });
			} else if (Math.abs(p[1]) < t || Math.abs(p[1] - M.W) < t) {
				if (p[0] < t || p[0] > M.L - t) return;
				if (q[0] < p[0]) out.push({ axis: 'x', from: 'R', v: M.L - p[0], p: p, edge: Math.abs(p[1]) < t ? 'T' : 'B' });
				else out.push({ axis: 'x', from: 'L', v: p[0], p: p, edge: Math.abs(p[1]) < t ? 'T' : 'B' });
			}
		});
		return out;
	}
	function uniq(a) { var r = []; a.slice().sort(function (p, q) { return p - q; }).forEach(function (v) { if (!r.length || Math.abs(v - r[r.length - 1]) > 0.5) r.push(Math.round(v * 10) / 10); }); return r; }

	/* ============================== чертёж ============================== */

	/* Чертёж детали в окне w × h (мм): масштаб — самый крупный из стандартных, при котором входит с полями. */
	function drawPart(M, c, x0, y0, w, h, boxes) {
		var hasR = M.feat.some(function (f) { return f.kind === 'r' && f.tan.length; });
		var mT = 16, mL = 16, mB = (M.chain || hasR) ? 16 : 9, mR = (M.chain || hasR) ? 16 : 9, s = SCALES[SCALES.length - 1];
		for (var k = 0; k < SCALES.length; k++) if (M.L * SCALES[k] <= w - mL - mR && M.W * SCALES[k] <= h - mT - mB - CAPH) { s = SCALES[k]; break; }
		var pw = M.L * s, ph = M.W * s, px = x0 + mL, py = y0 + CAPH + mT, g = [];
		function X(x) { return px + x * s; } function Y(y) { return py + y * s; }
		function box(x, y, bw, bh, kind, text) { var b = { x: x, y: y, w: bw, h: bh, kind: kind, text: text }; boxes.push(b); return b; }
		function free(b) { if (b.x < x0 - 0.01 || b.y < y0 - 0.01 || b.x + b.w > x0 + w + 0.01 || b.y + b.h > y0 + h + 0.01) return false; for (var q = 0; q < boxes.length; q++) if (hit(b, boxes[q], 0.4)) return false; return true; }
		var cap = 'Лицевая сторона · М ' + scaleText(s);
		g.push(txt(x0, y0 + CAPH - 1.8, cap, { fs: FSN, fill: '#222' })); box(x0, y0 + CAPH - 1.8 - FSN * CAPF, tw(cap) * FSN, FSN * 0.8, 'cap', cap);
		/* контур */
		if (M.outline) g.push('<path d="' + M.outline.map(function (p, q) { return (q ? 'L' : 'M') + f2(X(p[0])) + ' ' + f2(Y(p[1])); }).join(' ') + ' Z" fill="#fff" stroke="#000" stroke-width="0.18"/>');
		else g.push('<rect x="' + f2(px) + '" y="' + f2(py) + '" width="' + f2(pw) + '" height="' + f2(ph) + '" fill="#fff" stroke="#000" stroke-width="0.18"/>');
		/* вырезы — оранжевым */
		M.inner.forEach(function (ci) { g.push('<path d="' + ci.pts.map(function (p, q) { return (q ? 'L' : 'M') + f2(X(p[0])) + ' ' + f2(Y(p[1])); }).join(' ') + ' Z" fill="#fff8f1" stroke="' + CUT + '" stroke-width="0.3"/>'); });
		M.num.forEach(function (f) { if (f.kind === 'notch') { var b = f.box; g.push('<rect x="' + f2(X(b.x1)) + '" y="' + f2(Y(b.y1)) + '" width="' + f2((b.x2 - b.x1) * s) + '" height="' + f2((b.y2 - b.y1) * s) + '" fill="#fff8f1" fill-opacity="0.6" stroke="' + CUT + '" stroke-width="0.2" stroke-dasharray="1 0.6"/>'); } });
		/* кромка: лицевая (край ПЕРЕД) — красная, остальная — зелёная */
		if (c.edge) M.edges.forEach(function (e) { if (e.pts.length > 1) g.push('<polyline points="' + e.pts.map(function (p) { return f2(X(p[0])) + ',' + f2(Y(p[1])); }).join(' ') + '" fill="none" stroke="' + (isFront(M, e) ? FRONT : GREEN) + '" stroke-width="' + (isFront(M, e) ? 0.8 : 0.6) + '" stroke-linecap="round"/>'); });
		/* пазы — оранжевым пунктиром шириной паза */
		M.cuts.forEach(function (ct) { g.push('<polyline points="' + ct.pts.map(function (p) { return f2(X(p[0])) + ',' + f2(Y(p[1])); }).join(' ') + '" fill="none" stroke="' + CUT + '" stroke-opacity="0.55" stroke-width="' + f2(Math.max(0.35, ct.w * s)) + '" stroke-dasharray="1.6 0.8"/>'); });
		/* в окне: паз — щелчком отключить; отключённый — бледно-серым, щелчок вернёт (на бумаге его нет) */
		if (c.inter) {
			var gpl = function (ct) { return ct.pts.map(function (p) { return f2(X(p[0])) + ',' + f2(Y(p[1])); }).join(' '); };
			(M.cutsOff || []).forEach(function (ct) { g.push('<polyline class="gvo" points="' + gpl(ct) + '" fill="none" stroke="#9aa3ab" stroke-opacity="0.6" stroke-width="' + f2(Math.max(0.35, ct.w * s)) + '" stroke-dasharray="0.6 0.9"/>'); });
			M.cuts.concat(M.cutsOff || []).forEach(function (ct) { var off = (M.cutsOff || []).indexOf(ct) >= 0; g.push('<polyline class="gv" data-gi="' + ct.gi + '" points="' + gpl(ct) + '" fill="none" stroke="' + CUT + '" stroke-opacity="0" stroke-width="' + f2(Math.max(2.4, ct.w * s + 1.6)) + '"><title>' + (off ? 'Паз отключён — щелчок вернёт' : 'Отключить этот паз (ещё щелчок — вернуть)') + '</title></polyline>'); });
		}
		/* отверстия; больше Ø 35 — оранжевым */
		if (c.holes) M.holes.forEach(function (hh) { var r = Math.max(0.5, hh.d * s / 2), big = hh.d > 35.05; g.push('<circle cx="' + f2(X(hh.x)) + '" cy="' + f2(Y(hh.y)) + '" r="' + f2(r) + '" fill="#fff" stroke="' + (big ? CUT : '#000') + '" stroke-width="' + (big ? 0.3 : (hh.back ? 0.1 : 0.15)) + '"' + (hh.back ? ' stroke-dasharray="0.6 0.4"' : '') + '/>'); box(X(hh.x) - r, Y(hh.y) - r, 2 * r, 2 * r, 'hole', ''); });
		/* номера — в середине выреза / у паза / у большого отверстия */
		M.num.forEach(function (f) {
			var b = f.box, r = Math.max(1.5, FS * 0.62), cx = X((b.x1 + b.x2) / 2), cy = Y((b.y1 + b.y2) / 2), cands;
			if (f.kind === 'groove') { var m = f.c.pts[Math.floor(f.c.pts.length / 2)]; cx = X(m[0]); cy = Y(m[1]); cands = [[0, -r - 1.2], [0, r + 1.2], [r + 1.4, 0], [-r - 1.4, 0], [6, -r - 1.2], [-6, -r - 1.2]]; }
			else if (f.kind === 'hole') cands = [[0, 0], [r * 2.2, -r * 2.2], [-r * 2.2, -r * 2.2]];
			else cands = [[0, 0], [0, -r * 2.4], [r * 2.4, 0]];
			for (var q = 0; q < cands.length; q++) { var bb = { x: cx + cands[q][0] - r, y: cy + cands[q][1] - r, w: 2 * r, h: 2 * r }; if (!free(bb)) continue; g.push(badge(cx + cands[q][0], cy + cands[q][1], f.n, r)); box(bb.x, bb.y, bb.w, bb.h, 'num', String(f.n)); break; }
		});
		/* вырезы и пазы — заняты: дальше в них не ставим ни стрелку текстуры, ни подписи */
		M.num.forEach(function (f) { var b = f.box, gw = f.kind === 'groove' ? Math.max(0.6, (f.c.w || 1) * s) / 2 : 0; boxes.push({ x: X(b.x1) - gw, y: Y(b.y1) - gw, w: (b.x2 - b.x1) * s + 2 * gw, h: (b.y2 - b.y1) * s + 2 * gw, kind: 'zone', text: '' }); });
		/* размер: засечки, выносные линии, надпись — только если надпись встала */
		function dimH(xa, xb, y, yFrom, label, col) {
			var tw0 = tw(label) * FS, b = { x: (xa + xb) / 2 - tw0 / 2, y: y - 0.9 - FS * CAPF, w: tw0, h: FS * CAPF + 0.3 };
			if (!free(b)) return false;
			col = col || '#000';
			g.push(line(xa, yFrom, xa, y - (y > yFrom ? -1 : 1), 0.08, col === '#000' ? '#666' : col) + line(xb, yFrom, xb, y - (y > yFrom ? -1 : 1), 0.08, col === '#000' ? '#666' : col) + line(xa, y, xb, y, 0.1, col) + arrow(xa, y, 1, 0, col) + arrow(xb, y, -1, 0, col));
			g.push(txt((xa + xb) / 2, y - 0.9, label, { anchor: 'middle', fill: col === '#000' ? null : col })); box(b.x, b.y, b.w, b.h, 'dim', label);
			return true;
		}
		function dimV(ya, yb, x, xFrom, label, col) {
			var tw0 = tw(label) * FS, b = { x: x - 0.9 - FS * CAPF, y: (ya + yb) / 2 - tw0 / 2, w: FS * CAPF + 0.3, h: tw0 };
			if (!free(b)) return false;
			col = col || '#000';
			g.push(line(xFrom, ya, x - (x > xFrom ? -1 : 1), ya, 0.08, col === '#000' ? '#666' : col) + line(xFrom, yb, x - (x > xFrom ? -1 : 1), yb, 0.08, col === '#000' ? '#666' : col) + line(x, ya, x, yb, 0.1, col) + arrow(x, ya, 0, 1, col) + arrow(x, yb, 0, -1, col));
			g.push(txt(x - 0.9, (ya + yb) / 2, label, { anchor: 'middle', rot: 1, fill: col === '#000' ? null : col })); box(b.x, b.y, b.w, b.h, 'dim', label);
			return true;
		}
		/* подписи краёв (где в изделии) — дальше размеров */
		if (M.lab) ['T', 'B', 'L', 'R'].forEach(function (sd) {
			var bd = M.edges.some(function (e) { return e.side === sd; }), fr = bd && Dr.isFront(M.lab, sd), t = M.lab[sd] || (fr ? 'лицевая' : '');
			if (!t) return;
			if (bd && c.edge && t !== 'лицевая') t += fr ? ' · лицевая кромка' : ' · кромка';
			else if (t === 'лицевая') t = 'лицевая кромка';
			var wt = tw(t, true) * FSE, hc = FSE * CAPF, b;
			if (sd === 'T' || sd === 'B') { var cy = sd === 'T' ? py - mT + hc + 0.6 : py + ph + mB - 1.2; b = { x: px + pw / 2 - wt / 2, y: cy - hc, w: wt, h: hc + 0.2 }; if (wt < pw && free(b)) { g.push(txt(px + pw / 2, cy, t, { fs: FSE, anchor: 'middle', bold: 1, fill: fr && c.edge ? FRONT : GREEN })); box(b.x, b.y, b.w, b.h, 'edge', t); } }
			else { var cx = sd === 'L' ? px - mL + hc + 0.6 : px + pw + mR - 1.2; b = { x: cx - hc, y: py + ph / 2 - wt / 2, w: hc + 0.2, h: wt }; if (wt < ph && free(b)) { g.push(txt(cx, py + ph / 2, t, { fs: FSE, anchor: 'middle', bold: 1, fill: fr && c.edge ? FRONT : GREEN, rot: 1 })); box(b.x, b.y, b.w, b.h, 'edge', t); } }
		});
		if (c.dims) {
			/* габарит — пильный размер (если кромка с подрезом или припуском его меняет) */
			dimH(px, px + pw, py - 6.5, py - 0.5, num(M.sawL));
			dimV(py, py + ph, px - 6.5, px - 0.5, num(M.sawW));
			/* форма из прямых по осям — цепочки размеров снизу и справа */
			if (M.chain) {
				var xs = M.chain.xs, ys = M.chain.ys, q2;
				if (xs.length > 2) for (q2 = 0; q2 + 1 < xs.length; q2++) dimH(X(xs[q2]), X(xs[q2 + 1]), py + ph + 6.5, py + ph + 0.5, num(xs[q2 + 1] - xs[q2]));
				if (ys.length > 2) for (q2 = 0; q2 + 1 < ys.length; q2++) dimV(Y(ys[q2]), Y(ys[q2 + 1]), px + pw + 6.5 + FS * CAPF + 1, px + pw + 0.5, num(ys[q2 + 1] - ys[q2]));
			}
			/* радиусы — R выноской и где начинается радиус: от дальнего края по каждому краю (оранжевым) */
			M.feat.forEach(function (f) {
				var ax = X(f.at[0]), ay = Y(f.at[1]), label = f.kind === 'r' ? 'R' + num(f.R) : 'скос ' + num(f.dx) + ' × ' + num(f.dy), col = f.kind === 'r' ? CUT : '#000';
				var lw = tw(label) * FS, lh = FS * CAPF + 0.3, cx = px + pw / 2, cy = py + ph / 2, dx = ax < cx ? -1 : 1, dy = ay < cy ? -1 : 1;
				var cands = [[dx * 6, dy * 6], [dx * 9, dy * 3], [dx * 3, dy * 9], [-dx * 6, dy * 6], [dx * 6, -dy * 6], [dx * 12, 0], [0, dy * 10]];
				for (var q = 0; q < cands.length; q++) {
					var ex = ax + cands[q][0], ey = ay + cands[q][1], b = { x: cands[q][0] < 0 ? ex - lw - 0.6 : ex + 0.6, y: ey - lh / 2, w: lw, h: lh };
					if (!free(b)) continue;
					g.push(line(ax, ay, ex, ey, 0.1, col) + '<circle cx="' + f2(ax) + '" cy="' + f2(ay) + '" r="0.3" fill="' + col + '"/>' + txt(cands[q][0] < 0 ? ex - 0.6 : ex + 0.6, ey + lh / 2 - 0.3, label, { anchor: cands[q][0] < 0 ? 'end' : 'start', fill: col === '#000' ? null : col }));
					box(b.x, b.y, b.w, b.h, 'dim', label);
					break;
				}
				if (f.kind !== 'r') return;
				f.tan.forEach(function (t) {
					var lab = num(t.v), offs = [11.5, 13.5, 9.5];
					for (var q = 0; q < offs.length; q++) {
						var ok;
						if (t.axis === 'y') { var xx = t.edge === 'L' ? px - offs[q] : px + pw + offs[q] + FS * CAPF, ya = t.from === 'T' ? py : Y(t.p[1]), yb = t.from === 'T' ? Y(t.p[1]) : py + ph; ok = dimV(ya, yb, xx, t.edge === 'L' ? px - 0.5 : px + pw + 0.5, lab, CUT); }
						else { var yy = t.edge === 'T' ? py - offs[q] : py + ph + offs[q] + FS * CAPF, xa = t.from === 'L' ? px : X(t.p[0]), xb = t.from === 'L' ? X(t.p[0]) : px + pw; ok = dimH(xa, xb, yy, t.edge === 'T' ? py - 0.5 : py + ph + 0.5, lab, CUT); }
						if (ok) break;
					}
				});
			});
			/* вырезы и большие отверстия: отступы от ближайших краёв — оранжевым */
			M.num.forEach(function (f) {
				if (f.kind !== 'cut' && f.kind !== 'hole') return;
				var b = f.box, nr = f.near, mx = Y((b.y1 + b.y2) / 2), mxx = X((b.x1 + b.x2) / 2);
				nr.forEach(function (q) {
					if (q[1] * s < 3) return;
					if (q[0] === 'L') dimH(px, X(b.x1), mx, mx, num(q[1]), CUT);
					if (q[0] === 'R') dimH(X(b.x2), px + pw, mx, mx, num(q[1]), CUT);
					if (q[0] === 'T') dimV(py, Y(b.y1), mxx, mxx, num(q[1]), CUT);
					if (q[0] === 'B') dimV(Y(b.y2), py + ph, mxx, mxx, num(q[1]), CUT);
				});
			});
		}
		/* текстура — стрелка в свободном месте поля детали */
		if (c.edge && M.grain !== 'n') {
			var al = Math.min(18, (M.grain === 'w' ? ph : pw) * 0.3), lt = 'текстура', ltw = tw(lt) * FSE;
			for (var fy = 0.25; fy <= 0.8; fy += 0.11) for (var fx = 0.12; fx <= 0.7; fx += 0.14) {
				var sx = px + pw * fx, sy = py + ph * fy, ex = M.grain === 'w' ? sx : sx + al, ey = M.grain === 'w' ? sy + al : sy;
				var bb2 = { x: Math.min(sx, ex) - 1, y: Math.min(sy, ey) - FSE - 1, w: Math.max(Math.abs(ex - sx), ltw) + 2, h: Math.abs(ey - sy) + FSE + 2 };
				if (bb2.x + bb2.w > px + pw || bb2.y + bb2.h > py + ph || !free(bb2)) continue;
				g.push(line(sx, sy, ex, ey, 0.2, TEX) + arrow(ex, ey, M.grain === 'w' ? 0 : -1, M.grain === 'w' ? -1 : 0, TEX) + txt(sx, sy - 1.2, lt, { fs: FSE, fill: TEX }));
				box(bb2.x, bb2.y, bb2.w, bb2.h, 'tex', lt);
				fy = 9; break;
			}
		}
		/* лицевая кромка вручную: щелчок по краю (только в окне) */
		if (c.inter) ['T', 'B', 'L', 'R'].forEach(function (sd) {
			var x1 = sd === 'R' ? px + pw : px, y1 = sd === 'B' ? py + ph : py, x2 = sd === 'L' ? px : px + pw, y2 = sd === 'T' ? py : py + ph, s0 = M.faceB ? ({ T: 'B', B: 'T' }[sd] || sd) : sd;
			g.push('<line class="fe" data-sd="' + s0 + '" x1="' + f2(x1) + '" y1="' + f2(y1) + '" x2="' + f2(x2) + '" y2="' + f2(y2) + '" stroke="#d62828" stroke-opacity="0" stroke-width="2.4"><title>Сделать этот край лицевым (ещё щелчок — снять)</title></line>');
		});
		return { svg: g.join(''), s: s, x: px, y: py, w: pw, h: ph };
	}
	function arrow(x, y, ux, uy, col) { var k = 1.2, w = 0.38; return '<path d="M' + f2(x) + ' ' + f2(y) + 'L' + f2(x + ux * k - uy * w) + ' ' + f2(y + uy * k + ux * w) + 'L' + f2(x + ux * k + uy * w) + ' ' + f2(y + uy * k - ux * w) + 'Z" fill="' + (col || '#000') + '"/>'; }

	/* ============================ выносы и карточки ============================ */
	var UID = 0;
	function kindWord(f) { return { cut: 'вырез', notch: 'вырез по краю', groove: (f.c && f.c.what || 'паз').toLowerCase(), hole: 'отверстие' }[f.kind] || 'вырез'; }
	/* Строки под выносом: где (оранжевым) и по изделию (синим). */
	function featLines(M, f) {
		var o = [];
		if (f.kind === 'cut' || f.kind === 'hole') o.push([offText(M, f.near), CUT]);
		if (f.kind === 'notch') o.push([where(M, (f.box.x1 + f.box.x2) / 2, (f.box.y1 + f.box.y2) / 2), CUT]);
		if (f.kind === 'groove') { var c = f.c; o.push([(c.what === 'Четверть' ? 'вдоль ' + sideWord(M, c.near) : num(c.off) + ' от ' + sideWord(M, c.near)) + (c.full ? ', на всю ' + (c.horiz ? 'длину' : 'ширину') : ', длина ' + num(c.lenV)), CUT]); o.push(['сторона: ' + (c.face || 'по БАЗИСу'), '#333']); }
		if (f.blue) o.push([f.blue, BLUE]);
		return o;
	}
	/* Выносной вид: участок детали вокруг выреза крупно — размер, радиус, отступы; паз — разрез. */
	function callout(M, f, x, y, w, h) {
		var g = [], id = 'kc' + (++UID), usedH = h, ttl = circNum(f.n) + ' ' + kindWord(f);
		g.push(txt(x, y + FSN * CAPF, ttl, { fs: FSN, bold: 1 }));
		var wy = y + FSN + 1.2, wh = h - (FSN + 1.2), wx = x, ww = w;
		if (f.kind === 'groove') {
			/* разрез поперёк паза: толщина детали, паз шириной w и глубиной dep со своей стороны */
			var c = f.c, th = M.th || 16, cw = Math.max(c.w, 1), span = Math.max(cw * 4, th * 3, 40), k = Math.min((ww - 8) / span, (wh - 10) / th, 3);
			var sx = wx + 4, sy = wy + 5, sw = span * k, sh = th * k, top = c.face !== 'обратная';
			var gx = sx + (span / 2 - cw / 2) * k, gw = cw * k, gd = Math.min(c.dep, th) * k;
			if (c.what === 'Четверть') gx = sx;
			g.push('<rect x="' + f2(sx) + '" y="' + f2(sy) + '" width="' + f2(sw) + '" height="' + f2(sh) + '" fill="#f3efe9" stroke="#000" stroke-width="0.15"/>');
			g.push('<rect x="' + f2(gx) + '" y="' + f2(top ? sy : sy + sh - gd) + '" width="' + f2(gw) + '" height="' + f2(gd) + '" fill="#fff" stroke="' + CUT + '" stroke-width="0.3"/>');
			g.push(txt(sx + sw, sy - 0.8, top ? 'лицевая ↑' : '', { anchor: 'end', fs: FS * 0.85, fill: '#666' }));
			g.push(txt(gx + gw / 2, top ? sy + gd + FS * CAPF + 1.2 : sy + sh - gd - 1, num(c.w) + ' × ' + num(c.dep), { anchor: 'middle', fill: CUT, fs: FS * 0.9 }));
			g.push(txt(sx, sy + sh + FS * CAPF + 1.4, 'разрез · толщина ' + num(th), { fs: FS * 0.85, fill: '#666' }));
			usedH = sy + sh + FS + 2 - y;
		} else {
			/* участок детали вокруг выреза */
			var b = f.box, bw = b.x2 - b.x1, bh = b.y2 - b.y1, mg = Math.max(30, 0.45 * Math.max(bw, bh));
			var r0 = { x1: Math.max(0, b.x1 - mg), y1: Math.max(0, b.y1 - mg), x2: Math.min(M.L, b.x2 + mg), y2: Math.min(M.W, b.y2 + mg) };
			var k2 = Math.min((ww - 9) / (r0.x2 - r0.x1), (wh - 9) / (r0.y2 - r0.y1)), ox = wx + 6 - r0.x1 * k2, oy = wy + 5 - r0.y1 * k2;
			var Xc = function (v) { return ox + v * k2; }, Yc = function (v) { return oy + v * k2; };
			g.push('<clipPath id="' + id + '"><rect x="' + f2(Xc(r0.x1)) + '" y="' + f2(Yc(r0.y1)) + '" width="' + f2((r0.x2 - r0.x1) * k2) + '" height="' + f2((r0.y2 - r0.y1) * k2) + '"/></clipPath>');
			var outl = M.outline || [[0, 0], [M.L, 0], [M.L, M.W], [0, M.W]];
			g.push('<g clip-path="url(#' + id + ')"><path d="' + outl.map(function (p, q) { return (q ? 'L' : 'M') + f2(Xc(p[0])) + ' ' + f2(Yc(p[1])); }).join(' ') + ' Z" fill="#f3efe9" stroke="#000" stroke-width="0.2"/>');
			M.edges.forEach(function (e) { if (e.pts.length > 1) g.push('<polyline points="' + e.pts.map(function (p) { return f2(Xc(p[0])) + ',' + f2(Yc(p[1])); }).join(' ') + '" fill="none" stroke="' + (isFront(M, e) ? FRONT : GREEN) + '" stroke-width="0.6"/>'); });
			g.push('</g>');
			if (f.kind === 'hole') g.push('<circle cx="' + f2(Xc(f.h.x)) + '" cy="' + f2(Yc(f.h.y)) + '" r="' + f2(f.h.d / 2 * k2) + '" fill="#fff" stroke="' + CUT + '" stroke-width="0.3"/>');
			else if (f.pts) g.push('<path d="' + f.pts.map(function (p, q) { return (q ? 'L' : 'M') + f2(Xc(p[0])) + ' ' + f2(Yc(p[1])); }).join(' ') + ' Z" fill="#fff" stroke="' + CUT + '" stroke-width="0.3"/>');
			else g.push('<rect x="' + f2(Xc(b.x1)) + '" y="' + f2(Yc(b.y1)) + '" width="' + f2(bw * k2) + '" height="' + f2(bh * k2) + '" fill="#fff" stroke="' + CUT + '" stroke-width="0.3"/>');
			var L1 = f.kind === 'hole' ? 'Ø' + num(f.h.d) : num(bw), L2 = f.kind === 'hole' ? '' : num(bh);
			var bx1 = Xc(b.x1), bx2 = Xc(b.x2), by1 = Yc(b.y1), by2 = Yc(b.y2);
			g.push(line(bx1, by1 - 1.4, bx2, by1 - 1.4, 0.1, CUT) + arrow(bx1, by1 - 1.4, 1, 0, CUT) + arrow(bx2, by1 - 1.4, -1, 0, CUT) + txt((bx1 + bx2) / 2, by1 - 2.2, L1, { anchor: 'middle', fill: CUT, fs: FS * 0.9 }));
			if (L2) g.push(line(bx2 + 1.4, by1, bx2 + 1.4, by2, 0.1, CUT) + arrow(bx2 + 1.4, by1, 0, 1, CUT) + arrow(bx2 + 1.4, by2, 0, -1, CUT) + txt(bx2 + 2.2 + FS * CAPF * 0.9, (by1 + by2) / 2, L2, { anchor: 'middle', fill: CUT, fs: FS * 0.9, rot: 1 }));
			if (f.r) g.push(txt(bx2 - 0.6, by1 + FS * CAPF + 0.6, 'R' + num(f.r), { anchor: 'end', fill: CUT, fs: FS * 0.8 }));
			usedH = wy + 5 + (r0.y2 - r0.y1) * k2 + 1.5 - y;
		}
		return [g.join(''), Math.min(h, usedH)];
	}
	/* Колонка выносов (или карточек) в x, y шириной w и высотой до h: { svg, h, shown }. */
	function drawFeatures(M, c, x, y, w, h, boxes) {
		var g = [], used = 0, shown = 0, list = M.num;
		if (!list.length) return { svg: '', h: 0, shown: 0 };
		if (c.callouts) {
			var cw = (w - 3) / 2, wh = Math.max(24, Math.min(34, w * 0.42)), col = 0, rowY = y;
			for (var i = 0; i < list.length; i++) {
				var f = list[i], lines = [];
				featLines(M, f).forEach(function (ln) { wrap(ln[0], FS * 0.9, cw).forEach(function (t) { lines.push([t, ln[1]]); }); });
				var cx = x + col * (cw + 3), co = callout(M, f, cx, rowY, cw, FSN + 1.2 + wh), vh = co[1];
				var chh = vh + lines.length * LNH * 0.95 + 1.5;
				if (col === 0 && rowY - y + chh > h) break;
				g.push(co[0]);
				lines.forEach(function (ln, k) { g.push(txt(cx, rowY + vh + (k + 1) * LNH * 0.95 - 0.6, ln[0], { fs: FS * 0.9, fill: ln[1], bold: ln[1] === BLUE ? 1 : 0 })); });
				boxes.push({ x: cx, y: rowY, w: cw, h: chh, kind: 'callout', text: '№' + f.n });
				f._h = chh; shown++;
				if (col === 1 || i === list.length - 1) { var mh = Math.max(f._h, list[i - col] ? list[i - col]._h || 0 : 0); rowY += mh + 2.5; col = 0; } else col = 1;
			}
			used = rowY - y;
		} else {
			var cy = y;
			for (var j = 0; j < list.length; j++) {
				var ff = list[j], ttl = circNum(ff.n) + ' ' + kindWord(ff) + ' ' + (ff.kind === 'hole' ? 'Ø' + num(ff.h.d) : (ff.kind === 'groove' ? num(ff.c.w) + ' × ' + num(ff.c.dep) : num(ff.box.x2 - ff.box.x1) + ' × ' + num(ff.box.y2 - ff.box.y1) + (ff.r ? ', R' + num(ff.r) : '')));
				var ls = [];
				wrap(ttl, FS, w - 3, true).forEach(function (t) { ls.push([t, '#111', 1]); });
				featLines(M, ff).forEach(function (ln) { wrap(ln[0], FS * 0.92, w - 3).forEach(function (t) { ls.push([t, ln[1], ln[1] === BLUE ? 1 : 0]); }); });
				var hh = ls.length * LNH + 2.2;
				if (cy - y + hh > h) break;
				g.push('<rect x="' + f2(x) + '" y="' + f2(cy) + '" width="' + f2(w) + '" height="' + f2(hh) + '" rx="1" fill="#fbf7f1" stroke="#ead9c3" stroke-width="0.15"/>');
				ls.forEach(function (ln, k) { g.push(txt(x + 1.5, cy + 1 + (k + 1) * LNH - 0.7, ln[0], { fs: k === 0 ? FS : FS * 0.92, fill: ln[1], bold: ln[2] })); });
				boxes.push({ x: x, y: cy, w: w, h: hh, kind: 'card', text: '№' + ff.n });
				cy += hh + 1.6; shown++;
			}
			used = cy - y;
		}
		if (shown < list.length) { var more = 'ещё ' + (list.length - shown) + ' — в списке обработок'; g.push(txt(x, y + used + LNH, more, { fs: FS * 0.9, fill: '#666' })); boxes.push({ x: x, y: y + used + LNH - FS * CAPF, w: tw(more) * FS * 0.9, h: FS * CAPF + 0.3, kind: 'note', text: more }); used += LNH + 1; }
		return { svg: g.join(''), h: used, shown: shown };
	}

	/* ========================== сведения и обработки ========================== */
	function infoRows(M, card) {
		var t = card.t, gr = { l: 'вдоль длины ' + num(M.L), w: 'поперёк, вдоль ' + num(M.W), n: 'нет' }[M.grain] || '—';
		var rows = [['Материал', P.matTitle(card.mat)], ['Размер', num(M.L) + ' × ' + num(M.W) + ' × ' + num(M.th) + ' мм' + (M.saw ? ' · пилить ' + num(M.sawL) + ' × ' + num(M.sawW) : '')], ['Количество', card.count + ' шт.'], ['Текстура', gr]];
		var es = M.ops.filter(function (o) { return /кромка/i.test(o.what); });
		if (es.length) es.forEach(function (o) { rows.push([o.what, o.where + ' — ' + o.size]); }); else rows.push(['Кромка', 'нет']);
		var ops2 = M.ops.filter(function (o) { return !/кромка/i.test(o.what) && !o.hole; });
		rows.push(['Обработка', ops2.length ? ops2.map(function (o) { return (o.ref ? circNum(o.ref.n) + ' ' : '') + o.what.replace(/ «.*»/, '').toLowerCase() + (o.size ? ' ' + o.size : ''); }).join('; ') : 'нет']);
		var nh = M.holes.length; rows.push(['Отверстий', nh ? nh + ' — см. карту присадки' : 'нет']);
		if (t.path && t.path.length) rows.push(['Изделие', t.path.join(' / ')]);
		return rows;
	}
	/* Таблица сведений: значение переносится по строкам; не влезла строка — дальше не рисуем (остальное в PDF
	   такое же — сведения есть в списке обработок). */
	function drawRows(rows, x, y, w, hMax, boxes) {
		var g = [], kw = Math.min(30, w * 0.36), cy = y;
		for (var i = 0; i < rows.length; i++) {
			var r = rows[i], kl = wrap(r[0], FS, kw - 1.2), vl = wrap(r[1], FS, w - kw - 1), n = Math.max(kl.length, vl.length), rh = n * LNH + 1.6;
			if (cy - y + rh > hMax) break;
			kl.forEach(function (t, k) { g.push(txt(x, cy + (k + 1) * LNH - 0.4, t, { fill: '#666' })); });
			vl.forEach(function (t, k) { g.push(txt(x + kw, cy + (k + 1) * LNH - 0.4, t)); });
			g.push(line(x, cy + rh - 0.2, x + w, cy + rh - 0.2, 0.08, '#ccc'));
			boxes.push({ x: x, y: cy + 0.3, w: w, h: rh - 0.8, kind: 'cell', text: r[0] });
			cy += rh;
		}
		return { svg: g.join(''), h: cy - y };
	}
	/* Список обработок: ячейки переносятся по строкам. */
	function drawOps(M, x, y, w, hMax, boxes) {
		var g = [], cols = [[0, '№'], [6, 'Что'], [0.3, 'Размер, мм'], [0.5, 'Где'], [0.87, 'Сторона']], list = M.ops;
		var cx = cols.map(function (c, i) { return i < 2 ? x + c[0] : x + w * c[0]; });
		g.push(txt(x, y + FSN * CAPF, 'Обработка', { fs: FSN, bold: 1 }));
		var cy = y + FSN + 1.6;
		cols.forEach(function (c, i) { g.push(txt(cx[i], cy + LNH - 0.4, c[1], { fill: '#666' })); });
		cy += LNH + 1;
		var shown = 0;
		for (var i = 0; i < list.length; i++) {
			var o = list[i], cells = [o.ref ? circNum(i + 1) : String(i + 1), o.what, o.size, o.where, o.side];
			var lines = cells.map(function (t, k) { var cw = (k < cells.length - 1 ? cx[k + 1] : x + w) - cx[k] - 1.2; return wrap(t, FS, cw); });
			var n = Math.max.apply(null, lines.map(function (l) { return l.length; })), rh = n * LNH + 1.2;
			if (cy - y + rh > hMax - (i < list.length - 1 ? LNH : 0)) { var more = 'ещё ' + (list.length - i) + ' — не вошли на лист'; g.push(txt(x, cy + LNH - 0.4, more, { fill: '#666' })); cy += LNH; break; }
			g.push(line(x, cy, x + w, cy, 0.08, '#ccc'));
			lines.forEach(function (l, k) { l.forEach(function (t, q) { g.push(txt(cx[k], cy + (q + 1) * LNH - 0.4, t, { fill: k === 0 && o.ref ? CUT : null, bold: k === 0 && o.ref ? 1 : 0 })); }); });
			cy += rh; shown++;
		}
		if (!list.length) { g.push(txt(x, cy + LNH - 0.4, 'обработки нет — прямоугольник без кромки', { fill: '#666' })); cy += LNH; }
		boxes.push({ x: x, y: y, w: w, h: cy - y, kind: 'list', text: 'Обработка' });
		return { svg: g.join(''), h: cy - y };
	}
	/* высота списка обработок (без рисования) — для разметки листа «Список» */
	function opsHeight(M, w) {
		var h = FSN + 1.6 + LNH + 1, cols = [0, 6, 0.3 * w, 0.5 * w, 0.87 * w, w];
		M.ops.forEach(function (o, i) { var cells = [String(i + 1), o.what, o.size, o.where, o.side]; var n = Math.max.apply(null, cells.map(function (t, k) { return wrap(t, FS, cols[k + 1] - cols[k] - 1.2).length; })); h += n * LNH + 1.2; });
		return h + (M.ops.length ? 0 : LNH) + 1.5;
	}

	/* =============================== лист =============================== */

	/* Лист деталировки одной детали в поле box { W, H }: { W, H, svg, boxes, s, ops }. */
	Det.page = function (st, card, box, opt) {
		useStyle(st);
		var c = Det.conf(st.set);
		if (opt && opt.inter) c.inter = 1;
		if (opt && opt.noPic) c.pic = 0;                                   // «Сборка» рисует «где деталь» снимком 3D рядом
		var M = Det.model(st, card), W = box.W, H = box.H, boxes = [], g = [], d;
		var pic = c.pic ? Dr.pic(st, card, 66, 40) : null, colW = 76, hasF = M.num.length > 0;
		var right = (c.style !== 'B' && (pic || c.info || hasF)) || (c.style === 'B' && (pic || hasF));
		var dw = right ? W - colW - 4 : W, rx = W - colW, ry = 0;
		var bandLines = [], listH = 0;
		if (c.style === 'V' && c.info) listH = Math.min(H * 0.45, opsHeight(M, W) + 1);
		if (c.style === 'B' && c.info) {
			var ir = infoRows(M, card);
			bandLines = wrap(ir.map(function (r) { return r[0] + ': ' + r[1]; }).join(' · '), FS, W - 4).slice(0, 4);
		}
		var bandH = bandLines.length ? bandLines.length * LNH + 3 : 0;
		/* что значат цвета — строкой внизу листа */
		var leg = 'Размеры в мм.' + (M.saw ? ' Габарит — пильный размер.' : '') + (M.num.length || M.feat.some(function (f) { return f.kind === 'r'; }) ? ' Оранжевым — вырезы, пазы, радиусы: размер и отступы от краёв детали.' : '') +
			(M.num.some(function (f) { return f.blue; }) ? ' Синим — от пола и от стены (по изделию).' : '') + (c.edge ? ' Зелёным — кромка, красным — лицевая кромка.' : '');
		var legL = wrap(leg, FS * 0.85, W), legH = legL.length * LNH * 0.85 + 0.8;
		H -= legH;
		var dh = H - (listH ? listH + 3 : 0) - (bandH ? bandH + 3 : 0);
		d = drawPart(M, c, 0, 0, dw, dh, boxes);
		g.push(d.svg);
		if (right) {
			var colH = c.style === 'A' ? H : dh;
			if (pic) { g.push(Dr.picSvg(pic, rx, ry, 66, 40, boxes)); boxes.push({ x: rx, y: ry + Dr.CAPH, w: 66, h: 40, kind: 'pic', text: 'где деталь' }); ry += 40 + Dr.CAPH + 4; }
			if (hasF) { var fr = drawFeatures(M, c, rx, ry, colW, Math.max(0, colH - ry - (c.style === 'A' && c.info ? 30 : 0)), boxes); g.push(fr.svg); ry += fr.h + (fr.h ? 3 : 0); }
			if (c.style === 'A' && c.info) { var rr = drawRows(infoRows(M, card), rx, ry, colW, H - ry, boxes); g.push(rr.svg); }
		}
		if (listH) g.push(drawOps(M, 0, H - listH, W, listH, boxes).svg);
		if (bandH) {
			var by = H - bandH;
			g.push('<rect x="0" y="' + f2(by) + '" width="' + f2(W) + '" height="' + f2(bandH) + '" rx="1.2" fill="#f5f6f7"/>');
			bandLines.forEach(function (ln, i) { g.push(txt(2, by + 1.5 + (i + 1) * LNH - 0.4, ln)); });
			boxes.push({ x: 0, y: by, w: W, h: bandH, kind: 'band', text: 'сведения' });
		}
		legL.forEach(function (t, i) { g.push(txt(0, H + (i + 1) * LNH * 0.85 - 0.2, t, { fs: FS * 0.85, fill: '#666' })); });
		boxes.push({ x: 0, y: H + 0.3, w: W, h: legH - 0.4, kind: 'legend', text: 'цвета' });
		H += legH;
		return { W: W, H: H, svg: g.join(''), boxes: boxes, s: d.s, ops: M.ops.length, legend: leg, nums: M.num.length };
	};
	Det.pageSvg = function (pg, o) {
		o = o || {};
		var size = o.px > 0 ? 'width="' + Math.round(o.px) + '" height="' + Math.round(o.px * pg.H / pg.W) + '"' : 'width="' + f2(pg.W) + 'mm" height="' + f2(pg.H) + 'mm"';
		return '<svg xmlns="http://www.w3.org/2000/svg" version="1.1" ' + size + ' viewBox="0 0 ' + f2(pg.W) + ' ' + f2(pg.H) + '" font-family=\'' + (o.font || D.FONT).replace(/"/g, '') + '\'>' + pg.svg + '</svg>';
	};
	/* Проверка листа: надписи не задевают друг друга, отверстия и не выходят за поле. */
	Det.check = function (pg) {
		var out = [], b = pg.boxes;
		for (var i = 0; i < b.length; i++) {
			if (b[i].kind === 'hole' || b[i].kind === 'zone') continue;
			if (b[i].x < -0.05 || b[i].y < -0.05 || b[i].x + b[i].w > pg.W + 0.05 || b[i].y + b[i].h > pg.H + 0.05) out.push('«' + b[i].text + '» выходит за поле');
			for (var j = 0; j < b.length; j++) {
				if (j === i || b[j].kind === 'zone' || (b[j].kind !== 'hole' && j < i)) continue;
				if (b[i].kind === 'cell' && b[j].kind === 'cell') continue;
				if ((b[i].kind === 'callout' || b[i].kind === 'card') && b[j].kind === 'hole') continue;
				if (hit(b[i], b[j], -0.05)) out.push('«' + b[i].text + '» (' + b[i].kind + ') задевает ' + (b[j].kind === 'hole' ? 'отверстие' : '«' + b[j].text + '» (' + b[j].kind + ')'));
			}
		}
		return out;
	};
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));
