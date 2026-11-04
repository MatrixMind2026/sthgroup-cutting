/* STHGroup 2.0 — темы, выбранные автором; используют штатный механизм BM.theme. */
(function () {
	'use strict';
	if (!BM.THEMES) return;
	[
		{ id: 'sth-workshop', name: 'Светлая мастерская', base: 'light' },
		{ id: 'sth-nordic', name: 'Северный синий', base: 'light' },
		{ id: 'sth-graphite', name: 'Графит', base: 'dark' },
		{ id: 'sth-est-light', name: 'Смета A — светлая', base: 'light' },
		{ id: 'sth-est-graphite', name: 'Смета B — графитовая', base: 'dark' },
		{ id: 'sth-est-total', name: 'Смета C — акцент на суммах', base: 'light' }
	].forEach(function (t) {
		if (!BM.THEMES.some(function (x) { return x.id === t.id; })) BM.THEMES.push(t);
	});
})();
