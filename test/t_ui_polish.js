// STHGroup: изолированный Edge, демонстрационные данные и настоящий DOM приложения.
const fs = require('fs'), os = require('os'), path = require('path'), vm = require('vm'), assert = require('assert');
const { chromium } = require(process.env.STH_PLAYWRIGHT || 'playwright');
for (const f of ['dbf', 'matbase', 'sth_stock', 'sth_order']) require('../web/core/' + f + '.js');
for (const f of ['geom', 'cut', 'project', 'draw', 'zip', 'out_tab', 'base', 'estimate', 'out_est', 'facades', 'out_det']) require('../web/core/' + f + '.js');
(async () => {
 const data = fs.mkdtempSync(path.join(os.tmpdir(), 'sth-polish-')), out = process.argv[2] || path.join(data, 'screens'); fs.mkdirSync(out, { recursive: true });
 const O = BM.sth, MB = BM.mb, SK = BM.stock, book = O.empty(), b = SK.fix(MB.empty());
 const client = O.addClient(book, { name: 'Демонстрационный клиент' }), order = O.addOrder(book, { clientId: client.id }); order.no = 'STH-0142';
 const modelFile = path.join(data, 'Кухня.bmk'), sourceModel = JSON.parse(fs.readFileSync(path.join(__dirname, 'out/est.bmk'), 'utf8'));
 sourceModel.model.orderNo = order.no; sourceModel.model.customer = client.name;
 const modelState = BM.project.build(sourceModel, BM.defaults());
 modelState.mats.forEach(m => { if (m.cfg.on) BM.project.nest(modelState, m.key, { quality: 0 }); });
 sourceModel.work = modelState.work; fs.writeFileSync(modelFile, JSON.stringify(sourceModel));
 const g = MB.addGroup(b, '', 'Листы', 'sheet'), mat = MB.saveMat(b, Object.assign(MB.defMat(g.id), { name: 'ЛДСП Белый', th: 16, unit: 'лист' })).mat;
 SK.move(b, 'in', mat.id, 12); SK.addRemainder(b, mat.id, 1200, 600, 1, { project: 'Заказ №142', cell: 'Б-03' });
 const baseFile = path.join(data, 'Демо.json'); fs.writeFileSync(baseFile, JSON.stringify(b));
 fs.writeFileSync(path.join(data, 'matbase.json'), JSON.stringify({ file: baseFile })); fs.writeFileSync(path.join(data, O.FILE), JSON.stringify(book));
 fs.writeFileSync(path.join(data, 'settings.json'), JSON.stringify({ theme: 'sth', sthOrdersDir: data, anim: 0 }));
 let allowBackup = true;
 const srv = await require('../server.js').start({ webDir: path.join(__dirname, '../web'), dataDir: data, version: 'test', extraRoutes: () => ({
  'GET /api/sth/crm/state': (req, res) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"connected":false}'); },
  'POST /api/sth/materials-backup': (req, res) => { if (allowBackup) fs.copyFileSync(baseFile, baseFile + '.bak'); res.writeHead(allowBackup ? 200 : 500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(allowBackup ? { path: baseFile + '.bak' } : { error: 'Демонстрационный отказ копирования' })); }
 }) });
 let browser, page;
 try {
  browser = await chromium.launch({ channel: 'msedge', headless: true }); page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, reducedMotion: 'reduce' });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const ready = () => page.waitForFunction(() => !!document.getElementById('cTex').onchange);
  const go = async sec => { await page.locator('#rail [data-s="' + sec + '"]').click(); await page.waitForFunction(s => App.S.section === s, sec); };
  const checkGaps = async id => {
   const result = await page.locator('#' + id).evaluate(root => Array.from(root.children).filter(el => el.classList.contains('splitH') && el.getClientRects().length && getComputedStyle(el).display !== 'none').map(el => {
    const prev = el.previousElementSibling, next = el.nextElementSibling, h = el.getBoundingClientRect();
    if (!prev || !next || !prev.getClientRects().length || !next.getClientRects().length) return null;
    const p = prev.getBoundingClientRect(), n = next.getBoundingClientRect(), button = el.querySelector('.tng'), b = button && button.getBoundingClientRect();
    return { gap: n.left - p.right, width: h.width, inside: !b || (b.left >= h.left && b.right <= h.right && b.height <= 28) };
   }).filter(Boolean));
   assert.ok(result.length, 'есть видимые стыки в ' + id);
   result.forEach(r => { assert.strictEqual(r.gap, 12, 'зазор в ' + id); assert.strictEqual(r.width, 12); assert.ok(r.inside, 'кнопка скрытия внутри зазора в ' + id); });
  };
  await page.goto(srv.url + '&splash=0'); await ready(); await go('orders'); await page.locator('.soBoard').waitFor();
  const toolbar = () => page.evaluate(() => ['[data-oview="list"]', '[data-oview="board"]', '#soBoardQ', '#soNew'].map(s => { const r = document.querySelector(s).getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; }));
  const before = await toolbar(); await page.screenshot({ path: path.join(out, 'orders-cards.png') });
  await page.locator('[data-oview="list"]').click(); await page.locator('.soOrderList').waitFor(); assert.deepStrictEqual(await toolbar(), before);
  await page.screenshot({ path: path.join(out, 'orders-list.png') });
  await page.locator('#soBoardQ').fill('Несуществующий заказ'); assert.strictEqual(await page.locator('.soOrderList tbody tr').count(), 0);
  await page.locator('#soBoardQ').fill(''); assert.strictEqual(await page.locator('.soOrderList tbody tr').count(), 1);
  await page.locator('#soSt').selectOption('work'); assert.strictEqual(await page.locator('.soOrderList tbody tr').count(), 0); await page.locator('#soSt').selectOption('');
  await page.locator('.soOrderList button[data-ko]').first().click(); await page.locator('.sgHero').waitFor();
  await page.locator('#sgAllOrders').click(); await page.locator('.soOrderList').waitFor(); assert.deepStrictEqual(await toolbar(), before);
  await page.locator('[data-oview="board"]').click(); await page.locator('.soCard').first().click(); await page.locator('.sgHero').waitFor();
  const opening = page.evaluate(p => App.openPath(p), modelFile);
  try { const all = page.getByRole('button', { name: 'Всю модель', exact: true }); await all.waitFor({ timeout: 3000 }); await all.click(); } catch (_) {}
  await opening;
  for (let i = 0; i < 3 && await page.locator('#modals .modal').count(); i++) await page.locator('#modals .modal').last().locator('h2 button').click();
  try { const skip = page.getByRole('button', { name: 'Не сейчас', exact: true }); await skip.waitFor({ timeout: 3000 }); await skip.click(); } catch (_) {}
  await go('est'); await page.locator('table.sthCompact colgroup').waitFor();
  // Панели разделены одинаковыми зазорами; таблица следует за обеими границами.
  await page.setViewportSize({ width: 2200, height: 1100 });
  await page.waitForFunction(() => Math.abs(document.querySelector('table.sthCompact').getBoundingClientRect().width - document.getElementById('eBody').clientWidth) < 2);
  const docking = () => page.evaluate(() => { const l = document.getElementById('eLeft').getBoundingClientRect(), c = document.getElementById('eCenter').getBoundingClientRect(), r = document.getElementById('eRight').getBoundingClientRect(), t = document.querySelector('table.sthCompact').getBoundingClientRect(); return { leftGap: c.left - l.right, rightGap: r.left - c.right, table: t.width, body: document.getElementById('eBody').clientWidth }; });
  assert.strictEqual((await docking()).leftGap, 12); assert.strictEqual((await docking()).rightGap, 12);
  const rightGrip = page.locator('#eRight').locator('xpath=preceding-sibling::*[1]');
  let grip = await rightGrip.boundingBox();
  await page.mouse.move(grip.x + grip.width / 2, grip.y + 30); await page.mouse.down(); await page.mouse.move(grip.x + grip.width / 2 + 95, grip.y + 30, { steps: 8 }); await page.mouse.up();
  await page.waitForFunction(() => Math.abs(document.querySelector('table.sthCompact').getBoundingClientRect().width - document.getElementById('eBody').clientWidth) < 2);
  assert.strictEqual((await docking()).rightGap, 12);
  const leftGrip = page.locator('#eLeft + .splitH'); grip = await leftGrip.boundingBox();
  await page.mouse.move(grip.x + grip.width / 2, grip.y + 30); await page.mouse.down(); await page.mouse.move(grip.x + grip.width / 2 + 75, grip.y + 30, { steps: 8 }); await page.mouse.up();
  await page.waitForFunction(() => Math.abs(document.querySelector('table.sthCompact').getBoundingClientRect().width - document.getElementById('eBody').clientWidth) < 2);
  assert.strictEqual((await docking()).leftGap, 12);
  await rightGrip.locator('.tng.r').click();
  await page.waitForFunction(() => Math.abs(document.querySelector('table.sthCompact').getBoundingClientRect().width - document.getElementById('eBody').clientWidth) < 2);
  await rightGrip.locator('.tng.r').click();
  await page.waitForFunction(() => Math.abs(document.querySelector('table.sthCompact').getBoundingClientRect().width - document.getElementById('eBody').clientWidth) < 2);
  assert.strictEqual(await page.locator('.sthCompactRow:not(.sthCardActive)').first().locator('td.nm').evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)');
  assert.strictEqual(await page.locator('table.sthCompact').evaluate(el => getComputedStyle(el).zoom), '1');
  await page.mouse.move(30, 25); await page.waitForFunction(() => !document.querySelector('#toasts').children.length);
  await page.screenshot({ path: path.join(out, 'estimate-docked.png') });
  await page.setViewportSize({ width: 1100, height: 1000 });
  const controlsFit = await page.locator('.sthEstBar').evaluate(el => { const r = el.getBoundingClientRect(); return Array.from(el.children).filter(child => getComputedStyle(child).display !== 'none').every(child => { const b = child.getBoundingClientRect(); return b.left >= r.left - 1 && b.right <= r.right + 1 && b.bottom <= r.bottom + 1; }); });
  assert.ok(controlsFit, 'панель действий переносится по строкам, не накладываясь на соседние панели');
  await page.screenshot({ path: path.join(out, 'estimate-narrow.png') });
  await page.setViewportSize({ width: 1600, height: 1000 });
  await go('model');
  await checkGaps('model');
  const modelGrip = page.locator('#mLeft + .splitH'), mb = await modelGrip.boundingBox();
  await page.mouse.move(mb.x + mb.width / 2, mb.y + 30); await page.mouse.down(); await page.mouse.move(mb.x + mb.width / 2 + 55, mb.y + 30, { steps: 6 }); await page.mouse.up(); await checkGaps('model');
  await modelGrip.locator('.tng').click(); assert.strictEqual(await page.locator('#mLeft').isVisible(), false);
  await modelGrip.locator('.tng').click(); await checkGaps('model');
  await modelGrip.dblclick({ position: { x: 6, y: 30 } }); await checkGaps('model');
  assert.ok(await page.locator('#mBar .pill button').first().evaluate(el => parseFloat(getComputedStyle(el).borderRadius) >= 20));
  assert.ok(await page.locator('#mBar .pill button.on').first().evaluate(el => getComputedStyle(el).backgroundImage.includes('linear-gradient')));
  await page.screenshot({ path: path.join(out, 'model-buttons.png') });
  const modelEdge = await page.locator('#mLeft').boundingBox();
  await page.screenshot({ path: path.join(out, 'model-gap-detail.png'), clip: { x: modelEdge.x + modelEdge.width - 90, y: modelEdge.y, width: 210, height: Math.min(750, modelEdge.height) } });
  // Эти служебные разделы скрыты в редакции STHGroup: проверяем общие стили их стыков.
  for (const section of ['drill', 'detail', 'asm']) assert.ok(await page.locator('#' + section + ' > .splitH').evaluateAll(list => list.length > 0 && list.every(el => getComputedStyle(el).width === '12px' && getComputedStyle(el).marginLeft === '0px')));
  await go('cut'); if (await page.locator('#cutSimpleMore').isVisible()) await page.locator('#cutSimpleMore').click();
  await page.locator('#mapWrap').waitFor(); await checkGaps('main'); await page.screenshot({ path: path.join(out, 'cut-gaps.png') });
  await go('clients');
  assert.strictEqual(await page.locator('#orders').evaluate(root => root.querySelector('.soC').getBoundingClientRect().left - root.querySelector('.soL').getBoundingClientRect().right), 12);
  await go('est');
  await checkGaps('est');
  const kitKey = await page.evaluate(() => {
   const candidates = Est.R.rows.filter(w => w.kind === 'fastener' && !w.own && !w.off && !w.info && w.val > 0).slice(0, 2), pl = Est.pl();
   if (candidates.length < 2) throw Error('Нет строк для проверки комплекта');
   candidates.forEach((w, i) => { pl.P[w.priceId] = i ? 250 : 950; App.S.prices.sup[w.skey] = { shop: 'Демонстрационный поставщик', url: 'https://example.com/item-' + i }; });
   Est.we().sthKits = [{ id: 'demo-kit', name: 'Комплект TIP-ON (демо)', members: candidates.map(w => ({ name: w.name0 || w.title, q: 1 })) }];
   Est.render(); const kit = Est.R.rows.find(w => w.sthKit); STHEst.setOpen(BM.sthEst.rowKey(kit), true); return BM.sthEst.rowKey(kit);
  });
  assert.strictEqual(await page.locator('.sthKitContents article').count(), 2); assert.strictEqual(await page.locator('.sthKitContents a').count(), 2);
  const total = await page.evaluate(() => Est.R.rows.reduce((sum, w) => sum + w.sum, 0)); assert.ok(total > 0);
  await page.screenshot({ path: path.join(out, 'kit-card.png') });
  await page.evaluate(() => { const member = Est.R.rows.find(w => w.sthKitId); STHEst.setOpen(BM.sthEst.rowKey(member), true); });
  assert.strictEqual(await page.locator('.sthKitContents article').count(), 2); assert.strictEqual(await page.evaluate(() => Est.R.rows.reduce((sum, w) => sum + w.sum, 0)), total);
  // Длинный текст должен увеличивать высоту строки, а не залезать на цену.
  await page.evaluate(() => { const w = Est.R.rows.find(w => w.sthKit); Est.pl().NAME[w.offKey] = 'Очень длинное название комплекта направляющих скрытого монтажа с креплениями и дополнительными элементами для проверки переноса текста'; Est.render(); });
  const name = page.locator('#est table.sthCompact thead th[data-ci="3"]'), price = page.locator('#est table.sthCompact thead th[data-ci="7"]');
  const box = await name.boundingBox(); const handle = page.locator('#est table.sthCompact thead th[data-ci="3"] .sthResize'); const hb = await handle.boundingBox();
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2); await page.mouse.down(); await page.mouse.move(hb.x + hb.width / 2 + 140, hb.y + hb.height / 2, { steps: 8 }); await page.mouse.up();
  assert.ok((await name.boundingBox()).width > box.width + 120);
  const pb = await price.boundingBox(), nb = await name.boundingBox();
  await page.mouse.move(pb.x + 20, pb.y + 12); await page.mouse.down(); await page.mouse.move(nb.x + 15, nb.y + 12, { steps: 10 }); await page.mouse.up();
  const orderNow = await page.evaluate(() => Array.from(document.querySelector('table.sthCompact').tHead.rows[0].cells).filter(c => getComputedStyle(c).display !== 'none').map(c => Number(c.dataset.ci)));
  assert.ok(orderNow.indexOf(7) < orderNow.indexOf(3));
  const dimensions = await page.evaluate(() => { const tr = Array.from(document.querySelectorAll('.sthCompactRow')).find(tr => tr.querySelector('.sthCardPick').innerText.startsWith('Очень длинное')); const cell = tr.querySelector('td.nm'), b = cell.getBoundingClientRect(); return { height: b.height, fits: cell.scrollWidth <= cell.clientWidth + 1 }; });
  assert.ok(dimensions.height > 45 && dimensions.fits);
  // Заголовок и данные после переноса имеют одинаковые границы.
  const aligned = await page.evaluate(() => { const t = document.querySelector('table.sthCompact'), tr = t.querySelector('.sthCompactRow'); return [3, 5, 7, 8].every(id => { const h = t.querySelector('th[data-ci="' + id + '"]').getBoundingClientRect(), c = tr.querySelector('td[data-ci="' + id + '"]').getBoundingClientRect(); return Math.abs(h.x - c.x) < 1 && Math.abs(h.width - c.width) < 1; }); });
  assert.ok(aligned); await page.screenshot({ path: path.join(out, 'estimate-columns.png') });
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) { const disk = JSON.parse(fs.readFileSync(path.join(data,'settings.json'),'utf8')); if (disk.sthCols && disk.sthCols.est && disk.sthCols.est.indexOf(7) < disk.sthCols.est.indexOf(3)) break; await new Promise(r => setTimeout(r, 50)); }
  assert.ok(JSON.parse(fs.readFileSync(path.join(data,'settings.json'),'utf8')).sthCols.est);
  await page.reload(); await ready();
  assert.strictEqual(await page.evaluate(() => App.S.set.sthOrdersDir), data);
  assert.deepStrictEqual(await page.evaluate(() => App.S.set.sthCols.est.filter(id => [0, 1, 3, 5, 7, 8].includes(id))), orderNow);
  await go('stock'); await page.locator('.scList').waitFor();
  await page.locator('.scMore summary').click(); await page.locator('#scClearHistory').click(); await page.getByRole('button', { name: 'Очистить историю', exact: true }).click();
  await page.waitForFunction(() => BM.stock.history(BM.mb.cur).length === 0); await page.evaluate(() => STHStock.pending);
  assert.strictEqual(await page.evaluate(() => BM.mb.balance(BM.mb.cur, Object.keys(BM.mb.cur.mats)[0])), 12);
  // Отмена и отказ резервного копирования не удаляют склад.
  await page.locator('.scMore summary').click(); await page.locator('#scClearAll').click(); await page.getByRole('button', { name: 'Отмена', exact: true }).click();
  assert.strictEqual(await page.evaluate(() => BM.mb.cur.stock.docs.length), 1);
  allowBackup = false; await page.locator('#scClearAll').click(); await page.getByRole('button', { name: 'Удалить данные склада', exact: true }).click();
  await page.evaluate(() => STHStock.pending); assert.strictEqual(await page.evaluate(() => BM.mb.cur.stock.docs.length), 1);
  allowBackup = true; await page.locator('#scClearAll').click(); await page.getByRole('button', { name: 'Удалить данные склада', exact: true }).click();
  await page.waitForFunction(() => BM.mb.cur.stock.docs.length === 0); await page.evaluate(() => STHStock.pending);
  assert.strictEqual(Object.keys(JSON.parse(fs.readFileSync(baseFile, 'utf8')).mats).length, 1); assert.strictEqual(JSON.parse(fs.readFileSync(path.join(data, O.FILE), 'utf8')).orders.length, 1);
  assert.ok(fs.existsSync(baseFile + '.bak'));
  for (const width of [1600, 1100, 900]) { await page.setViewportSize({ width, height: 900 }); assert.ok(await page.locator('#rail').evaluate(el => el.scrollWidth <= el.clientWidth)); }
  await page.setViewportSize({ width: 1600, height: 1000 }); await go('mbase');
  const baseFrame = page.frameLocator('#mbase iframe'); await baseFrame.locator('#mbMain').waitFor();
  const baseGap = () => baseFrame.locator('#mbMain').evaluate(() => document.getElementById('mbRight').getBoundingClientRect().left - document.getElementById('mbLeft').getBoundingClientRect().right);
  assert.strictEqual(await baseGap(), 12);
  await baseFrame.locator('#mbLeft').evaluate(el => { el.style.width = '330px'; }); assert.strictEqual(await baseGap(), 12);
  assert.strictEqual(await baseFrame.locator('#mbScroll').evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)');
  await page.waitForFunction(() => !document.querySelector('#toasts').children.length);
  await page.screenshot({ path: path.join(out, 'base-gaps.png') });
  // Оформление экспортёра проверяется в браузере с заменой файлового интерфейса HTA; настоящий БАЗИС отдельно.
  const source = fs.readFileSync(path.join(__dirname, '../bazis/STHGroup_Export.js'), 'utf8');
  const hta = vm.runInNewContext(source.match(/var BM_WIN_HTA = (\[[\s\S]*?\])\.join\('\\n'\);/)[1]).join('\n');
  const logo = vm.runInNewContext(source.match(/var BM_LOGO_SVG = (.+);/)[1]);
  const exportPage = await browser.newPage({ viewport: { width: 840, height: 760 } });
  exportPage.on('pageerror', e => errors.push(e.message));
  await exportPage.addInitScript(() => {
   window.demoState = { title: 'Кухня · демонстрационная модель', sum: { parts: 58, mats: 9, furn: 42 }, form: { customer: 'Иванов', orderNo: '142', title: 'Кухня', note: '' }, steps: [{ t: 'Детали и материалы', st: 'ok' }, { t: 'Фурнитура и блоки', st: 'now' }, { t: '3D и текстуры' }, { t: 'Запись проекта' }] };
   window.demoFiles = {}; window.ActiveXObject = function () { return { OpenTextFile: () => ({ ReadAll: () => JSON.stringify(window.demoState), Close() {} }), CreateTextFile: name => ({ Write: value => { window.demoFiles[name] = value; }, Close() {} }), Run() {} }; };
   window.resizeTo = window.moveTo = window.close = function () {};
  });
  const htmlFile = path.join(out, 'export-preview.html'); fs.writeFileSync(htmlFile, hta.replace('%LOGO%', logo).replace('%DIR%', 'DEMO'));
  await exportPage.goto('file:///' + htmlFile.replace(/\\/g, '/')); await exportPage.locator('#fCust').waitFor();
  await exportPage.waitForFunction(() => document.getElementById('fCust').value === 'Иванов'); await exportPage.screenshot({ path: path.join(out, 'export-glass.png') });
  await exportPage.locator('#fCust').fill('Демонстрационный заказчик'); await exportPage.locator('#bSave').click();
  assert.strictEqual(await exportPage.evaluate(() => JSON.parse(Object.entries(demoFiles).find(([key]) => key.endsWith('answer.txt'))[1]).choice), 'save');
  assert.strictEqual(await exportPage.locator('#bOpen').isDisabled(), true);
  assert.deepStrictEqual(errors, []);
  console.log('ошибок нет: стабильная панель заказов, состав комплекта, перенос/ширина/сохранение столбцов, перенос текста, безопасная очистка склада, навигация и окно экспортёра');
  console.log('Снимки: ' + out);
 } catch (e) { if (page) { await page.screenshot({ path: path.join(out, 'failure.png') }); console.log(await page.evaluate(() => ({ section: App.S.section, text: document.body.innerText.slice(-2000) }))); } throw e; }
 finally { if (browser) await browser.close(); srv.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
