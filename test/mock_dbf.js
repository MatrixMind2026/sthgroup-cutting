// Имитация базы материалов БАЗИСа (.dbf, dBase III, текст в cp866) — поля как у настоящей выгрузки БАЗИСа.
// Записи выдуманы (настоящие базы автора в проект не кладутся).
//   node test/mock_dbf.js <куда.dbf> [1|2]   — 1: база с текстурами и папками; 2: другая база (цены, дубли артикулов)
const fs = require('fs'), path = require('path');
global.window = global;
require(path.join(__dirname, '..', 'web', 'core', 'dbf.js'));
const FIELDS = [['ITEMCODE', 'C', 250], ['ITEMNAME', 'C', 250], ['GRP_CODE', 'N', 20, 5], ['GRP_NAME', 'C', 250], ['UNITNAME', 'C', 250], ['PRICE', 'N', 20, 5], ['COEF', 'N', 20, 5],
	['LENGTH', 'N', 20, 5], ['WIDTH', 'N', 20, 5], ['THICKNESS', 'N', 20, 5], ['SIGN', 'C', 250], ['OVERHANG', 'N', 20, 5], ['COLOR', 'N', 20, 5], ['TEXTURE', 'C', 250], ['CLASS', 'C', 250],
	['ISTAPE', 'N', 20, 5], ['SYNC_EXTER', 'C', 250], ['WEIGHT', 'N', 20, 5], ['COMMENT', 'C', 250], ['NOAVAI', 'N', 20, 5], ['STRETCH', 'N', 20, 5], ['RETRY', 'N', 20, 5], ['MIRROR', 'N', 20, 5],
	['TRANSPAR', 'N', 20, 5], ['SHINESS', 'N', 20, 5], ['BRIGHT', 'N', 20, 5], ['DX', 'N', 20, 5], ['DY', 'N', 20, 5], ['STEPX', 'N', 20, 5], ['STEPY', 'N', 20, 5], ['ANGLE', 'N', 20, 5],
	['COEF_CUT', 'N', 20, 5], ['ROUNDMODE', 'N', 20, 5], ['COLOR(RGB)', 'C', 250], ['COLOR(HEX)', 'C', 250]];
function rec(code, name, grp, unit, o) { return Object.assign({ ITEMCODE: code, ITEMNAME: name, GRP_NAME: grp, UNITNAME: unit, COEF: 1, STEPX: 1000, STEPY: 1000, COEF_CUT: 1, COLOR: 8369910 }, o || {}); }
const L = 'Листовые материалы/ЛДСП/Тестплит', E = 'Кромочные материалы/0,8x19 мм/Тестплит', F = 'Крепёж и фурнитура/Петли/Тестпетли';
const BASE1 = [
	rec('D100 ST1', 'ЛДСП 16 мм, Дуб тестовый, D100 ST1, Тестплит', '01. ' + L.replace('/', '/01. '), 'лист', { LENGTH: 2800, WIDTH: 2070, THICKNESS: 16, TEXTURE: 'test\\D100.jpg', MIRROR: 0.3 }),
	rec('W200 ST2', 'ЛДСП 16 мм, Белый тестовый, W200 ST2, Тестплит', '01. ' + L.replace('/', '/01. '), 'лист', { LENGTH: 2750, WIDTH: 1830, THICKNESS: 16, TEXTURE: 'test\\W200.jpg' }),
	rec('D100 ST1-0,8x19', 'Кромка 0,8х19 мм, "Дуб тестовый", D100 ST1, Тестплит', '02. ' + E, 'м.п.', { WIDTH: 19, THICKNESS: 0.8, ISTAPE: 1, COEF: 1.2, TEXTURE: 'test\\D100.jpg' }),
	rec('ST-5', 'Стекло тестовое прозрачное 5 мм', '01. Листовые материалы/07. Стекло', 'кв.м', { LENGTH: 2400, WIDTH: 1600, THICKNESS: 5, TRANSPAR: 0.85, MIRROR: 0.86, SHINESS: 112 }),
	rec('P110', 'Петля тестовая 110° накладная', '04. ' + F, 'шт', { ISTAPE: 1 }),
	rec('KIT-1', 'Направляющие тестовые 450', '04. Крепёж и фурнитура/Направляющие', 'компл.', {}),
	rec('ST-450', 'Столешница тестовая 38 мм', '03. Погонные материалы/Столешницы', 'м.п.', { LENGTH: 4100, WIDTH: 600, THICKNESS: 38 }),
	rec('NCS-1', 'Эмаль тестовая NCS', '08. Лакокрасочные покрытия/Эмали', 'г', { ISTAPE: 1 })
];
const BASE2 = [
	rec('D100 ST1', 'ЛДСП 16 мм, Дуб тестовый, D100 ST1, Тестплит', 'Плиты/ЛДСП', 'лист', { LENGTH: 2800, WIDTH: 2070, THICKNESS: 16, PRICE: 3500 }),       // та же запись — дописывается только пустое
	rec('P110-W', 'Петля тестовая 110° накладная', 'Фурнитура/Петли', 'шт', { PRICE: 120 }),                                                         // то же название, другой артикул
	rec('P110-W', 'Петля тестовая 110° накладная', 'Фурнитура/Петли', 'шт', { PRICE: 120 }),                                                         // точный повтор
	rec('H1', 'Ручка тестовая 128', 'Фурнитура/Ручки', 'шт', { PRICE: 300 })
];
const enc = (() => { const t = BM.dbf.TABLES.cp866, m = {}; for (let i = 0; i < t.length; i++) m[t.charCodeAt(i)] = 128 + i; return s => Buffer.from([...String(s)].map(ch => { const c = ch.charCodeAt(0); return c < 128 ? c : (m[c] || 63); })); })();
function write(file, rows) {
	const hl = 32 + FIELDS.length * 32 + 1, rl = 1 + FIELDS.reduce((a, f) => a + f[2], 0), buf = Buffer.alloc(hl + rows.length * rl + 1, 0x20);
	buf.fill(0, 0, hl); buf[0] = 3; buf[1] = 126; buf[2] = 10; buf[3] = 13; buf.writeUInt32LE(rows.length, 4); buf.writeUInt16LE(hl, 8); buf.writeUInt16LE(rl, 10);
	FIELDS.forEach((f, i) => { const p = 32 + i * 32; Buffer.from(f[0], 'latin1').copy(buf, p); buf[p + 11] = f[1].charCodeAt(0); buf[p + 16] = f[2]; buf[p + 17] = f[3] || 0; });
	buf[hl - 1] = 0x0D;
	rows.forEach((r, k) => {
		let p = hl + k * rl; buf[p++] = 0x20;
		FIELDS.forEach(f => {
			const v = r[f[0]];
			let b;
			if (f[1] === 'N') { const s = (Number(v) || 0).toFixed(f[3] || 0); b = Buffer.from(s.padStart(f[2]), 'latin1'); }
			else b = enc(v === undefined ? '' : v);
			b.copy(buf, p, 0, Math.min(b.length, f[2])); p += f[2];
		});
	});
	buf[buf.length - 1] = 0x1A;
	fs.writeFileSync(file, buf);
}
const [out, which] = process.argv.slice(2);
if (out) { write(out, which === '2' ? BASE2 : BASE1); console.log('база', out, which === '2' ? BASE2.length : BASE1.length, 'записей'); }
module.exports = { write, BASE1, BASE2 };
