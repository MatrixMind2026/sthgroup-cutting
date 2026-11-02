/* STHGroup 2.0 — расчёт ядром C++ (помощник brcore рядом с программой): раскрой (в фоновом потоке, worker.js),
   смета (BM.est.build) и карты присадки (BM.drill.cards). Окно шлёт программе запрос /api/core, она — помощнику.
   Если помощника нет, он не ответил или ответил ошибкой — считает JavaScript, как раньше (и до конца сеанса).

   Помощник хранит состояние проекта между запросами: модель (doc без work) уходит один раз, дальше — только
   work и настройки. Ответы сверены с JavaScript (bazisreborn-core, tests/js). */
(function (G) {
	'use strict';
	var BM = G.BM = G.BM || {};
	var N = BM.native = { on: false, token: '', fails: 0, last: '' };
	var E = BM.est, Dr = BM.drill;
	var origBuild = E && E.build, origCards = Dr && Dr.cards;
	var MARK = '\u0001img';                                   // фото материала не гоняется к помощнику: вместо него — метка

	/* один запрос к помощнику (синхронно: смета и присадка в окне считаются сразу); в проверках под Node подменяется */
	N.send = function (body) {
		var x = new XMLHttpRequest();
		x.open('POST', '/api/core', false);
		x.setRequestHeader('X-BM-Token', N.token);
		x.setRequestHeader('Content-Type', 'application/json');
		x.send(JSON.stringify(body));
		if (x.status !== 200) throw new Error('ядро C++: ответ ' + x.status);
		return JSON.parse(x.responseText);
	};

	/* номер модели: новая модель (открыт другой проект, повторная выгрузка) — новый номер */
	var ids = typeof WeakMap !== 'undefined' ? new WeakMap() : null, seq = 0, sentKey = '';
	function keyOf(st) {
		var m = st.doc && st.doc.model;
		if (!m || !ids) return 'm0';
		if (!ids.has(m)) ids.set(m, 'm' + (++seq) + '-' + Date.now());
		return ids.get(m);
	}
	function docOf(st) { var d = {}; for (var k in st.doc) if (st.doc.hasOwnProperty(k) && k !== 'work') d[k] = st.doc[k]; return d; }
	function baseOf() {
		var B = BM.base && BM.base.cur;
		if (!B) return null;
		var b = {}, k;
		for (k in B) if (B.hasOwnProperty(k) && k !== 'mats') b[k] = B[k];
		b.mats = {};
		for (k in B.mats || {}) if (B.mats.hasOwnProperty(k)) {
			var m = B.mats[k], o = {};
			for (var f in m) if (m.hasOwnProperty(f)) o[f] = (f === 'img' && m[f]) ? MARK : m[f];
			b.mats[k] = o;
		}
		return b;
	}
	/* запрос с состоянием проекта: модель — только если помощник её ещё не знает */
	function call(op, st, extra) {
		var key = keyOf(st), body = { op: op, key: key, set: st.set, work: st.work, base: baseOf() };
		for (var k in extra) if (extra.hasOwnProperty(k)) body[k] = extra[k];
		if (sentKey !== key) body.doc = docOf(st);
		var r = N.send(body);
		if (r && r.need === 'doc') { body.doc = docOf(st); r = N.send(body); }
		if (!r || !r.ok) throw new Error((r && r.error) || 'ядро C++ не ответило');
		sentKey = key;
		return r.out;
	}
	function fail(where, e) {
		N.fails++; N.last = where + ': ' + (e && e.message ? e.message : e);
		N.on = false;                                              // до конца сеанса — JavaScript
		if (typeof console !== 'undefined') console.warn('Ядро C++ выключено, считает JavaScript —', N.last);
	}
	function replace(dst, src) {
		var k;
		for (k in dst) if (dst.hasOwnProperty(k) && !(k in src)) delete dst[k];
		for (k in src) if (src.hasOwnProperty(k)) dst[k] = src[k];
	}
	function low(s) { return String(s || '').toLowerCase(); }
	function hasMask(name, list) { var n = low(name).replace(/^\s+|\s+$/g, ''); for (var i = 0; i < (list || []).length; i++) if (list[i] && n.indexOf(list[i]) >= 0) return true; return false; }

	/* смета: расчёт в C++, затем — то, что есть только в окне (материалы проекта, фото, правила для правок строк) */
	if (E && origBuild) E.build = function (st, cfg, pl, we, sup) {
		if (!N.on) return origBuild.apply(this, arguments);
		var out;
		try { out = call('est', st, { cfg: cfg, pl: pl, we: we || {}, sup: sup || null }); }
		catch (e) { fail('смета', e); return origBuild.apply(this, arguments); }
		replace(pl, out.pl);
		replace(cfg, out.cfg);
		var R = out.R, Res = R.res, B = BM.base, i;
		R.cfg = cfg;
		R.supMap = sup || null;
		Res.gmap = {};
		for (i = 0; i < Res.groups.length; i++) {
			var g = Res.groups[i], areas = g.byMat || {};
			g.mats = g.mats.map(function (k) { return st.matBy[k]; });
			g.byMat = {};
			for (var j = 0; j < g.mats.length; j++) if (g.mats[j]) g.byMat[g.mats[j].key] = { m: g.mats[j], area: areas[g.mats[j].key] || 0 };
			Res.gmap[g.key] = g;
		}
		for (i = 0; i < R.rows.length; i++) {
			var w = R.rows[i], s = w.sup;
			if (!s || typeof s !== 'object') continue;
			if (s.img === MARK) s.img = (B && B.cur && B.infoOf) ? B.infoOf(B.cur, w.skey).img || '' : '';
			if (!s.img && 'fromNote' in s && B && typeof B.thumb === 'function' && w.skey) { s.img = B.thumb(w.skey) || ''; s.tex = s.img ? 1 : 0; }   // текстура из папки — её знает только окно
		}
		/* строки разделов сметы взяли фото у своих строк ещё в C++ — переносим исправленное */
		for (i = 0; i < (R.sections || []).length; i++) R.sections[i].rows.forEach(function (x) { var w2 = R.rows[x.row]; if (w2 && w2.sup && typeof w2.sup === 'object') x.img = w2.sup.img; });
		/* правила по умолчанию для правок строк (как в estimate.js) */
		R._defaultSqm = function (gkey) {
			if (String(gkey).indexOf('MFAC:') === 0) return 1;
			var g2 = Res.gmap.hasOwnProperty(gkey) ? Res.gmap[gkey] : null;
			return (g2 && hasMask(g2.mat, cfg._glass)) ? 1 : 0;
		};
		R._defaultFunit = function (n) {
			if (Res.KitMulti && Res.KitMulti.hasOwnProperty(n)) return 1;
			var bm = B && B.cur ? B.cur.mats[n] : null;
			return bm && bm.bz && /^компл/i.test(bm.bz.unit || '') ? 1 : 0;
		};
		return R;
	};

	/* карты присадки: список карт считает C++, деталь и материал — те же объекты, что в окне */
	if (Dr && origCards) Dr.cards = function (st) {
		if (!N.on) return origCards.apply(this, arguments);
		var out;
		try { out = call('drill.cards', st, {}); }
		catch (e) { fail('присадка', e); return origCards.apply(this, arguments); }
		for (var i = 0; i < out.length; i++) {
			var c = out[i];
			c.t = st.typeBy[c.t]; c.mat = st.matBy[c.mat];
			if (!c.t || !c.mat) { fail('присадка', 'карта ' + c.key + ' не найдена в проекте'); return origCards.apply(this, arguments); }
		}
		return out;
	};
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));
