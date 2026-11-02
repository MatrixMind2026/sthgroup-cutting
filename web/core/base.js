/* STHGroup — раздел «База»: поставщики, классы (как в базе материалов БАЗИСа), материалы и фурнитура
   с привязкой к классам и поставщику, текстуры из папки. Хранится на компьютере в base.json рядом с
   настройками, общий для всех проектов.

   base = { v: 1,
            sup:    [{ id, name, url, phone, email, person, addr, note, logo }],        логотип — data:image/…
            groups: [{ code, name, role, classes: [{ code, name, sup? }] }],          role: 'kind' | 'sup' | ''
            mats:   { название: { name, art, kind, cls: { код группы: [коды классов] }, sup, url, img, tex, bz } },
            (bz — из базы материалов БАЗИСа (.dbf): { f файл, grp папка, unit, coef, L, W, T, tape, btex, sx, sy, dx, dy,
             ang, mir, tr, sh, br, str, col } — см. B.bzPlan)
            (классов в группе сколько угодно; первый — основной ★: по нему раздел сметы и поставщик;
            в прежних файлах — один код строкой, он читается как список из одного)
            tex:    { dir } }
   Поставщик материала: свой (mats[...].sup), иначе — по классу из группы с ролью «поставщик» (у класса
   может быть указан поставщик; если нет — поставщик с тем же названием, без номера «02. »). */
(function (G) {
	'use strict';
	var BM = G.BM = G.BM || {};
	var B = BM.base = {};

	function trim(s) { return String(s === null || s === undefined ? '' : s).replace(/^\s+|\s+$/g, ''); }
	function low(s) { return trim(s).toLowerCase(); }
	function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
	/* «02. Blum» → «blum»: номер в начале названия класса не мешает найти поставщика */
	function bare(s) { return low(s).replace(/^\d+[.)]\s*/, '').replace(/\s+/g, ' '); }
	B.bare = bare;

	B.SUP_FIELDS = [['name', 'Название'], ['url', 'Сайт'], ['phone', 'Телефон'], ['email', 'E-mail'], ['person', 'Контактное лицо'], ['addr', 'Адрес склада'], ['note', 'Примечание']];

	/* Классы автора (его база материалов БАЗИСа, снимки от 12.10.2026): ставятся в новую «Базу», дальше правятся. */
	function list(p, names) { return names.map(function (n, i) { return { code: p + (i + 1), name: n }; }); }
	B.PRESET = [
		{ code: 'GM1', name: 'Общие', role: '', classes: [{ code: 'M0', name: 'Общий' }] },
		{ code: 'GV2', name: '01. Вид материала', role: 'kind', classes: list('V', ['01. Плитные ЛДСП', '02. Плитные МДФ', '03. Фанера и массив', '04. Кромка', '05. Столешницы и стеновые панели', '06. Фасады', '07. Стекло и зеркала', '08. Погонаж и профиль', '09. Фурнитура', '10. Крепёж и метизы', '11. Освещение и электрика', '12. Расходники и химия']) },
		{ code: 'GP3', name: '02. Поставщик', role: 'sup', classes: list('P', ['01. МДМ', '02. Blum', '03. Hettich', '04. GTV', '05. Boyard', '06. Firmax', '07. ТВМ', '08. Ставрос', '09. Макро', '10. TD Server']) },
		{ code: 'GD4', name: '03. Состояние', role: '', classes: list('D', ['01. Актуальные', '02. Распродажа', '03. Под заказ', '04. Снято с производства']) },
		{ code: 'GF5', name: '04. Отделка', role: '', classes: list('F', ['01. Плёнка ПВХ', '02. Плёнка ПЭТ', '03. Эмаль', '04. Супермат и софт-тач', '05. Пластик HPL', '06. Акрил', '07. Шпон', '08. Лак и масло', '09. Фотопечать и УФ-печать']) },
		{ code: 'GU6', name: '05. Услуги и операции', role: '', classes: list('U', ['01. Обработка стекла', '02. Покраска и патинирование', '03. Оклейка плёнкой', '04. Присадка и фрезеровка ЧПУ', '05. Раскрой', '06. Кромление', '07. Замер и монтаж', '08. Доставка и подъём']) }
	];
	/* Новая «База»: классы автора и поставщики из группы «02. Поставщик». */
	B.fresh = function () {
		var b = B.fix({ groups: JSON.parse(JSON.stringify(B.PRESET)) });
		B.group(b, 'GP3').classes.forEach(function (c) { var s = B.ensureSup(b, c.name.replace(/^\d+[.)]\s*/, '')); c.sup = s.id; });
		return b;
	};

	B.empty = function () { return { v: 1, sup: [], groups: [], mats: {}, tex: { dir: '' } }; };

	/* Привести прочитанный файл в порядок: лишнее и испорченное выбрасывается, недостающее дополняется. */
	B.fix = function (o) {
		var d = B.empty(), i, k;
		if (!o || typeof o !== 'object') return d;
		var seen = {};
		(Array.isArray(o.sup) ? o.sup : []).forEach(function (s) {
			if (!s || !trim(s.name)) return;
			var x = { id: trim(s.id) || B.newId('s'), name: trim(s.name) };
			B.SUP_FIELDS.forEach(function (f) { if (f[0] !== 'name' && trim(s[f[0]])) x[f[0]] = trim(s[f[0]]); });
			if (typeof s.logo === 'string' && s.logo.indexOf('data:image/') === 0) x.logo = s.logo;
			if (seen[x.id]) x.id = B.newId('s');
			seen[x.id] = 1;
			d.sup.push(x);
		});
		(Array.isArray(o.groups) ? o.groups : []).forEach(function (g) {
			if (!g || !trim(g.code)) return;
			var x = { code: trim(g.code), name: trim(g.name) || trim(g.code), role: (g.role === 'kind' || g.role === 'sup') ? g.role : '', classes: [] };
			(Array.isArray(g.classes) ? g.classes : []).forEach(function (c) {
				if (!c || !trim(c.code)) return;
				var y = { code: trim(c.code), name: trim(c.name) || trim(c.code) };
				if (trim(c.sup)) y.sup = trim(c.sup);
				x.classes.push(y);
			});
			d.groups.push(x);
		});
		if (o.mats && typeof o.mats === 'object') for (k in o.mats) {
			if (!has(o.mats, k) || !o.mats[k] || typeof o.mats[k] !== 'object') continue;
			var m = o.mats[k], y2 = { name: trim(m.name) || k, art: trim(m.art), kind: trim(m.kind), cls: {} };
			if (m.cls && typeof m.cls === 'object') for (i in m.cls) if (has(m.cls, i)) { var cl = B.clsOf(m, i); if (cl.length) y2.cls[i] = cl; }
			['sup', 'url', 'tex'].forEach(function (f) { if (trim(m[f])) y2[f] = trim(m[f]); });
			if (typeof m.img === 'string' && m.img.indexOf('data:image/') === 0) y2.img = m.img;
			if (m.bz && typeof m.bz === 'object') { var bz = B.bzClean(m.bz); if (bz) y2.bz = bz; }
			d.mats[k] = y2;
		}
		if (o.tex && typeof o.tex === 'object') d.tex.dir = trim(o.tex.dir);
		return d;
	};
	var idN = 0;
	B.newId = function (p) { return (p || 'x') + Date.now().toString(36) + (idN++).toString(36) + Math.floor(Math.random() * 1e4).toString(36); };

	/* ------------------------------- поставщики -------------------------------- */
	B.supById = function (base, id) { for (var i = 0; i < base.sup.length; i++) if (base.sup[i].id === id) return base.sup[i]; return null; };
	B.supByName = function (base, name) { var n = bare(name); if (!n) return null; for (var i = 0; i < base.sup.length; i++) if (bare(base.sup[i].name) === n) return base.sup[i]; return null; };
	/* Найти поставщика по названию или завести нового (так поставщик, вписанный в смете, попадает в «Базу»). */
	B.ensureSup = function (base, name, extra) {
		name = trim(name);
		if (!name) return null;
		var s = B.supByName(base, name);
		if (!s) { s = { id: B.newId('s'), name: name }; base.sup.push(s); }
		if (extra) B.SUP_FIELDS.forEach(function (f) { if (f[0] !== 'name' && trim(extra[f[0]]) && !s[f[0]]) s[f[0]] = trim(extra[f[0]]); });
		return s;
	};
	B.dropSup = function (base, id) {
		base.sup = base.sup.filter(function (s) { return s.id !== id; });
		for (var k in base.mats) if (has(base.mats, k) && base.mats[k].sup === id) delete base.mats[k].sup;
		base.groups.forEach(function (g) { g.classes.forEach(function (c) { if (c.sup === id) delete c.sup; }); });
	};

	/* --------------------------------- классы ---------------------------------- */
	B.group = function (base, code) { for (var i = 0; i < base.groups.length; i++) if (base.groups[i].code === code) return base.groups[i]; return null; };
	B.cls = function (base, gcode, ccode) { var g = B.group(base, gcode); if (!g) return null; for (var i = 0; i < g.classes.length; i++) if (g.classes[i].code === ccode) return g.classes[i]; return null; };
	/* Роль группы по названию, если не задана: «… Поставщик …» — поставщики, «… Вид материала …» — вид. */
	B.roleOf = function (g) { if (g.role) return g.role; var n = low(g.name); return /поставщик/.test(n) ? 'sup' : (/вид материала|вид/.test(n) ? 'kind' : ''); };
	B.groupBy = function (base, role) { for (var i = 0; i < base.groups.length; i++) if (B.roleOf(base.groups[i]) === role) return base.groups[i]; return null; };

	/* --------------------------- классы материала --------------------------------- */
	/* Классы материала в группе: список кодов (первый — основной). Строка из прежних файлов — список из одного. */
	B.clsOf = function (m, gcode) {
		var v = m && m.cls ? m.cls[gcode] : null, out = [];
		(Array.isArray(v) ? v : (v ? [v] : [])).forEach(function (c) { c = trim(c); if (c && out.indexOf(c) < 0) out.push(c); });
		return out;
	};
	B.mainCls = function (m, gcode) { return B.clsOf(m, gcode)[0] || ''; };
	B.hasCls = function (m, gcode, ccode) { return B.clsOf(m, gcode).indexOf(ccode) >= 0; };
	function setList(m, gcode, l) { if (l.length) m.cls[gcode] = l; else delete m.cls[gcode]; }
	B.addCls = function (m, gcode, ccode) { var l = B.clsOf(m, gcode); if (l.indexOf(ccode) < 0) l.push(ccode); setList(m, gcode, l); };
	B.delCls = function (m, gcode, ccode) { setList(m, gcode, B.clsOf(m, gcode).filter(function (c) { return c !== ccode; })); };
	B.setMain = function (m, gcode, ccode) { var l = B.clsOf(m, gcode).filter(function (c) { return c !== ccode; }); l.unshift(ccode); setList(m, gcode, l); };
	/* класс удалён из группы — снять его у всех материалов */
	B.dropCls = function (base, gcode, ccode) { for (var k in base.mats) if (has(base.mats, k)) B.delCls(base.mats[k], gcode, ccode); };

	/* ------------------------------- материалы --------------------------------- */
	/* Запомнить материал или фурнитуру из проекта (название — ключ, как у цен в прайсе). */
	B.learn = function (base, name, art, kind) {
		name = trim(name);
		if (!name) return null;
		var m = base.mats[name];
		if (!m) m = base.mats[name] = { name: name, art: trim(art), kind: trim(kind), cls: {} };
		else { if (!m.art && trim(art)) m.art = trim(art); if (!m.kind && trim(kind)) m.kind = trim(kind); }
		return m;
	};
	/* Поставщик материала: свой; иначе — по классу группы «Поставщик». Возвращает { sup, how: 'own'|'class'|'' }. */
	B.supOfMat = function (base, name) {
		var m = base.mats[trim(name)];
		if (!m) return { sup: null, how: '' };
		if (m.sup) { var s = B.supById(base, m.sup); if (s) return { sup: s, how: 'own' }; }
		var g = B.groupBy(base, 'sup');
		if (g && B.mainCls(m, g.code)) {
			var c = B.cls(base, g.code, B.mainCls(m, g.code));
			if (c) { var s2 = (c.sup && B.supById(base, c.sup)) || B.supByName(base, c.name); if (s2) return { sup: s2, how: 'class' }; return { sup: { id: '', name: c.name.replace(/^\d+[.)]\s*/, '') }, how: 'class' }; }
		}
		return { sup: null, how: '' };
	};
	/* Вид материала (для разделов сметы): название класса из группы «Вид материала» или ''. */
	B.kindOfMat = function (base, name) {
		var m = base.mats[trim(name)], g = B.groupBy(base, 'kind');
		if (!m || !g || !B.mainCls(m, g.code)) return '';
		var c = B.cls(base, g.code, B.mainCls(m, g.code));
		return c ? c.name : '';
	};

	/* --------------------------------- кромка ---------------------------------- */
	/* Толщина и ширина кромки: из артикула («H3700 ST10-0,8x19»), иначе из названия («0,8x19 мм»). */
	var SIZE = /(\d+(?:[.,]\d+)?)\s*[xх×*]\s*(\d+(?:[.,]\d+)?)/i;
	B.edgeSize = function (art, name) {
		var src = [String(art || ''), String(name || '')];
		for (var i = 0; i < src.length; i++) {
			var s = src[i], tail = /-\s*(\d+(?:[.,]\d+)?\s*[xх×*]\s*\d+(?:[.,]\d+)?)\s*$/i.exec(s), m = SIZE.exec(tail ? tail[1] : s);
			if (!m) continue;
			var a = Number(m[1].replace(',', '.')), b = Number(m[2].replace(',', '.'));
			if (a > 0 && b > 0) return { th: Math.min(a, b), w: Math.max(a, b), from: i ? 'name' : 'art' };
		}
		return null;
	};
	/* Артикул декора у кромки: «H3700 ST10-0,8x19» → «H3700 ST10» (текстура та же, что у плиты). */
	B.decorArt = function (art) { return trim(String(art || '').replace(/\s*-\s*\d+(?:[.,]\d+)?\s*[xх×*]\s*\d+(?:[.,]\d+)?\s*$/i, '')); };

	/* -------------------------------- текстуры --------------------------------- */
	B.TEX_EXT = ['jpg', 'jpeg', 'png', 'bmp', 'gif', 'webp', 'tif', 'tiff'];
	function stem(p) { var b = String(p).replace(/^.*[\\\/]/, ''); return b.replace(/\.[^.]+$/, ''); }
	function norm(s) { return low(s).replace(/[\s_]+/g, ' ').replace(/[«»"']/g, ''); }
	/* Варианты имени файла для материала: артикул (у кромки — без размера), затем название. */
	/* Как названы файлы у автора: Egger — один код декора («H1180» при артикуле «H1180 ST37»), Kronospan —
	   название и код («Артвуд Светлый K083 SN»). Поэтому кроме артикула пробуем его первое слово и куски
	   названия между запятыми («ЛДСП 16 мм, Артвуд Светлый, K083 SN, Kronospan»). */
	B.texNames = function (name, art) {
		var out = [], a = trim(art), d = B.decorArt(a), first = d.split(/\s+/)[0];
		function add(x) { x = trim(x); if (x && /[0-9A-Za-zА-Яа-я]/.test(x) && !/^нет$/i.test(x) && out.indexOf(x) < 0) out.push(x); }
		[a, d, first, trim(name)].forEach(add);
		String(name || '').split(/\s*,\s*/).forEach(function (p) { if (!/^\d+([.,]\d+)?\s*мм$/i.test(p) && !/^(лдсп|мдф|хдф|двп|кромка|egger|kronospan)\b/i.test(p)) add(p.replace(/[«»"]/g, '')); });
		return out;
	};
	/* Код декора в названии файла — отдельным словом: «K083» в «Артвуд Светлый K083 SN». */
	function hasWord(stemN, code) { var i = stemN.indexOf(code); if (i < 0) return false; var a = stemN.charAt(i - 1), b = stemN.charAt(i + code.length); return (!a || /[\s\-_.]/.test(a)) && (!b || /[\s\-_.]/.test(b)); }
	/* Найти файл текстуры среди файлов папки (полные пути): сначала точное имя, потом имя, начинающееся с артикула. */
	B.findTex = function (files, name, art) {
		var cands = B.texNames(name, art), byStem = {}, i, j;
		for (i = 0; i < files.length; i++) {
			var ext = String(files[i]).split('.').pop().toLowerCase();
			if (B.TEX_EXT.indexOf(ext) < 0) continue;
			var k = norm(stem(files[i]));
			if (!has(byStem, k)) byStem[k] = files[i];
		}
		for (j = 0; j < cands.length; j++) { var c = norm(cands[j]); if (has(byStem, c)) return { path: byStem[c], by: j === cands.length - 1 && cands[j] === trim(name) ? 'name' : 'art' }; }
		/* код с цифрами (артикул или его первое слово, «K083», «0881») — отдельным словом в имени файла */
		var codes = [], a0 = B.decorArt(art);
		[a0].concat(a0.split(/\s+/)).forEach(function (x) { x = norm(x); if (x.length >= 3 && /\d/.test(x) && codes.indexOf(x) < 0) codes.push(x); });
		String(name || '').split(/[\s,]+/).forEach(function (x) { x = norm(x).replace(/[«»"]/g, ''); if (x.length >= 3 && /\d/.test(x) && /[a-zа-я]/.test(x) && codes.indexOf(x) < 0) codes.push(x); });
		for (j = 0; j < codes.length; j++) for (var k2 in byStem) if (has(byStem, k2) && hasWord(k2, codes[j])) return { path: byStem[k2], by: 'art' };
		return null;
	};
	/* Текстура материала: указанная вручную или найденная в папке. */
	B.texOf = function (base, files, name, art) {
		var m = base.mats[trim(name)];
		if (m && m.tex) return { path: m.tex, by: 'own' };
		/* путь из базы БАЗИСа («egger\\H3700.jpg») — в папке текстур, если она указана на папку текстур БАЗИСа */
		if (m && m.bz && m.bz.btex && files && files.length) {
			var rel = '/' + m.bz.btex.replace(/[\\\/]+/g, '/').toLowerCase().replace(/^\//, '');
			for (var i = 0; i < files.length; i++) { var fp = String(files[i]).replace(/[\\\/]+/g, '/').toLowerCase(); if (fp.length >= rel.length && fp.substring(fp.length - rel.length) === rel) return { path: files[i], by: 'bazis' }; }
		}
		return B.findTex(files || [], name, art || (m && m.art));
	};

	/* ------------------------- связь со сметой и документами ------------------------- */
	/* Открытая «База» (окно ставит её сюда при запуске; в проверках под Node её нет — смета работает по-старому). */
	B.cur = null;
	/* Картинка текстуры материала для фото в смете и документах: data:… или '' (окно подставляет свою). */
	B.thumb = null;
	/* Поставщик, ссылка и фото материала из «Базы»: { shop, url, img, how, supId, tex }; пусто — нет записи. */
	B.infoOf = function (base, name) {
		var o = { shop: '', url: '', img: '', how: '', supId: '', tex: 0 };
		if (!base) return o;
		var r = B.supOfMat(base, name), m = base.mats[trim(name)];
		if (r.sup) { o.shop = r.sup.name; o.how = r.how; o.supId = r.sup.id || ''; }
		if (m) { o.url = m.url || ''; o.img = m.img || ''; }
		return o;
	};
	/* Записать поставщика, ссылку и фото материала (из окна строки сметы). Пустое название — поставщик снимается. */
	B.setMat = function (base, name, rec) {
		var m = B.learn(base, name, rec && rec.art, rec && rec.kind);
		if (!m) return null;
		var s = trim(rec.shop) ? B.ensureSup(base, rec.shop) : null;
		if (s) m.sup = s.id; else delete m.sup;
		var url = trim(rec.url);
		if (url && !/^https?:\/\//i.test(url)) url = 'https://' + url;
		if (url) m.url = url; else delete m.url;
		if (typeof rec.img === 'string' && rec.img.indexOf('data:image/') === 0) m.img = rec.img; else delete m.img;
		return m;
	};
	/* Перенести поставщиков из прежней базы цен (prices.json → sup: { название: { shop, url, img } }). */
	B.migrateSup = function (base, sup) {
		var n = 0;
		if (!sup || typeof sup !== 'object') return 0;
		for (var k in sup) {
			if (!has(sup, k) || !sup[k] || typeof sup[k] !== 'object') continue;
			var r = sup[k], m = B.learn(base, k, '', '');
			if (!m) continue;
			if (trim(r.shop) && !m.sup) { var s = B.ensureSup(base, r.shop); if (s) m.sup = s.id; }
			if (trim(r.url) && !m.url) m.url = trim(r.url);
			if (typeof r.img === 'string' && r.img.indexOf('data:image/') === 0 && !m.img) m.img = r.img;
			n++;
		}
		return n;
	};
	/* ------------------------- база материалов БАЗИСа (.dbf) ------------------------- */
	var BZ_NUM = ['coef', 'L', 'W', 'T', 'tape', 'sx', 'sy', 'dx', 'dy', 'ang', 'mir', 'tr', 'sh', 'br', 'str', 'col'], BZ_STR = ['f', 'grp', 'unit', 'btex'];
	B.bzClean = function (o) {
		var r = {}, any = false;
		BZ_STR.forEach(function (k) { if (trim(o[k])) { r[k] = trim(o[k]); any = true; } });
		BZ_NUM.forEach(function (k) { var v = Number(o[k]); if (isFinite(v) && v) { r[k] = v; any = true; } });
		return any ? r : null;
	};
	/* Вид записи базы БАЗИСа: по единице измерения, размерам, признаку «кромка» и названию папки. */
	B.bzKind = function (r) {
		var u = low(r.UNITNAME).replace(/\.+$/, ''), g = low(r.GRP_NAME), n = low(r.ITEMNAME);
		if (/покрыт|лакокрас|эмаль|лак[и ]|краск/.test(g)) return 'покрытие';
		if (/кром/.test(g) || (Number(r.ISTAPE) === 1 && /кром/.test(n))) return 'кромка';
		if (u === 'лист' || u === 'кв.м' || u === 'м2' || /листов|плитн/.test(g)) return 'плита';
		if (u === 'м.п' || u === 'п.м' || u === 'м' || u === 'пог.м' || u === 'бобина' || /погон|столешн|стенов/.test(g)) return 'погонаж';
		return 'фурнитура';
	};
	function bzRec(r, file) {
		var o = { f: file, grp: trim(r.GRP_NAME), unit: trim(r.UNITNAME), coef: Number(r.COEF) || 0, L: Number(r.LENGTH) || 0, W: Number(r.WIDTH) || 0, T: Number(r.THICKNESS) || 0,
			tape: Number(r.ISTAPE) ? 1 : 0, btex: trim(r.TEXTURE), sx: Number(r.STEPX) || 0, sy: Number(r.STEPY) || 0, dx: Number(r.DX) || 0, dy: Number(r.DY) || 0, ang: Number(r.ANGLE) || 0,
			mir: Number(r.MIRROR) || 0, tr: Number(r.TRANSPAR) || 0, sh: Number(r.SHINESS) || 0, br: Number(r.BRIGHT) || 0, str: Number(r.STRETCH) ? 1 : 0, col: Number(r.COLOR) || 0 };
		if (o.coef === 1) o.coef = 0;                      // 1 — как и без коэффициента
		if (o.sx === 1000) o.sx = 0; if (o.sy === 1000) o.sy = 0;
		return B.bzClean(o) || { f: file };
	}
	/* Найти запись «Базы» для строки БАЗИСа: по названию, а если с тем же названием другой артикул — «название · артикул». */
	function bzFind(base, name, art) {
		var m = base.mats[name];
		if (m && (!art || !m.art || m.art === art)) return name;
		var k2 = name + ' · ' + art;
		if (art && base.mats[k2]) return k2;
		return '';
	}
	/* План загрузки: что добавится и что изменится. rows — записи .dbf (BM.dbf.parse), file — имя файла.
	   Ваше в «Базе» (классы, поставщик, ссылка, фото, своя текстура) не трогается. Из той же базы — обновляется,
	   из другой — дописывается только пустое. Возвращает { add: [{ key, m }], upd: [{ key, bz, art, kind }], same, kinds }. */
	B.bzPlan = function (base, rows, file) {
		var add = [], upd = [], same = 0, kinds = { 'плита': 0, 'кромка': 0, 'погонаж': 0, 'фурнитура': 0, 'покрытие': 0 }, fresh = {};
		file = trim(file) || 'база';
		rows.forEach(function (r) {
			var name = trim(r.ITEMNAME), art = trim(r.ITEMCODE);
			if (!name) return;
			var kind = B.bzKind(r), bz = bzRec(r, file);
			kinds[kind] = (kinds[kind] || 0) + 1;
			var key = bzFind(base, name, art) || (fresh[name] && (!art || fresh[name].art === art || !fresh[name].art) ? name : (art && fresh[name + ' · ' + art] ? name + ' · ' + art : ''));
			if (!key) {
				key = (base.mats[name] || fresh[name]) ? name + ' · ' + (art || add.length) : name;
				if (base.mats[key] || fresh[key]) return;                            // точный повтор внутри файла
				var m = { name: key, art: art, kind: kind, cls: {}, bz: bz };
				fresh[key] = m; add.push({ key: key, m: m });
				return;
			}
			if (fresh[key]) { mergeBz(fresh[key], bz, art, kind); return; }      // повтор внутри той же загрузки
			var cur = base.mats[key], before = JSON.stringify([cur.art, cur.kind, cur.bz || null]);
			var probe = { art: cur.art, kind: cur.kind, bz: cur.bz ? JSON.parse(JSON.stringify(cur.bz)) : null };
			mergeBz(probe, bz, art, kind);
			if (JSON.stringify([probe.art, probe.kind, probe.bz]) === before) same++;
			else upd.push({ key: key, art: probe.art, kind: probe.kind, bz: probe.bz });
		});
		return { add: add, upd: upd, same: same, kinds: kinds, file: file };
	};
	function mergeBz(m, bz, art, kind) {
		if (!m.art && art) m.art = art;
		if (!m.kind && kind) m.kind = kind;
		var own = !m.bz || m.bz.f === bz.f, out = m.bz ? m.bz : {};
		BZ_STR.concat(BZ_NUM).forEach(function (k) {
			if (k === 'f') return;
			if (own) { if (bz[k] !== undefined) out[k] = bz[k]; else delete out[k]; }
			else if ((out[k] === undefined || out[k] === '' || out[k] === 0) && bz[k] !== undefined) out[k] = bz[k];
		});
		if (own) out.f = bz.f;
		m.bz = B.bzClean(out) || { f: bz.f };
	}
	B.bzApply = function (base, plan) {
		plan.add.forEach(function (a) { base.mats[a.key] = a.m; });
		plan.upd.forEach(function (u) { var m = base.mats[u.key]; if (!m) return; m.art = u.art || m.art; m.kind = u.kind || m.kind; m.bz = u.bz; });
		return plan.add.length + plan.upd.length;
	};
	/* Размер листа плиты из базы БАЗИСа: [длина, ширина] или null. */
	B.bzSheet = function (base, name) {
		var m = base && base.mats[trim(name)];
		if (!m || !m.bz || !(m.bz.L > 0) || !(m.bz.W > 0)) return null;
		if (m.kind && m.kind !== 'плита') return null;
		return [Math.max(m.bz.L, m.bz.W), Math.min(m.bz.L, m.bz.W)];
	};
	/* Свойства 3D материала из базы БАЗИСа для 3D-модели: { t, mir, sh, br, sx, sy, ang } или null.
	   name — название материала в 3D-файле (бывает с артикулом в конце): ищется запись, с которой оно начинается. */
	B.bz3d = function (base, name) {
		if (!base || !name) return null;
		var nm = trim(name), m = base.mats[nm];
		if (!m || !m.bz) { m = null; var bl = 0; for (var k in base.mats) if (has(base.mats, k) && k.length > bl && k.length >= 4 && nm.indexOf(k) === 0 && base.mats[k].bz) { m = base.mats[k]; bl = k.length; } }
		if (!m || !m.bz) return null;
		var z = m.bz, r = {};
		if (z.tr) r.t = z.tr; if (z.mir) r.mir = z.mir; if (z.sh) r.sh = z.sh; if (z.br) r.br = z.br; if (z.sx) r.sx = z.sx; if (z.sy) r.sy = z.sy; if (z.ang) r.ang = z.ang;
		return Object.keys(r).length ? r : null;
	};
	/* Папки БАЗИСа деревом: { name, path, n, kids } (n — записей в папке со вложенными). */
	B.bzDirs = function (base) {
		var root = { name: '', path: '', n: 0, kids: [], by: {} };
		for (var k in base.mats) {
			if (!has(base.mats, k)) continue;
			var g = base.mats[k].bz && base.mats[k].bz.grp;
			if (!g) continue;
			var parts = g.split('/'), node = root, path = '';
			root.n++;
			for (var i = 0; i < parts.length; i++) {
				var pn = trim(parts[i]); if (!pn) continue;
				path = path ? path + '/' + pn : pn;
				var c = node.by[pn];
				if (!c) { c = node.by[pn] = { name: pn, path: path, n: 0, kids: [], by: {} }; node.kids.push(c); }
				c.n++; node = c;
			}
		}
		(function sort(nd) { nd.kids.sort(function (a, b) { return a.name < b.name ? -1 : (a.name > b.name ? 1 : 0); }); nd.kids.forEach(sort); })(root);
		return root;
	};
	B.inDir = function (m, dir) { var g = m.bz && m.bz.grp ? m.bz.grp.split('/').map(trim).join('/') : ''; return g === dir || g.indexOf(dir + '/') === 0; };

	/* Материалы по классу: '' — все, '-' — без класса в группе, иначе код класса группы gcode. */
	B.matsBy = function (base, gcode, ccode, q, dir, noSort) {
		var out = [], ql = low(q);
		for (var k in base.mats) {
			if (!has(base.mats, k)) continue;
			var m = base.mats[k];
			if (dir && !B.inDir(m, dir)) continue;
			if (gcode && ccode === '-' && B.clsOf(m, gcode).length) continue;
			if (gcode && ccode && ccode !== '-' && !B.hasCls(m, gcode, ccode)) continue;
			if (ql && low(m.name).indexOf(ql) < 0 && low(m.art).indexOf(ql) < 0) continue;
			out.push(m);
		}
		if (!noSort) out.sort(function (a, b) { var x = low(a.name), y = low(b.name); return x < y ? -1 : (x > y ? 1 : 0); });
		return out;
	};
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));
