/* STHGroup — карта листа в окне: выбор детали, перенос в буфер и на другой лист, масштаб, плитка листов. */
(function () {
	'use strict';
	var U = window.UI, P = BM.project, D = BM.draw, $ = U.$;
	var M = window.MapView = {};
	var drag = null, bdrag = null, frHintShown = false, last = null, quiet = false;

	/* текстура материала из «Базы» (галочка «текстуры» над картой, по умолчанию включена) */
	function texOf(mat) { var S = window.App.S; return (mat && S.set.texMaps !== 0 && window.Base) ? window.Base.texInfo(mat.name) : null; }
	function fitPx(sh) {
		var wrap = $('mapWrap'), aw = wrap.clientWidth - 30, ah = wrap.clientHeight - 30;
		if (aw < 200) aw = 200; if (ah < 150) ah = 150;
		var stripPx = 6 * 3.7795;
		return Math.max(240, Math.min(aw, (ah - stripPx) * sh.L / sh.W));
	}

	M.render = function () {
		var A = window.App, S = A.S, st = S.st, mat = A.mat(), map = $('map'), msg = $('mapMsg'), wrap = $('mapWrap');
		msg.textContent = '';
		M.busy();
		$('lHoles').hidden = !(st && st.holes && st.holes.face > 0);
		if (!mat) { map.innerHTML = ''; $('tiles').innerHTML = ''; $('sheetTitle').textContent = ''; $('sheetChips').innerHTML = ''; return; }
		var lay = A.lay(), busy = A.busy(mat.key), stale = A.stale();
		wrap.classList.toggle('all', S.view === 'all');
		$('bAll').textContent = S.view === 'all' ? 'Один лист' : 'Все листы';
		$('bAll').classList.toggle('on', S.view === 'all');
		if (!mat.cfg.on) { map.innerHTML = ''; $('tiles').innerHTML = ''; $('sheetTitle').textContent = 'Материал без раскроя'; $('sheetChips').innerHTML = ''; msg.textContent = 'Этот материал исключён из раскроя. Включить его можно в окне «Материалы».'; setBtns(null, mat, true); return; }
		if (!lay || !lay.sheets.length) {
			$('tiles').innerHTML = ''; $('sheetTitle').textContent = P.matTitle(mat); $('sheetChips').innerHTML = '';
			/* пока идёт первая раскладка — пустой лист нужного формата, поверх него знак-локатор */
			var f0 = P.fmtOf(mat), blank = { L: f0.L, W: f0.W, rem: 0, recs: [] };
			map.innerHTML = (busy && S.view !== 'all') ? D.sheet(st, mat, blank, { px: fitPx(blank), uid: 'm', offcuts: 0, font: 'Segoe UI, Arial, sans-serif' }) : '';
			last = null;
			msg.textContent = busy ? '' : (P.instances(st, mat).length ? (lay && lay.unplaced.length ? 'Ни одна деталь не помещается на лист этого формата. Проверьте формат листа в окне «Материалы».' : 'Раскладка ещё не готова.') : 'У этого материала нет деталей в раскрое.');
			setBtns(null, mat, true);
			return;
		}
		if (S.si >= lay.sheets.length) S.si = lay.sheets.length - 1;
		var sh = lay.sheets[S.si], stt = P.sheetStat(st, mat, sh), color = S.set.color || 'name';
		$('sheetTitle').textContent = S.view === 'all' ? 'Все листы: ' + lay.sheets.length : 'Лист ' + (S.si + 1) + ' из ' + lay.sheets.length;
		var chips = '<span class="chip">рез ' + P.dim(st.work.params.kerf) + ' мм</span>';
		if (S.view !== 'all') {
			chips += '<span class="chip">заполнение ' + P.num(stt.fill, 1) + ' %</span><span class="chip">' + stt.n + ' ' + A.plural(stt.n, 'деталь', 'детали', 'деталей') + '</span>';
			chips += '<span class="chip" title="Сколько раз плиту нужно развернуть на 90°">поворотов: ' + (sh.rot || 0) + '</span><span class="chip">резов: ' + (sh.cutsN || 0) + '</span><span class="chip">установок: ' + (sh.setups || 0) + '</span>';
			if (sh.bad) chips += '<span class="chip warn" title="Раскладка на этом листе не режется сквозными резами">не режется сквозными резами</span>';
			if (sh.rem) chips += '<span class="chip">остаток</span>';
			if (sh.lock) chips += '<span class="chip warn" title="Раскладку этого листа правили вручную: при пересчёте он не меняется">закреплён</span>';
		}
		if (stale) chips += '<span class="chip warn">' + (busy ? 'пересчитывается…' : 'устарела') + '</span>';
		$('sheetChips').innerHTML = chips;
		setBtns(sh, mat, stale);

		if (S.view === 'all') {
			var h = '';
			lay.sheets.forEach(function (s2, i) {
				var t2 = P.sheetStat(st, mat, s2);
				h += '<div class="tile" data-i="' + i + '">' + D.sheet(st, mat, s2, { px: 430, uid: 'a' + i, strip: 0, color: color, tex: texOf(mat), font: 'Segoe UI, Arial, sans-serif' }) +
					 '<div><b>Лист ' + (i + 1) + '</b><span>' + P.dim(s2.L) + ' × ' + P.dim(s2.W) + (s2.rem ? ', остаток' : '') + '</span><span>' + P.num(t2.fill, 1) + ' %</span><span>' + t2.n + ' дет.</span>' + (s2.lock ? '<span>закреплён</span>' : '') + '</div></div>';
			});
			$('tiles').innerHTML = h;
			map.innerHTML = '';
			last = { mat: mat.key, si: -1 };
			return;
		}
		$('tiles').innerHTML = '';
		var px = fitPx(sh) * S.zoom, anim = U.animOn() && !quiet;
		/* где детали стояли до перерисовки — чтобы они плавно доехали до новых мест */
		var was = null, oldSvg = map.querySelector('svg');
		if (anim && oldSvg && last && last.mat === mat.key && last.si === S.si && Math.abs(last.px - px) < 0.5 && last.keys) {
			was = {};
			oldSvg.querySelectorAll('g.pt').forEach(function (g) {
				var key = last.keys[Number(g.dataset.i)], mt = /translate\(([-\d.]+)[ ,]+([-\d.]+)\)/.exec(g.getAttribute('transform') || '');
				if (key && mt) was[key] = [Number(mt[1]), Number(mt[2])];
			});
		}
		map.innerHTML = D.sheet(st, mat, sh, { px: px, uid: 'm', color: color, tex: texOf(mat), inter: 1, holes: S.holes, font: 'Segoe UI, Arial, sans-serif' });
		var u0 = P.usable(st, sh);
		var svg = map.querySelector('svg'), k = Number(svg.dataset.k) || 10;
		svg.style.setProperty('--selw', (1.0 * k) + 'px');
		svg.style.setProperty('--hlw', (0.55 * k) + 'px');
		svg.style.setProperty('--dash', (3 * k) + ' ' + (1.8 * k));
		M.mark();
		$('bZoomFit').textContent = Math.round(S.zoom * 100) + ' %';
		var keys = sh.recs.map(function (r) { return r.t + '#' + r.k; });
		if (anim) {
			if (was) {
				svg.querySelectorAll('g.pt').forEach(function (g) {
					var i = Number(g.dataset.i), o = was[keys[i]], x = u0.m + sh.recs[i].x, y = u0.m + sh.recs[i].y;
					if (!o || (Math.abs(o[0] - x) < 0.6 && Math.abs(o[1] - y) < 0.6) || !g.animate) return;
					g.animate([{ transform: 'translate(' + o[0] + 'px,' + o[1] + 'px)' }, { transform: 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)' }], { duration: 180, easing: 'ease-out' });
				});
			} else if (last && last.mat === mat.key && last.si >= 0 && last.si !== S.si) svg.classList.add(S.si > last.si ? 'inR' : 'inL');
			else if (!last || last.mat !== mat.key || last.si !== S.si) svg.classList.add('inF');
		}
		last = { mat: mat.key, si: S.si, px: px, keys: keys };
	};

	/* Знак-локатор с процентом, пока раскладывается выбранный материал. */
	M.busy = function () {
		var A = window.App, S = A.S, el = $('busy'), mat = S.st ? A.mat() : null, job = mat ? S.jobs[mat.key] : null;
		if (!job) { el.hidden = true; return; }
		/* раскладка материала началась, а показать ещё нечего — пустой лист его формата под знаком */
		var lay0 = A.lay(), map0 = $('map');
		if (mat.cfg.on && S.view !== 'all' && (!lay0 || !lay0.sheets.length) && !map0.querySelector('svg')) {
			var f = P.fmtOf(mat), bl = { L: f.L, W: f.W, rem: 0, recs: [] };
			map0.innerHTML = D.sheet(S.st, mat, bl, { px: fitPx(bl), uid: 'm', offcuts: 0, font: 'Segoe UI, Arial, sans-serif' });
			$('mapMsg').textContent = '';
		}
		var run = job === S.running, pc = Math.round((job.progress || 0) * 100);
		$('busyText').textContent = run ? 'Идёт раскладка…' : 'В очереди на раскладку…';
		$('busyPc').textContent = run ? pc + ' %' : '';
		$('busyBar').style.width = (run ? Math.max(3, pc) : 0) + '%';
		el.hidden = false;
	};

	function setBtns(sh, mat, stale) {
		var S = window.App.S;
		$('bVariant').disabled = !sh || stale || S.view === 'all';
		var blank = !!sh && !sh.recs.length;
		$('bLock').hidden = !sh || S.view === 'all' || blank;
		$('bVariant').hidden = blank && S.view !== 'all';
		$('bDropSheet').hidden = !blank || S.view === 'all';
		if (sh) { $('bLock').textContent = sh.lock ? 'Открепить лист' : 'Закрепить лист'; $('bLock').classList.toggle('on', !!sh.lock); }
		$('legend').innerHTML = (!sh || S.view === 'all') ? '' : '<span title="Раскладка должна резаться сквозными резами, поэтому по листу детали мышью не двигаются">деталь можно перетащить в буфер или на другой лист слева</span>';
	}

	/* Подсветка выбранной детали и выбранной разновидности. */
	M.mark = function () {
		var S = window.App.S, sh = window.App.sheet(), svg = $('map').querySelector('svg');
		if (!svg || !sh) return;
		var unit = S.sel >= 0 ? P.unitIdx(sh, S.sel) : [], over = svg.querySelector('.over');
		svg.querySelectorAll('g.pt').forEach(function (g) {
			var i = Number(g.dataset.i), rc = sh.recs[i];
			var isSel = unit.indexOf(i) >= 0;
			g.classList.toggle('sel', isSel);
			g.classList.toggle('hl', !isSel && !!S.selType && rc && rc.t === S.selType);
			g.classList.toggle('dim', window.App.stale());
			if (isSel) svg.insertBefore(g, over);
		});
	};

	M.zoomBy = function (f) {
		var S = window.App.S;
		S.zoom = Math.max(0.5, Math.min(6, S.zoom * f));
		if (Math.abs(S.zoom - 1) < 0.06) S.zoom = 1;
		M.render();
	};

	M.rotateSel = function () {
		var A = window.App, S = A.S, st = S.st, mat = A.mat(), sh = A.sheet();
		if (!sh || S.sel < 0 || !sh.recs[S.sel] || S.view === 'all') return;
		if (A.stale()) { U.toast('Дождитесь окончания раскладки.'); return; }
		U.toast('Поворот детали задаётся текстурой (в карточке справа): после этого материал раскладывается заново.');
	};

	/* ----------------------------- перенос мышью ------------------------------ */
	/*  Деталь по листу не двигается (раскладка должна резаться сквозными резами), но её можно унести
	    в буфер или на другой лист — за курсором идёт ярлык. Деталь из буфера кладётся на лист так же. */
	function ghostShow(text, x, y) { var g = $('ghost'); g.textContent = text; g.hidden = false; g.style.left = (x + 14) + 'px'; g.style.top = (y + 14) + 'px'; }
	function ghostHide() { $('ghost').hidden = true; }
	function partLabel(st, t) { return (P.main(t) ? P.main(t) + ' · ' : '') + t.name + ', ' + P.dim(t.L) + '×' + P.dim(t.W); }
	/* Над чем сейчас курсор: миниатюра листа, «+ пустой лист», буфер, карта. */
	function dropTarget(x, y) {
		var el = document.elementFromPoint(x, y);
		if (!el || !el.closest) return null;
		var th = el.closest('.thumb');
		if (th) return th.classList.contains('add') ? { kind: 'new', el: th } : { kind: 'thumb', i: Number(th.dataset.i), el: th };
		var bf = el.closest('#bufDrop');
		if (bf) return { kind: 'buf', el: bf };
		var mp = el.closest('#mapWrap');
		if (mp) return { kind: 'map', el: mp };
		return null;
	}
	function markTarget(t) {
		document.querySelectorAll('.thumb.drop, #bufDrop.drop, #mapWrap.drop').forEach(function (x) { x.classList.remove('drop'); });
		if (t && t.el) t.el.classList.add('drop');
	}

	function startDrag(e, g, i) {
		var A = window.App, S = A.S, st = S.st, mat = A.mat(), sh = A.sheet(), svg = $('map').querySelector('svg');
		var idx = P.unitIdx(sh, i), ctm = svg.getScreenCTM();
		drag = { i: i, idx: idx, x0: e.clientX, y0: e.clientY, lx: e.clientX, ly: e.clientY, mm: 1 / ctm.a, moved: false, ok: true, dx: 0, dy: 0, id: e.pointerId, svg: svg, fr: true,
				 orig: idx.map(function (q) { return P.clone(sh.recs[q]); }),
				 gs: idx.map(function (q) { return svg.querySelector('g.pt[data-i="' + q + '"]'); }) };
		try { svg.setPointerCapture(e.pointerId); } catch (er) { /* не страшно */ }
	}
	function moveDrag(e) {
		if (!drag) return;
		var A = window.App, S = A.S, st = S.st, mat = A.mat(), sh = A.sheet();
		drag.lx = e.clientX; drag.ly = e.clientY;
		var dpx = Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0);
		if (!drag.moved && dpx < 4) return;
		if (!drag.moved) { drag.moved = true; drag.gs.forEach(function (g) { if (g) g.classList.add('drag'); }); }
		/* куда несём: другой лист, новый лист, буфер */
		var tg = dropTarget(e.clientX, e.clientY);
		if (tg && (tg.kind === 'map' || (tg.kind === 'thumb' && tg.i === S.si && drag.fromBuf === undefined))) tg = null;
		drag.target = tg;
		markTarget(tg);
		if (drag.fr) {
			/* ФРС: деталь остаётся на месте, за курсором идёт ярлык */
			ghostShow(partLabel(st, st.typeBy[sh.recs[drag.i].t]) + (drag.idx.length > 1 ? ' (группа)' : ''), e.clientX, e.clientY);
			return;
		}
	}
	/* Вернуть лист в состояние до переноса: убрать примеренную деталь из буфера, вернуть повороты. */
	/* Нарисовать одну деталь на уже показанном листе — без перерисовки всей карты (штриховка
	   обрезков при этом остаётся прежней, пока деталь не отпустили). */
	function partNode(st, mat, sh, rc, i) {
		var S = window.App.S, svg = $('map').querySelector('svg'), tmp = document.createElement('div');
		tmp.innerHTML = D.sheet(st, mat, { L: sh.L, W: sh.W, rem: sh.rem, recs: [rc] }, { px: last ? last.px : fitPx(sh) * S.zoom, uid: 'm', color: S.set.color || 'name', tex: texOf(mat), inter: 1, holes: S.holes, offcuts: 0, font: 'Segoe UI, Arial, sans-serif' });
		var src = tmp.querySelector('g.pt'), old = svg.querySelector('g.pt[data-i="' + i + '"]');
		var g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
		g.setAttribute('class', 'pt'); g.setAttribute('data-i', i); g.setAttribute('transform', src.getAttribute('transform'));
		g.innerHTML = src.innerHTML;
		if (old) old.remove();
		svg.insertBefore(g, svg.querySelector('.over'));
		return g;
	}
	function undoTentative(d, sh) {
		if (d.fromBuf !== undefined) sh.recs.splice(d.i, 1);
		else d.idx.forEach(function (q, n) { sh.recs[q] = d.orig[n]; });
	}
	function endDrag(e) {
		if (!drag) return;
		var d = drag, A = window.App, S = A.S, st = S.st, mat = A.mat(), sh = A.sheet(), why;
		drag = null;
		try { d.svg.releasePointerCapture(d.id); } catch (er) { /* не страшно */ }
		markTarget(null); ghostHide();
		if (!d.moved) return;
		var fin = d.idx.map(function (q) { var r = P.clone(sh.recs[q]); r.x = Math.round((r.x + d.dx) * 100) / 100; r.y = Math.round((r.y + d.dy) * 100) / 100; return r; });
		var tg = d.target;
		undoTentative(d, sh);
		if (d.fromBuf !== undefined) S.sel = -1;
		if (tg && tg.kind === 'buf') {
			if (d.fromBuf !== undefined) { quiet = true; A.render(); quiet = false; return; }     /* вернули в буфер */
			A.pushUndo();
			why = P.toBuffer(st, mat.key, S.si, d.i);
			if (why) { S.undo.pop(); U.toast('Убрать в буфер нельзя: ' + why + '.'); M.render(); return; }
			S.sel = -1; A.afterChange(); return;
		}
		if (tg && (tg.kind === 'thumb' || tg.kind === 'new')) {
			var ti = tg.kind === 'new' ? -1 : tg.i;
			A.pushUndo();
			why = d.fromBuf !== undefined ? P.fromBuffer(st, mat.key, d.fromBuf, ti) : P.moveToSheet(st, mat.key, S.si, d.i, ti);
			if (why) { S.undo.pop(); U.toast((d.fromBuf !== undefined ? 'Положить нельзя: ' : 'Перенести нельзя: ') + why + '.'); A.render(); return; }
			S.sel = -1; A.afterChange(); return;
		}
		{
			if (!frHintShown) { frHintShown = true; U.toast('Детали по листу мышью не двигаются: раскладка должна резаться сквозными резами. Деталь можно перетащить в буфер или на миниатюру другого листа слева — программа сама встроит её в полосы.', { ms: 11000 }); }
			M.render(); return;
		}
	}
	function cancelDrag() {
		if (!drag) return;
		var d = drag, sh = window.App.sheet();
		drag = null;
		markTarget(null); ghostHide();
		if (sh) undoTentative(d, sh);
		if (d.fromBuf !== undefined) window.App.S.sel = -1;
		window.App.render();
	}
	M.dragging = function () { return !!drag || !!bdrag; };

	/* --------------------------- перенос из буфера ---------------------------- */
	function bufStop() {
		document.removeEventListener('pointermove', bufMove, true);
		document.removeEventListener('pointerup', bufUp, true);
		document.removeEventListener('pointercancel', bufCancel, true);
		if (bdrag && bdrag.el) bdrag.el.classList.remove('lift');
		bdrag = null;
		markTarget(null); ghostHide();
	}
	function bufCancel() { bufStop(); }
	M.bufDragStart = function (e, bi) {
		var A = window.App, S = A.S, st = S.st, mat = A.mat();
		if (e.button !== 0 || !mat || drag || bdrag) return;
		var it = P.bufOf(st, mat.key)[bi], t = it && st.typeBy[it.t];
		if (!t) return;
		if (A.stale()) { U.toast('Дождитесь окончания раскладки.'); return; }
		bdrag = { bi: bi, it: it, x0: e.clientX, y0: e.clientY, moved: false, id: e.pointerId, el: e.target.closest('.bit'), label: partLabel(st, t) };
		e.preventDefault();
		document.addEventListener('pointermove', bufMove, true);
		document.addEventListener('pointerup', bufUp, true);
		document.addEventListener('pointercancel', bufCancel, true);
	};
	function bufMove(e) {
		if (!bdrag) return;
		if (!bdrag.moved && Math.hypot(e.clientX - bdrag.x0, e.clientY - bdrag.y0) < 4) return;
		var A = window.App, S = A.S, mat = A.mat();
		if (!bdrag.moved) { bdrag.moved = true; if (bdrag.el) bdrag.el.classList.add('lift'); }
		var tg = dropTarget(e.clientX, e.clientY);
		if (tg && tg.kind === 'buf') tg = null;
		if (tg && tg.kind === 'map') {
			if (S.view === 'all' || !A.sheet()) tg = null;
		}
		bdrag.target = tg;
		markTarget(tg);
		ghostShow(bdrag.label, e.clientX, e.clientY);
	}
	function bufUp(e) {
		if (!bdrag) return;
		var b = bdrag, A = window.App, S = A.S, st = S.st, mat = A.mat(), tg = b.moved ? b.target : null;
		bufStop();
		if (!b.moved) return;
		if (!tg) { return; }
		var ti = tg.kind === 'new' ? -1 : (tg.kind === 'map' ? S.si : tg.i);
		A.pushUndo();
		var why = P.fromBuffer(st, mat.key, b.bi, ti);
		if (why) { S.undo.pop(); U.toast('Положить нельзя: ' + why + '.'); return; }
		if (ti < 0) S.si = A.lay().sheets.length - 1; else if (tg.kind === 'thumb') S.si = ti;
		S.sel = -1; S.view = 'sheet';
		A.afterChange();
	}

	M.init = function () {
		var map = $('map');
		map.addEventListener('pointerdown', function (e) {
			if (e.button !== 0) return;
			var A = window.App, S = A.S, g = e.target.closest ? e.target.closest('g.pt') : null;
			if (!g) { if (S.sel >= 0 || S.selType) { S.sel = -1; S.selType = ''; M.mark(); window.Panels.right(); } return; }
			var i = Number(g.dataset.i), sh = A.sheet();
			S.sel = i; S.selType = sh.recs[i].t;
			M.mark(); window.Panels.right();
			if (!A.stale() && S.view !== 'all') { startDrag(e, g, i); e.preventDefault(); }
		});
		/* на документе, а не на карте: деталь уносят и за пределы листа — в буфер, на миниатюру */
		document.addEventListener('pointermove', moveDrag);
		document.addEventListener('pointerup', endDrag);
		document.addEventListener('pointercancel', cancelDrag);
		$('mapWrap').addEventListener('wheel', function (e) { if (!e.ctrlKey) return; e.preventDefault(); M.zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15); }, { passive: false });
		$('bZoomIn').onclick = function () { M.zoomBy(1.25); };
		$('bZoomOut').onclick = function () { M.zoomBy(0.8); };
		$('bZoomFit').onclick = function () { window.App.S.zoom = 1; M.render(); };
		$('bAll').onclick = function () { var S = window.App.S; S.view = S.view === 'all' ? 'sheet' : 'all'; window.App.render(); };
		$('tiles').onclick = function (e) { var t = e.target.closest('.tile'); if (!t) return; var S = window.App.S; S.si = Number(t.dataset.i); S.view = 'sheet'; S.sel = -1; window.App.render(); };
		M.stripSheet = function () {
			var A = window.App, S = A.S, mat = A.mat(), sh = A.sheet();
			if (!sh || !sh.recs.length || A.stale()) return;
			A.pushUndo();
			var n = P.sheetToBuffer(S.st, mat.key, S.si);
			S.sel = -1; S.selType = '';
			A.afterChange();
			U.toast('В буфер снято деталей: ' + n + '. Лист пуст — раскладывайте сами.');
		};
		$('bDropSheet').onclick = function () {
			var A = window.App, S = A.S, mat = A.mat();
			A.pushUndo();
			var why = P.dropSheet(S.st, mat.key, S.si);
			if (why) { S.undo.pop(); U.toast('Удалить лист нельзя: ' + why + '.'); return; }
			S.si = Math.max(0, S.si - 1); S.sel = -1;
			A.afterChange();
		};
		$('bLock').onclick = function () { var A = window.App, sh = A.sheet(); if (!sh) return; A.pushUndo(); sh.lock = sh.lock ? 0 : 1; A.afterChange(); };
		$('bVariant').onclick = function () {
			var A = window.App, S = A.S, mat = A.mat(), sh = A.sheet();
			if (!sh || A.stale()) return;
			var key = mat.key + '#' + S.si, n = (S.variant[key] || 0) + 1, info = {};
			A.pushUndo();
			var why = P.repackSheet(S.st, mat.key, S.si, n, info);
			if (why) { S.undo.pop(); U.toast(why.charAt(0).toUpperCase() + why.substring(1) + '.'); return; }
			S.variant[key] = n; S.sel = -1;
			A.afterChange();
			U.toast('Вариант ' + ((n % info.count) + 1) + ' из ' + info.count);
		};
	};
})();
