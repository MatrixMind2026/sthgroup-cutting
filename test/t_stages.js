// Свои этапы канбана: переименование, добавление и удаление колонок.   node test/t_stages.js
const fs = require('fs'), path = require('path');
require('../web/core/sth_order.js');
require('../web/core/sth_workspace.js');
const O = BM.sth, W = BM.sthWorkspace;
let bad = 0, n = 0;
const ok = (c, text, extra) => { n++; if (!c) { bad++; console.log('НЕ ТАК', text, extra === undefined ? '' : '→ ' + JSON.stringify(extra)); } };

const book = { next: 1, clients: [], orders: [], cat: {} };
const st = O.stages(book);
ok(st.length === 6 && st[0][0] === 'calc' && st[5][0] === 'closed', 'этапы книги по умолчанию — шесть основных');
ok(Array.isArray(book.cat.stages) && book.cat.stages.length === 6, 'основные этапы записываются в книгу (cat.stages)');

ok(O.renameStage(book, 'work', ' Производство цеха '), 'основной этап переименовывается');
ok(O.stageName(book, 'work') === 'Производство цеха' && O.statusName('work', book) === 'Производство цеха', 'новое название видно из книги');
ok(O.statusName('work') === 'В работе', 'без книги — прежнее название (совместимость)');
ok(!O.renameStage(book, 'work', '   ') && !O.renameStage(book, 'nope', 'Этап'), 'пустое название и чужой этап не принимаются');

const mine = O.addStage(book, 'Закупка');
ok(mine && mine.id !== 'closed' && mine.name === 'Закупка', 'своя колонка создаётся');
const ids = O.stages(book).map(s => s[0]);
ok(ids.indexOf(mine.id) === ids.indexOf('closed') - 1, 'своя колонка встаёт перед «Закрыт»');
ok(!O.addStage(book, '  '), 'колонка без названия не создаётся');

const o = O.addOrder(book, { clientId: '' });
let mv = O.moveStatus(o, mine.id, undefined, book);
ok(mv.changed && o.status === mine.id && o.sthFlow.some(f => f.to === mine.id), 'заказ перетаскивается в свою колонку, переход записан');
mv = O.moveStatus(o, 'invented-stage', undefined, book);
ok(!mv.changed && o.status === mine.id, 'неизвестный этап не принимается');
ok(!O.moveStatus(o, mine.id).changed || true, 'вызов без книги не падает');
const o2 = O.addOrder(book, { clientId: '' });
ok(!O.moveStatus(o2, mine.id).changed, 'без книги своя колонка не принимается — прежнее поведение');

ok(O.removeStage(book, 'work').reason === 'base', 'основную колонку удалить нельзя');
ok(O.removeStage(book, mine.id).reason === 'used', 'колонку с заказами удалить нельзя');
O.moveStatus(o, 'calc', undefined, book);
ok(O.removeStage(book, mine.id).ok && O.stages(book).every(s => s[0] !== mine.id), 'пустая своя колонка удаляется');

const mine2 = O.addStage(book, 'Задачи');
O.moveStatus(o, mine2.id, undefined, book);
const sum = W.summary(book);
ok(sum.active >= 1 && sum.attention.some(x => x.id === o.id), 'заказ в своей колонке — активный в «Сегодня»');

const back = JSON.parse(JSON.stringify(book));
ok(back.cat.stages.some(s => s.id === mine2.id && s.name === 'Задачи'), 'свои этапы сохраняются в файл заказов');

const kb = fs.readFileSync(path.join(__dirname, '..', 'web', 'ui', 'sth_kanban.js'), 'utf8');
ok(kb.includes('O.stages(X.book)') && kb.includes('soStageAdd') && kb.includes('data-rename') && kb.includes('data-delstage'), 'доска: этапы из книги, «+ Колонка», переименование и удаление');
const css = fs.readFileSync(path.join(__dirname, '..', 'web', 'sth_v2.css'), 'utf8');
ok(/\.soLaneTitle\{[^}]*color:var\(--text/.test(css) && css.includes('.soLaneAdd{'), 'заголовок колонки — отдельный блок с цветом текста темы');
const ord = fs.readFileSync(path.join(__dirname, '..', 'web', 'ui', 'sth_orders.js'), 'utf8');
ok(ord.includes('opt(O.stages(X.book), X.st)') && ord.includes('opt(O.stages(X.book), o.status)'), 'список заказов и карточка берут этапы из книги');

console.log('проверок', n, '|', bad ? 'ОШИБОК: ' + bad : 'ошибок нет');
process.exit(bad ? 1 : 0);
