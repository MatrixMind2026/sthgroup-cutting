/* STHGroup: ссылка на товар в карточке базы материалов — данные с сайта магазина.
   «Войти на сайт» — окно сайта (логин и пароль вводятся на самом сайте, вход хранится в профиле программы),
   «Заполнить по ссылке» — цена, наличие, артикул, название, размеры, поставщик, остаток и характеристики (в примечание),
   «Инструменты → Обновить цены по ссылкам…» — все материалы со ссылкой по очереди с паузой.
   Страница читается в скрытом окне программы под этим входом (/api/shop/fetch) — видны свои цены и страницы на скриптах. */
(function () {
	'use strict';
	var U = window.UI, MB = BM.mb, LP = window.Core && window.Core.linkparse;
	function token() { return new URLSearchParams(location.search).get('t') || ''; }
	async function post(url, body) {
		var r = await fetch(url, { method: 'POST', headers: { 'X-BM-Token': token(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
		var j = {}; try { j = await r.json(); } catch (e) { /* не JSON */ }
		if (!r.ok) throw new Error(j.error || ('Ошибка ' + r.status));
		return j;
	}
	function normUrl(u) { u = String(u || '').trim(); if (u && !/^https?:\/\//i.test(u)) u = 'https://' + u; return u; }
	function host(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return ''; } }
	var T = window.STHShop = {};
	T.login = async function (url) {
		url = normUrl(url);
		if (!url) { U.toast('Сначала впишите ссылку на товар — откроется сайт этого магазина.'); return; }
		U.toast('Войдите на сайте в открывшемся окне и закройте его.', { ms: 8000 });
		try { await post('/api/shop/login', { url: url }); U.toast('Окно сайта закрыто. Теперь «Заполнить по ссылке» берёт цены под вашим входом.'); } catch (e) { U.error(e); }
	};
	T.read = async function (url) {
		var r = await post('/api/shop/fetch', { url: normUrl(url) });
		var f = LP.parseProductHtml(r.html, r.url || url).fields;
		/* фото: из разметки страницы, иначе — что нашла оболочка на открытой странице (самая большая картинка товара) */
		if (!f.image && r.image) f.image = r.image;
		if (f.image) { try { f.image = new URL(f.image, r.url || normUrl(url)).href; } catch (e) { f.image = ''; } }
		return f;
	};
	/* цена с сайта → в материал: если товар продаётся упаковкой (поле «упаковка» или число в названии: «2000 штук», «(5000 шт.)»),
	   цена с сайта — за упаковку, в материал — за единицу; возвращает { pack, perUnit } */
	T.packFor = function (m, f) {
		var pk = m && Number(m.pack) > 1 ? Number(m.pack) : 0, R = BM.sthRe;
		if (!pk && R) { var a = R.packOf(m && m.name) || R.packOf(f && f.name); if (a && a.n > 1) pk = a.n; }
		return pk;
	};
	T.setPrice = function (m, price, f) {
		var pk = T.packFor(m, f);
		if (pk > 1) { m.pack = pk; m.packPrice = price; m.price = Math.round(price / pk * 10000) / 10000; }
		else m.price = price;
		return { pack: pk, perUnit: m.price };
	};
	/* фото с сайта — картинкой (data:), чтобы хранилось в базе и печаталось без интернета */
	T.image = async function (url, shrink) {
		try {
			var r = await post('/api/shop/image', { url: normUrl(url) }), d = r.data || '';
			if (d && shrink) { try { d = await shrink(await (await fetch(d)).blob()); } catch (e) { /* как есть */ } }
			return d;
		} catch (e) { return ''; }
	};
	/* поставщик по названию сайта: есть — берём, нет — заводим */
	T.supplierFor = function (b, f, url) {
		var h = host(url), name = f.supplier || h, hit = null;
		if (!name) return null;
		b.suppliers.forEach(function (s) { if (!hit && (String(s.name).toLowerCase() === String(name).toLowerCase() || (h && host(normUrl(s.url)) === h))) hit = s; });
		return hit || MB.saveSupplier(b, { name: name, url: h ? 'https://' + h : '', phone: '', email: '', note: '' });
	};
	function noteWith(note, f) {
		var extra = [f.stockNote, f.characteristics].filter(Boolean).join('. ');
		var cur = String(note || '').replace(/\n?\[сайт\][^\n]*/g, '').trim();
		return extra ? (cur ? cur + '\n' : '') + '[сайт] ' + extra : cur;
	}
	/* заполнить открытую карточку (поля окна matbase_ui) */
	T.fillCard = async function (el, b) {
		var g = function (id) { return el.querySelector('#' + id); }, url = normUrl(g('mUrl').value);
		if (!url) { U.toast('Впишите ссылку на товар.'); return; }
		g('mUrl').value = url;
		U.toast('Читаю страницу…', { ms: 4000 });
		var f;
		try { f = await T.read(url); } catch (e) { U.error(e); return; }
		var got = [];
		var put = function (id, v, onlyEmpty) { var x = g(id); if (!x || v === undefined || v === '' || v === null) return false; if (onlyEmpty && String(x.value).trim() !== '' && String(x.value).trim() !== '0') return false; x.value = String(v).replace('.', ','); return true; };
		var pk0 = T.packFor({ name: g('mName').value, pack: g('mPack') ? g('mPack').value.replace(',', '.') : 0 }, f);
		if (pk0 > 1 && g('mPack') && g('mPackP')) {
			g('mPack').value = pk0; g('mPackP').value = String(f.priceBuy).replace('.', ','); put('mPrice', Math.round(f.priceBuy / pk0 * 10000) / 10000);
			g('mPackP').dispatchEvent(new Event('input', { bubbles: true }));
			got.push('цена за упаковку ' + String(f.priceBuy).replace('.', ',') + ' ₽ (' + pk0 + ' шт) → за штуку');
		} else if (put('mPrice', f.priceBuy)) got.push('цена ' + String(f.priceBuy).replace('.', ',') + ' ₽');
		if (put('mName', f.name, true)) got.push('название');
		if (put('mArt', f.article, true)) got.push('артикул');
		if (put('mTh', f.thickness, true)) got.push('толщина');
		if (put('mL', f.sheetW, true) | put('mW', f.sheetH, true)) got.push('размер листа');
		if (f.inStock !== undefined) { g('mNo').checked = !f.inStock; got.push(f.inStock ? 'в наличии' : 'нет в наличии'); }
		if (f.image && el.sthSetPhoto && !el.sthHasPhoto()) { var d = await T.image(f.image, window.MBW && window.MBW.photoOf); if (d) { el.sthSetPhoto(d); got.push('фото'); } }
		var nt = noteWith(g('mNote').value, f); if (nt !== g('mNote').value) { g('mNote').value = nt; got.push('остаток и характеристики — в примечание'); }
		var s = T.supplierFor(b, f, url), sel = g('mSup');
		if (s && sel) {
			if (!sel.querySelector('option[value="' + s.id + '"]')) { var o = document.createElement('option'); o.value = s.id; o.textContent = s.name; sel.appendChild(o); }
			sel.value = s.id; got.push('поставщик ' + s.name);
		}
		if (!f.priceBuy) U.toast('Цену на странице найти не удалось: скорее всего, ссылка ведёт на список товаров, а не на карточку одного товара.' + (got.length ? ' Заполнено: ' + got.join(', ') + '.' : ''), { bad: true, ms: 12000 });
		else U.toast('Заполнено: ' + got.join(', ') + '. Проверьте и нажмите OK.', { ms: 10000 });
	};
	/* все материалы со ссылкой: цена и наличие */
	var busy = false;
	T.updateAll = async function (b, changed) {
		if (busy) return;
		var list = Object.keys(b.mats).map(function (k) { return b.mats[k]; }).filter(function (m) { return /^https?:\/\//i.test(normUrl(m.url)) && String(m.url).trim(); });
		if (!list.length) { U.toast('Ни у одного материала нет ссылки на товар (карточка → вкладка «Поставщик»).'); return; }
		var ok = await U.modal({ title: 'Обновить цены по ссылкам', width: 520, body: '<p>Материалов со ссылкой: <b>' + list.length + '</b>. Страницы читаются по очереди с паузой — около ' + Math.max(1, Math.ceil(list.length * 4 / 60)) + ' мин.</p><p class="mute">Чтобы получить свои цены, заранее войдите на сайт: карточка материала → «Поставщик» → «Войти на сайт».</p>',
			buttons: [{ label: 'Отмена', value: false }, { label: 'Обновить', primary: true, value: true }] });
		if (!ok) return;
		busy = true; var done = 0, diff = 0, bad = [];
		for (var i = 0; i < list.length; i++) {
			var m = list[i];
			U.toast('Обновляю ' + (i + 1) + ' из ' + list.length + ': ' + String(m.name).slice(0, 50), { ms: 6000 });
			try {
				var f = await T.read(m.url);
				if (f.priceBuy) {
					done++;
					var was = m.price, wasNo = m.noStock;
					T.setPrice(m, f.priceBuy, f); if (f.inStock !== undefined) m.noStock = f.inStock ? 0 : 1;
					m.note = noteWith(m.note, f);
					if (was !== m.price || wasNo !== m.noStock) diff++;
				} else bad.push(m.name);
			} catch (e) { bad.push(m.name); }
			await new Promise(function (r) { setTimeout(r, 1500); });
		}
		busy = false; changed();
		U.toast('Готово: прочитано ' + done + ', изменились цена или наличие у ' + diff + (bad.length ? '. Не удалось: ' + bad.slice(0, 5).join(', ') + (bad.length > 5 ? '…' : '') : '') + '.', { ms: 15000, bad: !!bad.length && !done });
	};
})();
