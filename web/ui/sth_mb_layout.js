/* STHGroup: изменение ширины дерева базы без нативного артефакта в нижнем углу. */
(function () {
	'use strict';
	var pane = document.getElementById('mbLeft'), main = document.getElementById('mbMain');
	if (!pane || !main) return;
	var grip = document.createElement('div'); grip.className = 'sthBaseResize'; grip.tabIndex = 0;
	grip.setAttribute('role', 'separator'); grip.setAttribute('aria-orientation', 'vertical');
	grip.setAttribute('aria-label', 'Ширина групп материалов'); main.appendChild(grip);
	function bounds() { return { min: Math.min(180, main.clientWidth * .45), max: main.clientWidth * .45 }; }
	function position() {
		var p = pane.getBoundingClientRect(), m = main.getBoundingClientRect();
		grip.style.left = (p.right - m.left) + 'px';
		grip.setAttribute('aria-valuenow', Math.round(p.width));
		var b = bounds(); grip.setAttribute('aria-valuemin', Math.round(b.min)); grip.setAttribute('aria-valuemax', Math.round(b.max));
	}
	function resize(width) { var b = bounds(); pane.style.width = Math.max(b.min, Math.min(b.max, width)) + 'px'; position(); }
	grip.addEventListener('pointerdown', function (e) {
		if (e.button !== 0) return; e.preventDefault();
		var start = e.clientX, width = pane.getBoundingClientRect().width;
		grip.setPointerCapture(e.pointerId); grip.classList.add('on');
		function move(ev) { resize(width + ev.clientX - start); }
		function end() { grip.classList.remove('on'); grip.removeEventListener('pointermove', move); grip.removeEventListener('pointerup', end); grip.removeEventListener('pointercancel', cancel); grip.removeEventListener('lostpointercapture', end); }
		function cancel() { resize(width); end(); }
		grip.addEventListener('pointermove', move); grip.addEventListener('pointerup', end); grip.addEventListener('pointercancel', cancel); grip.addEventListener('lostpointercapture', end);
	});
	grip.addEventListener('keydown', function (e) {
		if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
		e.preventDefault(); resize(pane.getBoundingClientRect().width + (e.key === 'ArrowRight' ? 20 : -20));
	});
	if (window.ResizeObserver) { var observer = new ResizeObserver(position); observer.observe(pane); observer.observe(main); }
	position();
})();
