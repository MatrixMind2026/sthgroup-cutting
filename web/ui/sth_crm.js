/* STHGroup 2.0 — настройки CRM и приём новых заявок при запуске. */
(function () {
	'use strict';
	var U = window.UI, O = BM.sth, C = BM.sthCrm; if (!U || !O || !C) return;
	var X = window.STHCRM = { state: null, busy: false, started: false };
	function esc(v) { return U.esc(v === undefined || v === null ? '' : v); }
	function notify(title, text, bad) { document.dispatchEvent(new CustomEvent('sth:notify', { detail: { type: bad ? 'error' : 'crm', title: title, text: text || '', at: new Date().toISOString() } })); }
	X.settingsHtml = function () {
		var s = X.state || { url: 'https://crm.migman.ru/app/', email: '', auto: true, hasPassword: false, configured: false };
		return '<div class="form sthCrmSettings"><label>Адрес CRM</label><input type="url" id="crmUrl" spellcheck="false" value="' + esc(s.url || 'https://crm.migman.ru/app/') + '">' +
			'<label>Логин</label><input type="text" id="crmEmail" autocomplete="username" value="' + esc(s.email || '') + '">' +
			'<label>Пароль</label><input type="password" id="crmPassword" autocomplete="current-password" placeholder="' + (s.hasPassword ? 'сохранён на этом компьютере — оставьте пустым' : '') + '">' +
			'<div class="hint">Пароль хранится только на этом компьютере в зашифрованном виде и не записывается в проекты или заказы.</div>' +
			'<label class="chk full"><input type="checkbox" id="crmAuto"' + (s.auto !== false ? ' checked' : '') + '> проверять новые заказы при запуске STHGroup</label>' +
			'<label></label><div class="btns" style="margin:0"><button class="primary" id="crmConnect">Подключить</button><button id="crmTest">Проверить соединение</button><button id="crmSync">Принять заказы сейчас</button></div>' +
			'<label></label><div id="crmStatus" class="hint">' + esc(X.statusText()) + '</div>' +
			(s.configured ? '<label></label><div><button class="link" id="crmDisconnect">Отключить CRM и стереть сохранённый пароль</button></div>' : '') + '</div>';
	};
	X.statusText = function () {
		var s = X.state; if (!s) return 'Читаю состояние…';
		if (X.busy) return 'Связываюсь с CRM…';
		if (s.connected) return '✓ Подключено' + (s.lastCheck ? ' · проверено ' + new Date(s.lastCheck).toLocaleString('ru-RU') : '');
		if (s.lastError) return s.lastError;
		return s.configured ? 'Сохранено. Соединение будет проверено при запуске.' : 'CRM ещё не подключена.';
	};
	function fill(m) {
		var s = X.state || {}; ['Url', 'Email', 'Password', 'Auto', 'Status', 'Disconnect'].forEach(function () { /* элементы проверяются ниже */ });
		var status = m.querySelector('#crmStatus'); if (status) status.textContent = X.statusText();
		var pass = m.querySelector('#crmPassword'); if (pass) pass.placeholder = s.hasPassword ? 'сохранён на этом компьютере — оставьте пустым' : '';
		var sync = m.querySelector('#crmSync'); if (sync) sync.disabled = !s.configured;
	}
	X.bindSettings = async function (m) {
		var auto = m.querySelector('#crmAuto');
		if (m._sthCrmAuto !== undefined) auto.checked = m._sthCrmAuto;
		auto.addEventListener('change', function () { m._sthCrmAuto = auto.checked; });
		try { X.state = await U.api.crm.state(); } catch (e) { X.state = { url: 'https://crm.migman.ru/app/', auto: true, lastError: e.message }; }
		if (!auto.isConnected) return;
		if (m._sthCrmAuto === undefined) auto.checked = X.state.auto !== false;
		fill(m);
		function values() { return { url: m.querySelector('#crmUrl').value.trim(), email: m.querySelector('#crmEmail').value.trim(), password: m.querySelector('#crmPassword').value, auto: m.querySelector('#crmAuto').checked }; }
		async function run(btn, job) {
			if (X.busy) return; X.busy = true; var old = btn.textContent; btn.disabled = true; btn.textContent = 'Подождите…'; fill(m);
			try { await job(); } catch (e) { if (e && e.message) { X.state = Object.assign(X.state || {}, { connected: false, lastError: e.message }); } fill(m); U.error(e); }
			finally { X.busy = false; if (btn.isConnected) { btn.disabled = false; btn.textContent = old; } fill(m); }
		}
		m.querySelector('#crmConnect').onclick = function () { var btn = this; run(btn, async function () { X.state = await U.api.crm.connect(values()); fill(m); U.toast('CRM подключена. Пароль сохранён только на этом компьютере.'); }); };
		m.querySelector('#crmTest').onclick = function () { var btn = this; run(btn, async function () { X.state = await U.api.crm.connect(values()); X.state = await U.api.crm.test(); fill(m); U.toast('Соединение работает. Заявок в CRM: ' + X.state.count + '.'); }); };
		m.querySelector('#crmSync').onclick = function () { var btn = this; run(btn, async function () { var n = await X.sync(false); fill(m); U.toast(n ? 'Создано новых заказов: ' + n + '.' : 'Новых заявок нет — все уже есть в заказах.'); }); };
		var off = m.querySelector('#crmDisconnect'); if (off) off.onclick = async function () {
			if (!(await U.confirm('Отключить CRM', 'Сохранённые пароль и сессия будут стёрты с этого компьютера. Уже созданные заказы останутся.', 'Отключить'))) return;
			X.state = await U.api.crm.disconnect(); U.toast('CRM отключена.'); window.Dlg.settings('crm');
		};
	};
	X.sync = async function (startup) {
		var data = await U.api.crm.sync(); X.state = Object.assign(X.state || {}, data); delete X.state.requests; delete X.state.clients;
		var orders = window.STHO; if (!orders) return 0;
		var book = await orders.load(); if (!book) throw new Error('Не выбрана папка заказов. Настройте её в разделе «Папки и файлы».');
		var result = C.import(book, data.requests, data.clients);
		if (!result.created.length) return 0;
		orders.save(true);
		if (window.App.S.section === 'orders') orders.render();
		var names = result.created.slice(0, 8).map(function (o) { var c = O.client(book, o.clientId); return '<div class="sthCrmNew"><b>' + esc(o.no) + '</b><span>' + esc(c ? c.name : 'Без клиента') + '</span><small>' + esc(o.note || '') + '</small></div>'; }).join('');
		notify('Новые заказы из CRM: ' + result.created.length, result.created.map(function (o) { return o.no; }).join(', '));
		if (startup || result.created.length) {
			U.modal({ title: 'Новые заказы из CRM', width: 560, body: '<p>Создано карточек: <b>' + result.created.length + '</b>. Повторная проверка не создаст дубли.</p>' + names + (result.created.length > 8 ? '<p class="mute">и ещё ' + (result.created.length - 8) + '…</p>' : ''),
				buttons: [{ label: 'Позже', value: false }, { label: 'Открыть заказы', primary: true, value: true }] }).then(function (open) { if (open) { orders.view = 'board'; orders.go('orders'); orders.render(); } });
		}
		return result.created.length;
	};
	async function startup() {
		if (X.started) return; X.started = true;
		for (var i = 0; i < 60 && !(window.App && App.S && App.S.boot && App.S.set); i++) await new Promise(function (r) { setTimeout(r, 250); });
		try {
			X.state = await U.api.crm.state();
			if (X.state.configured && X.state.auto !== false) await X.sync(true);
		} catch (e) { notify('CRM: проверка не выполнена', e.message, true); }
	}
	window.addEventListener('DOMContentLoaded', function () { setTimeout(startup, 1200); });
})();
