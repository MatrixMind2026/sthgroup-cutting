/* STHGroup 2.0 — две темы: светлая «Светлая» (по умолчанию) и тёмная «Темная». Используют штатный механизм BM.theme. */
(function () {
	'use strict';
	if (!BM.THEMES) return;
	var sth = BM.THEMES.filter(function (t) { return t.id === 'sth'; })[0];
	BM.THEMES.length = 0;
	BM.THEMES.push({ id: 'sth-workshop', name: 'Светлая', base: 'light' });
	if (sth) { sth.name = 'Темная'; BM.THEMES.push(sth); }
})();
