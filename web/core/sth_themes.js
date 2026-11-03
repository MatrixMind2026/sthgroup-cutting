/* STHGroup 2.0 — три темы, выбранные автором; используют штатный механизм BM.theme. */
(function () {
	'use strict';
	if (!BM.THEMES) return;
	[
		{ id: 'sth-workshop', name: 'Светлая мастерская', base: 'light' },
		{ id: 'sth-nordic', name: 'Северный синий', base: 'light' },
		{ id: 'sth-graphite', name: 'Графит', base: 'dark' }
	].forEach(function (t) {
		if (!BM.THEMES.some(function (x) { return x.id === t.id; })) BM.THEMES.push(t);
	});
})();
