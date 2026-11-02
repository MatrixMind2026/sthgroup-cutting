/* STHGroup — редактор анимации в разделе «Модель» (1.19): режим «Анимация».
   Слева под структурой — «Подвижные группы» (свои или из БАЗИСа), справа — движение выбранной группы, снизу —
   воспроизведение. Расчёт — core/animuser.js, рисование и ручки оси — ui/v3d.js. Группы и движения хранятся в
   проекте (work.anim), правки отменяются Ctrl+Z. Движение правится в черновике: «Применить» записывает его
   в проект, «Отменить» — возвращает записанное. Модель (детали, размеры, материалы) не меняется никогда. */
(function () {
	'use strict';
	var U = window.UI, AU = BM.animUser, $ = U.$, esc = U.esc;
	var AE = window.AnimEd = {};
	var S = { on: false, cur: '', sel: {}, draft: null, dirty: false, scope: 'sel', pick: '', p1: null, smallOpen: false, checking: 0 };
	AE.S = S;

	function App() { return window.App; }
	function st() { return App().S.st; }
	function view() { return window.Model && window.Model.view ? window.Model.view() : null; }
	function MS() { return window.Model ? window.Model.S : null; }
	function glb() { var m = MS(); return m ? m.glb : null; }
	function O() { var g = glb(); return g ? g.O : null; }
	function sc() { var m = MS(); return m ? m.sc : null; }
	function an(make) { var s = st(); return s ? AU.of(s.work, make) : null; }
	function groups() { var a = an(); return a ? a.groups : []; }
	function gById(id) { return groups().filter(function (g) { return g.id === id; })[0] || null; }
	function bazisN() { var g = glb(); return g && g.B ? g.B.n : 0; }
	/* откуда анимации: свои группы или из БАЗИСа (пока своих нет и в БАЗИСе есть — из БАЗИСа) */
	function src() { var a = an(); if (a && a.src) return a.src === 'bazis' && !bazisN() ? 'mine' : a.src; return bazisN() ? 'bazis' : 'mine'; }
	AE.src = src;
	function num(v) { if (typeof v === 'number') return v; var x = parseFloat(String(v).replace(',', '.').replace(/\s/g, '')); return isFinite(x) ? x : NaN; }
	function f1(v) { return isFinite(v) ? String(Math.round(v * 10) / 10).replace('.', ',') : ''; }
	function clone(o) { return JSON.parse(JSON.stringify(o)); }
	function typeName(t) { var r = AU.TYPES.filter(function (x) { return x[0] === t; })[0]; return r ? r[1] : ''; }

	/* ----------------------------- привязка к окну 3D ----------------------------- */
	var R = null;
	/* группы с черновиком текущей → в 3D (свои) или анимации БАЗИСа */
	AE.sync = function () {
		var v = view(); if (!v || !sc()) return;
		if (src() !== 'mine') { if (v.userAnim && v.userAnim()) v.setUserAnim(null); R = null; gizmo(); return; }
		var a = an(), list = a ? a.groups.slice() : [];
		if (S.draft) list = list.map(function (g) { return g.id === S.draft.id ? S.draft : g; });
		R = AU.resolve({ groups: list }, O(), sc());
		v.setUserAnim(R);
		gizmo();
	};
	AE.R = function () { return R; };
	function recOf(id) { if (!R) return null; var k = R.byId[id]; return k >= 0 ? R.L[k] : null; }

	/* ----------------------------- запись в проект (с отменой) ----------------------------- */
	function commit(fn) {
		var A = App(); A.pushUndo();
		var a = an(true); fn(a);
		A.S.dirty = true; A.save();
		AE.sync(); AE.render();
	}
	function newId(a) { a.nid = (a.nid || 1); return 'g' + a.nid++; }
	function members(idx) { return idx.map(function (i) { return AU.member(O(), sc(), i); }); }
	function memIdx(g) { var r = recOf(g.id); if (r) return r.mem; var Rx = AU.resolve({ groups: [Object.assign({}, g, { m: g.m || { type: 'drawer', d: [1, 0, 0], dist: 1, ms: 1, delay: 0 } })] }, O(), sc()); return Rx.L.length ? Rx.L[0].mem : []; }
	function axesOf(g) { return AU.axesGroup(g, O(), sc(), memIdx(g)); }
	function extOf(g, X) { return AU.extent(O(), sc(), memIdx(g), X || axesOf(g)); }
	function defaultsFor(g, type) { var X = (g.m && g.m.space === 'model') ? AU.axesModel(sc()) : axesOf(g); return AU.defaults(type, extOf(g, X), X, sc().front); }

	/* ----------------------------- черновик движения ----------------------------- */
	function startDraft(g) { S.draft = g ? clone(g) : null; S.dirty = false; S.pick = ''; S.p1 = null; if (view()) view().pickPoint(null); }
	async function askDraft() {
		if (!S.dirty || !S.draft) return true;
		var r = await U.modal({ title: 'Движение изменено', body: '<p>Изменения движения группы «' + esc(S.draft.name) + '» не применены.</p>', width: 460, buttons: [{ label: 'Отмена', value: 0 }, { label: 'Не применять', value: 1 }, { label: 'Применить', value: 2, primary: true }] });
		if (!r) return false;
		if (r === 2) { if (!apply()) return false; } else { startDraft(gById(S.draft.id)); AE.sync(); }
		return true;
	}
	AE.askDraft = askDraft;
	function apply() {
		if (!S.draft) return false;
		var e = S.draft.m ? AU.check(S.draft.m) : [];
		if (e.length) { U.toast(e[0], { bad: true }); return false; }
		var d = clone(S.draft);
		commit(function (a) { a.groups = a.groups.map(function (g) { return g.id === d.id ? Object.assign(g, { m: d.m }) : g; }); });
		startDraft(gById(d.id));
		AE.render();
		return true;
	}
	function edit(fn) { if (!S.draft) return; fn(S.draft); S.dirty = true; AE.sync(); drawRight(); }

	/* ----------------------------- выбор группы ----------------------------- */
	AE.select = async function (id, add) {
		if (id === S.cur && !add) return;
		if (!(await askDraft())) return;
		if (add) { if (S.sel[id]) delete S.sel[id]; else S.sel[id] = 1; } else { S.sel = {}; if (id) S.sel[id] = 1; }
		S.cur = id && S.sel[id] ? id : (Object.keys(S.sel)[0] || '');
		startDraft(gById(S.cur));
		/* участники группы — выделены в структуре и в 3D */
		var g = gById(S.cur); if (g && window.Model.selectObjs) window.Model.selectObjs(memIdx(g));
		AE.sync(); AE.render();
	};
	function curRecs() {
		if (!R) return [];
		var ids = Object.keys(S.sel).length ? Object.keys(S.sel) : (S.cur ? [S.cur] : []), out = [];
		ids.forEach(function (id) { var k = R.byId[id]; if (k >= 0) AU.below(R, k).forEach(function (q) { if (out.indexOf(q) < 0) out.push(q); }); });
		return out;
	}
	function scopeRecs() {
		var v = view(), B = v && v.userAnim ? v.userAnim() : null;
		if (src() === 'bazis') { var gb = glb(); return gb && gb.B ? gb.B.L.map(function (a) { return a.k; }) : []; }
		if (!B) return [];
		return S.scope === 'all' ? B.L.map(function (a) { return a.k; }) : curRecs();
	}

	/* ----------------------------- действия с группами ----------------------------- */
	AE.create = function () {
		var idx = window.Model.selObjs ? window.Model.selObjs() : [];
		if (!idx.length) { U.toast('Выделите детали в структуре или в 3D (Ctrl — несколько), потом «＋ Группа»'); return; }
		var mem = members(idx), nm = String(mem[0].n || 'Группа'), id = '';
		var guess = idx.some(function (i) { var o = O(); return /ящ/i.test(o ? o.objs[i].name : sc().items[i].name); }) ? 'drawer' : 'swing';
		commit(function (a) {
			a.src = 'mine';
			id = newId(a);
			var base = 'Группа ' + (a.groups.length + 1) + ' — ' + nm.slice(0, 40), n = base, k = 2;
			while (a.groups.some(function (g) { return g.name === n; })) n = base + ' (' + k++ + ')';
			var g = { id: id, name: n, parent: '', on: true, mem: mem, m: null };
			a.groups.push(g);
			g.m = defaultsFor(g, guess);
		});
		S.cur = ''; AE.select(id);
	};
	function addSel(g) {
		var idx = window.Model.selObjs ? window.Model.selObjs() : [];
		if (!idx.length) { U.toast('Выделите детали, которые нужно добавить'); return; }
		var add = members(idx).filter(function (m) { return !g.mem.some(function (x) { return x.k === m.k; }); });
		if (!add.length) { U.toast('Эти детали уже в группе'); return; }
		commit(function (a) { a.groups.forEach(function (x) { if (x.id === g.id) x.mem = x.mem.concat(add); }); });
		if (S.draft && S.draft.id === g.id) S.draft.mem = gById(g.id).mem.slice();
	}
	function removeMem(g, k) {
		if (g.mem.length <= 1) { U.toast('В группе должна остаться хотя бы одна деталь. Удалить группу — кнопкой в списке'); return; }
		commit(function (a) { a.groups.forEach(function (x) { if (x.id === g.id) x.mem = x.mem.filter(function (m) { return m.k !== k; }); }); });
		if (S.draft && S.draft.id === g.id) S.draft.mem = gById(g.id).mem.slice();
	}
	function removeSelMem(g) {
		var ks = members(window.Model.selObjs ? window.Model.selObjs() : []).map(function (m) { return m.k; });
		var left = g.mem.filter(function (m) { return ks.indexOf(m.k) < 0; });
		if (left.length === g.mem.length) { U.toast('Выделенных деталей в группе нет'); return; }
		if (!left.length) { U.toast('В группе должна остаться хотя бы одна деталь'); return; }
		commit(function (a) { a.groups.forEach(function (x) { if (x.id === g.id) x.mem = left; }); });
		if (S.draft && S.draft.id === g.id) S.draft.mem = left.slice();
	}
	async function delGroup(g) {
		var kids = groups().filter(function (x) { return x.parent === g.id; }).length;
		if (!(await U.confirm('Удалить группу?', 'Группа «' + g.name + '» и её движение будут удалены.' + (kids ? '\nВложенные группы (' + kids + ') останутся — на уровень выше.' : '') + '\nДетали модели не меняются. Отменить — Ctrl+Z.', 'Удалить'))) return;
		commit(function (a) { a.groups = a.groups.filter(function (x) { return x.id !== g.id; }); a.groups.forEach(function (x) { if (x.parent === g.id) x.parent = g.parent || ''; }); });
		if (S.cur === g.id) { S.cur = ''; S.sel = {}; startDraft(null); }
		AE.render();
	}
	function rename(g, name) {
		name = String(name || '').trim();
		if (!name || name === g.name) return;
		commit(function (a) { a.groups.forEach(function (x) { if (x.id === g.id) x.name = name; }); });
		if (S.draft && S.draft.id === g.id) S.draft.name = name;
	}
	/* вложить в другую группу; без циклов */
	function setParent(g, pid) {
		if (pid) { for (var q = gById(pid), n = 0; q && n < 100; q = gById(q.parent), n++) if (q.id === g.id) { U.toast('Нельзя вложить группу в её же вложенную', { bad: true }); AE.render(); return; } }
		commit(function (a) { a.groups.forEach(function (x) { if (x.id === g.id) x.parent = pid || ''; }); });
		if (S.draft && S.draft.id === g.id) S.draft.parent = pid || '';
	}
	function setOn(g, v) {
		commit(function (a) { a.groups.forEach(function (x) { if (x.id === g.id) x.on = !!v; }); });
		if (S.draft && S.draft.id === g.id) S.draft.on = !!v;
	}
	async function delMotion() {
		var g = gById(S.cur); if (!g || !g.m) { if (S.draft) { S.draft.m = null; S.dirty = false; AE.render(); } return; }
		if (!(await U.confirm('Удалить движение?', 'Движение группы «' + g.name + '» будет удалено, группа и детали останутся. Отменить — Ctrl+Z.', 'Удалить'))) return;
		commit(function (a) { a.groups.forEach(function (x) { if (x.id === g.id) x.m = null; }); });
		startDraft(gById(g.id)); AE.render();
	}
	async function setSrc(v) {
		if (v === src()) return;
		if (!(await askDraft())) return;
		commit(function (a) { a.src = v; });
		if (view()) view().animSet({});
	}
	/* анимации БАЗИСа → свои группы (для правки) */
	async function takeBazis() {
		var gb = glb(); if (!gb || !gb.B || !gb.B.n) return;
		var a0 = an(), have = a0 && a0.groups.length;
		if (have && !(await U.confirm('Взять анимации из БАЗИСа?', 'Анимации БАЗИСа (' + gb.B.n + ') будут добавлены к вашим группам (' + a0.groups.length + ').', 'Добавить'))) return;
		commit(function (a) {
			var r = AU.fromBazis(gb.B, O(), sc(), a);
			a.nid = r.nid; a.groups = a.groups.concat(r.groups); a.src = 'mine';
		});
		U.toast('Взято из БАЗИСа: ' + gb.B.n + ' — теперь их можно править');
	}
	/* предложение групп: из БАЗИСа или по названиям блоков — с подтверждением каждой */
	async function suggest() {
		var gb = glb(), a0 = an(), r = AU.suggest(O(), sc(), a0);
		var haveK = {}; groups().forEach(function (g) { g.mem.forEach(function (m) { haveK[m.k] = 1; }); });
		var list = r.groups.filter(function (g) { return !g.mem.some(function (m) { return haveK[m.k]; }); });
		if (!list.length) { U.toast(O() ? 'Предложить нечего: блоков со словами «фасад», «дверь», «ящ» без своей группы нет' + (gb && gb.B && gb.B.n ? '. Анимации из БАЗИСа — кнопкой «Взять в мои»' : '') : 'Предложения — по 3D-файлу из БАЗИСа: выгрузите модель скриптом 1.5 и новее'); return; }
		var rows = list.map(function (g, i) { return '<label class="aeSug"><input type="checkbox" data-i="' + i + '" checked> <b>' + esc(g.name) + '</b> <span class="mute">' + esc(typeName(g.m.type)) + (AU.isRot(g.m.type) ? ', ось — ' + esc(({ left: 'левая', right: 'правая', top: 'верхняя', bottom: 'нижняя' })[g.m.edge] || '') + ' кромка, ' + g.m.a1 + '°' : ', ход ' + g.m.dist + ' мм') + '</span></label>'; }).join('');
		var res = await U.modal({ title: 'Предложить группы', width: 620, body: '<p class="mute">Найдено по названиям блоков модели. Отметьте, что добавить; ось и ход потом можно поправить.</p><div class="aeSugL">' + rows + '</div>', buttons: [{ label: 'Отмена', value: false }, { label: 'Добавить отмеченные', value: true, primary: true }],
			onOpen: function (m) { S._sugM = m; } });
		if (!res || !S._sugM) return;
		var pick = [].map.call(S._sugM.querySelectorAll('.aeSug input:checked'), function (c) { return list[+c.dataset.i]; });
		if (!pick.length) return;
		commit(function (a) { a.src = 'mine'; pick.forEach(function (g) { g.id = newId(a); a.groups.push(g); }); });
		U.toast('Добавлено групп: ' + pick.length);
	}

	/* ----------------------------- ось: кромка, две точки, ручки ----------------------------- */
	function setEdge(which) {
		edit(function (d) {
			var X = d.m.space === 'model' ? AU.axesModel(sc()) : axesOf(d), E = extOf(d, X), e = AU.edge(E, X, which, false);
			if (!e) return;
			d.m.edge = which; d.m.p = e.p; d.m.d = e.d; d.m.len = e.len;
			var c = AU.fromAx(X, [(E.lo[0] + E.hi[0]) / 2, (E.lo[1] + E.hi[1]) / 2, (E.lo[2] + E.hi[2]) / 2]);
			d.m.sign = AU.autoSign(d.m.p, d.m.d, c, sc().front);
		});
	}
	function startPick(what) {
		var v = view(); if (!v || !S.draft || !S.draft.m) return;
		S.pick = what; S.p1 = null;
		var next = function (p) {
			if (S.pick === 'edge') {
				edit(function (d) { var X = axesOf(d), E = extOf(d, X), e = AU.nearestEdge(E, X, p); if (!e) return; d.m.p = e.p; d.m.d = e.d; d.m.len = e.len; d.m.edge = ''; var c = AU.fromAx(X, [(E.lo[0] + E.hi[0]) / 2, (E.lo[1] + E.hi[1]) / 2, (E.lo[2] + E.hi[2]) / 2]); d.m.sign = AU.autoSign(d.m.p, d.m.d, c, sc().front); });
				S.pick = ''; hint(''); return;
			}
			if (S.pick === 'p1') { S.p1 = p; S.pick = 'p2'; hint('Ось: щёлкните вторую точку оси. Esc — отмена'); v.pickPoint(next); return; }
			if (S.pick === 'p2') {
				var dv = [p[0] - S.p1[0], p[1] - S.p1[1], p[2] - S.p1[2]];
				if (!AU.norm(dv)) { U.toast('Точки совпадают — ось не задана', { bad: true }); hint('Ось: щёлкните вторую точку оси (другую). Esc — отмена'); v.pickPoint(next); return; }
				var p0 = S.p1;
				edit(function (d) { d.m.p = p0.slice(); d.m.d = dv.map(function (q) { return Math.round(q * 1000) / 1000; }); d.m.len = Math.round(Math.hypot(dv[0], dv[1], dv[2])); d.m.edge = ''; });
				S.pick = ''; S.p1 = null; hint(''); return;
			}
		};
		hint(what === 'edge' ? 'Ось: щёлкните рядом с кромкой, вокруг которой поворачивать. Esc — отмена' : 'Ось: щёлкните первую точку оси (прилипает к углам деталей). Esc — отмена');
		v.pickPoint(next);
	}
	function hint(t) { var h = $('aeHint'); if (h) { h.textContent = t; h.hidden = !t; } }
	AE.key = function (e) {
		if (!S.on) return false;
		if (e.key === 'Escape' && (S.pick || (view() && view().picking()))) { S.pick = ''; S.p1 = null; if (view()) view().pickPoint(null); hint(''); return true; }
		return false;
	};
	/* ось или стрелка хода в 3D у текущей группы (по черновику) */
	function gizmo() {
		var v = view(); if (!v || !v.setGizmo) return;
		var d = S.on && src() === 'mine' ? S.draft : null;
		if (!d || !d.m || !AU.norm(d.m.d || [0, 0, 0])) { v.setGizmo(null); return; }
		var u = AU.norm(d.m.d);
		if (AU.isRot(d.m.type)) {
			var L = d.m.len || Math.max(200, Math.min(2500, (function () { var E = extOf(d); return E ? Math.max(E.hi[0] - E.lo[0], E.hi[1] - E.lo[1]) : 600; })()));
			v.setGizmo({ kind: 'rot', a: d.m.p, b: [d.m.p[0] + u[0] * L, d.m.p[1] + u[1] * L, d.m.p[2] + u[2] * L], text: 'ось', handles: [0, 1] });
		} else {
			var X = axesOf(d), E = extOf(d, X); if (!E) { v.setGizmo(null); return; }
			var c = AU.fromAx(X, [(E.lo[0] + E.hi[0]) / 2, (E.lo[1] + E.hi[1]) / 2, E.hi[2]]), s = d.m.dist * (d.m.rev ? -1 : 1);
			S.gzA = c;
			v.setGizmo({ kind: 'move', a: c, b: [c[0] + u[0] * s, c[1] + u[1] * s, c[2] + u[2] * s], text: Math.round(d.m.dist) + ' мм', handles: [1] });
		}
	}
	AE.onGizmo = function (h, p, done) {
		var d = S.draft; if (!d || !d.m) return;
		if (AU.isRot(d.m.type)) {
			var u = AU.norm(d.m.d), L = d.m.len || 600, a = d.m.p, b = [a[0] + u[0] * L, a[1] + u[1] * L, a[2] + u[2] * L];
			if (h === 0) a = p; else b = p;
			var dv = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], l = Math.hypot(dv[0], dv[1], dv[2]);
			if (l < 1) return;
			d.m.p = a.map(function (q) { return Math.round(q * 10) / 10; }); d.m.d = dv.map(function (q) { return Math.round(q / l * 10000) / 10000; }); d.m.len = Math.round(l); d.m.edge = '';
		} else {
			var A0 = S.gzA || p, w = AU.norm(d.m.d), t = (p[0] - A0[0]) * w[0] + (p[1] - A0[1]) * w[1] + (p[2] - A0[2]) * w[2];
			d.m.dist = Math.max(1, Math.round(Math.abs(t)));
			if ((t < 0) !== !!d.m.rev) d.m.rev = t < 0;
		}
		S.dirty = true;
		if (done) { AE.sync(); drawRight(); }
		else { var v = view(); if (v && R) { AE.syncLight(); } drawRight(true); }
	};
	/* во время перетаскивания — без перестройки ручек */
	AE.syncLight = function () {
		var v = view(); if (!v) return;
		var a = an(), list = a ? a.groups.slice() : [];
		if (S.draft) list = list.map(function (g) { return g.id === S.draft.id ? S.draft : g; });
		R = AU.resolve({ groups: list }, O(), sc());
		v.setUserAnim(R);
	};

	/* ----------------------------- проверка движения ----------------------------- */
	function check() {
		var v = view(), r = S.draft ? recOf(S.draft.id) : null;
		if (!v || !r) { U.toast(S.draft && S.draft.m ? (AU.check(S.draft.m)[0] || 'Группа выключена или детали не найдены') : 'Сначала задайте движение', { bad: true }); return; }
		var ks = AU.below(R, r.k), id = ++S.checking;
		v.animSet(ks.reduce(function (o, k) { o[k] = 0; return o; }, {}));
		v.animGo(ks, 1);
		var wait = function (back) {
			if (id !== S.checking) return;
			if (v.animMoving()) { setTimeout(function () { wait(back); }, 120); return; }
			if (!back) { setTimeout(function () { if (id === S.checking) { v.animGo(ks, 0); setTimeout(function () { wait(true); }, 150); } }, 500); }
			else drawRight(true);
		};
		setTimeout(function () { wait(false); }, 150);
	}

	/* ----------------------------- воспроизведение ----------------------------- */
	function play(v1) {
		var v = view(); if (!v) return;
		var ks = scopeRecs(); if (!ks.length) { U.toast(S.scope === 'sel' ? 'Выберите группу в списке' : 'Анимаций нет'); return; }
		var p = v.animProg(), open = ks.filter(function (k) { return (p[k] || 0) > 0.5; }).length * 2 >= ks.length;
		var to = v1 === undefined ? (open ? 0 : 1) : v1;
		v.animGo(ks, to);
		ticker();
	}
	var tick = 0;
	function ticker() { if (tick) return; var step = function () { tick = 0; drawBottom(); drawGroups(true); var v = view(); if (v && v.animMoving && v.animMoving()) tick = setTimeout(step, 100); }; tick = setTimeout(step, 100); }
	AE.onAnim = function () { if (S.on) { drawBottom(); drawGroups(true); drawRight(true); } };

	/* ----------------------------- отрисовка ----------------------------- */
	AE.render = function () {
		var m = $('model'); if (!m) return;
		m.classList.toggle('anim', S.on);
		var bt = $('mAnimMode'); if (bt) [].forEach.call(bt.children, function (b) { b.classList.toggle('on', (b.dataset.a === '1') === S.on); });
		if (!S.on) { if (view() && view().setGizmo) view().setGizmo(null); return; }
		var bar = $('mBar'), rr = $('aeRight'); if (bar && rr) rr.style.top = bar.offsetHeight + 'px';
		if (S.cur && !gById(S.cur)) { S.cur = ''; S.sel = {}; startDraft(null); }
		drawGroups(); drawRight(); drawBottom(); gizmo();
	};
	function pctOf(id) { var v = view(), r = recOf(id); if (!v || !r) return null; return Math.round((v.animProg()[r.k] || 0) * 100); }
	function drawGroups(light) {
		var el = $('aeGroups'); if (!el) return;
		var s = src(), list = groups(), bn = bazisN();
		if (light) { [].forEach.call(el.querySelectorAll('[data-pct]'), function (x) { var p = pctOf(x.dataset.pct); x.textContent = p === null ? '' : p + '%'; }); return; }
		var h = '<div class="aeHead"><b>Подвижные группы</b><button id="aeNew" title="Группа из деталей, выделенных в структуре или в 3D (Ctrl — несколько)">＋ Группа из выделенного</button></div>';
		h += '<div class="aeSrc seg"><button data-src="mine" class="' + (s === 'mine' ? 'on' : '') + '" title="Свои группы и движения">Мои (' + list.length + ')</button><button data-src="bazis" class="' + (s === 'bazis' ? 'on' : '') + '"' + (bn ? '' : ' disabled') + ' title="Анимации, заданные в БАЗИСе (скрипт выгрузки 1.7 и новее)">Из БАЗИСа (' + bn + ')</button></div>';
		h += '<div class="aeRow2"><button id="aeSug" title="Найти двери и ящики по названиям блоков модели">Предложить…</button>' + (bn ? '<button id="aeTake" title="Скопировать анимации БАЗИСа в свои группы, чтобы править">Взять из БАЗИСа в мои</button>' : '') + '</div>';
		if (s === 'bazis') {
			var gb = glb();
			h += '<div class="mute aeNote">Сейчас работают анимации из БАЗИСа (' + bn + '): двери, ящики, петли — как заданы в модели. Править их — «Взять из БАЗИСа в мои».</div><div class="aeList">' +
				(gb && gb.B ? gb.B.L.filter(function (a) { return a.big; }).map(function (a) { return '<div class="aeG ro"><span>' + esc(String(a.n).replace(/[\r\n]+/g, ' ')) + '</span><small>' + (a.t === 1 ? 'поворот' : 'ход') + '</small></div>'; }).join('') : '') + '</div>';
		} else {
			if (!list.length) h += '<div class="mute aeNote">Групп нет. Выделите детали (фасад с ручкой, все детали ящика) и нажмите «＋ Группа из выделенного». Или «Предложить…»' + (bn ? ', или возьмите анимации из БАЗИСа' : '') + '.</div>';
			var small = list.filter(function (g) { return g.small; });
			var rows = [];
			(function walk(pid, depth) {
				list.filter(function (g) { return (g.parent || '') === pid && !g.small; }).forEach(function (g) { rows.push([g, depth]); walk(g.id, depth + 1); });
			})('', 0);
			/* группы с потерянным родителем — тоже показать */
			list.forEach(function (g) { if (!g.small && !rows.some(function (r) { return r[0] === g; })) rows.push([g, 0]); });
			h += '<div class="aeList">' + rows.map(function (r) { return grpRow(r[0], r[1]); }).join('');
			if (small.length) {
				h += '<div class="aeSmall" id="aeSmallT">' + (S.smallOpen ? '▾' : '▸') + ' Мелкие (петли, чашки): ' + small.length + '</div>';
				if (S.smallOpen) h += small.map(function (g) { return grpRow(g, 1); }).join('');
			}
			h += '</div>';
			if (R && (R.lost.length || R.near.length)) h += '<div class="aeLost" title="' + esc(R.lost.map(function (x) { return x.g + ': ' + x.n; }).concat(R.near.map(function (x) { return x.g + ': ' + x.n + ' (по месту)'; })).join('\n')) + '">' + (R.lost.length ? '⚠ Не найдено деталей групп: ' + R.lost.length + '. ' : '') + (R.near.length ? 'Найдено по имени и месту: ' + R.near.length + ' — проверьте.' : '') + '</div>';
		}
		h += '<div class="mute aeTip">Щелчок — выбрать группу, Ctrl — несколько. ПКМ — меню группы. Двойной щелчок по двери в 3D — открыть.</div>';
		el.innerHTML = h;
	}
	function grpRow(g, depth) {
		var m = g.m, p = pctOf(g.id), bad = m && AU.check(m).length;
		return '<div class="aeG' + (S.sel[g.id] ? ' on' : '') + (g.on === false ? ' off' : '') + '" data-g="' + esc(g.id) + '" style="padding-left:' + (6 + depth * 14) + 'px" title="' + esc(g.name + ' · деталей: ' + g.mem.length) + '"><span>' + (depth ? '└ ' : '') + esc(g.name) + ' <small>· ' + g.mem.length + '</small></span><small>' + (m ? (bad ? '⚠ ' : '') + esc(typeName(m.type)) : 'без движения') + ' <i data-pct="' + esc(g.id) + '">' + (p === null ? '' : p + '%') + '</i></small></div>';
	}
	function inp(f, v, w, t) { return '<input class="aeIn" data-f="' + f + '" value="' + esc(v) + '" style="width:' + (w || 64) + 'px"' + (t ? ' title="' + esc(t) + '"' : '') + '>'; }
	function seg(f, list, cur) { return '<span class="seg aeSeg" data-f="' + f + '">' + list.map(function (x) { return '<button data-v="' + x[0] + '" class="' + (x[0] === cur ? 'on' : '') + '"' + (x[2] ? ' title="' + esc(x[2]) + '"' : '') + '>' + esc(x[1]) + '</button>'; }).join('') + '</span>'; }
	function drawRight(light) {
		var el = $('aeRight'); if (!el) return;
		var d = S.draft, g = d ? gById(d.id) : null;
		if (light && el.querySelector('#aeOpenR')) {
			var p0 = d ? pctOf(d.id) : null; if (p0 !== null) { el.querySelector('#aeOpenR').value = p0; el.querySelector('#aeOpenV').textContent = p0 + '%'; }
			var pf = el.querySelectorAll('[data-f]'); [].forEach.call(pf, function (x) { if (x === document.activeElement) return; var f = x.dataset.f; if (!d || !d.m || x.tagName !== 'INPUT') return; var v = valOf(d.m, f); if (v !== undefined) x.value = v; });
			var ap = el.querySelector('#aeApply'); if (ap) ap.disabled = !S.dirty || !!(d && d.m && AU.check(d.m).length);
			return;
		}
		if (src() !== 'mine') { el.innerHTML = '<div class="aeEmpty"><b>Анимации из БАЗИСа</b><p>Они работают как заданы в модели: «Открыть» и «Закрыть» внизу, двойной щелчок по двери или ящику в 3D.</p><p>Чтобы настроить своё движение — «Взять из БАЗИСа в мои» или «Мои» слева.</p></div>'; return; }
		if (!d) { el.innerHTML = '<div class="aeEmpty"><b>Группа не выбрана</b><p>Как настроить фасад: выделите фасад и ручку → «＋ Группа из выделенного» → тип «Распашной» → ось по кромке → угол → «Проверить» → «Применить».</p><p>Ящик: выделите все его детали → группа → «Ящик» → направление и ход → «Проверить» → «Применить».</p></div>'; return; }
		var m = d.m, h = '';
		var parents = groups().filter(function (x) { if (x.id === d.id) return false; for (var q = x, n = 0; q && n < 100; q = gById(q.parent), n++) if (q.id === d.id) return false; return true; });
		h += '<div class="aeName"><input id="aeNm" value="' + esc(d.name) + '" title="Название группы — Enter, чтобы записать"><label title="Анимация группы включена"><input type="checkbox" id="aeOn"' + (d.on === false ? '' : ' checked') + '> вкл.</label></div>';
		h += '<div class="aeRowL"><span>Вложена в</span><select id="aePar"><option value="">— (верхний уровень)</option>' + parents.map(function (x) { return '<option value="' + esc(x.id) + '"' + (x.id === d.parent ? ' selected' : '') + '>' + esc(x.name) + '</option>'; }).join('') + '</select></div>';
		h += '<div class="aeChips">' + d.mem.map(function (x) { return '<span class="chip" title="' + esc(x.k) + '">' + esc(x.n.length > 34 ? x.n.slice(0, 33) + '…' : x.n) + ' <i data-rm="' + esc(x.k) + '" title="Убрать из группы">×</i></span>'; }).join('') + '</div>';
		h += '<div class="aeRow2"><button id="aeAdd" title="Добавить в группу детали, выделенные в структуре или в 3D">＋ Выделенное</button><button id="aeRm" title="Убрать из группы выделенные детали">− Выделенное</button><button id="aeShow" title="Выделить детали группы в структуре и в 3D">Показать</button></div>';
		if (!m) { h += '<div class="aeEmpty"><p>Движения нет.</p><button id="aeAddM" class="primary">Добавить движение</button></div>'; el.innerHTML = h; return; }
		var rot = AU.isRot(m.type), u = AU.norm(m.d || [0, 0, 0]) || [0, 0, 0], X = AU.axesModel(sc());
		var vert = Math.abs(u[0] * X.y[0] + u[1] * X.y[1] + u[2] * X.y[2]) > 0.999, hor = !vert && Math.abs(u[0] * X.y[0] + u[1] * X.y[1] + u[2] * X.y[2]) < 0.001;
		h += '<div class="aeSec">Движение</div>' + seg('type', AU.TYPES.map(function (t) { return [t[0], t[1]]; }), m.type);
		if (rot) {
			h += '<div class="aeSec">Ось поворота</div>';
			h += '<div class="aeRowL"><span>По кромке</span>' + seg('edge', AU.EDGES.map(function (e) { return [e[0], e[1]]; }), m.edge) + '</div>';
			h += '<div class="aeRow2"><button id="aePickE" title="Щёлкнуть в 3D рядом с кромкой группы">Кромка в 3D</button><button id="aePick2" title="Щёлкнуть две точки оси в 3D (прилипает к углам деталей)">Две точки</button></div>';
			h += '<div class="aeRowL"><span>Точка, мм</span>' + inp('px', f1(m.p[0]), 64) + inp('py', f1(m.p[1]), 64) + inp('pz', f1(m.p[2]), 64) + '</div>';
			h += '<div class="aeRowL"><span>Направление</span>' + seg('dirk', [['v', 'вертикально'], ['h', 'горизонтально'], ['own', 'своё']], vert ? 'v' : (hor && m.dirk !== 'own' ? 'h' : 'own')) + '</div>';
			h += '<div class="aeRowL"><span>Вектор</span>' + inp('dx', f1(u[0] * 1000) , 64, 'Направление оси (длина неважна)') + inp('dy', f1(u[1] * 1000), 64) + inp('dz', f1(u[2] * 1000), 64) + '</div>';
			h += '<div class="aeRowL"><span>Вращение</span><label><input type="checkbox" id="aeFlip"' + (m.flip ? ' checked' : '') + '> в обратную сторону</label></div>';
			h += '<div class="aeRowL"><span>Угол, °</span>' + inp('a0', f1(m.a0), 56, 'Угол в закрытом положении (обычно 0)') + ' → ' + inp('a1', f1(m.a1), 56, 'Угол в открытом положении') + '</div>';
			/* вынос на петле (1.19.1): дверь отходит от корпуса и поворачивается; само по петлям или вручную, мм */
			var ha = AU.hingeAuto(O(), sc(), memIdx(d)), hau = m.hauto !== false;
			h += '<div class="aeRowL"><span>Вынос на петле</span><label title="Сколько дверь отходит от корпуса при открывании — посчитать по петлям рядом с ней"><input type="checkbox" id="aeHAuto"' + (hau ? ' checked' : '') + '> само по петлям</label></div>';
			h += '<div class="aeRowL"><span>От корпуса, мм</span>' + inp('ho', f1(hau ? ha.ho : m.ho), 56, 'Насколько дверь отходит вперёд, когда открыта (0 — поворот только вокруг оси)') + '<span class="aeSm">вбок, мм</span>' + inp('hs', f1(hau ? ha.hs : m.hs), 50, 'Сдвиг в сторону оси (минус — в другую сторону)') + '</div>';
			if (hau && !ha.n) h += '<div class="mute aeNote">Петель рядом с группой нет — дверь только поворачивается. Впишите вынос вручную, если нужен.</div>';
		} else {
			h += '<div class="aeSec">Ход</div>';
			h += '<div class="aeRowL"><span>Направление</span><select id="aeDir">' + AU.DIRS.map(function (x) { return '<option value="' + x[0] + '"' + (x[0] === (m.dirName || 'own') ? ' selected' : '') + '>' + x[1] + '</option>'; }).join('') + '</select>' + seg('space', [['group', 'оси группы', 'Направление — в осях первой детали группы: если мебель повёрнута, «вперёд» — вперёд для неё'], ['model', 'оси модели']], m.space || 'group') + '</div>';
			if ((m.dirName || 'own') === 'own') h += '<div class="aeRowL"><span>Вектор</span>' + inp('dx', f1(u[0] * 1000), 64) + inp('dy', f1(u[1] * 1000), 64) + inp('dz', f1(u[2] * 1000), 64) + '</div>';
			h += '<div class="aeRowL"><span>Ход, мм</span>' + inp('dist', f1(m.dist), 72) + '<label><input type="checkbox" id="aeRev"' + (m.rev ? ' checked' : '') + '> обратно</label></div>';
		}
		h += '<div class="aeSec">Время</div>';
		h += '<div class="aeRowL"><span>Длительность, с</span>' + inp('ms', f1(m.ms), 56) + '<span class="aeSm">задержка, с</span>' + inp('delay', f1(m.delay), 50) + '</div>';
		h += '<div class="aeRowL"><span>Плавность</span><select id="aeEase">' + AU.EASE.map(function (x) { return '<option value="' + x[0] + '"' + (x[0] === m.ease ? ' selected' : '') + '>' + x[1] + '</option>'; }).join('') + '</select></div>';
		var p = pctOf(d.id);
		h += '<div class="aeRowL"><span>Открыто</span><input type="range" id="aeOpenR" min="0" max="100" value="' + (p || 0) + '"' + (p === null ? ' disabled' : '') + '><b id="aeOpenV">' + (p === null ? '—' : p + '%') + '</b></div>';
		var errs = AU.check(m);
		if (errs.length) h += '<div class="aeErr">' + errs.map(esc).join('<br>') + '</div>';
		h += '<div class="aeBtns"><button id="aeApply" class="primary"' + (!S.dirty || errs.length ? ' disabled' : '') + ' title="Записать движение в проект">Применить</button><button id="aeCheck" title="Открыть и закрыть группу с этими настройками">Проверить ▶</button><button id="aeUndo"' + (S.dirty ? '' : ' disabled') + ' title="Вернуть записанные настройки">Отменить</button></div>';
		h += '<div class="aeBtns"><button id="aeReset" title="Настройки по умолчанию для этого типа движения">Сбросить</button><button id="aeDelM" class="danger" title="Удалить движение (группа и детали останутся)">Удалить движение</button><button id="aeDelG" class="danger" title="Удалить группу (детали модели не меняются)">Удалить группу</button></div>';
		if (S.dirty) h += '<div class="mute aeNote">Изменения не применены: в 3D — черновик.</div>';
		el.innerHTML = h;
	}
	function valOf(m, f) {
		var u = AU.norm(m.d || [0, 0, 0]) || [0, 0, 0];
		return ({ px: m.p && f1(m.p[0]), py: m.p && f1(m.p[1]), pz: m.p && f1(m.p[2]), dx: f1(u[0] * 1000), dy: f1(u[1] * 1000), dz: f1(u[2] * 1000), a0: f1(m.a0), a1: f1(m.a1), ho: m.hauto === false ? f1(m.ho) : undefined, hs: m.hauto === false ? f1(m.hs) : undefined, dist: f1(m.dist), ms: f1(m.ms), delay: f1(m.delay) })[f];
	}
	function drawBottom() {
		var el = $('aeBottom'); if (!el) return;
		var v = view(), ks = scopeRecs(), p = v ? v.animProg() : {}, pct = ks.length ? Math.round(ks.reduce(function (s, k) { return s + (p[k] || 0); }, 0) / ks.length * 100) : 0;
		if (el.dataset.built) {
			var r = $('aePlayR'); if (r && document.activeElement !== r) r.value = pct; $('aePlayV').textContent = pct + '%';
			[].forEach.call(el.querySelectorAll('[data-scope]'), function (b) { b.classList.toggle('on', b.dataset.scope === S.scope); });
			return;
		}
		el.dataset.built = 1;
		el.innerHTML = '<button id="aeHome" class="icon" title="Исходное положение: всё закрыто сразу">⏮</button><button id="aePlay" class="icon" title="Воспроизвести: открыть, если закрыто, иначе закрыть">▶</button><button id="aePause" class="icon" title="Пауза">⏸</button>' +
			'<button id="aeOpenB">Открыть</button><button id="aeCloseB">Закрыть</button>' +
			'<span class="seg"><button data-scope="sel" title="Выбранные группы (с вложенными)">Выбранное</button><button data-scope="all" title="Все группы модели">Вся мебель</button></span>' +
			'<input type="range" id="aePlayR" min="0" max="100" value="' + pct + '" title="Открытие от 0 до 100 %"><b id="aePlayV">' + pct + '%</b><span id="aeHint" class="aeHint" hidden></span>';
		drawBottom();
	}

	/* ----------------------------- события ----------------------------- */
	function wire() {
		var gEl = $('aeGroups'), rEl = $('aeRight'), bEl = $('aeBottom');
		gEl.addEventListener('click', function (e) {
			var t = e.target;
			if (t.closest('#aeNew')) { AE.create(); return; }
			if (t.closest('#aeSug')) { suggest(); return; }
			if (t.closest('#aeTake')) { takeBazis(); return; }
			if (t.closest('#aeSmallT')) { S.smallOpen = !S.smallOpen; drawGroups(); return; }
			var sb = t.closest('[data-src]'); if (sb && !sb.disabled) { setSrc(sb.dataset.src); return; }
			var r = t.closest('.aeG[data-g]'); if (r) AE.select(r.dataset.g, e.ctrlKey || e.metaKey);
		});
		gEl.addEventListener('contextmenu', function (e) {
			var r = e.target.closest('.aeG[data-g]'); if (!r) return;
			e.preventDefault();
			var g = gById(r.dataset.g); if (!g) return;
			U.menu(e.clientX, e.clientY, [
				['Переименовать', function () { AE.select(g.id).then(function () { var n = $('aeNm'); if (n) { n.focus(); n.select(); } }); }],
				['Добавить выделенные детали', function () { addSel(g); }],
				['Убрать выделенные детали', function () { removeSelMem(g); }],
				['Показать детали', function () { window.Model.selectObjs(memIdx(g)); }],
				null,
				[g.on === false ? 'Включить анимацию' : 'Выключить анимацию', function () { setOn(g, g.on === false); }],
				['Удалить группу…', function () { delGroup(g); }]
			]);
		});
		rEl.addEventListener('click', function (e) {
			var t = e.target, g = S.draft ? gById(S.draft.id) : null;
			var rm = t.closest('[data-rm]'); if (rm && g) { removeMem(g, rm.dataset.rm); return; }
			if (t.closest('#aeAdd') && g) { addSel(g); return; }
			if (t.closest('#aeRm') && g) { removeSelMem(g); return; }
			if (t.closest('#aeShow') && g) { window.Model.selectObjs(memIdx(g)); return; }
			if (t.closest('#aeAddM') && S.draft) { var X = S.draft; edit(function (d) { d.m = defaultsFor(X, 'swing'); }); return; }
			if (t.closest('#aeApply')) { apply(); return; }
			if (t.closest('#aeUndo')) { startDraft(gById(S.draft.id)); AE.sync(); AE.render(); return; }
			if (t.closest('#aeCheck')) { check(); return; }
			if (t.closest('#aeReset') && S.draft && S.draft.m) { var tp = S.draft.m.type; edit(function (d) { d.m = defaultsFor(d, tp); }); return; }
			if (t.closest('#aeDelM')) { delMotion(); return; }
			if (t.closest('#aeDelG') && g) { delGroup(g); return; }
			if (t.closest('#aePickE')) { startPick('edge'); return; }
			if (t.closest('#aePick2')) { startPick('p1'); return; }
			var sb = t.closest('.aeSeg [data-v]'); if (sb && S.draft && S.draft.m) {
				var f = sb.parentNode.dataset.f, v = sb.dataset.v;
				if (f === 'type') { if (v === S.draft.m.type) return; var keepT = S.draft.m; edit(function (d) { var n = defaultsFor(d, v); n.ms = keepT.ms; n.delay = keepT.delay; n.ease = keepT.ease; d.m = n; }); return; }
				if (f === 'edge') { setEdge(v); return; }
				if (f === 'dirk') { if (v === 'own') { edit(function (d) { d.m.dirk = 'own'; }); return; } edit(function (d) { var Xg = axesOf(d), w = v === 'v' ? Xg.y : Xg.x; d.m.d = w.slice(); d.m.dirk = v; d.m.edge = ''; }); return; }
				if (f === 'space') { edit(function (d) { d.m.space = v; var Xs = v === 'model' ? AU.axesModel(sc()) : axesOf(d); if (d.m.dirName && d.m.dirName !== 'own') d.m.d = AU.dirVec(d.m.dirName, Xs); }); return; }
			}
		});
		rEl.addEventListener('change', function (e) {
			var t = e.target, g = S.draft ? gById(S.draft.id) : null;
			if (t.id === 'aeNm' && g) { rename(g, t.value); return; }
			if (t.id === 'aeOn' && g) { setOn(g, t.checked); return; }
			if (t.id === 'aePar' && g) { setParent(g, t.value); return; }
			if (!S.draft || !S.draft.m) return;
			if (t.id === 'aeFlip') { edit(function (d) { d.m.flip = t.checked; }); return; }
			if (t.id === 'aeHAuto') { var hv = AU.hingeAuto(O(), sc(), memIdx(S.draft)); edit(function (d) { if (t.checked) { delete d.m.hauto; delete d.m.ho; delete d.m.hs; } else { d.m.hauto = false; d.m.ho = hv.ho; d.m.hs = hv.hs; } }); return; }
			if (t.id === 'aeRev') { edit(function (d) { d.m.rev = t.checked; }); return; }
			if (t.id === 'aeEase') { edit(function (d) { d.m.ease = t.value; }); return; }
			if (t.id === 'aeDir') { edit(function (d) { d.m.dirName = t.value; if (t.value !== 'own') d.m.d = AU.dirVec(t.value, d.m.space === 'model' ? AU.axesModel(sc()) : axesOf(d)); }); return; }
			var f = t.dataset.f; if (!f) return;
			var v = num(t.value);
			if (!isFinite(v)) { t.classList.add('bad'); U.toast('Нужно число', { bad: true }); return; }
			t.classList.remove('bad');
			edit(function (d) {
				var m = d.m;
				if (f === 'px' || f === 'py' || f === 'pz') { m.p = m.p.slice(); m.p['xyz'.indexOf(f[1])] = v; m.edge = ''; }
				else if (f === 'dx' || f === 'dy' || f === 'dz') { var dv = (m.d || [0, 0, 0]).map(function (q) { return q * 1000; }); var u0 = AU.norm(m.d || [0, 0, 0]); if (u0) dv = u0.map(function (q) { return q * 1000; }); dv['xyz'.indexOf(f[1])] = v; m.d = dv.map(function (q) { return q / 1000; }); m.edge = ''; m.dirk = 'own'; if (!AU.isRot(m.type)) m.dirName = 'own'; }
				else if (f === 'ho' || f === 'hs') { if (m.hauto !== false) { var h0 = AU.hingeAuto(O(), sc(), memIdx(d)); m.ho = h0.ho; m.hs = h0.hs; } m.hauto = false; m[f] = v; }
				else if (f === 'ms' || f === 'delay' || f === 'a0' || f === 'a1' || f === 'dist') m[f] = v;
			});
		});
		rEl.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.target.blur(); });
		rEl.addEventListener('input', function (e) {
			if (e.target.id !== 'aeOpenR' || !S.draft) return;
			var r = recOf(S.draft.id), v = view(); if (!r || !v) return;
			var map = {}; AU.below(R, r.k).forEach(function (k) { map[k] = e.target.value / 100; }); v.animSet(map);
			$('aeOpenV').textContent = e.target.value + '%'; drawBottom(); drawGroups(true);
		});
		bEl.addEventListener('click', function (e) {
			var t = e.target, v = view(); if (!v) return;
			if (t.closest('#aeHome')) { var ks = (v.userAnim && v.userAnim() ? v.userAnim().L : ((glb() && glb().B) ? glb().B.L : [])).map(function (a) { return a.k; }); v.animSet(ks.reduce(function (o, k) { o[k] = 0; return o; }, {})); drawBottom(); drawGroups(true); drawRight(true); return; }
			if (t.closest('#aePlay')) { play(); return; }
			if (t.closest('#aePause')) { v.animPause(); return; }
			if (t.closest('#aeOpenB')) { play(1); return; }
			if (t.closest('#aeCloseB')) { play(0); return; }
			var sb = t.closest('[data-scope]'); if (sb) { S.scope = sb.dataset.scope; drawBottom(); }
		});
		bEl.addEventListener('input', function (e) {
			if (e.target.id !== 'aePlayR') return;
			var v = view(); if (!v) return;
			var ks = scopeRecs(), val = e.target.value / 100;
			if (!ks.length) return;
			var map = {}; ks.forEach(function (k) { map[k] = val; }); v.animSet(map);
			$('aePlayV').textContent = e.target.value + '%'; drawGroups(true); drawRight(true);
		});
		$('mAnimMode').addEventListener('click', function (e) { var b = e.target.closest('button[data-a]'); if (b) AE.mode(b.dataset.a === '1'); });
	}
	/* режим «Анимация» вкл/выкл */
	AE.mode = async function (on) {
		if (on === S.on) return;
		if (!on && !(await askDraft())) return;
		S.on = !!on;
		if (!S.on) { startDraft(null); S.pick = ''; if (view()) { view().pickPoint(null); view().setGizmo(null); } }
		AE.render();
		if (view()) view().redraw();
	};
	/* проект закрыт или открыт другой — забыть выбор и черновик */
	AE.reset = function () { S.cur = ''; S.sel = {}; startDraft(null); R = null; var b = $('aeBottom'); if (b) delete b.dataset.built; };
	AE.dirty = function () { return S.dirty; };
	AE.init = function () { if (AE._in) return; AE._in = 1; wire(); };
})();
