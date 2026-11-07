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

  function unitOf(value) {
    const raw = clean(value);
    const codes = { C62: 'шт', H87: 'шт', SET: 'компл', MTR: 'м', MTK: 'кв.м', MTQ: 'куб.м', KGM: 'кг', LTR: 'л', PK: 'упак' };
    if (Object.prototype.hasOwnProperty.call(codes, raw)) return codes[raw];
    const key = raw.toLowerCase().replace(/[\s.]/g, '');
    const units = [
      ['шт', /^(шт|штука|штуку|штуки|штук|pcs?)$/],
      ['компл', /^(компл?|комплект(?:а|ов|ы)?|набор(?:а|ов|ы)?|set)$/],
      ['м', /^(м|мп|пм|погм|(?:погонн(?:ый|ого|ых))?метр(?:а|ов|ы)?)$/],
      ['кв.м', /^(м²|м2|квм|квадратн(?:ый|ого|ых)метр(?:а|ов|ы)?)$/],
      ['куб.м', /^(м³|м3|кубм|кубическ(?:ий|ого|их)метр(?:а|ов|ы)?)$/],
      ['лист', /^(лст|лист(?:а|ов|ы)?)$/],
      ['хлыст', /^хлыст(?:а|ов|ы)?$/],
      ['упак', /^(уп|упак|упаковк[ауи]|упаковок|коробк[ауи]|коробок|pack)$/],
      ['рулон', /^рулон(?:а|ов|ы)?$/],
      ['пара', /^пар(?:а|у|ы)?$/],
      ['кг', /^(кг|килограмм(?:а|ов|ы)?)$/],
      ['л', /^(л|литр(?:а|ов|ы)?)$/]
    ];
    const match = units.find(function (entry) { return entry[1].test(key); });
    return match ? match[0] : '';
  }

  function priceNumber(value) {
    const s = clean(value);
    if (!/^(?:\d+|\d{1,3}(?: \d{3})+)(?:[.,]\d{1,4})?$/.test(s)) return 0;
    const n = Number(s.replace(/ /g, '').replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  function rubles(currency) { return !currency || /^(?:RUB|RUR|₽)$/i.test(clean(currency)); }

  function offerPrices(offers) {
    const list = Array.isArray(offers) ? offers : [offers];
    return list.flatMap(function (o) {
      if (!o || o['@type'] === 'AggregateOffer') return [];
      const spec = o.priceSpecification;
      const price = priceNumber(o.price ?? (spec && spec.price));
      if (!price || !rubles(o.priceCurrency || (spec && spec.priceCurrency))) return [];
      const qty = spec && spec.referenceQuantity;
      if (qty && qty.value != null && Number(qty.value) !== 1) return [];
      const unit = unitOf((qty && (qty.unitText || qty.unitCode)) || o.unitText || o.unitCode || (spec && (spec.unitText || spec.unitCode)));
      return [{ price, unit }];
    });
  }

  function single(values) {
    const unique = [...new Set(values.filter(Boolean))];
    return unique.length === 1 ? unique[0] : undefined;
  }

  function productFor(products, name, url) {
    function key(value) {
      if (!value) return '';
      try { const u = new URL(value, url); return u.origin + u.pathname.replace(/\/$/, '') + u.search; }
      catch (_) { return ''; }
    }
    const page = key(url);
    if (products.length === 1) {
      const product = products[0], address = key(product.url || product['@id']);
      if (page && address && page !== address && name && clean(product.name).toLowerCase() !== name.toLowerCase()) return undefined;
      return product;
    }
    const exact = products.filter(function (p) { return page && [p.url, p['@id'], p.mainEntityOfPage && (p.mainEntityOfPage['@id'] || p.mainEntityOfPage)].some(function (v) { return key(v) === page; }); });
    if (exact.length === 1) return exact[0];
    const names = (exact.length ? exact : products).filter(function (p) { return name && clean(p.name).toLowerCase() === name.toLowerCase(); });
    return names.length === 1 ? names[0] : undefined;
  }

  function productMarkup(html, fallback) {
    if (typeof document === 'undefined') return { body: fallback, products: [] };
    const template = document.createElement('template');
    template.innerHTML = html;
    const page = template.content.querySelector('main,[role="main"]') || template.content;
    page.querySelectorAll('script,style,template,noscript,del,s,strike,footer,nav,.hidden,.d-none,[hidden],[aria-hidden="true"],[style*="display:none"],[style*="display: none"],[style*="visibility: hidden"],[class*="old-price" i],[class*="price-old" i],[class*="old_price" i],[class*="oldprice" i],[class*="related-products" i],[class*="recommend" i],[class*="similar-products" i]').forEach(function (el) { el.remove(); });
    function prop(scope, name) {
      const node = Array.from(scope.querySelectorAll('[itemprop~="' + name + '"]')).find(function (el) {
        return el.closest('[itemscope]') === scope;
      });
      return node ? node.getAttribute('content') || node.getAttribute('href') || node.textContent.trim() : '';
    }
    const products = Array.from(page.querySelectorAll('[itemscope][itemtype$="/Product"]')).map(function (el) {
      const offers = Array.from(el.querySelectorAll('[itemscope][itemprop~="offers"][itemtype$="/Offer"]')).filter(function (offer) {
        return offer.parentElement.closest('[itemscope][itemtype$="/Product"]') === el;
      }).map(function (offer) {
        return { price: prop(offer, 'price'), priceCurrency: prop(offer, 'priceCurrency'), unitText: prop(offer, 'unitText'), unitCode: prop(offer, 'unitCode') };
      });
      return { name: prop(el, 'name'), sku: prop(el, 'sku'), mpn: prop(el, 'mpn'), url: prop(el, 'url'), offers };
    });
    return { body: page === template.content ? template.innerHTML : page.innerHTML, products };
  }

  function productLines(body) {
    return body.replace(/<\/(?:div|li|p|tr|dt|dd|h\d|td|th|section|button|a)>|<br\s*\/?>/gi, '\n').split('\n').map(clean).filter(Boolean);
  }

  function commerce(lines, product, html, hasHeading) {
    const articleLines = lines.map(function (line, i) {
      const m = line.match(/^(?:Артикул(?: производителя)?|Арт\.|SKU)\s*[:№#]?\s*(.*)$/i);
      if (!m) return null;
      const candidate = m[1] || lines[i + 1] || '';
      return /^[\p{L}\d][\p{L}\d./_-]*(?: [\p{L}\d][\p{L}\d./_-]*){0,3}$/u.test(candidate) ? { article: candidate, i } : null;
    }).filter(Boolean);
    const visibleArticle = single(articleLines.map(function (r) { return r.article; }));
    const schemaArticle = product && clean(product.mpn || product.sku || '');
    // Несколько артикулов без совпадения с конкретной карточкой — товар не выбран.
    const article = articleLines.length ? visibleArticle : schemaArticle;
    if ((articleLines.length && !article) || (!product && (!hasHeading || !article))) return {};
    const nearby = articleLines.filter(function (r) { return r.article === article; });
    const scope = nearby.length ? lines.filter(function (_, i) {
      return nearby.some(function (r) { return Math.abs(r.i - i) <= 12; });
    }) : lines;
    const visible = (nearby.length ? scope : []).map(function (line, i) {
      if (/^(?:доставка|стоимость доставки|бонусы|скидка|рассрочка|минимальный заказ)(?=$|[\s:])/i.test(scope[i - 1] || '') && !/^цена\s*:/i.test(line)) return null;
      const next = scope[i + 1] || '';
      const text = priceNumber(line) && /^(?:₽|руб\.?|р\.|RUB)(?=$|[\s/])/i.test(next) ? line + ' ' + next : line;
      const m = text.match(/^(?:цена\s*[:–—-]?\s*)?(\d[\d .,]*?)\s*(?:₽|руб(?:лей|ля)?\.?|р\.|RUB)(?=$|[\s/+])\s*(.*)$/i);
      if (!m) return null;
      const suffix = m[2].split(/\+\s*\d/)[0].trim();
      const unitLabel = suffix.match(/^(?:\/\s*|за\s+)(?:1\s+)?(.+)$/i);
      const unit = unitLabel ? unitOf(unitLabel[1].replace(/\s*\(.*\)$/, '').replace(/\s+\d+(?:[.,]\d+)?\s*м\.?$/i, '')) : unitOf(suffix);
      const price = priceNumber(m[1]);
      return price ? { price, unit, unknownUnit: !!unitLabel && !unit } : null;
    }).filter(Boolean);
    const offers = offerPrices(product && product.offers);
    const meta = rubles(metaContent(html, 'product:price:currency') || metaContent(html, 'priceCurrency'))
      ? priceNumber(metaContent(html, 'product:price:amount') || metaContent(html, 'og:price:amount') || metaContent(html, 'price')) : 0;
    const price = visible.length ? single(visible.map(function (x) { return x.price; }))
      : offers.length ? single(offers.map(function (x) { return x.price; })) : meta;
    const chosen = (visible.length ? visible : offers).filter(function (x) { return x.price === price; });
    const labels = scope.map(function (line, i) {
      const m = line.match(/^(?:Единица (?:измерения|продажи)|Ед\.?\s*изм(?:ерения)?\.?|Цена за)\s*[:–—-]?\s*(.*)$/i);
      return m ? unitOf(m[1] || scope[i + 1]) : '';
    });
    const explicitUnits = chosen.map(function (x) { return x.unit; }).filter(Boolean);
    const unit = !chosen.some(function (x) { return x.unknownUnit; }) &&
      single(explicitUnits.length ? explicitUnits : labels.concat(offers.filter(function (x) { return x.price === price; }).map(function (x) { return x.unit; })));
    const pack = unit === 'упак' ? single(scope.map(function (line) {
      const m = line.match(/(?:в упаковке\s*[:–—-]?\s*|упак(?:овк[ау])?\.?\s*\(\s*)(\d+)\s*(?:штук|шт\.?)(?![\p{L}\d])/iu);
      return m && Number(m[1]) > 1 ? Number(m[1]) : 0;
    })) : undefined;
    return { article, priceBuy: price, unit: unit || undefined, pack };
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
    const fallback = html.replace(/<(script|style|template|del|s|strike)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
    const markup = productMarkup(html, fallback), body = markup.body;
    const schema = jsonLdProducts(html), prods = schema.length ? schema : markup.products;
    const heading = body.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i), title = heading ? clean(heading[1]) : '';
    const p = productFor(prods, title, url);
    const listing = /^(?:каталог(?:\s|$)|результаты поиска|поиск по|корзина(?:\s|$)|вход(?:\s|$)|авторизация(?:\s|$))/i.test(title);
    if (p) {
      f.name = clean(p.name);
      if (p.brand) f.maker = clean(typeof p.brand === 'object' ? p.brand.name : p.brand);
      if (p.description) f.note = clean(p.description).slice(0, 300);
      const img = Array.isArray(p.image) ? p.image[0] : p.image;
      if (img) f.image = typeof img === 'object' ? img.url : String(img);
    }
    // OpenGraph и мета
    if (!f.name) f.name = clean(metaContent(html, 'og:title') || metaContent(html, 'twitter:title'));
    if (!f.note) { const d = metaContent(html, 'og:description') || metaContent(html, 'description'); if (d) f.note = clean(d).slice(0, 300); }
    if (!f.image) f.image = metaContent(html, 'og:image');
    if (!f.name && heading) f.name = clean(heading[1]);
    if (!f.name) { const t = body.match(/<title[^>]*>([\s\S]*?)<\/title>/i); if (t) f.name = clean(t[1]).split(/\s[|—–-]\s/)[0]; }
    const lines = productLines(body);
    extras(lines, f);
    if (!listing && (p || !prods.length)) Object.assign(f, commerce(lines, p, html, !!title));
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

  function priceForUnit(fields, currentUnit, currentPack) {
    if (!fields.priceBuy) return { error: 'Не удалось однозначно определить цену товара.' };
    if (!fields.unit) return { error: 'На сайте найдена цена ' + String(fields.priceBuy).replace('.', ',') + ' ₽. Не удалось определить единицу цены.' };
    const unit = unitOf(currentUnit);
    if (fields.unit === 'упак' && unit === 'шт' && fields.pack > 1) {
      return { price: Math.round(fields.priceBuy / fields.pack * 10000) / 10000, pack: fields.pack, packPrice: fields.priceBuy };
    }
    if (fields.unit !== unit) return { error: 'На сайте цена за «' + fields.unit + '», в материале — за «' + currentUnit + '».' };
    const pack = Number(currentPack) > 1 && unit !== 'упак' ? Number(currentPack) : 0;
    return { price: fields.priceBuy, pack, packPrice: pack ? Math.round(fields.priceBuy * pack * 10000) / 10000 : 0 };
  }

  return { parseProductHtml: parseProductHtml, parseProductText: parseProductText, priceForUnit, unitOf, REQUIRED: REQUIRED };
});
