/* STHGroup — сборочные чертежи (раздел «Сборка», 1.18: пошагово + разнесённый вид).
   Документ на всё изделие: общий вид → для каждой разновидности модуля листы шагов (корпус, полки, задняя стенка,
   фурнитура, узлы в сборе, фасады; новые детали шага жёлтым, собранное серым, крепёж красными точками у места
   и списком «× N») → шаги узлов (ящиков) на своих листах → монтаж модулей и общих деталей → разнесённый вид модуля
   с узлами крепления и таблицей → спецификация всего изделия.
   Сборочные единицы — блоки с отметкой «Сборочная единица» (blocks[].au, скрипт 1.9); без отметок — блоки верхнего
   уровня, где больше одной детали (одиночные — общие детали); без блоков — модули. Вложенный блок со словом «ящ»
   в названии — узел в сборе со своими шагами. Одинаковые модули (те же детали) — одни листы «× N шт.».
   Шаг детали задаётся вручную (work.asm.step[единица][разновидность детали] = шаг), хранится в проекте.
   Всё — в мм бумаги, лист — поле 266 × 162 (рамка и штамп — out_asm.js). */
(function (G) {
	'use strict';
	var BM = G.BM = G.BM || {};
	var P = BM.project, M = BM.m3d, D = BM.draw, Dr = BM.drill, esc = D.esc;
	var A = BM.asm = {};
	var INK = '#1c2126', MUTE = '#5d6770', WARN = '#b45309', RED = '#d62828', HWC = '#d98a1e';
	var SHADE = { new: ['#f6c453', '#e9b23a', '#fbd877'], done: ['#eef0f2', '#dfe3e6', '#f6f7f8'], ghost: ['#eef0f2', '#dfe3e6', '#f6f7f8'], hw: ['#4a5560', '#3a444d', '#5a6670'], hwnew: ['#d98a1e', '#c47812', '#e9a043'], part: ['#e7edf0', '#d6dee3', '#f1f5f7'] };
	var RE_SUB = /ящ/i;                                                    // вложенный блок-узел: ящик
	var RE_HW = /подвеск|направляющ|петл|ручк|опор[аы]?\b|ножк|замок|замки|стабилиз|кронштейн|амортиз|доводчик|camar|movento|tandem|blum|hettich/i;
	var RE_DRILL = /^ø|^отв|розетк|^паз|^\d+([.,]\d+)?\s*[xх×]\s*\d/i;   // отверстия без крепежа
	/* шаги (1.20 — как собирают: левый бок лёжа → дно и крыша → полки и перегородки → правый бок → корпус на ноги, задняя стенка) */
	var STD = [['body', 'Корпус'], ['inner', 'Полки и перегородки'], ['side2', 'Правый бок'], ['back', 'Задняя стенка и царги'], ['fac', 'Фасады']];
	A.STEP_NAMES = { body: 'Корпус', inner: 'Полки и перегородки', side2: 'Правый бок', back: 'Задняя стенка и царги', fac: 'Фасады' };

	function f2(v) { return String(Math.round(v * 100) / 100); }
	function tw(s, b) { return Dr.tw(String(s), b); }
	function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
	function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
	function norm(a) { var l = Math.sqrt(dot(a, a)) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
	function add(a, b, k) { k = k === undefined ? 1 : k; return [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k]; }
	function txt(x, y, s, o) {
		o = o || {};
		return '<text x="' + f2(x) + '" y="' + f2(y) + '" font-size="' + f2(o.fs || 2.6) + '"' + (o.a ? ' text-anchor="' + o.a + '"' : '') + (o.b ? ' font-weight="700"' : '') + ' fill="' + (o.c || INK) + '">' + esc(s) + '</text>';
	}
	function line(x1, y1, x2, y2, w, c) { return '<line x1="' + f2(x1) + '" y1="' + f2(y1) + '" x2="' + f2(x2) + '" y2="' + f2(y2) + '" stroke="' + (c || INK) + '" stroke-width="' + (w || 0.2) + '"/>'; }
	function balloon(x, y, n, r, hl) {
		n = String(n); var fs = r * (n.length > 2 ? 0.8 : (n.length > 1 ? 0.95 : 1.15));
		return '<circle cx="' + f2(x) + '" cy="' + f2(y) + '" r="' + f2(r) + '" fill="' + (hl ? INK : '#fff') + '" stroke="' + INK + '" stroke-width="0.3"/>' + txt(x, y + fs * 0.36, n, { fs: fs, b: 1, a: 'middle', c: hl ? '#fff' : INK });
	}
	function wrap(text, fs, width, bold) {
		var words = String(text).split(' '), out = [], cur = '';
		words.forEach(function (w) {
			var t = cur ? cur + ' ' + w : w;
			if (tw(t, bold) * fs > width && cur) { out.push(cur); cur = w; } else cur = t;
		});
		if (cur) out.push(cur);
		return out.length ? out : [''];
	}
	function clip(s, fs, w, b) { s = String(s); if (tw(s, b) * fs <= w) return s; while (s.length > 1 && tw(s + '…', b) * fs > w) s = s.slice(0, -1); return s.replace(/\s+$/, '') + '…'; }
	function hit(a, b, pad) { return a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad; }
	/* короткое название крепежа для шагов: без «(5000 шт.)», длинное — до первой запятой */
	function shortName(s) {
		s = String(s || '').replace(/\s*\([^)]*шт[^)]*\)/ig, '').replace(/_/g, ' ').trim();
		var cm = s.indexOf(', ');
		if (s.length > 30 && cm > 8) {
			var rest = s.slice(cm), m = /(^|[\s,])((лев|прав)[а-яё]*)/i.exec(rest);
			s = s.slice(0, cm).trim();
			if (m && !(/лев/i.test(rest) && /прав/i.test(rest))) s += ' ' + m[2];
		}
		return s;
	}
	/* название шага фурнитуры: по роду фурнитуры, иначе — начало названия блока */
	var HW_KIND = [[/петл/i, 'Петли'], [/направляющ|movento|tandem|legrabox|метабокс/i, 'Направляющие'], [/подвеск|camar/i, 'Подвески'], [/ручк/i, 'Ручки'], [/опор|ножк/i, 'Опоры'], [/штанг/i, 'Штанги'], [/подъёмник|подъемник|aventos/i, 'Подъёмники']];
	function hwTitle(s) { for (var k = 0; k < HW_KIND.length; k++) if (HW_KIND[k][0].test(s)) return HW_KIND[k][1]; var t = blockTitle(s).split(/\s+/); return t.slice(0, t.join(' ').length > 22 ? 3 : t.length).join(' '); }
	function blockTitle(s) { s = String(s || '').replace(/_/g, ' ').replace(/^\d+\.\s*/, ''); var k = s.search(/[,(]/); if (k > 4) s = s.slice(0, k); return s.trim() || 'Фурнитура'; }

	/* Сцена 3D проекта — та же, что у присадки (кэш st._sc3), чтобы верх и лицо изделия совпадали. */
	function scene(st) {
		var m = (st.set && st.set.model) || {}, key = [m.up, m.front, m.zmode].join('|');
		if (st._sc3 && st._sc3.key === key && st._sc3.doc === st.doc && st._sc3.sc) return withSig(st, st._sc3.sc);
		var sc = null, sigBy = {};
		st.types.forEach(function (t) { t.ids.forEach(function (id) { sigBy[id] = t.sig; }); });
		try { sc = M.build(st.doc, { sigOf: function (id) { return sigBy[id]; }, zmodeHint: st.holes && st.holes.zmode, hidden: !!(st.set && st.set.est && st.set.est.hidden), up: m.up || undefined, front: m.front || undefined, zmode: m.zmode >= 0 ? m.zmode : undefined }); } catch (e) { sc = null; }
		st._sc3 = { key: key, doc: st.doc, sc: sc };
		return sc ? withSig(st, sc) : sc;
	}
	function withSig(st, sc) {
		if (sc._sig) return sc;
		var by = {}; st.types.forEach(function (t) { t.ids.forEach(function (id) { by[id] = t.sig; }); });
		sc.items.forEach(function (it) { if (!it.sig && by[it.id]) it.sig = by[it.id]; });
		sc._sig = 1;
		return sc;
	}
	A.scene = scene;
	function chainOf(B, bk) { var r = []; for (var b = bk, g = 0; b >= 0 && B[b] && g < 80; b = B[b].up, g++) r.unshift(b); return r; }
	function blocks(st) { return (st.doc.model && st.doc.model.blocks) || st.model.blocks || []; }

	/* ----------------------------- сборочные единицы ----------------------------- */
	/* [{ key, name, label, bk, items, subs: [{ key, bk, name, label, items }], depth, parent }], by: 'au' | 'blk' | 'mod' */
	A.units = function (st) {
		if (st._asm && st._asm.doc === st.doc) return st._asm.list;
		var sc = scene(st), B = blocks(st), list = [], i, by = '', loose = [];
		if (!sc) { st._asm = { doc: st.doc, list: list, by: '', loose: [] }; return list; }
		var marked = []; for (i = 0; i < B.length; i++) if (B[i] && B[i].au) marked.push(i);
		if (marked.length) {
			by = 'au';
			marked.forEach(function (b) {
				var u = { key: 'b' + b, bk: b, name: B[b].name || 'Сборочная единица', label: B[b].pos || B[b].des || '', items: [], subs: [], depth: chainOf(B, b).length };
				var subBy = {};
				sc.items.forEach(function (it) {
					var ch = chainOf(B, it.bk), at = ch.indexOf(b);
					if (at < 0) return;
					var sub = -1;
					for (var k = at + 1; k < ch.length; k++) if (B[ch[k]] && B[ch[k]].au) { sub = ch[k]; break; }
					if (sub < 0) { u.items.push(it.i); return; }
					if (!subBy[sub]) { subBy[sub] = { bk: sub, key: 'b' + sub, name: B[sub].name || 'Узел', label: B[sub].pos || B[sub].des || '', items: [] }; u.subs.push(subBy[sub]); }
					subBy[sub].items.push(it.i);
				});
				if (u.items.length || u.subs.length) list.push(u);
			});
			list.forEach(function (u) { u.subs.forEach(function (s) { var su = list.filter(function (x) { return x.key === s.key; })[0]; if (su) su.parent = u.key; }); });
			var inTop = {}; list.forEach(function (u) { if (u.parent) return; u.items.forEach(function (k) { inTop[k] = 1; }); u.subs.forEach(function (s) { s.items.forEach(function (k) { inTop[k] = 1; }); }); });
			sc.items.forEach(function (it) { if (!inTop[it.i]) loose.push(it.i); });
		} else if (B.length) {
			by = 'blk';
			var top = {};
			sc.items.forEach(function (it) { var ch = chainOf(B, it.bk), t = ch.length ? ch[0] : -1; (top[t] = top[t] || []).push(it.i); });
			Object.keys(top).forEach(function (t) {
				t = Number(t);
				if (t >= 0 && top[t].length >= 2 && compact(sc, top[t])) list.push({ key: 'b' + t, bk: t, name: B[t].name || 'Модуль', label: B[t].pos || B[t].des || '', items: top[t], subs: [], depth: 1 });
				else loose = loose.concat(top[t]);
			});
			if (!list.length) { by = 'mod'; loose = []; }
		}
		if (!list.length) {
			by = 'mod';
			sc.mods.forEach(function (m, k) { if (m.items.length >= 2) list.push({ key: 'm' + k, name: m.name, label: '', items: m.items.slice(0), subs: [], depth: 1 }); else loose = loose.concat(m.items); });
			if (!list.length) { sc.mods.forEach(function (m, k) { if (m.items.length) list.push({ key: 'm' + k, name: m.name, label: '', items: m.items.slice(0), subs: [], depth: 1 }); }); loose = []; }
		}
		/* узлы «ящик» внутри единицы — свои листы шагов (если не отмечены в БАЗИСе) */
		if (B.length) list.slice().forEach(function (u) {
			if (!(u.bk >= 0)) return;
			var grp = {};
			u.items.forEach(function (i) {
				var ch = chainOf(B, sc.items[i].bk), at = ch.indexOf(u.bk);
				for (var k = at + 1; k < ch.length; k++) if (B[ch[k]] && RE_SUB.test(B[ch[k]].name || '')) { (grp[ch[k]] = grp[ch[k]] || []).push(i); return; }
			});
			Object.keys(grp).forEach(function (b) {
				var its = grp[b]; b = Number(b);
				if (its.length < 3 || its.length >= u.items.length) return;
				u.items = u.items.filter(function (i) { return its.indexOf(i) < 0; });
				var s = { bk: b, key: 'b' + b, name: B[b].name || 'Ящик', label: B[b].pos || B[b].des || '', items: its, auto: 1 };
				u.subs.push(s);
				list.splice(list.indexOf(u) + 1, 0, { key: s.key, bk: b, name: s.name, label: s.label, items: its.slice(0), subs: [], depth: u.depth + 1, parent: u.key, auto: 1 });
			});
		});
		if (by === 'au') list.sort(function (a, b) { return P.natCmp(a.label || a.name, b.label || b.name) || a.depth - b.depth; });
		st._asm = { doc: st.doc, list: list, by: by, loose: loose };
		return list;
	};
	/* детали блока стоят вместе (модуль), а не разбросаны (набор «Отдельные детали», «Фасады»): без далёких — не больше 6 м */
	function compact(sc, idx) {
		var c = idx.map(function (i) { return sc.items[i].c; }), med = [0, 1, 2].map(function (k) { var v = c.map(function (q) { return q[k]; }).sort(function (a, b) { return a - b; }); return v[Math.floor(v.length / 2)]; });
		var dist = c.map(function (q) { return Math.hypot(q[0] - med[0], q[1] - med[1], q[2] - med[2]); }), ds = dist.slice().sort(function (a, b) { return a - b; }), q8 = ds[Math.floor(ds.length * 0.8)];
		var keep = idx.filter(function (i, k) { return dist[k] <= Math.max(1000, 3 * q8); });
		if (keep.length < 2) return false;
		var b = aabb([].concat.apply([], keep.map(function (i) { var it = sc.items[i]; return [it.box.min, it.box.max]; })));
		return Math.max(b.hi[0] - b.lo[0], b.hi[1] - b.lo[1], b.hi[2] - b.lo[2]) <= 6000;
	}
	A.by = function (st) { A.units(st); return st._asm ? st._asm.by : ''; };
	A.loose = function (st) { A.units(st); return st._asm ? st._asm.loose : []; };
	A.title = function (u) { return (u.label ? u.label + '  ' : '') + u.name; };
	function unitBy(st, key) { var l = A.units(st); for (var i = 0; i < l.length; i++) if (l[i].key === key) return l[i]; return null; }

	/* ----------------------------- геометрия ----------------------------- */
	function axes(sc) { var up = sc.up || [0, 0, 1], fr = sc.front || [0, -1, 0]; return { up: up, fr: fr, rt: cross(up, fr) }; }
	function corners(t) {
		var lb = M.localBox(t), z0 = t.z0, z1 = t.z0 + t.th, c = [];
		[[lb.x1, lb.y1, z0], [lb.x2, lb.y1, z0], [lb.x2, lb.y2, z0], [lb.x1, lb.y2, z0], [lb.x1, lb.y1, z1], [lb.x2, lb.y1, z1], [lb.x2, lb.y2, z1], [lb.x1, lb.y2, z1]].forEach(function (q) { c.push(M.toGlobal(t.f, q[0], q[1], q[2])); });
		return c;
	}
	function boxC(lo, hi) { return [[lo[0], lo[1], lo[2]], [hi[0], lo[1], lo[2]], [hi[0], hi[1], lo[2]], [lo[0], hi[1], lo[2]], [lo[0], lo[1], hi[2]], [hi[0], lo[1], hi[2]], [hi[0], hi[1], hi[2]], [lo[0], hi[1], hi[2]]]; }
	function aabb(pts) { var lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]; pts.forEach(function (p) { for (var k = 0; k < 3; k++) { if (p[k] < lo[k]) lo[k] = p[k]; if (p[k] > hi[k]) hi[k] = p[k]; } }); return { lo: lo, hi: hi }; }
	function boxDist(b, p) { var d2 = 0; for (var k = 0; k < 3; k++) { var e = Math.max(b.lo[k] - p[k], 0, p[k] - b.hi[k]); d2 += e * e; } return Math.sqrt(d2); }
	function extAx(pts, ax) { var a = Infinity, z = -Infinity; pts.forEach(function (p) { var v = dot(p, ax); if (v < a) a = v; if (v > z) z = v; }); return [a, z]; }
	function shift(c, v) { return c.map(function (q) { return add(q, v); }); }
	function center(c) { var s = [0, 0, 0]; c.forEach(function (q) { s[0] += q[0] / c.length; s[1] += q[1] / c.length; s[2] += q[2] / c.length; }); return s; }

	/* Изометрия: спереди-слева-сверху. list: [{ c: 8 углов, kind, top }] */
	function View(sc) {
		var X = axes(sc), v = norm(add(add(X.fr, X.rt, -0.55), X.up, 0.42)), r = norm(cross(X.up, v)), u = cross(v, r);
		return { v: v, pr: function (p) { return [dot(p, r), -dot(p, u)]; } };
	}
	var FACES = [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
	function iso(V, sc, list) {
		var X = axes(sc), polys = [];
		list.forEach(function (b) {
			var cc = center(b.c);
			FACES.forEach(function (fc) {
				var ce = center(fc.map(function (i) { return b.c[i]; }));
				var n = cross(add(b.c[fc[1]], b.c[fc[0]], -1), add(b.c[fc[3]], b.c[fc[0]], -1)); if (dot(n, add(ce, cc, -1)) < 0) n = n.map(function (q) { return -q; });
				if (dot(n, V.v) <= 1e-9) return;
				var nn = norm(n), lit = Math.abs(dot(nn, X.up)) > 0.7 ? 0 : (Math.abs(dot(nn, X.rt)) > 0.7 ? 1 : 2);
				polys.push({ d: dot(ce, V.v), pts: fc.map(function (i) { return V.pr(b.c[i]); }), b: b, lit: lit });
			});
		});
		polys.sort(function (a, c) { return ((a.b.top ? 1 : 0) - (c.b.top ? 1 : 0)) || a.d - c.d; });
		var mn = [Infinity, Infinity], mx = [-Infinity, -Infinity];
		polys.forEach(function (p) { p.pts.forEach(function (q) { mn[0] = Math.min(mn[0], q[0]); mn[1] = Math.min(mn[1], q[1]); mx[0] = Math.max(mx[0], q[0]); mx[1] = Math.max(mx[1], q[1]); }); });
		if (!polys.length) { mn = [0, 0]; mx = [1, 1]; }
		return { polys: polys, bb: [mn[0], mn[1], mx[0], mx[1]] };
	}
	function fit(bb, x, y, w, h) {
		var k = Math.min(w / Math.max(1e-6, bb[2] - bb[0]), h / Math.max(1e-6, bb[3] - bb[1])), ox = x + (w - (bb[2] - bb[0]) * k) / 2 - bb[0] * k, oy = y + (h - (bb[3] - bb[1]) * k) / 2 - bb[1] * k;
		var T = function (q) { return [ox + q[0] * k, oy + q[1] * k]; }; T.k = k; return T;
	}
	function drawPolys(I, T, sw) {
		return I.polys.map(function (p) {
			var S = SHADE[p.b.kind] || SHADE.part, gh = p.b.kind === 'ghost';
			return '<path d="M' + p.pts.map(function (q) { var s = T(q); return f2(s[0]) + ' ' + f2(s[1]); }).join('L') + 'Z" fill="' + S[p.lit] + '"' + (gh ? ' fill-opacity="0.25" stroke="#9aa3ab"' : ' stroke="#2b3138"') + ' stroke-width="' + sw + '" stroke-linejoin="round"/>';
		}).join('');
	}

	/* ----------------------------- разбор единицы: детали, шаги, крепёж ----------------------------- */
	function rowKey(it) { return it.sig || (it.name + '|' + it.L + '|' + it.W + '|' + it.th); }
	A.rowKey = rowKey;
	function stepOver(st, u) { var w = st.work && st.work.asm; return (w && w.step && w.step[u.key]) || {}; }
	/* Шаг детали вручную: what — 'body' | 'inner' | 'back' | 'fac' | '' (вернуть как было) */
	A.setStep = function (st, ukey, rk, what) {
		var w = st.work.asm || (st.work.asm = {}); if (!w.step) w.step = {};
		var m = w.step[ukey] || (w.step[ukey] = {});
		if (!what) delete m[rk]; else m[rk] = what;
		if (!Object.keys(m).length) delete w.step[ukey];
		delete st._asmD; delete st._asmPlan;
	};
	A.manualCount = function (st) { var w = st.work && st.work.asm, n = 0; if (w && w.step) Object.keys(w.step).forEach(function (k) { n += Object.keys(w.step[k]).length; }); return n; };

	A.data = function (st, u) {
		var ver = JSON.stringify(stepOver(st, u));
		if (!st._asmD || st._asmD.doc !== st.doc) st._asmD = { doc: st.doc, by: {} };
		var hit0 = st._asmD.by[u.key]; if (hit0 && hit0.ver === ver) return hit0.d;
		var d = build(st, u); st._asmD.by[u.key] = { ver: ver, d: d };
		return d;
	};
	function build(st, u) {
		var sc = scene(st), B = blocks(st), X = axes(sc), model = st.doc.model || {}, hidOk = !!(st.set && st.set.est && st.set.est.hidden);
		var subOf = {}; u.subs.forEach(function (s) { s.items.forEach(function (i) { subOf[i] = s; }); });
		var allI = u.items.concat([].concat.apply([], u.subs.map(function (s) { return s.items; })));
		var info = {};
		allI.forEach(function (i) { var it = sc.items[i], c = corners(it); info[i] = { i: i, it: it, c: c, bb: aabb(c) }; });
		/* деталь, стоящая далеко от остальных (ошибка в модели, общий цоколь на всю кухню), рисунок не растягивает:
		   её нет на рисунке, в списке шага — есть */
		var far = {};
		if (allI.length >= 3) {
			var med = [0, 1, 2].map(function (k) { var v = allI.map(function (i) { return sc.items[i].c[k]; }).sort(function (a, b) { return a - b; }); return v[Math.floor(v.length / 2)]; });
			var dist = allI.map(function (i) { var c = sc.items[i].c; return Math.hypot(c[0] - med[0], c[1] - med[1], c[2] - med[2]); }), ds = dist.slice().sort(function (a, b) { return a - b; }), q8 = ds[Math.floor(ds.length * 0.8)];
			allI.forEach(function (i, k) { if (dist[k] > Math.max(1000, 3 * q8)) { far[i] = 1; info[i].far = 1; } });
		}
		var near0 = allI.filter(function (i) { return !far[i]; });
		var allPts = [].concat.apply([], near0.map(function (i) { return info[i].c; })), carc = near0.filter(function (i) { return !info[i].it.facade; });
		var cPts = carc.length ? [].concat.apply([], carc.map(function (i) { return info[i].c; })) : allPts;
		var E = { x: extAx(cPts, X.rt), y: extAx(cPts, X.up), z: extAx(cPts, X.fr) }, ubb = aabb(allPts);
		/* роль детали — по положению в единице */
		function role(i) {
			var it = info[i].it, n = it.n || [0, 0, 1], ax = [Math.abs(dot(n, X.rt)), Math.abs(dot(n, X.up)), Math.abs(dot(n, X.fr))], k = ax.indexOf(Math.max.apply(null, ax));
			if (it.facade) return 'fac';
			/* деталь внутри блока «Фасад…» (рамочный фасад: профиль и стекло) — тоже фасад */
			var chf = chainOf(B, it.bk), atf = chf.indexOf(u.bk);
			for (var q = atf + 1; q < chf.length; q++) if (atf >= 0 && B[chf[q]] && /^фасад/i.test(String(B[chf[q]].name || '').trim())) return 'fac';
			var tol = it.th * 1.5 + 3, c = info[i].c, ex = k === 0 ? extAx(c, X.rt) : (k === 1 ? extAx(c, X.up) : extAx(c, X.fr)), EE = k === 0 ? E.x : (k === 1 ? E.y : E.z);
			if (k === 2) return (ex[0] + ex[1]) / 2 < EE[0] + 0.35 * (EE[1] - EE[0]) ? 'back' : 'inner';
			return (ex[0] <= EE[0] + tol || ex[1] >= EE[1] - tol) ? 'body' : 'inner';
		}
		var over = stepOver(st, u);
		/* фурнитура: блоки внутри единицы (не в узлах) с покупными комплектами */
		var subBk = {}; u.subs.forEach(function (s) { if (s.bk >= 0) subBk[s.bk] = 1; });
		function inUnit(bk) {                 // блок внутри единицы и не внутри её узла
			if (!(u.bk >= 0) || !(bk >= 0)) return false;
			var ch = chainOf(B, bk), at = ch.indexOf(u.bk);
			if (at < 0) return false;
			for (var k = at + 1; k < ch.length; k++) if (subBk[ch[k]]) return false;
			return true;
		}
		var FL = (model.fast || []).filter(function (f) { return f.bk >= 0 && !(f.hid && !hidOk); }), KL = (model.kits || []).filter(function (f) { return f.bk >= 0 && !(f.hid && !hidOk); });
		var art = {}; FL.concat(KL).forEach(function (f) { if (f.art && !art[f.name]) art[f.name] = String(f.art); });
		var kitBk = {}; KL.forEach(function (k) { if (inUnit(k.bk)) kitBk[k.bk] = 1; });
		function kitOf(bk) { var ch = chainOf(B, bk); for (var k = ch.length - 1; k >= 0; k--) { if (ch[k] === u.bk) break; if (kitBk[ch[k]]) return ch[k]; } return -1; }
		var hwT = [], hwId = {};
		function hwStep(title) { var id = 'hw:' + title; if (!hwId[id]) { if (hwT.length >= 3) return hwT[2]; hwId[id] = 1; hwT.push(id); } return id; }
		function namesIn(b) { return [B[b].name].concat(KL.concat(FL).filter(function (f) { return chainOf(B, f.bk).indexOf(Number(b)) >= 0; }).map(function (f) { return f.name; })).join(' '); }
		Object.keys(kitBk).sort(function (a, b) { return a - b; }).forEach(function (b) { kitBk[b] = hwStep(hwTitle(namesIn(b))); });
		/* шаги */
		var steps = [], byId = {};
		function mk(id, title, kind) { if (byId[id]) return byId[id]; var s = { id: id, title: title, kind: kind, items: [], subs: [], fast: {}, hw: {}, dots: [], boxes: [] }; byId[id] = s; return s; }
		STD.forEach(function (x) { mk(x[0], x[1], 'parts'); });
		hwT.forEach(function (id) { mk(id, id.slice(3), 'hw'); });
		u.subs.forEach(function (s) { mk('sub:' + s.key, s.name + ' в сборе', 'sub').subs.push(s); });
		u.items.forEach(function (i) { var r = over[rowKey(info[i].it)]; var id = r && byId[r] && STD.some(function (x) { return x[0] === r; }) ? r : role(i); info[i].step = id; info[i].man = !!(r && id === r); byId[id].items.push(i); });
		/* бок лёжа: левый бок с дном и крышей — первым шагом, правый бок — после полок (если в корпусе оба бока и горизонтальные детали) */
		function sideOf(i) {
			var it = info[i].it, n = it.n || [0, 0, 1]; if (Math.abs(dot(n, X.rt)) < 0.7) return '';
			var ex = extAx(info[i].c, X.rt), tol = it.th * 1.5 + 3;
			return ex[0] <= E.x[0] + tol ? 'L' : (ex[1] >= E.x[1] - tol ? 'R' : '');
		}
		var bodyL = byId.body.items.filter(function (i) { return sideOf(i) === 'L'; }), bodyR = byId.body.items.filter(function (i) { return !info[i].man && sideOf(i) === 'R'; }), bodyH = byId.body.items.filter(function (i) { return !sideOf(i); });
		var lie = !!(bodyL.length && bodyR.length && bodyH.length) || !!byId.side2.items.length;
		if (bodyL.length && bodyR.length && bodyH.length) bodyR.forEach(function (i) { info[i].step = 'side2'; byId.body.items.splice(byId.body.items.indexOf(i), 1); byId.side2.items.push(i); });
		if (lie) {
			var hn = bodyH.map(function (i) { return info[i].it.name; }).join(' ');
			byId.body.title = /дно/i.test(hn) && /крыш|крышк/i.test(hn) ? 'Дно и крыша к левому боку' : 'Корпус к левому боку';
			byId.body.lie = byId.inner.lie = byId.side2.lie = 1;
			byId.back.stand = 1;
			if (!byId.back.items.some(function (i) { return /царг/i.test(info[i].it.name); })) byId.back.title = 'Задняя стенка';
		}
		u.subs.forEach(function (s) { s.items.forEach(function (i) { info[i].step = 'sub:' + s.key; }); byId['sub:' + s.key].items = s.items.slice(0); });
		var ORDER = ['body', 'inner', 'side2', 'back'].concat(hwT, u.subs.map(function (s) { return 'sub:' + s.key; }), ['fac']);
		function ord(id) { return ORDER.indexOf(id); }
		/* ближайшие детали к точке → шаг (поздний из двух ближайших) */
		var own = u.items.map(function (i) { return info[i]; });
		/* полкодержатели — с полками, а не с правым боком (noR) */
		function stepAt(p, noR) {
			var near = own.map(function (q) { return { q: q, d: boxDist(q.bb, p) }; }).filter(function (x) { return x.d < 40 && !(noR && x.q.step === 'side2'); }).sort(function (a, b) { return a.d - b.d; }).slice(0, 2);
			if (!near.length) return '';
			var best = ''; near.forEach(function (x) { if (ord(x.q.step) > ord(best)) best = x.q.step; }); return best;
		}
		/* отверстия единицы (без отверстий узлов), без повторов: пара отверстий одного крепежа в двух деталях — один */
		var holes = [], loose = {};
		(model.holes || []).forEach(function (h) {
			if (!h.p || !h.fast) return;
			var mine;
			if (u.bk >= 0 && h.bk >= 0) {
				mine = inUnit(h.bk);
				if (!mine) {
					/* общий блок верхнего уровня (не единица): его фурнитура в габарите единицы — её */
					var ch = chainOf(B, h.bk), t0 = ch[0];
					if (st._asm && st._asm.by !== 'mod' && !unitBy(st, 'b' + t0) && boxDist(ubb, h.p) < 3) { loose[h.bk] = 1; mine = 'loose'; }
				}
			} else mine = boxDist(ubb, h.p) < 3 && !allI.some(function (i) { return subOf[i] && boxDist(info[i].bb, h.p) < 1; });
			if (!mine) return;
			var d = h.d || [0, 0, 1];
			if (holes.some(function (q) { return q.h.fast === h.fast && h.p.every(function (v, k) { return Math.abs(d[k]) > 0.5 ? Math.abs(v - q.h.p[k]) < 45 : Math.abs(v - q.h.p[k]) < 1; }); })) return;
			holes.push({ h: h, loose: mine === 'loose' });
		});
		/* шаг блока крепежа: блок детали, в котором он стоит («Дно» → эксцентрики дна), иначе — по его отверстиям */
		var blkStep = {}, partsBy = {};
		u.items.forEach(function (i) { chainOf(B, info[i].it.bk).forEach(function (b) { (partsBy[b] = partsBy[b] || []).push(i); }); });
		function ownerStep(bk) {
			var ch = chainOf(B, bk), stop = ch.indexOf(u.bk);
			for (var k = ch.length - 2; k > stop; k--) {
				var its = partsBy[ch[k]]; if (!its || !its.length) continue;
				var sid = info[its[0]].step;
				its.forEach(function (i) { info[i].fastened = 1; });                // у детали свой крепёж в блоке — «без крепежа» не пишем
				if (!its.every(function (i) { return info[i].step === sid; })) return '';
				/* крепёж горизонтальной детали у правого бока — ставится с правым боком */
				if ((sid === 'body' || sid === 'inner') && byId.side2.items.length && !/полкодерж/i.test(FL.filter(function (f) { return chainOf(B, f.bk).indexOf(bk) >= 0; }).map(function (f) { return f.name; }).join(' '))) {
					var R = byId.side2.items, L = byId.body.items.filter(function (i) { return its.indexOf(i) < 0; });
					var near = holes.some(function (q) { if (!(q.h.bk >= 0) || chainOf(B, q.h.bk).indexOf(bk) < 0) return false; var dR = Math.min.apply(null, R.map(function (i) { return boxDist(info[i].bb, q.h.p); })), dL = L.length ? Math.min.apply(null, L.map(function (i) { return boxDist(info[i].bb, q.h.p); })) : Infinity; return dR < 25 && dR < dL; });
					if (near) return 'side2';
				}
				return sid;
			}
			return '';
		}
		function stepOfBlock(bk) {
			if (blkStep[bk] !== undefined) return blkStep[bk];
			var kb = kitOf(bk); if (kb >= 0) return (blkStep[bk] = kitBk[kb]);
			var ow = ownerStep(bk); if (ow) return (blkStep[bk] = ow);
			var best = '';
			holes.forEach(function (q) { if (q.h.bk >= 0 && chainOf(B, q.h.bk).indexOf(bk) >= 0) { var s = stepAt(q.h.p); if (ord(s) > ord(best)) best = s; } });
			return (blkStep[bk] = best || 'body');
		}
		/* блоки с деталями (сама единица, её подблоки): крепёж в них записан общим числом — раскладываем по шагам по отверстиям */
		var partBlk = {}; allI.forEach(function (i) { chainOf(B, sc.items[i].bk).forEach(function (b) { partBlk[b] = 1; }); });
		var fastBk = {}, spread = {}, holeSteps = {}; FL.forEach(function (f) { if (inUnit(f.bk) && !partBlk[f.bk]) fastBk[f.bk] = 1; });
		function ensureHw(title) { var sid = hwStep(title); if (!byId[sid]) { mk(sid, sid.slice(3), 'hw'); ORDER.splice(ORDER.indexOf('fac') - u.subs.length, 0, sid); } return sid; }
		function hasFastUp(bk) { var ch = chainOf(B, bk); for (var k = ch.length - 1; k >= 0 && ch[k] !== u.bk; k--) if (fastBk[ch[k]]) return true; return false; }
		function addTo(s, kind, name, n) { var m = s[kind]; m[name] = (m[name] || 0) + n; }
		var anyFast = false;
		FL.forEach(function (f) {
			if (!inUnit(f.bk)) return;
			anyFast = true;
			if (partBlk[f.bk]) { if (RE_HW.test(f.name)) addTo(byId[ensureHw(hwTitle(f.name))], 'hw', f.name, f.n || 1); else spread[f.name] = (spread[f.name] || 0) + (f.n || 1); return; }
			var s = byId[stepOfBlock(f.bk)]; addTo(s, RE_HW.test(f.name) ? 'hw' : 'fast', f.name, f.n || 1);
		});
		KL.forEach(function (k) { if (!inUnit(k.bk)) return; anyFast = true; addTo(byId[partBlk[k.bk] ? ensureHw(hwTitle(k.name)) : stepOfBlock(k.bk)], 'hw', k.name, k.n || 1); });
		/* отверстия: точки у места; крепёж без записи в выгрузке — считаем по отверстиям */
		var hwClusters = {};
		holes.forEach(function (q) {
			var h = q.h, isHw = RE_HW.test(h.fast), sid;
			if (RE_DRILL.test(h.fast)) return;
			anyFast = true;
			if (q.loose) {
				var tb = chainOf(B, h.bk)[0], title = hwTitle((B[tb] ? B[tb].name : '') + ' ' + h.fast);
				sid = ensureHw(title);
				(hwClusters[sid + '|' + h.fast] = hwClusters[sid + '|' + h.fast] || { sid: sid, name: h.fast, pts: [], hwName: 1 }).pts.push(h.p);
				return;
			}
			var kb = h.bk >= 0 ? kitOf(h.bk) : -1;
			sid = kb >= 0 ? kitBk[kb] : (h.bk >= 0 && fastBk[h.bk] ? stepOfBlock(h.bk) : (h.bk >= 0 && hasFastUp(h.bk) ? stepOfBlock(h.bk) : (stepAt(h.p, /полкодерж/i.test(h.fast)) || 'body')));
			if (kb >= 0) (hwClusters[kb] = hwClusters[kb] || { sid: sid, pts: [] }).pts.push(h.p);
			else if (isHw && h.bk >= 0 && fastBk[h.bk]) (hwClusters['f' + h.bk] = hwClusters['f' + h.bk] || { sid: sid, pts: [] }).pts.push(h.p);
			if (!isHw) { byId[sid].dots.push(h.p); (byId[sid].fh = byId[sid].fh || []).push(h); }          // fh — отверстия крепежа шага (фигуры крепежа на снимках «Сборки»)
			if (!(h.bk >= 0 && hasFastUp(h.bk)) && !(kb >= 0 && isHw)) {
				if (spread[h.fast] !== undefined) { var hs = holeSteps[h.fast] || (holeSteps[h.fast] = {}); hs[sid] = (hs[sid] || 0) + 1; }
				else addTo(byId[sid], isHw ? 'hw' : 'fast', h.fast, 1);
			}
		});
		/* общее число из выгрузки — по шагам пропорционально отверстиям */
		Object.keys(spread).forEach(function (n) {
			var N = spread[n], hs = holeSteps[n] || {}, ids = Object.keys(hs), tot = ids.reduce(function (a, k) { return a + hs[k]; }, 0);
			if (!tot) { addTo(byId.body, 'fast', n, N); return; }
			var left = N;
			ids.sort(function (a, b) { return hs[b] - hs[a]; }).forEach(function (k, q) { var v = q === ids.length - 1 ? left : Math.round(N * hs[k] / tot); v = Math.min(v, left); left -= v; if (v > 0) addTo(byId[k], 'fast', n, v); });
		});
		/* фурнитура телами: скопления отверстий (до 300 мм) — брусок по ним */
		Object.keys(hwClusters).forEach(function (k) {
			var cl = hwClusters[k], groups = [];
			cl.pts.forEach(function (p) { var g = groups.filter(function (g0) { return g0.some(function (q) { return Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) < 300; }); })[0]; if (g) g.push(p); else groups.push([p]); });
			groups.forEach(function (g) {
				var b = aabb(g), lo = b.lo.map(function (v) { return v - 7; }), hi = b.hi.map(function (v) { return v + 7; });
				byId[cl.sid].boxes.push(boxC(lo, hi));
				if (cl.hwName) addTo(byId[cl.sid], 'hw', cl.name, 1);
			});
		});
		ORDER.forEach(function (id) { var s = byId[id]; if (s && (s.items.length || s.subs.length || Object.keys(s.fast).length || Object.keys(s.hw).length || s.boxes.length || id === 'body')) steps.push(s); });
		if (!byId.body.items.length && steps.length > 1 && steps[0].id === 'body' && !Object.keys(byId.body.fast).length) steps.shift();
		/* деталь без крепежа: ни одной точки крепежа рядом (на любом шаге) */
		var allDots = [].concat.apply([], steps.map(function (s) { return s.dots; }));
		steps.forEach(function (s, k) {
			s.n = k + 1;
			if (s.kind !== 'parts' || s.id === 'fac' || !s.items.length) return;
			var bare = s.items.filter(function (i) { return !info[i].far && !info[i].fastened && !allDots.some(function (p) { return boxDist(info[i].bb, p) < 20; }); });
			if (bare.length && !Object.keys(s.fast).length) s.warn = anyFast ? 'Крепёж этих деталей в модели не задан — проверьте модель.' : 'Крепежа в модели нет.';
			else if (bare.length) s.warn = 'Без крепежа в модели: ' + bare.map(function (i) { return info[i].it.pos || info[i].it.name; }).filter(function (v, q, a) { return a.indexOf(v) === q; }).join(', ') + '.';
		});
		/* итог по единице (с узлами) */
		var tf = {}, th = {};
		steps.forEach(function (s) { Object.keys(s.fast).forEach(function (n) { tf[n] = (tf[n] || 0) + s.fast[n]; }); Object.keys(s.hw).forEach(function (n) { th[n] = (th[n] || 0) + s.hw[n]; }); });
		return { u: u, sc: sc, X: X, info: info, E: E, bb: ubb, steps: steps, byId: byId, allI: allI, own: u.items, fast: tf, hw: th, anyFast: anyFast, art: art, lie: lie,
				 size: [Math.round(E.x[1] - E.x[0]), Math.round(E.y[1] - E.y[0]), Math.round(E.z[1] - E.z[0])] };
	}
	/* Размеры шага (1.20): полки — от дна (верх дна → низ полки), перегородки — от левого бока, у первого шага — габарит.
	   [{ i, t: текст, v: мм }] */
	A.stepDims = function (d, s) {
		var X = d.X, out = [], seen = {};
		function hz(i) { var n = d.info[i].it.n || [0, 0, 1]; return Math.abs(dot(n, X.up)) > 0.7; }
		function vt(i) { var n = d.info[i].it.n || [0, 0, 1]; return Math.abs(dot(n, X.rt)) > 0.7; }
		var body = d.own.filter(function (i) { return !d.info[i].far && (d.info[i].step === 'body' || d.info[i].step === 'side2'); });
		var bot = body.filter(hz).sort(function (a, b) { return extAx(d.info[a].c, X.up)[0] - extAx(d.info[b].c, X.up)[0]; })[0];
		var left = body.filter(vt).sort(function (a, b) { return extAx(d.info[a].c, X.rt)[0] - extAx(d.info[b].c, X.rt)[0]; })[0];
		if (s.id === 'body') out.push({ i: -1, t: 'Корпус: ' + d.size.join(' × ') + ' мм (Ш × В × Г)', v: 0 });
		if (s.kind !== 'parts' || s.id === 'fac') return out;
		s.items.forEach(function (i) {
			var q = d.info[i]; if (q.far || i === bot || i === left) return;
			var v, t;
			if (bot !== undefined && hz(i)) { v = Math.round(extAx(q.c, X.up)[0] - extAx(d.info[bot].c, X.up)[1]); t = q.it.name + ' — ' + v + ' мм от дна'; }
			else if (left !== undefined && vt(i) && s.id !== 'side2') { v = Math.round(extAx(q.c, X.rt)[0] - extAx(d.info[left].c, X.rt)[1]); t = q.it.name + ' — ' + v + ' мм от левого бока'; }
			if (t && v > 0 && !seen[t]) { seen[t] = 1; out.push({ i: i, t: t, v: v }); }
		});
		return out.sort(function (a, b) { return (a.i < 0 ? -1 : 0) - (b.i < 0 ? -1 : 0) || a.v - b.v; });
	};
	/* Крепёж единицы целиком, вместе с её узлами: { имя: количество }, отдельно крепёж и фурнитура */
	function totals(st, u) {
		var d = A.data(st, u), f = {}, h = {};
		function put(m, src) { Object.keys(src).forEach(function (n) { m[n] = (m[n] || 0) + src[n]; }); }
		put(f, d.fast); put(h, d.hw);
		u.subs.forEach(function (s) { var su = unitBy(st, s.key); if (su) { var t = totals(st, su); put(f, t.fast); put(h, t.hw); } });
		return { fast: f, hw: h };
	}
	A.totals = totals;

	/* ----------------------------- документ: листы ----------------------------- */
	function sigOf(st, u) {
		var sc = scene(st), gk = function (i) { var it = sc.items[i]; return it.name + '|' + Math.round(it.L) + '|' + Math.round(it.W) + '|' + it.th + '@' + (it.pos || ''); };
		return u.name + '#' + u.items.map(gk).sort().join(',') + '#' + u.subs.map(function (s) { return s.items.map(gk).sort().join(','); }).sort().join(';');
	}
	function marksText(ms) {
		if (ms.length < 3) return ms.join(', ');
		var nums = ms.map(function (m) { return Number(m.slice(1)); }), seq = nums.every(function (v, k) { return !k || v === nums[k - 1] + 1; });
		return seq ? ms[0] + '–' + ms[ms.length - 1] : ms.join(', ');
	}
	A.plan = function (st) {
		var ver = JSON.stringify((st.work && st.work.asm) || {});
		if (st._asmPlan && st._asmPlan.doc === st.doc && st._asmPlan.ver === ver) return st._asmPlan.p;
		var sc = scene(st), list = A.units(st), X = sc ? axes(sc) : null;
		var tops = list.filter(function (u) { return !u.parent; });
		var cx = function (u) { var its = u.items.concat([].concat.apply([], u.subs.map(function (s) { return s.items; }))); return its.reduce(function (a, i) { return a + dot(sc.items[i].c, X.rt); }, 0) / Math.max(1, its.length); };
		if (sc && A.by(st) !== 'au') tops.sort(function (a, b) { return cx(a) - cx(b); });
		var mark = {}; tops.forEach(function (u, k) { mark[u.key] = 'М' + (k + 1); });
		var groups = [], gBy = {};
		tops.forEach(function (u) { var s = sigOf(st, u); if (!gBy[s]) { gBy[s] = { key: u.key, units: [], name: u.name }; groups.push(gBy[s]); } gBy[s].units.push(u); });
		groups.forEach(function (g) { g.marks = g.units.map(function (u) { return mark[u.key]; }); g.mtext = marksText(g.marks); });
		var sheets = [];
		function push(s) { s.n = sheets.length + 1; sheets.push(s); }
		if (!sc || !tops.length) return (st._asmPlan = { doc: st.doc, ver: ver, p: { sheets: [], groups: [], mark: mark, tops: tops } }).p;
		push({ key: 'over', kind: 'over', title: 'Общий вид' });
		var subSheet = {};
		groups.forEach(function (g) {
			var u = g.units[0], d = A.data(st, u), per = 6, parts = Math.ceil(d.steps.length / per);
			for (var k = 0; k < parts; k++) push({ key: 'st:' + u.key + ':' + k, kind: 'steps', unit: u, g: g, cnt: g.units.length, from: k * per, to: Math.min(d.steps.length, (k + 1) * per), part: k, parts: parts, title: u.name + (g.units.length > 1 ? ' × ' + g.units.length : '') + ' · шаги' + (parts > 1 ? ' ' + (k + 1) + '/' + parts : '') });
			(function subs(uu, mult) {
				var seen = {};
				uu.subs.forEach(function (s) {
					var su = unitBy(st, s.key); if (!su) return;
					var sg = sigOf(st, su); if (seen[sg]) { seen[sg].cnt += mult; return; }
					var ds = A.data(st, su), sp = Math.ceil(ds.steps.length / per);
					for (var q = 0; q < sp; q++) {
						var sh = { key: 'st:' + su.key + ':' + q, kind: 'steps', unit: su, g: g, sub: 1, cnt: mult, from: q * per, to: Math.min(ds.steps.length, (q + 1) * per), part: q, parts: sp, title: su.name + ' · шаги' + (sp > 1 ? ' ' + (q + 1) + '/' + sp : '') };
						if (!q) { seen[sg] = sh; subSheet[s.key] = sheets.length + 1; }
						push(sh);
					}
					subs(su, mult);
				});
			})(u, g.units.length);
			/* узлы в сборе у других единиц группы — те же листы */
		});
		var loose = A.loose(st);
		if (tops.length > 1 || loose.length) push({ key: 'mount', kind: 'mount', title: 'Монтаж' });
		groups.forEach(function (g) { push({ key: 'ex:' + g.key, kind: 'expl', unit: g.units[0], g: g, cnt: g.units.length, title: g.units[0].name + ' · разнесённый вид' }); });
		push({ key: 'spec', kind: 'spec', title: 'Спецификация' });
		sheets.forEach(function (s) { if (s.kind === 'steps' && s.cnt > 1 && s.sub) s.title = s.unit.name + ' × ' + s.cnt + ' · шаги' + (s.parts > 1 ? ' ' + (s.part + 1) + '/' + s.parts : ''); });
		var p = { sheets: sheets, groups: groups, mark: mark, tops: tops, subSheet: subSheet };
		st._asmPlan = { doc: st.doc, ver: ver, p: p };
		return p;
	};
	A.sheets = function (st) { return A.plan(st).sheets; };

	/* ----------------------------- лист: шаги ----------------------------- */
	var LEG = 'Жёлтым — что ставим на этом шаге, серым — уже собрано, оранжевым — фурнитура. Красная точка — место крепежа. Номер в кружке — позиция детали (как на этикетке).';
	function noteOf(s, d, plan) {
		if (s.kind === 'hw') return 'Установить: ' + Object.keys(s.hw).map(shortName).slice(0, 3).join(', ') + (Object.keys(s.hw).length > 3 ? ' и др.' : '') + '.';
		if (s.kind === 'sub') { var n = plan.subSheet[s.subs[0].key]; return 'Собрать «' + s.subs[0].name + '»' + (n ? ' (лист ' + n + ')' : '') + ' и поставить на место' + (/ящ/i.test(s.subs[0].name) ? ' — на направляющие до щелчка.' : '.'); }
		if (s.id === 'body') return s.lie ? 'Положить левый бок на пол лицевой кромкой к себе, поставить детали по номерам, крепёж — в места, отмеченные красным.' : 'Собрать корпус: детали по номерам, крепёж — в места, отмеченные красным.';
		if (s.id === 'inner') return s.lie ? 'Корпус лежит: поставить полки и перегородки, закрепить отмеченным крепежом.' : 'Поставить полки и перегородки, закрепить отмеченным крепежом.';
		if (s.id === 'side2') return 'Надеть правый бок сверху, закрепить крепёж (эксцентрики — повернуть до упора).';
		if (s.id === 'back') return s.stand ? 'Поставить корпус на ноги, выровнять диагонали, закрепить заднюю стенку' + (/царг/i.test(s.title) ? ' и царги.' : '.') : 'Поставить заднюю стенку и царги.';
		if (s.id === 'fac') return 'Навесить фасады, выставить зазоры.';
		return '';
	}
	A.note = function (st, d, s) { return noteOf(s, d, A.plan(st)); };
	A.hwTitle = hwTitle; A.isHw = function (n) { return RE_HW.test(String(n || '')); }; A.shortName = shortName;
	/* значок крепежа и фурнитуры (1.20): маленькая картинка узла по названию, SVG 30 × 20 */
	var ICON = [
		[/шток/i, '<rect x="2" y="8" width="18" height="4" fill="#8a9298"/><path d="M20 7h8v6h-8" fill="#b9c0c5" stroke="#555" stroke-width="0.8"/><path d="M4 8l1.5 4M7 8l1.5 4M10 8l1.5 4M13 8l1.5 4" stroke="#5b6267" stroke-width="0.8"/>'],
		[/эксцентрик|стяжк/i, '<circle cx="9" cy="10" r="7" fill="#d5dade" stroke="#444" stroke-width="1"/><path d="M5 10h8M9 6v8" stroke="#444" stroke-width="1.2"/><rect x="16" y="8.5" width="13" height="3" fill="#8a9298"/>'],
		[/конфирмат|евровинт 7|евровинт с|саморез|винт/i, '<path d="M2 6h4v8H2z" fill="#6f777c"/><rect x="6" y="8" width="22" height="4" fill="#a9b0b5"/><path d="M9 8l1.6 4M12.5 8l1.6 4M16 8l1.6 4M19.5 8l1.6 4M23 8l1.6 4" stroke="#62696e" stroke-width="0.8"/>'],
		[/шкант|шкан/i, '<rect x="3" y="7" width="24" height="6" rx="3" fill="#d9b98a" stroke="#8a6a3a" stroke-width="0.8"/><path d="M8 7v6M13 7v6M18 7v6M23 7v6" stroke="#b39060" stroke-width="0.6"/>'],
		[/полкодерж/i, '<rect x="2" y="8" width="11" height="4" fill="#9aa1a6"/><path d="M13 5h12v4H17v6h-4z" fill="#cfd4d8" stroke="#555" stroke-width="0.8"/>'],
		[/петл/i, '<circle cx="8" cy="10" r="6.5" fill="#d5dade" stroke="#444" stroke-width="1"/><rect x="13" y="7" width="15" height="6" rx="2" fill="#b9c0c5" stroke="#555" stroke-width="0.8"/>'],
		[/направляющ|movento|tandem|legrabox/i, '<rect x="1" y="5" width="28" height="4" fill="#cfd4d8" stroke="#555" stroke-width="0.7"/><rect x="1" y="10" width="28" height="4" fill="#7d858a"/><path d="M22 16l3-2.5 3 2.5" fill="none" stroke="#c0392b" stroke-width="1"/>'],
		[/подвеск|camar|кронштейн/i, '<rect x="3" y="2" width="6" height="16" fill="#cfd4d8" stroke="#555" stroke-width="0.7"/><path d="M9 6h9v7h-4v-3H9z" fill="#5b6267"/><path d="M20 4h8" stroke="#888" stroke-dasharray="2 1"/>'],
		[/ручк/i, '<path d="M3 13V8h24v5" fill="none" stroke="#5b6267" stroke-width="2.4" stroke-linejoin="round"/>'],
		[/опор|ножк/i, '<rect x="9" y="2" width="12" height="5" fill="#9aa1a6"/><rect x="13" y="7" width="4" height="8" fill="#6f777c"/><rect x="8" y="15" width="14" height="3" rx="1" fill="#4a5055"/>']
	];
	A.fastIcon = function (name) {
		for (var k = 0; k < ICON.length; k++) if (ICON[k][0].test(name)) return '<svg width="30" height="20" viewBox="0 0 30 20">' + ICON[k][1] + '</svg>';
		return '<svg width="30" height="20" viewBox="0 0 30 20"><rect x="6" y="5" width="18" height="10" rx="2" fill="#cfd4d8" stroke="#555" stroke-width="0.8"/></svg>';
	};
	/* Картинка шага маленькой SVG (плёнка шагов в окне): то же, что рисунок на листе, без надписей */
	A.thumb = function (st, u, si) {
		var d = A.data(st, u), s = d.steps[si], list = [], pos = function (id) { for (var k = 0; k < d.steps.length; k++) if (d.steps[k].id === id) return k; return 99; };
		d.allI.forEach(function (i) { var q = d.info[i], k = pos(q.step); if (k > si || q.far) return; list.push({ c: q.c, kind: k === si ? 'new' : (s.kind === 'hw' ? 'ghost' : 'done') }); });
		d.steps.forEach(function (t, k) { if (k > si) return; t.boxes.forEach(function (c) { list.push({ c: c, kind: k === si ? 'hwnew' : 'hw' }); }); });
		var I = iso(View(d.sc), d.sc, list), T = fit(I.bb, 2, 2, 116, 56);
		return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 60" width="120" height="60">' + drawPolys(I, T, 0.5) + '</svg>';
	};
	function stepCell(st, d, plan, si, x0, y0, w, h, boxes, pic) {
		var s = d.steps[si], g = [], u = d.u, narrow = w < 100;
		g.push('<rect x="' + f2(x0) + '" y="' + f2(y0) + '" width="' + f2(w) + '" height="' + f2(h) + '" rx="2" fill="#fbfbfc" stroke="#d5dbe0" stroke-width="0.3"/>');
		g.push(balloon(x0 + 6, y0 + 6.5, s.n, 3.4, 1) + txt(x0 + 11.5, y0 + 7.9, clip(s.title, 3.8, w - 15, true), { fs: 3.8, b: 1 }));
		boxes.push({ x: x0 + 2.6, y: y0 + 3, w: Math.min(w - 4, 9 + tw(s.title, 1) * 3.8), h: 5.4, kind: 'txt', text: s.title });
		/* рисунок: всё, что стоит к этому шагу */
		var list = [], pos = function (id) { for (var k = 0; k < d.steps.length; k++) if (d.steps[k].id === id) return k; return 99; };
		var hwOnly = s.kind === 'hw';
		d.allI.forEach(function (i) { var q = d.info[i], k = pos(q.step); if (k > si || q.far) return; list.push({ c: q.c, kind: k === si ? 'new' : (hwOnly ? 'ghost' : 'done'), i: i }); });
		d.steps.forEach(function (t, k) { if (k > si) return; t.boxes.forEach(function (c) { list.push({ c: c, kind: k === si ? 'hwnew' : 'hw' }); }); });
		var V = View(d.sc), I = iso(V, d.sc, list), picW = w * (narrow ? 0.44 : 0.52), noteL = wrap(pic ? noteOf(s, d, plan).replace('красным', 'оранжевым') : noteOf(s, d, plan), 2.45, w - 8), warnL = s.warn ? wrap('⚠ ' + s.warn, 2.45, w - 8, true) : [];
		var noteH = (noteL.length + warnL.length) * 3.4 + 5;
		var T = fit(I.bb, x0 + 3, y0 + 12, picW, h - 14 - noteH), PR = function (p) { return T(V.pr(p)); };
		var PI = pic ? A.picPlace(pic, x0 + 3, y0 + 12, picW, h - 14 - noteH) : null;
		if (PI) { g.push(PI.svg); PR = PI.at; } else g.push(drawPolys(I, T, 0.16));
		/* что нового: детали (по разновидностям), крепёж, фурнитура */
		var lx = x0 + picW + 6, ly = y0 + 15, lim = y0 + h - noteH - 1.5, rows = [], seen = {}, rowsI = {};
		if (s.kind === 'sub') {
			var su = s.subs[0], f = list.filter(function (b) { return b.kind === 'new'; }).sort(function (a, b) { return d.sc.items[b.i].facade - d.sc.items[a.i].facade; })[0];
			if (f) { var c = PR(center(f.c)); g.push(line(c[0], c[1], lx - 1, ly, 0.18) + '<circle cx="' + f2(c[0]) + '" cy="' + f2(c[1]) + '" r="0.55" fill="' + INK + '"/>'); }
			g.push(txt(lx, ly + 0.9, clip(su.name + ' в сборе', 2.6, x0 + w - 3 - lx, true), { fs: 2.6, b: 1 }) + txt(lx, ly + 4.6, 'деталей ' + su.items.length + (plan.subSheet[su.key] ? ', лист ' + plan.subSheet[su.key] : ''), { fs: 2.2, c: MUTE }));
			ly += 10;
		} else s.items.forEach(function (i) { var it = d.sc.items[i], k = rowKey(it); (rowsI[k] = rowsI[k] || []).push(i); if (seen[k]) { seen[k].n++; return; } seen[k] = { it: it, i: i, k: k, n: 1 }; rows.push(seen[k]); });
		rows.sort(function (a, b) { return P.natCmp(String(a.it.pos || '~'), String(b.it.pos || '~')); });
		var fastN = Object.keys(s.fast), hwN = Object.keys(s.hw);
		var lineH = narrow ? 7 : 5.2, need = rows.length * lineH + (rows.length ? 1.5 : 0) + (fastN.length + hwN.length) * 4.3;
		if (ly + need > lim) lineH = 4.4;
		var room = Math.floor((lim - ly - (fastN.length + hwN.length) * 4.3 - 1.5) / lineH);
		rows.forEach(function (r, k) {
			if (k >= room && rows.length > room) { if (k === room) { g.push(txt(lx + 3.4, ly + 0.9, '… ещё ' + (rows.length - room) + ' поз.', { fs: 2.3, c: MUTE })); ly += lineH; } return; }
			var lab = r.it.pos || '*', fi = rowsI[r.k].filter(function (i) { return !d.info[i].far; })[0], c = fi !== undefined ? PR(center(d.info[fi].c)) : null;
			g.push('<g class="asmP" data-u="' + esc(u.key) + '" data-r="' + esc(r.k) + '" style="cursor:pointer">' + (c ? line(c[0], c[1], lx - 2.4, ly, 0.18) + '<circle cx="' + f2(c[0]) + '" cy="' + f2(c[1]) + '" r="0.55" fill="' + INK + '"/>' : '') + balloon(lx, ly, lab, 2.2));
			var nm = r.it.name + (r.n > 1 ? ' × ' + r.n : ''), sz = Math.round(r.it.L) + '×' + Math.round(r.it.W);
			if (lineH >= 7) g.push(txt(lx + 3.4, ly + 0.1, clip(nm, 2.4, x0 + w - 4 - lx - 3.4), { fs: 2.4 }) + txt(lx + 3.4, ly + 3.1, sz, { fs: 2.1, c: MUTE }));
			else { var sw = tw(sz) * 2.1 + 2; g.push(txt(lx + 3.4, ly + 0.9, clip(nm, 2.4, x0 + w - 4 - lx - 3.4 - sw), { fs: 2.4 }) + txt(x0 + w - 3, ly + 0.9, sz, { fs: 2.1, a: 'end', c: MUTE })); }
			g.push('<rect x="' + f2(lx - 2.4) + '" y="' + f2(ly - 2.6) + '" width="' + f2(x0 + w - 3 - lx + 2.4) + '" height="' + f2(Math.min(lineH, 6.4)) + '" fill="transparent"/></g>');
			ly += lineH;
		});
		if (rows.length) ly += 1.5;
		if (!PI) s.dots.forEach(function (p) { var c = PR(p); g.push('<circle cx="' + f2(c[0]) + '" cy="' + f2(c[1]) + '" r="0.75" fill="' + RED + '" stroke="#fff" stroke-width="0.18"/>'); });
		function cnt(name, n, color) {
			if (ly > lim + 0.5) return;
			var nt = '× ' + n, nw = tw(nt, 1) * 2.8 + 2, aw = x0 + w - 3 - lx - 3.4 - nw, nm = shortName(name), two = tw(nm) * 2.4 > aw && ly + 7.3 <= lim + 0.5, L2 = two ? wrap(nm, 2.4, aw) : [nm];
			g.push((color !== HWC ? '<circle cx="' + f2(lx) + '" cy="' + f2(ly - 0.8) + '" r="1" fill="' + color + '"/>' : '<rect x="' + f2(lx - 1.1) + '" y="' + f2(ly - 2.2) + '" width="2.2" height="2.4" fill="' + HWC + '"/>') +
				txt(lx + 3.4, ly, clip(L2[0], 2.4, aw), { fs: 2.4 }) + (two && L2[1] ? txt(lx + 3.4, ly + 3, clip(L2.slice(1).join(' '), 2.4, aw), { fs: 2.4 }) : '') + txt(x0 + w - 3, ly, nt, { fs: 2.8, b: 1, a: 'end' }));
			ly += two && L2[1] ? 7.3 : 4.3;
		}
		fastN.forEach(function (n) { cnt(n, s.fast[n], PI ? '#e07b00' : RED); });          // на снимке крепёж шага — оранжевый
		hwN.forEach(function (n) { cnt(n, s.hw[n], HWC); });
		/* что делать */
		var ny = y0 + h - 3.2 - (noteL.length + warnL.length - 1) * 3.4;
		g.push(line(x0 + 3, ny - 4.2, x0 + w - 3, ny - 4.2, 0.3, '#e3e6e9'));
		noteL.forEach(function (l, k) { g.push(txt(x0 + 4, ny + k * 3.4, l, { fs: 2.45, c: '#3a444d' })); });
		warnL.forEach(function (l, k) { g.push(txt(x0 + 4, ny + (noteL.length + k) * 3.4, l, { fs: 2.45, c: WARN, b: 1 })); });
		return g.join('');
	}
	/* «Приготовить»: все детали и крепёж единицы — в свободной клетке листа */
	function prepCell(st, d, x0, y0, w, h, cnt) {
		var lim0, g = [], sc = d.sc, rows = [], seen = {};
		g.push('<rect x="' + f2(x0) + '" y="' + f2(y0) + '" width="' + f2(w) + '" height="' + f2(h) + '" rx="2" fill="#fff" stroke="' + INK + '" stroke-width="0.3"/>');
		g.push(txt(x0 + 4, y0 + 7, cnt > 1 ? 'Приготовить на один' : 'Приготовить', { fs: 3.2, b: 1 }));
		d.own.forEach(function (i) { var it = sc.items[i], k = rowKey(it); if (seen[k]) { seen[k].n++; return; } seen[k] = { it: it, n: 1 }; rows.push(seen[k]); });
		rows.sort(function (a, b) { return P.natCmp(String(a.it.pos || '~'), String(b.it.pos || '~')); });
		var y = y0 + 12.5, lim = y0 + h - 3, items = rows.map(function (r) { return ['p', r]; });
		d.u.subs.forEach(function (s) { items.push(['s', s]); });
		Object.keys(d.hw).forEach(function (n) { items.push(['h', n, d.hw[n]]); });
		Object.keys(d.fast).forEach(function (n) { items.push(['f', n, d.fast[n]]); });
		var diff = grpDiff(st, d.u), dl = diff.length ? wrap('⚠ Отличия: ' + diff.join('; ') + '.', 2.3, w - 8, true) : [];
		lim -= dl.length * 3.3 + (dl.length ? 2 : 0);
		dl.forEach(function (l, k) { g.push(txt(x0 + 4, lim + 3.3 + k * 3.3, l, { fs: 2.3, c: WARN, b: 1 })); });
		var room = Math.floor((lim - y) / 4.4);
		items.forEach(function (r, k) {
			if (k >= room && items.length > room) { if (k === room) g.push(txt(x0 + 9.5, y, '… ещё ' + (items.length - room), { fs: 2.3, c: MUTE })); return; }
			if (r[0] === 'p') { var sz = Math.round(r[1].it.L) + '×' + Math.round(r[1].it.W) + '×' + f2(r[1].it.th); g.push(balloon(x0 + 6, y - 0.8, r[1].it.pos || '*', 2) + txt(x0 + 9.5, y, clip(r[1].it.name + (r[1].n > 1 ? ' × ' + r[1].n : ''), 2.4, w - 15 - tw(sz) * 2.3), { fs: 2.4 }) + txt(x0 + w - 4, y, sz, { fs: 2.3, a: 'end', c: MUTE })); }
			else if (r[0] === 's') g.push(txt(x0 + 9.5, y, clip(r[1].name + ' в сборе', 2.4, w - 20), { fs: 2.4 }) + txt(x0 + w - 4, y, '× 1', { fs: 2.8, b: 1, a: 'end' }));
			else g.push((r[0] === 'h' ? '<rect x="' + f2(x0 + 4.9) + '" y="' + f2(y - 2.2) + '" width="2.2" height="2.4" fill="' + HWC + '"/>' : '<circle cx="' + f2(x0 + 6) + '" cy="' + f2(y - 0.8) + '" r="1" fill="' + RED + '"/>') + txt(x0 + 9.5, y, clip(shortName(r[1]), 2.4, w - 22), { fs: 2.4 }) + txt(x0 + w - 4, y, '× ' + r[2], { fs: 2.8, b: 1, a: 'end' }));
			y += 4.4;
		});
		return g.join('');
	}
	/* Отличия одинаковых модулей группы по фурнитуре и крепежу: ['Camar левая: М1 — 1, М2 — 0', …] */
	function grpDiff(st, u) {
		var plan = st._asmPlan && st._asmPlan.p, gp = plan && plan.groups.filter(function (g) { return g.units[0] === u; })[0];
		if (!gp || gp.units.length < 2) return [];
		var T = gp.units.map(function (x) { var t = totals(st, x), m = {}; [t.fast, t.hw].forEach(function (o) { Object.keys(o).forEach(function (n) { m[n] = (m[n] || 0) + o[n]; }); }); return m; }), names = {};
		T.forEach(function (m) { Object.keys(m).forEach(function (n) { names[n] = 1; }); });
		return Object.keys(names).filter(function (n) { return T.some(function (m) { return (m[n] || 0) !== (T[0][n] || 0); }); }).map(function (n) { return shortName(n) + ': ' + gp.units.map(function (x, k) { return plan.mark[x.key] + ' — ' + (T[k][n] || 0); }).join(', '); });
	}
	A.grpDiff = grpDiff;
	function stepsSheet(st, sh, plan, W, H, boxes) {
		var d = A.data(st, sh.unit), n = sh.to - sh.from, g = [];
		var cols = n <= 3 ? 2 : 3, rowsN = n <= 2 ? 1 : 2, gap = 3, legH = 7;          // 4–5 шагов — 3 × 2, свободная клетка — «Приготовить»
		if (n <= 2) { cols = 2; rowsN = 1; }
		var cw = (W - gap * (cols - 1)) / cols, ch = (H - legH - gap * (rowsN - 1)) / rowsN;
		for (var k = 0; k < cols * rowsN; k++) {
			var x0 = (k % cols) * (cw + gap), y0 = Math.floor(k / cols) * (ch + gap);
			if (k < n) g.push(stepCell(st, d, plan, sh.from + k, x0, y0, cw, ch, boxes));
			else if (k === n && sh.part === 0) g.push(prepCell(st, d, x0, y0, cw, ch, sh.cnt));
		}
		var leg = wrap(LEG, 2.3, W);
		leg.forEach(function (l, k) { g.push(txt(0, H - legH + 3.6 + k * 3, l, { fs: 2.3, c: MUTE })); });
		return g.join('');
	}

	/* ----------------------------- лист: разнесённый вид ----------------------------- */
	var NODES = [
		[/эксцентрик|стяжк.*эксц/i, 'Эксцентрик + шток', function (x, y) { return '<rect x="' + f2(x - 11) + '" y="' + f2(y + 4) + '" width="20" height="6.5" fill="#e7edf0" stroke="' + INK + '" stroke-width="0.3"/><rect x="' + f2(x - 3) + '" y="' + f2(y - 11) + '" width="6.5" height="15" fill="#e7edf0" stroke="' + INK + '" stroke-width="0.3"/><circle cx="' + f2(x + 0.2) + '" cy="' + f2(y + 0.5) + '" r="3.1" fill="#cfd6db" stroke="' + INK + '" stroke-width="0.3"/><line x1="' + f2(x - 1.6) + '" y1="' + f2(y + 0.5) + '" x2="' + f2(x + 2) + '" y2="' + f2(y + 0.5) + '" stroke="' + INK + '" stroke-width="0.5"/><line x1="' + f2(x + 0.2) + '" y1="' + f2(y + 0.5) + '" x2="' + f2(x - 9) + '" y2="' + f2(y + 7.5) + '" stroke="' + RED + '" stroke-width="0.7"/>'; }],
		[/подвеск|camar/i, 'Подвеска', function (x, y) { return '<rect x="' + f2(x - 9) + '" y="' + f2(y - 11) + '" width="6" height="22" fill="#e7edf0" stroke="' + INK + '" stroke-width="0.3"/><path d="M' + f2(x - 3) + ' ' + f2(y - 7) + ' h6 v8 h-3 v-3 h-3 z" fill="#4a5560"/><line x1="' + f2(x + 3) + '" y1="' + f2(y - 9) + '" x2="' + f2(x + 12) + '" y2="' + f2(y - 9) + '" stroke="' + MUTE + '" stroke-width="0.6" stroke-dasharray="1 0.6"/>' + txt(x + 3, y + 7, 'стена', { fs: 2.1, c: '#3a444d' }); }],
		[/направляющ|movento|tandem/i, 'Направляющая', function (x, y) { return '<rect x="' + f2(x - 12) + '" y="' + f2(y - 5) + '" width="24" height="3.6" fill="#4a5560"/><rect x="' + f2(x - 12) + '" y="' + f2(y - 8.6) + '" width="24" height="3.6" fill="#e7edf0" stroke="' + INK + '" stroke-width="0.3"/><path d="M' + f2(x + 7) + ' ' + f2(y + 4) + ' l3 -3 l3 3" fill="none" stroke="' + RED + '" stroke-width="0.5"/>' + txt(x - 11, y + 6, 'до щелчка', { fs: 2.1, c: '#3a444d' }); }],
		[/конфирмат|евровинт 7/i, 'Конфирмат', function (x, y) { return '<rect x="' + f2(x - 11) + '" y="' + f2(y - 2) + '" width="22" height="6.5" fill="#e7edf0" stroke="' + INK + '" stroke-width="0.3"/><rect x="' + f2(x - 3.2) + '" y="' + f2(y - 11) + '" width="6.5" height="9" fill="#e7edf0" stroke="' + INK + '" stroke-width="0.3"/><line x1="' + f2(x) + '" y1="' + f2(y + 6) + '" x2="' + f2(x) + '" y2="' + f2(y - 9) + '" stroke="' + RED + '" stroke-width="1"/>'; }],
		[/петл/i, 'Петля', function (x, y) { return '<rect x="' + f2(x - 10) + '" y="' + f2(y - 10) + '" width="5" height="20" fill="#e7edf0" stroke="' + INK + '" stroke-width="0.3"/><rect x="' + f2(x - 3) + '" y="' + f2(y - 10) + '" width="4" height="20" fill="#e7edf0" stroke="' + INK + '" stroke-width="0.3"/><path d="M' + f2(x - 5) + ' ' + f2(y - 3) + ' h7 v6 h-7" fill="#4a5560"/><circle cx="' + f2(x + 2) + '" cy="' + f2(y) + '" r="3" fill="none" stroke="' + INK + '" stroke-width="0.3"/>'; }]
	];
	function explSheet(st, sh, plan, W, H, boxes) {
		var u = sh.unit, d = A.data(st, u), sc = d.sc, X = d.X, g = [];
		var uc = [(d.E.x[0] + d.E.x[1]) / 2, (d.E.y[0] + d.E.y[1]) / 2, (d.E.z[0] + d.E.z[1]) / 2], Dz = d.E.z[1] - d.E.z[0], Dy = d.E.y[1] - d.E.y[0];
		function axc(p) { return [dot(p, X.rt), dot(p, X.up), dot(p, X.fr)]; }
		function world(v) { return add(add(X.rt.map(function (q) { return q * v[0]; }), X.up, v[1]), X.fr, v[2]); }
		var subC = {};
		u.subs.forEach(function (s) { var pts = [].concat.apply([], s.items.map(function (i) { return d.info[i].c; })); subC[s.key] = axc(center([aabb(pts).lo, aabb(pts).hi])); });
		var offI = {};
		function offOf(i) {
			var q = d.info[i], c = axc(center(q.c)), sub = q.step && q.step.indexOf('sub:') === 0 ? q.step.slice(4) : '';
			if (sub && subC[sub]) { var s0 = subC[sub]; return world([(s0[0] - uc[0]) * 0.55 + (c[0] - s0[0]) * 0.45, (s0[1] - uc[1]) * 0.6 - Dy * 0.55 + (c[1] - s0[1]) * 0.9, Dz * 1.6 + (c[2] - s0[2]) * 0.7]); }
			return world([(c[0] - uc[0]) * 0.55, (c[1] - uc[1]) * 0.6, (c[2] - uc[2]) * 0.55 + (q.step === 'fac' ? Dz * 0.8 : 0)]);
		}
		var list = d.allI.filter(function (i) { return !d.info[i].far; }).map(function (i) { offI[i] = offOf(i); return { c: shift(d.info[i].c, offI[i]), kind: 'part', i: i }; });
		d.steps.forEach(function (s) { s.boxes.forEach(function (c) { var cc = center(c), best = null, bd = Infinity; d.own.forEach(function (i) { if (d.info[i].far) return; var dd = boxDist(d.info[i].bb, cc); if (dd < bd) { bd = dd; best = i; } }); list.push({ c: shift(c, best !== null ? offI[best] : [0, 0, 0]), kind: 'hw' }); }); });
		var V = View(sc), I = iso(V, sc, list), pw = W * 0.6, T = fit(I.bb, 14, 8, pw - 28, H - 16);
		g.push(drawPolys(I, T, 0.18));
		/* выноски: кружки по эллипсу вокруг рисунка, без пересечений */
		var items = [], seen = {};
		list.filter(function (b) { return b.i !== undefined; }).forEach(function (b) { var it = sc.items[b.i], lab = it.pos || '*'; if (seen[lab]) return; seen[lab] = 1; items.push({ n: lab, c: T(V.pr(center(b.c))) }); });
		var cx = pw / 2, cy = H / 2, rx = pw / 2 - 5, ry = H / 2 - 5;
		items.forEach(function (it) { it.a = Math.atan2(it.c[1] - cy, it.c[0] - cx); });
		items.sort(function (a, b) { return a.a - b.a; });
		var slots = items.map(function (it, k) { var a = -Math.PI + (k + 0.5) * 2 * Math.PI / items.length; return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]; });
		var off = 0, bestS = Infinity;
		function crossN(o) {
			var L = items.map(function (it, k) { var s = slots[(k + o) % slots.length]; return [it.c[0], it.c[1], s[0], s[1]]; }), n = 0;
			function oo(p, q, r) { var v = (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]); return v > 1e-9 ? 1 : (v < -1e-9 ? -1 : 0); }
			for (var i = 0; i < L.length; i++) for (var j = i + 1; j < L.length; j++) { var a = L[i], b = L[j]; if (oo([a[0], a[1]], [a[2], a[3]], [b[0], b[1]]) * oo([a[0], a[1]], [a[2], a[3]], [b[2], b[3]]) < 0 && oo([b[0], b[1]], [b[2], b[3]], [a[0], a[1]]) * oo([b[0], b[1]], [b[2], b[3]], [a[2], a[3]]) < 0) n++; }
			return n;
		}
		for (var o = 0; o < slots.length; o++) { var cN = crossN(o); if (cN < bestS) { bestS = cN; off = o; } }
		items.forEach(function (it, k) {
			var s = slots[(k + off) % slots.length], r = String(it.n).length > 2 ? 3.6 : 3;
			g.push(line(it.c[0], it.c[1], s[0], s[1], 0.2) + '<circle cx="' + f2(it.c[0]) + '" cy="' + f2(it.c[1]) + '" r="0.55" fill="' + INK + '"/>' + balloon(s[0], s[1], it.n, r));
			boxes.push({ x: s[0] - r, y: s[1] - r, w: 2 * r, h: 2 * r, kind: 'num', text: it.n });
		});
		/* узлы крупно */
		var tt = totals(st, u), names = Object.keys(tt.fast).concat(Object.keys(tt.hw)), nodes = NODES.filter(function (N) { return names.some(function (n) { return N[0].test(n); }); }).slice(0, 3);
		var tx = pw + 4, twd = W - tx, ny = 16;
		nodes.forEach(function (N, k) {
			var x = tx + twd * (k + 0.5) / 3, L = String.fromCharCode(65 + k);
			g.push('<circle cx="' + f2(x) + '" cy="' + f2(ny) + '" r="13" fill="#fff" stroke="' + INK + '" stroke-width="0.4"/>' + N[2](x, ny) + balloon(x + 10.5, ny - 10.5, L, 2.4, 1) + txt(x, ny + 17.5, N[1], { fs: 2.4, a: 'middle', b: 1 }));
		});
		/* таблица деталей (с узлами) и крепежа */
		var y = nodes.length ? 42 : 4, rows = [], by = {};
		d.allI.forEach(function (i) { var it = sc.items[i], k = rowKey(it); if (by[k]) { by[k].n++; return; } by[k] = { it: it, n: 1 }; rows.push(by[k]); });
		rows.sort(function (a, b) { return P.natCmp(String(a.it.pos || '~'), String(b.it.pos || '~')); });
		var fr = Object.keys(tt.fast).map(function (n) { return [n, tt.fast[n]]; }).concat(Object.keys(tt.hw).map(function (n) { return [n, tt.hw[n]]; }));
		var avail = H - y - 12, lh = 4.1;
		if ((rows.length + fr.length) * lh > avail) lh = Math.max(3.2, avail / (rows.length + fr.length));
		var fs = Math.min(2.4, lh * 0.62);
		g.push(txt(tx, y, 'Детали' + (sh.cnt > 1 ? ' (на 1 шт.)' : ''), { fs: 3.2, b: 1 })); y += 2; g.push(line(tx, y, W, y, 0.3)); y += lh;
		rows.forEach(function (r) {
			var sz = Math.round(r.it.L) + '×' + Math.round(r.it.W) + '×' + f2(r.it.th);
			g.push(balloon(tx + 2.5, y - fs * 0.38, r.it.pos || '*', Math.min(1.9, lh * 0.46)) + txt(tx + 6, y, clip(r.it.name, fs, twd - 32), { fs: fs }) + txt(W - 6, y, sz, { fs: fs, a: 'end' }) + txt(W, y, String(r.n), { fs: fs, a: 'end' }));
			y += lh;
		});
		y += 2; g.push(txt(tx, y, 'Крепёж и фурнитура', { fs: 3.2, b: 1 })); y += 2; g.push(line(tx, y, W, y, 0.3)); y += lh;
		if (!fr.length) { g.push(txt(tx + 6, y, 'в модели нет', { fs: fs, c: MUTE })); }
		fr.forEach(function (f) { g.push(txt(tx + 6, y, clip(f[0], fs, twd - 14), { fs: fs }) + txt(W, y, String(f[1]), { fs: fs, a: 'end' })); y += lh; });
		boxes.push({ x: tx, y: nodes.length ? 40 : 1, w: twd, h: y - (nodes.length ? 40 : 1), kind: 'table', text: 'таблица' });
		return g.join('');
	}

	/* ----------------------------- общий вид, монтаж, спецификация ----------------------------- */
	function unitPts(st, u) { var sc = scene(st), far = sceneFar(st); return [].concat.apply([], u.items.concat([].concat.apply([], u.subs.map(function (s) { return s.items; }))).filter(function (i) { return !far[i]; }).map(function (i) { return corners(sc.items[i]); })); }
	function markTag(T, V, st, u, X, m, fs) {
		var pts = unitPts(st, u), ex = extAx(pts, X.rt), ey = extAx(pts, X.up), ez = extAx(pts, X.fr);
		var p = add(add(X.rt.map(function (q) { return q * (ex[0] + ex[1]) / 2; }), X.up, ey[0] + (ey[1] - ey[0]) * 0.3), X.fr, ez[1] + 10), c = T(V.pr(p)), w = tw(m, 1) * fs + 3;
		return '<rect x="' + f2(c[0] - w / 2) + '" y="' + f2(c[1] - fs * 0.85) + '" width="' + f2(w) + '" height="' + f2(fs * 1.5) + '" rx="1" fill="' + INK + '"/>' + txt(c[0], c[1] + fs * 0.35, m, { fs: fs, b: 1, a: 'middle', c: '#fff' });
	}
	function overSheet(st, plan, W, H, boxes) {
		var sc = scene(st), X = axes(sc), V = View(sc), g = [], list = [], loose = A.loose(st), far = sceneFar(st), ok = function (i) { return !far[i]; };
		plan.tops.forEach(function (u) { unitItems(u).filter(ok).forEach(function (i) { list.push({ c: corners(sc.items[i]), kind: 'part' }); }); });
		loose.filter(ok).forEach(function (i) { list.push({ c: corners(sc.items[i]), kind: 'new', top: 1 }); });
		var I = iso(V, sc, list), pw = W * 0.66, T = fit(I.bb, 4, 6, pw - 8, H - 22);
		g.push(drawPolys(I, T, 0.16));
		plan.tops.forEach(function (u) { g.push(markTag(T, V, st, u, X, plan.mark[u.key], 3)); });
		var all = [].concat.apply([], plan.tops.map(function (u) { return unitPts(st, u); })).concat([].concat.apply([], loose.filter(ok).map(function (i) { return corners(sc.items[i]); })));
		var sz = [extAx(all, X.rt), extAx(all, X.up), extAx(all, X.fr)].map(function (e) { return Math.round(e[1] - e[0]); });
		g.push(txt(pw / 2, H - 8, 'Габарит: ' + sz.join(' × ') + ' мм (ширина × высота × глубина)', { fs: 3, b: 1, a: 'middle' }));
		var x = pw + 4, y = 6, wd = W - x;
		g.push(txt(x, y, 'Состав', { fs: 3.6, b: 1 })); y += 2; g.push(line(x, y, W, y, 0.3)); y += 5;
		var rowsN = plan.groups.length + (loose.length ? 1 : 0), lh = Math.min(6, (H * 0.45) / Math.max(1, rowsN));
		plan.groups.forEach(function (gp) {
			var d = A.data(st, gp.units[0]), m = gp.mtext, mw = tw(m, 1) * 2.6 + 3;
			g.push('<rect x="' + f2(x) + '" y="' + f2(y - 3.6) + '" width="' + f2(mw) + '" height="5" rx="1" fill="' + INK + '"/>' + txt(x + mw / 2, y, m, { fs: 2.6, b: 1, a: 'middle', c: '#fff' }) + txt(x + mw + 2, y, clip(gp.name + (gp.units.length > 1 ? ' × ' + gp.units.length : '') + ' — ' + d.size[0] + ' мм', 2.5, wd - mw - 2), { fs: 2.5 }));
			y += lh;
		});
		if (loose.length) { g.push(txt(x, y, clip('Общие детали (' + loose.length + '): ' + namesList(sc, loose, 6), 2.5, wd), { fs: 2.5 })); y += lh; }
		y += 3; g.push(txt(x, y, 'Листы документа', { fs: 3.6, b: 1 })); y += 2; g.push(line(x, y, W, y, 0.3)); y += 5;
		var sl = plan.sheets.filter(function (s) { return s.kind !== 'over'; }), nc = sl.length > 16 ? 2 : 1, per = Math.ceil(sl.length / nc), lh2 = Math.min(4.6, (H - y - 2) / Math.max(1, per)), fs3 = Math.max(1.8, Math.min(2.5, lh2 * 0.62)), cwd = wd / nc;
		sl.forEach(function (s, k) { var cx0 = x + Math.floor(k / per) * cwd, yy = y + (k % per) * lh2, nw = tw(String(s.n), 1) * fs3 + 2.2; g.push(txt(cx0, yy, String(s.n), { fs: fs3, b: 1 }) + txt(cx0 + Math.max(nw, fs3 * 2.4), yy, clip(s.title, fs3, cwd - Math.max(nw, fs3 * 2.4) - 1.5), { fs: fs3 })); });
		return g.join('');
	}
	/* на общих рисунках нет деталей далеко от изделия: у модулей — далёкие от своего модуля, общие — дальше 600 мм от модулей */
	function sceneFar(st) {
		var sc = scene(st); if (st._asmFar && st._asmFar.sc === sc && st._asmFar.doc === st.doc) return st._asmFar.f;
		var f = {}, pts = [], plan = A.plan(st);
		plan.tops.forEach(function (u) {
			[u].concat(u.subs.map(function (s0) { return unitBy(st, s0.key); }).filter(Boolean)).forEach(function (x) { var d = A.data(st, x); d.allI.forEach(function (i) { if (d.info[i].far) f[i] = 1; else pts = pts.concat(d.info[i].c); }); });
		});
		var bb = pts.length ? aabb(pts) : null;
		A.loose(st).forEach(function (i) { if (!bb || boxDist({ lo: bb.lo.map(function (v) { return v - 600; }), hi: bb.hi.map(function (v) { return v + 600; }) }, sc.items[i].c) > 0) f[i] = 1; });
		st._asmFar = { sc: sc, doc: st.doc, f: f }; return f;
	}
	function namesList(sc, idx, n) { var a = idx.map(function (i) { return sc.items[i].name; }).filter(function (v, k, x) { return x.indexOf(v) === k; }); return a.slice(0, n).join(', ') + (a.length > n ? ' и ещё ' + (a.length - n) : ''); }
	function unitItems(u) { return u.items.concat([].concat.apply([], u.subs.map(function (s) { return s.items; }))); }
	function mountSheet(st, plan, W, H, boxes) {
		var sc = scene(st), X = axes(sc), V = View(sc), g = [], loose = A.loose(st), cells = [], far = sceneFar(st), ok = function (i) { return !far[i]; };
		cells.push({ t: 'Модули', n: 'Поставить (навесить) модули по порядку: ' + plan.tops.map(function (u) { return plan.mark[u.key]; }).join(', ') + '. Выставить по уровню, модули — вплотную.', loose: 0 });
		if (loose.length) cells.push({ t: 'Общие детали', n: 'Поставить общие детали (' + loose.length + '): ' + namesList(sc, loose, 10) + '.', loose: 1 });
		var model = st.doc.model || {}, B = blocks(st), hidOk = !!(st.set && st.set.est && st.set.est.hidden), lf = {};
		/* фурнитура общих блоков без отверстий (кронштейны на стену и т. п.) */
		var withHoles = {}; (model.holes || []).forEach(function (h) { if (h.bk >= 0) withHoles[h.bk] = 1; });
		(model.fast || []).concat(model.kits || []).forEach(function (f) {
			if (!(f.bk >= 0) || (f.hid && !hidOk)) return;
			var ch = chainOf(B, f.bk); if (!ch.length || unitBy(st, 'b' + ch[0])) return;
			if (withHoles[f.bk] && !(model.kits || []).some(function (k) { return k === f; })) return;
			lf[f.name] = (lf[f.name] || 0) + (f.n || 1);
		});
		var rh = (H - 3 * (cells.length - 1)) / cells.length;
		cells.forEach(function (cl, k) {
			var x0 = 0, y0 = k * (rh + 3), list = [];
			g.push('<rect x="0" y="' + f2(y0) + '" width="' + f2(W) + '" height="' + f2(rh) + '" rx="2" fill="#fbfbfc" stroke="#d5dbe0" stroke-width="0.3"/>' + balloon(6, y0 + 6.5, k + 1, 3.4, 1) + txt(11.5, y0 + 7.9, cl.t, { fs: 3.8, b: 1 }));
			plan.tops.forEach(function (u) { unitItems(u).filter(ok).forEach(function (i) { list.push({ c: corners(sc.items[i]), kind: cl.loose ? 'done' : 'new' }); }); });
			if (cl.loose) loose.filter(ok).forEach(function (i) { list.push({ c: corners(sc.items[i]), kind: 'new', top: 1 }); });
			var I = iso(V, sc, list), T = fit(I.bb, 6, y0 + 11, W * 0.62, rh - 14);
			g.push(drawPolys(I, T, 0.14));
			if (!cl.loose) plan.tops.forEach(function (u) { g.push(markTag(T, V, st, u, X, plan.mark[u.key], 2.6)); });
			var tx = W * 0.66, y = y0 + 9, wd = W - tx - 4;
			if (!cl.loose || cells.length === 1) Object.keys(lf).forEach(function (n) { g.push('<rect x="' + f2(tx) + '" y="' + f2(y - 2.2) + '" width="2.2" height="2.4" fill="' + HWC + '"/>' + txt(tx + 4, y, clip(shortName(n), 2.5, wd - 12), { fs: 2.5 }) + txt(W - 4, y, '× ' + lf[n], { fs: 2.9, b: 1, a: 'end' })); y += 4.6; });
			y += 2;
			wrap(cl.n, 2.5, wd).forEach(function (l) { g.push(txt(tx, y, l, { fs: 2.5, c: '#3a444d' })); y += 3.6; });
			if (cl.loose) { y += 1; wrap('⚠ Проверьте крепёж общих деталей к модулям: в шагах его нет.', 2.5, wd, true).forEach(function (l) { g.push(txt(tx, y, l, { fs: 2.5, c: WARN, b: 1 })); y += 3.6; }); }
		});
		return g.join('');
	}
	function specSheet(st, plan, W, H, boxes) {
		var sc = scene(st), g = [], loose = A.loose(st), rows = [];
		plan.groups.forEach(function (gp) {
			var u = gp.units[0], by = {}, list = [];
			unitItems(u).forEach(function (i) { var it = sc.items[i], k = rowKey(it); if (by[k]) { by[k].n++; return; } by[k] = { it: it, n: 1 }; list.push(by[k]); });
			list.sort(function (a, b) { return P.natCmp(String(a.it.pos || '~'), String(b.it.pos || '~')); });
			list.forEach(function (r, k) { rows.push({ grp: k ? '' : gp.mtext, it: r.it, n: r.n, tot: r.n * gp.units.length, sep: !k }); });
		});
		var lb = {}; loose.forEach(function (i) { var it = sc.items[i], k = rowKey(it); if (lb[k]) { lb[k].n++; lb[k].tot++; return; } lb[k] = { grp: '', it: it, n: 1, tot: 1 }; rows.push(lb[k]); });
		var firstL = true; rows.forEach(function (r) { if (lb[rowKey(r.it)] === r && firstL) { r.grp = 'Общие'; r.sep = true; firstL = false; } });
		var x = 0, w = W * 0.52, y = 4, lh = Math.min(3.9, (H - 14) / Math.max(1, rows.length + 2)), fs = Math.min(2.3, lh * 0.62);
		var col = [0, w * 0.11, w * 0.6, w * 0.82, w * 0.92];
		g.push(txt(x, y, 'Детали', { fs: 3.4, b: 1 })); y += 2.5;
		g.push('<rect x="0" y="' + f2(y) + '" width="' + f2(w) + '" height="5.4" fill="#f3f5f6" stroke="' + INK + '" stroke-width="0.25"/>' + ['Модуль', 'Деталь', 'Размер, мм', 'Кол.', 'Всего'].map(function (hh, i) { return txt(col[i] + 1, y + 3.8, hh, { fs: 2.3, b: 1 }); }).join('')); y += 5.4 + lh;
		rows.forEach(function (r) {
			if (r.sep && y > 14) g.push(line(0, y - lh + 0.6, w, y - lh + 0.6, 0.15, '#c9cfd4'));
			g.push((r.grp ? txt(1, y, r.grp, { fs: fs, b: 1 }) : '') + balloon(col[1] + 2.4, y - fs * 0.38, r.it.pos || '*', Math.min(1.8, lh * 0.46)) + txt(col[1] + 5.4, y, clip(r.it.name, fs, col[2] - col[1] - 6.5), { fs: fs }) +
				txt(col[2] + 1, y, Math.round(r.it.L) + '×' + Math.round(r.it.W) + '×' + f2(r.it.th), { fs: fs }) + txt(col[3] + 1, y, String(r.n), { fs: fs }) + txt(col[4] + 1, y, String(r.tot), { fs: fs, b: 1 }));
			y += lh;
		});
		var nAll = rows.reduce(function (a, r) { return a + r.tot; }, 0);
		g.push(txt(0, Math.min(H - 1, y + 2), 'Всего деталей: ' + nAll, { fs: 2.6, b: 1 }));
		/* крепёж и фурнитура по модулям */
		var x2 = w + 6, w2 = W - x2, F = {}, per = {}, U = plan.tops;
		U.forEach(function (u, k) { var t = totals(st, u); [t.fast, t.hw].forEach(function (m, q) { Object.keys(m).forEach(function (n) { if (!F[n]) { F[n] = { tot: 0, hw: q }; per[n] = U.map(function () { return 0; }); } F[n].tot += m[n]; per[n][k] += m[n]; }); }); });
		var names = Object.keys(F).sort(function (a, b) { return F[a].hw - F[b].hw; }), showPer = U.length > 1 && U.length <= 6;
		var lh2 = Math.min(4.4, (H - 18) / Math.max(1, names.length + 1)), fs2 = Math.min(2.3, lh2 * 0.6), y2 = 4;
		g.push(txt(x2, y2, 'Крепёж и фурнитура', { fs: 3.4, b: 1 })); y2 += 2.5;
		g.push('<rect x="' + f2(x2) + '" y="' + f2(y2) + '" width="' + f2(w2) + '" height="5.4" fill="#f3f5f6" stroke="' + INK + '" stroke-width="0.25"/>' + txt(x2 + 1, y2 + 3.8, 'Наименование', { fs: 2.3, b: 1 }) + (showPer ? txt(x2 + w2 - 14, y2 + 3.8, U.map(function (u) { return plan.mark[u.key]; }).join(' · '), { fs: 2.1, b: 1, a: 'end' }) : '') + txt(x2 + w2 - 1, y2 + 3.8, 'Всего', { fs: 2.3, b: 1, a: 'end' })); y2 += 5.4 + lh2;
		var perW = showPer ? tw(U.map(function () { return '00'; }).join(' · ')) * 2.1 + 16 : 12;
		if (!names.length) g.push(txt(x2 + 1, y2, 'В модели крепежа нет', { fs: 2.4, c: MUTE }));
		names.forEach(function (n) {
			g.push(txt(x2 + 1, y2, clip(n, fs2, w2 - perW - 2), { fs: fs2 }) + (showPer ? txt(x2 + w2 - 14, y2, per[n].join(' · '), { fs: Math.min(2.1, fs2), c: MUTE, a: 'end' }) : '') + txt(x2 + w2 - 1, y2, String(F[n].tot), { fs: fs2, b: 1, a: 'end' }) + line(x2, y2 + 1.3, x2 + w2, y2 + 1.3, 0.12, '#e3e6e9'));
			y2 += lh2;
		});
		return g.join('');
	}

	/* Лист документа: { W, H, svg, boxes, sheet } */
	A.sheet = function (st, sh, box) {
		var plan = A.plan(st), W = box.W, H = box.H, boxes = [], svg = '';
		try {
			if (sh.kind === 'over') svg = overSheet(st, plan, W, H, boxes);
			else if (sh.kind === 'steps') svg = stepsSheet(st, sh, plan, W, H, boxes);
			else if (sh.kind === 'mount') svg = mountSheet(st, plan, W, H, boxes);
			else if (sh.kind === 'expl') svg = explSheet(st, sh, plan, W, H, boxes);
			else if (sh.kind === 'spec') svg = specSheet(st, plan, W, H, boxes);
		} catch (e) { svg = txt(0, 10, 'Лист не построен: ' + (e && e.message)); boxes = []; }
		return { W: W, H: H, svg: svg, boxes: boxes, sheet: sh };
	};
	/* Подзаголовок листа */
	A.sub = function (st, sh) {
		var plan = A.plan(st);
		if (sh.kind === 'over') return 'Модулей ' + plan.tops.length + (A.loose(st).length ? ' · общих деталей ' + A.loose(st).length : '');
		if (sh.kind === 'steps') { var d = A.data(st, sh.unit); return (sh.sub ? 'Узел' : 'Модуль') + (sh.cnt > 1 ? ' — ' + sh.cnt + ' шт.' : '') + (sh.sub ? '' : ' (' + sh.g.mtext + ')') + ' · ' + d.size.join(' × ') + ' мм · шагов ' + d.steps.length; }
		if (sh.kind === 'expl') return 'Модуль' + (sh.cnt > 1 ? ' — ' + sh.cnt + ' шт.' : '') + ' (' + sh.g.mtext + ') · все детали с номерами, узлы крепления, таблица';
		if (sh.kind === 'mount') return 'Порядок установки модулей и общих деталей';
		if (sh.kind === 'spec') return 'Все детали и весь крепёж изделия';
		return '';
	};
	/* для комплекта сборки (core/kit.js): геометрия, рисунок шага, подпись одинаковых единиц */
	A._g = { corners: corners, View: View, iso: iso, fit: fit, drawPolys: drawPolys, aabb: aabb, center: center, axes: axes, rowKey: rowKey, balloon: balloon, txt: txt, line: line, wrap: wrap, clip: clip, tw: tw, extAx: extAx, SHADE: SHADE };
	A.sigOf = sigOf;
	A.stepCell = function (st, d, si, x, y, w, h, boxes, pic) { return stepCell(st, d, A.plan(st), si, x, y, w, h, boxes, pic); };
	/* Снимок 3D (листы «Сборки»): pic = { url, m: матрица 4×4 по столбцам, w, h } → картинка в рамке x, y, w, h (по центру, без искажений)
	   и at(p) — точка модели на листе, для номеров и линий поверх снимка */
	A.picPlace = function (pic, x, y, w, h) {
		var s = Math.min(w / pic.w, h / pic.h), ox = x + (w - pic.w * s) / 2, oy = y + (h - pic.h * s) / 2, m = pic.m;
		var at = function (p) {
			var cx = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], cy = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], cw = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15] || 1;
			return [ox + (cx / cw + 1) / 2 * pic.w * s, oy + (1 - cy / cw) / 2 * pic.h * s];
		};
		at.k = s;
		return { svg: '<image x="' + f2(ox) + '" y="' + f2(oy) + '" width="' + f2(pic.w * s) + '" height="' + f2(pic.h * s) + '" preserveAspectRatio="none" href="' + pic.url + '"/>', at: at, box: [ox, oy, pic.w * s, pic.h * s] };
	};
	A.totals = totals;
	A.pageSvg = function (pg, o) {
		o = o || {};
		var size = o.px > 0 ? 'width="' + Math.round(o.px) + '" height="' + Math.round(o.px * pg.H / pg.W) + '"' : 'width="' + f2(pg.W) + 'mm" height="' + f2(pg.H) + 'mm"';
		return '<svg xmlns="http://www.w3.org/2000/svg" version="1.1" ' + size + ' viewBox="0 0 ' + f2(pg.W) + ' ' + f2(pg.H) + '" font-family=\'' + D.FONT.replace(/"/g, '') + '\'>' + pg.svg + '</svg>';
	};
	/* Проверка листа: надписи в поле и не налезают друг на друга. */
	A.check = function (pg) {
		var out = [], b = pg.boxes;
		for (var i = 0; i < b.length; i++) {
			if (b[i].x < -0.05 || b[i].y < -0.05 || b[i].x + b[i].w > pg.W + 0.05 || b[i].y + b[i].h > pg.H + 0.05) out.push('«' + b[i].text + '» выходит за поле');
			for (var j = i + 1; j < b.length; j++) if (!(b[i].kind === 'table' && b[j].kind === 'table') && hit(b[i], b[j], -0.05)) out.push('«' + b[i].text + '» задевает «' + b[j].text + '»');
		}
		return out;
	};
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));
