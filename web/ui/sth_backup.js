/* STHGroup 2.0 — копия базы перед сохранением. Ошибка копии показывается, но не отменяет основное сохранение. */
(function () {
	'use strict';
	var U = window.UI, K = window.MatBase, STH = window.STH;
	if (!U || !K || !STH || K._sthBackupWrapped) return;
	K._sthBackupWrapped = true;
	var pending = null, warned = false;
	async function backup() {
		if (!K.path) return null;
		if (pending) return pending;
		pending = fetch('/api/sth/materials-backup', { method: 'POST', headers: { 'X-BM-Token': new URLSearchParams(location.search).get('t') || '', 'Content-Type': 'application/json' }, body: JSON.stringify({ path: K.path, keep: 12 }) })
			.then(async function (r) { var j = await r.json(); if (!r.ok) throw new Error(j.error || ('Ошибка ' + r.status)); K.lastBackup = j; warned = false; return j; })
			.catch(function (e) { console.warn('Резервная копия базы:', e); if (!warned) { warned = true; U.toast('Не удалось создать резервную копию базы: ' + e.message + '. Основное сохранение продолжится.', { bad: true, ms: 10000 }); } return null; })
			.finally(function () { pending = null; });
		return pending;
	}
	STH.backupBase = backup;
	var save0 = K.saveBase;
	K.saveBase = async function () { await backup(); return save0.apply(this, arguments); };
})();
