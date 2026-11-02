/* ==========================================================================
   STHGroup — выгрузка модели БАЗИС-Мебельщик в файл проекта (.bmk)

   Что делает: обходит модель, собирает листовые панели (контур с дугами,
   кромку, пазы, текстуру, позицию и обозначение), отверстия крепежа и
   системы координат панелей, а для сметы — фурнитуру штуками, комплекты,
   профили, погонные материалы и скрытые панели. Сохраняет всё в файл
   <имя модели>.bmk рядом с моделью и открывает его в программе STHGroup.

   Модель скрипт не меняет. Если файл проекта уже есть, раскрой и настройки
   в нём сохраняются: заменяются только данные модели, прежние данные
   остаются рядом, чтобы программа показала, что изменилось.
   ========================================================================== */

var BM_EXPORT_VERSION = '1.11';
var BM_EXE = '%%BM_EXE%%';            // путь к программе; прописывает установщик
var BM_SKIP_PREFIX = '@Р ';            // детали раскроя, построенные сметой в модели, не выгружаются

/* ------------------------------ помощники --------------------------------- */

function bmTrim(s) { return String(s === null || s === undefined ? '' : s).replace(/^\s+|\s+$/g, ''); }

function bmStr(v) {
	if (typeof v == 'string') return v;
	if (v === null || v === undefined) return '';
	try { var a = v.valueOf(); if (typeof a == 'string') return a; } catch (e1) { }
	try { var b = v.toString(); if (typeof b == 'string' && b.indexOf('[object') !== 0) return b; } catch (e2) { }
	return '';
}

function bmNum(v) { var n = Number(v); return (isNaN(n) || !isFinite(n)) ? 0 : n; }
function bmR(v) { return Math.round(bmNum(v) * 1000) / 1000; }

function bmGet(o, name) {
	try { var v = o[name]; return (typeof v == 'function') ? undefined : v; } catch (e) { return undefined; }
}

function bmCall(o, name) {
	try { if (typeof o[name] == 'function') return o[name](); } catch (e) { }
	return undefined;
}

function bmClass(o) { try { return Object.prototype.toString.call(o); } catch (e) { return ''; } }

function bmFs() { return require('fs'); }

/* Имена свойств объекта БАЗИСа — для диагностики: если что-то не прочиталось,
   по этому списку видно, как свойство называется на самом деле. */
function bmKeys(o) {
	var out = [];
	try { for (var k in o) { out.push(k); if (out.length >= 80) break; } } catch (e) { }
	return out;
}

var BM_DIAG = { panels: 0, skippedLinear: 0, skippedHidden: 0, skippedOurs: 0, hiddenPanels: 0, estFast: 0, kits: 0, profiles: 0, linears: 0, classes: {}, errors: [], arcs: 0, arcNoCenter: 0, arcNoDir: 0,
				circles: 0, fasteners: 0, holes: 0, holeNoPos: 0, frames: 0, frameFail: 0, cuts: 0, butts: 0,
				texSeen: {}, api: {}, keys: {}, blocks: 0, blockNoSize: 0, anim: 0,
				solids: 0, skippedService: 0, article: {}, mesh: null };

function bmErr(where, e) {
	if (BM_DIAG.errors.length < 40) BM_DIAG.errors.push(where + ': ' + (e && e.message ? e.message : String(e)));
}

/* ------------------------------ геометрия --------------------------------- */

function bmPt(p) {
	if (!p) return null;
	var x, y;
	try { x = Number(p.x); y = Number(p.y); } catch (e) { return null; }
	if (isNaN(x) || isNaN(y)) return null;
	return [bmR(x), bmR(y)];
}

function bmVec(p) {
	if (!p) return null;
	var x, y, z;
	try { x = Number(p.x); y = Number(p.y); z = Number(p.z); } catch (e) { return null; }
	if (isNaN(x) || isNaN(y) || isNaN(z)) return null;
	return [bmR(x), bmR(y), bmR(z)];
}

function bmNewVec(x, y, z) {
	try { if (typeof NewVector == 'function') return NewVector(x, y, z); } catch (e) { }
	return { x: x, y: y, z: z };
}

/* Элементы контура: отрезок, дуга, окружность. */
function bmContour(C) {
	var els = [], n = 0, i;
	try { n = Number(C.Count) || 0; } catch (e) { n = 0; }
	for (i = 0; i < n; i++) {
		var el = null;
		try { el = C.Objects[i]; } catch (e1) { el = null; }
		if (!el) { els.push(null); continue; }
		var isLine = null, isArc = null, type = bmNum(bmGet(el, 'ElType'));
		try { if (typeof el.IsLine == 'function') isLine = !!el.IsLine(); } catch (e2) { }
		try { if (typeof el.IsArc == 'function') isArc = !!el.IsArc(); } catch (e3) { }
		var a = bmPt(bmGet(el, 'Pos1')), b = bmPt(bmGet(el, 'Pos2')), len = 0;
		try { len = bmR(el.ObjLength()); } catch (e4) { len = 0; }
		var c = bmPt(bmGet(el, 'Center'));

		if (!a || !b) {
			/* концов нет — окружность */
			var r = bmNum(bmGet(el, 'CirRadius'));
			if (!(r > 0) && len > 0) r = len / (2 * Math.PI);
			if (c && r > 0) { els.push({ t: 'C', c: c, r: bmR(r) }); BM_DIAG.circles++; }
			else { els.push(null); if (!BM_DIAG.keys.badElem) BM_DIAG.keys.badElem = bmKeys(el); }
			continue;
		}
		var line = (isLine === true) || (isLine === null && isArc !== true && type === 1);
		if (line) { els.push({ t: 'L', a: a, b: b }); continue; }
		var o = { t: 'A', a: a, b: b, len: len };
		BM_DIAG.arcs++;
		if (c) o.c = c; else BM_DIAG.arcNoCenter++;
		var dir = bmGet(el, 'ArcDir');
		if (dir === true || dir === false) o.ccw = dir; else BM_DIAG.arcNoDir++;
		if (!BM_DIAG.keys.arc) BM_DIAG.keys.arc = bmKeys(el);
		els.push(o);
	}
	return els;
}

/* Система координат объекта в глобальных координатах: начало и три оси. */
function bmFrame(obj) {
	try {
		var o = bmVec(obj.ToGlobal(bmNewVec(0, 0, 0)));
		var x = bmVec(obj.ToGlobal(bmNewVec(1, 0, 0)));
		var y = bmVec(obj.ToGlobal(bmNewVec(0, 1, 0)));
		var z = bmVec(obj.ToGlobal(bmNewVec(0, 0, 1)));
		if (!o || !x || !y || !z) { BM_DIAG.frameFail++; return null; }
		BM_DIAG.frames++;
		return { o: o, x: [bmR(x[0] - o[0]), bmR(x[1] - o[1]), bmR(x[2] - o[2])],
				 y: [bmR(y[0] - o[0]), bmR(y[1] - o[1]), bmR(y[2] - o[2])],
				 z: [bmR(z[0] - o[0]), bmR(z[1] - o[1]), bmR(z[2] - o[2])] };
	} catch (e) { BM_DIAG.frameFail++; if (BM_DIAG.frameFail < 3) bmErr('ToGlobal', e); return null; }
}

/* ------------------------------- детали ----------------------------------- */

function bmSplitName(raw) {
	var s = bmStr(raw), i = s.indexOf('\r');
	if (i < 0) return { name: bmTrim(s), art: '' };
	return { name: bmTrim(s.substring(0, i)), art: bmTrim(s.substring(i + 1).replace(/[\r\n]+/g, ' ')) };
}

function bmField(obj, prop) {
	var v = bmGet(obj, prop);
	if (v === undefined) return '';
	BM_DIAG.api[prop] = 1;
	var s = bmTrim(bmStr(v));
	return s;
}

/* Примечание (поставщик): у какого объекта БАЗИС его отдаёт и как оно называется, заранее неизвестно —
   пробуем по очереди. Нашлось — записываем; программа покажет его в колонке «Поставщик». */
var BM_NOTE_PROPS = ['MaterialNote', 'MaterialComment', 'Note', 'Notes', 'Comment', 'Remark', 'Description'];
function bmNote(obj) {
	if (!obj) return '';
	for (var i = 0; i < BM_NOTE_PROPS.length; i++) {
		var v = bmGet(obj, BM_NOTE_PROPS[i]);
		if (v === undefined || v === null) continue;
		var s = bmTrim(bmStr(v).replace(/[\r\n]+/g, ' '));
		if (s) { BM_DIAG.api['note:' + BM_NOTE_PROPS[i]] = 1; return s; }
	}
	return '';
}

/* Значение свойства как есть: число, да/нет (1/0) или текст; нет свойства — undefined. */
function bmRaw(obj, name) {
	var v = bmGet(obj, name);
	if (v === undefined || v === null) return undefined;
	if (typeof v == 'boolean') return v ? 1 : 0;
	if (typeof v == 'number') return v;
	var s = bmStr(v);
	return (s !== '' && !isNaN(Number(s))) ? Number(s) : (s || undefined);
}

function bmOwnerPath(obj) {
	var names = [], o = null, guard = 0;
	try { o = obj.Owner; } catch (e) { o = null; }
	while (o && guard++ < 20) {
		var nm = '';
		try { nm = bmTrim(bmStr(o.Name)); } catch (e1) { nm = ''; }
		if (nm) names.unshift(nm);
		try { o = o.Owner; } catch (e2) { o = null; }
	}
	return names;
}

var BM_PARTS = [], BM_FAST = [], BM_NEXT_ID = 1;

/* ------------------------------ блоки модели -------------------------------
   Каждый блок (шкаф, фасад-полуфабрикат, сборка) записывается в список: название,
   в каком блоке лежит (up), размер (gs — в своей системе координат) и оси (fr).
   У деталей, отверстий и записей сметы — номер блока, в котором они лежат (bk).
   По ним программа узнаёт заказные фасады (по маске в настройках сметы): фасад
   считается штукой, а его профили, стекло и отверстия — нет.                  */
var BM_BLOCKS = [], BM_BK = -1;

function bmVecXYZ(v) {
	if (!v) return null;
	var a = [bmNum(v.x), bmNum(v.y), bmNum(v.z)];
	return (isNaN(a[0]) || isNaN(a[1]) || isNaN(a[2])) ? null : a;
}

/* Габарит блока в его системе координат: GSize, а если его нет — GMax − GMin. */
function bmBlockSize(obj) {
	var s = null;
	try { s = bmVecXYZ(obj.GSize); } catch (e) { s = null; }
	if (!s) {
		try {
			var a = bmVecXYZ(obj.GMin), b = bmVecXYZ(obj.GMax);
			if (a && b) s = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
		} catch (e1) { s = null; }
	}
	if (!s || !(Math.abs(s[0]) + Math.abs(s[1]) + Math.abs(s[2]) > 0)) { BM_DIAG.blockNoSize++; return null; }
	return [bmR(Math.abs(s[0])), bmR(Math.abs(s[1])), bmR(Math.abs(s[2]))];
}

/* Оси блока — как у детали, но молча: у не всякого блока они есть, и это не ошибка. */
function bmBlockFrame(obj) {
	try {
		if (typeof obj.ToGlobal != 'function') return null;
		var o = bmVec(obj.ToGlobal(bmNewVec(0, 0, 0))), x = bmVec(obj.ToGlobal(bmNewVec(1, 0, 0))), y = bmVec(obj.ToGlobal(bmNewVec(0, 1, 0))), z = bmVec(obj.ToGlobal(bmNewVec(0, 0, 1)));
		if (!o || !x || !y || !z) return null;
		return { o: o, x: [bmR(x[0] - o[0]), bmR(x[1] - o[1]), bmR(x[2] - o[2])], y: [bmR(y[0] - o[0]), bmR(y[1] - o[1]), bmR(y[2] - o[2])], z: [bmR(z[0] - o[0]), bmR(z[1] - o[1]), bmR(z[2] - o[2])] };
	} catch (e) { return null; }
}

/* ------------------------- анимация блоков ---------------------------------
   Как в БАЗИСе: у блока (дверь, ящик, подъёмник, купе, части петли) — Animation { AnimType: 1 поворот,
   2 сдвиг; AxisStart, AxisEnd — ось в осях блока; DoorAngle — угол, Distance — ход; Duration — секунды }.
   Пишем ось в координатах модели и центр габарита блока — программа найдёт блок в 3D-файле.
   Сдвиг с нулевым ходом и поворот без оси (так БАЗИС помечает блоки без движения) — не пишутся. */
var BM_ANIM = [];
function bmAnim(obj) {
	var A = bmGet(obj, 'Animation');
	if (!A) return;
	var t = bmNum(bmGet(A, 'AnimType'));
	if (t !== 1 && t !== 2) return;
	var s = bmVecXYZ(bmGet(A, 'AxisStart')), e = bmVecXYZ(bmGet(A, 'AxisEnd'));
	if (!s || !e) return;
	var L = Math.sqrt((e[0] - s[0]) * (e[0] - s[0]) + (e[1] - s[1]) * (e[1] - s[1]) + (e[2] - s[2]) * (e[2] - s[2]));
	var ang = bmNum(bmGet(A, 'DoorAngle')), d = bmNum(bmGet(A, 'Distance')), dur = bmNum(bmGet(A, 'Duration'));
	if (!(L > 0.01) || (t === 1 && !ang) || (t === 2 && !(d > 0.5))) return;
	var a = bmVec(obj.ToGlobal(bmNewVec(s[0], s[1], s[2]))), b = bmVec(obj.ToGlobal(bmNewVec(e[0], e[1], e[2]))), c = null;
	if (!a || !b) return;
	try { var g0 = bmVecXYZ(obj.GMin), g1 = bmVecXYZ(obj.GMax); if (g0 && g1) c = bmVec(obj.ToGlobal(bmNewVec((g0[0] + g1[0]) / 2, (g0[1] + g1[1]) / 2, (g0[2] + g1[2]) / 2))); } catch (eC) { c = null; }
	var r3 = function (v) { return v ? [bmR(v[0]), bmR(v[1]), bmR(v[2])] : null; };
	var r = { n: bmTrim(bmStr(bmGet(obj, 'Name'))), t: t, a: r3(a), b: r3(b), ms: Math.round((dur > 0 ? dur : 1) * 1000) };
	if (t === 1) r.ang = bmR(ang); else r.d = bmR(d);
	if (c) r.c = r3(c);
	BM_ANIM.push(r);
	BM_DIAG.anim++;
}

/* ------------------- фурнитура и профили в дереве модели --------------------
   Для каждого объекта, который не панель (ручка, петля, профиль, покупное тело), — запись
   с именем и блоком: программа показывает её в структуре модели. Форму фурнитуры программа
   берёт из 3D-файла, который сохраняет сам БАЗИС (bmExport3D). Служебные объекты
   (габаритная рамка, линия стыка, размеры, вырезы) не выгружаются.                       */
var BM_SOLIDS = [], BM_SKIP_CLASS = /TModelLimits|TSize3D|TCustomGroove|TDimension|TSection/;
var BM_MATS = {};                                   // материалы поверхностей: цвет, прозрачность, текстура
function bmMats(obj) {
	var n = 0;
	try { n = Number(obj.TriListsCount) || 0; } catch (e) { n = 0; }
	for (var i = 0; i < n && i < 40; i++) {
		try {
			var M = obj.TriLists[i].Material, nm = bmTrim(bmStr(M.MaterialName));
			if (!nm || BM_MATS[nm]) continue;
			var r = {};
			try { r.c = Number(M.DiffuseColor); } catch (e1) { }
			try { r.t = Number(M.TransparentValue) || 0; } catch (e2) { }
			try { var p = bmStr(M.Path); if (p) r.tex = p; } catch (e3) { }
			/* свойства из «Настройки текстур материала»: зеркальность, резкость и яркость блика, шаг, смещение, угол */
			var num = function (k) { var v = bmNum(bmGet(M, k)); return Math.round(v * 10000) / 10000; };
			r.mir = num('MirrorValue'); r.sh = num('ShinessValue'); r.br = num('BrightValue');
			r.sx = num('TexSX'); r.sy = num('TexSY'); r.dx = num('TexDX'); r.dy = num('TexDY'); r.ang = num('Angle');
			try { if (M.Stretch) r.str = 1; } catch (e5) { }
			try { var cu = bmGet(M, 'ColorUse'); if (cu !== undefined) r.cu = cu ? 1 : 0; } catch (e6) { }
			try { var VR = M.VRay; if (VR) { var rf = bmNum(VR.Reflect), rr = bmNum(VR.Refract); if (rf || rr) r.vr = { rf: rf, rg: bmNum(VR.ReflectGlossiness), rr: rr, ior: bmNum(VR.RefractIOR) }; } } catch (e7) { }
			BM_MATS[nm] = r;
		} catch (e4) { }
	}
}
function bmSolid(obj, cls, sel, hid) {
	if (cls == '[object TSize3D]') { if (!hid) { try { bmDim(obj); } catch (eD) { bmErr('размер', eD); } } return; }
	if (BM_SKIP_CLASS.test(cls)) { BM_DIAG.skippedService = (BM_DIAG.skippedService || 0) + 1; return; }
	var nm = bmSplitName(bmGet(obj, 'Name'));
	var s = { bk: BM_BK, name: nm.name, art: nm.art, kind: cls.replace(/^\[object |\]$/g, '') };
	if (bmGet(obj, 'MaterialName')) s.mat = bmSplitName(bmGet(obj, 'MaterialName')).name;
	if (sel) s.sel = 1;
	if (hid) s.hid = 1;
	BM_DIAG.solids++;
	BM_SOLIDS.push(s);
	try { bmMats(obj); } catch (e) { }
}

/* ------------------- размеры, проставленные в модели (1.10) -------------------
   Размер БАЗИСа (TSize3D): начало — (0,0,0) в его осях, конец — SecondPosLocal; надпись — в сторону +Y.
   Пишем точки в координатах модели, направление надписи, нормаль, значение, высоту текста и блок-владелец
   (имя и центр габарита) — программа найдёт его в 3D-файле, и размер поедет вместе с ящиком или дверью. */
var BM_DIMS = [];
function bmDim(obj) {
	var e = bmVecXYZ(bmGet(obj, 'SecondPosLocal'));
	if (!e) return;
	var g = function (x, y, z) { return bmVec(obj.ToGlobal(bmNewVec(x, y, z))); };
	var a = g(0, 0, 0), b = g(e[0], e[1], e[2]), y = g(0, 1, 0), z = g(0, 0, 1);
	if (!a || !b || !y || !z) return;
	var u = function (p) { var v = [p[0] - a[0], p[1] - a[1], p[2] - a[2]], l = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) || 1; return [bmR(v[0] / l), bmR(v[1] / l), bmR(v[2] / l)]; };
	var r = { a: a, b: b, y: u(y), z: u(z), v: bmR(bmNum(bmGet(obj, 'Value'))), ts: bmR(bmNum(bmGet(obj, 'TextSize')) || 20), bk: BM_BK };
	var tx = bmTrim(bmStr(bmGet(obj, 'TextString'))); if (tx) r.tx = tx;
	var to = bmNum(bmGet(obj, 'TextOffset')); if (to) r.to = bmR(to);
	try {
		var O = obj.Owner;
		if (O) {
			r.n = bmTrim(bmStr(bmGet(O, 'Name')));
			var g0 = bmVecXYZ(O.GMin), g1 = bmVecXYZ(O.GMax);
			if (g0 && g1) r.c = bmVec(O.ToGlobal(bmNewVec((g0[0] + g1[0]) / 2, (g0[1] + g1[1]) / 2, (g0[2] + g1[2]) / 2)));
		}
	} catch (eO) { }
	BM_DIMS.push(r);
	BM_DIAG.dims = (BM_DIAG.dims || 0) + 1;
}

function bmBlock(obj, sel, hid) {
	var nm = bmSplitName(bmGet(obj, 'Name'));
	var b = { name: nm.name, art: nm.art, up: BM_BK, cls: bmClass(obj).replace(/^\[object |\]$/g, ''), gs: bmBlockSize(obj), fr: bmBlockFrame(obj) };
	if (sel) b.sel = 1;
	if (hid) b.hid = 1;
	/* скрипт 1.9: «Сборочная единица» в свойствах блока, позиция и обозначение — для сборочных чертежей */
	var tx = function (v) { if (v === undefined || v === null) return ''; try { v = v.valueOf(); } catch (eV) { } return String(v).replace(/^\s+|\s+$/g, ''); };
	if (tx(bmGet(obj, 'IsAssemblyUnit')) === 'true') b.au = 1;
	var bp = tx(bmGet(obj, 'ArtPos')), bd = tx(bmGet(obj, 'Designation'));
	if (bp) b.pos = bp;
	if (bd) b.des = bd;
	BM_BLOCKS.push(b);
	BM_DIAG.blocks++;
	return BM_BLOCKS.length - 1;
}

/* ------------------------- данные для сметы -------------------------------
   Фурнитура штуками, комплекты, профили и погонные материалы в раскрой не
   идут, но нужны смете. Одинаковые записи склеиваются; у записи два признака:
   sel — объект (или блок, в который он входит) выделен, hid — скрыт.
   Правила те же, что в скрипте «СМЕТА»: что там считалось, то и здесь.      */
var BM_EST = { fast: {}, kits: {}, prof: {}, lin: {} };
var BM_HIDDEN = { count: 0, area: 0 };

function bmEstAdd(map, name, art, sel, hid, extra) {
	var key = name + '\n' + art + '\n' + (sel ? 1 : 0) + (hid ? 1 : 0) + (extra !== undefined ? '\n' + extra : '') + '\n' + BM_BK;
	var r = map[key];
	if (!r) { r = map[key] = { name: name, art: art, n: 0 }; if (sel) r.sel = 1; if (hid) r.hid = 1; if (BM_BK >= 0) r.bk = BM_BK; }
	r.n++;
	return r;
}

function bmEstList(map) {
	var out = [];
	for (var k in map) if (map.hasOwnProperty(k)) out.push(map[k]);
	return out;
}

/* Идёт ли объект в смету: свойство ForEstimate («Учитывать в смете»). Нет свойства — идёт. */
function bmForEstimate(obj) {
	var v = bmGet(obj, 'ForEstimate');
	if (v === undefined || v === null) return true;
	if (typeof v == 'boolean') return v;
	if (typeof v == 'number') return v != 0;
	var s = bmStr(v).toLowerCase();
	if (s == 'false' || s == '0') return false;
	return true;
}

/* Название из одних размеров отверстия («Ø5x12», «8 мм») — это не покупная фурнитура. */
function bmBareHoleName(n) {
	return /^\s*[\u00D8\u00F8Dd]?\s*\d+(?:[.,]\d+)?(?:\s*[xX\u0445\u0425\u00D7]\s*\d+(?:[.,]\d+)?)*\s*(?:\u043C\u043C)?\s*$/.test(String(n));
}

/* Комплект фурнитуры (покупное изделие из нескольких частей): блок TAsmKit или TFurnAsm. */
function bmIsKit(obj) {
	var c = bmClass(obj);
	if (c != '[object TAsmKit]' && c != '[object TFurnAsm]') return false;
	return bmForEstimate(obj);
}

/* Сколько штук в комплекте: вложенных блоков, а если их нет — наибольшее число одинаковых тел. */
function bmKitParts(kit) {
	var nested = 0, byName = {}, cnt = 0, i;
	try { cnt = Number(kit.Count) || 0; } catch (e) { cnt = 0; }
	for (i = 0; i < cnt; i++) {
		var c = null;
		try { c = kit[i]; } catch (e1) { c = null; }
		if (!c) continue;
		try {
			if (typeof c.IsVisible == 'function' && !c.IsVisible()) continue;
			if (c.List) { nested++; continue; }
			if (c.AsPanel) continue;
			if (bmClass(c) == '[object TModelLimits]') continue;
			if (!(Number(c.TriListsCount) > 0)) continue;
			var nm = bmSplitName(bmGet(c, 'Name')).name;
			byName[nm] = (byName[nm] || 0) + 1;
		} catch (e2) { }
	}
	if (nested > 0) return nested;
	var most = 1;
	for (var k in byName) if (byName.hasOwnProperty(k) && byName[k] > most) most = byName[k];
	return most;
}

function bmProfile(obj, len, sel, hid) {
	var L = Math.round(Math.abs(bmNum(len)));
	if (!(L > 0)) return;
	var m = bmSplitName(bmGet(obj, 'MaterialName'));
	var r = bmEstAdd(BM_EST.prof, m.name, m.art, sel, hid, L);
	r.len = L;
	BM_DIAG.profiles++;
}

function bmLinear(obj, len, sel, hid) {
	var L = bmNum(len);
	if (!(L > 0)) return;
	var m = bmSplitName(bmGet(obj, 'MaterialName'));
	var r = bmEstAdd(BM_EST.lin, m.name, m.art, sel, hid);
	r.len = bmR((r.len || 0) + L);
	BM_DIAG.linears++;
}

function bmPanel(obj, selected, hidden, linear) {
	try { bmMats(obj); } catch (eM) { }
	var C = obj.Contour;
	var mat = bmSplitName(bmGet(obj, 'MaterialName'));
	var th = bmNum(bmGet(obj, 'Thickness'));
	var w = bmNum(C.Width), h = bmNum(C.Height);
	if (!(w > 0) || !(h > 0)) return;

	var pos = bmField(obj, 'ArtPos');
	if (pos === '0') pos = '';
	var tex = bmGet(obj, 'TextureOrientation');
	var texRaw = (tex === undefined || tex === null) ? null : (typeof tex == 'number' ? tex : (isNaN(Number(tex)) ? bmStr(tex) : Number(tex)));
	BM_DIAG.texSeen[String(texRaw)] = (BM_DIAG.texSeen[String(texRaw)] || 0) + 1;

	var part = {
		id: BM_NEXT_ID++, name: bmTrim(bmStr(bmGet(obj, 'Name'))) || 'Деталь', pos: pos, des: bmField(obj, 'Designation'),
		mat: mat.name, art: mat.art, th: bmR(th), w: bmR(w), h: bmR(h), tex: texRaw, sel: selected ? 1 : 0,
		path: bmOwnerPath(obj), els: bmContour(C), butts: [], cuts: [], frame: bmFrame(obj)
	};
	if (BM_BK >= 0) part.bk = BM_BK;
	/* лицевая сторона панели (свойство «Лицевая сторона») и примечание — для деталировки фасадов и колонки «Поставщик» */
	var ff = bmRaw(obj, 'FrontFace');
	if (ff !== undefined) part.ff = ff;
	var pnote = bmNote(obj);
	if (pnote) part.note = pnote;
	if (hidden) { part.hid = 1; BM_HIDDEN.count++; BM_HIDDEN.area += w * h / 1000000; BM_DIAG.hiddenPanels++; }
	if (linear) part.lin = 1;                              // погонный материал: в раскрой не идёт, в смете — метрами
	try { var perim = bmNum(C.ObjLength()); if (perim > 0) part.perim = bmR(perim); } catch (ePer) { }
	if (!BM_DIAG.keys.panel) BM_DIAG.keys.panel = bmKeys(obj);

	/* кромка */
	var B = bmGet(obj, 'Butts'), nB = 0, i;
	try { nB = B ? (Number(B.Count) || 0) : 0; } catch (e) { nB = 0; }
	for (i = 0; i < nB; i++) {
		try {
			var bt = B[i]; if (!bt) bt = B.Butts ? B.Butts[i] : null;
			if (!bt) continue;
			var bm = bmSplitName(bmGet(bt, 'Material'));
			var bci = bmGet(bt, 'CutIndex');
			part.butts.push({ el: bmNum(bmGet(bt, 'ElemIndex')), mat: bm.name, art: bm.art, th: bmR(bmGet(bt, 'Thickness')),
							  w: bmR(bmGet(bt, 'Width')), sign: bmTrim(bmStr(bmGet(bt, 'Sign'))),
							  ci: (bci === undefined || bci === null || isNaN(Number(bci))) ? -1 : Number(bci) });
			/* 1.8: подрез панели под кромку и припуск на прифуговку — для пильного размера */
			var bcl = bmGet(bt, 'ClipPanel'), bal = bmGet(bt, 'Allowance'), lb = part.butts[part.butts.length - 1];
			if (bcl !== undefined && bcl !== null) lb.clip = bcl ? 1 : 0;
			if (bal !== undefined && bal !== null && !isNaN(Number(bal))) lb.al = bmR(bal);
			BM_DIAG.butts++;
		} catch (eb) { bmErr('кромка', eb); }
	}

	/* пазы и выемки */
	var K = bmGet(obj, 'Cuts'), nK = 0;
	try { nK = K ? (Number(K.Count) || 0) : 0; } catch (e2) { nK = 0; }
	for (i = 0; i < nK; i++) {
		try {
			var ct = K[i]; if (!ct) ct = K.Cuts ? K.Cuts[i] : null;
			if (!ct) continue;
			var cnm = bmSplitName(bmGet(ct, 'Name'));
			var cut = { name: cnm.name, art: cnm.art, sign: bmTrim(bmStr(bmGet(ct, 'Sign'))), path: [], sect: [], sw: 0, sh: 0,
						th: bmR(bmGet(ct, 'Thickness')) };
			var T = bmGet(ct, 'Trajectory'), SC = bmGet(ct, 'Contour');
			if (T) { cut.path = bmContour(T); try { cut.len = bmR(T.ObjLength()); } catch (eLen) { } }
			if (SC) { cut.sect = bmContour(SC); cut.sw = bmR(bmGet(SC, 'Width')); cut.sh = bmR(bmGet(SC, 'Height')); }
			/* 1.8: сторона паза (FrontSide — со стороны лица панели) и его ширина и глубина из параметров */
			var cfs = bmGet(ct, 'FrontSide'); if (cfs !== undefined && cfs !== null) cut.fs = cfs ? 1 : 0;
			var CP = bmGet(ct, 'Params'); if (CP) { var pdp = Number(bmGet(CP, 'Depth')), pwd = Number(bmGet(CP, 'Width')); if (pdp > 0) cut.pd = bmR(pdp); if (pwd > 0) cut.pw = bmR(pwd); }
			if (!BM_DIAG.keys.cut) BM_DIAG.keys.cut = bmKeys(ct);
			part.cuts.push(cut);
			BM_DIAG.cuts++;
		} catch (ec) { bmErr('паз', ec); }
	}

	BM_PARTS.push(part);
	if (linear) { BM_DIAG.skippedLinear++; return; }
	BM_DIAG.panels++;

	/* облицовка пласти кроится отдельной деталью по тому же контуру */
	var PL = bmGet(obj, 'Plastics'), nP = 0;
	try { nP = PL ? (Number(PL.Count) || 0) : 0; } catch (e3) { nP = 0; }
	for (i = 0; i < nP; i++) {
		try {
			var pm = bmSplitName(bmGet(PL[i], 'Material'));
			if (!pm.name) continue;
			if (!BM_DIAG.keys.plastic) BM_DIAG.keys.plastic = bmKeys(PL[i]);
			var pl = { id: BM_NEXT_ID++, of: part.id, name: 'Облицовка: ' + part.name, pos: part.pos, des: part.des, mat: pm.name, art: pm.art,
					   th: bmR(bmGet(PL[i], 'Thickness')), w: part.w, h: part.h, tex: bmGet(PL[i], 'TextureOrientation') === undefined ? null : bmNum(bmGet(PL[i], 'TextureOrientation')),
					   sel: part.sel, path: part.path, els: part.els, butts: [], cuts: [], frame: null, plastic: 1, pth: part.th };
			if (part.perim) pl.perim = part.perim;
			if (BM_BK >= 0) pl.bk = BM_BK;
			/* с какой стороны облицовка — если БАЗИС это говорит (имя свойства заранее неизвестно) */
			var sides = ['Side', 'FrontSide', 'Front', 'IsFront', 'Face'];
			for (var q = 0; q < sides.length; q++) { var sv = bmRaw(PL[i], sides[q]); if (sv !== undefined) { pl.side = sv; pl.sideProp = sides[q]; break; } }
			var plnote = bmNote(PL[i]);
			if (plnote) pl.note = plnote;
			if (hidden) pl.hid = 1;
			BM_PARTS.push(pl);
		} catch (ep) { bmErr('облицовка', ep); }
	}
}

/* Крепёж: отверстия в глобальных координатах. Какой детали они принадлежат,
   определяет программа — по системам координат панелей. */
function bmFastener(obj, selected, hidden, est) {
	var HL = bmGet(obj, 'Holes'), n = 0, i, cup = false;
	try { n = HL ? (Number(HL.Count) || 0) : 0; } catch (e) { n = 0; }
	if (n < 1) return false;
	var nm = bmSplitName(bmGet(obj, 'Name'));
	BM_DIAG.fasteners++;
	for (i = 0; i < n; i++) {
		try {
			var H = HL.Items ? HL.Items[i] : HL[i];
			if (!H) continue;
			if (!BM_DIAG.keys.hole) BM_DIAG.keys.hole = bmKeys(H);
			var p = bmGet(H, 'Position'), d = bmGet(H, 'Direction'), e2 = bmGet(H, 'EndPosition');
			var rec = { fast: nm.name, dia: bmR(bmGet(H, 'Diameter')), depth: bmR(bmGet(H, 'Depth')), mode: bmNum(bmGet(H, 'DrillMode')) };
			if (est) rec.est = 1;                       // отверстие настоящего крепежа: идёт в раздел сметы «Отверстия»
			if (BM_BK >= 0) rec.bk = BM_BK;
			if (selected) rec.sel = 1;
			if (hidden) rec.hid = 1;
			if (Math.round(rec.dia) == 35) cup = true;
			BM_DIAG.holes++;
			if (!p) { BM_DIAG.holeNoPos++; BM_FAST.push(rec); continue; }
			var gp = null, gd = null;
			try { gp = bmVec(obj.ToGlobal(p)); } catch (e3) { gp = null; }
			if (d) { try { gd = bmVec(obj.NToGlobal(d)); } catch (e4) { gd = null; } }
			if (!gd && e2 && gp) {
				try {
					var ge = bmVec(obj.ToGlobal(e2));
					var L = Math.sqrt(Math.pow(ge[0] - gp[0], 2) + Math.pow(ge[1] - gp[1], 2) + Math.pow(ge[2] - gp[2], 2));
					if (L > 1e-6) gd = [bmR((ge[0] - gp[0]) / L), bmR((ge[1] - gp[1]) / L), bmR((ge[2] - gp[2]) / L)];
				} catch (e5) { gd = null; }
			}
			if (!gp) BM_DIAG.holeNoPos++;
			rec.p = gp; rec.d = gd;
			BM_FAST.push(rec);
		} catch (eh) { bmErr('отверстие', eh); }
	}
	return cup;
}

/* Один объект модели (не блок). inKit — объект лежит внутри комплекта фурнитуры:
   комплект посчитан целиком, его части отдельно в смету не идут. */
function bmObject(obj, selected, hidden, inKit) {
	var nm = '';
	try { nm = bmStr(obj.Name); } catch (e) { nm = ''; }
	if (nm.indexOf(BM_SKIP_PREFIX) === 0) { BM_DIAG.skippedOurs++; return; }
	var asPanel = false;
	try { asPanel = !!obj.AsPanel; } catch (e1) { asPanel = false; }
	if (asPanel) {
		var C = obj.Contour;
		if (bmNum(bmGet(obj, 'MaterialWidth')) > 0) {
			/* погонный материал (столешница, плинтус): в раскрой листов не идёт; смете нужны длина, кромка и пазы */
			bmLinear(obj, Math.max(bmNum(C.Height), bmNum(C.Width)), selected, hidden);
			bmPanel(obj, selected, hidden, true);
			return;
		}
		bmPanel(obj, selected, hidden, false);
		return;
	}
	var cls = bmClass(obj);
	if (BM_DIAG.classes[cls] === undefined) BM_DIAG.classes[cls] = 0;
	BM_DIAG.classes[cls]++;
	try { bmSolid(obj, cls, selected, hidden); } catch (eS) { bmErr('тело', eS); }
	if (cls == '[object TFastener]') {
		var f = bmSplitName(bmGet(obj, 'Name'));
		var counted = !inKit && bmForEstimate(obj) && !bmBareHoleName(f.name);
		var cup = bmFastener(obj, selected, hidden, true);
		if (counted) {
			var r = bmEstAdd(BM_EST.fast, f.name, f.art, selected, hidden, cup ? 1 : 0);
			if (cup) r.cup = 1;                         // под чашку 35 мм — петля
			var fnote = bmNote(obj);
			if (fnote) r.note = fnote;
			BM_DIAG.estFast++;
		}
		return;
	}
	if (cls == '[object TExtrusionBody]') { bmProfile(obj, bmGet(obj, 'Thickness'), selected, hidden); }
	else if (cls == '[object T2DRotationBody]') {
		var c2 = bmGet(obj, 'Contour2D');
		if (c2) bmLinear(obj, Math.max(bmNum(c2.Height), bmNum(c2.Width)), selected, hidden);
	}
	else if (cls == '[object T2DTrajectoryBody]') {
		var c3 = bmGet(obj, 'Contour2D'), t3 = bmGet(obj, 'Trajectory2D'), tl = 0;
		try { tl = bmNum(t3.ObjLength()); } catch (e2) { tl = 0; }
		bmProfile(obj, Math.max(c3 ? bmNum(c3.Height) : 0, tl), selected, hidden);
	}
	bmFastener(obj, selected, hidden, false);
}

/* Обход модели: списки (блоки, сборки) раскрываются. Скрытое выгружается с пометкой hid —
   программа сама решает, брать ли его (настройка «скрытые панели»). */
function bmWalk(obj, selected, hidden, inKit, depth) {
	if (!obj || depth > 60) return;
	var vis = true;
	try { if (typeof obj.IsVisible == 'function') vis = !!obj.IsVisible(); } catch (e) { vis = true; }
	var hid = hidden;
	if (!vis) { hid = true; if (!hidden) BM_DIAG.skippedHidden++; }
	var sel = selected;
	try { if (obj.Selected) sel = true; } catch (e1) { }
	var isList = false;
	try { isList = !!obj.List; } catch (e2) { isList = false; }
	if (!isList) {
		try { bmObject(obj, sel, hid, inKit); } catch (e3) { bmErr('объект', e3); }
		return;
	}
	var kitHere = inKit;
	try {
		if (!inKit && bmIsKit(obj)) {
			var kn = bmSplitName(bmGet(obj, 'Name')), pcs = bmKitParts(obj);
			var kr = bmEstAdd(BM_EST.kits, kn.name, kn.art, sel, hid);
			kr.pcs = (kr.pcs || 0) + pcs;
			if (pcs >= 2) kr.multi = 1;
			kitHere = true;
			BM_DIAG.kits++;
		}
	} catch (eK) { bmErr('комплект', eK); }
	try { bmAnim(obj); } catch (eA) { bmErr('анимация', eA); }
	/* у сборки-фурнитуры (покупное изделие) могут быть свои отверстия */
	try { bmFastener(obj, sel, hid, false); } catch (e4) { }
	var n = 0, was = BM_BK;
	try { n = Number(obj.Count) || 0; } catch (e5) { n = 0; }
	if (!inKit) { try { BM_BK = bmBlock(obj, sel, hid); } catch (eB) { bmErr('блок', eB); } }
	for (var i = 0; i < n; i++) {
		var ch = null;
		try { ch = obj[i]; } catch (e6) { ch = null; }
		if (!ch) { try { ch = obj.Objects[i]; } catch (e7) { ch = null; } }
		bmWalk(ch, sel, hid, kitHere, depth + 1);
	}
	BM_BK = was;
}

/* ------------------------------ сведения ---------------------------------- */

function bmModelFile() {
	var c = [];
	try { c.push(bmStr(Action.ModelFilename)); } catch (e1) { }
	try { c.push(bmStr(Model.FileName)); } catch (e2) { }
	for (var i = 0; i < c.length; i++) if (bmTrim(c[i])) return bmTrim(c[i]);
	return '';
}

function bmTitle() {
	var n = '';
	n = bmArtProp(['Name']);
	if (n) return n;
	var f = bmModelFile();
	return f ? f.replace(/^.*[\\\/]/, '').replace(/\.[^.]+$/, '') : 'Модель';
}

/* Свойства изделия («Параметры изделия» в БАЗИСе) лежат в глобальном объекте Article:
   Name — наименование, Code — артикул, OrderName / OrderCode — заказ, Notes — заметки. */
function bmArticle() {
	try { if (typeof Article != 'undefined' && Article) return Article; } catch (e) { }
	try { if (Model.Article) return Model.Article; } catch (e1) { }
	return null;
}
function bmArtProp(names) {
	var A = bmArticle();
	if (!A) return '';
	for (var i = 0; i < names.length; i++) {
		var v = '';
		try { v = bmTrim(bmStr(A[names[i]])); } catch (e1) { v = ''; }
		if (v && v != 'undefined' && v.indexOf('[object') !== 0) return v;
	}
	return '';
}
function bmArtDump() {
	var out = {}, names = ['Name', 'Code', 'OrderCode', 'OrderName', 'Notes', 'Author', 'Subject', 'Enterprise', 'FurnType'];
	for (var i = 0; i < names.length; i++) { var v = bmArtProp([names[i]]); if (v) out[names[i]] = v.substring(0, 120); }
	return out;
}
function bmModelArt() { return bmArtProp(['Code']); }
function bmModelNote() { return bmArtProp(['Notes', 'ExtraInfo']); }

function bmOrder() {
	return bmArtProp(['OrderName', 'OrderCode']);
}

/* Подпись модели: по ней программа понимает, менялись ли детали. */
function bmSignature(parts) {
	var a = [];
	for (var i = 0; i < parts.length; i++) {
		var p = parts[i];
		if (p.lin || p.hid) continue;                 // подпись — только по деталям раскроя, как в прежних выгрузках
		a.push([p.mat, p.th, p.w, p.h, p.pos, p.des, p.name, p.els.length, p.butts.length].join('|'));
	}
	a.sort();
	var h = 5381, s = a.join('\n');
	for (var k = 0; k < s.length; k++) h = ((h * 33) ^ s.charCodeAt(k)) | 0;
	return a.length + '.' + (h >>> 0).toString(36);
}

function bmExePath() {
	if (BM_EXE && BM_EXE.indexOf('%%') < 0) return BM_EXE;
	/* программа STHGroup при каждом запуске записывает свой путь в %APPDATA%\STHGroup Cutting\exe.txt */
	try {
		var ad = String(process.env.APPDATA || ''), f = ad + '\\STHGroup Cutting\\exe.txt', fs = bmFs();
		if (ad && fs.existsSync(f)) { var p = bmTrim(String(fs.readFileSync(f, 'utf8')).replace(/^\uFEFF/, '')); if (p) return p; }
	} catch (e) { }
	return '';
}

/* Значения перечисления «ориентация текстуры» — как они называются в этой
   версии БАЗИСа. Программа по ним понимает, что значит число у панели. */
function bmTexConsts() {
	var out = {}, names = ['None', 'Horizontal', 'Vertical'], i;
	try {
		if (typeof TextureOrientation != 'undefined' && TextureOrientation) {
			for (i = 0; i < names.length; i++) {
				var v = TextureOrientation[names[i]];
				if (v !== undefined && v !== null && !isNaN(Number(v))) out[names[i]] = Number(v);
			}
		}
	} catch (e) { }
	var alt = { None: 'ftoNone', Horizontal: 'ftoHorizontal', Vertical: 'ftoVertical' };
	for (i = 0; i < names.length; i++) {
		if (out.hasOwnProperty(names[i])) continue;
		try { var g = eval('typeof ' + alt[names[i]] + " != 'undefined' ? " + alt[names[i]] + ' : undefined'); if (g !== undefined && !isNaN(Number(g))) out[names[i]] = Number(g); } catch (e2) { }
	}
	return out;
}


/* ---------------------- развёртка текстур для 3D --------------------------- */

/* В 3D-файле БАЗИСа (.glb) нет развёртки текстур. Её пишем отдельным файлом «<имя> — 3D.uv»: каждый
   треугольник с текстурой — три вершины в координатах модели и их точки на картинке (развёртка БАЗИСа,
   пересчитанная матрицей текстуры списка). Программа подставляет их треугольникам 3D-файла по месту.
   Файл: 'BMUV', версия, число треугольников, длина JSON, JSON { mats: [...] }, затем по 16 чисел float32
   на треугольник: x y z u v ×3 и номер материала. */
function bmUV(file) {
	var fs = bmFs(), t0 = new Date().getTime(), mats = [], mIx = {}, F = [], info = { file: file.replace(/^.*[\\\/]/, '') }, stop = false;
	function obj3(o) {
		if (!o || stop) return;
		var isList = false;
		try { isList = !!o.List; } catch (e) { }
		if (isList) { var c = 0; try { c = Number(o.Count) || 0; } catch (e1) { } for (var j = 0; j < c && !stop; j++) { var ch = null; try { ch = o[j]; } catch (e2) { } obj3(ch); } return; }
		var n = 0; try { n = Number(o.TriListsCount) || 0; } catch (e3) { }
		if (!n) return;
		var A = null;                                                // перевод из координат объекта в координаты модели
		for (var i = 0; i < n; i++) {
			var TL = null, cnt = 0, M = null, path = '';
			try { TL = o.TriLists[i]; cnt = Number(TL.Count) || 0; M = TL.Material; path = bmStr(M.Path); } catch (e4) { continue; }
			if (!path || !cnt) continue;
			if (!A) {
				try {
					var g0 = o.ToGlobal(bmNewVec(0, 0, 0)), gx = o.ToGlobal(bmNewVec(1, 0, 0)), gy = o.ToGlobal(bmNewVec(0, 1, 0)), gz = o.ToGlobal(bmNewVec(0, 0, 1));
					A = [gx.x - g0.x, gx.y - g0.y, gx.z - g0.z, gy.x - g0.x, gy.y - g0.y, gy.z - g0.z, gz.x - g0.x, gz.y - g0.y, gz.z - g0.z, g0.x, g0.y, g0.z];
				} catch (e5) { A = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]; }
			}
			var nm = bmTrim(bmStr(M.MaterialName)), mi = mIx[nm];
			if (mi === undefined) { mi = mIx[nm] = mats.length; mats.push(nm); }
			var m = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
			try { var MM = TL.TextureMatrix.Matrix; for (var q = 0; q < 16; q++) { var mv = Number(MM[q]); if (!isNaN(mv)) m[q] = mv; } } catch (e6) { }
			var tu = m[12] || m[3], tv = m[13] || m[7];
			for (var k = 0; k < cnt; k++) {
				var tr = null; try { tr = TL[k]; } catch (e7) { tr = null; }
				if (!tr) continue;
				try {
					var V = [tr.Vertex1, tr.Vertex2, tr.Vertex3], T = [tr.TexCoord1, tr.TexCoord2, tr.TexCoord3];
					for (var w = 0; w < 3; w++) {
						var x = V[w].x, y = V[w].y, z = V[w].z, a = T[w].x, b = T[w].y;
						F.push(A[0] * x + A[3] * y + A[6] * z + A[9], A[1] * x + A[4] * y + A[7] * z + A[10], A[2] * x + A[5] * y + A[8] * z + A[11],
							m[0] * a + m[4] * b + tu, m[1] * a + m[5] * b + tv);
					}
					F.push(mi);
				} catch (e8) { }
			}
			if (new Date().getTime() - t0 > 60000) { stop = true; info.cut = 1; }
		}
	}
	var top = 0; try { top = Number(Model.Count) || 0; } catch (e9) { }
	for (var t = 0; t < top && !stop; t++) { var ob = null; try { ob = Model.Objects[t]; } catch (e10) { } obj3(ob); }
	var head = bmUtf8(JSON.stringify({ mats: mats })), hl = head.length + (4 - (16 + head.length) % 4) % 4;
	var out = new Uint8Array(16 + hl + F.length * 4), dv = new DataView(out.buffer);
	out[0] = 66; out[1] = 77; out[2] = 85; out[3] = 86;          // BMUV
	dv.setUint32(4, 1, true); dv.setUint32(8, F.length / 16, true); dv.setUint32(12, hl, true);
	for (var h = 0; h < hl; h++) out[16 + h] = h < head.length ? head[h] : 32;
	out.set(new Uint8Array(new Float32Array(F).buffer), 16 + hl);
	fs.writeFileSync(file, out);
	info.tris = F.length / 16; info.ms = new Date().getTime() - t0; info.ok = 1;
	try { info.size = fs.statSync(file).size; } catch (e11) { }
	return info;
}

/* ------------------------ окно выгрузки STHGroup --------------------------- */

/* Отдельное окно (mshta), вариант «C»: слева — сводка модели и ход выгрузки, справа — данные заказа
   (заказчик, номер заказа, изделие, комментарий). Пока человек заполняет поля, скрипт уже читает модель
   и сохраняет 3D; перед записью проекта ждёт ответа окна (файл answer.txt). Закрыли окно — выгрузка
   отменяется. Окно живёт своим процессом и каждые 40 мс читает файл состояния state.txt, который пишет скрипт.
   Если окно не открылось — всё как раньше: проект с данными из модели, программа запускается сама. */
var BM_WIN_HTA = [
	"<!DOCTYPE html>",
	"<html><head><meta charset=\"utf-8\"><meta http-equiv=\"X-UA-Compatible\" content=\"IE=edge\"><title>STHGroup — выгрузка модели</title>",
	"<hta:application id=\"bmw\" applicationname=\"STHGroupExport\" border=\"dialog\" borderstyle=\"normal\" caption=\"yes\" maximizebutton=\"no\" minimizebutton=\"yes\" showintaskbar=\"yes\" singleinstance=\"no\" sysmenu=\"yes\" scroll=\"no\" contextmenu=\"no\" selection=\"yes\" icon=\"\">",
	"<style>",
	"html,body{margin:0;padding:0;background:#fff;color:#23262B;font-family:\"Segoe UI\",Arial,sans-serif;font-size:14px;overflow:hidden}",
	"#w{display:table;width:640px;height:100%}#l,#r{display:table-cell;vertical-align:top}",
	"#l{width:200px;background:#2a2c30;color:#eceef0;padding:20px 18px;border-right:3px solid #F26B1D}",
	"#lg{background:#fff;border-radius:8px;padding:8px 10px}#lg svg{display:block}",
	"#mt{margin:16px 0 4px;font-size:15px;font-weight:600;line-height:1.25;word-wrap:break-word}#ms{color:#a3a8ae;font-size:12.5px;line-height:1.5}",
	"ul{list-style:none;margin:16px 0 0;padding:0}li{padding:4px 0 4px 24px;color:#8f959b;font-size:12.5px;position:relative;min-height:16px}",
	"li i{position:absolute;left:0;top:5px;width:12px;height:12px;border-radius:7px;border:2px solid #4a4e55;font-style:normal;font-size:9px;line-height:12px;text-align:center}",
	"li.ok{color:#d9dcdf}li.ok i{background:#F26B1D;border-color:#F26B1D;color:#fff}li.now{color:#fff;font-weight:600}li.now i{border-color:#F26B1D}",
	"li.warn{color:#f5c453}li.warn i{border-color:#f5c453;color:#f5c453}li.bad{color:#ff8a7a}li.bad i{border-color:#ff8a7a;color:#ff8a7a}",
	"li span{display:block;color:#a3a8ae;font-weight:normal;font-size:11.5px}",
	"#r{padding:18px 22px 18px}h2{margin:0;font-size:18px}.s{color:#777;font-size:12.5px;margin-top:2px}",
	"label{display:block;margin-top:10px}label span{display:block;font-size:12px;color:#666;margin-bottom:3px}",
	"input,textarea{width:100%;box-sizing:border-box;border:1px solid #d6d3ce;border-radius:6px;padding:7px 9px;font:14px \"Segoe UI\",Arial,sans-serif;background:#faf9f7;color:#23262B}",
	"input:focus,textarea:focus{border-color:#F26B1D;outline:none;background:#fff}textarea{height:56px;resize:none}",
	"#two{display:table;width:100%;border-spacing:0}#two div{display:table-cell;width:50%}#two div.a{padding-right:6px}#two div.b{padding-left:6px}",
	"#btns{margin-top:16px;display:table;width:100%}#btns div{display:table-cell;width:50%}#btns div.a{padding-right:6px}#btns div.b{padding-left:6px}",
	"button{width:100%;white-space:nowrap;padding:10px 8px;border-radius:7px;border:1px solid #d6d3ce;background:#fff;color:#23262B;font:600 14px \"Segoe UI\",Arial,sans-serif;cursor:pointer}",
	"button.p{background:#F26B1D;border-color:#F26B1D;color:#fff}button:disabled{opacity:.5;cursor:default}",
	"#now{margin-top:12px;font-size:13px;color:#c2560f;font-weight:600;min-height:18px}#now.ok{color:#2e8b57}#now.bad{color:#c0392b}",
	"#err{margin-top:8px;color:#c0392b;font-size:12.5px;display:none}#fold{margin-top:6px;font-size:12.5px;display:none}#fold a{color:#F26B1D;cursor:pointer}",
	"</style></head><body><div id=\"w\">",
	"<div id=\"l\"><div id=\"lg\">%LOGO%</div><div id=\"mt\"></div><div id=\"ms\"></div><ul id=\"steps\"></ul></div>",
	"<div id=\"r\"><h2>Данные заказа</h2><div class=\"s\">Попадут в проект, смету и КП</div>",
	"<div id=\"two\"><div class=\"a\"><label><span>Заказчик</span><input id=\"fCust\"></label></div><div class=\"b\"><label><span>Номер заказа</span><input id=\"fNo\"></label></div></div>",
	"<label><span>Изделие</span><input id=\"fTitle\"></label>",
	"<label><span>Комментарий</span><textarea id=\"fNote\"></textarea></label>",
	"<div id=\"btns\"><div class=\"a\"><button id=\"bSave\">Только сохранить</button></div><div class=\"b\"><button class=\"p\" id=\"bOpen\">Выгрузить и открыть</button></div></div>",
	"<div id=\"now\"></div><div id=\"err\"></div><div id=\"fold\"><a id=\"bFolder\">Показать файл проекта в папке</a></div>",
	"</div></div>",
	"<script>",
	"var DIR = '%DIR%', fso = new ActiveXObject('Scripting.FileSystemObject'), sh = new ActiveXObject('WScript.Shell'), S = null, CHOICE = '', finished = false, lastStamp = '', idle = 0, filled = false;",
	"function $(id) { return document.getElementById(id); }",
	"function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }",
	"function read() { try { var f = fso.OpenTextFile(DIR + '\\\\state.txt', 1, false, -1), t = f.ReadAll(); f.Close(); return t; } catch (e) { return ''; } }",
	"function write(name, text) { try { var f = fso.CreateTextFile(name, true, true); f.Write(text); f.Close(); } catch (e) { } }",
	"function q(s) { return '\"' + String(s).replace(/\\\\/g, '\\\\\\\\').replace(/\"/g, '\\\\\"').replace(/\\r?\\n/g, '\\\\n') + '\"'; }",
	"function fit() { try { window.resizeTo(660, Math.max(430, $('w').offsetHeight + 40)); } catch (e) { } }",
	"function center() { try { window.moveTo(Math.max(0, (screen.availWidth - 660) / 2), Math.max(0, (screen.availHeight - 460) / 2.4)); } catch (e) { } }",
	"function draw() {",
	"\t$('mt').innerHTML = esc(S.title || 'Модель');",
	"\tvar m = S.sum ? (S.sum.parts + ' дет. · материалов ' + S.sum.mats + '<br>фурнитуры ' + S.sum.furn) : esc(S.sub || '');",
	"\t$('ms').innerHTML = m;",
	"\tvar h = '';",
	"\tfor (var i = 0; i < S.steps.length; i++) { var s = S.steps[i]; h += '<li class=\"' + (s.st || '') + '\"><i>' + (s.st == 'ok' ? '&#10003;' : (s.st == 'warn' ? '!' : (s.st == 'bad' ? '&#215;' : ''))) + '</i>' + esc(s.t) + (s.v ? '<span>' + esc(s.v) + '</span>' : '') + '</li>'; }",
	"\t$('steps').innerHTML = h;",
	"\tif (!filled && S.form) { filled = true; $('fCust').value = S.form.customer || ''; $('fNo').value = S.form.orderNo || ''; $('fTitle').value = S.form.title || ''; $('fNote').value = S.form.note || ''; try { $(S.form.customer ? 'fNo' : 'fCust').focus(); } catch (e) { } }",
	"\tif (CHOICE) { $('now').innerHTML = esc(S.now || ''); $('now').className = S.done ? (S.fail ? 'bad' : 'ok') : ''; }",
	"\tif (S.done) finish();",
	"\tfit();",
	"}",
	"function answer(choice) {",
	"\tif (CHOICE) return; CHOICE = choice;",
	"\tvar a = '{\"customer\":' + q($('fCust').value) + ',\"orderNo\":' + q($('fNo').value) + ',\"title\":' + q($('fTitle').value) + ',\"note\":' + q($('fNote').value) + ',\"choice\":' + q(choice) + '}';",
	"\twrite(DIR + '\\\\answer.txt', a);",
	"\tvar f = ['fCust', 'fNo', 'fTitle', 'fNote', 'bSave', 'bOpen']; for (var i = 0; i < f.length; i++) $(f[i]).disabled = true;",
	"\t$('now').innerHTML = 'Выгружаю…'; if (S) draw();",
	"}",
	"function finish() {",
	"\tif (finished || !CHOICE) return; finished = true;",
	"\tif (S.fail) { $('err').style.display = 'block'; $('err').innerHTML = esc(S.err || ''); return; }",
	"\tif (CHOICE == 'open') { if (!S.exe) { $('err').style.display = 'block'; $('err').innerHTML = 'Программа STHGroup не найдена. Установите её или откройте файл проекта вручную.'; $('fold').style.display = 'block'; return; } $('now').innerHTML = 'Открываю в STHGroup…'; setTimeout(open_, 700); return; }",
	"\t$('fold').style.display = S.out ? 'block' : 'none'; setTimeout(function () { window.close(); }, 6000);",
	"}",
	"function open_() { try { sh.Run('\"' + S.exe + '\" \"' + S.out + '\"', 1, false); } catch (e) { $('err').style.display = 'block'; $('err').innerHTML = 'Не удалось запустить программу: ' + esc(S.exe); return; } setTimeout(function () { window.close(); }, 400); }",
	"$('bOpen').onclick = function () { answer('open'); };",
	"$('bSave').onclick = function () { answer('save'); };",
	"$('bFolder').onclick = function () { try { sh.Run('explorer.exe /select,\"' + S.out + '\"', 1, false); } catch (e) { } };",
	"document.onkeydown = function (e) { e = e || window.event; if (e.keyCode == 13 && !e.ctrlKey && document.activeElement && document.activeElement.tagName != 'TEXTAREA') answer('open'); };",
	"window.onbeforeunload = function () { if (!CHOICE) write(DIR + '\\\\cancel.txt', 'cancel'); };",
	"function tick() {",
	"\tvar t = read();",
	"\tif (t && t != lastStamp) { lastStamp = t; idle = 0; try { S = JSON.parse(t.replace(/^\\uFEFF/, '')); draw(); } catch (e) { } }",
	"\telse if (CHOICE && !finished && ++idle > 25 * 300) { $('now').innerHTML = 'БАЗИС не отвечает — окно можно закрыть'; $('now').className = 'bad'; }",
	"}",
	"write(DIR + '\\\\alive.txt', 'ok');",
	"center(); fit();",
	"setInterval(tick, 40);",
	"</script></body></html>",
	""
].join('\n');
/* логотип STHGroup: графитовый прямоугольник с отверстием, оранжевый и серый — как в логотипе программы */
var BM_LOGO_SVG = "<svg width=\"150\" height=\"40\" viewBox=\"0 0 150 40\"><rect x=\"0\" y=\"0\" width=\"18\" height=\"40\" rx=\"2\" fill=\"#23262B\"/><circle cx=\"9\" cy=\"20\" r=\"2.6\" fill=\"#fff\"/><rect x=\"20\" y=\"0\" width=\"15\" height=\"22\" rx=\"2\" fill=\"#F26B1D\"/><rect x=\"20\" y=\"24\" width=\"15\" height=\"16\" rx=\"2\" fill=\"#9AA0A6\"/><text x=\"42\" y=\"28\" font-family=\"Segoe UI, Arial, sans-serif\" font-size=\"21\" font-weight=\"700\" fill=\"#23262B\">STH<tspan fill=\"#F26B1D\">Group</tspan></text></svg>";
var BM_WIN = null;
function bmWinOpen(title, sub, form) {
	var fs = bmFs(), tmp = '';
	try { tmp = String(process.env.TEMP || process.env.TMP || ''); } catch (e) { tmp = ''; }
	if (!tmp) return null;
	var dir = tmp + '\\STHGroup_export_' + new Date().getTime();
	try {
		fs.mkdirSync(dir);
		var hta = BM_WIN_HTA.replace('%LOGO%', BM_LOGO_SVG).replace('%DIR%', dir.replace(/\\/g, '\\\\'));
		fs.writeFileSync(dir + '\\window.hta', '\uFEFF' + hta, 'utf8');
	} catch (e2) { return null; }
	var W = { dir: dir, st: { title: title, sub: sub, form: form, now: 'Читаю модель…', steps: [
		{ t: 'Детали и материалы', st: 'now' }, { t: 'Фурнитура и блоки' }, { t: '3D-модель и текстуры' }, { t: 'Записываю проект' }] } };
	bmWinWrite(W);
	try { NewCOMObject('WScript.Shell').Run('mshta.exe "' + dir + '\\window.hta"', 1, false); } catch (e3) { return null; }
	return W;
}
/* Текст UTF-16LE (с меткой или без) — так пишет окно (CreateTextFile … unicode). */
function bmUtf16Text(b) {
	if (!b) return '';
	var s = '', i = (b.length >= 2 && b[0] === 0xFF && b[1] === 0xFE) ? 2 : 0;
	for (; i + 1 < b.length; i += 2) s += String.fromCharCode(b[i] | (b[i + 1] << 8));
	return s;
}
/* Пауза без загрузки процессора: скрытая команда, которую ждём (около секунды). Не вышло — короткий цикл. */
function bmSleep() {
	try { NewCOMObject('WScript.Shell').Run('cmd.exe /c ping -n 2 127.0.0.1 >nul', 0, true); return; } catch (e) { }
	var t = new Date().getTime(); while (new Date().getTime() - t < 300) { }
}
/* Ждём ответа окна: { customer, orderNo, title, note, choice } или null — окно закрыли (отмена). */
function bmWinWait(W) {
	var fs = bmFs();
	for (var i = 0; i < 3600; i++) {                                 // не дольше часа
		try {
			if (fs.existsSync(W.dir + '\\answer.txt')) { var a = JSON.parse(bmUtf16Text(bmReadBin(W.dir + '\\answer.txt')).replace(/^\uFEFF/, '')); return a && typeof a === 'object' ? a : null; }
			if (fs.existsSync(W.dir + '\\cancel.txt')) return null;
		} catch (e) { return null; }
		bmSleep();
	}
	return null;
}
function bmWinWrite(W) {
	if (!W) return;
	var t = JSON.stringify(W.st), b = new Uint8Array(2 + t.length * 2);   // UTF-16LE с меткой: окно читает его как Unicode
	b[0] = 0xFF; b[1] = 0xFE;
	for (var i = 0; i < t.length; i++) { var c = t.charCodeAt(i); b[2 + i * 2] = c & 255; b[3 + i * 2] = c >> 8; }
	try { bmFs().writeFileSync(W.dir + '\\state.txt', b); } catch (e) { }
}
function bmWinStep(i, st, v, now) {
	if (!BM_WIN) return;
	var s = BM_WIN.st.steps[i]; if (!s) return;
	s.st = st; if (v !== undefined) s.v = v;
	if (st === 'ok' && BM_WIN.st.steps[i + 1] && !BM_WIN.st.steps[i + 1].st) BM_WIN.st.steps[i + 1].st = 'now';
	if (now) BM_WIN.st.now = now;
	bmWinWrite(BM_WIN);
}
function bmWinAlive(W) {
	var fs = bmFs();
	for (var i = 0; i < 30; i++) {                                 // окну даём до 3 секунд, чтобы открыться
		try { if (fs.existsSync(W.dir + '\\alive.txt')) return true; } catch (e) { return false; }
		var t = new Date().getTime(); while (new Date().getTime() - t < 100) { }
	}
	return false;
}
function bmUtf8(s) {
	var a = [];
	for (var i = 0; i < s.length; i++) {
		var c = s.charCodeAt(i);
		if (c < 128) a.push(c);
		else if (c < 2048) a.push(192 | (c >> 6), 128 | (c & 63));
		else if (c >= 0xD800 && c < 0xDC00 && i + 1 < s.length) {            // пара суррогатов — один знак из 4 байт
			var d = s.charCodeAt(++i), u = 0x10000 + ((c - 0xD800) << 10) + (d - 0xDC00);
			a.push(240 | (u >> 18), 128 | ((u >> 12) & 63), 128 | ((u >> 6) & 63), 128 | (u & 63));
		}
		else a.push(224 | (c >> 12), 128 | ((c >> 6) & 63), 128 | (c & 63));
	}
	return new Uint8Array(a);
}
function bmUtf8Text(b) {
	var s = '', i = 0, c;
	while (i < b.length) {
		c = b[i++];
		if (c >= 240) { var u = ((c & 7) << 18) | ((b[i++] & 63) << 12) | ((b[i++] & 63) << 6) | (b[i++] & 63); u -= 0x10000; s += String.fromCharCode(0xD800 + (u >> 10), 0xDC00 + (u & 1023)); }
		else if (c >= 224) s += String.fromCharCode(((c & 15) << 12) | ((b[i++] & 63) << 6) | (b[i++] & 63));
		else if (c >= 192) s += String.fromCharCode(((c & 31) << 6) | (b[i++] & 63));
		else s += String.fromCharCode(c);
	}
	return s;
}

/* ---------------- один файл: «Модель.bmk» — архив zip без сжатия ----------------
   Внутри: project.json (проект), «<модель> — 3D.glb», «<модель> — 3D.uv» и папка текстур 3D-файла — с теми же
   именами, что раньше лежали рядом с моделью. Программа (1.22.5 и новее) открывает такой .bmk как обычный и правки
   пишет в него же. Если БАЗИС не даёт прочитать файл байтами — выгрузка по-старому, отдельными файлами. */
var BM_CRC = null;
function bmCrc(b) {
	if (!BM_CRC) { BM_CRC = []; for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; BM_CRC[n] = c >>> 0; } }
	var r = 0xFFFFFFFF;
	for (var i = 0; i < b.length; i++) r = BM_CRC[(r ^ b[i]) & 255] ^ (r >>> 8);
	return (r ^ 0xFFFFFFFF) >>> 0;
}
/* то, что вернул readFileSync без кодировки, — байтами (Buffer, Uint8Array, ArrayBuffer); строка — нельзя */
function bmBin(x) {
	if (x === null || x === undefined || typeof x === 'string') return null;
	try {
		if (typeof x.byteLength === 'number' && typeof x.length !== 'number') return new Uint8Array(x);                 // ArrayBuffer
		if (typeof x.length === 'number' && x.buffer && x.BYTES_PER_ELEMENT === 1) return new Uint8Array(x.buffer, x.byteOffset || 0, x.length);
	} catch (e) { }
	return null;
}
function bmReadBin(p) { try { return bmBin(bmFs().readFileSync(p)); } catch (e) { return null; } }
function bmZip(files) {
	var now = new Date(), tm = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1),
		dt = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate(), total = 22, i, f;
	for (i = 0; i < files.length; i++) { f = files[i]; f.nb = bmUtf8(f.name); f.crc = bmCrc(f.data); total += 30 + f.nb.length + f.data.length + 46 + f.nb.length; }
	var out = new Uint8Array(total), dv = new DataView(out.buffer), o = 0, cd = [];
	function hdr(central) {
		dv.setUint32(o, central ? 0x02014b50 : 0x04034b50, true); o += 4;
		if (central) { dv.setUint16(o, 20, true); o += 2; }
		dv.setUint16(o, 20, true); dv.setUint16(o + 2, 0x0800, true); dv.setUint16(o + 4, 0, true);     // имена в UTF-8, без сжатия
		dv.setUint16(o + 6, tm, true); dv.setUint16(o + 8, dt, true); dv.setUint32(o + 10, f.crc, true);
		dv.setUint32(o + 14, f.data.length, true); dv.setUint32(o + 18, f.data.length, true);
		dv.setUint16(o + 22, f.nb.length, true); dv.setUint16(o + 24, 0, true); o += 26;
		if (central) { dv.setUint16(o, 0, true); dv.setUint16(o + 2, 0, true); dv.setUint16(o + 4, 0, true); dv.setUint32(o + 6, 0, true); dv.setUint32(o + 10, f.off, true); o += 14; }
		out.set(f.nb, o); o += f.nb.length;
	}
	for (i = 0; i < files.length; i++) { f = files[i]; f.off = o; hdr(false); out.set(f.data, o); o += f.data.length; }
	var cdOff = o;
	for (i = 0; i < files.length; i++) { f = files[i]; hdr(true); }
	dv.setUint32(o, 0x06054b50, true); dv.setUint16(o + 4, 0, true); dv.setUint16(o + 6, 0, true);
	dv.setUint16(o + 8, files.length, true); dv.setUint16(o + 10, files.length, true);
	dv.setUint32(o + 12, o - cdOff, true); dv.setUint32(o + 16, cdOff, true); dv.setUint16(o + 20, 0, true);
	return out;
}
/* файл из архива (только без сжатия — так пишет этот скрипт и программа) → байты или null */
function bmUnzip(b, name) {
	if (!b || b.length < 22 || b[0] !== 0x50 || b[1] !== 0x4B) return null;
	var dv = new DataView(b.buffer, b.byteOffset, b.length), e = b.length - 22;
	while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
	if (e < 0) return null;
	var n = dv.getUint16(e + 10, true), o = dv.getUint32(e + 16, true);
	for (var i = 0; i < n; i++) {
		if (dv.getUint32(o, true) !== 0x02014b50) return null;
		var meth = dv.getUint16(o + 10, true), size = dv.getUint32(o + 20, true), nl = dv.getUint16(o + 28, true), xl = dv.getUint16(o + 30, true), cl = dv.getUint16(o + 32, true), lo = dv.getUint32(o + 42, true);
		var nm = bmUtf8Text(b.subarray(o + 46, o + 46 + nl));
		if (nm === name) {
			if (meth !== 0) return null;
			var start = lo + 30 + dv.getUint16(lo + 26, true) + dv.getUint16(lo + 28, true);
			return b.subarray(start, start + size);
		}
		o += 46 + nl + xl + cl;
	}
	return null;
}
/* все файлы папки с подпапками: [{ full, rel }] (rel — через «/») */
function bmListDir(dir, rel, out) {
	var fs = bmFs(), names = [];
	try { names = fs.readdirSync(dir); } catch (e) { return out; }
	for (var i = 0; i < names.length; i++) {
		var full = dir + '\\' + names[i], r = rel ? rel + '/' + names[i] : names[i], st = null;
		try { st = fs.statSync(full); } catch (e1) { st = null; }
		if (st && st.isDirectory && st.isDirectory()) bmListDir(full, r, out); else out.push({ full: full, rel: r });
	}
	return out;
}
function bmRemove(list, dirs) {
	var fs = bmFs(), i;
	for (i = 0; i < list.length; i++) { try { fs.unlinkSync(list[i]); } catch (e) { } }
	for (i = 0; i < dirs.length; i++) { try { fs.rmdirSync(dirs[i]); } catch (e1) { } }
}
/* «Модель.bmk» одним файлом. → { ok, files, size } или { err } — тогда проект пишется по-старому */
function bmPack(out, docText, stem, m3, uvInfo) {
	var fs = bmFs(), dir = out.replace(/[\\\/][^\\\/]*$/, ''), files = [{ name: 'project.json', data: bmUtf8(docText) }], gone = [], dirs = [], i;
	if (m3 && m3.ok) {
		var g = bmReadBin(stem + ' — 3D.glb');
		if (!g) return { err: 'БАЗИС не даёт прочитать 3D-файл байтами' };
		files.push({ name: m3.file, data: g }); gone.push(stem + ' — 3D.glb');
		if (uvInfo && uvInfo.ok) { var u = bmReadBin(stem + ' — 3D.uv'); if (u) { files.push({ name: uvInfo.file, data: u }); gone.push(stem + ' — 3D.uv'); } }
		/* текстуры 3D-файла: БАЗИС кладёт их в «<имя>_textures\…» рядом */
		var tdirs = [stem + ' — 3D_textures', stem + '_textures'];
		for (i = 0; i < tdirs.length; i++) {
			var td = tdirs[i], base = td.replace(/^.*[\\\/]/, '');
			try { if (!fs.existsSync(td)) continue; } catch (e0) { continue; }
			var list = bmListDir(td, '', []);
			for (var k = 0; k < list.length; k++) { var b = bmReadBin(list[k].full); if (b) { files.push({ name: base + '/' + list[k].rel, data: b }); gone.push(list[k].full); } }
			(function walkDirs(d) { var ns = []; try { ns = fs.readdirSync(d); } catch (e2) { } for (var j = 0; j < ns.length; j++) { var f = d + '\\' + ns[j]; try { if (fs.statSync(f).isDirectory()) walkDirs(f); } catch (e3) { } } dirs.push(d); })(td);
		}
	}
	var zip = bmZip(files);
	fs.writeFileSync(out, zip);
	bmRemove(gone, dirs);                                    // отдельные файлы больше не нужны — всё в .bmk
	return { ok: 1, files: files.length, size: zip.length };
}
function bmPlural(n, a, b, c) { var m = n % 100, k = n % 10; return (m > 10 && m < 20) ? c : (k === 1 ? a : (k >= 2 && k <= 4 ? b : c)); }

/* ------------------------------- запуск ----------------------------------- */

/* Модель целиком — 3D-файлом самого БАЗИСа (.glb: панели, фурнитура, профили, материалы,
   текстуры). Его рисует раздел «Модель» и файл для заказчика. Текстуры БАЗИС кладёт в папку
   «<имя>_textures\<подпапка>» и сам её не создаёт: создаём нужную и пробуем снова. */
function bmExport3D(base) {
	var fs = bmFs(), f = base + ' — 3D.glb', t0 = new Date().getTime(), err = '', tries = 0, info = { file: f.replace(/^.*[\\\/]/, '') };
	try { if (typeof modelIOOperations == 'undefined' || !modelIOOperations.ExportModelMeshFormat) { info.err = 'в этой версии БАЗИСа нет сохранения 3D из скрипта'; return info; } }
	catch (e0) { info.err = 'нет modelIOOperations'; return info; }
	for (tries = 0; tries < 12; tries++) {
		err = '';
		try { modelIOOperations.ExportModelMeshFormat(Model, f); break; }
		catch (e) {
			err = String(e && e.message ? e.message : e);
			var m = err.match(/\[([^\]]+)\]/);
			if (!m) break;
			var miss = m[1].replace(/\//g, '\\').replace(/[\\][^\\]*$/, '');
			try { fs.mkdirSync(miss, { recursive: true }); } catch (e2) { err += ' · папку не создать: ' + (e2 && e2.message ? e2.message : e2); break; }
		}
	}
	info.ms = new Date().getTime() - t0;
	if (err) info.err = err.substring(0, 300);
	try { info.ok = fs.existsSync(f) ? 1 : 0; if (info.ok) info.size = fs.statSync(f).size; } catch (e3) { }
	return info;
}

function bmMain() {
	var top = 0, i, t0 = new Date().getTime();
	var mfile0 = bmModelFile();
	BM_WIN = bmWinOpen(bmTitle(), mfile0 ? mfile0.replace(/^.*[\\\/]/, '') : '', { customer: bmOrder(), orderNo: '', title: bmTitle(), note: bmModelNote() });
	try { top = Number(Model.Count) || 0; } catch (e) { top = 0; }
	for (i = 0; i < top; i++) {
		var o = null;
		try { o = Model.Objects[i]; } catch (e1) { o = null; }
		if (!o) { try { o = Model[i]; } catch (e2) { o = null; } }
		bmWalk(o, false, false, false, 0);
		if (BM_WIN && i % 3 === 2) bmWinStep(0, 'now', BM_PARTS.length + ' ' + bmPlural(BM_PARTS.length, 'деталь', 'детали', 'деталей'));
	}
	var nSheet = 0, nSel = 0, noMat = 0, matSet = {}, nMat = 0;
	for (i = 0; i < BM_PARTS.length; i++) {
		if (BM_PARTS[i].lin || BM_PARTS[i].hid) continue;
		nSheet++;
		if (BM_PARTS[i].sel) nSel++;
		if (!BM_PARTS[i].mat) noMat++;
		else if (!matSet[BM_PARTS[i].mat]) { matSet[BM_PARTS[i].mat] = 1; nMat++; }
	}
	if (!nSheet) {
		if (BM_WIN && bmWinAlive(BM_WIN)) { BM_WIN.st.done = 1; BM_WIN.st.fail = 1; BM_WIN.st.now = 'Выгружать нечего'; BM_WIN.st.err = 'В модели не найдено листовых панелей.'; bmWinStep(0, 'bad'); return; }
		alert('STHGroup: в модели не найдено листовых панелей — выгружать нечего.'); return;
	}
	var nFurn = BM_SOLIDS.length;
	if (BM_WIN) BM_WIN.st.sum = { parts: nSheet, mats: nMat, furn: nFurn };
	bmWinStep(0, 'ok', nSheet + ' ' + bmPlural(nSheet, 'деталь', 'детали', 'деталей') + ' · ' + nMat + ' ' + bmPlural(nMat, 'материал', 'материала', 'материалов'));
	bmWinStep(1, 'ok', nFurn ? String(nFurn) : 'нет', 'Сохраняю 3D-модель…');

	var mfile = mfile0, fs = bmFs(), out = '';
	if (mfile) out = mfile.replace(/\.[^.\\\/]+$/, '') + '.bmk';
	else {
		var tmp = '';
		try { tmp = String(process.env.TEMP || process.env.TMP || ''); } catch (e3) { tmp = ''; }
		out = (tmp ? tmp + '\\' : '') + 'Модель без имени.bmk';
	}

	/* est: 1 — в файле есть данные для сметы (фурнитура, комплекты, профили, погонные, скрытое) */
	BM_DIAG.article = bmArtDump();
	var stem = mfile ? mfile.replace(/\.[^.\\\/]+$/, '') : '';
	if (stem) {
		try { BM_DIAG.mesh = bmExport3D(stem); } catch (eX) { bmErr('3D-файл', eX); }
		if (BM_DIAG.mesh && BM_DIAG.mesh.ok) {
			bmWinStep(2, 'now', undefined, 'Читаю развёртку текстур…');
			try { BM_DIAG.uv = bmUV(stem + ' — 3D.uv'); } catch (eU) { BM_DIAG.uv = { err: String(eU && eU.message ? eU.message : eU).substring(0, 200) }; bmErr('развёртка', eU); }
		}
	}
	var m3 = BM_DIAG.mesh || {};
	if (m3.ok) bmWinStep(2, 'ok', m3.size ? Math.max(1, Math.round(m3.size / 1048576)) + ' МБ' : '', 'Записываю проект…');
	else bmWinStep(2, 'warn', 'нет', 'Записываю проект…');
	/* данные заказа из окна STHGroup: ждём, пока человек нажмёт «Выгрузить»; закрыл окно — выгрузка отменена */
	var ans = null, winUp = BM_WIN && bmWinAlive(BM_WIN);
	if (winUp) {
		BM_WIN.st.now = 'Жду данные заказа…'; bmWinWrite(BM_WIN);
		ans = bmWinWait(BM_WIN);
		if (!ans) return;
	}
	var form = ans || {};
	var model = { title: bmTrim(form.title) || bmTitle(), order: bmOrder(), art: bmModelArt(), note: form.note !== undefined ? bmTrim(form.note) : bmModelNote(),
				  customer: form.customer !== undefined ? bmTrim(form.customer) : bmOrder(), orderNo: bmTrim(form.orderNo), choice: form.choice || '', solids: BM_SOLIDS, mats: BM_MATS,
				  mesh: m3.ok ? m3.file : '', uv: BM_DIAG.uv && BM_DIAG.uv.ok ? BM_DIAG.uv.file : '', file: mfile, sig: bmSignature(BM_PARTS), selected: nSel,
				  parts: BM_PARTS, holes: BM_FAST, est: 1, fast: bmEstList(BM_EST.fast), kits: bmEstList(BM_EST.kits),
				  prof: bmEstList(BM_EST.prof), lin: bmEstList(BM_EST.lin), blocks: BM_BLOCKS, anim: BM_ANIM, dims: BM_DIMS,
				  hidden: { count: BM_HIDDEN.count, area: Math.round(BM_HIDDEN.area * 100) / 100 },
				  diag: BM_DIAG, texConst: bmTexConsts() };
	var doc = { format: 'benchmark-project', version: 1, exporter: 'bazis-export ' + BM_EXPORT_VERSION,
				exportedAt: new Date().toISOString(), model: model, modelPrev: null, work: null };

	/* проект уже есть: раскрой и настройки сохраняем, прежнюю модель кладём рядом */
	try {
		if (fs.existsSync(out)) {
			var oldText = String(fs.readFileSync(out, 'utf8'));
			if (oldText.substring(0, 2) === 'PK') { var ob = bmUnzip(bmReadBin(out), 'project.json'); oldText = ob ? bmUtf8Text(ob) : ''; }      // прежний проект — одним файлом
			if (oldText.charCodeAt(0) === 0xFEFF) oldText = oldText.substring(1);
			var old = JSON.parse(oldText);
			if (old && old.format === 'benchmark-project') {
				doc.work = old.work || null;
				if (old.work && old.model && old.model.sig !== model.sig) doc.modelPrev = old.modelPrev || old.model;
				else doc.modelPrev = old.modelPrev || null;
			}
		}
	} catch (e4) { bmErr('старый проект', e4); }

	var exe = bmExePath(), win = winUp;
	var docText = JSON.stringify(doc), packed = null;
	if (stem) {
		bmWinStep(3, 'now', undefined, 'Собираю всё в один файл…');
		try { packed = bmPack(out, docText, stem, m3, BM_DIAG.uv); } catch (eP) { packed = { err: String(eP && eP.message ? eP.message : eP).substring(0, 200) }; }
	}
	try { if (!packed || !packed.ok) fs.writeFileSync(out, docText, 'utf8'); }
	catch (e5) {
		var msg = 'Не удалось записать файл проекта:\n' + out + '\n' + (e5 && e5.message ? e5.message : e5);
		if (win) { BM_WIN.st.done = 1; BM_WIN.st.fail = 1; BM_WIN.st.now = 'Проект не записан'; BM_WIN.st.err = msg; bmWinStep(3, 'bad'); return; }
		alert('STHGroup: ' + msg); return;
	}

	if (win) {
		/* предупреждения — в окне, под шагами */
		var warn = [];
		if (noMat) warn.push(noMat + ' ' + bmPlural(noMat, 'деталь', 'детали', 'деталей') + ' без материала — в раскрой не ' + (noMat === 1 ? 'попадёт' : 'попадут'));
		if (!m3.ok && stem) warn.push('3D-модель не сохранилась' + (m3.err ? ': ' + m3.err.substring(0, 90) : '') + ' — в программе модель нарисуется по деталям');
		if (BM_DIAG.uv && BM_DIAG.uv.err) warn.push('Развёртка текстур не прочиталась — текстуры лягут приблизительно');
		if (packed && packed.err) warn.push('Один файл не получился (' + packed.err + ') — 3D и текстуры лежат рядом с проектом отдельными файлами');
		if (BM_HIDDEN.count) warn.push('Скрытых панелей: ' + BM_HIDDEN.count + ' — в раскрой не идут');
		if (BM_DIAG.errors.length) warn.push('Ошибок чтения: ' + BM_DIAG.errors.length + ' — подробно в «Сведениях о выгрузке»');
		for (i = 0; i < warn.length; i++) BM_WIN.st.steps.push({ t: warn[i], st: 'warn' });
		BM_WIN.st.out = out; BM_WIN.st.exe = exe; BM_WIN.st.done = 1;
		BM_WIN.st.now = 'Выгружено за ' + Math.max(1, Math.round((new Date().getTime() - t0) / 1000)) + ' с';
		bmWinStep(3, 'ok', out.replace(/^.*[\\\/]/, ''));
		return;
	}
	if (!exe) {
		alert('Проект сохранён:\n' + out + '\n\nПрограмма STHGroup не найдена. Установите её или откройте файл проекта вручную.');
		return;
	}
	try { NewCOMObject('WScript.Shell').Run('"' + exe + '" "' + out + '"', 1, false); }
	catch (e6) { alert('Проект сохранён:\n' + out + '\n\nНе удалось запустить программу:\n' + exe); }
}

bmMain();
