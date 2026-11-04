// STHGroup: контекстное меню использует коды режимов штатной сметы.   node test/t_est_menu.js
const assert = require('assert');
global.BM = { sthEst: {} };
require('../web/core/sth_est.js');
BM.est = { unitChoice: (R, w) => ({ options: w.options }) };
global.document = { addEventListener() {} };
global.window = {
	UI: { esc: String, error() {}, toast() {}, confirm() {}, menu() {} },
	Est: { render() {} },
	MatBase: {},
	App: { S() { return { set: {} }; } }
};
require('../web/ui/sth_est.js');
const X = window.STHEst;
assert.ok(X && typeof X.contextMenu === 'function' && typeof X.unitValue === 'function');
const panel = { kind: 'panel', options: [[0, 'листы'], [1, 'кв.м'], [2, 'не считать']] };
const edge = { kind: 'edge', options: [[0, 'да'], [2, 'справочно'], [1, 'не считать']] };
const profile = { kind: 'profile', options: [[2800, 'по хлысту'], [0, 'пог. м'], [-1, 'не считать']] };
const own = { kind: 'own', options: [['on', 'да'], ['off', 'не считать']] };
const extra = { kind: 'extra', xmode: 'pct', options: [['sum', 'суммой'], ['pct', '% от сметы'], ['off', 'не считать']] };
assert.strictEqual(X.unitValue(panel, false), 2);
assert.strictEqual(X.unitValue(panel, true), 0);
assert.strictEqual(X.unitValue(edge, false), 1);
assert.strictEqual(X.unitValue(profile, false), -1);
assert.strictEqual(X.unitValue(own, false), 'off');
assert.strictEqual(X.unitValue(own, true), 'on');
assert.strictEqual(X.unitValue(extra, false), 'off');
assert.strictEqual(X.unitValue(extra, true), 'pct');
console.log('проверок 9 | ошибок нет: коды расчёта плиты, кромки, профиля и своих строк');
