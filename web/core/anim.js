/* STHGroup — анимация блоков, как в БАЗИСе (скрипт выгрузки 1.7 → model.anim).
   У блока БАЗИСа анимация — поворот вокруг оси (дверь, подъёмник, плечо петли) или сдвиг вдоль оси (ящик, купе):
   { n: имя блока, t: 1 поворот | 2 сдвиг, a, b: ось в координатах модели (мм), ang: угол (°), d: ход (мм),
     ms: длительность, c: центр габарита блока }. Здесь: привязка к объектам 3D-файла БАЗИСа (BM.glb.objects),
   матрица объекта при данном ходе анимаций, что открывать по двойному щелчку, шаг времени.
   Работает в окне, в файле для заказчика и под Node.js (без three.js: матрицы 4×4 по столбцам). */
(function (G) {
	'use strict';
	var BM = G.BM = G.BM || {};
	var A = BM.anim = {};

	function nm(s) { return String(s || '').toLowerCase().replace(/_node(_\d+)?$/, '').replace(/[\s@]+/g, ''); }        // «Фасад\r@Макро» = «Фасад Макро»: без пробелов, переводов строки и «@»
	function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
	function len(a) { return Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]); }
	var BIG_ROT = 150, BIG_MOVE = 60;                 // ось двери длиннее 150 мм, ход ящика больше 60 мм — «большая» анимация

	/* Привязка анимаций к объектам 3D-файла: имя то же (или начинается так же) и центр габарита рядом (до 40 мм).
	   Возвращает { L: [{ k, o, t, p, u, ang (рад), d, ms, big, n }], of: { объект: номер анимации }, n: привязано }. */
	A.bind = function (O, anims) {
		var L = [], of = {}, used = {}, byName = {};
		if (!O || !anims || !anims.length) return { L: L, of: of, n: 0 };
		O.objs.forEach(function (o, i) { var k = nm(o.name); (byName[k] = byName[k] || []).push(i); });
		function center(o) { var b = o.box; return [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2]; }
		anims.forEach(function (an) {
			if (!an || (an.t !== 1 && an.t !== 2) || !an.a || !an.b) return;
			var ax = sub(an.b, an.a), l = len(ax);
			if (!(l > 0.01)) return;
			if (an.t === 1 && !an.ang) return;
			if (an.t === 2 && !(an.d > 0.5)) return;
			var key = nm(an.n), cand = byName[key] || [];
			if (!cand.length) O.objs.forEach(function (o, i) { var k = nm(o.name); if (key && (k.indexOf(key) === 0 || key.indexOf(k) === 0) && k.length > 3) cand.push(i); });
			var best = -1, bd = 40;
			cand.forEach(function (i) {
				if (used[i]) return;
				var o = O.objs[i]; if (!(o.box.min[0] <= o.box.max[0])) return;
				var d = an.c ? len(sub(center(o), an.c)) : 0;
				if (d < bd) { bd = d; best = i; }
			});
			if (best < 0) return;
			used[best] = 1;
			var u = [ax[0] / l, ax[1] / l, ax[2] / l], rec = { k: L.length, o: best, t: an.t, p: an.a.slice(), u: u, ang: (Number(an.ang) || 0) * Math.PI / 180, d: Number(an.d) || 0,
				ms: Math.max(200, Math.min(5000, Number(an.ms) || 1000)), n: an.n || '' };
			rec.big = an.t === 1 ? l >= BIG_ROT : rec.d >= BIG_MOVE;
			of[best] = rec.k; L.push(rec);
		});
		return { L: L, of: of, n: L.length };
	};

	/* Анимации, которые двигают объект: его и всех блоков выше — снаружи внутрь. */
	A.chain = function (B, O, oi) {
		var r = [];
		for (var u = oi; u >= 0 && u !== undefined; u = O.objs[u].up) if (B.of[u] !== undefined) r.unshift(B.of[u]);
		return r;
	};
	A.ease = function (p) { return p <= 0 ? 0 : (p >= 1 ? 1 : (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2)); };

	function mul(a, b) {
		var r = new Array(16);
		for (var c = 0; c < 4; c++) for (var rr = 0; rr < 4; rr++) r[c * 4 + rr] = a[rr] * b[c * 4] + a[4 + rr] * b[c * 4 + 1] + a[8 + rr] * b[c * 4 + 2] + a[12 + rr] * b[c * 4 + 3];
		return r;
	}
	/* матрица одной анимации при ходе e (0…1) */
	function one(a, e) {
		if (a.t === 2) { var s = a.d * e; return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, a.u[0] * s, a.u[1] * s, a.u[2] * s, 1]; }
		var th = a.ang * e, c = Math.cos(th), s2 = Math.sin(th), t = 1 - c, x = a.u[0], y = a.u[1], z = a.u[2];
		var R = [t * x * x + c, t * x * y + s2 * z, t * x * z - s2 * y, 0,
			t * x * y - s2 * z, t * y * y + c, t * y * z + s2 * x, 0,
			t * x * z + s2 * y, t * y * z - s2 * x, t * z * z + c, 0, 0, 0, 0, 1];
		var p = a.p, rp = [R[0] * p[0] + R[4] * p[1] + R[8] * p[2], R[1] * p[0] + R[5] * p[1] + R[9] * p[2], R[2] * p[0] + R[6] * p[1] + R[10] * p[2]];
		R[12] = p[0] - rp[0]; R[13] = p[1] - rp[1]; R[14] = p[2] - rp[2];
		return R;
	}
	A.one = one;
	/* Матрица объекта (по столбцам) при ходе анимаций prog { номер: 0…1 }; null — объект не двигается. */
	A.matrix = function (B, O, oi, prog, chain) {
		var ch = chain || A.chain(B, O, oi), M = null;
		for (var i = 0; i < ch.length; i++) {
			var e = A.ease(prog[ch[i]] || 0);
			if (!e) continue;
			var m = one(B.L[ch[i]], e);
			M = M ? mul(M, m) : m;
		}
		return M;
	};

	function inside(O, oi, top) { for (var u = oi; u >= 0 && u !== undefined; u = O.objs[u].up) if (u === top) return true; return false; }
	/* Что открывать по двойному щелчку по объекту (1.15): самый внешний блок с анимацией над ним — как «основной блок»
	   в БАЗИСе — и все анимации внутри него, все сразу (дверь с петлями, ящик с вложенными частями). Мелкие анимации
	   рядом (петли соседнего блока этой двери) — тоже. Щелчок по петле без своей двери выше — её дверь.
	   Щелчок по корпусу (нет анимации выше) — ничего. Возвращает список номеров анимаций. */
	A.group = function (B, O, oi) {
		var top = -1;
		for (var u = oi; u >= 0 && u !== undefined; u = O.objs[u].up) if (B.of[u] !== undefined) top = u;
		if (top >= 0 && !B.L[B.of[top]].big) {
			/* только мелкая (петля): первый блок выше, внутри которого ровно одна большая анимация, — её дверь */
			for (u = top; u >= 0 && u !== undefined && O.objs[u].up >= 0; u = O.objs[u].up) {
				var bigIn = B.L.filter(function (a) { return a.big && inside(O, a.o, u); });
				if (bigIn.length === 1) { top = bigIn[0].o; for (var w = top; w >= 0 && w !== undefined; w = O.objs[w].up) if (B.of[w] !== undefined) top = w; break; }
				if (bigIn.length > 1) break;
			}
		}
		if (top < 0) return [];
		var main = B.of[top], P = O.objs[top].up, area = (P >= 0 && O.objs[P].up >= 0) ? P : top;
		return B.L.filter(function (a) { return a.k === main || inside(O, a.o, top) || (!a.big && inside(O, a.o, area) && !B.L.some(function (b) { return b.big && b.o !== top && !inside(O, top, b.o) && inside(O, a.o, b.o); })); }).map(function (a) { return a.k; });
	};
	/* Размеры, проставленные в БАЗИСе (скрипт 1.10 → model.dims): к какому объекту 3D-файла привязан каждый — чтобы
	   ехал вместе с ящиком или дверью. Владелец — по имени и центру (до 40 мм), иначе — самый маленький объект,
	   в габарит которого попадают обе точки. Возвращает [{ d: размер, o: номер объекта или -1 }]. */
	A.bindDims = function (O, dims) {
		if (!dims || !dims.length) return [];
		function center(o) { var b = o.box; return [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2]; }
		function vol(o) { var b = o.box; return (b.max[0] - b.min[0] + 1) * (b.max[1] - b.min[1] + 1) * (b.max[2] - b.min[2] + 1); }
		function has(o, p) { var b = o.box, e = 2; return p[0] >= b.min[0] - e && p[0] <= b.max[0] + e && p[1] >= b.min[1] - e && p[1] <= b.max[1] + e && p[2] >= b.min[2] - e && p[2] <= b.max[2] + e; }
		var ok = function (o) { return o && o.box && o.box.min[0] <= o.box.max[0]; };
		return dims.filter(function (d) { return d && d.a && d.b; }).map(function (d) {
			var best = -1, bd = 40, key = nm(d.n);
			if (O && key && d.c) O.objs.forEach(function (o, i) { if (!ok(o) || nm(o.name) !== key) return; var x = len(sub(center(o), d.c)); if (x < bd) { bd = x; best = i; } });
			if (best < 0 && O) { var bv = Infinity; O.objs.forEach(function (o, i) { if (!ok(o) || !has(o, d.a) || !has(o, d.b)) return; var v = vol(o); if (v < bv) { bv = v; best = i; } }); }
			return { d: d, o: best };
		});
	};
	/* Шаг времени dt (мс): ход каждой анимации идёт к цели за её длительность. true — что-то ещё движется. */
	A.step = function (B, prog, tgt, dt) {
		var moving = false;
		Object.keys(tgt).forEach(function (k) {
			var a = B.L[k]; if (!a) return;
			var c = prog[k] || 0, t = tgt[k], d = t - c;
			if (Math.abs(d) < 1e-4) { prog[k] = t; return; }
			var s = dt / a.ms;
			prog[k] = Math.abs(d) <= s ? t : c + (d > 0 ? s : -s);
			moving = true;
		});
		return moving;
	};
	/* Открыто ли (больше половины главных анимаций списка открыты). */
	A.isOpen = function (prog, list, tgt) { var n = 0, o = 0; list.forEach(function (k) { n++; if (((tgt && tgt[k] !== undefined) ? tgt[k] : (prog[k] || 0)) > 0.5) o++; }); return n > 0 && o * 2 >= n; };
})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : global));
