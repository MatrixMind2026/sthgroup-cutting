import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from '../server.mjs';

test('preview serves only public assets and exposes no write/file APIs', async () => {
 const server=createServer();server.listen(0,'127.0.0.1');await once(server,'listening');
 const url=`http://127.0.0.1:${server.address().port}`;
 try {
  const page=await fetch(url);assert.equal(page.status,200);assert.match(await page.text(),/Демонстрационный заказ/);
  assert.match(page.headers.get('content-security-policy'),/frame-ancestors 'none'/);
  assert.deepEqual(await (await fetch(url+'/health')).json(),{ok:true,mode:'demo'});
  const head=await fetch(url+'/app.js',{method:'HEAD'});assert.equal(head.status,200);assert.equal(await head.text(),'');
  for(const path of ['/api/file','/server.mjs','/package.json','/%2e%2e%5cserver.mjs','/vendor/missing.js'])assert.equal((await fetch(url+path)).status,404,path);
  assert.equal((await fetch(url,{method:'POST',body:'no write'})).status,405);
 } finally {await new Promise(resolve=>server.close(resolve));}
});
