/* STHGroup: перестановка и ширина видимых столбцов компактной сметы. */
(function () {
	'use strict';
	var visible = [0, 1, 3, 5, 7, 8], labels = { 0: 'Выбор', 1: 'Номер', 3: 'Наименование', 5: 'Количество', 7: 'Цена', 8: 'Сумма' };
	var minimum = { 0: 32, 1: 34, 3: 180, 5: 130, 7: 150, 8: 110 };
	function settings() { return window.App.S.set; }
	function valid(order) { return Array.isArray(order) && order.length === 10 && order.every(function (n, i) { return Number.isInteger(n) && n >= 0 && n < 10 && order.indexOf(n) === i; }); }
	function save() { if (window.App.saveSettings) window.App.saveSettings(true); }
	var C = window.STHEstColumns = {};
	C.attach = function (table) {
		if (!table.classList.contains('sthCompact') || table._sthSizing) return;
		if (C.observer) C.observer.disconnect();
		table._sthSizing = true;
		var head = table.tHead.rows[0], set = settings(), ids = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
		if (head.cells.length !== 10) return;
		Array.from(table.rows).forEach(function (tr) {
			if (tr.cells.length === 10) Array.from(tr.cells).forEach(function (cell, i) { cell.dataset.ci = i; });
			else if (!tr.classList.contains('sthDetail')) {
				var td = document.createElement('td'), wrap = document.createElement('div'); wrap.className = 'sthSpanLine'; td.colSpan = 10;
				Array.from(tr.cells).forEach(function (cell) { var box = document.createElement('span'); while (cell.firstChild) box.appendChild(cell.firstChild); if (box.childNodes.length) wrap.appendChild(box); });
				tr.replaceChildren(td); td.appendChild(wrap);
			}
		});
		var order = set.sthCols && valid(set.sthCols.est) ? set.sthCols.est.slice() : ids.slice();
		// Служебные галочки и номера всегда слева; прежний пользовательский порядок данных сохраняется.
		order = [0, 1].concat(order.filter(function (id) { return id !== 0 && id !== 1; }));
		var stored = set.sthColWidths && set.sthColWidths.est || {}, widths = {};
		visible.forEach(function (id) { var value = Number(stored[id]); widths[id] = Number.isFinite(value) ? Math.max(minimum[id], Math.min(1600, value)) : minimum[id]; });
		if (!Number.isFinite(Number(stored[3]))) widths[3] = Math.max(340, table.parentElement.clientWidth - 32 - 34 - 156 - 176 - 110);
		if (!Number.isFinite(Number(stored[5]))) widths[5] = 156;
		if (!Number.isFinite(Number(stored[7]))) widths[7] = 176;
		var initialWidth = table.parentElement.clientWidth, initialTotal = visible.reduce(function (sum, id) { return sum + widths[id]; }, 0);
		var savedPane = Number(stored._paneWidth);
		if (savedPane > 0 && initialWidth < savedPane) widths[3] = Math.max(minimum[3], widths[3] + initialWidth - savedPane);
		else if (!(savedPane > 0) || initialWidth > savedPane) { if (initialTotal < initialWidth) widths[3] += initialWidth - initialTotal; }
		var group = document.createElement('colgroup'); table.insertBefore(group, table.firstChild);
		function layout() {
			group.replaceChildren(); var total = 0;
			order.forEach(function (id) {
				var col = document.createElement('col'); col.dataset.ci = id;
				if (visible.indexOf(id) < 0) { col.style.display = 'none'; col.style.width = '0px'; } else { col.style.width = widths[id] + 'px'; total += widths[id]; }
				group.appendChild(col);
			});
			table.style.width = total + 'px';
			Array.from(head.cells).forEach(function (th) { var id = Number(th.dataset.ci); th.style.width = visible.indexOf(id) < 0 ? '0px' : widths[id] + 'px'; });
		}
		function reorder() {
			Array.from(table.rows).forEach(function (tr) { if (tr.cells.length !== 10) return; var cells = Array.from(tr.cells); order.forEach(function (id) { tr.appendChild(cells.find(function (cell) { return Number(cell.dataset.ci) === id; })); }); });
			layout();
		}
		function persist() { set.sthCols = set.sthCols || {}; set.sthCols.est = order.slice(); set.sthColWidths = set.sthColWidths || {}; set.sthColWidths.est = Object.assign({}, widths, { _paneWidth: table.parentElement.clientWidth }); save(); }
		function reset() { if (set.sthCols) delete set.sthCols.est; if (set.sthColWidths) delete set.sthColWidths.est; save(); window.Est.render(); }
		Array.from(head.cells).forEach(function (th) {
			var id = Number(th.dataset.ci); if (visible.indexOf(id) < 0 || id < 3) return;
			th.classList.add('sthMovable'); th.tabIndex = 0; th.title = 'Тяните заголовок для переноса · границу для ширины · Alt + стрелки — перенос';
			var handle = document.createElement('span'); handle.className = 'sthResize'; handle.tabIndex = 0; handle.setAttribute('role', 'separator'); handle.setAttribute('aria-orientation', 'vertical'); handle.setAttribute('aria-label', 'Ширина: ' + labels[id]);
			th.appendChild(handle);
			handle.addEventListener('pointerdown', function (e) {
				if (e.button !== 0) return; e.preventDefault(); e.stopPropagation();
				var start = e.clientX, original = widths[id]; document.body.classList.add('sthResizing');
				function move(ev) { widths[id] = Math.round(Math.max(minimum[id], Math.min(1600, original + ev.clientX - start))); layout(); }
				function end() { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', end); document.removeEventListener('pointercancel', cancel); document.body.classList.remove('sthResizing'); persist(); }
				function cancel() { widths[id] = original; layout(); end(); }
				document.addEventListener('pointermove', move); document.addEventListener('pointerup', end); document.addEventListener('pointercancel', cancel);
			});
			handle.addEventListener('keydown', function (e) { if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return; e.preventDefault(); e.stopPropagation(); widths[id] = Math.max(minimum[id], Math.min(1600, widths[id] + (e.key === 'ArrowRight' ? 20 : -20))); layout(); persist(); });
			th.addEventListener('keydown', function (e) {
				if (e.target !== th || !e.altKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
				e.preventDefault(); var data = order.filter(function (i) { return i >= 3 && visible.indexOf(i) >= 0; }), at = data.indexOf(id), to = at + (e.key === 'ArrowRight' ? 1 : -1); if (to < 0 || to >= data.length) return;
				var other = data[to], a = order.indexOf(id), b = order.indexOf(other); order[a] = other; order[b] = id; reorder(); persist(); th.focus();
			});
			th.addEventListener('pointerdown', function (e) {
				if (e.button !== 0 || e.target.closest('.sthResize,input,button')) return;
				var x = e.clientX, target = null, after = false, started = false;
				function clear() { head.querySelectorAll('th').forEach(function (el) { el.classList.remove('sthColB', 'sthColA', 'sthColDrag'); }); }
				function move(ev) {
					if (!started && Math.abs(ev.clientX - x) < 6) return;
					started = true; clear(); th.classList.add('sthColDrag'); document.body.classList.add('sthNoSel'); target = null;
					head.querySelectorAll('.sthMovable').forEach(function (el) { var r = el.getBoundingClientRect(); if (ev.clientX >= r.left && ev.clientX <= r.right) { target = el; after = ev.clientX > (r.left + r.right) / 2; } });
					if (target && target !== th) target.classList.add(after ? 'sthColA' : 'sthColB');
				}
				function end() {
					document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', end); document.removeEventListener('pointercancel', cancel); clear(); document.body.classList.remove('sthNoSel');
					if (!started || !target || target === th) return;
					order.splice(order.indexOf(id), 1); var index = order.indexOf(Number(target.dataset.ci)) + (after ? 1 : 0); order.splice(index, 0, id); reorder(); persist();
				}
				function cancel() { target = null; end(); }
				document.addEventListener('pointermove', move); document.addEventListener('pointerup', end); document.addEventListener('pointercancel', cancel);
			});
		});
		head.addEventListener('contextmenu', function (e) { e.preventDefault(); window.UI.menu(e.clientX, e.clientY, [['Сбросить ширину и порядок', reset]]); });
		var bar = document.querySelector('#sthEstTools .sthEstBar'); if (bar && !bar.querySelector('.sthColumnsReset')) { var button = document.createElement('button'); button.className = 'sthColumnsReset'; button.textContent = 'Сбросить столбцы'; button.onclick = reset; bar.appendChild(button); }
		reorder();
		/* STHGroup: таблица следует за стыком панелей, а не остаётся прежней ширины. */
		var previousWidth = table.parentElement.clientWidth;
		if (window.ResizeObserver) {
			var observer = new ResizeObserver(function () {
				if (!table.isConnected) { observer.disconnect(); return; }
				var available = table.parentElement.clientWidth; if (!(available > 0)) return;
				var delta = available - previousWidth; if (Math.abs(delta) < 1) return;
				previousWidth = available;
				var total = visible.reduce(function (sum, id) { return sum + widths[id]; }, 0);
				widths[3] = Math.max(minimum[3], widths[3] + (delta > 0 ? Math.max(0, available - total) : delta)); layout();
			});
			C.observer = observer; observer.observe(table.parentElement);
		}
	};
})();
