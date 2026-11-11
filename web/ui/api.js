/* STHGroup — связь окна с программой: файлы, настройки, диалоги, сообщения. */
(function () {
	'use strict';
	var U = window.UI = {};
	var TOKEN = new URLSearchParams(location.search).get('t') || '';
	var esc = BM.draw.esc;
	U.esc = esc;
	U.$ = function (id) { return document.getElementById(id); };

	/* ------------------------------- сервер ----------------------------------- */
	async function call(method, url, body, raw) {
		var opt = { method: method, headers: { 'X-BM-Token': TOKEN } };
		if (body !== undefined) {
			if (body instanceof Uint8Array || typeof body === 'string') opt.body = body;
			else { opt.body = JSON.stringify(body); opt.headers['Content-Type'] = 'application/json'; }
		}
		var r;
		try { r = await fetch(url, opt); } catch (e) { throw new Error('Нет связи с программой. Закройте окно и запустите STHGroup заново.'); }
		if (!r.ok) {
			var msg = 'Ошибка ' + r.status;
			try { var j = await r.json(); if (j && j.error) msg = j.error; } catch (e2) { /* не JSON */ }
			throw new Error(msg);
		}
		return raw ? r : r.json();
	}
	var q = encodeURIComponent;
	U.api = {
		boot: function () { return call('GET', '/api/boot'); },
		settings: function () { return call('GET', '/api/settings'); },
		saveSettings: function (s) { return call('PUT', '/api/settings', s); },
		/* STHGroup 2.0: CRM — пароль отправляется только в локальную серверную часть программы. */
		crm: {
			state: function () { return call('GET', '/api/sth/crm/state'); },
			settings: function (o) { return call('POST', '/api/sth/crm/settings', o); }, // STHGroup: без входа
			connect: function (o) { return call('POST', '/api/sth/crm/connect', o); },
			test: function () { return call('POST', '/api/sth/crm/test', {}); },
			sync: function () { return call('POST', '/api/sth/crm/sync', {}); },
			disconnect: function () { return call('POST', '/api/sth/crm/disconnect', {}); }
		},
		readText: async function (path) { var r = await call('GET', '/api/file?path=' + q(path), undefined, true); var t = await r.text(); return t.charCodeAt(0) === 0xFEFF ? t.substring(1) : t; },
		/* Текст в любой из кодировок, которыми пишут программы Windows: UTF-16 (с меткой), UTF-8, а иначе — Windows-1251. */
		readAnyText: async function (path) {
			var r = await call('GET', '/api/file?path=' + q(path), undefined, true), b = new Uint8Array(await r.arrayBuffer());
			if (b.length >= 2 && b[0] === 0xFF && b[1] === 0xFE) return new TextDecoder('utf-16le').decode(b.subarray(2));
			if (b.length >= 2 && b[0] === 0xFE && b[1] === 0xFF) return new TextDecoder('utf-16be').decode(b.subarray(2));
			if (b.length >= 3 && b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF) return new TextDecoder('utf-8').decode(b.subarray(3));
			try { return new TextDecoder('utf-8', { fatal: true }).decode(b); } catch (e) { return new TextDecoder('windows-1251').decode(b); }
		},
		/* from — «Сохранить как…» проекта одним файлом: 3D и текстуры берутся из него */
		write: function (path, data, from) { return call('PUT', '/api/file?path=' + q(path) + (from ? '&from=' + q(from) : ''), data); },
		stat: function (path) { return call('GET', '/api/stat?path=' + q(path)); },
		ls: function (dir) { return call('GET', '/api/ls?dir=' + q(dir || '')); },
		/* картинки папки с подпапками — текстуры раздела «База» */
		tree: function (dir) { return call('GET', '/api/tree?dir=' + q(dir)); },
		/* адрес файла для <img> и 3D (картинка текстуры) */
		fileUrl: function (path) { return '/api/file?path=' + q(path) + '&t=' + q(TOKEN); },
		mkdir: function (path) { return call('POST', '/api/mkdir?path=' + q(path)); },
		dialog: function (o) { return call('POST', '/api/dialog', o); },
		pdf: function (html, path) { return call('POST', '/api/pdf', { html: html, path: path }); },
		open: function (path) { return call('POST', '/api/open', { path: path }); },
		/* ссылка поставщика — в браузере по умолчанию (только http и https) */
		openUrl: function (url) { return call('POST', '/api/openurl', { url: url }); },
		readBytes: async function (path) { var r = await call('GET', '/api/file?path=' + q(path), undefined, true); return new Uint8Array(await r.arrayBuffer()); },
		setup: function (path) { return call('POST', '/api/setup', { path: path }); },
		/* масштаб окна: окно WebView2 меняет его само; native: false — окно открыто в браузере (там Ctrl + / Ctrl − браузера) */
		md5: function (path) { return call('GET', '/api/md5?path=' + q(path)); },
		/* модель по ссылке на Яндекс Диск (ui/link.js): папка для моделей — в настройках (linkDir) */
		link: {
			root: function () { var d = window.App.S.set.linkDir || ''; return Promise.resolve({ path: d, name: d }); },
			choose: async function () {
				var A = window.App, p = await U.pick({ kind: 'folder', title: 'Папка для моделей с Яндекс Диска', dir: A.S.set.linkDir || A.S.boot.docs });
				if (!p) return null;
				A.S.set.linkDir = p; A.saveSettings(true);
				return { path: p, name: p };
			},
			list: function (link) { return call('POST', '/api/link/list', { link: link }); },
			fetch: async function (files, dir, onProg) {
				var t = setInterval(function () { call('GET', '/api/link/progress').then(function (p) { if (onProg) onProg(p); }).catch(function () { }); }, 500);
				try { return await call('POST', '/api/link/fetch', { files: files, dir: dir }); } finally { clearInterval(t); }
			},
			clip: function () {           // буфер обмена: окно может спросить разрешение — ждём не дольше 0,4 с
				return Promise.race([Promise.resolve().then(function () { return navigator.clipboard.readText(); }).catch(function () { return ''; }), new Promise(function (ok) { setTimeout(function () { ok(''); }, 400); })]);
			}
		},
		zoom: function (z) { return call('POST', '/api/zoom', { z: z }).catch(function () { return {}; }); },
		title: function (t) { return call('POST', '/api/title', { title: t }).catch(function () { }); },
		ping: function () { return call('POST', '/api/ping').catch(function () { return {}; }); },
		/* какие проекты открыты во вкладках окна (по ним новая выгрузка из БАЗИСа находит это окно) */
		current: function (paths) { return call('POST', '/api/current', Array.isArray(paths) ? { paths: paths } : { path: paths }).catch(function () { }); },
		beaconUrl: function (path) { return '/api/file?path=' + q(path) + '&t=' + q(TOKEN); },
		bye: function () { try { navigator.sendBeacon('/api/bye?t=' + q(TOKEN)); } catch (e) { /* не страшно */ } },
		quit: function () { return call('POST', '/api/quit').catch(function () { }); },
		/* обновление через GitHub: проверка и скачивание — у всех; у автора — ключ GitHub и выпуск */
		upd: {
			state: function () { return call('GET', '/api/upd/state'); },
			key: function (o) { return call('POST', '/api/upd/key', o); },
			check: function (auto) { return call('POST', '/api/upd/check', { auto: !!auto }); },
			fetch: function () { return call('POST', '/api/upd/fetch'); },
			pub: {
				init: function () { return call('POST', '/api/upd/pub/init'); },
				restore: function (src) { return call('POST', '/api/upd/pub/restore', { src: src }); },
				backup: function (dst) { return call('POST', '/api/upd/pub/backup', { dst: dst }); },
				github: function (o) { return call('POST', '/api/upd/pub/github', o); },
				peek: function (src) { return call('GET', '/api/upd/pub/peek?src=' + q(src)); },
				release: function (o) { return call('POST', '/api/upd/pub/release', o); }
			}
		},
		/* окно первого запуска, имя человека, открытые разделы — для ежедневной отметки автору (не у автора) */
		tester: {
			state: function () { return call('GET', '/api/tester/state'); },
			hello: function (name) { return call('POST', '/api/tester/hello', { name: name }); },
			sec: function (sec) { return call('POST', '/api/tester/sec', { sec: sec }); }
		},
		/* регистрация: код установки и ключ; у автора — выдача ключей */
		reg: {
			state: function () { return call('GET', '/api/reg/state'); },
			key: function (o) { return call('POST', '/api/reg/key', o); },
			issue: function (o) { return call('POST', '/api/reg/issue', o); },
			list: function () { return call('GET', '/api/reg/list'); }
		},
		/* счётчик у автора: ящик, куда приходят отметки, и то, что из него уже прочитано */
		testers: {
			state: function () { return call('GET', '/api/testers/state'); },
			config: function (o) { return call('POST', '/api/testers/config', o); },
			refresh: function () { return call('POST', '/api/testers/refresh'); }
		},
		/* отзывы тестеров → письмом на почту владельца */
		fb: {
			state: function () { return call('GET', '/api/feedback/state'); },
			config: function (o) { return call('POST', '/api/feedback/config', o); },
			test: function (o) { return call('POST', '/api/feedback/test', o); },
			make: function (o) { return call('POST', '/api/feedback/make', o); },
			peek: function (src) { return call('GET', '/api/feedback/peek?src=' + q(src)); },
			send: function (o) { return call('POST', '/api/feedback/send', o); },
			list: function () { return call('GET', '/api/feedback/list'); },
			retry: function () { return call('POST', '/api/feedback/retry'); },
			exportItem: function (id, path) { return call('POST', '/api/feedback/export', { id: id, path: path }); },
			remove: function (id) { return call('POST', '/api/feedback/remove', { id: id }); }
		}
	};

	/* -------------------------------- пути ------------------------------------ */
	U.sep = '\\';
	U.dirOf = function (p) { var i = Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/')); return i < 0 ? '' : (i === 0 ? p.substring(0, 1) : (/^[A-Za-z]:$/.test(p.substring(0, i)) ? p.substring(0, i + 1) : p.substring(0, i))); };
	U.baseOf = function (p) { var i = Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/')); return i < 0 ? p : p.substring(i + 1); };
	U.stemOf = function (p) { var b = U.baseOf(p), i = b.lastIndexOf('.'); return i > 0 ? b.substring(0, i) : b; };
	U.join = function (a, b) { if (!a) return b; var last = a.charAt(a.length - 1); return (last === '\\' || last === '/') ? a + b : a + U.sep + b; };

	/* Включены ли анимации: галка в настройках и настройка эффектов Windows. */
	U.animOn = function () {
		if (document.documentElement.classList.contains('noanim')) return false;
		try { return !window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return true; }
	};

	/* ------------------------------ сообщения --------------------------------- */
	U.toast = function (text, o) {
		o = o || {};
		var el = document.createElement('div');
		el.className = 'toast' + (o.bad ? ' bad' : '');
		var sp = document.createElement('span'); sp.textContent = text; el.appendChild(sp);
		(o.actions || []).forEach(function (a) {
			var b = document.createElement('button'); b.textContent = a.label;
			b.onclick = function () { a.run(); gone(); };
			el.appendChild(b);
		});
		function gone() { if (!U.animOn()) { el.remove(); return; } el.classList.add('out'); setTimeout(function () { el.remove(); }, 190); }
		U.$('toasts').appendChild(el);
		setTimeout(gone, o.ms || (o.bad ? 9000 : (o.actions ? 9000 : 3800)));
		return el;
	};
	U.error = function (e) { console.error(e); U.toast(e && e.message ? e.message : String(e), { bad: true }); };

	/* ------------------------------ окна-диалоги ------------------------------ */
	/* Окно можно двигать за заголовок. Фон под ним не затемняется: окно отделяют тень и рамка.
	   Закрывается окно только своими кнопками и клавишей Esc — щелчок мимо него ничего не делает.
	   Каждый раз окно открывается по центру. */
	/* Окно тянется за край или угол мышью (1.16.1); размер запоминается по key. edges: 'r','b','rb' (окно в середине) или
	   'l','b','lb' (панель у правого края). Меньше minW × minH не сжимается — кнопки и надписи помещаются. */
	U.resizable = function (el, key, o) {
		o = o || {};
		var edges = o.edges || ['r', 'b', 'rb'], minW = o.minW || 320, minH = o.minH || 160, sk = 'br_size_' + key;
		try { var sv = JSON.parse(localStorage.getItem(sk) || 'null'); if (sv && sv.w > 0) { el.style.width = Math.min(sv.w, window.innerWidth * 0.96) + 'px'; if (sv.h > 0) { el.style.height = Math.min(sv.h, window.innerHeight * 0.94) + 'px'; el.style.maxHeight = 'none'; } } } catch (e) { }
		edges.forEach(function (ed) {
			var h = document.createElement('div');
			h.className = 'rsz rsz-' + ed; h.title = 'Потяните, чтобы изменить размер';
			el.appendChild(h);
			h.addEventListener('mousedown', function (e) {
				if (e.button !== 0) return;
				e.preventDefault(); e.stopPropagation();
				var r = el.getBoundingClientRect(), x0 = e.clientX, y0 = e.clientY, w0 = r.width, h0 = r.height;
				/* окно стоит по центру — без поправки оно растёт в обе стороны. Держим на месте противоположный край */
				var pos = getComputedStyle(el).position, canShift = pos === 'relative' || pos === 'absolute';
				var l0 = parseFloat(el.style.left) || 0, t0 = parseFloat(el.style.top) || 0;
				el.classList.add('drag');
				function mv(ev) {
					var dw = ed.indexOf('r') >= 0 ? ev.clientX - x0 : (ed.indexOf('l') >= 0 ? x0 - ev.clientX : 0), dh = ed.indexOf('b') >= 0 ? ev.clientY - y0 : 0;
					if (dw) el.style.width = Math.max(minW, Math.min(window.innerWidth * 0.98, w0 + dw)) + 'px';
					if (dh) { el.style.height = Math.max(minH, Math.min(window.innerHeight * 0.96, h0 + dh)) + 'px'; el.style.maxHeight = 'none'; }
					if (canShift) {
						var nr = el.getBoundingClientRect(), sx = 0, sy = 0;
						if (ed.indexOf('r') >= 0) sx = r.left - nr.left; else if (ed.indexOf('l') >= 0) sx = r.right - nr.right;
						if (dh) sy = r.top - nr.top;
						if (Math.abs(sx) >= 0.5) { l0 += sx; el.style.left = l0 + 'px'; }
						if (Math.abs(sy) >= 0.5) { t0 += sy; el.style.top = t0 + 'px'; }
					}
					if (o.onSize) o.onSize();
				}
				function up() {
					document.removeEventListener('mousemove', mv, true); document.removeEventListener('mouseup', up, true); el.classList.remove('drag');
					var rr = el.getBoundingClientRect();
					try { localStorage.setItem(sk, JSON.stringify({ w: Math.round(rr.width), h: el.style.height ? Math.round(rr.height) : 0 })); } catch (e2) { }
				}
				document.addEventListener('mousemove', mv, true); document.addEventListener('mouseup', up, true);
			});
		});
	};
	function makeMovable(back, m) {
		var head = m.querySelector('h2'), dx = 0, dy = 0;
		head.addEventListener('mousedown', function (e) {
			if (e.button !== 0 || e.target.closest('button')) return;
			e.preventDefault();
			dx = parseFloat(m.style.left) || 0; dy = parseFloat(m.style.top) || 0; // окно могли сдвинуть, растягивая за край
			var x0 = e.clientX - dx, y0 = e.clientY - dy, r = m.getBoundingClientRect(), bx = r.left - dx, by = r.top - dy;
			m.classList.add('drag');
			function move(ev) {
				/* заголовок не уходит за край окна программы: за него окно возвращают обратно */
				var nx = ev.clientX - x0, ny = ev.clientY - y0, W = window.innerWidth, H = window.innerHeight;
				nx = Math.max(90 - r.width - bx, Math.min(W - 90 - bx, nx));
				ny = Math.max(-by, Math.min(H - 40 - by, ny));
				dx = nx; dy = ny;
				m.style.left = dx + 'px'; m.style.top = dy + 'px';
			}
			function up() { document.removeEventListener('mousemove', move, true); document.removeEventListener('mouseup', up, true); m.classList.remove('drag'); }
			document.addEventListener('mousemove', move, true);
			document.addEventListener('mouseup', up, true);
		});
		/* щёлкнули мимо окна — оно коротко «отзывается», чтобы было видно, что ждёт ответа */
		back.addEventListener('mousedown', function (e) {
			if (e.target !== back) return;
			e.preventDefault();
			m.classList.remove('nudge'); void m.offsetWidth; m.classList.add('nudge');
		});
	}
	/* o: { title, body (html), buttons: [{ label, primary, value, keep }], width, onOpen(el, close) } → обещание со значением кнопки
	   Решение автора 11.11.2026: окна — часть программы. Окно открывается страницей на месте рабочей области
	   (полоса разделов слева остаётся видна, «← Назад» и Esc закрывают); короткий вопрос без полей ввода —
	   полоской вверху рабочей области. Прежние плавающие окна — только при U.floatModals = true. */
	function isBar(o) {
		if (o.page) return false;
		if (o.bar) return true;
		if (o.onOpen || o.cls) return false;   // окно дозаполняется после открытия или своё оформление — страница
		var b = String(o.body || '');
		return !/<(input|select|textarea|table|canvas|img|svg|iframe|webview|button|ul|ol|label)\b/i.test(b) && b.replace(/<[^>]*>/g, '').length < 400 && (o.buttons || []).length <= 3;
	}
	function placeHost() {           // страницы и полоски занимают рабочую область: справа от полосы разделов, под шапкой
		var host = U.$('modals'), main = document.getElementById('main'), rail = document.getElementById('rail');
		if (!host || !main) return;
		var r = main.getBoundingClientRect(), left = r.left;
		if (rail && rail.offsetWidth && !rail.hidden) left = rail.getBoundingClientRect().right;
		host.style.setProperty('--pg-top', Math.round(r.top) + 'px');
		host.style.setProperty('--pg-left', Math.round(left) + 'px');
		host.style.setProperty('--pg-bottom', Math.max(0, Math.round(window.innerHeight - r.bottom)) + 'px');
	}
	var pageWired = false;
	function wirePages() {
		if (pageWired) return; pageWired = true;
		window.addEventListener('resize', placeHost);
		if (window.ResizeObserver && document.getElementById('main')) new ResizeObserver(placeHost).observe(document.getElementById('main'));
		/* переход в другой раздел закрывает открытые страницы (как «Назад») */
		var rail = document.getElementById('rail');
		if (rail) rail.addEventListener('click', function (e) {
			if (!e.target.closest('button')) return;
			U.$('modals').querySelectorAll('.back.page:not(.out), .back.bar:not(.out)').forEach(function (b) { if (b._close) b._close(undefined); });
		}, true);
	}
	U.modal = function (o) {
		if (U.floatModals) return floatModal(o);
		return new Promise(function (resolve) {
			wirePages(); placeHost();
			var bar = isBar(o);
			var back = document.createElement('div');
			back.className = 'back ' + (bar ? 'bar' : 'page');
			var m = document.createElement('div');
			m.className = 'modal' + (o.cls ? ' ' + o.cls : '');
			/* страница всегда на всю ширину рабочей области (11.11.2026): o.width больше не сужает её */
			m.innerHTML = bar
				? '<div class="body">' + (o.title ? '<b class="bt">' + esc(o.title) + '</b>' : '') + '<div class="bx">' + (o.body || '') + '</div></div><div class="foot"><div class="left"></div></div>'
				: '<h2><button class="bk x" title="Назад (Esc)">← Назад</button><span>' + esc(o.title || '') + '</span></h2><div class="body">' + (o.body || '') + '</div><div class="foot"><div class="left"></div></div>';
			back.appendChild(m);
			function close(v) {
				if (back._closed) return; back._closed = true;
				document.removeEventListener('keydown', onKey, true);
				if (U.animOn()) { back.classList.add('out'); setTimeout(function () { back.remove(); }, 160); } else back.remove();
				resolve(v);
			}
			back._close = close;
			function onKey(e) {
				var live = U.$('modals').querySelectorAll('.back:not(.out)');
				if (back !== live[live.length - 1]) return;
				if (e.key === 'Escape') { e.stopPropagation(); close(undefined); }
				else if (e.key === 'Enter' && !/TEXTAREA|BUTTON|SELECT/.test(e.target.tagName) && !e.target.hasAttribute('data-own-enter') && primary) { e.preventDefault(); primary.click(); }
			}
			var foot = m.querySelector('.foot'), primary = null;
			(o.buttons || [{ label: bar ? 'Понятно' : 'Закрыть', value: undefined }]).forEach(function (b) {
				var el = document.createElement('button');
				el.textContent = b.label;
				if (b.primary) { el.className = 'primary'; primary = el; }
				if (b.id) el.dataset.id = b.id;
				el.onclick = async function () {
					var v = b.value;
					if (b.run) { try { v = await b.run(m, close); } catch (e) { U.error(e); return; } if (v === false) return; }
					if (!b.keep) close(v);
				};
				(b.left ? foot.querySelector('.left') : foot).appendChild(el);
			});
			if (!bar) {
				m.querySelector('.bk').onclick = function () { close(undefined); };
			}
			/* щелчок по программе мимо полоски — полоска коротко «отзывается»: ждёт ответа */
			back.addEventListener('mousedown', function (e) {
				if (e.target !== back) return;
				e.preventDefault();
				m.classList.remove('nudge'); void m.offsetWidth; m.classList.add('nudge');
			});
			document.addEventListener('keydown', onKey, true);
			U.$('modals').appendChild(back);
			if (o.onOpen) o.onOpen(m, close);
			var f = m.querySelector('[autofocus]') || primary;
			if (f) f.focus();
		});
	};
	/* прежнее плавающее окно (U.floatModals) */
	function floatModal(o) {
		return new Promise(function (resolve) {
			var back = document.createElement('div');
			back.className = 'back';
			var m = document.createElement('div');
			m.className = 'modal' + (o.cls ? ' ' + o.cls : '');
			if (o.width) m.style.width = o.width + 'px';
			m.innerHTML = '<h2 title="Окно можно двигать за заголовок"><span>' + esc(o.title || '') + '</span><button class="x" title="Закрыть (Esc)">✕</button></h2><div class="body">' + (o.body || '') + '</div><div class="foot"><div class="left"></div></div>';
			back.appendChild(m);
			function close(v) {
				document.removeEventListener('keydown', onKey, true);
				if (U.animOn()) { back.classList.add('out'); setTimeout(function () { back.remove(); }, 160); } else back.remove();
				resolve(v);
			}
			function onKey(e) {
				var live = U.$('modals').querySelectorAll('.back:not(.out)');
				if (back !== live[live.length - 1]) return;
				if (e.key === 'Escape') { e.stopPropagation(); close(undefined); }
				else if (e.key === 'Enter' && !/TEXTAREA|BUTTON|SELECT/.test(e.target.tagName) && !e.target.hasAttribute('data-own-enter') && primary) { e.preventDefault(); primary.click(); }
			}
			var foot = m.querySelector('.foot'), primary = null;
			(o.buttons || [{ label: 'Закрыть', value: undefined }]).forEach(function (b) {
				var el = document.createElement('button');
				el.textContent = b.label;
				if (b.primary) { el.className = 'primary'; primary = el; }
				if (b.id) el.dataset.id = b.id;
				el.onclick = async function () {
					var v = b.value;
					if (b.run) { try { v = await b.run(m, close); } catch (e) { U.error(e); return; } if (v === false) return; }
					if (!b.keep) close(v);
				};
				(b.left ? foot.querySelector('.left') : foot).appendChild(el);
			});
			m.querySelector('.x').onclick = function () { close(undefined); };
			makeMovable(back, m);
			U.resizable(m, o.cls || o.title || 'modal', { minW: Math.min(380, o.width || 380), minH: 160 });          // окно тянется за край и угол, размер запоминается
			document.addEventListener('keydown', onKey, true);
			U.$('modals').appendChild(back);
			if (o.onOpen) o.onOpen(m, close);
			var f = m.querySelector('[autofocus]') || primary;
			if (f) f.focus();
		});
	}
	U.confirm = function (title, text, yes, no) {
		return U.modal({ title: title, body: '<p>' + esc(text).replace(/\n/g, '<br>') + '</p>', width: 460, buttons: [{ label: no || 'Отмена', value: false }, { label: yes || 'Да', value: true, primary: true }] });
	};

	/* --------------------- выбор файла или папки ------------------------------ */
	/* Сначала системное окно Windows; если его нет — встроенное. Возвращает путь или null. */
	U.forceBuiltinDialogs = true;   // 11.11.2026: выбор файла и папки — своим окном внутри программы, не окном Windows
	U.pick = async function (o) {
		var r = null;
		if (!U.forceBuiltinDialogs) { try { r = await U.api.dialog(o); } catch (e) { r = { unsupported: true }; } }
		if (r && r.path) return r.path;
		if (r && r.cancel) return null;
		return builtinPick(o);
	};
	function fmtSize(n) { return n < 1024 ? n + ' Б' : (n < 1048576 ? Math.round(n / 1024) + ' КБ' : (n / 1048576).toFixed(1) + ' МБ'); }
	function builtinPick(o) {
		var exts = [];
		(o.filters || []).forEach(function (f) { (f.ext || []).forEach(function (e) { exts.push('.' + String(e).replace(/^\./, '').toLowerCase()); }); });
		var state = { dir: o.dir || '', data: null, sel: '' };
		return U.modal({
			title: o.title || (o.kind === 'folder' ? 'Выберите папку' : 'Выберите файл'), cls: 'fb', sticky: true,
			body: '<div class="cur"><button class="up" title="На уровень выше">↑</button><input type="text" class="dir" spellcheck="false" data-own-enter><select class="roots"></select></div><div class="list"></div>' +
				  (o.kind === 'folder' ? '' : '<div class="name"><span class="mute">Имя файла</span><input type="text" class="fname" spellcheck="false"></div>'),
			buttons: (o.kind === 'folder' ? [
				/* папка планшета — системным окном выбора папки (Android): любая папка устройства, в том числе Яндекс Диска */
				U.api.devFolder ? { label: 'Папка на устройстве…', left: true, keep: true, run: async function () { var r = null; try { r = await U.api.devFolder(); } catch (e) { U.error(e); } if (r && r.path) load(r.path); } } : null,
				{ label: 'Новая папка…', left: true, keep: true, run: async function () {
					var n = await U.modal({ title: 'Новая папка', width: 420, body: '<input type="text" id="nfName" autofocus spellcheck="false" placeholder="название папки" style="width:100%">',
						buttons: [{ label: 'Отмена', value: null }, { label: 'Создать', primary: true, run: function (mm) { var v = mm.querySelector('#nfName').value.trim(); if (!v || /[\\/:*?"<>|]/.test(v)) { U.toast('Название папки — без знаков \\ / : * ? " < > |'); return false; } return v; } }] });
					if (!n || !state.data) return;
					var full = U.join(state.data.dir, n);
					try { await U.api.mkdir(full); load(full); } catch (e) { U.error(e); }
				} }].filter(Boolean) : []).concat([{ label: 'Отмена', value: null }, {
				label: o.kind === 'save' ? 'Сохранить' : (o.kind === 'folder' ? 'Выбрать эту папку' : 'Открыть'), primary: true,
				run: async function (m) {
					if (o.kind === 'folder') return state.data.dir;
					var name = m.querySelector('.fname').value.trim();
					if (!name) { U.toast('Укажите имя файла'); return false; }
					if (o.kind === 'save' && exts.length && name.toLowerCase().lastIndexOf(exts[0]) !== name.length - exts[0].length) name += exts[0];
					var full = U.join(state.data.dir, name);
					var st = await U.api.stat(full);
					if (o.kind === 'open' && !st.exists) { U.toast('Такого файла нет'); return false; }
					if (st.exists && st.dir) { load(full); return false; }
					if (o.kind === 'save' && st.exists && !(await U.confirm('Файл уже есть', 'Заменить файл «' + name + '»?', 'Заменить'))) return false;
					return full;
				}
			}]),
			onOpen: function (m) {
				var list = m.querySelector('.list'), dirI = m.querySelector('.dir'), fname = m.querySelector('.fname'), roots = m.querySelector('.roots');
				if (fname && o.name) fname.value = o.name;
				m.querySelector('.up').onclick = function () { if (state.data && state.data.parent) load(state.data.parent); };
				dirI.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); load(dirI.value.trim()); } };
				roots.onchange = function () { load(roots.value); };
				list.onclick = function (e) {
					var d = e.target.closest('div[data-n]'); if (!d) return;
					if (d.dataset.d === '1') { load(U.join(state.data.dir, d.dataset.n)); return; }
					list.querySelectorAll('.on').forEach(function (x) { x.classList.remove('on'); });
					d.classList.add('on');
					if (fname) fname.value = d.dataset.n;
				};
				list.ondblclick = function (e) {
					var d = e.target.closest('div[data-n]');
					if (d && d.dataset.d !== '1' && o.kind !== 'folder') m.querySelector('.foot .primary').click();
				};
				load(state.dir);
			}
		});
		async function load(dir) {
			try { state.data = await U.api.ls(dir); } catch (e) { U.error(e); return; }
			var m = document.querySelector('.back:not(.out) > .modal.fb');
			if (!m) return;
			var list = m.querySelector('.list'), h = '';
			state.data.entries.forEach(function (en) {
				if (!en.dir) {
					if (o.kind === 'folder') return;
					if (exts.length && !exts.some(function (x) { return en.name.toLowerCase().slice(-x.length) === x; })) return;
				}
				h += '<div class="' + (en.dir ? 'd' : '') + '" data-n="' + esc(en.name) + '" data-d="' + (en.dir ? 1 : 0) + '">' + (en.dir ? '📁 ' : '') + esc(en.name) + (en.dir ? '' : '<span>' + fmtSize(en.size) + ', ' + new Date(en.mtime).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + '</span>') + '</div>';
			});
			list.innerHTML = h || '<div class="mute">Здесь пусто</div>';
			m.querySelector('.dir').value = state.data.dir;
			var roots = m.querySelector('.roots');
			roots.innerHTML = state.data.roots.map(function (r) { return '<option' + (state.data.dir.toLowerCase().indexOf(r.toLowerCase()) === 0 ? ' selected' : '') + '>' + esc(r) + '</option>'; }).join('');
			roots.hidden = state.data.roots.length < 2;
		}
	}
})();
