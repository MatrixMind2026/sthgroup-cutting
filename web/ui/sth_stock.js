/* STHGroup — раздел «Склад» (вариант «А»: вкладки и таблица). Данные — склад базы материалов (core/sth_stock.js поверх core/matbase.js):
   приход и расход, резерв под заказ, ячейка, деловые обрезки, движения. Перед каждой правкой база перечитывается, после — записывается. */
(function () {
	'use strict';
	var U = window.UI, esc = U.esc, MB = BM.mb, SK = BM.stock;
	var X = window.STHStock = { tab: 'sheet', q: '', all: false, sel: '' };
	function S() { return window.App.S; }
	function $(id) { return document.getElementById(id); }
	function base() { return MB.cur ? SK.fix(MB.cur) : null; }
	function n(v) { return String(Math.round((v || 0) * 1000) / 1000).replace('.', ','); }
	function ruDate(d) { return String(d || '').split('-').reverse().join('.'); }
	/* правка склада: свежая база → изменение → запись */
	async function edit(fn) {
		var K = window.MatBase;
		await K.refresh();
		var b = base(); if (!b) { U.toast('Базы материалов нет: «Настройки → Общие → Папки и файлы».'); return false; }
		var r = fn(b);
		if (r === false) return false;
		await K.saveBase();
		X.render();
		return r;
	}
	/* заказы для выбора: открытые (не закрытые и не отгруженные) — сначала */
	async function orders() {
		var O = BM.sth, H = window.STHO; if (!H) return [];
		var bk = await H.load(); if (!bk) return [];
		return bk.orders.slice().sort(function (a, c) { var x = /shipped|closed/.test(a.status) ? 1 : 0, y = /shipped|closed/.test(c.status) ? 1 : 0; return x - y || String(c.date).localeCompare(String(a.date)); })
			.map(function (o) { var cl = O.client(bk, o.clientId); return { id: o.id, no: o.no, title: o.no + (cl ? ' · ' + cl.name : '') + ' · ' + O.statusName(o.status, bk) }; });
	}
	function orderOpts(list, cur, none) { return (none ? '<option value="">' + esc(none) + '</option>' : '') + list.map(function (o) { return '<option value="' + esc(o.id) + '"' + (o.id === cur ? ' selected' : '') + '>' + esc(o.title) + '</option>'; }).join(''); }
	function matOpts(b, tab) {
		return Object.keys(b.mats).filter(function (id) { return SK.tabOf(b, b.mats[id]) === tab; }).map(function (id) { return b.mats[id]; })
			.sort(function (x, y) { return x.name.localeCompare(y.name, 'ru'); }).map(function (m) { return '<option value="' + esc(m.name + (m.art ? ' · ' + m.art : '')) + '">'; }).join('');
	}
	function matBy(b, v) {
		v = String(v || '').trim(); if (!v) return null;
		for (var id in b.mats) if (Object.prototype.hasOwnProperty.call(b.mats, id)) { var m = b.mats[id]; if (m.name + (m.art ? ' · ' + m.art : '') === v || m.name === v) return m; }
		return null;
	}
	function matLabel(m) { return m ? m.name + (m.art ? ' · ' + m.art : '') : ''; }

	/* -------------------------------- окно ---------------------------------- */
	X.render = function () {
		var host = $('stock'); if (!host) return;
		var b = base(), tab = X.tab;
		var tabs = SK.TABS.map(function (t) { return '<button data-skt="' + t[0] + '"' + (t[0] === tab ? ' class="on"' : '') + '>' + t[1] + '</button>'; }).join('');
		var btns = (tab === 'moves' || tab === 'history') ? '' : tab === 'off' ? '<button id="skOffAdd">＋ Обрезок</button>' : '<button id="skIn">＋ Приход</button><button id="skOut">－ Расход</button><button id="skRes">Резерв…</button>';
		var bar = '<div class="skBar"><span class="mseg">' + tabs + '</span><div class="grow"></div>' + btns +
			(tab === 'sheet' || tab === 'lin' || tab === 'fit' ? '<label class="mute sm"><input type="checkbox" id="skAll"' + (X.all ? ' checked' : '') + '> все из базы</label>' : '') +
			'<input type="search" id="skQ" placeholder="Поиск: название, артикул, ячейка" value="' + esc(X.q) + '"></div>';
		if (!b) { host.innerHTML = bar + '<div class="skEmpty">Склад хранится в базе материалов. Базы нет — выберите файл в «Настройки → Общие → Папки и файлы».</div>'; return; }
		host.innerHTML = bar + '<div class="skBody">' + (tab === 'moves' ? movesHtml(b) : tab === 'history' ? historyHtml(b) : tab === 'off' ? offHtml(b) : matsHtml(b)) + '</div>';
		var q = $('skQ'); if (q && X.focusQ) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); X.focusQ = false; }
	};
	function matsHtml(b) {
		var rows = SK.rows(b, X.tab, X.q, X.all);
		if (!rows.length) return '<div class="skEmpty">' + (X.q ? 'Ничего не найдено.' : 'На складе пусто. Добавьте первый приход или загрузите остатки из файла.') + '<div class="skEmptyActions"><button id="skEmptyIn" class="primary">Добавить приход</button><button id="skImport">Импортировать остатки</button></div></div>';
		return '<table class="grid skT"><thead><tr><th>Материал</th><th>Ед.</th><th class="r">Есть</th><th class="r">Резерв</th><th class="r">Свободно</th><th>Ячейка</th><th>Под заказ</th></tr></thead><tbody>' +
			rows.map(function (r) {
				return '<tr data-mat="' + esc(r.m.id) + '"' + (r.m.id === X.sel ? ' class="on"' : '') + '><td class="name">' + esc(r.m.name) + (r.m.art ? ' <span class="mute">' + esc(r.m.art) + '</span>' : '') + '</td><td>' + esc(r.unit) + '</td>' +
					'<td class="r">' + n(r.bal) + '</td><td class="r">' + (r.res ? n(r.res) : '') + '</td><td class="r ' + (r.free < 0 ? 'neg' : r.free > 0 ? 'pos' : '') + '">' + n(r.free) + (r.free < 0 ? ' докупить' : '') + '</td>' +
					'<td><input class="skCell" data-cell="' + esc(r.m.id) + '" value="' + esc(r.cell) + '" placeholder="—"></td><td class="mute">' + esc(r.orders.map(function (x) { return '№ ' + x; }).join(', ')) + '</td></tr>';
			}).join('') + '</tbody></table>';
	}
	function offPic(o) {
		var k = 60 / Math.max(o.L, 1), w = Math.max(4, Math.round(o.L * k)), h = Math.max(3, Math.round(o.W * k));
		return '<svg width="64" height="' + (h + 4) + '"><rect x="2" y="2" width="' + w + '" height="' + h + '" class="skOffR' + (o.res ? ' res' : '') + '"/></svg>';
	}
	function offHtml(b) {
		var list = SK.offRows(b, X.q);
		if (!list.length) return '<div class="skEmpty">' + (X.q ? 'Ничего не найдено.' : 'Обрезков нет. «＋ Обрезок» — записать кусок вручную; после раскроя крупные остатки попадают сюда сами («Списать по заказу» в смете).') + '</div>';
		return '<table class="grid skT"><thead><tr><th></th><th>Материал</th><th class="r">Размер, мм</th><th class="r">Шт</th><th>Откуда</th><th>Дата</th><th>Резерв</th><th></th></tr></thead><tbody>' +
			list.map(function (o) {
				var m = b.mats[o.mat];
				return '<tr><td>' + offPic(o) + '</td><td class="name">' + esc(m.name) + '</td><td class="r">' + o.L + '×' + o.W + '</td><td class="r">' + o.n + '</td><td class="mute">' + esc(o.project || 'вручную') + '</td><td class="mute">' + esc(ruDate(o.date)) + '</td>' +
					'<td>' + (o.res ? '<span class="skTag">№ ' + esc(o.resNo || '') + '</span>' : '') + '</td>' +
					'<td class="skAct"><button data-ores="' + esc(o.id) + '">' + (o.res ? 'Снять резерв' : 'Под заказ…') + '</button><button data-ouse="' + esc(o.id) + '" title="Кусок взят в работу — убрать со склада">Взят</button><button class="icon" data-odel="' + esc(o.id) + '" title="Удалить (выбросили)">✕</button></td></tr>';
			}).join('') + '</tbody></table>';
	}
	function movesHtml(b) {
		var list = SK.moves(b, X.q);
		if (!list.length) return '<div class="skEmpty">Движений нет.</div>';
		return '<table class="grid skT"><thead><tr><th>Дата</th><th>Документ</th><th>Материалы</th><th>Заказ / поставщик</th><th>Примечание</th><th></th></tr></thead><tbody>' +
			list.map(function (d) {
				var sp = MB.supplier(b, d.sup), mats = d.lines.map(function (l) { var m = b.mats[l.mat]; return esc(m ? m.name : '?') + ' — ' + n(l.qty) + ' ' + esc(m ? m.unit : ''); }).join('<br>');
				return '<tr class="' + (d.off ? 'off' : '') + '"><td>' + esc(ruDate(d.date)) + '</td><td>' + SK.KIND[d.kind] + ' № ' + esc(d.no) + (d.off ? ' <span class="mute">(отменён)</span>' : '') + '</td><td>' + mats + '</td><td>' + esc(sp ? sp.name : d.project) + '</td><td class="mute">' + esc(d.note) + '</td>' +
					'<td>' + (d.off ? '' : '<button data-dx="' + esc(d.id) + '">Отменить</button>') + '</td></tr>';
			}).join('') + '</tbody></table>';
	}
	function historyHtml(b) {
		var list = SK.history(b, X.q, X.historyType || 'all');
		var head = '<div class="skHistoryFilters"><b>Что произошло с материалами и складом</b><div class="grow"></div><select id="skHistoryType"><option value="all">Все события</option><option value="stock">Только склад</option><option value="replace">Замены и сопоставления</option></select></div>';
		if (!list.length) return head + '<div class="skEmpty">История пока пуста. Сюда попадут приходы, расходы, резервы, замены и сопоставления.</div>';
		var TYPE = { replace: 'Замена', restore: 'Возврат строки', link: 'Сопоставление', unlink: 'Связь снята', stock: 'Склад' };
		return head + '<div class="skHistory">' + list.slice(0, 300).map(function (h) {
			var title = h.title || TYPE[h.type] || 'Действие', details = h.details || (h.type === 'replace' || h.type === 'link' ? '«' + (h.from || '') + '» → «' + (h.to || '') + '»' : h.type === 'restore' ? 'Возвращено «' + (h.from || '') + '»' : h.type === 'unlink' ? 'Сопоставление снято: «' + (h.from || '') + '»' : '');
			return '<div class="skHistoryItem"><time class="mute">' + esc(ruDate(String(h.at || '').slice(0, 10))) + (String(h.at || '').length > 10 ? ' ' + esc(String(h.at).slice(11, 16)) : '') + '</time><b>' + esc(TYPE[h.type] || title) + '</b><div><b>' + esc(title) + '</b><div>' + esc(details) + '</div>' + (h.project ? '<div class="mute">' + esc(h.project) + '</div>' : '') + '</div></div>';
		}).join('') + '</div>';
	}

	/* ------------------------------- окна ------------------------------------ */
	async function moveDlg(kind) {
		await window.MatBase.refresh();
		var b = base(); if (!b) { X.render(); return; }
		var ol = await orders(), m0 = b.mats[X.sel], tab = X.tab;
		var res = await U.modal({ title: kind === 'in' ? 'Приход на склад' : 'Расход со склада', width: 620, cls: 'skDlg',
			body: '<label class="fld wide">Материал <input id="skM" list="skML" value="' + esc(matLabel(m0 && SK.tabOf(b, m0) === tab ? m0 : null)) + '" placeholder="начните печатать название или артикул"></label><datalist id="skML">' + matOpts(b, tab) + '</datalist>' +
				'<div class="row"><label class="fld">Количество <input id="skN" value="1" style="width:110px"></label><span class="mute" id="skU"></span>' +
				(kind === 'in' ? '<label class="fld">Цена за ед., ₽ <input id="skP" style="width:110px" placeholder="необязательно"></label>' : '') + '</div>' +
				'<label class="fld wide">' + (kind === 'in' ? 'Под заказ (резерв)' : 'По заказу') + ' <select id="skO">' + orderOpts(ol, '', kind === 'in' ? 'не резервировать' : 'без заказа') + '</select></label>' +
				'<label class="fld wide">Примечание <input id="skNote"></label>',
			buttons: [{ label: 'Отмена', value: null }, { label: kind === 'in' ? 'Принять' : 'Списать', primary: true, run: function (el) {
				var m = matBy(base(), el.querySelector('#skM').value), q = el.querySelector('#skN').value;
				if (!m) { U.toast('Выберите материал из списка базы.'); return false; }
				if (!(Number(String(q).replace(',', '.')) > 0)) { U.toast('Укажите количество больше нуля.'); return false; }
				return { mat: m.id, qty: q, price: el.querySelector('#skP') ? el.querySelector('#skP').value : 0, order: el.querySelector('#skO').value, note: el.querySelector('#skNote').value };
			} }],
			onOpen: function (el) { var f = function () { var m = matBy(base(), el.querySelector('#skM').value); el.querySelector('#skU').textContent = m ? m.unit + ' · есть ' + n(MB.balance(base(), m.id)) : ''; }; el.querySelector('#skM').addEventListener('input', f); f(); el.querySelector(m0 ? '#skN' : '#skM').focus(); } });
		if (!res) return;
		var ord = ol.filter(function (o) { return o.id === res.order; })[0] || null;
		await edit(function (bb) {
			var d = SK.move(bb, kind, res.mat, res.qty, { price: res.price, note: res.note, order: kind === 'out' ? ord : null });
			if (!d) { U.toast('Не записано.'); return false; }
			if (kind === 'in' && ord) { var had = SK.resOf(bb, res.mat).filter(function (r) { return r.order === ord.id; })[0]; SK.reserve(bb, res.mat, (had ? had.qty : 0) + Number(String(res.qty).replace(',', '.')), ord); }
			X.sel = res.mat;
			U.toast((kind === 'in' ? 'Принято: ' : 'Списано: ') + bb.mats[res.mat].name + ' — ' + n(d.lines[0].qty) + ' ' + bb.mats[res.mat].unit + (ord ? (kind === 'in' ? ', в резерв № ' : ', заказ № ') + ord.no : ''));
		});
	}
	async function resDlg() {
		await window.MatBase.refresh();
		var b = base(); if (!b) return;
		var m = b.mats[X.sel]; if (!m) { U.toast('Выберите строку материала в таблице.'); return; }
		var ol = await orders(); if (!ol.length) { U.toast('Заказов нет — резервировать не под что.'); return; }
		var list = SK.resOf(b, m.id).map(function (r) { return '<tr><td>№ ' + esc(r.no) + '</td><td class="r">' + n(r.qty) + ' ' + esc(m.unit) + '</td><td>' + esc(ruDate(r.date)) + '</td><td><button data-unres="' + esc(r.id) + '">Снять</button></td></tr>'; }).join('');
		var res = await U.modal({ title: 'Резерв: ' + m.name, width: 560, cls: 'skDlg',
			body: '<p class="mute">Есть ' + n(MB.balance(b, m.id)) + ' ' + esc(m.unit) + ', в резерве ' + n(SK.reserved(b, m.id)) + '. Зарезервированное другим заказам не видно как свободное.</p>' +
				(list ? '<table class="grid" style="width:100%;margin-bottom:8px"><tbody>' + list + '</tbody></table>' : '') +
				'<div class="row"><label class="fld">Заказ <select id="skO">' + orderOpts(ol, '') + '</select></label><label class="fld">Количество <input id="skN" value="1" style="width:100px"></label></div>',
			buttons: [{ label: 'Закрыть', value: null }, { label: 'Зарезервировать', primary: true, run: function (el) { return { order: el.querySelector('#skO').value, qty: el.querySelector('#skN').value }; } }],
			onOpen: function (el) { el.addEventListener('click', function (e) { var bt = e.target.closest('[data-unres]'); if (!bt) return; var id = bt.dataset.unres; edit(function (bb) { return SK.unreserve(bb, id); }); bt.closest('tr').remove(); }); } });
		if (!res) return;
		var ord = ol.filter(function (o) { return o.id === res.order; })[0];
		await edit(function (bb) { var had = SK.resOf(bb, m.id).filter(function (r) { return r.order === ord.id; })[0]; SK.reserve(bb, m.id, (had ? had.qty : 0) + Number(String(res.qty).replace(',', '.')), ord); });
	}
	async function offDlg() {
		await window.MatBase.refresh();
		var b = base(); if (!b) return;
		var res = await U.modal({ title: 'Обрезок на склад', width: 560, cls: 'skDlg',
			body: '<label class="fld wide">Материал <input id="skM" list="skML" placeholder="начните печатать название"></label><datalist id="skML">' + matOpts(b, 'sheet') + '</datalist>' +
				'<div class="row"><label class="fld">Длина, мм <input id="skL" style="width:100px"></label><label class="fld">Ширина, мм <input id="skW" style="width:100px"></label><label class="fld">Шт <input id="skN" value="1" style="width:60px"></label></div>',
			buttons: [{ label: 'Отмена', value: null }, { label: 'Записать', primary: true, run: function (el) {
				var m = matBy(base(), el.querySelector('#skM').value); if (!m) { U.toast('Выберите материал из списка базы.'); return false; }
				var L = Number(el.querySelector('#skL').value), W = Number(el.querySelector('#skW').value); if (!(L > 0 && W > 0)) { U.toast('Укажите длину и ширину в миллиметрах.'); return false; }
				return { mat: m.id, L: L, W: W, n: el.querySelector('#skN').value };
			} }], onOpen: function (el) { el.querySelector('#skM').focus(); } });
		if (!res) return;
		await edit(function (bb) { return !!MB.addOffcut(bb, res.mat, res.L, res.W, res.n, { project: '' }); });
	}
	async function offRes(id) {
		var b = base(), o = b && b.stock.offcuts.filter(function (x) { return x.id === id; })[0]; if (!o) return;
		if (o.res) { await edit(function (bb) { return SK.reserveOff(bb, id, null); }); return; }
		var ol = await orders(); if (!ol.length) { U.toast('Заказов нет.'); return; }
		var v = await U.modal({ title: 'Обрезок под заказ', width: 460, body: '<label class="fld wide">Заказ <select id="skO">' + orderOpts(ol, '') + '</select></label>',
			buttons: [{ label: 'Отмена', value: null }, { label: 'Зарезервировать', primary: true, run: function (el) { return el.querySelector('#skO').value; } }] });
		if (!v) return;
		var ord = ol.filter(function (o2) { return o2.id === v; })[0];
		await edit(function (bb) { return SK.reserveOff(bb, id, ord); });
	}

	async function importStock() {
		await window.MatBase.refresh(); var b = base(); if (!b) return;
		var path = await U.pick({ kind: 'open', title: 'Остатки склада: CSV или JSON', filters: [{ name: 'Таблица остатков', ext: ['csv', 'json', 'txt'] }] }); if (!path) return;
		var text = await U.api.readAnyText(path), raw = [];
		if (/\.json$/i.test(path) || /^\s*[\[{]/.test(text)) {
			var j = JSON.parse(text); raw = Array.isArray(j) ? j : (j.rows || j.items || []);
		} else {
			var lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(function (x) { return x.trim(); }); if (!lines.length) return;
			var delim = (lines[0].split(';').length >= lines[0].split('\t').length && lines[0].indexOf(';') >= 0) ? ';' : (lines[0].indexOf('\t') >= 0 ? '\t' : ',');
			var heads = lines[0].split(delim).map(function (x) { return x.trim().toLowerCase(); });
			lines.slice(1).forEach(function (line) { var v = line.split(delim), r = {}; heads.forEach(function (h, i) { r[h] = (v[i] || '').trim(); }); raw.push(r); });
		}
		function field(r, names) { for (var k in r) { var lk = String(k).toLowerCase().replace(/ё/g, 'е'); if (names.indexOf(lk) >= 0) return r[k]; } return ''; }
		var good = [], skipped = [];
		raw.forEach(function (r, i) {
			var name = String(field(r, ['материал', 'название', 'наименование', 'name', 'material']) || '').trim(), art = String(field(r, ['артикул', 'art', 'sku']) || '').trim();
			var qty = Number(String(field(r, ['количество', 'остаток', 'qty', 'quantity']) || '').replace(',', '.').replace(/\s/g, ''));
			var m = matBy(b, name) || matBy(b, name + (art ? ' · ' + art : ''));
			if (!m && art) Object.keys(b.mats).some(function (id) { if (String(b.mats[id].art || '') === art) { m = b.mats[id]; return true; } return false; });
			if (!m || !(qty > 0)) { skipped.push('строка ' + (i + 1) + (name ? ': ' + name : '')); return; }
			good.push({ mat: m.id, name: m.name, qty: qty, price: Number(String(field(r, ['цена', 'price']) || '').replace(',', '.').replace(/\s/g, '')) || 0, cell: String(field(r, ['ячейка', 'cell']) || '').trim() });
		});
		if (!good.length) { U.toast('Не найдено ни одной строки с материалом из базы и количеством больше нуля.', { bad: true }); return; }
		var ok = await U.modal({ title: 'Импорт остатков', width: 680, cls: 'skDlg',
			body: '<p>Будет создан <b>один приход</b>: позиций — ' + good.length + '. Существующие остатки не стираются, импортированные количества прибавятся к ним.</p>' +
				'<div style="max-height:45vh;overflow:auto"><table class="grid" style="width:100%"><tbody>' + good.map(function (r) { return '<tr><td>' + esc(r.name) + '</td><td class="r">' + n(r.qty) + ' ' + esc(b.mats[r.mat].unit) + '</td><td>' + esc(r.cell) + '</td></tr>'; }).join('') + '</tbody></table></div>' + (skipped.length ? '<p class="warn">Пропущено строк: ' + skipped.length + ' — материал не найден или количество не указано.</p>' : ''),
			buttons: [{ label: 'Отмена', value: false }, { label: 'Импортировать', primary: true, value: true }] });
		if (!ok) return;
		await edit(function (bb) {
			var d = MB.addDoc(bb, { kind: 'in', note: 'Импорт остатков: ' + U.baseOf(path), lines: good.map(function (r) { return { mat: r.mat, qty: r.qty, price: r.price }; }) });
			good.forEach(function (r) { if (r.cell) bb.stock.cells[r.mat] = r.cell; });
			SK.log(bb, 'stock', 'Остатки импортированы', 'Позиций: ' + good.length + ' · ' + U.baseOf(path), { doc: d && d.id });
			X.tab = 'sheet'; X.all = true;
			U.toast('Остатки импортированы: ' + good.length + ' поз.' + (skipped.length ? ', пропущено: ' + skipped.length : ''));
		});
	}

	/* ------------------------------ события ---------------------------------- */
	X.init = function () {
		var host = $('stock'); if (!host || host._on) return; host._on = true;
		host.addEventListener('click', function (e) {
			var t = e.target, bt;
			if ((bt = t.closest('[data-skt]'))) { X.tab = bt.dataset.skt; X.render(); return; }
			if (t.closest('#skIn') || t.closest('#skEmptyIn')) { moveDlg('in').catch(U.error); return; }
			if (t.closest('#skImport')) { importStock().catch(U.error); return; }
			if (t.closest('#skOut')) { moveDlg('out').catch(U.error); return; }
			if (t.closest('#skRes')) { resDlg().catch(U.error); return; }
			if (t.closest('#skOffAdd')) { offDlg().catch(U.error); return; }
			if ((bt = t.closest('[data-ores]'))) { offRes(bt.dataset.ores).catch(U.error); return; }
			if ((bt = t.closest('[data-ouse]'))) { var id = bt.dataset.ouse; edit(function (b) { return MB.useOffcut(b, id, 'взят со склада'); }).catch(U.error); return; }
			if ((bt = t.closest('[data-odel]'))) { var id2 = bt.dataset.odel; U.confirm('Обрезок', 'Удалить обрезок со склада?', 'Удалить').then(function (ok) { if (ok) edit(function (b) { return SK.dropOff(b, id2); }); }); return; }
			if ((bt = t.closest('[data-dx]'))) { var id3 = bt.dataset.dx; U.confirm('Движение', 'Отменить документ? Остатки пересчитаются.', 'Отменить документ').then(function (ok) { if (ok) edit(function (b) { return MB.cancelDoc(b, id3); }); }); return; }
			var tr = t.closest('tr[data-mat]'); if (tr && !t.closest('input')) { X.sel = tr.dataset.mat; host.querySelectorAll('tr[data-mat]').forEach(function (r) { r.classList.toggle('on', r === tr); }); }
		});
		host.addEventListener('dblclick', function (e) { var tr = e.target.closest('tr[data-mat]'); if (tr && !e.target.closest('input')) { X.sel = tr.dataset.mat; moveDlg('in').catch(U.error); } });
		host.addEventListener('input', function (e) { if (e.target.id === 'skQ') { X.q = e.target.value; X.focusQ = true; X.render(); } });
		host.addEventListener('change', function (e) {
			var t = e.target;
			if (t.id === 'skAll') { X.all = t.checked; X.render(); return; }
			if (t.id === 'skHistoryType') { X.historyType = t.value; X.render(); return; }
			if (t.dataset.cell) { var id = t.dataset.cell, v = t.value; edit(function (b) { SK.setCell(b, id, v); }).catch(U.error); }
		});
		window.addEventListener('focus', function () { var s = S(); if (s && s.section === 'stock') window.MatBase.refresh().then(X.render); });
	};
	X.show = function () { X.init(); window.MatBase.refresh().then(X.render).catch(U.error); X.render(); };
})();

/* шаг 2: склад в смете — в строке материала из базы «склад: есть N, свободно M» или «докупить X»;
   у дробного листа — подходящий свободный обрезок со склада */
(function () {
	'use strict';
	var Es = window.Est, MB = BM.mb, SK = BM.stock;
	if (!Es || !Es.build || !SK) return;
	function n(v) { return String(Math.round((v || 0) * 1000) / 1000).replace('.', ','); }
	var b0 = Es.build;
	Es.build = function () {
		var R = b0.apply(this, arguments), b = MB.cur, K = window.MatBase;
		if (!R || !b || !K) return R;
		try {
			SK.fix(b);
			R.rows.forEach(function (w) {
				if (!w.mb || !b.mats[w.mb.id] || w.off || w.info) return;
				var m = b.mats[w.mb.id], bal = MB.balance(b, m.id), res = SK.reserved(b, m.id), free = Math.round((bal - res) * 1e6) / 1e6, add = [];
				if (bal || res) {
					var same = K.unitOf(m.unit) === K.unitOf(w.unit), need = w.val > 0 ? w.val : 0;
					var t = 'склад: есть ' + n(bal) + (res ? ', свободно ' + n(free) : '') + (same ? '' : ' ' + m.unit);
					if (same && need > free) t += ' — докупить ' + n(Math.max(0, need - Math.max(0, free)));
					add.push(t);
					w.stockFree = free;
				}
				if (w.part) {
					var oc = SK.findOff(b, m.id, w.part.L, w.part.W)[0];
					if (oc) { var cell = b.stock.cells[m.id]; add.push('на складе обрезок ' + oc.L + '×' + oc.W + (cell ? ', ячейка ' + cell : '')); w.stockOff = oc.id; }
				}
				if (add.length) w.note = (w.note ? w.note + ' · ' : '') + add.join(' · ');
			});
		} catch (e) { console.warn(e); }
		return R;
	};
})();

/* шаг 3: заказ ↔ склад. «Списать по заказу…» (и сам при статусе «В работе»): листы раскроя и строки смет всех изделий заказа,
   деловые обрезки раскроя — на склад, взятые со склада обрезки — «взяты», резерв заказа снимается.
   «Приход по заказу…»: что нужно заказу минус свободное на складе — принять одной накладной и сразу в резерв заказа.
   шаг 4: в «Раскрое» у материала — «Со склада…»: свободные обрезки склада в остатки раскроя (идут в раскрой первыми). */
(function () {
	'use strict';
	var U = window.UI, esc = U.esc, MB = BM.mb, SK = BM.stock, P = BM.project, E = BM.est, X = window.STHStock;
	if (!X) return;
	function S() { return window.App.S; }
	function n(v) { return String(Math.round((v || 0) * 1000) / 1000).replace('.', ','); }
	function key(o) { return 'Заказ ' + o.no; }
	/* материал раскроя → материал базы: сначала связь из сметы («Сопоставить с базой»), потом по названию */
	function infoOfMat(m) {
		var K = window.MatBase, b = MB.cur; if (!b) return null;
		var w = { kind: 'panel', name0: m.name, skey: m.name, title: P.matTitle(m) };
		return (K.rowInfo && K.rowInfo(w)) || MB.infoFor(b, m.name, '');
	}
	X.infoOfMat = infoOfMat;
	/* «что уходит на заказ» (кнопка «Списать по заказу» в смете и склад): листы — с учётом связей сметы */
	var K0 = window.MatBase;
	if (K0 && K0.need) K0.need = function (st, R) {
		var b = MB.cur, need = [], offcuts = [], miss = [], seen = {};
		st.mats.forEach(function (m) {
			var lay = st.work.layout[m.key], inf = infoOfMat(m);
			if (!lay || !lay.sheets || !lay.sheets.length) return;
			if (!inf) { miss.push(P.matTitle(m)); return; }
			seen[inf.id] = 1;
			var fresh = lay.sheets.filter(function (sh) { return !sh.rem && sh.recs && sh.recs.length; }), u = K0.unitOf(inf.unit), q;
			q = u === 'м2' ? fresh.reduce(function (a, sh) { return a + sh.L * sh.W / 1e6; }, 0) : fresh.length;
			if (q > 0) need.push({ mat: inf.id, qty: Math.round(q * 1e4) / 1e4, title: P.matTitle(m) });
			lay.sheets.forEach(function (sh) { if (sh.tree && BM.cut.wasteRects) BM.cut.wasteRects(sh.tree).forEach(function (r) { offcuts.push({ mat: inf.id, L: r.w, W: r.h, n: 1 }); }); });
		});
		(R ? R.rows : []).forEach(function (w) {
			if (w.kind === 'panel' || w.off || w.info || !(w.val > 0)) return;
			var inf = K0.rowInfo(w);
			if (!inf || seen[inf.id]) return;
			var a = K0.unitOf(inf.unit), u = K0.unitOf(w.unit), q = w.val;
			if (a !== u && u && a) { if (a === 'лист' && u === 'м2' && inf.L > 0 && inf.W > 0) q = Math.ceil(q / (inf.L * inf.W / 1e6)); else return; }
			need.push({ mat: inf.id, qty: q, title: w.title });
		});
		return { need: need, offcuts: offcuts, miss: miss };
	};
	/* что нужно заказу: сумма по изделиям; offcuts — деловые обрезки раскроя; used — обрезки склада, взятые в раскрой */
	async function orderNeed(o) {
		var K = window.MatBase, s = S(), need = {}, offcuts = [], used = [], miss = [], bad = [];
		for (var i = 0; i < o.items.length; i++) {
			var it = o.items[i], st = null;
			try {
				if (s.st && s.path && (s.path === it.path || s.path === it.src)) st = s.st;
				else {
					st = P.build(JSON.parse(await U.api.readText(it.path)), s.set);
					st.mats.forEach(function (m) { if (m.cfg.on && (!st.work.layout[m.key] || P.isStale(st, m))) P.nest(st, m.key, { quality: 0 }); });
				}
			} catch (e) { bad.push(U.baseOf(it.path)); continue; }
			var R = K.build(st, window.Est.cfg(), E.listFor(s.prices, st), st.work.est, s.prices ? s.prices.sup : {}), r = K.need(st, R);
			r.need.forEach(function (x) { need[x.mat] = (need[x.mat] || 0) + x.qty; });
			offcuts = offcuts.concat(r.offcuts); miss = miss.concat(r.miss);
			st.mats.forEach(function (m) { var lay = st.work.layout[m.key]; if (!lay) return; lay.sheets.forEach(function (sh) { var rr = sh.rem && sh.recs.length && m.cfg.rem[sh.ri]; if (rr && rr.stock) used.push(rr.stock); }); });
		}
		return { need: Object.keys(need).map(function (k) { return { mat: k, qty: Math.round(need[k] * 1e4) / 1e4 }; }), offcuts: offcuts, used: used, miss: miss, bad: bad };
	}
	async function pickOrder(title, cur) {
		var H = window.STHO, bk = H && await H.load(); if (!bk || !bk.orders.length) { U.toast('Заказов нет.'); return null; }
		if (cur) return cur;
		var O = BM.sth, list = bk.orders.filter(function (o) { return o.items.length; });
		if (!list.length) { U.toast('Ни в одном заказе нет изделий.'); return null; }
		var v = await U.modal({ title: title, width: 480, cls: 'skDlg', body: '<label class="fld wide">Заказ <select id="skO">' + list.map(function (o) { var c = O.client(bk, o.clientId); return '<option value="' + esc(o.id) + '">' + esc(o.no + (c ? ' · ' + c.name : '') + ' · ' + O.statusName(o.status, bk)) + '</option>'; }).join('') + '</select></label>',
			buttons: [{ label: 'Отмена', value: null }, { label: 'Дальше', primary: true, run: function (el) { return el.querySelector('#skO').value; } }] });
		return v ? O.order(bk, v) : null;
	}
	X.checkOrder = async function (o0) {
		var o = await pickOrder('Проверка перед списанием', o0); if (!o) return;
		var K = window.MatBase; await K.refresh(); var b = MB.cur;
		if (!b) { U.toast('Базы материалов нет: склад хранится в ней.'); return; }
		if (!o.items.length) { U.toast('В заказе ' + o.no + ' нет изделий — списывать нечего.'); return; }
		var progress = U.sthProgress ? U.sthProgress('Проверяю заказ ' + o.no) : null;
		var r;
		try { if (progress) progress.update(15, 'Читаю изделия и раскрой'); r = await orderNeed(o); if (progress) progress.update(75, 'Сверяю остатки и прежние списания'); }
		finally { if (progress) progress.done(); }
		SK.fix(b);
		if (!r.need.length) { U.toast('Материалов заказа нет в базе — списывать нечего.' + (r.miss.length ? ' Нет в базе: ' + r.miss.slice(0, 3).join(', ') : '')); return; }
		var p = SK.orderPreview(b, o, r), lim = b.set.offMin || [300, 200];
		var rows = p.rows.map(function (x) {
			return '<tr><td>' + esc(x.name) + '</td><td class="r">' + n(x.need) + ' ' + esc(x.unit) + '</td><td class="r">' + n(x.available) + '</td><td class="r' + (x.after < 0 ? ' neg' : '') + '">' + n(x.after) + '</td><td class="r neg">' + (x.shortage > 0 ? n(x.shortage) : '') + '</td></tr>';
		}).join('');
		var ok = await U.modal({ title: 'Проверка перед списанием · заказ ' + o.no, width: 800, cls: 'skDlg',
			body: (p.shortage ? '<p class="warn">Не хватает материалов по позициям: ' + p.shortage + '. При подтверждении остаток станет отрицательным — его нужно будет докупить.</p>' : '<p>По всем найденным позициям остатка достаточно. Пока ничего не записано.</p>') +
				(p.previous.length ? '<p class="warn">Заказ уже списан — прежнее списание отменится и заменится этим.</p>' : '') +
				'<div style="max-height:50vh;overflow:auto"><table class="grid" style="width:100%"><thead><tr><th>Материал</th><th class="r">Нужно</th><th class="r">Доступно</th><th class="r">Останется</th><th class="r">Нехватка</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
				'<p class="mute"><b>После подтверждения:</b> будет создан расход, деловые обрезки раскроя попадут на склад (не меньше ' + lim[0] + '×' + lim[1] + ' мм): ' + p.offcuts + '; обрезков склада будет отмечено взятыми: ' + p.used + '; резерв заказа снимется.' +
				(p.miss.length ? ' Нет в базе (не списываются): ' + esc(p.miss.slice(0, 6).join(', ')) + '.' : '') + (p.bad.length ? ' Не прочитаны: ' + esc(p.bad.join(', ')) + '.' : '') + '</p>',
			buttons: [{ label: 'Закрыть без списания', value: false }, { label: 'Подтвердить списание', primary: true, value: true }] });
		if (!ok) return;
		await K.refresh(); b = SK.fix(MB.cur);
		var w = MB.writeOff(b, key(o), r.need, r.offcuts);
		if (!w.doc) { U.toast('Списывать нечего.'); return; }
		w.doc.order = o.id;
		r.used.forEach(function (id) { MB.useOffcut(b, id, key(o)); });
		SK.unreserveOrder(b, o.id);
		SK.log(b, 'stock', 'Списание заказа подтверждено', 'Заказ № ' + o.no + ' · позиций: ' + w.doc.lines.length + ', обрезков: ' + w.offcuts.length, { order: o.id, doc: w.doc.id });
		await K.saveBase();
		var id = w.doc.id;
		U.toast('Списано по заказу ' + o.no + ': ' + w.doc.lines.length + ' поз.' + (w.offcuts.length ? ', обрезков на склад: ' + w.offcuts.length : '') + '.', { ms: 12000, actions: [{ label: 'Отменить', run: async function () { await K.refresh(); MB.cancelDoc(MB.cur, id); SK.log(MB.cur, 'stock', 'Списание отменено', 'Заказ № ' + o.no, { order: o.id, doc: id }); await K.saveBase(); U.toast('Списание отменено (резерв не возвращается).'); } }] });
		if (S().section === 'stock') X.render();
	};
	X.writeOffOrder = X.checkOrder;
	X.receiveOrder = async function () {
		var o = await pickOrder('Приход по заказу'); if (!o) return;
		var K = window.MatBase; await K.refresh(); var b = MB.cur; if (!b) return;
		U.toast('Считаю материалы заказа ' + o.no + '…', { ms: 2000 });
		var r = await orderNeed(o); SK.fix(b);
		if (!r.need.length) { U.toast('Материалов заказа нет в базе.'); return; }
		var rows = r.need.map(function (x, i) {
			var m = b.mats[x.mat], mine = SK.resOf(b, x.mat).filter(function (q) { return q.order === o.id; })[0], free = MB.balance(b, x.mat) - SK.reserved(b, x.mat) + (mine ? mine.qty : 0), buy = Math.max(0, Math.round((x.qty - Math.max(0, free)) * 1e4) / 1e4);
			if (buy > 0 && (m.round || 0)) buy = MB.roundQty(m, buy);
			return '<tr><td><input type="checkbox" class="rk" data-i="' + i + '"' + (buy > 0 ? ' checked' : '') + '></td><td>' + esc(m.name) + '</td><td class="r">' + n(x.qty) + '</td><td class="r">' + n(free) + '</td><td><input class="rq" data-i="' + i + '" value="' + n(buy) + '" style="width:80px"> ' + esc(m.unit) + '</td><td><input class="rp" data-i="' + i + '" value="' + (m.price ? n(m.price) : '') + '" style="width:90px"></td></tr>';
		}).join('');
		var res = await U.modal({ title: 'Приход по заказу ' + o.no, width: 860, cls: 'skDlg',
			body: '<p class="mute">Что пришло от поставщика под этот заказ. «Принять» — на склад и в резерв заказа (весь нужный заказу объём).</p><div style="max-height:52vh;overflow:auto"><table class="grid" style="width:100%"><thead><tr><th></th><th>Материал</th><th class="r">Нужно</th><th class="r">Свободно</th><th>Пришло</th><th>Цена, ₽</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
				'<label class="fld wide" style="margin-top:8px">Примечание (поставщик, накладная) <input id="skNote"></label>',
			buttons: [{ label: 'Отмена', value: null }, { label: 'Принять', primary: true, run: function (el) {
				var lines = []; el.querySelectorAll('.rk').forEach(function (c) { if (!c.checked) return; var i = c.dataset.i, q = Number(el.querySelector('.rq[data-i="' + i + '"]').value.replace(',', '.')); if (q > 0) lines.push({ mat: r.need[i].mat, qty: q, price: Number(el.querySelector('.rp[data-i="' + i + '"]').value.replace(',', '.').replace(/\s/g, '')) || 0 }); });
				return { lines: lines, note: el.querySelector('#skNote').value };
			} }] });
		if (!res) return;
		await K.refresh(); b = SK.fix(MB.cur);
		var d = res.lines.length ? MB.addDoc(b, { kind: 'in', note: res.note, project: key(o), lines: res.lines }) : null;
		if (d) d.order = o.id;
		r.need.forEach(function (x) { SK.reserve(b, x.mat, x.qty, o); });
		await K.saveBase();
		U.toast((d ? 'Принято: ' + d.lines.length + ' поз. ' : '') + 'Резерв под заказ ' + o.no + ': ' + r.need.length + ' поз.');
		if (S().section === 'stock') X.render();
	};

	/* кнопки в разделе «Склад» */
	var r0 = X.render;
	X.render = function () {
		r0.apply(this, arguments);
		var bar = document.querySelector('#stock .skBar .grow');
		if (bar && X.tab !== 'moves' && X.tab !== 'history' && X.tab !== 'off') bar.insertAdjacentHTML('afterend', '<button id="skRecv" title="Пришло от поставщика под заказ — на склад и в резерв">Приход по заказу…</button><button id="skWo" title="Списать материалы заказа: листы раскроя и позиции смет всех изделий">Списать по заказу…</button>');
	};
	document.addEventListener('click', function (e) {
		if (e.target.closest('#skRecv')) X.receiveOrder().catch(U.error);
		else if (e.target.closest('#skWo')) X.writeOffOrder().catch(U.error);
	});
	/* Заказ переведён «В работу»: сначала независимая проверка; склад меняется только по явному подтверждению в ней. */
	document.addEventListener('change', function (e) {
		if (e.target.id !== 'soStat' || e.target.value !== 'work') return;
		var H = window.STHO, o = H && H.book && BM.sth.order(H.book, H.cur);
		if (!o || !o.items.length || !MB.cur) return;
		setTimeout(function () { X.checkOrder(o).catch(U.error); }, 300);
	});
	/* Тот же вход используется канбаном: статус меняется отдельно, затем открывается только проверка. */
	document.addEventListener('sth:order-work', function (e) {
		var o = e.detail; if (!o || !o.items || !o.items.length || !MB.cur) return;
		setTimeout(function () { X.checkOrder(o).catch(U.error); }, 300);
	});

	/* --------------------- шаг 4: обрезки склада в раскрой --------------------- */
	var Pn = window.Panels;
	if (Pn && Pn.left) {
		var l0 = Pn.left;
		Pn.left = function () {
			var x = l0.apply(this, arguments);
			try {
				var A = window.App, mat = A.mat(), box = document.getElementById('remBox'), b = MB.cur;
				if (!mat || !mat.cfg.on || !box || !b) return x;
				var inf = infoOfMat(mat); if (!inf) return x;
				(mat.cfg.rem || []).forEach(function (r, i) { if (!r.stock) return; var row = box.querySelector('.row[data-i="' + i + '"]'); if (row) row.insertAdjacentHTML('beforeend', ' <span class="skTag" title="Обрезок со склада">склад</span>'); });
				var taken = (mat.cfg.rem || []).map(function (r) { return r.stock; }), free = MB.offcuts(b, inf.id).filter(function (o) { return taken.indexOf(o.id) < 0; });
				var add = box.querySelector('#bRemAdd');
				if (add && free.length) add.insertAdjacentHTML('afterend', ' <button id="bRemStock" title="Свободные обрезки этого материала на складе">Со склада (' + free.length + ')…</button>');
			} catch (e) { console.warn(e); }
			return x;
		};
		document.addEventListener('click', async function (e) {
			if (!e.target.closest('#bRemStock')) return;
			var A = window.App, mat = A.mat(), b = MB.cur; if (!mat || !b) return;
			var inf = infoOfMat(mat); if (!inf) return;
			var H = window.STHO, ord = H && H.book && S().path ? BM.sth.byItem(H.book, S().path) : null;
			var taken = (mat.cfg.rem || []).map(function (r) { return r.stock; });
			var list = MB.offcuts(b, inf.id).filter(function (o) { return taken.indexOf(o.id) < 0 && (!o.res || (ord && o.res === ord.id)); });
			if (!list.length) { U.toast('Свободных обрезков нет (остальные в резерве других заказов).'); return; }
			var v = await U.modal({ title: 'Обрезки со склада: ' + mat.name, width: 560, cls: 'skDlg',
				body: '<p class="mute">Отмеченные пойдут в раскрой первыми.' + (ord ? ' Они встанут в резерв заказа ' + esc(ord.no) + '.' : '') + '</p><table class="grid" style="width:100%"><tbody>' +
					list.map(function (o, i) { var c = b.stock.cells && b.stock.cells[o.mat]; return '<tr><td><input type="checkbox" class="rk" data-i="' + i + '" checked></td><td class="r">' + o.L + '×' + o.W + '</td><td class="r">' + o.n + ' шт</td><td class="mute">' + esc(o.project || 'вручную') + (c ? ' · ячейка ' + esc(c) : '') + '</td></tr>'; }).join('') + '</tbody></table>',
				buttons: [{ label: 'Отмена', value: null }, { label: 'В раскрой', primary: true, run: function (el) { var out = []; el.querySelectorAll('.rk').forEach(function (c) { if (c.checked) out.push(list[c.dataset.i]); }); return out; } }] });
			if (!v || !v.length) return;
			A.pushUndo();
			v.forEach(function (o) { mat.cfg.rem.push({ L: o.L, W: o.W, n: o.n || 1, stock: o.id }); });
			A.afterChange();
			if (ord) { var K = window.MatBase; await K.refresh(); v.forEach(function (o) { SK.reserveOff(MB.cur, o.id, ord); }); await K.saveBase(); }
			U.toast('Обрезков со склада в раскрой: ' + v.length + '. Пересчитайте раскрой этого материала.');
		});
	}
})();
