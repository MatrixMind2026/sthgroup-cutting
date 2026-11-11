/* STHGroup 11.11.2026 — обновление скачано: полоска внутри программы «Перезапустить сейчас / Позже»
   (раньше — окно Windows из оболочки). Оболочка качает обновление сама; окно раз в минуту спрашивает её состояние. */
(function () {
	'use strict';
	var U = window.UI, shown = '';
	async function tick() {
		var s = null;
		try { s = await U.api.upd.state(); } catch (e) { return; }
		if (!s || s.status !== 'downloaded' || !s.seen || s.seen === shown) return;
		shown = s.seen;
		var ok = await U.modal({ bar: true, title: 'Новая версия ' + s.seen + ' скачана.', body: '<p>Установится при перезапуске программы. Проект уже сохранён.</p>',
			buttons: [{ label: 'Позже', value: false }, { label: 'Перезапустить сейчас', primary: true, value: true }] });
		if (ok) { try { await fetch('/api/upd/install', { method: 'POST', headers: { 'X-BM-Token': new URLSearchParams(location.search).get('t') || '' } }); } catch (e) { U.error(e); } }
	}
	setTimeout(tick, 15000);
	setInterval(tick, 60000);
})();
