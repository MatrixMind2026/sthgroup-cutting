/* STHGroup — встроенный браузер для поиска товара: STHBrowser.open({ url, query }) → адрес страницы, которую выбрали («Взять эту ссылку»), или null.
   В программе — <webview> с тем же профилем магазинов, что «Войти на сайт» и «Заполнить по ссылке» (persist:shops): вход на сайт общий.
   В браузере (проверки) — фрейм; многие магазины запрещают показ во фрейме, это не ошибка программы. */
(function () {
	'use strict';
	var U = window.UI, esc = U.esc;
	var B = window.STHBrowser = {};
	var isApp = /Electron/i.test(navigator.userAgent);
	var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
	B.SEARCH = 'https://yandex.ru/search/?text=';
	/* что набрали в строке адреса: ссылка или слова для поиска */
	B.toUrl = function (s) {
		s = String(s || '').trim();
		if (!s) return '';
		if (/^https?:\/\//i.test(s)) return s;
		if (!/\s/.test(s) && /^[\w.-]+\.[a-zа-яё]{2,}(\/|$|:)/i.test(s)) return 'https://' + s;
		return B.SEARCH + encodeURIComponent(s);
	};
	B.open = async function (o) {
		o = o || {};
		var start = B.toUrl(o.url) || (o.query ? B.toUrl(o.query + ' купить') : 'https://yandex.ru/');
		var view = null;
		function cur() { try { return view && (view.getURL ? view.getURL() : view.src); } catch (e) { return ''; } }
		var res = await U.modal({ title: o.title || 'Браузер: найдите товар и нажмите «Взять эту ссылку»', width: 1180, cls: 'sthBrw',
			body: '<div class="brBar"><button id="brBack" title="Назад">‹</button><button id="brFwd" title="Вперёд">›</button><button id="brReload" title="Обновить">⟳</button>' +
				'<input type="text" id="brAddr" value="' + esc(start) + '" placeholder="Адрес сайта или что искать" spellcheck="false"><button id="brGo">Перейти</button></div>' +
				'<div class="brView">' + (isApp ? '<webview src="' + esc(start) + '" partition="persist:shops" useragent="' + esc(UA) + '" allowpopups></webview>' : '<iframe src="' + esc(start) + '" title="Браузер"></iframe>') + '</div>' +
				'<div class="mute sm brHint">' + (o.login ? 'Войдите на сайте магазина (логин и пароль вводятся прямо на сайте). Вход запоминается — «Заполнить по ссылке» будет брать цены под ним.' : 'Откройте карточку нужного товара (не список товаров) и нажмите «Взять эту ссылку». Вход на сайт магазина запоминается.') + '</div>',
			buttons: o.login ? [{ label: 'Готово — я вошёл', primary: true, value: null }] : [{ label: 'Отмена', value: null }, { label: 'Взять эту ссылку', primary: true, run: function () {
				var u = cur();
				if (!/^https?:\/\//i.test(u || '')) { U.toast('Страница ещё не открылась.'); return false; }
				if (u.indexOf(B.SEARCH) === 0) { U.toast('Это страница поиска — откройте карточку товара.'); return false; }
				return u;
			} }],
			onOpen: function (el) {
				view = el.querySelector('webview, iframe');
				var addr = el.querySelector('#brAddr');
				function go() { var u = B.toUrl(addr.value); if (!u) return; if (view.loadURL) view.loadURL(u).catch(function () {}); else view.src = u; }
				el.querySelector('#brGo').onclick = go;
				addr.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); go(); } });
				el.querySelector('#brBack').onclick = function () { if (view.canGoBack && view.canGoBack()) view.goBack(); };
				el.querySelector('#brFwd').onclick = function () { if (view.canGoForward && view.canGoForward()) view.goForward(); };
				el.querySelector('#brReload').onclick = function () { if (view.reload) view.reload(); else view.src = view.src; };
				if (isApp) {
					var show = function () { if (document.activeElement !== addr) addr.value = cur(); };
					view.addEventListener('did-navigate', show); view.addEventListener('did-navigate-in-page', show);
					view.addEventListener('did-fail-load', function (e) { if (e.isMainFrame && e.errorCode !== -3) U.toast('Страница не открылась: ' + (e.errorDescription || e.errorCode), { bad: true }); });
				}
			} });
		return res || null;
	};
})();
