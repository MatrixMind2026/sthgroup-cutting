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

/* STHGroup: «Нет в базе». После открытия проекта — материалы и комплектующие модели, которых нет в базе материалов
   (плиты, кромка, погонные, фурнитура, профили). Смета для них берёт данные модели; здесь их можно записать в базу:
   галочки, название и артикул правятся, группа — своя для каждого вида (или новая «Из моделей: …»).
   Окно показывается один раз на набор недостающего; снова — кнопкой «Нет в базе: N» над сметой. */
(function () {
	'use strict';
	var U = window.UI, esc = U.esc, MB = BM.mb;
	var KINDS = {
		panel: { t: 'sheet', what: 'Плита', unit: 'лист', mk: 'sheet', grp: 'Из моделей: листовые' },
		linear: { t: 'sheet', what: 'Погонный', unit: 'шт', mk: 'lin', grp: 'Из моделей: листовые' },
		edge: { t: 'edge', what: 'Кромка', unit: 'м', grp: 'Из моделей: кромка' },
		fastener: { t: 'fit', what: 'Фурнитура', unit: 'шт', grp: 'Из моделей: фурнитура' },
		profile: { t: 'other', what: 'Профиль', unit: 'шт', grp: 'Из моделей: прочее' }
	};
	function S() { return window.App.S; }
	function bmkUnit(u) { var k = window.MatBase.unitOf(u); return k === 'м' ? 'м' : k === 'м2' ? 'кв.м' : /^компл/.test(k) ? 'компл' : k === 'лист' ? 'лист' : 'шт'; }
	/* что в смете есть, а в базе нет */
	function missing() {
		var s = S(), K = window.MatBase, E = window.Est;
		if (!s.st || !MB.cur || !E) return [];
		var R;
		try { R = BM.est.build(s.st, E.cfg(), E.pl(), E.we(), s.prices ? s.prices.sup : {}); } catch (e) { console.warn(e); return []; }
		var seen = {}, out = [];
		R.rows.forEach(function (w) {
			var k = KINDS[w.kind];
			if (!k || w.own || K.rowInfo(w)) return;
			var name = w.kind === 'panel' ? w.skey : (w.skey || w.title), key = w.kind + '|' + String(name).toLowerCase();
			if (!name || seen[key]) return; seen[key] = 1;
			var it = { kind: w.kind, name: name, art: w.art || w.art0 || '', unit: k.unit === 'шт' ? bmkUnit(w.unit) : k.unit, th: 0, L: 0, W: 0, tex: 0, plen: w.plen || 0 };
			if (w.kind === 'panel') {
				var th0 = /\|\s*([\d.]+)\s*$/.exec(w.priceId || ''), m = s.st.mats.filter(function (x) { return x.key === w.akey; })[0] || s.st.mats.filter(function (x) { return x.name === w.skey && (!th0 || String(x.th) === th0[1]); })[0];
				if (m) { it.th = m.th || 0; var f = m.cfg && m.cfg.fmts && m.cfg.fmts[m.cfg.fmt || 0]; if (f) { it.L = f[0]; it.W = f[1]; } it.tex = m.cfg && m.cfg.grain ? 1 : 0; if (it.art === 'нет') it.art = ''; }
			}
			if (w.kind === 'linear' && it.plen) it.L = it.plen;
			out.push(it);
		});
		return out;
	}
	function sigOf(list) { return list.map(function (x) { return x.kind + ':' + x.name; }).sort().join('\n'); }
	function groupOpts(b, t, cur) {
		var gs = b.groups.filter(function (g) { return g.type === t; }).map(function (g) { return [g.id, MB.path(b, g.id).join(' / ')]; }).sort(function (a, c) { return a[1].localeCompare(c[1], 'ru'); });
		return gs.map(function (g) { return '<option value="' + g[0] + '"' + (g[0] === cur ? ' selected' : '') + '>' + esc(g[1]) + '</option>'; }).join('') + '<option value="">＋ новая «' + esc(KINDS0[t]) + '»</option>';
	}
	var KINDS0 = { sheet: 'Из моделей: листовые', edge: 'Из моделей: кромка', fit: 'Из моделей: фурнитура', other: 'Из моделей: прочее' };
	function defGroup(b, t) {
		var hit = b.groups.filter(function (g) { return g.type === t && g.name === KINDS0[t]; })[0];
		return hit ? hit.id : '';
	}
	var count = 0;
	async function show(force) {
		var s = S(), K = window.MatBase, A = window.App;
		if (!s.st) return;
		await K.refresh();
		if (!MB.cur) { if (force) U.toast('Базы материалов нет: нажмите «База» слева и выберите папку для неё.'); return; }
		var list = missing(); count = list.length; drawChip();
		if (!list.length) { if (force) U.toast('Всё, что есть в смете, найдено в базе материалов.'); return; }
		var sig = sigOf(list), seenMap = s.set.sthMiss || {};
		if (!force && seenMap[s.path] === sig) return;
		var b = MB.cur, grp = {};
		Object.keys(KINDS0).forEach(function (t) { grp[t] = defGroup(b, t); });
		var rows = list.map(function (x, i) {
			var k = KINDS[x.kind], size = x.kind === 'panel' ? [x.th ? x.th + ' мм' : '', x.L && x.W ? x.L + '×' + x.W : ''].filter(Boolean).join(', ') : (x.L ? 'L ' + x.L : '');
			return '<tr data-i="' + i + '"><td><input type="checkbox" class="mk" checked></td><td class="mute">' + k.what + '</td>' +
				'<td><input type="text" class="nm" value="' + esc(x.name) + '" style="width:100%"></td><td><input type="text" class="ar" value="' + esc(x.art) + '" style="width:110px"></td>' +
				'<td class="mute">' + esc(x.unit) + (size ? ' · ' + esc(size) : '') + '</td>' +
				'<td><select class="gr" style="max-width:220px">' + groupOpts(b, k.t, grp[k.t]) + '</select></td></tr>';
		}).join('');
		var res = await U.modal({ title: 'Нет в базе материалов: ' + list.length, width: 1000, cls: 'sthMiss',
			body: '<p>Эти материалы и комплектующие есть в модели, но не найдены в базе. В смете они уже стоят с данными модели. Отметьте, что записать в базу, — дальше смета будет брать из базы цену, поставщика и формат листа.</p>' +
				'<div style="max-height:52vh;overflow:auto"><table class="grid" style="width:100%"><thead><tr><th><input type="checkbox" id="smAll" checked></th><th>Вид</th><th>Наименование</th><th>Артикул</th><th>Ед. и размер</th><th>Группа в базе</th></tr></thead><tbody>' + rows + '</tbody></table></div>',
			buttons: [{ label: 'Не сейчас', value: null }, { label: 'Записать в базу', primary: true, run: function (m) {
				var pick = [];
				m.querySelectorAll('tbody tr').forEach(function (tr) {
					if (!tr.querySelector('.mk').checked) return;
					var x = list[Number(tr.dataset.i)];
					pick.push({ x: x, name: tr.querySelector('.nm').value.trim() || x.name, art: tr.querySelector('.ar').value.trim(), group: tr.querySelector('.gr').value });
				});
				return pick;
			} }],
			onOpen: function (m) {
				var all = m.querySelector('#smAll');
				all.onchange = function () { m.querySelectorAll('.mk').forEach(function (c) { c.checked = all.checked; }); };
			} });
		seenMap[s.path] = sig; s.set.sthMiss = seenMap; A.saveSettings();
		if (!res || !res.length) return;
		await K.refresh(); b = MB.cur;
		var made = {}, n = 0, errs = [];
		res.forEach(function (p) {
			var k = KINDS[p.x.kind], gid = p.group;
			if (!gid || !MB.group(b, gid)) {
				if (!made[k.t]) { var ex = b.groups.filter(function (g) { return g.type === k.t && g.name === KINDS0[k.t]; })[0]; made[k.t] = ex ? ex.id : MB.addGroup(b, '', KINDS0[k.t], k.t).id; }
				gid = made[k.t];
			}
			var m = MB.defMat(gid);
			m.name = p.name; m.art = p.art; m.unit = p.x.unit; if (b.units.indexOf(m.unit) < 0) b.units.push(m.unit);
			if (k.t === 'sheet') { m.kind = k.mk; m.th = p.x.th || 0; m.maxL = p.x.L || 0; m.maxW = p.x.W || 0; m.tex = p.x.tex || 0; }
			m.note = 'Записано из модели ' + (BM.project.modelName(S().st.model) || '') + ' ' + MB.today();
			var r = MB.saveMat(b, m);
			if (r.errors) errs.push(p.name + ': ' + r.errors.join(', ')); else n++;
		});
		await K.saveBase();
		await K.changed();
		count = missing().length; drawChip();
		if (S().section === 'est' && window.Est) window.Est.render();
		U.toast('Записано в базу материалов: ' + n + '. Цены впишите в базе («База» слева) — смета возьмёт их сама.' + (errs.length ? ' Не записано: ' + errs.slice(0, 3).join('; ') : ''), { ms: 14000, actions: [{ label: 'Открыть базу', run: function () { K.open(); } }] });
	}
	function drawChip() {
		var host = document.getElementById('eChips'); if (!host) return;
		var b = document.getElementById('sthMissChip');
		if (!count) { if (b) b.remove(); return; }
		if (!b) { b = document.createElement('button'); b.id = 'sthMissChip'; b.className = 'chip warn'; b.title = 'Материалы и комплектующие модели, которых нет в базе материалов'; b.onclick = function () { show(true); }; }
		b.textContent = 'Нет в базе: ' + count;
		if (b.parentNode !== host) host.appendChild(b);
	}
	window.STH.missing = show;
	window.STH.missingList = missing;
	/* после открытия проекта и после каждой отрисовки сметы */
	var A = window.App;
	if (A && A.openPath) {
		var open0 = A.openPath;
		A.openPath = async function () { var r = await open0.apply(this, arguments); if (r) setTimeout(function () { show(false).catch(console.warn); }, 1200); return r; };
	}
	if (window.Est && window.Est.render) {
		var r0 = window.Est.render;
		window.Est.render = function () { var x = r0.apply(this, arguments); try { drawChip(); } catch (e) { /* нет */ } return x; };
	}
})();
