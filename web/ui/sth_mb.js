/* STHGroup — окно «База материалов»: групповое редактирование как в БАЗИСе и выбор материала для строки сметы.
   Групповое редактирование: та же карточка «Материал» (общие, дополнительные параметры, параметры текстуры) с пустыми полями —
   у выделенных меняется только то, что заполнено; галочки — в три положения («не менять» / да / нет); классы — «Добавлять» или «Заменить».
   Выбор (окно открыто из сметы с ?pick=…): сверху полоса «Выберите материал…», двойной щелчок или «Выбрать» — материал уходит в смету. */
(function () {
	'use strict';
	var U = window.UI, MB = BM.mb, esc = U.esc, W = window.MBW, S = W.S;
	function $(id) { return document.getElementById(id); }
	function opt(list, v) { return list.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (o[0] === v ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join(''); }
	function inp(id, label, w, extra) { return '<label class="fl" style="width:' + (w || 200) + 'px">' + label + '<input type="text" id="' + id + '" data-bk="' + id + '"' + (extra || '') + '></label>'; }
	function calc(id, label, w) { return '<label class="fl" style="width:' + (w || 240) + 'px">' + label + '<input type="text" id="' + id + '" disabled class="bkCalc"></label>'; }
	function tri(id, label) { return '<label class="ck bkTri"><input type="checkbox" id="' + id + '" data-tri="1"> ' + label + '</label>'; }

	/* ------------------------- групповое редактирование ------------------------- */
	W.bulk = async function () {
		var ids = W.ids();
		if (!ids.length) { U.toast('Выделите материалы в таблице (щелчок с Ctrl или Shift, все — Ctrl+A)'); return; }
		var b = S.b;
		var units = [['', '']].concat(b.units.map(function (u) { return [u, u]; }));
		var curs = [['*', 'не изменять'], ['', 'нет']].concat(b.currencies.map(function (c) { return [c.name, c.name]; }));
		var clsOpts = [['', '— класс —']].concat(b.classes.map(function (c) { return [c.code, c.code + ' — ' + c.name]; }));
		var gen = '<fieldset><legend>При редактировании классов</legend><label class="rd"><input type="radio" name="bkClsMode" value="add" checked> Добавлять</label><label class="rd" style="margin-left:40px"><input type="radio" name="bkClsMode" value="set"> Заменить</label></fieldset>' +
			'<div class="row"><div class="fl" style="width:300px">Классы материала<div class="chips" id="bkCls"></div><div class="row tight"><select id="bkClsAdd">' + opt(clsOpts, '') + '</select></div></div>' + inp('bkK', 'Коэффициент избытка', 200) + '</div>' +
			'<div class="row"><div class="fl" style="width:300px">Наименование ФНП<div class="chips" id="bkFnp"></div><div class="row tight"><input type="text" id="bkFnpAdd" placeholder="добавить наименование" data-own-enter><button class="icon" id="bkFnpPlus" type="button">＋</button></div></div>' + tri('bkTex', 'Текстура') + tri('bkNo', 'Нет в наличии') + '</div>' +
			'<div class="row"><label class="fl" style="width:200px">Единица измерения<select id="bkUnit" data-bk="bkUnit">' + opt(units, '') + '</select></label>' + inp('bkKs', 'Коэф-т пересчёта расчётной единицы измерения в модуле БАЗИС-Смета (кв.м, м, шт)', 300) + '</div>' +
			'<div class="row">' + inp('bkMass', 'Масса ед. изм.', 200) + calc('bkMassC', 'Масса расчётной единицы измерения') + '</div>' +
			'<div class="row">' + inp('bkPrice', 'Цена в базовой валюте', 200) + calc('bkPriceC', 'Цена в расчётной единице измерения') + '</div>' +
			'<div class="row"><label class="fl" style="width:200px">Альтернативная валюта<select id="bkCur" data-bk="bkCur">' + opt(curs, '*') + '</select></label>' + inp('bkAlt', 'Цена в альт. валюте', 240) + '</div>' +
			'<label class="fl">Примечание<textarea id="bkNote" data-bk="bkNote" rows="2"></textarea></label>' +
			'<fieldset><legend>Способ округления количества</legend><label class="rd"><input type="radio" name="bkRound" value="" checked> Не изменять</label><label class="rd"><input type="radio" name="bkRound" value="0"> Не округлять</label><label class="rd"><input type="radio" name="bkRound" value="1"> Всегда округлять в большую сторону до целого</label><label class="rd"><input type="radio" name="bkRound" value="2"> Округление в большую сторону до кратного числа</label> <input type="text" id="bkRoundTo" data-bk="bkRoundTo" style="width:70px" placeholder="1"></fieldset>';
		var add = '<fieldset><legend>Параметры листового и погонного материалов</legend><div class="row">' + inp('bkTh', 'Толщина', 110) + inp('bkL', 'Макс. длина', 110) + inp('bkW', 'Макс. ширина', 110) + inp('bkSign', 'Обозначение', 150) + '</div>' +
			'<div class="row">' + inp('bkKc', 'Коэф-т избытка с учётом раскроя', 230) + '<label class="fl" style="width:200px">Тип<select id="bkKind" data-bk="bkKind">' + opt([['', 'не изменять']].concat(MB.KINDS), '') + '</select></label>' + inp('bkOver', 'Свес', 110) + '</div></fieldset>';
		var tex = '<fieldset><legend>Параметры наложения</legend><div class="row"><label class="rd"><input type="radio" name="bkLook" value="" checked> Не изменять</label><label class="rd"><input type="radio" name="bkLook" value="color"> Цвет</label><input type="color" id="bkColor" value="#c8c8c8"><label class="rd"><input type="radio" name="bkLook" value="tex"> Текстура</label><input type="text" id="bkTexF" data-bk="bkTexF" style="width:300px" placeholder="файл картинки"><button id="bkTexPick" type="button">…</button></div>' +
			'<div class="row"><span>Смещение</span>' + inp('bkDx', 'X', 90) + inp('bkDy', 'Y', 90) + '<span>Шаг</span>' + inp('bkSx', 'X', 90) + inp('bkSy', 'Y', 90) + '</div>' +
			'<div class="row">' + inp('bkTr', 'Прозрачность', 110) + inp('bkMi', 'Зеркальность', 110) + inp('bkSh', 'Резкость блика', 120) + inp('bkBr', 'Яркость блика', 120) + inp('bkAn', 'Угол поворота', 120) + '</div></fieldset>';
		var tabs = [['gen', 'Общие параметры'], ['add', 'Дополнительные параметры'], ['tex', 'Параметры текстуры']];
		var body = '<p class="mute" style="margin:0 0 6px">Выделено материалов: <b>' + ids.length + '</b>. Меняется только заполненное; пустое поле и галочка «−» — не меняются.</p><div class="tabs">' + tabs.map(function (t, i) { return '<button type="button" data-bt="' + t[0] + '"' + (i ? '' : ' class="on"') + '>' + t[1] + '</button>'; }).join('') + '</div>' +
			'<div class="pg" data-bp="gen">' + gen + '</div><div class="pg" data-bp="add" hidden>' + add + '</div><div class="pg" data-bp="tex" hidden>' + tex + '</div>';
		var cls = [], fnp = [];
		var res = await U.modal({ title: 'Материал', width: 820, cls: 'mbCard sthBulk', body: body,
			buttons: [{ label: 'Отмена', value: null }, { label: 'OK', primary: true, run: function (m) {
				var g = function (id) { var x = m.querySelector('#' + id); return x ? String(x.value).trim() : ''; }, ch = {}, n = function (id) { return g(id) === '' ? null : MB.num(g(id)); };
				[['bkK', 'k'], ['bkKs', 'kSmeta'], ['bkMass', 'mass'], ['bkPrice', 'price'], ['bkAlt', 'altPrice'], ['bkTh', 'th'], ['bkL', 'maxL'], ['bkW', 'maxW'], ['bkKc', 'kCut'], ['bkOver', 'overhang']].forEach(function (p) { var v = n(p[0]); if (v !== null) ch[p[1]] = v; });
				if (g('bkUnit')) ch.unit = g('bkUnit');
				if (g('bkSign')) ch.sign = g('bkSign');
				if (g('bkKind')) ch.kind = g('bkKind');
				if (g('bkCur') !== '*') ch.altCur = g('bkCur');
				if (g('bkNote')) ch.note = m.querySelector('#bkNote').value;
				['bkTex', 'bkNo'].forEach(function (id) { var x = m.querySelector('#' + id); if (!x.indeterminate) ch[id === 'bkTex' ? 'tex' : 'noStock'] = x.checked ? 1 : 0; });
				var rd = m.querySelector('[name=bkRound]:checked').value; if (rd !== '') { ch.round = Number(rd); if (g('bkRoundTo')) ch.roundTo = MB.num(g('bkRoundTo'), 1); }
				var lk = {}, lm = m.querySelector('[name=bkLook]:checked').value;
				if (lm) { lk.mode = lm; if (lm === 'color') lk.color = m.querySelector('#bkColor').value; if (lm === 'tex' && g('bkTexF')) lk.tex = g('bkTexF'); }
				[['bkDx', 'dx'], ['bkDy', 'dy'], ['bkSx', 'sx'], ['bkSy', 'sy'], ['bkTr', 'transp'], ['bkMi', 'mirror'], ['bkSh', 'sharp'], ['bkBr', 'bright'], ['bkAn', 'angle']].forEach(function (p) { var v = n(p[0]); if (v !== null) lk[p[1]] = v; });
				var clsMode = m.querySelector('[name=bkClsMode]:checked').value;
				if (!Object.keys(ch).length && !Object.keys(lk).length && !cls.length && !fnp.length && clsMode !== 'set') { U.toast('Ничего не заполнено — менять нечего.'); return false; }
				return { ch: ch, lk: lk, cls: cls.slice(), clsMode: clsMode, fnp: fnp.slice() };
			} }],
			onOpen: function (m) {
				m.addEventListener('click', function (e) {
					var t = e.target.closest('[data-bt]');
					if (t) { m.querySelectorAll('[data-bt]').forEach(function (x) { x.classList.toggle('on', x === t); }); m.querySelectorAll('[data-bp]').forEach(function (p) { p.hidden = p.dataset.bp !== t.dataset.bt; }); return; }
					var x = e.target.closest('[data-rmc]'); if (x) { cls.splice(Number(x.dataset.rmc), 1); chips(); return; }
					var y = e.target.closest('[data-rmf]'); if (y) { fnp.splice(Number(y.dataset.rmf), 1); chips(); }
				});
				function chips() {
					m.querySelector('#bkCls').innerHTML = cls.map(function (c, i) { return '<span class="chip">' + esc(c + ' — ' + MB.className(b, c)) + ' <button type="button" class="icon" data-rmc="' + i + '">✕</button></span>'; }).join('') || '<span class="mute">-</span>';
					m.querySelector('#bkFnp').innerHTML = fnp.map(function (c, i) { return '<span class="chip">' + esc(c) + ' <button type="button" class="icon" data-rmf="' + i + '">✕</button></span>'; }).join('') || '<span class="mute">-</span>';
				}
				chips();
				m.querySelector('#bkClsAdd').onchange = function () { var v = this.value; if (v && cls.indexOf(v) < 0) cls.push(v); this.value = ''; chips(); };
				var addF = function () { var x = m.querySelector('#bkFnpAdd'), v = x.value.trim(); if (v && fnp.indexOf(v) < 0) fnp.push(v); x.value = ''; chips(); };
				m.querySelector('#bkFnpPlus').onclick = addF; m.querySelector('#bkFnpAdd').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); addF(); } });
				/* галочки в три положения: «−» не менять → да → нет → «−» */
				m.querySelectorAll('[data-tri]').forEach(function (c) { c.indeterminate = true; c.dataset.st = '0'; c.addEventListener('click', function () { var st = (Number(c.dataset.st) + 1) % 3; c.dataset.st = String(st); c.indeterminate = st === 0; c.checked = st === 1; }); });
				var pick = m.querySelector('#bkTexPick'); if (pick) pick.onclick = async function () { var p = await U.pick({ kind: 'open', title: 'Картинка текстуры', filters: [{ name: 'Картинки', ext: ['jpg', 'jpeg', 'png', 'bmp'] }] }); if (p) m.querySelector('#bkTexF').value = p; };
				/* расчётные поля (жёлтые) — как в БАЗИСе: видны, не правятся */
				var re = function () { var ks = MB.num(m.querySelector('#bkKs').value || '0'); m.querySelector('#bkMassC').value = ks && m.querySelector('#bkMass').value ? String(Math.round(MB.num(m.querySelector('#bkMass').value) / ks * 1e4) / 1e4).replace('.', ',') : ''; m.querySelector('#bkPriceC').value = ks && m.querySelector('#bkPrice').value ? String(Math.round(MB.num(m.querySelector('#bkPrice').value) / ks * 100) / 100).replace('.', ',') : ''; };
				['bkKs', 'bkMass', 'bkPrice'].forEach(function (id) { m.querySelector('#' + id).addEventListener('input', re); });
			} });
		if (!res) return;
		var n = 0;
		ids.forEach(function (id) {
			var mt = S.b.mats[id]; if (!mt) return;
			Object.keys(res.ch).forEach(function (k) { mt[k] = res.ch[k]; });
			Object.keys(res.lk).forEach(function (k) { mt.look[k] = res.lk[k]; });
			if (res.clsMode === 'set') mt.cls = res.cls.slice();
			else res.cls.forEach(function (c) { if (mt.cls.indexOf(c) < 0) mt.cls.push(c); });
			res.fnp.forEach(function (f) { if (mt.fnp.indexOf(f) < 0) mt.fnp.push(f); });
			n++;
		});
		U.toast('Изменено материалов: ' + n);
		if (n) W.changed();
	};

	/* ------------------------------ Ctrl+A ----------------------------------- */
	W.selectAll = function () {
		if (!S.list.length) return;
		S.sel = S.list.map(function (m) { return m.id; });
		if (!S.cur || S.sel.indexOf(S.cur) < 0) S.cur = S.sel[0];
		W.render();
	};
	document.addEventListener('keydown', function (e) {
		if (!(e.ctrlKey || e.metaKey) || (e.key.toLowerCase() !== 'a' && e.key.toLowerCase() !== 'ф')) return;
		if (document.querySelector('.back:not(.out)') || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
		e.preventDefault(); W.selectAll();
	});

	/* --------------------- выбор материала для строки сметы -------------------- */
	var qs = new URLSearchParams(location.search), PICK = qs.get('pick');
	if (!PICK) return;
	var who = function () { try { return window.opener && window.opener.STH ? window.opener.STH : (window.parent !== window && window.parent.STH ? window.parent.STH : null); } catch (e) { return null; } };
	async function done(v) { try { await W.save(); } catch (e) { } var s = who(); if (s && s.picked) s.picked(PICK, v); setTimeout(function () { try { window.close(); } catch (e) { } }, 50); }
	function choose() { if (!S.cur || !S.b.mats[S.cur]) { U.toast('Выберите материал в таблице'); return; } done({ id: S.cur }); }
	document.title = 'Выбор материала для сметы — STHGroup';
	var bar = document.createElement('div');
	bar.id = 'sthPickBar';
	bar.innerHTML = '<span>Выберите материал из базы для строки сметы: <b>' + esc(qs.get('name') || '') + '</b>' + (qs.get('art') ? ' · артикул ' + esc(qs.get('art')) : '') + '. Двойной щелчок по строке — выбрать.</span><span class="grow"></span>' +
		(qs.get('linked') ? '<button id="spUnlink">Отвязать</button>' : '') + '<button id="spCancel">Отмена</button><button id="spOk" class="primary">Выбрать</button>';
	document.body.insertBefore(bar, document.body.firstChild);
	$('spOk').onclick = choose; $('spCancel').onclick = function () { done(null); };
	if ($('spUnlink')) $('spUnlink').onclick = function () { done({ unlink: 1 }); };
	/* двойной щелчок по строке — выбор (а не карточка) */
	document.addEventListener('dblclick', function (e) { var r = e.target.closest && e.target.closest('.tr'); if (r && r.dataset.m && !document.querySelector('.back:not(.out)')) { e.stopPropagation(); e.preventDefault(); S.cur = r.dataset.m; choose(); } }, true);
	document.addEventListener('keydown', function (e) { if (e.key === 'Enter' && S.cur && !document.querySelector('.back:not(.out)') && !/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) { e.stopPropagation(); e.preventDefault(); choose(); } }, true);
	/* когда база загрузится — открыть группу найденного материала или поиск по названию */
	var tries = 0, t = setInterval(function () {
		if (!S.b || !S.b.mats) { if (++tries > 100) clearInterval(t); return; }
		clearInterval(t);
		var cur = qs.get('cur');
		if (cur && S.b.mats[cur]) { W.show(cur); return; }
		var q = qs.get('q') || '', box = $('mbQ');
		/* ищем по названию целиком, потом по началу до запятой, потом по первым словам; не нашлось — вся база, выбор в дереве групп */
		var tryQ = [q, q.split(',')[0], q.split(/\s+/).slice(0, 2).join(' '), q.split(/\s+/)[0]].map(function (x) { return x.trim(); }).filter(function (x, i, a) { return x.length > 1 && a.indexOf(x) === i; });
		for (var i = 0; i < tryQ.length; i++) { S.q = tryQ[i]; S.group = ''; W.render(); if (S.list.length) { if (box) box.value = S.q; return; } }
		S.q = ''; if (box) box.value = ''; W.render(); if (q) U.toast('По названию «' + q + '» ничего не нашлось — выберите в дереве групп.');
	}, 100);
})();
