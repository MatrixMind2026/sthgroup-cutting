/* STHGroup 2.0 — заказы карточками: шесть этапов, поиск и перетаскивание.
   Представление использует ту же книгу и расчёт STHO; файлы изделий по клику не открываются. */
(function () {
	'use strict';
	var U = window.UI, O = BM.sth, X = window.STHO; if (!U || !O || !X) return;
	var esc = U.esc, host = document.getElementById('orders'); if (!host) return;
	function S() { return window.App.S; }
	/* как открывать заказы — из настроек (по умолчанию карточками); переключение кнопками — только сейчас, настройку не меняет */
	function pref() { var s = S(); return s && s.set && s.set.sthOrderView === 'list' ? 'list' : 'board'; }
	X.view = pref();
	function saveView(v) { X.view = v; }
	X.resetView = function () { X.view = pref(); };
	function sum(o) { try { return O.calc(X.book, o); } catch (e) { return { total: 0, paid: 0, debt: 0 }; } }
	function filtered() {
		var q = String(X.q || '').toLowerCase().replace(/ё/g, 'е');
		return X.book.orders.filter(function (o) {
			if (!q) return true;
			var c = O.client(X.book, o.clientId);
			return String([o.no, c && c.name, c && c.phone, o.note, o.externalId].concat(o.items.map(function (i) { return i.title; })).join(' ')).toLowerCase().replace(/ё/g, 'е').indexOf(q) >= 0;
		});
	}
	function card(o) {
		var c = O.client(X.book, o.clientId), t = sum(o), products = o.items.map(function (i) { return i.title || U.stemOf(i.path); }).filter(Boolean);
		return '<article class="soCard" draggable="true" data-ko="' + esc(o.id) + '" tabindex="0" aria-label="Открыть заказ ' + esc(o.no) + '">' +
			'<div class="soCardNo"><span>' + esc(o.no) + '</span><span>' + esc(O.ruDate(o.date)) + '</span></div>' +
			'<div class="soCardClient">' + esc(c ? c.name : 'Без клиента') + (o.urgent ? ' <span class="soUrgent">Срочно</span>' : '') + '</div>' +
			(products.length ? '<div class="soCardProducts">' + esc(products.join(', ')) + '</div>' : '<div class="soCardProducts mute">Изделия ещё не добавлены</div>') +
			(o.note ? '<div class="soCardNote" title="' + esc(o.note) + '">' + esc(o.note) + '</div>' : '') +
			'<div class="soCardMeta"><span>' + o.items.length + ' изд.</span><span class="soCardTotal">' + O.money(t.total) + ' ₽</span></div>' +
			(t.debt > 0.009 && t.paid > 0 ? '<div class="soCardDebt">Долг: ' + O.money(t.debt) + ' ₽</div>' : '') +
			(o.source === 'crm' ? '<div class="soCardSource">Из CRM' + (o.externalNo ? ' · ' + esc(o.externalNo) : '') + '</div>' : '') + '</article>';
	}
	function boardHtml() {
		var list = filtered();
		return '<div class="soViewBar"><div class="tabs"><button data-oview="list">Список</button><button class="on" data-oview="board">Карточки</button></div>' +
			'<input type="search" id="soBoardQ" placeholder="Номер, клиент, изделие" value="' + esc(X.q || '') + '"><div class="grow"></div>' +
			'<span class="mute sm">Перетащите карточку в нужный этап</span><button class="primary" id="soNew">+ Новый заказ</button></div>' +
			'<div class="soBoard">' + O.STATUSES.map(function (s) {
				var rows = list.filter(function (o) { return o.status === s[0]; });
				var total = rows.reduce(function (a, o) { return a + sum(o).total; }, 0);
				return '<section class="soLane" data-stage="' + s[0] + '"><div class="soLaneTitle"><span>' + esc(s[1]) + ' <span class="soLaneCount">' + rows.length + '</span></span><small>' + O.money(total) + ' ₽</small></div>' +
					'<div class="soLaneCards">' + (rows.map(card).join('') || '<div class="soLaneEmpty">Сюда можно перетащить заказ</div>') + '</div></section>';
			}).join('') + '</div>';
	}
	var render0 = X.render;
	X.render = async function () {
		host.classList.toggle('soBoardMode', X.view === 'board' && S().section === 'orders');
		if (X.view !== 'board' || S().section !== 'orders') {
			var result = await render0.apply(this, arguments), sec = host.querySelector('.soL .sec');
			if (sec && S().section === 'orders' && !sec.querySelector('[data-oview]')) sec.innerHTML = 'Заказы <button class="soBoardSwitch" data-oview="board" title="Показать заказы карточками по этапам">Карточки</button>';
			return result;
		}
		if (!X.book) await X.load();
		if (!X.book) { host.innerHTML = '<div class="soEmpty">Нет папки для заказов.</div>'; return; }
		X.snapOpen(); host.innerHTML = boardHtml();
	};
	function openOrder(id) {
		if (!O.order(X.book, id)) return;
		X.cur = id; X.tab = 'calc'; saveView('list'); X.render();
	}
	host.addEventListener('click', function (e) {
		var v = e.target.closest('[data-oview]'); if (v) { saveView(v.dataset.oview); X.render(); return; }
		var c = e.target.closest('[data-ko]'); if (c) openOrder(c.dataset.ko);
	});
	host.addEventListener('keydown', function (e) {
		var c = e.target.closest('[data-ko]'); if (c && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openOrder(c.dataset.ko); }
	});
	host.addEventListener('input', function (e) {
		if (e.target.id !== 'soBoardQ') return;
		X.q = e.target.value; var board = host.querySelector('.soBoard');
		if (board) { var tmp = document.createElement('div'); tmp.innerHTML = boardHtml(); board.replaceWith(tmp.querySelector('.soBoard')); }
	});
	host.addEventListener('dragstart', function (e) {
		var c = e.target.closest('[data-ko]'); if (!c || !e.dataTransfer) return;
		e.dataTransfer.setData('text/plain', c.dataset.ko); e.dataTransfer.effectAllowed = 'move'; c.classList.add('dragging');
	});
	host.addEventListener('dragend', function (e) {
		var c = e.target.closest('[data-ko]'); if (c) c.classList.remove('dragging');
		host.querySelectorAll('.soLane.dragover').forEach(function (x) { x.classList.remove('dragover'); });
	});
	host.addEventListener('dragover', function (e) {
		var lane = e.target.closest('[data-stage]'); if (!lane) return;
		e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'; lane.classList.add('dragover');
	});
	host.addEventListener('dragleave', function (e) {
		var lane = e.target.closest('[data-stage]'); if (lane && !lane.contains(e.relatedTarget)) lane.classList.remove('dragover');
	});
	host.addEventListener('drop', function (e) {
		var lane = e.target.closest('[data-stage]'); if (!lane) return;
		e.preventDefault(); lane.classList.remove('dragover');
		var id = e.dataTransfer && e.dataTransfer.getData('text/plain'), o = O.order(X.book, id); if (!o) return;
		var moved = O.moveStatus(o, lane.dataset.stage); if (!moved.changed) return;
		X.cur = o.id; X.save(true); X.render();
		U.toast('Заказ ' + o.no + ': ' + O.statusName(moved.from) + ' → ' + O.statusName(moved.to));
		if (moved.to === 'work') document.dispatchEvent(new CustomEvent('sth:order-work', { detail: o }));
	});
})();
