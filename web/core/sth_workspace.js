/* STHGroup 2.0 — чистая сводка рабочего экрана «Сегодня». */
(function () {
	'use strict';
	var O = BM.sth, K = BM.sthWorkspace = {};
	K.summary = function (book) {
		var list = book && Array.isArray(book.orders) ? book.orders : [], out = { total: list.length, active: 0, work: 0, ready: 0, debt: 0, crm: 0, attention: [] };
		list.forEach(function (o) {
			var active = ['calc', 'agreed', 'work'].indexOf(o.status) >= 0;
			if (active) { out.active++; out.attention.push(o); }
			if (o.status === 'work') out.work++;
			if (o.status === 'ready') out.ready++;
			if (o.source === 'crm') out.crm++;
			try { var q = O.calc(book, o); if (q.paid > 0) out.debt += Math.max(0, q.debt); } catch (e) { /* неполный заказ не мешает сводке */ }
		});
		out.debt = O.r2(out.debt);
		out.attention.sort(function (a, b) { return String(b.statusAt || b.date || '').localeCompare(String(a.statusAt || a.date || '')); });
		return out;
	};
})();
