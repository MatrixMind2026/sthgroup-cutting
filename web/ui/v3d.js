/* STHGroup — 3D-просмотр: рисование сцены BM.m3d библиотекой three.js, вращение, выбор детали,
   режимы отображения, разнесение, открывание фасадов, линейка, габаритные размеры, кружки позиций, снимок.
   Здесь нет ни списков, ни кнопок — только сам вид; окно раздела управляет им через возвращаемый объект. */
(function (G) {
	'use strict';
	var BM = G.BM, M = BM.m3d, T = G.THREE, V = BM.v3d = {};

	/* Оформление вида. colorBy: 'mat' — цвет материала, 'mod' — цвет модуля, 'mono' — один цвет. */
	/* профили тел крепежа для вращения вокруг оси отверстия: (радиус, смещение вглубь от поверхности), мм.
	   Размеры типовые: конфирмат 7×50 — головка Ø10,3, шестигранник 4, резьба Ø7 с шагом 2,8; эксцентрик Ø15 — чашка с ободком и выемкой; болт — резьба Ø6 с шагом 1 и скруглённая головка */
	V.fastProfile = function (f) {
		var y0 = 0.2, a, k, L = f.len;
		if (f.kind === 'conf' && f.hdia > 0) {
			/* по чертежу конфирмата 7,0×50: потайная головка Ø9,9 с шестигранником 4 мм, высота головки 6 мм, шейка Ø6,8, резьба Ø6,8 по сердечнику Ø4, шаг ≈ 3,8, цилиндрический кончик */
			var hr = Math.max(4.4, f.hdia / 2), r = f.dia / 2 + 0.2, core = r * 0.6, tot = L + (f.hlen > 0 ? 0 : 0), yh = y0 + 6, ye = y0 + tot - 3.5;
			var pts = [[0, y0 + 3.2], [2.1, y0 + 0.2], [2.3, y0], [hr - 0.3, y0], [hr, y0 + 0.4], [r + 0.3, yh - 0.6], [r, yh]];
			var yn = yh + Math.min(8, tot * 0.12);
			pts.push([r, yn], [core + 0.3, yn + 3]);
			for (a = yn + 2; a < ye; a += 3.2) { pts.push([core, a]); pts.push([r, a + 0.5]); pts.push([r, a + 0.9]); pts.push([core, a + 1.5]); }
			pts.push([core, ye], [core * 0.95, y0 + tot], [0, y0 + tot]);
			return [pts];
		}
		if (f.kind === 'cam') {
			var R = f.dia / 2, depth = Math.max(L, 8);
			return [[[0, y0 + 1.6], [R * 0.82, y0 + 1.6], [R * 0.86, y0 + 0.2], [R - 0.4, y0], [R, y0 + 0.4], [R, y0 + depth], [0, y0 + depth]]];
		}
		if (f.kind === 'bolt') {
			var rb = f.dia / 2, pt = [[0, 0], [rb * 1.2, 0.3], [rb * 1.2, 1.6], [rb, 2.2]];
			for (a = 2.2; a < L - 1; a += 1) { pt.push([rb, a + 0.3]); pt.push([rb - 0.45, a + 0.8]); }
			pt.push([rb - 0.5, L - 0.6], [rb * 0.6, L], [0, L]);
			return [pt];
		}
		var rr = f.dia / 2;
		return [[[0, 0], [rr, 0.2], [rr, L - 1], [rr * 0.7, L], [0, L]]];
	};
	V.STYLES = {
		studio: { name: 'Мастерская', bg: ['#fbfcfd', '#dfe5ea'], colorBy: 'mat', tint: 1, line: '#2a3036', lineOp: 0.55, side: 0.84, hemi: 0.95, dir: 0.75, hole: '#22272c', band: '#0E6B5A', groove: '#4e565e', sel: '#0E6B5A', ghost: 0.3 },
		draft: { name: 'Чертёжный', bg: ['#ffffff', '#f1f3f5'], colorBy: 'mono', mono: '#f6f6f3', tint: 0.35, line: '#22282e', lineOp: 0.9, side: 0.9, hemi: 1.15, dir: 0.5, hole: '#1d2227', band: '#0E6B5A', groove: '#59626b', sel: '#0E6B5A', ghost: 0.25 },
		dark: { name: 'Тёмный цех', bg: ['#22262a', '#101214'], colorBy: 'mat', tint: 0.92, line: '#0b0d0f', lineOp: 0.8, side: 0.8, hemi: 0.85, dir: 0.8, hole: '#0a0c0e', band: '#FF8A1F', groove: '#15181b', sel: '#FF8A1F', ghost: 0.3, darkUi: 1 },
		mods: { name: 'По модулям', bg: ['#ffffff', '#eceff2'], colorBy: 'mod', tint: 1, line: '#2a3036', lineOp: 0.6, side: 0.86, hemi: 1.0, dir: 0.65, hole: '#22272c', band: '#1c2126', groove: '#4e565e', sel: '#0E6B5A', ghost: 0.3 }
	};
	var MOD_HUES = [205, 28, 150, 265, 48, 330, 180, 8, 95, 235, 300, 70];

	function v3(a) { return new T.Vector3(a[0], a[1], a[2]); }
	function mixHex(a, b, k) {
		var x = new T.Color(a), y = new T.Color(b);
		return x.lerp(y, k);
	}

	V.create = function (host, opt) {
		opt = opt || {};
		var api = {}, sc = null, style = V.STYLES[opt.style] || V.STYLES.studio;
		var renderer = new T.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
		renderer.setPixelRatio(Math.min(G.devicePixelRatio || 1, 2));
		renderer.setClearColor(0x000000, 0);
		var canvas = renderer.domElement;
		canvas.className = 'v3dCanvas';
		host.classList.add('v3dHost');
		host.appendChild(canvas);
		var labels = document.createElement('div');
		labels.className = 'v3dLabels';
		host.appendChild(labels);

		var scene = new T.Scene(), root = new T.Group(), over = new T.Group();
		root.matrixAutoUpdate = false;
		scene.add(root); scene.add(over);
		var hemi = new T.HemisphereLight(0xffffff, 0x8a8f94, 1), sun = new T.DirectionalLight(0xffffff, 0.7);
		scene.add(hemi);
		var camP = new T.PerspectiveCamera(32, 1, 10, 100000), camO = new T.OrthographicCamera(-1, 1, 1, -1, -100000, 100000), cam = camO;
		camO.add(sun); sun.position.set(-0.4, 0.7, 1);
		scene.add(camP); scene.add(camO);
		var orbit = { t: new T.Vector3(), az: -0.6, el: 0.36, dist: 5000, persp: false };

		var items = [];             // { it, g, mesh, lines, deco, band, mFace, mSide, base(Matrix4) }
		var sols = [];              // фурнитура и профили: { s, g, mesh, lines, mat, col }
		var fx = [];                // крепёж, достроенный по отверстиям (конфирматы, эксцентрики…): { f, g, mat, item }
		var gobs = [], G3 = null;   // модель из 3D-файла БАЗИСа: объекты { o, g, meshes, lines, it, an }
		var state = { look: 'plain', quality: 'high', mode: 'texl', xray: false, outline: true, holes: true, band: true, grooves: true, furn: true, ohid: {}, osel: {}, explode: 0, scope: '', open: 0, hidden: {}, sel: {}, shid: {}, ssel: {}, hover: -1, tool: '', dims: false, bdims: false, balloons: null };
		var need = true, W = 1, H = 1, toView = new T.Matrix4(), viewBox = new T.Box3();
		var measures = [], pendingA = null, dimObjs = [], labelList = [];

		/* ------------------------------ построение ------------------------------ */
		function clearGroup(g) { while (g.children.length) { var c = g.children.pop(); if (c.geometry) c.geometry.dispose(); if (c.children && c.children.length) clearGroup(c); } }

		function colorOfItem(it) {
			var base;
			if (style.colorBy === 'mono') base = new T.Color(style.mono).lerp(new T.Color(M.matColor(it.mat)), style.tint);
			else if (style.colorBy === 'mod') { var mi = modIndex(it.mod); base = new T.Color(M.hslHex(MOD_HUES[mi % MOD_HUES.length], 0.42, 0.74 - 0.07 * (Math.floor(mi / MOD_HUES.length) % 2))); }
			else base = new T.Color(style.darkUi ? '#3a3d40' : '#ffffff').lerp(new T.Color(M.matColor(it.mat)), style.tint);
			return base;
		}
		function modIndex(name) { for (var i = 0; i < sc.mods.length; i++) if (sc.mods[i].name === name) return i; return 0; }

		/* Рёбра панели с соседними гранями: в прозрачных видах рёбра, обращённые от зрителя, рисуются бледно (скрытые линии). */
		function buildEdges(rec, geo) {
			var pa = geo.attributes.position, nT = Math.floor(pa.count / 3), map = {}, keys = [], t, k;
			var q = function (x, y, z) { return Math.round(x * 50) + ',' + Math.round(y * 50) + ',' + Math.round(z * 50); };
			for (t = 0; t < nT; t++) {
				var P = [], i;
				for (i = 0; i < 3; i++) P.push([pa.getX(t * 3 + i), pa.getY(t * 3 + i), pa.getZ(t * 3 + i)]);
				var ux = P[1][0] - P[0][0], uy = P[1][1] - P[0][1], uz = P[1][2] - P[0][2], wx = P[2][0] - P[0][0], wy = P[2][1] - P[0][1], wz = P[2][2] - P[0][2];
				var nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx, nl = Math.sqrt(nx * nx + ny * ny + nz * nz);
				if (nl < 1e-9) continue;
				nx /= nl; ny /= nl; nz /= nl;
				for (i = 0; i < 3; i++) {
					var a = P[i], b = P[(i + 1) % 3], ka = q(a[0], a[1], a[2]), kb = q(b[0], b[1], b[2]);
					if (ka === kb) continue;
					var key = ka < kb ? ka + '|' + kb : kb + '|' + ka, e = map[key];
					if (!e) { e = map[key] = { a: a, b: b, n: [] }; keys.push(key); }
					e.n.push([nx, ny, nz]);
				}
			}
			var A = [], B = [], N1 = [], N2 = [], cs = Math.cos(28 * Math.PI / 180);
			for (k = 0; k < keys.length; k++) {
				var ed = map[keys[k]], n1 = ed.n[0], n2 = null, sharp = ed.n.length === 1;
				for (var z = 1; z < ed.n.length && !sharp; z++) { n2 = ed.n[z]; if (n1[0] * n2[0] + n1[1] * n2[1] + n1[2] * n2[2] < cs) sharp = true; }
				if (!sharp) continue;
				A.push(ed.a); B.push(ed.b); N1.push(n1); N2.push(n2 || n1);
			}
			var cnt = A.length;
			rec.eg = { a: A, b: B, n1: N1, n2: N2, cnt: cnt };
			var mk = function () { var g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(new Float32Array(cnt * 6), 3)); g.setDrawRange(0, 0); var l = new T.LineSegments(g, new T.LineBasicMaterial({ color: style.line, transparent: true, opacity: style.lineOp })); l.visible = false; l.frustumCulled = false; return l; };
			rec.lv = mk(); rec.lh = mk();
			rec.g.add(rec.lv); rec.g.add(rec.lh);
		}
		/* виды как в БАЗИСе: tex — текстуры; texl — текстуры с линиями; nohid — без невидимых; thin — невидимые тонкие; wire — каркас; «рентген» (state.xray) — только в tex и texl */
		var lpMat = new T.LineBasicMaterial({ color: style.line, transparent: true, opacity: 0.35, depthTest: false, depthWrite: false });
		function mkLp(ln) { var q = new T.LineSegments(ln.geometry, lpMat); q.matrixAutoUpdate = false; q.matrix.copy(ln.matrix); q.frustumCulled = false; q.renderOrder = 4; q.visible = false; ln.renderOrder = 5; if (ln.parent) ln.parent.add(q); return q; }
		function xrayOn() { return !!state.xray && (state.mode === 'tex' || state.mode === 'texl'); }
		var eV = new T.Vector3(), eM = new T.Matrix4(), eC = new T.Vector3(), eKey = '';
		/* в прозрачных видах раскладывает рёбра каждой панели на видимые (обращены к зрителю) и скрытые */
		function updateEdges() {
			if (!xrayOn() && state.mode !== 'wire') return;
			placeCamera(); root.updateMatrixWorld(true); cam.updateMatrixWorld(true);
			var ortho = cam === camO;
			cam.getWorldPosition(eC);
			var fwd = new T.Vector3(); cam.getWorldDirection(fwd);
			for (var i = 0; i < items.length; i++) {
				var r = items[i]; if (!r.eg || !r.lv.visible) continue;
				eM.copy(r.g.matrixWorld).invert();
				var cl = eC.clone().applyMatrix4(eM), dl = fwd.clone().negate().transformDirection(eM);
				var pv = r.lv.geometry.attributes.position.array, ph = r.lh.geometry.attributes.position.array, nv = 0, nh = 0, E = r.eg;
				for (var k = 0; k < E.cnt; k++) {
					var a = E.a[k], b = E.b[k], n1 = E.n1[k], n2 = E.n2[k], tx, ty, tz;
					if (ortho) { tx = dl.x; ty = dl.y; tz = dl.z; } else { tx = cl.x - (a[0] + b[0]) / 2; ty = cl.y - (a[1] + b[1]) / 2; tz = cl.z - (a[2] + b[2]) / 2; }
					var front = (n1[0] * tx + n1[1] * ty + n1[2] * tz > 0) || (n2[0] * tx + n2[1] * ty + n2[2] * tz > 0), arr = front ? pv : ph, o = front ? nv++ : nh++;
					arr[o * 6] = a[0]; arr[o * 6 + 1] = a[1]; arr[o * 6 + 2] = a[2]; arr[o * 6 + 3] = b[0]; arr[o * 6 + 4] = b[1]; arr[o * 6 + 5] = b[2];
				}
				r.lv.geometry.setDrawRange(0, nv * 2); r.lh.geometry.setDrawRange(0, nh * 2);
				r.lv.geometry.attributes.position.needsUpdate = true; r.lh.geometry.attributes.position.needsUpdate = true;
				r.nVis = nv; r.nHid = nh;
			}
		}
		/* для проверок: сколько крепежа достроено и виден ли он; видны ли кружки отверстий на панелях */
		api.fastInfo = function () { var k = {}, vis = 0; fx.forEach(function (x) { k[x.f.kind] = (k[x.f.kind] || 0) + 1; if (x.g.visible) vis++; }); return { n: fx.length, vis: vis, kinds: k }; };
		api.viewInfo = function () {
			var r = null, k, lines = false, pale = false;
			for (k = 0; k < items.length; k++) { var q = items[k]; if (!state.hidden[k]) { r = r || q; if (q.lines.visible || q.lv.visible) lines = true; if (q.lp.visible) pale = true; } }
			var f = fx.filter(function (x) { return x.g.visible; });
			var hwn = 0; items.forEach(function (q, k) { if (q.hw && q.hw.visible && !state.hidden[k]) hwn++; });
			return { holeWire: hwn, mode: state.mode, xray: !!state.xray, lines: lines, pale: pale, panelOp: r ? r.mFace.opacity : -1, furnOp: f.length ? f[0].mat.opacity : -1, fastShown: f.length > 0 };
		};
		api.holeInfo = function () { var n = 0, on = 0; items.forEach(function (r) { if (r.deco) { n++; if (r.deco.visible && r.g.visible) on++; } }); return { panels: n, shown: on }; };
		api.edgeStat = function (i) { updateEdges(); var r = items[i]; return r && r.eg ? { vis: r.nVis || 0, hid: r.nHid || 0, all: r.eg.cnt, hidOp: r.lh.material.opacity, visOp: r.lv.material.opacity } : null; };

		function insideMat(it, x, y) {
			if (!BM.geom.pointIn(it.outer, x, y)) return false;
			for (var i = 0; i < it.inner.length; i++) if (BM.geom.pointIn(it.inner[i], x, y)) return false;
			return true;
		}
		function pushQuad(pos, a, b, c, d) { pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], a[0], a[1], a[2], c[0], c[1], c[2], d[0], d[1], d[2]); }
		function geoOf(pos) { var g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.computeVertexNormals(); return g; }

		function buildItem(it) {
			var shape = new T.Shape(it.outer.map(function (p) { return new T.Vector2(p[0], p[1]); })), k, q;
			for (k = 0; k < it.inner.length; k++) shape.holes.push(new T.Path(it.inner[k].map(function (p) { return new T.Vector2(p[0], p[1]); })));
			var geo = new T.ExtrudeGeometry(shape, { depth: Math.max(it.th, 0.5), bevelEnabled: false, curveSegments: 1, steps: 1 });
			var col = colorOfItem(it);
			var mFace = new T.MeshLambertMaterial({ color: col, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
			var mSide = new T.MeshLambertMaterial({ color: col.clone().multiplyScalar(style.side), polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
			var mesh = new T.Mesh(geo, [mFace, mSide]);
			mesh.castShadow = mesh.receiveShadow = true;
			var lines = new T.LineSegments(new T.EdgesGeometry(geo, 28), new T.LineBasicMaterial({ color: style.line, transparent: true, opacity: style.lineOp }));
			var g = new T.Group();
			g.matrixAutoUpdate = false;
			g.add(mesh); g.add(lines);
			var lpI = mkLp(lines);
			var rec = { it: it, g: g, mesh: mesh, lines: lines, lp: lpI, mFace: mFace, mSide: mSide, col: col, deco: null, band: null, grv: null, base: new T.Matrix4() };
			mesh.userData.rec = rec;
			buildEdges(rec, geo);

			/* кромка: полоска по торцу */
			var pos = [];
			for (k = 0; k < it.edges.length; k++) {
				var pts = it.edges[k].pts;
				for (q = 0; q + 1 < pts.length; q++) {
					var a = pts[q], b = pts[q + 1], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.sqrt(dx * dx + dy * dy);
					if (l < 0.01) continue;
					var nx = dy / l, ny = -dx / l, mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
					if (insideMat(it, mx + nx * 0.5, my + ny * 0.5)) { nx = -nx; ny = -ny; }
					var o = 0.35, z1 = it.th * 0.34, z2 = it.th * 0.66;
					pushQuad(pos, [a[0] + nx * o, a[1] + ny * o, z1], [b[0] + nx * o, b[1] + ny * o, z1], [b[0] + nx * o, b[1] + ny * o, z2], [a[0] + nx * o, a[1] + ny * o, z2]);
				}
			}
			if (pos.length) { rec.band = new T.Mesh(geoOf(pos), new T.MeshBasicMaterial({ color: style.band, side: T.DoubleSide })); g.add(rec.band); }

			/* пазы: полоса на пласти, обращённой внутрь модуля */
			pos = [];
			var md = M.modOf(sc, it), inner = M.vec.dot(M.vec.sub(md.c, it.c), it.n) > 0, zf = inner ? it.th + 0.3 : -0.3;
			for (k = 0; k < it.cuts.length; k++) {
				var cp = it.cuts[k].pts, hw = it.cuts[k].w / 2;
				for (q = 0; q + 1 < cp.length; q++) {
					var c1 = cp[q], c2 = cp[q + 1], ex = c2[0] - c1[0], ey = c2[1] - c1[1], el = Math.sqrt(ex * ex + ey * ey);
					if (el < 0.01) continue;
					var px = -ey / el * hw, py = ex / el * hw;
					pushQuad(pos, [c1[0] + px, c1[1] + py, zf], [c2[0] + px, c2[1] + py, zf], [c2[0] - px, c2[1] - py, zf], [c1[0] - px, c1[1] - py, zf]);
				}
			}
			if (pos.length) { rec.grv = new T.Mesh(geoOf(pos), new T.MeshBasicMaterial({ color: style.groove, side: T.DoubleSide })); g.add(rec.grv); }

			var f = it.f, o3 = [f.o[0] + f.z[0] * it.z0, f.o[1] + f.z[1] * it.z0, f.o[2] + f.z[2] * it.z0];
			rec.base.set(f.x[0], f.y[0], f.z[0], o3[0], f.x[1], f.y[1], f.z[1], o3[1], f.x[2], f.y[2], f.z[2], o3[2], 0, 0, 0, 1);
			return rec;
		}

		/* отверстия панели одной сеткой: кружки на поверхности */
		function buildHoles() {
			var by = {}, k, s;
			for (k = 0; k < sc.holes.length; k++) { var h = sc.holes[k]; if (h.item >= 0) (by[h.item] = by[h.item] || []).push(h); }
			for (var key in by) if (by.hasOwnProperty(key)) {
				var rec = items[+key], it = rec.it, pos = [], rp = [], hl = [], hc = [], N = 18;
				for (k = 0; k < by[key].length; k++) {
					var hh = by[key][k], r = hh.dia / 2, cx = hh.l[0], cy = hh.l[1], cz = hh.l[2] - it.z0;
					var faces = [];
					if (hh.side === 'a') { faces.push([cx, cy, -0.3, 0]); if (hh.thr || hh.depth >= it.th - 0.1) faces.push([cx, cy, it.th + 0.3, 0]); }
					else if (hh.side === 'b') { faces.push([cx, cy, it.th + 0.3, 0]); if (hh.thr || hh.depth >= it.th - 0.1) faces.push([cx, cy, -0.3, 0]); }
					else {
						var dl = [M.vec.dot(hh.d, it.f.x), M.vec.dot(hh.d, it.f.y)], dn = Math.sqrt(dl[0] * dl[0] + dl[1] * dl[1]) || 1;
						faces.push([cx - dl[0] / dn * 0.3, cy - dl[1] / dn * 0.3, cz, 1, -dl[1] / dn, dl[0] / dn]);
					}
					/* контур отверстия по всей глубине — виден сквозь панель в видах «без невидимых», «невидимые тонкие», «каркас» */
					var thr2 = hh.thr || hh.depth >= it.th - 0.1 || !(hh.depth > 0), dep = hh.side === 'e' ? (hh.depth > 0 ? hh.depth : 10) : (thr2 ? it.th : hh.depth), O, D, U, V;
					if (hh.side === 'a') { O = [cx, cy, 0]; D = [0, 0, 1]; U = [1, 0, 0]; V = [0, 1, 0]; }
					else if (hh.side === 'b') { O = [cx, cy, it.th]; D = [0, 0, -1]; U = [1, 0, 0]; V = [0, 1, 0]; }
					else { O = [cx, cy, cz]; D = [dl[0] / dn, dl[1] / dn, 0]; U = [-dl[1] / dn, dl[0] / dn, 0]; V = [0, 0, 1]; }
					var ring = function (t, a) { return [O[0] + D[0] * t + r * (Math.cos(a) * U[0] + Math.sin(a) * V[0]), O[1] + D[1] * t + r * (Math.cos(a) * U[1] + Math.sin(a) * V[1]), O[2] + D[2] * t + r * (Math.cos(a) * U[2] + Math.sin(a) * V[2])]; };
					var hn0 = hl.length;
					for (s = 0; s < 16; s++) {
						var w1 = s / 16 * Math.PI * 2, w2 = (s + 1) / 16 * Math.PI * 2;
						Array.prototype.push.apply(hl, ring(0, w1).concat(ring(0, w2), ring(dep, w1), ring(dep, w2)));
						if (s % 4 === 0) Array.prototype.push.apply(hl, ring(0, w1).concat(ring(dep, w1)));
					}
					/* стрелка направления сверления: снаружи к устью отверстия */
					var pt = function (t, u, v) { return [O[0] + D[0] * t + U[0] * u + V[0] * v, O[1] + D[1] * t + U[1] * u + V[1] * v, O[2] + D[2] * t + U[2] * u + V[2] * v]; };
					Array.prototype.push.apply(hl, pt(-10, 0, 0).concat(pt(0, 0, 0), pt(0, 0, 0), pt(-2.5, 1.3, 0), pt(0, 0, 0), pt(-2.5, -1.3, 0), pt(0, 0, 0), pt(-2.5, 0, 1.3), pt(0, 0, 0), pt(-2.5, 0, -1.3)));
					/* цвет: пласть — синий, торец — бирюзовый (как в образце) */
					var hcol = hh.side === 'e' ? [0.04, 0.6, 0.66] : [0.12, 0.47, 0.82];
					for (var ci = hn0; ci < hl.length; ci += 3) Array.prototype.push.apply(hc, hcol);
					for (var fi = 0; fi < faces.length; fi++) {
						var F = faces[fi];
						for (s = 0; s < N; s++) {
							var a1 = s / N * Math.PI * 2, a2 = (s + 1) / N * Math.PI * 2;
							var q = function (k, ra) { return F[3] ? [F[0] + F[4] * ra * Math.cos(k), F[1] + F[5] * ra * Math.cos(k), F[2] + ra * Math.sin(k)] : [F[0] + ra * Math.cos(k), F[1] + ra * Math.sin(k), F[2]]; };
							var c0 = [F[0], F[1], F[2]], i1 = q(a1, r * 0.78), i2 = q(a2, r * 0.78), o1 = q(a1, r), o2 = q(a2, r);
							Array.prototype.push.apply(pos, c0.concat(i1, i2));                          /* тёмная середина */
							Array.prototype.push.apply(rp, i1.concat(o1, o2, i1, o2, i2));               /* светлее кромка — «фаска» отверстия */
						}
					}
				}
				if (pos.length) {
					rec.deco = new T.Mesh(geoOf(pos), new T.MeshBasicMaterial({ color: style.hole, side: T.DoubleSide }));
					var rim = new T.Mesh(geoOf(rp), new T.MeshBasicMaterial({ color: '#6a7178', side: T.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
					rec.deco.add(rim);
					rec.g.add(rec.deco);
					var hg = new T.BufferGeometry(); hg.setAttribute('position', new T.Float32BufferAttribute(hl, 3)); hg.setAttribute('color', new T.Float32BufferAttribute(hc, 3));
					rec.hw = new T.LineSegments(hg, new T.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false }));
					rec.hw.renderOrder = 6; rec.hw.visible = false; rec.hw.frustumCulled = false; rec.g.add(rec.hw);
				}
			}
		}

		/* крепёж по отверстиям: цилиндры вдоль оси отверстия (координаты модели); едет со своей панелью */
		function buildFast() {
			var list = sc.fast || [], Y = new T.Vector3(0, 1, 0);
			for (var i = 0; i < list.length; i++) {
				var f = list[i], rec = items[f.item]; if (!rec) continue;
				var g = new T.Group(), d = new T.Vector3(f.d[0], f.d[1], f.d[2]).normalize(), q = new T.Quaternion().setFromUnitVectors(Y, d), p = new T.Vector3(f.p[0], f.p[1], f.p[2]);
				var mat = f.kind === 'conf' ? new T.MeshPhongMaterial({ color: new T.Color(f.col), specular: 0x9aa0a6, shininess: 70, side: T.DoubleSide }) : new T.MeshLambertMaterial({ color: new T.Color(f.col), side: T.DoubleSide });
				g.matrixAutoUpdate = false;
				var pr = V.fastProfile(f);
				pr.forEach(function (pts) {
					var me = new T.Mesh(new T.LatheGeometry(pts.map(function (a) { return new T.Vector2(a[0], a[1]); }), 24), mat);
					me.quaternion.copy(q); me.position.copy(p); me.userData.fx = f; g.add(me);
				});
				fx.push({ f: f, g: g, mat: mat, item: f.item }); root.add(g);
			}
		}

		/* тело фурнитуры: сетка из выгрузки или брусок по габариту; координаты — уже модели */
		function buildSolid(s) {
			var pos;
			if (s.v) pos = s.v;
			else {
				var a = s.box.min, b = s.box.max, P = function (i) { return [i & 1 ? b[0] : a[0], i & 2 ? b[1] : a[1], i & 4 ? b[2] : a[2]]; };
				pos = [];
				[[0, 2, 3, 1], [4, 5, 7, 6], [0, 1, 5, 4], [2, 6, 7, 3], [0, 4, 6, 2], [1, 3, 7, 5]].forEach(function (f) { pushQuad(pos, P(f[0]), P(f[1]), P(f[2]), P(f[3])); });
			}
			var geo = geoOf(pos), col = new T.Color(s.prof ? '#b9c0c6' : (s.v ? '#a7adb3' : '#c3c8cc'));
			var mat = new T.MeshLambertMaterial({ color: col, side: T.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
			var mesh = new T.Mesh(geo, mat), lines = new T.LineSegments(new T.EdgesGeometry(geo, 30), new T.LineBasicMaterial({ color: style.line, transparent: true, opacity: style.lineOp * 0.8 }));
			var g = new T.Group(); g.matrixAutoUpdate = false; g.add(mesh); g.add(lines);
			var lpS = mkLp(lines);
			var rec = { s: s, sol: s.i, g: g, mesh: mesh, lines: lines, lp: lpS, mat: mat, col: col };
			mesh.userData.rec = rec;
			return rec;
		}

		api.setScene = function (scn) {
			sc = scn;
			clearGroup(root); clearGroup(over); items = []; sols = []; fx = []; gobs = []; G3 = null; measures = []; pendingA = null; dimObjs = [];
			state.hidden = {}; state.sel = {}; state.shid = {}; state.ssel = {}; state.ohid = {}; state.osel = {}; state.hover = -1; state.explode = 0; state.open = 0; state.scope = '';
			/* оси вида: X — вправо, Y — вверх, Z — к зрителю (лицо изделия) */
			var up = sc.up, fr = sc.front, rt = M.vec.cross(up, fr), c = sc.c;
			toView.set(rt[0], rt[1], rt[2], -M.vec.dot(rt, c), up[0], up[1], up[2], -M.vec.dot(up, c), fr[0], fr[1], fr[2], -M.vec.dot(fr, c), 0, 0, 0, 1);
			root.matrix.copy(toView); root.matrixWorldNeedsUpdate = true;
			for (var i = 0; i < sc.items.length; i++) { var rec = buildItem(sc.items[i]); items.push(rec); root.add(rec.g); }
			for (i = 0; i < (sc.solids || []).length; i++) { if (!sc.solids[i].box) { sols.push(null); continue; } var sr = buildSolid(sc.solids[i]); sols.push(sr); root.add(sr.g); }
			buildHoles(); buildFast();
			BD.g = null; BD.list = []; UB = null; AN.prog = {}; AN.tgt = {}; AN.wait = {}; GZ.g = null; GZ.hs = []; GZ.cfg = null;
			applyTransforms(); applyLook(); LT.box = null; buildLights();
			api.view('iso'); api.fit();
		};

		/* ---------------- модель из 3D-файла БАЗИСа (glb): рисуется вместо панелей ---------------- */
		/* G: { g (BM.glb.parse), O (objects), M (match), A (anchors), texOf(путь из файла, материал) → адрес, mats: { имя: { t: прозрачность } } } */
		var gMats = {};
		function gMat(name, G) {
			if (gMats[name]) return gMats[name];
			var src = G.g.mats[name], L = BM.glbmat.look(name, src, BM.glbmat.info(G.mats, name));
			var url = L.tex && G.texOf ? G.texOf(L.tex, name) : '';
			var ud = { col: url ? new T.Color(0xffffff) : new T.Color().setRGB(L.color[0], L.color[1], L.color[2], T.SRGBColorSpace), url: url, glass: L.glass, name: name, op: L.opacity, hide: L.hide, L: L };
			return gMats[name] = ud;
		}
		/* развёртка текстуры в мм: панель — в осях своей рамки (как у нарисованных панелей), остальное —
		   на плоскость грани, волокна вдоль длинной стороны объекта */
		function gUV(pos, nrm, it, box, L) {
			var n = pos.length / 3, uv = new Float32Array(n * 2), i, sx = L ? L.sx : 1000, sy = L ? L.sy : 1000;
			if (it) {
				var f = it.f, sw = it.tex === 1;                           // текстура «горизонтальная» — рисунок вдоль X панели
				for (i = 0; i < n; i++) { var dx = pos[i * 3] - f.o[0], dy = pos[i * 3 + 1] - f.o[1], dz = pos[i * 3 + 2] - f.o[2], a0 = dx * f.x[0] + dy * f.x[1] + dz * f.x[2], b0 = dx * f.y[0] + dy * f.y[1] + dz * f.y[2]; uv[i * 2] = (sw ? b0 : a0) / sx; uv[i * 2 + 1] = (sw ? a0 : b0) / sy; }
				return uv;
			}
			var s = [box.max[0] - box.min[0], box.max[1] - box.min[1], box.max[2] - box.min[2]];
			for (i = 0; i < n; i++) {
				var ax = Math.abs(nrm[i * 3]), ay = Math.abs(nrm[i * 3 + 1]), az = Math.abs(nrm[i * 3 + 2]), a, b;
				if (ax >= ay && ax >= az) { a = 1; b = 2; } else if (ay >= az) { a = 0; b = 2; } else { a = 0; b = 1; }
				if (s[a] > s[b]) { var t = a; a = b; b = t; }
				uv[i * 2] = pos[i * 3 + a] / sx; uv[i * 2 + 1] = pos[i * 3 + b] / sy;
			}
			return uv;
		}
		function buildGob(G, oi) {
			var o = G.O.objs[oi], it = G.M.byObj[oi] !== undefined ? sc.items[G.M.byObj[oi]] : null, byMat = {};
			o.geo.forEach(function (ge) {
				var mesh = G.g.meshes[ge.mesh], m = ge.m;
				mesh.prims.forEach(function (p) {
					if (/^вырез/i.test(p.mat) || /^вырез/i.test(o.name)) return;           // объём выреза — не деталь
					var L = byMat[p.mat] || (byMat[p.mat] = { pos: [], nrm: [] }), P = p.pos, N = p.nrm, I = p.idx || null, cnt = I ? I.length : P.length / 3;
					for (var k = 0; k < cnt; k++) {
						var v = I ? I[k] : k, x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
						L.pos.push(m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]);
						if (N) { var a = N[v * 3], b = N[v * 3 + 1], c = N[v * 3 + 2]; L.nrm.push(m[0] * a + m[4] * b + m[8] * c, m[1] * a + m[5] * b + m[9] * c, m[2] * a + m[6] * b + m[10] * c); }
					}
				});
			});
			var g = new T.Group(); g.matrixAutoUpdate = false;
			var rec = { o: oi, g: g, meshes: [], lines: null, it: it ? it.i : -1, an: G.A[oi], ach: [] };
			Object.keys(byMat).forEach(function (mn) {
				var L = byMat[mn]; if (!L.pos.length) return;
				var geo = new T.BufferGeometry(), pos = new Float32Array(L.pos);
				geo.setAttribute('position', new T.BufferAttribute(pos, 3));
				if (L.nrm.length === L.pos.length) geo.setAttribute('normal', new T.BufferAttribute(new Float32Array(L.nrm), 3)); else geo.computeVertexNormals();
				var ud = gMat(mn, G);
				if (ud.hide) return;
				/* развёртка: из файла «— 3D.uv» (как в БАЗИСе), где её нет — по месту (панель — по рамке и направлению текстуры) */
				var uvA = gUV(pos, geo.attributes.normal.array, it, o.box, ud.L);
				if (G.uvIx && ud.url) {
					var R = BM.glbmat.triUV(G.uvIx, pos, mn);
					for (var t = 0; t < R.n; t++) if (R.ok[t]) for (var z = 0; z < 6; z++) uvA[t * 6 + z] = R.uv[t * 6 + z];
					G.uvHits = (G.uvHits || 0) + R.hits; G.uvTris = (G.uvTris || 0) + R.n;
				}
				geo.setAttribute('uv', new T.BufferAttribute(uvA, 2));
				var L = ud.L, mat = new T.MeshStandardMaterial({ color: ud.col.clone(), roughness: L.rough, metalness: L.metal, side: T.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
				mat.userData = ud;
				if (ud.glass) { mat.transparent = true; mat.opacity = ud.op; mat.depthWrite = false; }
				var me = new T.Mesh(geo, mat);
				if (ud.glass) me.renderOrder = 2;
				me.castShadow = !ud.glass; me.receiveShadow = true;
				me.userData.gob = rec; g.add(me); rec.meshes.push(me);
				if (it) { var ln = new T.LineSegments(new T.EdgesGeometry(geo, 28), new T.LineBasicMaterial({ color: style.line, transparent: true, opacity: style.lineOp })); g.add(ln); (rec.lines = rec.lines || []).push(ln); (rec.lps = rec.lps || []).push(mkLp(ln)); }
			});
			return rec;
		}
		api.setGlb = function (G) {
			for (var i = 0; i < gobs.length; i++) if (gobs[i]) { root.remove(gobs[i].g); clearGroup(gobs[i].g); }
			gobs = []; gMats = {}; G3 = G || null; state.ohid = {}; state.osel = {}; AN.prog = {}; AN.tgt = {};
			if (G3 && G3.uv && !G3.uvIx) { try { G3.uvIx = BM.glbmat.index(G3.uv); } catch (eU) { G3.uvIx = null; } }
			if (G3) for (i = 0; i < G3.O.objs.length; i++) { if (!G3.O.objs[i].geo.length) { gobs.push(null); continue; } var r = buildGob(G3, i); gobs.push(r.meshes.length ? r : null); if (r.meshes.length) root.add(r.g); }
			LT.strips = null; LT.glowMeshes = [];
			UB = null; rechain();
			buildBdims(); applyTransforms(); applyLook(); rebuildDims(); LT.box = null; buildLights(); need = true;
			return { objs: gobs.filter(Boolean).length };
		};
		api.glb = function () { return !!G3; };
		/* анимация блоков из БАЗИСа (BM.anim): двойной щелчок — ближайший блок с анимацией, кнопка — все */
		var AN = { prog: {}, tgt: {}, last: 0, wait: {} };
		/* активные анимации: свои группы (1.19, BM.animUser) или из БАЗИСа (BM.anim) — один и тот же ход prog / tgt */
		var UB = null;
		function anB() { return UB && UB.n ? UB : (!UB && G3 && G3.B && G3.B.n ? G3.B : null); }
		function chOf(oi) { var B = anB(); if (!B || oi < 0 || oi === undefined) return []; return B.user ? BM.animUser.chain(B, G3 ? G3.O : null, oi) : BM.anim.chain(B, G3.O, oi); }
		function matOf(oi, ch) { var B = anB(); if (!B || !ch || !ch.length) return null; return B.user ? BM.animUser.matrix(B, ch, AN.prog) : BM.anim.matrix(B, G3.O, oi, AN.prog, ch); }
		function grpOf(oi) { var B = anB(); if (!B) return []; return B.user ? BM.animUser.group(B, G3 ? G3.O : null, oi) : BM.anim.group(B, G3.O, oi); }
		function rechain() {
			for (var i = 0; i < gobs.length; i++) if (gobs[i]) gobs[i].ach = chOf(i);
			for (i = 0; i < items.length; i++) items[i].uch = UB && UB.item ? chOf(i) : [];
			if (BD) BD.list.forEach(function (q) { q.ach = chOf(q.o); });
			if (LT && LT.glow) LT.glow.forEach(function (q) { q.ach = chOf(q.o); });
		}
		/* свои группы: null — анимации из БАЗИСа (как раньше); { user: 1, … } — свои. Ход групп с тем же id сохраняется. */
		api.setUserAnim = function (R) {
			var old = anB(), keep = {};
			if (old && old.user) Object.keys(AN.prog).forEach(function (k) { if (old.L[k]) keep[old.L[k].id] = AN.prog[k]; });
			UB = R || null; AN.prog = {}; AN.tgt = {}; AN.wait = {}; AN.last = 0;
			if (UB) UB.L.forEach(function (r) { if (keep[r.id] !== undefined) AN.prog[r.k] = keep[r.id]; });
			rechain(); applyTransforms(); rebuildDims();
		};
		api.userAnim = function () { return UB; };
		/* ход групп вручную (ползунок): map { k: 0…1 }; движение по ним останавливается */
		api.animSet = function (map) { Object.keys(map).forEach(function (k) { AN.prog[k] = Math.max(0, Math.min(1, map[k])); delete AN.tgt[k]; delete AN.wait[k]; }); applyTransforms(); if (opt.onAnim) opt.onAnim(); };
		api.animProg = function () { return AN.prog; };
		api.animPause = function () { AN.tgt = {}; AN.wait = {}; AN.last = 0; AN.was = 0; rebuildDims(); need = true; if (opt.onAnim) opt.onAnim(); };
		/* к цели: list — номера групп, v — 0 / 1; с задержкой групп (своих) */
		api.animGo = function (list, v) { var B = anB(); if (!B || !list.length) return false; list.forEach(function (k) { if (B.user && B.L[k] && Math.abs((AN.prog[k] || 0) - (v ? 1 : 0)) > 1e-4) AN.wait[k] = B.L[k].delay; }); return anGo(list, v, false); };
		api.animMoving = function () { return Object.keys(AN.tgt).some(function (k) { return Math.abs((AN.prog[k] || 0) - AN.tgt[k]) > 1e-4; }); };
		api.anim = function () { var B = anB(); if (!B) return null; var all = B.L.map(function (a) { return a.k; }); return { n: B.n, open: BM.anim.isOpen(AN.prog, all.filter(function (k) { return B.L[k].big; }).length ? all.filter(function (k) { return B.L[k].big; }) : all, AN.tgt), moving: Object.keys(AN.tgt).some(function (k) { return Math.abs((AN.prog[k] || 0) - AN.tgt[k]) > 1e-4; }) }; };
		function anGo(list, v, now) { var B = anB(); if (!B || !list.length) return false; list.forEach(function (k) { AN.tgt[k] = v ? 1 : 0; if (now) AN.prog[k] = v ? 1 : 0; }); AN.last = 0; applyTransforms(); return true; }
		/* открыть или закрыть то, что открывается щелчком по объекту j 3D-файла; false — у объекта нет анимации */
		api.animToggle = function (j) { var B = anB(); if (!B) return false; var L = grpOf(j); if (!L.length) return false; var big = L.filter(function (k) { return B.L[k].big; }); return anGo(L, !BM.anim.isOpen(AN.prog, big.length ? big : L, AN.tgt)); };
		api.animAll = function (v, now) { var B = anB(); if (!B) return false; return anGo(B.L.map(function (a) { return a.k; }), v, now); };
		api.setObjState = function (hidden, sel) { state.ohid = hidden || {}; state.osel = sel || {}; applyLook(); rebuildDims(); };
		/* точка объекта 3D-файла на экране — для проверок */
		api.projectObj = function (j) { placeCamera(); var q = gobs[j]; if (!q) return null; root.updateMatrixWorld(true); var b = new T.Box3().expandByObject(q.g), c = new T.Vector3(); b.getCenter(c); var s2 = project(c); return [s2[0], s2[1]]; };
		api.uvInfo = function () { return G3 ? { hits: G3.uvHits || 0, tris: G3.uvTris || 0, file: !!G3.uvIx } : null; };
		api.gobInfo = function () { var n = 0, t = 0, tex = 0; gobs.forEach(function (g) { if (!g) return; n++; g.meshes.forEach(function (m) { t += m.geometry.attributes.position.count / 3; if (m.material.map) tex++; }); }); return { objs: n, tris: t, textured: tex }; };
		api.gobVisible = function () { var n = 0; gobs.forEach(function (g) { if (g && g.g.visible) n++; }); return n; };

		/* текстура материала (из раздела «База»): картинка по пласти, ~1 м на повтор; без файла — цвет */
		var texCache = {}, TEX_MM = 1000, TEXP = 0;
		api.texPending = function () { return TEXP; };            /* сколько текстур ещё грузится — снимок для листа ждёт их */
		function texOf(name) {
			var url = opt.texUrl ? opt.texUrl(name) : '';
			if (!url) return null;
			if (!texCache[url]) {
				TEXP++; var t = new T.TextureLoader().load(url, function (tt) { TEXP--; var im = tt.image; if (im && im.width) tt.repeat.set(1 / TEX_MM, 1 / (TEX_MM * im.height / im.width)); need = true; }, undefined, function () { TEXP--; });
				t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(1 / TEX_MM, 1 / TEX_MM); if ('colorSpace' in t) t.colorSpace = T.SRGBColorSpace;
				texCache[url] = t;
			}
			return texCache[url];
		}
		function texByUrl(url) {
			if (!texCache[url]) {
				TEXP++; var t = new T.TextureLoader().load(url, function () { TEXP--; need = true; }, undefined, function () { TEXP--; });
				t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(1 / TEX_MM, 1 / TEX_MM); if ('colorSpace' in t) t.colorSpace = T.SRGBColorSpace;
				texCache[url] = t;
			}
			return texCache[url];
		}
		/* текстура модели из 3D-файла: развёртка уже в долях картинки (шаг материала учтён) */
		var glbTexCache = {};
		function glbTex(url) {
			if (!glbTexCache[url]) {
				TEXP++; var t = new T.TextureLoader().load(url, function () { TEXP--; need = true; }, undefined, function () { TEXP--; });
				t.wrapS = t.wrapT = T.RepeatWrapping; if ('colorSpace' in t) t.colorSpace = T.SRGBColorSpace;
				t.anisotropy = renderer.capabilities.getMaxAnisotropy();
				glbTexCache[url] = t;
			}
			return glbTexCache[url];
		}
		api.retex = function () { applyLook(); };
		/* 3D-шаги сборки (1.20): сдвиг объектов 3D-файла (o) и деталей (i), мм в осях модели — деталь «въезжает» на место;
		   наклон всей модели вокруг оси «к зрителю» (90° — корпус лежит на левом боку) */
		var OFF = { o: {}, i: {} };
		api.setObjOffsets = function (o, i) { OFF = { o: o || {}, i: i || {} }; applyTransforms(); };
		api.setTilt = function (deg) { root.matrix.copy(toView).premultiply(new T.Matrix4().makeRotationZ((deg || 0) * Math.PI / 180)); root.matrixWorldNeedsUpdate = true; applyTransforms(); };
		/* свой вид (1.19.1): m — материалы по имени (настройки программы), o — объекты 3D-файла, i — детали (из проекта);
		   { t: прозрачность %, c: оттенок, g: блеск % } — см. BM.glbmat.adjust */
		var LK = { m: {}, o: {}, i: {} };
		api.setLooks = function (m, o, i) { LK = { m: m || {}, o: o || {}, i: i || {} }; applyLook(); };
		api.lookOf = function (name, oi) { var L = G3 ? gMat(name, G3).L : null; if (!L) return null; return BM.glbmat.adjust(L, BM.glbmat.merge(LK.m[name], oi >= 0 ? LK.o[oi] : null)); };
		/* как нарисован объект 3D-файла — для проверок: [{ n: материал, op, tr, col }] */
		api.meshLook = function (oi) { var q = gobs[oi]; if (!q) return null; return q.meshes.map(function (me) { var m = me.material; return { n: m.userData.name, op: m.opacity, tr: m.transparent, col: '#' + m.color.getHexString(), rough: m.roughness }; }); };
		/* материалы объекта 3D-файла (по площади — сначала больший) */
		api.objMats = function (oi) { var q = gobs[oi]; if (!q) return []; return q.meshes.map(function (me) { return { n: me.material.userData.name, a: me.geometry.attributes.position.count }; }).sort(function (a, b) { return b.a - a.a; }).map(function (x) { return x.n; }); };
		/* окружение для отражений и проход качества — по требованию */
		var studio = null, post = null;
		api.setLook = function (look) { state.look = look === 'shine' ? 'shine' : 'plain'; applyLook(); };
		api.setQuality = function (q) { state.quality = q === 'normal' ? 'normal' : 'high'; need = true; };

		/* ------------------------------ вид и стиль ----------------------------- */
		function applyLook() {
			host.style.background = 'linear-gradient(' + style.bg[0] + ', ' + style.bg[1] + ')';
			host.classList.toggle('v3dDark', !!style.darkUi);
			hemi.intensity = style.hemi * Math.PI; sun.intensity = style.dir * Math.PI;
			var shine = state.look === 'shine' && !!G3;
			if (G3) { hemi.intensity = style.hemi * (shine ? 1.05 : 1.6); sun.intensity = style.dir * (shine ? 2.4 : 2.6); }     // модель из файла: материалы с бликом — свой свет, цвета как в БАЗИСе
			var lb = BM.light3d && typeof LT !== 'undefined' && LT ? BM.light3d.base(LT.cfg) : null;                                                              // «Вечер» — общий свет приглушён
			if (lb) { hemi.intensity *= lb.hemi; sun.intensity *= lb.cam; if (lb.bg) host.style.background = 'linear-gradient(' + lb.bg[0] + ', ' + lb.bg[1] + ')'; host.classList.toggle('v3dNight', lb.night); }
			if (shine && !studio && BM.post3d) { try { studio = BM.post3d.studio(renderer); } catch (eS) { studio = null; } }
			scene.environment = shine ? studio : null;
			var VM = state.mode, WIRE = VM === 'wire', THIN = VM === 'thin', NOH = VM === 'nohid' || THIN, XR = xrayOn(), LON = VM !== 'tex', WHITE = new T.Color('#f3f3f0');
			lpMat.color.set(style.line); lpMat.opacity = Math.min(0.5, style.lineOp * 0.55);
			for (var i = 0; i < items.length; i++) {
				var r = items[i], vis = !state.hidden[i] && !G3, sel = !!state.sel[i], hov = state.hover === i;
				r.g.visible = !state.hidden[i];
				r.mesh.visible = vis;
				var tx = style.colorBy === 'mat' && !NOH ? texOf(r.it.mat) : null, lk = BM.glbmat ? BM.glbmat.merge(LK.m[r.it.mat], LK.i[i]) : null;
				if ((r.mFace.map || null) !== tx) { r.mFace.map = tx; r.mFace.needsUpdate = true; }
				var col = NOH ? WHITE.clone() : (lk && lk.c ? new T.Color(lk.c) : (tx ? new T.Color('#ffffff') : r.col.clone()));
				if (sel) col.lerp(new T.Color(style.sel), 0.55); else if (hov) col.lerp(new T.Color(style.sel), 0.2);
				r.mFace.color.copy(col); r.mSide.color.copy(col).multiplyScalar(style.side);
				var ghost = XR, wire = WIRE;
				var tr0 = r.mFace.transparent;
				r.mFace.transparent = r.mSide.transparent = ghost || wire;
				r.mFace.opacity = r.mSide.opacity = wire ? (sel ? 0.25 : 0) : (ghost ? (sel ? 0.75 : style.ghost) : 1);
				r.mFace.depthWrite = r.mSide.depthWrite = !(ghost || wire);
				if (lk && lk.t >= 0.5 && !ghost && !wire && !NOH) { r.mFace.transparent = r.mSide.transparent = true; r.mFace.opacity = r.mSide.opacity = Math.max(0.03, 1 - lk.t / 100); r.mFace.depthWrite = r.mSide.depthWrite = false; }
				if (r.mFace.transparent !== tr0) r.mFace.needsUpdate = r.mSide.needsUpdate = true;      // без этого шейдер остаётся «непрозрачным» и прозрачные виды не работают
				var tmode = ghost || wire, lon = vis && ((LON && state.outline) || wire || sel || NOH);
				r.lines.visible = lon && !tmode; r.lv.visible = r.lh.visible = lon && tmode; r.lp.visible = vis && THIN;
				r.lines.material.color.set(sel ? style.sel : style.line); r.lv.material.color.copy(r.lines.material.color); r.lh.material.color.copy(r.lines.material.color);
				r.lines.material.opacity = sel ? 1 : (wire ? 1 : style.lineOp);
				r.lv.material.opacity = sel ? 1 : (wire ? 1 : style.lineOp);
				r.lh.material.opacity = sel ? 0.55 : (wire ? 0.4 : style.lineOp * 0.38);      /* скрытые рёбра — бледно (вариант Б) */
				if (r.deco) { r.deco.visible = state.holes; r.deco.material.color.set(style.hole); }
				if (r.hw) r.hw.visible = state.holes && (THIN || WIRE);      /* контуры отверстий насквозь — виды 3–5 */
				if (r.band) { r.band.visible = vis && state.band && !wire; r.band.material.color.set(style.band); }
				if (r.grv) { r.grv.visible = vis && state.grooves && !wire; r.grv.material.color.set(style.groove); }
			}
			for (i = 0; i < gobs.length; i++) {
				var go = gobs[i]; if (!go) continue;
				var gs = !!state.osel[i], gw = WIRE, gg = XR && go.it >= 0;
				go.g.visible = !state.ohid[i] && (go.it >= 0 || state.furn);
				for (var gm = 0; gm < go.meshes.length; gm++) {
					var me2 = go.meshes[gm], M2 = me2.material, ud = M2.userData, gx = style.colorBy === 'mat' && ud.url && !NOH ? glbTex(ud.url) : null;
					var lk2 = BM.glbmat.merge(LK.m[ud.name], LK.o[i]), Lx = lk2 ? BM.glbmat.adjust(ud.L, lk2) : ud.L, gl = Lx.glass, tr0 = M2.transparent;
					M2.envMapIntensity = shine ? Lx.env : 0; M2.roughness = shine || Lx.gloss ? Lx.rough : Math.max(Lx.rough, 0.6); M2.metalness = shine ? Lx.metal : Lx.metal * 0.4;
					if ((M2.map || null) !== gx) { M2.map = gx; M2.needsUpdate = true; }
					var base = Lx.tint ? new T.Color().setRGB(Lx.color[0], Lx.color[1], Lx.color[2], T.SRGBColorSpace) : ud.col;
					var gc = gx && !Lx.tint ? new T.Color('#ffffff') : (style.colorBy === 'mono' && !gl && !Lx.tint ? new T.Color(style.mono).lerp(ud.col, style.tint) : base.clone());
					if (NOH && !gl) gc = go.it >= 0 ? WHITE.clone() : new T.Color('#efe7da');
					if (gs) gc.lerp(new T.Color(style.sel), 0.55);
					M2.color.copy(gc);
					if (gl) { M2.transparent = true; M2.opacity = gw ? (gs ? 0.25 : 0) : Lx.opacity; M2.depthWrite = false; }
					else { M2.transparent = gg || gw; M2.opacity = gw ? (gs ? 0.25 : 0) : (gg ? (gs ? 0.75 : style.ghost) : 1); M2.depthWrite = !(gg || gw); }
					if (M2.transparent !== tr0) M2.needsUpdate = true;
					me2.renderOrder = gl ? 2 : 0; me2.castShadow = !gl;
				}
				var gl2 = (LON && state.outline) || gw || gs || NOH;
				if (go.it < 0 && gl2 && go.g.visible && !go.fl) go.fl = furnLines(go);
				var gls = (go.lines || []).concat(go.fl || []);
				gls.forEach(function (ln) { ln.visible = gl2; ln.material.color.set(gs ? style.sel : style.line); ln.material.opacity = gs || gw ? 1 : style.lineOp; });
				(go.lps || []).forEach(function (q) { q.visible = THIN && go.g.visible; });
			}
			/* крепёж и в прозрачных видах виден чётко: рисуется поверх панелей */
			var xr = XR || WIRE || THIN;
			for (i = 0; i < fx.length; i++) {
				var fq = fx[i]; fq.g.visible = state.furn && !state.hidden[fq.item];
				if (fq.f.kind === 'conf') fq.mat.color.set((THIN || WIRE) ? '#e8701a' : fq.f.col);      /* оцинкованный в видах с материалами, оранжевый линейными — как крепёж в БАЗИСе */
				if (fq.mat.transparent !== xr) { fq.mat.transparent = xr; fq.mat.needsUpdate = true; }
				fq.mat.depthTest = !xr; fq.mat.depthWrite = !xr;
				fq.g.children.forEach(function (me) { me.renderOrder = xr ? 6 : 0; });
			}
			for (i = 0; i < sols.length; i++) {
				var q = sols[i]; if (!q) continue;
				var ss = !!state.ssel[i], gh = false, wr = WIRE;
				q.g.visible = state.furn && !state.shid[i];
				q.mat.color.copy(ss ? q.col.clone().lerp(new T.Color(style.sel), 0.55) : (NOH ? q.col.clone().lerp(WHITE, 0.8) : q.col));
				var qt0 = q.mat.transparent; q.mat.transparent = gh || wr; if (q.mat.transparent !== qt0) q.mat.needsUpdate = true; q.mat.opacity = wr ? (ss ? 0.25 : 0) : (gh ? (ss ? 0.75 : style.ghost) : 1); q.mat.depthWrite = !(gh || wr);
				q.lines.visible = (LON && state.outline) || wr || ss || NOH; q.lp.visible = THIN && q.g.visible;
				q.lines.material.color.set(ss ? style.sel : style.line); q.lines.material.opacity = ss || wr ? 1 : style.lineOp * 0.8;
			}
			need = true;
		}
		/* линии рёбер тел фурнитуры из 3D-файла: строятся при первом показе в видах с линиями */
		function furnLines(go) {
			var out = [];
			go.lps = go.lps || [];
			go.meshes.forEach(function (me) {
				var g = me.geometry; if (!g || !g.attributes.position || g.attributes.position.count > 60000) return;
				var ln = new T.LineSegments(new T.EdgesGeometry(g, 28), new T.LineBasicMaterial({ color: style.line, transparent: true, opacity: style.lineOp }));
				ln.matrixAutoUpdate = false; ln.matrix.copy(me.matrix); ln.visible = false;
				if (me.parent) me.parent.add(ln);
				go.lps.push(mkLp(ln)); out.push(ln);
			});
			return out;
		}
		api.setStyle = function (name) {
			style = V.STYLES[name] || style;
			for (var i = 0; i < items.length; i++) items[i].col = colorOfItem(items[i].it);
			applyLook(); rebuildDims();
		};
		api.style = function () { return style; };
		api.set = function (key, val) {
			if (key === 'mode') { if (val === 'solid') { val = 'texl'; state.xray = false; } else if (val === 'ghost') { val = 'texl'; state.xray = true; } }
			if (key === 'mode' && (val === 'nohid' || val === 'thin' || val === 'wire')) state.xray = false;
			if (key === 'xray' && val && state.mode !== 'tex' && state.mode !== 'texl') return;
			if (state[key] === val) return;
			state[key] = val;
			if (key === 'explode' || key === 'open' || key === 'scope') { applyTransforms(); rebuildDims(); }
			else if (key === 'dims') rebuildDims();
			else if (key === 'bdims') buildBdims();
			else if (key === 'tool') { pendingA = null; canvas.style.cursor = val === 'ruler' ? 'crosshair' : ''; }
			applyLook();
		};
		api.get = function (key) { return state[key]; };

		var mT = new T.Matrix4(), mR = new T.Matrix4(), mA = new T.Matrix4(), mB = new T.Matrix4();
		function applyTransforms() {
			var ex = M.explode(sc, state.explode, state.scope);
			for (var i = 0; i < items.length; i++) {
				var r = items[i], it = r.it, mv = M.moveAt(it, state.open), m = r.g.matrix;
				m.copy(r.base);
				if (mv && mv.shift) m.premultiply(mT.makeTranslation(mv.shift[0], mv.shift[1], mv.shift[2]));
				else if (mv) {
					mA.makeTranslation(-mv.p[0], -mv.p[1], -mv.p[2]); mR.makeRotationAxis(v3(mv.a).normalize(), mv.ang); mB.makeTranslation(mv.p[0], mv.p[1], mv.p[2]);
					m.premultiply(mA).premultiply(mR).premultiply(mB);
				}
				if (ex[i][0] || ex[i][1] || ex[i][2]) m.premultiply(mT.makeTranslation(ex[i][0], ex[i][1], ex[i][2]));
				if (r.uch && r.uch.length) { var um = matOf(i, r.uch); if (um) m.premultiply(mA.fromArray(um)); }
				if (OFF.i[i]) m.premultiply(mT.makeTranslation(OFF.i[i][0], OFF.i[i][1], OFF.i[i][2]));
				r.g.matrixWorldNeedsUpdate = true;
			}
			/* объекты 3D-файла: панель — как её деталь, фурнитура — со своей панелью или блоком */
			for (i = 0; i < gobs.length; i++) {
				var gq = gobs[i]; if (!gq) continue;
				var an = gq.an || { a: -1, grp: [] };
				if (an.a >= 0 && items[an.a]) { var ar2 = items[an.a]; gq.g.matrix.copy(ar2.g.matrix).multiply(mA.copy(ar2.base).invert()); }
				else if (an.grp.length) { var sv2 = M.solidShift({ anchor: -1, grp: an.grp }, ex); gq.g.matrix.makeTranslation(sv2[0], sv2[1], sv2[2]); }
				else gq.g.matrix.identity();
				if (gq.ach && gq.ach.length) { var am = matOf(gq.o, gq.ach); if (am) gq.g.matrix.multiply(mA.fromArray(am)); }
				if (OFF.o[i]) gq.g.matrix.premultiply(mT.makeTranslation(OFF.o[i][0], OFF.o[i][1], OFF.o[i][2]));
				gq.g.matrixWorldNeedsUpdate = true;
			}
			for (i = 0; i < fx.length; i++) { var fr = items[fx[i].item]; fx[i].g.matrix.copy(fr.g.matrix).multiply(mA.copy(fr.base).invert()); fx[i].g.matrixWorldNeedsUpdate = true; }
			/* фурнитура едет со своей панелью (ручка — с фасадом), иначе — со средним сдвигом блока */
			for (i = 0; i < sols.length; i++) {
				var q = sols[i]; if (!q) continue;
				if (q.s.anchor >= 0) { var ar = items[q.s.anchor]; q.g.matrix.copy(ar.g.matrix).multiply(mA.copy(ar.base).invert()); }
				else { var sv = M.solidShift(q.s, ex); q.g.matrix.makeTranslation(sv[0], sv[1], sv[2]); }
				q.g.matrixWorldNeedsUpdate = true;
			}
			/* размеры из БАЗИСа едут со своим блоком (ящик, дверь); детали разнесены — не показываются */
			for (i = 0; BD && i < BD.list.length; i++) {
				var bq = BD.list[i], bm = bq.ach && bq.ach.length ? matOf(bq.o, bq.ach) : null;
				if (bm) bq.g.matrix.fromArray(bm); else bq.g.matrix.identity();
				bq.g.matrixWorldNeedsUpdate = true;
			}
			if (BD && BD.g) BD.g.visible = !(state.explode > 0);
			if (typeof LT !== 'undefined' && LT && LT.glow.length) moveGlow();
			root.updateMatrixWorld(true);
			need = true;
		}

		/* ---------------- размеры, проставленные в БАЗИСе (скрипт 1.10 → model.dims) ----------------
		   Линия размера, стрелки и число — как в БАЗИСе; привязка к объекту 3D-файла (BM.anim.bindDims). */
		var BD = { g: null, list: [] };
		function buildBdims() {
			if (BD.g) { root.remove(BD.g); clearGroup(BD.g); }
			BD.g = null; BD.list = []; dropLabels('bdim');
			var src = G3 && G3.dims && G3.dims.length ? G3.dims : null;
			if (!state.bdims || !src) { need = true; return; }
			BD.g = new T.Group(); BD.g.name = 'bmBazisDims'; root.add(BD.g);
			var mat = new T.LineBasicMaterial({ color: style.dimCol || 0x1565c0, depthTest: false, transparent: true });
			BM.anim.bindDims(G3.O, src).forEach(function (r) {
				var d = r.d, a = v3(d.a), b = v3(d.b), u = b.clone().sub(a), L = u.length(); if (!(L > 0.5)) return;
				u.normalize();
				var y = d.y ? v3(d.y).normalize() : new T.Vector3(0, 1, 0), ts = Number(d.ts) || 20, s = Math.min(ts * 0.6, L / 4), w = s * 0.32, pos = [];
				var P = function (p) { pos.push(p.x, p.y, p.z); };
				P(a); P(b);
				[[a, 1], [b, -1]].forEach(function (q) { var t = q[0].clone().addScaledVector(u, s * q[1]); P(q[0]); P(t.clone().addScaledVector(y, w)); P(q[0]); P(t.clone().addScaledVector(y, -w)); });
				var geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
				var ln = new T.LineSegments(geo, mat); ln.renderOrder = 5;
				var g = new T.Group(); g.matrixAutoUpdate = false; g.add(ln); BD.g.add(g);
				var mid = a.clone().add(b).multiplyScalar(0.5).addScaledVector(y, ts * 0.75 + (Number(d.to) || 0)), wp = new T.Vector3();
				var oi = r.o, rec = { g: g, o: oi, ach: chOf(oi) };
				var txt = d.tx || String(Math.round((Number(d.v) || L) * 10) / 10);
				addLabel('bdim', txt, function () {
					if (!BD.g || !BD.g.visible) return null;
					if (oi >= 0 && gobs[oi] && !gobs[oi].g.visible) return null;
					return wp.copy(mid).applyMatrix4(g.matrixWorld);
				});
				BD.list.push(rec);
			});
			applyTransforms();
		}
		api.bdimCount = function () { return G3 && G3.dims ? G3.dims.length : 0; };
		api.bdimTexts = function () { return labelList.filter(function (L) { return L.cls === 'bdim' && L.vis && L.el.style.display !== 'none'; }).map(function (L) { return L.text; }); };

		/* ---------------- источники света (BM.light3d): солнце, лампы, ленты; «День / Вечер» ---------------- */
		var LT = { cfg: null, g: null, box: null, marks: false, words: null, shadows: '4', strips: null, glow: [], glowMeshes: [] };
		/* подсветка из модели: рассеиватели светятся (emissive), свет — группами, которые едут со своим блоком */
		function buildGlow() {
			LT.glow.forEach(function (q) { BM.light3d.drop(q.g); });
			LT.glow = []; LT.spots = [];
			LT.glowMeshes.forEach(function (m) { m.material.emissive.setRGB(0, 0, 0); if (m.userData.op0 !== undefined) { m.material.opacity = m.userData.op0; delete m.userData.op0; } m.castShadow = !m.material.transparent; });
			LT.glowMeshes = [];
			if (!G3) { LT.strips = null; return 0; }
			if (!LT.strips) LT.strips = BM.light3d.findGlow(G3.O, LT.words || undefined);
			var gc = LT.cfg && LT.cfg.glow;
			if (!gc || !gc.on || !LT.strips.length) return 0;
			var maxSh = Math.max(0, Math.min(12, (renderer.capabilities.maxTextures || 16) - 6));
			var r = BM.light3d.buildGlow(T, LT.strips, gc, { shadows: LT.shadows, maxShadows: maxSh, cfg: LT.cfg }), col = BM.light3d.glowColor(gc), e = Math.min(1.6, 0.35 + gc.br / 100 * 0.75);
			r.list.forEach(function (q) {
				q.ach = chOf(q.o);
				root.add(q.g); LT.glow.push(q);
				/* свечение рассеивателя; детали блока подсветки (профиль, лента) тень не бросают — иначе закрыли бы свет */
				for (var j = 0; j < gobs.length; j++) {
					if (!gobs[j]) continue;
					var inB = false; for (var u = j; u >= 0 && u !== undefined; u = G3.O.objs[u].up) if (u === q.blk) { inB = true; break; }
					if (!inB) continue;
					var isD = false; for (u = j; u >= 0 && u !== undefined; u = G3.O.objs[u].up) if (u === q.o) { isD = true; break; }
					gobs[j].meshes.forEach(function (m) { m.castShadow = false; if (isD) { m.material.emissive.setRGB(col[0] * e, col[1] * e, col[2] * e); if (m.material.transparent && m.material.opacity < 0.9) { m.userData.op0 = m.material.opacity; m.material.opacity = 0.9; } } LT.glowMeshes.push(m); });      // прозрачный рассеиватель светится — почти непрозрачным
				}
			});
			moveGlow();
			/* свет ленты — только внутри её модуля: всем материалам — проверка габарита модуля */
			LT.spots = [];
			LT.glow.forEach(function (q) { q.g.children.forEach(function (o) { if (o.isSpotLight) LT.spots.push(o); }); });
			scene.traverse(function (o) { if (o.isMesh) [].concat(o.material).forEach(function (m) { BM.light3d.maskMat(T, m); }); });
			return r.shadows;
		}
		function moveGlow() {
			for (var i = 0; i < LT.glow.length; i++) {
				var q = LT.glow[i], m = q.ach && q.ach.length ? matOf(q.o, q.ach) : null;
				if (m) q.g.matrix.fromArray(m); else q.g.matrix.identity();
				q.g.matrixWorldNeedsUpdate = true;
			}
		}
		function buildLights() {
			if (!BM.light3d) return;
			if (LT.g) { BM.light3d.drop(LT.g); LT.g = null; }
			var glowSh = buildGlow();
			var c = LT.cfg, want = c && c.list && c.list.length;
			if (want && !LT.box) {
				root.updateMatrixWorld(true);
				var bx = new T.Box3();
				for (var i = 0; i < gobs.length; i++) if (gobs[i]) bx.expandByObject(gobs[i].g);
				if (!G3) for (i = 0; i < items.length; i++) bx.expandByObject(items[i].g);
				LT.box = bx.isEmpty() ? null : bx;
			}
			var r = want ? BM.light3d.build(T, c, LT.box) : null;
			if (r) { LT.g = r.g; scene.add(r.g); setMarks(); }
			var sh = !!(r && r.shadows) || glowSh > 0;
			if (renderer.shadowMap.enabled !== sh) {
				renderer.shadowMap.enabled = sh; renderer.shadowMap.type = T.PCFShadowMap;      // мягкость — размытием края (shadow.radius)
				scene.traverse(function (o) { if (o.material) [].concat(o.material).forEach(function (m) { m.needsUpdate = true; }); });
			}
			applyLook();
			need = true;
		}
		function setMarks() { if (LT.g) LT.g.traverse(function (o) { if (o.userData.bmLamp) o.visible = LT.marks; }); need = true; }
		/* opt: { words: { diff, led, prof }, shadows: '0' | '4' | 'all' } — из «Настройки → Модель» */
		api.setLight = function (c, opt) {
			if (opt) { var wk = JSON.stringify(opt.words || null); if (wk !== JSON.stringify(LT.words)) LT.strips = null; LT.words = opt.words || null; LT.shadows = opt.shadows === undefined ? '4' : String(opt.shadows); }
			LT.cfg = c && BM.light3d ? BM.light3d.norm(c) : null; buildLights();
		};
		/* шарик лампы виден, только пока открыта панель «Свет»; на снимке — нет */
		api.setLampMarks = function (v) { LT.marks = !!v; setMarks(); };
		api.glowInfo = function () { if (G3 && !LT.strips && BM.light3d) LT.strips = BM.light3d.findGlow(G3.O, LT.words || undefined); return { found: LT.strips ? LT.strips.length : 0, on: LT.glow.length, lights: LT.glow.reduce(function (t, q) { var n = 0; q.g.traverse(function (o) { if (o.isLight) n++; }); return t + n; }, 0), shadows: LT.glow.reduce(function (t, q) { var n = 0; q.g.traverse(function (o) { if (o.isLight && o.castShadow) n++; }); return t + n; }, 0), dirs: (LT.strips || []).map(function (s) { return s.d; }), masked: (LT.spots || []).filter(function (o) { return !!o.userData.bmMod; }).length, radius: (function () { var r = 0; scene.traverse(function (o) { if (o.isLight && o.castShadow) r = Math.max(r, o.shadow.radius); }); return r; })() }; };
		api.lightBox = function () { if (!LT.box) { root.updateMatrixWorld(true); var bx = new T.Box3(); for (var i = 0; i < gobs.length; i++) if (gobs[i]) bx.expandByObject(gobs[i].g); if (!G3) for (i = 0; i < items.length; i++) bx.expandByObject(items[i].g); LT.box = bx.isEmpty() ? null : bx; } return LT.box ? { min: LT.box.min.toArray(), size: LT.box.getSize(new T.Vector3()).toArray() } : null; };
		api.lightInfo = function () { var n = 0, mk = 0; if (LT.g) LT.g.traverse(function (o) { if (o.isLight) n++; if (o.userData.bmLamp && o.visible) mk++; }); return { lights: n, marks: mk, shadows: renderer.shadowMap.enabled, night: !!(LT.cfg && LT.cfg.mode === 'night'), hemi: hemi.intensity, cam: sun.intensity }; };

		/* видимость и выделение: множества номеров панелей */
		api.setHidden = function (set, solSet) { state.hidden = set || {}; if (solSet) state.shid = solSet; applyLook(); rebuildDims(); };
		api.setSelected = function (set, solSet) { state.sel = set || {}; state.ssel = solSet || {}; applyLook(); };
		api.solids = function () { return sols.filter(Boolean).length; };
		api.items = function () { return sc ? sc.items : []; };

		/* ------------------------------ камера --------------------------------- */
		function boundsOfVisible() {
			var b = new T.Box3(), any = false;
			for (var i = 0; i < items.length; i++) if (!state.hidden[i] && !G3) { b.expandByObject(items[i].mesh); any = true; }
			for (i = 0; i < gobs.length; i++) if (gobs[i] && gobs[i].g.visible) { b.expandByObject(gobs[i].g); any = true; }
			if (state.furn) for (i = 0; i < sols.length; i++) if (sols[i] && !state.shid[i]) { b.expandByObject(sols[i].mesh); any = true; }
			if (!any) b.set(new T.Vector3(-500, -500, -500), new T.Vector3(500, 500, 500));
			return b;
		}
		function placeCamera() {
			var ce = Math.cos(orbit.el), dir = new T.Vector3(Math.sin(orbit.az) * ce, Math.sin(orbit.el), Math.cos(orbit.az) * ce);
			cam = orbit.persp ? camP : camO;
			var asp = W / H, hh = orbit.dist * Math.tan(camP.fov * Math.PI / 360);
			if (orbit.persp) {
				camP.aspect = asp; camP.near = Math.max(5, orbit.dist / 200); camP.far = orbit.dist * 20 + 20000;
				camP.position.copy(orbit.t).addScaledVector(dir, orbit.dist); camP.lookAt(orbit.t); camP.updateProjectionMatrix();
			} else {
				camO.left = -hh * asp; camO.right = hh * asp; camO.top = hh; camO.bottom = -hh;
				camO.position.copy(orbit.t).addScaledVector(dir, 40000); camO.lookAt(orbit.t); camO.updateProjectionMatrix();
			}
			if (sun.parent !== cam) cam.add(sun);
			cam.updateMatrixWorld(true);
		}
		var VIEWS = { front: [0, 0, false], back: [Math.PI, 0, false], left: [-Math.PI / 2, 0, false], right: [Math.PI / 2, 0, false], top: [0, Math.PI / 2 - 0.0005, false], iso: [-0.62, 0.38, false], persp: [-0.55, 0.3, true] };
		api.view = function (name) {
			var v = VIEWS[name] || VIEWS.iso;
			orbit.az = v[0]; orbit.el = v[1]; orbit.persp = v[2]; state.viewName = name;
			need = true;
		};
		function camAxes() {
			var ce = Math.cos(orbit.el), dir = new T.Vector3(Math.sin(orbit.az) * ce, Math.sin(orbit.el), Math.cos(orbit.az) * ce);
			var right = new T.Vector3(0, 1, 0).cross(dir).normalize(), upv = dir.clone().cross(right).normalize();
			return { dir: dir, right: right, up: upv };
		}
		/* Вписать видимое в окно: по габариту в плоскости экрана, а не по сфере — вытянутая кухня заполняет окно. */
		/* Вписать в окно часть модели: панели и тела по номерам */
		api.fitTo = function (its, ss, obs) {
			var b = new T.Box3(), any = false, i;
			root.updateMatrixWorld(true);
			for (i = 0; i < (obs || []).length; i++) if (gobs[obs[i]] && !state.ohid[obs[i]]) { b.expandByObject(gobs[obs[i]].g); any = true; }
			for (i = 0; i < (its || []).length; i++) if (items[its[i]] && !state.hidden[its[i]]) { b.expandByObject(items[its[i]].mesh); any = true; }
			for (i = 0; i < (ss || []).length; i++) if (sols[ss[i]] && !state.shid[ss[i]]) { b.expandByObject(sols[ss[i]].mesh); any = true; }
			if (any) fitBox(b); else api.fit();
		};
		api.fit = function () { fitBox(boundsOfVisible()); };
		function fitBox(b) {
			var c = new T.Vector3(), ax = camAxes(), mx = 0, my = 0, md = 0, pts = [b.min, b.max], p = new T.Vector3();
			b.getCenter(c);
			for (var i = 0; i < 8; i++) { p.set(pts[i & 1].x, pts[(i >> 1) & 1].y, pts[(i >> 2) & 1].z).sub(c); mx = Math.max(mx, Math.abs(p.dot(ax.right))); my = Math.max(my, Math.abs(p.dot(ax.up))); md = Math.max(md, Math.abs(p.dot(ax.dir))); }
			var t = Math.tan(camP.fov * Math.PI / 360), asp = W / H, pad = state.dims ? 1.3 : 1.1;
			orbit.t.copy(c);
			orbit.dist = Math.max(my * pad / t, mx * pad / (t * asp), 200) + (orbit.persp ? md : 0);
			need = true;
		}
		api.camera = function (c) { if (c) { orbit.az = c.az; orbit.el = c.el; orbit.dist = c.dist; orbit.persp = !!c.persp; if (c.t) orbit.t.set(c.t[0], c.t[1], c.t[2]); need = true; } return { az: orbit.az, el: orbit.el, dist: orbit.dist, persp: orbit.persp, t: [orbit.t.x, orbit.t.y, orbit.t.z] }; };

		/* ------------------------------ мышь ----------------------------------- */
		var ray = new T.Raycaster(), ptr = {}, drag = null;
		function ndc(ev) { var r = canvas.getBoundingClientRect(); return new T.Vector2((ev.clientX - r.left) / r.width * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1); }
		function pick(ev, withSols) {
			placeCamera();
			ray.setFromCamera(ndc(ev), cam);
			var list = [];
			for (var i = 0; i < items.length; i++) if (!state.hidden[i] && !G3) list.push(items[i].mesh);
			for (i = 0; i < gobs.length; i++) if (gobs[i] && gobs[i].g.visible) for (var gm = 0; gm < gobs[i].meshes.length; gm++) { var mt = gobs[i].meshes[gm].material; if (!(mt.transparent && mt.opacity === 0)) list.push(gobs[i].meshes[gm]); }
			if (withSols && state.furn) for (i = 0; i < sols.length; i++) if (sols[i] && !state.shid[i]) list.push(sols[i].mesh);
			var hit = ray.intersectObjects(list, false);
			return hit.length ? { rec: hit[0].object.userData.rec || {}, gob: hit[0].object.userData.gob, point: hit[0].point } : null;
		}
		/* номер панели под мышью (у объекта 3D-файла — его деталь) */
		function itOf(h) { if (!h) return -1; if (h.rec && h.rec.it) return h.rec.it.i; return h.gob && h.gob.it >= 0 ? h.gob.it : -1; }
		/* Точка панели (в координатах её рамки: x, y — по контуру, z — от 0 до толщины) → точка окна. Для проверок и подсказок. */
		api.projectLocal = function (i, x, y, z) { placeCamera(); var s = project(new T.Vector3(x, y, z || 0).applyMatrix4(items[i].g.matrixWorld)); return [s[0], s[1]]; };
		api.styleName = function () { for (var k in V.STYLES) if (V.STYLES[k] === style) return k; return ''; };
		api.pickAt = function (x, y) { var r = canvas.getBoundingClientRect(), h = pick({ clientX: r.left + x, clientY: r.top + y }); return itOf(h); };
		canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
		canvas.addEventListener('pointerdown', function (e) {
			canvas.setPointerCapture(e.pointerId);
			ptr[e.pointerId] = { x: e.clientX, y: e.clientY };
			var ids = Object.keys(ptr);
			if (ids.length === 2) { var a = ptr[ids[0]], b = ptr[ids[1]]; drag = { kind: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y), dist0: orbit.dist, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, moved: 9 }; return; }
			if (e.button === 0 && GZ.hs.length) {
				/* ручка оси анимации: тянется в плоскости экрана, камера не вращается */
				placeCamera(); ray.setFromCamera(ndc(e), cam);
				var hh = ray.intersectObjects(GZ.hs, false);
				if (hh.length) { var hm = hh[0].object, nrm = new T.Vector3(); cam.getWorldDirection(nrm); drag = { kind: 'gz', h: hm.userData.gzH, mesh: hm, plane: new T.Plane().setFromNormalAndCoplanarPoint(nrm, hm.position.clone()), moved: 9, button: 0 }; return; }
			}
			drag = { kind: (e.button === 0 && !e.shiftKey) ? 'rot' : 'pan', x: e.clientX, y: e.clientY, moved: 0, button: e.button };
			/* планшет: долгое касание — как правая кнопка мыши (меню детали, вид материала) */
			if (e.pointerType === 'touch') { var d0 = drag, ev0 = { clientX: e.clientX, clientY: e.clientY }; d0.lp = setTimeout(function () { if (drag === d0 && d0.moved < 4) { d0.long = 1; menuAt(ev0); } }, 550); }
		});
		function menuAt(e) {
			var h = pick(e, true);
			if (h && h.gob) { if (opt.onMenuObj) opt.onMenuObj(h.gob.o, e.clientX, e.clientY); return; }
			if (h && h.rec.sol !== undefined) { if (opt.onMenuSolid) opt.onMenuSolid(h.rec.sol, e.clientX, e.clientY); return; }
			if (opt.onMenu) opt.onMenu(itOf(h), e.clientX, e.clientY);
		}
		canvas.addEventListener('pointermove', function (e) {
			if (ptr[e.pointerId]) { ptr[e.pointerId].x = e.clientX; ptr[e.pointerId].y = e.clientY; }
			if (!drag) {
				if (e.pointerType === 'mouse' && opt.onHover) { var h = pick(e), hi = itOf(h); if (hi !== state.hover) { state.hover = hi; applyLook(); opt.onHover(hi); } }
				return;
			}
			if (drag.kind === 'pinch') {
				var ids = Object.keys(ptr); if (ids.length < 2) return;
				var a = ptr[ids[0]], b = ptr[ids[1]], d = Math.hypot(a.x - b.x, a.y - b.y), cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
				orbit.dist = Math.max(80, drag.dist0 * drag.d0 / Math.max(d, 1));
				panBy(cx - drag.cx, cy - drag.cy); drag.cx = cx; drag.cy = cy; need = true; return;
			}
			if (drag.kind === 'gz') {
				placeCamera(); ray.setFromCamera(ndc(e), cam);
				var vP = new T.Vector3();
				if (ray.ray.intersectPlane(drag.plane, vP)) { drag.mesh.position.copy(vP); drag.pos = vP.clone(); gzLine(); if (opt.onGizmo) opt.onGizmo(drag.h, fromW(vP), false); need = true; }
				return;
			}
			var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
			drag.moved += Math.abs(dx) + Math.abs(dy); drag.x = e.clientX; drag.y = e.clientY;
			if (drag.moved < 4) return;
			if (drag.kind === 'rot') { orbit.az -= dx * 0.006; orbit.el = Math.max(-1.55, Math.min(1.55, orbit.el + dy * 0.006)); state.viewName = ''; }
			else panBy(dx, dy);
			need = true;
		});
		function panBy(dx, dy) {
			var k = 2 * orbit.dist * Math.tan(camP.fov * Math.PI / 360) / H, ex = new T.Vector3(), ey = new T.Vector3(), ez = new T.Vector3();
			cam.matrixWorld.extractBasis(ex, ey, ez);
			orbit.t.addScaledVector(ex, -dx * k).addScaledVector(ey, dy * k);
		}
		function up(e) {
			delete ptr[e.pointerId];
			var d = drag; drag = Object.keys(ptr).length ? drag : null;
			if (d && d.lp) clearTimeout(d.lp);
			if (d && d.long) return;
			if (d && d.kind === 'gz') { if (d.pos && opt.onGizmo) opt.onGizmo(d.h, fromW(d.pos), true); return; }
			if (!d || d.kind === 'pinch' || d.moved >= 4) return;
			if (GZ.pick && d.button === 0) { var hp = pick(e), fn = GZ.pick; if (!hp) return; GZ.pick = null; canvas.style.cursor = ''; fn(fromW(snapPoint(hp, e)), hp.gob ? hp.gob.o : itOf(hp)); return; }
			var h = pick(e, state.tool !== 'ruler');
			if (h && h.gob && state.tool !== 'ruler') { if (d.button === 2) { if (opt.onMenuObj) opt.onMenuObj(h.gob.o, e.clientX, e.clientY); } else if (opt.onPickObj) opt.onPickObj(h.gob.o, e); return; }
			if (h && h.rec.sol !== undefined) { if (d.button === 2) { if (opt.onMenuSolid) opt.onMenuSolid(h.rec.sol, e.clientX, e.clientY); } else if (opt.onPickSolid) opt.onPickSolid(h.rec.sol, e); return; }
			if (d.button === 2) { if (opt.onMenu) opt.onMenu(itOf(h), e.clientX, e.clientY); return; }
			if (state.tool === 'ruler') { rulerClick(h, e); return; }
			if (opt.onPick) opt.onPick(itOf(h), e);
		}
		canvas.addEventListener('pointerup', up);
		canvas.addEventListener('pointercancel', function (e) { delete ptr[e.pointerId]; drag = null; });
		canvas.addEventListener('wheel', function (e) {
			e.preventDefault();
			var k = Math.exp((e.deltaY > 0 ? 1 : -1) * 0.12), r = canvas.getBoundingClientRect();
			/* приближение к месту под курсором */
			var px = (e.clientX - r.left - r.width / 2), py = (e.clientY - r.top - r.height / 2);
			panBy(-px * (1 - k), -py * (1 - k));
			orbit.dist = Math.max(60, Math.min(400000, orbit.dist * k));
			need = true;
		}, { passive: false });
		canvas.addEventListener('dblclick', function (e) { if (GZ.pick) return; var h = pick(e); if (h && h.gob && api.animToggle(h.gob.o)) { if (opt.onAnim) opt.onAnim(); return; } if (h && !h.gob && UB && UB.item && itOf(h) >= 0 && api.animToggle(itOf(h))) { if (opt.onAnim) opt.onAnim(); return; } if (opt.onDouble) opt.onDouble(itOf(h)); });

		/* ------------------------------ подписи -------------------------------- */
		function addLabel(cls, text, at) { var el = document.createElement('div'); el.className = 'v3dLbl ' + cls; el.textContent = text; labels.appendChild(el); var L = { el: el, at: at, cls: cls, text: text }; labelList.push(L); return L; }
		function dropLabels(cls) { labelList = labelList.filter(function (L) { if (L.cls.indexOf(cls) === 0) { L.el.remove(); return false; } return true; }); }
		var pv = new T.Vector3();
		function project(p) { pv.copy(p).project(cam); return [(pv.x + 1) / 2 * W, (1 - pv.y) / 2 * H, pv.z]; }
		function placeLabels() {
			for (var i = 0; i < labelList.length; i++) {
				var L = labelList[i], p = typeof L.at === 'function' ? L.at() : L.at;
				if (!p) { L.el.style.display = 'none'; L.vis = undefined; continue; }
				var s = project(p), okz = orbit.persp ? (s[2] < 1) : true;
				L.sx = s[0]; L.sy = s[1];
				L.vis = okz;
			}
			/* кружки позиций не должны лежать друг на друге: раздвигаем их на экране */
			var bal = labelList.filter(function (L) { return L.vis && L.at && L.cls === 'bal' && L.sx !== undefined; }), it, a2, b2;
			for (it = 0; it < 12 && bal.length > 1; it++) {
				var moved = false;
				for (a2 = 0; a2 < bal.length; a2++) for (b2 = a2 + 1; b2 < bal.length; b2++) {
					var dx = bal[b2].sx - bal[a2].sx, dy = bal[b2].sy - bal[a2].sy, d = Math.sqrt(dx * dx + dy * dy), min = 24;
					if (d >= min) continue;
					if (d < 0.01) { dx = 0.6; dy = 1; d = 1.17; }
					var sh = (min - d) / 2 + 0.5; dx /= d; dy /= d;
					bal[a2].sx -= dx * sh; bal[a2].sy -= dy * sh; bal[b2].sx += dx * sh; bal[b2].sy += dy * sh; moved = true;
				}
				if (!moved) break;
			}
			/* числа размеров из БАЗИСа не должны лежать друг на друге и на других подписях: налезающее — не показываем */
			var taken = [];
			for (i = 0; i < labelList.length; i++) {
				L = labelList[i];
				if (!L.vis) continue;
				var hw = Math.max(10, String(L.text).length * 3.8 + 6), r2 = [L.sx - hw, L.sy - 9, L.sx + hw, L.sy + 9];
				if (L.cls === 'bdim' && taken.some(function (q) { return r2[0] < q[2] && r2[2] > q[0] && r2[1] < q[3] && r2[3] > q[1]; })) { L.vis = false; continue; }
				taken.push(r2);
			}
			for (i = 0; i < labelList.length; i++) {
				L = labelList[i];
				if (L.vis === undefined) continue;
				L.el.style.display = L.vis ? '' : 'none';
				L.el.style.transform = 'translate(-50%, -50%) translate(' + L.sx.toFixed(1) + 'px, ' + L.sy.toFixed(1) + 'px)';
			}
		}
		/* ------------------ ось анимации (1.19): линия, стрелка хода, ручки ------------------ */
		var GZ = { g: null, hs: [], cfg: null, pick: null, line: null, cone: null }, mInv = new T.Matrix4();
		function toW(p) { return new T.Vector3(p[0], p[1], p[2]).applyMatrix4(root.matrixWorld); }
		function fromW(v) { return v.clone().applyMatrix4(mInv.copy(root.matrixWorld).invert()).toArray().map(function (q) { return Math.round(q * 10) / 10; }); }
		function gzLine() {
			if (!GZ.g || GZ.hs.length < 2) return;
			var a = GZ.hs[0].position, b = GZ.hs[1].position;
			GZ.line.geometry.setFromPoints([a, b]); GZ.line.geometry.attributes.position.needsUpdate = true;
			if (GZ.cone) { var dir = b.clone().sub(a); GZ.cone.position.copy(b); if (dir.length() > 1e-6) GZ.cone.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), dir.normalize()); }
		}
		/* cfg: { kind: 'rot' | 'move', a: [мм], b: [мм], text, handles: [индексы ручек] } или null */
		api.setGizmo = function (cfg) {
			if (GZ.g) { over.remove(GZ.g); clearGroup(GZ.g); GZ.g = null; }
			GZ.hs = []; GZ.line = null; GZ.cone = null; GZ.cfg = cfg || null; dropLabels('gz');
			if (!cfg) { need = true; return; }
			root.updateMatrixWorld(true);
			var g = new T.Group(), col = 0xe8730c, a = toW(cfg.a), b = toW(cfg.b), mat = function () { return new T.MeshBasicMaterial({ color: col, depthTest: false, transparent: true }); };
			GZ.line = new T.Line(new T.BufferGeometry().setFromPoints([a, b]), new T.LineBasicMaterial({ color: col, depthTest: false, transparent: true, linewidth: 2 }));
			GZ.line.renderOrder = 11; g.add(GZ.line);
			if (cfg.kind === 'move') { GZ.cone = new T.Mesh(new T.ConeGeometry(0.45, 1.4, 16), mat()); GZ.cone.renderOrder = 12; g.add(GZ.cone); }
			[a, b].forEach(function (p, k) {
				if (cfg.handles && cfg.handles.indexOf(k) < 0) return;
				var h = new T.Mesh(new T.SphereGeometry(1, 16, 12), new T.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true }));
				var ring = new T.Mesh(new T.SphereGeometry(1.25, 16, 12), mat()); ring.renderOrder = 12; h.renderOrder = 13;
				h.position.copy(p); h.userData.gzH = k; h.add(ring); ring.scale.setScalar(1);
				g.add(h); GZ.hs.push(h);
			});
			over.add(g); GZ.g = g; gzLine();
			if (cfg.text) addLabel('gz', cfg.text, function () { return GZ.hs.length ? GZ.hs[GZ.hs.length - 1].position.clone() : b; });
			need = true;
		};
		/* размер ручек — постоянный на экране */
		function gzScale() {
			if (!GZ.g) return;
			var px;
			if (cam === camO) px = (camO.top - camO.bottom) / (camO.zoom || 1) / H;
			GZ.g.children.forEach(function (o) {
				if (!o.isMesh) return;
				var k = px || 2 * cam.position.distanceTo(o.position) * Math.tan(camP.fov * Math.PI / 360) / H;
				o.scale.setScalar(k * (o === GZ.cone ? 9 : 6));
			});
		}
		/* следующий щелчок по модели — точка (прилипает к углу детали): fn([мм], объект) ; null — отменить */
		api.pickPoint = function (fn) { GZ.pick = fn || null; canvas.style.cursor = fn ? 'crosshair' : ''; };
		api.picking = function () { return !!GZ.pick; };
		function lineObj(a, b, color, dashed) {
			var g = new T.BufferGeometry().setFromPoints([a, b]);
			var l = new T.Line(g, new T.LineBasicMaterial({ color: color, depthTest: false, transparent: true }));
			l.renderOrder = 10; over.add(l); return l;
		}

		/* линейка: два щелчка — размер; щелчок прилипает к вершине детали */
		function snapPoint(h, e) {
			var rc = h.rec && h.rec.it ? h.rec : (h.gob && h.gob.it >= 0 ? items[h.gob.it] : null);
			if (!rc) return h.point.clone();
			var it = rc.it, best = null, bd = 13, r = canvas.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top, p = new T.Vector3();
			var loops = [it.outer].concat(it.inner);
			for (var li = 0; li < loops.length; li++) for (var k = 0; k < loops[li].length; k++) for (var z = 0; z < 2; z++) {
				p.set(loops[li][k][0], loops[li][k][1], z ? it.th : 0).applyMatrix4(rc.g.matrixWorld);
				var s = project(p), d = Math.hypot(s[0] - mx, s[1] - my);
				if (d < bd) { bd = d; best = p.clone(); }
			}
			return best || h.point.clone();
		}
		function rulerClick(h, e) {
			if (!h) { pendingA = null; dropLabels('pend'); need = true; return; }
			var p = snapPoint(h, e);
			if (!pendingA) { pendingA = p; addLabel('pend', '', p); need = true; return; }
			var d = pendingA.distanceTo(p), txt = Math.abs(d - Math.round(d)) < 0.05 ? String(Math.round(d)) : d.toFixed(1).replace('.', ',');
			var a = pendingA.clone(), mid = a.clone().add(p).multiplyScalar(0.5);
			measures.push({ a: a, b: p, len: d, line: lineObj(a, p, style.sel), la: addLabel('rule dot', '', a), lb: addLabel('rule dot', '', p), lt: addLabel('rule', txt, mid) });
			pendingA = null; dropLabels('pend'); need = true;
			if (opt.onMeasure) opt.onMeasure(d);
		}
		api.clearRuler = function () { for (var i = 0; i < measures.length; i++) { over.remove(measures[i].line); measures[i].line.geometry.dispose(); } measures = []; pendingA = null; dropLabels('rule'); dropLabels('pend'); need = true; };
		api.measures = function () { return measures.map(function (m) { return m.len; }); };

		/* габаритные размеры: изделие и модули (по видимым панелям, в текущем положении) */
		function boxOf(idx) {
			var b = new T.Box3();
			for (var i = 0; i < idx.length; i++) if (!state.hidden[idx[i]]) b.expandByObject(items[idx[i]].mesh);
			return b;
		}
		function dimLine(a, b, off, text, cls) {
			var A = a.clone().add(off), B = b.clone().add(off);
			dimObjs.push(lineObj(A, B, style.darkUi ? '#c9ced3' : '#39424a'), lineObj(a, A.clone().add(off.clone().multiplyScalar(0.12)), style.darkUi ? '#8d959c' : '#7b858e'), lineObj(b, B.clone().add(off.clone().multiplyScalar(0.12)), style.darkUi ? '#8d959c' : '#7b858e'));
			addLabel('dim ' + (cls || ''), text, A.clone().add(B).multiplyScalar(0.5));
		}
		function dimsOfBox(b, off, cls) {
			if (b.isEmpty()) return;
			var mn = b.min, mx = b.max, sx = mx.x - mn.x, sy = mx.y - mn.y, sz = mx.z - mn.z;
			if (sx > 1) dimLine(new T.Vector3(mn.x, mn.y, mx.z), new T.Vector3(mx.x, mn.y, mx.z), new T.Vector3(0, -off * 0.35, off), String(Math.round(sx)), cls);
			if (sy > 1) dimLine(new T.Vector3(mn.x, mn.y, mx.z), new T.Vector3(mn.x, mx.y, mx.z), new T.Vector3(-off, 0, off * 0.2), String(Math.round(sy)), cls);
			if (sz > 1 && cls !== 'mod') dimLine(new T.Vector3(mx.x, mn.y, mn.z), new T.Vector3(mx.x, mn.y, mx.z), new T.Vector3(off, -off * 0.35, 0), String(Math.round(sz)), cls);
		}
		function rebuildDims() {
			for (var i = 0; i < dimObjs.length; i++) { over.remove(dimObjs[i]); dimObjs[i].geometry.dispose(); }
			dimObjs = []; dropLabels('dim');
			if (!state.dims || !sc) { need = true; return; }
			root.updateMatrixWorld(true);
			var all = [], big = Math.max(sc.size[0], sc.size[1], sc.size[2]);
			for (i = 0; i < items.length; i++) all.push(i);
			if (state.scope && typeof state.scope === 'object') dimsOfBox(boxOf(state.scope.items), 90, '');
			else if (state.scope) { var m = sc.mods.filter(function (x) { return x.name === state.scope; })[0]; if (m) dimsOfBox(boxOf(m.items), 90, ''); }
			else {
				dimsOfBox(boxOf(all), Math.max(160, big * 0.07), '');
				if (!(state.explode > 0)) for (i = 0; i < sc.mods.length; i++) if (sc.mods[i].items.length > 2) dimsOfBox(boxOf(sc.mods[i].items), 26, 'mod');
			}
			need = true;
		}
		api.dimTexts = function () { return labelList.filter(function (L) { return L.cls.indexOf('dim') === 0; }).map(function (L) { return L.text; }); };

		/* кружки с номерами позиций: rows — [{ n, items: [номера панелей] }] */
		api.setBalloons = function (rows) {
			dropLabels('bal');
			state.balloons = rows || null;
			if (rows) rows.forEach(function (r) { r.items.forEach(function (i) { if (!items[i]) return; var c = new T.Vector3(); addLabel('bal', String(r.n), function () { if (state.hidden[i]) return null; var it = items[i].it, lb = M.localBox(it); return c.set((lb.x1 + lb.x2) / 2, (lb.y1 + lb.y2) / 2, it.th / 2).applyMatrix4(items[i].g.matrixWorld); }).item = i; }); });
			need = true;
		};

		/* метки у объектов (1.20, 3D-шаги): [{ o: объект 3D-файла | i: деталь, t: текст }] — кружок с номером позиции */
		api.setTags = function (list) {
			dropLabels('tag');
			(list || []).forEach(function (q) {
				var c = new T.Vector3(), base, g;
				if (q.o !== undefined && gobs[q.o]) {
					var bb = new T.Box3(); gobs[q.o].meshes.forEach(function (me) { if (!me.geometry.boundingBox) me.geometry.computeBoundingBox(); bb.union(me.geometry.boundingBox); });
					base = bb.getCenter(new T.Vector3()); g = gobs[q.o].g;
				} else if (q.i !== undefined && items[q.i]) {
					var it = items[q.i].it, lb = M.localBox(it); g = items[q.i].g;
					base = new T.Vector3((lb.x1 + lb.x2) / 2, (lb.y1 + lb.y2) / 2, it.th / 2).applyMatrix4(items[q.i].base);
				} else return;
				addLabel('tag' + (q.cls ? ' ' + q.cls : ''), String(q.t), function () { if (!g.visible) return null; return c.copy(base).applyMatrix4(g.matrixWorld.clone().multiply(q.i !== undefined ? new T.Matrix4().copy(items[q.i].base).invert() : new T.Matrix4())); });
			});
			need = true;
		};

		/* ------------------------------ кадр ----------------------------------- */
		function resize() {
			var w = Math.max(50, host.clientWidth), h = Math.max(50, host.clientHeight);
			if (w === W && h === H) return;
			W = w; H = h; renderer.setSize(W, H, false); canvas.style.width = W + 'px'; canvas.style.height = H + 'px'; need = true;
		}
		var raf = 0, alive = true, tween = null;
		function frame(ts) {
			if (!alive) return;
			raf = G.requestAnimationFrame(frame);
			resize();
			if (anB() && Object.keys(AN.tgt).length) {
				/* всегда плавно (1.15): шаг не больше 50 мс — даже если кадр рисуется долго, движение не прыгает */
				var dtA = AN.last ? Math.min(50, ts - AN.last) : 16; AN.last = ts;
				var B0 = anB(); if (B0.user ? BM.animUser.step(B0, AN.prog, AN.tgt, dtA, AN.wait) : BM.anim.step(B0, AN.prog, AN.tgt, dtA)) { applyTransforms(); AN.was = 1; }
				else if (AN.was) { AN.was = 0; AN.last = 0; rebuildDims(); need = true; if (opt.onAnim) opt.onAnim(); }
				else AN.last = 0;
			}
			if (tween) { var k = Math.min(1, (ts - tween.t0) / tween.ms), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; state[tween.key] = tween.from + (tween.to - tween.from) * e; applyTransforms(); if (k >= 1) { var done = tween.done; tween = null; rebuildDims(); if (done) done(); } }
			if (!need) return;
			need = false;
			placeCamera();
			draw();
			placeLabels();
			if (opt.onFrame) opt.onFrame();
		}
		/* высокое качество — сглаживание и тени в углах (если видеокарта справилась), иначе — как есть */
		function draw() {
			updateEdges();
			gzScale();
			if (typeof LT !== 'undefined' && LT && LT.spots && LT.spots.length && BM.light3d) BM.light3d.maskUpdate(T, LT.spots, cam);
			/* пока что-то движется — без прохода качества (он тяжёлый), чтобы движение шло плавно; остановилось — с ним */
			if (state.quality === 'high' && BM.post3d && G3 && renderer.capabilities.isWebGL2 && !AN.was && !tween) {
				try { if (!post) post = BM.post3d.create(renderer); post.render(scene, cam, { skip: function (o) { return o.parent === over || o === over; } }); return; }
				catch (e) { state.quality = 'normal'; if (G.console) G.console.warn('качество: ' + (e && e.message ? e.message : e)); }
			}
			renderer.render(scene, cam);
		}
		api.animate = function (key, to, ms, done) { if (!ms) { api.set(key, to); if (done) done(); return; } tween = { key: key, from: state[key], to: to, ms: ms, t0: G.performance.now(), done: done }; };
		api.busy = function () { return !!tween; };
		api.redraw = function () { need = true; };
		api.renderNow = function () { resize(); placeCamera(); draw(); placeLabels(); need = false; };

		/* Снимок окна: картинка PNG с фоном и подписями. */
		api.snapshot = function (opt) {
			opt = opt || {};
			var mk = LT.marks; if (mk) { LT.marks = false; setMarks(); }
			api.renderNow();
			if (mk) { LT.marks = true; setMarks(); }
			var c = document.createElement('canvas'), k = canvas.width / W, x = c.getContext('2d');
			c.width = canvas.width; c.height = canvas.height;
			var bgc = (BM.light3d && BM.light3d.base(LT.cfg).bg) || style.bg, gr = x.createLinearGradient(0, 0, 0, c.height); gr.addColorStop(0, bgc[0]); gr.addColorStop(1, bgc[1]);       // «Вечер» — тёмный фон и на снимке
			x.fillStyle = opt.bg || gr; x.fillRect(0, 0, c.width, c.height);
			x.drawImage(canvas, 0, 0);
			if (opt.jpeg) return c.toDataURL('image/jpeg', opt.jpeg);
			x.textAlign = 'center'; x.textBaseline = 'middle';
			for (var i = 0; i < labelList.length; i++) {
				var L = labelList[i];
				if (L.el.style.display === 'none' || !L.text) continue;
				var bal = L.cls.indexOf('bal') === 0, fs = (bal ? 12 : (L.cls.indexOf('mod') > 0 ? 10.5 : 12)) * k;
				x.font = (bal ? '600 ' : '') + fs + 'px "Segoe UI", "DejaVu Sans", Arial, sans-serif';
				var w = x.measureText(L.text).width + 8 * k, h = fs + 5 * k, cx = L.sx * k, cy = L.sy * k;
				if (bal) { var r = Math.max(w, h) / 2 + k; x.beginPath(); x.arc(cx, cy, r, 0, 6.2832); x.fillStyle = '#ffffff'; x.fill(); x.lineWidth = 1.2 * k; x.strokeStyle = '#1c2126'; x.stroke(); x.fillStyle = '#1c2126'; }
				else { x.fillStyle = style.darkUi ? 'rgba(20,23,26,.86)' : 'rgba(255,255,255,.9)'; x.fillRect(cx - w / 2, cy - h / 2, w, h); x.fillStyle = L.cls.indexOf('rule') === 0 ? style.sel : (style.darkUi ? '#e6e8ea' : '#1c2126'); }
				x.fillText(L.text, cx, cy + 0.5 * k);
			}
			return c.toDataURL('image/png');
		};
		/* Крепёж фигурами по отверстиям (листы «Сборки»: БАЗИС не всегда выгружает форму эксцентриков, штоков, шкантов).
		   list: [{ p, d (направление в материал), dia, dep, wood }] → цилиндры в координатах сцены; setExtraState(показать { номер: 1 }, цвет { номер: '#…' }) */
		var EX = { g: null, m: [] };
		api.setExtra = function (list, k) {
			k = k || 1;
			if (EX.g) { clearGroup(EX.g); root.remove(EX.g); }
			EX.g = new T.Group(); EX.m = [];
			var up = new T.Vector3(0, 1, 0);
			(list || []).forEach(function (h) {
				var dv = new T.Vector3(h.d[0], h.d[1], h.d[2]); if (dv.lengthSq() < 1e-9) dv.set(0, 0, 1); dv.normalize();
				var len = Math.max(4, h.dep || 10), r = Math.max(3.5, (h.dia || 5) / 2 * k);          // k — крупнее настоящего, чтобы крепёж читался на листе
				var mat = new T.MeshLambertMaterial({ color: new T.Color(h.wood ? '#b8874a' : '#59626b'), depthTest: false });      // поверх панелей: крепёж сидит в материале
				var me = new T.Mesh(new T.CylinderGeometry(r, r, len, 14), mat);
				me.quaternion.setFromUnitVectors(up, dv);
				me.position.set(h.p[0] + dv.x * len / 2, h.p[1] + dv.y * len / 2, h.p[2] + dv.z * len / 2);
				me.userData.base = mat.color.clone(); me.visible = false; me.renderOrder = 50;
				EX.g.add(me); EX.m.push(me);
			});
			root.add(EX.g); need = true;
		};
		api.setExtraState = function (show, col) {
			EX.m.forEach(function (me, i) { me.visible = !!(show && show[i]); var c = col && col[i]; me.material.color.copy(c ? new T.Color(c) : me.userData.base); });
			need = true;
		};
		/* Перевод точки модели (координаты сцены) в картинку снимка: матрица 4×4 (по столбцам) и размер окна. Для надписей поверх снимка (листы «Сборки»). */
		api.projMatrix = function () { placeCamera(); root.updateMatrixWorld(true); var m = new T.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse).multiply(root.matrixWorld); return { m: m.elements.slice(), w: W, h: H }; };
		api.dispose = function () { alive = false; G.cancelAnimationFrame(raf); clearGroup(root); clearGroup(over); renderer.dispose(); canvas.remove(); labels.remove(); };
		api.info = function () { var g = renderer.info; return { calls: g.render.calls, tris: g.render.triangles, items: items.length, solids: sols.filter(Boolean).length }; };
		/* точка тела на экране (центр его габарита в текущем положении) — для проверок */
		api.projectSolid = function (j) { placeCamera(); var q = sols[j]; if (!q) return null; root.updateMatrixWorld(true); var b = new T.Box3().expandByObject(q.mesh), c = new T.Vector3(); b.getCenter(c); var s = project(c); return [s[0], s[1]]; };

		raf = G.requestAnimationFrame(frame);
		return api;
	};
})(typeof window !== 'undefined' ? window : this);
