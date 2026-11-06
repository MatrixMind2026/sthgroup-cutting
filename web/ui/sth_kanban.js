/* STHGroup 2.0 — заказы карточками: шесть этапов, поиск и перетаскивание.
   Представление использует ту же книгу и расчёт STHO; файлы изделий по клику не открываются. */
(function () {
	'use strict';
	var U = window.UI, O = BM.sth, X = window.STHO; if (!U || !O || !X) return;
	var esc = U.esc, host = document.getElementById('orders'); if (!host) return;
	function S() { return window.App.S; }
	var draggedStage = '', ignoreClickUntil = 0;
	function clearDrop() {
		host.querySelectorAll('.soLane').forEach(function (el) { el.classList.remove('dragover', 'soLaneBefore', 'soLaneAfter', 'soLaneDragging'); });
	}
	function reorder(id, target, after) {
		if (!O.moveStage(X.book, id, target, after)) return;
		X.save(true);
		Promise.resolve(X.render()).then(function () {
			host.querySelectorAll('.soLaneTitle').forEach(function (el) {
				if (el.dataset.rename === id) { el.focus({ preventScroll: true }); el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
			});
		});
		U.toast('Порядок колонок сохранён.');
	}
	/* как открывать заказы — из настроек (по умолчанию карточками); переключение кнопками — только сейчас, настройку не меняет */
	function pref() { var s = S(); return s && s.set && s.set.sthOrderView === 'list' ? 'list' : 'board'; }
	X.view = pref();
	X.sgFocusOrder = false;
	function saveView(v) { X.view = v; X.sgFocusOrder = false; }
	X.resetView = function () { X.view = pref(); X.sgFocusOrder = false; };
	function sum(o) { try { return O.calc(X.book, o); } catch (e) { return { total: 0, paid: 0, debt: 0 }; } }
	function filtered() {
		var q = String(X.q || '').toLowerCase().replace(/ё/g, 'е');
		return X.book.orders.filter(function (o) {
			if (X.st && o.status !== X.st) return false;
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
	function viewBar() {
		return '<div class="soViewBar"><div class="tabs"><button data-oview="list"' + (X.view === 'list' ? ' class="on"' : '') + '>Список</button><button data-oview="board"' + (X.view === 'board' ? ' class="on"' : '') + '>Карточки</button></div>' +
			'<input type="search" id="soBoardQ" placeholder="Номер, клиент, изделие" value="' + esc(X.q || '') + '"><select id="soSt" aria-label="Фильтр по этапу"><option value="">Все этапы</option>' + O.stages(X.book).map(function (s) { return '<option value="' + esc(s[0]) + '"' + (s[0] === X.st ? ' selected' : '') + '>' + esc(s[1]) + '</option>'; }).join('') + '</select><div class="grow"></div>' +
			'<button class="primary" id="soNew">+ Новый заказ</button></div>';
	}
	function listHtml() {
		var list = filtered();
		return viewBar() + '<div class="soOrderList"><table class="grid"><thead><tr><th>Заказ</th><th>Клиент</th><th>Изделие</th><th>Этап</th><th class="r">Сумма</th></tr></thead><tbody>' + list.map(function (o) {
			var c = O.client(X.book, o.clientId);
			return '<tr data-ko="' + esc(o.id) + '"><td><button class="link" data-ko="' + esc(o.id) + '">' + esc(o.no) + '</button></td><td>' + esc(c ? c.name : 'Без клиента') + '</td><td>' + esc(o.items.map(function (i) { return i.title || U.stemOf(i.path); }).join(', ') || 'Изделия ещё не добавлены') + '</td><td>' + esc(O.statusName(o.status, X.book)) + '</td><td class="r">' + O.money(sum(o).total) + ' ₽</td></tr>';
		}).join('') + '</tbody></table>' + (!list.length ? '<div class="soEmpty">Заказы не найдены.</div>' : '') + '</div>';
	}
	function boardHtml() {
		var list = filtered();
		return viewBar() +
			'<div class="soBoard">' + O.stages(X.book).map(function (s) {
				var rows = list.filter(function (o) { return o.status === s[0]; });
				var total = rows.reduce(function (a, o) { return a + sum(o).total; }, 0);
				var custom = O.BASE_STAGES.indexOf(s[0]) < 0;
				return '<section class="soLane" data-stage="' + esc(s[0]) + '"><div class="soLaneTitle" draggable="true" tabindex="0" role="button" aria-label="' + esc(s[1]) + ': перетащить колонку; Alt и стрелки — переместить; Enter — переименовать" data-rename="' + esc(s[0]) + '" title="Перетащите за заголовок · Alt + стрелки — переместить · Щелчок — переименовать"><span class="soLaneName">' + esc(s[1]) + ' <span class="soLaneCount">' + rows.length + '</span></span><small>' + O.money(total) + ' ₽</small>' +
					(custom && !rows.length ? '<button class="soLaneDel" data-delstage="' + esc(s[0]) + '" title="Удалить пустую колонку">✕</button>' : '') + '</div>' +
					'<div class="soLaneCards">' + (rows.map(card).join('') || '<div class="soLaneEmpty">Сюда можно перетащить заказ</div>') + '</div></section>';
			}).join('') + '<button class="soLaneAdd" id="soStageAdd" title="Добавить свою колонку">+ Колонка</button></div>';
	}
	/* окно с одним полем — название этапа (добавление и переименование) */
	async function askStageName(title, value) {
		var inp = null;
		var r = await U.modal({ title: title, width: 420, cls: 'sthStage',
			body: '<label class="fld wide">Название<input type="text" id="stgN" maxlength="40" value="' + esc(value || '') + '" spellcheck="false"></label>',
			buttons: [{ label: 'Отмена', value: null }, { label: 'Сохранить', primary: true, run: function () {
				var v = inp ? inp.value.trim() : '';
				if (!v) { U.toast('Впишите название.'); return false; }
				return v;
			} }],
			onOpen: function (el) { inp = el.querySelector('#stgN'); if (inp) { inp.focus(); inp.select(); } } });
		return r || null;
	}
	async function renameStageAsk(id) {
		var name = await askStageName('Переименовать этап', O.stageName(X.book, id));
		if (!name) return;
		if (O.renameStage(X.book, id, name)) { X.save(true); X.render(); U.toast('Этап переименован — новое название видно везде.'); }
	}
	async function addStageAsk() {
		var name = await askStageName('Новая колонка', '');
		if (!name) return;
		var st = O.addStage(X.book, name);
		if (st) { X.save(true); Promise.resolve(X.render()).then(function () { var add = host.querySelector('#soStageAdd'); if (add) add.scrollIntoView({ block: 'nearest', inline: 'end' }); }); U.toast('Колонка «' + st.name + '» добавлена в конец.'); }
	}
	async function delStageAsk(id) {
		if (!(await U.confirm('Удалить колонку?', 'Колонка «' + O.stageName(X.book, id) + '» уберётся с доски. Заказов в ней нет.', 'Удалить'))) return;
		var r = O.removeStage(X.book, id);
		if (r.ok) { X.save(true); X.render(); U.toast('Колонка удалена.'); }
		else U.toast(r.reason === 'used' ? 'В колонке есть заказы — сначала перетащите их.' : 'Эту колонку удалить нельзя.', { bad: true });
	}
	var render0 = X.render;
	X.render = async function () {
		var collection = !X.sgFocusOrder && S().section === 'orders';
		host.classList.toggle('soBoardMode', collection);
		host.classList.toggle('soCollection', collection);
		if (!collection) {
			return render0.apply(this, arguments);
		}
		if (!X.book) await X.load();
		if (!X.book) { host.innerHTML = '<div class="soEmpty">Нет папки для заказов.</div>'; return; }
		X.snapOpen(); host.innerHTML = X.view === 'list' ? listHtml() : boardHtml();
	};
	function openOrder(id) {
		if (!O.order(X.book, id)) return;
		X.cur = id; X.tab = 'calc'; X.sgFocusOrder = true; X.render();
	}
	host.addEventListener('click', function (e) {
		if (Date.now() < ignoreClickUntil) { e.preventDefault(); return; }
		var v = e.target.closest('[data-oview]'); if (v) { saveView(v.dataset.oview); X.render(); return; }
		var add = e.target.closest('#soStageAdd'); if (add) { addStageAsk(); return; }
		var del = e.target.closest('[data-delstage]'); if (del) { delStageAsk(del.dataset.delstage); return; }
		var rn = e.target.closest('[data-rename]'); if (rn) { renameStageAsk(rn.dataset.rename); return; }
		var c = e.target.closest('[data-ko]'); if (c) openOrder(c.dataset.ko);
	});
	host.addEventListener('keydown', function (e) {
		var title = e.target.closest('.soLaneTitle');
		if (title && e.target === title) {
			if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
				e.preventDefault();
				var stages = O.stages(X.book), i = stages.findIndex(function (s) { return s[0] === title.dataset.rename; });
				var next = stages[i + (e.key === 'ArrowLeft' ? -1 : 1)];
				if (next) reorder(title.dataset.rename, next[0], e.key === 'ArrowRight');
				return;
			}
			if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); renameStageAsk(title.dataset.rename); return; }
		}
		var c = e.target.closest('[data-ko]'); if (c && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openOrder(c.dataset.ko); }
	});
	host.addEventListener('input', function (e) {
		if (e.target.id !== 'soBoardQ') return;
		X.q = e.target.value; var content = host.querySelector('.soBoard,.soOrderList');
		if (content) { var tmp = document.createElement('div'); tmp.innerHTML = X.view === 'list' ? listHtml() : boardHtml(); content.replaceWith(tmp.querySelector('.soBoard,.soOrderList')); }
	});
	host.addEventListener('dragstart', function (e) {
		var title = e.target.closest('.soLaneTitle');
		if (title && e.dataTransfer) {
			if (e.target.closest('button')) { e.preventDefault(); return; }
			draggedStage = title.dataset.rename;
			e.dataTransfer.setData('text/plain', 'sth-stage:' + draggedStage);
			e.dataTransfer.effectAllowed = 'move'; title.closest('.soLane').classList.add('soLaneDragging'); return;
		}
		draggedStage = '';
		var c = e.target.closest('[data-ko]'); if (!c || !e.dataTransfer) return;
		e.dataTransfer.setData('text/plain', c.dataset.ko); e.dataTransfer.effectAllowed = 'move'; c.classList.add('dragging');
	});
	host.addEventListener('dragend', function (e) {
		if (draggedStage) ignoreClickUntil = Date.now() + 250;
		draggedStage = ''; clearDrop();
		var c = e.target.closest('[data-ko]'); if (c) c.classList.remove('dragging');
		host.querySelectorAll('.soLane.dragover').forEach(function (x) { x.classList.remove('dragover'); });
	});
	host.addEventListener('dragover', function (e) {
		if (draggedStage) {
			var target = e.target.closest('[data-stage], #soStageAdd'); if (!target) return;
			e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'; clearDrop();
			if (target.dataset.stage && target.dataset.stage !== draggedStage) {
				var rect = target.getBoundingClientRect(); target.classList.add(e.clientX > rect.left + rect.width / 2 ? 'soLaneAfter' : 'soLaneBefore');
			}
			return;
		}
		var lane = e.target.closest('[data-stage]'); if (!lane) return;
		e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'; lane.classList.add('dragover');
	});
	host.addEventListener('dragleave', function (e) {
		var lane = e.target.closest('[data-stage]'); if (lane && !lane.contains(e.relatedTarget)) lane.classList.remove('dragover', 'soLaneBefore', 'soLaneAfter');
	});
	host.addEventListener('drop', function (e) {
		if (draggedStage) {
			e.preventDefault(); var id = draggedStage, target = e.target.closest('[data-stage], #soStageAdd');
			draggedStage = ''; ignoreClickUntil = Date.now() + 250; clearDrop();
			if (target) { var rect = target.getBoundingClientRect(); reorder(id, target.dataset.stage || null, e.clientX > rect.left + rect.width / 2); }
			return;
		}
		var lane = e.target.closest('[data-stage]'); if (!lane) return;
		e.preventDefault(); lane.classList.remove('dragover');
		var id = e.dataTransfer && e.dataTransfer.getData('text/plain'), o = O.order(X.book, id); if (!o) return;
		var moved = O.moveStatus(o, lane.dataset.stage, undefined, X.book); if (!moved.changed) return;
		X.cur = o.id; X.save(true); X.render();
		U.toast('Заказ ' + o.no + ': ' + O.statusName(moved.from, X.book) + ' → ' + O.statusName(moved.to, X.book));
		if (moved.to === 'work') document.dispatchEvent(new CustomEvent('sth:order-work', { detail: o }));
	});
})();
