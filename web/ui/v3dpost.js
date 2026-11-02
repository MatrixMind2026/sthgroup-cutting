/* STHGroup — качество 3D (общее для раздела «Модель» и файла для заказчика): сглаживание краёв (MSAA
   в отдельном буфере), мягкие тени в углах и стыках (SSAO — затенение по глубине и нормалям экрана),
   и окружение-студия для отражений. Нужен только THREE (r160). */
(function (G) {
	'use strict';
	var BM = G.BM = G.BM || {};
	var P = BM.post3d = {};

	/* студия для отражений: светлая комната с софтбоксами, свёрнутая в PMREM */
	P.studio = function (renderer) {
		var T = G.THREE, env = new T.Scene(), mats = [];
		function box(x, y, z, sx, sy, sz, c, back) { var m = new T.MeshBasicMaterial({ color: c, side: back ? T.BackSide : T.FrontSide }); mats.push(m); var o = new T.Mesh(new T.BoxGeometry(sx, sy, sz), m); o.position.set(x, y, z); env.add(o); }
		box(0, 0, 0, 10, 6, 10, 0x8c9096, true);
		box(0, 2.9, 0, 6, 0.1, 3, 0xffffff); box(-4.9, 1, 1, 0.1, 2.5, 3, 0xd8dde3); box(4.9, 1.2, -1, 0.1, 2, 2, 0xffffff);
		box(0, -2.95, 0, 10, 0.1, 10, 0x55585c); box(0, 1, -4.9, 4, 2, 0.1, 0xc8ccd1); box(0, 1.2, 4.9, 5, 1.6, 0.1, 0xe6e9ec);
		var pm = new T.PMREMGenerator(renderer), tex = pm.fromScene(env, 0.04).texture;
		pm.dispose(); env.traverse(function (o) { if (o.geometry) o.geometry.dispose(); }); mats.forEach(function (m) { m.dispose(); });
		return tex;
	};

	/* Проход «качество»: scene → цвет (MSAA) + нормали/глубина → затенение → размытие → на экран. */
	P.create = function (renderer) {
		var T = G.THREE, w = 1, h = 1, rtC, rtN, dt, rtA, rtB, ready = false;
		var nMat = new T.MeshNormalMaterial({ side: T.DoubleSide });
		var K = [], seed = 7;
		function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
		for (var i = 0; i < 24; i++) { var v = new T.Vector3(rnd() * 2 - 1, rnd() * 2 - 1, rnd()).normalize(), s = i / 24; K.push(v.multiplyScalar(0.25 + 0.75 * (0.1 + 0.9 * s * s))); }
		var vs = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }';
		var aoM = new T.ShaderMaterial({ uniforms: { tD: { value: null }, tN: { value: null }, Pm: { value: new T.Matrix4() }, Pi: { value: new T.Matrix4() }, K: { value: K }, rad: { value: 110 }, res: { value: new T.Vector2() }, ortho: { value: 0 } }, vertexShader: vs,
			fragmentShader: [
				'uniform sampler2D tD, tN; uniform mat4 Pm, Pi; uniform vec3 K[24]; uniform float rad, ortho; uniform vec2 res; varying vec2 vUv;',
				'vec3 vpos(vec2 uv){ float d = texture2D(tD, uv).x; vec4 c = vec4(uv * 2. - 1., d * 2. - 1., 1.); vec4 v = Pi * c; return v.xyz / v.w; }',
				'float rnd(vec2 c){ return fract(sin(dot(c, vec2(12.9898, 78.233))) * 43758.5453); }',
				'void main(){ float d = texture2D(tD, vUv).x; if (d >= 1.) { gl_FragColor = vec4(1.); return; }',
				' vec3 p = vpos(vUv), n = normalize(texture2D(tN, vUv).xyz * 2. - 1.);',
				' vec3 r = normalize(vec3(rnd(vUv * res) * 2. - 1., rnd(vUv * res + 7.) * 2. - 1., 0.));',
				' vec3 t = normalize(r - n * dot(r, n)), b = cross(n, t); mat3 TBN = mat3(t, b, n); float occ = 0.;',
				' for (int i = 0; i < 24; i++) { vec3 s = p + TBN * K[i] * rad; vec4 o = Pm * vec4(s, 1.); o.xy /= o.w; vec2 su = o.xy * .5 + .5;',
				'  float sd = vpos(su).z; float rc = smoothstep(0., 1., rad / max(abs(p.z - sd), 0.001)); occ += (sd >= s.z + 1. ? 1. : 0.) * rc; }',
				' gl_FragColor = vec4(vec3(pow(1. - occ / 24., 1.6)), 1.); }'].join('\n') });
		var blM = new T.ShaderMaterial({ uniforms: { tA: { value: null }, tD: { value: null }, dir: { value: new T.Vector2() } }, vertexShader: vs,
			fragmentShader: 'uniform sampler2D tA, tD; uniform vec2 dir; varying vec2 vUv;\nvoid main(){ float d0 = texture2D(tD, vUv).x, s = 0., w = 0.; for (int i = -4; i <= 4; i++) { vec2 u = vUv + dir * float(i); float dd = abs(texture2D(tD, u).x - d0); float k = exp(-float(i*i) / 8.) * (dd < 0.0005 ? 1. : 0.05); s += texture2D(tA, u).r * k; w += k; } gl_FragColor = vec4(vec3(s / w), 1.); }' });
		var cM = new T.ShaderMaterial({ uniforms: { tC: { value: null }, tA: { value: null }, k: { value: 0.9 } }, vertexShader: vs, transparent: true, depthTest: false, depthWrite: false,
			blending: T.NoBlending,
			fragmentShader: 'uniform sampler2D tC, tA; uniform float k; varying vec2 vUv;\nvoid main(){ vec4 c = texture2D(tC, vUv); float a = texture2D(tA, vUv).r; c.rgb *= mix(1., a, k); gl_FragColor = c;\n#include <colorspace_fragment>\n}' });
		function quad(m) { var sc = new T.Scene(), q = new T.Mesh(new T.PlaneGeometry(2, 2), m); q.frustumCulled = false; sc.add(q); return sc; }
		var sAO = quad(aoM), sBL = quad(blM), sC = quad(cM), oc = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
		function alloc(W, H) {
			if (ready && W === w && H === h) return;
			if (ready) [rtC, rtN, rtA, rtB].forEach(function (r) { r.dispose(); });
			w = W; h = H;
			rtC = new T.WebGLRenderTarget(w, h, { samples: 4, type: T.HalfFloatType });
			dt = new T.DepthTexture(w, h); dt.type = T.UnsignedIntType;
			rtN = new T.WebGLRenderTarget(w, h, { depthTexture: dt, depthBuffer: true });
			rtA = new T.WebGLRenderTarget(Math.max(1, w >> 1), Math.max(1, h >> 1)); rtB = new T.WebGLRenderTarget(Math.max(1, w >> 1), Math.max(1, h >> 1));
			aoM.uniforms.tD.value = dt; aoM.uniforms.tN.value = rtN.texture; aoM.uniforms.res.value.set(w >> 1, h >> 1);
			blM.uniforms.tD.value = dt; cM.uniforms.tC.value = rtC.texture; cM.uniforms.tA.value = rtA.texture;
			ready = true;
		}
		/* skip(o) — что не участвует в затенении (линии, подписи, прозрачное) */
		function render(scene, cam, opt) {
			opt = opt || {};
			var sz = renderer.getDrawingBufferSize(new T.Vector2());
			alloc(sz.x, sz.y);
			var keepClear = renderer.getClearColor(new T.Color()), keepA = renderer.getClearAlpha(), keepBg = scene.background, hidden = [];
			scene.traverse(function (o) { if (!o.visible) return; if (o.isLine || o.isLineSegments || o.isPoints || o.isSprite || (o.isMesh && o.material && (o.material.transparent || o.material.depthWrite === false)) || (opt.skip && opt.skip(o))) { hidden.push(o); o.visible = false; } });
			scene.overrideMaterial = nMat; scene.background = null;
			renderer.setRenderTarget(rtN); renderer.setClearColor(0x8080ff, 1); renderer.clear(); renderer.render(scene, cam);
			scene.overrideMaterial = null; scene.background = keepBg;
			hidden.forEach(function (o) { o.visible = true; });
			cam.updateProjectionMatrix();
			aoM.uniforms.Pm.value.copy(cam.projectionMatrix); aoM.uniforms.Pi.value.copy(cam.projectionMatrixInverse);
			aoM.uniforms.rad.value = opt.rad || 110;
			renderer.setRenderTarget(rtA); renderer.render(sAO, oc);
			blM.uniforms.tA.value = rtA.texture; blM.uniforms.dir.value.set(2 / w, 0); renderer.setRenderTarget(rtB); renderer.render(sBL, oc);
			blM.uniforms.tA.value = rtB.texture; blM.uniforms.dir.value.set(0, 2 / h); renderer.setRenderTarget(rtA); renderer.render(sBL, oc);
			renderer.setRenderTarget(rtC); renderer.setClearColor(keepClear, keepA); renderer.clear(); renderer.render(scene, cam);
			renderer.setRenderTarget(null); renderer.clear(); renderer.render(sC, oc);
		}
		return { render: render, dispose: function () { if (ready) [rtC, rtN, rtA, rtB].forEach(function (r) { r.dispose(); }); } };
	};
})(typeof window !== 'undefined' ? window : this);
