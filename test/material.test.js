const assert = require('assert');
const MB = require('../core/materialbase');
const LP = require('../core/linkparse');
const pricing = require('../core/pricing');

let passed = 0;
function t(name, fn) { try { fn(); passed++; console.log('ok   ' + name); } catch (e) { console.error('FAIL ' + name + '\n' + e.stack); process.exitCode = 1; } }

t('группы: вложенность, путь, тип по предку, перенос без циклов, удаление', () => {
  const b = MB.emptyBase(true);
  const sheet = b.groups[0];
  const a = MB.addGroup(b, sheet.id, 'ЛДСП'); const c = MB.addGroup(b, a.id, 'Egger');
  assert.deepStrictEqual(MB.groupPath(b, c.id), ['01. Листовые материалы', 'ЛДСП', 'Egger']);
  assert.strictEqual(MB.groupType(b, c.id), 'sheet');
  assert.strictEqual(MB.moveGroup(b, a.id, c.id), false);
  assert.strictEqual(MB.moveGroup(b, c.id, sheet.id), true);
  b.materials.push(MB.newMaterial(c.id, { name: 'X' }));
  const r = MB.deleteGroup(b, sheet.id);
  assert.strictEqual(r.materials, 1); assert.strictEqual(r.groups, 3);
});

t('наценка: процент, умножение, добавка, фикс, наследование от группы, округление', () => {
  const b = MB.emptyBase(true);
  const g = b.groups[3]; g.markup = { mode: 'percent', value: 30, round: 0 };
  const sub = MB.addGroup(b, g.id, 'Петли');
  const m = MB.newMaterial(sub.id, { name: 'Петля', priceBuy: 100 }); b.materials.push(m);
  assert.strictEqual(MB.sellPrice(b, m), 130);
  m.markup = { mode: 'mul', value: 1.5 }; assert.strictEqual(MB.sellPrice(b, m), 150);
  m.markup = { mode: 'add', value: 7 }; assert.strictEqual(MB.sellPrice(b, m), 107);
  m.markup = { mode: 'fixed', value: 99 }; assert.strictEqual(MB.sellPrice(b, m), 99);
  m.markup = { mode: 'none' }; m.priceSell = 111; assert.strictEqual(MB.sellPrice(b, m), 111);
  g.markup = { mode: 'mul', value: 1.234, round: -1 }; m.markup = { mode: 'inherit' }; m.priceBuy = 1000;
  assert.strictEqual(MB.sellPrice(b, m), 1230);
});

t('история цен пишется только при изменении', () => {
  const b = MB.emptyBase(true); const m = MB.newMaterial(b.groups[3].id, { priceBuy: 10, priceSell: 12, markup: { mode: 'none' } });
  assert.ok(MB.recordPrice(b, m)); assert.ok(!MB.recordPrice(b, m));
  m.priceBuy = 11; assert.ok(MB.recordPrice(b, m)); assert.strictEqual(m.history.length, 2);
});

t('перенос из старого materials.json и обратно в формат расчёта', () => {
  const legacy = {
    materials: [{ id: 'l16', name: 'ЛДСП 16', thickness: 16, sheetW: 2800, sheetH: 2070, servicePerM2: 350, salePerSheet: 2400 }],
    edges: [{ id: 'e1', name: 'ABS', servicePerM: 20, salePerM: 15 }], hardware: [{ id: 'h1', name: 'Конфирмат', unit: 'шт.', salePrice: 3 }]
  };
  const b = MB.fromLegacy(legacy); const back = MB.toLegacy(b);
  assert.ok(back.materials[0].groupChain.length >= 1); delete back.materials[0].groupChain; assert.deepStrictEqual(back.materials[0], { id: 'l16', name: 'ЛДСП 16', thickness: 16, sheetW: 2800, sheetH: 2070, servicePerM2: 350, salePerSheet: 2400, grain: false });
  assert.strictEqual(back.edges[0].servicePerM, 20); assert.strictEqual(back.edges[0].salePerM, 15);
  assert.strictEqual(back.hardware[0].salePrice, 3);
  const q = pricing.calcOrder({ parts: [{ id: 'p', name: 'A', materialId: 'l16', l: 800, w: 500, qty: 2 }] }, back, {});
  assert.ok(q.total > 0);
});

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<NK_Base>
 <Material><Group_Name>01. Листовые материалы/ЛДСП/Egger</Group_Name><Name>ЛДСП Egger W1000 16</Name><Article>W1000</Article><Unit>лист</Unit><Thickness>16</Thickness><Length>2800</Length><Width>2070</Width><Price>3 450,50</Price><Weird_Tag>секрет</Weird_Tag></Material>
 <Material><Group_Name>02. Кромочные материалы/ABS</Group_Name><Name>ABS 0.4 белый &amp; глянец</Name><Article>ABS-1</Article><Unit>м.п.</Unit><Price>12</Price></Material>
 <Material><Group_Name>04. Фурнитура/Петли</Group_Name><Name>Петля Blum</Name><Article>71B3550</Article><Price>180</Price></Material>
</NK_Base>`;

t('импорт XML: группы по «/», типы, цены с пробелами, неизвестные теги сохраняются', () => {
  const b = MB.emptyBase(false);
  const recs = MB.xmlRecords(XML); assert.strictEqual(recs.length, 3);
  const r = MB.importRecords(b, recs, {});
  assert.strictEqual(r.added, 3);
  const m = b.materials[0];
  assert.strictEqual(m.priceBuy, 3450.5); assert.strictEqual(m.thickness, 16); assert.strictEqual(m.extra.Weird_Tag, 'секрет');
  assert.strictEqual(MB.kindOf(b, m), 'sheet'); assert.strictEqual(MB.kindOf(b, b.materials[1]), 'edge'); assert.strictEqual(MB.kindOf(b, b.materials[2]), 'hardware');
  assert.strictEqual(b.materials[1].name, 'ABS 0.4 белый & глянец');
});

t('экспорт XML и повторный импорт без потерь', () => {
  const b = MB.emptyBase(false); MB.importRecords(b, MB.xmlRecords(XML), {});
  const xml = MB.toXml(b);
  const b2 = MB.emptyBase(false); MB.importRecords(b2, MB.xmlRecords(xml), {});
  assert.strictEqual(b2.materials.length, 3);
  assert.deepStrictEqual(b2.materials.map(m => m.name), b.materials.map(m => m.name));
  assert.strictEqual(b2.materials[0].extra.Weird_Tag, 'секрет');
  assert.strictEqual(b2.materials[0].priceBuy, 3450.5);
});

t('импорт: дубликаты обновляются по артикулу, пропускаются или добавляются', () => {
  const b = MB.emptyBase(false); MB.importRecords(b, MB.xmlRecords(XML), {});
  const recs = [{ Article: 'W1000', Name: 'ЛДСП Egger W1000 16', Price: '4000' }, { Article: 'NEW1', Name: 'Новый', Price: '5' }];
  let r = MB.importRecords(b, recs, { key: 'article', onDup: 'skip' }); assert.deepStrictEqual([r.added, r.skipped, r.updated], [1, 1, 0]);
  r = MB.importRecords(b, recs, { key: 'article', onDup: 'update' }); assert.strictEqual(r.updated, 2);
  assert.strictEqual(b.materials[0].priceBuy, 4000);
  assert.ok(b.materials[0].history.length >= 2);
});

t('обновление цен из CSV: ; и запятая как десятичная, только цена, без новых', () => {
  const b = MB.emptyBase(false); MB.importRecords(b, MB.xmlRecords(XML), {});
  const csv = 'Артикул;Цена\r\nW1000;"3 999,90"\r\nABS-1;15\r\nNONE;1\r\n';
  const rows = MB.parseTable(csv); assert.strictEqual(rows.length, 3);
  const r = MB.importRecords(b, rows, { key: 'article', onDup: 'update', addNew: false, onlyPrice: true });
  assert.strictEqual(r.updated, 2); assert.strictEqual(r.noMatch, 1);
  assert.strictEqual(b.materials[0].priceBuy, 3999.9); assert.strictEqual(b.materials[0].name, 'ЛДСП Egger W1000 16');
});

t('CSV-экспорт читается обратно', () => {
  const b = MB.emptyBase(false); MB.importRecords(b, MB.xmlRecords(XML), {});
  const rows = MB.parseTable(MB.toCsv(b)); assert.strictEqual(rows.length, 3);
  assert.strictEqual(rows[2].Name, 'Петля Blum');
});

t('поиск и поиск дубликатов', () => {
  const b = MB.emptyBase(false); MB.importRecords(b, MB.xmlRecords(XML), {});
  assert.strictEqual(MB.search(b, { text: 'blum' }).length, 1);
  assert.strictEqual(MB.search(b, { text: 'w1000', type: 'edge' }).length, 0);
  MB.importRecords(b, [{ Name: 'петля blum', Article: 'X' }], { key: 'article', onDup: 'add' });
  assert.strictEqual(MB.findDuplicates(b, 'name').length, 1);
});

t('смета: позиции из базы, итоги, обновление цен', () => {
  const b = MB.emptyBase(true); b.groups[3].markup = { mode: 'percent', value: 50, round: 2 };
  const m = MB.newMaterial(b.groups[3].id, { name: 'Ручка', article: 'R1', priceBuy: 100 }); b.materials.push(m);
  const it = MB.estimateItemFromMaterial(b, m, 4); assert.strictEqual(it.priceSell, 150);
  assert.deepStrictEqual(MB.estimateTotals([it]), { sell: 600, buy: 400, margin: 200 });
  m.priceBuy = 200; MB.refreshEstimate(b, [it]); assert.strictEqual(it.priceSell, 300);
});

t('смета в итоге заказа только при включённой галочке', () => {
  const order = { parts: [], estimate: { inTotal: false, items: [{ name: 'Ручка', qty: 2, priceSell: 150, unit: 'шт.' }] } };
  assert.strictEqual(pricing.calcOrder(order, { materials: [], edges: [] }, {}).lines.length, 0);
  order.estimate.inTotal = true;
  const q = pricing.calcOrder(order, { materials: [], edges: [] }, {});
  assert.strictEqual(q.lines.length, 1); assert.strictEqual(q.lines[0].sum, 300);
});

const HTML = `<html><head><title>Петля — Магазин</title><meta property="og:site_name" content="МДМ-Комплект">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"Петля Blum Clip Top 71B3550","sku":"71B3550","brand":{"@type":"Brand","name":"Blum"},"offers":{"@type":"Offer","price":"182.50","priceCurrency":"RUB"}}</script></head><body><h1>Петля</h1></body></html>`;
t('ссылка: JSON-LD даёт название, артикул, цену, магазин', () => {
  const r = LP.parseProductHtml(HTML, 'https://mdm-complekt.ru/p/1');
  assert.strictEqual(r.fields.name, 'Петля Blum Clip Top 71B3550'); assert.strictEqual(r.fields.article, '71B3550');
  assert.strictEqual(r.fields.priceBuy, 182.5); assert.strictEqual(r.fields.supplier, 'МДМ-Комплект'); assert.deepStrictEqual(r.missing, []);
});
t('ссылка: без разметки берём h1, артикул и цену из текста, остальное в missing', () => {
  const r = LP.parseProductHtml('<html><body><h1>ЛДСП Egger 2800x2070x16 мм</h1><div>Артикул: W1000</div><div class="price">3 450 ₽</div></body></html>', 'https://www.shop.ru/x');
  assert.strictEqual(r.fields.name, 'ЛДСП Egger 2800x2070x16 мм'); assert.strictEqual(r.fields.article, 'W1000');
  assert.strictEqual(r.fields.priceBuy, 3450); assert.strictEqual(r.fields.supplier, 'shop.ru');
  assert.strictEqual(r.fields.thickness, 16); assert.strictEqual(r.fields.sheetW, 2800); assert.strictEqual(r.fields.sheetH, 2070);
  const e = LP.parseProductHtml('<html><body><p>пусто</p></body></html>', 'https://a.ru/');
  assert.ok(e.missing.indexOf('priceBuy') >= 0 && e.missing.indexOf('article') >= 0);
});
t('ссылка: вставленный текст', () => {
  const r = LP.parseProductText('Ручка-скоба 128 мм\nАртикул: RS-128\nЦена 245 руб.', 'https://x.ru/');
  assert.strictEqual(r.fields.name, 'Ручка-скоба 128 мм'); assert.strictEqual(r.fields.article, 'RS-128'); assert.strictEqual(r.fields.priceBuy, 245);
});

t('мусорный XML и CSV не ломают разбор', () => {
  assert.deepStrictEqual(MB.xmlRecords('не xml'), []); assert.deepStrictEqual(MB.parseTable(''), []);
});

console.log('\nМодуль «Смета»: пройдено тестов: ' + passed);

// ---- формат Базис-Мебельщика ----
(function () {
  const assert = require('assert');
  const MB = require('../core/materialbase.js');
  const xml = '﻿<?xml version="1.0" encoding="UTF-8"?>\n<Database><Materials>' +
    '<Material><Article>A1</Article><Name>ЛДСП 16 &amp; тест</Name><Group_Name>01. Листовые материалы/01. ЛДСП</Group_Name><Unit_Measure>кв.м</Unit_Measure><Price>364</Price><Coef>1.2</Coef><Length>2750</Length><Width>1830</Width><Thickness>16</Thickness><Sign>16мм.</Sign><Overhang>0</Overhang><Color>8369910</Color><Texture/><Class>M1 </Class><IsTape>N</IsTape><Sync_External/><Weight>10.4</Weight><Comment/><NoAvailable>N</NoAvailable><Stretch>0</Stretch><Retry>0</Retry><Mirror>0</Mirror><Transparent>0</Transparent><Shiness>0</Shiness><Bright>0</Bright><DX>0</DX><DY>0</DY><OffsetX>1830</OffsetX><OffsetY>2750</OffsetY><Angle>0</Angle><Coef_Exc_Cutting>1</Coef_Exc_Cutting><Round_Mode>0</Round_Mode><Alt_Price>0</Alt_Price><Name_FNP/><Type_Group_Material>2</Type_Group_Material><Color_RGB>(246, 182, 127)</Color_RGB><Color_HEX>F6B67F</Color_HEX></Material>' +
    '<Material><Article>A1</Article><Name>Другая плита</Name><Group_Name>01. Листовые материалы/02. МДФ</Group_Name><Unit_Measure>лист</Unit_Measure><Price>1000</Price><Coef>1</Coef><Length>2800</Length><Width>2070</Width><Thickness>.8</Thickness><Sign/><Overhang>0</Overhang><Color>8369910</Color><Texture/><Class/><IsTape>Y</IsTape><Sync_External/><Weight>0</Weight><Comment>тест</Comment><NoAvailable>Y</NoAvailable><Stretch>0</Stretch><Retry>0</Retry><Mirror>0</Mirror><Transparent>0</Transparent><Shiness>0</Shiness><Bright>0</Bright><DX>0</DX><DY>0</DY><OffsetX>1000</OffsetX><OffsetY>1000</OffsetY><Angle>0</Angle><Coef_Exc_Cutting>1</Coef_Exc_Cutting><Round_Mode>0</Round_Mode><Alt_Price>0</Alt_Price><Name_FNP/><Type_Group_Material>2</Type_Group_Material><Color_RGB>(246, 182, 127)</Color_RGB><Color_HEX>F6B67F</Color_HEX></Material>' +
    '</Materials></Database>';
  const rec = (s) => { const o = [], re = /<Material>([\s\S]*?)<\/Material>/g; let m; while ((m = re.exec(s))) { const f = {}; m[1].replace(/<(\w+)(?:\/>|>([^<]*)<\/\1>)/g, (a, k, v) => { f[k] = v || ''; }); o.push(f); } return o; };
  let ok = 0;
  function t(n, fn) { try { fn(); ok++; console.log('ok   ' + n); } catch (e) { console.error('FAIL ' + n + '\n' + e.stack); process.exitCode = 1; } }
  t('Базис XML: распознаётся, повторяющиеся артикулы не склеиваются', () => {
    assert.ok(MB.isBazisXml(xml));
    const b = MB.emptyBase(); const r = MB.importBazis(b, xml, { replace: true });
    assert.strictEqual(r.added, 2); assert.strictEqual(b.materials.length, 2);
    assert.strictEqual(MB.groupPath(b, b.materials[0].groupId).join('/'), '01. Листовые материалы/01. ЛДСП');
    assert.strictEqual(MB.groupType(b, b.materials[0].groupId), 'sheet');
  });
  t('Базис XML: Коэф — это наценка, цена листа считается из цены за м²', () => {
    const b = MB.emptyBase(); MB.importBazis(b, xml, { replace: true });
    const m = b.materials[0];
    assert.strictEqual(MB.sellPrice(b, m), 436.8);
    assert.strictEqual(MB.sheetPrice(b, m), Math.round(436.8 * 2.75 * 1.83 * 100) / 100);
  });
  t('Базис XML: экспорт без потерь (все 37 полей)', () => {
    const b = MB.emptyBase(); MB.importBazis(b, xml, { replace: true });
    const a = rec(xml), c = rec(MB.toXml(b));
    assert.strictEqual(c.length, a.length);
    a.forEach((x, i) => Object.keys(x).forEach((k) => {
      const u = x[k], v = c[i][k];
      if (u !== v) assert.ok(['Price', 'Coef', 'Length', 'Width', 'Thickness'].includes(k) && Number(u) === Number(v), k + ': ' + u + ' ≠ ' + v);
    }));
  });
  t('Базис XML: добавление к имеющейся базе пропускает точные повторы', () => {
    const b = MB.emptyBase(); MB.importBazis(b, xml, { replace: true });
    const r = MB.importBazis(b, xml, { replace: false });
    assert.strictEqual(r.added, 0); assert.strictEqual(r.skipped, 2);
  });
  console.log('Формат Базиса: пройдено тестов: ' + ok);
})();
