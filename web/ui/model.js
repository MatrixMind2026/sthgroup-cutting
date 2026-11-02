/* STHGroup — раздел «Модель»: изделие в 3D. Слева — «Структура модели» как в БАЗИСе (дерево блоков,
   панелей и фурнитуры со столбцами «Поз.» и «Обозн.», скрытое — серым) и «Свойства» выбранного; список
   материалов; над моделью — кнопки вида одним рядом. Модель рисуется из 3D-файла, который сохраняет сам
   БАЗИС (скрипт 1.5, «<модель> — 3D.glb»), а без него — по деталям проекта. Расчёт сцены — core/m3d.js,
   чтение 3D-файла — core/glb.js, рисование — ui/v3d.js, файл для заказчика — ui/client3d.js. */
(function () {
	'use strict';
	var U = window.UI, M = BM.m3d, GL = BM.glb, $ = U.$, esc = U.esc;
	var Md = window.Model = {};
	/* текстуры в «Базе» поменялись — перекрасить модель */
	Md.texChanged = function () { if (view && view.retex) view.retex(); };
	var view = null, dead = '', inited = false;
	/* состояние раздела: живёт, пока открыт проект */
	var S3 = { sc: null, key: '', tree: null, glb: null, glbNote: '', tab: 'mods', offNode: {}, offMat: {}, offItem: {}, offObj: {}, only: null, onlyO: null, noFac: false,
		sel: {}, osel: {}, nsel: {}, cur: '', open: {}, exNode: '', scheme: '', pos: true, find: '', hidI: {}, hidO: {} };
	Md.S = S3;
	Md.view = function () { return view; };

	function cfg() { var s = window.App.S.set; if (!s.model) s.model = BM.defaults().model; return s.model; }
	function num(v) { return (Math.round(v * 10) / 10).toString().replace('.', ','); }
	function keys(o) { var r = []; for (var k in o) if (o.hasOwnProperty(k) && o[k]) r.push(+k); return r; }
	function plural(n, a, b, c) { return window.App.plural(n, a, b, c); }

	/* ------------------------------ сцена ---------------------------------- */
	function ensureView() {
		if (view || dead) return !!view;
		try {
			view = BM.v3d.create($('mView'), { style: cfg().style, onPick: onPick, onMenu: onMenu, onDouble: onDouble, onAnim: function () { bar(); if (window.AnimEd) window.AnimEd.onAnim(); }, onGizmo: function (h, p, done) { if (window.AnimEd) window.AnimEd.onGizmo(h, p, done); }, animOn: function () { return U.animOn(); }, onPickObj: onPickObj, onMenuObj: onMenuObj, onMeasure: stat, texUrl: function (name) { return window.Base ? window.Base.texUrl(name) : ''; } });
		} catch (e) {
			dead = 'На этом компьютере не включается 3D (нет поддержки WebGL), поэтому модель показать нечем. Остальные разделы работают как обычно.';
			$('mView').innerHTML = '<div class="mDead">' + esc(dead) + '</div>';
			return false;
		}
		applyCfg();
		return true;
	}
	function applyCfg() {
		['outline', 'holes', 'band', 'grooves', 'bdims'].forEach(function (k) { view.set(k, !!cfg()[k]); }); view.set('furn', cfg().furn !== 0);
		if (view.get('look') !== (cfg().look === 'shine' ? 'shine' : 'plain')) view.setLook(cfg().look);
		if (view.get('quality') !== (cfg().quality === 'normal' ? 'normal' : 'high')) view.setQuality(cfg().quality);
	}
	function sceneKey() { var A = window.App, c = cfg(); return [A.S.path, A.S.doc && A.S.doc.exportedAt, A.S.doc && A.S.doc.model.parts.length, c.up, c.front, c.zmode].join('|'); }
	function buildScene() {
		var A = window.App, st = A.S.st, c = cfg(), sigBy = {};
		st.types.forEach(function (t) { t.ids.forEach(function (id) { sigBy[id] = t.sig; }); });
		S3.sc = M.build(A.S.doc, { sigOf: function (id) { return sigBy[id]; }, zmodeHint: st.holes.zmode, zmode: c.zmode >= 0 ? c.zmode : undefined, up: c.up || undefined, front: c.front || undefined });
		S3.doc = A.S.doc; S3.key = sceneKey();
		S3.glb = null; S3.glbNote = ''; S3.glbInfo = null;
		S3.tree = M.tree(A.S.doc, S3.sc);
		resetState();
		if (window.AnimEd) window.AnimEd.reset();
		$('mSearch').value = '';
		document.body.classList.remove('mScheme');
		view.setScene(S3.sc);
		view.setGlb(null);
		$('mScheme').innerHTML = '<option value="">Схема сборки…</option>' + S3.sc.mods.filter(function (m) { return m.items.length > 2; }).map(function (m) { return '<option>' + esc(m.name) + '</option>'; }).join('');
		S3.glbP = loadGlb(A.S.doc, A.S.path);
	}
	/* Для других разделов (3D-шаги «Сборки», 1.20): сцена и 3D-файл текущего проекта, без показа раздела.
	   → Promise { sc, glb } или null (нет 3D в этом окне) */
	Md.prepare = function () {
		var A = window.App;
		if (!A.S.st || !ensureView()) return Promise.resolve(null);
		if (S3.doc !== A.S.doc || S3.key !== sceneKey()) buildScene();
		return Promise.resolve(S3.glbP).then(function () { return S3.sc ? { sc: S3.sc, glb: S3.glb } : null; });
	};
	function resetState() {
		S3.offNode = {}; S3.offMat = {}; S3.offItem = {}; S3.offObj = {}; S3.only = null; S3.onlyO = null; S3.noFac = false;
		S3.sel = {}; S3.osel = {}; S3.nsel = {}; S3.cur = ''; S3.open = { r: 1 }; S3.exNode = ''; S3.scheme = ''; S3.find = ''; S3.hidI = {}; S3.hidO = {};
	}

	/* ------------------------- 3D-файл модели из БАЗИСа ------------------------- */
	/* Ищется рядом с проектом: имя из выгрузки (model.mesh), иначе «<проект> — 3D.glb». */
	async function loadGlb(doc, path) {
		if (!path) return;
		var dir = U.dirOf(path), stem = U.stemOf(path), names = [], m = doc.model || {};
		/* проект одним файлом (скрипт 1.11): 3D, развёртка и текстуры — внутри .bmk, путь «Модель.bmk!\имя» */
		try { var st0 = await U.api.stat(path); if (st0 && st0.packed) { dir = path + '!'; S3.packed = path; } else S3.packed = ''; } catch (eP) { S3.packed = ''; }
		if (m.mesh) names.push(m.mesh);
		names.push(stem + ' — 3D.glb');
		for (var i = 0; i < names.length; i++) {
			var p = U.join(dir, names[i]), bytes = null;
			try { var st = await U.api.stat(p); if (!st || !st.exists) continue; } catch (e0) { continue; }
			try { bytes = await U.api.readBytes(p); } catch (e) { continue; }
			if (S3.doc !== doc) return;                                   // пока читали, открыли другой проект
			/* развёртка текстур (скрипт 1.6): «<имя> — 3D.uv» рядом */
			var uvAb = null, uvName = m.uv || names[i].replace(/\.glb$/i, '.uv');
			try { var su = await U.api.stat(U.join(dir, uvName)); if (su && su.exists) { var ub = await U.api.readBytes(U.join(dir, uvName)); uvAb = ub.buffer.slice(ub.byteOffset, ub.byteOffset + ub.byteLength); } } catch (eU) { uvAb = null; }
			if (S3.doc !== doc) return;
			try { await useGlb(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), dir, names[i], uvAb); }
			catch (e2) { S3.glbNote = 'Не удалось прочитать 3D-файл «' + names[i] + '»: ' + (e2 && e2.message ? e2.message : e2); drawCard(); }
			return;
		}
		if (S3.doc !== doc) return;
		S3.glbNote = m.mesh === undefined ? 'Модель нарисована по деталям: выгрузите её заново скриптом 1.5 — тогда фурнитура и вся модель будут как в БАЗИСе.' :
			'Модель нарисована по деталям: 3D-файла из БАЗИСа рядом с проектом нет.' + (m.diag && m.diag.mesh && m.diag.mesh.err ? ' БАЗИС сообщил: ' + m.diag.mesh.err : '');
		drawCard();
	}
	/* ab — содержимое .glb; dir — папка, где лежат его текстуры (у перетащенного файла — нет) */
	async function useGlb(ab, dir, name, uvAb) {
		var g = GL.parse(ab), O = GL.objects(g), Mt = GL.match(O, S3.sc), A = GL.anchors(O, Mt, S3.sc);
		var mats = (S3.doc.model && S3.doc.model.mats) || {}, tex = {}, rels = {};
		/* свойства 3D: главное — выгрузка из модели; чего в ней нет — из загруженной базы БАЗИСа («База») */
		if (BM.base && BM.base.cur && BM.base.bz3d) {
			var m2 = {}; Object.keys(mats).forEach(function (k) { m2[k] = mats[k]; });
			Object.keys(g.mats).forEach(function (n) {
				var bz = BM.base.bz3d(BM.base.cur, n); if (!bz) return;
				var ex = BM.glbmat.info(mats, n), r = {};
				Object.keys(bz).forEach(function (k) { r[k] = bz[k]; });
				if (ex) Object.keys(ex).forEach(function (k) { r[k] = ex[k]; });
				r.fromBase = 1; m2[n] = r;
			});
			mats = m2;
		}
		/* текстуры: файл рядом с моделью, иначе — из «Базы» по названию материала */
		Object.keys(g.mats).forEach(function (k) { if (g.mats[k].tex) rels[g.mats[k].tex] = k; });
		await Promise.all(Object.keys(rels).map(async function (rel) {
			var p = dir ? U.join(dir, rel.replace(/[\\/]/g, U.sep)) : '', ok = false;
			if (p) { try { var s = await U.api.stat(p); ok = !!(s && (s.size > 0 || s.exists)); } catch (e) { ok = false; } }
			tex[rel] = ok ? U.api.fileUrl(p) : (window.Base && window.Base.texUrl ? window.Base.texUrl(rels[rel]) || '' : '');
		}));
		/* проект одним файлом: его текстуры — в «Базу» тем материалам, у которых своей нет */
		if (S3.packed && window.Base && window.Base.fromModel) {
			var fromPack = Object.keys(rels).map(function (rel) { return { name: rels[rel], path: U.join(dir, rel.replace(/[\\/]/g, U.sep)), rel: rel }; }).filter(function (x) { return tex[x.rel] && tex[x.rel] === U.api.fileUrl(x.path); });
			window.Base.fromModel(fromPack).catch(function () { });
		}
		var uv = null;
		if (uvAb) { try { uv = BM.glbmat.parseUV(uvAb); } catch (eU) { uv = null; } }
		var Bn = BM.anim.bind(O, (S3.doc.model && S3.doc.model.anim) || []);         // анимация блоков из БАЗИСа (скрипт 1.7)
		S3.glb = { g: g, ab: ab, uvAb: uv ? uvAb : null, uv: uv, O: O, M: Mt, A: A, B: Bn, name: name, dir: dir, mats: mats, tex: tex };
		S3.tree = M.treeGlb(S3.doc, S3.sc, O, Mt);
		S3.open = { r: 1 }; S3.nsel = {}; S3.sel = {}; S3.osel = {}; S3.cur = ''; S3.offNode = {};
		view.set('open', 0);
		var r = view.setGlb({ g: g, O: O, M: Mt, A: A, B: Bn, dims: (S3.doc.model && S3.doc.model.dims) || [], mats: mats, uv: uv, texOf: function (rel) { return tex[rel] || ''; } });
		S3.glbNote = '';
		var ui = view.uvInfo ? view.uvInfo() : null;
		S3.glbInfo = { parts: r.objs, tris: Math.round(g.tris), matched: Mt.n, uv: !!uv, uvHits: ui ? ui.hits : 0, uvTris: ui ? ui.tris : 0, anim: Bn.n, animAll: ((S3.doc.model && S3.doc.model.anim) || []).length };
		view.fit();
		applyHidden();
		if (S3.packed) makePreview(S3.packed, S3.doc);
		if (window.AnimEd) { window.AnimEd.sync(); window.AnimEd.render(); }
		if (window.MatLook) window.MatLook.push();
	}
	Md.glb = function () { return S3.glb; };
	/* превью проекта одним файлом: снимок 3D 480 точек в «Модель.bmk!\preview.jpg» — один раз (виден в списке недавних) */
	function makePreview(bmk, doc) {
		var pv = bmk + '!' + U.sep + 'preview.jpg';
		U.api.stat(pv).then(function (st) {
			if (st && st.exists) return;
			setTimeout(function () {
				if (S3.doc !== doc || !view || !view.snapshot) return;
				var img = new Image();
				img.onload = function () {
					if (img.width < 120 || img.height < 80) return;                     // раздел не на экране — снимок потом
					var c = document.createElement('canvas'), k = 480 / Math.max(1, img.width);
					c.width = 480; c.height = Math.max(1, Math.round(img.height * k));
					c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
					var b64 = c.toDataURL('image/jpeg', 0.78).split(',')[1], bin = atob(b64), u8 = new Uint8Array(bin.length);
					for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
					if (S3.doc === doc) window.App.packWrite(bmk, 'preview.jpg', u8);
				};
				try { img.src = view.snapshot({ jpeg: 0.9 }); } catch (e) { }
			}, 1500);
		}).catch(function () { });
	}

	/* Вызывается при любой перерисовке окна. Сцена строится заново, только когда открыт другой проект, модель
	   выгружена заново или поменялись настройки положения; иначе положение камеры и скрытое сохраняются. */
	Md.render = function () {
		var A = window.App;
		if (A.S.section !== 'model' || !A.S.st) return;
		if (!ensureView()) return;
		if (S3.doc !== A.S.doc || S3.key !== sceneKey()) buildScene();
		if (view.styleName() !== cfg().style) view.setStyle(cfg().style);
		applyCfg();
		if (window.MatLook) window.MatLook.push();
		drawList(); drawCard(); bar(); stat();
		if (window.LightUI) window.LightUI.sync(view);
		if (window.AnimEd) { window.AnimEd.sync(); window.AnimEd.render(); }
		view.redraw();
	};
	/* Проект закрыт или сменился — забыть сцену (новая построится при показе раздела). */
	Md.reset = function () { S3.doc = null; S3.key = ''; };

	/* ----------------------------- видимость ------------------------------ */
	/* скрытое через структуру: узел и всё внутри */
	function recalc() {
		var hi = {}, ho = {};
		(function walk(nd, off) {
			off = off || !!S3.offNode[nd.id];
			if (off) { if (nd.it !== undefined) hi[nd.it] = 1; if (nd.ob !== undefined) ho[nd.ob] = 1; }
			for (var i = 0; i < nd.kids.length; i++) walk(nd.kids[i], off);
		})(S3.tree.root, false);
		S3.hidI = hi; S3.hidO = ho;
	}
	function isHidden(t) {
		if (S3.scheme) return t.mod !== S3.scheme || !!S3.offItem[t.i];
		if (S3.only) return !S3.only[t.i];
		return !!(S3.hidI[t.i] || S3.offMat[t.matKey] || S3.offItem[t.i] || (S3.noFac && t.facade));
	}
	/* объект 3D-файла: панель — как её деталь; фурнитура — по своей панели (якорю) и по структуре */
	function objHidden(o) {
		var G = S3.glb, it = G.M.byObj[o], an = G.A[o];
		if (it !== undefined) return isHidden(S3.sc.items[it]) || !!S3.hidO[o];
		if (S3.scheme) { var ref = an && an.a >= 0 ? an.a : (an && an.grp.length ? an.grp[0] : -1); return ref < 0 || S3.sc.items[ref].mod !== S3.scheme; }
		if (S3.onlyO) return !S3.onlyO[o];
		if (S3.only) return true;
		return !!(S3.hidO[o] || S3.offObj[o]);
	}
	function objHidSet() { var ho = {}; if (S3.glb) S3.glb.O.objs.forEach(function (o, i) { if (objHidden(i)) ho[i] = 1; }); return ho; }
	function applyHidden() {
		var h = {}, sel = {}, ho = {}, os = {};
		recalc();
		S3.sc.items.forEach(function (t) { if (isHidden(t)) h[t.i] = 1; else if (S3.sel[t.i]) sel[t.i] = 1; });
		if (S3.glb) S3.glb.O.objs.forEach(function (o, i) { if (objHidden(i)) ho[i] = 1; else if (S3.osel[i]) os[i] = 1; });
		S3.sel = sel; S3.osel = os;
		view.setHidden(h, {}); view.setSelected(sel, {});
		if (S3.glb) view.setObjState(ho, os);
		drawList(); drawCard(); bar(); stat();
	}
	function pushSel() { view.setSelected(S3.sel, {}); if (S3.glb) view.setObjState(objHidSet(), S3.osel); drawCard(); drawList(); stat(); }
	function showAll() {
		S3.offNode = {}; S3.offMat = {}; S3.offItem = {}; S3.offObj = {}; S3.only = null; S3.onlyO = null; S3.noFac = false;
		if (S3.exNode) { S3.exNode = ''; view.set('scope', ''); view.set('explode', 0); }
		applyHidden();
	}

	/* ----------------------------- выбор ---------------------------------- */
	function node(id) { return id === 'r' ? (S3.tree && S3.tree.root) : (S3.tree && S3.tree.byId[id]); }
	function blockOf(nd) { var u = nd && nd.up; while (u && u.kind !== 'block' && u.kind !== 'root') u = u.up; return u && u.kind === 'block' ? u : null; }
	/* раскрыть путь к узлу, чтобы строка была видна */
	function reveal(nd) { for (var u = nd && nd.up; u; u = u.up) S3.open[u.id] = 1; S3.open.r = 1; S3.reveal = 1; }
	/* выделенное в структуре → выделенное в 3D */
	function derive() {
		var sel = {}, os = {};
		Object.keys(S3.nsel).forEach(function (id) {
			var nd = node(id); if (!nd) return;
			if (nd.kind === 'plastic') nd = nd.up;
			(nd.items || []).forEach(function (i) { if (!isHidden(S3.sc.items[i])) sel[i] = 1; });
			(nd.objs || []).forEach(function (o) { if (!S3.glb || !objHidden(o)) os[o] = 1; });
		});
		S3.sel = sel; S3.osel = os;
	}
	function selectNodes(list, add) {
		if (!add) S3.nsel = {};
		list.forEach(function (nd) { if (!nd) return; if (add && S3.nsel[nd.id]) delete S3.nsel[nd.id]; else S3.nsel[nd.id] = 1; });
		var ks = Object.keys(S3.nsel);
		S3.cur = ks.length === 1 ? ks[0] : '';
		/* скрытая деталь, выбранная в структуре или поиске, — показать её */
		ks.forEach(function (id) {
			var nd = node(id); if (!nd || nd.it === undefined) return;
			var t = S3.sc.items[nd.it];
			if (isHidden(t)) { S3.offItem[t.i] = 0; S3.offMat[t.matKey] = 0; for (var u = nd; u; u = u.up) S3.offNode[u.id] = 0; S3.only = null; S3.onlyO = null; if (S3.noFac && t.facade) S3.noFac = false; recalc(); }
		});
		derive();
		applyHidden();
	}
	function selNodeList() { return Object.keys(S3.nsel).map(node).filter(Boolean); }
	/* для редактора анимации (1.19): выделенное — объекты 3D-файла (или детали без него), без вложенных в уже выбранные */
	Md.selObjs = function () {
		if (!S3.sc) return [];
		var out = [];
		if (S3.glb) {
			selNodeList().forEach(function (nd) { if (nd.kind === 'plastic') nd = nd.up; if (nd.ob !== undefined) out.push(nd.ob); else (nd.objs || []).forEach(function (o) { out.push(o); }); });
			if (!out.length) out = keys(S3.osel);
			var O = S3.glb.O, set = {}; out.forEach(function (o) { set[o] = 1; });
			return out.filter(function (o, k) { if (out.indexOf(o) !== k) return false; for (var u = O.objs[o].up; u >= 0; u = O.objs[u].up) if (set[u]) return false; return true; });
		}
		selNodeList().forEach(function (nd) { if (nd.it !== undefined) out.push(nd.it); else (nd.items || []).forEach(function (i) { out.push(i); }); });
		if (!out.length) out = keys(S3.sel);
		return out.filter(function (i, k) { return out.indexOf(i) === k; });
	};
	/* выделить объекты (или детали) в структуре и в 3D */
	Md.selectObjs = function (idx) {
		if (!S3.sc || !S3.tree) return;
		var nodes = idx.map(function (i) { return S3.glb ? (S3.tree.objNode && S3.tree.objNode[i]) : S3.tree.itemNode[i]; }).filter(Boolean);
		if (!nodes.length) { S3.nsel = {}; S3.sel = {}; S3.osel = {}; if (S3.glb) idx.forEach(function (o) { S3.osel[o] = 1; }); else idx.forEach(function (i) { S3.sel[i] = 1; }); pushSel(); return; }
		nodes.forEach(reveal);
		selectNodes(nodes, false);
	};
	function onPick(i, e) {
		closeMenu();
		var nd = i >= 0 ? S3.tree.itemNode[i] : null;
		if (i < 0) { if (!(e.ctrlKey || e.shiftKey)) { S3.nsel = {}; S3.sel = {}; S3.osel = {}; S3.cur = ''; pushSel(); } return; }
		if (!nd) { if (!(e.ctrlKey || e.shiftKey)) { S3.nsel = {}; S3.sel = {}; } if (S3.sel[i]) delete S3.sel[i]; else S3.sel[i] = 1; S3.cur = ''; pushSel(); return; }
		reveal(nd); selectNodes([nd], e.ctrlKey || e.shiftKey);
	}
	function onPickObj(o, e) {
		closeMenu();
		var nd = S3.tree.objNode && S3.tree.objNode[o];
		if (!nd) return;
		reveal(nd); selectNodes([nd], e.ctrlKey || e.shiftKey);
	}
	function onMenuObj(o, x, y) { var nd = S3.tree.objNode && S3.tree.objNode[o]; if (!nd) return; if (!S3.nsel[nd.id]) { reveal(nd); selectNodes([nd]); } nodeMenu(x, y); }
	function onDouble(i) { if (i < 0) { view.fit(); return; } var bn = blockOf(S3.tree.itemNode[i]); if (bn) { reveal(bn); selectNodes([bn]); } }

	/* деталь для своего вида (1.19.1, ui/matlook.js): { key, name: материал, title }; null — не деталь (блок) */
	function partOf(cn, i) {
		if (cn && cn.kind === 'plastic') cn = cn.up;
		if (cn && !/^(panel|furn|prof)$/.test(cn.kind)) return null;
		var G = S3.glb, it = cn ? cn.it : i, t = it !== undefined ? S3.sc.items[it] : null;
		if (G) {
			var oi = cn && cn.ob !== undefined ? cn.ob : (it !== undefined ? G.M.byItem[it] : undefined);
			if (oi === undefined || !view.objMats) return null;
			var ms = view.objMats(oi), nm = t && ms.indexOf(t.mat) >= 0 ? t.mat : ms[0];
			return nm ? { key: BM.animUser.keys(G.O)[oi], name: nm, title: cn ? label(cn) : (t ? t.name : G.O.objs[oi].name) } : null;
		}
		return t ? { key: BM.animUser.itemKeys(S3.sc)[it], name: t.mat, title: t.name } : null;
	}
	Md.partOf = partOf;

	/* ----------------------------- действия ------------------------------- */
	function hideSelected() {
		var L = selNodeList();
		if (L.length) L.forEach(function (nd) { S3.offNode[nd.id] = 1; });
		else keys(S3.sel).forEach(function (i) { S3.offItem[i] = 1; });
		S3.nsel = {}; S3.cur = ''; S3.sel = {}; S3.osel = {}; S3.only = null; S3.onlyO = null;
		applyHidden();
	}
	function hideUnselected() {
		var L = selNodeList(), its = [], obs = [];
		L.forEach(function (nd) { if (nd.kind === 'plastic') nd = nd.up; its = its.concat(nd.items || []); obs = obs.concat(nd.objs || []); });
		if (!L.length) its = keys(S3.sel);
		only(its, obs);
	}
	function only(list, objs) {
		if (S3.scheme) { S3.sc.items.forEach(function (o) { if (o.mod === S3.scheme && list.indexOf(o.i) < 0) S3.offItem[o.i] = 1; }); }
		else { S3.only = {}; list.forEach(function (k) { S3.only[k] = 1; }); S3.onlyO = {}; (objs || []).forEach(function (k) { S3.onlyO[k] = 1; }); }
		applyHidden(); view.fit();
	}
	function explodeNode(nd) {
		if (S3.exNode === nd.id) { S3.exNode = ''; view.animate('explode', 0, U.animOn() ? 500 : 0, function () { view.set('scope', ''); bar(); drawCard(); }); return; }
		S3.exNode = nd.id; view.set('explode', 0); view.set('scope', M.scopeOf(S3.sc, nd));
		view.animate('explode', 0.6, U.animOn() ? 600 : 0, function () { bar(); drawCard(); });
		drawCard();
	}
	function fitNodes(L) { var its = [], obs = []; L.forEach(function (nd) { its = its.concat(nd.items || []); obs = obs.concat(nd.objs || []); }); view.fitTo(its, [], obs); }
	function setOpenAll(v, from) {
		if (!from && !v) S3.open = {};
		(function walk(nd) { if (nd.kids.length) S3.open[nd.id] = v ? 1 : 0; nd.kids.forEach(walk); })(from || S3.tree.root);
		S3.open.r = 1;
		drawList();
	}
	Md.openAll = setOpenAll;
	Md.showAll = function () { if (S3.sc) showAll(); };
	/* меню правой кнопки — в структуре и по объекту в 3D (как в БАЗИСе) */
	function nodeMenu(x, y) {
		var L = selNodeList(), one = L.length === 1 ? L[0] : null, hasK = !!(one && one.kids.length);
		var t = one && one.it !== undefined ? S3.sc.items[one.it] : null, A = window.App, pt = one ? partOf(one) : null;
		var inCut = !!(t && t.sig && A.S.st.typeBy[t.sig]), card = inCut ? drillKey(t.sig) : '';
		U.menu(x, y, [
			['Развернуть', function () { S3.open[one.id] = 1; drawList(); }, '', !hasK],
			['Развернуть все', function () { setOpenAll(true, hasK ? one : null); }, 'Ctrl+Shift+='],
			['Свернуть', function () { S3.open[one.id] = 0; drawList(); }, '', !hasK],
			['Свернуть все', function () { setOpenAll(false); }, 'Ctrl+Shift+−'],
			null,
			['Скрыть выделенные', hideSelected, '', !L.length],
			['Скрыть невыделенные', hideUnselected, '', !L.length],
			['Показать все', showAll],
			null,
			['Вписать в окно', function () { if (L.length) fitNodes(L); else view.fit(); }],
			[one && S3.exNode === one.id ? 'Собрать' : 'Разнести', function () { explodeNode(one); }, '', !(one && one.kind === 'block' && one.items.length > 1)],
			null,
			['Показать в раскрое', function () { Md.toCut(t.sig); }, '', !inCut],
			['Карта присадки', function () { Md.toDrill(t.sig); }, '', !card],
			null,
			['Прозрачность и цвет…', function () { if (window.MatLook) window.MatLook.popup(x, y, pt); }, '', !pt],
			['Свойства', function () { var c = $('mCard'); if (c) c.scrollIntoView({ block: 'nearest' }); }]
		]);
	}

	/* меню по детали в 3D (модель по деталям) */
	var menuEl = null;
	function closeMenu() { if (menuEl) { menuEl.remove(); menuEl = null; } }
	function onMenu(i, x, y) {
		closeMenu();
		var t = i >= 0 ? S3.sc.items[i] : null, sel = keys(S3.sel), acts = [];
		if (t && !S3.sel[i]) { var tn = S3.tree.itemNode[i]; if (tn) { reveal(tn); selectNodes([tn]); } else { S3.nsel = {}; S3.sel = {}; S3.sel[i] = 1; pushSel(); } sel = [i]; }
		if (t) {
			acts.push(['Скрыть ' + (sel.length > 1 ? 'выделенное (' + sel.length + ')' : 'деталь'), function () { sel.forEach(function (k) { S3.offItem[k] = 1; }); S3.nsel = {}; S3.sel = {}; S3.osel = {}; S3.cur = ''; applyHidden(); }]);
			acts.push(['Оставить только ' + (sel.length > 1 ? 'выделенное' : 'эту деталь'), function () { only(sel, []); }]);
			if (!S3.scheme) {
				acts.push(null);
				var bn = blockOf(S3.tree.itemNode[i]);
				if (bn) {
					acts.push(['Скрыть блок ' + bn.name, function () { S3.offNode[bn.id] = 1; S3.nsel = {}; S3.sel = {}; S3.osel = {}; S3.cur = ''; S3.only = null; S3.onlyO = null; applyHidden(); }]);
					acts.push(['Оставить только блок ' + bn.name, function () { only(bn.items, bn.objs || []); }]);
					if (bn.items.length > 1) acts.push([(S3.exNode === bn.id ? 'Собрать блок ' : 'Разнести блок ') + bn.name, function () { explodeNode(bn); }]);
				}
				if (M.modOf(S3.sc, t).items.length > 2) acts.push(['Схема сборки ' + t.mod, function () { Md.scheme(t.mod); }]);
			}
			acts.push(null);
			var pt = partOf(S3.tree.itemNode[i] || null, i);
			if (pt && window.MatLook) { acts.push(['Прозрачность и цвет…', function () { window.MatLook.popup(x, y, pt); }]); acts.push(null); }
		}
		acts.push(['Показать всё', function () { if (S3.scheme) { S3.offItem = {}; applyHidden(); } else showAll(); }]);
		menuEl = document.createElement('div'); menuEl.className = 'mMenu';
		acts.forEach(function (a) { if (!a) { menuEl.appendChild(document.createElement('hr')); return; } var b = document.createElement('button'); b.textContent = a[0]; b.onclick = function () { closeMenu(); a[1](); }; menuEl.appendChild(b); });
		document.body.appendChild(menuEl);
		var r = menuEl.getBoundingClientRect();
		menuEl.style.left = Math.max(4, Math.min(x, window.innerWidth - r.width - 6)) + 'px'; menuEl.style.top = Math.max(4, Math.min(y, window.innerHeight - r.height - 6)) + 'px';
	}

	/* ----------------------------- структура ------------------------------ */
	var ICON = { block: '⧉', panel: '▭', plastic: '◫', furn: '⚙', prof: '▬', cut: '◌', root: '⧉' };
	function label(nd) {
		if (nd.kind === 'panel' && nd.it !== undefined) { var t = S3.sc.items[nd.it]; return nd.name + ' ' + Math.round(t.L) + 'x' + Math.round(t.W) + 'x' + num(t.th); }
		return nd.name;
	}
	function nodeOff(nd) {
		if (S3.offNode[nd.id]) return true;
		if (nd.it !== undefined) return isHidden(S3.sc.items[nd.it]);
		if (S3.glb && nd.ob !== undefined && nd.kind !== 'block') return objHidden(nd.ob);
		if (nd.kind === 'block' || nd.kind === 'root') {
			var its = nd.items || [], obs = S3.glb ? (nd.objs || []).filter(function (o) { return S3.glb.O.objs[o].geo.length; }) : [];
			if (!its.length && !obs.length) return false;
			return its.every(function (i) { return isHidden(S3.sc.items[i]); }) && obs.every(function (o) { return objHidden(o); });
		}
		return false;
	}
	function rowHtml(nd, depth, offUp, flat) {
		var off = offUp || nodeOff(nd), hasK = nd.kids.length > 0 && !flat, open = !!S3.open[nd.id];
		var cur = !!S3.nsel[nd.id] || (nd.it !== undefined && S3.sel[nd.it] && !Object.keys(S3.nsel).length);
		var pos = nd.it !== undefined ? (S3.sc.items[nd.it].pos || '') : '', des = nd.it !== undefined ? (S3.sc.items[nd.it].des || '') : '';
		return '<div class="mRow mT k-' + nd.kind + (cur ? ' cur' : '') + (off ? ' off' : '') + '" data-node="' + nd.id + '"' + (flat ? ' title="' + esc(M.nodePath(nd).join(' › ')) + '"' : '') + '>' +
			'<span class="tn" style="padding-left:' + (flat ? 0 : depth * 16) + 'px">' + (hasK ? '<span class="tw">' + (open ? '−' : '+') + '</span>' : '<span class="tw0"></span>') +
			'<span class="ic">' + (ICON[nd.kind] || '') + '</span><span class="mName">' + esc(label(nd)) + '</span></span>' +
			'<span class="mPos">' + esc(pos) + '</span><span class="mDes">' + esc(des) + '</span></div>';
	}
	function treeHtml() {
		var out = [], R = S3.tree.root, ro = !!S3.open.r;
		out.push('<div class="mRow mT k-root" data-node="r"><span class="tn"><span class="tw">' + (ro ? '−' : '+') + '</span><span class="ic">⧉</span><span class="mName"><b>' + esc(BM.project.modelName((S3.doc && S3.doc.model) || {}) || R.name) + '</b></span></span><span class="mPos"></span><span class="mDes"></span></div>');
		function walk(nd, depth, offUp) {
			nd.kids.forEach(function (c) {
				out.push(rowHtml(c, depth, offUp));
				if (c.kids.length && S3.open[c.id]) walk(c, depth + 1, offUp || !!S3.offNode[c.id]);
			});
		}
		if (ro) walk(R, 1, false);
		return out.join('');
	}
	function drawList() {
		var sc = S3.sc, h = '', f = S3.find.trim().toLowerCase(), cols = true;
		if (!sc) return;
		if (f) {
			var hits = S3.tree.nodes.filter(function (nd) {
				if (nd.kind === 'plastic' || nd.kind === 'cut') return false;
				var t = nd.it !== undefined ? sc.items[nd.it] : null;
				return (nd.name + ' ' + (nd.art || '') + (t ? ' ' + t.pos + ' ' + t.des : '')).toLowerCase().indexOf(f) >= 0;
			});
			h = hits.slice(0, 300).map(function (nd) { return rowHtml(nd, 0, false, true); }).join('') || '<div class="mute" style="padding:6px 8px">Ничего не найдено</div>';
			$('mListTitle').textContent = 'Найдено: ' + hits.length;
		} else if (S3.tab === 'mods') {
			h = treeHtml();
			$('mListTitle').textContent = 'Структура модели';
		} else {
			cols = false;
			h = sc.mats.map(function (m) { var on = !S3.offMat[m.key]; return '<div class="mRow' + (on ? '' : ' off') + '" data-mat="' + esc(m.key) + '"><input type="checkbox"' + (on ? ' checked' : '') + ' title="Показать или скрыть материал"><span class="sw" style="background:' + m.color + '"></span><span class="mName" title="' + esc(m.name) + '">' + esc(m.name) + '</span><span class="mCnt">' + m.items.length + '</span><button class="mLk' + (window.MatLook && window.MatLook.matSet()[m.name] ? ' set' : '') + '" title="Прозрачность, оттенок и блеск материала в 3D">◐</button></div>' + (S3.matOpen === m.key && window.MatLook ? window.MatLook.html('mat', m.name) : ''); }).join('');
			$('mListTitle').textContent = 'Материалы';
		}
		$('mCols').hidden = !cols;
		$('mList').innerHTML = h;
		var cur = $('mList').querySelector('.mRow.cur.mT');
		if (cur && S3.reveal) { S3.reveal = 0; cur.scrollIntoView({ block: 'nearest' }); }
		$('mTabMods').classList.toggle('on', S3.tab === 'mods'); $('mTabMats').classList.toggle('on', S3.tab === 'mats');
		$('mNoFac').classList.toggle('on', S3.noFac);
	}

	/* ----------------------------- свойства ------------------------------- */
	function whd(size) {
		var sc = S3.sc, a = function (v) { return [Math.abs(v[0]), Math.abs(v[1]), Math.abs(v[2])]; }, h = M.vec.dot(size, a(sc.up)), d = M.vec.dot(size, a(sc.front));
		return [size[0] + size[1] + size[2] - h - d, h, d];
	}
	function kv(rows) { return '<div class="mKV2">' + rows.filter(Boolean).map(function (r) { return '<div><span>' + esc(r[0]) + '</span><span>' + (r[2] ? r[1] : esc(r[1])) + '</span></div>'; }).join('') + '</div>'; }
	function nodeBox(nd) {
		var b = M.nodeBox(S3.sc, nd);
		if (S3.glb && nd.objs && nd.objs.length) {
			b = b || { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
			nd.objs.forEach(function (o) { var ob = S3.glb.O.objs[o]; if (!ob.own) return; for (var k = 0; k < 3; k++) { b.min[k] = Math.min(b.min[k], ob.box.min[k]); b.max[k] = Math.max(b.max[k], ob.box.max[k]); } });
			if (!(b.min[0] <= b.max[0])) b = null;
		}
		return b;
	}
	var KIND = { block: 'Блок', panel: 'Панель', plastic: 'Облицовка', furn: 'Фурнитура', prof: 'Профиль', cut: 'Вырез' };
	function inside(nd) {
		var r = [], pl = 0;
		if (nd.nPan) r.push(nd.nPan + ' ' + plural(nd.nPan, 'панель', 'панели', 'панелей'));
		S3.tree.nodes.forEach(function (x) { if (x.kind === 'plastic') for (var u = x.up; u; u = u.up) if (u === nd) { pl++; break; } });
		if (pl) r.push(pl + ' ' + plural(pl, 'облицовка', 'облицовки', 'облицовок'));
		if (nd.nFurn) r.push(nd.nFurn + ' фурнитуры');
		return r.join(', ') || 'пусто';
	}
	function drawCard() {
		var A = window.App, sc = S3.sc, sel = keys(S3.sel), L = selNodeList(), h = '', title = '', acts = '', cn = L.length === 1 ? L[0] : null;
		if (!sc) return;
		if (cn && cn.kind === 'plastic') cn = cn.up;
		if (S3.scheme && sel.length !== 1) {
			var rows = M.spec(sc, S3.scheme), md = sc.mods.filter(function (m) { return m.name === S3.scheme; })[0], v = whd(M.box.size(md.box));
			title = 'Схема сборки — ' + S3.scheme;
			h = '<div class="mCard"><div class="big">' + Math.round(v[0]) + ' × ' + Math.round(v[1]) + ' × ' + Math.round(v[2]) + '<small>Ш × В × Г, мм</small></div><div class="mute">Деталей: ' + md.items.length + '</div></div>' +
				'<table class="mSpec"><thead><tr><th>№</th><th>Поз.</th><th>Обозн.</th><th>Наименование</th><th class="q">Д × Ш × Т</th><th class="q">Кол.</th></tr></thead><tbody>' +
				rows.map(function (r) { var cur = r.items.some(function (i) { return S3.sel[i]; }); return '<tr data-row="' + r.n + '"' + (cur ? ' class="cur"' : '') + '><td class="n">' + r.n + '</td><td>' + esc(r.pos) + '</td><td>' + esc(r.des) + '</td><td>' + esc(r.name) + '<span class="m">' + esc(r.mat) + '</span></td><td class="q">' + num(r.L) + ' × ' + num(r.W) + ' × ' + num(r.th) + '</td><td class="q">' + r.qty + '</td></tr>'; }).join('') + '</tbody></table>';
		} else if ((cn && cn.it !== undefined) || (!L.length && sel.length === 1)) {
			var t = sc.items[cn ? cn.it : sel[0]], holes = sc.holes.filter(function (x) { return x.item === t.i; }).length, tn = S3.tree.itemNode[t.i];
			var inCut = !!(t.sig && A.S.st.typeBy[t.sig]), card = inCut ? drillKey(t.sig) : '';
			title = 'Деталь';
			h = '<div class="mCard"><h3>' + esc(t.name) + '</h3>' + kv([['Позиция', t.pos || '—'], ['Обозначение', t.des || '—'], ['Размер', num(t.L) + ' × ' + num(t.W) + ' × ' + num(t.th) + ' мм'],
				['Материал', esc(t.mat) + (t.art ? ' <span class="mute">· ' + esc(t.art) + '</span>' : ''), 1], tn && S3.tree.blocks ? ['Путь', M.nodePath(tn.up).join(' › ') || '—'] : ['Модуль', t.mod + (t.sub ? ' / ' + t.sub : '')],
				['Кромка', t.edges.length ? t.edges.length + ' ' + plural(t.edges.length, 'сторона', 'стороны', 'сторон') : 'нет'], ['Отверстия', String(holes || 'нет')], t.cuts.length ? ['Пазы', String(t.cuts.length)] : null,
				t.lin ? ['Вид', 'погонный материал'] : null, t.hid ? ['В БАЗИСе', 'скрыта'] : null, ['Видимый', isHidden(t) ? 'Нет' : 'Да']]) + lookCard(cn, t.i) + '</div>';
			acts = '<div class="mActs"><button id="cToCut"' + (inCut ? '' : ' disabled title="' + (t.lin ? 'Погонный материал в раскрой листов не идёт' : 'Этой детали нет в раскрое') + '"') + '>Показать в раскрое</button><button id="cToDrill"' + (card ? '' : ' disabled title="У этой детали нет карты присадки"') + '>Карта присадки</button></div>' +
				'<div class="mActs"><button id="cHide">Скрыть</button><button id="cOnly">Только эта</button>' + (S3.scheme ? '' : '<button id="cMod">Весь блок</button>') + '</div>';
		} else if (cn && cn.kind !== 'root') {
			var bb = nodeBox(cn), gv = bb ? whd(M.box.size(bb)) : null;
			title = KIND[cn.kind] || 'Объект';
			h = '<div class="mCard"><h3>' + esc(cn.name) + '</h3>' + kv([['Артикул', cn.art || '—'], ['Тип', KIND[cn.kind] || '—'], cn.kind === 'block' ? ['Внутри', inside(cn)] : null,
				gv ? ['Габариты', Math.round(gv[0]) + ' × ' + Math.round(gv[1]) + ' × ' + Math.round(gv[2]) + ' мм (Ш × В × Г)'] : null, cn.mat ? ['Материал', cn.mat] : null,
				['Путь', M.nodePath(cn).join(' › ')], ['Видимый', nodeOff(cn) ? 'Нет' : 'Да'],
				cn.kind !== 'block' && !S3.glb ? ['В 3D', 'нарисуется после выгрузки скриптом 1.5'] : null]) + lookCard(cn) + '</div>';
			acts = '<div class="mActs"><button id="cBOnly">Только это</button><button id="cBHide">Скрыть</button><button id="cBFit">Вписать</button>' + (cn.kind === 'block' && cn.items.length > 1 ? '<button id="cBExpl">' + (S3.exNode === cn.id ? 'Собрать' : 'Разнести') + '</button>' : '') + '</div>';
		} else if (sel.length > 1 || L.length > 1) {
			title = 'Выделено: ' + (L.length > 1 ? L.length : sel.length);
			var mods = {}; sel.forEach(function (i) { mods[sc.items[i].mod] = 1; });
			h = '<div class="mCard">' + kv([['Деталей', String(sel.length)], ['Модули', Object.keys(mods).join(', ') || '—']]) + '</div>';
			acts = '<div class="mActs"><button id="cHide">Скрыть</button><button id="cOnly">Оставить только их</button></div>';
		} else {
			var s = whd(sc.size), mdl = (A.S.doc && A.S.doc.model) || {}, gi = S3.glb ? S3.glbInfo : null;
			title = 'Изделие';
			h = '<div class="mCard"><h3>' + esc(BM.project.modelName(mdl) || sc.title || 'Модель') + '</h3>' +
				kv([['Наименование', mdl.title || '—'], ['Артикул', mdl.art || '—'], mdl.customer !== undefined ? ['Заказчик', mdl.customer || '—'] : ['Заказ', mdl.order || '—'], mdl.orderNo ? ['Номер заказа', mdl.orderNo] : null, mdl.note ? ['Заметки', mdl.note] : null,          // STHGroup: данные заказа из окна выгрузки
					['Габариты', Math.round(s[0]) + ' × ' + Math.round(s[1]) + ' × ' + Math.round(s[2]) + ' мм (Ш × В × Г)'],
					['Панелей', String(sc.items.length)], ['Материалов', String(sc.mats.length)], ['Отверстий', String(sc.holes.length)], sc.solids.length ? ['Фурнитуры', String(sc.solids.length)] : null,
					['3D', gi ? 'как в БАЗИСе · ' + gi.parts + ' частей · ' + Math.max(1, Math.round(gi.tris / 1000)) + ' тыс. треугольников' : 'по деталям'],
					gi ? ['Текстуры', gi.uv ? 'развёртка из БАЗИСа' + (gi.uvTris && gi.uvHits < gi.uvTris ? ' (' + Math.round(gi.uvHits * 100 / gi.uvTris) + ' %)' : '') : 'приблизительно — выгрузите модель скриптом 1.6'] : null,
					gi ? ['Анимация', !mdl.anim ? 'нет — выгрузите модель скриптом 1.7' : (gi.animAll ? gi.anim + ' ' + window.App.plural(gi.anim, 'блок', 'блока', 'блоков') + ' как в БАЗИСе' + (gi.anim < gi.animAll ? ' (не найдено в 3D-файле: ' + (gi.animAll - gi.anim) + ')' : '') + ' — двойной щелчок открывает' : 'в БАЗИСе не задана')] : null,
					sc.skipped.hidden ? ['Скрытых', sc.skipped.hidden + ' — не показаны'] : null, sc.skipped.noFrame ? ['Без места', sc.skipped.noFrame + ' — БАЗИС не сообщил положение'] : null]) +
				(S3.glbNote ? '<div class="note">' + esc(S3.glbNote) + '</div>' : '') +
				sc.warn.map(function (w) { return '<div class="note warn">' + esc(w) + '</div>'; }).join('') +
				'</div>';
		}
		$('mCardTitle').textContent = title;
		$('mCard').innerHTML = h + acts;
		var b;
		if ((b = $('cHide'))) b.onclick = function () { if (L.length) hideSelected(); else { sel.forEach(function (k) { S3.offItem[k] = 1; }); S3.sel = {}; S3.cur = ''; applyHidden(); } };
		if ((b = $('cOnly'))) b.onclick = function () { if (L.length) hideUnselected(); else only(sel, []); };
		if ((b = $('cMod'))) b.onclick = function () { onDouble(cn ? cn.it : sel[0]); };
		if ((b = $('cToCut'))) b.onclick = function () { Md.toCut(sc.items[cn ? cn.it : sel[0]].sig); };
		if ((b = $('cToDrill'))) b.onclick = function () { Md.toDrill(sc.items[cn ? cn.it : sel[0]].sig); };
		if ((b = $('cBOnly'))) b.onclick = hideUnselected;
		if ((b = $('cBHide'))) b.onclick = hideSelected;
		if ((b = $('cBFit'))) b.onclick = function () { fitNodes([cn]); };
		if ((b = $('cBExpl'))) b.onclick = function () { explodeNode(cn); };
	}
	/* «3D — только эта деталь»: прозрачность, оттенок, блеск (хранится в проекте) */
	function lookCard(cn, i) {
		var p = window.MatLook ? partOf(cn || null, i) : null;
		return p ? '<div class="mlCard"><div class="mlT">3D — только эта деталь</div>' + window.MatLook.html('part', p.name, p) + '</div>' : '';
	}
	/* ключ карты присадки детали: у детали с несколькими вариантами присадки карт несколько — берём первую */
	function drillKey(sig) {
		var list = window.Drill.cards(), i;
		for (i = 0; i < list.length; i++) if (list[i].key === sig && list[i].n) return list[i].key;
		for (i = 0; i < list.length; i++) if (list[i].key.indexOf(sig + '#') === 0 && list[i].n) return list[i].key;
		return '';
	}
	/* Переходы: та же деталь в раскрое (лист, где она лежит) и её карта присадки. */
	Md.toCut = function (sig) {
		var A = window.App, S = A.S, st = S.st, t = st.typeBy[sig], i, k;
		if (!t) return;
		var mk = t.mat || t.mat0, lay = st.work.layout[mk];
		if (st.matBy[mk]) S.matKey = mk;
		S.selType = sig; S.sel = -1; S.view = 'sheet'; S.listMode = 'mat';
		if (lay) for (i = 0; i < lay.sheets.length && S.sel < 0; i++) for (k = 0; k < lay.sheets[i].recs.length; k++) if (lay.sheets[i].recs[k].t === sig) { S.si = i; S.sel = k; S.listMode = 'sheet'; break; }
		window.Drill.section('cut');
	};
	Md.toDrill = function (sig) { var k = drillKey(sig); if (!k) return; window.Drill.section('drill'); window.Drill.select(k); };

	/* ----------------------------- панель кнопок -------------------------- */
	var MODE = { tex: 'Текстуры', texl: 'Текстуры с линиями', nohid: 'Без невидимых', thin: 'Невидимые тонкие', wire: 'Каркас' };
	function bar() {
		if (!view) return;
		var v = view.get('viewName') || '';
		[].forEach.call(document.querySelectorAll('#mViews [data-v], #mViewsMore [data-v]'), function (b) { b.classList.toggle('on', b.dataset.v === v); });
		$('mViewsDd').classList.toggle('on', /left|right|persp/.test(v));
		[].forEach.call($('mModes').children, function (b) { b.classList.toggle('on', b.dataset.m === view.get('mode')); });
		$('mModesDd').textContent = 'Отображение: ' + (MODE[view.get('mode')] || '');
		[].forEach.call($('mShow').children, function (b) { if (b.dataset.k) b.classList.toggle('on', !!view.get(b.dataset.k)); });
		$('mOutline').classList.toggle('on', !!view.get('outline'));
		var xm = view.get('mode'), xo = xm === 'tex' || xm === 'texl'; $('mXray').disabled = !xo; $('mXray').classList.toggle('on', xo && !!view.get('xray'));
		var an = view.anim ? view.anim() : null;                                        // есть анимация из БАЗИСа — кнопка открывает всё по ней
		if (an) { $('mOpen').classList.toggle('on', an.open); $('mOpen').textContent = an.open ? 'Закрыть всё' : 'Открыть всё'; $('mOpen').title = 'Открыть или закрыть всё, у чего в БАЗИСе задана анимация (двери, ящики, подъёмники). Двойной щелчок по двери — только она'; }
		else { $('mOpen').classList.toggle('on', view.get('open') > 0.5); $('mOpen').textContent = view.get('open') > 0.5 ? 'Закрыть фасады' : 'Открыть фасады'; $('mOpen').title = 'Открыть фасады и выдвинуть ящики'; }
		$('mRuler').classList.toggle('on', view.get('tool') === 'ruler'); $('mDims').classList.toggle('on', !!view.get('dims'));
		$('mToolsDd').classList.toggle('on', view.get('tool') === 'ruler' || !!view.get('dims'));
		$('mExpl').value = Math.round(view.get('explode') * 100);
		$('mScheme').value = S3.scheme; $('mPos').hidden = $('mBack').hidden = !S3.scheme; $('mPos').classList.toggle('on', S3.pos);
		[].forEach.call($('mLook').children, function (b) { b.classList.toggle('on', b.dataset.l === (cfg().look === 'shine' ? 'shine' : 'plain')); });
		$('mLook').hidden = !S3.glb;
		/* у модели из 3D-файла нет отверстий, кромки и пазов — эти пункты не нужны */
		['holes', 'band', 'grooves'].forEach(function (k) { var e = document.querySelector('#mShow [data-k="' + k + '"]'); if (e) e.hidden = !!S3.glb; });
		var bdB = document.querySelector('#mShow [data-k="bdims"]'); if (bdB) bdB.hidden = !(S3.glb && view.bdimCount && view.bdimCount());       // размеры из БАЗИСа — если они есть в выгрузке (скрипт 1.10)
		$('mClient').disabled = !S3.glb; $('mClient').title = S3.glb ? 'Сохранить 3D-модель для заказчика одним файлом: открывается в браузере и на телефоне' : 'Нужна модель из БАЗИСа: выгрузите её скриптом 1.5';
		/* подсказка мыши — первые три запуска программы; подсказка линейки — всегда, пока линейка включена */
		var ruler = view.get('tool') === 'ruler';
		var tab = document.body.classList.contains('tablet');
		$('mHint').textContent = ruler ? (tab ? 'Линейка: коснитесь двух углов.' : 'Линейка: щёлкните по двум углам. Esc — выйти.') : (tab ? 'Палец — вращать · два пальца — масштаб и перенос · касание — выбрать · долгое касание — меню · двойное — открыть' : 'ЛКМ — вращать · колесо — масштаб · ПКМ — перенос · щелчок — выбрать · ПКМ — меню');
		$('mHint').hidden = !ruler && (cfg().hintSeen || 0) > 3;
	}
	function stat() {
		if (!view || !S3.sc) return;
		var n = keys(S3.sel).length, hid = S3.sc.items.filter(isHidden).length, ms = view.measures();
		$('mStat').textContent = [n ? 'выделено: ' + n : '', hid && !S3.scheme ? 'скрыто: ' + hid : '', ms.length ? 'размеров: ' + ms.length : ''].filter(Boolean).join(' · ');
		$('mStat').hidden = !$('mStat').textContent;
	}
	function keep(k, v) { cfg()[k] = v; window.App.saveSettings(); }

	/* Схема сборки модуля: виден один модуль, разнесён, на деталях кружки с номерами строк спецификации. */
	Md.scheme = function (name) {
		if (!view || !S3.sc) return;
		S3.scheme = name || ''; S3.sel = {}; S3.osel = {}; S3.nsel = {}; S3.cur = ''; S3.offItem = {}; S3.exNode = '';
		document.body.classList.toggle('mScheme', !!S3.scheme);
		view.set('scope', S3.scheme);
		view.set('explode', S3.scheme ? 0.55 : 0);
		view.set('open', 0);
		applyHidden();
		view.setBalloons(S3.scheme && S3.pos ? M.spec(S3.sc, S3.scheme) : null);
		view.view('iso'); view.fit(); bar();
	};

	/* Снимок окна — картинкой в папку документов проекта. */
	Md.snapshot = async function () {
		var A = window.App, S = A.S;
		if (!view || !S.st) return;
		var dir = window.Dlg.outDir(), name = window.Dlg.fileStem() + (S3.scheme ? ' — схема ' + BM.out.fileSafe(S3.scheme) : ' — модель') + '.png', path = U.join(dir, name);
		var bin = atob(view.snapshot().split(',')[1]), buf = new Uint8Array(bin.length);
		for (var i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
		try { await U.api.write(path, buf); } catch (e) { U.error(e); return; }
		U.toast('Снимок сохранён: ' + name, { actions: [{ label: 'Открыть', run: function () { U.api.open(path).catch(U.error); } }, { label: 'Папка', run: function () { U.api.open(dir).catch(U.error); } }], ms: 12000 });
	};

	/* выпадающие списки панели кнопок */
	function closeDd() { var o = document.querySelector('#mBar .mDd.open'); if (o) { o.classList.remove('open'); return true; } return false; }

	/* Клавиши раздела. Возвращает true, если клавиша обработана. */
	Md.key = function (e) {
		if (!view || !S3.sc) return false;
		if (window.MatLook && window.MatLook.key(e)) return true;
		if (window.AnimEd && window.AnimEd.key(e)) return true;
		if (e.key === 'Escape') {
			if (menuEl) closeMenu();
			else if (closeDd()) { /* закрыли список */ }
			else if (view.get('tool')) { view.set('tool', ''); bar(); }
			else if (keys(S3.sel).length || keys(S3.osel).length || Object.keys(S3.nsel).length) { S3.nsel = {}; S3.sel = {}; S3.osel = {}; S3.cur = ''; pushSel(); }
			return true;
		}
		if (e.ctrlKey && e.shiftKey && (e.key === '+' || e.key === '=' || e.code === 'Equal')) { setOpenAll(true); return true; }
		if (e.ctrlKey && e.shiftKey && (e.key === '_' || e.key === '-' || e.code === 'Minus')) { setOpenAll(false); return true; }
		return false;
	};

	Md.init = function () {
		if (inited) return;
		inited = true;
		$('mList').addEventListener('click', function (e) {
			var row = e.target.closest('.mRow'); if (!row || !S3.sc) return;
			if (row.dataset.node !== undefined) {
				var nd = node(row.dataset.node); if (!nd) return;
				if (e.target.classList.contains('tw')) { var id = row.dataset.node; S3.open[id] = S3.open[id] ? 0 : 1; drawList(); return; }
				if (nd.kind === 'root') { S3.nsel = {}; S3.sel = {}; S3.osel = {}; S3.cur = ''; pushSel(); return; }
				if (S3.find) reveal(nd);
				selectNodes([nd], e.ctrlKey || e.shiftKey); return;
			}
			var isBox = e.target.tagName === 'INPUT';
			if (row.dataset.mat !== undefined) {
				var k = row.dataset.mat;
				if (e.target.closest('.mLk')) { S3.matOpen = S3.matOpen === k ? '' : k; drawList(); return; }
				if (isBox) { S3.offMat[k] = !S3.offMat[k]; S3.only = null; S3.onlyO = null; applyHidden(); }
				else { S3.matOpen = k; S3.nsel = {}; S3.sel = {}; S3.osel = {}; S3.cur = ''; S3.sc.items.forEach(function (t2) { if (t2.matKey === k && !isHidden(t2)) S3.sel[t2.i] = 1; }); applyHidden(); }
			}
		});
		$('mList').addEventListener('dblclick', function (e) {
			var row = e.target.closest('.mRow[data-node]'); if (!row || !S3.sc || e.target.classList.contains('tw')) return;
			var nd = node(row.dataset.node);
			if (nd && nd.kind !== 'root') fitNodes([nd]); else view.fit();
		});
		$('mList').addEventListener('contextmenu', function (e) {
			var row = e.target.closest('.mRow[data-node]'); if (!row || !S3.sc) return;
			e.preventDefault();
			var nd = node(row.dataset.node);
			if (nd && nd.kind !== 'root' && !S3.nsel[nd.id]) selectNodes([nd]);
			nodeMenu(e.clientX, e.clientY);
		});
		$('mTabMods').onclick = function () { S3.tab = 'mods'; drawList(); };
		$('mTabMats').onclick = function () { S3.tab = 'mats'; drawList(); };
		$('mSearch').addEventListener('input', function () { S3.find = this.value; drawList(); });
		$('mNoFac').onclick = function () { if (!S3.sc) return; S3.noFac = !S3.noFac; S3.only = null; S3.onlyO = null; applyHidden(); };
		$('mCard').addEventListener('click', function (e) {
			var tr = e.target.closest('tr[data-row]'); if (!tr) return;
			var r = M.spec(S3.sc, S3.scheme)[+tr.dataset.row - 1]; S3.nsel = {}; S3.sel = {}; r.items.forEach(function (i) { if (!isHidden(S3.sc.items[i])) S3.sel[i] = 1; });
			view.setSelected(S3.sel); drawCard(); stat();
		});
		/* выпадающие списки: кнопка открывает меню под собой, щелчок мимо — закрывает */
		[].forEach.call(document.querySelectorAll('#mBar .mDd > button.dd'), function (b) {
			b.addEventListener('click', function (e) { e.stopPropagation(); var d = b.parentNode, was = d.classList.contains('open'); closeDd(); if (!was) d.classList.add('open'); });
		});
		document.addEventListener('pointerdown', function (e) { if (!e.target.closest('#mBar .mDd')) closeDd(); }, true);
		var on = function (id, f) { $(id).addEventListener('click', function (e) { if (view && S3.sc) f.call(this, e); }); };
		var setView = function (e) { var b = e.target.closest('button[data-v]'); if (!b) return; closeDd(); view.view(b.dataset.v); view.fit(); bar(); };
		on('mViews', setView); on('mViewsMore', setView);
		on('mModes', function (e) { var b = e.target.closest('button'); if (!b) return; view.set('mode', b.dataset.m); closeDd(); bar(); });
		on('mShow', function (e) { var b = e.target.closest('button[data-k]'); if (!b) return; var v = !view.get(b.dataset.k); view.set(b.dataset.k, v); keep(b.dataset.k, v ? 1 : 0); bar(); });
		on('mXray', function () { view.set('xray', !view.get('xray')); bar(); });
		on('mOutline', function () { var v = !view.get('outline'); view.set('outline', v); keep('outline', v ? 1 : 0); bar(); });
		on('mFit', function () { view.fit(); });
		on('mOpen', function () { var an = view.anim ? view.anim() : null; if (an) { view.animAll(!an.open); bar(); return; } var to = view.get('open') > 0.5 ? 0 : 1; view.animate('open', to, U.animOn() ? 700 : 0, bar); if (!U.animOn()) bar(); });
		$('mExpl').addEventListener('input', function () { if (view && S3.sc) view.set('explode', this.value / 100); });
		on('mRuler', function () { view.set('tool', view.get('tool') === 'ruler' ? '' : 'ruler'); closeDd(); bar(); });
		on('mRulerClr', function () { view.clearRuler(); closeDd(); stat(); });
		on('mDims', function () { view.set('dims', !view.get('dims')); closeDd(); bar(); });
		on('mShot', function () { Md.snapshot(); });
		on('mClient', function () { if (window.Client3D) window.Client3D.save(); });
		on('mBack', function () { Md.scheme(''); });
		on('mPos', function () { S3.pos = !S3.pos; view.setBalloons(S3.pos && S3.scheme ? M.spec(S3.sc, S3.scheme) : null); bar(); });
		$('mScheme').addEventListener('change', function () { Md.scheme(this.value); });
		$('mLook').addEventListener('click', function (e) { var b = e.target.closest('button[data-l]'); if (!b) return; keep('look', b.dataset.l); if (view) view.setLook(b.dataset.l); bar(); });
		keep('hintSeen', (cfg().hintSeen || 0) + 1);
		if (window.LightUI) window.LightUI.init();
		if (window.AnimEd) window.AnimEd.init();
		if (window.MatLook) window.MatLook.init();
		document.addEventListener('pointerdown', function (e) { if (menuEl && !menuEl.contains(e.target)) closeMenu(); }, true);
		/* 3D-файл из БАЗИСа можно перетащить в окно модели вручную */
		var vEl = $('mView');
		vEl.addEventListener('dragover', function (e) { if (S3.sc) { e.preventDefault(); e.stopPropagation(); } });
		vEl.addEventListener('drop', function (e) {
			if (!S3.sc) return;
			var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
			if (!f || !/\.glb$/i.test(f.name)) return;
			e.preventDefault(); e.stopPropagation();
			f.arrayBuffer().then(function (ab) { return useGlb(ab, '', f.name); }).then(function () { U.toast('Модель из файла «' + f.name + '» показана. Текстуры рядом с ним не найдены — материалы цветом.'); }).catch(function (er) { U.error('Не удалось прочитать «' + f.name + '»: ' + (er && er.message ? er.message : er)); });
		});
	};
})();
