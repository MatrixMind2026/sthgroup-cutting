/* STHGroup: инвентаризация и периодические CSV-снимки склада. */
(function () {
	'use strict';
	var U = window.UI, K = window.MatBase, MB = BM.mb, SK = BM.stock, X = window.STHStock;
	if (!X || !SK || !K) return;
	var autoBusy = false, warned = false;
	function S() { return window.App.S; }
	function n(v) { return String(Math.round(v * 1e6) / 1e6).replace('.', ','); }
	function config() { return S().set.sthStockExport || { days: 7, dir: '', last: {} }; }
	async function exportCsv(dir, automatic) {
		await X.pending; await K.refresh(); if (!MB.cur || !K.path) return;
		var source = K.path, snap = SK.csvSnapshot(MB.cur), at = new Date().toISOString();
		var stem = U.baseOf(source).replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]/g, '_') + '-склад-' + at.replace(/[:.]/g, '-');
		await U.api.mkdir(dir);
		await U.api.write(U.join(dir, stem + '-материалы.csv'), snap.materials);
		await U.api.write(U.join(dir, stem + '-обрезки.csv'), snap.offcuts);
		var c = config(); c.last = c.last || {}; c.last[source + '|' + dir] = at; S().set.sthStockExport = c; await U.api.saveSettings(S().set);
		warned = false;
		if (!automatic) U.toast('Сохранены CSV остатков и обрезков: ' + dir);
		return { source: source, at: at, folder: dir };
	}
	X.exportCsv = exportCsv;
	async function maybeExport() {
		var c = config(), last = c.last && c.last[K.path + '|' + c.dir];
		if (autoBusy || !MB.cur || !c.dir || !(Number(c.days) > 0) || (last && Date.now() - Date.parse(last) < Number(c.days) * 86400000)) return;
		autoBusy = true;
		try { await exportCsv(c.dir, true); }
		catch (e) { if (!warned) { warned = true; U.toast('CSV склада не сохранён: ' + e.message, { bad: true, ms: 10000 }); } }
		finally { autoBusy = false; }
	}
	X.maybeExport = maybeExport;
	var refresh = K.refresh;
	K.refresh = async function () { var result = await refresh.apply(this, arguments); setTimeout(maybeExport, 0); return result; };
	setInterval(maybeExport, 15 * 60 * 1000);
	async function settings() {
		var c = config();
		var result = await U.modal({ title: 'Периодический экспорт склада', width: 600, cls: 'skDlg',
			body: '<label class="fld wide">Период<select id="skCsvDays"><option value="0">Выключен</option><option value="1">Каждый день</option><option value="7">Раз в неделю</option></select></label>' +
				'<label class="fld wide">Папка<input type="text" id="skCsvDir" value="' + U.esc(c.dir || '') + '"></label><button id="skCsvPick">Выбрать папку…</button><p class="mute">Материалы и обрезки сохраняются отдельными CSV. Если программа была закрыта, экспорт выполнится после следующего запуска. CSV — снимок остатков; полная резервная копия базы хранит также историю.</p>',
			buttons: [{ label: 'Отмена', value: null }, { label: 'Сохранить', primary: true, run: function (m) {
				var days = Number(m.querySelector('#skCsvDays').value), dir = m.querySelector('#skCsvDir').value.trim();
				if (days && !dir) { U.toast('Выберите папку для CSV.', { bad: true }); return false; }
				return { days: days, dir: dir, last: c.last || {} };
			} }], onOpen: function (m) { m.querySelector('#skCsvDays').value = String(c.days === undefined ? 7 : c.days); m.querySelector('#skCsvPick').onclick = async function () { var dir = await U.pick({ kind: 'folder', title: 'Папка CSV-снимков склада' }); if (dir) m.querySelector('#skCsvDir').value = dir; }; } });
		if (!result) return; S().set.sthStockExport = result; await U.api.saveSettings(S().set); warned = false; await maybeExport();
	}
	async function inventory() {
		await X.pending; await K.refresh(); var b = MB.cur, source = K.path; if (!b) return;
		var rows = Object.keys(b.mats).map(function (id) { var m = b.mats[id]; return { mat: id, name: m.name, art: m.art || '', unit: m.unit, balance: MB.balance(b, id) }; }).sort(function (a, c) { return a.name.localeCompare(c.name, 'ru'); });
		var drafts = {}, page = 0, query = '';
		var entries = await U.modal({ title: 'Инвентаризация материалов', width: 860, cls: 'skDlg sthInventory',
			body: '<p>Укажите фактическое количество только для проверенных позиций. Пустое поле не меняет остаток; 0 означает, что материала нет. Резервы сохраняются.</p><input type="search" id="skInvQ" aria-label="Поиск материала" placeholder="Название или артикул"><div id="skInvRows"></div><div class="row"><button id="skInvPrev">Назад</button><span id="skInvPage" class="mute"></span><button id="skInvNext">Далее</button></div>',
			buttons: [{ label: 'Отмена', value: null }, { label: 'Просмотреть корректировку', primary: true, run: function () { var entries = Object.keys(drafts).filter(function (id) { return drafts[id].trim() !== ''; }).map(function (id) { return { mat: id, actual: drafts[id] }; }); SK.inventoryPlan(b, entries); return entries; } }],
			onOpen: function (m) {
				function render() {
					var filtered = rows.filter(function (r) { return (r.name + ' ' + r.art).toLowerCase().indexOf(query) >= 0; }), pages = Math.max(1, Math.ceil(filtered.length / 50)); page = Math.min(page, pages - 1);
					m.querySelector('#skInvRows').innerHTML = '<table class="grid" style="width:100%;table-layout:fixed"><thead><tr><th style="width:46%">Материал</th><th>По учёту</th><th>Фактически</th><th>Разница</th></tr></thead><tbody>' + filtered.slice(page * 50, page * 50 + 50).map(function (r) { return '<tr><td>' + U.esc(r.name) + '<div class="mute">' + U.esc(r.art) + '</div></td><td>' + n(r.balance) + ' ' + U.esc(r.unit) + '</td><td><input type="text" inputmode="decimal" class="skInvActual" data-mat="' + U.esc(r.mat) + '" value="' + U.esc(drafts[r.mat] || '') + '" aria-label="Фактически: ' + U.esc(r.name) + '" style="width:100%"></td><td data-delta="' + U.esc(r.mat) + '"></td></tr>'; }).join('') + '</tbody></table>';
					m.querySelector('#skInvPage').textContent = (page + 1) + ' / ' + pages + ' · позиций: ' + filtered.length;
					m.querySelector('#skInvPrev').disabled = page === 0; m.querySelector('#skInvNext').disabled = page + 1 === pages;
					m.querySelectorAll('.skInvActual').forEach(update);
				}
				function update(input) { var r = rows.filter(function (r) { return r.mat === input.dataset.mat; })[0], raw = input.value.trim(), value = Number(raw.replace(',', '.')); input.closest('tr').querySelector('[data-delta]').textContent = raw && Number.isFinite(value) && value >= 0 ? n(value - r.balance) : ''; }
				m.addEventListener('input', function (e) { if (e.target.id === 'skInvQ') { query = e.target.value.trim().toLowerCase(); page = 0; render(); } else if (e.target.matches('.skInvActual')) { drafts[e.target.dataset.mat] = e.target.value; update(e.target); } });
				m.querySelector('#skInvPrev').onclick = function () { page--; render(); }; m.querySelector('#skInvNext').onclick = function () { page++; render(); }; render();
			} });
		if (!entries || !entries.length) return;
		var plan = SK.inventoryPlan(b, entries), changed = plan.filter(function (r) { return r.delta !== 0; });
		if (!changed.length) { U.toast('Фактические остатки совпадают с учётом.'); return; }
		var ok = await U.modal({ title: 'Корректировка инвентаризации', width: 700, cls: 'skDlg', body: '<p>Будет создан документ корректировки. Резервы не изменятся.</p><table class="grid" style="width:100%"><thead><tr><th>Материал</th><th>Было</th><th>Факт</th><th>Разница</th></tr></thead><tbody>' + changed.map(function (r) { return '<tr><td>' + U.esc(b.mats[r.mat].name) + '</td><td>' + n(r.before) + '</td><td>' + n(r.actual) + '</td><td>' + n(r.delta) + '</td></tr>'; }).join('') + '</tbody></table>', buttons: [{ label: 'Отмена', value: false }, { label: 'Записать корректировку', primary: true, value: true }] });
		if (!ok) return;
		await X.edit(function (fresh) { if (K.path !== source) throw new Error('Файл базы изменился. Откройте инвентаризацию заново.'); SK.applyInventory(fresh, plan); }); U.toast('Инвентаризация записана.');
	}
	document.addEventListener('click', function (e) {
		if (e.target.closest('#skInventory')) inventory().catch(U.error);
		if (e.target.closest('#skExportSettings')) settings().catch(U.error);
		if (e.target.closest('#skExport')) (async function () { var dir = await U.pick({ kind: 'folder', title: 'Сохранить CSV остатков и обрезков' }); if (dir) await exportCsv(dir, false); })().catch(U.error);
	});
})();
