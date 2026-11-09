/* STHGroup — «+ своя строка» в покупных разделах (фурнитура, материалы): то же окно, что «Поставщик» у строки модели
   (ui/sth_sup.js) — материал в базе («✓» или «Записать в базу» с группой), ссылка с «Заполнить по ссылке», «Браузер…»,
   «Войти на сайт», цена, поставщик, артикул, фото; сверху — наименование, количество и единица.
   Строка остаётся в проекте, а ссылка, цена, поставщик и фото пишутся в материал базы (нет — создаётся). */
(function () {
	'use strict';
	var U = window.UI, esc = U.esc, MB = BM.mb, K = window.MatBase, Es = window.Est, T = window.STHShop, E = BM.est;
	if (!Es || !K || !T || !MB || !Es.ownCard) return;
	var own0 = Es.ownCard;
	var UNITS = ['шт', 'компл.', 'м', 'кв.м', 'лист', 'уп.', 'кг', 'л'];
	var HEAD_NAME = { 'ПЛИТНЫЙ МАТЕРИАЛ': 'Материал плитный', 'КРОМОЧНЫЙ МАТЕРИАЛ': 'Материал кромочный', 'ПОГОННЫЙ МАТЕРИАЛ': 'Материал погонный', 'ФАСАДЫ МДФ': 'Фасады МДФ', 'ДОПОЛНИТЕЛЬНЫЕ МАТЕРИАЛЫ': 'Доп. материалы' };
	function headName(h) { return HEAD_NAME[h] || (h.charAt(0) + h.substring(1).toLowerCase()); }
	function S() { return window.App.S; }
	function num(v) { v = Number(String(v === undefined || v === null ? '' : v).replace(/\s/g, '').replace(',', '.')); return isFinite(v) ? v : NaN; }
	function val(v) { return v === '' || v === null || v === undefined ? '' : String(v).replace('.', ','); }
	function normUrl(u) { u = String(u || '').trim(); if (u && !/^https?:\/\//i.test(u)) u = 'https://' + u; return u; }
	function host(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return ''; } }
	function supByName(b, name, url) {
		name = String(name || '').trim(); if (!name) return null;
		var hit = b.suppliers.filter(function (s) { return String(s.name).toLowerCase() === name.toLowerCase(); })[0];
		return hit || MB.saveSupplier(b, { name: name, url: host(url) ? 'https://' + host(url) : '', phone: '', email: '', note: '' });
	}
	function typeOf(head) { return E.headGroup(head) === 'ФУРНИТУРА' ? 'fit' : 'other'; }
	var KGRP = { fit: 'Из моделей: фурнитура', other: 'Из моделей: прочее' };

	Es.ownCard = async function (w, head, mk) {
		var isNew = !w, A = window.App, we = Es.we();
		head = w ? w.head : head;
		if (!isNew && !w.own) return own0.apply(this, arguments);
		await K.refresh();
		var b = MB.cur;
		if (!b) return own0.apply(this, arguments);
		var t = typeOf(head), cands = E.ownCands(Es.R, Es.pl()), found = [], at = -1;
		var m0 = w ? MB.byName(b, w.title, w.art) : null, sp0 = m0 ? MB.supplier(b, m0.sup) : null, ws = (w && w.sup) || {};
		var st = { img: m0 ? (m0.photo || '') : (ws.tex ? '' : (ws.img || '')), stock: undefined, note: '', priceEdited: !!isNew || !m0, quote: null };
		var shops = b.suppliers.map(function (x) { return '<option value="' + esc(x.name) + '">'; }).join('');
		function unitOpts(u) { var l = UNITS.indexOf(u) < 0 ? UNITS.concat([u]) : UNITS; return l.map(function (x) { return '<option' + (x === u ? ' selected' : '') + '>' + esc(x) + '</option>'; }).join(''); }
		function prev(el) { el.querySelector('#sImg').innerHTML = st.img ? '<img src="' + esc(st.img) + '" alt="">' : '<span class="mute">нет фото</span>'; el.querySelector('#sImgX').disabled = !st.img; }
		var res = await U.modal({ title: (isNew ? 'Новая строка' : 'Своя строка') + ' · ' + headName(head), width: 580, cls: 'supDlg sthSup ownDlg',
			body: '<div class="form"><label>Наименование</label><div><input type="text" id="oName" maxlength="160" autocomplete="off" value="' + esc(w ? w.title : '') + '" placeholder="начните набирать — подскажу из прайса и «Базы»" autofocus><div class="supList" id="oSug" hidden></div></div></div>' +
				'<div class="sthMb" style="margin-top:12px"><div class="mute sm" style="margin-bottom:5px">Материал в базе</div><div id="oBase"></div></div>' +
				'<div class="form" style="margin-top:12px"><label>Ссылка</label><div><input type="text" id="sUrl" maxlength="400" value="' + esc(m0 ? m0.url : (ws.url || '')) + '" placeholder="https://… — вставьте ссылку на товар"></div>' +
				'<label></label><div class="row"><button id="spFill" class="primary">Заполнить по ссылке</button><button id="spBrw" title="Найти товар во встроенном браузере и взять ссылку">Браузер…</button><button id="spLogin">Войти на сайт</button><span class="mute sm">цена, артикул, фото, наличие</span></div>' +
				'<label>Количество</label><div class="oRow"><input type="text" id="oQty" value="' + val(w ? w.val : 1) + '"><select id="oUnit">' + unitOpts(w ? (w.unit || 'шт') : 'шт') + '</select><span class="oLab">Цена, ₽</span><input type="text" id="oPrice" value="' + val(w ? w.price : 0) + '"><span class="mute" id="oPu"></span></div>' +
				'<label>Поставщик</label><div><input type="text" id="sShop" maxlength="80" list="spShops" value="' + esc(sp0 ? sp0.name : (ws.shop || '')) + '" placeholder="выберите из «Базы» или впишите нового"><datalist id="spShops">' + shops + '</datalist></div>' +
				'<label>Артикул</label><div><input type="text" id="oArt" maxlength="60" value="' + esc(w ? (w.art || '') : '') + '" style="width:200px"></div>' +
				'<label>Фото</label><div class="row"><div class="supImg" id="sImg"></div><div style="display:flex;flex-direction:column;gap:6px"><button id="sImgPick">Выбрать файл…</button><button id="sImgX">Убрать фото</button></div></div>' +
				'<label></label><div class="mute sm">Картинку можно скопировать на сайте магазина и вставить сюда: Ctrl+V.</div>' +
				'<label></label><div class="mute sm" id="oSum"></div></div><div class="sthGot" id="spGot" hidden></div>',
			buttons: [{ label: 'Отмена', value: null }, { label: isNew ? 'Добавить' : 'Сохранить', primary: true, run: function (el) {
				var q = function (s) { return el.querySelector(s); };
				var r = { name: q('#oName').value.replace(/\s+/g, ' ').trim(), art: q('#oArt').value, unit: q('#oUnit').value, qty: num(q('#oQty').value),
					price: num(q('#oPrice').value.trim() === '' ? '0' : q('#oPrice').value), shop: q('#sShop').value.trim(), url: q('#sUrl').value.trim(), img: st.img,
					stock: st.stock, note: st.note, quote: st.quote && num(q('#oPrice').value) === st.quote.price ? st.quote : null, priceEdited: st.priceEdited,
					make: !!(q('#spNew') && q('#spNew').checked), grp: q('#spGrp') ? q('#spGrp').value : '' };
				if (!r.name) { U.toast('Впишите наименование.', { bad: true }); q('#oName').focus(); return false; }
				if (isNaN(r.qty) || r.qty < 0) { U.toast('Количество — число не меньше нуля.', { bad: true }); return false; }
				if (isNaN(r.price) || r.price < 0) { U.toast('Цена — число не меньше нуля.', { bad: true }); return false; }
				return r;
			} }],
			onOpen: function (el) {
				var q = function (s) { return el.querySelector(s); };
				var nm = q('#oName'), sg = q('#oSug');
				prev(el);
				/* блок «Материал в базе»: по наименованию — «✓» или «Записать в базу» */
				function baseBlock() {
					var name = nm.value.replace(/\s+/g, ' ').trim(), art = q('#oArt').value, m = name ? MB.byName(b, name, art) : null, keep = q('#spGrp') ? q('#spGrp').value : '', ck = q('#spNew') ? q('#spNew').checked : true;
					q('#oBase').innerHTML = m
						? '<div class="row"><span class="sthOk">✓ ' + esc(m.name) + '</span></div><div class="mute sm">' + esc(MB.path(b, m.group).join(' / ')) + ' · цена, ссылка и фото пишутся в этот материал</div>'
						: '<div class="row"><span class="sthWarn">Нет в базе</span></div><div class="row" style="margin-top:8px"><label class="ck"><input type="checkbox" id="spNew"' + (ck ? ' checked' : '') + '> Записать в базу, группа</label><select id="spGrp">' + window.STH.groupOpts(b, t, keep || '') + '</select></div>';
					if (!m && keep && q('#spGrp')) q('#spGrp').value = keep;
				}
				function sum() {
					var qn = num(q('#oQty').value), p = num(q('#oPrice').value), mk2 = Es.R.mk[{ 'МАТЕРИАЛ': 'M', 'ФУРНИТУРА': 'F' }[E.headGroup(head)] || 'M'] || 0;
					q('#oPu').textContent = 'за ' + q('#oUnit').value;
					q('#oSum').innerHTML = (qn >= 0 && p >= 0) ? 'Сумма: <b>' + E.money(Math.round(qn * p * (1 + mk2 / 100))) + ' р.</b>' + (mk2 ? ' (с наценкой ' + val(mk2) + ' %)' : '') : '';
				}
				baseBlock(); sum();
				['#oQty', '#oUnit'].forEach(function (s) { q(s).addEventListener('input', sum); });
				q('#oPrice').addEventListener('input', function () { st.priceEdited = true; st.quote = null; sum(); });
				q('#oArt').addEventListener('input', baseBlock);
				/* подсказки наименования: из сметы, прайса и базы */
				function pick(c) {
					sg.hidden = true; found = []; at = -1;
					nm.value = c.name; q('#oArt').value = c.art || '';
					if (c.price > 0) { q('#oPrice').value = val(c.price); st.priceEdited = true; }
					if (c.unit) q('#oUnit').innerHTML = unitOpts(c.unit);
					var m = MB.byName(b, c.name, c.art);
					if (m) {
						var sp = MB.supplier(b, m.sup);
						if (sp) q('#sShop').value = sp.name; else if (c.shop) q('#sShop').value = c.shop;
						if (m.url) q('#sUrl').value = m.url;
						if (m.photo) { st.img = m.photo; prev(el); }
						if (m.price > 0) q('#oPrice').value = val(m.price);
						if (m.unit) q('#oUnit').innerHTML = unitOpts(m.unit);
						if (m.art) q('#oArt').value = m.art;
					} else if (c.shop) q('#sShop').value = c.shop;
					baseBlock(); sum();
				}
				function showSug() {
					found = E.ownFind(cands, nm.value, 8); at = -1;
					sg.innerHTML = found.map(function (c, i) { var tt = [c.art ? 'арт. ' + c.art : '', c.price > 0 ? E.num(c.price) + ' р.' + (c.unit ? '/' + c.unit : '') : '', c.shop].filter(function (x) { return x; }); return '<div data-i="' + i + '"><b>' + esc(c.name) + '</b>' + (tt.length ? '<span>' + esc(tt.join(' · ')) + '</span>' : '') + '</div>'; }).join('');
					sg.hidden = !found.length;
				}
				nm.addEventListener('input', function () { showSug(); baseBlock(); });
				nm.addEventListener('blur', function () { setTimeout(function () { sg.hidden = true; }, 150); });
				nm.addEventListener('keydown', function (e) {
					if (!sg.hidden && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); at = at < 0 ? (e.key === 'ArrowDown' ? 0 : found.length - 1) : (at + (e.key === 'ArrowDown' ? 1 : -1) + found.length) % found.length; sg.querySelectorAll('[data-i]').forEach(function (x, i) { x.classList.toggle('on', i === at); }); return; }
					if (e.key === 'Enter') { e.preventDefault(); if (!sg.hidden && at >= 0) pick(found[at]); else q('.foot button.primary').click(); }
				});
				sg.addEventListener('mousedown', function (e) { var d = e.target.closest('[data-i]'); if (!d) return; e.preventDefault(); pick(found[Number(d.dataset.i)]); });
				/* ссылка, браузер, вход на сайт, заполнение по ссылке — как в окне «Поставщик» */
				q('#spLogin').onclick = function () { T.login(q('#sUrl').value); };
				q('#spBrw').onclick = async function () {
					if (!window.STHBrowser) return;
					var u = await window.STHBrowser.open({ url: q('#sUrl').value, query: nm.value });
					if (!u) return;
					q('#sUrl').value = u;
					q('#spFill').click();
				};
				q('#spFill').onclick = async function () {
					var btn = this, url = normUrl(q('#sUrl').value);
					if (!url) { U.toast('Вставьте ссылку на товар.'); return; }
					q('#sUrl').value = url;
					btn.disabled = true; btn.textContent = 'Читаю страницу…';
					var f = null;
					try { f = await T.read(url); } catch (e) { U.error(e); }
					btn.disabled = false; btn.textContent = 'Заполнить по ссылке';
					if (!f || !el.isConnected || normUrl(q('#sUrl').value) !== url) return;
					var got = [], unit = q('#oUnit').value, m = MB.byName(b, nm.value.trim(), q('#oArt').value);
					var quote = T.priceForUnit(f, unit, m && m.pack);
					if (!quote.error) { st.quote = quote; st.priceEdited = true; q('#oPrice').value = val(quote.price); got.push('цена ' + val(quote.price) + ' ₽ за ' + unit); sum(); }
					if (f.article) { q('#oArt').value = f.article; got.push('артикул ' + f.article); }
					if (!nm.value.trim() && f.title) nm.value = String(f.title).replace(/\s+/g, ' ').trim().slice(0, 160);
					var shop = f.supplier || host(url); if (shop && !q('#sShop').value.trim()) q('#sShop').value = shop;
					if (f.image) { var dimg = await T.image(f.image, Es.shrink); if (dimg) { st.img = dimg; prev(el); got.push('фото'); } else got.push('фото не скачалось'); }
					if (f.inStock !== undefined) { st.stock = f.inStock ? 1 : 0; got.push(f.inStock ? 'в наличии' : 'нет в наличии'); }
					st.note = [f.stockNote, f.characteristics].filter(Boolean).join('. ');
					baseBlock();
					var box = q('#spGot');
					box.hidden = false; box.className = 'sthGot' + (quote.error ? ' bad' : '');
					box.textContent = quote.error ? quote.error + (got.length ? ' С сайта: ' + got.join(', ') : '') : 'С сайта: ' + got.join(', ');
				};
				q('#sImgX').onclick = function () { st.img = ''; prev(el); };
				q('#sImgPick').onclick = async function () {
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
		var url = res.url;
		if (url && !/^https?:\/\//i.test(url) && !/^[^\s\/]+\.[^\s]+/.test(url)) { U.toast('Ссылка — адрес сайта, например shop.ru/item. Записано без ссылки.', { bad: true }); url = ''; }
		url = url ? normUrl(url) : '';
		/* строка — в проект */
		A.pushUndo();
		var id = w ? w.ownId : E.addOwnRow(we, res.name, 'sum', 0, head, mk);
		E.saveOwn(we, id, res);
		A.save();
		/* ссылка, цена, поставщик и фото — в материал базы */
		await K.refresh(); b = MB.cur;
		var mm = b ? MB.byName(b, res.name, res.art) : null, made = false;
		if (b && !mm && res.make) {
			var gid = res.grp;
			if (!gid || !MB.group(b, gid)) { var ex = b.groups.filter(function (g) { return g.type === t && g.name === KGRP[t]; })[0]; gid = ex ? ex.id : MB.addGroup(b, '', KGRP[t], t).id; }
			mm = MB.defMat(gid); mm.name = res.name; mm.unit = res.unit || 'шт'; if (b.units.indexOf(mm.unit) < 0) b.units.push(mm.unit);
			mm.note = 'Записано из своей строки сметы ' + (BM.project.modelName(S().st.model) || '') + ' ' + MB.today();
			made = true;
		}
		if (mm) {
			mm.url = url;
			var sameUnit = String(mm.unit || '').toLowerCase() === String(res.unit || '').toLowerCase();
			if (res.quote && sameUnit) T.setPrice(mm, res.quote);
			else if (made || (sameUnit && res.priceEdited && res.price > 0)) mm.price = res.price;
			if (res.art) mm.art = res.art;
			var sp2 = supByName(b, res.shop, url); mm.sup = sp2 ? sp2.id : '';
			mm.photo = res.img || '';
			if (res.stock !== undefined) mm.noStock = res.stock ? 0 : 1;
			if (res.note) mm.note = String(mm.note || '').replace(/\n?\[сайт\][^\n]*/g, '').trim() + (mm.note ? '\n' : '') + '[сайт] ' + res.note;
			if (made) {
				var r2 = MB.saveMat(b, mm);
				if (r2.errors) { U.toast('В базу не записано: ' + r2.errors.join(', '), { bad: true, ms: 10000 }); Es.render(); return; }
			}
			await K.saveBase();
			if (K.changed) await K.changed();
		} else if (res.shop || url || res.img) {   /* базы нет или «в базу не писать» — как раньше: по наименованию в прайсе сметы */
			E.setSup(S().prices, res.name, { shop: res.shop, url: url, img: res.img }); Es.saveStore(true);
		}
		Es.render();
		if (mm) U.toast((made ? 'Записано в базу материалов' : 'Сохранено в базе материалов') + ': «' + mm.name + '».', { ms: 6000 });
	};
})();
