/* STHGroup — замена строки сметы материалом из базы.
   В отличие от «Сопоставить», подменяются сама позиция, артикул, цена, поставщик и фото;
   количество — как в модели или с единицей и правилами базы. Замена применяется до итогов и документов.
   Локально: we.sthReplace; галочка «для всех проектов»: b.sthReplace; возврат только здесь: we.sthNoReplace. */
(function () {
	'use strict';
	var U = window.UI, esc = U.esc, E = BM.est, MB = BM.mb, Es = window.Est, K = window.MatBase, STH = window.STH;
	if (!E || !MB || !Es || !K || !STH) return;
	var KINDS = { panel: 1, linear: 1, edge: 1, fastener: 1, profile: 1 };
	function has(o, k) { return !!(o && Object.prototype.hasOwnProperty.call(o, k)); }
	function low(s) { return String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim(); }
	function keyOf(w) { return w.kind + '|' + low(w.name0 || w.skey || w.title); }
	function rowKey(w) { return w.kind + '|' + (w.ownId || w.offKey || w.priceId); }
	function val(v) { return String(Math.round(Number(v || 0) * 10000) / 10000).replace('.', ','); }
	function base() { return MB.cur || null; }
	function info(b, m) {
		var s = MB.supplier(b, m.sup);
		return { id: m.id, price: MB.priceOf(b, m), unit: m.unit, L: m.maxL, W: m.maxW, th: m.th, k: m.k, kCut: m.kCut,
			shop: s ? s.name : '', url: m.url || (s ? s.url : ''), art: m.art, photo: m.photo || '', stock: MB.balance(b, m.id), noStock: m.noStock, offcuts: [] };
	}
	/* Количество в единице базы: лист ↔ м² по формату, затем коэффициент, округление и целые упаковки базы. */
	function qtyBase(w, m) {
		var q = Number(w.val) || 0, a = K.unitOf(w.unit), z = K.unitOf(m.unit), area = Number(m.maxL) * Number(m.maxW) / 1000000;
		if (a !== z && area > 0) {
			if (a === 'лист' && z === 'м2') q *= area;
			else if (a === 'м2' && z === 'лист') q /= area;
		}
		q = MB.roundQty(m, q);
		var pk = Number(m.pack) || 0;
		if (m.packWhole && pk > 1 && q > 0) q = Math.ceil(q / pk - 1e-9) * pk;
		return Math.round(q * 10000) / 10000;
	}
	function apply(w, m, d, b) {
		var mode = d.mode === 'base' ? 'base' : 'model', inf = info(b, m), old = w.sthReplace;
		var model = { val: old ? old.modelVal : w.val, unit: old ? old.modelUnit : w.unit };
		w.sthReplace = { key: keyOf(w), mat: m.id, mode: mode, from: w.name0 || w.title, modelVal: model.val, modelUnit: model.unit };
		w.title = m.name; w.art = m.art || ''; w.renamed = 0; w.artSet = 0;
		if (mode === 'base') {
			w.val = qtyBase(model, m); w.unit = m.unit || model.unit; w.price = MB.priceOf(b, m);
		} else { w.val = model.val; w.unit = model.unit; w.price = K.priceIn(inf, model.unit); }
		w.punit = 'руб./' + (w.unit || '');
		w.priceOut = Math.round(w.price * (1 + w.mk / 100) * 100) / 100;
		w.sum = (w.off || w.info) ? 0 : Math.round(w.val * w.price * (1 + w.mk / 100));
		w.sup = { shop: inf.shop, url: inf.url, img: inf.photo, tex: inf.photo ? 0 : (w.sup && w.sup.tex), how: 'база материалов' };
		w.mb = { id: m.id, stock: inf.stock, unit: m.unit, price: true };
	}
	/* Внутри расчёта: название и деньги меняются до разделов, итогов, КП, счёта и заказа. */
	E.sthReplace = function (c) {
		var b = base(); if (!b) return;
		var we = c.we || {}, local = we.sthReplace || {}, global = b.sthReplace || {}, no = we.sthNoReplace || {};
		c.rows.forEach(function (w) {
			if (!KINDS[w.kind] || w.own || w.card) return;
			var key = keyOf(w), d = has(local, key) ? local[key] : (!no[key] && has(global, key) ? global[key] : null);
			var m = d && b.mats[d.mat]; if (m) apply(w, m, d, b);
		});
	};
	/* Упаковка и списание видят именно заменяющий материал, а не исходное сопоставление. */
	var row0 = K.rowInfo;
	K.rowInfo = function (w) {
		var b = base(), m = w && w.sthReplace && b && b.mats[w.sthReplace.mat];
		return m ? info(b, m) : row0.call(K, w);
	};
	/* «Считать» у замены: единицу меняет только окно замены, а «не считать» остаётся доступным. */
	var unit0 = E.unitChoice, setUnit0 = E.setUnit;
	E.unitChoice = function (R, w) {
		if (w.sthReplace) return { options: [['on', E.shortUnit(w.unit) || 'да'], ['off', 'не считать']], value: w.off ? 'off' : 'on' };
		return unit0.call(E, R, w);
	};
	E.setUnit = function (R, w, v, pl, we) {
		if (!w.sthReplace) return setUnit0.call(E, R, w, v, pl, we);
		if (v === 'off') pl.OFF[w.offKey] = 1; else if (has(pl.OFF, w.offKey)) delete pl.OFF[w.offKey];
	};

	/* ------------------------------ выбор и окно ------------------------------ */
	var PEND = {};
	function current(key) { var hit = null; (Es.R ? Es.R.rows : []).forEach(function (w) { if (!hit && KINDS[w.kind] && keyOf(w) === key) hit = w; }); return hit; }
	async function pick(w) {
		await K.refresh(); var b = base();
		if (!b) { U.toast('Базы материалов нет: нажмите «База» слева и выберите папку.'); return; }
		var name = w.name0 || w.skey || w.title, key = 'r' + Date.now();
		PEND[key] = { key: keyOf(w), row: w };
		var cur = w.sthReplace && b.mats[w.sthReplace.mat] ? b.mats[w.sthReplace.mat] : (STH.linkOf ? STH.linkOf(w) : null);
		var url = 'matbase.html?t=' + encodeURIComponent(new URLSearchParams(location.search).get('t') || '') + (K.path ? '&file=' + encodeURIComponent(K.path) : '') +
			'&pick=' + key + '&name=' + encodeURIComponent(name || '') + '&q=' + encodeURIComponent(name || '') + (w.art0 ? '&art=' + encodeURIComponent(w.art0) : '') + (cur ? '&cur=' + encodeURIComponent(cur.id) : '');
		var win = null;
		if (!document.body.classList.contains('tablet')) { try { win = window.open(url, 'sthreplace', 'width=1400,height=900'); } catch (e) { win = null; } }
		if (win) { try { win.focus(); } catch (e2) { } } else K.overlay(url);
	}
	async function ask(w, m) {
		var b = base(), key = keyOf(w), old = w.sthReplace;
		var model = { val: old ? old.modelVal : w.val, unit: old ? old.modelUnit : w.unit };
		var q = qtyBase(model, m), inf = info(b, m), modelPrice = K.priceIn(inf, model.unit);
		var mode = old ? old.mode : ((Number(inf.price) > 0 && !(modelPrice > 0)) ? 'base' : 'model');
		var incompatible = K.unitOf(model.unit) !== K.unitOf(m.unit) && !((K.unitOf(model.unit) === 'лист' && K.unitOf(m.unit) === 'м2') || (K.unitOf(model.unit) === 'м2' && K.unitOf(m.unit) === 'лист'));
		var warn = incompatible ? '<p class="warn">Единицы модели и базы разные. «Как в базе» оставит число модели, но заменит единицу на «' + esc(m.unit) + '» — проверьте количество.</p>' : '';
		if (!incompatible && Number(inf.price) > 0 && !(modelPrice > 0)) warn = '<p class="warn">Для количества модели цену пересчитать нельзя. Выберите «Как в базе».</p>';
		var res = await U.modal({ title: 'Заменить строку из базы', width: 650, cls: 'sthReplace',
			body: '<table class="grid" style="width:100%"><tbody><tr><td class="mute">В модели</td><td>' + esc(w.name0 || w.title) + '</td><td class="r">' + val(model.val) + ' ' + esc(E.shortUnit(model.unit)) + '</td></tr>' +
				'<tr><td class="mute">Из базы</td><td><b>' + esc(m.name) + '</b>' + (m.art ? ' · ' + esc(m.art) : '') + '</td><td class="r">' + val(inf.price) + ' р./' + esc(m.unit) + '</td></tr></tbody></table>' +
				'<fieldset style="margin-top:12px"><legend>Количество и единица</legend>' +
				'<label class="rd"><input type="radio" name="srMode" value="model"' + (mode === 'model' ? ' checked' : '') + '> Как в модели — ' + val(model.val) + ' ' + esc(E.shortUnit(model.unit)) + '</label>' +
				'<label class="rd"><input type="radio" name="srMode" value="base"' + (mode === 'base' ? ' checked' : '') + '> Как в базе — ' + val(q) + ' ' + esc(m.unit) + ' (с округлением и упаковкой базы)</label></fieldset>' + warn +
				'<label class="ck" style="margin-top:12px"><input type="checkbox" id="srAll"' + (has(b.sthReplace, key) ? ' checked' : '') + '> Запомнить для всех проектов</label>',
			buttons: [{ label: 'Отмена', value: null }, { label: 'Заменить', primary: true, run: function (el) { return { mode: el.querySelector('[name=srMode]:checked').value, all: el.querySelector('#srAll').checked }; } }] });
		return res;
	}
	var picked0 = STH.picked;
	STH.picked = async function (key, res) {
		if (!has(PEND, key)) return picked0.call(STH, key, res);
		var p = PEND[key]; delete PEND[key];
		var o = document.getElementById('mbOverlay'); if (o && !o.hidden) K.closeOverlay();
		if (!res) return;
		K.mtime = 0; await K.refresh(); var b = base(), m = b && b.mats[res.id]; if (!m) { U.toast('Материал не найден в базе'); return; }
		var w = current(p.key) || p.row, ans = await ask(w, m); if (!ans) return;
		var we = Es.we(), k = p.key, hadGlobal = has(b.sthReplace, k);
		window.App.pushUndo && window.App.pushUndo();
		(we.sthReplace = we.sthReplace || {})[k] = { mat: m.id, mode: ans.mode };
		if (we.sthNoReplace) delete we.sthNoReplace[k];
		if (ans.all) (b.sthReplace = b.sthReplace || {})[k] = { mat: m.id, mode: ans.mode };
		else if (hadGlobal) delete b.sthReplace[k];
		if (ans.all || hadGlobal) await K.saveBase();
		window.App.save(); Es.render();
		try { window.focus(); } catch (e) { }
		U.toast('Строка заменена: «' + m.name + '». Название, артикул, цена, поставщик и фото — из базы.' + (ans.all ? ' Запомнено для всех проектов.' : ''));
	};
	async function undo(w) {
		var b = base(), we = Es.we(), key = w.sthReplace.key, inBase = has(b && b.sthReplace, key);
		var res = await U.modal({ title: 'Вернуть строку модели', width: 520,
			body: '<p>Вернуть «' + esc(w.sthReplace.from || w.name0) + '» вместо «' + esc(w.title) + '»?</p>' + (inBase ? '<label class="ck"><input type="checkbox" id="srBase"> и убрать замену из базы (в других проектах тоже)</label>' : ''),
			buttons: [{ label: 'Отмена', value: null }, { label: 'Вернуть', primary: true, run: function (el) { var c = el.querySelector('#srBase'); return { base: !!(c && c.checked) }; } }] });
		if (!res) return;
		window.App.pushUndo && window.App.pushUndo();
		if (we.sthReplace) delete we.sthReplace[key];
		if (inBase && res.base) { delete b.sthReplace[key]; if (we.sthNoReplace) delete we.sthNoReplace[key]; await K.saveBase(); }
		else if (inBase) (we.sthNoReplace = we.sthNoReplace || {})[key] = 1;
		else if (we.sthNoReplace) delete we.sthNoReplace[key];
		window.App.save(); Es.render(); U.toast('Строка из модели возвращена.');
	}

	/* Смета вызывает комплекты до итогов и документов: заменяем строки непосредственно перед ними. */
	var kits0 = E.sthKits;
	E.sthKits = function (c) {
		try { E.sthReplace(c); }
		catch (e) { if (typeof console !== 'undefined') console.warn(e); }
		return kits0 ? kits0.apply(this, arguments) : undefined;
	};

	/* ------------------------------ таблица сметы ----------------------------- */
	var btn0 = STH.mbBtn;
	STH.mbBtn = function (w, i) {
		var h = btn0 ? btn0.call(STH, w, i) : '';
		if (!MB.cur || w.own || w.card || !KINDS[w.kind]) return h;
		if (w.sthReplace) return '<button class="mbLink on" data-sru="' + i + '" title="В модели: ' + esc(w.sthReplace.from || w.name0) + '. Щёлкните, чтобы вернуть строку модели">заменено ↶</button>' +
			'<button class="mbLink" data-srr="' + i + '" title="Выбрать другой материал или изменить количество">изменить</button>';
		return h + '<button class="mbLink" data-srr="' + i + '" title="Подменить позицию материалом из базы: название, артикул, цена, поставщик и фото">Заменить…</button>';
	};
	var render0 = Es.render;
	Es.render = function () {
		var x = render0.apply(this, arguments);
		try {
			var body = document.getElementById('eBody'), R = Es.R; if (!body || !R || body.classList.contains('paper')) return x;
			R.rows.forEach(function (w) {
				if (!w.sthReplace) return;
				var tr = body.querySelector('tr[data-k="' + CSS.escape(rowKey(w)) + '"]'); if (!tr) return;
				tr.classList.add('sthReplaced');
				tr.querySelectorAll('textarea.nv, textarea.av, input.pv, input.qv').forEach(function (el) { el.readOnly = true; el.title = 'Значение из базы. Нажмите «изменить» у пометки «заменено» или верните строку модели.'; });
				tr.querySelectorAll('select.uv').forEach(function (el) { el.title = 'Единица выбрана в окне замены; здесь можно только исключить строку из расчёта'; });
			});
		} catch (e) { console.warn(e); }
		return x;
	};
	document.addEventListener('click', function (e) {
		var b = e.target.closest && e.target.closest('button[data-srr], button[data-sru]'); if (!b || !Es.R) return;
		var w = Es.R.rows[Number(b.dataset.srr !== undefined ? b.dataset.srr : b.dataset.sru)]; if (!w) return;
		e.preventDefault(); e.stopPropagation();
		if (b.dataset.sru !== undefined && w.sthReplace) undo(w).catch(U.error); else pick(w).catch(U.error);
	}, true);
})();
