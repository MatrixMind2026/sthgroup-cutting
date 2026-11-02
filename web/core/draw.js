/* STHGroup — карта листа раскроя (SVG). Одна и та же картинка идёт в окно
   программы и в PDF.

   Чертёж в миллиметрах листа. k — сколько мм листа в одном мм бумаги (экрана):
   от него считаются толщины линий и кегли, чтобы на любом масштабе карта
   выглядела одинаково. На детали: позиция · обозначение, название, размер;
   не помещается — сначала уходит название, потом размер. */
(function (G) {
	'use strict';
	var BM = G.BM = G.BM || {};
	var D = BM.draw = {};
	var geom = BM.geom, P = BM.project;

	D.FONT = 'Bahnschrift,"DejaVu Sans Condensed","Arial Narrow",Arial,sans-serif';
	D.esc = function (s) { return String(s === null || s === undefined ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
	var esc = D.esc;
	function n1(v) { return String(Math.round(v * 10) / 10); }
	D.n1 = n1;

	/* Примерная ширина строки в долях кегля. Мерить текст нечем — оценка с запасом. */
	D.textW = function (s, bold) {
		var w = 0;
		s = String(s);
		for (var i = 0; i < s.length; i++) {
			var ch = s.charAt(i), c = s.charCodeAt(i);
			if (ch === ' ') w += 0.28;
			else if (c >= 48 && c <= 57) w += 0.56;
			else if ('.,:;!|\'"`ijl'.indexOf(ch) >= 0) w += 0.28;
			else if ('-()[]/\\ftr·'.indexOf(ch) >= 0) w += 0.35;
			else if ('WMmw@%ШЩЖЮЫМшщжюым'.indexOf(ch) >= 0) w += 0.86;
			else if ((c >= 65 && c <= 90) || (c >= 0x410 && c <= 0x42F)) w += 0.69;
			else w += 0.57;
		}
		return w * (bold ? 1.08 : 1.02);
	};
	var textW = D.textW;
	function trim(s) { return String(s).replace(/^\s+|\s+$/g, ''); }
	D.clip = function (s, maxEm) {
		s = String(s);
		if (textW(s) <= maxEm) return s;
		while (s.length > 1 && textW(s + '…') > maxEm) s = s.substring(0, s.length - 1);
		return trim(s) + '…';
	};
	function breakAt(s, capEm) {
		var cut = -1, i;
		for (i = 1; i < s.length; i++) {
			if (s.charAt(i) !== ' ') continue;
			if (textW(s.substring(0, i)) <= capEm) cut = i; else break;
		}
		if (cut < 0) { for (i = s.length - 1; i > 1; i--) if (textW(s.substring(0, i)) <= capEm) break; cut = i; }
		return cut;
	}
	D.wrap2 = function (s, capEm) {
		s = String(s);
		if (textW(s) <= capEm) return [s];
		var cut = breakAt(s, capEm);
		return [trim(s.substring(0, cut)), D.clip(trim(s.substring(cut)), capEm)];
	};

	/* Подбор подписи под прямоугольник bw x bh (мм листа). Строки по убыванию важности:
	   главная (позиция · обозначение), размер, размер заготовки (extra), название. */
	function fit(bw, bh, k, main, name, dims, extra, mark) {
		var U = 0.3528 * k, padW = 1.8 * k, padH = 1.2 * k, best = null;
		var sizes = [10, 9, 8, 7.5, 7, 6.5, 6, 5.5, 5, 4.5, 4];
		var sets = [];
		if (extra && name && dims) sets.push('mndx');
		if (name && dims) sets.push('mnd');
		if (extra && dims) sets.push('mdx');
		if (dims) sets.push('md');
		sets.push('m');
		mark = mark || '';
		for (var o = 0; o < 2; o++) {
			var W = (o ? bh : bw) - padW, H = (o ? bw : bh) - padH;
			if (W <= 0 || H <= 0) continue;
			for (var si = 0; si < sets.length; si++) {
				var set = sets[si], n = set.length, hasN = set.indexOf('n') >= 0;
				var minF = hasN ? 6 : (n >= 2 ? 5.5 : 4);
				for (var q = 0; q < sizes.length; q++) {
					var fm = sizes[q];
					if (fm < minF) break;
					var fs = Math.min(fm, Math.max(4.5, fm * 0.76));
					if (textW(main, true) * fm * U > W) continue;
					var dimT = dims + ((mark && !hasN) ? mark : '');
					if (n >= 2 && textW(dimT) * fs * U > W) {
						if (!mark || hasN || textW(dims) * fs * U > W) continue;
						dimT = dims;
					}
					if (set.indexOf('x') >= 0 && textW(extra) * fs * U > W) continue;
					if ((fm * 1.2 + (n - 1) * fs * 1.22) * U > H) continue;
					var nm = '';
					if (hasN) {
						nm = D.clip(name, W / (fs * U) - textW(mark));
						if (nm.length < Math.min(String(name).length, 6)) continue;
						nm += mark;
					}
					if (!best || n > best.n || (n === best.n && fm > best.fm)) best = { o: o, n: n, set: set, fm: fm, fs: fs, name: nm, dims: dimT, squeeze: 0 };
					break;
				}
			}
		}
		if (best) return best;
		var o2 = (bh > bw) ? 1 : 0;
		var W2 = Math.max(0.5 * k, (o2 ? bh : bw) - 0.8 * k), H2 = Math.max(0.5 * k, (o2 ? bw : bh) - 0.5 * k);
		var f2 = Math.max(2.2, Math.min(4.5, H2 / (1.2 * U)));
		return { o: o2, n: 1, set: 'm', fm: f2, fs: f2, name: '', dims: dims, squeeze: (textW(main, true) * f2 * U > W2) ? W2 : 0 };
	}

	function labelSvg(x, y, w, h, k, main, name, dims, extra, mark) {
		var U = 0.3528 * k, f = fit(w, h, k, main, name, dims, extra, mark), lines = [], i, total = 0;
		for (i = 0; i < f.set.length; i++) {
			var ch = f.set.charAt(i);
			if (ch === 'm') lines.push({ t: main, f: f.fm, lh: f.fm * 1.2, bold: 1, fill: '#000' });
			else if (ch === 'n') lines.push({ t: f.name, f: f.fs, lh: f.fs * 1.22, bold: 0, fill: '#222' });
			else if (ch === 'd') lines.push({ t: f.dims, f: f.fs, lh: f.fs * 1.22, bold: 0, fill: '#444' });
			else lines.push({ t: extra, f: f.fs, lh: f.fs * 1.22, bold: 0, fill: '#666' });
		}
		for (i = 0; i < lines.length; i++) total += lines[i].lh * U;
		var out = [], cur = -total / 2;
		out.push('<g transform="translate(' + n1(x + w / 2) + ',' + n1(y + h / 2) + ')' + (f.o ? ' rotate(-90)' : '') + '">');
		for (i = 0; i < lines.length; i++) {
			var L = lines[i], base = cur + L.lh * U / 2 + L.f * U * 0.35;
			out.push('<text x="0" y="' + n1(base) + '" font-size="' + n1(L.f * U) + '" text-anchor="middle"' + (L.bold ? ' font-weight="700"' : '') + ' fill="' + L.fill + '"' +
					 ((i === 0 && f.squeeze) ? ' textLength="' + n1(f.squeeze) + '" lengthAdjust="spacingAndGlyphs"' : '') + '>' + esc(L.t) + '</text>');
			cur += L.lh * U;
		}
		out.push('</g>');
		return out.join('');
	}

	/* Наибольший прямоугольник внутри контура (по сетке) — место для подписи. */
	function inRect(pts, bw, bh) {
		var N = 24, cw = bw / N, ch = bh / N, i, j, grid = [];
		function pip(x, y) { return geom.pointIn(pts, x, y); }
		for (j = 0; j < N; j++) {
			grid.push([]);
			for (i = 0; i < N; i++) {
				var x0 = i * cw + cw * 0.04, x1 = (i + 1) * cw - cw * 0.04, y0 = j * ch + ch * 0.04, y1 = (j + 1) * ch - ch * 0.04;
				grid[j].push(pip((x0 + x1) / 2, (y0 + y1) / 2) && pip(x0, y0) && pip(x1, y0) && pip(x0, y1) && pip(x1, y1));
			}
		}
		var hgt = [], best = null;
		for (i = 0; i < N; i++) hgt.push(0);
		for (j = 0; j < N; j++) {
			for (i = 0; i < N; i++) hgt[i] = grid[j][i] ? hgt[i] + 1 : 0;
			for (i = 0; i < N; i++) {
				var mh = hgt[i];
				for (var e = i; e < N && hgt[e] > 0; e++) {
					if (hgt[e] < mh) mh = hgt[e];
					var w = (e - i + 1) * cw, h = mh * ch, sc = w * h * (w >= h ? 1.15 : 1);
					if (!best || sc > best.sc) best = { sc: sc, x: i * cw, y: (j - mh + 1) * ch, w: w, h: h };
				}
			}
		}
		return best || { x: bw * 0.25, y: bh * 0.25, w: bw * 0.5, h: bh * 0.5 };
	}
	var IR_CACHE = {};
	function inRectOf(sh, t, q) {
		var key = sh.sg + '|' + Math.round(t.L * 10) + '|' + Math.round(t.W * 10) + '|' + q;
		if (!IR_CACHE[key]) IR_CACHE[key] = inRect(geom.rotPts(sh.pts, t.L, t.W, q), (q & 1) ? t.W : t.L, (q & 1) ? t.L : t.W);
		return IR_CACHE[key];
	}

	/* Штрих кромки вдоль ломаной line: средняя треть длины, сдвинутая внутрь контура poly на ins. */
	function edgePath(line, poly, ins, sw) {
		var i, tot = 0, seg = [];
		for (i = 0; i + 1 < line.length; i++) {
			var d = Math.sqrt(Math.pow(line[i + 1][0] - line[i][0], 2) + Math.pow(line[i + 1][1] - line[i][1], 2));
			seg.push(d); tot += d;
		}
		if (!(tot > 1)) return '';
		function at(t) {
			var acc = 0;
			for (var j = 0; j < seg.length; j++) {
				if (t <= acc + seg[j] || j === seg.length - 1) {
					var f = seg[j] > 0 ? (t - acc) / seg[j] : 0, a = line[j], b = line[j + 1];
					return { x: a[0] + (b[0] - a[0]) * f, y: a[1] + (b[1] - a[1]) * f, dx: seg[j] > 0 ? (b[0] - a[0]) / seg[j] : 1, dy: seg[j] > 0 ? (b[1] - a[1]) / seg[j] : 0 };
				}
				acc += seg[j];
			}
			return null;
		}
		var mid = at(tot / 2), sgn = 1;
		if (!geom.pointIn(poly, mid.x - mid.dy * ins * 1.5, mid.y + mid.dx * ins * 1.5)) sgn = -1;
		var n = Math.max(1, Math.min(24, Math.round(seg.length / 3))), out = [];
		if (seg.length === 1) n = 1;
		for (i = 0; i <= n; i++) {
			var q = at(tot / 3 + (tot / 3) * i / n);
			out.push(n1(q.x - sgn * q.dy * ins) + ',' + n1(q.y + sgn * q.dx * ins));
		}
		return '<path d="M' + out.join(' L') + '" fill="none" stroke="#000" stroke-width="' + n1(sw) + '"/>';
	}
	function polyPath(poly) {
		var a = [];
		for (var i = 0; i < poly.length; i++) a.push(n1(poly[i][0]) + ',' + n1(poly[i][1]));
		return 'M' + a.join(' L') + ' Z';
	}
	D.polyPath = polyPath;

	/* Одна деталь на карте. ox, oy — куда положить (угол габарита/заготовки, мм листа). */
	D.part = function (st, mat, rc, ox, oy, k, o) {
		var s = [], t = st.typeBy[rc.t];
		if (!t) return '';
		var sh = P.shapeFor(st, t, mat), SW = 0.15 * k, A = rc.ba || 0, q = rc.q | 0, j, z;
		var x = ox, y = oy, w = rc.a, h = rc.b, gx = x + A, gy = y + A, gw = w - 2 * A, gh = h - 2 * A;
		var fill = o.texFill ? o.texFill : ((o.bw || !o.color || o.color === 'none') ? '#fff' : P.colorOf(st, t, o.color));
		var poly = null, extra = '', mark = '';
		var body = geom.placed(sh.pts, t.L, t.W, q, gx, gy);
		if (sh.pts) { poly = body; if (q) mark = ' ↻' + (q * 90) + '°'; }
		if (A > 0) {
			/* ФР-станок: заготовка с припуском на упил, отход заштрихован */
			s.push('<rect x="' + n1(x + SW / 2) + '" y="' + n1(y + SW / 2) + '" width="' + n1(w - SW) + '" height="' + n1(h - SW) + '" fill="url(#cW' + o.uid + ')" stroke="#000" stroke-width="' + n1(SW) + '"/>');
			extra = 'заготовка ' + P.dim(t.L + 2 * A) + '×' + P.dim(t.W + 2 * A);
		}
		if (poly) s.push('<path class="bd" d="' + polyPath(poly) + '" fill="' + fill + '" stroke="#000" stroke-width="' + n1(SW) + '" stroke-linejoin="round"/>');
		else {
			var rs = Math.min(SW, Math.min(gw, gh) * 0.2);
			s.push('<rect class="bd" x="' + n1(gx + rs / 2) + '" y="' + n1(gy + rs / 2) + '" width="' + n1(gw - rs) + '" height="' + n1(gh - rs) + '" fill="' + fill + '" stroke="#000" stroke-width="' + n1(rs) + '"' +
				   ((A > 0 && sh.curve) ? ' stroke-dasharray="' + n1(1.2 * k) + ' ' + n1(0.8 * k) + '"' : '') + '/>');
		}
		/* внутренние вырезы */
		for (j = 0; j < sh.innerPts.length; j++) {
			var ip = geom.placed(sh.innerPts[j], t.L, t.W, q, gx, gy);
			s.push('<path d="' + polyPath(ip) + '" fill="url(#cW' + o.uid + ')" stroke="#000" stroke-width="' + n1(SW * 0.8) + '"/>');
		}
		if (o.labels === 0) return s.join('');

		/* кромка: короткий штрих у стороны — треть её длины, с отступом внутрь */
		var ins = Math.min(0.8 * k, Math.min(gw, gh) * 0.2), esw = Math.min(SW, Math.min(gw, gh) * 0.08);
		var ix = gx, iy = gy, iw = gw, ih = gh;
		for (j = 0; j < sh.edges.length; j++) {
			var ln = geom.rotPts(sh.edges[j].line, t.L, t.W, q);
			for (z = 0; z < ln.length; z++) { ln[z][0] += gx; ln[z][1] += gy; }
			s.push(edgePath(ln, body, ins, esw));
		}
		if (poly) {
			var ir = inRectOf(sh, t, q);
			ix = gx + ir.x; iy = gy + ir.y; iw = ir.w; ih = ir.h;
			if (sh.edges.length && iw > 6 * ins && ih > 6 * ins) { ix += 1.4 * ins; iy += 1.4 * ins; iw -= 2.8 * ins; ih -= 2.8 * ins; }
		} else {
			var e = { t: sh.sides.T, r: sh.sides.R, b: sh.sides.B, l: sh.sides.L };
			for (z = q; z > 0; z--) e = { t: e.l, r: e.t, b: e.r, l: e.b };
			if (e.l) { ix += ins; iw -= ins; }
			if (e.r) iw -= ins;
			if (e.t) { iy += ins; ih -= ins; }
			if (e.b) ih -= ins;
			if (sh.innerPts.length) {
				/* подпись — в самой широкой полосе вокруг выреза */
				var ib = geom.box(geom.placed(sh.innerPts[0], t.L, t.W, q, gx, gy));
				var zones = [{ x: ix, y: iy, w: iw, h: ib.y1 - iy }, { x: ix, y: ib.y2, w: iw, h: iy + ih - ib.y2 }, { x: ix, y: iy, w: ib.x1 - ix, h: ih }, { x: ib.x2, y: iy, w: ix + iw - ib.x2, h: ih }], bz = null;
				for (z = 0; z < zones.length; z++) if (zones[z].w > 0 && zones[z].h > 0 && (!bz || zones[z].w * zones[z].h * (zones[z].w > zones[z].h ? 1.3 : 1) > bz.w * bz.h * (bz.w > bz.h ? 1.3 : 1))) bz = zones[z];
				if (bz) { ix = bz.x; iy = bz.y; iw = bz.w; ih = bz.h; }
			}
		}
		/* присадка: отверстия видимой пласти */
		if (o.holes && t.holes) {
			var fl = false, list = t.holes.top.concat(t.holes.thr);
			for (j = 0; j < list.length; j++) {
				var hp = geom.rotPt([fl ? t.L - list[j].x : list[j].x, list[j].y], t.L, t.W, q);
				s.push('<circle cx="' + n1(gx + hp[0]) + '" cy="' + n1(gy + hp[1]) + '" r="' + n1(Math.max(list[j].d / 2, 0.35 * k)) + '" fill="none" stroke="#c0392b" stroke-width="' + n1(0.12 * k) + '"/>');
			}
		}
		s.push(labelSvg(ix, iy, iw, ih, k, P.main(t) || '?', t.name, P.dim(t.sL || t.L) + '×' + P.dim(t.sW || t.W), extra, mark));
		return s.join('');
	};

	/* Текстура материала на карте (o.tex = { url, w, h } — картинка из папки текстур): повтор ~1 м по длинной
	   стороне картинки, длинная сторона — вдоль листа (так у декоров идёт рисунок); слегка высветлена, чтобы
	   подписи читались. */
	var TEX_MM = 1000;
	function texPattern(o, id) {
		var t = o.tex;
		if (!t || !t.url || o.bw) return '';
		var w = t.w > 0 ? t.w : 1, h = t.h > 0 ? t.h : 1, rot = h > w, a = Math.max(w, h), tw = TEX_MM * w / a, th = TEX_MM * h / a;
		return '<pattern id="' + id + '" width="' + n1(tw) + '" height="' + n1(th) + '" patternUnits="userSpaceOnUse"' + (rot ? ' patternTransform="rotate(90)"' : '') + '>' +
			'<image href="' + esc(t.url) + '" x="0" y="0" width="' + n1(tw) + '" height="' + n1(th) + '" preserveAspectRatio="none"/><rect width="' + n1(tw) + '" height="' + n1(th) + '" fill="#fff" fill-opacity="0.28"/></pattern>';
	}

	/* Карта листа. o: { wmm — ширина карты, мм бумаги (или px — в пикселях экрана), uid,
	   strip — полоса над листом (формат, текстура), color, bw, labels, offcuts, holes,
	   inter — для окна: у деталей data-i и класс pt }. */
	D.sheet = function (st, mat, sh, o) {
		o = o || {};
		var L = sh.L, W = sh.W, m = st.work.params.margin, i;
		var wmm = o.wmm > 0 ? o.wmm : (o.px > 0 ? o.px / 3.7795 : 180);
		var hmm = wmm * W / L, k = L / wmm, U = 0.3528 * k;
		var strip = o.strip === 0 ? 0 : 6, top = strip * k, pad = 0.4 * k;
		var uid = o.uid === undefined ? 0 : o.uid, hid = 'cH' + uid, hs = 1.7 * k, s = [];
		var unit = o.px > 0 ? 'px' : 'mm', sc = o.px > 0 ? 3.7795 : 1;
		s.push('<svg xmlns="http://www.w3.org/2000/svg" version="1.1" width="' + n1((wmm + 0.8) * sc) + unit + '" height="' + n1((hmm + strip + 0.8) * sc) + unit +
			   '" viewBox="' + n1(-pad) + ' ' + n1(-top - pad) + ' ' + n1(L + 2 * pad) + ' ' + n1(W + top + 2 * pad) + '" font-family=\'' + (o.font || D.FONT).replace(/"/g, '') + '\'' + (o.inter ? ' class="map" data-k="' + n1(k) + '"' : '') + '>');
		s.push('<defs><pattern id="' + hid + '" width="' + n1(hs) + '" height="' + n1(hs) + '" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="' + n1(hs) +
			   '" stroke="#6f6f6f" stroke-width="' + n1(0.16 * k) + '"/></pattern><pattern id="cW' + uid + '" width="' + n1(hs * 0.8) + '" height="' + n1(hs * 0.8) +
			   '" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)"><line x1="0" y1="0" x2="0" y2="' + n1(hs * 0.8) + '" stroke="#9a9a9a" stroke-width="' + n1(0.12 * k) + '"/></pattern>' + texPattern(o, 'tx' + uid) + '</defs>');
		o.texFill = (o.tex && o.tex.url) ? 'url(#tx' + uid + ')' : '';
		if (strip) {
			var ty = -2.1 * k;
			s.push('<text class="st" x="0" y="' + n1(ty) + '" font-size="' + n1(7.5 * U) + '" fill="#222">' + (sh.rem ? 'остаток ' : '') + P.dim(L) + ' × ' + P.dim(W) + ' мм</text>');
			if (mat.cfg.grain) {
				var ax0 = L * 0.62, ax1 = L, ay = -2.9 * k, ah = 1.0 * k, al = 2.4 * k;
				s.push('<text class="st" x="' + n1(ax0 - 1.5 * k) + '" y="' + n1(ty) + '" font-size="' + n1(7.5 * U) + '" text-anchor="end" fill="#222">направление текстуры</text>');
				s.push('<g class="st"><line x1="' + n1(ax0 + al * 0.8) + '" y1="' + n1(ay) + '" x2="' + n1(ax1 - al * 0.8) + '" y2="' + n1(ay) + '" stroke="#000" stroke-width="' + n1(0.3 * k) + '"/>');
				s.push('<polygon points="' + n1(ax0) + ',' + n1(ay) + ' ' + n1(ax0 + al) + ',' + n1(ay - ah) + ' ' + n1(ax0 + al) + ',' + n1(ay + ah) + '" fill="#000"/>');
				s.push('<polygon points="' + n1(ax1) + ',' + n1(ay) + ' ' + n1(ax1 - al) + ',' + n1(ay - ah) + ' ' + n1(ax1 - al) + ',' + n1(ay + ah) + '" fill="#000"/></g>');
			} else {
				s.push('<text class="st" x="' + n1(L) + '" y="' + n1(ty) + '" font-size="' + n1(7.5 * U) + '" text-anchor="end" fill="#222">без текстуры, детали можно поворачивать</text>');
			}
		}
		s.push('<rect class="sheet" x="0" y="0" width="' + n1(L) + '" height="' + n1(W) + '" fill="#fff" stroke="#000" stroke-width="' + n1(0.5 * k) + '"/>');

		/* обрезки: штриховка, размер на белой подложке */
		var cc = (st.work.params && st.work.params.cut) || {};
		if (o.offcuts !== 0 && cc.hatch !== 0) {
			var offs = P.offcuts(st, mat, sh, st.set.offMin > 0 ? st.set.offMin : 50);
			s.push('<g class="offs">');
			for (i = 0; i < offs.length; i++) {
				var of = offs[i], ox = m + of.x, oy = m + of.y;
				s.push('<rect x="' + n1(ox) + '" y="' + n1(oy) + '" width="' + n1(of.w) + '" height="' + n1(of.h) + '" fill="url(#' + hid + ')" stroke="#777" stroke-width="' + n1(0.15 * k) + '"/>');
				if (o.labels === 0) continue;
				var ot = P.dim(Math.floor(of.w + 0.01)) + '×' + P.dim(Math.floor(of.h + 0.01));
				var fz = 6.5, tw = textW(ot) * fz * U, th = fz * 1.3 * U;
				var horiz = tw <= of.w - 1.2 * k && th <= of.h - 0.6 * k, vert = !horiz && tw <= of.h - 1.2 * k && th <= of.w - 0.6 * k;
				if (horiz || vert) {
					s.push('<g transform="translate(' + n1(ox + of.w / 2) + ',' + n1(oy + of.h / 2) + ')' + (vert ? ' rotate(-90)' : '') + '"><rect x="' + n1(-tw / 2 - 0.6 * k) + '" y="' + n1(-th / 2) + '" width="' + n1(tw + 1.2 * k) +
						   '" height="' + n1(th) + '" fill="#fff"/><text x="0" y="' + n1(fz * U * 0.35) + '" font-size="' + n1(fz * U) + '" text-anchor="middle" fill="#333">' + ot + '</text></g>');
				}
			}
			s.push('</g>');
		}
		/* детали. Контур — тонкая линия целиком внутри детали: у соседних линии не сливаются */
		var po = { uid: uid, color: o.color, bw: o.bw, labels: o.labels, holes: o.holes, texFill: o.texFill };
		for (i = 0; i < sh.recs.length; i++) {
			var rc = sh.recs[i], inner = D.part(st, mat, rc, 0, 0, k, po);
			s.push('<g' + (o.inter ? ' class="pt" data-i="' + i + '"' : '') + ' transform="translate(' + n1(m + rc.x) + ',' + n1(m + rc.y) + ')">' + inner + '</g>');
		}
		/* линии резов и их номера — в порядке работы на станке */
		if (o.cuts !== 0 && cc.showCuts !== 0 && sh.cuts && sh.cuts.length) {
			var kf = st.work.params.kerf, lw = Math.max(0.18 * k, Math.min(0.5 * k, kf * 0.9)), r = 1.45 * k;
			s.push('<g class="cuts" pointer-events="none">');
			for (i = 0; i < sh.cuts.length; i++) {
				var ct = sh.cuts[i], cp = ct.at + kf / 2, x1, y1, x2, y2;
				if (ct.dir === 'h') { x1 = m + ct.from; x2 = x1 + ct.len; y1 = y2 = m + cp; } else { y1 = m + ct.from; y2 = y1 + ct.len; x1 = x2 = m + cp; }
				s.push('<line x1="' + n1(x1) + '" y1="' + n1(y1) + '" x2="' + n1(x2) + '" y2="' + n1(y2) + '" stroke="#d13b2f" stroke-width="' + n1(lw) + '" stroke-dasharray="' + n1(2.2 * k) + ' ' + n1(1.4 * k) + '" opacity="0.85"/>');
			}
			if (cc.showCutNo !== 0) for (i = 0; i < sh.cuts.length; i++) {
				var cn = sh.cuts[i], bx = cn.dir === 'h' ? m + cn.from : m + cn.at + kf / 2, by = cn.dir === 'h' ? m + cn.at + kf / 2 : m + cn.from, lab = String(i + 1);
				s.push('<circle cx="' + n1(bx) + '" cy="' + n1(by) + '" r="' + n1(r * (lab.length > 2 ? 1.25 : 1)) + '" fill="#d13b2f" stroke="#fff" stroke-width="' + n1(0.15 * k) + '"/><text x="' + n1(bx) + '" y="' + n1(by + r * 0.38) + '" font-size="' + n1(r * (lab.length > 2 ? 0.95 : 1.15)) + '" font-weight="700" text-anchor="middle" fill="#fff">' + lab + '</text>');
			}
			s.push('</g>');
		}
		if (o.inter) s.push('<g class="over"></g>');
		s.push('</svg>');
		return s.join('\n');
	};
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));
