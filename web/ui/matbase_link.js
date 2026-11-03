/* STHGroup — связь программы с «Базой материалов» (2.2): кнопка «База» открывает отдельное окно (matbase.html),
   смета и раскрой берут из базы цену, формат листа и поставщика, «Списать по заказу» — расход со склада и деловые обрезки.
   Где лежит файл базы, окно базы записывает в matbase.json в папке настроек; здесь база перечитывается, когда файл
   изменился (при возврате в окно программы и перед «Списать по заказу»). Материала в базе нет — всё считается как раньше. */
(function () {
	'use strict';
	var U = window.UI, MB = BM.mb, esc = U.esc;
	var K = window.MatBase = { path: '', mtime: 0, win: null };
	MB.cur = null;
	function S() { return window.App.S; }
	function cfgPath() { var d = S().boot && S().boot.dataDir; return d ? U.join(d, 'matbase.json') : ''; }
	function token() { return new URLSearchParams(location.search).get('t') || ''; }

	/* где файл базы — его выбирают в окне базы */
	K.readPath = async function () {
		var p = cfgPath();
		if (!p) return '';
		try { var st = await U.api.stat(p); if (!st.exists) return ''; var j = JSON.parse(await U.api.readText(p)); return typeof j.file === 'string' ? j.file : ''; } catch (e) { return ''; }
	};
	/* перечитать базу, если файл изменился; true — изменилась */
	K.refresh = async function () {
		var path = await K.readPath();
		if (!path) { var had = !!MB.cur; MB.cur = null; K.path = ''; K.mtime = 0; return had; }
		var st;
		try { st = await U.api.stat(path); } catch (e) { return false; }
		if (!st.exists) { var had2 = !!MB.cur; MB.cur = null; K.path = path; K.mtime = 0; return had2; }
		if (path === K.path && st.mtime === K.mtime && MB.cur) return false;
		try { MB.cur = MB.fix(JSON.parse(await U.api.readText(path))); K.path = path; K.mtime = st.mtime || 0; return true; } catch (e) { console.warn('база материалов не прочитана', e); return false; }
	};
	K.has = function () { return !!(MB.cur && Object.keys(MB.cur.mats).length); };

	/* открыть окно базы: отдельное окно; если окно не открылось (планшет) — поверх программы */
	K.open = function () {
		var url = 'matbase.html?t=' + encodeURIComponent(token()) + (K.path ? '&file=' + encodeURIComponent(K.path) : '');
		if (K.win && !K.win.closed) { try { K.win.focus(); return; } catch (e) { /* окно закрыли */ } }
		var w = null;
		if (!document.body.classList.contains('tablet')) { try { w = window.open(url, 'brmatbase', 'width=1400,height=900'); } catch (e) { w = null; } }
		if (w) { K.win = w; try { w.focus(); } catch (e2) { } return; }
		K.overlay(url);
	};
	K.overlay = function (url) {
		var o = document.getElementById('mbOverlay');
		if (!o) {
			o = document.createElement('div');
			o.id = 'mbOverlay';
			o.innerHTML = '<div class="mbOvBar"><b>База материалов и комплектующих</b><button class="x" title="Закрыть базу (Esc)">✕</button></div><iframe title="База материалов"></iframe>';
			document.body.appendChild(o);
			o.querySelector('.x').onclick = K.closeOverlay;
		}
		o.querySelector('iframe').src = url;
		o.hidden = false;
	};
	K.closeOverlay = function () {
		var o = document.getElementById('mbOverlay');
		if (!o || o.hidden) return;
		var f = o.querySelector('iframe');
		try { if (f.contentWindow && f.contentWindow.MBW) f.contentWindow.MBW.save(); } catch (e) { }
		o.hidden = true;
		setTimeout(function () { f.src = 'about:blank'; K.changed(); }, 400);
	};
	/* после правок в окне базы — пересчитать смету и форматы новых материалов */
	K.changed = async function () {
		if (!(await K.refresh())) return;
		var s = S();
		if (s.st && s.section === 'est' && window.Est) window.Est.render();
	};

	/* ------------------------------ смета ------------------------------------ */
	function unitOf(u) {
		u = String(u || '').toLowerCase().replace(/\(.*?\)/g, '').replace(/[\s.]/g, '');
		if (/^(л|лист|листа|листы|листов)$/.test(u)) return 'лист';
		if (/^(м2|м²|квм|кв\.м|квметров|метровкв)$/.test(u)) return 'м2';
		if (/^(м|пм|мп|погм|метр|метра|метров|погонныхметров)$/.test(u)) return 'м';
		if (/^(шт|штук|штуки)$/.test(u)) return 'шт';
		return u;
	}
	K.unitOf = unitOf;
	/* цена базы в единице строки сметы; 0 — единицы не сходятся */
	function priceIn(inf, rowUnit) {
		var a = unitOf(inf.unit), b = unitOf(rowUnit);
		if (!inf.price) return 0;
		if (a === b || !b) return inf.price;
		if (a === 'лист' && b === 'м2' && inf.L > 0 && inf.W > 0) return Math.round(inf.price / (inf.L * inf.W / 1e6) * 100) / 100;
		if (a === 'м2' && b === 'лист' && inf.L > 0 && inf.W > 0) return Math.round(inf.price * inf.L * inf.W / 1e6 * 100) / 100;
		return 0;
	}
	K.priceIn = priceIn;
	/* у плит в смете к названию приписана толщина («ЛДСП Белый  16 мм») — в базе её нет */
	function bareName(n) { return String(n || '').replace(/\s+\d+(?:[.,]\d+)?\s*мм\s*$/i, '').replace(/\s+/g, ' ').trim(); }
	K.rowInfo = function (w) {
		if (!MB.cur || !w || w.own) return null;
		var art = w.art0 || w.art, n = w.name0 || w.skey || w.title;
		return MB.infoFor(MB.cur, n, art) || (w.kind === 'panel' ? MB.infoFor(MB.cur, bareName(n), art) : null) || (w.title !== w.name0 ? MB.infoFor(MB.cur, w.title, w.art) : null);
	};
	/* смета с данными базы: цена — из базы, если в прайсе для строки своей цены нет; поставщик и ссылка — из базы */
	K.build = function (st, cfg, pl, we, sup) {
		var E = BM.est, R = E.build(st, cfg, pl, we, sup);
		if (!K.has()) return R;
		var px = null, hasP = function (id) { return Object.prototype.hasOwnProperty.call(pl.P || {}, id); };
		R.rows.forEach(function (w) {
			if (w.sthReplace) return;   // STHGroup: у замены цена уже из выбранного материала базы
			var inf = K.rowInfo(w);
			if (!inf || !w.priceId || hasP(w.priceId) || (w.priceAlt && hasP(w.priceAlt))) return;
			var p = priceIn(inf, w.unit);
			if (p > 0) { if (!px) px = JSON.parse(JSON.stringify(pl)); px.P[w.priceId] = p; }
		});
		if (px) { R = E.build(st, cfg, px, we, sup); R.pl = pl.name; }
		R.rows.forEach(function (w) {
			if (w.sthReplace) return;   // STHGroup: не перезаписывать замену прежним сопоставлением
			var inf = K.rowInfo(w);
			if (!inf) return;
			w.mb = { id: inf.id, stock: inf.stock, unit: inf.unit, price: px && px.P[w.priceId] !== undefined && !hasP(w.priceId) };
			if (inf.art && !w.artSet && !w.own) w.art = inf.art;   // STHGroup: артикул из карточки базы (свой артикул, вписанный в смете, главнее)
			if (inf.shop || inf.photo) w.sup = { shop: inf.shop || (w.sup && w.sup.shop) || '', url: inf.url || (w.sup && w.sup.url) || '', img: inf.photo || (w.sup && w.sup.img) || '', tex: inf.photo ? 0 : (w.sup && w.sup.tex), how: 'база материалов' };
		});
		return R;
	};

	/* ------------------------------ раскрой ---------------------------------- */
	/* формат листа и текстура нового материала (не настроенного вручную) — из базы */
	K.sheetOf = function (name) {
		if (!MB.cur) return null;
		var inf = MB.infoFor(MB.cur, name, '');
		if (!inf || !(inf.L > 0 && inf.W > 0)) return null;
		var m = MB.cur.mats[inf.id];
		return { L: inf.L, W: inf.W, tex: m ? m.tex : 0 };
	};

	/* --------------------------- списать по заказу --------------------------- */
	/* что уходит на заказ: листы раскроя (новые, без остатков) и строки сметы, кроме плитных; обрезки — свободные куски листов */
	K.need = function (st, R) {
		var b = MB.cur, need = [], offcuts = [], miss = [], seen = {};
		st.mats.forEach(function (m) {
			var lay = st.work.layout[m.key], inf = MB.infoFor(b, m.name, '');
			if (!lay || !lay.sheets || !lay.sheets.length) return;
			if (!inf) { miss.push(BM.project.matTitle(m)); return; }
			seen[inf.id] = 1;
			var fresh = lay.sheets.filter(function (sh) { return !sh.rem; }), u = unitOf(inf.unit), q;
			if (u === 'м2') q = fresh.reduce(function (a, sh) { return a + sh.L * sh.W / 1e6; }, 0);
			else q = fresh.length;
			if (q > 0) need.push({ mat: inf.id, qty: Math.round(q * 1e4) / 1e4, title: BM.project.matTitle(m) });
			lay.sheets.forEach(function (sh) { if (sh.tree && BM.cut.wasteRects) BM.cut.wasteRects(sh.tree).forEach(function (r) { offcuts.push({ mat: inf.id, L: r.w, W: r.h, n: 1 }); }); });
		});
		(R ? R.rows : []).forEach(function (w) {
			if (w.kind === 'panel' || w.off || w.info || !(w.val > 0)) return;
			var inf = K.rowInfo(w);
			if (!inf || seen[inf.id]) return;
			var a = unitOf(inf.unit), u = unitOf(w.unit), q = w.val;
			if (a !== u && u && a) {
				if (a === 'лист' && u === 'м2' && inf.L > 0 && inf.W > 0) q = Math.ceil(q / (inf.L * inf.W / 1e6));
				else return;
			}
			need.push({ mat: inf.id, qty: q, title: w.title });
		});
		return { need: need, offcuts: offcuts, miss: miss };
	};
	K.projectKey = function () { var s = S(); return s.path || (s.st && BM.project.modelName(s.st.model)) || 'проект'; };
	K.writeOff = async function () {
		var s = S(), A = window.App;
		if (!s.st) return;
		await K.refresh();
		if (!MB.cur) { U.toast('Базы материалов нет: откройте «База» и выберите папку для неё.'); return; }
		if (Object.keys(s.jobs || {}).length) { U.toast('Раскрой ещё считается — спишите, когда он закончится.'); return; }
		var R = window.Est ? K.build(s.st, window.Est.cfg(), window.Est.pl(), window.Est.we(), s.prices ? s.prices.sup : {}) : null;
		var n = K.need(s.st, R), b = MB.cur, key = K.projectKey(), lim = b.set.offMin || [300, 200];
		var prev = b.stock.docs.filter(function (d) { return d.kind === 'out' && !d.off && d.project === key; });
		if (!n.need.length) { U.toast('Ни одного материала этого заказа нет в базе материалов — списывать нечего.' + (n.miss.length ? ' Нет в базе: ' + n.miss.slice(0, 3).join(', ') + (n.miss.length > 3 ? '…' : '') : '')); return; }
		var good = n.offcuts.filter(function (o) { var L = Math.max(o.L, o.W), W = Math.min(o.L, o.W); return L >= Math.max(lim[0], lim[1]) && W >= Math.min(lim[0], lim[1]); });
		var rows = n.need.map(function (x) { var m = b.mats[x.mat], bal = MB.balance(b, x.mat), pv = 0; prev.forEach(function (d) { d.lines.forEach(function (l) { if (l.mat === x.mat) pv += -l.qty; }); });
			var after = Math.round((bal + pv - x.qty) * 1e4) / 1e4;
			return '<tr><td class="name">' + esc(m.name) + '</td><td class="r">' + String(x.qty).replace('.', ',') + ' ' + esc(m.unit) + '</td><td class="r' + (after < 0 ? ' neg' : '') + '">' + String(after).replace('.', ',') + '</td></tr>'; }).join('');
		var ok = await U.modal({ title: 'Списать по заказу', width: 640, cls: 'mbWo',
			body: (prev.length ? '<p class="warn">Этот заказ уже списан ' + esc(prev[0].date.split('-').reverse().join('.')) + ' — прежнее списание отменится и заменится этим.</p>' : '') +
				'<table class="grid"><thead><tr><th>Материал</th><th>Списать</th><th>Останется</th></tr></thead><tbody>' + rows + '</tbody></table>' +
				'<p class="mute" style="margin-top:8px">Деловые обрезки на склад (не меньше ' + lim[0] + '×' + lim[1] + ' мм): ' + good.length + '.' + (n.miss.length ? ' Нет в базе (не списываются): ' + esc(n.miss.join(', ')) + '.' : '') + '</p>',
			buttons: [{ label: 'Отмена', value: false }, { label: 'Списать', primary: true, value: true }] });
		if (!ok) return;
		await K.refresh();
		b = MB.cur;
		var r = MB.writeOff(b, key, n.need, n.offcuts);
		if (!r.doc) { U.toast('Списывать нечего.'); return; }
		await K.saveBase();
		var docId = r.doc.id;
		U.toast('Списано по заказу: ' + r.doc.lines.length + ' поз.' + (r.offcuts.length ? ', деловых обрезков на склад: ' + r.offcuts.length : '') + (r.replaced ? ' (прежнее списание заменено)' : '') + '.',
			{ ms: 15000, actions: [{ label: 'Отменить', run: async function () { await K.refresh(); MB.cancelDoc(MB.cur, docId); await K.saveBase(); U.toast('Списание отменено.'); } }] });
		if (A && A.render && s.section === 'est') window.Est.render();
	};
	K.saveBase = async function () {
		await U.api.write(K.path, JSON.stringify(MB.cur));
		try { var st = await U.api.stat(K.path); K.mtime = st.mtime || 0; } catch (e) { }
	};

	/* при возврате в окно программы — база могла измениться в окне базы */
	window.addEventListener('focus', function () { K.changed(); });
	document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && document.getElementById('mbOverlay') && !document.getElementById('mbOverlay').hidden && !document.querySelector('#modals .back:not(.out)')) K.closeOverlay(); });
	K.init = async function () { await K.refresh(); };
})();
