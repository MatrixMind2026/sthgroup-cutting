/* Разбор страницы товара: название, артикул, цена, поставщик по ссылке или по вставленному тексту. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.Core = root.Core || {}; root.Core.linkparse = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {

  const REQUIRED = ['name', 'article', 'priceBuy', 'supplier'];

  function decode(s) {
    return String(s || '').replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp|laquo|raquo|ndash|mdash);/gi, function (_, e) {
      e = e.toLowerCase();
      const map = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', laquo: '«', raquo: '»', ndash: '–', mdash: '—' };
      if (map[e]) return map[e];
      const code = e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try { return String.fromCodePoint(code); } catch (_) { return ''; }
    });
  }
  function clean(s) { return decode(String(s || '').replace(/<[^>]*>/g, ' ')).replace(/[\s\u00a0]+/g, ' ').trim(); }
  function toNum(s) {
    if (typeof s === 'number') return s;
    const t = String(s || '').replace(/[\s\u00a0]/g, '').replace(',', '.').replace(/[^0-9.]/g, '');
    const n = parseFloat(t); return isFinite(n) ? n : 0;
  }

  function metaContent(html, key) {
    const re = new RegExp('<meta[^>]+(?:property|name|itemprop)\\s*=\\s*["\']' + key.replace(/[.:]/g, '\\$&') + '["\'][^>]*>', 'i');
    const m = html.match(re); if (!m) return '';
    const c = m[0].match(/content\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    return c ? decode(c[1] !== undefined ? c[1] : c[2]).trim() : '';
  }

  function jsonLdProducts(html) {
    const out = [];
    const re = /<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi; let m;
    function visit(o) {
      if (!o) return;
      if (Array.isArray(o)) { o.forEach(visit); return; }
      if (typeof o !== 'object') return;
      const t = o['@type'];
      const types = Array.isArray(t) ? t : [t];
      if (types.indexOf('Product') >= 0) out.push(o);
      if (o['@graph']) visit(o['@graph']);
    }
    while ((m = re.exec(html))) {
      try { visit(JSON.parse(m[1].trim())); } catch (_) { /* битый блок пропускаем */ }
    }
    return out;
  }

  function offerPrice(offers) {
    if (!offers) return 0;
    const list = Array.isArray(offers) ? offers : [offers];
    for (const o of list) {
      if (!o) continue;
      const p = toNum(o.price !== undefined ? o.price : (o.lowPrice !== undefined ? o.lowPrice : (o.priceSpecification && o.priceSpecification.price)));
      if (p) return p;
    }
    return 0;
  }

  function findArticle(text) {
    const m = text.match(/(?:Артикул|Арт\.|Артикул производителя|Код товара|SKU)\s*[:№#]?\s*([A-Za-zА-Яа-я0-9][A-Za-zА-Яа-я0-9\-_./]{1,30})((?:\s(?=[A-Z0-9\-_./]*[A-Z])[A-Z0-9][A-Z0-9\-_./]{0,12}){0,3})/);
    if (!m) { const m2 = text.match(/(?:Артикул|Арт\.|Артикул производителя|Код товара|SKU)\s*[:№#]?\s*([A-Za-zА-Яа-я0-9][A-Za-zА-Яа-я0-9\-_./]{1,30})/i); return m2 ? m2[1].replace(/[.,;]+$/, '') : ''; }
    return (m[1] + m[2]).replace(/[.,;]+$/, '');
  }
  function findPrice(text) {
    // «1 234 ₽», «1234,50 руб.», «Цена: 1 234»
    let m = text.match(/(\d[\d\s\u00a0]{0,9}(?:[.,]\d{1,2})?)\s*(?:₽|руб\.?|р\.)/i);
    if (m) { const n = toNum(m[1]); if (n) return n; }
    m = text.match(/Цена[^\d]{0,15}(\d[\d\s\u00a0]{0,9}(?:[.,]\d{1,2})?)/i);
    return m ? toNum(m[1]) : 0;
  }
  function hostName(url) {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch (_) { return ''; }
  }
  function sizesFromName(name, f) {
    const mm = String(name).match(/(\d{3,4})\s*[xх×*]\s*(\d{3,4})(?:\s*[xх×*]\s*(\d{1,2}(?:[.,]\d+)?))?/i);
    if (mm) {
      f.sheetW = Math.max(toNum(mm[1]), toNum(mm[2])); f.sheetH = Math.min(toNum(mm[1]), toNum(mm[2]));
      if (mm[3]) f.thickness = toNum(mm[3]);
    }
    if (!f.thickness) {
      const t = String(name).match(/(?:^|[\s,;])(\d{1,2}(?:[.,]\d+)?)\s*мм/i);
      if (t) f.thickness = toNum(t[1]);
    }
  }

  /** Наличие, остаток на складе, дата актуальности и характеристики — по тексту страницы (строки, разбитые по блокам). */
  function extras(lines, f) {
    const all = lines.join('\n');
    if (/нет в наличии|под заказ|сообщить о поступлении|временно отсутствует/i.test(all) && !/(^|\n)\s*в наличии/i.test(all)) f.inStock = false;
    else if (/(^|\n)\s*в наличии/i.test(all)) f.inStock = true;
    const up = all.match(/Актуально на\s*(\d{1,2}\.\d{1,2}\.\d{4}(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?)/i);
    const st = all.match(/(Санкт-Петербург|Москва|Склад[^:\n]{0,20})\s*:\s*(\d+(?:[.,]\d+)?)\s*(упак|шт|уп|м|кг|компл)[а-я.]*/i);
    const parts = [];
    if (st) parts.push('Остаток ' + st[1] + ': ' + st[2] + ' ' + st[3]);
    if (up) parts.push('актуально на ' + up[1]);
    if (parts.length) f.stockNote = parts.join(', ');
    const ch = [];
    lines.forEach(function (ln) {
      const m = ln.match(/^([А-ЯЁA-Z][^:]{2,45}?)\s*(?:\.{3,}|:)\s*([^\s].{0,45})$/);
      if (m && !/^(цена|артикул|в наличии|актуально|доставка|наличие|санкт|москва|склад)/i.test(m[1]) && ch.length < 14) ch.push(m[1].trim() + ': ' + m[2].trim());
    });
    if (ch.length >= 2) f.characteristics = ch.join('; ');
  }

  function finish(f, url) {
    const found = [], missing = [];
    REQUIRED.forEach(function (k) { (f[k] ? found : missing).push(k); });
    return { fields: f, found: found, missing: missing };
  }

  /** Разбор HTML страницы. */
  function parseProductHtml(html, url) {
    html = String(html || '');
    const f = { url: url || '' };
    const prods = jsonLdProducts(html);
    if (prods.length) {
      const p = prods[0];
      f.name = clean(p.name);
      f.article = clean(p.sku || p.mpn || p.productID || '');
      f.priceBuy = offerPrice(p.offers);
      if (p.brand) f.maker = clean(typeof p.brand === 'object' ? p.brand.name : p.brand);
      if (p.description) f.note = clean(p.description).slice(0, 300);
      const img = Array.isArray(p.image) ? p.image[0] : p.image;
      if (img) f.image = typeof img === 'object' ? img.url : String(img);
    }
    // OpenGraph и мета
    if (!f.name) f.name = clean(metaContent(html, 'og:title') || metaContent(html, 'twitter:title'));
    if (!f.priceBuy) f.priceBuy = toNum(metaContent(html, 'product:price:amount') || metaContent(html, 'og:price:amount') || metaContent(html, 'price'));
    if (!f.note) { const d = metaContent(html, 'og:description') || metaContent(html, 'description'); if (d) f.note = clean(d).slice(0, 300); }
    if (!f.image) f.image = metaContent(html, 'og:image');
    // микроразметка
    if (!f.article) { const m = html.match(/itemprop\s*=\s*["']sku["'][^>]*?(?:content\s*=\s*"([^"]*)"|>([^<]*)<)/i); if (m) f.article = clean(m[1] || m[2]); }
    if (!f.priceBuy) { const m = html.match(/itemprop\s*=\s*["']price["'][^>]*?(?:content\s*=\s*"([^"]*)"|>([^<]*)<)/i); if (m) f.priceBuy = toNum(m[1] || m[2]); }
    // тексты страницы
    const body = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
    if (!f.name) { const h = body.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i); if (h) f.name = clean(h[1]); }
    if (!f.name) { const t = body.match(/<title[^>]*>([\s\S]*?)<\/title>/i); if (t) f.name = clean(t[1]).split(/\s[|—–-]\s/)[0]; }
    const text = clean(body);
    extras(body.replace(/<\/(?:div|li|p|tr|dt|dd|h\d|td|th|section|button|a)>|<br\s*\/?>/gi, '\n').split('\n').map(clean).filter(Boolean), f);
    if (!f.article) f.article = findArticle(text);
    if (!f.priceBuy) {
      const pc = body.match(/class\s*=\s*["'][^"']*price[^"']*["'][^>]*>([\s\S]{0,200}?)<\/(?:div|span|p|b|strong)/i);
      f.priceBuy = (pc && findPrice(clean(pc[1]))) || findPrice(text);
    }
    const site = metaContent(html, 'og:site_name');
    f.supplier = site || hostName(url);
    sizesFromName(f.name || '', f);
    Object.keys(f).forEach(function (k) { if (f[k] === '' || f[k] === 0 || f[k] === undefined) delete f[k]; });
    return finish(f, url);
  }

  /** Разбор текста, вставленного вручную (скопированного со страницы). */
  function parseProductText(text, url) {
    const f = { url: url || '' };
    const lines = String(text || '').split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean);
    f.name = (lines.find(function (s) { return s.length > 3 && !/^\d+$/.test(s); }) || '').slice(0, 200);
    f.article = findArticle(text);
    f.priceBuy = findPrice(String(text));
    f.supplier = hostName(url);
    extras(lines, f);
    sizesFromName(f.name || '', f);
    Object.keys(f).forEach(function (k) { if (f[k] === '' || f[k] === 0 || f[k] === undefined) delete f[k]; });
    return finish(f, url);
  }

  return { parseProductHtml: parseProductHtml, parseProductText: parseProductText, REQUIRED: REQUIRED };
});
