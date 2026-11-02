/* STHGroup — заказы: книга заказов (клиенты, заказы, справочник услуг и цен) и расчёт КП «как у фабрики».
   Заказ — несколько изделий (файлов .bmk). По каждому изделию снимается сводка из проекта: листы по материалам
   (из раскроя), мелкие детали, стоимость материалов и фурнитуры по смете. Расчёт заказа:
   1) обработка листового материала — цена за лист по виду работы («распил, кромкооблицовка, присадка» / «распил»);
   2) доп. обработка мелких деталей (длина или ширина меньше порога) — кромление и присадка за деталь;
   3) услуги к заказу — галочки; единица: за заказ, лист, изделие, деталь или % от суммы;
   4) скидка за комплекс — % от услуг (галочка в заказе);
   5) материалы и фурнитура — по смете, с наценкой; галочки «наш материал», «наша фурнитура»;
   итог, аванс (% услуг + % материалов), доплата, оплачено, долг.
   Только данные и правила — окно в ui/sth_orders.js. Работает в окне и под Node.js. */
(function (G) {
	'use strict';
	var BM = G.BM = G.BM || {};
	var O = BM.sth = {};
	O.FILE = 'STHGroup — заказы.json';
	O.FORMAT = 'sthgroup-orders';
	O.STATUSES = [['calc', 'Расчёт'], ['agreed', 'Согласован'], ['work', 'В работе'], ['ready', 'Готов'], ['shipped', 'Отгружен'], ['closed', 'Закрыт']];
	O.UNITS = [['order', 'за заказ'], ['sheet', 'за лист'], ['item', 'за изделие'], ['part', 'за деталь'], ['pct', '% от суммы']];
	O.LOADS = [['low', 'низкая'], ['mid', 'средняя'], ['high', 'высокая']];

	function num(v, d) { if (typeof v === 'string') v = v.replace(/\s/g, '').replace(',', '.'); v = Number(v); return isFinite(v) ? v : (d === undefined ? 0 : d); }
	function r2(v) { return Math.round((Number(v) + Number.EPSILON) * 100) / 100; }
	function low(s) { return String(s || '').toLowerCase().replace(/ё/g, 'е'); }
	var seq = 0;
	O.id = function (p) { return (p || 'x') + Date.now().toString(36) + (seq++).toString(36) + Math.floor(Math.random() * 1296).toString(36); };
	O.num = num; O.r2 = r2;

	/* ------------------------------ книга ------------------------------------ */
	O.defCatalog = function () {
		return {
			sheetWorks: [
				{ id: 'full', name: 'Распил, кромкооблицовка и присадка', price: 5250, match: '' },
				{ id: 'cut', name: 'Распил', price: 1050, match: 'хдф, двп, hdf, оргалит' }
			],
			small: { limit: 60, edge: 420, drill: 420 },
			services: [
				{ id: 'up', name: 'Разработка УП и адаптация модели под производство', unit: 'item', price: 2200, on: 1 },
				{ id: 'pack', name: 'Упаковка деталей в стрейч', unit: 'sheet', price: 525, on: 1 },
				{ id: 'supply', name: 'Закупка и обеспечение фурнитурой (услуга снабжения)', unit: 'order', price: 2500, on: 1 },
				{ id: 'kit', name: 'Комплектация фурнитурой к изделию (фасовка поизделно)', unit: 'order', price: 1000, on: 1 },
				{ id: 'unload', name: 'Разгрузка материала', unit: 'sheet', price: 150, on: 0 },
				{ id: 'cashless', name: 'Безналичная форма оплаты (с НДС)', unit: 'pct', price: 7, on: 0 }
			],
			complexPct: 4, complexText: 'Скидка при заказе услуг распила, фасадов и комплектации',
			markup: 15, markupText: 'мы добавляем 15% к оптовому прайсу поставщика',
			advance: { serv: 70, mat: 100 },
			terms: {
				load: 'mid', days: 10, freeDays: 2, storage: 500,
				text: 'Для начала выполнения работ потребуются модель из Базис-Мебельщика и аванс: {аванс}.\nНа момент расчёта загрузка нашего производства: {загрузка}. Изготовление займёт до {срок} раб. дней.\nПогрузочные работы готовых деталей в транспорт производятся силами заказчика.\nХранение платное: после оповещения о готовности, начиная с {день} дня, каждые сутки хранения стоят {хранение} ₽.'
			},
			company: { name: 'STHGroup', phone: '', email: '', address: '', inn: '', bank: '', executor: '', site: '' },
			prefix: 'STH-'
		};
	};
	O.empty = function () { return { format: O.FORMAT, v: 1, next: 1, clients: [], orders: [], cat: O.defCatalog() }; };
	O.fix = function (b) {
		var e = O.empty(), k;
		if (!b || typeof b !== 'object' || b.format !== O.FORMAT) b = e;
		for (k in e) if (b[k] === undefined || b[k] === null || typeof b[k] !== typeof e[k]) b[k] = e[k];
		var d = O.defCatalog();
		for (k in d) if (b.cat[k] === undefined) b.cat[k] = d[k];
		['small', 'advance', 'terms', 'company'].forEach(function (x) { for (var f in d[x]) if (b.cat[x][f] === undefined) b.cat[x][f] = d[x][f]; });
		if (!Array.isArray(b.cat.sheetWorks) || !b.cat.sheetWorks.length) b.cat.sheetWorks = d.sheetWorks;
		if (!Array.isArray(b.cat.services)) b.cat.services = d.services;
		b.orders.forEach(function (o) { O.fixOrder(b, o); });
		return b;
	};
	O.fixOrder = function (b, o) {
		if (!o.id) o.id = O.id('o');
		if (!Array.isArray(o.items)) o.items = [];
		if (!Array.isArray(o.payments)) o.payments = [];
		if (!o.svc || typeof o.svc !== 'object') o.svc = {};
		if (o.complex === undefined) o.complex = 1;
		if (o.ownMat === undefined) o.ownMat = 1;
		if (o.ownFit === undefined) o.ownFit = 1;
		if (!o.terms) o.terms = {};
		if (!o.status) o.status = 'calc';
		return o;
	};
	O.today = function () { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
	O.ruDate = function (iso) { var m = /^(\d{4})-(\d\d)-(\d\d)/.exec(iso || ''); return m ? m[3] + '.' + m[2] + '.' + m[1] : ''; };
	O.nextNo = function (b) { var n = b.next || 1; b.next = n + 1; return (b.cat.prefix || 'STH-') + String(n).padStart(4, '0'); };
	O.client = function (b, id) { for (var i = 0; i < b.clients.length; i++) if (b.clients[i].id === id) return b.clients[i]; return null; };
	O.clientByName = function (b, name) { var n = low(name).trim(); if (!n) return null; for (var i = 0; i < b.clients.length; i++) if (low(b.clients[i].name).trim() === n) return b.clients[i]; return null; };
	O.addClient = function (b, c) { var x = { id: O.id('c'), name: String(c.name || '').trim() || 'Клиент', phone: c.phone || '', email: c.email || '', note: c.note || '' }; b.clients.push(x); return x; };
	O.order = function (b, id) { for (var i = 0; i < b.orders.length; i++) if (b.orders[i].id === id) return b.orders[i]; return null; };
	O.byNo = function (b, no) { var n = low(no).trim(); if (!n) return null; for (var i = 0; i < b.orders.length; i++) if (low(b.orders[i].no).trim() === n) return b.orders[i]; return null; };
	O.byItem = function (b, path) { var p = low(path); for (var i = 0; i < b.orders.length; i++) for (var j = 0; j < b.orders[i].items.length; j++) if (low(b.orders[i].items[j].path) === p) return b.orders[i]; return null; };
	O.addOrder = function (b, o) {
		var x = O.fixOrder(b, { id: O.id('o'), no: o.no || O.nextNo(b), date: O.today(), clientId: o.clientId || '', status: 'calc', note: o.note || '', items: [], payments: [], svc: {}, terms: {} });
		b.orders.unshift(x);
		return x;
	};
	/* изделие (файл проекта) в заказ; уже есть — обновить сводку */
	O.putItem = function (o, path, snap) {
		var p = low(path), it = null;
		o.items.forEach(function (x) { if (low(x.path) === p) it = x; });
		if (!it) { it = { path: path, title: '', snap: null }; o.items.push(it); }
		if (snap) { it.snap = snap; it.title = it.title || snap.title || ''; }
		return it;
	};
	/* Заказ для выгруженного проекта: по номеру из окна скрипта, затем по файлу; нет — новый с клиентом из окна. */
	O.forProject = function (b, path, model) {
		var o = (model && model.orderNo && O.byNo(b, model.orderNo)) || O.byItem(b, path), made = false;
		if (!o) {
			var cn = model && (model.customer || model.order), c = cn ? (O.clientByName(b, cn) || O.addClient(b, { name: cn })) : null;
			o = O.addOrder(b, { no: model && model.orderNo ? String(model.orderNo).trim() : '', clientId: c ? c.id : '', note: model && model.note || '' });
			made = true;
		}
		O.putItem(o, path, null);
		return { order: o, made: made };
	};

	/* ---------------------------- сводка изделия ----------------------------- */
	/* вид работы листа: первый, у которого слово из «match» есть в названии материала; иначе — первый без условий */
	O.workFor = function (cat, matName) {
		var n = low(matName), def = null;
		for (var i = 0; i < cat.sheetWorks.length; i++) {
			var w = cat.sheetWorks[i], keys = String(w.match || '').split(/[,;]+/).map(function (s) { return low(s).trim(); }).filter(Boolean);
			if (!keys.length) { if (!def) def = w; continue; }
			for (var k = 0; k < keys.length; k++) if (n.indexOf(keys[k]) >= 0) return w;
		}
		return def || cat.sheetWorks[0] || null;
	};
	/* st — состояние проекта BazisReborn (BM.project.build, раскрой посчитан), R — смета (BM.est.build) или null */
	O.snapshot = function (st, R, cat, title, file) {
		var P = BM.project, sm = P.summary(st), lim = num(cat.small.limit, 60), sheets = [], parts = 0, sEdge = 0, sDrill = 0;
		sm.mats.forEach(function (x) {
			var n = (x.std || 0) + (x.rem || 0);
			if (!n) return;
			var w = O.workFor(cat, x.mat.name);
			sheets.push({ mat: P.matTitle ? P.matTitle(x.mat) : x.mat.name, name: x.mat.name, th: x.mat.th, n: n, work: w ? w.id : '' });
		});
		var by = (st.holes && st.holes.by) || {};
		st.types.forEach(function (t) {
			var c = t.cnt || 0; if (!c) return;
			parts += c;
			if (Math.min(t.L, t.W) >= lim) return;
			var sd = t.shape && t.shape.sides, edged = sd && (sd.T || sd.B || sd.L || sd.R);
			var drilled = (t.ids || []).some(function (id) { var h = by[id]; return h && ((h.top && h.top.length) || (h.bot && h.bot.length) || (h.thr && h.thr.length) || (h.edge && h.edge.length)); });
			if (edged) sEdge += c;
			if (drilled) sDrill += c;
		});
		var g = (R && R.groups) || {};
		return { title: title || P.modelName(st.model) || '', file: file || '', sheets: sheets, parts: parts, smallEdge: sEdge, smallDrill: sDrill,
			mat: r2(g['МАТЕРИАЛ'] || 0), fit: r2(g['ФУРНИТУРА'] || 0), at: new Date().toISOString() };
	};

	/* ------------------------------- расчёт ---------------------------------- */
	O.calc = function (b, o) {
		var cat = b.cat, blocks = [], lines, i, warn = [];
		var items = o.items.filter(function (x) { return x.snap; });
		o.items.forEach(function (x) { if (!x.snap) warn.push('Изделие «' + (x.title || x.path) + '» ещё не посчитано — откройте его или нажмите «Пересчитать».'); });
		/* 1. листы по видам работ */
		var byWork = {}, totalSheets = 0, totalParts = 0, sEdge = 0, sDrill = 0, mat = 0, fit = 0;
		items.forEach(function (x) {
			var s = x.snap;
			s.sheets.forEach(function (sh) { var wid = (O.workFor(cat, sh.name) || {}).id || sh.work; (byWork[wid] = byWork[wid] || { n: 0, mats: {} }); byWork[wid].n += sh.n; byWork[wid].mats[sh.name] = 1; totalSheets += sh.n; });
			totalParts += s.parts; sEdge += s.smallEdge; sDrill += s.smallDrill; mat += s.mat; fit += s.fit;
		});
		lines = [];
		cat.sheetWorks.forEach(function (w) {
			var x = byWork[w.id]; if (!x || !x.n) return;
			var ov = o.svc['w:' + w.id] || {}, price = ov.price !== undefined && ov.price !== '' ? num(ov.price) : num(w.price);
			lines.push({ key: 'w:' + w.id, name: w.name, unit: Object.keys(x.mats).join(', ') + ', за лист', price: price, qty: x.n, sum: r2(price * x.n) });
		});
		blocks.push({ id: 'sheets', title: 'Обработка листового материала', lines: lines });
		/* 2. мелкие детали */
		lines = [];
		var lim = num(cat.small.limit, 60);
		if (sEdge && num(cat.small.edge)) lines.push({ key: 's:edge', name: 'Кромление деталей меньше ' + lim + ' мм', unit: 'за деталь', price: num(cat.small.edge), qty: sEdge, sum: r2(num(cat.small.edge) * sEdge) });
		if (sDrill && num(cat.small.drill)) lines.push({ key: 's:drill', name: 'Присадка деталей меньше ' + lim + ' мм', unit: 'за деталь', price: num(cat.small.drill), qty: sDrill, sum: r2(num(cat.small.drill) * sDrill) });
		blocks.push({ id: 'small', title: 'Доп. обработка деталей', lines: lines });
		/* 3. услуги */
		lines = []; var pct = [];
		cat.services.forEach(function (s) {
			var ov = o.svc[s.id] || {}, on = ov.on !== undefined ? !!ov.on : !!s.on, price = ov.price !== undefined && ov.price !== '' ? num(ov.price) : num(s.price), qty;
			if (s.unit === 'pct') { pct.push({ key: s.id, name: s.name, unit: '% от суммы', price: price, on: on }); return; }
			qty = ov.qty !== undefined && ov.qty !== '' ? num(ov.qty) : s.unit === 'sheet' ? totalSheets : s.unit === 'item' ? o.items.length : s.unit === 'part' ? totalParts : 1;
			lines.push({ key: s.id, name: s.name, unit: (O.UNITS.filter(function (u) { return u[0] === s.unit; })[0] || ['', ''])[1], price: price, qty: qty, on: on, sum: on ? r2(price * qty) : 0, check: 1 });
		});
		(o.extra || []).forEach(function (x, k) { var q = num(x.qty, 1), p = num(x.price); lines.push({ key: 'x:' + k, name: x.name || '', unit: x.unit || 'шт', price: p, qty: q, sum: r2(p * q), extra: 1 }); });
		blocks.push({ id: 'svc', title: 'Услуги к заказу', lines: lines });
		var serv = 0;
		blocks.forEach(function (bk) { bk.sum = r2(bk.lines.reduce(function (a, l) { return a + (l.sum || 0); }, 0)); serv += bk.sum; });
		serv = r2(serv);
		/* 4. скидка за комплекс */
		var discount = o.complex ? r2(serv * num(cat.complexPct) / 100) : 0, servD = r2(serv - discount);
		/* 5. материалы */
		var k = 1 + num(o.markup !== undefined && o.markup !== '' ? o.markup : cat.markup) / 100;
		var matLines = [
			{ key: 'm:mat', name: 'Стоимость материалов (уточняется при заказе)', price: r2(mat * k), qty: 1, on: !!o.ownMat, sum: o.ownMat ? r2(mat * k) : 0, check: 1, unit: '' },
			{ key: 'm:fit', name: 'Стоимость фурнитуры (уточняется при заказе)', price: r2(fit * k), qty: 1, on: !!o.ownFit, sum: o.ownFit ? r2(fit * k) : 0, check: 1, unit: '' }
		];
		var mats = r2(matLines[0].sum + matLines[1].sum);
		/* проценты от суммы (безнал) — к услугам */
		var base = servD + mats, pctSum = 0;
		pct.forEach(function (p) { p.qty = p.on ? 1 : 0; p.sum = p.on ? r2(base * p.price / 100) : 0; p.check = 1; pctSum += p.sum; });
		blocks[2].lines = blocks[2].lines.concat(pct);
		var servAll = r2(servD + pctSum), total = r2(servAll + mats);
		var adv = r2(servAll * num(cat.advance.serv) / 100 + mats * num(cat.advance.mat) / 100);
		var paid = r2(o.payments.reduce(function (a, p) { return a + num(p.amount); }, 0));
		var sheetsList = {};
		items.forEach(function (x) { x.snap.sheets.forEach(function (sh) { var key = sh.name + '|' + sh.th; (sheetsList[key] = sheetsList[key] || { name: sh.name, th: sh.th, n: 0 }).n += sh.n; }); });
		return {
			blocks: blocks, matLines: matLines, serv: serv, discount: discount, servD: servD, pctSum: r2(pctSum), servAll: servAll, mats: mats, total: total,
			advance: Math.min(adv, total), rest: r2(total - Math.min(adv, total)), paid: paid, debt: r2(total - paid),
			sheets: totalSheets, parts: totalParts, smallEdge: sEdge, smallDrill: sDrill, matList: Object.keys(sheetsList).map(function (k2) { return sheetsList[k2]; }), warn: warn
		};
	};
	/* текст условий с подстановкой */
	O.termsText = function (b, o, q) {
		var t = Object.assign({}, b.cat.terms, o.terms || {}), ld = (O.LOADS.filter(function (x) { return x[0] === t.load; })[0] || ['', 'средняя'])[1];
		var adv = b.cat.advance.serv + '% за услуги и ' + b.cat.advance.mat + '% за материалы при приобретении через нас';
		return String(t.text || '').replace(/\{аванс\}/g, adv).replace(/\{загрузка\}/g, ld).replace(/\{срок\}/g, t.days).replace(/\{день\}/g, (num(t.freeDays) + 1) + '-го').replace(/\{хранение\}/g, t.storage)
			.split(/\n+/).filter(function (s) { return s.trim(); });
	};
	O.statusName = function (s) { return (O.STATUSES.filter(function (x) { return x[0] === s; })[0] || ['', s])[1]; };
	O.money = function (v) { return r2(v).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).replace(/ /g, ' '); };
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));
