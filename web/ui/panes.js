/* STHGroup — боковые панели: спрятать и вернуть язычком, компактный вид маленького окна (только полная версия и планшет).
   - Язычок «‹»/«›» на стыке панели (ui/split.js): панель прячется, чертёж или 3D — шире; язычок остаётся у края — вернуть.
     Что спрятано — в настройках (set.paneOff), переживает перезапуск.
   - Компактный вид (body.phone): окно ниже 560 или уже 900 точек (ноутбук, окно не на весь экран, телефон) — шапка и вкладки
     проектов одной строкой, без строки состояния, разделы иконками; боковые панели выезжают поверх — язычком на краю или
     свайпом от края, закрываются касанием мимо панели. */
(function () {
	'use strict';
	var P = window.Panes = {};
	function A() { return window.App; }
	function S() { return A() && A().S; }
	P.on = function () { var s = S(); return !!(s && s.boot && s.boot.edition !== 'test'); };
	function store() { var s = S().set; if (!s.paneOff || typeof s.paneOff !== 'object') s.paneOff = {}; return s.paneOff; }
	function fit() { setTimeout(function () { try { window.dispatchEvent(new Event('resize')); } catch (e) { } }, 30); }
	function tongueText(el) { var l = el.dataset.side !== 'r', off = el.classList.contains('paneOff'); return l ? (off ? '›' : '‹') : (off ? '‹' : '›'); }

	/* Панели со стыком (вызывает Split.attach): язычок на стыке и язычок для компактного вида. */
	P.decorate = function (el, h) {
		if (!P.on() || el.tagName !== 'ASIDE' || el.dataset.tng) return;
		el.dataset.tng = '1';
		var key = el.dataset.pane;
		if (store()[key]) el.classList.add('paneOff');
		var t = document.createElement('button');
		t.type = 'button'; t.className = 'tng ' + (el.dataset.side === 'r' ? 'r' : 'l');
		function upd() { t.textContent = tongueText(el); t.title = el.classList.contains('paneOff') ? 'Показать панель' : 'Спрятать панель — чертёж шире'; }
		upd();
		t.addEventListener('mousedown', function (e) { e.stopPropagation(); });
		t.addEventListener('dblclick', function (e) { e.stopPropagation(); });
		t.onclick = function (e) {
			e.stopPropagation();
			var off = el.classList.toggle('paneOff');
			if (off) store()[key] = 1; else delete store()[key];
			upd(); A().saveSettings(); fit();
		};
		h.appendChild(t);
		/* язычок компактного вида: на краю области, панель выезжает поверх */
		var g = document.createElement('button');
		g.type = 'button'; g.className = 'grip ' + (el.dataset.side === 'r' ? 'r' : 'l') + (el.parentNode.id === 'main' ? ' inMain' : '');
		g.textContent = el.dataset.side === 'r' ? '‹' : '›';
		g.title = 'Открыть панель';
		g.onclick = function (e) { e.stopPropagation(); open(el); };
		el.parentNode.appendChild(g);
	};

	/* ---- компактный вид ---- */
	function asides() { return [].slice.call(document.querySelectorAll('aside[data-tng]')); }
	function shown(a) { return a.getClientRects().length > 0 && getComputedStyle(a).display !== 'none'; }
	function cur(side) { return asides().filter(function (a) { return (a.dataset.side === 'r' ? 'r' : 'l') === side && shown(a); })[0]; }
	function close() { var any = false; asides().forEach(function (a) { if (a.classList.contains('open')) { a.classList.remove('open'); any = true; } }); return any; }
	function open(a) { close(); if (a) a.classList.add('open'); }
	P.open = function (side) { open(cur(side)); };
	P.close = close;
	P.compact = function () { return document.body.classList.contains('phone'); };
	P.check = function () {
		if (!P.on()) return;
		var want = window.innerHeight < 560 || window.innerWidth < 900, b = document.body;
		if (want === b.classList.contains('phone')) return;
		var tabs = document.getElementById('ptabs'), fd = document.getElementById('fileDd'), main = document.getElementById('main');
		b.classList.toggle('phone', want);
		if (want) { if (tabs && fd && fd.parentNode) fd.parentNode.after(tabs); }
		else { close(); if (tabs && main) main.parentNode.insertBefore(tabs, main); }
		fit();
	};
	P.init = function () {
		if (!P.on()) return;
		window.BRPhone = { open: P.open, close: close };
		/* касание мимо открытой панели — закрыть (само касание чертежу не передаётся) */
		document.addEventListener('pointerdown', function (e) {
			if (!P.compact()) return;
			var op = asides().filter(function (a) { return a.classList.contains('open'); })[0];
			if (!op || op.contains(e.target) || e.target.closest('.modal, .ddMenu, .ctxMenu, .thMenu, .mMenu, .grip, #toasts')) return;
			close(); e.preventDefault(); e.stopPropagation();
		}, true);
		/* свайп от края: от левого края области (сразу за полосой разделов) — панель слева, от правого края — справа */
		var sw = null;
		document.addEventListener('touchstart', function (e) {
			if (!P.compact() || e.touches.length !== 1 || document.querySelector('.back:not(.out) > .modal')) { sw = null; return; }
			var t = e.touches[0], rail = document.getElementById('rail'), x0 = rail ? rail.getBoundingClientRect().right : 0;
			var side = (t.clientX >= x0 - 4 && t.clientX <= x0 + 26) ? 'l' : (t.clientX >= window.innerWidth - 26 ? 'r' : '');
			sw = side ? { side: side, x: t.clientX, y: t.clientY } : null;
		}, { passive: true, capture: true });
		document.addEventListener('touchmove', function (e) {
			if (!sw) return;
			var t = e.touches[0], dx = t.clientX - sw.x, dy = t.clientY - sw.y;
			if (Math.abs(dy) > 40 && Math.abs(dy) > Math.abs(dx)) { sw = null; return; }
			if ((sw.side === 'l' && dx > 40) || (sw.side === 'r' && dx < -40)) { var a = cur(sw.side); sw = null; if (a) open(a); }
		}, { passive: true, capture: true });
		/* смена раздела — выехавшие панели закрыть */
		new MutationObserver(function () { close(); }).observe(document.body, { attributes: true, attributeFilter: ['data-sec'] });
		window.addEventListener('resize', P.check);
		P.check();
	};
})();
