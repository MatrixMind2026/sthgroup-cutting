/* STHGroup — панель «Свет» в разделе «Модель» (1.15, вариант А: справа поверх модели).
   Источники: солнце, лампа в точке, подсветка лентой; несколько сразу; положение — кнопками и ползунками;
   яркость, тёплый / холодный, тени; «День / Вечер». Хранится в проекте (work.light), отменяется Ctrl+Z.
   Тот же свет уходит в «3D для заказчика» (Client3D) и в приложение для телефона. */
(function () {
	'use strict';
	var LU = window.LightUI = {}, L = BM.light3d;
	var S = { open: false, cur: 0, key: '', drag: false, view: null };
	function $(id) { return document.getElementById(id); }
	function esc(s) { return String(s === undefined || s === null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
	function st() { return window.App && window.App.S.st; }
	function cfg() { var s = st(); return s ? L.norm(s.work.light) : L.norm(null); }
	/* правка: снимок для отмены — один на жест (ползунок тянут — одна отмена) */
	function edit(f, done) {
		var A = window.App, s = st(); if (!s) return;
		if (!S.drag) A.pushUndo();
		S.drag = !done;
		var c = cfg(); f(c); s.work.light = L.norm(c);
		if (L.empty(s.work.light)) delete s.work.light;
		apply(true);
		if (done) { A.save(); draw(); }
	}
	/* слова для подсветки из модели и тени — из «Настройки → Модель» */
	function opts() {
		var mc = (window.App && window.App.S.set && window.App.S.set.model) || {}, d = function (v, def) { return v === undefined ? def : v; };
		return { words: { diff: d(mc.glowW, L.WORDS.diff), led: d(mc.glowLed, L.WORDS.led), prof: d(mc.glowProf, L.WORDS.prof) }, shadows: d(mc.glowSh, '4') };
	}
	function apply(force) {
		var v = S.view, s = st(); if (!v || !v.setLight) return;
		var o = opts(), k = JSON.stringify([(s && s.work.light) || null, o]);
		if (!force && k === S.key) return;
		S.key = k; v.setLight(s && s.work.light ? s.work.light : null, o);
	}
	/* место лампы и ленты: ползунок (до трёх размеров изделия в каждую сторону) и поле в мм от левого нижнего заднего угла */
	var AX = { x: 0, y: 1, z: 2 };
	function box() { return S.view && S.view.lightBox ? S.view.lightBox() : null; }
	function toMm(k, pc) { var b = box(); return b ? Math.round(b.size[AX[k]] * pc / 100) : null; }
	function posRow(k, lab, pc) {
		var mm = toMm(k, pc), sl = Math.max(L.SLIDE[0], Math.min(L.SLIDE[1], pc));
		return '<label class="lgRow lgPos"><span>' + esc(lab) + '</span><input type="range" data-r="' + k + '" min="' + L.SLIDE[0] + '" max="' + L.SLIDE[1] + '" value="' + Math.round(sl) + '"><span class="lgMm"><input type="number" data-mm="' + k + '" step="10" value="' + (mm === null ? '' : mm) + '"' + (mm === null ? ' disabled' : '') + ' title="Миллиметры от левого нижнего заднего угла изделия; минус — за изделием, ниже или левее">мм</span></label>';
	}
	function slider(k, lab, min, max, val, unit) {
		return '<label class="lgRow"><span>' + esc(lab) + '</span><input type="range" data-r="' + k + '" min="' + min + '" max="' + max + '" value="' + Math.round(val) + '"><b>' + Math.round(val) + (unit || '') + '</b></label>';
	}
	function draw() {
		var el = $('mLight'); if (!el) return;
		el.hidden = !S.open;
		$('mLightB') && $('mLightB').classList.toggle('on', S.open || !L.empty(cfg()));
		if (S.view && S.view.setLampMarks) S.view.setLampMarks(S.open);                                   // шарик лампы виден, пока открыта панель
		if (!S.open) return;
		var mv = $('mView'); if (mv) { el.style.top = (mv.offsetTop + 8) + 'px'; if (!el.style.height) el.style.maxHeight = Math.max(160, mv.offsetHeight - 40) + 'px'; }   // под полосой кнопок, в пределах окна модели
		var c = cfg(), cur = c.list.filter(function (x) { return x.id === S.cur; })[0] || c.list[0];
		if (cur) S.cur = cur.id;
		var h = '<div class="lgHead"><b>Свет</b><span class="mseg lgMode"><button data-mode="day"' + (c.mode === 'day' ? ' class="on"' : '') + '>День</button><button data-mode="night"' + (c.mode === 'night' ? ' class="on"' : '') + ' title="Общий свет приглушён — видно лампы и подсветку">Вечер</button></span><button class="lgX" data-close="1" title="Закрыть">✕</button></div>';
		/* подсветка из модели: рассеиватели в блоках с лентой и профилем */
		var gi = S.view && S.view.glowInfo ? S.view.glowInfo() : { found: 0 }, gc = c.glow, w = opts().words.diff;
		h += '<div class="lgGlow' + (gc.on ? ' on' : '') + '"><label class="chk lgGlowOn"><input type="checkbox" data-glow="1"' + (gc.on ? ' checked' : '') + (gi.found ? '' : ' disabled') + '> Подсветка из модели</label>' +
			'<div class="mute lgGlowN">' + (gi.found ? 'Найдено ' + gi.found + ' ' + plural(gi.found, 'лента', 'ленты', 'лент') + ': «' + esc(w) + '» в блоках с лентой или профилем' : (w ? 'В модели нет «' + esc(w) + '» в блоке с лентой или профилем' : 'Слово для поиска не задано') + ' — слова меняются в «Настройки → Модель»') + '</div>';
		if (gc.on && gi.found) {
			h += '<label class="lgRow"><span>Яркость</span><input type="range" data-g="br" min="0" max="200" value="' + Math.round(gc.br) + '"><b>' + Math.round(gc.br) + '%</b></label>';
			h += '<div class="lgRowK"><span>Цвет</span><span class="mseg lgK">' + [[3000, 'Тёплый'], [4000, 'Нейтр.'], [6000, 'Холодный']].map(function (k) { return '<button data-gk="' + k[0] + '"' + (gc.k === k[0] ? ' class="on"' : '') + ' title="' + k[0] + ' K">' + k[1] + '</button>'; }).join('') + '</span></div>';
			h += '<div class="mute lgGlowN">Тени — в «Настройки → Модель»: ' + ({ '0': 'без теней', '4': 'не больше чем от 4 лент', all: 'от всех лент' }[opts().shadows] || '') + '</div>';
		}
		h += '</div>';
		h += '<div class="lgList">' + (c.list.length ? c.list.map(function (s) {
			return '<div class="lgIt' + (cur && s.id === cur.id ? ' on' : '') + '" data-id="' + s.id + '"><input type="checkbox" data-on="' + s.id + '"' + (s.on ? ' checked' : '') + ' title="Включить / выключить"><span class="lgDot k' + s.k + '"></span><span class="lgName">' + esc(L.label(s)) + '</span><button class="lgDel" data-del="' + s.id + '" title="Убрать источник">✕</button></div>';
		}).join('') : '<div class="mute lgEmpty">Своих источников нет — модель освещена как обычно.</div>') + '</div>';
		h += '<div class="lgAdd">' + (c.list.length < L.MAX ? ['sun', 'lamp', 'strip'].map(function (t) { return '<button data-add="' + t + '">+ ' + L.NAMES[t] + '</button>'; }).join('') : '<span class="mute">Не больше ' + L.MAX + ' источников</span>') + '</div>';
		if (cur) {
			h += '<div class="lgEd">';
			if (cur.t === 'sun') {
				h += '<div class="lgPre">' + [['Слева', -70], ['Спереди', 0], ['Справа', 70], ['Сзади', 180]].map(function (p) { return '<button data-az="' + p[1] + '"' + (Math.round(cur.az) === p[1] ? ' class="on"' : '') + '>' + p[0] + '</button>'; }).join('') + '</div>';
				h += slider('az', 'По кругу', -180, 180, cur.az, '°') + slider('el', 'Высота', 5, 90, cur.el, '°');
			} else {
				var pre = cur.t === 'lamp' ? [['Над изделием', [50, 115, 50]], ['Перед изделием', [50, 85, 160]], ['Сбоку', [-40, 70, 80]], ['Внутри', [50, 80, 50]]] : [['Под верхом', [50, 97, 85]], ['Над столешницей', [50, 40, 70]], ['Внутри', [50, 60, 60]]];
				h += '<div class="lgPre">' + pre.map(function (p) { return '<button data-pos="' + p[1].join(',') + '">' + p[0] + '</button>'; }).join('') + '</div>';
				h += posRow('x', 'Слева — справа', cur.x) + posRow('y', 'Снизу — сверху', cur.y) + posRow('z', 'Сзади — спереди', cur.z);
				if (cur.t === 'strip') h += slider('len', 'Длина ленты', 10, 300, cur.len, '%');
			}
			h += slider('br', 'Яркость', 0, 200, cur.br, '%');
			h += '<div class="lgRowK"><span>Цвет</span><span class="mseg lgK">' + [[3000, 'Тёплый'], [4000, 'Нейтр.'], [6000, 'Холодный']].map(function (k) { return '<button data-k="' + k[0] + '"' + (cur.k === k[0] ? ' class="on"' : '') + ' title="' + k[0] + ' K">' + k[1] + '</button>'; }).join('') + '</span></div>';
			h += '<label class="chk lgSh"><input type="checkbox" data-sh="1"' + (cur.sh ? ' checked' : '') + '> Тени</label>';
			h += '</div>';
		}
		/* мягкость теней — для всех источников и подсветки из модели */
		h += '<label class="lgRow lgSoft"><span>Мягкость теней</span><input type="range" data-soft="1" min="0" max="100" value="' + Math.round(c.soft) + '"><b>' + Math.round(c.soft) + '%</b></label>';
		h += '<div class="mute lgNote">Свет хранится в проекте — тот же в «Заказчику» и в приложении для телефона.</div>';
		var inner = el.querySelector('.lgIn');
		if (!inner) { inner = document.createElement('div'); inner.className = 'lgIn'; el.appendChild(inner); if (S.rsz) window.UI.resizable(el, 'lightPanel', { edges: ['l', 'b', 'lb'], minW: 300, minH: 200 }); }      // панель тянется за левый край и низ
		inner.innerHTML = h;
	}
	function plural(n, a, b, c) { var m = n % 100, k = n % 10; return m > 10 && m < 20 ? c : (k === 1 ? a : (k >= 2 && k <= 4 ? b : c)); }
	function curOf(c) { return c.list.filter(function (x) { return x.id === S.cur; })[0]; }
	LU.init = function () {
		var el = $('mLight'); if (!el) return;
		S.rsz = !!(window.UI && window.UI.resizable);
		$('mLightB').addEventListener('click', function () { S.open = !S.open; draw(); });
		el.addEventListener('click', function (e) {
			var t = e.target, b = t.closest('button, input, .lgIt'); if (!b) return;
			if (b.dataset.close) { S.open = false; draw(); return; }
			if (b.dataset.mode) { edit(function (c) { c.mode = b.dataset.mode; }, true); return; }
			if (b.dataset.add) { var id; edit(function (c) { id = L.nextId(c); c.list.push(L.def(b.dataset.add, id)); }, true); S.cur = id; draw(); return; }
			if (b.dataset.del) { var d = +b.dataset.del; edit(function (c) { c.list = c.list.filter(function (x) { return x.id !== d; }); }, true); return; }
			if (b.dataset.on) { var o = +b.dataset.on; edit(function (c) { c.list.forEach(function (x) { if (x.id === o) x.on = b.checked ? 1 : 0; }); }, true); return; }
			if (b.dataset.sh) { edit(function (c) { var s = curOf(c); if (s) s.sh = b.checked ? 1 : 0; }, true); return; }
			if (b.dataset.az !== undefined) { edit(function (c) { var s = curOf(c); if (s) s.az = +b.dataset.az; }, true); return; }
			if (b.dataset.pos) { var p = b.dataset.pos.split(',').map(Number); edit(function (c) { var s = curOf(c); if (s) { s.x = p[0]; s.y = p[1]; s.z = p[2]; } }, true); return; }
			if (b.dataset.k) { edit(function (c) { var s = curOf(c); if (s) s.k = +b.dataset.k; }, true); return; }
			if (b.dataset.glow) { edit(function (c) { c.glow.on = b.checked ? 1 : 0; }, true); return; }
			if (b.dataset.gk) { edit(function (c) { c.glow.k = +b.dataset.gk; }, true); return; }
			if (b.classList.contains('lgIt')) { S.cur = +b.dataset.id; draw(); }
		});
		el.addEventListener('input', function (e) {
			var ds = e.target.dataset || {};
			if (ds.soft) { var sv = +e.target.value; e.target.nextElementSibling.textContent = sv + '%'; edit(function (c) { c.soft = sv; }, false); return; }
			if (ds.g) { var gv = +e.target.value; e.target.nextElementSibling.textContent = gv + '%'; edit(function (c) { c.glow[ds.g] = gv; }, false); return; }
			if (ds.mm) return;                                                                         // поле в мм — по Enter или уходу из поля
			var r = ds.r; if (!r) return;
			var v = +e.target.value, nx = e.target.nextElementSibling;
			if (AX[r] !== undefined) { var mi = nx.querySelector('input'); if (mi) mi.value = toMm(r, v); }
			else nx.textContent = v + (r === 'az' || r === 'el' ? '°' : '%');
			edit(function (c) { var s = curOf(c); if (s) s[r] = v; }, false);
			var nm = e.target.closest('.lgEd'); if (nm) { var it = el.querySelector('.lgIt.on .lgName'), s2 = curOf(cfg()); if (it && s2) it.textContent = L.label(s2); }
		});
		el.addEventListener('change', function (e) {
			var ds = e.target.dataset || {};
			if (ds.mm) {                                                                               // вписали мм: любое расстояние, хоть за пределами ползунка
				var b = box(), mm = Number(String(e.target.value).replace(',', '.')); if (!b || !isFinite(mm)) { draw(); return; }
				var sz = b.size[AX[ds.mm]] || 1, pc = mm / sz * 100;
				edit(function (c) { var s = curOf(c); if (s) s[ds.mm] = pc; }, true);
				return;
			}
			if (ds.r || ds.g || ds.soft) { S.drag = false; window.App.save(); draw(); }
		});
		/* колесо над панелью не крутит модель */
		el.addEventListener('wheel', function (e) { e.stopPropagation(); }, { passive: true });
		el.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
	};
	/* вызывается при каждой перерисовке раздела «Модель»: свет проекта — в окно, панель — по нему */
	LU.sync = function (view) {
		if (view !== S.view) { S.view = view; S.key = '\u0000'; }
		S.drag = false;
		apply(false);
		draw();
	};
	LU.state = function () { return { open: S.open, cur: S.cur }; };
	LU.open = function (v) { S.open = v !== false; draw(); };
})();
