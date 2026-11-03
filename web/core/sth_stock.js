/* STHGroup — склад (раздел «Склад»): поверх склада базы материалов BazisReborn (b.stock: документы прихода/расхода, деловые обрезки).
   Здесь добавлено: вкладки по видам (листы, обрезки, кромка и погонаж, фурнитура), резерв под заказ (b.stock.res),
   ячейка хранения (b.stock.cells: материал → ячейка), резерв обрезка (o.res), поиск подходящего обрезка. Склад один — в файле базы материалов. */
(function () {
	'use strict';
	var MB = BM.mb, K = BM.stock = {};
	function num(v, d) { var n = Number(String(v === undefined || v === null ? '' : v).replace(',', '.').replace(/\s/g, '')); return isFinite(n) && String(v).trim() !== '' ? n : (d || 0); }
	function low(s) { return String(s || '').toLowerCase().replace(/ё/g, 'е').trim(); }
	function r6(v) { return Math.round(v * 1e6) / 1e6; }
	K.TABS = [['sheet', 'Листы'], ['off', 'Обрезки'], ['lin', 'Кромка, погонаж'], ['fit', 'Фурнитура'], ['moves', 'Движения']];

	K.fix = function (b) {
		if (!b.stock || typeof b.stock !== 'object') b.stock = { docs: [], offcuts: [] };
		if (!Array.isArray(b.stock.res)) b.stock.res = [];
		if (!b.stock.cells || typeof b.stock.cells !== 'object' || Array.isArray(b.stock.cells)) b.stock.cells = {};
		b.stock.res = b.stock.res.filter(function (r) { return r && b.mats[r.mat] && r.qty > 0; });
		return b;
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
		if (!(qty > 0)) { if (r) b.stock.res.splice(b.stock.res.indexOf(r), 1); return null; }
		if (!r) { r = { id: MB.newId('r'), mat: mat, order: order.id }; b.stock.res.push(r); }
		r.qty = qty; r.no = String(order.no || ''); r.date = MB.today();
		return r;
	};
	K.unreserve = function (b, id) { K.fix(b); var n = b.stock.res.length; b.stock.res = b.stock.res.filter(function (r) { return r.id !== id; }); return n !== b.stock.res.length; };
	K.unreserveOrder = function (b, orderId) {
		K.fix(b);
		b.stock.res = b.stock.res.filter(function (r) { return r.order !== orderId; });
		b.stock.offcuts.forEach(function (o) { if (o.res === orderId) { delete o.res; delete o.resNo; } });
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
	K.setCell = function (b, mat, cell) { K.fix(b); cell = String(cell || '').trim(); if (cell) b.stock.cells[mat] = cell; else delete b.stock.cells[mat]; };

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
		return d;
	};

	/* -------------------------------- обрезки ---------------------------------- */
	K.offRows = function (b, q) {
		K.fix(b);
		var ql = low(q);
		return MB.offcuts(b).filter(function (o) { var m = b.mats[o.mat]; return m && (!ql || low(m.name).indexOf(ql) >= 0 || low(m.art).indexOf(ql) >= 0 || (o.L + '×' + o.W).indexOf(ql) >= 0); })
			.sort(function (x, y) { var a = b.mats[x.mat].name.localeCompare(b.mats[y.mat].name, 'ru'); return a || y.L * y.W - x.L * x.W; });
	};
	/* подходящие свободные обрезки материала под кусок L×W (в любом повороте), самые маленькие — первыми */
	K.findOff = function (b, mat, L, W) {
		var a = Math.max(num(L), num(W)), c = Math.min(num(L), num(W));
		return MB.offcuts(b, mat).filter(function (o) { return !o.res && o.L >= a && o.W >= c; }).sort(function (x, y) { return x.L * x.W - y.L * y.W; });
	};
	K.reserveOff = function (b, id, order) {
		var o = b.stock.offcuts.filter(function (x) { return x.id === id; })[0];
		if (!o) return false;
		if (order && order.id) { o.res = order.id; o.resNo = String(order.no || ''); } else { delete o.res; delete o.resNo; }
		return true;
	};
	K.dropOff = function (b, id) { var o = b.stock.offcuts.filter(function (x) { return x.id === id; })[0]; if (!o) return false; o.gone = 1; return true; };

	/* -------------------------------- движения --------------------------------- */
	K.KIND = { 'in': 'Приход', out: 'Расход', adj: 'Корректировка' };
	K.moves = function (b, q) {
		var ql = low(q);
		return b.stock.docs.slice().reverse().filter(function (d) {
			if (!ql) return true;
			return low(d.project).indexOf(ql) >= 0 || low(d.note).indexOf(ql) >= 0 || d.lines.some(function (l) { var m = b.mats[l.mat]; return m && low(m.name).indexOf(ql) >= 0; });
		});
	};
})();
