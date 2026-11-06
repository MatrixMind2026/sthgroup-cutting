/* STHGroup 2.0 — серверная часть подключения CRM.
   Пароль и cookie-сессия не попадают в окно: на диске только safeStorage-шифрование. */
'use strict';
const fs = require('fs');
const path = require('path');

const DEFAULT_URL = 'https://crm.migman.ru/app/';
const FILE = 'crm.json';

function json(res, code, value) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}
function body(req) {
  return new Promise(function (resolve, reject) {
    const chunks = []; let size = 0;
    req.on('data', function (c) { size += c.length; if (size > 65536) { reject(new Error('Слишком большой запрос')); req.destroy(); } else chunks.push(c); });
    req.on('end', function () { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch (e) { reject(new Error('Повреждённые данные запроса')); } });
    req.on('error', reject);
  });
}
function baseUrl(value) {
  const u = new URL(String(value || DEFAULT_URL).trim());
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('Адрес CRM должен начинаться с https:// или http://');
  return u.origin;
}
function errorText(e) {
  const s = String(e && e.message || e || 'Неизвестная ошибка');
  if (/fetch failed|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|aborted|timeout/i.test(s)) return 'CRM не отвечает. Проверьте интернет, адрес и доступность сервера.';
  return s.slice(0, 400);
}
function list(value, keys) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];
  for (const k of keys) if (Array.isArray(value[k])) return value[k];
  if (value.data && value.data !== value) return list(value.data, keys);
  if (value.result && value.result !== value) return list(value.result, keys);
  return [];
}

class Client {
  constructor(options) {
    this.opt = options || {};
    this.file = path.join(this.opt.dataDir, FILE);
    this.safe = this.opt.safeStorage;
    this.fetch = this.opt.fetch || global.fetch;
    this.state = { url: DEFAULT_URL, email: '', auto: true, connected: false, lastCheck: 0, lastError: '' };
    this.config = null;
    this.cookies = {};
    this.load();
  }
  load() {
    let saved = null;
    try { saved = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch (e) { /* первый запуск */ }
    if (!saved || typeof saved !== 'object') return;
    this.config = saved;
    this.state.url = saved.url || DEFAULT_URL;
    this.state.email = saved.email || '';
    this.state.auto = saved.auto !== false;
    try { if (saved.cookies) this.cookies = JSON.parse(this.decrypt(saved.cookies)); } catch (e) { this.cookies = {}; }
  }
  encrypt(text) {
    if (!this.safe || typeof this.safe.encryptString !== 'function') throw new Error('Защищённое хранилище недоступно. Пароль не сохранён.');
    if (typeof this.safe.isEncryptionAvailable === 'function' && !this.safe.isEncryptionAvailable()) throw new Error('Защищённое хранилище недоступно. Пароль не сохранён.');
    return this.safe.encryptString(String(text)).toString('base64');
  }
  decrypt(value) {
    if (!this.safe || typeof this.safe.decryptString !== 'function') throw new Error('Сохранённые данные CRM недоступны. Подключитесь заново.');
    return this.safe.decryptString(Buffer.from(String(value), 'base64'));
  }
  publicState() {
    return Object.assign({}, this.state, { hasPassword: !!(this.config && this.config.password), configured: !!(this.config && this.config.email) });
  }
  save(password) {
    const old = this.config || {};
    const next = {
      url: this.state.url, email: this.state.email, auto: this.state.auto,
      password: password ? this.encrypt(password) : old.password || '',
      cookies: Object.keys(this.cookies).length ? this.encrypt(JSON.stringify(this.cookies)) : ''
    };
    fs.mkdirSync(this.opt.dataDir, { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(next), { mode: 0o600 });
    fs.renameSync(tmp, this.file);
    this.config = next;
  }
  password() { return this.config && this.config.password ? this.decrypt(this.config.password) : ''; }
  // STHGroup: настройка автопроверки не требует входа и не переписывает секреты.
  saveAuto(auto) {
    const next = Object.assign({}, this.config || {}, { url: this.state.url, email: this.state.email, auto: auto === true });
    fs.mkdirSync(this.opt.dataDir, { recursive: true });
    fs.writeFileSync(this.file + '.tmp', JSON.stringify(next), { mode: 0o600 });
    fs.renameSync(this.file + '.tmp', this.file);
    this.config = next; this.state.auto = next.auto;
  }
  cookieHeader() { return Object.keys(this.cookies).map(function (k) { return k + '=' + this.cookies[k]; }, this).join('; '); }
  takeCookies(response) {
    const rows = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [];
    if (!rows.length) { const one = response.headers.get('set-cookie'); if (one) rows.push(one); }
    for (const row of rows) {
      const first = String(row).split(';')[0], p = first.indexOf('='); if (p < 1) continue;
      this.cookies[first.slice(0, p).trim()] = first.slice(p + 1).trim();
    }
  }
  async request(pathname, options, retry) {
    const controller = new AbortController(), timer = setTimeout(function () { controller.abort(); }, this.opt.timeout || 15000);
    try {
      const headers = Object.assign({ Accept: 'application/json' }, options && options.headers || {});
      const cookie = this.cookieHeader(); if (cookie) headers.Cookie = cookie;
      const response = await this.fetch(baseUrl(this.state.url) + pathname, Object.assign({}, options || {}, { headers: headers, signal: controller.signal, redirect: 'follow' }));
      this.takeCookies(response);
      if (response.status === 401 && !retry) { await this.login(); return this.request(pathname, options, true); }
      const text = await response.text(); let data = null;
      try { data = text ? JSON.parse(text) : {}; } catch (e) { throw new Error('CRM вернула не JSON (HTTP ' + response.status + ')'); }
      if (!response.ok) {
        const message = data && (data.error || data.message) || ('HTTP ' + response.status);
        const err = new Error(response.status === 401 || response.status === 403 ? 'CRM не приняла логин или пароль.' : 'Ошибка CRM: ' + message);
        err.status = response.status; throw err;
      }
      return data;
    } finally { clearTimeout(timer); }
  }
  async login(email, password) {
    const login = email || this.state.email, pass = password !== undefined ? password : this.password();
    if (!login || !pass) throw new Error('Введите логин и пароль CRM.');
    this.cookies = {};
    await this.request('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: login, password: pass }) }, true);
    this.state.connected = true; this.state.lastError = '';
  }
  async sync() {
    if (!this.state.connected) await this.login();
    const requests = await this.request('/api/data/requests', { method: 'GET' });
    const clients = await this.request('/api/data/clients', { method: 'GET' });
    this.state.connected = true; this.state.lastCheck = Date.now(); this.state.lastError = '';
    if (this.config) this.save();
    return { requests: list(requests, ['requests', 'items', 'rows']), clients: list(clients, ['clients', 'items', 'rows']) };
  }
  routes() {
    const self = this;
    async function handle(req, res, action) {
      try {
        if (action === 'state') return json(res, 200, self.publicState());
        if (action === 'settings') {
          const d = await body(req);
          if (typeof d.auto !== 'boolean') return json(res, 400, { error: 'Укажите состояние автопроверки CRM.' });
          self.saveAuto(d.auto);
          return json(res, 200, self.publicState());
        }
        if (action === 'disconnect') {
          self.config = null; self.cookies = {}; self.state.connected = false; self.state.lastError = '';
          try { fs.unlinkSync(self.file); } catch (e) { /* уже нет */ }
          return json(res, 200, self.publicState());
        }
        if (action === 'connect') {
          const d = await body(req);
          self.state.url = baseUrl(d.url || self.state.url); self.state.email = String(d.email || '').trim();
          self.state.auto = d.auto !== false;
          await self.login(self.state.email, d.password || undefined);
          self.save(d.password || ''); self.state.lastCheck = Date.now();
          return json(res, 200, Object.assign(self.publicState(), { ok: true }));
        }
        const result = await self.sync();
        if (action === 'test') return json(res, 200, Object.assign(self.publicState(), { ok: true, count: result.requests.length }));
        return json(res, 200, Object.assign(self.publicState(), result));
      } catch (e) {
        self.state.connected = false; self.state.lastError = errorText(e);
        json(res, 400, Object.assign(self.publicState(), { error: self.state.lastError }));
      }
    }
    return {
      'GET /api/sth/crm/state': function (req, res) { return handle(req, res, 'state'); },
      'POST /api/sth/crm/settings': function (req, res) { return handle(req, res, 'settings'); },
      'POST /api/sth/crm/connect': function (req, res) { return handle(req, res, 'connect'); },
      'POST /api/sth/crm/test': function (req, res) { return handle(req, res, 'test'); },
      'POST /api/sth/crm/sync': function (req, res) { return handle(req, res, 'sync'); },
      'POST /api/sth/crm/disconnect': function (req, res) { return handle(req, res, 'disconnect'); }
    };
  }
}

module.exports = {
  Client: Client,
  DEFAULT_URL: DEFAULT_URL,
  list: list,
  baseUrl: baseUrl,
  routes: function (options) { return new Client(options).routes(); }
};
