/* STHGroup — раздел «Сборка» (1.22): комплект листов А3 по сборочным единицам (core/kit.js) — общий вид изделия
   с блоками, на каждый блок «Сборочная единица» обзор, листы деталей и схема сборки, узлы (ящики), монтаж.
   Слева — листы, в центре — лист целиком, как в PDF. Рисунки — снимки 3D «Текстуры + Рентген» (ui/kitpics.js):
   снимаются в фоне при входе в раздел; пока их нет — лист рисуется линиями.
   Щелчок по детали в списке шага — меню «в какой шаг»: выбор хранится в проекте, Ctrl+Z отменяет. */
(function () {
	'use strict';
	var U = window.UI, As = BM.asm, K = BM.kit, $ = U.$, esc = U.esc;
	var Am = window.Asm = {};
	var KIND = { over: 'общий вид', unit: 'обзор блока', part: 'деталь', scheme: 'схема сборки', mount: 'монтаж' };
	var PICS = { st: null, sig: '', done: false, busy: null, k: 0, n: 0, fail: '' };

	function plan() { var st = window.App.S.st; return st ? K.plan(st) : { pages: [], groups: [] }; }
	Am.sheets = function () { return plan().pages; };
	Am.units = function () { var st = window.App.S.st; return st ? As.units(st) : []; };
	Am.current = function () {
		var S = window.App.S, list = Am.sheets(), i;
		for (i = 0; i < list.length; i++) if (keyOf(list[i]) === S.asmKey) return list[i];
		if (list.length) { S.asmKey = keyOf(list[0]); return list[0]; }
		return null;
	};
	function keyOf(pg) { return pg.kind + '|' + (pg.g ? pg.g.key : '') + '|' + (pg.card ? pg.card.key : '') + '|' + (pg.unit ? pg.unit.key : '') + '|' + (pg.from || 0); }

	/* снимки 3D для листов: в фоне, один раз на проект (после правки проекта — заново) */
	Am.pics = function (st) {
		st = st || window.App.S.st;
		if (!st || !window.KitPics) return Promise.resolve(0);
		var sig = JSON.stringify(st.work.asm || {});
		if (PICS.st === st && PICS.busy) return PICS.busy;
		if (PICS.st === st && PICS.sig === sig && PICS.done) return Promise.resolve(0);
		if (PICS.st === st && PICS.sig !== sig && st._kitPics) Object.keys(st._kitPics).forEach(function (k) { if (k.indexOf('step|') === 0) delete st._kitPics[k]; });      // шаги переставлены — шаги снять заново
		PICS.st = st; PICS.sig = sig; PICS.done = false; PICS.k = 0; PICS.n = 0; PICS.fail = '';
		PICS.busy = window.KitPics.render(st, { onStep: function (k, n) { PICS.k = k; PICS.n = n; if (PICS.st === st && k % 6 === 0) chips(); } })
			.catch(function (e) { PICS.fail = (e && e.message) || String(e); return 0; })
			.then(function (n) { PICS.busy = null; if (PICS.st === st) { PICS.done = !PICS.fail; if (n) Am.render(); else chips(); } return n; });
		chips();
		return PICS.busy;
	};
	function chips() {
		var S = window.App.S, st = S.st, man = st ? As.manualCount(st) : 0, cur = Am.current(), h = '';
		if (cur && cur.kind === 'scheme') h += '<span class="chip" title="Щелчок по детали в списке шага — перенести её в другой шаг">деталь — щелчком в другой шаг</span>';
		if (man) h += '<span class="chip act" data-asm-reset="1" title="Шаги деталей, заданные вручную. Щелчок — вернуть все как было">шагов вручную: ' + man + ' ✕</span>';
		if (PICS.busy && PICS.st === st) h += '<span class="chip" title="Рисунки листов снимаются с 3D-модели в виде «Текстуры + Рентген»; пока их нет — рисунок линиями">снимки 3D: ' + PICS.k + ' из ' + (PICS.n || '…') + '</span>';
		else if (PICS.fail && PICS.st === st) h += '<span class="chip warn" title="' + esc(PICS.fail) + '">снимки 3D не сделаны — рисунок линиями</span>';
		$('aChips').innerHTML = h;
	}
	Am.render = function () {
		var A = window.App, S = A.S, st = S.st;
		if (!st || S.section !== 'asm') return;
		var P = plan(), list = P.pages, cur = Am.current(), h = '';
		list.forEach(function (pg) {
			var sub = pg.kind === 'part' || (pg.kind === 'scheme' && pg.sub), kind = pg.kind === 'scheme' && pg.sub ? 'узел' : KIND[pg.kind];
			h += '<div class="dIt' + (sub ? ' sub' : '') + (cur && keyOf(pg) === keyOf(cur) ? ' on' : '') + '" data-k="' + esc(keyOf(pg)) + '" title="' + esc(pg.title) + '"><div><b>' + pg.n + '. ' + esc(pg.title) + '</b><span>' + esc((pg.g && pg.kind !== 'unit' ? pg.g.units[0].name + ' · ' : '') + kind) + '</span></div></div>';
		});
		$('aList').innerHTML = h || '<div class="mute" style="padding:8px 2px">Листов нет: нужна модель с положением деталей — выгрузите её скриптом STHGroup_Export.</div>';
		$('aCount').textContent = list.length ? 'Листов: ' + list.length + ' · блоков: ' + P.groups.reduce(function (s, g) { return s + g.units.length; }, 0) + ' · А3' : '';
		var on = $('aList').querySelector('.dIt.on');
		if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest' });
		var wrap = $('aPages');
		if (!cur) { $('aTitle').textContent = 'Сборка'; $('aChips').innerHTML = ''; wrap.innerHTML = '<div class="dEmpty">' + (st ? 'В модели нет данных о положении деталей.' : 'Откройте проект, выгруженный из БАЗИСа.') + '</div>'; return; }
		var pxw = Math.max(520, Math.min(1700, wrap.clientWidth - 44)) * (S.asmZoom || 1), pg = K.page(st, cur);
		wrap.innerHTML = '<div class="dPage">' + K.pageSvg(pg, { px: pxw }) + '</div>';
		$('aTitle').textContent = cur.title;
		chips();
		Am.pics(st);
	};
	Am.select = function (key) { window.App.S.asmKey = key; Am.render(); $('aPages').scrollTop = 0; };
	Am.step = function (d) {
		var list = Am.sheets(), cur = Am.current(), i = cur ? list.indexOf(cur) : -1;
		if (!list.length) return;
		Am.select(keyOf(list[Math.max(0, Math.min(list.length - 1, i + d))]));
	};
	/* перенос детали (всех таких же в единице) в другой шаг */
	Am.setStep = function (ukey, rk, what) {
		var A = window.App, st = A.S.st;
		if (!st) return;
		A.pushUndo();
		As.setStep(st, ukey, rk, what);
		A.afterChange();
	};
	Am.partMenu = function (x, y, ukey, rk) {
		var st = window.App.S.st, u = Am.units().filter(function (q) { return q.key === ukey; })[0];
		if (!st || !u) return;
		var d = As.data(st, u), cur = '', man = ((st.work.asm || {}).step || {})[ukey], acts = [];
		d.steps.forEach(function (s) { s.items.forEach(function (i) { if (As.rowKey(d.sc.items[i]) === rk) cur = s.id; }); });
		Object.keys(As.STEP_NAMES).forEach(function (id) { acts.push([(id === cur ? '✓ ' : '') + 'В шаг «' + As.STEP_NAMES[id] + '»', function () { Am.setStep(ukey, rk, id); }, '', id === cur]); });
		if (man && man[rk]) { acts.push(null); acts.push(['Как было (по положению в модели)', function () { Am.setStep(ukey, rk, ''); }]); }
		U.menu(x, y, acts);
	};
	Am.resetSteps = function () {
		var A = window.App, st = A.S.st;
		if (!st || !As.manualCount(st)) return;
		A.pushUndo();
		if (st.work.asm) delete st.work.asm.step;
		delete st._asmD; delete st._asmPlan; delete st._kit;
		A.afterChange();
	};
	/* документ для PDF: листы А3 альбомные, снимки 3D внутри */
	Am.html = function (st) {
		var P = K.plan(st), title = BM.project.modelName(st.model) || '';
		var pages = P.pages.map(function (pg) { return '<div class="kPg">' + K.pageSvg(K.page(st, pg)) + '</div>'; });
		return { pages: pages.length, html: '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + esc('Сборка — ' + title) + '</title><style>@page{size:420mm 297mm;margin:0}html,body{margin:0;padding:0;background:#fff}.kPg{width:420mm;height:297mm;overflow:hidden;page-break-after:always;break-after:page}.kPg:last-child{page-break-after:auto;break-after:auto}.kPg svg{display:block}</style></head><body>' + pages.join('\n') + '</body></html>' };
	};
	Am.init = function () {
		$('aList').addEventListener('click', function (e) { var d = e.target.closest('.dIt'); if (d) Am.select(d.dataset.k); });
		$('aPages').addEventListener('click', function (e) {
			var g = e.target.closest ? e.target.closest('.asmP') : null;
			if (g) { e.preventDefault(); Am.partMenu(e.clientX, e.clientY, g.getAttribute('data-u'), g.getAttribute('data-r')); }
		});
		$('aChips').addEventListener('click', function (e) { if (e.target.closest('[data-asm-reset]')) Am.resetSteps(); });
		$('aZoomIn').onclick = function () { var S = window.App.S; S.asmZoom = Math.min(3, (S.asmZoom || 1) * 1.25); Am.render(); };
		$('aZoomOut').onclick = function () { var S = window.App.S; S.asmZoom = Math.max(0.5, (S.asmZoom || 1) * 0.8); Am.render(); };
		$('aZoomFit').onclick = function () { window.App.S.asmZoom = 1; Am.render(); };
	};
})();
