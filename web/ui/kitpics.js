/* STHGroup — снимки 3D для листов «Сборки» (вид «Текстуры + Рентген»).
   Листы (core/kit.js) просят картинки (BM.kit.picReqs): общий вид, виды и эскиз блока, шаги схемы, «где деталь», монтаж.
   Здесь они снимаются в скрытом окне 3D по модели из 3D-файла БАЗИСа (без файла — по деталям проекта)
   и кладутся в st._kitPics[key] = { url, m (матрица проекции), w, h }; номера, линии и размеры лист рисует поверх. */
(function () {
	'use strict';
	var KP = window.KitPics = {};
	var PX = 7, MAXPX = 1600, YEL = '#f2b230', ORG = '#e07b00';
	function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
	function App() { return window.App; }

	/* opt.onStep(k, n) — ход работы; opt.prepare() → { sc, glb } (приложение для телефона — своя модель; иначе — раздел «Модель»);
	   opt.px, opt.maxPx — точек на мм листа и предел стороны снимка (телефон — мельче). → число снимков */
	KP.render = async function (st, opt) {
		opt = opt || {};
		var reqs = BM.kit.picReqs(st), got = st._kitPics = st._kitPics || {};
		reqs = reqs.filter(function (q) { return !got[q.key] && (!opt.only || opt.only(q.key)); });
		if (!reqs.length) return 0;
		var r = await (opt.prepare ? opt.prepare() : window.Model.prepare());
		if (!r || !r.sc) return 0;
		var host = document.createElement('div');
		host.style.cssText = 'position:fixed;left:-6000px;top:0;width:800px;height:600px;overflow:hidden;pointer-events:none';
		document.body.appendChild(host);
		var A0 = App(), set = (A0 && A0.S && A0.S.set) || (A0 && A0.set) || {}, v;      // в приложении для телефона настройки — App.set
		try { v = BM.v3d.create(host, { style: (set.model || {}).style, onPick: function () { }, onMenu: function () { }, onDouble: function () { }, animOn: function () { return false; }, texUrl: function (n) { return window.Base ? window.Base.texUrl(n) : ''; } }); }
		catch (e) { host.remove(); return 0; }
		var n = 0;
		try {
			v.setScene(r.sc);
			var G = r.glb;
			if (G) v.setGlb({ g: G.g, O: G.O, M: G.M, A: G.A, dims: [], mats: G.mats, uv: G.uv, texOf: function (rel) { return G.tex[rel] || ''; } });
			v.set('furn', true); v.set('outline', true); v.set('holes', false); v.set('mode', 'tex'); v.set('xray', true);
			var S3 = BM.asm3, map = S3.map(st, G ? G.O : null, G ? G.M : null, G ? G.A : null), seq = S3.seq(st), N = map.n;
			var mats = window.MatLook ? window.MatLook.matSet() : {};
			/* крепёж фигурами по отверстиям: по единицам и по шагам */
			var A = BM.asm, FX = [], fxIdx = new Map(), byUnit = {}, bySt = {}, par = {};
			A.units(st).forEach(function (u) {
				par[u.key] = u.parent || '';
				A.data(st, u).steps.forEach(function (s, si) {
					(s.fh || []).forEach(function (h) {
						var i = fxIdx.get(h);
						if (i === undefined) { i = FX.length; fxIdx.set(h, i); FX.push({ p: h.p, d: h.d || [0, 0, 1], dia: h.dia, dep: h.depth, wood: /шкант/i.test(h.fast) && !/стяжк/i.test(h.fast) }); }
						(byUnit[u.key] = byUnit[u.key] || []).push(i); (bySt[u.key + '|' + si] = bySt[u.key + '|' + si] || []).push(i);
					});
				});
			});
			v.setExtra(FX, 1.6);
			function under(k, us) { for (var x = k; x; x = par[x]) if (us[x]) return true; return false; }
			for (var q = 0; q < reqs.length; q++) {
				var rq = reqs[q], sp = rq.spec, show = [], look = {}, hl = {}, tilt = 0, fit = null, dir = sp.dir || 'iso', k, fxS = {}, fxC = {};
				if (sp.step) {
					var e = seq.filter(function (x) { return x.u === sp.step.u && x.si === sp.step.si; })[0];
					if (!e) continue;
					var f = S3.frame(st, map, e);
					show = f.show; fit = f.fit; tilt = f.tilt || 0; dir = 'iso';
					var nwS = {}; f.nw.forEach(function (o) { nwS[o] = 1; });
					if (G) show = show.filter(function (o) { if (nwS[o] || map.item[o] >= 0) return true; var nm = G.O.objs[o].name; return !(S3.isFast(nm) && !BM.asm.isHw(nm)); });      // мелкий крепёж прошлых шагов — не рисуем: места крепежа — красные точки листа
					for (var si = 0; si <= sp.step.si; si++) (bySt[sp.step.u + '|' + si] || []).forEach(function (i) { fxS[i] = 1; if (si === sp.step.si) fxC[i] = ORG; });
					f.nw.forEach(function (o) { var nm = G ? G.O.objs[o].name : ''; look[o] = { c: e.kind === 'hw' || (map.item[o] < 0 && S3.isFast(nm)) ? ORG : YEL }; });
				} else {
					var us = {}; (sp.units || []).forEach(function (u) { us[u] = 1; });
					(sp.hl || []).forEach(function (i) { hl[i] = 1; });
					Object.keys(byUnit).forEach(function (uk) { if (sp.all || under(uk, us)) byUnit[uk].forEach(function (i) { fxS[i] = 1; }); });
					for (k = 0; k < N; k++) {
						var ch = map.of[k];
						if (sp.all ? (ch || map.loose[k]) : (ch && ch.some(function (c) { return us[c.u]; }))) show.push(k);
						if (hl[map.item[k]]) look[k] = { c: YEL };
					}
				}
				var vis = {}, hid = {};
				show.forEach(function (o) { vis[o] = 1; });
				for (k = 0; k < N; k++) if (!vis[k]) hid[k] = 1;
				if (G) {
					/* детали без видимых объектов — тоже скрыть (кромка и пазы рисуются по деталям) */
					var ion = {}, ih = {}; show.forEach(function (o) { if (map.item[o] >= 0) ion[map.item[o]] = 1; });
					r.sc.items.forEach(function (it, i) { if (!ion[i]) ih[i] = 1; });
					v.setHidden(ih); v.setObjState(hid, {}); v.setLooks(mats, look, {});
				}
				else { v.setHidden(hid); v.setLooks(mats, {}, look); }
				v.setTilt(tilt); v.setExtraState(fxS, fxC);
				var kx = Math.min(opt.px || PX, (opt.maxPx || MAXPX) / Math.max(rq.w, rq.h));
				host.style.width = Math.max(60, Math.round(rq.w * kx)) + 'px'; host.style.height = Math.max(60, Math.round(rq.h * kx)) + 'px';
				v.view(dir);
				v.renderNow();
				if (G) v.fitTo([], [], fit || show); else v.fitTo(fit || show, [], []);
				v.renderNow();
				for (var t = 0; t < 100 && v.texPending && v.texPending() > 0; t++) await wait(50);
				var pm = v.projMatrix(), url = v.snapshot({ bg: '#ffffff', jpeg: 0.86 });
				got[rq.key] = { url: url, m: pm.m, w: pm.w, h: pm.h };
				n++;
				if (opt.onStep) opt.onStep(q + 1, reqs.length);
				if (q % 4 === 3) await wait(0);
			}
		} finally { try { v.dispose(); } catch (e2) { } host.remove(); }
		return n;
	};
})();
