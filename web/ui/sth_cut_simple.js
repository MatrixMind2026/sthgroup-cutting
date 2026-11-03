/* STHGroup 2.0 — основной раскрой только для подсчёта листов; прежний экран сохранён в «Подробнее». */
(function () {
	'use strict';
	var U = window.UI, A = window.App, K = BM.sthCutSimple; if (!U || !A || !K) return;
	var host = document.createElement('section'); host.id = 'sthCutSimple'; host.hidden = true;
	var detailed = false;
	function esc(v) { return U.esc(v === undefined || v === null ? '' : v); }
	function update() {
		var simple = A.S.section === 'cut' && !detailed;
		document.body.classList.toggle('sthCutSimpleMode', simple); host.hidden = !simple; if (!simple) return;
		if (!A.S.st) {
			host.innerHTML = '<div class="cutSimpleHead"><h2>Раскрой: количество листов</h2></div><div class="todayEmpty"><p>Откройте модель — программа посчитает листы по каждому материалу.</p><button class="primary" id="cutSimpleOpen">Открыть модель…</button></div>';
			return;
		}
		var v = K.view(A.S.st), title = BM.project.modelName(A.S.st.model) || U.stemOf(A.S.path);
		host.innerHTML = '<div class="cutSimpleHead"><div><h2>Листы в заказе</h2><div class="mute">' + esc(title) + '</div></div><div class="grow"></div><button id="cutSimpleMore">Подробнее</button></div>' +
			'<div class="cutSimpleTotal"><span>Всего листов <b>' + v.sheets + '</b></span><span class="mute">Деталей: ' + v.parts + '</span></div>' +
			(v.unplaced ? '<div class="note warn">Не уложено деталей: ' + v.unplaced + '. Пересчитайте материал или откройте «Подробнее».</div>' : '') +
			'<div class="cutSimpleList">' + (v.mats.length ? v.mats.map(function (m) {
				return '<div class="cutSimpleRow"><div><b>' + esc(m.name) + '</b>' + (m.stale ? '<div class="warn sm">Модель изменилась — нужен пересчёт</div>' : '') + '</div>' +
					'<div><strong>' + m.sheets + '</strong> л.</div><button data-cutmat="' + esc(m.key) + '">Пересчитать</button></div>';
			}).join('') : '<div class="todayEmpty">Листовых материалов в модели нет.</div>') + '</div>' +
			'<p class="cutSimpleHint">Здесь только количество листов для заказа. Карта раскроя, форматы, остатки, поиск деталей и технические настройки ничего не удаляют — они находятся в «Подробнее».</p>';
	}
	var render0 = A.render;
	A.render = function () { var r = render0.apply(this, arguments); update(); return r; };
	document.addEventListener('click', function (e) {
		var rail = e.target.closest && e.target.closest('#rail [data-s="cut"]'); if (rail) { detailed = false; setTimeout(update, 0); return; }
		if (e.target.closest && e.target.closest('#cutSimpleMore')) { detailed = true; update(); A.render(); return; }
		if (e.target.closest && e.target.closest('#sthCutBack')) { detailed = false; update(); return; }
		if (e.target.closest && e.target.closest('#cutSimpleOpen')) { A.openDialog(); return; }
		var b = e.target.closest && e.target.closest('[data-cutmat]'); if (b && A.S.st) { A.S.matKey = b.dataset.cutmat; A.renest(); }
	});
	var back = document.createElement('button'); back.id = 'sthCutBack'; back.textContent = '← К количеству листов'; back.title = 'Скрыть карту и технические панели';
	document.addEventListener('DOMContentLoaded', function () {
		U.$('main').appendChild(host); U.$('center').querySelector('.bar1').insertBefore(back, U.$('center').querySelector('.bar1').firstChild); update();
	});
})();
