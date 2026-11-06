/* STHGroup 2.0 — правила отображения сметы. Фильтры не меняют расчёт, порядок строк и документы. */
(function () {
	'use strict';
	var K = BM.sthEst = {};
	K.FILTERS = [['all', 'Все'], ['problem', 'Проблемные'], ['replaced', 'Заменённые'], ['noPrice', 'Без цены'], ['stock', 'Со склада']];
	K.rowKey = function (w) { return w.kind + '|' + (w.ownId || w.offKey || w.priceId); };
	/* STHGroup: состав — справочное представление существующих расчётных строк. */
	K.kitDetails = function (rows, selected) {
		var parent = selected;
		if (selected.sthKitId) parent = rows.filter(function (w) { return w.sthKit && w.sthKit.id === selected.sthKitId; })[0];
		if (selected.sthPart) parent = rows.filter(function (w) { return K.rowKey(w) === selected.sthPart; })[0];
		if (!parent || (!parent.sthKit && !parent.sthSplit)) return null;
		var parts = rows.filter(function (w) { return parent.sthKit ? (parent.sthMem || []).indexOf(K.rowKey(w)) >= 0 : w.sthPart === K.rowKey(parent); });
		return { parent: parent, parts: parts.map(function (w) {
			var ref = w.sthReference || w, price = Number(ref.priceOut !== undefined ? ref.priceOut : ref.price || 0);
			return { row: w, price: price, total: Math.round(w.val * price) };
		}) };
	};
	K.active = function (w) { return !!w && !w.off && !w.info; };
	K.noPrice = function (w) { return K.active(w) && !w.own && !w.card && w.kind !== 'own' && w.kind !== 'extra' && w.val > 0 && !(Number(w.price) > 0); };
	K.problem = function (w, info) {
		if (!K.active(w) || w.own || w.card || w.kind === 'extra') return false;
		return !!w.bad || (!info && ['panel', 'linear', 'edge', 'fastener', 'profile'].indexOf(w.kind) >= 0);
	};
	K.stock = function (w, info) { return K.active(w) && !!(info && Number(info.stock) > 0); };
	K.match = function (w, filter, info) {
		if (filter === 'problem') return K.problem(w, info);
		if (filter === 'replaced') return !!w.sthReplace;
		if (filter === 'noPrice') return K.noPrice(w);
		if (filter === 'stock') return K.stock(w, info);
		return true;
	};
	K.rows = function (rows, filter, infoOf) {
		return (rows || []).filter(function (w) { return K.match(w, filter, infoOf ? infoOf(w) : null); });
	};
	K.counts = function (rows, infoOf) {
		var out = { all: (rows || []).length, problem: 0, replaced: 0, noPrice: 0, stock: 0 };
		(rows || []).forEach(function (w) {
			var inf = infoOf ? infoOf(w) : null;
			if (K.problem(w, inf)) out.problem++;
			if (w.sthReplace) out.replaced++;
			if (K.noPrice(w)) out.noPrice++;
			if (K.stock(w, inf)) out.stock++;
		});
		return out;
	};
})();
