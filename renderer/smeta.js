/* Модуль «Смета»: база материалов (дерево групп, карточки, наценки, импорт и экспорт) и смета заказа. */
(function () {
  'use strict';
  var MB = Core.materialbase, LP = Core.linkparse, P = Core.pricing;

  function create(kit) {
    var state = kit.state, esc = kit.esc, money = kit.money;
    state.smeta = { groupId: '', search: '', sub: true, open: {}, sel: {} };
    var LIMIT = 300;

    function S() { return state.smeta; }
    function B() { return state.mb; }
    function $(sel) { return document.querySelector(sel); }
    var collator = new Intl.Collator('ru', { numeric: true });
    function byName(a, b) { return collator.compare(String(a.name), String(b.name)); }
    function pr(v) { return v === '' || v === undefined || v === null ? '—' : money(v); }
    function save() { kit.saveBase(); }
    function groupLabel(g) { return MB.groupPath(B(), g.id).join(' / '); }
    function groupOptions(exceptId, withRoot) {
      var skip = exceptId ? MB.descendantIds(B(), exceptId) : [];
      var opts = withRoot ? [['', '— верхний уровень —']] : [];
      B().groups.filter(function (g) { return skip.indexOf(g.id) < 0; })
        .map(function (g) { return [g.id, groupLabel(g)]; })
        .sort(function (a, b) { return a[1].localeCompare(b[1], 'ru', { numeric: true }); })
        .forEach(function (o) { opts.push(o); });
      return opts;
    }
    function typeOptions(inherit) {
      var o = inherit ? [['', 'как у родительской группы']] : [];
      Object.keys(MB.GROUP_TYPES).forEach(function (k) { o.push([k, MB.GROUP_TYPES[k]]); });
      return o;
    }
    function markupOptions() { return Object.keys(MB.MARKUP_MODES).map(function (k) { return [k, MB.MARKUP_MODES[k]]; }); }
    function unitOptions(cur) {
      var u = MB.UNITS.slice(); if (cur && u.indexOf(cur) < 0) u.push(cur);
      return u.map(function (x) { return [x, x]; });
    }
    function markupText(m) {
      var r = MB.markupRule(B(), m);
      if (r.mode === 'percent') return '+' + r.value + '%';
      if (r.mode === 'mul') return '×' + r.value;
      if (r.mode === 'add') return '+' + r.value;
      if (r.mode === 'fixed') return 'фикс.';
      return '';
    }

    // ---------- дерево групп ----------
    function directCounts() {
      var c = {}; B().materials.forEach(function (m) { c[m.groupId] = (c[m.groupId] || 0) + 1; }); return c;
    }
    function totalCount(gid, c) {
      var n = c[gid] || 0; MB.children(B(), gid).forEach(function (k) { n += totalCount(k.id, c); }); return n;
    }
    function treeHtml(pid, depth, c) {
      return MB.children(B(), pid).sort(byName).map(function (g) {
        var kids = MB.children(B(), g.id).length, open = !!S().open[g.id];
        return '<div class="tr-item' + (S().groupId === g.id ? ' sel' : '') + '" style="padding-left:' + (6 + depth * 16) + 'px" data-act="sm-group" data-id="' + g.id + '">' +
          '<span class="tg" data-act="sm-toggle" data-id="' + g.id + '">' + (kids ? (open ? '▾' : '▸') : '·') + '</span>' +
          '<span class="nm">' + esc(g.name) + '</span><span class="cnt">' + totalCount(g.id, c) + '</span></div>' +
          (kids && open ? treeHtml(g.id, depth + 1, c) : '');
      }).join('');
    }

    // ---------- главное окно ----------
    function visibleList() {
      var s = S(), b = B();
      var list = MB.search(b, { text: s.search, groupId: s.groupId || '' });
      if (s.groupId && !s.sub) list = list.filter(function (m) { return m.groupId === s.groupId; });
      return list.sort(byName);
    }
    function bulkHtml() {
      var n = Object.keys(S().sel).length;
      if (!n) return '';
      return '<div class="bulk"><b>Выбрано: ' + n + '</b>' +
        '<button class="btn ghost sm" data-act="sm-bulk-move">Переместить…</button>' +
        '<button class="btn ghost sm" data-act="sm-bulk-markup">Наценка…</button>' +
        '<button class="btn ghost sm" data-act="sm-bulk-copy">Копировать</button>' +
        '<button class="btn danger sm" data-act="sm-bulk-del">Удалить</button>' +
        '<button class="btn ghost sm" data-act="sm-sel-clear">Снять выбор</button></div>';
    }
    function view() {
      var s = S(), b = B(), mi = state.matInfo || {};
      var counts = directCounts();
      var list = visibleList(), shown = list.slice(0, S().limit || LIMIT);
      var g = s.groupId ? MB.groupById(b, s.groupId) : null;
      var allSel = shown.length && shown.every(function (m) { return s.sel[m.id]; });
      var rows = shown.map(function (m) {
        var dims = [m.sheetW, m.sheetH, m.thickness].filter(function (x) { return x !== '' && x !== undefined && Number(x) !== 0; }).map(esc).join('×');
        var rule = MB.markupRule(b, m), coef = rule.mode === 'mul' ? rule.value : '';
        var sell = MB.sellPrice(b, m);
        return '<tr' + (m.inStock === false ? ' class="nostock"' : '') + '>' +
          '<td style="width:26px"><input type="checkbox" data-act="sm-sel" data-id="' + m.id + '"' + (s.sel[m.id] ? ' checked' : '') + '></td>' +
          '<td class="small">' + esc(m.article || '') + '</td>' +
          '<td class="click" data-act="sm-edit" data-id="' + m.id + '"><b>' + esc(m.name || '(без названия)') + '</b>' + (s.search && !s.groupId ? '<div class="small muted">' + esc(MB.groupPath(b, m.groupId).slice(-2).join(' / ')) + '</div>' : '') + '</td>' +
          '<td>' + esc(m.unit || '') + '</td><td class="num">' + pr(m.priceBuy) + '</td>' +
          '<td class="num small">' + (coef !== '' ? esc(coef) : esc(markupText(m))) + '</td>' +
          '<td class="num"><b>' + pr(sell || '') + '</b></td>' +
          '<td class="small">' + dims + '</td><td class="small">' + esc(m.classes || '') + '</td>' +
          '<td>' + (m.inStock === false ? '<span class="badge cancel">нет</span>' : '') + '</td></tr>';
      }).join('');
      var head = g ? esc(groupLabel(g)) + ' <span class="muted small">(' + MB.GROUP_TYPES[MB.groupType(b, g.id)] + ')</span>' : 'Все материалы';
      return '<div class="row sp"><h1>Смета: база материалов</h1><div class="row">' +
        '<button class="btn primary" data-act="sm-from-link">Добавить по ссылке</button>' +
        '<button class="btn" data-act="sm-new">+ Материал</button>' +
        '<button class="btn ghost" data-act="sm-import">Импорт XML/CSV…</button>' +
        '<button class="btn ghost" data-act="sm-prices">Цены из файла…</button>' +
        '<button class="btn ghost" data-act="sm-export">Экспорт…</button>' +
        '<button class="btn ghost" data-act="sm-dups">Дубликаты</button></div></div>' +
        (mi.error ? '<div class="warns bad">' + esc(mi.error) + '</div>' : '') +
        '<div class="sm-layout"><div class="card sm-tree"><div class="row sp" style="margin-bottom:6px"><b>Группы</b>' +
        '<span><button class="btn ghost sm" data-act="sm-group-new">+ Группа</button></span></div>' +
        '<div class="tr-item' + (!s.groupId ? ' sel' : '') + '" data-act="sm-group" data-id=""><span class="tg">◆</span><span class="nm">Все материалы</span><span class="cnt">' + b.materials.length + '</span></div>' +
        treeHtml('', 0, counts) +
        (g ? '<div class="row" style="margin-top:10px;gap:6px"><button class="btn ghost sm" data-act="sm-group-sub">+ Подгруппа</button><button class="btn ghost sm" data-act="sm-group-edit">Свойства…</button><button class="btn danger sm" data-act="sm-group-del">Удалить</button></div>' : '') + '</div>' +
        '<div><div class="row sp" style="margin-bottom:8px"><div class="row"><b>' + head + '</b></div>' +
        '<div class="row"><input id="sm-search" placeholder="Поиск: артикул, название, класс" value="' + esc(s.search) + '" style="width:300px">' +
        (g ? '<label class="chk small"><input type="checkbox" data-s="smsub"' + (s.sub ? ' checked' : '') + '> с подгруппами</label>' : '') + '</div></div>' +
        '<div id="sm-bulk">' + bulkHtml() + '</div>' +
        (list.length ? '<div class="tbl-wrap"><table><thead><tr><th><input type="checkbox" data-act="sm-selall"' + (allSel ? ' checked' : '') + '></th><th>Артикул</th><th>Наименование</th><th>Ед.</th><th class="num">Цена, ₽</th><th class="num">Коэф.</th><th class="num">Продажа, ₽</th><th>Длина×Ширина×Толщ.</th><th>Класс</th><th>Нал.</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
          (list.length > shown.length ? '<p class="muted small">Показано ' + shown.length + ' из ' + list.length + '. <button class="btn ghost sm" data-act="sm-more">Показать ещё 500</button> или уточните поиск / выберите группу.</p>' : '')
          : '<div class="card empty">Материалов нет. Добавьте по ссылке, вручную или импортируйте XML выгрузки Базиса.</div>') +
        '<p class="muted small">Файл базы: <code>' + esc(mi.path || '') + '</code> <a href="#" data-act="mat-show">показать</a>. Резервная копия — раз в день.</p></div></div>';
    }

    // ---------- карточка материала ----------
    function fieldsForCard(m, miss) {
      miss = miss || [];
      var b = B(), mk = m.markup || { mode: 'inherit' };
      var hist = (m.history || []).slice(-8).reverse().map(function (h) {
        return '<tr><td>' + new Date(h.d).toLocaleDateString('ru-RU') + '</td><td class="num">' + money(h.buy) + '</td><td class="num">' + money(h.sell) + '</td><td class="small muted">' + esc(h.src || '') + '</td></tr>';
      }).join('');
      var F = function (k, label, type, extra) { return Object.assign({ k: k, label: label, type: type, value: m[k] === undefined ? '' : m[k], miss: miss.indexOf(k) >= 0 }, extra || {}); };
      return [
        F('name', 'Наименование', 'text', { full: true }),
        { k: 'groupId', label: 'Группа', type: 'select', options: groupOptions('', false), value: m.groupId },
        F('article', 'Артикул'), F('code', 'Код'), F('syncId', 'Идентификатор для синхронизации'),
        { k: 'unit', label: 'Единица', type: 'select', options: unitOptions(m.unit), value: m.unit || 'шт.' },
        F('supplier', 'Поставщик / магазин'), F('classes', 'Класс (через запятую)'),
        F('priceBuy', 'Закупочная цена, ₽', 'number'),
        { k: 'mmode', label: 'Наценка', type: 'select', options: markupOptions(), value: mk.mode || 'inherit' },
        { k: 'mval', label: 'Значение наценки (%, коэффициент или ₽)', type: 'number', value: mk.value === undefined ? '' : mk.value },
        F('priceSell', 'Продажная цена вручную, ₽ (если наценка «нет»)', 'number'),
        { type: 'info', html: 'По правилу сейчас: <b>' + money(MB.sellPrice(b, m)) + ' ₽</b> ' + (markupText(m) ? '(' + esc(markupText(m)) + ')' : '') },
        F('servicePrice', 'Цена работы, ₽ (распил за м², кромление за м.п.)', 'number'),
        F('thickness', 'Толщина, мм', 'number'), F('sheetW', 'Длина листа, мм', 'number'), F('sheetH', 'Ширина листа, мм', 'number'),
        F('excess', 'Коэффициент избытка', 'number'),
        { k: 'grain', label: 'Текстура (запрет поворота)', type: 'checkbox', value: !!m.grain },
        { k: 'inStock', label: 'В наличии', type: 'checkbox', value: m.inStock !== false },
        F('url', 'Ссылка на товар', 'text', { full: true }),
        F('note', 'Примечание', 'textarea', { full: true }),
        { type: 'info', html: hist ? '<b>История цен</b><table class="mini"><thead><tr><th>Дата</th><th class="num">Закупка</th><th class="num">Продажа</th><th></th></tr></thead><tbody>' + hist + '</tbody></table>' : '<span class="muted small">История цен появится после сохранения.</span>' }
      ];
    }
    function openCard(m, isNew, miss) {
      openModal2({
        title: isNew ? 'Новый материал' : 'Материал', wide: true, submitLabel: 'Сохранить',
        extra: (isNew ? '' : '<button type="button" class="btn danger" data-act="sm-del-one" data-id="' + m.id + '" style="margin-right:auto">Удалить</button><button type="button" class="btn ghost" data-act="sm-copy-one" data-id="' + m.id + '">Копия</button>') +
          '<button type="button" class="btn ghost" data-act="sm-card-link">Обновить по ссылке</button>',
        fields: fieldsForCard(m, miss),
        onSubmit: function (v) {
          if (!String(v.name).trim()) { kit.toast('Укажите наименование', true); return false; }
          ['name', 'article', 'code', 'syncId', 'supplier', 'classes', 'url', 'note'].forEach(function (k) { m[k] = String(v[k]).trim(); });
          m.groupId = v.groupId; m.unit = v.unit;
          ['priceBuy', 'priceSell', 'servicePrice', 'thickness', 'sheetW', 'sheetH', 'excess'].forEach(function (k) {
            m[k] = String(v[k]).trim() === '' ? '' : MB.num(v[k]);
          });
          m.markup = { mode: v.mmode, value: String(v.mval).trim() === '' ? '' : MB.num(v.mval) };
          m.grain = !!v.grain; m.inStock = !!v.inStock; m.updated = new Date().toISOString();
          if (isNew) B().materials.push(m);
          MB.recordPrice(B(), m, isNew ? 'создан' : 'правка');
          save(); kit.render();
        }
      });
    }

    // ---------- по ссылке ----------
    function startFromLink() {
      var gid = S().groupId || (B().groups[0] || {}).id || '';
      openModal2({
        title: 'Добавить по ссылке', submitLabel: 'Прочитать страницу',
        text: 'Вставьте ссылку на товар. Программа прочитает название, артикул, цену и магазин. Чего не нашлось, будет подсвечено жёлтым.',
        fields: [{ k: 'url', label: 'Ссылка', type: 'text' }, { k: 'groupId', label: 'В какую группу', type: 'select', options: groupOptions('', false), value: gid }],
        onSubmit: function (v) {
          var url = String(v.url).trim();
          if (!/^https?:\/\//i.test(url)) { kit.toast('Ссылка должна начинаться с http:// или https://', true); return false; }
          readLink(url, v.groupId); return false;
        }
      });
    }
    function finishLink(parsed, url, gid) {
      var f = parsed.fields, b = B(), kind = MB.groupType(b, gid);
      var m = MB.newMaterial(gid, {
        name: f.name || '', article: f.article || '', priceBuy: f.priceBuy === undefined ? '' : f.priceBuy, supplier: f.supplier || '', url: url,
        note: f.note || '', thickness: f.thickness || '', sheetW: f.sheetW || '', sheetH: f.sheetH || '',
        unit: ({ sheet: 'лист', edge: 'м.п.', linear: 'м.п.', service: 'ч' })[kind] || 'шт.'
      });
      kit.closeModal();
      openCard(m, true, parsed.missing);
      kit.toast(parsed.missing.length ? 'Заполнено частично, жёлтые поля допишите вручную' : 'Данные прочитаны, проверьте карточку');
    }
    async function readLink(url, gid) {
      kit.toast('Читаю страницу…');
      var r = await window.api.fetchLink(url);
      if (r && r.ok) {
        var p = LP.parseProductHtml(r.html, r.url || url);
        if (p.fields.name || p.fields.priceBuy) { finishLink(p, url, gid); return; }
        r = { ok: false, error: 'На странице не нашлось данных о товаре (возможно, она строится скриптами)' };
      }
      kit.closeModal();
      openModal2({
        title: 'Страницу не удалось прочитать', submitLabel: 'Разобрать текст',
        text: esc((r && r.error) || 'Ошибка') + '.<br>Откройте страницу в браузере, выделите всё (Ctrl+A), скопируйте (Ctrl+C) и вставьте сюда. Можно вставить и исходный код страницы.',
        fields: [{ k: 'text', label: 'Текст страницы', type: 'textarea', value: '' }],
        onSubmit: function (v) {
          var t = String(v.text || '').trim();
          if (!t) { kit.toast('Вставьте текст', true); return false; }
          var p = /^\s*<(!doctype|html|head|body)/i.test(t) ? LP.parseProductHtml(t, url) : LP.parseProductText(t, url);
          finishLink(p, url, gid); return false;
        }
      });
    }
    async function cardRefreshFromLink() {
      var form = $('#modal-form'); if (!form || !form.elements.url) return;
      var url = form.elements.url.value.trim();
      if (!url) { kit.toast('В карточке нет ссылки', true); return; }
      kit.toast('Читаю страницу…');
      var r = await window.api.fetchLink(url);
      if (!r || !r.ok) { kit.toast((r && r.error) || 'Не удалось открыть страницу', true); return; }
      var p = LP.parseProductHtml(r.html, url), f = p.fields;
      if (!f.priceBuy && !f.name) { kit.toast('На странице не нашлось данных (возможно, она строится скриптами)', true); return; }
      function put(k, v, onlyEmpty) {
        var el = form.elements[k]; if (!el || v === undefined || v === '') return;
        if (onlyEmpty && String(el.value).trim() !== '') return; el.value = v;
        el.closest('label').classList.remove('miss');
      }
      put('priceBuy', f.priceBuy); put('name', f.name, true); put('article', f.article, true); put('supplier', f.supplier, true);
      kit.toast(f.priceBuy ? 'Цена обновлена: ' + money(f.priceBuy) + ' ₽. Нажмите «Сохранить»' : 'Цену найти не удалось, остальное проверьте');
    }

    // ---------- группы ----------
    function groupModal(g, isNew, parentId) {
      var mk = g.markup || { mode: 'inherit', value: '', round: 2 };
      openModal2({
        title: isNew ? 'Новая группа' : 'Группа', submitLabel: 'Сохранить', wide: true,
        fields: [
          { k: 'name', label: 'Название', type: 'text', value: g.name, full: true },
          { k: 'parentId', label: 'Родительская группа', type: 'select', options: groupOptions(isNew ? '' : g.id, true), value: isNew ? (parentId || '') : g.parentId },
          { k: 'type', label: 'Тип материалов', type: 'select', options: typeOptions(true), value: g.type || '' },
          { k: 'mode', label: 'Наценка на группу', type: 'select', options: markupOptions(), value: mk.mode || 'inherit' },
          { k: 'value', label: 'Значение (%, коэффициент или ₽)', type: 'number', value: mk.value === undefined ? '' : mk.value },
          { k: 'round', label: 'Округлять до знаков (0 — до рублей, −1 — до десятков)', type: 'number', value: mk.round === undefined ? 2 : mk.round },
          { k: 'reprice', label: 'Пересчитать продажные цены материалов группы', type: 'checkbox', value: true }
        ],
        onSubmit: function (v) {
          if (!String(v.name).trim()) { kit.toast('Укажите название', true); return false; }
          if (!isNew && !MB.moveGroup(B(), g.id, v.parentId)) { kit.toast('Группу нельзя поместить внутрь самой себя', true); return false; }
          g.name = String(v.name).trim(); g.type = v.type;
          g.markup = { mode: v.mode, value: String(v.value).trim() === '' ? '' : MB.num(v.value), round: String(v.round).trim() === '' ? 2 : MB.num(v.round) };
          if (isNew) { g.parentId = v.parentId; B().groups.push(g); S().open[v.parentId] = true; S().groupId = g.id; }
          var n = 0;
          if (v.reprice && v.mode !== 'inherit') n = MB.repriceGroup(B(), g.id, 'наценка группы');
          save(); kit.render(); if (n) kit.toast('Пересчитано материалов: ' + n);
        }
      });
    }

    // ---------- импорт и экспорт ----------
    async function pickRecords() {
      var r = await window.api.pickSmeta();
      if (!r) return null;
      if (r.error) { kit.toast(r.error, true); return null; }
      if (/\.xml$/i.test(r.name) && MB.isBazisXml(r.text)) return { name: r.name, bazis: true, text: r.text };
      var recs = /\.xml$/i.test(r.name) ? MB.xmlRecords(r.text) : MB.parseTable(r.text);
      if (!recs.length) {
        openModal2({ title: 'Не удалось прочитать файл', text: 'В файле «' + esc(r.name) + '» не найден список материалов. Для XML нужен список одинаковых элементов с полями внутри, для CSV — первая строка с названиями колонок.', fields: [], noSubmit: true, cancelLabel: 'Понятно' });
        return null;
      }
      return { name: r.name, recs: recs };
    }
    async function importFlow(pricesOnly) {
      var f = await pickRecords(); if (!f) return;
      if (f.bazis && !pricesOnly) {
        var cnt = (f.text.match(/<Material>/g) || []).length;
        openModal2({
          title: 'База из Базис-Мебельщика', submitLabel: 'Загрузить',
          text: 'Файл «' + esc(f.name) + '»: ' + cnt + ' позиций. Поля, группы и наценка (Коэф) переносятся как в Базисе; повторяющиеся артикулы не теряются.',
          fields: [{ k: 'mode', label: 'Как загрузить', type: 'select', options: [['replace', 'заменить всю базу (рекомендуется)'], ['add', 'добавить к имеющейся']], value: B().materials.length ? 'replace' : 'add' }],
          onSubmit: function (v) {
            var t0 = Date.now(), res = MB.importBazis(B(), f.text, { replace: v.mode === 'replace' });
            S().groupId = ''; S().sel = {}; save(); kit.render();
            kit.toast('Загружено: ' + res.added + ' позиций, групп: ' + res.groups + (res.skipped ? ', пропущено повторов: ' + res.skipped : '') + ' (' + ((Date.now() - t0) / 1000).toFixed(1) + ' с)');
          }
        });
        return;
      }
      openModal2({
        title: pricesOnly ? 'Обновить цены из файла' : 'Импорт материалов', submitLabel: pricesOnly ? 'Обновить цены' : 'Импортировать',
        text: 'Файл «' + esc(f.name) + '»: записей ' + f.recs.length + '.',
        fields: [
          { k: 'key', label: 'Искать совпадения по', type: 'select', options: [['either', 'артикулу или названию'], ['article', 'только артикулу'], ['name', 'только названию'], ['both', 'артикулу и названию'], ['sync', 'идентификатору']], value: pricesOnly ? 'article' : 'either' }
        ].concat(pricesOnly ? [] : [
          { k: 'onDup', label: 'Если материал уже есть', type: 'select', options: [['update', 'обновить'], ['skip', 'пропустить'], ['add', 'добавить как новый']], value: 'update' },
          { k: 'groupId', label: 'Куда класть записи без группы', type: 'select', options: [['', '08. Для разбора']].concat(groupOptions('', false)), value: S().groupId || '' }
        ]),
        onSubmit: function (v) {
          var res = MB.importRecords(B(), f.recs, pricesOnly ? { key: v.key, onDup: 'update', addNew: false, onlyPrice: true } : { key: v.key, onDup: v.onDup, groupId: v.groupId });
          save(); kit.render();
          kit.toast(pricesOnly ? 'Цены обновлены: ' + res.updated + ', не найдено: ' + res.noMatch : 'Добавлено: ' + res.added + ', обновлено: ' + res.updated + ', пропущено: ' + res.skipped);
        }
      });
    }
    function exportFlow() {
      var selN = Object.keys(S().sel).length;
      var scopes = [['all', 'вся база (' + B().materials.length + ')'], ['view', 'то, что показано в таблице (' + visibleList().length + ')']];
      if (selN) scopes.push(['sel', 'отмеченные (' + selN + ')']);
      openModal2({
        title: 'Экспорт', submitLabel: 'Сохранить файл',
        text: 'XML можно снова импортировать сюда или в Базис. CSV открывается в Excel.',
        fields: [{ k: 'fmt', label: 'Формат', type: 'select', options: [['xml', 'XML'], ['csv', 'CSV (Excel)']], value: 'xml' }, { k: 'scope', label: 'Что выгрузить', type: 'select', options: scopes, value: scopes[0][0] }],
        onSubmit: async function (v) {
          var list = v.scope === 'sel' ? B().materials.filter(function (m) { return S().sel[m.id]; }) : v.scope === 'view' ? visibleList() : B().materials;
          var content = v.fmt === 'csv' ? MB.toCsv(B(), list) : MB.toXml(B(), list);
          var r = await window.api.exportSmeta({ content: content, ext: v.fmt, name: 'Смета-база' });
          if (r && r.path) kit.toast('Сохранено: ' + r.path); else if (r && r.error) kit.toast(r.error, true);
        }
      });
    }
    function dupsFlow() {
      var groups = MB.findDuplicates(B(), 'article').concat(MB.findDuplicates(B(), 'name'));
      var seen = {}, uniq = groups.filter(function (g) { var k = g.slice().sort().join('|'); if (seen[k]) return false; seen[k] = 1; return true; });
      if (!uniq.length) { kit.toast('Дубликатов не найдено'); return; }
      var html = uniq.slice(0, 40).map(function (ids) {
        return '<div class="dup">' + ids.map(function (id) {
          var m = B().materials.find(function (x) { return x.id === id; });
          return '<div>' + esc(m.name) + ' <span class="muted small">' + esc(m.article || '') + ' · ' + esc(MB.groupPath(B(), m.groupId).join(' / ')) + '</span></div>';
        }).join('') + '</div>';
      }).join('');
      openModal2({
        title: 'Дубликаты: ' + uniq.length, submitLabel: 'Удалить лишние, оставить первый', danger: true,
        text: 'В каждой связке останется первый материал, остальные будут удалены.<div class="dups">' + html + '</div>',
        fields: [],
        onSubmit: function () {
          var del = []; uniq.forEach(function (ids) { ids.slice(1).forEach(function (id) { if (del.indexOf(id) < 0) del.push(id); }); });
          var n = MB.deleteMaterials(B(), del); save(); kit.render(); kit.toast('Удалено: ' + n);
        }
      });
    }

    // ---------- групповые операции ----------
    function selIds() { return Object.keys(S().sel); }
    function bulkMove() {
      openModal2({ title: 'Переместить материалов: ' + selIds().length, submitLabel: 'Переместить',
        fields: [{ k: 'gid', label: 'В группу', type: 'select', options: groupOptions('', false), value: S().groupId || '' }],
        onSubmit: function (v) { MB.moveMaterials(B(), selIds(), v.gid); S().sel = {}; save(); kit.render(); } });
    }
    function bulkMarkup() {
      openModal2({ title: 'Наценка для материалов: ' + selIds().length, submitLabel: 'Применить',
        fields: [
          { k: 'mode', label: 'Наценка', type: 'select', options: markupOptions(), value: 'percent' },
          { k: 'value', label: 'Значение (%, коэффициент или ₽)', type: 'number', value: 30 }
        ],
        onSubmit: function (v) {
          selIds().forEach(function (id) {
            var m = B().materials.find(function (x) { return x.id === id; }); if (!m) return;
            m.markup = { mode: v.mode, value: MB.num(v.value) };
            if (v.mode !== 'inherit' && v.mode !== 'none') m.priceSell = MB.sellPrice(B(), m);
            MB.recordPrice(B(), m, 'наценка'); m.updated = new Date().toISOString();
          });
          save(); kit.render();
        } });
    }

    // ---------- смета заказа ----------
    function est(o) { if (!o.estimate) o.estimate = { inTotal: false, items: [] }; if (!o.estimate.items) o.estimate.items = []; return o.estimate; }
    function estTotalsHtml(o) {
      var t = MB.estimateTotals(est(o).items);
      return '<dl><dt>Сумма по ценам продажи</dt><dd><b>' + money(t.sell) + ' ₽</b></dd><dt>Закупка</dt><dd>' + money(t.buy) + ' ₽</dd><dt>Наценка</dt><dd>' + money(t.margin) + ' ₽</dd></dl>';
    }
    function estimateTab(o) {
      var e = est(o);
      var rows = e.items.map(function (x, i) {
        var inp = function (f, v, cls) { return '<input data-s="est" data-f="' + f + '" value="' + esc(v === undefined ? '' : v) + '"' + (cls ? ' class="' + cls + '"' : '') + '>'; };
        return '<tr data-eid="' + x.id + '"><td class="c">' + (i + 1) + '</td><td>' + inp('name', x.name) + '<div class="small muted">' + esc(x.article || '') + (x.auto ? ' · из заказа' : '') + '</div></td>' +
          '<td>' + inp('unit', x.unit, 'n') + '</td><td>' + inp('qty', x.qty, 'n') + '</td><td>' + inp('priceBuy', x.priceBuy, 'n') + '</td><td>' + inp('priceSell', x.priceSell, 'n') + '</td>' +
          '<td class="num est-sum">' + money(MB.num(x.qty) * MB.num(x.priceSell)) + '</td><td><button class="icon" data-act="est-del" data-id="' + x.id + '">✕</button></td></tr>';
      }).join('');
      return '<div class="row" style="margin-bottom:10px"><button class="btn primary" data-act="est-pick">+ Из базы</button><button class="btn ghost" data-act="est-manual">+ Вручную</button>' +
        '<button class="btn ghost" data-act="est-fill">Заполнить из заказа</button><button class="btn ghost" data-act="est-refresh">Цены из базы</button>' +
        '<button class="btn" data-act="est-pdf">PDF сметы</button></div>' +
        '<label class="chk" style="margin-bottom:10px"><input type="checkbox" data-s="est" data-f="inTotal"' + (e.inTotal ? ' checked' : '') + '> Включить смету в итог заказа (КП и счёт)</label>' +
        (e.items.length ? '<div class="tbl-wrap"><table class="parts"><thead><tr><th>№</th><th>Позиция</th><th>Ед.</th><th class="num">Кол-во</th><th class="num">Закупка, ₽</th><th class="num">Продажа, ₽</th><th class="num">Сумма, ₽</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>'
          : '<div class="card empty">Смета пуста. Добавьте позиции из базы или нажмите «Заполнить из заказа».</div>') +
        '<div class="card" style="margin-top:12px" id="est-totals">' + estTotalsHtml(o) + '</div>' +
        '<p class="muted small">В PDF сметы закупочные цены и наценка не попадают, только цены продажи.</p>';
    }
    function onEstEdit(t, o) {
      var e = est(o);
      if (t.dataset.f === 'inTotal') { e.inTotal = t.checked; kit.afterOrderChange(o); return; }
      var tr = t.closest('tr'); var x = e.items.find(function (i) { return i.id === tr.dataset.eid; }); if (!x) return;
      x[t.dataset.f] = t.value;
      var cell = tr.querySelector('.est-sum'); if (cell) cell.textContent = money(MB.num(x.qty) * MB.num(x.priceSell));
      var tt = $('#est-totals'); if (tt) tt.innerHTML = estTotalsHtml(o);
      kit.afterOrderChange(o);
    }
    function pickModal(o) {
      openModal2({
        title: 'Добавить в смету из базы', noSubmit: true, cancelLabel: 'Готово', wide: true,
        text: '<input id="pick-search" placeholder="Поиск по названию или артикулу" style="width:100%"><div id="pick-list" class="pick-list"></div>',
        fields: []
      });
      fillPick('');
      var inp = $('#pick-search'); if (inp) inp.focus();
    }
    function fillPick(text) {
      var el = $('#pick-list'); if (!el) return;
      var list = MB.search(B(), { text: text }).sort(byName).slice(0, 60);
      el.innerHTML = list.length ? list.map(function (m) {
        return '<div class="pick"><div><b>' + esc(m.name) + '</b><div class="small muted">' + esc([m.article, MB.groupPath(B(), m.groupId).slice(-1)[0]].filter(Boolean).join(' · ')) + '</div></div>' +
          '<div class="num">' + money(MB.sellPrice(B(), m)) + ' ₽/' + esc(m.unit || '') + '</div><button type="button" class="btn sm" data-act="est-add" data-id="' + m.id + '">Добавить</button></div>';
      }).join('') : '<div class="muted" style="padding:12px">Ничего не найдено</div>';
    }
    function upsertAuto(o, m, qty) {
      var e = est(o), x = e.items.find(function (i) { return i.auto && i.materialId === m.id; });
      if (x) { x.qty = qty; return; }
      x = MB.estimateItemFromMaterial(B(), m, qty); x.auto = true; e.items.push(x);
    }
    function fillFromOrder(o) {
      var q = kit.recalc(o), n = 0;
      (q.cutting || []).forEach(function (c) {
        var m = B().materials.find(function (x) { return x.id === c.materialId; }); if (m && c.sheets) { upsertAuto(o, m, c.sheets); n++; }
      });
      var em = P.edgeMeters(o);
      Object.keys(em).forEach(function (id) {
        var m = B().materials.find(function (x) { return x.id === id; }); if (m) { upsertAuto(o, m, P.round2(em[id])); n++; }
      });
      kit.afterOrderChange(o); kit.render();
      kit.toast(n ? 'Из заказа добавлено позиций: ' + n : 'В заказе нет материалов и кромки из базы');
    }
    async function estPdf(o) {
      var e = est(o);
      if (!e.items.length) { kit.toast('Смета пуста', true); return; }
      o.docDate = new Date().toISOString();
      var html = Doc.buildEstimateHtml(o, e.items, kit.getClient(o.clientId), state.db.settings);
      var res = await window.api.makePdf({ html: html, name: 'Смета ' + o.number });
      if (!res) return;
      o.documents.push({ name: res.name, path: res.path, kind: 'estimate', date: new Date().toISOString() });
      kit.touch(o); kit.toast('PDF сохранён: ' + res.name);
    }

    // ---------- действия ----------
    var actions = {
      'sm-group': function (el) { S().groupId = el.dataset.id; S().sel = {}; kit.render(); },
      'sm-toggle': function (el) { S().open[el.dataset.id] = !S().open[el.dataset.id]; kit.render(); },
      'sm-group-new': function () { groupModal({ id: MB.uid('g'), name: '', type: '', markup: { mode: 'inherit', value: '', round: 2 } }, true, ''); },
      'sm-group-sub': function () { groupModal({ id: MB.uid('g'), name: '', type: '', markup: { mode: 'inherit', value: '', round: 2 } }, true, S().groupId); },
      'sm-group-edit': function () { var g = MB.groupById(B(), S().groupId); if (g) groupModal(g, false); },
      'sm-group-del': function () {
        var g = MB.groupById(B(), S().groupId); if (!g) return;
        var ids = MB.descendantIds(B(), g.id), n = B().materials.filter(function (m) { return ids.indexOf(m.groupId) >= 0; }).length;
        kit.confirmBox('Удалить группу «' + g.name + '» со всеми подгруппами (' + (ids.length - 1) + ') и материалами (' + n + ')? Это нельзя отменить.', function () {
          MB.deleteGroup(B(), g.id); S().groupId = g.parentId || ''; S().sel = {}; save(); kit.render();
        }, 'Удалить');
      },
      'sm-new': function () {
        var gid = S().groupId || (B().groups[0] || {}).id || '';
        if (!gid) { kit.toast('Сначала создайте группу', true); return; }
        var kind = MB.groupType(B(), gid);
        openCard(MB.newMaterial(gid, { unit: ({ sheet: 'лист', edge: 'м.п.', linear: 'м.п.', service: 'ч' })[kind] || 'шт.' }), true);
      },
      'sm-edit': function (el) { var m = B().materials.find(function (x) { return x.id === el.dataset.id; }); if (m) openCard(m, false); },
      'sm-sel': function (el) {
        if (el.checked) S().sel[el.dataset.id] = true; else delete S().sel[el.dataset.id];
        var b = $('#sm-bulk'); if (b) b.innerHTML = bulkHtml();
      },
      'sm-selall': function (el) {
        visibleList().slice(0, LIMIT).forEach(function (m) { if (el.checked) S().sel[m.id] = true; else delete S().sel[m.id]; });
        kit.render();
      },
      'sm-sel-clear': function () { S().sel = {}; kit.render(); },
      'sm-bulk-move': bulkMove, 'sm-bulk-markup': bulkMarkup,
      'sm-bulk-copy': function () { selIds().forEach(function (id) { MB.copyMaterial(B(), id); }); S().sel = {}; save(); kit.render(); kit.toast('Копии созданы'); },
      'sm-bulk-del': function () {
        kit.confirmBox('Удалить выбранные материалы (' + selIds().length + ')? Это нельзя отменить.', function () { MB.deleteMaterials(B(), selIds()); S().sel = {}; save(); kit.render(); }, 'Удалить');
      },
      'sm-del-one': function (el) {
        var id = el.dataset.id; kit.closeModal();
        kit.confirmBox('Удалить материал? Это нельзя отменить.', function () { MB.deleteMaterials(B(), [id]); delete S().sel[id]; save(); kit.render(); }, 'Удалить');
      },
      'sm-copy-one': function (el) { var c = MB.copyMaterial(B(), el.dataset.id); kit.closeModal(); save(); kit.render(); if (c) openCard(c, false); },
      'sm-from-link': startFromLink,
      'sm-card-link': cardRefreshFromLink,
      'sm-more': function () { S().limit = (S().limit || LIMIT) + 500; kit.render(); },
      'sm-import': function () { importFlow(false); },
      'sm-prices': function () { importFlow(true); },
      'sm-export': exportFlow,
      'sm-dups': dupsFlow,
      'est-pick': function () { pickModal(kit.getOrder(state.orderId)); },
      'est-add': function (el) {
        var o = kit.getOrder(state.orderId), m = B().materials.find(function (x) { return x.id === el.dataset.id; }); if (!m) return;
        est(o).items.push(MB.estimateItemFromMaterial(B(), m, 1));
        kit.afterOrderChange(o); kit.render(); el.textContent = 'Добавлено ✓'; kit.toast('Добавлено: ' + m.name);
      },
      'est-manual': function () { var o = kit.getOrder(state.orderId); est(o).items.push({ id: MB.uid('e'), materialId: '', name: '', article: '', unit: 'шт.', qty: 1, priceBuy: 0, priceSell: 0 }); kit.afterOrderChange(o); kit.render(); },
      'est-del': function (el) { var o = kit.getOrder(state.orderId); est(o).items = est(o).items.filter(function (x) { return x.id !== el.dataset.id; }); kit.afterOrderChange(o); kit.render(); },
      'est-fill': function () { fillFromOrder(kit.getOrder(state.orderId)); },
      'est-refresh': function () {
        var o = kit.getOrder(state.orderId), n = MB.refreshEstimate(B(), est(o).items);
        kit.afterOrderChange(o); kit.render(); kit.toast('Цены обновлены у позиций: ' + n);
      },
      'est-pdf': function () { estPdf(kit.getOrder(state.orderId)); }
    };

    function onInput(ev) {
      var t = ev.target;
      if ((t.id === 'sm-search' || t.id === 'pick-search') && ev.type !== 'input') return true; // blur не перерисовывает список
      if (t.id === 'sm-search') {
        S().search = t.value; S().limit = 0; var pos = t.selectionStart;
        kit.render(); var el = $('#sm-search'); if (el) { el.focus(); el.setSelectionRange(pos, pos); }
        return true;
      }
      if (t.id === 'pick-search') { fillPick(t.value); return true; }
      if (t.dataset && t.dataset.s === 'smsub' && ev.type === 'change') { S().sub = t.checked; kit.render(); return true; }
      return false;
    }

    // modal с поддержкой широких форм, чекбоксов и справочных блоков
    function openModal2(cfg) { return kit.openModal(cfg); }

    return { view: view, estimateTab: estimateTab, onEstEdit: onEstEdit, actions: actions, onInput: onInput };
  }

  window.SmetaUI = { create: create };
})();
