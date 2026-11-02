/* STHGroup — боковые панели: материалы и листы слева, детали и карточка справа, поиск. */
(function () {
	'use strict';
	var U = window.UI, P = BM.project, D = BM.draw, $ = U.$, esc = U.esc;
	var Pn = window.Panels = {};
	var TEX = [['a', 'как в БАЗИСе'], ['l', 'вдоль длины'], ['w', 'поперёк длины'], ['n', 'любая']];
	var TEXS = { l: 'вдоль длины', w: 'поперёк длины', n: 'любая' };

	/* -------------------------------- слева ----------------------------------- */
	Pn.left = function () {
		var A = window.App, S = A.S, st = S.st, sm = P.summary(st), h = '', i;
		var rows = {};
		sm.mats.forEach(function (r) { rows[r.mat.key] = r; });
		st.mats.forEach(function (m) {
			var r = rows[m.key];
			if (!r) return;
			var f = P.fmtOf(m), l2, l3;
			if (!m.cfg.on) { l2 = 'без раскроя'; l3 = r.n + ' ' + A.plural(r.n, 'деталь', 'детали', 'деталей'); }
			else {
				l2 = f.L + ' × ' + f.W + (m.cfg.grain ? ', текстура' : '');
				l3 = (A.busy(m.key) || r.stale) ? '<span class="warn">идёт раскладка…</span>' :
					(r.sheets + ' ' + A.plural(r.sheets, 'лист', 'листа', 'листов') + ', ' + P.num(r.fill, 1) + ' %, ' + r.n + ' ' + A.plural(r.n, 'деталь', 'детали', 'деталей') + (r.unplaced ? ' · <span class="warn">не вошло ' + r.unplaced + '</span>' : '') + (r.buf ? ' · <span class="warn">в буфере ' + r.buf + '</span>' : ''));
			}
			h += '<div class="mat' + (m.key === S.matKey ? ' on' : '') + (m.cfg.on ? '' : ' off') + '" data-k="' + esc(m.key) + '" title="' + esc(P.matTitle(m)) + '"><b>' + esc(P.matTitle(m)) + '</b><span>' + l2 + '</span><span>' + l3 + '</span><div class="prog" style="width:0"></div></div>';
		});
		$('matList').innerHTML = h || '<div class="mute">В проекте нет листовых деталей.</div>';
		Pn.jobs();

		var mat = A.mat(), lay = A.lay(), th = '', color = S.set.color || 'name';
		if (lay) lay.sheets.forEach(function (sh, n) {
			var stt = P.sheetStat(st, mat, sh);
			th += '<div class="thumb' + (n === S.si && S.view !== 'all' ? ' on' : '') + '" data-i="' + n + '" title="Лист ' + (n + 1) + ': ' + P.dim(sh.L) + ' × ' + P.dim(sh.W) + (sh.rem ? ', остаток' : '') + '">' +
				  D.sheet(st, mat, sh, { px: 120, uid: 't' + n, strip: 0, labels: 0, offcuts: 0, color: color }) + (sh.lock ? '<span class="lk" title="Закреплён">закр.</span>' : '') +
				  '<div>лист ' + (n + 1) + ', ' + P.num(stt.fill, 1) + ' %' + (sh.rem ? ' · ост.' : '') + '</div></div>';
		});
		var canEdit = !!(mat && mat.cfg.on && lay && !A.stale());
		if (canEdit) th += '<div class="thumb add" data-i="-1" title="Добавить пустой лист, чтобы разложить детали самому. Сюда же можно бросить деталь — она ляжет на новый лист">+ пустой лист</div>';
		$('thumbs').innerHTML = th || '<div class="mute" style="grid-column:1/-1">Листов пока нет.</div>';

		/* буфер: детали, снятые с листов */
		var bh = '';
		if (mat && mat.cfg.on && lay) {
			var buf = P.bufOf(st, mat.key);
			bh = '<div class="sec">Буфер' + (buf.length ? ' (' + buf.length + ')' : '') + '</div><div id="bufDrop"' + (buf.length ? '' : ' class="empty"') + '>';
			if (!buf.length) bh += 'Перетащите сюда деталь с листа, чтобы потом положить её самому. Программа детали из буфера не раскладывает.';
			buf.forEach(function (it, n) {
				var t = st.typeBy[it.t];
				if (!t) return;
				var rc0 = P.bufRec(st, mat, it), kk = 44 / Math.max(rc0.a, rc0.b, 1), w = Math.max(6, Math.round(rc0.a * kk)), hh = Math.max(6, Math.round(rc0.b * kk));
				bh += '<div class="bit" data-i="' + n + '" title="' + esc(t.name) + ' — перетащите на лист">' +
					  '<svg width="' + w + '" height="' + hh + '" viewBox="0 0 ' + rc0.a + ' ' + rc0.b + '"><path d="' + D.polyPath(P.recBody(st, mat, rc0)) + '" fill="' + P.colorOf(st, t, color === 'none' ? 'name' : color) + '" stroke="#333" stroke-width="' + (1.2 / kk).toFixed(1) + '"/></svg>' +
					  '<div><b>' + esc(P.main(t) || t.name) + '</b><span>' + esc(t.name) + '</span><span>' + P.dim(t.L) + ' × ' + P.dim(t.W) + '</span></div></div>';
			});
			bh += '</div>';
			var shB = A.sheet(), acts = '';
			if (shB && shB.recs.length && S.view !== 'all') acts += '<button id="bStrip"' + (A.stale() ? ' disabled' : '') + ' title="Убрать все детали открытого листа в буфер, чтобы разложить их самому">Снять всё с листа</button>';
			if (buf.length) acts += '<button id="bBufPlace"' + (A.stale() ? ' disabled' : '') + ' title="Программа сама расставит детали из буфера по свободным местам; что не войдёт — на новый лист">Разложить буфер</button>';
			if (acts) bh += '<div class="acts">' + acts + '</div>';
		}
		$('bufBox').innerHTML = bh;
		$('secSheets').textContent = 'Листы материала' + (lay && lay.sheets.length ? ' (' + lay.sheets.length + ')' : '');

		/* не вошедшие детали */
		var un = '';
		if (lay && lay.unplaced.length && !A.stale()) {
			var by = {}, order = [];
			lay.unplaced.forEach(function (u, n) { if (!by[u.t]) { by[u.t] = { n: 0, first: n }; order.push(u.t); } by[u.t].n++; });
			un = '<div class="note bad"><b>Не вошло деталей: ' + lay.unplaced.length + '</b>Не помещаются на лист этого формата.';
			order.slice(0, 8).forEach(function (sig) {
				var t = st.typeBy[sig];
				if (t) un += '<div class="row"><span title="' + esc(t.name) + '">' + esc((P.main(t) ? P.main(t) + ' ' : '') + t.name) + ' ' + P.dim(t.L) + '×' + P.dim(t.W) + (by[sig].n > 1 ? ' — ' + by[sig].n + ' шт.' : '') + '</span></div>';
			});
			un += '</div>';
		}
		if (mat && mat.cfg.on && lay && lay.warn && lay.warn.length) un += '<div class="note warn">' + esc(lay.warn[0]) + '</div>';
		$('unplaced').innerHTML = un;

		/* остатки вручную */
		var rb = '';
		if (mat && mat.cfg.on) {
			(mat.cfg.rem || []).forEach(function (r, n) {
				rb += '<div class="row" data-i="' + n + '"><input type="number" class="L" min="100" max="9999" value="' + r.L + '" title="Длина, мм"> × <input type="number" class="W" min="100" max="9999" value="' + r.W + '" title="Ширина, мм"> <input type="number" class="n" min="1" max="99" value="' + (r.n || 1) + '" title="Сколько таких кусков"> шт <button class="icon del" title="Убрать">✕</button></div>';
			});
			rb += '<div class="row">' + ((mat.cfg.rem || []).length ? '' : '<span class="mute">нет</span> ') + '<button id="bRemAdd">Добавить кусок</button></div><div class="mute">Остатки идут в раскрой первыми.</div>';
		} else rb = '<span class="mute">—</span>';
		$('remBox').innerHTML = rb;
	};

	Pn.jobs = function () {
		var S = window.App.S;
		document.querySelectorAll('#matList .mat').forEach(function (el) {
			var j = S.jobs[el.dataset.k], bar = el.querySelector('.prog');
			if (bar) bar.style.width = j ? Math.max(4, Math.round((j === S.running ? (j.progress || 0.02) : 0) * 100)) + '%' : '0';
		});
	};

	/* -------------------------------- справа ---------------------------------- */
	function swatch(st, t) {
		var mode = window.App.S.set.color || 'name';
		return '<i class="sw" style="background:' + (mode === 'none' ? '#fff' : P.colorOf(st, t, mode)) + '"></i>';
	}
	/* Таблица резов: № по порядку работы, установ, левый/правый упор, деталь (◂ левый, ▸ правый упор). */
	function cutsTable(st, sh) {
		var cs = sh.cuts || [], pre = (st.work.params.cut || {}).posPrefix || '';
		if (!cs.length) return '<div class="info" style="padding:10px">Для этого листа таблицы резов нет (раскладка правилась вручную без пересчёта).</div>';
		var h = '<table class="pl cutT"><colgroup><col style="width:34px"><col style="width:42px"><col style="width:62px"><col style="width:62px"><col></colgroup><thead><tr><th title="Номер реза по порядку работы на станке">№</th><th title="Установ: пока размер и сторона упора те же, пилу не переставляют">Уст.</th><th class="r" title="Размер при упоре слева (мм)">Левый</th><th class="r" title="Размер при упоре справа (мм)">Правый</th><th title="Готовая деталь, получаемая этим резом">Деталь</th></tr></thead><tbody>';
		var lastSetup = 0;
		cs.forEach(function (c, i) {
			var rc = c.part >= 0 ? sh.recs[c.part] : null, t = rc ? st.typeBy[rc.t] : null;
			var nm = t ? ((t.pos ? pre + t.pos : '') || t.name) + (c.side === 'L' ? ' ◂' : ' ▸') : '';
			var cls = (c.setup !== lastSetup ? 'newSet' : '') + (rc && rc === sh.recs[window.App.S.sel] ? ' on' : '');
			lastSetup = c.setup;
			h += '<tr data-i="' + (c.part >= 0 ? c.part : -1) + '" class="' + cls + '"><td>' + (i + 1) + '</td><td>' + c.setup + '</td><td class="r">' + (c.side === 'L' ? P.dim(c.size) : '') + '</td><td class="r">' + (c.side === 'R' ? P.dim(c.size) : '') + '</td><td title="' + esc(t ? t.name : 'полоса для следующих резов') + '">' + (nm ? esc(nm) : '<span class="nopos">полоса</span>') + '</td></tr>';
		});
		return h + '</tbody></table><div class="info" style="padding:6px 8px">Резов: ' + sh.cutsN + ' · установов: ' + sh.setups + ' · длина резов: ' + P.dim(Math.round(sh.saw || 0)) + ' мм</div>';
	}
	Pn.right = function () {
		var A = window.App, S = A.S, st = S.st, mat = A.mat(), sh = A.sheet(), h = '';
		document.querySelectorAll('#listMode button').forEach(function (b) { b.classList.toggle('on', b.dataset.m === S.listMode); });
		if (!mat) { $('partList').innerHTML = ''; $('card').innerHTML = ''; return; }
		var head = '<table class="pl"><colgroup><col style="width:52px"><col style="width:66px"><col><col style="width:50px"><col style="width:46px"><col style="width:30px"><col style="width:' + (S.listMode === 'mat' ? 54 : 28) + 'px"></colgroup><thead><tr><th>Поз.</th><th>Обозн.</th><th>Название</th><th class="r">Длина</th><th class="r">Шир.</th><th class="r">Шт</th><th class="r" title="' + (S.listMode === 'mat' ? 'На каких листах лежит' : 'Группа «держать вместе»') + '">' + (S.listMode === 'mat' ? 'Листы' : 'Гр.') + '</th></tr></thead><tbody>';
		function row(t, n, last, off) {
			var tw = st.work.parts[t.sig] || {};
			return '<tr data-t="' + t.sig + '" class="' + (t.sig === S.selType ? 'on' : '') + (off ? ' off' : '') + '"><td class="' + (t.pos ? '' : 'nopos') + '">' + swatch(st, t) + esc(t.pos || '—') + '</td><td class="' + (t.des ? '' : 'nopos') + '">' + esc(t.des || '—') + '</td><td title="' + esc(t.name) + '">' + esc(t.name) + '</td><td class="r">' + P.dim(t.L) + '</td><td class="r">' + P.dim(t.W) + '</td><td class="r">' + n + '</td><td class="r">' + last + '</td></tr>';
		}
		if (S.listMode === 'cuts' && sh && mat.cfg.on) {
			$('listTitle').textContent = 'Резы листа ' + (S.si + 1);
			$('partList').innerHTML = cutsTable(st, sh);
			var cr = $('partList').querySelectorAll('tr[data-i]');
			Array.prototype.forEach.call(cr, function (tr) { tr.onclick = function () { var i = +tr.dataset.i; if (i >= 0) { S.sel = i; A.render && A.render(); } }; });
			card();
			return;
		}
		if (S.listMode === 'mat' || !sh || !mat.cfg.on) {
			$('listTitle').textContent = 'Детали материала';
			var lay = A.lay(), where = {};
			if (lay) lay.sheets.forEach(function (s2, n) { s2.recs.forEach(function (rc) { (where[rc.t] = where[rc.t] || {})[n + 1] = 1; }); });
			h = head;
			mat.types.forEach(function (t) {
				var tw = st.work.parts[t.sig] || {}, n = P.count(st, t), base = P.baseCount(st, t);
				if (!n && !tw.off && !base) return;
				h += row(t, tw.off ? base * st.work.sets : n, where[t.sig] ? Object.keys(where[t.sig]).join(',') : (tw.off ? 'искл.' : '—'), !!tw.off);
			});
			h += '</tbody></table>';
		} else {
			$('listTitle').textContent = 'Детали листа ' + (S.si + 1);
			h = head;
			P.sheetRows(st, mat, sh).forEach(function (r) { var g = (st.work.parts[r.t.sig] || {}).grp; h += row(r.t, r.n, g > 0 ? g : '', false); });
			h += '</tbody></table>';
		}
		$('partList').innerHTML = h;
		var on = $('partList').querySelector('tr.on');
		if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest' });
		card();
	};

	function card() {
		var A = window.App, S = A.S, st = S.st, mat = A.mat(), sh = A.sheet(), el = $('card');
		var t = S.selType ? st.typeBy[S.selType] : null;
		if (!t || t.mat !== mat.key) { el.innerHTML = ''; return; }
		var tw = st.work.parts[t.sig] || {}, sp = P.shapeFor(st, t, mat), rc = (sh && S.sel >= 0 && sh.recs[S.sel] && sh.recs[S.sel].t === t.sig) ? sh.recs[S.sel] : null;
		var info = [P.dim(t.L) + ' × ' + P.dim(t.W) + ' мм', P.matTitle(mat)];
		if (sp.curve) info.push(sp.ok ? 'криволинейная' : 'криволинейная, форма не прочитана');
		if (sp.innerPts.length) info.push('с вырезом');
		var ec = sp.edges.length;
		if (ec) info.push('кромка: ' + ['T', 'B', 'L', 'R'].filter(function (s) { return sp.sides[s]; }).length + ' ' + 'стор.' + (sp.edges.some(function (e) { return !e.side; }) ? ' + по кривой' : ''));
		if (t.holes) { var nh = t.holes.top.length + t.holes.bot.length + t.holes.thr.length; if (nh || t.holes.edge) info.push('отверстий: ' + nh + (t.holes.edge ? ' + в торец ' + t.holes.edge : '')); }
		if (t.path.length) info.push(t.path.join(' / '));
		var k = Math.max(t.L, 1) / 86, pad = 2 * k;
		var prev = '<svg xmlns="http://www.w3.org/2000/svg" width="' + Math.round(Math.min(360, (t.L + 2 * pad) / k * 3.78)) + '" height="' + Math.round(Math.min(360, (t.L + 2 * pad) / k * 3.78) * (t.W + 2 * pad) / (t.L + 2 * pad)) + '" viewBox="' + (-pad) + ' ' + (-pad) + ' ' + (t.L + 2 * pad) + ' ' + (t.W + 2 * pad) + '" font-family="Segoe UI, Arial, sans-serif"><defs><pattern id="cWc" width="' + (1.4 * k) + '" height="' + (1.4 * k) + '" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)"><line x1="0" y1="0" x2="0" y2="' + (1.4 * k) + '" stroke="#9a9a9a" stroke-width="' + (0.12 * k) + '"/></pattern></defs>' +
			D.part(st, mat, { t: t.sig, x: 0, y: 0, a: t.L, b: t.W, q: 0, ba: 0 }, 0, 0, k, { uid: 'c', color: S.set.color || 'name', holes: 1 }) + '</svg>';
		var auto = P.grainAuto(st, t), stale = A.stale();
		var h = '<h3>' + esc((P.main(t) ? P.main(t) + ', ' : '') + t.name) + '</h3><div class="info">' + esc(info.join(' · ')) + '</div><div class="prev">' + prev + '</div>';
		if (!t.pos || !t.des) h += '<div class="note warn">У детали не заполнено: ' + (!t.pos && !t.des ? '«Поз.» и «Обозначение»' : (!t.pos ? '«Поз.»' : '«Обозначение»')) + '. Заполните в БАЗИСе и выгрузите проект заново.</div>';
		if (rc) {
			h += '<div class="btns"><span class="mute">Лист ' + (S.si + 1) + (rc.q ? ', повёрнута на ' + rc.q * 90 + '°' : '') + '</span>';
			var lay = A.lay(), opts = '<option value="">На другой лист…</option>';
			lay.sheets.forEach(function (s2, n) { if (n !== S.si) opts += '<option value="' + n + '">лист ' + (n + 1) + ' (' + P.num(P.sheetStat(st, mat, s2).fill, 0) + ' %)</option>'; });
			opts += '<option value="-1">новый лист</option>';
			h += '<select id="cMove"' + (stale ? ' disabled' : '') + '>' + opts + '</select>';
			h += '<button id="cBuf"' + (stale ? ' disabled' : '') + ' title="Снять деталь с листа в буфер — потом положите её сами">В буфер</button></div>';
		}
		h += '<div class="frm"><label>Текстура</label><select id="cTex"' + (mat.cfg.grain ? '' : ' disabled title="У материала текстура выключена — детали можно поворачивать"') + '>' + TEX.map(function (x) { return '<option value="' + x[0] + '"' + ((tw.tex || 'a') === x[0] ? ' selected' : '') + '>' + x[1] + (x[0] === 'a' ? ' (' + TEXS[auto] + ')' : '') + '</option>'; }).join('') + '</select>' +
			 '<label title="Детали с одним номером группы кладутся рядом, одним блоком — чтобы совпал рисунок">Группа</label><input id="cGrp" type="number" min="0" max="99" value="' + (tw.grp > 0 ? tw.grp : '') + '" placeholder="нет">' +
			 '<label>Материал</label><select id="cMat">' + st.mats.filter(function (m) { return Math.abs(m.th - t.th) < 0.01 || m.key === t.mat || m.key === t.mat0; }).map(function (m) { return '<option value="' + esc(m.key) + '"' + (m.key === t.mat ? ' selected' : '') + '>' + esc(P.matTitle(m)) + (m.key === t.mat0 ? '' : ' *') + '</option>'; }).join('') + '</select>' +
			 '<label title="Сколько штук в одном комплекте">Количество</label><input id="cQty" type="number" min="0" max="999" value="' + P.baseCount(st, t) + '">' +
			 '</div><div class="btns"><button id="cOff">' + (tw.off ? 'Вернуть в раскрой' : 'Исключить из раскроя') + '</button>' +
			 ((tw.qty !== undefined && tw.qty !== null) || tw.mat || tw.tex || tw.grp || tw.off ? '<button id="cReset" class="link">сбросить правки детали</button>' : '') + '</div>';
		el.innerHTML = h;

		function edit(fn) { A.pushUndo(); fn(P.tw(st, t.sig, true)); S.sel = -1; A.afterChange(true); }
		if ($('cBuf')) $('cBuf').onclick = function () {
			A.pushUndo();
			var why = P.toBuffer(st, mat.key, S.si, S.sel);
			if (why) { S.undo.pop(); U.toast('Убрать в буфер нельзя: ' + why + '.'); return; }
			S.sel = -1; A.afterChange();
		};
		if ($('cMove')) $('cMove').onchange = function () {
			if (this.value === '') return;
			A.pushUndo();
			var why = P.moveToSheet(st, mat.key, S.si, S.sel, Number(this.value));
			if (why) { S.undo.pop(); U.toast('Перенести нельзя: ' + why + '.'); this.value = ''; return; }
			S.sel = -1; A.afterChange();
		};
		$('cTex').onchange = function () { var v = this.value; edit(function (o) { if (v === 'a') delete o.tex; else o.tex = v; }); };
		$('cGrp').onchange = function () { var v = Math.max(0, Math.min(99, Math.round(Number(this.value) || 0))); edit(function (o) { if (v) o.grp = v; else delete o.grp; }); };
		$('cMat').onchange = function () { var v = this.value; edit(function (o) { if (v === t.mat0) delete o.mat; else o.mat = v; }); S.selType = t.sig; };
		$('cQty').onchange = function () { var v = Math.max(0, Math.min(999, Math.round(Number(this.value) || 0))), nat = st.work.scope === 'sel' ? t.cntSel : t.cnt; edit(function (o) { if (v === nat) delete o.qty; else o.qty = v; }); };
		$('cOff').onclick = function () { edit(function (o) { if (o.off) delete o.off; else o.off = 1; }); };
		if ($('cReset')) $('cReset').onclick = function () { A.pushUndo(); delete st.work.parts[t.sig]; S.sel = -1; A.afterChange(true); };
	}

	/* --------------------------------- поиск ---------------------------------- */
	function search(q) {
		var A = window.App, S = A.S, st = S.st, out = [], box = $('searchRes');
		q = q.trim().toLowerCase();
		if (!q || !st) { box.classList.remove('open'); box.innerHTML = ''; return; }
		st.mats.forEach(function (m) {
			var lay = m.cfg.on ? st.work.layout[m.key] : null, where = {};
			if (lay) lay.sheets.forEach(function (s2, n) { s2.recs.forEach(function (rc, i) { if (!where[rc.t]) where[rc.t] = []; where[rc.t].push([n, i]); }); });
			m.types.forEach(function (t) {
				if (!P.baseCount(st, t)) return;
				var hay = (t.pos + ' ' + t.des + ' ' + t.name + ' ' + P.dim(t.L) + 'x' + P.dim(t.W) + ' ' + P.dim(t.L) + '×' + P.dim(t.W) + ' ' + P.dim(t.L) + ' ' + P.dim(t.W)).toLowerCase();
				if (hay.indexOf(q.replace(/[хx*]/g, 'x')) < 0 && hay.indexOf(q) < 0) return;
				var w = where[t.sig] || [];
				if (!w.length) out.push({ t: t, m: m, s: -1, i: -1 });
				else { var seen = {}; w.forEach(function (x) { if (!seen[x[0]]) { seen[x[0]] = 1; out.push({ t: t, m: m, s: x[0], i: x[1] }); } }); }
			});
		});
		box.innerHTML = out.slice(0, 60).map(function (r, n) {
			return '<div data-n="' + n + '">' + esc((P.main(r.t) ? P.main(r.t) + ' ' : '') + r.t.name) + ' <i>' + P.dim(r.t.L) + '×' + P.dim(r.t.W) + '</i><i>' + (r.s >= 0 ? 'лист ' + (r.s + 1) : 'не уложена') + (r.m.key !== S.matKey ? ' · ' + esc(P.matTitle(r.m)) : '') + '</i></div>';
		}).join('') || '<div class="mute">Ничего не найдено</div>';
		box.classList.add('open');
		box.onclick = function (e) {
			var d = e.target.closest('div[data-n]'); if (!d) return;
			var r = out[Number(d.dataset.n)];
			S.matKey = r.m.key; S.selType = r.t.sig; S.view = 'sheet';
			if (r.s >= 0) { S.si = r.s; S.sel = r.i; S.listMode = 'sheet'; } else { S.sel = -1; S.listMode = 'mat'; }
			box.classList.remove('open'); $('iSearch').value = '';
			A.render();
		};
	}

	Pn.init = function () {
		$('matList').onclick = function (e) {
			var d = e.target.closest('.mat'); if (!d) return;
			var S = window.App.S;
			if (S.matKey === d.dataset.k) return;
			S.matKey = d.dataset.k; S.si = 0; S.sel = -1; S.selType = '';
			window.App.render(); window.App.nestCheck();
		};
		$('matList').ondblclick = function (e) { if (e.target.closest('.mat')) window.Dlg.materials(); };
		$('thumbs').onclick = function (e) {
			var d = e.target.closest('.thumb'); if (!d) return;
			var A = window.App, S = A.S;
			if (d.classList.contains('add')) {
				if (A.stale()) return;
				A.pushUndo();
				var n = P.addBlankSheet(S.st, S.matKey);
				if (n < 0) { S.undo.pop(); return; }
				S.si = n; S.sel = -1; S.view = 'sheet';
				A.afterChange();
				return;
			}
			S.si = Number(d.dataset.i); S.sel = -1; S.view = 'sheet';
			A.render();
		};
		$('bufBox').addEventListener('pointerdown', function (e) {
			var b = e.target.closest ? e.target.closest('.bit') : null;
			if (b) window.MapView.bufDragStart(e, Number(b.dataset.i));
		});
		$('bufBox').addEventListener('click', function (e) {
			if (e.target.closest && e.target.closest('#bStrip')) { window.MapView.stripSheet(); return; }
			if (!e.target.closest || !e.target.closest('#bBufPlace')) return;
			var A = window.App, S = A.S, mat = A.mat();
			if (!mat || A.stale()) return;
			A.pushUndo();
			var r = P.placeBuffer(S.st, mat.key);
			if (!r.placed) { S.undo.pop(); window.UI.toast('Разложить не удалось: детали из буфера не помещаются на лист этого формата.'); return; }
			S.sel = -1;
			A.afterChange();
			window.UI.toast('Из буфера уложено деталей: ' + r.placed + (r.sheets ? ', новых листов: ' + r.sheets : '') + (r.left ? '. В буфере осталось: ' + r.left : '') + '.');
		});
		$('listMode').onclick = function (e) { var b = e.target.closest('button'); if (!b) return; window.App.S.listMode = b.dataset.m; Pn.right(); };
		$('partList').onclick = function (e) {
			var tr = e.target.closest('tr[data-t]'); if (!tr) return;
			var A = window.App, S = A.S, sh = A.sheet();
			S.selType = tr.dataset.t; S.sel = -1;
			if (sh) for (var i = 0; i < sh.recs.length; i++) if (sh.recs[i].t === S.selType) { S.sel = i; break; }
			window.MapView.mark(); Pn.right();
		};
		$('remBox').addEventListener('change', function (e) {
			var row = e.target.closest('.row[data-i]'); if (!row) return;
			var A = window.App, mat = A.mat(), i = Number(row.dataset.i), r = mat.cfg.rem[i];
			var L = Math.round(Number(row.querySelector('.L').value) || 0), W = Math.round(Number(row.querySelector('.W').value) || 0), n = Math.max(1, Math.min(99, Math.round(Number(row.querySelector('.n').value) || 1)));
			if (!(L >= 100) || !(W >= 100)) { U.toast('Размер остатка — не меньше 100 мм.'); Pn.left(); return; }
			A.pushUndo(); r.L = Math.max(L, W); r.W = Math.min(L, W); r.n = n; A.afterChange();
		});
		$('remBox').addEventListener('click', function (e) {
			var A = window.App, mat = A.mat();
			if (!mat) return;
			if (e.target.id === 'bRemAdd') { A.pushUndo(); mat.cfg.rem.push({ L: 1200, W: 600, n: 1 }); A.afterChange(); }
			else if (e.target.classList.contains('del')) { A.pushUndo(); mat.cfg.rem.splice(Number(e.target.closest('.row').dataset.i), 1); A.afterChange(); }
		});
		var si = $('iSearch');
		si.oninput = function () { search(si.value); };
		si.onfocus = function () { if (si.value) search(si.value); };
		si.onkeydown = function (e) { if (e.key === 'Escape') { si.value = ''; search(''); si.blur(); } else if (e.key === 'Enter') { var f = $('searchRes').querySelector('div[data-n]'); if (f) f.click(); } };
		document.addEventListener('mousedown', function (e) { if (!e.target.closest('.searchWrap')) $('searchRes').classList.remove('open'); });
	};
})();
