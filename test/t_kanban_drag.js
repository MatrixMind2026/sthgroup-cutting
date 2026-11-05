// STHGroup: обработчики доски различают перенос этапа и перенос заказа.
const assert = require('assert'), fs = require('fs'), vm = require('vm');
require('../web/core/sth_order.js');
const O = BM.sth, book = O.empty(), order = O.addOrder(book, {});
const handlers = {}, transfers = {};
let saves = 0, transitions = 0;
const classes = { add() {}, remove() {}, toggle() {} };
const host = { addEventListener(type, fn) { handlers[type] = fn; }, querySelectorAll() { return []; }, querySelector() { return null; }, classList: classes };
const state = { section: 'model', set: {} };
const UI = { esc: String, toast() {} };
const X = { book, save() { saves++; }, render() {}, snapOpen() {} };
vm.runInNewContext(fs.readFileSync(__dirname + '/../web/ui/sth_kanban.js', 'utf8'), {
  BM: { sth: O }, window: { UI, STHO: X, App: { S: state } },
  document: { getElementById() { return host; }, dispatchEvent() { transitions++; } },
  CustomEvent: function (type, data) { this.type = type; this.detail = data.detail; },
  Date, Promise
});
const dataTransfer = { setData(k, v) { transfers[k] = v; }, getData(k) { return transfers[k]; } };
const lane = id => ({ dataset: { stage: id }, classList: classes, getBoundingClientRect() { return { left: 100, width: 200 }; }, contains() { return false; } });
function titleTarget(id) {
  const parent = lane(id);
  const title = { dataset: { rename: id }, closest(s) { return s === '.soLane' ? parent : null; } };
  return { closest(s) { return s === '.soLaneTitle' ? title : null; } };
}
function laneTarget(id) { const el = lane(id); return { closest(s) { return s.includes('[data-stage]') ? el : null; } }; }
function event(target, clientX = 110) { return { target, dataTransfer, clientX, preventDefault() {} }; }

handlers.dragstart(event(titleTarget('closed')));
handlers.dragover(event(laneTarget('calc')));
handlers.drop(event(laneTarget('calc')));
assert.strictEqual(O.stages(book)[0][0], 'closed');
assert.strictEqual(order.status, 'calc');
assert.strictEqual(saves, 1);
assert.strictEqual(transitions, 0);
handlers.dragend(event(titleTarget('closed')));

handlers.dragstart(event(titleTarget('closed')));
handlers.drop(event(laneTarget('work'), 290));
let ids = O.stages(book).map(s => s[0]);
assert.strictEqual(ids.indexOf('closed'), ids.indexOf('work') + 1);

const beforeKeyboard = saves;
const keyTitle = { dataset: { rename: 'closed' } };
keyTitle.closest = s => s === '.soLaneTitle' ? keyTitle : null;
handlers.keydown({ target: keyTitle, altKey: true, key: 'ArrowLeft', preventDefault() {} });
ids = O.stages(book).map(s => s[0]);
assert.strictEqual(ids.indexOf('closed') + 1, ids.indexOf('work'));
assert.strictEqual(saves, beforeKeyboard + 1);

const card = { dataset: { ko: order.id }, classList: classes };
handlers.dragstart(event({ closest(s) { return s === '[data-ko]' ? card : null; } }));
handlers.drop(event(laneTarget('work')));
assert.strictEqual(order.status, 'work');
assert.strictEqual(transitions, 1);
assert.ok(order.sthFlow.some(f => f.to === 'work'));
handlers.dragend(event({ closest() { return card; } }));
console.log('ошибок нет: перенос колонок влево/вправо, клавиатура, перенос заказа и сохранение');
