/* STHGroup — стыки панелей: ширину любой боковой панели (и колонок классов в «Базе») можно тянуть мышью.
   Панель помечается data-pane="имя" и data-side="l" (стык справа от неё) или "r" (стык слева). Ширина
   запоминается в настройках (set.panes), двойной щелчок по стыку — вернуть как было.
   Здесь же — меню правой кнопки мыши (UI.menu). */
(function () {
	'use strict';
	var U = window.UI;
	var Sp = window.Split = {};
	function S() { return window.App.S; }
	function store() { var s = S().set; if (!s.panes || typeof s.panes !== 'object') s.panes = {}; return s.panes; }
	function apply(el, w) { el.style.width = w + 'px'; el.style.flex = '0 0 ' + w + 'px'; el.style.minWidth = '0'; }
	/* Найти помеченные панели и поставить им стыки (уже стоящие не трогаются). */
	Sp.attach = function (root) {
		(root || document).querySelectorAll('[data-pane]').forEach(function (el) {
			if (el.dataset.split) return;
			el.dataset.split = '1';
			var key = el.dataset.pane, left = el.dataset.side !== 'r', w = store()[key];
			if (w > 0) apply(el, w);
			var h = document.createElement('div');
			h.className = 'splitH';
			h.title = 'Потяните, чтобы изменить ширину. Двойной щелчок — как было';
			el.parentNode.insertBefore(h, left ? el.nextSibling : el);
			if (window.Panes) window.Panes.decorate(el, h);            // язычок «спрятать панель» и компактный вид (ui/panes.js)
			h.addEventListener('mousedown', function (e) {
				if (e.button !== 0 || el.classList.contains('paneOff')) return;
				e.preventDefault();
				var x0 = e.clientX, w0 = el.getBoundingClientRect().width, max = Math.max(200, el.parentNode.getBoundingClientRect().width * 0.75), min = Number(el.dataset.min) || 120;
				h.classList.add('on'); document.body.classList.add('splitting');
				function mv(ev) { var d = ev.clientX - x0; apply(el, Math.round(Math.max(min, Math.min(max, w0 + (left ? d : -d))))); }
				function up() {
					document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up);
					h.classList.remove('on'); document.body.classList.remove('splitting');
					store()[key] = Math.round(el.getBoundingClientRect().width);
					window.App.saveSettings();
					window.dispatchEvent(new Event('resize'));                    // карта, 3D и таблицы подстраиваются
				}
				document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
			});
			h.addEventListener('dblclick', function () {
				if (el.classList.contains('paneOff')) return;
				delete store()[key];
				el.style.width = ''; el.style.flex = ''; el.style.minWidth = '';
				window.App.saveSettings();
				window.dispatchEvent(new Event('resize'));
			});
		});
	};

	/* Меню правой кнопки мыши: acts — [[надпись, действие, подсказка клавиши?], null — черта]. */
	var menuEl = null;
	function close() { if (menuEl) { menuEl.remove(); menuEl = null; } }
	U.menu = function (x, y, acts) {
		close();
		menuEl = document.createElement('div');
		menuEl.className = 'mMenu ctxMenu';
		acts.forEach(function (a) {
			if (!a) { menuEl.appendChild(document.createElement('hr')); return; }
			var b = document.createElement('button');
			b.innerHTML = U.esc(a[0]) + (a[2] ? '<span class="k">' + U.esc(a[2]) + '</span>' : '');
			if (a[3]) b.disabled = true;
			b.onclick = function () { close(); a[1](); };
			menuEl.appendChild(b);
		});
		document.body.appendChild(menuEl);
		var r = menuEl.getBoundingClientRect();
		menuEl.style.left = Math.max(4, Math.min(x, window.innerWidth - r.width - 6)) + 'px';
		menuEl.style.top = Math.max(4, Math.min(y, window.innerHeight - r.height - 6)) + 'px';
	};
	U.menuClose = close;
	document.addEventListener('mousedown', function (e) { if (menuEl && !menuEl.contains(e.target)) close(); }, true);
	document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
	window.addEventListener('blur', close);
})();
