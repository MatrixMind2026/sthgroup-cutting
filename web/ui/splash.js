/* STHGroup — заставка при запуске: «куб внутри названия».
   Каркас куба чертится линиями, вращается, останавливается и встаёт на место буквы «o» в слове
   Reborn; остальные буквы выезжают из-за него в обе стороны, раскалённые, и остывают. Около четырёх
   секунд; щелчок или любая клавиша — пропустить. Фон — по теме программы.
   Вместе с заставкой звучит короткий аккорд. Играет его сама программа (окну без щелчка звук
   не разрешён): заставка просит «играй», когда началась, и «стоп», если её пропустили.
   Звук выключается в настройках («Оформление → Звук при запуске»).
   Заставки нет, если анимации выключены в настройках или в самой Windows.
   Свечение линий: все линии кадра рисуются на отдельном слое, а слой кладётся на картинку трижды —
   сильно размытым, слегка размытым и резким (одно размытие на слой вместо размытия каждой линии).
   Если компьютер не успевает, размытие отключается само. */
(function () {
	'use strict';
	var el = document.getElementById('splash');
	var S = window.Splash = { done: true, skip: function () { } };
	if (!el) return;
	el.remove(); return;          // STHGroup: заставка BazisReborn (название с кубом) не показывается
	var off = document.documentElement.classList.contains('noanim') || /[?&]splash=0\b/.test(location.search);
	try { off = off || window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { /* нет matchMedia — играем */ }
	var cv = document.getElementById('splashCv'), cx = cv && cv.getContext ? cv.getContext('2d') : null;
	if (off || !cx) { el.remove(); return; }

	var W = 960, H = 540, T_END = 4.3, FADE = 260;
	var light = document.documentElement.dataset.theme !== 'dark';
	var FONT = '"Segoe UI", Inter, system-ui, Arial, sans-serif', NAME = 'STHGroup';
	var K = 1, OX = 0, OY = 0, X0 = 0, X1 = W, Y0 = 0, Y1 = H, blurOn = true;

	function clamp(x) { return x < 0 ? 0 : (x > 1 ? 1 : x); }
	function seg(t, a, b) { return clamp((t - a) / (b - a)); }
	function eo(x) { return 1 - Math.pow(1 - x, 3); }
	function eio(x) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }
	function lerp(a, b, k) { return a + (b - a) * k; }
	function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
	var STOPS = [[0, 229, 72, 44], [0.45, 255, 138, 31], [0.8, 255, 197, 61], [1, 255, 243, 201]];
	function heat(h, a) {
		h = clamp(h);
		for (var i = 1; i < STOPS.length; i++) if (h <= STOPS[i][0]) { var p = STOPS[i - 1], q = STOPS[i], k = (h - p[0]) / (q[0] - p[0]); return 'rgba(' + Math.round(lerp(p[1], q[1], k)) + ',' + Math.round(lerp(p[2], q[2], k)) + ',' + Math.round(lerp(p[3], q[3], k)) + ',' + (a === undefined ? 1 : a) + ')'; }
		return 'rgba(255,243,201,' + (a === undefined ? 1 : a) + ')';
	}
	/* раскалённое (h = 1) → цвет надписи (h = 0) */
	function mixInk(h, a) {
		var c = light ? [28, 33, 38] : [240, 242, 244], f = [255, 214, 120];
		return 'rgba(' + Math.round(lerp(c[0], f[0], h)) + ',' + Math.round(lerp(c[1], f[1], h)) + ',' + Math.round(lerp(c[2], f[2], h)) + ',' + (a === undefined ? 1 : a) + ')';
	}
	var lcv = document.createElement('canvas'), lx = lcv.getContext('2d'), dirty = false, GL = 0, GLmax = 0;
	function stage(c) { c.setTransform(K, 0, 0, K, OX, OY); }
	function line(x1, y1, x2, y2, w, col) {
		lx.strokeStyle = col; lx.lineCap = 'round'; lx.lineWidth = w; lx.beginPath(); lx.moveTo(x1, y1); lx.lineTo(x2, y2); lx.stroke();
		dirty = true; if (GL > GLmax) GLmax = GL;
	}
	function flush() {
		if (!dirty) return;
		cx.save(); cx.setTransform(1, 0, 0, 1, 0, 0); cx.shadowBlur = 0; cx.globalCompositeOperation = light ? 'source-over' : 'lighter';
		if (blurOn && GLmax > 0 && cx.filter !== undefined) {
			cx.filter = 'blur(' + (GLmax * K * 0.55).toFixed(1) + 'px)'; cx.globalAlpha = light ? 0.45 : 0.9; cx.drawImage(lcv, 0, 0);
			cx.filter = 'blur(' + (GLmax * K * 0.16).toFixed(1) + 'px)'; cx.globalAlpha = light ? 0.5 : 0.85; cx.drawImage(lcv, 0, 0);
			cx.filter = 'none';
		}
		cx.globalAlpha = 1; cx.drawImage(lcv, 0, 0); cx.restore();
		lx.setTransform(1, 0, 0, 1, 0, 0); lx.clearRect(0, 0, lcv.width, lcv.height); stage(lx);
		dirty = false; GLmax = 0;
	}
	function add(on) { if (!on) flush(); cx.globalCompositeOperation = (on && !light) ? 'lighter' : 'source-over'; }
	function tglow(px, col) { cx.shadowBlur = blurOn ? px * K * (light ? 0.5 : 1) : 0; cx.shadowColor = col; }

	/* ------------------------------ куб ------------------------------ */
	var CV = [], CE = [], i, j;
	for (i = 0; i < 8; i++) CV.push([(i & 1) ? 1 : -1, (i & 2) ? 1 : -1, (i & 4) ? 1 : -1]);
	for (i = 0; i < 8; i++) for (j = i + 1; j < 8; j++) if (((CV[i][0] !== CV[j][0]) + (CV[i][1] !== CV[j][1]) + (CV[i][2] !== CV[j][2])) === 1) CE.push([i, j]);
	var ISO_YAW = Math.PI / 4, ISO_PITCH = Math.atan(1 / Math.SQRT2);
	function rot(p, yaw, pitch) { var c = Math.cos(yaw), s = Math.sin(yaw), x = p[0] * c + p[2] * s, z = -p[0] * s + p[2] * c, y = p[1], c2 = Math.cos(pitch), s2 = Math.sin(pitch); return [x, y * c2 - z * s2, y * s2 + z * c2]; }
	function cubePts(ox, oy, size, yaw, pitch, f) {
		return CV.map(function (v) { var r = rot([v[0] * size, v[1] * size, v[2] * size], yaw, pitch), k = f ? f / (f + r[2]) : 1; return [ox + r[0] * k, oy + r[1] * k, k, r[2]]; });
	}
	/* o: { w — толщина, h — жар, draw (0..1) — сколько рёбер уже начерчено, g — свечение } */
	function cube(ox, oy, size, yaw, pitch, f, o) {
		var P = cubePts(ox, oy, size, yaw, pitch, f), n = CE.length;
		GL = o.g;
		for (var e = 0; e < n; e++) {
			var a = P[CE[e][0]], b = P[CE[e][1]], d = clamp(o.draw * (n + 3) / 3 - e / 3);
			if (d <= 0) continue;
			var depth = clamp(0.5 - (a[3] + b[3]) / (4 * size)), al = 0.35 + 0.65 * depth;
			line(a[0], a[1], lerp(a[0], b[0], d), lerp(a[1], b[1], d), o.w * (0.75 + 0.5 * depth), heat(o.h * (0.55 + 0.45 * depth) + 0.12 * (1 - (a[1] + b[1] - 2 * oy) / (4 * size)), al));
		}
		GL = 0;
	}

	/* ------------------------------ надпись ------------------------------ */
	function setFont(size, weight) { cx.font = weight + ' ' + size + 'px ' + FONT; }
	function drawText(L, base, size, col, from, to) { cx.fillStyle = col; cx.textBaseline = 'alphabetic'; for (var n = from; n < to; n++) { setFont(size, L[n].weight); cx.fillText(L[n].ch, L.x0 + L[n].x, base); } }
	var ST = null;
	/* места букв; на месте «o» (девятая буква) — куб */
	function prep() {
		var size = 124, n, x = 0, parts = [], r = 39, slot = 2 * 0.866 * r * 1.03, pad = 5;
		for (n = 0; n < NAME.length; n++) { var wgt = n < 5 ? 500 : 700; setFont(size, wgt); var w = n === 8 ? slot + pad * 2 : cx.measureText(NAME.charAt(n)).width; parts.push({ ch: NAME.charAt(n), x: x, w: w, weight: wgt }); x += w; }
		parts.total = x; parts.x0 = W / 2 - x / 2;
		var Pp = cubePts(0, 0, 1, ISO_YAW, ISO_PITCH, 0), top = 0; Pp.forEach(function (p) { top = Math.max(top, Math.abs(p[1])); });
		var rr = rng(44), sp = [], sx = parts.x0 + parts[8].x + parts[8].w / 2, base = H / 2 + 42, sy = base - size * 0.265;
		for (n = 0; n < 90; n++) { var a = rr() * 6.2832, v = 120 + rr() * 520; sp.push({ t0: 2.95 + rr() * 0.08, x: sx, y: sy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, life: 0.5 + rr() * 0.9, sz: 1.1 + rr() * 2 }); }
		ST = { size: size, L: parts, base: base, sx: sx, sy: sy, cs: r / top, sp: sp };
	}

	/* ------------------------------ фон, угольки, искры ------------------------------ */
	function bg() {
		cx.save(); cx.setTransform(1, 0, 0, 1, 0, 0); cx.globalCompositeOperation = 'source-over'; cx.shadowBlur = 0;
		if (light) cx.fillStyle = '#eef0f2';
		else { var g = cx.createRadialGradient(cv.width / 2, cv.height * 0.55, 40 * K, cv.width / 2, cv.height * 0.55, Math.max(cv.width, cv.height) * 0.75); g.addColorStop(0, '#1b2025'); g.addColorStop(1, '#090b0d'); cx.fillStyle = g; }
		cx.fillRect(0, 0, cv.width, cv.height); cx.restore();
	}
	function embers(t, strength) {
		var r = rng(7), ww = X1 - X0, hh = Y1 - Y0;
		add(true);
		for (var n = 0; n < 46; n++) {
			var x0 = X0 + r() * ww, sp = 14 + r() * 34, ph = r() * 6.28, sz = 0.7 + r() * 1.6, y = Y1 - ((r() * hh + t * sp) % (hh + 40)) + 20, x = x0 + Math.sin(t * (0.5 + r()) + ph) * 16;
			cx.fillStyle = heat(0.35 + r() * 0.5, strength * (0.25 + 0.5 * Math.abs(Math.sin(t * 2 + ph))));
			cx.beginPath(); cx.arc(x, y, sz, 0, 6.2832); cx.fill();
		}
		add(false);
	}
	function sparks(t, list, grav) {
		add(true); cx.shadowBlur = 0;
		for (var n = 0; n < list.length; n++) {
			var p = list[n], tau = t - p.t0; if (tau < 0 || tau > p.life) continue;
			var k = tau / p.life, x = p.x + p.vx * tau, y = p.y + p.vy * tau + 0.5 * grav * tau * tau;
			cx.strokeStyle = heat(1 - k * 0.9, 1 - k); cx.lineWidth = p.sz * (1 - k * 0.6); cx.lineCap = 'round';
			cx.beginPath(); cx.moveTo(x, y); cx.lineTo(x - p.vx * 0.018, y - (p.vy + grav * tau) * 0.018); cx.stroke();
		}
		add(false);
	}
	function flash(x, y, r, a) {
		if (a <= 0) return;
		add(true);
		var g = cx.createRadialGradient(x, y, 0, x, y, r);
		g.addColorStop(0, 'rgba(255,250,230,' + a + ')'); g.addColorStop(0.25, 'rgba(255,205,90,' + a * 0.75 + ')'); g.addColorStop(0.6, 'rgba(255,120,30,' + a * 0.3 + ')'); g.addColorStop(1, 'rgba(229,72,44,0)');
		cx.fillStyle = g; cx.fillRect(x - r, y - r, 2 * r, 2 * r); add(false);
	}

	function draw(t) {
		var Q = ST, CX = W / 2, CY = H / 2 - 6, L = Q.L;
		bg(); stage(cx); embers(t, 0.5);
		var mv = eio(seg(t, 1.2, 2.05)), x = lerp(CX, Q.sx, mv), y = lerp(CY, Q.sy, mv), sz = lerp(112, Q.cs, mv);
		var spin = 0.4 + t * 1.7, target = ISO_YAW + Math.PI * 2, rock = t > 2.05 ? Math.sin((t - 2.05) * 1.5) * 0.3 * seg(t, 2.05, 3.0) * (1 - seg(t, 3.5, T_END)) : 0;
		var yaw = lerp(Math.min(spin, 0.4 + 1.2 * 1.7 + (t - 1.2) * 1.7), target, eo(seg(t, 1.2, 2.05))) + rock, pitch = lerp(0.46, ISO_PITCH, mv);
		/* буквы выезжают из-за куба: слева «BazisReb», справа «rn» */
		var rv = eo(seg(t, 1.95, 2.95));
		if (rv > 0) {
			var hot = 1 - eo(seg(t, 2.5, 3.7)), xl = L.x0 + L[8].x, xr = xl + L[8].w, sl = (1 - rv) * 90;
			tglow(10 + 40 * hot, 'rgba(255,150,40,' + (0.5 + 0.5 * hot) + ')');
			cx.save(); cx.beginPath(); cx.rect(lerp(xl, L.x0 - 40, rv), Y0, xl - lerp(xl, L.x0 - 40, rv), Y1 - Y0); cx.clip(); cx.translate(sl, 0); drawText(L, Q.base, Q.size, mixInk(hot), 0, 8); cx.restore();
			cx.save(); cx.beginPath(); cx.rect(xr, Y0, lerp(0, L.x0 + L.total + 40 - xr, rv), Y1 - Y0); cx.clip(); cx.translate(-sl, 0); drawText(L, Q.base, Q.size, mixInk(hot), 9, 11); cx.restore();
			cx.shadowBlur = 0;
		}
		add(true);
		var pulse = seg(t, 2.85, 2.98) * (1 - eo(seg(t, 2.98, 3.6)));
		cube(x, y, sz, yaw, pitch, mv >= 0.999 ? 0 : 820 / (1 - mv), { w: lerp(3.6, 4.4, mv), h: 0.6 + 0.4 * pulse, draw: seg(t, 0, 0.8), g: 14 + 26 * pulse });
		add(false);
		flash(Q.sx, Q.sy, 380, pulse * 0.6);
		sparks(t, Q.sp, 480);
		flush();
	}

	function fit() {
		var d = Math.min(2, window.devicePixelRatio || 1), w = Math.max(320, Math.round(window.innerWidth * d)), h = Math.max(200, Math.round(window.innerHeight * d));
		if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; lcv.width = w; lcv.height = h; }
		/* сцена 960 × 540 вписывается в окно с небольшим запасом по краям */
		K = Math.min(w / W, h / H) * (w / h > 2 ? 1 : 0.86);
		OX = (w - W * K) / 2; OY = (h - H * K) / 2;
		X0 = -OX / K; X1 = W + OX / K; Y0 = -OY / K; Y1 = H + OY / K;
	}

	var t0 = 0, raf = 0, frames = 0, slow = 0, last = 0, ended = false;
	var TOKEN = (/[?&]t=([^&#]*)/.exec(location.search) || [])[1] || '';
	function sound(what) {
		try { fetch('/api/sound/' + what, { method: 'POST', headers: { 'X-BM-Token': decodeURIComponent(TOKEN) } }).then(function (r) { return r.text(); }).catch(function () { }); } catch (e) { /* без звука — так без звука */ }
	}
	function skip() { if (!ended) sound('stop'); finish(); }
	function finish() {
		if (ended) return;
		ended = true; S.done = true;
		cancelAnimationFrame(raf);
		document.removeEventListener('keydown', onKey, true);
		el.classList.add('out');
		setTimeout(function () { el.remove(); }, FADE);
	}
	function loop(now) {
		if (ended) return;
		if (!t0) { t0 = now; last = now; }
		var t = (now - t0) / 1000;
		/* компьютер не успевает (кадр дольше 45 мс несколько раз подряд) — рисуем без размытия */
		if (frames > 3 && now - last > 45) { if (++slow >= 4) blurOn = false; } else if (slow > 0) slow--;
		last = now; frames++;
		fit(); cx.globalAlpha = 1; cx.filter = 'none';
		draw(Math.min(t, T_END));
		if (t >= T_END) { finish(); return; }
		raf = requestAnimationFrame(loop);
	}
	function onKey(e) { if (e.key === 'F5' || e.key === 'F12') return; e.preventDefault(); e.stopPropagation(); skip(); }
	S.done = false;
	S.skip = skip;
	S.seek = function (t, theme) { cancelAnimationFrame(raf); ended = true; if (theme) light = theme !== 'dark'; fit(); prep(); draw(t); };      // для снимков и проверок: один кадр на заданной секунде
	S.state = function () { return { blur: blurOn, frames: frames, theme: light ? 'light' : 'dark', length: T_END }; };
	el.addEventListener('mousedown', function (e) { e.preventDefault(); skip(); });
	document.addEventListener('keydown', onKey, true);
	fit(); prep();
	function go() { if (ended) return; prep(); sound('play'); raf = requestAnimationFrame(loop); }
	/* ждём шрифт не дольше трети секунды: надпись меряется по нему */
	var started = false, kick = function () { if (!started) { started = true; go(); } };
	if (document.fonts && document.fonts.ready) document.fonts.ready.then(kick);
	setTimeout(kick, 300);
})();
