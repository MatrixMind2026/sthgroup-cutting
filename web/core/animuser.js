/* STHGroup — свои анимации модели (1.19): подвижные группы, заданные в окне без кода.
   Хранится в проекте: work.anim = { v: 1, src: 'mine' | 'bazis', nid, groups: [группа] }.
   Группа: { id, name, parent (id или ''), on, mem: [{ k: ключ объекта, n: имя, c: центр, мм }], m: движение }.
   Движение m: { type: 'swing' | 'lift' | 'flap' | 'drawer' | 'slide', p: точка оси, d: направление (мм, оси модели),
     sign: ±1, a0, a1: углы (°), dist: ход (мм), dirName: 'front' | … | 'own', space: 'group' | 'model', edge: 'left' | …,
     ms: длительность (с), delay: задержка (с), ease: 'io' | 'lin' | 'in' | 'out',
     hauto: вынос на петле сам по петлям (по умолчанию — да), ho / hs: вынос вручную — от корпуса / вбок, мм (1.19.1) }.
   Вынос на петле: дверь при открывании отходит от корпуса (и вбок) и поворачивается, как на настоящей петле.
   Ключ объекта — путь имён в дереве 3D-файла с номером среди одноимённых соседей («КШ-650.0.1#2/Корпус ящ. (Blum)#0»);
   без 3D-файла — путь детали в модели и её имя (i:…). Номера деталей выгрузки (1, 2, 3…) меняются от выгрузки
   к выгрузке, поэтому не используются. Не найдено по ключу — ищется по имени и месту (до 40 мм), такое помечается.
   Положение всегда считается от исходного (закрытого) положения модели: матрица = M(внешняя группа) · M(вложенная),
   без накопления. Результат resolve совместим по виду с BM.anim.bind (L, of, n) — окно и файл для заказчика
   крутят его тем же кодом. Работает в окне, в файле для заказчика и под Node.js. */
(function (G) {
	'use strict';
	var BM = G.BM = G.BM || {};
	var U = BM.animUser = {};
	var D2R = Math.PI / 180;

	function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
	function add(a, b, k) { k = k === undefined ? 1 : k; return [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k]; }
	function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
	function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
	function len(a) { return Math.sqrt(dot(a, a)); }
	function norm(a) { var l = len(a); return l > 1e-9 ? [a[0] / l, a[1] / l, a[2] / l] : null; }
	function r3(a) { return a.map(function (v) { return Math.round(v * 100) / 100; }); }
	U.norm = norm;

	U.TYPES = [['swing', 'Распашной'], ['lift', 'Подъёмный'], ['flap', 'Откидной'], ['drawer', 'Ящик'], ['slide', 'Купе']];
	U.EASE = [['io', 'Мягкий старт и остановка'], ['lin', 'Равномерно'], ['in', 'Мягкий старт'], ['out', 'Мягкая остановка']];
	U.DIRS = [['front', 'Вперёд'], ['back', 'Назад'], ['right', 'Вправо'], ['left', 'Влево'], ['up', 'Вверх'], ['down', 'Вниз'], ['own', 'Своё']];
	U.isRot = function (type) { return type === 'swing' || type === 'lift' || type === 'flap'; };
	U.ease = function (kind, p) {
		p = p <= 0 ? 0 : (p >= 1 ? 1 : p);
		if (kind === 'lin') return p;
		if (kind === 'in') return p * p;
		if (kind === 'out') return 1 - (1 - p) * (1 - p);
		return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
	};
	U.empty = function () { return { v: 1, src: 'mine', nid: 1, groups: [] }; };
	/* work.anim проекта (создаётся при первом обращении для записи) */
	U.of = function (work, make) {
		if (!work.anim && make) work.anim = U.empty();
		var a = work.anim;
		if (a && !Array.isArray(a.groups)) a.groups = [];
		return a || null;
	};

	/* ----------------------------- ключи объектов ----------------------------- */
	function nmKey(s) { return String(s || '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim(); }
	U.keys = function (O) {
		if (O._ukeys) return O._ukeys;
		var keys = new Array(O.objs.length);
		function walk(list, pre) {
			var cnt = {};
			list.forEach(function (i) {
				var n = nmKey(O.objs[i].name), c = cnt[n] = (cnt[n] || 0) + 1;
				keys[i] = (pre ? pre + '/' : '') + n + '#' + (c - 1);
				walk(O.objs[i].kids, keys[i]);
			});
		}
		walk(O.top, '');
		O._ukeys = keys;
		return keys;
	};
	U.itemKeys = function (sc) {
		if (sc._ukeys) return sc._ukeys;
		var cnt = {}, keys = sc.items.map(function (it) { var b = 'i:' + (it.path || []).map(nmKey).join('/') + '/' + nmKey(it.name), c = cnt[b] = (cnt[b] || 0) + 1; return b + '#' + (c - 1); });
		sc._ukeys = keys;
		return keys;
	};
	function boxC(b) { return [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2]; }
	/* «тело» участника: объект 3D-файла или деталь модели */
	function host(O, sc) {
		if (O) {
			var K = U.keys(O);
			return { n: O.objs.length, key: function (i) { return K[i]; }, name: function (i) { return O.objs[i].name; }, box: function (i) { return O.objs[i].box; }, up: function (i) { return O.objs[i].up; } };
		}
		var IK = U.itemKeys(sc);
		return { n: sc.items.length, key: function (i) { return IK[i]; }, name: function (i) { return sc.items[i].name; }, box: function (i) { return sc.items[i].box; }, up: function () { return -1; } };
	}
	U.member = function (O, sc, i) { var H = host(O, sc), b = H.box(i); return { k: H.key(i), n: nmKey(H.name(i)), c: b && b.min[0] <= b.max[0] ? r3(boxC(b)) : null }; };

	/* ----------------------------- группа: габарит, оси, кромки ----------------------------- */
	/* Оси модели: вверх, вперёд, вправо (из сцены BM.m3d). */
	U.axesModel = function (sc) { var up = sc.up || [0, 0, 1], fr = sc.front || [0, -1, 0]; return { x: cross(up, fr), y: up, z: fr }; };
	/* Оси группы: из положения первого участника в 3D-файле (его X — вправо, Y — вверх, Z — вперёд, как в БАЗИСе),
	   если они не совпадают с осями модели с точностью до знака — иначе оси модели. */
	U.axesGroup = function (g, O, sc, idx) {
		var A = U.axesModel(sc);
		if (!O || !idx.length) return A;
		var w = O.objs[idx[0]].w; if (!w) return A;
		var x = norm([w[0], w[1], w[2]]), y = norm([w[4], w[5], w[6]]), z = norm([w[8], w[9], w[10]]);
		if (!x || !y || !z) return A;
		/* блок повёрнут относительно модели — берём его оси, сопоставив с осями модели по наибольшему совпадению */
		var L = [x, y, z], pickFor = function (ax) { var b = null, bv = 0; L.forEach(function (v) { var d = dot(v, ax); if (Math.abs(d) > Math.abs(bv)) { bv = d; b = v; } }); return bv < 0 ? b.map(function (q) { return -q; }) : b; };
		var gx = pickFor(A.x), gy = pickFor(A.y), gz = pickFor(A.z);
		if (Math.abs(dot(gx, gy)) > 0.1 || Math.abs(dot(gy, gz)) > 0.1) return A;
		return { x: gx, y: gy, z: gz };
	};
	/* Габарит участников в осях X: { lo, hi } (по углам габаритов объектов) */
	U.extent = function (O, sc, idx, X) {
		var H = host(O, sc), lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
		idx.forEach(function (i) {
			var b = H.box(i); if (!b || !(b.min[0] <= b.max[0])) return;
			for (var c = 0; c < 8; c++) {
				var p = [c & 1 ? b.max[0] : b.min[0], c & 2 ? b.max[1] : b.min[1], c & 4 ? b.max[2] : b.min[2]], q = [dot(p, X.x), dot(p, X.y), dot(p, X.z)];
				for (var k = 0; k < 3; k++) { if (q[k] < lo[k]) lo[k] = q[k]; if (q[k] > hi[k]) hi[k] = q[k]; }
			}
		});
		return lo[0] <= hi[0] ? { lo: lo, hi: hi } : null;
	};
	function fromAx(X, q) { return add(add(X.x.map(function (v) { return v * q[0]; }), X.y, q[1]), X.z, q[2]); }
	U.fromAx = fromAx;
	/* Кромки лицевой стороны группы: левая, правая (вертикальные), верхняя, нижняя (горизонтальные) и те же сзади */
	U.EDGES = [['left', 'Левая'], ['right', 'Правая'], ['top', 'Верхняя'], ['bottom', 'Нижняя']];
	U.edge = function (E, X, which, back) {
		if (!E) return null;
		var z = back ? E.lo[2] : E.hi[2], p, d;
		if (which === 'left') { p = [E.lo[0], E.lo[1], z]; d = X.y; }
		else if (which === 'right') { p = [E.hi[0], E.lo[1], z]; d = X.y; }
		else if (which === 'top') { p = [E.lo[0], E.hi[1], z]; d = X.x; }
		else { p = [E.lo[0], E.lo[1], z]; d = X.x; }
		var L = (which === 'left' || which === 'right') ? E.hi[1] - E.lo[1] : E.hi[0] - E.lo[0];
		return { p: r3(fromAx(X, p)), d: r3(d), len: Math.round(L) };
	};
	/* Ближайшая к точке кромка габарита группы (все 12 рёбер): для «щёлкнуть по кромке в 3D» */
	U.nearestEdge = function (E, X, pt) {
		var q = [dot(pt, X.x), dot(pt, X.y), dot(pt, X.z)], best = null, bd = Infinity;
		for (var a = 0; a < 3; a++) {
			var b = (a + 1) % 3, c = (a + 2) % 3;
			[E.lo[b], E.hi[b]].forEach(function (vb) {
				[E.lo[c], E.hi[c]].forEach(function (vc) {
					var d = Math.hypot(q[b] - vb, q[c] - vc);
					if (d < bd) { bd = d; var p = [0, 0, 0]; p[a] = E.lo[a]; p[b] = vb; p[c] = vc; var dir = [0, 0, 0]; dir[a] = 1; best = { p: r3(fromAx(X, p)), d: r3(fromAx(X, dir)), len: Math.round(E.hi[a] - E.lo[a]), dist: d }; }
				});
			});
		}
		return best;
	};
	/* Вынос на петле (1.19.1) — «сам по петлям»: у двери есть петли (в ней, рядом до 60 мм или в её блоке) — дверь отходит от корпуса
	   на свою толщину + 2 мм; петель нет — без выноса. { ho: от корпуса, hs: вбок (мм), n: петель }. */
	U.hingeAuto = function (O, sc, idx) {
		var r = { ho: 0, hs: 0, n: 0 };
		if (!O || !idx || !idx.length) return r;
		var X = U.axesGroup(null, O, sc, idx), lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity], own = {}, best = null, ba = 0;
		(function walk(list) { list.forEach(function (i) { own[i] = 1; walk(O.objs[i].kids); }); })(idx);
		Object.keys(own).forEach(function (k) {
			var o = O.objs[k], b = o.box; if (!b || !(b.min[0] <= b.max[0])) return;
			for (var q = 0; q < 3; q++) { lo[q] = Math.min(lo[q], b.min[q]); hi[q] = Math.max(hi[q], b.max[q]); }
			if (!o.geo.length || /петл/i.test(o.name)) return;
			/* сама дверь — самая большая по лицу часть группы; её толщина — по оси «вперёд» */
			var E = U.extent(O, sc, [+k], X); if (!E) return;
			var a = (E.hi[0] - E.lo[0]) * (E.hi[1] - E.lo[1]); if (a > ba) { ba = a; best = E; }
		});
		if (!best || !(lo[0] <= hi[0])) return r;
		/* петля — внутри двери, рядом с ней (до 60 мм) или в том же блоке, что и дверь (не на верхнем уровне модели) */
		var ups = {}; idx.forEach(function (i) { var u = O.objs[i].up; if (u >= 0 && O.objs[u].up >= 0) ups[u] = 1; });
		O.objs.forEach(function (q, j) {
			if (!/петл/i.test(q.name) || !q.box || !(q.box.min[0] <= q.box.max[0])) return;
			if (own[j] || ups[q.up]) { r.n++; return; }
			var c = boxC(q.box); for (var k = 0; k < 3; k++) if (c[k] < lo[k] - 60 || c[k] > hi[k] + 60) return;
			r.n++;
		});
		if (!r.n) return r;
		r.ho = Math.round(Math.min(40, Math.max(3, best.hi[2] - best.lo[2])) + 2);
		return r;
	};
	/* Направление хода по названию в осях X */
	U.dirVec = function (name, X) {
		var m = { front: X.z, back: X.z.map(function (v) { return -v; }), right: X.x, left: X.x.map(function (v) { return -v; }), up: X.y, down: X.y.map(function (v) { return -v; }) };
		return m[name] ? r3(m[name]) : null;
	};
	/* Знак поворота: деталь уходит от корпуса вперёд (центр группы при малом повороте смещается вперёд) */
	U.autoSign = function (p, d, c, front) {
		var u = norm(d); if (!u) return 1;
		var r = rotPt(sub(c, p), u, 10 * D2R), mv = sub(r, sub(c, p));
		return dot(mv, front) >= 0 ? 1 : -1;
	};
	function rotPt(v, u, th) {
		var cs = Math.cos(th), sn = Math.sin(th), k = dot(u, v), cr = cross(u, v);
		return [v[0] * cs + cr[0] * sn + u[0] * k * (1 - cs), v[1] * cs + cr[1] * sn + u[1] * k * (1 - cs), v[2] * cs + cr[2] * sn + u[2] * k * (1 - cs)];
	}

	/* Движение по умолчанию для типа: ось / направление — по габариту группы */
	U.defaults = function (type, E, X, front) {
		var m = { type: type, ms: 1, delay: 0, ease: 'io', space: 'group', sign: 1, a0: 0, a1: 0, dist: 0, dirName: 'front', edge: '' };
		if (!E) E = { lo: [0, 0, 0], hi: [100, 100, 100] };
		var c = fromAx(X, [(E.lo[0] + E.hi[0]) / 2, (E.lo[1] + E.hi[1]) / 2, (E.lo[2] + E.hi[2]) / 2]);
		if (U.isRot(type)) {
			m.edge = type === 'swing' ? 'left' : (type === 'lift' ? 'top' : 'bottom');
			var e = U.edge(E, X, m.edge, false);
			m.p = e.p; m.d = e.d; m.a1 = type === 'swing' ? 105 : 90;
			m.sign = U.autoSign(m.p, m.d, c, front || X.z);
		} else {
			m.dirName = type === 'drawer' ? 'front' : 'right';
			m.d = U.dirVec(m.dirName, X); m.p = r3(c);
			var w = E.hi[0] - E.lo[0], dz = E.hi[2] - E.lo[2];
			m.dist = type === 'drawer' ? Math.max(50, Math.round(dz * 0.75 / 10) * 10) : Math.max(50, Math.round(w * 0.9 / 10) * 10);
			m.ms = 0.8;
		}
		return m;
	};
	/* Проверка движения: [] — всё верно, иначе тексты ошибок */
	U.check = function (m) {
		var e = [];
		if (!m) return ['Нет движения'];
		function num(v) { return typeof v === 'number' && isFinite(v); }
		if (!m.d || !norm(m.d)) e.push(U.isRot(m.type) ? 'Направление оси — нулевое: задайте ось' : 'Направление хода — нулевое');
		if (U.isRot(m.type)) {
			if (!m.p || !m.p.every(num)) e.push('Точка оси задана неверно');
			if (!num(m.a0) || !num(m.a1) || Math.abs(m.a0) > 360 || Math.abs(m.a1) > 360) e.push('Углы — от −360 до 360°');
			else if (Math.abs(m.a1 - m.a0) < 0.1) e.push('Начальный и конечный угол совпадают');
			if (m.hauto === false && (!num(m.ho) || !num(m.hs) || Math.abs(m.ho) > 300 || Math.abs(m.hs) > 300)) e.push('Вынос на петле — от −300 до 300 мм');
		} else if (!num(m.dist) || m.dist <= 0 || m.dist > 10000) e.push('Ход — от 1 до 10 000 мм');
		if (!num(m.ms) || m.ms < 0.05 || m.ms > 30) e.push('Длительность — от 0,05 до 30 с');
		if (!num(m.delay) || m.delay < 0 || m.delay > 30) e.push('Задержка — от 0 до 30 с');
		return e;
	};

	/* ----------------------------- привязка к модели ----------------------------- */
	/* Группы проекта → записи для 3D: { user: 1, L: [{ k, id, t, p, u, sign, a0, a1, d, ms, delay, ease, par, mem, big, n }], of: { объект: k },
	   n, lost: [{ g: имя группы, n: имя участника }], near: [{ g, n }] — найдено не по ключу, а по имени и месту }. */
	U.resolve = function (an, O, sc) {
		var R = { user: 1, item: !O, L: [], of: {}, n: 0, lost: [], near: [], byId: {} };
		if (!an || !an.groups || !an.groups.length) return R;
		var H = host(O, sc), byKey = {};
		for (var i = 0; i < H.n; i++) byKey[H.key(i)] = i;
		function find(m) {
			if (byKey[m.k] !== undefined) return { i: byKey[m.k] };
			if (!m.c) return null;
			var best = -1, bd = 40;
			for (var j = 0; j < H.n; j++) {
				if (nmKey(H.name(j)) !== m.n) continue;
				var b = H.box(j); if (!b || !(b.min[0] <= b.max[0])) continue;
				var d = len(sub(boxC(b), m.c)); if (d < bd) { bd = d; best = j; }
			}
			return best >= 0 ? { i: best, near: 1 } : null;
		}
		an.groups.forEach(function (g) {
			var m = g.m, mem = [];
			(g.mem || []).forEach(function (x) { var f = find(x); if (!f) R.lost.push({ g: g.name, n: x.n }); else { if (f.near) R.near.push({ g: g.name, n: x.n }); mem.push(f.i); } });
			if (!m || g.on === false || U.check(m).length || !mem.length) { R.byId[g.id] = -1; return; }
			var rot = U.isRot(m.type), u = norm(m.d);
			var rec = { k: R.L.length, id: g.id, t: rot ? 1 : 2, p: (m.p || [0, 0, 0]).slice(), u: rot ? u : (m.rev ? u.map(function (q) { return -q; }) : u), sign: (m.sign < 0 ? -1 : 1) * (m.flip ? -1 : 1), a0: (m.a0 || 0) * D2R, a1: (m.a1 || 0) * D2R,
				d: m.dist || 0, ms: Math.max(50, (m.ms || 1) * 1000), delay: Math.max(0, (m.delay || 0) * 1000), ease: m.ease || 'io', par: -1, pid: g.parent || '', mem: mem, big: !g.small, n: g.name, o: mem[0] };
			if (rot) { var off = U.hingeOff(g, m, O, sc, mem); if (off) rec.off = off; }
			R.byId[g.id] = rec.k; R.L.push(rec);
		});
		/* вложенность: родитель — по явной ссылке; участник — в самой внутренней группе (позже в списке — внутреннее) */
		R.L.forEach(function (r) { r.par = r.pid && R.byId[r.pid] >= 0 ? R.byId[r.pid] : -1; });
		R.L.forEach(function (r) { var d = 0; for (var q = r; q.par >= 0 && d < 50; q = R.L[q.par], d++); r.depth = d; });
		R.L.slice().sort(function (a, b) { return a.depth - b.depth; }).forEach(function (r) { r.mem.forEach(function (i) { R.of[i] = r.k; }); });
		R.n = R.L.length;
		return R;
	};
	/* Вектор выноса на петле (мм, оси модели) или null: от корпуса — вперёд группы, вбок — от середины двери к оси. */
	U.hingeOff = function (g, m, O, sc, mem) {
		if (!U.isRot(m.type)) return null;
		var hv = m.hauto === false ? { ho: Number(m.ho) || 0, hs: Number(m.hs) || 0 } : U.hingeAuto(O, sc, mem);
		if (!hv.ho && !hv.hs) return null;
		var X = U.axesGroup(g, O, sc, mem), E = U.extent(O, sc, mem, X), u = norm(m.d), fr = X.z, sd = [0, 0, 0];
		if (E && u) {
			var c = fromAx(X, [(E.lo[0] + E.hi[0]) / 2, (E.lo[1] + E.hi[1]) / 2, (E.lo[2] + E.hi[2]) / 2]), v = sub(m.p || c, c);
			v = add(v, u, -dot(v, u)); v = add(v, fr, -dot(v, fr)); sd = norm(v) || sd;
		}
		var o = add(fr.map(function (q) { return q * hv.ho; }), sd, hv.hs);
		return len(o) > 1e-6 ? o : null;
	};
	/* Записи, которые двигают объект oi — снаружи внутрь: группы его самого и объектов выше по дереву, плюс их родители. */
	U.chain = function (R, O, oi) {
		var ks = [];
		if (O) { for (var u = oi; u >= 0 && u !== undefined; u = O.objs[u].up) if (R.of[u] !== undefined && ks.indexOf(R.of[u]) < 0) ks.unshift(R.of[u]); }
		else if (R.of[oi] !== undefined) ks.push(R.of[oi]);
		if (!ks.length) return ks;
		/* явные родители самой внутренней группы, которых нет в цепочке по дереву */
		var full = [];
		for (var k = ks[ks.length - 1], g = 0; k >= 0 && g < 50; k = R.L[k].par, g++) full.unshift(k);
		ks.forEach(function (q) { if (full.indexOf(q) < 0) full.unshift(q); });
		/* порядок: от внешней к внутренней по глубине */
		return full.sort(function (a, b) { return R.L[a].depth - R.L[b].depth; });
	};
	function mul(a, b) {
		var r = new Array(16);
		for (var c = 0; c < 4; c++) for (var rr = 0; rr < 4; rr++) r[c * 4 + rr] = a[rr] * b[c * 4] + a[4 + rr] * b[c * 4 + 1] + a[8 + rr] * b[c * 4 + 2] + a[12 + rr] * b[c * 4 + 3];
		return r;
	}
	/* матрица одной группы при ходе e (уже с плавностью) */
	function one(a, e) {
		if (a.t === 2) { var s = a.d * e; return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, a.u[0] * s, a.u[1] * s, a.u[2] * s, 1]; }
		var th = a.sign * (a.a0 + (a.a1 - a.a0) * e), c = Math.cos(th), s2 = Math.sin(th), t = 1 - c, x = a.u[0], y = a.u[1], z = a.u[2];
		var R = [t * x * x + c, t * x * y + s2 * z, t * x * z - s2 * y, 0,
			t * x * y - s2 * z, t * y * y + c, t * y * z + s2 * x, 0,
			t * x * z + s2 * y, t * y * z - s2 * x, t * z * z + c, 0, 0, 0, 0, 1];
		var p = a.p, rp = [R[0] * p[0] + R[4] * p[1] + R[8] * p[2], R[1] * p[0] + R[5] * p[1] + R[9] * p[2], R[2] * p[0] + R[6] * p[1] + R[10] * p[2]];
		R[12] = p[0] - rp[0]; R[13] = p[1] - rp[1]; R[14] = p[2] - rp[2];
		/* вынос на петле: в начале хода дверь отходит быстрее, к концу — на весь вынос */
		if (a.off) { var f = Math.sin(Math.max(0, Math.min(1, e)) * Math.PI / 2); R[12] += a.off[0] * f; R[13] += a.off[1] * f; R[14] += a.off[2] * f; }
		return R;
	}
	U.one = one;
	/* Матрица (по столбцам) при ходе prog { k: 0…1 } по цепочке; null — не двигается. Каждый раз — от исходного положения. */
	U.matrix = function (R, ch, prog) {
		var M = null;
		for (var i = 0; i < ch.length; i++) {
			var a = R.L[ch[i]], e = U.ease(a.ease, prog[ch[i]] || 0);
			if (!e && !(a.t === 1 && a.a0)) continue;
			var m = one(a, e);
			M = M ? mul(M, m) : m;
		}
		return M;
	};
	/* Шаг времени dt (мс): ход к цели за длительность группы, сначала — её задержка (wait: остаток задержки). */
	U.step = function (R, prog, tgt, dt, wait) {
		var moving = false;
		Object.keys(tgt).forEach(function (k) {
			var a = R.L[k]; if (!a) return;
			var c = prog[k] || 0, t = tgt[k], d = t - c;
			if (Math.abs(d) < 1e-4) { prog[k] = t; return; }
			moving = true;
			if (wait && wait[k] > 0) { wait[k] -= dt; return; }
			var s = dt / a.ms;
			prog[k] = Math.abs(d) <= s ? t : c + (d > 0 ? s : -s);
		});
		return moving;
	};
	/* Что двигать по двойному щелчку: самая внутренняя «большая» группа объекта и всё, что вложено в неё. */
	U.group = function (R, O, oi) {
		var ch = U.chain(R, O, oi); if (!ch.length) return [];
		var k = ch[ch.length - 1];
		while (!R.L[k].big && R.L[k].par >= 0) k = R.L[k].par;
		if (!R.L[k].big && O) {
			/* мелкая (петля) без своей двери выше: дверь, в блоке-родителе которой она стоит (как в БАЗИСе) */
			var bigs = R.L.filter(function (r) { return r.big && r.mem.some(function (m) { return inside(O, oi, area(O, m)); }); });
			if (bigs.length === 1) k = bigs[0].k; else return U.below(R, k);
		}
		var out = U.below(R, k);
		/* мелкие группы рядом с большой (петли этой двери, не вложенные в неё явно) — тоже */
		if (O && R.L[k].big) R.L.forEach(function (r) {
			if (r.big || out.indexOf(r.k) >= 0 || r.par >= 0) return;
			var A = area(O, R.L[k].mem[0]);
			if (!r.mem.every(function (m) { return inside(O, m, A); })) return;
			if (R.L.some(function (b) { return b.big && b.k !== k && r.mem.every(function (m) { return b.mem.some(function (bm) { return inside(O, m, area(O, bm)); }); }) && !inside(O, b.mem[0], R.L[k].mem[0]) && b.mem.some(function (bm) { return area(O, bm) !== A; }); })) return;
			out.push(r.k);
		});
		return out;
	};
	function inside(O, i, top) { for (var u = i; u >= 0 && u !== undefined; u = O.objs[u].up) if (u === top) return true; return false; }
	function area(O, i) { var P = O.objs[i].up; return (P >= 0 && O.objs[P].up >= 0) ? P : i; }
	U.below = function (R, k) { var out = [k], again = true; while (again) { again = false; R.L.forEach(function (r) { if (out.indexOf(r.k) < 0 && out.indexOf(r.par) >= 0) { out.push(r.k); again = true; } }); } return out; };

	/* ----------------------------- из БАЗИСа и предложения ----------------------------- */
	function uniq(list, name) { var n = name, i = 2; while (list.some(function (g) { return g.name === n; })) n = name + ' (' + i++ + ')'; return n; }
	function topName(O, oi) { var u = oi; while (O.objs[u].up >= 0) u = O.objs[u].up; return O.objs[u].name; }
	/* Анимации БАЗИСа (BM.anim.bind) → группы: большая (дверь, ящик) — своя группа, мелкие внутри неё (петли) — вложенные. */
	U.fromBazis = function (B, O, sc, an) {
		var out = [], idOf = {}, nid = (an && an.nid) || 1;
		if (!B || !B.n) return out;
		function inside(i, top) { for (var u = i; u >= 0 && u !== undefined; u = O.objs[u].up) if (u === top) return true; return false; }
		var order = B.L.slice().sort(function (a, b) { return (b.big ? 1 : 0) - (a.big ? 1 : 0); });
		order.forEach(function (a) {
			var par = '';
			/* родитель — самая внутренняя группа, внутри объекта которой стоит этот (у мелких — их дверь) */
			var cand = out.filter(function (g) { return inside(a.o, g._o) && g._o !== a.o; });
			if (cand.length) par = cand.sort(function (x, y) { return y._d - x._d; })[0].id;
			else if (!a.big) {
				/* петля в соседнем блоке: дверь, в блоке-родителе которой она стоит */
				var P = O.objs[a.o].up, area = P >= 0 ? O.objs[P].up : -1;
				var near = out.filter(function (g) { return g._big && area >= 0 && inside(a.o, area) && inside(g._o, area); });
				if (near.length === 1) par = near[0].id;
			}
			var d = 0; for (var u = a.o; u >= 0; u = O.objs[u].up) d++;
			var rot = a.t === 1, nm = String(a.n || O.objs[a.o].name).replace(/[\r\n]+/g, ' ').trim();
			var g = { id: 'g' + nid++, name: uniq(out, nm + (a.big ? ' — ' + topName(O, a.o) : '')), parent: par, on: true, small: !a.big, mem: [U.member(O, sc, a.o)], _o: a.o, _d: d, _big: a.big,
				m: rot ? { type: 'swing', p: r3(a.p), d: r3(a.u), sign: 1, a0: 0, a1: Math.round(a.ang / D2R * 10) / 10, dist: 0, dirName: 'own', space: 'model', edge: '', ms: a.ms / 1000, delay: 0, ease: 'io', hauto: false, ho: 0, hs: 0 }
					: { type: 'drawer', p: [0, 0, 0], d: r3(a.u), sign: 1, a0: 0, a1: 0, dist: Math.round(a.d * 10) / 10, dirName: 'own', space: 'model', edge: '', ms: a.ms / 1000, delay: 0, ease: 'io' } };
			idOf[a.k] = g.id;
			out.push(g);
		});
		out.forEach(function (g) { delete g._o; delete g._d; delete g._big; });
		return { groups: out, nid: nid };
	};
	/* Предложение групп по названиям (если анимаций БАЗИСа нет): блок с «ящ» — ящик, блок с «фасад»/«двер» — распашной;
	   ось двери — у кромки, ближе к которой стоят петли. Возвращает список групп (не записывает). */
	U.suggest = function (O, sc, an) {
		var out = [], nid = (an && an.nid) || 1;
		if (!O) return { groups: out, nid: nid };
		var X = U.axesModel(sc), taken = {};
		function under(i, top) { for (var u = i; u >= 0; u = O.objs[u].up) if (u === top) return true; return false; }
		O.objs.forEach(function (o, i) {
			if (!o.kids.length && !o.geo.length) return;
			var n = String(o.name), kind = /ящ/i.test(n) ? 'drawer' : (/фасад|двер/i.test(n) ? 'swing' : '');
			if (!kind) return;
			for (var u = o.up; u >= 0; u = O.objs[u].up) if (taken[u]) return;
			taken[i] = 1;
			var E = U.extent(O, sc, [i], X); if (!E) return;
			/* фасад — тонкий (по глубине до 150 мм, с петлями), ящик — не больше 1,5 м: наборы вроде «Фасады» на всю модель — не группа */
			if (kind === 'swing' && E.hi[2] - E.lo[2] > 150) return;
			if (Math.max(E.hi[0] - E.lo[0], E.hi[1] - E.lo[1], E.hi[2] - E.lo[2]) > (kind === 'drawer' ? 1500 : 3000)) return;
			var m = U.defaults(kind, E, X, sc.front);
			if (kind === 'drawer') {
				/* длина направляющих из названия (L=350, НД=350): ход на 10 мм меньше */
				var nm = [o.name].concat(o.kids.map(function (j) { return O.objs[j].name; }), o.up >= 0 ? [O.objs[o.up].name].concat(O.objs[o.up].kids.map(function (j) { return O.objs[j].name; })) : []).join(' '), mL = /(?:L|НД)\s*=\s*(\d{3,4})/.exec(nm);
				if (mL) m.dist = Math.max(50, Number(mL[1]) - 10);
			}
			if (kind === 'swing') {
				/* петли рядом: соседи и вложенные объекты с «петл» в названии */
				var ob = o.box, hs = O.objs.filter(function (q) { if (!/петл/i.test(q.name) || !(q.box.min[0] <= q.box.max[0])) return false; var c = boxC(q.box); for (var k = 0; k < 3; k++) if (c[k] < ob.min[k] - 60 || c[k] > ob.max[k] + 60) return false; return true; });
				if (hs.length) {
					var hc = hs.map(function (q) { var c = boxC(q.box); return [dot(c, X.x), dot(c, X.y)]; }), mx = hc.reduce(function (s, q) { return s + q[0]; }, 0) / hc.length, my = hc.reduce(function (s, q) { return s + q[1]; }, 0) / hc.length;
					var dl = Math.abs(mx - E.lo[0]), dr = Math.abs(E.hi[0] - mx), dt = Math.abs(E.hi[1] - my), db = Math.abs(my - E.lo[1]), mn = Math.min(dl, dr, dt, db);
					var ed = mn === dl ? 'left' : (mn === dr ? 'right' : (mn === dt ? 'top' : 'bottom')), e = U.edge(E, X, ed, false);
					m.type = ed === 'top' ? 'lift' : (ed === 'bottom' ? 'flap' : 'swing'); m.edge = ed; m.p = e.p; m.d = e.d; m.a1 = m.type === 'swing' ? 105 : 90;
					m.sign = U.autoSign(m.p, m.d, fromAx(X, [(E.lo[0] + E.hi[0]) / 2, (E.lo[1] + E.hi[1]) / 2, (E.lo[2] + E.hi[2]) / 2]), sc.front);
				}
			}
			out.push({ id: 'g' + nid++, name: uniq(out, n.replace(/[\r\n]+/g, ' ').trim() + ' — ' + topName(O, i)), parent: '', on: true, mem: [U.member(O, sc, i)], m: m });
		});
		return { groups: out, nid: nid };
	};
})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : global));
