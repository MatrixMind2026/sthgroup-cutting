/* Интерфейс программы расчёта коммерческого распила. */
(function () {
  'use strict';
  var P = Core.pricing, IMP = Core.importers, B3D = Core.b3d, MB = Core.materialbase, D = Doc, SM;
  var esc = D.esc, money = D.money;

  var STATUSES = [['calc', 'Расчёт'], ['work', 'В работе'], ['done', 'Готов'], ['issued', 'Выдан'], ['cancel', 'Отменён']];
  var statusName = function (k) { var s = STATUSES.find(function (x) { return x[0] === k; }); return s ? s[1] : k; };

  var state = {
    db: null, mb: Core.materialbase.emptyBase(false), base: { materials: [], edges: [], hardware: [] }, matInfo: {}, baseDirty: false,
    view: 'orders', orderId: null, tab: 'parts', search: '', statusFilter: '',
    docOpts: { includeParts: true, includeMaps: false }, quotes: {}
  };

  function defaultDb() {
    return {
      version: 1,
      settings: {
        company: { name: 'STHGroup', phone: '', email: '', address: '', executor: '', bank: '' },
        quotePrefix: 'STH-', nextNumber: 1, validDays: 7, docNote: '', materialsPath: '',
        pricing: P.defaultPricing()
      },
      clients: [], orders: [], offcuts: []
    };
  }
  function uid(p) { return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function nowIso() { return new Date().toISOString(); }
  function todayStr() { return new Date().toISOString().slice(0, 10); }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function getOrder(id) { return state.db.orders.find(function (o) { return o.id === id; }); }
  function getClient(id) { return state.db.clients.find(function (c) { return c.id === id; }); }
  function clientLabel(c) { return c ? (c.company || c.name || 'Без имени') : '—'; }

  // ---------- сохранение ----------
  var saveTimer = null;
  function scheduleSave() {
    var el = $('#savestate');
    if (el) el.textContent = 'Сохранение…';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      window.api.saveDb(state.db).then(function (r) {
        if (r && r.ok) { if (el) el.textContent = 'Сохранено'; }
        else { if (el) el.textContent = 'Ошибка сохранения'; toast('Не удалось сохранить: ' + (r && r.error), true); }
      });
    }, 400);
  }
  function toast(msg, err) {
    var t = $('#toast');
    t.textContent = msg; t.className = 'toast show' + (err ? ' err' : '');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.className = 'toast'; }, err ? 6000 : 2800);
  }

  // ---------- расчёт ----------
  function recalc(order) {
    var q = P.calcOrder(order, state.base, state.db.settings);
    state.quotes[order.id] = q;
    order.total = q.total; order.paid = q.paid; order.debt = q.debt;
    return q;
  }
  function touch(order) { order.updated = nowIso(); scheduleSave(); }

  // ---------- модальные окна ----------
  function closeModal() { $('#modal-root').innerHTML = ''; }
  function openModal(cfg) {
    var fields = (cfg.fields || []).map(function (f) {
      if (f.type === 'info') return '<div class="info' + (f.full === false ? '' : ' full') + '">' + f.html + '</div>';
      var inner;
      if (f.type === 'select') {
        inner = '<select name="' + f.k + '">' + f.options.map(function (o) {
          return '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(f.value) ? ' selected' : '') + '>' + esc(o[1]) + '</option>';
        }).join('') + '</select>';
      } else if (f.type === 'textarea') {
        inner = '<textarea name="' + f.k + '" rows="3">' + esc(f.value || '') + '</textarea>';
      } else if (f.type === 'checkbox') {
        return '<label class="chk' + (f.full === false ? '' : ' full') + '"><input name="' + f.k + '" type="checkbox"' + (f.value ? ' checked' : '') + '> ' + esc(f.label) + '</label>';
      } else {
        inner = '<input name="' + f.k + '" type="' + (f.type || 'text') + '" value="' + esc(f.value === undefined ? '' : f.value) + '"' + (f.type === 'number' ? ' step="any"' : '') + '>';
      }
      return '<label class="f' + (f.full || f.type === 'textarea' ? ' full' : '') + (f.miss ? ' miss' : '') + '">' + esc(f.label) + inner + '</label>';
    }).join('');
    $('#modal-root').innerHTML = '<div class="modal-bg"><form class="modal' + (cfg.wide ? ' wide' : '') + '" id="modal-form"><h3>' + esc(cfg.title) + '</h3>' +
      (cfg.text ? '<p>' + cfg.text + '</p>' : '') +
      '<div class="fields">' + fields + '</div><div class="row" style="margin-top:16px;justify-content:flex-end">' +
      (cfg.extra || '') +
      '<button type="button" class="btn ghost" data-act="modal-cancel">' + esc(cfg.cancelLabel || 'Отмена') + '</button>' +
      (cfg.noSubmit ? '' : '<button type="submit" class="btn ' + (cfg.danger ? '' : 'primary') + '">' + esc(cfg.submitLabel || 'Сохранить') + '</button>') +
      '</div></form></div>';
    var form = $('#modal-form');
    var first = form.querySelector('input:not([type=checkbox]),select,textarea'); if (first) first.focus();
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var vals = {};
      (cfg.fields || []).forEach(function (f) {
        if (f.type === 'info') return;
        var el = form.elements[f.k];
        vals[f.k] = f.type === 'checkbox' ? el.checked : el.value;
      });
      var r = cfg.onSubmit ? cfg.onSubmit(vals) : null;
      if (r !== false) closeModal();
    });
  }
  function confirmBox(text, onYes, label) {
    openModal({ title: 'Подтвердите', text: esc(text), fields: [], submitLabel: label || 'Да', danger: true, onSubmit: function () { onYes(); } });
  }

  // ---------- общие куски ----------
  function matOptions(sel) {
    var list = state.base.materials || [];
    var out = '<option value="">— материал —</option>';
    var found = false;
    list.forEach(function (m) {
      if (m.id === sel) found = true;
      out += '<option value="' + esc(m.id) + '"' + (m.id === sel ? ' selected' : '') + '>' + esc(m.name) + '</option>';
    });
    if (sel && !found) out += '<option value="' + esc(sel) + '" selected>' + esc(sel) + ' (нет в базе)</option>';
    return out;
  }
  function edgeOptions(sel) {
    var out = '<option value="">—</option>';
    (state.base.edges || []).forEach(function (e) {
      out += '<option value="' + esc(e.id) + '"' + (e.id === sel ? ' selected' : '') + '>' + esc(e.name) + '</option>';
    });
    if (sel && !(state.base.edges || []).some(function (e) { return e.id === sel; })) out += '<option value="' + esc(sel) + '" selected>?</option>';
    return out;
  }
  function badge(k) { return '<span class="badge ' + esc(k) + '">' + esc(statusName(k)) + '</span>'; }

  // ---------- заказы: список ----------
  function viewOrders() {
    var db = state.db, q = state.search.toLowerCase();
    var list = db.orders.filter(function (o) {
      if (state.statusFilter && o.status !== state.statusFilter) return false;
      if (!q) return true;
      return (o.number + ' ' + (o.title || '') + ' ' + clientLabel(getClient(o.clientId))).toLowerCase().indexOf(q) >= 0;
    }).sort(function (a, b) { return (b.created || '').localeCompare(a.created || ''); });
    var debt = db.orders.reduce(function (a, o) { return a + (o.status !== 'cancel' && o.debt > 0 ? o.debt : 0); }, 0);
    var rows = list.map(function (o) {
      return '<tr class="click" data-act="open-order" data-id="' + o.id + '"><td><b>' + esc(o.number) + '</b></td><td>' + D.dateRu(o.created) + '</td><td>' + esc(clientLabel(getClient(o.clientId))) + '</td><td>' + esc(o.title || '') + '</td><td>' + badge(o.status) + '</td><td class="num">' + money(o.total) + '</td><td class="num">' + money(o.paid) + '</td><td class="num ' + (o.debt > 0 && o.status !== 'cancel' ? 'debt' : '') + '">' + (o.debt > 0 ? money(o.debt) : '—') + '</td></tr>';
    }).join('');
    return '<div class="row sp"><h1>Заказы</h1><div class="row"><span class="muted">Долг клиентов: <b class="' + (debt > 0 ? 'debt' : '') + '">' + money(debt) + ' ₽</b></span><button class="btn primary" data-act="new-order">Новый заказ</button></div></div>' +
      '<div class="row" style="margin-bottom:12px"><input id="search" placeholder="Поиск по номеру, клиенту, названию" value="' + esc(state.search) + '" style="width:320px">' +
      '<select id="statusFilter"><option value="">Все статусы</option>' + STATUSES.map(function (s) { return '<option value="' + s[0] + '"' + (state.statusFilter === s[0] ? ' selected' : '') + '>' + s[1] + '</option>'; }).join('') + '</select></div>' +
      (list.length ? '<div class="tbl-wrap"><table><thead><tr><th>№</th><th>Дата</th><th>Клиент</th><th>Заказ</th><th>Статус</th><th class="num">Сумма, ₽</th><th class="num">Оплачено</th><th class="num">Долг</th></tr></thead><tbody>' + rows + '</tbody></table></div>'
        : '<div class="card empty">Заказов пока нет. Нажмите «Новый заказ».</div>');
  }

  function newOrderModal() {
    var clients = [['', '— без клиента —']].concat(state.db.clients.map(function (c) { return [c.id, clientLabel(c)]; }));
    openModal({
      title: 'Новый заказ', submitLabel: 'Создать',
      fields: [{ k: 'clientId', label: 'Клиент', type: 'select', options: clients, value: '' }, { k: 'title', label: 'Название заказа (по желанию)', value: '' }],
      onSubmit: function (v) {
        var s = state.db.settings;
        var o = {
          id: uid('o'), number: (s.quotePrefix || '') + String(s.nextNumber).padStart(4, '0'), created: nowIso(), updated: nowIso(),
          clientId: v.clientId, title: v.title, status: 'calc', parts: [], ownMaterial: false, ownEdge: false, areaBasis: '',
          discountPct: 0, extraLines: [], payments: [], files: [], documents: [], note: '', offcutsAdded: false, total: 0, paid: 0, debt: 0
        };
        s.nextNumber++;
        state.db.orders.push(o);
        state.orderId = o.id; state.tab = 'parts'; state.view = 'order';
        scheduleSave(); render();
      }
    });
  }

  // ---------- заказ ----------
  function partRow(p, i) {
    var e = p.edges || {};
    var edgeCells = ['l1', 'l2', 'w1', 'w2'].map(function (s) { return '<td><select class="e" data-s="partedge" data-f="' + s + '">' + edgeOptions(e[s]) + '</select></td>'; }).join('');
    var n = function (f) { return '<td><input class="n" inputmode="decimal" data-s="part" data-f="' + f + '" value="' + esc(p[f] === undefined ? '' : p[f]) + '"></td>'; };
    return '<tr data-pid="' + p.id + '"><td class="c muted">' + (i + 1) + '</td>' +
      '<td><input data-s="part" data-f="name" value="' + esc(p.name) + '" style="min-width:120px"></td>' +
      '<td><select data-s="part" data-f="materialId">' + matOptions(p.materialId) + '</select></td>' +
      n('l') + n('w') + n('qty') +
      '<td class="c"><input type="checkbox" data-s="part" data-f="grain"' + (p.grain ? ' checked' : '') + ' title="Текстура: не поворачивать деталь"></td>' +
      edgeCells + n('holesFaceBlind') + n('holesFaceThrough') + n('holesEdge') + n('millM') +
      '<td><button class="icon" data-act="del-part" data-id="' + p.id + '" title="Удалить деталь">✕</button></td></tr>';
  }

  function tabParts(o) {
    var rows = o.parts.map(partRow).join('');
    return '<div class="row" style="margin-bottom:10px"><button class="btn" data-act="add-part">+ Деталь</button><button class="btn ghost" data-act="import">Открыть модель .b3d, .bmk или CSV…</button><button class="btn ghost" data-act="csv-template">Шаблон CSV</button><span class="grow"></span>' +
      (o.parts.length ? '<button class="btn danger sm" data-act="clear-parts">Очистить список</button>' : '') + '</div>' +
      '<div class="tbl-wrap"><table class="parts"><thead><tr><th>№</th><th>Деталь</th><th>Материал</th><th class="num">Длина</th><th class="num">Ширина</th><th class="num">Шт.</th><th title="Не поворачивать">Текст.</th><th>Кромка L1</th><th>L2</th><th>W1</th><th>W2</th><th class="num" title="Глухие в пласть">Отв. гл.</th><th class="num" title="Сквозные">Отв. скв.</th><th class="num" title="В торец">Отв. торец</th><th class="num" title="Фрезеровка, погонных метров на деталь">Фрез., м</th><th></th></tr></thead><tbody id="parts-body">' +
      (rows || '') + '</tbody></table>' + (o.parts.length ? '' : '<div class="empty">Деталей нет. Добавьте вручную или загрузите файл.</div>') + '</div>' +
      '<p class="muted small">Размеры в мм. Длина идёт по краям L1/L2, ширина — по W1/W2. Присадка и фрезеровка указываются на одну деталь, умножаются на количество.</p>';
  }

  function calcLinesHtml(o, q) {
    var warns = q.warnings.length ? '<div class="warns bad">' + q.warnings.map(esc).join('<br>') + '</div>' : '';
    var rows = q.lines.map(function (l, i) {
      return '<tr><td class="muted">' + (i + 1) + '</td><td>' + esc(l.title) + '</td><td class="num">' + D.qtyFmt(l.qty) + '</td><td>' + esc(l.unit) + '</td><td class="num">' + money(l.price) + '</td><td class="num">' + money(l.sum) + '</td></tr>';
    }).join('');
    var tail = '<tr><td></td><td colspan="4" class="num">Итого по позициям</td><td class="num">' + money(q.subtotal) + '</td></tr>' +
      (q.discount ? '<tr><td></td><td colspan="4" class="num">Скидка ' + D.qtyFmt(q.discountPct) + '%</td><td class="num">− ' + money(q.discount) + '</td></tr>' : '') +
      (q.minTopUp ? '<tr><td></td><td colspan="4" class="num">Доплата до минимальной суммы (' + money(q.minOrder) + ')</td><td class="num">' + money(q.minTopUp) + '</td></tr>' : '') +
      '<tr><td></td><td colspan="4" class="num"><b>К оплате</b></td><td class="num"><b>' + money(q.total) + '</b></td></tr>';
    return warns + '<div class="tbl-wrap"><table><thead><tr><th>№</th><th>Позиция</th><th class="num">Кол-во</th><th>Ед.</th><th class="num">Цена</th><th class="num">Сумма</th></tr></thead><tbody>' +
      (rows || '<tr><td colspan="6" class="empty">Нет позиций: добавьте детали и выберите материал.</td></tr>') + tail + '</tbody></table></div>';
  }

  function tabCalc(o, q) {
    var def = state.db.settings.pricing.areaBasis === 'sheets' ? 'по площади листов' : 'по площади деталей';
    var extra = (o.extraLines || []).map(function (x, i) {
      return '<tr data-xi="' + i + '"><td><input data-s="extra" data-f="title" value="' + esc(x.title) + '" style="width:100%"></td><td><input class="n" data-s="extra" data-f="qty" value="' + esc(x.qty) + '" style="width:70px"></td><td><input data-s="extra" data-f="unit" value="' + esc(x.unit) + '" style="width:60px"></td><td><input class="n" data-s="extra" data-f="price" value="' + esc(x.price) + '" style="width:90px"></td><td><button class="icon" data-act="del-extra" data-i="' + i + '">✕</button></td></tr>';
    }).join('');
    return '<div class="card"><div class="kv">' +
      '<label class="f">Как считать<select data-s="order" data-f="priceMode"><option value="">Как в настройках (' + (state.db.settings.pricing.sheet && state.db.settings.pricing.sheet.mode === 'area' ? 'по площади' : 'за лист') + ')</option><option value="sheet"' + (o.priceMode === 'sheet' ? ' selected' : '') + '>За лист (распил+кромка+присадка)</option><option value="area"' + (o.priceMode === 'area' ? ' selected' : '') + '>По площади, кромка и присадка отдельно</option></select></label>' +
      '<label class="f">Площадь (если по площади)<select data-s="order" data-f="areaBasis"><option value="">Как в настройках (' + def + ')</option><option value="parts"' + (o.areaBasis === 'parts' ? ' selected' : '') + '>По площади деталей</option><option value="sheets"' + (o.areaBasis === 'sheets' ? ' selected' : '') + '>По площади израсходованных листов</option></select></label>' +
      '<label class="f">Скидка, %<input data-s="order" data-f="discountPct" value="' + esc(o.discountPct) + '" inputmode="decimal"></label>' +
      '<label class="chk" style="margin-top:18px"><input type="checkbox" data-s="order" data-f="ownMaterial"' + (o.ownMaterial ? ' checked' : '') + '> Материал наш (продаём листы)</label>' +
      '<label class="chk" style="margin-top:18px"><input type="checkbox" data-s="order" data-f="ownEdge"' + (o.ownEdge ? ' checked' : '') + '> Кромка наша (продаём кромку)</label></div></div>' +
      '<h2>Расчёт</h2><div id="calc-lines">' + calcLinesHtml(o, q) + '</div>' +
      '<h2>Дополнительные позиции</h2><div class="tbl-wrap"><table><thead><tr><th>Наименование</th><th>Кол-во</th><th>Ед.</th><th>Цена</th><th></th></tr></thead><tbody>' + extra + '</tbody></table></div>' +
      '<div class="row" style="margin-top:8px"><button class="btn ghost sm" data-act="add-extra">+ Добавить позицию</button></div>' +
      '<h2>Документы</h2><div class="card"><div class="row"><label class="chk"><input type="checkbox" data-s="docopt" data-f="includeParts"' + (state.docOpts.includeParts ? ' checked' : '') + '> Перечень деталей</label>' +
      '<label class="chk"><input type="checkbox" data-s="docopt" data-f="includeMaps"' + (state.docOpts.includeMaps ? ' checked' : '') + '> Карты раскроя</label><span class="grow"></span>' +
      '<button class="btn primary" data-act="make-doc" data-kind="quote">КП в PDF</button><button class="btn" data-act="make-doc" data-kind="invoice">Счёт в PDF</button></div></div>';
  }

  // ---------- модель 3D ----------
  function modelPanels(o) {
    var out = [];
    (o.models || []).forEach(function (md, mi) { (md.panels || []).forEach(function (p, pi) { if (p.loops && p.loops.length) out.push({ mi: mi, pi: pi, p: p }); }); });
    return out;
  }
  function tabModel(o) {
    var list = modelPanels(o);
    if (!list.length) return '<div class="card empty">Модели нет. На вкладке «Детали» нажмите «Импорт» и выберите файл .b3d — здесь появится 3D-вид.' +
      ((o.files || []).some(function (f) { return /\.b3d$/i.test(f.name || ''); }) ? '<br><span class="small muted">Модель этого заказа загружена до версии 0.6.1 — загрузите .b3d ещё раз, чтобы увидеть 3D.</span></div>' : '</div>');
    var byMat = {}, order = [];
    list.forEach(function (x, i) { var k = x.p.mat || '— без материала —'; if (!byMat[k]) { byMat[k] = []; order.push(k); } byMat[k].push(i); });
    var sel = state.modelSel === undefined ? -1 : state.modelSel;
    var tree = order.map(function (k) {
      var open = state.modelOpen && state.modelOpen[k] === false ? '' : ' open';
      return '<details' + open + ' data-mat="' + esc(k) + '"><summary>' + esc(k) + ' <span class="muted small">' + byMat[k].length + '</span></summary>' +
        byMat[k].map(function (i) {
          var p = list[i].p, hid = window.Model3D && Model3D.isHidden(i);
          return '<div class="mtree-row' + (i === sel ? ' on' : '') + (hid ? ' hid' : '') + '" data-act="mdl-sel" data-i="' + i + '"><button class="icon" data-act="mdl-hide" data-i="' + i + '" title="Скрыть/показать">' + (hid ? '◌' : '●') + '</button>' + esc(p.name || 'Деталь') + '</div>';
        }).join('') + '</details>';
    }).join('');
    var hwN = (o.models || []).reduce(function (a, m) { return a + (m.hardware || []).length; }, 0);
    var ex = window.Model3D ? Model3D.getExplode() : 0;
    return '<div class="mview">' +
      '<div class="mtree card">' + (o.models.length > 1 ? '<div class="muted small" style="margin-bottom:6px">Моделей: ' + o.models.length + '</div>' : '') + tree + '</div>' +
      '<div class="mcenter"><div class="mtools row">' +
        '<button class="btn ghost sm" data-act="mdl-view" data-v="iso">Изометрия</button><button class="btn ghost sm" data-act="mdl-view" data-v="front">Спереди</button><button class="btn ghost sm" data-act="mdl-view" data-v="top">Сверху</button><button class="btn ghost sm" data-act="mdl-view" data-v="side">Сбоку</button>' +
        '<label class="small row" style="gap:6px">Разнести <input type="range" id="mdlExplode" min="0" max="100" value="' + Math.round(ex * 100) + '" style="width:110px"></label>' +
        '<label class="chk small"><input type="checkbox" id="mdlXray"' + (window.Model3D && Model3D.getXray() ? ' checked' : '') + '> Прозрачность</label>' +
        (hwN ? '<label class="chk small"><input type="checkbox" id="mdlHw"' + (window.Model3D && Model3D.getHardware() ? ' checked' : '') + '> Фурнитура (' + hwN + ')</label>' : '') +
        '<button class="btn ghost sm" data-act="mdl-showall">Показать все</button></div>' +
        '<div id="m3d" class="m3d"></div><div class="muted small">Левая кнопка — вращать, правая или Shift — сдвигать, колесо — масштаб, щелчок — выбрать деталь.</div></div>' +
      '<div class="mprops card" id="mprops">' + modelProps(o, sel) + '</div></div>';
  }
  function modelProps(o, i) {
    var list = modelPanels(o), x = list[i];
    if (!x) return '<div class="muted small">Выберите деталь в списке слева или щёлкните по ней в 3D.</div>';
    var p = x.p, part = (o.parts || []).find(function (q) { return q.id === p.partId; });
    var en = function (id) { if (!id) return '—'; var e = (state.base.edges || []).find(function (z) { return z.id === id; }); return e ? e.name : id; };
    var rows = [['Деталь', p.name || '—'], ['Материал', p.mat || '—']];
    if (part) {
      rows.push(['Размер', part.l + ' × ' + part.w + ' × ' + (p.T || '') + ' мм'], ['В заказе, шт.', part.qty]);
      rows.push(['Кромка длина 1', en(part.edges && part.edges.l1)], ['Кромка длина 2', en(part.edges && part.edges.l2)], ['Кромка ширина 1', en(part.edges && part.edges.w1)], ['Кромка ширина 2', en(part.edges && part.edges.w2)]);
      rows.push(['Отверстия в пласть', (P.num(part.holesFaceBlind) + P.num(part.holesFaceThrough)) || 0], ['Отверстия в торец', P.num(part.holesEdge) || 0], ['Фрезеровка, м', P.num(part.millM) || 0]);
    } else rows.push(['Толщина', (p.T || '') + ' мм'], ['', '<span class="muted small">Строка детали удалена из заказа</span>']);
    if (p.loops.length > 1) rows.push(['Вырезы', p.loops.length - 1]);
    return '<h3 style="margin-top:0">Свойства</h3><table class="mini"><tbody>' + rows.map(function (r) { return '<tr><td class="muted">' + esc(r[0]) + '</td><td>' + (String(r[1]).indexOf('<span') === 0 ? r[1] : esc(r[1])) + '</td></tr>'; }).join('') + '</tbody></table>' +
      '<div class="row" style="margin-top:10px"><button class="btn ghost sm" data-act="mdl-focus" data-i="' + i + '">Приблизить</button>' + (part ? '<button class="btn ghost sm" data-act="mdl-topart" data-pid="' + esc(part.id) + '">К строке детали</button>' : '') + '</div>';
  }
  function mountModel() {
    var o = getOrder(state.orderId), el = document.getElementById('m3d');
    if (!o || !el || !window.Model3D) return;
    var key = (o.models || []).map(function (m) { return m.id; }).join('|') + ':' + o.id;
    Model3D.mount(el, o.models || [], key, function (i) { modelSelect(o, i, false); });
    if (state.modelSel >= 0) Model3D.select(state.modelSel);
  }
  function modelSelect(o, i, fromTree) {
    state.modelSel = i;
    if (fromTree) Model3D.select(i);
    document.querySelectorAll('.mtree-row').forEach(function (r) { r.classList.toggle('on', +r.dataset.i === i); });
    var pr = document.getElementById('mprops'); if (pr) pr.innerHTML = modelProps(o, i);
    var row = document.querySelector('.mtree-row[data-i="' + i + '"]');
    if (row && !fromTree) { var d = row.closest('details'); if (d) d.open = true; row.scrollIntoView({ block: 'nearest' }); }
  }

  function tabCut(o, q) {
    if (!q.cutting.length) return (q.warnings.length ? '<div class="warns bad">' + q.warnings.map(esc).join('<br>') + '</div>' : '') + '<div class="card empty">Нет деталей для раскроя.</div>';
    var no = D.partNumbers(o);
    var html = q.warnings.length ? '<div class="warns bad">' + q.warnings.map(esc).join('<br>') + '</div>' : '';
    q.cutting.forEach(function (c) {
      var pk = c.packing;
      var off = pk.sheets.reduce(function (a, s) { return a + s.offcuts.length; }, 0);
      html += '<div class="card" style="margin-bottom:12px"><div class="row sp"><div><b>' + esc(c.material.name) + '</b> <span class="muted">лист ' + pk.sheetW + '×' + pk.sheetH + ' мм</span></div>' +
        '<div class="row"><span>Листов: <b>' + c.sheets + '</b></span><span class="muted">деталей ' + D.qtyFmt(c.partsArea) + ' м² из ' + D.qtyFmt(c.sheetsArea) + ' м² (' + (c.sheetsArea ? Math.round(c.partsArea / c.sheetsArea * 100) : 0) + '%)</span>' +
        (off ? '<button class="btn ghost sm" data-act="stock-offcuts" data-mid="' + esc(c.materialId) + '">Остатки на склад (' + off + ')</button>' : '') + '</div></div>';
      pk.sheets.forEach(function (s) {
        html += '<div class="sheetmap"><div class="small muted" style="margin-bottom:4px">Лист ' + s.index + ' · заполнено ' + Math.round(s.utilization * 100) + '%' + (s.offcuts.length ? ' · остатков: ' + s.offcuts.length : '') + '</div>' + D.sheetMapSvg(s, pk.sheetW, pk.sheetH, pk.trim, no) + '</div>';
      });
      html += '</div>';
    });
    return html;
  }

  function tabPay(o, q) {
    var pays = (o.payments || []).map(function (p, i) {
      return '<tr><td>' + D.dateRu(p.date) + '</td><td class="num">' + money(p.amount) + '</td><td>' + esc(p.note || '') + '</td><td><button class="icon" data-act="del-pay" data-i="' + i + '">✕</button></td></tr>';
    }).join('');
    var files = (o.files || []).map(function (f, i) {
      return '<tr><td>' + esc(f.name) + '</td><td class="small muted">' + esc(f.path) + '</td><td class="num"><button class="btn ghost sm" data-act="open-file" data-p="files" data-i="' + i + '">Открыть</button> <button class="icon" data-act="del-file" data-i="' + i + '">✕</button></td></tr>';
    }).join('');
    var docs = (o.documents || []).map(function (f, i) {
      return '<tr><td>' + esc(f.name) + '</td><td class="small muted">' + D.dateRu(f.date) + '</td><td class="num"><button class="btn ghost sm" data-act="open-file" data-p="documents" data-i="' + i + '">Открыть</button> <button class="btn ghost sm" data-act="show-file" data-i="' + i + '">В папке</button></td></tr>';
    }).join('');
    return '<div class="row sp"><h2 style="margin:0">Оплаты</h2><span>Оплачено <b class="paid-ok">' + money(q.paid) + '</b> из ' + money(q.total) + ' ₽ · долг <b class="' + (q.debt > 0 ? 'debt' : '') + '">' + money(Math.max(0, q.debt)) + '</b></span></div>' +
      '<div class="card" style="margin:8px 0"><form id="pay-form" class="row"><label class="f">Дата<input type="date" name="date" value="' + todayStr() + '"></label><label class="f">Сумма, ₽<input name="amount" inputmode="decimal" placeholder="0"></label><label class="f grow">Комментарий<input name="note" placeholder="предоплата, безнал, наличные…"></label><button class="btn primary" style="margin-top:16px" type="submit">Добавить</button></form></div>' +
      (pays ? '<div class="tbl-wrap"><table><thead><tr><th>Дата</th><th class="num">Сумма</th><th>Комментарий</th><th></th></tr></thead><tbody>' + pays + '</tbody></table></div>' : '<p class="muted">Оплат пока нет.</p>') +
      '<div class="row sp"><h2>Файлы заказа</h2><button class="btn ghost sm" data-act="attach">Прикрепить файлы…</button></div>' +
      (files ? '<div class="tbl-wrap"><table><tbody>' + files + '</tbody></table></div>' : '<p class="muted">Модель, исходники заказчика и другие файлы можно прикрепить сюда. Копии не делаются — хранится путь.</p>') +
      '<h2>Выданные документы</h2>' + (docs ? '<div class="tbl-wrap"><table><tbody>' + docs + '</tbody></table></div>' : '<p class="muted">PDF появятся здесь после создания КП или счёта.</p>') +
      '<h2>Заметка</h2><textarea data-s="order" data-f="note" rows="3">' + esc(o.note || '') + '</textarea>';
  }

  function summaryHtml(o, q) {
    return '<div class="card summary"><div class="muted small">К оплате</div><div class="big">' + money(q.total) + ' ₽</div>' +
      '<dl><dt>Позиции</dt><dd>' + money(q.subtotal) + '</dd>' +
      (q.discount ? '<dt>Скидка</dt><dd>− ' + money(q.discount) + '</dd>' : '') +
      (q.minTopUp ? '<dt>До минимума</dt><dd>+ ' + money(q.minTopUp) + '</dd>' : '') +
      '<dt>Деталей</dt><dd>' + D.qtyFmt(q.partsCount) + ' шт.</dd><dt>Площадь деталей</dt><dd>' + D.qtyFmt(q.partsArea) + ' м²</dd>' +
      '<dt>Листов</dt><dd>' + q.cutting.reduce(function (a, c) { return a + c.sheets; }, 0) + ' (' + D.qtyFmt(q.sheetsArea) + ' м²)</dd>' +
      '<dt>Присадка</dt><dd>' + D.qtyFmt(q.cnc.faceBlind + q.cnc.faceThrough + q.cnc.edge) + ' отв.</dd><dt>Фрезеровка</dt><dd>' + D.qtyFmt(q.cnc.millM) + ' м</dd>' +
      '<dt>Время ЧПУ</dt><dd>' + D.qtyFmt(q.machineHours) + ' ч</dd>' +
      '<dt>Оплачено</dt><dd class="paid-ok">' + money(q.paid) + '</dd><dt>Долг</dt><dd class="' + (q.debt > 0 ? 'debt' : '') + '">' + money(Math.max(0, q.debt)) + '</dd></dl>' +
      (q.warnings.length ? '<div class="warns" style="margin-top:10px">Замечаний: ' + q.warnings.length + '. См. вкладку «Расчёт».</div>' : '') + '</div>';
  }

  function viewOrder() {
    var o = getOrder(state.orderId);
    if (!o) { state.view = 'orders'; return viewOrders(); }
    var q = recalc(o);
    var clients = '<option value="">— клиент не выбран —</option>' + state.db.clients.map(function (c) { return '<option value="' + c.id + '"' + (c.id === o.clientId ? ' selected' : '') + '>' + esc(clientLabel(c)) + '</option>'; }).join('');
    var tabs = [['parts', 'Детали'], ['model', 'Модель'], ['calc', 'Расчёт'], ['est', 'Смета'], ['cut', 'Раскрой'], ['pay', 'Оплаты и файлы']];
    var body = state.tab === 'parts' ? tabParts(o) : state.tab === 'model' ? tabModel(o) : state.tab === 'calc' ? tabCalc(o, q) : state.tab === 'est' ? SM.estimateTab(o) : state.tab === 'cut' ? tabCut(o, q) : tabPay(o, q);
    return '<div class="row sp"><div class="row"><button class="btn ghost sm" data-act="back">← Заказы</button><h1 style="margin:0">Заказ ' + esc(o.number) + '</h1></div><div class="row"><button class="btn ghost sm" data-act="dup-order">Копия</button><button class="btn danger sm" data-act="del-order">Удалить</button></div></div>' +
      '<div class="row" style="margin-top:12px"><label class="f grow" style="min-width:220px">Название<input data-s="order" data-f="title" value="' + esc(o.title || '') + '"></label>' +
      '<label class="f" style="min-width:230px">Клиент<select data-s="order" data-f="clientId">' + clients + '</select></label>' +
      '<button class="btn ghost sm" style="margin-top:16px" data-act="new-client-order">+ Новый клиент</button>' +
      '<label class="f">Статус<select data-s="order" data-f="status">' + STATUSES.map(function (s) { return '<option value="' + s[0] + '"' + (o.status === s[0] ? ' selected' : '') + '>' + s[1] + '</option>'; }).join('') + '</select></label></div>' +
      '<div class="tabs">' + tabs.map(function (t) { return '<button data-act="tab" data-tab="' + t[0] + '" class="' + (state.tab === t[0] ? 'active' : '') + '">' + t[1] + '</button>'; }).join('') + '</div>' +
      (state.tab === 'model' ? body : '<div class="layout"><div>' + body + '</div><div id="summary">' + summaryHtml(o, q) + '</div></div>');
  }

  // ---------- клиенты ----------
  function viewClients() {
    var db = state.db;
    var rows = db.clients.map(function (c) {
      var os = db.orders.filter(function (o) { return o.clientId === c.id; });
      var debt = os.reduce(function (a, o) { return a + (o.status !== 'cancel' && o.debt > 0 ? o.debt : 0); }, 0);
      return '<tr class="click" data-act="edit-client" data-id="' + c.id + '"><td><b>' + esc(clientLabel(c)) + '</b>' + (c.company && c.name ? '<div class="small muted">' + esc(c.name) + '</div>' : '') + '</td><td>' + esc(c.phone || '') + '</td><td>' + esc(c.email || '') + '</td><td class="num">' + os.length + '</td><td class="num ' + (debt > 0 ? 'debt' : '') + '">' + (debt > 0 ? money(debt) : '—') + '</td></tr>';
    }).join('');
    return '<div class="row sp"><h1>Клиенты</h1><button class="btn primary" data-act="new-client">Новый клиент</button></div>' +
      (db.clients.length ? '<div class="tbl-wrap"><table><thead><tr><th>Клиент</th><th>Телефон</th><th>Почта</th><th class="num">Заказов</th><th class="num">Долг, ₽</th></tr></thead><tbody>' + rows + '</tbody></table></div>' : '<div class="card empty">Клиентов пока нет.</div>');
  }
  function clientModal(c, after) {
    var isNew = !c;
    c = c || { id: uid('c'), name: '', company: '', phone: '', email: '', details: '' };
    var hasOrders = !isNew && state.db.orders.some(function (o) { return o.clientId === c.id; });
    openModal({
      title: isNew ? 'Новый клиент' : 'Клиент', submitLabel: 'Сохранить',
      extra: (!isNew && !hasOrders) ? '<button type="button" class="btn danger" data-act="del-client" data-id="' + c.id + '" style="margin-right:auto">Удалить</button>' : '',
      fields: [
        { k: 'name', label: 'Контактное лицо', value: c.name }, { k: 'company', label: 'Компания (если есть)', value: c.company },
        { k: 'phone', label: 'Телефон', value: c.phone }, { k: 'email', label: 'Почта', value: c.email },
        { k: 'details', label: 'Реквизиты и примечания', type: 'textarea', value: c.details }
      ],
      onSubmit: function (v) {
        if (!v.name.trim() && !v.company.trim()) { toast('Укажите имя или компанию', true); return false; }
        Object.assign(c, v);
        if (isNew) state.db.clients.push(c);
        scheduleSave();
        if (after) after(c); else render();
      }
    });
  }

  // ---------- остатки ----------
  function viewOffcuts() {
    var db = state.db;
    var matName = function (id) { var m = state.base.materials.find(function (x) { return x.id === id; }); return m ? m.name : id; };
    var rows = db.offcuts.map(function (f) {
      var src = f.orderId && getOrder(f.orderId) ? getOrder(f.orderId).number : (f.orderId ? '—' : 'вручную');
      return '<tr><td>' + esc(matName(f.materialId)) + '</td><td class="num">' + Math.round(f.w) + ' × ' + Math.round(f.h) + '</td><td class="num">' + f.qty + '</td><td>' + esc(src) + '</td><td class="small muted">' + D.dateRu(f.date) + '</td><td>' + esc(f.note || '') + '</td><td class="num"><button class="btn ghost sm" data-act="use-offcut" data-id="' + f.id + '">Списать 1 шт.</button> <button class="icon" data-act="del-offcut" data-id="' + f.id + '">✕</button></td></tr>';
    }).join('');
    return '<div class="row sp"><h1>Деловые остатки</h1><button class="btn primary" data-act="new-offcut">Добавить остаток</button></div>' +
      (db.offcuts.length ? '<div class="tbl-wrap"><table><thead><tr><th>Материал</th><th class="num">Размер, мм</th><th class="num">Шт.</th><th>Из заказа</th><th>Дата</th><th>Заметка</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>' : '<div class="card empty">Остатков нет. После раскроя на вкладке «Раскрой» нажмите «Остатки на склад».</div>');
  }
  function offcutModal() {
    var mats = state.base.materials.map(function (m) { return [m.id, m.name]; });
    if (!mats.length) { toast('Сначала заполните базу материалов', true); return; }
    openModal({
      title: 'Добавить остаток', submitLabel: 'Добавить',
      fields: [{ k: 'materialId', label: 'Материал', type: 'select', options: mats, value: mats[0][0] }, { k: 'w', label: 'Длина, мм', type: 'number' }, { k: 'h', label: 'Ширина, мм', type: 'number' }, { k: 'qty', label: 'Штук', type: 'number', value: 1 }, { k: 'note', label: 'Заметка' }],
      onSubmit: function (v) {
        var w = P.num(v.w), h = P.num(v.h), qty = Math.max(1, Math.round(P.num(v.qty)));
        if (!w || !h) { toast('Укажите размеры', true); return false; }
        state.db.offcuts.push({ id: uid('f'), materialId: v.materialId, w: w, h: h, qty: qty, orderId: '', date: nowIso(), note: v.note });
        scheduleSave(); render();
      }
    });
  }

  // ---------- настройки ----------
  function inp(path, label, val, type) {
    return '<label class="f">' + label + '<input data-s="setting" data-path="' + path + '" data-type="' + (type || 'text') + '" value="' + esc(val === undefined ? '' : val) + '"' + (type === 'num' ? ' inputmode="decimal"' : '') + '></label>';
  }
  function chk(path, label, val) {
    return '<label class="chk"><input type="checkbox" data-s="setting" data-path="' + path + '" data-type="bool"' + (val ? ' checked' : '') + '> ' + label + '</label>';
  }

  // ---------- настройки: цена за лист ----------
  function sheetGroupRows(sh) {
    var mb = state.mb, rows = '';
    function walk(pid, depth) {
      MB.children(mb, pid).sort(function (a, b) { return String(a.name).localeCompare(String(b.name), 'ru'); }).forEach(function (g) {
        if (MB.groupType(mb, g.id) !== 'sheet') return;
        var has = (sh.groupPrices || {})[g.id];
        rows += '<tr><td style="padding-left:' + (8 + depth * 16) + 'px">' + esc(g.name) + '</td><td class="num"><input class="cell" style="width:120px" inputmode="decimal" placeholder="как выше" data-s="setting" data-type="num" data-path="pricing.sheet.groupPrices.' + g.id + '" value="' + esc(has === undefined || has === 0 ? '' : has) + '"></td></tr>';
        walk(g.id, depth + 1);
      });
    }
    walk('', 0);
    return rows;
  }
  function sheetMatRows(sh) {
    var q = String(state.shQ || '').trim().toLowerCase(), prices = sh.prices || {}, rows = '', n = 0;
    var sheets = state.mb.materials.filter(function (m) { return MB.groupType(state.mb, m.groupId) === 'sheet'; });
    var list = sheets.filter(function (m) { return prices[m.id] > 0 && (!q || (m.name + ' ' + m.article).toLowerCase().indexOf(q) >= 0); });
    var more = q ? sheets.filter(function (m) { return !(prices[m.id] > 0) && (m.name + ' ' + m.article).toLowerCase().indexOf(q) >= 0; }).slice(0, 30) : [];
    list.concat(more).forEach(function (m) {
      n++;
      rows += '<tr><td>' + esc(m.name) + '<div class="muted small">' + esc(m.article || '') + '</div></td><td class="num"><input class="cell" style="width:120px" inputmode="decimal" data-s="setting" data-type="num" data-path="pricing.sheet.prices.' + m.id + '" value="' + esc(prices[m.id] > 0 ? prices[m.id] : '') + '" placeholder="цена листа"></td></tr>';
    });
    return rows || '<tr><td colspan="2" class="muted small">' + (q ? 'Ничего не найдено среди листовых материалов.' : 'Отдельных цен нет. Найдите материал поиском, чтобы задать ему свою цену.') + '</td></tr>';
  }
  function viewSheetPricing(pr) {
    var sh = pr.sheet;
    return '<h2>Расчёт: цена за лист</h2><div class="card">' +
      '<p class="muted small" style="margin-top:0">Распил, кромление и присадка считаются одной ценой за лист материала. Норма кромки и отверстий — сколько входит в цену листа; сверх нормы — доплата.</p>' +
      '<div class="kv"><label class="f">Как считать<select data-s="setting" data-path="pricing.sheet.mode" data-type="text"><option value="sheet"' + (sh.mode === 'sheet' ? ' selected' : '') + '>за лист (распил+кромка+присадка)</option><option value="area"' + (sh.mode === 'area' ? ' selected' : '') + '>по площади, кромка и присадка отдельно</option></select></label>' +
      inp('pricing.sheet.price', 'Цена листа по умолчанию, ₽', sh.price, 'num') +
      inp('pricing.sheet.edgeNorm', 'Кромка в цене листа, м.п. (0 — без ограничения)', sh.edgeNorm, 'num') +
      inp('pricing.sheet.holesNorm', 'Присадка в цене листа, отв. (0 — без ограничения)', sh.holesNorm, 'num') +
      inp('pricing.sheet.edgeExtra', 'Доплата за м.п. кромки сверх нормы, ₽', sh.edgeExtra, 'num') +
      inp('pricing.sheet.holesExtra', 'Доплата за отверстие сверх нормы, ₽', sh.holesExtra, 'num') + '</div>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px;margin-top:14px"><div><h3>Цена по группам материалов</h3><div class="tbl-wrap" style="max-height:320px"><table><thead><tr><th>Группа</th><th class="num">₽ за лист</th></tr></thead><tbody>' + (sheetGroupRows(sh) || '<tr><td colspan="2" class="muted small">В базе нет листовых групп.</td></tr>') + '</tbody></table></div></div>' +
      '<div><h3>Отдельные материалы</h3><input id="shQ" placeholder="Найти материал по названию или артикулу" value="' + esc(state.shQ || '') + '" style="width:100%;margin-bottom:6px"><div class="tbl-wrap" style="max-height:290px"><table><thead><tr><th>Материал</th><th class="num">₽ за лист</th></tr></thead><tbody id="shRows">' + sheetMatRows(sh) + '</tbody></table></div></div></div>' +
      '<p class="muted small">Порядок цены: материал → его группа (или группа выше) → цена по умолчанию.</p></div>';
  }

  function viewSettings() {
    var s = state.db.settings, pr = s.pricing, cn = pr.cnc, co = s.company;
    return '<h1>Настройки</h1>' +
      '<h2>Компания (для шапки КП и счетов)</h2><div class="card"><div class="kv">' + inp('company.name', 'Название', co.name) + inp('company.phone', 'Телефон', co.phone) + inp('company.email', 'Почта', co.email) + inp('company.address', 'Адрес', co.address) + inp('company.executor', 'Исполнитель (ФИО)', co.executor) + '</div>' +
      '<label class="f" style="margin-top:10px">Реквизиты для оплаты (в счёте)<textarea data-s="setting" data-path="company.bank" data-type="text" rows="3">' + esc(co.bank) + '</textarea></label></div>' +
      '<h2>Документы</h2><div class="card"><div class="kv">' + inp('quotePrefix', 'Префикс номера', s.quotePrefix) + inp('nextNumber', 'Следующий номер', s.nextNumber, 'num') + inp('validDays', 'КП действует, дней', s.validDays, 'num') + '</div>' +
      '<label class="f" style="margin-top:10px">Текст внизу документов<textarea data-s="setting" data-path="docNote" data-type="text" rows="2">' + esc(s.docNote) + '</textarea></label></div>' +
      viewSheetPricing(pr) +
      '<h2>Распил</h2><div class="card"><div class="kv"><label class="f">Считать по умолчанию<select data-s="setting" data-path="pricing.areaBasis" data-type="text"><option value="parts"' + (pr.areaBasis === 'parts' ? ' selected' : '') + '>по площади деталей</option><option value="sheets"' + (pr.areaBasis === 'sheets' ? ' selected' : '') + '>по площади листов</option></select></label>' +
      inp('pricing.minOrder', 'Минимальная сумма заказа, ₽', pr.minOrder, 'num') + inp('pricing.kerf', 'Пропил, мм', pr.kerf, 'num') + inp('pricing.trim', 'Обрезка кромки листа, мм', pr.trim, 'num') + inp('pricing.minOffcut', 'Деловой остаток от, мм', pr.minOffcut, 'num') + '</div></div>' +
      '<h2>ЧПУ: присадка и фрезеровка</h2><div class="card"><p class="muted small" style="margin-top:0">Отметьте, какие способы входят в цену. Можно включить несколько — суммы сложатся.</p><div class="row">' +
      chk('pricing.cnc.enabled.holes', 'За каждое отверстие', cn.enabled.holes) + chk('pricing.cnc.enabled.mill', 'За погонный метр фрезеровки', cn.enabled.mill) + chk('pricing.cnc.enabled.perPart', 'За деталь на ЧПУ', cn.enabled.perPart) + chk('pricing.cnc.enabled.time', 'По времени станка', cn.enabled.time) + '</div>' +
      '<div class="kv" style="margin-top:12px">' + inp('pricing.cnc.holeFaceBlind', 'Глухое в пласть, ₽', cn.holeFaceBlind, 'num') + inp('pricing.cnc.holeFaceThrough', 'Сквозное, ₽', cn.holeFaceThrough, 'num') + inp('pricing.cnc.holeEdge', 'В торец, ₽', cn.holeEdge, 'num') + inp('pricing.cnc.millPerM', 'Фрезеровка за м.п., ₽', cn.millPerM, 'num') + inp('pricing.cnc.perPart', 'За деталь на ЧПУ, ₽', cn.perPart, 'num') +
      inp('pricing.cnc.machineHourRate', 'Час станка, ₽', cn.machineHourRate, 'num') + inp('pricing.cnc.secPerHole', 'Время на отверстие, с', cn.secPerHole, 'num') + inp('pricing.cnc.secPerMillM', 'Время на 1 м фрезеровки, с', cn.secPerMillM, 'num') + inp('pricing.cnc.secPerPart', 'Время на деталь (установка), с', cn.secPerPart, 'num') + '</div></div>' +
      '<h2>Данные</h2><div class="card row"><button class="btn ghost" data-act="open-data">Открыть папку с данными и копиями</button><span class="muted small">Резервная копия базы создаётся каждый день, хранятся последние 30.</span></div>';
  }

  // ---------- общий рендер ----------
  function render() {
    var v = state.view === 'order' ? 'orders' : state.view;
    document.querySelectorAll('#nav button').forEach(function (b) { b.classList.toggle('active', b.dataset.view === v); });
    var html;
    if (!state.db) html = '<div class="empty">Загрузка…</div>';
    else if (state.view === 'orders') html = viewOrders();
    else if (state.view === 'order') html = viewOrder();
    else if (state.view === 'clients') html = viewClients();
    else if (state.view === 'offcuts') html = viewOffcuts();
    else if (state.view === 'materials') html = SM.view();
    else html = viewSettings();
    $('#view').innerHTML = html;
    if (state.view === 'order' && state.tab === 'model') mountModel();
  }

  function afterOrderChange(o, opts) {
    var q = recalc(o);
    var s = $('#summary'); if (s) s.innerHTML = summaryHtml(o, q);
    var cl = $('#calc-lines'); if (cl) cl.innerHTML = calcLinesHtml(o, q);
    touch(o);
    return q;
  }

  function setPath(obj, path, val) {
    var ks = path.split('.');
    for (var i = 0; i < ks.length - 1; i++) { obj[ks[i]] = obj[ks[i]] || {}; obj = obj[ks[i]]; }
    obj[ks[ks.length - 1]] = val;
  }

  // ---------- правки в полях ----------
  function onEdit(ev) {
    var t = ev.target, s = t.dataset && t.dataset.s;
    if (!s) return;
    var isBox = t.tagName === 'SELECT' || t.type === 'checkbox' || t.type === 'date';
    if (ev.type === 'input' && isBox) return;
    if (ev.type === 'change' && !isBox) return;
    var val = t.type === 'checkbox' ? t.checked : t.value;
    var o = state.orderId ? getOrder(state.orderId) : null;

    if (s === 'part' || s === 'partedge') {
      var tr = t.closest('tr'); var p = o && o.parts.find(function (x) { return x.id === tr.dataset.pid; });
      if (!p) return;
      if (s === 'partedge') { p.edges = p.edges || {}; p.edges[t.dataset.f] = val; } else p[t.dataset.f] = val;
      afterOrderChange(o);
    } else if (s === 'order') {
      if (!o) return;
      o[t.dataset.f] = val;
      var q = afterOrderChange(o);
      if (t.dataset.f === 'status' || t.dataset.f === 'clientId') { /* список обновится при возврате */ }
      if (t.dataset.f === 'areaBasis' || t.dataset.f === 'ownMaterial' || t.dataset.f === 'ownEdge') { /* строки уже обновлены */ }
    } else if (s === 'extra') {
      var xi = +t.closest('tr').dataset.xi;
      if (o && o.extraLines[xi]) { o.extraLines[xi][t.dataset.f] = val; afterOrderChange(o); }
    } else if (s === 'est') {
      if (o) SM.onEstEdit(t, o);
    } else if (s === 'docopt') {
      state.docOpts[t.dataset.f] = val;
    } else if (s === 'setting') {
      var dt = t.dataset.type, v = val;
      if (dt === 'num') v = P.num(val); else if (dt === 'bool') v = !!val;
      setPath(state.db.settings, t.dataset.path, v);
      scheduleSave();
    }
  }
  document.addEventListener('input', function (ev) {
    if (ev.target && ev.target.id === 'shQ') { state.shQ = ev.target.value; var tb = document.getElementById('shRows'); if (tb) tb.innerHTML = sheetMatRows(state.db.settings.pricing.sheet); return; }
    if (SM.onInput(ev)) return; onEdit(ev); });
  document.addEventListener('change', function (ev) {
    if (SM.onInput(ev)) return;
    onEdit(ev);
    var t = ev.target;
    if (t.id === 'statusFilter') { state.statusFilter = t.value; render(); }
    if (t.id === 'mdlXray') Model3D.setXray(t.checked);
    if (t.id === 'mdlHw') Model3D.setHardware(t.checked);
  });
  document.addEventListener('input', function (ev) {
    if (ev.target.id === 'mdlExplode') { Model3D.setExplode(+ev.target.value / 100); return; }
    if (ev.target.id === 'search') {
      state.search = ev.target.value;
      var pos = ev.target.selectionStart;
      render();
      var el = $('#search'); if (el) { el.focus(); el.setSelectionRange(pos, pos); }
    }
  });
  document.addEventListener('submit', function (ev) {
    if (ev.target.id === 'pay-form') {
      ev.preventDefault();
      var o = getOrder(state.orderId), f = ev.target.elements;
      var amount = P.num(f.amount.value);
      if (!amount) { toast('Укажите сумму', true); return; }
      o.payments.push({ date: f.date.value ? new Date(f.date.value).toISOString() : nowIso(), amount: amount, note: f.note.value });
      recalc(o); touch(o); render();
    }
  });

  // ---------- действия ----------
  async function doImport(o) {
    var r = await window.api.pickImport();
    if (!r) return;
    if (r.error) { toast(r.error, true); return; }
    if (r.kind === 'b3d') { importB3d(o, r); return; }
    var res;
    if (r.kind === 'zip') {
      res = { parts: [], warnings: ['В архиве .bmk нет JSON-файлов, формат не распознан.'] };
      for (var i = 0; i < (r.jsonTexts || []).length; i++) {
        var one = IMP.parseBmkText(r.jsonTexts[i].text, state.base);
        if (one.parts.length > res.parts.length) res = one;
      }
    } else if (/\.(csv|txt|tsv)$/i.test(r.name)) res = IMP.parseCsv(r.text, state.base);
    else {
      res = IMP.parseBmkText(r.text, state.base);
      if (!res.parts.length) { var c = IMP.parseCsv(r.text, state.base); if (c.parts.length) res = c; }
    }
    if (res.parts.length) {
      res.parts.forEach(function (p) { o.parts.push(p); });
      if (!o.files.some(function (f) { return f.path === r.path; })) o.files.push({ path: r.path, name: r.name, added: nowIso() });
      afterOrderChange(o); render();
      toast('Загружено деталей: ' + res.parts.length);
    }
    if (res.warnings.length) {
      openModal({ title: res.parts.length ? 'Загружено с замечаниями' : 'Не удалось загрузить', text: res.warnings.map(esc).join('<br>'), fields: [], noSubmit: true, cancelLabel: 'Понятно' });
    }
  }

  function importB3d(o, r) {
    var res = B3D.toOrder(r.parsed, state.mb, MB);
    saveBase();
    res.parts.forEach(function (p) { o.parts.push(p); });
    if (res.model) { res.model.file = r.path; o.models = (o.models || []).filter(function (m) { return m.file !== r.path; }); o.models.push(res.model); state.modelSel = -1; }
    if (!o.estimate) o.estimate = { inTotal: false, items: [] };
    if (!o.estimate.items) o.estimate.items = [];
    res.items.forEach(function (x) { o.estimate.items.push(x); });
    if (!o.files.some(function (f) { return f.path === r.path; })) o.files.push({ path: r.path, name: r.name, added: nowIso() });
    afterOrderChange(o); render();
    var pcs = res.parts.reduce(function (s, p) { return s + p.qty; }, 0);
    toast('Модель «' + (res.name || r.name) + '»: деталей ' + pcs + ' (' + res.parts.length + ' строк), фурнитуры ' + res.items.length + ' позиций');
    var info = [];
    if (res.created.length) info.push('Не нашёл в базе и добавил ' + res.created.length + ' позиций (материалы, кромка, фурнитура) — откройте «Смета» и заполните цены.');
    info = info.concat(res.warnings);
    info.push('Фурнитура попала во вкладку «Смета» заказа (не в общую сумму — включите там, когда проверите цены).');
    openModal({ title: 'Модель загружена', text: info.map(esc).join('<br><br>'), fields: [], noSubmit: true, cancelLabel: 'Понятно' });
  }

  async function makeDoc(o, kind) {
    var q = recalc(o);
    if (!q.lines.length) { toast('В заказе нет позиций для документа', true); return; }
    o.docDate = nowIso();
    var html = D.buildDocHtml(o, q, getClient(o.clientId), state.db.settings, kind, state.docOpts);
    var res = await window.api.makePdf({ html: html, name: (kind === 'invoice' ? 'Счёт ' : 'КП ') + o.number });
    if (!res) return;
    o.documents.push({ name: res.name, path: res.path, kind: kind, date: nowIso() });
    touch(o); toast('PDF сохранён: ' + res.name);
    if (state.tab === 'pay') render();
  }

  SM = SmetaUI.create({
    state: state, esc: esc, money: money, openModal: openModal, closeModal: closeModal, confirmBox: confirmBox, toast: toast,
    render: render, getOrder: getOrder, getClient: getClient, afterOrderChange: afterOrderChange, touch: touch, recalc: recalc, saveBase: saveBase
  });

  var actions = {
    'modal-cancel': function () { closeModal(); },
    'new-order': function () { newOrderModal(); },
    'open-order': function (el) { state.orderId = el.dataset.id; state.view = 'order'; state.tab = 'parts'; render(); },
    'back': function () { state.view = 'orders'; render(); },
    'tab': function (el) { state.tab = el.dataset.tab; state.modelSel = -1; render(); },
    'mdl-sel': function (el, ev) { if (ev && ev.target.closest('[data-act="mdl-hide"]')) return; modelSelect(getOrder(state.orderId), +el.dataset.i, true); },
    'mdl-hide': function (el) { var i = +el.dataset.i, h = !Model3D.isHidden(i); Model3D.hide(i, h); var r = el.closest('.mtree-row'); r.classList.toggle('hid', h); el.textContent = h ? '◌' : '●'; },
    'mdl-showall': function () { Model3D.showAll(); document.querySelectorAll('.mtree-row').forEach(function (r) { r.classList.remove('hid'); var b = r.querySelector('button'); if (b) b.textContent = '●'; }); },
    'mdl-view': function (el) { Model3D.view(el.dataset.v); },
    'mdl-focus': function (el) { Model3D.focus(+el.dataset.i); },
    'mdl-topart': function (el) { state.tab = 'parts'; render(); var r = document.querySelector('tr[data-pid="' + el.dataset.pid + '"]'); if (r) { r.scrollIntoView({ block: 'center' }); r.classList.add('flash'); } },
    'add-part': function () {
      var o = getOrder(state.orderId), last = o.parts[o.parts.length - 1];
      o.parts.push({ id: uid('p'), name: '', materialId: last ? last.materialId : ((state.base.materials[0] || {}).id || ''), l: '', w: '', qty: 1, grain: false, edges: {}, holesFaceBlind: '', holesFaceThrough: '', holesEdge: '', millM: '' });
      afterOrderChange(o); render();
      var rows = document.querySelectorAll('#parts-body tr'); var lr = rows[rows.length - 1]; if (lr) lr.querySelector('input').focus();
    },
    'del-part': function (el) { var o = getOrder(state.orderId); o.parts = o.parts.filter(function (p) { return p.id !== el.dataset.id; }); afterOrderChange(o); render(); },
    'clear-parts': function () { confirmBox('Удалить все детали из заказа?', function () { var o = getOrder(state.orderId); o.parts = []; afterOrderChange(o); render(); }, 'Удалить'); },
    'import': function () { doImport(getOrder(state.orderId)); },
    'csv-template': async function () { var p = await window.api.saveCsvTemplate(IMP.csvTemplate()); if (p) toast('Шаблон сохранён'); },
    'add-extra': function () { var o = getOrder(state.orderId); o.extraLines.push({ title: '', qty: 1, unit: 'шт.', price: '' }); afterOrderChange(o); render(); },
    'del-extra': function (el) { var o = getOrder(state.orderId); o.extraLines.splice(+el.dataset.i, 1); afterOrderChange(o); render(); },
    'make-doc': function (el) { makeDoc(getOrder(state.orderId), el.dataset.kind); },
    'stock-offcuts': function (el) {
      var o = getOrder(state.orderId), q = recalc(o);
      if (o.offcutsAdded) { toast('Остатки этого заказа уже добавлены на склад', true); return; }
      var n = 0;
      q.cutting.forEach(function (c) {
        if (c.materialId !== el.dataset.mid) return;
        c.packing.sheets.forEach(function (s) { s.offcuts.forEach(function (f) { state.db.offcuts.push({ id: uid('f'), materialId: c.materialId, w: Math.round(f.w), h: Math.round(f.h), qty: 1, orderId: o.id, date: nowIso(), note: '' }); n++; }); });
      });
      if (n) { scheduleSave(); toast('Добавлено остатков: ' + n); }
    },
    'del-pay': function (el) { var o = getOrder(state.orderId); o.payments.splice(+el.dataset.i, 1); recalc(o); touch(o); render(); },
    'attach': async function () { var o = getOrder(state.orderId); var fl = await window.api.attachFiles(); if (fl && fl.length) { o.files = o.files.concat(fl); touch(o); render(); } },
    'del-file': function (el) { var o = getOrder(state.orderId); o.files.splice(+el.dataset.i, 1); touch(o); render(); },
    'open-file': async function (el) { var o = getOrder(state.orderId); var f = o[el.dataset.p][+el.dataset.i]; var err = await window.api.openPath(f.path); if (err) toast(err, true); },
    'show-file': function (el) { var o = getOrder(state.orderId); window.api.showInFolder(o.documents[+el.dataset.i].path); },
    'dup-order': function () {
      var o = getOrder(state.orderId), s = state.db.settings;
      var c = JSON.parse(JSON.stringify(o));
      c.id = uid('o'); c.number = (s.quotePrefix || '') + String(s.nextNumber).padStart(4, '0'); s.nextNumber++;
      c.created = nowIso(); c.updated = nowIso(); c.status = 'calc'; c.payments = []; c.documents = []; c.offcutsAdded = false;
      c.parts.forEach(function (p) { p.id = uid('p'); });
      state.db.orders.push(c); recalc(c); state.orderId = c.id; scheduleSave(); render(); toast('Создана копия ' + c.number);
    },
    'del-order': function () {
      var o = getOrder(state.orderId);
      confirmBox('Удалить заказ ' + o.number + ' вместе с оплатами? Это нельзя отменить.', function () {
        state.db.orders = state.db.orders.filter(function (x) { return x.id !== o.id; });
        delete state.quotes[o.id]; state.view = 'orders'; scheduleSave(); render();
      }, 'Удалить');
    },
    'new-client': function () { clientModal(null); },
    'new-client-order': function () { clientModal(null, function (c) { var o = getOrder(state.orderId); o.clientId = c.id; touch(o); render(); }); },
    'edit-client': function (el) { clientModal(getClient(el.dataset.id)); },
    'del-client': function (el) { state.db.clients = state.db.clients.filter(function (c) { return c.id !== el.dataset.id; }); closeModal(); scheduleSave(); render(); },
    'new-offcut': function () { offcutModal(); },
    'use-offcut': function (el) {
      var f = state.db.offcuts.find(function (x) { return x.id === el.dataset.id; });
      if (!f) return; f.qty--; if (f.qty <= 0) state.db.offcuts = state.db.offcuts.filter(function (x) { return x.id !== f.id; });
      scheduleSave(); render();
    },
    'del-offcut': function (el) { state.db.offcuts = state.db.offcuts.filter(function (x) { return x.id !== el.dataset.id; }); scheduleSave(); render(); },
    'mat-show': function () { window.api.showInFolder(state.matInfo.path); },
    'open-data': function () { window.api.openDataDir(); }
  };
  Object.assign(actions, SM.actions);
  document.addEventListener('click', function (ev) {
    var nav = ev.target.closest('#nav button');
    if (nav) { state.view = nav.dataset.view; if (state.baseDirty && state.view !== 'materials') { state.baseDirty = false; state.db.orders.forEach(function (o) { recalc(o); }); } render(); return; }
    var el = ev.target.closest('[data-act]');
    if (!el) return;
    var fn = actions[el.dataset.act];
    if (fn) { ev.stopPropagation(); fn(el); }
  });


  // ---------- масштаб интерфейса: Ctrl +/−/0, Ctrl+колесо, кнопки внизу меню; по умолчанию подгоняется под ширину окна ----------
  var zoomPref = null; // null = авто
  try { var zs = localStorage.getItem('uiZoom'); if (zs && zs !== 'auto') zoomPref = Number(zs) || null; } catch (_) {}
  function autoZoom() { return Math.max(1, Math.min(1.8, Math.round(window.innerWidth / 1500 * 20) / 20)); }
  function applyZoom() {
    var z = zoomPref || autoZoom();
    if (window.api && window.api.setZoom) window.api.setZoom(z);
    var el = document.getElementById('zoom-val'); if (el) el.textContent = Math.round(z * 100) + '%' + (zoomPref ? '' : ' авто');
  }
  function stepZoom(d) {
    var cur = zoomPref || autoZoom(); zoomPref = d === 0 ? null : Math.max(0.6, Math.min(2.5, Math.round((cur + d) * 20) / 20));
    try { localStorage.setItem('uiZoom', zoomPref ? String(zoomPref) : 'auto'); } catch (_) {}
    applyZoom();
  }
  window.addEventListener('keydown', function (e) {
    if (!(e.ctrlKey || e.metaKey)) return;
    if (e.key === '=' || e.key === '+') { e.preventDefault(); stepZoom(0.1); }
    else if (e.key === '-' || e.key === '_') { e.preventDefault(); stepZoom(-0.1); }
    else if (e.key === '0') { e.preventDefault(); stepZoom(0); }
  });
  window.addEventListener('wheel', function (e) { if (e.ctrlKey) { e.preventDefault(); stepZoom(e.deltaY < 0 ? 0.1 : -0.1); } }, { passive: false });
  window.addEventListener('resize', function () { if (!zoomPref) applyZoom(); });
  document.addEventListener('click', function (e) { if (e.target.id === 'zm-') stepZoom(-0.1); else if (e.target.id === 'zp') stepZoom(0.1); });

  // ---------- запуск ----------
  // ---------- база материалов («Смета») ----------
  var mbTimer = null;
  function rebuildLegacy() {
    state.base = MB.toLegacy(state.mb);
    window.__base = state.base;
  }
  function saveBase() {
    rebuildLegacy(); state.baseDirty = true;
    clearTimeout(mbTimer);
    mbTimer = setTimeout(function () {
      window.api.saveSmeta(state.mb).then(function (r) { if (r && !r.ok) toast('Не удалось сохранить базу материалов: ' + r.error, true); });
    }, 500);
  }
  async function loadBase() {
    var r = await window.api.loadSmeta();
    state.matInfo = { path: r.path, error: r.error || '' };
    if (r.data && Array.isArray(r.data.groups) && Array.isArray(r.data.materials)) state.mb = r.data;
    else {
      // первый запуск: переносим прежнюю базу materials.json в «Смету»
      var lr = await window.api.loadMaterials(state.db.settings.materialsPath || '');
      state.mb = MB.fromLegacy(lr.data);
      if (!lr.ok && !state.matInfo.error) state.matInfo.error = lr.error;
      await window.api.saveSmeta(state.mb);
    }
    if (MB.migrate(state.mb)) await window.api.saveSmeta(state.mb);
    rebuildLegacy();
    state.db.orders.forEach(function (o) { recalc(o); });
  }

  async function init() {
    var info = await window.api.appInfo();
    document.title = info.name; $('#ver').textContent = 'v' + info.version; applyZoom();
    var res = await window.api.loadDb();
    var db = res.db || defaultDb();
    var def = defaultDb();
    db.settings = Object.assign({}, def.settings, db.settings || {});
    db.settings.company = Object.assign({}, def.settings.company, db.settings.company || {});
    db.settings.pricing = Object.assign({}, def.settings.pricing, db.settings.pricing || {});
    db.settings.pricing.sheet = Object.assign({}, P.defaultPricing().sheet, db.settings.pricing.sheet || {});
    db.settings.pricing.cnc = Object.assign({}, def.settings.pricing.cnc, db.settings.pricing.cnc || {});
    db.settings.pricing.cnc.enabled = Object.assign({}, def.settings.pricing.cnc.enabled, db.settings.pricing.cnc.enabled || {});
    db.clients = db.clients || []; db.orders = db.orders || []; db.offcuts = db.offcuts || [];
    state.db = db;
    if (res.error) toast(res.error, true);
    await loadBase();
    if (state.matInfo.error) toast(state.matInfo.error, true);
    render();
  }
  window.__app = { state: state, render: render, actions: actions, importB3d: importB3d }; // для отладки и проверок
  init();
})();
