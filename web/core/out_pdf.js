/* STHGroup — документ раскроя для печати в PDF (HTML, альбомный А4).
   Оформление — «чертёж со штампом»: рамка и штамп на каждой странице. Высоты
   блоков считаются, а не меряются, поэтому строки таблиц фиксированной высоты. */
(function (G) {
	'use strict';
	var BM = G.BM = G.BM || {};
	var O = BM.out = BM.out || {};
	var P = BM.project, D = BM.draw, esc = D.esc, n1 = D.n1, textW = D.textW;

	var PG = { W: 273, H: 188, PAD: 3.5, TOP: 3, HEAD: 8, STAMP: 12.5, GAP: 4 };
	var ROW1 = 5.45, ROW2 = 7.75, ROWP = 4.45, ROWH = 5.4, EM = 8 * 0.3528;
	function bodyTop() { return PG.TOP + PG.HEAD; }
	function bodyH() { return PG.H - PG.STAMP - 2.5 - bodyTop(); }
	function bodyW() { return PG.W - 2 * PG.PAD; }
	function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

	O.PDF_CSS = [
		'@page{size:A4 landscape;margin:10mm 12mm}', 'html,body{margin:0;padding:0;background:#fff}',
		'#cutPrint{font-family:' + D.FONT + ';color:#000;width:273mm;margin:0 auto}',
		'.cPg{position:relative;width:273mm;height:188mm;border:0.4mm solid #000;overflow:hidden;box-sizing:border-box;page-break-inside:avoid}',
		'.cPg + .cPg{page-break-before:always}',
		'.cAbs{position:absolute}', '.cAbs svg{display:block}',
		'.cHead{position:absolute;left:3.5mm;right:3.5mm;top:3mm;height:7mm;line-height:6mm;font-size:12pt;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
		'.cHead span{font-weight:400;font-size:9.5pt;margin-left:4mm}',
		'.cLeg{font-size:7.5pt;line-height:3.3mm;color:#222}',
		'.cSub{font-size:9.5pt;font-weight:700;line-height:4.4mm;height:8.8mm;overflow:hidden}', '.cSub3{height:13.2mm}',
		'.cSub div{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}', '.cSub div.i{font-weight:400;font-size:8.5pt}',
		'.cSub1{font-size:10pt;font-weight:700;line-height:5mm;height:6mm;white-space:nowrap;overflow:hidden}',
		'.cGap{height:4mm;font-size:0;line-height:0}',
		'table.ct{border-collapse:collapse;table-layout:fixed}',
		'table.ct th,table.ct td{border:0.2mm solid #000;padding:0.45mm 1.2mm;font-size:8pt;line-height:3.3mm;text-align:left;vertical-align:top;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
		'table.ct th{font-weight:700;font-size:7.5pt;border-bottom:0.45mm solid #000;padding:0.8mm 0.8mm;text-overflow:clip}',
		'table.ct .r{text-align:right}', 'table.ct .c{text-align:center}', 'table.ct .b{font-weight:700}',
		'table.ct th.e,table.ct td.e{padding-left:0;padding-right:0;text-align:center}',
		'table.ct td.sz{color:#333}',
		'.cBl{color:#444}',
		'.eN{display:inline-block;vertical-align:top;width:10.5mm;text-align:center}', '.eN svg{display:block}',
		'table.cKv{border-collapse:collapse}',
		'table.cKv td{border:0.2mm solid #000;padding:0.8mm 3mm 1mm 2mm;vertical-align:top;white-space:nowrap}',
		'table.cKv i,table.cSt i{display:block;font-style:normal;font-size:6.5pt;line-height:2.8mm;color:#333}',
		'table.cKv b{display:block;font-size:10.5pt;line-height:4.8mm;font-weight:700}',
		'table.cSt{position:absolute;left:-0.4mm;bottom:-0.4mm;width:273mm;height:12.5mm;border-collapse:collapse;table-layout:fixed}',
		'table.cSt td{box-sizing:border-box;border:0.4mm solid #000;padding:0.9mm 1.8mm 0 1.8mm;vertical-align:top;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
		'table.cSt b{display:block;font-size:9pt;line-height:4.6mm;font-weight:700;overflow:hidden;text-overflow:ellipsis}',
		'table.cSt td.w b{font-size:8pt;line-height:3.4mm}',
		'table.cSt td.g{text-align:center;padding-left:0.5mm;padding-right:0.5mm}', 'table.cSt td.g b{font-size:15pt;line-height:6.2mm}',
		'.cWarn{font-size:8.5pt;font-weight:700;line-height:3.6mm;height:7.2mm;overflow:hidden;border:0.3mm solid #000;padding:0.8mm 2mm;box-sizing:content-box}',
		'*{-webkit-print-color-adjust:exact;print-color-adjust:exact}'
	].join('\n');

	var EDGE_ON = '<svg xmlns="http://www.w3.org/2000/svg" version="1.1" width="10.5mm" height="0.5mm" viewBox="0 0 105 5"><line x1="0" y1="2.5" x2="105" y2="2.5" stroke="#000" stroke-width="1"/></svg>';
	var EDGE_OFF = '<svg xmlns="http://www.w3.org/2000/svg" version="1.1" width="10.5mm" height="0.5mm" viewBox="0 0 105 5"></svg>';
	/* Размер с кромкой, как в таблицах БАЗИСа: линия над числом — закромлена одна сторона, над и под — обе. */
	function dimCell(v, n) { return '<span class="eN">' + (n >= 1 ? EDGE_ON : EDGE_OFF) + P.dim(v) + (n >= 2 ? EDGE_ON : EDGE_OFF) + '</span>'; }
	function blankText(l, w, a) { return 'заготовка ' + P.dim(l + 2 * a) + ' × ' + P.dim(w + 2 * a); }

	function tableOpen(b) {
		var s = '<table class="ct" style="width:' + n1(b.w) + 'mm"><colgroup>';
		for (var i = 0; i < b.cols.length; i++) s += '<col style="width:' + n1(b.cols[i]) + 'mm">';
		return s + '</colgroup><thead><tr>' + b.head + '</tr></thead><tbody>';
	}
	/* Раскладка блоков сверху вниз по колонкам высотой H мм: { h, html } — неделимый кусок;
	   keep — заголовок, не остаётся внизу один; { table, w, cols, head, hh, rows } — таблица,
	   рвётся между строками, шапка повторяется. */
	function stack(blocks, H) {
		var cols = [], cur = [], y = 0, i, j;
		function flush() { cols.push(cur.join('\n')); cur = []; y = 0; }
		for (i = 0; i < blocks.length; i++) {
			var b = blocks[i];
			if (!b.table) {
				var need = b.h;
				if (b.keep) {
					var q = i + 1;
					while (blocks[q] && !blocks[q].table && blocks[q].keep) { need += blocks[q].h; q++; }
					if (blocks[q] && blocks[q].table) need += blocks[q].hh + (blocks[q].rows.length ? blocks[q].rows[0].h : 0);
				}
				if (y > 0 && y + need > H) flush();
				if (y === 0 && b.skipTop) continue;
				cur.push(b.html); y += b.h;
				continue;
			}
			j = 0;
			while (j < b.rows.length) {
				if (y > 0 && y + b.hh + b.rows[j].h > H) flush();
				var part = [], used = b.hh;
				while (j < b.rows.length && (y + used + b.rows[j].h <= H || !part.length)) { part.push(b.rows[j].html); used += b.rows[j].h; j++; }
				cur.push(tableOpen(b) + part.join('\n') + '</tbody></table>');
				y += used;
				if (j < b.rows.length) flush();
			}
		}
		if (cur.length) flush();
		return cols;
	}
	function plainBlock(cols, head, align, data) {
		var w = 0, i, j, th = '', rows = [];
		for (i = 0; i < cols.length; i++) { w += cols[i]; th += '<th' + (align[i] ? ' class="' + align[i] + '"' : '') + '>' + head[i] + '</th>'; }
		for (i = 0; i < data.length; i++) {
			var tr = '<tr>';
			for (j = 0; j < cols.length; j++) tr += '<td' + (align[j] ? ' class="' + align[j] + '"' : '') + '>' + esc(data[i][j]) + '</td>';
			rows.push({ h: ROWP, html: tr + '</tr>' });
		}
		return { table: 1, w: w, cols: cols, head: th, hh: ROWH, rows: rows };
	}
	function sub(t) { return { h: 6, keep: 1, html: '<div class="cSub1">' + esc(t) + '</div>' }; }
	function sub2(t, info, w) {
		var ln = D.wrap2(t, w / (9.5 * 0.3528 * 1.08)), two = ln.length > 1;
		return { h: two ? 13.8 : 9.4, keep: 1, html: '<div class="cSub' + (two ? ' cSub3' : '') + '" style="width:' + n1(w) + 'mm"><div>' + esc(ln[0]) + '</div>' + (two ? '<div>' + esc(ln[1]) + '</div>' : '') + '<div class="i">' + esc(info) + '</div></div>' };
	}
	function gap() { return { h: 4, skipTop: 1, html: '<div class="cGap"></div>' }; }
	function at(x, y, html, cls, w) { return '<div class="cAbs' + (cls ? ' ' + cls : '') + '" style="left:' + n1(x) + 'mm;top:' + n1(y) + 'mm' + (w ? ';width:' + n1(w) + 'mm' : '') + '">' + html + '</div>'; }

	var TOK_PAGE = '@@PG@@', TOK_PAGES = '@@PGS@@';
	function dateText() { var d = new Date(); function z(n) { return (n < 10 ? '0' : '') + n; } return z(d.getDate()) + '.' + z(d.getMonth() + 1) + '.' + d.getFullYear(); }

	O.pdfHtml = function (st, opt) {
		opt = opt || {};
		var set = st.set, cfg = set.pdf || {}, color = opt.color !== undefined ? opt.color : cfg.color, big = opt.big !== undefined ? opt.big : cfg.big;
		var want = { summary: opt.summary !== undefined ? opt.summary : cfg.summary, maps: opt.maps !== undefined ? opt.maps : cfg.maps, list: opt.list !== undefined ? opt.list : cfg.list, offcuts: opt.offcuts !== undefined ? opt.offcuts : cfg.offcuts };
		var cmode = color ? (set.color && set.color !== 'none' ? set.color : 'name') : 'none';
		var sm = P.summary(st), pages = [], uid = 0, i, j, p = st.work.params;
		var title = BM.project.modelName(st.model) || 'Модель', order = st.model.order || '', note = st.model.note ? 'Примечание: ' + st.model.note : '';

		function stamp(f) {
			var cells = [
				{ w: 22, l: 'Заказ', v: order }, { w: 42, l: 'Модель', v: title, two: 1 }, { w: 51, l: 'Материал', v: f.mat, two: 1 },
				{ w: 25, l: 'Формат, мм', v: f.fmt }, { w: 19, l: 'Лист раскроя', v: f.sheet }, { w: 14, l: 'Деталей', v: f.parts }, { w: 18, l: 'Заполнение', v: f.fill },
				{ w: 23, l: 'Дата', v: dateText() }, { w: 36, l: set.org ? 'Организация' : 'Составил', v: set.org ? (set.org + (set.author ? ' / ' + set.author : '')) : set.author, two: 1 },
				{ w: 11, l: 'Стр.', v: TOK_PAGE, cls: 'g' }, { w: 12, l: 'Всего', v: TOK_PAGES, cls: 'g' }
			], s = '<table class="cSt"><tr>';
			for (var c = 0; c < cells.length; c++) {
				var ce = cells[c], v = (ce.v === '' || ce.v === undefined || ce.v === null) ? '—' : String(ce.v), inner;
				if (ce.two) { var ln = D.wrap2(v, (ce.w - 3.8) / (EM * 1.08)); inner = esc(ln[0]) + (ln.length > 1 ? '<br>' + esc(ln[1]) : ''); }
				else inner = esc(v);
				s += '<td' + (ce.two ? ' class="w"' : (ce.cls ? ' class="' + ce.cls + '"' : '')) + ' style="width:' + ce.w + 'mm"><i>' + ce.l + '</i><b>' + inner + '</b></td>';
			}
			return s + '</tr></table>';
		}
		function page(head, subt, body, st2) { subt = [subt, note].filter(Boolean).join(' · '); return '<div class="cPg"><div class="cHead">' + esc(head) + (subt ? '<span>' + esc(subt) + '</span>' : '') + '</div>' + body + stamp(st2) + '</div>'; }
		function colPages(cols, colW, head, subt, st2) {
			var per = Math.max(1, Math.floor((bodyW() + PG.GAP) / (colW + PG.GAP))), out = [];
			for (var c0 = 0; c0 < cols.length; c0 += per) {
				var body = '';
				for (var c = 0; c < per && c0 + c < cols.length; c++) body += at(PG.PAD + c * (colW + PG.GAP), bodyTop(), cols[c0 + c], '', colW);
				out.push(page(head, subt, body, st2));
			}
			return out;
		}
		function machTitle(m) { return 'ФРС, рез ' + P.dim(p.kerf) + ' мм'; }
		function posCell(t) { return '<td class="b"' + (cmode !== 'none' ? ' style="background:' + P.colorOf(st, t, cmode) + '"' : '') + '>' + esc(t.pos) + '</td>'; }

		/* ширины колонок таблицы деталей — одни на весь документ */
		var mp = 0, md = 0, mn = 0;
		for (i = 0; i < st.types.length; i++) {
			var t0 = st.types[i];
			if (!P.count(st, t0)) continue;
			mp = Math.max(mp, textW(t0.pos, true)); md = Math.max(md, textW(t0.des, true)); mn = Math.max(mn, textW(t0.name));
			if (t0.shape.curve) mn = Math.max(mn, textW(blankText(t0.L, t0.W, p.allow)));
		}
		var C = { pos: Math.round(clamp(mp * EM + 3, 10, 18) * 2) / 2, des: Math.round(clamp(md * EM + 3, 13, 36) * 2) / 2, name: Math.round(clamp(mn * EM + 3, 22, 34) * 2) / 2, len: 12.5, wid: 12.5, qty: 8 };
		C.total = C.pos + C.des + C.name + C.len + C.wid + C.qty;
		var CB = { pos: C.pos, des: C.des, size: 24, qty: 8 };
		CB.total = CB.pos + CB.des + CB.size + CB.qty;

		function partsBlock(rows) {
			var cap = (C.name - 2.6) / EM, out = [];
			for (var r = 0; r < rows.length; r++) {
				var R = rows[r], t = R.t, ec = P.edgeCount(R.shape || t.shape), nm = D.wrap2(t.name, cap), line2 = nm.length > 1 ? esc(nm[1]) : '';
				if (R.ba > 0) { nm = [D.clip(t.name, cap)]; line2 = '<span class="cBl">' + esc(blankText(t.L, t.W, R.ba)) + '</span>'; }
				out.push({ h: line2 ? ROW2 : ROW1, html: '<tr>' + posCell(t) + '<td class="b">' + esc(t.des) + '</td><td>' + esc(nm[0]) + (line2 ? '<br>' + line2 : '') + '</td><td class="e">' + dimCell(t.sL || t.L, ec.len) + '</td><td class="e">' + dimCell(t.sW || t.W, ec.wid) + '</td><td class="r">' + R.n + '</td></tr>' });
			}
			return { table: 1, w: C.total, hh: ROWH, rows: out, cols: [C.pos, C.des, C.name, C.len, C.wid, C.qty], head: '<th>Поз.</th><th>Обозн.</th><th>Название</th><th class="e">Длина</th><th class="e">Ширина</th><th class="r">Шт</th>' };
		}
		function indexBlock(rows) {
			var out = [];
			for (var r = 0; r < rows.length; r++) {
				var t = rows[r].t;
				out.push({ h: ROWP, html: '<tr>' + posCell(t) + '<td class="b">' + esc(t.des) + '</td><td class="sz">' + P.dim(t.sL || t.L) + ' × ' + P.dim(t.sW || t.W) + '</td><td class="r">' + rows[r].n + '</td></tr>' });
			}
			return { table: 1, w: CB.total, hh: ROWH, rows: out, cols: [CB.pos, CB.des, CB.size, CB.qty], head: '<th>Поз.</th><th>Обозн.</th><th>Размер</th><th class="r">Шт</th>' };
		}

		var nested = [], loose = [];
		for (i = 0; i < sm.mats.length; i++) (sm.mats[i].on && sm.mats[i].sheets ? nested : (sm.mats[i].on ? [] : loose)).push(sm.mats[i]);

		/* ---- сводка ---- */
		if (want.summary) {
			var blocks = [], BW = bodyW(), mnm = 0, buy = [], stat = [], anySaw = false, nCurve = 0, nNoShape = 0, nBlank = 0, lost = [], cutN = 0, cutL = 0, setN = 0;
			for (i = 0; i < sm.mats.length; i++) mnm = Math.max(mnm, textW(P.matTitle(sm.mats[i].mat)));
			var nameW = Math.round(clamp(mnm * EM + 3, 50, 104));
			for (i = 0; i < nested.length; i++) {
				var R = nested[i], m = R.mat, f = P.fmtOf(m), lay = st.work.layout[m.key];
				anySaw = true;
				for (j = 0; j < lay.sheets.length; j++) { cutN += lay.sheets[j].cutsN || 0; setN += lay.sheets[j].setups || 0; }
				for (j = 0; j < m.types.length; j++) {
					var c = P.count(st, m.types[j]);
					if (!c) continue;
					if (m.types[j].shape.curve) { nCurve += c; if (!m.types[j].shape.ok) nNoShape += c; nBlank += c; }
				}
				for (j = 0; j < lay.unplaced.length; j++) { var ut = st.typeBy[lay.unplaced[j].t]; if (ut) lost.push((P.main(ut) ? P.main(ut) + ' ' : '') + ut.name + ' ' + P.dim(ut.L) + '×' + P.dim(ut.W)); }
				buy.push([P.matTitle(m), P.dim(f.L) + ' × ' + P.dim(f.W), P.dim(m.th), 'ФРС', R.std, R.rem || '—', R.placed, P.num(R.fill, 1) + ' %']);
				stat.push([P.matTitle(m), P.num(R.gab / 1e6, 2), P.num(R.bought / 1e6, 2), P.num((R.bought - R.area) / 1e6, 2), P.num(R.saw / 1000, 2), R.rot, R.turned]);
			}
			blocks.push(sub('Закупка плит'));
			blocks.push(plainBlock([nameW, 24, 12, 44, 14, 17, 16, 21], ['Материал', 'Плита, мм', 'Толщ.', 'Станок', 'Листов', 'Остатков', 'Деталей', 'Заполнение'], ['', '', 'r', '', 'r', 'r', 'r', 'r'], buy));
			blocks.push(gap());
			var kv = function (l, v) { return '<td><i>' + l + '</i><b>' + v + '</b></td>'; };
			blocks.push({ h: 9.5, html: '<table class="cKv"><tr>' + kv('Листов всего', sm.sheets) + kv('Деталей уложено', sm.placed) + (st.work.sets > 1 ? kv('Комплектов', st.work.sets) : '') +
				(anySaw ? kv('Рез пилы (ФРС)', P.dim(p.kerf) + ' мм') : '')+ (cutN ? kv('Резов', cutN) + kv('Установов', setN) : '') + (nCurve ? kv('Криволинейных деталей', nCurve) : '') +
				(p.cut && p.cut.pkg > 1 ? kv('Плит в пакете', p.cut.pkg) + kv('Циклов реза', sm.cycles) : '') + (p.cut && p.cut.price > 0 ? kv('Стоимость плит', P.num(sm.cost, 0) + ' р.') : '') + (nBlank ? kv('Припуск на упил', P.dim(p.allow) + ' мм') : '') + kv('Обрезка краёв', P.dim(p.margin) + ' мм') + '</tr></table>' });
			blocks.push(gap());
			blocks.push(sub('Статистика'));
			blocks.push(plainBlock([nameW, 21, 25, 22, 15, 28, 34], ['Материал', 'Детали, м²', 'Закуплено, м²', 'Остаток, м²', 'Рез, м', 'Поворотов листа', 'Деталей с поворотом'], ['', 'r', 'r', 'r', 'r', 'r', 'r'], stat));
			if (p.cut && p.cut.areaAnalysis) blocks.push({ h: 7.4, html: '<div class="cLeg" style="width:' + n1(BW - 5) + 'mm">' + esc('Анализ площадей: куплено ' + P.num(sm.boughtArea / 1e6, 2) + ' м²; в деталях ' + P.num(sm.partsArea / 1e6, 2) + ' м² (' + P.num(sm.boughtArea ? sm.partsArea / sm.boughtArea * 100 : 0, 1) + ' %); деловые обрезки ' + P.num(sm.offArea / 1e6, 2) + ' м²; отходы ' + P.num(Math.max(0, sm.boughtArea - sm.partsArea - sm.offArea) / 1e6, 2) + ' м².') + '</div>' }), blocks.push(gap());
			var leg = '«Заполнение» — по настоящей площади деталей; «Детали, м²» — по габариту.';
			if (nBlank) leg += ' На ФРС криволинейная деталь занимает заготовку: габарит плюс припуск на упил с каждой стороны.';
			if (st.work.scope === 'sel') leg += ' В раскрой взяты только выделенные в БАЗИСе детали.';
			blocks.push({ h: 7.4, html: '<div class="cLeg" style="width:' + n1(BW - 5) + 'mm">' + esc(leg) + '</div>' });
			blocks.push(gap());
			var warn = function (txt) { blocks.push({ h: 9.5, html: '<div class="cWarn" style="width:' + n1(BW - 5) + 'mm">' + esc(txt) + '</div>' }); blocks.push(gap()); };
			if (lost.length) warn('Не уложено деталей: ' + lost.length + ' (не входят в формат листа) — ' + lost.slice(0, 14).join('; ') + (lost.length > 14 ? '; …' : ''));
			if (sm.noPos) warn('Деталей без позиции или обозначения: ' + sm.noPos + '. На картах и в таблицах они показаны как есть — проверьте их по названию и размеру.');
			if (nNoShape) { var why = []; for (var wk in st.shapeStat.why) if (st.shapeStat.why.hasOwnProperty(wk)) why.push(wk); warn('У криволинейных деталей (' + nNoShape + ' шт.) не удалось прочитать форму контура' + (why.length ? ' (' + why.join('; ') + ')' : '') + ' — они показаны и уложены по габариту.'); }

			var et = P.edgeTotals(st);
			if (et.length) {
				var ed = [], en = 0;
				for (i = 0; i < et.length; i++) { en = Math.max(en, textW(et[i].name)); ed.push([i + 1, et[i].name, et[i].th ? P.dim(et[i].th) : '—', P.num(et[i].len / 1000, 2)]); }
				blocks.push(sub('Кромка'));
				blocks.push(plainBlock([10, Math.round(clamp(en * EM + 3, 50, BW - 10 - 18 - 22)), 18, 22], ['№', 'Материал кромки', 'Толщ., мм', 'Длина, м'], ['r', '', 'r', 'r'], ed));
				blocks.push(gap());
			}
			if (loose.length) {
				var ld = [];
				for (i = 0; i < loose.length; i++) ld.push([P.matTitle(loose[i].mat), P.dim(loose[i].mat.th), loose[i].n, P.num(loose[i].gab / 1e6, 2) + ' кв.м']);
				blocks.push(sub('Материалы без раскроя'));
				blocks.push(plainBlock([Math.round(clamp(mnm * EM + 3, 50, BW - 12 - 16 - 26)), 12, 16, 26], ['Материал', 'Толщ.', 'Деталей', 'Количество'], ['', 'r', 'r', 'r'], ld));
			}
			var cols = stack(blocks, bodyH());
			for (i = 0; i < cols.length; i++) pages.push(page('Раскрой — ' + title, (order ? 'заказ ' + order + ', ' : '') + 'сводка' + (cols.length > 1 ? ', стр. ' + (i + 1) : ''), at(PG.PAD, bodyTop(), cols[i]), { mat: 'Сводка по раскрою' }));
		}

		/* ---- листы: карта и таблица ---- */
		if (want.maps) for (i = 0; i < nested.length; i++) {
			var mm = nested[i].mat, lay2 = st.work.layout[mm.key], nS = lay2.sheets.length;
			for (j = 0; j < nS; j++) {
				var sh = lay2.sheets[j], stt = P.sheetStat(st, mm, sh), rows = P.sheetRows(st, mm, sh), BW2 = bodyW(), BH = bodyH(), top = bodyTop(), q;
				var hasEdge = false, nBl = 0, blA = 0, nShape = 0, nTurn = 0, nDash = 0, nHole = 0;
				for (q = 0; q < rows.length; q++) {
					var rt = rows[q].t, sp = P.shapeFor(st, rt, mm);
					rows[q].shape = sp;
					if (sp.edges.length) hasEdge = true;
					if (rows[q].ba > 0) { nBl++; blA = rows[q].ba; if (!sp.pts) nDash++; }
					if (sp.pts) nShape++;
					if (sp.innerPts.length) nHole++;
				}
				for (q = 0; q < sh.recs.length; q++) { var rq = st.typeBy[sh.recs[q].t]; if (rq && P.shapeFor(st, rq, mm).pts && sh.recs[q].q) nTurn++; }
				var ttl = P.matTitle(mm);
				var subt = 'лист раскроя ' + (j + 1) + ' из ' + nS + (sh.rem ? ' (остаток)' : '') + ' — ' + machTitle(mm) + ', поворотов листа: ' + (sh.rot || 0) + ', резов: ' + (sh.cutsN || 0);
				var stp = { mat: ttl, fmt: P.dim(sh.L) + ' × ' + P.dim(sh.W), sheet: (j + 1) + ' из ' + nS, parts: sh.recs.length, fill: P.num(stt.fill, 1) + ' %' };
				var leg2 = 'На детали: позиция · обозначение, название, размер. ' + (hasEdge ? 'Штрих у стороны детали — кромка. ' : '') + 'Штриховка — обрезок, размеры в мм.' +
					((hasEdge && !big) ? ' В таблице линия над размером — кромка на одной стороне этой длины, над и под размером — на обеих.' : '');
				if (nBl) leg2 += ' Криволинейная деталь: прямоугольник — заготовка с припуском на упил ' + P.dim(blA) + ' мм с каждой стороны, контур внутри — форма детали, штриховка внутри заготовки — отход.';
				if (nDash) leg2 += ' Пунктир — габарит детали, форму которой прочитать не удалось.';
				if (nTurn) leg2 += ' ↻ — на сколько градусов деталь повёрнута по часовой.';
				if (nHole) leg2 += ' Штриховка внутри детали — вырез.';
				var tw = big ? CB.total : C.total;
				var mapMax = BW2 - PG.GAP - tw - 0.8;
				var mw = function (maxH) { var w = mapMax, h = w * sh.W / sh.L; if (h > maxH) w = maxH * sh.L / sh.W; return w; };
				var mapW0 = mw(BH - 6.8 - 10.5);
				var legH = Math.max(3, Math.ceil(textW(leg2) * 7.5 * 0.3528 * 1.04 / mapW0)) * 3.3 + 0.6;
				var mapW = mw(BH - 6.8 - legH), mapH = mapW * sh.W / sh.L + 6.8;
				var tx = PG.W - PG.PAD - tw - 0.4;
				var blks2 = [big ? indexBlock(rows) : partsBlock(rows)], cc2 = p.cut || {};
				if (!big && cc2.showCuts !== 0 && sh.cuts && sh.cuts.length) {
					var cdata = sh.cuts.map(function (c, ci) {
						var cr = c.part >= 0 ? sh.recs[c.part] : null, ct = cr ? st.typeBy[cr.t] : null;
						return [ci + 1, c.setup, c.side === 'L' ? P.dim(c.size) : '', c.side === 'R' ? P.dim(c.size) : '', ct ? ((ct.pos ? (cc2.posPrefix || '') + ct.pos : '') || ct.name) + (c.side === 'L' ? ' ◂' : ' ▸') : 'полоса'];
					});
					var cw = [9, 10, 17, 17, Math.max(10, C.total - 53)];
					blks2.push(gap()); blks2.push(sub('Резы: порядок, установы, упоры'));
					blks2.push(plainBlock(cw, ['№', 'Уст.', 'Левый упор', 'Правый упор', 'Деталь'], ['r', 'r', 'r', 'r', ''], cdata));
				}
				var cols2 = stack(blks2, BH);
				var body = at(PG.PAD, top, D.sheet(st, mm, sh, { wmm: mapW, uid: ++uid, color: cmode, bw: !color, tex: (color && st.set.texMaps !== 0 && BM.base && BM.base.big) ? BM.base.big(mm.name) : null })) + at(PG.PAD, top + mapH + 0.8, esc(leg2), 'cLeg', mapW) + at(tx, top, cols2.length ? cols2[0] : '', '', tw);
				pages.push(page(ttl, subt, body, stp));
				if (cols2.length > 1) pages = pages.concat(colPages(cols2.slice(1), tw, ttl, subt + ' — таблица деталей, продолжение', stp));
			}
		}

		/* ---- общий список деталей ---- */
		if (want.list) {
			var lb = [], LW = C.total + 22, total = 0;
			for (i = 0; i < sm.mats.length; i++) {
				var M = sm.mats[i].mat, layL = st.work.layout[M.key], where = {}, rowsL = [];
				if (sm.mats[i].on && layL) for (j = 0; j < layL.sheets.length; j++) for (var z = 0; z < layL.sheets[j].recs.length; z++) { var sg = layL.sheets[j].recs[z].t; (where[sg] = where[sg] || {})[j + 1] = 1; }
				for (j = 0; j < M.types.length; j++) {
					var tt = M.types[j], cnt = P.count(st, tt);
					if (!cnt) continue;
					total += cnt;
					var sp2 = P.shapeFor(st, tt, M), ec = P.edgeCount(sp2), ws = where[tt.sig] ? Object.keys(where[tt.sig]).map(Number).sort(function (a, b) { return a - b; }).join(', ') : '—';
					var nm2 = D.clip(tt.name, (C.name - 2.6) / EM);
					rowsL.push({ h: ROW1, html: '<tr>' + posCell(tt) + '<td class="b">' + esc(tt.des) + '</td><td>' + esc(nm2) + '</td><td class="e">' + dimCell(tt.sL || tt.L, ec.len) + '</td><td class="e">' + dimCell(tt.sW || tt.W, ec.wid) + '</td><td class="r">' + cnt + '</td><td>' + esc(ws) + '</td></tr>' });
				}
				if (!rowsL.length) continue;
				if (lb.length) lb.push(gap());
				lb.push(sub2(P.matTitle(M), (sm.mats[i].on ? machTitle(M) + ', листов: ' + sm.mats[i].sheets : 'без раскроя') + ' — деталей: ' + sm.mats[i].n, LW));
				lb.push({ table: 1, w: LW, hh: ROWH, rows: rowsL, cols: [C.pos, C.des, C.name, C.len, C.wid, C.qty, 22], head: '<th>Поз.</th><th>Обозн.</th><th>Название</th><th class="e">Длина</th><th class="e">Ширина</th><th class="r">Шт</th><th>Листы</th>' });
			}
			if (lb.length) pages = pages.concat(colPages(stack(lb, bodyH()), LW, 'Список деталей — ' + title, 'все детали по материалам; «Листы» — на каких листах раскроя лежит деталь', { mat: 'Список деталей', parts: total }));
		}

		/* ---- деловые остатки ---- */
		if (want.offcuts) {
			var ob = [], OW = 14 + 30 + 22, nOff = 0;
			for (i = 0; i < nested.length; i++) {
				var MO = nested[i].mat, layO = st.work.layout[MO.key], data = [], sumA = 0;
				for (j = 0; j < layO.sheets.length; j++) {
					var offs = P.goodOffcuts(st, MO, layO.sheets[j]);
					for (var o2 = 0; o2 < offs.length; o2++) { var a = Math.max(offs[o2].w, offs[o2].h), b = Math.min(offs[o2].w, offs[o2].h); data.push([j + 1, P.dim(Math.floor(a + 0.01)) + ' × ' + P.dim(Math.floor(b + 0.01)), P.num(a * b / 1e6, 2)]); sumA += a * b; nOff++; }
				}
				if (!data.length) continue;
				if (ob.length) ob.push(gap());
				ob.push(sub2(P.matTitle(MO), 'кусков: ' + data.length + ', всего ' + P.num(sumA / 1e6, 2) + ' м²', OW));
				ob.push(plainBlock([14, 30, 22], ['Лист', 'Размер, мм', 'Площадь, м²'], ['r', '', 'r'], data));
			}
			if (ob.length) pages = pages.concat(colPages(stack(ob, bodyH()), OW, 'Деловые остатки — ' + title, 'обрезки не меньше ' + P.dim(set.offL) + ' × ' + P.dim(set.offW) + ' мм, по листам раскроя', { mat: 'Деловые остатки' }));
		}

		var html = pages.join('\n'), np = pages.length, k = 0;
		html = html.split(TOK_PAGES).join(String(np)).replace(new RegExp(TOK_PAGE, 'g'), function () { return String(++k); });
		return { pages: np, html: '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + esc('Раскрой — ' + title) + '</title><style>' + O.PDF_CSS + '</style></head><body><div id="cutPrint">' + html + '</div></body></html>' };
	};

	/* Кромка по материалам: длина с учётом количества деталей. */
	P.edgeTotals = function (st) {
		var by = {}, out = [];
		for (var i = 0; i < st.types.length; i++) {
			var t = st.types[i], n = P.count(st, t), mat = st.matBy[t.mat];
			if (!n || !mat || !mat.cfg.on) continue;
			for (var j = 0; j < t.shape.edges.length; j++) {
				var e = t.shape.edges[j], len = 0;
				for (var q = 0; q + 1 < e.line.length; q++) len += Math.sqrt(Math.pow(e.line[q + 1][0] - e.line[q][0], 2) + Math.pow(e.line[q + 1][1] - e.line[q][1], 2));
				var key = (e.mat || 'Кромка') + '|' + (e.th || 0);
				if (!by[key]) { by[key] = { name: e.mat || 'Кромка', th: e.th || 0, len: 0 }; out.push(by[key]); }
				by[key].len += len * n;
			}
		}
		out.sort(function (a, b) { return P.natCmp(a.name, b.name) || (a.th - b.th); });
		return out;
	};

	/* ===== Лист целиком в окне (1.13.0): рамка, шапка и штамп — как в PDF, но одной картинкой SVG ===== */
	var SH = { W: 273, H: 188, PAD: 3.5, TOP: 11, STAMP: 12.5 };
	function sDate() { var d = new Date(), p = function (v) { return (v < 10 ? '0' : '') + v; }; return p(d.getDate()) + '.' + p(d.getMonth() + 1) + '.' + d.getFullYear(); }
	/* ячейки штампа — те же, что у листов PDF карт присадки и деталировки */
	O.stampCells = function (st, doc, what, pn, total) {
		var set = st.set, title = BM.project.modelName(st.model) || '';
		return [
			{ w: 22, l: 'Заказ', v: st.model.order || '', two: 1 }, { w: 46, l: 'Модель', v: title, two: 1 }, { w: 40, l: 'Документ', v: doc, two: 1 }, { w: 83, l: 'Деталь', v: what, two: 1 },
			{ w: 23, l: 'Дата', v: sDate() }, { w: 36, l: set.org ? 'Организация' : 'Составил', v: set.org ? (set.org + (set.author ? ' / ' + set.author : '')) : set.author, two: 1 },
			{ w: 11, l: 'Стр.', v: pn, g: 1 }, { w: 12, l: 'Всего', v: total, g: 1 }
		];
	};
	function sw(t, fs, bold) { return (BM.drill && BM.drill.tw ? BM.drill.tw(t, bold) : String(t).length * 0.55) * fs; }
	/* Укоротить строку до ширины по словам: в окне шапка и штамп не обрезаются «…» — лишнее уходит в PDF-строку. */
	function fitFs(t, fs, w, bold, min) { while (fs > min && sw(t, fs, bold) > w) fs -= 0.1; return fs; }
	/* o: { head, sub, body: [{ x, y, svg: '<svg …>' }], cells, px } → '<svg …>' листа 273 × 188 мм */
	O.sheetSvg = function (o) {
		var E = D.esc, PT = 0.3528, g = [], W = SH.W, H = SH.H, f2 = function (v) { return String(Math.round(v * 100) / 100); };
		g.push('<rect x="0.2" y="0.2" width="' + (W - 0.4) + '" height="' + (H - 0.4) + '" fill="#fff" stroke="#000" stroke-width="0.4"/>');
		var hf = 12 * PT, sf = 9.5 * PT, hw = sw(o.head, hf, true), room = W - 2 * SH.PAD - hw - 4;
		g.push('<text x="' + SH.PAD + '" y="' + f2(3 + 4.8) + '" font-size="' + f2(hf) + '" font-weight="700">' + E(o.head) + '</text>');
		if (o.sub && room > 10) {
			/* не влезает строкой — две строки помельче; лишнее не обрезается, а ужимается */
			if (sw(o.sub, sf) <= room) g.push('<text x="' + f2(SH.PAD + hw + 4) + '" y="' + f2(3 + 4.8) + '" font-size="' + f2(sf) + '">' + E(o.sub) + '</text>');
			else {
				var f = 2.9, ws = o.sub.split(' '), l1 = '', k = 0;
				while (k < ws.length && sw((l1 ? l1 + ' ' : '') + ws[k], f) <= room) { l1 = (l1 ? l1 + ' ' : '') + ws[k]; k++; }
				var l2 = ws.slice(k).join(' '), f2s = fitFs(l2, f, room, false, 1.8);
				g.push('<text x="' + f2(SH.PAD + hw + 4) + '" y="5.4" font-size="' + f2(f) + '">' + E(l1) + '</text><text x="' + f2(SH.PAD + hw + 4) + '" y="8.9" font-size="' + f2(f2s) + '">' + E(l2) + '</text>');
			}
		}
		(o.body || []).forEach(function (b) { g.push(b.svg.replace(/^<svg /, '<svg x="' + f2(SH.PAD + b.x) + '" y="' + f2(SH.TOP + b.y) + '" ').replace(/ width="[^"]*" height="[^"]*"/, function () { return ' width="' + f2(b.w) + '" height="' + f2(b.h) + '"'; })); });
		/* штамп */
		var x = 0, y = H - SH.STAMP;
		g.push('<line x1="0" y1="' + f2(y) + '" x2="' + W + '" y2="' + f2(y) + '" stroke="#000" stroke-width="0.4"/>');
		(o.cells || []).forEach(function (c, i) {
			var v = (c.v === '' || c.v === undefined || c.v === null) ? '—' : String(c.v), cw = c.w - (i === o.cells.length - 1 ? 0 : 0);
			if (i) g.push('<line x1="' + f2(x) + '" y1="' + f2(y) + '" x2="' + f2(x) + '" y2="' + H + '" stroke="#000" stroke-width="0.4"/>');
			g.push('<text x="' + f2(c.g ? x + cw / 2 : x + 1.8) + '" y="' + f2(y + 0.9 + 2.2) + '" font-size="' + f2(6.5 * PT) + '" fill="#333"' + (c.g ? ' text-anchor="middle"' : '') + '>' + E(c.l) + '</text>');
			if (c.g) g.push('<text x="' + f2(x + cw / 2) + '" y="' + f2(y + 9.6) + '" font-size="' + f2(15 * PT) + '" font-weight="700" text-anchor="middle">' + E(v) + '</text>');
			else if (c.two) {
				var ln = D.wrap2(v, (cw - 3.8) / (8 * PT * 1.08));
				ln.slice(0, 2).forEach(function (t, k) { g.push('<text x="' + f2(x + 1.8) + '" y="' + f2(y + 6.2 + k * 3.4) + '" font-size="' + f2(fitFs(t, 8 * PT, cw - 3.6, true, 1.8)) + '" font-weight="700">' + E(t) + '</text>'); });
			} else g.push('<text x="' + f2(x + 1.8) + '" y="' + f2(y + 7.2) + '" font-size="' + f2(fitFs(v, 9 * PT, cw - 3.6, true, 2)) + '" font-weight="700">' + E(v) + '</text>');
			x += cw;
		});
		var size = o.px > 0 ? 'width="' + Math.round(o.px) + '" height="' + Math.round(o.px * H / W) + '"' : 'width="' + W + 'mm" height="' + H + 'mm"';
		return '<svg xmlns="http://www.w3.org/2000/svg" version="1.1" class="sheet" ' + size + ' viewBox="0 0 ' + W + ' ' + H + '" font-family=\'' + D.FONT.replace(/"/g, '') + '\'>' + g.join('') + '</svg>';
	};
	O.SHEET = SH;
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));
