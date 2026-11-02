/* STHGroup — выпадающие списки кнопок (.hdd): «Файл», «Документы», «Вид» в раскрое. Внутри — обычные
   кнопки со своими обработчиками; список закрывается после щелчка по кнопке (кроме .keep), щелчком мимо и Esc. */
(function () {
	'use strict';
	function closeAll(except) { [].forEach.call(document.querySelectorAll('.hdd.open'), function (d) { if (d !== except) d.classList.remove('open'); }); }
	document.addEventListener('click', function (e) {
		var t = e.target.closest ? e.target.closest('.hdd > button.dd') : null;
		if (t) { var w = t.parentNode, was = w.classList.contains('open'); closeAll(); if (!was && !t.disabled) w.classList.add('open'); e.preventDefault(); return; }
		var inMenu = e.target.closest && e.target.closest('.hdd .ddMenu');
		if (inMenu) { var b = e.target.closest('button'); if (b && !b.classList.contains('keep')) closeAll(); return; }
		closeAll();
	}, true);
	document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && document.querySelector('.hdd.open')) { closeAll(); e.stopPropagation(); } }, true);
	window.UI = window.UI || {};
	window.UI.closeDropdowns = closeAll;
})();
