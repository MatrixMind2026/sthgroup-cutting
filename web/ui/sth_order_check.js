/* STHGroup: проверка заказа вручную и перед КП, с переходами к замечаниям. */
(function () {
	'use strict';
	var X = window.STHO, U = window.UI, P = BM.project, O = BM.sth, C = BM.sthOrderCheck;
	if (!X || !U || !C) return;
	var busy = false;
	function S() { return window.App.S; }
	function same(a, b) { return String(a || '').replace(/\\/g, '/').toLowerCase() === String(b || '').replace(/\\/g, '/').toLowerCase(); }
	function amounts(s) { return JSON.stringify([s.mat, s.fit, s.parts, s.smallEdge, s.smallDrill, s.sheets]); }
	async function scan(o) {
		var result = [], s = S(), K = window.MatBase, E = BM.est;
		if (!o.items.length) return [{ kind: 'empty', title: 'Заказ', message: 'Нет изделий для проверки', section: 'items' }];
		await K.refresh();
		for (var i = 0; i < o.items.length; i++) {
			var it = o.items[i], name = it.title || U.baseOf(it.path);
			try {
				var ti = window.App.tabOf(it.path), st = same(s.path, it.path) ? s.st : (ti >= 0 && s.tabs[ti] ? s.tabs[ti].st : null);
				if (!st) st = P.build(JSON.parse(await U.api.readText(it.path)), s.set);
				var R = K.build(st, window.Est.cfg(), E.listFor(s.prices, st), st.work.est, s.prices ? s.prices.sup : {});
				C.inspect(st, R, function (w) { return K.rowInfo(w); }).forEach(function (issue) {
					issue.path = it.path; issue.item = name; result.push(issue);
				});
				var fresh = O.snapshot(st, R, X.book.cat, name, it.path);
				if (!it.snap || amounts(it.snap) !== amounts(fresh)) result.push({ kind: 'snapshot', path: it.path, item: name, title: name, section: 'items', message: 'Обновите расчёт изделия на вкладке «Изделия»' });
			} catch (e) {
				result.push({ kind: 'unreadable', item: name, title: name, section: 'items', message: 'Не удалось проверить изделие: ' + e.message });
			}
		}
		return result;
	}
	async function navigate(o, issue) {
		if (issue.section === 'items') { X.cur = o.id; X.tab = 'items'; X.view = 'list'; X.go('orders'); await X.render(); return; }
		var A = window.App, ti = A.tabOf(issue.path);
		if (ti >= 0) A.switchTab(ti); else if (!(await A.openPath(issue.path))) return;
		var s = S();
		if (issue.section === 'cut' && issue.mat) s.matKey = issue.mat;
		if (issue.section === 'est') s.set.sthEstFilter = 'all';
		X.go(issue.section);
		if (issue.row && window.STHEst) {
			window.Est.render(); window.STHEst.setOpen(issue.row, true);
			document.querySelectorAll('#eBody [data-seexpand]').forEach(function (b) { if (b.dataset.seexpand === issue.row) b.scrollIntoView({ block: 'nearest' }); });
		}
	}
	async function check(o, forQuote) {
		if (busy) return false; busy = true;
		try {
			U.toast('Проверяю изделия заказа…');
			var issues = await scan(o);
			if (!issues.length && forQuote) return true;
			var body = issues.length ? '<p class="note warn">Замечаний: ' + issues.length + '. Проверка не меняет цены и раскрой.</p><table class="grid"><thead><tr><th>Изделие / позиция</th><th>Что проверить</th><th></th></tr></thead><tbody>' + issues.map(function (r, i) {
				return '<tr><td>' + U.esc(r.item || '') + '<div>' + U.esc(r.title) + '</div></td><td>' + U.esc(r.message) + '</td><td><button type="button" data-ocissue="' + i + '">Открыть</button></td></tr>';
			}).join('') + '</tbody></table>' : '<p>Проверено изделий: ' + o.items.length + '. Замечаний не найдено.</p>';
			var choice = await U.modal({ title: 'Проверка заказа ' + o.no, width: 820, body: body,
				buttons: [{ label: 'Закрыть', value: null }].concat(forQuote ? [{ label: 'Открыть КП с предупреждениями', value: 'quote' }] : []),
				onOpen: function (el, close) { el.addEventListener('click', function (e) { var b = e.target.closest('[data-ocissue]'); if (b) close({ issue: Number(b.dataset.ocissue) }); }); } });
			if (choice && typeof choice.issue === 'number' && issues[choice.issue]) await navigate(o, issues[choice.issue]);
			return choice === 'quote';
		} catch (e) { U.error(e); return false; }
		finally { busy = false; }
	}
	X.checkOrder = check;
	X.inspectOrder = scan;
	var doc = X.doc;
	X.doc = async function (o, kind) {
		if (kind === 'kp' && !(await check(o, true))) return;
		return doc.apply(this, arguments);
	};
	document.addEventListener('click', function (e) {
		if (!e.target.closest || !e.target.closest('#soCheckOrder')) return;
		var o = X.book && O.order(X.book, X.cur); if (o) check(o, false);
	});
})();
