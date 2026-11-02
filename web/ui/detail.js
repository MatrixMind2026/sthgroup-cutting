/* STHGroup — раздел «Деталировка»: чертёж каждой детали на своём листе.
   Слева детали по материалам (с количеством и обработками), в центре лист выбранной детали — тот же, что уйдёт
   в PDF. Вид листа и что показывать — кнопками над листом; порядок деталей — над списком (общий с «Присадкой»). */
(function () {
	'use strict';
	var U = window.UI, P = BM.project, Dr = BM.drill, Det = BM.detail, $ = U.$, esc = U.esc;
	var Dt = window.Detail = {};
	var cache = { types: null, stamp: '', list: null };

	Dt.cards = function () {
		var st = window.App.S.st;
		if (!st) return [];
		var stamp = JSON.stringify([st.work.sets, st.work.scope, st.work.parts]);
		if (cache.types !== st.types || cache.stamp !== stamp) { cache.types = st.types; cache.stamp = stamp; cache.list = Det.cards(st); }
		return cache.list;
	};
	Dt.current = function () {
		var S = window.App.S, list = Dt.cards(), i;
		for (i = 0; i < list.length; i++) if (list[i].key === S.detailKey) return list[i];
		if (list.length) { S.detailKey = list[0].key; return list[0]; }
		return null;
	};
	/* обработки детали для списка слева: без кромки и отверстий */
	function opsOf(st, c) { if (c._dops === undefined) { try { c._dops = Det.model(st, c).ops.filter(function (o) { return !/кромка/i.test(o.what) && !o.hole; }).length; } catch (e) { c._dops = 0; } } return c._dops; }

	Dt.render = function () {
		var A = window.App, S = A.S, st = S.st;
		if (!st || S.section !== 'detail') return;
		var list = Dt.cards(), cur = Dt.current(), h = '', fig = 0, shown = 0;
		list.forEach(function (c) { if (opsOf(st, c)) fig++; });
		Det.groups(st, list).forEach(function (g) {
			if (g.group) h += '<div class="dGrp" title="' + esc(g.group) + '">' + esc(g.group) + '</div>';
			g.cards.forEach(function (c) { shown++; h += item(c, opsOf(st, c)); });
		});
		function item(c, n) {
			return '<div class="dIt' + (cur && c.key === cur.key ? ' on' : '') + '" data-k="' + esc(c.key) + '" title="' + esc(Dr.title(c)) + '"><div><b>' + esc(P.main(c.t) || c.t.name) + '</b><span>' + esc(c.t.name) + ' · ' + P.dim(c.t.L) + '×' + P.dim(c.t.W) + '</span></div>' +
				'<i>' + c.count + ' шт.' + (n ? '<br>' + n + ' ' + A.plural(n, 'обработка', 'обработки', 'обработок') : '') + '</i></div>';
		}
		$('kSort').innerHTML = window.Look.sortHtml(st);
		$('kList').innerHTML = h || '<div class="mute" style="padding:8px 2px">' + (list.length ? 'Таких деталей нет — выберите «Все».' : 'В проекте нет листовых деталей.') + '</div>';
		$('kCount').textContent = list.length ? 'Деталей: ' + list.length + (fig ? ' · с обработкой: ' + fig : '') + (shown < list.length ? ' · показано ' + shown : '') : '';
		$('kLook').innerHTML = window.Look.barHtml(st, 'detail');
		var on = $('kList').querySelector('.dIt.on');
		if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest' });
		var wrap = $('kPages');
		if (!cur) { $('kTitle').textContent = 'Деталировка'; $('kChips').innerHTML = ''; wrap.innerHTML = '<div class="dEmpty">Откройте проект, выгруженный из БАЗИСа.</div>'; return; }
		var pxw = Math.max(520, Math.min(1500, wrap.clientWidth - 44)) * (S.detailZoom || 1), sh = BM.out.detailSheet(st, cur, pxw, list.indexOf(cur) + 1, list.length), pg = sh.pg, bad = Det.check(pg).length;
		wrap.innerHTML = '<div class="dPage">' + sh.svg + '</div>';
		$('kTitle').textContent = Dr.title(cur);
		$('kChips').innerHTML = '<span class="chip">' + cur.count + ' шт.</span><span class="chip">' + P.dim(cur.t.L) + ' × ' + P.dim(cur.t.W) + ' × ' + P.dim(cur.t.th) + '</span>' +
			(bad ? '<span class="chip warn">наложений: ' + bad + '</span>' : '') + window.Look.frontChip(st, cur) + window.Look.grvChip(st, cur);
	};
	Dt.select = function (key) { window.App.S.detailKey = key; Dt.render(); $('kPages').scrollTop = 0; };
	Dt.step = function (d) {
		var st = window.App.S.st, list = st ? Det.order(st, Dt.cards()) : [], cur = Dt.current(), i = cur ? list.indexOf(cur) : -1;
		if (!list.length) return;
		Dt.select(list[Math.max(0, Math.min(list.length - 1, i + d))].key);
	};
	Dt.init = function () {
		$('kList').addEventListener('click', function (e) { var d = e.target.closest('.dIt'); if (d) Dt.select(d.dataset.k); });
		$('kPages').addEventListener('click', function (e) {
			var f = e.target.closest ? e.target.closest('.fe') : null; if (f) { window.Look.setFront(Dt.current(), f.getAttribute('data-sd')); return; }
			var gv = e.target.closest ? e.target.closest('.gv') : null; if (gv) window.Look.setGrv(Dt.current(), gv.getAttribute('data-gi'));      // щелчок по пазу — отключить / вернуть
		});
		$('kChips').addEventListener('click', function (e) { if (e.target.closest('[data-front="auto"]')) window.Look.setFront(Dt.current(), 'auto'); var gb = e.target.closest('[data-grv]'); if (gb) window.Look.setGrv(Dt.current(), gb.getAttribute('data-grv')); });
		window.Look.bind('kLook', 'kSort', function () { Dt.render(); });
		$('kZoomIn').onclick = function () { var S = window.App.S; S.detailZoom = Math.min(3, (S.detailZoom || 1) * 1.25); Dt.render(); };
		$('kZoomOut').onclick = function () { var S = window.App.S; S.detailZoom = Math.max(0.5, (S.detailZoom || 1) * 0.8); Dt.render(); };
		$('kZoomFit').onclick = function () { window.App.S.detailZoom = 1; Dt.render(); };
	};
})();
