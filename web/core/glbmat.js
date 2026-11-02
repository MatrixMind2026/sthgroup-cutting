/* STHGroup — материалы и развёртка текстур модели из 3D-файла БАЗИСа (общие для раздела «Модель» и файла
   для заказчика). В 3D-файле (.glb) нет развёртки, её пишет скрипт выгрузки 1.6 рядом: «<имя> — 3D.uv»
   (по треугольнику: три вершины в координатах модели, их точки на картинке и номер материала). Треугольнику
   3D-файла развёртка находится по месту — по центру треугольника. Свойства материала (прозрачность,
   зеркальность, блик, шаг текстуры) — из выгрузки (model.mats), как в «Настройке текстур материала» БАЗИСа. */
(function (G) {
	'use strict';
	var BM = G.BM = G.BM || {};
	var GM = BM.glbmat = {};

	/* файл развёртки: 'BMUV', версия, число треугольников, длина JSON, JSON { mats }, по 16 float32 на треугольник */
	GM.parseUV = function (ab) {
		var dv = new DataView(ab), u8 = new Uint8Array(ab);
		if (u8.length < 16 || u8[0] !== 66 || u8[1] !== 77 || u8[2] !== 85 || u8[3] !== 86) throw new Error('это не файл развёртки STHGroup');
		var n = dv.getUint32(8, true), hl = dv.getUint32(12, true), js = '';
		var bytes = u8.subarray(16, 16 + hl);
		if (typeof TextDecoder !== 'undefined') js = new TextDecoder('utf-8').decode(bytes);
		else js = decodeURIComponent(escape(String.fromCharCode.apply(null, bytes)));
		var head = JSON.parse(js.replace(/\s+$/, '')), off = 16 + hl;
		var f = new Float32Array(ab.slice ? ab.slice(off, off + n * 64) : ab, 0, n * 16);
		return { mats: head.mats || [], f: f, n: n };
	};
	var Q = 2;                                    // сетка поиска — 0,5 мм
	function key(x, y, z) { return Math.round(x * Q) + ',' + Math.round(y * Q) + ',' + Math.round(z * Q); }
	/* указатель: центр треугольника → номера треугольников */
	GM.index = function (U) {
		var map = new Map(), f = U.f;
		for (var t = 0; t < U.n; t++) {
			var o = t * 16, k = key((f[o] + f[o + 5] + f[o + 10]) / 3, (f[o + 1] + f[o + 6] + f[o + 11]) / 3, (f[o + 2] + f[o + 7] + f[o + 12]) / 3), a = map.get(k);
			if (a) a.push(t); else map.set(k, [t]);
		}
		return { U: U, map: map };
	};
	/* имя материала в 3D-файле — без артикула, в БАЗИСе — с ним: «…, Egger» и «…, EggerH3700 ST10» */
	function sameMat(glbName, bzName) { return !glbName || bzName === glbName || bzName.indexOf(glbName) === 0; }
	/* Развёртка для треугольников P (по 9 чисел: x y z ×3, координаты модели). Возвращает uv (по 6 чисел на
	   треугольник) и ok[t] — нашлась ли развёртка; где не нашлась — NaN. */
	GM.triUV = function (I, P, glbMat) {
		var n = P.length / 9, uv = new Float32Array(n * 6), ok = new Uint8Array(n), f = I.U.f, mats = I.U.mats, hits = 0;
		for (var t = 0; t < n; t++) {
			var p = t * 9, cx = (P[p] + P[p + 3] + P[p + 6]) / 3, cy = (P[p + 1] + P[p + 4] + P[p + 7]) / 3, cz = (P[p + 2] + P[p + 5] + P[p + 8]) / 3;
			var cand = I.map.get(key(cx, cy, cz));
			if (!cand) {                                                   // центр на границе ячейки — соседние ячейки
				cand = [];
				for (var dx = -1; dx <= 1; dx++) for (var dy = -1; dy <= 1; dy++) for (var dz = -1; dz <= 1; dz++) {
					var c2 = I.map.get((Math.round(cx * Q) + dx) + ',' + (Math.round(cy * Q) + dy) + ',' + (Math.round(cz * Q) + dz));
					if (c2) cand = cand.concat(c2);
				}
			}
			var best = -1, bestD = 1e9;
			for (var c = 0; c < cand.length; c++) {
				var o = cand[c] * 16, d = 0;
				for (var w = 0; w < 3; w++) {                                // каждой вершине — ближайшая вершина кандидата
					var vx = P[p + w * 3], vy = P[p + w * 3 + 1], vz = P[p + w * 3 + 2], m = 1e9;
					for (var q = 0; q < 3; q++) { var ex = f[o + q * 5] - vx, ey = f[o + q * 5 + 1] - vy, ez = f[o + q * 5 + 2] - vz, dd = ex * ex + ey * ey + ez * ez; if (dd < m) m = dd; }
					d += m;
				}
				if (!sameMat(glbMat, mats[f[o + 15]] || '')) d += 1;
				if (d < bestD) { bestD = d; best = cand[c]; }
			}
			if (best < 0 || bestD > 1) { for (var z = 0; z < 6; z++) uv[t * 6 + z] = NaN; continue; }
			var b = best * 16;
			for (w = 0; w < 3; w++) {
				var px = P[p + w * 3], py = P[p + w * 3 + 1], pz = P[p + w * 3 + 2], bq = 0, bm = 1e9;
				for (q = 0; q < 3; q++) { var fx = f[b + q * 5] - px, fy = f[b + q * 5 + 1] - py, fz = f[b + q * 5 + 2] - pz, d2 = fx * fx + fy * fy + fz * fz; if (d2 < bm) { bm = d2; bq = q; } }
				uv[t * 6 + w * 2] = f[b + bq * 5 + 3]; uv[t * 6 + w * 2 + 1] = -f[b + bq * 5 + 4];     // у БАЗИСа v вниз по картинке, у 3D-просмотра — вверх
			}
			ok[t] = 1; hits++;
		}
		return { uv: uv, ok: ok, hits: hits, n: n };
	};

	/* свойства материала из выгрузки (model.mats) по имени из 3D-файла: точное имя или имя + артикул */
	GM.info = function (mats, name) {
		if (!mats || !name) return null;
		if (mats[name]) return mats[name];
		var best = null, bl = 0;
		for (var k in mats) if (mats.hasOwnProperty(k) && k.indexOf(name) === 0 && k.length > bl) { best = mats[k]; bl = k.length; }
		return best;
	};
	/* Как рисовать материал. src — материал из 3D-файла ({ color 0…1, tex }), info — из выгрузки (может не быть:
	   выгрузка старым скриптом — тогда стекло узнаётся по названию). */
	GM.look = function (name, src, info) {
		src = src || { color: [0.8, 0.8, 0.8], tex: '' }; info = info || null;
		var r = { name: name, color: [src.color[0], src.color[1], src.color[2]], tex: src.tex || '', opacity: 1, glass: false, hide: false,
			rough: 0.86, metal: 0, env: 0.15, sx: 1000, sy: 1000 };
		var t = info && info.t !== undefined ? Number(info.t) : (/стекл|прозрачн|рассеив/i.test(name) ? 0.85 : 0);
		if (t > 1) t = t / 100;
		if (/^вырез/i.test(name) || /^~\$\$\$/.test(name) || t >= 0.99) r.hide = true;          // вырезы и габаритная рамка не рисуются
		if (t > 0.01) { r.glass = true; r.opacity = Math.max(0.08, 1 - t); r.tex = ''; }
		if (info) {
			if (info.sx > 0) r.sx = info.sx;
			if (info.sy > 0) r.sy = info.sy;
			var mir = Number(info.mir) || 0, sh = Math.min(1, (Number(info.sh) || 0) / 128), br = Number(info.br) || 0;
			if (info.vr && info.vr.rf && !mir) mir = Math.min(1, info.vr.rf / 255);
			r.rough = Math.max(0.06, 0.86 - 0.8 * Math.max(sh, mir));
			r.env = 0.15 + mir * 1.6 + br * 0.6;
			if (info.cu === 1 && !r.tex && info.c !== undefined && !(src.color[0] + src.color[1] + src.color[2] > 0)) {
				var c = Number(info.c); r.color = [(c & 255) / 255, ((c >> 8) & 255) / 255, ((c >> 16) & 255) / 255];
			}
		}
		if (/хром|никел|сталь|алюмин|металл|met still/i.test(name) && !/черн|пласт/i.test(name)) { r.metal = 0.75; r.rough = Math.min(r.rough, 0.35); r.env = Math.max(r.env, 0.9); }
		if (r.glass) { r.rough = 0.04; r.env = Math.max(r.env, 1.4); r.color = [0.86, 0.92, 0.92]; }          // стекло — почти бесцветное, как в БАЗИСе
		return r;
	};

	/* Свой вид материала или детали (1.19.1): s = { t: прозрачность 0…100 %, c: оттенок '#rrggbb', g: блеск 0…100 }
	   (любое поле может не быть — тогда как в БАЗИСе). Материал — из настроек программы, деталь — из проекта:
	   деталь главнее материала (GM.merge). Возвращает новый вид, исходный не меняется. */
	GM.merge = function (a, b) {
		if (!a && !b) return null;
		var r = {};
		[a, b].forEach(function (x) { if (x) ['t', 'c', 'g'].forEach(function (k) { if (x[k] !== undefined && x[k] !== null && x[k] !== '') r[k] = x[k]; }); });
		return Object.keys(r).length ? r : null;
	};
	GM.hex = function (c) { var h = function (v) { var s = Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16); return s.length < 2 ? '0' + s : s; }; return '#' + h(c[0]) + h(c[1]) + h(c[2]); };
	GM.adjust = function (L, s) {
		var r = {}; for (var k in L) if (L.hasOwnProperty(k)) r[k] = L[k];
		if (!s) return r;
		if (s.t !== undefined && isFinite(s.t)) {
			var t = Math.max(0, Math.min(100, Number(s.t)));
			if (t >= 0.5) { if (!r.glass) r.env = Math.max(r.env, 0.6); r.glass = true; r.opacity = Math.max(0.03, 1 - t / 100); }
			else { r.glass = false; r.opacity = 1; }
		}
		if (s.c && /^#[0-9a-f]{6}$/i.test(s.c)) { var n = parseInt(s.c.slice(1), 16); r.color = [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; r.tint = 1; }
		if (s.g !== undefined && isFinite(s.g)) { var g = Math.max(0, Math.min(100, Number(s.g))) / 100; r.rough = Math.max(0.03, 0.9 - 0.87 * g); r.env = 0.1 + 1.9 * g; r.gloss = 1; }
		return r;
	};
	/* значения для окна по виду: { t, c, g } */
	GM.vals = function (L) {
		return { t: L.glass ? Math.round((1 - L.opacity) * 100) : 0, c: GM.hex(L.color), g: Math.round(Math.max(0, Math.min(1, (0.9 - L.rough) / 0.87)) * 100) };
	};
})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : global));
