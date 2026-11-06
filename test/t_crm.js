// CRM STHGroup 2.0: защищённое локальное подключение и приём заявок без дублей
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
require('../web/core/sth_order.js'); require('../web/core/sth_crm.js');
const O = BM.sth, C = BM.sthCrm, CRM = require('../sth_crm.js');
let n = 0; const ok = s => { n++; console.log('ок     ' + s); };

const b = O.empty();
const req = [{ id: 41, clientId: 7, orderNumber: 'CRM-0041', productType: 'Кухня', status: 'new_request', createdAt: '2026-11-04T09:30:00.000Z' }];
const clients = [{ id: 7, name: 'Северная Венеция', phone: '+7 900 000-00-00' }];
const first = C.import(b, req, clients);
assert.strictEqual(first.created.length, 1); assert.strictEqual(b.orders.length, 1); assert.strictEqual(b.clients.length, 1);
assert.strictEqual(first.created[0].no, 'CRM-0041'); assert.strictEqual(first.created[0].externalId, 'crm:41'); assert.strictEqual(first.created[0].date, '2026-11-04');
const second = C.import(b, req, clients);
assert.strictEqual(second.created.length, 0); assert.strictEqual(second.skipped[0], first.created[0]); assert.strictEqual(b.orders.length, 1); assert.strictEqual(b.clients.length, 1);
assert.strictEqual(C.byExternal(b, 41), first.created[0]); ok('заявка CRM создаёт заказ и клиента один раз, внешний ID исключает дубли');
const production = C.import(b, [{ id: 42, clientId: 7, orderNumber: 'CRM-0041', status: 'production' }], clients);
assert.strictEqual(production.created[0].status, 'work'); assert.notStrictEqual(production.created[0].no, 'CRM-0041'); assert.strictEqual(b.clients.length, 1);
assert.strictEqual(C.status('completed'), 'closed'); ok('этапы CRM отображаются в этапы заказа, занятый номер не дублируется');

const safe = {
  isEncryptionAvailable: () => true,
  encryptString: s => Buffer.from('encrypted:' + Buffer.from(s).toString('base64')),
  decryptString: b => Buffer.from(b.toString().replace(/^encrypted:/, ''), 'base64').toString()
};
function response(status, data, cookies) {
  return { status: status, ok: status >= 200 && status < 300, headers: { getSetCookie: () => cookies || [], get: () => '' }, text: async () => JSON.stringify(data) };
}
let calls = [], loginCount = 0;
const fetchMock = async (url, opt) => {
  calls.push({ url: url, opt: opt });
  if (url.endsWith('/api/login')) { loginCount++; assert.strictEqual(JSON.parse(opt.body).password, 'секретный-пароль'); return response(200, { ok: true }, ['sid=session-value; HttpOnly; Path=/']); }
  assert.ok(/sid=session-value/.test(opt.headers.Cookie || ''), 'сессия CRM передаётся cookie');
  if (url.endsWith('/api/data/requests')) return response(200, { items: req });
  if (url.endsWith('/api/data/clients')) return response(200, { data: { items: clients } });
  throw new Error('unexpected url ' + url);
};
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sth-crm-'));
  const client = new CRM.Client({ dataDir: dir, safeStorage: safe, fetch: fetchMock });
  client.state.url = 'https://crm.example.test/app/'; client.state.email = 'user@example.test';
  await client.login(client.state.email, 'секретный-пароль'); client.save('секретный-пароль');
  const disk = fs.readFileSync(path.join(dir, 'crm.json'), 'utf8');
  assert.ok(!disk.includes('секретный-пароль') && !disk.includes('sid=session-value') && disk.includes('user@example.test'));
  const state = client.publicState(); assert.ok(state.hasPassword && !Object.prototype.hasOwnProperty.call(state, 'password'));
  const data = await client.sync(); assert.strictEqual(data.requests.length, 1); assert.strictEqual(data.clients.length, 1); assert.strictEqual(loginCount, 1);
  assert.ok(calls.every(x => x.url.startsWith('https://crm.example.test/api/'))); ok('вход и чтение заявок идут через серверную часть, cookie-сессия сохраняется');
  const restored = new CRM.Client({ dataDir: dir, safeStorage: safe, fetch: fetchMock });
  assert.strictEqual(restored.password(), 'секретный-пароль'); assert.strictEqual(restored.cookies.sid, 'session-value');
  assert.ok(restored.publicState().configured && restored.publicState().hasPassword);
  const secrets = JSON.parse(fs.readFileSync(restored.file,'utf8')); const requestsBefore=calls.length;
  restored.saveAuto(false);
  const restarted = new CRM.Client({dataDir:dir,safeStorage:safe,fetch:fetchMock});
  assert.strictEqual(restarted.state.auto,false);assert.strictEqual(restarted.password(),'секретный-пароль');assert.strictEqual(restarted.cookies.sid,'session-value');assert.strictEqual(calls.length,requestsBefore);
  const secretsAfter=JSON.parse(fs.readFileSync(restored.file,'utf8'));assert.strictEqual(secretsAfter.password,secrets.password);assert.strictEqual(secretsAfter.cookies,secrets.cookies);
  restarted.saveAuto(true);assert.strictEqual(new CRM.Client({dataDir:dir,safeStorage:safe,fetch:fetchMock}).state.auto,true);
  ok('галочка автопроверки переживает перезапуск без сетевого входа и изменения секретов');
 ok('пароль и сессия на диске зашифрованы, окно получает только признак их наличия');
  const noSafe = new CRM.Client({ dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'sth-crm-nosafe-')), fetch: fetchMock });
  assert.throws(() => noSafe.save('secret'), /Защищённое хранилище/); ok('без системного шифрования пароль не записывается открытым текстом');
  assert.strictEqual(CRM.baseUrl('https://crm.migman.ru/app/'), 'https://crm.migman.ru'); assert.deepStrictEqual(CRM.list({ data: { requests: [1] } }, ['requests']), [1]);
  ok('адрес /app/ преобразуется в API источника, поддерживаются вложенные ответы CRM');
  console.log('проверок ' + n + ' | ошибок нет');
})().catch(e => { console.error(e); process.exit(1); });
