/* STHGroup — предпросмотр документов во весь экран (вариант C, выбранный автором): сверху панель
   («← Назад», настройки документа, листов, масштаб, «Сохранить Excel», «Сохранить PDF»), ниже — листы
   прокруткой, ровно как они уйдут в PDF. Это окно U.modal с классом pvFull: Esc закрывает, кнопки — как у окон.

   Pv.open({ title, controls: html настроек, build(m) → { html, pages, warn? }, buttons: [{ label, id, primary, run(m) }],
             onOpen(m, refresh) }) — build зовётся при открытии и после каждой правки настроек. */
(function () {
	'use strict';
	var U = window.UI, esc = U.esc;
	var Pv = window.Preview = {};
	var zoom = 0;                                             // 0 — по ширине окна; иначе — как выбрал человек (на время работы программы)
	var PAGE = '.ePg,.dPg,.cPg,.kPg';
	var logo;
	Pv.logo = function () {
		if (!logo) logo = fetch('img/sth_logo.svg').then(function (r) {
			if (!r.ok) throw new Error('Логотип недоступен');
			return r.text();
		}).catch(function () { logo = null; return ''; });
		return logo;
	};
	Pv.themeControl = function () {
		var dark = document.documentElement.dataset.theme === 'dark';
		return '<label>Тема документа <select class="docTheme"><option value="light"' + (dark ? '' : ' selected') +
			'>Светлая</option><option value="dark"' + (dark ? ' selected' : '') + '>Тёмная</option></select></label>';
	};
	var CSS = '<style id="pvCss">html,body{background:#d3d8dd!important}body{padding:64px 0 70px!important}' +
		'.ePg,.dPg,.cPg,.kPg{margin:0 auto 92px!important;box-shadow:0 0 0 var(--doc-page-margin,12mm) #fff,0 0 0 calc(var(--doc-page-margin,12mm) + 1px) rgba(0,0,0,.10),0 8px 26px var(--doc-page-margin,12mm) rgba(0,0,0,.16)}' +
		'#cutPrint,.eDoc{width:auto!important;margin:0!important}a{cursor:pointer}</style>';

	function plural(n, a, b, c) { return window.App && window.App.plural ? window.App.plural(n, a, b, c) : c; }

	Pv.open = function (o) {
		var cur = null, busy = 0, again = 0;
		function frame(m) { return m.querySelector('iframe.pvFrame'); }
		function applyZoom(m) {
			var f = frame(m), d = f.contentDocument;
			if (!d || !d.body) return;
			var pg = d.querySelector(PAGE), z = zoom;
			if (!z) {
				var margin = parseFloat(d.defaultView.getComputedStyle(d.documentElement).getPropertyValue('--doc-page-margin')) || 12;
				var pw = pg ? pg.getBoundingClientRect().width / (parseFloat(d.body.style.zoom) || 1) + 2 * margin * 96 / 25.4 : 900;
				z = Math.max(0.25, Math.min(1, (f.clientWidth - 40) / pw));
			}
			d.body.style.zoom = z;
			m.querySelector('.pvPct').textContent = Math.round(z * 100) + ' %';
		}
		async function refresh(m) {
			if (busy) { again = 1; return; }
			busy = 1;
			try {
				var top = 0, f = frame(m);
				try { top = f.contentDocument && f.contentDocument.scrollingElement ? f.contentDocument.scrollingElement.scrollTop / (parseFloat(f.contentDocument.body.style.zoom) || 1) : 0; } catch (e) { top = 0; }
				cur = await o.build(m);
				if (!cur) return;
				m.querySelector('.pvInfo').textContent = cur.pages + ' ' + plural(cur.pages, 'лист', 'листа', 'листов');
				m.querySelector('.pvWarn').innerHTML = cur.warn || '';
				var dest = m.querySelector('.pvPath');
				dest.textContent = cur.dir ? 'Папка сохранения · ' + cur.dir : '';
				dest.title = cur.dir || '';
				var html = String(cur.html).replace('</head>', CSS + '</head>');
				await new Promise(function (res) {
					f.onload = function () {
						var d = f.contentDocument;
						applyZoom(m);
						if (top && d.scrollingElement) d.scrollingElement.scrollTop = top * (parseFloat(d.body.style.zoom) || 1);
						/* ссылки поставщиков — в браузере, предпросмотр никуда не уходит */
						d.addEventListener('click', function (e) {
							var a = e.target.closest && e.target.closest('a[href]');
							if (!a) return;
							e.preventDefault();
							if (/^https?:/i.test(a.getAttribute('href'))) U.api.openUrl(a.getAttribute('href')).catch(U.error);
						});
						d.addEventListener('keydown', function (e) { if (e.key === 'Escape') m.querySelector('.foot [data-id="back"]').click(); });
						res();
					};
					f.srcdoc = html;
				});
			} catch (e) { U.error(e); }
			finally { busy = 0; if (again) { again = 0; refresh(m); } }
		}
		return U.modal({
			title: o.title, cls: 'pvFull',
			body: '<div class="pvPath"></div><div class="pvWarn"></div><div class="pvWrap"><iframe class="pvFrame" title="Предпросмотр: листы так, как они уйдут в PDF"></iframe></div>',
			buttons: [{ label: '← Назад', value: false, left: true, id: 'back' }].concat(o.buttons || []),
			onOpen: function (m, close) {
				var left = m.querySelector('.foot .left');
				left.insertAdjacentHTML('beforeend', '<b class="pvTitle">' + esc(o.title) + '</b><div class="pvCtl">' + (o.controls || '') + '</div>');
				var z = document.createElement('div');
				z.className = 'pvZoom';
				z.innerHTML = '<span class="pvInfo mute"></span><button class="pvZ" data-z="-1" title="Мельче">−</button><span class="pvPct" title="Масштаб; щелчок — по ширине окна"></span><button class="pvZ" data-z="1" title="Крупнее">+</button>';
				left.after(z);
				z.addEventListener('click', function (e) {
					var b = e.target.closest('.pvZ');
					var d = frame(m).contentDocument, now = d && d.body ? (parseFloat(d.body.style.zoom) || 1) : 1;
					if (b) zoom = Math.max(0.25, Math.min(2.5, Math.round((now + 0.1 * Number(b.dataset.z)) * 10) / 10));
					else if (e.target.closest('.pvPct')) zoom = 0;
					else return;
					applyZoom(m);
				});
				m.querySelector('.pvCtl').addEventListener('change', function () { refresh(m); });
				var rz = 0;
				window.addEventListener('resize', function onR() { if (!m.isConnected) { window.removeEventListener('resize', onR); return; } clearTimeout(rz); rz = setTimeout(function () { if (!zoom) applyZoom(m); }, 120); });
				if (o.onOpen) o.onOpen(m, function () { return refresh(m); }, close);
				refresh(m);
			}
		});
	};
})();
