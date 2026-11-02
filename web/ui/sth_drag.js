/* STHGroup — перетаскивание строк (за ⋮⋮ слева) и столбцов (за заголовок) в таблицах.
   Строки: STHDrag.rows(контейнер, { rows: 'селектор строк', drop: function (строка, куда, после) }) — оранжевая линия показывает, куда встанет строка.
   Столбцы: STHDrag.cols(таблица, 'ключ', перерисовать) — порядок столбцов запоминается в настройках для каждой таблицы (set.sthCols);
   правый щелчок по заголовку — «Вернуть столбцы как было». */
(function () {
	'use strict';
	var U = window.UI;
	function S() { return window.App && window.App.S; }
	var D = window.STHDrag = {};
	D.handle = function () { return '<span class="sthH" title="Перетащите, чтобы поменять порядок">⋮⋮</span>'; };

	/* ------------------------------- строки ------------------------------- */
	D.rows = function (host, o) {
		if (!host || host._sthRows) { if (host) host._sthRows = o; return; }
		host._sthRows = o;
		host.addEventListener('pointerdown', function (e) {
			var h = e.target.closest && e.target.closest('.sthH'); if (!h || e.button !== 0) return;
			var opt = host._sthRows, src = h.closest(opt.rows); if (!src) return;
			e.preventDefault();
			var group = src.getAttribute('data-dg') || '', list = Array.prototype.filter.call(host.querySelectorAll(opt.rows), function (r) { return (r.getAttribute('data-dg') || '') === group; });
			var tgt = null, after = false;
			src.classList.add('sthDragging'); document.body.classList.add('sthNoSel');
			function mark() { list.forEach(function (r) { r.classList.remove('sthDropB', 'sthDropA'); }); if (tgt && tgt !== src) tgt.classList.add(after ? 'sthDropA' : 'sthDropB'); }
			function move(ev) {
				tgt = null;
				for (var i = 0; i < list.length; i++) { var b = list[i].getBoundingClientRect(); if (ev.clientY >= b.top && ev.clientY <= b.bottom) { tgt = list[i]; after = ev.clientY > b.top + b.height / 2; break; } }
				if (!tgt && list.length) { var f = list[0].getBoundingClientRect(), l = list[list.length - 1].getBoundingClientRect(); if (ev.clientY < f.top) { tgt = list[0]; after = false; } else if (ev.clientY > l.bottom) { tgt = list[list.length - 1]; after = true; } }
				mark();
			}
			function up() {
				document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up);
				src.classList.remove('sthDragging'); document.body.classList.remove('sthNoSel');
				var t = tgt, a = after; tgt = null; mark();
				if (!t || t === src) return;
				var from = list.indexOf(src), to = list.indexOf(t) + (a ? 1 : 0); if (from < to) to--;
				if (from === to) return;
				try { opt.drop(src, t, a, from, to); } catch (er) { U.error(er); }
			}
			document.addEventListener('pointermove', move); document.addEventListener('pointerup', up);
		});
	};
	/* переставить элемент массива: из from в to */
	D.move = function (arr, from, to) { if (from < 0 || from >= arr.length) return arr; var x = arr.splice(from, 1)[0]; arr.splice(Math.max(0, Math.min(to, arr.length)), 0, x); return arr; };

	/* ------------------------------- столбцы ------------------------------ */
	function saved(key) { var s = S(); return s && s.set && s.set.sthCols && Array.isArray(s.set.sthCols[key]) ? s.set.sthCols[key] : null; }
	function save(key, ord) { var s = S(); if (!s || !s.set) return; s.set.sthCols = s.set.sthCols || {}; if (ord) s.set.sthCols[key] = ord; else delete s.set.sthCols[key]; if (window.App.saveSettings) window.App.saveSettings(); }
	function headRow(t) { return t.tHead && t.tHead.rows[0]; }
	/* порядок применяется ко всем строкам таблицы с тем же числом ячеек (строки-заголовки разделов с colspan не трогаем) */
	function apply(t, ord) {
		var hr = headRow(t); if (!hr) return;
		var n = hr.cells.length;
		if (!ord || ord.length !== n) return;
		Array.prototype.forEach.call(t.rows, function (tr) {
			if (tr.cells.length !== n) return;
			var cells = Array.prototype.slice.call(tr.cells);
			ord.forEach(function (ci) { tr.appendChild(cells[ci]); });
		});
	}
	D.cols = function (t, key, redraw) {
		if (!t || !key) return;
		var hr = headRow(t); if (!hr) return;
		Array.prototype.forEach.call(hr.cells, function (c, i) { c.setAttribute('data-ci', i); c.classList.add('sthCol'); });
		var ord = saved(key);
		if (ord && ord.length === hr.cells.length) apply(t, ord);
		t._sthCols = { key: key, redraw: redraw };
		if (t._sthColsOn) return;
		t._sthColsOn = true;
		hr.addEventListener('contextmenu', function (e) {
			if (!saved(t._sthCols.key)) return;
			e.preventDefault();
			U.confirm('Столбцы', 'Вернуть столбцы этой таблицы как было?', 'Вернуть').then(function (ok) { if (!ok) return; save(t._sthCols.key, null); if (t._sthCols.redraw) t._sthCols.redraw(); });
		});
		hr.addEventListener('pointerdown', function (e) {
			var th = e.target.closest('th'); if (!th || e.button !== 0 || /INPUT|SELECT|BUTTON|TEXTAREA/.test(e.target.tagName)) return;
			var x0 = e.clientX, started = false, tgt = null, after = false, cells = Array.prototype.slice.call(hr.cells);
			function mark() { cells.forEach(function (c) { c.classList.remove('sthColB', 'sthColA'); }); if (tgt && tgt !== th) tgt.classList.add(after ? 'sthColA' : 'sthColB'); }
			function move(ev) {
				if (!started) { if (Math.abs(ev.clientX - x0) < 6) return; started = true; th.classList.add('sthColDrag'); document.body.classList.add('sthNoSel'); }
				tgt = null;
				cells.forEach(function (c) { var b = c.getBoundingClientRect(); if (ev.clientX >= b.left && ev.clientX <= b.right) { tgt = c; after = ev.clientX > b.left + b.width / 2; } });
				mark();
			}
			function up() {
				document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up);
				if (!started) return;
				th.classList.remove('sthColDrag'); document.body.classList.remove('sthNoSel');
				var tg = tgt, a = after; tgt = null; mark();
				if (!tg || tg === th) return;
				/* новый порядок — по исходным номерам столбцов (data-ci) */
				var cur = cells.map(function (c) { return Number(c.getAttribute('data-ci')); }), from = cells.indexOf(th), to = cells.indexOf(tg) + (a ? 1 : 0);
				if (from < to) to--;
				D.move(cur, from, to);
				/* применяем перестановку к текущей таблице: из нынешнего порядка в новый */
				var pos = cur.map(function (ci) { return cells.map(function (c) { return Number(c.getAttribute('data-ci')); }).indexOf(ci); });
				apply(t, pos);
				save(t._sthCols.key, cur);
			}
			document.addEventListener('pointermove', move); document.addEventListener('pointerup', up);
		});
	};
})();

/* смета: столбцы таблицы перетаскиваются, свои строки — за ⋮⋮ (порядок в проекте, внутри раздела) */
(function () {
	'use strict';
	var Es = window.Est, D = window.STHDrag, U = window.UI;
	if (!Es || !Es.render || !D) return;
	var r0 = Es.render;
	Es.render = function () {
		var x = r0.apply(this, arguments);
		try {
			var body = document.getElementById('eBody'), R = Es.R;
			if (!body || !R || body.classList.contains('paper')) return x;
			R.rows.forEach(function (w) {
				if (!w.ownId) return;
				var tr = body.querySelector('tr[data-k="' + (window.CSS && CSS.escape ? CSS.escape(w.kind + '|' + w.ownId) : w.kind + '|' + w.ownId) + '"]'); if (!tr) return;
				tr.classList.add('sthOwn'); tr.setAttribute('data-dg', w.head + '|' + (w.mkind || '')); tr.setAttribute('data-own', w.ownId);
				var c = tr.querySelector('td.num'); if (c && !c.querySelector('.sthH')) c.insertAdjacentHTML('afterbegin', D.handle());
			});
			D.rows(body, { rows: 'tr.sthOwn', drop: function (src, t, after) {
				var we = Es.we(), list = we.rows || [], a = src.getAttribute('data-own'), b = t.getAttribute('data-own');
				var ia = -1; list.forEach(function (r, i) { if (r.id === a) ia = i; }); if (ia < 0) return;
				var it = list.splice(ia, 1)[0], ib = -1; list.forEach(function (r, i) { if (r.id === b) ib = i; });
				list.splice(ib < 0 ? list.length : ib + (after ? 1 : 0), 0, it);
				window.App.pushUndo && window.App.pushUndo(); window.App.save(); Es.render();
			} });
			var t = body.querySelector('table.et'); if (t) D.cols(t, 'est', function () { Es.render(); });
		} catch (e) { console.warn(e); }
		return x;
	};
})();
