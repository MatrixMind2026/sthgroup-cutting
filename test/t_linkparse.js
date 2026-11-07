const assert = require('node:assert/strict');
const { parseProductHtml, priceForUnit } = require('../web/core/linkparse');

const url = 'https://shop.example/hinge/';
const parse = html => parseProductHtml(html, url).fields;
const page = content => '<h1>Петля GTV ZP-COCA450-BE</h1>' +
  '<div>Код товара: 8388</div><div>Артикул: ZP-COCA450-BE</div>' + content;

const gtv = parse(page('<meta itemprop="price" content="1"><div>187 руб.</div>' +
  '<div>+ 9 бонусов за покупку</div><div>Единица измерения: шт.</div><div>Доставка от 150 руб.</div>'));
assert.equal(gtv.priceBuy, 187);
assert.equal(gtv.article, 'ZP-COCA450-BE');
assert.equal(gtv.unit, 'шт');
assert.equal(priceForUnit(gtv, 'шт', 200).price, 187, 'розничную цену нельзя делить на складскую упаковку');

const unknown = parse(page('<p>187 руб.</p>'));
assert.equal(unknown.priceBuy, 187);
assert.match(priceForUnit(unknown, 'шт', 200).error, /единицу/);

for (const [price, unit, amount] of [
  ['950 ₽/компл.', 'компл', 950],
  ['220 руб. за погонный метр', 'м', 220],
  ['1 234,50 руб./м<sup>2</sup>', 'кв.м', 1234.5],
  ['600 ₽ за хлыст 3 м', 'хлыст', 600],
  ['100 ₽/кг', 'кг', 100],
  ['120 ₽ за лист', 'лист', 120]
]) {
  const result = parse(page('<p>' + price + '</p>'));
  assert.equal(result.unit, unit, price);
  assert.equal(result.priceBuy, amount, price);
}

const pack = parse(page('<p>1 000 ₽ за упаковку (200 шт.)</p>'));
assert.deepEqual(priceForUnit(pack, 'шт', 500), { price: 5, pack: 200, packPrice: 1000 });
assert.match(priceForUnit(pack, 'компл', 200).error, /упак/);
assert.match(priceForUnit(parse(page('<p>600 ₽ за хлыст 3 м</p>')), 'м', 0).error, /хлыст/);

assert.equal(parse(page('<p>Доставка</p><p>150 руб.</p>')).priceBuy, undefined);
assert.equal(parse(page('<p>8388 187 руб.</p>')).priceBuy, undefined);
assert.equal(parse(page('<p>187 руб./шт</p><p>200 руб./шт</p>')).priceBuy, undefined);
assert.equal(parse(page('<p>187 руб./шт</p><p>187 руб./компл</p>')).unit, undefined);
assert.equal(parse(page('<p><del>250 руб.</del>187 руб./шт</p>')).priceBuy, 187);
assert.equal(parse('<h1>Каталог петель</h1><p>Артикул: ABC</p><p>900 руб./шт</p>').priceBuy, undefined);
assert.equal(parse(page('<p>187 руб.</p><p>Артикул: OTHER</p><p>900 руб.</p>')).article, undefined);

function product(code, path, offers) {
  return { '@type': 'Product', sku: code, url: 'https://shop.example/' + path + '/', offers };
}
function ld(products) { return '<script type="application/ld+json">' + JSON.stringify(products) + '</script>'; }
const offer = { '@type': 'Offer', price: '187.00', priceCurrency: 'RUB', unitCode: 'C62' };
const selected = parse(ld([product('OTHER', 'other', { ...offer, price: 999 }), product('ABC', 'hinge', offer)]));
assert.equal(selected.article, 'ABC');
assert.equal(selected.priceBuy, 187);
assert.equal(selected.unit, 'шт');
assert.equal(parse(ld(product('ABC', 'hinge', [offer, { ...offer, price: 200 }]))).priceBuy, undefined);
assert.equal(parse(ld(product('ABC', 'hinge', { ...offer, priceCurrency: 'USD' }))).priceBuy, undefined);
assert.equal(parse(ld(product('ABC', 'hinge', { '@type': 'AggregateOffer', lowPrice: 1 }))).priceBuy, undefined);
console.log('Ссылки поставщиков: цена, артикул, единицы и упаковка — OK');
