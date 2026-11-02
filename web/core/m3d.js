/* STHGroup — 3D-модель изделия по файлу проекта: где стоит каждая панель, модули, фасады и их
   открывание, разнесённый вид, габариты, спецификация модуля. Здесь только расчёт: ни окна, ни
   рисования. Работает в окне программы и в Node.

   Панель в файле проекта — контур в плоскости XY своей рамки (frame: начало o и орты x, y, z в
   координатах модели) и толщина th вдоль z. С какой стороны от начала рамки лежит толщина, БАЗИС
   не сообщает, поэтому это определяется по отверстиям (M.zmode). */
(function (G) {
	'use strict';
	var BM = G.BM = G.BM || {};
	var geom = BM.geom, M = BM.m3d = {};

	function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
	function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
	function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
	function mul(a, k) { return [a[0] * k, a[1] * k, a[2] * k]; }
	function len(a) { return Math.sqrt(dot(a, a)); }
	function norm(a) { var l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
	function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
	function r1(v) { return Math.round(v * 10) / 10; }
	M.vec = { dot: dot, sub: sub, add: add, mul: mul, len: len, norm: norm, cross: cross };

	/* Точка рамки → точка модели. */
	M.toGlobal = function (f, x, y, z) {
		return [f.o[0] + f.x[0] * x + f.y[0] * y + f.z[0] * z, f.o[1] + f.x[1] * x + f.y[1] * y + f.z[1] * z, f.o[2] + f.x[2] * x + f.y[2] * y + f.z[2] * z];
	};
	M.toLocal = function (f, p) { var r = sub(p, f.o); return [dot(r, f.x), dot(r, f.y), dot(r, f.z)]; };

	function emptyBox() { return { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }; }
	function grow(b, p) { for (var k = 0; k < 3; k++) { if (p[k] < b.min[k]) b.min[k] = p[k]; if (p[k] > b.max[k]) b.max[k] = p[k]; } }
	function growBox(b, c) { grow(b, c.min); grow(b, c.max); }
	function boxC(b) { return [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2]; }
	function boxS(b) { return [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]]; }
	M.box = { empty: emptyBox, grow: grow, center: boxC, size: boxS };

	/* Контуры панели в координатах её рамки: наружный (против часовой стрелки) и вырезы (по часовой). */
	function loopsOf(part) {
		var els = geom.readEls(part.els), loops = geom.loops(els), best = null, inner = [], i;
		for (i = 0; i < loops.length; i++) {
			if (!loops[i].closed) continue;
			var pts = geom.elsPts(loops[i].els, 0.2);
			if (pts.length < 3) continue;
			var rec = { pts: pts, els: loops[i].els, ar: Math.abs(geom.area2(pts)) / 2 };
			if (!best || rec.ar > best.ar) { if (best) inner.push(best); best = rec; } else inner.push(rec);
		}
		if (!best) {                                         // контур не прочитан — габаритный прямоугольник от начала рамки
			var w = Number(part.w) || 0, h = Number(part.h) || 0;
			return { outer: [[0, 0], [w, 0], [w, h], [0, h]], inner: [], els: els, ok: false };
		}
		if (geom.area2(best.pts) < 0) best.pts.reverse();
		for (i = 0; i < inner.length; i++) if (geom.area2(inner[i].pts) > 0) inner[i].pts.reverse();
		return { outer: best.pts, inner: inner.map(function (r) { return r.pts; }), els: els, ok: true };
	}

	/* С какой стороны от начала рамки лежит толщина панели: 0 — от 0 до th, 1 — от −th до 0, 2 — рамка
	   по середине. Правильный вариант тот, при котором больше всего отверстий начинается на
	   поверхности какой-нибудь панели: вход сверла в пласть лежит на пласти, вход в торец — на торце.
	   Считаются разные отверстия, а не совпадения: соседние шкафы стоят вплотную, и одно отверстие
	   подходит сразу двум панелям. */
	M.zmode = function (model, fallback) {
		var parts = model.parts || [], holes = model.holes || [], loc = [], i, k, z;
		for (i = 0; i < parts.length; i++) {
			var p = parts[i];
			if (!p.frame || p.plastic) continue;
			var xs = [], ys = [];
			for (k = 0; k < (p.els || []).length; k++) {
				var e = p.els[k];
				if (!e) continue;
				if (e.t === 'C') { xs.push(e.c[0] - e.r, e.c[0] + e.r); ys.push(e.c[1] - e.r, e.c[1] + e.r); } else { xs.push(e.a[0], e.b[0]); ys.push(e.a[1], e.b[1]); }
			}
			if (!xs.length) continue;
			loc.push({ f: p.frame, th: Number(p.th) || 0, x1: Math.min.apply(null, xs), x2: Math.max.apply(null, xs), y1: Math.min.apply(null, ys), y2: Math.max.apply(null, ys) });
		}
		var best = -1, bestZ = fallback || 0, score = [0, 0, 0], T = 0.6;
		for (z = 0; z < 3; z++) {
			var n = 0;
			for (k = 0; k < holes.length; k++) {
				var h = holes[k], hit = false;
				if (!h.p || !h.d) continue;
				for (i = 0; i < loc.length && !hit; i++) {
					var pl = loc[i], z0 = z === 0 ? 0 : (z === 1 ? -pl.th : -pl.th / 2), z1 = z0 + pl.th;
					var l = M.toLocal(pl.f, h.p), dz = dot(h.d, pl.f.z);
					if (l[0] < pl.x1 - T || l[0] > pl.x2 + T || l[1] < pl.y1 - T || l[1] > pl.y2 + T || l[2] < z0 - T || l[2] > z1 + T) continue;
					if (Math.abs(dz) > 0.95) hit = (dz > 0 && Math.abs(l[2] - z0) < T) || (dz < 0 && Math.abs(l[2] - z1) < T);
					else if (Math.abs(dz) < 0.3) hit = l[2] > z0 + 0.4 && l[2] < z1 - 0.4 && (Math.abs(l[0] - pl.x1) < T || Math.abs(l[0] - pl.x2) < T || Math.abs(l[1] - pl.y1) < T || Math.abs(l[1] - pl.y2) < T);
				}
				if (hit) n++;
			}
			score[z] = n;
			if (n > best) { best = n; bestZ = z; }
		}
		if (fallback !== undefined && score[fallback] === best) bestZ = fallback;       // при равенстве — как решила программа
		M.zmodeScore = score;
		return best > 0 ? bestZ : (fallback || 0);
	};

	var RE_FACADE = /фасад|двер/i, RE_HORIZ = /(^|[\s_.])(дно|крыш|полк|столешн)/i, RE_BOTTOM = /(^|[\s_.])дно/i, RE_TOP = /(^|[\s_.])(крыш|столешн)/i;

	/* Сцена по файлу проекта. opt: { hidden — брать скрытые панели, zmode — задать вручную, up — 'x' | 'y' | 'z' | '-x'…,
	   sigOf — функция id панели → подпись разновидности (для связи с раскроем и присадкой) }. */
	M.build = function (doc, opt) {
		opt = opt || {};
		var model = doc.model || {}, parts = model.parts || [], i, k;
		var zm = (opt.zmode === 0 || opt.zmode === 1 || opt.zmode === 2) ? opt.zmode : M.zmode(model, opt.zmodeHint);
		var sc = { title: model.title || '', zmode: zm, items: [], holes: [], mods: [], mats: [], box: emptyBox(), skipped: { noFrame: 0, hidden: 0, plastic: 0 }, warn: [] };
		var modBy = {}, matBy = {};
		for (i = 0; i < parts.length; i++) {
			var p = parts[i];
			if (p.plastic) { sc.skipped.plastic++; continue; }
			if (!p.frame) { sc.skipped.noFrame++; continue; }
			if (p.hid && !opt.hidden) { sc.skipped.hidden++; continue; }
			var th = Number(p.th) || 0, lp = loopsOf(p), f = p.frame, z0 = zm === 0 ? 0 : (zm === 1 ? -th : -th / 2);
			var it = { i: sc.items.length, id: p.id, sig: opt.sigOf ? (opt.sigOf(p.id) || '') : '', name: p.name || 'Деталь', pos: p.pos || '', des: p.des || '',
				mat: p.mat || '', art: p.art || '', th: th, L: Math.max(p.w, p.h), W: Math.min(p.w, p.h), w: p.w, h: p.h,
				mod: (p.path && p.path[0]) || 'Прочее', sub: (p.path && p.path.length > 1) ? p.path.slice(1).join(' / ') : '', path: p.path || [],
				bk: p.bk >= 0 ? p.bk : -1, tex: Number(p.tex) || 0, hid: p.hid ? 1 : 0, lin: p.lin ? 1 : 0, facade: 0, cups: [], f: f, z0: z0, outer: lp.outer, inner: lp.inner, ok: lp.ok,
				edges: [], cuts: [], box: emptyBox(), c: null, n: f.z, left: dot(cross(f.x, f.y), f.z) < 0 };
			/* кромка: ломаные закромлённых элементов контура */
			var bySrc = {};
			for (k = 0; k < lp.els.length; k++) if (lp.els[k]) (bySrc[lp.els[k].src] = bySrc[lp.els[k].src] || []).push(lp.els[k]);
			for (k = 0; k < (p.butts || []).length; k++) {
				var list = bySrc[p.butts[k].el] || [];
				for (var q = 0; q < list.length; q++) it.edges.push({ pts: geom.tess(list[q], 0.2), th: Number(p.butts[k].th) || 0, mat: p.butts[k].mat || '' });
			}
			/* пазы: траектория и сечение */
			for (k = 0; k < (p.cuts || []).length; k++) {
				var ct = p.cuts[k], ce = geom.readEls(ct.path), cp = [];
				for (q = 0; q < ce.length; q++) if (ce[q]) { var tp = geom.tess(ce[q], 0.2); for (var u = cp.length ? 1 : 0; u < tp.length; u++) cp.push(tp[u]); }
				if (cp.length > 1) it.cuts.push({ pts: cp, w: Number(ct.sw) || 4, d: Number(ct.sh) || Number(ct.th) || 4, name: ct.name || '' });
			}
			for (k = 0; k < it.outer.length; k++) { grow(it.box, M.toGlobal(f, it.outer[k][0], it.outer[k][1], z0)); grow(it.box, M.toGlobal(f, it.outer[k][0], it.outer[k][1], z0 + th)); }
			it.c = boxC(it.box);
			growBox(sc.box, it.box);
			sc.items.push(it);
			var md = modBy[it.mod];
			if (!md) { md = modBy[it.mod] = { name: it.mod, items: [], box: emptyBox(), c: null }; sc.mods.push(md); }
			md.items.push(it.i); growBox(md.box, it.box);
			var mk = it.mat + '|' + th, mt = matBy[mk];
			if (!mt) { mt = matBy[mk] = { key: mk, name: it.mat, th: th, items: [], color: M.matColor(it.mat) }; sc.mats.push(mt); }
			mt.items.push(it.i); it.matKey = mk;
		}
		for (i = 0; i < sc.mods.length; i++) sc.mods[i].c = boxC(sc.mods[i].box);
		if (!sc.items.length) { sc.box = { min: [0, 0, 0], max: [1, 1, 1] }; sc.warn.push('В проекте нет панелей с известным положением.'); }
		sc.c = boxC(sc.box); sc.size = boxS(sc.box);

		/* отверстия: чьё оно (панель, на поверхности которой лежит вход сверла) */
		var holes = model.holes || [];
		for (k = 0; k < holes.length; k++) {
			var h = holes[k];
			/* отверстия видны всегда, даже если крепёж в БАЗИСе скрыт (hid): тело крепежа от этого не рисуется, а дырки остаются */
			if (!h.p || !h.d || !(h.dia > 0)) continue;
			var rec = { p: h.p, d: h.d, dia: h.dia, depth: h.depth > 0 ? h.depth : 0, thr: h.mode === 1 ? 1 : 0, fast: h.fast || '', item: -1, side: '', hid: h.hid ? 1 : 0 };
			for (i = 0; i < sc.items.length && rec.item < 0; i++) {
				var t = sc.items[i], l = M.toLocal(t.f, h.p), dz = dot(h.d, t.f.z), T = 0.6, b = t.lb || (t.lb = localBox(t));
				if (l[0] < b.x1 - T || l[0] > b.x2 + T || l[1] < b.y1 - T || l[1] > b.y2 + T || l[2] < t.z0 - T || l[2] > t.z0 + t.th + T) continue;
				if (Math.abs(dz) > 0.95) { if (dz > 0 && Math.abs(l[2] - t.z0) < T) { rec.item = i; rec.side = 'a'; } else if (dz < 0 && Math.abs(l[2] - t.z0 - t.th) < T) { rec.item = i; rec.side = 'b'; } }
				else if (Math.abs(dz) < 0.3 && l[2] > t.z0 + 0.4 && l[2] < t.z0 + t.th - 0.4) { rec.item = i; rec.side = 'e'; }
				if (rec.item >= 0) { rec.l = l; if (rec.side !== 'e' && h.dia >= 34 && h.dia <= 36) t.cups.push({ x: l[0], y: l[1], side: rec.side }); }
			}
			sc.holes.push(rec);
		}
		sc.up = M.upAxis(sc, opt.up);
		for (i = 0; i < sc.items.length; i++) {
			var a = sc.items[i];
			a.facade = (RE_FACADE.test(a.name) || (a.cups.length && a.th >= 15.5 && a.th <= 22.5)) && !a.lin ? 1 : 0;
		}
		M.motion(sc);
		sc.front = M.frontAxis(sc, opt.front);
		buildSolids(sc, model, opt);
		sc.fast = M.fasteners(sc, opt);
		return sc;
	};


	/* Крепёж по отверстиям. БАЗИС отдаёт отверстия (с названием крепежа), а тело крепежа — только в 3D-файле, если он
	   есть и если крепёж в него попал. Поэтому тела, которые должны стоять в отверстиях, программа достраивает сама:
	   конфирмат — винт с головкой через пласть одной панели в торец другой; эксцентрик — круглая чашка в пласти и
	   стяжной болт в торце; полкодержатель — штырёк. Размеры — по отверстию и по названию («Конфирмат 7,0 X 50»).
	   Запись: { kind: 'conf'|'cam'|'bolt'|'peg', p — вход (центр головки), d — ось внутрь материала, len, dia — тело,
	   hdia, hlen — головка, item — панель, на которой тело едет при разнесении и открывании, name }. */
	var RE_CONF = /конфирмат|confirmat/i, RE_CAM = /эксцентрик|стяжк|рафикс|rafix|minifix|миниф/i, RE_PEG = /полкодерж|штырь|опора\s+полки/i;
	M.fasteners = function (sc, opt) {
		opt = opt || {};
		var H = sc.holes || [], out = [], used = {}, i, j;
		var take = function (h) { return !h.hid || opt.hidden; };
		function numIn(name, re, def) { var m = re.exec(name || ''); return m ? Number(String(m[1]).replace(',', '.')) : def; }
		/* конфирматы: пласть (Ø6 и больше) + торец (меньше), на одной оси */
		var face = [], edge = [];
		for (i = 0; i < H.length; i++) {
			var h = H[i];
			if (!take(h) || !RE_CONF.test(h.fast)) continue;
			if (h.side === 'e') edge.push(i); else if (h.item >= 0 && h.dia >= 6) face.push(i); else if (h.item >= 0) edge.push(i);
		}
		for (i = 0; i < face.length; i++) {
			var a = H[face[i]], best = -1, bd = 1e9;
			for (j = 0; j < edge.length; j++) {
				var b = H[edge[j]];
				if (used[edge[j]] || dot(a.d, b.d) < 0.98) continue;
				var r = sub(b.p, a.p), ax = dot(r, a.d), rad = len(sub(r, mul(a.d, ax)));
				if (rad < 1.5 && ax > -1.5 && ax < 60 && Math.abs(ax) < bd) { bd = Math.abs(ax); best = j; }
			}
			var L0 = numIn(a.fast, /[xх×]\s*(\d+(?:[.,]\d+)?)/i, 50), dia = numIn(a.fast, /(\d+(?:[.,]\d+)?)\s*[xх×]/i, 7), L = L0;
			if (best >= 0) used[edge[best]] = 1; else L = Math.min(L0, Math.max(a.depth || 16, 10));
			if (a.hid && !opt.hidden) continue;
			out.push({ kind: 'conf', name: a.fast, p: a.p, d: a.d, len: L, dia: Math.max(5, Math.min(dia, 8)) - 0.6, hdia: Math.max(9, dia + 3), hlen: 4, item: a.item, col: '#cdd2d6' });
			used[face[i]] = 1;
		}
		/* эксцентрик: чашка Ø12–17,5 в пласти; в торце — болт; Ø5–7 в пласти — штифт, торчащий наружу */
		for (i = 0; i < H.length; i++) {
			var c = H[i];
			if (!take(c) || !RE_CAM.test(c.fast) || c.item < 0) continue;
			if (c.side !== 'e' && c.dia >= 12 && c.dia <= 17.5) out.push({ kind: 'cam', name: c.fast, p: c.p, d: c.d, len: Math.max(8, Math.min(c.depth || 12.5, 14)), dia: c.dia - 0.8, hdia: 0, hlen: 0, item: c.item, col: '#f2a31b' });
			else if (c.side === 'e' && c.dia >= 6 && c.dia <= 10) out.push({ kind: 'bolt', name: c.fast, p: c.p, d: c.d, len: Math.max(c.depth || 20, 10), dia: 5.6, hdia: 0, hlen: 0, item: c.item, col: '#9aa3ab' });
			else if (c.side !== 'e' && c.dia >= 4 && c.dia < 12) out.push({ kind: 'bolt', name: c.fast, p: add(c.p, mul(c.d, c.depth || 12)), d: mul(c.d, -1), len: (c.depth || 12) + 10, dia: Math.max(4, c.dia - 0.6), hdia: 0, hlen: 0, item: c.item, col: '#9aa3ab' });
		}
		/* полкодержатель: штырёк, торчит из пласти на 7 мм */
		for (i = 0; i < H.length; i++) {
			var g = H[i];
			if (!take(g) || !RE_PEG.test(g.fast) || g.item < 0 || g.side === 'e') continue;
			out.push({ kind: 'peg', name: g.fast, p: add(g.p, mul(g.d, g.depth || 12)), d: mul(g.d, -1), len: (g.depth || 12) + 7, dia: Math.max(3.5, g.dia - 0.4), hdia: 0, hlen: 0, item: g.item, col: '#8d969e' });
		}
		/* пока рисуются только конфирматы (решение автора); эксцентрики, штифты и полкодержатели — при opt.more */
		return opt.more ? out : out.filter(function (q) { return q.kind === 'conf'; });
	};

	/* Фурнитура и профили (выгрузка 1.4): сетка треугольников в координатах модели (v) или габарит (mn, mx).
	   Своего движения у них нет: тело едет вместе с панелью своего блока, на которой (или рядом с которой)
	   стоит (anchor) — ручка открывается с фасадом; нет такой панели — со средним сдвигом панелей блока (grp). */
	function buildSolids(sc, model, opt) {
		var src = model.solids || [], blocks = model.blocks || [], byBk = {}, i, k;
		sc.solids = [];
		for (i = 0; i < sc.items.length; i++) (byBk[sc.items[i].bk] = byBk[sc.items[i].bk] || []).push(i);
		sc.bkItems = byBk;
		for (i = 0; i < src.length; i++) {
			var s = src[i];
			if (s.hid && !opt.hidden) continue;
			var r = { i: sc.solids.length, name: s.name || 'Фурнитура', art: s.art || '', kind: s.kind || '', mat: s.mat || '', bk: s.bk >= 0 ? s.bk : -1, v: null, box: null, c: null, anchor: -1, grp: [], mod: 'Прочее' };
			r.prof = /Extrusion|Trajectory|Rotation/.test(r.kind) ? 1 : 0;
			/* формы у записи нет (с 1.12.0 фурнитура рисуется из 3D-файла БАЗИСа); габарит из выгрузки 1.4
			   был в своих осях объекта — не берётся */
			/* модуль — верхний блок; группа — ближайший блок вверх по дереву, где есть панели */
			var bk = r.bk, top = -1, guard = 0;
			while (bk >= 0 && guard++ < 80) { if (!r.grp.length && byBk[bk]) r.grp = byBk[bk]; top = bk; bk = blocks[bk] ? blocks[bk].up : -1; }
			if (top >= 0 && blocks[top]) r.mod = blocks[top].name || r.mod;
			if (r.c && r.grp.length) {
				var best = -1, bd = Infinity;
				for (k = 0; k < r.grp.length; k++) {
					var t = sc.items[r.grp[k]], T = 40;
					if (r.c[0] < t.box.min[0] - T || r.c[0] > t.box.max[0] + T || r.c[1] < t.box.min[1] - T || r.c[1] > t.box.max[1] + T || r.c[2] < t.box.min[2] - T || r.c[2] > t.box.max[2] + T) continue;
					var d = len(sub(r.c, t.c));
					if (d < bd) { bd = d; best = t.i; }
				}
				r.anchor = best;
			}
			sc.solids.push(r);
		}
	}
	/* сдвиг тела при разнесении: ex — сдвиги панелей из M.explode */
	M.solidShift = function (s, ex) {
		if (s.anchor >= 0) return ex[s.anchor];
		if (!s.grp.length) return [0, 0, 0];
		var v = [0, 0, 0];
		for (var k = 0; k < s.grp.length; k++) v = add(v, ex[s.grp[k]]);
		return mul(v, 1 / s.grp.length);
	};

	/* Дерево модели, как в БАЗИСе: блоки (из выгрузки, с вложенностью), в них панели, облицовки,
	   фурнитура и профили. Без блоков в выгрузке (старый скрипт) дерево строится по пути панели.
	   Узел: { id, kind: 'block'|'panel'|'plastic'|'furn'|'prof', name, art, kids, up, items (все панели
	   внутри), sols (все тела внутри), n (элементов внутри) }; у панели it — номер, у тела so — номер. */
	M.tree = function (doc, sc) {
		var model = (doc && doc.model) || {}, B = model.blocks || [], parts = model.parts || [], nodes = [], byId = {}, i, k;
		var root = { id: 'r', kind: 'root', name: sc.title || 'Модель', kids: [], up: null };
		function node(o, up) { o.id = o.id || ('n' + nodes.length); o.kids = []; o.up = up; nodes.push(o); byId[o.id] = o; up.kids.push(o); return o; }
		var withBk = B.length && (sc.items.some(function (t) { return t.bk >= 0; }) || (sc.solids || []).some(function (s) { return s.bk >= 0; }));
		var itemNode = {}, solNode = {}, place = function (bk) { return root; };
		if (withBk) {
			var bn = [];
			for (i = 0; i < B.length; i++) bn.push({ id: 'b' + i, kind: 'block', name: B[i].name || 'Блок', art: B[i].art || '', bk: i, gs: B[i].gs || null, cls: B[i].cls || '' });
			for (i = 0; i < B.length; i++) { var up = B[i].up >= 0 && bn[B[i].up] ? bn[B[i].up] : root; bn[i].kids = []; bn[i].up = up; }
			/* в порядке выгрузки: родитель всегда раньше ребёнка */
			for (i = 0; i < B.length; i++) { nodes.push(bn[i]); byId[bn[i].id] = bn[i]; bn[i].up.kids.push(bn[i]); }
			place = function (bk) { return bk >= 0 && bn[bk] ? bn[bk] : root; };
		} else {
			var grp = {};
			place = function (bk, path) {
				var up = root, key = '';
				for (var q = 0; q < (path || []).length; q++) {
					key += '\n' + path[q];
					if (!grp[key]) grp[key] = node({ kind: 'block', name: path[q], art: '' }, up);
					up = grp[key];
				}
				return up;
			};
		}
		var byPart = {};
		for (i = 0; i < sc.items.length; i++) {
			var t = sc.items[i], pn = node({ kind: 'panel', name: t.name, art: '', it: t.i, pos: t.pos, des: t.des, mat: t.mat }, place(t.bk, t.path));
			itemNode[t.i] = pn; byPart[t.id] = pn;
		}
		for (i = 0; i < parts.length; i++) {
			var p = parts[i];
			if (!p.plastic || !byPart[p.of]) continue;
			node({ kind: 'plastic', name: 'Облицовка: ' + (p.mat || ''), art: p.art || '', mat: p.mat || '' }, byPart[p.of]);
		}
		for (i = 0; i < (sc.solids || []).length; i++) {
			var s = sc.solids[i];
			solNode[s.i] = node({ kind: s.prof ? 'prof' : 'furn', name: s.mat && s.prof ? s.mat : s.name, art: s.art, so: s.i, geo: !!s.box }, place(s.bk, []));
		}
		/* счёт снизу вверх; пустые блоки убираем */
		function sum(nd) {
			nd.items = nd.it !== undefined ? [nd.it] : []; nd.sols = nd.so !== undefined ? [nd.so] : []; nd.n = 0; nd.nPan = nd.it !== undefined ? 1 : 0; nd.nFurn = nd.so !== undefined ? 1 : 0;
			nd.kids = nd.kids.filter(function (c) { sum(c); return c.kind !== 'block' || c.n > 0; });
			for (var q = 0; q < nd.kids.length; q++) {
				var c = nd.kids[q];
				nd.items = nd.items.concat(c.items); nd.sols = nd.sols.concat(c.sols); nd.nPan += c.nPan; nd.nFurn += c.nFurn;
				nd.n += c.kind === 'block' ? c.n : 1 + c.n;
			}
		}
		sum(root);
		nodes = nodes.filter(function (nd) { var u = nd; while (u && u !== root) { if (u.up.kids.indexOf(u) < 0) return false; u = u.up; } return true; });
		byId = {}; nodes.forEach(function (nd) { byId[nd.id] = nd; });
		return { root: root, nodes: nodes, byId: byId, itemNode: itemNode, solNode: solNode, blocks: !!withBk };
	};
	/* Дерево по 3D-файлу БАЗИСа: узлы — объекты файла в его порядке и вложенности (как «Структура
	   модели» в БАЗИСе). Панель — объект, сопоставленный с панелью проекта (it), у неё — облицовки.
	   У узла ob — номер объекта файла, objs — объекты внутри (с ним самим). Форма узлов — как у M.tree. */
	M.treeGlb = function (doc, sc, O, Mt) {
		var model = (doc && doc.model) || {}, parts = model.parts || [], nodes = [], byId = {}, itemNode = {}, objNode = {}, solNode = {};
		var arts = {};
		(model.blocks || []).concat(model.solids || [], model.fast || [], model.kits || [], model.prof || []).forEach(function (x) { if (x && x.art) arts[x.art] = 1; });
		arts = Object.keys(arts).sort(function (a, b) { return b.length - a.length; });
		var root = { id: 'r', kind: 'root', name: sc.title || 'Модель', kids: [], up: null };
		function node(o, up) { o.kids = []; o.up = up; nodes.push(o); byId[o.id] = o; up.kids.push(o); return o; }
		function add(i, up) {
			var ob = O.objs[i], nm = BM.glb.splitName(ob.name, arts), it = Mt.byObj[i];
			var kind = it !== undefined ? 'panel' : (ob.kids.length ? 'block' : (/^вырез/i.test(nm.name) ? 'cut' : (/профил|лента|рассеив/i.test(nm.name) ? 'prof' : 'furn')));
			var nd = node({ id: 'g' + i, kind: kind, name: it !== undefined ? (sc.items[it].name || nm.name) : nm.name, art: nm.art, ob: i, geo: ob.own }, up);
			if (it !== undefined) { nd.it = it; itemNode[it] = nd; var t = sc.items[it]; nd.pos = t.pos; nd.des = t.des; nd.mat = t.mat; }
			objNode[i] = nd;
			ob.kids.forEach(function (k) { add(k, nd); });
			return nd;
		}
		O.top.forEach(function (i) { add(i, root); });
		/* облицовки — под своей панелью */
		var byPart = {};
		sc.items.forEach(function (t) { if (itemNode[t.i]) byPart[t.id] = itemNode[t.i]; });
		parts.forEach(function (p) { if (p.plastic && byPart[p.of]) node({ id: 'p' + nodes.length, kind: 'plastic', name: 'Облицовка: ' + (p.mat || ''), art: p.art || '', mat: p.mat || '' }, byPart[p.of]); });
		function sum(nd) {
			nd.items = nd.it !== undefined ? [nd.it] : []; nd.objs = nd.ob !== undefined ? [nd.ob] : []; nd.sols = []; nd.n = 0; nd.nPan = nd.it !== undefined ? 1 : 0; nd.nFurn = (nd.kind === 'furn' || nd.kind === 'prof') ? 1 : 0;
			for (var q = 0; q < nd.kids.length; q++) {
				var c = nd.kids[q]; sum(c);
				nd.items = nd.items.concat(c.items); nd.objs = nd.objs.concat(c.objs); nd.nPan += c.nPan; nd.nFurn += c.nFurn; nd.n += 1 + c.n;
			}
		}
		sum(root);
		return { root: root, nodes: nodes, byId: byId, itemNode: itemNode, solNode: solNode, objNode: objNode, blocks: true, glb: true };
	};

	/* путь узла: имена блоков сверху вниз */
	M.nodePath = function (nd) { var r = []; for (var u = nd; u && u.kind !== 'root'; u = u.up) r.unshift(u.name); return r; };
	/* габарит узла по панелям и телам */
	M.nodeBox = function (sc, nd) {
		var b = emptyBox(), k;
		for (k = 0; k < nd.items.length; k++) growBox(b, sc.items[nd.items[k]].box);
		for (k = 0; k < nd.sols.length; k++) if (sc.solids[nd.sols[k]].box) growBox(b, sc.solids[nd.sols[k]].box);
		return b.min[0] <= b.max[0] ? b : null;
	};
	/* разнесение одного блока: его панели и вложенные блоки расходятся от центра блока */
	M.scopeOf = function (sc, nd) {
		return { node: nd.id, items: nd.items.slice(), groups: nd.kids.filter(function (c) { return c.kind === 'block' && c.items.length > 1; }).map(function (c) { return c.items.slice(); }) };
	};

	/* Где у изделия лицо: туда смотрят фасады. Нет фасадов — берётся ось, принятая в БАЗИСе
	   (Z к зрителю при вертикальной Y), либо −Y, если вверх смотрит Z. Вектор перпендикулярен верху. */
	M.frontAxis = function (sc, forced) {
		var ax = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }, up = sc.up, v = [0, 0, 0], i;
		if (forced && ax[String(forced).replace('-', '')]) { v = ax[String(forced).replace('-', '')]; if (String(forced).charAt(0) === '-') v = mul(v, -1); }
		else for (i = 0; i < sc.items.length; i++) {
			var t = sc.items[i];
			if (!t.facade) continue;
			var md = modOf(sc, t), out = t.cups.length ? (t.cups[0].side === 'a' ? 1 : -1) : (dot(sub(t.c, md.c), t.n) >= 0 ? 1 : -1);
			v = add(v, mul(t.n, out * t.L * t.W));
		}
		v = sub(v, mul(up, dot(v, up)));
		if (len(v) < 1e-6) v = Math.abs(up[1]) > 0.5 ? [0, 0, 1] : (Math.abs(up[2]) > 0.5 ? [0, -1, 0] : [0, 0, 1]);
		/* к ближайшей оси модели: фасады стоят по осям, а не под углом */
		var a = [Math.abs(v[0]), Math.abs(v[1]), Math.abs(v[2])], k = a[0] >= a[1] && a[0] >= a[2] ? 0 : (a[1] >= a[2] ? 1 : 2), r = [0, 0, 0];
		r[k] = v[k] >= 0 ? 1 : -1;
		return r;
	};
	function localBox(t) {
		var b = { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity };
		for (var k = 0; k < t.outer.length; k++) { b.x1 = Math.min(b.x1, t.outer[k][0]); b.x2 = Math.max(b.x2, t.outer[k][0]); b.y1 = Math.min(b.y1, t.outer[k][1]); b.y2 = Math.max(b.y2, t.outer[k][1]); }
		return b;
	}
	M.localBox = function (t) { return t.lb || (t.lb = localBox(t)); };

	/* Где у модели верх. БАЗИС этого не сообщает: смотрим на панели, которые лежат горизонтально по
	   своему названию (дно, крышка, полка, столешница), а знак — по тому, что дно ниже крышки.
	   Возвращает единичный вектор; forced — 'x', 'y', 'z', '-x', '-y', '-z' задаёт его вручную. */
	M.upAxis = function (sc, forced) {
		var ax = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }, i, k;
		if (forced && ax[String(forced).replace('-', '')]) { var v = ax[String(forced).replace('-', '')]; sc.upHow = 'задано'; return String(forced).charAt(0) === '-' ? mul(v, -1) : v; }
		var vote = [0, 0, 0];
		for (i = 0; i < sc.items.length; i++) {
			var t = sc.items[i];
			if (!RE_HORIZ.test(t.name) || RE_FACADE.test(t.name)) continue;
			for (k = 0; k < 3; k++) vote[k] += Math.abs(t.n[k]) * t.L * t.W;
		}
		var a = 1;                                             // по умолчанию — Y, как в БАЗИСе
		sc.upHow = 'по умолчанию';
		if (vote[0] + vote[1] + vote[2] > 0) { a = vote[0] > vote[1] ? (vote[0] > vote[2] ? 0 : 2) : (vote[1] >= vote[2] ? 1 : 2); sc.upHow = 'по названиям панелей'; }
		var lo = 0, ln = 0, hi = 0, hn = 0;
		for (i = 0; i < sc.items.length; i++) {
			var it = sc.items[i];
			if (RE_BOTTOM.test(it.name)) { lo += it.c[a]; ln++; } else if (RE_TOP.test(it.name)) { hi += it.c[a]; hn++; }
		}
		var up = [0, 0, 0];
		up[a] = (ln && hn && hi / hn < lo / ln) ? -1 : 1;
		return up;
	};

	/* Открывание. Фасад с чашками петель поворачивается вокруг кромки, у которой стоят чашки; фасад
	   без чашек выдвигается вместе с панелями своего блока (ящик). В it.move:
	   { kind: 'turn', p — точка оси, a — направление оси, ang — угол в градусах } или
	   { kind: 'slide', v — вектор сдвига }; у панелей короба ящика — тот же сдвиг и lead — номер фасада. */
	M.motion = function (sc) {
		var i, k;
		for (i = 0; i < sc.items.length; i++) sc.items[i].move = null;
		for (i = 0; i < sc.items.length; i++) {
			var t = sc.items[i];
			if (!t.facade) continue;
			var md = modOf(sc, t), b = M.localBox(t);
			/* наружу — от модуля; у фасада с чашками — от пласти с чашками */
			var out = dot(sub(t.c, md.c), t.n) >= 0 ? 1 : -1;
			if (t.cups.length) out = t.cups[0].side === 'a' ? 1 : -1;      // чашка на пласти z0 → лицо на z0 + th
			var nOut = mul(t.n, out);
			if (t.cups.length) {
				var dl = 0, dr = 0, db = 0, dt = 0;
				for (k = 0; k < t.cups.length; k++) { dl += t.cups[k].x - b.x1; dr += b.x2 - t.cups[k].x; db += t.cups[k].y - b.y1; dt += b.y2 - t.cups[k].y; }
				var m = Math.min(dl, dr, db, dt), zb = out > 0 ? t.z0 : t.z0 + t.th, p, a, free;
				if (m === dl) { p = M.toGlobal(t.f, b.x1, b.y1, zb); a = t.f.y; free = t.f.x; }
				else if (m === dr) { p = M.toGlobal(t.f, b.x2, b.y1, zb); a = t.f.y; free = mul(t.f.x, -1); }
				else if (m === db) { p = M.toGlobal(t.f, b.x1, b.y1, zb); a = t.f.x; free = t.f.y; }
				else { p = M.toGlobal(t.f, b.x1, b.y2, zb); a = t.f.x; free = mul(t.f.y, -1); }
				/* знак угла: свободная кромка должна уйти наружу. Поворот вектора free вокруг a на +90° даёт a × free. */
				var sgn = dot(cross(a, free), nOut) >= 0 ? 1 : -1;
				var lift = Math.abs(dot(a, sc.up)) < 0.5;                 // ось горизонтальна — подъёмный или откидной
				t.move = { kind: 'turn', p: p, a: a, ang: sgn * (lift ? 85 : 100) };
			} else {
				var depth = 0, sizeN = Math.abs(dot(boxS(md.box), [Math.abs(t.n[0]), Math.abs(t.n[1]), Math.abs(t.n[2])]));
				depth = Math.max(120, Math.min(360, sizeN * 0.62));
				t.move = { kind: 'slide', v: mul(nOut, depth) };
				if (t.sub) for (k = 0; k < sc.items.length; k++) {
					var o = sc.items[k];
					if (o !== t && !o.facade && o.mod === t.mod && o.sub === t.sub) o.move = { kind: 'slide', v: t.move.v, lead: t.i };
				}
			}
		}
	};
	function modOf(sc, t) { for (var i = 0; i < sc.mods.length; i++) if (sc.mods[i].name === t.mod) return sc.mods[i]; return { c: sc.c, box: sc.box }; }
	M.modOf = modOf;

	/* Положение панели при открывании на долю k (0…1): { turn: [точка, ось, угол в радианах] } или { shift: вектор }. */
	M.moveAt = function (t, k) {
		if (!t.move || !(k > 0)) return null;
		if (t.move.kind === 'turn') return { p: t.move.p, a: t.move.a, ang: t.move.ang * k * Math.PI / 180 };
		return { shift: mul(t.move.v, k) };
	};

	/* Разнесённый вид: сдвиг каждой панели при разнесении k (0…1). scope — имя модуля (разносится
	   один модуль, как на схеме сборки) или пусто (вся модель: модули расходятся от центра изделия,
	   панели — от центра своего модуля). Панель уходит вдоль своей нормали в ту сторону, с которой
	   она стоит от центра модуля; панели посередине (полки) остаются на месте. */
	M.explode = function (sc, k, scope) {
		if (scope && typeof scope === 'object') return explodeSet(sc, k, scope);
		var out = [], i, groups = {};
		/* блоки внутри модуля (ящики): блок уходит целиком, его панели расходятся уже внутри него */
		for (i = 0; i < sc.items.length; i++) {
			var g0 = sc.items[i];
			if (!g0.sub) continue;
			var gk = g0.mod + '\n' + g0.sub, gr = groups[gk] || (groups[gk] = { box: emptyBox(), n: null, items: 0 });
			growBox(gr.box, g0.box); gr.items++;
			if (g0.facade && g0.move && g0.move.kind === 'slide') gr.n = norm(g0.move.v);
		}
		for (var key in groups) if (groups.hasOwnProperty(key)) groups[key].c = boxC(groups[key].box);
		function push(c, center, n, size, k, base, share) {
			var an = [Math.abs(n[0]), Math.abs(n[1]), Math.abs(n[2])], along = dot(size, an), off = dot(sub(c, center), n);
			var s = Math.abs(off) < along * 0.12 ? 0 : (off > 0 ? 1 : -1);
			return mul(n, s * k * (along * share + base));
		}
		for (i = 0; i < sc.items.length; i++) {
			var t = sc.items[i], md = modOf(sc, t), v = [0, 0, 0];
			if (k > 0 && (!scope || t.mod === scope)) {
				var grp = t.sub ? groups[t.mod + '\n' + t.sub] : null;
				if (grp && grp.items > 1) {
					var gs = boxS(grp.box), ms = boxS(md.box);
					/* блок: вперёд по ходу ящика (или от центра модуля), и врозь с соседними блоками по высоте */
					var dir = grp.n || norm(sub(grp.c, md.c)), fwd = Math.abs(dot(ms, [Math.abs(dir[0]), Math.abs(dir[1]), Math.abs(dir[2])]));
					v = mul(dir, k * (fwd * 0.75 + 160));
					v = add(v, mul(sc.up || [0, 0, 1], dot(sub(grp.c, md.c), sc.up || [0, 0, 1]) * k * 0.9));
					v = add(v, push(t.c, grp.c, t.n, gs, k, 70, 0.3));
				} else v = push(t.c, md.c, t.n, boxS(md.box), k, 140, 0.45);
				if (!scope) {
					var mv = sub(md.c, sc.c), ss = sc.size, far = Math.max(ss[0], ss[1], ss[2]) || 1;
					v = add(v, mul(mv, k * 0.9 * (1 + 400 / far)));
				}
			}
			out.push(v);
		}
		return out;
	};

	function explodeSet(sc, k, scope) {
		var out = [], i, j, inSet = {}, grpOf = {}, box = emptyBox();
		for (i = 0; i < scope.items.length; i++) { inSet[scope.items[i]] = 1; growBox(box, sc.items[scope.items[i]].box); }
		var c = boxC(box), size = boxS(box), gs = [];
		for (j = 0; j < scope.groups.length; j++) {
			var gb = emptyBox();
			for (i = 0; i < scope.groups[j].length; i++) { grpOf[scope.groups[j][i]] = j; growBox(gb, sc.items[scope.groups[j][i]].box); }
			gs.push({ c: boxC(gb), size: boxS(gb) });
		}
		function push(pc, center, n, sz, base, share) {
			var an = [Math.abs(n[0]), Math.abs(n[1]), Math.abs(n[2])], along = dot(sz, an), off = dot(sub(pc, center), n);
			var s = Math.abs(off) < along * 0.12 ? 0 : (off > 0 ? 1 : -1);
			return mul(n, s * k * (along * share + base));
		}
		for (i = 0; i < sc.items.length; i++) {
			var t = sc.items[i], v = [0, 0, 0];
			if (k > 0 && inSet[i]) {
				var g = grpOf[i];
				if (g !== undefined) {
					var G2 = gs[g], d = sub(G2.c, c), dl = len(d), dir = dl > 1 ? mul(d, 1 / dl) : (sc.front || [0, 0, 1]);
					var along = Math.abs(dot(size, [Math.abs(dir[0]), Math.abs(dir[1]), Math.abs(dir[2])]));
					v = add(mul(dir, k * (along * 0.5 + 140)), push(t.c, G2.c, t.n, G2.size, 60, 0.3));
				} else v = push(t.c, c, t.n, size, 140, 0.45);
			}
			out.push(v);
		}
		return out;
	}

	/* Спецификация модуля: одинаковые панели — одна строка. Номер строки — номер кружка на схеме. */
	M.spec = function (sc, modName) {
		var rows = [], by = {}, i;
		for (i = 0; i < sc.items.length; i++) {
			var t = sc.items[i];
			if (modName && t.mod !== modName) continue;
			var key = [t.pos, t.des, t.name, t.mat, r1(t.L), r1(t.W), t.th].join('|'), r = by[key];
			if (!r) { r = by[key] = { n: 0, pos: t.pos, des: t.des, name: t.name, mat: t.mat, L: r1(t.L), W: r1(t.W), th: t.th, qty: 0, items: [], sig: t.sig }; rows.push(r); }
			r.qty++; r.items.push(t.i);
		}
		rows.sort(function (a, b) {
			var pa = parseFloat(a.pos), pb = parseFloat(b.pos);
			if (!isNaN(pa) && !isNaN(pb) && pa !== pb) return pa - pb;
			if (isNaN(pa) !== isNaN(pb)) return isNaN(pa) ? 1 : -1;
			return a.des < b.des ? -1 : (a.des > b.des ? 1 : (a.name < b.name ? -1 : (a.name > b.name ? 1 : 0)));
		});
		for (i = 0; i < rows.length; i++) rows[i].n = i + 1;
		return rows;
	};

	/* Габаритные размеры: изделия целиком или модуля. Возвращает три отрезка вдоль осей модели у
	   «переднего нижнего» ребра габарита и их длины. */
	M.dims = function (sc, box) {
		box = box || sc.box;
		var s = boxS(box), res = [], k, up = sc.up, ua = Math.abs(up[0]) > 0.5 ? 0 : (Math.abs(up[1]) > 0.5 ? 1 : 2);
		for (k = 0; k < 3; k++) {
			if (!(s[k] > 0.5)) continue;
			var a = box.min.slice(), b = box.min.slice();
			if (k === ua) { a[k] = box.min[k]; b[k] = box.max[k]; }
			else { a[ua] = b[ua] = up[ua] > 0 ? box.max[ua] : box.min[ua]; b[k] = box.max[k]; }
			res.push({ a: a, b: b, len: Math.round(s[k]), axis: k, up: k === ua });
		}
		return res;
	};

	/* Цвет материала по названию: в файле проекта цвета нет. Подбирается по словам названия;
	   если слов нет — спокойный оттенок, свой у каждого названия. */
	var COLORS = [
		[/стекл|зеркал/i, '#bcd3da'], [/алюм|металл|сталь|хром|нерж/i, '#b7bbc0'], [/хдф|двп|оргалит/i, '#ece9df'],
		[/антрацит|графит/i, '#44484e'], [/ч[её]рн/i, '#232426'], [/бел/i, '#f3f2ee'], [/кашемир/i, '#d9cdbc'], [/крем|ванил|слонов|молоч/i, '#ece3cb'],
		[/беж|капучино|латте/i, '#d6c3a3'], [/бетон|цемент/i, '#a9aaa5'], [/сер/i, '#9c9fa2'],
		[/венге/i, '#40291f'], [/орех/i, '#7b5437'], [/вишн|махагон|красное дерево/i, '#8b412c'], [/сонома/i, '#c8a679'], [/вотан|крафт|золот/i, '#b98b56'],
		[/дуб/i, '#bf9968'], [/ясень|клён|клен|бер[её]з/i, '#dcc9a6'], [/бук|ольха/i, '#d6a878'], [/сосн/i, '#e1c690'],
		[/красн|бордо/i, '#b23b33'], [/син|голуб/i, '#44688f'], [/зел[её]н|оливк|фисташ/i, '#62805a'], [/ж[её]лт/i, '#e0bf4d'], [/оранж|терракот/i, '#c9703d'], [/розов|пудр/i, '#dcb7b4']
	];
	M.matColor = function (name) {
		for (var i = 0; i < COLORS.length; i++) if (COLORS[i][0].test(name || '')) return COLORS[i][1];
		var h = 0, s = String(name || '');
		for (i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
		var hue = h % 360, c = hslHex(hue, 0.16, 0.72);
		return c;
	};
	function hslHex(h, s, l) {
		var a = s * Math.min(l, 1 - l), f = function (n) { var k = (n + h / 30) % 12, c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); return ('0' + Math.round(255 * c).toString(16)).slice(-2); };
		return '#' + f(0) + f(8) + f(4);
	}
	M.hslHex = hslHex;
})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : global));
