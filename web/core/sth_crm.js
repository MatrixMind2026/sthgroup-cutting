/* STHGroup 2.0 — преобразование заявок CRM в заказы. Чистые данные, без DOM и сети. */
(function (G) {
	'use strict';
	var BM = G.BM = G.BM || {}, O = BM.sth, C = BM.sthCrm = {};
	var STATUS = { new_request: 'calc', contract_agreement: 'agreed', procurement: 'agreed', production: 'work', assembly_feedback: 'ready', completed: 'closed' };
	function text(v) { return String(v === undefined || v === null ? '' : v).trim(); }
	function external(id) { return 'crm:' + text(id); }
	C.byExternal = function (b, id) {
		var key = external(id); if (key === 'crm:') return null;
		for (var i = 0; i < b.orders.length; i++) if (b.orders[i].externalId === key) return b.orders[i];
		return null;
	};
	C.client = function (b, id, fallback) {
		var key = external(id), i, c;
		if (key !== 'crm:') for (i = 0; i < b.clients.length; i++) if (b.clients[i].externalId === key) return b.clients[i];
		return O.clientByName(b, fallback) || null;
	};
	C.import = function (b, requests, clients) {
		var made = [], skipped = [], byClient = {};
		(clients || []).forEach(function (c) { byClient[text(c.id)] = c; });
		(requests || []).forEach(function (r) {
			var id = text(r && r.id); if (!id) return;
			var old = C.byExternal(b, id); if (old) { skipped.push(old); return; }
			var cr = byClient[text(r.clientId)] || r.client || {}, name = text(cr.name || cr.title || r.clientName || r.customer);
			var client = C.client(b, r.clientId, name);
			if (!client && name) { client = O.addClient(b, { name: name, phone: text(cr.phone || r.phone), email: text(cr.email || r.email), note: 'Импортирован из CRM' }); client.externalId = external(r.clientId || ('name-' + client.id)); }
			var externalNo = text(r.orderNumber), no = externalNo && !O.byNo(b, externalNo) ? externalNo : '';
			var o = O.addOrder(b, { no: no, clientId: client ? client.id : '', note: text(r.productType) ? 'Из CRM: ' + text(r.productType) : 'Заявка из CRM' });
			o.source = 'crm'; o.externalId = external(id); o.externalNo = externalNo; o.crmStatus = text(r.status);
			o.status = STATUS[o.crmStatus] || 'calc'; o.crmUpdatedAt = text(r.updatedAt); o.importedAt = new Date().toISOString();
			var dt = text(r.createdAt); if (/^\d{4}-\d\d-\d\d/.test(dt)) o.date = dt.slice(0, 10);
			made.push(o);
		});
		return { created: made, skipped: skipped };
	};
	C.status = function (crmStatus) { return STATUS[text(crmStatus)] || 'calc'; };
})(typeof window !== 'undefined' ? window : globalThis);
