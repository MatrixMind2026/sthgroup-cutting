/* STHGroup — отзывы тестеров. Кнопка «Отзыв» (и клавиша F1) есть только там, где отзывы настроены:
   у владельца после настройки почты и у тестеров, поставивших программу установщиком «для тестеров».

   Окно в два шага: сначала снимок окна программы, на котором мышью обводят место, потом текст.
   Отзыв уходит письмом на почту владельца; если связи нет — ждёт на диске и уходит при следующем запуске.
   Без согласия человека ничего не отправляется.                                                        */
(function () {
	'use strict';
	var U = window.UI, $ = U.$, esc = U.esc;
	var F = window.Feedback = { state: { enabled: false, tester: false, wait: 0, total: 0 }, log: [], os: '' };
	var KIND = { bug: 'Ошибка', wish: 'Пожелание', q: 'Вопрос' }, SEV = { block: 'мешает работать', hard: 'неудобно', minor: 'мелочь' };
	var MAX_IMG = 3, MAIL_RE = /^[A-Za-z0-9._%+\-]{1,64}@[A-Za-z0-9\-]+(\.[A-Za-z0-9\-]+)*\.[A-Za-z]{2,24}$/;
	F.MAIL_RE = MAIL_RE;      // тот же разбор адреса — в настройках почты

	F.refresh = async function () {
		try { F.state = await U.api.fb.state(); } catch (e) { /* без связи с программой кнопки просто нет */ }
		var b = $('bFeedback');
		if (b) { b.hidden = !F.state.enabled; b.title = 'Написать об ошибке или пожелании (F1)' + (F.state.wait ? ' · ждёт отправки: ' + F.state.wait : ''); }
		return F.state;
	};

	/* ------------------------------ снимок окна -------------------------------- */

	function dataUrlOf(url) {
		return fetch(url).then(function (r) { return r.blob(); }).then(function (b) {
			return new Promise(function (res, rej) { var fr = new FileReader(); fr.onload = function () { res(fr.result); }; fr.onerror = rej; fr.readAsDataURL(b); });
		});
	}
	/* Окно рисует само себя: копия страницы со стилями кладётся в картинку SVG и переносится на холст.
	   Возвращает { src, w, h } или null, если не получилось (тогда снимок вставляют сами, через Ctrl+V). */
	F.capture = async function () {
		try {
			var W = window.innerWidth, H = window.innerHeight, k = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
			var doc = document.documentElement, root = doc.cloneNode(true);
			var live = doc.querySelectorAll('*'), copy = root.querySelectorAll('*'), jobs = [], swap = [], i, j;
			if (live.length !== copy.length) return null;
			for (i = 0; i < live.length; i++) {
				var a = live[i], b = copy[i], tag = a.tagName;
				if (tag === 'INPUT') {
					if (a.type === 'checkbox' || a.type === 'radio') { if (a.checked) b.setAttribute('checked', ''); else b.removeAttribute('checked'); }
					else b.setAttribute('value', a.type === 'password' ? '••••••••' : a.value);
				} else if (tag === 'TEXTAREA') b.textContent = a.value;
				else if (tag === 'SELECT') { for (j = 0; j < a.options.length; j++) { if (a.options[j].selected) b.options[j].setAttribute('selected', ''); else b.options[j].removeAttribute('selected'); } }
				else if (tag === 'CANVAS') { try { swap.push([b, a.toDataURL(), a.getBoundingClientRect()]); } catch (e1) { /* холст с чужой картинкой — пропускаем */ } }
				else if (tag === 'IMG' && a.getAttribute('src') && !/^data:/.test(a.getAttribute('src'))) (function (el, url) { jobs.push(dataUrlOf(url).then(function (d) { el.setAttribute('src', d); }, function () { el.removeAttribute('src'); })); })(b, a.src);
				/* прокрутка в копии сбрасывается — сдвигаем содержимое так же, как оно прокручено в окне */
				if ((a.scrollTop || a.scrollLeft) && tag !== 'HTML' && tag !== 'BODY' && tag !== 'TEXTAREA') {
					for (j = 0; j < b.children.length; j++) { var ch = b.children[j], tr = ch.style.transform; ch.style.transform = 'translate(' + (-a.scrollLeft) + 'px,' + (-a.scrollTop) + 'px)' + (tr ? ' ' + tr : ''); }
					b.style.overflow = 'hidden';
				}
			}
			swap.forEach(function (s) { var im = document.createElement('img'); im.setAttribute('src', s[1]); im.style.cssText = 'width:' + s[2].width + 'px;height:' + s[2].height + 'px'; s[0].parentNode.replaceChild(im, s[0]); });
			root.querySelectorAll('script, noscript, link, #splash').forEach(function (e) { e.remove(); });
			/* стили: в картинке нет доступа к файлам, поэтому таблицы стилей вписываются текстом */
			var css = '';
			var links = document.querySelectorAll('link[rel="stylesheet"]');
			for (i = 0; i < links.length; i++) css += await fetch(links[i].href).then(function (r) { return r.text(); }) + '\n';
			css = css.replace(/:root/g, 'html') + '\n*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}';
			var st = document.createElement('style'); st.textContent = css;
			(root.querySelector('head') || root).appendChild(st);
			root.style.width = W + 'px'; root.style.height = H + 'px';
			await Promise.all(jobs);
			var xml = new XMLSerializer().serializeToString(root).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
			var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '"><foreignObject x="0" y="0" width="' + W + '" height="' + H + '">' + xml + '</foreignObject></svg>';
			var img = new Image();
			await new Promise(function (res, rej) { img.onload = res; img.onerror = function () { rej(new Error('снимок не построен')); }; img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); setTimeout(function () { rej(new Error('снимок строится слишком долго')); }, 8000); });
			var cv = document.createElement('canvas'); cv.width = Math.round(W * k); cv.height = Math.round(H * k);
			var cx = cv.getContext('2d');
			cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height);
			cx.drawImage(img, 0, 0, cv.width, cv.height);
			/* пустой снимок (всё одного цвета) хуже, чем никакого */
			var d = cx.getImageData(0, 0, cv.width, cv.height).data, step = Math.max(4, Math.floor(d.length / 4 / 4000)) * 4, seen = {}, n = 0;
			for (i = 0; i < d.length && n < 4; i += step) { var key = d[i] + ',' + d[i + 1] + ',' + d[i + 2]; if (!seen[key]) { seen[key] = 1; n++; } }
			if (n < 4) return null;
			return { src: cv.toDataURL('image/png'), w: cv.width, h: cv.height, kind: 'win', on: true, marks: [] };
		} catch (e) { console.warn('снимок окна не получился:', e); return null; }
	};

	/* Картинка с пометками — такой она уйдёт. */
	function renderImage(im, cv) {
		return new Promise(function (res) {
			var pic = new Image();
			pic.onload = function () {
				cv.width = im.w; cv.height = im.h;
				var cx = cv.getContext('2d'), lw = Math.max(3, Math.round(im.w / 420));
				cx.drawImage(pic, 0, 0, im.w, im.h);
				im.marks.forEach(function (m) {
					cx.lineJoin = 'round';
					cx.strokeStyle = '#fff'; cx.lineWidth = lw + 2; cx.strokeRect(m.x, m.y, m.w, m.h);
					cx.strokeStyle = '#e0352b'; cx.lineWidth = lw; cx.strokeRect(m.x, m.y, m.w, m.h);
				});
				res(cv);
			};
			pic.onerror = function () { res(cv); };
			pic.src = im.src;
		});
	}

	/* ------------------------------ сведения ----------------------------------- */

	function osName() {
		var ua = navigator.userAgent || '';
		if (F.os) return F.os;
		if (/Windows NT 10/.test(ua)) return 'Windows 10 или 11';
		var m = /Windows NT ([\d.]+)/.exec(ua);
		return m ? 'Windows NT ' + m[1] : (navigator.platform || 'неизвестная система');
	}
	function secName(s) { return s === 'drill' ? 'Присадка' : (s === 'est' ? 'Смета' : 'Раскрой'); }
	/* две строки для письма: какая программа и где в ней человек был */
	function appLine() { var S = window.App.S; return 'STHGroup ' + (S.boot ? S.boot.version : BM.VERSION) + ' · ' + osName(); }
	function whereLine() {
		var S = window.App.S, st = S.st;
		return 'раздел «' + secName(S.section) + '»' + (st ? ' · проект «' + (st.model.title || (S.path ? U.baseOf(S.path) : 'без названия')) + '»' : ' · проект не открыт');
	}
	/* Сведения о программе для разбора ошибки. Путей к папкам и имён пользователей Windows здесь нет. */
	F.diag = function (text) {
		var A = window.App, S = A.S, st = S.st, P = BM.project, L = [], set = {}, k;
		L.push('STHGroup ' + (S.boot ? S.boot.version : BM.VERSION) + ' · ' + new Date().toLocaleString('ru-RU'));
		L.push('Система: ' + osName() + ' · окно ' + window.innerWidth + '×' + window.innerHeight + ' · масштаб ' + Math.round((window.devicePixelRatio || 1) * 100) + ' %');
		L.push('Браузер окна: ' + navigator.userAgent);
		L.push('Раздел: ' + secName(S.section) + ' · тема «' + BM.theme(S.set.theme).name + '» · анимации ' + (S.set.anim === 0 ? 'выключены' : 'включены'));
		if (st) {
			var sm = P.summary(st);
			L.push('');
			L.push('Проект: ' + (st.model.title || 'без названия') + (st.model.order ? ' · заказ ' + st.model.order : '') + (S.path ? ' · файл ' + U.baseOf(S.path) : ''));
			L.push('Деталей: ' + sm.total + ' · материалов: ' + st.mats.length + ' · листов: ' + sm.sheets + ' · не уложено: ' + sm.unplaced + ' · комплектов: ' + st.work.sets + ' · область: ' + (st.work.scope === 'sel' ? 'выделенное' : 'вся модель'));
			L.push('Выгрузка из БАЗИСа: ' + (S.doc.exporter || '?') + ' от ' + String(S.doc.exportedAt || '').replace('T', ' ').substring(0, 16));
			L.push('Отверстий: ' + (st.holes ? st.holes.total + ', не привязано ' + st.holes.lost : '—'));
			if (S.section === 'est' && window.Est && window.Est.R) { var R = window.Est.R; L.push('Смета: прайс «' + R.pl + '» · строк ' + R.rows.length + ' · итог ' + R.grand + ' · листов ' + R.totalSheets + ' · вид ' + (S.set.est && S.set.est.paper ? 'как на бумаге' : 'таблица') + (R.warns.length ? ' · предупреждения: ' + R.warns.join(' | ') : '')); }
			else if (S.section === 'drill' && window.Drill) { var c = window.Drill.current(); if (c) L.push('Открыта деталь: ' + BM.drill.title(c) + ' · ' + c.t.L + '×' + c.t.W + '×' + c.t.th + ' · отверстий ' + c.n); }
			else { var m = st.matBy[S.matKey]; if (m) L.push('Открыт материал: ' + P.matTitle(m) + ' · лист ' + ((S.si | 0) + 1)); }
			L.push('Параметры раскроя проекта: ' + JSON.stringify(st.work.params));
		} else L.push('Проект не открыт.');
		L.push('');
		L.push('Настройки присадки: ' + JSON.stringify(BM.drill.conf(S.set)));
		for (k in S.set) if (S.set.hasOwnProperty(k) && ['recent', 'lastDir', 'updateDir', 'outDir', 'mats', 'org', 'author', 'drill', 'fb'].indexOf(k) < 0) set[k] = S.set[k];
		L.push('Настройки программы: ' + JSON.stringify(set));
		L.push('');
		L.push('Последние ошибки окна: ' + (F.log.length ? '' : 'нет'));
		F.log.slice(-15).forEach(function (e) { L.push('  ' + e.at + '  ' + e.msg + (e.where ? '  [' + e.where + ']' : '')); if (e.stack) L.push('      ' + e.stack.split('\n').slice(0, 5).join('\n      ')); });
		L.push('');
		L.push('Текст отзыва целиком:');
		L.push(text || '');
		return L.join('\n');
	};

	/* ------------------------------- окно отзыва ------------------------------- */

	var opening = false;
	/* pre: { kind, sev, text } — заранее вписанное (когда программа сама предлагает сообщить об ошибке). */
	F.open = async function (pre) {
		var A = window.App, S = A.S;
		if (!F.state.enabled || opening || document.querySelector('.back:not(.out) > .modal.fbk')) return;
		opening = true;
		pre = pre || {};
		var snap = await F.capture();
		opening = false;
		var mem = S.set.fb || (S.set.fb = { name: '', reply: '', proj: 1, diag: 1 });
		var st = { step: 1, imgs: snap ? [snap] : [], cur: 0, kind: pre.kind || 'bug', sev: pre.sev || 'hard', text: pre.text || '', name: mem.name || '', reply: mem.reply || '', proj: mem.proj !== 0, diag: mem.diag !== 0, drag: null, noSnap: !snap };
		var projInfo = '';
		if (S.path) { try { var ps = await U.api.stat(S.path); if (ps.exists) projInfo = U.baseOf(S.path) + ', ' + (ps.size < 1048576 ? Math.max(1, Math.round(ps.size / 1024)) + ' КБ' : (ps.size / 1048576).toFixed(1) + ' МБ'); } catch (e) { /* без размера */ } }

		function used() { return st.imgs.filter(function (im) { return im.on; }); }
		function stepsHtml() { return '<div class="fbkSteps"><span class="' + (st.step === 1 ? 'on' : '') + '"><b>1</b>Покажите место</span><i></i><span class="' + (st.step === 2 ? 'on' : '') + '"><b>2</b>Опишите</span></div>'; }
		function body1() {
			var im = st.imgs[st.cur], thumbs = '';
			if (st.imgs.length > 1) thumbs = '<div class="fbkThumbs">' + st.imgs.map(function (x, i) { return '<div class="fbkTh' + (i === st.cur ? ' on' : '') + (x.on ? '' : ' off') + '" data-i="' + i + '"><img src="' + x.src + '" alt=""><span>' + (x.kind === 'win' ? 'окно программы' : 'вставленный') + '</span>' + (x.kind === 'win' ? '' : '<button class="fbkDel" title="Убрать эту картинку">✕</button>') + '</div>'; }).join('') + '</div>';
			return stepsHtml() + (im
				? '<div class="fbkShot' + (im.on ? '' : ' off') + '"><canvas id="fbkCv"></canvas></div>'
				: '<div class="fbkNone">' + (st.noSnap ? 'Снимок окна сделать не удалось.' : 'Снимка нет.') + '<br>Можно вставить свой: сделайте снимок экрана (Win+Shift+S) и нажмите здесь Ctrl+V. Или просто нажмите «Дальше».</div>') +
				thumbs +
				'<div class="fbkRow">' + (st.imgs[0] && st.imgs[0].kind === 'win' ? '<label class="chk"><input type="checkbox" id="fbkWin"' + (st.imgs[0].on ? ' checked' : '') + '> Снимок окна</label>' : '') +
				'<span class="g">' + (im && im.on ? 'Обведите мышью место, о котором пишете. Рамок может быть несколько.' : '') + '</span>' +
				'<button id="fbkPaste" title="Сделайте снимок экрана (Win+Shift+S) и нажмите Ctrl+V"' + (st.imgs.length >= MAX_IMG ? ' disabled' : '') + '>Вставить свой (Ctrl+V)</button><button id="fbkClear"' + (im && im.marks.length ? '' : ' disabled') + '>Стереть пометки</button></div>';
		}
		function seg(id, map, val, cls) { return '<div class="fbkSeg ' + (cls || '') + '" id="' + id + '">' + Object.keys(map).map(function (k) { return '<button data-v="' + k + '" class="' + (k === val ? 'on' : '') + '">' + map[k] + '</button>'; }).join('') + '</div>'; }
		function body2() {
			var n = used().length;
			return stepsHtml() + '<div class="fbkForm">' +
				'<div><label class="t">Что это</label>' + seg('fbkKind', KIND, st.kind) + '</div>' +
				'<div id="fbkSevBox"' + (st.kind === 'bug' ? '' : ' hidden') + '><label class="t">Насколько мешает</label>' + seg('fbkSev', SEV, st.sev, 's') + '</div>' +
				'<div><label class="t" for="fbkText" id="fbkTextL">' + textLabel() + '</label><textarea id="fbkText" maxlength="6000" autofocus>' + esc(st.text) + '</textarea></div>' +
				'<div><label class="t" for="fbkName">Кто пишет</label><input type="text" id="fbkName" maxlength="60" placeholder="имя — чтобы было понятно, от кого отзыв" value="' + esc(st.name) + '"></div>' +
				'<div><label class="t" for="fbkReply">Почта для ответа <span class="opt">— необязательно</span></label><input type="text" id="fbkReply" maxlength="120" spellcheck="false" autocomplete="off" placeholder="если хотите, чтобы вам ответили" value="' + esc(st.reply) + '"></div>' +
				'<div class="fbkAtt">' + (n ? 'Снимков: <b>' + n + '</b>' + (used().reduce(function (a, x) { return a + x.marks.length; }, 0) ? ' с пометками' : '') : 'Без снимков') + ' <button class="link" id="fbkToShot">изменить</button></div>' +
				(projInfo ? '<label class="chk"><input type="checkbox" id="fbkProj"' + (st.proj ? ' checked' : '') + '><div>Приложить файл проекта<span>' + esc(projInfo) + ' — чтобы ошибку можно было повторить. В файле модель заказа; он уйдёт разработчику письмом.</span></div></label>' : '') +
				'<label class="chk"><input type="checkbox" id="fbkDiag"' + (st.diag ? ' checked' : '') + '><div>Сведения о программе<span>версия, Windows, раздел, настройки, последние ошибки окна. Без путей к папкам и имён пользователей.</span></div></label>' +
				'</div>';
		}
		function textLabel() { return st.kind === 'bug' ? 'Что случилось и что вы ожидали' : (st.kind === 'wish' ? 'Что хотелось бы изменить или добавить' : 'Что непонятно'); }

		var modal = null;
		function btn(id) { return modal.querySelector('.foot [data-id="' + id + '"]'); }
		function keep() {
			if (st.step !== 2 || !modal.querySelector('#fbkText')) return;
			st.text = modal.querySelector('#fbkText').value; st.name = modal.querySelector('#fbkName').value.trim();
			st.reply = modal.querySelector('#fbkReply').value.trim();
			if (modal.querySelector('#fbkProj')) st.proj = modal.querySelector('#fbkProj').checked;
			st.diag = modal.querySelector('#fbkDiag').checked;
		}
		function draw() {
			var im = st.imgs[st.cur], cv = modal.querySelector('#fbkCv');
			if (!im || !cv) return Promise.resolve();
			return renderImage(im, cv).then(function () {
				if (!st.drag) return;
				var cx = cv.getContext('2d'), d = st.drag;
				cx.setLineDash([Math.max(6, im.w / 200), Math.max(4, im.w / 300)]); cx.strokeStyle = '#e0352b'; cx.lineWidth = Math.max(2, Math.round(im.w / 600));
				cx.strokeRect(Math.min(d.x0, d.x1), Math.min(d.y0, d.y1), Math.abs(d.x1 - d.x0), Math.abs(d.y1 - d.y0)); cx.setLineDash([]);
			});
		}
		function show() {
			var bd = modal.querySelector('.body');
			modal.style.width = (st.step === 1 ? 1120 : 640) + 'px';
			bd.innerHTML = st.step === 1 ? body1() : body2();
			btn('back').hidden = st.step === 1; btn('skip').hidden = st.step !== 1 || !used().length;
			btn('next').textContent = st.step === 1 ? 'Дальше' : 'Отправить';
			btn('mine').textContent = 'Мои отзывы' + (F.state.total ? ': ' + F.state.total : '') + (F.state.wait ? ' · ждёт отправки: ' + F.state.wait : '');
			if (st.step === 1) wire1(); else wire2();
		}
		function wire1() {
			var cv = modal.querySelector('#fbkCv'), im = st.imgs[st.cur];
			draw();
			function pt(e) { var r = cv.getBoundingClientRect(); return { x: Math.max(0, Math.min(im.w, (e.clientX - r.left) * im.w / r.width)), y: Math.max(0, Math.min(im.h, (e.clientY - r.top) * im.h / r.height)) }; }
			if (cv && im.on) {
				cv.onpointerdown = function (e) { if (e.button) return; var p = pt(e); st.drag = { x0: p.x, y0: p.y, x1: p.x, y1: p.y }; try { cv.setPointerCapture(e.pointerId); } catch (e1) { /* не страшно */ } e.preventDefault(); };
				cv.onpointermove = function (e) { if (!st.drag) return; var p = pt(e); st.drag.x1 = p.x; st.drag.y1 = p.y; draw(); };
				cv.onpointerup = cv.onpointercancel = function () {
					var d = st.drag; st.drag = null;
					if (d && Math.abs(d.x1 - d.x0) > im.w / 120 && Math.abs(d.y1 - d.y0) > im.w / 120) im.marks.push({ x: Math.min(d.x0, d.x1), y: Math.min(d.y0, d.y1), w: Math.abs(d.x1 - d.x0), h: Math.abs(d.y1 - d.y0) });
					draw(); modal.querySelector('#fbkClear').disabled = !im.marks.length;
				};
			}
			var w = modal.querySelector('#fbkWin');
			if (w) w.onchange = function () { st.imgs[0].on = w.checked; show(); };
			modal.querySelector('#fbkClear').onclick = function () { if (im) { im.marks = []; show(); } };
			modal.querySelector('#fbkPaste').onclick = function () {
				if (!navigator.clipboard || !navigator.clipboard.read) { U.toast('Сделайте снимок экрана (Win+Shift+S) и нажмите Ctrl+V.'); return; }
				navigator.clipboard.read().then(function (items) {
					for (var i = 0; i < items.length; i++) for (var j = 0; j < items[i].types.length; j++) if (/^image\//.test(items[i].types[j])) return items[i].getType(items[i].types[j]).then(addBlob);
					U.toast('В буфере обмена нет картинки. Сделайте снимок экрана (Win+Shift+S) и нажмите Ctrl+V.');
				}, function () { U.toast('Сделайте снимок экрана (Win+Shift+S) и нажмите Ctrl+V.'); });
			};
			var th = modal.querySelector('.fbkThumbs');
			if (th) th.onclick = function (e) {
				var d = e.target.closest('.fbkTh'); if (!d) return;
				var i = Number(d.dataset.i);
				if (e.target.closest('.fbkDel')) { st.imgs.splice(i, 1); st.cur = Math.min(st.cur, st.imgs.length - 1); if (st.cur < 0) st.cur = 0; } else st.cur = i;
				show();
			};
		}
		function wire2() {
			function pick(id, key) { modal.querySelector('#' + id).onclick = function (e) { var b = e.target.closest('button'); if (!b) return; keep(); st[key] = b.dataset.v; show(); modal.querySelector('#fbkText').focus(); }; }
			pick('fbkKind', 'kind'); pick('fbkSev', 'sev');
			modal.querySelector('#fbkToShot').onclick = function () { keep(); st.step = 1; show(); };
			var t = modal.querySelector('#fbkText'); t.focus(); t.setSelectionRange(t.value.length, t.value.length);
		}
		function addBlob(blob) {
			if (st.imgs.length >= MAX_IMG) { U.toast('К отзыву можно приложить не больше трёх картинок.'); return; }
			var fr = new FileReader();
			fr.onload = function () {
				var pic = new Image();
				pic.onload = function () {
					/* очень большие снимки (несколько мониторов) уменьшаем до разумного */
					var k = Math.min(1, 3200 / Math.max(pic.naturalWidth, pic.naturalHeight)), cv = document.createElement('canvas');
					cv.width = Math.round(pic.naturalWidth * k); cv.height = Math.round(pic.naturalHeight * k);
					cv.getContext('2d').drawImage(pic, 0, 0, cv.width, cv.height);
					keep();
					st.imgs.push({ src: cv.toDataURL('image/png'), w: cv.width, h: cv.height, kind: 'paste', on: true, marks: [] });
					st.cur = st.imgs.length - 1; st.step = 1; show();
				};
				pic.src = fr.result;
			};
			fr.readAsDataURL(blob);
		}
		function onPaste(e) {
			var items = (e.clipboardData && e.clipboardData.items) || [];
			for (var i = 0; i < items.length; i++) if (items[i].kind === 'file' && /^image\//.test(items[i].type)) { e.preventDefault(); addBlob(items[i].getAsFile()); return; }
		}
		async function send() {
			keep();
			var text = st.text.replace(/^\s+|\s+$/g, '');
			if (text.length < 3) { U.toast('Напишите хотя бы пару слов — что случилось или чего хочется.'); modal.querySelector('#fbkText').focus(); return false; }
			if (!st.name) { U.toast('Подпишитесь: по имени понятно, от кого отзыв.'); modal.querySelector('#fbkName').focus(); return false; }
			if (st.reply && !MAIL_RE.test(st.reply)) { U.toast('Почта для ответа не похожа на адрес. Исправьте её или сотрите — поле необязательное.'); modal.querySelector('#fbkReply').focus(); return false; }
			var b = btn('next'); b.disabled = true; b.textContent = 'Отправляю…';
			try {
				var images = [], list = used(), i;
				for (i = 0; i < list.length; i++) images.push((await renderImage(list[i], document.createElement('canvas'))).toDataURL('image/png'));
				mem.name = st.name; mem.reply = st.reply; mem.proj = st.proj ? 1 : 0; mem.diag = st.diag ? 1 : 0; A.saveSettings();
				var withProj = st.proj && S.path && projInfo;
				if (withProj && S.dirty) { A.save(true); await new Promise(function (res) { setTimeout(res, 600); }); }      // проект уйдёт таким, какой он сейчас в окне
				var r = await U.api.fb.send({ kind: st.kind, sev: st.kind === 'bug' ? st.sev : '', text: text, name: st.name, reply: st.reply, app: appLine(), where: whereLine(), images: images, project: withProj ? S.path : '', diag: st.diag ? F.diag(text) : '' });
				await F.refresh();
				if (r.sent) U.toast('Отзыв отправлен. Спасибо!');
				else U.toast('Отзыв сохранён, но пока не ушёл: ' + (r.why || 'нет связи') + '. Программа отправит его сама при следующем запуске.', { ms: 14000, actions: [{ label: 'Сохранить файлом…', run: function () { F.exportItem(r.id); } }, { label: 'Мои отзывы', run: F.list }] });
				return true;
			} catch (e) { b.disabled = false; b.textContent = 'Отправить'; throw e; }
		}

		document.addEventListener('paste', onPaste);
		return U.modal({
			title: 'Отзыв о программе', width: 1120, cls: 'fbk', sticky: true, body: '',
			buttons: [
				{ label: 'Мои отзывы', id: 'mine', left: true, keep: true, run: function () { keep(); F.list(); return false; } },
				{ label: 'Без снимка', id: 'skip', left: true, keep: true, run: function () { st.imgs.forEach(function (im) { im.on = false; }); st.imgs = st.imgs.filter(function (im) { return im.kind === 'win'; }); st.cur = 0; st.step = 2; show(); return false; } },
				{ label: 'Отмена', value: false },
				{ label: 'Назад', id: 'back', keep: true, run: function () { keep(); st.step = 1; show(); return false; } },
				{ label: 'Дальше', id: 'next', primary: true, keep: true, run: async function (m, close) {
					if (st.step === 1) { st.step = 2; show(); return false; }
					if (await send()) close(true);
					return false;
				} }
			],
			onOpen: function (m) { modal = m; show(); }
		}).then(function (v) { document.removeEventListener('paste', onPaste); return v; });
	};

	/* ------------------------------ мои отзывы --------------------------------- */

	F.exportItem = async function (id) {
		var S = window.App.S;
		var p = await U.pick({ kind: 'save', title: 'Сохранить отзыв файлом', dir: S.boot.docs, name: 'Отзыв STHGroup ' + id + '.zip', filters: [{ name: 'Архив ZIP', ext: ['zip'] }] });
		if (!p) return;
		try { await U.api.fb.exportItem(id, p); U.toast('Отзыв сохранён: ' + U.baseOf(p) + '. Перешлите этот файл разработчику любым способом.', { ms: 12000, actions: [{ label: 'Папка', run: function () { U.api.open(U.dirOf(p)).catch(U.error); } }] }); } catch (e) { U.error(e); }
	};
	F.list = async function () {
		var data;
		try { data = await U.api.fb.list(); } catch (e) { U.error(e); return; }
		function when(ms) { return new Date(ms).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); }
		function rows() {
			if (!data.items.length) return '<tr><td colspan="4" class="mute" style="padding:18px 7px">Отзывов пока нет.</td></tr>';
			return data.items.map(function (it) {
				var sent = it.status === 'sent', first = String(it.text || '').split('\n')[0];
				return '<tr data-id="' + esc(it.id) + '"><td>' + when(it.at) + '</td><td>' + esc(KIND[it.kind] || 'Ошибка') + (it.kind === 'bug' && SEV[it.sev] ? '<br><span class="mute">' + SEV[it.sev] + '</span>' : '') + '</td>' +
					'<td class="name" title="' + esc(it.text) + '">' + esc(first.length > 110 ? first.substring(0, 110) + '…' : first) + '</td>' +
					'<td>' + (sent ? '<span class="fbkOk">отправлен ' + when(it.sentAt) + '</span>' : '<span class="fbkWait" title="' + esc(it.err || '') + '">ждёт отправки</span><div class="btns"><button class="fbkExp">Файлом…</button><button class="fbkRm" title="Убрать отзыв, не отправляя">Убрать</button></div>') + '</td></tr>';
			}).join('');
		}
		function html() {
			return (data.wait ? '<div class="note warn" style="margin:0 0 10px">Ждёт отправки: ' + data.wait + '. ' + esc(lastErr()) + ' Программа пробует отправить их при каждом запуске; можно нажать «Отправить сейчас» или сохранить отзыв файлом и переслать его как угодно.</div>' : '') +
				'<table class="grid fbkList"><thead><tr><th>Когда</th><th>Что</th><th>Текст</th><th>Отправка</th></tr></thead><tbody>' + rows() + '</tbody></table>';
		}
		function lastErr() { for (var i = 0; i < data.items.length; i++) if (data.items[i].status !== 'sent' && data.items[i].err) { var e = data.items[i].err; return 'Причина: ' + e + (/[.!?]$/.test(e) ? '' : '.'); } return ''; }
		return U.modal({
			title: 'Мои отзывы', width: 860, body: html(),
			buttons: [{ label: 'Отправить сейчас', id: 'retry', left: true, keep: true, run: async function (m) {
				var b = m.querySelector('.foot [data-id="retry"]'); b.disabled = true; b.textContent = 'Отправляю…';
				try {
					var r = await U.api.fb.retry();
					data = await U.api.fb.list(); await F.refresh();
					m.querySelector('.body').innerHTML = html();
					U.toast(r.left ? 'Пока не уходит: ' + (r.why || 'нет связи') + '.' : (r.sent ? 'Отправлено: ' + r.sent + '.' : 'Отправлять нечего.'));
				} finally { b.disabled = !data.wait; b.textContent = 'Отправить сейчас'; }
				return false;
			} }, { label: 'Закрыть', value: true, primary: true }],
			onOpen: function (m) {
				m.querySelector('.foot [data-id="retry"]').disabled = !data.wait;
				m.querySelector('.body').addEventListener('click', async function (e) {
					var tr = e.target.closest('tr[data-id]'); if (!tr) return;
					if (e.target.closest('.fbkExp')) F.exportItem(tr.dataset.id);
					else if (e.target.closest('.fbkRm')) {
						if (!(await U.confirm('Убрать отзыв', 'Отзыв не отправлен. Убрать его совсем? Вернуть будет нельзя.', 'Убрать'))) return;
						try { await U.api.fb.remove(tr.dataset.id); data = await U.api.fb.list(); await F.refresh(); m.querySelector('.body').innerHTML = html(); m.querySelector('.foot [data-id="retry"]').disabled = !data.wait; } catch (e2) { U.error(e2); }
					}
				});
			}
		});
	};

	/* ------------------------------ ошибки окна -------------------------------- */

	var offered = {}, lastOffer = 0;
	function note(msg, where, stack) {
		F.log.push({ at: new Date().toLocaleTimeString('ru-RU'), msg: msg, where: where || '', stack: stack ? String(stack).substring(0, 1500) : '' });
		if (F.log.length > 40) F.log.shift();
	}
	function onError(msg, where, stack) {
		msg = String(msg || 'неизвестная ошибка').substring(0, 400);
		if (/ResizeObserver loop|^Script error\.?$/.test(msg)) return;      // безвредный шум браузера
		note(msg, where, stack);
		/* предложить сообщить: не чаще раза в минуту и об одной ошибке один раз; без согласия ничего не уходит */
		if (!F.state.enabled || offered[msg] || Date.now() - lastOffer < 60000 || document.querySelector('.back:not(.out) > .modal.fbk')) return;
		offered[msg] = 1; lastOffer = Date.now();
		U.toast('В окне программы случилась ошибка. Сообщить о ней разработчику?', { bad: true, ms: 20000, actions: [{ label: 'Сообщить', run: function () { F.open({ kind: 'bug', sev: 'hard', text: 'Программа сообщила об ошибке: ' + msg + '\n\nЧто я делал перед этим: ' }); } }] });
	}

	F.init = function () {
		var b = $('bFeedback');
		if (b) b.onclick = function () { F.open(); };
		/* сообщения об ошибках, которые программа показала сама, тоже попадают в сведения (без предложения отправить) */
		var shown = U.error;
		U.error = function (e) { note('показано: ' + String(e && e.message ? e.message : e).substring(0, 400), '', ''); shown(e); };
		window.addEventListener('error', function (e) { onError(e.message, e.filename ? String(e.filename).replace(/^.*\//, '') + ':' + e.lineno : '', e.error && e.error.stack); });
		window.addEventListener('unhandledrejection', function (e) { var r = e.reason; onError(r && r.message ? r.message : String(r), '', r && r.stack); });
		try {
			if (navigator.userAgentData && navigator.userAgentData.getHighEntropyValues) navigator.userAgentData.getHighEntropyValues(['platformVersion']).then(function (v) {
				if (navigator.userAgentData.platform === 'Windows') F.os = 'Windows ' + (parseInt(v.platformVersion, 10) >= 13 ? '11' : '10');
			}, function () { });
		} catch (e) { /* без уточнения версии Windows */ }
		return F.refresh();
	};
})();
