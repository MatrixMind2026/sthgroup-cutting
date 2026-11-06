// STHGroup: реальные операции нового склада в изолированном Edge, только вымышленные данные.
// STH_PLAYWRIGHT=<путь к playwright> node test/t_stock_center_ui.js [папка снимков]
const fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert');
const { chromium } = require(process.env.STH_PLAYWRIGHT || 'playwright');
for (const f of ['dbf', 'matbase', 'sth_stock', 'sth_order']) require('../web/core/' + f + '.js');
(async () => {
 const data = fs.mkdtempSync(path.join(os.tmpdir(), 'sth-stock-ui-'));
 const out = process.argv[2] || path.join(data, 'screens'); fs.mkdirSync(out, { recursive: true });
 const MB = BM.mb, SK = BM.stock, O = BM.sth, b = SK.fix(MB.empty()), book = O.empty();
 const cl = O.addClient(book, { name: 'Демонстрационный клиент' });
 const first = O.addOrder(book, { clientId: cl.id }); first.no = '142'; first.note = 'Кухня';
 const second = O.addOrder(book, { clientId: cl.id }); second.no = '158'; second.note = 'Шкаф';
 const group = MB.addGroup(b, '', 'Листовые', 'sheet'), fit = MB.addGroup(b, '', 'Фурнитура', 'fit');
 const mat = MB.saveMat(b, Object.assign(MB.defMat(group.id), { name: 'ЛДСП Белый W980', art: 'W980', unit: 'лист', price: 3200, th: 16 })).mat;
 const hinge = MB.saveMat(b, Object.assign(MB.defMat(fit.id), { name: 'Петля с доводчиком', art: 'H110', unit: 'шт', price: 250 })).mat;
 SK.move(b, 'in', mat.id, 12); SK.move(b, 'in', hinge.id, 20); SK.reserve(b, mat.id, 8, first);
 SK.setCell(b, mat.id, 'А-01'); SK.setCell(b, hinge.id, 'К-03');
 const off = SK.addRemainder(b, mat.id, 1200, 600, 1, { order: first.id, no: first.no, project: 'Заказ №142 · Кухня', cell: 'Б-03' });
 const names = ['ЛДСП Дуб Сонома', 'МДФ Белый', 'ЛДСП Графит', 'Фанера'];
 names.forEach((name, i) => { const m = MB.saveMat(b, Object.assign(MB.defMat(group.id), { name, th: i === 1 ? 18 : 16, unit: 'лист' })).mat; const o = SK.addRemainder(b, m.id, 850 + i * 80, 450 + i * 50, 1, { project: 'Заказ №' + (139 - i), cell: 'Б-0' + (4 + i) }); if (!i) SK.reserveOff(b, o.id, second); });
 const baseFile = path.join(data, 'Демо.json'); fs.writeFileSync(baseFile, JSON.stringify(b));
 fs.writeFileSync(path.join(data, 'matbase.json'), JSON.stringify({ file: baseFile }));
 fs.writeFileSync(path.join(data, O.FILE), JSON.stringify(book));
 fs.writeFileSync(path.join(data, 'settings.json'), JSON.stringify({ theme: 'sth', sthOrdersDir: data, anim: 0 }));
 const srv = await require('../server.js').start({ webDir: path.join(__dirname, '../web'), dataDir: data, version: 'test', extraRoutes: () => ({ 'GET /api/sth/crm/state': (req, res) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"connected":false}'); }, 'POST /api/sth/materials-backup': (req, res) => { fs.copyFileSync(baseFile, baseFile + '.bak'); res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ path: baseFile + '.bak' })); } }) });
 let browser, page;
 try {
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, reducedMotion: 'reduce' });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(srv.url + '&splash=0'); await page.waitForFunction(() => !!document.getElementById('cTex').onchange); await page.locator('#rail [data-s="stock"]').click();
  const row = id => page.locator('[data-scrow="' + id + '"]');
  await row(off.id).click(); await page.screenshot({ path: path.join(out, 'stock-offcuts.png') });
  assert.match(await page.locator('.scInspector').innerText(), /Заказ №142/);
  await page.locator('#scPlace').click(); await page.locator('#scNewPlace').fill('В-09');
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await page.waitForFunction(id => BM.mb.cur.stock.offcuts.find(o => o.id === id).cell === 'В-09', off.id);
  await page.evaluate(() => STHStock.pending);
  await page.locator('.scInspector [data-ores]').click();
  await page.locator('#skO').selectOption(second.id); await page.getByRole('button', { name: 'Зарезервировать', exact: true }).click();
  await page.waitForFunction(id => BM.mb.cur.stock.offcuts.find(o => o.id === id).resNo === '158', off.id);
  await page.evaluate(() => STHStock.pending);
  assert.match(await page.locator('.scInspector').innerText(), /Заказ №142/);
  await page.reload(); await page.waitForFunction(() => !!document.getElementById('cTex').onchange); await page.locator('#rail [data-s="stock"]').click(); await row(off.id).click();
  assert.match(await page.locator('.scInspector').innerText(), /В-09/); assert.match(await page.locator('.scInspector').innerText(), /Под заказ №158/);
  await page.locator('.scInspector [data-ores]').click();
  await page.waitForFunction(id => !BM.mb.cur.stock.offcuts.find(o => o.id === id).res, off.id);
  await page.locator('#scHistory').click(); await page.locator('.skHistory').waitFor();
  assert.match(await page.locator('.skHistory').innerText(), /перемещён/);
  await page.locator('[data-skv="off"]').click(); await page.locator('#skQ').fill('1200 x 600'); assert.strictEqual(await page.locator('[data-scrow]').count(), 1);
  await page.locator('#skQ').fill(''); await page.locator('.scToolbar [data-sk-off-add]').click();
  await page.locator('#skM').fill('ЛДСП Белый W980 · W980'); await page.locator('#skL').fill('650'); await page.locator('#skW').fill('400');
  await page.locator('#skN').fill('0'); await page.getByRole('button', { name: 'Записать', exact: true }).click(); assert.strictEqual(await page.locator('#skN').count(), 1);
  await page.locator('#skN').fill('1'); await page.locator('#skOrigin').selectOption(first.id); await page.locator('#skPlace').fill('Б-08'); await page.locator('#skOffNote').fill('Без сколов');
  await page.getByRole('button', { name: 'Записать', exact: true }).click();
  await page.waitForFunction(() => BM.mb.cur.stock.offcuts.some(o => o.L === 650 && o.cell === 'Б-08' && o.originNo === '142'));
  await page.locator('.scInspector [data-ouse]').click(); await page.getByRole('button', { name: 'Отмена', exact: true }).click();
  assert.match(await page.locator('.scInspector').innerText(), /650/);
  await page.locator('.scInspector [data-ouse]').click(); await page.getByRole('button', { name: 'Выдать', exact: true }).click();
  await page.waitForFunction(() => BM.mb.cur.stock.offcuts.find(o => o.L === 650).used === 1);
  await page.locator('[data-skv="free"]').click(); await page.locator('.scTable').waitFor();
  assert.match(await page.locator('.scTable').innerText(), /Петля/); await page.waitForFunction(() => !document.querySelector('#toasts') || !document.querySelector('#toasts').children.length); await page.screenshot({ path: path.join(out, 'stock-free.png') });
  await page.locator('[data-skv="orders"]').click(); await page.locator('.scTable').waitFor();
  assert.match(await page.locator('.scTable').innerText(), /№142/); await page.screenshot({ path: path.join(out, 'stock-orders.png') });
  // Приход под заказ сохраняет документ происхождения и резерв, а не только увеличение остатка.
  await page.locator('.scToolbar [data-sk-in]').click(); await page.locator('#skM').fill('Петля с доводчиком · H110'); await page.locator('#skN').fill('5'); await page.locator('#skO').selectOption(second.id);
  await page.getByRole('button', { name: 'Принять', exact: true }).click();
  await page.waitForFunction(id => BM.mb.cur.stock.res.some(r => r.order === id && r.qty === 5), second.id);
  await page.locator('.scTable').getByText('№158', { exact: true }).waitFor();
  const disk = JSON.parse(fs.readFileSync(baseFile, 'utf8'));
  assert.ok(disk.stock.docs.some(d => d.order === second.id && d.project === 'Заказ 158'));
  await page.locator('.scToolbar [data-sk-in]').click(); await page.locator('#skM').fill('Петля с доводчиком · H110'); await page.locator('#skN').fill('2'); await page.locator('#skO').selectOption(first.id); await page.locator('#skKeepRes').uncheck();
  await page.getByRole('button', { name: 'Принять', exact: true }).click();
  await page.waitForFunction(id => BM.mb.cur.stock.docs.some(d => d.order === id && d.lines[0].qty === 2), first.id); await page.evaluate(() => STHStock.pending);
  assert.strictEqual(await page.evaluate(id => BM.stock.resOf(BM.mb.cur, id).length, hinge.id), 1, 'свободный остаток фурнитуры сохраняет источник без нового резерва');
  await page.locator('[data-skv="off"]').click(); await row(off.id).click();
  for (const width of [1100, 900]) {
   await page.setViewportSize({ width, height: 1000 }); await page.screenshot({ path: path.join(out, 'stock-' + width + '.png') });
   const box = await page.locator('.scInspector').boundingBox(); assert.ok(box.x >= 0 && box.x + box.width <= width + 1);
  }
  await page.locator('[data-skv="moves"]').click(); await page.locator('.skT').waitFor();
  await page.locator('[data-skv="history"]').click(); await page.locator('#skHistoryType').selectOption('stock');
  await page.waitForFunction(() => document.querySelector('#skHistoryType').value === 'stock');
  assert.deepStrictEqual(errors, []); console.log('ошибок нет: добавление, происхождение, место, резерв, перезапуск, история, выдача, приход под заказ, три вкладки, окна 1600/1100/900');
  console.log('Снимки: ' + out);
 } catch (e) { if (page) { await page.screenshot({path:path.join(out,'failure.png')}); console.log('FAIL STATE', await page.evaluate(() => ({section:App.S.section, view:STHStock.view, base:BM.mb.cur && BM.mb.cur.stock, path:MatBase.path, content:document.querySelector('#stock').innerText}))); } throw e; } finally { if (browser) await browser.close(); srv.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
