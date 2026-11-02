/* STHGroup — раскладка в фоновом потоке, чтобы окно не замирало.
   2.0: если программа дала ядро C++ (job.core — ключ доступа), раскладку считает оно; не вышло — JavaScript, как раньше. */
importScripts('core/geom.js', 'core/cut.js');
function viaJs(job) {
	try {
		job.opt.progress = function (f) { self.postMessage({ id: job.id, progress: f }); };
		var res = BM.cut.nest(job.items, job.bins, job.opt);
		self.postMessage({ id: job.id, res: res });
	} catch (err) {
		self.postMessage({ id: job.id, error: String(err && err.message ? err.message : err) });
	}
}
async function viaCore(job) {
	var r = await fetch('/api/core', { method: 'POST', headers: { 'X-BM-Token': job.core, 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'nest', items: job.items, bins: job.bins, opt: job.opt }) });
	if (!r.ok || !r.body) throw new Error('ядро C++: ответ ' + r.status);
	var rd = r.body.getReader(), dec = new TextDecoder(), buf = '', ans = null;
	for (;;) {
		var x = await rd.read();
		if (x.value) buf += dec.decode(x.value, { stream: true });
		var i;
		while ((i = buf.indexOf('\n')) >= 0) {
			var l = buf.slice(0, i); buf = buf.slice(i + 1);
			if (!l) continue;
			var d = JSON.parse(l);
			if (d.progress !== undefined) self.postMessage({ id: job.id, progress: d.progress }); else ans = d;
		}
		if (x.done) break;
	}
	if (!ans || !ans.ok) throw new Error((ans && ans.error) || 'ядро C++ не ответило');
	self.postMessage({ id: job.id, res: ans.out, core: 1 });
}
self.onmessage = function (e) {
	var job = e.data;
	if (!job.core) { viaJs(job); return; }
	viaCore(job).catch(function (err) { self.postMessage({ id: job.id, coreFail: String(err && err.message ? err.message : err) }); viaJs(job); });
};
