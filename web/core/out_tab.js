/* STHGroup — таблицы: Excel (.xlsx), CSV, накладные раскроя. */
(function (G) {
	'use strict';
	var BM = G.BM = G.BM || {};
	var O = BM.out = BM.out || {};
	var P = BM.project;

	function xe(s) { return String(s === null || s === undefined ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, ''); }
	function colName(i) { var s = ''; i++; while (i > 0) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }
	function r2(v) { return Math.round(v * 100) / 100; }
	function r3(v) { return Math.round(v * 1000) / 1000; }

	/* STHGroup: палитры документов соответствуют «Светлой» и «Тёмной» темам окна. */
	function docPalette(theme) {
		return theme === 'dark'
			? { bg: '#191c20', text: '#eceef0', mute: '#bcc0c6', accent: '#f26b1d', line: '#4a4e55', panel: '#323539', tint: '#55331d', link: '#a5cdff', warn: '#ffd093' }
			: { bg: '#f3f5f1', text: '#26332f', mute: '#4d6059', accent: '#197563', line: '#ccd8d1', panel: '#ffffff', tint: '#e1f1eb', link: '#1f5fbf', warn: '#8a4208' };
	}
	O.docThemeCSS = function (theme) {
		var c = docPalette(theme);
		return ':root{' + Object.keys(c).map(function (key) { return '--doc-' + key + ':' + c[key]; }).join(';') + ';' +
			'--doc-rule:color-mix(in srgb,var(--doc-text) 21%,transparent);' +
			'--doc-glass:linear-gradient(155deg,#ffffff18,transparent 70%),color-mix(in srgb,var(--doc-panel) 70%,transparent);' +
			'--doc-surface:radial-gradient(ellipse at 0% 4%,color-mix(in srgb,var(--doc-accent) 16%,transparent),transparent 48%),' +
			'radial-gradient(ellipse at 100% 90%,#819cad27,transparent 65%),var(--doc-bg);' +
			'color:var(--doc-text);print-color-adjust:exact;-webkit-print-color-adjust:exact}';
	};

	/* Стили ячеек: 0 обычный, 1 шапка, 2 текст в рамке, 3 целое, 4 число 0.0, 5 число 0.00, 6 заголовок, 7 жирный, 8 число 0.000 */
	var STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
		'<numFmts count="5"><numFmt numFmtId="164" formatCode="0.0"/><numFmt numFmtId="165" formatCode="0.00"/><numFmt numFmtId="166" formatCode="0.000"/><numFmt numFmtId="167" formatCode="#,##0"/><numFmt numFmtId="168" formatCode="#,##0.00"/></numFmts>' +
		'<fonts count="10"><font><sz val="10"/><name val="Arial"/></font><font><b/><sz val="10"/><name val="Arial"/></font><font><b/><sz val="13"/><name val="Arial"/></font>' +
		'<font><b/><sz val="16"/><name val="Arial"/></font><font><sz val="9"/><color rgb="FF5D6770"/><name val="Arial"/></font><font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Arial"/></font>' +
		'<font><u/><sz val="10"/><color rgb="FF1F5FBF"/><name val="Arial"/></font><font><b/><sz val="13"/><color rgb="FFFFFFFF"/><name val="Arial"/></font><font><i/><sz val="9"/><color rgb="FF5D6770"/><name val="Arial"/></font><font><b/><sz val="11"/><name val="Arial"/></font></fonts>' +
		'<fills count="7"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE7EAEE"/><bgColor indexed="64"/></patternFill></fill>' +
		'<fill><patternFill patternType="solid"><fgColor rgb="FF0E6B5A"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF2B2F35"/><bgColor indexed="64"/></patternFill></fill>' +
		'<fill><patternFill patternType="solid"><fgColor rgb="FFDFE5E9"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF6F8F9"/><bgColor indexed="64"/></patternFill></fill></fills>' +
		'<borders count="3"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color auto="1"/></left><right style="thin"><color auto="1"/></right><top style="thin"><color auto="1"/></top><bottom style="thin"><color auto="1"/></bottom><diagonal/></border>' +
		'<border><left style="thin"><color rgb="FFC9CFD5"/></left><right style="thin"><color rgb="FFC9CFD5"/></right><top style="thin"><color rgb="FFC9CFD5"/></top><bottom style="thin"><color rgb="FFC9CFD5"/></bottom><diagonal/></border></borders>' +
		'<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
		'<cellXfs count="31">' +
		'<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
		'<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
		'<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>' +
		'<xf numFmtId="1" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>' +
		'<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>' +
		'<xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>' +
		'<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
		'<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
		'<xf numFmtId="166" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>' +
		/* 9… — документы сметы (вид «таблица с заливками»): 9 заголовок, 10 серый, 11 шапка таблицы, 12/13 группа, 14/15 раздел,
		   16/17 текст (17 — полоса), 18/19 количество, 20/21 деньги, 22/23 цена с копейками, 24/25 ссылка, 26/27 итог, 28/29 ИТОГО, 30 примечание */
		'<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"></xf><xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"></xf><xf numFmtId="0" fontId="5" fillId="3" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="5" fillId="4" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="167" fontId="5" fillId="4" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="1" fillId="5" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="167" fontId="1" fillId="5" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="6" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="6" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf><xf numFmtId="167" fontId="0" fillId="0" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="167" fontId="0" fillId="6" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="168" fontId="0" fillId="0" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="168" fontId="0" fillId="6" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="6" fillId="0" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="6" fillId="6" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf><xf numFmtId="167" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="7" fillId="3" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf><xf numFmtId="167" fontId="7" fillId="3" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="8" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' +
		'</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

	/* Книга: sheets = [{ name, cols: [ширины], rows: [[ячейка…]…], freeze: строк шапки, heights: { строка: пт },
	     merges: ['A1:H1'…], links: [{ r, c, url }], images: [{ r, c, data: 'data:image/…', w, h (пикс.) }],
	     print: { titles: строка шапки (с 1), portrait: 1 } — А4 по ширине листа, номера страниц внизу }].
	   Ячейка: строка, число, null или { v, s, f } со стилем; f — формула без «=» (v — посчитанное значение). Возвращает Uint8Array. */
	function b64(s) {
		var bin = typeof G.atob === 'function' ? G.atob(s) : G.Buffer.from(s, 'base64').toString('binary'), out = new Uint8Array(bin.length);
		for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
		return out;
	}
	O.cellRef = function (r, c) { return colName(c) + (r + 1); };
	O.colName = colName;
	function documentStyles(theme) {
		if (!theme) return STYLES;
		var c = docPalette(theme), dark = theme === 'dark';
		function rgb(hex) { return 'FF' + hex.slice(1).toUpperCase(); }
		var colors = { FF0E6B5A: dark ? c.tint : c.accent, FF2B2F35: dark ? c.tint : '#365951',
			FFDFE5E9: dark ? '#3a3d42' : c.tint, FFF6F8F9: dark ? c.panel : '#f5f9f6',
			FFC9CFD5: c.line, FF5D6770: c.mute, FF1F5FBF: c.link };
		var styles = STYLES.replace(/rgb="([A-F0-9]+)"/g, function (m, color) {
			return colors[color] ? 'rgb="' + rgb(colors[color]) + '"' : m;
		}).replace(/<alignment([^>]*?)\/>/g, function (_, attrs) {
			return '<alignment horizontal="left" vertical="top" indent="1"' + attrs.replace(/ (?:horizontal|vertical)="[^"]+"/g, '') + '/>';
		});
		if (!dark) return styles;
		styles = styles.replace(/<font>(.*?)<\/font>/g, function (tag, fields) {
			return fields.indexOf('<color') >= 0 ? tag : '<font>' + fields.replace('<name', '<color rgb="' + rgb(c.text) + '"/><name') + '</font>';
		});
		return styles.replace(/<cellXfs count="31">(.*?)<\/cellXfs>/, function (tag, xfs) {
			// Индексы и форматы ячеек сохраняются. Заливка нужна под светлым текстом.
			return '<cellXfs count="31">' + xfs.replace(/<xf [^>]+>/g, function (xf) {
				if (xf.indexOf('fillId="0"') < 0) return xf;
				return xf.replace('fillId="0"', 'fillId="6"').replace(/\/?\>$/, function (end) {
					return (xf.indexOf('applyFill=') < 0 ? ' applyFill="1"' : '') + end;
				});
			}) + '</cellXfs>';
		});
	}
	O.xlsxBook = function (sheets, theme) {
		var sst = [], sidx = {}, files = [], i, used = {};
		function str(s) { s = String(s); if (!sidx.hasOwnProperty(s)) { sidx[s] = sst.length; sst.push(s); } return sidx[s]; }
		function safeName(n) {
			var s = String(n).replace(/[\[\]\:\*\?\/\\]/g, ' ').replace(/\s+/g, ' ').replace(/^'+|'+$/g, '').substring(0, 31).replace(/\s+$/, '') || 'Лист', base = s, k = 2;
			while (used[s.toLowerCase()]) { var suf = ' (' + (k++) + ')'; s = base.substring(0, 31 - suf.length) + suf; }
			used[s.toLowerCase()] = 1;
			return s;
		}
		var wbSheets = '', rels = '', ct = '', names = '', nImg = 0, exts = {};
		for (i = 0; i < sheets.length; i++) {
			var sh = sheets[i], x = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'];
			var pr = sh.print, srels = [], sname = safeName(sh.name);
			if (pr) x.push('<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>');
			if (sh.freeze > 0) x.push('<sheetViews><sheetView workbookViewId="0"><pane ySplit="' + sh.freeze + '" topLeftCell="A' + (sh.freeze + 1) + '" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>');
			if (sh.cols && sh.cols.length) { x.push('<cols>'); for (var c = 0; c < sh.cols.length; c++) x.push('<col min="' + (c + 1) + '" max="' + (c + 1) + '" width="' + sh.cols[c] + '" customWidth="1"/>'); x.push('</cols>'); }
			x.push('<sheetData>');
			for (var r = 0; r < sh.rows.length; r++) {
				var row = sh.rows[r] || [], cells = '';
				for (var q = 0; q < row.length; q++) {
					var cell = row[q];
					if (cell === null || cell === undefined || cell === '') continue;
					var v = (typeof cell === 'object') ? cell.v : cell, st = (typeof cell === 'object' && cell.s) ? cell.s : 0, ref = colName(q) + (r + 1);
					if (v === null || v === undefined || v === '') { if (st) cells += '<c r="' + ref + '" s="' + st + '"/>'; continue; }
					if (typeof cell === 'object' && cell.f) cells += '<c r="' + ref + '"' + (st ? ' s="' + st + '"' : '') + '><f>' + xe(cell.f) + '</f>' + (typeof v === 'number' && isFinite(v) ? '<v>' + v + '</v>' : '') + '</c>';
					else if (typeof v === 'number' && isFinite(v)) cells += '<c r="' + ref + '"' + (st ? ' s="' + st + '"' : '') + '><v>' + v + '</v></c>';
					else cells += '<c r="' + ref + '" t="s"' + (st ? ' s="' + st + '"' : '') + '><v>' + str(v) + '</v></c>';
				}
				x.push('<row r="' + (r + 1) + '"' + (sh.heights && sh.heights[r] ? ' ht="' + sh.heights[r] + '" customHeight="1"' : '') + '>' + cells + '</row>');
			}
			x.push('</sheetData>');
			if (sh.merges && sh.merges.length) x.push('<mergeCells count="' + sh.merges.length + '">' + sh.merges.map(function (m) { return '<mergeCell ref="' + m + '"/>'; }).join('') + '</mergeCells>');
			if (sh.links && sh.links.length) {
				x.push('<hyperlinks>' + sh.links.map(function (l) { srels.push('<Relationship Id="rL' + srels.length + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="' + xe(l.url) + '" TargetMode="External"/>'); return '<hyperlink ref="' + colName(l.c) + (l.r + 1) + '" r:id="rL' + (srels.length - 1) + '"/>'; }).join('') + '</hyperlinks>');
			}
			x.push('<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.55" header="0.3" footer="0.3"/>');
			x.push('<pageSetup paperSize="9" orientation="' + (pr && pr.portrait ? 'portrait' : 'landscape') + '"' + (pr ? ' fitToWidth="1" fitToHeight="0"' : '') + '/>');
			if (pr) x.push('<headerFooter><oddFooter>&amp;L' + xe(sname) + '&amp;Rлист &amp;P из &amp;N</oddFooter></headerFooter>');
			if (pr && pr.titles) names += '<definedName name="_xlnm.Print_Titles" localSheetId="' + i + '">\'' + xe(sname.replace(/'/g, "''")) + '\'!$' + pr.titles + ':$' + pr.titles + '</definedName>';
			/* картинки: фото позиций, чертежи фасадов — в ячейке, с отступом 2 пикс. */
			var imgs = (sh.images || []).filter(function (m) { return /^data:image\/(png|jpeg|jpg);base64,/.test(m.data || ''); });
			if (imgs.length) {
				var dr = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'], drels = [];
				imgs.forEach(function (m, k) {
					var mm = /^data:image\/(png|jpeg|jpg);base64,(.*)$/.exec(m.data), ext = mm[1] === 'png' ? 'png' : 'jpeg', fn = 'image' + (++nImg) + '.' + ext;
					exts[ext] = 1;
					files.push({ name: 'xl/media/' + fn, data: b64(mm[2]) });
					drels.push('<Relationship Id="rI' + k + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/' + fn + '"/>');
					var E = 9525;
					dr.push('<xdr:oneCellAnchor><xdr:from><xdr:col>' + m.c + '</xdr:col><xdr:colOff>' + (3 * E) + '</xdr:colOff><xdr:row>' + m.r + '</xdr:row><xdr:rowOff>' + (3 * E) + '</xdr:rowOff></xdr:from><xdr:ext cx="' + Math.round(m.w * E) + '" cy="' + Math.round(m.h * E) + '"/>' +
						'<xdr:pic><xdr:nvPicPr><xdr:cNvPr id="' + (k + 2) + '" name="Картинка ' + (k + 1) + '"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rI' + k + '"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>' +
						'<xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + Math.round(m.w * E) + '" cy="' + Math.round(m.h * E) + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor>');
				});
				dr.push('</xdr:wsDr>');
				files.push({ name: 'xl/drawings/drawing' + (i + 1) + '.xml', data: dr.join('') });
				files.push({ name: 'xl/drawings/_rels/drawing' + (i + 1) + '.xml.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + drels.join('') + '</Relationships>' });
				srels.push('<Relationship Id="rD" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing' + (i + 1) + '.xml"/>');
				x.push('<drawing r:id="rD"/>');
				ct += '<Override PartName="/xl/drawings/drawing' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>';
			}
			x.push('</worksheet>');
			if (srels.length) files.push({ name: 'xl/worksheets/_rels/sheet' + (i + 1) + '.xml.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + srels.join('') + '</Relationships>' });
			files.push({ name: 'xl/worksheets/sheet' + (i + 1) + '.xml', data: x.join('') });
			wbSheets += '<sheet name="' + xe(sname) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>';
			rels += '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>';
			ct += '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
		}
		var n = sheets.length, ss = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="' + sst.length + '" uniqueCount="' + sst.length + '">';
		for (i = 0; i < sst.length; i++) ss += '<si><t xml:space="preserve">' + xe(sst[i]) + '</t></si>';
		ss += '</sst>';
		var head = [
			{ name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' + (exts.png ? '<Default Extension="png" ContentType="image/png"/>' : '') + (exts.jpeg ? '<Default Extension="jpeg" ContentType="image/jpeg"/>' : '') + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' + ct + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>' },
			{ name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
			{ name: 'xl/workbook.xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' + wbSheets + '</sheets>' + (names ? '<definedNames>' + names + '</definedNames>' : '') + '<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>' },
			{ name: 'xl/_rels/workbook.xml.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + rels + '<Relationship Id="rId' + (n + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId' + (n + 2) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>' },
			{ name: 'xl/styles.xml', data: documentStyles(theme) }, { name: 'xl/sharedStrings.xml', data: ss }
		];
		return BM.zip(head.concat(files));
	};

	/* ------------------------------ строки таблиц ----------------------------- */

	var TEX = { l: 'вдоль длины', w: 'поперёк длины', n: 'любая' };
	/* Строки списка деталей (по одной на разновидность детали). */
	O.partRows = function (st, onlyKey) {
		var rows = [], i, j, k;
		for (i = 0; i < st.mats.length; i++) {
			var m = st.mats[i];
			if (onlyKey && m.key !== onlyKey) continue;
			var lay = m.cfg.on ? st.work.layout[m.key] : null, where = {};
			if (lay) for (j = 0; j < lay.sheets.length; j++) for (k = 0; k < lay.sheets[j].recs.length; k++) { var sg = lay.sheets[j].recs[k].t; (where[sg] = where[sg] || {})[j + 1] = 1; }
			for (j = 0; j < m.types.length; j++) {
				var t = m.types[j], n = P.count(st, t);
				if (!n) continue;
				var sh = P.shapeFor(st, t, m), tw = st.work.parts[t.sig] || {}, fl = [];
				if (sh.curve) fl.push(sh.ok ? 'криволинейная' : 'криволинейная (форма не прочитана)');
				if (sh.innerPts.length) fl.push('вырез');
				if (tw.grp > 0) fl.push('группа ' + tw.grp);
				if (t.plastic) fl.push('облицовка пласти');
				if (!t.pos || !t.des) fl.push('нет позиции или обозначения');
				if (t.holes && t.holes.edge) fl.push('присадка в торец: ' + t.holes.edge);
				rows.push({ t: t, mat: m, pos: t.pos, des: t.des, name: t.name, matName: m.name, th: m.th, L: t.L, W: t.W, qty: n,
							l1: sh.sides.T || 0, l2: sh.sides.B || 0, w1: sh.sides.L || 0, w2: sh.sides.R || 0,
							sheets: where[t.sig] ? Object.keys(where[t.sig]).map(Number).sort(function (a, b) { return a - b; }).join(', ') : '',
							tex: m.cfg.grain ? TEX[P.grainOf(st, t, m)] : 'нет', flags: fl.join('; '), area: sh.area / 1e6, perim: sh.perim / 1000, cab: t.path.join(' / ') });
			}
		}
		return rows;
	};
	var HEAD = ['№', 'Поз.', 'Обозначение', 'Название', 'Материал', 'Толщ., мм', 'Длина, мм', 'Ширина, мм', 'Кол-во', 'Кромка по длине 1, мм', 'Кромка по длине 2, мм', 'Кромка по ширине 1, мм', 'Кромка по ширине 2, мм',
				'Листы раскроя', 'Текстура', 'Признаки', 'Площадь 1 шт., м²', 'Периметр 1 шт., м', 'Площадь всего, м²', 'Изделие'];
	var WIDTHS = [5, 7, 13, 30, 38, 8, 9, 9, 7, 9, 9, 9, 9, 11, 14, 34, 10, 10, 10, 26];
	function rowCells(r, i) {
		var e = function (v) { return v ? { v: v, s: 4 } : { v: '', s: 2 }; };
		return [{ v: i + 1, s: 3 }, { v: r.pos, s: 2 }, { v: r.des, s: 2 }, { v: r.name, s: 2 }, { v: r.matName, s: 2 }, { v: r.th, s: 4 }, { v: Math.round(r.L * 10) / 10, s: 4 }, { v: Math.round(r.W * 10) / 10, s: 4 }, { v: r.qty, s: 3 },
				e(r.l1), e(r.l2), e(r.w1), e(r.w2), { v: r.sheets, s: 2 }, { v: r.tex, s: 2 }, { v: r.flags, s: 2 }, { v: r3(r.area), s: 8 }, { v: r2(r.perim), s: 5 }, { v: r3(r.area * r.qty), s: 8 }, { v: r.cab, s: 2 }];
	}
	function headRow(h) { return h.map(function (x) { return { v: x, s: 1 }; }); }

	O.xlsx = function (st) {
		var sm = P.summary(st), p = st.work.params, title = BM.project.modelName(st.model) || 'Модель', sheets = [], i, j, k;
		/* сводка */
		var S = [[{ v: 'Раскрой — ' + title, s: 6 }], [st.model.order ? 'Заказ: ' + st.model.order : '', '', '', 'Дата: ' + new Date().toLocaleDateString('ru-RU')], [],
				 headRow(['Материал', 'Толщ., мм', 'Формат листа, мм', 'Станок', 'Листов', 'Остатков', 'Деталей', 'Не уложено', 'Детали, м²', 'Закуплено, м²', 'Заполнение, %', 'Рез, м', 'Поворотов листа'])];
		for (i = 0; i < sm.mats.length; i++) {
			var R = sm.mats[i], m = R.mat, f = P.fmtOf(m);
			S.push([{ v: P.matTitle(m), s: 2 }, { v: m.th, s: 4 }, { v: R.on ? f.L + ' × ' + f.W : '—', s: 2 }, { v: !R.on ? 'без раскроя' : 'ФРС', s: 2 }, { v: R.std, s: 3 }, { v: R.rem, s: 3 }, { v: R.n, s: 3 }, { v: R.unplaced, s: 3 },
					{ v: r2(R.area / 1e6), s: 5 }, { v: r2(R.bought / 1e6), s: 5 }, { v: Math.round(R.fill * 10) / 10, s: 4 }, { v: r2(R.saw / 1000), s: 5 }, { v: R.rot, s: 3 }]);
		}
		S.push([]);
		S.push([{ v: 'Настройки раскроя', s: 7 }]);
		if (p.cut && p.cut.pkg > 1) { S.push(['Плит в пакете', p.cut.pkg]); S.push(['Циклов реза', sm.cycles]); }
		if (p.cut && p.cut.price > 0) S.push(['Стоимость плит, р.', Math.round(sm.cost)]);
		if (p.cut && p.cut.areaAnalysis) { S.push(['Анализ площадей, м²: куплено', r2(sm.boughtArea / 1e6)]); S.push(['в деталях', r2(sm.partsArea / 1e6)]); S.push(['деловые обрезки', r2(sm.offArea / 1e6)]); S.push(['отходы', r2(Math.max(0, sm.boughtArea - sm.partsArea - sm.offArea) / 1e6)]); }
		S.push(['Рез пилы (ФРС), мм', p.kerf]); S.push(['Обрезка краёв листа, мм', p.margin]); S.push(['Припуск на упил криволинейных, мм', p.allow]); S.push(['Комплектов', st.work.sets]);
		if (st.work.scope === 'sel') S.push(['В раскрой взяты только выделенные в БАЗИСе детали']);
		if (sm.noPos) S.push(['Деталей без позиции или обозначения', sm.noPos]);
		var et = P.edgeTotals(st);
		if (et.length) {
			S.push([]); S.push([{ v: 'Кромка', s: 7 }]); S.push(headRow(['Материал кромки', 'Толщ., мм', 'Длина, м']));
			for (i = 0; i < et.length; i++) S.push([{ v: et[i].name, s: 2 }, { v: et[i].th, s: 4 }, { v: r2(et[i].len / 1000), s: 5 }]);
		}
		sheets.push({ name: 'Сводка', cols: [46, 10, 16, 26, 9, 10, 9, 11, 11, 13, 13, 9, 11], rows: S, heights: { 3: 30 } });
		/* все детали */
		var all = O.partRows(st, null), A = [headRow(HEAD)];
		for (i = 0; i < all.length; i++) A.push(rowCells(all[i], i));
		sheets.push({ name: 'Все детали', cols: WIDTHS, rows: A, freeze: 1, heights: { 0: 42 } });
		/* по материалам */
		for (i = 0; i < sm.mats.length; i++) {
			var mm = sm.mats[i].mat, rs = O.partRows(st, mm.key), M = [[{ v: P.matTitle(mm), s: 6 }], [sm.mats[i].on ? ('ФРС, лист ' + P.fmtOf(mm).L + ' × ' + P.fmtOf(mm).W + ', листов: ' + sm.mats[i].sheets) : 'без раскроя'], headRow(HEAD)];
			for (j = 0; j < rs.length; j++) M.push(rowCells(rs[j], j));
			sheets.push({ name: P.matTitle(mm), cols: WIDTHS, rows: M, freeze: 3, heights: { 2: 42 } });
		}
		/* таблицы резов: по листу на материал */
		if ((p.cut || {}).showCuts !== 0) for (i = 0; i < sm.mats.length; i++) {
			var cm = sm.mats[i].mat, cl = sm.mats[i].on ? st.work.layout[cm.key] : null;
			if (!cl) continue;
			var C = [[{ v: 'Резы — ' + P.matTitle(cm), s: 6 }], ['Левый/правый упор: размер от линейки; ◂ — деталь у левого упора, ▸ — у правого. Установ меняется, когда меняется размер или сторона упора.'], headRow(['Лист', '№ реза', 'Установ', 'Левый упор', 'Правый упор', 'Деталь', 'Длина реза, мм'])];
			for (j = 0; j < cl.sheets.length; j++) {
				var csh = cl.sheets[j], cs = csh.cuts || [];
				for (k = 0; k < cs.length; k++) {
					var cr = cs[k].part >= 0 ? csh.recs[cs[k].part] : null, ct = cr ? st.typeBy[cr.t] : null;
					C.push([{ v: j + 1, s: 3 }, { v: k + 1, s: 3 }, { v: cs[k].setup, s: 3 }, { v: cs[k].side === 'L' ? cs[k].size : '', s: 4 }, { v: cs[k].side === 'R' ? cs[k].size : '', s: 4 }, { v: ct ? ((ct.pos ? ((p.cut || {}).posPrefix || '') + ct.pos : '') || ct.name) + (cs[k].side === 'L' ? ' ◂' : ' ▸') : 'полоса', s: 2 }, { v: cs[k].len, s: 4 }]);
				}
			}
			if (C.length > 3) sheets.push({ name: 'Резы ' + P.matTitle(cm), cols: [7, 9, 9, 13, 13, 22, 14], rows: C, freeze: 3, heights: { 2: 30 } });
		}
		return O.xlsxBook(sheets);
	};

	/* Накладные раскроя (три): в производство — какие плиты и какие детали на каждой; на заготовки — остатки,
	   взятые со склада; на обрезки — деловые обрезки, которые вернутся на склад. Включаются в настройках раскроя. */
	O.xlsxInvoices = function (st, which) {
		var p = st.work.params, c = p.cut || {}, wb = which || c.wb || { prod: 1, blank: 1, off: 1 }, pre = c.posPrefix || '', sheets = [], i, j, k;
		var title = BM.project.modelName(st.model) || 'Модель', date = new Date().toLocaleDateString('ru-RU');
		var P1 = [[{ v: 'Накладная в производство — ' + title, s: 6 }], [st.model.order ? 'Заказ: ' + st.model.order : '', '', '', 'Дата: ' + date], [],
				  headRow(['Материал', 'Лист', 'Плита, мм', 'Поз.', 'Обозн.', 'Название', 'Длина', 'Ширина', 'Шт'])];
		var B1 = [[{ v: 'Накладная на заготовки (остатки со склада) — ' + title, s: 6 }], [st.model.order ? 'Заказ: ' + st.model.order : '', '', 'Дата: ' + date], [],
				  headRow(['Материал', 'Лист раскроя', 'Остаток, мм', 'Деталей', 'Заполнение, %'])];
		var O1 = [[{ v: 'Накладная на обрезки (на склад) — ' + title, s: 6 }], [st.model.order ? 'Заказ: ' + st.model.order : '', '', 'Дата: ' + date], [],
				  headRow(['Материал', 'Лист раскроя', 'Обрезок, мм', 'Площадь, м²'])];
		for (i = 0; i < st.mats.length; i++) {
			var m = st.mats[i], lay = m.cfg.on ? st.work.layout[m.key] : null;
			if (!lay) continue;
			for (j = 0; j < lay.sheets.length; j++) {
				var sh = lay.sheets[j], rows = P.sheetRows(st, m, sh), stt = P.sheetStat(st, m, sh);
				for (k = 0; k < rows.length; k++) {
					var t = rows[k].t;
					P1.push([{ v: P.matTitle(m), s: 2 }, { v: j + 1, s: 3 }, { v: sh.L + ' × ' + sh.W + (sh.rem ? ' (остаток)' : ''), s: 2 }, { v: t.pos ? pre + t.pos : '', s: 2 }, { v: t.des || '', s: 2 }, { v: t.name, s: 2 }, { v: t.L, s: 4 }, { v: t.W, s: 4 }, { v: rows[k].n, s: 3 }]);
				}
				if (sh.rem) B1.push([{ v: P.matTitle(m), s: 2 }, { v: j + 1, s: 3 }, { v: sh.L + ' × ' + sh.W, s: 2 }, { v: sh.recs.length, s: 3 }, { v: Math.round(stt.fill * 10) / 10, s: 4 }]);
				var offs = P.goodOffcuts(st, m, sh);
				for (var q = 0; q < offs.length; q++) {
					var a = Math.max(offs[q].w, offs[q].h), b = Math.min(offs[q].w, offs[q].h);
					O1.push([{ v: P.matTitle(m), s: 2 }, { v: j + 1, s: 3 }, { v: Math.floor(a + 0.01) + ' × ' + Math.floor(b + 0.01), s: 2 }, { v: r2(a * b / 1e6), s: 5 }]);
				}
			}
		}
		if (wb.prod !== 0) sheets.push({ name: 'В производство', cols: [44, 7, 18, 9, 14, 40, 9, 9, 7], rows: P1, freeze: 4, heights: { 3: 30 } });
		if (wb.blank !== 0) sheets.push({ name: 'На заготовки', cols: [44, 14, 18, 11, 14], rows: B1, freeze: 4, heights: { 3: 30 } });
		if (wb.off !== 0) sheets.push({ name: 'На обрезки', cols: [44, 14, 18, 13], rows: O1, freeze: 4, heights: { 3: 30 } });
		if (!sheets.length) sheets.push({ name: 'Накладные', cols: [60], rows: [['Все накладные выключены в настройках раскроя (вкладка «Списки»).']] });
		return O.xlsxBook(sheets);
	};

	/* CSV: точка с запятой, первая строка — названия столбцов; в начале метка UTF-8, чтобы Excel открыл по-русски. */
	O.csv = function (st) {
		var all = O.partRows(st, null), out = [HEAD.join(';')];
		function c(v) { v = String(v === null || v === undefined ? '' : v); return /[;"\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
		function num(v, d) { return v ? String(Math.round(v * Math.pow(10, d)) / Math.pow(10, d)).replace('.', ',') : ''; }
		for (var i = 0; i < all.length; i++) {
			var r = all[i];
			out.push([i + 1, c(r.pos), c(r.des), c(r.name), c(r.matName), num(r.th, 1), num(r.L, 1), num(r.W, 1), r.qty, num(r.l1, 1), num(r.l2, 1), num(r.w1, 1), num(r.w2, 1), c(r.sheets), c(r.tex), c(r.flags), num(r.area, 3), num(r.perim, 2), num(r.area * r.qty, 3), c(r.cab)].join(';'));
		}
		return String.fromCharCode(0xFEFF) + out.join('\r\n') + '\r\n';
	};
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));
