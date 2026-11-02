/* STHGroup — источники света в 3D (1.15): солнце, лампа в точке, подсветка лентой; «День / Вечер».
   Свет хранится в проекте (work.light) и тот же — в окне «Модель», в «3D для заказчика» и в приложении для телефона.
   { mode: 'day' | 'night', list: [{ id, t: 'sun' | 'lamp' | 'strip', on, az, el, x, y, z, len, br, k, sh }] }
   Солнце: az — откуда светит по кругу (0 — спереди, + — справа), el — высота над полом, градусы.
   Лампа и лента: x, y, z — место в процентах габарита изделия от левого нижнего заднего угла (слева→справа,
   снизу→вверх, сзади→вперёд; можно далеко за пределами 0…100 — в панели вписывается и в мм); лента идёт вдоль
   ширины, len — её длина в процентах ширины.
   glow — подсветка из модели (1.15.1): { on, br, k } — рассеиватели модели светятся (см. findGlow, buildGlow).
   br — яркость, %; k — цвет, К (3000 тёплый, 4000 нейтральный, 6000 холодный); sh — тени.
   Без three.js работают только norm/def/base (проверки под Node.js). */
(function (G) {
	'use strict';
	var BM = G.BM = G.BM || {};
	var L = BM.light3d = {};
	L.KS = [3000, 4000, 6000];
	L.COL = { 3000: [1, 0.706, 0.42], 4000: [1, 0.82, 0.64], 6000: [1, 0.953, 0.937] };        // цвет по температуре (приближение к излучению)
	L.NAMES = { sun: 'Солнце', lamp: 'Лампа', strip: 'Лента' };
	L.MAX = 8;
	var DEF = {
		sun: { az: -35, el: 45, br: 100, k: 6000, sh: 1 },
		lamp: { x: 50, y: 92, z: 115, br: 100, k: 3000, sh: 0 },
		strip: { x: 50, y: 97, z: 85, len: 90, br: 100, k: 4000, sh: 0 }
	};
	function num(v, a, b, d) { v = Number(v); if (!isFinite(v)) return d; return Math.max(a, Math.min(b, v)); }
	L.def = function (t, id) { var d = DEF[t] || DEF.lamp, r = { id: id || 1, t: DEF[t] ? t : 'lamp', on: 1 }; Object.keys(d).forEach(function (k) { r[k] = d[k]; }); return r; };
	/* порядок: значения в своих пределах, неизвестное — по умолчанию */
	L.norm = function (c) {
		c = c && typeof c === 'object' ? c : {};
		var list = (Array.isArray(c.list) ? c.list : []).slice(0, L.MAX).map(function (s, i) {
			s = s || {};
			var t = DEF[s.t] ? s.t : 'lamp', d = DEF[t], r = { id: Number(s.id) > 0 ? Math.round(Number(s.id)) : i + 1, t: t, on: s.on === 0 || s.on === false ? 0 : 1 };
			if (t === 'sun') { r.az = num(s.az, -180, 180, d.az); r.el = num(s.el, 5, 90, d.el); }
			else { r.x = num(s.x, -10000, 10000, d.x); r.y = num(s.y, -10000, 10000, d.y); r.z = num(s.z, -10000, 10000, d.z); if (t === 'strip') r.len = num(s.len, 5, 300, d.len); }
			r.br = num(s.br, 0, 300, d.br);
			r.k = L.KS.indexOf(Number(s.k)) >= 0 ? Number(s.k) : d.k;
			r.sh = s.sh ? 1 : 0;
			return r;
		});
		var g = c.glow && typeof c.glow === 'object' ? c.glow : {};
		return { mode: c.mode === 'night' ? 'night' : 'day', soft: num(c.soft, 0, 100, 40), list: list, glow: { on: g.on ? 1 : 0, br: num(g.br, 0, 300, 100), k: L.KS.indexOf(Number(g.k)) >= 0 ? Number(g.k) : 4000 } };
	};
	L.empty = function (c) { return !c || (!(c.list && c.list.length) && c.mode !== 'night' && !(c.glow && c.glow.on)); };
	/* ползунки места: до трёх размеров изделия в каждую сторону; дальше — числом в мм */
	L.SLIDE = [-300, 400];
	/* общий свет («небо» и свет от камеры): днём — как был, вечером — приглушён */
	L.base = function (c) { var n = c && c.mode === 'night'; return { hemi: n ? 0.14 : 1, cam: n ? 0.06 : 1, bg: n ? ['#2a3038', '#14181d'] : null, night: !!n }; };
	L.nextId = function (c) { var m = 0; (c.list || []).forEach(function (s) { m = Math.max(m, s.id || 0); }); return m + 1; };
	L.label = function (s) {
		if (s.t === 'sun') return 'Солнце · ' + (s.az === 0 ? 'спереди' : (s.az > 0 ? 'справа ' : 'слева ') + Math.abs(Math.round(s.az)) + '°') + ', ' + Math.round(s.el) + '°';
		return L.NAMES[s.t] + ' · ' + s.k + ' K';
	};

	/* Свет в сцене three.js: группа источников для габарита изделия box (Box3 в координатах сцены: X — вправо,
	   Y — вверх, Z — к зрителю). Возвращает { g: группа, shadows: нужны ли тени }. */
	L.build = function (T, c, box, opt) {
		var g = new T.Group(); g.name = 'bmLights';
		var r = { g: g, shadows: false };
		c = L.norm(c);
		if (!box || box.isEmpty()) return r;
		var C = box.getCenter(new T.Vector3()), S = box.getSize(new T.Vector3()), D = Math.max(300, S.length());
		function at(s) { return new T.Vector3(box.min.x + S.x * s.x / 100, box.min.y + S.y * s.y / 100, box.min.z + S.z * s.z / 100); }
		function col(k) { var q = L.COL[k] || L.COL[4000]; return new T.Color(q[0], q[1], q[2]); }
		function point(p, I, k, sh) {
			var pl = new T.PointLight(col(k), I, D * 3, 0);             // без спада по расстоянию, мягко гаснет к краю
			pl.position.copy(p);
			if (sh) { pl.castShadow = true; pl.shadow.mapSize.set(1024, 1024); pl.shadow.camera.near = Math.max(5, D / 400); pl.shadow.camera.far = D * 3; pl.shadow.bias = -0.002; pl.shadow.radius = L.radius(c); r.shadows = true; }
			g.add(pl);
			return pl;
		}
		function glow(geo, k, p) {
			var m = new T.Mesh(geo, new T.MeshBasicMaterial({ color: col(k).lerp(new T.Color(1, 1, 1), 0.55) }));
			m.position.copy(p); m.userData.bmLightMark = 1; m.castShadow = false; m.receiveShadow = false;
			g.add(m);
			return m;
		}
		c.list.forEach(function (s) {
			if (!s.on || !(s.br > 0)) return;
			var I = s.br / 100;
			if (s.t === 'sun') {
				var az = s.az * Math.PI / 180, el = s.el * Math.PI / 180, dir = new T.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
				var dl = new T.DirectionalLight(col(s.k), 2.2 * I);
				dl.position.copy(C).addScaledVector(dir, D * 1.5);
				dl.target.position.copy(C); g.add(dl.target);
				if (s.sh) {
					dl.castShadow = true; dl.shadow.mapSize.set(2048, 2048); dl.shadow.radius = L.radius(c);
					var sc = dl.shadow.camera, h = D * 0.62;
					sc.left = -h; sc.right = h; sc.top = h; sc.bottom = -h; sc.near = D * 0.3; sc.far = D * 3;
					dl.shadow.bias = -0.0004; dl.shadow.normalBias = D * 0.0004;
					r.shadows = true;
				}
				g.add(dl);
			} else if (s.t === 'lamp') {
				var p = at(s);
				point(p, 2.4 * I, s.k, s.sh);
				if (!opt || opt.lampMark !== false) glow(new T.SphereGeometry(Math.max(8, D * 0.008), 16, 10), s.k, p).userData.bmLamp = 1;     // шарик лампы: на снимке и у заказчика не виден
			} else {
				var p0 = at(s), ln = Math.max(20, S.x * s.len / 100), n = Math.max(2, Math.min(5, Math.round(ln / 400) + 1));
				for (var i = 0; i < n; i++) point(new T.Vector3(p0.x - ln / 2 + ln * (n === 1 ? 0.5 : i / (n - 1)), p0.y, p0.z), 2.2 * I / n * 1.6, s.k, s.sh && i === Math.floor(n / 2));
				var th = Math.max(4, D * 0.003);
				glow(new T.BoxGeometry(ln, th, th * 2.5), s.k, p0);
			}
		});
		return r;
	};
	/* ---------------- подсветка из модели: рассеиватели в блоках с лентой и профилем ----------------
	   words: { diff: 'Рассеиватель', led: 'Лента', prof: 'Профиль' } — несколько слов через запятую, по части названия,
	   без учёта больших и маленьких букв. Рассеиватель светится; свет идёт от ленты (нет ленты — от профиля) через
	   рассеиватель наружу: по самой тонкой стороне рассеивателя (в полке — вниз, в боковине — вбок).
	   В блоке рассеивателя нет ни ленты, ни профиля — подсветки нет.
	   O — объекты 3D-файла (BM.glb.objects). Возвращает [{ o, blk, c, u (вдоль), d (куда светит), len, th }]. */
	L.WORDS = { diff: 'Рассеиватель', led: 'Лента', prof: 'Профиль' };
	function wl(s) { return String(s || '').split(',').map(function (w) { return w.trim().toLowerCase(); }).filter(Boolean); }
	function has(name, ws) { var n = String(name || '').toLowerCase().replace(/\s+/g, ' '); return ws.some(function (w) { return n.indexOf(w) >= 0; }); }
	L.findGlow = function (O, words) {
		var W = words || {}, wd = wl(W.diff === undefined ? L.WORDS.diff : W.diff), wle = wl(W.led === undefined ? L.WORDS.led : W.led), wp = wl(W.prof === undefined ? L.WORDS.prof : W.prof), r = [];
		if (!O || !O.objs || !wd.length) return r;
		function ok(o) { return o && o.box && o.box.min[0] <= o.box.max[0]; }
		function ctr(o) { var b = o.box; return [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2]; }
		function inside(i, top) { for (var u = i; u >= 0 && u !== undefined; u = O.objs[u].up) if (u === top) return true; return false; }
		O.objs.forEach(function (o, i) {
			if (!ok(o) || !has(o.name, wd)) return;
			if (O.objs.some(function (q, j) { return j !== i && inside(j, i) && has(q.name, wd); })) return;     // внутри есть деталь с тем же словом — светится она (самая вложенная)
			var blk = o.up; if (!(blk >= 0)) return;
			var led = -1, prof = -1;
			O.objs.forEach(function (q, j) {
				if (j === i || !ok(q) || inside(j, i) || !inside(j, blk)) return;
				if (led < 0 && wle.length && has(q.name, wle) && !has(q.name, wd)) led = j;
				else if (prof < 0 && wp.length && has(q.name, wp) && !has(q.name, wd)) prof = j;
			});
			var ref = led >= 0 ? led : prof;
			if (ref < 0) return;
			var b = o.box, sz = [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]], c = ctr(o), rc = ctr(O.objs[ref]);
			var ax = [0, 1, 2].sort(function (p, q) { return sz[p] - sz[q]; }), thin = ax[0], mid = ax[1], lng = ax[2];
			var v = [c[0] - rc[0], c[1] - rc[1], c[2] - rc[2]];
			var k = Math.abs(v[thin]) > 0.3 || Math.abs(v[thin]) >= Math.abs(v[mid]) ? thin : mid;              // лента прямо за рассеивателем — по тонкой стороне
			if (!(Math.abs(v[k]) > 0.01)) return;
			var d = [0, 0, 0], u = [0, 0, 0]; d[k] = v[k] > 0 ? 1 : -1; u[lng] = 1;
			/* модуль ленты (шкаф): первый блок выше, у которого все стороны не меньше 150 мм — свет ленты только внутри него (1.16.1) */
			var mod = null;
			for (var up = blk; up >= 0 && up !== undefined; up = O.objs[up].up) { var ob = O.objs[up]; if (!ok(ob)) continue; var bz = [ob.box.max[0] - ob.box.min[0], ob.box.max[1] - ob.box.min[1], ob.box.max[2] - ob.box.min[2]]; if (Math.min(bz[0], bz[1], bz[2]) >= 150) { mod = { min: ob.box.min.slice(), max: ob.box.max.slice() }; break; } }
			r.push({ o: i, blk: blk, c: c, u: u, d: d, len: sz[lng], th: sz[k], mod: mod });
		});
		return r;
	};
	/* Свет подсветки: у каждой полосы — своя группа (едет с ящиком или дверью); в ней 1–3 направленных источника.
	   opt: { shadows: '0' | '4' | 'all', maxShadows }. Возвращает { list: [{ g, o }], shadows: число теней, lights }. */
	L.MAX_GLOW_LIGHTS = 32;
	L.buildGlow = function (T, strips, gc, opt) {
		var res = { list: [], shadows: 0, lights: 0 };
		if (!gc || !gc.on || !strips || !strips.length) return res;
		opt = opt || {};
		var I = (gc.br === undefined ? 100 : gc.br) / 100, col = L.COL[gc.k] || L.COL[4000], color = new T.Color(col[0], col[1], col[2]);
		var shMode = String(opt.shadows === undefined ? '4' : opt.shadows), shMax = shMode === '0' ? 0 : (shMode === 'all' ? (opt.maxShadows || 12) : Math.min(4, opt.maxShadows || 12));
		var per = strips.length * 3 <= L.MAX_GLOW_LIGHTS ? 3 : (strips.length * 2 <= L.MAX_GLOW_LIGHTS ? 2 : 1);
		strips.forEach(function (s) {
			var g = new T.Group(); g.matrixAutoUpdate = false; g.name = 'bmGlow';
			var n = Math.max(1, Math.min(per, Math.round(s.len / 350))), room = L.MAX_GLOW_LIGHTS - res.lights;
			if (room <= 0) n = 0; else n = Math.min(n, room);
			for (var i = 0; i < n; i++) {
				var t = (i + 0.5) / n - 0.5, p = new T.Vector3(s.c[0] + s.u[0] * s.len * t + s.d[0] * (s.th / 2 + 3), s.c[1] + s.u[1] * s.len * t + s.d[1] * (s.th / 2 + 3), s.c[2] + s.u[2] * s.len * t + s.d[2] * (s.th / 2 + 3));
				var sp = new T.SpotLight(color, 1.7 * I * (n === 1 ? 1.6 : 1), 1400, Math.PI * 0.46, 1, 0);
				sp.position.copy(p); sp.target.position.set(p.x + s.d[0] * 100, p.y + s.d[1] * 100, p.z + s.d[2] * 100);
				if (i === Math.floor(n / 2) && res.shadows < shMax) { sp.castShadow = true; sp.shadow.mapSize.set(512, 512); sp.shadow.camera.near = 2; sp.shadow.camera.far = 1400; sp.shadow.bias = -0.002; sp.shadow.radius = L.radius(opt.cfg); res.shadows++; }
				sp.userData.bmMod = s.mod; g.add(sp); g.add(sp.target); res.lights++;
			}
			res.list.push({ g: g, o: s.o, blk: s.blk });
		});
		return res;
	};
	/* мягкость теней (0…100) → размытие края тени */
	L.radius = function (c) { var v = c && c.soft !== undefined ? Number(c.soft) : 40; return 1 + Math.max(0, Math.min(100, v)) * 0.09; };
	/* Свет ленты — только внутри её модуля: в шейдере у каждой направленной лампы подсветки свой габарит модуля
	   (в мировых координатах); точка снаружи — этот свет её не освещает. Общие для всех материалов значения. */
	var MK = null;
	function mk(T) {
		if (!MK) { MK = { min: [], max: [], inv: { value: new T.Matrix4() } }; for (var i = 0; i < 32; i++) { MK.min.push(new T.Vector3(-1e9, -1e9, -1e9)); MK.max.push(new T.Vector3(1e9, 1e9, 1e9)); } MK.umin = { value: MK.min }; MK.umax = { value: MK.max }; }
		return MK;
	}
	L.maskMat = function (T, m) {
		if (!m || m.userData.bmMask || !m.isMeshStandardMaterial) return;
		var M = mk(T);
		m.userData.bmMask = 1;
		m.onBeforeCompile = function (sh) {
			sh.uniforms.bmBoxMin = M.umin; sh.uniforms.bmBoxMax = M.umax; sh.uniforms.bmViewInv = M.inv;
			sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n#if NUM_SPOT_LIGHTS > 0\nuniform vec3 bmBoxMin[ 32 ]; uniform vec3 bmBoxMax[ 32 ]; uniform mat4 bmViewInv;\n#endif')
				.replace('#include <lights_fragment_begin>', T.ShaderChunk.lights_fragment_begin.replace('getSpotLightInfo( spotLight, geometryPosition, directLight );',
					'getSpotLightInfo( spotLight, geometryPosition, directLight ); { vec3 bmW = ( bmViewInv * vec4( geometryPosition, 1.0 ) ).xyz; if ( any( lessThan( bmW, bmBoxMin[ i ] ) ) || any( greaterThan( bmW, bmBoxMax[ i ] ) ) ) directLight.color = vec3( 0.0 ); }'));
		};
		m.customProgramCacheKey = function () { return 'bmMask'; };
		m.needsUpdate = true;
	};
	/* перед кадром: порядок направленных ламп — как у three.js (сначала с тенью), габариты модулей — с учётом движения */
	L.maskUpdate = function (T, spots, cam) {
		var M = mk(T), v = new T.Vector3();
		M.inv.value.copy(cam.matrixWorld);
		var list = spots.slice().sort(function (a, b) { return (b.castShadow ? 2 : 0) - (a.castShadow ? 2 : 0); });
		for (var i = 0; i < 32; i++) {
			var sp = list[i], bx = sp && sp.userData.bmMod;
			if (!bx || !sp.parent) { M.min[i].set(-1e9, -1e9, -1e9); M.max[i].set(1e9, 1e9, 1e9); continue; }
			M.min[i].set(Infinity, Infinity, Infinity); M.max[i].set(-Infinity, -Infinity, -Infinity);
			for (var k = 0; k < 8; k++) {
				v.set(k & 1 ? bx.max[0] : bx.min[0], k & 2 ? bx.max[1] : bx.min[1], k & 4 ? bx.max[2] : bx.min[2]).applyMatrix4(sp.parent.matrixWorld);
				M.min[i].min(v); M.max[i].max(v);
			}
			M.min[i].addScalar(-3); M.max[i].addScalar(3);
		}
	};

	/* цвет свечения рассеивателя */
	L.glowColor = function (gc) { var q = L.COL[gc && gc.k] || L.COL[4000]; return [q[0], q[1], q[2]]; };

	/* убрать группу света из сцены и освободить память */
	L.drop = function (g) {
		if (!g) return;
		if (g.parent) g.parent.remove(g);
		g.traverse(function (o) { if (o.geometry) o.geometry.dispose(); if (o.material && o.material.dispose) o.material.dispose(); if (o.shadow && o.shadow.map) { o.shadow.map.dispose(); o.shadow.map = null; } });
	};
})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : global));
