/* STHGroup — деталировка для печати в PDF: одна деталь — один лист А4 (альбомный), рамка и штамп — как у карт
   присадки. Оформление и что показывать — из «Настройки → Деталировка» (BM.detail.conf). */
(function (G) {
	'use strict';
	var BM = G.BM = G.BM || {};
	var O = BM.out = BM.out || {};
	var P = BM.project, D = BM.draw, Dr = BM.drill, Det = BM.detail, esc = D.esc;
	var PG = { W: 273, H: 188, PAD: 3.5, TOP: 11, STAMP: 12.5 };
	var BOX = { W: PG.W - 2 * PG.PAD, H: PG.H - PG.STAMP - 2.5 - PG.TOP };      // поле под чертёж: 266 × 162
	O.DETAIL_BOX = BOX;
	function dateText() { var d = new Date(), p = function (v) { return (v < 10 ? '0' : '') + v; }; return p(d.getDate()) + '.' + p(d.getMonth() + 1) + '.' + d.getFullYear(); }
	function partLine(card) {
		var t = card.t, saw = t.sL && (Math.abs(t.sL - t.L) > 0.05 || Math.abs(t.sW - t.W) > 0.05) ? ' (пилить ' + P.dim(t.sL) + ' × ' + P.dim(t.sW) + ')' : '';
		return P.dim(t.L) + ' × ' + P.dim(t.W) + ' × ' + P.dim(t.th) + ' мм' + saw + ' · ' + P.matTitle(card.mat) + ' · ' + card.count + ' шт.';
	}
	O.detailPartLine = partLine;
	/* Лист детали в окне — целиком, как в PDF: шапка, чертёж, штамп. */
	O.detailSheet = function (st, card, px, pn, total) {
		var pg = Det.page(st, card, BOX, { inter: 1 }), note = st.model.note ? 'Примечание: ' + st.model.note : '';
		return { pg: pg, svg: O.sheetSvg({ head: Dr.title(card), sub: [partLine(card), note].filter(Boolean).join(' · '), body: [{ x: 0, y: 0, w: pg.W, h: pg.H, svg: Det.pageSvg(pg) }], cells: O.stampCells(st, 'Деталировка', Dr.title(card), pn, total), px: px }) };
	};
	/* opt.only — ключи карт (без него — все детали). Возвращает { html, pages, parts, warn }. */
	O.detailHtml = function (st, opt) {
		opt = opt || {};
		var set = st.set, title = P.modelName(st.model) || '', order = st.model.order || '', note = st.model.note ? 'Примечание: ' + st.model.note : '';
		var cards = Det.order(st, Det.cards(st), true).filter(function (c) { return !opt.only || opt.only[c.key]; }), pages = [], warn = 0;
		function stamp(what, pn) {
			var cells = [
				{ w: 22, l: 'Заказ', v: order }, { w: 46, l: 'Модель', v: title, two: 1 }, { w: 40, l: 'Документ', v: 'Деталировка', two: 1 }, { w: 83, l: 'Деталь', v: what, two: 1 },
				{ w: 23, l: 'Дата', v: dateText() }, { w: 36, l: set.org ? 'Организация' : 'Составил', v: set.org ? (set.org + (set.author ? ' / ' + set.author : '')) : set.author, two: 1 },
				{ w: 11, l: 'Стр.', v: pn, cls: 'g' }, { w: 12, l: 'Всего', v: '@@N@@', cls: 'g' }
			], s = '<table class="cSt"><tr>';
			cells.forEach(function (ce) {
				var v = (ce.v === '' || ce.v === undefined || ce.v === null) ? '—' : String(ce.v), inner;
				if (ce.two) { var ln = D.wrap2(v, (ce.w - 3.8) / (8 * 0.3528 * 1.08)); inner = esc(ln[0]) + (ln.length > 1 ? '<br>' + esc(ln[1]) : ''); } else inner = esc(v);
				s += '<td' + (ce.two ? ' class="w"' : (ce.cls ? ' class="' + ce.cls + '"' : '')) + ' style="width:' + ce.w + 'mm"><i>' + ce.l + '</i><b>' + inner + '</b></td>';
			});
			return s + '</tr></table>';
		}
		cards.forEach(function (c) {
			var pg = Det.page(st, c, BOX), sub = [partLine(c), note].filter(Boolean).join(' · ');
			warn += Det.check(pg).length;
			pages.push('<div class="cPg"><div class="cHead">' + esc(Dr.title(c)) + '<span>' + esc(sub) + '</span></div><div class="cAbs" style="left:' + PG.PAD + 'mm;top:' + PG.TOP + 'mm">' + Det.pageSvg(pg) + '</div>' + stamp(Dr.title(c), pages.length + 1) + '</div>');
		});
		var html = pages.join('\n').replace(/@@N@@/g, String(pages.length));
		return { pages: pages.length, parts: cards.length, warn: warn,
				 html: '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + esc('Деталировка — ' + title) + '</title><style>' + O.PDF_CSS + '</style></head><body><div id="cutPrint">' + html + '</div></body></html>' };
	};
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));
