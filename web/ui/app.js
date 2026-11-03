/* STHGroup — окно программы: состояние, открытие и сохранение проекта, очередь раскладки. */
(function () {
	'use strict';
	var U = window.UI, P = BM.project, $ = U.$;
	var S = { boot: null, set: BM.defaults(), path: '', doc: null, st: null, matKey: '', si: 0, sel: -1, selType: '', view: 'sheet', zoom: 1, holes: false,
			  listMode: 'sheet', undo: [], redo: [], jobs: {}, queue: [], running: null, saveTimer: 0, setTimer: 0, savedAt: null, saveErr: '', variant: {}, keepAll: {}, dirty: false, mtime: 0, conflict: false,
			  section: 'today', drillKey: '', drillZoom: 1, detailKey: '', detailZoom: 1, asmKey: '', asmZoom: 1, prices: null, estRow: '' };
	/* STHGroup 2.0: раздел при запуске — «Сегодня»; адрес окна может назвать другой (?sec=cut) */
	(function () { var q = /[?&]sec=(model|cut|drill|est|base)\b/.exec(location.search); if (q) S.section = q[1]; })();
	var A = window.App = { S: S };

	/* ------------------------------ текущее ----------------------------------- */
	A.mat = function () { return S.st ? S.st.matBy[S.matKey] : null; };
	A.lay = function () { var m = A.mat(); return (m && m.cfg.on) ? S.st.work.layout[m.key] : null; };
	A.sheet = function () { var l = A.lay(); return l ? l.sheets[S.si] : null; };
	A.busy = function (key) { return !!(S.jobs[key || S.matKey]); };
	A.stale = function () { var m = A.mat(); return !!m && (A.busy(m.key) || P.isStale(S.st, m)); };

	/* ------------------------------ настройки --------------------------------- */
	A.saveSettings = function (now) {
		clearTimeout(S.setTimer);
		S.setTimer = setTimeout(function () { U.api.saveSettings(S.set).catch(U.error); }, now ? 0 : 400);
	};
	A.applyTheme = function () {
		var th = BM.theme(S.set.theme), root = document.documentElement;
		root.dataset.theme = th.base;
		if (th.id === 'light' || th.id === 'dark') delete root.dataset.skin; else root.dataset.skin = th.id;
		document.documentElement.classList.toggle('noanim', S.set.anim === 0);
		$('sColor').value = S.set.color || 'name';
	};
	/* Масштаб окна (кнопки, текст, панели): 50–200 %, шаг 5 %. Меняет само окно (WebView2 на компьютере, WebView на планшете) —
	   координаты мыши и размеры остаются согласованными. PDF, Excel и печать не меняются. */
	A.ZOOM_MIN = 0.5; A.ZOOM_MAX = 2;
	A.zoomNative = null;              // null — ещё не знаем; false — окно в браузере, масштаб — браузера (Ctrl + / Ctrl −)
	A.setZoom = function (z, noSave) {
		z = Math.round(Math.max(A.ZOOM_MIN, Math.min(A.ZOOM_MAX, Number(z) || 1)) * 20) / 20;
		S.set.zoom = z;
		if (!noSave) A.saveSettings(true);
		var fire = function () { try { document.dispatchEvent(new CustomEvent('brzoom')); } catch (e) { } };
		fire();
		if (noSave && z === 1) return Promise.resolve({});      // при запуске 100% — окну нечего менять
		return U.api.zoom(z).then(function (r) { A.zoomNative = !!(r && r.native); fire(); return r; });
	};
	A.zoomStep = function (d) { return A.setZoom((S.set.zoom || 1) + d); };
	function zoomKeys() {
		document.addEventListener('keydown', function (e) {
			if (!(e.ctrlKey || e.metaKey) || e.altKey || A.zoomNative === false) return;
			var k = e.key, c = e.code || '';
			if (e.shiftKey) return;      // Ctrl+Shift+= и Ctrl+Shift+− — свои команды разделов (дерево модели: развернуть и свернуть всё)
			if (k === '+' || k === '=' || c === 'NumpadAdd' || c === 'Equal') A.zoomStep(0.05);
			else if (k === '-' || k === '_' || c === 'NumpadSubtract' || c === 'Minus') A.zoomStep(-0.05);
			else if (c === 'Digit0' || c === 'Numpad0' || k === '0') A.setZoom(1);
			else return;
			e.preventDefault(); e.stopPropagation();
		}, true);
		var acc = 0;
		document.addEventListener('wheel', function (e) {
			if (!e.ctrlKey || A.zoomNative === false) return;
			if (e.target && e.target.closest && e.target.closest('#mapWrap')) return;      // на карте раскроя Ctrl + колёсико увеличивает карту
			e.preventDefault(); e.stopPropagation();
			acc += e.deltaY;
			if (Math.abs(acc) < 40) return;      // тачпад шлёт много мелких шагов
			A.zoomStep(acc < 0 ? 0.05 : -0.05); acc = 0;
		}, { passive: false, capture: true });
	}
	/* Запомнить настройки материала для следующих проектов. */
	A.rememberMat = function (m) {
		S.set.mats[m.key] = { fmts: P.clone(m.cfg.fmts), fmt: m.cfg.fmt, grain: m.cfg.grain, on: m.cfg.on };
		A.saveSettings();
	};

	A.lockedCount = function (key) { var l = S.st && S.st.work.layout[key]; return l ? l.sheets.filter(function (s) { return s.lock; }).length : 0; };

	/* --------------------------- отмена и повтор ------------------------------ */
	A.pushUndo = function () {
		S.undo.push(JSON.stringify(S.doc.work));
		if (S.undo.length > 60) S.undo.shift();
		S.redo = [];
	};
	function restore(json) {
		A.cancelJobs();
		S.doc.work = JSON.parse(json);
		S.st.work = S.doc.work;
		if (!S.st.work.est) S.st.work.est = { qty: {}, disc: 0, client: '', rows: [], pl: '' };
		$('iSets').value = S.st.work.sets;                 // отмена возвращает и число комплектов
		P.refresh(S.st);
		S.sel = -1; S.selType = '';
		A.afterChange(true);
	}
	A.undo = function () { if (!S.undo.length) return; S.redo.push(JSON.stringify(S.doc.work)); restore(S.undo.pop()); };
	A.redo = function () { if (!S.redo.length) return; S.undo.push(JSON.stringify(S.doc.work)); restore(S.redo.pop()); };

	/* ------------------------------ сохранение -------------------------------- */
	/* Проект сохраняется сам, вскоре после каждой правки. Если файл на диске поменял кто-то
	   другой (новая выгрузка из БАЗИСа, копия по сети), поверх него не пишем — спрашиваем. */
	/* Записи идут по очереди: вторая не начинается, пока первая не запомнила новое время файла, —
	   иначе программа принимала свою же запись за чужую и спрашивала «Файл проекта изменился». */
	var writeQ = Promise.resolve();
	function writeNow(force) {
		if (!S.path || !S.doc) return writeQ;
		var path = S.path, text = JSON.stringify(S.doc);      // что и куда — сразу: пока ждём диск, вкладку могут сменить
		writeQ = writeQ.then(function () { return writeOne(force, path, text); });
		return writeQ;
	}
	/* Файл внутрь проекта одним файлом (превью): в ту же очередь записей и с новым временем файла — иначе
	   следующее сохранение приняло бы это за чужую правку. */
	A.packWrite = function (bmk, name, data) {
		writeQ = writeQ.then(async function () {
			try {
				await U.api.write(bmk + '!' + U.sep + name, data);
				var st = await U.api.stat(bmk), mt = st && st.exists ? st.mtime : 0;
				if (bmk === S.path) S.mtime = mt; else { var tb = S.tabs[A.tabOf(bmk)]; if (tb) tb.mtime = mt; }
			} catch (e) { }
		});
		return writeQ;
	};
	async function writeOne(force, path, text) {
		var tb0 = path === S.path ? null : S.tabs[A.tabOf(path)], mt = tb0 ? tb0.mtime : (path === S.path ? S.mtime : 0);      // время файла — после прежней записи
		try {
			if (!force && mt) {
				var st0 = await U.api.stat(path);
				if (st0.exists && st0.mtime !== mt) { if (path === S.path) conflict(); return; }
			}
			await U.api.write(path, text);
			var st1 = await U.api.stat(path);
			if (path === S.path) { S.mtime = st1.exists ? st1.mtime : 0; S.savedAt = new Date(); S.saveErr = ''; S.dirty = S.dirty && text !== JSON.stringify(S.doc); }
			else { var tb = S.tabs[A.tabOf(path)]; if (tb) { tb.mtime = st1.exists ? st1.mtime : 0; tb.savedAt = new Date(); tb.saveErr = ''; tb.dirty = tb.dirty && text !== JSON.stringify(tb.doc); } }      // вкладку уже сменили
			A.renderTabs();
		} catch (e) {
			if (!S.saveErr) U.toast('Проект не сохраняется: ' + e.message, { bad: true });
			S.saveErr = e.message;
		}
		A.renderStatus();
	}
	function conflict() {
		if (S.conflict) return;
		S.conflict = true; S.saveErr = 'файл проекта изменён другой программой';
		A.renderStatus();
		U.modal({ title: 'Файл проекта изменился', width: 520, sticky: true,
			body: '<p>Файл <b>' + U.esc(U.baseOf(S.path)) + '</b> изменён не из этого окна — например, проект заново выгрузили из БАЗИСа.</p><p class="mute">«Открыть новый» — взять файл с диска (ваши последние правки в этом окне пропадут). «Оставить мой» — записать поверх него то, что сейчас в окне.</p>',
			buttons: [{ label: 'Оставить мой', value: 'mine' }, { label: 'Открыть новый', value: 'disk', primary: true }]
		}).then(function (v) {
			S.conflict = false;
			if (v === 'mine') { S.saveErr = ''; writeNow(true); }
			else A.openPath(S.path);
		});
	}
	A.save = function (now) {
		if (!S.path || !S.doc) return;
		if (!S.dirty) { S.dirty = true; A.renderTabs(); }
		clearTimeout(S.saveTimer);
		S.saveTimer = setTimeout(function () { writeNow(false); }, now ? 0 : 250);
	};
	/* Окно закрывают — дописать то, что не успело сохраниться. */
	function flush() {
		if (!S.dirty || !S.path || !S.doc || S.conflict) return;
		clearTimeout(S.saveTimer);
		try { navigator.sendBeacon(U.api.beaconUrl(S.path), new Blob([JSON.stringify(S.doc)], { type: 'application/octet-stream' })); S.dirty = false; } catch (e) { /* не вышло — остаётся прошлое сохранение */ }
	}

	/* ------------------------------ вкладки ----------------------------------- */
	/* Каждый открытый проект — вкладка под шапкой. Состояние проекта (файл, модель, раскладка, отмена,
	   выбранный лист…) у каждой своё; на экране — поля S текущей вкладки, остальные хранятся в S.tabs. */
	var TAB_KEYS = ['path', 'doc', 'st', 'matKey', 'si', 'sel', 'selType', 'view', 'zoom', 'undo', 'redo', 'savedAt', 'saveErr', 'variant', 'keepAll', 'dirty', 'mtime', 'drillKey', 'drillZoom', 'detailKey', 'detailZoom', 'asmKey', 'asmZoom', 'estRow'];
	S.tabs = []; S.tab = -1;
	function snap() { var o = {}; TAB_KEYS.forEach(function (k) { o[k] = S[k]; }); return o; }
	function put(t) { TAB_KEYS.forEach(function (k) { S[k] = t[k]; }); }
	function samePath(a, b) { return String(a || '').replace(/\\/g, '/').toLowerCase() === String(b || '').replace(/\\/g, '/').toLowerCase(); }
	A.tabOf = function (path) { for (var i = 0; i < S.tabs.length; i++) if (samePath(S.tabs[i].path, path)) return i; return -1; };
	function claimAll() { U.api.current(S.tabs.map(function (t) { return t.path; })); }
	/* уйти с текущей вкладки: дописать несохранённое, остановить раскладку, запомнить состояние */
	function leaveTab() {
		if (S.tab < 0 || !S.doc) return;
		if (S.dirty && !S.conflict) { clearTimeout(S.saveTimer); writeNow(false); }
		A.cancelJobs();
		S.tabs[S.tab] = snap();
	}
	function showTab() {
		var st = S.st;
		window.Est.prev = null;
		$('welcome').hidden = true;
		noProject(false);
		U.api.title((BM.project.modelName(st.model) || U.stemOf(S.path)) + ' — STHGroup');
		document.title = (BM.project.modelName(st.model) || U.stemOf(S.path)) + ' — STHGroup';
		$('iSets').value = st.work.sets;
		$('sQuality').value = st.work.params.quality;
		A.render();
		A.nestCheck();
		A.renderTabs();
	}
	A.switchTab = function (i) {
		if (i === S.tab || !S.tabs[i]) return;
		leaveTab();
		S.tab = i; put(S.tabs[i]);
		showTab();
	};
	A.closeTab = function (i) {
		if (!S.tabs[i]) return;
		if (i !== S.tab) { S.tabs.splice(i, 1); if (i < S.tab) S.tab--; A.renderTabs(); claimAll(); return; }
		leaveTab();
		S.tabs.splice(i, 1);
		if (S.tabs.length) { S.tab = Math.min(i, S.tabs.length - 1); put(S.tabs[S.tab]); showTab(); }
		else {
			S.tab = -1;
			put({ path: '', doc: null, st: null, matKey: '', si: 0, sel: -1, selType: '', view: 'sheet', zoom: 1, undo: [], redo: [], savedAt: null, saveErr: '', variant: {}, keepAll: {}, dirty: false, mtime: 0, drillKey: '', drillZoom: 1, detailKey: '', detailZoom: 1, asmKey: '', asmZoom: 1, estRow: '' });
			$('projTitle').textContent = ''; document.title = 'STHGroup'; U.api.title('STHGroup');
			welcome();
			if (S.section === 'base') window.Base.render();
			A.renderTabs();
		}
		claimAll();
	};
	A.renderTabs = function () {
		var bar = $('ptabs');
		bar.hidden = !S.tabs.length;
		var h = S.tabs.map(function (t, i) {
			var cur = i === S.tab, dirty = cur ? S.dirty : t.dirty, st = cur ? S.st : t.st, name = st ? (BM.project.modelName(st.model) || U.stemOf(t.path)) : U.stemOf(t.path);
			return '<div class="ptab' + (cur ? ' on' : '') + '" data-i="' + i + '" title="' + U.esc(cur ? S.path : t.path) + '">' + (dirty ? '<span class="dot" title="Есть несохранённые правки"></span>' : '') + '<span class="nm">' + U.esc(name) + '</span><button class="x" title="Закрыть вкладку">✕</button></div>';
		}).join('');
		if (bar.innerHTML !== h) bar.innerHTML = h;           // перерисовка только при перемене: по вкладке можно щёлкнуть во время раскладки
	};

	/* После любой правки: пересобрать материалы, перерисовать, сохранить, запустить раскладку. */
	A.afterChange = function (structural) {
		if (!S.st) return;
		if (structural) P.refresh(S.st);
		if (!S.st.matBy[S.matKey]) S.matKey = firstMat();
		var l = A.lay();
		if (!l || S.si >= l.sheets.length) S.si = Math.max(0, (l ? l.sheets.length : 1) - 1);
		A.render();
		A.save();
		A.nestCheck();
	};
	function firstMat() {
		var ms = S.st.mats, i;
		for (i = 0; i < ms.length; i++) if (ms[i].cfg.on && P.instances(S.st, ms[i]).length) return ms[i].key;
		return ms.length ? ms[0].key : '';
	}

	/* ------------------------------ раскладка --------------------------------- */
	A.cancelJobs = function (key) {
		for (var k in S.jobs) {
			if (!S.jobs.hasOwnProperty(k) || (key && k !== key)) continue;
			if (S.jobs[k].worker) S.jobs[k].worker.terminate();
			if (S.running === S.jobs[k]) S.running = null;
			delete S.jobs[k];
		}
		S.queue = S.queue.filter(function (q) { return S.jobs[q.key] === q; });
	};
	A.nestCheck = function () {
		if (!S.st) return;
		var ms = S.st.mats.slice(0);
		ms.sort(function (a, b) { return (b.key === S.matKey) - (a.key === S.matKey); });
		for (var i = 0; i < ms.length; i++) {
			var m = ms[i], job = S.jobs[m.key];
			if (!m.cfg.on) { if (job) A.cancelJobs(m.key); continue; }
			var stale = P.isStale(S.st, m);
			if (job && (job.lkey !== P.layoutKey(S.st, m) || !stale)) { A.cancelJobs(m.key); job = null; }
			if (stale && !job) {
				job = S.jobs[m.key] = { id: Date.now() + '.' + Math.random(), key: m.key, lkey: P.layoutKey(S.st, m), progress: 0 };
				S.queue.push(job);
			}
		}
		pump();
	};
	function pump() {
		if (S.running || !S.queue.length) return;
		var job = S.queue.shift();
		if (S.jobs[job.key] !== job) { pump(); return; }
		var m = S.st.matBy[job.key];
		var prep = P.prepare(S.st, job.key, !!S.keepAll[job.key]);
		job.prep = prep;
		function finish(res) {
			if (S.jobs[job.key] !== job) return;
			delete S.jobs[job.key];
			S.running = null;
			delete S.keepAll[job.key];
			if (P.layoutKey(S.st, m) === job.lkey) {
				P.applyResult(S.st, prep, res);
				var bad = P.verify(S.st, job.key).concat(P.verifyCut(S.st, job.key));
				if (bad.length) { console.error('Самопроверка раскладки', bad); U.toast('Раскладка «' + P.matTitle(m) + '» не прошла самопроверку: ' + bad[0], { bad: true }); }
				if (prep.warn.length) U.toast(prep.warn[0]);
				if (job.key === S.matKey) { var l = A.lay(); if (S.si >= l.sheets.length) S.si = 0; S.sel = -1; }
				A.render(); A.save();
			}
			A.nestCheck();
		}
		if (!prep.items.length) { S.running = job; finish({ sheets: [], unplaced: [], saw: 0 }); return; }
		S.running = job;
		var w;
		try { w = new Worker('worker.js'); } catch (e) { w = null; }
		if (!w) {
			/* фоновый поток недоступен — считаем здесь же (окно на это время замрёт) */
			setTimeout(function () { try { finish(BM.cut.nest(prep.items, prep.bins, prep.opt)); } catch (e2) { delete S.jobs[job.key]; S.running = null; U.error(e2); } }, 30);
			return;
		}
		job.worker = w;
		w.onmessage = function (e) {
			var d = e.data;
			if (d.id !== job.id) return;
			if (d.progress !== undefined) { job.progress = d.progress; A.renderJobs(); return; }
			if (d.coreFail) { console.warn('Раскрой: ядро C++ не сработало, считает JavaScript —', d.coreFail); return; }
			w.terminate(); job.worker = null;
			if (d.error) { delete S.jobs[job.key]; S.running = null; U.toast('Раскладка не удалась: ' + d.error, { bad: true }); pump(); return; }
			finish(d.res);
		};
		w.onerror = function (e) { w.terminate(); delete S.jobs[job.key]; S.running = null; U.toast('Раскладка не удалась: ' + (e.message || 'сбой фонового потока'), { bad: true }); pump(); };
		w.postMessage({ id: job.id, items: prep.items, bins: prep.bins, opt: prep.opt, core: BM.native && BM.native.on ? BM.native.token : '' });
		A.renderJobs();
	}
	/* «Улучшить» (1.16): долгий перебор раскладки текущего материала (больше минуты) — меньше листов, свободное место
	   одним куском. Полоска хода; новая раскладка ставится, только если она лучше прежней. Закреплённые листы и буфер — как были. */
	A.improve = async function () {
		var m = A.mat(), l = A.lay();
		if (!m || !m.cfg.on || !l || !S.st) return;
		if (S.jobs[m.key]) { U.toast('Дождитесь, пока закончится раскладка.'); return; }
		var prep = P.prepare(S.st, m.key, false);
		if (!prep.items.length) { U.toast('Все листы закреплены — улучшать нечего.'); return; }
		prep.opt.improve = 1; prep.opt.quality = 2; prep.opt.timeMs = window.BR_IMPROVE_MS || 60000;      // BR_IMPROVE_MS — только для проверок
		var lkey = P.layoutKey(S.st, m), w = null, t0 = Date.now(), closeM = null;
		var res = await new Promise(function (resolve) {
			var done = false, finish = function (v) { if (done) return; done = true; if (w) w.terminate(); resolve(v); };
			U.modal({ title: 'Улучшить раскладку', width: 460, cls: 'impM',
				body: '<p>«' + U.esc(P.matTitle(m)) + '»: программа перебирает много вариантов — меньше листов, свободное место одним куском. Это может занять больше минуты.</p><div class="impBar"><i></i></div><p class="mute impT">Начинаю…</p>',
				buttons: [{ label: 'Отмена', value: false }],
				onOpen: function (el, close) {
					closeM = close;
					var bar = el.querySelector('.impBar i'), tx = el.querySelector('.impT');
					var show = function (f) { bar.style.width = Math.round(Math.max(0.02, Math.min(1, f)) * 100) + '%'; tx.textContent = Math.round(f * 100) + ' % · ' + Math.round((Date.now() - t0) / 1000) + ' с'; };
					try { w = new Worker('worker.js'); } catch (e) { w = null; }
					if (!w) { setTimeout(function () { try { var r = BM.cut.nest(prep.items, prep.bins, prep.opt); close(true); finish(r); } catch (e2) { close(false); finish(null); U.error(e2); } }, 30); return; }
					var id = 'imp' + t0;
					w.onmessage = function (e) { var d = e.data; if (d.id !== id) return; if (d.progress !== undefined) { show(d.progress); return; } if (d.coreFail) return; close(true); finish(d.error ? null : d.res); if (d.error) U.toast('Улучшить не удалось: ' + d.error, { bad: true }); };
					w.onerror = function (e) { close(false); finish(null); U.toast('Улучшить не удалось: ' + (e.message || 'сбой фонового потока'), { bad: true }); };
					w.postMessage({ id: id, items: prep.items, bins: prep.bins, opt: prep.opt, core: BM.native && BM.native.on ? BM.native.token : '' });
				}
			}).then(function (v) { if (v !== true) finish(null); });
		});
		if (!res || S.st.matBy[m.key] !== m || P.layoutKey(S.st, m) !== lkey) return;
		var old = S.st.work.layout[m.key], was = P.layoutMetric(S.st, old);
		A.pushUndo();
		var nl = P.applyResult(S.st, prep, res), now2 = P.layoutMetric(S.st, nl);
		if (!P.betterLayout(now2, was, S.st)) {
			S.st.work.layout[m.key] = old; S.undo.pop();
			U.toast('Лучше найти не удалось — раскладка осталась прежней (листов: ' + was.n + ').');
			return;
		}
		var pc = function (x) { return (Math.round(x * 1000) / 10).toString().replace('.', ',') + ' %'; }, w0 = was.tot, w1 = now2.tot;
		S.sel = -1; if (S.si >= nl.sheets.length) S.si = 0;
		A.render(); A.save();
		U.toast('Раскладка улучшена: листов ' + (now2.n < was.n ? was.n + ' → ' + now2.n : now2.n) + ', КИМ ' + pc(w0.kim) + ' → ' + pc(w1.kim) + ', резов ' + w0.cuts + ' → ' + w1.cuts + ', поворотов ' + w0.rot + ' → ' + w1.rot + '. Вернуть — Ctrl+Z.', { ms: 9000 });
	};
	/* «Пересчитать»: разложить материал заново. */
	A.renest = async function () {
		var m = A.mat(), l = A.lay();
		if (!m || !m.cfg.on) return;
		var locked = l ? l.sheets.filter(function (s) { return s.lock; }).length : 0, all = false;
		if (locked) {
			var v = await U.modal({ title: 'Пересчитать раскладку', width: 480, body: '<p>На ' + locked + ' ' + plural(locked, 'листе', 'листах', 'листах') + ' раскладку правили вручную — они закреплены.</p>',
				buttons: [{ label: 'Отмена', value: null }, { label: 'Пересчитать всё', value: 'all' }, { label: 'Закреплённые не трогать', value: 'keep', primary: true }] });
			if (!v) return;
			all = v === 'all';
		}
		/* детали в буфере: оставить пользователю или разложить вместе со всеми */
		var nb = l ? P.bufOf(S.st, m.key).length : 0, take = false;
		if (nb) {
			var b = await U.modal({ title: 'Пересчитать раскладку', width: 480, body: '<p>В буфере ' + nb + ' ' + plural(nb, 'деталь', 'детали', 'деталей') + ' — вы сняли ' + (nb === 1 ? 'её' : 'их') + ' с листов, чтобы разложить самому.</p>',
				buttons: [{ label: 'Отмена', value: null }, { label: 'Разложить и ' + (nb === 1 ? 'её' : 'их'), value: 'take' }, { label: 'Оставить в буфере', value: 'keep', primary: true }] });
			if (!b) return;
			take = b === 'take';
		}
		if (S.st.matBy[m.key] !== m) return;
		A.pushUndo();
		A.cancelJobs(m.key);
		l = S.st.work.layout[m.key];
		if (l) { if (all) l.sheets.forEach(function (s) { s.lock = 0; }); if (take) delete l.buf; l.key = ''; }
		A.afterChange();
	};
	function plural(n, one, few, many) { var a = n % 10, b = n % 100; return (a === 1 && b !== 11) ? one : ((a >= 2 && a <= 4 && (b < 10 || b >= 20)) ? few : many); }
	A.plural = plural;

	/* ------------------------------ открытие ---------------------------------- */
	A.openDialog = async function () {
		var p = await U.pick({ kind: 'open', title: 'Открыть проект STHGroup', dir: S.path ? U.dirOf(S.path) : (S.set.lastDir || S.boot.docs), filters: [{ name: 'Проект STHGroup', ext: ['bmk'] }] });
		if (p) A.openPath(p);
	};
	/* Тестовая версия запоминает, какие разделы открывались с проектом: это уходит автору в ежедневной отметке. */
	A.noteSection = function () { if (S.boot && S.boot.edition === 'user') U.api.tester.sec(S.section).catch(function () { }); };
	A.openPath = async function (path) {
		var text, doc;
		try { text = await U.api.readText(path); } catch (e) { U.error(e); return false; }
		try { doc = JSON.parse(text); } catch (e2) { U.toast('Файл повреждён или это не проект STHGroup: ' + U.baseOf(path), { bad: true }); return false; }
		if (!doc || doc.format !== BM.FORMAT || !doc.model || !Array.isArray(doc.model.parts)) { U.toast('Это не проект STHGroup: ' + U.baseOf(path), { bad: true }); return false; }
		if (doc.version > 1) U.toast('Проект создан более новой версией программы — что-то может отображаться неверно.');
		/* вкладка: такой проект уже открыт — перечитываем его вкладку, иначе — новая вкладка */
		var prevTab = S.tab, ti = A.tabOf(path), made = false;
		if (ti < 0) { if (S.doc) leaveTab(); S.tabs.push({ path: path }); S.tab = S.tabs.length - 1; made = true; }
		else if (ti !== S.tab) { leaveTab(); S.tab = ti; }
		A.cancelJobs();
		var fresh = !doc.work;
		S.path = path; S.doc = doc; S.estRow = ''; window.Est.prev = null; S.drillKey = ''; S.drillZoom = 1; S.detailKey = ''; S.detailZoom = 1; S.asmKey = ''; S.asmZoom = 1; S.undo = []; S.redo = []; S.sel = -1; S.selType = ''; S.si = 0; S.view = 'sheet'; S.zoom = 1; S.variant = {}; S.keepAll = {}; S.savedAt = null; S.saveErr = ''; S.dirty = false; S.mtime = 0;
		try { var fst = await U.api.stat(path); S.mtime = fst.exists ? fst.mtime : 0; } catch (e0) { S.mtime = 0; }
		try { S.st = P.build(doc, S.set); } catch (e3) {
			console.error(e3); U.toast('Не удалось прочитать проект: ' + e3.message, { bad: true }); S.doc = null; S.st = null;
			if (made) { S.tabs.splice(S.tab, 1); S.tab = -1; if (prevTab >= 0 && S.tabs[prevTab]) { S.tab = prevTab; put(S.tabs[prevTab]); showTab(); } }
			A.renderTabs();
			return false;
		}
		S.tabs[S.tab] = snap();
		claimAll();
		A.renderTabs();
		A.noteSection();
		var st = S.st, i;
		/* раскладка из файла должна пройти самопроверку — иначе раскладываем заново */
		for (i = 0; i < st.mats.length; i++) {
			var m = st.mats[i];
			if (st.work.layout[m.key] && !P.isStale(st, m) && P.verify(st, m.key).length) delete st.work.layout[m.key];
		}
		S.matKey = firstMat();
		$('welcome').hidden = true;
		noProject(false);
		S.set.lastDir = U.dirOf(path);
		S.set.recent = [path].concat((S.set.recent || []).filter(function (x) { return x !== path; })).slice(0, 8);
		A.saveSettings();
		U.api.title((BM.project.modelName(st.model) || U.stemOf(path)) + ' — STHGroup');
		document.title = (BM.project.modelName(st.model) || U.stemOf(path)) + ' — STHGroup';
		$('iSets').value = st.work.sets;
		$('sQuality').value = st.work.params.quality;
		A.render();
		A.splashOff();

		/* что раскраивать: всю модель или выделенное */
		if (fresh && st.model.selected > 0 && st.model.selected < st.model.parts.length) {
			var sc = await U.modal({ title: 'Что раскраивать', width: 470, sticky: true, body: '<p>В модели выделено деталей: <b>' + st.model.selected + '</b> из ' + st.model.parts.length + '.</p><p class="mute">Выбор можно поменять в любой момент — внизу окна.</p>',
				buttons: [{ label: 'Только выделенное', value: 'sel' }, { label: 'Всю модель', value: 'all', primary: true }] });
			st.work.scope = sc === 'sel' ? 'sel' : 'all';
			S.matKey = firstMat();
		}
		/* модель изменилась после прошлой выгрузки */
		if (doc.modelPrev) {
			var df = null;
			try { df = P.diff(doc.modelPrev, doc.model, st.work.scope); } catch (e4) { df = null; }
			doc.modelPrev = null;
			if (df && df.any && Object.keys(st.work.layout).length) {
				var choice = await window.Dlg.diff(df);
				if (choice === 'all') st.work.layout = {};
				else for (i = 0; i < st.mats.length; i++) S.keepAll[st.mats[i].key] = 1;
			}
		}
		A.afterChange(true);
		if (P.mojibake(doc) >= 3) U.toast('Выгрузка сделана со сбоем кодировки: русские слова в ней искажены. Обновите программу (в ней скрипт выгрузки 1.7.1) и выгрузите модель из БАЗИСа заново.', { bad: true, ms: 20000 });
		if (!fresh && window.Dlg.paramsDiffer()) U.toast('Раскрой в этом проекте сделан с другими настройками, чем ваши.', { actions: [{ label: 'Показать', run: function () { window.Dlg.settings('cut'); } }] });
		return true;
	};
	A.saveAs = async function () {
		if (!S.doc) return;
		var p = await U.pick({ kind: 'save', title: 'Сохранить проект как', dir: U.dirOf(S.path), name: U.baseOf(S.path), filters: [{ name: 'Проект STHGroup', ext: ['bmk'] }] });
		if (!p) return;
		if (!/\.bmk$/i.test(p)) p += '.bmk';
		try { await U.api.write(p, JSON.stringify(S.doc), S.path); } catch (e) { U.error(e); return; }
		S.path = p; S.savedAt = new Date(); S.saveErr = ''; S.dirty = false;
		try { var st2 = await U.api.stat(p); S.mtime = st2.exists ? st2.mtime : 0; } catch (e2) { S.mtime = 0; }
		if (S.tab >= 0) S.tabs[S.tab] = snap();
		claimAll(); A.renderTabs();
		S.set.recent = [p].concat((S.set.recent || []).filter(function (x) { return x !== p; })).slice(0, 8);
		A.saveSettings();
		A.renderStatus();
		U.toast('Проект сохранён: ' + U.baseOf(p));
	};

	/* ------------------------------ отрисовка --------------------------------- */
	A.render = function () {
		if (!S.st) return;
		BM.project.posPrefix = ((S.st.work.params.cut) || {}).posPrefix || '';
		$('projTitle').textContent = (S.st.model.order ? S.st.model.order + ' · ' : '') + (BM.project.modelName(S.st.model) || U.stemOf(S.path));
		window.Panels.left();
		window.MapView.render();
		window.Panels.right();
		window.Drill.render();
		if (window.Detail) window.Detail.render();
		if (window.Asm) window.Asm.render();
		window.Est.render();
		window.Model.render();
		if (S.section === 'base') window.Base.render();
		A.renderStatus();
		$('bUndo').disabled = !S.undo.length; $('bRedo').disabled = !S.redo.length;
	};
	A.renderJobs = function () { window.Panels.jobs(); window.MapView.busy(); };
	/* Настройка «скрытые панели» поменялась: набор деталей проекта другой — собираем состояние заново. */
	A.rebuild = function () {
		if (!S.doc) return;
		A.cancelJobs();
		S.st = P.build(S.doc, S.set);
		S.sel = -1; S.selType = ''; S.si = 0;
		if (!S.st.matBy[S.matKey]) S.matKey = firstMat();
		A.afterChange(true);
	};
	A.renderStatus = function () {
		if (!S.st) return;
		var sm = P.summary(S.st), h = 'Листов: <b>' + sm.sheets + '</b>&emsp;Деталей: <b>' + sm.total + '</b>';
		h += '&emsp;<span class="' + (sm.unplaced ? 'bad' : '') + '">Не уложено: <b>' + sm.unplaced + '</b></span>';
		if (sm.buf) h += '&emsp;<span class="warn" title="Детали, снятые с листов в буфер: их нужно положить, прежде чем выпускать документы">В буфере: <b>' + sm.buf + '</b></span>';
		h += '&emsp;<span class="' + (sm.noPos ? 'warn' : '') + '" title="Детали, у которых в БАЗИСе не заполнены «Поз.» или «Обозначение»">Без позиции: <b>' + sm.noPos + '</b></span>';
		var nj = Object.keys(S.jobs).length;
		if (nj) h += '&emsp;<span class="warn">Идёт раскладка…</span>';
		$('stInfo').innerHTML = h;
		var sel = S.st.model.selected || 0;
		$('stScope').innerHTML = sel ? 'Область: <button class="link" id="bScope">' + (S.st.work.scope === 'sel' ? 'только выделенное (' + sel + ')' : 'вся модель') + '</button>' : '';
		if (sel) $('bScope').onclick = function () { A.pushUndo(); S.st.work.scope = S.st.work.scope === 'sel' ? 'all' : 'sel'; S.sel = -1; A.afterChange(true); };
		$('stSave').innerHTML = S.saveErr ? '<span class="bad" title="' + U.esc(S.saveErr) + '">Проект не сохранён</span>' : (S.savedAt ? 'Проект сохранён ' + S.savedAt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : U.esc(U.baseOf(S.path)));
	};

	/* --------------------------------- запуск --------------------------------- */
	/* Заставка играет сама (ui/splash.js) и сама уходит; программа под ней тем временем открывает проект. */
	A.splashOff = function () { };
	/* Список тем под кнопкой ◐: образец из трёх цветов и название; выбранная отмечена. */
	function themeMenu(btn) {
		var old = document.querySelector('.thMenu');
		if (old) { old.remove(); return; }
		var m = document.createElement('div'), cur = BM.theme(S.set.theme).id, h = '';
		m.className = 'thMenu'; m.setAttribute('role', 'menu');
		BM.THEMES.forEach(function (t, i) {
			if (i && t.base !== BM.THEMES[i - 1].base) h += '<hr>';
			h += '<button data-th="' + t.id + '" role="menuitemradio" class="' + (t.id === cur ? 'on' : '') + '"><span class="sw">' + t.sw.map(function (c) { return '<i style="background:' + c + '"></i>'; }).join('') + '</span>' + U.esc(t.name) + '</button>';
		});
		m.innerHTML = h;
		document.body.appendChild(m);
		var r = btn.getBoundingClientRect();
		m.style.top = (r.bottom + 6) + 'px';
		m.style.left = Math.max(8, Math.min(window.innerWidth - m.offsetWidth - 8, r.right - m.offsetWidth)) + 'px';
		function close() { m.remove(); document.removeEventListener('mousedown', out, true); document.removeEventListener('keydown', key, true); }
		function out(e) { if (!m.contains(e.target) && e.target !== btn) close(); }
		function key(e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } }
		document.addEventListener('mousedown', out, true); document.addEventListener('keydown', key, true);
		m.onclick = function (e) {
			var b = e.target.closest('button[data-th]');
			if (!b) return;
			S.set.theme = b.dataset.th; A.applyTheme(); A.saveSettings(); close();
			if (S.st) A.render();
		};
	}
	/* Проекта нет: интерфейс открыт целиком, но кнопки, которым нужен проект, не нажимаются. */
	var NEED_PROJECT = ['bSaveAs', 'bToDisk', 'bMats', 'iSets', 'sQuality', 'bNest', 'bPdf', 'bXlsx', 'bDxf', 'bLists'];
	function noProject(on) {
		document.body.classList.toggle('noproj', !!on);
		NEED_PROJECT.forEach(function (id) { var e = $(id); if (e) { e.disabled = !!on; if (on) e.dataset.why = e.title || ''; e.title = on ? 'Сначала откройте проект' : (e.dataset.why || e.title); } });
	}
	/* карточка «Проект не открыт» лежит в середине того раздела, который сейчас на экране */
	A.placeWelcome = function () {
		if (S.st) return;
		var host = $(S.section === 'drill' ? 'dCenter' : S.section === 'detail' ? 'kCenter' : S.section === 'asm' ? 'aCenter' : (S.section === 'est' ? 'eCenter' : (S.section === 'model' ? 'mCenter' : 'center'))), w = $('welcome');
		if (host && w.parentNode !== host) host.appendChild(w);
	};
	function welcome() {
		A.splashOff();
		noProject(true);
		A.placeWelcome();
		$('welcome').hidden = false;
		$('stInfo').textContent = 'Проект не открыт';
		$('wVer').textContent = 'версия ' + (S.boot ? S.boot.version : BM.VERSION);
		var rec = (S.set.recent || []), h = rec.length ? '<div class="mute" style="cursor:default">Недавние проекты</div>' : '';
		rec.forEach(function (p, i) { h += '<div data-i="' + i + '">' + U.esc(U.stemOf(p)) + '<span>' + U.esc(U.dirOf(p)) + '</span></div>'; });
		$('recent').innerHTML = h;
		/* у проекта одним файлом — картинка-превью из него самого */
		rec.forEach(function (p, i) {
			var pv = p + '!' + U.sep + 'preview.jpg';
			U.api.stat(pv).then(function (st) {
				var d = $('recent').querySelector('div[data-i="' + i + '"]');
				if (!st || !st.exists || !d || d.querySelector('img')) return;
				var im = document.createElement('img'); im.className = 'rPv'; im.alt = ''; im.src = U.api.fileUrl(pv); d.insertBefore(im, d.firstChild);
			}).catch(function () { });
		});
		$('recent').onclick = function (e) { var d = e.target.closest('div[data-i]'); if (d) A.openPath(rec[+d.dataset.i]); };
	}
	async function init() {
		try { S.boot = await U.api.boot(); } catch (e) { U.error(e); return; }
		U.sep = S.boot.sep || '\\';
		if (BM.native) { BM.native.token = new URLSearchParams(location.search).get('t') || ''; BM.native.on = !!S.boot.core; }     // 2.0: смета, присадка, раскрой — ядром C++
		document.body.classList.toggle('tablet', S.boot.edition === 'tablet');          // приложение для планшета (Android): то же окно, без функций только для компьютера
		try { S.set = BM.mergeSettings(await U.api.settings()); } catch (e2) { S.set = BM.defaults(); }
		A.applyTheme();
		zoomKeys(); A.setZoom(S.set.zoom || 1, true);
		window.Split.attach(document);                       // стыки боковых панелей: ширина — мышью
		await window.Est.loadStore();
		try { await window.Base.load(); } catch (eb) { console.error(eb); BM.base.cur = BM.base.fresh(); }
		try { await window.MatBase.init(); } catch (em) { console.error(em); }          // база материалов (2.2): цены, форматы, склад
		/* связь с программой: раз в полторы секунды. Заодно узнаём, что проект заново выгрузили из БАЗИСа */
		setInterval(async function () {
			var r = await U.api.ping();
			if (r && r.reload) {
				var had = A.tabOf(r.reload) >= 0;
				U.toast(had ? 'Модель выгружена из БАЗИСа заново — обновляю её вкладку.' : 'Новая модель из БАЗИСа — открываю во вкладке.');
				S.conflict = false; document.querySelectorAll('#modals .back').forEach(function (x) { x.remove(); }); A.openPath(r.reload);
			}
		}, 1500);
		U.api.ping();
		window.addEventListener('pagehide', function () { flush(); U.api.bye(); });
		window.addEventListener('beforeunload', flush);

		$('wOpen').onclick = A.openDialog;
		$('ptabs').addEventListener('click', function (e) {
			var t = e.target.closest('.ptab');
			if (!t) return;
			if (e.target.closest('.x')) A.closeTab(Number(t.dataset.i)); else A.switchTab(Number(t.dataset.i));
		});
		$('ptabs').addEventListener('auxclick', function (e) { var t = e.target.closest('.ptab'); if (t && e.button === 1) A.closeTab(Number(t.dataset.i)); });
		$('wSettings').onclick = function () { window.Dlg.settings(); };
		$('bOpen').onclick = A.openDialog;
		$('bSaveAs').onclick = A.saveAs;
		/* планшет: проект — на Яндекс Диск («Поделиться»), сначала дописать правки */
		$('bToDisk').onclick = function () { if (!S.path) return; A.save(true); setTimeout(function () { U.api.open(S.path).catch(U.error); }, 400); };
		$('bMats').onclick = function () { window.Dlg.materials(); };
		$('bSettings').onclick = function () { window.Dlg.settings(); };
		$('bPdf').onclick = function () { if (S.section === 'drill') window.Dlg.drillPdf(); else if (S.section === 'detail') window.Dlg.detailPdf(); else if (S.section === 'asm') window.Dlg.asmPdf(); else if (S.section === 'est') window.Dlg.estDoc('', 'pdf'); else if (S.section !== 'model') window.Dlg.pdf(); };
		$('bXlsx').onclick = function () { if (S.section === 'est') window.Dlg.estDoc('', 'xlsx'); else window.Dlg.exportXlsx(); };
		$('bDxf').onclick = function () { window.Dlg.dxf(); };
		$('bLists').onclick = function () { window.Dlg.lists(); };
		$('bNest').onclick = A.renest;
		$('bImprove').onclick = A.improve;
		$('bUndo').onclick = A.undo; $('bRedo').onclick = A.redo;
		if ($('bTheme')) $('bTheme').onclick = function (e) { e.stopPropagation(); themeMenu(this); };
		$('iSets').onchange = function () {
			var v = Math.max(1, Math.min(999, Math.round(Number(this.value) || 1)));
			this.value = v;
			if (!S.st || v === S.st.work.sets) return;
			A.pushUndo(); S.st.work.sets = v; S.sel = -1; A.afterChange();
		};
		$('sQuality').onchange = function () { if (!S.st) return; S.st.work.params.quality = Number(this.value); S.set.quality = Number(this.value); A.saveSettings(); A.save(); };
		$('sColor').onchange = function () { S.set.color = this.value; A.saveSettings(); A.render(); };
		$('cHoles').onchange = function () { S.holes = this.checked; window.MapView.render(); };
		$('cTex').checked = S.set.texMaps !== 0;
		$('cTex').onchange = function () { S.set.texMaps = this.checked ? 1 : 0; A.saveSettings(); window.MapView.render(); };
		document.addEventListener('keydown', function (e) {
			if ($('modals').querySelector('.back:not(.out)')) return;
			var tag = e.target.tagName, typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
			var ctrl = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
			if (k === 'f1') { e.preventDefault(); return; }          // STHGroup: без «Отзыва»
			if (ctrl && (k === 'z' || k === 'я') && !e.shiftKey) { if (typing) return; e.preventDefault(); A.undo(); }
			else if (ctrl && (k === 'y' || k === 'н' || ((k === 'z' || k === 'я') && e.shiftKey))) { if (typing) return; e.preventDefault(); A.redo(); }
			else if (ctrl && (k === 'o' || k === 'щ')) { e.preventDefault(); A.openDialog(); }
			else if (ctrl && (k === 'f' || k === 'а')) { e.preventDefault(); var sf = $(S.section === 'model' ? 'mSearch' : 'iSearch'); sf.focus(); sf.select(); }
			else if (ctrl && (k === 'p' || k === 'з')) { e.preventDefault(); if (S.st && S.section !== 'model') { if (S.section === 'drill') window.Dlg.drillPdf(); else if (S.section === 'detail') window.Dlg.detailPdf(); else if (S.section === 'asm') window.Dlg.asmPdf(); else if (S.section === 'est') window.Dlg.estDoc('', 'pdf'); else window.Dlg.pdf(); } }
			else if (typing) return;
			else if (S.section === 'detail' && (k === 'arrowdown' || k === 'arrowup')) { e.preventDefault(); window.Detail.step(k === 'arrowdown' ? 1 : -1); }
			else if (S.section === 'asm' && (k === 'arrowdown' || k === 'arrowup')) { e.preventDefault(); window.Asm.step(k === 'arrowdown' ? 1 : -1); }
			else if (S.section === 'drill') {
				if (k === 'arrowdown') { e.preventDefault(); window.Drill.step(1); }
				else if (k === 'arrowup') { e.preventDefault(); window.Drill.step(-1); }
			}
			else if (S.section === 'est') { if (k === 'escape' && S.estRow) { S.estRow = ''; window.Est.render(); } }
			else if (S.section === 'model') window.Model.key(e);
			else if (k === 'escape') { S.sel = -1; S.selType = ''; A.render(); }
			else if (k === '+' || k === '=') window.MapView.zoomBy(1.25);
			else if (k === '-') window.MapView.zoomBy(0.8);
		});
		window.addEventListener('resize', function () { if (S.st) { window.MapView.render(); window.Drill.render(); window.Detail.render(); } });
		window.MapView.init(); window.Panels.init(); window.Drill.init(); window.Detail.init(); if (window.Asm) window.Asm.init(); window.Est.init(); window.Base.init(); window.Model.init(); window.Feedback.init(); if (window.BRLink) window.BRLink.init(); if (window.Panes) window.Panes.init();

		if (S.boot.file) { if (!(await A.openPath(S.boot.file))) welcome(); }
		else welcome();
		if (S.section === 'base') window.Base.render();
		/* при первом запуске (не у автора) — окно о том, что программа раз в день шлёт автору отметку */
		await window.Dlg.testerFirstRun();
		/* обновления через GitHub (если проверка не выключена) */
		window.Dlg.updRefresh();
		window.Dlg.checkOnline(true);
	}
	window.addEventListener('DOMContentLoaded', init);
})();
