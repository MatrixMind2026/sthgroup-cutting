/* STHGroup 2.0 — массовые действия, фильтры и полное контекстное меню сметы.
   Работает после штатной отрисовки, индексы расчётных строк не меняются. */
(function () {
	'use strict';
	var U = window.UI, esc = U.esc, Es = window.Est, E = BM.est, C = BM.sthEst, K = window.MatBase;
	if (!U || !Es || !E || !C || !K) return;
	var X = window.STHEst = { sel: {}, open: {}, last: '', toolsOpen: false };
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
		h.innerHTML = '<div class="sthEstBar"><button data-setools="1" class="sthEstMore" aria-expanded="' + (X.toolsOpen ? 'true' : 'false') + '">Фильтры и действия</button>' +
			'<span class="sthEstHint">Стрелка — старые поля · Правая кнопка мыши — все действия</span><div class="sthEstShown">Показано: ' + visible + ' из ' + R.rows.length + (n ? ' · выбрано: ' + n : '') + '</div></div>' +
			'<div class="sthEstPanels"' + (X.toolsOpen ? '' : ' hidden') + '><div class="sthEstFilters" role="group" aria-label="Фильтр сметы">' + C.FILTERS.map(function (f) {
				return '<button data-sef="' + f[0] + '" class="' + (filter() === f[0] ? 'on' : '') + '">' + f[1] + (counts[f[0]] ? ' <span>' + counts[f[0]] + '</span>' : '') + '</button>';
			}).join('') + '</div><div class="sthEstBulk"><b>' + (n ? 'Выбрано: ' + n : 'Массовые действия') + '</b>' +
			'<button data-seact="on" title="Включить выбранные строки в расчёт">Считать</button><button data-seact="off" title="Исключить выбранные строки из расчёта">Не считать</button>' +
			'<button data-seact="qty" title="Вернуть выбранным строкам количество из модели">Количество по модели</button><button data-seact="mat" class="primary" title="Выбрать один материал базы для всех выбранных строк">Материал из базы…</button>' +
			'<button data-seact="clear" class="icon" title="Снять выделение">✕</button></div></div>';
	}
	function mainRow(k) {
		var found = null;
		document.querySelectorAll('#eBody table.et tbody > tr[data-k]').forEach(function (tr) {
			if (!found && tr.dataset.k === k && !tr.classList.contains('sthDetail') && tr.querySelector('td.num')) found = tr;
		});
		return found;
	}
	function setOpen(k, value) {
		X.open[k] = !!value;
		var tr = mainRow(k); if (!tr) return;
		var b = tr.querySelector('[data-seexpand]'), d = b && document.getElementById(b.getAttribute('aria-controls'));
		tr.classList.toggle('sthOpen', !!value);
		if (b) {
			b.setAttribute('aria-expanded', value ? 'true' : 'false');
			b.setAttribute('aria-label', (value ? 'Скрыть' : 'Показать') + ' старые поля и действия позиции');
			b.title = (value ? 'Скрыть' : 'Показать') + ' артикул, режим расчёта, поставщика и остальные действия';
		}
		if (d) d.hidden = !value || tr.hidden;
	}
	X.setOpen = setOpen;
	function detailField(label, cls) {
		var box = document.createElement('div'); box.className = 'sthDetailField ' + (cls || '');
		var title = document.createElement('div'); title.className = 'sthDetailLabel'; title.textContent = label;
		var body = document.createElement('div'); body.className = 'sthDetailBody';
		box.appendChild(title); box.appendChild(body); return { box: box, body: body };
	}
	function moveChildren(from, to) { while (from && from.firstChild) to.appendChild(from.firstChild); }
	/* Компактная строка сохраняет все штатные элементы: они не дублируются, а переносятся в раскрываемую панель. */
	function expandable(R, map) {
		var body = document.getElementById('eBody'), table = body && body.querySelector('table.et');
		if (!table) return;
		table.classList.add('sthCompact');
		var head = table.querySelector('thead tr'), cols = head ? head.cells.length : 10, seq = 0;
		/* Артикул, режим, расчёт модели и поставщик остаются ячейками таблицы для совместимости с перестановкой столбцов, но видны только внутри. */
		if (head) [2, 4, 6, 9].forEach(function (i) { if (head.cells[i]) head.cells[i].classList.add('sthDetailCol'); });
		var list = Array.prototype.slice.call(table.querySelectorAll('tbody > tr[data-k]'));
		list.forEach(function (tr) {
			var k = tr.dataset.k, w = map[k], nm = tr.querySelector('td.nm');
			if (!w || !nm || tr.classList.contains('mbar')) return;
			var ar = tr.querySelector('td.ar'), calc = tr.querySelector('td.calc'), sup = tr.querySelector('td.sup');
			var uv = tr.querySelector('select.uv'), unit = uv && uv.closest('td'); if (!unit) unit = tr.cells[4];
			var detail = document.createElement('tr'); detail.className = 'sthDetail'; detail.dataset.k = k; detail.id = 'sthEstDetail' + (++seq);
			var cell = document.createElement('td'); cell.colSpan = cols;
			var grid = document.createElement('div'); grid.className = 'sthDetailGrid';
			var name = detailField('Наименование, фото и материал из базы', 'sthDetailName');
			moveChildren(nm, name.body); grid.appendChild(name.box);
			var article = detailField('Артикул'); moveChildren(ar, article.body); grid.appendChild(article.box);
			var mode = detailField('Режим расчёта'); moveChildren(unit, mode.body); grid.appendChild(mode.box);
			var model = detailField('Данные модели'); moveChildren(calc, model.body); grid.appendChild(model.box);
			var supplier = detailField('Поставщик и ссылка', 'sthDetailSupplier'); moveChildren(sup, supplier.body); grid.appendChild(supplier.box);
			cell.appendChild(grid);
			var actions = document.createElement('div'); actions.className = 'sthDetailActions';
			actions.innerHTML = '<button type="button" data-semenu="' + esc(k) + '">Все действия со строкой</button><span>Здесь же: правка названия, фото, сопоставление, объединение и возврат количества по модели.</span>';
			var del = tr.querySelector('button.del'); if (del) actions.insertBefore(del, actions.firstChild);
			cell.appendChild(actions); detail.appendChild(cell);
			[ar, unit, calc, sup].forEach(function (td) { if (td) td.classList.add('sthDetailCol'); });
			tr.classList.add('sthCompactRow');
			nm.innerHTML = '<button type="button" class="sthRowToggle" data-seexpand="' + esc(k) + '" aria-controls="' + detail.id + '" aria-expanded="false"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3l5 5-5 5"/></svg></button>' +
				'<span class="sthRowName">' + esc(w.title || w.label || '') + '</span>' + (w.off ? '<small class="sthRowState">не считается</small>' : '');
			tr.insertAdjacentElement('afterend', detail);
			setOpen(k, !!X.open[k]);
		});
		/* Повторный вызов применяет сохранённый порядок уже к компактным строкам; скрытые ячейки переносятся вместе с видимыми. */
		if (window.STHDrag && window.STHDrag.cols) window.STHDrag.cols(table, 'est', function () { Es.render(); });
	}
	function decorate(R) {
		var body = document.getElementById('eBody'), table = body && body.querySelector('table.et');
		if (!table) { toolbar(R, 0); return; }
		var map = {}, visible = 0;
		R.rows.forEach(function (w) { map[key(w)] = w; if (X.sel[key(w)] === undefined) return; });
		Object.keys(X.sel).forEach(function (k) { if (!map[k]) delete X.sel[k]; });
		Object.keys(X.open).forEach(function (k) { if (!map[k]) delete X.open[k]; });
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
			if (h) h.hidden = false; decorate(R); expandable(R, (function () { var m = {}; R.rows.forEach(function (w) { m[key(w)] = w; }); return m; })());
		} catch (e) { console.warn(e); }
		return x;
	};
	var addRow0 = Es.addRow;
	Es.addRow = function () {
		var before = {}; rows().forEach(function (w) { before[key(w)] = true; });
		var x = addRow0.apply(this, arguments), added = rows().filter(function (w) { return w.own && !before[key(w)]; })[0];
		/* Новая своя строка сразу раскрывается: штатный код переводит фокус на её наименование. */
		if (added) { setOpen(key(added), true); focusField(added, 'xn'); }
		return x;
	};
	function need() { var r = selected(); if (!r.length) U.toast('Сначала отметьте строки галочками в первом столбце.'); return r; }
	function canBase(w) { return BM.mb && BM.mb.cur && window.STH && window.STH.pickMaterial && ['panel', 'linear', 'edge', 'fastener', 'profile'].indexOf(w.kind) >= 0 && !w.own && !w.card; }
	/* У каждого типа строки свой числовой код «не считать»; «on/off» подходит только своим строкам. */
	function unitValue(w, on) {
		var c = E.unitChoice(Es.R, w), i;
		if (on) {
			if (w.kind === 'own') return 'on';
			if (w.kind === 'extra') return w.xmode && w.xmode !== 'off' ? w.xmode : 'sum';
			return c.options.length ? c.options[0][0] : 0;
		}
		for (i = 0; i < c.options.length; i++) if (c.options[i][1] === 'не считать') return c.options[i][0];
		return w.kind === 'own' || w.kind === 'extra' ? 'off' : -1;
	}
	X.unitValue = unitValue;
	async function action(a) {
		var R = Es.R; if (!R) return;
		if (a === 'clear') { X.sel = {}; Es.render(); return; }
		var list = need(); if (!list.length) return;
		if (a === 'mat') {
			list = list.filter(canBase);
			if (!list.length) { U.toast('Среди выбранных нет строк, которые можно связать с базой.'); return; }
			if (window.STH.pickMaterial) await window.STH.pickMaterial(list[0], list); return;
		}
		if (a === 'off') {
			var ok = await U.confirm('Массовое действие', 'Исключить из расчёта строк: ' + list.length + '? Их сумма уйдёт из итога и документов. Действие можно отменить через Ctrl+Z.', 'Не считать');
			if (!ok) return;
		}
		window.App.pushUndo(); var pl = Es.pl(), we = Es.we(), changed = 0, saveProject = false;
		if (a === 'on' || a === 'off') {
			list.forEach(function (w) {
				if ((a === 'on' && !w.off) || (a === 'off' && w.off)) return;
				if (w.own || w.manual) saveProject = true;
				E.setUnit(R, w, unitValue(w, a === 'on'), pl, we); changed++;
			});
			if (saveProject) window.App.save();
			Es.saveStore(true);
		} else if (a === 'qty') {
			list.forEach(function (w) { if (!w.qtyKey || !w.manual) return; E.setQty(w, w.calc, we); changed++; });
			window.App.save();
		}
		X.sel = {}; Es.render(); U.toast(changed ? 'Изменено строк: ' + changed + '.' : 'В выбранных строках менять нечего.');
	}
	X.action = action;
	function field(w, cls) {
		var found = null, k = key(w);
		document.querySelectorAll('#est .' + cls).forEach(function (x) { if (x.dataset.k === k) found = x; });
		return found;
	}
	function focusField(w, cls) {
		setOpen(key(w), true);
		var x = field(w, cls); if (!x || x.readOnly || x.disabled) return false;
		x.scrollIntoView({ block: 'nearest' }); x.focus({ preventScroll: true }); if (x.select) x.select(); return true;
	}
	function focusSel(sel) {
		var x = document.querySelector(sel); if (!x || x.disabled) return false;
		x.scrollIntoView({ block: 'nearest' }); x.focus({ preventScroll: true }); if (x.select && x.tagName === 'INPUT') x.select(); return true;
	}
	function clickSel(sel) { var x = document.querySelector(sel); if (!x || x.disabled) return false; x.click(); return true; }
	function setUnit(w, value) {
		var hadQty = w.manual;
		window.App.pushUndo(); E.setUnit(Es.R, w, unitValue(w, value === 'on'), Es.pl(), Es.we());
		if (w.own || hadQty) window.App.save();
		if (!w.own) Es.saveStore(true);
		Es.render();
	}
	function rowActs(w) {
		var acts = [], title = String(w.title || w.label || 'Строка сметы');
		if (title.length > 56) title = title.slice(0, 55) + '…';
		acts.push([title, function () { }, w.sum > 0 ? E.money(w.sum) + ' р.' : '', true]);
		acts.push([X.sel[key(w)] ? 'Снять выделение строки' : 'Выбрать строку для массовых действий', function () { X.sel[key(w)] = !X.sel[key(w)]; Es.render(); }]);
		acts.push(null);
		if (w.card) acts.push(['Открыть карточку: всё редактирование', function () { Es.ownCard(w); }]);
		else {
			if (field(w, 'xn') || field(w, 'nv')) acts.push(['Изменить наименование', function () { focusField(w, w.own && !w.card ? 'xn' : 'nv'); }]);
			if (field(w, 'av')) acts.push(['Изменить артикул', function () { focusField(w, 'av'); }]);
		}
		if (field(w, 'uv')) {
			acts.push([w.off ? 'Считать строку' : 'Не считать строку', function () { setUnit(w, w.off ? 'on' : 'off'); }]);
			acts.push(['Другой режим «Считать»', function () { focusField(w, 'uv'); }]);
		}
		if (field(w, 'qv')) acts.push(['Изменить количество', function () { focusField(w, 'qv'); }]);
		if (w.manual && w.qtyKey) acts.push(['Вернуть количество по модели', function () { window.App.pushUndo(); E.resetQty(w, Es.we()); window.App.save(); Es.render(); }]);
		if (field(w, 'pv')) acts.push(['Изменить цену', function () { focusField(w, 'pv'); }]);
		if (canBase(w)) acts.push([w.sthReplace ? 'Изменить замену или вернуть строку модели…' : 'Сопоставить или заменить материалом базы…', function () { window.STH.pickMaterial(w, [w]).catch(U.error); }]);
		if (w.own && !w.card && field(w, 'sv')) acts.push(['Изменить поставщика', function () { focusField(w, 'sv'); }]);
		else if (w.skey) acts.push(['Поставщик, ссылка и фото…', function () { w.card ? Es.ownCard(w) : Es.supEdit(w); }]);
		if (w.sup && w.sup.url) acts.push(['Открыть ссылку поставщика', function () { U.api.openUrl(w.sup.url).catch(U.error); }]);
		if (w.parts || (Es.dups || {})[w.offKey] || w.own) acts.push(null);
		if (w.parts) {
			acts.push(['⧉ Разъединить (' + w.parts.length + ' ' + E.plural(w.parts.length, 'позиция', 'позиции', 'позиций') + ')', function () { E.unmerge(w, Es.pl()); Es.lastMerge = null; Es.saveStore(); Es.render(); }]);
			w.parts.forEach(function (p) { acts.push(['— ' + E.num(p.val) + ' ' + E.shortUnit(p.unit) + ' из «' + p.name + '»', function () { }, '', true]); });
		}
		if ((Es.dups || {})[w.offKey]) acts.push(['Объединить с такой же…', function () { S().mergeAsk = key(w); Es.render(); }]);
		if (w.own) acts.push(['Удалить свою строку', function () { var b = field(w, 'del'); if (b) b.click(); }]);
		return acts;
	}
	/* Одно полное меню строки, включая объединение и разъединение. */
	X.contextMenu = function (e, tr, w) {
		if (!w || e.target.closest('input, textarea')) return false;
		e.preventDefault(); U.menu(e.clientX, e.clientY, rowActs(w)); return true;
	};
	function selectVisible() {
		var boxes = document.querySelectorAll('#eBody tr[data-se-visible="1"] .seRow');
		if (boxes.length) boxes.forEach(function (c) { X.sel[c.dataset.k] = true; });
		else if (Es.R) Es.R.rows.forEach(function (w) { if (C.match(w, filter(), info(w))) X.sel[key(w)] = true; });
		Es.render();
	}
	function massActs() {
		var n = selected().length, suffix = n ? ' (' + n + ')' : '';
		return [
			['Выбрать все показанные строки', selectVisible],
			['Считать выбранные' + suffix, function () { action('on').catch(U.error); }, '', !n],
			['Не считать выбранные' + suffix, function () { action('off').catch(U.error); }, '', !n],
			['Количество по модели у выбранных' + suffix, function () { action('qty').catch(U.error); }, '', !n],
			['Материал из базы для выбранных…' + suffix, function () { action('mat').catch(U.error); }, '', !n],
			['Снять выделение', function () { action('clear').catch(U.error); }, '', !n]
		];
	}
	function commonActs(head) {
		var acts = [];
		if (head && head !== '-') acts.push(['＋ Своя строка в этот раздел…', function () { Es.addRow(head, ''); }]);
		else acts.push(['＋ Своя строка в «Прочее»…', function () { Es.addRow(); }]);
		acts.push(null); acts.push(['Массовые действия', function () { }, '', true]);
		acts = acts.concat(massActs());
		acts.push(null); acts.push(['Фильтр строк', function () { }, '', true]);
		C.FILTERS.forEach(function (f) { acts.push([(filter() === f[0] ? '✓ ' : '') + f[1], function () { S().set.sthEstFilter = f[0]; window.App.saveSettings(); Es.render(); }]); });
		acts.push(null); acts.push(['Расчёт и прайс', function () { }, '', true]);
		acts.push(['Прайс: ' + Es.pl().name, function () { focusSel('#ePl'); }]);
		acts.push(['Управление прайсами…', function () { window.Dlg.settings('eLists'); }]);
		acts.push(['Загрузить цены из скрипта СМЕТА…', function () { Es.importScript().catch(U.error); }]);
		[['showCuts', 'пазы'], ['showHoles', 'отверстия'], ['showFast', 'фурнитура'], ['showProf', 'профили']].forEach(function (x) {
			var q = document.querySelector('[data-f="' + x[0] + '"]'); if (q) acts.push([(q.checked ? '✓ Считать: ' : 'Считать: ') + x[1], function () { clickSel('[data-f="' + x[0] + '"]'); }]);
		});
		if (document.getElementById('eQClear')) acts.push(['Сбросить все количества по модели', function () { clickSel('#eQClear'); }]);
		if (document.getElementById('eWriteOff')) acts.push(['Списать материалы по заказу…', function () { K.writeOff().catch(U.error); }]);
		acts.push(null); acts.push(['Итог и заказчик', function () { }, '', true]);
		acts.push(['Изменить скидку', function () { focusSel('#eDisc'); }]);
		acts.push(['Наценка: материал', function () { focusSel('.eMk[data-g="M"]'); }]);
		acts.push(['Наценка: работы', function () { focusSel('.eMk[data-g="W"]'); }]);
		acts.push(['Наценка: фурнитура', function () { focusSel('.eMk[data-g="F"]'); }]);
		acts.push(['Изменить заказчика', function () { focusSel('#eClient'); }]);
		if (S().facKey) {
			acts.push(null); acts.push(['Петли на фасаде', function () { }, '', true]);
			[['', 'авто'], ['left', 'слева'], ['right', 'справа']].forEach(function (x) { acts.push(['Петли: ' + x[1], function () { clickSel('[data-fside="' + x[0] + '"]'); }]); });
		}
		if (S().estRow || S().facKey) acts.push(['Закрыть карточку справа', function () { S().estRow = ''; S().facKey = ''; Es.render(); }]);
		acts.push(null); acts.push(['Документы — PDF и Excel', function () { }, '', true]);
		BM.out.EST_KINDS.forEach(function (k) { acts.push([k[1], function () { window.Dlg.estDoc(k[0]); }]); });
		return acts;
	}
	document.addEventListener('contextmenu', function (e) {
		if (e.defaultPrevented || !e.target.closest || !e.target.closest('#est') || e.target.closest('input, textarea')) return;
		var tr = e.target.closest('#eBody table.et tr[data-k]');
		if (tr) {
			var row = Es.R && Es.R.rows.filter(function (w) { return key(w) === tr.dataset.k; })[0];
			/* STHGroup: перехват до штатного меню — открывается одно полное меню, исходный обработчик сохранён как резерв. */
			if (row && X.contextMenu(e, tr, row)) e.stopPropagation();
			return;
		}
		var paperRow = e.target.closest('#eBody.paper [data-row]'), w = paperRow && Es.R ? Es.R.rows[Number(paperRow.dataset.row)] : null;
		e.preventDefault();
		if (w) { S().estRow = key(w); S().facKey = ''; Es.render(); U.menu(e.clientX, e.clientY, rowActs(w)); return; }
		var sec = e.target.closest('.eSecB'), hdr = e.target.closest('tr[data-h]'), head = sec ? sec.dataset.h : (hdr ? hdr.dataset.h : '');
		U.menu(e.clientX, e.clientY, commonActs(head));
	}, true);
	document.addEventListener('click', function (e) {
		var expand = e.target.closest && e.target.closest('[data-seexpand]');
		if (expand) {
			e.preventDefault(); e.stopPropagation();
			setOpen(expand.dataset.seexpand, !X.open[expand.dataset.seexpand]); return;
		}
		var more = e.target.closest && e.target.closest('[data-semenu]');
		if (more) {
			e.preventDefault(); e.stopPropagation();
			var w = rows().filter(function (x) { return key(x) === more.dataset.semenu; })[0];
			if (w) { var r = more.getBoundingClientRect(); U.menu(r.left, r.bottom + 3, rowActs(w)); } return;
		}
		var tools = e.target.closest && e.target.closest('[data-setools]');
		if (tools) {
			e.preventDefault(); X.toolsOpen = !X.toolsOpen;
			var panel = document.querySelector('#sthEstTools .sthEstPanels'); if (panel) panel.hidden = !X.toolsOpen;
			tools.setAttribute('aria-expanded', X.toolsOpen ? 'true' : 'false'); return;
		}
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
