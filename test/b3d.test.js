const assert = require('assert');
const zlib = require('zlib');
const B3D = require('../core/b3d.js');
const MB = require('../core/materialbase.js');

// ---- сборщик минимального .b3d ----
function builder() {
  const names = ['']; const idx = (n) => { let i = names.indexOf(n); if (i < 0) { names.push(n); i = names.length - 1; } return i; };
  const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };
  const f64 = (n) => { const b = Buffer.alloc(8); b.writeDoubleLE(n); return b; };
  const node = (k, v, kids) => {
    kids = kids || []; let t, p = Buffer.alloc(0);
    if (v === undefined) t = 0;
    else if (typeof v === 'number') { if (Number.isInteger(v) && v < 100000 && v > -100000 && !node.f) { t = 4; p = Buffer.alloc(4); p.writeInt32LE(v); } else { t = 5; p = f64(v); } }
    else if (typeof v === 'string') { t = 6; const s = Buffer.from(v, 'utf16le'); p = Buffer.concat([u32(v.length), s]); }
    else if (Buffer.isBuffer(v)) { t = 7; p = Buffer.concat([u32(v.length), v]); }
    return Buffer.concat([u32(idx(k)), u32(kids.length), Buffer.from([t]), p].concat(kids));
  };
  const F = (k, n) => { node.f = true; const r = node(k, n); node.f = false; return r; };
  const table = () => Buffer.concat([u32(names.length)].concat(names.map((n) => Buffer.concat([u32(Buffer.byteLength(n, 'latin1')), Buffer.from(n, 'latin1')]))));
  return { node, F, f64, u32, table, names };
}
function contour(b, W, H) {
  const seg = (x1, y1, x2, y2) => Buffer.concat([Buffer.from([0x10]), b.f64(x1), b.f64(y1), b.f64(x2), b.f64(y2)]);
  return Buffer.concat([b.u32(4), seg(0, 0, W, 0), seg(W, 0, W, H), seg(W, H, 0, H), seg(0, H, 0, 0)]);
}
function sample() {
  const hb = builder();
  const header = Buffer.concat([hb.node('Header', undefined, [hb.node('Article', undefined, [hb.node('Name', 'Тумба')])])]);
  const hdrStream = Buffer.concat([hb.table(), header]);
  const b = builder(); const N = b.node, F = b.F;
  const panel = (name, W, H, tex, butt) => N('Obj', undefined, [
    N('Type', 4002), N('Name', name), N('Mat', 'ЛДСП 16 мм, Белый, W980, Egger\rW980'), N('Thick', F('x', 0) && 16), N('TexDir', tex),
    N('Contour', contour(b, W, H)),
    N('Butts', undefined, butt.map((e) => N('Butt', undefined, [N('Mat', 'Кромка 0,8х19 мм, Белый\rW980-0,8x19'), N('Elem', e)])))
  ]);
  const hw = N('Obj', undefined, [N('Type', 3001), N('Name', 'Конфирмат 7,0 X 50')]);
  const model = N('Model', undefined, [
    panel('Бок', 720, 560, 1, [0, 2]), panel('Бок', 720, 560, 1, [0, 2]), panel('Полка', 560, 300, 2, [3]), hw, hw
  ]);
  const doc = N('Document', undefined, [model]);
  const bodyStream = Buffer.concat([b.table(), doc]);
  const M = (flag) => Buffer.from([1, 0, 0, 255, flag]);
  return Buffer.concat([Buffer.from('BZ85'), M(0), hdrStream, M(1), zlib.deflateSync(bodyStream), Buffer.alloc(40, 7)]);
}

let n = 0;
function t(name, fn) { try { fn(); n++; console.log('ok  - ' + name); } catch (e) { console.error('FAIL - ' + name + '\n' + e.stack); process.exitCode = 1; } }

t('читает детали, размеры, количество и кромку по сторонам', () => {
  const r = B3D.parse(sample());
  assert.strictEqual(r.name, 'Тумба');
  assert.strictEqual(r.parts.length, 2);
  const side = r.parts.find((p) => p.name === 'Бок');
  assert.strictEqual(side.qty, 2);
  assert.strictEqual(side.l, 720); assert.strictEqual(side.w, 560);
  assert.ok(side.grain);
  assert.ok(side.edges.l1 && side.edges.l2 && !side.edges.w1 && !side.edges.w2);
  assert.strictEqual(side.material, 'ЛДСП 16 мм, Белый, W980, Egger');
  const shelf = r.parts.find((p) => p.name === 'Полка');
  assert.strictEqual(shelf.l, 300); assert.strictEqual(shelf.w, 560); // волокна вдоль Y
  assert.ok(shelf.edges.l2 && !shelf.edges.w1);
});

t('фурнитура считается по названию', () => {
  const r = B3D.parse(sample());
  assert.strictEqual(r.hardware.length, 1);
  assert.strictEqual(r.hardware[0].qty, 2);
});

t('toOrder создаёт недостающие материалы и не дублирует их', () => {
  const mb = MB.fromLegacy({});
  const r1 = B3D.toOrder(B3D.parse(sample()), mb, MB);
  assert.ok(r1.created.length >= 3);
  assert.ok(r1.parts.every((p) => p.materialId));
  const r2 = B3D.toOrder(B3D.parse(sample()), mb, MB);
  assert.strictEqual(r2.created.length, 0);
  assert.strictEqual(r2.items.find((i) => /Конфирмат/.test(i.name)).qty, 2);
  assert.ok(r2.items.length >= 3); // лист, кромка, фурнитура
});

t('сцена для 3D: у каждой детали замкнутый контур, матрица и связь со строкой заказа', () => {
  const parsed = B3D.parse(sample());
  const sc = parsed.scene;
  assert.strictEqual(sc.panels.length, parsed.parts.reduce((a, p) => a + p.qty, 0));
  sc.panels.forEach((p) => { assert.ok(p.loops.length >= 1 && p.loops[0].length >= 6); assert.strictEqual(p.M.length, 12); assert.ok(p.T > 0); });
  assert.strictEqual(sc.hardware.length, 2);
  const mb = MB.fromLegacy({}); const r = B3D.toOrder(parsed, mb, MB);
  const ids = new Set(r.parts.map((p) => p.id));
  assert.ok(r.model && r.model.panels.every((p) => ids.has(p.partId)));
});

t('не-b3d файл отклоняется', () => {
  assert.throws(() => B3D.parse(Buffer.from('hello world, not b3d')), /b3d/);
});
console.log(n + ' тестов');
