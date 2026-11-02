// Имитация 3D-файла БАЗИСа (.glb, glTF 1.0 — как пишет assimp внутри БАЗИСа) по файлу проекта:
// узлы — блоки (по model.blocks) и панели (брусок по рамке и контуру), у фурнитуры — кубик 30 мм
// в середине своего блока. Сетки — с Y вверх, корень «node» поворачивает их в оси БАЗИСа, как у настоящего файла.
//   node test/mock_glb.js <проект.bmk> <куда.glb>
const fs = require('fs');
const [inp, out] = process.argv.slice(2);
const doc = JSON.parse(fs.readFileSync(inp, 'utf8').replace(/^﻿/, '')), m = doc.model;
const B = m.blocks || [], nodes = {}, meshes = {}, accessors = {}, bufferViews = {}, materials = {}, bins = [];
let off = 0, nid = 0;
const toY = p => [p[0], -p[2], p[1]];                                 // оси БАЗИСа → Y вверх (обратное корню)
function view(buf, target) { const id = 'v' + (nid++); const pad = (4 - buf.length % 4) % 4; bufferViews[id] = { buffer: 'binary_glTF', byteOffset: off, byteLength: buf.length, target }; bins.push(buf, Buffer.alloc(pad)); off += buf.length + pad; return id; }
function mesh(pts, mat) {                                                 // pts — вершины треугольников в осях БАЗИСа
	const n = pts.length, pos = Buffer.alloc(n * 12), idx = Buffer.alloc(n * 2), mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
	pts.forEach((p, i) => { const y = toY(p); y.forEach((v, k) => { pos.writeFloatLE(v, i * 12 + k * 4); mn[k] = Math.min(mn[k], v); mx[k] = Math.max(mx[k], v); }); idx.writeUInt16LE(i, i * 2); });
	const a1 = 'a' + (nid++), a2 = 'a' + (nid++), me = 'mesh_' + (nid++);
	accessors[a1] = { bufferView: view(pos, 34962), byteOffset: 0, byteStride: 0, componentType: 5126, count: n, type: 'VEC3', min: mn, max: mx };
	accessors[a2] = { bufferView: view(idx, 34963), byteOffset: 0, byteStride: 0, componentType: 5123, count: n, type: 'SCALAR' };
	meshes[me] = { name: '', primitives: [{ mode: 4, material: mat, indices: a2, attributes: { POSITION: a1 } }] };
	return me;
}
function boxPts(c) {                                                     // c — 8 углов: [i&1, i&2, i&4]
	const q = (a, b, cc, d) => [c[a], c[b], c[cc], c[a], c[cc], c[d]];
	return [].concat(q(0, 2, 3, 1), q(4, 5, 7, 6), q(0, 1, 5, 4), q(2, 6, 7, 3), q(0, 4, 6, 2), q(1, 3, 7, 5));
}
function mat(name, color) { if (!materials[name]) materials[name] = { name, values: { diffuse: color.concat([1]) } }; return name; }
const kids = { top: [] };
function add(name, up, meshId) { const id = 'n' + (nid++); nodes[id] = { name, children: [] }; if (meshId) { const h = 'node_' + (nid++); nodes[h] = { meshes: [meshId] }; nodes[id].children.push(h); } (up === null ? kids.top : nodes[up].children).push(id); return id; }
const bn = B.map(() => null);
B.forEach((b, i) => { bn[i] = add(b.name + (b.art ? b.art : ''), b.up >= 0 ? bn[b.up] : null); });
const boxBy = {};
for (const p of m.parts) {
	if (!p.frame || p.plastic || p.hid) continue;
	const f = p.frame, th = p.th, w = p.w, h = p.h;
	const g = (x, y, z) => [f.o[0] + f.x[0] * x + f.y[0] * y + f.z[0] * z, f.o[1] + f.x[1] * x + f.y[1] * y + f.z[1] * z, f.o[2] + f.x[2] * x + f.y[2] * y + f.z[2] * z];
	const c = [0, 1, 2, 3, 4, 5, 6, 7].map(i => g(i & 1 ? w : 0, i & 2 ? h : 0, i & 4 ? th : 0));
	add(p.name, p.bk >= 0 ? bn[p.bk] : null, mesh(boxPts(c), mat(p.mat || 'ЛДСП', [200, 190, 170])));
	const bb = boxBy[p.bk] || (boxBy[p.bk] = { s: [0, 0, 0], n: 0 }); c.forEach(v => { bb.s[0] += v[0]; bb.s[1] += v[1]; bb.s[2] += v[2]; bb.n++; });
}
const cube = c0 => boxPts([0, 1, 2, 3, 4, 5, 6, 7].map(i => [c0[0] + (i & 1 ? 15 : -15), c0[1] + (i & 2 ? 15 : -15), c0[2] + (i & 4 ? 15 : -15)]));
function cen(bk) { for (let k = bk, d = 0; k >= 0 && d < 40; k = B[k].up, d++) { const bb = boxBy[k]; if (bb) return bb.s.map(v => v / bb.n); } return null; }
for (const s of (m.solids || [])) {
	if (s.hid) continue;
	const c0 = cen(s.bk); if (!c0) continue;
	add(s.name + (s.art || ''), s.bk >= 0 ? bn[s.bk] : null, mesh(cube(c0), mat('Сталь', [192, 192, 192])));
}
/* блок без панелей, фурнитуры и вложенных блоков (петля) — кубик у самого блока */
B.forEach((b, i) => {
	if (B.some(x => x.up === i) || m.parts.some(p => p.bk === i) || (m.solids || []).some(s => s.bk === i)) return;
	const c0 = cen(i); if (!c0) return;
	const h = 'node_' + (nid++); nodes[h] = { meshes: [mesh(cube(c0), mat('Сталь', [192, 192, 192]))] }; nodes[bn[i]].children.push(h);
});
/* glow (3-й аргумент): блоки подсветки, как в БАЗИСе у автора — «Профиль», «Рассеиватель», «Лента LED» (1.15.1).
   Под полкой — лента над рассеивателем (свет вниз); в боковине — лента справа (свет влево); без ленты и профиля — не светится. */
if (process.argv[4] === 'glow') {
	const bx = (a, b) => boxPts([0, 1, 2, 3, 4, 5, 6, 7].map(i => [i & 1 ? b[0] : a[0], i & 2 ? b[1] : a[1], i & 4 ? b[2] : a[2]]));
	/* шкаф, внутри которого ленты (1.16.1: свет ленты — только внутри своего модуля) */
	const cab = add('КШ-400.0.1', null); add('Стенка шкафа', cab, mesh(bx([533700, 480, 0], [534320, 1520, 16]), mat('ЛДСП', [200, 190, 170])));
	const strip = (blk, P, D, Ld) => { const g = add(blk, cab); add('Профиль', g, mesh(bx(P[0], P[1]), mat('Сталь', [180, 180, 180]))); add('Рассеиватель', g, mesh(bx(D[0], D[1]), mat('Рассеиватель плоский прозрачный', [235, 235, 235]))); if (Ld) add('Лента LED', g, mesh(bx(Ld[0], Ld[1]), mat('Лента', [250, 240, 200]))); };
	strip('Подсветка FM1_F', [[533750, 1499, 300], [534150, 1507, 315]], [[533750, 1500, 301], [534150, 1504.5, 314]], [[533760, 1504.5, 303], [534140, 1505.5, 312]]);
	strip('Подсветка боковины', [[534300, 500, 300], [534308, 1500, 315]], [[534300, 500, 301], [534304.5, 1500, 314]], [[534304.5, 510, 303], [534305.5, 1490, 312]]);
	const g3 = add('Просто рассеиватель', null); add('Рассеиватель', g3, mesh(bx([533750, 200, 300], [534150, 204.5, 313]), mat('Рассеиватель плоский прозрачный', [235, 235, 235])));
}
nodes.Model = { name: 'Model', children: kids.top };
nodes.node = { name: 'node', matrix: [1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1], children: ['Model'] };
/* MOCK_TEX=«папка/картинка.png» — первому материалу текстура (картинка рядом с 3D-файлом, как кладёт БАЗИС) */
const extra = {};
if (process.env.MOCK_TEX) { const m0 = Object.keys(materials)[0]; materials[m0].values.diffuse = 'tex0'; extra.textures = { tex0: { source: 'img0' } }; extra.images = { img0: { uri: process.env.MOCK_TEX } }; console.log('текстура у материала', m0); }
const json = Object.assign({ asset: { version: '1.0', generator: 'BazisReborn mock_glb' }, accessors, bufferViews, buffers: { binary_glTF: { byteLength: off, type: 'arraybuffer', uri: 'data:,' } }, materials, meshes, nodes, scenes: { defaultScene: { nodes: ['node'] } }, scene: 'defaultScene' }, extra);
let js = Buffer.from(JSON.stringify(json), 'utf8'); const cl = js.length;
const body = Buffer.concat(bins), head = Buffer.alloc(20), pad = Buffer.alloc((4 - (20 + cl) % 4) % 4);
head.write('glTF', 0); head.writeUInt32LE(1, 4); head.writeUInt32LE(20 + cl + pad.length + body.length, 8); head.writeUInt32LE(cl, 12); head.writeUInt32LE(0, 16);
fs.writeFileSync(out, Buffer.concat([head, js, pad, body]));
console.log('3D-файл', out, Object.keys(nodes).length, 'узлов');
