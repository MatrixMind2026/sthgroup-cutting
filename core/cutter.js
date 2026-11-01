/* Раскрой: переходник между деталями заказа и гильотинным алгоритмом БазисReborn (core/rebcut.js).
   Результат — в прежнем виде (sheets[].placed в мм от угла листа), плюс резы и деловые остатки. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./rebcut.js'));
  else { root.Core = root.Core || {}; root.Core.cutter = factory(root.BM && root.BM.cut); }
})(typeof self !== 'undefined' ? self : this, function (cut) {

  function leaves(node, type, out) {
    if (!node) return out;
    if (node.t === type) out.push(node);
    (node.kids || []).forEach(function (k) { leaves(k, type, out); });
    return out;
  }
  function rnd(v) { return Math.round(v * 100) / 100; }

  /**
   * parts: [{id,name,l,w,qty,canRotate}]  sheet: {w,h}
   * opts: {kerf,trim,minOffcut,quality,corner, ...любые настройки cut.DEF}
   */
  function packMaterial(parts, sheet, opts) {
    if (!cut) throw new Error('Модуль раскроя не загружен');
    opts = opts || {};
    const trim = Number(opts.trim) || 0, minOff = Number(opts.minOffcut) || 0;
    const items = [], owner = [];
    parts.forEach(function (p) {
      const q = Math.max(0, Math.round(Number(p.qty) || 0));
      for (let i = 0; i < q; i++) {
        items.push({ l0: Number(p.l), w0: Number(p.w), qs: p.canRotate === false ? [0, 2] : [0, 1, 2, 3] });
        owner.push(p);
      }
    });
    const o = {
      kerf: Number(opts.kerf) >= 0 && opts.kerf !== '' && opts.kerf != null ? Number(opts.kerf) : 3.2,
      margin: trim, corner: opts.corner || 'ul', quality: opts.quality == null ? 1 : opts.quality,
      offL: minOff || 300, offW: minOff || 300
    };
    ['maxCut', 'maxStrip', 'oneBig', 'maxRot', 'first', 'minWaste'].forEach(function (k) { if (opts[k] !== undefined && opts[k] !== '') o[k] = opts[k]; });
    const bins = { L: sheet.w, W: sheet.h, rem: [] };
    const r = items.length ? cut.nest(items, bins, o) : { sheets: [], unplaced: [], tot: {}, saw: 0 };

    const sheetArea = sheet.w * sheet.h;
    const sheets = r.sheets.map(function (s, idx) {
      const placed = s.recs.map(function (rc) {
        const p = owner[rc.id];
        return { partId: p.id, name: p.name || '', x: rnd(rc.x + trim), y: rnd(rc.y + trim), w: rc.a, h: rc.b, rotated: !!(rc.q & 1), q: rc.q };
      });
      const used = placed.reduce(function (a, p) { return a + p.w * p.h; }, 0);
      const offcuts = leaves(s.tree, 'w', []).filter(function (n) {
        return Math.max(n.w, n.h) >= o.offL && Math.min(n.w, n.h) >= o.offW;
      }).map(function (n) { return { x: rnd(n.x + trim), y: rnd(n.y + trim), w: rnd(n.w), h: rnd(n.h) }; });
      return {
        index: idx + 1, placed: placed, usedArea: used, sheetArea: sheetArea,
        utilization: sheetArea ? used / sheetArea : 0, offcuts: offcuts,
        sawLen: s.saw, cutsN: s.cutsN, cuts: s.cuts, card: s.card, tree: s.tree
      };
    });
    const seen = {};
    return {
      sheetW: sheet.w, sheetH: sheet.h, trim: trim, kerf: o.kerf, sheets: sheets,
      unplaced: r.unplaced.map(function (id) { const p = owner[id]; return { partId: p.id, name: p.name || '', l: items[id].l0, w: items[id].w0 }; }),
      sawLen: r.saw || 0, cards: r.cards || 0, kim: (r.tot && r.tot.kim) || 0
    };
  }

  return { packMaterial: packMaterial };
});
