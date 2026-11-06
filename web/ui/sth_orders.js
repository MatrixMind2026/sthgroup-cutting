/* STHGroup — разделы «Заказы» (вариант «A»: список | заказ | итог) и «Клиенты», справочник услуг и цен, КП и счёт в PDF (макет «B»).
   Книга заказов — один файл «STHGroup — заказы.json» в общей папке (по умолчанию — папка базы материалов).
   Расчёт — core/sth_order.js. Изделие заказа — файл проекта .bmk: открытое в программе считается по текущему раскрою и смете,
   остальные — по файлу (раскрой «быстро», если в файле его нет). */
(function () {
	'use strict';
	var U = window.UI, esc = U.esc, O = BM.sth, P = BM.project;
	var X = window.STHO = { book: null, path: '', mtime: 0, cur: '', tab: 'calc', q: '', st: '', client: '', open: {} };
	function S() { return window.App.S; }
	function $(id) { return document.getElementById(id); }
	var money = O.money;

	/* ------------------------------ файл книги ------------------------------ */
	function dirOfBase() { var K = window.MatBase; return K && K.path ? U.dirOf(K.path) : ''; }
	X.folder = function () { var s = S(); return s.set.sthOrdersDir || dirOfBase() || (s.boot && s.boot.dataDir) || ''; };
	X.load = async function (force) {
		var dir = X.folder(); if (!dir) return null;
		var p = U.join(dir, O.FILE), st = null;
		try { st = await U.api.stat(p); } catch (e) { st = null; }
		if (!force && X.book && p === X.path && st && st.exists && st.mtime === X.mtime) return X.book;
		if (st && st.exists) {
			try { X.book = O.fix(JSON.parse(await U.api.readText(p))); X.path = p; X.mtime = st.mtime; return X.book; }
			catch (e) { U.toast('Файл заказов не прочитан: ' + e.message, { bad: true }); }
		}
		if (!X.book || X.path !== p) { X.book = O.empty(); X.path = p; X.mtime = 0; }
		return X.book;
	};
	var saveT = null;
	X.save = function (now) {
		clearTimeout(saveT);
		saveT = setTimeout(async function () {
			if (!X.book || !X.path) return;
			try { await U.api.mkdir(U.dirOf(X.path)); await U.api.write(X.path, JSON.stringify(X.book)); var st = await U.api.stat(X.path); X.mtime = st.mtime || 0; }
			catch (e) { U.toast('Заказы не сохранены: ' + e.message, { bad: true }); }
		}, now ? 0 : 400);
	};
	/* STHGroup: производственные действия дожидаются записи книги и показывают ошибку. */
	X.flush = async function () {
		clearTimeout(saveT);
		if (!X.book || !X.path) throw new Error('Нет файла книги заказов');
		await U.api.mkdir(U.dirOf(X.path));
		await U.api.write(X.path, JSON.stringify(X.book));
		var st = await U.api.stat(X.path); X.mtime = st.mtime || 0;
	};
	function changed() { X.save(); X.render(); }

	/* --------------------------- сводка изделия ----------------------------- */
	function sup() { var s = S(); return s.prices ? s.prices.sup : {}; }
	function buildR(st) {
		var E = BM.est, Es = window.Est, cfg = Es.cfg(), pl = E.listFor(S().prices, st), K = window.MatBase;
		return K && K.build ? K.build(st, cfg, pl, st.work.est, sup()) : E.build(st, cfg, pl, st.work.est, sup());
	}
	X.snapOpen = function () {
		var s = S(); if (!s.st || !s.path || !X.book) return null;
		var o = O.byItem(X.book, s.path); if (!o) return null;
		try { var sn = O.snapshot(s.st, buildR(s.st), X.book.cat, P.modelName(s.st.model), s.path); O.putItem(o, s.path, sn); return o; } catch (e) { console.warn(e); return null; }
	};
	X.snapFile = async function (path, persist) {
		var s = S();
		if (s.path === path && s.st) { var o = X.snapOpen(); return o ? O.putItem(o, path, null).snap : null; }
		var doc = JSON.parse(await U.api.readText(path));
		var st = P.build(doc, s.set);
		st.mats.forEach(function (m) { if (m.cfg.on && (!st.work.layout[m.key] || P.isStale(st, m))) P.nest(st, m.key, { quality: 0 }); });
		if (persist) await U.api.write(path, JSON.stringify(st.doc)); // STHGroup: принятая версия хранится с новым раскроем, включая архив .bmk
		return O.snapshot(st, buildR(st), X.book.cat, P.modelName(st.model), path);
	};

	/* ---------------------- заказ для открытого проекта --------------------- */
	X.onProject = async function () {
		var internal = opening, s = S(); if (!s.st || !s.path) return;
		await window.MatBase.refresh();
		if (!(await X.load())) return;
		var r = O.forProject(X.book, s.path, s.st.model), src = s.path;
		var it = O.putItem(r.order, s.path, null); if (!it.title) it.title = P.modelName(s.st.model);
		X.cur = r.order.id;
		X.save();
		/* выгрузили из БАЗИСа (файл не в папке заказа) — копия в папку заказа и работа с ней: вкладка исходного файла меняется на копию */
		if (!internal && !inDir(src, X.orderDir(r.order))) {
			try {
				/* копия уже есть и она новее файла выгрузки — открыть копию, не затирая её правок */
				var fresh = true;
				if (it.path !== src) { var a = await U.api.stat(src), c2 = await U.api.stat(it.path); if (c2.exists && a.exists && c2.mtime >= a.mtime) fresh = false; }
				if (fresh) it.path = src;
				if (!fresh || await X.toFolder(r.order, it)) {
					X.save(true);
					var A = window.App, ti = A.tabOf(src);
					opening = true; try { await A.openPath(it.path); } finally { opening = false; }
					ti = A.tabOf(src); if (ti >= 0) A.closeTab(ti);
					if (fresh) U.toast('Модель скопирована в папку заказа ' + r.order.no + ': ' + U.dirOf(it.path), { ms: 7000 });
				}
			} catch (e) { U.toast('Модель не скопирована в папку заказа: ' + e.message, { bad: true }); }
		}
		if (r.made) U.toast('Заказ ' + r.order.no + ' создан' + (r.order.clientId ? ' для «' + O.client(X.book, r.order.clientId).name + '»' : '') + '. Раздел «Заказы» слева.', { ms: 9000, actions: [{ label: 'Открыть заказ', run: function () { X.sgFocusOrder = true; go('orders'); } }] });
	};
	/* ------------------------- папка заказа и модели ------------------------ */
	/* Папка заказа: <папка заказов>\Заказы\<номер клиент>. Файл модели (.bmk) копируется туда — заказ работает с копией,
	   поэтому старый заказ открывается со своей моделью, даже если исходный файл перенесли или выгрузили заново. */
	X.orderDir = function (o) { if (!o.dir) o.dir = U.join(U.join(X.folder(), 'Заказы'), O.dirName(X.book, o)); return o.dir; };
	/* STHGroup: подпапки версий уже принадлежат заказу; не копировать их поверх старой модели. */
	function inDir(p, dir) {
		var parent = U.dirOf(p).replace(/\\/g, '/').toLowerCase().replace(/\/+$/, '');
		var root = String(dir).replace(/\\/g, '/').toLowerCase().replace(/\/+$/, '');
		return parent === root || parent.indexOf(root + '/') === 0;
	}
	async function copyFile(src, dst) {
		var r = await fetch('/api/sth/copy', { method: 'POST', headers: { 'X-BM-Token': new URLSearchParams(location.search).get('t') || '', 'Content-Type': 'application/json' }, body: JSON.stringify({ src: src, dst: dst }) });
		var j = await r.json(); if (!r.ok || j.error) throw new Error(j.error || 'файл не скопирован');
		return j;
	}
	/* изделие — в папку заказа (если ещё не там); true — путь изделия поменялся */
	X.toFolder = async function (o, it) {
		var dir = X.orderDir(o);
		if (inDir(it.path, dir)) return false;
		var st; try { st = await U.api.stat(it.path); } catch (e) { st = null; }
		if (!st || !st.exists) return false;
		var dst = U.join(dir, U.baseOf(it.path));
		await copyFile(it.path, dst);
		it.src = it.path; it.path = dst;
		return true;
	};
	var opening = false;
	/* открыть модели заказа (или одно изделие i); заодно перенести их в папку заказа */
	X.openModels = async function (o, i) {
		if (!o || !o.items.length) return false;
		var A = window.App, list = i === undefined ? o.items : [o.items[i]].filter(Boolean), moved = false, ok = false, last = null;
		for (var k = 0; k < list.length; k++) { try { if (await X.toFolder(o, list[k])) moved = true; } catch (e) { U.toast('«' + U.baseOf(list[k].path) + '» не скопирован в папку заказа: ' + e.message, { bad: true }); } }
		if (moved) X.save(true);
		opening = true;
		try {
			for (k = 0; k < list.length; k++) {
				var p = list[k].path, st = null; try { st = await U.api.stat(p); } catch (e2) { st = null; }
				if (!st || !st.exists) { U.toast('Файл модели не найден: ' + p, { bad: true }); continue; }
				if (A.tabOf(p) >= 0 && i === undefined) { ok = true; continue; }
				if (await A.openPath(p)) { ok = true; last = p; }
			}
		} finally { opening = false; }
		if (i === undefined && ok && A.tabOf(list[0].path) >= 0 && S().path !== list[0].path) A.switchTab(A.tabOf(list[0].path));
		if (S().section === 'orders') X.render();
		return ok;
	};
	function go(sec) { var b = document.querySelector('#rail [data-s="' + sec + '"]'); if (b) b.click(); }
	X.go = go;

	/* -------------------------------- окно ---------------------------------- */
	var STAT_CLS = { calc: 'o', agreed: 'b', work: 'g', ready: 'g', shipped: '', closed: '' };
	function orderSum(o) { try { return O.calc(X.book, o); } catch (e) { return { total: 0, debt: 0, paid: 0 }; } }
	function listHtml() {
		var b = X.book, q = String(X.q || '').toLowerCase();
		var list = b.orders.filter(function (o) {
			if (X.st && o.status !== X.st) return false;
			if (!q) return true;
			var c = O.client(b, o.clientId);
			return [o.no, c && c.name, c && c.phone, o.note].concat(o.items.map(function (i) { return i.title; })).join(' ').toLowerCase().indexOf(q) >= 0;
		});
		return list.map(function (o) {
			var c = O.client(b, o.clientId), t = orderSum(o);
			return '<div class="soIt' + (o.id === X.cur ? ' on' : '') + '" data-o="' + o.id + '"><span class="soTag ' + (STAT_CLS[o.status] || '') + '">' + esc(O.statusName(o.status, b)) + '</span><b>' + esc(o.no) + '</b> · ' + esc(c ? c.name : 'без клиента') +
				'<small>' + esc(o.items.map(function (i) { return i.title || U.stemOf(i.path); }).join(', ') || 'нет изделий') + ' · ' + money(t.total) + ' ₽' + (t.debt > 0.009 && t.paid > 0 ? ' · долг ' + money(t.debt) : '') + '</small></div>';
		}).join('') || '<p class="mute">Заказов нет. Выгрузите модель скриптом STHGroup_Export — заказ появится сам — или нажмите «+ Новый заказ».</p>';
	}
	function opt(list, v) { return list.map(function (x) { return '<option value="' + esc(x[0]) + '"' + (x[0] === v ? ' selected' : '') + '>' + esc(x[1]) + '</option>'; }).join(''); }
	function lineRow(l, o, bid) {
		var dg = ' data-dg="' + esc(bid || '') + '" data-lk="' + esc(l.key) + '"', H = bid ? window.STHDrag.handle() : '';
		var ck = l.check ? '<input type="checkbox" data-ck="' + esc(l.key) + '"' + (l.on ? ' checked' : '') + '> ' : '';
		var editable = l.key.indexOf('m:') !== 0;
		/* STHGroup: своя строка — название и единица правятся, строку можно убрать */
		if (l.extra) return '<tr class="soX soLn"' + dg + '>' + '<td class="soHc">' + H + '</td>' + '<td><input class="soXn" data-xn="' + esc(l.key) + '" value="' + esc(l.name) + '" placeholder="Название услуги"></td><td><input class="soXu" data-xu="' + esc(l.key) + '" value="' + esc(l.unit || '') + '" list="soUnits" placeholder="ед."></td>' +
			'<td class="r"><input class="soN" data-pr="' + esc(l.key) + '" value="' + String(l.price).replace('.', ',') + '"></td><td class="r"><input class="soN" data-qt="' + esc(l.key) + '" value="' + String(l.qty).replace('.', ',') + '"></td>' +
			'<td class="r"><b>' + money(l.sum) + '</b> <button class="icon" data-xrm="' + esc(l.key) + '" title="Убрать строку">✕</button></td></tr>';
		return '<tr class="soLn ' + ((l.check && !l.on) || (l.opt && !l.qty) ? 'off' : '') + '"' + dg + '>' + '<td class="soHc">' + H + '</td>' + '<td>' + ck + esc(l.name) + (l.samplePrice ? ' <span class="sthSampleBadge">Образец' + (l.sampleSource === 'FOXY' ? ' FOXY' : '') + '</span>' : '') + '</td><td class="mute">' + esc(l.unit || '') + '</td>' +
			'<td class="r">' + (editable ? '<input class="soN" data-pr="' + esc(l.key) + '" value="' + String(l.price).replace('.', ',') + '">' : money(l.price)) + (l.unit === '% от суммы' ? ' %' : '') + '</td>' +
			'<td class="r">' + (l.key.indexOf('s:') === 0 || l.key.indexOf('m:') === 0 || l.unit === '% от суммы' ? (l.qty || '') : '<input class="soN" data-qt="' + esc(l.key) + '" value="' + String(l.qty).replace('.', ',') + '">') + '</td>' +
			'<td class="r"><b>' + money(l.sum) + '</b></td></tr>';
	}
	function calcHtml(o, q) {
		var h = '';
		q.blocks.forEach(function (bk) {
			if (bk.opt) {
				/* доп. работы, фасады, фрезеровка: видны строки с количеством, остальные — по «показать все» */
				var all = !!X.open[bk.id], used = bk.lines.filter(function (l) { return l.qty; }), show = all ? bk.lines : used;
				h += '<div class="soBh">' + esc(bk.title) + (bk.note ? ' <small class="mute">' + esc(bk.note) + '</small>' : '') + '<span>' + money(bk.sum) + ' ₽</span></div>' +
					(show.length ? '<table class="soT"><tbody>' + show.map(function (l) { return lineRow(l, o, bk.id); }).join('') + '</tbody></table>' : '') +
					'<button class="link" data-gopen="' + esc(bk.id) + '">' + (all ? '− скрыть строки без количества' : '+ ' + (used.length ? 'ещё строки' : 'выбрать') + ' (' + (bk.lines.length - used.length) + ')') + '</button>';
				return;
			}
			if (!bk.lines.length && bk.id !== 'svc') return;
			h += '<div class="soBh">' + esc(bk.title) + '<span>' + money(bk.sum + (bk.id === 'svc' ? q.pctSum : 0)) + ' ₽</span></div><table class="soT"><tbody>' + bk.lines.map(function (l) { return lineRow(l, o, bk.id); }).join('') + '</tbody></table>';
			if (bk.id === 'svc') h += '<button class="link" id="soExtra">+ своя строка</button><datalist id="soUnits"><option value="шт"><option value="за заказ"><option value="за лист"><option value="за изделие"><option value="за деталь"><option value="м²"><option value="м.п."><option value="час"></datalist>';
		});
		var mk = o.markup !== undefined && o.markup !== '' ? o.markup : X.book.cat.markup;
		h += '<div class="soBh">Материалы и фурнитура<span>' + money(q.mats) + ' ₽</span></div><table class="soT"><tbody>' + q.matLines.map(function (l) { return lineRow(l, o, ''); }).join('') + '</tbody></table>' +
			'<div class="soRow mute">Наценка к оптовому прайсу поставщика <input class="soN" id="soMk" value="' + String(mk).replace('.', ',') + '"> %</div>';
		if (q.matList.length) h += '<div class="soBh">Материалы в заказе</div><table class="soT"><tbody>' + q.matList.map(function (m) { return '<tr><td>' + esc(m.name) + '</td><td class="mute">' + esc(m.th ? P.dim(m.th) + ' мм' : '') + '</td><td class="r">' + m.n + ' л</td></tr>'; }).join('') + '</tbody></table>';
		if (q.warn.length) h += '<div class="note warn">' + q.warn.map(esc).join('<br>') + '</div>';
		return h;
	}
	function itemsHtml(o) {
		var rows = o.items.map(function (it, i) {
			var s = it.snap;
			return '<tr class="soItR" data-dg="items">' + '<td class="soHc">' + window.STHDrag.handle() + '</td>' + '<td><input class="soTx" data-it="' + i + '" value="' + esc(it.title || '') + '" placeholder="' + esc(U.stemOf(it.path)) + '"></td><td class="mute" title="' + esc(it.path) + '">' + esc(U.baseOf(it.path)) + '</td>' +
				'<td class="r">' + (s ? s.sheets.reduce(function (a, x) { return a + x.n; }, 0) : '—') + '</td><td class="r">' + (s ? s.parts : '—') + '</td><td class="r">' + (s ? money(s.mat) : '—') + '</td><td class="r">' + (s ? money(s.fit) : '—') + '</td>' +
				'<td class="mute">' + (s ? O.ruDate(s.at.slice(0, 10)) : 'не посчитано') + '</td><td class="nw"><button data-iop="' + i + '">Открыть</button><button data-irc="' + i + '" title="Посчитать заново по файлу">↻</button><button class="icon" data-irm="' + i + '" title="Убрать из заказа">✕</button></td></tr>';
		}).join('');
		return '<table class="grid soItems"><thead><tr><th></th><th>Изделие</th><th>Файл</th><th class="r">Листов</th><th class="r">Деталей</th><th class="r">Материалы</th><th class="r">Фурнитура</th><th>Посчитано</th><th></th></tr></thead><tbody>' + (rows || '<tr><td colspan="9" class="mute">Изделий нет</td></tr>') + '</tbody></table>' +
			'<div class="soRow"><button id="soAddItem">+ Изделие (.bmk)…</button><button id="soRecalc">Пересчитать все</button></div>';
	}
	function payHtml(o, q) {
		var rows = o.payments.map(function (p, i) { return '<tr><td>' + esc(O.ruDate(p.date)) + '</td><td class="r">' + money(p.amount) + ' ₽</td><td>' + esc(p.note || '') + '</td><td><button class="icon" data-prm="' + i + '">✕</button></td></tr>'; }).join('');
		return '<table class="grid soPay"><thead><tr><th>Дата</th><th class="r">Сумма</th><th>Примечание</th><th></th></tr></thead><tbody>' + (rows || '<tr><td colspan="4" class="mute">Оплат нет</td></tr>') + '</tbody></table>' +
			'<div class="soRow"><input type="date" id="soPd" value="' + O.today() + '"><input class="soN" id="soPa" placeholder="сумма" style="width:110px"><input id="soPn" placeholder="примечание" style="width:220px"><button id="soPadd" class="primary">Внести оплату</button>' +
			'<button id="soPadv">Аванс ' + money(q.advance) + '</button><button id="soPrest">Остаток ' + money(Math.max(0, q.debt)) + '</button></div>';
	}
	function sideHtml(o, q) {
		var t = Object.assign({}, X.book.cat.terms, o.terms || {}), cat = X.book.cat;
		return '<div class="mute">Итого по заказу</div><div class="soTot">' + money(q.total) + ' ₽</div>' +
			'<details class="sgSide"><summary>Расчёт и скидки</summary>' + /* STHGroup: параметры не перегружают итог */
			'<div class="soR"><span>Услуги</span><span>' + money(q.serv) + '</span></div>' +
			'<label class="soR ac"><span><input type="checkbox" id="soCx"' + (o.complex ? ' checked' : '') + '> Скидка за комплекс ' + cat.complexPct + '%</span><span>−' + money(q.discount) + '</span></label>' +
			'<label class="soR ac"><span><input type="checkbox" id="soUrg"' + (o.urgent ? ' checked' : '') + '> Срочно +' + cat.urgentPct + '%, ' + cat.urgentDays + ' дн.</span><span style="white-space:nowrap">' + (q.urgent ? '+' + money(q.urgent) : '') + '</span></label>' +
			(q.pctSum ? '<div class="soR"><span>Проценты (безнал)</span><span>' + money(q.pctSum) + '</span></div>' : '') +
			'<div class="soR"><span>Материалы</span><span>' + money(q.mats) + '</span></div></details>' +
			'<div class="soPay"><div class="soR"><span>Аванс</span><b>' + money(q.advance) + ' ₽</b></div><div class="mute sm">' + cat.advance.serv + '% услуг + ' + cat.advance.mat + '% материалов</div>' +
			'<div class="soR"><span>Доплата</span><b>' + money(q.rest) + ' ₽</b></div><div class="soR"><span>Оплачено</span><span>' + money(q.paid) + '</span></div><div class="soR"><span>Долг</span><span class="' + (q.debt > 0.009 ? 'bad' : '') + '">' + money(q.debt) + '</span></div></div>' +
			'<details class="sgSide"><summary>Условия производства</summary>' +
			'<label class="soR"><span>Загрузка</span><select id="soLoad">' + opt(O.LOADS, t.load) + '</select></label>' +
			'<label class="soR"><span>Срок, раб. дней</span><input class="soN" id="soDays" value="' + esc(t.days) + '"></label>' +
			'<label class="soR"><span>Хранение: бесплатно дней</span><input class="soN" id="soFree" value="' + esc(t.freeDays) + '"></label>' +
			'<label class="soR"><span>дальше, ₽/сут</span><input class="soN" id="soStor" value="' + esc(t.storage) + '"></label></details>' +
			'<div class="soBtns"><button id="soCheckOrder">Проверить заказ</button></div>' + /* STHGroup: диагностика до отправки КП */
			'<div class="soBtns"><button class="primary" id="soKp">КП в PDF</button><button id="soInv">Счёт в PDF</button></div>' +
			'<div class="soBtns"><button id="soCat">Справочник и цены…</button><button id="soPrice">Прайс для клиента</button></div>';
	}
	/* STHGroup: композиция «Центр заказа», штатные формы и идентификаторы сохранены. */
	X.orderHeroHtml = function (o, c) {
		return '<div class="sgHero"><div><button id="sgAllOrders" class="link">← Все заказы</button><h1>Заказ ' + esc(o.no) + '</h1><div class="mute">' + esc(c ? c.name : 'Клиент не выбран') + ' · Изделий: ' + o.items.length + '</div></div>' +
			'<ol class="sgFlow" aria-label="Этапы заказа">' + O.stages(X.book).map(function (s) { return '<li' + (s[0] === o.status ? ' aria-current="step"' : '') + '>' + esc(s[1]) + '</li>'; }).join('') + '</ol></div>';
	};
	X.orderCenterHtml = function (o, q) {
		if (X.productionHtml && X.productionTabs.some(function (t) { return t[0] === X.tab; })) return X.productionHtml(o, q);
		if (X.tab === 'items') return '<details class="sgSection" open><summary>Изделия заказа</summary><div class="sgSectionBody">' + itemsHtml(o) + '</div></details>';
		if (X.tab === 'pay') return '<details class="sgSection" open><summary>Оплаты заказа</summary><div class="sgSectionBody">' + payHtml(o, q) + '</div></details>';
		var products = o.items.map(function (it, i) {
			return '<div class="sgProduct"><div><b>' + esc(it.title || U.stemOf(it.path)) + '</b><small>' + (it.snap ? it.snap.parts + ' деталей · ' + it.snap.sheets.reduce(function (n, m) { return n + m.n; }, 0) + ' листов' : 'Расчёт изделия ещё не выполнен') + '</small></div><button data-iop="' + i + '">Модель</button></div>';
		}).join('') || '<p class="mute">Изделия ещё не добавлены.</p>';
		return '<details class="sgSection" open><summary>Изделия (' + o.items.length + ')<span>Модель и раскрой</span></summary><div class="sgSectionBody">' + products + '<div class="soRow"><button data-tb="items">Состав заказа…</button></div></div></details>' +
			'<details class="sgSection" open><summary>Работы и материалы<span>' + money(q.total) + ' ₽</span></summary><div class="sgSectionBody">' + calcHtml(o, q) + '</div></details>' +
			'<details class="sgSection" open><summary>Оплаты<span>Оплачено ' + money(q.paid) + ' ₽</span></summary><div class="sgSectionBody sgPayment"><span>Долг: ' + money(q.debt) + ' ₽</span><button data-tb="pay">Внести оплату…</button></div></details>';
	};
	X.render = async function () {
		var host = $('orders'); if (!host) return;
		if (!X.book) await X.load();
		if (!X.book) { host.innerHTML = '<div class="soEmpty">Нет папки для заказов.</div>'; return; }
		X.snapOpen();
		if (S().section === 'clients') { host.classList.remove('sgOrderOpen'); return X.renderClients(); }
		if (!O.order(X.book, X.cur)) X.cur = X.book.orders[0] ? X.book.orders[0].id : '';
		var o = O.order(X.book, X.cur), b = X.book;
		host.classList.toggle('sgOrderOpen', !!o && X.sgFocusOrder !== false);
		var left = '<aside class="soL"><div class="sec">Заказы</div><button class="primary soNew" id="soNew">+ Новый заказ</button>' +
			'<input type="search" id="soQ" placeholder="Поиск: номер, клиент, изделие" value="' + esc(X.q) + '"><select id="soSt"><option value="">все статусы</option>' + opt(O.stages(X.book), X.st) + '</select><div id="soList">' + listHtml() + '</div></aside>';
		if (!o) { host.innerHTML = left + '<section class="soC"><div class="soEmpty">Выберите заказ или создайте новый.</div></section><aside class="soS"><div class="soBtns"><button id="soCat">Справочник и цены…</button><button id="soPrice">Прайс для клиента</button></div><p class="mute sm">Файл заказов: ' + esc(X.path) + '</p></aside>'; return; }
		var q = O.calc(b, o), c = O.client(b, o.clientId);
		var clients = '<option value="">— клиент —</option>' + b.clients.map(function (x) { return '<option value="' + x.id + '"' + (x.id === o.clientId ? ' selected' : '') + '>' + esc(x.name) + '</option>'; }).join('') + '<option value="__new">＋ новый клиент…</option>';
		var tabs = [['calc', 'Расчёт'], ['items', 'Изделия (' + o.items.length + ')'], ['pay', 'Оплаты' + (o.payments.length ? ' (' + o.payments.length + ')' : '')]];
		if (X.productionTabs) tabs = tabs.concat(X.productionTabs); // STHGroup: производственные вкладки заказа
		var center = '<section class="soC" data-sg-order="' + esc(o.id) + '" data-sg-tab="' + esc(X.tab) + '">' + X.orderHeroHtml(o, c) + '<details class="sgOrderMeta"><summary>Данные заказа · ' + esc(O.statusName(o.status, b)) + '</summary><div class="sgOrderMetaBody"><div class="soHead"><input id="soNo" class="soNo" aria-label="Номер заказа" value="' + esc(o.no) + '"><select id="soCl" aria-label="Клиент">' + clients + '</select><input type="date" id="soDate" aria-label="Дата заказа" value="' + esc(o.date) + '"><select id="soStat" aria-label="Статус заказа">' + opt(O.stages(X.book), o.status) + '</select><button class="icon" id="soDel" title="Удалить заказ">✕</button></div>' +
			'<div class="mute sm">' + esc(c ? [c.phone, c.email].filter(Boolean).join(' · ') : '') + '</div>' +
			'<input id="soNote" class="soNote" aria-label="Комментарий к заказу" placeholder="Комментарий к заказу" value="' + esc(o.note || '') + '"></div></details>' +
			'<div class="tabs soTabs">' + tabs.map(function (t) { return '<button data-tb="' + t[0] + '"' + (X.tab === t[0] ? ' class="on"' : '') + '>' + t[1] + '</button>'; }).join('') + '</div>' +
			'<div class="soBody">' + X.orderCenterHtml(o, q) + '</div></section>';
		host.innerHTML = left + center + '<aside class="soS">' + (X.productionSideHtml && X.productionTabs.some(function (t) { return t[0] === X.tab; }) ? X.productionSideHtml(o, q) : sideHtml(o, q)) + '</aside>';
		X.dnd();
	};
	/* перетаскивание: строки расчёта (порядок — в заказе, он же в КП), изделия; столбцы таблиц */
	X.dnd = function () {
		var host = $('orders'), D = window.STHDrag; if (!host || !D) return;
		D.rows(host, { rows: 'tr.soLn, tr.soItR', drop: function (src, t, after, from, to) {
			var o = cur(); if (!o) return;
			var g = src.getAttribute('data-dg');
			if (g === 'items') { D.move(o.items, from, to); changed(); return; }
			var keys = Array.prototype.filter.call(host.querySelectorAll('tr.soLn'), function (r) { return r.getAttribute('data-dg') === g; }).map(function (r) { return r.getAttribute('data-lk'); });
			D.move(keys, from, to);
			(o.lineOrder = o.lineOrder || {})[g] = keys;
			changed();
		} });
		[['table.soItems', 'soItems'], ['table.soPay', 'soPay'], ['table.soClO', 'soClO']].forEach(function (x) { var t = host.querySelector(x[0]); if (t) D.cols(t, x[1], function () { X.render(); }); });
	};

	/* ------------------------------- клиенты --------------------------------- */
	X.renderClients = function () {
		var host = $('orders'), b = X.book, q = String(X.q || '').toLowerCase();
		if (!O.client(b, X.client)) X.client = b.clients[0] ? b.clients[0].id : '';
		var list = b.clients.filter(function (c) { return !q || [c.name, c.phone, c.email].join(' ').toLowerCase().indexOf(q) >= 0; }).map(function (c) {
			var os = b.orders.filter(function (o) { return o.clientId === c.id; }), debt = os.reduce(function (a, o) { var t = orderSum(o); return a + (t.paid > 0 ? Math.max(0, t.debt) : 0); }, 0);
			return '<div class="soIt' + (c.id === X.client ? ' on' : '') + '" data-c="' + c.id + '"><b>' + esc(c.name) + '</b><small>' + esc(c.phone || '') + ' · заказов ' + os.length + (debt > 0.009 ? ' · долг ' + money(debt) : '') + '</small></div>';
		}).join('') || '<p class="mute">Клиентов нет. Они появляются сами из окна выгрузки или кнопкой «+ Клиент».</p>';
		var c = O.client(b, X.client), center = '<div class="soEmpty">Выберите клиента.</div>';
		if (c) {
			var os = b.orders.filter(function (o) { return o.clientId === c.id; });
			center = '<div class="soHead"><input id="scName" class="soNo" style="width:360px" value="' + esc(c.name) + '"><button class="icon" id="scDel" title="Удалить клиента">✕</button></div>' +
				'<div class="soForm"><label>Телефон<input id="scPhone" value="' + esc(c.phone) + '"></label><label>Почта<input id="scEmail" value="' + esc(c.email) + '"></label><label class="w">Примечание<input id="scNote" value="' + esc(c.note) + '"></label></div>' +
				'<div class="soBh">Заказы клиента</div><table class="grid soClO"><thead><tr><th>№</th><th>Дата</th><th>Изделия</th><th>Статус</th><th class="r">Сумма</th><th class="r">Оплачено</th><th class="r">Долг</th></tr></thead><tbody>' +
				(os.map(function (o) { var t = orderSum(o); return '<tr class="hov" data-go="' + o.id + '"><td><b>' + esc(o.no) + '</b></td><td>' + esc(O.ruDate(o.date)) + '</td><td>' + (o.items.map(function (i, k) { return '<a href="#" class="soItL" data-go="' + o.id + '" data-gi="' + k + '" title="Открыть модель">' + esc(i.title || U.stemOf(i.path)) + '</a>'; }).join(', ') || '<span class="mute">нет</span>') + '</td><td>' + esc(O.statusName(o.status, b)) + '</td><td class="r">' + money(t.total) + '</td><td class="r">' + money(t.paid) + '</td><td class="r">' + money(t.debt) + '</td></tr>'; }).join('') || '<tr><td colspan="7" class="mute">Заказов нет</td></tr>') + '</tbody></table>' +
				'<div class="soRow"><button id="scOrder" class="primary">+ Заказ для клиента</button></div>';
		}
		host.innerHTML = '<aside class="soL"><div class="sec">Клиенты</div><button class="primary soNew" id="scNew">+ Клиент</button><input type="search" id="soQ" placeholder="Поиск: имя, телефон" value="' + esc(X.q) + '"><div id="soList">' + list + '</div></aside><section class="soC">' + center + '</section>';
		X.dnd();
	};

	/* ------------------------------ действия --------------------------------- */
	function cur() { return O.order(X.book, X.cur); }
	async function pickBmk() { var s = S(); return U.pick({ kind: 'open', title: 'Изделие заказа — файл проекта', dir: s.set.lastDir || s.boot.docs, filters: [{ name: 'Проект STHGroup', ext: ['bmk'] }] }); }
	async function addItem(o) {
		var p = await pickBmk(); if (!p) return;
		var it = O.putItem(o, p, null); it.title = it.title || U.stemOf(p);
		try { await X.toFolder(o, it); } catch (e) { U.toast('Модель не скопирована в папку заказа: ' + e.message, { bad: true }); }
		p = it.path;
		U.toast('Считаю изделие «' + U.stemOf(p) + '»…', { ms: 4000 });
		try { it.snap = await X.snapFile(p); if (it.snap && !it.title) it.title = it.snap.title; } catch (e) { U.error(e); }
		changed();
	}
	async function recalcAll(o) {
		for (var i = 0; i < o.items.length; i++) { try { o.items[i].snap = await X.snapFile(o.items[i].path); } catch (e) { U.toast('«' + U.baseOf(o.items[i].path) + '»: ' + e.message, { bad: true }); } }
		changed(); U.toast('Изделия заказа пересчитаны.');
	}
	async function newClient() {
		var v = await U.modal({ title: 'Новый клиент', width: 460, body: '<div class="form"><label>Имя или компания</label><input type="text" id="ncN" autofocus><label>Телефон</label><input type="text" id="ncP"><label>Почта</label><input type="text" id="ncE"></div>',
			buttons: [{ label: 'Отмена', value: null }, { label: 'Добавить', primary: true, run: function (m) { var n = m.querySelector('#ncN').value.trim(); if (!n) { U.toast('Впишите имя'); return false; } return { name: n, phone: m.querySelector('#ncP').value.trim(), email: m.querySelector('#ncE').value.trim() }; } }] });
		return v ? O.addClient(X.book, v) : null;
	}
	function onClick(e) {
		var t = e.target, o = cur(), d;
		if ((d = t.closest('[data-o]'))) { X.cur = d.dataset.o; X.sgFocusOrder = true; X.render(); X.openModels(O.order(X.book, X.cur)).catch(U.error); return; }
		if ((d = t.closest('[data-c]'))) { X.client = d.dataset.c; X.render(); return; }
		if ((d = t.closest('[data-gi]'))) { var oo = O.order(X.book, d.dataset.go), ii = Number(d.dataset.gi); X.cur = oo ? oo.id : X.cur; X.openModels(oo, ii).then(function (ok) { if (ok) go('model'); }).catch(U.error); return; }
		if ((d = t.closest('[data-go]'))) { X.cur = d.dataset.go; X.sgFocusOrder = true; go('orders'); X.openModels(O.order(X.book, X.cur)).catch(U.error); return; }
		if ((d = t.closest('[data-tb]'))) { X.tab = d.dataset.tb; X.render(); return; }
		switch (t.id) {
			case 'sgAllOrders': X.sgFocusOrder = false; X.render(); return;
			case 'soNew': X.sgFocusOrder = true; X.cur = O.addOrder(X.book, {}).id; X.tab = 'items'; changed(); return;
			case 'scNew': newClient().then(function (c) { if (c) { X.client = c.id; changed(); } }); return;
			case 'scOrder': X.sgFocusOrder = true; X.cur = O.addOrder(X.book, { clientId: X.client }).id; X.tab = 'items'; X.save(); go('orders'); return;
			case 'scDel': (async function () { var c = O.client(X.book, X.client); if (!c) return; var n = X.book.orders.filter(function (x) { return x.clientId === c.id; }).length; if (!(await U.confirm('Удалить клиента', 'Удалить «' + c.name + '»?' + (n ? ' Его заказы (' + n + ') останутся без клиента.' : ''), 'Удалить'))) return; X.book.clients = X.book.clients.filter(function (x) { return x.id !== c.id; }); X.book.orders.forEach(function (x) { if (x.clientId === c.id) x.clientId = ''; }); X.client = ''; changed(); })(); return;
			case 'soDel': (async function () { if (!o || !(await U.confirm('Удалить заказ', 'Удалить заказ ' + o.no + '? Файлы изделий не удаляются.', 'Удалить'))) return; X.book.orders = X.book.orders.filter(function (x) { return x.id !== o.id; }); X.cur = ''; changed(); })(); return;
			case 'soAddItem': if (o) addItem(o); return;
			case 'soRecalc': if (o) recalcAll(o); return;
			case 'soExtra': if (o) { (o.extra = o.extra || []).push({ name: '', unit: 'шт', qty: 1, price: 0 }); changed(); setTimeout(function () { var a = document.querySelectorAll('#orders [data-xn]'); if (a.length) a[a.length - 1].focus(); }, 30); } return;
			case 'soPadd': if (o) { var a = O.num($('soPa').value); if (!(a > 0)) { U.toast('Впишите сумму'); return; } o.payments.push({ date: $('soPd').value || O.today(), amount: a, note: $('soPn').value.trim() }); changed(); } return;
			case 'soPadv': if (o) { $('soPa').value = String(O.calc(X.book, o).advance).replace('.', ','); $('soPn').value = 'аванс'; } return;
			case 'soPrest': if (o) { $('soPa').value = String(Math.max(0, O.calc(X.book, o).debt)).replace('.', ','); $('soPn').value = 'доплата'; } return;
			case 'soKp': if (o) X.doc(o, 'kp'); return;
			case 'soInv': if (o) X.doc(o, 'inv'); return;
			case 'soCat': X.catalog(); return;
			case 'soPrice': X.priceList().catch(U.error); return;
		}
		if (!o) return;
		if ((d = t.closest('[data-iop]'))) { var it = o.items[Number(d.dataset.iop)]; if (it) window.App.openPath(it.path).then(function (ok) { if (ok) go('model'); }); return; }
		if ((d = t.closest('[data-irc]'))) { var it2 = o.items[Number(d.dataset.irc)]; X.snapFile(it2.path).then(function (sn) { it2.snap = sn; changed(); }, U.error); return; }
		if ((d = t.closest('[data-irm]'))) { o.items.splice(Number(d.dataset.irm), 1); changed(); return; }
		if ((d = t.closest('[data-gopen]'))) { X.open[d.dataset.gopen] = !X.open[d.dataset.gopen]; X.render(); return; }
		if ((d = t.closest('[data-xrm]'))) { o.extra.splice(Number(d.dataset.xrm.slice(2)), 1); changed(); return; }
		if ((d = t.closest('[data-prm]'))) { o.payments.splice(Number(d.dataset.prm), 1); changed(); return; }
	}
	function onChange(e) {
		var t = e.target, o = cur(), d;
		if (t.id === 'soQ') { X.q = t.value; var l = $('soList'); if (l) { if (S().section === 'clients') { X.renderClients(); var q2 = $('soQ'); q2.focus(); q2.setSelectionRange(q2.value.length, q2.value.length); } else l.innerHTML = listHtml(); } return; }
		if (e.type === 'input') return;
		if (t.id === 'soSt') { X.st = t.value; X.render(); return; }
		var c = O.client(X.book, X.client);
		if (c && /^sc(Name|Phone|Email|Note)$/.test(t.id)) { c[{ scName: 'name', scPhone: 'phone', scEmail: 'email', scNote: 'note' }[t.id]] = t.value.trim(); changed(); return; }
		if (!o) return;
		if (t.id === 'soCl') { if (t.value === '__new') { newClient().then(function (nc) { if (nc) o.clientId = nc.id; changed(); }); return; } o.clientId = t.value; changed(); return; }
		var simple = { soNo: 'no', soDate: 'date', soStat: 'status', soNote: 'note' };
		if (simple[t.id]) { o[simple[t.id]] = t.value; changed(); return; }
		if (t.id === 'soCx') { o.complex = t.checked ? 1 : 0; changed(); return; }
		if (t.id === 'soUrg') { o.urgent = t.checked ? 1 : 0; changed(); return; }
		if (t.id === 'soMk') { o.markup = t.value.trim() === '' ? '' : O.num(t.value); changed(); return; }
		var tk = { soLoad: 'load', soDays: 'days', soFree: 'freeDays', soStor: 'storage' };
		if (tk[t.id]) { o.terms[tk[t.id]] = t.id === 'soLoad' ? t.value : O.num(t.value); changed(); return; }
		if ((d = t.closest('[data-ck]'))) { var k = d.dataset.ck; if (k === 'm:mat') o.ownMat = t.checked ? 1 : 0; else if (k === 'm:fit') o.ownFit = t.checked ? 1 : 0; else (o.svc[k] = o.svc[k] || {}).on = t.checked ? 1 : 0; changed(); return; }
		if ((d = t.closest('[data-xn]')) || (d = t.closest('[data-xu]'))) { var xx = o.extra[Number((d.dataset.xn || d.dataset.xu).slice(2))]; if (xx) xx[d.dataset.xn ? 'name' : 'unit'] = t.value.trim(); changed(); return; }
		if ((d = t.closest('[data-pr]')) || (d = t.closest('[data-qt]'))) {
			var key = d.dataset.pr || d.dataset.qt, f = d.dataset.pr ? 'price' : 'qty', v = t.value.trim() === '' ? '' : O.num(t.value);
			if (key.indexOf('x:') === 0) { var x = o.extra[Number(key.slice(2))]; if (x) x[f] = v; }
			else if (key.indexOf('s:') === 0) { /* мелкие детали — цена из справочника */ X.book.cat.small[key === 's:edge' ? 'edge' : 'drill'] = v; }
			else (o.svc[key] = o.svc[key] || {})[f] = v;
			changed(); return;
		}
		if ((d = t.closest('[data-it]'))) { var it = o.items[Number(d.dataset.it)]; if (it) { it.title = t.value.trim(); changed(); } }
	}

	/* ------------------------------ справочник ------------------------------- */
	X.catalog = async function () {
		var b = X.book, c = JSON.parse(JSON.stringify(b.cat)), folder = X.folder();
		var tabs = [['works', 'Работа за лист'], ['small', 'Мелкие детали'], ['svc', 'Услуги'], ['grp', 'Доп. работы и фасады'], ['money', 'Скидка, наценка, аванс'], ['terms', 'Условия'], ['firm', 'Компания'], ['dir', 'Папка заказов']];
		function inp(id, label, v, w) { return '<label class="fl" style="width:' + (w || 200) + 'px">' + label + '<input type="text" id="' + id + '" value="' + esc(v === undefined ? '' : v) + '"></label>'; }
		function th(v) { return v === undefined || v === null ? '' : v; }
		/* STHGroup: отметка снимается только правкой цены или явным подтверждением. */
		function sample(r) { return O.isSamplePrice(r) ? '<span class="sthSampleBadge">Образец' + (r.sampleSource === 'FOXY' ? ' FOXY' : '') + '</span><button type="button" class="sthPriceConfirm">Подтвердить свою цену</button>' : ''; }
		function meta(r, tr, price) { return O.priceMeta(r, price, tr.querySelector('.cp').dataset.verified === '1'); }
		function works() { return '<table class="grid" id="ctW"><thead><tr><th></th><th>Вид работы (строка КП)</th><th>Цена за лист, ₽</th><th>Материалы — слова в названии через запятую</th><th>Толщина от, мм</th><th>до, мм</th><th>Примечание для прайса</th><th></th></tr></thead><tbody>' + c.sheetWorks.map(function (w, i) { return '<tr data-i="' + i + '" data-id="' + esc(w.id || '') + '" data-dg="w"><td>' + window.STHDrag.handle() + '</td><td><input class="cn" value="' + esc(w.name) + '" style="width:290px"></td><td><input class="cp" value="' + esc(w.price) + '" style="width:80px">' + sample(w) + '</td><td><input class="cm" value="' + esc(w.match) + '" style="width:220px"></td><td><input class="ct1" value="' + esc(th(w.thMin)) + '" style="width:60px"></td><td><input class="ct2" value="' + esc(th(w.thMax)) + '" style="width:60px"></td><td><input class="cnt" value="' + esc(w.note || '') + '" style="width:170px" placeholder="распил / кромка"></td><td><button class="icon" data-wrm="' + i + '">✕</button></td></tr>'; }).join('') + '</tbody></table><button id="ctWadd">+ Вид работы</button><p class="mute">Каждый лист раскроя идёт в первый вид работы, у которого подходят и слово в названии материала, и толщина (пустое — любое). Строка без слов и толщины — для всех остальных листов.</p>'; }
		function grp() {
			return (c.groups || []).map(function (g, gi) {
				return '<fieldset class="ctG" data-g="' + gi + '"><legend><input class="cgt" value="' + esc(g.title) + '" style="width:280px"> <input class="cgn" value="' + esc(g.note || '') + '" placeholder="пояснение (в КП под заголовком)" style="width:380px"> <button class="icon" data-grm="' + gi + '" title="Убрать раздел">✕</button></legend>' +
					'<table class="grid ctGt"><thead><tr><th></th><th>Работа</th><th>Единица</th><th>Цена, ₽</th><th>Примечание для прайса</th><th></th></tr></thead><tbody>' + (g.rows || []).map(function (r, ri) { return '<tr data-dg="g' + gi + '" data-id="' + esc(r.id || '') + '"><td>' + window.STHDrag.handle() + '</td><td><input class="cn" value="' + esc(r.name) + '" style="width:460px"></td><td><input class="cu" value="' + esc(r.unit || '') + '" list="ctUnits" style="width:80px"></td><td><input class="cp" value="' + esc(r.price) + '" style="width:90px">' + sample(r) + '</td><td><input class="cnt" value="' + esc(r.note || '') + '" style="width:170px"></td><td><button class="icon" data-rrm="' + gi + ':' + ri + '">✕</button></td></tr>'; }).join('') + '</tbody></table>' +
					'<button data-radd="' + gi + '">+ Строка</button></fieldset>';
			}).join('') + '<datalist id="ctUnits"><option value="шт"><option value="м²"><option value="м.п."><option value="за лист"><option value="за заказ"></datalist><button id="ctGadd">+ Раздел</button>' +
				'<p class="mute">Разделы появляются в расчёте заказа: количество (шт, м², м.п.) вписывается в заказе, в КП попадают только строки с количеством.</p>';
		}
		function svc() { return '<table class="grid" id="ctS"><thead><tr><th></th><th>Услуга</th><th>Единица</th><th>Цена (для % — процент)</th><th>По умолчанию</th><th>Примечание для прайса</th><th></th></tr></thead><tbody>' + c.services.map(function (s, i) { return '<tr data-i="' + i + '" data-id="' + esc(s.id || '') + '" data-dg="s"><td>' + window.STHDrag.handle() + '</td><td><input class="cn" value="' + esc(s.name) + '" style="width:380px"></td><td><select class="cu">' + opt(O.UNITS, s.unit) + '</select></td><td><input class="cp" value="' + esc(s.price) + '" style="width:90px">' + sample(s) + '</td><td><input type="checkbox" class="co"' + (s.on ? ' checked' : '') + '> включена</td><td><input class="cnt" value="' + esc(s.note || '') + '" style="width:170px"></td><td><button class="icon" data-srm="' + i + '">✕</button></td></tr>'; }).join('') + '</tbody></table><button id="ctSadd">+ Услуга</button>'; }
		var body = '<div class="tabs">' + tabs.map(function (t, i) { return '<button data-ct="' + t[0] + '"' + (i ? '' : ' class="on"') + '>' + t[1] + '</button>'; }).join('') + '</div>' +
			'<div class="pg" data-cp="works">' + works() + '</div>' +
			'<div class="pg" data-cp="small" hidden><div class="row">' + inp('ctLim', 'Деталь мелкая, если длина или ширина меньше, мм', c.small.limit, 340) + '</div><div class="row">' + inp('ctSe', 'Кромление мелкой детали, ₽ за деталь', c.small.edge, 280) + inp('ctSd', 'Присадка мелкой детали, ₽ за деталь', c.small.drill, 280) + '</div></div>' +
			'<div class="pg" data-cp="svc" hidden>' + svc() + '</div>' +
			'<div class="pg" data-cp="grp" hidden>' + grp() + '</div>' +
			'<div class="pg" data-cp="money" hidden><div class="row">' + inp('ctCx', 'Скидка за комплекс, % от услуг', c.complexPct, 230) + inp('ctCxT', 'Текст скидки в КП', c.complexText, 460) + '</div><div class="row">' + inp('ctMk', 'Наценка на материалы и фурнитуру, %', c.markup, 260) + inp('ctMkT', 'Пояснение в КП', c.markupText, 430) + '</div><div class="row">' + inp('ctAs', 'Аванс: % от услуг', c.advance.serv, 200) + inp('ctAm', 'Аванс: % от материалов', c.advance.mat, 200) + '</div><div class="row">' + inp('ctPre', 'Префикс номера заказа', c.prefix, 200) + inp('ctNext', 'Следующий номер', b.next, 200) + inp('ctKpD', 'КП действительно, дней', c.kpDays || '', 180) + '</div><div class="row">' + inp('ctUt', 'Срочный заказ — текст', c.urgentText, 230) + inp('ctUp', 'Срочно: +% к услугам', c.urgentPct, 180) + inp('ctUd', 'Срочно: срок, раб. дней', c.urgentDays, 180) + '</div></div>' +
			'<div class="pg" data-cp="terms" hidden><div class="row"><label class="fl" style="width:200px">Загрузка по умолчанию<select id="ctLd">' + opt(O.LOADS, c.terms.load) + '</select></label>' + inp('ctDays', 'Срок, раб. дней', c.terms.days, 150) + inp('ctFree', 'Бесплатное хранение, дней', c.terms.freeDays, 200) + inp('ctSt', 'Хранение дальше, ₽/сут', c.terms.storage, 180) + '</div>' + inp('ctTi', 'Заголовок раздела в КП и счёте', c.terms.title || 'Важно знать', 300) + '<label class="fl">Текст раздела — каждый пункт с новой строки; подстановки {аванс} {загрузка} {срок} {день} {хранение}<textarea id="ctTx" rows="6">' + esc(c.terms.text) + '</textarea></label></div>' +
			'<div class="pg" data-cp="firm" hidden><div class="row">' + inp('cfN', 'Название', c.company.name, 300) + inp('cfP', 'Телефон', c.company.phone, 200) + inp('cfE', 'Почта', c.company.email, 220) + '</div><div class="row">' + inp('cfA', 'Адрес', c.company.address, 520) + inp('cfS', 'Сайт', c.company.site, 200) + '</div><div class="row">' + inp('cfI', 'ИНН / КПП / ОГРН', c.company.inn, 520) + inp('cfX', 'Исполнитель (ФИО)', c.company.executor, 200) + '</div><label class="fl">Реквизиты для оплаты (в счёте)<textarea id="cfB" rows="3">' + esc(c.company.bank) + '</textarea></label></div>' +
			'<div class="pg" data-cp="dir" hidden><p>Заказы, клиенты и этот справочник — один файл «' + esc(O.FILE) + '» в папке. Папка может быть общей (Яндекс Диск, сетевая) — тогда заказы одни на несколько компьютеров.</p><div class="pathrow"><input type="text" id="ctDir" value="' + esc(folder) + '" style="width:600px"><button id="ctDirPick">Выбрать…</button></div><p class="mute">По умолчанию — папка базы материалов.</p></div>';
		function readTables(m) {
			var thv = function (x) { x = x.value.trim(); return x === '' ? '' : O.num(x); };
			var ow = c.sheetWorks, os = c.services; c.sheetWorks = []; m.querySelectorAll('#ctW tbody tr').forEach(function (tr, i) { c.sheetWorks.push(Object.assign({ id: tr.getAttribute('data-id') || O.id('w'), name: tr.querySelector('.cn').value.trim() || 'Вид работы', price: O.num(tr.querySelector('.cp').value), match: tr.querySelector('.cm').value.trim(), thMin: thv(tr.querySelector('.ct1')), thMax: thv(tr.querySelector('.ct2')), note: tr.querySelector('.cnt').value.trim() }, meta(ow.filter(function (r) { return r.id === tr.dataset.id; })[0], tr, O.num(tr.querySelector('.cp').value)))); });
			var og = c.groups || []; c.groups = [];
			m.querySelectorAll('.ctG').forEach(function (fs, gi) {
				var g0 = og[gi] || {}, rows0 = g0.rows || [], g = { id: g0.id || O.id('g'), title: fs.querySelector('.cgt').value.trim() || 'Раздел', note: fs.querySelector('.cgn').value.trim(), rows: [] };
				fs.querySelectorAll('tbody tr').forEach(function (tr, ri) { var rid = tr.getAttribute('data-id'), r0 = rows0.filter(function (x) { return x.id === rid; })[0] || {}; g.rows.push(Object.assign({ id: rid || O.id('r'), name: tr.querySelector('.cn').value.trim() || 'Работа', unit: tr.querySelector('.cu').value.trim() || 'шт', price: O.num(tr.querySelector('.cp').value), note: tr.querySelector('.cnt').value.trim() }, meta(r0, tr, O.num(tr.querySelector('.cp').value)))); });
				c.groups.push(g);
			});
			c.services = []; m.querySelectorAll('#ctS tbody tr').forEach(function (tr, i) { var s = (os.filter(function (x) { return x.id === tr.getAttribute('data-id'); })[0]) || {}; c.services.push(Object.assign({ id: s.id || O.id('s'), name: tr.querySelector('.cn').value.trim() || 'Услуга', unit: tr.querySelector('.cu').value, price: O.num(tr.querySelector('.cp').value), on: tr.querySelector('.co').checked ? 1 : 0, note: tr.querySelector('.cnt').value.trim() }, meta(s, tr, O.num(tr.querySelector('.cp').value)))); });
		}
		var res = await U.modal({ title: 'Справочник: работы, услуги и цены', width: 980, cls: 'soCat', body: body,
			buttons: [{ label: 'Отмена', value: null }, { label: 'Сохранить', primary: true, run: function (m) {
				var g = function (id) { return m.querySelector('#' + id).value; };
				readTables(m);
				c.small = { limit: O.num(g('ctLim'), 60), edge: O.num(g('ctSe')), drill: O.num(g('ctSd')) };
				c.complexPct = O.num(g('ctCx')); c.complexText = g('ctCxT'); c.markup = O.num(g('ctMk')); c.markupText = g('ctMkT'); c.advance = { serv: O.num(g('ctAs'), 70), mat: O.num(g('ctAm'), 100) }; c.prefix = g('ctPre');
				c.kpDays = O.num(g('ctKpD')); c.urgentText = g('ctUt').trim() || 'Срочный заказ'; c.urgentPct = O.num(g('ctUp'), 30); c.urgentDays = O.num(g('ctUd'), 3);
				c.terms = { load: g('ctLd'), days: O.num(g('ctDays'), 10), freeDays: O.num(g('ctFree'), 2), storage: O.num(g('ctSt'), 500), text: g('ctTx'), title: String(g('ctTi') || '').trim() || 'Важно знать' };
				c.company = { name: g('cfN'), phone: g('cfP'), email: g('cfE'), address: g('cfA'), site: g('cfS'), inn: g('cfI'), executor: g('cfX'), bank: g('cfB') };
				return { cat: c, next: Math.max(1, Math.round(O.num(g('ctNext'), b.next))), dir: g('ctDir').trim() };
			} }],
			onOpen: function (m) {
				m.addEventListener('input', function (e) { if (e.target.matches('.cp')) { e.target.dataset.verified = '1'; var cell = e.target.closest('td'); cell.querySelectorAll('.sthSampleBadge,.sthPriceConfirm').forEach(function (n) { n.remove(); }); } });
				/* перетаскивание строк справочника (порядок важен: лист идёт в первый подходящий вид работы) и столбцов */
				var D = window.STHDrag;
				D.rows(m, { rows: '#ctW tbody tr, #ctS tbody tr, .ctGt tbody tr', drop: function (src, t, after, from, to) {
					readTables(m);
					var g = src.getAttribute('data-dg');
					if (g === 'w') { D.move(c.sheetWorks, from, to); m.querySelector('[data-cp=works]').innerHTML = works(); }
					else if (g === 's') { D.move(c.services, from, to); m.querySelector('[data-cp=svc]').innerHTML = svc(); }
					else if (/^g\d+$/.test(g)) { D.move(c.groups[Number(g.slice(1))].rows, from, to); m.querySelector('[data-cp=grp]').innerHTML = grp(); }
				} });
				var wire = function () { [['#ctW', 'ctW'], ['#ctS', 'ctS']].forEach(function (x) { var t = m.querySelector(x[0]); if (t && !t._sthColsOn) D.cols(t, x[1], function () { readTables(m); m.querySelector('[data-cp=works]').innerHTML = works(); m.querySelector('[data-cp=svc]').innerHTML = svc(); }); }); m.querySelectorAll('.ctGt').forEach(function (t) { if (!t._sthColsOn) D.cols(t, 'ctGt'); }); };
				wire(); new MutationObserver(wire).observe(m.querySelector('.body'), { childList: true, subtree: true });
				m.addEventListener('click', function (e) {
					var t = e.target, d;
					if (t.closest('.sthPriceConfirm')) { var cell = t.closest('td'); cell.querySelector('.cp').dataset.verified = '1'; cell.querySelectorAll('.sthSampleBadge,.sthPriceConfirm').forEach(function (n) { n.remove(); }); return; }
					if ((d = t.closest('[data-ct]'))) { m.querySelectorAll('[data-ct]').forEach(function (x) { x.classList.toggle('on', x === d); }); m.querySelectorAll('[data-cp]').forEach(function (p) { p.hidden = p.dataset.cp !== d.dataset.ct; }); return; }
					if (t.id === 'ctWadd') { readTables(m); c.sheetWorks.push({ id: O.id('w'), name: 'Новый вид работы', price: 0, match: '' }); b.cat.sheetWorks = b.cat.sheetWorks.concat([c.sheetWorks[c.sheetWorks.length - 1]]); m.querySelector('[data-cp=works]').innerHTML = works(); return; }
					if (t.id === 'ctSadd') { readTables(m); c.services.push({ id: O.id('s'), name: 'Новая услуга', unit: 'order', price: 0, on: 0 }); b.cat.services = b.cat.services.concat([c.services[c.services.length - 1]]); m.querySelector('[data-cp=svc]').innerHTML = svc(); return; }
					var redrawG = function () { m.querySelector('[data-cp=grp]').innerHTML = grp(); };
					if (t.id === 'ctGadd') { readTables(m); c.groups.push({ id: O.id('g'), title: 'Новый раздел', note: '', rows: [] }); redrawG(); return; }
					if ((d = t.closest('[data-radd]'))) { readTables(m); c.groups[Number(d.dataset.radd)].rows.push({ id: O.id('r'), name: 'Новая работа', unit: 'шт', price: 0 }); redrawG(); return; }
					if ((d = t.closest('[data-rrm]'))) { readTables(m); var ab = d.dataset.rrm.split(':'); c.groups[Number(ab[0])].rows.splice(Number(ab[1]), 1); redrawG(); return; }
					if ((d = t.closest('[data-grm]'))) { readTables(m); c.groups.splice(Number(d.dataset.grm), 1); redrawG(); return; }
					if ((d = t.closest('[data-wrm]'))) { readTables(m); c.sheetWorks.splice(Number(d.dataset.wrm), 1); m.querySelector('[data-cp=works]').innerHTML = works(); return; }
					if ((d = t.closest('[data-srm]'))) { readTables(m); c.services.splice(Number(d.dataset.srm), 1); m.querySelector('[data-cp=svc]').innerHTML = svc(); return; }
					if (t.id === 'ctDirPick') { U.pick({ kind: 'folder', title: 'Папка для заказов', dir: m.querySelector('#ctDir').value }).then(function (p) { if (p) m.querySelector('#ctDir').value = p; }); }
				});
			} });
		if (!res) { X.book.cat = b.cat; return; }
		X.book.cat = res.cat; X.book.next = res.next;
		var s = S();
		if (res.dir && res.dir !== X.folder()) {
			var keep = X.book; s.set.sthOrdersDir = res.dir; window.App.saveSettings(true);
			var nb = await X.load(true);
			if (nb && !nb.orders.length && keep.orders.length) { X.book = keep; X.path = U.join(res.dir, O.FILE); U.toast('Заказы перенесены в новую папку.'); }
		}
		X.save(true); X.render();
	};

	/* ----------------------------- документы PDF ----------------------------- */
	var LOGO = '';
	async function logo() { if (LOGO) return LOGO; try { LOGO = await (await fetch('img/sth_logo.svg')).text(); } catch (e) { LOGO = '<b style="font-size:22px">STH<span style="color:#F26B1D">Group</span></b>'; } return LOGO; }
	/* Документы (оформление выбрано автором 03.11.2026): шапка — логотип и номер, «Исполнитель | Заказчик», полоса заказа;
	   счёт — вариант «A» (таблица, итог, сумма прописью, подписи сторон), КП — вариант «2» (блоки слева, карточка итога справа). */
	X.docHtml = function (o, q, kind, logoSvg) {
		var b = X.book, cat = b.cat, co = cat.company, cl = O.client(b, o.clientId), m = O.money, inv = kind === 'inv';
		var t = Object.assign({}, cat.terms, o.terms || {}), days = o.urgent ? (cat.urgentDays || 3) : t.days;
		var css = '@page{size:A4;margin:12mm 13mm 14mm}*{box-sizing:border-box}body{margin:0;font:11.5px/1.4 "Segoe UI",Arial,sans-serif;color:#23262B}.n{text-align:right;white-space:nowrap}.mu{color:#7a7d82}table{width:100%;border-collapse:collapse}' +
			'.top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #F26B1D;padding-bottom:12px}.top svg{width:180px;height:auto;display:block}.ttl{text-align:right}.ttl b{font-size:19px;display:block}.ttl span{font-size:12.5px}' +
			'.par{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin:13px 0}.par h4{margin:0 0 3px;font-size:9.5px;letter-spacing:.08em;color:#F26B1D;text-transform:uppercase}.par .v{font-size:12.5px;font-weight:700}.par .bk{white-space:pre-line;font-size:10.5px}' +
			'.ord{display:flex;flex-wrap:wrap;gap:8px 24px;background:#f5f3ef;border-radius:6px;padding:8px 13px;margin-bottom:10px}.ord span{color:#7a7d82;font-size:9.5px;display:block}.ord b{font-size:12px}' +
			'h3{font-size:10.5px;margin:13px 0 2px;color:#F26B1D;text-transform:uppercase;letter-spacing:.05em;display:flex;justify-content:space-between}h3 span{color:#23262B}' +
			'.it th{font-size:9.5px;color:#7a7d82;text-align:left;border-bottom:1.5px solid #23262B;padding:5px}.it th.n{text-align:right}.it td{border-bottom:1px solid #e6e6e6;padding:5px;vertical-align:top}.it small{display:block;color:#7a7d82;font-size:9.5px}.dc{color:#c0560f}' +
			'.wrap{display:grid;grid-template-columns:1fr 196px;gap:16px}.side{background:#f5f3ef;border-radius:9px;padding:12px;align-self:start;break-inside:avoid}.side .tt{font-size:18px;font-weight:800;margin:3px 0 8px}.side .r{display:flex;justify-content:space-between;gap:6px;padding:3px 0;border-bottom:1px dashed #ddd;font-size:10.5px}.side .r span:last-child{white-space:nowrap}' +
			'.pay{background:#23262B;color:#fff;border-radius:7px;padding:9px;margin-top:10px}.pay .r{border:0}.pay b{color:#F26B1D}.pay small{color:#aaa;font-size:9px}.w{font-size:9.5px;color:#55585e;margin-top:6px}' +
			'.tot{width:300px;margin:12px 0 0 auto}.tot>div{display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #eee}.tot .big{font-size:15px;font-weight:800;border-bottom:2px solid #F26B1D}.tot .w{display:block;border:0}' +
			'.cnd{background:#fff6ef;border-left:4px solid #F26B1D;padding:8px 13px;margin-top:14px;break-inside:avoid}.cnd ol{margin:4px 0 0;padding-left:18px}.cnd li{margin:2px 0}' +
			'.sig{display:flex;justify-content:space-between;margin-top:36px;break-inside:avoid}.sig div{width:45%;border-top:1px solid #23262B;padding-top:4px;font-size:10px;color:#7a7d82}';
		var items = o.items.map(function (i) { return i.title || U.stemOf(i.path); }).join(', ');
		var head = '<div class="top">' + logoSvg + '<div class="ttl"><b>' + (inv ? 'Счёт на оплату' : 'Коммерческое предложение') + ' № ' + esc(o.no) + '</b><span>от ' + esc(O.ruDate(o.date)) + (!inv && cat.kpDays ? ' · действительно ' + cat.kpDays + ' дн.' : '') + '</span></div></div>' +
			'<div class="par"><div><h4>Исполнитель</h4><div class="v">' + esc(co.name || 'STHGroup') + '</div>' + [co.inn, co.address, [co.phone, co.email].filter(Boolean).join(' · '), co.site].filter(Boolean).map(function (x) { return '<div>' + esc(x) + '</div>'; }).join('') + (inv && co.bank ? '<div class="bk mu">' + esc(co.bank) + '</div>' : '') + '</div>' +
			'<div><h4>Заказчик</h4>' + (cl ? '<div class="v">' + esc(cl.name) + '</div>' + [cl.phone, cl.email, cl.note].filter(Boolean).map(function (x) { return '<div>' + esc(x) + '</div>'; }).join('') : '<div class="mu">—</div>') + '</div></div>' +
			'<div class="ord"><div><span>Заказ</span><b>' + esc(o.no) + '</b></div>' + (items ? '<div><span>Изделия</span><b>' + esc(items) + '</b></div>' : '') + (q.sheets ? '<div><span>Листов</span><b>' + q.sheets + '</b></div>' : '') + (days ? '<div><span>Срок изготовления</span><b>до ' + esc(days) + ' раб. дн.' + (o.urgent ? ' (срочно)' : '') + '</b></div>' : '') + '</div>';
		var cols = '<colgroup><col><col style="width:58px"><col style="width:52px"><col style="width:76px"><col style="width:84px"></colgroup>';
		function qty(l) { return l.unit === '% от суммы' ? '' : String(l.qty).replace('.', ','); }
		function price(l) { return l.unit === '% от суммы' ? String(l.price).replace('.', ',') + '%' : m(l.price); }
		function rows(lines) { return lines.map(function (l) { var u = String(l.unit || ''), sub = ''; if (/, за лист$/.test(u)) { sub = u.replace(/, за лист$/, ''); u = 'лист'; } u = u.replace(/^за /, ''); return '<tr><td>' + esc(l.name) + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</td><td class="mu">' + esc(u === '% от суммы' ? '' : u) + '</td><td class="n">' + qty(l) + '</td><td class="n">' + price(l) + '</td><td class="n">' + m(l.sum) + '</td></tr>'; }).join(''); }
		var sign = '<div class="sig"><div>Исполнитель' + (co.executor ? ' / ' + esc(co.executor) : '') + '</div><div>Заказчик / ______________</div></div>';
		if (inv) {
			var all = [];
			q.blocks.forEach(function (bk) { bk.lines.forEach(function (l) { if ((!l.check || l.on) && l.sum) all.push(l); }); });
			q.matLines.forEach(function (l) { if (l.on && l.sum) all.push(l); });
			var debt = Math.max(0, q.debt);
			return '<!doctype html><html><head><meta charset="utf-8"><style>' + css + '</style></head><body>' + head +
				'<table class="it"><colgroup><col style="width:28px"><col><col style="width:58px"><col style="width:52px"><col style="width:76px"><col style="width:84px"></colgroup><thead><tr><th>№</th><th>Наименование</th><th>Ед.</th><th class="n">Кол-во</th><th class="n">Цена, ₽</th><th class="n">Сумма, ₽</th></tr></thead><tbody>' +
				all.map(function (l, i) { return '<tr><td>' + (i + 1) + '</td>' + rows([l]).slice(4); }).join('') +
				(q.discount ? '<tr><td></td><td class="dc">' + esc(cat.complexText) + ' (' + cat.complexPct + '% от услуг)</td><td></td><td></td><td></td><td class="n dc">−' + m(q.discount) + '</td></tr>' : '') +
				(q.urgent ? '<tr><td></td><td>' + esc(cat.urgentText || 'Срочный заказ') + ' (+' + cat.urgentPct + '% к услугам)</td><td></td><td></td><td></td><td class="n">' + m(q.urgent) + '</td></tr>' : '') + '</tbody></table>' +
				'<div class="tot"><div><span>Итого</span><b>' + m(q.total) + ' ₽</b></div><div><span>Оплачено</span><span>' + m(q.paid) + ' ₽</span></div><div class="big"><span>К оплате</span><span>' + m(debt) + ' ₽</span></div><div class="w">' + esc(O.words(debt)) + '</div>' +
				(q.paid < q.advance ? '<div class="mu"><span>Аванс для запуска</span><span>' + m(q.advance) + ' ₽</span></div>' : '') + '</div>' + sign + '</body></html>';
		}
		var body = '';
		q.blocks.forEach(function (bk) {
			var lines = bk.lines.filter(function (l) { return (!l.check || l.on) && !(l.extra && !l.name && !l.sum) && !(l.opt && !l.qty); });
			if (!lines.length) return;
			body += '<h3>' + esc(bk.title) + '<span>' + m(bk.sum + (bk.id === 'svc' ? q.pctSum : 0)) + ' ₽</span></h3><table class="it">' + cols + '<thead><tr><th>Работа</th><th>Ед.</th><th class="n">Кол-во</th><th class="n">Цена, ₽</th><th class="n">Сумма, ₽</th></tr></thead><tbody>' + rows(lines) + '</tbody></table>';
		});
		var ml = q.matLines.filter(function (l) { return l.on; });
		if (ml.length) body += '<h3>Материалы и фурнитура<span>' + m(q.mats) + ' ₽</span></h3><table class="it">' + cols + '<thead><tr><th>Позиция</th><th></th><th class="n">Кол-во</th><th class="n">Цена, ₽</th><th class="n">Сумма, ₽</th></tr></thead><tbody>' + rows(ml) + '</tbody></table><div class="mu" style="font-size:10px;margin-top:3px">Материал можно привезти свой или купить через нас: ' + esc(cat.markupText) + '.</div>';
		if (q.matList.length) body += '<h3>Материалы в заказе</h3><table class="it"><tbody>' + q.matList.map(function (x) { return '<tr><td>' + esc(x.name) + '</td><td class="mu">' + esc(x.th ? P.dim(x.th) + ' мм' : '') + '</td><td class="n">' + x.n + ' л</td></tr>'; }).join('') + '</tbody></table>';
		var side = '<div class="side"><div class="mu">Итого по заказу</div><div class="tt">' + m(q.total) + ' ₽</div><div class="r"><span>Услуги</span><span>' + m(q.serv) + '</span></div>' +
			(q.discount ? '<div class="r dc"><span>' + esc(cat.complexText) + ' ' + cat.complexPct + '%</span><span>−' + m(q.discount) + '</span></div>' : '') +
			(q.urgent ? '<div class="r"><span>' + esc(cat.urgentText || 'Срочный заказ') + ' +' + cat.urgentPct + '%</span><span>' + m(q.urgent) + '</span></div>' : '') +
			(q.pctSum ? '<div class="r"><span>Безналичная оплата</span><span>' + m(q.pctSum) + '</span></div>' : '') +
			'<div class="r"><span>Материалы и фурнитура</span><span>' + m(q.mats) + '</span></div><div class="w">' + esc(O.words(q.total)) + '</div>' +
			'<div class="pay"><div class="r"><span>Аванс</span><b>' + m(q.advance) + ' ₽</b></div><small>' + cat.advance.serv + '% услуг + ' + cat.advance.mat + '% материалов</small><div class="r" style="margin-top:5px"><span>Доплата</span><b>' + m(q.rest) + ' ₽</b></div><small>перед отгрузкой</small></div></div>';
		var terms = O.termsText(b, o, q);
		return '<!doctype html><html><head><meta charset="utf-8"><style>' + css + '</style></head><body>' + head + '<div class="wrap"><div>' + body + '</div>' + side + '</div>' +
			(terms.length ? '<div class="cnd"><b>' + esc((b.cat.terms && b.cat.terms.title) || 'Важно знать') + '</b><ol>' + terms.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ol></div>' : '') + sign + '</body></html>';
	};
	X.doc = async function (o, kind) {
		var q = O.calc(X.book, o);
		if (!q.total) { U.toast('В заказе нет позиций — добавьте изделие на вкладке «Изделия».'); return; }
		var cl = O.client(X.book, o.clientId), name = (kind === 'inv' ? 'Счёт ' : 'КП ') + o.no + (cl ? ' ' + cl.name : '');
		/* STHGroup: сначала предпросмотр в окне программы, сохранение в PDF — из него */
		var html = X.docHtml(o, q, kind, await logo());
		var go = await U.modal({ title: (kind === 'inv' ? 'Счёт' : 'Коммерческое предложение') + ' — предпросмотр', width: 900, cls: 'sthPrev',
			body: (q.samplePrices && q.samplePrices.length ? '<div class="note warn">В документе используются цены-образцы. Проверьте свои цены перед отправкой заказчику.</div>' : '') + '<iframe id="soPrev" title="Предпросмотр" style="width:100%;height:72vh;border:1px solid #555;background:#fff"></iframe>',
			buttons: [{ label: 'Закрыть', value: null }, { label: 'Сохранить в PDF', primary: true, value: 1 }],
			onOpen: function (m) { m.querySelector('#soPrev').srcdoc = html; } });
		if (!go) return;
		var dir = S().set.sthDocsDir || o.dir || (o.items[0] ? U.dirOf(o.items[0].path) : (S().set.lastDir || S().boot.docs));   // папка документов, иначе папка заказа
		var p = await U.pick({ kind: 'save', title: kind === 'inv' ? 'Счёт в PDF' : 'КП в PDF', dir: dir, name: name.replace(/[\\/:*?"<>|]+/g, ' ') + '.pdf', filters: [{ name: 'PDF', ext: ['pdf'] }] });
		if (!p) return;
		if (!/\.pdf$/i.test(p)) p += '.pdf';
		try {
			await U.api.pdf(html, p);
			(o.docs = o.docs || []).push({ kind: kind, path: p, date: O.today(), total: q.total }); X.save();
			U.toast('Готово: ' + U.baseOf(p), { actions: [{ label: 'Открыть', run: function () { U.api.open(p).catch(U.error); } }, { label: 'Папка', run: function () { U.api.open(U.dirOf(p)).catch(U.error); } }] });
		} catch (e) { U.error(e); }
	};

	/* ------------------------ прайс-лист для клиента ------------------------ */
	/* вариант «2» (выбран автором): шапка как у КП и счёта, разделы карточками в две колонки, «цена ₽ / ед.», условия */
	X.priceHtml = function (pl, logoSvg) {
		var b = X.book, co = b.cat.company, m = O.money;
		var css = '@page{size:A4;margin:12mm 13mm 14mm}*{box-sizing:border-box}body{margin:0;font:11.5px/1.4 "Segoe UI",Arial,sans-serif;color:#23262B}.mu{color:#7a7d82}' +
			'.top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #F26B1D;padding-bottom:12px}.top svg{width:180px;height:auto;display:block}.ttl{text-align:right}.ttl b{font-size:19px;display:block}.ttl span{font-size:12.5px}' +
			'.co{display:flex;justify-content:space-between;gap:10px;margin:9px 0 4px;font-size:10.5px}.grid{columns:2;column-gap:18px}.sec{break-inside:avoid;margin:0 0 12px;display:inline-block;width:100%}' +
			'h3{font-size:11.5px;margin:4px 0 2px;color:#E5531A;text-transform:uppercase;letter-spacing:.04em;border-bottom:1px solid #F26B1D;padding-bottom:4px}.nt{color:#7a7d82;font-size:9.5px;margin:3px 0 4px}' +
			'.box{border:1px solid #e4e1db;border-radius:9px;overflow:hidden}.row{display:flex;justify-content:space-between;gap:10px;padding:6px 10px;border-bottom:1px solid #efece7}.row:nth-child(odd){background:#faf8f5}.row:last-child{border:0}' +
			'.a{font-size:11px}.b{color:#7a7d82;font-size:9.5px}.p{text-align:right;white-space:nowrap}.p b{font-size:12px;display:block}.p span{color:#7a7d82;font-size:9.5px}' +
			'.cnd{background:#fff6ef;border-left:4px solid #F26B1D;padding:8px 13px;margin-top:6px;break-inside:avoid}.cnd ol{margin:4px 0 0;padding-left:18px}.cnd li{margin:2px 0}';
		var head = '<div class="top">' + logoSvg + '<div class="ttl"><b>Прайс-лист на услуги производства</b><span>цены действуют с ' + esc(O.ruDate(pl.date)) + '</span></div></div>' +
			'<div class="co"><span><b>' + esc(co.name || 'STHGroup') + '</b>' + (co.address ? ' · ' + esc(co.address) : '') + '</span><span>' + esc([co.phone, co.email, co.site].filter(Boolean).join(' · ')) + '</span></div>';
		var body = pl.sections.map(function (x) {
			return '<div class="sec"><h3>' + esc(x.title) + '</h3>' + (x.note ? '<div class="nt">' + esc(x.note) + '</div>' : '') + '<div class="box">' + x.rows.map(function (r) {
				return '<div class="row"><div><div class="a">' + esc(r.name) + '</div>' + (r.note ? '<div class="b">' + esc(r.note) + '</div>' : '') + '</div><div class="p"><b>' + m(r.price) + ' ₽</b><span>/ ' + esc(r.unit) + '</span></div></div>';
			}).join('') + '</div></div>';
		}).join('');
		return '<!doctype html><html><head><meta charset="utf-8"><style>' + css + '</style></head><body>' + head + '<div class="grid">' + body + '</div>' +
			(pl.terms.length ? '<div class="cnd"><b>Условия</b><ol>' + pl.terms.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ol></div>' : '') + '</body></html>';
	};
	X.priceList = async function () {
		if (!X.book) await X.load(); var b = X.book, cat = b.cat, st = cat.pl = cat.pl || { pct: 0, hide: {}, terms: 1 };
		var full = O.priceList(b, { hide: {} });
		var rows = full.all.map(function (x) {
			return '<tr class="plSec"><td><input type="checkbox" data-k="sec:' + esc(x.id) + '"' + (st.hide['sec:' + x.id] ? '' : ' checked') + '></td><td colspan="2"><b>' + esc(x.title) + '</b></td></tr>' +
				x.rows.map(function (r) { return '<tr><td></td><td colspan="2"><div class="plR"><label class="ck"><input type="checkbox" data-k="' + esc(r.key) + '"' + (st.hide[r.key] ? '' : ' checked') + '> ' + esc(r.name) + (r.note ? ' <span class="mute">· ' + esc(r.note) + '</span>' : '') + '</label><span class="nw">' + O.money(r.price) + ' ₽ / ' + esc(r.unit) + '</span></div></td></tr>'; }).join('');
		}).join('');
		var res = await U.modal({ title: 'Прайс для клиента', width: 760, cls: 'soPl',
			body: '<div class="row" style="display:flex;gap:14px;align-items:flex-end;flex-wrap:wrap"><label class="plF"><span>Цены действуют с</span><input type="date" id="plD" value="' + O.today() + '"></label><label class="plF"><span>Надбавка (+) или скидка (−), %</span><input type="text" id="plP" value="' + String(st.pct || 0).replace('.', ',') + '" style="width:120px"></label><label class="ck" style="margin-bottom:6px"><input type="checkbox" id="plT"' + (st.terms === 0 ? '' : ' checked') + '> Условия внизу</label></div>' +
				'<p class="mute" style="margin:8px 0 4px">Отметьте, что увидит клиент. Цены — из «Справочник и цены…», примечание под строкой — там же. Выбор запоминается.</p><div style="max-height:52vh;overflow:auto"><table class="grid" style="width:100%"><tbody>' + rows + '</tbody></table></div>',
			buttons: [{ label: 'Отмена', value: null }, { label: 'Показать', primary: true, run: function (m) {
				var hide = {}; m.querySelectorAll('[data-k]').forEach(function (c) { if (!c.checked) hide[c.dataset.k] = 1; });
				return { hide: hide, pct: O.num(m.querySelector('#plP').value), date: m.querySelector('#plD').value || O.today(), terms: m.querySelector('#plT').checked ? 1 : 0 };
			} }] });
		if (!res) return;
		cat.pl = { pct: res.pct, hide: res.hide, terms: res.terms }; X.save();
		var pl = O.priceList(b, { pct: res.pct, hide: res.hide, date: res.date, noTerms: !res.terms });
		if (!pl.sections.length) { U.toast('Ничего не отмечено — прайс пустой.'); return; }
		var html = X.priceHtml(pl, await logo());
		var go = await U.modal({ title: 'Прайс для клиента — предпросмотр', width: 900, cls: 'sthPrev',
			body: '<iframe id="soPrev" title="Предпросмотр" style="width:100%;height:72vh;border:1px solid #555;background:#fff"></iframe>',
			buttons: [{ label: 'Закрыть', value: null }, { label: 'Сохранить в PDF', primary: true, value: 1 }],
			onOpen: function (m) { m.querySelector('#soPrev').srcdoc = html; } });
		if (!go) return;
		var p = await U.pick({ kind: 'save', title: 'Прайс в PDF', dir: S().set.sthDocsDir || X.folder() || S().set.lastDir || S().boot.docs, name: ('Прайс ' + (cat.company.name || 'STHGroup') + ' ' + O.ruDate(pl.date)).replace(/[\\/:*?"<>|«»]+/g, ' ').replace(/\s+/g, ' ').trim() + '.pdf', filters: [{ name: 'PDF', ext: ['pdf'] }] });
		if (!p) return;
		if (!/\.pdf$/i.test(p)) p += '.pdf';
		try { await U.api.pdf(html, p); U.toast('Готово: ' + U.baseOf(p), { actions: [{ label: 'Открыть', run: function () { U.api.open(p).catch(U.error); } }, { label: 'Папка', run: function () { U.api.open(U.dirOf(p)).catch(U.error); } }] }); } catch (e) { U.error(e); }
	};

	/* -------------------------------- подключение ---------------------------- */
	X.init = function () {
		var host = $('orders'); if (!host) return;
		host.addEventListener('click', onClick);
		host.addEventListener('change', onChange);
		host.addEventListener('input', function (e) { if (e.target.id === 'soQ') onChange(e); });
		window.addEventListener('focus', function () { var s = S(); if (s && (s.section === 'orders' || s.section === 'clients')) X.load().then(function () { X.render(); }); });
		var A = window.App;
		if (A && A.openPath) { var o0 = A.openPath; A.openPath = async function () { var r = await o0.apply(this, arguments); if (r) X.onProject().catch(console.warn); return r; }; }
	};
	X.init();
})();
