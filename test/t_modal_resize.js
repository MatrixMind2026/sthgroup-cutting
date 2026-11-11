/* STHGroup: окно-диалог тянется за край только в сторону мыши — противоположный край стоит на месте
   (раньше окно по центру растягивалось в обе стороны). */
const fs=require('fs'),path=require('path'),os=require('os'),assert=require('node:assert/strict');
const {chromium}=require(process.env.STH_PLAYWRIGHT||'playwright');
const repo=path.resolve(__dirname,'..'),data=fs.mkdtempSync(path.join(os.tmpdir(),'sth-rsz-'));
fs.writeFileSync(path.join(data,'settings.json'),JSON.stringify({anim:0}));
let srv,browser;
(async()=>{
 srv=await require('../server').start({webDir:path.join(repo,'web'),dataDir:data,version:require('../package.json').version});
 try{browser=await chromium.launch({channel:'msedge',headless:true})}catch(_){browser=await chromium.launch({headless:true})}
 const page=await browser.newPage({viewport:{width:1600,height:1000},reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(srv.url+'&splash=0');await page.waitForFunction(()=>window.UI&&UI.modal&&document.getElementById('modals'));
 await page.evaluate(()=>{try{localStorage.clear()}catch(e){}UI.modal({title:'Проверка размера',width:600,body:'<p>Текст</p>'})});
 const m=page.locator('#modals .modal').last();await m.waitFor();await page.waitForTimeout(250);
 const box=()=>m.evaluate(el=>{const r=el.getBoundingClientRect();return{l:r.left,r:r.right,t:r.top,b:r.bottom}});
 async function drag(sel,dx,dy){const h=await m.locator(sel).boundingBox();const x=h.x+h.width/2,y=h.y+h.height/2;await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+dx/2,y+dy/2);await page.mouse.move(x+dx,y+dy);await page.mouse.up();}
 let a=await box();await drag('.rsz-r',200,0);let b=await box();
 assert.ok(Math.abs(b.l-a.l)<1,'левый край на месте: '+a.l+' → '+b.l);assert.ok(Math.abs(b.r-a.r-200)<2,'правый край ушёл за мышью');
 a=b;await drag('.rsz-b',0,120);b=await box();
 assert.ok(Math.abs(b.t-a.t)<1,'верх на месте: '+a.t+' → '+b.t);assert.ok(Math.abs(b.b-a.b-120)<2,'низ ушёл за мышью');
 a=b;await drag('.rsz-rb',-150,-60);b=await box();
 assert.ok(Math.abs(b.l-a.l)<1&&Math.abs(b.t-a.t)<1,'угол: левый верх на месте');assert.ok(Math.abs(b.r-a.r+150)<2&&Math.abs(b.b-a.b+60)<2,'угол: правый низ за мышью');
 // после растягивания окно двигается за заголовок без скачка
 a=b;const hd=await m.locator('h2').boundingBox();await page.mouse.move(hd.x+60,hd.y+10);await page.mouse.down();await page.mouse.move(hd.x+80,hd.y+30);await page.mouse.move(hd.x+100,hd.y+50);await page.mouse.up();b=await box();
 assert.ok(Math.abs(b.l-a.l-40)<2&&Math.abs(b.t-a.t-40)<2,'перемещение без скачка: '+JSON.stringify([a,b]));
 a=b;await drag('.rsz-r',100,0);b=await box();assert.ok(Math.abs(b.l-a.l)<1,'после перемещения левый край тоже на месте');
 assert.deepEqual(errors,[]);console.log('Окно тянется за край в одну сторону: ошибок нет');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(srv&&srv.close)srv.close();fs.rmSync(data,{recursive:true,force:true})});
