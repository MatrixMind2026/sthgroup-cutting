/* Чтение файлов Базис-Мебельщик (.b3d): детали, кромка, материал, присадка, фрезеровка, фурнитура.
   Формат разобран по образцам: 'BZ85' + поток (таблица имён + дерево узлов) + zlib-поток тела. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.Core = root.Core || {}; root.Core.b3d = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {

  const MARK = [1, 0, 0, 255];
  function isMark(d, p) { return d[p] === 1 && d[p + 1] === 0 && d[p + 2] === 0 && d[p + 3] === 255; }

  function unpack(d, p, zlib) {
    if (!isMark(d, p)) throw new Error('нет маркера потока');
    const flag = d[p + 4];
    const body = d.subarray(p + 5);
    if (flag === 1) {
      const r = zlib.inflateSync(body, { info: true });
      return { data: r.buffer, used: 5 + r.engine.bytesWritten };
    }
    return { data: body, used: 5 + body.length };
  }

  function readTable(d, p) {
    const cnt = d.readUInt32LE(p); p += 4;
    const names = [];
    for (let i = 0; i < cnt; i++) { const n = d.readUInt32LE(p); p += 4; names.push(d.toString('latin1', p, p + n)); p += n; }
    return { names: names, p: p };
  }

  function parseNodes(d, p, names, zlib, stopAtMark) {
    const out = [];
    while (p + 9 <= d.length) {
      if (stopAtMark && isMark(d, p)) break;
      const r = parseNode(d, p, names, zlib); out.push(r.node); p = r.p;
    }
    return { nodes: out, p: p };
  }

  function parseNode(d, p, names, zlib) {
    const k = d.readUInt32LE(p), cc = d.readUInt32LE(p + 4), t = d[p + 8]; p += 9;
    let v = null;
    if (t === 1) v = true; else if (t === 2) v = false; else if (t === 8) v = 'T8';
    else if (t === 3) { v = d[p]; p += 1; }
    else if (t === 4) { v = d.readInt32LE(p); p += 4; }
    else if (t === 5 || t === 9) { v = d.readDoubleLE(p); p += 8; }
    else if (t === 6) {
      const n = d.readUInt32LE(p); p += 4;
      const raw = d.subarray(p, p + 2 * n); p += 2 * n;
      if (raw.length >= 4 && isMark(raw, 0)) v = null; // вложенный поток (служебные данные) — пропускаем
      else v = raw.toString('utf16le');
    } else if (t === 7) { const n = d.readUInt32LE(p); p += 4; v = d.subarray(p, p + n); p += n; }
    else if (t !== 0) throw new Error('неизвестный тип узла ' + t);
    const node = { k: k < names.length ? names[k] : '#' + k, v: v, c: [] };
    for (let i = 0; i < cc; i++) { const r = parseNode(d, p, names, zlib); node.c.push(r.node); p = r.p; }
    return { node: node, p: p };
  }

  function get(n, key) { if (!n) return undefined; for (const x of n.c) if (x.k === key) return x; return undefined; }
  function val(n, key, def) { const x = get(n, key); return x === undefined || x.v === null ? def : x.v; }

  function load(buf, zlib) {
    if (buf.length < 9 || buf.toString('latin1', 0, 4) !== 'BZ85') throw new Error('это не файл Базис-Мебельщик (.b3d)');
    const h = unpack(buf, 4, zlib);
    const ht = readTable(h.data, 0);
    const hr = parseNodes(h.data, ht.p, ht.names, zlib, true);
    const b = unpack(h.data, hr.p, zlib);
    const bt = readTable(b.data, 0);
    const br = parseNodes(b.data, bt.p, bt.names, zlib, false);
    return { header: hr.nodes, body: br.nodes };
  }

  // ---- геометрия ----
  const I = { R: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], t: [0, 0, 0] };
  function local(o) {
    const t = get(o, 'Trans'); if (!t) return I;
    let x = val(t, 'Rx', 0), y = val(t, 'Ry', 0), z = val(t, 'Rz', 0), w = val(t, 'Rw', 1);
    const n = Math.sqrt(x * x + y * y + z * z + w * w) || 1; x /= n; y /= n; z /= n; w /= n;
    return {
      R: [[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
        [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
        [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]],
      t: [val(t, 'X', 0), val(t, 'Y', 0), val(t, 'Z', 0)]
    };
  }
  function mul(A, B) {
    const R = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], t = [0, 0, 0];
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) R[i][j] += A.R[i][k] * B.R[k][j];
      for (let k = 0; k < 3; k++) t[i] += A.R[i][k] * B.t[k];
      t[i] += A.t[i];
    }
    return { R: R, t: t };
  }
  function apply(M, p) { return [0, 1, 2].map(function (i) { return M.R[i][0] * p[0] + M.R[i][1] * p[1] + M.R[i][2] * p[2] + M.t[i]; }); }
  function inverse(M) {
    const R = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) R[i][j] = M.R[j][i];
    return { R: R, t: [0, 1, 2].map(function (i) { return -(R[i][0] * M.t[0] + R[i][1] * M.t[1] + R[i][2] * M.t[2]); }) };
  }
  function dirApply(M, d) { return [0, 1, 2].map(function (i) { return M.R[i][0] * d[0] + M.R[i][1] * d[1] + M.R[i][2] * d[2]; }); }

  function walk(node, M, out, anc) {
    for (const c of node.c) {
      if (c.k === 'Obj') {
        const W = mul(M, local(c));
        out.push({ o: c, W: W, anc: anc });
        walk(c, W, out, anc.concat([val(c, 'Type', 0)]));
      } else if (c.k === 'Objs') walk(c, M, out, anc);
    }
  }

  function contour(buf) { // count + N*(маркер + 4 double)
    if (!buf || buf.length < 4) return [];
    const n = buf.readUInt32LE(0), segs = [];
    for (let i = 0; i < n; i++) {
      const q = 4 + 33 * i; if (q + 33 > buf.length) break;
      segs.push({ m: buf[q], x1: buf.readDoubleLE(q + 1), y1: buf.readDoubleLE(q + 9), x2: buf.readDoubleLE(q + 17), y2: buf.readDoubleLE(q + 25) });
    }
    return segs;
  }
  function rnd(x) { return Math.round(x * 10) / 10; }
  /** Собирает отрезки контура в замкнутые петли по совпадению концов (порядок и направление отрезков в файле произвольные). */
  function chainLoops(segs, r1) {
    const used = new Array(segs.length).fill(false), loops = [], tol = 0.05;
    const near = function (ax, ay, bx, by) { return Math.abs(ax - bx) < tol && Math.abs(ay - by) < tol; };
    for (let i = 0; i < segs.length; i++) {
      if (used[i]) continue;
      used[i] = true;
      const sx = segs[i].x1, sy = segs[i].y1; let ex = segs[i].x2, ey = segs[i].y2;
      const pts = [r1(sx), r1(sy), r1(ex), r1(ey)];
      for (let guard = 0; guard < segs.length && !near(ex, ey, sx, sy); guard++) {
        let found = -1, rev = false;
        for (let j = 0; j < segs.length; j++) {
          if (used[j]) continue;
          if (near(segs[j].x1, segs[j].y1, ex, ey)) { found = j; break; }
          if (near(segs[j].x2, segs[j].y2, ex, ey)) { found = j; rev = true; break; }
        }
        if (found < 0) break;
        used[found] = true;
        ex = rev ? segs[found].x1 : segs[found].x2; ey = rev ? segs[found].y1 : segs[found].y2;
        pts.push(r1(ex), r1(ey));
      }
      if (near(ex, ey, sx, sy)) pts.splice(pts.length - 2, 2);
      if (pts.length >= 6) loops.push(pts);
    }
    // внешняя петля — с наибольшей площадью, первой
    const area = function (l) { let a = 0; for (let k = 0; k < l.length; k += 2) { const n = (k + 2) % l.length; a += l[k] * l[n + 1] - l[n] * l[k + 1]; } return Math.abs(a / 2); };
    loops.sort(function (a, b) { return area(b) - area(a); });
    return loops;
  }
  function clean(s) { return String(s || '').replace(/\r/g, ' ').replace(/\s+/g, ' ').trim(); }

  /** Разбор модели. Возвращает { name, parts[], hardware[], warnings[] }. */
  function parse(buf, zlib) {
    zlib = zlib || require('zlib');
    const f = load(buf, zlib);
    const warnings = [];
    const doc = f.body.find(function (n) { return n.k === 'Document'; });
    if (!doc) throw new Error('в файле нет модели (Document)');
    const model = get(doc, 'Model');
    const furn = {};
    (get(doc, 'FurnList') ? get(doc, 'FurnList').c : []).forEach(function (e) { furn[val(e, 'FastID', 0)] = e; });
    const article = f.header.length ? get(f.header[0], 'Article') : null;
    const name = clean(val(article, 'Name', '')) || clean(val(article, 'OrderName', ''));

    const objs = []; walk(model, I, objs, []);

    // детали
    const panels = [];
    objs.forEach(function (it) {
      const o = it.o; if (val(o, 'Type', 0) !== 4002) return;
      const segs = contour(val(o, 'Contour', null));
      if (!segs.length) { warnings.push('Деталь «' + clean(val(o, 'Name', '')) + '» без контура — пропущена'); return; }
      const xs = [], ys = [];
      segs.forEach(function (s) { xs.push(s.x1, s.x2); ys.push(s.y1, s.y2); });
      panels.push({
        o: o, W: it.W, inv: inverse(it.W), segs: segs,
        x0: Math.min.apply(null, xs), x1: Math.max.apply(null, xs), y0: Math.min.apply(null, ys), y1: Math.max.apply(null, ys),
        T: val(o, 'Thick', 0), blind: 0, thr: 0, edge: 0
      });
    });

    // присадка: начало каждого отверстия крепежа → деталь, в которую оно попадает
    let holesTotal = 0, holesMiss = 0;
    objs.forEach(function (it) {
      if (val(it.o, 'Type', 0) !== 3001) return;
      const fe = furn[val(it.o, 'FastID', 0)]; const hs = fe && get(fe, 'Holes'); if (!hs) return;
      hs.c.forEach(function (h) {
        holesTotal++;
        const P = apply(it.W, [val(h, 'X', 0), val(h, 'Y', 0), val(h, 'Z', 0)]);
        const D = dirApply(it.W, [val(h, 'DirX', 0), val(h, 'DirY', 0), val(h, 'DirZ', 0)]);
        const depth = val(h, 'Depth', 0), e = 0.6;
        for (const p of panels) {
          const q = apply(p.inv, P);
          if (q[0] >= p.x0 - e && q[0] <= p.x1 + e && q[1] >= p.y0 - e && q[1] <= p.y1 + e && q[2] >= -e && q[2] <= p.T + e) {
            const dd = [p.inv.R[0][0] * D[0] + p.inv.R[0][1] * D[1] + p.inv.R[0][2] * D[2],
              p.inv.R[1][0] * D[0] + p.inv.R[1][1] * D[1] + p.inv.R[1][2] * D[2],
              p.inv.R[2][0] * D[0] + p.inv.R[2][1] * D[1] + p.inv.R[2][2] * D[2]];
            if (Math.abs(dd[2]) < 0.5) p.edge++;                       // вдоль плоскости — отверстие в торец
            else if (depth >= p.T - 0.5) p.thr++; else p.blind++;
            return;
          }
        }
        holesMiss++;
      });
    });
    if (holesMiss) warnings.push('Отверстий, не попавших ни в одну деталь: ' + holesMiss + ' из ' + holesTotal + ' (в присадку не вошли)');

    // детали → строки
    const rows = new Map();
    panels.forEach(function (p) {
      const o = p.o, X = p.x1 - p.x0, Y = p.y1 - p.y0;
      const texDir = val(o, 'TexDir', 0);
      const alongX = texDir === 1 ? true : texDir === 2 ? false : X >= Y;
      const L = alongX ? X : Y, Wd = alongX ? Y : X;
      const edges = { l1: '', l2: '', w1: '', w2: '' };
      // сторона сегмента определяется по положению на габарите детали: низ/верх — вдоль X, лево/право — вдоль Y
      const sideKey = alongX ? { bottom: 'l1', top: 'l2', left: 'w1', right: 'w2' } : { right: 'l1', left: 'l2', bottom: 'w1', top: 'w2' };
      function sideOf(s) {
        const tol = 0.6;
        if (Math.abs(s.y1 - p.y0) < tol && Math.abs(s.y2 - p.y0) < tol) return 'bottom';
        if (Math.abs(s.y1 - p.y1) < tol && Math.abs(s.y2 - p.y1) < tol) return 'top';
        if (Math.abs(s.x1 - p.x0) < tol && Math.abs(s.x2 - p.x0) < tol) return 'left';
        if (Math.abs(s.x1 - p.x1) < tol && Math.abs(s.x2 - p.x1) < tol) return 'right';
        return '';
      }
      const butts = get(o, 'Butts');
      if (butts) butts.c.forEach(function (bt) {
        const em = String(val(bt, 'Mat', '')).trim();
        const el = val(bt, 'Elem', -1);
        if (!em) return;
        const sg = p.segs[el], sd = sg ? sideOf(sg) : '';
        if (sd) edges[sideKey[sd]] = em;
        else warnings.push('Кромка на скошенной или вырезной стороне детали «' + clean(val(o, 'Name', '')) + '» — проверьте вручную');
      });
      let mill = 0;
      const cuts = get(o, 'Cuts');
      if (cuts) cuts.c.forEach(function (c) {
        const tr = val(c, 'Trajectory', null); if (!tr) return;
        const seg = contour(tr);
        seg.forEach(function (s) { mill += Math.hypot(s.x2 - s.x1, s.y2 - s.y1); });
      });
      const matRaw = String(val(o, 'Mat', ''));
      const part = {
        name: clean(val(o, 'Name', '')), matRaw: matRaw, material: clean(matRaw.split('\r')[0]), matCode: clean(matRaw.split('\r')[1] || ''),
        thickness: p.T, l: rnd(L), w: rnd(Wd), grain: texDir === 1 || texDir === 2, edges: edges,
        holesFaceBlind: p.blind, holesFaceThrough: p.thr, holesEdge: p.edge, millM: Math.round(mill) / 1000, qty: 1
      };
      if (!part.material) warnings.push('У детали «' + part.name + '» не указан материал');
      const key = JSON.stringify([part.name, part.matRaw, part.l, part.w, part.grain, edges, part.holesFaceBlind, part.holesFaceThrough, part.holesEdge, part.millM]);
      if (rows.has(key)) rows.get(key).qty++; else rows.set(key, part);
      p.key = key;
    });

    // фурнитура: верхний уровень (вложенные в сборки петель/направляющих не считаем отдельно)
    const SKIP = /^(без ограничителя|тело петли|штифт|отверстие глухое)/i;
    const hw = new Map();
    objs.forEach(function (it) {
      const t = val(it.o, 'Type', 0);
      if ([3001, 4001, 4004, 2004].indexOf(t) < 0) return;
      if (it.anc.indexOf(4001) >= 0 || it.anc.indexOf(4004) >= 0) return;
      const rawName = String(val(it.o, 'Name', '')), nm = clean(rawName.split('\r')[0]); if (!nm || SKIP.test(nm)) return;
      const cur = hw.get(nm) || { name: nm, code: clean(rawName.split('\r')[1] || ''), qty: 0, kind: t === 2004 ? 'profile' : 'hardware' };
      cur.qty++; hw.set(nm, cur);
    });

    // сцена для 3D-просмотра: контуры (петли), толщина, матрица в мире; фурнитура — точками
    const keys = Array.from(rows.keys());
    const r1 = function (v) { return Math.round(v * 10) / 10; }, r6 = function (v) { return Math.round(v * 1e6) / 1e6; };
    const scene = {
      panels: panels.map(function (p) {
        const loops = chainLoops(p.segs, r1);
        const W = p.W;
        return {
          name: clean(val(p.o, 'Name', '')), mat: clean(String(val(p.o, 'Mat', '')).split('\r')[0]), T: p.T,
          M: [W.R[0][0], W.R[0][1], W.R[0][2], W.R[1][0], W.R[1][1], W.R[1][2], W.R[2][0], W.R[2][1], W.R[2][2]].map(r6).concat(W.t.map(r1)),
          loops: loops.filter(function (l) { return l.length >= 6; }), row: keys.indexOf(p.key)
        };
      }),
      hardware: []
    };
    objs.forEach(function (it) {
      const t = val(it.o, 'Type', 0);
      if ([3001, 4001, 4004].indexOf(t) < 0 || it.anc.indexOf(4001) >= 0 || it.anc.indexOf(4004) >= 0) return;
      const nm = clean(String(val(it.o, 'Name', '')).split('\r')[0]); if (!nm || SKIP.test(nm)) return;
      scene.hardware.push({ name: nm, p: it.W.t.map(r1) });
    });

    return {
      scene: scene,
      name: name, parts: Array.from(rows.values()), hardware: Array.from(hw.values()), warnings: warnings,
      stats: { panels: panels.length, holes: holesTotal, holesMissed: holesMiss }
    };
  }

  // ---- перенос в заказ: подбор в базе по артикулу/названию, недостающее — в «08. Для разбора» ----
  function nm(s) { return String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim(); }
  function makeIndex(mb, MB) {
    const ix = { art: new Map(), name: new Map(), kind: new Map() };
    mb.materials.forEach(function (m) {
      const a = nm(m.article), n = nm(m.name), k = MB.kindOf(mb, m);
      if (a && !ix.art.has(k + '|' + a)) ix.art.set(k + '|' + a, m);
      if (a && !ix.art.has('*|' + a)) ix.art.set('*|' + a, m);
      if (n && !ix.name.has(k + '|' + n)) ix.name.set(k + '|' + n, m);
      if (n && !ix.name.has('*|' + n)) ix.name.set('*|' + n, m);
    });
    return ix;
  }
  function find(ix, type, name, code) {
    const t = type || '*';
    return (code && (ix.art.get(t + '|' + nm(code)) || ix.art.get('*|' + nm(code)))) || ix.name.get(t + '|' + nm(name)) || ix.name.get('*|' + nm(name)) ||
      (name && ix.art.get(t + '|' + nm(name))) || null;
  }
  const LANDING = { sheet: 'Листовые', edge: 'Кромочные', hardware: 'Фурнитура' };
  function landing(mb, MB, type) {
    let root = mb.groups.find(function (g) { return !g.parentId && /для разбора/i.test(g.name); });
    if (!root) root = MB.addGroup(mb, '', '08. Для разбора', 'other');
    let g = mb.groups.find(function (x) { return x.parentId === root.id && x.name === LANDING[type]; });
    if (!g) g = MB.addGroup(mb, root.id, LANDING[type], type);
    return g;
  }
  function ensure(mb, MB, ix, type, name, code, extra, created) {
    let m = find(ix, type, name, code); if (m) return m;
    m = MB.newMaterial(landing(mb, MB, type).id, Object.assign({ name: name, article: code || '', inStock: true, markup: { mode: 'mul', value: 1 } }, extra || {}));
    mb.materials.push(m); created.push(name);
    const a = nm(m.article), n = nm(m.name);
    if (a) { ix.art.set(type + '|' + a, m); ix.art.set('*|' + a, m); }
    ix.name.set(type + '|' + n, m); ix.name.set('*|' + n, m);
    return m;
  }

  /** parsed — результат parse(); mb — база «Сметы»; MB — Core.materialbase. Недостающие позиции добавляются в mb. */
  function toOrder(parsed, mb, MB) {
    const ix = makeIndex(mb, MB);
    const created = [], parts = [], warnings = parsed.warnings.slice();
    const area = new Map(), edgeM = new Map();
    parsed.parts.forEach(function (p) {
      const mat = p.material ? ensure(mb, MB, ix, 'sheet', p.material, p.matCode,
        { thickness: p.thickness || '', unit: 'лист', note: 'Создано при загрузке .b3d' }, created) : null;
      const edges = {};
      ['l1', 'l2', 'w1', 'w2'].forEach(function (k) {
        const raw = p.edges[k];
        if (!raw) { edges[k] = ''; return; }
        const bits = raw.split('\r'), ename = clean(bits[0]), ecode = clean(bits[1] || '');
        const em = ensure(mb, MB, ix, 'edge', ename, ecode, { unit: 'м.п.', note: 'Создано при загрузке .b3d' }, created);
        edges[k] = em.id;
        const len = (k === 'l1' || k === 'l2' ? p.l : p.w) * p.qty / 1000;
        edgeM.set(em.id, (edgeM.get(em.id) || 0) + len);
      });
      if (mat) area.set(mat.id, (area.get(mat.id) || 0) + p.l * p.w * p.qty / 1e6);
      parts.push({
        id: MB.uid('p'), name: p.name, materialId: mat ? mat.id : '', materialName: p.material, l: p.l, w: p.w, qty: p.qty, grain: p.grain,
        holesFaceBlind: p.holesFaceBlind, holesFaceThrough: p.holesFaceThrough, holesEdge: p.holesEdge, millM: p.millM, edges: edges
      });
    });
    const items = [];
    const byId = function (id) { return mb.materials.find(function (x) { return x.id === id; }); };
    area.forEach(function (a, id) {
      const m = byId(id); let qty = Math.round(a * 100) / 100;
      if (/^лист/i.test(m.unit || '') && num(m.sheetW) && num(m.sheetH)) qty = Math.ceil(a / (num(m.sheetW) * num(m.sheetH) / 1e6));
      const it = MB.estimateItemFromMaterial(mb, m, qty);
      it.auto = true; it.source = 'b3d'; items.push(it);
    });
    edgeM.forEach(function (mtr, id) {
      const it = MB.estimateItemFromMaterial(mb, byId(id), Math.round(mtr * 100) / 100); it.auto = true; it.source = 'b3d'; items.push(it);
    });
    parsed.hardware.forEach(function (h) {
      const m = ensure(mb, MB, ix, 'hardware', h.name, h.code, { unit: 'шт', note: 'Создано при загрузке .b3d' }, created);
      const it = MB.estimateItemFromMaterial(mb, m, h.qty); it.source = 'b3d'; items.push(it);
    });
    let model = null;
    if (parsed.scene) {
      model = { id: MB.uid('mdl'), name: parsed.name || '', panels: parsed.scene.panels.map(function (sp) {
        const o = Object.assign({}, sp); o.partId = parts[sp.row] ? parts[sp.row].id : ''; delete o.row; return o;
      }), hardware: parsed.scene.hardware };
    }
    return { name: parsed.name, parts: parts, items: items, created: Array.from(new Set(created)), warnings: warnings, model: model };
  }
  function num(x) { const n = Number(x); return isFinite(n) ? n : 0; }

  return { parse: parse, load: load, toOrder: toOrder };
});
