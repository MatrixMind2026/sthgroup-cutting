const fs = require('fs'), path = require('path'), assert = require('node:assert/strict');
const { chromium } = require(process.env.STH_PLAYWRIGHT || 'playwright');
const root = path.resolve(__dirname, '..'), repo = root;
const out = process.argv[2] ? path.resolve(process.argv[2]) : path.join(root, 'test/out/production-ui'); fs.mkdirSync(out, { recursive: true });
const dataDir = fs.mkdtempSync(path.join(out, 'data-'));
let browser, srv, page, dialogPath = '', pdfs = 0;
const errors = [];
(async () => {
 browser = await chromium.launch({ channel: 'msedge', headless: true });
 srv = await require(path.join(repo, 'server')).start({ webDir: path.join(repo, 'web'), dataDir, version: require(path.join(repo, 'package.json')).version, hooks: {
  dialog: async () => dialogPath,
  pdf: async (html, file) => { const p = await browser.newPage(); await p.setContent(html); await p.pdf({ path: file, printBackground: true, preferCSSPageSize: true }); await p.close(); pdfs++; }
 } });
 const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
 page = await ctx.newPage(); page.setDefaultTimeout(12000); page.on('pageerror', e => { errors.push(e.message); console.log('PAGEERROR', e.message); });
 const model = JSON.parse(fs.readFileSync(path.join(repo, 'test/out/est.bmk'), 'utf8'));
 model.model.parts = model.model.parts.slice(0, 4); model.model.parts.forEach(p => { p.butts = []; p.cuts = []; });
 ['holes','fast','kits','prof','lin','solids','est','blocks'].forEach(k => model.model[k] = []);
 model.model.title = 'Проверка производства'; model.model.customer = ''; model.model.orderNo = ''; model.model.mesh = ''; model.model.uv = ''; delete model.work; delete model.modelPrev;
 const file = path.join(dataDir, 'Тест.bmk'); fs.writeFileSync(file, JSON.stringify(model));
 const next = JSON.parse(JSON.stringify(model)); next.model.parts[0].mat = 'ЛДСП Другой декор';
 const nextFile = path.join(dataDir, 'incoming', 'Тест.bmk'); fs.mkdirSync(path.dirname(nextFile));
 require(path.join(repo, 'server')).zipWrite(nextFile, [{ name: 'project.json', data: Buffer.from(JSON.stringify(next)) }, { name: 'attachment.bin', data: Buffer.from('preserved-model-payload') }]);
 await page.goto(srv.url + '&splash=0'); await page.evaluate(() => { window.UI.forceBuiltinDialogs = false; }); // здесь подменено системное окно сохранения PDF
 await page.waitForFunction(() => window.App && App.S.boot && window.STHO && BM.sthProduction);
 const orderId = await page.evaluate(async ({ file, dataDir }) => {
  const U = UI, O = BM.sth, P = BM.project, F = BM.sthProduction, MB = BM.mb, K = BM.stock, X = STHO;
  const doc = JSON.parse(await U.api.readText(file)), st = P.build(doc, App.S.set);
  st.mats.forEach(m => { if (m.cfg.on) P.nest(st, m.key, { quality: 0 }); });
  await U.api.write(file, JSON.stringify(st.doc));
  const base = K.fix(MB.fix(null)), g = MB.addGroup(base, '', 'Плиты', 'sheet');
  st.mats.forEach(m => { const mat = MB.saveMat(base, { name: m.name, art: '', group: g.id, unit: 'лист', maxL: 2750, maxW: 1830, th: m.th, price: 4500 }).mat; K.move(base, 'in', mat.id, 5, { price: 4500 }); });
  const basePath = U.join(dataDir, 'test-base.json'); await U.api.write(basePath, JSON.stringify(base));
  await U.api.write(U.join(dataDir, 'matbase.json'), JSON.stringify({ file: basePath }));
  BM.mb.cur = base; MatBase.path = basePath; MatBase.mtime = (await U.api.stat(basePath)).mtime;
  X.book = O.empty(); X.path = U.join(dataDir, O.FILE); const o = O.addOrder(X.book, {});
  const R = MatBase.build(st, Est.cfg(), BM.est.listFor(App.S.prices, st), st.work.est, App.S.prices ? App.S.prices.sup : {});
  O.putItem(o, file, O.snapshot(st, R, X.book.cat, 'Тестовое изделие', file));
  X.cur = o.id; X.sgFocusOrder = true; X.view = 'list'; X.tab = 'production'; App.S.section = 'today';
  document.querySelectorAll('#rail [data-s]').forEach(b => b.classList.toggle('on', b.dataset.s === 'orders'));
  await X.flush(); Drill.section('orders'); await X.render(); return o.id;
 }, { file, dataDir });
 async function tab(name) { await page.locator('#orders [data-tb="' + name + '"]').click(); await page.waitForFunction(t => document.querySelector('#orders .soC')?.dataset.sgTab === t, name); }
 async function click(action) { await page.locator('#orders [data-sp="' + action + '"]').first().click(); }
 async function ready() { await page.waitForFunction(() => !document.querySelector('#orders [data-sp]:disabled')); await page.evaluate(() => document.getElementById('toasts').replaceChildren()); }
 async function formFits() {
  await page.locator('.back:not(.out)').evaluate(el => Promise.all(el.getAnimations({ subtree: true }).filter(a => a.effect.getTiming().iterations !== Infinity).map(a => a.finished.catch(() => {}))));
  const bounds = await page.locator('.modal .spForm').evaluate(form => {
   const box = form.getBoundingClientRect(); return { display: getComputedStyle(form).display, fits: [...form.querySelectorAll('input,select,textarea')].every(el => { const r = el.getBoundingClientRect(); return r.left >= box.left - 1 && r.right <= box.right + 1; }) };
  }); assert.equal(bounds.display, 'grid'); assert.equal(bounds.fits, true);
 }
 async function opStatus(status) { await page.waitForFunction(status => BM.sthProduction.fix(BM.sth.order(STHO.book, STHO.cur)).operations[0].status === status, status); }
 console.log('Setup ready'); await page.screenshot({ path: path.join(out, 'debug-setup.png') });
 await page.locator('#orders [data-spop="cut"]').click();
 await page.locator('#spWho').fill('Мастер тест'); await page.locator('#spDue').fill('2026-11-12'); await page.locator('#spOpNote').fill('Проверить маркировку');
 await click('operation-start'); await opStatus('work'); await click('operation-done'); await opStatus('done');
 await ready(); await page.screenshot({ path: path.join(out, '03-production.png') });
 console.log('Operations ready'); await tab('fact'); await click('freeze-plan'); await page.waitForFunction(() => BM.sthProduction.fix(BM.sth.order(STHO.book, STHO.cur)).plan);
 await click('actual'); await formFits(); await page.locator('#spCostAmount').fill('2000'); await page.locator('#spCostNote').fill('Дополнительный лист'); await page.screenshot({ path: path.join(out, 'modal-actual.png') }); await page.getByRole('button', { name: 'Добавить', exact: true }).click();
 await page.waitForFunction(() => BM.sthProduction.fix(BM.sth.order(STHO.book, STHO.cur)).actuals.length === 1);
 await ready(); await page.screenshot({ path: path.join(out, '04-plan-fact.png') });
 console.log('Facts ready'); await tab('supply'); await page.waitForSelector('#orders [data-spmat]');
 const warnings = await page.locator('#orders .note.warn').allTextContents(); if (warnings.length) throw new Error('Обеспечение: ' + warnings.join(';'));
 await click('reserve'); await page.waitForFunction(() => BM.mb.cur.stock.res.length > 0);
 await click('receive'); await formFits(); await page.locator('#spQty').fill('2'); await page.locator('#spPrice').fill('4600'); await page.screenshot({ path: path.join(out, 'modal-receipt.png') }); await page.getByRole('button', { name: 'Принять', exact: true }).click();
 await page.waitForFunction(() => BM.mb.cur.stock.docs.some(d => d.order === STHO.cur && d.kind === 'in'));
 await ready(); await page.screenshot({ path: path.join(out, '01-supply.png') });
 console.log('Supply ready'); await tab('job'); await page.locator('#spJobWho').fill('Мастер цеха'); await page.locator('#spJobDue').fill('2026-11-14'); await page.locator('#spJobNote').fill('Сохранить направление текстуры'); await click('job-create');
 await page.waitForFunction(() => BM.sthProduction.fix(BM.sth.order(STHO.book, STHO.cur)).jobs.length === 1);
 console.log('Job ready'); await ready(); await page.screenshot({ path: path.join(out, '02-job.png') });
 dialogPath = path.join(out, 'Задание в цех.pdf'); await click('job-pdf'); await page.waitForFunction(() => [...document.querySelectorAll('#toasts *')].some(n => n.textContent.includes('Документ сохранён'))).catch(() => {});
 assert.equal(pdfs, 1); assert.ok(fs.statSync(dialogPath).size > 1000);
 await tab('changes'); dialogPath = nextFile; await click('compare'); await page.waitForSelector('[data-spchange]');
 await ready(); await page.screenshot({ path: path.join(out, '05-changes.png') });
 const previousBytes = fs.readFileSync(file); await click('apply-version');
 await page.waitForFunction(async () => { const b = JSON.parse(await UI.api.readText(STHO.path)); return b.orders[0].production.versions.length === 1 && App.S.st && App.S.path === b.orders[0].items[0].path; });
 await page.waitForFunction(() => !document.querySelector('[data-sp="apply-version"]'));
 assert.deepEqual(fs.readFileSync(file), previousBytes);
 const persisted = JSON.parse(fs.readFileSync(path.join(dataDir, 'STHGroup — заказы.json'), 'utf8'));
 console.log('Persisted', persisted.orders.map(o => ({ id: o.id, op: o.production?.operations[0].status, facts: o.production?.actuals.length, jobs: o.production?.jobs.length, versions: o.production?.versions.length })), await page.evaluate(() => ({ path: STHO.path, versions: STHO.book.orders.map(o => o.production?.versions.length) })));
 assert.equal(persisted.orders[0].production.operations[0].status, 'done'); assert.equal(persisted.orders[0].production.actuals.length, 1); assert.equal(persisted.orders[0].production.jobs.length, 1); assert.equal(persisted.orders[0].production.versions.length, 1);
 assert.notEqual(persisted.orders[0].items[0].path, file); assert.ok(fs.existsSync(persisted.orders[0].items[0].path));
 const acceptedPath = persisted.orders[0].items[0].path, accepted = require(path.join(repo, 'server'));
 assert.ok(Object.keys(JSON.parse(accepted.packRead(acceptedPath, 'project.json')).work.layout).length > 0);
 assert.equal(accepted.packRead(acceptedPath, 'attachment.bin').toString(), 'preserved-model-payload');
 await page.getByRole('button', { name: 'Не сейчас', exact: true }).click().catch(() => {});
 // Настоящий обновляющий метод прогресса, анимация движения, очередь и скрытие.
 await page.evaluate(() => {
  STHO.go('cut'); document.getElementById('cutSimpleMore')?.click(); const A = App, S = A.S, m = A.mat(); if (!m) throw new Error('Нет материала для проверки анимации');
  const j = { key: m.key, progress: .42 }; S.jobs = { [m.key]: j }; S.running = j; MapView.busy();
 });
 assert.equal(await page.locator('#busy').isVisible(), true); assert.equal(await page.locator('#busyPc').textContent(), '42 %'); assert.equal(await page.locator('#busy .bb').getAttribute('aria-valuenow'), '42'); assert.equal(await page.locator('#busy .frame').count(), 0);
 await page.evaluate(() => document.getElementById('toasts').replaceChildren()); await page.screenshot({ path: path.join(out, '06-cutting-animation.png') });
 const a = await page.locator('#busy .sthCutPiece1').evaluate(e => getComputedStyle(e).transform); await page.waitForTimeout(1000); const b = await page.locator('#busy .sthCutPiece1').evaluate(e => getComputedStyle(e).transform); assert.notEqual(a, b);
 await page.emulateMedia({ reducedMotion: 'reduce' }); assert.equal(await page.locator('#busy .sthCutPiece1').evaluate(e => getComputedStyle(e).animationName), 'none'); await page.emulateMedia({ reducedMotion: 'no-preference' });
 await page.evaluate(() => { App.S.running = null; MapView.busy(); }); assert.equal(await page.locator('#busy .sthCutPiece1').evaluate(e => getComputedStyle(e).animationPlayState), 'paused');
 await page.evaluate(() => { App.S.jobs = {}; MapView.busy(); }); assert.equal(await page.locator('#busy').isVisible(), false);
 await page.evaluate(async id => { STHO.go('orders'); STHO.cur = id; STHO.sgFocusOrder = true; STHO.tab = 'production'; await STHO.render(); }, orderId);
 for (const width of [1366, 1024]) { await page.setViewportSize({ width, height: 900 }); await page.screenshot({ path: path.join(out, 'production-' + width + '.png') }); const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1); assert.equal(overflow, false); }
 await page.reload(); await page.waitForFunction(() => App.S.boot && window.STHO);
 const reopened = await page.evaluate(async id => { await STHO.load(true); const o = BM.sth.order(STHO.book, id); return { status: o.production.operations[0].status, facts: o.production.actuals.length, jobs: o.production.jobs.length, versions: o.production.versions.length }; }, orderId);
 assert.deepEqual(reopened, { status: 'done', facts: 1, jobs: 1, versions: 1 });
 assert.deepEqual(errors, []);
 fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ ok: true, dataDir, pdfs, errors, checked: ['operations', 'plan-fact', 'reserve', 'receipt', 'job', 'job-pdf', 'compare', 'apply-keeps-old-model', 'persisted-order', 'animation-real-progress', 'reduced-motion', 'queue', 'hide', '1366', '1024'] }, null, 2));
 console.log('UI production and animation: OK; PDF:', pdfs, '; console errors:', errors.length);
})().catch(async e => { console.error(e); if (page) { await page.screenshot({ path: path.join(out, 'debug-error.png') }).catch(() => {}); console.log((await page.locator('#toasts, #modals').allTextContents()).join('\n')); } process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); if (srv) srv.close(); });
