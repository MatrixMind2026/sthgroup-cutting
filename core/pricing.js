/* Расчёт заказа на коммерческий распил: раскрой, площади, присадка, фрезеровка, кромка, цена. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./nesting'));
  else { root.Core = root.Core || {}; root.Core.pricing = factory(root.Core.nesting); }
})(typeof self !== 'undefined' ? self : this, function (nesting) {

  const EDGE_SIDES = ['l1', 'l2', 'w1', 'w2']; // l — стороны по длине, w — по ширине

  function defaultPricing() {
    return {
      areaBasis: 'parts',     // 'parts' — по площади деталей, 'sheets' — по площади листов
      minOrder: 1000,
      kerf: 4, trim: 10, minOffcut: 300,
      cnc: {
        enabled: { holes: true, mill: true, perPart: false, time: false },
        holeFaceBlind: 10, holeFaceThrough: 15, holeEdge: 12,
        millPerM: 150, perPart: 50,
        machineHourRate: 3000, secPerHole: 6, secPerMillM: 30, secPerPart: 20
      }
    };
  }

  function round2(x) { return Math.round((x + Number.EPSILON) * 100) / 100; }
  function num(x) { const n = Number(String(x === undefined || x === null ? '' : x).replace(',', '.')); return isFinite(n) ? n : 0; }

  function partHoles(p) {
    return num(p.holesFaceBlind) + num(p.holesFaceThrough) + num(p.holesEdge);
  }
  function partIsCnc(p) {
    return !!p.cncForce || partHoles(p) > 0 || num(p.millM) > 0;
  }

  function findMaterial(base, id) {
    return (base.materials || []).find(function (m) { return m.id === id; });
  }
  function findEdge(base, id) {
    return (base.edges || []).find(function (e) { return e.id === id; });
  }

  /** Раскрой всех материалов заказа. */
  function cutOrder(order, base, pr) {
    const groups = {};
    const warnings = [];
    for (const p of order.parts || []) {
      if (!num(p.l) || !num(p.w) || !num(p.qty)) continue;
      if (!p.materialId) { warnings.push('Деталь «' + (p.name || '?') + '»: не выбран материал'); continue; }
      (groups[p.materialId] = groups[p.materialId] || []).push(p);
    }
    const result = [];
    for (const mid of Object.keys(groups)) {
      const m = findMaterial(base, mid);
      if (!m) { warnings.push('Материала «' + mid + '» нет в базе материалов'); continue; }
      const sw = num(m.sheetW), sh = num(m.sheetH);
      if (!sw || !sh) { warnings.push('У материала «' + m.name + '» не задан размер листа'); continue; }
      const parts = groups[mid].map(function (p) {
        return { id: p.id, name: p.name, l: num(p.l), w: num(p.w), qty: num(p.qty), canRotate: !p.grain };
      });
      const r = nesting.packMaterial(parts, { w: sw, h: sh }, { kerf: pr.kerf, trim: pr.trim, minOffcut: pr.minOffcut });
      const partsArea = parts.reduce(function (a, p) { return a + p.l * p.w * p.qty; }, 0) / 1e6;
      if (r.unplaced.length) {
        warnings.push('«' + m.name + '»: ' + r.unplaced.length + ' дет. не помещаются на лист ' + sw + '×' + sh);
      }
      result.push({
        materialId: mid, material: m, packing: r,
        sheets: r.sheets.length, partsArea: partsArea,
        sheetsArea: r.sheets.length * sw * sh / 1e6
      });
    }
    return { materials: result, warnings: warnings };
  }

  function edgeMeters(order) {
    const byEdge = {};
    for (const p of order.parts || []) {
      const q = num(p.qty), L = num(p.l), W = num(p.w);
      const e = p.edges || {};
      for (const side of EDGE_SIDES) {
        const id = e[side];
        if (!id) continue;
        const len = side[0] === 'l' ? L : W;
        byEdge[id] = (byEdge[id] || 0) + q * len / 1000;
      }
    }
    return byEdge;
  }

  function cncTotals(order) {
    const t = { faceBlind: 0, faceThrough: 0, edge: 0, millM: 0, cncParts: 0, seconds: 0 };
    return (order.parts || []).reduce(function (a, p) {
      const q = num(p.qty);
      a.faceBlind += q * num(p.holesFaceBlind);
      a.faceThrough += q * num(p.holesFaceThrough);
      a.edge += q * num(p.holesEdge);
      a.millM += q * num(p.millM);
      if (partIsCnc(p)) a.cncParts += q;
      return a;
    }, t);
  }

  /** Главный расчёт. Возвращает {lines,subtotal,discount,minTopUp,total,cutting,warnings,...} */
  function calcOrder(order, base, settings) {
    const pr = Object.assign(defaultPricing(), (settings && settings.pricing) || {});
    pr.cnc = Object.assign(defaultPricing().cnc, pr.cnc || {});
    pr.cnc.enabled = Object.assign(defaultPricing().cnc.enabled, (pr.cnc && pr.cnc.enabled) || {});
    const basis = order.areaBasis || pr.areaBasis;
    const lines = [];
    const warnings = [];

    const cut = cutOrder(order, base, pr);
    warnings.push.apply(warnings, cut.warnings);

    // 1. Распил по площади
    for (const c of cut.materials) {
      const area = basis === 'sheets' ? c.sheetsArea : c.partsArea;
      const rate = num(c.material.servicePerM2);
      lines.push({
        group: 'cut',
        title: 'Распил: ' + c.material.name + (basis === 'sheets' ? ' (по площади листов, ' + c.sheets + ' шт.)' : ' (по площади деталей)'),
        qty: round2(area), unit: 'м²', price: rate, sum: round2(area * rate)
      });
      if (order.ownMaterial) {
        const sp = num(c.material.salePerSheet);
        lines.push({
          group: 'material', title: 'Материал (наш): ' + c.material.name,
          qty: c.sheets, unit: 'лист', price: sp, sum: round2(c.sheets * sp)
        });
        if (!sp) warnings.push('У материала «' + c.material.name + '» не указана цена листа для продажи');
      }
    }

    // 2. Кромка
    const em = edgeMeters(order);
    for (const id of Object.keys(em)) {
      const e = findEdge(base, id);
      if (!e) { warnings.push('Кромки «' + id + '» нет в базе материалов'); continue; }
      const m = round2(em[id]);
      lines.push({
        group: 'edge', title: 'Кромление: ' + e.name, qty: m, unit: 'м.п.',
        price: num(e.servicePerM), sum: round2(m * num(e.servicePerM))
      });
      if (order.ownEdge) {
        lines.push({
          group: 'edge', title: 'Кромка (наша): ' + e.name, qty: m, unit: 'м.п.',
          price: num(e.salePerM), sum: round2(m * num(e.salePerM))
        });
      }
    }

    // 3. ЧПУ: присадка и фрезеровка
    const t = cncTotals(order);
    const cn = pr.cnc, en = cn.enabled;
    if (en.holes) {
      if (t.faceBlind) lines.push({ group: 'cnc', title: 'Присадка: глухие отверстия в пласть', qty: t.faceBlind, unit: 'шт.', price: num(cn.holeFaceBlind), sum: round2(t.faceBlind * num(cn.holeFaceBlind)) });
      if (t.faceThrough) lines.push({ group: 'cnc', title: 'Присадка: сквозные отверстия', qty: t.faceThrough, unit: 'шт.', price: num(cn.holeFaceThrough), sum: round2(t.faceThrough * num(cn.holeFaceThrough)) });
      if (t.edge) lines.push({ group: 'cnc', title: 'Присадка: отверстия в торец', qty: t.edge, unit: 'шт.', price: num(cn.holeEdge), sum: round2(t.edge * num(cn.holeEdge)) });
    }
    if (en.mill && t.millM) {
      lines.push({ group: 'cnc', title: 'Фрезеровка на ЧПУ', qty: round2(t.millM), unit: 'м.п.', price: num(cn.millPerM), sum: round2(t.millM * num(cn.millPerM)) });
    }
    if (en.perPart && t.cncParts) {
      lines.push({ group: 'cnc', title: 'Обработка детали на ЧПУ', qty: t.cncParts, unit: 'дет.', price: num(cn.perPart), sum: round2(t.cncParts * num(cn.perPart)) });
    }
    const seconds = (t.faceBlind + t.faceThrough + t.edge) * num(cn.secPerHole) + t.millM * num(cn.secPerMillM) + t.cncParts * num(cn.secPerPart);
    const machineHours = seconds / 3600;
    if (en.time && machineHours > 0) {
      lines.push({ group: 'cnc', title: 'Машинное время ЧПУ', qty: round2(machineHours), unit: 'ч', price: num(cn.machineHourRate), sum: round2(machineHours * num(cn.machineHourRate)) });
    }

    // 4. Прочие позиции, добавленные вручную
    for (const x of order.extraLines || []) {
      const q = num(x.qty), p = num(x.price);
      if (!x.title) continue;
      lines.push({ group: 'extra', title: x.title, qty: q, unit: x.unit || 'шт.', price: p, sum: round2(q * p) });
    }

    // 5. Смета из базы материалов (если включена в итог заказа)
    const est = order.estimate;
    if (est && est.inTotal) {
      for (const x of est.items || []) {
        const q = num(x.qty), p = num(x.priceSell);
        if (!x.name || !q) continue;
        lines.push({ group: 'estimate', title: x.name + (x.article ? ' (арт. ' + x.article + ')' : ''), qty: q, unit: x.unit || 'шт.', price: p, sum: round2(q * p) });
      }
      if (order.ownMaterial || order.ownEdge) warnings.push('Смета включена в итог, а в заказе стоит «Материал/кромка наши»: проверьте, нет ли двойного учёта.');
    }

    const subtotal = round2(lines.reduce(function (a, l) { return a + l.sum; }, 0));
    const discountPct = Math.min(100, Math.max(0, num(order.discountPct)));
    const discount = round2(subtotal * discountPct / 100);
    const afterDiscount = round2(subtotal - discount);
    const minOrder = num(pr.minOrder);
    const hasWork = lines.length > 0;
    const minTopUp = hasWork && afterDiscount < minOrder ? round2(minOrder - afterDiscount) : 0;
    const total = round2(afterDiscount + minTopUp);

    const paid = round2((order.payments || []).reduce(function (a, p) { return a + num(p.amount); }, 0));
    return {
      lines: lines, subtotal: subtotal, discountPct: discountPct, discount: discount,
      minOrder: minOrder, minTopUp: minTopUp, total: total,
      paid: paid, debt: round2(total - paid),
      basis: basis, cutting: cut.materials, warnings: warnings,
      cnc: t, machineHours: round2(machineHours),
      partsCount: (order.parts || []).reduce(function (a, p) { return a + num(p.qty); }, 0),
      partsArea: round2(cut.materials.reduce(function (a, c) { return a + c.partsArea; }, 0)),
      sheetsArea: round2(cut.materials.reduce(function (a, c) { return a + c.sheetsArea; }, 0))
    };
  }

  return { calcOrder: calcOrder, defaultPricing: defaultPricing, edgeMeters: edgeMeters, partIsCnc: partIsCnc, round2: round2, num: num, EDGE_SIDES: EDGE_SIDES };
});
