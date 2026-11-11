/* STHGroup — окна: материалы, настройки, вывод (PDF, Excel, DXF, списки), изменения модели, обновление. */
(function () {
	'use strict';
	var U = window.UI, P = BM.project, O = BM.out, $ = U.$, esc = U.esc;
	var Dg = window.Dlg = {};
	function num(v, lo, hi, def) { v = Number(String(v).replace(',', '.')); if (!isFinite(v)) return def; return Math.max(lo, Math.min(hi, v)); }
	function chk(v) { return v ? ' checked' : ''; }

	/* ------------------------------- материалы -------------------------------- */
	Dg.materials = function () {
		var A = window.App, S = A.S, st = S.st;
		if (!st) return;
		var before = JSON.stringify(st.work), sm = P.summary(st), cnt = {};
		sm.mats.forEach(function (r) { cnt[r.mat.key] = r; });
		function fmtOpts(m) {
			return m.cfg.fmts.map(function (f, i) { return '<option value="' + i + '"' + (i === m.cfg.fmt ? ' selected' : '') + '>' + f[0] + ' × ' + f[1] + '</option>'; }).join('') + '<option value="new">другой размер…</option>';
		}
		function rows() {
			return st.mats.map(function (m, i) {
				var r = cnt[m.key];
				return '<tr data-i="' + i + '"><td><input type="checkbox" class="on"' + chk(m.cfg.on) + ' title="Раскладывать этот материал по листам"></td><td class="name">' + esc(P.matTitle(m)) + '</td><td class="r">' + (r ? r.n : 0) + '</td>' +
					'<td><label class="chk"><input type="checkbox" class="grain"' + chk(m.cfg.grain) + '> есть</label></td>' +
					'<td><select class="fmt">' + fmtOpts(m) + '</select><span class="newfmt" hidden> <input type="number" class="nl" min="300" max="9999" placeholder="длина"> × <input type="number" class="nw" min="200" max="9999" placeholder="ширина"> <button class="addfmt">Добавить</button></span></td>' +
					'<td class="r">' + ((m.cfg.rem || []).reduce(function (a, x) { return a + (x.n || 1); }, 0) || '—') + '</td></tr>';
			}).join('');
		}
		return U.modal({
			title: 'Материалы', width: 1040,
			body: '<p class="mute">Для каждого материала — есть ли у него текстура и какой формат листа. Остатки (куски от прошлых заказов) добавляются слева в главном окне, у выбранного материала.</p>' +
				  '<table class="grid"><thead><tr><th title="Раскладывать по листам">В раскрой</th><th>Материал</th><th class="r">Деталей</th><th>Текстура</th><th>Формат листа, мм</th><th class="r">Остатков</th></tr></thead><tbody>' + rows() + '</tbody></table>',
			buttons: [{ label: 'Готово', primary: true, value: true }],
			onOpen: function (m) {
				var tb = m.querySelector('tbody');
				tb.addEventListener('change', function (e) {
					var tr = e.target.closest('tr'); if (!tr) return;
					var mat = st.mats[Number(tr.dataset.i)], c = e.target.classList;
					if (c.contains('on')) mat.cfg.on = e.target.checked ? 1 : 0;
					else if (c.contains('grain')) mat.cfg.grain = e.target.checked ? 1 : 0;
					else if (c.contains('fmt')) {
						if (e.target.value === 'new') { tr.querySelector('.newfmt').hidden = false; tr.querySelector('.nl').focus(); return; }
						mat.cfg.fmt = Number(e.target.value);
					} else return;
					A.rememberMat(mat);
				});
				tb.addEventListener('click', function (e) {
					if (!e.target.classList.contains('addfmt')) return;
					var tr = e.target.closest('tr'), mat = st.mats[Number(tr.dataset.i)];
					var L = Math.round(num(tr.querySelector('.nl').value, 0, 9999, 0)), W = Math.round(num(tr.querySelector('.nw').value, 0, 9999, 0));
					if (L < 300 || W < 200) { U.toast('Укажите длину и ширину листа в миллиметрах.'); return; }
					var a = Math.max(L, W), b = Math.min(L, W), idx = -1;
					mat.cfg.fmts.forEach(function (f, i) { if (f[0] === a && f[1] === b) idx = i; });
					if (idx < 0) { mat.cfg.fmts.push([a, b]); idx = mat.cfg.fmts.length - 1; }
					mat.cfg.fmt = idx;
					tr.querySelector('.fmt').innerHTML = fmtOpts(mat);
					tr.querySelector('.newfmt').hidden = true;
					A.rememberMat(mat);
				});
			}
		}).then(async function () {
			if (S.st !== st) return;
			var after = JSON.stringify(st.work);
			if (after !== before) { S.undo.push(before); S.redo = []; S.sel = -1; A.afterChange(true); }
		});
	};

	/* ------------------------------- настройки -------------------------------- */
	Dg.paramsDiffer = function () {
		var S = window.App.S;
		if (!S.st) return false;
		var a = S.st.work.params, b = P.paramsFrom(S.set), k;
		for (k = 0; k < P.PARAMS.length; k++) if (P.PARAMS[k] !== 'quality' && a[P.PARAMS[k]] !== b[P.PARAMS[k]]) return true;
		for (k in b.rules) if (b.rules.hasOwnProperty(k) && !!a.rules[k] !== !!b.rules[k]) return true;
		return JSON.stringify(a.cut) !== JSON.stringify(b.cut);
	};
	Dg.settings = function (tab) {
		var A = window.App, S = A.S, st = S.st, set = S.set;
		var p = st ? st.work.params : P.paramsFrom(set), differ = Dg.paramsDiffer();
		var prof = function () { return set.dxf.profiles[set.dxf.cur] || set.dxf.profiles[0]; };
		var tName = null;      // имя человека, если его правили на вкладке «Программа» (не у автора)
		function tabCutNote() {
			return differ ? '<div class="note warn" style="margin-bottom:10px">Этот проект разложен с настройками, которые отличаются от ваших обычных. Ниже — настройки проекта. <button class="link" id="sMine">Взять мои обычные</button></div>' : '';
		}
		function csTab(id) { return function () { return (id === 'cgen' ? tabCutNote() : '') + CutSet.html(id, p, set); }; }
		function tabLook() {
			return '<div class="form">' +
				'<label>Тема окна</label><div><select id="sTheme">' + BM.THEMES.map(function (t) { return '<option value="' + t.id + '"' + (BM.theme(set.theme).id === t.id ? ' selected' : '') + '>' + esc(t.name) + '</option>'; }).join('') + '</select></div>' +
					'<label>Плотность интерфейса</label><div><select id="sDensity"><option value="compact"' + (set.sthDensity === 'compact' ? ' selected' : '') + '>Компактно — больше строк на экране</option><option value="normal"' + (!set.sthDensity || set.sthDensity === 'normal' ? ' selected' : '') + '>Обычно</option><option value="comfortable"' + (set.sthDensity === 'comfortable' ? ' selected' : '') + '>Просторно — крупнее поля и кнопки</option></select></div>' +
				'<label>Заказы открывать</label><div><select id="sOrderView"><option value="board"' + (set.sthOrderView !== 'list' ? ' selected' : '') + '>Карточками по этапам</option><option value="list"' + (set.sthOrderView === 'list' ? ' selected' : '') + '>Списком</option></select></div>' +          // STHGroup
				'<label>Масштаб окна</label><div class="zRow"><button type="button" id="sZm" title="Мельче на 5 %">−</button><input type="range" id="sZ" min="50" max="200" step="5" value="' + Math.round((set.zoom || 1) * 100) + '"><button type="button" id="sZp" title="Крупнее на 5 %">+</button><b id="sZv">' + Math.round((set.zoom || 1) * 100) + '%</b><button type="button" id="sZ0">Сбросить</button></div>' +
				'<div class="hint" id="sZh"></div>' +
				'<label class="chk full"><input type="checkbox" id="sAnim"' + chk(set.anim !== 0) + '> Анимации: заставка при запуске, плавное появление окон, движение деталей на карте</label>' +
				'<label class="chk full"><input type="checkbox" id="sSound"' + chk(set.sound !== 0) + (set.anim === 0 ? ' disabled' : '') + '> Звук при запуске — играет вместе с заставкой</label>' +
				'<label>Организация</label><input type="text" id="sOrg" value="' + esc(set.org) + '" placeholder="печатается в штампе PDF">' +
				'<label>Составил</label><input type="text" id="sAuthor" value="' + esc(set.author) + '" placeholder="фамилия в штампе PDF">' +
				'<label>Телефон</label><input type="text" id="sPhone" value="' + esc(set.phone || '') + '" placeholder="в файле 3D-модели для заказчика">' +
				'</div>';
		}
		function tabCutPdf() {
			var c = set.pdf;
			return '<p class="mute">Что входит в PDF раскроя. Эти же галки стоят в окне вывода PDF — там их можно поменять на один раз.</p><div class="form">' +
				'<label>Печать</label><div><select id="cColor"><option value="1"' + (c.color ? ' selected' : '') + '>цветная — детали окрашены по названию</option><option value="0"' + (c.color ? '' : ' selected') + '>чёрно-белая</option></select></div>' +
				'<label>Листы раскроя</label><div><select id="cBig"><option value="0"' + (c.big ? '' : ' selected') + '>карта и таблица деталей</option><option value="1"' + (c.big ? ' selected' : '') + '>карта на весь лист, сбоку указатель</option></select></div>' +
				'<label class="chk full"><input type="checkbox" id="cSum"' + chk(c.summary) + '> Сводка</label>' +
				'<label class="chk full"><input type="checkbox" id="cMaps"' + chk(c.maps) + '> Карты листов</label>' +
				'<label class="chk full"><input type="checkbox" id="cList"' + chk(c.list) + '> Общий список деталей</label>' +
				'<label class="chk full"><input type="checkbox" id="cOff"' + chk(c.offcuts) + '> Деловые остатки</label>' +
				'</div>';
		}
		/* ---- присадка: настройки на всю программу ---- */
		var Dr = BM.drill, dc = Dr.conf(set);
		var mc = set.model || (set.model = BM.defaults().model);
		set.drill = dc;
		var kc = BM.detail.conf(set); set.detail = kc;
		function tabKDraw() {
			return '<div class="form">' +
				'<label>Оформление листа</label><div>' + sel('kStyleS', ['V', 'A', 'B'].map(function (k) { return [k, BM.detail.STYLES[k]]; }), kc.style) + '</div>' +
				'<div class="hint">Список — под чертежом список обработок (что, размер, где, сторона); Таблица — справа таблица сведений; Крупно — чертёж крупнее, сведения строкой внизу. Переключается и кнопками прямо над листом.</div>' +
				'<h4>Что показывать</h4>' +
				'<label class="chk full"><input type="checkbox" id="kDims"' + chk(kc.dims) + '> Размеры: габарит, радиусы, скосы, вырезы, пазы</label>' +
				'<label class="chk full"><input type="checkbox" id="kEdge"' + chk(kc.edge) + '> Кромка и текстура</label>' +
				'<label class="chk full"><input type="checkbox" id="kHoles"' + chk(kc.holes) + '> Отверстия (подробно — на картах присадки)</label>' +
				'<label class="chk full"><input type="checkbox" id="kPic"' + chk(kc.pic) + '> «Где деталь» — модуль в 3D, деталь цветом</label>' +
				'<label class="chk full"><input type="checkbox" id="kInfo"' + chk(kc.info) + '> Список обработок / таблица / строка сведений</label>' +
				'<label class="chk full"><input type="checkbox" id="kCall"' + chk(kc.callouts) + '> Выносы — каждый вырез и паз крупно справа (без галки — карточки с текстом)</label>' +
				'</div><p class="mute" style="margin-top:12px">Одна деталь — один лист А4. Деталь нарисована лицевой стороной, как на карте присадки. Надписи не накладываются: если размеру нет места, он остаётся только в списке обработок.</p>';
		}
		var MODE_HINT = { A: 'У каждого отверстия мелкий номер, справа таблица по номерам: X, Y, Ø, глубина, крепёж.', B: 'Номеров нет. У каждого сверла свой значок, справа маленькая таблица: значок, Ø, глубина, крепёж.',
						  V: 'Таблицы нет. Диаметр и глубина написаны прямо у отверстия.', G: 'У детали всегда два листа: на первом только чертёж, на втором таблица отверстий, свёрла и пояснения со сносками.' };
		function sel(id, opts, val) { return '<select id="' + id + '">' + opts.map(function (o) { return '<option value="' + o[0] + '"' + (String(o[0]) === String(val) ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>'; }
		function tabMView() {
			var ax = [['', 'определять самой'], ['y', 'ось Y'], ['-y', 'ось Y, вниз'], ['z', 'ось Z'], ['-z', 'ось Z, вниз'], ['x', 'ось X'], ['-x', 'ось X, вниз']];
			var fr = [['', 'определять самой (по фасадам)'], ['z', 'ось Z'], ['-z', 'ось Z, обратно'], ['y', 'ось Y'], ['-y', 'ось Y, обратно'], ['x', 'ось X'], ['-x', 'ось X, обратно']];
			return '<div class="form">' +
				'<label>Оформление</label><div>' + sel('mvStyle', Object.keys(BM.v3d.STYLES).map(function (k) { return [k, BM.v3d.STYLES[k].name]; }), mc.style) + '</div>' +
				'<label>Материалы</label><div>' + sel('mvLook', [['plain', 'Обычные'], ['shine', 'С отражениями — блеск, как в материалах БАЗИСа']], mc.look === 'shine' ? 'shine' : 'plain') + ' <span class="mute">то же, что переключатель над моделью</span></div>' +
				'<label>Качество</label><div>' + sel('mvQuality', [['high', 'Высокое — ровные края и тени в углах'], ['normal', 'Обычное — для слабых компьютеров']], mc.quality === 'normal' ? 'normal' : 'high') + '</div>' +
				'<label class="chk full"><input type="checkbox" id="mvHint"' + chk((mc.hintSeen || 0) <= 3) + '> Подсказка мыши под моделью</label>' +
				'<label class="chk full"><input type="checkbox" id="mvOutline"' + chk(mc.outline) + '> Контур — тёмные границы панелей</label>' +
				'<label class="chk full"><input type="checkbox" id="mvHoles"' + chk(mc.holes) + '> Отверстия присадки</label>' +
				'<label class="chk full"><input type="checkbox" id="mvBand"' + chk(mc.band) + '> Кромка — цветной полосой по торцу</label>' +
				'<label class="chk full"><input type="checkbox" id="mvGrooves"' + chk(mc.grooves) + '> Пазы</label>' +
				'<h4>Подсветка из модели</h4>' +
				'<label>Светится</label><div><input type="text" id="mvGlowW" value="' + esc(mc.glowW === undefined ? 'Рассеиватель' : mc.glowW) + '" style="width:100%"></div>' +
				'<label>Лента</label><div><input type="text" id="mvGlowLed" value="' + esc(mc.glowLed === undefined ? 'Лента' : mc.glowLed) + '" style="width:100%"></div>' +
				'<label>Профиль</label><div><input type="text" id="mvGlowProf" value="' + esc(mc.glowProf === undefined ? 'Профиль' : mc.glowProf) + '" style="width:100%"></div>' +
				'<p class="mute full">Названия деталей в структуре модели БАЗИСа; несколько слов — через запятую; ищется по части названия, большие и маленькие буквы не важны. Светится деталь из первого поля; свет идёт от ленты через неё наружу (нет ленты — от профиля). Без ленты и профиля в том же блоке подсветки нет. Включается в «Модели» кнопкой «Свет» → «Подсветка из модели».</p>' +
				'<label>Тени от подсветки</label><div>' + sel('mvGlowSh', [['0', 'Без теней — быстрее всего'], ['4', 'Не больше чем от 4 лент'], ['all', 'От всех лент — может тормозить на больших моделях']], mc.glowSh === undefined ? '4' : mc.glowSh) + '</div>' +
				'<h4>Если изделие стоит неправильно</h4>' +
				'<label>Верх изделия</label><div>' + sel('mvUp', ax, mc.up) + '</div>' +
				'<label>Лицо изделия</label><div>' + sel('mvFront', fr, mc.front) + '</div>' +
				'<label>Толщина панели</label><div>' + sel('mvZ', [[-1, 'определять самой (по отверстиям)'], [0, 'вперёд от опорной плоскости'], [1, 'назад от опорной плоскости'], [2, 'опорная плоскость посередине']], mc.zmode) + '</div>' +
				'</div><p class="mute" style="margin-top:12px">БАЗИС не сообщает программе, где у модели верх и с какой стороны панели лежит её толщина. Программа определяет это сама: верх — по панелям с названиями «дно», «крышка», «полка», «столешница»; лицо — по фасадам; толщину — по отверстиям. Если изделие лежит на боку, показано сзади или панели стоят со сдвигом на свою толщину — задайте здесь вручную.</p>';
		}
		function tabDDraw() {
			return '<div class="form">' +
				'<label>Оформление карты</label><div>' + sel('qMode', ['B', 'A', 'V', 'G'].map(function (k) { return [k, Dr.MODES[k]]; }), dc.mode) + '</div>' +
				'<div class="hint" id="qModeHint">' + esc(MODE_HINT[dc.mode]) + ' Переключается и кнопками прямо над картой.</div>' +
				'<label>Высота цифр, мм</label><div><input type="number" id="qCap" min="1.5" max="4" step="0.1" value="' + dc.cap + '"> <span class="mute">размеры, номера, таблица; от 1,5 до 4</span></div>' +
				'<label>У отверстий в оформлении «Два листа»</label><div>' + sel('qGMark', [['num', 'номера'], ['numsym', 'номера и значки свёрл']], dc.gMark) + '</div>' +
				'<label>Наименьший знак отверстия, мм</label><div><input type="number" id="qMin" min="0.8" max="4" step="0.1" value="' + dc.minMark + '"> <span class="mute">мелкое отверстие не рисуется мельче этого диаметра</span></div>' +
				'<label class="chk full"><input type="checkbox" id="qColor"' + chk(dc.color) + '> Цвет по свёрлам — каждое сверло своим цветом на экране и в PDF</label>' +
				'<label class="chk full"><input type="checkbox" id="qGuides"' + chk(dc.guides) + '> Направляющие от отверстий к размерам</label>' +
				'<label class="chk full"><input type="checkbox" id="qRows"' + chk(dc.rows) + '> Ряды с равным шагом подписывать «N × шаг»</label>' +
				'<label class="chk full"><input type="checkbox" id="qKey"' + chk(dc.key) + '> Схема торцов, если на карте есть виды торцов</label>' +
				'<label class="chk full"><input type="checkbox" id="qEnds"' + chk(dc.ends) + '> Виды торцов с отверстиями</label>' +
				'<label class="chk full"><input type="checkbox" id="qPic"' + chk(dc.pic) + '> «Где деталь» — модуль в 3D, деталь цветом</label>' +
				'</div><p class="mute" style="margin-top:12px">Чертёж детали во всех оформлениях стоит на одном месте — от левого верхнего угла листа. Надписи не накладываются: тесные размеры расходятся ступеньками, а где и этого мало — выносятся увеличенным видом.</p>';
		}
		function tabDTab() {
			return '<div class="form">' +
				'<label class="chk full"><input type="checkbox" id="qFast"' + chk(dc.fast) + '> Колонка «Крепёж» — под что отверстие</label>' +
				'<label>Текст второго листа, мм</label><div><input type="number" id="qCap2" min="1.5" max="4" step="0.1" value="' + dc.cap2 + '"> <span class="mute">оформление Г: таблица и пояснения</span></div>' +
				'<h4>Пояснения на карте</h4>' +
				'<label class="chk full"><input type="checkbox" id="qRead"' + chk(dc.exRead) + '> Как читать карту — база, стороны, торцы, ряды; только то, что есть на детали</label>' +
				'<label class="chk full"><input type="checkbox" id="qInfo"' + chk(dc.exInfo) + '> Сведения о детали — кромка, изделие</label>' +
				'</div><p class="mute" style="margin-top:12px">Примечание к детали пишется в разделе «Присадка» справа и печатается всегда. В оформлениях «Номера», «Значки» и «У отверстий» пояснения занимают не больше ' + Dr.NOTE_LINES + ' строк под чертежом, чтобы не теснить его; в «Два листа» они целиком на втором листе. Количество свёрл на картах не печатается.</p>';
		}
		function tabDPdf() {
			return '<div class="form">' +
				'<label>Листы</label><div>' + sel('qMulti', [[0, 'одна деталь — один лист А4'], [1, 'мелкие карты по несколько на лист']], dc.multi ? 1 : 0) + '</div>' +
				'<div class="hint">Это значение подставляется в окно вывода PDF. В оформлении Г у детали всегда свои два листа.</div>' +
				'<label style="align-self:start;margin-top:4px">Общий текст для всех карт</label><textarea id="qText" rows="5" maxlength="1200" placeholder="Например: сверлить после кромления; глубину проверять по упору">' + esc(dc.text) + '</textarea>' +
				'</div>';
		}
		function tabDBase() {
			return '<div class="form">' +
				'<label>Базовый угол новых деталей</label><div>' + sel('qBase', [[0, 'левый нижний'], [1, 'правый нижний'], [2, 'правый верхний'], [3, 'левый верхний']], dc.baseDef) + ' <span class="mute">на стороне А</span></div>' +
				'<label>Сквозные отверстия</label><div>' + sel('qThru', [['more', 'на той стороне, где больше глухих'], ['A', 'всегда на лицевой']], dc.thru) + '</div>' +
				'</div><p class="mute" style="margin-top:12px">От базового угла идут все размеры карты. У отдельной детали он меняется в разделе «Присадка»: кнопками справа или щелчком по углу на чертеже — такой выбор хранится в проекте и от этой настройки не зависит.</p>';
		}
		function tabFmt() {
			return '<p class="mute">Форматы, которые предлагаются для каждого нового материала. Формат из названия материала (например «2750x1830») подставляется сам.</p><div id="fmtList">' +
				set.formats.map(function (f, i) { return '<div class="btns" data-i="' + i + '" style="margin-bottom:5px"><input type="number" class="fl" value="' + f[0] + '" min="300" max="9999"> × <input type="number" class="fw" value="' + f[1] + '" min="200" max="9999"> мм <button class="icon fdel" title="Убрать">✕</button></div>'; }).join('') +
				'</div><button id="fmtAdd">Добавить формат</button>';
		}
		function tabDxf() {
			var q = prof(), row = function (id, on, lab, val) { return '<label class="chk"><input type="checkbox" id="x' + on + '"' + chk(q[on]) + (on === 'outerOn' ? ' checked disabled' : '') + '> ' + lab + '</label><div>слой <input type="text" id="x' + id + '" value="' + esc(val) + '" style="width:150px" spellcheck="false"></div>'; };
			return '<p class="mute">Профиль выгрузки — что и на какие слои выводить в DXF. У каждого подрядчика может быть свой.</p><div class="btns" style="margin-bottom:10px"><select id="xProf">' +
				set.dxf.profiles.map(function (x, i) { return '<option value="' + i + '"' + (i === set.dxf.cur ? ' selected' : '') + '>' + esc(x.name) + '</option>'; }).join('') + '</select><button id="xNew">Новый профиль</button><button id="xDel"' + (set.dxf.profiles.length < 2 ? ' disabled' : '') + '>Удалить</button></div>' +
				'<div class="form"><label>Название профиля</label><input type="text" id="xName" value="' + esc(q.name) + '">' +
				row('outer', 'outerOn', 'Контуры деталей', q.outer) + row('inner', 'useInner', 'Внутренние вырезы', q.inner) + row('label', 'useLabel', 'Подписи деталей', q.label) + row('drill', 'useDrill', 'Сверление', q.drill) + row('groove', 'useGroove', 'Пазы', q.groove) + row('sheet', 'useSheet', 'Контур листа', q.sheet) +
				'<label>Подпись детали</label><div><select id="xWhat"><option value="des">обозначение</option><option value="pos">позиция</option><option value="posdes">позиция · обозначение</option><option value="name">название</option></select> высота <input type="number" id="xTextH" min="3" max="200" value="' + q.textH + '"> мм</div>' +
				'<label class="chk full"><input type="checkbox" id="xByDia"' + chk(q.drillByDia) + '> Отверстия — на отдельные слои по диаметру и глубине (например ' + esc(q.drill) + '_D5_Z12, сквозные — ' + esc(q.drill) + '_D7_THRU)</label>' +
				'<label class="chk full"><input type="checkbox" id="xArcs"' + chk(q.arcs) + '> Дуги — настоящими дугами (иначе ломаной из отрезков)</label>' +
				'<label class="chk full"><input type="checkbox" id="xMargin"' + chk(q.margin) + '> Показывать полезную зону листа (с обрезкой краёв)</label>' +
				'<label>Кодировка файла</label><div><select id="xEnc"><option value="cp1251">Windows-1251 (русские буквы в большинстве CAM)</option><option value="utf8">UTF-8</option></select></div></div>';
		}
		function tabApp() {
			var d = st ? st.model.diag || {} : {}, lines = [];
			lines.push('STHGroup ' + (S.boot ? S.boot.version : BM.VERSION) + (st ? ' · выгрузка: ' + (S.doc.exporter || '?') + ' от ' + String(S.doc.exportedAt || '').replace('T', ' ').substring(0, 16) : ''));
			if (st) {
				lines.push('Панелей: ' + (d.panels || 0) + ' · пропущено: погонных ' + (d.skippedLinear || 0) + ', скрытых ' + (d.skippedHidden || 0));
				lines.push('Дуг: ' + (d.arcs || 0) + ' (без центра ' + (d.arcNoCenter || 0) + ', без направления ' + (d.arcNoDir || 0) + ') · окружностей: ' + (d.circles || 0));
				lines.push('Криволинейных разновидностей: ' + st.shapeStat.curve + ', форма прочитана: ' + st.shapeStat.ok + ', нет: ' + st.shapeStat.fail + (Object.keys(st.shapeStat.why).length ? ' (' + Object.keys(st.shapeStat.why).join('; ') + ')' : ''));
				lines.push('Крепежа с отверстиями: ' + (d.fasteners || 0) + ' · отверстий: ' + (d.holes || 0) + ' (без координат ' + (d.holeNoPos || 0) + ')');
				lines.push('Привязано к панелям: в пласть ' + st.holes.face + ', в торец ' + st.holes.edge + ', не привязано ' + st.holes.lost + ' из ' + st.holes.total + ' · ноль по толщине: вариант ' + st.holes.zmode);
				lines.push('Системы координат панелей: ' + (d.frames || 0) + ' (не получено ' + (d.frameFail || 0) + ') · пазов: ' + (d.cuts || 0) + ' · кромок: ' + (d.butts || 0));
				var raw = S.doc.model;
				lines.push('Для сметы: ' + (raw.est ? 'фурнитуры ' + (d.estFast || 0) + ' · комплектов ' + (d.kits || 0) + ' · кусков профиля ' + (d.profiles || 0) + ' · погонных ' + (d.linears || 0) + ' · скрытых панелей ' + (d.hiddenPanels || 0) : 'данных нет — проект выгружен прежним скриптом'));
				lines.push('Свойства модели: наименование «' + (raw.title || '') + '», артикул «' + (raw.art || '') + '», заказ «' + (raw.order || '') + '», примечание «' + (raw.note || '') + '»' + (d.article && Object.keys(d.article).length ? ' · все поля: ' + JSON.stringify(d.article) : (raw.art === undefined ? ' — артикул и примечание читает скрипт 1.4' : '')));
				lines.push('Блоков: ' + (d.blocks || 0) + (d.solids !== undefined ? ' · фурнитура и профили в 3D: ' + (d.solids || 0) + ' (форма прочитана ' + (d.solidMesh || 0) + ', габаритом ' + (d.solidBox || 0) + ', без формы ' + (d.solidNone || 0) + '; треугольников ' + Math.round(d.meshTris || 0) + (d.meshCut ? ', слишком сложных ' + d.meshCut : '') + ')' + (d.meshWhy ? ' · почему нет формы: ' + d.meshWhy : '') : ' · фурнитура в 3D — после выгрузки скриптом 1.4'));
				if (d.mesh) lines.push('3D-файл: ' + (d.mesh.ok ? (d.mesh.file + ', ' + Math.round((d.mesh.size || 0) / 1048576) + ' МБ, ' + (d.mesh.ms || 0) + ' мс') : 'не сохранён' + (d.mesh.err ? ' — ' + d.mesh.err : '')) + (d.uv ? ' · развёртка текстур: ' + (d.uv.ok ? d.uv.tris + ' треугольников, ' + (d.uv.ms || 0) + ' мс' + (d.uv.cut ? ' (не вся — дольше минуты)' : '') : 'не прочиталась' + (d.uv.err ? ' — ' + d.uv.err : '')) : ''));
				if (d.classes) lines.push('Объекты модели, кроме панелей (класс БАЗИСа: сколько): ' + JSON.stringify(d.classes));
				lines.push('Текстура у панелей (значение: сколько): ' + JSON.stringify(d.texSeen || {}) + ' · константы БАЗИСа: ' + JSON.stringify(st.model.texConst || {}));
				lines.push('Свойства БАЗИСа: ' + JSON.stringify(d.api || {}));
				if (d.errors && d.errors.length) lines.push('Ошибки выгрузки: ' + d.errors.join(' | '));
				if (d.keys) for (var k in d.keys) if (d.keys.hasOwnProperty(k)) lines.push('Свойства «' + k + '»: ' + (d.keys[k] || []).join(', '));
			}
			return '<div class="form">' +
				(isUser ? '<label>Как к вам обращаться</label><div><input type="text" id="tName" maxlength="60" value="' + esc(tName === null ? (Dg.tester.state.name || '') : tName) + '" placeholder="по желанию: имя или название мастерской"></div>' +
					'<div class="hint">Раз в день программа отправляет автору отметку — случайный номер этой установки, версию программы, версию Windows, разделы, которые вы открывали, и это имя, если оно указано. Проекты, цены и документы не отправляются.</div>' : '') +
				'<label>Настройки</label><div class="btns" style="margin:0"><button id="sExport">Сохранить в файл…</button><button id="sImport">Загрузить из файла…</button><span class="mute">— чтобы перенести на другой компьютер или на планшет (вместе с прайсами, «Базой» и её текстурами) или передать подрядчику</span></div>' +
				('<label>Прежняя «База»</label><div class="btns" style="margin:0"><button id="sOldBase">Открыть…</button><span class="mute">— классы для разделов сметы, текстуры из папки, загрузка из БАЗИСа. Новая «База материалов» открывается кнопкой «База» слева</span></div>') +
				(isTab ? '' : '<h4>Скрипт выгрузки</h4><label>После выгрузки</label><div><select id="sExpAfter"><option value="">спрашивать, что делать</option><option value="open">сразу открывать в программе</option><option value="save">только сохранять проект</option></select> <span class="mute">выбор, запомненный в окне выгрузки</span></div>') +
				'<h4>Текстура в БАЗИСе</h4><div class="full mute">Какое число у панели означает какое направление. Программа берёт значения из самого БАЗИСа; эти — запасные.</div>' +
				'<label>нет / вдоль X / вдоль Y</label><div><input type="number" id="tN" value="' + set.texMap.none + '"> <input type="number" id="tH" value="' + set.texMap.horiz + '"> <input type="number" id="tV" value="' + set.texMap.vert + '"></div>' +
				'<h4>Сведения о выгрузке из БАЗИСа</h4><div class="full diag" id="diagText">' + esc(lines.join('\n')) + '</div><div class="full"><button id="sCopy">Скопировать</button> <span class="mute">— если что-то читается неверно, пришлите этот текст разработчику</span></div></div>';
		}
		/* ---- смета: правила расчёта (настройки программы) и прайсы (свой файл рядом с настройками) ---- */
		var E = BM.est, Es = window.Est, ec = E.conf(set), hiddenWas = ec.hidden ? 1 : 0, facWas = JSON.stringify([ec.facArts, ec.facMdf, ec.facHinges]), facList = ec.facArts.slice();
		set.est = ec;
		var ps = P.clone(S.prices || E.fixStore(null)), plName = (st ? E.listFor(ps, st) : (E.listBy(ps, ec.cur) || ps.lists[0])).name, psTouched = false;
		function curPl() { return E.listBy(ps, plName) || ps.lists[0]; }
		function nv(v) { return String(v).replace('.', ','); }
		function plPick() { return '<div class="btns" style="margin:0 0 10px"><span class="mute">Прайс</span><select id="ePlSel">' + ps.lists.map(function (x) { return '<option' + (x.name === plName ? ' selected' : '') + '>' + esc(x.name) + '</option>'; }).join('') + '</select><span class="mute">— цены и правила ниже относятся к нему</span></div>'; }
		function tabECalc() {
			return '<div class="eset"><h4>Запасы</h4><div class="form">' +
				/* STHGroup: запас кромки на выбор — % от длины или мм свеса на каждую облицованную сторону */
				'<label>Запас по кромке</label><div><select id="eEdgeMode"><option value="pct"' + (ec.edgeMode !== 'mm' ? ' selected' : '') + '>% от длины</option><option value="mm"' + (ec.edgeMode === 'mm' ? ' selected' : '') + '>мм на сторону</option></select> ' +
				'<input type="text" class="s" id="eEdgeRes" value="' + nv(ec.edgeReserve) + '"' + (ec.edgeMode === 'mm' ? ' hidden' : '') + '> <input type="text" class="s" id="eEdgeMm" value="' + nv(ec.edgeMm === undefined ? 30 : ec.edgeMm) + '"' + (ec.edgeMode === 'mm' ? '' : ' hidden') + '>' +
				' <span class="mute" id="eEdgeHint">' + (ec.edgeMode === 'mm' ? '— свес с каждой облицованной стороны детали, мм' : '— к длине кромки по модели, %') + '</span></div>' +
				'<label>Запас на хлыст профиля, мм</label><div><input type="text" class="s" id="eProfRes" value="' + nv(ec.profReserve) + '"> <span class="mute">— столько с каждого хлыста уходит в отход</span></div>' +
				'<label>Пропил профиля, мм</label><div><input type="text" class="s" id="eProfKerf" value="' + nv(ec.profKerf) + '"></div></div>' +
				'<h4>Что считать</h4><div class="form">' +
				(BM.est.noWorks ? '' : '<label>Разделы</label><div><label class="chk"><input type="checkbox" id="eShowCuts"' + chk(ec.showCuts) + '> пазы и выемки</label>&emsp;<label class="chk"><input type="checkbox" id="eShowHoles"' + chk(ec.showHoles) + '> отверстия</label>&emsp;<label class="chk"><input type="checkbox" id="eShowFast"' + chk(ec.showFast) + '> фурнитура</label>&emsp;<label class="chk"><input type="checkbox" id="eShowProf"' + chk(ec.showProf) + '> профили</label></div>') +
				'<label>Скрытые панели</label><div><label class="chk"><input type="checkbox" id="eHidden"' + chk(ec.hidden) + '> включать в раскрой и смету</label> <span class="mute">— иначе только предупреждение</span></div>' +
				'<label>Отверстия в справке</label><div><select id="eHolesMode"><option value="0"' + (ec.holesSort > 0 ? '' : ' selected') + '>одной строкой «всего»</option><option value="1"' + (ec.holesSort > 0 ? ' selected' : '') + '>до и более диаметра</option></select> <input type="text" class="s" id="eHolesSort" value="' + nv(ec.holesSort > 0 ? ec.holesSort : 15) + '"> мм</div></div>' +
				'<h4>Как узнавать материал</h4><div class="form">' +
				'<label>Тонкий лист (ХДФ, ДВП)</label><div><input type="text" class="w" id="eThin" value="' + esc(ec.thinMask) + '" spellcheck="false"> толщины <input type="text" class="s" id="eThinTh" value="' + esc(ec.thinTh) + '"> мм</div>' +
				'<div class="hint">Слова из названия — через запятую. Распил таких листов идёт отдельной строкой.</div>' +
				'<label>Стекло и зеркало</label><div><input type="text" class="w" id="eGlass" value="' + esc(ec.glassMask) + '" spellcheck="false"> <span class="mute">— считается в кв.м</span></div>' +
				'<label>Обычный угол</label><div>скругление до <input type="text" class="s" id="eCorner" value="' + nv(ec.cornerMax) + '"> мм и не больше <input type="text" class="s" id="eCornerF" value="' + nv(ec.cornerFrac) + '"> % габарита</div>' +
				'<div class="hint">Такое скругление не считается криволинейным пилом и криволинейной кромкой. 0 мм — как в скрипте СМЕТА: криволинейным считается любое.</div>' +
				'<label>Классы толщины кромки</label><div>0,4 мм — до <input type="text" class="s" style="width:52px" id="eB0" value="' + nv(ec.edgeB[0]) + '">&ensp;1 мм — от <input type="text" class="s" style="width:52px" id="eB1" value="' + nv(ec.edgeB[1]) + '"> до <input type="text" class="s" style="width:52px" id="eB2" value="' + nv(ec.edgeB[2]) + '">&ensp;1,5 мм — до <input type="text" class="s" style="width:52px" id="eB3" value="' + nv(ec.edgeB[3]) + '">&ensp;2 мм — до <input type="text" class="s" style="width:52px" id="eB4" value="' + nv(ec.edgeB[4]) + '"></div>' +
				'<div class="hint">По классу группируются строки «Кромкование» и держится их цена. Лента вне классов идёт отдельной строкой со своей толщиной.</div>' +
				'</div></div>';
		}
		/* заказные фасады: блоки, чей артикул начинается с «@…» из этого списка */
		function tabEFac() {
			return '<div class="eset"><h4>Заказные фасады</h4><p class="mute">Блок считается заказным фасадом, если его артикул в БАЗИСе начинается с одной из этих строк (со знаком @). Такой фасад считается штукой с размером; его профили, стекло и отверстия не идут ни в смету, ни в раскрой, ни в карты присадки.</p>' +
				'<div id="facList" class="facList">' + facList.map(function (a, i) { return '<div class="facRow" data-i="' + i + '"><span>' + esc(a) + '</span><button class="fdel" title="Убрать">✕</button></div>'; }).join('') +
				'<div class="facRow add"><input type="text" id="facNew" placeholder="@Новый артикул" spellcheck="false"><button id="facAdd">Добавить</button></div></div>' +
				'<h4>Если внутри @-блока есть панель МДФ</h4><div class="full"><label class="chk"><input type="radio" name="facMdf" value="whole"' + chk(ec.facMdf !== 'cut') + '> Считать весь фасад заказным — МДФ <b>не идёт</b> в раскрой</label><br>' +
				'<label class="chk"><input type="radio" name="facMdf" value="cut"' + chk(ec.facMdf === 'cut') + '> МДФ <b>остаётся</b> в раскрое и присадке, фасад — отдельной строкой без этой панели</label></div>' +
				'<h4>Петли заказных фасадов</h4><div class="full"><label class="chk"><input type="checkbox" id="facHinges"' + chk(ec.facHinges) + '> Добавлять в смету (раздел «Фурнитура») и в заказ фурнитуры</label>' +
				'<div class="hint">Считаются все петли внутри блока: блоки со словом «петля» в названии и всё, что в них (ответная планка, заглушки, саморезы).</div></div></div>';
		}
		function facAddTyped(m) {
			var v = m.querySelector('#facNew'), t = v ? v.value.trim() : '';
			if (!t) return;
			if (t.charAt(0) !== '@') t = '@' + t;
			if (!facList.some(function (x) { return x.toLowerCase() === t.toLowerCase(); })) facList.push(t);
			v.value = '';
		}
		/* STHGroup: «Прайсы» — только свои прайсы заказа (работы, фасады, услуги, скидки, условия). Хранятся в книге заказов,
		   отмеченный получают новые заказы; заказ остаётся на своём прайсе. Изменения записываются сразу. */
		function tabELists() {
			var X = window.STHO, b = X && X.book, O = BM.sth;
			if (!b) { if (X && !X._plLoading) { X._plLoading = 1; X.load().then(function () { X._plLoading = 0; if (cur === 'eLists' && lastM) show(lastM); }); } return '<div class="eset"><p class="mute">Загрузка прайсов…</p></div>'; }
			var act = O.activePrice(b), used = {};
			b.orders.forEach(function (o) { if (!o.cat && o.priceId) used[o.priceId] = (used[o.priceId] || 0) + 1; });
			return '<div class="eset"><p class="mute">Ваши прайсы: работа за лист, мелкие детали, услуги, доп. работы и фасады, скидки и условия. Отмеченный прайс получают новые заказы, уже созданный заказ остаётся на своём. Прайсы лежат в файле заказов — общие для всех компьютеров с этой папкой.</p><div id="plList">' +
				O.prices(b).map(function (x) { var on = act && x.id === act.id; return '<div class="plrow' + (on ? ' on' : '') + '" data-id="' + esc(x.id) + '"><label class="chk"><input type="radio" name="plCur"' + chk(on) + '></label><b>' + esc(x.name) + '</b><span>заказов: ' + (used[x.id] || 0) + '</span><button data-a="open" class="primary">Открыть</button><button data-a="ren">Переименовать</button><button data-a="copy">Копия…</button><button data-a="del"' + (O.prices(b).length < 2 ? ' disabled' : '') + '>Удалить</button></div>'; }).join('') +
				'</div><div class="btns" style="margin-top:10px"><button id="plNew" class="primary">+ Новый прайс…</button><button id="plSave">Сохранить прайс в файл…</button><button id="plLoad">Загрузить прайс из файла…</button></div>' +
				'<p class="mute" style="margin-top:10px">«Открыть» — настройка цен прайса. Компания, папка заказов и нумерация — общие для всех прайсов, они в том же окне.</p></div>';
		}
		function tabEDef() {
			var pl = curPl();
			return '<div class="eset">' + plPick() + '<p class="mute">Цена, которую получает строка, пока вы не вписали свою. Плита — по виду материала (его программа узнаёт по названию и толщине), остальное — одна цена на раздел.</p>' +
				'<table class="grid"><thead><tr><th>Плитный материал</th><th class="r">за лист, руб.</th><th class="r">за кв.м, руб.</th></tr></thead><tbody>' +
				E.CLASSES.map(function (c) { return '<tr data-c="' + c[0] + '"><td>' + c[1] + '</td><td class="r"><input type="text" class="cv" value="' + nv(pl.cls[c[0]].val) + '"></td><td class="r"><input type="text" class="cm" value="' + nv(pl.cls[c[0]].m2) + '"></td></tr>'; }).join('') + '</tbody></table>' +
				'<table class="grid" style="margin-top:12px"><thead><tr><th>Остальное</th><th class="r">цена</th><th></th></tr></thead><tbody>' +
				E.DEFS.map(function (d) { return '<tr data-d="' + d[0] + '"><td>' + d[1] + '</td><td class="r"><input type="text" class="dv" value="' + nv(pl.def[d[0]]) + '"></td><td class="mute">' + d[2] + '</td></tr>'; }).join('') + '</tbody></table></div>';
		}
		function tabEProf() {
			var pl = curPl(), names = Object.keys(pl.PLEN).sort(P.natCmp);
			return '<div class="eset"><div class="form">' +
				'<label>Длины хлыстов, м</label><div><input type="text" class="w" id="eLens" value="' + ec.profLens.map(function (x) { return nv(x / 1000); }).join('; ') + '"> <span class="mute">— через точку с запятой</span></div>' +
				'<label>Если в названии длины нет</label><div><select id="eLenDef">' + ec.profLens.map(function (x) { return '<option value="' + x + '"' + (x === ec.profDef ? ' selected' : '') + '>' + E.lenTitle(x) + '</option>'; }).join('') + '</select></div>' +
				'<label>Погонный материал, м</label><div><input type="text" class="w" id="eLinLens" value="' + ec.linLens.map(function (x) { return nv(x / 1000); }).join('; ') + '"> <span class="mute">— длины столешниц и стеновых панелей</span></div>' +
				'<div class="hint">Длину хлыста программа читает из названия профиля: «L=3000», «3 м», «3000 мм». У строки сметы её можно сменить — или считать профиль погонными метрами. Погонный материал считается так же: штуками выбранной длины или метрами.</div></div>' +
				plPick().replace('margin:0 0 10px', 'margin:14px 0 8px') +
				(names.length ? '<div class="scroll"><table class="grid"><thead><tr><th>Профиль, у которого длина выбрана вручную</th><th>Считать</th><th></th></tr></thead><tbody>' +
					names.map(function (n) { return '<tr data-p="' + esc(n) + '"><td class="name">' + esc(n.replace(/^L:/, '')) + (/^L:/.test(n) ? ' <span class="mute">· погонный</span>' : '') + '</td><td>' + (pl.PLEN[n] > 0 ? 'хлыстами по ' + E.lenTitle(pl.PLEN[n]) : 'погонными метрами') + '</td><td><button class="link pdel">вернуть как в названии</button></td></tr>'; }).join('') + '</tbody></table></div>'
					: '<p class="mute">В этом прайсе нет профилей с длиной, выбранной вручную: все считаются по названию.</p>') + '</div>';
		}
		function xval(pl, x) { var mode = pl.XMODE[x.id] || 'sum', id = mode === 'sum' ? x.id : (x.id + (mode === 'sqm' ? ':Q' : ':P')), dk = String(x.id).toLowerCase(); return pl.P.hasOwnProperty(id) ? pl.P[id] : ((mode === 'sum' && pl.def.hasOwnProperty(dk)) ? pl.def[dk] : 0); }
		function tabEMk() {
			var pl = curPl();
			return '<div class="eset">' + plPick() + '<h4>Наценка в ценах, %</h4><div class="form">' +
				'<label>Материал</label><div><input type="text" class="s" id="eMkM" value="' + nv(pl.mk.M) + '"></div><label>Работы</label><div><input type="text" class="s" id="eMkW" value="' + nv(pl.mk.W) + '"></div><label>Фурнитура</label><div><input type="text" class="s" id="eMkF" value="' + nv(pl.mk.F) + '"></div>' +
				'<div class="hint">Наценка спрятана в ценах строк: в таблице вы вписываете свою цену, а в документах печатается цена уже с наценкой. Отдельной строкой она не показывается. Скидка, наоборот, идёт строкой перед ИТОГО и задаётся в самой смете.</div></div>' +
				'<h4>Строки раздела «Прочее»</h4><p class="mute">Эти строки есть в каждой смете с этим прайсом. Свои строки одного заказа (доставка, подъём) добавляются в самой смете — кнопкой «+ своя строка».</p>' +
				'<table class="grid" id="xTab"><thead><tr><th>Название</th><th>Считать</th><th class="r">Значение</th><th></th></tr></thead><tbody>' +
				pl.extra.map(function (x, i) { var mode = pl.XMODE[x.id] || 'sum'; return '<tr data-i="' + i + '"><td><input type="text" class="nm xname" value="' + esc(x.name) + '" maxlength="60"></td><td>' + sel('', [['sum', 'суммой, руб.'], ['sqm', 'за кв.м панелей, руб.'], ['pct', '% от материала, работ и фурнитуры']], mode).replace('<select id=""', '<select class="xmode"') + '</td><td class="r"><input type="text" class="xv" value="' + nv(xval(pl, x)) + '"></td><td><button class="icon xdel" title="Убрать строку">✕</button></td></tr>'; }).join('') +
				'</tbody></table><div class="btns" style="margin-top:8px"><button id="xAdd">Добавить строку</button></div></div>';
		}
		function tabEDoc() {
			return '<div class="eset"><div class="form">' +
				'<label>В шапке документов</label><div>' + (set.org || set.author ? esc([set.org, set.author ? 'составил ' + set.author : ''].filter(function (x) { return x; }).join(' · ')) : '<span class="mute">организация и «составил» не заданы</span>') + ' <button class="link" id="eOrgGo">изменить</button></div>' +
				'<div class="hint">Заказчик вписывается в самой смете и хранится в проекте.</div>' +
				'<label>Цены действительны, дней</label><div><input type="text" class="s" id="eValid" value="' + nv(ec.valid) + '"> <span class="mute">печатается в смете для заказчика; 0 — не печатать</span></div>' +
				'<label style="align-self:start;margin-top:4px">Примечание внизу сметы</label><textarea id="eNote" rows="3" maxlength="600" placeholder="Например: срок изготовления 14 рабочих дней; предоплата 70 %">' + esc(ec.note) + '</textarea>' +
				'<label>Сразу отмечать</label><div><label class="chk"><input type="checkbox" id="eDNoPrice"' + chk(ec.noPrice) + '> без цены</label>&emsp;<label class="chk"><input type="checkbox" id="eDTotals"' + chk(ec.totals) + '> только итоги разделов</label></div>' +
				'<label>Артикул</label><div><label class="chk"><input type="checkbox" id="eArtCol"' + chk(ec.artCol) + '> столбец «Артикул» в документах</label> <span class="mute">— печатается, если артикул есть хотя бы у одной строки</span></div>' +
				'<div class="hint">В таблице «Цены и количества» столбец есть всегда: артикул и наименование там можно вписать или поправить, они запоминаются в прайсе.</div>' +
				'</div><h4>Заказ материала: какая лента к какой плите</h4><p class="mute">Кромка в заказе материала приписывается к плите того же декора. Если плит одного декора несколько, лента идёт к той толщине, которой подходит по ширине.</p><div class="form" id="bandW">' +
				ec.bandW.map(function (b, i) { return '<label>' + (i === ec.bandW.length - 1 ? 'плита толще' : 'плита до ' + '<input type="text" class="s bt" value="' + nv(b[0]) + '"> мм') + '</label><div>лента <input type="text" class="s bw" value="' + nv(b[1]) + '"> мм</div>'; }).join('') +
				'</div><p class="mute" style="margin-top:10px">Документы сметы: смета для заказчика, полная смета, заказ материала и заказ фурнитуры — в PDF и Excel. Сохраняются кнопками PDF и Excel вверху окна или справа от сметы.</p></div>';
		}
		function askName(title, val0, extra) {
			return U.modal({ title: title, width: 440, body: '<div class="form"><label>Название</label><input type="text" id="aName" autofocus maxlength="40" value="' + esc(val0) + '">' + (extra || '') + '</div>',
				buttons: [{ label: 'Отмена', value: null }, { label: 'Готово', primary: true, run: function (mm) {
					var n = mm.querySelector('#aName').value.trim(), pc = mm.querySelector('#aPct');
					if (!n) { U.toast('Введите название прайса.'); return false; }
					return { name: n, pct: pc ? num(pc.value.replace('−', '-'), -90, 1000, 0) : 0 };
				} }] });
		}
		/* ---- обновления (2.1): у всех — проверка через GitHub; у автора — ключ подписи, ключ GitHub и выпуск ---- */
		var Upd = Dg.upd, upf = { tok: '', src: '' }, isAuthor = !!(S.boot && S.boot.edition === 'author'), isUser = !isAuthor && !(S.boot && S.boot.edition === 'tablet');
		function updWhen(ms) {
			if (!ms) return '';
			var d = new Date(ms), now = new Date(), t = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
			return (d.toDateString() === now.toDateString() ? 'сегодня' : d.toLocaleDateString('ru-RU')) + ' в ' + t;
		}
		function updRepoUrl(r) { return 'https://github.com/' + r + '/releases'; }
		/* STHGroup: обновления — у оболочки (GitHub, electron-updater) */
		/* STHGroup: «Папки и файлы» — где лежат база материалов, заказы, документы, скрипт БАЗИСа, данные программы; меняется сразу */
		function tabPathsSth() {
			var K = window.MatBase, X = window.STHO, row = function (id, label, val, hint, btns) {
				return '<label>' + label + '</label><div><div class="pathrow"><input type="text" id="' + id + '" value="' + esc(val || '') + '" readonly placeholder="не выбрано">' + btns + '</div>' + (hint ? '<div class="hint">' + hint + '</div>' : '') + '</div>';
			};
			return '<div class="form">' +
				row('pBase', 'База материалов (файл)', K && K.path, 'Один файл — все материалы, цены, ссылки, комплекты. Можно положить в общую папку (Яндекс Диск, сеть).', '<button data-pp="base">Выбрать…</button><button data-po="pBase">Папка</button>') +
				row('pOrders', 'Папка заказов', X ? X.folder() : (set.sthOrdersDir || ''), 'Здесь «STHGroup — заказы.json» и папки заказов «Заказы\\<номер клиент>» с моделями. По умолчанию — папка базы материалов.', '<button data-pp="orders">Выбрать…</button><button data-po="pOrders">Папка</button>') +
				row('pDocs', 'Документы (PDF, Excel)', set.sthDocsDir || '', 'Куда сохранять сметы, КП, счета, прайс. Пусто — КП и счёт в папку заказа, смета — рядом с моделью.', '<button data-pp="docs">Выбрать…</button><button data-pc="docs">Очистить</button><button data-po="pDocs">Папка</button>') +
				row('pScripts', 'Скрипт для БАЗИСа', set.sthScripts || '', 'Папка скриптов БАЗИС-Мебельщика: туда ставится STHGroup_Export (при каждом запуске программа его обновляет).', '<button data-pp="scripts">Выбрать и установить…</button><button data-po="pScripts">Папка</button>') +
				row('pData', 'Настройки программы', S.boot && S.boot.dataDir, 'Настройки, прайсы сметы, вход на сайты магазинов. Менять не нужно.', '<button data-po="pData">Папка</button>') + '</div>';
		}
		function tabCrmSth() { return window.STHCRM ? window.STHCRM.settingsHtml() : '<p class="mute">Модуль CRM не загружен.</p>'; } // STHGroup 2.0
		function tabUpdSth() {
			var us = Upd.state;
			return '<div class="form"><label>Версия</label><div style="display:flex;align-items:center;gap:10px"><b>' + esc(us.current || S.boot.version) + '</b>' +
				'<span class="mute" id="uLast">' + (us.checked ? 'проверено ' + esc(updWhen(us.checked)) + (us.seen ? ' · последняя ' + esc(us.seen) : '') : '') + '</span></div>' +
				'<label></label><div><button id="uCheckSth" class="primary">Проверить обновления</button></div>' +
				'<label>Через интернет</label><div><label class="chk"><input type="checkbox" id="uOnline"' + chk(set.updateOnline !== 0) + '> проверять обновления при запуске</label></div>' +
				'<div class="hint">Новые версии лежат на GitHub. Найденная версия скачивается сама, потом программа предложит перезапуститься; проекты и настройки сохранятся.</div>' +
				(us.problem ? '<div class="hint" style="color:var(--warn)">' + esc(us.problem) + '</div>' : '') + '</div>';
		}
		function tabUpd() {
			var us = Upd.state, pb = us.publisher, h;
			h = '<div class="form">' +
				'<label>Версия</label><div style="display:flex;align-items:center;gap:10px"><b>' + esc(us.current || S.boot.version) + '</b>' +
				'<span class="mute" id="uLast">' + (us.checked ? 'проверено ' + esc(updWhen(us.checked)) + (us.seen ? ' · последняя ' + esc(us.seen) : '') : '') + '</span><button id="uCheck">Проверить сейчас</button></div>' +
				'<label>Через интернет</label><div><label class="chk"><input type="checkbox" id="uOnline"' + chk(set.updateOnline !== 0) + '> проверять обновления при запуске</label></div>' +
				'<div class="hint">' + (us.hasKey ? 'Новые версии лежат на GitHub: <a href="#" id="uRepo">' + esc(updRepoUrl(us.repo)) + '</a>. Программа спрашивает их не чаще раза в три часа и предлагает установить. Каждая версия подписана автором — чужой файл программа не поставит.'
					: 'В этой установке нет доступа к обновлениям: скачайте установщик со страницы выпусков на GitHub и поставьте его поверх — дальше программа будет обновляться сама.') + '</div>' +
				(us.problem ? '<div class="hint" id="uProblem" style="color:var(--warn)">' + esc(us.problem) + '</div>' : '') + '</div>';
			if (pb) {
				h += '<h4>Выпуск обновлений <span class="mute" style="font-weight:400">— эта часть есть только у вас</span></h4><div class="form">' +
					'<label>Репозиторий GitHub</label><div><input type="text" id="uRepoIn" autocomplete="off" spellcheck="false" value="' + esc(pb.repo) + '" placeholder="владелец/имя"></div>' +
					'<div class="hint">Открытый репозиторий только для выпусков, с файлом README. Программы людей скачивают обновления отсюда — без пароля. Репозиторий зашит в установщик: сменили его — новые версии придут только тем, кто поставит новый установщик.</div>' +
					'<label>Ключ доступа GitHub</label><div class="pathrow"><input type="password" id="uTok" autocomplete="new-password" spellcheck="false" value="' + esc(upf.tok) + '" placeholder="' + (pb.hasToken ? 'ключ сохранён — вставьте новый, чтобы заменить' : 'github_pat_…') + '"><button id="uGhSave">Сохранить и проверить</button></div>' +
					'<div class="hint">GitHub → Settings → Developer settings → Fine-grained tokens → Generate new token: только этот репозиторий, право «Contents: Read and write». Ключ хранится только на этом компьютере и никуда, кроме GitHub, не уходит.</div>' +
					'<div class="hint" id="uGhRes"' + (upf.gh ? ' style="color:var(--' + (upf.gh.ok ? 'accent' : 'warn') + ')"' : ' hidden') + '>' + esc(upf.gh ? upf.gh.text : '') + '</div></div>' +
					'<div class="btns" style="margin-top:12px"><button id="uRelease" class="primary">Выпустить обновление…</button><button id="uBackup">Сохранить копию ключа подписи…</button></div>' +
					'<p class="mute" style="margin-top:8px">Выпуск сам загружается на GitHub: установщик (в него вкладываются ключ отзывов, адрес ящика-счётчика и доступ к обновлениям) и подписанное описание. Этот же установщик люди скачивают для первой установки. Ключ подписи лежит только на этом компьютере — сохраните копию: без неё после переустановки Windows выпускать обновления будет нельзя.</p>';
			} else {
				h += '<p class="mute" style="margin-top:14px">Автору программы: <button id="uPubRestore" class="link">восстановить ключ подписи из копии…</button> · <button id="uPubInit" class="link">создать ключ подписи</button></p>';
			}
			return h;
		}
		function updRelease(m) {
			var pb = Upd.state.publisher, rel = { src: '' };
			return U.modal({ title: 'Выпустить обновление', width: 620,
				body: '<div class="form"><label>Установщик</label><div class="pathrow"><input type="text" id="urSrc" readonly placeholder="STHGroup-Setup.exe новой версии"><button id="urSrcPick">Выбрать…</button></div>' +
					'<label>Версия</label><div><input type="text" id="urVer" class="s" style="width:110px" placeholder="2.1.0" autocomplete="off"></div>' +
					'<label style="align-self:start;margin-top:5px">Что нового</label><textarea id="urNotes" rows="4" maxlength="2000" placeholder="Это увидят люди в окне «Новая версия»"></textarea>' +
					'<label>Копия для раздачи</label><div><label class="chk"><input type="checkbox" id="urCopy"' + (pb.outDir ? ' checked' : '') + '> сохранить готовый установщик ещё и на этот компьютер</label></div>' +
					'<div class="hint">Программа вложит в установщик ключ отзывов, адрес ящика-счётчика и доступ к обновлениям, подпишет описание и загрузит оба файла в новый выпуск на GitHub (' + esc(pb.repo) + '). Если такая версия уже выпущена — её файлы заменятся.</div></div>',
				onOpen: function (mm) {
					var q = function (id) { return mm.querySelector('#' + id); };
					q('urSrcPick').onclick = async function () {
						var pth = await U.pick({ kind: 'open', title: 'Установщик новой версии — STHGroup-Setup.exe', dir: upf.src ? U.dirOf(upf.src) : S.boot.docs, filters: [{ name: 'Установщик STHGroup', ext: ['exe'] }] });
						if (!pth) return;
						upf.src = rel.src = pth; q('urSrc').value = pth;
						try { var pk = await U.api.upd.pub.peek(pth); if (pk.version && !q('urVer').value.trim()) q('urVer').value = pk.version; if (pk.notes && !q('urNotes').value.trim()) q('urNotes').value = pk.notes; } catch (e) { /* файла версии рядом нет — впишут руками */ }
					};
				},
				buttons: [{ label: 'Отмена', value: null }, { label: 'Выпустить на GitHub', primary: true, run: async function (mm) {
					var q = function (id) { return mm.querySelector('#' + id); }, btn = mm.querySelector('.foot .primary'), ver = q('urVer').value.trim(), dst = '';
					if (!rel.src) { U.toast('Выберите установщик новой версии — STHGroup-Setup.exe.'); return false; }
					if (!pb.hasToken) { U.toast('Сначала сохраните ключ доступа GitHub на вкладке «Обновления».'); return false; }
					if (q('urCopy').checked) {
						dst = await U.pick({ kind: 'save', title: 'Копия установщика для раздачи', dir: pb.outDir || U.dirOf(rel.src), name: 'STHGroup-Setup-' + ver + '.exe', filters: [{ name: 'Установщик', ext: ['exe'] }] });
						if (!dst) return false;
					}
					btn.disabled = true; btn.textContent = 'Загружаю на GitHub…';
					try {
						var r = await U.api.upd.pub.release({ src: rel.src, version: ver, notes: q('urNotes').value.trim(), dst: dst || '' });
						U.toast('Версия ' + ver + ' выпущена на GitHub — программы предложат её сами.' + (r.feedback ? '' : ' Отзывов в установщике нет: настройте почту на вкладке «Отзывы».') + (r.feedback && !r.pings ? ' Отметок нет: укажите ящик-счётчик на вкладке «Пользователи».' : '') + (r.copyErr ? ' Копию сохранить не удалось: ' + r.copyErr : ''),
							{ ms: 20000, actions: [{ label: 'Открыть выпуск', run: function () { U.api.openUrl(r.url).catch(U.error); } }].concat(r.copy ? [{ label: 'Папка', run: function () { U.api.open(U.dirOf(r.copy)).catch(U.error); } }] : []) });
						return r;
					} finally { if (btn.isConnected) { btn.disabled = false; btn.textContent = 'Выпустить на GitHub'; } }
				} }] });
		}
		/* ---- регистрация (2.1): у человека — код установки и ключ; у автора — выдача ключей ---- */
		var rg = { state: null, list: null, made: null };
		function tabReg() {
			var s = rg.state;
			if (!s) return '<p class="mute">Читаю…</p>';
			return '<div class="form">' +
				'<label>Состояние</label><div id="rgState">' + (s.registered ? '<b style="color:var(--accent)">✓ Зарегистрирована</b> на «' + esc(s.name) + '»' + (s.until ? ' · до ' + esc(s.until.split('-').reverse().join('.')) + (s.expired ? ' <span style="color:var(--warn)">(срок прошёл)</span>' : '') : ' · бессрочно') : '<span class="mute">не зарегистрирована — программа работает полностью</span>') + '</div>' +
				'<label>Код установки</label><div class="pathrow"><input type="text" id="rgCode" readonly value="' + esc(s.code) + '" style="font-family:Consolas,monospace;letter-spacing:.5px"><button id="rgCopy">Скопировать</button></div>' +
				'<div class="hint">Пришлите этот код автору программы — он пришлёт ключ регистрации. Код — случайный номер этой установки, по нему нельзя узнать ни вас, ни компьютер.</div>' +
				'<label>Ключ регистрации</label><div class="pathrow"><input type="text" id="rgKey" autocomplete="off" spellcheck="false" placeholder="BRK1.…"><button id="rgSave">Ввести ключ</button></div>' +
				(s.canCheck ? '' : '<div class="hint" style="color:var(--warn)">В этой установке нет ключа автора, чтобы проверить ключ регистрации: скачайте установщик со страницы выпусков на GitHub и поставьте его поверх.</div>') +
				(s.registered ? '<label></label><div><button id="rgClear" class="link">Убрать регистрацию с этого компьютера</button></div>' : '') + '</div>';
		}
		function tabRegs() {
			var l = rg.list;
			return '<p class="mute">Человек присылает код установки из «Настройки → Общие → Регистрация». Ключ подписан вашим ключом подписи и подходит только к этой установке. Пока регистрация — для учёта: без ключа программа работает полностью; срок — задел на подписку.</p><div class="form">' +
				'<label>Код установки</label><div><input type="text" id="rgICode" autocomplete="off" spellcheck="false" placeholder="BR-XXXX-XXXX-XXXX-XXXX" style="font-family:Consolas,monospace"></div>' +
				'<label>На кого</label><div><input type="text" id="rgIName" maxlength="60" placeholder="имя или название мастерской"></div>' +
				'<label>Срок</label><div><label class="chk"><input type="radio" name="rgIU" value="" checked> бессрочно</label>&emsp;<label class="chk"><input type="radio" name="rgIU" value="d"> до</label> <input type="date" id="rgIUntil"></div>' +
				'<label>Заметка</label><div><input type="text" id="rgINote" maxlength="60" placeholder="по желанию: откуда человек, как связаться"></div>' +
				'<label></label><div class="btns" style="margin:0"><button id="rgIssue" class="primary">Сделать ключ</button></div>' +
				(rg.made ? '<label>Ключ для ' + esc(rg.made.code) + '</label><div class="pathrow"><input type="text" id="rgMade" readonly value="' + esc(rg.made.key) + '"><button id="rgMadeCopy">Скопировать</button></div><div class="hint">Отправьте ключ человеку: он вставит его в «Настройки → Общие → Регистрация».</div>' : '') + '</div>' +
				'<h4>Выданные ключи</h4>' + (l === null ? '<p class="mute">Читаю…</p>' : (l.length ? '<div class="uScroll"><table class="grid" id="rgList"><thead><tr><th>Кому</th><th>Код</th><th>Срок</th><th>Выдан</th><th>Заметка</th><th></th></tr></thead><tbody>' +
					l.slice().reverse().map(function (x, i) { return '<tr><td class="name">' + esc(x.name) + '</td><td style="font-family:Consolas,monospace">' + esc(x.code) + '</td><td>' + (x.until ? esc(x.until.split('-').reverse().join('.')) : 'бессрочно') + '</td><td>' + esc(x.issued.split('-').reverse().join('.')) + '</td><td>' + esc(x.note || '') + '</td><td><button class="link" data-rgk="' + (l.length - 1 - i) + '">ключ</button></td></tr>'; }).join('') + '</tbody></table></div>' : '<p class="mute">Ключей ещё не выдавали.</p>'));
		}
		/* ---- отзывы: ящик-отправитель, пароль приложения, куда слать, установщик для раздачи. Видит только автор ---- */
		var Fb = window.Feedback, MAIL_RE = Fb.MAIL_RE, fbf = { from: Fb.state.from || '', pass: '', to: Fb.state.to || '', src: '', tested: '', seen: false };
		/* почта ящика-отправителя по его адресу: имя и где взять пароль приложения (то же, что знает программа при отправке) */
		var FB_PROV = [
			[/@(yandex\.(ru|com|by|kz)|ya\.ru|narod\.ru)$/i, 'Яндекс', 'Не пароль от ящика, а отдельный: Яндекс ID → Безопасность → Пароли приложений → Почта. В настройках ящика включите «Почтовые программы».'],
			[/@(mail|bk|inbox|list|internet|xmail)\.ru$/i, 'Mail.ru', 'Не пароль от ящика, а отдельный: Почта → Настройки → Все настройки → Безопасность → Пароли для внешних приложений (хватит доступа «Только отправка писем»).'],
			[/@(gmail|googlemail)\.com$/i, 'Gmail', 'Не пароль от аккаунта, а отдельный: включите в аккаунте Google двухэтапную аутентификацию, потом создайте пароль на myaccount.google.com/apppasswords.']
		];
		function fbProv(addr) { addr = String(addr || '').trim(); for (var i = 0; i < FB_PROV.length; i++) if (FB_PROV[i][0].test(addr)) return FB_PROV[i]; return null; }
		function fbPassHint(addr) {
			var p = fbProv(addr);
			if (p) return p[1] + '. ' + p[2];
			return MAIL_RE.test(String(addr || '').trim()) ? 'Через такую почту программа отправлять не умеет: нужен ящик на Mail.ru, Gmail или Яндексе.' : 'Не пароль от ящика, а отдельный пароль приложения: его выдаёт почта в настройках безопасности.';
		}
		function tabFb() {
			var has = Fb.state.hasPass;
			fbf.seen = true;
			return '<p class="mute">Отзывы пользователей приходят вам на почту. Программа отправляет письма через отдельный ящик на Mail.ru, Gmail или Яндексе. У пользователей этой вкладки нет.</p><div class="form">' +
				'<label>Ящик-отправитель</label><div><input type="text" id="fbFrom" class="fbAddr" autocomplete="off" spellcheck="false" value="' + esc(fbf.from) + '" placeholder="например, otzyvy-bazisreborn@gmail.com"></div>' +
				'<div class="hint">Отдельный ящик на Mail.ru, Gmail или Яндексе, заведённый только под отзывы. Не основная почта. Почтовый сервер программа выбирает по адресу.</div>' +
				'<label>Пароль приложения</label><div class="pathrow"><input type="password" id="fbPass" class="fbAddr" autocomplete="new-password" spellcheck="false" value="' + esc(fbf.pass) + '" placeholder="' + (has ? 'пароль сохранён — введите новый, чтобы заменить' : 'пароль приложения') + '"><button id="fbShow">Показать</button></div>' +
				'<div class="hint" id="fbPassHint">' + esc(fbPassHint(fbf.from)) + '</div>' +
				'<label>Куда присылать</label><div><input type="text" id="fbTo" class="fbAddr" autocomplete="off" spellcheck="false" value="' + esc(fbf.to) + '" placeholder="ваша почта"></div>' +
				'<div class="hint">Ваша основная почта. Первое письмо может попасть в «Спам» — отметьте его «Не спам».</div>' +
				'<label>Проверка</label><div class="btns" style="margin:0"><button id="fbTest">Отправить пробное письмо</button><span id="fbTestRes" class="fbkOk">' + esc(fbf.tested) + '</span></div>' +
				'<h4>Установщик для раздачи</h4><div class="full mute">Обычно не нужен: «Выпустить обновление» на вкладке «Обновления» сам кладёт такой установщик на GitHub. Здесь его можно сделать на компьютер — чтобы передать файлом. В STHGroup-Setup.exe вкладываются ключ отзывов, доступ к обновлениям и адрес ящика-счётчика (если он указан на вкладке «Пользователи»). Пароль ящика-отправителя из установщика можно достать — установщик лежит в открытом доступе, поэтому ящик-отправитель должен быть отдельным, только под отзывы.</div>' +
				'<label>Установщик</label><div class="pathrow"><input type="text" id="fbSrc" readonly value="' + esc(fbf.src) + '" placeholder="STHGroup-Setup.exe"><button id="fbSrcPick">Выбрать…</button></div>' +
				'<label></label><div class="btns" style="margin:0"><button id="fbMake">Сделать установщик для раздачи…</button><button id="fbPeek">Проверить установщик…</button>' + (has ? '<button id="fbOff" class="link">Отключить отзывы на этом компьютере</button>' : '') + '</div>' +
				(fbf.made ? '<label></label><div class="note' + (fbf.made.updates && fbf.made.pings ? '' : ' warn') + '" id="fbMade" style="margin:0"><b>Готов: ' + esc(U.baseOf(fbf.made.path)) + '</b>' + setupParts(fbf.made) +
					(fbf.made.updates && fbf.made.pings ? '<div style="color:var(--text)">Раздавайте именно этот файл, а не исходный ' + esc(U.baseOf(fbf.made.src)) + '.</div>' : '') + '</div>' : '') +
				'</div>';
		}
		/* что вложено в установщик — одной строкой: отзывы, обновления, отметки */
		function setupParts(x) {
			var one = function (on, yes, no) { return '<span style="color:var(--' + (on ? 'accent' : 'warn') + ')">' + (on ? '✓ ' + yes : '✕ ' + no) + '</span>'; };
			return '<div class="fbParts" style="display:flex;gap:14px;flex-wrap:wrap;margin-top:3px">' + one(x.feedback !== false, 'отзывы', 'отзывов нет') + one(x.updates, 'обновления', 'обновлений нет') + one(x.pings, 'отметки для счётчика', 'отметок нет') + '</div>';
		}
		/* Окно «что в этом установщике»: какая сборка и что вложено — чтобы не раздать не тот файл. */
		async function setupPeek(path) {
			var r = await U.api.fb.peek(path), lines = [], verdict, bad = true;
			var row = function (k, v, cls) { lines.push('<label>' + k + '</label><div' + (cls ? ' style="color:var(--' + cls + ')"' : '') + '>' + v + '</div>'); };
			if (!r.setup) verdict = 'Это не установщик STHGroup.';
			else {
				row('Сборка', r.edition === 'full' ? 'STHGroup 1.10 и новее' : (r.edition === 'test' ? 'прежняя тестовая версия' : 'версия до 1.10'), r.edition === 'full' ? '' : 'warn');
				row('Отзывы', r.feedback ? (r.feedbackMine ? '✓ есть, с нынешними настройками почты' : (r.feedbackSaved ? '✓ есть, но с другими настройками почты, чем сохранены в программе' : '✓ есть')) : '✕ нет', r.feedback ? (r.feedbackMine || !r.feedbackSaved ? 'accent' : 'warn') : 'warn');
				row('Обновления', r.updates ? (r.updatesNow ? '✓ есть, доступ действует' : '✓ есть, но прежний: сменились репозиторий или ключ подписи — новых версий такая установка не получит') : '✕ нет — программа не будет обновляться сама', r.updates && r.updatesNow ? 'accent' : 'warn');
				row('Отметки', r.pings ? (r.pingsMine ? '✓ есть, на нынешний ящик-счётчик' : '✓ есть, но на другой ящик-счётчик, чем сейчас в программе') : '✕ нет — счётчик такие установки не увидит', r.pings && r.pingsMine ? 'accent' : 'warn');
				if (r.edition === 'test') verdict = 'Это установщик прежней тестовой версии — раздавать его больше не нужно.';
				else if (r.edition !== 'full') verdict = 'Этот установщик выпущен до версии 1.10.';
				else if (!r.feedback && !r.updates) verdict = 'Это исходный установщик: в него ничего не вложено. Раздаётся не он, а установщик из выпуска на GitHub (или сделанный кнопкой «Сделать установщик для раздачи»).';
				else if (!r.updates || !r.updatesNow) verdict = 'Люди с этим установщиком не получат обновлений. Выпустите обновление заново и раздавайте установщик из нового выпуска.';
				else if (!r.feedback || !r.pings) verdict = 'Обновления в установщике есть, но вложено не всё — см. выше.';
				else { verdict = 'Этот файл можно раздавать.'; bad = false; }
			}
			await U.modal({ title: 'Что в установщике', width: 560, cls: 'fbPeek', body: '<p><b>' + esc(r.name) + '</b> <span class="mute">· ' + (r.size / 1048576).toFixed(1).replace('.', ',') + ' МБ</span></p>' +
				(lines.length ? '<div class="form">' + lines.join('') + '</div>' : '') + '<div class="note' + (bad ? ' warn' : '') + '" id="fbPeekVerdict" style="margin-top:12px">' + esc(verdict) + '</div>',
				buttons: [{ label: 'Понятно', value: true, primary: true }] });
		}
		/* ---- пользователи: счётчик установок. Отметки приходят письмами на ящик-счётчик; программа читает его по кнопке ---- */
		var tst = { state: null, addr: null, pass: '', seen: false, loading: false };
		var TST_SECS = [['model', 'Модель'], ['cut', 'Раскрой'], ['detail', 'Деталировка'], ['drill', 'Присадка'], ['asm', 'Сборка'], ['est', 'Смета']];
		function tstDate(day) { return new Date(day + 'T12:00:00'); }
		function tstDM(day) { return day.substring(8, 10) + '.' + day.substring(5, 7); }
		function tstAgo(day, today) {
			var n = Math.round((tstDate(today) - tstDate(day)) / 86400000);
			return n <= 0 ? 'сегодня' : (n === 1 ? 'вчера' : n + ' ' + A.plural(n, 'день', 'дня', 'дней') + ' назад');
		}
		function tstBar(name, v, max) { return '<div class="tBar"><span>' + esc(name) + '</span><div><i style="width:' + (max ? Math.round(v / max * 100) : 0) + '%"></i></div><b>' + v + '</b></div>'; }
		function tstName(x) { return x.name ? esc(x.name) : '<span class="mute">без имени · ' + esc(x.id.substring(0, 4).toUpperCase()) + '</span>'; }
		function tabTst() {
			tst.seen = true;
			var s = tst.state;
			if (!s) return '<p class="mute">Читаю сохранённые отметки…</p>';
			var list = s.installs, n = list.length, addr = tst.addr === null ? (s.addr || '') : tst.addr, h, i;
			h = '<div class="uHead" style="margin-top:0"><b id="tCount">' + n + ' ' + A.plural(n, 'установка', 'установки', 'установок') + '</b><span class="mute" id="tLast">' + (s.checked ? 'проверено ' + esc(updWhen(s.checked)) : 'ящик ещё не читали') + '</span><div class="grow"></div><button id="tRefresh">Обновить</button></div>';
			if (n) {
				h += '<div class="uScroll"><table class="grid" id="tList"><thead><tr><th>Установка</th><th>Регистрация</th><th>Версия</th><th>Windows</th><th>Первый запуск</th><th>Последний запуск</th></tr></thead><tbody>' +
					list.map(function (x) { return '<tr><td class="name">' + tstName(x) + '</td><td>' + (x.reg ? '✓ ' + esc(x.reg) : '<span class="mute">нет</span>') + '</td><td>' + esc(x.app) + '</td><td>' + esc(x.os) + '</td><td>' + esc(tstDM(x.first)) + '</td><td>' + esc(tstAgo(x.last, s.today)) + '</td></tr>'; }).join('') + '</tbody></table></div>';
				/* версии — новые сверху; разделы — в порядке полосы разделов окна */
				var vers = {}, vl = [], secs = {}, per = [], top = 0, d0 = tstDate(s.today);
				list.forEach(function (x) { if (!vers[x.app]) { vers[x.app] = 0; vl.push(x.app); } vers[x.app]++; TST_SECS.forEach(function (t) { if (x.secs && x.secs[t[0]]) secs[t[0]] = (secs[t[0]] || 0) + 1; }); });
				vl.sort(function (a, b) { var pa = a.split('.'), pb = b.split('.'); for (var k = 0; k < 4; k++) { var dd = (Number(pb[k]) || 0) - (Number(pa[k]) || 0); if (dd) return dd; } return 0; });
				h += '<div class="tCols"><div id="tVers"><div class="sec">Версии</div>' + vl.map(function (v) { return tstBar(v, vers[v], n); }).join('') + '</div>' +
					'<div id="tSecs"><div class="sec">Разделы</div>' + TST_SECS.map(function (t) { return tstBar(t[1], secs[t[0]] || 0, n); }).join('') + '</div></div>';
				/* сколько установок работало в каждый из последних 30 дней */
				for (i = 29; i >= 0; i--) {
					var dt = new Date(d0.getTime() - i * 86400000), key = dt.getFullYear() + '-' + ('0' + (dt.getMonth() + 1)).slice(-2) + '-' + ('0' + dt.getDate()).slice(-2), c = 0;
					list.forEach(function (x) { if ((x.days || []).indexOf(key) >= 0) c++; });
					per.push([key, c]); top = Math.max(top, c);
				}
				h += '<div class="sec">Работали по дням, 30 дней</div><div class="tChart" id="tChart">' + per.map(function (q, k) { return '<i' + (k >= 23 ? ' class="w"' : '') + ' style="height:' + (top ? Math.round(q[1] / top * 100) : 0) + '%" title="' + tstDM(q[0]) + ' — ' + q[1] + '"></i>'; }).join('') + '</div>' +
					'<div class="tAxis"><span>' + esc(tstDate(per[0][0]).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })) + '</span><span>сегодня — ' + per[29][1] + '</span></div>';
			} else h += '<p class="mute">Отметок пока нет. Программа у каждого присылает отметку раз в день; «Обновить» читает ящик-счётчик.</p>';
			h += '<h4>Ящик-счётчик</h4><div class="form">' +
				'<label>Адрес</label><div><input type="text" id="tAddr" class="fbAddr" autocomplete="off" spellcheck="false" value="' + esc(addr) + '" placeholder="например, schet-bazisreborn@mail.ru"></div>' +
				'<div class="hint">Отдельный ящик на Mail.ru, Gmail или Яндексе — не ящик-отправитель отзывов и не основная почта. На него программа у каждого раз в день шлёт отметку. Адрес вкладывается в установщик при выпуске.</div>' +
				'<label>Пароль приложения</label><div class="pathrow"><input type="password" id="tPass" class="fbAddr" autocomplete="new-password" spellcheck="false" value="' + esc(tst.pass) + '" placeholder="' + (s.hasPass ? 'пароль сохранён — введите новый, чтобы заменить' : 'пароль приложения, которым можно читать почту') + '"><button id="tShow">Показать</button></div>' +
				'<div class="hint">Пароль приложения с правом читать почту. Он хранится только на этом компьютере и в установщик не попадает. Ящик читается только по кнопке «Обновить»; прочитанные отметки программа из него удаляет.</div></div>';
			return h;
		}
		/* записать адрес и пароль ящика-счётчика, если их меняли на вкладке */
		async function tstSave() {
			if (!tst.seen || !tst.state) return;
			var was = tst.state.addr || '', addr = tst.addr === null ? was : tst.addr;
			if (addr === was && !tst.pass) return;
			tst.state = addr ? await U.api.testers.config({ addr: addr, pass: tst.pass }) : await U.api.testers.config({ clear: true });
			tst.addr = null; tst.pass = '';
		}
		/* разделы слева, у каждого свои вкладки */
		var SECS = [
			{ id: 'gen', name: 'Общие', tabs: [['look', 'Оформление', tabLook], ['app', 'Программа', tabApp]] },
			{ id: 'model', name: 'Модель', tabs: [['mView', 'Вид и положение', tabMView]] },
			{ id: 'cut', name: 'Раскрой', tabs: [['cgen', 'Общие', csTab('cgen')], ['ccrit', 'Критерии', csTab('ccrit')], ['cori', 'Ориентация', csTab('cori')], ['clook', 'Оформление', csTab('clook')], ['clist', 'Списки', csTab('clist')], ['cadv', 'Дополнительно', csTab('cadv')], ['fmt', 'Форматы листов', tabFmt], ['cpdf', 'PDF', tabCutPdf], ['dxf', 'DXF', tabDxf]] },
			{ id: 'est', name: 'Смета', tabs: [['eCalc', 'Расчёт', tabECalc], ['eFac', 'Заказные фасады', tabEFac], ['eLists', 'Прайсы', tabELists], ['eDef', 'Цены по умолчанию', tabEDef], ['eProf', 'Профили', tabEProf], ['eMk', 'Наценка и прочее', tabEMk], ['eDoc', 'Документы', tabEDoc]] }
		], NAV = ['gen', 'model', 'cut', 'est'];      // порядок слева — как в полосе разделов окна
		var isTab = !!(S.boot && S.boot.edition === 'tablet');           // на планшете — без почты, тестеров и обновлений: они работают только на компьютере
		if (!Fb.state.tester && isAuthor && !isTab) { SECS[0].tabs.push(['fb', 'Отзывы', tabFb]); SECS[0].tabs.push(['tst', 'Пользователи', tabTst]); SECS[0].tabs.push(['regs', 'Ключи регистрации', tabRegs]); }
		var isSth = !!(S.boot && S.boot.edition === 'sth');             // STHGroup: обновления — у оболочки, регистрации нет
		if (!isTab && !isSth) SECS[0].tabs.push(['upd', 'Обновления', tabUpd]);
		if (isSth) SECS[0].tabs.push(['crm', 'CRM', tabCrmSth]); // STHGroup 2.0
		if (isSth) SECS[0].tabs.push(['paths', 'Папки и файлы', tabPathsSth]);
		if (isSth) SECS[0].tabs.push(['upd', 'Обновления', tabUpdSth]);   // STHGroup: своя вкладка — версия и «Проверить обновления»
		if (isUser && !isSth) SECS[0].tabs.push(['reg', 'Регистрация', tabReg]);
		function secOf(t) { for (var i = 0; i < SECS.length; i++) for (var j = 0; j < SECS[i].tabs.length; j++) if (SECS[i].tabs[j][0] === t) return SECS[i]; return null; }
		var cur = (tab && secOf(tab)) ? tab : isSth ? 'look' : (S.section === 'drill' ? 'dDraw' : S.section === 'detail' ? 'kDraw' : (S.section === 'est' ? 'eCalc' : (S.section === 'model' ? 'mView' : 'cgen'))), mine = false, last = {};

		function read(m) {
			/* запомнить то, что введено на открытой вкладке */
			var g = function (id) { return m.querySelector('#' + id); };
			if (cur === 'crm' && g('crmAuto') && m._sthCrmAuto !== undefined) m._sthCrmAuto = g('crmAuto').checked; // STHGroup
			if (CutSet.has(cur)) {
				CutSet.read(cur, m, p, set);
			} else if (cur === 'look') {
				set.theme = g('sTheme').value; set.sthDensity = g('sDensity').value; if (g('sOrderView')) { set.sthOrderView = g('sOrderView').value; if (window.STHO) window.STHO.view = set.sthOrderView; } set.anim = g('sAnim').checked ? 1 : 0; set.sound = g('sSound').checked ? 1 : 0; set.org = g('sOrg').value.trim(); set.author = g('sAuthor').value.trim(); set.phone = g('sPhone').value.trim();
			} else if (cur === 'cpdf') {
				var cp = set.pdf;
				cp.color = Number(g('cColor').value) ? 1 : 0; cp.big = Number(g('cBig').value) ? 1 : 0; cp.summary = g('cSum').checked ? 1 : 0; cp.maps = g('cMaps').checked ? 1 : 0; cp.list = g('cList').checked ? 1 : 0; cp.offcuts = g('cOff').checked ? 1 : 0;
				if (!cp.summary && !cp.maps && !cp.list && !cp.offcuts) cp.maps = 1;
			} else if (cur === 'mView') {
				var AX = { '': 1, x: 1, '-x': 1, y: 1, '-y': 1, z: 1, '-z': 1 };
				mc.style = BM.v3d.STYLES[g('mvStyle').value] ? g('mvStyle').value : mc.style; mc.look = g('mvLook').value === 'shine' ? 'shine' : 'plain'; mc.quality = g('mvQuality').value === 'normal' ? 'normal' : 'high'; mc.hintSeen = g('mvHint').checked ? 0 : 99; mc.outline = g('mvOutline').checked ? 1 : 0; mc.holes = g('mvHoles').checked ? 1 : 0; mc.band = g('mvBand').checked ? 1 : 0; mc.grooves = g('mvGrooves').checked ? 1 : 0;
				mc.up = AX[g('mvUp').value] ? g('mvUp').value : ''; mc.front = AX[g('mvFront').value] ? g('mvFront').value : ''; mc.zmode = [-1, 0, 1, 2].indexOf(Number(g('mvZ').value)) >= 0 ? Number(g('mvZ').value) : -1;
				if (mc.up && mc.front && mc.up.replace('-', '') === mc.front.replace('-', '')) mc.front = '';
				mc.glowW = g('mvGlowW').value.trim(); mc.glowLed = g('mvGlowLed').value.trim(); mc.glowProf = g('mvGlowProf').value.trim(); mc.glowSh = ['0', '4', 'all'].indexOf(g('mvGlowSh').value) >= 0 ? g('mvGlowSh').value : '4';       // верх и лицо не могут идти по одной оси
			} else if (cur === 'dDraw') {
				dc.mode = Dr.MODES[g('qMode').value] ? g('qMode').value : dc.mode; dc.cap = Math.round(num(g('qCap').value, 1.5, 4, dc.cap) * 10) / 10; dc.gMark = g('qGMark').value === 'numsym' ? 'numsym' : 'num';
				dc.minMark = Math.round(num(g('qMin').value, 0.8, 4, dc.minMark) * 10) / 10; dc.color = g('qColor').checked ? 1 : 0; dc.guides = g('qGuides').checked ? 1 : 0; dc.rows = g('qRows').checked ? 1 : 0; dc.key = g('qKey').checked ? 1 : 0; dc.ends = g('qEnds').checked ? 1 : 0; dc.pic = g('qPic').checked ? 1 : 0;
			} else if (cur === 'kDraw') {
				kc.style = BM.detail.STYLES[g('kStyleS').value] ? g('kStyleS').value : kc.style; kc.dims = g('kDims').checked ? 1 : 0; kc.edge = g('kEdge').checked ? 1 : 0; kc.holes = g('kHoles').checked ? 1 : 0; kc.pic = g('kPic').checked ? 1 : 0; kc.info = g('kInfo').checked ? 1 : 0; kc.callouts = g('kCall').checked ? 1 : 0;
			} else if (cur === 'dTab') {
				dc.fast = g('qFast').checked ? 1 : 0; dc.cap2 = Math.round(num(g('qCap2').value, 1.5, 4, dc.cap2) * 10) / 10; dc.exRead = g('qRead').checked ? 1 : 0; dc.exInfo = g('qInfo').checked ? 1 : 0;
			} else if (cur === 'dPdf') {
				dc.multi = Number(g('qMulti').value) ? 1 : 0; dc.text = g('qText').value.replace(/\s+/g, ' ').replace(/^ | $/g, '');
			} else if (cur === 'dBase') {
				dc.baseDef = Math.round(num(g('qBase').value, 0, 3, 0)); dc.thru = g('qThru').value === 'A' ? 'A' : 'more';
			} else if (cur === 'fmt') {
				var out = [];
				m.querySelectorAll('#fmtList [data-i]').forEach(function (r) { var L = Math.round(num(r.querySelector('.fl').value, 0, 9999, 0)), W = Math.round(num(r.querySelector('.fw').value, 0, 9999, 0)); if (L >= 300 && W >= 200) out.push([Math.max(L, W), Math.min(L, W)]); });
				if (out.length) set.formats = out;
			} else if (cur === 'dxf') {
				var q = prof();
				q.name = g('xName').value.trim() || q.name;
				['outer', 'inner', 'label', 'drill', 'groove', 'sheet'].forEach(function (k) { var v = g('x' + k).value.trim().replace(/[^A-Za-z0-9_\-$]/g, '_'); if (v) q[k] = v; });
				['useInner', 'useLabel', 'useDrill', 'useGroove', 'useSheet'].forEach(function (k) { q[k] = g('x' + k).checked ? 1 : 0; });
				q.labelWhat = g('xWhat').value; q.textH = num(g('xTextH').value, 3, 200, q.textH); q.drillByDia = g('xByDia').checked ? 1 : 0; q.arcs = g('xArcs').checked ? 1 : 0; q.margin = g('xMargin').checked ? 1 : 0; q.enc = g('xEnc').value;
			} else if (cur === 'eCalc') {
				ec.edgeReserve = num(g('eEdgeRes').value, 0, 499, ec.edgeReserve); if (g('eEdgeMode')) { ec.edgeMode = g('eEdgeMode').value === 'mm' ? 'mm' : 'pct'; ec.edgeMm = num(g('eEdgeMm').value, 0, 999, ec.edgeMm === undefined ? 30 : ec.edgeMm); } ec.profReserve = num(g('eProfRes').value, 0, 499, ec.profReserve); ec.profKerf = num(g('eProfKerf').value, 0, 49, ec.profKerf);
				/* STHGroup: скрытые параметры не читаются из отсутствующих полей. */
				if (g('eShowCuts')) { ec.showCuts = g('eShowCuts').checked ? 1 : 0; ec.showHoles = g('eShowHoles').checked ? 1 : 0; ec.showFast = g('eShowFast').checked ? 1 : 0; ec.showProf = g('eShowProf').checked ? 1 : 0; }
				ec.hidden = g('eHidden').checked ? 1 : 0;
				ec.holesSort = Number(g('eHolesMode').value) ? num(g('eHolesSort').value, 1, 200, 15) : 0;
				ec.thinMask = g('eThin').value.trim(); ec.thinTh = g('eThinTh').value.trim(); ec.glassMask = g('eGlass').value.trim();
				ec.cornerMax = num(g('eCorner').value, 0, 2000, ec.cornerMax); ec.cornerFrac = num(g('eCornerF').value, 0, 100, ec.cornerFrac);
				var eb = [0, 1, 2, 3, 4].map(function (i) { return num(g('eB' + i).value, 0.1, 10, ec.edgeB[i]); });
				if (eb[0] <= eb[1] && eb[1] <= eb[2] && eb[2] <= eb[3] && eb[3] <= eb[4]) ec.edgeB = eb;
			} else if (cur === 'eDef') {
				var pd = curPl();
				m.querySelectorAll('tr[data-c]').forEach(function (r) { var c = pd.cls[r.dataset.c]; c.val = num(r.querySelector('.cv').value, 0, 1e7, c.val); c.m2 = num(r.querySelector('.cm').value, 0, 1e7, c.m2); });
				m.querySelectorAll('tr[data-d]').forEach(function (r) { pd.def[r.dataset.d] = num(r.querySelector('.dv').value, 0, 1e7, pd.def[r.dataset.d]); });
				psTouched = true;
			} else if (cur === 'eProf') {
				var lens = g('eLens').value.split(/[;\s]+/).map(function (x) { return Math.round(num(x, 0, 20, 0) * 1000); }).filter(function (x, i, a) { return x >= 100 && a.indexOf(x) === i; }).sort(function (a, b) { return a - b; });
				if (lens.length) ec.profLens = lens;
				var ll = g('eLinLens').value.split(/[;\s]+/).map(function (x) { return Math.round(num(x, 0, 20, 0) * 1000); }).filter(function (x, i, a) { return x >= 100 && a.indexOf(x) === i; }).sort(function (a, b) { return a - b; });
				if (ll.length) ec.linLens = ll;
				var ld = Number(g('eLenDef').value);
				ec.profDef = ec.profLens.indexOf(ld) >= 0 ? ld : ec.profLens[Math.min(2, ec.profLens.length - 1)];
			} else if (cur === 'eMk') {
				var pm = curPl();
				pm.mk = { M: num(g('eMkM').value.replace('−', '-'), -90, 1000, pm.mk.M), W: num(g('eMkW').value.replace('−', '-'), -90, 1000, pm.mk.W), F: num(g('eMkF').value.replace('−', '-'), -90, 1000, pm.mk.F) };
				m.querySelectorAll('#xTab tr[data-i]').forEach(function (r) {
					var x = pm.extra[Number(r.dataset.i)], mode = r.querySelector('.xmode').value, nm2 = r.querySelector('.xname').value.trim(), v = num(r.querySelector('.xv').value, 0, 1e8, 0);
					if (!x) return;
					if (nm2) x.name = nm2;
					if (mode === 'sum') delete pm.XMODE[x.id]; else pm.XMODE[x.id] = mode;
					var id = mode === 'sum' ? x.id : (x.id + (mode === 'sqm' ? ':Q' : ':P')), dk = String(x.id).toLowerCase(), def = (mode === 'sum' && pm.def.hasOwnProperty(dk)) ? pm.def[dk] : 0;
					if (Math.abs(v - def) < 1e-9) delete pm.P[id]; else pm.P[id] = v;
				});
				psTouched = true;
			} else if (cur === 'eFac') {
				facAddTyped(m);
				ec.facArts = facList.slice();
				ec.facMdf = (m.querySelector('input[name="facMdf"]:checked') || {}).value === 'cut' ? 'cut' : 'whole';
				ec.facHinges = g('facHinges').checked ? 1 : 0;
			} else if (cur === 'eDoc') {
				ec.valid = Math.round(num(g('eValid').value, 0, 365, ec.valid)); ec.note = g('eNote').value.replace(/\s+/g, ' ').trim(); ec.noPrice = g('eDNoPrice').checked ? 1 : 0; ec.totals = g('eDTotals').checked ? 1 : 0; ec.artCol = g('eArtCol').checked ? 1 : 0;
				var bt = m.querySelectorAll('#bandW .bt'), bw = m.querySelectorAll('#bandW .bw'), nb = [];
				bw.forEach(function (x, i) { nb.push([i < bt.length ? num(bt[i].value, 1, 200, ec.bandW[i][0]) : 999, num(x.value, 5, 200, ec.bandW[i][1])]); });
				nb.sort(function (a, b) { return a[0] - b[0]; });
				if (nb.length) ec.bandW = nb;
			} else if (cur === 'fb') {
				fbf.from = g('fbFrom').value.trim(); fbf.pass = g('fbPass').value.replace(/\s+/g, ''); fbf.to = g('fbTo').value.trim();
			} else if (cur === 'tst') {
				if (g('tAddr')) { tst.addr = g('tAddr').value.trim(); tst.pass = g('tPass').value.replace(/\s+/g, ''); }
			} else if (cur === 'upd') {
				if (g('uOnline')) set.updateOnline = g('uOnline').checked ? 1 : 0; if (g('uTok')) upf.tok = g('uTok').value;
			} else if (cur === 'app') {
				if (g('tName')) tName = g('tName').value.trim();
				set.texMap = { none: Math.round(num(g('tN').value, -99, 99, 0)), horiz: Math.round(num(g('tH').value, -99, 99, 1)), vert: Math.round(num(g('tV').value, -99, 99, 2)) };
			}
		}
		var lastM = null;
		function show(m) {
			lastM = m;
			var body = m.querySelector('.body'), sec = secOf(cur), tabs = sec.tabs, t = tabs.filter(function (x) { return x[0] === cur; })[0];
			last[sec.id] = cur;
			body.innerHTML = '<div class="sset"><nav class="snav">' +
				NAV.map(function (id, i) {
					var x = SECS.filter(function (y) { return y.id === id; })[0];
					if (!x) return '<button class="soon" disabled title="Настройки появятся вместе с разделом">' + id + '<i>скоро</i></button>';
					return '<button data-s="' + x.id + '" class="' + (x === sec ? 'on' : '') + '">' + x.name + '</button>' + (i === 0 ? '<hr>' : '');
				}).join('') + '</nav>' +
				'<div class="spane"><div class="tabs">' + tabs.map(function (x) { return '<button data-t="' + x[0] + '" class="' + (x[0] === cur ? 'on' : '') + '">' + x[1] + '</button>'; }).join('') + '</div>' + t[2]() + '</div></div>';
			var g = function (id) { return m.querySelector('#' + id); };
			body.querySelector('.tabs').onclick = function (e) { var b = e.target.closest('button'); if (!b) return; read(m); cur = b.dataset.t; show(m); };
			body.querySelector('.snav').onclick = function (e) { var b = e.target.closest('button[data-s]'); if (!b) return; read(m); var sx = SECS.filter(function (x) { return x.id === b.dataset.s; })[0]; cur = last[sx.id] || sx.tabs[0][0]; show(m); };
			if (cur === 'crm' && window.STHCRM) m._sthCrmLoad = window.STHCRM.bindSettings(m); // STHGroup
			if (cur === 'dDraw') g('qMode').onchange = function () { g('qModeHint').textContent = MODE_HINT[this.value] || ''; };
			if (CutSet.has(cur)) CutSet.bind(body);
			if (cur === 'cgen' && g('sMine')) g('sMine').onclick = function () { var mp = P.paramsFrom(set); for (var k in mp) if (mp.hasOwnProperty(k) && k !== 'quality') p[k] = mp[k]; differ = false; mine = true; show(m); };
			if (cur === 'fmt') {
				g('fmtAdd').onclick = function () { read(m); set.formats.push([2800, 2070]); show(m); };
				g('fmtList').onclick = function (e) { if (!e.target.classList.contains('fdel')) return; read(m); set.formats.splice(Number(e.target.closest('[data-i]').dataset.i), 1); if (!set.formats.length) set.formats = [[2800, 2070]]; show(m); };
			}
			if (cur === 'dxf') {
				g('xWhat').value = prof().labelWhat || 'des'; g('xEnc').value = prof().enc || 'cp1251';
				g('xProf').onchange = function () { read(m); set.dxf.cur = Number(this.value); show(m); };
				g('xNew').onclick = function () { read(m); var np = P.clone(prof()); np.name = 'Профиль ' + (set.dxf.profiles.length + 1); set.dxf.profiles.push(np); set.dxf.cur = set.dxf.profiles.length - 1; show(m); };
				g('xDel').onclick = function () { if (set.dxf.profiles.length < 2) return; set.dxf.profiles.splice(set.dxf.cur, 1); set.dxf.cur = 0; show(m); };
			}
			if (cur === 'eFac') {
				g('facAdd').onclick = function () { read(m); show(m); };
				g('facNew').onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); read(m); show(m); } };
				g('facList').onclick = function (e) { if (!e.target.classList.contains('fdel')) return; facList.splice(Number(e.target.closest('[data-i]').dataset.i), 1); read(m); show(m); };
			}
			if (g('ePlSel')) g('ePlSel').onchange = function () { read(m); plName = this.value; show(m); };
			if (cur === 'eLists' && window.STHO && window.STHO.book) {
				var SX = window.STHO, SO = BM.sth, sb = SX.book;
				var saveB = function () { SX.save(true); if (SX.render) SX.render(); show(m); };
				g('plList').onclick = async function (e) {
					var row = e.target.closest('.plrow'); if (!row) return;
					var pl = SO.priceById(sb, row.dataset.id), a = e.target.closest('button') ? e.target.closest('button').dataset.a : '';
					if (!pl) return;
					if (!a) { if (e.target.closest('input[type=radio]') || e.target.closest('b,span,label')) { sb.cat.priceId = pl.id; saveB(); } return; }
					if (a === 'open') { await SX.catalog(pl.id); show(m); return; }
					if (a === 'ren') { var r1 = await askName('Переименовать прайс', pl.name); if (!r1 || r1.name === pl.name) return; pl.name = r1.name; saveB(); }
					else if (a === 'copy') {
						var r2 = await askName('Новый прайс — копия «' + pl.name + '»', pl.name + ' — копия', '<label>Изменить цены на, %</label><div><input type="text" id="aPct" value="0" style="width:74px;text-align:right"> <span class="mute">например 10 или −5; 0 — без изменений</span></div>');
						if (!r2) return;
						var np = SO.addPrice(sb, r2.name, pl.cat); SO.scalePrice(np.cat, r2.pct); saveB();
					} else if (a === 'del') {
						if (SO.prices(sb).length < 2) return;
						if (!(await U.confirm('Удалить прайс', 'Прайс «' + pl.name + '» будет удалён. Заказы, которые на нём посчитаны, сохранят его цены у себя.', 'Удалить'))) return;
						SO.removePrice(sb, pl.id); saveB();
					}
				};
				g('plNew').onclick = async function () {
					var r0 = await askName('Новый прайс', 'Новый прайс', '<div class="hint">Новый прайс создаётся с ценами прайса STHGroup по умолчанию — дальше «Открыть» и поправить.</div>');
					if (!r0) return; var np0 = SO.addPrice(sb, r0.name); saveB(); await SX.catalog(np0.id); show(m);
				};
				g('plSave').onclick = async function () {
					var pl = SO.activePrice(sb), pth = await U.pick({ kind: 'save', title: 'Сохранить прайс', dir: S.boot.docs, name: 'Прайс ' + pl.name + '.json', filters: [{ name: 'Прайс STHGroup', ext: ['json'] }] });
					if (!pth) return;
					try { await U.api.write(pth, JSON.stringify({ format: 'sthgroup-price', name: pl.name, cat: pl.cat }, null, 1)); U.toast('Прайс сохранён: ' + U.baseOf(pth)); } catch (e2) { U.error(e2); }
				};
				g('plLoad').onclick = async function () {
					var pth = await U.pick({ kind: 'open', title: 'Загрузить прайс', dir: S.boot.docs, filters: [{ name: 'Прайс STHGroup', ext: ['json'] }] });
					if (!pth) return;
					try {
						var o = JSON.parse(await U.api.readText(pth));
						if (!o || o.format !== 'sthgroup-price' || !o.cat || typeof o.cat !== 'object') throw new Error('Это не файл прайса заказа STHGroup.');
						var nl = SO.addPrice(sb, o.name || U.stemOf(pth), o.cat); saveB();
						U.toast('Прайс загружен: «' + nl.name + '».');
					} catch (e3) { U.error(e3); }
				};
			}
			if (cur === 'eProf') body.querySelectorAll('.pdel').forEach(function (b) { b.onclick = function () { read(m); delete curPl().PLEN[b.closest('tr').dataset.p]; psTouched = true; show(m); }; });
			if (cur === 'eMk') {
				g('xAdd').onclick = function () { read(m); curPl().extra.push({ id: 'X' + Date.now().toString(36), name: 'Новая строка' }); show(m); var ins = m.querySelectorAll('#xTab .xname'); if (ins.length) { ins[ins.length - 1].focus(); ins[ins.length - 1].select(); } };
				g('xTab').onclick = function (e) {
					if (!e.target.classList.contains('xdel')) return;
					read(m);
					var pl = curPl(), x = pl.extra[Number(e.target.closest('tr').dataset.i)];
					pl.extra.splice(pl.extra.indexOf(x), 1); delete pl.XMODE[x.id]; delete pl.OFF['X:' + x.id]; [x.id, x.id + ':Q', x.id + ':P'].forEach(function (k) { delete pl.P[k]; });
					show(m);
				};
			}
			if (cur === 'eDoc') g('eOrgGo').onclick = function () { read(m); cur = 'look'; show(m); };
			if (cur === 'fb') {
				var creds = function () { read(m); return { from: fbf.from, pass: fbf.pass, to: fbf.to }; };
				/* чего не хватает, чтобы отправлять письма; пусто — всё на месте */
				var lacks = function (c) {
					if (!MAIL_RE.test(c.from)) return 'Укажите ящик-отправитель — адрес целиком, например otzyvy@mail.ru.';
					if (!fbProv(c.from)) return 'Ящик-отправитель должен быть на Mail.ru, Gmail или Яндексе: по его адресу программа выбирает почтовый сервер.';
					if (!c.pass && !Fb.state.hasPass) return 'Введите пароль приложения ящика-отправителя.';
					if (!MAIL_RE.test(c.to)) return 'Укажите, куда присылать отзывы, — адрес целиком.';
					return '';
				};
				var busy = async function (btn, text, job) { var was = btn.textContent; btn.disabled = true; btn.textContent = text; try { await job(); } catch (e) { U.error(e); } finally { if (btn.isConnected) { btn.disabled = false; btn.textContent = was; } } };
				g('fbFrom').oninput = function () { g('fbPassHint').textContent = fbPassHint(this.value); };
				g('fbShow').onclick = function () {
					var f = g('fbPass');
					if (f.type === 'password') { f.type = 'text'; this.textContent = 'Скрыть'; } else { f.type = 'password'; this.textContent = 'Показать'; }
				};
				g('fbTest').onclick = function () {
					var c = creds(), why = lacks(c);
					if (why) { U.toast(why); return; }
					g('fbTestRes').textContent = fbf.tested = '';
					busy(this, 'Отправляю…', async function () {
						await U.api.fb.test(c);
						fbf.tested = '✓ письмо ушло в ' + new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) + ' — проверьте почту';
						if (g('fbTestRes')) g('fbTestRes').textContent = fbf.tested;
					});
				};
				g('fbSrcPick').onclick = async function () {
					var pth = await U.pick({ kind: 'open', title: 'Установщик программы — STHGroup-Setup.exe', dir: fbf.src ? U.dirOf(fbf.src) : S.boot.docs, filters: [{ name: 'Установщик STHGroup', ext: ['exe'] }] });
					if (pth) { fbf.src = pth; g('fbSrc').value = pth; }
				};
				g('fbMake').onclick = async function () {
					var c = creds(), btn = this, why = lacks(c);
					if (why) { U.toast(why); return; }
					if (!fbf.src) { U.toast('Выберите установщик программы — STHGroup-Setup.exe.'); return; }
					read(m);
					busy(btn, 'Делаю установщик…', async function () {
						/* ссылка на Диск и адрес ящика-счётчика, набранные на своих вкладках, должны попасть в установщик */
						await tstSave();
						var ts = tst.state || await U.api.testers.state(), miss = [];
						if (!ts.addr) miss.push('Отметок в нём не будет: на вкладке «Пользователи» не указан ящик-счётчик. Счётчик такие установки не увидит.');
						if (miss.length && !(await U.confirm('В установщике будет не всё', miss.join('\n\n'), 'Всё равно сделать'))) return;
						var dst = await U.pick({ kind: 'save', title: 'Установщик для раздачи', dir: U.dirOf(fbf.src), name: 'STHGroup-Setup — для раздачи.exe', filters: [{ name: 'Установщик', ext: ['exe'] }] });
						if (!dst) return;
						c.src = fbf.src; c.dst = dst;
						var r = await U.api.fb.make(c);
						fbf.made = { path: dst, src: fbf.src, updates: !!r.updates, pings: !!r.pings };
						if (cur === 'fb' && m.isConnected) show(m);
						U.toast('Установщик для раздачи готов: ' + U.baseOf(dst) + '.' +
							(r.pings ? '' : ' Отметок в нём нет: укажите ящик-счётчик на вкладке «Пользователи» и сделайте установщик заново.') +
							(r.updates && r.pings ? ' В нём отзывы, обновления и отметки.' : ''), { ms: 16000, actions: [{ label: 'Папка', run: function () { U.api.open(U.dirOf(dst)).catch(U.error); } }] });
					});
				};
				g('fbPeek').onclick = async function () {
					var pth = await U.pick({ kind: 'open', title: 'Какой установщик проверить', dir: fbf.made ? U.dirOf(fbf.made.path) : (fbf.src ? U.dirOf(fbf.src) : S.boot.docs), filters: [{ name: 'Установщик STHGroup', ext: ['exe'] }] });
					if (!pth) return;
					busy(this, 'Читаю файл…', async function () { await tstSave(); await setupPeek(pth); });
				};
				if (g('fbOff')) g('fbOff').onclick = async function () {
					if (!(await U.confirm('Отключить отзывы', 'Адреса и пароль будут стёрты с этого компьютера, кнопка «Отзыв» у вас исчезнет. У тех, кому уже роздан установщик, всё останется как было.', 'Отключить'))) return;
					try { await U.api.fb.config({ clear: true }); await Fb.refresh(); fbf.from = ''; fbf.pass = ''; fbf.to = ''; fbf.tested = ''; show(m); U.toast('Отзывы на этом компьютере отключены.'); } catch (e) { U.error(e); }
				};
			}
			/* без анимаций нет и заставки — галка звука не действует */
			if (cur === 'look') {
				g('sAnim').onchange = function () { g('sSound').disabled = !this.checked; };
				/* масштаб окна — сразу, без «Готово» */
				var zSync = function () {
					if (!m.isConnected || !g('sZ')) { document.removeEventListener('brzoom', zSync); return; }
					var pc = Math.round((S.set.zoom || 1) * 100), off = A.zoomNative === false;
					g('sZ').value = pc; g('sZv').textContent = pc + '%';
					['sZ', 'sZm', 'sZp', 'sZ0'].forEach(function (id) { g(id).disabled = off; });
					g('sZh').textContent = off ? 'Окно открыто в браузере — масштаб меняет браузер: Ctrl + / Ctrl −, Ctrl 0 — 100%.'
						: 'Кнопки, текст и панели крупнее или мельче, шаг 5%. Быстро: Ctrl + колёсико, Ctrl + / Ctrl −, Ctrl 0 — 100%. На карте раскроя Ctrl + колёсико по-прежнему увеличивает карту. PDF и Excel не меняются.';
				};
				g('sZ').oninput = function () { A.setZoom(Number(this.value) / 100); };
				g('sZm').onclick = function () { A.zoomStep(-0.05); };
				g('sZp').onclick = function () { A.zoomStep(0.05); };
				g('sZ0').onclick = function () { A.setZoom(1); };
				document.addEventListener('brzoom', zSync); zSync();
			}
			if (cur === 'paths' && isSth) {
				m.querySelectorAll('[data-po]').forEach(function (b) { b.onclick = function () { var v = g(b.dataset.po).value; if (!v) return; U.api.open(b.dataset.po === 'pBase' ? U.dirOf(v) : v).catch(U.error); }; });
				m.querySelectorAll('[data-pc]').forEach(function (b) { b.onclick = function () { delete set.sthDocsDir; S.set.sthDocsDir = ''; window.App.saveSettings(true); show(m); }; });
				m.querySelectorAll('[data-pp]').forEach(function (b) { b.onclick = async function () {
					var k = b.dataset.pp, K = window.MatBase, X = window.STHO;
					try {
						if (k === 'base') {
							var f = await U.pick({ kind: 'open', title: 'Файл базы материалов (.json)', dir: K && K.path ? U.dirOf(K.path) : S.boot.docs, filters: [{ name: 'База материалов', ext: ['json'] }] });
							if (!f) return;
							await U.api.write(U.join(S.boot.dataDir, 'matbase.json'), JSON.stringify({ file: f })); await K.refresh(); if (K.changed) await K.changed();
							U.toast('База материалов: ' + U.baseOf(f));
						} else if (k === 'orders') {
							var d = await U.pick({ kind: 'folder', title: 'Папка заказов', dir: X ? X.folder() : '' }); if (!d) return;
							var keep = X && X.book; S.set.sthOrdersDir = d; set.sthOrdersDir = d; window.App.saveSettings(true);
							if (X) { var nb = await X.load(true); if (nb && !nb.orders.length && keep && keep.orders.length) { X.book = keep; X.path = U.join(d, BM.sth.FILE); X.save(true); U.toast('Заказы перенесены в новую папку.'); } else U.toast('Папка заказов: ' + d); }
						} else if (k === 'docs') {
							var d2 = await U.pick({ kind: 'folder', title: 'Папка для документов', dir: set.sthDocsDir || S.boot.docs }); if (!d2) return;
							S.set.sthDocsDir = d2; set.sthDocsDir = d2; window.App.saveSettings(true);
						} else if (k === 'scripts') { if (window.STH && window.STH.installScript) await window.STH.installScript(); }
					} catch (e) { U.error(e); }
					if (m.isConnected) show(m);
				}; });
			}
			if (cur === 'upd' && isSth) {
				g('uCheckSth').onclick = async function () { read(m); var b = this; b.disabled = true; b.textContent = 'Проверяю…'; try { await Dg.checkSth(); await Dg.updRefresh(); } finally { if (cur === 'upd' && m.isConnected) show(m); } };
			} else if (cur === 'upd') {
				var again = async function () { read(m); await Dg.updRefresh(); if (cur === 'upd' && m.isConnected) show(m); };
				var ubusy = async function (btn, text, job) { var was = btn.textContent; btn.disabled = true; btn.textContent = text; try { await job(); } catch (e) { U.error(e); } finally { if (btn.isConnected) { btn.disabled = false; btn.textContent = was; } } };
				g('uCheck').onclick = async function () { read(m); var b = this; b.disabled = true; b.textContent = 'Проверяю…'; try { await Dg.checkOnline(false); } finally { await again(); } };
				if (g('uRepo')) g('uRepo').onclick = function (e) { e.preventDefault(); U.api.openUrl(updRepoUrl(Upd.state.repo)).catch(U.error); };
				if (g('uPubInit')) g('uPubInit').onclick = async function () {
					if (!(await U.confirm('Ключ подписи', 'Это нужно только автору программы. На этом компьютере будет создан новый ключ подписи и откроются вкладки автора. Обновления, подписанные новым ключом, примут только программы, поставленные установщиком с этим ключом. Если у вас есть копия прежнего ключа — восстановите её вместо этого.', 'Создать ключ подписи'))) return;
					try { await U.api.upd.pub.init(); U.toast('Ключ подписи создан. Перезапустите программу — появятся вкладки автора.', { ms: 12000 }); await again(); } catch (e) { U.error(e); }
				};
				if (g('uPubRestore')) g('uPubRestore').onclick = async function () {
					var pth = await U.pick({ kind: 'open', title: 'Копия ключа подписи', dir: S.boot.docs, filters: [{ name: 'Ключ подписи STHGroup', ext: ['brkey'] }] });
					if (!pth) return;
					try { await U.api.upd.pub.restore(pth); U.toast('Ключ подписи восстановлен. Перезапустите программу — появятся вкладки автора.', { ms: 12000 }); await again(); } catch (e) { U.error(e); }
				};
				if (g('uGhSave')) {
					g('uGhSave').onclick = function () {
						read(m);
						ubusy(this, 'Проверяю…', async function () {
							var r = await U.api.upd.pub.github({ repo: g('uRepoIn').value.trim(), token: upf.tok.trim() });
							upf.tok = ''; if (g('uTok')) g('uTok').value = '';
							upf.gh = r.problem ? { ok: false, text: r.problem } : (r.checked ? { ok: true, text: '✓ Ключ сохранён: GitHub разрешает загружать выпуски в ' + r.repo + '.' } : { ok: false, text: 'Репозиторий сохранён. Вставьте ключ доступа — без него выпуск не загрузится.' });
							await again();
						});
					};
					g('uRelease').onclick = async function () { read(m); var r = await updRelease(m); if (r) await again(); };
					g('uBackup').onclick = async function () {
						var dst = await U.pick({ kind: 'save', title: 'Копия ключа подписи', dir: S.boot.docs, name: 'STHGroup — ключ подписи.brkey', filters: [{ name: 'Ключ подписи STHGroup', ext: ['brkey'] }] });
						if (!dst) return;
						try { await U.api.upd.pub.backup(dst); U.toast('Копия сохранена: ' + U.baseOf(dst) + '. Держите её там, где не увидят посторонние: с ней можно выпускать обновления от вашего имени. В копии лежит и ключ доступа GitHub.', { ms: 14000 }); } catch (e) { U.error(e); }
					};
				}
			}
			if (cur === 'reg' || cur === 'regs') {
				var rgAgain = function () { if ((cur === 'reg' || cur === 'regs') && m.isConnected) show(m); };
				if (cur === 'reg' && !rg.state) U.api.reg.state().then(function (x) { rg.state = x; rgAgain(); }, U.error);
				if (cur === 'regs' && rg.list === null) U.api.reg.list().then(function (x) { rg.list = x.list; rgAgain(); }, U.error);
				var copy = function (id) {
					var el = g(id), ok = function () { U.toast('Скопировано.'); };
					el.select();
					try { navigator.clipboard.writeText(el.value).then(ok, function () { document.execCommand('copy'); ok(); }); } catch (e) { document.execCommand('copy'); ok(); }
				};
				if (g('rgCopy')) g('rgCopy').onclick = function () { copy('rgCode'); };
				if (g('rgSave')) g('rgSave').onclick = async function () {
					var k = g('rgKey').value.trim();
					if (!k) { U.toast('Вставьте ключ регистрации, который прислал автор.'); return; }
					try { rg.state = await U.api.reg.key({ key: k }); U.toast('Готово: программа зарегистрирована на «' + rg.state.name + '».'); rgAgain(); } catch (e) { U.error(e); }
				};
				if (g('rgClear')) g('rgClear').onclick = async function () {
					if (!(await U.confirm('Убрать регистрацию', 'Ключ регистрации будет стёрт с этого компьютера. Программа продолжит работать.', 'Убрать'))) return;
					try { rg.state = await U.api.reg.key({ clear: true }); rgAgain(); } catch (e) { U.error(e); }
				};
				if (g('rgIssue')) g('rgIssue').onclick = async function () {
					var dated = !!m.querySelector('[name=rgIU]:checked').value, until = dated ? g('rgIUntil').value : '';
					if (dated && !until) { U.toast('Укажите дату или выберите «бессрочно».'); return; }
					try {
						rg.made = await U.api.reg.issue({ code: g('rgICode').value, name: g('rgIName').value, until: until, note: g('rgINote').value });
						rg.list = null; rgAgain();
					} catch (e) { U.error(e); }
				};
				if (g('rgMadeCopy')) g('rgMadeCopy').onclick = function () { copy('rgMade'); };
				if (g('rgList')) g('rgList').onclick = function (e) { var k = e.target.dataset.rgk; if (k === undefined) return; var x = rg.list[Number(k)]; rg.made = { code: x.code, key: x.key }; rgAgain(); };
			}
			if (cur === 'tst') {
				if (!tst.state && !tst.loading) {
					tst.loading = true;
					U.api.testers.state().then(function (s2) { tst.state = s2; }, U.error).then(function () { tst.loading = false; if (tst.state && cur === 'tst' && m.isConnected) show(m); });
				}
				if (g('tShow')) g('tShow').onclick = function () {
					var f = g('tPass');
					if (f.type === 'password') { f.type = 'text'; this.textContent = 'Скрыть'; } else { f.type = 'password'; this.textContent = 'Показать'; }
				};
				if (g('tRefresh')) g('tRefresh').onclick = async function () {
					read(m);
					var b = this, addr = tst.addr === null ? (tst.state.addr || '') : tst.addr;
					if (!addr) { U.toast('Сначала укажите ящик-счётчик и пароль приложения — ниже на этой вкладке.'); return; }
					if (!tst.pass && !(tst.state.hasPass && addr === tst.state.addr)) { U.toast('Введите пароль приложения ящика-счётчика.'); return; }
					b.disabled = true; b.textContent = 'Читаю ящик…';
					try {
						await tstSave();
						var r = await U.api.testers.refresh();
						tst.state = r;
						U.toast(r.added ? 'Новых отметок: ' + r.added + '.' : 'Новых отметок нет.');
					} catch (e) { U.error(e); }
					if (cur === 'tst' && m.isConnected) show(m);
				};
			}
			if (cur === 'app') {
				/* выбор в окне выгрузки скрипта («Запомнить выбор») — файл export-choice.txt в папке настроек */
				var ecf = U.join(S.boot.dataDir, 'export-choice.txt'), ea = g('sExpAfter');
				if (ea) {
					U.api.stat(ecf).then(function (x) { return x && x.exists ? U.api.readBytes(ecf) : null; }).then(function (b) { var v = b ? new TextDecoder().decode(b).replace(/[^a-z]/g, '') : ''; ea.value = v === 'open' || v === 'save' ? v : ''; }).catch(function () { ea.value = ''; });
					ea.onchange = function () { U.api.write(ecf, new TextEncoder().encode(ea.value)).catch(U.error); };
				}
				g('sCopy').onclick = function () { var t2 = g('diagText').textContent; (navigator.clipboard ? navigator.clipboard.writeText(t2) : Promise.reject()).then(function () { U.toast('Скопировано'); }, function () { var r = document.createRange(); r.selectNodeContents(g('diagText')); var s = getSelection(); s.removeAllRanges(); s.addRange(r); U.toast('Текст выделен — нажмите Ctrl+C'); }); };
				if (g('sOldBase')) g('sOldBase').onclick = function () { m.querySelector('.foot .primary').click(); setTimeout(function () { window.Drill.section('base'); }, 250); };
				g('sExport').onclick = async function () {
					read(m);
					var pth = await U.pick({ kind: 'save', title: 'Сохранить настройки', dir: S.boot.docs, name: 'STHGroup — настройки.json', filters: [{ name: 'Настройки STHGroup', ext: ['json'] }] });
					if (!pth) return;
					try {
						/* вместе с настройками — прайсы, «База» и картинки её текстур: файл переносит всё на другой компьютер или планшет */
						var out = JSON.parse(JSON.stringify(set)), BB = BM.base.cur, tex = {}, nt = 0, big = 0;
						delete out.recent; delete out.lastDir; delete out.updateDir; delete out.fb; delete out.linkDir;
						out._prices = S.prices || null; out._base = BB || null;
						if (BB && BB.tex && BB.tex.dir) {
							try {
								var tr = await U.api.tree(BB.tex.dir), root = BB.tex.dir.replace(/[\\/]+$/, '');
								for (var ti = 0; ti < (tr.files || []).length && big < 120 * 1048576; ti++) {
									var fp = tr.files[ti], b = await U.api.readBytes(fp), bin = '';
									for (var bi = 0; bi < b.length; bi += 32768) bin += String.fromCharCode.apply(null, b.subarray(bi, bi + 32768));
									tex[fp.substring(root.length + 1).replace(/\\/g, '/')] = btoa(bin); nt++; big += b.length;
								}
							} catch (eT) { console.warn(eT); }
						}
						if (nt) out._tex = tex;
						await U.api.write(pth, JSON.stringify(out));
						U.toast('Настройки сохранены: ' + U.baseOf(pth) + ' — с прайсами и «Базой»' + (nt ? ', текстур ' + nt : ''));
					} catch (e) { U.error(e); }
				};
				g('sImport').onclick = async function () {
					var pth = await U.pick({ kind: 'open', title: 'Загрузить настройки', dir: S.boot.docs, filters: [{ name: 'Настройки STHGroup', ext: ['json'] }] });
					if (!pth) return;
					try {
						var obj = JSON.parse(await U.api.readText(pth));
						if (!obj || typeof obj !== 'object' || obj.kerf === undefined) throw new Error('Это не файл настроек STHGroup.');
						var keep = { recent: set.recent, lastDir: set.lastDir, updateDir: set.updateDir, linkDir: set.linkDir };
						/* прайсы, «База» и текстуры, если они в файле (сохранён программой 1.22.2 и новее) */
						var extra = [];
						if (obj._prices && typeof obj._prices === 'object') { S.prices = BM.est.fixStore(obj._prices); window.Est.saveStore(true); extra.push('прайсы'); }
						if (obj._base && typeof obj._base === 'object') {
							var nb = BM.base.fix(obj._base);
							if (obj._tex && typeof obj._tex === 'object') {
								var tdir = U.join(S.boot.dataDir, 'Текстуры'), tk = Object.keys(obj._tex);
								for (var tj = 0; tj < tk.length; tj++) {
									var rel = tk[tj].split('/').filter(function (x) { return x && x !== '..'; }), dst = tdir, raw = atob(obj._tex[tk[tj]]), u8 = new Uint8Array(raw.length);
									for (var ri = 0; ri < raw.length; ri++) u8[ri] = raw.charCodeAt(ri);
									for (var ki = 0; ki < rel.length - 1; ki++) { dst = U.join(dst, rel[ki]); try { await U.api.mkdir(dst); } catch (eM) { } }
									await U.api.write(U.join(dst, rel[rel.length - 1]), u8);
								}
								nb.tex.dir = tdir; extra.push('текстур ' + tk.length);
							}
							BM.base.cur = nb; window.Base.save(true); await window.Base.scan(); extra.push('«База»');
						}
						delete obj._prices; delete obj._base; delete obj._tex;
						var ns = BM.mergeSettings(obj);
						for (var k in set) if (set.hasOwnProperty(k)) delete set[k];
						for (k in ns) if (ns.hasOwnProperty(k)) set[k] = ns[k];
						set.recent = keep.recent; set.lastDir = keep.lastDir; if (!set.updateDir) set.updateDir = keep.updateDir; set.linkDir = keep.linkDir || '';
						A.applyTheme(); A.saveSettings(true);
						U.toast('Настройки загружены' + (extra.length ? ' (и ' + extra.join(', ') + ')' : '') + '. Чтобы применить их к открытому проекту, откройте «Настройки → Раскрой» и нажмите «Взять мои обычные».');
						differ = Dg.paramsDiffer(); p = st ? st.work.params : P.paramsFrom(set); cur = 'cgen'; show(m);
					} catch (e) { U.error(e); }
				};
			}
		}
		var before = st ? JSON.stringify(st.work) : '';
		return U.modal({
			title: 'Настройки', width: 920, body: '',
			buttons: [{ label: 'Отмена', value: false }, { label: 'Сохранить', primary: true, run: async function (m) {
				if (m._sthCrmLoad) await m._sthCrmLoad;
				read(m);
				if (m._sthCrmAuto !== undefined) window.STHCRM.state = await U.api.crm.settings({ auto: m._sthCrmAuto });
				return true;
			} }], // STHGroup: сохраняется также автопроверка CRM, без подключения
			onOpen: function (m) { show(m); }
		}).then(function (ok) {
			if (!ok) {
				/* отмена: правки параметров проекта откатываем (они делались прямо в проекте) */
				if (st && JSON.stringify(st.work) !== before) { S.doc.work = JSON.parse(before); st.work = S.doc.work; P.refresh(st); }
				U.api.settings().then(function (s) { var ns = BM.mergeSettings(s); for (var k in ns) if (ns.hasOwnProperty(k)) set[k] = ns[k]; A.applyTheme(); if (st) A.render(); }).catch(function () { });
				return;
			}
			/* обычные настройки пользователя = то, что он сейчас задал */
			if (!differ || mine || !st) { P.PARAMS.forEach(function (k) { set[k] = p[k]; }); set.rules = P.clone(p.rules); set.cut = P.clone(p.cut); }
			/* смета: прайсы пишутся в свой файл; открытый проект получает отмеченный прайс */
			var plWas = st ? E.listFor(S.prices, st).name : ec.cur;
			if (psTouched || plName !== plWas) {
				S.prices = E.fixStore(ps); Es.saveStore(true);
				ec.cur = plName;
				if (st && plName !== plWas) st.work.est.pl = plName;
			}
			A.applyTheme(); A.saveSettings(true);
			/* отзывы тестеров: адреса и пароль пишутся отдельно от обычных настроек */
			if (fbf.seen && (fbf.from || fbf.pass || fbf.to || Fb.state.hasPass)) {
				var was = Fb.state.enabled, full = MAIL_RE.test(fbf.from) && MAIL_RE.test(fbf.to) && (fbf.pass || Fb.state.hasPass);
				if (!full) U.toast('Отзывы не включены: нужны ящик-отправитель, его пароль приложения и адрес, куда присылать. Откройте «Настройки → Общие → Отзывы тестеров».', { ms: 12000 });
				else U.api.fb.config({ from: fbf.from, pass: fbf.pass, to: fbf.to }).then(function () { return Fb.refresh(); }).then(function (s2) { if (s2.enabled && !was) U.toast('Отзывы включены: вверху появилась кнопка «Отзыв».'); }, U.error);
			}
			/* ящик-счётчик (у автора) и имя человека (не у автора) тоже пишутся отдельно */
			tstSave().catch(U.error);
				if (tName !== null && tName !== (Dg.tester.state.name || '')) U.api.tester.hello(tName).then(function (r) { Dg.tester.state.name = r.name; }, U.error);
			if (st) {
				if (JSON.stringify(st.work) !== before) { S.undo.push(before); S.redo = []; S.sel = -1; }
				if ((ec.hidden ? 1 : 0) !== hiddenWas || JSON.stringify([ec.facArts, ec.facMdf, ec.facHinges]) !== facWas) A.rebuild(); else A.afterChange(true);
			}
		});
	};

	/* Документы сметы: смета для заказчика, полная смета, заказы, деталировка фасадов — предпросмотр во весь
	   экран, оттуда в PDF и Excel. «Чертежи фасадов» добавляют деталировку в конец документа; галка
	   запоминается у каждого вида документа (cfg.detIn). */
	Dg.estDoc = function (kind, fmt, shop) {
		var A = window.App, S = A.S, E = BM.est, Es = window.Est;
		if (!S.st || !S.prices) return;
		var cfg = Es.cfg();
		kind = kind || cfg.docKind || 'client';
		var R = Es.build(S.st, cfg, Es.pl(), Es.we(), S.prices.sup), busy = Object.keys(S.jobs).length, last = '';
		if (!cfg.detIn || typeof cfg.detIn !== 'object') cfg.detIn = E.defaults().detIn;
		var nDet = BM.fac ? BM.fac.sheets(S.st, cfg, S.prices.sup, R.res.Notes).length : 0, DET_K = { client: 1, full: 1, fac: 1 };
		var FILES = { client: ' — смета', full: ' — смета (полная)', mat: ' — заказ материала', furn: ' — заказ фурнитуры', fac: ' — заказ фасадов', sup: ' — заказ поставщику', det: ' — деталировка фасадов' };
		/* заказ поставщику: кому — список поставщиков сметы с числом позиций; «все» — каждый с нового листа */
		var sups = O.supList(R);
		if (shop === undefined) shop = sups.length ? sups[0].shop : '';
		function supOpts() { return sups.map(function (g) { return '<option value="' + esc(g.shop) + '"' + (g.shop === shop ? ' selected' : '') + '>' + esc((g.shop || 'Без поставщика') + ' — ' + g.n + ' ' + A.plural(g.n, 'позиция', 'позиции', 'позиций')) + '</option>'; }).join('') + (sups.length > 1 ? '<option value="*"' + (shop === '*' ? ' selected' : '') + '>Все поставщики — по листу на каждого</option>' : ''); }
		function opt(m) { var k = m.querySelector('#eoKind').value; return { kind: k, theme: m.querySelector('.docTheme').value, noPrice: m.querySelector('#eoNoPrice').checked ? 1 : 0, totals: m.querySelector('#eoTotals').checked ? 1 : 0, det: (DET_K[k] && nDet && m.querySelector('#eoDet').checked) ? 1 : 0, shop: k === 'sup' ? m.querySelector('#eoShop').value : undefined }; }
		async function pdfDoc(o) {
			var svg = await window.Preview.logo();
			if (svg) o.logo = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
			return O.estHtml(R, S.st, o);
		}
		function sync(m) {
			var k = m.querySelector('#eoKind').value, d = m.querySelector('#eoDet');
			m.querySelector('#eoShop').hidden = k !== 'sup';
			m.querySelector('#eoNoPrice').disabled = k === 'mat' || k === 'det';
			m.querySelector('#eoTotals').disabled = !(k === 'client' || k === 'full');
			d.disabled = !DET_K[k] || !nDet;
			if (k !== last) { d.checked = !!(DET_K[k] && cfg.detIn[k] !== undefined ? cfg.detIn[k] : E.defaults().detIn[k]); last = k; }
			else if (DET_K[k] && (cfg.detIn[k] ? 1 : 0) !== (d.checked ? 1 : 0)) { cfg.detIn[k] = d.checked ? 1 : 0; A.saveSettings(); }
			m.querySelector('#eoDetL').title = nDet ? 'Листы деталировки (' + nDet + ') — в конце документа, альбомными листами' : 'Фасадов для деталировки в проекте нет';
		}
		async function save(m, what) {
			var btn = m.querySelector('.foot [data-id="' + what + '"]'), o = opt(m), was = btn.textContent;
			cfg.docKind = o.kind; cfg.noPrice = o.noPrice; cfg.totals = o.totals; A.saveSettings();
			btn.disabled = true; btn.textContent = what === 'pdf' ? 'Готовлю PDF…' : 'Готовлю Excel…';
			try {
				var dir = outDir(), name = fileStem() + FILES[o.kind] + (o.kind === 'sup' ? ' ' + O.fileSafe(o.shop === '*' ? 'все' : (o.shop || 'без поставщика')) : '') + (o.noPrice && o.kind !== 'mat' && o.kind !== 'det' ? ' (без цен)' : '') + (o.totals && (o.kind === 'client' || o.kind === 'full') ? ' (итоги)' : '');
				if (what === 'pdf') {
					var d = await pdfDoc(o), path = U.join(dir, name + '.pdf');
					await U.api.pdf(d.html, path);
					done(O.estKindTitle(o.kind) + ': PDF готов, ' + d.pages + ' ' + A.plural(d.pages, 'лист', 'листа', 'листов'), path, dir);
				} else {
					var px = U.join(dir, name + '.xlsx');
					await U.api.write(px, O.estXlsx(R, S.st, o));
					done(O.estKindTitle(o.kind) + ': Excel готов', px, dir);
				}
				if (S.section === 'est') Es.render();
				return true;
			} catch (e) { btn.disabled = false; btn.textContent = was; throw e; }
		}
		var warn = (busy ? 'Раскладка ещё идёт: число листов и длина реза в смете могут измениться. ' : '') +
			(R.stale && !busy ? 'Раскрой не пересчитан — листы в смете посчитаны по прежней раскладке или по площади. ' : '') +
			(R.res.old ? 'Проект выгружен прежним скриптом: фурнитуры, профилей и погонных материалов в нём нет. Выгрузите модель заново.' : '');
		return window.Preview.open({
			title: 'Документы сметы',
			controls: '<select id="eoKind" title="Какой документ">' + O.EST_KINDS.map(function (k) { return '<option value="' + k[0] + '"' + (k[0] === kind ? ' selected' : '') + '>' + k[1] + '</option>'; }).join('') + '</select>' +
				'<select id="eoShop" title="Какому поставщику"' + (kind === 'sup' ? '' : ' hidden') + '>' + supOpts() + '</select>' +
				'<label class="chk"><input type="checkbox" id="eoNoPrice"' + chk(cfg.noPrice) + '> без цены</label><label class="chk"><input type="checkbox" id="eoTotals"' + chk(cfg.totals) + '> только итоги</label>' +
				'<label class="chk" id="eoDetL"><input type="checkbox" id="eoDet"> чертежи фасадов' + (nDet ? ' <span class="mute">(' + nDet + ')</span>' : '') + '</label>' +
				window.Preview.themeControl() +
				'<button id="oPick" title="Папка: ' + esc(outDir()) + '">Папка…</button>',
			build: async function (m) {
				sync(m);
				var d = await pdfDoc(opt(m));
				return { html: d.html, pages: d.pages, dir: outDir(), warn: warn ? esc(warn) : '' };
			},
			buttons: [{ label: 'Сохранить Excel', primary: fmt === 'xlsx', id: 'xlsx', run: function (m) { return save(m, 'xlsx'); } },
					  { label: 'Сохранить PDF', primary: fmt !== 'xlsx', id: 'pdf', run: function (m) { return save(m, 'pdf'); } }],
			onOpen: function (m, refresh) { wirePick(m, refresh); }
		});
	};

	/* ------------------------------- вывод ------------------------------------ */
	Dg.outDir = function () { return outDir(); };
	/* начало имени файла: «Артикул — Наименование», если артикул есть в свойствах модели, иначе — имя проекта */
	function fileStem() {
		var S = window.App.S, m = S.st && S.st.model;
		return O.fileSafe(m && m.art ? P.modelName(m) : U.stemOf(S.path));
	}
	Dg.fileStem = fileStem;
	function outDir() {
		var S = window.App.S;
		return S.st.work.outDir || (S.set.sthDocsDir ? U.join(S.set.sthDocsDir, U.stemOf(S.path)) : U.join(U.dirOf(S.path), U.stemOf(S.path) + ' — раскрой'));   // STHGroup: папка документов из «Папки и файлы»
	}
	function ready() {
		var A = window.App, S = A.S;
		if (!S.st) return false;
		if (Object.keys(S.jobs).length) { U.toast('Раскладка ещё идёт — дождитесь её окончания.'); return false; }
		if (!P.summary(S.st).sheets) { U.toast('Нет разложенных листов — выводить нечего.'); return false; }
		return true;
	}
	function done(text, path, dir) {
		U.toast(text, { actions: [{ label: 'Открыть', run: function () { U.api.open(path).catch(U.error); } }, { label: 'Папка', run: function () { U.api.open(dir).catch(U.error); } }], ms: 12000 });
	}
	async function chooseDir() {
		var A = window.App, S = A.S;
		var d = await U.pick({ kind: 'folder', title: 'Куда сохранять файлы раскроя', dir: U.dirOf(S.path) });
		if (d) { S.st.work.outDir = d; A.save(); }
		return d;
	}
	function dirRow() {
		return '<div class="form" style="margin-top:12px"><label>Папка</label><div class="pathrow"><input type="text" id="oDir" readonly value="' + esc(outDir()) + '"><button id="oPick">Сохранить в другую…</button></div></div>';
	}
	function wireDir(m) { m.querySelector('#oPick').onclick = async function () { var d = await chooseDir(); if (d) m.querySelector('#oDir').value = d; }; }
	/* кнопка «Папка…» в предпросмотре: путь — в подсказке */
	function wirePick(m, refresh) { var b = m.querySelector('#oPick'); if (b) b.onclick = async function () { var d = await chooseDir(); if (d) { b.title = 'Папка: ' + d; if (refresh) refresh(m); U.toast('Файлы будут сохраняться в: ' + d); } }; }

	/* Пока в буфере лежат детали, документы не выпускаются: в них не хватало бы деталей. */
	function outBlocked() {
		var S = window.App.S, bm = S.st ? P.bufMats(S.st) : [];
		if (!bm.length) return false;
		var n = bm.reduce(function (a, x) { return a + x.n; }, 0);
		U.modal({ title: 'Сначала разложите буфер', width: 500,
			body: '<p>В буфере ' + (n === 1 ? 'лежит' : 'лежат') + ' ' + n + ' ' + window.App.plural(n, 'деталь', 'детали', 'деталей') + ' — в документы ' + (n === 1 ? 'она' : 'они') + ' не ' + (n === 1 ? 'попала' : 'попали') + ' бы:</p><ul style="margin:0 0 10px 18px">' +
				  bm.map(function (x) { return '<li>' + esc(P.matTitle(x.mat)) + ' — ' + x.n + '</li>'; }).join('') + '</ul>' +
				  '<p>Положите детали на листы сами или нажмите «Разложить буфер» слева, под листами материала. Пока буфер не пуст, PDF, Excel, DXF и списки не выпускаются.</p>',
			buttons: [{ label: 'Понятно', value: true, primary: true }] });
		return true;
	}
	Dg.pdf = function () {
		if (outBlocked()) return;
		if (!ready()) return;
		var A = window.App, S = A.S, c = S.set.pdf, sm = P.summary(S.st), doc = null;
		var warn = (sm.noPos ? 'Деталей без позиции или обозначения: ' + sm.noPos + '. PDF будет выпущен, эти детали подписаны как есть. ' : '') + (sm.unplaced ? 'Не уложено деталей: ' + sm.unplaced + '. Они перечислены в сводке.' : '');
		function read(m) {
			c.color = Number(m.querySelector('#fColor').value) ? 1 : 0; c.big = Number(m.querySelector('#fBig').value) ? 1 : 0;
			c.summary = m.querySelector('#fSum').checked ? 1 : 0; c.maps = m.querySelector('#fMaps').checked ? 1 : 0; c.list = m.querySelector('#fList').checked ? 1 : 0; c.offcuts = m.querySelector('#fOff').checked ? 1 : 0;
		}
		return window.Preview.open({
			title: 'Раскрой в PDF',
			controls: '<select id="fColor" title="Печать"><option value="1"' + (c.color ? ' selected' : '') + '>цветная</option><option value="0"' + (c.color ? '' : ' selected') + '>чёрно-белая</option></select>' +
				'<select id="fBig" title="Листы раскроя"><option value="0"' + (c.big ? '' : ' selected') + '>карта и таблица деталей</option><option value="1"' + (c.big ? ' selected' : '') + '>карта на весь лист</option></select>' +
				'<label class="chk"><input type="checkbox" id="fSum"' + chk(c.summary) + '> сводка</label><label class="chk"><input type="checkbox" id="fMaps"' + chk(c.maps) + '> карты листов</label><label class="chk"><input type="checkbox" id="fList"' + chk(c.list) + '> список деталей</label><label class="chk"><input type="checkbox" id="fOff"' + chk(c.offcuts) + '> деловые остатки</label>' +
				'<button id="oPick" title="Папка: ' + esc(outDir()) + '">Папка…</button>',
			build: function (m) {
				read(m);
				if (!c.summary && !c.maps && !c.list && !c.offcuts) { doc = null; return { html: '<!DOCTYPE html><html><head></head><body><p style="font:16px sans-serif;text-align:center;margin-top:80px">Отметьте, что включить в PDF.</p></body></html>', pages: 0, warn: esc(warn) }; }
				doc = O.pdfHtml(P.forOutput(S.st), {});
				return { html: doc.html, pages: doc.pages, warn: esc(warn) };
			},
			buttons: [{ label: 'Сохранить Excel', id: 'xlsx', run: async function () { await Dg.exportXlsx(); return true; } }, {
				label: 'Сохранить PDF', primary: true, id: 'pdf', run: async function (m) {
					read(m);
					if (!doc) { U.toast('Отметьте, что включить в PDF.'); return false; }
					A.saveSettings();
					var btn = m.querySelector('.foot [data-id="pdf"]'); btn.disabled = true; btn.textContent = 'Готовлю PDF…';
					try {
						var dir = outDir(), path = U.join(dir, fileStem() + ' — раскрой' + (c.color ? '' : ' (чб)') + '.pdf');
						await U.api.pdf(doc.html, path);
						done('PDF готов: ' + doc.pages + ' ' + A.plural(doc.pages, 'страница', 'страницы', 'страниц'), path, dir);
						return true;
					} catch (e) { btn.disabled = false; btn.textContent = 'Сохранить PDF'; throw e; }
				}
			}],
			onOpen: function (m) { wirePick(m); }
		});
	};

	/* Карты ручной присадки в PDF. От раскроя не зависят: буфер и раскладка им не мешают.
	   Оформление — из «Настройки → Присадка»; здесь спрашивается только, как класть карты на листы. */
	Dg.drillPdf = function () {
		var A = window.App, S = A.S, Dr = BM.drill;
		if (!S.st) return;
		if (window.Drill) window.Drill.saveNote();
		var c = Dr.conf(S.set);
		S.set.drill = c;
		var cards = Dr.cards(S.st).filter(function (x) { return x.n > 0; }), holes = cards.reduce(function (a, x) { return a + x.n; }, 0), doc = null;
		if (!cards.length) { U.toast('В проекте нет отверстий — карты присадки делать не из чего. Присадка берётся из крепежа модели БАЗИСа.'); return; }
		var two = c.mode === 'G';
		return window.Preview.open({
			title: 'Карты присадки в PDF',
			controls: '<span class="mute">Деталей: <b>' + cards.length + '</b>, отверстий: <b>' + holes + '</b> · оформление</span> <b id="dModeName">' + esc(Dr.MODES[c.mode]) + '</b><button id="dSet">Настройки присадки…</button>' +
				'<select id="dMulti" title="Листы"' + (two ? ' disabled' : '') + '><option value="0"' + (c.multi && !two ? '' : ' selected') + '>' + (two ? 'на деталь два листа: чертёж и таблица' : 'одна деталь — один лист') + '</option><option value="1"' + (c.multi && !two ? ' selected' : '') + '>мелкие карты по несколько на лист</option></select>' +
				'<button id="oPick" title="Папка: ' + esc(outDir()) + '">Папка…</button>',
			build: function (m) {
				if (!two) c.multi = Number(m.querySelector('#dMulti').value) ? 1 : 0;
				doc = O.drillHtml(S.st, {});
				return { html: doc.html, pages: doc.pages, warn: doc.warn ? esc('Размеров, которые не поместились: ' + doc.warn) : '' };
			},
			buttons: [{
				label: 'Сохранить PDF', primary: true, id: 'pdf', run: async function (m) {
					if (!two) A.saveSettings();
					var btn = m.querySelector('.foot [data-id="pdf"]'); btn.disabled = true; btn.textContent = 'Готовлю PDF…';
					try {
						var dir = outDir(), path = U.join(dir, fileStem() + ' — присадка' + (doc.multi ? ' (компактно)' : '') + '.pdf');
						await U.api.pdf(doc.html, path);
						done('Карты присадки готовы: ' + doc.pages + ' ' + A.plural(doc.pages, 'лист', 'листа', 'листов') + (doc.warn ? '. Размеров, которые не поместились: ' + doc.warn : ''), path, dir);
						return true;
					} catch (e) { btn.disabled = false; btn.textContent = 'Сохранить PDF'; throw e; }
				}
			}],
			onOpen: function (m, refresh, close) { wirePick(m); m.querySelector('#dSet').onclick = function () { close(false); Dg.settings('dDraw').then(function () { Dg.drillPdf(); }); }; }
		});
	};
	/* Деталировка в PDF: одна деталь — один лист. Оформление — «Настройки → Деталировка». */
	Dg.detailPdf = function () {
		var A = window.App, S = A.S, Det = BM.detail;
		if (!S.st) return;
		var c = Det.conf(S.set), cards = Det.cards(S.st), doc = null;
		if (!cards.length) { U.toast('В проекте нет листовых деталей.'); return; }
		return window.Preview.open({
			title: 'Деталировка в PDF',
			controls: '<span class="mute">Деталей: <b>' + cards.length + '</b> · оформление</span> <b>' + esc(Det.STYLES[c.style]) + '</b><button id="kSet">Настройки деталировки…</button><button id="oPick" title="Папка: ' + esc(outDir()) + '">Папка…</button>',
			build: function () { doc = O.detailHtml(S.st, {}); return { html: doc.html, pages: doc.pages, warn: doc.warn ? esc('Наложений надписей: ' + doc.warn) : '' }; },
			buttons: [{
				label: 'Сохранить PDF', primary: true, id: 'pdf', run: async function (m) {
					var btn = m.querySelector('.foot [data-id="pdf"]'); btn.disabled = true; btn.textContent = 'Готовлю PDF…';
					try {
						var dir = outDir(), path = U.join(dir, fileStem() + ' — деталировка.pdf');
						await U.api.pdf(doc.html, path);
						done('Деталировка готова: ' + doc.pages + ' ' + A.plural(doc.pages, 'лист', 'листа', 'листов'), path, dir);
						return true;
					} catch (e) { btn.disabled = false; btn.textContent = 'Сохранить PDF'; throw e; }
				}
			}],
			onOpen: function (m, refresh, close) { wirePick(m); m.querySelector('#kSet').onclick = function () { close(false); Dg.settings('kDraw').then(function () { Dg.detailPdf(); }); }; }
		});
	};
	/* «Сборка» в PDF (1.22): комплект листов А3 альбомных; сначала дождаться снимков 3D. */
	Dg.asmPdf = async function () {
		var A = window.App, S = A.S, K = BM.kit;
		if (!S.st) return;
		var plan = K.plan(S.st), doc = null;
		if (!plan.pages.length) { U.toast('Листов сборки нет: нужна модель с положением деталей (скрипт выгрузки 1.5 и новее).'); return; }
		if (window.Asm) { U.toast('Снимаю рисунки листов с 3D-модели…', { ms: 2500 }); try { await window.Asm.pics(S.st); } catch (e0) { } }
		return window.Preview.open({
			title: 'Сборка в PDF',
			controls: '<span class="mute">Листов: <b>' + plan.pages.length + '</b> · блоков: <b>' + plan.groups.reduce(function (a, g) { return a + g.units.length; }, 0) + '</b> · А3 альбомный</span><button id="oPick" title="Папка: ' + esc(outDir()) + '">Папка…</button>',
			build: function () { doc = window.Asm.html(S.st); return { html: doc.html, pages: doc.pages, warn: '' }; },
			buttons: [{
				label: 'Сохранить PDF', primary: true, id: 'pdf', run: async function (m) {
					var btn = m.querySelector('.foot [data-id="pdf"]'); btn.disabled = true; btn.textContent = 'Готовлю PDF…';
					try {
						var dir = outDir(), path = U.join(dir, fileStem() + ' — сборка.pdf');
						await U.api.pdf(doc.html, path);
						done('Сборка готова: ' + doc.pages + ' ' + A.plural(doc.pages, 'лист', 'листа', 'листов') + ' А3', path, dir);
						return true;
					} catch (e) { btn.disabled = false; btn.textContent = 'Сохранить PDF'; throw e; }
				}
			}],
			onOpen: function (m) { wirePick(m); }
		});
	};
	Dg.exportXlsx = async function () {
		if (outBlocked()) return;
		if (!ready()) return;
		var S = window.App.S, dir = outDir(), path = U.join(dir, fileStem() + ' — раскрой.xlsx');
		try { await U.api.write(path, O.xlsx(P.forOutput(S.st))); done('Excel готов', path, dir); } catch (e) { U.error(e); }
	};

	Dg.lists = function () {
		if (outBlocked()) return;
		if (!ready()) return;
		var S = window.App.S, wb = (S.st.work.params.cut || {}).wb || { prod: 1, blank: 1, off: 1 };
		return U.modal({
			title: 'Списки и накладные', width: 600,
			body: '<p><b>CSV</b> — общий список деталей текстом: открывается в Excel и почти в любой программе раскроя.</p>' +
				  '<p><b>Накладные</b> — таблица Excel: «в производство» (какие плиты и какие детали на каждой), «на заготовки» (остатки, взятые со склада), «на обрезки» (деловые обрезки, которые вернутся на склад). Какие из трёх нужны — выбирается в настройках раскроя, вкладка «Списки». Сейчас включены: ' + ([wb.prod !== 0 ? 'в производство' : '', wb.blank !== 0 ? 'на заготовки' : '', wb.off !== 0 ? 'на обрезки' : ''].filter(Boolean).join(', ') || 'ни одной') + '.</p>' + dirRow(),
			buttons: [{ label: 'Закрыть', value: false }, {
				label: 'Сохранить CSV', keep: true, run: async function () { var dir = outDir(), path = U.join(dir, fileStem() + ' — детали.csv'); await U.api.write(path, BM.utf8(O.csv(P.forOutput(S.st)))); done('CSV готов', path, dir); return false; }
			}, {
				label: 'Сохранить накладные', primary: true, keep: true, run: async function () { var dir = outDir(), path = U.join(dir, fileStem() + ' — накладные.xlsx'); await U.api.write(path, O.xlsxInvoices(P.forOutput(S.st))); done('Накладные готовы', path, dir); return false; }
			}],
			onOpen: wireDir
		});
	};

	Dg.dxf = function () {
		if (outBlocked()) return;
		if (!ready()) return;
		var A = window.App, S = A.S, set = S.set;
		return U.modal({
			title: 'DXF листов раскроя', width: 600,
			body: '<p>На каждый лист раскроя — свой файл DXF: контуры деталей' + (S.st.holes.face ? ', сверление' : '') + ', подписи. Слои и состав задаёт профиль выгрузки.</p>' +
				(S.st.holes.total && S.st.holes.lost ? '<div class="note warn" style="margin-bottom:10px">Отверстий, которые не удалось привязать к деталям: ' + S.st.holes.lost + ' из ' + S.st.holes.total + '. Проверьте присадку на картах (галка «присадка» над картой).</div>' : '') +
				'<div class="form"><label>Профиль</label><div class="btns" style="margin:0"><select id="dProf">' + set.dxf.profiles.map(function (x, i) { return '<option value="' + i + '"' + (i === set.dxf.cur ? ' selected' : '') + '>' + esc(x.name) + '</option>'; }).join('') + '</select><button id="dEdit">Настроить профили…</button></div></div>' + dirRow(),
			buttons: [{ label: 'Отмена', value: false }, {
				label: 'Сохранить DXF', primary: true, run: async function (m) {
					set.dxf.cur = Number(m.querySelector('#dProf').value) || 0; A.saveSettings();
					var prof = set.dxf.profiles[set.dxf.cur], files = O.dxfAll(P.forOutput(S.st), prof), dir = U.join(outDir(), 'DXF — ' + O.fileSafe(prof.name));
					for (var i = 0; i < files.length; i++) await U.api.write(U.join(dir, files[i].name), files[i].data);
					var back = files.filter(function (f) { return /\.csv$/.test(f.name); }).length;
					U.toast('DXF готов: листов ' + (files.length - back) + (back ? ', плюс список присадки обратной стороны' : ''), { actions: [{ label: 'Папка', run: function () { U.api.open(dir).catch(U.error); } }], ms: 12000 });
					return true;
				}
			}],
			onOpen: function (m) { wireDir(m); m.querySelector('#dEdit').onclick = function () { m.querySelector('.x').click(); Dg.settings('dxf').then(function () { Dg.dxf(); }); }; }
		});
	};

	/* ------------------------- модель изменилась ------------------------------ */
	Dg.diff = function (df) {
		function rows(list, cls, label, f) { return list.map(function (r) { return '<div class="' + cls + '"><b>' + label + '</b><span>' + esc((r.pos ? r.pos + ' · ' : '') + (r.des ? r.des + ' ' : '') + r.name) + ' ' + P.dim(r.L) + '×' + P.dim(r.W) + ' — ' + f(r) + '</span></div>'; }).join(''); }
		var h = rows(df.added, 'add', 'добавлена', function (r) { return r.now + ' шт.'; }) + rows(df.removed, 'del', 'убрана', function (r) { return r.was + ' шт.'; }) + rows(df.changed, 'chg', 'количество', function (r) { return r.was + ' → ' + r.now + ' шт.'; });
		return U.modal({
			title: 'Модель изменилась', width: 640, sticky: true,
			body: '<p>После прошлой выгрузки из БАЗИСа в модели изменились детали: добавлено ' + df.added.length + ', убрано ' + df.removed.length + ', изменилось количество у ' + df.changed.length + '.</p><div class="difflist">' + h + '</div>' +
				  '<p class="mute">«Оставить раскладку» — нынешние листы не меняются: убранные детали с них снимаются, новые докладываются на отдельные листы. «Пересчитать всё» — раскладка строится заново.</p>',
			buttons: [{ label: 'Пересчитать всё', value: 'all' }, { label: 'Оставить раскладку', value: 'keep', primary: true }]
		}).then(function (v) { return v || 'keep'; });
	};

	/* ------------------------------- обновление ------------------------------- */
	/* что программа знает об обновлениях через GitHub: есть ли доступ, когда проверяли; у автора — репозиторий и ключ GitHub */
	Dg.upd = { state: { current: '', edition: 'user', hasKey: false, keySrc: '', problem: '', repo: '', checked: 0, seen: '', publisher: null } };
	Dg.updRefresh = async function () { try { Dg.upd.state = await U.api.upd.state(); } catch (e) { console.error(e); } return Dg.upd.state; };
	/* Спросить GitHub о новой версии. silent — проверка при запуске: молчит, если нового нет. */
	/* STHGroup: «Проверить обновления» — оболочка спрашивает GitHub, новая версия качается сама */
	Dg.checkSth = async function () {
		var r;
		try { r = await U.api.upd.check(false); } catch (e) { U.error(e); return; }
		if (r.status === 'none') U.toast('У вас последняя версия: ' + r.current + '.');
		else if (r.status === 'available') U.toast('Найдена версия ' + (r.version || '') + '. Она скачивается — когда скачается, программа предложит перезапуститься.', { ms: 12000 });
		else if (r.status === 'checking') U.toast('Проверка уже идёт — подождите немного.');
		else if (r.status === 'dev') U.toast('Проверка обновлений работает только в установленной программе.');
		else if (r.status === 'skip') U.toast('Проверка обновлений здесь недоступна.');
		else U.toast(r.message || 'Не удалось проверить обновления.', { bad: true, ms: 12000 });
	};
	Dg.checkOnline = async function (silent) {
		var S = window.App.S, r;
		if (silent && S.set.updateOnline === 0) return;
		if (S.boot && S.boot.edition === 'sth') return;   // STHGroup: при запуске проверяет сама оболочка (main.js), окно BazisReborn «Скачать и установить» здесь не работает
		try { r = await U.api.upd.check(!!silent); } catch (e) { if (!silent) U.error(e); else console.warn('обновления: ' + (e && e.message)); return; }
		if (r.status === 'skip') return;
		await Dg.updRefresh();      // когда проверяли и какая версия последняя — для вкладки «Обновления»
		if (r.status === 'nokey') {
			/* прежний доступ (Яндекс Диск тестовой версии) — об этом говорим и при запуске: иначе человек не узнает, что нужен новый установщик */
			if (r.problem) U.toast(r.problem, { ms: 16000 });
			else if (!silent) U.toast('В этой установке нет доступа к обновлениям: скачайте установщик со страницы выпусков на GitHub и поставьте его поверх.');
			return;
		}
		if (r.status === 'none') { if (!silent) U.toast('У вас последняя версия: ' + r.current + '.'); return; }
await U.modal({ title: 'Новая версия STHGroup', width: 480, cls: 'updNew',
			body: '<p>Установлена версия <b>' + esc(r.current) + '</b>, вышла — <b>' + esc(r.version) + '</b>.</p>' + (r.notes ? '<p class="mute" style="white-space:pre-line">' + esc(r.notes) + '</p>' : '') +
				'<p>Проект уже сохранён. Программа скачает обновление, закроется, обновится и откроется снова; настройки и проекты сохранятся.</p>',
			buttons: [{ label: 'Позже', value: false }, { label: 'Скачать и установить', primary: true, run: async function (mm) {
				var b = mm.querySelector('.foot .primary');
				b.disabled = true; b.textContent = 'Скачиваю…';
				try { var f = await U.api.upd.fetch(); await U.api.setup(f.path); setTimeout(U.api.quit, 600); return true; }
				finally { if (b.isConnected) { b.disabled = false; b.textContent = 'Скачать и установить'; } }
			} }] });
	};
	/* Первый запуск (не у автора): что программа отправляет автору и как к человеку обращаться.
	   Пока человек не нажал «Понятно», отметки не уходят; закрыл окно крестиком — оно появится при следующем запуске. */
	Dg.tester = { state: { edition: 'author', ack: true, name: '' } };
	Dg.testerFirstRun = async function () {
		try { Dg.tester.state = await U.api.tester.state(); } catch (e) { return; }
		var ts = Dg.tester.state;
		if (ts.edition !== 'user' || ts.ack || !ts.pings) return;
		var got = await U.modal({ title: 'STHGroup', width: 520, cls: 'tHello',
			body: '<p>Спасибо, что пользуетесь программой.</p>' +
				'<p>Раз в день программа отправляет автору короткую отметку: случайный номер этой установки, версию программы, версию Windows и названия разделов, которые вы открывали.</p>' +
				'<p class="mute">Проекты, модели, цены и документы никуда не отправляются.</p>' +
				'<div class="form" style="margin-top:12px"><label>Как к вам обращаться</label><input type="text" id="thName" maxlength="60" placeholder="по желанию: имя или название мастерской"></div>',
			buttons: [{ label: 'Понятно', primary: true, run: function (mm) { return { name: mm.querySelector('#thName').value.trim() }; } }] });
		if (!got) return;
		try { var r = await U.api.tester.hello(got.name); ts.ack = true; ts.name = r.name; } catch (e2) { console.warn(e2); }
	};
})();
