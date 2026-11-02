/* STHGroup — чтение базы материалов БАЗИСа в формате dBase (.dbf): заголовок, описания полей, записи.
   Кодировка текста — DOS (cp866) или Windows (cp1251): по метке языка в заголовке, а если её нет — по тому,
   в какой из двух кодировок в тексте больше частых русских букв. Работает в окне и под Node.js. */
(function (G) {
	'use strict';
	var BM = G.BM = G.BM || {};
	var D = BM.dbf = {};

	/* таблицы верхней половины (0x80…0xFF) */
	function range(a, b) { var s = ''; for (var c = a; c <= b; c++) s += String.fromCharCode(c); return s; }
	var CP866 = range(0x410, 0x43F) + '░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀' + range(0x440, 0x44F) + 'ЁёЄєЇїЎў°∙·√№¤■ ';
	var CP1251 = 'ЂЃ‚ѓ„…†‡€‰Љ‹ЊЌЋЏђ‘’“”•–—�™љ›њќћџ ЎўЈ¤Ґ¦§Ё©Є«¬­®Ї°±Ііґµ¶·ё№є»јЅѕї' + range(0x410, 0x44F);
	D.TABLES = { cp866: CP866, cp1251: CP1251 };

	function dec(u8, a, b, tab) {
		while (b > a && (u8[b - 1] === 32 || u8[b - 1] === 0)) b--;                  // хвостовые пробелы — без перевода
		while (a < b && u8[a] === 32) a++;
		var s = '';
		for (var i = a; i < b; i++) { var c = u8[i]; s += c < 128 ? String.fromCharCode(c) : tab.charAt(c - 128); }
		return s;
	}
	/* частые русские буквы «о е а и н т» в двух кодировках: где их больше — та и кодировка */
	function guess(u8, start, end) {
		var a = 0, b = 0, lim = Math.min(end, start + 400000);
		for (var i = start; i < lim; i++) {
			var c = u8[i];
			if (c === 0xAE || c === 0xA5 || c === 0xA0 || c === 0xA8 || c === 0xAD || c === 0xE2) a++;
			if (c === 0xEE || c === 0xE5 || c === 0xE0 || c === 0xE8 || c === 0xED || c === 0xF2) b++;
		}
		return a >= b ? 'cp866' : 'cp1251';
	}
	var LANG = { 0x01: 'cp866', 0x26: 'cp866', 0x65: 'cp866', 0x66: 'cp866', 0x64: 'cp866', 0x57: 'cp1251', 0xC9: 'cp1251', 0x03: 'cp1251' };

	/* ab — содержимое файла. Возвращает { n, fields: [{ name, type, len, dec }], rows: [{ ПОЛЕ: значение }], enc }.
	   Удалённые записи (метка «*») пропускаются. Числа — числами, логические — true/false, пустое число — 0. */
	D.parse = function (ab, opt) {
		opt = opt || {};
		var u8 = new Uint8Array(ab), dv = new DataView(ab);
		if (u8.length < 33) throw new Error('файл слишком короткий для .dbf');
		var ver = u8[0] & 0x07;
		if (ver !== 3 && ver !== 4 && ver !== 5 && u8[0] !== 0x30 && u8[0] !== 0x31 && u8[0] !== 0xF5 && u8[0] !== 0x83 && u8[0] !== 0x8B) throw new Error('это не файл dBase (.dbf)');
		var n = dv.getUint32(4, true), hl = dv.getUint16(8, true), rl = dv.getUint16(10, true), lang = u8[29];
		if (hl < 33 || rl < 2 || hl > u8.length) throw new Error('испорчен заголовок .dbf');
		var fields = [], p = 32, off = 1;
		while (p + 32 <= hl && u8[p] !== 0x0D) {
			var nm = '';
			for (var k = 0; k < 11 && u8[p + k]; k++) nm += String.fromCharCode(u8[p + k]);
			var f = { name: nm.toUpperCase(), type: String.fromCharCode(u8[p + 11]), len: u8[p + 16], dec: u8[p + 17], off: off };
			if (f.type === 'C' && f.dec) { f.len += f.dec * 256; f.dec = 0; }        // Clipper: длинная строка — старший байт длины
			off += f.len; fields.push(f); p += 32;
		}
		var enc = opt.enc || LANG[lang] || guess(u8, hl, Math.min(u8.length, hl + n * rl));
		var tab = D.TABLES[enc] || CP866, rows = [], lim = Math.min(n, Math.floor((u8.length - hl) / rl));
		for (var r = 0; r < lim; r++) {
			var b0 = hl + r * rl;
			if (u8[b0] === 0x2A) continue;                                           // удалённая запись
			var o = {};
			for (var i = 0; i < fields.length; i++) {
				var fd = fields[i], a = b0 + fd.off, z = a + fd.len, t = fd.type;
				if (t === 'N' || t === 'F') { var s = dec(u8, a, z, tab); var v = s ? parseFloat(s.replace(',', '.')) : 0; o[fd.name] = isNaN(v) ? 0 : v; }
				else if (t === 'L') { var ch = String.fromCharCode(u8[a]).toUpperCase(); o[fd.name] = ch === 'T' || ch === 'Y' || ch === 'Д'; }
				else o[fd.name] = dec(u8, a, z, tab);
			}
			rows.push(o);
		}
		return { n: rows.length, fields: fields, rows: rows, enc: enc };
	};
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));
