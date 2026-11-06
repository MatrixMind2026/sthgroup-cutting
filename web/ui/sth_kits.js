/* STHGroup — комплекты в смете.
   «Разделить…» (правый щелчок по строке): строка-комплект остаётся с пометкой «разделён ↶» и в сумму не идёт,
   под ней — части обычными строками (сопоставление с базой, поставщик, цена); в документах — части.
   «Объединить в комплект…»: отмеченные строки — одной строкой-комплектом, сами они остаются под ним «в комплекте» и в сумму не идут.
   Где хранится: в проекте (we.sthSplit / we.sthKits) и — галочка «Запомнить для всех проектов» — в базе материалов (b.sthKits),
   там же материал-комплект в разделе «08. Комплекты» со «Составом». «↶» — вернуть как было (we.sthNoKit — не применять из базы).
   Упаковка: у материала базы pack (сколько в упаковке) и packWhole («продавать целыми упаковками») — количество в смете до целых упаковок;
   в строке и документах — «(N уп.)». */
(function () {
	'use strict';
	var U = window.UI, esc = U.esc, E = BM.est, MB = BM.mb, Es = window.Est, K = window.MatBase;
	if (!E || !Es) return;
	function S() { return window.App.S; }
	function low(s) { return String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim(); }
	function num(v) { v = Number(String(v === undefined ? '' : v).replace(/\s/g, '').replace(',', '.')); return isFinite(v) ? v : 0; }
	function r3(v) { return Math.round(v * 1000) / 1000; }
	function val(v) { return String(r3(v)).replace('.', ','); }
	var KINDS = { fastener: 1, profile: 1, linear: 1, edge: 1 };
	function nameOf(w) { return w.name0 || w.title || ''; }
	function base() { return MB && MB.cur ? MB.cur : null; }
	function bk(b) { if (!b.sthKits || typeof b.sthKits !== 'object') b.sthKits = {}; if (!b.sthKits.split) b.sthKits.split = {}; if (!Array.isArray(b.sthKits.merge)) b.sthKits.merge = []; return b.sthKits; }
	function kid() { return 'k' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36); }
	function rowKey(w) { return w.kind + '|' + (w.ownId || w.offKey || w.priceId); }

	/* ---------------- внутри расчёта сметы (core/estimate.js → E.sthKits) ---------------- */
	E.sthKits = function (c) {
		var ROWS = c.rows, we = c.we || {}, b = base(), no = we.sthNoKit || {}, i;
		var split = {}, merge = [];
		if (b && b.sthKits) { var bs = b.sthKits.split || {}; for (var k in bs) if (Object.prototype.hasOwnProperty.call(bs, k) && !no[k]) split[k] = bs[k]; (b.sthKits.merge || []).forEach(function (d) { if (!no['m:' + d.id]) merge.push(d); }); }
		var ps = we.sthSplit || {}; for (var k2 in ps) if (Object.prototype.hasOwnProperty.call(ps, k2)) split[k2] = ps[k2];
		(we.sthKits || []).forEach(function (d) { merge = merge.filter(function (x) { return x.id !== d.id; }); merge.push(d); });
		function zero(w) { w.sthReference = { price: w.price, priceOut: w.priceOut, sum: w.sum }; w.info = 1; w.price = 0; w.priceOut = 0; w.sum = 0; }
		var after = [];      // [строка, вставить после неё]
		/* разделить */
		ROWS.slice().forEach(function (w) {
			if (!KINDS[w.kind] || w.own || w.off) return;
			var d = split[low(nameOf(w))]; if (!d || !d.parts || !d.parts.length) return;
			w.sthSplit = d; zero(w);
			var prev = w;
			d.parts.forEach(function (p) {
				var nm = String(p.name || '').trim(); if (!nm) return;
				var key = 'K:' + low(nm), o = c.mk({ kind: w.kind === 'edge' ? 'edge' : 'fastener', head: w.head, label: nm, akey: '', fname: nm, funit: 0, offKey: key, qtyKey: key, calc: r3(w.val * (num(p.q) || 1)),
					unit: w.unit, priceId: key, priceDef: 0, punit: w.punit, note: 'часть' });
				o.mkind = w.mkind; o.sthPart = rowKey(w);
				after.push([o, prev]); prev = o;
			});
		});
		/* объединить */
		merge.forEach(function (d) {
			var mem = (d.members || []).map(function (m) { var hit = null; ROWS.forEach(function (w) { if (!hit && !w.own && !w.off && !w.sthSplit && !w.sthInKit && !w.sthPart && low(nameOf(w)) === low(m.name)) hit = w; }); return hit ? { w: hit, q: num(m.q) || 1 } : null; });
			if (!mem.length || mem.some(function (x) { return !x; })) return;
			var n = Math.min.apply(null, mem.map(function (x) { return x.w.val / x.q; })); n = Math.floor(n + 1e-9) || r3(n);
			var key = 'KM:' + low(d.name), first = mem[0].w;
			var o = c.mk({ kind: 'fastener', head: first.head, label: d.name, akey: '', fname: d.name, funit: 1, offKey: key, qtyKey: key, calc: n, unit: 'компл.', priceId: key, priceDef: 0, punit: 'руб./компл.', note: '' });
			o.mkind = first.mkind; o.sthKit = d; o.sthMem = mem.map(function (x) { return rowKey(x.w); });
			mem.forEach(function (x) { x.w.sthInKit = d.name; x.w.sthKitId = d.id; zero(x.w); });
			after.push([o, null, first]);
		});
		/* упаковка: целыми упаковками и пометка «(N уп.)» */
		if (b && K && K.rowInfo) ROWS.forEach(function (w) {
			if (w.own || w.sthSplit || w.sthInKit) return;
			var inf = null; try { inf = K.rowInfo(w); } catch (e) { inf = null; }
			var m = inf && b.mats[inf.id]; if (!m || !(num(m.pack) > 1)) return;
			if (w.sthReplace && K.unitOf(m.unit) !== K.unitOf(w.unit)) return;   // STHGroup: упаковка только в совпадающей единице
			var pk = num(m.pack), packs = Math.ceil(w.val / pk - 1e-9);
			if (m.packWhole && !w.manual && w.val > 0 && (!w.sthReplace || w.sthReplace.mode === 'base')) { w.val = packs * pk; w.sum = (w.off || w.info) ? 0 : Math.round(w.val * w.price * (1 + w.mk / 100)); }
			if (w.val > 0) w.utail = (w.utail || '') + ' (' + packs + ' уп. по ' + val(pk) + ')';
			w.sthPack = { pack: pk, packs: packs, whole: !!m.packWhole && (!w.sthReplace || w.sthReplace.mode === 'base') };
		});
		/* порядок: части — сразу под комплектом, комплект — над первой своей строкой */
		after.forEach(function (a) {
			var o = a[0], at = ROWS.indexOf(o); if (at >= 0) ROWS.splice(at, 1);
			if (a[1]) ROWS.splice(ROWS.indexOf(a[1]) + 1, 0, o);
			else ROWS.splice(Math.max(0, ROWS.indexOf(a[2])), 0, o);
		});
		for (i = 0; i < ROWS.length; i++) ROWS[i].i = i;
	};

	/* ------------------------------- окна ---------------------------------- */
	async function saveBase(fn) { if (!K) return; await K.refresh(); var b = base(); if (!b) return; fn(b); await K.saveBase(); if (K.changed) await K.changed(); }
	function kitGroup(b) {
		var g = b.groups.filter(function (x) { return !x.parent && /комплект/i.test(x.name); })[0];
		return g || MB.addGroup(b, '', '08. Комплекты', 'fit');
	}
	/* материал-комплект в базе: «Состав» — сопутствующие материалы (части, которых нет в базе, заводятся там же) */
	function kitMat(b, name, parts) {
		var g = kitGroup(b), m = null;
		Object.keys(b.mats).forEach(function (id) { if (!m && low(b.mats[id].name) === low(name)) m = b.mats[id]; });
		if (!m) { var r = MB.saveMat(b, Object.assign(MB.defMat(g.id), { name: name, unit: 'компл.', note: 'Комплект из сметы ' + MB.today() })); if (r.errors) return null; m = r.mat; }
		m.rel = parts.map(function (p) {
			var pm = null; Object.keys(b.mats).forEach(function (id) { if (!pm && low(b.mats[id].name) === low(p.name)) pm = b.mats[id]; });
			if (!pm) { var r2 = MB.saveMat(b, Object.assign(MB.defMat(g.id), { name: p.name, unit: 'шт', note: 'Часть комплекта «' + name + '»' })); pm = r2.mat; }
			return pm ? { mat: pm.id, qty: num(p.q) || 1 } : null;
		}).filter(Boolean);
		return m;
	}
	function partsBody(title, parts) {
		return '<p style="margin-top:0"><b>' + esc(title) + '</b></p><table class="grid sthKitT" style="width:100%"><thead><tr><th></th><th>Часть</th><th>На 1 шт комплекта</th><th>Итого</th><th></th></tr></thead><tbody></tbody></table>' +
			'<button id="kAdd" style="margin-top:6px">+ часть</button><label class="ck" style="margin-top:12px"><input type="checkbox" id="kAll" checked> Запомнить для всех проектов (в базе материалов, раздел «08. Комплекты»)</label>';
	}
	Es.sthSplit = async function (w) {
		var b = base(), we = Es.we(), key = low(nameOf(w));
		var cur = (we.sthSplit && we.sthSplit[key]) || (b && b.sthKits && b.sthKits.split && b.sthKits.split[key]);
		var parts = cur ? cur.parts.map(function (p) { return { name: p.name, q: p.q }; }) : guessParts(nameOf(w));
		var res = await U.modal({ title: 'Разделить строку', width: 640, cls: 'sthKit', body: partsBody(nameOf(w) + ' · ' + val(w.val) + ' ' + E.shortUnit(w.unit), parts),
			buttons: [{ label: 'Отмена', value: null }, { label: 'Разделить', primary: true, run: function (m) { read(m); var p = parts.filter(function (x) { return x.name.trim(); }); if (p.length < 1) { U.toast('Впишите хотя бы одну часть'); return false; } return { parts: p, all: m.querySelector('#kAll').checked }; } }],
			onOpen: function (m) {
				function draw() {
					m.querySelector('tbody').innerHTML = parts.map(function (p, i) { return '<tr data-dg="k"><td>' + window.STHDrag.handle() + '</td><td><input class="kn" value="' + esc(p.name) + '" style="width:100%" placeholder="название части"></td><td><input class="kq" value="' + val(p.q || 1) + '" style="width:80px"></td><td class="mute">' + val(w.val * (num(p.q) || 1)) + ' ' + esc(E.shortUnit(w.unit)) + '</td><td><button class="icon" data-kx="' + i + '">✕</button></td></tr>'; }).join('');
				}
				m._read = function () { parts = Array.prototype.map.call(m.querySelectorAll('tbody tr'), function (tr) { return { name: tr.querySelector('.kn').value, q: num(tr.querySelector('.kq').value) || 1 }; }); };
				draw();
				m.querySelector('#kAdd').onclick = function () { m._read(); parts.push({ name: '', q: 1 }); draw(); var l = m.querySelectorAll('.kn'); if (l.length) l[l.length - 1].focus(); };
				m.addEventListener('click', function (e) { var x = e.target.closest('[data-kx]'); if (x) { m._read(); parts.splice(Number(x.dataset.kx), 1); draw(); } });
				m.addEventListener('input', function (e) { if (!e.target.classList.contains('kq')) return; var tr = e.target.closest('tr'); tr.children[3].textContent = val(w.val * (num(e.target.value) || 1)) + ' ' + E.shortUnit(w.unit); });
				window.STHDrag.rows(m, { rows: 'tbody tr', drop: function (s, t, a, from, to) { m._read(); window.STHDrag.move(parts, from, to); draw(); } });
			} });
		function read(m) { if (m._read) m._read(); }
		if (!res) return;
		window.App.pushUndo && window.App.pushUndo();
		var d = { name: nameOf(w), parts: res.parts.map(function (p) { return { name: p.name.trim(), q: p.q }; }) };
		(we.sthSplit = we.sthSplit || {})[key] = d;
		if (we.sthNoKit) delete we.sthNoKit[key];
		if (res.all) await saveBase(function (b2) { bk(b2).split[key] = d; kitMat(b2, d.name, d.parts); });
		window.App.save(); Es.render();
		U.toast('Разделено на ' + d.parts.length + ': ' + d.parts.map(function (p) { return p.name; }).join(', ') + (res.all ? '. Запомнено в базе — в других проектах разделится само.' : '.'), { ms: 8000 });
	};
	/* части по названию: «на чашку и плечо» → «… на чашку», «… на плечо» — только подсказка, правится в окне */
	function guessParts(name) {
		var m = /^(.*?\S)\s+(?:на|для)\s+(.+?)\s+и\s+(.+?)(,.*)?$/i.exec(name);
		if (m) {
			var head = m[1].replace(/^комплект\s+/i, '').replace(/^(\S+?)ек(?=\s|$)/i, '$1ка').replace(/^(\S+?)ов(?=\s|$)/i, '$1');
			head = head.charAt(0).toUpperCase() + head.slice(1);
			var tail = m[4] || '', a = m[2], c = m[3].split(/\s+/), rest = c.length > 1 ? ' ' + c.slice(1).join(' ') : '';
			return [{ name: head + ' на ' + a + rest + tail, q: 1 }, { name: head + ' на ' + c[0] + rest + tail, q: 1 }];
		}
		return [{ name: '', q: 1 }, { name: '', q: 1 }];
	}
	Es.sthMerge = async function (w0) {
		var R = Es.R, we = Es.we(), list = R.rows.filter(function (w) { return KINDS[w.kind] && !w.own && !w.off && !w.sthSplit && !w.sthInKit && !w.sthPart && !w.sthKit; });
		var res = await U.modal({ title: 'Объединить в комплект', width: 760, cls: 'sthKit',
			body: '<label class="fl">Название комплекта<input id="kName" placeholder="например: Петля Blum CLIP top в сборе с планкой и заглушкой" style="width:100%"></label>' +
				'<p class="mute">Отметьте строки, которые входят в комплект, и сколько каждой нужно на 1 комплект. Количество комплектов посчитается само.</p>' +
				'<div style="max-height:48vh;overflow:auto"><table class="grid" style="width:100%"><thead><tr><th></th><th>Строка сметы</th><th>Количество</th><th>На 1 компл.</th></tr></thead><tbody>' +
				list.map(function (w, i) { return '<tr><td><input type="checkbox" class="km" data-i="' + i + '"' + (w === w0 ? ' checked' : '') + '></td><td>' + esc(nameOf(w)) + '</td><td class="mute">' + val(w.val) + ' ' + esc(E.shortUnit(w.unit)) + '</td><td><input class="kq" data-i="' + i + '" value="1" style="width:70px"></td></tr>'; }).join('') +
				'</tbody></table></div><label class="ck" style="margin-top:10px"><input type="checkbox" id="kAll" checked> Запомнить для всех проектов (в базе материалов, раздел «08. Комплекты»)</label>',
			buttons: [{ label: 'Отмена', value: null }, { label: 'Объединить', primary: true, run: function (m) {
				var nm = m.querySelector('#kName').value.trim(), mem = [];
				m.querySelectorAll('.km').forEach(function (c) { if (c.checked) { var i = Number(c.dataset.i); mem.push({ name: nameOf(list[i]), q: num(m.querySelector('.kq[data-i="' + i + '"]').value) || 1 }); } });
				if (!nm) { U.toast('Впишите название комплекта'); return false; }
				if (mem.length < 2) { U.toast('Отметьте хотя бы две строки'); return false; }
				return { name: nm, members: mem, all: m.querySelector('#kAll').checked };
			} }] });
		if (!res) return;
		window.App.pushUndo && window.App.pushUndo();
		var d = { id: kid(), name: res.name, members: res.members };
		(we.sthKits = we.sthKits || []).push(d);
		if (res.all) await saveBase(function (b2) { bk(b2).merge.push(d); kitMat(b2, d.name, d.members); });
		window.App.save(); Es.render();
		U.toast('Комплект «' + d.name + '»: ' + d.members.length + ' строк' + (res.all ? '. Запомнено в базе.' : '.'), { ms: 8000 });
	};
	/* ↶ — вернуть как было */
	Es.sthUndo = async function (w) {
		var we = Es.we(), b = base(), isSplit = !!w.sthSplit, key = isSplit ? low(nameOf(w)) : 'm:' + (w.sthKit ? w.sthKit.id : w.sthKitId), name = isSplit ? nameOf(w) : (w.sthKit ? w.sthKit.name : w.sthInKit);
		var inBase = b && b.sthKits && (isSplit ? b.sthKits.split && b.sthKits.split[key] : (b.sthKits.merge || []).some(function (d) { return 'm:' + d.id === key; }));
		var res = await U.modal({ title: isSplit ? 'Собрать обратно' : 'Разобрать комплект', width: 500,
			body: '<p>' + (isSplit ? 'Вернуть строку «' + esc(name) + '» целиком, без частей?' : 'Разобрать комплект «' + esc(name) + '» — строки снова по отдельности?') + '</p>' + (inBase ? '<label class="ck"><input type="checkbox" id="kBase"> и убрать из базы материалов (в других проектах тоже)</label>' : ''),
			buttons: [{ label: 'Отмена', value: null }, { label: isSplit ? 'Собрать' : 'Разобрать', primary: true, run: function (m) { var c = m.querySelector('#kBase'); return { base: !!(c && c.checked) }; } }] });
		if (!res) return;
		window.App.pushUndo && window.App.pushUndo();
		if (isSplit) { if (we.sthSplit) delete we.sthSplit[key]; }
		else we.sthKits = (we.sthKits || []).filter(function (d) { return 'm:' + d.id !== key; });
		if (inBase) {
			if (res.base) await saveBase(function (b2) { var k2 = bk(b2); if (isSplit) delete k2.split[key]; else k2.merge = k2.merge.filter(function (d) { return 'm:' + d.id !== key; }); });
			else (we.sthNoKit = we.sthNoKit || {})[key] = 1;
		}
		window.App.save(); Es.render();
	};

	/* --------------------------- в таблице сметы ---------------------------- */
	var r0 = Es.render;
	Es.render = function () {
		var x = r0.apply(this, arguments);
		try {
			var body = document.getElementById('eBody'), R = Es.R; if (!body || !R || body.classList.contains('paper')) return x;
			R.rows.forEach(function (w) {
				if (!w.sthSplit && !w.sthPart && !w.sthKit && !w.sthInKit && !w.sthPack) return;
				var tr = body.querySelector('tr[data-k="' + CSS.escape(rowKey(w)) + '"]'); if (!tr) return;
				var t0 = tr.querySelector('textarea.nv, .ownT, input.xn'), nm = t0 ? t0.closest('td') : tr.children[2]; if (!nm || nm.querySelector('.sthKitL')) return;
				var h = '';
				if (w.sthSplit) { tr.classList.add('sthKitP'); h = '<button class="sthKitL" data-ku="' + esc(rowKey(w)) + '" title="Строка разделена на части — они ниже. Щёлкните, чтобы собрать обратно">разделён ↶</button>'; }
				else if (w.sthInKit) { tr.classList.add('sthKitP'); h = '<button class="sthKitL" data-ku="' + esc(rowKey(w)) + '" title="Входит в комплект — он выше. Щёлкните, чтобы разобрать комплект">в комплекте «' + esc(w.sthInKit) + '» ↶</button>'; }
				else if (w.sthKit) { tr.classList.add('sthKitK'); h = '<span class="sthKitL on" title="Комплект из строк ниже">комплект</span>'; }
				else if (w.sthPart) { tr.classList.add('sthKitC'); }
				if (w.sthPack) h += '<span class="sthKitL pack" title="Упаковка из базы материалов">' + w.sthPack.packs + ' уп. по ' + val(w.sthPack.pack) + (w.sthPack.whole ? ' · целыми упаковками' : '') + '</span>';
				if (h) nm.insertAdjacentHTML('beforeend', h);
			});
		} catch (e) { console.warn(e); }
		return x;
	};
	document.addEventListener('click', function (e) {
		var b = e.target.closest && e.target.closest('button.sthKitL[data-ku]'); if (!b || !Es.R) return;
		e.preventDefault(); e.stopPropagation();
		var w = Es.R.rows.filter(function (x) { return rowKey(x) === b.dataset.ku; })[0];
		if (w) Es.sthUndo(w).catch(U.error);
	}, true);
	/* правый щелчок по строке: разделить / объединить / вернуть */
	document.addEventListener('contextmenu', function (e) {
		var tr = e.target.closest && e.target.closest('#eBody table.et tr[data-k]');
		if (!tr || !Es.R || e.target.closest('input, select')) return;
		var w = Es.R.rows.filter(function (x) { return rowKey(x) === tr.dataset.k; })[0];
		if (!w || w.own || !KINDS[w.kind] || w.parts) return;      // объединённые одинаковые — своё меню BazisReborn
		e.preventDefault(); e.stopPropagation();
		var acts = [];
		if (w.sthSplit) acts.push(['↶ Собрать обратно', function () { Es.sthUndo(w).catch(U.error); }]);
		else if (w.sthInKit || w.sthKit) acts.push(['↶ Разобрать комплект', function () { var t = w; if (w.sthKit) t = w; Es.sthUndo(t).catch(U.error); }]);
		else if (!w.sthPart) { acts.push(['✂ Разделить…', function () { Es.sthSplit(w).catch(U.error); }]); acts.push(['⊕ Объединить в комплект…', function () { Es.sthMerge(w).catch(U.error); }]); }
		if ((Es.dups || {})[w.offKey]) acts.push(['Объединить с такой же…', function () { S().mergeAsk = rowKey(w); Es.render(); }]);
		if (acts.length) U.menu(e.clientX, e.clientY, acts);
	}, true);
})();
