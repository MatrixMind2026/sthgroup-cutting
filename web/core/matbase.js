/* STHGroup — база материалов и комплектующих (2.1): отдельный модуль, устроен как база материалов БАЗИС-Мебельщика.
   Группы (дерево, у группы — тип материала), материалы с карточкой как в БАЗИСе (общие, дополнительные параметры,
   параметры текстуры), сопутствующие материалы и операции, справочники (классы с группами классов, единицы измерения,
   альтернативные валюты), поставщики, склад (документы прихода и расхода, деловые обрезки), импорт и экспорт
   (CSV, DBF, XML), обновление цен, наценка, поиск дубликатов. Новая база — пустая: всё заводит пользователь.
   Хранится одним файлом JSON в папке, которую выбрал пользователь (общая база для нескольких компьютеров).
   Только данные и правила — окно в ui/matbase_ui.js. Работает в окне и под Node.js. */
(function (G) {
	'use strict';
	var BM = G.BM = G.BM || {};
	var MB = BM.mb = {};
	MB.FILE = 'STHGroup — база материалов.json';
	MB.FORMAT = 'bazisreborn-matbase';

	/* типы групп — как «Тип материала» группы в БАЗИСе */
	MB.TYPES = [['other', 'Прочие материалы'], ['sheet', 'Листовой и погонный материалы'], ['edge', 'Кромочный материал'], ['fit', 'Фурнитура']];
	/* «Тип» листового и погонного материала (вкладка «Дополнительные параметры») */
	MB.KINDS = [['sheet', 'Лист'], ['lin', 'Погонный'], ['top', 'Столешница'], ['wall', 'Стеновая панель']];
	MB.ROUND = [[0, 'Не округлять'], [1, 'Всегда округлять в большую сторону до целого'], [2, 'Округление в большую сторону до кратного числа']];
	MB.UNIQUE = [['art', 'только по артикулу'], ['name', 'только по наименованию'], ['and', 'по артикулу И наименованию'], ['or', 'по артикулу ИЛИ наименованию']];
	MB.UNITS0 = ['шт', 'кв.м', 'м', 'куб.м', 'кг', 'л', 'компл', 'лист', 'м.п.', 'пог.м'];
	/* столбцы таблицы материалов — порядок и подписи как в БАЗИСе; stock — столбец склада (вариант Б) */
	MB.COLS = [
		['art', 'Артикул', 't', 110], ['name', 'Наименование материала', 't', 420], ['unit', 'Ед. изм.', 't', 60], ['price', 'Цена', 'n', 70], ['k', 'Коэф-т', 'n', 54],
		['cls', 'Класс', 't', 70], ['noStock', 'Нет в наличии', 'b', 60], ['stock', 'Остаток', 'n', 70], ['th', 'Толщина', 'n', 60], ['maxL', 'Длина', 'n', 60], ['maxW', 'Ширина', 'n', 60],
		['sign', 'Обозначение', 't', 90], ['overhang', 'Свес', 'n', 50], ['round', 'Округление', 't', 80], ['note', 'Примечание', 't', 120], ['mass', 'Масса', 'n', 60],
		['altCur', 'Альт. валюта', 't', 70], ['altPrice', 'Цена в альт.', 'n', 70], ['tex', 'Текстура', 'b', 56], ['kCut', 'Коэф-т раскроя', 'n', 60],
		['calcPrice', 'Цена расчётной ед.', 'n', 80], ['calcMass', 'Масса расчётной ед.', 'n', 80], ['sync', 'Идентификатор', 't', 110]];

	function trim(s) { return String(s === null || s === undefined ? '' : s).replace(/^\s+|\s+$/g, ''); }
	function low(s) { return trim(s).toLowerCase(); }
	function num(v, def) { if (typeof v === 'string') v = v.replace(/\s/g, '').replace(',', '.'); v = Number(v); return isFinite(v) ? v : (def === undefined ? 0 : def); }
	function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
	function clone(o) { return JSON.parse(JSON.stringify(o)); }
	MB.num = num;

	/* номера записей: время + счётчик (в проверках подменяется) */
	var seq = 0;
	MB.newId = function (p) { return (p || 'x') + Date.now().toString(36) + (seq++).toString(36) + Math.floor(Math.random() * 1296).toString(36); };

	/* --------------------------------- база ------------------------------------ */
	MB.empty = function () {
		return { format: MB.FORMAT, v: 1, groups: [], mats: {}, classGroups: [], classes: [], units: MB.UNITS0.slice(), currencies: [], suppliers: [],
			stock: { docs: [], offcuts: [] }, set: MB.defSet() };
	};
	MB.defSet = function () {
		return { decPrice: 2, decQty: 6, norm: 'unitPerHour', unique: 'and', syncEdit: 0, normDefault: 1, showSub: 1, keepSort: 1, offMin: [300, 200], cols: {}, sort: null };
	};
	MB.defLook = function () { return { mode: 'color', color: '#c8c8c8', tex: '', dx: 0, dy: 0, sx: 1000, sy: 1000, transp: 0, mirror: 0, sharp: 0, bright: 0, angle: 0 }; };
	MB.defMat = function (group) {
		return { id: '', group: group || '', name: '', art: '', cls: [], k: 1, fnp: [], tex: 0, noStock: 0, unit: 'шт', kSmeta: 1, mass: 0, price: 0, altCur: '', altPrice: 0, note: '',
			round: 0, roundTo: 1, unique: '', sync: '', th: 0, maxL: 0, maxW: 0, sign: '', kCut: 1, kind: 'sheet', overhang: 0, look: MB.defLook(), rel: [], ops: [], sup: '', supArt: '', url: '', photo: '', vray: MB.defVray() };
	};
	/* V-Ray (вкладка «Параметры текстуры → V-Ray» БАЗИСа): хранится и выгружается, программа сама не рендерит */
	MB.VRAY = [['diffuse', 'Diffuse', 'c', '#c8c8c8'], ['rough', 'Roughness', 'n', 0], ['reflect', 'Reflect', 'c', '#000000'], ['depth', 'Max depth', 'n', 5], ['hgloss', 'HGlossiness', 'n', 1], ['rgloss', 'RGlossiness', 'n', 1],
		['fresnel', 'Fresnel', 'b', 1], ['refract', 'Refract', 'c', '#000000'], ['ior', 'IOR', 'n', 1.6], ['fog', 'Fog', 'c', '#ffffff'], ['transl', 'Translucency', 'b', 0], ['selfIl', 'Self-Illumination', 'c', '#000000']];
	MB.defVray = function () { var o = {}; MB.VRAY.forEach(function (f) { o[f[0]] = f[3]; }); return o; };
	/* Привести прочитанное из файла к нужному виду (недостающее — по умолчанию, лишнее — как было). */
	MB.fix = function (b) {
		var e = MB.empty(), k, i;
		if (!b || typeof b !== 'object' || b.format !== MB.FORMAT) b = e;
		for (k in e) if (has(e, k) && (b[k] === undefined || b[k] === null || typeof b[k] !== typeof e[k] || Array.isArray(b[k]) !== Array.isArray(e[k]))) b[k] = e[k];
		for (k in e.set) if (has(e.set, k) && b.set[k] === undefined) b.set[k] = e.set[k];
		if (!Array.isArray(b.stock.docs)) b.stock.docs = [];
		if (!Array.isArray(b.stock.offcuts)) b.stock.offcuts = [];
		b.groups = b.groups.filter(function (g) { return g && g.id; });
		b.groups.forEach(function (g) { g.name = trim(g.name) || 'Группа'; if (!MB.typeName(g.type)) g.type = 'other'; if (g.parent && !MB.group(b, g.parent)) g.parent = ''; });
		var d = MB.defMat('');
		for (k in b.mats) if (has(b.mats, k)) {
			var m = b.mats[k];
			if (!m || typeof m !== 'object') { delete b.mats[k]; continue; }
			m.id = k;
			for (var f in d) if (has(d, f) && (m[f] === undefined || m[f] === null)) m[f] = clone(d[f]);
			for (f in d.look) if (has(d.look, f) && m.look[f] === undefined) m.look[f] = d.look[f];
			if (!Array.isArray(m.cls)) m.cls = m.cls ? [String(m.cls)] : [];
			for (i = 0; i < m.rel.length; i++) if (!m.rel[i] || !m.rel[i].mat) { m.rel.splice(i, 1); i--; }
		}
		return b;
	};
	MB.typeName = function (t) { for (var i = 0; i < MB.TYPES.length; i++) if (MB.TYPES[i][0] === t) return MB.TYPES[i][1]; return ''; };

	/* --------------------------------- группы ---------------------------------- */
	MB.group = function (b, id) { for (var i = 0; i < b.groups.length; i++) if (b.groups[i].id === id) return b.groups[i]; return null; };
	MB.kids = function (b, id) { return b.groups.filter(function (g) { return (g.parent || '') === (id || ''); }); };
	/* группа и все вложенные — номера */
	MB.subtree = function (b, id) {
		var out = [id], i;
		for (i = 0; i < out.length; i++) MB.kids(b, out[i]).forEach(function (g) { out.push(g.id); });
		return out;
	};
	MB.path = function (b, id) { var r = [], g = MB.group(b, id), n = 0; while (g && n++ < 100) { r.unshift(g.name); g = MB.group(b, g.parent); } return r; };
	MB.addGroup = function (b, parent, name, type) {
		var p = parent ? MB.group(b, parent) : null;
		var g = { id: MB.newId('g'), parent: p ? p.id : '', name: trim(name) || 'Новая группа', type: MB.typeName(type) ? type : (p ? p.type : 'other') };
		b.groups.push(g);
		return g;
	};
	MB.editGroup = function (b, id, name, type) {
		var g = MB.group(b, id);
		if (!g) return null;
		if (trim(name)) g.name = trim(name);
		if (MB.typeName(type)) g.type = type;
		return g;
	};
	/* перенос группы: не внутрь самой себя */
	MB.moveGroup = function (b, id, parent) {
		var g = MB.group(b, id);
		if (!g || id === parent || (parent && MB.subtree(b, id).indexOf(parent) >= 0)) return false;
		g.parent = parent || '';
		return true;
	};
	/* удалить группу: вложенные группы и их материалы — тоже (как в БАЗИСе); возвращает, сколько удалено */
	MB.dropGroup = function (b, id) {
		var ids = MB.subtree(b, id), n = 0;
		b.groups = b.groups.filter(function (g) { return ids.indexOf(g.id) < 0; });
		for (var k in b.mats) if (has(b.mats, k) && ids.indexOf(b.mats[k].group) >= 0) { MB.dropMat(b, k); n++; }
		return { groups: ids.length, mats: n };
	};
	MB.matCount = function (b, id, sub) {
		var ids = sub ? MB.subtree(b, id) : [id], n = 0;
		for (var k in b.mats) if (has(b.mats, k) && ids.indexOf(b.mats[k].group) >= 0) n++;
		return n;
	};
	MB.typeOf = function (b, m) { var g = MB.group(b, m.group); return g ? g.type : 'other'; };

	/* -------------------------------- материалы -------------------------------- */
	/* проверка уникальности по правилу базы (или своему правилу материала); возвращает совпавший материал */
	MB.clash = function (b, m) {
		var rule = m.unique || b.set.unique, n = low(m.name), a = low(m.art);
		for (var k in b.mats) if (has(b.mats, k) && k !== m.id) {
			var x = b.mats[k], sn = low(x.name) === n, sa = a !== '' && low(x.art) === a;
			if ((rule === 'art' && sa) || (rule === 'name' && sn) || (rule === 'and' && sn && (sa || (a === '' && low(x.art) === ''))) || (rule === 'or' && (sn || sa))) return x;
		}
		return null;
	};
	MB.checkMat = function (b, m) {
		var e = [];
		if (!trim(m.name)) e.push('Не указано наименование');
		if (!MB.group(b, m.group)) e.push('Не выбрана группа');
		var c = MB.clash(b, m);
		if (c) e.push('Такой материал уже есть: «' + c.name + '»' + (c.art ? ' (' + c.art + ')' : ''));
		if (num(m.k, 0) <= 0) e.push('Коэффициент избытка должен быть больше нуля');
		return e;
	};
	/* записать материал (новый или изменённый); при ошибке — список ошибок, база не меняется */
	MB.saveMat = function (b, m) {
		m = MB.normMat(m);
		var e = MB.checkMat(b, m);
		if (e.length) return { errors: e };
		if (!m.id) m.id = MB.newId('m');
		b.mats[m.id] = m;
		return { mat: m };
	};
	MB.normMat = function (m) {
		var d = MB.defMat(m.group), r = clone(m), f;
		for (f in d) if (has(d, f) && r[f] === undefined) r[f] = clone(d[f]);
		r.name = trim(r.name).replace(/\s+/g, ' '); r.art = trim(r.art); r.note = String(r.note || '');
		['k', 'kSmeta', 'mass', 'price', 'altPrice', 'th', 'maxL', 'maxW', 'kCut', 'overhang', 'roundTo'].forEach(function (x) { r[x] = num(r[x], d[x]); });
		r.round = [0, 1, 2].indexOf(num(r.round)) >= 0 ? num(r.round) : 0;
		r.tex = r.tex ? 1 : 0; r.noStock = r.noStock ? 1 : 0;
		r.cls = (r.cls || []).map(trim).filter(function (c, i, a) { return c && a.indexOf(c) === i; });
		r.fnp = (r.fnp || []).map(trim).filter(Boolean);
		for (f in d.look) if (has(d.look, f) && r.look[f] === undefined) r.look[f] = d.look[f];
		['dx', 'dy', 'sx', 'sy', 'transp', 'mirror', 'sharp', 'bright', 'angle'].forEach(function (x) { r.look[x] = num(r.look[x], d.look[x]); });
		r.look.mode = r.look.mode === 'tex' ? 'tex' : 'color';
		r.rel = (r.rel || []).filter(function (x) { return x && x.mat; }).map(function (x) { return { mat: x.mat, qty: num(x.qty, 1) }; });
		r.photo = typeof r.photo === 'string' && r.photo.indexOf('data:image/') === 0 ? r.photo : '';
		r.vray = r.vray && typeof r.vray === 'object' ? r.vray : {};
		MB.VRAY.forEach(function (f) { var v = r.vray[f[0]]; r.vray[f[0]] = f[2] === 'n' ? num(v, f[3]) : (f[2] === 'b' ? (v === undefined ? f[3] : (v ? 1 : 0)) : (/^#[0-9a-f]{6}$/i.test(v || '') ? v : f[3])); });
		r.ops = (r.ops || []).filter(function (x) { return x && trim(x.op); }).map(function (x) { return { op: trim(x.op), param: trim(x.param), qty: num(x.qty, 1), unit: trim(x.unit), norm: num(x.norm), rate: num(x.rate) }; });
		return r;
	};
	/* «Создать новый на основе текущего» — копия с пометкой в наименовании */
	MB.copyMat = function (b, id) {
		var m = b.mats[id];
		if (!m) return null;
		var c = clone(m);
		c.id = ''; c.sync = '';
		var base = c.name + ' (копия)', i = 2;
		c.name = base;
		while (MB.clash(b, c)) c.name = base + ' ' + i++;
		return MB.saveMat(b, c).mat;
	};
	/* «Групповое редактирование параметров»: одно поле — всем выделенным; что можно менять */
	MB.BULK = [['unit', 'Единица измерения', 't'], ['price', 'Цена', 'n'], ['k', 'Коэффициент избытка', 'n'], ['kCut', 'Коэф-т избытка с учётом раскроя', 'n'], ['kSmeta', 'Коэф-т пересчёта для сметы', 'n'],
		['th', 'Толщина', 'n'], ['maxL', 'Макс. длина', 'n'], ['maxW', 'Макс. ширина', 'n'], ['mass', 'Масса ед. изм.', 'n'], ['sign', 'Обозначение', 't'], ['note', 'Примечание', 't'],
		['sup', 'Поставщик', 's'], ['noStock', 'Нет в наличии', 'b'], ['tex', 'Текстура', 'b'], ['cls+', 'Добавить класс', 'c'], ['cls-', 'Снять класс', 'c']];
	MB.bulkSet = function (b, ids, field, value) {
		var n = 0;
		(ids || []).forEach(function (id) {
			var m = b.mats[id];
			if (!m) return;
			if (field === 'cls+') { if (value && m.cls.indexOf(value) < 0) { m.cls.push(value); n++; } return; }
			if (field === 'cls-') { var i = m.cls.indexOf(value); if (i >= 0) { m.cls.splice(i, 1); n++; } return; }
			var f = null; MB.BULK.forEach(function (x) { if (x[0] === field) f = x; });
			if (!f) return;
			m[field] = f[2] === 'n' ? num(value) : (f[2] === 'b' ? (value ? 1 : 0) : trim(value));
			n++;
		});
		return n;
	};
	/* «Переименовать выделенные»: найти и заменить в наименовании (и/или артикуле); повтор имени — пропуск */
	MB.renameMats = function (b, ids, find, repl, inArt) {
		var r = { done: 0, skip: 0 };
		if (!find) return r;
		(ids || []).forEach(function (id) {
			var m = b.mats[id];
			if (!m) return;
			var c = clone(m), key = inArt ? 'art' : 'name';
			c[key] = String(c[key]).split(find).join(repl || '');
			if (c[key] === m[key]) return;
			if (MB.clash(b, c) || !trim(c.name)) { r.skip++; return; }
			m[key] = trim(c[key]).replace(/\s+/g, ' '); r.done++;
		});
		return r;
	};
	/* «Вставить сопутствие из буфера»: сопутствующие одного материала — другим (без него самого) */
	MB.pasteRel = function (b, rel, ids) {
		var n = 0;
		(ids || []).forEach(function (id) {
			var m = b.mats[id];
			if (!m) return;
			(rel || []).forEach(function (x) { if (x.mat !== id && b.mats[x.mat] && !m.rel.some(function (y) { return y.mat === x.mat; })) { m.rel.push({ mat: x.mat, qty: num(x.qty, 1) }); n++; } });
		});
		return n;
	};
	MB.dropMat = function (b, id) {
		if (!b.mats[id]) return false;
		delete b.mats[id];
		for (var k in b.mats) if (has(b.mats, k)) b.mats[k].rel = b.mats[k].rel.filter(function (x) { return x.mat !== id; });
		return true;
	};
	MB.moveMats = function (b, ids, group) { if (!MB.group(b, group)) return 0; var n = 0; ids.forEach(function (id) { if (b.mats[id]) { b.mats[id].group = group; n++; } }); return n; };

	/* значения столбцов таблицы */
	MB.cell = function (b, m, col) {
		switch (col) {
			case 'cls': return m.cls.join(', ');
			case 'round': return m.round === 0 ? 'Нет' : (m.round === 1 ? 'До целого' : 'До ' + m.roundTo);
			case 'stock': return MB.balance(b, m.id);
			case 'calcPrice': return m.kSmeta ? m.price / m.kSmeta : 0;
			case 'calcMass': return m.kSmeta ? m.mass / m.kSmeta : 0;
			default: return m[col];
		}
	};
	/* фильтр столбца — как строка фильтров БАЗИСа: текст — «содержит»; числа — «=5», «>5», «<=5», «<>5», «5..10» */
	MB.match = function (val, f) {
		f = trim(f);
		if (f === '' || f === '=') return true;
		if (typeof val === 'number' || typeof val === 'boolean') {
			var v = Number(val), mm = /^(<=|>=|<>|<|>|=)?\s*(-?[\d\s]*[.,]?\d+)$/.exec(f), r = /^(-?[\d.,]+)\s*\.\.\s*(-?[\d.,]+)$/.exec(f);
			if (r) return v >= num(r[1]) && v <= num(r[2]);
			if (!mm) return String(val).indexOf(f) >= 0;
			var x = num(mm[2]);
			switch (mm[1] || '=') { case '<': return v < x; case '>': return v > x; case '<=': return v <= x; case '>=': return v >= x; case '<>': return v !== x; default: return Math.abs(v - x) < 1e-9; }
		}
		var neg = f.charAt(0) === '!' ;
		if (neg) f = f.substring(1);
		if (f.charAt(0) === '=') return (low(val) === low(f.substring(1))) !== neg;
		return (low(val).indexOf(low(f)) >= 0) !== neg;
	};
	/* материалы в окне: группа (с подгруппами, если так в настройках), поиск, фильтры столбцов, сортировка */
	MB.list = function (b, o) {
		o = o || {};
		var ids = o.group ? (b.set.showSub ? MB.subtree(b, o.group) : [o.group]) : null, q = low(o.q), out = [], k;
		for (k in b.mats) if (has(b.mats, k)) {
			var m = b.mats[k];
			if (ids && ids.indexOf(m.group) < 0) continue;
			if (q && low(m.name).indexOf(q) < 0 && low(m.art).indexOf(q) < 0 && low(m.sync).indexOf(q) < 0) continue;
			var ok = true;
			for (var c in o.filters || {}) if (has(o.filters, c) && !MB.match(MB.cell(b, m, c), o.filters[c])) { ok = false; break; }
			if (ok) out.push(m);
		}
		var s = o.sort || { col: 'name', dir: 1 };
		out.sort(function (x, y) {
			var a = MB.cell(b, x, s.col), c = MB.cell(b, y, s.col), d;
			if (typeof a === 'number' && typeof c === 'number') d = a - c;
			else d = String(a || '').localeCompare(String(c || ''), 'ru', { numeric: true, sensitivity: 'base' });
			return (d || x.name.localeCompare(y.name, 'ru', { numeric: true })) * (s.dir < 0 ? -1 : 1);
		});
		return out;
	};
	/* поиск по наименованию и артикулу во всей базе (кнопка «Найти»): группы с найденным */
	MB.find = function (b, q) { return MB.list(b, { q: q }); };

	/* количество к закупке по правилу округления материала (для сметы и склада) */
	MB.roundQty = function (m, q) {
		q = num(q) * (num(m.k, 1) || 1);
		if (m.round === 1) return Math.ceil(q - 1e-9);
		if (m.round === 2 && m.roundTo > 0) return Math.ceil(q / m.roundTo - 1e-9) * m.roundTo;
		return q;
	};

	/* ------------------------------- справочники ------------------------------- */
	MB.classBy = function (b, code) { for (var i = 0; i < b.classes.length; i++) if (b.classes[i].code === code) return b.classes[i]; return null; };
	MB.classGroup = function (b, code) { for (var i = 0; i < b.classGroups.length; i++) if (b.classGroups[i].code === code) return b.classGroups[i]; return null; };
	/* следующий свободный код: GM0, GM1… и M0, M1… — как в БАЗИСе */
	MB.nextCode = function (list, pre) { var n = 0; list.forEach(function (x) { var m = new RegExp('^' + pre + '(\\d+)$').exec(x.code); if (m) n = Math.max(n, Number(m[1]) + 1); }); return pre + n; };
	MB.addClassGroup = function (b, name, parent) { var g = { code: MB.nextCode(b.classGroups, 'GM'), name: trim(name) || 'Группа классов', parent: parent || '' }; b.classGroups.push(g); return g; };
	MB.addClass = function (b, name, group) { var c = { code: MB.nextCode(b.classes, 'M'), name: trim(name) || 'Класс', group: group || '' }; b.classes.push(c); return c; };
	MB.renameClass = function (b, code, name) { var c = MB.classBy(b, code); if (c && trim(name)) c.name = trim(name); return c; };
	MB.dropClass = function (b, code) {
		b.classes = b.classes.filter(function (c) { return c.code !== code; });
		for (var k in b.mats) if (has(b.mats, k)) b.mats[k].cls = b.mats[k].cls.filter(function (c) { return c !== code; });
	};
	MB.dropClassGroup = function (b, code) {
		var ids = [code], i;
		for (i = 0; i < ids.length; i++) b.classGroups.forEach(function (g) { if (g.parent === ids[i]) ids.push(g.code); });
		b.classGroups = b.classGroups.filter(function (g) { return ids.indexOf(g.code) < 0; });
		b.classes.filter(function (c) { return ids.indexOf(c.group) >= 0; }).forEach(function (c) { MB.dropClass(b, c.code); });
	};
	MB.className = function (b, code) { var c = MB.classBy(b, code); return c ? c.name : code; };
	MB.setUnits = function (b, list) { var out = []; list.forEach(function (u) { u = trim(u); if (u && out.indexOf(u) < 0) out.push(u); }); b.units = out; return out; };
	MB.setCurrencies = function (b, list) { b.currencies = list.filter(function (c) { return c && trim(c.name); }).map(function (c) { return { name: trim(c.name), rate: num(c.rate, 1) }; }); return b.currencies; };
	MB.rate = function (b, name) { for (var i = 0; i < b.currencies.length; i++) if (b.currencies[i].name === name) return b.currencies[i].rate; return 0; };
	/* цена в рублях: базовая, а если задана альтернативная валюта — по курсу */
	MB.priceOf = function (b, m) { var r = m.altCur ? MB.rate(b, m.altCur) : 0; return r > 0 && m.altPrice > 0 ? Math.round(m.altPrice * r * 100) / 100 : m.price; };

	/* поставщики */
	MB.supplier = function (b, id) { for (var i = 0; i < b.suppliers.length; i++) if (b.suppliers[i].id === id) return b.suppliers[i]; return null; };
	MB.saveSupplier = function (b, s) {
		var x = s.id ? MB.supplier(b, s.id) : null;
		if (!x) { x = { id: MB.newId('s') }; b.suppliers.push(x); }
		['name', 'url', 'phone', 'email', 'note'].forEach(function (f) { x[f] = trim(s[f]); });
		if (!x.name) x.name = 'Поставщик';
		if (x.url && !/^https?:\/\//i.test(x.url)) x.url = 'https://' + x.url;
		return x;
	};
	MB.dropSupplier = function (b, id) { b.suppliers = b.suppliers.filter(function (s) { return s.id !== id; }); for (var k in b.mats) if (has(b.mats, k) && b.mats[k].sup === id) b.mats[k].sup = ''; };

	/* -------------------------------- инструменты ------------------------------ */
	/* «Обновление цен» и «Установить наценку»: материалы (номера), процент или новая цена */
	MB.updatePrices = function (b, ids, o) {
		var n = 0;
		ids.forEach(function (id) {
			var m = b.mats[id];
			if (!m) return;
			var p = m.price;
			if (o.set !== undefined && o.set !== null && o.set !== '') p = num(o.set);
			else if (o.pct) p = p * (1 + num(o.pct) / 100);
			p = Math.round(p * Math.pow(10, b.set.decPrice)) / Math.pow(10, b.set.decPrice);
			if (p !== m.price) { m.price = p; n++; }
		});
		return n;
	};
	/* «Поиск дубликатов в базе» — по правилу уникальности базы: группы одинаковых */
	MB.duplicates = function (b) {
		var by = {}, out = [], rule = b.set.unique;
		for (var k in b.mats) if (has(b.mats, k)) {
			var m = b.mats[k], key = rule === 'art' ? low(m.art) : (rule === 'name' ? low(m.name) : low(m.name) + '\n' + low(m.art));
			if (rule === 'art' && !key) continue;
			(by[key] = by[key] || []).push(m);
		}
		for (var q in by) if (has(by, q) && by[q].length > 1) out.push(by[q]);
		if (rule === 'or') {
			var ba = {};
			for (k in b.mats) if (has(b.mats, k) && b.mats[k].art) (ba[low(b.mats[k].art)] = ba[low(b.mats[k].art)] || []).push(b.mats[k]);
			for (q in ba) if (has(ba, q) && ba[q].length > 1 && !out.some(function (g) { return g.length === ba[q].length && g.every(function (x) { return ba[q].indexOf(x) >= 0; }); })) out.push(ba[q]);
		}
		return out;
	};

	/* --------------------------------- склад ----------------------------------- */
	/* Остаток материала: приход − расход ± корректировки (по документам, кроме отменённых). */
	MB.balance = function (b, id) {
		var s = 0;
		b.stock.docs.forEach(function (d) {
			if (d.off) return;
			d.lines.forEach(function (l) { if (l.mat === id) s += d.kind === 'out' ? -num(l.qty) : num(l.qty); });
		});
		return Math.round(s * 1e6) / 1e6;
	};
	MB.balances = function (b) { var o = {}; for (var k in b.mats) if (has(b.mats, k)) o[k] = MB.balance(b, k); return o; };
	/* документ: kind 'in' — приход (поставщик, цены), 'out' — расход (проект), 'adj' — корректировка (инвентаризация) */
	MB.addDoc = function (b, d) {
		var doc = { id: MB.newId('d'), kind: ['in', 'out', 'adj'].indexOf(d.kind) >= 0 ? d.kind : 'in', date: d.date || MB.today(), no: trim(d.no), sup: d.sup || '', project: trim(d.project), note: trim(d.note),
			lines: (d.lines || []).filter(function (l) { return l && b.mats[l.mat] && num(l.qty) !== 0; }).map(function (l) { return { mat: l.mat, qty: num(l.qty), price: num(l.price) }; }), off: 0 };
		if (!doc.no) doc.no = String(b.stock.docs.filter(function (x) { return x.kind === doc.kind; }).length + 1);
		if (!doc.lines.length) return null;
		b.stock.docs.push(doc);
		/* приход с ценой — последняя закупочная цена в карточку, если цена в карточке пустая */
		if (doc.kind === 'in') doc.lines.forEach(function (l) { var m = b.mats[l.mat]; if (l.price > 0 && !(m.price > 0)) m.price = l.price; });
		return doc;
	};
	MB.cancelDoc = function (b, id) {
		var d = null;
		b.stock.docs.forEach(function (x) { if (x.id === id) d = x; });
		if (!d || d.off) return false;
		d.off = 1;
		b.stock.offcuts.forEach(function (o) { if (o.doc === id && !o.used) o.gone = 1; });
		return true;
	};
	MB.today = function () { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
	/* движения материала (для вкладки «Склад» карточки) */
	MB.moves = function (b, id) {
		var out = [];
		b.stock.docs.forEach(function (d) { d.lines.forEach(function (l) { if (l.mat === id) out.push({ doc: d, qty: d.kind === 'out' ? -l.qty : l.qty, price: l.price }); }); });
		return out.sort(function (x, y) { return x.doc.date < y.doc.date ? -1 : (x.doc.date > y.doc.date ? 1 : 0); });
	};
	/* деловые обрезки: на складе (не взятые в раскрой и не отменённые) */
	MB.offcuts = function (b, id) { return b.stock.offcuts.filter(function (o) { return (!id || o.mat === id) && !o.used && !o.gone; }); };
	MB.addOffcut = function (b, mat, L, W, n, src) {
		L = Math.round(num(L)); W = Math.round(num(W));
		if (!b.mats[mat] || L <= 0 || W <= 0) return null;
		var o = { id: MB.newId('o'), mat: mat, L: Math.max(L, W), W: Math.min(L, W), n: Math.max(1, Math.round(num(n, 1))), doc: (src && src.doc) || '', project: (src && src.project) || '', date: MB.today() };
		b.stock.offcuts.push(o);
		return o;
	};
	MB.useOffcut = function (b, id, project) { var o = null; b.stock.offcuts.forEach(function (x) { if (x.id === id) o = x; }); if (!o || o.used) return false; o.used = 1; o.usedIn = project || ''; return true; };

	/* Списать по заказу: need — [{ mat (номер), qty }] (листы из раскроя, кромка, фурнитура из сметы), offcuts — [{ mat, L, W, n }]
	   (деловые обрезки раскроя не меньше b.set.offMin) → документ расхода и обрезки на склад. Повторное списание того же проекта —
	   прежний документ отменяется. */
	MB.writeOff = function (b, project, need, offcuts) {
		var lim = b.set.offMin || [300, 200], prev = b.stock.docs.filter(function (d) { return d.kind === 'out' && !d.off && d.project === project; });
		prev.forEach(function (d) { MB.cancelDoc(b, d.id); });
		var lines = {};
		(need || []).forEach(function (x) { if (b.mats[x.mat] && num(x.qty) > 0) lines[x.mat] = (lines[x.mat] || 0) + num(x.qty); });
		var doc = MB.addDoc(b, { kind: 'out', project: project, lines: Object.keys(lines).map(function (k) { return { mat: k, qty: Math.round(lines[k] * 1e6) / 1e6 }; }) });
		var oc = [];
		if (doc) (offcuts || []).forEach(function (o) {
			var L = Math.max(num(o.L), num(o.W)), W = Math.min(num(o.L), num(o.W));
			if (L >= Math.max(lim[0], lim[1]) && W >= Math.min(lim[0], lim[1])) { var x = MB.addOffcut(b, o.mat, L, W, o.n, { doc: doc.id, project: project }); if (x) oc.push(x); }
		});
		return { doc: doc, offcuts: oc, replaced: prev.length };
	};

	/* ------------------------- связь с проектом (смета, раскрой) ----------------- */
	/* материал базы по названию из БАЗИСа: точное наименование (и артикул, если есть), иначе — начало названия */
	MB.byName = function (b, name, art) {
		if (!b) return null;
		var n = low(name), a = low(art), hit = null, k;
		for (k in b.mats) if (has(b.mats, k)) { var m = b.mats[k]; if (low(m.name) === n && (!a || !m.art || low(m.art) === a)) return m; }
		if (a) for (k in b.mats) if (has(b.mats, k) && low(b.mats[k].art) === a) { if (hit) return null; hit = b.mats[k]; }
		return hit;
	};
	/* для сметы и раскроя: цена, формат листа, поставщик, остаток — или null, если материала в базе нет */
	MB.infoFor = function (b, name, art) {
		var m = MB.byName(b, name, art);
		if (!m) return null;
		var s = MB.supplier(b, m.sup);
		return { id: m.id, price: MB.priceOf(b, m), unit: m.unit, L: m.maxL, W: m.maxW, th: m.th, k: m.k, kCut: m.kCut, shop: s ? s.name : '', url: m.url || (s ? s.url : ''), art: m.art, photo: m.photo || '',
			stock: MB.balance(b, m.id), noStock: m.noStock, offcuts: MB.offcuts(b, m.id).map(function (o) { return { L: o.L, W: o.W, n: o.n, id: o.id }; }) };
	};

	/* ------------------------- перенос из прежней «Базы» ------------------------ */
	/* по кнопке «Взять из прежней Базы»: поставщики, классы (группы классов БАЗИСа), материалы с размерами листа из .dbf;
	   группа материалов — «Из прежней Базы» (по разделам .dbf, если были). Уже заведённое (по уникальности) — не трогается. */
	MB.fromOld = function (b, old) {
		var r = { sup: 0, cls: 0, mats: 0, skip: 0 };
		if (!old || typeof old !== 'object') return r;
		var supMap = {}, clsMap = {};
		(old.sup || []).forEach(function (s) {
			var x = null;
			b.suppliers.forEach(function (y) { if (low(y.name) === low(s.name)) x = y; });
			if (!x) { x = MB.saveSupplier(b, { name: s.name, url: s.url, phone: s.phone, email: s.email, note: s.note }); r.sup++; }
			supMap[s.id] = x.id;
		});
		(old.groups || []).forEach(function (g) {
			var cg = null;
			b.classGroups.forEach(function (y) { if (low(y.name) === low(g.name)) cg = y; });
			if (!cg) cg = MB.addClassGroup(b, g.name);
			(g.classes || []).forEach(function (c) {
				var x = null;
				b.classes.forEach(function (y) { if (y.group === cg.code && low(y.name) === low(c.name)) x = y; });
				if (!x) { x = MB.addClass(b, c.name, cg.code); r.cls++; }
				clsMap[g.code + '/' + c.code] = x.code;
			});
		});
		var root = null, sub = {};
		function groupFor(path) {
			if (!root) { root = null; b.groups.forEach(function (g) { if (!g.parent && g.name === 'Из прежней Базы') root = g; }); if (!root) root = MB.addGroup(b, '', 'Из прежней Базы', 'other'); }
			var cur = root, parts = String(path || '').split('/').map(trim).filter(Boolean), key = '';
			parts.forEach(function (p) {
				key += '/' + p;
				if (!sub[key]) { var f = null; MB.kids(b, cur.id).forEach(function (g) { if (g.name === p) f = g; }); sub[key] = f || MB.addGroup(b, cur.id, p, cur.type); }
				cur = sub[key];
			});
			return cur;
		}
		var KIND = { 'плита': 'sheet', 'лист': 'sheet', 'кромка': 'edge', 'фурнитура': 'fit', 'погонаж': 'sheet' };
		for (var name in old.mats || {}) if (has(old.mats, name)) {
			var o = old.mats[name] || {}, bz = o.bz || {}, g = groupFor(bz.grp || '');
			var m = MB.defMat(g.id);
			m.name = trim(name); m.art = trim(o.art); m.note = '';
			if (KIND[low(o.kind)] && g.type === 'other' && g !== root) g.type = KIND[low(o.kind)];
			if (bz.L) m.maxL = num(bz.L); if (bz.W) m.maxW = num(bz.W); if (bz.th) m.th = num(bz.th);
			if (bz.unit) m.unit = trim(bz.unit);
			if (o.sup && supMap[o.sup]) m.sup = supMap[o.sup];
			if (o.url) m.url = trim(o.url);
			if (o.tex) { m.tex = 1; m.look.mode = 'tex'; m.look.tex = o.tex; }
			for (var gc in o.cls || {}) if (has(o.cls, gc)) [].concat(o.cls[gc]).forEach(function (c) { if (clsMap[gc + '/' + trim(c)]) m.cls.push(clsMap[gc + '/' + trim(c)]); });
			var res = MB.saveMat(b, m);
			if (res.errors) r.skip++; else r.mats++;
		}
		return r;
	};

	/* ---------------------------- импорт и экспорт ----------------------------- */
	/* поля .dbf — как в базе материалов БАЗИСа */
	MB.DBF = [['ITEMCODE', 'C', 250], ['ITEMNAME', 'C', 250], ['GRP_CODE', 'N', 20, 5], ['GRP_NAME', 'C', 250], ['UNITNAME', 'C', 250], ['PRICE', 'N', 20, 5], ['COEF', 'N', 20, 5],
		['LENGTH', 'N', 20, 5], ['WIDTH', 'N', 20, 5], ['THICKNESS', 'N', 20, 5], ['SIGN', 'C', 250], ['OVERHANG', 'N', 20, 5], ['COLOR', 'N', 20, 5], ['TEXTURE', 'C', 250], ['CLASS', 'C', 250],
		['ISTAPE', 'N', 20, 5], ['SYNC_EXTER', 'C', 250], ['WEIGHT', 'N', 20, 5], ['COMMENT', 'C', 250], ['NOAVAI', 'N', 20, 5], ['STRETCH', 'N', 20, 5], ['RETRY', 'N', 20, 5], ['MIRROR', 'N', 20, 5],
		['TRANSPAR', 'N', 20, 5], ['SHINESS', 'N', 20, 5], ['BRIGHT', 'N', 20, 5], ['DX', 'N', 20, 5], ['DY', 'N', 20, 5], ['STEPX', 'N', 20, 5], ['STEPY', 'N', 20, 5], ['ANGLE', 'N', 20, 5],
		['COEF_CUT', 'N', 20, 5], ['ROUNDMODE', 'N', 20, 5]];
	function colorNum(hex) { var n = parseInt(String(hex || '#000000').slice(1), 16) || 0; return ((n & 255) << 16) | (n & 0xff00) | ((n >> 16) & 255); }      // RGB → BGR (как COLOR в БАЗИСе)
	function colorHex(v) { v = num(v) | 0; var r = v & 255, g = (v >> 8) & 255, bb = (v >> 16) & 255; return '#' + [r, g, bb].map(function (x) { return (x < 16 ? '0' : '') + x.toString(16); }).join(''); }
	/* материал → запись в полях БАЗИСа */
	MB.toRec = function (b, m) {
		var t = MB.typeOf(b, m);
		return { ITEMCODE: m.art, ITEMNAME: m.name, GRP_CODE: 0, GRP_NAME: MB.path(b, m.group).join('/'), UNITNAME: m.unit, PRICE: m.price, COEF: m.k, LENGTH: m.maxL, WIDTH: m.maxW, THICKNESS: m.th,
			SIGN: m.sign, OVERHANG: m.overhang, COLOR: colorNum(m.look.color), TEXTURE: m.look.mode === 'tex' ? m.look.tex : '', CLASS: m.cls.join(','), ISTAPE: t === 'edge' ? 1 : 0, SYNC_EXTER: m.sync,
			WEIGHT: m.mass, COMMENT: m.note, NOAVAI: m.noStock, STRETCH: m.kind === 'lin' ? 1 : 0, RETRY: 0, MIRROR: m.look.mirror, TRANSPAR: m.look.transp, SHINESS: m.look.sharp, BRIGHT: m.look.bright,
			DX: m.look.dx, DY: m.look.dy, STEPX: m.look.sx, STEPY: m.look.sy, ANGLE: m.look.angle, COEF_CUT: m.kCut, ROUNDMODE: m.round };
	};
	/* запись (из .dbf, CSV, XML) → материал в группе по GRP_NAME (группы создаются); совпавший по уникальности — обновляется */
	MB.fromRec = function (b, r, rootId) {
		var path = String(r.GRP_NAME || '').split('/').map(trim).filter(Boolean), cur = rootId || '', made = 0;
		path.forEach(function (p) {
			var f = null;
			MB.kids(b, cur).forEach(function (g) { if (g.name === p) f = g; });
			if (!f) { f = MB.addGroup(b, cur, p, num(r.ISTAPE) ? 'edge' : (num(r.THICKNESS) > 0 && num(r.LENGTH) > 0 ? 'sheet' : 'other')); made++; }
			cur = f.id;
		});
		if (!cur) { var imp = null; b.groups.forEach(function (g) { if (!g.parent && g.name === 'Import') imp = g; }); cur = (imp || MB.addGroup(b, '', 'Import', 'other')).id; }
		var m = MB.defMat(cur);
		m.name = trim(r.ITEMNAME); m.art = trim(r.ITEMCODE);
		if (!m.name) return { skip: 1 };
		var old = MB.clash(b, m);
		if (old) { m = clone(old); m.group = old.group; }
		m.unit = trim(r.UNITNAME) || m.unit; m.price = num(r.PRICE, m.price); m.k = num(r.COEF, 1) || 1; m.maxL = num(r.LENGTH); m.maxW = num(r.WIDTH); m.th = num(r.THICKNESS);
		m.sign = trim(r.SIGN); m.overhang = num(r.OVERHANG); m.mass = num(r.WEIGHT); m.note = trim(r.COMMENT); m.noStock = num(r.NOAVAI) ? 1 : 0; m.sync = trim(r.SYNC_EXTER);
		m.kCut = num(r.COEF_CUT, 1) || 1; m.round = [0, 1, 2].indexOf(num(r.ROUNDMODE)) >= 0 ? num(r.ROUNDMODE) : 0; m.kind = num(r.STRETCH) ? 'lin' : 'sheet';
		m.look.color = colorHex(r.COLOR); m.look.transp = num(r.TRANSPAR); m.look.mirror = num(r.MIRROR); m.look.sharp = num(r.SHINESS); m.look.bright = num(r.BRIGHT);
		m.look.dx = num(r.DX); m.look.dy = num(r.DY); m.look.sx = num(r.STEPX, 1000) || 1000; m.look.sy = num(r.STEPY, 1000) || 1000; m.look.angle = num(r.ANGLE);
		if (trim(r.TEXTURE)) { m.look.mode = 'tex'; m.look.tex = trim(r.TEXTURE); m.tex = 1; }
		m.cls = String(r.CLASS || '').split(/[,;]/).map(trim).filter(Boolean).map(function (c) { var x = MB.classBy(b, c); if (!x) { b.classes.forEach(function (y) { if (low(y.name) === low(c)) x = y; }); } if (!x) x = MB.addClass(b, c, ''); return x.code; });
		var res = MB.saveMat(b, m);
		return res.errors ? { skip: 1, why: res.errors[0] } : { mat: res.mat, upd: !!old, groups: made };
	};
	MB.importRecs = function (b, recs) {
		var r = { add: 0, upd: 0, skip: 0, groups: 0 };
		recs.forEach(function (x) { var q = MB.fromRec(b, x); if (q.skip) r.skip++; else { if (q.upd) r.upd++; else r.add++; r.groups += q.groups; } });
		return r;
	};
	MB.exportRecs = function (b, ids) { return (ids || Object.keys(b.mats)).filter(function (k) { return b.mats[k]; }).map(function (k) { return MB.toRec(b, b.mats[k]); }); };

	/* CSV (разделитель «;», первая строка — имена полей БАЗИСа) */
	MB.toCSV = function (recs) {
		var F = MB.DBF.map(function (f) { return f[0]; });
		var q = function (v) { v = typeof v === 'number' ? String(v).replace('.', ',') : String(v === null || v === undefined ? '' : v); return /[;"\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
		return '﻿' + [F.join(';')].concat(recs.map(function (r) { return F.map(function (f) { return q(r[f]); }).join(';'); })).join('\r\n') + '\r\n';
	};
	MB.fromCSV = function (text) {
		text = String(text || '').replace(/^﻿/, '');
		var rows = [], row = [], cell = '', inq = false, i, c, sep = /;/.test(text.split(/\r?\n/)[0]) ? ';' : ',';
		for (i = 0; i < text.length; i++) {
			c = text.charAt(i);
			if (inq) { if (c === '"') { if (text.charAt(i + 1) === '"') { cell += '"'; i++; } else inq = false; } else cell += c; continue; }
			if (c === '"') inq = true;
			else if (c === sep) { row.push(cell); cell = ''; }
			else if (c === '\n' || c === '\r') { if (c === '\r' && text.charAt(i + 1) === '\n') i++; row.push(cell); cell = ''; if (row.length > 1 || row[0] !== '') rows.push(row); row = []; }
			else cell += c;
		}
		if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
		if (!rows.length) return [];
		var head = rows[0].map(function (h) { return trim(h).toUpperCase(); });
		return rows.slice(1).map(function (r) { var o = {}; head.forEach(function (h, j) { o[h] = r[j] !== undefined ? r[j] : ''; }); return o; });
	};
	/* XML — плоский список <Material> с полями БАЗИСа (как выгрузка базы в XML) */
	function xe(s) { return String(s === null || s === undefined ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
	MB.toXML = function (recs) {
		return '<?xml version="1.0" encoding="UTF-8"?>\r\n<Materials>\r\n' + recs.map(function (r) {
			return '  <Material>' + MB.DBF.map(function (f) { return '<' + f[0] + '>' + xe(r[f[0]]) + '</' + f[0] + '>'; }).join('') + '</Material>';
		}).join('\r\n') + '\r\n</Materials>\r\n';
	};
	MB.fromXML = function (text) {
		var out = [], re = /<Material\b[^>]*>([\s\S]*?)<\/Material>/gi, m, f;
		var un = function (s) { return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#(\d+);/g, function (a, n) { return String.fromCharCode(n); }).replace(/&amp;/g, '&'); };
		while ((m = re.exec(String(text || '')))) {
			var o = {}, fr = /<([A-Za-z_][\w()]*)\s*(?:\/>|>([\s\S]*?)<\/\1>)/g;
			while ((f = fr.exec(m[1]))) o[f[1].toUpperCase()] = un(f[2] || '');
			out.push(o);
		}
		return out;
	};
	/* .dbf (dBase III, текст в cp866 — как пишет БАЗИС); BM.cp1251 / таблицы BM.dbf для обратного перевода */
	MB.toDBF = function (recs) {
		var F = MB.DBF, tab = (BM.dbf && BM.dbf.TABLES && BM.dbf.TABLES.cp866) || '';
		var enc = function (s, n) {
			var u = new Uint8Array(n).fill(32);
			s = String(s === null || s === undefined ? '' : s);
			for (var i = 0, j = 0; i < s.length && j < n; i++, j++) { var c = s.charCodeAt(i); if (c < 128) u[j] = c; else { var p = tab.indexOf(s.charAt(i)); u[j] = p >= 0 ? 128 + p : 63; } }
			return u;
		};
		var encN = function (v, n, d) { var s = num(v).toFixed(d); if (s.length > n) s = s.substring(0, n); while (s.length < n) s = ' ' + s; return enc(s, n); };
		var hl = 32 + 32 * F.length + 1, rl = 1 + F.reduce(function (a, f) { return a + f[2]; }, 0), size = hl + rl * recs.length + 1, out = new Uint8Array(size), dv = new DataView(out.buffer);
		var d = new Date();
		out[0] = 3; out[1] = d.getFullYear() - 1900; out[2] = d.getMonth() + 1; out[3] = d.getDate();
		dv.setUint32(4, recs.length, true); dv.setUint16(8, hl, true); dv.setUint16(10, rl, true); out[29] = 0x26;
		F.forEach(function (f, i) {
			var p = 32 + 32 * i;
			for (var k = 0; k < f[0].length && k < 10; k++) out[p + k] = f[0].charCodeAt(k);
			out[p + 11] = f[1].charCodeAt(0); out[p + 16] = f[2] & 255; out[p + 17] = f[1] === 'C' ? (f[2] >> 8) : (f[3] || 0);
		});
		out[hl - 1] = 0x0D;
		recs.forEach(function (r, i) {
			var p = hl + i * rl;
			out[p] = 32; p++;
			F.forEach(function (f) { out.set(f[1] === 'N' ? encN(r[f[0]], f[2], f[3] || 0) : enc(r[f[0]], f[2]), p); p += f[2]; });
		});
		out[size - 1] = 0x1A;
		return out;
	};
	MB.fromDBF = function (bytes) {
		if (!BM.dbf) throw new Error('нет чтения .dbf');
		var ab = bytes.buffer ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) : bytes;
		return BM.dbf.parse(ab).rows;
	};
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));
