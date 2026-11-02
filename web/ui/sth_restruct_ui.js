/* STHGroup — «Инструменты → Перестроить базу по структуре STHGroup…» (окно «База материалов»).
   Берёт .dbf из БАЗИСа, раскладывает позиции по согласованной структуре (core/sth_restruct.js), показывает таблицу
   «прежняя группа → новая группа» (новую можно поправить, перенос — снять галочкой) и только после подтверждения записывает в открытую базу. */
(function () {
	'use strict';
	var U = window.UI, MB = BM.mb, R = BM.sthRe, W = window.MBW, S = W && W.S, esc = U.esc;
	if (!R || !W) return;
	function low(s) { return String(s || '').toLowerCase().replace(/ё/g, 'е').trim(); }
	var X = window.STHRe = {};
	/* группа по пути: создаётся с типом раздела */
	function groupAt(b, path, cache) {
		if (cache[path]) return cache[path];
		var parts = path.split('/'), cur = '', key = '';
		parts.forEach(function (p) {
			key = key ? key + '/' + p : p;
			if (cache[key]) { cur = cache[key]; return; }
			var f = null; MB.kids(b, cur).forEach(function (g) { if (g.name === p) f = g; });
			if (!f) f = MB.addGroup(b, cur, p, R.typeOf(key));
			cache[key] = f.id; cur = f.id;
		});
		return cur;
	}
	X.run = async function () {
		var p = await U.pick({ kind: 'open', title: 'База материалов из БАЗИСа (.dbf)', filters: [{ name: 'DBF', ext: ['dbf'] }] });
		if (!p) return;
		var recs;
		try { recs = MB.fromDBF(await U.api.readBytes(p)); } catch (e) { U.error(e); return; }
		if (!recs.length) { U.toast('В файле не найдено материалов'); return; }
		var plan = R.plan(recs), b = S.b, has = Object.keys(b.mats).length;
		var rows = plan.map(function (x, i) {
			var nt = Object.keys(x.notes).map(function (k) { return k + (x.notes[k] > 1 ? ' ×' + x.notes[k] : ''); }).join(', ');
			return '<tr><td><input type="checkbox" class="rk" data-i="' + i + '"' + (x.drop ? '' : ' checked') + '></td><td class="mute" style="max-width:360px">' + esc(x.from) + '</td><td class="r">' + x.n + '</td><td><input class="rt" data-i="' + i + '" value="' + esc(x.to) + '" style="width:100%"></td><td class="mute sm">' + esc(nt) + '</td></tr>';
		}).join('');
		var res = await U.modal({ title: 'Перестроить базу по структуре STHGroup', width: 1200, cls: 'sthRe',
			body: '<p>Файл: <b>' + esc(U.baseOf(p)) + '</b> · позиций: <b>' + recs.length + '</b> · групп: ' + plan.length + '. Проверьте, куда что пойдёт; новую группу можно поправить, перенос — снять галочкой.' + (has ? ' <span class="warn">В открытой базе уже есть ' + has + ' материалов — совпавшие обновятся, остальные добавятся.</span>' : '') + '</p>' +
				'<p class="mute sm">Заодно: «Примечание» → поля (длина хлыста и округление до целого хлыста, упаковка, «за метр» → м.п.), цена за упаковку → за штуку, «90/1» в обозначении убирается, «м» → «м.п.», признаки кромки — классами, поставщик из пути (МДМ) — в карточку. Пустые разделы схемы создаются.</p>' +
				'<div style="max-height:58vh;overflow:auto"><table class="grid" style="width:100%"><thead><tr><th><input type="checkbox" id="rAll" checked></th><th>Сейчас</th><th>Позиций</th><th>Станет</th><th>Из примечания и признаки</th></tr></thead><tbody>' + rows + '</tbody></table></div>',
			buttons: [{ label: 'Отмена', value: null }, { label: 'Перестроить', primary: true, run: function (m) {
				var map = {}; m.querySelectorAll('.rk').forEach(function (c) { var i = Number(c.dataset.i); map[plan[i].from] = c.checked ? m.querySelector('.rt[data-i="' + i + '"]').value.split('/').map(function (s) { return s.trim(); }).filter(Boolean).join('/') : null; });
				return map;
			} }],
			onOpen: function (m) { m.querySelector('#rAll').onchange = function () { var v = this.checked; m.querySelectorAll('.rk').forEach(function (c) { c.checked = v; }); }; } });
		if (!res) return;
		/* быстрое «такой уже есть» — по указателям, а не перебором всей базы на каждую позицию */
		var byName = {}, byArt = {};
		Object.keys(b.mats).forEach(function (id) { var x = b.mats[id]; (byName[low(x.name)] = byName[low(x.name)] || []).push(x); if (x.art) (byArt[low(x.art)] = byArt[low(x.art)] || []).push(x); });
		var clash0 = MB.clash;
		MB.clash = function (bb, m) {
			if (bb !== b) return clash0(bb, m);
			var rule = m.unique || b.set.unique, n = low(m.name), a = low(m.art), c1 = byName[n] || [], c2 = a ? byArt[a] || [] : [];
			var all = c1.concat(c2);
			for (var i = 0; i < all.length; i++) { var x = all[i]; if (x.id === m.id) continue; var sn = low(x.name) === n, sa = a !== '' && low(x.art) === a;
				if ((rule === 'art' && sa) || (rule === 'name' && sn) || (rule === 'and' && sn && (sa || (a === '' && low(x.art) === ''))) || (rule === 'or' && (sn || sa))) return x; }
			return null;
		};
		var cache = {}, cnt = { add: 0, upd: 0, skip: 0, drop: 0 }, clsOf = {}, supOf = {};
		R.SKELETON.forEach(function (s) { groupAt(b, s[0], cache); });
		function cls(name) {
			if (clsOf[name]) return clsOf[name];
			var cg = b.classGroups.filter(function (g) { return g.name === 'Признаки'; })[0] || MB.addClassGroup(b, 'Признаки');
			var c = b.classes.filter(function (x) { return x.group === cg.code && low(x.name) === low(name); })[0] || MB.addClass(b, name, cg.code);
			return (clsOf[name] = c.code);
		}
		function sup(name) { if (!name) return ''; if (supOf[name]) return supOf[name]; var s = b.suppliers.filter(function (x) { return low(x.name) === low(name); })[0] || MB.saveSupplier(b, { name: name }); return (supOf[name] = s.id); }
		try {
			for (var i = 0; i < recs.length; i++) {
				if (i % 400 === 0) { U.toast('Перестраиваю: ' + i + ' из ' + recs.length, { ms: 3000 }); await new Promise(function (r) { setTimeout(r, 0); }); }
				var f = R.fixRec(recs[i]), to = res[recs[i].GRP_NAME];
				if (to === null) { cnt.drop++; continue; }
				if (to !== undefined) f.rec.GRP_NAME = to;
				if (f.rec.GRP_NAME) groupAt(b, f.rec.GRP_NAME, cache);
				var q = MB.fromRec(b, f.rec);
				if (q.skip) { cnt.skip++; continue; }
				var mt = q.mat, ex = f.extra;
				if (q.upd) cnt.upd++; else { cnt.add++; (byName[low(mt.name)] = byName[low(mt.name)] || []).push(mt); if (mt.art) (byArt[low(mt.art)] = byArt[low(mt.art)] || []).push(mt); }
				if (ex.pack) { mt.pack = ex.pack; if (ex.packPrice) mt.packPrice = ex.packPrice; }
				if (ex.roundTo) { mt.round = 2; mt.roundTo = ex.roundTo; }
				ex.cls.forEach(function (c) { var k = cls(c); if (mt.cls.indexOf(k) < 0) mt.cls.push(k); });
				if (ex.sup && !mt.sup) mt.sup = sup(ex.sup);
			}
		} finally { MB.clash = clash0; }
		W.changed();
		U.toast('Готово: добавлено ' + cnt.add + ', обновлено ' + cnt.upd + (cnt.drop ? ', не перенесено ' + cnt.drop : '') + (cnt.skip ? ', пропущено ' + cnt.skip : '') + '.', { ms: 15000 });
	};
})();
