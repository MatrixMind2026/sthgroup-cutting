// STHGroup 2.0: фильтры сметы отделены от расчёта.   node test/t_est_v2.js
global.BM = {};
require('../web/core/sth_est.js');
const C = BM.sthEst;
let bad = 0, n = 0;
const ok = (c, text, extra) => { n++; if (!c) { bad++; console.log('НЕ ТАК', text, extra === undefined ? '' : '→ ' + JSON.stringify(extra)); } };
const rows = [
	{ kind: 'panel', offKey: 'p1', val: 2, price: 100, title: 'Плита' },
	{ kind: 'fastener', offKey: 'f1', val: 4, price: 0, title: 'Петля' },
	{ kind: 'edge', offKey: 'e1', val: 3, price: 20, bad: 'Нет цвета', title: 'Кромка' },
	{ kind: 'panel', offKey: 'p2', val: 1, price: 200, sthReplace: { mat: 'm2' }, title: 'Замена' },
	{ kind: 'panel', offKey: 'p3', val: 1, price: 100, off: true, title: 'Не считать' },
	{ kind: 'own', ownId: 'own1', val: 1, price: 0, title: 'Своя строка' }
];
const infos = { p1: { stock: 5 }, f1: null, e1: { stock: 0 }, p2: { stock: 2 }, p3: { stock: 1 }, own1: null };
const info = w => infos[w.offKey || w.ownId];
ok(C.rowKey(rows[0]) === 'panel|p1' && C.rowKey(rows[5]) === 'own|own1', 'ключи строк совпадают с таблицей сметы');
ok(C.rows(rows, 'all', info).length === 6, 'фильтр «все» не меняет состав');
ok(C.rows(rows, 'problem', info).map(w => w.offKey).join() === 'f1,e1', 'проблемные: нет материала базы или есть предупреждение');
ok(C.rows(rows, 'replaced', info).length === 1 && C.rows(rows, 'replaced', info)[0].offKey === 'p2', 'заменённые строки');
ok(C.rows(rows, 'noPrice', info).length === 1 && C.rows(rows, 'noPrice', info)[0].offKey === 'f1', 'без цены: только активные материальные строки');
ok(C.rows(rows, 'stock', info).map(w => w.offKey).join() === 'p1,p2', 'со склада: положительный остаток у активной строки');
const counts = C.counts(rows, info);
ok(counts.all === 6 && counts.problem === 2 && counts.replaced === 1 && counts.noPrice === 1 && counts.stock === 2, 'счётчики постоянных фильтров', counts);
ok(rows.length === 6 && rows[0].price === 100, 'фильтрация не мутирует расчётные строки');
const fs = require('fs');
const ui = fs.readFileSync(__dirname + '/../web/ui/sth_est.js', 'utf8');
ok(ui.includes('if (row && X.contextMenu(e, tr, row)) e.stopPropagation()'), 'полное меню перехватывает строку до штатного меню, не изменяя его резервный код');
ok(ui.includes('X.contextMenu = function') && ui.includes('U.menu(e.clientX, e.clientY, rowActs(w))'), 'полное меню строки использует штатный UI.menu');
ok(ui.includes('U.confirm(') && ui.includes("action('off')"), 'подтверждение массового исключения из расчёта сохранено');
ok(ui.includes('Правая кнопка мыши — все действия') && ui.includes('data-setools'), 'подсказка и сворачиваемая панель действий');
ok(ui.includes('else if (Es.R) Es.R.rows.forEach'), 'выбор всех строк имеет запасной путь без табличных галочек');
ok(ui.includes("tbody > tr[data-k]") && ui.includes('data-seexpand'), 'стрелка создаётся у каждой расчётной позиции, не только у ЛДСП');
ok(ui.includes("className = 'sthDetail'") && ui.includes('moveChildren(nm, name.body)') && ui.includes('moveChildren(ar, article.body)'), 'прежние поля переносятся в раскрытие без дублирования');
ok(ui.includes('moveChildren(unit, mode.body)') && ui.includes('moveChildren(calc, model.body)') && ui.includes('moveChildren(sup, supplier.body)'), 'режим, модель и поставщик сохранены внутри позиции');
ok(ui.includes('setOpen(key(w), true)') && ui.includes('!tr || tr.hidden') && ui.includes('showCard(X.last)'), 'меню открывает карточку справа; скрытая фильтром строка не оставляет подробности');
ok(ui.includes("window.STHDrag.cols(table, 'est'") && ui.includes('sthDetailCol'), 'компактная разметка учитывает перестановку столбцов');
const css = fs.readFileSync(__dirname + '/../web/sth_v2.css', 'utf8');
ok(css.includes('.sthRowToggle') && css.includes('tr.sthDetail[hidden]') && css.includes('.sthDetailGrid'), 'оформление стрелки, скрытия и сетки прежних полей');
ok(css.includes('table-layout:fixed') && css.includes('th[data-ci="3"]') && css.includes('minmax(0,2fr)'), 'ширина таблицы и раскрытия не зависит от длинного содержимого');
ok(css.includes('@media(max-width:1150px)') && css.includes('@media(max-width:1100px)') && css.includes('td:has(>input.pv)>.un'), 'узкие окна: компактные поля, перенос единиц и одноколоночная панель');
const drag = fs.readFileSync(__dirname + '/../web/ui/sth_drag.js', 'utf8');
ok(drag.includes("c.classList.contains('sthDetailCol')"), 'скрытые технические колонки не перехватывают перетаскивание видимых заголовков');
['Es.supEdit', 'Es.ownCard', 'Es.importScript', 'window.STH.pickMaterial', 'E.unmerge', 'window.Dlg.estDoc', 'K.writeOff'].forEach(s => ok(ui.includes(s), 'меню вызывает существующую функцию: ' + s));
console.log('проверок', n, '|', bad ? 'ОШИБОК: ' + bad : 'ошибок нет');
process.exit(bad ? 1 : 0);
