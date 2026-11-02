// Стенд: имитация модели БАЗИСа для проверки скрипта выгрузки без самого БАЗИСа.
// node mock_bazis.js <out.bmk> [mode]   mode: '' | noarc | nohole | big | resave | est (облицовка, крепёж без имени, выделение — для сметы)
//   | pack — БАЗИС читает файлы байтами: проект одним файлом (zip внутри .bmk) с 3D, развёрткой и текстурами
const fs = require('fs'), vm = require('vm'), path = require('path');
const outFile = process.argv[2] || path.join(__dirname, 'out', 'sample.bmk');
const mode = process.argv[3] || '';
fs.mkdirSync(path.dirname(outFile), { recursive: true });

const V = (x, y, z) => ({ x, y, z });
function framed(o, fr) {
	// fr: { o:[x,y,z], x:[..], y:[..], z:[..] } — оси объекта в глобальных координатах
	o.ToGlobal = v => V(fr.o[0] + fr.x[0] * v.x + fr.y[0] * v.y + fr.z[0] * v.z, fr.o[1] + fr.x[1] * v.x + fr.y[1] * v.y + fr.z[1] * v.z, fr.o[2] + fr.x[2] * v.x + fr.y[2] * v.y + fr.z[2] * v.z);
	o.NToGlobal = v => V(fr.x[0] * v.x + fr.y[0] * v.y + fr.z[0] * v.z, fr.x[1] * v.x + fr.y[1] * v.y + fr.z[1] * v.z, fr.x[2] * v.x + fr.y[2] * v.y + fr.z[2] * v.z);
	o.__fr = fr;
	return o;
}
const line = (x1, y1, x2, y2) => ({ Pos1: { x: x1, y: y1 }, Pos2: { x: x2, y: y2 }, ElType: 1, IsLine: () => true, IsArc: () => false, ObjLength: () => Math.hypot(x2 - x1, y2 - y1) });

function contourOf(pathPts, shift) {
	const sx = shift ? shift[0] : 0, sy = shift ? shift[1] : 0, els = [], sample = [];
	let prev = pathPts[0];
	for (const it of pathPts.slice(1).concat([pathPts[0]])) {
		const to = Array.isArray(it) ? it : it.to;
		if (Array.isArray(it)) { els.push(line(prev[0] + sx, prev[1] + sy, to[0] + sx, to[1] + sy)); sample.push(prev, to); }
		else {
			const c = it.c, R = Math.hypot(prev[0] - c[0], prev[1] - c[1]);
			const a1 = Math.atan2(prev[1] - c[1], prev[0] - c[0]);
			let sw = Math.atan2(to[1] - c[1], to[0] - c[0]) - a1;
			while (sw <= 1e-9) sw += 2 * Math.PI;
			const ang = it.ccw ? sw : 2 * Math.PI - sw;
			for (let i = 0; i <= 40; i++) { const a = a1 + (it.ccw ? 1 : -1) * ang * i / 40; sample.push([c[0] + R * Math.cos(a), c[1] + R * Math.sin(a)]); }
			const arc = { Pos1: { x: prev[0] + sx, y: prev[1] + sy }, Pos2: { x: to[0] + sx, y: to[1] + sy }, ElType: 2, IsLine: () => false, IsArc: () => true, ObjLength: () => R * ang };
			if (mode !== 'noarc') { arc.Center = { x: c[0] + sx, y: c[1] + sy }; arc.ArcDir = !!it.ccw; }
			els.push(arc);
		}
		prev = to;
	}
	const xs = sample.map(q => q[0]), ys = sample.map(q => q[1]);
	return { Width: Math.max(...xs) - Math.min(...xs), Height: Math.max(...ys) - Math.min(...ys), Count: els.length, Objects: els, ObjLength: () => els.reduce((t, e) => t + e.ObjLength(), 0) };
}
const rectPath = (w, h) => [[0, 0], [w, 0], [w, h], [0, h]];

const LD = 'ЛДСП_16 мм Nordeco 2750x1830 Кашемир (Р)\r16 мм_Кашемир (Р)', DUB = 'ЛДСП Дуб Сонома', HDF = 'ХДФ Белый';
const edgeName = mat => 'Кромка ' + mat.split('\r')[0].replace(/^\S+\s+/, '') + ' 1.0x19' + (mat.indexOf('\r') > 0 ? '\r1.0 x 19_' + mat.split('_').pop() : '');
let farX = 20000;

// edges: индексы элементов контура с кромкой; для прямоугольника B=0 R=1 T=2 L=3
function panel(name, mat, th, pathPts, pos, des, edges, opt) {
	opt = opt || {};
	const C = contourOf(pathPts, opt.shift);
	const butts = (edges || []).map(i => ({ CutIndex: -1, ElemIndex: i, Material: edgeName(mat), Thickness: 1, Width: 19, Sign: '1/19', ClipPanel: true, Allowance: 1 }));   // как у автора: подрез и припуск на толщину кромки
	const cuts = (opt.cuts || []).map(c => ({ Name: c.name, Sign: c.sign || '', Thickness: c.th || 0, Trajectory: contourOpen(c.path), Contour: { Width: c.w, Height: c.d, Count: 0, Objects: [] }, FrontSide: c.fs === undefined ? true : !!c.fs, Params: { Depth: c.d, Width: c.w } }));
	const plast = (opt.plastics || []).map(x => ({ Material: x.mat, Thickness: x.th, TextureOrientation: 0 }));
	const o = { [Symbol.toStringTag]: opt.cls || 'TFurnPanel', Name: name, AsPanel: true, List: false, MaterialName: mat, MaterialWidth: opt.linear ? 60 : 0, Thickness: th, Contour: C,
		TextureOrientation: opt.tex === undefined ? 0 : opt.tex, ArtPos: pos, Designation: des, Selected: !!opt.sel, Owner: opt.owner || null,
		IsVisible: () => !opt.hidden, Butts: Object.assign(butts.slice(), { Count: butts.length }), Cuts: Object.assign(cuts.slice(), { Count: cuts.length }), Plastics: Object.assign(plast, { Count: plast.length }) };
	if (opt.ff !== undefined) o.FrontFace = opt.ff;
	const fr = opt.frame || { o: [(farX += 3000), 0, 0], x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
	return framed(o, fr);
}
function contourOpen(pts) {
	const els = [];
	for (let i = 0; i + 1 < pts.length; i++) els.push(line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]));
	return { Count: els.length, Objects: els, ObjLength: () => els.reduce((t, e) => t + e.ObjLength(), 0) };
}
const IDENT = { o: [0, 0, 0], x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
function fastener(name, holes, opt) {
	opt = opt || {};
	const items = (mode === 'nohole') ? [] : holes.map(h => ({ Position: V(...h.p), Direction: V(...h.d), Diameter: h.dia, Depth: h.depth, DrillMode: h.through ? 1 : 0 }));
	const o = { [Symbol.toStringTag]: opt.cls || 'TFastener', Name: name, AsPanel: false, List: false, Selected: !!opt.sel, IsVisible: () => !opt.hidden, Holes: { Count: items.length, Items: items } };
	if (opt.forEstimate !== undefined) o.ForEstimate = opt.forEstimate;
	if (opt.note) o.Note = opt.note;
	return framed(o, IDENT);
}
function block(name, children, owner, opt) {
	opt = opt || {};
	const b = Object.assign(children.slice(), { [Symbol.toStringTag]: opt.cls || 'TFurnBlock', Name: name, List: true, AsPanel: false, Count: children.length, Selected: !!opt.sel, Owner: owner || null, IsVisible: () => !opt.hidden });
	if (opt.forEstimate !== undefined) b.ForEstimate = opt.forEstimate;
	if (opt.au !== undefined) b.IsAssemblyUnit = !!opt.au;
	if (opt.pos) b.ArtPos = opt.pos;
	if (opt.des) b.Designation = opt.des;
	children.forEach(c => { c.Owner = b; });
	return b;
}
/* покупное тело (ручка, направляющая): не панель и не крепёж */
function body(name, opt) {
	opt = opt || {};
	/* сетка — брусок 120×20×30 из треугольников (4 списка по 3 треугольника), в своих осях; ставится в точку opt.at */
	const at = opt.at || [0, 0, 0], sz = opt.size || [120, 20, 30];
	const q = (a, b, c, d) => [a, b, c, a, c, d];
	const P = (i) => V(i & 1 ? sz[0] : 0, i & 2 ? sz[1] : 0, i & 4 ? sz[2] : 0);
	const faces = [q(0, 1, 3, 2), q(4, 6, 7, 5), q(0, 4, 5, 1), q(2, 3, 7, 6), q(0, 2, 6, 4), q(1, 5, 7, 3)].reduce((a, f) => a.concat(f), []);
	const lists = [0, 1, 2, 3].map(k => {
		const vs = faces.slice(k * 9, k * 9 + 9).map(P), L = { Count: vs.length, Vertices: vs };
		/* у списка — материал с текстурой и треугольники с развёрткой (как в БАЗИСе: мм, матрица 1/1000 и −1/1000) */
		L.Material = { MaterialName: 'Сталь', Path: 'Стекло, Метал\\Сталь.jpg', DiffuseColor: 12632256, TransparentValue: 0, MirrorValue: 0.3, ShinessValue: 25.6, BrightValue: 0.3, TexSX: 1000, TexSY: 1000, TexDX: 0, TexDY: 0, Angle: 0, Stretch: false, ColorUse: false };
		L.TextureMatrix = { Matrix: [0.001, 0, 0, 0, 0, -0.001, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] };
		for (let t = 0; t < vs.length / 3; t++) { const a = vs[t * 3], b = vs[t * 3 + 1], c = vs[t * 3 + 2]; L[t] = { Vertex1: a, Vertex2: b, Vertex3: c, TexCoord1: { x: a.x, y: a.y + a.z }, TexCoord2: { x: b.x, y: b.y + b.z }, TexCoord3: { x: c.x, y: c.y + c.z } }; }
		L.Count = vs.length / 3;
		return L;
	});
	const fr = { o: at, x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
	const o = { [Symbol.toStringTag]: opt.cls || 'TModel3DS', Name: name, AsPanel: false, List: false, Selected: !!opt.sel, IsVisible: () => !opt.hidden };
	if (!opt.noMesh) { o.TriListsCount = 4; o.TriLists = lists; }
	o.GMin = V(at[0], at[1], at[2]); o.GMax = V(at[0] + sz[0], at[1] + sz[1], at[2] + sz[2]);
	return framed(o, fr);
}
/* профиль выдавливанием: длина — его «толщина» */
function extrusion(mat, len, opt) {
	opt = opt || {};
	const at = opt.at || [0, -40, 0];
	return framed({ [Symbol.toStringTag]: 'TExtrusionBody', Name: 'Профиль', MaterialName: mat, Thickness: len, AsPanel: false, List: false, Selected: !!opt.sel, IsVisible: () => !opt.hidden,
		GMin: V(at[0], at[1], at[2]), GMax: V(at[0] + len, at[1] + 20, at[2] + 20) }, IDENT);
}
function trajectory(mat, len) {
	return framed({ [Symbol.toStringTag]: 'T2DTrajectoryBody', Name: 'Плинтус', MaterialName: mat, AsPanel: false, List: false, Selected: false, IsVisible: () => true,
		Contour2D: { Width: 18, Height: 40 }, Trajectory2D: { ObjLength: () => len } }, IDENT);
}
function rotation(mat, w, h) {
	return framed({ [Symbol.toStringTag]: 'T2DRotationBody', Name: 'Труба', MaterialName: mat, AsPanel: false, List: false, Selected: false, IsVisible: () => true, Contour2D: { Width: w, Height: h } }, IDENT);
}

const top = [];
let blk = 0;
function box(wd, ht, dp, withShelf, bx) {
	blk++;
	const b = (blk < 10 ? '0' : '') + blk; let n = 0;
	const d = () => b + '_' + ((++n < 10 ? '0' : '') + n);
	const kids = [], T = 16;
	const groove = { name: 'Паз под заднюю стенку', sign: '4x8', w: 4, d: 8, path: [[dp - 20, 0], [dp - 20, ht]] };
	// боковины: контур глубина x высота, текстура по высоте (вертикально)
	kids.push(panel('Боковина левая', LD, T, rectPath(dp, ht), '1', d(), [0, 2, 3], { tex: 2, cuts: [groove], frame: { o: [bx, 0, 0], x: [0, 1, 0], y: [0, 0, 1], z: [1, 0, 0] } }));
	kids.push(panel('Боковина правая', LD, T, rectPath(dp, ht), '2', d(), [0, 2, 3], { tex: 2, cuts: [groove], frame: { o: [bx + wd - T, 0, 0], x: [0, 1, 0], y: [0, 0, 1], z: [1, 0, 0] } }));
	kids.push(panel('Дно', LD, T, rectPath(wd - 2 * T, dp), '3', d(), [0], { tex: 1, frame: { o: [bx + T, 0, 0], x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] } }));
	kids.push(panel('Крышка', LD, T, rectPath(wd - 2 * T, dp), '4', d(), [0], { tex: 1, frame: { o: [bx + T, 0, ht - T], x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] } }));
	if (withShelf) kids.push(panel('Полка съёмная', LD, T, rectPath(wd - 2 * T - 2, dp - 20), '5', d(), [0], { tex: 1, frame: { o: [bx + T + 1, 0, Math.round(ht / 2)], x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] } }));
	kids.push(panel('Планка цокольная', LD, T, rectPath(wd - 2 * T, 96), '6', d(), [], { tex: 1 }));
	kids.push(panel('Задняя стенка', HDF, 3, rectPath(ht - 4, wd - 4), '7', d(), [], { tex: 0, frame: { o: [bx + 2, dp - 12, 2], x: [0, 0, 1], y: [1, 0, 0], z: [0, 1, 0] } }));
	// конфирматы: боковина (сквозное 7 мм) + торец дна/крышки (5 мм на 34)
	for (const z of [T / 2, ht - T / 2]) for (const y of [50, dp - 50]) {
		kids.push(fastener('Конфирмат 7,0 X 50\rKON 7,0X50', [{ p: [bx, y, z], d: [1, 0, 0], dia: 7, depth: T, through: 1 }, { p: [bx + T, y, z], d: [1, 0, 0], dia: 5, depth: 34 }]));
		kids.push(fastener('Конфирмат 7,0 X 50\rKON 7,0X50', [{ p: [bx + wd, y, z], d: [-1, 0, 0], dia: 7, depth: T, through: 1 }, { p: [bx + wd - T, y, z], d: [-1, 0, 0], dia: 5, depth: 34 }]));
	}
	// полкодержатели: 4 глухих отверстия во внутренних пластях боковин
	if (withShelf) for (const y of [60, dp - 80]) {
		const z = Math.round(ht / 2) - 3;
		kids.push(fastener('Полкодержатель 5 мм', [{ p: [bx + T, y, z], d: [-1, 0, 0], dia: 5, depth: 12 }]));
		kids.push(fastener('Полкодержатель 5 мм', [{ p: [bx + wd - T, y, z], d: [1, 0, 0], dia: 5, depth: 12 }]));
	}
	top.push(block('Шкаф ' + blk + ' (' + wd + ')', kids, null, { au: true, pos: String(blk), des: '0' + blk }));       // сборочная единица (скрипт 1.9)
}
let bx = 0;
for (const [wd, ht, dp, sh] of [[600, 720, 560, 1], [800, 720, 560, 1], [450, 720, 560, 0], [600, 2140, 570, 1], [900, 720, 300, 1], [600, 360, 300, 0], [300, 720, 560, 1], [1000, 818, 515, 1]]) { box(wd, ht, dp, sh, bx); bx += wd + 50; }
if (mode === 'big') for (let i = 0; i < 14; i++) { box([300, 400, 450, 500, 600, 800, 900][i % 7], i % 3 ? 720 : 912, i % 4 ? 560 : 320, i % 2, bx); bx += 1000; }

// отдельные детали
const misc = [];
misc.push(panel('Вставка', LD, 16, rectPath(100, 60), '7', '08_08', [], { tex: 1 }));
misc.push(panel('Ножка-опора декоративная', LD, 16, rectPath(60, 320), '8', '08_09', [1, 3], { tex: 2 }));
for (let i = 0; i < 3; i++) misc.push(panel('Полка стационарная', LD, 16, rectPath(472, 400), '9', '08_10', i ? [2] : [0, 2], { tex: 1 }));
misc.push(panel('Стойка', LD, 16, rectPath(65, 472), '10', '08_11', [1, 3], { tex: 2 }));
misc.push(panel('Перемычка', LD, 16, rectPath(222.5, 472), '11', '08_12', [0], { tex: 2 }));
// деталь, которой текстура задана поперёк длинной стороны
misc.push(panel('Царга поперечная', LD, 16, rectPath(600, 140), '12', '08_13', [0, 2], { tex: 2 }));
// без позиции и обозначения
misc.push(panel('Деталь без номера', LD, 16, rectPath(300, 200), '', '', [], { tex: 1 }));
// криволинейные
misc.push(panel('Дно угловое', LD, 16, [[0, 0], [868, 0], [868, 468], [468, 868], [0, 868]], '12', '13_01', [2, 1], { tex: 1, shift: [-100, 40] }));
misc.push(panel('Крышка угловая', LD, 16, [[0, 0], [868, 0], [868, 468], [468, 868], [0, 868]], '13', '13_02', [2], { tex: 1 }));
for (let i = 0; i < 2; i++) misc.push(panel('Боковина фигурная левая', LD, 16, [[0, 0], [560, 0], [560, 520], { to: [360, 720], c: [560, 720], ccw: false }, [0, 720]], '14', '13_03', [3, 1], { tex: 2 }));
for (let i = 0; i < 2; i++) misc.push(panel('Полка радиусная', LD, 16, [[0, 0], [310, 0], { to: [560, 250], c: [310, 250], ccw: true }, [560, 300], [0, 300]], '15', '13_04', [1, 2], { tex: 1 }));
for (let i = 0; i < 2; i++) misc.push(panel('Боковина скошенная', LD, 16, [[0, 0], [1800, 0], [1800, 250], [0, 560]], '16', '13_05', [0], { tex: 1 }));
misc.push(panel('Боковина скошенная правая', LD, 16, [[0, 0], [1800, 0], [1800, 560], [0, 250]], '17', '13_06', [0], { tex: 1 }));
misc.push(panel('Дно Г-образное', LD, 16, [[0, 0], [870, 0], [870, 300], [300, 300], [300, 870], [0, 870]], '18', '13_07', [2, 3], { tex: 1 }));
misc.push(panel('Крышка Г-образная', LD, 16, [[0, 0], [870, 0], [870, 300], [300, 300], [300, 870], [0, 870]], '19', '13_08', [2, 3], { tex: 1 }));
misc.push(panel('Косынка', LD, 16, [[0, 0], [360, 0], [0, 360]], '20', '13_09', [], { tex: 1 }));
misc.push(panel('Задняя стенка угловая', HDF, 3, [[0, 0], [700, 0], [700, 400], [400, 700], [0, 700]], '21', '13_10', [], { tex: 0 }));
// круг: контур из одной окружности
{
	const r = 200, el = { Center: { x: 50, y: 70 }, CirRadius: r, ElType: 3, IsLine: () => false, IsArc: () => false, ObjLength: () => 2 * Math.PI * r };
	const o = { Name: 'Заглушка круглая', AsPanel: true, List: false, MaterialName: HDF, MaterialWidth: 0, Thickness: 3, Contour: { Width: 2 * r, Height: 2 * r, Count: 1, Objects: [el], ObjLength: () => 2 * Math.PI * r },
		TextureOrientation: 0, ArtPos: '22', Designation: '13_11', Selected: false, IsVisible: () => true, Butts: Object.assign([], { Count: 0 }), Cuts: Object.assign([], { Count: 0 }), Plastics: Object.assign([], { Count: 0 }) };
	misc.push(framed(o, { o: [(farX += 3000), 0, 0], x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }));
}
// панель с внутренним вырезом (окно) — вырез: вторая замкнутая петля в контуре
{
	const p = panel('Фасад с окном', DUB, 16, rectPath(716, 396), '12', '09_12', [0, 1, 2, 3], { tex: 1 });
	const win = [[150, 100], [566, 100], [566, 296], [150, 296]];
	for (let i = 0; i < 4; i++) p.Contour.Objects.push(line(win[i][0], win[i][1], win[(i + 1) % 4][0], win[(i + 1) % 4][1]));
	p.Contour.Count = p.Contour.Objects.length;
	misc.push(p);
}
top.push(block('Отдельные детали', misc));

// фасады: текстура по высоте, чашки петель 35 мм с тыльной стороны
const fac = [];
for (let i = 1; i <= 9; i++) {
	const w = i % 2 ? 396 : 596, fr = { o: [(farX += 3000), 0, 0], x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
	fac.push(panel('Фасад распашной ' + i, DUB, 16, rectPath(w, 716), String(i), '09_' + (i < 10 ? '0' : '') + i, [0, 1, 2, 3], { tex: 2, frame: fr, sel: i <= 3 }));
	for (const y of [100, 616]) fac.push(fastener('Петля накладная\rZM-ECHC09BEO', [{ p: [fr.o[0] + 22.5, y, 0], d: [0, 0, 1], dia: 35, depth: 13 }, { p: [fr.o[0] + 32, y - 24, 0], d: [0, 0, 1], dia: 2.5, depth: 3 }, { p: [fr.o[0] + 32, y + 24, 0], d: [0, 0, 1], dia: 2.5, depth: 3 }]));
}
for (let i = 0; i < 2; i++) fac.push(panel('Фасад ящика', DUB, 16, rectPath(596, 140), '10', '09_10', [0, 1, 2, 3], { tex: 1 }));
fac.push(panel('Фасад с полукругом', DUB, 16, [[0, 0], [600, 0], { to: [600, 400], c: [600, 200], ccw: true }, [0, 400]], '11', '09_11', [1, 0, 2], { tex: 1 }));
top.push(block('Фасады', fac));

// то, что в раскрой листов не идёт: погонное, скрытое, раскрой сметы в модели
top.push(panel('Столешница', 'Стол. Slotex Dominicana', 40, rectPath(2400, 600), '1', '10_01', [0], { linear: 1 }));
top.push(panel('Скрытая деталь', LD, 16, rectPath(500, 500), '99', '99_01', [], { hidden: 1 }));
top.push(panel('@Р Дно | 568x560', LD, 16, rectPath(568, 560), '', '', []));

// ---- то, что нужно смете: комплекты, покупные тела, профили, погонное, скрытый блок ----
{
	const furn = [];
	// комплект направляющих: два одинаковых тела и свой крепёж (в смету идёт комплект, а не его части)
	for (let i = 0; i < 4; i++) furn.push(block('Направляющие скрытого монтажа 500\rGTV-500', [body('Направляющая 500'), body('Направляющая 500'), fastener('Шуруп 3,5x16', [])], null, { cls: 'TFurnAsm' }));
	// ручки: комплект из одного тела
	for (let i = 0; i < 12; i++) furn.push(block('Ручка-скоба 128 мм\rRS-128', [body('Ручка-скоба 128 мм', { at: [i * 200, 800, 0], size: [128, 10, 30] })], null, { cls: 'TAsmKit' }));
	// комплект, который в смету не идёт
	furn.push(block('Макет техники', [body('Духовой шкаф', { noMesh: 1, at: [0, 0, 1000], size: [595, 595, 550] })], null, { cls: 'TAsmKit', forEstimate: false }));
	// крепёж без отверстий и крепёж, исключённый из сметы
	for (let i = 0; i < 6; i++) furn.push(fastener('Заглушка конфирмата белая', []));
	furn.push(fastener('Шаблон сверления', [], { forEstimate: false }));
	// профили: выдавливание (хлысты) и по траектории
	for (const L of [2380, 1200, 600, 600]) furn.push(extrusion('Профиль-ручка Gola L\rGOLA-L', L));
	furn.push(extrusion('Профиль торцевой 16 мм L=3000', 1764));
	furn.push(trajectory('Плинтус кухонный 4 м', 2460));
	furn.push(rotation('Труба хром 25', 25, 764));
	top.push(block('Фурнитура', furn));
	// скрытый блок: панель и крепёж в нём по умолчанию не считаются
	top.push(block('Скрытый шкаф', [panel('Полка скрытая', LD, 16, rectPath(400, 300), '98', '98_01', [0]),
		fastener('Полкодержатель 5 мм', [{ p: [90000, 0, 0], d: [1, 0, 0], dia: 5, depth: 12 }])], null, { hidden: 1 }));
}
if (mode === 'est' || mode === 'fac') {
	const ex = [];
	// панель с облицовкой пласти
	ex.push(panel('Фасад с пластиком', 'МДФ 16 мм', 16, rectPath(700, 400), '30', '30_01', [0, 1, 2, 3], { tex: 0, plastics: [{ mat: 'Пластик HPL Белый\rHPL-0101', th: 0.8 }] }));
	// отверстия «без крепежа»: название из одних размеров — в фурнитуру не идёт, в отверстия идёт
	for (let i = 0; i < 5; i++) ex.push(fastener('\u00D85x12', [{ p: [95000 + i * 32, 0, 0], d: [0, 0, 1], dia: 5, depth: 12 }]));
	// объект с отверстиями, который крепежом не является (в отверстия сметы не идёт)
	ex.push(fastener('Розетка', [{ p: [96000, 0, 0], d: [0, 0, 1], dia: 60, depth: 16, through: 1 }], { cls: 'TFurnBlock' }));
	// выделенный блок: при «только выделенное» считается только он и выделенные фасады
	ex.push(block('Выделенный блок', [fastener('Стяжка эксцентриковая 15', [{ p: [97000, 0, 0], d: [0, 0, 1], dia: 15, depth: 13 }]), fastener('Стяжка эксцентриковая 15', [{ p: [97100, 0, 0], d: [0, 0, 1], dia: 15, depth: 13 }]),
		extrusion('Профиль-ручка Gola L\rGOLA-L', 900)], null, { sel: 1 }));
	// кромка разной толщины на одной панели: 0,4 и 2 мм, одна сторона криволинейная
	{
		const p = panel('Столешница фигурная', 'ЛДСП Белый', 25, [[0, 0], [900, 0], [900, 400], { to: [700, 600], c: [700, 400], ccw: true }, [0, 600]], '31', '31_01', [0, 1, 2, 3, 4], { tex: 0 });
		p.Butts[0].Material = 'Кромка белая 0.4x28'; p.Butts[0].Thickness = 0.4; p.Butts[0].Width = 28;
		for (let i = 1; i < 5; i++) { p.Butts[i].Material = 'Кромка белая 2x28'; p.Butts[i].Thickness = 2; p.Butts[i].Width = 28; }
		ex.push(p);
	}
	// выемка без длины (в смете — штуками)
	ex.push(panel('Полка с выемкой', LD, 16, rectPath(500, 300), '32', '32_01', [0], { tex: 1, cuts: [{ name: 'Выемка под петлю', sign: '', w: 35, d: 12, path: [] }] }));
	top.push(block('Для сметы', ex));
	/* заказные фасады — полуфабрикаты из профиля и стекла (как «Фасад Макро ПР-2» в модели автора):
	   у блока свой габарит (GSize) и оси; внутри — четыре профиля, стекло и отверстия под петли */
	const macro = (name, w, h, x0, sel, alu) => {
		const fr = { o: [x0, 0, 0], x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
		/* петли для алюминиевых рамок (как у автора): чашек нет, ответная планка сверлится в боковину шкафа —
		   её отверстия лежат вне толщины фасада; группа петель — свой блок без слова «петля» в названии */
		const hinges = alu ? [block('04. CLIP top BLUMOTION для Алюмин. рамок, 95° Накладная (100)', [100, h - 100].map(y => block('Петля Blum CLIP top BLUMOTION для алюмин. рамок, 95° Накладная.',
			[fastener('Blum CLIP ответная планка сам, 0 мм. Прямая.', [{ p: [x0 + 14.5, y, -52], d: [-1, 0, 0], dia: 3, depth: 2 }, { p: [x0 + 14.5, y, -20], d: [-1, 0, 0], dia: 3, depth: 2 }]), block('Чашка', [])])))] : [];
		const kids = hinges.concat([extrusion('Профиль макро\rПР-1_чм', h), extrusion('Профиль макро\rПР-1_чм', h), extrusion('Профиль макро\rПР-1_чм', w), extrusion('Профиль макро\rПР-1_чм', w),
			panel('Стекло', 'Стекло прозрачное 5мм', 5, rectPath(w - 38, h - 38), '', '', [], { tex: 0, frame: { o: [x0 + 19, 19, 8], x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] } }),
			fastener('Отверстие под петлю', [{ p: [x0 + 10, 100, 0], d: [0, 0, 1], dia: 8, depth: 10 }])]);
		const b = framed(block(name, kids, null, { cls: 'TFurnFacade', sel }), fr);
		b.GSize = V(w, h, 20);
		return b;
	};
	const cab = [panel('Боковина шкафа с витриной', LD, 16, rectPath(560, 716), '40', '40_01', [0], { tex: 2 })];
	cab.push(macro('Фасад Макро ПР-2\r@Фасад Макро', 396, 716, 120000, 1), macro('Фасад Макро ПР-2\r@Фасад Макро', 396, 716, 121000), macro('Фасад Макро ПР-2\r@Фасад Макро', 596, 140, 122000), macro('Фасад Макро ПР-1\r@Фасад Макро ПР-1', 446, 716, 123000, 0, 1));
		top.push(block('Шкаф с витриной\r@Шкаф с витриной', cab));
	/* фасады МДФ в плёнке и эмали (как «Образец 1–3» в модели автора): облицовка пласти толщиной 0 мм,
	   «Лицевая сторона» = 1, чашки петель сверлятся с тыльной стороны (z = 16, внутрь панели) */
	const tv = [], HINGE = 'Петля Blum CLIP top BLUMOTION 110° Накладная';
	const mdf = (name, mat, coats, x0) => {
		const fr = { o: [x0, 0, 0], x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
		tv.push(panel(name, mat, 16, rectPath(496, 2498), '', '', [0, 1, 2, 3], { tex: 2, frame: fr, ff: 1, plastics: coats.map(c => ({ mat: c + '\rнет', th: 0 })) }));
		for (const y of [100, 865, 1633, 2398]) tv.push(fastener(HINGE, [{ p: [x0 + 21.5, y, 16], d: [0, 0, -1], dia: 35, depth: 13 }, { p: [x0 + 31, y - 22.5, 16], d: [0, 0, -1], dia: 2.5, depth: 3 }, { p: [x0 + 31, y + 22.5, 16], d: [0, 0, -1], dia: 2.5, depth: 3 }], { note: 'Магазин фурнитуры' }));
	};
	mdf('Фасад (Образец 1)', 'МДФ 16 мм (1ст.)', ['Кальцит Р-842 UPL'], 530700);
	mdf('Фасад (Образец 2)', 'МДФ 16 мм (2ст.)', ['Эмаль NCS S 1002-Y50R Глянец'], 531700);
	mdf('Фасад (Образец 3)', 'МДФ 16 мм (2ст.)', ['Эмаль RAL 5014 матовая', 'Эмаль RAL 5014 матовая'], 532700);
	/* «Образец 4» — фасад МДФ в эмали, заказанный готовым (как «Образец 1» у автора): блок с артикулом
	   «@Заказной фасад», внутри — панель МДФ с облицовкой 0 мм и блок «Петли накладные» с пятью петлями.
	   Только в образце fac.bmk (est + этот фасад), чтобы прежние проверки сметы не менялись. */
	if (mode === 'fac') {
		const x4 = 533700, fr4 = { o: [x4, 0, 0], x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
		const p4 = panel('Фасад', 'МДФ 16 мм (2ст.)', 16, rectPath(496, 2498), '', '', [0, 1, 2, 3], { tex: 2, frame: fr4, ff: 1, plastics: [{ mat: 'Эмаль RAL 9003 матовая\rнет', th: 0 }] });
		/* у петли — своя анимация (плечо поворачивается на 40°), у фасада — поворот на 100° вокруг левой кромки (как в БАЗИСе) */
		const h4 = [100, 700, 1249, 1800, 2398].map(y => { const h = framed(block(HINGE + '.', [fastener('тело петли', [{ p: [x4 + 21.5, y, 16], d: [0, 0, -1], dia: 35, depth: 13 }]), fastener('Blum CLIP ответная планка евр, 0 мм. Прямая.', [])], null, { cls: 'TFurnAsm' }), { o: [x4 + 21.5, y, 16], x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] });
			h.Animation = { AnimType: 1, DoorAngle: 40, DoorShift: 0, AxisStart: V(-4, 16, 8.6), AxisEnd: V(-4, 16, -8.6), Distance: 17.2, Duration: 1, AnimPos: 0 }; return h; });
		/* размеры, проставленные в БАЗИСе (TSize3D, скрипт 1.10): ширина фасада по низу и скрытый — не выгружается */
		const dim = (nm, w, hid) => framed({ [Symbol.toStringTag]: 'TSize3D', Name: nm, List: false, AsPanel: false, SecondPosLocal: V(w, 0, 0), Value: w, TextSize: 20, TextOffset: 0, SignOffset: 1, TextString: '', IsVisible: () => !hid }, { o: [x4, 0, 16], x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] });
		const b4 = framed(block('Образец 4\r@Заказной фасад', [p4, block('Петли накладные', h4), dim('Размер1', 496), dim('Размер2', 300, true)]), fr4);
		b4.GSize = V(496, 2498, 16); b4.GMin = V(0, 0, 0); b4.GMax = V(496, 2498, 16);
		b4.Animation = { AnimType: 1, DoorAngle: 100, DoorShift: 16, AxisStart: V(0, 2498, 16), AxisEnd: V(0, 0, 16), Distance: 2498, Duration: 0.8, AnimPos: 0 };
		tv.push(b4);
	}
	top.push(block('ТВ-зона', tv));
}

// ---- запуск скрипта выгрузки ----
const written = {};
if (mode === 'resave' && fs.existsSync(outFile)) written['C:\\Проекты\\СМД001_Кухня Северная Венеция.bmk'] = process.env.BM_MOCK_PACK === '1' ? fs.readFileSync(outFile) : fs.readFileSync(outFile, 'utf8');
const PACK = mode === 'pack' || process.env.BM_MOCK_PACK === '1';
const bytesOf = d => typeof d === 'string' ? Buffer.from(d) : Buffer.from(d.buffer, d.byteOffset || 0, d.length);
const kids = p => Object.keys(written).filter(k => k.startsWith(p + '\\')).map(k => k.slice(p.length + 1).split('\\')[0]).filter((v, i, a) => a.indexOf(v) === i);
const fakeFs = { existsSync: p => p in written || kids(p).length > 0,
	readFileSync: (p, enc) => { const d = written[p]; if (!PACK || d === undefined) return d; if (enc) return typeof d === 'string' ? d : bytesOf(d).toString(enc); return bytesOf(d); },
	writeFileSync: (p, d) => { written[p] = d; }, statSync: p => ({ size: written[p] === undefined || written[p] === '<папка>' ? 0 : bytesOf(written[p]).length, isDirectory: () => written[p] === '<папка>' || kids(p).length > 0 }),
	mkdirSync: p => { written[p] = '<папка>'; }, readdirSync: p => { if (!PACK) throw new Error('нет readdirSync'); return kids(p); },
	unlinkSync: p => { delete written[p]; }, rmdirSync: p => { if (kids(p).length) throw new Error('папка не пуста'); delete written[p]; } };
/* 3D-файл модели: скрипт просит БАЗИС сохранить его; здесь — только отметка (сам файл делает test/mock_glb.js) */
const glbCalls = [];
const mio = { ExportModelMeshFormat: (m, f) => { glbCalls.push(f); written[f] = PACK ? Buffer.from('glTF-байты') : 'glTF';
	if (PACK) { const td = f.replace(/\.glb$/, '_textures'); written[td] = '<папка>'; written[td + '\\Дерево'] = '<папка>'; written[td + '\\Дерево\\дуб.jpg'] = Buffer.from([0xFF, 0xD8, 0xFF, 1, 2, 3]); } }, fileType: {} };
const ran = [], alerts = []; let winDir = '';
written['C:\\A\\STHGroup Cutting\\exe.txt'] = 'C:\\Program Files\\STHGroup Cutting\\STHGroup Cutting.exe';
const ctx = { console, Math, JSON, Date, String, Number, Object, isNaN, isFinite, Array,
	Model: { Count: top.length, Objects: top },
	Article: { Name: 'СМД001_Кухня', OrderName: 'Северная Венеция', OrderCode: '', Code: 'СМД001-26', Notes: 'Цоколь 100 мм, ручки Gola', ExtraInfo: {} },
	modelIOOperations: mode === 'no3d' ? undefined : mio,
	Action: { ModelFilename: 'C:\\Проекты\\СМД001_Кухня Северная Венеция.b3d' },
	NewVector: V, NewCOMObject: () => ({ Run: c => {
		/* окно хода выгрузки (mshta): по умолчанию «нет mshta» — всё как раньше; в режиме win окно «открылось» */
		if (/^mshta/.test(c)) { if (mode !== 'win') throw new Error('mshta недоступна'); const d = c.match(/"(.*)\\window\.hta"/)[1]; written[d + '\\alive.txt'] = 'ok'; winDir = d; }
		/* STHGroup: скрипт ждёт ответа окна данных заказа (пауза — ping); «человек» отвечает из BM_MOCK_ANSWER или закрывает окно (BM_MOCK_CANCEL) */
		if (/ping -n/.test(c) && winDir) {
			if (process.env.BM_MOCK_CANCEL) written[winDir + '\\cancel.txt'] = 'cancel';
			else { const t = process.env.BM_MOCK_ANSWER || '{"customer":"Северная Венеция","orderNo":"STH-1167","title":"Кухня CAA003","note":"срочно","choice":"open"}'; written[winDir + '\\answer.txt'] = Buffer.concat([Buffer.from([0xFF, 0xFE]), Buffer.from(t, 'utf16le')]); }
		}
		ran.push(c); return 0; }, RegRead: () => 'C:\\Program Files\\BazisReborn' }),
	alert: m => alerts.push(m), require: n => { if (n === 'fs') return fakeFs; throw new Error('require ' + n); }, process: { env: { TEMP: 'C:\\T', APPDATA: 'C:\\A' } } };
ctx.TextureOrientation = { None: 0, Horizontal: 1, Vertical: 2 };
vm.createContext(ctx);
ctx.Symbol = Symbol;
module.exports = { top, ctx, written, ran };                              // для сверки со скриптом «СМЕТА»: та же модель
if (process.env.BM_MOCK_ONLY) return;
// SCRIPT=путь — выполнить другой файл скрипта (например, латинскую копию из установщика: она должна выгружать то же самое)
vm.runInContext(fs.readFileSync(process.env.SCRIPT || path.join(__dirname, '..', 'bazis', 'STHGroup_Export.js'), 'utf8'), ctx, { filename: 'STHGroup_Export.js' });
const keys = Object.keys(written);
if (!keys.length) { console.log('файл не записан; сообщения:', alerts); process.exit(1); }
if (!keys.some(k => /\.bmk$/.test(k))) { console.log('проект не записан' + (alerts.length ? ': ' + alerts.join('; ') : ' (выгрузку отменили)')); if (outFile) try { fs.unlinkSync(outFile); } catch (e) { /* не было */ } return; }
if (process.env.BM_MOCK_DUMP) { fs.mkdirSync(process.env.BM_MOCK_DUMP, { recursive: true }); keys.forEach(k => { const d = written[k]; fs.writeFileSync(path.join(process.env.BM_MOCK_DUMP, k.replace(/^.*\\/, '')), typeof d === 'string' ? d : Buffer.from(d.buffer || d)); }); }
const bmkKey = keys.filter(k => /\.bmk$/.test(k)).pop() || keys[keys.length - 1], raw = written[bmkKey];
/* проект одним файлом (zip без сжатия): project.json — из архива */
function unzipStored(b, name) {
	let e = b.length - 22; while (e >= 0 && b.readUInt32LE(e) !== 0x06054b50) e--;
	let n = b.readUInt16LE(e + 10), o = b.readUInt32LE(e + 16); const out = {};
	for (let i = 0; i < n; i++) { const sz = b.readUInt32LE(o + 20), nl = b.readUInt16LE(o + 28), lo = b.readUInt32LE(o + 42), nm = b.slice(o + 46, o + 46 + nl).toString('utf8'); const st = lo + 30 + b.readUInt16LE(lo + 26) + b.readUInt16LE(lo + 28); out[nm] = b.slice(st, st + sz); o += 46 + nl + b.readUInt16LE(o + 30) + b.readUInt16LE(o + 32); }
	return name ? out[name] : out;
}
const rawB = bytesOf(raw), packed = rawB[0] === 0x50 && rawB[1] === 0x4B, text = packed ? unzipStored(rawB, 'project.json').toString('utf8') : (typeof raw === 'string' ? raw : rawB.toString('utf8'));
fs.writeFileSync(outFile, packed ? rawB : text);
if (packed) console.log('одним файлом:', Object.keys(unzipStored(rawB)).join(', '), '| отдельных файлов осталось:', keys.filter(k => /— 3D\.(glb|uv)$|_textures/.test(k)).length);
module.exports.unzipStored = unzipStored;
const doc = JSON.parse(text), d = doc.model.diag;
console.log('записан', bmkKey, '→', outFile, (text.length / 1024).toFixed(0) + ' КБ');
console.log('деталей', doc.model.parts.length, '| выделено', doc.model.selected, '| отверстий', doc.model.holes.length, '| подпись', doc.model.sig, '| прежняя модель', doc.modelPrev ? 'есть' : 'нет');
console.log('для сметы: фурнитура', JSON.stringify(doc.model.fast.map(x => x.name + ' ×' + x.n + (x.hid ? ' скр.' : '') + (x.sel ? ' выд.' : ''))), '| комплекты', JSON.stringify(doc.model.kits.map(x => x.name + ' ×' + x.n + '/' + x.pcs)), '| профили', JSON.stringify(doc.model.prof.map(x => x.name + ' ' + x.len + '×' + x.n)), '| погонные', JSON.stringify(doc.model.lin), '| скрыто', JSON.stringify(doc.model.hidden));
console.log('диагностика: панелей', d.panels, 'погонных', d.skippedLinear, 'скрытых', d.skippedHidden, 'раскрой сметы', d.skippedOurs, '| дуг', d.arcs, 'без центра', d.arcNoCenter, '| окружностей', d.circles, '| крепежа', d.fasteners, '| систем координат', d.frames, '| пазов', d.cuts, '| кромок', d.butts, '| текстура', JSON.stringify(d.texSeen), '| ошибок', d.errors.length, d.errors.slice(0, 3));
console.log('запуск:', ran.join(' ; ') || '-', '| сообщения:', alerts.length);
