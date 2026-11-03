/* STHGroup 2.0 — экран «Сегодня», центр уведомлений, плотность и общий прогресс. */
(function () {
	'use strict';
	var U = window.UI, A = window.App, O = BM.sth; if (!U || !A || !O) return;
	var esc = U.esc, X = window.STHWorkspace = { notes: [], unread: 0, seq: 0 };
	var NAMES = { today: 'Сегодня', orders: 'Заказы', clients: 'Клиенты', stock: 'Склад', model: 'Модель', cut: 'Раскрой', est: 'Смета', base: 'База' };
	var host = document.createElement('section'); host.id = 'today';
	var progress = document.createElement('div'); progress.className = 'sthProgress'; progress.hidden = true;
	var noticeBtn = document.createElement('button'); noticeBtn.id = 'sthNotify'; noticeBtn.title = 'Центр уведомлений';
	var status = document.createElement('span'); status.id = 'sthWorkspaceStatus';
	function go(sec) { var b = document.querySelector('#rail [data-s="' + sec + '"]'); if (b) b.click(); }
	function updateBadge() {
		noticeBtn.innerHTML = 'Уведомления' + (X.unread ? '<span id="sthNotifyBadge">' + X.unread + '</span>' : '');
		noticeBtn.classList.toggle('on', !!X.unread);
	}
	function note(n) {
		X.notes.unshift({ id: Date.now() + Math.random(), at: n.at || new Date().toISOString(), title: n.title || 'Сообщение', text: n.text || '', type: n.type || 'info' });
		if (X.notes.length > 100) X.notes.length = 100; X.unread++; updateBadge(); updateStatus();
		if (A.S.section === 'today') X.render();
	}
	document.addEventListener('sth:notify', function (e) { if (e.detail) note(e.detail); });
	var toast0 = U.toast;
	U.toast = function (text, o) { o = o || {}; if (!o.noNotice) note({ title: o.bad ? 'Ошибка' : 'Сообщение', text: String(text || ''), type: o.bad ? 'error' : 'info' }); return toast0.apply(this, arguments); };
	function updateStatus() {
		var s = A.S, crm = window.STHCRM && STHCRM.state;
		status.textContent = (NAMES[s.section] || s.section || '') + (crm && crm.configured ? ' · CRM: ' + (crm.connected ? 'на связи' : 'не на связи') : '');
		status.title = s.path || 'Проект не открыт';
	}
	X.density = function () {
		var v = A.S.set.sthDensity || 'normal';
		document.body.classList.toggle('sthCompact', v === 'compact'); document.body.classList.toggle('sthComfortable', v === 'comfortable');
	};
	var theme0 = A.applyTheme; A.applyTheme = function () { var r = theme0.apply(this, arguments); X.density(); updateStatus(); return r; };
	function money(v) { return O.money(v) + ' ₽'; }
	X.render = async function () {
		var seq = ++X.seq, orders = window.STHO, book = orders ? await orders.load() : null; if (seq !== X.seq) return;
		var list = book ? book.orders : [], summary = BM.sthWorkspace.summary(book), active = summary.attention;
		function metric(title, value, hint) { return '<div class="todayMetric"><span>' + title + '</span><b>' + value + '</b><small class="mute">' + hint + '</small></div>'; }
		var orderRows = active.slice(0, 7).map(function (o) {
			var c = O.client(book, o.clientId), q; try { q = O.calc(book, o); } catch (e) { q = { total: 0 }; }
			return '<div class="todayItem"><div class="grow"><b>' + esc(o.no) + '</b><div class="mute sm">' + esc(c ? c.name : 'Без клиента') + ' · ' + esc(O.statusName(o.status)) + '</div></div><span>' + money(q.total) + '</span><button data-torder="' + esc(o.id) + '">Открыть</button></div>';
		}).join('') || '<div class="todayEmpty">Активных заказов нет.<br><button class="primary" data-tact="new">Создать первый заказ</button></div>';
		var notes = X.notes.slice(0, 6).map(function (n) { return '<div class="todayItem"><div class="grow"><b>' + esc(n.title) + '</b><div class="mute sm">' + esc(n.text) + '</div></div><time>' + new Date(n.at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) + '</time></div>'; }).join('') || '<div class="todayEmpty">Сообщений пока нет.</div>';
		host.innerHTML = '<div class="todayHead"><div><h2>Сегодня</h2><div class="mute">' + new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', weekday: 'long' }) + '</div></div><div class="grow"></div><button data-tact="open">Открыть модель…</button><button class="primary" data-tact="new">+ Новый заказ</button></div>' +
			'<div class="todayGrid">' + metric('Активные заказы', summary.active, 'расчёт, согласование и работа') + metric('В работе', summary.work, 'заказы на производстве') + metric('Готовы', summary.ready, 'можно отгружать') + metric('Долг', money(summary.debt), 'по заказам с оплатами') + metric('Из CRM', summary.crm, 'карточек принято') + '</div>' +
			'<div class="todayCols"><section class="todayBlock"><h3>Что требует внимания</h3>' + orderRows + '<div class="soRow"><button data-tact="board">Все заказы карточками</button><button data-tact="stock">Склад</button></div></section>' +
			'<section class="todayBlock"><h3>Последние уведомления</h3>' + notes + '<div class="soRow"><button data-tact="notices">Все уведомления</button><button data-tact="crm">Проверить CRM</button></div></section></div>';
		updateStatus();
	};
	X.notices = function () {
		X.unread = 0; updateBadge();
		var body = X.notes.length ? X.notes.map(function (n) { return '<div class="sthNotice"><div class="grow"><b>' + esc(n.title) + '</b><p>' + esc(n.text) + '</p><time>' + new Date(n.at).toLocaleString('ru-RU') + '</time></div></div>'; }).join('') : '<div class="todayEmpty">Уведомлений нет.</div>';
		U.modal({ title: 'Центр уведомлений', width: 620, body: body, buttons: [{ label: 'Очистить', value: 'clear', left: true }, { label: 'Закрыть', primary: true, value: '' }] }).then(function (v) { if (v === 'clear') { X.notes = []; if (A.S.section === 'today') X.render(); } });
	};
	noticeBtn.onclick = X.notices;
	host.addEventListener('click', function (e) {
		var o = e.target.closest('[data-torder]'); if (o && window.STHO) { STHO.cur = o.dataset.torder; STHO.view = 'list'; go('orders'); STHO.render(); return; }
		var b = e.target.closest('[data-tact]'); if (!b) return;
		var a = b.dataset.tact;
		if (a === 'new' && window.STHO && STHO.book) { STHO.cur = O.addOrder(STHO.book, {}).id; STHO.tab = 'items'; STHO.view = 'list'; STHO.save(); go('orders'); STHO.render(); }
		else if (a === 'open') A.openDialog();
		else if (a === 'board') { if (window.STHO) STHO.view = 'board'; go('orders'); }
		else if (a === 'stock') go('stock');
		else if (a === 'notices') X.notices();
		else if (a === 'crm') { if (window.STHCRM) STHCRM.sync(false).then(function (n) { U.toast(n ? 'Новых заказов: ' + n : 'Новых заявок нет.'); X.render(); }).catch(U.error); }
	});
	function updateProgress() {
		var jobs = Object.keys(A.S.jobs || {}).map(function (k) { return A.S.jobs[k]; });
		if (!jobs.length) { progress.hidden = true; return; }
		var running = A.S.running, pc = running ? Math.round((running.progress || 0) * 100) : 0, m = running && A.S.st ? A.S.st.matBy[running.key] : null;
		progress.innerHTML = '<b>' + (running ? 'Идёт раскладка' : 'В очереди на раскладку') + '</b><div class="mute sm">' + (m ? esc(BM.project.matTitle(m)) : 'Материал') + ' · операций: ' + jobs.length + '</div><div class="sthProgressBar"><i style="width:' + Math.max(3, pc) + '%"></i></div><div class="r sm">' + (running ? pc + ' %' : 'ожидание') + '</div>';
		progress.hidden = false;
	}
	var jobs0 = A.renderJobs; A.renderJobs = function () { var r = jobs0.apply(this, arguments); updateProgress(); return r; };
	var render0 = A.render; A.render = function () { var r = render0.apply(this, arguments); updateProgress(); updateStatus(); return r; };
	if (window.Drill) { var section0 = Drill.section; Drill.section = function () { var r = section0.apply(this, arguments); updateStatus(); return r; }; }
	document.addEventListener('DOMContentLoaded', function () {
		U.$('main').appendChild(host); document.body.appendChild(progress);
		var settings = U.$('bSettings'); settings.parentNode.insertBefore(noticeBtn, settings); U.$('stSave').parentNode.insertBefore(status, U.$('stSave'));
		updateBadge(); X.density(); updateStatus();
		(async function () { for (var i = 0; i < 60 && !(A.S.boot && A.S.set); i++) await new Promise(function (r) { setTimeout(r, 250); }); if (A.S.section === 'today') X.render(); })();
	});
})();
