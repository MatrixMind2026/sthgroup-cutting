/* Окна внутри программы (решение автора 11.11.2026): окно — страницей на месте рабочей области, короткий вопрос — полоской,
   «← Назад» и Esc закрывают, переход в другой раздел закрывает страницу, выбор файла — своим окном, не окном Windows.   node test/t_inapp_windows.js */
const fs=require('fs'),path=require('path'),os=require('os'),assert=require('node:assert/strict');
const {chromium}=require(process.env.STH_PLAYWRIGHT||'playwright');
const repo=path.resolve(__dirname,'..'),data=fs.mkdtempSync(path.join(os.tmpdir(),'sth-inapp-'));
fs.writeFileSync(path.join(data,'settings.json'),JSON.stringify({anim:0}));
let srv,browser,native=0;
(async()=>{
 srv=await require('../server').start({webDir:path.join(repo,'web'),dataDir:data,version:require('../package.json').version,hooks:{dialog:async()=>{native++;return null;}}});
 try{browser=await chromium.launch({channel:'msedge',headless:true})}catch(_){browser=await chromium.launch({headless:true})}
 const page=await browser.newPage({viewport:{width:1500,height:900},reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(srv.url+'&splash=0');await page.waitForFunction(()=>window.UI&&UI.modal&&document.getElementById('rail'));
 const rect=sel=>page.evaluate(s=>{const r=document.querySelector(s).getBoundingClientRect();return{l:r.left,r:r.right,t:r.top,b:r.bottom}},sel);
 // страница — стеклянная панель: зазор 10 px от полосы разделов и от правого края, от шапки до низа рабочей области
 await page.click('#bSettings');const pg=page.locator('#modals .back.page .modal');await pg.waitFor();
 const m=await rect('#modals .back.page .modal'),rail=await rect('#rail'),main=await rect('#main');
 assert.ok(Math.abs(m.l-rail.r-10)<2&&Math.abs(m.t-main.t)<2&&Math.abs(m.b-main.b)<2&&Math.abs(m.r-1490)<2,'страница занимает рабочую область: '+JSON.stringify(m));
 assert.equal(await pg.locator('h2 button').count(),1,'в шапке одна кнопка — «Назад»');
 await pg.locator('h2 .bk').click();await page.waitForFunction(()=>!document.querySelector('#modals .back:not(.out)'));
 // Esc закрывает страницу
 await page.click('#bSettings');await pg.waitFor();await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('#modals .back:not(.out)'));
 // короткий вопрос — полоской вверху рабочей области, ответ доходит
 await page.evaluate(()=>{window.__a=UI.confirm('Удалить?','Удалить материал из базы?','Удалить')});
 const bar=page.locator('#modals .back.bar .modal');await bar.waitFor();const b=await rect('#modals .back.bar .modal');
 assert.ok(Math.abs(b.t-main.t)<2&&b.b-b.t<120,'полоска вверху и невысокая: '+JSON.stringify(b));
 await bar.locator('button.primary').click();assert.equal(await page.evaluate(()=>window.__a),true);
 // переход в другой раздел закрывает открытую страницу
 await page.click('#bSettings');await pg.waitFor();await page.click('#rail [data-s="orders"]');await page.waitForFunction(()=>!document.querySelector('#modals .back:not(.out)'));
 // выбор файла — своим окном внутри программы, системное окно не зовётся
 await page.evaluate(()=>{window.__p=UI.pick({kind:'open',title:'Открыть проект'})});await page.locator('#modals .back.page .modal.fb').waitFor();
 assert.equal(native,0,'системное окно выбора файла не открывалось');await page.keyboard.press('Escape');
 assert.ok(!(await page.evaluate(()=>window.__p)),'отмена выбора — пусто');
 assert.deepEqual(errors,[]);console.log('Окна внутри программы: страница, полоска, «Назад», Esc, переход в раздел, выбор файла — ошибок нет');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(srv&&srv.close)srv.close();fs.rmSync(data,{recursive:true,force:true})});
