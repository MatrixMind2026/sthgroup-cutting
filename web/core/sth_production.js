/* STHGroup: обеспечение, задания цеху, операции, план/факт и версии моделей.
   Данные производства хранятся в заказе; складские движения — в прежней базе. */
(function (G) {
 'use strict';
 var BM = G.BM = G.BM || {}, O = BM.sth, F = BM.sthProduction = {};
 var copy = function (v) { return JSON.parse(JSON.stringify(v)); };
 var round = function (v) { return Math.round(v * 10000) / 10000; };
 function positive(v) { var n = O.num(v, NaN); if (!Number.isFinite(n) || n < 0) throw new Error('Введите число не меньше нуля'); return n; }
 function stable(v) {
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ':' + stable(v[k]); }).join(',') + '}';
  return JSON.stringify(v === undefined ? null : v);
 }
 /* Геометрия без служебных номеров сегментов: одинаковый контур может начинаться
    с другого ребра и обходиться в другом направлении при повторной выгрузке. */
 function contour(els) {
  return (els || []).map(function (e) {
   var a = e.a, b = e.b, g = e.g || 0;
   return stable(a) <= stable(b) ? { a: a, b: b, g: g } : { a: b, b: a, g: -g };
  }).sort(function (a, b) { return stable(a).localeCompare(stable(b)); });
 }
 F.OPERATIONS = [['cut', 'Распил'], ['edge', 'Кромление'], ['drill', 'Присадка'], ['pack', 'Упаковка']];
 F.CATEGORIES = [['mat', 'Материалы'], ['fit', 'Фурнитура'], ['work', 'Работы']];
 F.fix = function (o) {
  var p = o.production;
  if (!p || typeof p !== 'object' || Array.isArray(p)) p = o.production = {};
  if (!Array.isArray(p.operations)) p.operations = F.OPERATIONS.map(function (x) { return { id: x[0], name: x[1], who: '', due: '', note: '', status: 'wait' }; });
  ['history', 'actuals', 'jobs', 'purchases', 'versions'].forEach(function (k) { if (!Array.isArray(p[k])) p[k] = []; });
  if (!p.jobOptions) p.jobOptions = { who: '', due: '', note: '', maps: true, edges: true, notes: true };
  return p;
 };
 F.log = function (o, type, text, extra) {
  var h = Object.assign({ id: O.id('ph'), at: new Date().toISOString(), type: type, text: text }, extra || {});
  F.fix(o).history.push(h); return h;
 };
 F.updateOperation = function (o, id, changes) {
  var op = F.fix(o).operations.find(function (x) { return x.id === id; });
  if (!op) throw new Error('Операция не найдена');
  var status = changes.status === undefined ? op.status : changes.status;
  if (['wait', 'work', 'done'].indexOf(status) < 0) throw new Error('Неизвестный статус операции');
  if (changes.due && !/^\d{4}-\d{2}-\d{2}$/.test(changes.due)) throw new Error('Проверьте срок операции');
  var before = stable(op);
  ['who', 'due', 'note'].forEach(function (k) { if (changes[k] !== undefined) op[k] = String(changes[k]).trim(); });
  if (op.status !== status) {
   op.status = status;
   if (status === 'done') op.finishedAt = new Date().toISOString(); else delete op.finishedAt;
  }
  if (before !== stable(op)) F.log(o, 'operation', op.name + ': ' + ({ wait: 'ожидает', work: 'в работе', done: 'готово' })[status], { operation: id, who: op.who, note: op.note });
  return op;
 };
 /* Факты — самостоятельные расходы. Нет записей означает «не внесено», а не нулевую себестоимость. */
 F.freezePlan = function (book, o, replace) {
  var p = F.fix(o); if (p.plan && !replace) return p.plan;
  var q = O.calc(book, o), mat = 0, fit = 0;
  o.items.forEach(function (it) { if (it.snap) { mat += O.num(it.snap.mat); fit += O.num(it.snap.fit); } });
  p.plan = { at: new Date().toISOString(), mat: O.r2(mat), fit: O.r2(fit), work: O.r2(q.servAll), basis: 'Материалы и фурнитура — по смете без наценки; работы — согласованная стоимость услуг' };
  F.log(o, 'plan', replace ? 'План затрат обновлён' : 'План затрат зафиксирован'); return p.plan;
 };
 F.addActual = function (o, row) {
  if (!F.CATEGORIES.some(function (c) { return c[0] === row.category; })) throw new Error('Выберите статью расходов');
  var amount = positive(row.amount), note = String(row.note || '').trim();
  if (!note) throw new Error('Укажите расход или причину отклонения');
  var x = { id: O.id('a'), category: row.category, amount: O.r2(amount), note: note, date: row.date || O.today(), at: new Date().toISOString() };
  F.fix(o).actuals.push(x); F.log(o, 'actual', 'Фактический расход: ' + note, { actual: x.id, amount: x.amount }); return x;
 };
 F.removeActual = function (o, id) {
  var p = F.fix(o), x = p.actuals.find(function (r) { return r.id === id && !r.void; }); if (!x) return false;
  x.void = new Date().toISOString(); F.log(o, 'actual', 'Отменён расход: ' + x.note, { actual: id }); return true;
 };
 F.planFact = function (o) {
  var p = F.fix(o), rows = F.CATEGORIES.map(function (c) {
   var a = p.actuals.filter(function (x) { return !x.void && x.category === c[0]; }), fact = a.length ? O.r2(a.reduce(function (s, x) { return s + x.amount; }, 0)) : null;
   var plan = p.plan ? p.plan[c[0]] : null;
   return { id: c[0], name: c[1], plan: plan, fact: fact, delta: plan === null || fact === null ? null : O.r2(fact - plan) };
  });
  var complete = rows.every(function (r) { return r.fact !== null; });
  var plan = p.plan ? O.r2(rows.reduce(function (s, r) { return s + r.plan; }, 0)) : null;
  var fact = O.r2(rows.reduce(function (s, r) { return s + (r.fact || 0); }, 0));
  return { rows: rows, plan: plan, fact: fact, complete: complete, delta: complete && plan !== null ? O.r2(fact - plan) : null };
 };
 /* Резерв может превышать физический остаток. В обеспечении считаем только доступную часть,
    исключаем чужие резервы и учитываем уже выданное этому заказу. Обрезки отдельно от листов. */
 F.supply = function (b, o, result) {
  var MB = BM.mb, K = BM.stock, by = Object.create(null); K.fix(b);
  (result.need || []).forEach(function (x) { by[x.mat] = round((by[x.mat] || 0) + positive(x.qty)); });
  return Object.keys(by).map(function (id) {
   var m = b.mats[id]; if (!m) return { mat: id, name: id, missing: true, need: by[id], buy: by[id] };
   var mine = K.resOf(b, id).filter(function (r) { return r.order === o.id; }).reduce(function (s, r) { return s + r.qty; }, 0);
   var received = 0, issued = 0;
   b.stock.docs.forEach(function (d) {
    if (d.off || !(d.order ? d.order === o.id : d.project === 'Заказ ' + o.no)) return;
    d.lines.forEach(function (l) { if (l.mat === id) { if (d.kind === 'in') received += l.qty; if (d.kind === 'out') issued += l.qty; } });
   });
   var remaining = Math.max(0, round(by[id] - issued)), physical = Math.max(0, round(MB.balance(b, id) - (K.reserved(b, id) - mine)));
   var reserved = Math.min(mine, physical, remaining), available = Math.min(physical, remaining), buy = Math.max(0, round(remaining - available));
   var customer = K.tabOf(b, m) === 'fit' ? !o.ownFit : !o.ownMat;
   return { mat: id, name: m.name, unit: m.unit, need: by[id], reserved: round(reserved), requestedReserve: mine, available: round(available), buy: buy, customer: customer,
    purchaseQty: buy > 0 && !customer ? MB.roundQty(m, buy) : 0, received: round(received), issued: round(issued), price: O.num(m.price), supplier: m.sup || '', remaining: remaining };
  });
 };
 F.purchase = function (b, o, rows) {
  var groups = Object.create(null);
  rows.forEach(function (r) { if (!(r.purchaseQty > 0) || r.missing) return; var k = r.supplier || ''; (groups[k] = groups[k] || []).push({ mat: r.mat, name: r.name, unit: r.unit, qty: r.purchaseQty, price: r.price, art: b.mats[r.mat].supArt || b.mats[r.mat].art || '', url: b.mats[r.mat].url || '' }); });
  var docs = Object.keys(groups).map(function (s) { return { id: O.id('buy'), supplier: s, at: new Date().toISOString(), status: 'draft', lines: groups[s] }; });
  if (!docs.length) return [];
  F.fix(o).purchases = F.fix(o).purchases.concat(docs); F.log(o, 'purchase', 'Подготовлены заявки поставщикам: ' + docs.length); return docs;
 };
 F.receive = function (b, o, mat, qty, price, note) {
  qty = positive(qty); price = positive(price); if (!qty || !b.mats[mat]) throw new Error('Выберите материал и положительное количество');
  var K = BM.stock, d = K.move(b, 'in', mat, qty, { price: price, note: note, order: o });
  var mine = K.resOf(b, mat).find(function (x) { return x.order === o.id; });
  K.reserve(b, mat, (mine ? mine.qty : 0) + qty, o); return d;
 };
 /* Снимок использует действующие размеры, материал, кромку, присадку и количество проекта.
    Идентичность — путь/позиция/обозначение/имя, а не меняющийся при выгрузке числовой id. */
 F.modelSnapshot = function (st) {
  var P = BM.project, rows = [], index = Object.create(null);
  (st.types || []).forEach(function (t) {
   var count = P.count ? P.count(st, t) : t.cnt; if (!(count > 0)) return;
   var m = (st.mats || []).find(function (x) { return x.key === t.mat; });
   var row = { identity: stable([t.path || [], t.pos || '', t.des || '', t.name || '']), name: t.name || 'Деталь', pos: t.pos || '',
    L: t.L, W: t.W, th: m ? m.th : t.th, material: m ? m.name : t.matName, qty: count,
    edge: stable({ sides: t.shape && t.shape.sides || {}, edges: (t.shape && t.shape.edges || []).slice().sort(function (a, b) { return stable(a).localeCompare(stable(b)); }) }),
    holes: stable(t.holes ? { top: t.holes.top.slice().sort(function (a, b) { return stable(a).localeCompare(stable(b)); }), bot: t.holes.bot.slice().sort(function (a, b) { return stable(a).localeCompare(stable(b)); }), thr: t.holes.thr.slice().sort(function (a, b) { return stable(a).localeCompare(stable(b)); }), edge: t.holes.edge } : {}), cuts: stable(t.cuts || []),
    contour: stable({ outer: contour(t.shape && t.shape.outer), inner: (t.shape && t.shape.inner || []).map(contour).sort(function (a, b) { return stable(a).localeCompare(stable(b)); }) }), texture: t.tex === undefined ? null : t.tex };
   var fp = stable(Object.assign({}, row, { qty: 0 })), old = index[fp];
   if (old) old.qty += count; else { index[fp] = row; rows.push(row); }
  });
  ['fast', 'kits', 'prof', 'lin'].forEach(function (kind) {
   var grouped = Object.create(null);
   (st.model[kind] || []).forEach(function (x) {
    var key = stable([kind, x.name, x.art || '', x.len || 0]), r = grouped[key];
    if (!r) r = grouped[key] = { identity: stable(['extra', kind, x.name, x.art || '']), name: x.name, kind: kind, L: O.num(x.len), W: 0, th: 0, material: '', qty: 0, edge: '', holes: '', cuts: '', contour: '', texture: null };
    r.qty += O.num(x.n, 1) * O.num(st.work && st.work.sets, 1);
   }); Object.keys(grouped).sort().forEach(function (k) { rows.push(grouped[k]); });
  });
  return { rows: rows, title: P.modelName(st.model), at: new Date().toISOString() };
 };
 F.diff = function (before, after) {
  var changes = [], keys = Object.create(null), a = before.rows || [], z = after.rows || [];
  a.concat(z).forEach(function (r) { keys[r.identity] = 1; });
  function fp(r) { return stable(Object.assign({}, r, { qty: 0 })); }
  function pair(x, y) {
   if (!x || !y) { changes.push({ kind: x ? 'removed' : 'added', name: (x || y).name, before: x || null, after: y || null, fields: [x ? 'Удалена' : 'Добавлена'] }); return; }
   var fields = [];
   [['L', 'Размер'], ['W', 'Размер'], ['th', 'Толщина'], ['material', 'Материал'], ['qty', 'Количество'], ['edge', 'Кромка'], ['holes', 'Присадка'], ['cuts', 'Пазы'], ['contour', 'Контур'], ['texture', 'Текстура']].forEach(function (f) { if (stable(x[f[0]]) !== stable(y[f[0]]) && fields.indexOf(f[1]) < 0) fields.push(f[1]); });
   if (fields.length) changes.push({ kind: 'changed', name: y.name, before: x, after: y, fields: fields });
  }
  Object.keys(keys).forEach(function (key) {
   var left = a.filter(function (r) { return r.identity === key; }).slice(), right = z.filter(function (r) { return r.identity === key; }).slice();
   for (var i = left.length - 1; i >= 0; i--) { var at = right.findIndex(function (r) { return fp(r) === fp(left[i]); }); if (at >= 0) { pair(left[i], right[at]); left.splice(i, 1); right.splice(at, 1); } }
   left.sort(function (x, y) { return fp(x).localeCompare(fp(y)); }); right.sort(function (x, y) { return fp(x).localeCompare(fp(y)); });
   for (var j = 0; j < Math.max(left.length, right.length); j++) pair(left[j], right[j]);
  });
  return changes;
 };
 F.job = function (book, o, supply, maps) {
  var p = F.fix(o), q = O.calc(book, o), opt = copy(p.jobOptions);
  if (!o.items.length || o.items.some(function (it) { return !it.snap; })) throw new Error('Сначала посчитайте все изделия заказа');
  var job = { id: O.id('job'), no: p.jobs.length + 1, at: new Date().toISOString(), order: o.no, options: opt,
   items: o.items.map(function (it) { return { title: it.title, parts: it.snap.parts, sheets: copy(it.snap.sheets), edgeM: it.snap.edgeM === undefined ? null : it.snap.edgeM, holes: it.snap.holeCount === undefined ? null : it.snap.holeCount,
    details: opt.edges && it.snap.modelVersion ? copy(it.snap.modelVersion.rows.filter(function (r) { return !r.kind; })) : [] }; }),
   materials: copy(supply || []), operations: copy(p.operations), parts: q.parts, sheets: q.sheets, maps: opt.maps ? copy(maps || []) : [], note: opt.notes ? (o.note || '') : '' };
  if (!opt.notes) job.options.note = '';
  p.jobs.push(job); F.log(o, 'job', 'Сформировано задание в цех № ' + job.no); return job;
 };
 /* Добавляем метаданные к обычной сводке, не меняя прежних расчётов и цен. */
 var snapshot = O.snapshot;
 O.snapshot = function (st) {
  var sn = snapshot.apply(this, arguments); sn.modelVersion = F.modelSnapshot(st);
  sn.holeCount = 0; sn.edgeM = 0;
  (st.types || []).forEach(function (t) {
   var n = BM.project.count ? BM.project.count(st, t) : t.cnt;
   (t.shape && t.shape.edges || []).forEach(function (edge) { for (var i = 1; i < edge.line.length; i++) sn.edgeM += Math.hypot(edge.line[i][0] - edge.line[i - 1][0], edge.line[i][1] - edge.line[i - 1][1]) * n / 1000; });
   var h = t.holes || {};
   sn.holeCount += ((h.top || []).length + (h.bot || []).length + (h.thr || []).length + O.num(h.edge)) * n;
  }); sn.edgeM = round(sn.edgeM); return sn;
 };
})(typeof globalThis !== 'undefined' ? globalThis : this);
