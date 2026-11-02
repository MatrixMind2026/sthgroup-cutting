/* STHGroup — смета по модели.

   Расчёт повторяет скрипт «СМЕТА» для БАЗИСа (v7.42): те же разделы, единицы, правила
   «не считать» и «справочно», те же ключи цен — поэтому файл «цены распила.txt» скрипта
   загружается как есть, а цены держатся по названию материала.

   Чем отличается от скрипта:
   — листы и длина реза берутся из раскроя программы, а не из своего раскроя сметы;
   — прайсов может быть несколько, каждый — полная копия цен и правил;
   — наценка (на материал, работы, фурнитуру) спрятана в ценах строк, скидка идёт
     отдельной строкой перед ИТОГО;
   — в «Прочее» можно добавлять свои строки: суммой, за кв.м панелей, процентом от сметы;
   — количества, заданные вручную, скидка, заказчик и свои строки хранятся в файле проекта. */
(function (G) {
	'use strict';
	var BM = G.BM = G.BM || {};
	var P = BM.project;
	var E = BM.est = {};

	/* ------------------------------- помощники -------------------------------- */

	function trim(s) { return String(s === null || s === undefined ? '' : s).replace(/^\s+|\s+$/g, ''); }
	function low(s) { return trim(s).toLowerCase(); }
	function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
	function f1(n) { return Math.round(Number(n) * 10) / 10; }
	function f2(n) { return (Math.round(Number(n) * 100) / 100).toFixed(2); }
	function r2(n) { return Math.round(Number(n) * 100) / 100; }
	function fmt(v) { return (Math.abs(v - Math.round(v)) < 0.0001) ? String(Math.round(v)) : f2(v); }
	function clone(o) { return JSON.parse(JSON.stringify(o)); }
	function maskList(s) {
		if (Array.isArray(s)) return s;
		return String(s || '').split(/[,;]+/).map(function (x) { return low(x); }).filter(function (x) { return x; });
	}
	function hasMask(name, list) {
		var n = low(name);
		for (var i = 0; i < list.length; i++) if (list[i] && n.indexOf(list[i]) >= 0) return true;
		return false;
	}
	function sortedKeys(obj) {
		var a = [];
		for (var k in obj) if (has(obj, k)) a.push(k);
		a.sort(function (x, y) { return (x < y) ? -1 : ((x > y) ? 1 : 0); });
		return a;
	}
	function plural(n, one, few, many) {
		if (Math.abs(n - Math.round(n)) > 0.0001) return few;
		var k = Math.abs(Math.round(n)) % 100;
		if (k >= 11 && k <= 14) return many;
		k = k % 10;
		if (k == 1) return one;
		if (k >= 2 && k <= 4) return few;
		return many;
	}
	E.fmt = fmt; E.f2 = f2; E.plural = plural;
	/* Деньги и количества для окна и документов: с пробелами между тысячами и запятой. */
	E.money = function (n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); };
	E.num = function (v) { return fmt(v).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d)(?=,|$))/g, ' '); };

	/* ------------------------------- настройки -------------------------------- */

	/* Настройки сметы (на компьютере, общие для всех проектов): правила расчёта и вид документов. */
	E.defaults = function () {
		return {
			edgeReserve: 20,                 // запас по кромке, %
			edgeMode: 'pct', edgeMm: 30,     // STHGroup: запас кромки — % от длины или мм свеса на каждую облицованную сторону детали
			profReserve: 20,                 // запас на хлыст профиля, мм: столько с каждого хлыста уходит в отход
			profKerf: 0,                     // пропил профиля, мм
			showCuts: 1, showHoles: 1, showFast: 1, showProf: 1,
			hidden: 0,                       // скрытые панели: 1 — берутся в раскрой и смету
			artCol: 1,                       // столбец «Артикул» в документах (в таблице окна он есть всегда)
			holesSort: 0,                    // отверстия в справке: 0 — одной строкой, иначе «до D» и «более D», мм
			thinMask: 'хдф, двп, hdf, оргалит', thinTh: '3, 4',
			glassMask: 'зеркал, стекл, лакобел, lacobel, mirror, glass',
			facArts: ['@Заказной фасад', '@Фасад Макро', '@Фасад в эмали'],  // заказные фасады: артикулы блоков (со знаком @)
			facMdf: 'whole',                 // МДФ внутри @-блока: 'whole' — весь фасад заказной, 'cut' — МДФ остаётся в раскрое
			facHinges: 1,                    // петли заказных фасадов — в смету («Фурнитура») и в заказ фурнитуры
			cornerMax: 0, cornerFrac: 25,    // скругление короче cornerMax мм и cornerFrac % габарита — обычный угол; 0 — как в скрипте: любое скругление криволинейное
			edgeB: [0.6, 0.8, 1.2, 1.6, 2.2],// классы толщины кромки: 0,4 мм — до [0]; 1 мм — от [1] до [2]; 1,5 мм — до [3]; 2 мм — до [4]
			profLens: [1000, 2000, 3000, 4000, 5000], profDef: 3000,
			linLens: [3050, 4200],           // стандартные длины погонного материала (столешницы, стеновые панели), мм
			bandW: [[16, 19], [21, 23], [27, 28], [999, 43]],   // ожидаемая ширина ленты: плита до … мм → лента … мм
			valid: 14,                       // «цены действительны … дней»; 0 — не печатать
			note: '',                        // примечание внизу сметы для заказчика
			noPrice: 0, totals: 0,           // галки документов «без цены» и «только итоги разделов»
			paper: 0,                        // вид окна: 0 — таблица «Цены и количества», 1 — «как на бумаге»
			docKind: 'client',
			detIn: { client: 0, full: 1, fac: 1 },   // «Добавить чертежи фасадов» у документов (запоминается)
			scriptFile: '',                  // откуда в прошлый раз брали цены скрипта «СМЕТА»
			cur: ''                          // прайс, выбранный последним (его получает новый проект)
		};
	};
	E.conf = function (set) {
		var d = E.defaults(), s = (set && set.est) || {}, k;
		for (k in d) if (has(d, k) && s[k] !== undefined && s[k] !== null) d[k] = s[k];
		if (!Array.isArray(d.edgeB) || d.edgeB.length !== 5) d.edgeB = E.defaults().edgeB;
		if (!Array.isArray(d.profLens) || !d.profLens.length) d.profLens = E.defaults().profLens;
		if (!Array.isArray(d.bandW) || !d.bandW.length) d.bandW = E.defaults().bandW;
		if (!Array.isArray(d.linLens) || !d.linLens.length) d.linLens = E.defaults().linLens;
		if (!Array.isArray(d.facArts)) d.facArts = E.defaults().facArts;
		return d;
	};

	/* --------------------------------- прайсы --------------------------------- */

	E.CLASSES = [['LDSP16', 'ЛДСП (8, 10, 16 мм)'], ['LDSP25', 'ЛДСП (25 мм)'], ['AGT', 'AGT (любая толщина)'], ['MDF', 'МДФ'], ['Veneer', 'Шпон'], ['HDF', 'ХДФ, ДВП']];
	E.DEFS = [['edge', 'Кромка', 'руб./метр'], ['cut', 'Распил', 'руб./лист'], ['cutthin', 'Распил ХДФ/ДВП', 'руб./лист'], ['groove', 'Паз', 'руб./метр'], ['hole', 'Отверстие', 'руб./шт'],
			  ['plast', 'Облицовка', 'руб./кв.м'], ['pack', 'Упаковка', 'руб./кв.м'], ['packsheet', 'Упаковка листами', 'руб./лист'], ['hinge', 'Петля', 'руб./шт'], ['fastener', 'Фурнитура', 'руб./шт'],
			  ['project', 'Проект', 'руб.'], ['assembly', 'Сборка', 'руб.'], ['other', 'Прочее', 'руб.']];
	/* Новый прайс: цены по умолчанию — как в скрипте «СМЕТА». */
	E.newList = function (name) {
		return {
			name: name || 'Основной',
			P: {},                           // цены строк: ключ → цена
			OFF: {}, REF: {},                // «не считать» и «справочно»
			SQM: {}, FUNIT: {}, CUNIT: {}, EUNIT: {}, PLEN: {}, XMODE: {},     // единицы строк
			ART: {}, NAME: {},               // артикул и наименование строки, вписанные вручную: ключ строки → текст
			MERGE: {}, NOMERGE: {},          // объединённые позиции: ключ строки → ключ строки, в которую она влита; «оставить обе»: «ключ\nключ» → 1
			LEG: {},                         // фурнитура с ценой из старого файла скрипта (без единиц)
			def: { edge: 35, cut: 0, cutthin: 0, groove: 0, hole: 0, plast: 0, pack: 150, packsheet: 0, hinge: 350, fastener: 0, project: 0, assembly: 0, other: 0 },
			cls: { LDSP16: { val: 7000, m2: 1400 }, LDSP25: { val: 7000, m2: 1400 }, AGT: { val: 7000, m2: 1400 }, MDF: { val: 5000, m2: 1000 }, Veneer: { val: 8700, m2: 1700 }, HDF: { val: 800, m2: 160 } },
			mk: { M: 0, W: 0, F: 0 },        // наценка в ценах, %: материал, работы, фурнитура
			extra: [{ id: 'Project', name: 'Проект' }, { id: 'Assembly', name: 'Сборка' }, { id: 'Other', name: 'Прочее' }]
		};
	};
	E.fixList = function (pl) {
		var d = E.newList(pl && pl.name), k, q;
		if (!pl || typeof pl !== 'object') return d;
		for (k in d) {
			if (!has(d, k)) continue;
			if (pl[k] === undefined || pl[k] === null || typeof pl[k] !== typeof d[k]) { pl[k] = d[k]; continue; }
			if (k === 'def' || k === 'mk') { for (q in d[k]) if (has(d[k], q) && !(typeof pl[k][q] === 'number' && isFinite(pl[k][q]))) pl[k][q] = d[k][q]; }
			if (k === 'cls') for (q in d.cls) if (has(d.cls, q)) { if (!pl.cls[q] || typeof pl.cls[q] !== 'object') pl.cls[q] = d.cls[q]; if (!(pl.cls[q].val >= 0)) pl.cls[q].val = d.cls[q].val; if (!(pl.cls[q].m2 >= 0)) pl.cls[q].m2 = d.cls[q].m2; }
		}
		if (!Array.isArray(pl.extra)) pl.extra = d.extra;
		pl.extra = pl.extra.filter(function (x) { return x && x.id && x.name; });
		pl.name = trim(pl.name) || 'Основной';
		return pl;
	};
	/* Хранилище прайсов (файл prices.json рядом с настройками). */
	E.fixStore = function (o) {
		if (!o || typeof o !== 'object' || !Array.isArray(o.lists)) o = { v: 1, lists: [] };
		o.v = 1;
		var seen = {}, out = [];
		for (var i = 0; i < o.lists.length; i++) {
			var pl = E.fixList(o.lists[i]), nm = pl.name, k = 2;
			while (seen[low(pl.name)]) pl.name = nm + ' (' + (k++) + ')';
			seen[low(pl.name)] = 1;
			out.push(pl);
		}
		if (!out.length) out.push(E.newList('Основной'));
		o.lists = out;
		/* поставщики: название материала (фурнитуры) → { shop — магазин, url — ссылка, img — фото (data:…) }; общие для всех прайсов */
		if (!o.sup || typeof o.sup !== 'object' || Array.isArray(o.sup)) o.sup = {};
		for (var sk in o.sup) if (has(o.sup, sk) && (!o.sup[sk] || typeof o.sup[sk] !== 'object')) delete o.sup[sk];
		return o;
	};
	/* Поставщик строки: записанный в базе цен, а если там магазина нет — примечание из БАЗИСа (если скрипт его прочитал). */
	/* Поставщик строки: из «Базы» (свой у материала или по классу «Поставщик»), иначе из прежней базы цен,
	   иначе из примечания в БАЗИСе. Фото — своё, иначе текстура материала из папки текстур. */
	E.supFor = function (sup, key, notes) {
		var Bs = G.BM.base, bi = (Bs && Bs.cur && key) ? Bs.infoOf(Bs.cur, key) : null;
		var rec = (sup && key && has(sup, key)) ? sup[key] : null, note = (notes && key && has(notes, key)) ? notes[key] : '';
		var recImg = (rec && typeof rec.img === 'string' && rec.img.indexOf('data:image/') === 0) ? rec.img : '';
		var o = { shop: (bi && bi.shop) || trim(rec && rec.shop) || trim(note), url: (bi && bi.url) || trim(rec && rec.url), img: (bi && bi.img) || recImg, how: bi ? bi.how : '' };
		o.fromNote = !(bi && bi.shop) && !(rec && trim(rec.shop)) && !!trim(note);
		if (!o.img && Bs && typeof Bs.thumb === 'function' && key) { o.img = Bs.thumb(key) || ''; o.tex = o.img ? 1 : 0; }
		return o;
	};
	/* Записать поставщика: пустые поля убираются, пустая запись — удаляется. */
	E.setSup = function (store, key, rec) {
		if (!store || !key) return;
		if (!store.sup || typeof store.sup !== 'object') store.sup = {};
		var o = {}, n = 0;
		['shop', 'url', 'img'].forEach(function (f) { var v = trim(rec && rec[f]); if (v) { o[f] = v; n++; } });
		if (o.url && !/^https?:\/\//i.test(o.url)) o.url = 'https://' + o.url;
		if (n) store.sup[key] = o; else delete store.sup[key];
	};
	/* Вид материала из «Базы» (класс группы «Вид материала», без номера): по нему строки раздела идут подгруппами. */
	E.kindFor = function (key) {
		var Bs = G.BM.base;
		if (!Bs || !Bs.cur || !key) return '';
		return trim(Bs.kindOfMat(Bs.cur, key)).replace(/^\d+[.)]\s*/, '');
	};
	/* порядок внутри раздела: строки с видом — по виду, без вида — после них, иначе как были */
	function byKind(a, b) { var x = a.mkind || '', y = b.mkind || ''; if (x === y) return a.i - b.i; if (!x) return 1; if (!y) return -1; return x.toLowerCase() < y.toLowerCase() ? -1 : 1; }
	E.byKind = byKind;
	E.listBy = function (store, name) {
		for (var i = 0; i < store.lists.length; i++) if (store.lists[i].name === name) return store.lists[i];
		return null;
	};
	/* Прайс проекта: записанный в проекте, иначе выбранный последним, иначе первый. */
	E.listFor = function (store, st) {
		var we = st && st.work ? st.work.est : null, c = E.conf(st ? st.set : null);
		return (we && we.pl && E.listBy(store, we.pl)) || E.listBy(store, c.cur) || store.lists[0];
	};
	/* Копия прайса; pct — на сколько процентов поднять (или опустить) все цены. Проценты строк «Прочее» не трогаются. */
	E.copyList = function (pl, name, pct) {
		var c = clone(pl), k = 1 + (Number(pct) || 0) / 100, q;
		c.name = name;
		if (Math.abs(k - 1) < 1e-9) return c;
		function up(v) { return Math.round(v * k * 100) / 100; }
		for (q in c.P) if (has(c.P, q) && !/:P$/.test(q)) c.P[q] = up(c.P[q]);
		for (q in c.def) if (has(c.def, q)) c.def[q] = up(c.def[q]);
		for (q in c.cls) if (has(c.cls, q)) { c.cls[q].val = up(c.cls[q].val); c.cls[q].m2 = up(c.cls[q].m2); }
		return c;
	};

	/* --------------------- правила скрипта: материалы и кромка ----------------- */

	function isGlass(cfg, mat) { return hasMask(mat, cfg._glass); }
	function isThinSheet(cfg, mat, th) {
		if (isGlass(cfg, mat)) return false;
		if (hasMask(mat, cfg._thin)) return true;
		return cfg._thinTh.indexOf(Math.round(th || 0)) >= 0;
	}
	function groupKey(mat, th) { return mat + ' | ' + Math.round(th); }
	function groupTitle(g) { return g.mat + '  ' + Math.round(g.th) + ' мм'; }
	E.groupKey = groupKey;

	/* Толщина кромочной ленты, мм: свойство самой кромки, а если его нет — из названия
	   («0.4х19», или одиночное число перед «мм» не больше 3: «19 мм» — это ширина). */
	function edgeThickMm(name, objThick) {
		var th = Number(objThick);
		if (!isNaN(th) && th > 0) return th;
		var s = String(name).replace(/\r.*/, '');
		var m = s.match(/(\d+(?:[.,]\d+)?)\s*[xXхХ×]\s*\d+(?:[.,]\d+)?/);
		if (m) return parseFloat(m[1].replace(',', '.'));
		m = s.match(/(\d+(?:[.,]\d+)?)\s*мм/i);
		if (m) { var v = parseFloat(m[1].replace(',', '.')); if (v > 0 && v <= 3) return v; }
		return 0;
	}
	/* Класс толщины: по нему группируются строки кромкования и держится цена. Тоньше 0,4 —
	   отдельный класс, туда же попадает лента с незаполненной толщиной. Границы — из настроек. */
	function edgeThickClass(cfg, th) {
		var b = cfg.edgeB;
		if (th < 0.4) return 'T0';
		if (th <= b[0]) return 'T05';
		if (th < b[1]) return 'T' + (Math.round(th * 100) / 100);          // между классами — нестандарт
		if (th <= b[2]) return 'T1';
		if (th <= b[3]) return 'T15';
		if (th <= b[4]) return 'T2';
		return 'T' + (Math.round(th * 100) / 100);
	}
	E.edgeClass = edgeThickClass;
	/* Подпись класса: одна толщина — пишем её, несколько — диапазон по факту. */
	function edgeClassTitle(cls, list) {
		var arr = [], k;
		for (k in list) if (has(list, k)) arr.push(Number(k));
		arr.sort(function (a, b) { return a - b; });
		if (!arr.length) return cls.substring(1) + ' мм';
		if (arr.length == 1) return f1(arr[0]) + ' мм';
		return f1(arr[0]) + '–' + f1(arr[arr.length - 1]) + ' мм';
	}

	/* ------------------------------ контур детали ------------------------------ */
	/* Элементы контура из файла проекта: { t:'L', a, b } — отрезок, { t:'A', a, b, len } — дуга,
	   { t:'C', c, r } — окружность, null — не прочитан. */

	var GEOM_TOL = 0.1, JOIN_TOL = 0.05;

	function elLen(e) {
		if (!e) return 0;
		if (e.t === 'C') return 2 * Math.PI * (Number(e.r) || 0);
		if (!e.a || !e.b) return 0;
		var d = Math.sqrt(Math.pow(e.b[0] - e.a[0], 2) + Math.pow(e.b[1] - e.a[1], 2));
		if (e.t === 'A') return e.len > 0 ? Number(e.len) : d;
		return d;
	}
	E.elLen = elLen;
	function elemEnds(e) {
		if (!e || !e.a || !e.b) return null;
		var x1 = Number(e.a[0]), y1 = Number(e.a[1]), x2 = Number(e.b[0]), y2 = Number(e.b[1]);
		if (isNaN(x1) || isNaN(y1) || isNaN(x2) || isNaN(y2)) return null;
		return { x1: x1, y1: y1, x2: x2, y2: y2 };
	}
	function elemsBox(els) {
		var b = null;
		for (var i = 0; i < els.length; i++) {
			var e = els[i];
			if (!e) continue;
			var pts = [[e.x1, e.y1], [e.x2, e.y2]];
			for (var k = 0; k < 2; k++) {
				var x = pts[k][0], y = pts[k][1];
				if (!b) b = { x1: x, y1: y, x2: x, y2: y };
				else { if (x < b.x1) b.x1 = x; if (y < b.y1) b.y1 = y; if (x > b.x2) b.x2 = x; if (y > b.y2) b.y2 = y; }
			}
		}
		return b;
	}
	function sidesOf(x, y, bb) {
		var t = GEOM_TOL, s = '';
		if (Math.abs(x - bb.x1) <= t) s += 'L';
		if (Math.abs(x - bb.x2) <= t) s += 'R';
		if (Math.abs(y - bb.y1) <= t) s += 'B';
		if (Math.abs(y - bb.y2) <= t) s += 'T';
		return s;
	}
	/* Внутренние петли контура (окна, вырезы): петля, ни одна точка которой не лежит на габарите. */
	function holeElems(els, bb) {
		var res = {}, used = [], loops = [], i;
		function near(ax, ay, bx, by) { return Math.abs(ax - bx) <= JOIN_TOL && Math.abs(ay - by) <= JOIN_TOL; }
		for (i = 0; i < els.length; i++) used[i] = !els[i];
		for (var st = 0; st < els.length; st++) {
			if (used[st]) continue;
			var loop = [st], ex = els[st].x2, ey = els[st].y2, sx = els[st].x1, sy = els[st].y1;
			used[st] = true;
			var grown = true;
			while (grown && !near(ex, ey, sx, sy)) {
				grown = false;
				for (var j = 0; j < els.length; j++) {
					if (used[j]) continue;
					if (near(els[j].x1, els[j].y1, ex, ey)) { loop.push(j); ex = els[j].x2; ey = els[j].y2; used[j] = true; grown = true; }
					else if (near(els[j].x2, els[j].y2, ex, ey)) { loop.push(j); ex = els[j].x1; ey = els[j].y1; used[j] = true; grown = true; }
					if (near(ex, ey, sx, sy)) break;
				}
			}
			loops.push(loop);
		}
		if (loops.length < 2) return res;
		for (var L = 0; L < loops.length; L++) {
			var touches = false;
			for (var q = 0; q < loops[L].length && !touches; q++) {
				var e = els[loops[L][q]], pts = [[e.x1, e.y1], [e.x2, e.y2]];
				for (var m = 0; m < 2 && !touches; m++) if (sidesOf(pts[m][0], pts[m][1], bb)) touches = true;
			}
			if (touches) continue;
			for (var z = 0; z < loops[L].length; z++) res[loops[L][z]] = 1;
		}
		return res;
	}
	function isStraightSide(e, bb, isHole, arc) {
		if (isHole || !e || !bb) return false;
		var t = GEOM_TOL;
		if (!arc) {
			var sameX = Math.abs(e.x1 - e.x2) <= t, sameY = Math.abs(e.y1 - e.y2) <= t;
			if (sameX && (Math.abs(e.x1 - bb.x1) <= t || Math.abs(e.x1 - bb.x2) <= t)) return true;
			if (sameY && (Math.abs(e.y1 - bb.y1) <= t || Math.abs(e.y1 - bb.y2) <= t)) return true;
		}
		return false;
	}
	/* Разбор контура: map[i] — прямая сторона по габариту (её режет форматник и кромит обычный
	   станок), holes — элементы внутренних петель. Скругление угла короче заданного в настройках
	   тоже считается «прямым» (обычный угол), если такая настройка включена. */
	function contourInfo(src, cfg) {
		var n = src ? src.length : 0;
		if (!n) return null;
		var els = [], arcs = [], i;
		for (i = 0; i < n; i++) { els.push(elemEnds(src[i])); arcs.push(!!src[i] && src[i].t !== 'L'); }
		var bb = elemsBox(els);
		if (!bb) return null;
		var holes = holeElems(els, bb), map = [];
		var lim = cfg.cornerMax > 0 ? Math.min(cfg.cornerMax, (cfg.cornerFrac > 0 ? cfg.cornerFrac / 100 : 1) * Math.min(bb.x2 - bb.x1, bb.y2 - bb.y1)) : 0;
		for (i = 0; i < n; i++) {
			var straight = isStraightSide(els[i], bb, has(holes, i), arcs[i]);
			if (!straight && lim > 0 && arcs[i] && els[i] && !has(holes, i)) { var l = elLen(src[i]); if (l > 0 && l <= lim + 1e-6) straight = true; }
			map.push(straight);
		}
		return { map: map, holes: holes, n: n };
	}
	E._contourInfo = contourInfo;

	/* ----------------------------- обход проекта ------------------------------- */

	function newRes() {
		return { groups: [], gmap: {}, Edges: {}, EdgeN: {}, EdgeLine: {}, EdgeCurved: {}, EdgeThicks: {}, EdgeW: {}, EdgeTh: {}, CurveOut: 0, CurveIn: 0, Cuts2: {}, Holes: {}, totalHoles: 0,
				 Plastics: {}, Linears: {}, LinPieces: {}, Arts: {}, Fasteners: {}, Cup35: {}, KitNames: {}, KitPieces: {}, KitMulti: {}, PIECES: {}, panels: 0,
				 hidden: { count: 0, area: 0 }, offParts: 0, old: false, selected: false, noSel: false,
				 Facades: {}, facNoBlocks: false, facNoSize: 0, MdfFac: {}, Notes: {} };
	}
	/* Прежде артикул можно было вписывать в само название («… . Артикул …»): цены и единицы, записанные в прайс
	   под таким названием, переносятся на название без артикула. */
	var ART_MAPS = ['P', 'OFF', 'REF', 'SQM', 'FUNIT', 'CUNIT', 'EUNIT', 'PLEN', 'LEG'], ART_TAG = '. Артикул ';
	function migrateArtKeys(pl, Arts) {
		var any = false, m, k, n;
		for (m = 0; m < ART_MAPS.length && !any; m++) for (k in pl[ART_MAPS[m]]) if (k.indexOf(ART_TAG) >= 0) { any = true; break; }
		if (!any) return;
		for (n in Arts) {
			if (!has(Arts, n)) continue;
			var old = n + ART_TAG + Arts[n];
			for (m = 0; m < ART_MAPS.length; m++) {
				var map = pl[ART_MAPS[m]], keys = Object.keys(map);
				for (k = 0; k < keys.length; k++) {
					if (keys[k].indexOf(old) < 0) continue;
					var nk = keys[k].split(old).join(n);
					if (!has(map, nk)) map[nk] = map[keys[k]];
					delete map[keys[k]];
				}
			}
		}
	}

	/* Собрать всё, что считает смета, из состояния проекта (st) по настройкам (cfg). */
	E.scan = function (st, cfg) {
		var R = newRes(), raw = st.doc.model, sets = st.work.sets || 1, sel = st.work.scope === 'sel', inc = !!cfg.hidden, i, j;
		cfg._thin = maskList(cfg.thinMask); cfg._glass = maskList(cfg.glassMask);
		cfg._thinTh = String(cfg.thinTh || '').split(/[,;\s]+/).map(Number).filter(function (x) { return x > 0; }).map(Math.round);
		R.old = !raw.est;
		R.selected = sel;
		/* название как в смете; артикул запоминается рядом — он идёт отдельным столбцом и на цену не влияет */
		function mname(name, art) {
			var n = String(name); art = trim(art);
			if (/^нет$/i.test(art)) art = '';                      // БАЗИС пишет «нет», когда артикула нет
			if (art && !has(R.Arts, n)) R.Arts[n] = art;
			return n;
		}

		function note(name, n) { if (n && !has(R.Notes, name)) R.Notes[name] = trim(n); }
		var mdf = P.mdfFacades ? P.mdfFacades(raw) : {};
		/* фасад МДФ в плёнке или эмали: одно покрытие, одни стороны и один размер — одна строка */
		function addMdf(p, k) {
			var f = mdf[p.id];
			if (!f) return;
			var fs = P.facadeSize({ gs: [Number(p.w) || 0, Number(p.h) || 0, Number(p.th) || 0], fr: p.frame }, st.set), coat = mname(f.coat, f.art);
			note(coat, f.note);
			var key = coat + '\n' + f.sides + '\n' + (fs ? fs.h + '×' + fs.w : '');
			if (!R.MdfFac[key]) R.MdfFac[key] = { coat: coat, kind: f.kind, sides: f.sides, h: fs ? fs.h : 0, w: fs ? fs.w : 0, n: 0, title: P.coatTitle({ coat: coat, kind: f.kind }) };
			R.MdfFac[key].n += k;
		}
		function group(mat, th, m) {
			var key = groupKey(mat, th), g = R.gmap[key];
			if (!g) { g = R.gmap[key] = { key: key, mat: mat, th: th, area: 0, perim: 0, count: 0, mats: [], byMat: {} }; R.groups.push(g); }
			if (m && !g.byMat[m.key]) { g.byMat[m.key] = { m: m, area: 0 }; g.mats.push(m); }
			return g;
		}
		function addPanel(g, m, w, h, perim, k) {
			g.area += w * h * k;
			g.perim += (perim > 0 ? perim : 2 * (w + h)) * k;
			g.count += k;
			if (m) g.byMat[m.key].area += w * h * k;
			R.panels += k;
		}
		function addCurveSaw(p, ci, k) {
			if (!ci) return;
			var outL = 0, inL = 0;
			for (var q = 0; q < ci.n; q++) {
				if (ci.map[q]) continue;
				var len = elLen(p.els[q]);
				if (!(len > 0)) continue;
				if (has(ci.holes, q)) inL += len; else outL += len;
			}
			if (outL + inL < 1) return;
			R.CurveOut += outL * k; R.CurveIn += inL * k;
		}
		function addButts(p, ci, k) {
			var B = p.butts || [], nB = B.length, cmap = (nB && ci) ? ci.map : null, cutCurved = {}, q;
			for (q = 0; q < nB; q++) {
				var bcut = Number(B[q].ci);
				if (isNaN(bcut) || bcut < 0) continue;
				if (cmap && cmap[Number(B[q].el)] === false) cutCurved[bcut] = 1;
			}
			for (q = 0; q < nB; q++) {
				var bt = B[q], eIdx = Number(bt.el), bLen = elLen((p.els || [])[eIdx]);
				if (!(bLen > 0)) continue;                         // кромка на элементе, которого в контуре уже нет
				var bmat = mname(bt.mat, bt.art);
				R.Edges[bmat] = (R.Edges[bmat] || 0) + bLen * k;
				R.EdgeN[bmat] = (R.EdgeN[bmat] || 0) + k;          // STHGroup: облицованных сторон — для запаса «мм на сторону»
				var curved = cmap ? (cmap[eIdx] === false) : false, cix = Number(bt.ci);
				if (!isNaN(cix) && cix >= 0 && cutCurved[cix]) curved = true;
				var bTh = edgeThickMm(bt.mat, bt.th), cls = edgeThickClass(cfg, bTh);
				if (!has(R.EdgeLine, cls)) { R.EdgeLine[cls] = 0; R.EdgeCurved[cls] = 0; R.EdgeThicks[cls] = {}; }
				R.EdgeThicks[cls][Math.round(bTh * 100) / 100] = 1;
				if (curved) R.EdgeCurved[cls] += bLen * k; else R.EdgeLine[cls] += bLen * k;
				if (!has(R.EdgeW, bmat)) R.EdgeW[bmat] = Number(bt.w) || 0;
				if (!has(R.EdgeTh, bmat) && bTh > 0) R.EdgeTh[bmat] = bTh;
			}
		}
		function addCuts(p, k) {
			var C = p.cuts || [];
			for (var q = 0; q < C.length; q++) {
				var ct = C[q], nm = mname(ct.name || '', ct.art) || 'Паз без имени', len = Number(ct.len);
				if (!(len >= 0)) { len = 0; for (var z = 0; z < (ct.path || []).length; z++) len += elLen(ct.path[z]); }      // прежняя выгрузка: длины нет, считаем по траектории
				var sect = (ct.sw > 0 && ct.sh > 0) ? (f1(ct.sw) + '×' + f1(ct.sh)) : '';
				var g = R.Cuts2[nm];
				if (!g) g = R.Cuts2[nm] = { name: nm, sign: trim(ct.sign), sect: sect, len: 0, n: 0, notch: 1 };
				g.n += k; g.len += len * k;
				if (len > 0) g.notch = 0;
				if (!g.sect && sect) g.sect = sect;
				if (!g.sign && ct.sign) g.sign = trim(ct.sign);
			}
		}
		function onePanel(p, m, k) {
			var name = mname(m.name, m.art), g = group(name, m.th, m);
			note(name, p.note);
			if (p.plastic) {
				/* облицовка пласти: материал облицовки листами плюс работа «склейка» */
				var pk = 'Склейка ' + name;
				R.Plastics[pk] = (R.Plastics[pk] || 0) + p.w * p.h * k;
				/* скрипт записывал облицовку под толщиной самой панели — по этому ключу в его файле лежит цена */
				if (p.pth > 0 && Math.round(p.pth) !== Math.round(m.th)) g.alt = groupKey(name, p.pth);
				addPanel(g, m, p.w, p.h, 0, k);
				return;
			}
			addMdf(p, k);
			var ci = contourInfo(p.els, cfg);
			addCurveSaw(p, ci, k);
			var perim = Number(p.perim);
			if (!(perim > 0)) { perim = 0; for (var q = 0; q < (p.els || []).length; q++) perim += elLen(p.els[q]); }
			addPanel(g, m, p.w, p.h, perim, k);
			addButts(p, ci, k);
			addCuts(p, k);
		}

		/* листовые панели: по разновидностям раскроя — с его количествами, областью и комплектами */
		var byId = {}, parts = st.model.parts || [];
		for (i = 0; i < parts.length; i++) byId[parts[i].id] = parts[i];
		for (i = 0; i < st.types.length; i++) {
			var t = st.types[i], m = st.matBy[t.mat], tw = st.work.parts[t.sig] || {};
			if (!m) continue;
			if (tw.off) { R.offParts += P.baseCount(st, t) * sets; continue; }
			if (tw.qty !== undefined && tw.qty !== null && tw.qty >= 0) {
				var n = Math.round(tw.qty) * sets;                 // количество задано вручную: все штуки — как первая деталь разновидности
				if (n > 0) onePanel(t.src, m, n);
				continue;
			}
			for (j = 0; j < t.ids.length; j++) {
				var p = byId[t.ids[j]];
				if (!p || (sel && !p.sel)) continue;
				onePanel(p, m, sets);
			}
		}
		/* погонные панели (столешница, плинтус): в листы не идут, но их кромка и пазы считаются */
		var all = raw.parts || [], fac = P.facadeOf(raw, st.set);
		for (i = 0; i < all.length; i++) {
			var lp = all[i];
			if (P.inFacade(fac, lp)) continue;                     // деталь заказного фасада: фасад считается целиком
			if (lp.hid && !lp.lin && !lp.plastic && !inc) { R.hidden.count++; R.hidden.area += (lp.w * lp.h) / 1e6; }
			if (!lp.lin || (lp.hid && !inc) || (sel && !lp.sel)) continue;
			var lci = contourInfo(lp.els, cfg);
			addButts(lp, lci, sets);
			addCuts(lp, sets);
			/* сама погонная панель — куском своей длины */
			var lpn = mname(lp.mat, lp.art), lpL = Math.round(Math.max(Number(lp.w) || 0, Number(lp.h) || 0));
			if (lpL > 0) { if (!R.LinPieces[lpn]) R.LinPieces[lpn] = []; for (j = 0; j < sets; j++) R.LinPieces[lpn].push(lpL); }
		}

		/* петли заказного фасада (с ответной планкой, заглушками, саморезами) идут в смету, если так в настройках */
		var hingeBk = cfg.facHinges ? P.hingeBlocks(raw) : [];
		function use(r, hinge) { return (inc || !r.hid) && (!sel || r.sel) && (!P.inFacade(fac, r) || (hinge && hingeBk[r.bk])); }
		/* отверстия: только настоящего крепежа — как в скрипте */
		var holes = raw.holes || [], anySel = false;
		for (i = 0; i < holes.length; i++) if (holes[i].sel) { anySel = true; break; }
		if (sel && R.old) R.noSel = true;                       // прежняя выгрузка не знает, какие отверстия выделены
		for (i = 0; i < holes.length; i++) {
			var h = holes[i];
			if (P.inFacade(fac, h)) continue;
			if (!R.old && !h.est) continue;
			if (h.hid && !inc) continue;
			if (sel && !R.old && !h.sel) continue;
			if (!(h.dia > 0)) continue;
			var dia = Number(Number(h.dia).toFixed(1)), dep = Number(Number(h.depth || 0).toFixed(1));
			var hk = (h.mode == 1) ? String(dia) : (dia + ' x ' + dep);
			R.Holes[hk] = (R.Holes[hk] || 0) + sets;
			R.totalHoles += sets;
		}
		/* фурнитура штуками и комплекты */
		var list = raw.fast || [];
		for (i = 0; i < list.length; i++) {
			if (!use(list[i], 1)) continue;
			var fn = mname(list[i].name, list[i].art);
			note(fn, list[i].note);
			R.Fasteners[fn] = (R.Fasteners[fn] || 0) + list[i].n * sets;
			if (list[i].cup) R.Cup35[fn] = 1;
		}
		list = raw.kits || [];
		for (i = 0; i < list.length; i++) {
			if (!use(list[i], 1)) continue;
			var kn = mname(list[i].name, list[i].art);
			note(kn, list[i].note);
			R.Fasteners[kn] = (R.Fasteners[kn] || 0) + list[i].n * sets;
			R.KitNames[kn] = 1;
			R.KitPieces[kn] = (R.KitPieces[kn] || 0) + (list[i].pcs || list[i].n) * sets;
			if (list[i].multi) R.KitMulti[kn] = 1;
		}
		/* профили: длины кусков */
		list = raw.prof || [];
		for (i = 0; i < list.length; i++) {
			if (!use(list[i])) continue;
			var pn = mname(list[i].name, list[i].art), L = Math.round(list[i].len);
			if (!(L > 0)) continue;
			if (!R.PIECES[pn]) R.PIECES[pn] = [];
			for (j = 0; j < list[i].n * sets; j++) R.PIECES[pn].push(L);
		}
		/* заказные фасады: штуками, одно название и один размер — одна строка */
		var B = raw.blocks || [];
		if (cfg.facArts.length && !raw.blocks) R.facNoBlocks = true;
		for (i = 0; i < B.length; i++) {
			if (fac[i] !== i) continue;                             // не фасад или фасад внутри другого фасада
			var fb = B[i];
			if ((fb.hid && !inc) || (sel && !fb.sel)) continue;
			var fs = P.facadeSize(fb, st.set), fnm = mname(fb.name, /^\s*@/.test(fb.art || '') ? '' : fb.art);      // «@…» — пометка, а не артикул
			if (!fs) R.facNoSize++;
			var fk = fnm + '\n' + (fs ? fs.h + '×' + fs.w : '');
			if (!R.Facades[fk]) R.Facades[fk] = { name: fnm, h: fs ? fs.h : 0, w: fs ? fs.w : 0, d: fs ? fs.d : 0, n: 0 };
			R.Facades[fk].n += sets;
		}
		/* погонные материалы: метрами, справочно */
		list = raw.lin || [];
		for (i = 0; i < list.length; i++) {
			if (!use(list[i])) continue;
			var ln = mname(list[i].name, list[i].art);
			R.Linears[ln] = (R.Linears[ln] || 0) + list[i].len * sets;
		}
		/* погонный материал, у которого нет панели (тело вращения, прежняя выгрузка): остаток длины — одним куском */
		for (var lk in R.Linears) {
			if (!has(R.Linears, lk)) continue;
			var got = 0, lpc = R.LinPieces[lk] || (R.LinPieces[lk] = []);
			for (j = 0; j < lpc.length; j++) got += lpc[j];
			if (R.Linears[lk] - got > 1) lpc.push(Math.round(R.Linears[lk] - got));
			if (!lpc.length) delete R.LinPieces[lk];
		}
		return R;
	};

	/* ---------------------------- листы из раскроя ----------------------------- */

	/* Сколько листов группы материала и какая длина реза — по раскрою программы. Детали, которые
	   раскрой не разложил (не влезли, лежат в буфере), и материалы без раскроя — по площади. */
	function sheetsOf(st, g, sm) {
		var o = { n: 0, rem: 0, saw: 0, byArea: 0, lost: 0, laid: 0, L: 0, W: 0 }, q;
		for (q = 0; q < g.mats.length; q++) {
			var m = g.mats[q], row = sm[m.key], f = P.fmtOf(m), A = f.L * f.W, lay = st.work.layout[m.key], ar = g.byMat[m.key].area;
			if (!o.L) { o.L = f.L; o.W = f.W; }
			if (!(ar > 0)) continue;
			if (row && row.on && lay) {
				var lost = 0, list = (lay.unplaced || []).concat(lay.buf || []);
				for (var z = 0; z < list.length; z++) { var t = st.typeBy[list[z].t]; if (t) lost += t.L * t.W; }
				o.n += row.std; o.rem += row.rem; o.saw += row.saw; o.laid += row.std + row.rem;
				if (lost > 0) { o.n += Math.max(1, Math.ceil(lost / A - 0.001)); o.lost += list.length; }
			} else {
				o.n += Math.max(1, Math.ceil(ar / A - 0.001));
				o.byArea = 1;
			}
		}
		return o;
	}

	/* ------------------------------ расчёт сметы ------------------------------- */

	var HEAD_GROUP = { 'ПЛИТНЫЙ МАТЕРИАЛ': 'МАТЕРИАЛ', 'КРОМОЧНЫЙ МАТЕРИАЛ': 'МАТЕРИАЛ', 'ПОГОННЫЙ МАТЕРИАЛ': 'МАТЕРИАЛ', 'РАСПИЛ': 'РАБОТЫ', 'КРОМКОВАНИЕ': 'РАБОТЫ', 'ОБЛИЦОВКА': 'РАБОТЫ',
					   'ПАЗЫ': 'РАБОТЫ', 'УПАКОВКА': 'РАБОТЫ', 'ОТВЕРСТИЯ': 'РАБОТЫ', 'ПРОЧЕЕ': 'ПРОЧЕЕ', 'ФУРНИТУРА': 'ФУРНИТУРА', 'ПРОФИЛИ': 'ФУРНИТУРА',
						   'ЗАКАЗНЫЕ ФАСАДЫ': 'ФУРНИТУРА', 'ФАСАДЫ МДФ': 'ФУРНИТУРА', 'ДОПОЛНИТЕЛЬНЫЕ МАТЕРИАЛЫ': 'ДОПОЛНИТЕЛЬНЫЕ МАТЕРИАЛЫ' };
	var HEAD_ORDER = ['ПЛИТНЫЙ МАТЕРИАЛ', 'КРОМОЧНЫЙ МАТЕРИАЛ', 'ПОГОННЫЙ МАТЕРИАЛ', 'РАСПИЛ', 'КРОМКОВАНИЕ', 'ОБЛИЦОВКА', 'ПАЗЫ', 'УПАКОВКА', 'ОТВЕРСТИЯ', 'ФУРНИТУРА', 'ПРОФИЛИ', 'ЗАКАЗНЫЕ ФАСАДЫ', 'ФАСАДЫ МДФ', 'ДОПОЛНИТЕЛЬНЫЕ МАТЕРИАЛЫ', 'ПРОЧЕЕ'];
	/* «Дополнительные материалы» — только свои строки (из БАЗИСа их не достать); наценка — как у материала */
	var GROUP_MK = { 'МАТЕРИАЛ': 'M', 'РАБОТЫ': 'W', 'ФУРНИТУРА': 'F', 'ДОПОЛНИТЕЛЬНЫЕ МАТЕРИАЛЫ': 'M' };
	E.GROUPS = ['МАТЕРИАЛ', 'РАБОТЫ', 'ФУРНИТУРА', 'ДОПОЛНИТЕЛЬНЫЕ МАТЕРИАЛЫ', 'ПРОЧЕЕ'];
	E.DOP = 'ДОПОЛНИТЕЛЬНЫЕ МАТЕРИАЛЫ';
	/* группа, в которой один раздел с тем же названием («ПРОЧЕЕ»): заголовок печатается один раз */
	E.soloGroup = function (head) {
		if (E.headGroup(head) !== head) return false;
		for (var h in HEAD_GROUP) if (has(HEAD_GROUP, h) && h !== head && HEAD_GROUP[h] === head) return false;
		return true;
	};
	E.HEAD_ORDER = HEAD_ORDER;
	E.headGroup = function (head) { return has(HEAD_GROUP, head) ? HEAD_GROUP[head] : ''; };
	E.headRank = function (head) { var k = HEAD_ORDER.indexOf(head); return k < 0 ? HEAD_ORDER.length : k; };

	function panelPriceId(cfg, mat, thickness) {
		var t = Math.round(thickness || 0);
		if (isThinSheet(cfg, mat, t)) return 'HDF';
		if (mat.match(/мдф/i)) return 'MDF';
		if (mat.match(/шпон/i)) return 'Veneer';
		if (mat.match(/agt/i)) return 'AGT';
		if (t === 25) return 'LDSP25';
		return 'LDSP16';
	}
	function profileLenFromName(cfg, name) {
		var s = String(name), m, c = [];
		m = s.match(/(?:^|[^A-Za-zА-Яа-яЁё])L\s*[-=:]?\s*(\d{3,4})(?!\d)/i);
		if (m) c.push(Number(m[1]));
		m = s.match(/(?:^|[^\d.,])(\d{3,4})\s*мм/i);
		if (m) c.push(Number(m[1]));
		m = s.match(/(?:^|[^\d.,])(\d(?:[.,]\d{1,2})?)\s*м(?![A-Za-zА-Яа-яЁё])/i);
		if (m) c.push(Math.round(Number(m[1].replace(',', '.')) * 1000));
		for (var i = 0; i < c.length; i++) if (cfg.profLens.indexOf(c[i]) >= 0) return c[i];
		return cfg.profLens.indexOf(cfg.profDef) >= 0 ? cfg.profDef : cfg.profLens[0];
	}
	E.lenTitle = function (len) {
		var m = len / 1000;
		return (Math.abs(m - Math.round(m)) < 0.0001 ? String(Math.round(m)) : String(Math.round(m * 100) / 100).replace('.', ',')) + ' м';
	};
	function piecesText(arr, limit) {
		var cnt = {}, keys = [], i, L;
		for (i = 0; i < arr.length; i++) { L = arr[i]; if (!has(cnt, L)) { cnt[L] = 0; keys.push(L); } cnt[L]++; }
		keys.sort(function (a, b) { return b - a; });
		var out = [], lim = limit || 6;
		for (i = 0; i < keys.length && i < lim; i++) out.push(keys[i] + (cnt[keys[i]] > 1 ? '×' + cnt[keys[i]] : ''));
		if (keys.length > lim) out.push('…');
		return out.join('/');
	}
	/* Раскладка кусков профиля по хлыстам: самый длинный — первым, в первый хлыст, куда входит. */
	function packBars(pieces, L, reserve, kerf) {
		var use = L - reserve, EPS = 0.01;
		if (!(use > 0)) use = L;
		var list = pieces.slice(0);
		list.sort(function (a, b) { return b - a; });
		var bars = [], over = [], extra = 0, i, j;
		for (i = 0; i < list.length; i++) {
			var p = list[i], ok = false;
			if (p > use + EPS) { over.push(p); extra += Math.ceil(p / use - 0.0001); continue; }
			for (j = 0; j < bars.length && !ok; j++) {
				var need = p + kerf;
				if (need <= bars[j].free + EPS) { bars[j].free -= need; bars[j].items.push(p); ok = true; }
			}
			if (!ok) bars.push({ free: use - p, items: [p] });
		}
		return { count: bars.length + extra, bars: bars, over: over, use: use };
	}
	E._packBars = packBars;
	function edgeTitle(key) { return /^кромк/i.test(String(key)) ? String(key) : ('Кромка ' + key); }
	function shortUnit(u) {
		if (u.indexOf('листов') === 0) return 'л.';
		if (u.indexOf('метров') === 0) return 'м';
		return u;
	}
	function priceUnit(pu) { return String(pu || '').replace(/^руб\./, 'р.').replace('/метр PUR', '/м PUR').replace('/метр', '/м').replace('/лист', '/л.'); }
	E.shortUnit = shortUnit; E.priceUnit = priceUnit;

	/* Построить смету. st — состояние проекта, cfg — настройки сметы (E.conf), pl — прайс,
	   we — данные сметы в проекте (st.work.est). Возвращает отчёт: строки, разделы, итоги. */
	E.build = function (st, cfg, pl, we, sup) {
		we = we || {};
		var Res = E.scan(st, cfg), QTY = we.qty || {}, ROWS = [];
		migrateArtKeys(pl, Res.Arts);
		var summ = P.summary(st), sm = {}, i, key, r;
		for (i = 0; i < summ.mats.length; i++) sm[summ.mats[i].mat.key] = summ.mats[i];
		var R = { res: Res, rows: ROWS, warns: [], infos: [], sections: [], lists: [], unacc: [], groups: {}, sub: 0, disc: 0, discSum: 0, grand: 0, totalSheets: 0, packArea: 0, manual: 0, cfg: cfg, pl: pl.name,
				  mk: { M: Number(pl.mk.M) || 0, W: Number(pl.mk.W) || 0, F: Number(pl.mk.F) || 0 } };
		R.supMap = sup || null;

		function getPrice(id, dflt) { return has(pl.P, id) ? pl.P[id] : dflt; }
		function clsSheet(pid) { return pl.cls[pid] ? pl.cls[pid].val : 0; }
		function clsM2(pid) { return pl.cls[pid] ? pl.cls[pid].m2 : 0; }
		function mkRow(o) {
			o.i = ROWS.length;
			/* наименование и артикул: из модели или вписанные вручную (в прайс; у своей строки — в проект) */
			o.name0 = o.kind === 'profile' ? o.pname : o.label;
			o.art0 = (o.akey && has(Res.Arts, o.akey)) ? Res.Arts[o.akey] : '';
			if (o.own) { o.title = o.label; o.art = o.art || ''; }
			else {
				o.renamed = (o.offKey && has(pl.NAME, o.offKey) && pl.NAME[o.offKey]) ? 1 : 0;
				o.title = o.renamed ? pl.NAME[o.offKey] : o.name0;
				o.artSet = (o.offKey && has(pl.ART, o.offKey) && pl.ART[o.offKey]) ? 1 : 0;
				o.art = o.artSet ? pl.ART[o.offKey] : o.art0;
			}
			o.group = E.headGroup(o.head);
			/* поставщик и фото — по названию материала (фурнитуры), общие для всех прайсов */
			o.skey = o.own ? '' : (o.akey || o.name0);
			o.sup = E.supFor(sup, o.skey, Res.Notes);
			o.mkind = E.kindFor(o.skey);
			o.off = (o.offKey && has(pl.OFF, o.offKey) && pl.OFF[o.offKey]) ? 1 : 0;
			o.manual = !!(o.qtyKey && has(QTY, o.qtyKey));
			o.val = o.manual ? Number(QTY[o.qtyKey]) : o.calc;
			if (o.price === undefined) o.price = (o.priceAlt && !has(pl.P, o.priceId) && has(pl.P, o.priceAlt)) ? pl.P[o.priceAlt] : getPrice(o.priceId, o.priceDef);
			/* справочная строка: количество считается и видно, но в деньги не идёт; цена при этом хранится */
			o.info = (!o.off && o.infoKey && has(pl.REF, o.infoKey)) ? 1 : 0;
			o.mk = R.mk[GROUP_MK[o.group]] || 0;
			o.priceOut = Math.round(o.price * (1 + o.mk / 100) * 100) / 100;      // цена с наценкой — она и печатается
			o.sum = (o.off || o.info) ? 0 : Math.round(o.val * o.price * (1 + o.mk / 100));
			if (o.manual) R.manual = 1;
			ROWS.push(o);
			return o;
		}

		var totalSheets = 0, cutSheets = 0, thinSheets = 0, sqmUsed = 0, cutPerim = 0, thinPerim = 0, cutSaw = 0, thinSaw = 0, packArea = 0, unplaced = 0, byArea = 0, laid = 0;

		/* ---------------- плита ---------------- */
		var groups = Res.groups.slice(0);
		groups.sort(function (x, y) { var mx = low(x.mat), my = low(y.mat); if (mx != my) return (mx < my) ? -1 : 1; return x.th - y.th; });
		function defaultSqm(gkey) { if (String(gkey).indexOf('MFAC:') === 0) return 1; var g = has(Res.gmap, gkey) ? Res.gmap[gkey] : null; return (g && isGlass(cfg, g.mat)) ? 1 : 0; }
		function isSqm(gkey) { return has(pl.SQM, gkey) ? (pl.SQM[gkey] ? 1 : 0) : defaultSqm(gkey); }
		R._defaultSqm = defaultSqm;
		for (var gi = 0; gi < groups.length; gi++) {
			var g = groups[gi], areaM2 = g.area / 1000000;
			if (areaM2 <= 0) continue;
			var pid = panelPriceId(cfg, g.mat, g.th), sqm = isSqm(g.key), title = groupTitle(g);
			var isOff = (has(pl.OFF, 'P:' + g.key) && pl.OFF['P:' + g.key]) ? 1 : 0;
			var sh = sheetsOf(st, g, sm), thin = isThinSheet(cfg, g.mat, g.th);
			g.sheets = sh; g.thin = thin;
			if (!isOff) {
				if (!sqm) {
					totalSheets += sh.n;
					var pm = g.perim / 1000, sw = sh.saw / 1000;
					if (thin) { thinSheets += sh.n; thinPerim += pm; thinSaw += sw; }
					else { cutSheets += sh.n; cutPerim += pm; cutSaw += sw; }
					unplaced += sh.lost; byArea += sh.byArea; laid += sh.laid;
				}
				packArea += areaM2;
				if (sqm) sqmUsed = 1;
			}
			var shNote = sh.byArea ? 'по площади' : ('раскрой: ' + sh.n + ' л.' + (sh.rem ? ' + ' + sh.rem + ' ост.' : ''));
			if (sqm) {
				mkRow({ kind: 'panel', head: 'ПЛИТНЫЙ МАТЕРИАЛ', label: title, akey: g.mat, gkey: g.key, sqm: 1, u0: 'листы', u1: 'кв.м', offKey: 'P:' + g.key, infoKey: 'P:' + g.key,
						qtyKey: 'P:' + g.key, calc: Math.round(areaM2 * 100) / 100, unit: 'кв.м', priceId: 'Q:' + g.key, priceAlt: g.alt ? 'Q:' + g.alt : '', priceDef: clsM2(pid), punit: 'руб./кв.м', note: shNote });
			} else {
				mkRow({ kind: 'panel', head: 'ПЛИТНЫЙ МАТЕРИАЛ', label: title, akey: g.mat, gkey: g.key, sqm: 0, u0: 'листы', u1: 'кв.м', offKey: 'P:' + g.key, infoKey: 'P:' + g.key,
						qtyKey: 'P:' + g.key, calc: sh.n, unit: 'листов', priceId: 'S:' + g.key, priceAlt: g.alt ? 'S:' + g.alt : '', priceDef: clsSheet(pid), punit: 'руб./лист',
						note: f2(areaM2) + ' кв.м' + (sh.rem ? ' · остатков ' + sh.rem : '') + (sh.byArea ? ' · по площади' : '') });
			}
		}

		/* ---------------- кромка ---------------- */
		var kEdge = 1 + cfg.edgeReserve / 100, edgeKeys = sortedKeys(Res.Edges);
		for (i = 0; i < edgeKeys.length; i++) {
			key = edgeKeys[i];
			var raw = Res.Edges[key] / 1000, byMm = cfg.edgeMode === 'mm', nSides = (Res.EdgeN && Res.EdgeN[key]) || 0;
			var eCalc = byMm ? raw + nSides * (Number(cfg.edgeMm) || 0) / 1000 : raw * kEdge;
			mkRow({ kind: 'edge', head: 'КРОМОЧНЫЙ МАТЕРИАЛ', label: edgeTitle(key), akey: key, offKey: 'E:' + key, infoKey: 'E:' + key, emat: key,
					qtyKey: 'E:' + key, calc: Math.round(eCalc * 100) / 100, unit: byMm ? 'метров (+' + cfg.edgeMm + ' мм × ' + nSides + ')' : 'метров (+' + cfg.edgeReserve + '%)',
					priceId: 'E:' + key, priceDef: pl.def.edge, punit: 'руб./метр', note: 'по модели ' + f2(raw) + ' м' });
		}

		/* ---------------- погонный материал ---------------- */
		/* столешницы, стеновые панели: длина есть, ширины нет — считаются как профили: штуками стандартной длины или метрами */
		var lKeys = sortedKeys(Res.LinPieces);
		for (i = 0; i < lKeys.length; i++) {
			var ln = lKeys[i], lpcs = Res.LinPieces[ln], ltot = 0, lmax = 0, lk2 = 'L:' + ln, lpk = null;
			for (var li = 0; li < lpcs.length; li++) { ltot += lpcs[li]; if (lpcs[li] > lmax) lmax = lpcs[li]; }
			var llens = cfg.linLens.slice(0).sort(function (a, b) { return a - b; }), llDef = llens[llens.length - 1];
			for (li = llens.length - 1; li >= 0; li--) if (llens[li] >= lmax) llDef = llens[li];
			var ll = has(pl.PLEN, lk2) ? pl.PLEN[lk2] : llDef;
			if (ll > 0) lpk = packBars(lpcs, ll, 0, cfg.profKerf);
			r = mkRow({ kind: 'linear', head: 'ПОГОННЫЙ МАТЕРИАЛ', label: ln, akey: ln, lname: ln, plen: ll, plenDef: llDef, ptot: ltot, pieces: piecesText(lpcs),
						offKey: lk2, infoKey: lk2, qtyKey: lk2, calc: lpk ? lpk.count : Math.round(ltot / 10) / 100, unit: lpk ? 'шт' : 'м', utail: lpk ? (' по ' + E.lenTitle(ll)) : '',
						priceId: lpk ? ('LL' + ll + ':' + ln) : ('LM:' + ln), priceDef: 0, punit: lpk ? 'руб./шт' : 'руб./м', note: f2(ltot / 1000) + ' м' });
			r.bad = (lpk && lpk.over.length) ? ('не влезает в ' + E.lenTitle(ll) + ': ' + piecesText(lpk.over, 3) + ', посчитано стыком') : '';
		}

		/* ---------------- распил ---------------- */
		function cutNote(hasThin, hasSqm) {
			if (hasThin && hasSqm) return 'без ХДФ/ДВП и кв.м';
			if (hasThin) return 'без ХДФ/ДВП';
			if (hasSqm) return 'без материалов в кв.м';
			return '';
		}
		function cutRow(label, ckey, sheets, perim, saw, pid, defS, note) {
			var cu = has(pl.CUNIT, ckey) ? pl.CUNIT[ckey] : 0;
			var q = cu == 2 ? Math.round(saw * 100) / 100 : (cu == 1 ? Math.round(perim * 100) / 100 : sheets);
			mkRow({ kind: 'cut', head: 'РАСПИЛ', label: label, cname: ckey, cunit: cu, offKey: ckey, qtyKey: ckey, calc: q, unit: cu ? 'метров' : 'листов',
					priceId: cu == 2 ? (pid + 'S') : (cu == 1 ? (pid + 'M') : pid), priceDef: cu ? 0 : defS, punit: cu ? 'руб./метр' : 'руб./лист',
					note: cu ? (fmt(sheets) + ' л.') : note });
		}
		if (cutSheets > 0 || has(QTY, 'CUT')) cutRow('Распил', 'CUT', cutSheets, cutPerim, cutSaw, 'Cut', pl.def.cut, cutNote(thinSheets > 0, sqmUsed));
		if (thinSheets > 0 || has(QTY, 'CUTTHIN')) cutRow('Распил ХДФ/ДВП', 'CUTTHIN', thinSheets, thinPerim, thinSaw, 'CutThin', pl.def.cutthin, '');
		/* криволинейный пил — отдельной строкой: делается на другом станке после форматного раскроя */
		var curveM = Math.round((Res.CurveOut + Res.CurveIn) / 10) / 100;
		if (curveM > 0 || has(QTY, 'CUTCURVE')) {
			var cv = [];
			if (Res.CurveOut > 0) cv.push('контур ' + f2(Res.CurveOut / 1000) + ' м');
			if (Res.CurveIn > 0) cv.push('вырезы ' + f2(Res.CurveIn / 1000) + ' м');
			mkRow({ kind: 'curvecut', head: 'РАСПИЛ', label: 'Криволинейный пил', pieces: cv.join(' · '), offKey: 'CUTCURVE', qtyKey: 'CUTCURVE', calc: curveM, unit: 'метров',
					priceId: 'CutCurve', priceDef: 0, punit: 'руб./метр', note: '' });
		}

		/* ---------------- кромкование ---------------- */
		function edgeWorkRow(label, ekey, metres, pid, note) {
			if (!(metres > 0) && !has(QTY, ekey)) return;
			var eu = has(pl.EUNIT, ekey) ? pl.EUNIT[ekey] : 0;
			mkRow({ kind: 'edgework', head: 'КРОМКОВАНИЕ', label: label, ename: ekey, eunit: eu, offKey: ekey, qtyKey: ekey, calc: metres, unit: 'метров',
					priceId: eu ? (pid + 'P') : pid, priceDef: 0, punit: eu ? 'руб./метр PUR' : 'руб./метр', note: eu ? (note ? note + ' · PUR' : 'PUR') : note });
		}
		var clsAll = {}, cK, clsList = [];
		for (cK in Res.EdgeLine) if (has(Res.EdgeLine, cK)) clsAll[cK] = 1;
		for (cK in Res.EdgeCurved) if (has(Res.EdgeCurved, cK)) clsAll[cK] = 1;
		for (cK in clsAll) if (has(clsAll, cK)) clsList.push(cK);
		clsList.sort(function (x, y) {
			function mid(c) { var t = Res.EdgeThicks[c], best = 999, q; for (q in t) if (has(t, q) && Number(q) < best) best = Number(q); return best; }
			return mid(x) - mid(y);
		});
		for (i = 0; i < clsList.length; i++) {
			var cls = clsList[i], ctitle = edgeClassTitle(cls, Res.EdgeThicks[cls] || {});
			if (Res.EdgeLine[cls] > 0) edgeWorkRow('Прямолинейная ' + ctitle, 'EDGELINE_' + cls, Math.round(Res.EdgeLine[cls] / 10) / 100, 'EdgeWorkL_' + cls, '');
			if (Res.EdgeCurved[cls] > 0) edgeWorkRow('Криволинейная ' + ctitle, 'EDGECURVE_' + cls, Math.round(Res.EdgeCurved[cls] / 10) / 100, 'EdgeWorkC_' + cls, 'выпилы, радиусы');
		}

		/* ---------------- облицовка ---------------- */
		var plKeys = sortedKeys(Res.Plastics);
		for (i = 0; i < plKeys.length; i++) {
			mkRow({ kind: 'plast', head: 'ОБЛИЦОВКА', label: plKeys[i], offKey: 'PL:' + plKeys[i], qtyKey: 'PL:' + plKeys[i], calc: Math.round(Res.Plastics[plKeys[i]] / 10000) / 100, unit: 'кв.м',
					priceId: 'PL:' + plKeys[i], priceDef: pl.def.plast, punit: 'руб./кв.м', note: '' });
		}

		/* ---------------- пазы и выемки ---------------- */
		var cKeys = cfg.showCuts ? sortedKeys(Res.Cuts2) : [];
		for (i = 0; i < cKeys.length; i++) {
			var cg = Res.Cuts2[cKeys[i]], isNotch = cg.notch || !(cg.len > 0);
			/* сечение и обозначение часто одно и то же, только записано по-разному («4×8» и «4x8») — второй раз не повторяем */
			var sameSign = cg.sign.replace(/[xх×*]/gi, '×').replace(/\s+/g, '') === cg.sect.replace(/\s+/g, '');
			mkRow({ kind: isNotch ? 'notch' : 'groove', head: 'ПАЗЫ', label: cg.name, akey: cg.name, pieces: cg.sect + (cg.sign && !sameSign ? (cg.sect ? ' · ' : '') + cg.sign : ''),
					offKey: 'G:' + cg.name, qtyKey: 'G:' + cg.name, calc: isNotch ? cg.n : Math.round(cg.len / 10) / 100, unit: isNotch ? 'шт' : 'метров',
					priceId: (isNotch ? 'GN:' : 'GM:') + cg.name, priceDef: isNotch ? 0 : pl.def.groove, punit: isNotch ? 'руб./шт' : 'руб./метр', note: isNotch ? '' : (fmt(cg.n) + ' шт') });
		}

		/* ---------------- отверстия ---------------- */
		if (cfg.showHoles) {
			var hKeys = sortedKeys(Res.Holes);
			hKeys.sort(function (a, b) { var da = parseFloat(a), db = parseFloat(b); return (da - db) || (a < b ? -1 : 1); });
			for (i = 0; i < hKeys.length; i++) {
				mkRow({ kind: 'hole', head: 'ОТВЕРСТИЯ', label: 'Ø ' + hKeys[i].replace(' x ', ' × ').replace(/\./g, ','), offKey: 'H:' + hKeys[i], qtyKey: 'H:' + hKeys[i], calc: Res.Holes[hKeys[i]], unit: 'шт',
						priceId: 'H:' + hKeys[i], priceDef: pl.def.hole, punit: 'руб./шт', note: '' });
			}
		}

		/* ---------------- упаковка ---------------- */
		if (packArea > 0) {
			var bySheet = isSqm('PACK');
			mkRow({ kind: 'pack', head: 'УПАКОВКА', label: 'Упаковка', offKey: 'PACK', gkey: 'PACK', u0: 'кв.м', u1: 'листы', sqm: bySheet, qtyKey: 'PACK',
					calc: bySheet ? totalSheets : Math.round(packArea * 100) / 100, unit: bySheet ? 'листов' : 'кв.м',
					priceId: bySheet ? 'PackSheet' : 'Pack', priceDef: bySheet ? pl.def.packsheet : pl.def.pack, punit: bySheet ? 'руб./лист' : 'руб./кв.м',
					note: bySheet ? (f2(packArea) + ' кв.м') : (totalSheets + ' л.') });
		}

		/* ---------------- фурнитура ---------------- */
		var hingeStart = getPrice('Hinge', pl.def.hinge);
		function isHinge(n) { return /петл/i.test(String(n)) || has(Res.Cup35, n); }
		function defaultFunit(n) {
			if (has(Res.KitMulti, n)) return 1;
			var Bs = G.BM.base, bm = Bs && Bs.cur ? Bs.cur.mats[n] : null;             // единица из базы материалов БАЗИСа: «компл.» — комплектами
			return bm && bm.bz && /^компл/i.test(bm.bz.unit || '') ? 1 : 0;
		}
		R._defaultFunit = defaultFunit;
		if (cfg.showFast) {
			var fk = sortedKeys(Res.Fasteners);
			for (i = 0; i < fk.length; i++) {
				var fnm = fk[i];
				/* цена из старого файла скрипта (без единиц): у комплектов она была за комплект */
				if (has(pl.LEG, fnm)) {
					delete pl.LEG[fnm];
					var oldU = has(pl.FUNIT, fnm) ? pl.FUNIT[fnm] : (has(Res.KitNames, fnm) ? 1 : 0);
					if (oldU == 1 && has(pl.P, 'F:' + fnm) && !has(pl.P, 'FK:' + fnm)) { pl.P['FK:' + fnm] = pl.P['F:' + fnm]; delete pl.P['F:' + fnm]; }
				}
				var fu = has(pl.FUNIT, fnm) ? pl.FUNIT[fnm] : defaultFunit(fnm), isKit = has(Res.KitNames, fnm);
				var nPcs = isKit ? (Res.KitPieces[fnm] || Res.Fasteners[fnm]) : Res.Fasteners[fnm], nKits = Math.ceil(nPcs / 2), fnote = '';
				if (fu && nPcs != nKits) fnote = fmt(nPcs) + ' шт';
				else if (!fu && isKit && nPcs != nKits) fnote = fmt(nKits) + ' компл.';
				mkRow({ kind: 'fastener', head: 'ФУРНИТУРА', label: fnm, akey: fnm, fname: fnm, funit: fu, offKey: 'F:' + fnm, qtyKey: 'F:' + fnm, calc: fu ? nKits : nPcs, unit: fu ? 'компл.' : 'шт',
						priceId: (fu ? 'FK:' : 'F:') + fnm, priceDef: fu ? pl.def.fastener : (isHinge(fnm) ? hingeStart : pl.def.fastener), punit: fu ? 'руб./компл.' : 'руб./шт', note: fnote });
			}
		}

		/* ---------------- профили ---------------- */
		var pKeys = cfg.showProf ? sortedKeys(Res.PIECES) : [];
		for (i = 0; i < pKeys.length; i++) {
			var pn = pKeys[i], pcs = Res.PIECES[pn], ptot = 0;
			for (var pi = 0; pi < pcs.length; pi++) ptot += pcs[pi];
			var lenDef = profileLenFromName(cfg, pn), plen = has(pl.PLEN, pn) ? pl.PLEN[pn] : lenDef, pk = null;
			if (plen > 0) pk = packBars(pcs, plen, cfg.profReserve, cfg.profKerf);
			r = mkRow({ kind: 'profile', head: 'ПРОФИЛИ', label: pn + ' (' + piecesText(pcs) + ')', akey: pn, pname: pn, plen: plen, plenDef: lenDef, ptot: ptot, pieces: piecesText(pcs),
						offKey: 'R:' + pn, qtyKey: 'R:' + pn, calc: pk ? pk.count : Math.round(ptot / 10) / 100, unit: pk ? 'шт' : 'м', utail: pk ? (' по ' + E.lenTitle(plen)) : '',
						priceId: pk ? ('RL' + plen + ':' + pn) : ('RM:' + pn), priceDef: 0, punit: pk ? 'руб./шт' : 'руб./м', note: f2(ptot / 1000) + ' м' });
			r.bad = '';
			if (pk && pk.over.length) r.bad = 'не влезает в ' + E.lenTitle(plen) + ' (полезно ' + Math.round(pk.use) + ' мм): ' + piecesText(pk.over, 3) + ', посчитано стыком';
		}

		/* ---------------- заказные фасады ---------------- */
		/* штуками или за кв.м — переключатель у вида фасада (одно название — один выбор); цена за штуку — своя
		   у каждого размера, за кв.м — одна на вид */
		var facKeys = sortedKeys(Res.Facades);
		facKeys.sort(function (a, b) { var x = Res.Facades[a], y = Res.Facades[b]; return (low(x.name) < low(y.name) ? -1 : (low(x.name) > low(y.name) ? 1 : 0)) || (y.h - x.h) || (y.w - x.w); });
		for (i = 0; i < facKeys.length; i++) {
			var fc = Res.Facades[facKeys[i]], fsz = fc.h ? (fc.h + '×' + fc.w) : '', fg = 'FAC:' + fc.name, fsq = isSqm(fg), farea = Math.round(fc.n * fc.h * fc.w / 10000) / 100, fkey = 'FC:' + fc.name + (fsz ? ' ' + fsz : '');
			mkRow({ kind: 'facade', head: 'ЗАКАЗНЫЕ ФАСАДЫ', label: fc.name + (fsz ? ' ' + fsz : ''), akey: fc.name, fname: fc.name, fsize: fsz, fn: fc.n, farea: farea, gkey: fg, sqm: fsq, u0: 'шт', u1: 'кв.м',
					offKey: fkey, infoKey: fkey, qtyKey: fkey + (fsq ? ':Q' : ''), calc: fsq ? farea : fc.n, unit: fsq ? 'кв.м' : 'шт',
					pieces: fsq ? (fmt(fc.n) + ' шт') : '', priceId: fsq ? ('FQ:' + fc.name) : fkey, priceDef: 0, punit: fsq ? 'руб./кв.м' : 'руб./шт',
					note: fsz ? (fsq ? fsz + ' мм' : f2(farea) + ' кв.м') : 'размер не прочитан' });
		}

		/* ---------------- фасады МДФ: плёнка и эмаль ---------------- */
		/* работа по покрытию: за кв.м (по умолчанию) или штуками; МДФ и облицовка остаются в своих разделах */
		var mfKeys = sortedKeys(Res.MdfFac);
		mfKeys.sort(function (a, b) { var x = Res.MdfFac[a], y = Res.MdfFac[b]; return (low(x.title) < low(y.title) ? -1 : (low(x.title) > low(y.title) ? 1 : 0)) || (x.sides - y.sides) || (y.h - x.h) || (y.w - x.w); });
		for (i = 0; i < mfKeys.length; i++) {
			var mf = Res.MdfFac[mfKeys[i]], msz = mf.h ? (mf.h + '×' + mf.w) : '', mid = mf.coat + '|' + mf.sides, mg = 'MFAC:' + mid, msq = isSqm(mg), marea = Math.round(mf.n * mf.h * mf.w / 10000) / 100, mkey = 'MF:' + mid + (msz ? ' ' + msz : '');
			mkRow({ kind: 'mdffac', head: 'ФАСАДЫ МДФ', label: mf.title + ', ' + (mf.sides >= 2 ? 'две стороны' : 'лицевая') + (msz ? ', ' + msz + ' мм' : ''), akey: mf.coat, coat: mf.coat, mkind: mf.kind, sides: mf.sides, fsize: msz, fn: mf.n, farea: marea,
					gkey: mg, sqm: msq, u0: 'шт', u1: 'кв.м', offKey: mkey, infoKey: mkey, qtyKey: mkey + (msq ? ':Q' : ''), calc: msq ? marea : mf.n, unit: msq ? 'кв.м' : 'шт',
					pieces: msq ? (fmt(mf.n) + ' шт') : '', priceId: msq ? ('MQ:' + mid) : ('MC:' + mid + (msz ? ' ' + msz : '')), priceDef: 0, punit: msq ? 'руб./кв.м' : 'руб./шт',
					note: msq ? (msz ? msz + ' мм' : '') : f2(marea) + ' кв.м' });
		}

		/* ---------------- объединённые позиции ---------------- */
		/* Строка, которую человек влил в другую (pl.MERGE — во всех сметах): её количество прибавляется к той,
		   цена — той строки, сама строка из сметы уходит. Пары нет в этой смете или единицы разные — строка отдельно. */
		(function () {
			var byOff = {}, gone = [], q;
			for (q = 0; q < ROWS.length; q++) if (ROWS[q].offKey) byOff[ROWS[q].offKey] = ROWS[q];
			function root(k) { var seen = {}; while (has(pl.MERGE, k) && byOff[pl.MERGE[k]] && !seen[k]) { seen[k] = 1; k = pl.MERGE[k]; } return k; }
			for (q = 0; q < ROWS.length; q++) {
				var w = ROWS[q];
				if (!w.offKey || !has(pl.MERGE, w.offKey)) continue;
				var t = byOff[root(w.offKey)];
				if (!t || t === w || t.unit !== w.unit || t.head !== w.head) continue;
				if (!t.parts) t.parts = [{ key: t.offKey, name: t.name0, val: t.val, unit: t.unit }];
				t.parts.push({ key: w.offKey, name: w.name0, val: w.val, unit: w.unit });
				t.calc = r2(t.calc + w.calc);
				if (!t.manual) t.val = r2(t.val + (w.off ? 0 : w.val));
				if (w.pieces && t.pieces) t.pieces = t.pieces + ', ' + w.pieces;
				gone.push(w);
			}
			if (!gone.length) return;
			for (q = ROWS.length - 1; q >= 0; q--) if (gone.indexOf(ROWS[q]) >= 0) ROWS.splice(q, 1);
			for (q = 0; q < ROWS.length; q++) {
				var r0 = ROWS[q];
				r0.i = q;
				if (r0.parts) r0.sum = (r0.off || r0.info) ? 0 : Math.round(r0.val * r0.price * (1 + r0.mk / 100));
			}
			R.merged = gone.length;
		})();
		/* STHGroup: работы (распил, кромкование, облицовка, пазы, упаковка, отверстия) считаются в заказе — в смете их нет */
		if (E.noWorks) {
			for (var qw = ROWS.length - 1; qw >= 0; qw--) if (ROWS[qw].group === 'РАБОТЫ') ROWS.splice(qw, 1);
			for (qw = 0; qw < ROWS.length; qw++) ROWS[qw].i = qw;
		}
		/* STHGroup: комплекты — разделить строку на части, объединить строки в комплект (ui/sth_kits.js) */
		if (typeof E.sthKits === 'function') { try { E.sthKits({ rows: ROWS, mk: mkRow, we: we, pl: pl }); } catch (eK) { if (typeof console !== 'undefined') console.warn(eK); } for (var qk = 0; qk < ROWS.length; qk++) ROWS[qk].i = qk; }

		/* ---------------- прочее: строки прайса и свои строки заказа ---------------- */
		var xrows = [];
		for (i = 0; i < pl.extra.length; i++) {
			var x = pl.extra[i], mode = pl.XMODE[x.id] === 'sqm' || pl.XMODE[x.id] === 'pct' ? pl.XMODE[x.id] : 'sum', dk = low(x.id);
			xrows.push(mkRow({ kind: 'extra', head: 'ПРОЧЕЕ', label: x.name, xid: x.id, xmode: mode, qtyKey: '', calc: 1, offKey: 'X:' + x.id, unit: '',
							   priceId: mode === 'sum' ? x.id : (x.id + (mode === 'sqm' ? ':Q' : ':P')), priceDef: (mode === 'sum' && has(pl.def, dk)) ? pl.def[dk] : 0,
							   punit: mode === 'sum' ? 'руб.' : (mode === 'sqm' ? 'руб./кв.м' : '%'), note: '' }));
		}
		var own = we.rows || [];
		for (i = 0; i < own.length; i++) {
			if (own[i].head && own[i].head !== 'ПРОЧЕЕ') continue;
			var w = own[i], wm = (w.mode === 'sqm' || w.mode === 'pct') ? w.mode : 'sum';
			r = mkRow({ kind: 'extra', head: 'ПРОЧЕЕ', label: w.name || 'Своя строка', art: trim(w.art), own: 1, ownId: w.id, xmode: wm, qtyKey: '', calc: 1, offKey: '', unit: '',
						priceId: '', priceDef: 0, price: Number(w.val) || 0, punit: wm === 'sum' ? 'руб.' : (wm === 'sqm' ? 'руб./кв.м' : '%'), note: 'своя строка' });
			if (w.off) { r.off = 1; r.sum = 0; }
			xrows.push(r);
		}
		/* свои строки в остальных разделах: количество × цена, наценка — по группе раздела */
		for (i = 0; i < own.length; i++) {
			var ow = own[i], oh = ow.head;
			if (!oh || oh === 'ПРОЧЕЕ') continue;
			if (!has(HEAD_GROUP, oh)) oh = E.DOP;
			var ou = trim(ow.unit) || 'шт';
			r = mkRow({ kind: 'own', head: oh, label: ow.name || 'Своя строка', art: trim(ow.art), own: 1, ownId: ow.id, qtyKey: '', calc: Number(ow.qty) >= 0 ? Number(ow.qty) : 0, offKey: '', unit: ou,
						priceId: '', priceDef: 0, price: Number(ow.val) || 0, punit: 'руб./' + ou, note: '' });
			r.mkind = trim(ow.mk);
			if (r.group !== 'РАБОТЫ') {
				/* покупная своя строка: поставщик, ссылка и фото — в «Базе» по наименованию, как у строк модели */
				r.skey = r.title;
				r.sup = E.supFor(sup, r.skey, null);
				if (!r.sup.shop && trim(ow.shop)) r.sup.shop = trim(ow.shop);
				r.card = 1;
			} else r.sup = trim(ow.shop) ? { shop: trim(ow.shop), url: '', img: '' } : null;
			if (ow.off) { r.off = 1; r.sum = 0; }
		}

		/* итоги групп — без «Прочего»: от них считаются строки-проценты */
		function groupSum(name) { var t = 0; for (var q = 0; q < ROWS.length; q++) if (ROWS[q].group === name && !ROWS[q].off && ROWS[q].price > 0 && ROWS[q].val > 0) t += ROWS[q].sum; return t; }
		var base = groupSum('МАТЕРИАЛ') + groupSum('РАБОТЫ') + groupSum('ФУРНИТУРА') + groupSum(E.DOP);
		for (i = 0; i < xrows.length; i++) {
			r = xrows[i];
			if (r.xmode === 'sqm') { r.calc = r.val = Math.round(packArea * 100) / 100; r.unit = 'кв.м'; r.sum = r.off ? 0 : Math.round(packArea * r.price); r.note = (r.own ? 'своя строка · ' : '') + 'за кв.м панелей'; }
			else if (r.xmode === 'pct') { r.calc = r.val = base; r.pct = 1; r.sum = r.off ? 0 : Math.round(base * r.price / 100); r.note = (r.own ? 'своя строка · ' : '') + '% от материала, работ и фурнитуры'; }
			else r.sum = r.off ? 0 : Math.round(r.price);
		}

		/* ---------------- разделы сметы ---------------- */
		/* порядок строк: внутри раздела сначала считаемые, потом выключенные */
		var heads = [], byHead = {};
		for (i = 0; i < ROWS.length; i++) {
			var rw = ROWS[i];
			if (!has(byHead, rw.head)) { byHead[rw.head] = { on: [], off: [] }; heads.push(rw.head); }
			(rw.off ? byHead[rw.head].off : byHead[rw.head].on).push(rw);
		}
		for (i = 0; i < heads.length; i++) if (byHead[heads[i]].on.some(function (x) { return x.mkind; })) byHead[heads[i]].on.sort(byKind);
		function pick(kinds, head) {
			var out = [];
			for (var hI = 0; hI < heads.length; hI++) {
				var lst = byHead[heads[hI]].on;
				for (var n = 0; n < lst.length; n++) {
					var w2 = lst[n];
					if (kinds.indexOf(w2.kind) < 0 && !(w2.kind === 'own' && w2.head === head)) continue;
					if (!(w2.price > 0) || !(w2.val > 0)) continue;
					var qty = '';
					if (w2.kind === 'extra') qty = w2.xmode === 'sqm' ? (E.num(w2.val) + ' кв.м') : '';
					else if (w2.unit) qty = E.num(w2.val) + ' ' + shortUnit(w2.unit) + (w2.utail || '');
					out.push({ row: w2.i, art: w2.art, label: w2.title + (w2.manual ? ' (вручную)' : ''),
							   pieces: (w2.kind == 'profile' || w2.kind == 'linear' || w2.kind == 'curvecut' || w2.kind == 'groove' || w2.kind == 'notch' || w2.kind == 'facade' || w2.kind == 'mdffac') ? (w2.pieces || '') : (w2.kind === 'extra' && w2.xmode !== 'sum' ? w2.note.replace(/^своя строка · /, '') : ''),
							   shop: w2.sup ? w2.sup.shop : '', url: w2.sup ? w2.sup.url : '', img: w2.sup ? w2.sup.img : '',
							   punit: priceUnit(w2.punit), info: w2.info ? 1 : 0, qty: qty, note: (w2.note && w2.kind != 'profile' && w2.kind != 'linear' && w2.kind != 'extra') ? w2.note : '',
							   bad: w2.bad || '', price: w2.kind === 'extra' ? w2.price : w2.priceOut, pct: w2.pct ? 1 : 0, sum: w2.sum, kind: w2.kind, mkind: w2.mkind || '' });
				}
			}
			return out;
		}
		function addSect(title, kinds, group, head) {
			var rows = pick(kinds, head);
			if (!rows.length) return;
			var t = 0;
			for (var n = 0; n < rows.length; n++) t += rows[n].sum;
			R.sections.push({ title: title, total: t, rows: rows, group: group });
			R.groups[group] = (R.groups[group] || 0) + t;
			R.sub += t;
		}
		for (i = 0; i < E.GROUPS.length; i++) R.groups[E.GROUPS[i]] = 0;
		addSect('МАТЕРИАЛ ПЛИТНЫЙ', ['panel'], 'МАТЕРИАЛ', 'ПЛИТНЫЙ МАТЕРИАЛ');
		addSect('МАТЕРИАЛ КРОМОЧНЫЙ', ['edge'], 'МАТЕРИАЛ', 'КРОМОЧНЫЙ МАТЕРИАЛ');
		addSect('МАТЕРИАЛ ПОГОННЫЙ', ['linear'], 'МАТЕРИАЛ', 'ПОГОННЫЙ МАТЕРИАЛ');
		addSect('РАСПИЛ', ['cut', 'curvecut'], 'РАБОТЫ', 'РАСПИЛ');
		addSect('КРОМКОВАНИЕ', ['edgework'], 'РАБОТЫ', 'КРОМКОВАНИЕ');
		addSect('ОБЛИЦОВКА', ['plast'], 'РАБОТЫ', 'ОБЛИЦОВКА');
		addSect('ПАЗЫ', ['groove', 'notch'], 'РАБОТЫ', 'ПАЗЫ');
		addSect('УПАКОВКА', ['pack'], 'РАБОТЫ', 'УПАКОВКА');
		addSect(cfg.showHoles && Res.totalHoles > 0 ? 'ОТВЕРСТИЯ — всего ' + fmt(Res.totalHoles) + ' шт' : 'ОТВЕРСТИЯ', ['hole'], 'РАБОТЫ', 'ОТВЕРСТИЯ');
		addSect('ФУРНИТУРА', ['hinge', 'fastener'], 'ФУРНИТУРА', 'ФУРНИТУРА');
		addSect('ПРОФИЛИ', ['profile'], 'ФУРНИТУРА', 'ПРОФИЛИ');
		addSect('ЗАКАЗНЫЕ ФАСАДЫ', ['facade'], 'ФУРНИТУРА', 'ЗАКАЗНЫЕ ФАСАДЫ');
		addSect('ФАСАДЫ МДФ', ['mdffac'], 'ФУРНИТУРА', 'ФАСАДЫ МДФ');
		addSect('ДОПОЛНИТЕЛЬНЫЕ МАТЕРИАЛЫ', [], E.DOP, E.DOP);
		addSect('ПРОЧЕЕ', ['extra'], 'ПРОЧЕЕ', 'ПРОЧЕЕ');

		/* скидка — отдельной строкой перед ИТОГО */
		R.disc = Math.max(0, Math.min(100, Number(we.disc) || 0));
		R.discSum = Math.round(R.sub * R.disc / 100);
		R.grand = R.sub - R.discSum;
		R.hasArt = 0;
		for (i = 0; i < ROWS.length; i++) if (ROWS[i].art) { R.hasArt = 1; break; }
		R.totalSheets = totalSheets; R.packArea = packArea; R.totalHoles = Res.totalHoles;

		/* ---------------- справочные списки ---------------- */
		if (cfg.showHoles && !(cfg.holesSort > 0) && Res.totalHoles > 0) R.lists.push({ title: 'Отверстия', lines: [{ name: 'всего', val: fmt(Res.totalHoles) + ' шт' }], group: 'РАБОТЫ' });
		if (cfg.showHoles && cfg.holesSort > 0 && Res.totalHoles > 0) {
			var below = 0, above = 0;
			for (key in Res.Holes) if (has(Res.Holes, key)) { if (parseFloat(key) > cfg.holesSort) above += Res.Holes[key]; else below += Res.Holes[key]; }
			R.lists.push({ title: 'Отверстия (всего ' + Res.totalHoles + ')', group: 'РАБОТЫ', lines: [{ name: 'до ' + String(cfg.holesSort).replace('.', ',') + ' мм', val: below + ' шт' }, { name: 'более ' + String(cfg.holesSort).replace('.', ',') + ' мм', val: above + ' шт' }] });
		}

		/* ---------------- не учтено ---------------- */
		for (i = 0; i < ROWS.length; i++) {
			var uw = ROWS[i], why = '';
			if (uw.off) why = 'не считается';
			else if (uw.kind === 'extra' && uw.xmode === 'pct' && !(uw.price > 0)) why = 'нет цены';
			else if (!(uw.val > 0)) why = 'обнулено вручную';
			else if (!(uw.price > 0)) why = 'нет цены';
			uw.why = why;
			if (!why) continue;
			if (uw.kind === 'extra' && !uw.off) continue;                 // пустые «Проект», «Сборка», «Прочее» — не упущение
			var uval = '';
			if (uw.kind == 'profile' || uw.kind == 'linear') uval = f2(uw.ptot / 1000).replace('.', ',') + ' м';
			else if (uw.kind !== 'extra' && uw.calc > 0) uval = E.num(uw.calc) + (uw.unit ? ' ' + shortUnit(uw.unit) : '');
			R.unacc.push({ row: i, art: uw.art, head: uw.head, group: uw.group, rank: E.headRank(uw.head), name: uw.title, pieces: uw.pieces || '',
						   bad: (!uw.off && uw.bad) ? uw.bad : '', val: uval, why: why, orig: i });
		}
		R.unacc.sort(function (a, b) { return (a.rank - b.rank) || (a.orig - b.orig); });

		/* ---------------- предупреждения ---------------- */
		var jobs = 0, stale = 0;
		for (i = 0; i < summ.mats.length; i++) if (summ.mats[i].on && summ.mats[i].stale) stale++;
		if (!Res.panels && !sortedKeys(Res.Fasteners).length && !pKeys.length) R.warns.push('Объекты не обнаружены' + (Res.selected ? ' среди выделенных.' : '.'));
		if (Res.old) R.warns.push('Проект выгружен прежним скриптом: фурнитуры, комплектов, профилей и погонных материалов в нём нет. Выгрузите модель заново скриптом STHGroup_Export — раскрой при этом сохранится.');
		if (Res.selected) R.warns.push('Считаются ТОЛЬКО выделенные в БАЗИСе объекты.' + (Res.noSel ? ' Отверстия посчитаны по всей модели: прежняя выгрузка не знает, какие из них выделены.' : ''));
		if (Res.facNoBlocks) R.warns.push('Заказные фасады не найдены: проект выгружен скриптом без сведений о блоках. Выгрузите модель заново скриптом STHGroup_Export — раскрой при этом сохранится.');
		if (Res.facNoSize) R.warns.push('У заказных фасадов (' + Res.facNoSize + ' шт) БАЗИС не отдал размер: они посчитаны штуками без размера.');
		if (Res.hidden.count) R.warns.push('Скрытых панелей: ' + Res.hidden.count + ' (' + f2(Res.hidden.area).replace('.', ',') + ' кв.м). В смету они НЕ включены.');
		if (stale) R.warns.push('Раскрой ещё не пересчитан (' + stale + ' ' + plural(stale, 'материал', 'материала', 'материалов') + '): число листов и длина реза могут измениться.');
		if (unplaced) R.warns.push('Не разложено раскроем: ' + unplaced + ' дет. (не влезли в лист или лежат в буфере). Листы на них добавлены по площади.');
		if (Res.offParts) R.warns.push('Исключено из раскроя деталей: ' + Res.offParts + ' — в смету они не вошли.');
		var offList = [];
		if (!cfg.showFast) offList.push('фурнитура');
		if (!cfg.showProf) offList.push('профили');
		if (!cfg.showCuts) offList.push('пазы');
		if (!cfg.showHoles) offList.push('отверстия');
		if (offList.length) R.warns.push('Отключено: ' + offList.join(', ') + ' — в смету и в количества не входит.');
		if (R.manual) R.warns.push('Есть количества, заданные вручную.');
		if ((st.work.sets || 1) != 1) R.warns.push('Комплектов (изделий): ' + st.work.sets + '.');
		R.stale = stale; R.unplaced = unplaced;
		return R;
	};

	/* Строки таблицы «Цены и количества» по порядку: разделы как в смете, выключенные — в конце. */
	E.ordered = function (R) {
		var on = [], off = [], i;
		for (i = 0; i < R.rows.length; i++) (R.rows[i].off ? off : on).push(i);
		function cmp(a, b) { var d = E.headRank(R.rows[a].head) - E.headRank(R.rows[b].head); return d ? d : byKind(R.rows[a], R.rows[b]); }
		on.sort(cmp); off.sort(cmp);
		return { on: on, off: off };
	};

	/* ------------------------------- правки строк ------------------------------ */

	/* Что можно выбрать в столбце «Считать» у строки: [[значение, подпись]…] и текущее значение. */
	E.unitChoice = function (R, w) {
		var cfg = R.cfg, o = [], cur, i;
		if (w.kind == 'profile' || w.kind == 'linear') {
			var lens = w.kind == 'linear' ? cfg.linLens : cfg.profLens;
			for (i = 0; i < lens.length; i++) o.push([lens[i], 'по ' + E.lenTitle(lens[i])]);
			if (w.plen > 0 && lens.indexOf(w.plen) < 0) o.push([w.plen, 'по ' + E.lenTitle(w.plen)]);
			o.push([0, 'пог. м']); o.push([-1, 'не считать']);
			cur = w.off ? -1 : w.plen;
		} else if (w.kind == 'edgework') { o = [[0, 'да'], [1, 'PUR'], [-1, 'не считать']]; cur = w.off ? -1 : w.eunit; }
		else if (w.kind == 'cut') { o = [[0, 'листы'], [1, 'периметр'], [2, 'рез'], [-1, 'не считать']]; cur = w.off ? -1 : w.cunit; }
		else if (w.kind == 'fastener') { o = [[0, 'шт'], [1, 'компл.'], [-1, 'не считать']]; cur = w.off ? -1 : w.funit; }
		else if (w.kind == 'own') { o = [['on', 'да'], ['off', 'не считать']]; cur = w.off ? 'off' : 'on'; }
		else if (w.kind == 'extra') { o = [['sum', 'суммой'], ['sqm', 'за кв.м'], ['pct', '% от сметы'], ['off', 'не считать']]; cur = w.off ? 'off' : w.xmode; }
		else if (w.gkey) {
			o = [[0, w.u0 || 'листы'], [1, w.u1 || 'кв.м']];
			if (w.infoKey) o.push([3, 'справочно']);
			o.push([2, 'не считать']);
			cur = w.off ? 2 : (w.info ? 3 : (w.sqm ? 1 : 0));
		} else if (w.kind == 'edge') { o = [[0, 'да'], [2, 'справочно'], [1, 'не считать']]; cur = w.off ? 1 : (w.info ? 2 : 0); }
		else { o = [[0, 'да'], [1, 'не считать']]; cur = w.off ? 1 : 0; }
		return { options: o, value: cur };
	};
	function ownRow(we, id) { for (var i = 0; i < (we.rows || []).length; i++) if (we.rows[i].id === id) return we.rows[i]; return null; }
	function setFlag(map, key, on) { if (on) map[key] = 1; else if (has(map, key)) delete map[key]; }
	/* Сменить «Считать» у строки w: v — значение из E.unitChoice. Единица поменялась — ручное количество сбрасывается. */
	E.setUnit = function (R, w, v, pl, we) {
		var changed = false, num = Number(v);
		if (w.kind == 'own') { var oo = ownRow(we, w.ownId); if (oo) { if (v === 'off') oo.off = 1; else delete oo.off; } return; }
		if (w.kind == 'extra') {
			if (w.own) { var o = ownRow(we, w.ownId); if (!o) return; if (v === 'off') o.off = 1; else { delete o.off; o.mode = v; } return; }
			setFlag(pl.OFF, w.offKey, v === 'off');
			if (v !== 'off') { if (v === 'sum') delete pl.XMODE[w.xid]; else pl.XMODE[w.xid] = v; }
			return;
		}
		if (w.kind == 'edge') { setFlag(pl.OFF, w.offKey, num == 1); setFlag(pl.REF, w.infoKey, num == 2); return; }
		if (w.kind == 'profile' || w.kind == 'linear') {
			var lkey = w.kind == 'linear' ? w.offKey : w.pname;
			setFlag(pl.OFF, w.offKey, num < 0);
			if (num >= 0) { var nl = Math.round(num); if (nl != w.plen) changed = true; if (nl == w.plenDef) delete pl.PLEN[lkey]; else pl.PLEN[lkey] = nl; }
		} else if (w.kind == 'fastener') {
			setFlag(pl.OFF, w.offKey, num < 0);
			if (num >= 0) { var nu = num ? 1 : 0; if (nu != w.funit) changed = true; if (nu == R._defaultFunit(w.fname)) delete pl.FUNIT[w.fname]; else pl.FUNIT[w.fname] = nu; }
		} else if (w.kind == 'cut') {
			setFlag(pl.OFF, w.offKey, num < 0);
			if (num >= 0) { var cu = (num == 2) ? 2 : (num ? 1 : 0); if (cu != w.cunit) changed = true; if (cu) pl.CUNIT[w.cname] = cu; else delete pl.CUNIT[w.cname]; }
		} else if (w.kind == 'edgework') {
			setFlag(pl.OFF, w.offKey, num < 0);
			if (num >= 0) setFlag(pl.EUNIT, w.ename, !!num);
		} else if (w.gkey) {
			setFlag(pl.OFF, w.offKey, num == 2);
			if (w.infoKey) setFlag(pl.REF, w.infoKey, num == 3);
			if (num != 2 && num != 3) {
				var now = num == 1 ? 1 : 0;
				if (now != (w.sqm ? 1 : 0)) changed = true;
				if (now == R._defaultSqm(w.gkey)) delete pl.SQM[w.gkey]; else pl.SQM[w.gkey] = now;
			}
		} else setFlag(pl.OFF, w.offKey, num == 1);
		if (changed && w.qtyKey && we.qty && has(we.qty, w.qtyKey)) delete we.qty[w.qtyKey];
	};
	/* Количество вручную: совпало с расчётным — ручная правка снимается. */
	E.setQty = function (w, v, we) {
		if (w.kind === 'own') { var o = ownRow(we, w.ownId); if (o && v >= 0) o.qty = v; return; }
		if (!w.qtyKey || !(v >= 0)) return;
		if (!we.qty) we.qty = {};
		if (Math.abs(v - w.calc) < 0.0001) delete we.qty[w.qtyKey]; else we.qty[w.qtyKey] = v;
	};
	E.resetQty = function (w, we) { if (w.qtyKey && we.qty) delete we.qty[w.qtyKey]; };
	/* Цена строки: совпала с ценой по умолчанию — из прайса убирается. */
	E.setPrice = function (w, v, pl, we) {
		if (!(v >= 0)) return;
		if (w.own) { var o = ownRow(we, w.ownId); if (o) o.val = v; return; }
		if (Math.abs(v - w.priceDef) < 0.0001) delete pl.P[w.priceId]; else pl.P[w.priceId] = v;
	};
	/* Своя строка. head — раздел (нет или «ПРОЧЕЕ» — строка «Прочего»: суммой, за кв.м или процентом);
	   в остальных разделах — количество × цена, mk — подгруппа (вид материала), в конце которой её добавили. */
	E.addOwnRow = function (we, name, mode, val, head, mk) {
		if (!Array.isArray(we.rows)) we.rows = [];
		var id = 'u' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
		if (head && head !== 'ПРОЧЕЕ') {
			var o = { id: id, head: has(HEAD_GROUP, head) ? head : E.DOP, name: trim(name) || 'Своя строка', qty: 1, unit: 'шт', val: Number(val) || 0 };
			if (trim(mk)) o.mk = trim(mk);
			we.rows.push(o);
			return id;
		}
		we.rows.push({ id: id, name: trim(name) || 'Своя строка', mode: (mode === 'sqm' || mode === 'pct') ? mode : 'sum', val: Number(val) || 0 });
		return id;
	};
	E.dropOwnRow = function (we, id) { we.rows = (we.rows || []).filter(function (x) { return x.id !== id; }); };
	/* Наименование строки вручную. Пусто или как в модели — правка снимается. Цена при этом остаётся за строкой. */
	E.setName = function (w, v, pl, we) {
		v = trim(String(v).replace(/\s+/g, ' '));
		if (w.own) { if (v) E.renameOwnRow(we, w.ownId, v); return; }
		if (!w.offKey) return;
		if (!v || v === trim(String(w.name0).replace(/\s+/g, ' '))) delete pl.NAME[w.offKey]; else pl.NAME[w.offKey] = v;
	};
	/* Артикул строки вручную. Пусто или как в модели — правка снимается. */
	E.setArt = function (w, v, pl, we) {
		v = trim(String(v).replace(/\s+/g, ' '));
		if (w.own) { var o = ownRow(we, w.ownId); if (o) { if (v) o.art = v; else delete o.art; } return; }
		if (!w.offKey) return;
		if (!v || v === w.art0) delete pl.ART[w.offKey]; else pl.ART[w.offKey] = v;
	};
	E.renameOwnRow = function (we, id, name) { var o = ownRow(we, id); if (o && trim(name)) o.name = trim(name); };
	/* Своя строка из карточки: наименование, артикул, количество, единица, цена, поставщик. */
	E.saveOwn = function (we, id, r) {
		var o = ownRow(we, id);
		if (!o || !r) return;
		if (trim(r.name)) o.name = trim(String(r.name).replace(/\s+/g, ' '));
		['art', 'unit', 'shop'].forEach(function (f) { var v = trim(String(r[f] || '').replace(/\s+/g, ' ')); if (v) o[f] = v; else delete o[f]; });
		if (Number(r.qty) >= 0) o.qty = Number(r.qty);
		if (Number(r.price) >= 0) o.val = Number(r.price);
	};
	/* Единица и поставщик своей строки. */
	E.setOwn = function (we, id, f, v) {
		var o = ownRow(we, id);
		if (!o || (f !== 'unit' && f !== 'shop')) return;
		v = trim(String(v || '').replace(/\s+/g, ' '));
		if (v) o[f] = v; else delete o[f];
	};
	/* Подставить в свою строку позицию из подсказки: наименование, артикул, цену, единицу и поставщика. */
	E.fillOwn = function (we, id, c) {
		var o = ownRow(we, id);
		if (!o || !c) return;
		if (trim(c.name)) o.name = trim(c.name);
		if (trim(c.art)) o.art = trim(c.art); else delete o.art;
		if (c.price > 0) o.val = c.price;
		if (o.head && o.head !== 'ПРОЧЕЕ') {
			if (trim(c.unit)) o.unit = trim(c.unit);
			if (trim(c.shop)) o.shop = trim(c.shop); else delete o.shop;
		}
	};
	/* Подсказки для своих строк: позиции этой сметы, цены из прайса (фурнитура, профили, погонаж, кромка)
	   и материалы «Базы». → [{ name, art, price, unit, shop }] по алфавиту; цена — без наценки. */
	var CAND_PFX = [[/^FK:/, 'компл.'], [/^F:/, 'шт'], [/^RM:/, 'м'], [/^RL\d+:/, 'шт'], [/^LM:/, 'м'], [/^LL\d+:/, 'шт'], [/^E:/, 'м']];
	E.ownCands = function (R, pl) {
		var by = {}, out = [], i, k;
		function add(name, art, price, unit, shop) {
			name = trim(String(name || '').replace(/\s+/g, ' '));
			if (!name) return;
			var key = low(name), c = by[key];
			if (!c) { c = by[key] = { name: name, art: '', price: 0, unit: '', shop: '' }; out.push(c); }
			if (!c.art && trim(art)) c.art = trim(art);
			if (!(c.price > 0) && price > 0) { c.price = price; if (unit) c.unit = unit; }
			if (!c.unit && unit) c.unit = unit;
			if (!c.shop && trim(shop)) c.shop = trim(shop);
		}
		for (i = 0; R && i < R.rows.length; i++) {
			var w = R.rows[i];
			if (w.kind === 'extra') continue;
			add(w.title, w.art, w.price, shortUnit(w.unit || '').replace(/^л\.$/, 'лист'), w.sup ? w.sup.shop : '');
		}
		if (pl && pl.P) for (k in pl.P) if (has(pl.P, k)) {
			for (var j = 0; j < CAND_PFX.length; j++) if (CAND_PFX[j][0].test(k)) { add(k.replace(CAND_PFX[j][0], ''), '', Number(pl.P[k]) || 0, CAND_PFX[j][1], ''); break; }
		}
		var Bs = G.BM.base, base = Bs && Bs.cur;
		if (base && base.mats) for (k in base.mats) if (has(base.mats, k)) { var m = base.mats[k]; add(m.name || k, m.art, 0, '', Bs.infoOf(base, k).shop); }
		out.sort(function (a, b) { return low(a.name) < low(b.name) ? -1 : (low(a.name) > low(b.name) ? 1 : 0); });
		return out;
	};
	/* Подсказки по набранному: совпадение в начале наименования или артикула — выше, потом по части слова. */
	E.ownFind = function (cands, q, n) {
		q = low(trim(q));
		if (q.length < 2) return [];
		var a = [], b = [];
		for (var i = 0; i < cands.length; i++) {
			var c = cands[i], nm = low(c.name), ar = low(c.art);
			if (nm.indexOf(q) === 0 || ar.indexOf(q) === 0) a.push(c);
			else if (nm.indexOf(q) > 0 || ar.indexOf(q) > 0) b.push(c);
		}
		return a.concat(b).slice(0, n || 8);
	};

	/* ------------------------ список для заказа материала ---------------------- */

	function baseName(s) {
		var t = trim(String(s)).replace(/\r.*/, '');
		t = t.replace(/\. Артикул .*$/, '');
		t = t.replace(/^кромка\s+/i, '');
		t = t.replace(/[\s,]*\d+(?:[.,]\d+)?\s*[xх]\s*\d+(?:[.,]\d+)?\s*мм\.?$/i, '');
		t = t.replace(/[\s,]*\d+(?:[.,]\d+)?\s*мм\.?$/i, '');
		t = t.replace(/\s+\d{1,4}$/, '');
		return trim(t) || trim(String(s));
	}
	function shortTitle(s) {
		var t = trim(String(s)), w = t.split(/\s+/);
		if (!w.length) return t;
		if (!/^[A-Za-z]{0,2}\d{2,4}$/.test(w[0])) return t;
		var out = w[0];
		if (w.length > 1 && /^[A-Z]{1,3}\d{0,3}$/.test(w[1])) out += ' ' + w[1];
		return out;
	}
	function edgeThick(name) {
		var m = String(name).replace(/\r.*/, '').match(/(\d+(?:[.,]\d+)?)\s*мм/i);
		return m ? m[1].replace(',', '.') : '';
	}
	function matKind(g) {
		if (!(g.L > 4000) || !(g.W <= 1000)) return '';
		var th = Math.round(g.th || 0);
		if (th >= 20 && th <= 45) return 'столешка';
		if (th <= 10) return 'фартук';
		return '';
	}
	/* Толщина и ширина ленты: из артикула («…-0,8x19»), иначе из названия, иначе из модели. */
	function edgeSize(w, Res) {
		var Bs = G.BM.base, s = Bs && Bs.edgeSize ? (Bs.edgeSize(w.art, w.emat) || Bs.edgeSize('', w.title)) : null;
		if (s) return { th: s.th, w: Math.round(s.w * 10) / 10 };
		var th = Number((Res.EdgeTh || {})[w.emat]) || edgeThickMm(w.emat, 0);
		return { th: th ? Math.round(th * 100) / 100 : '', w: Math.round(Number((Res.EdgeW || {})[w.emat]) || 0) };
	}
	function expectEdgeW(cfg, th) {
		for (var i = 0; i < cfg.bandW.length; i++) if (th <= cfg.bandW[i][0]) return cfg.bandW[i][1];
		return cfg.bandW[cfg.bandW.length - 1][1];
	}
	/* Заказ материала («мат. кратко» скрипта): по декорам — плиты по толщинам и кромка к ним.
	   Кромка без своей плиты идёт к той толщине, которой подходит по ширине ленты. */
	E.order = function (R) {
		var cfg = R.cfg, Res = R.res, decors = {}, order = [], furn = [], profs = [], lins = [], facs = [], mdfs = [], i, j;
		function sup(w) { return { shop: w.sup ? w.sup.shop : '', url: w.sup ? w.sup.url : '', img: w.sup ? w.sup.img : '' }; }
		function slot(name) {
			var k = baseName(name).toLowerCase();
			if (!has(decors, k)) { decors[k] = { title: baseName(name), plates: [], edges: [] }; order.push(k); }
			return decors[k];
		}
		for (i = 0; i < R.rows.length; i++) {
			var w = R.rows[i];
			if (w.off) continue;
			if (w.kind == 'panel') {
				var g = Res.gmap[w.gkey];
				if (!g) continue;
				var sl = slot(g.mat);
				sl.plates.push({ art: w.art, title: w.title, th: Math.round(g.th), val: w.val, sqm: w.sqm, edges: [], kind: matKind({ L: g.sheets.L, W: g.sheets.W, th: g.th }), L: g.sheets.L, W: g.sheets.W });
			} else if (w.kind == 'fastener') furn.push(w);
			else if (w.kind == 'profile') profs.push(w);
			else if (w.kind == 'linear') lins.push(w);
			else if (w.kind == 'facade') facs.push(w);
			else if (w.kind == 'mdffac') mdfs.push(w);
			else if (w.kind == 'edge') { var esz = edgeSize(w, Res); slot(w.emat).edges.push({ name: w.emat, art: w.art, title: w.title, thick: esz.th, width: esz.w, len: Math.ceil(w.val) }); }
		}
		for (i = 0; i < order.length; i++) {
			var D = decors[order[i]];
			if (!D.plates.length) continue;
			for (j = 0; j < D.edges.length; j++) {
				var e = D.edges[j], best = 0, bestDiff = 1e9;
				for (var k = 0; k < D.plates.length; k++) {
					var diff = Math.abs(expectEdgeW(cfg, D.plates[k].th) - (e.width || 19));
					if (diff < bestDiff || (diff === bestDiff && D.plates[k].th < D.plates[best].th)) { best = k; bestDiff = diff; }
				}
				D.plates[best].edges.push(e);
			}
			D.edges = [];
		}
		order.sort(function (x, y) { return (x < y) ? -1 : ((x > y) ? 1 : 0); });
		function edgePart(e) {
			var t = e.thick ? String(e.thick).replace('.', ',') : '', mark = (t && e.width) ? (t + '/' + e.width) : (t ? t : (e.width ? String(e.width) : '?'));
			return mark + ' — ' + e.len + ' ' + plural(e.len, 'метр', 'метра', 'метров');
		}
		function edgePartA(e) { var t = edgePart(e); return e.art ? t.replace(' — ', ' (арт. ' + e.art + ') — ') : t; }
		var mat = [];
		for (i = 0; i < order.length; i++) {
			var G2 = decors[order[i]];
			G2.plates.sort(function (a, b) { return a.th - b.th; });
			if (!G2.plates.length) {
				/* кромка без своей плиты: каждая лента своей строкой, название — как в строке сметы */
				for (j = 0; j < G2.edges.length; j++) { var eo = G2.edges[j]; mat.push({ title: eo.title, full: eo.title, art: eo.art || '', th: '', qty: '', edges: [edgePart(eo)], edgesA: [edgePart(eo)] }); }
				continue;
			}
			for (j = 0; j < G2.plates.length; j++) {
				var p = G2.plates[j];
				/* название — точно как в строке сметы; столешница/фартук — пометкой под ним */
				mat.push({ title: p.title, full: p.title, sub: p.kind ? p.kind + ' ' + p.L + '×' + p.W : '', art: p.art || '', th: p.th + ' мм',
						   qty: E.num(p.val) + ' ' + (p.sqm ? 'кв.м' : plural(p.val, 'лист', 'листа', 'листов')), edges: p.edges.map(edgePart), edgesA: p.edges.map(edgePartA) });
			}
		}
		/* заказ фурнитуры — это закупка: цены в нём свои, без наценки */
		var fl = [];
		for (i = 0; i < furn.length; i++) if (furn[i].val > 0) fl.push({ row: furn[i].i, art: furn[i].art, name: furn[i].title, qty: E.num(furn[i].val) + ' ' + furn[i].unit, price: furn[i].price, punit: priceUnit(furn[i].punit), sum: Math.round(furn[i].val * furn[i].price), info: furn[i].info, sup: sup(furn[i]) });
		for (i = 0; i < profs.length; i++) {
			var pw = profs[i];
			if (!(pw.val > 0)) continue;
			fl.push({ row: pw.i, art: pw.art, name: pw.title, pieces: pw.pieces, qty: pw.plen > 0 ? (E.num(pw.val) + ' шт по ' + E.lenTitle(pw.plen)) : (E.num(pw.val) + ' ' + plural(pw.val, 'метр', 'метра', 'метров')),
					  price: pw.price, punit: priceUnit(pw.punit), sum: Math.round(pw.val * pw.price), bad: pw.bad || '', sup: sup(pw) });
		}
		var lin = [];
		for (i = 0; i < lins.length; i++) {
			var lw = lins[i];
			if (!(lw.val > 0)) continue;
			lin.push({ row: lw.i, art: lw.art, name: lw.title, pieces: lw.pieces || '', qty: lw.plen > 0 ? (E.num(lw.val) + ' шт по ' + E.lenTitle(lw.plen)) : (E.num(lw.val) + ' м') });
		}
		/* заказ фасадов — тоже закупка: штуки и размер всегда, цена — как выбрана (за штуку или за кв.м), без наценки */
		var fac = [];
		for (i = 0; i < facs.length; i++) {
			var fw = facs[i];
			if (!(fw.val > 0)) continue;
			var pcsN = fw.sqm ? fw.fn : fw.val;
			fac.push({ row: fw.i, art: fw.art, name: fw.renamed ? fw.title : fw.fname, size: fw.fsize, n: pcsN, area: fw.sqm ? fw.val : Math.round(pcsN * (fw.farea / (fw.fn || 1)) * 100) / 100,
					   qty: E.num(pcsN) + ' шт' + (fw.sqm ? ' · ' + E.num(fw.val) + ' кв.м' : ''), price: fw.price, punit: priceUnit(fw.punit), sum: Math.round(fw.val * fw.price), info: fw.info, sup: sup(fw) });
		}
		/* фасады МДФ — заказ покрытия: покрытие, стороны, размер, штуки и площадь */
		var mdf = [];
		for (i = 0; i < mdfs.length; i++) {
			var mw = mdfs[i];
			if (!(mw.val > 0)) continue;
			var mN = mw.sqm ? mw.fn : mw.val;
			mdf.push({ row: mw.i, art: mw.art, name: mw.title, size: mw.fsize, n: mN, area: mw.sqm ? mw.val : Math.round(mN * (mw.farea / (mw.fn || 1)) * 100) / 100,
					   qty: E.num(mN) + ' шт' + (mw.sqm ? ' · ' + E.num(mw.val) + ' кв.м' : ''), price: mw.price, punit: priceUnit(mw.punit), sum: Math.round(mw.val * mw.price), info: mw.info, sup: sup(mw) });
		}
		return { mat: mat, furn: fl, lin: lin, fac: fac, mdf: mdf };
	};
	/* Заказ поставщику: покупные строки сметы (плита, кромка, фурнитура, профили, погонаж, фасады) по
	   поставщикам. Цены — закупочные, без наценки. Строки без поставщика — группой с пустым названием.
	   → [{ shop, rows: [{ row, art, name, pieces, qty, price, punit, sum, info, img, url }], sum }] по алфавиту. */
	var BUY = { panel: 1, edge: 1, fastener: 1, profile: 1, linear: 1, facade: 1, mdffac: 1 };
	E.supOrder = function (R) {
		var by = {}, out = [];
		for (var i = 0; i < R.rows.length; i++) {
			var w = R.rows[i];
			if (w.off || !(BUY[w.kind] || (w.kind === 'own' && w.group !== 'РАБОТЫ')) || !(w.val > 0)) continue;
			var shop = w.sup ? trim(w.sup.shop) : '', k = shop.toLowerCase();
			if (!has(by, k)) { by[k] = { shop: shop, rows: [], sum: 0 }; out.push(by[k]); }
			var pr = w.info ? 0 : (w.price > 0 ? w.price : 0), qty = (w.kind === 'profile' || w.kind === 'linear') && w.plen > 0 ? (E.num(w.val) + ' шт по ' + E.lenTitle(w.plen)) : (E.num(w.val) + ' ' + shortUnit(w.unit));
			by[k].rows.push({ row: w.i, art: w.art || '', name: w.title, pieces: (w.kind === 'profile' || w.kind === 'linear' || w.kind === 'facade' || w.kind === 'mdffac') ? (w.pieces || '') : '', qty: qty,
				price: pr, punit: priceUnit(w.punit), sum: Math.round(w.val * pr), info: w.info ? 1 : 0, img: w.sup ? w.sup.img : '', url: w.sup ? w.sup.url : '', mkind: w.mkind || '' });
			by[k].sum += Math.round(w.val * pr);
		}
		out.sort(function (a, b) { if (!a.shop) return 1; if (!b.shop) return -1; return a.shop.toLowerCase() < b.shop.toLowerCase() ? -1 : 1; });
		return out;
	};
	/* ----------------------- одинаковые позиции и объединение ----------------------- */
	/* Одинаковые — в одном разделе совпали наименование и артикул (регистр, лишние пробелы и точка в конце
	   не важны). E.dups(R, pl) → { ключ строки: строка выше с тем же наименованием и артикулом }; пары,
	   для которых выбрано «оставить обе», не попадают. Единицы могут быть разными — объединить тогда нельзя. */
	E.normKey = function (s) { return low(s).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').replace(/[\s.,;:]+$/, ''); };
	function pairKey(a, b) { return a < b ? a + '\n' + b : b + '\n' + a; }
	E.dups = function (R, pl) {
		var seen = {}, out = {}, nm = (pl && pl.NOMERGE) || {};
		for (var i = 0; i < R.rows.length; i++) {
			var w = R.rows[i];
			if (w.own || !w.offKey || w.kind === 'extra' || !E.normKey(w.title)) continue;
			var k = w.head + '|' + E.normKey(w.title) + '|' + E.normKey(w.art);
			if (!has(seen, k)) { seen[k] = w; continue; }
			if (!nm[pairKey(seen[k].offKey, w.offKey)]) out[w.offKey] = seen[k];
		}
		return out;
	};
	/* Влить строку src в dst (во всех сметах); price — цена объединённой позиции (или не трогать). */
	E.merge = function (src, dst, pl, we, price) {
		if (!src || !dst || !src.offKey || !dst.offKey || src.unit !== dst.unit) return false;
		pl.MERGE[src.offKey] = dst.offKey;
		delete pl.NOMERGE[pairKey(src.offKey, dst.offKey)];
		if (price !== undefined && price !== null && isFinite(price)) E.setPrice(dst, price, pl, we);
		return true;
	};
	/* Разъединить: все строки, влитые в эту (и в те, что влиты в неё). */
	E.unmerge = function (w, pl) {
		var keys = (w.parts || []).map(function (p) { return p.key; }), n = 0;
		for (var k in pl.MERGE) if (has(pl.MERGE, k) && (keys.indexOf(k) >= 0 || keys.indexOf(pl.MERGE[k]) >= 0)) { delete pl.MERGE[k]; n++; }
		return n;
	};
	E.keepBoth = function (a, b, pl) { if (a && b && a.offKey && b.offKey) pl.NOMERGE[pairKey(a.offKey, b.offKey)] = 1; };

	/* Тот же заказ материала строками текста — как прежняя кнопка «Копировать список» в скрипте. */
	E.orderText = function (R) {
		var o = E.order(R), out = [];
		for (var i = 0; i < o.mat.length; i++) {
			var m = o.mat[i];
			out.push(m.title + '  ' + (m.th ? m.th.replace(' ', '') + ' ' + m.qty.replace(/ /g, ' ') : '') + (m.edges.length ? (m.th ? ' + ' : '') + m.edges.join(' + ').replace(/ — /g, ' - ') : ''));
		}
		return out;
	};

	/* ------------------- цены из файла скрипта «СМЕТА» ------------------------- */

	/* Разобрать текст файла «цены распила.txt». Возвращает { list — прайс, conf — настройки расчёта
	   из файла, count — сколько цен и правил прочитано }. Формат — как пишет скрипт (SavePrices). */
	E.importScript = function (text, name) {
		var pl = E.newList(name || 'Из скрипта СМЕТА'), conf = {}, count = 0, unitsV2 = 0;
		var legacy = { Edge: 'edge', Cut: 'cut', Pack: 'pack', Hinge: 'hinge', Project: 'project', Assembly: 'assembly', Other: 'other' };
		var lines = String(text || '').split(/[\r\n]+/);
		for (var i = 0; i < lines.length; i++) {
			var ln = trim(lines[i]);
			if (!ln || ln.charAt(0) == '#') continue;
			var eq = ln.lastIndexOf('=');
			if (eq < 1) continue;
			var nm = trim(ln.substring(0, eq)), num = parseFloat(trim(ln.substring(eq + 1)));
			if (nm == 'EDGE_RESERVE') { if (!isNaN(num) && num >= 0 && num < 500) conf.edgeReserve = num; continue; }
			if (nm == 'PROF_RESERVE') { if (!isNaN(num) && num >= 0 && num < 500) conf.profReserve = num; continue; }
			if (nm == 'PROF_KERF') { if (!isNaN(num) && num >= 0 && num < 50) conf.profKerf = num; continue; }
			if (nm == 'SHOW_CUTS2') { conf.showCuts = num ? 1 : 0; continue; }
			if (nm == 'SHOW_PROFILES') { conf.showProf = num ? 1 : 0; continue; }
			if (nm == 'SHOW_HOLES') { conf.showHoles = num ? 1 : 0; continue; }
			if (nm == 'SHOW_FASTENERS') { conf.showFast = num ? 1 : 0; continue; }
			if (nm == 'PRICE_UNITS') { unitsV2 = 1; continue; }
			if (nm == 'IDLE_MIN' || nm == 'SHOW_MAT' || nm == 'SHOW_CUTS' || nm == 'COPY_FURN' || nm == 'SAVE_GROUPS') continue;
			if (nm.indexOf('LEGACYF|') === 0) { pl.LEG[trim(nm.substring(8))] = 1; continue; }
			if (nm.indexOf('SQM|') === 0) { pl.SQM[trim(nm.substring(4))] = (isNaN(num) || num) ? 1 : 0; count++; continue; }
			if (nm.indexOf('FUNIT|') === 0) { if (!isNaN(num) && (num === 0 || num === 1 || num === 2)) { pl.FUNIT[trim(nm.substring(6))] = num ? 1 : 0; count++; } continue; }
			if (nm.indexOf('REFONLY|') === 0) { pl.REF[trim(nm.substring(8))] = 1; count++; continue; }
			if (nm.indexOf('EUNIT|') === 0) { if (!isNaN(num) && num) { pl.EUNIT[trim(nm.substring(6))] = 1; count++; } continue; }
			if (nm.indexOf('CUNIT|') === 0) { if (!isNaN(num) && num) { pl.CUNIT[trim(nm.substring(6))] = (num == 2) ? 2 : 1; count++; } continue; }
			if (nm.indexOf('PLEN|') === 0) { if (!isNaN(num) && num >= 0) { pl.PLEN[trim(nm.substring(5))] = Math.round(num); count++; } continue; }
			if (nm.indexOf('OFF|') === 0) { pl.OFF[trim(nm.substring(4))] = 1; count++; continue; }
			if (nm.indexOf('DEF|') === 0) { var dk = trim(nm.substring(4)); if (has(pl.def, dk) && !isNaN(num)) { pl.def[dk] = num; count++; } continue; }
			if (nm.indexOf('P|') === 0) { if (!isNaN(num)) { pl.P[trim(nm.substring(2))] = num; count++; } continue; }
			if (nm.indexOf('M2|') === 0) { var cid = trim(nm.substring(3)); if (pl.cls[cid] && !isNaN(num)) { pl.cls[cid].m2 = num; count++; } continue; }
			if (nm.indexOf('F|') === 0) { if (!isNaN(num)) { pl.P['F:' + trim(nm.substring(2))] = num; count++; } continue; }
			if (has(legacy, nm)) { if (!isNaN(num)) { pl.def[legacy[nm]] = num; count++; } continue; }
			if (pl.cls[nm] && !isNaN(num)) { pl.cls[nm].val = num; count++; }
		}
		if (!unitsV2) for (var pk in pl.P) if (has(pl.P, pk) && pk.indexOf('F:') === 0) pl.LEG[pk.substring(2)] = 1;
		return { list: pl, conf: conf, count: count };
	};
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));
