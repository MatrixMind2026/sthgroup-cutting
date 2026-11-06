/* STHGroup: происхождение начальных цен и явное подтверждение собственной цены. */
(function () {
	'use strict';
	var O = BM.sth;
	function rows(cat) { return (cat.sheetWorks || []).concat(cat.services || [], (cat.groups || []).reduce(function (a, g) { return a.concat(g.rows || []); }, [])); }
	var defaults = O.defCatalog;
	O.defCatalog = function () {
		var cat = defaults();
		rows(cat).forEach(function (r) { r.sampleSource = /^f_|^d_|^e_|^m_/.test(r.id) ? 'FOXY' : 'Начальный прайс'; r.samplePrice = r.price; r.priceVerified = false; });
		return cat;
	};
	O.isSamplePrice = function (r) { return !!(r && r.sampleSource && !r.priceVerified && Number(r.price) === Number(r.samplePrice)); };
	O.priceMeta = function (old, price, verified) {
		return { sampleSource: old && old.sampleSource || '', samplePrice: old && old.samplePrice,
			priceVerified: !!(verified || old && (old.priceVerified || Number(old.price) !== Number(price))) };
	};
	var fix = O.fix;
	O.fix = function (b) {
		b = fix(b); var initial = {}; rows(O.defCatalog()).forEach(function (r) { initial[r.id] = r; });
		rows(b.cat).forEach(function (r) {
			if (r.sampleSource === undefined && initial[r.id]) Object.assign(r, O.priceMeta(initial[r.id], r.price, Number(r.price) !== Number(initial[r.id].price)));
		}); return b;
	};
	var calc = O.calc;
	O.calc = function (book, order) {
		var q = calc.apply(this, arguments), cat = book.cat, byKey = {}, used = [];
		(cat.sheetWorks || []).forEach(function (r) { byKey['w:' + r.id] = r; });
		(cat.services || []).forEach(function (r) { byKey[r.id] = r; });
		(cat.groups || []).forEach(function (g) { (g.rows || []).forEach(function (r) { byKey['g:' + r.id] = r; }); });
		q.blocks.forEach(function (block) { block.lines.forEach(function (line) {
			var override = order.svc && order.svc[line.key];
			line.samplePrice = O.isSamplePrice(byKey[line.key]) && !(override && override.price !== undefined && override.price !== '');
			line.sampleSource = line.samplePrice ? byKey[line.key].sampleSource : '';
			if (line.samplePrice && line.qty > 0 && (!line.check || line.on)) used.push(line.name);
		}); });
		q.samplePrices = used;
		if (used.length) q.warn.push('Используются цены-образцы (' + used.length + '): ' + used.slice(0, 4).join('; ') + '. Проверьте и подтвердите свои цены в справочнике.');
		return q;
	};
})();
