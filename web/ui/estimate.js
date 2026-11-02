/* STHGroup — раздел «Смета»: слева разделы с суммами, по центру таблица «Цены и количества»
   (всё правится в ней) или смета «как на бумаге», справа итог, скидка, наценка и документы.
   Цены и правила строк лежат в прайсе (на компьютере, общие для всех проектов); количества,
   заданные вручную, скидка, заказчик и свои строки «Прочее» — в файле проекта. */
(function () {
	'use strict';
	var U = window.UI, P = BM.project, E = BM.est, O = BM.out, $ = U.$, esc = U.esc;
	var Es = window.Est = { R: null, prev: null };
	function A() { return window.App; }
	function S() { return window.App.S; }
	function num(v) { v = Number(String(v).replace(/\s| /g, '').replace(',', '.')); return isFinite(v) ? v : NaN; }
	function val(v) { return String(v).replace('.', ','); }
	function comma(s) { return String(s || '').replace(/(\d)\.(\d)/g, '$1,$2'); }
	function rowKey(w) { return w.kind + '|' + (w.ownId || w.offKey || w.priceId); }
	function byKey(R, k) { for (var i = 0; i < R.rows.length; i++) if (rowKey(R.rows[i]) === k) return R.rows[i]; return null; }

	Es.cfg = function () { var s = S(); s.set.est = E.conf(s.set); return s.set.est; };
	Es.pl = function () { return E.listFor(S().prices, S().st); };
	Es.we = function () { return S().st.work.est; };

	/* ------------------------------- прайсы на диске --------------------------- */
	function storePath() { return U.join(S().boot.dataDir, 'prices.json'); }
	Es.loadStore = async function () {
		var o = null;
		try { var stt = await U.api.stat(storePath()); if (stt.exists) o = JSON.parse(await U.api.readText(storePath())); } catch (e) { o = null; }      // файла ещё нет или он испорчен — начнём с прайса по умолчанию
		S().prices = E.fixStore(o);
	};
	var saveTimer = 0;
	Es.saveStore = function (now) {
		clearTimeout(saveTimer);
		saveTimer = setTimeout(function () { U.api.write(storePath(), JSON.stringify(S().prices)).catch(U.error); }, now ? 0 : 350);
	};

	/* ------------------------------- барабан итога ----------------------------- */
	/* Цифры итога прокручиваются от прежнего значения к новому. */
	function odo(el, from, to) {
		var a = String(Math.round(to)), b = String(Math.round(from === null || from === undefined ? to : from)), h = '', i;
		while (b.length < a.length) b = '0' + b;
		b = b.slice(-a.length);
		for (i = 0; i < a.length; i++) {
			if (i && (a.length - i) % 3 === 0) h += '<span class="s"></span>';
			h += '<span class="d"><i data-to="' + a.charAt(i) + '" style="transform:translateY(-' + (Number(b.charAt(i)) * 1.15) + 'em)"><u>0</u><u>1</u><u>2</u><u>3</u><u>4</u><u>5</u><u>6</u><u>7</u><u>8</u><u>9</u></i></span>';
		}
		el.innerHTML = h;
		el.setAttribute('aria-label', E.money(to));
		var go = function () { el.querySelectorAll('.d > i').forEach(function (x) { x.style.transform = 'translateY(-' + (Number(x.dataset.to) * 1.15) + 'em)'; }); };
		if (a === b || !U.animOn()) go(); else { void el.offsetWidth; requestAnimationFrame(go); }
	}
	Es._odo = odo;

	/* смета с данными «Базы материалов» (2.2): цена — из базы, если в прайсе своей нет; поставщик — из базы */
	Es.build = function (st, cfg, pl, we, sup) { return window.MatBase ? window.MatBase.build(st, cfg, pl, we, sup) : E.build(st, cfg, pl, we, sup); };

	/* --------------------------------- отрисовка -------------------------------- */
	Es.render = function () {
		var s = S();
		if (!s.st || s.section !== 'est' || !s.prices) return;
		sugHide(); Es.cands = null;
		var cfg = Es.cfg(), pl = Es.pl(), R = Es.R = Es.build(s.st, cfg, pl, Es.we(), s.prices.sup);
		/* новые материалы — в «Базу»; их артикул нужен для текстур, поэтому смета считается ещё раз */
		if (window.Base && window.Base.learnRows(R)) R = Es.R = Es.build(s.st, cfg, pl, Es.we(), s.prices.sup);
		if (s.estRow && !byKey(R, s.estRow)) s.estRow = '';
		/* одинаковые позиции: после правки наименования или артикула — сразу вопрос под строкой */
		Es.dups = E.dups(R, pl);
		if (Es.askKey) {
			var ak = Es.askKey, aw = null;
			Es.askKey = '';
			R.rows.forEach(function (w) { if (!aw && w.offKey && (w.offKey === ak && Es.dups[w.offKey] || (Es.dups[w.offKey] && Es.dups[w.offKey].offKey === ak))) aw = w; });
			if (aw) s.mergeAsk = rowKey(aw);
		}
		if (s.mergeAsk && !(byKey(R, s.mergeAsk) && Es.dups[byKey(R, s.mergeAsk).offKey])) s.mergeAsk = '';
		renderHead(R, cfg, pl);
		renderLeft(R, pl);
		if (cfg.paper) renderPaper(R, cfg); else renderTable(R, cfg);
		renderRight(R, cfg, pl);
	};

	function counts(R) {
		var c = { rows: 0, manual: 0, off: 0, noPrice: 0 };
		R.rows.forEach(function (w) {
			if (w.off) { c.off++; return; }
			c.rows++;
			if (w.manual) c.manual++;
			if (w.kind !== 'extra' && w.val > 0 && !(w.price > 0) && !w.info) c.noPrice++;
		});
		return c;
	}
	function renderHead(R, cfg, pl) {
		var s = S(), c = counts(R), kind = cfg.docKind;
		$('eTitle').textContent = cfg.paper ? O.estKindTitle(kind) : 'Смета · ' + c.rows + ' ' + A().plural(c.rows, 'строка', 'строки', 'строк');
		$('eView').querySelectorAll('button').forEach(function (b) { b.classList.toggle('on', Number(b.dataset.v) === (cfg.paper ? 1 : 0)); });
		var ch = '';
		if (c.manual) ch += '<span class="chip warn" title="Количества, заданные вручную: они хранятся в проекте">вручную: ' + c.manual + '</span>';
		if (c.noPrice) ch += '<span class="chip warn" title="Строки с количеством, но без цены: в смету они не попадают">без цены: ' + c.noPrice + '</span>';
		if (c.off) ch += '<span class="chip" title="Строки, у которых выбрано «не считать»">не считается: ' + c.off + '</span>';
		$('eChips').innerHTML = ch;
		$('ePl').innerHTML = s.prices.lists.map(function (x) { return '<option' + (x === pl ? ' selected' : '') + '>' + esc(x.name) + '</option>'; }).join('') + '<option value="::manage">управление прайсами…</option>';
		var bar;
		if (cfg.paper) {
			bar = '<span class="seg" id="eKind">' + O.EST_KINDS.map(function (k) { return '<button data-k="' + k[0] + '" class="' + (k[0] === kind ? 'on' : '') + '">' + k[2] + '</button>'; }).join('') + '</span><div class="grow"></div>' +
				'<label class="chk"><input type="checkbox" id="eNoPrice"' + (cfg.noPrice ? ' checked' : '') + (kind === 'mat' || kind === 'det' ? ' disabled' : '') + '> без цены</label>' +
				'<label class="chk"><input type="checkbox" id="eTotals"' + (cfg.totals ? ' checked' : '') + ((kind === 'client' || kind === 'full') ? '' : ' disabled') + '> только итоги разделов</label>';
		} else {
			bar = '<span class="mute">Считать разделы:</span><label class="chk"><input type="checkbox" data-f="showCuts"' + (cfg.showCuts ? ' checked' : '') + '> пазы</label><label class="chk"><input type="checkbox" data-f="showHoles"' + (cfg.showHoles ? ' checked' : '') + '> отверстия</label>' +
				'<label class="chk"><input type="checkbox" data-f="showFast"' + (cfg.showFast ? ' checked' : '') + '> фурнитура</label><label class="chk"><input type="checkbox" data-f="showProf"' + (cfg.showProf ? ' checked' : '') + '> профили</label><div class="grow"></div>' +
				(c.manual ? '<button id="eQClear" title="Вернуть всем строкам количество по модели">Сбросить количества</button>' : '') +
				(window.MatBase && BM.mb.cur ? '<button id="eWriteOff" title="Списать со склада «Базы материалов» листы раскроя и материалы сметы этого заказа; деловые обрезки — на склад с размерами. Повторное списание заменяет прежнее">Списать по заказу</button>' : '');
		}
		$('eBar').innerHTML = bar;
	}

	function headSums(R) {
		var o = {}, n = {};
		R.rows.forEach(function (w) {
			if (w.off) return;
			n[w.head] = (n[w.head] || 0) + 1;
			if (w.price > 0 && w.val > 0) o[w.head] = (o[w.head] || 0) + w.sum;
		});
		return { sum: o, n: n };
	}
	var HEAD_NAME = { 'ПЛИТНЫЙ МАТЕРИАЛ': 'Материал плитный', 'КРОМОЧНЫЙ МАТЕРИАЛ': 'Материал кромочный', 'ПОГОННЫЙ МАТЕРИАЛ': 'Материал погонный', 'ФАСАДЫ МДФ': 'Фасады МДФ', 'ДОПОЛНИТЕЛЬНЫЕ МАТЕРИАЛЫ': 'Доп. материалы' };
	function headName(h) { return HEAD_NAME[h] || (h.charAt(0) + h.substring(1).toLowerCase()); }
	function renderLeft(R, pl) {
		var hs = headSums(R), h = '', last = '', c = counts(R);
		E.HEAD_ORDER.forEach(function (head) {
			if (!hs.n[head]) return;
			var g = E.headGroup(head);
			if (g !== last) { last = g; h += '<div class="eGrpT"><span>' + g + '</span><b>' + E.money(R.groups[g] || 0) + '</b></div>'; }
			h += '<button class="eSecB' + (hs.sum[head] ? '' : ' nil') + '" data-h="' + esc(head) + '">' + esc(headName(head)) + '<span>' + (hs.sum[head] ? E.money(hs.sum[head]) : '—') + '</span></button>';
		});
		if (c.off) h += '<div class="eGrpT"><span>НЕ СЧИТАЕТСЯ</span><b>' + c.off + '</b></div><button class="eSecB nil" data-h="-">Строки «не считать»<span>' + c.off + '</span></button>';
		var priced = R.rows.some(function (w) { return has(pl.P, w.priceId); });
		if (!priced && !Object.keys(pl.P).length && !S().set.tipPriceOff) h += '<div class="note warn tipX"><button class="x" id="eTipX" title="Больше не показывать">✕</button><b>В прайсе «' + esc(pl.name) + '» пока нет своих цен</b>Стоят цены по умолчанию. Впишите цены в таблицу — они запомнятся по названию материала.<button class="link" id="eImport">Загрузить цены из скрипта СМЕТА…</button></div>';
		if (R.res.old) h += '<div class="note warn"><b>Проект выгружен прежним скриптом</b>Фурнитуры, профилей и погонных материалов в нём нет. Выгрузите модель заново скриптом STHGroup_Export.</div>';
		$('eSecs').innerHTML = h;
	}
	function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

	function unitSel(R, w, id) {
		var c = E.unitChoice(R, w);
		return '<select class="uv"' + (id ? ' id="' + id + '"' : '') + ' data-k="' + esc(rowKey(w)) + '">' + c.options.map(function (o) { return '<option value="' + o[0] + '"' + (String(o[0]) === String(c.value) ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>';
	}
	function sumCell(w) {
		if (w.off) return '';
		if (w.info) return 'справочно';
		if (w.sum > 0) return E.money(w.sum) + ' р.';
		if (w.kind === 'extra') return '';
		if (!(w.val > 0)) return 'нет количества';
		return 'нет цены';
	}
	function modelCell(w) {
		if (w.kind === 'own') return 'своя строка';
		if (w.kind === 'extra') return esc(w.xmode === 'pct' ? 'от ' + E.money(w.calc) + ' р.' : (w.xmode === 'sqm' ? 'площадь панелей' : '')) + (w.own ? ' своя строка' : '');
		return esc(E.num(w.calc)) + (w.note ? ' · ' + esc(comma(w.note)) : '');
	}
	function renderTable(R, cfg) {
		var s = S(), body = $('eBody'), top = body.classList.contains('paper') ? 0 : body.scrollTop, ord = E.ordered(R), h = [], n = 0, hs = headSums(R), lastHead = '', lastGrp = '', lastKind = '';
		body.classList.remove('paper');
		var cs = 7, dups = Es.dups || {}, numOf = {}, nn = 0;
		ord.on.concat(ord.off).forEach(function (i) { var w0 = R.rows[i]; nn++; if (w0.offKey) numOf[w0.offKey] = nn; });
		function rows(list, off) {
			lastHead = ''; lastGrp = '';
			if (off && list.length) h.push('<tr class="gtop goff" data-h="-"><td colspan="' + cs + '">НЕ СЧИТАЕТСЯ</td><td></td><td></td></tr>');
			list.forEach(function (i, pos) {
				var w = R.rows[i], k = esc(rowKey(w));
				if (w.head !== lastHead) {
					lastHead = w.head; lastKind = ''; firstInHead = true;
					if (!off && !dopShown && E.headRank(w.head) >= E.headRank(E.DOP)) dopBlock();
					/* группа из одного раздела с тем же названием («ПРОЧЕЕ») — заголовок один */
					if (!off && w.group !== lastGrp && E.soloGroup(w.head)) lastGrp = w.group;
					if (!off && w.group !== lastGrp) { lastGrp = w.group; h.push('<tr class="gtop"><td colspan="' + cs + '">' + esc(w.group) + '</td><td>' + E.money(R.groups[w.group] || 0) + ' р.</td><td></td></tr>'); }
					var ht = (w.head === E.DOP ? E.DOP : headName(w.head).toUpperCase()) + (w.head === 'ОТВЕРСТИЯ' && R.totalHoles > 0 ? ' — всего ' + E.num(R.totalHoles) + ' шт' : '');
					h.push('<tr class="ghdr" data-h="' + esc(off ? '' : w.head) + '"><td colspan="' + cs + '">' + esc(ht) + '</td><td>' + (off ? '' : (hs.sum[w.head] ? E.money(hs.sum[w.head]) + ' р.' : '')) + '</td><td></td></tr>');
				}
				/* вид материала из «Базы» — подзаголовком внутри раздела */
				if (!off && w.mkind && w.mkind !== lastKind && !(firstInHead && w.mkind.toLowerCase() === headName(w.head).toLowerCase())) h.push('<tr class="gsub"><td></td><td colspan="' + (cs + 1) + '">' + esc(w.mkind) + '</td></tr>');
				lastKind = off ? '' : (w.mkind || '');
				firstInHead = false;
				n++;
				var name;
				if (w.card) name = thumb(w) + '<span class="ownT">' + esc(w.title) + '</span>';
				else if (w.own) name = '<input type="text" class="xn" data-k="' + k + '" value="' + esc(w.label) + '" maxlength="160" autocomplete="off" title="Название своей строки. Начните набирать — программа подскажет позиции из прайса и «Базы»">';
				else name = thumb(w) + '<textarea class="nv' + (w.renamed ? ' set' : '') + '" rows="1" data-k="' + k + '" maxlength="160" spellcheck="false" title="' + esc(w.renamed ? 'Наименование изменено. В модели: ' + w.name0 + '. Сотрите текст, чтобы вернуть' : 'Наименование можно изменить: оно пойдёт в документы, цена останется за строкой') + '">' + esc(w.title) + '</textarea>' + ((w.pieces && w.kind !== 'panel') ? '<div class="sub">' + esc(comma(w.pieces)) + '</div>' : '') + ((w.bad && !w.off) ? '<div class="bad">' + esc(w.bad) + '</div>' : '');
				/* метки: «такая же» позиция выше и «объединено из N» */
				var dup = dups[w.offKey];
				if (dup && !w.own) name += '<button class="dupC" data-k="' + k + '" title="Наименование и артикул совпадают со строкой ' + (numOf[dup.offKey] || '') + '">⚠ такая же — строка ' + (numOf[dup.offKey] || '') + ' · Объединить…</button>';
				if (window.STH && window.STH.mbBtn) name += window.STH.mbBtn(w, i);          // STHGroup: сопоставить с базой материалов
				if (w.parts) name += '<span class="mrgC" title="' + esc(w.parts.map(function (p) { return E.num(p.val) + ' ' + E.shortUnit(p.unit) + ' — ' + p.name; }).join('\n') + '\nРазъединить — правой кнопкой мыши по строке') + '">⧉ объединено из ' + w.parts.length + '</span>';
				var qty;
				if (w.kind === 'own') qty = '<input type="text" class="qv" data-k="' + k + '" value="' + val(w.val) + '"> ' + ownUnit(w, k);
				else if (w.qtyKey) qty = '<input type="text" class="qv' + (w.manual ? ' manual' : '') + '" data-k="' + k + '" value="' + val(w.val) + '"' + (w.manual ? ' title="Задано вручную; по модели ' + val(w.calc) + '. Сотрите число, чтобы вернуть расчётное"' : '') + '> <span class="un">' + esc(E.shortUnit(w.unit)) + esc(w.utail || '') + '</span>';
				else if (w.kind === 'extra' && w.xmode === 'sqm') qty = '<span class="un">' + esc(E.num(w.val)) + ' кв.м</span>';
				else qty = '<span class="un">—</span>';
				var mk = (w.mk && w.price > 0) ? ' title="С наценкой ' + val(w.mk) + ' %: ' + E.num(w.priceOut) + '"' : '';
				var cls = (w.off ? 'offrow' : (w.info ? 'inf' : (w.sum > 0 ? '' : 'nop'))) + (s.estRow === rowKey(w) ? ' hit' : '');
				h.push('<tr class="' + cls + '" data-k="' + k + '"><td class="num">' + n + '.</td>' + '<td class="ar">' + (w.card ? '<span class="ownA">' + esc(w.art || '') + '</span>' : '<textarea class="av' + (w.artSet ? ' set' : '') + '" rows="1" data-k="' + k + '" maxlength="60" spellcheck="false" placeholder=" " title="' + esc(w.artSet ? 'Артикул вписан вручную' + (w.art0 ? '. В модели: ' + w.art0 : '') + '. Сотрите, чтобы вернуть' : (w.art ? 'Артикул из модели; можно изменить' : 'Артикула в модели нет — впишите')) + '">' + esc(w.art || '') + '</textarea>') + '</td>' + '<td class="nm">' + name + '</td><td>' + unitSel(R, w) + '</td><td>' + qty + '</td><td class="calc">' + modelCell(w) + '</td>' +
					'<td><input type="text" class="pv" data-k="' + k + '" value="' + val(w.price) + '"' + mk + '> <span class="un">' + esc(w.punit) + '</span>' + (w.own ? ' <button class="del" data-k="' + k + '" title="Удалить свою строку">✕</button>' : '') + '</td>' +
					'<td class="sm">' + sumCell(w) + (w.mk && w.sum > 0 ? '<small>+' + val(w.mk) + ' %</small>' : '') + '</td><td class="sup">' + (w.kind === 'own' && !w.card ? '<input type="text" class="sv" data-k="' + k + '" value="' + esc(w.sup ? w.sup.shop : '') + '" maxlength="80" placeholder="поставщик" title="Поставщик своей строки: идёт в документы и в заказ поставщику">' : supCell(w, k)) + '</td></tr>');
				/* вопрос «объединить или оставить обе» — полосой под строкой */
				if (dup && s.mergeAsk === rowKey(w)) h.push(mergeBar(w, dup, numOf[dup.offKey], k, cs));
				/* под последней строкой раздела (и подгруппы) — кнопка своей строки */
				var next = list[pos + 1] === undefined ? null : R.rows[list[pos + 1]];
				if (!off && w.head === 'ПРОЧЕЕ' && (!next || next.head !== 'ПРОЧЕЕ')) h.push('<tr class="addrow"><td></td><td colspan="' + (cs + 1) + '"><button id="eAddRow" title="Доставка, подъём, монтаж… Строка хранится в этом проекте">+ своя строка</button> <span class="mute">— суммой, за кв.м панелей или процентом от сметы; хранится в проекте</span></td></tr>');
				else if (!off && w.head !== 'ПРОЧЕЕ' && (!next || next.head !== w.head || (next.mkind || '') !== (w.mkind || ''))) h.push(addRow(w.head, w.mkind || '', cs));
			});
		}
		/* «Дополнительные материалы» видны всегда: в БАЗИСе их не прочитать, строки вписываются здесь */
		var dopShown = false, firstInHead = false;
		function dopBlock() {
			dopShown = true;
			if (hs.n[E.DOP]) return;
			h.push('<tr class="ghdr" data-h="' + esc(E.DOP) + '"><td colspan="' + cs + '">' + esc(E.DOP) + '</td><td></td><td></td></tr>');
			h.push(addRow(E.DOP, '', cs, 'то, что в БАЗИСе записано в «Дополнительных материалах» (блоки питания, ленты, крепёж к стене…): программа их не видит — впишите здесь'));
		}
		rows(ord.on, false);
		if (!dopShown && R.rows.length) dopBlock();
		rows(ord.off, true);
		body.innerHTML = R.rows.length ? '<table class="et"><thead><tr><th></th><th>Артикул</th><th>Наименование</th><th>Считать</th><th>Количество</th><th>По модели</th><th>Цена</th><th class="r">Сумма</th><th>Поставщик</th></tr></thead><tbody>' + h.join('') + '</tbody></table>'
			: '<div class="eEmpty">В проекте нет ничего, что можно посчитать.</div>';
		autoSize(body);
		body.scrollTop = top;
	}
	function addRow(head, mk, cs, hint) {
		return '<tr class="addrow"><td></td><td colspan="' + (cs + 1) + '"><button class="eAdd" data-h="' + esc(head) + '" data-m="' + esc(mk) + '" title="Своя позиция в раздел «' + esc(headName(head)) + (mk ? ' · ' + esc(mk) : '') + '». Хранится в этом проекте">+ своя строка</button>' +
			(hint ? ' <span class="mute">— ' + esc(hint) + '</span>' : '') + '</td></tr>';
	}
	var OWN_UNITS = ['шт', 'компл.', 'м', 'кв.м', 'лист', 'уп.', 'кг', 'л'];
	function ownUnit(w, k) {
		var u = w.unit || 'шт', l = OWN_UNITS.indexOf(u) < 0 ? OWN_UNITS.concat([u]) : OWN_UNITS;
		return '<select class="ouv" data-k="' + k + '" title="Единица своей строки">' + l.map(function (x) { return '<option' + (x === u ? ' selected' : '') + '>' + esc(x) + '</option>'; }).join('') + '</select>';
	}
	function mergeBar(w, d, no, k, cs) {
		var same = d.unit === w.unit, u = E.shortUnit(w.unit), t = '<b>Такая позиция уже есть в смете</b> — строка ' + (no || '') + ': «' + esc(d.title) + '»' + (d.art ? ', арт. ' + esc(d.art) : '') + ', ' + esc(E.num(d.val)) + ' ' + esc(E.shortUnit(d.unit)) + (d.price > 0 ? ' по ' + esc(E.num(d.price)) + ' р.' : '') + '.';
		if (!same) return '<tr class="mbar" data-k="' + k + '"><td></td><td colspan="' + (cs + 1) + '"><div class="mt">' + t + '</div><div class="mb"><span class="warn">Единицы разные (' + esc(u) + ' и ' + esc(E.shortUnit(d.unit)) + ') — выберите одну в «Считать», потом объедините.</span> <button data-mrg="keep">Оставить обе</button> <button data-mrg="later">Позже</button></div></td></tr>';
		var pr = Math.abs((d.price || 0) - (w.price || 0)) > 1e-9 ? 'Цена после объединения: <label class="chk"><input type="radio" name="mPrice" value="' + d.price + '" checked> ' + esc(E.num(d.price)) + ' р.</label> <label class="chk"><input type="radio" name="mPrice" value="' + w.price + '"> ' + esc(E.num(w.price)) + ' р.</label>' : '';
		return '<tr class="mbar" data-k="' + k + '"><td></td><td colspan="' + (cs + 1) + '"><div class="mt">' + t + '</div><div class="mb">' + pr + ' <button class="primary" data-mrg="do">Объединить → ' + esc(E.num(Math.round((d.val + w.val) * 100) / 100)) + ' ' + esc(u) + '</button> <button data-mrg="keep">Оставить обе</button> <button data-mrg="later">Позже</button></div></td></tr>';
	}
	/* объединить строку w с той, что выше; Ctrl+Z сразу после — разъединить */
	function doMerge(w, price) {
		var d = (Es.dups || {})[w.offKey], pl = Es.pl(), we = Es.we();
		if (!d) return;
		var old = d.price;
		if (!E.merge(w, d, pl, we, price)) { U.toast('Позиции с разными единицами не объединяются.', { bad: true }); return; }
		Es.lastMerge = { src: w.offKey, dst: d.offKey, oldPrice: old, u: S().undo.length };
		S().mergeAsk = '';
		Es.saveStore();
		Es.render();
		U.toast('Позиции объединены. Разъединить — Ctrl+Z или правой кнопкой мыши по строке.', { actions: [{ label: 'Разъединить', run: undoMerge }] });
	}
	function undoMerge() {
		var lm = Es.lastMerge, pl = Es.pl();
		if (!lm) return false;
		Es.lastMerge = null;
		delete pl.MERGE[lm.src];
		var R = E.build(S().st, Es.cfg(), pl, Es.we(), S().prices.sup), d = null;
		R.rows.forEach(function (x) { if (x.offKey === lm.dst) d = x; });
		if (d && lm.oldPrice !== undefined) E.setPrice(d, lm.oldPrice, pl, Es.we());
		Es.saveStore(); Es.render();
		U.toast('Позиции разъединены.');
		return true;
	}

	/* ------------------------------ поставщик и фото ----------------------------- */
	/* Хранятся в базе цен (prices.json) по названию материала или фурнитуры — общие для всех проектов и прайсов. */
	function urlText(u) { return O.urlText ? O.urlText(u) : u; }
	function thumb(w) { return (w.sup && w.sup.img) ? '<img class="eThumb" src="' + esc(w.sup.img) + '" data-k="' + esc(rowKey(w)) + '" alt="" title="Фото — щёлкните, чтобы изменить">' : ''; }
	function supCell(w, k) {
		if (!w.skey) return '';
		var s = w.sup || {}, any = s.shop || s.url || s.img;
		return (s.shop ? '<b' + (s.fromNote ? ' title="Из примечания в БАЗИСе"' : '') + '>' + esc(s.shop) + '</b>' : '') +
			(s.url ? '<a class="supl" href="' + esc(s.url) + '" title="' + esc(s.url) + '">' + esc(urlText(s.url)) + '</a>' : '') +
			'<button class="supE" data-k="' + k + '" title="Поставщик, ссылка и фото: запоминаются по названию для всех проектов">' + (any ? '✎' : '+ поставщик') + '</button>';
	}
	/* Картинка → data:… не больше 240 точек по большей стороне (база цен не разрастается). */
	function shrink(blob) {
		return new Promise(function (res, rej) {
			var url = URL.createObjectURL(blob), im = new Image();
			im.onload = function () {
				var k = Math.min(1, 240 / Math.max(im.naturalWidth || 1, im.naturalHeight || 1)), c = document.createElement('canvas');
				c.width = Math.max(1, Math.round(im.naturalWidth * k)); c.height = Math.max(1, Math.round(im.naturalHeight * k));
				var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(im, 0, 0, c.width, c.height);
				URL.revokeObjectURL(url);
				res(c.toDataURL('image/jpeg', 0.86));
			};
			im.onerror = function () { URL.revokeObjectURL(url); rej(new Error('Это не картинка или её формат не поддерживается: подойдут JPG, PNG, BMP, GIF, WEBP.')); };
			im.src = url;
		});
	}
	Es.shrink = shrink;
	var IMG_TYPES = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', bmp: 'image/bmp', gif: 'image/gif', webp: 'image/webp' };
	/* Поставщик строки: выбрать из «Базы» или вписать нового (он попадает в «Базу»); ссылка и фото — у материала
	   в «Базе», общие для всех смет. Пустое поле — поставщик по классу «Поставщик» (если класс задан). */
	Es.supEdit = function (w) {
		if (!w || !w.skey) return;
		var Bs = BM.base, base = Bs.cur, s = w.sup || {}, key = w.skey, mrec = base ? base.mats[key] : null, img = mrec ? (mrec.img || '') : (s.tex ? '' : (s.img || ''));
		var bi = base ? Bs.infoOf(base, key) : null, ownName = (bi && bi.how === 'own') ? bi.shop : (base ? '' : (s.fromNote ? '' : (s.shop || '')));
		var cls = (bi && bi.how === 'class') ? bi.shop : '';
		function listHtml(q) {
			if (!base) return '';
			var ql = String(q || '').trim().toLowerCase(), names = base.sup.map(function (x) { return x.name; }).filter(function (n) { return !ql || n.toLowerCase().indexOf(ql) >= 0; });
			var exact = base.sup.some(function (x) { return x.name.toLowerCase() === ql; });
			return names.slice(0, 8).map(function (n) { return '<div data-v="' + esc(n) + '">' + esc(n) + '</div>'; }).join('') + (ql && !exact ? '<div class="new" data-v="' + esc(String(q).trim()) + '">＋ Добавить «' + esc(String(q).trim()) + '» как нового поставщика в «Базу»</div>' : '');
		}
		function prev(m) { m.querySelector('#sImg').innerHTML = img ? '<img src="' + esc(img) + '" alt="">' : '<span class="mute">нет фото</span>'; m.querySelector('#sImgX').disabled = !img; }
		async function take(m, blob) { try { img = await shrink(blob); prev(m); } catch (e) { U.toast(e.message, { bad: true }); } }
		return U.modal({
			title: 'Поставщик', width: 520, cls: 'supDlg',
			body: '<p class="mute" style="margin-top:0">' + esc(key) + '</p>' +
				(s.fromNote ? '<div class="note" style="margin-bottom:10px">Сейчас взято из примечания в БАЗИСе: <b>' + esc(s.shop) + '</b>. Выберите или впишите поставщика — он заменит примечание.</div>' : '') +
				'<div class="form"><label>Поставщик</label><div><input type="text" id="sShop" maxlength="80" autocomplete="off" value="' + esc(ownName) + '" placeholder="' + esc(cls ? cls + ' — по классу в «Базе»' : (s.fromNote ? s.shop : 'выберите из «Базы» или впишите нового')) + '" autofocus><div class="supList" id="sList"></div>' +
				(cls ? '<div class="mute" style="font-size:12px;margin-top:4px">Сейчас: <b>' + esc(cls) + '</b> — по классу «Поставщик» в «Базе». Пустое поле — так и останется.</div>' : '') + '</div>' +
				'<label>Ссылка</label><div><input type="text" id="sUrl" maxlength="400" value="' + esc(s.url || '') + '" placeholder="https://… — можно не указывать"></div>' +
				'<label>Фото</label><div><div class="supImg" id="sImg"></div><div style="margin-top:6px"><button id="sImgPick">Выбрать файл…</button> <button id="sImgX">Убрать фото</button></div>' +
				'<div class="mute" style="margin-top:6px;font-size:12px">Фото фурнитуры или цвет материала. Можно скопировать картинку на сайте магазина и вставить сюда: Ctrl+V.</div></div></div>',
			buttons: [{ label: 'Отмена', value: null }, { label: 'Сохранить', primary: true, run: function (m) { return { shop: m.querySelector('#sShop').value, url: m.querySelector('#sUrl').value, img: img }; } }],
			onOpen: function (m) {
				prev(m);
				var inp = m.querySelector('#sShop'), lst = m.querySelector('#sList');
				function show() { lst.innerHTML = listHtml(inp.value); lst.hidden = !lst.innerHTML; }
				inp.addEventListener('focus', show); inp.addEventListener('input', show);
				inp.addEventListener('blur', function () { setTimeout(function () { lst.hidden = true; }, 150); });
				lst.addEventListener('mousedown', function (e) { var d = e.target.closest('[data-v]'); if (!d) return; e.preventDefault(); inp.value = d.dataset.v; lst.hidden = true; });
				lst.hidden = true;
				m.querySelector('#sImgX').onclick = function () { img = ''; prev(m); };
				m.querySelector('#sImgPick').onclick = async function () {
					var p = await U.pick({ kind: 'open', title: 'Фото', filters: [{ name: 'Картинки', ext: Object.keys(IMG_TYPES) }] });
					if (!p) return;
					try { var b = await U.api.readBytes(p), ext = String(p).split('.').pop().toLowerCase(); await take(m, new Blob([b], { type: IMG_TYPES[ext] || 'image/*' })); } catch (e) { U.error(e); }
				};
				m.addEventListener('paste', function (e) {
					var it = e.clipboardData ? Array.prototype.slice.call(e.clipboardData.items || []) : [], f = null;
					it.forEach(function (x) { if (!f && x.kind === 'file' && /^image\//.test(x.type)) f = x.getAsFile(); });
					if (!f) return;
					e.preventDefault();
					take(m, f);
				});
			}
		}).then(function (r) {
			if (!r) return;
			var url = r.url.trim();
			if (url && !/^https?:\/\//i.test(url) && !/^[^\s\/]+\.[^\s]+/.test(url)) { U.toast('Ссылка — адрес сайта, например shop.ru/item. Записано без ссылки.', { bad: true }); url = ''; }
			if (base) { Bs.setMat(base, key, { shop: r.shop, url: url, img: r.img, art: w.art0 }); window.Base.save(true); }
			else { E.setSup(S().prices, key, { shop: r.shop, url: url, img: r.img }); Es.saveStore(true); }
			Es.render();
		});
	};

	/* Карточка своей строки (покупные разделы): наименование с подсказками, артикул, количество, единица, цена,
	   поставщик, ссылка и фото. Строка — в проекте; поставщик, ссылка и фото — в «Базе» по наименованию.
	   w — строка для правки, иначе новая в раздел head (подгруппа mk). */
	Es.ownCard = function (w, head, mk) {
		var Bs = BM.base, base = Bs.cur, we = Es.we(), isNew = !w;
		head = w ? w.head : head;
		var sup0 = w && w.sup ? w.sup : {}, mrec = (w && base) ? base.mats[w.skey] : null, img = mrec ? (mrec.img || '') : (sup0.tex ? '' : (sup0.img || ''));
		var cands = E.ownCands(Es.R, Es.pl()), found = [], at = -1;
		function unitOpts(u) { var l = OWN_UNITS.indexOf(u) < 0 ? OWN_UNITS.concat([u]) : OWN_UNITS; return l.map(function (x) { return '<option' + (x === u ? ' selected' : '') + '>' + esc(x) + '</option>'; }).join(''); }
		function prev(m) { m.querySelector('#sImg').innerHTML = img ? '<img src="' + esc(img) + '" alt="">' : '<span class="mute">фото<br>Ctrl+V</span>'; m.querySelector('#sImgX').disabled = !img; }
		async function take(m, blob) { try { img = await shrink(blob); prev(m); } catch (e) { U.toast(e.message, { bad: true }); } }
		function shops(q) {
			if (!base) return '';
			var ql = String(q || '').trim().toLowerCase(), names = base.sup.map(function (x) { return x.name; }).filter(function (n) { return !ql || n.toLowerCase().indexOf(ql) >= 0; });
			var exact = base.sup.some(function (x) { return x.name.toLowerCase() === ql; });
			return names.slice(0, 8).map(function (n) { return '<div data-v="' + esc(n) + '">' + esc(n) + '</div>'; }).join('') + (ql && !exact ? '<div class="new" data-v="' + esc(String(q).trim()) + '">＋ Добавить «' + esc(String(q).trim()) + '» как нового поставщика в «Базу»</div>' : '');
		}
		return U.modal({
			title: (isNew ? 'Новая строка' : 'Своя строка') + ' · ' + headName(head), width: 620, cls: 'supDlg ownDlg',
			body: '<div class="form">' +
				'<label>Наименование</label><div><input type="text" id="oName" maxlength="160" autocomplete="off" data-own-enter="1" value="' + esc(w ? w.title : '') + '" placeholder="начните набирать — подскажу из прайса и «Базы»" autofocus><div class="supList" id="oSug" hidden></div></div>' +
				'<label>Артикул</label><div><input type="text" id="oArt" maxlength="60" value="' + esc(w ? (w.art || '') : '') + '"></div>' +
				'<label>Количество</label><div class="oRow"><input type="text" id="oQty" value="' + val(w ? w.val : 1) + '"><select id="oUnit">' + unitOpts(w ? (w.unit || 'шт') : 'шт') + '</select><span class="oLab">Цена</span><input type="text" id="oPrice" value="' + val(w ? w.price : 0) + '"><span class="mute" id="oPu"></span></div>' +
				'<label>Поставщик</label><div><input type="text" id="sShop" maxlength="80" autocomplete="off" value="' + esc(sup0.shop || '') + '" placeholder="выберите из «Базы» или впишите нового"><div class="supList" id="sList" hidden></div></div>' +
				'<label>Ссылка</label><div><input type="text" id="sUrl" maxlength="400" value="' + esc(sup0.url || '') + '" placeholder="https://… — можно не указывать"></div>' +
				'<label>Фото</label><div class="oRow"><div class="supImg" id="sImg"></div><div><button id="sImgPick">Выбрать файл…</button> <button id="sImgX">Убрать фото</button><div class="mute" style="margin-top:6px;font-size:12px">Можно скопировать картинку на сайте магазина и вставить сюда: Ctrl+V.</div></div></div>' +
				'<label></label><div class="mute" id="oSum" style="font-size:12px"></div></div>',
			buttons: [{ label: 'Отмена', value: null }, { label: isNew ? 'Добавить' : 'Сохранить', primary: true, run: function (m) {
				var r = { name: m.querySelector('#oName').value.replace(/\s+/g, ' ').trim(), art: m.querySelector('#oArt').value, unit: m.querySelector('#oUnit').value,
						  qty: num(m.querySelector('#oQty').value), price: num(m.querySelector('#oPrice').value.trim() === '' ? '0' : m.querySelector('#oPrice').value),
						  shop: m.querySelector('#sShop').value.trim(), url: m.querySelector('#sUrl').value.trim(), img: img };
				if (!r.name) { U.toast('Впишите наименование.', { bad: true }); m.querySelector('#oName').focus(); return false; }
				if (isNaN(r.qty) || r.qty < 0) { U.toast('Количество — число не меньше нуля.', { bad: true }); return false; }
				if (isNaN(r.price) || r.price < 0) { U.toast('Цена — число не меньше нуля.', { bad: true }); return false; }
				return r;
			} }],
			onOpen: function (m) {
				prev(m);
				var nm = m.querySelector('#oName'), sg = m.querySelector('#oSug'), sh = m.querySelector('#sShop'), sl = m.querySelector('#sList');
				function sum() {
					var q = num(m.querySelector('#oQty').value), p = num(m.querySelector('#oPrice').value), mk2 = Es.R.mk[{ 'МАТЕРИАЛ': 'M', 'ФУРНИТУРА': 'F' }[E.headGroup(head)] || 'M'] || 0;
					m.querySelector('#oPu').textContent = 'р./' + m.querySelector('#oUnit').value;
					m.querySelector('#oSum').innerHTML = (q >= 0 && p >= 0) ? 'Сумма: <b>' + E.money(Math.round(q * p * (1 + mk2 / 100))) + ' р.</b>' + (mk2 ? ' (с наценкой ' + val(mk2) + ' %)' : '') + ' · поставщик, ссылка и фото запомнятся в «Базе»' : '';
				}
				['#oQty', '#oPrice', '#oUnit'].forEach(function (q) { m.querySelector(q).addEventListener('input', sum); });
				sum();
				function pick(c) {
					sg.hidden = true; found = []; at = -1;
					nm.value = c.name; m.querySelector('#oArt').value = c.art || '';
					if (c.price > 0) m.querySelector('#oPrice').value = val(c.price);
					if (c.unit) m.querySelector('#oUnit').innerHTML = unitOpts(c.unit);
					var bi = base ? Bs.infoOf(base, c.name) : null, mr = base ? base.mats[c.name] : null;
					sh.value = (bi && bi.shop) || c.shop || sh.value;
					if (bi && bi.url) m.querySelector('#sUrl').value = bi.url;
					if (mr && mr.img) { img = mr.img; prev(m); }
					sum();
				}
				function showSug() {
					found = E.ownFind(cands, nm.value, 8); at = -1;
					sg.innerHTML = found.map(function (c, i) { var t = [c.art ? 'арт. ' + c.art : '', c.price > 0 ? E.num(c.price) + ' р.' + (c.unit ? '/' + c.unit : '') : '', c.shop].filter(function (x) { return x; }); return '<div data-i="' + i + '"><b>' + esc(c.name) + '</b>' + (t.length ? '<span>' + esc(t.join(' · ')) + '</span>' : '') + '</div>'; }).join('');
					sg.hidden = !found.length;
				}
				nm.addEventListener('input', showSug);
				nm.addEventListener('blur', function () { setTimeout(function () { sg.hidden = true; }, 150); });
				nm.addEventListener('keydown', function (e) {
					if (!sg.hidden && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); at = at < 0 ? (e.key === 'ArrowDown' ? 0 : found.length - 1) : (at + (e.key === 'ArrowDown' ? 1 : -1) + found.length) % found.length; sg.querySelectorAll('[data-i]').forEach(function (x, i) { x.classList.toggle('on', i === at); }); return; }
					if (e.key === 'Enter') { e.preventDefault(); if (!sg.hidden && at >= 0) pick(found[at]); else m.querySelector('.foot button.primary').click(); }
				});
				sg.addEventListener('mousedown', function (e) { var d = e.target.closest('[data-i]'); if (!d) return; e.preventDefault(); pick(found[Number(d.dataset.i)]); });
				function showShops() { sl.innerHTML = shops(sh.value); sl.hidden = !sl.innerHTML; }
				sh.addEventListener('focus', showShops); sh.addEventListener('input', showShops);
				sh.addEventListener('blur', function () { setTimeout(function () { sl.hidden = true; }, 150); });
				sl.addEventListener('mousedown', function (e) { var d = e.target.closest('[data-v]'); if (!d) return; e.preventDefault(); sh.value = d.dataset.v; sl.hidden = true; });
				m.querySelector('#sImgX').onclick = function () { img = ''; prev(m); };
				m.querySelector('#sImgPick').onclick = async function () {
					var p = await U.pick({ kind: 'open', title: 'Фото', filters: [{ name: 'Картинки', ext: Object.keys(IMG_TYPES) }] });
					if (!p) return;
					try { var b = await U.api.readBytes(p), ext = String(p).split('.').pop().toLowerCase(); await take(m, new Blob([b], { type: IMG_TYPES[ext] || 'image/*' })); } catch (e) { U.error(e); }
				};
				m.addEventListener('paste', function (e) {
					var it = e.clipboardData ? Array.prototype.slice.call(e.clipboardData.items || []) : [], f = null;
					it.forEach(function (x) { if (!f && x.kind === 'file' && /^image\//.test(x.type)) f = x.getAsFile(); });
					if (!f) return;
					e.preventDefault();
					take(m, f);
				});
			}
		}).then(function (r) {
			if (!r) return;
			var url = r.url;
			if (url && !/^https?:\/\//i.test(url) && !/^[^\s\/]+\.[^\s]+/.test(url)) { U.toast('Ссылка — адрес сайта, например shop.ru/item. Записано без ссылки.', { bad: true }); url = ''; }
			A().pushUndo();
			var id = w ? w.ownId : E.addOwnRow(we, r.name, 'sum', 0, head, mk);
			E.saveOwn(we, id, r);
			if (base) { Bs.setMat(base, r.name, { shop: r.shop, url: url, img: r.img, art: r.art }); window.Base.save(true); }
			else { E.setSup(S().prices, r.name, { shop: r.shop, url: url, img: r.img }); Es.saveStore(true); }
			projChanged();
			Es.render();
		});
	};

	/* поля наименования и артикула растут по тексту — длинное название видно целиком */
	function fitArea(t) { t.style.height = 'auto'; t.style.height = (t.scrollHeight + 2) + 'px'; }
	function autoSize(root) { root.querySelectorAll('textarea.nv, textarea.av').forEach(fitArea); }

	function docOpt(cfg) { return { kind: cfg.docKind, noPrice: cfg.noPrice, totals: cfg.totals }; }
	function renderPaper(R, cfg) {
		var s = S(), body = $('eBody'), top = body.classList.contains('paper') ? body.scrollTop : 0;
		var doc = O.estDoc(R, s.st, docOpt(cfg)), pages = O.estPages(doc);
		body.classList.add('paper');
		/* лист А4 шире узкого окна — уменьшаем его целиком, чтобы был виден весь, с суммами */
		var fit = Math.min(1, (body.clientWidth - 30) / (doc.kind === 'det' ? 1123 : 794));
		body.innerHTML = '<style>' + O.EST_CSS + '</style><div class="eDoc"' + (fit < 1 ? ' style="zoom:' + fit.toFixed(3) + '"' : '') + '>' + pages.join('') + '</div>';
		if (s.estRow) { var w = byKey(R, s.estRow); if (w) body.querySelectorAll('[data-row="' + w.i + '"]').forEach(function (x) { x.classList.add('hit'); }); }
		/* деталировка: щелчок по листу фасада — справа выбор стороны петель */
		Es.facs = doc.kind === 'det' ? (doc.sheets || []) : null;
		if (Es.facs && s.facKey) Es.facs.forEach(function (o, q) { if (o.key === s.facKey) { var pg = body.querySelector('.dPg[data-fac="' + q + '"]'); if (pg) pg.classList.add('hit'); } });
		body.scrollTop = top;
	}

	/* карточка листа деталировки: сторона петель — как определила программа или вручную (хранится в проекте) */
	var SIDE_T = { left: 'слева', right: 'справа' };
	function facCard(o) {
		var auto = o.sideAuto, cur = o.sideSet || '';
		var h = '<div class="sec">Фасад<div class="grow"></div><button class="icon" id="eCardX" title="Закрыть карточку">✕</button></div><div class="cbody"><h3>' + esc(o.name) + '</h3>' +
			'<div class="mute">' + o.h + ' × ' + o.w + ' мм · ' + E.num(o.n) + ' шт</div>';
		if (!auto) return h + '<div class="mute" style="margin-top:10px">Петель на этом фасаде программа не нашла — сторону выбрать нельзя.</div></div>';
		h += '<div class="form"><label>Петли</label><div><span class="seg" id="eFSide">' +
			[['', 'авто (' + SIDE_T[auto] + ')'], ['left', 'слева'], ['right', 'справа']].map(function (x) { return '<button data-fside="' + x[0] + '" class="' + (x[0] === cur ? 'on' : '') + '">' + x[1] + '</button>'; }).join('') + '</span></div></div>' +
			'<div class="mute" style="margin-top:9px">Вид с лицевой стороны: как фасад стоит в изделии. Если программа ошиблась, выберите сторону — чертёж отразится вместе с отверстиями. Выбор хранится в проекте.</div></div>';
		return h;
	}
	function renderRight(R, cfg, pl) {
		var s = S(), we = Es.we(), w = (cfg.paper && s.estRow) ? byKey(R, s.estRow) : null, h = '';
		var fo = (cfg.paper && Es.facs && s.facKey) ? Es.facs.filter(function (o) { return o.key === s.facKey; })[0] : null;
		if (fo) h = facCard(fo);
		else if (w) {
			var k = esc(rowKey(w));
			h = '<div class="sec">Строка сметы<div class="grow"></div><button class="icon" id="eCardX" title="Закрыть карточку">✕</button></div><div class="cbody"><h3>' + esc(w.title) + '</h3>' +
				'<div class="mute">' + esc(headName(w.head)) + (w.kind !== 'extra' ? ' · по модели ' + esc(E.num(w.calc)) + ' ' + esc(E.shortUnit(w.unit)) + esc(w.utail || '') : '') + (w.pieces ? ' · ' + esc(comma(w.pieces)) : '') + '</div>' +
				'<div class="form">' + (w.own ? '' : '<label>Наименование</label><div><textarea class="nv' + (w.renamed ? ' set' : '') + '" rows="1" data-k="' + k + '" maxlength="160" spellcheck="false">' + esc(w.title) + '</textarea></div>') +
				'<label>Артикул</label><div><textarea class="av' + (w.artSet ? ' set' : '') + '" rows="1" data-k="' + k + '" maxlength="60" spellcheck="false" placeholder="нет">' + esc(w.art || '') + '</textarea></div>' +
				'<label>Считать</label><div>' + unitSel(R, w, 'eCU') + '</div>' +
				(w.qtyKey ? '<label>Количество</label><div><input type="text" class="qv' + (w.manual ? ' manual' : '') + '" data-k="' + k + '" value="' + val(w.val) + '"> <span class="mute">' + esc(E.shortUnit(w.unit)) + '</span>' + (w.manual ? ' <button class="link" id="eCardModel">как в модели</button>' : '') + '</div>' : '') +
				'<label>Цена</label><div><input type="text" class="pv" data-k="' + k + '" value="' + val(w.price) + '"> <span class="mute">' + esc(w.punit) + '</span></div>' +
				(w.mk && w.price > 0 ? '<label>С наценкой ' + val(w.mk) + ' %</label><div>' + E.num(w.priceOut) + ' <span class="mute">' + esc(w.punit) + '</span></div>' : '') +
				'<label>Сумма</label><div><b>' + (w.sum > 0 ? E.money(w.sum) + ' р.' : (sumCell(w) || '—')) + '</b></div>' +
				(w.skey ? '<label>Поставщик</label><div class="sup">' + supCell(w, k) + '</div>' : '') + '</div>' +
				(w.manual ? '<div class="note warn">Количество задано вручную: в модели ' + esc(E.num(w.calc)) + ' ' + esc(E.shortUnit(w.unit)) + '.</div>' : '') +
				(w.bad && !w.off ? '<div class="note warn">' + esc(w.bad) + '</div>' : '') +
				(w.note && w.kind !== 'extra' ? '<div class="mute" style="margin-top:8px">' + esc(w.note.replace(/(\d)\.(\d)/g, '$1,$2')) + '</div>' : '') + '</div>';
		}
		$('eCard').innerHTML = h;
		autoSize($('eCard'));
		var t = '<div class="sec">Итог</div><div class="tbody"><div class="eSum" title="Итог сметы со скидкой"><span class="odo" id="eOdo"></span><small>руб.</small></div><div class="eKv">';
		E.GROUPS.forEach(function (g) { if (g === E.DOP && !R.groups[g]) return; t += '<span>' + headName(g) + '</span><b>' + E.money(R.groups[g] || 0) + '</b>'; });
		if (R.discSum) t += '<span>Всего</span><b>' + E.money(R.sub) + '</b>';
		t += '<span class="in">Скидка, % <input type="text" id="eDisc" value="' + val(R.disc) + '" title="Скидка считается от всей суммы и идёт отдельной строкой перед ИТОГО"></span><b>' + (R.discSum ? '− ' + E.money(R.discSum) : '—') + '</b>' +
			'<h4 title="Наценка спрятана в ценах строк: в документах печатается цена уже с ней. Хранится в прайсе">Наценка в ценах, %</h4>' +
			'<span>Материал</span><b><input type="text" class="eMk" data-g="M" value="' + val(R.mk.M) + '"></b><span>Работы</span><b><input type="text" class="eMk" data-g="W" value="' + val(R.mk.W) + '"></b><span>Фурнитура</span><b><input type="text" class="eMk" data-g="F" value="' + val(R.mk.F) + '"></b></div>' +
			'<h4>Заказчик</h4><input type="text" id="eClient" maxlength="120" value="' + esc(we.client || '') + '" placeholder="печатается в шапке документов; хранится в проекте">';
		if (R.warns.length) t += '<h4>Внимание</h4>' + R.warns.map(function (x) { return '<div class="note warn">' + esc(x) + '</div>'; }).join('');
		t += '<h4>Документы</h4><div class="eDocs">' + O.EST_KINDS.map(function (k, i) { return '<button data-doc="' + k[0] + '"' + (i === 0 ? ' class="primary"' : '') + '>' + k[1] + '</button>'; }).join('') + '</div>' +
			'<div class="mute" style="margin-top:9px;font-size:12px">Листов: ' + R.totalSheets + ' · площадь панелей ' + E.num(Math.round(R.packArea * 100) / 100) + ' кв.м · листы и длину реза считает раскрой. Документы — в PDF и Excel.</div></div>';
		$('eTotal').innerHTML = t;
		odo($('eOdo'), Es.prev, R.grand);
		Es.prev = R.grand;
	}

	/* ----------------------------------- правки --------------------------------- */
	/* После правки таблица рисуется заново; поле, в которое перешли клавишей Tab или щелчком, остаётся в работе. */
	function redraw() {
		var a = document.activeElement, keep = null;
		if (a && a.dataset && a.dataset.k && $('est').contains(a)) keep = { k: a.dataset.k, cls: a.classList.contains('pv') ? 'pv' : (a.classList.contains('qv') ? 'qv' : (a.classList.contains('xn') ? 'xn' : (a.classList.contains('nv') ? 'nv' : (a.classList.contains('av') ? 'av' : (a.classList.contains('sv') ? 'sv' : (a.classList.contains('ouv') ? 'ouv' : 'uv')))))), card: !!a.closest('#eCard') };
		Es.render();
		if (keep) {
			var root = keep.card ? $('eCard') : $('eBody'), list = root.querySelectorAll('.' + keep.cls), el = null;
			list.forEach(function (x) { if (x.dataset.k === keep.k) el = x; });
			if (el) { el.focus(); if (el.select && keep.cls !== 'uv') el.select(); }
		}
	}
	function later() { setTimeout(redraw, 0); }
	function projChanged() { A().save(); }
	function commit(el) {
		var R = Es.R, w = byKey(R, el.dataset.k), pl = Es.pl(), we = Es.we();
		if (!w) return;
		if (el.classList.contains('uv')) {
			var own = w.own, hadQty = w.manual;
			if (own || hadQty) A().pushUndo();
			E.setUnit(R, w, el.value, pl, we);
			if (own || hadQty) projChanged();
			if (!own) Es.saveStore();
		} else if (el.classList.contains('qv')) {
			var t = el.value.trim(), v = t === '' ? w.calc : num(t);
			if (isNaN(v) || v < 0) { U.toast('Количество — число не меньше нуля.'); el.value = val(w.val); return; }
			if (Math.abs(v - w.val) < 1e-9) return;
			A().pushUndo(); E.setQty(w, v, we); projChanged();
		} else if (el.classList.contains('pv')) {
			var p = num(el.value.trim() === '' ? '0' : el.value);
			if (isNaN(p) || p < 0) { U.toast('Цена — число не меньше нуля.'); el.value = val(w.price); return; }
			if (Math.abs(p - w.price) < 1e-9) return;
			if (w.own) { A().pushUndo(); E.setPrice(w, p, pl, we); projChanged(); }
			else { E.setPrice(w, p, pl, we); Es.saveStore(); }
		} else if (el.classList.contains('nv')) {
			var nt = el.value.replace(/\s+/g, ' ').trim();
			if (nt === w.title.replace(/\s+/g, ' ').trim()) { el.value = w.title; return; }
			E.setName(w, nt, pl, we); Es.saveStore(); Es.askKey = w.offKey;
		} else if (el.classList.contains('av')) {
			var at = el.value.replace(/\s+/g, ' ').trim();
			if (at === (w.art || '')) { el.value = w.art || ''; return; }
			if (w.own) { A().pushUndo(); E.setArt(w, at, pl, we); projChanged(); }
			else { E.setArt(w, at, pl, we); Es.saveStore(); Es.askKey = w.offKey; }
		} else if (el.classList.contains('ouv') || el.classList.contains('sv')) {
			var f = el.classList.contains('ouv') ? 'unit' : 'shop', ov = el.value.replace(/\s+/g, ' ').trim();
			if (ov === (f === 'unit' ? w.unit : (w.sup ? w.sup.shop : ''))) return;
			A().pushUndo(); E.setOwn(we, w.ownId, f, ov); projChanged();
		} else if (el.classList.contains('xn')) {
			if (!el.value.trim() || el.value.trim() === w.label) { el.value = w.label; return; }
			A().pushUndo(); E.renameOwnRow(we, w.ownId, el.value); projChanged();
		} else return;
		later();
	}
	function setConf(key, v) { var c = Es.cfg(); c[key] = v; A().saveSettings(); }

	/* head — раздел (без него — «Прочее»), mk — подгруппа, в конце которой нажали «+ своя строка» */
	Es.addRow = function (head, mk) {
		if (head && head !== 'ПРОЧЕЕ' && E.headGroup(head) !== 'РАБОТЫ') return Es.ownCard(null, head, mk);
		var we = Es.we(), oth = head && head !== 'ПРОЧЕЕ';
		A().pushUndo();
		var id = E.addOwnRow(we, 'Своя строка', 'sum', 0, oth ? head : '', mk);
		projChanged();
		Es.render();
		var el = null;
		$('eBody').querySelectorAll('input.xn').forEach(function (x) { if (x.dataset.k === (oth ? 'own|' : 'extra|') + id) el = x; });
		if (el) { el.focus(); el.select(); el.scrollIntoView({ block: 'nearest' }); }
	};

	/* ---------------- подсказки своей строки: набрали 2 буквы наименования или артикула ---------------- */
	var sug = { el: null, input: null, list: [], at: -1 };
	function sugHide() { if (sug.el) sug.el.remove(); sug.el = null; sug.input = null; sug.list = []; sug.at = -1; }
	function sugShow(t) {
		var w = Es.R ? byKey(Es.R, t.dataset.k) : null;
		if (!w || !w.own) { sugHide(); return; }
		if (!Es.cands) Es.cands = E.ownCands(Es.R, Es.pl());
		var l = E.ownFind(Es.cands, t.value, 8);
		if (!l.length) { sugHide(); return; }
		if (!sug.el) {
			sug.el = document.createElement('div');
			sug.el.className = 'eSug';
			sug.el.addEventListener('mousedown', function (e) { e.preventDefault(); var it = e.target.closest('.it'); if (it) sugPick(Number(it.dataset.i)); });
			document.body.appendChild(sug.el);
		}
		sug.input = t; sug.list = l; sug.at = -1;
		sug.el.innerHTML = l.map(function (c, i) {
			var m = [c.art ? 'арт. ' + c.art : '', c.price > 0 ? E.num(c.price) + ' р.' + (c.unit ? '/' + c.unit : '') : '', c.shop].filter(function (x) { return x; });
			return '<div class="it" data-i="' + i + '"><b>' + esc(c.name) + '</b>' + (m.length ? '<span>' + esc(m.join(' · ')) + '</span>' : '') + '</div>';
		}).join('');
		var r = t.getBoundingClientRect(), top = r.bottom + 2;
		sug.el.style.left = Math.max(4, Math.min(r.left, window.innerWidth - 330)) + 'px';
		sug.el.style.minWidth = Math.max(r.width, 320) + 'px';
		sug.el.style.top = top + 'px';
		if (top + sug.el.offsetHeight > window.innerHeight - 4) sug.el.style.top = Math.max(4, r.top - 2 - sug.el.offsetHeight) + 'px';
	}
	function sugMove(d) {
		if (!sug.el || !sug.list.length) return;
		var n = sug.list.length;
		sug.at = sug.at < 0 ? (d > 0 ? 0 : n - 1) : (sug.at + d + n) % n;
		sug.el.querySelectorAll('.it').forEach(function (x, i) { x.classList.toggle('on', i === sug.at); if (i === sug.at) x.scrollIntoView({ block: 'nearest' }); });
	}
	/* выбрали подсказку: наименование, артикул, цена, единица и поставщик — в свою строку (Ctrl+Z — отменить) */
	function sugPick(i) {
		var c = sug.list[i], t = sug.input;
		if (!c || !t) return;
		var w = byKey(Es.R, t.dataset.k);
		sugHide();
		if (!w || !w.own) return;
		t.value = t.classList.contains('av') ? (c.art || '') : c.name;      // поле, которое потеряет фокус, уже ничего не перепишет
		A().pushUndo(); E.fillOwn(Es.we(), w.ownId, c); projChanged();
		Es.render();
	}
	Es._sug = sug;

	/* Цены из файла скрипта «СМЕТА» («цены распила.txt»). */
	/* t — куда: { store, cfg, pl } из окна настроек (рабочая копия, запишется по «Сохранить»); без t — сразу в действующие прайсы.
	   Возвращает название прайса, в который загружено, или false. */
	Es.importScript = async function (t) {
		var s = S(), live = !t, cfg = live ? Es.cfg() : t.cfg, pl = live ? Es.pl() : t.pl, store = live ? s.prices : t.store, NAME = 'цены распила.txt', path = '';
		var cands = [cfg.scriptFile, U.join(U.dirOf(s.boot.dataDir), NAME), U.join(s.boot.docs, NAME)].filter(function (x) { return x; });
		for (var i = 0; i < cands.length && !path; i++) { try { var stt = await U.api.stat(cands[i]); if (stt.exists && !stt.dir) path = cands[i]; } catch (e) { /* ищем дальше */ } }
		if (path) {
			var use = await U.modal({ title: 'Цены из скрипта СМЕТА', width: 540, body: '<p>Найден файл цен скрипта:</p><p><b>' + esc(path) + '</b></p><p class="mute">Скрипт «СМЕТА» хранит цены в файле «' + NAME + '» — рядом с собой или в папке профиля. Если у вас несколько таких файлов, выберите нужный.</p>',
				buttons: [{ label: 'Отмена', value: null }, { label: 'Выбрать другой файл…', value: 'pick' }, { label: 'Взять этот', value: 'use', primary: true }] });
			if (!use) return false;
			if (use === 'pick') path = '';
		}
		if (!path) path = await U.pick({ kind: 'open', title: 'Файл цен скрипта СМЕТА («' + NAME + '»)', dir: cfg.scriptFile ? U.dirOf(cfg.scriptFile) : s.boot.docs, filters: [{ name: 'Цены скрипта СМЕТА', ext: ['txt'] }] });
		if (!path) return false;
		var imp;
		try { imp = E.importScript(await U.api.readAnyText(path), 'Из скрипта СМЕТА'); } catch (e2) { U.error(e2); return false; }
		if (!imp.count) { U.toast('В этом файле не нашлось цен скрипта СМЕТА: ' + U.baseOf(path), { bad: true }); return false; }
		var confN = Object.keys(imp.conf).length, np = Object.keys(imp.list.P).length;
		var to = await U.modal({ title: 'Загрузить цены из скрипта', width: 560,
			body: '<p>В файле: цен — <b>' + np + '</b>, правил строк (единицы, «не считать», «справочно», длины хлыстов) — <b>' + (imp.count - np) + '</b>.</p>' +
				'<div class="form"><label>Куда</label><div><select id="iTo"><option value="new">в новый прайс «Из скрипта СМЕТА»</option><option value="cur">в прайс «' + esc(pl.name) + '» — заменить его цены и правила</option></select></div>' +
				(confN ? '<label class="chk full"><input type="checkbox" id="iConf" checked> Взять из файла и настройки расчёта: запас по кромке, запас и пропил профиля, какие разделы считать</label>' : '') + '</div>',
			buttons: [{ label: 'Отмена', value: null }, { label: 'Загрузить', primary: true, run: function (m) { return { to: m.querySelector('#iTo').value, conf: confN ? m.querySelector('#iConf').checked : false }; } }] });
		if (!to) return false;
		cfg.scriptFile = path;
		if (to.conf) for (var k in imp.conf) if (has(imp.conf, k)) cfg[k] = imp.conf[k];
		var target = pl.name;
		if (to.to === 'cur') ['P', 'OFF', 'REF', 'SQM', 'FUNIT', 'CUNIT', 'EUNIT', 'PLEN', 'LEG', 'def', 'cls'].forEach(function (f) { pl[f] = imp.list[f]; });
		else {
			var nm = imp.list.name, q = 2;
			while (E.listBy(store, imp.list.name)) imp.list.name = nm + ' (' + (q++) + ')';
			store.lists.push(imp.list);
			target = imp.list.name;
			if (live) { if (s.st) { Es.we().pl = target; A().save(); } cfg.cur = target; }
		}
		U.toast('Цены загружены: ' + np + '. Прайс «' + target + '».' + (live ? '' : ' Нажмите «Сохранить», чтобы записать.'));
		if (live) { A().saveSettings(true); Es.saveStore(true); if (s.st) A().render(); }
		return target;
	};

	Es.init = function () {
		var est = $('est'), rz = 0;
		window.addEventListener('resize', function () { clearTimeout(rz); rz = setTimeout(function () { if (S().st && S().section === 'est' && Es.cfg().paper) Es.render(); }, 120); });
		est.addEventListener('change', function (e) {
			var t = e.target, s = S();
			if (!s.st) return;
			if (t.dataset.k && (t.classList.contains('uv') || t.classList.contains('qv') || t.classList.contains('pv') || t.classList.contains('xn') || t.classList.contains('nv') || t.classList.contains('av') || t.classList.contains('ouv') || t.classList.contains('sv'))) { commit(t); return; }
			if (t.dataset.f) { setConf(t.dataset.f, t.checked ? 1 : 0); later(); return; }
			if (t.id === 'eNoPrice') { setConf('noPrice', t.checked ? 1 : 0); later(); return; }
			if (t.id === 'eTotals') { setConf('totals', t.checked ? 1 : 0); later(); return; }
			if (t.id === 'ePl') {
				if (t.value === '::manage') { t.value = Es.pl().name; window.Dlg.settings('eLists'); return; }
				A().pushUndo(); Es.we().pl = t.value; setConf('cur', t.value); projChanged(); later(); return;
			}
			if (t.id === 'eDisc') {
				var d = num(t.value.trim() === '' ? '0' : t.value);
				if (isNaN(d) || d < 0 || d > 100) { U.toast('Скидка — от 0 до 100 процентов.'); t.value = val(Es.R.disc); return; }
				A().pushUndo(); Es.we().disc = d; projChanged(); later(); return;
			}
			if (t.classList.contains('eMk')) {
				var m = num(t.value.trim() === '' ? '0' : t.value);
				if (isNaN(m) || m < -90 || m > 1000) { U.toast('Наценка — в процентах, от −90 до 1000.'); t.value = val(Es.R.mk[t.dataset.g]); return; }
				Es.pl().mk[t.dataset.g] = m; Es.saveStore(); later(); return;
			}
			if (t.id === 'eClient') { A().pushUndo(); Es.we().client = t.value.trim(); projChanged(); later(); }
		});
		/* Enter в поле таблицы — записать и перейти в то же поле следующей строки */
		est.addEventListener('keydown', function (e) {
			var t = e.target;
			if (sug.el && t === sug.input) {
				if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); sugMove(e.key === 'ArrowDown' ? 1 : -1); return; }
				if (e.key === 'Enter' && sug.at >= 0) { e.preventDefault(); sugPick(sug.at); return; }
				if (e.key === 'Escape') { e.stopPropagation(); sugHide(); return; }
			}
			if (e.key === 'Escape' && t.tagName === 'TEXTAREA' && t.dataset.k) { var w9 = byKey(Es.R, t.dataset.k); if (w9) { t.value = t.classList.contains('av') ? (w9.art || '') : w9.title; fitArea(t); } e.stopPropagation(); t.blur(); return; }
			if (e.key !== 'Enter' || (t.tagName !== 'INPUT' && !(t.tagName === 'TEXTAREA' && t.dataset.k))) return;
			e.preventDefault();
			if (t.tagName === 'TEXTAREA') { t.blur(); return; }
			var cls = t.classList.contains('qv') ? 'qv' : (t.classList.contains('pv') ? 'pv' : ''), tr = t.closest('tr'), nx = null;
			if (cls && tr) { for (var r = tr.nextElementSibling; r && !nx; r = r.nextElementSibling) nx = r.querySelector('input.' + cls); }
			if (nx) { nx.focus(); nx.select(); } else t.blur();
		});
		/* правая кнопка мыши по строке: разъединить объединённую, объединить «такую же» */
		est.addEventListener('contextmenu', function (e) {
			var tr = e.target.closest('#eBody table.et tr[data-k]');
			if (!tr || !Es.R || e.target.closest('input, textarea')) return;
			var w = byKey(Es.R, tr.dataset.k), acts = [], pl = Es.pl();
			if (!w) return;
			if (w.parts) {
				acts.push(['⧉ Разъединить (' + w.parts.length + ' ' + E.plural(w.parts.length, 'позиция', 'позиции', 'позиций') + ')', function () { E.unmerge(w, pl); Es.lastMerge = null; Es.saveStore(); Es.render(); }]);
				w.parts.forEach(function (p) { acts.push(['— ' + E.num(p.val) + ' ' + E.shortUnit(p.unit) + ' из «' + p.name + '»', function () { }, '', true]); });
			}
			if ((Es.dups || {})[w.offKey]) acts.push(['Объединить с такой же…', function () { S().mergeAsk = rowKey(w); Es.render(); }]);
			if (!acts.length) return;
			e.preventDefault();
			U.menu(e.clientX, e.clientY, acts);
		});
		/* Ctrl+Z сразу после объединения — разъединить */
		document.addEventListener('keydown', function (e) {
			var k = (e.key || '').toLowerCase();
			if (!(e.ctrlKey || e.metaKey) || e.shiftKey || (k !== 'z' && k !== 'я') || !Es.lastMerge || S().section !== 'est') return;
			var tg = e.target.tagName;
			if (tg === 'INPUT' || tg === 'TEXTAREA' || tg === 'SELECT' || document.querySelector('.back:not(.out) .modal')) return;
			if (S().undo.length !== Es.lastMerge.u) { Es.lastMerge = null; return; }      // после объединения были другие правки — обычная отмена
			e.preventDefault(); e.stopImmediatePropagation();
			undoMerge();
		}, true);
		est.addEventListener('input', function (e) {
			var t = e.target;
			if (t.tagName === 'TEXTAREA' && t.dataset.k) fitArea(t);
			if (t.dataset.k && (t.classList.contains('xn') || t.classList.contains('av'))) sugShow(t);
		});
		est.addEventListener('focusout', function (e) { if (e.target === sug.input) setTimeout(function () { if (sug.input && document.activeElement !== sug.input) sugHide(); }, 120); });
		$('eBody').addEventListener('scroll', function () { if (sug.el) sugHide(); });
		est.addEventListener('focusin', function (e) { if (e.target.tagName === 'INPUT' && e.target.type === 'text' && e.target.select && !e.target.classList.contains('xn') && e.target.id !== 'eClient') e.target.select(); });
		est.addEventListener('click', function (e) {
			var s = S(), t = e.target, b;
			if (!s.st) return;
			if ((b = t.closest('#eView button'))) { setConf('paper', Number(b.dataset.v) ? 1 : 0); s.estRow = ''; Es.render(); $('eBody').scrollTop = 0; return; }
			if ((b = t.closest('#eKind button'))) { setConf('docKind', b.dataset.k); s.estRow = ''; Es.render(); $('eBody').scrollTop = 0; return; }
			if ((b = t.closest('.dupC'))) { var wd = byKey(Es.R, b.dataset.k); if (wd) { s.mergeAsk = rowKey(wd); Es.render(); } return; }
			if ((b = t.closest('tr.mbar [data-mrg]'))) {
				var wm = byKey(Es.R, b.closest('tr.mbar').dataset.k), dm = wm ? (Es.dups || {})[wm.offKey] : null;
				if (!wm || !dm) return;
				if (b.dataset.mrg === 'do') { var rp = b.closest('tr.mbar').querySelector('input[name="mPrice"]:checked'); doMerge(wm, rp ? Number(rp.value) : undefined); }
				else if (b.dataset.mrg === 'keep') { E.keepBoth(dm, wm, Es.pl()); Es.saveStore(); s.mergeAsk = ''; Es.render(); }
				else { s.mergeAsk = ''; Es.render(); }
				return;
			}
			if (t.closest('#eWriteOff')) { window.MatBase.writeOff().catch(U.error); return; }
			if (t.closest('#eQClear')) { A().pushUndo(); Es.we().qty = {}; projChanged(); Es.render(); return; }
			if (t.closest('#eAddRow')) { Es.addRow(); return; }
			if ((b = t.closest('button.eAdd'))) { Es.addRow(b.dataset.h, b.dataset.m); return; }
			/* ссылки поставщиков — в браузере; окно программы никуда не уходит */
			if ((b = t.closest('a[href]'))) { e.preventDefault(); var href = b.getAttribute('href'); if (/^https?:/i.test(href)) U.api.openUrl(href).catch(U.error); return; }
			if ((b = t.closest('.supE, img.eThumb'))) { var wq = byKey(Es.R, b.dataset.k); if (wq && wq.card) Es.ownCard(wq); else Es.supEdit(wq); return; }
			if (t.closest('#eImport')) { Es.importScript(); return; }
			if (t.closest('#eTipX')) { S().set.tipPriceOff = 1; window.App.saveSettings(); var nt = t.closest('.note'); if (nt) nt.remove(); return; }
			if (t.closest('#eCardX')) { s.estRow = ''; s.facKey = ''; Es.render(); return; }
			if ((b = t.closest('[data-fside]')) && s.facKey) {
				var we2 = Es.we(), fv = b.dataset.fside;
				A().pushUndo();
				if (!we2.fside || typeof we2.fside !== 'object') we2.fside = {};
				if (fv) we2.fside[s.facKey] = fv; else delete we2.fside[s.facKey];
				projChanged(); Es.render(); return;
			}
			if ((b = t.closest('#eBody.paper .dPg[data-fac]')) && Es.facs) { var fo2 = Es.facs[Number(b.dataset.fac)]; if (fo2) { s.facKey = fo2.key; s.estRow = ''; Es.render(); } return; }
			if (t.closest('#eCardModel')) { var w0 = byKey(Es.R, s.estRow); if (w0) { A().pushUndo(); E.resetQty(w0, Es.we()); projChanged(); Es.render(); } return; }
			if ((b = t.closest('button.del'))) { var w1 = byKey(Es.R, b.dataset.k); if (w1 && w1.own) { A().pushUndo(); E.dropOwnRow(Es.we(), w1.ownId); projChanged(); Es.render(); } return; }
			if ((b = t.closest('[data-doc]'))) { window.Dlg.estDoc(b.dataset.doc); return; }
			if ((b = t.closest('.eSecB'))) {
				var head = b.dataset.h, body = $('eBody'), cfg = Es.cfg(), el = null;
				if (cfg.paper) { var first = null; Es.R.rows.forEach(function (w) { if (first === null && !w.off && w.head === head) first = w.i; }); if (first !== null) el = body.querySelector('[data-row="' + first + '"]'); }
				else body.querySelectorAll('tr[data-h]').forEach(function (x) { if (!el && x.dataset.h === head) el = x; });
				if (el) body.scrollTo({ top: Math.max(0, el.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop - (cfg.paper ? 60 : 34)), behavior: U.animOn() ? 'smooth' : 'auto' });
				return;
			}
			/* «как на бумаге»: щелчок по строке открывает её карточку справа */
			if ((b = t.closest('#eBody.paper [data-row]'))) { var w2 = Es.R.rows[Number(b.dataset.row)]; if (w2) { s.estRow = rowKey(w2); Es.render(); } }
		});
	};
})();
