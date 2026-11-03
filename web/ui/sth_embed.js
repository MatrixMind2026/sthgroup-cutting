/* STHGroup — база материалов и CRM внутри программы (разделы слева «База» и «CRM»), а не отдельными окнами.
   База: страница matbase.html во фрейме раздела #mbase (загружается один раз, уходя из раздела — сохраняется и смета пересчитывается).
   CRM: сайт CRM в разделе #crm — в программе (Electron) через <webview> с отдельным хранилищем входа persist:sthcrm, в браузере — фреймом. */
(function () {
	'use strict';
	var U = window.UI, esc = U.esc, K = window.MatBase;
	var X = window.STHEmbed = {};
	function $(id) { return document.getElementById(id); }
	function token() { return new URLSearchParams(location.search).get('t') || ''; }
	var isApp = /Electron/i.test(navigator.userAgent);
	var CRM0 = 'https://crm.migman.ru/app/';

	/* ------------------------------- база --------------------------------- */
	function baseUrl() { return 'matbase.html?t=' + encodeURIComponent(token()) + (K && K.path ? '&file=' + encodeURIComponent(K.path) : '') + '&embed=1'; }
	function showBase() {
		var host = $('mbase'); if (!host) return;
		var f = host.querySelector('iframe');
		if (!f) { host.innerHTML = '<iframe title="База материалов"></iframe>'; f = host.querySelector('iframe'); f.src = baseUrl(); X.baseFile = K && K.path; return; }
		/* файл базы сменили в настройках — открыть новый */
		if (K && K.path !== X.baseFile) { X.baseFile = K.path; f.src = baseUrl(); }
	}
	function leaveBase() {
		var f = $('mbase') && $('mbase').querySelector('iframe');
		try { if (f && f.contentWindow && f.contentWindow.MBW) f.contentWindow.MBW.save(); } catch (e) { /* нет */ }
		setTimeout(function () { if (K && K.changed) K.changed(); }, 300);
	}
	/* всё, что раньше открывало отдельное окно базы, теперь открывает раздел */
	if (K) K.open = function () { if (window.Drill) window.Drill.section('mbase'); };

	/* -------------------------------- CRM ---------------------------------- */
	async function crmUrl() {
		try { var s = await U.api.crm.state(); return (s && s.url) || CRM0; } catch (e) { return CRM0; }
	}
	function view() { return $('crm') && $('crm').querySelector('webview, iframe'); }
	async function showCrm() {
		var host = $('crm'); if (!host) return;
		if (view()) return;
		var url = await crmUrl();
		host.innerHTML = '<div class="crmBar"><button id="crmBack" title="Назад">‹</button><button id="crmFwd" title="Вперёд">›</button><button id="crmReload" title="Обновить страницу">⟳</button><button id="crmHome" title="Главная страница CRM">Главная</button>' +
			'<span class="crmUrl" id="crmAddr">' + esc(url) + '</span><button id="crmExt" title="Открыть CRM в обычном браузере">В браузере</button><button id="crmSet" title="Адрес CRM, вход и обмен заказами">Настройки CRM</button></div>' +
			'<div class="crmView">' + (isApp ? '<webview src="' + esc(url) + '" partition="persist:sthcrm" allowpopups></webview>' : '<iframe src="' + esc(url) + '" title="CRM"></iframe>') + '</div>';
		X.crmHome = url;
		var v = view();
		if (isApp && v) {
			var addr = function () { try { $('crmAddr').textContent = v.getURL(); } catch (e) { /* нет */ } };
			v.addEventListener('did-navigate', addr); v.addEventListener('did-navigate-in-page', addr);
			v.addEventListener('did-fail-load', function (e) {
				if (e.errorCode === -3 || !e.isMainFrame) return;          // -3 — переход прерван, это не ошибка
				$('crmAddr').textContent = 'CRM не открылась: ' + (e.errorDescription || e.errorCode) + '. Проверьте интернет и адрес в «Настройки CRM».';
			});
		}
	}
	document.addEventListener('click', function (e) {
		var t = e.target, v = view();
		if (!t.closest || !t.closest('#crm .crmBar')) return;
		try {
			if (t.closest('#crmBack')) { if (v && v.canGoBack && v.canGoBack()) v.goBack(); else if (v && !isApp) v.contentWindow.history.back(); }
			else if (t.closest('#crmFwd')) { if (v && v.canGoForward && v.canGoForward()) v.goForward(); }
			else if (t.closest('#crmReload')) { if (v && v.reload) v.reload(); else if (v) v.src = v.src; }
			else if (t.closest('#crmHome')) { crmUrl().then(function (u) { X.crmHome = u; if (v) { if (v.loadURL) v.loadURL(u); else v.src = u; } }); }
			else if (t.closest('#crmExt')) { var u = (v && v.getURL && v.getURL()) || X.crmHome || CRM0; window.open(u, '_blank'); }
			else if (t.closest('#crmSet')) { if (window.Dlg && window.Dlg.settings) window.Dlg.settings('crm'); }
		} catch (er) { U.error(er); }
	});
	/* адрес CRM поменяли в настройках — при следующем открытии раздела загрузить заново */
	X.resetCrm = function () { var h = $('crm'); if (h) h.innerHTML = ''; };
	window.addEventListener('focus', function () { /* ничего: вход хранится в webview */ });

	/* ------------------------------ разделы -------------------------------- */
	X.show = function (sec) { if (sec === 'mbase') showBase(); else if (sec === 'crm') showCrm().catch(U.error); };
	X.leave = function (was) { if (was === 'mbase') leaveBase(); };
	/* Esc в разделе базы не должен ничего закрывать; прежний оверлей базы остаётся для выбора материала из сметы */
})();
