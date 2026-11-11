/* STHGroup — заказы: книга заказов (клиенты, заказы, справочник услуг и цен) и расчёт КП «как у фабрики».
   Заказ — несколько изделий (файлов .bmk). По каждому изделию снимается сводка из проекта: листы по материалам
   (из раскроя), мелкие детали, стоимость материалов и фурнитуры по смете. Расчёт заказа:
   1) обработка листового материала — цена за лист по виду работы («распил, кромкооблицовка, присадка» / «распил»);
   2) доп. обработка мелких деталей (длина или ширина меньше порога) — кромление и присадка за деталь;
   3) услуги к заказу — галочки; единица: за заказ, лист, изделие, деталь или % от суммы;
   4) скидка за комплекс — % от услуг (галочка в заказе);
   5) материалы и фурнитура — по смете, с наценкой; галочки «наш материал», «наша фурнитура»;
   итог, аванс (% услуг + % материалов), доплата, оплачено, долг.
   Только данные и правила — окно в ui/sth_orders.js. Работает в окне и под Node.js. */
(function (G) {
	'use strict';
	var BM = G.BM = G.BM || {};
	var O = BM.sth = {};
	O.FILE = 'STHGroup — заказы.json';
	O.FORMAT = 'sthgroup-orders';
	O.STATUSES = [['calc', 'Расчёт'], ['agreed', 'Согласован'], ['work', 'В работе'], ['ready', 'Готов'], ['shipped', 'Отгружен'], ['closed', 'Закрыт']];
	/* STHGroup 2.1: этапы настраиваются — свои названия и свои колонки (книга: cat.stages [{id, name}]);
	   шесть основных не удаляются, свои колонки — обычные этапы без автоматики. */
	O.BASE_STAGES = O.STATUSES.map(function (s) { return s[0]; });
	O.stages = function (b) {
		var cat = b && b.cat;
		if (cat && !Array.isArray(cat.stages)) cat.stages = O.STATUSES.map(function (s) { return { id: s[0], name: s[1] }; });
		var src = cat && Array.isArray(cat.stages) ? cat.stages : [];
		return src.length ? src.map(function (s) { return [s.id, s.name]; }) : O.STATUSES.slice();
	};
	O.stageName = function (b, s) {
		var f = O.stages(b).filter(function (x) { return x[0] === s; })[0];
		return f ? f[1] : s;
	};
	O.renameStage = function (b, id, name) {
		name = String(name || '').trim().slice(0, 40); if (!b || !b.cat || !name) return false;
		O.stages(b);
		var st = b.cat.stages.filter(function (s) { return s.id === id; })[0];
		if (!st) return false;
		st.name = name; return true;
	};
	/* STHGroup: новая колонка всегда добавляется в конец выбранного пользователем порядка. */
	O.addStage = function (b, name) {
		name = String(name || '').trim().slice(0, 40); if (!b || !b.cat || !name) return null;
		O.stages(b);
		var st = { id: O.id('u'), name: name };
		b.cat.stages.push(st);
		return st;
	};
	/* Меняется только порядок этапов, идентификаторы и статусы заказов сохраняются. */
	O.moveStage = function (b, id, target, after) {
		if (!b || !b.cat) return false;
		O.stages(b);
		var arr = b.cat.stages, from = arr.findIndex(function (s) { return s.id === id; });
		var to = target == null ? arr.length : arr.findIndex(function (s) { return s.id === target; });
		if (from < 0 || to < 0 || id === target) return false;
		if (target != null && after) to++;
		if (from < to) to--;
		if (from === to) return false;
		var stage = arr.splice(from, 1)[0]; arr.splice(to, 0, stage);
		return true;
	};
	/* удалить можно только свою пустую колонку */
	O.removeStage = function (b, id) {
		if (!b || !b.cat) return { ok: false, reason: 'empty' };
		if (O.BASE_STAGES.indexOf(id) >= 0) return { ok: false, reason: 'base' };
		O.stages(b);
		if (b.orders.some(function (o) { return o.status === id; })) return { ok: false, reason: 'used' };
		var i = -1;
		b.cat.stages.forEach(function (s, k) { if (s.id === id) i = k; });
		if (i < 0) return { ok: false, reason: 'empty' };
		b.cat.stages.splice(i, 1); return { ok: true };
	};
	O.UNITS = [['order', 'за заказ'], ['sheet', 'за лист'], ['item', 'за изделие'], ['part', 'за деталь'], ['pct', '% от суммы'], ['pcs', 'за шт.'], ['pack', 'за пачку'], ['m2', 'за м²']];
	O.LOADS = [['low', 'низкая'], ['mid', 'средняя'], ['high', 'высокая']];

	function num(v, d) { if (typeof v === 'string') v = v.replace(/\s/g, '').replace(',', '.'); v = Number(v); return isFinite(v) ? v : (d === undefined ? 0 : d); }
	function r2(v) { return Math.round((Number(v) + Number.EPSILON) * 100) / 100; }
	function low(s) { return String(s || '').toLowerCase().replace(/ё/g, 'е'); }
	var seq = 0;
	O.id = function (p) { return (p || 'x') + Date.now().toString(36) + (seq++).toString(36) + Math.floor(Math.random() * 1296).toString(36); };
	O.num = num; O.r2 = r2;

	/* ------------------------------ книга ------------------------------------ */
	/* Справочник по умолчанию — прайс STHGroup (11.11.2026, по листу расчёта автора). Название «работа: материал» —
	   в прайсе для клиента делится на название и примечание. */
	function row(id, name, price, unit, note) { return { id: id, name: name, price: price, unit: unit, note: note || '' }; }
	function svc(id, name, unit, price, on, note) { return { id: id, name: name, unit: unit, price: price, on: on ? 1 : 0, note: note || '' }; }
	O.defCatalog = function () {
		return {
			sheetWorks: [
				{ id: 'agt', name: 'Распил, кромкооблицовка и присадка: МДФ, AGT, Evosoft, Eterno', price: 5040, match: 'agt, evosoft, eterno' },
				{ id: 'hdf', name: 'Распил: ХДФ', price: 1050, match: 'хдф, двп, hdf, оргалит' },
				{ id: 'full', name: 'Распил, кромкооблицовка и присадка: ЛДСП/МДФ', price: 5250, match: '' }
			],
			groups: [
				{ id: 'sheet2', title: 'Обработка листового материала — отдельно', note: 'количество вписывается в заказе', rows: [
					row('nodrill', 'Распил, кромкооблицовка без присадки: ЛДСП, AGT, Evosoft, Eterno', 3300, 'за лист'),
					row('wall3050', 'Распил стеновых панелей: 3050×10 мм', 420, 'за деталь'),
					row('wall4100', 'Распил стеновых панелей: 4100×10 мм', 420, 'за деталь'),
					row('top3050', 'Распил ДСП столешниц: 3050×38 мм', 1050, 'за деталь'),
					row('top4100', 'Распил ДСП столешниц: 4100×38 мм', 1575, 'за деталь')] },
				{ id: 'dop', title: 'Доп. обработка деталей', note: '', rows: [
					row('glue', 'Склейка и кромкооблицовка: детали 32 мм', 420, 'за деталь'),
					row('euro', 'Еврозапил, фрезеровка и подгонка: ДСП столешницы 38 мм', 2625, 'за деталь'),
					row('topedge', 'Кромление столешниц/фартуков без прифуговки: столешницы 38 мм, фартуки 6–10 мм', 158, 'м.п.'),
					row('curve', 'Кромление криволинейное: ЛДСП', 420, 'за элемент'),
					row('edgemix', 'Наценка за разнотолщинные кромки: кратно листам', 300, 'за лист'),
					row('drill1', 'Присадка отдельно: привозные фасады', 100, 'за деталь'),
					row('edge1', 'Кромление отдельно: привозные детали', 45, 'м.п.'),
					row('angle', 'Торцевой спил под угол: от 1° до 45°', 315, 'за проход'),
					row('gola', 'Торцевой паз: под забивную ручку GOLA', 420, 'за проход'),
					row('hand', 'Ручная доводка кромки: AGT, Fenix и т.п. пластики', 210, 'за деталь'),
					row('clean', 'Протирка деталей: чистка деталей от грязи', 45, 'за деталь'),
					row('mirror', 'Наклейка зеркал: на любую поверхность', 1050, 'за деталь'),
					row('prof', 'Вклейка профилей: светодиодных или торцевых', 100, 'шт'),
					row('long', 'Нарезка длинномеров: различные профили', 210, 'за один размер')] },
				{ id: 'fac', title: 'Фасады', note: 'покраска — минимум 1 м²', rows: [
					row('sample', 'Образец покраски: 200×200 мм по каталогам RAL и NCS', 2500, 'шт'),
					row('mdfcut', 'Распил и присадка: МДФ/фанера под шпон/эмаль', 600, 'м²'),
					row('hpl', 'Облицовка пласти и кромкооблицовка: оклейка HPL пластиком, 2 стороны', 2310, 'м²'),
					row('hmill', 'Фрезеровка ручки: интегрированной в МДФ', 315, 'шт'),
					row('radius', 'Радиусные элементы: изготовление и окраска радиуса', 30000, 'шт'),
					row('upfac', 'Разработка УП для фасадов: индивидуальная фрезеровка', 2000, 'за программу'),
					row('round', 'Обгонка по торцам МДФ: R1, R2, R3', 84, 'м.п.'),
					row('mill', 'Фрезеровка МДФ: стандартная/индивидуальная, min 1 м²', 3675, 'м²'),
					row('vmulti', 'Шпонирование и присадка: мультишпон с учётом МДФ', 11900, 'м²'),
					row('vnat', 'Шпонирование и присадка: натуральный шпон без МДФ', 12650, 'м²'),
					row('vhand', 'Шпонирование интегрированной ручки: натуральный и мультишпон', 3000, 'шт'),
					row('vedge', 'Кромление шпоном с прифуговкой: натуральный и мультишпон', 120, 'м.п.'),
					row('lak', 'Покрытие матовым лаком: шпонированных деталей', 4400, 'м²'),
					row('phand', 'Покраска ручки: интегрированной в МДФ', 1580, 'шт'),
					row('pelem', 'Покраска элемента: мебельные ручки, цоколи и т.п.', 1650, 'шт'),
					row('p1mill', 'Покраска одной стороны: фрезерованный МДФ, матовая эмаль, min 1 м²', 15550, 'м²'),
					row('p2mill', 'Покраска двух сторон: фрезерованный МДФ, матовая эмаль, min 1 м²', 17950, 'м²'),
					row('p1mat', 'Покраска одной стороны: гладкий МДФ, матовая эмаль, min 1 м²', 6400, 'м²'),
					row('p2mat', 'Покраска двух сторон: гладкий МДФ, матовая эмаль, min 1 м²', 8900, 'м²'),
					row('p1gl', 'Покраска одной стороны: гладкий МДФ, глянцевая эмаль, min 1 м²', 16000, 'м²'),
					row('p2gl', 'Покраска двух сторон: гладкий МДФ, глянцевая эмаль, min 1 м²', 19000, 'м²')] }
			],
			urgentPct: 30, urgentDays: 3, urgentText: 'Срочное изготовление',
			small: { limit: 60, edge: 420, drill: 420 },
			services: [
				svc('up', 'Разработка УП и адаптация моделей под производство', 'item', 2200, 1),
				svc('conv', 'Конвертирование пиратской модели Базис-Мебельщика', 'item', 400, 0),
				svc('facpvc', 'Стоимость фасадов ПВХ, алюминий (уточняется при заказе)', 'order', 0, 0),
				svc('asm', 'Сборка мелких изделий на производстве (уточняется при заказе)', 'order', 0, 0),
				svc('konm2', 'Конструкторская разработка, за м² (с коэффициентом сложности)', 'm2', 0, 0),
				svc('kon', 'Конструкторская разработка (с коэффициентом сложности)', 'item', 0, 0),
				svc('pack', 'Упаковка деталей в стрейч', 'sheet', 525, 1),
				svc('corner', 'Укрепление упаковок уголками, по 8 шт на пачку', 'pack', 135, 0),
				svc('carton', 'Дополнительная упаковка в картон, кратно одной пачке', 'pack', 0, 0),
				svc('mirrorpack', 'Упаковка деталей с зеркалом', 'pcs', 525, 0),
				svc('supply', 'Закупка и обеспечение фурнитурой (услуга снабжения)', 'order', 2500, 1),
				svc('kit', 'Комплектация фурнитурой к изделию (фасовка поизделно)', 'item', 1000, 1),
				svc('unload', 'Разгрузка материала', 'sheet', 150, 0),
				svc('design', 'Разработка дизайнера', 'order', 0, 0),
				svc('storage', 'Платное хранение прошлого заказа', 'order', 500, 0),
				svc('cashless', 'Безналичная форма оплаты (с НДС)', 'pct', 7, 0)
			],
			/* скидки — % от услуг, галочками в заказе; «complex» — прежняя скидка за комплекс (галочка o.complex) */
			discounts: [
				{ id: 'sheets11', name: 'Выгода на распил, за заказ от 11 листов', pct: 5, on: 0, minSheets: 11 },
				{ id: 'corpfac', name: 'Экономия при заказе распила корпуса и фасадов', pct: 3, on: 0 },
				{ id: 'complex', name: 'Экономия при заказе услуг распила, фасадов и комплектации', pct: 4, on: 1 },
				{ id: 'promo', name: 'Акционное предложение', pct: 10, on: 0 },
				{ id: 'store20', name: 'Бесплатное хранение распила до 20 дней или до выпуска фасадов', pct: 0, on: 0, freeDays: 20 }
			],
			complexPct: 4, complexText: 'Экономия при заказе услуг распила, фасадов и комплектации',
			markup: 15, markupText: 'мы добавляем 15% к оптовому прайсу поставщика',
			advance: { serv: 70, mat: 100 },
			terms: {
				load: 'high', days: 15, freeDays: 2, storage: 500, title: 'Важно знать',
				text: 'Для начала выполнения работ потребуются модель из Базис-Мебельщика и аванс: от {аванс}.\nНа момент расчёта загрузка нашего производства: {загрузка}. Изготовление займёт до {срок} раб. дней.\nОбращаем ваше внимание, что погрузочные работы готовых деталей в транспорт производятся вашими силами.\nХранение платное: после оповещения о готовности, начиная с {день} дня, каждые сутки хранения стоят {хранение} ₽.'
			},
			company: { name: 'STHGroup', phone: '', email: '', address: '', inn: '', bank: '', executor: '', site: '' },
			prefix: 'STH-', kpDays: 14
		};
	};
	/* ключи справочника, которые относятся к ценам: их заменяет новый прайс и их «замораживают» закрытые заказы */
	O.PRICE_KEYS = ['sheetWorks', 'groups', 'urgentPct', 'urgentDays', 'urgentText', 'small', 'services', 'discounts', 'complexPct', 'complexText', 'markup', 'markupText', 'advance', 'terms'];
	O.FROZEN_STATUSES = ['shipped', 'closed'];
	/* справочник для расчёта заказа: у замороженного заказа — свои цены, остальное (компания и т.п.) — общее */
	O.catFor = function (b, o) { return o && o.cat && typeof o.cat === 'object' ? Object.assign({}, b.cat, o.cat) : b.cat; };
	/* прайс STHGroup 11.11.2026: справочник заменяется целиком; отгруженные и закрытые заказы сохраняют прежние цены */
	O.applyPrice3 = function (b) {
		var d = O.defCatalog(), old = JSON.parse(JSON.stringify(b.cat)), frozen = {};
		O.PRICE_KEYS.forEach(function (k) { if (old[k] !== undefined) frozen[k] = old[k]; });
		if (!Array.isArray(frozen.discounts)) frozen.discounts = null;   // прежняя одна скидка «за комплекс», не новый список
		(b.orders || []).forEach(function (o) { if (o && !o.cat && O.FROZEN_STATUSES.indexOf(o.status) >= 0) o.cat = JSON.parse(JSON.stringify(frozen)); });
		O.PRICE_KEYS.forEach(function (k) { b.cat[k] = d[k]; });
		b.cat.v2 = 1; b.cat.v3 = 1;
		return b;
	};
	O.empty = function () { var c = O.defCatalog(); c.v2 = 1; c.v3 = 1; return { format: O.FORMAT, v: 1, next: 1, clients: [], orders: [], cat: c }; };
	O.fix = function (b) {
		var e = O.empty(), k;
		if (!b || typeof b !== 'object' || b.format !== O.FORMAT) b = e;
		for (k in e) if (b[k] === undefined || b[k] === null || typeof b[k] !== typeof e[k]) b[k] = e[k];
		/* книга до прайса 11.11.2026 (в т.ч. с образцами FOXY): справочник цен заменяется прайсом STHGroup — до заполнения пропусков,
		   чтобы закрытые заказы сохранили именно свои прежние цены */
		if (!b.cat.v3) O.applyPrice3(b);
		var d = O.defCatalog();
		for (k in d) if (b.cat[k] === undefined) b.cat[k] = d[k];
		['small', 'advance', 'terms', 'company'].forEach(function (x) { for (var f in d[x]) if (b.cat[x][f] === undefined) b.cat[x][f] = d[x][f]; });
		if (!Array.isArray(b.cat.sheetWorks) || !b.cat.sheetWorks.length) b.cat.sheetWorks = d.sheetWorks;
		if (!Array.isArray(b.cat.services)) b.cat.services = d.services;
		if (!Array.isArray(b.cat.groups)) b.cat.groups = d.groups;
		if (!Array.isArray(b.cat.discounts)) b.cat.discounts = d.discounts;
		b.orders.forEach(function (o) { O.fixOrder(b, o); });
		return b;
	};
	O.fixOrder = function (b, o) {
		if (!o.id) o.id = O.id('o');
		if (!Array.isArray(o.items)) o.items = [];
		if (!Array.isArray(o.payments)) o.payments = [];
		if (!o.svc || typeof o.svc !== 'object') o.svc = {};
		if (o.complex === undefined) o.complex = 1;
		if (o.ownMat === undefined) o.ownMat = 1;
		if (o.ownFit === undefined) o.ownFit = 1;
		if (!o.terms) o.terms = {};
		if (!o.status) o.status = 'calc';
		return o;
	};
	O.today = function () { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
	O.ruDate = function (iso) { var m = /^(\d{4})-(\d\d)-(\d\d)/.exec(iso || ''); return m ? m[3] + '.' + m[2] + '.' + m[1] : ''; };
	O.nextNo = function (b) { var n = b.next || 1; b.next = n + 1; return (b.cat.prefix || 'STH-') + String(n).padStart(4, '0'); };
	O.client = function (b, id) { for (var i = 0; i < b.clients.length; i++) if (b.clients[i].id === id) return b.clients[i]; return null; };
	O.clientByName = function (b, name) { var n = low(name).trim(); if (!n) return null; for (var i = 0; i < b.clients.length; i++) if (low(b.clients[i].name).trim() === n) return b.clients[i]; return null; };
	O.addClient = function (b, c) { var x = { id: O.id('c'), name: String(c.name || '').trim() || 'Клиент', phone: c.phone || '', email: c.email || '', note: c.note || '' }; b.clients.push(x); return x; };
	O.order = function (b, id) { for (var i = 0; i < b.orders.length; i++) if (b.orders[i].id === id) return b.orders[i]; return null; };
	O.byNo = function (b, no) { var n = low(no).trim(); if (!n) return null; for (var i = 0; i < b.orders.length; i++) if (low(b.orders[i].no).trim() === n) return b.orders[i]; return null; };
	/* STHGroup 2.0: единый переход карточки по этапам; неизвестный этап не принимаем. */
	O.moveStatus = function (o, status, at, b) {
		var known = b ? O.stages(b) : O.STATUSES;
		if (!o || !known.some(function (s) { return s[0] === status; })) return { changed: false, from: o && o.status || '', to: status || '' };
		var from = o.status || 'calc'; if (from === status) return { changed: false, from: from, to: status };
		o.status = status; o.statusAt = at || new Date().toISOString();
		o.sthFlow = Array.isArray(o.sthFlow) ? o.sthFlow : [];
		o.sthFlow.push({ from: from, to: status, at: o.statusAt });
		if (o.sthFlow.length > 100) o.sthFlow.splice(0, o.sthFlow.length - 100);
		return { changed: true, from: from, to: status };
	};
	/* заказ по файлу изделия: копия в папке заказа или файл, из которого её сделали (туда выгружает БАЗИС) */
	O.byItem = function (b, path) { var p = low(path); for (var i = 0; i < b.orders.length; i++) for (var j = 0; j < b.orders[i].items.length; j++) { var it = b.orders[i].items[j]; if (low(it.path) === p || (it.src && low(it.src) === p)) return b.orders[i]; } return null; };
	O.itemOf = function (o, path) { var p = low(path); for (var j = 0; j < o.items.length; j++) { var it = o.items[j]; if (low(it.path) === p || (it.src && low(it.src) === p)) return it; } return null; };
	/* имя папки заказа: «номер клиент», без знаков, которых не бывает в именах файлов */
	O.dirName = function (b, o) { var c = O.client(b, o.clientId); return (String(o.no || 'Заказ') + (c ? ' ' + c.name : '')).replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80).replace(/[. ]+$/, '') || 'Заказ'; };
	O.addOrder = function (b, o) {
		var x = O.fixOrder(b, { id: O.id('o'), no: o.no || O.nextNo(b), date: O.today(), clientId: o.clientId || '', status: 'calc', note: o.note || '', items: [], payments: [], svc: {}, terms: {} });
		b.orders.unshift(x);
		return x;
	};
	/* изделие (файл проекта) в заказ; уже есть — обновить сводку */
	O.putItem = function (o, path, snap) {
		var it = O.itemOf(o, path);
		if (!it) { it = { path: path, title: '', snap: null }; o.items.push(it); }
		if (snap) { it.snap = snap; it.title = it.title || snap.title || ''; }
		return it;
	};
	/* Заказ для выгруженного проекта: по номеру из окна скрипта, затем по файлу; нет — новый с клиентом из окна. */
	O.forProject = function (b, path, model) {
		var o = (model && model.orderNo && O.byNo(b, model.orderNo)) || O.byItem(b, path), made = false;
		if (!o) {
			var cn = model && (model.customer || model.order), c = cn ? (O.clientByName(b, cn) || O.addClient(b, { name: cn })) : null;
			o = O.addOrder(b, { no: model && model.orderNo ? String(model.orderNo).trim() : '', clientId: c ? c.id : '', note: model && model.note || '' });
			made = true;
		}
		O.putItem(o, path, null);
		return { order: o, made: made };
	};

	/* ---------------------------- сводка изделия ----------------------------- */
	/* вид работы листа: первый, у которого слово из «match» есть в названии материала; иначе — первый без условий */
	/* толщина: «от» и «до» (мм, пусто — любая); слова и толщина вместе — оба условия */
	O.workFor = function (cat, matName, th) {
		var n = low(matName), def = null, t = num(th);
		for (var i = 0; i < cat.sheetWorks.length; i++) {
			var w = cat.sheetWorks[i], keys = String(w.match || '').split(/[,;]+/).map(function (s) { return low(s).trim(); }).filter(Boolean);
			var lo = w.thMin === '' || w.thMin === undefined || w.thMin === null ? null : num(w.thMin), hi = w.thMax === '' || w.thMax === undefined || w.thMax === null ? null : num(w.thMax);
			var thOk = (lo === null || (t && t >= lo - 0.01)) && (hi === null || (t && t <= hi + 0.01));
			if (!keys.length && lo === null && hi === null) { if (!def) def = w; continue; }
			if (!thOk) continue;
			if (!keys.length) return w;
			for (var k = 0; k < keys.length; k++) if (n.indexOf(keys[k]) >= 0) return w;
		}
		return def || cat.sheetWorks[0] || null;
	};
	/* st — состояние проекта BazisReborn (BM.project.build, раскрой посчитан), R — смета (BM.est.build) или null */
	O.snapshot = function (st, R, cat, title, file) {
		var P = BM.project, sm = P.summary(st), lim = num(cat.small.limit, 60), sheets = [], parts = 0, sEdge = 0, sDrill = 0;
		sm.mats.forEach(function (x) {
			var n = (x.std || 0) + (x.rem || 0);
			if (!n) return;
			var w = O.workFor(cat, x.mat.name, x.mat.th);
			sheets.push({ mat: P.matTitle ? P.matTitle(x.mat) : x.mat.name, name: x.mat.name, th: x.mat.th, n: n, work: w ? w.id : '' });
		});
		var by = (st.holes && st.holes.by) || {};
		st.types.forEach(function (t) {
			var c = t.cnt || 0; if (!c) return;
			parts += c;
			if (Math.min(t.L, t.W) >= lim) return;
			var sd = t.shape && t.shape.sides, edged = sd && (sd.T || sd.B || sd.L || sd.R);
			var drilled = (t.ids || []).some(function (id) { var h = by[id]; return h && ((h.top && h.top.length) || (h.bot && h.bot.length) || (h.thr && h.thr.length) || (h.edge && h.edge.length)); });
			if (edged) sEdge += c;
			if (drilled) sDrill += c;
		});
		var g = (R && R.groups) || {};
		return { title: title || P.modelName(st.model) || '', file: file || '', sheets: sheets, parts: parts, smallEdge: sEdge, smallDrill: sDrill,
			mat: r2(g['МАТЕРИАЛ'] || 0), fit: r2(g['ФУРНИТУРА'] || 0), at: new Date().toISOString() };
	};

	/* ------------------------------- расчёт ---------------------------------- */
	O.calc = function (b, o) {
		var cat = O.catFor(b, o), blocks = [], lines, i, warn = [];
		var items = o.items.filter(function (x) { return x.snap; });
		o.items.forEach(function (x) { if (!x.snap) warn.push('Изделие «' + (x.title || x.path) + '» ещё не посчитано — откройте его или нажмите «Пересчитать».'); });
		/* 1. листы по видам работ */
		var byWork = {}, totalSheets = 0, totalParts = 0, sEdge = 0, sDrill = 0, mat = 0, fit = 0;
		items.forEach(function (x) {
			var s = x.snap;
			s.sheets.forEach(function (sh) { var wid = (O.workFor(cat, sh.name, sh.th) || {}).id || sh.work; (byWork[wid] = byWork[wid] || { n: 0, mats: {} }); byWork[wid].n += sh.n; byWork[wid].mats[sh.name] = 1; totalSheets += sh.n; });
			totalParts += s.parts; sEdge += s.smallEdge; sDrill += s.smallDrill; mat += s.mat; fit += s.fit;
		});
		lines = [];
		cat.sheetWorks.forEach(function (w) {
			var x = byWork[w.id]; if (!x || !x.n) return;
			var ov = o.svc['w:' + w.id] || {}, price = ov.price !== undefined && ov.price !== '' ? num(ov.price) : num(w.price);
			var qn = ov.qty !== undefined && ov.qty !== '' ? num(ov.qty) : x.n;
			lines.push({ key: 'w:' + w.id, name: w.name, unit: Object.keys(x.mats).join(', ') + ', за лист', price: price, qty: qn, sum: r2(price * qn) });
		});
		blocks.push({ id: 'sheets', title: 'Обработка листового материала', lines: lines });
		/* 2. мелкие детали */
		lines = [];
		var lim = num(cat.small.limit, 60);
		if (sEdge && num(cat.small.edge)) lines.push({ key: 's:edge', name: 'Кромление деталей меньше ' + lim + ' мм', unit: 'за деталь', price: num(cat.small.edge), qty: sEdge, sum: r2(num(cat.small.edge) * sEdge) });
		if (sDrill && num(cat.small.drill)) lines.push({ key: 's:drill', name: 'Присадка деталей меньше ' + lim + ' мм', unit: 'за деталь', price: num(cat.small.drill), qty: sDrill, sum: r2(num(cat.small.drill) * sDrill) });
		blocks.push({ id: 'small', title: 'Доп. обработка деталей', lines: lines });
		/* 3. услуги */
		lines = []; var pct = [];
		cat.services.forEach(function (s) {
			var ov = o.svc[s.id] || {}, on = ov.on !== undefined ? !!ov.on : !!s.on, price = ov.price !== undefined && ov.price !== '' ? num(ov.price) : num(s.price), qty;
			if (s.unit === 'pct') { pct.push({ key: s.id, name: s.name, unit: '% от суммы', price: price, on: on }); return; }
			qty = ov.qty !== undefined && ov.qty !== '' ? num(ov.qty) : s.unit === 'sheet' ? totalSheets : s.unit === 'item' ? o.items.length : s.unit === 'part' ? totalParts : 1;
			lines.push({ key: s.id, name: s.name, unit: (O.UNITS.filter(function (u) { return u[0] === s.unit; })[0] || ['', ''])[1], price: price, qty: qty, on: on, sum: on ? r2(price * qty) : 0, check: 1 });
		});
		(o.extra || []).forEach(function (x, k) { var q = num(x.qty, 1), p = num(x.price); lines.push({ key: 'x:' + k, name: x.name || '', unit: x.unit || 'шт', price: p, qty: q, sum: r2(p * q), extra: 1 }); });
		blocks.push({ id: 'svc', title: 'Услуги к заказу', lines: lines });
		/* доп. работы, фасады, фрезеровка — количество вписывают в заказе (шт, м², м.п.) */
		(cat.groups || []).forEach(function (g) {
			var gl = (g.rows || []).map(function (r) {
				var ov = o.svc['g:' + r.id] || {}, price = ov.price !== undefined && ov.price !== '' ? num(ov.price) : num(r.price), qty = ov.qty !== undefined && ov.qty !== '' ? num(ov.qty) : 0;
				return { key: 'g:' + r.id, name: r.name, unit: r.unit || 'шт', price: price, qty: qty, sum: r2(price * qty), opt: 1 };
			});
			blocks.push({ id: 'g:' + g.id, title: g.title, note: g.note || '', lines: gl, opt: 1 });
		});
		/* порядок строк, заданный в заказе перетаскиванием (o.lineOrder[блок] = ключи строк) */
		var LO = o.lineOrder || {};
		blocks.forEach(function (bk) {
			var ord = LO[bk.id]; if (!Array.isArray(ord) || !ord.length) return;
			bk.lines = bk.lines.map(function (l, i) { var k = ord.indexOf(l.key); return { l: l, r: k >= 0 ? k : 1000 + i }; }).sort(function (a, c) { return a.r - c.r; }).map(function (x) { return x.l; });
		});
		var serv = 0;
		blocks.forEach(function (bk) { bk.sum = r2(bk.lines.reduce(function (a, l) { return a + (l.sum || 0); }, 0)); serv += bk.sum; });
		serv = r2(serv);
		/* 4. скидки — % от услуг, галочками в заказе */
		var discounts = O.discountsFor(cat, o).map(function (d) { d.sum = d.on && num(d.pct) ? r2(serv * num(d.pct) / 100) : 0; return d; });
		discounts.forEach(function (d) {
			if (d.minSheets && d.on && totalSheets < d.minSheets) warn.push('Отмечена «' + d.name + '», а листов в заказе ' + totalSheets + '.');
			if (d.minSheets && !d.on && totalSheets >= d.minSheets) warn.push('В заказе ' + totalSheets + ' листов — можно отметить «' + d.name + '» ' + d.pct + '%.');
		});
		var discount = r2(discounts.reduce(function (a, d) { return a + d.sum; }, 0)), servD = r2(serv - discount);
		/* 5. материалы */
		var k = 1 + num(o.markup !== undefined && o.markup !== '' ? o.markup : cat.markup) / 100;
		var matLines = [
			{ key: 'm:mat', name: 'Стоимость материалов (уточняется при заказе)', price: r2(mat * k), qty: 1, on: !!o.ownMat, sum: o.ownMat ? r2(mat * k) : 0, check: 1, unit: '' },
			{ key: 'm:fit', name: 'Стоимость фурнитуры (уточняется при заказе)', price: r2(fit * k), qty: 1, on: !!o.ownFit, sum: o.ownFit ? r2(fit * k) : 0, check: 1, unit: '' }
		];
		var mats = r2(matLines[0].sum + matLines[1].sum);
		/* проценты от суммы (безнал) — к услугам */
		/* срочный заказ: % к услугам (без материалов) */
		var urgent = o.urgent ? r2(servD * num(cat.urgentPct, 30) / 100) : 0;
		var base = servD + urgent + mats, pctSum = 0;
		pct.forEach(function (p) { p.qty = p.on ? 1 : 0; p.sum = p.on ? r2(base * p.price / 100) : 0; p.check = 1; pctSum += p.sum; });
		blocks[2].lines = blocks[2].lines.concat(pct);
		var servAll = r2(servD + urgent + pctSum), total = r2(servAll + mats);
		var adv = r2(servAll * num(cat.advance.serv) / 100 + mats * num(cat.advance.mat) / 100);
		var paid = r2(o.payments.reduce(function (a, p) { return a + num(p.amount); }, 0));
		var sheetsList = {};
		items.forEach(function (x) { x.snap.sheets.forEach(function (sh) { var key = sh.name + '|' + sh.th; (sheetsList[key] = sheetsList[key] || { name: sh.name, th: sh.th, n: 0 }).n += sh.n; }); });
		return {
			blocks: blocks, matLines: matLines, serv: serv, discount: discount, discounts: discounts, cat: cat, servD: servD, urgent: urgent, pctSum: r2(pctSum), servAll: servAll, mats: mats, total: total,
			advance: Math.min(adv, total), rest: r2(total - Math.min(adv, total)), paid: paid, debt: r2(total - paid),
			sheets: totalSheets, parts: totalParts, smallEdge: sEdge, smallDrill: sDrill, matList: Object.keys(sheetsList).map(function (k2) { return sheetsList[k2]; }), warn: warn
		};
	};
	/* скидки заказа: список справочника (у старого справочника — одна «за комплекс»), отметки заказа */
	O.discountsFor = function (cat, o) {
		var list = Array.isArray(cat.discounts) ? cat.discounts : [{ id: 'complex', name: cat.complexText || 'Скидка за комплекс', pct: cat.complexPct, on: 1 }];
		return list.map(function (d) {
			var on = d.id === 'complex' ? !!o.complex : (o.disc && o.disc[d.id] !== undefined ? !!o.disc[d.id] : !!d.on);
			return { id: d.id, name: d.name, pct: num(d.pct), on: on, minSheets: num(d.minSheets), freeDays: num(d.freeDays), sum: 0 };
		});
	};
	O.setDiscount = function (o, id, on) {
		if (id === 'complex') { o.complex = on ? 1 : 0; return; }
		if (!o.disc || typeof o.disc !== 'object') o.disc = {};
		o.disc[id] = on ? 1 : 0;
	};
	/* текст условий с подстановкой */
	O.termsText = function (b, o, q) {
		var cat = O.catFor(b, o), t = Object.assign({}, cat.terms, o.terms || {}); if (o.urgent) t.days = num(cat.urgentDays, 3);
		O.discountsFor(cat, o).forEach(function (d) { if (d.on && d.freeDays > num(t.freeDays)) t.freeDays = d.freeDays; });
		var ld = (O.LOADS.filter(function (x) { return x[0] === t.load; })[0] || ['', 'средняя'])[1];
		var adv = cat.advance.serv + '% за услуги и ' + cat.advance.mat + '% за материалы при приобретении через нас';
		return String(t.text || '').replace(/\{аванс\}/g, adv).replace(/\{загрузка\}/g, ld).replace(/\{срок\}/g, t.days).replace(/\{день\}/g, (num(t.freeDays) + 1) + '-го').replace(/\{хранение\}/g, t.storage)
			.split(/\n+/).filter(function (s) { return s.trim(); });
	};
	/* прайс-лист для клиента: разделы справочника (работа за лист, услуги, доп. работы и фасады), надбавка/скидка в %, скрытые строки;
	   название «ЛДСП 8–16 мм: распил, кромка» без примечания → название «ЛДСП 8–16 мм», примечание «распил / кромка» */
	O.priceList = function (b, opt) {
		opt = opt || {}; var cat = b.cat, k = 1 + num(opt.pct) / 100, hide = opt.hide || {};
		function pr(v) { return Math.round(num(v) * k); }
		function split(name, note) { name = String(name || ''); if (note) return [name, note]; var i = name.indexOf(':'); return i > 0 ? [name.slice(0, i).trim(), name.slice(i + 1).trim().replace(/\s*,\s*/g, ' / ')] : [name, '']; }
		function unitOf(u) { var x = (O.UNITS.filter(function (z) { return z[0] === u; })[0] || ['', u || ''])[1]; return String(x).replace(/^за /, ''); }
		var secs = [];
		secs.push({ id: 'w', title: 'Работа за лист', note: 'цена за 1 лист раскроя, без стоимости материала', rows: cat.sheetWorks.map(function (w) { var n = split(w.name, w.note); return { key: 'w:' + w.id, name: n[0], note: n[1], price: pr(w.price), unit: 'лист' }; }) });
		secs.push({ id: 's', title: 'Услуги', note: '', rows: cat.services.filter(function (x) { return x.unit !== 'pct'; }).map(function (x) { var n = split(x.name, x.note); return { key: 's:' + x.id, name: n[0], note: n[1], price: pr(x.price), unit: unitOf(x.unit) }; }) });
		(cat.groups || []).forEach(function (g) { secs.push({ id: 'g:' + g.id, title: g.title, note: g.note || '', rows: (g.rows || []).map(function (r) { var n = split(r.name, r.note); return { key: 'r:' + r.id, name: n[0], note: n[1], price: pr(r.price), unit: r.unit || 'шт' }; }) }); });
		secs.forEach(function (x) { x.all = x.rows.length; x.rows = x.rows.filter(function (r) { return !hide[r.key] && r.price > 0; }); x.off = !!hide['sec:' + x.id]; });
		var t = cat.terms, terms = [];
		terms.push('Стандартный срок — до ' + t.days + ' раб. дней.' + (cat.urgentPct ? ' Срочный заказ за ' + (cat.urgentDays || 3) + ' дн. — +' + cat.urgentPct + '% к стоимости услуг.' : ''));
		O.discountsFor(cat, { complex: 1 }).forEach(function (d) { if (d.pct) terms.push(d.name + ' — скидка ' + d.pct + '% от услуг.'); else terms.push(d.name + '.'); });
		terms.push('Материал можно привезти свой или купить через нас: ' + String(cat.markupText || ('+' + cat.markup + '% к оптовому прайсу поставщика')) + '.');
		terms.push('Для запуска — аванс ' + cat.advance.serv + '% за услуги и ' + cat.advance.mat + '% за материалы.');
		cat.services.filter(function (x) { return x.unit === 'pct' && num(x.price); }).forEach(function (x) { terms.push(x.name + ' — +' + x.price + '% к сумме.'); });
		return { sections: secs.filter(function (x) { return !x.off && x.rows.length; }), all: secs, terms: opt.noTerms ? [] : terms, date: opt.date || O.today(), pct: num(opt.pct) };
	};
	/* сумма прописью: «Пятьдесят девять тысяч четыреста двадцать восемь рублей 05 копеек» */
	O.words = function (v) {
		v = Math.round(num(v) * 100); var rub = Math.floor(v / 100), kop = v % 100;
		var U1 = ['', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'], U2 = ['', 'одна', 'две', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
		var T = ['десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать', 'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать'];
		var D = ['', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто'];
		var H = ['', 'сто', 'двести', 'триста', 'четыреста', 'пятьсот', 'шестьсот', 'семьсот', 'восемьсот', 'девятьсот'];
		function form(n, f) { n = n % 100; var n1 = n % 10; return n > 10 && n < 20 ? f[2] : n1 > 1 && n1 < 5 ? f[1] : n1 === 1 ? f[0] : f[2]; }
		function tri(n, fem) { var h = Math.floor(n / 100), t = Math.floor(n % 100 / 10), u = n % 10, w = [H[h]]; if (t === 1) w.push(T[u]); else { w.push(D[t]); w.push((fem ? U2 : U1)[u]); } return w.filter(Boolean).join(' '); }
		var parts = [], groups = [[1e9, ['миллиард', 'миллиарда', 'миллиардов'], 0], [1e6, ['миллион', 'миллиона', 'миллионов'], 0], [1e3, ['тысяча', 'тысячи', 'тысяч'], 1]], r = rub;
		groups.forEach(function (g) { var n = Math.floor(r / g[0]); if (n) { parts.push(tri(n, g[2]) + ' ' + form(n, g[1])); r -= n * g[0]; } });
		if (r || !parts.length) parts.push(r ? tri(r, 0) : 'ноль');
		var s = parts.join(' ').replace(/\s+/g, ' ').trim();
		return s.charAt(0).toUpperCase() + s.slice(1) + ' ' + form(rub, ['рубль', 'рубля', 'рублей']) + ' ' + (kop < 10 ? '0' : '') + kop + ' ' + form(kop, ['копейка', 'копейки', 'копеек']);
	};
	O.statusName = function (s, b) { return b ? O.stageName(b, s) : (O.STATUSES.filter(function (x) { return x[0] === s; })[0] || ['', s])[1]; };
	O.money = function (v) { return r2(v).toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).replace(/ /g, ' '); };
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));
