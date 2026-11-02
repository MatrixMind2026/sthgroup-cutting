/* STHGroup — «Модель»: свой вид материалов и деталей в 3D (1.19.1) — прозрачность, оттенок, блеск.
   Материал — во вкладке «Материалы» (хранится в настройках программы: set.model.matLook { имя: { t, c, g } },
   действует во всех проектах); деталь — в «Свойствах» (хранится в проекте: work.look { ключ детали: { t, c, g } });
   правой кнопкой по детали — то же окошком у курсора с переключателем «Эта деталь | Весь материал».
   Ключ детали — как у редактора анимации (BM.animUser.keys / itemKeys), не зависит от номеров выгрузки.
   Рисует v3d (setLooks), считает BM.glbmat.adjust; файл для заказчика берёт то же (Client3D). */
(function () {
	'use strict';
	var U = window.UI, $ = U.$, esc = U.esc, GM = BM.glbmat, AU = BM.animUser;
	var ML = window.MatLook = {};
	var S = { drag: false, pop: null, popPart: null, popScope: 'part' };

	function App() { return window.App; }
	function Md() { return window.Model; }
	function cfg() { var s = App().S.set; if (!s.model) s.model = BM.defaults().model; return s.model; }
	function matSet(make) { var c = cfg(); if (!c.matLook && make) c.matLook = {}; return c.matLook || {}; }
	function partSet(make) { var st = App().S.st; if (!st) return {}; if (!st.work.look && make) st.work.look = {}; return st.work.look || {}; }
	ML.matSet = function () { return matSet(false); };

	/* в 3D: материалы по имени, объекты 3D-файла и детали — по ключу */
	ML.push = function () {
		var M = Md(); if (!M) return;
		var v = M.view(), S3 = M.S; if (!v || !v.setLooks || !S3.sc) return;
		var P = partSet(false), o = {}, it = {};
		if (Object.keys(P).length) {
			if (S3.glb) AU.keys(S3.glb.O).forEach(function (k, i) { if (P[k]) o[i] = P[k]; });
			AU.itemKeys(S3.sc).forEach(function (k, i) { if (P[k]) it[i] = P[k]; });
		}
		v.setLooks(matSet(false), o, it);
	};
	/* для файла заказчика: { m: материалы, o: { объект: вид } } */
	ML.client = function () {
		var S3 = Md().S, P = partSet(false), o = {};
		if (S3.glb) AU.keys(S3.glb.O).forEach(function (k, i) { if (P[k]) o[i] = P[k]; });
		return { m: matSet(false), o: o };
	};

	/* исходный вид материала (как в БАЗИСе): { t, c, g, glb } */
	function baseVals(name) {
		var S3 = Md().S, G = S3.glb;
		if (G && G.g.mats[name]) { var L = GM.look(name, G.g.mats[name], GM.info(G.mats, name)); var r = GM.vals(L); r.glb = 1; return r; }
		var m = S3.sc && S3.sc.mats.filter(function (x) { return x.name === name; })[0];
		return { t: 0, c: m && /^#[0-9a-f]{6}$/i.test(m.color) ? m.color : '#cccccc', g: 0, glb: !!G };
	}
	function shown(name, part) {
		var b = baseVals(name), s = GM.merge(matSet(false)[name], part ? partSet(false)[part.key] : null) || {};
		return { t: s.t !== undefined ? s.t : b.t, c: s.c || b.c, g: s.g !== undefined ? s.g : b.g, glb: b.glb };
	}

	/* Окошко настроек. scope 'mat' — материал name; 'part' — деталь part { key, name, title } */
	ML.html = function (scope, name, part) {
		if (!name) return '';
		var v = shown(name, scope === 'part' ? part : null), own = scope === 'part' ? partSet(false)[part.key] : matSet(false)[name];
		var dot = function (k) { return own && own[k] !== undefined && own[k] !== '' ? ' class="set" title="Задано здесь"' : ''; };
		var h = '<div class="mlBox" data-scope="' + scope + '" data-name="' + esc(name) + '"' + (part ? ' data-key="' + esc(part.key) + '"' : '') + '>';
		h += '<div class="mlRow"><span' + dot('t') + '>Прозрачность</span><input type="range" min="0" max="100" step="1" data-k="t" value="' + Math.round(v.t) + '"><b data-v="t">' + Math.round(v.t) + ' %</b></div>';
		h += '<div class="mlRow"><span' + dot('c') + '>Оттенок</span><input type="color" data-k="c" value="' + esc(v.c) + '"><button class="mlNo" data-no="c" title="Без оттенка — цвет как в БАЗИСе"' + (own && own.c ? '' : ' disabled') + '>✕</button></div>';
		if (v.glb) h += '<div class="mlRow"><span' + dot('g') + '>Блеск</span><input type="range" min="0" max="100" step="1" data-k="g" value="' + Math.round(v.g) + '"><b data-v="g">' + Math.round(v.g) + ' %</b></div>';
		h += '<div class="mlFoot"><button class="mlReset"' + (own ? '' : ' disabled') + '>' + (scope === 'part' ? 'Как у материала' : 'Как в БАЗИСе') + '</button><span class="mute">' + (scope === 'part' ? 'только эта деталь · в проекте' : 'для всех проектов') + '</span></div>';
		return h + '</div>';
	};

	function store(box, make) { return box.dataset.scope === 'part' ? partSet(make) : matSet(make); }
	function idOf(box) { return box.dataset.scope === 'part' ? box.dataset.key : box.dataset.name; }
	function save(box) {
		if (box.dataset.scope === 'part') { var A = App(); A.S.dirty = true; A.save(); }
		else App().saveSettings();
	}
	function begin(box) { if (box.dataset.scope === 'part' && !S.drag) { App().pushUndo(); S.drag = true; } }
	function setVal(box, k, v) {
		var st = store(box, true), id = idOf(box), r = st[id] || (st[id] = {});
		if (v === undefined) delete r[k]; else r[k] = v;
		if (!Object.keys(r).length) delete st[id];
		ML.push();
	}
	function redraw(box) {
		var n = document.createElement('div'), part = box.dataset.key ? { key: box.dataset.key } : null;
		n.innerHTML = ML.html(box.dataset.scope, box.dataset.name, part);
		box.replaceWith(n.firstChild);
	}
	function onInput(e) {
		var t = e.target, box = t.closest('.mlBox'); if (!box || !t.dataset.k) return;
		begin(box);
		var k = t.dataset.k, v = k === 'c' ? t.value : Number(t.value);
		setVal(box, k, v);
		var b = box.querySelector('[data-v="' + k + '"]'); if (b) b.textContent = v + ' %';
		var lab = t.parentNode.querySelector('span'); if (lab) { lab.className = 'set'; lab.title = 'Задано здесь'; }
		var r0 = box.querySelector('.mlReset'); if (r0) r0.disabled = false;
		if (k === 'c') { var nb = box.querySelector('[data-no="c"]'); if (nb) nb.disabled = false; }
	}
	function onChange(e) { var box = e.target.closest('.mlBox'); if (!box || !e.target.dataset.k) return; S.drag = false; save(box); }
	function onClick(e) {
		var box = e.target.closest('.mlBox'); if (!box) return;
		var no = e.target.closest('[data-no]'), rs = e.target.closest('.mlReset');
		if (!no && !rs) return;
		if (box.dataset.scope === 'part') App().pushUndo();
		if (no) setVal(box, no.dataset.no, undefined);
		else { var st = store(box, false); delete st[idOf(box)]; ML.push(); }
		S.drag = false; save(box); redraw(box);
	}

	/* правой кнопкой по детали: окошко у курсора, «Эта деталь | Весь материал» */
	ML.close = function () { if (S.pop) { S.pop.remove(); S.pop = null; } };
	function drawPop() {
		var p = S.popPart, sc = S.popScope;
		S.pop.innerHTML = '<div class="mlHead"><b>' + esc(p.title || p.name) + '</b><button class="mlX" title="Закрыть">×</button></div>' +
			'<span class="seg mlSeg"><button data-ps="part" class="' + (sc === 'part' ? 'on' : '') + '">Эта деталь</button><button data-ps="mat" class="' + (sc === 'mat' ? 'on' : '') + '">Весь материал</button></span>' +
			'<div class="mute mlMat" title="' + esc(p.name) + '">' + esc(p.name) + '</div>' + ML.html(sc, p.name, p);
	}
	ML.popup = function (x, y, part) {
		ML.close();
		if (!part || !part.name) return;
		S.popPart = part; S.popScope = 'part';
		S.pop = document.createElement('div'); S.pop.className = 'mlPop';
		document.body.appendChild(S.pop); drawPop();
		var r = S.pop.getBoundingClientRect();
		S.pop.style.left = Math.max(4, Math.min(x + 8, window.innerWidth - r.width - 8)) + 'px';
		S.pop.style.top = Math.max(4, Math.min(y + 8, window.innerHeight - r.height - 8)) + 'px';
		S.pop.addEventListener('click', function (e) {
			var b = e.target.closest('[data-ps]'); if (b) { S.popScope = b.dataset.ps; drawPop(); return; }
			if (e.target.closest('.mlX')) ML.close();
		});
	};
	ML.key = function (e) { if (e.key === 'Escape' && S.pop) { ML.close(); return true; } return false; };

	ML.init = function () {
		document.addEventListener('input', onInput);
		document.addEventListener('change', onChange);
		document.addEventListener('click', onClick);
		document.addEventListener('pointerdown', function (e) { if (S.pop && !S.pop.contains(e.target)) ML.close(); }, true);
	};
})();
