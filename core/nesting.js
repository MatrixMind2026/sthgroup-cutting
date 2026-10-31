/* Раскрой плитных материалов: MaxRects (лучшее по короткой стороне).
   Работает и в Node (тесты), и в окне программы. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.Core = root.Core || {}; root.Core.nesting = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {

  function intersects(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }
  function contains(a, b) { // a содержит b
    return b.x >= a.x && b.y >= a.y && b.x + b.w <= a.x + a.w && b.y + b.h <= a.y + a.h;
  }

  function splitFree(free, used) {
    const out = [];
    for (const f of free) {
      if (!intersects(f, used)) { out.push(f); continue; }
      if (used.x > f.x) out.push({ x: f.x, y: f.y, w: used.x - f.x, h: f.h });
      if (used.x + used.w < f.x + f.w) out.push({ x: used.x + used.w, y: f.y, w: f.x + f.w - (used.x + used.w), h: f.h });
      if (used.y > f.y) out.push({ x: f.x, y: f.y, w: f.w, h: used.y - f.y });
      if (used.y + used.h < f.y + f.h) out.push({ x: f.x, y: used.y + used.h, w: f.w, h: f.y + f.h - (used.y + used.h) });
    }
    // убрать вложенные
    const res = [];
    for (let i = 0; i < out.length; i++) {
      let inside = false;
      for (let j = 0; j < out.length; j++) {
        if (i !== j && contains(out[j], out[i]) && (!contains(out[i], out[j]) || j < i)) { inside = true; break; }
      }
      if (!inside && out[i].w > 0 && out[i].h > 0) res.push(out[i]);
    }
    return res;
  }

  function findPosition(sheet, w, h, canRotate) {
    let best = null;
    const tryOrient = (ww, hh, rotated) => {
      for (const f of sheet.free) {
        if (ww <= f.w + 1e-9 && hh <= f.h + 1e-9) {
          const short = Math.min(f.w - ww, f.h - hh);
          const long = Math.max(f.w - ww, f.h - hh);
          if (!best || short < best.short || (short === best.short && long < best.long)) {
            best = { x: f.x, y: f.y, w: ww, h: hh, rotated, short, long };
          }
        }
      }
    };
    tryOrient(w, h, false);
    if (canRotate && w !== h) tryOrient(h, w, true);
    return best;
  }

  function newSheet(W, H) {
    return { free: [{ x: 0, y: 0, w: W, h: H }], placed: [] };
  }

  function runOnce(items, W, H, kerf) {
    const sheets = [];
    const unplaced = [];
    for (const it of items) {
      const iw = it.w + kerf, ih = it.h + kerf;
      let done = false;
      for (const s of sheets) {
        const pos = findPosition(s, iw, ih, it.canRotate);
        if (pos) { put(s, pos, it, kerf); done = true; break; }
      }
      if (done) continue;
      const s = newSheet(W, H);
      const pos = findPosition(s, iw, ih, it.canRotate);
      if (!pos) { unplaced.push(it); continue; }
      sheets.push(s);
      put(s, pos, it, kerf);
    }
    return { sheets, unplaced };
  }

  function put(sheet, pos, it, kerf) {
    sheet.placed.push({
      partId: it.partId, name: it.name,
      x: pos.x, y: pos.y,
      w: pos.rotated ? it.h : it.w, h: pos.rotated ? it.w : it.h,
      rotated: pos.rotated
    });
    sheet.free = splitFree(sheet.free, { x: pos.x, y: pos.y, w: pos.w, h: pos.h });
  }

  function score(res, W, H) {
    return res.unplaced.length * 1e9 + res.sheets.length * 1e6 -
      (res.sheets.length ? Math.max(...res.sheets.map(function (s) { return s.free.reduce(function (m, f) { return Math.max(m, f.w * f.h); }, 0); })) / (W * H) * 1e5 : 0);
  }

  /**
   * parts: [{id,name,l,w,qty,canRotate}]  (мм)
   * sheet: {w,h}  opts: {kerf,trim,minOffcut}
   */
  function packMaterial(parts, sheet, opts) {
    opts = opts || {};
    const kerf = Number(opts.kerf) || 0;
    const trim = Number(opts.trim) || 0;
    const minOff = Number(opts.minOffcut) || 0;
    const W = sheet.w - 2 * trim + kerf;
    const H = sheet.h - 2 * trim + kerf;

    const items = [];
    for (const p of parts) {
      const q = Math.max(0, Math.round(Number(p.qty) || 0));
      for (let i = 0; i < q; i++) {
        items.push({ partId: p.id, name: p.name || '', w: Number(p.l), h: Number(p.w), canRotate: p.canRotate !== false });
      }
    }
    const orders = [
      function (a, b) { return b.w * b.h - a.w * a.h; },
      function (a, b) { return Math.max(b.w, b.h) - Math.max(a.w, a.h) || b.w * b.h - a.w * a.h; },
      function (a, b) { return b.h - a.h || b.w - a.w; },
      function (a, b) { return b.w - a.w || b.h - a.h; }
    ];
    let best = null;
    for (const cmp of orders) {
      const res = runOnce(items.slice().sort(cmp), W, H, kerf);
      const sc = score(res, W, H);
      if (!best || sc < best.sc) best = { res: res, sc: sc };
    }
    const res = best.res;

    const sheetArea = sheet.w * sheet.h;
    const outSheets = res.sheets.map(function (s, idx) {
      const placed = s.placed.map(function (p) {
        return { partId: p.partId, name: p.name, x: p.x + trim, y: p.y + trim, w: p.w, h: p.h, rotated: p.rotated };
      });
      const used = placed.reduce(function (a, p) { return a + p.w * p.h; }, 0);
      // деловые остатки: непересекающиеся свободные прямоугольники не меньше minOff
      const cand = s.free
        .map(function (f) {
          return { x: f.x + trim, y: f.y + trim, w: Math.min(f.w, W - f.x) - kerf, h: Math.min(f.h, H - f.y) - kerf };
        })
        .filter(function (f) { return f.w >= minOff && f.h >= minOff && minOff > 0; })
        .sort(function (a, b) { return b.w * b.h - a.w * a.h; });
      const offcuts = [];
      for (const c of cand) {
        if (!offcuts.some(function (o) { return intersects(o, c); })) offcuts.push(c);
      }
      return {
        index: idx + 1, placed: placed, usedArea: used, sheetArea: sheetArea,
        utilization: sheetArea ? used / sheetArea : 0, offcuts: offcuts
      };
    });
    return {
      sheetW: sheet.w, sheetH: sheet.h, trim: trim, kerf: kerf,
      sheets: outSheets,
      unplaced: res.unplaced.map(function (u) { return { partId: u.partId, name: u.name, l: u.w, w: u.h }; })
    };
  }

  return { packMaterial: packMaterial };
});
