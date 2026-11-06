/* STHGroup: согласованные исправления интерфейса — настоящие DOM, действия и снимки.
   STH_PLAYWRIGHT=<путь к playwright> node test/t_visual_repairs.js [папка снимков] */
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.STH_PLAYWRIGHT||'playwright');
const repo=path.resolve(__dirname,'..'),out=path.resolve(process.argv[2]||path.join(__dirname,'out/visual-repairs'));
fs.mkdirSync(out,{recursive:true});const data=fs.mkdtempSync(path.join(out,'demo-'));
for(const f of ['geom','cut','project','dbf','matbase','sth_stock','sth_order'])require('../web/core/'+f+'.js');
const MB=BM.mb,P=BM.project,b=BM.stock.fix(MB.empty());
const doc=JSON.parse(fs.readFileSync(path.join(__dirname,'out/est.bmk'),'utf8'));doc.model.title='Проверка оформления';doc.model.customer='Демонстрационный клиент';
const st=P.build(doc,BM.defaults());st.mats.forEach(m=>{if(m.cfg.on)P.nest(st,m.key,{quality:0})});
const file=path.join(data,'Демо.bmk');fs.writeFileSync(file,JSON.stringify(doc));
const sheet=MB.addGroup(b,'','01. Листовые материалы','sheet'),edge=MB.addGroup(b,'','02. Кромка','edge'),fit=MB.addGroup(b,'','03. Фурнитура','fit');
b.suppliers.push({id:'demo',name:'Демонстрационный поставщик'});
const seen=new Set();function add(name,group,unit,th=0){if(!name||seen.has(name))return;seen.add(name);MB.saveMat(b,Object.assign(MB.defMat(group),{name,group,unit,th,maxL:2750,maxW:1830,price:unit==='лист'?4000:45,sup:'demo',url:'https://example.com/material',art:'DEMO-'+seen.size}));}
st.mats.forEach(m=>add(m.name,sheet.id,'лист',m.th));st.types.forEach(t=>(t.shape.edges||[]).forEach(e=>add(e.mat,edge.id,'м')));
(doc.model.fast||[]).concat(doc.model.kits||[],doc.model.prof||[],doc.model.lin||[]).forEach(m=>add(m.name,fit.id,'шт'));
const base=path.join(data,'Демо база.json');fs.writeFileSync(base,JSON.stringify(b));fs.writeFileSync(path.join(data,'matbase.json'),JSON.stringify({file:base}));fs.writeFileSync(path.join(data,'settings.json'),JSON.stringify({theme:'sth',anim:0,sthOrdersDir:data}));
let browser,srv,page;const errors=[];let crm=new (require('../sth_crm').Client)({dataDir:data,fetch:async()=>{throw new Error('Не должно быть сетевого входа CRM')}});
(async()=>{
 srv=await require('../server').start({webDir:path.join(repo,'web'),dataDir:data,version:require('../package.json').version,extraRoutes:()=>Object.assign({},crm.routes(),require('../sth_backup')())});
 browser=await chromium.launch({channel:'msedge',headless:true});page=await browser.newPage({viewport:{width:1700,height:1100},reducedMotion:'reduce'});page.on('pageerror',e=>errors.push(e.message));

 const ready=()=>page.waitForFunction(()=>window.App?.S.boot&&!!document.getElementById('cTex').onchange);
 const close=async()=>{for(let i=0;i<5&&await page.locator('#modals .modal').count();i++)await page.locator('#modals .modal').last().locator('h2 button').click()};
 const go=async s=>{await page.evaluate(()=>document.getElementById('toasts').replaceChildren());await page.locator('#rail [data-s="'+s+'"]').click();await page.waitForFunction(s=>App.S.section===s,s)};
 await page.goto(srv.url+'&splash=0');await ready();const opening=page.evaluate(f=>App.openPath(f),file);await page.getByRole('button',{name:'Всю модель',exact:true}).click({timeout:2500}).catch(()=>{});await opening;await close();await go('est');
 // Итоги следуют за суммой после нескольких переносов, совпадая с её границами.
 for(let i=0;i<3;i++){await page.locator('th[data-ci="8"]').focus();await page.keyboard.press('Alt+ArrowLeft');
  assert.ok(await page.evaluate(()=>{const th=document.querySelector('th[data-ci="8"]').getBoundingClientRect();return [...document.querySelectorAll('.sthSectionSum')].filter(c=>!c.closest('tr').hidden).every(c=>{const r=c.getBoundingClientRect();return Math.abs(r.left-th.left)<1&&Math.abs(r.width-th.width)<1;});}));}
 await page.screenshot({path:path.join(out,'estimate-sums.png')});
 const alignment=await page.evaluate(()=>{function center(el){const r=document.createRange();r.selectNodeContents(el);const b=r.getBoundingClientRect();return b.top+b.height/2}const title=center(document.getElementById('eTitle'));return [...document.querySelectorAll('#eChips>.chip')].map(el=>Math.abs(center(el)-title));});assert.ok(alignment.every(d=>d<3),JSON.stringify(alignment));
 // Сопоставление в «Нет в базе» не меняет число материалов.
 const before=await page.evaluate(()=>Object.keys(BM.mb.cur.mats).length);await page.evaluate(()=>{STH.missing(true)});await page.locator('.sthMiss').waitFor();
 const row=page.locator('.sthMiss tbody tr').first();await row.locator('.smMode').selectOption('new');assert.equal(await row.locator('.gr').inputValue(),'__choose');await row.locator('.smMode').selectOption('link');await page.locator('.sthMiss #smAll').uncheck();await row.locator('.mk').check();
 const option=await page.locator('#smExistingList option').first().getAttribute('value');await row.locator('.smExisting').fill(option);await page.screenshot({path:path.join(out,'missing-match.png')});await page.locator('.sthMiss').getByRole('button',{name:'Применить',exact:true}).click();await page.locator('.sthMiss').waitFor({state:'hidden'});
 await page.waitForFunction(()=>Object.keys(BM.mb.cur.links||{}).length>0);assert.equal(await page.evaluate(()=>Object.keys(BM.mb.cur.mats).length),before);

 // Настоящий разделённый комплект: родитель справочный, расчётные части остаются проблемными.
 const kit=await page.evaluate(()=>{const w=Est.R.rows.find(w=>w.kind==='fastener'&&!w.off&&!w.info);const name=String(w.name0||w.skey||w.title).toLowerCase().replace(/ё/g,'е').replace(/\s+/g,' ').trim();(Est.we().sthSplit=Est.we().sthSplit||{})[name]={parts:[{name:'Часть проверки А',q:1},{name:'Часть проверки Б',q:1}]};Est.render();const parent=Est.R.rows.find(w=>w.sthSplit),parts=Est.R.rows.filter(w=>w.sthPart);return {parent:BM.sthEst.noPrice(parent),parts:parts.map(w=>BM.sthEst.noPrice(w)),count:BM.sthEst.counts(Est.R.rows).noPrice,badge:[...document.querySelectorAll('#eChips .chip')].find(c=>c.textContent.includes('без цены:'))?.textContent};});
 assert.equal(kit.parent,false);assert.ok(kit.parts.every(Boolean));assert.equal(Number(kit.badge.match(/\d+/)[0]),kit.count);
 // Настройки сметы без мёртвого блока, сохранение остальных полей работает.
 await page.evaluate(()=>{Dlg.settings('eCalc')});await page.waitForTimeout(150);assert.equal(await page.locator('#eShowCuts').count(),0);await page.locator('.modal').getByRole('button',{name:'Сохранить',exact:true}).click();await page.locator('#eEdgeMode').waitFor({state:'hidden'});
 await go('orders');await page.evaluate(()=>{STHO.catalog()});await page.locator('.soCat #ctW').waitFor();assert.ok(await page.locator('#ctW .sthSampleBadge').count()>0);
 assert.ok(await page.locator('#ctW .cp,#ctW .sthPriceConfirm').evaluateAll(els=>els.every(el=>{const a=el.getBoundingClientRect(),b=el.closest('td').getBoundingClientRect();return a.left>=b.left&&a.right<=b.right+1;})));await page.evaluate(()=>document.getElementById('toasts').replaceChildren());await page.screenshot({path:path.join(out,'sample-prices.png')});const first=page.locator('#ctW tbody tr').first();const firstId=await first.getAttribute('data-id');await first.locator('.sthPriceConfirm').click();await page.locator('#ctW tbody tr').nth(1).locator('.cp').fill('7654');await page.locator('#ctW tbody tr').nth(2).locator('.cn').fill('Переименованная работа');await page.locator('.soCat').getByRole('button',{name:'Сохранить',exact:true}).click();
 await page.evaluate(()=>{STHO.catalog()});await page.locator('.soCat #ctW').waitFor();assert.equal(await page.locator('#ctW tr[data-id="'+firstId+'"] .sthSampleBadge').count(),0);assert.equal(await page.locator('#ctW tbody tr').nth(1).locator('.sthSampleBadge').count(),0);assert.equal(await page.locator('#ctW tbody tr').nth(2).locator('.sthSampleBadge').count(),1);await close();
 // Инвентаризация: фактический ноль, корректировка, сохранение резерва.
 const stock=await page.evaluate(async()=>{const m=Object.values(BM.mb.cur.mats)[0];BM.stock.move(BM.mb.cur,'in',m.id,12,{});BM.stock.reserve(BM.mb.cur,m.id,5,{id:'demo',no:'777'});await MatBase.saveBase();return {id:m.id,name:m.name};});
 await go('stock');await page.locator('.scMore summary').click();await page.locator('#skInventory').click();await page.locator('#skInvQ').fill(stock.name);await page.locator('.skInvActual[data-mat="'+stock.id+'"]').fill('0');await page.screenshot({path:path.join(out,'inventory.png')});await page.getByRole('button',{name:'Просмотреть корректировку',exact:true}).click();await page.getByRole('button',{name:'Записать корректировку',exact:true}).click();
 await page.waitForFunction(id=>BM.mb.balance(BM.mb.cur,id)===0,stock.id);assert.equal(await page.evaluate(id=>BM.stock.reserved(BM.mb.cur,id),stock.id),5);
 const csvDir=path.join(data,'csv');await page.evaluate(dir=>STHStock.exportCsv(dir,false),csvDir);assert.equal(fs.readdirSync(csvDir).filter(f=>f.endsWith('.csv')).length,2);
 // Периодический экспорт после наступления срока, повторный запуск без дублей.
 await page.evaluate(async dir=>{App.S.set.sthStockExport={days:7,dir,last:{}};await STHStock.maybeExport();await STHStock.maybeExport();},csvDir);assert.equal(fs.readdirSync(csvDir).filter(f=>f.endsWith('.csv')).length,4);
 
 await page.evaluate(()=>document.getElementById('toasts').replaceChildren());await page.locator('[data-skv="free"]').click();
 const color=await page.locator('#stock').evaluate(el=>getComputedStyle(el).color);assert.ok(!/rgb\(0, 0, 0\)/.test(color));
 await page.screenshot({path:path.join(out,'stock-contrast.png')});
 for(const width of [1366,1100]){await page.setViewportSize({width,height:1000});await go('est');await page.waitForTimeout(100);assert.ok(await page.locator('#eBody').evaluate(el=>el.scrollWidth<=el.clientWidth));await page.screenshot({path:path.join(out,'estimate-'+width+'.png')});await go('stock');await page.screenshot({path:path.join(out,'stock-'+width+'.png')});}
 await page.setViewportSize({width:1700,height:1100});


 // CRM: реальное локальное сохранение, перезапуск сервера и повторное чтение.
 await page.evaluate(()=>document.getElementById('toasts').replaceChildren());
 await page.evaluate(()=>{Dlg.settings('crm')});await page.locator('#crmAuto').waitFor();await page.locator('#crmAuto').uncheck();
 await page.locator('.modal').getByRole('button',{name:'Сохранить',exact:true}).click();await page.locator('#crmAuto').waitFor({state:'hidden'});
 assert.equal(crm.state.auto,false);crm=new (require('../sth_crm').Client)({dataDir:data});assert.equal(crm.state.auto,false);
 await page.reload();await ready();await page.evaluate(()=>{Dlg.settings('crm')});await page.locator('#crmAuto').waitFor();await page.waitForFunction(()=>STHCRM.state&&STHCRM.state.auto===false);assert.equal(await page.locator('#crmAuto').isChecked(),false);await page.evaluate(()=>STHStock.maybeExport());assert.equal(fs.readdirSync(csvDir).filter(f=>f.endsWith('.csv')).length,4);
 assert.equal(await page.locator('.modal .rsz-rb').evaluate(el=>getComputedStyle(el,'::after').content),'none');
 const crmAlign=await page.evaluate(()=>{const a=document.getElementById('crmAuto').getBoundingClientRect(),b=document.getElementById('crmUrl').getBoundingClientRect();return Math.abs(a.left-b.left)});assert.ok(crmAlign<2);
 await page.screenshot({path:path.join(out,'crm-fixed.png')});
 await page.locator('.modal').getByRole('button',{name:'Отмена',exact:true}).click();await page.evaluate(()=>{STHO.load(true)});await page.waitForFunction(()=>STHO.book&&STHO.book.cat.sheetWorks.some(w=>w.priceVerified));assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({ok:true,alignment},null,2));console.log('Шесть исправлений: UI — OK');
})().catch(async e=>{console.error(e);if(page)await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(srv)srv.close()});
