/* STHGroup — присадка: карты ручной присадки.
   Карта — чертёж детали с отверстиями: у краёв засечки с расстоянием от базового угла,
   рядом таблица (номер, координаты, диаметр, глубина, крепёж).

   Главное правило: надписи читаются и не накладываются. Поэтому
     — цифры не мельче CAP мм на бумаге; если тесно, меняется расстановка, а не кегль;
     — близкие засечки расходятся ступеньками (до трёх рядов от края);
     — где и этого мало, участок выносится отдельным увеличенным видом;
     — ряд отверстий с равным шагом подписан размером до первого и шагом: «7 × 32»;
     — Dr.check(page) проверяет готовый лист: ни одна надпись не пересекает другую
       надпись или отверстие.

   Системы координат. Деталь «лицом вверх» (сторона А): X вдоль длины, Y вниз — как на карте
   раскроя. Сторона Б — деталь перевёрнута через короткую кромку (зеркало по X). Торец —
   вид на кромку снаружи, сторона А сверху. Всё на бумаге — в миллиметрах.            */
(function (G) {
	'use strict';
	var BM = G.BM = G.BM || {};
	var P = BM.project, geom = BM.geom, D = BM.draw, esc = D.esc;
	var Dr = BM.drill = {};

	var CAP = 3;                    // высота цифр, мм
	var FS = CAP / 0.69;            // кегль, при котором цифра не ниже CAP в Segoe UI, Arial, Bahnschrift и DejaVu
	var TH = CAP + 0.7;             // толщина надписи с полем
	var GAPL = 0.6, GAPC = 0.55;    // зазор между надписями одного ряда; между надписью и чужим штрихом
	var T0 = 3.4, TGAP = 1.4;       // отступ первого ряда от края (в нём выносной штрих делает излом); зазор между рядами
	var JOG = 6;                    // на сколько надпись может отойти в сторону от своей засечки
	var LANE = CAP + 3.2;           // глубина полосы под размер шага
	var PADS = 3;                   // поле вида со сторон без размеров
	var CAPH = 6;                   // высота подписи вида
	var FSE = 2.9;                  // кегль подписей краёв детали (ПЕРЕД, ВЕРХ…)
	var RC = 1.9;                   // радиус кружка с номером угла
	var FRONT = '#d62828';          // лицевая кромка (по краю ПЕРЕД) — красным на карте, на картинке «где деталь» и в деталировке
	var FSN = 3.6;                  // кегль названий (не размеров)
	var SCALES = [1, 1 / 1.5, 1 / 2, 1 / 2.5, 1 / 3, 1 / 4, 1 / 5, 1 / 6, 1 / 8, 1 / 10, 1 / 12, 1 / 15, 1 / 20, 1 / 25, 1 / 30, 1 / 40];
	var DSCALES = [1 / 10, 1 / 8, 1 / 6, 1 / 5, 1 / 4, 1 / 3, 1 / 2.5, 1 / 2, 1 / 1.5, 1, 2];
	var SIDE = { T: 'верхний', B: 'нижний', L: 'левый', R: 'правый' };
	Dr.CAP = CAP;
	var RH = 5.6;                   // высота строки таблицы
	var LH = 4.6;                   // шаг строк пояснений

	/* Настройки присадки (на всю программу). Оформление карты:
	     А — номера у отверстий и таблица по номерам справа;
	     Б — у каждого сверла свой значок, справа сводная таблица свёрл;
	     В — диаметр и глубина написаны у отверстия, таблицы нет;
	     Г — на первом листе только чертёж, таблица отверстий и пояснения — вторым листом. */
	Dr.MODES = { A: 'Номера', B: 'Значки', V: 'У отверстий', G: 'Два листа' };
	Dr.MODE_HINT = { A: 'номера у отверстий и таблица по номерам', B: 'у каждого сверла свой значок и сводная таблица', V: 'диаметр и глубина у отверстия, без таблицы', G: 'чертёж на одном листе, таблица и пояснения — на втором' };
	Dr.TOGGLES = [['color', 'Цвет'], ['ends', 'Торцы'], ['fast', 'Крепёж'], ['rows', 'Ряды'], ['pic', 'Где деталь']];
	Dr.DEF = { mode: 'B', cap: 1.8, cap2: 2.5, gMark: 'num', fast: 1, color: 0, guides: 1, rows: 1, minMark: 1.4, baseDef: 0, thru: 'more', key: 1, exRead: 1, exInfo: 1, text: '', multi: 0, ends: 1, pic: 1 };
	Dr.conf = function (set) {
		var s = (set && set.drill) || {}, c = {}, k;
		for (k in Dr.DEF) c[k] = s[k] === undefined || s[k] === null ? Dr.DEF[k] : s[k];
		if (!Dr.MODES[c.mode]) c.mode = Dr.DEF.mode;
		function lim(v, a, b, d) { v = Number(v); return isFinite(v) ? Math.max(a, Math.min(b, Math.round(v * 10) / 10)) : d; }
		c.cap = lim(c.cap, 1.5, 4, Dr.DEF.cap); c.cap2 = lim(c.cap2, 1.5, 4, Dr.DEF.cap2); c.minMark = lim(c.minMark, 0.8, 4, Dr.DEF.minMark);
		c.baseDef = (c.baseDef >= 0 && c.baseDef <= 3) ? (c.baseDef | 0) : 0;
		c.text = String(c.text || '');
		return c;
	};
	var ST = { hole: 'ring', holeMin: 0.7, num: 'plain', numText: '', table: 'types', fast: 1, color: 0, guides: 1, rows: 1, key: 1, thru: 'more' };
	var THIN = { '0.9': 0.3, '0.4': 0.18, '0.35': 0.18, '0.3': 0.15, '0.25': 0.13, '0.2': 0.12, '0.18': 0.1, '0.15': 0.1, '0.12': 0.08 };
	/* Все линии тонкие, как на карте раскроя. */
	function LW(v) { return THIN[String(v)] || v; }
	/* Все отступы считаются от высоты цифр. */
	function setCap(cap) {
		CAP = cap; FS = CAP / 0.69;
		var q = Math.max(0.72, CAP / 3);
		TH = CAP + 0.7 * q; GAPL = 0.6 * q; GAPC = 0.55 * q; T0 = 3.4 * q; TGAP = 1.4 * q; JOG = 6 * q; LANE = CAP + 3.2 * q; PADS = 3 * q;
		FSN = Math.max(2.4, Math.min(3.6, FS)); CAPH = FSN + 2.4; RH = CAP + 2.6 * q; LH = FSN * 1.3; Dr.CAP = CAP;
	}
	/* Взять настройки проекта в работу. Возвращает их же. */
	function use(st, cap) {
		var c = Dr.conf(st.set), sym = c.mode === 'B' || (c.mode === 'G' && c.gMark === 'numsym');
		ST = { mode: c.mode, hole: sym ? 'sym' : 'ring', holeMin: Math.max(c.minMark / 2, sym ? 0.8 : 0.5), num: c.mode === 'B' ? 'none' : 'plain', numText: c.mode === 'V' ? 'drill' : '',
			   table: { A: 'holes', B: 'types', V: 'none', G: 'sheet2' }[c.mode], fast: c.fast ? 1 : 0, color: c.color ? 1 : 0, guides: c.guides ? 1 : 0, rows: c.rows ? 1 : 0, key: c.key ? 1 : 0, thru: c.thru };
		setCap(cap || c.cap);
		return c;
	}
	var COLORS = ['#c0392b', '#1f6fb2', '#1e8449', '#b9770e', '#7d3c98', '#117a8b', '#a04000', '#34495e', '#d81b60', '#5d7a00', '#6d4c41', '#3949ab'];
	function colorOf(ty) { return ST.color ? COLORS[(ty || 0) % COLORS.length] : '#000'; }
	function hr(h, s) { return Math.max(h.d / 2 * s, ST.holeMin); }
	function numW(label) { return tw(label, true) * FS + 0.7; }
	function numH() { return CAP + 0.7; }
	function capOpt() { return { fs: FSN, fill: '#222' }; }

	function f2(v) { return String(Math.round(v * 100) / 100); }
	function num(v) { return String(Math.round(v * 10) / 10).replace('.', ','); }
	function r1(v) { return Math.round(v * 10) / 10; }
	function scaleText(s) { return s >= 1 ? num(s) + ' : 1' : '1 : ' + num(1 / s); }
	/* Ширина текста в кеглях — с запасом: шрифт на Windows и здесь разный, надпись не должна оказаться шире расчёта. */
	function tw(str, bold) {
		var w = 0;
		str = String(str);
		for (var i = 0; i < str.length; i++) {
			var ch = str.charAt(i), c = str.charCodeAt(i);
			if (c >= 48 && c <= 57) w += 0.64;
			else if (ch === ' ') w += 0.32;
			else if (ch === ',' || ch === '.' || ch === ':' || ch === ';') w += 0.34;
			else if (ch === '×' || ch === '+' || ch === '=') w += 0.84;
			else if (ch === 'Ø') w += 0.8;
			else if (ch === '–' || ch === '-' || ch === '(' || ch === ')' || ch === '/' || ch === '·') w += 0.5;
			else if ('ШЩЖЮЫМшщжюымWMmw'.indexOf(ch) >= 0) w += 0.95;
			else if ((c >= 65 && c <= 90) || (c >= 0x410 && c <= 0x42F)) w += 0.76;
			else w += 0.66;
		}
		return w * (bold ? 1.07 : 1);
	}
	Dr.tw = tw;
	function clipText(str, fs, maxW) {
		str = String(str);
		if (tw(str) * fs <= maxW) return str;
		while (str.length > 1 && tw(str + '…') * fs > maxW) str = str.substring(0, str.length - 1);
		return str.replace(/\s+$/, '') + '…';
	}
	function hit(a, b, pad) { return a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad; }
	function segHitsRect(x1, y1, x2, y2, r) {
		var t0 = 0, t1 = 1, dx = x2 - x1, dy = y2 - y1, p = [-dx, dx, -dy, dy], q = [x1 - r.x, r.x + r.w - x1, y1 - r.y, r.y + r.h - y1];
		for (var i = 0; i < 4; i++) {
			if (Math.abs(p[i]) < 1e-9) { if (q[i] < 0) return false; }
			else { var t = q[i] / p[i]; if (p[i] < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; } }
		}
		return true;
	}

	/* ================================ данные ================================== */

	/* Отверстия одной панели модели в системе её детали. */
	function partHoles(st, part) {
		var hb = st.holes && st.holes.by[part.id];
		if (!hb) return null;
		var sh = geom.readShape(part), fr = sh.fr, th = Number(part.th) || 0;
		if (!fr) return null;
		function face(list, thru) { return list.map(function (h) { var q = geom.toFrameRaw(fr, [h.x, h.y]); return { x: r1(q[0]), y: r1(q[1]), d: h.d, dep: thru ? 0 : h.dep, fast: h.fast || '' }; }); }
		var edge = hb.edge.map(function (h) {
			var q = geom.toFrameRaw(fr, [h.x, h.y]), dir = fr.wide ? [h.dx, -h.dy] : [h.dy, h.dx];
			var side = Math.abs(dir[0]) > Math.abs(dir[1]) ? (dir[0] > 0 ? 'L' : 'R') : (dir[1] > 0 ? 'T' : 'B');
			return { x: r1(q[0]), y: r1(q[1]), v: r1(th - h.z), side: side, d: h.d, dep: h.dep, fast: h.fast || '' };
		});
		return { top: face(hb.top), bot: face(hb.bot), thr: face(hb.thr, true), edge: edge };
	}
	function holesSig(hs) {
		function one(l, k) { return l.map(function (h) { return [k, h.x, h.y, h.d, h.dep, h.v === undefined ? '' : h.v, h.side || ''].join(':'); }).sort().join(';'); }
		return [one(hs.top, 't'), one(hs.bot, 'b'), one(hs.thr, 'x'), one(hs.edge, 'e')].join('|');
	}
	/* Варианты присадки разновидности детали. Обычно один; несколько — если панели, которые
	   раскрой считает одинаковыми (название, позиция, размер, кромка), просверлены по-разному. */
	function variantsOf(st, t, parts) {
		if (t._dv) return t._dv;
		var by = {}, list = [];
		for (var i = 0; i < t.ids.length; i++) {
			var p = parts[t.ids[i]], hs = p ? partHoles(st, p) : null;
			if (!hs) hs = { top: [], bot: [], thr: [], edge: [] };
			var sg = holesSig(hs), v = by[sg];
			if (!v) { v = by[sg] = { hs: hs, ids: [], sel: 0, n: hs.top.length + hs.bot.length + hs.thr.length + hs.edge.length }; list.push(v); }
			v.ids.push(t.ids[i]);
			if (p && p.sel) v.sel++;
		}
		list.sort(function (a, b) { return b.ids.length - a.ids.length; });
		t._dv = list;
		return list;
	}

	/* Карты присадки проекта: [{ key, t, mat, hs, n, count, varI, varN }] — по материалам, как в раскрое. */
	Dr.cards = function (st) {
		var parts = {}, out = [], src = st.model.parts || [], i, j, saved = geom.stat;
		for (i = 0; i < src.length; i++) parts[src[i].id] = src[i];
		for (i = 0; i < st.mats.length; i++) {
			var m = st.mats[i], ts = m.types.slice(0);
			ts.sort(function (a, b) { return P.natCmp(a.des, b.des) || P.natCmp(a.pos, b.pos) || (b.L - a.L) || (b.W - a.W); });
			for (j = 0; j < ts.length; j++) {
				var t = ts[j], total = P.count(st, t);
				if (!total) continue;
				var vs = variantsOf(st, t, parts);
				for (var v = 0; v < vs.length; v++) {
					var cnt = total;
					if (vs.length > 1) cnt = (st.work.scope === 'sel' ? vs[v].sel : vs[v].ids.length) * st.work.sets;
					if (!cnt) continue;
					out.push({ key: t.sig + (vs.length > 1 ? '#' + (v + 1) : ''), t: t, mat: m, hs: vs[v].hs, n: vs[v].n, count: cnt, varI: v + 1, varN: vs.length, ids: vs[v].ids });
				}
			}
		}
		geom.stat = saved;
		return out;
	};
	/* Базовый угол детали: выбранный для неё в проекте, иначе — из настроек присадки. */
	Dr.baseOf = function (st, card) {
		var d = st.work.drill, b = d && d.base ? d.base[card.key] : undefined;
		if (b === undefined || b === null) b = Dr.conf(st.set).baseDef;
		return (b >= 0 && b <= 3) ? (b | 0) : 0;
	};
	Dr.setBase = function (st, card, bc) {
		var d = st.work.drill || (st.work.drill = {});
		if (!d.base) d.base = {};
		if (bc >= 0 && bc <= 3) d.base[card.key] = bc | 0; else delete d.base[card.key];
	};
	/* Примечание к детали — пишет пользователь, печатается в пояснениях карты. */
	Dr.noteOf = function (st, card) { var d = st.work.drill; return (d && d.note && d.note[card.key]) || ''; };
	Dr.setNote = function (st, card, text) {
		var d = st.work.drill || (st.work.drill = {});
		if (!d.note) d.note = {};
		text = String(text || '').replace(/\s+/g, ' ').replace(/^ | $/g, '').substring(0, 600);
		if (text) d.note[card.key] = text; else delete d.note[card.key];
	};
	Dr.title = function (card) { var t = card.t; return (P.main(t) ? P.main(t) + '  ' : '') + t.name + (card.varN > 1 ? ' — присадка ' + card.varI + ' из ' + card.varN : ''); };

	/* ================================= виды =================================== */

	/* Ряды: три и больше одинаковых отверстия на одной линии с равным шагом. */
	function groupHoles(view) {
		var hs = view.holes, used = {}, groups = [], i;
		function runs(axis) {
			var o = axis === 'x' ? 'y' : 'x', b = {}, k;
			for (i = 0; i < hs.length; i++) {
				if (used[i]) continue;
				k = [hs[i].d, hs[i].dep, hs[i].fast, Math.round(hs[i][o] * 10)].join('|');
				(b[k] = b[k] || []).push(i);
			}
			for (k in b) if (b.hasOwnProperty(k)) {
				var l = b[k].filter(function (q) { return !used[q]; });
				if (l.length < 3) continue;
				l.sort(function (p, q) { return hs[p][axis] - hs[q][axis]; });
				var a = 0;
				while (a < l.length - 2) {
					var step = hs[l[a + 1]][axis] - hs[l[a]][axis], e = a + 1;
					while (e + 1 < l.length && Math.abs(hs[l[e + 1]][axis] - hs[l[e]][axis] - step) < 0.06) e++;
					if (e - a >= 2 && step > 0.5) {
						var idx = l.slice(a, e + 1);
						/* ряд идёт от базы */
						if (Math.abs(hs[idx[0]][axis] + view.ox2(axis) - view.bx[axis]) > Math.abs(hs[idx[idx.length - 1]][axis] + view.ox2(axis) - view.bx[axis])) idx.reverse();
						idx.forEach(function (q) { used[q] = 1; });
						groups.push({ row: axis, idx: idx, step: r1(step) });
						a = e + 1;
					} else a++;
				}
			}
		}
		if (ST.rows) { if (view.kind === 'face') { runs('x'); runs('y'); } else runs('x'); }
		for (i = 0; i < hs.length; i++) if (!used[i]) groups.push({ row: '', idx: [i], step: 0 });
		function dist(g) { var h = hs[g.idx[0]]; return [Math.abs(h.x + view.org.x - view.bx.x), Math.abs(h.y + view.org.y - view.bx.y)]; }
		groups.sort(function (a, b) { var p = dist(a), q = dist(b); return (p[0] - q[0]) || (p[1] - q[1]); });
		return groups;
	}

	/* ======================= где лицо, где верх, где деталь ======================= */
	/* Сцена 3D (BM.m3d) — один раз на состояние проекта: верх и лицо изделия, модули, положение панелей. */
	function scene3(st) {
		if (!BM.m3d) return null;
		var m = (st.set && st.set.model) || {}, key = [m.up, m.front, m.zmode].join('|');
		if (st._sc3 && st._sc3.key === key && st._sc3.doc === st.doc) return st._sc3.sc;
		var sc = null;
		try { sc = BM.m3d.build(st.doc, { hidden: !!(st.set && st.set.est && st.set.est.hidden), up: m.up || undefined, front: m.front || undefined, zmode: m.zmode >= 0 ? m.zmode : undefined }); } catch (e) { sc = null; }
		st._sc3 = { key: key, doc: st.doc, sc: sc };
		return sc;
	}
	/* Модуль детали: блок верхнего уровня; если всё изделие — один блок (как «Model» у ТВ-Зоны), — блок под ним. */
	function modOf3(sc, it, B) {
		/* по блокам выгрузки (bk): верхний блок, а если он у всех деталей один — блок под ним; без блоков — по пути */
		B = B || [];
		var chain = function (t) { var r = []; for (var b = t.bk, g = 0; b >= 0 && B[b] && g < 80; b = B[b].up, g++) r.unshift(b); return r; };
		if (sc._oneRoot === undefined) { var rs = {}; sc.items.forEach(function (t) { var c = chain(t); if (c.length) rs[c[0]] = 1; }); sc._oneRoot = Object.keys(rs).length === 1; }
		var key = function (t) { var c = chain(t); if (c.length) return 'b' + (sc._oneRoot && c.length > 1 ? c[1] : c[0]); return sc.mods.length > 1 ? t.mod : (t.path || []).slice(0, 2).join('/'); }, k = key(it);
		sc._md = sc._md || {};
		if (sc._md[k]) return sc._md[k];
		var ck = chain(it), nb = ck.length ? (sc._oneRoot && ck.length > 1 ? ck[1] : ck[0]) : -1;
		var md = { name: nb >= 0 && B[nb] ? B[nb].name : (sc.mods.length > 1 ? it.mod : ((it.path && it.path[1]) || it.mod)), items: [], c: null }, b = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
		sc.items.forEach(function (t) { if (key(t) !== k) return; md.items.push(t.i); for (var a = 0; a < 3; a++) { b.min[a] = Math.min(b.min[a], t.box.min[a]); b.max[a] = Math.max(b.max[a], t.box.max[a]); } });
		md.c = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2];
		return (sc._md[k] = md);
	}
	function v3(a, b, k) { return [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k]; }
	function vdot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
	function vcross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
	function vnorm(a) { var l = Math.sqrt(vdot(a, a)) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
	/* Как деталь стоит в изделии. Лицевая: у фасада — сторона без чашек петель; у горизонтальной детали — верхняя;
	   у остальных — снаружи модуля. Подписи краёв видов (ПЕРЕД, ЗАД, ВЕРХ, НИЗ, СЛЕВА, СПРАВА) — по положению в изделии.
	   Возвращает { face: 'A'|'B', why, lab: { A: { T, B, L, R }, B: {…} } | null, it, sc }. */
	function orientOf(st, card) {
		var hs = card.hs, o = { face: 'A', why: '', lab: null, it: null, sc: null };
		function cup(l) { return l.some(function (h) { return h.d >= 34 && h.d <= 36; }); }
		var cT = cup(hs.top), cB = cup(hs.bot);
		if (cT !== cB) { o.face = cT ? 'B' : 'A'; o.why = 'сторона без чашек петель'; }
		var sc = scene3(st), ids = card.ids || card.t.ids || [], it = null, part = null, parts = st.model.parts || [], i;
		if (sc) for (i = 0; i < sc.items.length && !it; i++) if (ids.indexOf(sc.items[i].id) >= 0) it = sc.items[i];
		if (it) for (i = 0; i < parts.length && !part; i++) if (parts[i].id === it.id) part = parts[i];
		if (!it || !part || !part.frame) return o;
		var sh = geom.readShape(part), fr = sh.fr; if (!fr) return o;
		var f = part.frame, n = vnorm(f.z), up = sc.up, front = sc.front, right = vcross(up, front);
		var F = function (l) { return vnorm([f.x[0] * l[0] + f.y[0] * l[1], f.x[1] * l[0] + f.y[1] * l[1], f.x[2] * l[0] + f.y[2] * l[1]]); };
		var eX = F(fr.wide ? [1, 0] : [0, 1]), eY = F(fr.wide ? [0, -1] : [1, 0]);
		if (!o.why) {
			var md = modOf3(sc, it, st.model.blocks);
			if (Math.abs(vdot(n, up)) > 0.7) { o.face = vdot(n, up) > 0 ? 'A' : 'B'; o.why = 'верхняя сторона'; }
			else if (md && md.items.length > 1) {
				var d = vdot([it.c[0] - md.c[0], it.c[1] - md.c[1], it.c[2] - md.c[2]], n);
				if (Math.abs(d) > 5) { o.face = d > 0 ? 'A' : 'B'; o.why = 'снаружи модуля'; }
			}
		}
		function name(g) {
			if (vdot(g, up) > 0.7) return 'ВЕРХ'; if (vdot(g, up) < -0.7) return 'НИЗ';
			if (vdot(g, front) > 0.7) return 'ПЕРЕД'; if (vdot(g, front) < -0.7) return 'ЗАД';
			if (vdot(g, right) > 0.7) return 'СПРАВА'; if (vdot(g, right) < -0.7) return 'СЛЕВА';
			return '';
		}
		var side = sh.sides || {};
		function labs(mir) {
			var down = mir ? v3([0, 0, 0], eY, -1) : eY, r = { T: name(v3([0, 0, 0], down, -1)), B: name(down), L: name(v3([0, 0, 0], eX, -1)), R: name(eX) };
			r.band = mir ? { T: side.B > 0, B: side.T > 0, L: side.L > 0, R: side.R > 0 } : { T: side.T > 0, B: side.B > 0, L: side.L > 0, R: side.R > 0 };
			return r;
		}
		o.lab = { A: labs(false), B: labs(true) };
		/* деталь стоит лицом вперёд (задняя стенка ящика, фасад, царга): края ПЕРЕД у неё нет — лицевая кромка верхняя (1.16) */
		if (Math.abs(vdot(n, front)) > 0.7) ['A', 'B'].forEach(function (id) { var L0 = o.lab[id]; L0.F0 = ['T', 'B', 'L', 'R'].filter(function (q) { return L0[q] === 'ВЕРХ'; })[0] || ''; });
		o.frontBand = ['T', 'B', 'L', 'R'].some(function (sd) { return Dr.isFront(o.lab.A, sd) && o.lab.A.band[sd]; });
		o.it = it; o.sc = sc; o.n = n; o.B = st.model.blocks || []; o.eX = eX; o.eY = eY;
		return o;
	}
	/* Что за деталь и в каком модуле — для сортировки и отбора списка деталей. По положению в 3D: горизонтальная —
	   «горизонт», стоит боком (лицо смотрит влево-вправо) — «боковина», лицом вперёд — фасад (по названию или чашкам
	   петель) или задняя стенка. Без 3D — по названию. Возвращает { kind: side|hor|fac|back|other, mod }. */
	Dr.kindOf = function (st, card) {
		if (card._kind) return card._kind;
		var O = orOf(st, card), nm = String((card.t.name || '') + ' ' + (P.main(card.t) || '')).toLowerCase(), k = '', mod = '';
		var byName = /фасад|двер|ящик.*фас/.test(nm) ? 'fac' : (/задн|зс|стенк/.test(nm) ? 'back' : (/бок|стойк|перегород/.test(nm) ? 'side' : (/полк|крыш|дно|горизонт|цокол/.test(nm) ? 'hor' : '')));
		if (O.it && O.n) {
			var up = O.sc.up, fr = O.sc.front, rt = vcross(up, fr), n = O.n;
			if (Math.abs(vdot(n, up)) > 0.7) k = 'hor';
			else if (Math.abs(vdot(n, rt)) > 0.7) k = 'side';
			else if (Math.abs(vdot(n, fr)) > 0.7) k = byName === 'fac' || O.why === 'сторона без чашек петель' ? 'fac' : (byName === 'back' || card.t.th <= 6 ? 'back' : (byName || 'fac'));
			try { var md = modOf3(O.sc, O.it, st.model.blocks); mod = md ? String(md.name || '') : ''; } catch (e) { mod = ''; }
		}
		if (!k) k = byName || 'other';
		if (!mod) mod = (card.t.path && (card.t.path[1] || card.t.path[0])) || '';
		return (card._kind = { kind: k, mod: mod });
	};
	/* Порядок карт присадки — как в списке раздела (для PDF — все детали, без отбора). */
	Dr.order = function (st, cards, all) {
		var out = [];
		Dr.listOrder(st, cards, { all: all, what: 'отверстий', score: function (c) { return c.n || 0; }, cut: function (c) { return BM.detail ? BM.detail.hasCut(st, c) : false; } }).forEach(function (g) { out = out.concat(g.cards); });
		return out;
	};
	Dr.SORTS = { pos: 'По позиции', mod: 'По модулям', mat: 'По материалу', n: 'По числу' };
	Dr.FILTERS = { all: 'Все', side: 'Боковины', hor: 'Горизонты', fac: 'Фасады', back: 'Задние', cut: 'С вырезами' };
	/* Список деталей по настройке set.parts: { sort, filter }. o.score(card) — сколько у детали отверстий (присадка)
	   или обработок (деталировка); o.cut(card) — есть ли вырезы. Детали без отверстий и обработок — в конце.
	   Возвращает [{ group, cards }] — group пустая, если сортировка без групп. */
	Dr.listOrder = function (st, cards, o) {
		var pc = (st.set && st.set.parts) || {}, sort = Dr.SORTS[pc.sort] ? pc.sort : 'mat', flt = Dr.FILTERS[pc.filter] ? pc.filter : 'all';
		var score = o.score || function (c) { return c.n || 0; };
		var list = cards.filter(function (c) {
			if (flt === 'all' || o.all) return true;
			if (flt === 'cut') return o.cut ? o.cut(c) : false;
			return Dr.kindOf(st, c).kind === flt;
		});
		var idx = {}; cards.forEach(function (c, i) { idx[c.key] = i; });
		var pos = function (a, b) { return P.natCmp(a.t.des || '', b.t.des || '') || P.natCmp(String(a.t.pos || ''), String(b.t.pos || '')) || idx[a.key] - idx[b.key]; };
		var empty = function (c) { return score(c) > 0 ? 0 : 1; };
		var gk = sort === 'mod' ? function (c) { return Dr.kindOf(st, c).mod || 'без модуля'; } : (sort === 'mat' ? function (c) { return P.matTitle(c.mat); } : null);
		list.sort(function (a, b) {
			return empty(a) - empty(b) || (gk ? P.natCmp(gk(a), gk(b)) : 0) || (sort === 'n' ? score(b) - score(a) : 0) || (sort === 'mat' ? idx[a.key] - idx[b.key] : pos(a, b));
		});
		var out = [], cur = null;
		list.forEach(function (c) {
			var g = gk ? (empty(c) ? 'Без ' + (o.what || 'обработки') : gk(c)) : (empty(c) && sort !== 'n' && list.some(function (x) { return !empty(x); }) ? 'Без ' + (o.what || 'обработки') : '');
			if (!cur || cur.group !== g) { cur = { group: g, cards: [] }; out.push(cur); }
			cur.cards.push(c);
		});
		return out;
	};
	/* Лицевая кромка вручную (1.14.0): край детали, отмеченный щелчком, — лицевой вместо края ПЕРЕД.
	   Хранится в проекте: work.drill.front[ключ карты] — сторона в осях стороны А ('T','B','L','R'), '-' — лицевой нет. */
	function orOf(st, card) { var o = card._or; if (!o || o._f !== Dr.frontOf(st, card)) o = card._or = orientF(st, card); return o; }
	function orientF(st, card) {
		var o = orientOf(st, card), f = Dr.frontOf(st, card);
		o._f = f;
		if (!f) return o;
		var sides = (card.t.shape && card.t.shape.sides) || {};
		if (!o.lab) {
			var band = function (mir) { return mir ? { T: sides.B > 0, B: sides.T > 0, L: sides.L > 0, R: sides.R > 0 } : { T: sides.T > 0, B: sides.B > 0, L: sides.L > 0, R: sides.R > 0 }; };
			o.lab = { A: { T: '', B: '', L: '', R: '', band: band(false) }, B: { T: '', B: '', L: '', R: '', band: band(true) } };
		}
		o.lab.A.F = f; o.lab.B.F = f === '-' ? '-' : ({ T: 'B', B: 'T' }[f] || f);
		o.manualFront = f;
		o.frontBand = f !== '-' && !!o.lab.A.band[f];
		return o;
	}
	/* лицевой ли край sd в подписях вида lab: отмеченный вручную, иначе — край ПЕРЕД */
	Dr.isFront = function (lab, sd) { return !!(lab && sd && (lab.F ? lab.F === sd : (lab.F0 !== undefined ? lab.F0 === sd : lab[sd] === 'ПЕРЕД'))); };
	/* лицевой край детали в осях стороны А ('' — нет) */
	Dr.frontSide = function (lab) { return lab ? (['T', 'B', 'L', 'R'].filter(function (q) { return Dr.isFront(lab, q); })[0] || '') : ''; };
	Dr.frontOf = function (st, card) { var d = st.work.drill; return d && d.front && d.front[card.key] ? d.front[card.key] : ''; };
	/* щелчок по краю: тот же край, что лицевой сейчас, — снять (лицевой нет); другой — сделать лицевым */
	Dr.setFront = function (st, card, sd) {
		var d = st.work.drill || (st.work.drill = {});
		if (!d.front) d.front = {};
		var O = orOf(st, card), now = O.lab && O.lab.A ? (['T', 'B', 'L', 'R'].filter(function (q) { return Dr.isFront(O.lab.A, q); })[0] || '') : '';
		if (sd === 'auto') delete d.front[card.key];
		else d.front[card.key] = now === sd ? '-' : sd;
		delete card._dst;
	};
	/* Пазы вручную (1.16): у детали можно отключить один паз (щелчком по нему) или все (галка «Пазы»). Отключённые
	   не рисуются в «Деталировке» и «Присадке» (и в PDF). Хранится в проекте: work.drill.grv[ключ карты] — 'all' или
	   список номеров пазов детали (по порядку в выгрузке). */
	Dr.grvOf = function (st, card) { var d = st.work.drill, v = d && d.grv ? d.grv[card.key] : null; return v === 'all' ? 'all' : (Array.isArray(v) ? v : []); };
	Dr.grvOff = function (st, card, i) { var v = Dr.grvOf(st, card); return v === 'all' || v.indexOf(i) >= 0; };
	/* what: номер паза — переключить его; 'all' — отключить все; 'on' — вернуть все */
	Dr.setGrv = function (st, card, what) {
		var d = st.work.drill || (st.work.drill = {}); if (!d.grv) d.grv = {};
		var v = Dr.grvOf(st, card);
		if (what === 'on') delete d.grv[card.key];
		else if (what === 'all') d.grv[card.key] = 'all';
		else {
			var n = Dr.grvCount(st, card), list = v === 'all' ? Array.from({ length: n }, function (x, k) { return k; }) : v.slice(), k = list.indexOf(what);
			if (k >= 0) list.splice(k, 1); else list.push(what);
			list.sort(function (a, b) { return a - b; });
			if (!list.length) delete d.grv[card.key]; else d.grv[card.key] = list.length >= n && n > 0 ? 'all' : list;
		}
		delete card._dst;
	};
	/* сколько у детали пазов (вырезов-пазов из модели) */
	Dr.grvCount = function (st, card) {
		var parts = st.model.parts || [], ids = card.ids || card.t.ids || [];
		for (var i = 0; i < parts.length; i++) if (ids.indexOf(parts[i].id) >= 0) return (parts[i].cuts || []).length;
		return 0;
	};
	/* Картинка «где деталь»: модуль в изометрии, деталь цветом, стрелка от лицевой стороны. Многоугольники — в мм
	   бумаги внутри окна w × h. */
	function picOf(o, w, h) {
		var sc = o.sc, it = o.it, md = modOf3(sc, it, o.B);
		if (!md || !md.items.length) return null;
		var up = sc.up, front = sc.front, right = vcross(up, front), fn = o.face === 'A' ? o.n : v3([0, 0, 0], o.n, -1);
		var sd = vdot(fn, right), sg = Math.abs(sd) > 0.3 ? (sd > 0 ? 1 : -1) : -1;
		var wv = vnorm(v3(v3(front, up, 0.7), right, 0.75 * sg)), r = vnorm(vcross(up, wv)), u = vcross(wv, r);
		var M3 = BM.m3d, polys = [], mn = [Infinity, Infinity], mx = [-Infinity, -Infinity];
		function pr(p) { var q = [vdot(p, r), -vdot(p, u)]; return q; }
		var boxes = md.items.map(function (k) {
			var t = sc.items[k], lb = M3.localBox(t), c = [], z0 = t.z0, z1 = t.z0 + t.th;
			[[lb.x1, lb.y1, z0], [lb.x2, lb.y1, z0], [lb.x2, lb.y2, z0], [lb.x1, lb.y2, z0], [lb.x1, lb.y1, z1], [lb.x2, lb.y1, z1], [lb.x2, lb.y2, z1], [lb.x1, lb.y2, z1]].forEach(function (q) { c.push(M3.toGlobal(t.f, q[0], q[1], q[2])); });
			return { t: t, c: c, d: vdot(t.c, wv) };
		});
		boxes.sort(function (a, b) { return a.d - b.d; });
		var FACES = [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
		boxes.forEach(function (bx) {
			var cc = bx.t.c;
			FACES.forEach(function (fc) {
				var ce = [0, 0, 0]; fc.forEach(function (k) { ce = v3(ce, bx.c[k], 0.25); });
				var a = v3(bx.c[fc[1]], bx.c[fc[0]], -1), b = v3(bx.c[fc[3]], bx.c[fc[0]], -1), nn = vcross(a, b);
				if (vdot(nn, v3(ce, cc, -1)) < 0) nn = v3([0, 0, 0], nn, -1);
				if (vdot(nn, wv) <= 1e-9) return;
				var pts = fc.map(function (k) { var q = pr(bx.c[k]); mn[0] = Math.min(mn[0], q[0]); mn[1] = Math.min(mn[1], q[1]); mx[0] = Math.max(mx[0], q[0]); mx[1] = Math.max(mx[1], q[1]); return q; });
				var lit = Math.abs(vdot(vnorm(nn), up)) > 0.7 ? 0 : (Math.abs(vdot(vnorm(nn), right)) > 0.7 ? 1 : 2);
				polys.push({ pts: pts, me: bx.t === it, lit: lit });
			});
		});
		/* лицевая кромка — красной полосой по самому краю детали (1.16: не пласть); видна, даже если край сзади */
		var fs = o.frontBand && o.lab ? Dr.frontSide(o.lab.A) : '', fdir = null, fpoly = null;
		if (fs && o.eX && o.eY) {
			fdir = { T: v3([0, 0, 0], o.eY, -1), B: o.eY, L: v3([0, 0, 0], o.eX, -1), R: o.eX }[fs];
			var me = boxes.filter(function (bx) { return bx.t === it; })[0];
			if (me) FACES.slice(2).forEach(function (fc) {
				var ce = [0, 0, 0]; fc.forEach(function (k) { ce = v3(ce, me.c[k], 0.25); });
				if (vdot(vnorm(v3(ce, me.t.c, -1)), fdir) > 0.7) fpoly = { pts: fc.map(function (k) { return pr(me.c[k]); }), ce: ce };
			});
		}
		if (!polys.length) return null;
		/* деталь — поверх остальных: видна, даже если её закрывают другие */
		polys = polys.filter(function (p) { return !p.me; }).concat(polys.filter(function (p) { return p.me; }));
		var mine = polys.filter(function (p) { return p.me; });
		if (!mine.length) return null;
		/* стрелка «лицевая кромка» — к середине красной полосы, снаружи детали */
		var a0 = fpoly ? pr(fpoly.ce) : pr(it.c), L = Math.max(it.L, it.W) * 0.45, a1 = a0;
		if (fpoly) { var ext = 0; boxes.forEach(function (bx) { bx.c.forEach(function (q) { ext = Math.max(ext, vdot(v3(q, fpoly.ce, -1), fdir)); }); }); a1 = pr(v3(fpoly.ce, fdir, ext + Math.max(120, L * 0.35))); }      // конец стрелки — за пределами модуля: подпись не ложится на рисунок
		[a1].forEach(function (q) { mn[0] = Math.min(mn[0], q[0] - 4); mn[1] = Math.min(mn[1], q[1] - 4); mx[0] = Math.max(mx[0], q[0] + 4); mx[1] = Math.max(mx[1], q[1] + 4); });
		var k = Math.min(w / (mx[0] - mn[0]), h / (mx[1] - mn[1])), ox = (w - (mx[0] - mn[0]) * k) / 2 - mn[0] * k, oy = (h - (mx[1] - mn[1]) * k) / 2 - mn[1] * k;
		function tp(q) { return [ox + q[0] * k, oy + q[1] * k]; }
		/* модуль не собран (детали разбросаны) — деталь на картинке меньше 3 мм: картинки нет */
		var pm = [Infinity, Infinity, -Infinity, -Infinity];
		mine.forEach(function (p) { p.pts.forEach(function (q) { var z = tp(q); pm[0] = Math.min(pm[0], z[0]); pm[1] = Math.min(pm[1], z[1]); pm[2] = Math.max(pm[2], z[0]); pm[3] = Math.max(pm[3], z[1]); }); });
		if (Math.max(pm[2] - pm[0], pm[3] - pm[1]) < 3) return null;
		var out = polys.map(function (p) { return { pts: p.pts.map(tp), me: p.me, lit: p.lit }; });
		if (fpoly) out.push({ pts: fpoly.pts.map(tp), me: true, front: true });
		return { polys: out, arrow: fpoly ? [tp(a0), tp(a1)] : null, mod: md.name };
	}

	function mkView(o) {
		o.org = o.org || { x: 0, y: 0 };
		o.ox2 = function (axis) { return axis === 'x' ? o.org.x : o.org.y; };
		return o;
	}
	/* Виды карты: сторона А, сторона Б, торцы — только те, где есть отверстия. */
	Dr.views = function (st, card) { use(st); return viewsOf(st, card); };
	function viewsOf(st, card) {
		var t = card.t, hs = card.hs, L = t.L, W = t.W, bc = Dr.baseOf(st, card), out = [], n0 = 0;
		var bA = [[0, W], [L, W], [L, 0], [0, 0]][bc], bO = [[L, 0], [0, 0], [0, W], [L, W]][bc];
		var O = orOf(st, card), fA = O.face === 'A';
		/* сквозные — на лицевой, если на обратной глухих не больше (иначе — там, где их больше) */
		var thrOnB = ST.thru === 'A' ? !fA : (hs.bot.length === hs.top.length ? !fA : hs.bot.length > hs.top.length);
		/* сторона Б — деталь перевёрнута через длинную кромку (зеркало по Y), сторона А — как есть */
		function face(id, list) {
			var my = function (y) { return id === 'B' ? r1(W - y) : y; }, isFace = (id === 'A') === fA;
			var sh = t.shape, lab = O.lab ? O.lab[id] : null, v = mkView({
				id: id, kind: 'face', face: isFace, w: L, h: W, empty: !list.length,
				title: isFace ? 'Лицевая' : 'Обратная',
				sub: isFace ? (O.why ? 'лицо — ' + O.why : '') : 'перевёрнута через длинную кромку' + (lab && lab.B ? ': «' + lab.B + '» теперь внизу' : ''),
				holes: list.map(function (h) { return { x: h.x, y: my(h.y), d: h.d, dep: h.dep, fast: h.fast }; }),
				bx: { x: bA[0], y: my(bA[1]) }, sx: (bA[0] < L / 2) ? 'L' : 'R', sy: (my(bA[1]) > W / 2) ? 'B' : 'T',
				outline: sh.pts ? sh.pts.map(function (p) { return [p[0], my(p[1])]; }) : null,
				inner: (sh.innerPts || []).map(function (ip) { return ip.map(function (p) { return [p[0], my(p[1])]; }); }),
				edges: (sh.edges || []).map(function (e) { var sd = e.side ? (id === 'B' ? ({ T: 'B', B: 'T' }[e.side] || e.side) : e.side) : ''; return { pts: (e.line || []).map(function (p) { return [p[0], my(p[1])]; }), front: Dr.isFront(lab, sd) }; }),
				corners: [0, 1, 2, 3].map(function (c) { var q = [[0, W], [L, W], [L, 0], [0, 0]][c]; return { c: c, x: q[0], y: my(q[1]) }; }),
				elab: lab, cn: [{ n: 1, x: bA[0], y: my(bA[1]) }, { n: 3, x: bO[0], y: my(bO[1]) }]
			});
			if (!v.sub) delete v.sub;
			return v;
		}
		var la = hs.top.concat(thrOnB ? [] : hs.thr), lb = hs.bot.concat(thrOnB ? hs.thr : []);
		if (la.length || lb.length) {
			var vA = face('A', la), vB = face('B', lb);
			if (fA) out.push(vA, vB); else out.push(vB, vA);
		}
		['B', 'T', 'L', 'R'].forEach(function (sd) {
			var l = hs.edge.filter(function (h) { return h.side === sd; });
			if (!l.length) return;
			var horiz = sd === 'B' || sd === 'T', len = horiz ? L : W;
			var along = function (h) { return sd === 'B' ? h.x : (sd === 'T' ? L - h.x : (sd === 'L' ? h.y : W - h.y)); };
			var ub = sd === 'B' ? bA[0] : (sd === 'T' ? L - bA[0] : (sd === 'L' ? bA[1] : W - bA[1]));
			/* лицевая сверху: если лицевая — сторона Б, вид повёрнут на 180° (вдоль — с другого конца, по толщине — от Б) */
			var al = fA ? along : function (h) { return len - along(h); }, vv = fA ? function (h) { return h.v; } : function (h) { return r1(t.th - h.v); };
			if (!fA) ub = len - ub;
			var vs = {}; l.forEach(function (h) { vs[vv(h)] = 1; });
			var vk = Object.keys(vs), en = O.lab && O.lab.A[sd] ? O.lab.A[sd] : '';
			out.push(mkView({
				id: 'E' + sd, kind: 'edge', side: sd, w: len, h: t.th, th: t.th,
				title: en ? 'Торец — ' + en : 'Торец ' + SIDE[sd], sub: 'лицевая сверху, толщина ' + num(t.th) + (vk.length === 1 ? ', отверстия в ' + num(Number(vk[0])) + ' от лицевой' : ''),
				holes: l.map(function (h) { return { x: r1(al(h)), y: vv(h), d: h.d, dep: h.dep, fast: h.fast }; }),
				bx: { x: ub, y: 0 }, sx: ub < len / 2 ? 'L' : 'R', sy: 'B', outline: null, inner: [], corners: []
			}));
		});
		/* схема: где у детали какой торец — когда на карте есть виды торцов */
		var eds = out.filter(function (v) { return v.kind === 'edge'; }).map(function (v) { return v.side; });
		if (eds.length && ST.key && !O.lab) out.push({ id: 'K', kind: 'key', w: L, h: W, title: fA ? 'Схема: лицевая' : 'Схема: обратная', sides: eds, holes: [], groups: [], bx: { x: bA[0], y: bA[1] }, sx: bA[0] < L / 2 ? 'L' : 'R', sy: bA[1] > W / 2 ? 'B' : 'T',
							outline: t.shape.pts || null, inner: [], corners: [] });
		var tyk = {}, tyl = [];
		out.forEach(function (v) { v.holes.forEach(function (h) { var k = h.d + '|' + h.dep; if (!tyk[k]) { tyk[k] = { d: h.d, dep: h.dep, n: 0, fast: [] }; tyl.push(tyk[k]); } tyk[k].n++; if (h.fast && tyk[k].fast.indexOf(h.fast) < 0) tyk[k].fast.push(h.fast); }); });
		tyl.sort(function (a, b) { return a.d - b.d || a.dep - b.dep; });
		tyl.forEach(function (t, i) { t.ty = i; });
		out.forEach(function (v) { v.holes.forEach(function (h) { h.ty = tyk[h.d + '|' + h.dep].ty; }); });
		out.types = tyl;
		/* сквозная нумерация по карте */
		out.forEach(function (v) {
			if (v.kind === 'key') return;
			v.groups = groupHoles(v);
			v.groups.forEach(function (g) { g.n0 = n0 + 1; n0 += g.idx.length; g.n1 = n0; g.label = g.idx.length > 1 ? g.n0 + '–' + g.n1 : String(g.n0); if (ST.numText === 'drill') { var h0 = v.holes[g.idx[0]]; g.label = 'Ø' + num(h0.d) + (h0.dep ? '×' + num(h0.dep) : ' скв.'); } });
		});
		return out;
	}

	/* ============================ раскладка надписей =========================== */

	/* Ступеньки: каждой надписи — место p вдоль оси и ряд, в которых она не задевает соседей и
	   чужие штрихи. Надпись может отойти от своей засечки не дальше JOG (штрих идёт с изломом)
	   или уйти в следующий ряд. items: [{ u — засечка, w — ширина надписи вдоль оси }].
	   tier = 0 — не поместилась (такое место уйдёт в выносной вид).                       */
	function tierPass(items, maxT, dir) {
		var placed = [], lost = [], fails = 0, shift = 0, i, j, T, prev = null;
		var list = items.slice(0).sort(function (a, b) { return dir * (a.u - b.u); });
		for (i = 0; i < list.length; i++) {
			var it = list[i], res = null;
			for (T = 1; T <= maxT && !res; T++) {
				var p = it.u, moved = true, guard = 0;
				if (prev !== null && dir * (p - prev) < 0.7) p = prev + dir * 0.7;
				while (moved && guard++ < 40) {
					moved = false;
					for (j = 0; j < placed.length; j++) {
						var q = placed[j], need = q.tier === T ? (q.w + it.w) / 2 + GAPL : (q.tier < T ? q.w / 2 + GAPC : it.w / 2 + GAPC);
						if (Math.abs(q.p - p) < need - 1e-6) { p = q.p + dir * need; moved = true; }
					}
				}
				if (Math.abs(p - it.u) <= JOG + 1e-6) res = { p: p, tier: T };
			}
			if (res) { placed.push({ p: res.p, w: it.w, tier: res.tier, it: it }); prev = res.p; shift += Math.abs(res.p - it.u); }
			else { lost.push({ p: it.u, it: it, fail: 1 }); fails++; }
		}
		return { placed: placed.concat(lost), fails: fails, shift: shift };
	}
	function tierPlace(items, maxT) {
		var a = tierPass(items, maxT, 1), b = tierPass(items, maxT, -1), best = (b.fails < a.fails || (b.fails === a.fails && b.shift < a.shift - 0.01)) ? b : a;
		best.placed.forEach(function (q) { q.it.tier = q.fail ? 0 : q.tier; q.it.p = q.p; });
	}

	/* Засечки оси: значения от базы, какие подписаны, размеры шага. */
	function axisTicks(view, axis, s) {
		var hs = view.holes, map = {}, ticks = [], brackets = [], gi, k;
		function tick(val, u, labelled, hole) {
			var key = String(Math.round(val * 10)), t = map[key];
			if (!t) { t = map[key] = { val: r1(val), u: u, lab: false, holes: [] }; ticks.push(t); }
			if (labelled) { t.lab = true; if (hole >= 0 && t.holes.indexOf(hole) < 0) t.holes.push(hole); }
			return t;
		}
		function val(h) { return Math.abs(h[axis] + view.ox2(axis) - view.bx[axis]); }
		for (gi = 0; gi < view.groups.length; gi++) {
			var g = view.groups[gi], first = g.idx[0];
			if (g.row === axis) {
				tick(val(hs[first]), hs[first][axis] * s, true, first);
				for (k = 1; k < g.idx.length; k++) tick(val(hs[g.idx[k]]), hs[g.idx[k]][axis] * s, false, -1);
				var a = hs[first][axis] * s, b = hs[g.idx[g.idx.length - 1]][axis] * s;
				var bt = (g.idx.length - 1) + ' × ' + num(g.step), dup = false;
				brackets.forEach(function (o) { if (o.text === bt && Math.abs(o.a - Math.min(a, b)) < 0.05 && Math.abs(o.b - Math.max(a, b)) < 0.05) dup = true; });
				if (!dup) brackets.push({ a: Math.min(a, b), b: Math.max(a, b), text: bt });
			} else if (g.row) tick(val(hs[first]), hs[first][axis] * s, true, first);
			else tick(val(hs[first]), hs[first][axis] * s, true, first);
		}
		var lab = ticks.filter(function (t) { return t.lab; }), maxLen = 0, span = 0;
		lab.forEach(function (t) { t.text = num(t.val); t.len = tw(t.text) * FS; t.w = TH; if (t.len > maxLen) maxLen = t.len; });
		tierPlace(lab, 3);
		var nT = 0;
		lab.forEach(function (t) { if (t.tier > nT) nT = t.tier; });
		var depth = nT ? T0 + nT * maxLen + (nT - 1) * TGAP + 0.8 : 1.5;
		/* размеры шага — полосами дальше надписей */
		var lanes = [];
		brackets.sort(function (p, q) { return p.a - q.a; });
		brackets.forEach(function (br) {
			var wt = tw(br.text) * FS, span = br.b - br.a;
			br.wt = wt;
			var mid = (br.a + br.b) / 2, len = (axis === 'x' ? view.w : view.h) * s;
			br.tx = wt <= len ? Math.max(wt / 2, Math.min(len - wt / 2, mid)) : len / 2;
			br.e0 = Math.min(br.a, br.tx - wt / 2 - 0.5); br.e1 = Math.max(br.b, br.tx + wt / 2 + 0.5);
			var li = 0;
			while (lanes[li] !== undefined && lanes[li] > br.e0 - 1.5) li++;
			lanes[li] = br.e1;
			br.lane = li;
		});
		var depthAll = depth + lanes.length * LANE, alen = (axis === 'x' ? view.w : view.h) * s, over0 = 0, over1 = 0;
		lab.forEach(function (t) { if (!t.tier) return; over0 = Math.max(over0, TH / 2 - t.p); over1 = Math.max(over1, t.p + TH / 2 - alen); });
		return { ticks: ticks, lab: lab, brackets: brackets, maxLen: maxLen, nT: nT, depth: depth, depthAll: depthAll, over0: over0, over1: over1, fails: lab.filter(function (t) { return !t.tier; }) };
	}

	/* Номера у отверстий на виде пласти: рядом с отверстием, не задевая отверстия, другие номера и контур. */
	function placeNumbers(view, s, pw, ph, extra) {
		var hs = view.holes, obst = [], out = [], fails = [], leads = [], i, gi;
		if (ST.num === 'none') return { list: [], fails: [] };
		function rr(h) { return hr(h, s); }
		for (i = 0; i < hs.length; i++) { var r = rr(hs[i]) + 0.35; obst.push({ x: hs[i].x * s - r, y: hs[i].y * s - r, w: 2 * r, h: 2 * r }); }
		(extra || []).forEach(function (b) { obst.push(b); });
		var segs = [];
		function poly(pts) { for (var q = 0; q < pts.length; q++) { var a = pts[q], b = pts[(q + 1) % pts.length]; segs.push([(a[0] - view.org.x) * s, (a[1] - view.org.y) * s, (b[0] - view.org.x) * s, (b[1] - view.org.y) * s]); } }
		if (view.outline) poly(view.outline);
		(view.inner || []).forEach(poly);
		var DIRS = [[1, -1], [-1, -1], [1, 1], [-1, 1], [1, 0], [-1, 0], [0, -1], [0, 1]];
		for (gi = 0; gi < view.groups.length; gi++) {
			var g = view.groups[gi], h = hs[g.idx[0]], cx = h.x * s, cy = h.y * s, r0 = rr(h);
			var bw = numW(g.label), bh = numH(), found = null;
			var RINGS = ST.numText === 'drill' ? [0.3, 1.6, 3.4, 6, 9, 13, 18, 24, 32] : [0.3, 1.6, 3.4, 6, 9, 13];      // подпись «Ø5×12» длиннее номера — ей можно отойти дальше
			for (var ri = 0; ri < RINGS.length && !found; ri++) {
				for (var di = 0; di < DIRS.length && !found; di++) {
					var dx = DIRS[di][0], dy = DIRS[di][1], gap = r0 + RINGS[ri];
					var bx = cx + dx * (gap + bw / 2) * (dy ? 0.72 : 1) - bw / 2, by = cy + dy * (gap + bh / 2) * (dx ? 0.72 : 1) - bh / 2;
					if (!dx) bx = cx - bw / 2;
					if (!dy) by = cy - bh / 2;
					var box = { x: bx, y: by, w: bw, h: bh };
					if (bx < 0.5 || by < 0.5 || bx + bw > pw - 0.5 || by + bh > ph - 0.5) continue;
					var bad = false, q;
					for (q = 0; q < obst.length && !bad; q++) bad = hit(box, obst[q], 0.3);
					for (q = 0; q < segs.length && !bad; q++) bad = segHitsRect(segs[q][0], segs[q][1], segs[q][2], segs[q][3], { x: bx - 0.3, y: by - 0.3, w: bw + 0.6, h: bh + 0.6 });
					if (!bad && view.outline && !geom.pointIn(view.outline, bx / s + view.org.x + bw / 2 / s, by / s + view.org.y + bh / 2 / s)) bad = true;
					/* выноска от отверстия к надписи не идёт через чужие отверстия и надписи, а надпись не ложится на чужую выноску */
					var lead = ri > 0 ? [cx + dx * r0 * 0.75, cy + dy * r0 * 0.75, dx > 0 ? bx : (dx < 0 ? bx + bw : cx), dy > 0 ? by : (dy < 0 ? by + bh : cy)] : null;
					for (q = 0; lead && q < obst.length && !bad; q++) if (q !== g.idx[0] && !(q < hs.length && cx > obst[q].x && cx < obst[q].x + obst[q].w && cy > obst[q].y && cy < obst[q].y + obst[q].h)) bad = segHitsRect(lead[0], lead[1], lead[2], lead[3], { x: obst[q].x - 0.15, y: obst[q].y - 0.15, w: obst[q].w + 0.3, h: obst[q].h + 0.3 });
					for (q = 0; q < leads.length && !bad; q++) bad = segHitsRect(leads[q][0], leads[q][1], leads[q][2], leads[q][3], { x: bx - 0.2, y: by - 0.2, w: bw + 0.4, h: bh + 0.4 });
					if (!bad) found = { box: box, lead: lead };
				}
			}
			if (found) { obst.push(found.box); if (found.lead) leads.push(found.lead); out.push({ g: g, box: found.box, lead: found.lead }); }
			else fails.push(g.idx[0]);
		}
		return { list: out, fails: fails };
	}
	/* Номера над полосой торца: ступеньками в два ряда. */
	function placeNumbersEdge(view, s) {
		var hs = view.holes, items = view.groups.map(function (g) { return { g: g, u: hs[g.idx[0]].x * s, w: numW(g.label) }; });
		if (ST.num === 'none') return { list: [], fails: [], nT: 0 };
		var jog0 = JOG;
		if (ST.numText === 'drill') items.forEach(function (it) { JOG = Math.max(JOG, it.w / 2 + GAPC + 1.5); });
		tierPlace(items, 2);
		JOG = jog0;
		return { list: items.filter(function (i) { return i.tier; }), fails: items.filter(function (i) { return !i.tier; }).map(function (i) { return i.g.idx[0]; }), nT: Math.max.apply(null, [0].concat(items.map(function (i) { return i.tier; }))) };
	}

	/* Вид на бумаге в масштабе s: размеры блока, надписи, что не поместилось. Выносные виды —
	   дочерними блоками. Рисование — отдельно, в block.svg(ox, oy, opt).                    */
	function layoutView(view, s, lvl) {
		if (view.kind === 'key') return layoutKey(view);
		if (view.kind === 'pic') return { view: view, pic: 1, s: 1, sv: 1, pw: view.w, ph: view.h, mL: 0, mR: 0, mT: 0, mB: 0, w: view.w, h: CAPH + view.h, details: [], unresolved: 0, nFail: 0 };
		var edge = view.kind === 'edge';
		var pw = view.w * s, ph = edge ? Math.max(view.h * s, 5) : view.h * s, sv = edge ? ph / view.h : s;
		var ax = axisTicks(view, 'x', s), ay = edge ? null : axisTicks(view, 'y', s);
		var mL = PADS, mR = PADS, mT = PADS, mB = PADS;
		if (view.sy === 'B') mB = ax.depthAll + 1; else mT = ax.depthAll + 1;
		if (ay) { if (view.sx === 'L') mL = ay.depthAll + 1; else mR = ay.depthAll + 1; }
		mL = Math.max(mL, ax.over0 + 0.6); mR = Math.max(mR, ax.over1 + 0.6);
		if (ay) { mT = Math.max(mT, ay.over0 + 0.6); mB = Math.max(mB, ay.over1 + 0.6); }
		var nums, numLane = 0;
		if (edge) {
			nums = placeNumbersEdge(view, s); numLane = nums.nT * (TH + 1.2) + (nums.nT ? T0 : 0);
			if (view.sy === 'B') mT = Math.max(mT, numLane + 1); else mB = Math.max(mB, numLane + 1);
			nums.list.forEach(function (it) { mL = Math.max(mL, it.w / 2 - it.p + 0.6); mR = Math.max(mR, it.p + it.w / 2 - pw + 0.6); });
		}
		else nums = placeNumbers(view, s, pw, ph, baseMark(view, s, pw, ph).boxes);
		/* что не поместилось → отверстия, которым нужен вынос */
		var bad = {}, i;
		ax.fails.forEach(function (t) { t.holes.forEach(function (h) { bad[h] = 1; }); });
		if (ay) ay.fails.forEach(function (t) { t.holes.forEach(function (h) { bad[h] = 1; }); });
		nums.fails.forEach(function (h) { bad[h] = 1; });
		var badList = Object.keys(bad).map(Number);
		var details = [], unresolved = 0;
		if (badList.length && !lvl) details = makeDetails(view, s, badList);
		else unresolved = badList.length;
		/* подписи краёв (ПЕРЕД, ВЕРХ…) — полосой снаружи, за размерами; номера углов ① ③ — во внешних углах поля вида */
		var lane = null;
		if (view.kind === 'face' && !view.detail && (view.elab || view.cn)) {
			var LB = FSE + 1.4, mm = { T: mT, B: mB, L: mL, R: mR }, dimS = { T: view.sy === 'T', B: view.sy === 'B', L: !!ay && view.sx === 'L', R: !!ay && view.sx === 'R' };
			lane = { at: {}, txt: {} };
			['T', 'B', 'L', 'R'].forEach(function (sd) {
				var t = view.elab && view.elab[sd] ? view.elab[sd] : '';
				if (t && view.elab.band && view.elab.band[sd]) t += Dr.isFront(view.elab, sd) ? ' · лицевая кромка' : ' · кромка';
				else if (!t && Dr.isFront(view.elab, sd) && view.elab.band && view.elab.band[sd]) t = 'лицевая кромка';
				var room = (sd === 'T' || sd === 'B' ? pw : ph) - 1;
				if (t && tw(t, true) * FSE > room && Dr.isFront(view.elab, sd) && view.elab.band[sd]) t = (view.elab[sd] || 'лицевая') + ' · кромка';
				if (t && tw(t, true) * FSE > room) t = view.elab[sd];
				if (t && tw(t, true) * FSE > room) t = '';
				var base = dimS[sd] ? mm[sd] : Math.min(mm[sd], PADS);
				if (t) { lane.txt[sd] = t; lane.at[sd] = base + 0.4 + LB / 2; mm[sd] = Math.max(mm[sd], base + LB + 0.6); }
				mm[sd] = Math.max(mm[sd], (dimS[sd] ? base : 0) + 2 * RC + 0.8);      // кружок угла — дальше размеров
			});
			mT = mm.T; mB = mm.B; mL = mm.L; mR = mm.R;
		}
		var subH = (view.sub && !view.detail) ? FSN * 1.25 : 0;
		var capW = Math.max(tw((view.detail ? 'Вынос ' + view.detail : view.title) + ' · М ' + scaleText(s), true), subH ? tw(view.sub, true) : 0) * FSN;
		var w = mL + pw + mR, h = CAPH + subH + mT + ph + mB;
		return { view: view, s: s, sv: sv, pw: pw, ph: ph, mL: mL, mR: mR, mT: mT, mB: mB, ax: ax, ay: ay, nums: nums, numLane: numLane, subH: subH, w: Math.max(w, capW + 0.5), h: h, lane: lane,
				 details: details, unresolved: unresolved, nFail: badList.length };
	}

	/* Схема сторон: маленький контур детали с подписями торцов, на которых есть отверстия. */
	function layoutKey(view) {
		var k = Math.min(46 / view.w, 30 / view.h), pw = view.w * k, ph = view.h * k, side = tw('верхний') * FSN + 2;
		return { view: view, key: 1, s: k, sv: k, pw: pw, ph: ph, mL: side, mR: side, mT: FSN + 2, mB: FSN + 2, w: Math.max(pw + 2 * side, tw(view.title, true) * FSN), h: CAPH + ph + 2 * (FSN + 2), details: [], unresolved: 0, nFail: 0 };
	}
	function drawKey(b, ox, oy) {
		var v = b.view, g = [], px = ox + b.mL, py = oy + CAPH + b.mT, pw = b.pw, ph = b.ph, k = b.s;
		g.push(txt(ox, oy + CAPH - 1.8, v.title, capOpt()));
		if (v.outline) g.push('<path d="' + v.outline.map(function (p, q) { return (q ? 'L' : 'M') + f2(px + p[0] * k) + ' ' + f2(py + p[1] * k); }).join(' ') + ' Z" fill="#fff" stroke="#000" stroke-width="' + LW(0.35) + '"/>');
		else g.push('<rect x="' + f2(px) + '" y="' + f2(py) + '" width="' + f2(pw) + '" height="' + f2(ph) + '" fill="#fff" stroke="#000" stroke-width="' + LW(0.35) + '"/>');
		var cx = px + (v.sx === 'L' ? 0 : pw), cy = py + (v.sy === 'B' ? ph : 0), kx = v.sx === 'L' ? -2 : 2, ky = v.sy === 'B' ? 2 : -2;
		g.push('<path class="base" d="M' + f2(cx) + ' ' + f2(cy) + 'l' + f2(kx) + ' 0l' + f2(-kx) + ' ' + f2(ky) + 'z" fill="#0E6B5A"/>');
		v.sides.forEach(function (sd) {
			if (sd === 'T') g.push(line(px, py, px + pw, py, 0.9) + txt(px + pw / 2, py - 1.4, SIDE.T, { fs: FSN, anchor: 'middle' }));
			if (sd === 'B') g.push(line(px, py + ph, px + pw, py + ph, 0.9) + txt(px + pw / 2, py + ph + FSN, SIDE.B, { fs: FSN, anchor: 'middle' }));
			if (sd === 'L') g.push(line(px, py, px, py + ph, 0.9) + txt(px - 1.2, py + ph / 2 + 1.2, SIDE.L, { fs: FSN, anchor: 'end' }));
			if (sd === 'R') g.push(line(px + pw, py, px + pw, py + ph, 0.9) + txt(px + pw + 1.2, py + ph / 2 + 1.2, SIDE.R, { fs: FSN, anchor: 'start' }));
		});
		return '<g class="dv" data-v="K">' + g.join('') + '</g>';
	}

	/* «Где деталь»: модуль в изометрии, деталь цветом, стрелка «лицевая». */
	function drawPic(b, ox, oy, boxes) {
		var v = b.view, P0 = v.pic, g = [], x0 = ox, y0 = oy + CAPH, cap = clipText('Где деталь · ' + P0.mod, FSN, v.w);
		g.push(txt(ox, oy + CAPH - 1.8, cap, capOpt()));
		boxes.push({ x: ox, y: oy + CAPH - 1.8 - FSN * 0.75, w: tw(cap, true) * FSN, h: FSN * 0.8, kind: 'pcap', text: cap });
		g.push('<rect x="' + f2(x0) + '" y="' + f2(y0) + '" width="' + f2(v.w) + '" height="' + f2(v.h) + '" rx="1.5" fill="#f6f7f8" stroke="#dde1e4" stroke-width="0.2"/>');
		var FILL = ['#e9ecee', '#dfe3e6', '#f3f5f6'];
		P0.polys.forEach(function (p) {
			g.push('<path d="M' + p.pts.map(function (q) { return f2(x0 + q[0]) + ' ' + f2(y0 + q[1]); }).join('L') + 'Z" fill="' + (p.front ? FRONT : (p.me ? (p.lit === 0 ? '#14826d' : '#0E6B5A') : FILL[p.lit])) + '"' + (p.me ? ' fill-opacity="0.85"' : '') + ' stroke="' + (p.front ? FRONT : (p.me ? '#0a5546' : '#9aa3ab')) + '" stroke-width="' + (p.front ? '0.7' : '0.12') + '" stroke-linejoin="round"/>');      // кромка тонкая — обводка толще, чтобы полосу было видно
		});
		if (!P0.arrow) return '<g class="dv" data-v="P">' + g.join('') + '</g>';                     // лицевой кромки нет — без стрелки
		/* подпись «лицевая кромка» — в свободном углу картинки (не на модуле), от неё стрелка к красной полосе */
		var lt = ['лицевая', 'кромка'], lw = Math.max(tw(lt[0], true), tw(lt[1], true)) * FSE, lh = FSE * 2.2, ex = P0.arrow[0][0], ey = P0.arrow[0][1];
		function inPoly(px, py, pts) { var c = false; for (var i2 = 0, j2 = pts.length - 1; i2 < pts.length; j2 = i2++) { var xi = pts[i2][0], yi = pts[i2][1], xj = pts[j2][0], yj = pts[j2][1]; if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) c = !c; } return c; }
		function hits(rx, ry) { var n = 0; for (var sx = 0; sx <= 4; sx++) for (var sy = 0; sy <= 2; sy++) { var px = rx + lw * sx / 4, py = ry - lh + lh * sy / 2; if (P0.polys.some(function (p) { return inPoly(px, py, p.pts); })) n++; } return n; }
		var cand = [[1.2, lh + 0.8], [v.w - lw - 1.2, lh + 0.8], [1.2, v.h - 1.2], [v.w - lw - 1.2, v.h - 1.2]].map(function (q) { return { x: q[0], y: q[1], h: hits(q[0], q[1]), d: Math.hypot(q[0] + lw / 2 - ex, q[1] - lh / 2 - ey) }; });
		cand.sort(function (p1, p2) { return p1.h - p2.h || p1.d - p2.d; });
		var lx = cand[0].x, ly = cand[0].y, sx2 = lx + lw / 2, sy2 = ly < ey ? ly + 0.8 : ly - lh - 0.2;          // начало стрелки — у подписи, со стороны полосы
		var ax = x0 + ex, ay = y0 + ey, bx = x0 + sx2, by = y0 + sy2, dx = ax - bx, dy = ay - by, l = Math.sqrt(dx * dx + dy * dy) || 1, ux = dx / l, uy = dy / l;
		ax -= ux * 1.2; ay -= uy * 1.2;
		g.push(line(bx, by, ax, ay, 0.4, '', '#d9480f') + '<path d="M' + f2(ax + ux * 1.4) + ' ' + f2(ay + uy * 1.4) + 'L' + f2(ax - uy * 1) + ' ' + f2(ay + ux * 1) + 'L' + f2(ax + uy * 1) + ' ' + f2(ay - ux * 1) + 'Z" fill="#d9480f"/>');
		lt.forEach(function (t2, k2) { g.push('<text x="' + f2(x0 + lx) + '" y="' + f2(y0 + ly - (1 - k2) * FSE * 1.1) + '" font-size="' + f2(FSE) + '" font-weight="700" fill="#d9480f" paint-order="stroke" stroke="#f6f7f8" stroke-width="0.8">' + esc(t2) + '</text>'); });
		return '<g class="dv" data-v="P">' + g.join('') + '</g>';
	}

	/* Знак базового угла: треугольник и слово «база», если оно никому не мешает. */
	function baseMark(view, s, pw, ph) {
		if (view.detail) return { boxes: [] };
		/* треугольник снаружи угла, в четверти между двумя рядами засечек: ничего не заслоняет */
		return { x: view.sx === 'L' ? 0 : pw, y: view.sy === 'B' ? ph : 0, k: 2, boxes: [] };
	}

	/* Выносные виды для тесных мест. */
	function makeDetails(view, s, badList) {
		var hs = view.holes, clusters = [], i, j;
		badList.forEach(function (h) {
			var c = null;
			for (i = 0; i < clusters.length && !c; i++) for (j = 0; j < clusters[i].length && !c; j++) {
				var o = hs[clusters[i][j]];
				if (Math.hypot((o.x - hs[h].x) * s, (o.y - hs[h].y) * s) <= 14) c = clusters[i];
			}
			if (c) c.push(h); else clusters.push([h]);
		});
		/* склеить скопления, которые оказались рядом */
		var merged = true;
		while (merged) {
			merged = false;
			for (i = 0; i < clusters.length && !merged; i++) for (j = i + 1; j < clusters.length && !merged; j++) {
				var near = false;
				clusters[i].forEach(function (a) { clusters[j].forEach(function (b) { if (Math.hypot((hs[a].x - hs[b].x) * s, (hs[a].y - hs[b].y) * s) <= 14) near = true; }); });
				if (near) { clusters[i] = clusters[i].concat(clusters[j]); clusters.splice(j, 1); merged = true; }
			}
		}
		var out = [];
		clusters.forEach(function (cl, ci) {
			var x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
			cl.forEach(function (h) { var r = hs[h].d / 2; x1 = Math.min(x1, hs[h].x - r); x2 = Math.max(x2, hs[h].x + r); y1 = Math.min(y1, hs[h].y - r); y2 = Math.max(y2, hs[h].y + r); });
			var pad = view.kind === 'edge' ? 14 : 18;
			x1 = Math.max(0, x1 - pad); x2 = Math.min(view.w, x2 + pad);
			if (view.kind === 'edge') { y1 = 0; y2 = view.h; } else { y1 = Math.max(0, y1 - pad); y2 = Math.min(view.h, y2 + pad); }
			/* отверстие, чей центр попал в окно, должно быть видно целиком — окно растёт, пока это не так */
			var inside = [], grown = true, guard = 0;
			while (grown && guard++ < 8) {
				grown = false; inside = [];
				for (i = 0; i < hs.length; i++) {
					if (!(hs[i].x >= x1 - 0.01 && hs[i].x <= x2 + 0.01 && hs[i].y >= y1 - 0.01 && hs[i].y <= y2 + 0.01)) continue;
					inside.push(i);
					var rr2 = hs[i].d / 2 + 3, nx1 = Math.max(0, Math.min(x1, hs[i].x - rr2)), nx2 = Math.min(view.w, Math.max(x2, hs[i].x + rr2));
					var ny1 = view.kind === 'edge' ? y1 : Math.max(0, Math.min(y1, hs[i].y - rr2)), ny2 = view.kind === 'edge' ? y2 : Math.min(view.h, Math.max(y2, hs[i].y + rr2));
					if (nx1 < x1 - 0.01 || nx2 > x2 + 0.01 || ny1 < y1 - 0.01 || ny2 > y2 + 0.01) { x1 = nx1; x2 = nx2; y1 = ny1; y2 = ny2; grown = true; }
				}
			}
			var letter = 'АБВГДЕЖИКЛМНПРСТ'.charAt(ci % 16);
			var best = null;
			for (var k = 0; k < DSCALES.length; k++) {
				var sd = DSCALES[k];
				if (sd <= s * 1.3) continue;
				if ((x2 - x1) * sd > 125 || (y2 - y1) * sd > 85) break;
				var dv = mkView({
					id: view.id + letter, kind: view.kind, detail: letter, side: view.side, th: view.th, w: x2 - x1, h: y2 - y1, org: { x: x1, y: y1 },
					title: 'Вынос ' + letter, bx: view.bx, sx: view.sx, sy: view.sy, outline: view.outline, inner: view.inner, corners: [],
					holes: inside.map(function (q) { return { x: hs[q].x - x1, y: hs[q].y - y1, d: hs[q].d, dep: hs[q].dep, fast: hs[q].fast, ty: hs[q].ty, src: q }; }),
					full: { w: view.w, h: view.h }
				});
				/* в выносе каждое отверстие подписано своим номером; ряд — номером ряда у первого видимого */
				var seenG = {};
				dv.groups = [];
				inside.forEach(function (q, qi) {
					var g = null;
					view.groups.forEach(function (gg) { if (gg.idx.indexOf(q) >= 0) g = gg; });
					var lab = g.idx.length > 1 ? (seenG[g.n0] ? '' : g.label) : g.label;
					seenG[g.n0] = 1;
					dv.groups.push({ row: '', idx: [qi], step: 0, label: lab || (ST.numText === 'drill' ? g.label : String(g.n0 + g.idx.indexOf(q))), n0: g.n0 });
				});
				var lay = layoutView(dv, sd, 1);
				best = lay;
				if (!lay.nFail) break;
			}
			if (best) { best.win = { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }; best.letter = letter; out.push(best); }
		});
		return out;
	}

	/* ================================ рисование ================================ */

	function txt(x, y, s, o) {
		o = o || {};
		return '<text x="' + f2(x) + '" y="' + f2(y) + '" font-size="' + f2(o.fs || FS) + '"' + (o.anchor ? ' text-anchor="' + o.anchor + '"' : '') + (o.bold ? ' font-weight="700"' : '') +
			   (o.fill ? ' fill="' + o.fill + '"' : '') + (o.rot ? ' transform="rotate(-90 ' + f2(x) + ' ' + f2(y) + ')"' : '') + (o.cls ? ' class="' + o.cls + '"' : '') + '>' + esc(s) + '</text>';
	}
	function line(x1, y1, x2, y2, w, dash, col) {
		return '<line x1="' + f2(x1) + '" y1="' + f2(y1) + '" x2="' + f2(x2) + '" y2="' + f2(y2) + '" stroke="' + (col || '#000') + '" stroke-width="' + LW(w) + '"' + (dash ? ' stroke-dasharray="' + dash + '"' : '') + '/>';
	}
	/* Отверстие на чертеже. Обычно — тонкий контур в масштабе с крестиком в центре (у сквозного
	   крестик выходит за контур); в оформлении «значки» — значок своего сверла. */
	function holeSvg(cx, cy, h, s) { return markSvg(cx, cy, hr(h, s), h.ty, !h.dep); }
	function markSvg(cx, cy, r, ty, thru) {
		var col = colorOf(ty);
		if (ST.hole === 'sym') return glyph(ty || 0, cx, cy, r, col);
		var ring = '<circle cx="' + f2(cx) + '" cy="' + f2(cy) + '" r="' + f2(r) + '" fill="#fff" stroke="' + col + '" stroke-width="' + LW(0.3) + '"/>';
		if (thru) return ring + line(cx - r - 0.7, cy, cx + r + 0.7, cy, 0.18, '', col) + line(cx, cy - r - 0.7, cx, cy + r + 0.7, 0.18, '', col);
		var cr = Math.min(0.7, r * 0.55);
		return ring + line(cx - cr, cy, cx + cr, cy, 0.18, '', col) + line(cx, cy - cr, cx, cy + cr, 0.18, '', col);
	}

	/* Значок сверла: у каждого диаметра с глубиной свой. Восемь круглых, дальше — квадраты, ромбы, треугольники. */
	var GLYPHS = 14;
	function glyph(ty, cx, cy, r, col) {
		col = col || '#000';
		var c0 = 'cx="' + f2(cx) + '" cy="' + f2(cy) + '"', w = LW(0.3), d = r * 0.7071, k = ty % GLYPHS;
		var ring = '<circle ' + c0 + ' r="' + f2(r) + '" fill="#fff" stroke="' + col + '" stroke-width="' + w + '"/>';
		function poly(pts, fill) { return '<path d="M' + pts.map(function (p) { return f2(cx + p[0] * r) + ' ' + f2(cy + p[1] * r); }).join('L') + 'Z" fill="' + (fill ? col : '#fff') + '" stroke="' + col + '" stroke-width="' + w + '" stroke-linejoin="round"/>'; }
		switch (k) {
			case 0: return '<circle ' + c0 + ' r="' + f2(r) + '" fill="' + col + '"/>';
			case 1: return ring;
			case 2: return ring + line(cx - r, cy, cx + r, cy, 0.2, '', col) + line(cx, cy - r, cx, cy + r, 0.2, '', col);
			case 3: return ring + '<circle ' + c0 + ' r="' + f2(r * 0.45) + '" fill="' + col + '"/>';
			case 4: return ring + '<path d="M' + f2(cx) + ' ' + f2(cy - r) + 'A' + f2(r) + ' ' + f2(r) + ' 0 0 0 ' + f2(cx) + ' ' + f2(cy + r) + 'Z" fill="' + col + '"/>';
			case 5: return ring + line(cx - d, cy - d, cx + d, cy + d, 0.2, '', col) + line(cx - d, cy + d, cx + d, cy - d, 0.2, '', col);
			case 6: return ring + '<path d="M' + f2(cx - r) + ' ' + f2(cy) + 'A' + f2(r) + ' ' + f2(r) + ' 0 0 0 ' + f2(cx + r) + ' ' + f2(cy) + 'Z" fill="' + col + '"/>';
			case 7: return ring + line(cx - r, cy, cx + r, cy, 0.2, '', col);
			case 8: return poly([[-0.9, -0.9], [0.9, -0.9], [0.9, 0.9], [-0.9, 0.9]], 0);
			case 9: return poly([[-0.9, -0.9], [0.9, -0.9], [0.9, 0.9], [-0.9, 0.9]], 1);
			case 10: return poly([[0, -1], [1, 0], [0, 1], [-1, 0]], 0);
			case 11: return poly([[0, -1], [1, 0], [0, 1], [-1, 0]], 1);
			case 12: return poly([[0, -1], [0.95, 0.8], [-0.95, 0.8]], 0);
			default: return poly([[0, -1], [0.95, 0.8], [-0.95, 0.8]], 1);
		}
	}
	Dr.glyph = glyph;

	/* Нарисовать блок вида в точке (ox, oy) листа. boxes — прямоугольники надписей и отверстий для проверки. */
	function drawView(b, ox, oy, opt, boxes, uid) {
		if (b.key) return drawKey(b, ox, oy);
		if (b.pic) return drawPic(b, ox, oy, boxes);
		var v = b.view, s = b.s, sv = b.sv, edge = v.kind === 'edge', g = [], i;
		var px = ox + b.mL, py = oy + CAPH + (b.subH || 0) + b.mT, pw = b.pw, ph = b.ph;
		function tbox(x, y, w, h, kind, text) { boxes.push({ x: x, y: y, w: w, h: h, kind: kind, text: text }); }
		/* подпись вида */
		var cap = v.detail ? ('Вынос ' + v.detail + ' · М ' + scaleText(s)) : (v.title + ' · М ' + scaleText(s));
		g.push(txt(ox, oy + CAPH - 1.8, cap, capOpt()));
		if (b.subH) g.push(txt(ox, oy + CAPH - 1.8 + b.subH, v.sub, capOpt()));
		/* контур */
		var clip = 'dc' + uid;
		if (v.detail) {
			g.push('<clipPath id="' + clip + '"><rect x="' + f2(px) + '" y="' + f2(py) + '" width="' + f2(pw) + '" height="' + f2(ph) + '"/></clipPath>');
			g.push('<rect x="' + f2(px) + '" y="' + f2(py) + '" width="' + f2(pw) + '" height="' + f2(ph) + '" fill="#fff" stroke="#666" stroke-width="' + LW(0.15) + '" stroke-dasharray="2 1"/>');
			var body;
			if (v.outline) body = '<path d="' + v.outline.map(function (p, q) { return (q ? 'L' : 'M') + f2(px + (p[0] - v.org.x) * s) + ' ' + f2(py + (p[1] - v.org.y) * sv); }).join(' ') + ' Z" fill="none" stroke="#000" stroke-width="' + LW(0.4) + '"/>';
			else body = '<rect x="' + f2(px - v.org.x * s) + '" y="' + f2(py - v.org.y * sv) + '" width="' + f2(v.full.w * s) + '" height="' + f2(v.full.h * sv) + '" fill="none" stroke="#000" stroke-width="' + LW(0.4) + '"/>';
			g.push('<g clip-path="url(#' + clip + ')">' + body + '</g>');
		} else if (v.outline) {
			g.push('<path d="' + v.outline.map(function (p, q) { return (q ? 'L' : 'M') + f2(px + p[0] * s) + ' ' + f2(py + p[1] * s); }).join(' ') + ' Z" fill="#fff" stroke="#000" stroke-width="' + LW(0.4) + '"/>');
			v.inner.forEach(function (ip) { g.push('<path d="' + ip.map(function (p, q) { return (q ? 'L' : 'M') + f2(px + p[0] * s) + ' ' + f2(py + p[1] * s); }).join(' ') + ' Z" fill="#eee" stroke="#000" stroke-width="' + LW(0.3) + '"/>'); });
			g.push('<rect x="' + f2(px) + '" y="' + f2(py) + '" width="' + f2(pw) + '" height="' + f2(ph) + '" fill="none" stroke="#888" stroke-width="' + LW(0.12) + '" stroke-dasharray="1.5 1.5"/>');
		} else g.push('<rect x="' + f2(px) + '" y="' + f2(py) + '" width="' + f2(pw) + '" height="' + f2(ph) + '" fill="#fff" stroke="#000" stroke-width="' + LW(0.4) + '"/>');
		/* лицевая и обратная: кромка, пустая сторона, подписи краёв, номера углов */
		if (v.kind === 'face' && !v.detail) {
			if (v.empty) {
				g.push('<rect x="' + f2(px) + '" y="' + f2(py) + '" width="' + f2(pw) + '" height="' + f2(ph) + '" fill="#f2f4f5" stroke="none"/>');
				var et = 'отверстий нет', ew = tw(et) * FSN;
				if (ew < pw - 2 && FSN < ph - 2) { g.push(txt(px + pw / 2, py + ph / 2 + FSN * 0.35, et, { fs: FSN, anchor: 'middle', fill: '#8a949c' })); tbox(px + pw / 2 - ew / 2, py + ph / 2 - FSN * 0.4, ew, FSN * 0.8, 'note', et); }
			}
			/* кромка — зелёным, лицевая (по краю ПЕРЕД) — красным */
			(v.edges || []).forEach(function (ln) { if (ln.pts.length > 1) g.push('<polyline points="' + ln.pts.map(function (p) { return f2(px + p[0] * s) + ',' + f2(py + p[1] * s); }).join(' ') + '" fill="none" stroke="' + (ln.front ? FRONT : '#0E6B5A') + '" stroke-width="' + (ln.front ? 0.8 : 0.6) + '" stroke-linecap="round"/>'); });
			if (b.lane) ['T', 'B', 'L', 'R'].forEach(function (sd) {
				var t = b.lane.txt[sd]; if (!t) return;
				var fr2 = v.edges && v.edges.some(function (e) { return e.front; }) && Dr.isFront(v.elab, sd);
				var at = b.lane.at[sd], wt = tw(t, true) * FSE, hc = FSE * 0.69, o2 = { fs: FSE, anchor: 'middle', bold: 1, fill: fr2 ? FRONT : '#0E6B5A', cls: 'el' };
				if (sd === 'T' || sd === 'B') { var cy = sd === 'T' ? py - at : py + ph + at; g.push(txt(px + pw / 2, cy + hc / 2, t, o2)); tbox(px + pw / 2 - wt / 2, cy - hc / 2 - 0.2, wt, hc + 0.4, 'edge', t); }
				else { var cx = sd === 'L' ? px - at : px + pw + at; o2.rot = 1; g.push(txt(cx + hc / 2, py + ph / 2, t, o2)); tbox(cx - hc / 2 - 0.2, py + ph / 2 - wt / 2, hc + 0.4, wt, 'edge', t); }
			});
			if (v.cn) v.cn.forEach(function (c) {
				var lft = c.x < v.w / 2, top = c.y < v.h / 2, cx2 = lft ? px - b.mL + RC + 0.2 : px + pw + b.mR - RC - 0.2, cy2 = top ? py - b.mT + RC + 0.2 : py + ph + b.mB - RC - 0.2;
				var on = c.n === 1;
				g.push('<circle cx="' + f2(cx2) + '" cy="' + f2(cy2) + '" r="' + f2(RC) + '" fill="' + (on ? '#0E6B5A' : '#fff') + '" stroke="' + (on ? '#0E6B5A' : '#555') + '" stroke-width="0.2"/>' +
					txt(cx2, cy2 + RC * 0.55, String(c.n), { fs: RC * 1.5, anchor: 'middle', bold: 1, fill: on ? '#fff' : '#333', cls: 'cn' }));
				tbox(cx2 - RC, cy2 - RC, 2 * RC, 2 * RC, 'corner', '№' + c.n);
			});
		}
		/* база */
		var bm = baseMark(v, s, pw, ph);
		if (bm.k) {
						var cx0 = px + bm.x, cy0 = py + bm.y, kx = v.sx === 'L' ? -bm.k : bm.k, ky = v.sy === 'B' ? bm.k : -bm.k;
			g.push('<path class="base" d="M' + f2(cx0) + ' ' + f2(cy0) + 'l' + f2(kx) + ' 0l' + f2(-kx) + ' ' + f2(ky) + 'z" fill="#0E6B5A"/>');
		}
		/* лицевая кромка вручную: щелчок по краю вида (только в окне) */
		if (opt.inter && v.kind === 'face' && !v.detail) ['T', 'B', 'L', 'R'].forEach(function (sd) {
			var x1 = sd === 'R' ? px + pw : px, y1 = sd === 'B' ? py + ph : py, x2 = sd === 'L' ? px : px + pw, y2 = sd === 'T' ? py : py + ph, s0 = v.id === 'B' ? ({ T: 'B', B: 'T' }[sd] || sd) : sd;
			g.push('<line class="fe" data-sd="' + s0 + '" x1="' + f2(x1) + '" y1="' + f2(y1) + '" x2="' + f2(x2) + '" y2="' + f2(y2) + '" stroke="#d62828" stroke-opacity="0" stroke-width="2.4"><title>Сделать этот край лицевым (ещё щелчок — снять)</title></line>');
		});
		if (opt.inter && v.corners.length) v.corners.forEach(function (c) {
			var k = Math.min(7, pw / 5, ph / 5), x = px + c.x * s, y = py + c.y * s, kx = c.x < v.w / 2 ? k : -k, ky = c.y > v.h / 2 ? -k : k;
			g.push('<path class="bc" data-c="' + c.c + '" d="M' + f2(x) + ' ' + f2(y) + 'l' + f2(kx) + ' 0l' + f2(-kx) + ' ' + f2(ky) + 'z" fill="#0E6B5A" fill-opacity="0"><title>Сделать этот угол базовым</title></path>');
		});
		/* оси */
		function drawAxis(ax, axis) {
			var horiz = axis === 'x', near = horiz ? (v.sy === 'B') : (v.sx === 'R'), sgn = near ? 1 : -1;
			var edgeC = horiz ? (near ? py + ph : py) : (near ? px + pw : px);
			ax.ticks.forEach(function (t) {
				var u = (horiz ? px : py) + t.u;
				if (horiz) g.push(line(u, edgeC, u, edgeC + sgn * 1.4, t.lab ? 0.3 : 0.2)); else g.push(line(edgeC, u, edgeC + sgn * 1.4, u, t.lab ? 0.3 : 0.2));
			});
			ax.lab.forEach(function (t) {
				if (!t.tier) return;
				var u = (horiz ? px : py) + t.u, pp = (horiz ? px : py) + t.p, off = T0 + (t.tier - 1) * (ax.maxLen + TGAP);
				var e1 = edgeC + sgn * 0.9, e2 = edgeC + sgn * (T0 - 0.7), e3 = edgeC + sgn * (off - 0.5);
				/* выносной штрих: от засечки, излом к месту надписи, дальше прямо до неё */
				if (horiz) g.push('<polyline points="' + f2(u) + ',' + f2(edgeC) + ' ' + f2(u) + ',' + f2(e1) + ' ' + f2(pp) + ',' + f2(e2) + ' ' + f2(pp) + ',' + f2(e3) + '" fill="none" stroke="#000" stroke-width="' + LW(0.15) + '"/>');
				else g.push('<polyline points="' + f2(edgeC) + ',' + f2(u) + ' ' + f2(e1) + ',' + f2(u) + ' ' + f2(e2) + ',' + f2(pp) + ' ' + f2(e3) + ',' + f2(pp) + '" fill="none" stroke="#000" stroke-width="' + LW(0.15) + '"/>');
				if (horiz) {
					if (near) { g.push(txt(pp + CAP / 2, edgeC + off, t.text, { rot: 1, anchor: 'end', cls: 'dm' })); tbox(pp - TH / 2, edgeC + off, TH, t.len, 'dim', t.text); }
					else { g.push(txt(pp + CAP / 2, edgeC - off, t.text, { rot: 1, anchor: 'start', cls: 'dm' })); tbox(pp - TH / 2, edgeC - off - t.len, TH, t.len, 'dim', t.text); }
				} else {
					if (near) { g.push(txt(edgeC + off, pp + CAP / 2, t.text, { anchor: 'start', cls: 'dm' })); tbox(edgeC + off, pp - TH / 2, t.len, TH, 'dim', t.text); }
					else { g.push(txt(edgeC - off, pp + CAP / 2, t.text, { anchor: 'end', cls: 'dm' })); tbox(edgeC - off - t.len, pp - TH / 2, t.len, TH, 'dim', t.text); }
				}
			});
			ax.brackets.forEach(function (br) {
				var d = ax.depth + br.lane * LANE + LANE - 1.2, a = (horiz ? px : py) + br.a, e = (horiz ? px : py) + br.b, tc = (horiz ? px : py) + br.tx, c = edgeC + sgn * d;
				/* надпись шага — между линией и деталью, в своей полосе */
				var t0 = sgn > 0 ? c - 1 - CAP : c + 1;
				if (horiz) {
					g.push(line(a, c, e, c, 0.2) + line(a, c - 1, a, c + 1, 0.2) + line(e, c - 1, e, c + 1, 0.2));
					g.push(txt(tc, t0 + CAP, br.text, { anchor: 'middle', cls: 'dm' })); tbox(tc - br.wt / 2, t0 - 0.2, br.wt, CAP + 0.4, 'step', br.text);
				} else {
					g.push(line(c, a, c, e, 0.2) + line(c - 1, a, c + 1, a, 0.2) + line(c - 1, e, c + 1, e, 0.2));
					g.push(txt(t0 + CAP, tc, br.text, { rot: 1, anchor: 'middle', cls: 'dm' })); tbox(t0 - 0.2, tc - br.wt / 2, CAP + 0.4, br.wt, 'step', br.text);
				}
			});
		}
		/* направляющие от отверстий к засечкам */
		var guides = [];
		function guide(ax, axis) {
			ax.lab.forEach(function (t) {
				t.holes.forEach(function (hi) {
					var h = v.holes[hi], hx = px + h.x * s, hy = py + h.y * sv;
					if (axis === 'x') guides.push(line(hx, hy, hx, v.sy === 'B' ? py + ph : py, 0.12, '1.2 1.2', '#8a8a8a'));
					else guides.push(line(hx, hy, v.sx === 'L' ? px : px + pw, hy, 0.12, '1.2 1.2', '#8a8a8a'));
				});
			});
		}
		if (ST.guides) { guide(b.ax, 'x'); if (b.ay) guide(b.ay, 'y'); }
		g.push(v.detail ? '<g clip-path="url(#' + clip + ')">' + guides.join('') + '</g>' : guides.join(''));
		/* отверстия */
		var hh = [];
		v.holes.forEach(function (h) {
			var cx = px + h.x * s, cy = py + h.y * sv, r = hr(h, s);
			hh.push(holeSvg(cx, cy, h, s));
			tbox(cx - r, cy - r, 2 * r, 2 * r, 'hole', '');
		});
		g.push(v.detail ? '<g clip-path="url(#' + clip + ')">' + hh.join('') + '</g>' : hh.join(''));
		drawAxis(b.ax, 'x'); if (b.ay) drawAxis(b.ay, 'y');
		/* номера */
		if (edge) {
			b.nums.list.forEach(function (it) {
				var h = v.holes[it.g.idx[0]], hu = px + it.u, u = px + it.p, top = v.sy === 'B', y = top ? py - T0 - (it.tier - 1) * (TH + 1.2) - TH : py + ph + T0 + (it.tier - 1) * (TH + 1.2);
				var ye = top ? py : py + ph, sg = top ? -1 : 1;
				g.push('<polyline points="' + f2(hu) + ',' + f2(py + h.y * sv) + ' ' + f2(hu) + ',' + f2(ye + sg * 0.9) + ' ' + f2(u) + ',' + f2(ye + sg * (T0 - 0.7)) + ' ' + f2(u) + ',' + f2(top ? y + TH : y) + '" fill="none" stroke="#000" stroke-width="' + LW(0.15) + '"/>');
				g.push('<rect x="' + f2(u - it.w / 2) + '" y="' + f2(y) + '" width="' + f2(it.w) + '" height="' + f2(TH) + '" rx="0.8" fill="#fff" stroke="none"/>' + txt(u, y + TH / 2 + CAP / 2, it.g.label, { anchor: 'middle', bold: ST.numText !== 'drill', cls: 'nm', fill: ST.color ? colorOf(h.ty) : '' }));
				tbox(u - it.w / 2, y, it.w, TH, 'num', it.g.label);
			});
		} else {
			b.nums.list.forEach(function (it) {
				var bx = px + it.box.x, by = py + it.box.y;
				if (it.lead) { g.push(line(px + it.lead[0], py + it.lead[1], px + it.lead[2], py + it.lead[3], 0.15)); boxes.push({ kind: 'lead', x1: px + it.lead[0], y1: py + it.lead[1], x2: px + it.lead[2], y2: py + it.lead[3], x: 0, y: 0, w: 0, h: 0, text: it.g.label }); }
				g.push('<rect x="' + f2(bx) + '" y="' + f2(by) + '" width="' + f2(it.box.w) + '" height="' + f2(it.box.h) + '" rx="0.8" fill="#fff" stroke="none"/>' + txt(bx + it.box.w / 2, by + it.box.h / 2 + CAP / 2, it.g.label, { anchor: 'middle', bold: ST.numText !== 'drill', cls: 'nm', fill: ST.color ? colorOf(v.holes[it.g.idx[0]].ty) : '' }));
				tbox(bx, by, it.box.w, it.box.h, 'num', it.g.label);
			});
		}
		/* рамки выносов на основном виде */
		b.details.forEach(function (d) {
			var wx = px + d.win.x * s, wy = py + d.win.y * sv, ww = d.win.w * s, wh = d.win.h * sv;
			g.push('<rect x="' + f2(wx) + '" y="' + f2(wy) + '" width="' + f2(ww) + '" height="' + f2(wh) + '" rx="1" fill="none" stroke="#000" stroke-width="' + LW(0.25) + '" stroke-dasharray="2.2 1.1"/>');
			/* буква выноса — у рамки, где свободно */
			var lw = tw(d.letter, true) * FS + 1.4, cands = [[wx + ww + 0.8, wy], [wx - lw - 0.8, wy], [wx + ww + 0.8, wy + wh - TH], [wx - lw - 0.8, wy + wh - TH], [wx, wy - TH - 0.8], [wx, wy + wh + 0.8], [wx + ww - lw, wy - TH - 0.8], [wx + ww - lw, wy + wh + 0.8]];
			for (var c = 0; c < cands.length; c++) {
				var bb = { x: cands[c][0], y: cands[c][1], w: lw, h: TH }, bad = bb.x < px + 0.3 || bb.y < py + 0.3 || bb.x + bb.w > px + pw - 0.3 || bb.y + bb.h > py + ph - 0.3;
				for (var q = 0; q < boxes.length && !bad; q++) bad = hit(bb, boxes[q], 0.3);
				if (bad) continue;
				g.push(txt(bb.x + lw / 2, bb.y + TH / 2 + CAP / 2, d.letter, { anchor: 'middle', bold: 1, cls: 'nm' }));
				tbox(bb.x, bb.y, bb.w, bb.h, 'letter', d.letter);
				break;
			}
		});
		return '<g class="dv" data-v="' + v.id + '">' + g.join('') + '</g>';
	}

	/* ================================= таблица ================================= */

	var MARKS = ['¹', '²', '³', '⁴', '⁵'];
	/* Строки таблицы отверстий. foot — со сносками (второй лист оформления Г): значок в ячейке,
	   пояснение — в rows.notes. */
	function tableRows(views, foot) {
		var rows = [], notes = [], mk = {};
		function mark(key, text) { if (!foot) return ''; if (!mk[key]) { mk[key] = MARKS[notes.length] || '*'; notes.push({ m: mk[key], text: text }); } return mk[key]; }
		rows.notes = notes;
		views.forEach(function (v) {
			if (v.kind === 'key' || v.kind === 'pic' || v.empty) return;
			var hm = '';
			if (v.kind === 'edge') hm = mark('edge', 'Торец: вид на кромку снаружи, лицевая сторона сверху. X — вдоль торца от базового угла, Y — от лицевой по толщине.');
			else if (!v.face) hm = mark('B', 'Обратная: деталь перевёрнута через длинную кромку. Размеры — от того же угла ①, на чертеже он отмечен на обеих сторонах.');
			rows.push({ head: (v.kind === 'edge' ? v.title : (v.face ? 'Лицевая' : 'Обратная')) + hm, edge: v.kind === 'edge' && !foot });
			v.groups.forEach(function (g) {
				var h = v.holes[g.idx[0]], x = Math.abs(h.x - v.bx.x), y = v.kind === 'edge' ? h.y : Math.abs(h.y - v.bx.y);
				var xs = num(x), ys = num(y), n = g.idx.length - 1, rec = '';
				if (g.row) {
					rec = num(g.row === 'x' ? x : y) + ' + ' + n + '×' + num(g.step);
					rec += mark('row', 'Ряд отверстий с равным шагом. «' + rec + '» — первое отверстие в ' + num(g.row === 'x' ? x : y) + ' от базы, за ним ещё ' + n + ' через ' + num(g.step) + '.');
					if (g.row === 'x') xs = rec; else ys = rec;
				}
				rows.push({ n: g.label, x: xs, y: ys, d: num(h.d), dep: h.dep ? num(h.dep) : 'скв.' + mark('thr', 'скв. — отверстие сквозное.'), fast: h.fast || '', ty: h.ty });
			});
		});
		return rows;
	}
	function tableLayout(rows) {
		var k0 = CAP / 3, w = { n: 9 * k0, x: 10 * k0, y: 10 * k0, d: 9 * k0, dep: 12.5 * k0 }, PD = 2.4 * Math.max(0.6, k0);
		rows.forEach(function (r) {
			if (r.head) return;
			w.n = Math.max(w.n, tw(r.n, true) * FS + PD); w.x = Math.max(w.x, tw(r.x) * FS + PD); w.y = Math.max(w.y, tw(r.y) * FS + PD);
			w.d = Math.max(w.d, tw(r.d) * FS + PD); w.dep = Math.max(w.dep, tw(r.dep) * FS + PD);
		});
		var fw = 0;
		rows.forEach(function (r) { if (!r.head) fw = Math.max(fw, tw(r.fast) * FSN + PD); });
		w.fast = ST.fast ? Math.max(18 * FSN / 3.6, Math.min(46 * FSN / 3.6, fw)) : 0;
		w.all = w.n + w.x + w.y + w.d + w.dep + w.fast;
		return w;
	}
	/* Таблица как в листах раскроя: тонкая сетка, шапка жирным с утолщённой нижней линией, без заливки. */
	function drawTable(rows, w, ox, oy, from, to, boxes) {
		var g = [], y = oy, cols = [w.n, w.x, w.y, w.d, w.dep, w.fast];
		if (!ST.fast) cols.pop();
		function cells(texts, yy, head, ty) {
			var x = ox;
			for (var c = 0; c < cols.length; c++) {
				g.push('<rect x="' + f2(x) + '" y="' + f2(yy) + '" width="' + f2(cols[c]) + '" height="' + f2(RH) + '" fill="#fff" stroke="#000" stroke-width="' + LW(0.2) + '"/>');
				if (c === 5) g.push(txt(x + 1.2 * CAP / 3, yy + RH / 2 + FSN * 0.35, clipText(texts[c], FSN, cols[c] - 2 * CAP / 3), { fs: FSN, bold: head }));
				else {
					g.push(txt(x + cols[c] / 2, yy + RH / 2 + (head ? FSN * 0.35 : CAP / 2), texts[c], { anchor: 'middle', bold: head || c === 0, cls: head ? '' : 'tb', fs: head ? FSN : FS, fill: (!head && c === 0 && ST.color) ? colorOf(ty) : '' }));
					if (!head) boxes.push({ x: x + 0.6, y: yy + 0.5, w: cols[c] - 1.2, h: RH - 1, kind: 'cell', text: texts[c] });
				}
				x += cols[c];
			}
		}
		cells(['№', 'X', 'Y', 'Ø', 'Глуб.', 'Крепёж'], y, 1); y += RH;
		g.push(line(ox, y, ox + w.all, y, 0.45));
		for (var i = from; i < to; i++) {
			var r = rows[i];
			if (r.head) {
				g.push('<rect x="' + f2(ox) + '" y="' + f2(y) + '" width="' + f2(w.all) + '" height="' + f2(RH) + '" fill="#fff" stroke="#000" stroke-width="' + LW(0.2) + '"/>' +
					   txt(ox + 1.4 * CAP / 3, y + RH / 2 + FSN * 0.35, clipText(r.head + (r.edge ? ': X — вдоль, Y — от лицевой' : ''), FSN, w.all - 2.8 * CAP / 3), { fs: FSN, fill: '#222' }));
			} else cells([r.n, r.x, r.y, r.d, r.dep, r.fast], y, 0, r.ty);
			y += RH;
		}
		return g.join('');
	}

	/* Сводная таблица свёрл: значок, диаметр, глубина или «скв.», крепёж. Количества нет. */
	function typeRows(views) { return views.types.map(function (t) { return { ty: t.ty, d: num(t.d), dep: t.dep ? num(t.dep) : 'скв.', thru: !t.dep, fast: t.fast.join(', ') }; }); }
	function typeLayout(rows) {
		var k0 = CAP / 3, PD = 2.4 * Math.max(0.6, k0), sign = ST.hole === 'sym' || ST.color, w = { s: sign ? Math.max(RH + 2.2, tw('Знак', true) * FSN + 1.6) : 0, d: 8 * k0, dep: Math.max(12.5 * k0, tw('Глуб.', true) * FSN + 1.6) }, fw = 0;
		rows.forEach(function (r) { w.d = Math.max(w.d, tw(r.d) * FS + PD); w.dep = Math.max(w.dep, tw(r.dep) * FS + PD); fw = Math.max(fw, tw(r.fast) * FSN + PD); });
		w.fast = ST.fast ? Math.max(18 * FSN / 3.6, Math.min(74 * FSN / 3.6, fw)) : 0;
		w.all = w.s + w.d + w.dep + w.fast;
		return w;
	}
	function drawTypes(rows, w, ox, oy, from, to) {
		var g = [], y = oy, cols = [w.s, w.d, w.dep, w.fast], heads = ['Знак', 'Ø', 'Глуб.', 'Крепёж'];
		function row(texts, yy, head, r) {
			var x = ox;
			for (var c = 0; c < cols.length; c++) {
				if (!cols[c]) continue;
				g.push('<rect x="' + f2(x) + '" y="' + f2(yy) + '" width="' + f2(cols[c]) + '" height="' + f2(RH) + '" fill="#fff" stroke="#000" stroke-width="' + LW(0.2) + '"/>');
				if (c === 0 && !head) g.push(markSvg(x + cols[c] / 2, yy + RH / 2, Math.min(1.3, RH / 2 - 0.8), r.ty, r.thru));
				else if (c === 3) g.push(txt(x + 1.2 * CAP / 3, yy + RH / 2 + FSN * 0.35, clipText(texts[c], FSN, cols[c] - 2 * CAP / 3), { fs: FSN, bold: head }));
				else g.push(txt(x + cols[c] / 2, yy + RH / 2 + (head ? FSN * 0.35 : CAP / 2), texts[c], { anchor: 'middle', bold: head, fs: head ? FSN : FS }));
				x += cols[c];
			}
		}
		row(heads, y, 1); y += RH;
		g.push(line(ox, y, ox + w.all, y, 0.45));
		for (var i = from; i < to; i++) { row(['', rows[i].d, rows[i].dep, rows[i].fast], y, 0, rows[i]); y += RH; }
		return g.join('');
	}

	/* ================================ пояснения ================================ */

	function wrap(text, fs, width, bold) {
		var out = [], cur = '';
		String(text).split(/\s+/).forEach(function (wd) {
			if (!wd) return;
			var t = cur ? cur + ' ' + wd : wd;
			if (cur && tw(t, bold) * fs > width) { out.push(cur); cur = wd; } else cur = t;
		});
		if (cur) out.push(cur);
		return out;
	}
	/* Свёрла детали одной строкой: диаметр и глубина или «скв.». */
	function drillText(types) { return types.map(function (t) { return 'Ø' + num(t.d) + (t.dep ? ' × ' + num(t.dep) : ' скв.'); }).join(';  '); }
	/* Кромка детали словами — как в таблицах раскроя: сколько сторон по длине и по ширине. */
	function edgeText(t) {
		var sh = t.shape || {}, ec = P.edgeCount(sh), eds = sh.edges || [], names = [], parts = [];
		eds.forEach(function (e) { var n = e.mat || (e.th ? 'кромка ' + num(e.th) + ' мм' : ''); if (n && names.indexOf(n) < 0) names.push(n); });
		if (ec.len) parts.push('по длине ' + P.dim(t.L) + ' — ' + (ec.len === 2 ? 'с двух сторон' : 'с одной стороны'));
		if (ec.wid) parts.push('по ширине ' + P.dim(t.W) + ' — ' + (ec.wid === 2 ? 'с двух сторон' : 'с одной стороны'));
		if (eds.some(function (e) { return !e.side; })) parts.push('по кривой');
		if (!parts.length) return 'нет';
		return parts.join(', ') + (names.length ? ' (' + names.slice(0, 3).join('; ') + ')' : '');
	}
	/* Как читать карту — только то, что есть на этой детали. */
	function readText(views) {
		var s = ['Размеры — в миллиметрах от угла ①: он отмечен на обеих сторонах — это один и тот же угол детали.'], row = null, thru = false, hasB = false, hasE = false;
		views.forEach(function (v) {
			if (v.kind === 'key' || v.kind === 'pic') return;
			if (v.kind === 'face' && !v.face) hasB = true;
			if (v.kind === 'edge') hasE = true;
			v.groups.forEach(function (g) { if (g.row && !row) row = g; });
			v.holes.forEach(function (h) { if (!h.dep) thru = true; });
		});
		if (ST.mode === 'A') s.push('Номер у отверстия — строка таблицы.');
		if (ST.mode === 'B') s.push('Значок отверстия — сверло из таблицы.');
		if (ST.mode === 'V') s.push('У отверстия — диаметр × глубина.');
		if (hasB) s.push('Обратная — деталь перевёрнута через длинную кромку. Зелёная линия — кромка.');
		if (hasE) s.push('Торец — вид на кромку снаружи, лицевая сверху.');
		if (row) s.push('«' + (row.idx.length - 1) + ' × ' + num(row.step) + '» — ряд отверстий: ' + (row.idx.length - 1) + ' раз через ' + num(row.step) + '.');
		if (thru) s.push('скв. — сквозное.');
		return s;
	}
	Dr.NOTE_LINES = 8;
	/* Пояснения под чертежом (оформления А, Б, В): как читать, сведения о детали, примечание к ней,
	   общий текст. Строки [{ t, bold }], не больше Dr.NOTE_LINES — чертёж важнее. */
	function noteLines(st, card, views, W, c, small, maxLines) {
		var out = [], note = Dr.noteOf(st, card), t = card.t;
		function add(text, bold) { wrap(text, FSN, W - 1, bold).forEach(function (ln) { out.push({ t: ln, bold: bold }); }); }
		if (!small) {
			if (c.exRead) add(readText(views).join(' '));
			if (c.exInfo) add('Кромка: ' + edgeText(t) + '.' + (t.path && t.path.length ? ' Изделие: ' + t.path.join(' / ') + '.' : ''));
		}
		if (note) add('Примечание: ' + note, true);
		if (!small && c.text) add(c.text);
		var max = small ? 2 : (maxLines || Dr.NOTE_LINES);
		if (out.length > max) { out = out.slice(0, max); out[max - 1] = { t: clipText(out[max - 1].t + ' …', FSN, W - 1), bold: out[max - 1].bold, cut: 1 }; }
		return out;
	}

	/* ============================ сборка листа карты ============================ */

	/* Поставить блоки на поле W × H, не задевая уже стоящие: первое свободное место сверху слева.
	   Возвращает места [{ x, y }] или null. */
	function placeBlocks(blocks, W, H, gap, fixed) {
		var placed = fixed.slice(0), pos = [];
		for (var i = 0; i < blocks.length; i++) {
			var b = blocks[i], xs = [0], ys = [0], found = null, q;
			for (q = 0; q < placed.length; q++) { xs.push(placed[q].x + placed[q].w + gap); ys.push(placed[q].y + placed[q].h + gap); }
			xs.sort(function (m, n) { return m - n; }); ys.sort(function (m, n) { return m - n; });
			for (var yi = 0; yi < ys.length && !found; yi++) for (var xi = 0; xi < xs.length && !found; xi++) {
				var c = { x: xs[xi], y: ys[yi], w: b.w, h: b.h };
				if (c.x + c.w > W + 0.01 || c.y + c.h > H + 0.01) continue;
				var bad = false;
				for (q = 0; q < placed.length && !bad; q++) bad = hit(c, placed[q], gap - 0.01);
				if (!bad) found = c;
			}
			if (!found) return null;
			placed.push(found); pos.push({ x: found.x, y: found.y });
		}
		return pos;
	}
	function flat(lays) { var out = []; lays.forEach(function (l) { out.push(l); }); lays.forEach(function (l) { l.details.forEach(function (d) { out.push(d); }); }); return out; }

	/* Самый крупный масштаб, при котором вид один входит в поле. */
	function soloScale(view, W, HH) {
		if (view.kind === 'key' || view.kind === 'pic') return 1;
		for (var k = 0; k < SCALES.length; k++) { var l = layoutView(view, SCALES[k], 0); if (l.w <= W + 0.01 && l.h <= HH + 0.01) return SCALES[k]; }
		return SCALES[SCALES.length - 1];
	}
	function scaleAtMost(v) { for (var k = 0; k < SCALES.length; k++) if (SCALES[k] <= v + 1e-9) return SCALES[k]; return SCALES[SCALES.length - 1]; }
	var FACTORS = [1, 0.8, 0.65, 0.5, 0.4, 0.3, 0.2];

	/* Поставить виды (и таблицу) на одно поле. Чертёж в любом оформлении стоит одинаково: первый вид —
	   всегда в левом верхнем углу поля, остальные — следом за ним. Таблица — в правом верхнем углу;
	   если рядом с ней чертёж пришлось бы уменьшить, а под чертежами место есть — под ними.
	   blk — боковой блок { w, h, tbl, notes }: таблица и, если так чертёж выходит крупнее, пояснения под ней. У каждого вида свой масштаб — доля f от самого крупного, в каком он
	   входит на лист один; f перебирается от 1 вниз до fMin.
	   Возвращает { f, s, blocks, pos, t, unresolved, details } или null. */
	function fitSet(views, solo, blk, W, HH, fMin, noDetails) {
		var GAPB = 5;
		for (var fi = 0; fi < FACTORS.length; fi++) {
			var f = FACTORS[fi];
			if (f < fMin - 1e-9) break;
			var lays = views.map(function (v) { return layoutView(v, v.kind === 'key' || v.kind === 'pic' ? 1 : scaleAtMost(solo[v.id] * f), 0); }), blocks = flat(lays), nd = 0, un = 0, sMain = 0;
			lays.forEach(function (l) { nd += l.details.length; un += l.unresolved; l.details.forEach(function (d) { un += d.unresolved; }); if (!sMain && !l.key && !l.pic) sMain = l.s; });
			if (noDetails && nd) continue;
			var t = blk ? { x: W - blk.w, y: 0 } : null;
			var pos = placeBlocks(blocks, W, HH, GAPB, t ? [{ x: t.x, y: 0, w: blk.w, h: blk.h }] : []);
			if (pos && (pos[0].x > 0.01 || pos[0].y > 0.01)) pos = null;
			if (!pos && blk) {
				var all = placeBlocks(blocks.slice(0, lays.length).concat([{ w: blk.w, h: blk.h }]).concat(blocks.slice(lays.length)), W, HH, GAPB, []);
				if (all) { t = { x: all[lays.length].x, y: all[lays.length].y }; pos = all.slice(0, lays.length).concat(all.slice(lays.length + 1)); }
			}
			if (pos) return { f: f, s: sMain, blocks: blocks, pos: pos, t: t, blk: blk, unresolved: un, details: nd };
		}
		return null;
	}
	/* Крайний случай: вид не входит даже в самом мелком масштабе — ставим как есть, в самом мелком. */
	function forceFit(views, W, H) {
		var s = SCALES[SCALES.length - 1], lays = views.map(function (v) { return layoutView(v, s, 0); }), blocks = flat(lays), pos = placeBlocks(blocks, 1e9, 1e9, 5, []), un = 0;
		lays.forEach(function (l) { un += l.unresolved; });
		return { s: s, blocks: blocks, pos: pos, t: null, unresolved: un + 1, details: 0 };
	}

	/* Второй лист оформления Г: таблица отверстий, свёрла, пояснения со сносками, сведения о детали,
	   примечание и общий текст. Высота текста своя (cap2). Если не входит — продолжается на следующих листах. */
	function sheet2(st, card, views, W, H, c) {
		setCap(c.cap2);
		var rows = tableRows(views, true), tw0 = tableLayout(rows), out = [], g = [], boxes = [];
		var FH = FSN * 1.2, top = FH + 2.4, per = Math.max(3, Math.floor((H - top) / RH) - 1), perPage = Math.max(1, Math.floor((W + 4) / (tw0.all + 4)));
		function flush() { if (g.length) out.push({ W: W, H: H, svg: g.join(''), boxes: boxes, unresolved: 0, s: 0, details: 0, kind: 'table' }); g = []; boxes = []; }
		var col = 0, part = 0;
		for (var from = 0; from < rows.length; from += per) {
			if (col === perPage) { flush(); col = 0; }
			if (col === 0) g.push(txt(0, FH, 'Таблица отверстий' + (part ? ' — продолжение' : ''), { fs: FH, bold: 1 }));
			g.push(drawTable(rows, tw0, col * (tw0.all + 4), top, from, Math.min(rows.length, from + per), boxes));
			col++; part++;
		}
		/* правая колонка: свёрла и текст; если рядом с таблицей узко — отдельным листом */
		var rx = col * (tw0.all + 4) + 4, rw = W - rx, yy = 0, ind = FSN * 1.7;
		function fresh() { flush(); rx = 0; rw = W; yy = 0; }
		if (rw < 80) fresh();
		rw = Math.min(rw, 150);
		function need(h) { if (yy > 0 && yy + h > H + 0.01) { fresh(); rw = Math.min(rw, 150); } }
		function head(t, h) { need(top + (h || LH)); g.push(txt(rx, yy + FH, t, { fs: FH, bold: 1 })); yy += top; }
		function para(text, o) {
			o = o || {};
			wrap(text, FSN, rw - (o.flat ? 0 : ind), o.bold).forEach(function (ln, i) {
				need(LH);
				if (i === 0 && o.m) g.push(txt(rx, yy + FSN, o.m, { fs: FSN, bold: 1 }));
				g.push(txt(rx + (o.flat ? 0 : ind), yy + FSN, ln, { fs: FSN, fill: o.bold ? '' : '#222', bold: o.bold }));
				yy += LH;
			});
			yy += LH * 0.35;
		}
		var tr = typeRows(views), tl = typeLayout(tr);
		head('Свёрла', (tr.length + 1) * RH);
		g.push(drawTypes(tr, tl, rx, yy, 0, tr.length)); yy += (tr.length + 1) * RH + 6;
		if (c.exRead) {
			head('Пояснения');
			para('Все размеры — в миллиметрах от угла ①; на чертеже он отмечен на обеих сторонах детали. Номера в таблице — те же, что у отверстий на чертеже.', { flat: !rows.notes.length });
			rows.notes.forEach(function (n, i) { para(n.text, { m: (i + 1) + ')' }); });
			yy += 3;
		}
		if (c.exInfo) {
			var t = card.t;
			head('Деталь');
			para(Dr.title(card) + ' — ' + P.dim(t.L) + ' × ' + P.dim(t.W) + ' × ' + P.dim(t.th) + ' мм, ' + card.count + ' шт.', { flat: 1 });
			para('Материал: ' + P.matTitle(card.mat) + '.', { flat: 1 });
			para('Кромка: ' + edgeText(t) + '.', { flat: 1 });
			if (t.path && t.path.length) para('Изделие: ' + t.path.join(' / ') + '.', { flat: 1 });
			yy += 3;
		}
		var note = Dr.noteOf(st, card);
		if (note) { head('Примечание'); para(note, { flat: 1, bold: 1 }); yy += 3; }
		if (c.text) { head('Общие указания'); para(c.text, { flat: 1 }); }
		flush();
		setCap(c.cap);
		return out;
	}

	/* Листы карты присадки. box: { W, H } — поле под карту, мм. opt: { noDetails, small } — для мелких карт
	   по несколько на лист (если без выносов не обойтись, возвращает пусто; пояснения — только примечание).
	   Возвращает [{ W, H, svg, boxes, unresolved, s, details, kind }]; kind: 'draw' — чертёж, 'table' — таблица. */
	Dr.cardPages = function (st, card, box, opt) {
		opt = opt || {};
		var c = use(st), views = viewsOf(st, card), W = box.W, H = box.H, pages = [];
		if (!views.filter(function (v) { return v.kind !== 'key'; }).length) return pages;
		/* «где деталь» — картинка модуля, если известно, где деталь стоит (на мелких картах по несколько на лист — нет) */
		var O = card._or;
		if (!c.ends) { var vt0 = views.types; views = views.filter(function (v) { return v.kind !== 'edge' && v.kind !== 'key'; }); views.types = vt0; }      // «Торцы» выключены
		if (!opt.small && c.pic && O && O.it) { var pic = null; try { pic = picOf(O, 50, 38); } catch (e) { pic = null; } if (pic) { var vt = views.types; views = views.concat([{ id: 'P', kind: 'pic', w: 50, h: 38, pic: pic, holes: [], groups: [] }]); views.types = vt; } }
		var kind = ST.table, sumT = kind === 'types', hasT = kind === 'types' || kind === 'holes';
		var rows = sumT ? typeRows(views) : (hasT ? tableRows(views, false) : []), tw0 = sumT ? typeLayout(rows) : (hasT ? tableLayout(rows) : null), drawT = sumT ? drawTypes : drawTable;
		var nb = kind === 'sheet2' ? [] : noteLines(st, card, views, W, c, opt.small), HH = H - (nb.length ? nb.length * LH + 2 : 0);
		function tableFor(hh) {
			if (!hasT) return null;
			var rowsFit = Math.floor(hh / RH) - 1, colsN = Math.max(1, Math.ceil(rows.length / Math.max(1, rowsFit)));
			if (colsN <= 2 && rowsFit >= 3 && colsN * tw0.all + (colsN - 1) * 3 <= W) return { cols: colsN, per: Math.ceil(rows.length / colsN), w: colsN * tw0.all + (colsN - 1) * 3, h: (Math.ceil(rows.length / colsN) + 1) * RH };
			return null;
		}
		/* пустая сторона («отверстий нет») — мельче, чтобы не теснила сторону с отверстиями */
		function soloFor(hh) { var o = {}; views.forEach(function (v) { o[v.id] = soloScale(v, W, hh); }); views.forEach(function (v) { if (v.empty) o[v.id] = scaleAtMost(o[v.id] * 0.45); }); return o; }
		var tbl = tableFor(HH), blk = tbl ? { w: tbl.w, h: tbl.h, tbl: tbl } : null, solo = soloFor(HH);
		var sets = [];
		var one = (tbl || !hasT) ? fitSet(views, solo, blk, W, HH, opt.noDetails ? 0.2 : 0.5, opt.noDetails) : null;
		/* пояснения обычно идут полосой под чертежом; если в колонке справа (под таблицей) они дают чертежу
		   встать крупнее — ставим их туда */
		if (nb.length && !opt.small && !opt.noDetails) {
			var tblR = tableFor(H);
			if (tblR || !hasT) {
				var cw = Math.max(tblR ? tblR.w : 0, 66), nbR = noteLines(st, card, views, cw, c, false, 24);
				var blkR = { w: cw, h: (tblR ? tblR.h + 4 : 0) + nbR.length * LH + 1, tbl: tblR, notes: nbR };
				var oneR = blkR.h <= H ? fitSet(views, soloFor(H), blkR, W, H, 0.5, false) : null;
				if (oneR && (!one || oneR.s > one.s * 1.001)) one = oneR;
			}
		}
		if (opt.noDetails) { if (!one || one.unresolved) return []; sets.push({ fit: one }); }
		else if (one) sets.push({ fit: one });
		else {
			/* на один лист не входит: виды по листам, таблица — с первым, если не теснит, иначе отдельным листом */
			var rest = views.slice(0), tableDone = !hasT;
			while (rest.length) {
				var take = [rest[0]], withT = !tableDone && !!tbl, f = withT ? fitSet(take, solo, blk, W, HH, 0.65, false) : null;
				if (!f) { withT = false; f = fitSet(take, solo, null, W, HH, 0.2, false) || forceFit(take, W, HH); }
				while (rest.length > take.length) {
					var fNext = fitSet(take.concat([rest[take.length]]), solo, withT ? blk : null, W, HH, 0.65, false);
					if (!fNext) break;
					take.push(rest[take.length]); f = fNext;
				}
				if (withT) tableDone = true;
				sets.push({ fit: f });
				rest = rest.slice(take.length);
			}
			if (!tableDone) sets.push({ tableOnly: true });
		}
		sets.forEach(function (set, pi) {
			var boxes = [], g = [], uid = 0;
			if (set.tableOnly) {
				var per = Math.max(3, Math.floor(H / RH) - 1), x0 = 0;
				for (var from = 0; from < rows.length; from += per) { g.push(drawT(rows, tw0, x0, 0, from, Math.min(rows.length, from + per), boxes)); x0 += tw0.all + 4; }
				pages.push({ W: W, H: H, svg: g.join(''), boxes: boxes, unresolved: 0, s: 0, details: 0, kind: 'table' });
				return;
			}
			var f = set.fit;
			f.blocks.forEach(function (b, i) { g.push(drawView(b, f.pos[i].x, f.pos[i].y, opt, boxes, (opt.uid || '') + pi + '_' + (uid++))); });
			var tb = f.blk && f.blk.tbl, side = f.blk && f.blk.notes;
			if (tb) for (var q = 0; q < tb.cols; q++) g.push(drawT(rows, tw0, f.t.x + f.blk.w - tb.w + q * (tw0.all + 3), f.t.y, q * tb.per, Math.min(rows.length, (q + 1) * tb.per), boxes));
			if (side) side.forEach(function (ln, li) { g.push(txt(f.t.x, f.t.y + (tb ? tb.h + 4 : 0) + FSN + li * LH, ln.t, { fs: FSN, fill: ln.bold ? '' : '#222', bold: ln.bold })); });
			else if (pi === 0) nb.forEach(function (ln, li) { g.push(txt(0, H - (nb.length - 1 - li) * LH - 1.2, ln.t, { fs: FSN, fill: ln.bold ? '' : '#222', bold: ln.bold })); });
			pages.push({ W: W, H: H, svg: g.join(''), boxes: boxes, unresolved: f.unresolved, s: f.s, details: f.details, kind: 'draw', views: f.blocks.map(function (b, i) { return { id: b.view.id, x: f.pos[i].x, y: f.pos[i].y, s: b.s }; }), side: side ? 'right' : (nb.length ? 'bottom' : ''), noteCut: pi === 0 && (side || nb).some(function (l) { return l.cut; }) });
		});
		if (kind === 'sheet2') pages = pages.concat(sheet2(st, card, views, W, H, c));
		return pages;
	};

	/* Для деталировки: картинка «где деталь» (как на карте присадки) и её SVG; x, y — левый верхний угол подписи. */
	Dr.pic = function (st, card, w, h) { use(st); var O = orOf(st, card); if (!O.it) return null; try { return picOf(O, w, h); } catch (e) { return null; } };
	/* Положение детали в изделии (для размеров «от пола» и «от стены» в деталировке): точка детали в осях лицевой
	   стороны (x вдоль длины, y вниз; faceB — лицевая сторона Б) → высота над нулём БАЗИСа и расстояние до задней
	   плоскости изделия. null — модель не собрана. */
	Dr.place = function (st, card, faceB) {
		var O = orOf(st, card), sc = O.sc, it = O.it;
		if (!sc || !it) return null;
		var parts = st.model.parts || [], part = null, i;
		for (i = 0; i < parts.length && !part; i++) if (parts[i].id === it.id) part = parts[i];
		if (!part || !part.frame) return null;
		var sh = geom.readShape(part), fr = sh.fr, f = part.frame, M3 = BM.m3d;
		if (!fr) return null;
		if (sc._back === undefined) {
			var mn = Infinity;
			sc.items.forEach(function (t) { try { var lb = M3.localBox(t); [[lb.x1, lb.y1], [lb.x2, lb.y1], [lb.x2, lb.y2], [lb.x1, lb.y2]].forEach(function (q) { [t.z0, t.z0 + t.th].forEach(function (z) { var g = M3.toGlobal(t.f, q[0], q[1], z); var d = vdot(g, sc.front); if (d < mn) mn = d; }); }); } catch (e) { } });
			sc._back = isFinite(mn) ? mn : null;
		}
		var W = fr.W;
		function toG(x, y) {
			var px, py, Y = faceB ? W - y : y;
			if (fr.wide) { px = x + fr.x1; py = fr.y2 - Y; } else { px = Y + fr.x1; py = x + fr.y1; }
			return M3.toGlobal(f, px, py, 0);
		}
		return {
			h: function (x, y) { return vdot(toG(x, y), sc.up); },
			wall: function (x, y) { return sc._back === null ? null : vdot(toG(x, y), sc.front) - sc._back; },
			vert: Math.abs(vdot(O.n || [0, 0, 1], sc.up)) < 0.3
		};
	};
	Dr.picSvg = function (pic, x, y, w, h, boxes) { return drawPic({ view: { w: w, h: h, pic: pic } }, x, y, boxes || []); };
	Dr.CAPH = CAPH;

	/* SVG листа карты: размеры в мм бумаги; px — ширина в пикселях экрана (иначе — в мм). */
	Dr.pageSvg = function (pg, o) {
		o = o || {};
		var size = o.px > 0 ? 'width="' + Math.round(o.px) + '" height="' + Math.round(o.px * pg.H / pg.W) + '"' : 'width="' + f2(pg.W) + 'mm" height="' + f2(pg.H) + 'mm"';
		return '<svg xmlns="http://www.w3.org/2000/svg" version="1.1" ' + size + ' viewBox="0 0 ' + f2(pg.W) + ' ' + f2(pg.H) + '" font-family=\'' + (o.font || D.FONT).replace(/"/g, '') + '\' class="drill">' + pg.svg + '</svg>';
	};

	/* Проверка листа: надписи не пересекают друг друга и отверстия. Возвращает список нарушений. */
	Dr.check = function (pg) {
		var out = [], b = pg.boxes, i, j;
		function inside(x, y, r) { return x >= r.x - 0.2 && x <= r.x + r.w + 0.2 && y >= r.y - 0.2 && y <= r.y + r.h + 0.2; }
		for (i = 0; i < b.length; i++) {
			if (b[i].kind === 'hole') continue;
			if (b[i].kind === 'lead') {
				/* выноска номера: не через чужие отверстия и надписи (свои — те, где она начинается и кончается) */
				for (j = 0; j < b.length; j++) {
					if (b[j].kind === 'lead' || b[j].kind === 'cell' || inside(b[i].x1, b[i].y1, b[j]) || inside(b[i].x2, b[i].y2, b[j])) continue;
					if (segHitsRect(b[i].x1, b[i].y1, b[i].x2, b[i].y2, { x: b[j].x + 0.05, y: b[j].y + 0.05, w: b[j].w - 0.1, h: b[j].h - 0.1 })) out.push('выноска «' + b[i].text + '» идёт через ' + (b[j].kind === 'hole' ? 'отверстие' : '«' + b[j].text + '»'));
				}
				continue;
			}
			if (b[i].x < -0.05 || b[i].y < -0.05 || b[i].x + b[i].w > pg.W + 0.05 || b[i].y + b[i].h > pg.H + 0.05) out.push('надпись «' + b[i].text + '» выходит за поле листа');
			for (j = 0; j < b.length; j++) {
				if (j === i || b[j].kind === 'lead' || (b[j].kind !== 'hole' && j < i)) continue;
				if (hit(b[i], b[j], -0.05)) out.push('«' + b[i].text + '» (' + b[i].kind + ') задевает ' + (b[j].kind === 'hole' ? 'отверстие' : '«' + b[j].text + '» (' + b[j].kind + ')'));
			}
		}
		return out;
	};

	/* Сведения для списка и таблицы на экране. */
	Dr.info = function (st, card) {
		use(st);
		var views = viewsOf(st, card);
		return { views: views, rows: tableRows(views, false), drills: drillText(views.types), edge: edgeText(card.t) };
	};
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));
