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
let browser,srv,page;const errors=[],measurements={};
(async()=>{
 srv=await require('../server').start({webDir:path.join(repo,'web'),dataDir:data,version:require('../package.json').version});
 browser=await chromium.launch({channel:'msedge',headless:true});page=await browser.newPage({viewport:{width:1920,height:1100},reducedMotion:'reduce'});page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
 const ready=()=>page.waitForFunction(()=>window.App?.S.boot&&!!document.getElementById('cTex').onchange);
 const go=async s=>{await page.locator('#rail [data-s="'+s+'"]').click();await page.waitForFunction(s=>App.S.section===s,s);await page.evaluate(()=>document.getElementById('toasts').replaceChildren())};
 const snap=n=>page.screenshot({path:path.join(out,n+'.png')});
 async function geometry(requireFit=true){
  const m=await page.locator('#eBody').evaluate(root=>{
   const t=root.querySelector('table.sthCompact'),rows=[...t.querySelectorAll('tr.sthCompactRow')].filter(r=>!r.hidden),tr=rows[0];
   const cells=[...tr.cells].filter(c=>getComputedStyle(c).display!=='none'),last=cells.at(-1),first=cells[0],box=root.getBoundingClientRect();
   return {panel:root.clientWidth,table:t.getBoundingClientRect().width,end:last.getBoundingClientRect().right-box.left+root.scrollLeft,
    scrollWidth:root.scrollWidth,scrollLeft:root.scrollLeft,
    gap:rows[1].getBoundingClientRect().top-tr.getBoundingClientRect().bottom,
    roundLeft:parseFloat(getComputedStyle(first).borderTopLeftRadius),roundRight:parseFloat(getComputedStyle(last).borderTopRightRadius),
    aligned:cells.every(c=>{const h=t.querySelector('th[data-ci="'+c.dataset.ci+'"]'),a=c.getBoundingClientRect(),b=h.getBoundingClientRect();return Math.abs(a.left-b.left)<1&&Math.abs(a.width-b.width)<1}),
    pickBackground:getComputedStyle(tr.querySelector('.sthCardPick')).backgroundColor,
    pickBorder:parseFloat(getComputedStyle(tr.querySelector('.sthCardPick')).borderTopWidth)};
  });
  assert.ok(m.gap>=7,'каждая строка отделена зазором');assert.ok(m.roundLeft>=12&&m.roundRight>=12,'закруглены оба конца видимой строки');assert.equal(m.aligned,true,'границы данных совпадают с заголовками');
  assert.equal(m.pickBackground,'rgba(0, 0, 0, 0)');assert.equal(m.pickBorder,0);
  assert.ok(m.scrollWidth<=m.panel,'нет горизонтального переполнения: '+JSON.stringify(m));assert.equal(m.scrollLeft,0);
  if(requireFit){assert.ok(Math.abs(m.table-m.panel)<2,'таблица заполняет панель');assert.ok(Math.abs(m.end-m.panel)<2,'крайняя ячейка доходит до края панели, пустоты нет');}
  return m;
 }
 await page.goto(srv.url+'&splash=0');await ready();
 const opening=page.evaluate(f=>App.openPath(f),file);await page.getByRole('button',{name:'Всю модель',exact:true}).click({timeout:2500}).catch(()=>{});await opening;
 for(let i=0;i<5&&await page.locator('#modals .modal').count();i++)await page.locator('#modals .modal').last().locator('h2 button').click();
 await go('est');await page.locator('.sthCompactRow').first().waitFor();await page.mouse.move(5,5);
 measurements.initial=await geometry();await snap('estimate-wide');
 const chips=await page.locator('#eChips>.chip').evaluateAll(els=>els.map(el=>{const b=el.getBoundingClientRect(),r=document.createRange();r.selectNodeContents(el);const t=r.getBoundingClientRect();return {dx:Math.abs(t.left+t.width/2-b.left-b.width/2),dy:Math.abs(t.top+t.height/2-b.top-b.height/2)};}));
 assert.ok(chips.length);chips.forEach(c=>assert.ok(c.dx<2.5&&c.dy<2.5,JSON.stringify(c)));measurements.chips=chips;

 // Пользовательский сценарий из видео: сужение названия, изменение ширины панели и перенос столбцов.
 for(let i=0;i<24;i++)await page.locator('th[data-ci="3"] .sthResize').press('ArrowLeft');
 await page.evaluate(()=>document.activeElement?.blur());measurements.shrunkColumn=await geometry();await snap('estimate-column-shrunk');
 for(const [key,dx]of[['widerInspector',-140],['narrowerInspector',110]]){
  const grip=page.locator('#eRight').locator('xpath=preceding-sibling::*[1]'),r=await grip.boundingBox();
  await page.mouse.move(r.x+r.width/2,r.y+30);await page.mouse.down();await page.mouse.move(r.x+r.width/2+dx,r.y+30,{steps:12});await page.mouse.up();
  await page.waitForFunction(()=>Math.abs(document.querySelector('#eBody table.sthCompact').getBoundingClientRect().width-document.getElementById('eBody').clientWidth)<2);
  measurements[key]=await geometry();
 }
 await page.locator('th[data-ci="8"]').focus();await page.keyboard.press('Alt+ArrowLeft');measurements.reordered=await geometry();await snap('estimate-reordered');
 const scrollbar=await page.locator('#eBody').evaluate(el=>({corner:getComputedStyle(el,'::-webkit-scrollbar-corner').backgroundColor,buttons:getComputedStyle(el,'::-webkit-scrollbar-button').display}));
 assert.equal(scrollbar.corner,'rgba(0, 0, 0, 0)');assert.equal(scrollbar.buttons,'none');measurements.scrollbar=scrollbar;
 await page.locator('#eBody .sthCardPick').first().click();if(!await page.locator('#eCard .supE').count())await page.locator('#eBody .sthCardPick').first().click();
 const supplier=page.locator('#eCard .supE'),supplierBounds=await supplier.evaluate(el=>{const a=el.getBoundingClientRect(),b=el.parentElement.getBoundingClientRect();return {height:a.height,width:a.width,parent:b.width,text:el.textContent}});
 assert.ok(supplierBounds.height>=44);assert.ok(Math.abs(supplierBounds.width-supplierBounds.parent)<2);assert.ok(supplierBounds.text.includes('Поставщик, ссылка и фото'));measurements.supplier=supplierBounds;
 await snap('supplier-button');await supplier.locator('svg').click();await page.locator('.modal.supDlg').waitFor();assert.equal(await page.locator('#sUrl').inputValue(),'https://example.com/material');await page.locator('.modal.supDlg h2 button').click();
 await page.evaluate(()=>{Dlg.settings('cgen')});await page.locator('.cform>label>.qm').first().waitFor();
 const help=await page.locator('.cform>label>.qm').evaluateAll(buttons=>buttons.map(el=>{const b=el.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(el);const t=range.getBoundingClientRect();return {x:b.left,w:b.width,h:b.height,dx:Math.abs(t.left+t.width/2-b.left-b.width/2),dy:Math.abs(t.top+t.height/2-b.top-b.height/2)}}));
 assert.ok(help.length>3);for(const h of help){assert.equal(h.w,24);assert.equal(h.h,24);assert.ok(h.dx<2.5&&h.dy<2.5,'вопрос по центру кнопки');assert.ok(Math.abs(h.x-help[0].x)<1,'значки в одной колонке')}
 measurements.help=help;await page.locator('.cform>label>.qm').first().click();await page.locator('.hintBox:not([hidden])').first().waitFor();await snap('settings-help');await page.locator('.modal h2 button').last().click();
 for(const width of [1600,1366,1100]){await page.setViewportSize({width,height:1000});await page.waitForTimeout(100);measurements['width'+width]=await geometry();await snap('estimate-'+width);}
 // Смета никогда не выходит за границы панели, даже на узком экране.
 await page.locator('#eBody').evaluate(el=>{el.scrollLeft=el.scrollWidth});assert.ok(await page.locator('#eBody').evaluate(el=>el.scrollLeft===0));
 // Размер видео владельца: чистый нижний правый угол, только вертикальная прокрутка.
 await page.setViewportSize({width:3440,height:1408});await page.waitForTimeout(100);measurements.width3440=await geometry();
 for(let i=0;i<30;i++)await page.locator('th[data-ci="7"] .sthResize').press('ArrowRight');
 await page.evaluate(()=>document.activeElement?.blur());
 await page.locator('#eBody').evaluate(el=>{el.scrollTop=el.scrollHeight;el.scrollLeft=el.scrollWidth});
 assert.ok(await page.locator('#eBody').evaluate(el=>el.scrollWidth<=el.clientWidth&&el.scrollHeight>el.clientHeight));
 const corner=await page.locator('#eCenter').boundingBox();await page.mouse.move(5,5);await page.screenshot({path:path.join(out,'scroll-corner-3440.png'),clip:{x:corner.x+corner.width-240,y:corner.y+corner.height-180,width:240,height:180}});
 await page.locator('#eBody').evaluate(el=>{el.scrollTop=el.scrollLeft=0});
 // Сброс ручного расширения перед следующими независимыми сценариями.
 await page.locator('.sthColumnsReset').click();
 // Автоматически широкое название на ультрашироком экране не прыгает к старому пределу 1600 px.
 const wideName=page.locator('th[data-ci="3"]'),wideBefore=await wideName.boundingBox();assert.ok(wideBefore.width>1600);
 const wideGrip=await wideName.locator('.sthResize').boundingBox();await page.mouse.move(wideGrip.x+wideGrip.width/2,wideGrip.y+20);await page.mouse.down();await page.mouse.move(wideGrip.x+wideGrip.width/2+20,wideGrip.y+20,{steps:4});await page.mouse.up();
 const wideAfter=await wideName.boundingBox();assert.ok(wideAfter.width>wideBefore.width+15);
 await page.waitForTimeout(500);await page.reload();await ready();
 const openWide=page.evaluate(f=>App.openPath(f),file);await page.getByRole('button',{name:'Всю модель',exact:true}).click({timeout:1500}).catch(()=>{});await openWide;
 for(let i=0;i<5&&await page.locator('#modals .modal').count();i++)await page.locator('#modals .modal').last().locator('h2 button').click();await go('est');
 assert.ok(Math.abs((await page.locator('th[data-ci="3"]').boundingBox()).width-wideAfter.width)<2);
 await page.locator('.sthColumnsReset').click();
 await page.locator('th[data-ci="8"]').focus();await page.keyboard.press('Alt+ArrowLeft');
 await page.setViewportSize({width:1920,height:1100});await go('mbase');const frame=page.frameLocator('#mbase iframe');await frame.locator('#mbRows .tr').first().waitFor();
 const backgrounds=await page.locator('#mbase iframe').evaluate(el=>{const doc=el.contentDocument;return {frame:getComputedStyle(el).backgroundColor,root:el.contentWindow.getComputedStyle(doc.documentElement).backgroundColor,body:el.contentWindow.getComputedStyle(doc.body).backgroundColor,bodyImage:el.contentWindow.getComputedStyle(doc.body).backgroundImage}});
 assert.deepEqual(backgrounds,{frame:'rgba(0, 0, 0, 0)',root:'rgba(0, 0, 0, 0)',body:'rgba(0, 0, 0, 0)',bodyImage:'none'});measurements.embeddedBase=backgrounds;await snap('embedded-base');
 const baseLayout=await page.locator('#mbase iframe').evaluate(el=>{
  const rail=document.getElementById('rail').getBoundingClientRect(), frame=el.getBoundingClientRect(), doc=el.contentDocument;
  const menu=doc.getElementById('mbMenu').getBoundingClientRect(), left=doc.getElementById('mbLeft').getBoundingClientRect(),right=doc.getElementById('mbRight').getBoundingClientRect();
  return {top:frame.top+menu.top-rail.top,bottom:frame.top+left.bottom-rail.bottom,panelBottom:left.bottom-right.bottom,resize:el.contentWindow.getComputedStyle(doc.getElementById('mbLeft')).resize};
 });
 assert.ok(Math.abs(baseLayout.top)<2&&Math.abs(baseLayout.bottom)<2&&Math.abs(baseLayout.panelBottom)<2,JSON.stringify(baseLayout));assert.equal(baseLayout.resize,'none');measurements.baseLayout=baseLayout;
 const baseWidth=await frame.locator('#mbLeft').evaluate(el=>el.getBoundingClientRect().width);
 await frame.locator('.sthBaseResize').press('ArrowRight');assert.ok(await frame.locator('#mbLeft').evaluate(el=>el.getBoundingClientRect().width)>baseWidth+15);
 const baseGrip=await frame.locator('.sthBaseResize').boundingBox();await page.mouse.move(baseGrip.x+6,baseGrip.y+30);await page.mouse.down();await page.mouse.move(baseGrip.x+46,baseGrip.y+30,{steps:5});await page.mouse.up();assert.ok(await frame.locator('#mbLeft').evaluate(el=>el.getBoundingClientRect().width)>baseWidth+50);
 await snap('embedded-base-resized');
 for(const size of [{width:1366,height:900},{width:1920,height:1100}]){
  await page.setViewportSize(size);await page.waitForTimeout(100);
  const edges=await page.locator('#mbase iframe').evaluate(el=>{const rail=document.getElementById('rail').getBoundingClientRect(),f=el.getBoundingClientRect(),doc=el.contentDocument;return {top:f.top+doc.getElementById('mbMenu').getBoundingClientRect().top-rail.top,bottom:f.top+doc.getElementById('mbLeft').getBoundingClientRect().bottom-rail.bottom};});
  assert.ok(Math.abs(edges.top)<2&&Math.abs(edges.bottom)<2,JSON.stringify(edges));
 }
 await frame.locator('#mbRows .tr').first().dblclick();await frame.locator('#modals .modal').last().waitFor();await frame.locator('#modals .modal').last().locator('h2 button').click();


 const standalone=await browser.newPage({viewport:{width:1400,height:900}});await standalone.goto(srv.url.replace('/?','/matbase.html?')+'&file='+encodeURIComponent(base));await standalone.locator('#mbRows .tr').first().waitFor();
 assert.notEqual(await standalone.locator('body').evaluate(el=>getComputedStyle(el).backgroundImage),'none');await standalone.screenshot({path:path.join(out,'standalone-base.png')});await standalone.close();
 await go('est');await page.waitForTimeout(500);const order=await page.evaluate(()=>App.S.set.sthCols.est);assert.ok(Array.isArray(order));
 await page.reload();await ready();const openAgain=page.evaluate(f=>App.openPath(f),file);await page.getByRole('button',{name:'Всю модель',exact:true}).click({timeout:1500}).catch(()=>{});await openAgain;
 for(let i=0;i<5&&await page.locator('#modals .modal').count();i++)await page.locator('#modals .modal').last().locator('h2 button').click();await go('est');
 assert.deepEqual(await page.evaluate(()=>App.S.set.sthCols.est),order);measurements.reloaded=await geometry();
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({ok:true,errors,measurements},null,2));console.log('Оформление: строки, прозрачная база, поставщик, справка, прокрутка, растяжение, перенос и сохранение столбцов — OK');
})().catch(async e=>{console.error(e);if(page){await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});console.log((await page.locator('#modals,#toasts').allTextContents()).join('\n'))}process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(srv)srv.close()});
