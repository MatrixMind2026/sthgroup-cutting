// Optional browser QA: STH_PLAYWRIGHT points to an existing Playwright installation.
const {chromium}=require(process.env.STH_PLAYWRIGHT||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const output=process.env.STH_VIEWER_PREVIEW||path.join(__dirname,'../../viewer-preview');fs.mkdirSync(output,{recursive:true});
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1600,height:1000},deviceScaleFactor:1});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto('http://127.0.0.1:47920');await page.waitForFunction(()=>document.querySelector('#canvas').dataset.ready==='true');
  await page.locator('[data-part=upper]').click();assert.match(await page.locator('#part-info').innerText(),/Верхние модули/);
  await page.locator('#facades').click();assert.equal(await page.locator('#facades').getAttribute('aria-pressed'),'true');await page.locator('#facades').click();
  const canvas=page.locator('#canvas canvas');await canvas.focus();await page.keyboard.press('ArrowRight');await page.keyboard.press('Escape');
  const bounds=await canvas.boundingBox();await page.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2);await page.mouse.down();await page.mouse.move(bounds.x+bounds.width/2+80,bounds.y+bounds.height/2+20,{steps:8});await page.mouse.up();await page.locator('#reset-view').click();
  await page.screenshot({path:path.join(output,'desktop-model.png'),fullPage:true});
  assert.equal(await page.locator('[role=tab]').count(),3);
  await page.locator('#tab-product').click();assert.equal(await page.locator('#product-list article').count(),4);
  await page.screenshot({path:path.join(output,'desktop-product.png'),fullPage:true});
  await page.locator('#tab-status').click();assert.match(await page.locator('[aria-current=step]').innerText(),/В производстве/);
  await page.screenshot({path:path.join(output,'desktop-status.png'),fullPage:true});
  const source=fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8');assert.ok(!/const estimate|3920|download-estimate|cut-material/.test(source),'Internal datasets must not ship to customers');
  assert.equal(await page.locator('#estimate,#cut,#docs').count(),0);
  // Mobile tabs, all panels and dynamic data must fit without document overflow.
  for(const width of [390,360]){await page.setViewportSize({width,height:844});for(const tab of ['model','product','status']){await page.locator('#tab-'+tab).click();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${width}: ${tab} horizontal overflow`);}await page.locator('#tab-model').click();await page.screenshot({path:path.join(output,`mobile-${width}.png`),fullPage:true});}
  await page.reload();await page.waitForFunction(()=>document.querySelector('#canvas').dataset.ready==='true');assert.equal(await page.locator('#tab-model').getAttribute('aria-selected'),'true');
  // Keyboard tabs follow selection and remain operable.
  await page.locator('#tab-model').focus();await page.keyboard.press('ArrowRight');assert.equal(await page.locator('#tab-product').getAttribute('aria-selected'),'true');
  assert.deepEqual(errors,[]);console.log('Viewer browser QA passed: customer 3D, selection, facades, product, status, no internal datasets, mobile 390/360.');
 }catch(e){await page.screenshot({path:path.join(output,'failure.png'),fullPage:true});throw e;}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
