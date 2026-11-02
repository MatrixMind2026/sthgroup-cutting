/* STHGroup — модель по ссылке на Яндекс Диск (только полная версия и планшет).
   Папка изделия на Диске → «Поделиться» → «Скопировать ссылку»; здесь — «Файл → Открыть по ссылке…» (на планшете — ещё и
   «Поделиться» ссылкой прямо в STHGroup). Файлы скачиваются в выбранную раз и навсегда папку, в подпапку изделия; рядом —
   «.bazisreborn-link.json» (ссылка и md5 файлов): в следующий раз скачиваются только изменившиеся, правленный здесь проект —
   по вопросу «Оставить мой / Взять с Диска».
   Связь: UI.api.link.{root, choose, list, fetch, clip}, UI.api.md5 — на компьютере сервер программы (app/go/link.go),
   на планшете — телефон (api_android.js). */
(function () {
	'use strict';
	var U = window.UI;
	var LINK_RE = /(https?:\/\/)?(disk\.yandex\.[a-z]+|yadi\.sk|disk\.360\.yandex\.[a-z]+)\/\S+/i;
	function linkOf(t) { var m = LINK_RE.exec(String(t || '')); return m ? (m[1] ? m[0] : 'https://' + m[0]).replace(/[)\]»".,;]+$/, '') : ''; }
	function esc(s) { return U.esc(String(s === undefined || s === null ? '' : s)); }
	function mb(n) { return (n / 1048576).toFixed(n > 10485760 ? 0 : 1).replace('.', ',') + ' МБ'; }
	function safe(n) { return String(n || 'Модель').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'Модель'; }
	function can() { var A = window.App; return !!(A && A.S && A.S.boot && U.api.link); }
	async function readJson(p) { try { var st = await U.api.stat(p); if (!st.exists) return null; return JSON.parse(await U.api.readText(p)); } catch (e) { return null; } }
	var busy = false;

	async function open(pre) {
		if (busy || !can()) return;
		var L0 = U.api.link, info = await L0.root(), link = linkOf(pre);
		if (!link) { try { link = linkOf(await L0.clip()); } catch (e) { link = ''; } }
		var v = await U.modal({
			title: 'Открыть по ссылке на Яндекс Диск', width: 640, cls: 'lnkDlg',
			body: '<div class="form"><label>Ссылка</label><div><input type="text" id="lnkUrl" style="width:100%" placeholder="https://disk.yandex.ru/d/…" value="' + esc(link) + '" autofocus></div>' +
				'<label>Сохранять в</label><div style="display:flex;align-items:center;gap:10px;min-width:0"><b id="lnkDir" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(info.path ? info.name : 'папка не выбрана') + '</b><button id="lnkPick" style="flex:none">' + (info.path ? 'Другая папка…' : 'Выбрать папку…') + '</button></div>' +
				'<div class="hint full">На Диске: папка изделия (проект .bmk, «— 3D.glb», «.uv», текстуры) → «Поделиться» → «Скопировать ссылку». Файлы скачаются в подпапку изделия; в следующий раз — только изменившиеся.</div></div>',
			buttons: [{ label: 'Отмена', value: null }, { label: 'Скачать и открыть', primary: true, run: function (m) { var l = linkOf(m.querySelector('#lnkUrl').value); if (!l) { U.toast('Вставьте ссылку на Яндекс Диск (disk.yandex.ru/…)', { bad: true }); return false; } return l; } }],
			onOpen: function (m) {
				m.querySelector('#lnkPick').onclick = async function () { try { var r = await L0.choose(); if (r) { info = r; m.querySelector('#lnkDir').textContent = r.name; m.querySelector('#lnkPick').textContent = 'Другая папка…'; } } catch (e) { U.error(e); } };
			}
		});
		if (!v) return;
		busy = true;
		var prog = null;
		try {
			if (!(await L0.root()).path) { var r0 = await L0.choose(); if (!r0) { U.toast('Папка для моделей не выбрана'); return; } }
			var root = (await L0.root()).path, sep = U.sep || '/';
			prog = U.toast('Смотрю, что лежит по ссылке…', { ms: 600000 });
			var L = await L0.list(v);
			if (!L.files || !L.files.length) throw new Error('По ссылке нет файлов.');
			if (!L.files.some(function (f) { return /\.bmk$/i.test(f.rel); })) throw new Error('По ссылке нет проекта STHGroup (.bmk). Нужна папка изделия с файлом проекта.');
			var name = safe(L.single ? L.name.replace(/\.[^.]+$/, '') : L.name), dir = root.replace(/[\\/]+$/, '') + sep + name, manPath = dir + sep + '.bazisreborn-link.json';
			await U.api.mkdir(dir);
			var man = await readJson(manPath) || { files: {} }, need = [], keep = [];
			for (var i = 0; i < L.files.length; i++) {
				var f = L.files[i], local = dir + sep + f.rel.split('/').join(sep), st = await U.api.stat(local), was = man.files[f.rel];
				if (!st.exists) { need.push(f); continue; }
				if (was && was.md5 === f.md5) continue;                                     // на Диске не менялся
				var lm = ''; try { lm = (await U.api.md5(local)).md5; } catch (e1) { lm = ''; }
				if (lm === f.md5) continue;                                                   // уже такой же
				var edited = was ? lm !== was.md5 : true;
				if (/\.bmk$/i.test(f.rel) && edited) {
					var ans = await U.modal({ title: 'Проект изменился и там, и здесь', width: 520,
						body: '<p>«' + esc(f.rel) + '»: на Диске новая версия, а здесь в проекте есть правки.</p>',
						buttons: [{ label: 'Оставить мой', value: 'mine' }, { label: 'Взять с Диска', value: 'disk', primary: true }] });
					if (ans !== 'disk') { keep.push(f.rel); continue; }
				}
				need.push(f);
			}
			var total = need.reduce(function (a, x) { return a + (x.size || 0); }, 0);
			if (need.length) {
				prog.firstChild.textContent = 'Скачиваю ' + need.length + ' ' + (need.length === 1 ? 'файл' : 'файлов') + ', ' + mb(total) + '…';
				await L0.fetch(need.map(function (x) { return { rel: x.rel, href: x.href, size: x.size }; }), dir, function (p) {
					if (prog && prog.firstChild && p && p.n) prog.firstChild.textContent = p.k < p.n ? 'Скачиваю ' + (p.k + 1) + ' из ' + p.n + ': ' + p.name + ' — ' + mb(p.done) + ' из ' + mb(p.total) : 'Скачано: ' + mb(p.total);
				});
			}
			man = { link: v, name: L.name, at: Date.now(), files: {} };
			L.files.forEach(function (x) { man.files[x.rel] = { md5: x.md5, size: x.size }; });
			await U.api.write(manPath, JSON.stringify(man));
			if (prog) prog.remove(); prog = null;
			U.toast(need.length ? 'Скачано файлов: ' + need.length + ' (' + mb(total) + ') — в «' + name + '»' + (keep.length ? '; ваш проект оставлен' : '') : 'Всё уже скачано — изменений на Диске нет');
			var bmks = L.files.map(function (x) { return x.rel; }).filter(function (r) { return /\.bmk$/i.test(r); }).sort(function (a, b) { return a.split('/').length - b.split('/').length || a.localeCompare(b); });
			if (window.App && window.App.openPath) await window.App.openPath(dir + sep + bmks[0].split('/').join(sep));
		} catch (e) { U.error(e); }
		finally { busy = false; if (prog) prog.remove(); }
	}

	/* кнопки «Открыть по ссылке…» — в «Файл» и на начальном экране; в тестовой версии их нет */
	function init() {
		var on = can();
		['bLink', 'wLink'].forEach(function (id) { var b = document.getElementById(id); if (!b) return; if (!on) b.remove(); else b.onclick = function () { open(''); }; });
	}
	window.BRLink = { open: open, init: init, linkOf: linkOf };
})();
