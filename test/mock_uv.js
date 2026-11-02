// Имитация файла развёртки «— 3D.uv», который пишет скрипт выгрузки 1.6: по 3D-файлу (.glb) и проекту (.bmk)
// для каждого треугольника с текстурой — вершины в координатах модели и точки на картинке. Развёртка — как у
// БАЗИСа: пласть панели — в осях её рамки, мм / 1000, «горизонтальная» текстура повёрнута на 90°; остальное —
// на плоскость грани. Номер материала — по названию из 3D-файла.
//   node test/mock_uv.js <проект.bmk> <модель.glb> <куда.uv>
const fs = require('fs'), path = require('path');
global.window = global; global.BM = global.BM || {};
for (const f of ['geom', 'cut', 'project', 'm3d', 'glb']) require(path.join(__dirname, '..', 'web', 'core', f + '.js'));
const [bmk, glbFile, out] = process.argv.slice(2);
const doc = JSON.parse(fs.readFileSync(bmk, 'utf8').replace(/^﻿/, '')), sc = BM.m3d.build(doc);
const b = fs.readFileSync(glbFile), g = BM.glb.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)), O = BM.glb.objects(g), Mt = BM.glb.match(O, sc);
const mats = [], mIx = {}, F = [];
O.objs.forEach((o, oi) => {
	const it = Mt.byObj[oi] !== undefined ? sc.items[Mt.byObj[oi]] : null;
	o.geo.forEach(ge => {
		const m = ge.m;
		g.meshes[ge.mesh].prims.forEach(p => {
			const gm = g.mats[p.mat]; if (!gm || !gm.tex) return;
			if (mIx[p.mat] === undefined) { mIx[p.mat] = mats.length; mats.push(p.mat); }
			const P = p.pos, I = p.idx, n = I ? I.length : P.length / 3;
			for (let k = 0; k + 2 < n; k += 3) {
				const V = [0, 1, 2].map(w => { const v = I ? I[k + w] : k + w, x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2]; return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]]; });
				const e1 = V[1].map((c, i) => c - V[0][i]), e2 = V[2].map((c, i) => c - V[0][i]), nr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
				V.forEach(v => {
					let a, c;
					if (it) {
						const f = it.f, d = [v[0] - f.o[0], v[1] - f.o[1], v[2] - f.o[2]], X = d[0] * f.x[0] + d[1] * f.x[1] + d[2] * f.x[2], Y = d[0] * f.y[0] + d[1] * f.y[1] + d[2] * f.y[2];
						if (it.tex === 1) { a = Y; c = X; } else { a = X; c = Y; }
					} else {
						const an = nr.map(Math.abs), ax = an[0] >= an[1] && an[0] >= an[2] ? [1, 2] : (an[1] >= an[2] ? [0, 2] : [0, 1]);
						a = v[ax[0]]; c = v[ax[1]];
					}
					F.push(v[0], v[1], v[2], a / 1000, -c / 1000);
				});
				F.push(mIx[p.mat]);
			}
		});
	});
});
const head = Buffer.from(JSON.stringify({ mats }), 'utf8'), hl = head.length + (4 - (16 + head.length) % 4) % 4;
const hdr = Buffer.alloc(16); hdr.write('BMUV', 0); hdr.writeUInt32LE(1, 4); hdr.writeUInt32LE(F.length / 16, 8); hdr.writeUInt32LE(hl, 12);
fs.writeFileSync(out, Buffer.concat([hdr, head, Buffer.alloc(hl - head.length, 32), Buffer.from(new Float32Array(F).buffer)]));
console.log('развёртка', out, F.length / 16, 'треугольников,', mats.length, 'материалов');
