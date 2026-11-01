// Чтение .FDB проверяется на реальной базе, если она лежит рядом (переменная FDB_SAMPLE); иначе тест пропускается.
const assert = require('assert');
const fs = require('fs');
const F = require('../core/fdb.js');
const MB = require('../core/materialbase.js');
const p = process.env.FDB_SAMPLE;
if (!p || !fs.existsSync(p)) { console.log('FDB: образец не задан — пропуск'); process.exit(0); }
const r = F.readMaterials(fs.readFileSync(p));
assert.ok(r.records.length > 1000, 'мало записей');
const b = MB.emptyBase(); MB.importBazisRecords(b, r.records, { replace: true, groups: r.groups });
assert.strictEqual(b.materials.length, r.records.length);
assert.ok(b.groups.length > 100);
assert.throws(() => F.readMaterials(Buffer.alloc(40000)), /Firebird/);
console.log('FDB: пройдено, позиций ' + r.records.length);
