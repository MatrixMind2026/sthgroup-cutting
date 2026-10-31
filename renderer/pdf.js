/* Печатные формы: КП и счёт (HTML для PDF), карты раскроя (SVG). */
(function () {
  function esc(s) {
    return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(n) {
    return Number(n || 0).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function qtyFmt(n) {
    return Number(n || 0).toLocaleString('ru-RU', { maximumFractionDigits: 2 });
  }
  function dateRu(iso) {
    const d = iso ? new Date(iso) : new Date();
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  var MARK = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 72" width="54" height="54">' +
    '<defs><mask id="holeDoc" maskUnits="userSpaceOnUse" x="0" y="0" width="72" height="72"><rect width="72" height="72" fill="#fff"/><circle cx="19" cy="36" r="4.5" fill="#000"/></mask></defs>' +
    '<rect x="0" y="0" width="38" height="72" rx="3" fill="#23262B" mask="url(#holeDoc)"/>' +
    '<rect x="41" y="0" width="31" height="40" rx="3" fill="#F26B1D"/>' +
    '<rect x="41" y="43" width="31" height="29" rx="3" fill="#9AA0A6"/></svg>';

  /** Карта раскроя одного листа. partNo: {partId: номер детали в заказе} */
  function sheetMapSvg(sheet, sheetW, sheetH, trim, partNo) {
    var fs = Math.max(14, sheetW / 75);
    var out = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + sheetW + ' ' + sheetH + '" font-family="Segoe UI, Arial, sans-serif">';
    out += '<rect x="0" y="0" width="' + sheetW + '" height="' + sheetH + '" fill="#f7f5f0" stroke="#23262B" stroke-width="3"/>';
    if (trim) out += '<rect x="' + trim + '" y="' + trim + '" width="' + (sheetW - 2 * trim) + '" height="' + (sheetH - 2 * trim) + '" fill="none" stroke="#9AA0A6" stroke-width="1.5" stroke-dasharray="10 8"/>';
    (sheet.offcuts || []).forEach(function (o) {
      out += '<rect x="' + o.x + '" y="' + o.y + '" width="' + o.w + '" height="' + o.h + '" fill="#fde5d3" stroke="#F26B1D" stroke-width="2" stroke-dasharray="14 8"/>';
      if (o.w > fs * 7 && o.h > fs * 2.5) {
        out += '<text x="' + (o.x + o.w / 2) + '" y="' + (o.y + o.h / 2 + fs / 3) + '" text-anchor="middle" font-size="' + fs + '" fill="#a55400">ост. ' + Math.round(o.w) + '×' + Math.round(o.h) + '</text>';
      }
    });
    sheet.placed.forEach(function (p) {
      out += '<rect x="' + p.x + '" y="' + p.y + '" width="' + p.w + '" height="' + p.h + '" fill="#cfd5dc" stroke="#23262B" stroke-width="2"/>';
      var no = partNo && partNo[p.partId] ? partNo[p.partId] : '';
      if (p.w > fs * 4 && p.h > fs * 2.6) {
        out += '<text x="' + (p.x + p.w / 2) + '" y="' + (p.y + p.h / 2 - fs * 0.1) + '" text-anchor="middle" font-size="' + (fs * 1.15) + '" font-weight="700" fill="#23262B">' + esc(no) + '</text>';
        out += '<text x="' + (p.x + p.w / 2) + '" y="' + (p.y + p.h / 2 + fs * 1.15) + '" text-anchor="middle" font-size="' + fs + '" fill="#3a3f46">' + Math.round(p.w) + '×' + Math.round(p.h) + '</text>';
      } else if (p.w > fs * 2 && p.h > fs * 1.4) {
        out += '<text x="' + (p.x + p.w / 2) + '" y="' + (p.y + p.h / 2 + fs / 3) + '" text-anchor="middle" font-size="' + fs + '" fill="#23262B">' + esc(no) + '</text>';
      }
    });
    return out + '</svg>';
  }

  function partNumbers(order) {
    var m = {};
    (order.parts || []).forEach(function (p, i) { m[p.id] = i + 1; });
    return m;
  }

  function cuttingMapsHtml(order, quote) {
    var no = partNumbers(order);
    var html = '';
    (quote.cutting || []).forEach(function (c) {
      var pk = c.packing;
      html += '<h3>' + esc(c.material.name) + ' — листов: ' + c.sheets + ' (' + pk.sheetW + '×' + pk.sheetH + ' мм)</h3>';
      pk.sheets.forEach(function (s) {
        html += '<div class="map"><div class="cap">Лист ' + s.index + ' · заполнено ' + Math.round(s.utilization * 100) + '%</div>' + sheetMapSvg(s, pk.sheetW, pk.sheetH, pk.trim, no) + '</div>';
      });
    });
    return html;
  }

  /**
   * kind: 'quote' | 'invoice'. opts: {includeParts, includeMaps}
   */
  function buildDocHtml(order, quote, client, settings, kind, opts) {
    opts = opts || {};
    var co = settings.company || {};
    var isInv = kind === 'invoice';
    var title = (isInv ? 'Счёт на оплату' : 'Коммерческое предложение') + ' № ' + esc(order.number);
    var rows = quote.lines.map(function (l, i) {
      return '<tr><td class="c">' + (i + 1) + '</td><td>' + esc(l.title) + '</td><td class="r">' + qtyFmt(l.qty) + '</td><td class="c">' + esc(l.unit) + '</td><td class="r">' + money(l.price) + '</td><td class="r">' + money(l.sum) + '</td></tr>';
    }).join('');
    var tot = '';
    tot += '<tr><td class="r">Итого по позициям:</td><td class="r">' + money(quote.subtotal) + '</td></tr>';
    if (quote.discount) tot += '<tr><td class="r">Скидка ' + qtyFmt(quote.discountPct) + '%:</td><td class="r">− ' + money(quote.discount) + '</td></tr>';
    if (quote.minTopUp) tot += '<tr><td class="r">Доплата до минимальной суммы заказа (' + money(quote.minOrder) + '):</td><td class="r">' + money(quote.minTopUp) + '</td></tr>';
    tot += '<tr class="big"><td class="r">К оплате:</td><td class="r">' + money(quote.total) + ' ₽</td></tr>';
    if (isInv && quote.paid) {
      tot += '<tr><td class="r">Оплачено:</td><td class="r">' + money(quote.paid) + '</td></tr>';
      tot += '<tr class="big"><td class="r">Остаток к оплате:</td><td class="r">' + money(Math.max(0, quote.debt)) + ' ₽</td></tr>';
    }
    var clientBlock = '';
    if (client) {
      clientBlock = '<div class="box"><b>Заказчик:</b> ' + esc(client.company || client.name) +
        (client.company && client.name ? ', ' + esc(client.name) : '') +
        (client.phone ? '<br>Тел.: ' + esc(client.phone) : '') + (client.email ? ' · ' + esc(client.email) : '') +
        (client.details ? '<br>' + esc(client.details).replace(/\n/g, '<br>') : '') + '</div>';
    }
    var parts = '';
    if (opts.includeParts) {
      var matName = function (id) { var m = (window.__base && window.__base.materials || []).find(function (x) { return x.id === id; }); return m ? m.name : ''; };
      parts = '<h3 class="pb">Приложение 1. Перечень деталей</h3><table class="t"><thead><tr><th>№</th><th>Деталь</th><th>Материал</th><th>Длина</th><th>Ширина</th><th>Шт.</th></tr></thead><tbody>' +
        (order.parts || []).map(function (p, i) {
          return '<tr><td class="c">' + (i + 1) + '</td><td>' + esc(p.name) + '</td><td>' + esc(matName(p.materialId)) + '</td><td class="r">' + esc(p.l) + '</td><td class="r">' + esc(p.w) + '</td><td class="r">' + esc(p.qty) + '</td></tr>';
        }).join('') + '</tbody></table>';
    }
    var maps = opts.includeMaps ? '<h3 class="pb">Приложение 2. Карты раскроя</h3>' + cuttingMapsHtml(order, quote) : '';
    var contacts = [co.phone, co.email, co.address].filter(Boolean).map(esc).join(' · ');
    var valid = (!isInv && settings.validDays) ? '<p class="note">Предложение действительно ' + esc(settings.validDays) + ' дн. с даты составления.</p>' : '';
    return '<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>' + title + '</title><style>' +
      '*{box-sizing:border-box}body{font-family:"Segoe UI",Arial,sans-serif;font-size:12.5px;color:#1d1f23;margin:0}' +
      '.head{display:flex;align-items:center;gap:14px;border-bottom:3px solid #F26B1D;padding-bottom:10px;margin-bottom:14px}' +
      '.brand{font-size:26px;font-weight:700;color:#23262B}.brand b{color:#F26B1D}.sub{color:#555;font-size:11.5px;margin-top:2px}' +
      'h1{font-size:19px;margin:0 0 4px}h3{font-size:14px;margin:16px 0 6px}.pb{page-break-before:always}' +
      '.meta{color:#555;margin-bottom:10px}.box{border:1px solid #d9d5cb;border-radius:6px;padding:8px 10px;margin:8px 0;line-height:1.5}' +
      'table.t{border-collapse:collapse;width:100%;margin-top:8px}table.t th{background:#23262B;color:#fff;font-weight:600;padding:6px 7px;text-align:left;font-size:11.5px}' +
      'table.t td{border-bottom:1px solid #d9d5cb;padding:6px 7px}.r{text-align:right;white-space:nowrap}.c{text-align:center}' +
      'table.tot{margin:10px 0 0 auto;border-collapse:collapse}table.tot td{padding:4px 8px}table.tot tr.big td{font-weight:700;font-size:15px;border-top:2px solid #23262B}' +
      '.note{color:#555;margin-top:12px}.sign{margin-top:28px}.map{break-inside:avoid;margin:8px 0}.map .cap{font-size:11px;color:#555;margin-bottom:2px}.map svg{width:100%;height:auto}' +
      '</style></head><body>' +
      '<div class="head">' + MARK + '<div><div class="brand">STH<b>Group</b></div><div class="sub">' + esc(co.name && co.name !== 'STHGroup' ? co.name : 'Производство мебели · распил и ЧПУ') + '</div>' +
      (contacts ? '<div class="sub">' + contacts + '</div>' : '') + '</div></div>' +
      '<h1>' + title + '</h1><div class="meta">от ' + dateRu(order.docDate || new Date().toISOString()) + (order.title ? ' · ' + esc(order.title) : '') + '</div>' +
      clientBlock +
      '<table class="t"><thead><tr><th class="c">№</th><th>Наименование работ и материалов</th><th class="r">Кол-во</th><th class="c">Ед.</th><th class="r">Цена, ₽</th><th class="r">Сумма, ₽</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      '<table class="tot">' + tot + '</table>' +
      (isInv && co.bank ? '<div class="box"><b>Реквизиты для оплаты:</b><br>' + esc(co.bank).replace(/\n/g, '<br>') + '</div>' : '') +
      valid +
      (settings.docNote ? '<p class="note">' + esc(settings.docNote).replace(/\n/g, '<br>') + '</p>' : '') +
      (co.executor ? '<div class="sign">Исполнитель: ' + esc(co.executor) + ' ____________________</div>' : '') +
      parts + maps + '</body></html>';
  }


  var DOC_CSS = '*{box-sizing:border-box}body{font-family:"Segoe UI",Arial,sans-serif;font-size:12.5px;color:#1d1f23;margin:0}' +
    '.head{display:flex;align-items:center;gap:14px;border-bottom:3px solid #F26B1D;padding-bottom:10px;margin-bottom:14px}' +
    '.brand{font-size:26px;font-weight:700;color:#23262B}.brand b{color:#F26B1D}.sub{color:#555;font-size:11.5px;margin-top:2px}' +
    'h1{font-size:19px;margin:0 0 4px}.meta{color:#555;margin-bottom:10px}.box{border:1px solid #d9d5cb;border-radius:6px;padding:8px 10px;margin:8px 0;line-height:1.5}' +
    'table.t{border-collapse:collapse;width:100%;margin-top:8px}table.t th{background:#23262B;color:#fff;font-weight:600;padding:6px 7px;text-align:left;font-size:11.5px}' +
    'table.t td{border-bottom:1px solid #d9d5cb;padding:6px 7px}.r{text-align:right;white-space:nowrap}.c{text-align:center}' +
    'table.tot{margin:10px 0 0 auto;border-collapse:collapse}table.tot td{padding:4px 8px}table.tot tr.big td{font-weight:700;font-size:15px;border-top:2px solid #23262B}' +
    '.note{color:#555;margin-top:12px}.sign{margin-top:28px}';

  /** Смета заказа: позиции из базы материалов, только цены продажи. */
  function buildEstimateHtml(order, items, client, settings) {
    var co = settings.company || {};
    var rows = items.filter(function (x) { return x.name; }).map(function (x, i) {
      var sum = (Number(String(x.qty).replace(',', '.')) || 0) * (Number(String(x.priceSell).replace(',', '.')) || 0);
      x._sum = sum;
      return '<tr><td class="c">' + (i + 1) + '</td><td>' + esc(x.name) + '</td><td>' + esc(x.article || '') + '</td><td class="c">' + esc(x.unit || '') + '</td><td class="r">' + qtyFmt(x.qty) + '</td><td class="r">' + money(x.priceSell) + '</td><td class="r">' + money(sum) + '</td></tr>';
    }).join('');
    var total = items.reduce(function (a, x) { return a + (x._sum || 0); }, 0);
    var contacts = [co.phone, co.email, co.address].filter(Boolean).map(esc).join(' · ');
    var clientBlock = client ? '<div class="box"><b>Заказчик:</b> ' + esc(client.company || client.name) + (client.company && client.name ? ', ' + esc(client.name) : '') + (client.phone ? '<br>Тел.: ' + esc(client.phone) : '') + '</div>' : '';
    return '<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Смета № ' + esc(order.number) + '</title><style>' + DOC_CSS + '</style></head><body>' +
      '<div class="head">' + MARK + '<div><div class="brand">STH<b>Group</b></div><div class="sub">' + esc(co.name && co.name !== 'STHGroup' ? co.name : 'Производство мебели · распил и ЧПУ') + '</div>' + (contacts ? '<div class="sub">' + contacts + '</div>' : '') + '</div></div>' +
      '<h1>Смета № ' + esc(order.number) + '</h1><div class="meta">от ' + dateRu(order.docDate || new Date().toISOString()) + (order.title ? ' · ' + esc(order.title) : '') + '</div>' + clientBlock +
      '<table class="t"><thead><tr><th class="c">№</th><th>Наименование</th><th>Артикул</th><th class="c">Ед.</th><th class="r">Кол-во</th><th class="r">Цена, ₽</th><th class="r">Сумма, ₽</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      '<table class="tot"><tr class="big"><td class="r">Итого:</td><td class="r">' + money(total) + ' ₽</td></tr></table>' +
      (settings.docNote ? '<p class="note">' + esc(settings.docNote).replace(/\n/g, '<br>') + '</p>' : '') +
      (co.executor ? '<div class="sign">Исполнитель: ' + esc(co.executor) + ' ____________________</div>' : '') +
      '</body></html>';
  }

  window.Doc = { buildEstimateHtml: buildEstimateHtml, esc: esc, money: money, qtyFmt: qtyFmt, dateRu: dateRu, sheetMapSvg: sheetMapSvg, partNumbers: partNumbers, buildDocHtml: buildDocHtml };
})();
