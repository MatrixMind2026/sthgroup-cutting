/* STHGroup — проект: детали и материалы из файла .bmk, настройки, раскладка,
   ручные правки. Всё состояние проекта — обычные данные (doc.work), поэтому
   сохраняется в файл как есть и переносится между компьютерами. */
(function (G) {
	'use strict';
	var BM = G.BM = G.BM || {};
	var P = BM.project = {};
	var geom = BM.geom, cut = BM.cut;

	BM.VERSION = '2.2.1';
	BM.FORMAT = 'benchmark-project';

	var TEXTURE_YES = ['дуб', 'ясень', 'сосна', 'орех', 'вяз', 'бук', 'ольха', 'клён', 'клен', 'венге', 'лиственница', 'акация', 'зебрано', 'дерево', 'wood', 'oak'];
	var TEXTURE_NO = ['хдф', 'двп', 'белый', 'бел ', 'антрацит', 'графит', 'серый', 'чёрный', 'черный', 'унидекор', 'unicolor', 'стекло', 'серебр', 'металлик', 'алюмин'];
	var NONEST = ['стекл', 'зеркал', 'плёнк', 'пленк', 'лакобел', 'lacobel', 'mirror', 'glass'];
	P.PALETTE = ['#FBE3A6', '#CFE7D3', '#CDE1F4', '#F5D3CC', '#E0D6F0', '#D2ECEA', '#F4DDBE', '#E3E8BF', '#F3D0E1', '#D9DDE3', '#C9D8C0', '#EAD9C6', '#C7D3EA'];

	/* ------------------------------- помощники -------------------------------- */

	function clone(o) { return JSON.parse(JSON.stringify(o)); }
	P.clone = clone;
	function low(s) { return String(s || '').toLowerCase(); }
	function hasMask(s, list) { s = low(s); for (var i = 0; i < list.length; i++) if (s.indexOf(list[i]) >= 0) return true; return false; }
	function hash(s) {
		var h1 = 5381, h2 = 52711;
		for (var i = 0; i < s.length; i++) { var c = s.charCodeAt(i); h1 = ((h1 * 33) ^ c) | 0; h2 = ((h2 * 31) + c) | 0; }
		return (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36);
	}
	P.hash = hash;
	function r1(v) { return Math.round(v * 10) / 10; }
	P.dim = function (v) { var r = Math.round(v); return (Math.abs(v - r) < 0.05) ? String(r) : (Math.round(v * 10) / 10).toFixed(1).replace('.', ','); };
	P.num = function (n, d) { return Number(n).toFixed(d).replace('.', ','); };
	P.natCmp = function (a, b) {
		var ra = String(a).toLowerCase().match(/\d+|\D+/g) || [], rb = String(b).toLowerCase().match(/\d+|\D+/g) || [];
		for (var i = 0; i < ra.length && i < rb.length; i++) {
			var x = ra[i], y = rb[i];
			if (x === y) continue;
			var dx = /^\d/.test(x), dy = /^\d/.test(y);
			if (dx && dy) { var d = Number(x) - Number(y); if (d) return d; continue; }
			return (x < y) ? -1 : 1;
		}
		return ra.length - rb.length;
	};
	/* название изделия для заголовков и имён файлов: «Артикул — Наименование» (артикул — с выгрузки 1.4) */
	/* «Кракозябры» в выгрузке: БАЗИС прочитал скрипт в UTF-8 как Windows-1251 (скрипты до 1.7.1), и русские
	   слова из скрипта стали вида «Р”РµС‚Р°Р»СЊ». Считаем пары «Р/С + знак второй половины Windows-1251»
	   (без ё и неразрывного пробела — они бывают и в обычном тексте). Возвращает число найденных пар. */
	var MOJI = /[РС][ЂЃ‚ѓ„…†‡€‰Љ‹ЊЌЋЏђ‘’“”•–—™љ›њќћџЎўЈ¤Ґ¦§©Є«¬­®Ї°±Ііґµ¶·№є»јЅѕї]/g;
	P.mojibake = function (doc) {
		var t;
		try { t = JSON.stringify(doc && doc.model || {}); } catch (e) { return 0; }
		var m = t.match(MOJI);
		return m ? m.length : 0;
	};
	P.modelName = function (m) {
		m = m || {};
		var t = String(m.title || '').trim(), a = String(m.art || '').trim();
		if (!a || t.indexOf(a) >= 0) return t;
		return t ? a + ' — ' + t : a;
	};
	P.matKey = function (name, th) { return String(name) + '|' + r1(Number(th) || 0); };
	P.matTitle = function (m) { return String(m.name).replace(/\s+/g, ' ') + (low(m.name).indexOf(P.dim(m.th) + ' мм') >= 0 ? '' : ' ' + P.dim(m.th) + ' мм'); };
	P.posPrefix = '';      /* префикс позиций (настройка раскроя, например «ШУ/»): ставится при открытии проекта и при показе */
	P.main = function (t) { var a = []; if (t.pos) a.push((P.posPrefix || '') + t.pos); if (t.des) a.push(t.des); return a.join(' · '); };

	/* ------------------------------- настройки -------------------------------- */

	/* Темы окна: id, название, основа (светлая или тёмная — от неё зависят заставка и тени) и три цвета для образца. */
	BM.THEMES = [
		{ id: 'light', name: 'Светлая', base: 'light', sw: ['#eef0f2', '#ffffff', '#0E6B5A'] },
		{ id: 'paper', name: 'Бумага', base: 'light', sw: ['#ece7de', '#fbf9f4', '#0E6B5A'] },
		{ id: 'steel', name: 'Сталь', base: 'light', sw: ['#e9eef4', '#ffffff', '#1F5FBF'] },
		{ id: 'dark', name: 'Тёмная', base: 'dark', sw: ['#1d2023', '#262a2e', '#3FCFAE'] },
		{ id: 'fire', name: 'Графит и огонь', base: 'dark', sw: ['#15171a', '#1f2327', '#FF8A1F'] },
		{ id: 'night', name: 'Ночь', base: 'dark', sw: ['#121826', '#1a2232', '#5AB0FF'] }
	];
	BM.theme = function (id) { for (var i = 0; i < BM.THEMES.length; i++) if (BM.THEMES[i].id === id) return BM.THEMES[i]; return BM.THEMES[0]; };
	/* Настройки раскроя без четырёх основных (рез, отступ, припуск, качество — они лежат рядом на верхнем уровне). */
	BM.cutDefaults = function () {
		var o = {}, d = BM.cut.DEF, skip = { kerf: 1, margin: 1, allow: 1, quality: 1, seed: 1 };
		for (var k in d) if (d.hasOwnProperty(k) && !skip[k]) o[k] = JSON.parse(JSON.stringify(d[k]));
		return o;
	};
	BM.defaults = function () {
		return {
			v: 1,
			kerf: 4, margin: 10, allow: 4, quality: 1,      // рез, отступ от края плиты, припуск криволинейным, качество поиска
			rules: { groups: 1 },
			cut: BM.cutDefaults(),        // остальные настройки раскроя (окно «Настройки → Раскрой»)
			cutV: 2,                      // версия настроек раскроя: старые настройки (до 1.21) не переносятся
			/* присадка, на всю программу. mode — оформление карты: A — номера и таблица, B — значки по свёрлам,
			   V — диаметр у отверстия, G — чертёж и таблица на разных листах; cap — высота цифр, мм; cap2 — высота
			   текста второго листа в G; gMark — что у отверстий в G: num | numsym; multi — PDF: мелкие карты по несколько на лист */
			drill: { mode: 'B', cap: 1.8, cap2: 2.5, gMark: 'num', fast: 1, color: 0, guides: 1, rows: 1, minMark: 1.4, baseDef: 0, thru: 'more', key: 1, exRead: 1, exInfo: 1, text: '', multi: 0, ends: 1, pic: 1 },
			/* деталировка, на всю программу: style — оформление листа (V — чертёж и список обработок, A — таблица справа,
			   B — крупный чертёж и строка сведений); что показывать: размеры, кромка и текстура, отверстия, «где деталь», сведения */
			detail: { style: 'V', dims: 1, edge: 1, holes: 1, pic: 1, info: 1, callouts: 1 },
			/* список деталей в «Присадке» и «Деталировке» (общий): sort — pos | mod | mat | n; filter — all | side | hor | fac | back | cut */
			parts: { sort: 'mat', filter: 'all' },
			/* раздел «Модель»: style — оформление (см. BM.v3d.STYLES); что показывать; up, front — верх и лицо изделия
			   ('' — определять самой, иначе 'x', '-x', 'y'…); zmode — с какой стороны от опорной плоскости толщина панели (−1 — определять самой) */
			model: { style: 'studio', look: 'plain', quality: 'high', outline: 1, holes: 1, band: 1, grooves: 1, furn: 1, up: '', front: '', zmode: -1, glowW: 'Рассеиватель', glowLed: 'Лента', glowProf: 'Профиль', glowSh: '4' },
			tipPriceOff: 0,               // смета: совет «в прайсе пока нет своих цен» закрыт крестиком
			bzFiles: [],                  // «База»: файлы базы материалов БАЗИСа (.dbf), загруженные раньше — последний первым
			offMin: 50,                   // обрезок уже этого на карте не показываем, мм
			org: '', author: '', phone: '',
			theme: 'light', color: 'name', anim: 1,      // тема окна: см. BM.THEMES
			baseFold: {}, baseDirs: {},   // «База»: свёрнутые группы классов, раскрытые папки БАЗИСа
			linkDir: '',
			paneOff: {},                  // боковые панели, спрятанные язычком: имя панели → 1                  // «Открыть по ссылке на Яндекс Диск»: папка, куда скачиваются модели
			zoom: 1,                      // масштаб окна программы: 0.5–2 (PDF и Excel не меняются)
			texMaps: 1,                   // текстура материала (раздел «База») на картах раскроя и в PDF
			panes: {},                    // ширина панелей, растянутых мышью за стык: имя панели → px
			sound: 1,                     // звук заставки при запуске
			formats: [[2800, 2070], [2750, 1830], [2440, 1830], [2800, 1220], [2440, 1220]],
			mats: {},                     // запомненные настройки материалов: ключ → { fmts, fmt, grain, on }
			texMap: { none: 0, horiz: 1, vert: 2 },
			pdf: { color: 1, summary: 1, maps: 1, big: 0, list: 1, offcuts: 1 },
			dxf: { cur: 0, profiles: [BM.dxfProfile('Стандартный')] },
			fb: { name: '', reply: '', proj: 1, diag: 1 },      // отзывы тестеров: подпись, почта для ответа и что прикладывать
			est: BM.est ? BM.est.defaults() : {},               // смета: правила расчёта и вид документов (цены лежат отдельно, в прайсах)
			outDir: 'Раскрой',
			updateDir: '',
			updateOnline: 1                  // спрашивать Яндекс Диск о новой версии при запуске (если есть ключ обновлений)
		};
	};
	BM.dxfProfile = function (name) {
		return { name: name, sheet: 'SHEET', outer: 'CONTOUR', inner: 'INNER', label: 'TEXT', drill: 'DRILL', groove: 'GROOVE',
				 useSheet: 1, useInner: 1, useLabel: 1, useDrill: 1, useGroove: 1, drillByDia: 1, arcs: 1, textH: 20, labelWhat: 'des', margin: 1 };
	};
	/* Настройки с диска могут быть старыми или неполными — дополняем по образцу. */
	BM.mergeSettings = function (s) {
		var d = BM.defaults();
		if (!s || typeof s !== 'object') return d;
		for (var k in d) {
			if (!d.hasOwnProperty(k)) continue;
			if (s[k] === undefined || s[k] === null) continue;
			if (typeof d[k] === 'object' && !Array.isArray(d[k]) && k !== 'mats') { for (var q in s[k]) if (s[k].hasOwnProperty(q)) d[k][q] = s[k][q]; }
			else d[k] = s[k];
		}
		if (s.drillPdf && s.drill === undefined) d.drill.multi = s.drillPdf.multi ? 1 : 0;      // настройка версии 1.3
		if (s.cutV !== 2) { var d0 = BM.defaults(); d.kerf = d0.kerf; d.margin = d0.margin; d.allow = d0.allow; d.quality = d0.quality; d.cut = d0.cut; }      // раскрой 1.21: прежние настройки не переносятся
		else { var dc = BM.cutDefaults(); for (var ck in dc) if (dc.hasOwnProperty(ck) && d.cut[ck] === undefined) d.cut[ck] = dc[ck]; }
		d.cutV = 2; delete d.rules.same; delete d.rules.last; delete d.rules.center; delete d.mill; delete d.flip; delete d.smallArea; delete d.machDefault;
		if (!d.dxf.profiles || !d.dxf.profiles.length) d.dxf.profiles = [BM.dxfProfile('Стандартный')];
		for (var i = 0; i < d.dxf.profiles.length; i++) { var base = BM.dxfProfile(''); for (var f in base) if (d.dxf.profiles[i][f] === undefined) d.dxf.profiles[i][f] = base[f]; }
		if (!(d.dxf.cur >= 0 && d.dxf.cur < d.dxf.profiles.length)) d.dxf.cur = 0;
		return d;
	};
	P.PARAMS = ['kerf', 'margin', 'allow', 'quality'];
	function paramsFrom(set) {
		var o = { rules: clone(set.rules), cut: clone(set.cut), cutV: 2 };
		for (var i = 0; i < P.PARAMS.length; i++) o[P.PARAMS[i]] = set[P.PARAMS[i]];
		return o;
	}
	P.paramsFrom = paramsFrom;

	/* ------------------------------ текстура ---------------------------------- */

	/* Что значит число TextureOrientation у панели: 'n' — нет, 'x' — вдоль X контура, 'y' — вдоль Y, '' — неизвестно. */
	function texMeaning(st, raw) {
		if (raw === null || raw === undefined || raw === '') return '';
		var c = st.model.texConst || {}, m = st.set.texMap || {};
		var none = c.None !== undefined ? c.None : m.none, hor = c.Horizontal !== undefined ? c.Horizontal : m.horiz, ver = c.Vertical !== undefined ? c.Vertical : m.vert;
		if (typeof raw === 'string') { var s = low(raw); if (s.indexOf('hor') >= 0) return 'x'; if (s.indexOf('ver') >= 0) return 'y'; if (s.indexOf('non') >= 0) return 'n'; return ''; }
		if (raw === hor) return 'x';
		if (raw === ver) return 'y';
		if (raw === none) return 'n';
		return '';
	}
	/* Текстура детали по данным БАЗИСа: 'l' — вдоль длины, 'w' — поперёк, 'n' — любая. */
	P.grainAuto = function (st, t) {
		var m = texMeaning(st, t.tex);
		if (m === 'n') return 'n';
		if (m === 'x') return t.wide ? 'l' : 'w';
		if (m === 'y') return t.wide ? 'w' : 'l';
		var tu = st.work.params.cut && st.work.params.cut.texUnknown;
		return (tu === 'w' || tu === 'n') ? tu : 'l';                // БАЗИС не сказал — как задано в «Раскрой → Ориентация» (по умолчанию длинной стороной вдоль листа)
	};
	P.grainOf = function (st, t, mat) {
		if (mat && !mat.cfg.grain) return 'n';
		var ov = (st.work.parts[t.sig] || {}).tex;
		return (ov === 'l' || ov === 'w' || ov === 'n') ? ov : P.grainAuto(st, t);
	};
	function qsOf(gr) { return gr === 'n' ? [0, 1, 2, 3] : (gr === 'w' ? [1, 3] : [0, 2]); }
	P.qsOf = qsOf;

	/* ------------------------------ присадка ---------------------------------- */
	/*  Отверстия выгружены в глобальных координатах; у каждой панели — её система
	    координат. Отверстие принадлежит панели, если ось сверления проходит через
	    её тело: в пласть (вдоль оси Z панели) или в торец (поперёк).
	    Где у панели ноль по толщине, БАЗИС не говорит — подбираем по всем панелям
	    сразу тот вариант, при котором находится больше отверстий.                */
	P.matchHoles = function (model) {
		var parts = model.parts || [], holes = model.holes || [], res = { by: {}, zmode: 0, face: 0, edge: 0, lost: 0, total: 0 };
		var local = [], i, j, k;
		for (i = 0; i < parts.length; i++) {
			var f = parts[i].frame;
			if (!f || parts[i].plastic) { local.push(null); continue; }
			var xs = [], ys = [];
			for (j = 0; j < parts[i].els.length; j++) {
				var e = parts[i].els[j];
				if (!e) continue;
				if (e.t === 'C') { xs.push(e.c[0] - e.r, e.c[0] + e.r); ys.push(e.c[1] - e.r, e.c[1] + e.r); }
				else { xs.push(e.a[0], e.b[0]); ys.push(e.a[1], e.b[1]); }
			}
			if (!xs.length) { local.push(null); continue; }
			var x1 = Math.min.apply(null, xs), x2 = Math.max.apply(null, xs), y1 = Math.min.apply(null, ys), y2 = Math.max.apply(null, ys);
			/* дуга может выходить за концы: расширяем до габарита */
			if (x2 - x1 < parts[i].w - 0.5) x2 = x1 + parts[i].w;
			if (y2 - y1 < parts[i].h - 0.5) y2 = y1 + parts[i].h;
			local.push({ f: f, x1: x1, x2: x2, y1: y1, y2: y2, th: parts[i].th, id: parts[i].id });
		}
		function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
		var hl = [];
		for (k = 0; k < holes.length; k++) {
			var h = holes[k];
			if (!h.p || !h.d || !(h.dia > 0)) continue;
			res.total++;
			hl.push(h);
		}
		function run(zmode, write) {
			var found = 0, usedH = {};
			for (i = 0; i < local.length; i++) {
				var pl = local[i];
				if (!pl) continue;
				var z0 = zmode === 0 ? 0 : (zmode === 1 ? -pl.th : -pl.th / 2), z1 = z0 + pl.th;
				for (k = 0; k < hl.length; k++) {
					var h = hl[k], rel = [h.p[0] - pl.f.o[0], h.p[1] - pl.f.o[1], h.p[2] - pl.f.o[2]];
					var lx = dot(rel, pl.f.x), ly = dot(rel, pl.f.y), lz = dot(rel, pl.f.z);
					if (lx < pl.x1 - 60 || lx > pl.x2 + 60 || ly < pl.y1 - 60 || ly > pl.y2 + 60 || lz < z0 - 60 || lz > z1 + 60) continue;
					var dx = dot(h.d, pl.f.x), dy = dot(h.d, pl.f.y), dz = dot(h.d, pl.f.z), dep = h.depth > 0 ? h.depth : pl.th;
					if (Math.abs(dz) > 0.95) {
						if (lx < pl.x1 - 0.5 || lx > pl.x2 + 0.5 || ly < pl.y1 - 0.5 || ly > pl.y2 + 0.5) continue;
						var za = lz, zb = lz + dz * dep, lo = Math.max(Math.min(za, zb), z0), hi = Math.min(Math.max(za, zb), z1);
						if (hi - lo < 0.5) continue;
						found++; usedH[k] = 1;
						if (write) {
							var o = res.by[pl.id] || (res.by[pl.id] = { top: [], bot: [], thr: [], edge: [], seen: {} });
							var rec = { x: lx, y: ly, d: h.dia, dep: r1(hi - lo), fast: h.fast };
							/* одно и то же отверстие БАЗИС может отдать дважды: у крепежа и у сборки, в которую он входит */
							var dk = Math.round(lx * 10) + ',' + Math.round(ly * 10) + ',' + Math.round(h.dia * 10) + ',' + (dz < 0 ? 't' : 'b');
							if (o.seen[dk]) continue;
							o.seen[dk] = 1;
							if (hi - lo >= pl.th - 0.1 || h.mode === 1) o.thr.push(rec);
							else if (dz < 0) o.top.push(rec); else o.bot.push(rec);
							res.face++;
						}
					} else if (Math.abs(dz) < 0.3) {
						if (lz < z0 + 0.5 || lz > z1 - 0.5) continue;
						/* торец: точка входа у края габарита, сверло идёт внутрь */
						var mx = lx + dx * Math.min(dep, 8) , my = ly + dy * Math.min(dep, 8);
						var nearEdge = lx < pl.x1 + 1 || lx > pl.x2 - 1 || ly < pl.y1 + 1 || ly > pl.y2 - 1;
						var inside = mx > pl.x1 + 0.5 && mx < pl.x2 - 0.5 && my > pl.y1 + 0.5 && my < pl.y2 - 0.5;
						if (!nearEdge || !inside || lx < pl.x1 - 1 || lx > pl.x2 + 1 || ly < pl.y1 - 1 || ly > pl.y2 + 1) continue;
						found++; usedH[k] = 1;
						if (write) {
							var o2 = res.by[pl.id] || (res.by[pl.id] = { top: [], bot: [], thr: [], edge: [], seen: {} });
							var ek = 'e' + Math.round(lx * 10) + ',' + Math.round(ly * 10) + ',' + Math.round(lz * 10);
							if (o2.seen[ek]) continue;
							o2.seen[ek] = 1;
							o2.edge.push({ x: lx, y: ly, z: r1(lz - z0), dx: dx, dy: dy, d: h.dia, dep: dep, fast: h.fast });
							res.edge++;
						}
					}
				}
			}
			if (write) { var u = 0; for (var q in usedH) if (usedH.hasOwnProperty(q)) u++; res.lost = hl.length - u; }
			return found;
		}
		if (!hl.length) return res;
		var best = -1;
		for (var z = 0; z < 3; z++) { var n = run(z, false); if (n > best) { best = n; res.zmode = z; } }
		run(res.zmode, true);
		return res;
	};

	/* ---------------------- детали и материалы проекта ------------------------ */

	function typeOfPart(part, sh) {
		var es = [sh.sides.T, sh.sides.B, sh.sides.L, sh.sides.R, sh.edges.length].join(',');
		var src = [part.mat, part.th, part.name, part.pos, part.des, r1(sh.L), r1(sh.W), sh.sg, es, part.tex === null || part.tex === undefined ? '' : part.tex, part.plastic ? 1 : 0].join('|') + (sh.saw && sh.saw.known ? '|s' + [sh.saw.T, sh.saw.B, sh.saw.L, sh.saw.R].join(',') : '');
		return 't' + hash(src);
	}

	/* Разновидности деталей модели: одинаковые (материал, название, позиция, обозначение,
	   размер, форма, кромка, текстура) склеены, cnt — сколько их. */
	P.readTypes = function (model, holes) {
		var types = [], by = {}, parts = model.parts || [];
		geom.resetStat();
		for (var i = 0; i < parts.length; i++) {
			var p = parts[i], sh = geom.readShape(p), sig = typeOfPart(p, sh), t = by[sig];
			if (!t) {
				t = by[sig] = { sig: sig, name: p.name || 'Деталь', pos: p.pos || '', des: p.des || '', matName: p.mat, art: p.art || '', th: Number(p.th) || 0,
								mat0: P.matKey(p.mat, p.th), L: sh.L, W: sh.W, wide: sh.wide, shape: sh, shapeM: null, tex: p.tex, cnt: 0, cntSel: 0, ids: [],
								path: p.path || [], plastic: p.plastic ? 1 : 0, holes: null, flip: 0, cuts: [], src: p };
				/* пильный размер (скрипт 1.8, только прямоугольные детали): контур − подрезанная кромка + припуск */
				t.sL = t.L; t.sW = t.W;
				if (sh.saw && sh.saw.known && !sh.pts) { t.sL = r1(t.L + sh.saw.L + sh.saw.R); t.sW = r1(t.W + sh.saw.T + sh.saw.B); }
				types.push(t);
				/* пазы: траектория в координатах контура → в рамку детали */
				for (var c = 0; c < (p.cuts || []).length; c++) {
					var ct = p.cuts[c], els = geom.readEls(ct.path), okEls = [];
					for (var e = 0; e < els.length; e++) if (els[e]) okEls.push(els[e]);
					if (okEls.length && sh.fr) t.cuts.push({ name: ct.name, sign: ct.sign, w: ct.sw, d: ct.sh, els: geom.mapEls(okEls, function (pt) { return geom.toFrameRaw(sh.fr, pt); }, true) });
				}
			}
			t.cnt++; if (p.sel) t.cntSel++;
			t.ids.push(p.id);
			if (!t.holes && holes && holes.by[p.id] && sh.fr) {
				var hb = holes.by[p.id], conv = function (list) { return list.map(function (h) { var q = geom.toFrameRaw(sh.fr, [h.x, h.y]); return { x: r1(q[0]), y: r1(q[1]), d: h.d, dep: h.dep, fast: h.fast }; }); };
				t.holes = { top: conv(hb.top), bot: conv(hb.bot), thr: conv(hb.thr), edge: hb.edge.length };
				t.flip = t.holes.bot.length > t.holes.top.length ? 1 : 0;
			}
		}
		return { types: types, by: by, stat: clone(geom.stat) };
	};

	function guessFormats(name, set) {
		var out = [], seen = {}, m = /(\d{4})\s*[xх×*]\s*(\d{3,4})/i.exec(String(name));
		function add(L, W) { var a = Math.max(L, W), b = Math.min(L, W), k = a + 'x' + b; if (!seen[k] && a >= 500 && b >= 200) { seen[k] = 1; out.push([a, b]); } }
		var mb = BM.mb && BM.mb.cur && BM.mb.infoFor ? BM.mb.infoFor(BM.mb.cur, name, '') : null;     // формат листа из «Базы материалов» (2.2) — первым
		if (mb && mb.L > 0 && mb.W > 0) add(mb.L, mb.W);
		var Bs = BM.base, bs = Bs && Bs.cur && Bs.bzSheet ? Bs.bzSheet(Bs.cur, name) : null;     // размер листа из базы материалов БАЗИСа
		if (bs) add(bs[0], bs[1]);
		if (m) add(Number(m[1]), Number(m[2]));
		for (var i = 0; i < set.formats.length; i++) add(set.formats[i][0], set.formats[i][1]);
		if (!out.length) add(2800, 2070);
		return out;
	}
	function defaultMatCfg(name, th, set) {
		var key = P.matKey(name, th), mem = set.mats[key];
		var cfg = { on: hasMask(name, NONEST) ? 0 : 1, grain: hasMask(name, TEXTURE_YES) ? 1 : (hasMask(name, TEXTURE_NO) ? 0 : 1), fmts: guessFormats(name, set), fmt: 0, rem: [] };
		if (mem) {
			if (mem.fmts && mem.fmts.length) { cfg.fmts = clone(mem.fmts); cfg.fmt = (mem.fmt >= 0 && mem.fmt < mem.fmts.length) ? mem.fmt : 0; }
			if (mem.grain !== undefined) cfg.grain = mem.grain ? 1 : 0;
			if (mem.on !== undefined) cfg.on = mem.on ? 1 : 0;
		}
		return cfg;
	}
	P.defaultMatCfg = defaultMatCfg;

	/* est — смета этого заказа: количества, заданные вручную, скидка, заказчик, свои строки «Прочее», выбранный прайс */
	P.newWork = function (set) { return { v: 1, scope: 'all', sets: 1, params: paramsFrom(set), mats: {}, parts: {}, layout: {}, extraMats: [], drill: { base: {}, note: {} }, est: { qty: {}, disc: 0, client: '', rows: [], pl: '' } }; };

	/* ---------------------------- заказные фасады -----------------------------
	   Фасад, который заказывают готовым (полуфабрикат из профиля и стекла, фасад в эмали), — блок модели,
	   чей артикул начинается со знака @ и с одной из строк списка в настройках сметы (set.est.facArts:
	   «@Заказной фасад», «@Фасад Макро», «@Фасад в эмали»). Такой блок считается штукой; его детали,
	   профили, стекло и отверстия — нет. Если в настройках «МДФ остаётся в раскрое» (set.est.facMdf = 'cut'),
	   панели МДФ внутри блока, их облицовки и отверстия фасада идут в раскрой и присадку как обычно.
	   P.facadeOf(model, set) — для каждого блока номер блока-фасада, в который он входит (сам
	   или через блоки над ним), или −1. Фасадом считается внешний из подходящих блоков. */
	P.FAC_ARTS = ['@Заказной фасад', '@Фасад Макро', '@Фасад в эмали'];
	function facArts(set) {
		var a = set && set.est && Array.isArray(set.est.facArts) ? set.est.facArts : P.FAC_ARTS;
		return a.map(function (x) { return String(x || '').trim().toLowerCase(); }).filter(function (x) { return x.charAt(0) === '@' && x.length > 1; });
	}
	P.facArtHit = function (art, list) {
		var a = String(art || '').trim().toLowerCase();
		if (a.charAt(0) !== '@') return false;
		for (var k = 0; k < list.length; k++) if (a.indexOf(list[k]) === 0) return true;
		return false;
	};
	P.facadeOf = function (model, set) {
		var B = model.blocks || [], arts = facArts(set), keepMdf = !!(set && set.est && set.est.facMdf === 'cut'), key = arts.join(',') + (keepMdf ? '|cut' : ''), out = [], i;
		if (model._facKey === key && model._fac && model._fac.length === B.length) return model._fac;
		for (i = 0; i < B.length; i++) out.push(-1);
		if (arts.length) {
			/* блоки идут сверху вниз: блок, в котором лежит этот, всегда записан раньше */
			for (i = 0; i < B.length; i++) {
				var up = B[i].up;
				if (up >= 0 && up < i && out[up] >= 0) { out[i] = out[up]; continue; }
				if (P.facArtHit(B[i].art, arts)) out[i] = i;
			}
		}
		if (keepMdf) {
			var parts = model.parts || [], keep = { ids: {}, blk: {} }, any = false;
			for (i = 0; i < parts.length; i++) {
				var p = parts[i];
				if (p.plastic || p.lin || !(p.bk >= 0 && p.bk < out.length && out[p.bk] >= 0) || !/мдф|mdf/i.test(String(p.mat || ''))) continue;
				keep.ids[p.id] = 1; keep.blk[out[p.bk]] = 1; any = true;
			}
			if (any) out.keep = keep;
		}
		try { Object.defineProperty(model, '_fac', { value: out, configurable: true, writable: true }); Object.defineProperty(model, '_facKey', { value: key, configurable: true, writable: true }); } catch (e) { /* модель заморожена — считаем каждый раз */ }
		return out;
	};
	/* Запись (деталь, отверстие, строка сметы) лежит внутри заказного фасада. */
	P.inFacade = function (fac, r) {
		if (!(r && r.bk >= 0 && r.bk < fac.length && fac[r.bk] >= 0)) return false;
		var kp = fac.keep;
		if (kp) {
			if (r.id !== undefined && !r.plastic && kp.ids[r.id]) return false;          // панель МДФ — в раскрой
			if (r.plastic && r.of !== undefined && kp.ids[r.of]) return false;           // её облицовка
			if (r.dia > 0 && kp.blk[fac[r.bk]]) return false;                            // отверстия фасада (лягут на МДФ или отсеются)
		}
		return true;
	};
	/* Блоки петель: название со словом «петл» или внутри такого блока. Для петель заказных фасадов. */
	P.hingeBlocks = function (model) {
		var B = model.blocks || [], out = [], i;
		for (i = 0; i < B.length; i++) {
			var up = B[i].up;
			out.push((up >= 0 && up < i && out[up]) || /петл/i.test(String(B[i].name || '')) ? 1 : 0);
		}
		return out;
	};
	/* Размер фасада: высота × ширина × толщина. Толщина — наименьший размер блока, высота — тот из двух
	   других, чья ось ближе к вертикали (верх — как в разделе «Модель», по умолчанию ось Y, как в БАЗИСе). */
	P.facadeSize = function (b, set) {
		var s = b && b.gs;
		if (!s || s.length !== 3) return null;
		var idx = [0, 1, 2].sort(function (a, c) { return s[a] - s[c]; }), t = idx[0], a1 = idx[1], a2 = idx[2];
		var upName = (set && set.model && set.model.up) || 'y', ua = { x: 0, y: 1, z: 2 }[upName.replace('-', '')], fr = b.fr, h = a2, w = a1;
		if (fr && ua !== undefined) {
			var ax = [fr.x, fr.y, fr.z];
			if (Math.abs(ax[a1][ua]) > Math.abs(ax[a2][ua])) { h = a1; w = a2; }
		}
		return { h: Math.round(s[h]), w: Math.round(s[w]), d: Math.round(s[t]) };
	};

	/* ------------------------- фасады МДФ: плёнка и эмаль -----------------------
	   Панель, у которой облицовка пласти толщиной 0 мм, — фасад МДФ в плёнке или эмали: облицовка — это
	   покрытие (его название), одна облицовка — покрытие с лицевой стороны, две — с двух сторон.
	   Чья облицовка — записано в ней (of); в прежних выгрузках облицовка идёт сразу за своей панелью.
	   Вид — по названию покрытия: есть слово «эмаль» — эмаль, иначе плёнка.
	   P.mdfFacades(model) → { номер детали: { coats: [облицовки], coat, art, sides, kind, note } }. */
	P.mdfFacades = function (model) {
		var parts = model.parts || [], out = {}, last = null, byId = {}, i;
		if (model._mdf) return model._mdf;
		for (i = 0; i < parts.length; i++) byId[parts[i].id] = parts[i];
		for (i = 0; i < parts.length; i++) {
			var p = parts[i];
			if (!p.plastic) { last = p; continue; }
			if (!(Math.abs(Number(p.th) || 0) < 0.01) || !p.mat) continue;
			var host = (p.of !== undefined && byId[p.of]) ? byId[p.of] : last;
			if (!host || host.plastic || host.lin) continue;
			var f = out[host.id] || (out[host.id] = { coats: [], coat: '', art: '', sides: 0, kind: '', note: '' });
			f.coats.push(p.mat);
			if (!f.coat) { f.coat = p.mat; f.art = p.art || ''; f.note = p.note || ''; }
		}
		for (var k in out) {
			if (!out.hasOwnProperty(k)) continue;
			var o = out[k], uniq = [];
			for (i = 0; i < o.coats.length; i++) if (uniq.indexOf(o.coats[i]) < 0) uniq.push(o.coats[i]);
			o.sides = o.coats.length >= 2 ? 2 : 1;
			o.coat = uniq.join(' / ');
			o.kind = /эмал/i.test(o.coat) ? 'enamel' : 'film';
		}
		try { Object.defineProperty(model, '_mdf', { value: out, configurable: true, writable: true }); } catch (e) { /* модель заморожена */ }
		return out;
	};
	P.MDF_KIND = { film: 'ПЛЁНКА', enamel: 'ЭМАЛЬ', frame: 'РАМОЧНЫЙ' };
	/* Название покрытия для строки: «Плёнка …» или «Эмаль …» (если слова в названии нет — добавляется). */
	P.coatTitle = function (f) {
		var c = String(f.coat || '');
		if (f.kind === 'enamel') return /^\s*эмал/i.test(c) ? c : 'Эмаль ' + c;
		return /^\s*пл[её]нк/i.test(c) ? c : 'Плёнка ' + c;
	};
	P.sidesTitle = function (n) { return n >= 2 ? 'две стороны' : 'лицевая сторона'; };
	/* Верх модели: настройка раздела «Модель» ('y', '-z' …), по умолчанию Y — как в БАЗИСе. */
	P.upVec = function (set) {
		var u = String((set && set.model && set.model.up) || 'y'), a = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }[u.replace('-', '')] || [0, 1, 0];
		return u.charAt(0) === '-' ? [-a[0], -a[1], -a[2]] : a;
	};

	/* Модель, как её видят раскрой и присадка. В файле лежит всё, что выгружено из БАЗИСа, а в работу
	   идёт не всё: погонные панели (lin) нужны только смете, скрытые (hid) берутся, только если включена
	   настройка «скрытые панели», детали заказных фасадов не идут совсем. Прежние файлы таких записей
	   не содержат — для них это сама модель. */
	P.viewModel = function (model, set) {
		var parts = model.parts || [], holes = model.holes || [], i, any = false, fac = P.facadeOf(model, set);
		for (i = 0; i < parts.length && !any; i++) if (parts[i].lin || parts[i].hid || P.inFacade(fac, parts[i])) any = true;
		for (i = 0; i < holes.length && !any; i++) if (holes[i].hid || P.inFacade(fac, holes[i])) any = true;
		if (!any) return model;
		var inc = !!(set && set.est && set.est.hidden), v = {}, k, sel = 0;
		for (k in model) if (model.hasOwnProperty(k)) v[k] = model[k];
		v.parts = parts.filter(function (p) { return !p.lin && (inc || !p.hid) && !P.inFacade(fac, p); });
		v.holes = holes.filter(function (h) { return (inc || !h.hid) && !P.inFacade(fac, h); });
		for (i = 0; i < v.parts.length; i++) if (v.parts[i].sel) sel++;
		v.selected = sel;
		return v;
	};

	/* Состояние проекта: doc — содержимое файла .bmk, set — настройки пользователя. */
	P.build = function (doc, set) {
		var st = { doc: doc, model: P.viewModel(doc.model, set), set: set, warn: [] };
		if (!doc.work || typeof doc.work !== 'object') doc.work = P.newWork(set);
		var w = st.work = doc.work, base = P.newWork(set), k;
		for (k in base) if (base.hasOwnProperty(k) && (w[k] === undefined || w[k] === null)) w[k] = base[k];
		for (k in base.params) if (base.params.hasOwnProperty(k) && w.params[k] === undefined) w.params[k] = base.params[k];
		for (k in base.params.rules) if (base.params.rules.hasOwnProperty(k) && w.params.rules[k] === undefined) w.params.rules[k] = base.params.rules[k];
		if (w.params.cutV !== 2) { w.params.kerf = base.params.kerf; w.params.margin = base.params.margin; w.params.allow = base.params.allow; w.params.cut = base.params.cut; w.params.cutV = 2; }      // раскрой 1.21: проект раскладывается заново
		for (k in base.params.cut) if (base.params.cut.hasOwnProperty(k) && w.params.cut[k] === undefined) w.params.cut[k] = base.params.cut[k];
		if (!(w.sets >= 1)) w.sets = 1;
		if (!w.est.qty) w.est.qty = {};
		if (!Array.isArray(w.est.rows)) w.est.rows = [];
		P.diffSet = set;
		st.holes = P.matchHoles(st.model);
		var rt = P.readTypes(st.model, st.holes);
		st.types = rt.types; st.typeBy = rt.by; st.shapeStat = rt.stat;
		P.refresh(st);
		return st;
	};

	/* Пересобрать материалы после правок (материал детали, область, …). */
	P.refresh = function (st) {
		P.posPrefix = ((st.work && st.work.params && st.work.params.cut) || {}).posPrefix || '';
		var w = st.work, mats = [], by = {}, i;
		function mat(name, th, art) {
			var key = P.matKey(name, th), m = by[key];
			if (!m) {
				m = by[key] = { key: key, name: name, art: art || '', th: Number(th) || 0, types: [] };
				if (!w.mats[key]) w.mats[key] = defaultMatCfg(name, th, st.set);
				m.cfg = w.mats[key];
				if (!m.cfg.fmts || !m.cfg.fmts.length) m.cfg.fmts = guessFormats(name, st.set);
				if (!(m.cfg.fmt >= 0 && m.cfg.fmt < m.cfg.fmts.length)) m.cfg.fmt = 0;
				if (!m.cfg.rem) m.cfg.rem = [];
				mats.push(m);
			}
			return m;
		}
		for (i = 0; i < st.types.length; i++) mat(st.types[i].matName, st.types[i].th, st.types[i].art);
		for (i = 0; i < (w.extraMats || []).length; i++) mat(w.extraMats[i].name, w.extraMats[i].th, '');
		for (i = 0; i < st.types.length; i++) {
			var t = st.types[i], ov = (w.parts[t.sig] || {}).mat;
			t.mat = (ov && by[ov]) ? ov : t.mat0;
			by[t.mat].types.push(t);
		}
		mats.sort(function (a, b) { return P.natCmp(a.name, b.name) || (a.th - b.th); });
		for (i = 0; i < mats.length; i++) mats[i].types.sort(function (a, b) { return P.natCmp(a.des, b.des) || P.natCmp(a.pos, b.pos) || (b.L - a.L) || (b.W - a.W) || (a.name < b.name ? -1 : 1); });
		st.mats = mats; st.matBy = by;
		/* цвет по названию: одно название — один цвет во всём проекте */
		var names = {}, cabs = {}, nl = [], cl = [];
		for (i = 0; i < st.types.length; i++) {
			if (!names.hasOwnProperty(st.types[i].name)) { names[st.types[i].name] = 1; nl.push(st.types[i].name); }
			var cab = st.types[i].path[0] || '';
			if (!cabs.hasOwnProperty(cab)) { cabs[cab] = 1; cl.push(cab); }
		}
		nl.sort(P.natCmp); cl.sort(P.natCmp);
		st.colorIdx = { name: {}, cab: {} };
		for (i = 0; i < nl.length; i++) st.colorIdx.name[nl[i]] = i;
		for (i = 0; i < cl.length; i++) st.colorIdx.cab[cl[i]] = i;
		return st;
	};

	P.colorOf = function (st, t, mode) {
		var i = -1;
		if (mode === 'name') i = st.colorIdx.name[t.name];
		else if (mode === 'cab') i = st.colorIdx.cab[t.path[0] || ''];
		else if (mode === 'grp') { var g = (st.work.parts[t.sig] || {}).grp; i = g > 0 ? g - 1 : -1; }
		return (i === undefined || i < 0) ? '#ffffff' : P.PALETTE[i % P.PALETTE.length];
	};

	/* Сколько штук детали идёт в раскрой (с учётом области, правки количества и комплектов). */
	P.baseCount = function (st, t) {
		var tw = st.work.parts[t.sig] || {};
		if (tw.qty !== undefined && tw.qty !== null && tw.qty >= 0) return Math.round(tw.qty);
		return st.work.scope === 'sel' ? t.cntSel : t.cnt;
	};
	P.count = function (st, t) {
		var tw = st.work.parts[t.sig] || {};
		if (tw.off) return 0;
		return P.baseCount(st, t) * st.work.sets;
	};
	P.tw = function (st, sig, make) {
		var o = st.work.parts[sig];
		if (!o && make) o = st.work.parts[sig] = {};
		return o || {};
	};
	P.flipped = function () { return false; };
	P.shapeFor = function (st, t) { return t.shape; };
	P.fmtOf = function (mat) { var f = mat.cfg.fmts[mat.cfg.fmt] || mat.cfg.fmts[0]; return { L: f[0], W: f[1] }; };
	P.gapOf = function (st) { return st.work.params.kerf; };
	/* Припуск на сторону, с которым деталь кроится (мм), и размер заготовки в повороте q: как считает ядро (cut.js). */
	function baOf(st, curve) {
		var p = st.work.params, c = p.cut, ba = (p.allow > 0 && curve) ? p.allow : 0;
		if (c.draft) ba = Math.max(ba, c.draftAllow > 0 ? c.draftAllow : 0);
		return ba;
	}
	function upTo(v, m) { return m > 0 ? Math.ceil(v / m - 1e-9) * m : v; }
	function cellOf(st, t, q, ba) {
		var m = st.work.params.cut.round, l = upTo((t.sL || t.L) + 2 * ba, m), w = upTo((t.sW || t.W) + 2 * ba, m);
		return { a: (q & 1) ? w : l, b: (q & 1) ? l : w };
	}
	P.baOf = baOf; P.cellOf = cellOf;
	/* Настройки ядра: четыре основные и всё из окна «Раскрой». */
	P.cutOpt = function (st, extra) {
		var p = st.work.params, o = clone(p.cut), k;
		o.kerf = p.kerf; o.margin = p.margin; o.allow = p.allow; o.quality = p.quality;
		if (extra) for (k in extra) if (extra.hasOwnProperty(k)) o[k] = extra[k];
		return o;
	};

	/* ------------------------------ подготовка -------------------------------- */

	function itemOfType(st, mat, t) {
		var sh = P.shapeFor(st, t, mat), gr = P.grainOf(st, t, mat);
		return { l0: t.sL || t.L, w0: t.sW || t.W, pts: sh.pts, sg: sh.sg, ar: sh.area, per: sh.perim, qs: qsOf(gr), curve: sh.curve,
				 small: false, type: t.sig };
	}

	/* Группа «держать вместе, по рисунку»: детали кладутся одним блоком вплотную (через
	   рез), в порядке списка. Одинаковой длины — стопкой поперёк листа, одинаковой ширины —
	   в ряд вдоль листа; иначе — как компактнее. Возвращает блок или null, если на лист
	   он не помещается. */
	function buildBlock(st, mat, members, UL, UW) {
		var gap = P.gapOf(st, mat);
		var ms = [], i, free = true, sumA = 0, sumB = 0, maxA = 0, maxB = 0, sameA = true, sameB = true, ar = 0, per = 0;
		for (i = 0; i < members.length; i++) {
			var t = st.typeBy[members[i].t], sh = P.shapeFor(st, t, mat), gr = P.grainOf(st, t, mat), q = gr === 'w' ? 1 : 0;
			var ba = baOf(st, sh.curve), cl = cellOf(st, t, q, ba), a = cl.a, b = cl.b;
			if (gr !== 'n') free = false;
			ms.push({ t: members[i].t, k: members[i].k, a: a, b: b, q: q, ba: ba });
			sumA += a; sumB += b; maxA = Math.max(maxA, a); maxB = Math.max(maxB, b);
			ar += sh.area; per += sh.perim;
		}
		for (i = 1; i < ms.length; i++) { if (Math.abs(ms[i].a - ms[0].a) > 0.5) sameA = false; if (Math.abs(ms[i].b - ms[0].b) > 0.5) sameB = false; }
		var g = gap * (ms.length - 1);
		var col = { w: maxA, h: sumB + g }, row = { w: sumA + g, h: maxB };
		function fits(o) { return (o.w <= UL + 0.01 && o.h <= UW + 0.01) || (free && o.h <= UL + 0.01 && o.w <= UW + 0.01); }
		var mode = null;
		if (sameA && fits(col)) mode = 'col';
		else if (sameB && fits(row)) mode = 'row';
		else if (fits(col) && fits(row)) mode = (col.w * col.h <= row.w * row.h) ? 'col' : 'row';
		else if (fits(col)) mode = 'col';
		else if (fits(row)) mode = 'row';
		if (!mode) return null;
		var x = 0, y = 0;
		for (i = 0; i < ms.length; i++) {
			ms[i].dx = mode === 'row' ? x : 0; ms[i].dy = mode === 'col' ? y : 0;
			x += ms[i].a + gap; y += ms[i].b + gap;
		}
		var o = mode === 'col' ? col : row;
		return { item: { l0: o.w, w0: o.h, pts: null, sg: 'B' + hash(JSON.stringify(ms)), ar: ar, per: per, qs: free ? [0, 1] : [0], curve: false, small: false, type: '' }, members: ms, w: o.w, h: o.h };
	}

	/* Записи листа из результата раскладки: одиночная деталь или блок группы. */
	function expand(unit, rc) {
		if (!unit.blk) return [{ t: unit.t, k: unit.k, x: rc.x, y: rc.y, a: rc.a, b: rc.b, q: rc.q, ba: rc.ba || 0 }];
		var out = [], B = unit.blk, turn = (rc.q & 1);
		for (var i = 0; i < B.members.length; i++) {
			var m = B.members[i];
			if (!turn) out.push({ t: m.t, k: m.k, x: rc.x + m.dx, y: rc.y + m.dy, a: m.a, b: m.b, q: m.q, ba: m.ba, u: unit.u });
			else out.push({ t: m.t, k: m.k, x: rc.x + (B.h - m.dy - m.b), y: rc.y + m.dx, a: m.b, b: m.a, q: (m.q + 1) & 3, ba: m.ba, u: unit.u });
		}
		return out;
	}

	/* Единицы раскладки из списка экземпляров { t, k }: одиночные детали и блоки групп. */
	function unitsFrom(st, mat, inst, UL, UW, warn) {
		var units = [], blocks = {}, order = [], i;
		var useGroups = !!st.work.params.rules.groups;
		for (i = 0; i < inst.length; i++) {
			var t = st.typeBy[inst[i].t], tw = st.work.parts[t.sig] || {}, grp = useGroups ? (tw.grp | 0) : 0;
			if (grp > 0) {
				var per = Math.max(1, P.baseCount(st, t)), bk = 'g' + grp + '.' + Math.floor(inst[i].k / per);
				if (!blocks[bk]) { blocks[bk] = []; order.push(bk); }
				blocks[bk].push(inst[i]);
			} else units.push({ t: inst[i].t, k: inst[i].k, item: itemOfType(st, mat, t) });
		}
		for (i = 0; i < order.length; i++) {
			var ms = blocks[order[i]], blk = ms.length > 1 ? buildBlock(st, mat, ms, UL, UW) : null;
			if (blk) units.push({ blk: blk, u: order[i], item: blk.item });
			else {
				if (ms.length > 1 && warn) warn.push('Группа ' + order[i].replace(/^g(\d+)\..*$/, '$1') + ' не помещается на лист целиком — её детали разложены по отдельности.');
				for (var j = 0; j < ms.length; j++) units.push({ t: ms[j].t, k: ms[j].k, item: itemOfType(st, mat, st.typeBy[ms[j].t]) });
			}
		}
		return units;
	}
	/* Единицы из записей листа (для перекладки листа). */
	function unitsOfRecs(st, mat, recs, UL, UW) {
		var inst = [];
		for (var i = 0; i < recs.length; i++) inst.push({ t: recs[i].t, k: recs[i].k });
		return unitsFrom(st, mat, inst, UL, UW, null);
	}

	/* Все экземпляры материала: [{ t, k }]. */
	P.instances = function (st, mat) {
		var out = [];
		for (var i = 0; i < mat.types.length; i++) { var n = P.count(st, mat.types[i]); for (var k = 0; k < n; k++) out.push({ t: mat.types[i].sig, k: k }); }
		return out;
	};

	/* Подпись условий раскладки: изменилось что-то из этого — раскладка устарела. */
	P.layoutKey = function (st, mat) {
		var p = st.work.params, f = P.fmtOf(mat), a = [];
		for (var i = 0; i < mat.types.length; i++) {
			var t = mat.types[i], n = P.count(st, t);
			if (!n) continue;
			a.push(t.sig + ':' + n + ':' + P.grainOf(st, t, mat) + ':' + (p.rules.groups ? ((st.work.parts[t.sig] || {}).grp | 0) : 0));
		}
		a.sort();
		return hash([p.kerf, p.margin, p.allow, f.L, f.W, JSON.stringify(mat.cfg.rem), JSON.stringify(p.rules), JSON.stringify(p.cut), st.work.sets, a.join(',')].join('|'));
	};
	P.isStale = function (st, mat) {
		if (!mat.cfg.on) return false;
		var lay = st.work.layout[mat.key];
		if (!lay) return P.instances(st, mat).length > 0;
		return lay.key !== P.layoutKey(st, mat);
	};

	/* Проверить записи листа: деталь существует, её номер в пределах количества, размеры и
	   поворот совпадают. Негодные записи убираются. Возвращает число убранных. */
	function cleanSheet(st, mat, sh, seen) {
		var keep = [], bad = 0;
		for (var i = 0; i < sh.recs.length; i++) {
			var rc = sh.recs[i], t = st.typeBy[rc.t], ok = !!t && t.mat === mat.key;
			if (ok) {
				var n = P.count(st, t), sp = P.shapeFor(st, t, mat), ba = baOf(st, sp.curve);
				var cl = cellOf(st, t, rc.q, ba), a = cl.a, b = cl.b, qs = qsOf(P.grainOf(st, t, mat));
				var qok = qs.indexOf(rc.q) >= 0 || (!sp.pts && qs.indexOf((rc.q + 2) & 3) >= 0);
				ok = rc.k < n && Math.abs(rc.a - a) < 0.05 && Math.abs(rc.b - b) < 0.05 && qok && !seen[rc.t + '#' + rc.k];
			}
			if (ok) { seen[rc.t + '#' + rc.k] = 1; keep.push(rc); } else bad++;
		}
		sh.recs = keep;
		return bad;
	}

	/* Задание на раскладку материала. keepAll — оставить все нынешние листы как есть и
	   разложить только детали, которых на них нет. */
	P.prepare = function (st, key, keepAll) {
		var mat = st.matBy[key], p = st.work.params, f = P.fmtOf(mat), lay = st.work.layout[key];
		var kept = [], seen = {}, i, warn = [];
		if (lay) for (i = 0; i < lay.sheets.length; i++) {
			var sh = lay.sheets[i];
			if (!sh.lock && !keepAll) continue;
			cleanSheet(st, mat, sh, seen);
			if (sh.recs.length || (sh.lock && sh.keep)) kept.push(sh);
		}
		/* детали в буфере программа не раскладывает — их кладёт сам пользователь */
		var buf = [];
		if (lay && lay.buf) for (i = 0; i < lay.buf.length; i++) {
			var bi = lay.buf[i], bt = st.typeBy[bi.t], bid = bi.t + '#' + bi.k;
			if (bt && bt.mat === mat.key && bi.k < P.count(st, bt) && !seen[bid]) { seen[bid] = 1; buf.push({ t: bi.t, k: bi.k }); }
		}
		var all = P.instances(st, mat), inst = [];
		for (i = 0; i < all.length; i++) if (!seen[all[i].t + '#' + all[i].k]) inst.push(all[i]);
		var UL = f.L - 2 * p.margin, UW = f.W - 2 * p.margin;
		var units = unitsFrom(st, mat, inst, UL, UW, warn), items = [];
		for (i = 0; i < units.length; i++) items.push(units[i].item);
		/* остатки, уже занятые закреплёнными листами, второй раз не выдаём */
		var rem = clone(mat.cfg.rem || []);
		for (i = 0; i < rem.length; i++) rem[i] = { L: rem[i].L, W: rem[i].W, n: rem[i].n === undefined ? 1 : rem[i].n };
		for (i = 0; i < kept.length; i++) if (kept[i].rem && rem[kept[i].ri]) rem[kept[i].ri].n = Math.max(0, rem[kept[i].ri].n - 1);
		return { key: key, items: items, units: units, kept: kept, warn: warn, buf: buf,
				 bins: { L: f.L, W: f.W, rem: rem },
				 opt: P.cutOpt(st) };
	};

	/* Лист проекта из листа результата ядра: записи (с блоками групп), дерево и таблица резов. */
	function sheetFromRes(st, units, s) {
		var recs = [], j, p = st.work.params;
		for (j = 0; j < s.recs.length; j++) recs = recs.concat(expand(units[s.recs[j].id], s.recs[j]));
		var ns = { L: s.L, W: s.W, rem: s.rem, ri: s.ri, rot: s.rot, saw: s.saw, lock: 0, recs: recs };
		if (recs.length === s.recs.length) { ns.tree = s.tree; ns.cuts = s.cuts; ns.setups = s.setups; ns.cutsN = s.cutsN; ns.card = s.card; if (p.margin > 0 && ns.saw) ns.saw += s.L + s.W; }
		else fixSaw(st, null, ns);                                      // в блоках групп есть свои резы — разбираем раскладку заново
		return ns;
	}
	P.applyResult = function (st, prep, res) {
		var mat = st.matBy[prep.key], sheets = prep.kept.slice(0), unplaced = [], i, j;
		for (i = 0; i < res.sheets.length; i++) sheets.push(sheetFromRes(st, prep.units, res.sheets[i]));
		for (i = 0; i < res.unplaced.length; i++) {
			var u = prep.units[res.unplaced[i]];
			if (u.blk) for (j = 0; j < u.blk.members.length; j++) unplaced.push({ t: u.blk.members[j].t, k: u.blk.members[j].k });
			else unplaced.push({ t: u.t, k: u.k });
		}
		st.work.layout[prep.key] = { key: P.layoutKey(st, mat), sheets: sheets, unplaced: unplaced, warn: prep.warn, at: Date.now() };
		if (prep.buf && prep.buf.length) st.work.layout[prep.key].buf = prep.buf;
		return st.work.layout[prep.key];
	};

	/* Сравнение раскладок («Улучшить»): по шкале критериев из настроек раскроя (см. cut.better). */
	P.layoutMetric = function (st, lay) {
		if (!lay) return { un: Infinity, tot: { kim: 0, setups: Infinity, rot: Infinity, cuts: Infinity, len: Infinity, cards: Infinity, offcut: 0 } };
		var o = P.cutOpt(st), t = { kim: 0, setups: 0, rot: 0, cuts: 0, len: 0, cards: 0, offcut: 0 }, ar = 0, area = 0, cards = {}, i, j;
		for (i = 0; i < lay.sheets.length; i++) {
			var sh = lay.sheets[i];
			if (!sh.recs.length) continue;
			area += sh.L * sh.W; t.setups += sh.setups || 0; t.rot += sh.rot || 0; t.cuts += sh.cutsN || 0; t.len += sh.saw || 0;
			cards[sh.card === undefined ? 'k' + i : sh.card] = 1;
			for (j = 0; j < sh.recs.length; j++) { var tp = st.typeBy[sh.recs[j].t]; if (tp) ar += tp.L * tp.W; }
			if (sh.tree) t.offcut += cut.offcutScore(sh.tree, o);
		}
		t.kim = area > 0 ? ar / area : 0; t.cards = Object.keys(cards).length;
		return { un: (lay.unplaced || []).length, tot: t, n: lay.sheets.length };
	};
	P.betterLayout = function (a, b, st) {
		return cut.better({ unplaced: { length: a.un }, tot: a.tot }, { unplaced: { length: b.un }, tot: b.tot }, st ? P.cutOpt(st) : cut.DEF);
	};

	/* Раскладка материала сразу (в этом же потоке). */
	P.nest = function (st, key, extra) {
		var prep = P.prepare(st, key, extra && extra.keepAll);
		if (extra) for (var k in extra) if (extra.hasOwnProperty(k) && k !== 'keepAll') prep.opt[k] = extra[k];
		var res = prep.items.length ? cut.nest(prep.items, prep.bins, prep.opt) : { sheets: [], unplaced: [], saw: 0 };
		return P.applyResult(st, prep, res);
	};

	/* ------------------------------ вид листа --------------------------------- */

	P.usable = function (st, sh) { var m = st.work.params.margin; return { UL: sh.L - 2 * m, UW: sh.W - 2 * m, m: m }; };

	/* Контур уложенной детали в координатах полезной зоны листа. */
	P.recPoly = function (st, mat, rc) {
		var t = st.typeBy[rc.t], sh = P.shapeFor(st, t, mat), A = rc.ba || 0;
		return geom.placed(sh.pts, t.L, t.W, rc.q, rc.x + A, rc.y + A);
	};
	/* То, что деталь занимает на листе при раскладке: заготовка (прямоугольник). */
	P.recBody = function (st, mat, rc) { return geom.placed(null, rc.a, rc.b, 0, rc.x, rc.y); };

	P.sheetStat = function (st, mat, sh) {
		var area = 0, gab = 0;
		for (var i = 0; i < sh.recs.length; i++) { var t = st.typeBy[sh.recs[i].t]; if (!t) continue; area += P.shapeFor(st, t, mat).area; gab += t.L * t.W; }
		return { n: sh.recs.length, area: area, gab: gab, fill: area / (sh.L * sh.W) * 100 };
	};

	/* Свободные прямоугольники листа (обрезки) — по габаритам деталей с отступом на рез. */
	P.offcuts = function (st, mat, sh, minSide) {
		var u = P.usable(st, sh), gap = P.gapOf(st, mat), UL = u.UL, UW = u.UW, xs = [0, UL], ys = [0, UW], box = [], i, j;
		for (i = 0; i < sh.recs.length; i++) {
			var r = sh.recs[i];
			var b = { x0: Math.max(0, r.x - gap), y0: Math.max(0, r.y - gap), x1: Math.min(UL, r.x + r.a + gap), y1: Math.min(UW, r.y + r.b + gap) };
			box.push(b); xs.push(b.x0, b.x1); ys.push(b.y0, b.y1);
		}
		function uniq(a) { a.sort(function (x, y) { return x - y; }); var o = []; for (var q = 0; q < a.length; q++) if (!o.length || a[q] - o[o.length - 1] > 0.01) o.push(a[q]); return o; }
		xs = uniq(xs); ys = uniq(ys);
		var nx = xs.length - 1, ny = ys.length - 1, free = [];
		for (j = 0; j < ny; j++) {
			free.push([]);
			var cy = (ys[j] + ys[j + 1]) / 2;
			for (i = 0; i < nx; i++) {
				var cx = (xs[i] + xs[i + 1]) / 2, busy = false;
				for (var q = 0; q < box.length && !busy; q++) busy = cx > box[q].x0 && cx < box[q].x1 && cy > box[q].y0 && cy < box[q].y1;
				free[j].push(!busy);
			}
		}
		var out = [];
		while (out.length < 60) {
			var best = null;
			for (var j0 = 0; j0 < ny; j0++) {
				var col = [];
				for (i = 0; i < nx; i++) col.push(true);
				for (var j1 = j0; j1 < ny; j1++) {
					var any = false;
					for (i = 0; i < nx; i++) { col[i] = col[i] && free[j1][i]; if (col[i]) any = true; }
					if (!any) break;
					var hh = ys[j1 + 1] - ys[j0], i0 = -1;
					for (i = 0; i <= nx; i++) {
						if (i < nx && col[i]) { if (i0 < 0) i0 = i; continue; }
						if (i0 < 0) continue;
						var ww = xs[i] - xs[i0];
						if (Math.min(ww, hh) >= minSide && (!best || ww * hh > best.a)) best = { a: ww * hh, x: xs[i0], y: ys[j0], w: ww, h: hh, i0: i0, i1: i, j0: j0, j1: j1 };
						i0 = -1;
					}
				}
			}
			if (!best) break;
			for (j = best.j0; j <= best.j1; j++) for (i = best.i0; i < best.i1; i++) free[j][i] = false;
			out.push({ x: best.x, y: best.y, w: best.w, h: best.h });
		}
		return out;
	};
	/* Деловые остатки листа: обрезки не меньше заданного размера. */
	P.goodOffcuts = function (st, mat, sh) {
		var c = st.work.params.cut, all = P.offcuts(st, mat, sh, Math.min(c.offW, c.offL)), out = [];
		for (var i = 0; i < all.length; i++) {
			var a = Math.max(all[i].w, all[i].h), b = Math.min(all[i].w, all[i].h);
			if (a >= c.offL && b >= c.offW) out.push(all[i]);
		}
		return out;
	};

	/* ------------------------------ ручные правки ----------------------------- */

	/* Номера записей листа, которые двигаются вместе с записью i (блок группы). */
	P.unitIdx = function (sh, i) {
		var u = sh.recs[i] && sh.recs[i].u;
		if (!u) return [i];
		var out = [];
		for (var j = 0; j < sh.recs.length; j++) if (sh.recs[j].u === u) out.push(j);
		return out;
	};

	/* Пересчитать резы листа по его деталям (после ручной правки или для блоков групп). */
	function fixSaw(st, mat, sh) {
		var u = P.usable(st, sh);
		if (!sh.recs.length) { sh.saw = 0; sh.rot = 0; sh.tree = null; sh.cuts = []; sh.setups = 0; sh.cutsN = 0; sh.bad = 0; return; }
		var a = cut.analyze(sh.recs, u.UL, u.UW, P.cutOpt(st));
		sh.bad = a.ok ? 0 : 1;
		if (a.ok) { sh.tree = a.tree; sh.cuts = a.cuts; sh.setups = a.setups; sh.cutsN = a.cutsN; sh.rot = a.rot; sh.saw = a.len + (st.work.params.margin > 0 ? sh.L + sh.W : 0); }
		else { sh.tree = null; sh.cuts = []; sh.setups = 0; sh.cutsN = 0; sh.rot = 0; sh.saw = 0; }
	}
	P.fixSaw = fixSaw;

	/* Разложить заново детали одного листа (все должны поместиться на него же). */
	function packOne(st, mat, sh, recs, extraOpt) {
		var u = P.usable(st, sh), units = unitsOfRecs(st, mat, recs, u.UL, u.UW), items = [], i, opt = P.cutOpt(st, { quality: 0, minKimRem: 0 });
		for (i = 0; i < units.length; i++) items.push(units[i].item);
		if (extraOpt) for (var k in extraOpt) if (extraOpt.hasOwnProperty(k)) opt[k] = extraOpt[k];
		var res = cut.nest(items, { L: 0, W: 0, rem: [{ L: sh.L, W: sh.W, n: 1 }] }, opt);
		if (res.unplaced.length || res.sheets.length !== 1) return null;
		return { sheet: sheetFromRes(st, units, res.sheets[0]) };
	}
	P.packOne = packOne;
	/* Принять раскладку одного листа (из packOne) в лист проекта. */
	function adopt(dst, one) { var n = one.sheet; dst.recs = n.recs; dst.rot = n.rot; dst.saw = n.saw; dst.tree = n.tree; dst.cuts = n.cuts; dst.setups = n.setups; dst.cutsN = n.cutsN; dst.bad = 0; }

	/* Перенести деталь (или блок группы) с листа si на лист ti (-1 — на новый лист).
	   Возвращает '' или причину, почему нельзя. */
	P.moveToSheet = function (st, key, si, i, ti) {
		var mat = st.matBy[key], lay = st.work.layout[key], src = lay.sheets[si];
		if (!src || !src.recs[i]) return 'деталь не найдена';
		if (ti === si) return '';
		var idx = P.unitIdx(src, i), moving = [], rest = [], j, f = P.fmtOf(mat);
		for (j = 0; j < src.recs.length; j++) (idx.indexOf(j) >= 0 ? moving : rest).push(src.recs[j]);
		var dst = ti >= 0 ? lay.sheets[ti] : { L: f.L, W: f.W, rem: 0, ri: -1, rot: 0, saw: 0, lock: 0, recs: [] };
		if (!dst) return 'лист не найден';
		var one = packOne(st, mat, dst, dst.recs.concat(moving));
		if (!one) return 'на этот лист деталь не помещается';
		adopt(dst, one); dst.lock = 1;
		src.recs = rest; src.lock = 1;
		fixSaw(st, mat, src);
		if (ti < 0) lay.sheets.push(dst);
		if (!rest.length) lay.sheets.splice(si, 1);
		return '';
	};

	/* Уложить на лист ti деталь из «не вошедших». */
	P.placeUnplaced = function (st, key, ui, ti) {
		var mat = st.matBy[key], lay = st.work.layout[key], it = lay.unplaced[ui], f = P.fmtOf(mat);
		if (!it) return 'деталь не найдена';
		var dst = ti >= 0 ? lay.sheets[ti] : { L: f.L, W: f.W, rem: 0, ri: -1, rot: 0, saw: 0, lock: 0, recs: [] };
		var one = packOne(st, mat, dst, dst.recs.concat([{ t: it.t, k: it.k }]));
		if (!one) return 'на этот лист деталь не помещается';
		adopt(dst, one); dst.lock = 1;
		if (ti < 0) lay.sheets.push(dst);
		lay.unplaced.splice(ui, 1);
		return '';
	};

	/* --------------------------------- буфер ---------------------------------- */
	/*  Буфер материала (layout.buf) — детали, которые пользователь снял с листов, чтобы
	    разложить самому. Программа их не раскладывает, пока её не попросят. Запись: { t, k }.
	    Пустой лист пользователя помечен keep: он не исчезает при пересчёте, пока закреплён. */
	P.bufOf = function (st, key) { var l = st.work.layout[key]; return (l && l.buf) ? l.buf : []; };

	/* Снять деталь (или блок группы) с листа в буфер. Лист остаётся, даже пустой. */
	P.toBuffer = function (st, key, si, i) {
		var mat = st.matBy[key], lay = st.work.layout[key], sh = lay && lay.sheets[si];
		if (!sh || !sh.recs[i]) return 'деталь не найдена';
		var idx = P.unitIdx(sh, i), rest = [], buf = lay.buf || (lay.buf = []);
		for (var j = 0; j < sh.recs.length; j++) { if (idx.indexOf(j) >= 0) buf.push({ t: sh.recs[j].t, k: sh.recs[j].k }); else rest.push(sh.recs[j]); }
		sh.recs = rest; sh.lock = 1; sh.keep = 1;
		fixSaw(st, mat, sh);
		return '';
	};
	/* Снять с листа все детали. Возвращает, сколько снято. */
	P.sheetToBuffer = function (st, key, si) {
		var mat = st.matBy[key], lay = st.work.layout[key], sh = lay && lay.sheets[si];
		if (!sh || !sh.recs.length) return 0;
		var buf = lay.buf || (lay.buf = []), n = sh.recs.length;
		for (var j = 0; j < n; j++) buf.push({ t: sh.recs[j].t, k: sh.recs[j].k });
		sh.recs = []; sh.lock = 1; sh.keep = 1; sh.rot = 0;
		fixSaw(st, mat, sh);
		return n;
	};
	/* Новый пустой лист обычного формата. Возвращает его номер или -1. */
	P.addBlankSheet = function (st, key) {
		var mat = st.matBy[key], lay = st.work.layout[key];
		if (!mat || !lay) return -1;
		var f = P.fmtOf(mat);
		lay.sheets.push({ L: f.L, W: f.W, rem: 0, ri: -1, rot: 0, saw: 0, lock: 1, keep: 1, recs: [] });
		return lay.sheets.length - 1;
	};
	/* Убрать пустой лист. */
	P.dropSheet = function (st, key, si) {
		var lay = st.work.layout[key], sh = lay && lay.sheets[si];
		if (!sh) return 'лист не найден';
		if (sh.recs.length) return 'на листе есть детали';
		lay.sheets.splice(si, 1);
		return '';
	};
	/* Запись детали из буфера, как она ляжет на лист: размеры с поворотом q и припуском; места ещё нет. */
	P.bufRec = function (st, mat, it, q) {
		var t = st.typeBy[it.t];
		if (!t) return null;
		var sp = P.shapeFor(st, t, mat), ba = baOf(st, sp.curve), qs = qsOf(P.grainOf(st, t, mat));
		if (q === undefined || q === null || qs.indexOf(q) < 0) q = qs[0];
		var cl = cellOf(st, t, q, ba);
		return { t: it.t, k: it.k, x: 0, y: 0, a: cl.a, b: cl.b, q: q, ba: ba };
	};
	/* Положить детали без места на лист ti (-1 — новый): лист перекладывается вместе с ними. */
	function addToSheet(st, mat, lay, items, ti) {
		var f = P.fmtOf(mat);
		var dst = ti >= 0 ? lay.sheets[ti] : { L: f.L, W: f.W, rem: 0, ri: -1, rot: 0, saw: 0, lock: 0, recs: [] };
		if (!dst) return 'лист не найден';
		var one = packOne(st, mat, dst, dst.recs.concat(items));
		if (!one) return 'на этот лист деталь не помещается';
		adopt(dst, one); dst.lock = 1;
		if (ti < 0) lay.sheets.push(dst);
		return '';
	}
	/* Деталь из буфера — на лист ti (-1 — новый лист), место выбирает программа. */
	P.fromBuffer = function (st, key, bi, ti) {
		var mat = st.matBy[key], lay = st.work.layout[key], it = lay && lay.buf && lay.buf[bi];
		if (!it) return 'деталь не найдена';
		var why = addToSheet(st, mat, lay, [{ t: it.t, k: it.k }], ti);
		if (!why) lay.buf.splice(bi, 1);
		return why;
	};
	/* «Разложить буфер»: сначала по нынешним листам (лист перекладывается вместе с деталью), остальное — на новые листы.
	   Возвращает { placed, sheets, left }. */
	P.placeBuffer = function (st, key) {
		var mat = st.matBy[key], lay = st.work.layout[key], res = { placed: 0, sheets: 0, left: 0 };
		if (!lay || !lay.buf || !lay.buf.length) return res;
		var items = lay.buf.slice(0), i, ti, f = P.fmtOf(mat), p = st.work.params;
		function area(it) { var t = st.typeBy[it.t]; return t ? t.L * t.W : 0; }
		items.sort(function (a, b) { return area(b) - area(a); });
		for (i = 0; i < items.length; i++) {
			if (!st.typeBy[items[i].t]) continue;
			for (ti = 0; ti < lay.sheets.length; ti++) {
				if (addToSheet(st, mat, lay, [items[i]], ti)) continue;
				lay.buf.splice(lay.buf.indexOf(items[i]), 1); res.placed++;
				break;
			}
		}
		var rest = lay.buf.filter(function (it) { return !!st.typeBy[it.t]; });
		if (rest.length) {
			var UL = f.L - 2 * p.margin, UW = f.W - 2 * p.margin, units = unitsFrom(st, mat, rest, UL, UW, null), its = [], done = {}, j;
			for (i = 0; i < units.length; i++) its.push(units[i].item);
			var out = cut.nest(its, { L: f.L, W: f.W, rem: [] }, P.cutOpt(st, { quality: 0 }));
			for (i = 0; i < out.sheets.length; i++) {
				var ns = sheetFromRes(st, units, out.sheets[i]);
				for (j = 0; j < ns.recs.length; j++) done[ns.recs[j].t + '#' + ns.recs[j].k] = 1;
				lay.sheets.push(ns);
				res.sheets++; res.placed += ns.recs.length;
			}
			lay.buf = lay.buf.filter(function (it) { return !done[it.t + '#' + it.k]; });
		}
		res.left = lay.buf.length;
		if (!lay.buf.length) delete lay.buf;
		return res;
	};
	/* Материалы, у которых в буфере лежат детали: [{ mat, n }]. */
	P.bufMats = function (st) {
		var out = [];
		for (var i = 0; i < st.mats.length; i++) { var n = st.mats[i].cfg.on ? P.bufOf(st, st.mats[i].key).length : 0; if (n) out.push({ mat: st.mats[i], n: n }); }
		return out;
	};
	/* Состояние для вывода документов: пустые листы пользователя в документы не попадают. */
	P.forOutput = function (st) {
		var o = {}, k, q;
		for (k in st) if (st.hasOwnProperty(k)) o[k] = st[k];
		o.work = {};
		for (k in st.work) if (st.work.hasOwnProperty(k)) o.work[k] = st.work[k];
		o.work.layout = {};
		for (k in st.work.layout) if (st.work.layout.hasOwnProperty(k)) {
			var l = st.work.layout[k], c = {};
			for (q in l) if (l.hasOwnProperty(q)) c[q] = l[q];
			c.sheets = l.sheets.filter(function (s) { return s.recs.length > 0; });
			o.work.layout[k] = c;
		}
		return o;
	};

	/* «Другой вариант»: переложить лист иначе. n — номер варианта (по кругу).
	   Возвращает '' или причину; в info.count — сколько вариантов нашлось. */
	P.repackSheet = function (st, key, si, n, info) {
		var mat = st.matBy[key], lay = st.work.layout[key], sh = lay.sheets[si];
		if (!sh) return 'лист не найден';
		var u = P.usable(st, sh), units = unitsOfRecs(st, mat, sh.recs, u.UL, u.UW), items = [], i;
		for (i = 0; i < units.length; i++) items.push(units[i].item);
		var vars = cut.variants(items, { L: sh.L, W: sh.W }, P.cutOpt(st, { quality: 0, timeMs: 2500 }));
		if (info) info.count = vars.length;
		if (!vars.length) return 'переложить не получилось';
		if (vars.length < 2) return 'другого варианта для этого листа нет';
		var v = vars[((n | 0) % vars.length + vars.length) % vars.length];
		adopt(sh, { sheet: sheetFromRes(st, units, v) });
		return '';
	};

	/* Самопроверка раскладки: границы листа, зазоры, размеры, повторы. Возвращает список
	   нарушений (пустой — всё в порядке). */
	P.verify = function (st, key) {
		var mat = st.matBy[key], lay = st.work.layout[key], out = [], seen = {}, i, j, s;
		if (!lay) return out;
		var gap = P.gapOf(st, mat);
		for (s = 0; s < lay.sheets.length; s++) {
			var sh = lay.sheets[s], u = P.usable(st, sh), polys = [];
			if (!sh.recs.length && !(sh.lock && sh.keep)) out.push('лист ' + (s + 1) + ': пустой');
			for (i = 0; i < sh.recs.length; i++) {
				var rc = sh.recs[i], t = st.typeBy[rc.t];
				if (!t) { out.push('лист ' + (s + 1) + ': неизвестная деталь'); polys.push(null); continue; }
				var id = rc.t + '#' + rc.k;
				if (seen[id]) out.push('лист ' + (s + 1) + ': деталь ' + t.name + ' уложена дважды');
				seen[id] = 1;
				var sp = P.shapeFor(st, t, mat), ba = baOf(st, sp.curve);
				var cl = cellOf(st, t, rc.q, ba), a = cl.a, b = cl.b, qs = qsOf(P.grainOf(st, t, mat));
				if (Math.abs(rc.a - a) > 0.05 || Math.abs(rc.b - b) > 0.05 || (rc.ba || 0) !== ba) out.push('лист ' + (s + 1) + ': размер детали ' + t.name);
				if (qs.indexOf(rc.q) < 0 && !(!sp.pts && qs.indexOf((rc.q + 2) & 3) >= 0)) out.push('лист ' + (s + 1) + ': деталь ' + t.name + ' повёрнута против текстуры');
				if (rc.x < -0.01 || rc.y < -0.01 || rc.x + rc.a > u.UL + 0.01 || rc.y + rc.b > u.UW + 0.01) out.push('лист ' + (s + 1) + ': деталь ' + t.name + ' за краем листа');
				polys.push(1);
			}
			for (i = 0; i < sh.recs.length; i++) for (j = i + 1; j < sh.recs.length; j++) {
				var p = sh.recs[i], q = sh.recs[j];
				if (!polys[i] || !polys[j] || !st.typeBy[p.t] || !st.typeBy[q.t]) continue;
				if (p.x + p.a + gap <= q.x + 0.06 || q.x + q.a + gap <= p.x + 0.06 || p.y + p.b + gap <= q.y + 0.06 || q.y + q.b + gap <= p.y + 0.06) continue;
				var gx = Math.max(q.x - (p.x + p.a), p.x - (q.x + q.a)), gy = Math.max(q.y - (p.y + p.b), p.y - (q.y + q.b));
				out.push('лист ' + (s + 1) + ': зазор ' + Math.max(0, Math.max(gx, gy)).toFixed(2) + ' мм между «' + st.typeBy[p.t].name + '» и «' + st.typeBy[q.t].name + '»');
			}
		}
		var all = P.instances(st, mat), un = {};
		for (i = 0; i < lay.unplaced.length; i++) un[lay.unplaced[i].t + '#' + lay.unplaced[i].k] = 1;
		for (i = 0; lay.buf && i < lay.buf.length; i++) {
			var bk = lay.buf[i].t + '#' + lay.buf[i].k;
			if (seen[bk] || un[bk]) out.push('буфер: деталь ' + (st.typeBy[lay.buf[i].t] ? st.typeBy[lay.buf[i].t].name : '?') + ' есть и на листе');
			un[bk] = 1;
		}
		for (i = 0; i < all.length; i++) if (!seen[all[i].t + '#' + all[i].k] && !un[all[i].t + '#' + all[i].k]) { out.push('деталь ' + st.typeBy[all[i].t].name + ' потеряна'); break; }
		return out;
	};

	/* Листы режутся сквозными резами, поворотов не больше заданного — проверка после раскладки программой.
	   Листы, переложенные вручную (закреплённые), этим правилом не проверяются. */
	P.verifyCut = function (st, key) {
		var mat = st.matBy[key], lay = st.work.layout[key], out = [];
		if (!lay || !mat) return out;
		var o = P.cutOpt(st);
		lay.sheets.forEach(function (sh, s) {
			if (sh.lock || !sh.recs.length) return;
			var u = P.usable(st, sh), a = cut.analyze(sh.recs, u.UL, u.UW, o);
			if (!a.ok) out.push('лист ' + (s + 1) + ': не режется сквозными резами');
			else if (a.rot > o.maxRot) out.push('лист ' + (s + 1) + ': поворотов ' + a.rot + ' больше допустимых ' + o.maxRot);
		});
		return out;
	};

	/* ------------------------- изменения модели ------------------------------- */

	/* Что изменилось в модели по сравнению с прежней выгрузкой. */
	P.diff = function (prev, cur, scope) {
		function tally(model) {
			var rt = P.readTypes(model, null), m = {};
			for (var i = 0; i < rt.types.length; i++) m[rt.types[i].sig] = rt.types[i];
			return m;
		}
		prev = P.viewModel(prev, P.diffSet); cur = P.viewModel(cur, P.diffSet);
		var a = tally(prev), b = tally(cur), out = { added: [], removed: [], changed: [], same: 0 }, k;
		function n(t) { return scope === 'sel' ? t.cntSel : t.cnt; }
		function row(t, was, now) { return { name: t.name, pos: t.pos, des: t.des, L: t.L, W: t.W, mat: t.matName, was: was, now: now }; }
		for (k in b) if (b.hasOwnProperty(k)) {
			if (!a[k]) { if (n(b[k])) out.added.push(row(b[k], 0, n(b[k]))); }
			else if (n(a[k]) !== n(b[k])) out.changed.push(row(b[k], n(a[k]), n(b[k])));
			else out.same += n(b[k]);
		}
		for (k in a) if (a.hasOwnProperty(k) && !b[k] && n(a[k])) out.removed.push(row(a[k], n(a[k]), 0));
		var srt = function (x, y) { return P.natCmp(x.des, y.des) || P.natCmp(x.pos, y.pos); };
		out.added.sort(srt); out.removed.sort(srt); out.changed.sort(srt);
		out.any = out.added.length + out.removed.length + out.changed.length > 0;
		return out;
	};

	/* --------------------------------- сводка --------------------------------- */

	P.summary = function (st) {
		var out = { mats: [], sheets: 0, placed: 0, unplaced: 0, buf: 0, noPos: 0, off: [], total: 0, cycles: 0, cost: 0, offArea: 0, boughtArea: 0, partsArea: 0 }, i, j;
		for (i = 0; i < st.mats.length; i++) {
			var m = st.mats[i], lay = st.work.layout[m.key], n = 0, area = 0, gab = 0, k;
			for (j = 0; j < m.types.length; j++) {
				var c = P.count(st, m.types[j]);
				n += c; area += P.shapeFor(st, m.types[j], m).area * c; gab += m.types[j].L * m.types[j].W * c;
				if (c && m.cfg.on && (!m.types[j].pos || !m.types[j].des)) out.noPos += c;
			}
			if (!n) continue;
			var row = { mat: m, n: n, area: area, gab: gab, on: m.cfg.on ? 1 : 0, sheets: 0, std: 0, rem: 0, bought: 0, saw: 0, rot: 0, turned: 0, placed: 0, unplaced: 0, buf: 0, blank: 0, fill: 0, stale: P.isStale(st, m), lock: 0 };
			if (m.cfg.on && lay) {
				for (j = 0; j < lay.sheets.length; j++) {
					var sh = lay.sheets[j];
					if (!sh.recs.length) { row.blank++; continue; }      /* пустой лист пользователя в счёт не идёт */
					row.sheets++; if (sh.rem) row.rem++; else row.std++;
					row.bought += sh.L * sh.W; row.saw += sh.saw || 0; row.rot += sh.rot || 0; row.placed += sh.recs.length;
					if (sh.lock) row.lock++;
					for (k = 0; k < sh.recs.length; k++) if (sh.recs[k].q) row.turned++;
				}
				row.unplaced = lay.unplaced.length;
				row.buf = lay.buf ? lay.buf.length : 0;
				row.fill = row.bought ? area / row.bought * 100 : 0;
			}
			/* циклы реза: одинаковые карты режутся пакетом по cut.pkg плит */
			var cc0 = (st.work.params.cut || {}), pk = Math.max(1, cc0.pkg || 1), cardN = {};
			if (m.cfg.on && lay) for (j = 0; j < lay.sheets.length; j++) { var s3 = lay.sheets[j]; if (!s3.recs.length) continue; var ck = s3.card === undefined ? 'k' + j : s3.card; cardN[ck] = (cardN[ck] || 0) + 1; }
			row.cycles = 0; for (var ck2 in cardN) if (cardN.hasOwnProperty(ck2)) row.cycles += Math.ceil(cardN[ck2] / pk);
			row.cost = (cc0.price > 0 ? row.bought / 1e6 * cc0.price : 0);
			row.offArea = 0;
			if (m.cfg.on && lay) for (j = 0; j < lay.sheets.length; j++) { var go = lay.sheets[j].recs.length ? P.goodOffcuts(st, m, lay.sheets[j]) : []; for (k = 0; k < go.length; k++) row.offArea += go[k].w * go[k].h; }
			out.cycles += row.cycles; out.cost += row.cost; out.offArea += row.offArea; out.boughtArea += row.bought; out.partsArea += (m.cfg.on && lay ? area : 0);
			out.mats.push(row);
			out.total += n;
			if (m.cfg.on) { out.sheets += row.sheets; out.placed += row.placed; out.unplaced += row.unplaced; out.buf += row.buf; }
		}
		return out;
	};

	/* Строки таблицы деталей листа: одинаковые записи склеены. */
	P.sheetRows = function (st, mat, sh) {
		var map = {}, list = [];
		for (var i = 0; i < sh.recs.length; i++) {
			var rc = sh.recs[i], t = st.typeBy[rc.t];
			if (!t) continue;
			var key = rc.t + '|' + (rc.ba || 0);
			if (!map[key]) { map[key] = { t: t, n: 0, ba: rc.ba || 0, idx: [] }; list.push(map[key]); }
			map[key].n++; map[key].idx.push(i);
		}
		list.sort(function (a, b) { return P.natCmp(a.t.des, b.t.des) || P.natCmp(a.t.pos, b.t.pos) || (b.t.L - a.t.L) || (b.t.W - a.t.W); });
		return list;
	};

	/* Сколько сторон закромлено: len — по длине, wid — по ширине (0, 1, 2). */
	P.edgeCount = function (sh) { return { len: (sh.sides.T ? 1 : 0) + (sh.sides.B ? 1 : 0), wid: (sh.sides.L ? 1 : 0) + (sh.sides.R ? 1 : 0) }; };

	P._int = { buildBlock: buildBlock, expand: expand, unitsFrom: unitsFrom, cleanSheet: cleanSheet };
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));
