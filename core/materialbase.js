/* База материалов («Смета»): дерево групп, материалы, наценки, история цен, XML/CSV обмен.
   Устроена по образцу «Базы материалов и комплектующих» Базис-Мебельщика. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.Core = root.Core || {}; root.Core.materialbase = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {

  const GROUP_TYPES = {
    sheet: 'Листовые', edge: 'Кромочные', linear: 'Погонные',
    hardware: 'Фурнитура и изделия', service: 'Услуги и работы', other: 'Прочие'
  };
  const UNITS = ['шт.', 'м²', 'м.п.', 'м³', 'кг', 'лист', 'компл.', 'упак.', 'ч'];
  const MARKUP_MODES = {
    inherit: 'как у группы', none: 'нет (цена вручную)', percent: 'процент к закупке',
    mul: 'умножить закупку', add: 'добавить к закупке', fixed: 'фиксированная цена'
  };

  function num(x) {
    if (typeof x === 'number') return isFinite(x) ? x : 0;
    const n = Number(String(x === undefined || x === null ? '' : x).replace(/[\s ]/g, '').replace(',', '.'));
    return isFinite(n) ? n : 0;
  }
  function round2(x) { return Math.round((x + Number.EPSILON) * 100) / 100; }
  function uid(p) { return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function nowIso() { return new Date().toISOString(); }

  // ---------- создание ----------
  function emptyBase(withDefaults) {
    const b = { version: 2, groups: [], materials: [] };
    if (withDefaults) {
      [['01. Листовые материалы', 'sheet'], ['02. Кромочные материалы', 'edge'], ['03. Погонные материалы', 'linear'],
        ['04. Фурнитура', 'hardware'], ['05. Покупные изделия', 'hardware'], ['06. Услуги и работы', 'service']
      ].forEach(function (g) { addGroup(b, '', g[0], g[1]); });
    }
    return b;
  }
  function newMaterial(gid, f) {
    return Object.assign({
      id: uid('m'), groupId: gid || '', name: '', article: '', code: '', syncId: '', supplier: '', unit: 'шт.',
      thickness: '', sheetW: '', sheetH: '', grain: false, excess: '',
      priceBuy: '', priceSell: '', servicePrice: '', markup: { mode: 'inherit', value: '' },
      url: '', note: '', inStock: true, classes: '', history: [], extra: {}, updated: nowIso()
    }, f || {});
  }

  // ---------- группы ----------
  function groupById(b, id) { return b.groups.find(function (g) { return g.id === id; }); }
  function children(b, pid) { return b.groups.filter(function (g) { return (g.parentId || '') === (pid || ''); }); }
  function groupPath(b, gid) {
    const out = []; let g = groupById(b, gid), guard = 0;
    while (g && guard++ < 50) { out.unshift(g.name); g = g.parentId ? groupById(b, g.parentId) : null; }
    return out;
  }
  function groupType(b, gid) {
    let g = groupById(b, gid), guard = 0;
    while (g && guard++ < 50) { if (g.type) return g.type; g = g.parentId ? groupById(b, g.parentId) : null; }
    return 'other';
  }
  function descendantIds(b, gid) {
    const out = [gid], q = [gid];
    while (q.length) { const x = q.pop(); children(b, x).forEach(function (c) { out.push(c.id); q.push(c.id); }); }
    return out;
  }
  function addGroup(b, parentId, name, type) {
    const g = { id: uid('g'), parentId: parentId || '', name: name || 'Новая группа', type: type || '', markup: { mode: 'inherit', value: '', round: 2 } };
    b.groups.push(g); return g;
  }
  function moveGroup(b, gid, newParent) {
    if (newParent && descendantIds(b, gid).indexOf(newParent) >= 0) return false; // нельзя внутрь себя
    const g = groupById(b, gid); if (!g) return false;
    g.parentId = newParent || ''; return true;
  }
  function deleteGroup(b, gid) {
    const ids = descendantIds(b, gid);
    const nm = b.materials.filter(function (m) { return ids.indexOf(m.groupId) >= 0; }).length;
    b.materials = b.materials.filter(function (m) { return ids.indexOf(m.groupId) < 0; });
    b.groups = b.groups.filter(function (g) { return ids.indexOf(g.id) < 0; });
    return { groups: ids.length, materials: nm };
  }
  /** Найти или создать цепочку групп по пути ['01. Листовые','ЛДСП']. */
  function ensureGroupPath(b, parts, guessType) {
    let pid = '';
    parts.forEach(function (name, i) {
      name = String(name).trim(); if (!name) return;
      let g = b.groups.find(function (x) { return (x.parentId || '') === pid && x.name === name; });
      if (!g) g = addGroup(b, pid, name, i === 0 ? (guessType || '') : '');
      pid = g.id;
    });
    return pid;
  }
  function guessTypeByName(s) {
    s = String(s || '').toLowerCase();
    if (/кром/.test(s)) return 'edge';
    if (/услуг|работ|распил/.test(s)) return 'service';
    if (/погон|столешн|цокол|профил/.test(s)) return 'linear';
    if (/фурнит|покупн|крепеж|крепёж|изделия/.test(s)) return 'hardware';
    if (/лист|плит|лдсп|мдф|хдф|двп|фанер/.test(s)) return 'sheet';
    return '';
  }

  // ---------- материалы ----------
  function copyMaterial(b, id) {
    const m = b.materials.find(function (x) { return x.id === id; }); if (!m) return null;
    const c = JSON.parse(JSON.stringify(m));
    c.id = uid('m'); c.name = m.name + ' (копия)'; c.history = []; c.syncId = ''; c.updated = nowIso();
    b.materials.push(c); return c;
  }
  function moveMaterials(b, ids, gid) {
    b.materials.forEach(function (m) { if (ids.indexOf(m.id) >= 0) m.groupId = gid; });
  }
  function deleteMaterials(b, ids) {
    const n = b.materials.length;
    b.materials = b.materials.filter(function (m) { return ids.indexOf(m.id) < 0; });
    return n - b.materials.length;
  }
  function kindOf(b, m) { return groupType(b, m.groupId); }

  // ---------- наценка и цена ----------
  function roundBy(x, digits) {
    const d = Math.round(num(digits === undefined || digits === '' ? 2 : digits));
    const f = Math.pow(10, d);
    return Math.round((x + Number.EPSILON) * f) / f;
  }
  function markupRule(b, m) {
    if (m.markup && m.markup.mode && m.markup.mode !== 'inherit') return m.markup;
    let g = groupById(b, m.groupId), guard = 0;
    while (g && guard++ < 50) {
      if (g.markup && g.markup.mode && g.markup.mode !== 'inherit') return g.markup;
      g = g.parentId ? groupById(b, g.parentId) : null;
    }
    return { mode: 'none' };
  }
  function applyMarkup(buy, rule) {
    const v = num(rule.value); let x;
    switch (rule.mode) {
      case 'percent': x = buy * (1 + v / 100); break;
      case 'mul': x = buy * v; break;
      case 'add': x = buy + v; break;
      case 'fixed': x = v; break;
      default: return null;
    }
    return roundBy(x, rule.round);
  }
  /** Продажная цена: по правилу наценки, иначе введённая вручную. */
  function sellPrice(b, m) {
    const rule = markupRule(b, m);
    const r = applyMarkup(num(m.priceBuy), rule);
    if (r === null) return num(m.priceSell);
    // правило группы может иметь своё округление, у материала — наследуется от группы
    return r;
  }
  function recordPrice(b, m, src) {
    m.history = m.history || [];
    const buy = num(m.priceBuy), sell = sellPrice(b, m);
    const last = m.history[m.history.length - 1];
    if (last && last.buy === buy && last.sell === sell) return false;
    m.history.push({ d: nowIso(), buy: buy, sell: sell, src: src || '' });
    if (m.history.length > 60) m.history.splice(0, m.history.length - 60);
    return true;
  }
  /** Пересчитать продажные цены всех материалов группы (для правил наценки). */
  function repriceGroup(b, gid, src) {
    const ids = descendantIds(b, gid); let n = 0;
    b.materials.forEach(function (m) {
      if (ids.indexOf(m.groupId) < 0) return;
      const r = markupRule(b, m);
      if (r.mode === 'none') return;
      m.priceSell = sellPrice(b, m); m.updated = nowIso(); recordPrice(b, m, src || 'наценка'); n++;
    });
    return n;
  }

  // ---------- поиск ----------
  function search(b, o) {
    o = o || {};
    const t = String(o.text || '').trim().toLowerCase();
    const ids = o.groupId ? descendantIds(b, o.groupId) : null;
    return b.materials.filter(function (m) {
      if (ids && ids.indexOf(m.groupId) < 0) return false;
      if (o.type && kindOf(b, m) !== o.type) return false;
      if (o.onlyInStock && m.inStock === false) return false;
      if (!t) return true;
      return [m.name, m.article, m.code, m.supplier, m.note, m.classes].some(function (s) { return String(s || '').toLowerCase().indexOf(t) >= 0; });
    });
  }
  function findDuplicates(b, by) {
    const buckets = {};
    b.materials.forEach(function (m) {
      const keys = [];
      if (by === 'article' || by === 'both') { if (m.article) keys.push('a:' + String(m.article).trim().toLowerCase()); }
      if (by === 'name' || by === 'both') { if (m.name) keys.push('n:' + String(m.name).trim().toLowerCase()); }
      keys.forEach(function (k) { (buckets[k] = buckets[k] || []).push(m.id); });
    });
    return Object.keys(buckets).filter(function (k) { return buckets[k].length > 1; }).map(function (k) { return buckets[k]; });
  }

  // ---------- связь со старым форматом расчёта ----------
  function fromLegacy(d) {
    d = d || {};
    const b = emptyBase(true);
    const g1 = b.groups[0].id, g2 = b.groups[1].id, g4 = b.groups[3].id;
    (d.materials || []).forEach(function (x) {
      b.materials.push(newMaterial(g1, {
        id: x.id, name: x.name || '', unit: 'лист', thickness: x.thickness || '', sheetW: x.sheetW || '', sheetH: x.sheetH || '',
        grain: !!x.grain, servicePrice: x.servicePerM2 === undefined ? '' : x.servicePerM2, priceSell: x.salePerSheet === undefined ? '' : x.salePerSheet,
        markup: { mode: 'none', value: '' }
      }));
    });
    (d.edges || []).forEach(function (x) {
      b.materials.push(newMaterial(g2, {
        id: x.id, name: x.name || '', unit: 'м.п.', servicePrice: x.servicePerM === undefined ? '' : x.servicePerM,
        priceSell: x.salePerM === undefined ? '' : x.salePerM, markup: { mode: 'none', value: '' }
      }));
    });
    (d.hardware || []).forEach(function (x) {
      b.materials.push(newMaterial(g4, {
        id: x.id, name: x.name || '', unit: x.unit || 'шт.', priceSell: x.salePrice === undefined ? '' : x.salePrice, markup: { mode: 'none', value: '' }
      }));
    });
    return b;
  }
  /** Цена листа: если материал в базе считается за м² (кв.м, м2) — умножаем на площадь листа. */
  function sheetPrice(b, m) {
    const p = sellPrice(b, m);
    if (/^(кв\.?\s?м|м2|м²)/i.test(String(m.unit || '').trim())) return round2(p * num(m.sheetW) * num(m.sheetH) / 1e6);
    return p;
  }
  function toLegacy(b) {
    const out = { materials: [], edges: [], hardware: [] };
    b.materials.forEach(function (m) {
      const k = kindOf(b, m);
      if (k === 'sheet') {
        out.materials.push({ id: m.id, name: m.name, thickness: num(m.thickness), sheetW: num(m.sheetW), sheetH: num(m.sheetH),
          servicePerM2: num(m.servicePrice), salePerSheet: sheetPrice(b, m), grain: !!m.grain });
      } else if (k === 'edge') {
        out.edges.push({ id: m.id, name: m.name, servicePerM: num(m.servicePrice), salePerM: sellPrice(b, m) });
      } else {
        out.hardware.push({ id: m.id, name: m.name, unit: m.unit || 'шт.', salePrice: sellPrice(b, m) });
      }
    });
    return out;
  }

  // ---------- XML ----------
  function decodeEntities(s) {
    return String(s).replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, function (_, e) {
      e = e.toLowerCase();
      if (e === 'amp') return '&'; if (e === 'lt') return '<'; if (e === 'gt') return '>'; if (e === 'quot') return '"'; if (e === 'apos') return "'";
      const code = e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try { return String.fromCodePoint(code); } catch (_) { return ''; }
    });
  }
  function encodeXml(s) {
    return String(s === undefined || s === null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }
  /** Терпимый разбор XML в дерево {name, attrs, children, text}. */
  function parseXml(text) {
    text = String(text).replace(/^﻿/, '');
    const re = /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<\?[\s\S]*?\?>|<![^>]*>|<\/([^\s>]+)\s*>|<([^\s/>=<]+)((?:\s+[^\s=>/]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
    const rootNode = { name: '#root', attrs: {}, children: [], text: '' };
    const stack = [rootNode]; let m;
    while ((m = re.exec(text))) {
      const top = stack[stack.length - 1];
      if (m[1] !== undefined) { top.text += m[1]; }
      else if (m[2] !== undefined) { if (stack.length > 1) stack.pop(); }
      else if (m[3] !== undefined) {
        const node = { name: m[3], attrs: {}, children: [], text: '' };
        const ar = /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g; let a;
        while ((a = ar.exec(m[4] || ''))) node.attrs[a[1]] = decodeEntities(a[2] !== undefined ? a[2] : a[3]);
        top.children.push(node);
        if (!m[5]) stack.push(node);
      } else if (m[6] !== undefined) { top.text += decodeEntities(m[6]); }
    }
    return rootNode;
  }
  function norm(k) { return String(k).toLowerCase().replace(/[^a-z0-9а-яё]/g, ''); }

  const ALIASES = {
    name: ['name', 'materialname', 'matname', 'наименование', 'название', 'имя', 'материал'],
    article: ['article', 'art', 'артикул', 'sku'],
    code: ['code', 'код'],
    syncId: ['id', 'guid', 'uid', 'syncid', 'идентификатор', 'идентификатордлясинхронизации'],
    group: ['groupname', 'group', 'группа', 'path', 'путь', 'группаматериалов'],
    groupType: ['grouptype', 'типгруппы', 'type', 'тип'],
    unit: ['unit', 'units', 'unitname', 'единица', 'едизм', 'ед', 'единицаизмерения', 'единицыизмерения'],
    thickness: ['thickness', 'толщина', 'thick'],
    sheetW: ['length', 'длина', 'sheetlength', 'sheetw', 'длиналиста'],
    sheetH: ['width', 'ширина', 'sheetwidth', 'sheeth'],
    priceBuy: ['price', 'cost', 'цена', 'стоимость', 'закупка', 'закупочнаяцена', 'purchaseprice', 'buyprice', 'стоимостьматериала'],
    priceSell: ['sellprice', 'saleprice', 'продажнаяцена', 'розница', 'retailprice', 'ценапродажи'],
    servicePrice: ['serviceprice', 'ценауслуги', 'ценаработы', 'ценараспила'],
    excess: ['excess', 'коэффициентизбытка', 'waste', 'коэфотходов', 'избыток'],
    supplier: ['supplier', 'поставщик', 'vendor', 'магазин', 'shop'],
    url: ['url', 'link', 'ссылка'],
    note: ['note', 'notes', 'comment', 'примечание', 'примечания', 'описание', 'description'],
    inStock: ['instock', 'наличие', 'available'],
    grain: ['grain', 'texture', 'текстура'],
    classes: ['class', 'classes', 'класс', 'классы']
  };
  const ALIAS_MAP = {};
  Object.keys(ALIASES).forEach(function (f) { ALIASES[f].forEach(function (a) { ALIAS_MAP[norm(a)] = f; }); });

  function truthy(v) { return !/^(0|false|нет|no|н|-|)$/i.test(String(v).trim()); }

  /** Запись {тег: значение} в поля материала. */
  function recordToFields(rec) {
    const f = { extra: {} }; let groupPath = '', typeRaw = '';
    Object.keys(rec).forEach(function (k) {
      const v = String(rec[k] === undefined || rec[k] === null ? '' : rec[k]).trim();
      const fld = ALIAS_MAP[norm(k)];
      if (!fld) { if (v !== '') f.extra[k] = v; return; }
      if (fld === 'group') groupPath = v;
      else if (fld === 'groupType') typeRaw = v;
      else if (fld === 'inStock') f.inStock = truthy(v);
      else if (fld === 'grain') f.grain = truthy(v);
      else if (f[fld] === undefined || f[fld] === '') f[fld] = v;
    });
    ['thickness', 'sheetW', 'sheetH', 'priceBuy', 'priceSell', 'servicePrice', 'excess'].forEach(function (k) {
      if (f[k] !== undefined && f[k] !== '') f[k] = num(f[k]);
    });
    f._groupPath = groupPath; f._typeRaw = typeRaw;
    return f;
  }

  /** Записи из XML: самый частый элемент с простыми дочерними тегами. */
  function xmlRecords(text) {
    const rootNode = parseXml(text);
    const counts = {};
    (function walk(n) {
      if (n.name !== '#root') {
        const leaves = n.children.filter(function (c) { return !c.children.length; }).length + Object.keys(n.attrs).length;
        if (leaves >= 2 && n.children.every(function (c) { return !c.children.length; })) counts[n.name] = (counts[n.name] || 0) + 1;
      }
      n.children.forEach(walk);
    })(rootNode);
    const names = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; });
    if (!names.length) return [];
    const pick = names.find(function (n) { return /material|материал|item|record|row|товар|позиц/i.test(n); }) || names[0];
    const recs = [];
    (function walk(n) {
      if (n.name === pick) {
        const r = {};
        Object.keys(n.attrs).forEach(function (k) { r[k] = n.attrs[k]; });
        n.children.forEach(function (c) { r[c.name] = c.text.trim(); });
        recs.push(r);
      } else n.children.forEach(walk);
    })(rootNode);
    return recs;
  }

  // ---------- CSV ----------
  function parseTable(text) {
    text = String(text).replace(/^﻿/, '');
    const first = text.split(/\r?\n/)[0] || '';
    const delims = [';', '\t', ','];
    const d = delims.map(function (x) { return [x, first.split(x).length]; }).sort(function (a, b) { return b[1] - a[1]; })[0][0];
    const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c;
      } else if (c === '"') q = true;
      else if (c === d) { row.push(cell); cell = ''; }
      else if (c === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; }
      else cell += c;
    }
    if (cell !== '' || row.length) { row.push(cell.replace(/\r$/, '')); rows.push(row); }
    const nonEmpty = rows.filter(function (r) { return r.some(function (c) { return String(c).trim() !== ''; }); });
    if (nonEmpty.length < 2) return [];
    const head = nonEmpty[0].map(function (h) { return String(h).trim(); });
    return nonEmpty.slice(1).map(function (r) {
      const o = {}; head.forEach(function (h, i) { if (h) o[h] = r[i] === undefined ? '' : r[i]; }); return o;
    });
  }

  // ---------- импорт записей ----------
  /**
   * o: {key:'article'|'name'|'both'|'either'|'sync', onDup:'update'|'skip'|'add', addNew:true, onlyPrice:false, groupId:''}
   * Возвращает {added, updated, skipped, noPrice}.
   */
  function importRecords(b, recs, o) {
    o = Object.assign({ key: 'either', onDup: 'update', addNew: true, onlyPrice: false, groupId: '' }, o || {});
    const res = { added: 0, updated: 0, skipped: 0, noMatch: 0 };
    const low = function (s) { return String(s || '').trim().toLowerCase(); };
    function match(f) {
      return b.materials.find(function (m) {
        const a = f.article && low(m.article) === low(f.article), n = f.name && low(m.name) === low(f.name), s = f.syncId && low(m.syncId) === low(f.syncId);
        if (o.key === 'article') return a;
        if (o.key === 'name') return n;
        if (o.key === 'both') return a && n;
        if (o.key === 'sync') return s;
        return a || n || s;
      });
    }
    recs.forEach(function (rec) {
      const f = recordToFields(rec);
      if (!f.name && !f.article) { res.skipped++; return; }
      const ex = match(f);
      if (ex && o.onDup === 'update') {
        if (f.priceBuy !== undefined) ex.priceBuy = f.priceBuy;
        if (f.priceSell !== undefined) ex.priceSell = f.priceSell;
        if (!o.onlyPrice) {
          ['name', 'article', 'code', 'syncId', 'unit', 'thickness', 'sheetW', 'sheetH', 'servicePrice', 'excess', 'supplier', 'url', 'note', 'classes'].forEach(function (k) {
            if (f[k] !== undefined && f[k] !== '') ex[k] = f[k];
          });
          if (f.inStock !== undefined) ex.inStock = f.inStock;
          if (f.grain !== undefined) ex.grain = f.grain;
          Object.assign(ex.extra = ex.extra || {}, f.extra);
        }
        ex.updated = nowIso(); recordPrice(b, ex, 'импорт'); res.updated++; return;
      }
      if (ex && o.onDup === 'skip') { res.skipped++; return; }
      if (!o.addNew || o.onlyPrice) { res.noMatch++; return; }
      const parts = f._groupPath ? f._groupPath.split(/\s*[\/\\]\s*/).filter(Boolean) : [];
      let gid;
      if (parts.length) gid = ensureGroupPath(b, parts, guessTypeByName(parts[0]) || (f._typeRaw && GROUP_TYPES[f._typeRaw] ? f._typeRaw : ''));
      else gid = o.groupId || ensureGroupPath(b, ['08. Для разбора'], 'other');
      const m = newMaterial(gid, {});
      Object.keys(f).forEach(function (k) { if (k[0] !== '_' && f[k] !== undefined && f[k] !== '') m[k] = f[k]; });
      if (!f.unit) m.unit = ({ sheet: 'лист', edge: 'м.п.', linear: 'м.п.', service: 'ч' })[groupType(b, gid)] || 'шт.';
      if (f.priceSell !== undefined && f.priceSell !== '') m.markup = { mode: 'none', value: '' };
      recordPrice(b, m, 'импорт');
      b.materials.push(m); res.added++;
    });
    return res;
  }

  // ---------- экспорт ----------
  const XML_TAGS = [
    ['Group_Name', null], ['Name', 'name'], ['Article', 'article'], ['Code', 'code'], ['Sync_Id', 'syncId'], ['Unit', 'unit'],
    ['Thickness', 'thickness'], ['Length', 'sheetW'], ['Width', 'sheetH'], ['Excess', 'excess'],
    ['Price', 'priceBuy'], ['Sell_Price', null], ['Service_Price', 'servicePrice'],
    ['Supplier', 'supplier'], ['URL', 'url'], ['Note', 'note'], ['In_Stock', null], ['Grain', null], ['Classes', 'classes']
  ];
  function exportRows(b, mats) {
    return (mats || b.materials).map(function (m) {
      const r = { Group_Name: groupPath(b, m.groupId).join('/') };
      XML_TAGS.forEach(function (t) {
        if (t[0] === 'Group_Name') return;
        if (t[0] === 'Sell_Price') r[t[0]] = sellPrice(b, m);
        else if (t[0] === 'In_Stock') r[t[0]] = m.inStock === false ? 0 : 1;
        else if (t[0] === 'Grain') r[t[0]] = m.grain ? 1 : 0;
        else r[t[0]] = m[t[1]] === undefined ? '' : m[t[1]];
      });
      Object.keys(m.extra || {}).forEach(function (k) { r[k] = m.extra[k]; });
      return r;
    });
  }
  function toXmlOld(b, mats) {
    const rows = exportRows(b, mats);
    return '<?xml version="1.0" encoding="UTF-8"?>\n<NK_Base>\n' + rows.map(function (r) {
      return '  <Material>\n' + Object.keys(r).map(function (k) { return '    <' + k + '>' + encodeXml(r[k]) + '</' + k + '>'; }).join('\n') + '\n  </Material>';
    }).join('\n') + '\n</NK_Base>\n';
  }
  function toCsv(b, mats) {
    const rows = exportRows(b, mats);
    const cols = XML_TAGS.map(function (t) { return t[0]; });
    const q = function (v) { v = String(v === undefined || v === null ? '' : v); return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    return '﻿' + [cols.join(';')].concat(rows.map(function (r) { return cols.map(function (c) { return q(r[c]); }).join(';'); })).join('\r\n') + '\r\n';
  }


  // ---------- формат Базис-Мебельщика (NK_Base): 37 полей, группы строкой через «/» ----------
  const BZ_TAGS = ['Article', 'Name', 'Group_Name', 'Unit_Measure', 'Price', 'Coef', 'Length', 'Width', 'Thickness', 'Sign', 'Overhang', 'Color', 'Texture',
    'Class', 'IsTape', 'Sync_External', 'Weight', 'Comment', 'NoAvailable', 'Stretch', 'Retry', 'Mirror', 'Transparent', 'Shiness', 'Bright', 'DX', 'DY',
    'OffsetX', 'OffsetY', 'Angle', 'Coef_Exc_Cutting', 'Round_Mode', 'Alt_Price', 'Name_FNP', 'Type_Group_Material', 'Color_RGB', 'Color_HEX'];
  // поля, которые хранятся в materials[].extra (остальные — в «родных» полях материала); значения по умолчанию не пишем в базу
  const BZ_EXTRA_DEFAULTS = { Overhang: '0', Color: '8369910', Texture: '', IsTape: 'N', Weight: '0', Stretch: '0', Retry: '0', Mirror: '0', Transparent: '0',
    Shiness: '0', Bright: '0', DX: '0', DY: '0', OffsetX: '1000', OffsetY: '1000', Angle: '0', Coef_Exc_Cutting: '1', Round_Mode: '0', Alt_Price: '0',
    Name_FNP: '', Type_Group_Material: '2', Color_RGB: '(246, 182, 127)', Color_HEX: 'F6B67F' };

  function isBazisXml(text) {
    const head = String(text).slice(0, 4000);
    return /<Materials>\s*<Material>/.test(head) && /<Article[ >\/]/.test(head) && /<Group_Name[ >\/]/.test(head);
  }
  function bzGroupType(root) {
    const t = guessTypeByName(root);
    if (/лакокрас|краск/i.test(root)) return 'other';
    return t;
  }
  /**
   * Быстрый импорт выгрузки Базиса. opts.replace — заменить всю базу (иначе добавить к имеющейся; точные повторы пропускаются).
   * Повторяющиеся артикулы не склеиваются: в Базисе они бывают у разных позиций.
   */
  function importBazis(b, text, opts) {
    text = String(text).replace(/^\uFEFF/, '');
    const recs = [], blockRe = /<Material>([\s\S]*?)<\/Material>/g, tagRe = /<([A-Za-z_0-9]+)(?:\/>|>([^<]*)<\/\1>)/g;
    let bm;
    while ((bm = blockRe.exec(text))) {
      const f = {}; let tm; tagRe.lastIndex = 0;
      while ((tm = tagRe.exec(bm[1]))) f[tm[1]] = tm[2] === undefined ? '' : decodeEntities(tm[2]);
      recs.push(f);
    }
    return importBazisRecords(b, recs, opts);
  }
  /** recs — записи с тегами Базиса (из XML или из файла FDB); opts.groups — пути групп, которые нужно создать даже пустыми. */
  function importBazisRecords(b, recs, opts) {
    opts = opts || {};
    if (opts.replace) { b.groups = []; b.materials = []; }
    const gcache = new Map();
    b.groups.forEach(function (g) { gcache.set((g.parentId || '') + '\u0001' + g.name, g); });
    const pathCache = new Map();
    function groupFor(path) {
      let id = pathCache.get(path); if (id !== undefined) return id;
      let pid = '';
      path.split('/').forEach(function (part, i) {
        part = part.trim(); if (!part) return;
        const key = pid + '\u0001' + part;
        let g = gcache.get(key);
        if (!g) { g = addGroup(b, pid, part, i === 0 ? bzGroupType(part) : ''); gcache.set(key, g); }
        pid = g.id;
      });
      pathCache.set(path, pid); return pid;
    }
    const seen = new Set();
    if (!opts.replace) b.materials.forEach(function (m) { seen.add(groupPathStr(b, m.groupId) + '\u0001' + m.name + '\u0001' + m.article); });
    const res = { added: 0, skipped: 0, groups: 0 };
    const g0 = b.groups.length;
    let n = 0;
    recs.forEach(function (f) {
      const path = f.Group_Name || '';
      if (!opts.replace) {
        const key = path + '\u0001' + (f.Name || '') + '\u0001' + (f.Article || '');
        if (seen.has(key)) { res.skipped++; return; }
        seen.add(key);
      }
      const extra = {};
      Object.keys(BZ_EXTRA_DEFAULTS).forEach(function (k) { if (f[k] !== undefined && f[k] !== BZ_EXTRA_DEFAULTS[k]) extra[k] = f[k]; });
      Object.keys(f).forEach(function (k) { if (BZ_TAGS.indexOf(k) < 0) extra[k] = f[k]; }); // неизвестные теги сохраняем
      const coef = f.Coef === undefined || f.Coef === '' ? 1 : num(f.Coef);
      b.materials.push({
        id: 'm' + (++n).toString(36) + Math.random().toString(36).slice(2, 6) + (b.materials.length).toString(36),
        groupId: groupFor(path), name: f.Name || '', article: f.Article || '', code: f.Sign || '', syncId: f.Sync_External || '', supplier: '',
        unit: f.Unit_Measure || '', thickness: f.Thickness === '' || f.Thickness === undefined ? '' : num(f.Thickness),
        sheetW: f.Length === '' || f.Length === undefined ? '' : num(f.Length), sheetH: f.Width === '' || f.Width === undefined ? '' : num(f.Width),
        grain: false, excess: '', priceBuy: f.Price === '' || f.Price === undefined ? '' : num(f.Price), priceSell: '', servicePrice: '',
        markup: { mode: 'mul', value: coef }, url: '', note: f.Comment || '', inStock: f.NoAvailable !== 'Y', classes: f.Class || '',
        history: [], extra: extra, updated: ''
      });
      res.added++;
    });
    (opts.groups || []).forEach(function (p) { groupFor(p); });
    res.groups = b.groups.length - g0;
    return res;
  }
  function groupPathStr(b, gid) { return groupPath(b, gid).join('/'); }

  /** Экспорт в тот же формат, что выдаёт Базис (все 37 полей, порядок как в оригинале). */
  function toBazisXml(b, mats) {
    const list = mats || b.materials, out = ['﻿<?xml version="1.0" encoding="UTF-8"?>\n<Database><Materials>'];
    const pc = new Map();
    list.forEach(function (m) {
      let gp = pc.get(m.groupId); if (gp === undefined) { gp = groupPathStr(b, m.groupId); pc.set(m.groupId, gp); }
      const ex = m.extra || {}, mk = m.markup || {};
      const rule = markupRule(b, m), buy = num(m.priceBuy);
      let coef = 1;
      if (rule.mode === 'mul') coef = num(rule.value) || 1;
      else if (rule.mode !== 'none' && buy) coef = Math.round(sellPrice(b, m) / buy * 1000) / 1000 || 1;
      const v = {
        Article: m.article, Name: m.name, Group_Name: gp, Unit_Measure: m.unit, Price: buy, Coef: coef,
        Length: m.sheetW === '' ? 0 : m.sheetW, Width: m.sheetH === '' ? 0 : m.sheetH, Thickness: m.thickness === '' ? 0 : m.thickness,
        Sign: m.code, Class: m.classes, Sync_External: m.syncId, Comment: m.note, NoAvailable: m.inStock === false ? 'Y' : 'N'
      };
      let s = '<Material>';
      BZ_TAGS.forEach(function (t) {
        let x = v[t];
        if (x === undefined) x = ex[t] !== undefined ? ex[t] : (BZ_EXTRA_DEFAULTS[t] !== undefined ? BZ_EXTRA_DEFAULTS[t] : '');
        x = String(x === null ? '' : x);
        s += x === '' ? '<' + t + '/>' : '<' + t + '>' + encodeXml(x) + '</' + t + '>';
      });
      Object.keys(ex).forEach(function (k) { if (BZ_TAGS.indexOf(k) < 0) s += ex[k] === '' ? '<' + k + '/>' : '<' + k + '>' + encodeXml(ex[k]) + '</' + k + '>'; });
      out.push(s + '</Material>');
    });
    out.push('</Materials></Database>');
    return out.join('');
  }

  // ---------- смета заказа ----------
  function estimateItemFromMaterial(b, m, qty) {
    return {
      id: uid('e'), materialId: m.id, name: m.name, article: m.article || '', unit: m.unit || 'шт.',
      qty: qty === undefined ? 1 : qty, priceBuy: num(m.priceBuy), priceSell: sellPrice(b, m), note: ''
    };
  }
  function estimateTotals(items) {
    let sell = 0, buy = 0;
    (items || []).forEach(function (x) { sell += num(x.qty) * num(x.priceSell); buy += num(x.qty) * num(x.priceBuy); });
    return { sell: round2(sell), buy: round2(buy), margin: round2(sell - buy) };
  }
  function refreshEstimate(b, items) {
    let n = 0;
    (items || []).forEach(function (x) {
      const m = b.materials.find(function (y) { return y.id === x.materialId; });
      if (!m) return;
      x.priceBuy = num(m.priceBuy); x.priceSell = sellPrice(b, m); x.name = m.name; x.article = m.article || ''; x.unit = m.unit || x.unit; n++;
    });
    return n;
  }

  return {
    GROUP_TYPES: GROUP_TYPES, UNITS: UNITS, MARKUP_MODES: MARKUP_MODES, num: num, round2: round2, uid: uid,
    emptyBase: emptyBase, newMaterial: newMaterial,
    groupById: groupById, children: children, groupPath: groupPath, groupType: groupType, descendantIds: descendantIds,
    addGroup: addGroup, moveGroup: moveGroup, deleteGroup: deleteGroup, ensureGroupPath: ensureGroupPath, guessTypeByName: guessTypeByName,
    isBazisXml: isBazisXml, importBazis: importBazis, importBazisRecords: importBazisRecords, toXml: toBazisXml, toBazisXml: toBazisXml, sheetPrice: sheetPrice,
    copyMaterial: copyMaterial, moveMaterials: moveMaterials, deleteMaterials: deleteMaterials, kindOf: kindOf,
    markupRule: markupRule, applyMarkup: applyMarkup, sellPrice: sellPrice, recordPrice: recordPrice, repriceGroup: repriceGroup,
    search: search, findDuplicates: findDuplicates, fromLegacy: fromLegacy, toLegacy: toLegacy,
    parseXml: parseXml, xmlRecords: xmlRecords, parseTable: parseTable, importRecords: importRecords, recordToFields: recordToFields,
    toCsv: toCsv,
    estimateItemFromMaterial: estimateItemFromMaterial, estimateTotals: estimateTotals, refreshEstimate: refreshEstimate
  };
});
