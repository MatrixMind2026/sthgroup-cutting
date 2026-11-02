/* STHGroup — DXF листа раскроя (формат R12, читают все CAM-программы).

   Начало координат — левый нижний угол листа, Y вверх, единицы — миллиметры.
   Контуры деталей — замкнутые полилинии с настоящими дугами. Что и на какие
   слои выводить, задаёт профиль выгрузки (у каждого подрядчика свой).

   Деталь лежит той пластью вверх, как на карте раскроя: в нестинге — стороной
   с присадкой вверх. Отверстия видимой пласти и сквозные идут в файл листа;
   отверстия обратной пласти и торцевые — отдельным списком. */
(function (G) {
	'use strict';
	var BM = G.BM = G.BM || {};
	var O = BM.out = BM.out || {};
	var P = BM.project, geom = BM.geom;

	function f3(v) { var s = (Math.round(v * 1000) / 1000).toFixed(3); return s.replace(/\.?0+$/, '') || '0'; }
	function layerName(s) { return String(s || '0').replace(/[^A-Za-z0-9_\-$]/g, '_').substring(0, 31) || '0'; }
	function dn(v) { return String(Math.round(v * 10) / 10).replace('.', '_'); }

	function Dxf() { this.ent = []; this.layers = {}; this.order = []; }
	Dxf.prototype.layer = function (name, color) { name = layerName(name); if (!this.layers[name]) { this.layers[name] = color || 7; this.order.push(name); } return name; };
	Dxf.prototype.poly = function (layer, verts, closed) {
		var e = ['0', 'POLYLINE', '8', layer, '66', '1', '70', closed ? '1' : '0'];
		for (var i = 0; i < verts.length; i++) {
			e.push('0', 'VERTEX', '8', layer, '10', f3(verts[i][0]), '20', f3(verts[i][1]));
			if (verts[i][2] && Math.abs(verts[i][2]) > 1e-9) e.push('42', String(Math.round(verts[i][2] * 1e6) / 1e6));
		}
		e.push('0', 'SEQEND', '8', layer);
		this.ent.push(e.join('\r\n'));
	};
	Dxf.prototype.circle = function (layer, x, y, r) { this.ent.push(['0', 'CIRCLE', '8', layer, '10', f3(x), '20', f3(y), '40', f3(r)].join('\r\n')); };
	Dxf.prototype.text = function (layer, x, y, h, txt, rot) {
		var e = ['0', 'TEXT', '8', layer, '10', f3(x), '20', f3(y), '40', f3(h), '1', String(txt).replace(/[\r\n]+/g, ' ')];
		if (rot) e.push('50', f3(rot));
		e.push('72', '1', '73', '2', '11', f3(x), '21', f3(y));               // по центру точки
		this.ent.push(e.join('\r\n'));
	};
	Dxf.prototype.out = function () {
		var s = ['0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1009', '0', 'ENDSEC',
				 '0', 'SECTION', '2', 'TABLES',
				 '0', 'TABLE', '2', 'LTYPE', '70', '1', '0', 'LTYPE', '2', 'CONTINUOUS', '70', '64', '3', 'Solid line', '72', '65', '73', '0', '40', '0.0', '0', 'ENDTAB',
				 '0', 'TABLE', '2', 'LAYER', '70', String(this.order.length + 1), '0', 'LAYER', '2', '0', '70', '0', '62', '7', '6', 'CONTINUOUS'];
		for (var i = 0; i < this.order.length; i++) s.push('0', 'LAYER', '2', this.order[i], '70', '0', '62', String(this.layers[this.order[i]]), '6', 'CONTINUOUS');
		s.push('0', 'ENDTAB', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES');
		return s.join('\r\n') + '\r\n' + (this.ent.length ? this.ent.join('\r\n') + '\r\n' : '') + ['0', 'ENDSEC', '0', 'EOF'].join('\r\n') + '\r\n';
	};

	/* Элементы контура в рамке детали → вершины DXF на листе. */
	function verts(els, t, rc, ox, oy, W, arcs) {
		var out = [], i;
		function f(p) { var r = geom.rotPt(p, t.L, t.W, rc.q); return [ox + r[0], W - (oy + r[1])]; }
		if (!arcs) {
			var pts = geom.elsPts(els);
			for (i = 0; i < pts.length; i++) out.push(f(pts[i]));
			return out;
		}
		for (i = 0; i < els.length; i++) { var a = f(els[i].a); out.push([a[0], a[1], -(els[i].g || 0)]); }      // поворот знак дуги не меняет, отражение по Y — меняет
		return out;
	}

	/* DXF одного листа. Возвращает { text, back: [...] } — back: отверстия обратной пласти и торцевые. */
	O.dxfSheet = function (st, mat, sh, si, prof) {
		var d = new Dxf(), m = st.work.params.margin, i, j, back = [];
		var LS = prof.useSheet ? d.layer(prof.sheet, 8) : null, LO = d.layer(prof.outer, 7), LI = prof.useInner ? d.layer(prof.inner, 1) : null, LT = prof.useLabel ? d.layer(prof.label, 3) : null;
		if (LS) {
			d.poly(LS, [[0, 0], [sh.L, 0], [sh.L, sh.W], [0, sh.W]], true);
			if (prof.margin && m > 0) d.poly(LS, [[m, m], [sh.L - m, m], [sh.L - m, sh.W - m], [m, sh.W - m]], true);
		}
		for (i = 0; i < sh.recs.length; i++) {
			var rc = sh.recs[i], t = st.typeBy[rc.t];
			if (!t) continue;
			var sp = P.shapeFor(st, t, mat), fl = false, A = rc.ba || 0, ox = m + rc.x + A, oy = m + rc.y + A;
			var pf = function (p) { var r = geom.rotPt(p, t.L, t.W, rc.q); return [ox + r[0], sh.W - (oy + r[1])]; };
			var mir = function (x) { return fl ? t.L - x : x; };
			if (A > 0) d.poly(d.layer(prof.outer + '_BLANK', 5), [[m + rc.x, sh.W - (m + rc.y)], [m + rc.x + rc.a, sh.W - (m + rc.y)], [m + rc.x + rc.a, sh.W - (m + rc.y + rc.b)], [m + rc.x, sh.W - (m + rc.y + rc.b)]], true);
			d.poly(LO, verts(sp.outer, t, rc, ox, oy, sh.W, prof.arcs), true);
			if (LI) for (j = 0; j < sp.inner.length; j++) d.poly(LI, verts(sp.inner[j], t, rc, ox, oy, sh.W, prof.arcs), true);
			if (prof.useDrill && t.holes) {
				var up = (fl ? t.holes.bot : t.holes.top), dn2 = (fl ? t.holes.top : t.holes.bot);
				for (j = 0; j < up.length; j++) { var hp = pf([mir(up[j].x), up[j].y]); d.circle(d.layer(prof.drillByDia ? prof.drill + '_D' + dn(up[j].d) + '_Z' + dn(up[j].dep) : prof.drill, 1), hp[0], hp[1], up[j].d / 2); }
				for (j = 0; j < t.holes.thr.length; j++) { var tp = pf([mir(t.holes.thr[j].x), t.holes.thr[j].y]); d.circle(d.layer(prof.drillByDia ? prof.drill + '_D' + dn(t.holes.thr[j].d) + '_THRU' : prof.drill, 1), tp[0], tp[1], t.holes.thr[j].d / 2); }
				for (j = 0; j < dn2.length; j++) back.push({ sheet: si + 1, pos: t.pos, des: t.des, name: t.name, kind: 'обратная пласть', x: dn2[j].x, y: dn2[j].y, d: dn2[j].d, dep: dn2[j].dep, fast: dn2[j].fast || '' });
				if (t.holes.edge) back.push({ sheet: si + 1, pos: t.pos, des: t.des, name: t.name, kind: 'в торец, шт.: ' + t.holes.edge, x: '', y: '', d: '', dep: '', fast: '' });
			}
			if (prof.useGroove) for (j = 0; j < t.cuts.length; j++) {
				var ct = t.cuts[j], ce = fl ? geom.mapEls(ct.els, function (p) { return [t.L - p[0], p[1]]; }, true) : ct.els;
				var gl = d.layer(prof.groove + ((ct.w > 0 && ct.d > 0) ? '_W' + dn(ct.w) + '_Z' + dn(ct.d) : ''), 4), vv = verts(ce, t, rc, ox, oy, sh.W, prof.arcs);
				if (ce.length) { var last = pf(ce[ce.length - 1].b); vv.push([last[0], last[1]]); }
				d.poly(gl, vv, false);
			}
			if (LT) {
				var txt = prof.labelWhat === 'pos' ? t.pos : prof.labelWhat === 'posdes' ? P.main(t) : prof.labelWhat === 'name' ? t.name : (t.des || t.pos);
				if (txt) {
					var cx = m + rc.x + rc.a / 2, cy = m + rc.y + rc.b / 2, tall = rc.b > rc.a * 1.3;
					var h = Math.max(3, Math.min(prof.textH > 0 ? prof.textH : 20, Math.min(rc.a, rc.b) / 3, (tall ? rc.b : rc.a) / Math.max(2, String(txt).length) * 1.4));
					d.text(LT, cx, sh.W - cy, h, txt, tall ? 90 : 0);
				}
			}
		}
		return { text: d.out(), back: back };
	};

	function fileSafe(s) { return String(s).replace(/[\\\/:\*\?"<>\|]+/g, '_').replace(/\s+/g, ' ').replace(/^[ .]+|[ .]+$/g, '').substring(0, 80) || 'лист'; }
	O.fileSafe = fileSafe;

	/* Все листы проекта: [{ name, data: Uint8Array }]; последним — список обратной стороны (CSV), если есть. */
	O.dxfAll = function (st, prof) {
		var files = [], back = [], i, j, enc = prof.enc === 'utf8' ? BM.utf8 : BM.cp1251;
		for (i = 0; i < st.mats.length; i++) {
			var mat = st.mats[i], lay = st.work.layout[mat.key];
			if (!mat.cfg.on || !lay) continue;
			for (j = 0; j < lay.sheets.length; j++) {
				var r = O.dxfSheet(st, mat, lay.sheets[j], j, prof);
				files.push({ name: fileSafe(P.matTitle(mat)) + '_лист' + (j + 1 < 10 ? '0' : '') + (j + 1) + '.dxf', data: enc(r.text) });
				for (var q = 0; q < r.back.length; q++) { r.back[q].mat = P.matTitle(mat); back.push(r.back[q]); }
			}
		}
		if (back.length) {
			var rows = ['Материал;Лист;Поз.;Обозначение;Название;Где;X от угла детали, мм;Y от угла детали, мм;Диаметр, мм;Глубина, мм;Крепёж'];
			var c = function (v) { v = (typeof v === 'number') ? String(v).replace('.', ',') : String(v === null || v === undefined ? '' : v); return /[;"]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
			for (i = 0; i < back.length; i++) { var b = back[i]; rows.push([c(b.mat), b.sheet, c(b.pos), c(b.des), c(b.name), c(b.kind), c(b.x), c(b.y), c(b.d), c(b.dep), c(b.fast)].join(';')); }
			files.push({ name: 'Присадка — обратная сторона и торцы.csv', data: BM.utf8(String.fromCharCode(0xFEFF) + rows.join('\r\n') + '\r\n') });
		}
		return files;
	};
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this));
