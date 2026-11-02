/* STHGroup — простой ZIP без сжатия (для файлов .xlsx и архивов выгрузки). */
(function (G) {
	'use strict';
	var BM = G.BM = G.BM || {};
	var T = null;
	function crc32(u8) {
		if (!T) { T = []; for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); T[n] = c >>> 0; } }
		var crc = 0xFFFFFFFF;
		for (var i = 0; i < u8.length; i++) crc = T[(crc ^ u8[i]) & 0xFF] ^ (crc >>> 8);
		return (crc ^ 0xFFFFFFFF) >>> 0;
	}
	BM.utf8 = function (s) {
		if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s);
		var e = unescape(encodeURIComponent(s)), u = new Uint8Array(e.length);
		for (var i = 0; i < e.length; i++) u[i] = e.charCodeAt(i);
		return u;
	};
	/* Строка → байты Windows-1251 (для DXF и старых программ). Чего в кодировке нет — «?». */
	BM.cp1251 = function (s) {
		var u = new Uint8Array(s.length), map = { 0x401: 0xA8, 0x451: 0xB8, 0x2116: 0xB9, 0xAB: 0xAB, 0xBB: 0xBB, 0x2014: 0x97, 0x2013: 0x96, 0xB0: 0xB0, 0xB7: 0xB7, 0xD7: 0x78, 0x2026: 0x85, 0xA0: 0xA0 };
		for (var i = 0; i < s.length; i++) {
			var c = s.charCodeAt(i);
			if (c < 0x80) u[i] = c;
			else if (c >= 0x410 && c <= 0x44F) u[i] = c - 0x410 + 0xC0;
			else if (map[c] !== undefined) u[i] = map[c];
			else u[i] = 0x3F;
		}
		return u;
	};
	BM.b64 = function (u8) {
		if (typeof Buffer !== 'undefined' && typeof btoa === 'undefined') return Buffer.from(u8).toString('base64');
		var s = '', CH = 0x8000;
		for (var i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
		return btoa(s);
	};
	/* files: [{ name, data: Uint8Array | string }] → Uint8Array архива. */
	BM.zip = function (files) {
		var parts = [], central = [], off = 0, i;
		function u16(v) { return [v & 255, (v >>> 8) & 255]; }
		function u32(v) { return [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255]; }
		var d = new Date(), time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
		for (i = 0; i < files.length; i++) {
			var name = BM.utf8(files[i].name), data = typeof files[i].data === 'string' ? BM.utf8(files[i].data) : files[i].data, crc = crc32(data);
			var head = [0x50, 0x4B, 3, 4].concat(u16(20), u16(0x0800), u16(0), u16(time), u16(date), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0));
			parts.push(new Uint8Array(head), name, data);
			central.push({ name: name, crc: crc, size: data.length, off: off });
			off += head.length + name.length + data.length;
		}
		var cstart = off;
		for (i = 0; i < central.length; i++) {
			var c = central[i];
			var ch = [0x50, 0x4B, 1, 2].concat(u16(20), u16(20), u16(0x0800), u16(0), u16(time), u16(date), u32(c.crc), u32(c.size), u32(c.size), u16(c.name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(c.off));
			parts.push(new Uint8Array(ch), c.name);
			off += ch.length + c.name.length;
		}
		parts.push(new Uint8Array([0x50, 0x4B, 5, 6].concat(u16(0), u16(0), u16(central.length), u16(central.length), u32(off - cstart), u32(cstart), u16(0))));
		var total = 0;
		for (i = 0; i < parts.length; i++) total += parts[i].length;
		var out = new Uint8Array(total), p = 0;
		for (i = 0; i < parts.length; i++) { out.set(parts[i], p); p += parts[i].length; }
		return out;
	};
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));
