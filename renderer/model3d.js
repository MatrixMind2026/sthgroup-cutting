/* Просмотр модели .b3d в 3D (three.js): детали выдавливаются из контуров на толщину и ставятся матрицей Базиса.
   Мышь: левая — вращение, правая/средняя или Shift+левая — сдвиг, колесо — масштаб, щелчок — выбор детали. */
(function (root) {
  'use strict';
  var THREE = root.THREE;
  var R = null; // один WebGL-контекст на всё приложение, холст переносится между показами

  function hashColor(s) {
    var h = 0; s = String(s || ''); for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    var pal = [0xd9c7a6, 0xc9b28c, 0xe8e2d6, 0xb8a58a, 0xa9b4bf, 0xd6d0c4, 0xc2a37a, 0x9fb0a0, 0xd8b98f, 0xbfc6cc, 0xe0cfb4, 0x8f9aa6];
    return pal[h % pal.length];
  }

  function init() {
    if (R) return R;
    var renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(2, root.devicePixelRatio || 1));
    renderer.setClearColor(0xf3f1ec, 1);
    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(35, 1, 10, 200000);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8a80, 1.1));
    var dl = new THREE.DirectionalLight(0xffffff, 1.2); dl.position.set(1, 1.6, 1.2); scene.add(dl);
    var dl2 = new THREE.DirectionalLight(0xffffff, 0.45); dl2.position.set(-1.2, 0.4, -0.8); scene.add(dl2);
    var group = new THREE.Group(); scene.add(group);
    R = {
      renderer: renderer, scene: scene, camera: camera, group: group, meshes: [], hw: null,
      target: new THREE.Vector3(), rad: 3000, theta: Math.PI / 4, phi: Math.PI / 3, explode: 0, xray: false,
      sel: -1, hidden: {}, key: '', onSelect: null, el: null, raf: 0, center: new THREE.Vector3(), size: 1000
    };
    bindMouse(renderer.domElement);
    return R;
  }

  function clearGroup() {
    R.meshes.forEach(function (m) { m.mesh.geometry.dispose(); m.mesh.material.dispose(); m.edges.geometry.dispose(); m.edges.material.dispose(); });
    if (R.hw) { R.hw.geometry.dispose(); R.hw.material.dispose(); }
    while (R.group.children.length) R.group.remove(R.group.children[0]);
    R.meshes = []; R.hw = null; R.sel = -1; R.hidden = {};
  }

  function shapeFrom(loops) {
    var outer = loops[0], sh = new THREE.Shape();
    sh.moveTo(outer[0], outer[1]);
    for (var i = 2; i < outer.length; i += 2) sh.lineTo(outer[i], outer[i + 1]);
    sh.closePath();
    for (var k = 1; k < loops.length; k++) {
      var l = loops[k], hp = new THREE.Path();
      hp.moveTo(l[0], l[1]); for (var j = 2; j < l.length; j += 2) hp.lineTo(l[j], l[j + 1]); hp.closePath();
      sh.holes.push(hp);
    }
    return sh;
  }

  function build(models) {
    clearGroup();
    var box = new THREE.Box3(), hwPts = [];
    models.forEach(function (md, mi) {
      (md.panels || []).forEach(function (p, pi) {
        if (!p.loops || !p.loops.length) return;
        var geo;
        try { geo = new THREE.ExtrudeGeometry(shapeFrom(p.loops), { depth: Math.max(0.5, p.T || 16), bevelEnabled: false, curveSegments: 4 }); }
        catch (e) { return; }
        var M = p.M, m4 = new THREE.Matrix4().set(M[0], M[1], M[2], M[9], M[3], M[4], M[5], M[10], M[6], M[7], M[8], M[11], 0, 0, 0, 1);
        geo.applyMatrix4(m4);
        geo.computeBoundingBox();
        var color = hashColor(p.mat);
        var mat = new THREE.MeshStandardMaterial({ color: color, roughness: 0.85, metalness: 0, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
        var mesh = new THREE.Mesh(geo, mat);
        var edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 20), new THREE.LineBasicMaterial({ color: 0x4a4a44 }));
        var holder = new THREE.Group(); holder.add(mesh); holder.add(edges); R.group.add(holder);
        var c = new THREE.Vector3(); geo.boundingBox.getCenter(c);
        box.union(geo.boundingBox);
        mesh.userData.idx = R.meshes.length;
        R.meshes.push({ mesh: mesh, edges: edges, holder: holder, center: c, color: color, model: mi, panel: pi, data: p });
      });
      (md.hardware || []).forEach(function (h) { hwPts.push(h.p[0], h.p[1], h.p[2]); });
    });
    if (box.isEmpty()) box.set(new THREE.Vector3(-500, -500, -500), new THREE.Vector3(500, 500, 500));
    box.getCenter(R.center); var sz = new THREE.Vector3(); box.getSize(sz); R.size = Math.max(sz.x, sz.y, sz.z, 100);
    if (hwPts.length) {
      var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(hwPts, 3));
      R.hw = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xd0451b, size: Math.max(6, R.size / 180), sizeAttenuation: true }));
      R.hw.visible = false; R.group.add(R.hw);
    }
    applyExplode(); view('iso');
  }

  function applyExplode() {
    R.meshes.forEach(function (m) {
      var d = m.center.clone().sub(R.center).multiplyScalar(R.explode);
      m.holder.position.copy(d);
    });
  }

  function paint() {
    R.meshes.forEach(function (m, i) {
      var on = i === R.sel;
      m.holder.visible = !R.hidden[i];
      m.mesh.material.color.setHex(on ? 0xf07a2a : m.color);
      m.mesh.material.transparent = R.xray && !on; m.mesh.material.opacity = R.xray && !on ? 0.25 : 1;
      m.mesh.material.depthWrite = !(R.xray && !on);
      m.edges.material.color.setHex(on ? 0xa8410c : 0x4a4a44);
    });
  }

  function placeCamera() {
    var c = R.camera, t = R.target;
    c.position.set(t.x + R.rad * Math.sin(R.phi) * Math.sin(R.theta), t.y + R.rad * Math.cos(R.phi), t.z + R.rad * Math.sin(R.phi) * Math.cos(R.theta));
    c.lookAt(t); c.near = Math.max(1, R.rad / 200); c.far = R.rad * 20 + R.size * 10; c.updateProjectionMatrix();
  }
  function view(kind) {
    R.target.copy(R.center);
    R.rad = R.size * 2.2;
    if (kind === 'front') { R.theta = 0; R.phi = Math.PI / 2; }
    else if (kind === 'top') { R.theta = 0; R.phi = 0.0001; }
    else if (kind === 'side') { R.theta = Math.PI / 2; R.phi = Math.PI / 2; }
    else { R.theta = Math.PI / 5; R.phi = Math.PI / 2.6; }
    placeCamera(); draw();
  }

  function resize() {
    if (!R || !R.el) return;
    var w = R.el.clientWidth || 600, h = R.el.clientHeight || 400;
    R.renderer.setSize(w, h, false); R.renderer.domElement.style.width = w + 'px'; R.renderer.domElement.style.height = h + 'px';
    R.camera.aspect = w / h; R.camera.updateProjectionMatrix(); draw();
  }
  function draw() {
    if (!R || R.raf) return;
    R.raf = requestAnimationFrame(function () { R.raf = 0; R.renderer.render(R.scene, R.camera); });
  }

  function bindMouse(cv) {
    var drag = null;
    cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    cv.addEventListener('pointerdown', function (e) {
      cv.setPointerCapture(e.pointerId);
      drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, pan: e.button !== 0 || e.shiftKey };
    });
    cv.addEventListener('pointermove', function (e) {
      if (!drag) return;
      var dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
      if (drag.pan) {
        var k = R.rad * 0.0016, cam = R.camera;
        var right = new THREE.Vector3().setFromMatrixColumn(cam.matrix, 0), up = new THREE.Vector3().setFromMatrixColumn(cam.matrix, 1);
        R.target.addScaledVector(right, -dx * k).addScaledVector(up, dy * k);
      } else {
        R.theta -= dx * 0.008; R.phi = Math.max(0.0001, Math.min(Math.PI - 0.0001, R.phi - dy * 0.008));
      }
      placeCamera(); draw();
    });
    cv.addEventListener('pointerup', function (e) {
      if (drag && Math.abs(e.clientX - drag.sx) + Math.abs(e.clientY - drag.sy) < 4) pick(e);
      drag = null;
    });
    cv.addEventListener('wheel', function (e) {
      e.preventDefault();
      R.rad = Math.max(R.size * 0.05, Math.min(R.size * 20, R.rad * (e.deltaY > 0 ? 1.12 : 1 / 1.12)));
      placeCamera(); draw();
    }, { passive: false });
  }
  function pick(e) {
    var r = R.renderer.domElement.getBoundingClientRect();
    var v = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    var rc = new THREE.Raycaster(); rc.setFromCamera(v, R.camera);
    var list = R.meshes.filter(function (m, i) { return !R.hidden[i]; }).map(function (m) { return m.mesh; });
    var hit = rc.intersectObjects(list, false)[0];
    select(hit ? hit.object.userData.idx : -1, true);
  }
  function select(i, fromView) {
    R.sel = i; paint(); draw();
    if (fromView && R.onSelect) R.onSelect(i, i >= 0 ? R.meshes[i] : null);
  }

  var ro = null;
  /** Показ: el — контейнер, models — [{panels,hardware}], key — меняется при смене моделей (пересборка). */
  function mount(el, models, key, onSelect) {
    if (!THREE) { el.innerHTML = '<div class="empty">Не загрузился модуль 3D (three.js)</div>'; return null; }
    init();
    R.onSelect = onSelect; R.el = el;
    el.appendChild(R.renderer.domElement);
    if (R.key !== key) { R.key = key; build(models); } else { paint(); }
    if (!ro && root.ResizeObserver) ro = new root.ResizeObserver(function () { resize(); });
    if (ro) { ro.disconnect(); ro.observe(el); }
    resize();
    return api;
  }
  var api = {
    mount: mount, view: function (k) { view(k); }, select: function (i) { select(i, false); },
    selected: function () { return R ? R.sel : -1; },
    item: function (i) { return R && R.meshes[i]; },
    count: function () { return R ? R.meshes.length : 0; },
    setExplode: function (k) { R.explode = k; applyExplode(); draw(); },
    getExplode: function () { return R ? R.explode : 0; },
    setXray: function (b) { R.xray = !!b; paint(); draw(); }, getXray: function () { return R ? R.xray : false; },
    setHardware: function (b) { if (R.hw) R.hw.visible = !!b; draw(); }, getHardware: function () { return !!(R && R.hw && R.hw.visible); },
    hide: function (i, b) { if (b) R.hidden[i] = true; else delete R.hidden[i]; paint(); draw(); },
    isHidden: function (i) { return !!(R && R.hidden[i]); },
    showAll: function () { R.hidden = {}; paint(); draw(); },
    focus: function (i) { var m = R.meshes[i]; if (!m) return; m.mesh.geometry.computeBoundingSphere(); R.target.copy(m.center).add(m.holder.position); R.rad = Math.max(R.size * 0.3, m.mesh.geometry.boundingSphere.radius * 4); placeCamera(); draw(); }
  };
  root.Model3D = api;
})(typeof self !== 'undefined' ? self : this);
