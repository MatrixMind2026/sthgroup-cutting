/* Импорт списка деталей: CSV из Excel и модель .bmk (JSON внутри файла или архива).
   Формат .bmk здесь читается эвристически — по названиям полей. Если у вашего файла
   другие поля, достаточно добавить их в ALIASES. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.Core = root.Core || {}; root.Core.importers = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {

  const ALIASES = {
    name: ['название', 'наименование', 'деталь', 'имя', 'name', 'title', 'partname'],
    material: ['материал', 'material', 'mat', 'materialname', 'mater'],
    l: ['длина', 'l', 'length', 'len', 'dlina', 'длина, мм', 'размер1', 'height', 'h'],
    w: ['ширина', 'w', 'width', 'wid', 'shirina', 'ширина, мм', 'размер2'],
    qty: ['количество', 'кол-во', 'колво', 'шт', 'шт.', 'qty', 'count', 'quantity', 'amount', 'n'],
    grain: ['текстура', 'направление волокон', 'grain', 'texture'],
    holesFaceBlind: ['отв. глухие', 'глухие', 'глухих', 'blind', 'holesfaceblind'],
    holesFaceThrough: ['отв. сквозные', 'сквозные', 'сквозных', 'through', 'holesfacethrough'],
    holesEdge: ['отв. торец', 'торец', 'в торец', 'edgeholes', 'holesedge'],
    millM: ['фрезеровка, м', 'фрезеровка', 'фрезеровка м', 'mill', 'millm', 'milling'],
    l1: ['кромка l1', 'кромка длина 1', 'l1', 'edge_l1'],
    l2: ['кромка l2', 'кромка длина 2', 'l2', 'edge_l2'],
    w1: ['кромка w1', 'кромка ширина 1', 'w1', 'edge_w1'],
    w2: ['кромка w2', 'кромка ширина 2', 'w2', 'edge_w2']
  };

  function norm(s) { return String(s === undefined || s === null ? '' : s).trim().toLowerCase().replace(/ё/g, 'е'); }
  function toNum(x) { const n = Number(String(x === undefined || x === null ? '' : x).replace(/\s/g, '').replace(',', '.')); return isFinite(n) ? n : 0; }

  function fieldFor(header) {
    const h = norm(header);
    for (const f of Object.keys(ALIASES)) {
      if (ALIASES[f].some(function (a) { return norm(a) === h; })) return f;
    }
    return null;
  }

  function splitCsv(text) {
    text = text.replace(/^﻿/, '');
    const firstLine = text.split(/\r?\n/)[0] || '';
    const delim = [';', '\t', ','].map(function (d) { return [d, firstLine.split(d).length]; }).sort(function (a, b) { return b[1] - a[1]; })[0][0];
    const rows = [];
    let row = [], cur = '', inQ = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQ) {
        if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
        else cur += c;
      } else if (c === '"') inQ = true;
      else if (c === delim) { row.push(cur); cur = ''; }
      else if (c === '\n') { row.push(cur.replace(/\r$/, '')); rows.push(row); row = []; cur = ''; }
      else cur += c;
    }
    if (cur !== '' || row.length) { row.push(cur.replace(/\r$/, '')); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (c) { return String(c).trim() !== ''; }); });
  }

  function matchMaterial(name, base) {
    const n = norm(name);
    if (!n) return '';
    const mats = (base && base.materials) || [];
    let m = mats.find(function (x) { return norm(x.name) === n || norm(x.id) === n; });
    if (!m) m = mats.find(function (x) { return norm(x.name).indexOf(n) >= 0 || n.indexOf(norm(x.name)) >= 0; });
    return m ? m.id : '';
  }

  function edgeId(val, base) {
    const v = norm(val);
    if (!v || v === '0' || v === 'нет' || v === '-') return '';
    const es = (base && base.edges) || [];
    const e = es.find(function (x) { return norm(x.id) === v || norm(x.name) === v; });
    if (e) return e.id;
    if (v === '1' || v === 'да' || v === '+' || v === 'x' || v === 'х') return es.length ? es[0].id : '';
    const e2 = es.find(function (x) { return norm(x.name).indexOf(v) >= 0; });
    return e2 ? e2.id : '';
  }

  let seq = 0;
  function uid() { seq++; return 'p' + Date.now().toString(36) + seq.toString(36); }

  function buildPart(raw, base, warnings) {
    const p = {
      id: uid(), name: raw.name || '', materialId: '', materialName: raw.material || '',
      l: toNum(raw.l), w: toNum(raw.w), qty: raw.qty === undefined || raw.qty === '' ? 1 : toNum(raw.qty),
      grain: /^(1|да|true|yes|x|х|вдоль|l)$/i.test(String(raw.grain || '').trim()),
      holesFaceBlind: toNum(raw.holesFaceBlind), holesFaceThrough: toNum(raw.holesFaceThrough),
      holesEdge: toNum(raw.holesEdge), millM: toNum(raw.millM),
      edges: { l1: edgeId(raw.l1, base), l2: edgeId(raw.l2, base), w1: edgeId(raw.w1, base), w2: edgeId(raw.w2, base) }
    };
    p.materialId = matchMaterial(raw.material, base);
    if (raw.material && !p.materialId) warnings.add('Материал «' + raw.material + '» не найден в базе — выберите вручную');
    return p;
  }

  function newWarnings() {
    const set = new Set();
    return { add: function (s) { set.add(s); }, list: function () { return Array.from(set); } };
  }

  /** CSV/TSV из Excel (Сохранить как: CSV). */
  function parseCsv(text, base) {
    const rows = splitCsv(text);
    const w = newWarnings();
    if (rows.length < 2) return { parts: [], warnings: ['Файл пустой или без строк с деталями'] };
    const map = rows[0].map(fieldFor);
    if (map.indexOf('l') < 0 || map.indexOf('w') < 0) {
      return { parts: [], warnings: ['Не нашёл колонки «Длина» и «Ширина» в первой строке. Скачайте шаблон CSV из программы.'] };
    }
    const parts = [];
    for (let i = 1; i < rows.length; i++) {
      const raw = {};
      rows[i].forEach(function (cell, j) { if (map[j]) raw[map[j]] = cell; });
      if (!toNum(raw.l) || !toNum(raw.w)) continue;
      parts.push(buildPart(raw, base, w));
    }
    return { parts: parts, warnings: w.list() };
  }

  function csvTemplate() {
    return '﻿Название;Материал;Длина;Ширина;Кол-во;Текстура;Кромка L1;Кромка L2;Кромка W1;Кромка W2;Отв. глухие;Отв. сквозные;Отв. торец;Фрезеровка, м\r\n' +
      'Боковина;ЛДСП 16 Белый;720;560;2;;;;;;4;0;2;0\r\n' +
      'Полка;ЛДСП 16 Белый;564;300;4;;;;;;0;0;0;0\r\n';
  }

  // ---- .bmk (JSON) ----
  function lowerKeys(o) {
    const r = {};
    Object.keys(o).forEach(function (k) { r[norm(k)] = o[k]; });
    return r;
  }
  function pick(lk, field) {
    for (const a of ALIASES[field]) { const k = norm(a); if (lk[k] !== undefined && lk[k] !== null && typeof lk[k] !== 'object') return lk[k]; }
    return undefined;
  }
  function looksLikePart(o) {
    if (!o || typeof o !== 'object' || Array.isArray(o)) return false;
    const lk = lowerKeys(o);
    const l = toNum(pick(lk, 'l')), w = toNum(pick(lk, 'w'));
    return l > 0 && w > 0;
  }
  function findPartArrays(node, out, depth) {
    if (depth > 8 || !node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      const objs = node.filter(function (x) { return x && typeof x === 'object' && !Array.isArray(x); });
      if (objs.length >= 1 && objs.filter(looksLikePart).length >= Math.ceil(objs.length * 0.7)) { out.push(objs.filter(looksLikePart)); return; }
      node.forEach(function (x) { findPartArrays(x, out, depth + 1); });
      return;
    }
    Object.keys(node).forEach(function (k) { findPartArrays(node[k], out, depth + 1); });
  }

  /** obj — разобранный JSON из .bmk. */
  function parseBmkObject(obj, base) {
    const arrays = [];
    findPartArrays(obj, arrays, 0);
    const w = newWarnings();
    if (!arrays.length) return { parts: [], warnings: ['В файле не найден список деталей. Формат .bmk не распознан — пришлите образец, подстрою импорт.'] };
    arrays.sort(function (a, b) { return b.length - a.length; });
    const parts = arrays[0].map(function (o) {
      const lk = lowerKeys(o);
      const raw = {};
      Object.keys(ALIASES).forEach(function (f) { const v = pick(lk, f); if (v !== undefined) raw[f] = v; });
      // присадка/фрезеровка массивами
      ['holes', 'drilling', 'присадка'].forEach(function (k) {
        if (Array.isArray(lk[k]) && raw.holesFaceBlind === undefined && raw.holesFaceThrough === undefined) {
          let blind = 0, thr = 0, edge = 0;
          lk[k].forEach(function (h) {
            const hk = lowerKeys(h || {});
            if (hk.edge === true || /торец|edge/.test(norm(hk.side || hk.face || ''))) edge++;
            else if (hk.through === true || /сквоз|through/.test(norm(hk.type || ''))) thr++;
            else blind++;
          });
          raw.holesFaceBlind = blind; raw.holesFaceThrough = thr; raw.holesEdge = edge;
        }
      });
      return buildPart(raw, base, w);
    });
    if (arrays.length > 1) w.add('В файле несколько списков; взят самый большой (' + parts.length + ' строк). Проверьте результат.');
    return { parts: parts, warnings: w.list() };
  }

  function parseBmkText(text, base) {
    let obj;
    try { obj = JSON.parse(text.replace(/^﻿/, '')); }
    catch (e) { return { parts: [], warnings: ['Файл .bmk не читается как JSON: ' + e.message] }; }
    return parseBmkObject(obj, base);
  }

  return { parseCsv: parseCsv, csvTemplate: csvTemplate, parseBmkObject: parseBmkObject, parseBmkText: parseBmkText, ALIASES: ALIASES };
});
