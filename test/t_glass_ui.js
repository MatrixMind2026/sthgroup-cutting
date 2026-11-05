// STHGroup: настоящий интерфейс в отдельном headless Chromium. Playwright устанавливается отдельно.
// STH_PLAYWRIGHT=<путь к playwright> node test/t_glass_ui.js [папка снимков]
const fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert');
const { chromium } = require(process.env.STH_PLAYWRIGHT || 'playwright');
require('../web/core/sth_order.js');
const O = BM.sth;
(async () => {
 const data = fs.mkdtempSync(path.join(os.tmpdir(), 'sth-glass-'));
 const out = process.argv[2] || path.join(data, 'screens'); fs.mkdirSync(out, { recursive: true });
 const book = O.empty(), client = O.addClient(book, { name: 'Демонстрационный клиент' });
 const order = O.addOrder(book, { clientId: client.id }); order.no = 'STH-0142';
 O.putItem(order, path.join(data, 'Кухня.bmk'), { title: 'Кухня', parts: 18, smallEdge: 0, smallDrill: 0, mat: 8000, fit: 3000, at: new Date().toISOString(), sheets: [{ mat: 'ЛДСП 16 Белый', name: 'ЛДСП 16 Белый', th: 16, n: 3, work: book.cat.sheetWorks[0].id }] });
 O.moveStatus(order, 'work', undefined, book);
 fs.writeFileSync(path.join(data, O.FILE), JSON.stringify(book));
 fs.writeFileSync(path.join(data, 'settings.json'), JSON.stringify({ theme: 'sth', sthOrdersDir: data, anim: 0 }));
 const srv = await require('../server.js').start({ webDir: path.join(__dirname, '../web'), dataDir: data, version: 'test',
  extraRoutes: () => ({ 'GET /api/sth/crm/state': (req,res) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"connected":false}'); } }) });
 let browser;
 try {
  browser = await chromium.launch({ channel: process.env.STH_BROWSER || 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, reducedMotion: 'reduce' });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(srv.url + '&splash=0');
  await page.locator('#rail [data-s="orders"]').click();
  await page.locator('.soCard').first().click();
  await page.locator('#orders .sgHero h1').waitFor();
  assert.match(await page.locator('.sgHero h1').innerText(), /STH-0142/);
  const originalTotal = await page.evaluate(() => BM.sth.calc(STHO.book, BM.sth.order(STHO.book, STHO.cur)).total);
  assert.strictEqual(await page.locator('#orders #soKp').count(), 1);
  assert.strictEqual(await page.locator('.sgFlow [aria-current="step"]').innerText(), 'В работе');
  await page.screenshot({ path: path.join(out, 'glass-order.png') });
  await page.locator('.sgOrderMeta > summary').click();
  await page.locator('#soNote').fill('Проверка сохранения реквизитов');
  await page.locator('#soNote').press('Tab');
  await page.waitForFunction(() => BM.sth.order(STHO.book, STHO.cur).note === 'Проверка сохранения реквизитов');
  assert.strictEqual(await page.locator('.sgOrderMeta').evaluate(el => el.open), true);
  await page.locator('.soS .sgSide').last().locator('summary').click();
  await page.locator('#soDays').fill('11'); await page.locator('#soDays').press('Tab');
  await page.waitForFunction(() => BM.sth.order(STHO.book, STHO.cur).terms.days === 11);
  assert.strictEqual(await page.locator('.soS .sgSide').last().evaluate(el => el.open), true);
  await page.locator('#orders .soTabs [data-tb="pay"]').click();
  await page.locator('#soPa').fill('1000'); await page.locator('#soPn').fill('Тестовая оплата');
  await page.locator('#soPadd').click();
  await page.waitForFunction(() => BM.sth.order(STHO.book, STHO.cur).payments.length === 1);
  assert.strictEqual(await page.evaluate(() => BM.sth.calc(STHO.book, BM.sth.order(STHO.book, STHO.cur)).total), originalTotal);
  await page.locator('#orders .soTabs [data-tb="items"]').click();
  assert.strictEqual(await page.locator('#soAddItem').count(), 1);
  assert.strictEqual(await page.locator('[data-iop="0"]').count(), 1);
  await page.locator('#orders .soTabs [data-tb="calc"]').click();
  for (const width of [1100, 900]) {
   await page.setViewportSize({ width, height: 1000 });
   await page.screenshot({ path: path.join(out, 'glass-order-' + width + '.png') });
   const bounds = await page.locator('#orders .soS').boundingBox(); assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width + 1);
  }
  await page.locator('#sgAllOrders').click(); await page.locator('.soBoard').waitFor();
  await page.locator('[data-oview="list"]').click();
  assert.strictEqual(await page.locator('#orders .soL').isVisible(), true, 'режим списка и поиск заказов остаются доступны');
  await page.locator('[data-oview="board"]').click(); await page.locator('.soBoard').waitFor();
  await page.locator('.soCard').first().click(); await page.locator('.sgHero').waitFor();
  await page.locator('#rail [data-s="clients"]').click();
  await page.locator('#scName').waitFor();
  assert.strictEqual(await page.locator('#orders .soL').isVisible(), true, 'список клиентов не скрывается после центра заказа');
  await page.locator('#rail [data-s="orders"]').click();
  await page.locator('#orders .soBoard, #orders .sgHero').first().waitFor();
  if (await page.locator('#orders .soBoard').isVisible()) await page.locator('.soCard').first().click();
  await page.locator('.sgHero').waitFor();
  await page.setViewportSize({ width: 1600, height: 1000 });
  const opening = page.evaluate(p => App.openPath(p), path.join(__dirname, 'out/est.bmk'));
  const all = page.getByRole('button', { name: 'Всю модель', exact: true });
  try { await all.waitFor({ timeout: 4000 }); await all.click(); } catch (e) { /* не всякий образец содержит выделенные детали */ }
  await opening;
  console.log('Окна после импорта: ' + (await page.locator('#modals .modal > h2').allInnerTexts()).join(' | '));
  await page.screenshot({ path: path.join(out, 'glass-import.png') });
  for (let i = 0; i < 3 && await page.locator('#modals .modal').count(); i++) {
   const modal = page.locator('#modals .modal').last();
   const allParts = modal.getByRole('button', { name: 'Всю модель', exact: true });
   if (await allParts.count()) await allParts.click(); else await modal.locator('h2 button').click();
  }
  await page.locator('#rail [data-s="est"]').click();
  await page.locator('#eBody table').waitFor();
  assert.ok(await page.locator('#eBody input.pv').count() > 0);
  await page.screenshot({ path: path.join(out, 'glass-estimate.png') });
  assert.deepStrictEqual(errors, []);
  console.log('ошибок нет: центр заказа, этапы, реквизиты, оплаты без изменения расчёта, изделия, возврат к доске, окна 1600/1100/900');
  console.log('Снимки: ' + out);
 } finally { if (browser) await browser.close(); srv.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
