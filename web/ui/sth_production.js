/* STHGroup: пять производственных вкладок существующего заказа. */
(function () {
 'use strict';
 var X = window.STHO, U = window.UI, O = BM.sth, F = BM.sthProduction, P = BM.project, MB = BM.mb, SK = BM.stock;
 var esc = U.esc, data = {}, selected = {}, review = {}, busy = false;
 var tabs = X.productionTabs = [['supply', 'Обеспечение'], ['job', 'Задание в цех'], ['production', 'Производство'], ['fact', 'План / факт'], ['changes', 'Изменения модели']];
 var S = function () { return window.App.S; }, clone = function (v) { return JSON.parse(JSON.stringify(v)); };
 var n = function (v) { return String(Math.round((v || 0) * 10000) / 10000).replace('.', ','); };
 var money = function (v) { return v === null || v === undefined ? 'не внесено' : O.money(v) + ' ₽'; };
 var button = function (action, label, primary) { return '<button type="button" data-sp="' + action + '"' + (primary ? ' class="primary"' : '') + '>' + label + '</button>'; };
 function panel(title, body) { return '<section class="spPanel"><h2>' + title + '</h2>' + body + '</section>'; }
 function empty(text) { return '<p class="spEmpty">' + esc(text) + '</p>'; }
 function table(head, rows) { return '<table class="spTable"><thead><tr>' + head.map(function (h) { return '<th>' + h + '</th>'; }).join('') + '</tr></thead><tbody>' + rows.join('') + '</tbody></table>'; }
 function dateTime(at) { var d = new Date(at); return isNaN(d) ? '' : d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); }
 function history(o, type) {
  var h = F.fix(o).history.filter(function (x) { return !type || x.type === type; }).slice(-30).reverse();
  return panel('История', h.length ? '<ul class="spHistory">' + h.map(function (x) { return '<li><span>' + esc(x.text) + (x.note ? '<small class="mute"> · ' + esc(x.note) + '</small>' : '') + '</span><time>' + esc(dateTime(x.at)) + '</time></li>'; }).join('') + '</ul>' : empty('Изменений пока нет.'));
 }
 function field(id, label, value, type) { return '<label>' + esc(label) + '<input id="' + id + '" type="' + (type || 'text') + '" value="' + esc(value || '') + '"></label>'; }
 function state(st) { return '<span class="spBadge ' + st + '">' + ({ wait: 'Ожидает', work: 'В работе', done: 'Готово' })[st] + '</span>'; }
 function currentOperation(o) { var ops = F.fix(o).operations; return ops.find(function (r) { return r.id === selected[o.id]; }) || ops.find(function (r) { return r.status !== 'done'; }) || ops[0]; }
 function currentMaterial(o) { var d = data[o.id]; return d && d.rows && (d.rows.find(function (r) { return r.mat === selected[o.id + ':mat']; }) || d.rows[0]); }
 async function supply(o) {
  try {
   await window.MatBase.refresh();
   if (!MB.cur) throw new Error('Выберите файл базы материалов в разделе «База».');
   var result = await window.STHStock.orderNeed(o);
   data[o.id] = { result: result, rows: F.supply(MB.cur, o, result) };
  } catch (e) { data[o.id] = { error: e.message, rows: [] }; }
  return data[o.id];
 }
 function supplyWarnings(d) {
  if (!d) return empty('Нажмите «Обновить обеспечение».');
  if (d.error) return '<p class="note warn">' + esc(d.error) + '</p>';
  var r = d.result, warnings = [];
  if (r.bad.length) warnings.push('Не прочитаны изделия: ' + r.bad.join(', '));
  if (r.miss.length) warnings.push('Не сопоставлены с базой: ' + Array.from(new Set(r.miss)).join(', '));
  return warnings.length ? '<p class="note warn">' + warnings.map(esc).join('<br>') + '. Обеспечение неполное.</p>' : '';
 }
 function supplyHtml(o) {
  var d = data[o.id], rows = d && d.rows || [], current = currentMaterial(o);
  var h = supplyWarnings(d) + '<div class="spActions">' + button('refresh', 'Обновить обеспечение') + button('reserve', 'Зарезервировать доступное') + '</div>';
  h += rows.length ? table(['Материал', 'Нужно', 'В резерве', 'Докупить', 'Получено'], rows.map(function (r) {
   return '<tr' + (current && r.mat === current.mat ? ' class="spOn"' : '') + '><td><button class="link" data-spmat="' + esc(r.mat) + '">' + esc(r.name) + '</button><small>' + (r.customer ? 'Обеспечивает клиент · ' : '') + (r.issued ? 'Выдано: ' + n(r.issued) + ' ' + esc(r.unit) : r.buy > 0 ? 'Есть нехватка' : 'Материал доступен') + '</small></td>' + [r.need, r.reserved, r.buy, r.received].map(function (v) { return '<td>' + n(v) + ' ' + esc(r.unit || '') + '</td>'; }).join('') + '</tr>';
  })) : empty('Потребность пока не рассчитана. Добавьте изделия, выполните раскрой и сопоставьте материалы с базой.');
  h += '<p class="mute">В резерве показан физически доступный объём. Чужие резервы исключены. Выданное в производство учтено. Приход и выдача — разные операции.</p>';
  var off = MB.cur ? SK.offRows(MB.cur, '').filter(function (r) { return rows.some(function (m) { return m.mat === r.mat; }) && (!r.res || r.res === o.id); }) : [];
  var rem = off.length ? table(['Материал', 'Размер', 'Место', 'Резерв'], off.slice(0, 20).map(function (r) { return '<tr><td>' + esc(MB.cur.mats[r.mat].name) + '</td><td>' + n(r.L) + ' × ' + n(r.W) + '<small>' + n(r.n) + ' шт.</small></td><td>' + esc(SK.offCell(MB.cur, r)) + '</td><td>' + (r.res ? 'Этот заказ' : '<button data-spoff="' + esc(r.id) + '">В резерв</button>') + '</td></tr>'; })) : empty('Доступных остатков по материалам заказа нет.');
  return panel('Обеспечение заказа', h) + panel('Деловые остатки', '<p class="mute">Остатки учитываются отдельно от целых листов. Перед использованием проверьте размеры, текстуру и качество.</p>' + rem + button('stock', 'Открыть склад')) + purchaseHtml(o);
 }
 function purchaseHtml(o) {
  var list = F.fix(o).purchases;
  if (!list.length) return '';
  return panel('Заявки поставщикам', list.slice(-8).reverse().map(function (p) { var s = MB.cur && MB.supplier(MB.cur, p.supplier); return '<p><b>' + esc(s ? s.name : 'Поставщик не указан') + '</b> · ' + esc(dateTime(p.at)) + ' · ' + p.lines.length + ' поз. <button data-sppurchase="' + esc(p.id) + '">Документ</button></p>'; }).join('') + '<p class="mute">Заявка сохраняется в заказе. Поставщику автоматически не отправляется.</p>');
 }
 function operationHtml(o) {
  var p = F.fix(o), current = currentOperation(o), done = p.operations.filter(function (x) { return x.status === 'done'; }).length;
  return panel('Ход производства', '<div>Завершено ' + done + ' из ' + p.operations.length + ' операций</div><progress class="spProgress" max="' + p.operations.length + '" value="' + done + '" aria-label="Завершено операций"></progress>' + table(['Операция', 'Ответственный', 'Срок', 'Статус'], p.operations.map(function (op) {
   return '<tr' + (current.id === op.id ? ' class="spOn"' : '') + '><td><button class="link" data-spop="' + op.id + '">' + esc(op.name) + '</button></td><td>' + esc(op.who || 'Не назначен') + '</td><td>' + esc(O.ruDate(op.due) || 'Не задан') + '</td><td>' + state(op.status) + '</td></tr>';
  }))) + history(o, 'operation');
 }
 function edgeLabel(row) {
  var sides; try { sides = JSON.parse(row.edge || '{}'); } catch (e) { sides = {}; }
  if (sides.edges) return sides.edges.map(function (edge) { return ({ T: 'Верх', B: 'Низ', L: 'Слева', R: 'Справа' }[edge.side] || 'Контур') + ': ' + (edge.mat || n(edge.th) + ' мм'); }).join('; ') || 'Без кромки';
  return [['T', 'Верх'], ['B', 'Низ'], ['L', 'Слева'], ['R', 'Справа']].filter(function (x) { return sides[x[0]]; }).map(function (x) { var edge = sides[x[0]]; return x[1] + ': ' + (edge.mat || edge.name || edge.sign || 'есть'); }).join('; ') || 'Без кромки';
 }
 function holeCount(row) {
  var h; try { h = JSON.parse(row.holes || '{}'); } catch (e) { h = {}; }
  return (h.top || []).length + (h.bot || []).length + (h.thr || []).length + O.num(h.edge);
 }
 function jobBody(job) {
  return '<h3>Изделия</h3>' + table(['Изделие', 'Деталей', 'Листов'], job.items.map(function (it) { return '<tr><td>' + esc(it.title) + '</td><td>' + n(it.parts) + '</td><td>' + n(it.sheets.reduce(function (s, x) { return s + x.n; }, 0)) + '</td></tr>'; })) +
   '<h3>Материалы</h3>' + table(['Материал', 'Количество', 'Ед.'], job.materials.map(function (r) { return '<tr><td>' + esc(r.name) + '</td><td>' + n(r.need) + '</td><td>' + esc(r.unit) + '</td></tr>'; })) +
   '<h3>Операции</h3>' + table(['Операция', 'Ответственный', 'Срок'], job.operations.map(function (r) { return '<tr><td>' + esc(r.name) + '</td><td>' + esc(r.who || job.options.who || 'Не назначен') + '</td><td>' + esc(O.ruDate(r.due || job.options.due) || 'Не задан') + '</td></tr>'; })) +
   (job.options.edges ? '<p>Кромление: ' + n(job.items.reduce(function (s, it) { return s + (it.edgeM || 0); }, 0)) + ' м. Присадка: ' + n(job.items.reduce(function (s, it) { return s + (it.holes || 0); }, 0)) + ' отв. (по сводке модели).</p>' : '') +
   (job.options.edges ? job.items.map(function (it) { return '<h3>Кромка и присадка · ' + esc(it.title) + '</h3>' + table(['Деталь / размер', 'Кол-во', 'Кромка', 'Отверстий на деталь'], (it.details || []).map(function (r) { return '<tr><td>' + esc([r.pos, r.name].filter(Boolean).join(' · ')) + '<small>' + n(r.L) + ' × ' + n(r.W) + ' × ' + n(r.th) + ' мм</small></td><td>' + n(r.qty) + '</td><td>' + esc(edgeLabel(r)) + '</td><td>' + n(holeCount(r)) + '</td></tr>'; })); }).join('') : '') +
   (job.note || job.options.note ? '<h3>Примечания</h3><p style="white-space:pre-wrap">' + esc([job.note, job.options.note].filter(Boolean).join('\n')) + '</p>' : '') +
   (job.maps || []).map(function (m) { return '<div class="spJobMap"><h3>' + esc(m.title) + '</h3>' + m.svg + '</div>'; }).join('');
 }
 function jobHtml(o) {
  var p = F.fix(o), job = p.jobs[p.jobs.length - 1];
  return panel('Задание в цех', job ? '<p class="mute">Задание № ' + job.no + ' от ' + esc(dateTime(job.at)) + ' · снимок заказа на момент формирования</p>' + jobBody(Object.assign({}, job, { maps: [] })) + '<div class="spActions">' + button('job-preview', 'Предпросмотр / печать') + button('job-pdf', 'Сохранить PDF') + '</div>' : empty('Назначьте ответственного и срок, выберите состав и сформируйте задание.')) +
   panel('Предыдущие задания', p.jobs.length ? p.jobs.slice().reverse().map(function (j) { return '<p>№ ' + j.no + ' · ' + esc(dateTime(j.at)) + ' <button data-spjob="' + esc(j.id) + '">Открыть</button></p>'; }).join('') : empty('Заданий пока нет.'));
 }
 function factHtml(o) {
  var p = F.fix(o), q = F.planFact(o);
  return panel('План и факт заказа', '<div class="spTotals"><span>План<b>' + money(q.plan) + '</b></span><span>Внесённый факт<b>' + money(q.fact) + '</b></span><span>Отклонение<b>' + (q.delta === null ? 'факт неполный' : money(q.delta)) + '</b></span></div>' +
   (!p.plan ? '<p class="note warn">План ещё не зафиксирован. Зафиксируйте его после расчёта изделий.</p>' : '<p class="mute">План от ' + esc(dateTime(p.plan.at)) + '. ' + esc(p.plan.basis) + '. Это сравнение затрат и услуг, прибыль не рассчитывается.</p>') +
   table(['Статья', 'План', 'Факт', 'Разница'], q.rows.map(function (r) { return '<tr><td>' + esc(r.name) + '</td><td>' + money(r.plan) + '</td><td>' + money(r.fact) + '</td><td>' + money(r.delta) + '</td></tr>'; })) + '<p class="mute">Фактические расходы вносятся вручную. Поступления на склад автоматически в факт не добавляются.</p>') +
   panel('Фактические расходы', table(['Статья / причина', 'Дата', 'Сумма', ''], p.actuals.filter(function (r) { return !r.void; }).map(function (r) { return '<tr><td>' + esc(F.CATEGORIES.find(function (c) { return c[0] === r.category; })[1]) + '<small>' + esc(r.note) + '</small></td><td>' + esc(O.ruDate(r.date)) + '</td><td>' + money(r.amount) + '</td><td><button data-spvoid="' + esc(r.id) + '">Отменить</button></td></tr>'; }))) + history(o, 'actual');
 }
 function rowDescription(row) { return row ? row.kind ? (row.L ? n(row.L) + ' мм · ' : '') + n(row.qty) + ' шт.' : n(row.L) + ' × ' + n(row.W) + ' × ' + n(row.th) + ' мм · ' + row.material + ' · ' + n(row.qty) + ' шт.' : '—'; }
 function changesHtml(o) {
  var r = review[o.id], p = F.fix(o);
  var h = '<p class="mute">Выберите изделие и файл новой выгрузки. Сравнение не заменяет текущую модель.</p><div class="spForm"><label>Изделие<select id="spVersionItem">' + o.items.map(function (it, i) { return '<option value="' + i + '"' + (r && r.item === i ? ' selected' : '') + '>' + esc(it.title || U.baseOf(it.path)) + '</option>'; }).join('') + '</select></label></div><div class="spActions">' + button('compare', 'Сравнить с новой выгрузкой…', true) + '</div>';
  if (r) {
   var counts = { added: 0, removed: 0, changed: 0 }; r.diff.forEach(function (c) { counts[c.kind]++; });
   h += '<p>Добавлено ' + counts.added + ' · Изменено ' + counts.changed + ' · Удалено ' + counts.removed + '</p>' +
    (r.diff.length ? table(['Деталь', 'Изменение', 'Было', 'Стало'], r.diff.map(function (c, i) { return '<tr><td><button class="link" data-spchange="' + i + '">' + esc(c.name) + '</button></td><td>' + esc(c.fields.join(', ')) + '</td><td>' + esc(rowDescription(c.before)) + '</td><td>' + esc(rowDescription(c.after)) + '</td></tr>'; })) : empty('Изменений деталей не найдено.')) +
    '<p class="note warn">Новая версия ещё не применена. После принятия проверьте раскрой, смету, обеспечение и задание в цех. Автоматическое сопоставление — по пути, позиции, обозначению и имени детали.</p><div class="spActions">' + button('apply-version', 'Применить и пересчитать', true) + button('discard-version', 'Оставить текущую версию') + '</div>';
  }
  return panel('Изменения после выгрузки', h) + panel('Принятые версии', p.versions.length ? p.versions.slice().reverse().map(function (v) { return '<p>' + esc(dateTime(v.at)) + ' · ' + esc(v.title) + ' · изменений: ' + v.count + '<small class="mute"> · предыдущий файл сохранён</small></p>'; }).join('') : empty('Принятых новых версий пока нет.'));
 }
 X.productionHtml = function (o) {
  return (F.fix(o).needsReview ? '<p class="note warn">Принята новая модель. Проверьте раскрой, смету и обеспечение; задание цеху сформируйте заново.</p>' : '') + ({ supply: supplyHtml, job: jobHtml, production: operationHtml, fact: factHtml, changes: changesHtml })[X.tab](o);
 };
 X.productionSideHtml = function (o) {
  var p = F.fix(o);
  if (X.tab === 'production') {
   var op = currentOperation(o);
   return '<h2>' + esc(op.name) + '</h2>' + state(op.status) + '<div class="spForm">' + field('spWho', 'Ответственный', op.who) + field('spDue', 'Срок', op.due, 'date') + '<label>Примечание<textarea id="spOpNote" rows="4">' + esc(op.note) + '</textarea></label></div><div class="soBtns">' + button('operation-save', 'Сохранить сведения') + button(op.status === 'wait' ? 'operation-start' : op.status === 'work' ? 'operation-done' : 'operation-reopen', op.status === 'wait' ? 'Начать операцию' : op.status === 'work' ? 'Завершить операцию' : 'Вернуть в работу', true) + '</div>';
  }
  if (X.tab === 'supply') {
   var r = currentMaterial(o);
   return '<h2>' + esc(r ? r.name : 'Обеспечение') + '</h2>' + (r ? '<div class="soR">Потребность <b>' + n(r.need) + ' ' + esc(r.unit) + '</b></div><div class="soR">В резерве <b>' + n(r.reserved) + '</b></div><div class="soR">Докупить <b>' + n(r.buy) + '</b></div><p class="mute">К закупке с округлением базы: ' + n(r.purchaseQty) + ' ' + esc(r.unit) + '</p>' : '') + '<div class="soBtns">' + button('purchase', 'Заказать недостающее', true) + button('receive', 'Принять материал') + button('stock', 'Подобрать остатки') + '</div><p class="mute">«Заказать» создаёт документ заявки. Приход оформляется после получения материала.</p>';
  }
  if (X.tab === 'job') {
   var opt = p.jobOptions;
   return '<h2>Передача в производство</h2><div class="spForm">' + field('spJobWho', 'Ответственный', opt.who) + field('spJobDue', 'Срок', opt.due, 'date') + '<label>Примечание<textarea id="spJobNote" rows="3">' + esc(opt.note) + '</textarea></label>' + [['maps', 'Включить карты раскроя'], ['edges', 'Включить кромку и присадку'], ['notes', 'Включить примечания']].map(function (x) { return '<label class="spCheck"><input id="spJob-' + x[0] + '" type="checkbox"' + (opt[x[0]] ? ' checked' : '') + '>' + x[1] + '</label>'; }).join('') + '</div><div class="soBtns">' + button('job-create', 'Сформировать задание', true) + button('job-pdf', 'Сохранить PDF') + '</div>';
  }
  if (X.tab === 'fact') return '<h2>Учёт расходов</h2><div class="soBtns">' + button('actual', 'Добавить фактический расход', true) + button('freeze-plan', p.plan ? 'Обновить план…' : 'Зафиксировать план') + button('stock', 'Учесть остаток на складе') + '</div><p class="mute">План сохраняется отдельно. Пересчёт сметы сам по себе его не изменяет. Для завершённой статьи без расходов можно внести 0 ₽ с пояснением.</p>';
  var r = review[o.id], c = r && r.diff[selected[o.id + ':change'] || 0];
  return '<h2>' + esc(c ? c.name : 'Сравнение версий') + '</h2>' + (c ? '<div class="spCompare">' + [c.before, c.after].map(function (x, i) { return '<div><b>' + (i ? 'Стало' : 'Было') + '</b>' + (x ? '<svg viewBox="0 0 100 100" aria-hidden="true"><rect x="12" y="12" width="76" height="76" rx="2" fill="currentColor" fill-opacity=".12" stroke="currentColor"/></svg>' : '') + '<p>' + esc(rowDescription(x)) + '</p></div>'; }).join('') + '</div><p class="mute">Схематическое обозначение детали. ' + esc(c.fields.join(', ')) + '</p>' : '<p class="mute">Откройте новую выгрузку для сравнения. Предыдущий файл сохраняется при принятии версии.</p>');
 };
 var render = X.render;
 X.render = async function () {
  var o = X.book && O.order(X.book, X.cur);
  if (o && X.sgFocusOrder && (X.tab === 'supply' || X.tab === 'job')) await supply(o);
  return render.apply(this, arguments);
 };
 async function save(o, mutate) {
  var before = clone(F.fix(o));
  try { var value = mutate(); await X.flush(); return value; } catch (e) { o.production = before; throw e; }
 }
 function stockEdit(fn) {
  var result = window.STHStock.pending.then(async function () {
   await window.MatBase.refresh();
   if (!MB.cur || !window.MatBase.path) throw new Error('Выберите базу материалов');
   var before = clone(MB.cur);
   try { var value = fn(MB.cur); await window.MatBase.saveBase(); return value; } catch (e) { MB.cur = before; throw e; }
  });
  window.STHStock.pending = result.catch(function () {}); return result;
 }
 function requireSupply(o) {
  var d = data[o.id];
  if (!d || d.error || d.result.bad.length || d.result.miss.length || d.rows.some(function (r) { return r.missing; })) throw new Error('Обеспечение неполное. Исправьте замечания и обновите расчёт.');
  return d;
 }
 function documentHtml(title, body) {
  return '<!doctype html><html lang="ru"><meta charset="utf-8"><title>' + esc(title) + '</title><style>@page{size:A4;margin:14mm}*{box-sizing:border-box}body{font:12px/1.5 "Segoe UI",Arial;color:#24272c}header{border-bottom:3px solid #f47721;padding-bottom:12px;margin-bottom:20px}.logo{font-size:26px;font-weight:800}.logo b{color:#f47721}h1{font-size:21px}h3{margin:22px 0 8px}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{padding:8px;border-bottom:1px solid #ddd;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:#f2f3f4}small{display:block;color:#777}.spJobMap{break-before:page}.spJobMap svg{width:100%;height:auto;max-height:235mm}.spActions{display:none}tr{break-inside:avoid}thead{display:table-header-group}</style><header><div class="logo">STH<b>Group</b></div><h1>' + esc(title) + '</h1></header>' + body + '</html>';
 }
 async function preview(title, html, o) {
  var choice = await U.modal({ title: title, width: 960, body: '<iframe id="spPreview" title="Предпросмотр документа" style="width:100%;height:70vh;border:0;background:white"></iframe>',
   buttons: [{ label: 'Закрыть', value: null }, { label: 'Печать', run: function (m) { m.querySelector('#spPreview').contentWindow.print(); return false; } }, { label: 'Сохранить PDF', primary: true, value: 'pdf' }],
   onOpen: function (el) { el.querySelector('#spPreview').srcdoc = html; } });
  if (choice === 'pdf') await pdf(title, html, o);
 }
 async function pdf(title, html, o) {
  var path = await U.pick({ kind: 'save', title: 'Сохранить PDF', dir: S().set.sthDocsDir || X.orderDir(o), name: title.replace(/[\\/:*?"<>|]+/g, ' ') + '.pdf', filters: [{ name: 'PDF', ext: ['pdf'] }] });
  if (!path) return; if (!/\.pdf$/i.test(path)) path += '.pdf';
  await U.api.pdf(html, path); U.toast('Документ сохранён', { actions: [{ label: 'Открыть', run: function () { U.api.open(path).catch(U.error); } }] });
 }
 async function projectOf(it) {
  var s = S(), at = window.App.tabOf(it.path);
  if (s.path === it.path && s.st) return s.st;
  if (at >= 0 && s.tabs[at] && s.tabs[at].st) return s.tabs[at].st;
  return P.build(JSON.parse(await U.api.readText(it.path)), s.set);
 }
 async function mapsOf(o) {
  var maps = [];
  for (var i = 0; i < o.items.length; i++) {
   var st = await projectOf(o.items[i]);
   st.mats.forEach(function (m) {
    if (!m.cfg.on) return;
    if (!st.work.layout[m.key] || P.isStale(st, m)) throw new Error('Сначала выполните и сохраните раскрой: ' + o.items[i].title);
    if (P.verify(st, m.key).length) throw new Error('Проверьте раскрой: ' + o.items[i].title);
    st.work.layout[m.key].sheets.forEach(function (sh, j) { maps.push({ title: o.items[i].title + ' · ' + P.matTitle(m) + ' · лист ' + (j + 1), svg: BM.draw.sheet(st, m, sh, { wmm: 180, uid: 'job' + maps.length, font: 'Segoe UI,Arial,sans-serif' }) }); });
   });
  } return maps;
 }
 async function act(action, o) {
  var p = F.fix(o), el = function (id) { return document.getElementById(id); }, d, r;
  if (action === 'stock') { window.STHStock.view = 'off'; X.go('stock'); return; }
  if (action === 'refresh') { await supply(o); return; }
  if (action === 'reserve') {
   await supply(o); d = requireSupply(o);
   await stockEdit(function (b) { var rows = F.supply(b, o, d.result); rows.forEach(function (row) { if (row.available > 0) SK.reserve(b, row.mat, row.available, o); }); }); U.toast('Доступные материалы зарезервированы'); return;
  }
  if (action === 'purchase') {
   await supply(o); d = requireSupply(o);
   var docs = await save(o, function () { return F.purchase(MB.cur, o, d.rows); });
   if (!docs.length) { U.toast('Недостающих материалов нет'); return; }
   await purchasePreview(o, docs[0]); return;
  }
  if (action === 'receive') {
   r = currentMaterial(o); if (!r || r.missing) throw new Error('Выберите материал');
   var receipt = await U.modal({ title: 'Принять: ' + r.name, width: 460, body: '<p>Приход на склад и резерв под заказ ' + esc(o.no) + '.</p><div class="spForm">' + field('spQty', 'Получено, ' + r.unit, r.buy || 1) + field('spPrice', 'Цена за единицу, ₽', r.price) + field('spReceiptNote', 'Поставщик / накладная', '') + '</div>', buttons: [{ label: 'Отмена', value: null }, { label: 'Принять', primary: true, run: function (m) {
    var qty = O.num(m.querySelector('#spQty').value, NaN), price = O.num(m.querySelector('#spPrice').value, NaN);
    if (!(Number.isFinite(qty) && qty > 0 && Number.isFinite(price) && price >= 0)) { U.toast('Проверьте количество и цену'); return false; }
    return { qty: qty, price: price, note: m.querySelector('#spReceiptNote').value };
   } }] });
   if (receipt) { await stockEdit(function (b) { F.receive(b, o, r.mat, receipt.qty, receipt.price, receipt.note); }); U.toast('Материал принят и зарезервирован'); } return;
  }
  if (action.indexOf('operation-') === 0) {
   var op = currentOperation(o), changes = { who: el('spWho').value, due: el('spDue').value, note: el('spOpNote').value };
   if (action !== 'operation-save') changes.status = action === 'operation-done' ? 'done' : 'work';
   await save(o, function () { F.updateOperation(o, op.id, changes); }); return;
  }
  if (action === 'freeze-plan') {
   if (!o.items.length || o.items.some(function (it) { return !it.snap; })) throw new Error('Сначала посчитайте изделия');
   if (p.plan && !(await U.confirm('Обновить план', 'Заменить сохранённый план текущим расчётом заказа? Фактические расходы останутся.', 'Обновить'))) return;
   await save(o, function () { F.freezePlan(X.book, o, !!p.plan); }); return;
  }
  if (action === 'actual') {
   var cost = await U.modal({ title: 'Фактический расход', width: 480, body: '<div class="spForm"><label>Статья<select id="spCostCategory">' + F.CATEGORIES.map(function (c) { return '<option value="' + c[0] + '">' + c[1] + '</option>'; }).join('') + '</select></label>' + field('spCostAmount', 'Сумма, ₽', '') + field('spCostNote', 'Расход / причина отклонения', '') + field('spCostDate', 'Дата', O.today(), 'date') + '</div>', buttons: [{ label: 'Отмена', value: null }, { label: 'Добавить', primary: true, run: function (m) {
    var row = { category: m.querySelector('#spCostCategory').value, amount: m.querySelector('#spCostAmount').value, note: m.querySelector('#spCostNote').value, date: m.querySelector('#spCostDate').value };
    if (!row.note.trim() || !row.amount.trim() || !(O.num(row.amount, -1) >= 0)) { U.toast('Укажите сумму не меньше нуля и пояснение'); return false; } return row;
   } }] });
   if (cost) await save(o, function () { F.addActual(o, cost); }); return;
  }
  if (action === 'job-create') {
   var options = { who: el('spJobWho').value, due: el('spJobDue').value, note: el('spJobNote').value };
   ['maps', 'edges', 'notes'].forEach(function (k) { options[k] = el('spJob-' + k).checked; });
   if (!options.who.trim() || !options.due) throw new Error('Укажите ответственного и срок');
   await supply(o); d = requireSupply(o);
   for (var i = 0; i < o.items.length; i++) o.items[i].snap = await X.snapFile(o.items[i].path);
   var maps = options.maps ? await mapsOf(o) : [];
   await save(o, function () {
    p.jobOptions = options;
    p.operations.forEach(function (op) { if (!op.who) op.who = options.who; if (!op.due) op.due = options.due; });
    var job = F.job(X.book, o, d.rows, maps); p.needsReview = false; return job;
   }); return;
  }
  if (action === 'job-pdf' || action === 'job-preview') {
   var job = p.jobs[p.jobs.length - 1]; if (!job) throw new Error('Сначала сформируйте задание');
   var title = 'Задание в цех ' + o.no + ' № ' + job.no, html = documentHtml(title, jobBody(job));
   if (action === 'job-pdf') await pdf(title, html, o); else await preview(title, html, o); return;
  }
  if (action === 'compare') {
   var item = Number(el('spVersionItem').value), it = o.items[item]; if (!it) throw new Error('Добавьте изделие');
   var path = await U.pick({ kind: 'open', title: 'Новая выгрузка для сравнения', dir: U.dirOf(it.path), filters: [{ name: 'Проект STHGroup', ext: ['bmk'] }] });
   if (!path) return;
   if (String(path).replace(/\\/g, '/').toLowerCase() === String(it.path).replace(/\\/g, '/').toLowerCase()) throw new Error('Для сравнения сохраните новую выгрузку отдельным файлом, не поверх текущего изделия.');
   var raw = await U.api.readText(path), doc = JSON.parse(raw);
   if (doc.format !== BM.FORMAT || !doc.model || !Array.isArray(doc.model.parts)) throw new Error('Выберите файл проекта STHGroup');
   var before = it.snap && it.snap.modelVersion || F.modelSnapshot(await projectOf(it)), after = F.modelSnapshot(P.build(doc, S().set));
   review[o.id] = { item: item, originalPath: it.path, source: path, raw: raw, before: before, after: after, diff: F.diff(before, after) }; return;
  }
  if (action === 'discard-version') { delete review[o.id]; return; }
  if (action === 'apply-version') {
   r = review[o.id]; if (!r) throw new Error('Сначала сравните новую выгрузку');
   var item0 = o.items[r.item]; if (!item0 || item0.path !== r.originalPath) throw new Error('Состав заказа изменился. Повторите сравнение');
   if (await U.api.readText(r.source) !== r.raw) throw new Error('Новый файл изменился. Повторите сравнение');
   var destination = U.join(U.join(X.orderDir(o), O.id('version-')), U.baseOf(r.source));
   var response = await fetch('/api/sth/copy', { method: 'POST', headers: { 'X-BM-Token': new URLSearchParams(location.search).get('t') || '', 'Content-Type': 'application/json' }, body: JSON.stringify({ src: r.source, dst: destination }) });
   var result = await response.json(); if (!response.ok || result.error) throw new Error(result.error || 'Не удалось скопировать модель');
   var snap = await X.snapFile(destination, true), oldItem = clone(item0);
   try {
    await save(o, function () {
     item0.path = destination; item0.src = r.source; item0.snap = snap;
     p.versions.push({ id: O.id('v'), at: new Date().toISOString(), title: item0.title, previous: oldItem.path, path: destination, count: r.diff.length, before: r.before, after: r.after });
     p.needsReview = true; F.log(o, 'version', 'Принята новая версия модели: ' + item0.title + '. Проверьте раскрой, смету и обеспечение.');
    });
   } catch (e) { Object.assign(item0, oldItem); throw e; }
   delete review[o.id]; delete data[o.id];
   await X.openModels(o, r.item); U.toast('Новая версия принята. Предыдущая модель сохранена. Проверьте раскрой и смету.'); return;
  }
 }
 async function purchasePreview(o, p) {
  var supplier = MB.cur && MB.supplier(MB.cur, p.supplier), title = 'Заявка поставщику · ' + o.no;
  var body = '<p>Поставщик: ' + esc(supplier ? supplier.name : 'Не указан') + '</p><p>Заявка от ' + esc(dateTime(p.at)) + '. Количество округлено по правилам базы.</p>' + table(['Материал / артикул', 'Количество', 'Цена', 'Сумма'], p.lines.map(function (r) { return '<tr><td>' + esc(r.name) + '<small>' + esc(r.art) + '</small></td><td>' + n(r.qty) + ' ' + esc(r.unit) + '</td><td>' + money(r.price) + '</td><td>' + money(O.r2(r.qty * r.price)) + '</td></tr>'; })) + '<p>Итого: ' + money(O.r2(p.lines.reduce(function (s, r) { return s + r.qty * r.price; }, 0))) + '</p>';
  await preview(title, documentHtml(title, body), o);
 }
 document.getElementById('orders').addEventListener('click', async function (e) {
  var target = e.target.closest('[data-sp],[data-spop],[data-spmat],[data-spchange],[data-spoff],[data-spvoid],[data-sppurchase],[data-spjob]');
  if (!target || busy) return;
  var o = X.book && O.order(X.book, X.cur); if (!o) return;
  busy = true; target.disabled = true;
  try {
   if (target.hasAttribute('data-spop')) selected[o.id] = target.dataset.spop;
   else if (target.hasAttribute('data-spmat')) selected[o.id + ':mat'] = target.dataset.spmat;
   else if (target.hasAttribute('data-spchange')) selected[o.id + ':change'] = Number(target.dataset.spchange);
   else if (target.hasAttribute('data-spoff')) { await stockEdit(function (b) { if (!SK.reserveOff(b, target.dataset.spoff, o)) throw new Error('Остаток уже недоступен'); }); }
   else if (target.hasAttribute('data-spvoid')) { if (await U.confirm('Отменить расход', 'Отменить запись фактического расхода? Она останется в истории.', 'Отменить расход')) await save(o, function () { F.removeActual(o, target.dataset.spvoid); }); }
   else if (target.hasAttribute('data-sppurchase')) { var purchase = F.fix(o).purchases.find(function (x) { return x.id === target.dataset.sppurchase; }); if (purchase) await purchasePreview(o, purchase); }
   else if (target.hasAttribute('data-spjob')) { var job = F.fix(o).jobs.find(function (x) { return x.id === target.dataset.spjob; }); if (job) await preview('Задание в цех ' + o.no + ' № ' + job.no, documentHtml('Задание в цех ' + o.no + ' № ' + job.no, jobBody(job)), o); }
   else await act(target.dataset.sp, o);
   if (S().section === 'orders' && X.cur === o.id) await X.render();
  } catch (error) { U.error(error); }
  finally { busy = false; if (target.isConnected) target.disabled = false; }
 });
})();
