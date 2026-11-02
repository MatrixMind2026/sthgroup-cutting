/* STHGroup — 3D-модель для заказчика одним файлом .html: модель из БАЗИСа с текстурами, название,
   заказ, габариты, организация и телефон из настроек; вращать мышью или пальцем, виды, «Открыть фасады»,
   двойной щелчок по фасаду открывает его; галочкой — список блоков и материалов. Цен в файле нет.
   Файл открывается в любом браузере и на телефоне без интернета: всё (three.js, модель, текстуры) внутри. */
(function () {
	'use strict';
	var U = window.UI, esc = U.esc;
	var C = window.Client3D = {};

	function b64(u8) {
		var s = '', CH = 0x8000;
		for (var i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
		return btoa(s);
	}
	/* текстура: уменьшить до 1024 точек по длинной стороне и вернуть картинкой JPEG внутри файла */
	function texData(url) {
		return new Promise(function (res) {
			if (!url) { res(''); return; }
			var im = new Image();
			im.onload = function () {
				var k = Math.min(1, 1024 / Math.max(im.width, im.height)), c = document.createElement('canvas');
				c.width = Math.max(1, Math.round(im.width * k)); c.height = Math.max(1, Math.round(im.height * k));
				c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
				try { res(c.toDataURL('image/jpeg', 0.86)); } catch (e) { res(''); }
			};
			im.onerror = function () { res(''); };
			im.src = url;
		});
	}
	async function text(path) { var r = await fetch(path); if (!r.ok) throw new Error('нет ' + path); return r.text(); }

	/* Данные для файла: всё, что нужно странице заказчика, кроме three.js и чтения glb. */
	C.data = async function (opt) {
		var A = window.App, S3 = window.Model.S, G = S3.glb, sc = S3.sc, set = A.S.set || {}, mdl = (A.S.doc && A.S.doc.model) || {};
		if (!G) throw new Error('нет модели из БАЗИСа');
		var tex = {};
		await Promise.all(Object.keys(G.tex).map(async function (rel) { tex[rel] = await texData(G.tex[rel]); }));
		/* панели: рамка (для текстуры) и движение фасада при открывании */
		var items = {}, an = [];
		G.O.objs.forEach(function (o, i) {
			var a = G.A[i] ? G.A[i].a : -1;
			an.push(a);
			if (a < 0 || items[a]) return;
			var t = sc.items[a], mv = BM.m3d.moveAt(t, 1), r = { f: { o: t.f.o, x: t.f.x, y: t.f.y }, tex: t.tex || 0 };
			if (mv && mv.shift) r.sh = mv.shift.map(function (v) { return Math.round(v * 10) / 10; });
			else if (mv) { r.p = mv.p; r.a = mv.a; r.ang = mv.ang; }
			items[a] = r;
		});
		var s = sc.size, up = sc.up, fr = sc.front, ab = function (v) { return [Math.abs(v[0]), Math.abs(v[1]), Math.abs(v[2])]; };
		var h = BM.m3d.vec.dot(s, ab(up)), d = BM.m3d.vec.dot(s, ab(fr)), w = s[0] + s[1] + s[2] - h - d;
		var glbU8 = new Uint8Array(G.ab || new ArrayBuffer(0));
		return {
			title: BM.project.modelName(mdl) || sc.title || 'Модель', order: mdl.order || '', dims: [Math.round(w), Math.round(h), Math.round(d)],
			org: set.org || '', phone: set.phone || '', full: !!opt.full, up: up, front: fr,
			glb: b64(glbU8), uv: G.uvAb ? b64(new Uint8Array(G.uvAb)) : '', look: (set.model && set.model.look) || 'plain', tex: tex, mats: G.mats || {}, items: items, an: an,
			anim: (function () { var ua = window.AnimEd && window.AnimEd.src() === 'mine' ? window.AnimEd.R() : null; if (ua && ua.n) return { user: 1, L: ua.L, of: ua.of, n: ua.n }; return G.B && G.B.n ? { L: G.B.L, of: G.B.of, n: G.B.n } : null; })(),          // свои анимации (1.19) или из БАЗИСа
			lk: window.MatLook ? window.MatLook.client() : null,                                                            // свой вид материалов и деталей (1.19.1)
			light: (A.S.st && A.S.st.work.light) || null,                                                                   // свет из проекта (1.15)
			glow: (function () { var L3 = BM.light3d, mc = set.model || {}, lt = A.S.st && A.S.st.work.light; if (!L3 || !lt || !lt.glow || !lt.glow.on) return null;     // подсветка из модели (1.15.1)
				var d = function (v, x) { return v === undefined ? x : v; };
				return { strips: L3.findGlow(G.O, { diff: d(mc.glowW, L3.WORDS.diff), led: d(mc.glowLed, L3.WORDS.led), prof: d(mc.glowProf, L3.WORDS.prof) }), sh: d(mc.glowSh, '4') }; })(),
			bdims: BM.anim.bindDims(G.O, mdl.dims || []).map(function (r) { var d = r.d; return { a: d.a, b: d.b, y: d.y, ts: d.ts, to: d.to || 0, t: d.tx || String(Math.round((Number(d.v) || 0) * 10) / 10), o: r.o }; }),
			match: G.M.byObj, names: G.O.top.map(function (i) { var nd = S3.tree && S3.tree.objNode ? S3.tree.objNode[i] : null; return nd ? nd.name : G.O.objs[i].name; })
		};
	};

	/* Страница заказчика: стили, разметка и код просмотра (работает без программы). */
	function page(D, three, glbjs, extra) {
		var css = 'html,body{margin:0;height:100%;font-family:"Segoe UI",Roboto,Arial,sans-serif;color:#1c2126;overflow:hidden;background:linear-gradient(#fbfcfd,#dfe5ea)}' +
			'canvas{display:block;touch-action:none}#t{position:absolute;left:20px;top:16px;pointer-events:none}#t b{display:block;font-size:22px;font-weight:650}#t span{color:#5d6770;font-size:14px}' +
			'#o{position:absolute;right:20px;top:18px;text-align:right;font-size:13px;color:#5d6770}#o b{color:#1c2126;font-size:14px;display:block}#o a{color:#5d6770;text-decoration:none}' +
			'#bar{position:absolute;left:50%;bottom:18px;transform:translateX(-50%);display:flex;gap:4px;background:rgba(255,255,255,.93);border:1px solid #d5dbe0;border-radius:14px;padding:5px;box-shadow:0 6px 24px rgba(0,0,0,.08);max-width:calc(100% - 24px);overflow-x:auto}' +
			'#bar button{border:0;background:none;font:inherit;font-size:14px;padding:9px 13px;border-radius:9px;color:#1c2126;white-space:nowrap;cursor:pointer}#bar button.on{background:#0E6B5A;color:#fff}#bar i{width:1px;background:#d5dbe0;margin:4px 2px;flex:none}' +
			'#hint{position:absolute;left:0;right:0;bottom:76px;text-align:center;font-size:12px;color:#7b858e;pointer-events:none}#side{position:absolute;left:14px;top:84px;bottom:100px;width:260px;background:rgba(255,255,255,.95);border:1px solid #d5dbe0;border-radius:12px;padding:10px 8px;font-size:14px;overflow:auto;box-shadow:0 6px 24px rgba(0,0,0,.06)}' +
			'#side h4{margin:4px 6px 6px;font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#7b858e}#side label{display:flex;align-items:center;gap:8px;padding:5px 6px;border-radius:7px;cursor:pointer}#side label:hover{background:#eef2f4}' +
			'#side .sw{width:14px;height:14px;border-radius:3px;border:1px solid rgba(0,0,0,.2);flex:none;background-size:cover}#side .m{padding:4px 6px;display:flex;gap:8px;align-items:center}' +
			'.dim{position:absolute;transform:translate(-50%,-50%);background:rgba(255,255,255,.92);border-radius:4px;padding:1px 6px;font-size:12px;pointer-events:none}.dim.bd{color:#1565c0;font-size:11px;border:1px solid rgba(21,101,192,.35)}' +
			'#load{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#5d6770}' +
			'#side.off{display:none}@media (max-width:700px){#t{left:12px;top:10px}#t b{font-size:17px}#t span{font-size:12px}#o{display:none}#hint{display:none}#side{left:8px;right:8px;width:auto;top:auto;bottom:68px;max-height:45%}#bar{bottom:10px;gap:0}#bar button{padding:8px 7px;font-size:12.5px}}';
		var body = '<div id="load">Модель загружается…</div><div id="t"><b>' + esc(D.title) + '</b><span>' + esc([D.order ? 'Заказ ' + D.order : '', D.dims.join(' × ') + ' мм'].filter(Boolean).join(' · ')) + '</span></div>' +
			(D.org || D.phone ? '<div id="o">' + (D.org ? '<b>' + esc(D.org) + '</b>' : '') + (D.phone ? '<a href="tel:' + esc(D.phone.replace(/[^\d+]/g, '')) + '">' + esc(D.phone) + '</a>' : '') + '</div>' : '') +
			(D.full ? '<div id="side"' + '><h4>Состав</h4><div id="parts"></div><h4 style="margin-top:12px">Материалы</h4><div id="mats"></div></div>' : '') +
			'<div id="bar"><button data-v="iso" class="on">Вид</button><button data-v="front">Спереди</button><button data-v="side">Сбоку</button><button data-v="top">Сверху</button><i></i><button id="bOpen">' + (D.anim && D.anim.n ? 'Открыть всё' : 'Открыть фасады') + '</button><button id="bDims">Размеры</button><i></i>' + (D.full ? '<button id="bSide" class="on">Состав</button>' : '') + '<button id="bFull" title="Во весь экран">⛶</button></div>' +
			'<div id="hint">Вращайте мышью или пальцем · колесо — ближе · двойной щелчок по фасаду — открыть</div>';
		var js = '(' + viewer.toString() + ')(window.__D);';
		return '<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"><title>' + esc(D.title) + ' — 3D</title><style>' + css + '</style></head><body>' + body +
			'<script>' + three.replace(/<\/script/gi, '<\\/script') + '</script><script>' + glbjs.replace(/<\/script/gi, '<\\/script') + '</script>' + (extra || []).map(function (x) { return '<script>' + x.replace(/<\/script/gi, '<\\/script') + '</script>'; }).join('') + '<script>window.__D=' + JSON.stringify(D).replace(/</g, '\\u003c') + ';</script><script>' + js + '</script></body></html>';
	}

	/* Код страницы заказчика. Запускается в браузере заказчика, программа его только вставляет. */
	function viewer(D) {
		var T = window.THREE, BMg = window.BM.glb, GM = window.BM.glbmat;
		var bin = atob(D.glb), u8 = new Uint8Array(bin.length);
		for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
		var g = BMg.parse(u8.buffer), O = BMg.objects(g);
		var R = new T.WebGLRenderer({ antialias: true, alpha: true }), W = innerWidth, H = innerHeight;
		R.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); R.setSize(W, H); document.body.insertBefore(R.domElement, document.body.firstChild);
		if ('outputColorSpace' in R) R.outputColorSpace = T.SRGBColorSpace;
		var sc = new T.Scene(), root = new T.Group(); root.matrixAutoUpdate = false; sc.add(root);
		var shine = D.look === 'shine';
		var LB = window.BM.light3d && D.light ? window.BM.light3d.base(D.light) : { hemi: 1, cam: 1, bg: null };                 // «Вечер» — общий свет приглушён
		if (LB.bg) document.body.style.background = 'linear-gradient(' + LB.bg[0] + ',' + LB.bg[1] + ')';
		sc.add(new T.HemisphereLight(0xffffff, 0x8a8f94, 0.95 * (shine ? 1.05 : 1.6) * LB.hemi));
		if (shine) { try { sc.environment = window.BM.post3d.studio(R); } catch (e) { } }
		var cam = new T.PerspectiveCamera(30, W / H, 10, 200000), sun = new T.DirectionalLight(0xffffff, 0.75 * (shine ? 2.4 : 2.6) * LB.cam); sun.position.set(-0.4, 0.7, 1); cam.add(sun); sc.add(cam);
		/* оси: X — вправо, Y — вверх (верх изделия), Z — к зрителю (лицо изделия) */
		var up = D.up, fr = D.front, rt = [up[1] * fr[2] - up[2] * fr[1], up[2] * fr[0] - up[0] * fr[2], up[0] * fr[1] - up[1] * fr[0]];
		root.matrix.set(rt[0], rt[1], rt[2], 0, up[0], up[1], up[2], 0, fr[0], fr[1], fr[2], 0, 0, 0, 0, 1);
		var L = new T.TextureLoader(), texC = {}, mats = {};
		function tex(rel) { var u = D.tex[rel]; if (!u) return null; if (!texC[rel]) { var t = L.load(u, function () { need = 1; }); t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = R.capabilities.getMaxAnisotropy(); if ('colorSpace' in t) t.colorSpace = T.SRGBColorSpace; texC[rel] = t; } return texC[rel]; }
		/* материал — как в БАЗИСе: прозрачность, зеркальность, блик (общий код с программой — BM.glbmat) */
		var uvIx = null;
		if (D.uv) { try { var ub = atob(D.uv), uu = new Uint8Array(ub.length); for (var qq = 0; qq < ub.length; qq++) uu[qq] = ub.charCodeAt(qq); uvIx = GM.index(GM.parseUV(uu.buffer)); } catch (e) { uvIx = null; } }
		var LKm = (D.lk && D.lk.m) || {}, LKo = (D.lk && D.lk.o) || {}, matsO = {};
		function mat(name, oi) {
			var own = LKo[oi] && GM.merge ? LKo[oi] : null, ck = own ? name + '\u0001' + oi : name, cache = own ? matsO : mats;
			if (cache[ck]) return cache[ck];
			var Lk = GM.look(name, g.mats[name], GM.info(D.mats, name)), mp = Lk.tex ? tex(Lk.tex) : null;
			if (GM.adjust) Lk = GM.adjust(Lk, GM.merge(LKm[name], own));                                            // прозрачность, оттенок, блеск — как в программе
			var mm = new T.MeshStandardMaterial({ color: mp && !Lk.tint ? 0xffffff : new T.Color().setRGB(Lk.color[0], Lk.color[1], Lk.color[2], T.SRGBColorSpace), map: mp, side: T.DoubleSide,
				roughness: shine || Lk.gloss ? Lk.rough : Math.max(Lk.rough, 0.6), metalness: shine ? Lk.metal : Lk.metal * 0.4, envMapIntensity: shine ? Lk.env : 0 });
			if (Lk.glass) { mm.transparent = true; mm.opacity = Lk.opacity; mm.depthWrite = false; }
			mm.userData.L = Lk;
			return cache[ck] = mm;
		}
		var gobs = [];
		O.objs.forEach(function (o, oi) {
			if (!o.geo.length || /^вырез/i.test(o.name)) { gobs.push(null); return; }
			var a = D.an[oi], it = a >= 0 && D.match[oi] !== undefined ? D.items[a] : null, byM = {};
			o.geo.forEach(function (ge) {
				var m = ge.m; g.meshes[ge.mesh].prims.forEach(function (p) {
					if (/^вырез/i.test(p.mat)) return;
					var Lm = byM[p.mat] || (byM[p.mat] = { pos: [], nrm: [] }), P = p.pos, N = p.nrm, I = p.idx, n = I ? I.length : P.length / 3;
					for (var k = 0; k < n; k++) { var v = I ? I[k] : k, x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2]; Lm.pos.push(m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]); if (N) { var q = N[v * 3], r = N[v * 3 + 1], s = N[v * 3 + 2]; Lm.nrm.push(m[0] * q + m[4] * r + m[8] * s, m[1] * q + m[5] * r + m[9] * s, m[2] * q + m[6] * r + m[10] * s); } }
				});
			});
			var grp = new T.Group(); grp.matrixAutoUpdate = false;
			Object.keys(byM).forEach(function (mn) {
				var Lm = byM[mn]; if (!Lm.pos.length) return;
				var mt = mat(mn, oi), Lk = mt.userData.L; if (Lk.hide) return;
				var geo = new T.BufferGeometry(), pos = new Float32Array(Lm.pos), n = pos.length / 3, uv = new Float32Array(n * 2), bx = o.box, sz = [bx.max[0] - bx.min[0], bx.max[1] - bx.min[1], bx.max[2] - bx.min[2]];
				geo.setAttribute('position', new T.BufferAttribute(pos, 3));
				if (Lm.nrm.length === Lm.pos.length) geo.setAttribute('normal', new T.BufferAttribute(new Float32Array(Lm.nrm), 3)); else geo.computeVertexNormals();
				var nr = geo.attributes.normal.array;
				for (var k = 0; k < n; k++) {
					if (it) { var f = it.f, dx = pos[k * 3] - f.o[0], dy = pos[k * 3 + 1] - f.o[1], dz = pos[k * 3 + 2] - f.o[2], a0 = dx * f.x[0] + dy * f.x[1] + dz * f.x[2], b0 = dx * f.y[0] + dy * f.y[1] + dz * f.y[2]; uv[k * 2] = (it.tex === 1 ? b0 : a0) / Lk.sx; uv[k * 2 + 1] = (it.tex === 1 ? a0 : b0) / Lk.sy; continue; }
					var ax = Math.abs(nr[k * 3]), ay = Math.abs(nr[k * 3 + 1]), az = Math.abs(nr[k * 3 + 2]), A1, B1;
					if (ax >= ay && ax >= az) { A1 = 1; B1 = 2; } else if (ay >= az) { A1 = 0; B1 = 2; } else { A1 = 0; B1 = 1; }
					if (sz[A1] > sz[B1]) { var tt = A1; A1 = B1; B1 = tt; }
					uv[k * 2] = pos[k * 3 + A1] / Lk.sx; uv[k * 2 + 1] = pos[k * 3 + B1] / Lk.sy;
				}
				if (uvIx && mt.map) { var Ru = GM.triUV(uvIx, pos, mn); for (var tq = 0; tq < Ru.n; tq++) if (Ru.ok[tq]) for (var zq = 0; zq < 6; zq++) uv[tq * 6 + zq] = Ru.uv[tq * 6 + zq]; }
				geo.setAttribute('uv', new T.BufferAttribute(uv, 2));
				var me = new T.Mesh(geo, mt); me.userData.oi = oi; me.castShadow = !Lk.glass; me.receiveShadow = true; if (Lk.glass) me.renderOrder = 2; grp.add(me);
				if (it) { var ln = new T.LineSegments(new T.EdgesGeometry(geo, 28), new T.LineBasicMaterial({ color: 0x2a3036, transparent: true, opacity: 0.45 })); grp.add(ln); }
			});
			root.add(grp); gobs.push({ g: grp, a: a });
		});
		/* открывание фасадов: доля по деталям; двойной щелчок — один фасад, кнопка — все.
		   Есть анимация из БАЗИСа (D.anim) — открывается по ней: двери, ящики, петли, как в БАЗИСе */
		var afterDraw = null, openK = {}, target = {}, all = false, need = 1, mA = new T.Matrix4(), mR = new T.Matrix4(), mB = new T.Matrix4();
		var AB = D.anim && D.anim.n && window.BM.anim && (!D.anim.user || window.BM.animUser) ? D.anim : null, AN = AB && AB.user ? window.BM.animUser : window.BM.anim, aProg = {}, aTgt = {}, aWait = {}, aLast = 0, aCh = [];
		function aMat(oi, ch) { return AB.user ? AN.matrix(AB, ch, aProg) : AN.matrix(AB, O, oi, aProg, ch); }
		function aGo(k, v) { if (AB.user && Math.abs((aProg[k] || 0) - v) > 1e-4) aWait[k] = AB.L[k].delay || 0; aTgt[k] = v; }
		if (AB) O.objs.forEach(function (o, oi) { aCh[oi] = AN.chain(AB, O, oi); });
		function place() {
			gobs.forEach(function (q, oi) {
				if (!q) return;
				if (AB) { var am = aCh[oi].length ? aMat(oi, aCh[oi]) : null; if (am) q.g.matrix.fromArray(am); else q.g.matrix.identity(); q.g.matrixWorldNeedsUpdate = true; return; }
				var it = q.a >= 0 ? D.items[q.a] : null, k = q.a >= 0 ? (openK[q.a] || 0) : 0, m = q.g.matrix;
				m.identity();
				if (it && k > 0) {
					if (it.sh) m.makeTranslation(it.sh[0] * k, it.sh[1] * k, it.sh[2] * k);
					else if (it.a) { mA.makeTranslation(-it.p[0], -it.p[1], -it.p[2]); mR.makeRotationAxis(new T.Vector3(it.a[0], it.a[1], it.a[2]).normalize(), it.ang * k); mB.makeTranslation(it.p[0], it.p[1], it.p[2]); m.premultiply(mA).premultiply(mR).premultiply(mB); }
				}
				q.g.matrixWorldNeedsUpdate = true;
			});
			need = 1;
		}
		/* качество: сглаживание и тени в углах, если браузер умеет (WebGL2); иначе — как есть */
		var post = null;
		var moving = false;                     // пока движется — без тяжёлого прохода качества, чтобы плавно
		function draw() {
			if (SP.length) { cam.updateMatrixWorld(); window.BM.light3d.maskUpdate(T, SP, cam); }
			if (R.capabilities.isWebGL2 && window.BM.post3d && post !== false && !moving) { try { if (!post) post = window.BM.post3d.create(R); post.render(sc, cam); return; } catch (e) { post = false; } }
			R.render(sc, cam);
		}
		function animate(ts) {
			var was = moving; moving = false;
			if (AB) { var dt = aLast ? Math.min(50, ts - aLast) : 16; aLast = ts; if (AN.step(AB, aProg, aTgt, dt, aWait)) moving = true; else aLast = 0; }
			Object.keys(target).forEach(function (a) { var c = openK[a] || 0, t = target[a], d = t - c; if (Math.abs(d) > 0.001) { openK[a] = c + Math.sign(d) * Math.min(Math.abs(d), 0.04); moving = true; } else openK[a] = t; });
			if (moving) { place(); moveGlow(); }
			else if (was) need = 1;
			if (need) { need = 0; placeCam(); cam.updateMatrixWorld(); dims(); draw(); if (afterDraw) afterDraw(); }
			requestAnimationFrame(animate);
		}
		function openAll(v) { if (AB) { AB.L.forEach(function (a) { aGo(a.k, v ? 1 : 0); }); return; } Object.keys(D.items).forEach(function (a) { if (D.items[a].sh || D.items[a].a) target[a] = v ? 1 : 0; }); }
		/* камера: вращение вокруг центра изделия */
		var box = new T.Box3(); root.updateMatrixWorld(true); gobs.forEach(function (q) { if (q) box.expandByObject(q.g); });
		/* свои источники света из проекта: солнце, лампы, ленты; тени */
		var GL = [], SP = [];                    // ленты подсветки: свет только внутри своего модуля
		if (window.BM.light3d && D.light) {
			var L3 = window.BM.light3d, LC = L3.norm(D.light), LR = L3.build(T, LC, box, { lampMark: false }), shN = LR.shadows ? 1 : 0;      // шарика лампы у заказчика нет
			sc.add(LR.g);
			if (D.glow && D.glow.strips.length) {
				var GR = L3.buildGlow(T, D.glow.strips, LC.glow, { cfg: LC, shadows: D.glow.sh, maxShadows: Math.max(0, Math.min(12, (R.capabilities.maxTextures || 16) - 6)) }), gcol = L3.glowColor(LC.glow), ge = Math.min(1.6, 0.35 + LC.glow.br / 100 * 0.75);
				shN += GR.shadows;
				GR.list.forEach(function (q) {
					root.add(q.g); q.ch = AB ? AN.chain(AB, O, q.o) : []; GL.push(q);
					gobs.forEach(function (gq, j) {
						if (!gq) return; var inB = false, isD = false;
						for (var u = j; u >= 0 && u !== undefined; u = O.objs[u].up) { if (u === q.blk) inB = true; if (u === q.o) isD = true; }
						if (!inB) return;
						gq.g.children.forEach(function (m) { if (!m.isMesh) return; m.castShadow = false; if (isD) { m.material = m.material.clone(); m.material.emissive.setRGB(gcol[0] * ge, gcol[1] * ge, gcol[2] * ge); if (m.material.transparent && m.material.opacity < 0.9) m.material.opacity = 0.9; } });
					});
				});
			}
			if (shN) { R.shadowMap.enabled = true; R.shadowMap.type = T.PCFShadowMap; }
			GL.forEach(function (q) { q.g.children.forEach(function (o) { if (o.isSpotLight) SP.push(o); }); });
			if (SP.length) sc.traverse(function (o) { if (o.isMesh) [].concat(o.material).forEach(function (m) { L3.maskMat(T, m); }); });
		}
		function moveGlow() { GL.forEach(function (q) { var m = q.ch.length ? aMat(q.o, q.ch) : null; if (m) q.g.matrix.fromArray(m); else q.g.matrix.identity(); q.g.matrixWorldNeedsUpdate = true; }); }
		moveGlow();
		/* размеры, проставленные в БАЗИСе: едут со своим ящиком или дверью */
		var BDs = (D.bdims || []).map(function (d) {
			var a = new T.Vector3().fromArray(d.a), b = new T.Vector3().fromArray(d.b), u = b.clone().sub(a), Ln = u.length(); if (!(Ln > 0.5)) return null;
			u.normalize(); var y = new T.Vector3().fromArray(d.y || [0, 1, 0]).normalize(), ts = d.ts || 20, s = Math.min(ts * 0.6, Ln / 4), w = s * 0.32, pos = [];
			var P = function (p) { pos.push(p.x, p.y, p.z); }; P(a); P(b);
			[[a, 1], [b, -1]].forEach(function (q) { var t = q[0].clone().addScaledVector(u, s * q[1]); P(q[0]); P(t.clone().addScaledVector(y, w)); P(q[0]); P(t.clone().addScaledVector(y, -w)); });
			var geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
			var ln = new T.LineSegments(geo, new T.LineBasicMaterial({ color: 0x1565c0, depthTest: false, transparent: true })); ln.renderOrder = 5; ln.matrixAutoUpdate = false; ln.visible = false; root.add(ln);
			return { ln: ln, o: d.o, ch: AB && d.o >= 0 ? AN.chain(AB, O, d.o) : [], mid: a.clone().add(b).multiplyScalar(0.5).addScaledVector(y, ts * 0.75 + (d.to || 0)), t: d.t };
		}).filter(Boolean);
		var C0 = box.getCenter(new T.Vector3()), S0 = box.getSize(new T.Vector3()), orbit = { az: -0.55, el: 0.3, dist: 1, t: C0.clone() };
		function fit() { var r = Math.max(S0.x, S0.y, S0.z * 0.6) * 0.5, t = Math.tan(cam.fov * Math.PI / 360); orbit.dist = Math.max(r / t, r / (t * cam.aspect)) * 1.35 + S0.z * 0.5; orbit.t.copy(C0); need = 1; }
		function placeCam() { var ce = Math.cos(orbit.el); cam.aspect = W / H; cam.near = Math.max(5, orbit.dist / 200); cam.far = orbit.dist * 20 + 20000; cam.position.set(orbit.t.x + Math.sin(orbit.az) * ce * orbit.dist, orbit.t.y + Math.sin(orbit.el) * orbit.dist, orbit.t.z + Math.cos(orbit.az) * ce * orbit.dist); cam.lookAt(orbit.t); var sd = document.getElementById('side'); if (sd && !sd.classList.contains('off') && W > 700) cam.setViewOffset(W, H, -140, 0, W, H); else cam.clearViewOffset(); cam.updateProjectionMatrix(); }
		var VIEWS = { iso: [-0.55, 0.3], front: [0, 0], side: [-Math.PI / 2, 0], top: [0, Math.PI / 2 - 0.001] };
		function setView(v) { orbit.az = VIEWS[v][0]; orbit.el = VIEWS[v][1]; fit(); [].forEach.call(document.querySelectorAll('#bar [data-v]'), function (b) { b.classList.toggle('on', b.dataset.v === v); }); }
		/* управление: мышь и пальцы */
		var el = R.domElement, P = {}, drag = null;
		el.addEventListener('pointerdown', function (e) { el.setPointerCapture(e.pointerId); P[e.pointerId] = { x: e.clientX, y: e.clientY }; var ids = Object.keys(P); drag = ids.length === 2 ? { pinch: Math.hypot(P[ids[0]].x - P[ids[1]].x, P[ids[0]].y - P[ids[1]].y), d0: orbit.dist } : { x: e.clientX, y: e.clientY, pan: e.button === 2 || e.shiftKey }; });
		el.addEventListener('pointermove', function (e) {
			if (!P[e.pointerId] || !drag) return; P[e.pointerId] = { x: e.clientX, y: e.clientY };
			var ids = Object.keys(P);
			if (drag.pinch && ids.length === 2) { var d = Math.hypot(P[ids[0]].x - P[ids[1]].x, P[ids[0]].y - P[ids[1]].y); orbit.dist = Math.max(200, drag.d0 * drag.pinch / Math.max(d, 1)); need = 1; return; }
			var dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
			if (drag.pan) { var k = 2 * orbit.dist * Math.tan(cam.fov * Math.PI / 360) / H, ex = new T.Vector3(), ey = new T.Vector3(), ez = new T.Vector3(); cam.matrixWorld.extractBasis(ex, ey, ez); orbit.t.addScaledVector(ex, -dx * k).addScaledVector(ey, dy * k); }
			else { orbit.az -= dx * 0.006; orbit.el = Math.max(-1.5, Math.min(1.5, orbit.el + dy * 0.006)); }
			need = 1;
		});
		function upP(e) { delete P[e.pointerId]; if (!Object.keys(P).length) drag = null; }
		el.addEventListener('pointerup', upP); el.addEventListener('pointercancel', upP);
		el.addEventListener('contextmenu', function (e) { e.preventDefault(); });
		el.addEventListener('wheel', function (e) { e.preventDefault(); orbit.dist = Math.max(200, orbit.dist * Math.exp((e.deltaY > 0 ? 1 : -1) * 0.12)); need = 1; }, { passive: false });
		var ray = new T.Raycaster();
		function openAt(x, y) {
			var r = el.getBoundingClientRect(); ray.setFromCamera(new T.Vector2((x - r.left) / r.width * 2 - 1, -((y - r.top) / r.height) * 2 + 1), cam);
			var list = []; gobs.forEach(function (q) { if (q && q.g.visible) q.g.children.forEach(function (c) { if (c.isMesh) list.push(c); }); });
			var h = ray.intersectObjects(list, false); if (!h.length) return;
			if (AB) { var Lg = AN.group(AB, O, h[0].object.userData.oi); if (!Lg.length) return; var bg = Lg.filter(function (k) { return AB.L[k].big; }), op = window.BM.anim.isOpen(aProg, bg.length ? bg : Lg, aTgt); Lg.forEach(function (k) { aGo(k, op ? 0 : 1); }); return; }
			var a = gobs[h[0].object.userData.oi].a; if (a < 0 || !(D.items[a].sh || D.items[a].a)) return;
			target[a] = (target[a] || openK[a] || 0) > 0.5 ? 0 : 1;
		}
		el.addEventListener('dblclick', function (e) { openAt(e.clientX, e.clientY); });
		var lastTap = 0; el.addEventListener('touchend', function (e) { var t = Date.now(); if (t - lastTap < 320 && e.changedTouches[0]) openAt(e.changedTouches[0].clientX, e.changedTouches[0].clientY); lastTap = t; });
		/* габаритные размеры подписями на модели */
		var showDims = false, dimEls = [];
		function dims() {
			dimEls.forEach(function (d) { d.remove(); }); dimEls = [];
			BDs.forEach(function (q) { q.ln.visible = false; });
			if (!showDims) return;
			var b = box, pts = [[[b.min.x, b.min.y, b.max.z], [b.max.x, b.min.y, b.max.z], D.dims[0]], [[b.min.x, b.min.y, b.max.z], [b.min.x, b.max.y, b.max.z], D.dims[1]], [[b.max.x, b.min.y, b.min.z], [b.max.x, b.min.y, b.max.z], D.dims[2]]];
			var taken = [];
			BDs.forEach(function (q) {
				var am = q.ch.length ? aMat(q.o, q.ch) : null; if (am) q.ln.matrix.fromArray(am); else q.ln.matrix.identity(); q.ln.matrixWorldNeedsUpdate = true;
				var hid = q.o >= 0 && gobs[q.o] && !gobs[q.o].g.visible; q.ln.visible = !hid; if (hid) return;
				root.updateMatrixWorld(true);
				var m = q.mid.clone().applyMatrix4(q.ln.matrixWorld).project(cam), x = (m.x + 1) / 2 * W, yy = (1 - m.y) / 2 * H, hw = q.t.length * 3.8 + 6;
				if (taken.some(function (r) { return Math.abs(r[0] - x) < r[2] + hw && Math.abs(r[1] - yy) < 18; })) return;             // числа не налезают друг на друга
				taken.push([x, yy, hw]);
				var e = document.createElement('div'); e.className = 'dim bd'; e.textContent = q.t; e.style.left = x + 'px'; e.style.top = yy + 'px'; document.body.appendChild(e); dimEls.push(e);
			});
			pts.forEach(function (p) { var m = new T.Vector3((p[0][0] + p[1][0]) / 2, (p[0][1] + p[1][1]) / 2, (p[0][2] + p[1][2]) / 2).project(cam), d = document.createElement('div'); d.className = 'dim'; d.textContent = p[2]; d.style.left = ((m.x + 1) / 2 * W) + 'px'; d.style.top = ((1 - m.y) / 2 * H) + 'px'; document.body.appendChild(d); dimEls.push(d); });
		}
		if (document.getElementById('bar')) document.getElementById('bar').addEventListener('click', function (e) {
			var b = e.target.closest('button'); if (!b) return;
			if (b.dataset.v) setView(b.dataset.v);
			else if (b.id === 'bOpen') { all = !all; openAll(all); b.textContent = all ? (AB ? 'Закрыть всё' : 'Закрыть фасады') : (AB ? 'Открыть всё' : 'Открыть фасады'); b.classList.toggle('on', all); }
			else if (b.id === 'bDims') { showDims = !showDims; b.classList.toggle('on', showDims); need = 1; }
			else if (b.id === 'bSide') { var sd = document.getElementById('side'); sd.classList.toggle('off'); b.classList.toggle('on', !sd.classList.contains('off')); need = 1; }
			else if (b.id === 'bFull') { if (document.fullscreenElement) document.exitFullscreen(); else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen(); }
		});
		/* состав и материалы (если включено при сохранении) */
		var parts = document.getElementById('parts');
		if (parts) {
			O.top.forEach(function (ti) {
				var lab = document.createElement('label'), sub = [];
				(function walk(i) { sub.push(i); O.objs[i].kids.forEach(walk); })(ti);
				lab.innerHTML = '<input type="checkbox" checked> ' + String(D.names[O.top.indexOf(ti)] || O.objs[ti].name).replace(/</g, '&lt;');
				lab.querySelector('input').onchange = function () { var on = this.checked; sub.forEach(function (i) { if (gobs[i]) gobs[i].g.visible = on; }); need = 1; };
				parts.appendChild(lab);
			});
			var used = {}; gobs.forEach(function (q) { if (q) q.g.children.forEach(function (c) { if (c.isMesh) used[c.material.uuid] = c.material; }); });
			var mDiv = document.getElementById('mats'), names = Object.keys(mats).filter(function (n) { return used[mats[n].uuid] && !/^noname$/i.test(n); });
			names.forEach(function (n) { var m = mats[n], d = document.createElement('div'); d.className = 'm'; var tx = g.mats[n] && g.mats[n].tex ? D.tex[g.mats[n].tex] : ''; d.innerHTML = '<span class="sw" style="' + (tx ? 'background-image:url(' + tx + ')' : 'background:#' + m.color.getHexString()) + '"></span>' + n.replace(/</g, '&lt;'); mDiv.appendChild(d); });
		}
		addEventListener('resize', function () { W = innerWidth; H = innerHeight; R.setSize(W, H); need = 1; });
		if (parts && innerWidth <= 700) { document.getElementById('side').classList.add('off'); document.getElementById('bSide').classList.remove('on'); }
		document.getElementById('load').remove();
		setView('iso'); place();
		requestAnimationFrame(animate);
	}

	/* Кнопка «Заказчику»: галочка «состав и материалы», сохранение в папку документов проекта. */
	C.save = async function () {
		var A = window.App, S3 = window.Model.S, set = A.S.set;
		if (!S3.glb) { U.toast('Нужна модель из БАЗИСа: выгрузите её скриптом 1.5.'); return; }
		set.client = set.client || {};
		var v = await U.modal({ title: '3D-модель для заказчика', width: 520,
			body: '<p>Один файл .html: заказчик открывает его двойным щелчком — в браузере на компьютере или на телефоне, без интернета и без программы. Вращать модель, смотреть с разных сторон, открывать фасады. Цен в файле нет.</p>' +
				'<label class="chk"><input type="checkbox" id="clFull"' + (set.client.full ? ' checked' : '') + '> Состав и материалы — список блоков (скрыть и показать) и материалов</label>' +
				'<p class="mute">В углу — ' + esc([set.org || 'организация не задана', set.phone || 'телефон не задан'].join(' · ')) + ' (меняется в «Настройки → Общие → Оформление»).</p>',
			buttons: [{ label: 'Отмена', value: false }, { label: 'Сохранить', primary: true, run: function (m) { return { full: m.querySelector('#clFull').checked }; } }] });
		if (!v) return;
		set.client.full = v.full ? 1 : 0; A.saveSettings();
		var dir = window.Dlg.outDir(), name = window.Dlg.fileStem() + ' — 3D для заказчика.html', path = U.join(dir, name);
		U.toast('Собираю файл для заказчика…', { ms: 2500 });
		try {
			var D = await C.data(v), html = page(D, await text('lib/three.min.js'), await text('core/glb.js'), [await text('core/glbmat.js'), await text('ui/v3dpost.js'), await text('core/anim.js'), await text('core/animuser.js'), await text('ui/light3d.js')]);
			await U.api.write(path, new TextEncoder().encode(html));
			U.toast('Файл для заказчика сохранён: ' + name + ' (' + (html.length / 1048576).toFixed(1).replace('.', ',') + ' МБ)', { actions: [{ label: 'Открыть', run: function () { U.api.open(path).catch(U.error); } }, { label: 'Папка', run: function () { U.api.open(dir).catch(U.error); } }], ms: 15000 });
			C.last = path;
		} catch (e) { U.error('Не удалось сохранить файл для заказчика: ' + (e && e.message ? e.message : e)); }
	};
	C.page = page;
})();
