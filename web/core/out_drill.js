/* STHGroup — карты ручной присадки для печати в PDF (HTML, альбомный А4, рамка и штамп как у раскроя).
   Оформление карты — из настроек присадки (Dr.conf). opt.multi: 0 — одна деталь на лист; 1 — мелкие карты
   по несколько на лист, если читаются без выносов. В оформлении Г у детали всегда два листа: чертёж и таблица. */
(function (G) {
	'use strict';
	var BM = G.BM = G.BM || {};
	var O = BM.out = BM.out || {};
	var P = BM.project, D = BM.draw, Dr = BM.drill, esc = D.esc;

	var PG = { W: 273, H: 188, PAD: 3.5, TOP: 11, STAMP: 12.5 };
	var BOX = { W: PG.W - 2 * PG.PAD, H: PG.H - PG.STAMP - 2.5 - PG.TOP };      // поле под чертежи: 266 × 162
	O.DRILL_BOX = BOX;

	function dateText() { var d = new Date(), p = function (v) { return (v < 10 ? '0' : '') + v; }; return p(d.getDate()) + '.' + p(d.getMonth() + 1) + '.' + d.getFullYear(); }
	function partLine(card) { var t = card.t; return P.dim(t.L) + ' × ' + P.dim(t.W) + ' × ' + P.dim(t.th) + ' мм · ' + P.matTitle(card.mat) + ' · ' + card.count + ' шт.'; }
	O.drillPartLine = partLine;
	/* Лист карты в окне — целиком, как в PDF: шапка, карта, штамп. pg — лист из Dr.cardPages. */
	O.drillSheet = function (st, card, pg, q, n, px) {
		var conf = Dr.conf(st.set), note = st.model.note ? 'Примечание: ' + st.model.note : '';
		var sheet = n > 1 ? ' · лист ' + (q + 1) + ' из ' + n + (conf.mode === 'G' ? (pg.kind === 'table' ? ' — таблица и пояснения' : ' — чертёж') : '') : '';
		return O.sheetSvg({ head: Dr.title(card), sub: [partLine(card) + sheet, note].filter(Boolean).join(' · '), body: [{ x: 0, y: 0, w: pg.W, h: pg.H, svg: Dr.pageSvg(pg) }], cells: O.stampCells(st, 'Карты присадки, ручная', Dr.title(card), q + 1, n), px: px });
	};

	O.drillHtml = function (st, opt) {
		opt = opt || {};
		var conf = Dr.conf(st.set), multi = (opt.multi === undefined ? conf.multi : opt.multi) && conf.mode !== 'G';
		var set = st.set, title = BM.project.modelName(st.model) || '', order = st.model.order || '', note = st.model.note ? 'Примечание: ' + st.model.note : '';
		var cards = Dr.order(st, Dr.cards(st), true).filter(function (c) { return c.n > 0; }), pages = [], warn = 0, i;
		function stamp(what, pn) {
			var cells = [
				{ w: 22, l: 'Заказ', v: order }, { w: 46, l: 'Модель', v: title, two: 1 }, { w: 40, l: 'Документ', v: 'Карты присадки, ручная', two: 1 }, { w: 83, l: 'Деталь', v: what, two: 1 },
				{ w: 23, l: 'Дата', v: dateText() }, { w: 36, l: set.org ? 'Организация' : 'Составил', v: set.org ? (set.org + (set.author ? ' / ' + set.author : '')) : set.author, two: 1 },
				{ w: 11, l: 'Стр.', v: pn, cls: 'g' }, { w: 12, l: 'Всего', v: '@@N@@', cls: 'g' }
			], s = '<table class="cSt"><tr>';
			for (var c = 0; c < cells.length; c++) {
				var ce = cells[c], v = (ce.v === '' || ce.v === undefined || ce.v === null) ? '—' : String(ce.v), inner;
				if (ce.two) { var ln = D.wrap2(v, (ce.w - 3.8) / (8 * 0.3528 * 1.08)); inner = esc(ln[0]) + (ln.length > 1 ? '<br>' + esc(ln[1]) : ''); } else inner = esc(v);
				s += '<td' + (ce.two ? ' class="w"' : (ce.cls ? ' class="' + ce.cls + '"' : '')) + ' style="width:' + ce.w + 'mm"><i>' + ce.l + '</i><b>' + inner + '</b></td>';
			}
			return s + '</tr></table>';
		}
		function page(head, sub, body, what) {
			sub = [sub, note].filter(Boolean).join(' · ');
			pages.push('<div class="cPg"><div class="cHead">' + esc(head) + (sub ? '<span>' + esc(sub) + '</span>' : '') + '</div>' + body + stamp(what, pages.length + 1) + '</div>');
		}
		function abs(x, y, svg) { return '<div class="cAbs" style="left:' + (PG.PAD + x).toFixed(2) + 'mm;top:' + (PG.TOP + y).toFixed(2) + 'mm">' + svg + '</div>'; }

		function sheetNote(pgs, q) { return pgs.length > 1 ? ' · лист ' + (q + 1) + ' из ' + pgs.length + (conf.mode === 'G' ? (pgs[q].kind === 'table' ? ' — таблица и пояснения' : ' — чертёж') : '') : ''; }
		if (!multi) {
			for (i = 0; i < cards.length; i++) {
				var pgs = Dr.cardPages(st, cards[i], BOX, { uid: 'c' + i + '_' });
				for (var q = 0; q < pgs.length; q++) {
					warn += pgs[q].unresolved;
					page(Dr.title(cards[i]), partLine(cards[i]) + sheetNote(pgs, q), abs(0, 0, Dr.pageSvg(pgs[q])), Dr.title(cards[i]));
				}
			}
		} else {
			/* лист — сетка 2 × 2: карта занимает клетку, колонку из двух клеток или лист целиком */
			var GAP = 4, TH = 6.5, cw = (BOX.W - GAP) / 2, ch = (BOX.H - GAP) / 2;
			var cur = null;
			var flush = function () { if (cur) page('Карты присадки', title, cur.body, cur.names.length > 2 ? cur.names.slice(0, 2).join(', ') + ' и ещё ' + (cur.names.length - 2) : cur.names.join(', ')); cur = null; };
			var cellTitle = function (card, x, y, w) {
				return '<div class="cAbs dTtl" style="left:' + (PG.PAD + x).toFixed(2) + 'mm;top:' + (PG.TOP + y).toFixed(2) + 'mm;width:' + w.toFixed(2) + 'mm"><b>' + esc(Dr.title(card)) + '</b> ' + esc(partLine(card)) + '</div>';
			};
			for (i = 0; i < cards.length; i++) {
				var c = cards[i], small = Dr.cardPages(st, c, { W: cw, H: ch - TH }, { noDetails: 1, small: 1, uid: 'c' + i + '_' }), kind = 1;
				if (small.length !== 1) { small = Dr.cardPages(st, c, { W: cw, H: BOX.H - TH }, { noDetails: 1, small: 1, uid: 'c' + i + '_' }); kind = 2; }
				if (small.length !== 1) {
					flush();
					var full = Dr.cardPages(st, c, BOX, { uid: 'c' + i + '_' });
					for (var z = 0; z < full.length; z++) { warn += full[z].unresolved; page(Dr.title(c), partLine(c) + sheetNote(full, z), abs(0, 0, Dr.pageSvg(full[z])), Dr.title(c)); }
					continue;
				}
				var col = -1, row = -1;
				if (cur) for (var cc = 0; cc < 2 && col < 0; cc++) {
					if (kind === 2) { if (!cur.used[cc][0] && !cur.used[cc][1]) { col = cc; row = 0; } }
					else for (var rr = 0; rr < 2 && col < 0; rr++) if (!cur.used[cc][rr]) { col = cc; row = rr; }
				}
				if (col < 0) { flush(); cur = { body: '', used: [[0, 0], [0, 0]], names: [] }; col = 0; row = 0; }
				cur.used[col][row] = 1; if (kind === 2) cur.used[col][1] = 1;
				var x = col * (cw + GAP), y = row * (ch + GAP);
				cur.body += cellTitle(c, x, y, cw) + abs(x, y + TH, Dr.pageSvg(small[0]));
				if (col === 1 && !cur.sep) { cur.sep = 1; cur.body += '<div class="cAbs" style="left:' + (PG.PAD + cw + GAP / 2).toFixed(2) + 'mm;top:' + PG.TOP + 'mm;height:' + BOX.H + 'mm;border-left:0.2mm solid #999"></div>'; }
				if (row === 1 || (kind === 1 && cur.used[col][1])) cur.body += '';
				cur.names.push(P.main(c.t) || c.t.name);
			}
			flush();
		}
		var css = O.PDF_CSS + '\n.dTtl{font-size:9pt;line-height:5mm;height:5.6mm;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;border-bottom:0.2mm solid #000}\n.dTtl b{font-size:10pt}';
		var html = pages.join('\n').replace(/@@N@@/g, String(pages.length));
		return { pages: pages.length, parts: cards.length, warn: warn, mode: conf.mode, multi: multi ? 1 : 0,
				 html: '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + esc('Присадка — ' + title) + '</title><style>' + css + '</style></head><body><div id="cutPrint">' + html + '</div></body></html>' };
	};
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));
