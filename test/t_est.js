// Смета: правила строк, прайсы, наценка и скидка, свои строки, загрузка цен скрипта, документы.   node t_est.js [папка для PDF]
for (const f of ['geom', 'cut', 'project', 'draw', 'zip', 'out_tab', 'base', 'estimate', 'out_est', 'facades', 'out_det']) require('../web/core/' + f + '.js');
const fs = require('fs'), cp = require('child_process'), P = BM.project, E = BM.est, O = BM.out;
const outDir = process.argv[2] || __dirname + '/out/est';
fs.mkdirSync(outDir, { recursive: true });
let bad = 0, n = 0;
const ok = (c, text, extra) => { n++; if (!c) { bad++; console.log('НЕ ТАК', text, extra === undefined ? '' : '→ ' + JSON.stringify(extra)); } };
const load = (file, mut) => { const set = BM.defaults(); set.org = 'Мебельная мастерская'; set.author = 'Иванов И.'; if (mut) mut(set); const st = P.build(JSON.parse(fs.readFileSync(__dirname + '/out/' + file, 'utf8')), set); for (const m of st.mats) if (m.cfg.on) P.nest(st, m.key, { quality: 0 }); return st; };
const row = (R, kind, re) => R.rows.find(w => w.kind === kind && (!re || re.test(w.kind === 'profile' ? w.pname : w.label)));
const build = (st, pl) => E.build(st, E.conf(st.set), pl, st.work.est);

let st = load('est.bmk'), pl = E.newList('Розница'), R = build(st, pl);
// ---- строки и разделы ----
ok(R.rows.length >= 40, 'строк в таблице', R.rows.length);
ok(row(R, 'panel', /Nordeco/) && row(R, 'panel', /Nordeco/).unit === 'листов', 'плита считается листами');
const sm = P.summary(st), nordeco = sm.mats.find(x => /Nordeco/.test(x.mat.name));
{	/* STHGroup: последний лист — дробью; «листы целыми» — как раскрой */
	const w = row(R, 'panel', /Nordeco/);
	ok(w.part && w.calc === Math.round((nordeco.std - 1 + w.part.f) * 100) / 100 && w.calc < nordeco.std && /кусок 0,\d л\.: \d+×\d+ — поискать в цеху/.test(w.note), 'листы из раскроя, последний — дробью', [w.calc, nordeco.std, w.part, w.note]);
	const plW = E.newList('ц'); E.setUnit(R, w, 4, plW, st.work.est); const RW = build(st, plW), ww = row(RW, 'panel', /Nordeco/);
	ok(plW.WHOLE[w.gkey] === 1 && ww.calc === nordeco.std && !ww.part && E.unitChoice(RW, ww).value === 4 && /целыми листами/.test(ww.note), '«листы целыми» — целые листы раскроя', [ww.calc, ww.note]);
	E.setUnit(RW, ww, 0, plW, st.work.est); ok(!plW.WHOLE[w.gkey], 'снова «листы» — дробь');
	const sh = { L: 2800, W: 2070, recs: [{ x: 0, y: 0, a: 690, b: 2050 }] }, f = E.lastFrac(sh, 10);
	ok(f.f === 0.3 && f.pL === 710 && f.pW === 2070, 'деталь 690 мм по длине на всю ширину → 0,3 листа, кусок 710×2070', f);
	const f2 = E.lastFrac({ L: 2800, W: 2070, recs: [{ x: 0, y: 0, a: 2780, b: 300 }] }, 10);
	ok(f2.f === 0.2 && f2.pL === 2800 && f2.pW === 320, 'полоса вдоль листа — режем поперёк: 0,2, кусок 2800×320', f2);
	const f3 = E.lastFrac({ L: 2800, W: 2070, recs: [{ x: 0, y: 0, a: 2780, b: 2050 }] }, 10);
	ok(f3.f === 1, 'полный лист — целый', f3);
}
const ceilSum = re => R.rows.filter(w => w.kind === 'panel' && !w.sqm && re(w.label)).reduce((a, w) => a + Math.ceil(w.calc), 0);
ok(row(R, 'cut', /^Распил$/).calc === ceilSum(l => !/ХДФ/.test(l)), 'распил — сумма целых листов без ХДФ');
ok(row(R, 'cut', /ХДФ/) && row(R, 'cut', /ХДФ/).calc === Math.ceil(row(R, 'panel', /ХДФ/).calc), 'распил ХДФ — отдельной строкой');
ok(row(R, 'fastener', /Петля/).priceDef === 350 && row(R, 'fastener', /Конфирмат/).priceDef === 0, 'петля получает цену петли по умолчанию');
ok(row(R, 'fastener', /Направляющие/).unit === 'компл.' && row(R, 'fastener', /Направляющие/).calc === 4 && row(R, 'fastener', /Направляющие/).note === '8 шт', 'комплект из двух частей — комплектами', row(R, 'fastener', /Направляющие/));
ok(row(R, 'fastener', /Ручка/).unit === 'шт' && row(R, 'fastener', /Ручка/).calc === 12, 'комплект из одной части — штуками');
ok(!row(R, 'fastener', /Шуруп/) && !row(R, 'fastener', /Шаблон/) && !row(R, 'fastener', /Макет/), 'части комплекта и исключённое из сметы не считаются');
const gola = row(R, 'profile', /Gola/);
ok(gola && gola.plen === 3000 && gola.calc === 2 && gola.unit === 'шт' && gola.utail === ' по 3 м', 'профиль раскладывается по хлыстам 3 м', gola && [gola.plen, gola.calc, gola.pieces]);
ok(row(R, 'profile', /Плинтус/).plen === 4000, 'длина хлыста читается из названия «4 м»');
ok(row(R, 'profile', /торцевой/).plen === 3000, 'длина хлыста читается из «L=3000»');
// погонный материал (столешница, стеновая панель): свой раздел после кромки, считается как профили
const lin0 = row(R, 'linear', /Стол\. Slotex/), tube0 = row(R, 'linear', /Труба/);
ok(lin0 && tube0 && lin0.head === 'ПОГОННЫЙ МАТЕРИАЛ' && lin0.group === 'МАТЕРИАЛ' && lin0.plen === 3050 && lin0.calc === 1 && lin0.unit === 'шт' && lin0.utail === ' по 3,05 м' && lin0.priceId === 'LL3050:Стол. Slotex Dominicana' && lin0.ptot === 2400 && lin0.punit === 'руб./шт',
	'погонный материал — строкой: штуками по 3,05 м', lin0 && [lin0.plen, lin0.calc, lin0.unit, lin0.utail, lin0.priceId, lin0.ptot]);
ok(!R.lists.some(l => /Погонные/.test(l.title)) && E.ordered(R).on.map(i => R.rows[i].head).filter((h, i, a) => a.indexOf(h) === i).slice(0, 4).join('|') === 'ПЛИТНЫЙ МАТЕРИАЛ|КРОМОЧНЫЙ МАТЕРИАЛ|ПОГОННЫЙ МАТЕРИАЛ|РАСПИЛ', 'раздел «Погонный материал» — после плитного и кромочного');
{
	const stL = load('est.bmk'), plL = E.newList('л'); let RL = build(stL, plL), l = row(RL, 'linear', /Стол/);
	ok(E.unitChoice(RL, l).options.map(o => o[1]).join('|') === 'по 3,05 м|по 4,2 м|пог. м|не считать', 'погонный: выбор длины, метров или «не считать»', E.unitChoice(RL, l).options);
	E.setUnit(RL, l, 0, plL, stL.work.est); RL = build(stL, plL); l = row(RL, 'linear', /Стол/);
	ok(l.plen === 0 && l.calc === 2.4 && l.unit === 'м' && l.priceId === 'LM:Стол. Slotex Dominicana' && plL.PLEN['L:Стол. Slotex Dominicana'] === 0, 'погонный: метрами', [l.plen, l.calc, l.priceId]);
	E.setUnit(RL, l, 4200, plL, stL.work.est); E.setPrice(row(build(stL, plL), 'linear', /Стол/), 9000, plL, stL.work.est); RL = build(stL, plL); l = row(RL, 'linear', /Стол/);
	ok(l.plen === 4200 && l.calc === 1 && l.sum === 9000 && plL.P['LL4200:Стол. Slotex Dominicana'] === 9000 && RL.sections.some(x => x.title === 'МАТЕРИАЛ ПОГОННЫЙ' && x.total === 9000 && x.group === 'МАТЕРИАЛ'), 'погонный: по 4,2 м, цена за штуку, раздел в смете', [l.plen, l.calc, l.sum]);
	E.setUnit(RL, l, 3050, plL, stL.work.est);
	ok(!('L:Стол. Slotex Dominicana' in plL.PLEN), 'погонный: длина по умолчанию в прайс не пишется');
	stL.work.sets = 3; P.refresh(stL); RL = build(stL, plL); l = row(RL, 'linear', /Стол/);
	ok(l.calc === 3 && l.ptot === 7200 && l.pieces === '2400×3', 'погонный: три комплекта — три куска, три штуки по 3,05 м', [l.calc, l.ptot, l.pieces]);
	const stS = load('est.bmk', x => { x.est.linLens = [2000]; }), RS2 = build(stS, E.newList('к')), ls = row(RS2, 'linear', /Стол/);
	ok(ls.plen === 2000 && /не влезает в 2 м/.test(ls.bad) && ls.calc === 2, 'погонный: кусок длиннее стандартной длины — предупреждение', [ls.plen, ls.bad, ls.calc]);
}
ok(row(R, 'edge', /Dominicana|Slotex/) || row(R, 'edge', /1\.0x19/), 'кромка считается');
ok(R.warns.some(w => /Скрытых панелей: 2/.test(w)), 'предупреждение о скрытых панелях', R.warns);
ok(row(R, 'notch', /Выемка/) && row(R, 'notch', /Выемка/).unit === 'шт', 'выемка без длины — штуками');
ok(row(R, 'plast', /Склейка Пластик/) && Math.abs(row(R, 'plast', /Склейка Пластик/).calc - 0.28) < 0.001, 'облицовка — кв.м', row(R, 'plast', /Склейка Пластик/));
ok(row(R, 'edgework', /Криволинейная 2/) && row(R, 'edgework', /Прямолинейная 0.4/), 'кромкование по классам толщины');
ok(R.sub === R.sections.reduce((a, s) => a + s.total, 0) && R.grand === R.sub, 'итог — сумма разделов');

// ---- правки строк ----
let w = row(R, 'panel', /Nordeco/);
E.setPrice(w, 6400, pl, st.work.est); R = build(st, pl); w = row(R, 'panel', /Nordeco/);
ok(w.price === 6400 && w.sum === w.calc * 6400 && pl.P['S:' + w.gkey] === 6400, 'цена пишется в прайс по названию материала');
E.setPrice(w, 7000, pl, st.work.est);
ok(!('S:' + w.gkey in pl.P), 'цена, равная цене по умолчанию, из прайса убирается');
E.setPrice(w, 6400, pl, st.work.est);
E.setQty(w, w.calc + 1, st.work.est); R = build(st, pl); w = row(R, 'panel', /Nordeco/);
ok(w.manual && w.val === w.calc + 1 && R.warns.some(x => /вручную/.test(x)), 'количество вручную');
E.setUnit(R, w, 1, pl, st.work.est); R = build(st, pl); w = row(R, 'panel', /Nordeco/);
ok(w.sqm === 1 && w.unit === 'кв.м' && !w.manual && w.priceId.indexOf('Q:') === 0, 'смена единицы сбрасывает ручное количество и меняет ключ цены', [w.sqm, w.manual, w.priceId]);
E.setUnit(R, w, 3, pl, st.work.est); R = build(st, pl); w = row(R, 'panel', /Nordeco/);
ok(w.info === 1 && w.sum === 0 && w.sqm === 1, '«справочно»: единица прежняя, денег нет');
E.setUnit(R, w, 2, pl, st.work.est); R = build(st, pl); w = row(R, 'panel', /Nordeco/);
ok(w.off === 1 && R.unacc.some(u => u.row === w.i && u.why === 'не считается'), '«не считать» → в списке неучтённого');
E.setUnit(R, w, 0, pl, st.work.est); R = build(st, pl); w = row(R, 'panel', /Nordeco/);
ok(!w.off && !w.info && !w.sqm && w.price === 6400, 'вернули листы — цена за лист на месте');
let f = row(R, 'fastener', /Ручка/);
E.setUnit(R, f, 1, pl, st.work.est); R = build(st, pl); f = row(R, 'fastener', /Ручка/);
ok(f.unit === 'компл.' && f.calc === 6 && f.priceId.indexOf('FK:') === 0, 'фурнитура комплектами: 12 шт → 6 компл.');
E.setUnit(R, f, 0, pl, st.work.est);
let c = row(R, 'cut', /^Распил$/); const sheetsCut = c.calc;
E.setUnit(R, c, 2, pl, st.work.est); R = build(st, pl); c = row(R, 'cut', /^Распил$/);
ok(c.cunit === 2 && c.unit === 'метров' && c.calc > 10 && c.priceId === 'CutS' && c.note === sheetsCut + ' л.', 'распил по длине реза из раскроя', [c.calc, c.note]);
E.setUnit(R, c, 1, pl, st.work.est); R = build(st, pl); c = row(R, 'cut', /^Распил$/);
ok(c.cunit === 1 && c.priceId === 'CutM', 'распил по периметру');
E.setUnit(R, c, 0, pl, st.work.est);
let g = row(R, 'profile', /Gola/);
E.setUnit(R, g, 2000, pl, st.work.est); R = build(st, pl); g = row(R, 'profile', /Gola/);
ok(g.plen === 2000 && /не влезает в 2 м/.test(g.bad) && g.priceId === 'RL2000:' + g.pname, 'кусок длиннее хлыста — замечание', g.bad);
E.setUnit(R, g, 0, pl, st.work.est); R = build(st, pl); g = row(R, 'profile', /Gola/);
ok(g.plen === 0 && g.unit === 'м' && Math.abs(g.calc - 5.68) < 0.001, 'профиль погонными метрами', g.calc);
E.setUnit(R, g, 3000, pl, st.work.est);
let e = row(R, 'edgework', /Прямолинейная 1/);
E.setUnit(R, e, 1, pl, st.work.est); R = build(st, pl); e = row(R, 'edgework', /Прямолинейная 1/);
ok(e.eunit === 1 && /PUR/.test(e.punit) && /P$/.test(e.priceId), 'кромкование PUR — своя цена');
E.setUnit(R, e, 0, pl, st.work.est);

// ---- наценка, скидка, прочее ----
R = build(st, pl);
for (const x of R.rows) { if (x.kind !== 'extra' && !x.off && !(x.price > 0)) E.setPrice(x, x.kind === 'hole' ? 8 : 100, pl, st.work.est); }
R = build(st, pl);
const base = R.sub;
pl.mk = { M: 15, W: 0, F: 20 };
let R2 = build(st, pl);
ok(Math.abs(R2.groups['МАТЕРИАЛ'] - R.groups['МАТЕРИАЛ'] * 1.15) <= R.rows.length && R2.groups['РАБОТЫ'] === R.groups['РАБОТЫ'] && Math.abs(R2.groups['ФУРНИТУРА'] - R.groups['ФУРНИТУРА'] * 1.2) <= R.rows.length, 'наценка: материал 15 %, работы 0, фурнитура 20 %', [R.groups, R2.groups]);
const pr = row(R2, 'panel', /Nordeco/);
ok(pr.priceOut === 7360 && pr.price === 6400 && pr.sum === Math.round(pr.val * 7360), 'наценка спрятана в цене строки', [pr.priceOut, pr.sum]);
st.work.est.disc = 5; R2 = build(st, pl);
ok(R2.discSum === Math.round(R2.sub * 0.05) && R2.grand === R2.sub - R2.discSum, 'скидка — от всей суммы, отдельной строкой');
const id1 = E.addOwnRow(st.work.est, 'Доставка и подъём', 'sum', 2500);
E.addOwnRow(st.work.est, 'Монтаж', 'pct', 10);
E.addOwnRow(st.work.est, 'Проектирование', 'sqm', 350);
let R3 = build(st, pl);
const baseMWF = R3.groups['МАТЕРИАЛ'] + R3.groups['РАБОТЫ'] + R3.groups['ФУРНИТУРА'];
const xs = R3.rows.filter(x => x.own);
ok(xs.length === 3 && xs[0].sum === 2500 && xs[1].sum === Math.round(baseMWF * 0.1) && xs[2].sum === Math.round(R3.packArea * 350), 'свои строки: суммой, процентом, за кв.м', xs.map(x => x.sum));
ok(R3.groups['ПРОЧЕЕ'] === xs.reduce((a, x) => a + x.sum, 0), 'свои строки в итоге «Прочее»');
E.setUnit(R3, xs[0], 'off', pl, st.work.est); R3 = build(st, pl);
ok(R3.rows.find(x => x.ownId === id1).off === 1 && R3.groups['ПРОЧЕЕ'] === xs[1].sum + xs[2].sum, 'свою строку можно выключить');
E.dropOwnRow(st.work.est, id1); ok(st.work.est.rows.length === 2, 'свою строку можно удалить');
const proj = R3.rows.find(x => x.xid === 'Project');
E.setUnit(R3, proj, 'sqm', pl, st.work.est); R3 = build(st, pl);
E.setPrice(R3.rows.find(x => x.xid === 'Project'), 200, pl, st.work.est); R3 = build(st, pl);
ok(pl.XMODE.Project === 'sqm' && pl.P['Project:Q'] === 200 && R3.rows.find(x => x.xid === 'Project').sum === Math.round(R3.packArea * 200), '«Проект» за кв.м панелей — правило и цена в прайсе');
// свои строки в любом разделе (1.20.2) и «Дополнительные материалы»
{
	const we = st.work.est, n0 = (we.rows || []).length;
	const idD = E.addOwnRow(we, 'Блок питания SLIM', 'sum', 0, E.DOP), idF = E.addOwnRow(we, 'Ручка своя', 'sum', 0, 'ФУРНИТУРА', 'Ручки');
	let RO = build(st, pl), d = RO.rows.find(x => x.ownId === idD), f = RO.rows.find(x => x.ownId === idF);
	ok(d && d.kind === 'own' && d.head === E.DOP && d.group === E.DOP && d.val === 1 && d.unit === 'шт' && f.group === 'ФУРНИТУРА' && f.mkind === 'Ручки', 'своя строка: раздел, группа, 1 шт, подгруппа', [d && d.kind, f && f.mkind]);
	E.setQty(d, 2, we); E.setPrice(d, 1500, pl, we); E.setOwn(we, idD, 'unit', 'компл.'); E.setOwn(we, idD, 'shop', 'Свет-Маркет'); E.setArt(d, 'SL-24', pl, we);
	RO = build(st, pl); d = RO.rows.find(x => x.ownId === idD);
	ok(d.val === 2 && d.price === 1500 && d.sum === Math.round(2 * 1500 * (1 + RO.mk.M / 100)) && d.punit === 'руб./компл.' && d.sup.shop === 'Свет-Маркет' && d.art === 'SL-24', 'своя строка: количество × цена с наценкой материала, единица, поставщик, артикул', [d.sum, d.punit]);
	ok(RO.groups[E.DOP] === d.sum && RO.sections.findIndex(x => x.group === E.DOP) === RO.sections.findIndex(x => x.group === 'ПРОЧЕЕ') - 1, '«Дополнительные материалы» — свой итог, перед «Прочим»');
	const pctRow = RO.rows.find(x => x.own && x.xmode === 'pct');
	ok(pctRow.val === RO.groups['МАТЕРИАЛ'] + RO.groups['РАБОТЫ'] + RO.groups['ФУРНИТУРА'] + RO.groups[E.DOP], 'процент «Прочего» считается и от доп. материалов');
	E.setPrice(RO.rows.find(x => x.ownId === idF), 300, pl, we); RO = build(st, pl);
	const fs1 = RO.sections.find(x => x.title === 'ФУРНИТУРА');
	ok(fs1.rows.some(x => /Ручка своя/.test(x.label)) && RO.groups['ФУРНИТУРА'] > R3.groups['ФУРНИТУРА'], 'своя строка в «Фурнитуре» входит в раздел и итог');
	E.setUnit(RO, RO.rows.find(x => x.ownId === idF), 'off', pl, we); RO = build(st, pl);
	ok(RO.rows.find(x => x.ownId === idF).off === 1 && !RO.sections.find(x => x.title === 'ФУРНИТУРА').rows.some(x => /Ручка своя/.test(x.label)), 'свою строку раздела можно выключить');
	ok(E.supOrder(RO).some(g => g.shop === 'Свет-Маркет' && g.rows.some(r => /Блок питания/.test(r.name))), 'своя строка — в заказе поставщику');
	// подсказки
	const cands = E.ownCands(RO, pl), hit = E.ownFind(cands, 'петл');
	ok(hit.length && /Петля/i.test(hit[0].name) && hit[0].price > 0, 'подсказки: позиции сметы с ценой', hit[0]);
	ok(E.ownFind(cands, 'ZM-ECH').some(c => c.art === 'ZM-ECHC09BEO'), 'подсказки: поиск по артикулу');
	E.fillOwn(we, idD, { name: 'Петля накладная', art: 'ZM-1', price: 99, unit: 'шт', shop: 'Блюм' });
	RO = build(st, pl); d = RO.rows.find(x => x.ownId === idD);
	ok(d.title === 'Петля накладная' && d.art === 'ZM-1' && d.price === 99 && d.unit === 'шт' && d.sup.shop === 'Блюм' && d.val === 2, 'подсказка заполняет строку, количество остаётся');
	// документ: без «Внимание» и «Не учтено», без двойных заголовков
	const doc = O.estDoc(RO, st, { kind: 'full' }), bl = doc.blocks;
	ok(!bl.some(x => x.title === 'Внимание' || x.title === 'Не учтено в смете') && RO.unacc.length > 0, 'PDF: нет блоков «Внимание» и «Не учтено в смете»');
	const gi = bl.findIndex(x => x.t === 'group' && x.title === 'ПРОЧЕЕ'), gd = bl.findIndex(x => x.t === 'group' && x.title === E.DOP);
	ok(gi > 0 && bl[gi + 1].t === 'row' && gd > 0 && gd < gi && bl[gd + 1].t === 'row', 'PDF: «ПРОЧЕЕ» и «ДОП. МАТЕРИАЛЫ» — один заголовок', [bl[gi + 1], bl[gd + 1]].map(x => x.t));
	ok(O.estDoc(RO, st, { kind: 'client' }).strip.some(x => x.label === 'ДОП. МАТЕРИАЛЫ'), 'PDF: доп. материалы в полосе итогов');
	we.rows = we.rows.filter(x => x.id !== idD && x.id !== idF);
	ok(we.rows.length === n0 && !O.estDoc(build(st, pl), st, { kind: 'client' }).strip.some(x => x.label === 'ДОП. МАТЕРИАЛЫ'), 'пустые доп. материалы в полосу итогов не идут');
}

// ---- прайсы ----
const store = E.fixStore({ lists: [pl] });
const opt = E.copyList(pl, 'Опт', -10); store.lists.push(opt);
ok(opt.P['S:' + pr.gkey] === 5760 && opt.cls.LDSP16.val === 6300 && pl.P['S:' + pr.gkey] === 6400, 'копия прайса с процентом; исходный не тронут');
opt.P['S:' + pr.gkey] = 5000;
ok(pl.P['S:' + pr.gkey] === 6400, 'прайсы независимы');
st.work.est.pl = 'Опт';
ok(E.listFor(store, st) === opt, 'прайс проекта — записанный в проекте');
st.work.est.pl = 'нет такого';
ok(E.listFor(store, st) === store.lists[0], 'нет прайса из проекта — берётся первый');
ok(E.fixStore({ lists: [{ name: 'А' }, { name: 'а' }] }).lists[1].name !== 'а', 'одинаковые названия прайсов разводятся');
ok(E.fixStore(null).lists.length === 1, 'пустое хранилище получает прайс по умолчанию');

// ---- цены из файла скрипта «СМЕТА» ----
const txt = ['# СМЕТА v7.42. Цены по материалам.', 'EDGE_RESERVE=15', 'PROF_RESERVE=50', 'PROF_KERF=3', 'SHOW_HOLES=0', 'PRICE_UNITS=2', 'DEF|edge=40', 'DEF|pack=120',
	'P|S:' + pr.gkey + '=6100', 'P|E:Кромка Дуб Сонома 1.0x19=38', 'P|F:Петля накладная=410', 'P|FK:Ручка-скоба 128 мм=180', 'P|Cut=900', 'P|RL3000:Профиль-ручка Gola L=1900', 'P|Project=5000',
	'SQM|ХДФ Белый | 3=1', 'PLEN|Плинтус кухонный 4 м=3000', 'FUNIT|Ручка-скоба 128 мм=1', 'CUNIT|CUT=2', 'EUNIT|EDGELINE_T1=1', 'REFONLY|E:Кромка белая 2x28=1', 'OFF|H:5 x 12=1', 'M2|MDF=1200', 'Veneer=9000', 'Странное=имя=5'].join('\r\n');
const imp = E.importScript(txt, 'Из скрипта');
ok(imp.conf.edgeReserve === 15 && imp.conf.profReserve === 50 && imp.conf.profKerf === 3 && imp.conf.showHoles === 0, 'настройки расчёта из файла скрипта', imp.conf);
const ip = imp.list;
ok(ip.P['S:' + pr.gkey] === 6100 && ip.P.Cut === 900 && ip.def.edge === 40 && ip.def.pack === 120 && ip.cls.MDF.m2 === 1200 && ip.cls.Veneer.val === 9000, 'цены и цены по умолчанию из файла скрипта');
ok(ip.SQM['ХДФ Белый | 3'] === 1 && ip.PLEN['Плинтус кухонный 4 м'] === 3000 && ip.FUNIT['Ручка-скоба 128 мм'] === 1 && ip.CUNIT.CUT === 2 && ip.EUNIT.EDGELINE_T1 === 1 && ip.REF['E:Кромка белая 2x28'] === 1 && ip.OFF['H:5 x 12'] === 1, 'единицы, «справочно» и «не считать» из файла скрипта');
const st2 = load('est.bmk', s => { Object.assign(s.est, imp.conf); }), RI = build(st2, ip);
ok(row(RI, 'panel', /Nordeco/).price === 6100 && row(RI, 'fastener', /Петля накладная/).price === 410 && row(RI, 'fastener', /Ручка/).unit === 'компл.' && row(RI, 'fastener', /Ручка/).price === 180, 'загруженные цены попадают в строки по названию материала');
ok(row(RI, 'panel', /ХДФ/).sqm === 1 && row(RI, 'profile', /Плинтус/).plen === 3000 && row(RI, 'cut', /^Распил$/).cunit === 2 && row(RI, 'profile', /Gola/).price === 1900, 'загруженные единицы применены');
ok(!RI.rows.some(x => x.kind === 'hole') && RI.warns.some(x => /Отключено: отверстия/.test(x)), 'раздел «Отверстия» выключен, как в файле скрипта');
ok(row(RI, 'edge', /Dominicana|Сонома/) && /\+15%/.test(row(RI, 'edge', /Сонома/).unit), 'запас по кромке из файла скрипта');
// старый файл скрипта (без PRICE_UNITS): цена комплекта лежала под «F:»
const old = E.importScript('P|F:Направляющие скрытого монтажа 500=2400\r\nEdge=30', 'старый').list;
const RO = build(load('est.bmk'), old);
ok(row(RO, 'fastener', /Направляющие/).price === 2400 && old.P['FK:Направляющие скрытого монтажа 500'] === 2400 && old.def.edge === 30, 'цена комплекта из старого файла скрипта переносится на «компл.»');

// ---- настройки расчёта ----
let RH = build(load('est.bmk', s => { s.est.hidden = 1; }), E.newList('x'));
ok(!RH.warns.some(x => /Скрытых/.test(x)) && RH.res.Fasteners['Полкодержатель 5 мм'] === 25 && RH.res.panels === R.res.panels + 2, 'скрытые панели и крепёж включаются настройкой', [RH.res.Fasteners['Полкодержатель 5 мм'], RH.res.panels, R.res.panels]);
// артикул отдельным столбцом: у плиты, кромки, фурнитуры, комплектов и профилей; на цену и ключи прайса не влияет
const artOf = (RR, kind, re) => (row(RR, kind, re) || {}).art;
ok(R.hasArt === 1 && artOf(R, 'fastener', /Петля накладная/) === 'ZM-ECHC09BEO' && artOf(R, 'panel', /Nordeco/) === '16 мм_Кашемир (Р)' && artOf(R, 'profile', /Gola/) === 'GOLA-L' && artOf(R, 'fastener', /Ручка-скоба/) === 'RS-128' && artOf(R, 'fastener', /Направляющие/) === 'GTV-500' && /Кашемир/.test(artOf(R, 'edge', /Nordeco/)), 'артикул — отдельным полем строки',
	R.rows.filter(x => x.art).map(x => x.kind + ':' + x.art));
ok(artOf(R, 'panel', /Дуб Сонома/) === '' && artOf(R, 'cut', /./) === '' && !/Артикул/.test(row(R, 'fastener', /Петля накладная/).label) && row(R, 'fastener', /Петля накладная/).priceId === 'F:Петля накладная', 'без артикула — пусто; название и ключ цены прежние');
// прежде артикул можно было вписать в название: цены, записанные под таким названием, не теряются
{
	const plM = E.newList('м'), g0 = row(R, 'panel', /Nordeco/).gkey;
	plM.P['F:Петля накладная. Артикул ZM-ECHC09BEO'] = 777; plM.P['S:' + g0.replace(' | ', '. Артикул 16 мм_Кашемир (Р) | ')] = 6100; plM.OFF['F:Ручка-скоба 128 мм. Артикул RS-128'] = 1;
	const RM = build(load('est.bmk'), plM);
	ok(row(RM, 'fastener', /Петля накладная/).price === 777 && row(RM, 'panel', /Nordeco/).price === 6100 && row(RM, 'fastener', /Ручка-скоба/).off === 1 && plM.P['F:Петля накладная'] === 777 && !Object.keys(plM.P).some(k => /Артикул/.test(k)), 'цены под названием с артикулом переносятся на название без него', Object.keys(plM.P));
}
// артикул и наименование вручную: пишутся в прайс, цена остаётся за строкой
{
	const stA = load('est.bmk'), plA = E.newList('а'); let RA = build(stA, plA), d = row(RA, 'panel', /Дуб Сонома/), h = row(RA, 'fastener', /Петля накладная/);
	E.setPrice(d, 6500, plA, stA.work.est); E.setArt(d, '  H1145 ST10 ', plA, stA.work.est); E.setName(d, 'ЛДСП Egger  Дуб Сонома 16 мм', plA, stA.work.est); E.setArt(h, 'BLUM-71', plA, stA.work.est);
	RA = build(stA, plA); d = RA.rows.find(x => x.offKey === d.offKey); h = RA.rows.find(x => x.offKey === h.offKey);
	ok(d.art === 'H1145 ST10' && d.artSet === 1 && d.art0 === '' && d.title === 'ЛДСП Egger Дуб Сонома 16 мм' && d.renamed === 1 && /Дуб Сонома/.test(d.name0) && d.price === 6500 && plA.ART[d.offKey] === 'H1145 ST10' && plA.NAME[d.offKey] === d.title,
		'артикул и наименование вручную — в прайсе, цена на месте', [d.art, d.title, d.price]);
	ok(h.art === 'BLUM-71' && h.art0 === 'ZM-ECHC09BEO' && h.priceId === 'F:Петля накладная', 'свой артикул заменяет артикул из модели');
	const dc = O.estDoc(RA, stA, { kind: 'client' }), om = E.order(RA);
	ok(dc.blocks.some(b => b.t === 'row' && b.name === 'ЛДСП Egger Дуб Сонома 16 мм' && b.art === 'H1145 ST10') && om.mat.some(m => m.title === 'ЛДСП Egger Дуб Сонома 16 мм' && m.art === 'H1145 ST10') && om.furn.some(f => f.art === 'BLUM-71'), 'они же — в смете и в заказах');
	ok(E.copyList(plA, 'копия', 10).ART[d.offKey] === 'H1145 ST10', 'копия прайса уносит артикулы и наименования');
	E.setArt(d, '', plA, stA.work.est); E.setName(d, '', plA, stA.work.est); E.setArt(h, 'ZM-ECHC09BEO', plA, stA.work.est); RA = build(stA, plA);
	ok(!Object.keys(plA.ART).length && !Object.keys(plA.NAME).length && RA.rows.find(x => x.offKey === d.offKey).title === d.name0 && RA.rows.find(x => x.offKey === h.offKey).art === 'ZM-ECHC09BEO', 'пустое поле или значение из модели — правка снимается');
	const id = E.addOwnRow(stA.work.est, 'Доставка', 'sum', 2500); RA = build(stA, plA); const o = RA.rows.find(x => x.ownId === id);
	E.setArt(o, 'DOST-1', plA, stA.work.est); RA = build(stA, plA);
	ok(RA.rows.find(x => x.ownId === id).art === 'DOST-1' && stA.work.est.rows[0].art === 'DOST-1' && !Object.keys(plA.ART).length, 'артикул своей строки хранится в проекте');
}
let RNA = build(load('est.bmk', s => { s.est.artCol = 0; }), E.newList('x'));
ok(RNA.rows.some(x => x.art) && !O.estDoc(RNA, load('est.bmk', s => { s.est.artCol = 0; }), { kind: 'full' }).art && O.estDoc(R, st, { kind: 'full' }).art === 1, 'столбец «Артикул» в документах выключается настройкой; в таблице артикулы остаются');
let RC = build(load('est.bmk', s => { s.est.cornerMax = 400; s.est.cornerFrac = 60; }), E.newList('x'));
ok(RC.res.CurveOut < R.res.CurveOut, 'скругление короче заданного — обычный угол', [RC.res.CurveOut, R.res.CurveOut]);
let RS = build(load('est.bmk', s => { s.est.holesSort = 15; }), E.newList('x'));
ok(RS.lists.some(l => /Отверстия \(всего/.test(l.title) && l.lines.length === 2), 'отверстия в справке: до и более 15 мм', RS.lists);
let RT = build(load('est.bmk', s => { s.est.thinMask = 'нет такого'; s.est.thinTh = ''; }), E.newList('x'));
ok(!row(RT, 'cut', /ХДФ/), 'маска тонкого листа задаётся настройкой');
const st3 = load('est.bmk'); st3.work.sets = 2; P.refresh(st3); for (const m of st3.mats) if (m.cfg.on) P.nest(st3, m.key, { quality: 0 });
const R4 = build(st3, E.newList('x'));
ok(row(R4, 'fastener', /Петля накладная/).calc === 36 && R4.totalHoles === R.totalHoles * 2 && Math.abs(R4.packArea - R.packArea * 2) < 0.01 && R4.warns.some(x => /Комплектов/.test(x)), 'комплекты умножают всё', [row(R4, 'fastener', /Петля накладная/).calc, R4.totalHoles]);
// прежний проект (выгрузка 1.0): смета считается, но предупреждает
const oldDoc = JSON.parse(fs.readFileSync(__dirname + '/out/sample.bmk', 'utf8'));
for (const k of ['est', 'fast', 'kits', 'prof', 'lin', 'hidden']) delete oldDoc.model[k];
oldDoc.model.parts = oldDoc.model.parts.filter(p => !p.lin && !p.hid); oldDoc.model.holes = oldDoc.model.holes.filter(h => !h.hid).map(h => ({ fast: h.fast, dia: h.dia, depth: h.depth, mode: h.mode, p: h.p, d: h.d }));
const stO = P.build(oldDoc, BM.defaults()); for (const m of stO.mats) if (m.cfg.on) P.nest(stO, m.key, { quality: 0 });
const RO2 = build(stO, E.newList('x'));
ok(RO2.warns.some(x => /прежним скриптом/.test(x)) && !RO2.rows.some(x => x.kind === 'fastener') && RO2.rows.some(x => x.kind === 'hole') && RO2.rows.some(x => x.kind === 'panel'), 'прежний проект: плита и отверстия считаются, о фурнитуре — предупреждение');
// раскрой ещё не сделан — листы по площади и предупреждение
const stN = P.build(JSON.parse(fs.readFileSync(__dirname + '/out/est.bmk', 'utf8')), BM.defaults()), RN = build(stN, E.newList('x'));
ok(RN.warns.some(x => /не пересчитан/.test(x)) && row(RN, 'panel', /Nordeco/).calc >= 1 && /по площади/.test(row(RN, 'panel', /Nordeco/).note), 'без раскроя листы считаются по площади', row(RN, 'panel', /Nordeco/).note);

// ---- документы ----
st.set.est.note = 'Срок изготовления 14 рабочих дней. Предоплата 70 %.';
st.work.est.client = 'Петров Сергей, +7 900 000-00-00';
R3 = build(st, pl);
for (const [kind, o] of [['client', {}], ['full', {}], ['mat', {}], ['furn', {}], ['client', { noPrice: 1 }], ['client', { totals: 1 }]]) {
	const name = kind + (o.noPrice ? '-без-цены' : '') + (o.totals ? '-итоги' : ''), d = O.estHtml(R3, st, Object.assign({ kind }, o));
	const html = outDir + '/' + name + '.html', pdf = outDir + '/' + name + '.pdf';
	fs.writeFileSync(html, d.html);
	cp.execFileSync('/opt/pw-browsers/chromium', ['--headless', '--no-sandbox', '--disable-gpu', '--no-pdf-header-footer', '--print-to-pdf=' + pdf, 'file://' + html], { stdio: 'ignore' });
	const info = cp.execSync('pdfinfo "' + pdf + '"').toString(), pages = Number(/Pages:\s+(\d+)/.exec(info)[1]), text = cp.execSync('pdftotext -layout "' + pdf + '" -').toString();
	ok(pages === d.pages, name + ': листов в PDF столько же, сколько рассчитано', [pages, d.pages]);
	ok(/A4/.test(info), name + ': формат А4');
	ok(text.indexOf('лист ' + pages + ' из ' + pages) >= 0, name + ': нумерация листов');
	ok(text.indexOf('Мебельная мастерская') >= 0 && text.indexOf('составил Иванов И.') >= 0 && text.indexOf('Петров Сергей') >= 0, name + ': организация, составитель, заказчик');
	if (kind === 'client' && !o.noPrice) ok(text.replace(/\s+/g, ' ').indexOf(E.money(R3.grand).replace(/ /g, ' ')) >= 0 && /СКИДКА 5 %/.test(text) && /цены действительны 14 дней/.test(text), name + ': итог, скидка, срок действия цен');
	if (o.noPrice) ok(!/руб\.|р\./.test(text.replace(/руб\.\/|р\.\//g, '')) && !/ИТОГО/.test(text), name + ': денег в документе нет', text.match(/.*(руб\.|ИТОГО).*/));
	if (o.totals) ok(!/Петля накладная/.test(text) && /Фурнитура/.test(text), name + ': только итоги разделов');
	if (kind === 'client' && !o.noPrice && !o.totals) ok(text.indexOf('Срок изготовления 14 рабочих дней') >= 0 && !/Не учтено/.test(text) && !/наценка/i.test(text), name + ': примечание есть, внутренних сведений нет');
	if (kind === 'full') ok(/Материал погонный/.test(text) && /Стол\. Slotex Dominicana/.test(text) && /по 3,05 м/.test(text) && /наценка в ценах: материал 15 %/.test(text) && !/Внимание/.test(text) && !/Не учтено в смете/.test(text) && /прайс «Розница»/.test(text), name + ': справка и наценка; без «Внимание» и «Не учтено»');
	if (kind === 'mat') ok(/Кашемир/.test(text) && /19 — \d+ метр/.test(text) && /Погонные материалы/.test(text) && !/руб\./.test(text), name + ': декоры с кромкой, без цен');
	if (!o.totals) ok(d.doc.art === 1 && /Артикул\s+(Наименование|Материал)/.test(text) && (kind === 'mat'
		? /16 мм_Кашемир/.test(text) && /19_Кашемир/.test(text) && /class="a">1\.0 x 19_Кашемир/.test(d.html)
		: /ZM-/.test(text) && /ECHC09BEO/.test(text) && /class="a">ZM-ECHC09BEO<\/div>(?:<div class="im">[\s\S]*?<\/div>)?<div class="n">Петля накладная/.test(d.html)),
	name + ': столбец «Артикул» допускает перенос, артикул остаётся у своей строки', text.split('\n').filter(x => /Артикул|Петля|Кашемир/.test(x)).slice(0, 6));
	if (kind === 'furn') ok(/GOLA-L\s+Профиль-ручка Gola L/.test(text) && /RS-128\s+Ручка-скоба/.test(text), name + ': артикулы профиля и комплекта');
	if (kind === 'furn') ok(/Петля накладная/.test(text) && /Профиль-ручка Gola L/.test(text) && /по 3 м/.test(text) && !/ЛДСП/.test(text), name + ': фурнитура и профили');
	if (kind === 'furn') { const hg = R3.rows.find(x => /Петля/.test(x.label)); ok(hg.mk === 20 && text.replace(/\s+/g, ' ').indexOf(E.num(hg.price) + ' р./шт') >= 0 && text.replace(/\s+/g, ' ').indexOf(E.money(Math.round(hg.val * hg.price)).replace(/\u00A0/g, ' ') + ' р.') >= 0, name + ': цены закупочные, без наценки', [hg.price, hg.priceOut]); }
	console.log('   ' + name.padEnd(20), 'листов', pages);
}
// длинная смета режется на листы без потерь
const stB = load('est.bmk'), plB = E.newList('б');
for (let i = 0; i < 70; i++) E.addOwnRow(stB.work.est, 'Дополнительная работа номер ' + (i + 1) + (i % 9 ? '' : ' с очень длинным названием, которое не помещается в одну строку документа. В смете должно быть видно полное название, включая контрольное окончание'), 'sum', 100 + i);
const dB = O.estHtml(build(stB, plB), stB, { kind: 'client' });
fs.writeFileSync(outDir + '/длинная.html', dB.html);
cp.execFileSync('/opt/pw-browsers/chromium', ['--headless', '--no-sandbox', '--disable-gpu', '--no-pdf-header-footer', '--print-to-pdf=' + outDir + '/длинная.pdf', 'file://' + outDir + '/длинная.html'], { stdio: 'ignore' });
const pB = Number(/Pages:\s+(\d+)/.exec(cp.execSync('pdfinfo "' + outDir + '/длинная.pdf"').toString())[1]), tB = cp.execSync('pdftotext -layout "' + outDir + '/длинная.pdf" -').toString(), flatB = tB.replace(/\s+/g, ' ');
ok(pB === dB.pages && pB >= 2 && (tB.match(/Дополнительная работа номер/g) || []).length === 70 &&
	(flatB.match(/контрольное окончание/g) || []).length === 8 && Array.from({ length: 70 }, (_, k) => k + 100).every(sum => flatB.indexOf(sum + ' р.') >= 0),
	'длинная смета: листов ' + pB + ', все 70 строк, суммы и окончания длинных названий на месте', [pB, dB.pages]);
// Excel
const x = O.estXlsx(R3, st, { kind: 'full', theme: 'light' });
fs.writeFileSync(outDir + '/полная.xlsx', Buffer.from(x));
const sheet = cp.execSync('unzip -p "' + outDir + '/полная.xlsx" xl/worksheets/sheet1.xml').toString(), sst = cp.execSync('unzip -p "' + outDir + '/полная.xlsx" xl/sharedStrings.xml').toString();
ok(/Петля накладная/.test(sst) && !/Не учтено в смете/.test(sst) && sheet.indexOf('<v>' + R3.grand + '</v>') >= 0, 'Excel: строки и итог числом');
ok(/>Артикул</.test(sst) && /ZM-ECHC09BEO/.test(sst), 'Excel: столбец «Артикул»');
const xStyles = cp.execSync('unzip -p "' + outDir + '/полная.xlsx" xl/styles.xml').toString();
ok(!/horizontal="(?:right|center)"/.test(xStyles) && /horizontal="left" vertical="top" indent="1"/.test(xStyles) && /<f>/.test(sheet), 'Excel: левая ось колонок с отступом, суммы остаются формулами');
fs.writeFileSync(outDir + '/заказ материала.xlsx', Buffer.from(O.estXlsx(R3, st, { kind: 'mat' })));
// ---- заказные фасады (полуфабрикаты из профиля и стекла) ----
{
	const raw0 = JSON.parse(fs.readFileSync(__dirname + '/out/est.bmk', 'utf8')).model;
	const st0 = load('est.bmk', s => { s.est = Object.assign({}, s.est, { facArts: [] }); }), R0 = build(st0, E.newList('ф0'));
	ok(!R0.rows.some(w => w.kind === 'facade') && row(R0, 'profile', /Профиль макро/) && row(R0, 'panel', /Стекло/), 'пустой список артикулов @ — фасады считаются по деталям');
	const glassParts0 = st0.model.parts.filter(p => /Стекло/.test(p.mat)).length, holes0 = st0.model.holes.length;
	const stF = load('est.bmk'), plF = E.newList('ф');
	let RF = build(stF, plF);
	const fr = RF.rows.filter(w => w.kind === 'facade');
	ok(fr.length === 3 && fr.map(w => w.label + ' — ' + w.calc + ' ' + w.unit).join('|') === 'Фасад Макро ПР-1 716×446 — 1 шт|Фасад Макро ПР-2 716×396 — 2 шт|Фасад Макро ПР-2 140×596 — 1 шт',
		'фасады: одно имя и один размер — строка, высота × ширина, штуками', fr.map(w => w.label + ' — ' + w.calc + ' ' + w.unit));
	ok(fr[0].art === '' && fr.every(w => w.head === 'ЗАКАЗНЫЕ ФАСАДЫ' && w.group === 'ФУРНИТУРА' && w.punit === 'руб./шт'), 'артикул фасада, раздел и группа');
	ok(!row(RF, 'profile', /Профиль макро/) && !row(RF, 'panel', /Стекло/) && !stF.model.parts.some(p => /Стекло/.test(p.mat)) && glassParts0 === 4, 'профили и стекло фасада не считаются и в раскрой не идут');
	ok(stF.model.holes.length === holes0 - 8 && !stF.model.holes.some(h => h.fast === 'Отверстие под петлю'), 'отверстия фасада не идут в присадку', [holes0, stF.model.holes.length]);
	ok(row(RF, 'panel', /Nordeco/).calc === row(R0, 'panel', /Nordeco/).calc, 'остальная смета не меняется');
	// цена за штуку — своя у каждого размера
	E.setPrice(fr[1], 5200, plF, stF.work.est); E.setPrice(fr[2], 2100, plF, stF.work.est); RF = build(stF, plF);
	let f2a = RF.rows.find(w => w.kind === 'facade' && /716×396/.test(w.label));
	ok(f2a.sum === 10400 && plF.P['FC:Фасад Макро ПР-2 716×396'] === 5200 && RF.sections.some(x => x.title === 'ЗАКАЗНЫЕ ФАСАДЫ' && x.total === 10400 + 2100), 'цена за штуку у каждого размера, итог раздела', f2a && [f2a.sum, f2a.priceId]);
	// переключатель: за кв.м — одна цена на вид, количество — площадь, штуки — рядом
	ok(E.unitChoice(RF, f2a).options.map(o => o[1]).join('|') === 'шт|кв.м|справочно|не считать', 'у фасада выбор: шт или кв.м');
	E.setUnit(RF, f2a, 1, plF, stF.work.est); RF = build(stF, plF);
	const sq = RF.rows.filter(w => w.kind === 'facade' && w.fname === 'Фасад Макро ПР-2');
	ok(sq.length === 2 && sq.every(w => w.sqm && w.unit === 'кв.м' && w.priceId === 'FQ:Фасад Макро ПР-2') && sq[0].calc === 0.57 && sq[0].pieces === '2 шт' && sq[1].calc === 0.08 && RF.rows.find(w => /ПР-1/.test(w.label)).unit === 'шт',
		'за кв.м: все размеры вида разом, площадь и штуки', sq.map(w => [w.label, w.calc, w.pieces]));
	E.setPrice(sq[0], 9000, plF, stF.work.est); RF = build(stF, plF);
	ok(RF.rows.filter(w => w.kind === 'facade' && w.sqm).every(w => w.price === 9000) && RF.rows.find(w => /716×396/.test(w.label)).sum === Math.round(0.57 * 9000), 'цена за кв.м — одна на вид фасада');
	// документ «Заказ фасадов»
	const dF = O.estHtml(RF, stF, { kind: 'fac' }), tF = dF.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
	ok(/Заказ фасадов/.test(tF) && /Фасад Макро ПР-2, 716×396 мм/.test(tF) && /2 шт · 0,57 кв\.м/.test(tF) && /Фасад Макро ПР-1, 716×446 мм/.test(tF) && /Всего фасадов: 7 шт/.test(tF) && /ФАСАДЫ МДФ/.test(tF) && /Эмаль RAL 5014 матовая, две стороны, 2498×496 мм/.test(tF) && !/Петля|ЛДСП/.test(tF), 'документ «Заказ фасадов»: имя, размер, штуки', tF.substring(0, 300));
	fs.writeFileSync(outDir + '/заказ фасадов.html', dF.html);
	fs.writeFileSync(outDir + '/заказ фасадов.xlsx', Buffer.from(O.estXlsx(RF, stF, { kind: 'fac' })));
	const tC = O.estHtml(RF, stF, { kind: 'client' }).html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
	ok(/Заказные фасады/.test(tC) && /Фасад Макро ПР-2 716×396/.test(tC), 'фасады — разделом в смете для заказчика');
	// только выделенное: выделен один фасад ПР-2
	stF.work.scope = 'sel'; RF = build(stF, plF);
	ok(RF.rows.filter(w => w.kind === 'facade').map(w => w.label + ':' + w.fn).join('|') === 'Фасад Макро ПР-2 716×396:1', 'только выделенное: выделенный фасад', RF.rows.filter(w => w.kind === 'facade').map(w => w.label));
	stF.work.scope = 'all';
	// маска на блок, внутри которого фасады: фасад — внешний блок
	const stW = load('est.bmk', s => { s.est = Object.assign({}, s.est, { facArts: ['@Шкаф', '@Фасад Макро'] }); }), RW = build(stW, E.newList('w'));
	ok(RW.rows.filter(w => w.kind === 'facade').map(w => w.label).join('|') === 'Шкаф с витриной', 'фасад в фасаде не считается дважды: берётся внешний блок', RW.rows.filter(w => w.kind === 'facade').map(w => w.label));
	// прежняя выгрузка без блоков: предупреждение
	const old = JSON.parse(fs.readFileSync(__dirname + '/out/est.bmk', 'utf8')); delete old.model.blocks;
	const setO = BM.defaults();
	const stO = P.build(old, setO), RO = build(stO, E.newList('o'));
	ok(RO.warns.some(x => /без сведений о блоках/.test(x)) && !RO.rows.some(w => w.kind === 'facade'), 'старый проект: сказано выгрузить заново');
	// размер: высота — по вертикальной оси, даже если блок повёрнут
	ok(JSON.stringify(P.facadeSize({ gs: [716, 396, 20], fr: { o: [0, 0, 0], x: [0, 1, 0], y: [1, 0, 0], z: [0, 0, 1] } }, {})) === '{"h":716,"w":396,"d":20}' && JSON.stringify(P.facadeSize({ gs: [20, 596, 140] }, {})) === '{"h":596,"w":140,"d":20}' && raw0.blocks.length > 5,
		'размер фасада: высота по вертикали; без осей — большая сторона');
}
// ---- фасады МДФ (плёнка, эмаль), поставщик и фото, деталировка фасадов ----
{
	const raw = JSON.parse(fs.readFileSync(__dirname + '/out/est.bmk', 'utf8')).model;
	const mf = P.mdfFacades(raw), ids = Object.keys(mf).map(Number), named = id => raw.parts.find(p => p.id === id).name;
	ok(ids.length === 3 && ids.map(named).sort().join('|') === 'Фасад (Образец 1)|Фасад (Образец 2)|Фасад (Образец 3)' && !Object.keys(mf).some(id => /пластиком/.test(named(Number(id)))),
		'фасад МДФ — панель с облицовкой 0 мм (облицовка 0,8 мм — не фасад)', ids.map(named));
	const byName = n => mf[raw.parts.find(p => p.name === n).id];
	ok(byName('Фасад (Образец 1)').kind === 'film' && byName('Фасад (Образец 1)').sides === 1 && byName('Фасад (Образец 2)').kind === 'enamel' && byName('Фасад (Образец 3)').sides === 2 && byName('Фасад (Образец 3)').coat === 'Эмаль RAL 5014 матовая',
		'плёнка или эмаль — по названию покрытия; стороны — по числу облицовок');
	ok(raw.parts.find(p => p.name === 'Фасад (Образец 1)').ff === 1 && raw.parts.filter(p => p.plastic && /Образец 3/.test(p.name)).every(p => p.of === raw.parts.find(q => q.name === 'Фасад (Образец 3)').id), 'выгрузка: лицевая сторона и чья облицовка');
	const stM = load('est.bmk', s => { s.est = Object.assign({}, s.est, { facArts: [] }); }), plM = E.newList('м'), store = E.fixStore({ lists: [plM] });
	ok(store.sup && typeof store.sup === 'object' && E.fixStore({ lists: [], sup: { a: 5, b: { shop: 'x' } } }).sup.a === undefined, 'база цен: поставщики хранятся рядом с прайсами');
	let RM = E.build(stM, E.conf(stM.set), plM, stM.work.est, store.sup);
	const mrows = RM.rows.filter(w => w.kind === 'mdffac');
	ok(mrows.map(w => w.label).join('|') === 'Плёнка Кальцит Р-842 UPL, лицевая, 2498×496 мм|Эмаль NCS S 1002-Y50R Глянец, лицевая, 2498×496 мм|Эмаль RAL 5014 матовая, две стороны, 2498×496 мм' &&
		mrows.every(w => w.sqm && w.unit === 'кв.м' && w.calc === 1.24 && w.head === 'ФАСАДЫ МДФ' && w.group === 'ФУРНИТУРА'), 'раздел «Фасады МДФ»: покрытие, стороны, размер; по умолчанию за кв.м', mrows.map(w => [w.label, w.calc, w.unit]));
	ok(RM.rows.some(w => w.kind === 'panel' && /МДФ 16 мм \(2ст\.\)/.test(w.label)) && RM.rows.some(w => w.kind === 'plast' && /Кальцит/.test(w.label)), 'МДФ и облицовка остаются в своих разделах');
	ok(!RM.rows.some(w => w.art === 'нет'), 'артикул «нет» из БАЗИСа не печатается');
	E.setUnit(RM, mrows[2], 0, plM, stM.work.est); RM = E.build(stM, E.conf(stM.set), plM, stM.work.est, store.sup);
	const m3 = RM.rows.find(w => w.kind === 'mdffac' && /RAL 5014/.test(w.label));
	ok(m3.unit === 'шт' && m3.calc === 1 && m3.priceId === 'MC:Эмаль RAL 5014 матовая|2 2498×496', 'фасад МДФ штуками: цена своя у размера', [m3.unit, m3.priceId]);
	E.setPrice(m3, 15000, plM, stM.work.est); RM = E.build(stM, E.conf(stM.set), plM, stM.work.est, store.sup);
	ok(RM.sections.some(s => s.title === 'ФАСАДЫ МДФ' && s.total === 15000), 'раздел «Фасады МДФ» в смете');
	// поставщик: примечание из БАЗИСа, затем своё; фото и ссылка
	const hinge = () => RM.rows.find(w => w.kind === 'fastener' && /BLUMOTION 110/.test(w.label));
	ok(hinge().sup.shop === 'Магазин фурнитуры' && hinge().sup.fromNote && !RM.rows.find(w => /Петля накладная/.test(w.label)).sup.shop, 'поставщик из примечания в БАЗИСе', hinge().sup);
	const IMG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
	E.setSup(store, 'Петля Blum CLIP top BLUMOTION 110° Накладная', { shop: 'Леруа', url: 'shop.example/item', img: IMG });
	E.setSup(store, 'Эмаль RAL 5014 матовая', { shop: 'Фасадная мастерская', img: IMG });
	E.setSup(store, 'Пусто', { shop: ' ', url: '' });
	RM = E.build(stM, E.conf(stM.set), plM, stM.work.est, store.sup);
	ok(hinge().sup.shop === 'Леруа' && hinge().sup.url === 'https://shop.example/item' && hinge().sup.img === IMG && !hinge().sup.fromNote && !store.sup['Пусто'], 'своё сильнее примечания; ссылка с https; пустое не хранится', hinge().sup);
	const dC = O.estDoc(RM, stM, { kind: 'client' }), hC = O.estHtml(RM, stM, { kind: 'client' }).html;
	ok(dC.sup === 1 && dC.img === 1 && /<div class="sp"><b>Леруа<\/b><br><a href="https:\/\/shop\.example\/item">shop\.example\/item<\/a><\/div>/.test(hC) && /<img src="data:image\/png/.test(hC) && /Поставщик/.test(hC), 'смета: столбец «Поставщик» со ссылкой и фото');
	const dN = O.estDoc(build(load('sample.bmk'), E.newList('н')), load('sample.bmk'), { kind: 'client' });
	ok(!dN.sup && !dN.img, 'нет поставщиков — нет и столбца');
	ok(/Фасадная мастерская/.test(O.estHtml(RM, stM, { kind: 'fac' }).html) && /Леруа/.test(O.estHtml(RM, stM, { kind: 'furn' }).html), 'поставщик — в заказах фасадов и фурнитуры');
	const xC = new TextDecoder().decode(O.estXlsx(RM, stM, { kind: 'client' }));
	ok(/Поставщик/.test(xC) || xC.length > 0, 'Excel сметы собирается с поставщиком');
	// деталировка
	const sh = BM.fac.sheets(stM, E.conf(stM.set), store.sup, RM.res.Notes);
	ok(sh.map(o => o.kind + ':' + o.name + ':' + o.h + '×' + o.w + ':' + o.n).join('|') === 'film:Фасад (Образец 1):2498×496:1|enamel:Фасад (Образец 2):2498×496:1|enamel:Фасад (Образец 3):2498×496:1', 'деталировка: фасады МДФ без заказных', sh.map(o => o.kind + ':' + o.name));
	const s3 = sh[2], cups = s3.holes.filter(h => h.d === 35);
	ok(cups.length === 4 && cups.every(h => h.back && h.x === 474.5) && cups.map(h => h.y).join(',') === '100,865,1633,2398' && s3.hinge.n === 4 && /Blum/.test(s3.hinge.name) && s3.face === 'cups',
		'вид с лица: чашки с тыла (пунктир), высота сверху, петли справа', cups);
	ok(s3.sup['Эмаль RAL 5014 матовая'].img === IMG && s3.base === 'МДФ 16 мм (2ст.)' && s3.sides === 2 && s3.prod === 'ТВ-зона', 'паспорт: основа, покрытие с фото, изделие');
	const stD = load('est.bmk'), RD = E.build(stD, E.conf(stD.set), plM, stD.work.est, store.sup);
	const shD = BM.fac.sheets(stD, E.conf(stD.set), store.sup, RD.res.Notes), fr2 = shD.find(o => o.kind === 'frame' && o.name === 'Фасад Макро ПР-2' && o.h === 716);
	ok(shD.filter(o => o.kind === 'frame').length === 3 && fr2.n === 2 && fr2.w === 396 && fr2.prof === 'Профиль макро' && fr2.glass === 'Стекло прозрачное 5мм' && fr2.holes.length === 1 && fr2.holes[0].y === 616 && fr2.holes[0].x === 10,
		'рамочный: штуки, цвет профиля и стекла, отверстия от верха', fr2);
	const fr1 = shD.find(o => o.kind === 'frame' && /ПР-1/.test(o.name));
	ok(fr1.hinges.length === 2 && fr1.hinges.map(q => q.y).sort((a, b) => a - b).join(',') === '100,616' && fr1.hinges.every(q => q.x === 14.5 && q.by === 'holes') && fr1.hinge.n === 2 && /для алюмин/.test(fr1.hinge.name) && fr1.hinge.side === 'left' && fr1.hinge.edge === 14.5 && (fr1.face === 'hinges' || fr1.face === 'prod') &&
		!fr1.holes.some(h => /планка/.test(h.fast)) && fr1.holes.some(h => h.d === 8), 'рамочный: петли по отверстиям ответной планки, сторона, планка — не на фасаде', fr1);
	// правая дверь — зеркальная копия левой (как в БАЗИСе: блок отражён) — петли справа, отдельный лист
	{
		const stX = load('est.bmk'), m = stX.doc.model, B = m.blocks, i0 = B.findIndex(b => /ПР-1/.test(b.name)), sub = new Set([i0]);
		for (let ch = true; ch;) { ch = false; B.forEach((b, j) => { if (!sub.has(j) && sub.has(b.up)) { sub.add(j); ch = true; } }); }
		const X0 = 123000 + 446 + 2, mp = p => [2 * X0 - p[0], p[1], p[2]], mv = v => [-v[0], v[1], v[2]], fr = f => f && { o: mp(f.o), x: mv(f.x), y: mv(f.y), z: mv(f.z) }, map = {};
		[...sub].forEach(j => { map[j] = B.length; B.push(Object.assign({}, B[j], { fr: fr(B[j].fr) })); });
		[...sub].forEach(j => { const c = B[map[j]]; if (sub.has(c.up)) c.up = map[c.up]; });
		m.parts.filter(p => sub.has(p.bk)).forEach(p => m.parts.push(Object.assign({}, p, { id: p.id + 100000, bk: map[p.bk], frame: fr(p.frame) })));
		m.holes.filter(h => sub.has(h.bk)).forEach(h => m.holes.push(Object.assign({}, h, { bk: map[h.bk], p: h.p && mp(h.p), d: h.d && mv(h.d) })));
		['prof', 'fast', 'kits'].forEach(k => (m[k] || []).filter(x => sub.has(x.bk)).forEach(x => m[k].push(Object.assign({}, x, { bk: map[x.bk] }))));
		const RX = E.build(stX, E.conf(stX.set), plM, stX.work.est, store.sup), shX = BM.fac.sheets(stX, E.conf(stX.set), store.sup, RX.res.Notes).filter(o => /ПР-1/.test(o.name));
		const L = shX.find(o => o.hinge.side === 'left'), Rr = shX.find(o => o.hinge.side === 'right');
		ok(shX.length === 2 && L && Rr && Rr.hinge.edge === 14.5 && Rr.hinges.every(q => q.x === Rr.w - 14.5), 'зеркальная дверь: петли справа, своим листом', shX.map(o => [o.hinge.side, o.hinge.edge, o.hinges.map(q => q.x)]));
		// петля по планке за краем фасада — у своего края, отступ не пишется
		const stY = load('est.bmk'), mY = stY.doc.model, sY = new Set([mY.blocks.findIndex(b => /ПР-1/.test(b.name))]);
		for (let ch = true; ch;) { ch = false; mY.blocks.forEach((b, j) => { if (!sY.has(j) && sY.has(b.up)) { sY.add(j); ch = true; } }); }
		mY.holes.forEach(h => { if (sY.has(h.bk) && /планка/.test(h.fast)) h.p = [h.p[0] - 29.2, h.p[1], h.p[2]]; });
		const RY = E.build(stY, E.conf(stY.set), plM, stY.work.est, store.sup), fY = BM.fac.sheets(stY, E.conf(stY.set), store.sup, RY.res.Notes).find(o => /ПР-1/.test(o.name));
		ok(fY.hinge.side === 'left' && fY.hinge.edge === null && fY.hinges.every(q => q.x > 0 && q.x < fY.w && q.out), 'петля за краем фасада: рисуется у края, отступ не пишется', [fY.hinge, fY.hinges]);
		const tY = O.estHtml(RY, stY, { kind: 'det' }).html.replace(/<[^>]+>/g, ' ');
		ok(!/-\d+(,\d+)? мм от края/.test(tY) && /петли слева/.test(tY), 'на листе нет отрицательного отступа');
		// сторона вручную: лист отражается, выбор хранится в проекте
		stY.work.est.fside = { [fY.key]: 'right' };
		const fM = BM.fac.sheets(stY, E.conf(stY.set), store.sup, RY.res.Notes).find(o => /ПР-1/.test(o.name));
		ok(fM.hinge.side === 'right' && fM.sideSet === 'right' && fM.sideAuto === 'left' && fM.hinges.every((q, k) => Math.abs(q.x - (fM.w - fY.hinges[k].x)) < 0.11) && fM.holes.every((q, k) => Math.abs(q.x - (fM.w - fY.holes[k].x)) < 0.11), 'сторона петель вручную: чертёж отражён');
		ok(/петли справа \(выбрано вручную\)/.test(O.estHtml(RY, stY, { kind: 'det' }).html.replace(/<[^>]+>/g, ' ')), 'на листе — «выбрано вручную»');
	}
	const t1 = O.estHtml(RD, stD, { kind: 'det' }).html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
	ok(/от верха 100 мм; от низа 100 мм, петли слева, 14,5 мм от края \(по отверстиям ответной планки\)/.test(t1) && /петли слева/.test(t1) && !/толщина/.test(t1), 'лист рамочного: от верха и от низа, сторона навески', t1.match(/ПЕТЛИ — ДО ЦЕНТРА.{0,140}|Петли — до центра.{0,140}/));
	const cf = O.estHtml(RD, stD, { kind: 'full', det: 1 }), cn = O.estHtml(RD, stD, { kind: 'full' });
	ok(cf.detPages === 6 && cf.pages === cn.pages + 6 && /@page det\{size:A4 landscape/.test(cf.html) && /\.dPg\{page:det/.test(cf.html) && cn.detPages === 0, 'чертежи фасадов — в конце полной сметы, альбомными листами', [cf.pages, cn.pages]);
	fs.writeFileSync(outDir + '/полная с чертежами.html', cf.html);
	const pdfC = outDir + '/полная с чертежами.pdf';
	cp.execFileSync('/opt/pw-browsers/chromium', ['--headless', '--no-sandbox', '--disable-gpu', '--no-pdf-header-footer', '--print-to-pdf=' + pdfC, 'file://' + outDir + '/полная с чертежами.html'], { stdio: 'ignore' });
	const infoC = cp.execSync('pdfinfo -f 1 -l 40 "' + pdfC + '"').toString(), sizes = [...infoC.matchAll(/Page\s+\d+ size:\s+([\d.]+) x/g)].map(m => Number(m[1]) > 700 ? 'L' : 'P').join('');
	ok(sizes === 'P'.repeat(cn.pages) + 'L'.repeat(6), 'PDF: листы сметы книжные, чертежи — альбомные', sizes);
	fs.writeFileSync(outDir + '/заказ фасадов с чертежами.xlsx', Buffer.from(O.estXlsx(RD, stD, { kind: 'fac', det: 1 })));
	ok(/Деталировка фасадов/.test(cp.execSync('unzip -p "' + outDir + '/заказ фасадов с чертежами.xlsx" xl/workbook.xml').toString()), 'Excel заказа фасадов: лист «Деталировка фасадов»');
	const dd = O.estHtml(RD, stD, { kind: 'det' }), td = dd.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
	ok(dd.pages === 6 && /@page\{size:A4 landscape/.test(dd.html) && /РАМОЧНЫЙ/.test(td) && /ПЛЁНКА/.test(td) && /ЭМАЛЬ/.test(td) && /Цвет профиля Профиль макро/.test(td) && /Стороны покрытия две стороны/.test(td) && /100 · 865 · 1633 · 2398 мм, Ø35, 21,5 мм от края/.test(td) && /лист 6 из 6/.test(td),
		'документ «Деталировка фасадов»: лист на вид, альбомный', [dd.pages, td.substring(0, 200)]);
	fs.writeFileSync(outDir + '/деталировка фасадов.html', dd.html);
	const pdfD = outDir + '/деталировка фасадов.pdf';
	cp.execFileSync('/opt/pw-browsers/chromium', ['--headless', '--no-sandbox', '--disable-gpu', '--no-pdf-header-footer', '--print-to-pdf=' + pdfD, 'file://' + outDir + '/деталировка фасадов.html'], { stdio: 'ignore' });
	const infoD = cp.execSync('pdfinfo "' + pdfD + '"').toString();
	ok(Number(/Pages:\s+(\d+)/.exec(infoD)[1]) === 6 && /Page size:\s+841\.\d+ x 59[45]/.test(infoD), 'PDF деталировки: 6 альбомных листов А4', infoD.match(/Pages.*|Page size.*/g));
	const xD = O.estXlsx(RD, stD, { kind: 'det' });
	fs.writeFileSync(outDir + '/деталировка фасадов.xlsx', Buffer.from(xD));
	ok(xD.length > 1000, 'деталировка в Excel');
	const empty = O.estHtml(build(load('sample.bmk'), E.newList('п')), load('sample.bmk'), { kind: 'det' });
	ok(empty.pages === 1 && /Фасадов для деталировки нет/.test(empty.html), 'нет фасадов — лист с объяснением');
}
// ---- заказные фасады по артикулу @: МДФ внутри блока, петли в смете ----
{
	const kitN = (R, re) => { const w = R.rows.find(x => x.kind === 'fastener' && re.test(x.label)); return w ? w.calc : 0; };
	const sW = load('fac.bmk'), RW4 = build(sW, E.newList('4'));
	const f4 = RW4.rows.find(w => w.kind === 'facade' && /Образец 4/.test(w.label));
	ok(f4 && f4.label === 'Образец 4 2498×496' && f4.art === '' && f4.calc === 1, 'блок с артикулом «@Заказной фасад» — заказной фасад, «@…» не идёт в артикул', f4 && [f4.label, f4.art]);
	ok(!sW.model.parts.some(p => p.mat === 'МДФ 16 мм (2ст.)' && /Фасад$/.test(p.name) && p.bk >= 0 && sW.doc.model.blocks[p.bk] && /Образец 4|Петли/.test(sW.doc.model.blocks[p.bk].name)) && !RW4.rows.some(w => w.kind === 'mdffac' && /9003/.test(w.title)), 'весь фасад заказной: МДФ не идёт в раскрой, покрытие не считается');
	const sN = load('fac.bmk', s => { s.est = Object.assign({}, s.est, { facHinges: 0 }); }), RN = build(sN, E.newList('н'));
	const k4 = kitN(RW4, /^Петля Blum CLIP top BLUMOTION 110° Накладная\.$/), k0 = kitN(RN, /^Петля Blum CLIP top BLUMOTION 110° Накладная\.$/);
	ok(k4 - k0 === 5 && kitN(RW4, /ответная планка сам/) === 2 && !kitN(RN, /ответная планка сам/), 'петли заказных фасадов — в смете: 5 у «Образца 4», планки 2 петель алюминиевого', [k4, k0, kitN(RW4, /ответная планка сам/)]);
	ok(E.order(RW4).furn.some(x => /^Петля Blum CLIP top BLUMOTION 110° Накладная\.$/.test(x.name) && /^5 /.test(x.qty)), 'петли фасада — в заказе фурнитуры', E.order(RW4).furn.map(x => x.name + ' ' + x.qty));
	const sC = load('fac.bmk', s => { s.est = Object.assign({}, s.est, { facMdf: 'cut' }); }), RC = build(sC, E.newList('c'));
	const mdfIn = sC.model.parts.filter(p => p.id === sW.doc.model.parts.find(q => q.bk >= 0 && sW.doc.model.blocks[q.bk].name === 'Образец 4' && !q.plastic && /МДФ/.test(q.mat)).id);
	ok(mdfIn.length === 1 && RC.rows.some(w => w.kind === 'mdffac' && /9003/.test(w.title)) && RC.rows.some(w => w.kind === 'facade' && /Образец 4/.test(w.label)), 'МДФ остаётся в раскрое: панель и покрытие считаются, фасад — строкой', mdfIn.length);
	ok(sC.model.holes.length > sW.model.holes.length, 'МДФ в раскрое — отверстия под чашки идут в присадку', [sC.model.holes.length, sW.model.holes.length]);
	const shC = BM.fac.sheets(sC, E.conf(sC.set), {}, RC.res.Notes);
	ok(!shC.some(o => o.kind === 'frame' && /Образец 4/.test(o.name)) && shC.some(o => o.kind === 'enamel' && o.coat === 'Эмаль RAL 9003 матовая'), 'деталировка: МДФ в раскрое — лист фасада МДФ, а не рамочного', shC.map(o => o.kind + ':' + o.name));
	ok(P.facArtHit('@Фасад Макро ПР-1', ['@фасад макро']) && !P.facArtHit('Фасад Макро', ['@фасад макро']) && !P.facArtHit('@Другое', ['@фасад макро']), 'артикул: начинается с @ и со строки из списка');
}
// ---- «База»: поставщик и вид материала в смете, заказ поставщику ----
{
	const Bs = BM.base; Bs.cur = Bs.fresh();
	const d = Bs.learn(Bs.cur, 'ЛДСП Дуб Сонома', '', ''); d.cls.GP3 = 'P1'; d.cls.GV2 = 'V1';
	Bs.setMat(Bs.cur, 'Петля накладная', { shop: 'Мебельный двор', url: 'dvor.example.ru' });
	Bs.thumb = name => name === 'ЛДСП Белый' ? 'data:image/jpeg;base64,AAAA' : '';
	const RB = build(load('est.bmk'), E.newList('б')), dub = row(RB, 'panel', /Дуб Сонома/), hn = row(RB, 'fastener', /^Петля накладная$/), bel = row(RB, 'panel', /ЛДСП Белый/);
	ok(dub.sup.shop === 'МДМ' && dub.sup.how === 'class' && hn.sup.shop === 'Мебельный двор' && hn.sup.url === 'https://dvor.example.ru' && bel.sup.img === 'data:image/jpeg;base64,AAAA' && bel.sup.tex === 1,
		'поставщик из «Базы»: по классу, свой (новый — в «Базе»), фото — текстура', [dub.sup, hn.sup.shop, bel.sup.tex]);
	ok(Bs.cur.sup.some(s => s.name === 'Мебельный двор'), 'поставщик, вписанный у строки, записан в «Базу»');
	const pan = RB.rows.filter(w => w.kind === 'panel' && !w.off), ordd = E.ordered(RB).on.map(i => RB.rows[i]).filter(w => w.kind === 'panel');
	ok(dub.mkind === 'Плитные ЛДСП' && ordd[0] === dub && pan.length > 3, 'вид материала из «Базы»: строки с видом — первыми в разделе', ordd.slice(0, 2).map(w => w.label));
	const cl = O.estHtml(RB, load('est.bmk'), { kind: 'client' }).html.replace(/<[^>]+>/g, ' ');
	ok(/Плитные ЛДСП/.test(cl), 'вид материала — подзаголовком в смете');
	const sl = O.supList(RB);
	ok(sl.map(g => g.shop).join('|') === 'Магазин фурнитуры|МДМ|Мебельный двор|' && sl[3].n > 10, 'заказ поставщику: поставщики по алфавиту, без поставщика — в конце', sl.map(g => g.shop + ':' + g.n));
	const sd = O.estHtml(RB, load('est.bmk'), { kind: 'sup', shop: 'МДМ' }), st2 = sd.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
	ok(/Заказ поставщику: МДМ/.test(st2) && /ЛДСП Дуб Сонома/.test(st2) && !/Петля накладная/.test(st2) && /без наценки/.test(st2) && sd.pages === 1, 'документ «Заказ поставщику»: только его позиции, цены закупочные', st2.slice(0, 200));
	const sa = O.estHtml(RB, load('est.bmk'), { kind: 'sup', shop: '*' });
	ok(sa.pages >= 4 && (sa.html.match(/class="eSh"/g) || []).length === 4, 'все поставщики — каждый с нового листа', sa.pages);
	const np = O.estHtml(RB, load('est.bmk'), { kind: 'sup', shop: 'МДМ', noPrice: 1 }).html;
	ok(!/руб\./.test(np.replace(/<style[\s\S]*?<\/style>/, '')), 'без цен — галочкой');
	fs.writeFileSync(outDir + '/заказ поставщику.html', sa.html);
	fs.writeFileSync(outDir + '/заказ поставщику.xlsx', Buffer.from(O.estXlsx(RB, load('est.bmk'), { kind: 'sup', shop: '*' })));
	ok(Bs.migrateSup(Bs.cur, { 'ХДФ Белый': { shop: 'Старый магазин', url: 'https://old.example.ru', img: 'data:image/png;base64,BB' } }) === 1 && Bs.infoOf(Bs.cur, 'ХДФ Белый').shop === 'Старый магазин' && Bs.cur.mats['ХДФ Белый'].img, 'поставщики из прежней базы цен переезжают в «Базу»');
	Bs.cur = null; Bs.thumb = null;
}
// ---- одинаковые позиции: метка, объединение, разъединение, «оставить обе» ----
{
	const stJ = load('est.bmk'), plJ = E.newList('j'), weJ = stJ.work.est;
	let RJ = build(stJ, plJ);
	const a = row(RJ, 'fastener', /^Петля Blum CLIP top BLUMOTION 110° Накладная$/), b0 = row(RJ, 'fastener', /^Петля накладная$/);
	ok(a && b0 && !Object.keys(E.dups(RJ, plJ)).length, 'без правок одинаковых позиций нет');
	E.setName(b0, 'петля  Blum CLIP top BLUMOTION 110° накладная.', plJ, weJ); E.setArt(a, b0.art, plJ, weJ);
	RJ = build(stJ, plJ);
	const dj = E.dups(RJ, plJ), bj = row(RJ, 'fastener', /^Петля накладная$/);
	ok(dj[bj.offKey] && dj[bj.offKey].offKey === a.offKey, 'после правки наименования и артикула — «такая же» (регистр, пробелы, точка не важны)', Object.keys(dj));
	const n0 = RJ.rows.length, va = row(RJ, 'fastener', /^Петля Blum CLIP top BLUMOTION 110° Накладная$/).val, vb = bj.val;
	ok(E.merge(bj, dj[bj.offKey], plJ, weJ, 333), 'объединить');
	RJ = build(stJ, plJ);
	const m = row(RJ, 'fastener', /^Петля Blum CLIP top BLUMOTION 110° Накладная$/);
	ok(RJ.rows.length === n0 - 1 && m.val === va + vb && m.price === 333 && m.sum === Math.round((va + vb) * 333) && m.parts.length === 2 && !row(RJ, 'fastener', /^Петля накладная$/) && !Object.keys(E.dups(RJ, plJ)).length,
		'объединено: одна позиция, количество сложено, выбранная цена, «объединено из 2»', [RJ.rows.length, n0, m.val, va, vb, m.sum]);
	const RJ2 = build(load('est.bmk'), plJ);
	ok(RJ2.rows.length === n0 - 1, 'объединение действует во всех сметах с этим прайсом');
	ok(E.order(RJ).furn.filter(x => /^Петля Blum CLIP top BLUMOTION 110° Накладная$/.test(x.name)).length === 1, 'в заказе фурнитуры — одна позиция');
	ok(E.unmerge(m, plJ) === 1 && build(stJ, plJ).rows.length === n0, 'разъединить — позиции снова две');
	RJ = build(stJ, plJ); E.keepBoth(E.dups(RJ, plJ)[row(RJ, 'fastener', /^Петля накладная$/).offKey], row(RJ, 'fastener', /^Петля накладная$/), plJ);
	ok(!Object.keys(E.dups(build(stJ, plJ), plJ)).length, '«оставить обе» — больше не спрашивает');
	const kp = row(RJ, 'panel', /Дуб Сонома/), kl = RJ.rows.find(w => w.kind === 'fastener');
	ok(!E.merge(kp, kl, plJ, weJ), 'разные единицы — не объединяются');
}
// ---- заказ материала: кромка — название как в строке сметы, «толщина/ширина» из артикула, названия, модели ----
{
	let txt = fs.readFileSync(__dirname + '/out/est.bmk', 'utf8');
	txt = txt.split('"mat":"Кромка Дуб Сонома 1.0x19","art":""').join('"mat":"Кромка 0,8x19 мм, «Дуб Сонома», H1145 ST10, Egger","art":"H1145 ST10-0,8x19"');
	txt = txt.split('"mat":"Кромка белая 0.4x28"').join('"mat":"Кромка белая 28 мм"');
	fs.writeFileSync(__dirname + '/out/_edge.bmk', txt);
	const RE = build(load('_edge.bmk'), E.newList('к')), oE = E.order(RE);
	fs.unlinkSync(__dirname + '/out/_edge.bmk');
	const eg = oE.mat.find(m => /Дуб Сонома/.test(m.title) && !m.th), ew = oE.mat.find(m => /белая 28 мм/.test(m.title));
	ok(eg && eg.title === row(RE, 'edge', /0,8x19/).title && eg.edges[0] === '0,8/19 — ' + Math.ceil(row(RE, 'edge', /0,8x19/).val) + ' метров'.replace('метров', ['метр', 'метра', 'метров'][(n => n % 10 == 1 && n % 100 != 11 ? 0 : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 1 : 2)(Math.ceil(row(RE, 'edge', /0,8x19/).val))]), 'кромка: имя как в смете, 0,8/19 из артикула', eg);
	ok(ew && /^0,4\/28 — /.test(ew.edges[0]), 'кромка без размера в имени и артикуле — толщина и ширина из модели, не «28/28»', ew && ew.edges);
	const pn = oE.mat.find(m => /Nordeco/.test(m.title) && m.th);
	ok(pn && pn.title === row(RE, 'panel', /Nordeco/).title, 'плита в заказе — название как в строке сметы', pn && pn.title);
}
console.log('проверок', n, '|', bad ? 'ОШИБОК: ' + bad : 'ошибок нет');
process.exit(bad ? 1 : 0);
