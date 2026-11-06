/* STHGroup — склад (раздел «Склад»): поверх склада базы материалов BazisReborn (b.stock: документы прихода/расхода, деловые обрезки).
   Здесь добавлено: вкладки по видам (листы, обрезки, кромка и погонаж, фурнитура), резерв под заказ (b.stock.res),
   ячейка хранения (b.stock.cells: материал → ячейка), резерв обрезка (o.res), поиск подходящего обрезка. Склад один — в файле базы материалов. */
(function () {
	'use strict';
	var MB = BM.mb, K = BM.stock = {};
	function num(v, d) { var n = Number(String(v === undefined || v === null ? '' : v).replace(',', '.').replace(/\s/g, '')); return isFinite(n) && String(v).trim() !== '' ? n : (d || 0); }
	function low(s) { return String(s || '').toLowerCase().replace(/ё/g, 'е').trim(); }
	function r6(v) { return Math.round(v * 1e6) / 1e6; }
	K.TABS = [['sheet', 'Листы'], ['off', 'Обрезки'], ['lin', 'Кромка, погонаж'], ['fit', 'Фурнитура'], ['moves', 'Движения'], ['history', 'История']];

	/* STHGroup: инвентаризация отдельным документом, без потери резервов и истории. */
	K.inventoryPlan = function (b, entries) {
		K.fix(b); var seen = {};
		return entries.map(function (e) {
			var raw = String(e.actual === undefined ? '' : e.actual).trim().replace(',', '.'), qty = Number(raw);
			if (!b.mats[e.mat] || seen[e.mat] || raw === '' || !Number.isFinite(qty) || qty < 0) throw new Error('Проверьте материал и фактическое количество.');
			seen[e.mat] = true;
			var before = r6(MB.balance(b, e.mat));
			return { mat: e.mat, before: before, actual: r6(qty), delta: r6(qty - before) };
		});
	};
	K.applyInventory = function (b, plan) {
		/* Сначала проверить весь снимок; чужие движения нельзя молча перезаписать. */
		var check = K.inventoryPlan(b, plan);
		check.forEach(function (e, i) { if (e.before !== plan[i].before) throw new Error('Остатки изменились после пересчёта. Откройте инвентаризацию заново.'); });
		var lines = check.filter(function (e) { return e.delta !== 0; }).map(function (e) { return { mat: e.mat, qty: e.delta }; });
		if (!lines.length) return null;
		var doc = MB.addDoc(b, { kind: 'adj', note: 'Инвентаризация', lines: lines });
		doc.inventory = check;
		K.log(b, 'stock', 'Инвентаризация', 'Скорректировано позиций: ' + lines.length, { doc: doc.id });
		return doc;
	};
	function csv(rows) {
		return '\ufeff' + rows.map(function (row) { return row.map(function (value) {
			var s = String(value === undefined || value === null ? '' : value);
			if (typeof value === 'string' && /^[\s]*[=+@-]/.test(s)) s = "'" + s;
			return '"' + s.replace(/"/g, '""') + '"';
		}).join(';'); }).join('\r\n') + '\r\n';
	}
	K.csvSnapshot = function (b, at) {
		K.fix(b); at = at || new Date().toISOString();
		var balances = {}, reserves = {};
		b.stock.docs.forEach(function (d) { if (!d.off) d.lines.forEach(function (l) { balances[l.mat] = (balances[l.mat] || 0) + (d.kind === 'out' ? -num(l.qty) : num(l.qty)); }); });
		b.stock.res.forEach(function (r) { reserves[r.mat] = (reserves[r.mat] || 0) + num(r.qty); });
		var rows = [['Дата', 'ID', 'Артикул', 'Материал', 'Единица', 'Остаток', 'Резерв', 'Свободно', 'Ячейка']];
		Object.keys(b.mats).sort().forEach(function (id) { var m = b.mats[id], balance = r6(balances[id] || 0), reserved = r6(reserves[id] || 0);
			rows.push([at, id, m.art, m.name, m.unit, balance, reserved, r6(balance - reserved), b.stock.cells[id] || '']);
		});
		var off = [['Дата', 'ID остатка', 'ID материала', 'Артикул', 'Материал', 'Длина, мм', 'Ширина, мм', 'Количество', 'Ячейка', 'ID заказа', 'Номер заказа', 'Происхождение']];
		MB.offcuts(b).forEach(function (o) { var m = b.mats[o.mat]; if (m) off.push([at, o.id, o.mat, m.art, m.name, o.L, o.W, o.n, K.offCell(b, o), o.res || '', o.resNo || '', o.project || o.originNo || '']); });
		return { materials: csv(rows), offcuts: csv(off) };
	};

	K.fix = function (b) {
		if (!b.stock || typeof b.stock !== 'object') b.stock = { docs: [], offcuts: [] };
		if (!Array.isArray(b.stock.res)) b.stock.res = [];
		if (!Array.isArray(b.stock.historyHiddenDocs)) b.stock.historyHiddenDocs = [];
		if (!b.stock.cells || typeof b.stock.cells !== 'object' || Array.isArray(b.stock.cells)) b.stock.cells = {};
		b.stock.res = b.stock.res.filter(function (r) { return r && b.mats[r.mat] && r.qty > 0; });
		return b;
	};
	/* Единая человекочитаемая история базы: замены, сопоставления и действия склада. */
	K.log = function (b, type, title, details, extra) {
		b.sthHistory = Array.isArray(b.sthHistory) ? b.sthHistory : [];
		var h = Object.assign({ id: MB.newId('h'), at: new Date().toISOString(), type: type, title: title, details: details || '' }, extra || {});
		b.sthHistory.push(h);
		if (b.sthHistory.length > 500) b.sthHistory.splice(0, b.sthHistory.length - 500);
		return h;
	};
	/* вкладка материала: кромка и погонный — «Кромка, погонаж»; лист — «Листы»; остальное — «Фурнитура» */
	K.tabOf = function (b, m) {
		var t = MB.typeOf(b, m);
		if (t === 'edge') return 'lin';
		if (t === 'sheet') return m.kind === 'lin' || m.kind === 'top' || m.kind === 'wall' ? 'lin' : 'sheet';
		return 'fit';
	};

	/* --------------------------------- резерв ---------------------------------- */
	K.reserved = function (b, mat) { var s = 0; K.fix(b).stock.res.forEach(function (r) { if (r.mat === mat) s += r.qty; }); return r6(s); };
	K.resOf = function (b, mat) { return K.fix(b).stock.res.filter(function (r) { return r.mat === mat; }); };
	/* резерв материала под заказ: тот же заказ — количество заменяется; 0 — резерв снимается */
	K.reserve = function (b, mat, qty, order) {
		K.fix(b);
		if (!b.mats[mat] || !order || !order.id) return null;
		qty = r6(num(qty));
		var r = b.stock.res.filter(function (x) { return x.mat === mat && x.order === order.id; })[0];
		if (!(qty > 0)) {
			if (r) { b.stock.res.splice(b.stock.res.indexOf(r), 1); K.log(b, 'stock', 'Резерв снят', b.mats[mat].name + ' · заказ № ' + (order.no || ''), { mat: mat, order: order.id }); }
			return null;
		}
		if (!r) { r = { id: MB.newId('r'), mat: mat, order: order.id }; b.stock.res.push(r); }
		r.qty = qty; r.no = String(order.no || ''); r.date = MB.today();
		K.log(b, 'stock', 'Резерв изменён', b.mats[mat].name + ' — ' + qty + ' ' + b.mats[mat].unit + ' · заказ № ' + (order.no || ''), { mat: mat, order: order.id });
		return r;
	};
	K.unreserve = function (b, id) {
		K.fix(b); var old = b.stock.res.filter(function (r) { return r.id === id; })[0];
		b.stock.res = b.stock.res.filter(function (r) { return r.id !== id; });
		if (old) K.log(b, 'stock', 'Резерв снят', (b.mats[old.mat] ? b.mats[old.mat].name : '') + ' · заказ № ' + (old.no || ''), { mat: old.mat, order: old.order });
		return !!old;
	};
	K.unreserveOrder = function (b, orderId) {
		K.fix(b); var n = b.stock.res.length, no = '';
		b.stock.res = b.stock.res.filter(function (r) { if (r.order === orderId) no = r.no; return r.order !== orderId; });
		var off = 0;
		b.stock.offcuts.forEach(function (o) { if (o.res === orderId) { off++; delete o.res; delete o.resNo; } });
		if (n !== b.stock.res.length || off) K.log(b, 'stock', 'Резервы заказа сняты', 'Заказ № ' + no + ' · материалов: ' + (n - b.stock.res.length) + ', обрезков: ' + off, { order: orderId });
	};

	/* ------------------------------ строки вкладок ------------------------------ */
	/* строки: материалы вкладки, у которых есть остаток, резерв или движение (all — все материалы базы этой вкладки) */
	K.rows = function (b, tab, q, all) {
		K.fix(b);
		var moved = {}, out = [], ql = low(q);
		b.stock.docs.forEach(function (d) { if (!d.off) d.lines.forEach(function (l) { moved[l.mat] = 1; }); });
		b.stock.res.forEach(function (r) { moved[r.mat] = 1; });
		Object.keys(b.mats).forEach(function (id) {
			var m = b.mats[id];
			if (K.tabOf(b, m) !== tab) return;
			if (!all && !moved[id]) return;
			var cell = b.stock.cells[id] || '';
			if (ql && low(m.name).indexOf(ql) < 0 && low(m.art).indexOf(ql) < 0 && low(cell).indexOf(ql) < 0) return;
			var bal = MB.balance(b, id), res = K.reserved(b, id);
			out.push({ m: m, unit: m.unit, bal: bal, res: res, free: r6(bal - res), cell: cell, orders: K.resOf(b, id).map(function (r) { return r.no; }).filter(Boolean) });
		});
		return out.sort(function (x, y) { return x.m.name.localeCompare(y.m.name, 'ru'); });
	};
	K.setCell = function (b, mat, cell) {
		K.fix(b); cell = String(cell || '').trim(); if (cell) b.stock.cells[mat] = cell; else delete b.stock.cells[mat];
		K.log(b, 'stock', 'Ячейка изменена', (b.mats[mat] ? b.mats[mat].name : mat) + ' — ' + (cell || 'без ячейки'), { mat: mat });
	};

	/* ----------------------------- приход и расход ------------------------------ */
	/* kind 'in' | 'out'; o: { price, note, order: { id, no } } — расход по заказу уменьшает резерв этого заказа */
	K.move = function (b, kind, mat, qty, o) {
		o = o || {};
		qty = r6(num(qty));
		if (!b.mats[mat] || !(qty > 0)) return null;
		var d = MB.addDoc(b, { kind: kind === 'out' ? 'out' : 'in', note: o.note, project: o.order ? 'Заказ ' + o.order.no : '', lines: [{ mat: mat, qty: qty, price: kind === 'in' ? num(o.price) : 0 }] });
		if (d && o.order) {
			d.order = o.order.id;
			if (kind === 'out') { var r = K.resOf(b, mat).filter(function (x) { return x.order === o.order.id; })[0]; if (r) K.reserve(b, mat, r.qty - qty, o.order); }
		}
		if (d) K.log(b, 'stock', kind === 'out' ? 'Расход со склада' : 'Приход на склад', b.mats[mat].name + ' — ' + qty + ' ' + b.mats[mat].unit + (o.order ? ' · заказ № ' + o.order.no : ''), { mat: mat, order: o.order && o.order.id, doc: d.id });
		return d;
	};

	/* -------------------------------- обрезки ---------------------------------- */
	K.offRows = function (b, q) {
		K.fix(b);
		var ql = low(q);
		return MB.offcuts(b).filter(function (o) { var m = b.mats[o.mat]; return m && (!ql || low([m.name, m.art, o.L + '×' + o.W, o.L + ' ' + o.W, o.project, o.originNo, o.resNo, K.offCell(b, o), o.note].join(' ')).indexOf(ql.replace(/\s*[xх×]\s*/g, '×')) >= 0); })
			.sort(function (x, y) { var a = b.mats[x.mat].name.localeCompare(b.mats[y.mat].name, 'ru'); return a || y.L * y.W - x.L * x.W; });
	};
	/* подходящие свободные обрезки материала под кусок L×W (в любом повороте), самые маленькие — первыми */
	K.findOff = function (b, mat, L, W) {
		var a = Math.max(num(L), num(W)), c = Math.min(num(L), num(W));
		return MB.offcuts(b, mat).filter(function (o) { return !o.res && o.L >= a && o.W >= c; }).sort(function (x, y) { return x.L * x.W - y.L * y.W; });
	};
	K.reserveOff = function (b, id, order) {
		var o = b.stock.offcuts.filter(function (x) { return x.id === id; })[0];
		if (!o || o.gone || o.used || (order && o.res && o.res !== order.id)) return false;
		if (order && order.id) { o.res = order.id; o.resNo = String(order.no || ''); } else { delete o.res; delete o.resNo; }
		K.log(b, 'stock', order ? 'Обрезок зарезервирован' : 'Резерв обрезка снят', o.L + '×' + o.W + (order ? ' · заказ № ' + (order.no || '') : ''), { mat: o.mat, offcut: o.id, order: order && order.id });
		return true;
	};
	/* STHGroup: происхождение и место отдельного остатка не зависят от его резерва. */
	K.offCell = function (b, o) { return o.cell === undefined ? (b.stock.cells[o.mat] || '') : o.cell; };
	K.offFamily = function (m) { var name = low(m.name); return /лдсп|дсп/.test(name) ? 'chip' : /мдф|mdf/.test(name) ? 'mdf' : /фанер|plywood/.test(name) ? 'ply' : 'other'; };
	K.setOffCell = function (b, id, cell) {
		var o = MB.offcuts(b).filter(function (x) { return x.id === id; })[0]; if (!o) return false;
		o.cell = String(cell || '').trim();
		K.log(b, 'stock', 'Остаток перемещён', o.L + '×' + o.W + ' · ' + (o.cell || 'место не указано'), { mat: o.mat, offcut: o.id }); return true;
	};
	K.addRemainder = function (b, mat, L, W, count, source) {
		source = source || {}; var qty = num(count), length = num(L), width = num(W);
		if (!b.mats[mat] || K.tabOf(b, b.mats[mat]) !== 'sheet' || !(length > 0 && width > 0 && qty > 0 && qty === Math.floor(qty))) return null;
		var o = MB.addOffcut(b, mat, length, width, qty, { project: source.project || '' }); if (!o) return null;
		o.originOrder = String(source.order || ''); o.originNo = String(source.no || ''); o.cell = String(source.cell || '').trim(); o.note = String(source.note || '').trim();
		K.log(b, 'stock', 'Деловой остаток добавлен', b.mats[mat].name + ' · ' + o.L + '×' + o.W + ' · ' + (o.project || 'без исходного заказа'), { mat: mat, offcut: o.id, order: o.originOrder }); return o;
	};
	K.centerRows = function (b, view, category, query) {
		var rows = [], q = low(query);
		['sheet', 'lin', 'fit'].forEach(function (tab) { if (category && category !== 'all' && category !== tab) return; K.rows(b, tab, '', false).forEach(function (r) {
			if (view === 'orders') K.resOf(b, r.m.id).forEach(function (res) { rows.push(Object.assign({}, r, { key: res.id, reservation: res, qty: res.qty })); });
			else if (r.free !== 0) rows.push(Object.assign({}, r, { key: r.m.id, qty: r.free }));
		}); });
		return rows.filter(function (r) { return !q || low([r.m.name, r.m.art, r.cell, r.reservation ? r.reservation.no : ''].join(' ')).indexOf(q) >= 0; });
	};
	K.dropOff = function (b, id) { var o = b.stock.offcuts.filter(function (x) { return x.id === id; })[0]; if (!o || o.gone || o.used) return false; o.gone = 1; K.log(b, 'stock', 'Обрезок удалён', o.L + '×' + o.W, { mat: o.mat, offcut: id }); return true; };

	/* -------------------------------- движения --------------------------------- */
	K.KIND = { 'in': 'Приход', out: 'Расход', adj: 'Корректировка' };
	K.moves = function (b, q) {
		var ql = low(q);
		return b.stock.docs.slice().reverse().filter(function (d) {
			if (!ql) return true;
			return low(d.project).indexOf(ql) >= 0 || low(d.note).indexOf(ql) >= 0 || d.lines.some(function (l) { var m = b.mats[l.mat]; return m && low(m.name).indexOf(ql) >= 0; });
		});
	};
	K.history = function (b, q, type) {
		K.fix(b); var out = [];
		(b.sthHistory || []).forEach(function (h) { if (!type || type === 'all' || h.type === type || (type === 'replace' && /^(replace|restore|link|unlink)$/.test(h.type))) out.push(h); });
		if (!type || type === 'all' || type === 'stock') b.stock.docs.forEach(function (d) {
			if ((b.stock.historyHiddenDocs || []).indexOf(d.id) >= 0) return;
			out.push({ id: 'doc-' + d.id, at: d.at || d.date || '', type: 'stock', title: (K.KIND[d.kind] || 'Движение') + ' № ' + d.no + (d.off ? ' (отменён)' : ''),
				details: d.lines.map(function (l) { var m = b.mats[l.mat]; return (m ? m.name : '?') + ' — ' + l.qty + ' ' + (m ? m.unit : ''); }).join('; '), project: d.project || d.note || '', doc: d.id });
		});
		var ql = low(q);
		return out.filter(function (h) { return !ql || low([h.title, h.details, h.from, h.to, h.project].join(' ')).indexOf(ql) >= 0; })
			.sort(function (a, z) { return String(z.at || '').localeCompare(String(a.at || '')); });
	};
	K.clearHistory = function (b) { K.fix(b); b.sthHistory = []; b.stock.historyHiddenDocs = b.stock.docs.map(function (d) { return d.id; }); };
	K.clearWarehouse = function (b) { b.stock = { docs: [], offcuts: [], res: [], cells: {}, historyHiddenDocs: [] }; b.sthHistory = (b.sthHistory || []).filter(function (h) { return h.type !== 'stock'; }); };
	/* Предварительная проверка списания заказа. Ничего не записывает. */
	K.orderPreview = function (b, order, result) {
		K.fix(b); var project = 'Заказ ' + order.no, prev = b.stock.docs.filter(function (d) { return d.kind === 'out' && !d.off && d.project === project; });
		var rows = (result.need || []).map(function (x) {
			var m = b.mats[x.mat], old = 0;
			prev.forEach(function (d) { d.lines.forEach(function (l) { if (l.mat === x.mat) old += l.qty; }); });
			var available = r6(MB.balance(b, x.mat) + old), after = r6(available - x.qty);
			return { mat: x.mat, name: m ? m.name : x.mat, unit: m ? m.unit : '', need: x.qty, available: available, previous: old, after: after, shortage: Math.max(0, -after) };
		});
		var lim = b.set.offMin || [300, 200], good = (result.offcuts || []).filter(function (x) { var L = Math.max(x.L, x.W), W = Math.min(x.L, x.W); return L >= Math.max(lim[0], lim[1]) && W >= Math.min(lim[0], lim[1]); });
		return { rows: rows, previous: prev, offcuts: good.length, used: (result.used || []).length, miss: result.miss || [], bad: result.bad || [],
			shortage: rows.reduce(function (s, r) { return s + (r.shortage > 0 ? 1 : 0); }, 0), canWrite: rows.length > 0 };
	};
})();
