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
			.map(function (o) { var cl = O.client(bk, o.clientId); return { id: o.id, no: o.no, title: o.no + (cl ? ' · ' + cl.name : '') + ' · ' + O.statusName(o.status) }; });
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
		var btns = tab === 'moves' ? '' : tab === 'off' ? '<button id="skOffAdd">＋ Обрезок</button>' : '<button id="skIn">＋ Приход</button><button id="skOut">－ Расход</button><button id="skRes">Резерв…</button>';
		var bar = '<div class="skBar"><span class="mseg">' + tabs + '</span><div class="grow"></div>' + btns +
			(tab === 'sheet' || tab === 'lin' || tab === 'fit' ? '<label class="mute sm"><input type="checkbox" id="skAll"' + (X.all ? ' checked' : '') + '> все из базы</label>' : '') +
			'<input type="search" id="skQ" placeholder="Поиск: название, артикул, ячейка" value="' + esc(X.q) + '"></div>';
		if (!b) { host.innerHTML = bar + '<div class="skEmpty">Склад хранится в базе материалов. Базы нет — выберите файл в «Настройки → Общие → Папки и файлы».</div>'; return; }
		host.innerHTML = bar + '<div class="skBody">' + (tab === 'moves' ? movesHtml(b) : tab === 'off' ? offHtml(b) : matsHtml(b)) + '</div>';
		var q = $('skQ'); if (q && X.focusQ) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); X.focusQ = false; }
	};
	function matsHtml(b) {
		var rows = SK.rows(b, X.tab, X.q, X.all);
		if (!rows.length) return '<div class="skEmpty">' + (X.q ? 'Ничего не найдено.' : 'На складе пусто. «＋ Приход» — завести материал из базы; «все из базы» — показать все материалы этой вкладки.') + '</div>';
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

	/* ------------------------------ события ---------------------------------- */
	X.init = function () {
		var host = $('stock'); if (!host || host._on) return; host._on = true;
		host.addEventListener('click', function (e) {
			var t = e.target, bt;
			if ((bt = t.closest('[data-skt]'))) { X.tab = bt.dataset.skt; X.render(); return; }
			if (t.closest('#skIn')) { moveDlg('in').catch(U.error); return; }
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
			if (t.dataset.cell) { var id = t.dataset.cell, v = t.value; edit(function (b) { SK.setCell(b, id, v); }).catch(U.error); }
		});
		window.addEventListener('focus', function () { var s = S(); if (s && s.section === 'stock') window.MatBase.refresh().then(X.render); });
	};
	X.show = function () { X.init(); window.MatBase.refresh().then(X.render).catch(U.error); X.render(); };
})();
