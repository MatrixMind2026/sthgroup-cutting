/* STHGroup: проверка готовности изделия к КП; только чтение, без пересчёта раскроя. */
(function () {
	'use strict';
	var C = BM.sthOrderCheck = {};
	C.inspect = function (st, R, infoOf) {
		var issues = [], E = BM.sthEst, P = BM.project;
		(R.rows || []).forEach(function (w) {
			if (!E.active(w) || w.own || w.card || ['panel', 'linear', 'edge', 'fastener', 'profile'].indexOf(w.kind) < 0 || !(w.val > 0)) return;
			var key = E.rowKey(w), title = w.title || w.label || '';
			if (!(Number(w.price) > 0)) issues.push({ kind: 'noPrice', row: key, title: title, section: 'est', message: 'Не указана цена' });
			if (!infoOf(w)) issues.push({ kind: 'unlinked', row: key, title: title, section: 'est', message: 'Не сопоставлено с базой материалов' });
		});
		P.summary(st).mats.forEach(function (m) {
			if (!m.on || !m.n) return;
			var title = m.mat.name || '';
			if (m.stale) issues.push({ kind: 'stale', mat: m.mat.key, title: title, section: 'cut', message: 'Раскрой отсутствует или устарел' });
			if (m.unplaced || m.buf) issues.push({ kind: 'unplaced', mat: m.mat.key, title: title, section: 'cut', message: 'Не размещено деталей: ' + ((m.unplaced || 0) + (m.buf || 0)) });
		});
		return issues;
	};
})();
