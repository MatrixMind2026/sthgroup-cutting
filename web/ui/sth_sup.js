/* STHGroup — окно «Поставщик» у строки сметы связано с базой материалов (вариант «B», выбран автором):
   сверху — материал базы этой строки («✓ название», «Сопоставить…»; нет — «Записать в базу» с группой);
   ниже ссылка («Заполнить по ссылке», «Войти на сайт»), цена, поставщик, артикул, фото. «Сохранить» пишет всё в материал базы
   (нет — создаёт его и связывает со строкой); дальше цена берётся из базы во всех проектах.
   Над сметой — «Обновить цены по ссылкам»: строки этой сметы, у материалов которых в базе есть ссылка. */
(function () {
	'use strict';
	var U = window.UI, esc = U.esc, MB = BM.mb, K = window.MatBase, Es = window.Est, T = window.STHShop;
	if (!Es || !K || !T) return;
	var KIND = { panel: 'sheet', linear: 'sheet', edge: 'edge', fastener: 'fit', profile: 'other' };
	var KGRP = { sheet: 'Из моделей: листовые', edge: 'Из моделей: кромка', fit: 'Из моделей: фурнитура', other: 'Из моделей: прочее' };
	function S() { return window.App.S; }
	function num(v) { v = Number(String(v || '').replace(/\s/g, '').replace(',', '.')); return isFinite(v) ? v : 0; }
	function val(v) { return v === '' || v === null || v === undefined ? '' : String(v).replace('.', ','); }
	function normUrl(u) { u = String(u || '').trim(); if (u && !/^https?:\/\//i.test(u)) u = 'https://' + u; return u; }
	function host(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return ''; } }
	function nameOf(w) { return w.kind === 'panel' ? w.skey : (w.skey || w.title); }
	function matOf(w) { var b = MB.cur; if (!b) return null; var m = window.STH.linkOf ? window.STH.linkOf(w) : null; if (m) return m; return w.mb && b.mats[w.mb.id] ? b.mats[w.mb.id] : null; }
	function supByName(b, name, url) {
		name = String(name || '').trim(); if (!name) return null;
		var hit = b.suppliers.filter(function (s) { return String(s.name).toLowerCase() === name.toLowerCase(); })[0];
		return hit || MB.saveSupplier(b, { name: name, url: host(url) ? 'https://' + host(url) : '', phone: '', email: '', note: '' });
	}
	function groupOpts(b, t) { return window.STH.groupOpts(b, t, ''); }

	var sup0 = Es.supEdit;
	Es.supEdit = async function (w) {
		if (!w || w.own || !(w.kind in KIND)) return sup0.apply(this, arguments);
		await K.refresh();
		var b = MB.cur;
		if (!b) return sup0.apply(this, arguments);
		var m = matOf(w), t = KIND[w.kind], name = nameOf(w), sp = m ? MB.supplier(b, m.sup) : null, ws = w.sup || {};
		var st = { url: m ? m.url : (ws.url || ''), price: m ? m.price : (w.price || ''), shop: sp ? sp.name : (ws.shop || ''), art: m ? m.art : (w.art || ''), img: m ? (m.photo || '') : (ws.tex ? '' : (ws.img || '')), stock: undefined, note: '' };
		var shops = b.suppliers.map(function (x) { return '<option value="' + esc(x.name) + '">'; }).join('');
		var unit = m ? m.unit : (w.unit || '');
		var head = m
			? '<div class="row"><span class="sthOk">✓ ' + esc(m.name) + '</span><span class="grow"></span><button id="spMatch">Сопоставить…</button></div><div class="mute sm">' + esc(MB.path(b, m.group).join(' / ')) + ' · цена, ссылка и фото пишутся в этот материал</div>'
			: '<div class="row"><span class="sthWarn">Нет в базе</span><span class="grow"></span><button id="spMatch">Сопоставить…</button></div><div class="row" style="margin-top:8px"><label class="ck"><input type="checkbox" id="spNew" checked> Записать в базу, группа</label><select id="spGrp">' + groupOpts(b, t) + '</select></div>';
		function prev(el) { el.querySelector('#sImg').innerHTML = st.img ? '<img src="' + esc(st.img) + '" alt="">' : '<span class="mute">нет фото</span>'; el.querySelector('#sImgX').disabled = !st.img; }
		var res = await U.modal({ title: 'Поставщик', width: 560, cls: 'supDlg sthSup',
			body: '<p class="mute" style="margin-top:0">' + esc(name) + '</p><div class="sthMb"><div class="mute sm" style="margin-bottom:5px">Материал в базе</div>' + head + '</div>' +
				'<div class="form" style="margin-top:12px"><label>Ссылка</label><div><input type="text" id="sUrl" maxlength="400" value="' + esc(st.url) + '" placeholder="https://… — вставьте ссылку на товар"></div>' +
				'<label></label><div class="row"><button id="spFill" class="primary">Заполнить по ссылке</button><button id="spBrw" title="Найти товар во встроенном браузере и взять ссылку">Браузер…</button><button id="spLogin">Войти на сайт</button><span class="mute sm">цена, артикул, фото, наличие</span></div>' +
				'<label>Цена, ₽</label><div class="row"><input type="text" id="spPrice" value="' + esc(val(st.price)) + '" style="width:120px" placeholder="0"><span class="mute" id="spWas">' + esc(unit ? 'за ' + unit : '') + '</span></div>' +
				'<label>Поставщик</label><div><input type="text" id="sShop" maxlength="80" list="spShops" value="' + esc(st.shop) + '" placeholder="выберите из «Базы» или впишите нового"><datalist id="spShops">' + shops + '</datalist></div>' +
				'<label>Артикул</label><div><input type="text" id="spArt" maxlength="60" value="' + esc(st.art) + '" style="width:200px"></div>' +
				'<label>Фото</label><div class="row"><div class="supImg" id="sImg"></div><div style="display:flex;flex-direction:column;gap:6px"><button id="sImgPick">Выбрать файл…</button><button id="sImgX">Убрать фото</button></div></div>' +
				'<label></label><div class="mute sm">Картинку можно скопировать на сайте магазина и вставить сюда: Ctrl+V.</div></div><div class="sthGot" id="spGot" hidden></div>',
			buttons: [{ label: 'Отмена', value: null }, { label: 'Сохранить', primary: true, run: function (el) {
				var p = el.querySelector('#spPrice').value.trim();
				if (p !== '' && !(num(p) >= 0)) { U.toast('Цена — число не меньше нуля.', { bad: true }); return false; }
				var nw = el.querySelector('#spNew');
				var price = p === '' || (m && !st.priceEdited) || (st.priceRejected && !st.priceEdited) ? null : num(p);
				var quote = st.quote && price === st.quote.price ? st.quote : null;
				return { url: el.querySelector('#sUrl').value.trim(), price: price, shop: el.querySelector('#sShop').value.trim(), art: el.querySelector('#spArt').value.trim(),
					 img: st.img, stock: st.stock, note: st.note, quote: quote, make: !m && nw && nw.checked, grp: el.querySelector('#spGrp') ? el.querySelector('#spGrp').value : '' };
			} }],
			onOpen: function (el, close) {
				prev(el);
				el.querySelector('#spPrice').addEventListener('input', function () { st.priceEdited = true; st.quote = null; });
				el.querySelector('#spMatch').onclick = function () { close({ match: 1 }); };
				el.querySelector('#spLogin').onclick = function () { T.login(el.querySelector('#sUrl').value); };
				/* STHGroup: встроенный браузер — нашли товар, «Взять эту ссылку» → ссылка в поле и сразу «Заполнить по ссылке» */
				el.querySelector('#spBrw').onclick = async function () {
					if (!window.STHBrowser) return;
					var u = await window.STHBrowser.open({ url: el.querySelector('#sUrl').value, query: name });
					if (!u) return;
					el.querySelector('#sUrl').value = u;
					el.querySelector('#spFill').click();
				};
				el.querySelector('#spFill').onclick = async function () {
					var btn = this, url = normUrl(el.querySelector('#sUrl').value);
					if (!url) { U.toast('Вставьте ссылку на товар.'); return; }
					el.querySelector('#sUrl').value = url;
					btn.disabled = true; btn.textContent = 'Читаю страницу…';
					var f = null;
					try { f = await T.read(url); } catch (e) { U.error(e); }
					btn.disabled = false; btn.textContent = 'Заполнить по ссылке';
					if (!f || !el.isConnected || normUrl(el.querySelector('#sUrl').value) !== url) return;
					var got = [], pr = el.querySelector('#spPrice'), was = pr.value.trim();
					var quote = T.priceForUnit(f, unit, m && m.pack);
					st.priceRejected = !!quote.error;
					if (quote.error && st.quote) { st.quote = null; st.priceEdited = false; pr.value = val(st.price); }
					if (!quote.error) {
						st.quote = quote; st.priceEdited = true;
						pr.value = val(quote.price); got.push('цена ' + val(quote.price) + ' ₽ за ' + unit);
						el.querySelector('#spWas').textContent = 'за ' + unit + (was && num(was) !== quote.price ? ' · было ' + was : '');
					}
					if (f.article) { el.querySelector('#spArt').value = f.article; got.push('артикул ' + f.article); }
					var shop = f.supplier || host(url); if (shop && !el.querySelector('#sShop').value.trim()) el.querySelector('#sShop').value = shop;
					if (f.image) { var dimg = await T.image(f.image, Es.shrink); if (dimg) { st.img = dimg; prev(el); got.push('фото'); } else got.push('фото не скачалось'); }
					if (f.inStock !== undefined) { st.stock = f.inStock ? 1 : 0; got.push(f.inStock ? 'в наличии' : 'нет в наличии'); }
					st.note = [f.stockNote, f.characteristics].filter(Boolean).join('. ');
					var box = el.querySelector('#spGot');
					box.hidden = false; box.className = 'sthGot' + (quote.error ? ' bad' : '');
					box.textContent = quote.error ? quote.error + (got.length ? ' С сайта: ' + got.join(', ') : '') : 'С сайта: ' + got.join(', ');
				};
				el.querySelector('#sImgX').onclick = function () { st.img = ''; prev(el); };
				el.querySelector('#sImgPick').onclick = async function () {
					var p = await U.pick({ kind: 'open', title: 'Фото', filters: [{ name: 'Картинки', ext: ['jpg', 'jpeg', 'png', 'bmp', 'gif', 'webp'] }] });
					if (!p) return;
					try { var by = await U.api.readBytes(p), ext = String(p).split('.').pop().toLowerCase(); st.img = await Es.shrink(new Blob([by], { type: ext === 'png' ? 'image/png' : 'image/jpeg' })); prev(el); } catch (e) { U.error(e); }
				};
				el.addEventListener('paste', function (e) {
					var it = e.clipboardData ? Array.prototype.slice.call(e.clipboardData.items || []) : [], f = null;
					it.forEach(function (x) { if (!f && x.kind === 'file' && /^image\//.test(x.type)) f = x.getAsFile(); });
					if (!f) return;
					e.preventDefault();
					Es.shrink(f).then(function (d) { st.img = d; prev(el); }, function (er) { U.toast(er.message, { bad: true }); });
				});
			} });
		if (!res) return;
		if (res.match) { window.STH.pickFor(w); return; }
		var url = res.url;
		if (url && !/^https?:\/\//i.test(url) && !/^[^\s\/]+\.[^\s]+/.test(url)) { U.toast('Ссылка — адрес сайта, например shop.ru/item. Записано без ссылки.', { bad: true }); url = ''; }
		url = url ? normUrl(url) : '';
		await K.refresh(); b = MB.cur;
		var mm = m ? b.mats[m.id] : null, made = false;
		if (!mm) {
			if (!res.make) {     /* в базу не пишем — как раньше: поставщик, ссылка и фото по названию, цена — в прайс сметы */
				var Bs = BM.base, bs = Bs && Bs.cur;
				if (bs) { Bs.setMat(bs, w.skey, { shop: res.shop, url: url, img: res.img, art: res.art || w.art0 }); window.Base.save(true); }
				else { BM.est.setSup(S().prices, w.skey, { shop: res.shop, url: url, img: res.img }); }
				var pl0 = Es.pl(); if (res.price !== null && pl0 && pl0.P && w.priceId) pl0.P[w.priceId] = res.price;
				Es.saveStore(true); Es.render();
				return;
			}
			var gid = res.grp;
			if (!gid || !MB.group(b, gid)) { var ex = b.groups.filter(function (g) { return g.type === t && g.name === KGRP[t]; })[0]; gid = ex ? ex.id : MB.addGroup(b, '', KGRP[t], t).id; }
			var x = (window.STH.missingList ? window.STH.missingList() : []).filter(function (it) { return it.kind === w.kind && it.name === name; })[0];
			mm = MB.defMat(gid);
			mm.name = name; mm.unit = x ? x.unit : (w.kind === 'panel' ? 'лист' : w.kind === 'edge' ? 'м' : 'шт'); if (b.units.indexOf(mm.unit) < 0) b.units.push(mm.unit);
			if (x && t === 'sheet') { mm.kind = w.kind === 'linear' ? 'lin' : 'sheet'; mm.th = x.th || 0; mm.maxL = x.L || 0; mm.maxW = x.W || 0; mm.tex = x.tex || 0; }
			mm.note = 'Записано из сметы ' + (BM.project.modelName(S().st.model) || '') + ' ' + MB.today();
			made = true;
		}
		mm.url = url;
		if (res.quote) T.setPrice(mm, res.quote);
		else if (res.price !== null) mm.price = res.price;
		if (res.art) mm.art = res.art;
		var sp2 = supByName(b, res.shop, url); mm.sup = sp2 ? sp2.id : '';
		mm.photo = res.img || '';
		if (res.stock !== undefined) mm.noStock = res.stock ? 0 : 1;
		if (res.note) mm.note = String(mm.note || '').replace(/\n?\[сайт\][^\n]*/g, '').trim() + (mm.note ? '\n' : '') + '[сайт] ' + res.note;
		if (made) {
			var r = MB.saveMat(b, mm);
			if (r.errors) { U.toast('В базу не записано: ' + r.errors.join(', '), { bad: true, ms: 10000 }); return; }
			mm = r.mat || mm;
		}
		window.STH.linkSet(w, mm.id);
		/* своя цена строки в прайсе сметы перебивала бы базу — убираем её, цена теперь из базы */
		var pl = Es.pl(); if (pl && pl.P && w.priceId && Object.prototype.hasOwnProperty.call(pl.P, w.priceId) && res.price !== null) { delete pl.P[w.priceId]; Es.saveStore(true); }
		await K.saveBase();
		if (K.changed) await K.changed();
		Es.render();
		U.toast((made ? 'Записано в базу материалов' : 'Сохранено в базе материалов') + ': «' + mm.name + '»' + (res.price !== null ? ', цена ' + val(res.price) + ' ₽' : '') + '.', { ms: 7000 });
	};

	/* ---------------------- над сметой: обновить цены по ссылкам ---------------------- */
	var busy = false;
	async function updateEst() {
		if (busy) return;
		await K.refresh();
		var b = MB.cur, R = Es.R; if (!b || !R) return;
		var seen = {}, list = [];
		R.rows.forEach(function (w) { if (!(w.kind in KIND) || w.own) return; var m = matOf(w); if (m && String(m.url || '').trim() && !seen[m.id]) { seen[m.id] = 1; list.push(m); } });
		if (!list.length) { U.toast('У материалов этой сметы в базе нет ссылок на товар. Ссылку можно вставить кнопкой «+ поставщик» у строки.'); return; }
		var ok = await U.modal({ title: 'Обновить цены по ссылкам', width: 520, body: '<p>Материалов этой сметы со ссылкой: <b>' + list.length + '</b>. Страницы читаются по очереди с паузой — около ' + Math.max(1, Math.ceil(list.length * 4 / 60)) + ' мин.</p><p class="mute">Свои цены магазина — после входа: «+ поставщик» у строки → «Войти на сайт».</p>',
			buttons: [{ label: 'Отмена', value: false }, { label: 'Обновить', primary: true, value: true }] });
		if (!ok) return;
		busy = true;
		var ch = [], bad = [];
		try {
			for (var i = 0; i < list.length; i++) {
				var m = list[i];
				U.toast('Обновляю ' + (i + 1) + ' из ' + list.length + ': ' + String(m.name).slice(0, 50), { ms: 6000 });
				try {
					var f = await T.read(m.url);
					var cur = b.mats[m.id] || m, was = cur.price, wasNo = cur.noStock;
					var quote = T.priceForUnit(f, cur.unit, cur.pack);
					if (quote.error) bad.push(m.name + ' — ' + quote.error);
					else {
						var wasPack = cur.pack, wasPackPrice = cur.packPrice;
						T.setPrice(cur, quote); if (f.inStock !== undefined) cur.noStock = f.inStock ? 0 : 1;
						if (was !== cur.price || wasNo !== cur.noStock || (wasPack || 0) !== cur.pack || (wasPackPrice || 0) !== cur.packPrice) ch.push({ id: cur.id, name: cur.name + (cur.pack > 1 ? ' (упаковка ' + cur.pack + ' по ' + val(cur.packPrice) + ' ₽)' : ''), was: was, now: cur.price, stock: cur.noStock !== wasNo ? (cur.noStock ? 'нет в наличии' : 'в наличии') : '' });
					}
				} catch (e) { bad.push(m.name); }
				if (i < list.length - 1) await new Promise(function (r) { setTimeout(r, 1500); });
			}
			if (ch.length) {
				await K.saveBase(); if (K.changed) await K.changed();
				/* своя цена строки в прайсе сметы перебивала бы базу — у обновлённых строк убираем её, цена теперь из базы */
				var pl = Es.pl(), touched = false, ids = {}; ch.forEach(function (c) { ids[c.id] = 1; });
				R.rows.forEach(function (w) { var mm = (KIND[w.kind] && !w.own) ? matOf(w) : null; if (mm && ids[mm.id] && pl && pl.P && w.priceId && Object.prototype.hasOwnProperty.call(pl.P, w.priceId)) { delete pl.P[w.priceId]; touched = true; } });
				if (touched) Es.saveStore(true);
			}
		} finally { busy = false; }
		Es.render();
		await U.modal({ title: 'Цены по ссылкам обновлены', width: 640,
			body: '<p>Прочитано: <b>' + (list.length - bad.length) + '</b> из ' + list.length + '. Изменилось: <b>' + ch.length + '</b>.</p>' +
				(ch.length ? '<div style="max-height:46vh;overflow:auto"><table class="grid" style="width:100%"><thead><tr><th>Материал</th><th>Было</th><th>Стало</th><th></th></tr></thead><tbody>' + ch.map(function (c) { return '<tr><td>' + esc(c.name) + '</td><td class="r">' + val(c.was) + '</td><td class="r"><b>' + val(c.now) + '</b></td><td class="mute">' + esc(c.stock) + '</td></tr>'; }).join('') + '</tbody></table></div>' : '') +
				(bad.length ? '<p class="mute">Не удалось прочитать цену: ' + bad.slice(0, 8).map(esc).join(', ') + (bad.length > 8 ? '…' : '') + '</p>' : '') });
	}
	window.STH.updateEstPrices = updateEst;
	var r0 = Es.render;
	Es.render = function () {
		var x = r0.apply(this, arguments);
		try {
			var bar = document.getElementById('eBar'), cfg = Es.cfg();
			if (bar && !cfg.paper && MB.cur && S().st && !document.getElementById('sthUpd')) {
				var bt = document.createElement('button'); bt.id = 'sthUpd'; bt.textContent = '⟳ Обновить цены по ссылкам';
				bt.title = 'Цены и наличие с сайтов магазинов для строк этой сметы, у материалов которых в базе есть ссылка на товар';
				bt.onclick = function () { updateEst().catch(U.error); };
				var wo = document.getElementById('eWriteOff'); if (wo) bar.insertBefore(bt, wo); else bar.appendChild(bt);
			}
		} catch (e) { /* нет */ }
		return x;
	};
})();
