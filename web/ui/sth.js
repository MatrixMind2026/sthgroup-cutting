/* STHGroup: свои команды окна (не из BazisReborn).
   «Файл → Скрипт для БАЗИСа…» — кладёт скрипт выгрузки STHGroup_Export.js со значком в папку скриптов БАЗИСа
   (папка STHGroup внутри неё). Папка запоминается: при каждом запуске программа обновляет скрипт сама. */
(function () {
	'use strict';
	var U = window.UI;
	async function installScript() {
		var A = window.App, S = A.S;
		var dir = await U.pick({ kind: 'folder', title: 'Папка скриптов БАЗИС-Мебельщика (обычно «Скрипты» в папке БАЗИСа)', dir: S.set.sthScripts || S.boot.docs });
		if (!dir) return;
		try {
			var r = await fetch('/api/sth/script', { method: 'POST', headers: { 'X-BM-Token': new URLSearchParams(location.search).get('t') || '', 'Content-Type': 'application/json' }, body: JSON.stringify({ dir: dir }) });
			var j = await r.json(); if (!r.ok) throw new Error(j.error || ('Ошибка ' + r.status));
			S.set.sthScripts = dir; A.saveSettings(true);
			U.toast('Скрипт выгрузки записан: ' + j.path + '. В БАЗИСе добавьте его кнопкой на панель скриптов — дальше программа обновляет его сама.', { ms: 14000, actions: [{ label: 'Папка', run: function () { U.api.open(U.dirOf(j.path)).catch(U.error); } }] });
		} catch (e) { U.error(e); }
	}
	window.STH = { installScript: installScript };
		['bScript', 'wScript'].forEach(function (id) { var b0 = document.getElementById(id); if (b0) b0.onclick = installScript; });
})();
