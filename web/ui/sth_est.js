/* STHGroup 2.0 — массовые действия и постоянные фильтры сметы. Работает после штатной отрисовки, индексы расчётных строк не меняются. */
(function () {
	'use strict';
	var U = window.UI, esc = U.esc, Es = window.Est, E = BM.est, C = BM.sthEst, K = window.MatBase;
	if (!U || !Es || !E || !C || !K) return;
	var X = window.STHEst = { sel: {}, last: '' };
	function S() { return window.App.S; }
	function key(w) { return C.rowKey(w); }
	function info(w) { try { return K.rowInfo(w); } catch (e) { return null; } }
	function filter() { return S().set.sthEstFilter || 'all'; }
	function rows() { return Es.R ? Es.R.rows : []; }
	function selected() { return rows().filter(function (w) { return X.sel[key(w)]; }); }
	function host() {
		var h = document.getElementById('sthEstTools');
		if (!h) {
			h = document.createElement('div'); h.id = 'sthEstTools'; h.className = 'sthEstTools';
			var body = document.getElementById('eBody'); if (body && body.parentNode) body.parentNode.insertBefore(h, body);
		}
		return h;
	}
	function toolbar(R, visible) {
		var h = host(); if (!h) return;
		var counts = C.counts(R.rows, info), n = selected().length;
		h.innerHTML = '<div class="sthEstFilters" role="group" aria-label="Фильтр сметы">' + C.FILTERS.map(function (f) {
			return '<button data-sef="' + f[0] + '" class="' + (filter() === f[0] ? 'on' : '') + '">' + f[1] + (counts[f[0]] ? ' <span>' + counts[f[0]] + '</span>' : '') + '</button>';
		}).join('') + '</div><div class="sthEstBulk"><b>' + (n ? 'Выбрано: ' + n : 'Массовые действия') + '</b>' +
			'<button data-seact="on" title="Включить выбранные строки в расчёт">Считать</button><button data-seact="off" title="Исключить выбранные строки из расчёта">Не считать</button>' +
			'<button data-seact="qty" title="Вернуть выбранным строкам количество из модели">Количество по модели</button><button data-seact="mat" class="primary" title="Выбрать один материал базы для всех выбранных строк">Материал из базы…</button>' +
			'<button data-seact="clear" class="icon" title="Снять выделение">✕</button></div><div class="sthEstShown">Показано: ' + visible + ' из ' + R.rows.length + '</div>';
	}
	function decorate(R) {
		var body = document.getElementById('eBody'), table = body && body.querySelector('table.et');
		if (!table) { toolbar(R, 0); return; }
		var map = {}, visible = 0;
		R.rows.forEach(function (w) { map[key(w)] = w; if (X.sel[key(w)] === undefined) return; });
		Object.keys(X.sel).forEach(function (k) { if (!map[k]) delete X.sel[k]; });
		var head = table.querySelector('thead tr');
		if (head && !head.querySelector('.sthSelHead')) {
			var th = document.createElement('th'); th.className = 'sthSelHead'; th.innerHTML = '<input type="checkbox" id="seAll" title="Выбрать все показанные строки" aria-label="Выбрать все показанные строки">'; head.insertBefore(th, head.firstChild);
		}
		table.querySelectorAll('tbody > tr').forEach(function (tr) {
			var blank = document.createElement('td'); blank.className = 'sthSelCell';
			if (tr.dataset.k && map[tr.dataset.k] && tr.querySelector('td.num') && !tr.classList.contains('mbar')) {
				var w = map[tr.dataset.k], show = C.match(w, filter(), info(w));
				tr.hidden = !show; if (show) visible++;
				tr.classList.toggle('sthSelected', !!X.sel[tr.dataset.k]);
				blank.innerHTML = '<input type="checkbox" class="seRow" data-k="' + esc(tr.dataset.k) + '"' + (X.sel[tr.dataset.k] ? ' checked' : '') + ' aria-label="Выбрать строку">';
				tr.dataset.seVisible = show ? '1' : '';
			} else {
				tr.hidden = true; tr.dataset.seVisible = '';
				if (tr.classList.contains('mbar')) {
					var p = tr.previousElementSibling; tr.hidden = !(p && p.dataset.seVisible === '1' && p.dataset.k === tr.dataset.k);
				} else if (tr.classList.contains('addrow')) {
					var q = tr.previousElementSibling; tr.hidden = !(q && q.dataset.seVisible === '1');
				}
			}
			tr.insertBefore(blank, tr.firstChild);
		});
		/* Заголовки групп нужны только перед видимой строкой; осиротевшие разделы скрываются. */
		var list = Array.prototype.slice.call(table.querySelectorAll('tbody > tr'));
		list.forEach(function (tr, i) {
			if (!(tr.classList.contains('gtop') || tr.classList.contains('ghdr') || tr.classList.contains('gsub'))) return;
			var show = false;
			for (var j = i + 1; j < list.length; j++) {
				var n = list[j];
				if (n.querySelector('td.num')) { show = n.dataset.seVisible === '1'; break; }
				if (n.classList.contains('gtop') || n.classList.contains('ghdr')) break;
			}
			tr.hidden = !show;
		});
		if (!visible) {
			var tr = document.createElement('tr'); tr.className = 'sthFilterEmpty';
			tr.innerHTML = '<td></td><td colspan="9">По этому фильтру строк нет. <button data-sef="all" class="link">Показать все</button></td>';
			table.querySelector('tbody').appendChild(tr);
		}
		toolbar(R, visible);
	}
	var render0 = Es.render;
	Es.render = function () {
		var x = render0.apply(this, arguments), h = document.getElementById('sthEstTools');
		try {
			var R = Es.R, body = document.getElementById('eBody');
			if (!R || !body || body.classList.contains('paper')) { if (h) h.hidden = true; return x; }
			if (h) h.hidden = false; decorate(R);
		} catch (e) { console.warn(e); }
		return x;
	};
	function need() { var r = selected(); if (!r.length) U.toast('Сначала отметьте строки галочками в первом столбце.'); return r; }
	async function action(a) {
		var R = Es.R; if (!R) return;
		if (a === 'clear') { X.sel = {}; Es.render(); return; }
		var list = need(); if (!list.length) return;
		if (a === 'mat') {
			list = list.filter(function (w) { return ['panel', 'linear', 'edge', 'fastener', 'profile'].indexOf(w.kind) >= 0 && !w.own && !w.card; });
			if (!list.length) { U.toast('Среди выбранных нет строк, которые можно связать с базой.'); return; }
			if (window.STH.pickMaterial) await window.STH.pickMaterial(list[0], list); return;
		}
		if (a === 'off') {
			var ok = await U.confirm('Массовое действие', 'Исключить из расчёта строк: ' + list.length + '? Их сумма уйдёт из итога и документов. Действие можно отменить через Ctrl+Z.', 'Не считать');
			if (!ok) return;
		}
		window.App.pushUndo(); var pl = Es.pl(), we = Es.we(), changed = 0;
		if (a === 'on' || a === 'off') {
			list.forEach(function (w) { if (w.own || w.kind === 'extra') return; E.setUnit(R, w, a === 'off' ? 'off' : 'on', pl, we); changed++; });
			Es.saveStore(true);
		} else if (a === 'qty') {
			list.forEach(function (w) { if (!w.qtyKey || !w.manual) return; E.setQty(w, w.calc, we); changed++; });
			window.App.save();
		}
		X.sel = {}; Es.render(); U.toast(changed ? 'Изменено строк: ' + changed + '.' : 'В выбранных строках менять нечего.');
	}
	document.addEventListener('click', function (e) {
		var f = e.target.closest && e.target.closest('[data-sef]');
		if (f) { e.preventDefault(); S().set.sthEstFilter = f.dataset.sef; window.App.saveSettings(); Es.render(); return; }
		var a = e.target.closest && e.target.closest('[data-seact]');
		if (a) { e.preventDefault(); action(a.dataset.seact).catch(U.error); return; }
		if (e.target.closest && e.target.closest('.sthSelCell')) e.stopPropagation();
	}, true);
	document.addEventListener('change', function (e) {
		var t = e.target;
		if (t.id === 'seAll') {
			document.querySelectorAll('#eBody tr[data-se-visible="1"] .seRow').forEach(function (c) { c.checked = t.checked; X.sel[c.dataset.k] = t.checked; });
			Es.render(); return;
		}
		if (t.classList && t.classList.contains('seRow')) { X.sel[t.dataset.k] = t.checked; Es.render(); }
	}, true);
})();
