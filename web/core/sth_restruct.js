/* STHGroup — перестройка базы материалов по структуре, согласованной автором (схема «Структура_базы», 03.11.2026):
   разделы по виду материала, не глубже 4 уровней, поставщик — в карточке; «Примечание» → поля (хлыст, упаковка, единица);
   чистка («90/1» в обозначении, «м» → «м.п.»); признаки кромки — классами. Упаковка из названия («(5000 шт.)», «100 шт/уп»…).
   Только правила — окно в ui/sth_mb.js. Работает в окне и под Node.js. */
(function (G) {
	'use strict';
	var BM = G.BM = G.BM || {};
	var R = BM.sthRe = {};
	function low(s) { return String(s || '').toLowerCase().replace(/ё/g, 'е'); }
	function trim(s) { return String(s === undefined || s === null ? '' : s).replace(/\s+/g, ' ').trim(); }
	function num(v) { v = Number(String(v === undefined ? '' : v).replace(/\s/g, '').replace(',', '.')); return isFinite(v) ? v : 0; }
	function unNum(s) { return trim(String(s || '').replace(/^\d+\.\s*/, '')); }      // «01. Egger» → «Egger»

	/* пустой каркас: раздел, путь, тип группы */
	R.SKELETON = [
		['01. Листовые материалы', 'sheet'], ['01. Листовые материалы/01. ЛДСП', 'sheet'], ['01. Листовые материалы/02. МДФ', 'sheet'], ['01. Листовые материалы/03. ХДФ и ДВП', 'sheet'],
		['01. Листовые материалы/04. Фанера', 'sheet'], ['01. Листовые материалы/05. Пластик HPL и компакт-плита', 'sheet'],
		['02. Кромка', 'edge'], ['02. Кромка/01. ПВХ', 'edge'], ['02. Кромка/02. АБС', 'edge'], ['02. Кромка/03. Меламин', 'edge'], ['02. Кромка/04. Акрил 3D', 'edge'],
		['03. Погонные материалы', 'sheet'], ['03. Погонные материалы/01. Столешницы', 'sheet'], ['03. Погонные материалы/02. Стеновые панели', 'sheet'],
		['03. Погонные материалы/03. Плинтусы и цоколь', 'other'], ['03. Погонные материалы/04. Профили', 'other'],
		['04. Фурнитура', 'fit'], ['04. Фурнитура/01. Крепёж', 'fit'], ['04. Фурнитура/01. Крепёж/Шканты', 'fit'], ['04. Фурнитура/02. Петли', 'fit'], ['04. Фурнитура/03. Подъёмники и механизмы', 'fit'],
		['04. Фурнитура/04. Выдвижные системы', 'fit'], ['04. Фурнитура/05. Ручки и лицевая', 'fit'], ['04. Фурнитура/06. Опоры и ножки', 'fit'], ['04. Фурнитура/07. Шкафы и гардеробные', 'fit'],
		['04. Фурнитура/08. Кухня', 'fit'], ['04. Фурнитура/09. Освещение', 'fit'], ['04. Фурнитура/10. Замки', 'fit'], ['04. Фурнитура/11. Для стекла и зеркал', 'fit'], ['04. Фурнитура/12. Металлокаркас', 'fit'],
		['05. Фасады заказные', 'other'], ['06. Стекло и зеркало', 'sheet'], ['07. Расходные материалы', 'other'], ['08. Комплекты', 'fit']
	];
	R.typeOf = function (path) { var p = String(path || ''); for (var i = R.SKELETON.length - 1; i >= 0; i--) if (p === R.SKELETON[i][0] || p.indexOf(R.SKELETON[i][0] + '/') === 0) return R.SKELETON[i][1]; return 'other'; };

	/* фурнитура: прежний вид (3-й уровень, без номера) → новый; подвиды (4-й уровень) — особые случаи */
	var FIT = {
		'крепежная и соединительная фурнитура': '01. Крепёж', 'системы для открывания фасадов': '03. Подъёмники и механизмы', 'системы для выдвижения ящиков': '04. Выдвижные системы',
		'лицевая фурнитура': '05. Ручки и лицевая', 'опоры для мягкой и корпусной мебели': '06. Опоры и ножки', 'шкафы. гардеробные. двери': '07. Шкафы и гардеробные',
		'кухонные комплектующие': '08. Кухня', 'мебельное освещение': '09. Освещение', 'замки': '10. Замки', 'комплектующие для стекла и зеркал': '11. Для стекла и зеркал',
		'мебель на металлокаркасе и комплектующие': '12. Металлокаркас'
	};
	var FIT_PATH = { 'рамочный профиль для фасадов': '03. Погонные материалы/04. Профили/Рамочный' };
	var SUB = [    // [слова подвида, новый путь целиком (вместо раздела 04 / вид / подвид)]
		[/^петли$/, '04. Фурнитура/02. Петли'],
		[/gola/, '03. Погонные материалы/04. Профили/GOLA'],
		[/пристеночные плинтусы|кухонный цоколь/, '03. Погонные материалы/03. Плинтусы и цоколь'],
		[/^кухонные ножки$/, '04. Фурнитура/06. Опоры и ножки/Кухонные ножки'],
		[/профиль для светодиодной ленты/, '03. Погонные материалы/04. Профили/Для LED-ленты'],
		[/экспозиторы и образцы/, null]          // не переносить (предложение автору; в окне можно вернуть)
	];
	/* прежний путь группы (GRP_NAME .dbf) → { path, cls: [признаки], drop } */
	R.mapGroup = function (grp, name) {
		var p = String(grp || '').split('/').map(trim).filter(Boolean), q = p.map(function (x) { return low(unNum(x)); }), n = low(name), out = null, cls = [];
		var top = q[0] || '';
		if (/^листов/.test(top)) {
			var kind = q[1] || '', rest = p.slice(2).map(unNum);
			if (/лдсп/.test(kind)) { if (/perfectsense/.test(low(rest.join(' ')))) { cls.push('PerfectSense'); rest = rest.filter(function (x) { return !/perfectsense/i.test(x); }); } out = '01. Листовые материалы/01. ЛДСП/' + rest.join('/'); }
			else if (/мдф|хдф/.test(kind)) { var hdf = /хдф|двп|hdf|оргалит/.test(n) || (/хдф/.test(kind) && !/мдф/.test(kind)); if (/perfectsense/.test(low(rest.join(' ')))) cls.push('PerfectSense'); out = (hdf ? '01. Листовые материалы/03. ХДФ и ДВП/' : '01. Листовые материалы/02. МДФ/') + rest.join('/'); }
			else if (/фанер/.test(kind)) out = '01. Листовые материалы/04. Фанера/' + rest.join('/');
			else if (/пласт|hpl|компакт/.test(kind)) out = '01. Листовые материалы/05. Пластик HPL и компакт-плита/' + rest.join('/');
			else out = '01. Листовые материалы/' + p.slice(1).join('/');
		} else if (/^кромоч|^кромка/.test(top)) {
			var kind2 = q[1] || '', sec = /абс|abs/.test(kind2) ? '02. АБС' : /пвх|pvc/.test(kind2) ? '01. ПВХ' : /меламин/.test(kind2) ? '03. Меламин' : /акрил|3d/.test(kind2) ? '04. Акрил 3D' : unNum(p[1] || 'Прочее');
			var mk = p[2] ? unNum(p[2]) : '', size = p[3] ? unNum(p[3]) : '';
			/* признаки (а не размеры) — классами, размер — из названия */
			if (size && !/\d+\s*[хx×]\s*\d/.test(size)) {
				if (/для столешниц/i.test(size)) cls.push('Для столешниц');
				if (/поперечн/i.test(size)) cls.push('Поперечный рисунок');
				if (/perfectsense/i.test(size)) cls.push('PerfectSense');
				var sz = /(\d+(?:[.,]\d+)?)\s*[хx×]\s*(\d+(?:[.,]\d+)?)/i.exec(name || '');
				size = sz ? sz[1] + 'х' + sz[2] + ' мм' : 'Размер не указан';
			}
			out = '02. Кромка/' + sec + (mk ? '/' + mk : '') + (size ? '/' + size : '');
		} else if (/^погон/.test(top)) {
			var all = q.slice(1).join(' '), mk2 = p.slice(1).map(unNum).filter(function (x) { return !/столешниц|стенов|постформ/i.test(x); });
			if (/стенов/.test(all) && !/столешниц/.test(all)) out = '03. Погонные материалы/02. Стеновые панели/' + mk2.join('/');
			else if (/столешниц|постформ/.test(all)) out = '03. Погонные материалы/01. Столешницы/' + mk2.join('/');
			else if (/плинтус|цокол/.test(all)) out = '03. Погонные материалы/03. Плинтусы и цоколь/' + mk2.join('/');
			else if (/профил/.test(all)) out = '03. Погонные материалы/04. Профили/' + mk2.join('/');
			else out = '03. Погонные материалы/' + p.slice(1).map(unNum).join('/');
		} else if (/^фурнитур/.test(top)) {
			/* 04. Фурнитура / 01. МДМ (поставщик) / вид / подвид / … — поставщик уходит в карточку */
			var off = FIT[q[1]] || FIT_PATH[q[1]] ? 1 : 2, kind3 = q[off] || '', sub = p[off + 1] ? unNum(p[off + 1]) : '', sub2 = p[off + 2] ? unNum(p[off + 2]) : '';
			var sup = off === 2 ? unNum(p[1]) : '';
			for (var i = 0; i < SUB.length; i++) if (SUB[i][0].test(low(sub))) { if (SUB[i][1] === null) return { path: '', cls: cls, drop: true, sup: sup }; out = SUB[i][1] + (SUB[i][1].split('/').length < 4 && sub2 ? '/' + sub2 : ''); break; }
			if (!out && FIT_PATH[kind3]) out = FIT_PATH[kind3] + (sub ? '/' + sub : '');
			if (!out) {
				var nk = FIT[kind3] || unNum(p[off] || 'Прочее');
				if (/^лифты|подъ[её]мн/.test(low(sub))) nk = '03. Подъёмники и механизмы';
				if (/отталкив|амортиз|магнит/.test(low(sub))) nk = '03. Подъёмники и механизмы';
				out = '04. Фурнитура/' + nk + (sub ? '/' + sub : '') + (sub2 ? '/' + sub2 : '');
			}
			return { path: cut(out), cls: cls, drop: false, sup: sup };
		} else out = p.map(function (x, k) { return k ? unNum(x) : x; }).join('/');
		return { path: cut(out), cls: cls, drop: false, sup: '' };
	};
	function cut(path) { return String(path || '').split('/').map(trim).filter(Boolean).slice(0, 4).join('/'); }

	/* упаковка из названия: «(5000 шт.)», «5000 шт/уп», «уп. 200», «упаковка 500 шт», «×50 шт», «в бобине 5 м», «на листе 54 шт» */
	var NUM = '(?<![\\dхx×.,])(\\d{1,3}(?:[ \\u00a0]\\d{3})+|\\d+)';
	var PACK = [
		[NUM + '\\s*(шт|пар|м)\\.?\\)', 1], ['\\(' + NUM + '\\s*(шт|пар|м)\\.?\\)', 0], [NUM + '\\s*(шт|пар)\\.?\\s*(?:\\/|в)\\s*уп', 0], ['в упаковке\\s*' + NUM + '\\s*(шт|пар|м)', 0],
		['уп(?:аковк[аеи])?\\.?\\s*(?:по\\s*)?' + NUM + '\\s*(шт|пар)', 0], ['[×x]\\s*' + NUM + '\\s*(шт)', 0], [NUM + '\\s*(штук)', 0], [',\\s*' + NUM + '\\s*(шт)\\.?\\s*$', 0],
		['в бобине\\s*(\\d+(?:[.,]\\d+)?)\\s*(м)', 0], ['на листе\\s*' + NUM + '\\s*(ш)', 0]
	].filter(function (x) { return !x[1]; }).map(function (x) { return new RegExp(x[0], 'i'); });
	R.packOf = function (s, roll) {
		s = String(s || '');
		var m = null;
		for (var i = 0; i < PACK.length && !m; i++) m = PACK[i].exec(s);
		if (!m && roll) m = /Д\s*=\s*(\d+(?:[.,]\d+)?)\s*(м)\b/i.exec(s);      // бобина: «Д=10 м»
		if (!m) return null;
		var n = num(String(m[1]).replace(/[\s\u00a0]/g, ''));
		return n > 1 ? { n: n, unit: /^м/i.test(m[2] || '') ? 'м' : 'шт' } : null;
	};

	/* запись .dbf → запись с новым путём и полями из «Примечания»; extra — то, чего нет в полях БАЗИСа */
	R.fixRec = function (r) {
		var o = {}, k; for (k in r) if (Object.prototype.hasOwnProperty.call(r, k)) o[k] = r[k];
		var g = R.mapGroup(r.GRP_NAME, r.ITEMNAME), extra = { cls: g.cls.slice(), sup: g.sup, pack: 0, packPrice: 0, from: r.GRP_NAME, notes: [] };
		o.GRP_NAME = g.path; o._drop = g.drop;
		var note = trim(r.COMMENT), unit = trim(r.UNITNAME);
		/* хлысты: длина хлыста → длина (мм), единица м.п., округление до целого хлыста */
		var hl = /хлыст\w*[^\d]*?(?:длина хлыста\s*)?(\d+(?:[.,]\d+)?)\s*м/i.exec(note);
		if (hl) { var L = num(hl[1]); if (L > 0) { o.LENGTH = Math.round(L * 1000); unit = 'м.п.'; o.ROUNDMODE = 2; extra.roundTo = L; extra.notes.push('хлыст ' + L + ' м'); } }
		if (/цена указана за метр/i.test(note)) { unit = 'м.п.'; extra.notes.push('за метр'); }
		var roll = /^бобин/i.test(unit), pk = R.packOf(note, roll) || R.packOf(r.ITEMNAME, roll);
		if (pk) { extra.pack = pk.n; extra.notes.push('упаковка ' + pk.n + ' ' + pk.unit); }
		/* «упаковка» / «тыс. шт» — цена за упаковку → за штуку */
		if ((/^(упаковк|бобин)/i.test(unit) || /цена указана за упаковку/i.test(note)) && pk) { extra.packPrice = num(r.PRICE); o.PRICE = Math.round(num(r.PRICE) / pk.n * 10000) / 10000; unit = pk.unit === 'м' ? 'м.п.' : pk.unit; }
		else if (/^тыс\.?\s*шт/i.test(unit)) { extra.pack = 1000; extra.packPrice = num(r.PRICE); o.PRICE = Math.round(num(r.PRICE) / 1000 * 10000) / 10000; unit = 'шт'; extra.notes.push('упаковка 1000 шт'); }
		if (unit === 'м') unit = 'м.п.';
		o.UNITNAME = unit;
		if (/^egger$/i.test(note)) note = '';
		o.COMMENT = note;
		if (trim(r.SIGN) === '90/1') o.SIGN = '';
		/* классы БАЗИСа через пробел («V9 V10 P1») — каждый отдельно */
		var ct = trim(r.CLASS).split(/[\s,;]+/).filter(Boolean); if (ct.length > 1 && ct.every(function (c) { return /^[A-ZА-Я]{1,3}\d{1,4}$/i.test(c); })) o.CLASS = ct.join(',');
		return { rec: o, extra: extra };
	};
	/* сводка для окна: прежняя группа → новая, сколько позиций */
	R.plan = function (rows) {
		var by = {}, list = [];
		rows.forEach(function (r) {
			var f = R.fixRec(r), k = String(r.GRP_NAME || '');
			if (!by[k]) { by[k] = { from: k, to: f.rec.GRP_NAME, drop: f.rec._drop, n: 0, notes: {} }; list.push(by[k]); }
			by[k].n++; f.extra.notes.concat(f.extra.cls).forEach(function (x) { var t = x.replace(/[\d.,]+/g, 'N'); by[k].notes[t] = (by[k].notes[t] || 0) + 1; });
		});
		return list;
	};
	if (typeof module === 'object' && module.exports) module.exports = R;
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));
