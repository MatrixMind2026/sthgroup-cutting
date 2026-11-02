/* STHGroup — 3D-файл модели, который сохраняет сам БАЗИС (скрипт выгрузки 1.5, команда
   ExportModelMeshFormat → «<модель> — 3D.glb»). Формат — glTF 1.0 в двоичном виде (так пишет
   библиотека assimp внутри БАЗИСа): узлы с именами объектов БАЗИСа (блоки, панели, фурнитура),
   сетки треугольников, материалы с цветом или текстурой. Координат текстур нет — развёртку
   делает окно (v3d). Здесь — только чтение и сопоставление с деталями проекта; работает и в Node.

   Корень сцены — узел с поворотом осей и узел «Model»: сетки внутри записаны с Y вверх, поворот
   корня возвращает их в оси БАЗИСа (Z вверх), как у панелей проекта, — модель ложится точно на них.
   Одинаковые имена assimp различает приставками «_node», «_node_3» — они убираются. */
(function (G) {
	'use strict';
	var BM = G.BM = G.BM || {};
	var GL = BM.glb = {};

	function utf8(u8) {
		if (typeof TextDecoder !== 'undefined') return new TextDecoder('utf-8').decode(u8);
		return Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength).toString('utf8');
	}
	var NCOMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

	/* Разбор файла. ab — ArrayBuffer. Возвращает { nodes, meshes, mats, roots, tris } или бросает ошибку с понятным текстом. */
	GL.parse = function (ab) {
		var dv = new DataView(ab);
		if (ab.byteLength < 20 || dv.getUint32(0, true) !== 0x46546C67) throw new Error('это не 3D-файл .glb');
		var ver = dv.getUint32(4, true);
		var json, body, binLen = 0;
		if (ver === 1) {
			var cl = dv.getUint32(12, true);
			json = JSON.parse(utf8(new Uint8Array(ab, 20, cl)));
			body = (20 + cl + 3) & ~3;                        // двоичная часть выровнена по 4 байтам
			binLen = ab.byteLength - body;
		} else if (ver === 2) {
			var jl = dv.getUint32(12, true);
			json = JSON.parse(utf8(new Uint8Array(ab, 20, jl)));
			body = 20 + jl + 8;
			binLen = dv.getUint32(20 + jl, true);
		} else throw new Error('неизвестная версия .glb: ' + ver);
		var v2 = ver === 2;
		/* в glTF 1.0 всё — словари с именами, в 2.0 — массивы; приводим к одному виду */
		function arr(x) { if (!x) return []; if (Array.isArray(x)) return x.map(function (o, i) { return { id: i, o: o }; }); return Object.keys(x).map(function (k) { return { id: k, o: x[k] }; }); }
		function index(list) { var m = {}; list.forEach(function (e, i) { m[e.id] = i; }); return m; }
		var accL = arr(json.accessors), bvL = arr(json.bufferViews), meshL = arr(json.meshes), nodeL = arr(json.nodes), matL = arr(json.materials), texL = arr(json.textures), imgL = arr(json.images);
		var accI = index(accL), bvI = index(bvL), nodeI = index(nodeL), texI = index(texL), imgI = index(imgL);
		function acc(id) {
			var a = accL[accI[id]].o, v = bvL[bvI[a.bufferView]].o, off = body + (v.byteOffset || 0) + (a.byteOffset || 0), n = a.count * (NCOMP[a.type] || 1);
			if (off + n * 4 > ab.byteLength + 2 && a.componentType !== 5123 && a.componentType !== 5121) throw new Error('файл обрезан');
			if (a.componentType === 5126) return new Float32Array(ab.slice(off, off + n * 4));
			if (a.componentType === 5123) return new Uint16Array(ab.slice(off, off + n * 2));
			if (a.componentType === 5125) return new Uint32Array(ab.slice(off, off + n * 4));
			if (a.componentType === 5121) return new Uint8Array(ab.slice(off, off + n));
			throw new Error('неизвестный тип данных ' + a.componentType);
		}
		var mats = {}, matNames = [];
		matL.forEach(function (e) {
			var o = e.o, name = o.name || String(e.id), r = { name: name, color: [0.8, 0.8, 0.8], tex: '' };
			var d = v2 ? (o.pbrMetallicRoughness || {}).baseColorFactor : (o.values || {}).diffuse;
			var tx = v2 ? ((o.pbrMetallicRoughness || {}).baseColorTexture || {}).index : (typeof d === 'string' ? d : null);
			if (Array.isArray(d)) { var k = Math.max(d[0], d[1], d[2]) > 1.001 ? 255 : 1; r.color = [d[0] / k, d[1] / k, d[2] / k]; }   // БАЗИС пишет цвет в 0…255
			if (tx !== null && tx !== undefined && texL[texI[tx]]) { var img = imgL[imgI[texL[texI[tx]].o.source]]; if (img) r.tex = String(img.o.uri || ''); }
			mats[e.id] = r; matNames.push(e.id);
		});
		var meshes = [], meshI = {}, tris = 0;
		meshL.forEach(function (e, i) {
			meshI[e.id] = i;
			var prims = (e.o.primitives || []).filter(function (p) { return (p.mode === undefined || p.mode === 4) && p.attributes && p.attributes.POSITION !== undefined; }).map(function (p) {
				var idx = p.indices !== undefined ? acc(p.indices) : null, pos = acc(p.attributes.POSITION);
				tris += (idx ? idx.length : pos.length / 3) / 3;
				return { pos: pos, nrm: p.attributes.NORMAL !== undefined ? acc(p.attributes.NORMAL) : null, idx: idx, mat: p.material !== undefined ? (v2 ? matL[p.material].id : p.material) : '' };
			});
			meshes.push({ prims: prims });
		});
		var nodes = nodeL.map(function (e) {
			var o = e.o, m = o.matrix ? o.matrix.slice() : trs(o);
			return { id: e.id, name: o.name !== undefined ? String(o.name) : String(e.id), m: m, kids: [], meshes: (o.meshes !== undefined ? (Array.isArray(o.meshes) ? o.meshes : [o.meshes]) : (o.mesh !== undefined ? [o.mesh] : [])).map(function (x) { return v2 ? x : meshI[x]; }), up: -1 };
		});
		nodeL.forEach(function (e, i) { (e.o.children || []).forEach(function (c) { var k = v2 ? c : nodeI[c]; if (nodes[k]) { nodes[i].kids.push(k); nodes[k].up = i; } }); });
		var sc = json.scenes ? (v2 ? json.scenes[json.scene || 0] : json.scenes[json.scene] || json.scenes[Object.keys(json.scenes)[0]]) : null;
		var roots = sc ? sc.nodes.map(function (x) { return v2 ? x : nodeI[x]; }) : nodes.map(function (n, i) { return n.up < 0 ? i : -1; }).filter(function (i) { return i >= 0; });
		return { ver: ver, nodes: nodes, meshes: meshes, mats: mats, roots: roots, tris: tris, binLen: binLen };
	};
	function trs(o) {
		var t = o.translation || [0, 0, 0], q = o.rotation || [0, 0, 0, 1], s = o.scale || [1, 1, 1];
		var x = q[0], y = q[1], z = q[2], w = q[3];
		return [(1 - 2 * (y * y + z * z)) * s[0], 2 * (x * y + z * w) * s[0], 2 * (x * z - y * w) * s[0], 0,
			2 * (x * y - z * w) * s[1], (1 - 2 * (x * x + z * z)) * s[1], 2 * (y * z + x * w) * s[1], 0,
			2 * (x * z + y * w) * s[2], 2 * (y * z - x * w) * s[2], (1 - 2 * (x * x + y * y)) * s[2], 0, t[0], t[1], t[2], 1];
	}
	function mul(a, b) {            // матрицы 4×4 по столбцам
		var r = new Array(16);
		for (var c = 0; c < 4; c++) for (var rr = 0; rr < 4; rr++) r[c * 4 + rr] = a[rr] * b[c * 4] + a[4 + rr] * b[c * 4 + 1] + a[8 + rr] * b[c * 4 + 2] + a[12 + rr] * b[c * 4 + 3];
		return r;
	}
	GL.mul = mul;
	var ID = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
	GL.apply = function (m, x, y, z) { return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]]; };

	/* служебные узлы: корень с поворотом осей, «Model», безымянные держатели сеток (node, node_12) */
	function isHolder(n) { return /^node(_\d+)?$/.test(n.name) || n.name === '' || /^mesh(_\d+)?$/.test(n.name); }
	function isRootName(n) { return n.name === 'Model' || n.name === 'RootNode' || n.name === 'Scene'; }

	/* Объекты модели: узлы с именами (блоки, панели, фурнитура). У каждого — матрица в осях БАЗИСа (w),
	   свои сетки (geo — номера узлов-держателей с их матрицами) и габарит в осях БАЗИСа.
	   Возвращает { objs: [{ n, name, up, kids, geo: [{ node, m }], box }], top: [номера объектов верхнего уровня] }. */
	GL.objects = function (g) {
		var objs = [], top = [];
		function boxOf(mesh, m, b) {
			for (var p = 0; p < mesh.prims.length; p++) {
				var pos = mesh.prims[p].pos;
				for (var i = 0; i + 2 < pos.length; i += 3) {
					var v = GL.apply(m, pos[i], pos[i + 1], pos[i + 2]);
					for (var k = 0; k < 3; k++) { if (v[k] < b.min[k]) b.min[k] = v[k]; if (v[k] > b.max[k]) b.max[k] = v[k]; }
				}
			}
		}
		/* walk(узел, матрица родителя в осях БАЗИСа, номер объекта-владельца) */
		function walk(i, pm, owner, rootLevel) {
			var n = g.nodes[i];
			var m = mul(pm, n.m);
			if (rootLevel && (isRootName(n) || (isHolder(n) && n.kids.length && !n.meshes.length))) {
				/* корень и «Model»: объектами не считаются; поворот корня возвращает оси БАЗИСа (Z вверх) */
				for (var c = 0; c < n.kids.length; c++) walk(n.kids[c], m, owner, isHolder(n) || isRootName(n));
				return;
			}
			var me = owner;
			if (!isHolder(n)) {
				me = objs.length;
				objs.push({ i: me, n: i, name: n.name.replace(/_node(_\d+)?$/, ''), up: owner, kids: [], geo: [], box: { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }, w: m });
				if (owner >= 0) objs[owner].kids.push(me); else top.push(me);
			}
			if (n.meshes.length && me >= 0) for (var k = 0; k < n.meshes.length; k++) if (g.meshes[n.meshes[k]]) { objs[me].geo.push({ mesh: n.meshes[k], m: m }); boxOf(g.meshes[n.meshes[k]], m, objs[me].box); }
			for (var c2 = 0; c2 < n.kids.length; c2++) walk(n.kids[c2], m, me, false);
		}
		for (var r = 0; r < g.roots.length; r++) walk(g.roots[r], ID, -1, true);
		/* габарит объекта — с вложенными */
		for (var o = objs.length - 1; o >= 0; o--) {
			var ob = objs[o];
			ob.own = ob.box.min[0] <= ob.box.max[0];
			for (var q = 0; q < ob.kids.length; q++) {
				var kb = objs[ob.kids[q]].box;
				for (var a = 0; a < 3; a++) { if (kb.min[a] < ob.box.min[a]) ob.box.min[a] = kb.min[a]; if (kb.max[a] > ob.box.max[a]) ob.box.max[a] = kb.max[a]; }
			}
		}
		return { objs: objs, top: top };
	};

	/* Сопоставление объектов 3D-файла с панелями проекта: по габариту (±1,5 мм) и, если совпали
	   несколько, по имени. sc — сцена BM.m3d.build. Возвращает { byObj: { объект: панель }, byItem: { панель: объект }, n }. */
	GL.match = function (O, sc) {
		var byObj = {}, byItem = {}, grid = {}, n = 0, T = 1.5;
		function key(c) { return Math.round(c[0] / 20) + ',' + Math.round(c[1] / 20) + ',' + Math.round(c[2] / 20); }
		sc.items.forEach(function (t) {
			var c = [(t.box.min[0] + t.box.max[0]) / 2, (t.box.min[1] + t.box.max[1]) / 2, (t.box.min[2] + t.box.max[2]) / 2];
			(grid[key(c)] = grid[key(c)] || []).push(t);
		});
		function norm(s) { return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim(); }
		O.objs.forEach(function (o) {
			if (!o.own || o.kids.length) return;              // панель — лист дерева со своей сеткой
			var b = o.box, c = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2], best = null, bn = 0;
			for (var dx = -1; dx <= 1; dx++) for (var dy = -1; dy <= 1; dy++) for (var dz = -1; dz <= 1; dz++) {
				var k = (Math.round(c[0] / 20) + dx) + ',' + (Math.round(c[1] / 20) + dy) + ',' + (Math.round(c[2] / 20) + dz), L = grid[k] || [];
				for (var i = 0; i < L.length; i++) {
					var t = L[i], ok = true;
					if (byItem[t.i] !== undefined) continue;
					for (var a = 0; a < 3 && ok; a++) if (Math.abs(t.box.min[a] - b.min[a]) > T || Math.abs(t.box.max[a] - b.max[a]) > T) ok = false;
					if (!ok) continue;
					var score = norm(t.name) === norm(o.name) ? 2 : 1;
					if (score > bn) { bn = score; best = t; }
				}
			}
			if (best) { byObj[o.i] = best.i; byItem[best.i] = o.i; n++; }
		});
		return { byObj: byObj, byItem: byItem, n: n };
	};

	/* С чем двигается объект без своей панели (фурнитура, профиль): с панелью своего блока, рядом с
	   которой (±40 мм) стоит, — ручка открывается с фасадом; иначе — со средним сдвигом панелей блока.
	   Возвращает [{ a: панель | -1, grp: [панели] }] по номерам объектов. */
	GL.anchors = function (O, Mt, sc) {
		var out = [], inObj = [];
		/* панели внутри каждого объекта (с вложенными) */
		for (var i = O.objs.length - 1; i >= 0; i--) {
			var L = Mt.byObj[i] !== undefined ? [Mt.byObj[i]] : [];
			O.objs[i].kids.forEach(function (k) { L = L.concat(inObj[k]); });
			inObj[i] = L;
		}
		O.objs.forEach(function (o, i) {
			var r = { a: -1, grp: [] };
			if (Mt.byObj[i] !== undefined) { r.a = Mt.byObj[i]; out.push(r); return; }
			var b = o.box, c = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2];
			for (var u = o.up; u >= 0; u = O.objs[u].up) {
				var L = inObj[u];
				if (!L.length) continue;
				if (!r.grp.length) r.grp = L;
				var best = -1, bd = Infinity;
				for (var k = 0; k < L.length; k++) {
					var t = sc.items[L[k]], T = 40;
					if (c[0] < t.box.min[0] - T || c[0] > t.box.max[0] + T || c[1] < t.box.min[1] - T || c[1] > t.box.max[1] + T || c[2] < t.box.min[2] - T || c[2] > t.box.max[2] + T) continue;
					var d = Math.abs(c[0] - t.c[0]) + Math.abs(c[1] - t.c[1]) + Math.abs(c[2] - t.c[2]);
					if (d < bd) { bd = d; best = L[k]; }
				}
				if (best >= 0) { r.a = best; break; }
				if (L.length) break;
			}
			out.push(r);
		});
		return out;
	};

	/* Имя объекта в 3D-файле — имя и артикул БАЗИСа без разделителя («Петля 110°71B3550»). Артикул
	   отделяется по списку артикулов из выгрузки проекта. */
	GL.splitName = function (name, arts) {
		for (var i = 0; i < arts.length; i++) { var a = arts[i]; if (a.length >= 3 && name.length > a.length && name.substring(name.length - a.length) === a) return { name: name.substring(0, name.length - a.length).trim(), art: a }; }
		return { name: name, art: '' };
	};
})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : global));
