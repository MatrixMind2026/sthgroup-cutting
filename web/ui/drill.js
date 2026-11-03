/* STHGroup — раздел «Присадка»: карты ручной присадки на экране.
   Слева детали по материалам, в центре листы карты выбранной детали — те же, что уйдут в PDF,
   справа базовый угол, примечание к детали и таблица отверстий. Оформление карты задаётся в
   «Настройки → Присадка». Пункт «ЧПУ» виден, но пока не работает — он в разработке. */
(function () {
	'use strict';
	var U = window.UI, P = BM.project, Dr = BM.drill, O = BM.out, $ = U.$, esc = U.esc;
	var Dl = window.Drill = {};
	var cache = { types: null, stamp: '', list: null };

	Dl.cards = function () {
		var S = window.App.S, st = S.st;
		if (!st) return [];
		/* список меняется вместе с деталями, количеством и областью */
		var stamp = JSON.stringify([st.work.sets, st.work.scope, st.work.parts]);
		if (cache.types !== st.types || cache.stamp !== stamp) { cache.types = st.types; cache.stamp = stamp; cache.list = Dr.cards(st); }
		return cache.list;
	};
	Dl.current = function () {
		var S = window.App.S, list = Dl.cards(), i;
		for (i = 0; i < list.length; i++) if (list[i].key === S.drillKey) return list[i];
		for (i = 0; i < list.length; i++) if (list[i].n) { S.drillKey = list[i].key; return list[i]; }
		return null;
	};

	Dl.render = function () {
		var A = window.App, S = A.S, st = S.st;
		if (!st || S.section !== 'drill') return;
		var list = Dl.cards(), cur = Dl.current(), h = '', withHoles = 0, holes = 0, conf = Dr.conf(st.set), shown = 0;
		list.forEach(function (c) { if (c.n) { withHoles++; holes += c.n; } });
		Dl.groups().forEach(function (g) {
			if (g.group) h += '<div class="dGrp" title="' + esc(g.group) + '">' + esc(g.group) + '</div>';
			g.cards.forEach(function (c) { shown++; h += item(c); });
		});
		function item(c) {
			return '<div class="dIt' + (cur && c.key === cur.key ? ' on' : '') + (c.n ? '' : ' none') + '" data-k="' + esc(c.key) + '" title="' + esc(Dr.title(c)) + '"><div><b>' + esc(P.main(c.t) || c.t.name) + '</b><span>' + esc(c.t.name) + (c.varN > 1 ? ' · присадка ' + c.varI + ' из ' + c.varN : '') + '</span></div>' +
				 '<i>' + (c.n ? c.n + ' отв.' : 'нет') + (c.count > 1 ? '<br>' + c.count + ' шт.' : '') + '</i></div>';
		}
		$('dSort').innerHTML = Look.sortHtml(st);
		$('dList').innerHTML = h || '<div class="mute" style="padding:8px 2px">' + (list.length ? 'Таких деталей нет — выберите «Все».' : 'В проекте нет листовых деталей.') + '</div>';
		$('dCount').textContent = withHoles ? 'Деталей с присадкой: ' + withHoles + ' · отверстий: ' + holes + (shown < list.length ? ' · показано ' + shown + ' из ' + list.length : '') : '';
		$('dLook').innerHTML = Look.barHtml(st, 'drill');
		var on = $('dList').querySelector('.dIt.on');
		if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest' });

		var wrap = $('dPages'), right = $('dInfo');
		if (!cur) {
			$('dTitle').textContent = 'Присадка';
			$('dChips').innerHTML = '';
			wrap.innerHTML = '<div class="dEmpty">' + (list.length ? 'В этом проекте у деталей нет отверстий.<br>Присадка берётся из крепежа модели БАЗИСа: поставьте крепёж в модели и выгрузите проект заново.' : 'Откройте проект, выгруженный из БАЗИСа.') + '</div>';
			right.innerHTML = '';
			return;
		}
		var pages = Dr.cardPages(st, cur, O.DRILL_BOX, { inter: 1, uid: 's' });
		var pxw = Math.max(520, Math.min(1500, wrap.clientWidth - 44)) * (S.drillZoom || 1), bad = 0, det = 0, un = 0, cut = 0;
		wrap.innerHTML = pages.map(function (pg, i) {
			bad += Dr.check(pg).length; det += pg.details || 0; un += pg.unresolved || 0; if (pg.noteCut) cut = 1;
			var what = conf.mode === 'G' ? (pg.kind === 'table' ? ' — таблица и пояснения' : ' — чертёж') : '';
			return '<div class="dPage" data-p="' + i + '" title="' + (pages.length > 1 ? 'лист ' + (i + 1) + ' из ' + pages.length + what : '') + '">' + O.drillSheet(st, cur, pg, i, pages.length, pxw) + '</div>';
		}).join('');
		$('dTitle').textContent = Dr.title(cur);
		var bc = Dr.baseOf(st, cur), BN = ['левый нижний', 'правый нижний', 'правый верхний', 'левый верхний'];
		$('dChips').innerHTML = '<span class="chip">' + cur.n + ' ' + A.plural(cur.n, 'отверстие', 'отверстия', 'отверстий') + '</span><span class="chip">' + cur.count + ' шт.</span>' +

			(det ? '<span class="chip" title="Тесные места вынесены отдельными увеличенными видами">выносов: ' + det + '</span>' : '') +
			(un ? '<span class="chip warn" title="Эти размеры не поместились и на выносном виде">не поместилось размеров: ' + un + '</span>' : '') +
			(cut ? '<span class="chip warn" title="Пояснения под чертежом ограничены ' + Dr.NOTE_LINES + ' строками, чтобы не теснить чертёж. Целиком они входят в оформлении «Два листа» — на втором листе.">пояснения обрезаны</span>' : '') +
			(bad ? '<span class="chip warn">наложений: ' + bad + '</span>' : '') + Look.frontChip(st, cur) + Look.grvChip(st, cur);
		/* справа: сведения, база, примечание, таблица */
		var info = Dr.info(st, cur), t = cur.t, rows = '';
		info.rows.forEach(function (r) {
			if (r.head) rows += '<tr class="hd"><td colspan="6">' + esc(r.head) + (r.edge ? ' — X вдоль торца, Y от лицевой' : '') + '</td></tr>';
			else rows += '<tr><td class="n">' + esc(r.n) + '</td><td>' + esc(r.x) + '</td><td>' + esc(r.y) + '</td><td>' + esc(r.d) + '</td><td>' + esc(r.dep) + '</td><td class="f" title="' + esc(r.fast) + '">' + esc(r.fast) + '</td></tr>';
		});
		var hadFocus = document.activeElement && document.activeElement.id === 'dNote';
		right.innerHTML = '<h3>' + esc(Dr.title(cur)) + '</h3><div class="info">' + esc(O.drillPartLine(cur)) + (t.path && t.path.length ? ' · ' + esc(t.path.join(' / ')) : '') + '<br>Кромка: ' + esc(info.edge) + '</div>' +
			(cur.varN > 1 ? '<div class="note warn">У деталей с этим названием и позицией присадка разная: вариантов ' + cur.varN + '. Каждому — своя карта.</div>' : '') +
			'<div class="dBase"><span>Базовый угол</span><div class="bsel">' + [3, 2, 0, 1].map(function (c) { return '<button data-c="' + c + '" class="' + (c === bc ? 'on' : '') + '" title="' + BN[c] + '"></button>'; }).join('') + '</div><span class="mute">' + BN[bc] + ' — угол ① (на стороне А).<br>Можно щёлкнуть по углу детали на чертеже.</span></div>' +
			'<label class="dNoteL" for="dNote">Примечание к детали <span class="mute">— печатается на её карте</span></label><textarea id="dNote" rows="2" maxlength="600" placeholder="Например: сверлить после кромления; лицевая сторона — А">' + esc(Dr.noteOf(st, cur)) + '</textarea>' +
			'<table class="dTab"><thead><tr><th>№</th><th>X</th><th>Y</th><th>Ø</th><th>Глуб.</th><th>Крепёж</th></tr></thead><tbody>' + rows + '</tbody></table>' +
			'<div class="mute dDr">Свёрла: ' + esc(info.drills) + '</div>';
		if (hadFocus) $('dNote').focus();
	};

	/* список слева — в порядке и с отбором из общей настройки (как в «Деталировке») */
	Dl.groups = function () { var st = window.App.S.st; return st ? Dr.listOrder(st, Dl.cards(), { what: 'отверстий', score: function (c) { return c.n || 0; }, cut: function (c) { return BM.detail.hasCut(st, c); } }) : []; };
	Dl.select = function (key) { var A = window.App; Dl.saveNote(); A.S.drillKey = key; Dl.render(); $('dPages').scrollTop = 0; };
	Dl.step = function (d) {
		var list = [], cur = Dl.current(), i;
		Dl.groups().forEach(function (g) { g.cards.forEach(function (c) { if (c.n) list.push(c); }); });
		i = cur ? list.indexOf(cur) : -1;
		if (!list.length) return;
		i = Math.max(0, Math.min(list.length - 1, i + d));
		Dl.select(list[i].key);
	};
	Dl.setBase = function (bc) {
		var A = window.App, S = A.S, cur = Dl.current();
		if (!cur || Dr.baseOf(S.st, cur) === bc) return;
		A.pushUndo();
		Dr.setBase(S.st, cur, bc);
		A.afterChange();
	};
	/* Примечание записывается, когда из поля вышли (или перешли к другой детали). */
	Dl.saveNote = function () {
		var A = window.App, S = A.S, el = $('dNote'), cur = S.st ? Dl.current() : null;
		if (!el || !cur) return;
		var was = Dr.noteOf(S.st, cur), now = el.value.replace(/\s+/g, ' ').replace(/^ | $/g, '');
		if (was === now) return;
		A.pushUndo();
		Dr.setNote(S.st, cur, now);
		A.afterChange();
	};

	/* Переключение разделов программы. */
	var SEC_ORDER = ['today', 'orders', 'stock', 'model', 'cut', 'detail', 'drill', 'asm', 'est', 'base', 'clients'];
	Dl.section = function (sec) {
		var A = window.App, S = A.S, was = S.section;
		if (sec !== 'today' && sec !== 'model' && sec !== 'cut' && sec !== 'est' && sec !== 'base' && sec !== 'orders' && sec !== 'clients' && sec !== 'stock') return;          // STHGroup: без «Деталировки», «Присадки», «Сборки»
		if (was === sec) return;
		if (was === 'drill') Dl.saveNote();
		var act = document.activeElement;
		if (act && act.blur && $('main').contains(act)) act.blur();          // поле, в котором печатали, записывает своё значение
		S.section = sec;
		document.body.dataset.sec = sec;
		document.querySelectorAll('#rail [data-s]').forEach(function (b) { b.classList.toggle('on', b.dataset.s === sec); });
		$('bPdf').textContent = sec === 'drill' ? 'PDF карт присадки' : (sec === 'detail' ? 'PDF деталировки' : (sec === 'asm' ? 'PDF сборки' : 'PDF'));
		$('bPdf').title = sec === 'est' ? 'Документы сметы в PDF' : '';
		$('bXlsx').title = sec === 'est' ? 'Документы сметы в Excel' : '';
		/* переход между разделами — сдвиг: к разделу ниже по списку слева направо, к разделу выше — обратно */
		var main = $('main');
		main.classList.remove('goR', 'goL');
		if (U.animOn()) { void main.offsetWidth; main.classList.add(SEC_ORDER.indexOf(sec) > SEC_ORDER.indexOf(was) ? 'goR' : 'goL'); setTimeout(function () { main.classList.remove('goR', 'goL'); }, 260); }
		if (sec === 'today') { if (window.STHWorkspace) window.STHWorkspace.render(); return; } // STHGroup 2.0: рабочий экран — без проекта
		if (sec === 'stock') { if (window.STHStock) window.STHStock.show(); return; }          // STHGroup: склад — без проекта
		if (sec === 'orders' || sec === 'clients') { if (window.STHO) window.STHO.render(); return; }          // STHGroup: заказы и клиенты — без проекта
		if (sec === 'base') { window.Base.render(); if (S.st) A.noteSection(); return; }          // «База» работает и без проекта
		if (S.st) { A.noteSection(); A.render(); } else A.placeWelcome();
	};

	Dl.init = function () {
		$('rail').addEventListener('click', function (e) {
			var b = e.target.closest('[data-s]');
			if (!b) return;
			if (b.classList.contains('soon')) { U.toast('Раздел «' + b.dataset.n + '» ещё в разработке — появится в одном из следующих обновлений.'); return; }
			if (b.dataset.s === 'base' && window.MatBase) { window.MatBase.open(); return; }          // с 2.2 — отдельное окно «База материалов»; прежняя «База» — из настроек
			Dl.section(b.dataset.s);
		});
		$('dMode').addEventListener('click', function (e) {
			var b = e.target.closest('button');
			if (b && b.classList.contains('soon')) U.toast('Присадка для станков с ЧПУ в разработке. Сейчас работает ручная: карты для разметки, кондукторов и присадочного станка.');
		});
		Look.bind('dLook', 'dSort', function () { Dl.render(); });
		$('dList').addEventListener('click', function (e) { var d = e.target.closest('.dIt'); if (d && !d.classList.contains('none')) Dl.select(d.dataset.k); });
		$('dPages').addEventListener('click', function (e) {
			var c = e.target.closest ? e.target.closest('.bc') : null; if (c) { Dl.setBase(Number(c.getAttribute('data-c'))); return; }
			var f = e.target.closest ? e.target.closest('.fe') : null; if (f) Look.setFront(Dl.current(), f.getAttribute('data-sd'));
		});
		$('dChips').addEventListener('click', function (e) { if (e.target.closest('[data-front="auto"]')) Look.setFront(Dl.current(), 'auto'); var gb = e.target.closest('[data-grv]'); if (gb) Look.setGrv(Dl.current(), gb.getAttribute('data-grv')); });
		$('dInfo').addEventListener('click', function (e) { var b = e.target.closest('.bsel button'); if (b) Dl.setBase(Number(b.dataset.c)); });
		$('dInfo').addEventListener('change', function (e) { if (e.target.id === 'dNote') Dl.saveNote(); });
		$('dZoomIn').onclick = function () { var S = window.App.S; S.drillZoom = Math.min(3, (S.drillZoom || 1) * 1.25); Dl.render(); };
		$('dZoomOut').onclick = function () { var S = window.App.S; S.drillZoom = Math.max(0.5, (S.drillZoom || 1) * 0.8); Dl.render(); };
		$('dZoomFit').onclick = function () { window.App.S.drillZoom = 1; Dl.render(); };
		document.body.dataset.sec = window.App.S.section;
		document.querySelectorAll('#rail [data-s]').forEach(function (b) { b.classList.toggle('on', b.dataset.s === window.App.S.section); });
	};

	/* ===== Общие для «Присадки» и «Деталировки»: оформление кнопками над листом и порядок деталей в списке ===== */
	var Look = window.Look = {};
	/* лицевая кромка вручную — щелчком по краю детали; хранится в проекте, отменяется Ctrl+Z */
	Look.setFront = function (card, sd) {
		var A = window.App;
		if (!card || !A.S.st) return;
		A.pushUndo();
		Dr.setFront(A.S.st, card, sd);
		A.afterChange();
	};
	/* пазы вручную (1.16): галка «Пазы» над листом — все пазы детали; щелчок по пазу в «Деталировке» — один */
	Look.setGrv = function (card, what) {
		var A = window.App;
		if (!card || !A.S.st) return;
		A.pushUndo();
		Dr.setGrv(A.S.st, card, what === 'all' || what === 'on' ? what : Number(what));
		A.afterChange();
	};
	Look.grvChip = function (st, card) {
		var n = card ? Dr.grvCount(st, card) : 0;
		if (!n) return '';
		var v = Dr.grvOf(st, card), off = v === 'all' ? n : v.length;
		var lab = off === 0 ? 'Пазы' : (off >= n ? 'Пазы отключены' : 'Пазы: отключено ' + off + ' из ' + n);
		return '<label class="chip act chk grvC" title="Пазы детали на листе «Деталировки» и в PDF. Один паз — щелчок по нему на листе «Деталировки»"><input type="checkbox" data-grv="' + (off ? 'on' : 'all') + '"' + (off < n ? ' checked' : '') + '> ' + lab + '</label>';
	};
	Look.frontChip = function (st, card) {
		var f = card ? Dr.frontOf(st, card) : '';
		if (!f) return '';
		return '<button class="chip act" data-front="auto" title="Лицевая кромка выбрана щелчком по краю детали. Нажмите, чтобы вернуть — по краю ПЕРЕД">' + (f === '-' ? 'лицевой кромки нет' : 'лицевая кромка — вручную') + ' ✕</button>';
	};
	function seg(attr, opts, val, hint) { return '<span class="mseg lk">' + opts.map(function (o) { return '<button data-' + attr + '="' + o[0] + '"' + (o[0] === val ? ' class="on"' : '') + (hint && hint[o[0]] ? ' title="' + esc(hint[o[0]]) + '"' : '') + '>' + esc(o[1]) + '</button>'; }).join('') + '</span>'; }
	/* полоса над листом: вид листа и галки — сразу на экране и в PDF, запоминаются */
	Look.barHtml = function (st, sec) {
		var c, keys, names, tg, hint;
		if (sec === 'detail') { c = BM.detail.conf(st.set); keys = ['V', 'A', 'B']; names = BM.detail.STYLES; tg = BM.detail.TOGGLES; hint = BM.detail.STYLE_HINT; }
		else { c = Dr.conf(st.set); keys = ['A', 'B', 'V', 'G']; names = Dr.MODES; tg = Dr.TOGGLES; hint = Dr.MODE_HINT; }
		return seg('st', keys.map(function (k) { return [k, names[k]]; }), sec === 'detail' ? c.style : c.mode, hint) +
			'<span class="lkT">' + tg.map(function (t) { return '<label class="lkC"><input type="checkbox" data-tg="' + t[0] + '"' + (c[t[0]] ? ' checked' : '') + '>' + esc(t[1]) + '</label>'; }).join('') + '</span>' +
			'<div class="grow"></div><button class="lkMore" data-more="' + (sec === 'detail' ? 'kDraw' : 'dDraw') + '" title="Высота цифр, общий текст, несколько карт на лист и остальное — в настройках">Ещё…</button>';
	};
	Look.sortHtml = function (st) {
		var pc = (st.set && st.set.parts) || {}, opt = function (o, v) { return Object.keys(o).map(function (k) { return '<option value="' + k + '"' + (k === v ? ' selected' : '') + '>' + esc(o[k]) + '</option>'; }).join(''); };
		return '<select data-ps="sort" title="Порядок деталей — общий для «Присадки» и «Деталировки», в PDF тот же">' + opt(Dr.SORTS, Dr.SORTS[pc.sort] ? pc.sort : 'mat') + '</select>' +
			'<select data-ps="filter" title="Какие детали показать в списке (в PDF уходят все)">' + opt(Dr.FILTERS, Dr.FILTERS[pc.filter] ? pc.filter : 'all') + '</select>';
	};
	Look.bind = function (barId, sortId, rerender) {
		$(barId).addEventListener('click', function (e) {
			var S = window.App.S, b = e.target.closest('button');
			if (!b || !S.st) return;
			if (b.dataset.more) { window.Dlg.settings(b.dataset.more); return; }
			if (!b.dataset.st || b.classList.contains('on')) return;
			if (barId === 'kLook') S.set.detail.style = b.dataset.st; else S.set.drill.mode = b.dataset.st;
			window.App.saveSettings(); rerender();
		});
		$(barId).addEventListener('change', function (e) {
			var S = window.App.S, k = e.target.dataset.tg;
			if (!k || !S.st) return;
			(barId === 'kLook' ? S.set.detail : S.set.drill)[k] = e.target.checked ? 1 : 0;
			window.App.saveSettings(); rerender();
		});
		$(sortId).addEventListener('change', function (e) {
			var S = window.App.S, k = e.target.dataset.ps;
			if (!k) return;
			S.set.parts = S.set.parts || {}; S.set.parts[k] = e.target.value;
			window.App.saveSettings(); window.App.render();
		});
	};
})();
