// Простой экран раскроя STHGroup 2.0: количество листов без изменения расчёта
const assert = require('assert'), fs = require('fs');
for (const f of ['geom', 'cut', 'project', 'sth_cut_simple']) require('../web/core/' + f + '.js');
const P = BM.project, K = BM.sthCutSimple;
const st = P.build(JSON.parse(fs.readFileSync(__dirname + '/out/est.bmk', 'utf8')), BM.defaults());
for (const m of st.mats) if (m.cfg.on) P.nest(st, m.key, { quality: 0 });
let n = 0; const ok = s => { n++; console.log('ок     ' + s); };
const sm = P.summary(st), v = K.view(st);
assert.strictEqual(v.sheets, sm.sheets); assert.strictEqual(v.parts, sm.total); assert.strictEqual(v.unplaced, sm.unplaced);
assert.strictEqual(v.mats.reduce((a, r) => a + r.sheets, 0), sm.sheets); assert.ok(v.mats.every(r => r.name && r.key));
ok('простой экран показывает те же листы, детали и неразмещённые позиции, что полный расчёт');
const first = st.mats.find(m => m.cfg.on && st.work.layout[m.key] && st.work.layout[m.key].sheets.length);
if (first) {
  const lay = st.work.layout[first.key], before = K.view(st).sheets, source = lay.sheets[0];
  lay.sheets.push(Object.assign({}, source, { recs: [], lock: 0 }));
  assert.strictEqual(K.view(st).sheets, before); lay.sheets.pop();
}
assert.strictEqual(K.view(null).sheets, 0); ok('пустой пользовательский лист не попадает в количество заказа, пустое состояние безопасно');
console.log('проверок ' + n + ' | ошибок нет');
