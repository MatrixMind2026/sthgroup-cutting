/* STHGroup — окно «База материалов и комплектующих» (2.1, вариант Б): расположение как в базе материалов БАЗИСа,
   цвета и шрифты программы. Слева — поиск и дерево групп, справа — таблица материалов со строкой фильтров, внизу —
   сопутствующие материалы и операции выбранного материала. Карточка материала — вкладки БАЗИСа и «Склад», «Поставщик».
   Данные и правила — core/matbase.js. Файл базы — в папке, которую выбрал пользователь (MB.FILE). */
(function () {
	'use strict';
	var U = window.UI, MB = BM.mb, esc = U.esc, $ = U.$;
	var W = window.MBW = {};
	var S = W.S = { b: null, path: '', mtime: 0, group: '', open: {}, sel: [], cur: '', q: '', filters: {}, sort: { col: 'name', dir: 1 }, list: [], dirty: false, showFilters: true };
	var ROW = 22;
	var LS = function (k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem('br_mb_' + k) || 'null'); localStorage.setItem('br_mb_' + k, JSON.stringify(v)); } catch (e) { return null; } };

	/* ----------------------------------- файл ----------------------------------- */
	var saveT = null, saving = Promise.resolve();
	W.changed = function () { S.dirty = true; clearTimeout(saveT); saveT = setTimeout(W.save, 350); W.render(); };
	W.save = function () {
		clearTimeout(saveT);
		if (!S.dirty || !S.path) return saving;
		S.dirty = false;
		var text = JSON.stringify(S.b);
		saving = saving.then(async function () {
			try {
				var st = await U.api.stat(S.path);
				if (st.exists && S.mtime && st.mtime !== S.mtime) {
					var v = await U.modal({ title: 'База изменилась на другом компьютере', width: 520, body: '<p>Файл базы изменили, пока окно было открыто (например, на другом компьютере через общую папку).</p><p>Записать ваши правки поверх или открыть базу заново (ваши последние правки пропадут)?</p>',
						buttons: [{ label: 'Открыть заново', value: 'reload' }, { label: 'Записать мои правки', value: 'write', primary: true }] });
					if (v === 'reload') { await W.load(S.path); return; }
				}
				await U.api.write(S.path, text);
				var s2 = await U.api.stat(S.path);
				S.mtime = s2.mtime || 0;
				W.notify();
				$('mbState').textContent = 'Записано ' + new Date().toLocaleTimeString('ru-RU');
			} catch (e) { S.dirty = true; U.error(e); }
		});
		return saving;
	};
	W.load = async function (path, keep) {
		var st = await U.api.stat(path), b;
		if (st.exists) b = MB.fix(JSON.parse(await U.api.readText(path)));
		else { b = MB.empty(); await U.api.write(path, JSON.stringify(b)); st = await U.api.stat(path); }
		S.b = b; S.path = path; S.mtime = st.mtime || 0; S.dirty = false;
		if (!keep || !MB.group(b, S.group)) S.group = '';
		if (!keep || !b.mats[S.cur]) { S.sel = []; S.cur = ''; } else S.sel = S.sel.filter(function (id) { return b.mats[id]; });
		if (b.set.sort && b.set.keepSort) S.sort = b.set.sort;
		LS('file', path);
		/* где файл базы — программа читает отсюда (смета, раскрой, «Списать по заказу») */
		if (W.boot && W.boot.dataDir) { try { await U.api.write(U.join(W.boot.dataDir, 'matbase.json'), JSON.stringify({ file: path })); } catch (e) { console.warn(e); } }
		W.notify();
		$('mbFile').textContent = path;
		W.render();
	};
	/* окну программы: база изменилась — пересчитать смету */
	W.notify = function () {
		[window.opener, window.parent !== window ? window.parent : null].forEach(function (w) { try { if (w && w.MatBase) w.MatBase.changed(); } catch (e) { /* окно программы закрыто */ } });
	};
	/* база изменилась снаружи («Списать по заказу» в программе, другой компьютер) — перечитать, если своих правок нет */
	W.recheck = async function () {
		if (!S.path || S.dirty) return;
		try { var st = await U.api.stat(S.path); if (st.exists && st.mtime && st.mtime !== S.mtime) await W.load(S.path, true); } catch (e) { /* не страшно */ }
	};
	/* Где хранится база: путь можно вписать руками или выбрать (системное окно, на планшете — ещё «Папка на устройстве…»).
	   Если база уже открыта — её можно перенести в новую папку (копия файла) или открыть ту, что там уже лежит. */
	W.chooseFolder = async function () {
		var cur = S.path ? U.dirOf(S.path) : '', sugg = cur || (W.boot && W.boot.docs) || '';
		var v = await U.modal({ title: 'Папка базы материалов', width: 640, cls: 'mbPlace',
			body: '<p>База — один файл «' + esc(MB.FILE) + '» в этой папке. Папка может быть общей (Яндекс Диск, сетевая папка) — тогда база одна на нескольких компьютерах.</p>' +
				(S.path ? '<p class="mute">Сейчас: ' + esc(S.path) + '</p>' : '') +
				'<label class="fl">Папка<div class="row tight" style="flex-wrap:nowrap"><input type="text" id="plDir" spellcheck="false" style="flex:1" value="' + esc(sugg) + '" data-own-enter><button id="plPick">Выбрать…</button></div></label>' +
				'<p class="mute" id="plInfo"></p>' +
				(S.path ? '<fieldset id="plWhat"><legend>Если там уже есть база</legend><label class="rd"><input type="radio" name="plW" value="open" checked> открыть ту базу</label><label class="rd"><input type="radio" name="plW" value="over"> заменить её этой</label></fieldset>' +
					'<p class="mute">Если базы там нет — эта база будет перенесена туда (файл скопируется, прежний останется на месте).</p>' : ''),
			buttons: [{ label: 'Отмена', value: null }, { label: 'Готово', primary: true, run: async function (m) {
				var dir = m.querySelector('#plDir').value.trim().replace(/[\\/]+$/, '');
				if (!dir) { U.toast('Укажите папку'); return false; }
				var st;
				try { st = await U.api.stat(dir); } catch (e) { U.error(e); return false; }
				if (!st.exists) {
					if (!(await U.confirm('Папки нет', 'Папки «' + dir + '» нет. Создать её?', 'Создать'))) return false;
					try { await U.api.mkdir(dir); } catch (e2) { U.error(e2); return false; }
				} else if (!st.dir) { U.toast('Это файл, а не папка'); return false; }
				return { dir: dir, what: (m.querySelector('[name=plW]:checked') || {}).value || 'open' };
			} }],
			onOpen: function (m) {
				var info = async function () {
					var d = m.querySelector('#plDir').value.trim(), t = m.querySelector('#plInfo');
					if (!d) { t.textContent = ''; return; }
					try { var f = await U.api.stat(U.join(d, MB.FILE)); t.textContent = f.exists ? 'В этой папке уже есть база материалов.' : 'Базы в этой папке нет — ' + (S.path ? 'эта база будет перенесена сюда.' : 'будет создана новая, пустая.'); } catch (e) { t.textContent = ''; }
				};
				m.querySelector('#plDir').oninput = function () { clearTimeout(W.plT); W.plT = setTimeout(info, 300); };
				m.querySelector('#plDir').onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); info(); } };
				m.querySelector('#plPick').onclick = async function () {
					var d = await U.pick({ kind: 'folder', title: 'Папка для базы материалов', dir: m.querySelector('#plDir').value.trim() || sugg });
					if (d) { m.querySelector('#plDir').value = d; info(); }
				};
				info();
			} });
		if (!v) return false;
		var target = U.join(v.dir, MB.FILE);
		if (target === S.path) return true;
		await W.save();
		var there = (await U.api.stat(target)).exists;
		if (S.b && S.path && (!there || v.what === 'over')) await U.api.write(target, JSON.stringify(S.b));
		await W.load(target);
		U.toast(there && v.what !== 'over' ? 'Открыта база из папки ' + v.dir : 'База теперь в папке ' + v.dir);
		return true;
	};

	/* ---------------------------------- меню ------------------------------------ */
	var MENU = [
		['Файл', [['Импорт номенклатуры', [['из CSV', function () { W.importFile('csv'); }], ['из DBF', function () { W.importFile('dbf'); }], ['из XML', function () { W.importFile('xml'); }]]],
			null, ['Экспорт всей номенклатуры', expSub('all')], ['Экспорт номенклатуры текущей группы', expSub('group')], ['Экспорт выделенной номенклатуры', expSub('sel')],
			null, ['Взять из прежней «Базы»…', function () { W.fromOld(); }], ['Папка базы…', function () { W.chooseFolder(); }]]],
		['Правка', [['Добавить материал', function () { W.card(null); }], ['Удалить все сопутствующие', function () { W.dropAllRel(); }], ['Удалить все артикулы', function () { W.dropAllArts(); }]]],
		['Справочники', [['Классы материалов', function () { W.classes(); }], ['Единицы измерения', function () { W.units(); }], ['Альтернативные валюты', function () { W.currencies(); }], null, ['Поставщики', function () { W.suppliers(); }]]],
		['Склад', [['Приход…', function () { W.doc('in'); }], ['Корректировка остатков…', function () { W.doc('adj'); }], null, ['Документы', function () { W.docs(); }], ['Деловые обрезки', function () { W.offcutsWin(); }]]],
		['Инструменты', [['Обновление цен', function () { W.prices(false); }], ['Установить наценку', function () { W.prices(true); }], ['Групповое редактирование параметров…', function () { W.bulk(); }], ['Переименовать выделенные…', function () { W.rename(); }], ['Обновить цены по ссылкам…', function () { if (window.STHShop) window.STHShop.updateAll(S.b, W.changed); }], null,
			['Поиск дубликатов в базе', function () { W.dups(); }], ['Создать резервную копию базы…', function () { W.backup(); }]]],
		['Настройки', [['В группе показывать все материалы подгрупп', function () { S.b.set.showSub = S.b.set.showSub ? 0 : 1; W.changed(); }, function () { return S.b.set.showSub; }],
			['Сохранять сортировку материалов в подгруппах', function () { S.b.set.keepSort = S.b.set.keepSort ? 0 : 1; W.changed(); }, function () { return S.b.set.keepSort; }], null,
			['Столбцы таблицы…', function () { W.colsWin(); }], ['Папка базы…', function () { W.chooseFolder(); }], ['Параметры', function () { W.params(); }]]],
		['?', [['О базе материалов', function () { W.about(); }]]]];
	function expSub(what) { return [['в CSV', function () { W.exportFile(what, 'csv'); }], ['в DBF', function () { W.exportFile(what, 'dbf'); }], ['в MS Excel', function () { W.exportFile(what, 'xlsx'); }], ['в XML', function () { W.exportFile(what, 'xml'); }]]; }
	function popup(items, x, y, parent) {
		W.closeMenus(parent);
		var m = document.createElement('div');
		m.className = 'mbPop';
		items.forEach(function (it) {
			if (!it) { m.appendChild(document.createElement('hr')); return; }
			var d = document.createElement('div');
			d.className = 'it' + (it[3] === false ? ' dis' : '');
			var on = typeof it[2] === 'function' && it[2]();
			d.innerHTML = '<span class="ck">' + (on ? '✓' : '') + '</span><span>' + esc(it[0]) + '</span>' + (Array.isArray(it[1]) ? '<span class="ar">›</span>' : '');
			if (Array.isArray(it[1])) d.onmouseenter = function () { var r = d.getBoundingClientRect(); popup(it[1], r.right - 2, r.top - 4, m); };
			else d.onmouseenter = function () { W.closeMenus(m); };
			if (!Array.isArray(it[1]) && it[3] !== false) d.onclick = function () { W.closeMenus(); it[1](); };
			m.appendChild(d);
		});
		m.dataset.lvl = parent ? Number(parent.dataset.lvl) + 1 : 0;
		document.body.appendChild(m);
		var r = m.getBoundingClientRect();
		m.style.left = Math.max(0, Math.min(x, window.innerWidth - r.width - 4)) + 'px';
		m.style.top = Math.max(0, Math.min(y, window.innerHeight - r.height - 4)) + 'px';
		return m;
	}
	W.closeMenus = function (keep) {
		var lvl = keep ? Number(keep.dataset.lvl) : -1;
		document.querySelectorAll('.mbPop').forEach(function (m) { if (Number(m.dataset.lvl) > lvl) m.remove(); });
		if (!keep) document.querySelectorAll('#mbMenu > span.on').forEach(function (s) { s.classList.remove('on'); });
	};
	document.addEventListener('mousedown', function (e) { if (!e.target.closest('.mbPop') && !e.target.closest('#mbMenu')) W.closeMenus(); });

	/* ---------------------------------- дерево ---------------------------------- */
	var ICON = { other: '#8a939b', sheet: '#d48a2c', edge: '#7b5bd6', fit: '#56606a' };
	function treeHtml(parent, lvl) {
		return MB.kids(S.b, parent).sort(function (a, c) { return a.name.localeCompare(c.name, 'ru', { numeric: true }); }).map(function (g) {
			var kids = MB.kids(S.b, g.id).length, open = !!S.open[g.id];
			return '<div class="tn' + (S.group === g.id ? ' s' : '') + '" data-g="' + g.id + '" style="padding-left:' + (6 + lvl * 16) + 'px" draggable="true"><b class="pm">' + (kids ? (open ? '⊟' : '⊞') : '') + '</b><i class="ic" style="background:' + ICON[g.type] + '" title="' + esc(MB.typeName(g.type)) + '"></i><span>' + esc(g.name) + '</span></div>' +
				(open ? treeHtml(g.id, lvl + 1) : '');
		}).join('');
	}
	W.renderTree = function () {
		var t = $('mbTree');
		t.innerHTML = '<div class="tn root' + (S.group === '' ? ' s' : '') + '" data-g=""><b class="pm"></b><i class="ic" style="background:#5b8def"></i><span>Все материалы</span></div>' + treeHtml('', 1) +
			(S.b.groups.length ? '' : '<p class="mute empty">Групп пока нет. «＋ Группа» — создать первую.</p>');
	};

	/* ---------------------------------- таблица --------------------------------- */
	function visCols() { var hide = S.b.set.cols || {}; return MB.COLS.filter(function (c) { return !hide[c[0]]; }); }
	function fmt(v, c) {
		if (c[2] === 'b') return v ? '✓' : '';
		if (c[2] === 'n') { if (!v && c[0] !== 'stock') return ''; var d = /price|Price/.test(c[0]) ? S.b.set.decPrice : 3, p = Math.pow(10, d); return String(Math.round((v || 0) * p) / p).replace('.', ','); }
		if (c[0] === 'cls') return esc(String(v).split(', ').map(function (x) { return x ? MB.className(S.b, x) : ''; }).join(', '));
		return esc(v === undefined || v === null ? '' : v);
	}
	W.renderTable = function () {
		var cols = visCols(), head = $('mbHead'), w = 0;
		S.list = MB.list(S.b, { group: S.group || null, q: S.q, filters: S.filters, sort: S.sort });
		cols.forEach(function (c) { w += (S.b.set.colW && S.b.set.colW[c[0]]) || c[3]; });
		var grid = cols.map(function (c) { return ((S.b.set.colW && S.b.set.colW[c[0]]) || c[3]) + 'px'; }).join(' ');
		head.style.gridTemplateColumns = grid; head.style.width = w + 'px';
		head.innerHTML = cols.map(function (c) { return '<div class="th" data-c="' + c[0] + '">' + esc(c[1]) + (S.sort.col === c[0] ? (S.sort.dir > 0 ? ' ▲' : ' ▼') : '') + '<i class="rs"></i></div>'; }).join('') +
			(S.showFilters ? cols.map(function (c) { return '<div class="tf"><input data-f="' + c[0] + '" value="' + esc(S.filters[c[0]] || '') + '" placeholder="=" spellcheck="false"></div>'; }).join('') : '');
		var body = $('mbRows');
		body.style.height = (S.list.length * ROW) + 'px'; body.style.width = w + 'px';
		body.dataset.grid = grid;
		W.renderRows();
		$('mbSum').textContent = 'Всего: ' + S.list.length + (S.sel.length > 1 ? '   выделено: ' + S.sel.length : '');
	};
	W.renderRows = function () {
		if (!S.b) return;
		var sc = $('mbScroll'), body = $('mbRows'), cols = visCols(), from = Math.max(0, Math.floor(sc.scrollTop / ROW) - 10), to = Math.min(S.list.length, from + Math.ceil(sc.clientHeight / ROW) + 20), h = '';
		for (var i = from; i < to; i++) {
			var m = S.list[i], cls = 'tr' + (S.sel.indexOf(m.id) >= 0 ? ' s' : '') + (S.cur === m.id ? ' c' : '') + (m.noStock ? ' ns' : '');
			h += '<div class="' + cls + '" data-m="' + m.id + '" style="top:' + (i * ROW) + 'px;grid-template-columns:' + body.dataset.grid + '" draggable="true">' + cols.map(function (c, j) {
				var v = MB.cell(S.b, m, c[0]);
				return '<div class="td' + (c[2] !== 't' ? ' n' : '') + (c[0] === 'stock' && v < 0 ? ' neg' : '') + '">' + (j === 0 ? '<i class="ic" style="background:' + ICON[MB.typeOf(S.b, m)] + '"></i>' : '') + fmt(v, c) + '</div>';
			}).join('') + '</div>';
		}
		body.innerHTML = h;
	};
	/* выделение без перерисовки строк — иначе двойной щелчок попадает в новую строку и не срабатывает */
	function markRows() { document.querySelectorAll('#mbRows .tr').forEach(function (r) { r.classList.toggle('s', S.sel.indexOf(r.dataset.m) >= 0); r.classList.toggle('c', r.dataset.m === S.cur); }); }
	W.renderBottom = function () {
		var m = S.b.mats[S.cur];
		$('mbRel').innerHTML = '<div class="bh"><span>Сопутствующий материал</span><button class="icon" data-a="relAdd" title="Добавить сопутствующий материал"' + (m ? '' : ' disabled') + '>＋</button></div>' +
			'<table class="grid"><thead><tr><th>Артикул</th><th>Сопутствующий материал</th><th>Кол-во</th><th>Ед. изм.</th><th></th></tr></thead><tbody>' +
			(m ? m.rel.map(function (r, i) { var x = S.b.mats[r.mat]; return x ? '<tr><td>' + esc(x.art) + '</td><td>' + esc(x.name) + '</td><td><input type="text" data-rel="' + i + '" value="' + r.qty + '"></td><td>' + esc(x.unit) + '</td><td><button class="icon" data-relx="' + i + '" title="Убрать">✕</button></td></tr>' : ''; }).join('') : '') + '</tbody></table>';
		$('mbOps').innerHTML = '<div class="bh"><span>Операции</span><button class="icon" data-a="opAdd" title="Добавить операцию"' + (m ? '' : ' disabled') + '>＋</button></div>' +
			'<table class="grid"><thead><tr><th>Операция</th><th>Параметр с модели</th><th>Кол-во</th><th>Ед. изм.</th><th>Норма выработки</th><th>Расценка</th><th></th></tr></thead><tbody>' +
			(m ? m.ops.map(function (o, i) {
				return '<tr data-op="' + i + '">' + ['op', 'param', 'qty', 'unit', 'norm', 'rate'].map(function (f) { return '<td><input type="text" data-of="' + f + '" value="' + esc(o[f]) + '"></td>'; }).join('') + '<td><button class="icon" data-opx="' + i + '" title="Убрать">✕</button></td></tr>';
			}).join('') : '') + '</tbody></table>';
	};
	W.render = function () {
		if (!S.b) return;
		W.renderTree(); W.renderTable(); W.renderBottom();
		var g = MB.group(S.b, S.group);
		document.querySelectorAll('[data-need=group]').forEach(function (b) { b.disabled = !g; });
		document.querySelectorAll('[data-need=mat]').forEach(function (b) { b.disabled = !S.cur; });
		$('bMatAdd').disabled = !S.b.groups.length;
	};

	/* --------------------------------- группы ----------------------------------- */
	W.groupWin = async function (g) {
		var isNew = !g, par = isNew ? MB.group(S.b, S.group) : null;
		var v = await U.modal({ title: 'Группа материалов', width: 420,
			body: '<label class="fl">Наименование<input type="text" id="gName" autofocus value="' + esc(g ? g.name : '') + '"></label>' +
				'<label class="fl">Тип материала<select id="gType">' + MB.TYPES.map(function (t) { return '<option value="' + t[0] + '"' + ((g ? g.type : (par ? par.type : 'sheet')) === t[0] ? ' selected' : '') + '>' + esc(t[1]) + '</option>'; }).join('') + '</select></label>' +
				(isNew ? '<p class="mute">Группа будет создана ' + (par ? 'внутри «' + esc(par.name) + '»' : 'на верхнем уровне') + '.</p>' : ''),
			buttons: [{ label: 'Отмена', value: null }, { label: 'OK', primary: true, run: function (m) { var n = m.querySelector('#gName').value.trim(); if (!n) { U.toast('Укажите наименование группы'); return false; } return { name: n, type: m.querySelector('#gType').value }; } }] });
		if (!v) return;
		if (isNew) { var ng = MB.addGroup(S.b, par ? par.id : '', v.name, v.type); if (par) S.open[par.id] = 1; S.group = ng.id; }
		else MB.editGroup(S.b, g.id, v.name, v.type);
		W.changed();
	};
	W.dropGroup = async function () {
		var g = MB.group(S.b, S.group);
		if (!g) return;
		var n = MB.matCount(S.b, g.id, true), sub = MB.subtree(S.b, g.id).length - 1;
		if (!(await U.confirm('Удалить группу', 'Группа «' + g.name + '»' + (sub ? ', вложенные группы (' + sub + ')' : '') + (n ? ' и материалы в них (' + n + ')' : '') + ' будут удалены.', 'Удалить'))) return;
		MB.dropGroup(S.b, g.id);
		S.group = g.parent || ''; S.sel = []; S.cur = '';
		W.changed();
	};

	/* --------------------------- карточка материала ----------------------------- */
	function inp(id, label, val, w, extra) { return '<label class="fl"' + (w ? ' style="width:' + w + 'px"' : '') + '>' + label + '<input type="text" id="' + id + '" value="' + esc(val === undefined || val === null ? '' : String(val).replace('.', typeof val === 'number' ? ',' : '.')) + '"' + (extra || '') + '></label>'; }
	function sel(id, label, opts, val, w) { return '<label class="fl"' + (w ? ' style="width:' + w + 'px"' : '') + '>' + label + '<select id="' + id + '">' + opts.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(val) ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select></label>'; }
	function rng(id, label, val, max) { return '<div class="rg"><span>' + label + '</span><input type="range" id="' + id + 'R" min="0" max="' + max + '" value="' + val + '"><input type="number" id="' + id + '" min="0" max="' + max + '" value="' + val + '"></div>'; }
	W.card = async function (id, tab) {
		var src = id ? S.b.mats[id] : null, grp = src ? src.group : (S.group || (S.b.groups[0] && S.b.groups[0].id));
		if (!grp) { U.toast('Сначала создайте группу материалов'); return; }
		var m = src ? JSON.parse(JSON.stringify(src)) : MB.defMat(grp), b = S.b, L = m.look;
		var type = (MB.group(b, m.group) || {}).type;
		var groups = b.groups.map(function (g) { return [g.id, MB.path(b, g.id).join(' / ')]; }).sort(function (x, y) { return x[1].localeCompare(y[1], 'ru'); });
		var units = b.units.map(function (u) { return [u, u]; }); if (b.units.indexOf(m.unit) < 0) units.unshift([m.unit, m.unit]);
		var curs = [['', '']].concat(b.currencies.map(function (c) { return [c.name, c.name + ' (курс ' + String(c.rate).replace('.', ',') + ')']; }));
		var clsOpts = b.classes.map(function (c) { return [c.code, c.code + ' — ' + c.name]; });
		var tabs = [['gen', 'Общие параметры'], ['add', 'Дополнительные параметры'], ['tex', 'Параметры текстуры'], ['stock', 'Склад'], ['sup', 'Поставщик']];
		var gen = '<div class="row">' + inp('mName', 'Наименование', m.name, 470, ' autofocus') + inp('mArt', 'Артикул', m.art, 200) + '</div>' +
			'<div class="row">' + sel('mGroup', 'Группа', groups, m.group, 470) + '</div>' +
			'<div class="row"><div class="fl" style="width:470px">Классы материала<div class="chips" id="mCls"></div><div class="row tight"><select id="mClsAdd"><option value="">— добавить класс —</option>' + clsOpts.map(function (o) { return '<option value="' + o[0] + '">' + esc(o[1]) + '</option>'; }).join('') + '</select></div></div>' + inp('mK', 'Коэффициент избытка', m.k, 200) + '</div>' +
			'<div class="row"><div class="fl" style="width:470px">Наименование ФНП<div class="chips" id="mFnp"></div><div class="row tight"><input type="text" id="mFnpAdd" placeholder="наименование для выгрузки" data-own-enter><button class="icon" id="mFnpPlus">＋</button></div></div>' +
			'<label class="ck"><input type="checkbox" id="mTex"' + (m.tex ? ' checked' : '') + '> Текстура</label><label class="ck"><input type="checkbox" id="mNo"' + (m.noStock ? ' checked' : '') + '> Нет в наличии</label></div>' +
			'<div class="row">' + sel('mUnit', 'Единица измерения', units, m.unit, 200) + inp('mKs', 'Коэф-т пересчёта расчётной единицы измерения в смете (кв.м, м, шт)', m.kSmeta, 460) + '</div>' +
			'<div class="row">' + inp('mMass', 'Масса ед. изм.', m.mass, 200) + '</div>' +
			'<div class="row">' + inp('mPrice', 'Цена в базовой валюте', m.price, 200) + '</div>' +
			'<div class="row">' + sel('mCur', 'Альтернативная валюта', curs, m.altCur, 200) + inp('mAlt', 'Цена в альт. валюте', m.altPrice, 200) + '</div>' +
			'<label class="fl">Примечание<textarea id="mNote" rows="2">' + esc(m.note) + '</textarea></label>' +
			'<div class="row"><div class="photoBox"><div class="swatch" id="mSw" title="Фото материала или фурнитуры: щёлкните, чтобы выбрать картинку (или вставьте из буфера — Ctrl+V)"></div><div class="row tight"><button id="mPhoto">Фото…</button><button id="mPhotoX" class="icon" title="Убрать фото">✕</button></div></div><fieldset><legend>Способ округления количества</legend>' + MB.ROUND.map(function (r) { return '<label class="rd"><input type="radio" name="mRound" value="' + r[0] + '"' + (m.round === r[0] ? ' checked' : '') + '> ' + esc(r[1]) + '</label>'; }).join('') +
			'<input type="text" id="mRoundTo" value="' + m.roundTo + '" style="width:70px"></fieldset></div>' +
			'<fieldset><legend>Проверять уникальность материала</legend><label class="rd"><input type="radio" name="mUni" value=""' + (!m.unique ? ' checked' : '') + '> как в параметрах базы</label>' + MB.UNIQUE.map(function (u) { return '<label class="rd"><input type="radio" name="mUni" value="' + u[0] + '"' + (m.unique === u[0] ? ' checked' : '') + '> ' + esc(u[1]) + '</label>'; }).join('') + '</fieldset>' +
			'<div class="row">' + inp('mSync', 'Идентификатор для синхронизации', m.sync, 470, b.set.syncEdit ? '' : ' readonly') + '</div>';
		var add = '<fieldset><legend>Параметры листового и погонного материалов</legend><div class="row">' + inp('mTh', 'Толщина', m.th, 110) + inp('mL', 'Макс. длина', m.maxL, 110) + inp('mW', 'Макс. ширина', m.maxW, 110) + inp('mSign', 'Обозначение', m.sign, 200) + '</div>' +
			'<div class="row">' + inp('mKc', 'Коэф-т избытка с учётом раскроя', m.kCut, 230) + sel('mKind', 'Тип', MB.KINDS, m.kind, 200) + inp('mOver', 'Свес', m.overhang, 110) + '</div></fieldset>' +
			(type && type !== 'sheet' ? '<p class="mute">Тип группы — «' + esc(MB.typeName(type)) + '»: размеры листа нужны только листовым и погонным материалам.</p>' : '');
		var vray = '<div class="vr">' + MB.VRAY.map(function (f) { var v = (m.vray || {})[f[0]]; if (v === undefined) v = f[3];
			return '<label class="fl">' + f[1] + (f[2] === 'c' ? '<input type="color" data-vr="' + f[0] + '" value="' + esc(v) + '">' : (f[2] === 'b' ? '<input type="checkbox" data-vr="' + f[0] + '"' + (v ? ' checked' : '') + '>' : '<input type="text" data-vr="' + f[0] + '" value="' + String(v).replace('.', ',') + '">')) + '</label>'; }).join('') +
			'</div><p class="mute">Параметры V-Ray хранятся в карточке материала, как в БАЗИСе; сама программа по ним не рисует.</p>';
		var tex = '<div class="tabs sub"><button data-st="set" class="on">Настройки</button><button data-st="vray">V-Ray</button></div><div data-sp="vray" hidden>' + vray + '</div><div data-sp="set"><div class="row"><div class="ball" id="mBall"></div><fieldset style="flex:1"><legend>Параметры наложения</legend>' +
			'<div class="row"><label class="rd"><input type="radio" name="mLook" value="color"' + (L.mode === 'color' ? ' checked' : '') + '> Цвет</label><input type="color" id="mColor" value="' + esc(L.color) + '"></div>' +
			'<div class="row"><label class="rd"><input type="radio" name="mLook" value="tex"' + (L.mode === 'tex' ? ' checked' : '') + '> Текстура</label><input type="text" id="mTexF" value="' + esc(L.tex) + '" style="width:380px" placeholder="файл картинки"><button id="mTexPick">…</button><button id="mTexX" class="icon">✕</button></div>' +
			'<div class="row"><span>Смещение</span>' + inp('mDx', 'X', L.dx, 90) + inp('mDy', 'Y', L.dy, 90) + '<span>Шаг</span>' + inp('mSx', 'X', L.sx, 90) + inp('mSy', 'Y', L.sy, 90) + '</div>' +
			rng('mTr', 'Прозрачность', L.transp, 100) + rng('mMi', 'Зеркальность', L.mirror, 100) + rng('mSh', 'Резкость блика', L.sharp, 128) + rng('mBr', 'Яркость блика', L.bright, 100) + rng('mAn', 'Угол поворота', L.angle, 360) +
			'<div class="row" style="justify-content:flex-end"><button id="mStretch">Растянуть</button><button id="mMirrorB">Зеркально</button></div></fieldset></div></div>';
		var stockTab = function () {
			if (!m.id) return '<p class="mute">Склад появится, когда материал будет записан.</p>';
			var mv = MB.moves(b, m.id), oc = MB.offcuts(b, m.id);
			return '<p><b>Остаток: ' + String(MB.balance(b, m.id)).replace('.', ',') + ' ' + esc(m.unit) + '</b></p><table class="grid"><thead><tr><th>Дата</th><th>Документ</th><th>Поставщик / проект</th><th>Кол-во</th><th>Цена</th></tr></thead><tbody>' +
				(mv.length ? mv.map(function (x) { var s = MB.supplier(b, x.doc.sup); return '<tr class="' + (x.doc.off ? 'off' : '') + '"><td>' + esc(ruDate(x.doc.date)) + '</td><td>' + docTitle(x.doc) + '</td><td>' + esc(s ? s.name : x.doc.project) + '</td><td class="r">' + String(x.qty).replace('.', ',') + '</td><td class="r">' + (x.price ? String(x.price).replace('.', ',') : '') + '</td></tr>'; }).join('') : '<tr><td colspan="5" class="mute">Движений нет</td></tr>') +
				'</tbody></table><h4>Деловые обрезки</h4><table class="grid"><thead><tr><th>Длина</th><th>Ширина</th><th>Шт</th><th>Откуда</th></tr></thead><tbody>' +
				(oc.length ? oc.map(function (o) { return '<tr><td class="r">' + o.L + '</td><td class="r">' + o.W + '</td><td class="r">' + o.n + '</td><td>' + esc(o.project || 'вручную') + '</td></tr>'; }).join('') : '<tr><td colspan="4" class="mute">Обрезков нет</td></tr>') + '</tbody></table>' +
				'<div class="row"><input type="text" id="ocL" placeholder="длина" style="width:80px"><input type="text" id="ocW" placeholder="ширина" style="width:80px"><input type="text" id="ocN" value="1" style="width:50px"><button id="ocAdd">Добавить обрезок</button></div>';
		};
		var supTab = '<div class="row">' + sel('mSup', 'Поставщик', [['', '—']].concat(b.suppliers.map(function (s) { return [s.id, s.name]; })), m.sup, 300) + '<button id="mSupNew" style="align-self:flex-end">Новый поставщик…</button></div>' +
			'<div class="row">' + inp('mSupArt', 'Артикул у поставщика', m.supArt, 300) + '</div><div class="row">' + inp('mUrl', 'Ссылка на товар', m.url, 560) + '<button id="mUrlGo" style="align-self:flex-end" title="Открыть ссылку в браузере">Открыть</button></div>' +
			(window.STHShop ? '<div class="row"><button id="mUrlFill" class="primary" title="Цена, наличие, артикул, название, размеры, поставщик — со страницы товара">Заполнить по ссылке</button><button id="mShopLogin" title="Окно сайта магазина: войдите один раз — дальше цены берутся под вашим входом">Войти на сайт</button></div>' : '');          // STHGroup
		var body = '<div class="tabs">' + tabs.map(function (t) { return '<button data-t="' + t[0] + '"' + ((tab || 'gen') === t[0] ? ' class="on"' : '') + '>' + t[1] + '</button>'; }).join('') + '</div>' +
			'<div class="pg" data-p="gen">' + gen + '</div><div class="pg" data-p="add">' + add + '</div><div class="pg" data-p="tex">' + tex + '</div><div class="pg" data-p="stock">' + stockTab() + '</div><div class="pg" data-p="sup">' + supTab + '</div>';
		var res = await U.modal({ title: 'Материал: ' + (m.name || 'новый'), width: 820, cls: 'mbCard', body: body,
			buttons: [{ label: 'Отмена', value: null }, { label: 'OK', primary: true, run: function (el) { return collect(el); } }],
			onOpen: function (el) {
				var show = function (t) { el.querySelectorAll('.tabs:not(.sub) button').forEach(function (x) { x.classList.toggle('on', x.dataset.t === t); }); el.querySelectorAll('.pg').forEach(function (p) { p.hidden = p.dataset.p !== t; }); };
				show(tab || 'gen');
				el.querySelector('.tabs').onclick = function (e) { var t = e.target.closest('button'); if (t) show(t.dataset.t); };
				el.querySelector('.tabs.sub').onclick = function (e) { var t = e.target.closest('button'); if (!t) return; el.querySelectorAll('.tabs.sub button').forEach(function (x) { x.classList.toggle('on', x === t); }); el.querySelectorAll('[data-sp]').forEach(function (x) { x.hidden = x.dataset.sp !== t.dataset.st; }); };
				var setPhoto = function (d) { m.photo = d || ''; preview(); };
				var pickPhoto = async function () { var p = await U.pick({ kind: 'open', title: 'Фото материала', filters: [{ name: 'Картинки', ext: ['jpg', 'jpeg', 'png', 'bmp', 'webp'] }] }); if (!p) return; try { setPhoto(await W.photoOf(new Blob([await U.api.readBytes(p)]))); } catch (er) { U.toast('Картинку не удалось прочитать: ' + er.message, { bad: true }); } };
				el.querySelector('#mPhoto').onclick = pickPhoto; el.querySelector('#mSw').onclick = pickPhoto;
				el.querySelector('#mPhotoX').onclick = function () { setPhoto(''); };
				el.addEventListener('paste', async function (e) { var it = (e.clipboardData && e.clipboardData.items) || [], f = null; for (var i = 0; i < it.length; i++) if (!f && it[i].kind === 'file' && /^image\//.test(it[i].type)) f = it[i].getAsFile(); if (!f) return; e.preventDefault(); try { setPhoto(await W.photoOf(f)); } catch (er) { U.error(er); } });
				if (window.STHShop) { el.querySelector('#mUrlFill').onclick = function () { window.STHShop.fillCard(el, b); }; el.querySelector('#mShopLogin').onclick = function () { window.STHShop.login(el.querySelector('#mUrl').value); }; }          // STHGroup
				el.querySelector('#mUrlGo').onclick = function () { var u = el.querySelector('#mUrl').value.trim(); if (!u) { U.toast('Ссылки нет'); return; } if (!/^https?:\/\//i.test(u)) u = 'https://' + u; U.api.openUrl(u).catch(U.error); };
				var chips = function () {
					el.querySelector('#mCls').innerHTML = m.cls.map(function (c, i) { return '<span class="chip">' + esc(c + ' — ' + MB.className(b, c)) + '<b data-ci="' + i + '">✕</b></span>'; }).join('') || '<span class="mute">нет</span>';
					el.querySelector('#mFnp').innerHTML = m.fnp.map(function (c, i) { return '<span class="chip">' + esc(c) + '<b data-fi="' + i + '">✕</b></span>'; }).join('') || '<span class="mute">нет</span>';
				};
				chips();
				el.querySelector('#mClsAdd').onchange = function (e) { if (e.target.value && m.cls.indexOf(e.target.value) < 0) m.cls.push(e.target.value); e.target.value = ''; chips(); };
				el.querySelector('#mFnpPlus').onclick = function () { var v = el.querySelector('#mFnpAdd').value.trim(); if (v) { m.fnp.push(v); el.querySelector('#mFnpAdd').value = ''; chips(); } };
				el.addEventListener('click', function (e) {
					if (e.target.dataset.ci !== undefined) { m.cls.splice(Number(e.target.dataset.ci), 1); chips(); }
					if (e.target.dataset.fi !== undefined) { m.fnp.splice(Number(e.target.dataset.fi), 1); chips(); }
				});
				['mTr', 'mMi', 'mSh', 'mBr', 'mAn'].forEach(function (k) { var r = el.querySelector('#' + k + 'R'), n = el.querySelector('#' + k); r.oninput = function () { n.value = r.value; preview(); }; n.oninput = function () { r.value = n.value; preview(); }; });
				var preview = function () {
					var mode = el.querySelector('[name=mLook]:checked').value, col = el.querySelector('#mColor').value, tf = el.querySelector('#mTexF').value.trim();
					var bg = mode === 'tex' && tf ? 'url("' + U.api.fileUrl(tf) + '") center/cover, ' + col : col;
					el.querySelector('#mSw').style.background = m.photo ? 'url("' + m.photo + '") center/contain no-repeat, #fff' : bg;
					var ball = el.querySelector('#mBall'), tr = Number(el.querySelector('#mTr').value) / 100, sh = Number(el.querySelector('#mBr').value) / 100;
					ball.style.background = 'radial-gradient(circle at 35% 30%, rgba(255,255,255,' + (0.35 + sh * 0.6) + ') 0, rgba(255,255,255,0) 32%), ' + bg;
					ball.style.opacity = String(1 - tr * 0.85);
				};
				el.querySelectorAll('[name=mLook], #mColor, #mTexF').forEach(function (x) { x.oninput = preview; x.onchange = preview; });
				el.querySelector('#mTexPick').onclick = async function () { var p = await U.pick({ kind: 'open', title: 'Картинка текстуры', filters: [{ name: 'Картинки', ext: ['jpg', 'jpeg', 'png', 'bmp', 'webp'] }] }); if (p) { el.querySelector('#mTexF').value = p; el.querySelector('[name=mLook][value=tex]').checked = true; el.querySelector('#mTex').checked = true; preview(); } };
				el.querySelector('#mTexX').onclick = function () { el.querySelector('#mTexF').value = ''; el.querySelector('[name=mLook][value=color]').checked = true; preview(); };
				el.querySelector('#mStretch').onclick = function () { el.querySelector('#mSx').value = el.querySelector('#mL').value || 1000; el.querySelector('#mSy').value = el.querySelector('#mW').value || 1000; el.querySelector('#mDx').value = 0; el.querySelector('#mDy').value = 0; };
				el.querySelector('#mMirrorB').onclick = function () { var a = el.querySelector('#mAn'); a.value = (Number(a.value) + 180) % 360; el.querySelector('#mAnR').value = a.value; };
				el.querySelector('#mSupNew').onclick = async function () { var s = await W.supplierWin(null); if (s) { var o = document.createElement('option'); o.value = s.id; o.textContent = s.name; el.querySelector('#mSup').appendChild(o); el.querySelector('#mSup').value = s.id; } };
				var ocAdd = el.querySelector('#ocAdd');
				if (ocAdd) ocAdd.onclick = function () { if (MB.addOffcut(b, m.id, el.querySelector('#ocL').value, el.querySelector('#ocW').value, el.querySelector('#ocN').value)) { W.changed(); el.querySelector('[data-p=stock]').innerHTML = stockTab(); } else U.toast('Укажите длину и ширину обрезка в миллиметрах'); };
				preview();
			} });
		function collect(el) {
			var v = function (id) { return el.querySelector('#' + id).value; }, r = m;
			r.name = v('mName'); r.art = v('mArt'); r.group = v('mGroup'); r.k = MB.num(v('mK'), 1); r.tex = el.querySelector('#mTex').checked ? 1 : 0; r.noStock = el.querySelector('#mNo').checked ? 1 : 0;
			r.unit = v('mUnit'); r.kSmeta = MB.num(v('mKs'), 1); r.mass = MB.num(v('mMass')); r.price = MB.num(v('mPrice')); r.altCur = v('mCur'); r.altPrice = MB.num(v('mAlt')); r.note = v('mNote');
			r.round = Number(el.querySelector('[name=mRound]:checked').value); r.roundTo = MB.num(v('mRoundTo'), 1); r.unique = el.querySelector('[name=mUni]:checked').value; r.sync = v('mSync').trim();
			r.th = MB.num(v('mTh')); r.maxL = MB.num(v('mL')); r.maxW = MB.num(v('mW')); r.sign = v('mSign'); r.kCut = MB.num(v('mKc'), 1); r.kind = v('mKind'); r.overhang = MB.num(v('mOver'));
			r.look = { mode: el.querySelector('[name=mLook]:checked').value, color: v('mColor'), tex: v('mTexF').trim(), dx: MB.num(v('mDx')), dy: MB.num(v('mDy')), sx: MB.num(v('mSx'), 1000), sy: MB.num(v('mSy'), 1000),
				transp: MB.num(v('mTr')), mirror: MB.num(v('mMi')), sharp: MB.num(v('mSh')), bright: MB.num(v('mBr')), angle: MB.num(v('mAn')) };
			r.sup = v('mSup'); r.supArt = v('mSupArt').trim(); r.url = v('mUrl').trim();
			r.vray = {}; el.querySelectorAll('[data-vr]').forEach(function (x) { r.vray[x.dataset.vr] = x.type === 'checkbox' ? (x.checked ? 1 : 0) : (x.type === 'color' ? x.value : MB.num(x.value)); });
			var res = MB.saveMat(b, r);
			if (res.errors) { U.toast(res.errors.join('. '), { bad: true }); return false; }
			return res.mat;
		}
		if (!res) return;
		S.cur = res.id; S.sel = [res.id];
		if (!src) { S.group = res.group; }
		W.changed();
		W.scrollTo(res.id);
	};
	/* фото: уменьшается до 400 px по большей стороне и хранится в базе (JPEG) — видно на любом компьютере и в смете */
	W.photoOf = async function (blob) {
		var bmp = await createImageBitmap(blob), k = Math.min(1, 400 / Math.max(bmp.width, bmp.height)), c = document.createElement('canvas');
		c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k));
		var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(bmp, 0, 0, c.width, c.height);
		return c.toDataURL('image/jpeg', 0.85);
	};
	W.scrollTo = function (id) { var i = -1; S.list.forEach(function (m, k) { if (m.id === id) i = k; }); if (i >= 0) { var sc = $('mbScroll'); if (i * ROW < sc.scrollTop || i * ROW > sc.scrollTop + sc.clientHeight - 2 * ROW) sc.scrollTop = Math.max(0, i * ROW - sc.clientHeight / 2); W.renderRows(); } };
	W.dropMats = async function () {
		var ids = S.sel.length ? S.sel.slice() : (S.cur ? [S.cur] : []);
		if (!ids.length) return;
		if (!(await U.confirm('Удалить материал', ids.length > 1 ? 'Удалить выделенные материалы (' + ids.length + ')?' : 'Удалить «' + S.b.mats[ids[0]].name + '»?', 'Удалить'))) return;
		ids.forEach(function (id) { MB.dropMat(S.b, id); });
		S.sel = []; S.cur = '';
		W.changed();
	};
	W.moveTo = async function () {
		var ids = S.sel.length ? S.sel.slice() : (S.cur ? [S.cur] : []);
		if (!ids.length) return;
		var g = await W.pickGroup('Переместить в группу');
		if (g) { MB.moveMats(S.b, ids, g); W.changed(); }
	};
	W.pickGroup = function (title) {
		var groups = S.b.groups.map(function (g) { return [g.id, MB.path(S.b, g.id).join(' / ')]; }).sort(function (x, y) { return x[1].localeCompare(y[1], 'ru'); });
		return U.modal({ title: title, width: 460, body: '<select id="pg" size="14" style="width:100%">' + groups.map(function (g) { return '<option value="' + g[0] + '">' + esc(g[1]) + '</option>'; }).join('') + '</select>',
			buttons: [{ label: 'Отмена', value: null }, { label: 'OK', primary: true, run: function (m) { return m.querySelector('#pg').value || false; } }] });
	};
	/* выбрать материал из базы (сопутствующий, строка документа) */
	W.pickMat = function (title) {
		return U.modal({ title: title, width: 640, body: '<input type="search" id="pmQ" placeholder="артикул или наименование" autofocus data-own-enter style="width:100%"><select id="pm" size="14" style="width:100%;margin-top:6px"></select>',
			buttons: [{ label: 'Отмена', value: null }, { label: 'Выбрать', primary: true, run: function (m) { return m.querySelector('#pm').value || false; } }],
			onOpen: function (m) {
				var f = function () { m.querySelector('#pm').innerHTML = MB.find(S.b, m.querySelector('#pmQ').value).slice(0, 300).map(function (x) { return '<option value="' + x.id + '">' + esc((x.art ? x.art + ' — ' : '') + x.name) + '</option>'; }).join(''); };
				m.querySelector('#pmQ').oninput = f; f();
				m.querySelector('#pm').ondblclick = function () { m.querySelector('.foot .primary').click(); };
			} });
	};

	/* ------------------------------- справочники -------------------------------- */
	/* STHGroup: в оболочке Electron окно prompt() не открывается (всегда «отмена») — своё окно с полем */
	function askName(title, v) {
		return U.modal({ title: title, width: 420, body: '<label class="fl">Название<input type="text" id="anV" value="' + esc(v || '') + '" autofocus></label>',
			buttons: [{ label: 'Отмена', value: null }, { label: 'OK', primary: true, run: function (m) { var x = m.querySelector('#anV').value.trim(); if (!x) { U.toast('Впишите название'); return false; } return x; } }],
			onOpen: function (m) { var i = m.querySelector('#anV'); setTimeout(function () { i.focus(); i.select(); }, 30); } });
	}
	W.classes = function () {
		var b = S.b, cg = b.classGroups[0] ? b.classGroups[0].code : '';
		function draw(m) {
			m.querySelector('#cgList').innerHTML = b.classGroups.map(function (g) { return '<div class="tn' + (g.code === cg ? ' s' : '') + '" data-cg="' + g.code + '">' + esc(g.name + ' (' + g.code + ')') + '</div>'; }).join('') || '<p class="mute">Групп классов нет</p>';
			m.querySelector('#cList').innerHTML = '<table class="grid"><thead><tr><th>Код</th><th>Наименование</th><th></th></tr></thead><tbody>' + b.classes.filter(function (c) { return c.group === cg || (!cg && !c.group); }).map(function (c) {
				return '<tr><td>' + c.code + '</td><td><input type="text" data-cn="' + c.code + '" value="' + esc(c.name) + '"></td><td><button class="icon" data-cx="' + c.code + '">✕</button></td></tr>';
			}).join('') + '</tbody></table>';
		}
		return U.modal({ title: 'Классы материалов', width: 760, cls: 'mbCls',
			body: '<div class="two"><div><div class="bh"><span>Группа классов</span><button class="icon" id="cgAdd" title="Добавить группу классов">＋</button><button class="icon" id="cgRen" title="Переименовать">✎</button><button class="icon" id="cgDel" title="Удалить группу классов">✕</button></div><div id="cgList" class="list"></div></div>' +
				'<div><div class="bh"><span>Классы</span><button class="icon" id="cAdd" title="Добавить класс">＋</button></div><div id="cList" class="list"></div></div></div>',
			buttons: [{ label: 'Готово', primary: true }],
			onOpen: function (m) {
				draw(m);
				m.addEventListener('click', async function (e) {
					var t = e.target;
					if (t.dataset.cg) { cg = t.dataset.cg; draw(m); }
					else if (t.id === 'cgAdd') { var n = await askName('Новая группа классов', 'Поставщики'); if (n) { cg = MB.addClassGroup(b, n).code; W.changed(); draw(m); } }
					else if (t.id === 'cgRen') { var g = MB.classGroup(b, cg); if (g) { var n2 = await askName('Переименовать группу классов', g.name); if (n2) { g.name = n2.trim() || g.name; W.changed(); draw(m); } } }
					else if (t.id === 'cgDel' && cg) { if (await U.confirm('Удалить группу классов', 'Группа и её классы будут удалены, у материалов эти классы снимутся.', 'Удалить')) { MB.dropClassGroup(b, cg); cg = b.classGroups[0] ? b.classGroups[0].code : ''; W.changed(); draw(m); } }
					else if (t.id === 'cAdd') { MB.addClass(b, 'Новый класс', cg); W.changed(); draw(m); }
					else if (t.dataset.cx) { MB.dropClass(b, t.dataset.cx); W.changed(); draw(m); }
				});
				m.addEventListener('change', function (e) { if (e.target.dataset.cn) { MB.renameClass(b, e.target.dataset.cn, e.target.value); W.changed(); } });
			} });
	};
	W.units = function () {
		return U.modal({ title: 'Единицы измерения', width: 380, body: '<p class="mute">По одной в строке.</p><textarea id="uL" rows="14" style="width:100%">' + esc(S.b.units.join('\n')) + '</textarea>',
			buttons: [{ label: 'Отмена', value: null }, { label: 'OK', primary: true, run: function (m) { MB.setUnits(S.b, m.querySelector('#uL').value.split(/\r?\n/)); W.changed(); return true; } }] });
	};
	W.currencies = function () {
		var rows = function () { return S.b.currencies.concat([{ name: '', rate: '' }]).map(function (c, i) { return '<tr><td><input type="text" data-cu="' + i + '" value="' + esc(c.name) + '" placeholder="USD"></td><td><input type="text" data-cr="' + i + '" value="' + String(c.rate).replace('.', ',') + '" placeholder="курс"></td></tr>'; }).join(''); };
		return U.modal({ title: 'Альтернативные валюты', width: 420, body: '<p class="mute">Курс — сколько рублей за единицу валюты. Пустое название — валюта удаляется.</p><table class="grid"><thead><tr><th>Валюта</th><th>Курс, ₽</th></tr></thead><tbody id="cuT">' + rows() + '</tbody></table>',
			buttons: [{ label: 'Отмена', value: null }, { label: 'OK', primary: true, run: function (m) {
				var list = []; m.querySelectorAll('[data-cu]').forEach(function (x) { list.push({ name: x.value, rate: m.querySelector('[data-cr="' + x.dataset.cu + '"]').value }); });
				MB.setCurrencies(S.b, list); W.changed(); return true; } }],
			onOpen: function (m) { m.addEventListener('input', function (e) { if (e.target.dataset.cu === String(S.b.currencies.length) && e.target.value) { var tr = document.createElement('tr'); var i = m.querySelectorAll('[data-cu]').length; tr.innerHTML = '<td><input type="text" data-cu="' + i + '"></td><td><input type="text" data-cr="' + i + '"></td>'; m.querySelector('#cuT').appendChild(tr); } }); } });
	};
	W.supplierWin = async function (s) {
		var v = await U.modal({ title: s ? 'Поставщик' : 'Новый поставщик', width: 480, body: ['name:Название', 'url:Сайт', 'phone:Телефон', 'email:Почта', 'note:Примечание'].map(function (f) { var p = f.split(':'); return '<label class="fl">' + p[1] + '<input type="text" id="s_' + p[0] + '" value="' + esc(s ? s[p[0]] : '') + '"' + (p[0] === 'name' ? ' autofocus' : '') + '></label>'; }).join(''),
			buttons: [{ label: 'Отмена', value: null }, { label: 'OK', primary: true, run: function (m) { var o = { id: s ? s.id : '' }; ['name', 'url', 'phone', 'email', 'note'].forEach(function (f) { o[f] = m.querySelector('#s_' + f).value; }); if (!o.name.trim()) { U.toast('Укажите название'); return false; } return o; } }] });
		if (!v) return null;
		var r = MB.saveSupplier(S.b, v);
		W.changed();
		return r;
	};
	W.suppliers = function () {
		var draw = function (m) { m.querySelector('#spT').innerHTML = S.b.suppliers.map(function (s) { return '<tr><td>' + esc(s.name) + '</td><td>' + esc(s.url) + '</td><td>' + esc(s.phone) + '</td><td><button class="icon" data-se="' + s.id + '">✎</button><button class="icon" data-sx="' + s.id + '">✕</button></td></tr>'; }).join('') || '<tr><td colspan="4" class="mute">Поставщиков нет</td></tr>'; };
		return U.modal({ title: 'Поставщики', width: 640, body: '<table class="grid"><thead><tr><th>Название</th><th>Сайт</th><th>Телефон</th><th></th></tr></thead><tbody id="spT"></tbody></table>',
			buttons: [{ label: 'Добавить…', left: true, keep: true, run: async function (m) { await W.supplierWin(null); draw(m); } }, { label: 'Готово', primary: true }],
			onOpen: function (m) {
				draw(m);
				m.addEventListener('click', async function (e) {
					if (e.target.dataset.se) { await W.supplierWin(MB.supplier(S.b, e.target.dataset.se)); draw(m); }
					if (e.target.dataset.sx && await U.confirm('Удалить поставщика', 'У материалов этого поставщика поле «Поставщик» станет пустым.', 'Удалить')) { MB.dropSupplier(S.b, e.target.dataset.sx); W.changed(); draw(m); }
				});
			} });
	};
	W.params = function () {
		var s = S.b.set;
		return U.modal({ title: 'Параметры', width: 520,
			body: '<fieldset><legend>Отображаемое количество знаков после запятой</legend><div class="row">' + inp('pP', 'Цены', s.decPrice, 120) + inp('pQ', 'Количества', s.decQty, 120) + '</div></fieldset>' +
				'<fieldset><legend>Отображать норму выработки</legend><label class="rd"><input type="radio" name="pN" value="hourPerUnit"' + (s.norm === 'hourPerUnit' ? ' checked' : '') + '> Час / ед. изм. объема</label><label class="rd"><input type="radio" name="pN" value="unitPerHour"' + (s.norm !== 'hourPerUnit' ? ' checked' : '') + '> Ед. изм. объема / час</label></fieldset>' +
				'<fieldset><legend>Проверять уникальность материала</legend>' + MB.UNIQUE.map(function (u) { return '<label class="rd"><input type="radio" name="pU" value="' + u[0] + '"' + (s.unique === u[0] ? ' checked' : '') + '> ' + u[1] + '</label>'; }).join('') + '</fieldset>' +
				'<label class="ck"><input type="checkbox" id="pS"' + (s.syncEdit ? ' checked' : '') + '> Разрешить изменять идентификатор для синхронизации</label><label class="ck"><input type="checkbox" id="pD"' + (s.normDefault ? ' checked' : '') + '> По умолчанию использовать норму выработки операции</label>' +
				'<fieldset><legend>Деловые обрезки после раскроя — не меньше, мм</legend><div class="row">' + inp('pOL', 'Длина', s.offMin[0], 120) + inp('pOW', 'Ширина', s.offMin[1], 120) + '</div></fieldset>',
			buttons: [{ label: 'Отмена', value: null }, { label: 'OK', primary: true, run: function (m) {
				var v = function (id) { return m.querySelector('#' + id).value; };
				s.decPrice = Math.max(0, Math.min(6, Math.round(MB.num(v('pP'), 2)))); s.decQty = Math.max(0, Math.min(8, Math.round(MB.num(v('pQ'), 6))));
				s.norm = m.querySelector('[name=pN]:checked').value; s.unique = m.querySelector('[name=pU]:checked').value; s.syncEdit = m.querySelector('#pS').checked ? 1 : 0; s.normDefault = m.querySelector('#pD').checked ? 1 : 0;
				s.offMin = [Math.max(1, MB.num(v('pOL'), 300)), Math.max(1, MB.num(v('pOW'), 200))];
				W.changed(); return true; } }] });
	};
	W.colsWin = function () {
		var hide = S.b.set.cols || {};
		return U.modal({ title: 'Столбцы таблицы', width: 380, body: MB.COLS.map(function (c) { return '<label class="ck"><input type="checkbox" data-col="' + c[0] + '"' + (hide[c[0]] ? '' : ' checked') + (c[0] === 'name' ? ' disabled' : '') + '> ' + esc(c[1]) + '</label>'; }).join(''),
			buttons: [{ label: 'Отмена', value: null }, { label: 'OK', primary: true, run: function (m) { var h = {}; m.querySelectorAll('[data-col]').forEach(function (x) { if (!x.checked) h[x.dataset.col] = 1; }); S.b.set.cols = h; W.changed(); return true; } }] });
	};

	/* ------------------------------- инструменты -------------------------------- */
	W.prices = async function (markup) {
		var scope = S.sel.length > 1 ? 'sel' : 'group';
		var v = await U.modal({ title: markup ? 'Установить наценку' : 'Обновление цен', width: 480,
			body: '<fieldset><legend>Каким материалам</legend><label class="rd"><input type="radio" name="sc" value="sel"' + (scope === 'sel' ? ' checked' : '') + (S.sel.length ? '' : ' disabled') + '> выделенным (' + S.sel.length + ')</label><label class="rd"><input type="radio" name="sc" value="group"' + (scope === 'group' ? ' checked' : '') + '> всем в группе «' + esc(S.group ? MB.group(S.b, S.group).name : 'Все материалы') + '» (' + S.list.length + ')</label></fieldset>' +
				(markup ? inp('pPct', 'Наценка, %', 10, 160) : '<label class="rd"><input type="radio" name="how" value="pct" checked> изменить на %</label>' + inp('pPct', '', 5, 160) + '<label class="rd"><input type="radio" name="how" value="set"> установить цену</label>' + inp('pSet', '', '', 160)),
			buttons: [{ label: 'Отмена', value: null }, { label: 'Применить', primary: true, run: function (m) {
				var how = markup ? 'pct' : m.querySelector('[name=how]:checked').value;
				return { ids: m.querySelector('[name=sc]:checked').value === 'sel' ? S.sel.slice() : S.list.map(function (x) { return x.id; }), pct: how === 'pct' ? m.querySelector('#pPct').value : 0, set: how === 'set' ? m.querySelector('#pSet').value : '' }; } }] });
		if (!v) return;
		var n = MB.updatePrices(S.b, v.ids, { pct: v.pct, set: v.set });
		U.toast('Цены изменены: ' + n);
		W.changed();
	};
	W.dups = function () {
		var d = MB.duplicates(S.b);
		return U.modal({ title: 'Поиск дубликатов в базе', width: 700,
			body: d.length ? '<p class="mute">По правилу уникальности: «' + esc((MB.UNIQUE.filter(function (u) { return u[0] === S.b.set.unique; })[0] || [0, ''])[1]) + '». Щелчок — показать материал.</p>' + d.map(function (g) { return '<div class="dupG">' + g.map(function (m) { return '<div class="dup" data-m="' + m.id + '">' + esc((m.art ? m.art + ' — ' : '') + m.name + ' · ' + MB.path(S.b, m.group).join(' / ')) + '</div>'; }).join('') + '</div>'; }).join('') : '<p>Дубликатов нет.</p>',
			buttons: [{ label: 'Закрыть', primary: true }],
			onOpen: function (m) { m.addEventListener('click', function (e) { var x = e.target.closest('[data-m]'); if (x) W.show(x.dataset.m); }); } });
	};
	W.show = function (id) { var m = S.b.mats[id]; if (!m) return; S.group = m.group; var g = MB.group(S.b, m.group); while (g) { S.open[g.id] = 1; g = MB.group(S.b, g.parent); } S.cur = id; S.sel = [id]; S.q = ''; S.filters = {}; W.render(); W.scrollTo(id); };
	W.ids = function () { return S.sel.length ? S.sel.slice() : (S.cur ? [S.cur] : []); };
	/* одно поле — всем выделенным (или всем в группе) */
	W.bulk = async function () {
		var ids = W.ids();
		if (!ids.length) { U.toast('Выделите материалы в таблице (Ctrl, Shift)'); return; }
		var b = S.b, sups = [['', '—']].concat(b.suppliers.map(function (x) { return [x.id, x.name]; })), cls = b.classes.map(function (c) { return [c.code, c.code + ' — ' + c.name]; });
		var v = await U.modal({ title: 'Групповое редактирование параметров', width: 520,
			body: '<p>Выделено материалов: <b>' + ids.length + '</b>. Выбранный параметр получит одно значение у всех.</p>' + sel('bkF', 'Параметр', MB.BULK.map(function (f) { return [f[0], f[1]]; }), 'price', 300) + '<div id="bkV"></div>',
			buttons: [{ label: 'Отмена', value: null }, { label: 'Применить', primary: true, run: function (m) { var f = m.querySelector('#bkF').value, x = m.querySelector('#bkVal'); return { f: f, v: x.type === 'checkbox' ? x.checked : x.value }; } }],
			onOpen: function (m) {
				var draw = function () {
					var f = m.querySelector('#bkF').value, t = (MB.BULK.filter(function (x) { return x[0] === f; })[0] || [])[2];
					m.querySelector('#bkV').innerHTML = t === 'b' ? '<label class="ck"><input type="checkbox" id="bkVal" checked> да</label>' : (t === 's' ? '<label class="fl">Значение<select id="bkVal">' + sups.map(function (o) { return '<option value="' + o[0] + '">' + esc(o[1]) + '</option>'; }).join('') + '</select></label>' :
						(t === 'c' ? '<label class="fl">Класс<select id="bkVal">' + cls.map(function (o) { return '<option value="' + o[0] + '">' + esc(o[1]) + '</option>'; }).join('') + '</select></label>' : '<label class="fl">Значение<input type="text" id="bkVal" autofocus></label>'));
				};
				m.querySelector('#bkF').onchange = draw; draw();
			} });
		if (!v) return;
		var n = MB.bulkSet(S.b, ids, v.f, v.v);
		U.toast('Изменено материалов: ' + n);
		if (n) W.changed();
	};
	W.rename = async function () {
		var ids = W.ids();
		if (!ids.length) { U.toast('Выделите материалы в таблице (Ctrl, Shift)'); return; }
		var v = await U.modal({ title: 'Переименовать выделенные', width: 480,
			body: '<p>Выделено материалов: <b>' + ids.length + '</b>.</p>' + inp('rnF', 'Найти', '', 420, ' autofocus') + inp('rnR', 'Заменить на', '', 420) + '<label class="ck"><input type="checkbox" id="rnA"> в артикуле (а не в наименовании)</label>',
			buttons: [{ label: 'Отмена', value: null }, { label: 'Заменить', primary: true, run: function (m) { var f = m.querySelector('#rnF').value; if (!f) { U.toast('Что искать?'); return false; } return { f: f, r: m.querySelector('#rnR').value, a: m.querySelector('#rnA').checked }; } }] });
		if (!v) return;
		var r = MB.renameMats(S.b, ids, v.f, v.r, v.a);
		U.toast('Переименовано: ' + r.done + (r.skip ? ', пропущено (получился бы повтор): ' + r.skip : ''));
		if (r.done) W.changed();
	};
	W.backup = async function () {
		var d = new Date(), stamp = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
		var p = await U.pick({ kind: 'save', title: 'Резервная копия базы материалов', dir: S.path ? U.dirOf(S.path) : '', name: 'База материалов — копия ' + stamp + '.json', filters: [{ name: 'Копия базы', ext: ['json'] }] });
		if (!p) return;
		await W.save();
		await U.api.write(p, JSON.stringify(S.b));
		U.toast('Копия базы сохранена. Открыть её — «Файл → Папка базы…» или переименовать в «' + MB.FILE + '».');
	};
	W.dropAllRel = async function () { if (!(await U.confirm('Удалить все сопутствующие', 'У всех материалов базы будут удалены сопутствующие материалы.', 'Удалить'))) return; for (var k in S.b.mats) S.b.mats[k].rel = []; W.changed(); };
	W.dropAllArts = async function () { if (!(await U.confirm('Удалить все артикулы', 'У всех материалов базы будут стёрты артикулы.', 'Стереть'))) return; for (var k in S.b.mats) S.b.mats[k].art = ''; W.changed(); };

	/* ---------------------------------- склад ----------------------------------- */
	function ruDate(d) { var m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(d || ''); return m ? m[3] + '.' + m[2] + '.' + m[1] : (d || ''); }
	function docTitle(d) { return (d.kind === 'in' ? 'Приход' : (d.kind === 'out' ? 'Расход' : 'Корректировка')) + ' № ' + esc(d.no) + (d.off ? ' (отменён)' : ''); }
	W.doc = async function (kind) {
		var lines = [];
		var draw = function (m) { m.querySelector('#dlT').innerHTML = lines.map(function (l, i) { var x = S.b.mats[l.mat]; return '<tr><td>' + esc((x.art ? x.art + ' — ' : '') + x.name) + '</td><td><input type="text" data-q="' + i + '" value="' + l.qty + '"></td><td>' + esc(x.unit) + '</td>' + (kind === 'in' ? '<td><input type="text" data-p="' + i + '" value="' + (l.price || '') + '"></td>' : '') + '<td><button class="icon" data-lx="' + i + '">✕</button></td></tr>'; }).join('') || '<tr><td colspan="5" class="mute">Добавьте строки</td></tr>'; };
		var v = await U.modal({ title: kind === 'in' ? 'Приход' : 'Корректировка остатков', width: 760,
			body: '<div class="row">' + inp('dDate', 'Дата', MB.today(), 140) + inp('dNo', 'Номер', '', 120) + (kind === 'in' ? sel('dSup', 'Поставщик', [['', '—']].concat(S.b.suppliers.map(function (s) { return [s.id, s.name]; })), '', 260) : '') + '</div>' +
				(kind === 'adj' ? '<p class="mute">Корректировка: плюс — найдено при пересчёте, минус — недостача.</p>' : '') +
				'<table class="grid"><thead><tr><th>Материал</th><th>Кол-во</th><th>Ед. изм.</th>' + (kind === 'in' ? '<th>Цена</th>' : '') + '<th></th></tr></thead><tbody id="dlT"></tbody></table>' + inp('dNote', 'Примечание', '', 600),
			buttons: [{ label: 'Добавить материал…', left: true, keep: true, run: async function (m) { var id = await W.pickMat('Материал в документ'); if (id) { lines.push({ mat: id, qty: 1, price: S.b.mats[id].price }); draw(m); } } }, { label: 'Отмена', value: null }, { label: 'Провести', primary: true, run: function (m) {
				m.querySelectorAll('[data-q]').forEach(function (x) { lines[x.dataset.q].qty = MB.num(x.value); });
				m.querySelectorAll('[data-p]').forEach(function (x) { lines[x.dataset.p].price = MB.num(x.value); });
				var d = MB.addDoc(S.b, { kind: kind, date: m.querySelector('#dDate').value, no: m.querySelector('#dNo').value, sup: kind === 'in' ? m.querySelector('#dSup').value : '', note: m.querySelector('#dNote').value, lines: lines });
				if (!d) { U.toast('В документе нет строк с количеством'); return false; }
				return d; } }],
			onOpen: function (m) { draw(m); m.addEventListener('click', function (e) { if (e.target.dataset.lx) { lines.splice(Number(e.target.dataset.lx), 1); draw(m); } }); } });
		if (v) { U.toast(docTitle(v) + ' проведён'); W.changed(); }
	};
	W.docs = function () {
		var draw = function (m) {
			m.querySelector('#dcT').innerHTML = S.b.stock.docs.slice().reverse().map(function (d) { var s = MB.supplier(S.b, d.sup); return '<tr class="' + (d.off ? 'off' : '') + '"><td>' + esc(ruDate(d.date)) + '</td><td>' + docTitle(d) + '</td><td>' + esc(s ? s.name : d.project) + '</td><td class="r">' + d.lines.length + '</td><td>' + (d.off ? '' : '<button data-dx="' + d.id + '">Отменить</button>') + '</td></tr>'; }).join('') || '<tr><td colspan="5" class="mute">Документов нет</td></tr>';
		};
		return U.modal({ title: 'Документы склада', width: 720, body: '<table class="grid"><thead><tr><th>Дата</th><th>Документ</th><th>Поставщик / проект</th><th>Строк</th><th></th></tr></thead><tbody id="dcT"></tbody></table>',
			buttons: [{ label: 'Закрыть', primary: true }],
			onOpen: function (m) { draw(m); m.addEventListener('click', async function (e) { if (e.target.dataset.dx && await U.confirm('Отменить документ', 'Остатки пересчитаются так, будто документа не было.', 'Отменить документ')) { MB.cancelDoc(S.b, e.target.dataset.dx); W.changed(); draw(m); } }); } });
	};
	W.offcutsWin = function () {
		var oc = MB.offcuts(S.b);
		return U.modal({ title: 'Деловые обрезки на складе', width: 720, body: '<table class="grid"><thead><tr><th>Материал</th><th>Длина</th><th>Ширина</th><th>Шт</th><th>Откуда</th><th>Дата</th></tr></thead><tbody>' +
			(oc.map(function (o) { var m = S.b.mats[o.mat]; return m ? '<tr><td>' + esc(m.name) + '</td><td class="r">' + o.L + '</td><td class="r">' + o.W + '</td><td class="r">' + o.n + '</td><td>' + esc(o.project || 'вручную') + '</td><td>' + esc(ruDate(o.date)) + '</td></tr>' : ''; }).join('') || '<tr><td colspan="6" class="mute">Обрезков нет. Они попадают сюда при «Списать по заказу» в проекте и вручную — в карточке материала, вкладка «Склад».</td></tr>') + '</tbody></table>',
			buttons: [{ label: 'Закрыть', primary: true }] });
	};

	/* ---------------------------- импорт и экспорт ------------------------------ */
	W.importFile = async function (kind) {
		var p = await U.pick({ kind: 'open', title: 'Импорт номенклатуры', filters: [{ name: kind.toUpperCase(), ext: [kind] }] });
		if (!p) return;
		var recs;
		try {
			if (kind === 'dbf') recs = MB.fromDBF(await U.api.readBytes(p));
			else { var t = await U.api.readAnyText(p); recs = kind === 'csv' ? MB.fromCSV(t) : MB.fromXML(t); }
		} catch (e) { U.error(e); return; }
		if (!recs.length) { U.toast('В файле не найдено материалов'); return; }
		if (!(await U.confirm('Импорт номенклатуры', 'Материалов в файле: ' + recs.length + '. Группы — по разделам файла. Совпавшие (по правилу уникальности) обновятся.', 'Загрузить'))) return;
		var r = MB.importRecs(S.b, recs);
		U.toast('Добавлено: ' + r.add + ', обновлено: ' + r.upd + (r.skip ? ', пропущено: ' + r.skip : ''));
		W.changed();
	};
	W.exportFile = async function (what, kind) {
		var ids = what === 'sel' ? S.sel.slice() : (what === 'group' ? S.list.map(function (m) { return m.id; }) : null);
		if (ids && !ids.length) { U.toast('Нечего выгружать'); return; }
		var p = await U.pick({ kind: 'save', title: 'Экспорт номенклатуры', name: 'База материалов.' + kind, filters: [{ name: kind.toUpperCase(), ext: [kind] }] });
		if (!p) return;
		var recs = MB.exportRecs(S.b, ids), data;
		if (kind === 'csv') data = MB.toCSV(recs);
		else if (kind === 'xml') data = MB.toXML(recs);
		else if (kind === 'dbf') data = MB.toDBF(recs);
		else data = BM.out.xlsxBook([{ name: 'Материалы', freeze: 1, cols: MB.DBF.map(function (f) { return f[1] === 'C' ? 24 : 12; }), rows: [MB.DBF.map(function (f) { return { v: f[0], s: 1 }; })].concat(recs.map(function (r) { return MB.DBF.map(function (f) { return r[f[0]]; }); })) }]);
		await U.api.write(p, data);
		U.toast('Выгружено: ' + recs.length);
	};
	W.fromOld = async function () {
		var old = null;
		try { old = await W.oldBase(); } catch (e) { old = null; }
		if (!old || !Object.keys(old.mats || {}).length && !(old.sup || []).length) { U.toast('Прежняя «База» пуста или не найдена'); return; }
		if (!(await U.confirm('Взять из прежней «Базы»', 'Поставщики: ' + (old.sup || []).length + ', материалы: ' + Object.keys(old.mats || {}).length + '. Материалы лягут в группу «Из прежней Базы»; уже заведённое не изменится.', 'Перенести'))) return;
		var r = MB.fromOld(S.b, old);
		U.toast('Перенесено: материалов ' + r.mats + ', поставщиков ' + r.sup + ', классов ' + r.cls + (r.skip ? '; уже были: ' + r.skip : ''));
		W.changed();
	};
	/* прежняя «База» — base.json в папке настроек программы */
	W.oldBase = async function () { var d = W.boot && W.boot.dataDir; if (!d) return null; var p = U.join(d, 'base.json'), st = await U.api.stat(p); return st.exists ? JSON.parse(await U.api.readText(p)) : null; };
	W.about = function () { U.modal({ title: 'База материалов и комплектующих', width: 460, body: '<p>Устроена как база материалов БАЗИС-Мебельщика: группы, карточка материала, справочники, импорт и экспорт. Плюс склад: приход, расход по заказу, деловые обрезки.</p><p class="mute">Файл базы: ' + esc(S.path) + '</p>' }); };

	/* --------------------------------- события ---------------------------------- */
	W.init = async function () {
		try { W.boot = await U.api.boot(); U.sep = W.boot.sep || '\\'; } catch (e) { W.boot = { sep: '/' }; U.sep = '/'; }
		try { var set = await U.api.settings(); var th = BM.theme(set.theme), root = document.documentElement; root.dataset.theme = th.base; if (th.id !== 'light' && th.id !== 'dark') root.dataset.skin = th.id; } catch (e) { }
		var menu = $('mbMenu');
		menu.innerHTML = MENU.map(function (m, i) { return '<span data-i="' + i + '">' + esc(m[0]) + '</span>'; }).join('');
		menu.addEventListener('mousedown', function (e) {
			var s = e.target.closest('span'); if (!s) return;
			var on = s.classList.contains('on');
			W.closeMenus();
			if (on) return;
			s.classList.add('on');
			var r = s.getBoundingClientRect();
			popup(MENU[Number(s.dataset.i)][1], r.left, r.bottom);
		});
		menu.addEventListener('mouseover', function (e) { var s = e.target.closest('span'); var cur = menu.querySelector('span.on'); if (s && cur && s !== cur) { W.closeMenus(); s.classList.add('on'); var r = s.getBoundingClientRect(); popup(MENU[Number(s.dataset.i)][1], r.left, r.bottom); } });
		/* панель кнопок */
		$('bGrpAdd').onclick = function () { W.groupWin(null); };
		$('bGrpEd').onclick = function () { var g = MB.group(S.b, S.group); if (g) W.groupWin(g); };
		$('bGrpDel').onclick = W.dropGroup;
		$('bMatAdd').onclick = function () { W.card(null); };
		$('bMatEd').onclick = function () { if (S.cur) W.card(S.cur); };
		$('bMatDel').onclick = W.dropMats;
		$('bMatMv').onclick = W.moveTo;
		$('bFilt').onclick = function () { S.showFilters = !S.showFilters; $('bFilt').classList.toggle('on', S.showFilters); W.renderTable(); };
		$('bFilt').classList.add('on');
		$('bFiltClr').onclick = function () { S.filters = {}; W.renderTable(); };
		/* поиск */
		var find = function () { S.q = $('mbQ').value.trim(); if (S.q) S.group = ''; W.render(); };
		$('mbFind').onclick = find;
		$('mbQ').addEventListener('keydown', function (e) { if (e.key === 'Enter') find(); });
		$('mbClear').onclick = function () { $('mbQ').value = ''; S.q = ''; W.render(); };
		/* дерево */
		var tree = $('mbTree');
		tree.addEventListener('click', function (e) {
			var n = e.target.closest('.tn'); if (!n) return;
			var id = n.dataset.g;
			if (e.target.classList.contains('pm')) { S.open[id] = !S.open[id]; W.renderTree(); return; }
			S.group = id; S.sel = []; S.cur = ''; S.q = ''; $('mbQ').value = ''; W.render();
		});
		tree.addEventListener('dblclick', function (e) { var n = e.target.closest('.tn'); if (n && n.dataset.g) { S.open[n.dataset.g] = !S.open[n.dataset.g]; W.renderTree(); } });
		tree.addEventListener('contextmenu', function (e) {
			var n = e.target.closest('.tn'); e.preventDefault();
			if (n) { S.group = n.dataset.g; W.render(); }
			var g = MB.group(S.b, S.group);
			popup([['Добавить группу', function () { W.groupWin(null); }], ['Изменить группу', function () { W.groupWin(g); }, null, !!g], ['Удалить группу', W.dropGroup, null, !!g], null, ['Добавить материал', function () { W.card(null); }, null, !!S.b.groups.length], null,
				['Развернуть все', function () { S.b.groups.forEach(function (x) { S.open[x.id] = 1; }); W.renderTree(); }], ['Свернуть все', function () { S.open = {}; W.renderTree(); }]], e.clientX, e.clientY);
		});
		/* перетаскивание: материалы и группы — в группу */
		tree.addEventListener('dragstart', function (e) { var n = e.target.closest('.tn'); if (n && n.dataset.g) e.dataTransfer.setData('text/x-mbg', n.dataset.g); });
		tree.addEventListener('dragover', function (e) { if (e.target.closest('.tn')) e.preventDefault(); });
		tree.addEventListener('drop', function (e) {
			var n = e.target.closest('.tn'); if (!n) return;
			e.preventDefault();
			var g = e.dataTransfer.getData('text/x-mbg'), ms = e.dataTransfer.getData('text/x-mbm');
			if (g) { if (MB.moveGroup(S.b, g, n.dataset.g)) W.changed(); else U.toast('Группу нельзя перенести внутрь себя'); }
			else if (ms && n.dataset.g) { MB.moveMats(S.b, ms.split(','), n.dataset.g); W.changed(); }
		});
		/* таблица */
		var sc = $('mbScroll');
		sc.addEventListener('scroll', function () { $('mbHead').style.transform = 'translateX(' + (-sc.scrollLeft) + 'px)'; W.renderRows(); });
		new ResizeObserver(function () { W.renderRows(); }).observe(sc);
		var rows = $('mbRows');
		rows.addEventListener('mousedown', function (e) {
			var r = e.target.closest('.tr'); if (!r) return;
			var id = r.dataset.m;
			if (e.ctrlKey || e.metaKey) { var i = S.sel.indexOf(id); if (i >= 0) S.sel.splice(i, 1); else S.sel.push(id); }
			else if (e.shiftKey && S.cur) { var a = -1, z = -1; S.list.forEach(function (m, k) { if (m.id === S.cur) a = k; if (m.id === id) z = k; }); S.sel = S.list.slice(Math.min(a, z), Math.max(a, z) + 1).map(function (m) { return m.id; }); }
			else if (e.button === 0 || S.sel.indexOf(id) < 0) S.sel = [id];
			S.cur = id;
			markRows(); W.renderBottom(); $('mbSum').textContent = 'Всего: ' + S.list.length + (S.sel.length > 1 ? '   выделено: ' + S.sel.length : '');
			document.querySelectorAll('[data-need=mat]').forEach(function (b) { b.disabled = false; });
		});
		rows.addEventListener('dblclick', function (e) { var r = e.target.closest('.tr'); if (r) W.card(r.dataset.m); });
		rows.addEventListener('dragstart', function (e) { var r = e.target.closest('.tr'); if (r) e.dataTransfer.setData('text/x-mbm', (S.sel.indexOf(r.dataset.m) >= 0 ? S.sel : [r.dataset.m]).join(',')); });
		rows.addEventListener('contextmenu', function (e) {
			e.preventDefault();
			var r = e.target.closest('.tr'), has = !!r;
			popup([['Добавить материал', function () { W.card(null); }, null, !!S.b.groups.length], ['Создать новый на основе текущего', function () { var c = MB.copyMat(S.b, S.cur); if (c) { S.cur = c.id; S.sel = [c.id]; W.changed(); W.card(c.id); } }, null, has], ['Редактировать материал', function () { W.card(S.cur); }, null, has], null,
				['Удалить материал', W.dropMats, null, has], ['Удалить выбранный класс', function () { var m = S.b.mats[S.cur]; if (m && m.cls.length) { m.cls.pop(); W.changed(); } }, null, has], null,
				['Показать группу', function () { W.show(S.cur); }, null, has], ['Переместить в группу…', W.moveTo, null, has], null,
				['Выделить материалы по классу', function () { var m = S.b.mats[S.cur]; if (m && m.cls.length) { S.sel = S.list.filter(function (x) { return x.cls.indexOf(m.cls[0]) >= 0; }).map(function (x) { return x.id; }); W.renderRows(); } }, null, has],
				['Установить наценку', function () { W.prices(true); }, null, has], ['Групповое редактирование параметров…', function () { W.bulk(); }, null, has], ['Переименовать выделенные…', function () { W.rename(); }, null, has], null,
				['Копировать сопутствие', function () { var m = S.b.mats[S.cur]; W.relBuf = m ? JSON.parse(JSON.stringify(m.rel)) : null; U.toast(m && m.rel.length ? 'Скопировано сопутствующих: ' + m.rel.length : 'У материала нет сопутствующих'); }, null, has],
				['Вставить сопутствие из буфера', function () { var n = MB.pasteRel(S.b, W.relBuf, W.ids()); U.toast('Добавлено сопутствующих: ' + n); if (n) W.changed(); }, null, has && !!(W.relBuf && W.relBuf.length)], null, ['Склад материала', function () { W.card(S.cur, 'stock'); }, null, has], ['Информация о материале', function () { W.info(S.cur); }, null, has]], e.clientX, e.clientY);
		});
		$('mbHead').addEventListener('click', function (e) {
			var th = e.target.closest('.th'); if (!th || e.target.classList.contains('rs')) return;
			var c = th.dataset.c;
			S.sort = S.sort.col === c ? { col: c, dir: -S.sort.dir } : { col: c, dir: 1 };
			if (S.b.set.keepSort) { S.b.set.sort = S.sort; W.changed(); } else W.renderTable();
		});
		$('mbHead').addEventListener('input', function (e) { var f = e.target.dataset.f; if (!f) return; S.filters[f] = e.target.value; clearTimeout(W.ft); W.ft = setTimeout(function () { var a = document.activeElement && document.activeElement.dataset.f, pos = document.activeElement.selectionStart; W.renderTable(); if (a) { var x = document.querySelector('[data-f="' + a + '"]'); x.focus(); x.setSelectionRange(pos, pos); } }, 200); });
		$('mbHead').addEventListener('contextmenu', function (e) { e.preventDefault(); W.colsWin(); });
		/* ширина столбца — тянуть за правый край заголовка */
		$('mbHead').addEventListener('mousedown', function (e) {
			if (!e.target.classList.contains('rs')) return;
			e.preventDefault();
			var c = e.target.parentNode.dataset.c, x0 = e.clientX, w0 = e.target.parentNode.getBoundingClientRect().width;
			var mv = function (ev) { S.b.set.colW = S.b.set.colW || {}; S.b.set.colW[c] = Math.max(30, Math.round(w0 + ev.clientX - x0)); W.renderTable(); };
			var up = function () { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); W.changed(); };
			document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
		});
		/* нижние панели */
		var bot = $('mbBottom');
		bot.addEventListener('click', async function (e) {
			var m = S.b.mats[S.cur], a = e.target.dataset.a;
			if (!m) return;
			if (a === 'relAdd') { var id = await W.pickMat('Сопутствующий материал'); if (id && id !== m.id && !m.rel.some(function (r) { return r.mat === id; })) { m.rel.push({ mat: id, qty: 1 }); W.changed(); } }
			else if (a === 'opAdd') { m.ops.push({ op: 'Операция', param: '', qty: 1, unit: m.unit, norm: 0, rate: 0 }); W.changed(); }
			else if (e.target.dataset.relx) { m.rel.splice(Number(e.target.dataset.relx), 1); W.changed(); }
			else if (e.target.dataset.opx) { m.ops.splice(Number(e.target.dataset.opx), 1); W.changed(); }
		});
		bot.addEventListener('change', function (e) {
			var m = S.b.mats[S.cur]; if (!m) return;
			if (e.target.dataset.rel) m.rel[Number(e.target.dataset.rel)].qty = MB.num(e.target.value, 1);
			else if (e.target.dataset.of) { var o = m.ops[Number(e.target.closest('tr').dataset.op)], f = e.target.dataset.of; o[f] = /qty|norm|rate/.test(f) ? MB.num(e.target.value) : e.target.value.trim(); }
			else return;
			S.dirty = true; clearTimeout(saveT); saveT = setTimeout(W.save, 350);
		});
		/* клавиши */
		document.addEventListener('keydown', function (e) {
			if (document.querySelector('.back:not(.out)') || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
			if (e.key === 'Delete' && S.cur) { e.preventDefault(); W.dropMats(); }
			else if (e.key === 'Enter' && S.cur) { e.preventDefault(); W.card(S.cur); }
			else if (e.key === 'Insert') { e.preventDefault(); W.card(null); }
			else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && S.list.length) {
				e.preventDefault();
				var i = -1; S.list.forEach(function (m, k) { if (m.id === S.cur) i = k; });
				i = Math.max(0, Math.min(S.list.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)));
				S.cur = S.list[i].id; S.sel = [S.cur]; W.scrollTo(S.cur); W.renderRows(); W.renderBottom();
			} else if (e.ctrlKey && e.key.toLowerCase() === 'f') { e.preventDefault(); $('mbQ').focus(); }
		});
		window.addEventListener('beforeunload', function () { if (S.dirty) W.save(); });
		/* файл базы */
		window.addEventListener('focus', function () { W.recheck(); });
		document.addEventListener('visibilitychange', function () { if (!document.hidden) W.recheck(); });
		setInterval(function () { if (!document.hidden) W.recheck(); }, 5000);
		var qs = new URLSearchParams(location.search), file = qs.get('file') || '';
		if (!file && W.boot && W.boot.dataDir) { try { var mj = U.join(W.boot.dataDir, 'matbase.json'), ms = await U.api.stat(mj); if (ms.exists) file = JSON.parse(await U.api.readText(mj)).file || ''; } catch (e) { file = ''; } }
		file = file || LS('file');
		if (file) { try { await W.load(file); return; } catch (e) { U.error(e); } }
		if (!(await W.chooseFolder())) $('mbFile').textContent = 'Папка базы не выбрана — «Файл → Папка базы…»';
	};
	W.info = function (id) {
		var m = S.b.mats[id]; if (!m) return;
		var s = MB.supplier(S.b, m.sup), uses = []; for (var k in S.b.mats) if (S.b.mats[k].rel.some(function (r) { return r.mat === id; })) uses.push(S.b.mats[k].name);
		U.modal({ title: 'Информация о материале', width: 520, body: '<p><b>' + esc(m.name) + '</b>' + (m.art ? ' · ' + esc(m.art) : '') + '</p><p>Группа: ' + esc(MB.path(S.b, m.group).join(' / ')) + '</p><p>Остаток: ' + MB.balance(S.b, id) + ' ' + esc(m.unit) + ' · обрезков: ' + MB.offcuts(S.b, id).length + '</p>' +
			(s ? '<p>Поставщик: ' + esc(s.name) + '</p>' : '') + (uses.length ? '<p>Сопутствующий у: ' + esc(uses.join(', ')) + '</p>' : '') });
	};
})();
