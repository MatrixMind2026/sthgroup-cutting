/* STHGroup — документ «Деталировка фасадов»: альбомный лист A4 на каждый вид фасада (вариант B,
   выбранный автором): слева чертёж с лицевой стороны с размерами и петлями, справа паспорт фасада.
   Данные — BM.fac.sheets; оформление — как у документов сметы (шапка, подвал, один акцентный цвет). */
(function (G) {
	'use strict';
	var BM = G.BM = G.BM || {};
	var O = BM.out = BM.out || {};
	var E = BM.est, D = BM.draw, P = BM.project, esc = D.esc;

	var ACC = '#0E6B5A', HOLE = '#c2410c';
	var MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
	function dateLong(d) { d = d || new Date(); return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear(); }
	function n1(v) { return String(Math.round(v * 10) / 10).replace('.', ','); }
	function f3(v) { return (Math.round(v * 1000) / 1000).toFixed(3).replace(/\.?0+$/, ''); }
	var KIND = { frame: 'РАМОЧНЫЙ', film: 'ПЛЁНКА', enamel: 'ЭМАЛЬ' }, SIDE = { left: 'петли слева', right: 'петли справа' };

	O.detDoc = function (R, st, opt) {
		var set = st.set || {}, we = st.work.est || {};
		var sheets = BM.fac ? BM.fac.sheets(st, R.cfg, R.supMap, R.res.Notes) : [];
		return { kind: 'det', title: 'Деталировка фасадов', sub: (st.model.order ? st.model.order + ' · ' : '') + (BM.project.modelName(st.model) || 'Модель'),
				 right1: [set.org, set.author ? 'составил ' + set.author : ''].filter(function (x) { return x; }).join(' · '), right2: dateLong(),
				 client: we.client || '', strip: [], blocks: [], noPrice: 1, totals: 0, order: st.model.order || '', name: 'Деталировка фасадов', sheets: sheets, art: 0, artW: 0, sup: 0, img: 0,
				 facNoBlocks: !!(R.res && R.res.facNoBlocks) };
	};

	O.EST_CSS += '\n' + [
		'.dPg{position:relative;width:273mm;height:186mm;box-sizing:border-box;overflow:hidden;background:#fff}',
		'.dBody{display:flex;gap:6mm;height:160mm;margin-top:2mm}',
		'.dDraw{flex:0 0 150mm;height:160mm}', '.dDraw svg{display:block}',
		'.dPass{flex:1 1 auto;min-width:0;padding-top:3mm}',
		'.dBadge{display:inline-block;border:0.35mm solid ' + ACC + ';color:' + ACC + ';border-radius:0.8mm;padding:0.2mm 1.6mm;font-weight:700;font-size:7.5pt;letter-spacing:.05em}',
		'.dName{font-size:13pt;font-weight:700;margin:1.6mm 0 0.6mm;line-height:5.4mm}',
		'.dQty{font-size:10.5pt;line-height:6.4mm}', '.dQty b{font-size:18pt;color:' + ACC + ';margin-right:1mm}',
		'.dCap{font-size:6.8pt;color:#7a838b;letter-spacing:.07em;text-transform:uppercase;margin:3.2mm 0 0.8mm}',
		'.fTab{width:100%;border-collapse:collapse;font-size:8.5pt;line-height:3.8mm}',
		'.fTab td{padding:0.9mm 1.7mm;border-bottom:0.15mm solid #d5d9dd;vertical-align:top;text-align:left;overflow-wrap:anywhere}', '.fTab td.k{color:#5d6770;width:34%}', '.fTab td.v{font-weight:600;border-left:1px solid var(--doc-rule,#d5d9dd)}',
		'.fTab small{display:block;font-weight:400;color:#5d6770;font-size:7.2pt;line-height:3.3mm}', '.fTab small a,.dTx a{color:#1f5fbf}',
		'.dSw{display:inline-block;width:4mm;height:4mm;vertical-align:-0.9mm;margin-right:1.4mm;border-radius:0.6mm;border:0.15mm solid #c9ced3;object-fit:cover;box-sizing:border-box}',
		'.dTx{font-size:8pt;color:#333;line-height:3.9mm}', '.dTx.w,.dMissing{color:#8a4208}', '.dHint{color:#5d6770}'
	].join('\n');

	/* ------------------------------- чертёж ----------------------------------- */
	function pattern(id, img) { return img ? '<pattern id="' + id + '" patternUnits="objectBoundingBox" patternContentUnits="objectBoundingBox" width="1" height="1"><image href="' + esc(img) + '" x="0" y="0" width="1" height="1" preserveAspectRatio="xMidYMid slice"/></pattern>' : ''; }
	function drawSvg(o, k) {
		var AW = 150, AH = 160, cups = o.holes.filter(function (h) { return h.d >= 30 && h.d <= 40; });
		var hp = (o.hinges && o.hinges.length) ? o.hinges : null;            // петли рамочного фасада (без чашек)
		var right = o.hinge && o.hinge.side ? o.hinge.side === 'right' : false;
		var W = Math.max(1, o.w), H = Math.max(1, o.h), s = Math.min((AW - 34) / W, (AH - 26) / H), w = W * s, h = H * s;
		var x0 = 17 + (AW - 34 - w) / 2, y0 = 6, g = [], id = 'd' + k;
		var sProf = o.sup && o.sup[o.prof], sGlass = o.sup && o.sup[o.glass], sCoat = o.sup && o.sup[o.coat];
		g.push('<defs><marker id="' + id + 'a" viewBox="0 0 8 8" refX="4" refY="4" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,1L8,4L0,7" fill="#1a1d21"/></marker>' +
			'<marker id="' + id + 'b" viewBox="0 0 8 8" refX="4" refY="4" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,1L8,4L0,7" fill="' + HOLE + '"/></marker>' +
			pattern(id + 'p', sProf && sProf.img) + pattern(id + 'g', sGlass && sGlass.img) + pattern(id + 'c', sCoat && sCoat.img) + '</defs>');
		if (o.kind === 'frame') {
			var band = Math.max(1.2, Math.min(20 * s, Math.min(w, h) * 0.12));
			g.push('<rect x="' + f3(x0) + '" y="' + f3(y0) + '" width="' + f3(w) + '" height="' + f3(h) + '" fill="' + (sProf && sProf.img ? 'url(#' + id + 'p)' : '#2b2d31') + '" stroke="#111" stroke-width="0.3"/>');
			g.push('<rect x="' + f3(x0 + band) + '" y="' + f3(y0 + band) + '" width="' + f3(w - 2 * band) + '" height="' + f3(h - 2 * band) + '" fill="' + (sGlass && sGlass.img ? 'url(#' + id + 'g)' : '#cddde2') + '" fill-opacity="' + (sGlass && sGlass.img ? 0.8 : 0.75) + '" stroke="#111" stroke-width="0.2"/>');
			[[x0, y0, x0 + band, y0 + band], [x0 + w, y0, x0 + w - band, y0 + band], [x0, y0 + h, x0 + band, y0 + h - band], [x0 + w, y0 + h, x0 + w - band, y0 + h - band]].forEach(function (c) {
				g.push('<line x1="' + f3(c[0]) + '" y1="' + f3(c[1]) + '" x2="' + f3(c[2]) + '" y2="' + f3(c[3]) + '" stroke="#8a9099" stroke-width="0.2"/>');
			});
		} else {
			g.push('<rect x="' + f3(x0) + '" y="' + f3(y0) + '" width="' + f3(w) + '" height="' + f3(h) + '" fill="' + (sCoat && sCoat.img ? 'url(#' + id + 'c)' : '#eef0f2') + '" fill-opacity="' + (sCoat && sCoat.img ? 0.7 : 1) + '" stroke="#1a1d21" stroke-width="0.35"/>');
		}
		/* отверстия: с тыла (не насквозь) — пунктиром */
		o.holes.forEach(function (q) {
			var cx = x0 + q.x * s, cy = y0 + q.y * s, r = Math.max(0.6, q.d / 2 * s);
			g.push('<circle cx="' + f3(cx) + '" cy="' + f3(cy) + '" r="' + f3(r) + '" fill="#fff" fill-opacity="0.6" stroke="' + HOLE + '" stroke-width="0.25"' + (q.back ? ' stroke-dasharray="0.8 0.55"' : '') + '/>');
			if (r >= 1.4) g.push('<path d="M' + f3(cx - 0.9) + ' ' + f3(cy) + 'H' + f3(cx + 0.9) + 'M' + f3(cx) + ' ' + f3(cy - 0.9) + 'V' + f3(cy + 0.9) + '" stroke="' + HOLE + '" stroke-width="0.15"/>');
		});
		/* петли рамочного фасада — контуром с тыла (пунктир) */
		if (hp) hp.forEach(function (q) {
			var cx = x0 + q.x * s, cy = y0 + q.y * s, hw = Math.max(1.4, 10 * s), hh = Math.max(3, 42 * s);
			g.push('<rect x="' + f3(cx - hw / 2) + '" y="' + f3(cy - hh / 2) + '" width="' + f3(hw) + '" height="' + f3(hh) + '" rx="0.4" fill="#fff" fill-opacity="0.55" stroke="' + HOLE + '" stroke-width="0.25" stroke-dasharray="0.8 0.55"/>');
			g.push('<path d="M' + f3(cx - hw / 2 - 0.8) + ' ' + f3(cy) + 'H' + f3(cx + hw / 2 + 0.8) + '" stroke="' + HOLE + '" stroke-width="0.15"/>');
		});
		function txt(x, y, t, rot, col, bold) {
			var a = '<text x="' + f3(x) + '" y="' + f3(y) + '" text-anchor="middle" font-size="2.7" fill="' + (col || '#1a1d21') + '"' + (bold ? ' font-weight="700"' : '') + (rot ? ' transform="rotate(-90 ' + f3(x) + ' ' + f3(y) + ')"' : '') + '>' + esc(t) + '</text>';
			return a;
		}
		function dimH(xa, xb, y, t) {
			g.push('<line x1="' + f3(xa) + '" y1="' + f3(y) + '" x2="' + f3(xb) + '" y2="' + f3(y) + '" stroke="#1a1d21" stroke-width="0.2" marker-start="url(#' + id + 'a)" marker-end="url(#' + id + 'a)"/>');
			g.push('<rect x="' + f3((xa + xb) / 2 - 4.5) + '" y="' + f3(y - 1.8) + '" width="9" height="3.4" fill="#fff"/>' + txt((xa + xb) / 2, y + 0.95, t, false, '', true));
		}
		function dimV(x, ya, yb, t, col, mk) {
			g.push('<line x1="' + f3(x) + '" y1="' + f3(ya) + '" x2="' + f3(x) + '" y2="' + f3(yb) + '" stroke="' + (col || '#1a1d21') + '" stroke-width="0.2" marker-start="url(#' + id + (mk || 'a') + ')" marker-end="url(#' + id + (mk || 'a') + ')"/>');
			if (Math.abs(yb - ya) >= 4.5) g.push('<rect x="' + f3(x - 1.8) + '" y="' + f3((ya + yb) / 2 - 4.5) + '" width="3.4" height="9" fill="#fff"/>');
			g.push(txt(x + 0.95, (ya + yb) / 2, t, true, col, !col));
		}
		/* ширина — снизу, высота — со стороны без петель, петли — цепочкой от верха со своей стороны */
		var yd = y0 + h + 7;
		g.push('<path d="M' + f3(x0) + ' ' + f3(y0 + h + 1) + 'V' + f3(yd + 1.5) + 'M' + f3(x0 + w) + ' ' + f3(y0 + h + 1) + 'V' + f3(yd + 1.5) + '" stroke="#7a838b" stroke-width="0.15"/>');
		dimH(x0, x0 + w, yd, String(o.w));
		var xh = right ? x0 - 8 : x0 + w + 8, eh = right ? x0 - 1 : x0 + w + 1;
		g.push('<path d="M' + f3(eh) + ' ' + f3(y0) + 'H' + f3(xh + (right ? -1.5 : 1.5)) + 'M' + f3(eh) + ' ' + f3(y0 + h) + 'H' + f3(xh + (right ? -1.5 : 1.5)) + '" stroke="#7a838b" stroke-width="0.15"/>');
		dimV(xh, y0, y0 + h, String(o.h));
		if (hp) {
			/* рамочный: каждая петля — от ближнего края (сверху или снизу), размеры уступами */
			var hy = hp.map(function (q) { return q.y; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).sort(function (a, b) { return a - b; });
			var topL = hy.filter(function (v) { return v <= o.h / 2; }), botL = hy.filter(function (v) { return v > o.h / 2; }).reverse();
			var ec2 = right ? x0 + w + 1 : x0 - 1, dir = right ? 1 : -1;
			topL.forEach(function (v, n) {
				var xc2 = (right ? x0 + w : x0) + dir * (8 + n * 5.5);
				g.push('<path d="M' + f3(ec2) + ' ' + f3(y0 + v * s) + 'H' + f3(xc2 + dir * 1.5) + 'M' + f3(ec2) + ' ' + f3(y0) + 'H' + f3(xc2 + dir * 1.5) + '" stroke="' + HOLE + '" stroke-width="0.15"/>');
				dimV(xc2, y0, y0 + v * s, n1(v), HOLE, 'b');
			});
			botL.forEach(function (v, n) {
				var xc2 = (right ? x0 + w : x0) + dir * (8 + n * 5.5);
				g.push('<path d="M' + f3(ec2) + ' ' + f3(y0 + v * s) + 'H' + f3(xc2 + dir * 1.5) + 'M' + f3(ec2) + ' ' + f3(y0 + h) + 'H' + f3(xc2 + dir * 1.5) + '" stroke="' + HOLE + '" stroke-width="0.15"/>');
				dimV(xc2, y0 + v * s, y0 + h, n1(o.h - v), HOLE, 'b');
			});
		} else if (cups.length) {
			var ys = cups.map(function (q) { return q.y; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).sort(function (a, b) { return a - b; }), pts = [0].concat(ys).concat([o.h]);
			var xc = right ? x0 + w + 8 : x0 - 8, ec = right ? x0 + w + 1 : x0 - 1;
			pts.forEach(function (v) { g.push('<path d="M' + f3(ec) + ' ' + f3(y0 + v * s) + 'H' + f3(xc + (right ? 1.5 : -1.5)) + '" stroke="' + HOLE + '" stroke-width="0.15"/>'); });
			for (var i = 0; i + 1 < pts.length; i++) if (pts[i + 1] - pts[i] > 0.05) dimV(xc, y0 + pts[i] * s, y0 + pts[i + 1] * s, n1(pts[i + 1] - pts[i]), HOLE, 'b');
		}
		var cap = 'вид с лицевой стороны' + (hp ? ' · петли с тыльной стороны — пунктиром' : (o.holes.some(function (q) { return q.back; }) ? ' · отверстия с тыльной стороны — пунктиром' : ''));
		g.push('<text x="' + f3(AW / 2) + '" y="' + f3(Math.min(AH - 1, yd + 7)) + '" text-anchor="middle" font-size="2.4" fill="#7a838b">' + esc(cap) + '</text>');
		return '<svg width="' + AW + 'mm" height="' + AH + 'mm" viewBox="0 0 ' + AW + ' ' + AH + '" font-family="Segoe UI,Inter,DejaVu Sans,Arial,sans-serif">' + g.join('') + '</svg>';
	}

	/* ------------------------------- паспорт ---------------------------------- */
	function sw(o, name) { var x = o.sup && o.sup[name]; return x && x.img ? '<img class="dSw" src="' + esc(x.img) + '" alt="">' : ''; }
	function supLine(o, name) {
		var x = o.sup && o.sup[name];
		if (!x || !(x.shop || x.url)) return '';
		return '<small>' + esc(x.shop || '') + (x.url ? (x.shop ? ' · ' : '') + '<a href="' + esc(x.url) + '">' + esc(O.urlText ? O.urlText(x.url) : x.url) + '</a>' : '') + '</small>';
	}
	function passport(o) {
		var rows = [], i;
		if (o.prod) rows.push(['Изделие', esc(o.prod)]);
		rows.push(['Размер (В×Ш)', o.h + ' × ' + o.w + ' мм']);
		if (o.kind === 'frame') {
			if (o.art) rows.push(['Артикул', esc(o.art)]);
			rows.push(['Цвет профиля', o.prof ? sw(o, o.prof) + esc(o.prof) + supLine(o, o.prof) : '<span class="dMissing" style="font-weight:400">в модели не найден</span>']);
			rows.push(['Цвет стекла', o.glass ? sw(o, o.glass) + esc(o.glass) + supLine(o, o.glass) : '<span class="dMissing" style="font-weight:400">в модели не найдено</span>']);
		} else {
			rows.push(['Основа', esc(o.base) + supLine(o, o.base)]);
			rows.push(['Покрытие', sw(o, o.coat) + esc(o.coat) + supLine(o, o.coat)]);
			rows.push(['Стороны покрытия', P.sidesTitle(o.sides)]);
		}
		rows.push(['Площадь', E.num(o.area) + ' кв.м' + (o.n > 1 ? ' <span class="dHint" style="font-weight:400">(' + E.num(o.n) + ' шт)</span>' : '')]);
		if (o.hinge.n) rows.push(['Петли', o.hinge.n + ' шт' + (o.hinge.name ? ' — ' + esc(o.hinge.name.replace(/\.\s*$/, '')) : '') + (o.hinge.side ? ', ' + SIDE[o.hinge.side] + (o.sideSet ? ' (вручную)' : '') : '') + supLine(o, o.hinge.name)]);
		if (o.kind === 'frame') { var fs = supLine(o, o.name); if (fs) rows.push(['Поставщик', fs.replace(/^<small>|<\/small>$/g, '')]); }
		var h = '<span class="dBadge">' + KIND[o.kind] + '</span><div class="dName">' + esc(o.name) + '</div><div class="dQty"><b>' + E.num(o.n) + ' шт</b> · ' + o.h + ' × ' + o.w + ' мм</div>' +
			'<div class="dCap">Паспорт фасада</div><table class="fTab">' + rows.map(function (r) { return '<tr><td class="k">' + r[0] + '</td><td class="v">' + r[1] + '</td></tr>'; }).join('') + '</table>';
		var cups = o.holes.filter(function (q) { return q.d >= 30 && q.d <= 40; }), other = o.holes.filter(function (q) { return !(q.d >= 30 && q.d <= 40); });
		if (o.hinges && o.hinges.length) {
			var hy = o.hinges.map(function (q) { return q.y; }).filter(function (v, k, a) { return a.indexOf(v) === k; }).sort(function (a, b) { return a - b; });
			var tops = hy.filter(function (v) { return v <= o.h / 2; }), bots = hy.filter(function (v) { return v > o.h / 2; }).map(function (v) { return o.h - v; }).reverse();
			h += '<div class="dCap">Петли — до центра петли</div><div class="dTx">' + (tops.length ? 'от верха ' + tops.map(n1).join(' · ') + ' мм' : '') + (tops.length && bots.length ? '; ' : '') + (bots.length ? 'от низа ' + bots.map(n1).join(' · ') + ' мм' : '') +
				(o.hinge.side ? ', ' + SIDE[o.hinge.side] + (o.sideSet ? ' (выбрано вручную)' : '') + (o.hinge.edge > 0 ? ', ' + n1(o.hinge.edge) + ' мм от края' : '') : '') + (o.hinges.some(function (q) { return q.by === 'holes'; }) ? ' (по отверстиям ответной планки)' : '') + '</div>';
		} else if (cups.length) {
			var ys = cups.map(function (q) { return q.y; }).filter(function (v, k, a) { return a.indexOf(v) === k; }).sort(function (a, b) { return a - b; });
			var edge = Math.min(cups[0].x, o.w - cups[0].x);
			h += '<div class="dCap">Петли от верха</div><div class="dTx">' + ys.map(n1).join(' · ') + ' мм, Ø' + n1(cups[0].d) + ', ' + n1(edge) + ' мм от края' + (o.hinge.side ? ', ' + SIDE[o.hinge.side] : '') + '</div>';
		}
		if (other.length) {
			var by = {}, keys = [];
			for (i = 0; i < other.length; i++) { var k = n1(other[i].d); if (!by[k]) { by[k] = 0; keys.push(k); } by[k]++; }
			h += '<div class="dCap">Другие отверстия</div><div class="dTx">' + keys.map(function (k2) { return 'Ø' + k2 + ' — ' + by[k2] + ' шт'; }).join(' · ') + ' (на чертеже)</div>';
		}
		if (o.face === 'guess' && (o.holes.length || (o.hinges && o.hinges.length))) h += '<div class="dTx w" style="margin-top:2mm">Лицо фасада определено без чашек петель — проверьте, с какой стороны отверстия.</div>';
		return h;
	}

	/* Листы документа: массив HTML-страниц (.dPg 273 × 186 мм). */
	O.detPages = function (doc, logo) {
		var head = O.estPageHead(doc, logo);
		var foot = doc.name + (doc.order ? ' · ' + doc.order : ''), list = doc.sheets || [], n = Math.max(1, list.length);
		function page(body, q) { return '<div class="dPg"' + (list[q] && list[q].key ? ' data-fac="' + q + '"' : '') + '>' + head + body + '<div class="eFoot"><span>' + esc(foot) + '</span><span>лист ' + (q + 1) + ' из ' + n + '</span></div></div>'; }
		if (!list.length) {
			return [page('<div class="eTx" style="height:20mm;margin-top:6mm">' + esc(doc.facNoBlocks ? 'Проект выгружен скриптом без сведений о блоках: выгрузите модель заново.' :
				'Фасадов для деталировки нет. Заказные фасады — блоки с артикулом @ из списка в настройках («Заказные фасады»), фасады МДФ — по облицовке пласти толщиной 0 мм.') + '</div>', 0)];
		}
		return list.map(function (o, q) { return page('<div class="dBody"><div class="dDraw">' + drawSvg(o, q) + '</div><div class="dPass">' + passport(o) + '</div></div>', q); });
	};

	/* Та же деталировка таблицей Excel: строка — вид фасада. O.detSheet — лист книги (его добавляют и к смете). */
	/* Чертёж листа отдельно (для картинки в Excel: окно переводит его в PNG — opt.facImgs[o.key]). */
	O.detSvg = function (o, k) { return drawSvg(o, 'x' + k); };
	O.detSheet = function (doc, st, opt) {
		var rows = [], merges = [], links = [], images = [], hs = {}, list = doc.sheets || [], imgs = (opt && opt.facImgs) || {};
		var anyImg = list.some(function (o) { return o.key && imgs[o.key]; });
		var C = [['№', 5]].concat(anyImg ? [['Чертёж', 22]] : []).concat([['Вид', 11], ['Наименование', 28], ['Артикул', 13], ['Высота, мм', 9], ['Ширина, мм', 9], ['Кол-во, шт', 8], ['Площадь, кв.м', 9],
			['Профиль / основа', 22], ['Стекло / покрытие', 22], ['Стороны', 12], ['Петли', 34], ['Петли: от верха (от низа), мм', 20], ['Поставщик', 24]]), N = C.length, L = O.colName;
		function add(cells) { rows.push(cells); return rows.length - 1; }
		function full(text, s, h) { var r = add([{ v: text, s: s }]); merges.push('A' + (r + 1) + ':' + L(N - 1) + (r + 1)); if (h) hs[r] = h; return r; }
		O.xlHead(doc, N, add, full);
		var head = add(C.map(function (c) { return { v: c[0], s: 11 }; }));
		hs[head] = 30;
		list.forEach(function (o, i) {
			var hy = ((o.hinges && o.hinges.length) ? o.hinges : o.holes.filter(function (q) { return q.d >= 30 && q.d <= 40; })).map(function (q) { return q.y; }).filter(function (v, k, a) { return a.indexOf(v) === k; }).sort(function (a, b) { return a - b; });
			var edgeTxt = (o.hinges && o.hinges.length) ? hy.map(function (v) { return v <= o.h / 2 ? n1(v) : '(' + n1(o.h - v) + ')'; }).join(' · ') : hy.map(n1).join(' · ');
			var mainSup = o.sup && o.sup[o.kind === 'frame' ? o.name : o.coat], z = i % 2;
			var cells = [{ v: i + 1, s: 18 + z }];
			if (anyImg) cells.push({ v: '', s: 16 + z });
			cells.push({ v: KIND[o.kind], s: 16 + z }, { v: o.name, s: 16 + z }, { v: o.art || '', s: 16 + z }, { v: o.h, s: 20 + z }, { v: o.w, s: 20 + z }, { v: o.n, s: 20 + z }, { v: o.area, s: 22 + z },
				{ v: o.kind === 'frame' ? o.prof : o.base, s: 16 + z }, { v: o.kind === 'frame' ? o.glass : o.coat, s: 16 + z }, { v: o.kind === 'frame' ? '' : P.sidesTitle(o.sides), s: 16 + z },
				{ v: o.hinge.n ? o.hinge.n + ' шт' + (o.hinge.name ? ' — ' + o.hinge.name : '') + (o.hinge.side ? ', ' + SIDE[o.hinge.side] + (o.sideSet ? ' (вручную)' : '') : '') : '', s: 16 + z }, { v: edgeTxt, s: 16 + z },
				{ v: mainSup ? (mainSup.shop || String(mainSup.url || '').replace(/^https?:\/\//, '')) : '', s: (mainSup && mainSup.url ? 24 : 16) + z });
			var r = add(cells);
			if (mainSup && mainSup.url) links.push({ r: r, c: N - 1, url: /^https?:\/\//i.test(mainSup.url) ? mainSup.url : 'https://' + mainSup.url });
			if (anyImg && imgs[o.key]) { images.push({ r: r, c: 1, data: imgs[o.key], w: 150, h: 160 }); hs[r] = 125; }
			else hs[r] = 30;
		});
		if (!list.length) full('Фасадов для деталировки нет.', 30);
		return { name: 'Деталировка фасадов', cols: C.map(function (c) { return c[1]; }), rows: rows, heights: hs, merges: merges, links: links, images: images, freeze: head + 1, print: { titles: head + 1 } };
	};
	O.detXlsx = function (doc, st, opt) { return O.xlsxBook([O.detSheet(doc, st, opt)], opt && opt.theme); };
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));
