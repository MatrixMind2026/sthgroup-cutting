/* STHGroup 2.0 — данные простого экрана раскроя: только листы по материалам. */
(function (G) {
	'use strict';
	var BM = G.BM = G.BM || {}, K = BM.sthCutSimple = {};
	K.view = function (st) {
		if (!st || !BM.project) return { mats: [], sheets: 0, parts: 0, unplaced: 0 };
		var sm = BM.project.summary(st);
		return { sheets: sm.sheets, parts: sm.total, unplaced: sm.unplaced, mats: sm.mats.filter(function (r) { return r.on || r.sheets; }).map(function (r) {
			return { key: r.mat.key, name: BM.project.matTitle ? BM.project.matTitle(r.mat) : r.mat.name, sheets: r.sheets, std: r.std, rem: r.rem, stale: !!r.stale, unplaced: r.unplaced };
		}) };
	};
})(typeof window !== 'undefined' ? window : globalThis);
