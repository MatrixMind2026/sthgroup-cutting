const assert = require('assert');
const nesting = require('../core/cutter');
const pricing = require('../core/pricing');
const importers = require('../core/importers');

let passed = 0;
function t(name, fn) { try { fn(); passed++; console.log('ok   ' + name); } catch (e) { console.error('FAIL ' + name + '\n' + e.stack); process.exitCode = 1; } }

const base = {
  materials: [{ id: 'ldsp16w', name: 'ЛДСП 16 Белый', thickness: 16, sheetW: 2800, sheetH: 2070, servicePerM2: 350, salePerSheet: 2400 }],
  edges: [{ id: 'abs04w', name: 'ABS 0,4 Белый', servicePerM: 20, salePerM: 15 }]
};

t('раскрой: детали не пересекаются и лежат внутри листа', () => {
  const parts = [
    { id: 'a', name: 'A', l: 720, w: 560, qty: 6 },
    { id: 'b', name: 'B', l: 564, w: 300, qty: 10 },
    { id: 'c', name: 'C', l: 1200, w: 400, qty: 5 }
  ];
  const r = nesting.packMaterial(parts, { w: 2800, h: 2070 }, { kerf: 4, trim: 10, minOffcut: 200 });
  assert.strictEqual(r.unplaced.length, 0);
  let count = 0;
  for (const s of r.sheets) {
    for (let i = 0; i < s.placed.length; i++) {
      const p = s.placed[i]; count++;
      assert.ok(p.x >= 10 - 1e-6 && p.y >= 10 - 1e-6, 'отступ от края');
      assert.ok(p.x + p.w <= 2800 - 10 + 1e-6 && p.y + p.h <= 2070 - 10 + 1e-6, 'в пределах листа');
      for (let j = i + 1; j < s.placed.length; j++) {
        const q = s.placed[j];
        const ov = p.x < q.x + q.w && p.x + p.w > q.x && p.y < q.y + q.h && p.y + p.h > q.y;
        assert.ok(!ov, 'пересечение деталей');
      }
    }
  }
  assert.strictEqual(count, 21);
});

t('раскрой: зазор на пропил соблюдается', () => {
  const r = nesting.packMaterial([{ id: 'a', name: 'A', l: 1000, w: 1000, qty: 2 }], { w: 2100, h: 1010 }, { kerf: 4, trim: 0 });
  const p = r.sheets[0].placed;
  assert.strictEqual(r.sheets.length, 1);
  const gap = Math.abs(p[0].x - p[1].x) - 1000;
  assert.ok(gap >= 4 - 1e-6, 'зазор ' + gap);
});

t('раскрой: деталь с запретом поворота не поворачивается', () => {
  const r = nesting.packMaterial([{ id: 'a', name: 'A', l: 2000, w: 100, qty: 3, canRotate: false }], { w: 2800, h: 2070 }, { kerf: 4, trim: 10 });
  r.sheets.forEach(s => s.placed.forEach(p => assert.strictEqual(p.rotated, false)));
});

t('раскрой: деталь больше листа попадает в unplaced', () => {
  const r = nesting.packMaterial([{ id: 'a', name: 'A', l: 3000, w: 3000, qty: 1 }], { w: 2800, h: 2070 }, { kerf: 4, trim: 10 });
  assert.strictEqual(r.unplaced.length, 1);
  assert.strictEqual(r.sheets.length, 0);
});

t('раскрой: деловые остатки не пересекаются между собой и с деталями', () => {
  const r = nesting.packMaterial([{ id: 'a', name: 'A', l: 800, w: 600, qty: 4 }], { w: 2800, h: 2070 }, { kerf: 4, trim: 10, minOffcut: 300 });
  const s = r.sheets[0];
  assert.ok(s.offcuts.length > 0);
  for (const o of s.offcuts) {
    for (const p of s.placed) {
      const ov = o.x < p.x + p.w && o.x + o.w > p.x && o.y < p.y + p.h && o.y + o.h > p.y;
      assert.ok(!ov, 'остаток пересекает деталь');
    }
  }
});

const order = {
  ownMaterial: false, ownEdge: false, discountPct: 0,
  parts: [
    { id: '1', name: 'Бок', materialId: 'ldsp16w', l: 1000, w: 500, qty: 4, edges: { l1: 'abs04w' }, holesFaceBlind: 4, holesFaceThrough: 0, holesEdge: 2, millM: 0 },
    { id: '2', name: 'Полка', materialId: 'ldsp16w', l: 800, w: 300, qty: 2, edges: {}, millM: 1.5 }
  ],
  payments: [{ amount: 500 }]
};

t('цена: площадь деталей, кромка, присадка, фрезеровка', () => {
  const q = pricing.calcOrder(order, base, { pricing: { minOrder: 0 } });
  const area = (1000 * 500 * 4 + 800 * 300 * 2) / 1e6; // 2.48
  const cut = q.lines.find(l => l.group === 'cut');
  assert.strictEqual(cut.qty, 2.48);
  assert.strictEqual(cut.sum, pricing.round2(area * 350));
  const edge = q.lines.find(l => l.group === 'edge');
  assert.strictEqual(edge.qty, 4); // 4 шт * 1 м
  assert.strictEqual(edge.sum, 80);
  const holes = q.lines.filter(l => l.title.startsWith('Присадка'));
  assert.strictEqual(holes.length, 2);
  assert.strictEqual(holes.find(h => h.title.includes('глухие')).sum, 16 * 10); // 4*4
  assert.strictEqual(holes.find(h => h.title.includes('торец')).sum, 8 * 12);
  const mill = q.lines.find(l => l.title === 'Фрезеровка на ЧПУ');
  assert.strictEqual(mill.qty, 3);
  assert.strictEqual(mill.sum, 450);
  assert.strictEqual(q.total, q.subtotal);
});

t('цена: минимальная сумма заказа доплачивается', () => {
  const small = { parts: [{ id: '1', name: 'x', materialId: 'ldsp16w', l: 300, w: 300, qty: 1, edges: {} }] };
  const q = pricing.calcOrder(small, base, { pricing: { minOrder: 1000 } });
  assert.ok(q.subtotal < 1000);
  assert.strictEqual(q.total, 1000);
  assert.strictEqual(q.minTopUp, pricing.round2(1000 - q.subtotal));
});

t('цена: по площади листов и свой материал', () => {
  const q = pricing.calcOrder(Object.assign({}, order, { areaBasis: 'sheets', ownMaterial: true, ownEdge: true }), base, { pricing: { minOrder: 0 } });
  const cut = q.lines.find(l => l.group === 'cut');
  assert.strictEqual(cut.unit, 'м²');
  assert.strictEqual(cut.qty, pricing.round2(2.8 * 2.07 * q.cutting[0].sheets));
  const mat = q.lines.find(l => l.group === 'material');
  assert.strictEqual(mat.sum, q.cutting[0].sheets * 2400);
  assert.ok(q.lines.some(l => l.title.startsWith('Кромка (наша)')));
});

t('цена: скидка и долг по оплатам', () => {
  const q = pricing.calcOrder(Object.assign({}, order, { discountPct: 10 }), base, { pricing: { minOrder: 0 } });
  assert.strictEqual(q.discount, pricing.round2(q.subtotal * 0.1));
  assert.strictEqual(q.paid, 500);
  assert.strictEqual(q.debt, pricing.round2(q.total - 500));
});

t('цена: время станка считается и включается галочкой', () => {
  const s = { pricing: { minOrder: 0, cnc: { enabled: { holes: false, mill: false, perPart: false, time: true }, machineHourRate: 3600, secPerHole: 10, secPerMillM: 0, secPerPart: 0 } } };
  const q = pricing.calcOrder(order, base, s);
  // отверстий: 4*(4+2)=24 -> 240 с = 1/15 ч
  assert.strictEqual(q.lines.filter(l => l.group === 'cnc').length, 1);
  assert.strictEqual(q.lines.find(l => l.group === 'cnc').sum, 240);
});

t('цена: предупреждение, если материала нет в базе', () => {
  const q = pricing.calcOrder({ parts: [{ id: '1', materialId: 'нет', l: 100, w: 100, qty: 1 }] }, base, {});
  assert.ok(q.warnings.some(w => w.includes('нет в базе')));
});

t('импорт CSV с ; и русскими заголовками', () => {
  const csv = importers.csvTemplate();
  const r = importers.parseCsv(csv, base);
  assert.strictEqual(r.parts.length, 2);
  assert.strictEqual(r.parts[0].l, 720);
  assert.strictEqual(r.parts[0].materialId, 'ldsp16w');
  assert.strictEqual(r.parts[0].holesFaceBlind, 4);
  assert.strictEqual(r.parts[0].holesEdge, 2);
});

t('импорт CSV: нет колонок размеров -> понятное сообщение', () => {
  const r = importers.parseCsv('a;b\n1;2\n', base);
  assert.strictEqual(r.parts.length, 0);
  assert.ok(r.warnings[0].includes('Длина'));
});

t('импорт .bmk (JSON): находит список деталей', () => {
  const bmk = { project: { name: 'Шкаф' }, parts: [
    { name: 'Бок', material: 'ЛДСП 16 Белый', length: 720, width: 560, count: 2, holes: [{ through: true }, {}, { edge: true }] },
    { name: 'Крыша', material: 'ЛДСП 16 Белый', length: 800, width: 560, count: 1 }
  ] };
  const r = importers.parseBmkObject(bmk, base);
  assert.strictEqual(r.parts.length, 2);
  assert.strictEqual(r.parts[0].qty, 2);
  assert.strictEqual(r.parts[0].holesFaceThrough, 1);
  assert.strictEqual(r.parts[0].holesFaceBlind, 1);
  assert.strictEqual(r.parts[0].holesEdge, 1);
});

t('импорт .bmk: мусор не ломает программу', () => {
  assert.strictEqual(importers.parseBmkText('не json', base).parts.length, 0);
  assert.strictEqual(importers.parseBmkObject({ a: [1, 2, 3] }, base).parts.length, 0);
});

t('цена за лист: распил+кромка+присадка одной строкой, цена материала > группы > общей', () => {
  const b2 = { materials: [Object.assign({}, base.materials[0], { groupChain: ['gA', 'gRoot'] })], edges: base.edges };
  const mk = (sheet) => pricing.calcOrder(order, b2, { pricing: { minOrder: 0, sheet: Object.assign({ mode: 'sheet' }, sheet) } });
  let q = mk({ price: 1000 });
  const sheets = q.cutting[0].sheets;
  const l = q.lines.find(x => x.group === 'cut');
  assert.strictEqual(l.unit, 'лист'); assert.strictEqual(l.sum, sheets * 1000);
  assert.ok(!q.lines.some(x => x.title.startsWith('Кромление')) && !q.lines.some(x => x.title.startsWith('Присадка')));
  assert.strictEqual(mk({ price: 1000, groupPrices: { gRoot: 1200 } }).lines.find(x => x.group === 'cut').price, 1200);
  assert.strictEqual(mk({ price: 1000, groupPrices: { gRoot: 1200, gA: 1300 } }).lines.find(x => x.group === 'cut').price, 1300);
  assert.strictEqual(mk({ price: 1000, groupPrices: { gA: 1300 }, prices: { ldsp16w: 900 } }).lines.find(x => x.group === 'cut').price, 900);
});

t('цена за лист: доплата за кромку и отверстия сверх нормы', () => {
  const q = pricing.calcOrder(order, base, { pricing: { minOrder: 0, sheet: { mode: 'sheet', price: 1000, edgeNorm: 1, holesNorm: 2, edgeExtra: 30, holesExtra: 5 } } });
  const sheets = q.cutting[0].sheets, em = Object.values(pricing.edgeMeters(order)).reduce((a, x) => a + x, 0);
  const e = q.lines.find(x => x.title.startsWith('Кромка сверх'));
  assert.ok(e && Math.abs(e.qty - pricing.round2(em - sheets)) < 0.02);
  const h = q.lines.find(x => x.title.startsWith('Присадка сверх'));
  assert.ok(h && h.qty === 24 - sheets * 2);
  const big = pricing.calcOrder(order, base, { pricing: { minOrder: 0, sheet: { mode: 'sheet', price: 1000, edgeNorm: 1000, holesNorm: 1000, edgeExtra: 30, holesExtra: 5 } } });
  assert.ok(!big.lines.some(x => /сверх/.test(x.title)));
});

t('цена за лист: нет цены -> считаем по площади и предупреждаем', () => {
  const q = pricing.calcOrder(order, base, { pricing: { minOrder: 0 } });
  assert.strictEqual(q.lines.find(x => x.group === 'cut').unit, 'м²');
  assert.ok(q.warnings.some(w => /Не задана цена за лист/.test(w)));
});

t('цена за лист: режим «по площади» работает как раньше', () => {
  const q = pricing.calcOrder(order, base, { pricing: { minOrder: 0, sheet: { mode: 'area', price: 1000 } } });
  assert.strictEqual(q.lines.find(x => x.group === 'cut').unit, 'м²');
});

console.log('\nПройдено тестов: ' + passed);
