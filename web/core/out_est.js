/* STHGroup — документы сметы: смета для заказчика, полная смета, заказ материала, заказ фурнитуры.
   Один и тот же набор блоков идёт в окно («как на бумаге»), в PDF и в Excel. Оформление — в стиле
   листов раскроя: тонкие линии, один акцентный цвет, крупно только итог. Высоты строк считаются,
   а не меряются, поэтому листы PDF режутся заранее. */
(function (G) {
	'use strict';
	var BM = G.BM = G.BM || {};
	var O = BM.out = BM.out || {};
	var E = BM.est, D = BM.draw, esc = D.esc;

	O.EST_KINDS = [['client', 'Смета для заказчика', 'для заказчика'], ['full', 'Полная смета', 'полная'], ['mat', 'Заказ материала', 'заказ материала'], ['furn', 'Заказ фурнитуры', 'заказ фурнитуры'], ['fac', 'Заказ фасадов', 'заказ фасадов'], ['sup', 'Заказ поставщику', 'заказ поставщику'], ['det', 'Деталировка фасадов', 'деталировка']];
	function kindTitle(k) { for (var i = 0; i < O.EST_KINDS.length; i++) if (O.EST_KINDS[i][0] === k) return O.EST_KINDS[i][1]; return 'Смета'; }
	O.estKindTitle = kindTitle;
	var MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
	function dateLong(d) { d = d || new Date(); return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear(); }
	function cap(s) { s = String(s).toLowerCase(); return s.charAt(0).toUpperCase() + s.substring(1); }
	function money(n) { return E.money(n); }
	function comma(s) { return String(s || '').replace(/(\d)\.(\d)/g, '$1,$2'); }
	function priceText(r) {
		if (r.info) return 'справочно';
		if (r.pct) return E.num(r.price) + ' %';
		return r.price ? (E.num(r.price) + ' ' + r.punit) : '';
	}

	/* Заказ поставщику: opt.shop — название поставщика ('' — строки без поставщика, '*' — все, каждый с нового листа),
	   opt.noPrice — без цен. Цены закупочные, без наценки. Шапка поставщика — из «Базы» (логотип, сайт, телефон…). */
	function supDoc(R, st, opt) {
		var set = st.set || {}, list = E.supOrder(R), blocks = [], noPrice = !!opt.noPrice, i, j, Bs = BM.base;
		var key = (opt.shop === undefined || opt.shop === null) ? (list[0] ? list[0].shop : '') : opt.shop;      // не выбран — первый по алфавиту
		var want = key === '*' ? list : list.filter(function (g) { return g.shop.toLowerCase() === String(key).toLowerCase(); });
		var one = want.length === 1 ? want[0].shop : '';
		var doc = { kind: 'sup', title: key === '*' ? 'Заказ поставщикам' : 'Заказ поставщику' + (one ? ': ' + one : ''), sub: (st.model.order ? st.model.order + ' · ' : '') + (BM.project.modelName(st.model) || 'Модель'),
					right1: [set.org, set.author ? 'составил ' + set.author : ''].filter(function (x) { return x; }).join(' · '), right2: dateLong(), client: '', strip: [], blocks: blocks, noPrice: noPrice, totals: false,
					order: st.model.order || '', name: 'Заказ поставщику' + (one ? ' ' + one : ''), note: st.model.note || '' };
		for (i = 0; i < want.length; i++) {
			var g = want[i], s = (Bs && Bs.cur && g.shop) ? Bs.supByName(Bs.cur, g.shop) : null;
			if (i) blocks.push({ t: 'page' });
			blocks.push({ t: 'shead', name: g.shop || 'Без поставщика', logo: s && s.logo ? s.logo : '',
				line: s ? [s.url ? String(s.url).replace(/^https?:\/\//, '') : '', s.phone, s.email].filter(function (x) { return x; }).join(' · ') : '',
				line2: s ? [s.person ? 'Контакт: ' + s.person : '', s.addr ? 'Склад: ' + s.addr : '', s.note || ''].filter(function (x) { return x; }).join(' · ') : (g.shop ? '' : 'У этих позиций поставщик не указан: его можно выбрать в смете или в разделе «База».') });
			var lastK = '';
			for (j = 0; j < g.rows.length; j++) {
				var r = g.rows[j], priced = !noPrice && r.price > 0 && !r.info;
				if (r.mkind && r.mkind !== lastK) blocks.push({ t: 'list', title: r.mkind });
				lastK = r.mkind || '';
				blocks.push({ t: 'row', row: r.row, art: r.art, name: r.name, sub: r.pieces, bad: '', qty: r.qty, note: '', price: priced ? (E.num(r.price) + ' ' + r.punit) : '', sum: priced ? money(r.sum) + ' р.' : '', shop: '', url: r.url, img: r.img });
			}
			if (!noPrice && g.sum) blocks.push({ t: 'sum', label: 'ИТОГО' + (key === '*' ? ' ' + (g.shop || 'без поставщика') : ''), value: money(g.sum) + ' руб.', main: 1 });
		}
		if (!want.length) blocks.push({ t: 'text', text: 'Позиций у этого поставщика в смете нет.' });
		else blocks.push({ t: 'text', text: noPrice ? 'Количество — с запасом, как в смете.' : 'Цены закупочные, без наценки. Количество — с запасом, как в смете.' });
		var aw = 0;
		if (R.cfg.artCol === 0) for (i = 0; i < blocks.length; i++) blocks[i].art = '';
		for (i = 0; i < blocks.length; i++) if (blocks[i].art) aw = Math.max(aw, D.textW(blocks[i].art) * EM);
		doc.sup = 0; doc.img = 0;
		for (i = 0; i < blocks.length; i++) if (blocks[i].img) doc.img = 1;
		doc.art = aw > 0 ? 1 : 0;
		doc.artW = aw > 0 ? Math.round(Math.min(ART_MAX_S, Math.max(ART_MIN, aw + 4.5)) * 10) / 10 : 0;
		return doc;
	}
	O.supList = function (R) { return E.supOrder(R).map(function (g) { return { shop: g.shop, n: g.rows.length, sum: g.sum }; }); };

	/* Документ как список блоков. opt: { kind, noPrice, totals }.
	   Блоки: group (МАТЕРИАЛ …), sect (раздел), row (строка), list / line (справка), text, sum (итоги). */
	O.estDoc = function (R, st, opt) {
		opt = opt || {};
		if (opt.kind === 'det' && O.detDoc) return O.detDoc(R, st, opt);
		if (opt.kind === 'sup') return supDoc(R, st, opt);
		var kind = opt.kind || 'client', set = st.set || {}, we = st.work.est || {}, cfg = R.cfg, blocks = [], i, j;
		var noPrice = !!opt.noPrice || kind === 'mat', totals = !!opt.totals && (kind === 'client' || kind === 'full');
		var doc = { kind: kind, title: kind === 'client' || kind === 'full' ? 'Смета' : kindTitle(kind), sub: (st.model.order ? st.model.order + ' · ' : '') + (BM.project.modelName(st.model) || 'Модель'),
					right1: [set.org, set.author ? 'составил ' + set.author : ''].filter(function (x) { return x; }).join(' · '),
					right2: dateLong() + ((kind === 'client' && !noPrice && cfg.valid > 0) ? ' · цены действительны ' + cfg.valid + ' ' + E.plural(cfg.valid, 'день', 'дня', 'дней') : ''),
					client: we.client || '', strip: [], blocks: blocks, noPrice: noPrice, totals: totals, order: st.model.order || '', name: kindTitle(kind) };
		/* примечание из свойств модели — в сметах и заказах (не в деталировке) */
		doc.note = st.model.note || '';
		if (kind === 'full') doc.right2 += ' · полная';

		if (kind === 'client' || kind === 'full') {
			if (!noPrice) {
				for (i = 0; i < E.GROUPS.length; i++) {
					if (E.GROUPS[i] === E.DOP && !R.groups[E.DOP]) continue;      // пустые «Дополнительные материалы» в полосу итогов не идут
					doc.strip.push({ label: E.GROUPS[i] === E.DOP ? 'ДОП. МАТЕРИАЛЫ' : E.GROUPS[i], value: money(R.groups[E.GROUPS[i]] || 0) });
				}
				if (R.discSum) doc.strip.push({ label: 'СКИДКА ' + E.num(R.disc) + ' %', value: '− ' + money(R.discSum) });
				doc.strip.push({ label: 'ИТОГО, РУБ.', value: money(R.grand), main: 1 });
			}
			var last = '';
			for (i = 0; i < R.sections.length; i++) {
				var s = R.sections[i];
				if (s.group !== last) { last = s.group; blocks.push({ t: 'group', title: s.group, sum: noPrice ? '' : money(R.groups[s.group] || 0) }); }
				/* группа из одного раздела с тем же названием («ПРОЧЕЕ») — заголовок один */
				if (!(s.title === s.group && E.soloGroup(s.group))) blocks.push({ t: 'sect', title: cap(s.title), sum: noPrice ? '' : money(s.total) });
				if (totals) continue;
				var lastK = '';
				for (j = 0; j < s.rows.length; j++) {
					var r = s.rows[j];
					/* вид материала из «Базы» — подгруппой; первая подгруппа с названием раздела («Фурнитура» в «ФУРНИТУРЕ») не повторяется */
					if (r.mkind && r.mkind !== lastK && !(!lastK && j === 0 && r.mkind.toLowerCase() === s.title.toLowerCase())) blocks.push({ t: 'list', title: r.mkind });
					lastK = r.mkind || '';
					blocks.push({ t: 'row', row: r.row, art: r.art || '', name: r.label, sub: comma(r.pieces), bad: kind === 'full' ? r.bad : '', qty: r.qty, note: kind === 'full' ? comma(r.note) : '',
								  price: noPrice ? '' : priceText(r), sum: noPrice ? '' : (r.info ? '—' : money(r.sum) + ' р.'), info: r.info, shop: r.shop || '', url: r.url || '', img: r.img || '' });
				}
			}
			if (!R.sections.length) blocks.push({ t: 'text', text: 'В смете пока нет ни одной строки с ценой: задайте цены в таблице «Цены и количества».' });
			if (!noPrice && R.discSum) {
				blocks.push({ t: 'sum', label: 'Всего', value: money(R.sub) + ' руб.' });
				blocks.push({ t: 'sum', label: 'Скидка ' + E.num(R.disc) + ' %', value: '− ' + money(R.discSum) + ' руб.' });
			}
			if (!noPrice) blocks.push({ t: 'sum', label: 'ИТОГО', value: money(R.grand) + ' руб.', main: 1 });
			if (kind === 'client' && cfg.note) blocks.push({ t: 'text', text: cfg.note });
			if (kind === 'full') {
				for (i = 0; i < R.lists.length; i++) {
					blocks.push({ t: 'list', title: R.lists[i].title });
					for (j = 0; j < R.lists[i].lines.length; j++) blocks.push({ t: 'line', art: R.lists[i].lines[j].art || '', name: R.lists[i].lines[j].name, val: R.lists[i].lines[j].val });
				}
				var facts = ['Листов: ' + R.totalSheets, 'площадь панелей ' + E.num(Math.round(R.packArea * 100) / 100) + ' кв.м', 'прайс «' + R.pl + '»'];
				if (R.mk.M || R.mk.W || R.mk.F) facts.push('наценка в ценах: материал ' + E.num(R.mk.M) + ' %, работы ' + E.num(R.mk.W) + ' %, фурнитура ' + E.num(R.mk.F) + ' %');
				blocks.push({ t: 'text', text: facts.join(' · ') + '.' });
				/* «Внимание» и «Не учтено в смете» — только в окне программы, в документ не идут */
			}
		} else {
			var ord = E.order(R);
			if (kind === 'mat') {
				doc.cols = ['Материал', 'Толщина', 'Количество', 'Кромка к нему'];
				blocks.push({ t: 'group', title: 'МАТЕРИАЛ', sum: '' });
				for (i = 0; i < ord.mat.length; i++) { var m = ord.mat[i]; blocks.push({ t: 'mat', art: m.art || '', name: m.title, sub: m.sub || '', th: m.th, qty: m.qty, edges: (m.edgesA || m.edges).join(';  ') }); }
				if (!ord.mat.length) blocks.push({ t: 'text', text: 'Материалов нет.' });
				if (ord.lin.length) {
					blocks.push({ t: 'list', title: 'Погонные материалы' });
					for (i = 0; i < ord.lin.length; i++) blocks.push({ t: 'line', row: ord.lin[i].row, art: ord.lin[i].art || '', name: ord.lin[i].name + (ord.lin[i].pieces ? ' (' + comma(ord.lin[i].pieces) + ')' : ''), val: ord.lin[i].qty });
				}
			} else if (kind === 'fac') {
				var ftot = 0;
				blocks.push({ t: 'group', title: 'ЗАКАЗНЫЕ ФАСАДЫ', sum: '' });
				for (i = 0; i < ord.fac.length; i++) {
					var fz = ord.fac[i], fpr = !noPrice && fz.price > 0 && !fz.info;
					if (fpr) ftot += fz.sum;
					blocks.push({ t: 'row', row: fz.row, art: fz.art || '', name: fz.name + (fz.size ? ', ' + fz.size + ' мм' : ''), sub: '', bad: '', qty: fz.qty, note: '', price: fpr ? (E.num(fz.price) + ' ' + fz.punit) : '', sum: fpr ? money(fz.sum) + ' р.' : '', shop: fz.sup.shop, url: fz.sup.url, img: fz.sup.img });
				}
				/* фасады МДФ (плёнка, эмаль) — заказ покрытия, отдельной группой */
				var mdfL = ord.mdf || [];
				if (mdfL.length) blocks.push({ t: 'group', title: 'ФАСАДЫ МДФ', sum: '' });
				for (i = 0; i < mdfL.length; i++) {
					var mz = mdfL[i], mpr = !noPrice && mz.price > 0 && !mz.info;
					if (mpr) ftot += mz.sum;
					blocks.push({ t: 'row', row: mz.row, art: mz.art || '', name: mz.name, sub: '', bad: '', qty: mz.qty, note: '', price: mpr ? (E.num(mz.price) + ' ' + mz.punit) : '', sum: mpr ? money(mz.sum) + ' р.' : '', shop: mz.sup.shop, url: mz.sup.url, img: mz.sup.img });
				}
				if (ord.fac.length || mdfL.length) {
					var fn = 0, fa = 0;
					for (i = 0; i < ord.fac.length; i++) { fn += ord.fac[i].n; fa += ord.fac[i].area; }
					for (i = 0; i < mdfL.length; i++) { fn += mdfL[i].n; fa += mdfL[i].area; }
					blocks.push({ t: 'text', text: 'Всего фасадов: ' + E.num(fn) + ' шт, ' + E.num(Math.round(fa * 100) / 100) + ' кв.м. Размеры — высота × ширина.' });
				} else blocks.push({ t: 'text', text: R.res.facNoBlocks ? 'Проект выгружен скриптом без сведений о блоках: выгрузите модель заново.' : 'Заказных фасадов нет. Это блоки с артикулом @ из списка в настройках («Заказные фасады»).' });
				if (!noPrice && ftot) blocks.push({ t: 'sum', label: 'ИТОГО', value: money(ftot) + ' руб.', main: 1 });
			} else {
				var tot = 0;
				blocks.push({ t: 'group', title: 'ФУРНИТУРА', sum: '' });
				for (i = 0; i < ord.furn.length; i++) {
					var f = ord.furn[i], priced = !noPrice && f.price > 0 && !f.info;
					if (priced) tot += f.sum;
					blocks.push({ t: 'row', row: f.row, art: f.art || '', name: f.name, sub: f.pieces || '', bad: f.bad || '', qty: f.qty, note: '', price: priced ? (E.num(f.price) + ' ' + f.punit) : '', sum: priced ? money(f.sum) + ' р.' : '', shop: f.sup.shop, url: f.sup.url, img: f.sup.img });
				}
				if (!ord.furn.length) blocks.push({ t: 'text', text: R.res.old ? 'В этом проекте фурнитуры нет: он выгружен прежним скриптом. Выгрузите модель заново.' : 'Фурнитуры и профилей нет.' });
				if (!noPrice && tot) blocks.push({ t: 'sum', label: 'ИТОГО', value: money(tot) + ' руб.', main: 1 });
			}
		}
		/* столбец «Артикул» есть, только если артикул есть хотя бы у одной строки; ширина — по самому длинному */
		var aw = 0;
		if (cfg.artCol === 0) for (i = 0; i < blocks.length; i++) blocks[i].art = '';      // столбец выключен в настройках
		for (i = 0; i < blocks.length; i++) if (blocks[i].art) aw = Math.max(aw, D.textW(blocks[i].art) * EM);
		/* столбец «Поставщик» и фото у названия — только если они есть хотя бы у одной строки */
		doc.sup = 0; doc.img = 0;
		for (i = 0; i < blocks.length; i++) { if (blocks[i].shop || blocks[i].url) doc.sup = 1; if (blocks[i].img) doc.img = 1; }
		doc.art = aw > 0 ? 1 : 0;
		doc.artW = aw > 0 ? Math.round(Math.min(doc.sup ? ART_MAX_S : ART_MAX, Math.max(ART_MIN, aw + 4.5)) * 10) / 10 : 0;
		return doc;
	};

	/* ------------------------------- вёрстка ---------------------------------- */

	var ACC = '#0E6B5A';
	O.EST_CSS = [
		'.eDoc{font-family:"Segoe UI",Inter,"DejaVu Sans",Arial,sans-serif;color:#1a1d21;font-size:9pt;line-height:1.25}',
		'.ePg{position:relative;width:186mm;height:273mm;box-sizing:border-box;overflow:hidden;background:#fff}',
		'.eHead{display:flex;justify-content:space-between;align-items:flex-end;height:17mm;border-bottom:0.35mm solid #1a1d21;padding-bottom:2.2mm;box-sizing:border-box}',
		'.eHead h1{margin:0;font-size:17pt;line-height:7mm;font-weight:700;letter-spacing:-.01em}',
		'.eHead .s{color:#5d6770;font-size:9pt;line-height:4.4mm;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:104mm}',
		'.eHead .r{text-align:right;color:#5d6770;font-size:8.5pt;line-height:4.4mm;white-space:nowrap}',
		'.eCl{height:6mm;line-height:6mm;font-size:9pt;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}', '.eCl i{font-style:normal;color:#5d6770}',
		'.eStrip{display:flex;height:13mm;margin-top:3mm;border:0.2mm solid #b9c0c7;box-sizing:border-box}',
		'.eStrip div{flex:1 1 0;padding:1.7mm 2.6mm 0;border-right:0.2mm solid #b9c0c7;box-sizing:border-box;white-space:nowrap;overflow:hidden}',
		'.eStrip div:last-child{border-right:0}',
		'.eStrip i{display:block;font-style:normal;font-size:6.5pt;letter-spacing:.06em;color:#5d6770;line-height:3mm}',
		'.eStrip b{display:block;font-size:10.5pt;line-height:5.4mm}',
		'.eStrip .m{background:' + ACC + ';color:#fff;flex:1.25 1 0}', '.eStrip .m i{color:#d6ebe6}', '.eStrip .m b{font-size:13.5pt;line-height:6mm}',
		'.eGr{display:flex;justify-content:space-between;align-items:flex-end;height:8.6mm;box-sizing:border-box;padding-bottom:1mm;border-bottom:0.3mm solid ' + ACC + ';color:' + ACC + ';font-weight:700;font-size:8pt;letter-spacing:.06em}',
		'.eSe{display:flex;justify-content:space-between;align-items:flex-end;height:6.6mm;box-sizing:border-box;padding:0 1.6mm 0.7mm;font-weight:700;font-size:9pt}',
		'.eRo{display:flex;align-items:center;height:5.4mm;box-sizing:border-box;padding:0 1.6mm;border-bottom:0.15mm solid #d5d9dd;white-space:nowrap}',
		'.eRo.t2{height:9.2mm;align-items:flex-start;padding-top:0.9mm}',
		'.eRo .n{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis}', '.eRo.t2 .n{white-space:normal;line-height:3.7mm;max-height:7.4mm}',
		'.eRo .n small{color:#5d6770;font-size:7.5pt}', '.eRo .n em{font-style:normal;color:#b4540a;font-size:7.5pt}',
		'.eRo .q{flex:0 0 34mm;text-align:right}', '.eRo .p{flex:0 0 34mm;text-align:right;color:#5d6770}', '.eRo .u{flex:0 0 27mm;text-align:right;font-weight:700}',
		'.eRo .a,.eLn .a{flex:0 0 var(--aw,30mm);box-sizing:border-box;padding-right:3mm;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
		'.eLn .a + span{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis}',
		'.eRo.t2 .a{white-space:normal;overflow-wrap:anywhere;line-height:3.7mm;max-height:7.4mm}',
		'.ePg.wa .eRo .q{flex-basis:27mm}', '.ePg.wa .eRo .p{flex-basis:30mm}', '.ePg.wa .eRo .u{flex-basis:25mm}', '.ePg.wa .eRo .ed{flex-basis:50mm}',
		'.eRo .th{flex:0 0 17mm;text-align:right}', '.eRo .q.s{flex-basis:27mm}', '.eRo .ed{flex:0 0 62mm;padding-left:5mm;box-sizing:border-box;overflow:hidden;text-overflow:ellipsis;color:#333}', '.eRo.t2 .ed{white-space:normal;line-height:3.7mm;max-height:7.4mm}',
		'.eRo.hd{border-bottom:0.25mm solid #1a1d21;color:#5d6770;font-size:7.5pt}', '.eRo.hd .u{font-weight:400}',
		'.eRo[data-row]{cursor:default}',
		'.eLi{height:7mm;box-sizing:border-box;padding:2.2mm 1.6mm 0;font-weight:700;font-size:9pt}',
		'.eSh{height:16mm;box-sizing:border-box;display:flex;gap:3mm;align-items:center;padding:2mm 1.6mm;font-size:8.5pt;line-height:1.35;overflow:hidden}',
		'.eSh img,.eSh .lg{width:11mm;height:11mm;flex:none;border-radius:1.5mm;object-fit:contain}',
		'.eSh .lg{display:flex;align-items:center;justify-content:center;background:#0E6B5A;color:#fff;font-weight:700}',
		'.eSh b{font-size:10pt}.eSh span{color:#5d6770}',
		'.eLn{display:flex;justify-content:space-between;height:5mm;line-height:5mm;padding:0 1.6mm;border-bottom:0.15mm solid #d5d9dd;white-space:nowrap}',
		'.eLn span:first-child{overflow:hidden;text-overflow:ellipsis;min-width:0}', '.eLn span:last-child{flex:none;padding-left:4mm}',
		'.eTx{padding:1mm 1.6mm 0;color:#444;font-size:8.5pt;line-height:4.2mm;box-sizing:border-box;overflow:hidden}', '.eTx.w{color:#8a4208}',
		'.eSu{display:flex;justify-content:flex-end;gap:8mm;height:6.4mm;line-height:6.4mm;padding:0 1.6mm;font-size:9.5pt}',
		'.eSu.m{height:10mm;line-height:8.6mm;margin-top:1.4mm;border-top:0.35mm solid #1a1d21;font-size:13pt;font-weight:700}', '.eSu.m span:last-child{color:' + ACC + '}',
		'.eSu span:last-child{min-width:42mm;text-align:right;font-weight:700}',
		'.eFoot{position:absolute;left:0;right:0;bottom:0;height:5mm;line-height:5mm;display:flex;justify-content:space-between;color:#7a838b;font-size:7.5pt}',
		'.ePg.ws .eRo .q{flex-basis:24mm}', '.ePg.ws .eRo .p{flex-basis:23mm}', '.ePg.ws .eRo .u{flex-basis:21mm}',
		'.eRo .sp{flex:0 0 30mm;padding-left:2.5mm;box-sizing:border-box;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:7.5pt;line-height:3.6mm}', '.eRo .sp b{font-weight:600}',
		'.eRo .sp a{color:#1f5fbf;text-decoration:underline}', '.eRo.hd .sp{font-size:7.5pt}',
		'.eRo .im{flex:0 0 5.6mm;align-self:center;padding-right:1.2mm;box-sizing:border-box}', '.eRo.t2 .im{align-self:flex-start}',
		'.eRo .im img{display:block;width:4.4mm;height:4.4mm;object-fit:cover;border-radius:0.6mm;border:0.15mm solid #c9ced3;box-sizing:border-box}',
		'*{-webkit-print-color-adjust:exact;print-color-adjust:exact}'
	].join('\n');

	var ART_MIN = 17, ART_MAX = 34, ART_MAX_S = 28, SUP_W = 30, IMG_W = 5.6;
	/* ссылка поставщика в строке: адрес без «https://» и «www.» */
	function urlText(u) { return String(u || '').replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/$/, ''); }
	O.urlText = urlText;
	var EM = 9 * 0.3528, NAME_W = 186 - 3.2 - 34 - 34 - 27, NAME_W_NP = 186 - 3.2 - 34;
	var MAT_W = 186 - 3.2 - 17 - 27 - 62;
	function fitLines(text, widthMm, pt) { var w = D.textW(text) * (pt || 9) * 0.3528; return w <= widthMm ? 1 : 2; }
	/* со столбцом «Артикул» количество, цена и сумма идут плотнее — название не должно сжиматься вдвое */
	function nameW(doc) {
		if (doc.sup) return 186 - 3.2 - 24 - (doc.noPrice ? 0 : 23 + 21) - (doc.art ? doc.artW : 0) - SUP_W - (doc.img ? IMG_W : 0);
		return (doc.art ? (186 - 3.2 - 27 - (doc.noPrice ? 0 : 30 + 25) - doc.artW) : (doc.noPrice ? NAME_W_NP : NAME_W)) - (doc.img ? IMG_W : 0);
	}
	function artTwo(b, doc) { return !!(doc.art && b.art && D.textW(b.art) * EM > doc.artW - 3.2); }
	function blockH(b, doc) {
		if (b.t === 'group') return 8.6;
		if (b.t === 'sect') return 6.6;
		if (b.t === 'row') {
			var full = b.name + (b.sub ? ' (' + b.sub + ')' : '') + (b.note ? ' [' + b.note + ']' : '');
			b.two = (b.bad || fitLines(full, nameW(doc)) > 1 || artTwo(b, doc) || (doc.sup && b.url && (b.shop || fitLines(urlText(b.url), SUP_W - 2, 7.5) > 1))) ? 1 : 0;
			return b.two ? 9.2 : 5.4;
		}
		if (b.t === 'mat') { b.two = (fitLines(b.name + (b.sub ? ' ' + b.sub : ''), doc.art ? MAT_W + 12 - doc.artW : MAT_W) > 1 || fitLines(b.edges, doc.art ? 45 : 57) > 1 || artTwo(b, doc)) ? 1 : 0; return b.two ? 9.2 : 5.4; }
		if (b.t === 'list') return 7;
		if (b.t === 'shead') return 16;
		if (b.t === 'page') return 0;
		if (b.t === 'line') return 5;
		if (b.t === 'text') { b.lines = Math.max(1, Math.ceil(D.textW(b.text) * 1.1 * 8.5 * 0.3528 / 180)); return 1 + b.lines * 4.2; }
		if (b.t === 'sum') return b.main ? 11.4 : 6.4;
		return 5;
	}
	function artCell(b, doc, tag) { return doc.art ? '<' + tag + ' class="a">' + esc(b.art || '') + '</' + tag + '>' : ''; }
	function blockHtml(b, doc) {
		if (b.t === 'group') return '<div class="eGr"><span>' + esc(b.title) + '</span><span>' + esc(b.sum) + '</span></div>';
		if (b.t === 'sect') return '<div class="eSe"><span>' + esc(b.title) + '</span><span>' + esc(b.sum) + '</span></div>';
		if (b.t === 'row') {
			var supC = doc.sup ? '<div class="sp">' + (b.shop ? '<b>' + esc(b.shop) + '</b>' : '') + (b.url ? (b.shop ? '<br>' : '') + '<a href="' + esc(b.url) + '">' + esc(urlText(b.url)) + '</a>' : '') + '</div>' : '';
			var imgC = doc.img ? '<div class="im">' + (b.img ? '<img src="' + esc(b.img) + '" alt="">' : '') + '</div>' : '';
			return '<div class="eRo' + (b.two ? ' t2' : '') + '"' + (b.row !== undefined ? ' data-row="' + b.row + '"' : '') + '>' + artCell(b, doc, 'div') + imgC + '<div class="n">' + esc(b.name) + (b.sub ? ' <small>(' + esc(b.sub) + ')</small>' : '') + (b.note ? ' <small>[' + esc(b.note) + ']</small>' : '') +
				(b.bad ? '<br><em>' + esc(b.bad) + '</em>' : '') + '</div><div class="q">' + esc(b.qty) + '</div>' + (doc.noPrice ? '' : '<div class="p">' + esc(b.price) + '</div><div class="u">' + esc(b.sum) + '</div>') + supC + '</div>';
		}
		if (b.t === 'mat') return '<div class="eRo' + (b.two ? ' t2' : '') + '">' + artCell(b, doc, 'div') + '<div class="n">' + esc(b.name) + (b.sub ? ' <small>' + esc(b.sub) + '</small>' : '') + '</div><div class="th">' + esc(b.th) + '</div><div class="q s">' + esc(b.qty) + '</div><div class="ed">' + esc(b.edges) + '</div></div>';
		if (b.t === 'list') return '<div class="eLi">' + esc(b.title) + '</div>';
		if (b.t === 'shead') return '<div class="eSh">' + (b.logo ? '<img src="' + esc(b.logo) + '" alt="">' : '<span class="lg">' + esc(b.name.replace(/[^0-9A-Za-zА-Яа-яЁё]/g, '').slice(0, 2).toUpperCase()) + '</span>') + '<div><b>' + esc(b.name) + '</b>' + (b.line ? ' · ' + esc(b.line) : '') + '<br><span>' + esc(b.line2 || '') + '</span></div></div>';
		if (b.t === 'page') return '';
		if (b.t === 'line') return '<div class="eLn"' + (b.row !== undefined ? ' data-row="' + b.row + '"' : '') + '>' + artCell(b, doc, 'span') + '<span>' + esc(b.name) + '</span><span>' + esc(b.val) + '</span></div>';
		if (b.t === 'text') return '<div class="eTx' + (b.warn ? ' w' : '') + '" style="height:' + (1 + b.lines * 4.2).toFixed(1) + 'mm">' + esc(b.text) + '</div>';
		if (b.t === 'sum') return '<div class="eSu' + (b.main ? ' m' : '') + '"><span>' + esc(b.label) + '</span><span>' + esc(b.value) + '</span></div>';
		return '';
	}
	function colHead(doc) {
		var ah = doc.art ? '<div class="a">Артикул</div>' : '';
		if (doc.kind === 'mat') return '<div class="eRo hd">' + ah + '<div class="n">Материал</div><div class="th">Толщина</div><div class="q s">Количество</div><div class="ed">' + (doc.art ? 'Кромка к нему' : 'Кромка: толщина/ширина — длина') + '</div></div>';
		return '<div class="eRo hd">' + ah + (doc.img ? '<div class="im"></div>' : '') + '<div class="n">Наименование</div><div class="q">Количество</div>' + (doc.noPrice ? '' : '<div class="p">Цена</div><div class="u">Сумма</div>') + (doc.sup ? '<div class="sp">Поставщик</div>' : '') + '</div>';
	}

	/* Листы документа: массив HTML-страниц (каждая — .ePg 186 × 273 мм). */
	O.estPages = function (doc) {
		if (doc.kind === 'det' && O.detPages) return O.detPages(doc);
		var PAGE = 273 - 7, pages = [], cur = [], used = 0, i, b = doc.blocks;
		var first = 17 + (doc.client ? 6 : 0) + (doc.note ? 6 : 0) + (doc.strip.length ? 16 : 0) + 2 + 5.4;
		function head() {
			return '<div class="eHead"><div><h1>' + esc(doc.title) + '</h1><div class="s">' + esc(doc.sub) + '</div></div><div class="r">' + esc(doc.right1) + '<br>' + esc(doc.right2) + '</div></div>' +
				(doc.client ? '<div class="eCl"><i>Заказчик:</i> ' + esc(doc.client) + '</div>' : '') +
				(doc.note ? '<div class="eCl eNote"><i>Примечание:</i> ' + esc(doc.note) + '</div>' : '') +
				(doc.strip.length ? '<div class="eStrip">' + doc.strip.map(function (s) { return '<div' + (s.main ? ' class="m"' : '') + '><i>' + esc(s.label) + '</i><b>' + esc(s.value) + '</b></div>'; }).join('') + '</div>' : '') +
				'<div style="height:2mm"></div>' + colHead(doc);
		}
		function flush() { pages.push(cur.join('')); cur = []; used = 0; }
		used = first; cur.push(head());
		for (i = 0; i < b.length; i++) {
			if (b[i].t === 'page') { if (cur.length > 1) { flush(); cur.push(head()); used = first; } continue; }     // следующий поставщик — с нового листа
			var h = blockH(b[i], doc), need = h, k = i + 1;
			/* заголовок не отрывается от первой строки под ним; итоги — друг от друга */
			if (b[i].t === 'group' || b[i].t === 'sect' || b[i].t === 'list' || b[i].t === 'shead') { while (k < b.length && (b[k].t === 'sect' || b[k].t === 'group')) need += blockH(b[k++], doc); if (k < b.length) need += blockH(b[k], doc); }
			if (b[i].t === 'sum') { while (k < b.length && b[k].t === 'sum') need += blockH(b[k++], doc); }
			if (used + need > PAGE && cur.length) { flush(); cur.push(colHead(doc)); used = 5.4; }
			cur.push(blockHtml(b[i], doc));
			used += h;
		}
		flush();
		var n = pages.length, foot = doc.name + (doc.order ? ' · ' + doc.order : '');
		return pages.map(function (p, q) { return '<div class="ePg' + (doc.art || doc.sup ? ' wa' : '') + (doc.sup ? ' ws' : '') + '"' + (doc.art ? ' style="--aw:' + doc.artW + 'mm"' : '') + '>' + p + '<div class="eFoot"><span>' + esc(foot) + '</span><span>лист ' + (q + 1) + ' из ' + n + '</span></div></div>'; });
	};
	/* Документ для печати в PDF. */
	O.estHtml = function (R, st, opt) {
		var doc = O.estDoc(R, st, opt), pages = O.estPages(doc);
		/* чертежи фасадов в конце сметы или заказа фасадов — альбомными листами (именованные страницы) */
		var det = (doc.kind !== 'det' && opt && opt.det && O.detDoc) ? O.detDoc(R, st, opt) : null, dpages = det && det.sheets.length ? O.detPages(det) : [];
		var html = '<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><title>' + esc(doc.name) + '</title><style>@page{size:A4 ' + (doc.kind === 'det' ? 'landscape' : 'portrait') + ';margin:12mm}@page det{size:A4 landscape;margin:12mm}html,body{margin:0;padding:0;background:#fff}.ePg{page-break-inside:avoid}.ePg + .ePg{page-break-before:always}' +
			(doc.kind === 'det' ? '' : '.dPg{page:det;break-before:page;page-break-inside:avoid}') + '\n' + O.EST_CSS + '</style></head><body><div class="eDoc">' + pages.join('') + dpages.join('') + '</div></body></html>';
		return { html: html, pages: pages.length + dpages.length, doc: doc, detPages: dpages.length };
	};

	/* ---------------------------------- Excel --------------------------------- */

	/* Тот же документ книгой Excel: один лист, цифры — числами. */
	/* Excel документов сметы — вид «таблица с заливками» (выбран автором): шапка, зелёная строка заголовков,
	   группы — тёмной полосой, разделы — серой, строки в рамках через одну подкрашены, внизу «Всего», скидка и ИТОГО.
	   Суммы — формулами: количество × цена, разделы, группы и итоги считаются в самом Excel. Фото — в ячейке,
	   ссылки поставщиков — щелчком. Печать: А4 по ширине, шапка таблицы на каждой странице, номера страниц. */
	function lead(s) {
		var m = /^\s*([−-])?\s*(\d[\d \u00a0\u202f]*(?:[,.]\d+)?)/.exec(String(s === null || s === undefined ? '' : s));
		if (!m) return null;
		var v = Number(m[2].replace(/[ \u00a0\u202f]/g, '').replace(',', '.'));
		return isFinite(v) ? (m[1] ? -v : v) : null;
	}
	O.xlLead = lead;
	/* шапка листа Excel (общая со «Деталировкой фасадов»): заголовок, проект, кто и когда, заказчик, примечание */
	O.xlHead = function (doc, N, add, full) {
		full(doc.title, 9, 26);
		if (doc.sub) full(doc.sub, 10);
		var info = [doc.right1, doc.right2].filter(function (x) { return x; }).join(' · ');
		if (info) full(info, 10);
		if (doc.client) full('Заказчик: ' + doc.client, 0);
		if (doc.note) full('Примечание: ' + doc.note, 30, Math.max(14, 13 * Math.ceil(String(doc.note).length / 150)));
		add([]);
	};
	function estSheet(doc, R) {
		var mat = doc.kind === 'mat', np = !!doc.noPrice || mat, C = [], i;
		if (doc.art) C.push({ k: 'art', t: 'Артикул', w: Math.max(12, Math.round(doc.artW * 0.62)) });
		if (doc.img && !mat) C.push({ k: 'img', t: 'Фото', w: 7.5 });
		if (mat) C.push({ k: 'name', t: 'Материал', w: 50 }, { k: 'th', t: 'Толщина', w: 10 }, { k: 'q', t: 'Количество', w: 18 }, { k: 'edges', t: 'Кромка к нему', w: 56 });
		else {
			C.push({ k: 'name', t: 'Наименование', w: doc.sup ? 52 : 62 }, { k: 'q', t: 'Кол-во', w: 10 }, { k: 'u', t: 'Ед.', w: 14 });
			if (!np) C.push({ k: 'p', t: 'Цена, руб.', w: 13 }, { k: 'sum', t: 'Сумма, руб.', w: 15 });
			if (doc.sup) C.push({ k: 'shop', t: 'Поставщик', w: 30 });
		}
		var col = {}, N = C.length, rows = [], merges = [], links = [], images = [], hs = {};
		C.forEach(function (c, k) { col[c.k] = k; });
		var L = function (c) { return O.colName(c); }, S = col.sum;
		function add(cells) { rows.push(cells); return rows.length - 1; }
		function span(r, from, to) { if (to > from) merges.push(L(from) + (r + 1) + ':' + L(to) + (r + 1)); }
		function full(text, st, h) { var r = add([{ v: text, s: st }]); span(r, 0, N - 1); if (h) hs[r] = h; return r; }
		function ref(r, c) { return L(c) + (r + 1); }
		O.xlHead(doc, N, add, full);
		var head = add(C.map(function (c) { return { v: c.t, s: 11 }; }));
		hs[head] = 24;
		/* полоса во всю строку: подпись — до столбца суммы, сумма — в нём */
		function band(text, st, stN, val) {
			var cells = [], r;
			for (var c = 0; c < N; c++) cells.push({ v: '', s: st });
			cells[0] = { v: text, s: st };
			if (S !== undefined) cells[S] = { v: (val === null || val === undefined) ? '' : val, s: stN };
			r = add(cells);
			span(r, 0, S !== undefined ? S - 1 : N - 1);
			return r;
		}
		var grp = null, sec = null, groups = [], seg = [], zebra = 0, vse = null, skid = null;
		function close() {
			if (sec && S !== undefined && sec.kids.length) rows[sec.r][S].f = 'SUM(' + ref(sec.kids[0], S) + ':' + ref(sec.kids[sec.kids.length - 1], S) + ')';
			sec = null;
		}
		function closeG() {
			close();
			if (grp && S !== undefined && grp.kids.length) rows[grp.r][S].f = grp.kids.length === 1 ? ref(grp.kids[0], S) : 'SUM(' + grp.kids.map(function (k) { return ref(k, S); }).join(',') + ')';
			grp = null;
		}
		for (i = 0; i < doc.blocks.length; i++) {
			var b = doc.blocks[i], r;
			if (b.t === 'group') {
				closeG();
				r = band(b.title, 12, 13, np ? null : lead(b.sum));
				hs[r] = 19;
				grp = { r: r, kids: [] };
				if (!np && lead(b.sum) !== null) groups.push(r);
				zebra = 0;
			} else if (b.t === 'sect') {
				close();
				r = band(b.title, 14, 15, np ? null : lead(b.sum));
				sec = { r: r, kids: [] };
				if (grp && !np) grp.kids.push(r);
				zebra = 0;
			} else if (b.t === 'list') {
				band(b.title, 14, 15, null);
			} else if (b.t === 'shead') {
				closeG();
				seg = [];
				r = band(b.name, 12, 13, null); hs[r] = 20;
				var sl = [b.line, b.line2].filter(function (x) { return x; }).join(' · ');
				if (sl) full(sl, 10);
				zebra = 0;
			} else if (b.t === 'row' || b.t === 'mat' || b.t === 'line') {
				var z = zebra++ % 2, cells = [];
				for (var c = 0; c < N; c++) cells.push({ v: '', s: 16 + z });
				if (col.art !== undefined) cells[col.art] = { v: b.art || '', s: 16 + z };
				if (b.t === 'mat') {
					cells[col.name] = { v: b.name + (b.sub ? ' — ' + b.sub : ''), s: 16 + z };
					cells[col.th] = { v: b.th, s: 18 + z };
					cells[col.q] = { v: b.qty, s: 18 + z };
					cells[col.edges] = { v: b.edges, s: 16 + z };
					r = add(cells);
				} else if (b.t === 'line') {
					cells[col.name] = { v: b.name, s: 16 + z };
					cells[col.q] = { v: b.val, s: 16 + z };
					r = add(cells);
					if (col.u !== undefined) span(r, col.q, col.u);
				} else {
					var q = lead(b.qty), unit = q === null ? '' : String(b.qty).replace(/^\s*\d[\d \u00a0\u202f]*(?:[,.]\d+)?\s*/, ''), pct = /%/.test(b.price || ''), p = (pct || b.info) ? null : lead(b.price), sv = lead(b.sum);
					cells[col.name] = { v: b.name + (b.sub ? ' (' + b.sub + ')' : '') + (b.note ? ' [' + b.note + ']' : '') + (b.bad ? ' — ' + b.bad : ''), s: 16 + z };
					cells[col.q] = q === null ? { v: b.qty || '', s: 16 + z } : { v: q, s: 18 + z };
					cells[col.u] = { v: unit, s: 16 + z };
					if (!np) {
						cells[col.p] = p === null ? { v: b.price || '', s: 18 + z } : { v: p, s: (Math.round(p) === p ? 20 : 22) + z };
						if (b.info) cells[S] = { v: 'справочно', s: 18 + z };
						else if (sv !== null) cells[S] = { v: sv, s: 20 + z };
					}
					r = add(cells);
					if (!np && !b.info && sv !== null && q !== null && p !== null && q > 0 && p > 0) rows[r][S].f = 'ROUND(' + ref(r, col.q) + '*' + ref(r, col.p) + ',0)';
					if (!np && sv !== null && !b.info) { if (sec) sec.kids.push(r); else if (grp) grp.kids.push(r); seg.push(r); }
				}
				if (col.img !== undefined && b.img) { images.push({ r: r, c: col.img, data: b.img, w: 40, h: 40 }); hs[r] = 35; }
				if (col.shop !== undefined && (b.shop || b.url)) {
					rows[r][col.shop] = { v: b.shop || String(b.url).replace(/^https?:\/\//, ''), s: (b.url ? 24 : 16) + z };
					if (b.url) links.push({ r: r, c: col.shop, url: /^https?:\/\//i.test(b.url) ? b.url : 'https://' + b.url });
				}
				var len = String(rows[r][col.name].v).length, per = doc.sup ? 60 : 72;
				if (!hs[r] && len > per) hs[r] = 13 * Math.min(4, Math.ceil(len / per));
			} else if (b.t === 'text') {
				closeG();
				add([]);
				full(b.text, 30, Math.max(14, 13 * Math.ceil(String(b.text).length / 160)));
			} else if (b.t === 'sum' && !np && S !== undefined) {
				closeG();
				var lab = String(b.label), val = lead(b.value), cl = [], f = null;
				for (var c2 = 0; c2 < N; c2++) cl.push('');
				if (/^Всего/.test(lab)) { if (groups.length) f = 'SUM(' + groups.map(function (g) { return ref(g, S); }).join(',') + ')'; }
				else if (/^Скидка/.test(lab)) { if (vse !== null) f = '-ROUND(' + ref(vse, S) + '*' + (R.disc || 0) + '/100,0)'; }
				else if (vse !== null && skid !== null) f = ref(vse, S) + '+' + ref(skid, S);
				else if ((doc.kind === 'client' || doc.kind === 'full') && groups.length) f = 'SUM(' + groups.map(function (g) { return ref(g, S); }).join(',') + ')';
				else if (seg.length) f = 'SUM(' + seg.map(function (k) { return ref(k, S); }).join(',') + ')';
				var main = !!b.main;
				cl[S - 1] = { v: lab, s: main ? 28 : 26 };
				cl[S] = { v: val, f: f || undefined, s: main ? 29 : 27 };
				r = add(cl);
				if (main) hs[r] = 22;
				if (/^Всего/.test(lab)) vse = r; else if (/^Скидка/.test(lab)) skid = r;
				if (main) seg = [];
			}
		}
		closeG();
		return { name: doc.name, cols: C.map(function (c) { return c.w; }), rows: rows, heights: hs, merges: merges, links: links, images: images, freeze: head + 1, print: { titles: head + 1, portrait: 1 } };
	}
	O.estSheet = estSheet;
	O.estXlsx = function (R, st, opt) {
		opt = opt || {};
		var doc = O.estDoc(R, st, opt);
		if (doc.kind === 'det' && O.detXlsx) return O.detXlsx(doc, st, opt);
		var book = [estSheet(doc, R)];
		if (opt.det && O.detDoc) { var dd = O.detDoc(R, st, opt); if (dd.sheets.length) book.push(O.detSheet(dd, st, opt)); }
		return O.xlsxBook(book);
	};
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));
