/* STHGroup — раздел «База»: материалы и фурнитура (дерево классов слева, таблица, карточка справа),
   поставщики (карточки с логотипом), классы (как в БАЗИСе), текстуры (папка с подпапками, своя картинка
   у материала). Хранится в base.json рядом с настройками, общий для всех проектов. Материалы попадают
   сюда сами из открытых проектов (по смете). Расчёт — в core/base.js. */
(function () {
	'use strict';
	var U = window.UI, B = BM.base, E = BM.est, $ = U.$, esc = U.esc;
	var Bv = window.Base = { files: [], filesDir: '', more: false, scanErr: '', tab: 'mats', grp: '', cls: '', q: '', sel: '', supSel: '', left: 'cls', dir: '', dirOpen: {} };
	var ROWS_MAX = 400;                 // строк в таблице за раз: база БАЗИСа — десятки тысяч записей
	function S() { return window.App.S; }
	function base() { return B.cur; }
	function low(s) { return String(s || '').toLowerCase(); }
	function filePath() { return U.join(S().boot.dataDir, 'base.json'); }
	var IMG_EXT = ['jpg', 'jpeg', 'png', 'bmp', 'gif', 'webp'];
	var TABS = [['mats', 'Материалы и фурнитура'], ['sup', 'Поставщики'], ['cls', 'Классы'], ['tex', 'Текстуры']];

	/* ------------------------------ файл base.json ------------------------------ */
	Bv.load = async function () {
		var o = null, existed = false;
		try { var st = await U.api.stat(filePath()); if (st.exists) { existed = true; o = JSON.parse(await U.api.readText(filePath())); } } catch (e) { o = null; }
		B.cur = (existed && o) ? B.fix(o) : B.fresh();
		B.thumb = Bv.thumb; B.big = Bv.texInfo;
		/* поставщики, записанные раньше в базе цен (prices.json), переезжают сюда один раз */
		var pr = S().prices;
		if (pr && pr.sup && Object.keys(pr.sup).length) { B.migrateSup(B.cur, pr.sup); pr.sup = {}; window.Est.saveStore(true); existed = false; }
		if (!existed) Bv.save(true);
		await Bv.scan();
	};
	var saveT = 0;
	Bv.save = function (now) {
		clearTimeout(saveT);
		saveT = setTimeout(function () { U.api.write(filePath(), JSON.stringify(B.cur)).catch(U.error); }, now ? 0 : 400);
	};

	/* -------------------------------- текстуры --------------------------------- */
	var memo = {}, imgs = {}, laterT = 0;
	function resetMemo() { memo = {}; }
	Bv.scan = async function () {
		var d = base().tex.dir;
		Bv.scanErr = '';
		if (!d) { Bv.files = []; Bv.filesDir = ''; Bv.more = false; resetMemo(); return; }
		try { var r = await U.api.tree(d); Bv.files = r.files || []; Bv.more = !!r.more; Bv.filesDir = d; }
		catch (e) { Bv.files = []; Bv.filesDir = ''; Bv.scanErr = e.message; }
		resetMemo();
		if (window.Model && window.Model.texChanged) window.Model.texChanged();
	};
	/* Файл текстуры материала: { path, by: 'own' | 'art' | 'name' } или null. */
	Bv.texOf = function (name) {
		if (!base() || !name) return null;
		if (Object.prototype.hasOwnProperty.call(memo, name)) return memo[name];
		var m = base().mats[name];
		return (memo[name] = B.texOf(base(), Bv.files, name, m ? m.art : ''));
	};
	function shot(im, px) {
		var k = Math.min(1, px / Math.max(im.naturalWidth || 1, im.naturalHeight || 1)), c = document.createElement('canvas');
		c.width = Math.max(1, Math.round(im.naturalWidth * k)); c.height = Math.max(1, Math.round(im.naturalHeight * k));
		var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(im, 0, 0, c.width, c.height);
		return c.toDataURL('image/jpeg', 0.85);
	}
	/* картинка загружается один раз; маленькая — для фото в смете, средняя — для карт раскроя и PDF */
	function img(p) {
		var c = imgs[p];
		if (c) return c;
		c = imgs[p] = { st: 'load', s: '', m: '' };
		var im = new Image();
		im.onload = function () { try { c.s = shot(im, 160); c.m = shot(im, 640); c.st = 'ok'; c.w = im.naturalWidth; c.h = im.naturalHeight; } catch (e) { c.st = 'err'; } later(); };
		im.onerror = function () { c.st = 'err'; };
		im.src = U.api.fileUrl(p);
		return c;
	}
	/* загрузились новые картинки — перерисовать то, что на экране */
	function later() {
		clearTimeout(laterT);
		laterT = setTimeout(function () {
			var s = S();
			if (s.section === 'base') Bv.render();
			else if (s.st) { if (s.section === 'est') window.Est.render(); else if (s.section === 'cut') window.MapView.render(); else if (s.section === 'model' && window.Model.texChanged) window.Model.texChanged(); }
		}, 250);
	}
	Bv.thumb = function (name) { var t = Bv.texOf(name); if (!t) return ''; return img(t.path).s; };
	Bv.big = function (name) { var t = Bv.texOf(name); if (!t) return ''; return img(t.path).m; };
	/* для карт раскроя и PDF: { url — картинка 640 px, w, h } или null (ещё грузится — карта перерисуется) */
	Bv.texInfo = function (name) { var t = Bv.texOf(name); if (!t) return null; var c = img(t.path); return c.m ? { url: c.m, w: c.w, h: c.h } : null; };
	Bv.texUrl = function (name) { var t = Bv.texOf(name); return t ? U.api.fileUrl(t.path) : ''; };

	/* --------------------------- материалы из проекта ---------------------------- */
	var KIND = { 'ПЛИТНЫЙ МАТЕРИАЛ': 'плита', 'КРОМОЧНЫЙ МАТЕРИАЛ': 'кромка', 'ФУРНИТУРА': 'фурнитура', 'ПРОФИЛИ': 'профиль', 'ПОГОННЫЙ МАТЕРИАЛ': 'погонаж', 'ЗАКАЗНЫЕ ФАСАДЫ': 'фасад', 'ФАСАДЫ МДФ': 'покрытие фасада' };
	/* строки сметы → «База»: название, артикул, вид */
	Bv.learnRows = function (R) {
		if (!base() || !R) return 0;
		var n = 0;
		R.rows.forEach(function (w) {
			if (w.own || !w.skey) return;
			if (!base().mats[w.skey]) n++;
			B.learn(base(), w.skey, w.art0 || '', KIND[w.head] || '');
		});
		if (n) { resetMemo(); Bv.save(); }
		return n;
	};
	Bv.learnProject = function () {
		var s = S();
		if (!s.st || !s.prices) return 0;
		try { return Bv.learnRows(E.build(s.st, window.Est.cfg(), window.Est.pl(), window.Est.we(), s.prices.sup)); } catch (e) { console.error(e); return 0; }
	};

	/* ------------------------------ помощники окна ------------------------------ */
	function ask(title, value, hint) {
		return U.modal({
			title: title, width: 440,
			body: '<div class="form"><input type="text" id="bAsk" maxlength="120" value="' + esc(value || '') + '" autofocus spellcheck="false"></div>' + (hint ? '<p class="mute">' + esc(hint) + '</p>' : ''),
			buttons: [{ label: 'Отмена', value: null }, { label: 'Готово', primary: true, run: function (m) { return m.querySelector('#bAsk').value.trim(); } }],
			onOpen: function (m) { var i = m.querySelector('#bAsk'); i.focus(); i.select(); i.onkeydown = function (e) { if (e.key === 'Enter') m.querySelector('.foot .primary').click(); }; }
		});
	}
	function confirmDel(text) { return U.modal({ title: 'Удалить?', width: 440, body: '<p>' + esc(text) + '</p>', buttons: [{ label: 'Отмена', value: false }, { label: 'Удалить', value: true, primary: true }] }); }
	async function pickImage(title) {
		var p = await U.pick({ kind: 'open', title: title, filters: [{ name: 'Картинки', ext: IMG_EXT }] });
		if (!p) return null;
		var b = await U.api.readBytes(p), ext = String(p).split('.').pop().toLowerCase();
		return { path: p, blob: new Blob([b], { type: ext === 'jpg' ? 'image/jpeg' : 'image/' + ext }) };
	}
	function pasted(e) {
		var it = e.clipboardData ? Array.prototype.slice.call(e.clipboardData.items || []) : [], f = null;
		it.forEach(function (x) { if (!f && x.kind === 'file' && /^image\//.test(x.type)) f = x.getAsFile(); });
		return f;
	}
	function supCount(id) { var n = 0, b = base(); for (var k in b.mats) if (Object.prototype.hasOwnProperty.call(b.mats, k)) { var r = B.supOfMat(b, k); if (r.sup && r.sup.id === id) n++; } return n; }
	function logo(s, big) {
		var px = big ? 70 : 54;
		if (s.logo) return '<img class="bLogo" src="' + esc(s.logo) + '" style="width:' + px + 'px;height:' + px + 'px" alt="">';
		var hue = 0; for (var i = 0; i < s.name.length; i++) hue = (hue * 31 + s.name.charCodeAt(i)) % 360;
		return '<span class="bLogo" style="width:' + px + 'px;height:' + px + 'px;background:hsl(' + hue + ',45%,42%)">' + esc(s.name.replace(/[^0-9A-Za-zА-Яа-яЁё]/g, '').slice(0, 2).toUpperCase() || '?') + '</span>';
	}
	function swatch(name) {
		var t = Bv.thumb(name), m = base().mats[name];
		if (m && m.img) t = m.img;
		return t ? '<img class="bSw" src="' + esc(t) + '" alt="">' : '<span class="bSw none"></span>';
	}
	function baseName(p) { return String(p || '').replace(/^.*[\\/]/, ''); }
	function relTex(p) { var d = base().tex.dir; return d && String(p).indexOf(d) === 0 ? String(p).substring(d.length).replace(/^[\\/]/, '') : String(p); }
	var HOW_TEX = { own: 'выбрана вручную', art: 'по артикулу', name: 'по названию', bazis: 'по базе БАЗИСа' };

	/* ------------------------ загрузка базы материалов БАЗИСа ------------------------ */
	/* Файлы, загруженные раньше, — в настройках (set.bzFiles): повторная загрузка в одну кнопку. */
	Bv.loadBazis = async function (path) {
		var set = S().set, files = (set.bzFiles || []).filter(Boolean);
		if (!path) {
			var pick = await U.modal({ title: 'Загрузить из базы материалов БАЗИСа', width: 560,
				body: '<p>Файл базы материалов БАЗИСа в формате .dbf. Возьмутся материалы (плиты, кромка, погонаж), фурнитура и покрытия: артикул, папка, размер листа, единица, текстура и её свойства. Ваше в «Базе» — классы, поставщик, ссылка, фото — не меняется. Сама база БАЗИСа не меняется.</p>' +
					(files.length ? '<div class="bzFiles">' + files.map(function (f, i) { return '<button class="bzF" data-i="' + i + '" title="' + esc(f) + '"><b>' + esc(baseName(f)) + '</b><span class="mute">' + esc(U.dirOf(f)) + '</span></button>'; }).join('') + '</div>' : ''),
				buttons: [{ label: 'Отмена', value: null }, { label: 'Выбрать файл…', primary: !files.length, value: '?' }],
				onOpen: function (m, close) { [].forEach.call(m.querySelectorAll('.bzF'), function (b) { b.onclick = function () { close(files[Number(b.dataset.i)]); }; }); } });
			if (!pick) return;
			if (pick === '?') pick = await U.pick({ kind: 'open', title: 'База материалов БАЗИСа', dir: files.length ? U.dirOf(files[0]) : S().boot.docs, filters: [{ name: 'База материалов (.dbf)', ext: ['dbf'] }] });
			if (!pick) return;
			path = pick;
		}
		var wait = U.toast('Читаю базу «' + baseName(path) + '»…', { ms: 60000 }), data, plan;
		try {
			var bytes = await U.api.readBytes(path);
			data = BM.dbf.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
			plan = B.bzPlan(base(), data.rows, baseName(path).replace(/\.dbf$/i, ''));
		} finally { if (wait && wait.remove) wait.remove(); }
		var k = plan.kinds, fmt = function (n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); };
		var go = await U.modal({ title: 'Загрузка из БАЗИСа · ' + baseName(path), width: 640,
			body: '<div class="bzGrid"><div><b>' + fmt(k['плита']) + '</b>плит</div><div><b>' + fmt(k['кромка']) + '</b>кромок</div><div><b>' + fmt(k['погонаж']) + '</b>погонажа</div><div><b>' + fmt(k['фурнитура'] + k['покрытие']) + '</b>фурнитуры и прочего</div></div>' +
				'<div class="bzList"><div><span class="a">Добавится</span>' + fmt(plan.add.length) + ' ' + window.App.plural(plan.add.length, 'новая запись', 'новые записи', 'новых записей') + '</div>' +
				'<div><span class="c">Обновится</span>' + fmt(plan.upd.length) + (plan.upd.length ? ' — размеры, единица, свойства 3D; ваши поставщик, фото, ссылка и классы останутся' : '') + '</div>' +
				'<div><span class="mute">Без изменений</span>' + fmt(plan.same) + '</div></div>' +
				'<p class="mute">Сама база БАЗИСа не меняется. Программа запомнит путь к файлу — в следующий раз загрузка в одну кнопку.</p>',
			buttons: [{ label: 'Отмена', value: false }, { label: 'Загрузить', primary: true, value: true }] });
		if (!go) return;
		B.bzApply(base(), plan);
		set.bzFiles = [path].concat(files.filter(function (f) { return f !== path; })).slice(0, 6);
		window.App.saveSettings();
		resetMemo(); Bv.save(true);
		if (Bv.tab !== 'mats') Bv.tab = 'mats';
		Bv.left = 'dir';
		Bv.render();
		U.toast('Из БАЗИСа: добавлено ' + fmt(plan.add.length) + ', обновлено ' + fmt(plan.upd.length));
		return plan;
	};

	/* --------------------------------- отрисовка -------------------------------- */
	Bv.render = function () {
		var s = S();
		if (s.section !== 'base' || !base()) return;
		if (s.st) Bv.learnProject();
		$('bTabs').innerHTML = TABS.map(function (t) { return '<button data-t="' + t[0] + '" class="' + (Bv.tab === t[0] ? 'on' : '') + '">' + t[1] + '</button>'; }).join('');
		$('bSearch').hidden = !(Bv.tab === 'mats' || Bv.tab === 'tex');
		var h = '';
		if (Bv.tab === 'mats') h = matsView();
		else if (Bv.tab === 'sup') h = supView();
		else if (Bv.tab === 'cls') h = clsView();
		else h = texView();
		var body = $('bBody'), top = body.querySelector('.bScroll') ? body.querySelector('.bScroll').scrollTop : 0;
		var left = body.querySelector('.bScroll') ? body.querySelector('.bScroll').scrollLeft : 0;
		body.innerHTML = h;
		if (window.Split) window.Split.attach(body);
		if (body.querySelector('.bScroll')) { body.querySelector('.bScroll').scrollTop = top; body.querySelector('.bScroll').scrollLeft = left; }
	};

	/* свёрнутые группы классов (код → 1) и раскрытые папки БАЗИСа (путь → 1) — в настройках, переживают перезапуск */
	function folds() {
		var s = window.App.S.set;
		if (!s.baseFold || typeof s.baseFold !== 'object') s.baseFold = {};
		if (!s.baseDirs || typeof s.baseDirs !== 'object') s.baseDirs = {};
		Bv.dirOpen = s.baseDirs;
		return s.baseFold;
	}
	/* ---- материалы и фурнитура ---- */
	function matsView() {
		folds();
		var b = base(), total = Object.keys(b.mats).length, kg = B.groupBy(b, 'kind'), dirs = null, hasBz = false;
		for (var k0 in b.mats) if (Object.prototype.hasOwnProperty.call(b.mats, k0) && b.mats[k0].bz) { hasBz = true; break; }
		if (!hasBz) Bv.left = 'cls';
		var useDir = Bv.left === 'dir';
		var list = useDir ? B.matsBy(b, '', '', Bv.q, Bv.dir) : B.matsBy(b, Bv.grp, Bv.cls, Bv.q);
		var t = '<aside class="bTree" data-pane="bTree" data-side="l">' + (hasBz ? '<div class="seg bLeftSeg"><button data-l="cls" class="' + (useDir ? '' : 'on') + '">Классы</button><button data-l="dir" class="' + (useDir ? 'on' : '') + '">Папки БАЗИСа</button></div>' : '<div class="sec">Классы</div>');
		/* группы классов и папки БАЗИСа сворачиваются по стрелке ▸/▾; что свёрнуто — запоминается (set.baseFold, set.baseDirs) */
		var fold = folds(), anyOpen = useDir ? Object.keys(Bv.dirOpen).some(function (k) { return Bv.dirOpen[k]; }) : b.groups.some(function (g) { return !fold[g.code]; });
		t += '<div class="bFoldAll"><button class="link" id="bFoldAll" data-to="' + (anyOpen ? 'fold' : 'open') + '">' + (anyOpen ? 'Свернуть все' : 'Развернуть все') + '</button></div>';
		if (!useDir) {
			t += '<div class="bt' + (!Bv.grp ? ' on' : '') + '" data-g="" data-c="">Все материалы <span class="mute">' + total + '</span></div>';
			b.groups.forEach(function (g) {
				var off = !!fold[g.code], sel = function (c) { return Bv.grp === g.code && Bv.cls === c; };
				t += '<div class="bt grp' + (Bv.grp === g.code && !Bv.cls ? ' on' : '') + '" data-g="' + esc(g.code) + '" data-c=""><span><i class="dtw" data-gtw="' + esc(g.code) + '" title="' + (off ? 'Развернуть' : 'Свернуть') + '">' + (off ? '▸' : '▾') + '</i>' + esc(g.name) + '</span>' + (off ? '<span class="mute">' + B.matsBy(b, g.code, '', '', '', true).length + '</span>' : '') + '</div>';
				g.classes.forEach(function (c) { if (off && !sel(c.code)) return; var nc = B.matsBy(b, g.code, c.code, '', '', true).length; t += '<div class="bt cl' + (nc ? '' : ' empty') + (sel(c.code) ? ' on' : '') + '" data-g="' + esc(g.code) + '" data-c="' + esc(c.code) + '">' + esc(c.name) + (nc ? ' <span class="mute">' + nc + '</span>' : '') + '</div>'; });
				if (!off || sel('-')) t += '<div class="bt cl none' + (sel('-') ? ' on' : '') + '" data-g="' + esc(g.code) + '" data-c="-">без класса <span class="mute">' + B.matsBy(b, g.code, '-', '', '', true).length + '</span></div>';
			});
		} else {
			dirs = B.bzDirs(b);
			t += '<div class="bt dir' + (!Bv.dir ? ' on' : '') + '" data-dir="">Все из БАЗИСа <span class="mute">' + dirs.n + '</span></div>';
			(function walk(nd, lv) {
				nd.kids.forEach(function (c) {
					var open = !!Bv.dirOpen[c.path] || (Bv.dir && Bv.dir.indexOf(c.path + '/') === 0);
					t += '<div class="bt dir' + (Bv.dir === c.path ? ' on' : '') + '" data-dir="' + esc(c.path) + '" style="padding-left:' + (8 + lv * 14) + 'px"><span><i class="dtw" data-tw="' + esc(c.path) + '">' + (c.kids.length ? (open ? '▾' : '▸') : '') + '</i>' + esc(c.name) + '</span><span class="mute">' + c.n + '</span></div>';
					if (open) walk(c, lv + 1);
				});
			})(dirs, 0);
		}
		t += '</aside>';
		var shown = list.slice(0, ROWS_MAX);
		var rows = shown.map(function (m) {
			var si = B.infoOf(b, m.name), tx = Bv.texOf(m.name), z = m.bz || {};
			var size = z.L > 0 && z.W > 0 ? Math.round(Math.max(z.L, z.W)) + ' × ' + Math.round(Math.min(z.L, z.W)) : (z.unit || '');
			return '<tr data-n="' + esc(m.name) + '" class="' + (Bv.sel === m.name ? 'on' : '') + '"><td>' + swatch(m.name) + '</td><td>' + esc(m.art || '') + '</td><td class="nm">' + esc(m.name) + '</td><td>' + esc((kg && B.mainCls(m, kg.code)) ? B.kindOfMat(b, m.name) : (m.kind || '')) + '</td>' +
				'<td>' + esc(size) + '</td><td>' + esc(si.shop) + (si.how === 'class' ? ' <span class="mute">(класс)</span>' : '') + '</td><td class="mute">' + (tx ? esc(baseName(tx.path)) : (b.tex.dir ? 'не найдена' : '')) + '</td>' +
				(hasBz ? '<td class="mute path" title="' + esc(z.grp || '') + '">' + esc(shortDir(z.grp)) + '</td>' : '') + '</tr>';
		}).join('');
		var empty = !total ? '<div class="bEmpty">Материалов пока нет. Они появятся сами, когда вы откроете проект: всё, что есть в смете, — плита, кромка, фурнитура, профили — записывается сюда. Или загрузите базу материалов БАЗИСа — кнопка «Загрузить из БАЗИСа…».</div>' :
			(!list.length ? '<div class="bEmpty">Под этот фильтр материалов нет.</div>' : (list.length > ROWS_MAX ? '<div class="bEmpty">Показаны первые ' + ROWS_MAX + ' из ' + list.length + ' — уточните поиск или выберите папку слева.</div>' : ''));
		return '<div class="bMats">' + t + '<div class="bScroll"><table class="bTab"><thead><tr><th></th><th>Артикул</th><th>Наименование</th><th>Вид</th><th>Лист / ед.</th><th>Поставщик</th><th>Текстура</th>' + (hasBz ? '<th>Папка БАЗИСа</th>' : '') + '</tr></thead><tbody>' + rows + '</tbody></table>' + empty + '</div>' + matCard() + '</div>';
	}
	/* «01. Листовые материалы/01. ЛДСП/01. Egger/ЛДСП 16 мм» → «ЛДСП / Egger / ЛДСП 16 мм» */
	function shortDir(g) { var p = String(g || '').split('/').map(function (x) { return x.replace(/^\s*\d+[.)]\s*/, '').trim(); }).filter(Boolean); return p.length > 3 ? p.slice(-3).join(' / ') : p.join(' / '); }
	function matCard() {
		var b = base(), m = Bv.sel ? b.mats[Bv.sel] : null;
		if (!m) return '<aside class="bCard" data-pane="bCard" data-side="r" data-min="260"></aside>';
		var si = B.infoOf(b, m.name), tx = Bv.texOf(m.name), es = B.edgeSize(m.art, m.name), big = tx ? img(tx.path) : null;
		var h = '<aside class="bCard" data-pane="bCard" data-side="r" data-min="260"><div class="sec">Материал<div class="grow"></div><button class="icon" id="bCardX" title="Закрыть">✕</button></div><div class="cbody"><h3>' + esc(m.name) + '</h3>' +
			'<div class="mute">' + esc(m.art || 'без артикула') + (es ? ' · толщина ' + String(es.th).replace('.', ',') + ' мм, ширина ' + String(es.w).replace('.', ',') + ' мм' : '') + '</div>' +
			'<div class="bTex">' + (big && big.m ? '<img src="' + esc(big.m) + '" alt="">' : '<span class="bSw none big"></span>') + '<div class="mute">' +
			(tx ? 'Текстура ' + HOW_TEX[tx.by] + ':<br><b>' + esc(relTex(tx.path)) + '</b>' : (b.tex.dir ? 'Текстура не найдена в папке.' : 'Папка текстур не указана (вкладка «Текстуры»).')) +
			'<div class="btns"><button id="bTexPick">Выбрать файл…</button>' + (m.tex ? '<button id="bTexAuto">Искать в папке</button>' : '') + '</div></div></div>' +
			'<div class="form">';
		b.groups.forEach(function (g) {
			/* классы группы — метками; в группах «Вид материала» и «Поставщик» первый — основной ★ (он идёт в смету) */
			var star = !!B.roleOf(g), list = B.clsOf(m, g.code);
			h += '<label>' + esc(g.name.replace(/^\d+[.)]\s*/, '')) + (B.roleOf(g) === 'sup' ? ' (класс)' : '') + '</label><div class="cchips" data-g="' + esc(g.code) + '">' +
				list.map(function (cc, i) {
					var c = B.cls(b, g.code, cc);
					if (!c) return '';
					return '<span class="cchip' + (star && !i ? ' main' : '') + '" data-c="' + esc(cc) + '">' + (star ? (i ? '<b class="st0" data-a="cmain" title="Сделать основным — пойдёт в смету">☆</b>' : '<b class="st" title="Основной — идёт в смету">★</b>') : '') +
						esc(c.name) + '<i data-a="cdel" title="Снять класс">✕</i></span>';
				}).join('') + '<button class="cadd" data-a="cadd" title="Поставить класс">＋</button></div>';
		});
		if (m.bz) {
			var z = m.bz, fx = function (v) { return String(Math.round(v * 100) / 100).replace('.', ','); }, kv = [];
			kv.push(['Папка', esc(z.grp ? z.grp.split('/').join(' / ') : '—')]);
			if (z.L > 0 || z.W > 0 || z.T > 0) kv.push(['Размер', [z.L, z.W, z.T].filter(function (v) { return v > 0; }).map(fx).join(' × ') + ' мм' + (m.kind === 'плита' && z.L > 0 && z.W > 0 ? ' — для раскроя' : '')]);
			if (z.unit) kv.push(['Единица', esc(z.unit) + (z.coef ? ', коэф. ' + fx(z.coef) + ' (в смету не идёт)' : '')]);
			var t3 = [];
			if (z.btex) t3.push('текстура ' + esc(z.btex) + (z.sx || z.sy ? ', шаг ' + fx(z.sx || 1000) + ' × ' + fx(z.sy || 1000) : '') + (z.ang ? ', угол ' + fx(z.ang) : ''));
			if (z.tr) t3.push('прозрачность ' + fx(z.tr));
			if (z.mir) t3.push('зеркальность ' + fx(z.mir));
			if (z.sh) t3.push('блеск ' + fx(z.sh));
			if (z.br) t3.push('яркость ' + fx(z.br));
			if (t3.length) kv.push(['3D', t3.join(' · ')]);
			h += '<label>Из БАЗИСа</label><div class="bzInfo"><span class="chip">' + esc(z.f || 'база') + '</span>' + kv.map(function (r) { return '<div><span class="mute">' + r[0] + '</span> ' + r[1] + '</div>'; }).join('') + '</div>';
		}
		var own = m.sup ? B.supById(b, m.sup) : null;
		h += '<label>Поставщик</label><div><input type="text" id="bMatSup" list="bSupList" value="' + esc(own ? own.name : '') + '" placeholder="' + esc(si.how === 'class' ? si.shop + ' — по классу' : 'выберите или впишите нового') + '"><datalist id="bSupList">' + b.sup.map(function (x) { return '<option value="' + esc(x.name) + '">'; }).join('') + '</datalist></div>' +
			'<label>Ссылка</label><div><input type="text" id="bMatUrl" maxlength="400" value="' + esc(m.url || '') + '" placeholder="https://… — страница товара"></div>' +
			'<label>Фото</label><div><div class="supImg" id="bMatImg">' + (m.img ? '<img src="' + esc(m.img) + '" alt="">' : '<span class="mute">нет фото — в документах будет текстура</span>') + '</div><div class="btns"><button id="bImgPick">Файл…</button>' + (m.img ? '<button id="bImgX">Убрать</button>' : '') + '<span class="mute">или Ctrl+V</span></div></div>' +
			'</div><div class="btns" style="margin-top:14px"><button id="bMatDel">Убрать из «Базы»</button></div></div></aside>';
		return h;
	}

	/* список классов группы под «＋»: поиск, ✓ у поставленных, щелчок — поставить или снять */
	function clsPick(btn, m, gcode) {
		var g = B.group(base(), gcode), old = document.querySelector('.cdd');
		if (old) old.remove();
		if (!g) return;
		var dd = document.createElement('div');
		dd.className = 'cdd';
		dd.innerHTML = '<input type="search" placeholder="Поиск класса…" autocomplete="off"><div class="cl"></div>';
		document.body.appendChild(dd);
		var r = btn.getBoundingClientRect(), inp = dd.querySelector('input'), cl = dd.querySelector('.cl');
		dd.style.left = Math.max(4, Math.min(r.left, window.innerWidth - 300)) + 'px';
		dd.style.top = Math.min(r.bottom + 4, window.innerHeight - 320) + 'px';
		function fill() {
			var q = low(inp.value).trim();
			cl.innerHTML = g.classes.filter(function (c) { return !q || low(c.name).indexOf(q) >= 0; }).map(function (c) { var on = B.hasCls(m, gcode, c.code); return '<div data-c="' + esc(c.code) + '" class="' + (on ? 'ok' : '') + '">' + (on ? '✓ ' : '') + esc(c.name) + '</div>'; }).join('') || '<div class="mute">нет таких классов</div>';
		}
		fill(); inp.focus();
		inp.addEventListener('input', fill);
		inp.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); if (e.key === 'Enter') { var d = cl.querySelector('[data-c]'); if (d) d.click(); } });
		cl.addEventListener('click', function (e) {
			var d = e.target.closest('[data-c]');
			if (!d) return;
			if (B.hasCls(m, gcode, d.dataset.c)) B.delCls(m, gcode, d.dataset.c); else B.addCls(m, gcode, d.dataset.c);
			close(); changed();
		});
		function close() { dd.remove(); document.removeEventListener('mousedown', out, true); }
		function out(e) { if (!dd.contains(e.target)) close(); }
		setTimeout(function () { document.addEventListener('mousedown', out, true); }, 0);
	}

	/* ---- поставщики ---- */
	function supView() {
		var b = base(), cur = Bv.supSel === '+' ? { id: '+', name: '' } : B.supById(b, Bv.supSel);
		var cards = b.sup.map(function (s) {
			return '<div class="bSup' + (cur && cur.id === s.id ? ' on' : '') + '" data-id="' + esc(s.id) + '">' + logo(s) + '<div><b>' + esc(s.name) + '</b>' + (s.url ? '<div class="lnk">' + esc(s.url.replace(/^https?:\/\//, '')) + '</div>' : '') +
				'<div class="mute">' + esc([s.phone, s.person].filter(Boolean).join(' · ') || '—') + '</div><div><span class="chip">материалов: ' + supCount(s.id) + '</span></div></div></div>';
		}).join('') + '<div class="bSup add" data-id="+">＋ Добавить поставщика</div>';
		var card = '';
		if (cur) {
			card = '<aside class="bCard" data-pane="bCard" data-side="r" data-min="260"><div class="sec">' + (cur.id === '+' ? 'Новый поставщик' : 'Поставщик') + '<div class="grow"></div><button class="icon" id="bSupX" title="Закрыть">✕</button></div><div class="cbody">' +
				'<div class="bLogoRow">' + logo(cur.name ? cur : { name: '?' }, true) + '<button id="bLogoPick">Логотип…</button>' + (cur.logo ? '<button id="bLogoX">Убрать</button>' : '') + '<span class="mute">или Ctrl+V</span></div><div class="form">' +
				B.SUP_FIELDS.map(function (f) { return '<label>' + f[1] + '</label><div>' + (f[0] === 'note' ? '<textarea id="bs_' + f[0] + '" rows="3">' + esc(cur[f[0]] || '') + '</textarea>' : '<input type="text" id="bs_' + f[0] + '" value="' + esc(cur[f[0]] || '') + '"' + (f[0] === 'name' ? ' autofocus' : '') + '>') + '</div>'; }).join('') +
				'</div><div class="btns" style="margin-top:14px"><button class="primary" id="bSupSave">Сохранить</button>' + (cur.id !== '+' ? '<button id="bSupDel">Удалить</button>' : '') + '</div></div></aside>';
		}
		return '<div class="bSups"><div class="bScroll"><div class="bGrid">' + cards + '</div></div>' + card + '</div>';
	}

	/* ---- классы ---- */
	/* Классы колонками (группа — колонка, ширина тянется за стык); правая кнопка мыши — меню строчки и группы. */
	function clsView() {
		var b = base();
		var h = '<div class="bScroll bClsWrap">';
		b.groups.forEach(function (g) {
			h += '<div class="bGcol" data-g="' + esc(g.code) + '" data-pane="cls:' + esc(g.code) + '" data-side="l" data-min="150"><div class="gh"><b>' + esc(g.name) + '</b>' +
				'<select class="gRole" title="Для чего группа"><option value="">обычная группа</option><option value="kind"' + (g.role === 'kind' ? ' selected' : '') + '>вид материала — разделы сметы</option><option value="sup"' + (g.role === 'sup' ? ' selected' : '') + '>поставщик</option></select></div><div class="gb">' +
				g.classes.map(function (c) { return '<div class="cr' + (Bv.clsSel === g.code + '|' + c.code ? ' on' : '') + '" data-c="' + esc(c.code) + '"><span class="cn">' + esc(c.name) + '</span><span class="n">' + B.matsBy(b, g.code, c.code, '').length + '</span><button data-a="renc" title="Переименовать (F2)">✎</button><button data-a="delc" title="Удалить (Del)">✕</button></div>'; }).join('') +
				'<div class="addc" data-a="addc">＋ строчка</div></div></div>';
		});
		return h + '<div class="bGcol addg"><button id="bAddG">＋ Группа</button><button id="bPreset" title="Добавить недостающие группы и классы из набора по умолчанию">Вернуть классы по умолчанию</button></div></div>';
	}
	/* действия с классами — из кнопок, меню правой кнопки мыши и клавиш */
	async function addClass(g, after) {
		var cn = await ask('Новая строчка в группе «' + g.name + '»', '');
		if (!cn) return;
		var k = 1; while (B.cls(base(), g.code, g.code + '_' + k)) k++;
		var c = { code: g.code + '_' + k, name: cn }, i = after ? g.classes.indexOf(after) : -1;
		if (i >= 0) g.classes.splice(i + 1, 0, c); else g.classes.push(c);
		Bv.clsSel = g.code + '|' + c.code; changed();
	}
	async function renameClass(g, c) { var cn = await ask('Название класса', c.name); if (cn) { c.name = cn; changed(); } }
	async function delClass(g, c) {
		if (!(await confirmDel('Удалить класс «' + c.name + '»? У материалов он снимется.'))) return;
		var b = base();
		g.classes = g.classes.filter(function (q) { return q !== c; });
		B.dropCls(b, g.code, c.code);
		Bv.clsSel = ''; changed();
	}
	function moveClass(g, c, d) { var i = g.classes.indexOf(c), j = i + d; if (i < 0 || j < 0 || j >= g.classes.length) return; g.classes.splice(i, 1); g.classes.splice(j, 0, c); changed(); }
	async function addGroup() { var gn = await ask('Новая группа классов', ''); if (gn) { var n = 1; while (B.group(base(), 'G' + n)) n++; base().groups.push({ code: 'G' + n, name: gn, role: '', classes: [] }); changed(); } }
	async function renameGroup(g) { var gn = await ask('Название группы', g.name); if (gn) { g.name = gn; changed(); } }
	async function delGroup(g) {
		if (!(await confirmDel('Удалить группу «' + g.name + '» со всеми классами? У материалов эти классы снимутся.'))) return;
		var b = base();
		b.groups = b.groups.filter(function (q) { return q !== g; });
		for (var mk in b.mats) if (Object.prototype.hasOwnProperty.call(b.mats, mk)) delete b.mats[mk].cls[g.code];
		changed();
	}
	function clsMenu(e) {
		var col = e.target.closest('.bGcol[data-g]');
		if (!col) { if (e.target.closest('.bClsWrap')) { e.preventDefault(); U.menu(e.clientX, e.clientY, [['＋ Новая группа', addGroup]]); } return; }
		e.preventDefault();
		var g = B.group(base(), col.dataset.g), cr = e.target.closest('.cr'), c = cr ? B.cls(base(), g.code, cr.dataset.c) : null, acts = [];
		if (c) {
			Bv.clsSel = g.code + '|' + c.code;
			col.querySelectorAll('.cr').forEach(function (x) { x.classList.toggle('on', x === cr); });
			var i = g.classes.indexOf(c);
			acts.push(['＋ Добавить новую строчку', function () { addClass(g, c); }]);
			acts.push(['Переименовать', function () { renameClass(g, c); }, 'F2']);
			acts.push(['▲ Вверх', function () { moveClass(g, c, -1); }, '', i <= 0]);
			acts.push(['▼ Вниз', function () { moveClass(g, c, 1); }, '', i >= g.classes.length - 1]);
			acts.push(null);
			acts.push(['Удалить', function () { delClass(g, c); }, 'Del']);
			acts.push(null);
		} else acts.push(['＋ Добавить новую строчку', function () { addClass(g, null); }]);
		acts.push(['Переименовать группу «' + g.name + '»', function () { renameGroup(g); }]);
		acts.push(['Удалить группу', function () { delGroup(g); }]);
		acts.push(['＋ Новая группа', addGroup]);
		U.menu(e.clientX, e.clientY, acts);
	}
	function selCls() { if (!Bv.clsSel) return null; var p = Bv.clsSel.split('|'), g = B.group(base(), p[0]), c = g ? B.cls(base(), g.code, p[1]) : null; return c ? { g: g, c: c } : null; }

	/* ---- текстуры ---- */
	function texView() {
		var b = base(), list = B.matsBy(b, '', '', Bv.q), found = 0;
		var rows = list.map(function (m) {
			var t = Bv.texOf(m.name);
			if (t) found++;
			return '<tr data-n="' + esc(m.name) + '"><td>' + swatch(m.name) + '</td><td class="nm">' + esc(m.name) + (m.art ? ' <span class="mute">' + esc(m.art) + '</span>' : '') + '</td><td class="mute">' + (t ? esc(relTex(t.path)) : '—') + '</td><td>' +
				(t ? HOW_TEX[t.by] : '<span class="bad">не найдена</span>') + ' <button data-a="pick">Указать…</button>' + (m.tex ? '<button data-a="auto">Искать в папке</button>' : '') + '</td></tr>';
		}).join('');
		return '<div class="bScroll bTexs"><div class="form bDir"><label>Папка текстур</label><div class="pathrow"><input type="text" id="bTexDir" value="' + esc(b.tex.dir || '') + '" placeholder="папка с картинками текстур (подпапки тоже)" spellcheck="false"><button id="bTexDirPick">Обзор…</button><button id="bTexScan">Обновить</button></div></div>' +
			'<p class="mute">' + (Bv.scanErr ? '<span class="bad">' + esc(Bv.scanErr) + '</span>' : (b.tex.dir ? 'Картинок в папке: ' + Bv.files.length + (Bv.more ? ' (показаны первые)' : '') + '. Найдено текстур: ' + found + ' из ' + list.length + '.' : 'Укажите папку — текстура ищется сама: сначала по артикулу, потом по названию, с подпапками.')) +
			' Текстура видна в смете и документах (если у материала нет своего фото), в 3D и на картах раскроя.</p>' +
			'<table class="bTab"><thead><tr><th></th><th>Материал</th><th>Файл</th><th>Как найдена</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
	}

	/* ---------------------------------- действия --------------------------------- */
	function changed() { resetMemo(); Bv.save(); Bv.render(); if (window.Model && window.Model.texChanged) window.Model.texChanged(); }
	/* Проект одним файлом: текстуры материалов из него — в «Базу», если своей там нет. Картинка копируется
	   в «<папка настроек>\Текстуры из моделей» и ставится материалу (как «Текстура…» вручную). list — [{ name, path }]. */
	Bv.fromModel = async function (list) {
		if (!base() || !list || !list.length) return 0;
		var S0 = S(), dir = U.join(S0.boot.dataDir, 'Текстуры из моделей'), n = 0;
		for (var i = 0; i < list.length; i++) {
			var it = list[i]; if (!it.name || Bv.texOf(it.name)) continue;
			var m = /\.[a-z0-9]{2,5}$/i.exec(it.path), dst = U.join(dir, String(it.name).replace(/[\\/:*?"<>|]+/g, '_').trim() + (m ? m[0].toLowerCase() : '.jpg'));
			try {
				var st = await U.api.stat(dst);
				if (!st || !st.exists) { await U.api.mkdir(dir); await U.api.write(dst, await U.api.readBytes(it.path)); }
				B.learn(base(), it.name, '', '').tex = dst; n++;
			} catch (e) { }
		}
		if (n) { resetMemo(); Bv.save(); if (S0.section === 'base') Bv.render(); }
		return n;
	};
	async function setTex(name) {
		var r = await U.pick({ kind: 'open', title: 'Текстура: ' + name, dir: base().tex.dir || '', filters: [{ name: 'Картинки', ext: IMG_EXT.concat(['tif', 'tiff']) }] });
		if (!r) return;
		B.learn(base(), name, '', '').tex = r;
		changed();
	}
	async function readCard(m) {
		var b = base(), mat = b.mats[Bv.sel];
		if (!mat) return;
		var sp = m.querySelector('#bMatSup').value.trim(), url = m.querySelector('#bMatUrl').value.trim();
		if (sp) { var s = B.ensureSup(b, sp); mat.sup = s.id; } else delete mat.sup;
		if (url && !/^https?:\/\//i.test(url)) url = 'https://' + url;
		if (url) mat.url = url; else delete mat.url;
	}
	Bv.init = function () {
		$('bTabs').addEventListener('click', function (e) { var b = e.target.closest('button[data-t]'); if (b) { Bv.tab = b.dataset.t; Bv.render(); } });
		$('bBzLoad').addEventListener('click', function () { Bv.loadBazis().catch(U.error); });
		$('bSearch').addEventListener('input', function () { Bv.q = this.value; Bv.render(); });
		var body = $('bBody');
		body.addEventListener('click', async function (e) {
			var t = e.target, x, b = base();
			if ((x = t.closest('.bLeftSeg button[data-l]'))) { Bv.left = x.dataset.l; Bv.render(); return; }
			if ((x = t.closest('.bTree .dtw[data-gtw]'))) { var fo = folds(), gc = x.dataset.gtw; if (fo[gc]) delete fo[gc]; else fo[gc] = 1; window.App.saveSettings(); Bv.render(); return; }
			if ((x = t.closest('#bFoldAll'))) {
				var shut = x.dataset.to === 'fold';
				if (Bv.left === 'dir') { for (var dk in Bv.dirOpen) if (Object.prototype.hasOwnProperty.call(Bv.dirOpen, dk)) delete Bv.dirOpen[dk]; if (!shut) (function all(nd) { nd.kids.forEach(function (c) { if (c.kids.length) { Bv.dirOpen[c.path] = 1; all(c); } }); })(B.bzDirs(b)); }
				else { var fa = folds(); b.groups.forEach(function (g) { if (shut) fa[g.code] = 1; else delete fa[g.code]; }); }
				window.App.saveSettings(); Bv.render(); return;
			}
			if ((x = t.closest('.bTree .dtw[data-tw]'))) { var tw = x.dataset.tw; Bv.dirOpen[tw] = !Bv.dirOpen[tw]; if (!Bv.dirOpen[tw]) delete Bv.dirOpen[tw]; if (!Bv.dirOpen[tw] && Bv.dir.indexOf(tw + '/') === 0) Bv.dir = tw; window.App.saveSettings(); Bv.render(); return; }
			if ((x = t.closest('.bTree .bt.dir'))) { Bv.dir = x.dataset.dir; if (Bv.dir && !Bv.dirOpen[Bv.dir]) { Bv.dirOpen[Bv.dir] = 1; window.App.saveSettings(); } Bv.render(); return; }
			if ((x = t.closest('.bTree .bt'))) { Bv.grp = x.dataset.g; Bv.cls = x.dataset.c; Bv.render(); return; }
			if ((x = t.closest('.bMats tr[data-n]'))) { Bv.sel = x.dataset.n; Bv.render(); return; }
			if (t.closest('#bCardX')) { Bv.sel = ''; Bv.render(); return; }
			/* метки классов в карточке */
			if ((x = t.closest('.cchips [data-a]'))) {
				var cm = b.mats[Bv.sel], cg = x.closest('.cchips').dataset.g, cc = x.closest('.cchip') ? x.closest('.cchip').dataset.c : '';
				if (!cm) return;
				if (x.dataset.a === 'cdel') { B.delCls(cm, cg, cc); changed(); }
				else if (x.dataset.a === 'cmain') { B.setMain(cm, cg, cc); changed(); }
				else if (x.dataset.a === 'cadd') clsPick(x, cm, cg);
				return;
			}
			if (t.closest('#bTexPick')) { await setTex(Bv.sel); return; }
			if (t.closest('#bTexAuto')) { delete b.mats[Bv.sel].tex; changed(); return; }
			if (t.closest('#bImgPick')) { try { var f = await pickImage('Фото: ' + Bv.sel); if (f) { b.mats[Bv.sel].img = await window.Est.shrink(f.blob); changed(); } } catch (er) { U.error(er); } return; }
			if (t.closest('#bImgX')) { delete b.mats[Bv.sel].img; changed(); return; }
			if (t.closest('#bMatDel')) { if (await confirmDel('Убрать «' + Bv.sel + '» из «Базы»? Если материал есть в проекте, он запишется снова, но без классов, поставщика и фото.')) { delete b.mats[Bv.sel]; Bv.sel = ''; changed(); } return; }
			/* поставщики */
			if ((x = t.closest('.bSup[data-id]'))) { Bv.supSel = x.dataset.id; Bv.render(); return; }
			if (t.closest('#bSupX')) { Bv.supSel = ''; Bv.render(); return; }
			if (t.closest('#bSupSave')) {
				var nm = $('bs_name').value.trim();
				if (!nm) { U.toast('Впишите название поставщика.', { bad: true }); return; }
				var other = B.supByName(b, nm), cur = Bv.supSel === '+' ? null : B.supById(b, Bv.supSel);
				if (other && other !== cur) { U.toast('Поставщик «' + other.name + '» уже есть.', { bad: true }); return; }
				if (!cur) { cur = { id: B.newId('s'), name: nm }; if (Bv.newLogo) cur.logo = Bv.newLogo; b.sup.push(cur); }
				B.SUP_FIELDS.forEach(function (f) { var v = $('bs_' + f[0]).value.trim(); if (f[0] === 'url' && v && !/^https?:\/\//i.test(v)) v = 'https://' + v; if (v) cur[f[0]] = v; else if (f[0] !== 'name') delete cur[f[0]]; });
				Bv.newLogo = ''; Bv.supSel = cur.id; changed(); U.toast('Поставщик сохранён.'); return;
			}
			if (t.closest('#bSupDel')) { var sd = B.supById(b, Bv.supSel); if (sd && await confirmDel('Удалить поставщика «' + sd.name + '»? У его материалов поставщик снимется (класс останется).')) { B.dropSup(b, sd.id); Bv.supSel = ''; changed(); } return; }
			if (t.closest('#bLogoPick')) { try { var lf = await pickImage('Логотип'); if (lf) await setLogo(lf.blob); } catch (er2) { U.error(er2); } return; }
			if (t.closest('#bLogoX')) { var sl = B.supById(b, Bv.supSel); if (sl) { delete sl.logo; changed(); } return; }
			/* классы */
			if (t.closest('#bAddG')) { await addGroup(); return; }
			if (t.closest('#bPreset')) { B.PRESET.forEach(function (pg) { var g = B.group(b, pg.code); if (!g) { b.groups.push(JSON.parse(JSON.stringify(pg))); return; } pg.classes.forEach(function (pc) { if (!B.cls(b, pg.code, pc.code)) g.classes.push({ code: pc.code, name: pc.name }); }); }); changed(); return; }
			if ((x = t.closest('.bGcol[data-g] [data-a]'))) {
				var g2 = B.group(b, x.closest('.bGcol').dataset.g), a = x.dataset.a, cr = x.closest('.cr'), c2 = cr ? B.cls(b, g2.code, cr.dataset.c) : null;
				if (a === 'addc') await addClass(g2, null);
				else if (a === 'renc' && c2) await renameClass(g2, c2);
				else if (a === 'delc' && c2) await delClass(g2, c2);
				return;
			}
			if ((x = t.closest('.bGcol[data-g] .cr'))) { Bv.clsSel = x.closest('.bGcol').dataset.g + '|' + x.dataset.c; x.parentNode.querySelectorAll('.cr').forEach(function (y) { y.classList.toggle('on', y === x); }); return; }
			/* текстуры */
			if (t.closest('#bTexDirPick')) { var d = await U.pick({ kind: 'folder', title: 'Папка текстур', dir: b.tex.dir || S().boot.docs }); if (d) { b.tex.dir = d; Bv.save(true); await Bv.scan(); Bv.render(); } return; }
			if (t.closest('#bTexScan')) { b.tex.dir = $('bTexDir').value.trim(); Bv.save(true); imgs = {}; await Bv.scan(); Bv.render(); return; }
			if ((x = t.closest('.bTexs tr[data-n] button[data-a]'))) { var tn = x.closest('tr').dataset.n; if (x.dataset.a === 'pick') await setTex(tn); else { delete b.mats[tn].tex; changed(); } }
		});
		body.addEventListener('change', async function (e) {
			var t = e.target, b = base();
			if (t.matches('#bMatSup, #bMatUrl')) { await readCard($('bBody')); changed(); return; }
			if (t.matches('.gRole')) { var g = B.group(b, t.closest('.bGcol').dataset.g); if (t.value) b.groups.forEach(function (q) { if (q.role === t.value) q.role = ''; }); g.role = t.value; changed(); return; }
			if (t.matches('#bTexDir')) { b.tex.dir = t.value.trim(); Bv.save(true); await Bv.scan(); Bv.render(); }
		});
		body.addEventListener('contextmenu', function (e) { if (Bv.tab === 'cls') clsMenu(e); });
		document.addEventListener('keydown', function (e) {
			if (S().section !== 'base' || Bv.tab !== 'cls' || document.querySelector('.back:not(.out) .modal')) return;
			var tg = e.target.tagName; if (tg === 'INPUT' || tg === 'TEXTAREA' || tg === 'SELECT') return;
			var sc = selCls(); if (!sc) return;
			if (e.key === 'F2') { e.preventDefault(); renameClass(sc.g, sc.c); }
			else if (e.key === 'Delete') { e.preventDefault(); delClass(sc.g, sc.c); }
		});
		body.addEventListener('paste', async function (e) {
			var f = pasted(e);
			if (!f) return;
			if (Bv.tab === 'sup' && Bv.supSel) { e.preventDefault(); await setLogo(f); }
			else if (Bv.tab === 'mats' && Bv.sel) { e.preventDefault(); try { base().mats[Bv.sel].img = await window.Est.shrink(f); changed(); } catch (er) { U.error(er); } }
		});
	};
	async function setLogo(blob) {
		var data;
		try { data = await window.Est.shrink(blob); } catch (e) { U.toast(e.message, { bad: true }); return; }
		if (Bv.supSel === '+') { Bv.newLogo = data; var el = $('bBody').querySelector('.bLogoRow .bLogo'); if (el) el.outerHTML = '<img class="bLogo" src="' + data + '" style="width:70px;height:70px" alt="">'; return; }
		var s = B.supById(base(), Bv.supSel);
		if (s) { s.logo = data; changed(); }
	}
})();
