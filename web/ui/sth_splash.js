/* STHGroup — заставка при запуске (вариант «Спокойная», выбран автором 03.11.2026 из трёх вариантов вживую).
   Знак программы мягко появляется с тёплым свечением, буквы названия проявляются по очереди,
   под названием — оранжевая черта и номер версии (спрашивается у сервера: GET /api/boot).
   Около двух секунд; щелчок или любая клавиша — пропустить.
   Звук — как у прежней заставки: «играй» в начале, «стоп», если пропустили
   (выключается в настройках: «Оформление → Звук при запуске»).
   Заставки нет, если анимации выключены в настройках (сервер ставит класс noanim на <html>),
   отключены в самой Windows (prefers-reduced-motion) или окно открыто с ?splash=0.
   Разметка и стили — целиком в этом файле; файлы копии BazisReborn не тронуты
   (её заставка отключена в ui/splash.js комментарием «STHGroup»). */
(function () {
	'use strict';
	var S = window.Splash = { done: true, skip: function () { } };
	var off = document.documentElement.classList.contains('noanim') || /[?&]splash=0\b/.test(location.search);
	try { off = off || window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { /* нет matchMedia — показываем */ }
	if (off || !document.body) return;

	var T_END = 2150, FADE = 300;      // сцена играет ~1,7 с, ещё чуть-чуть держится и уходит
	var TOKEN = (/[?&]t=([^&#]*)/.exec(location.search) || [])[1] || '';
	function sound(what) {
		try { fetch('/api/sound/' + what, { method: 'POST', headers: { 'X-BM-Token': decodeURIComponent(TOKEN) } }).catch(function () { }); } catch (e) { /* без звука — так без звука */ }
	}

	var css = [
		'#sthSplash{position:fixed;left:0;top:0;right:0;bottom:0;z-index:9999;background:radial-gradient(circle at 50% 42%,#2B2E34 0%,#23262B 48%,#191B1E 100%);opacity:1;transition:opacity .28s ease}',
		'#sthSplash.out{opacity:0}',
		'#sthSplash .scene{position:absolute;left:50%;top:50%;width:960px;height:540px;transform:translate(-50%,-50%)}',
		'#sthSplash .halo{position:absolute;left:50%;top:232px;width:460px;height:460px;margin:-230px 0 0 -230px;border-radius:50%;background:radial-gradient(circle,rgba(242,107,29,.30) 0%,rgba(242,107,29,.12) 42%,rgba(242,107,29,0) 68%);opacity:0;animation:sthSpHalo .8s ease-out both}',
		'#sthSplash .mark{position:absolute;left:50%;top:120px;width:224px;height:224px;margin-left:-112px;opacity:0;animation:sthSpMark .6s .1s cubic-bezier(.2,.7,.3,1) both}',
		'#sthSplash .mark>div{position:absolute;border-radius:4px}',
		'#sthSplash .pw{left:0;top:0;width:118px;height:224px;background:#F3F1EC}',
		'#sthSplash .pw::after{content:"";position:absolute;left:50%;top:50%;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;background:#23262B}',
		'#sthSplash .po{left:128px;top:0;width:96px;height:124px;background:#F26B1D}',
		'#sthSplash .pg{left:128px;top:133px;width:96px;height:91px;background:#9AA0A6}',
		'#sthSplash .word{position:absolute;left:0;top:368px;width:100%;text-align:center;font:600 56px "Segoe UI",system-ui,Arial,sans-serif;letter-spacing:1px}',
		'#sthSplash .word .l{display:inline-block;opacity:0;animation:sthSpFade .3s ease-out both}',
		'#sthSplash .word .a{color:#F3F1EC;font-weight:500}',
		'#sthSplash .word .b{color:#F26B1D;font-weight:700}',
		'#sthSplash .line{position:absolute;left:50%;top:448px;width:190px;height:3px;margin-left:-95px;border-radius:2px;background:#F26B1D;transform:scaleX(0);animation:sthSpLine .45s 1.15s ease-out both}',
		'#sthSplash .ver{position:absolute;left:0;top:470px;width:100%;text-align:center;font:400 15px "Segoe UI",system-ui,Arial,sans-serif;color:#9AA0A6;opacity:0;animation:sthSpFade .4s 1.3s ease-out both}',
		'@keyframes sthSpHalo{from{opacity:0;transform:scale(.8)}to{opacity:1;transform:scale(1)}}',
		'@keyframes sthSpMark{from{opacity:0;transform:translateY(10px) scale(.86)}to{opacity:1;transform:translateY(0) scale(1)}}',
		'@keyframes sthSpFade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}',
		'@keyframes sthSpLine{from{transform:scaleX(0)}to{transform:scaleX(1)}}'
	].join('\n');

	/* буквы названия по очереди: STH — светлые, Group — оранжевые */
	var NAME = 'STHGroup', letters = '', i;
	for (i = 0; i < NAME.length; i++) letters += '<span class="l ' + (i < 3 ? 'a' : 'b') + '" style="animation-delay:' + (0.5 + i * 0.09).toFixed(2) + 's">' + NAME.charAt(i) + '</span>';

	var st = document.createElement('style');
	st.textContent = css;
	document.head.appendChild(st);
	var el = document.createElement('div');
	el.id = 'sthSplash';
	el.innerHTML = '<div class="scene"><div class="halo"></div>' +
		'<div class="mark"><div class="pw"></div><div class="po"></div><div class="pg"></div></div>' +
		'<div class="word">' + letters + '</div><div class="line"></div><div class="ver"></div></div>';
	document.body.appendChild(el);
	var scene = el.querySelector('.scene'), ver = el.querySelector('.ver');

	/* сцена 960×540 вписывается в окно с небольшим запасом */
	function fit() {
		var k = Math.min(window.innerWidth / 960, window.innerHeight / 540) * 0.94;
		if (!(k > 0.2)) k = 0.2;
		scene.style.transform = 'translate(-50%,-50%) scale(' + k + ')';
	}

	var ended = false, timer = 0;
	function finish() {
		if (ended) return;
		ended = true; S.done = true;
		clearTimeout(timer);
		document.removeEventListener('keydown', onKey, true);
		window.removeEventListener('resize', fit);
		el.classList.add('out');
		setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); if (st.parentNode) st.parentNode.removeChild(st); }, FADE);
	}
	function skip() { if (!ended) sound('stop'); finish(); }
	function onKey(e) { if (e.key === 'F5' || e.key === 'F12') return; e.preventDefault(); e.stopPropagation(); skip(); }
	S.done = false;
	S.skip = skip;
	el.addEventListener('mousedown', function (e) { e.preventDefault(); skip(); });
	document.addEventListener('keydown', onKey, true);
	fit();
	window.addEventListener('resize', fit);
	timer = setTimeout(finish, T_END);

	/* номер версии — с сервера; нет ответа (страница открыта без программы) — строка остаётся пустой */
	try {
		fetch('/api/boot', { headers: { 'X-BM-Token': decodeURIComponent(TOKEN) } })
			.then(function (r) { return r.ok ? r.json() : null; })
			.then(function (j) { if (j && j.version) ver.textContent = 'версия ' + j.version; })
			.catch(function () { });
	} catch (e) { /* версии не видно — и ладно */ }

	sound('play');
})();
