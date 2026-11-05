/* STHGroup: раскрытые блоки, прокрутка и фокус центра заказа переживают пересчёт формы. */
(function () {
	'use strict';
	var X = window.STHO; if (!X) return;
	var views = {}, render = X.render;
	function context() {
		var host = document.getElementById('orders');
		var center = host && !host.classList.contains('soBoardMode') && host.querySelector('.soC[data-sg-order]');
		return center ? { host: host, center: center, key: center.dataset.sgOrder + '|' + center.dataset.sgTab } : null;
	}
	X.render = async function () {
		var old = context(), focus = null, active = document.activeElement;
		if (old) {
			views[old.key] = { open: Array.from(old.center.querySelectorAll('details')).map(function (d) { return d.open; }), sideOpen: Array.from(old.host.querySelectorAll('.soS details')).map(function (d) { return d.open; }), top: old.center.scrollTop, right: old.host.querySelector('.soS').scrollTop };
			if (active && old.host.contains(active) && active.matches('input,select,textarea')) {
				focus = { id: active.id, attr: '', value: '', start: null };
				['data-pr', 'data-qt', 'data-xn', 'data-xu', 'data-it'].some(function (a) { if (!active.hasAttribute(a)) return false; focus.attr = a; focus.value = active.getAttribute(a); return true; });
				try { focus.start = active.selectionStart; } catch (e) { /* select/date */ }
			}
		}
		var result = await render.apply(this, arguments), cur = context();
		if (cur && views[cur.key]) {
			var v = views[cur.key]; cur.center.querySelectorAll('details').forEach(function (d, i) { if (v.open[i] !== undefined) d.open = v.open[i]; });
			cur.host.querySelectorAll('.soS details').forEach(function (d, i) { if (v.sideOpen[i] !== undefined) d.open = v.sideOpen[i]; });
			cur.center.scrollTop = v.top; cur.host.querySelector('.soS').scrollTop = v.right;
			if (old && old.key === cur.key && focus) {
				var el = focus.id ? document.getElementById(focus.id) : null;
				if (!el && focus.attr) cur.center.querySelectorAll('[' + focus.attr + ']').forEach(function (node) { if (node.getAttribute(focus.attr) === focus.value) el = node; });
				if (el && cur.host.contains(el)) { el.focus({ preventScroll: true }); if (focus.start !== null && el.setSelectionRange) try { el.setSelectionRange(focus.start, focus.start); } catch (e) { /* number/date */ } }
			}
		}
		return result;
	};
})();
