/* Чтение базы материалов Базис-Мебельщика из файла Firebird 2.5 (NK_BAZE.FDB) без сервера Firebird.
   Читаем только нужное: страницы данных, сжатие записей, описание таблиц из системных таблиц.
   Результат — записи в том же виде, что и выгрузка XML (теги Material), чтобы использовать общий импорт. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.Core = root.Core || {}; root.Core.fdb = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {

  let scratch = Buffer.alloc(1 << 16);
  /** Распаковка RLE во внутренний буфер: результат действителен до следующего вызова (записи обрабатываются по одной). */
  function decomp(b) {
    let i = 0, o = 0; const n = b.length;
    while (i < n) {
      let c = b[i++]; if (c > 127) c -= 256;
      const need = o + (c > 0 ? c : -c);
      if (need > scratch.length) { const nb = Buffer.alloc(Math.max(need, scratch.length * 2)); scratch.copy(nb, 0, 0, o); scratch = nb; }
      if (c > 0) { b.copy(scratch, o, i, i + c); i += c; o += c; }
      else if (c < 0) { scratch.fill(b[i++], o, o - c); o += -c; }
    }
    return scratch.subarray(0, o);
  }
  function cs(b) { let e = b.length; while (e > 0 && (b[e - 1] === 32 || b[e - 1] === 0)) e--; return b.toString('utf8', 0, e); }

  function open(buf) {
    if (buf.length < 16384 || buf[0] !== 1) throw new Error('это не файл базы Firebird');
    const PS = buf.readUInt16LE(16);
    if ([4096, 8192, 16384].indexOf(PS) < 0) throw new Error('неизвестный размер страницы ' + PS);
    const ods = buf.readUInt16LE(18) & 0x7fff;
    if (ods < 10 || ods > 11) throw new Error('версия формата базы Firebird (ODS ' + ods + ') не поддерживается — нужна база из Базиса (Firebird 2.5)');
    const NP = Math.floor(buf.length / PS), byRel = new Map();
    for (let i = 0; i < NP; i++) {
      if (buf[i * PS] !== 5) continue;
      const r = buf.readUInt16LE(i * PS + 20);
      if (!byRel.has(r)) byRel.set(r, []); byRel.get(r).push(i);
    }
    function* records(rel) {
      for (const pg of byRel.get(rel) || []) {
        const base = pg * PS, cnt = buf.readUInt16LE(base + 22);
        for (let s = 0; s < cnt; s++) {
          const off = buf.readUInt16LE(base + 24 + 4 * s), ln = buf.readUInt16LE(base + 26 + 4 * s);
          if (!off || !ln) continue;
          const fl = buf.readUInt16LE(base + off + 10);
          if (fl & (1 | 2 | 4 | 16 | 32)) continue; // удалена, старая версия, продолжение, blob, дельта
          let raw;
          if (fl & 8) { // запись из нескольких фрагментов
            const parts = [buf.subarray(base + off + 22, base + off + ln)];
            let fp = buf.readUInt32LE(base + off + 16), fln = buf.readUInt16LE(base + off + 20), guard = 0;
            while (fp && guard++ < 1000) {
              const q = fp * PS, o2 = buf.readUInt16LE(q + 24 + 4 * fln), l2 = buf.readUInt16LE(q + 26 + 4 * fln);
              const f2 = buf.readUInt16LE(q + o2 + 10);
              if (f2 & 8) { parts.push(buf.subarray(q + o2 + 22, q + o2 + l2)); fp = buf.readUInt32LE(q + o2 + 16); fln = buf.readUInt16LE(q + o2 + 20); }
              else { parts.push(buf.subarray(q + o2 + 13, q + o2 + l2)); fp = 0; }
            }
            raw = Buffer.concat(parts);
          } else raw = buf.subarray(base + off + 13, base + off + ln);
          yield decomp(raw);
        }
      }
    }
    // описание таблиц
    const rels = new Map();
    for (const r of records(6)) if (r.length > 80) rels.set(cs(r.subarray(42, 73)), r.readUInt16LE(32));
    const ftypes = new Map();
    for (const r of records(2)) if (r.length > 200) ftypes.set(cs(r.subarray(4, 35)), { length: r.readUInt16LE(120), scale: r.readInt16LE(122), type: r.readUInt16LE(124) });
    const rf = new Map();
    for (const r of records(5)) {
      if (r.length <= 300) continue;
      const t = cs(r.subarray(35, 66)); if (!rf.has(t)) rf.set(t, []);
      rf.get(t).push({ pos: r.readUInt16LE(290), name: cs(r.subarray(4, 35)), src: cs(r.subarray(66, 97)) });
    }
    const ALIGN = { 7: 2, 8: 4, 10: 4, 12: 4, 13: 4, 14: 1, 16: 8, 27: 8, 35: 4, 37: 2, 261: 4 };
    const SIZE = { 7: 2, 8: 4, 10: 4, 12: 4, 13: 4, 16: 8, 27: 8, 35: 8, 261: 8 };
    function layout(table) {
      const fl = (rf.get(table) || []).slice().sort(function (a, b) { return a.pos - b.pos; });
      if (!fl.length) throw new Error('в базе нет таблицы ' + table + ' — это не база материалов Базиса');
      let off = Math.ceil(Math.ceil(fl.length / 8) / 4) * 4; const cols = [];
      fl.forEach(function (f) {
        const t = ftypes.get(f.src); if (!t || !ALIGN[t.type]) throw new Error('неизвестный тип поля ' + f.name);
        const sz = t.type === 37 ? t.length + 2 : t.type === 14 ? t.length : SIZE[t.type];
        off = Math.ceil(off / ALIGN[t.type]) * ALIGN[t.type];
        cols.push({ name: f.name, type: t.type, off: off, len: t.length, scale: t.scale }); off += sz;
      });
      return cols;
    }
    function table(name) {
      const cols = layout(name), rel = rels.get(name), out = [];
      if (rel === undefined) throw new Error('в базе нет таблицы ' + name);
      for (const r of records(rel)) {
        const row = {};
        cols.forEach(function (c, i) {
          if ((r[i >> 3] >> (i & 7)) & 1) { row[c.name] = null; return; }
          if (c.type === 37) { const n = r.readUInt16LE(c.off); row[c.name] = r.toString('utf8', c.off + 2, c.off + 2 + n); }
          else if (c.type === 14) row[c.name] = cs(r.subarray(c.off, c.off + c.len));
          else if (c.type === 8) row[c.name] = r.readInt32LE(c.off);
          else if (c.type === 7) row[c.name] = r.readInt16LE(c.off);
          else if (c.type === 27) row[c.name] = r.readDoubleLE(c.off);
          else if (c.type === 16) row[c.name] = Number(r.readBigInt64LE(c.off)) * Math.pow(10, c.scale);
          else row[c.name] = null; // blob и прочее не нужны
        });
        out.push(row);
      }
      return out;
    }
    return { table: table, tables: function () { return Array.from(rf.keys()); } };
  }

  function numStr(x) {
    if (x === null || x === undefined) return '0';
    return String(Math.round(x * 1e6) / 1e6);
  }

  /** Читает базу материалов и возвращает { records: [теги Material], groups: [пути пустых и всех групп] }. */
  function readMaterials(buf) {
    const db = open(buf);
    const M = db.table('MATERIAL'), G = db.table('GROUP_MATERIAL');
    const adv = new Map(db.table('MATERIAL_ADVANCE').map(function (r) { return [r.ID_M, r]; }));
    const unit = new Map(db.table('MEASURE').map(function (r) { return [r.ID_MS, r.NAME_MEAS]; }));
    const cls = new Map(db.table('CLASS_MATERIAL').map(function (r) { return [r.ID_CM, r]; }));
    const links = new Map();
    db.table('LINK_MATERIAL_CLASS').forEach(function (r) { if (!links.has(r.ID_M)) links.set(r.ID_M, []); links.get(r.ID_M).push(r.ID_CM); });
    const groups = new Map(G.map(function (r) { return [r.ID_GRM, r]; }));
    const roots = G.filter(function (r) { return r.ENTRY === null || r.ENTRY === undefined || !groups.has(r.ENTRY); });
    const stripRoot = roots.length === 1 ? roots[0].ID_GRM : -1;
    const pcache = new Map();
    function gpath(id) {
      if (pcache.has(id)) return pcache.get(id);
      const out = []; let g = groups.get(id), guard = 0;
      while (g && guard++ < 60) { if (g.ID_GRM === stripRoot && out.length) break; out.unshift(g.NAME_GROUP); g = groups.get(g.ENTRY); }
      const p = out.join('/'); pcache.set(id, p); return p;
    }
    const records = M.map(function (m) {
      const a = adv.get(m.ID_M) || {}, g = groups.get(m.ID_GRM) || {};
      const cl = (links.get(m.ID_M) || []).slice().sort(function (x, y) { return x - y; }).map(function (id) { return 'M' + (id - 1) + ' '; }).join('');
      return {
        Article: m.ARTICLE || '', Name: m.NAME_MAT || '', Group_Name: gpath(m.ID_GRM), Unit_Measure: unit.get(m.ID_MS) || '',
        Price: numStr(m.PRICE), Coef: numStr(m.COEF_EXC), Length: numStr(a.LENGTH), Width: numStr(a.WIDTH), Thickness: numStr(a.THICKNESS),
        Sign: a.LABEL_EDGE || '', Overhang: numStr(a.OVERHANG), Class: cl, IsTape: a.ISTAPE === 1 ? 'Y' : 'N', Sync_External: m.SYNC_EXTERNAL || '',
        Weight: numStr(m.WEIGHT), Comment: m.COMMENT || '', NoAvailable: m.NOAVAILABLE ? 'Y' : 'N', Coef_Exc_Cutting: numStr(m.COEF_EXC_CUTTING),
        Type_Group_Material: String(g.ID_TM || 2)
      };
    });
    return { records: records, groups: G.map(function (g) { return gpath(g.ID_GRM); }).filter(Boolean) };
  }

  return { open: open, readMaterials: readMaterials };
});
