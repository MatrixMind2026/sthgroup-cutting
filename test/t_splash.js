// Заставка STHGroup (web/ui/sth_splash.js): свой файл подключён в окно, уважает настройки анимаций,
// версию берёт с сервера, пропускается щелчком и клавишей; сервер ставит class="noanim" при anim:0
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), S = require('../server.js');
let n = 0; const ok = (name) => { n++; console.log('ок     ' + name); };
const root = path.join(__dirname, '..');
const sp = fs.readFileSync(path.join(root, 'web', 'ui', 'sth_splash.js'), 'utf8');
const idx = fs.readFileSync(path.join(root, 'web', 'index.html'), 'utf8');

// 1. свой файл подключён сразу после заставки BazisReborn (она отключена и убирает свою разметку сама)
assert.ok(idx.indexOf('ui/sth_splash.js') >= 0, 'sth_splash.js не подключён в index.html');
assert.ok(idx.indexOf('ui/sth_splash.js') > idx.indexOf('ui/splash.js'), 'порядок: после ui/splash.js');
ok('заставка подключена в index.html после ui/splash.js');

// 2. уважает настройки: noanim (сервер ставит класс при anim:0), ?splash=0, reduced-motion
assert.ok(sp.indexOf('noanim') >= 0);
assert.ok(sp.indexOf('splash=0') >= 0);
assert.ok(sp.indexOf('prefers-reduced-motion') >= 0);
ok('не показывается при выключенных анимациях (настройки, Windows, ?splash=0)');

// 3. интерфейс как у заставки BazisReborn: window.Splash с done и skip; пропуск — щелчком и клавишей
assert.ok(/window\.Splash\s*=/.test(sp));
assert.ok(sp.indexOf('done') >= 0 && sp.indexOf('skip') >= 0);
assert.ok(sp.indexOf('mousedown') >= 0 && sp.indexOf('keydown') >= 0);
ok('window.Splash: done/skip, пропуск щелчком и клавишей');

// 4. версия — с сервера (GET /api/boot), звук — через /api/sound, оба с токеном окна
assert.ok(sp.indexOf('/api/boot') >= 0);
assert.ok(sp.indexOf('/api/sound/') >= 0);
assert.ok(sp.indexOf('X-BM-Token') >= 0);
ok('версия и звук — через /api с токеном окна');

// 5. своя разметка и стили в самом файле: знак STHGroup, цвета темы
assert.ok(sp.indexOf('sthSplash') >= 0);
assert.ok(sp.indexOf('#F26B1D') >= 0);
assert.ok(sp.indexOf('STH') >= 0 && sp.indexOf('Group') >= 0);
ok('знак и название STHGroup — целиком в своём файле');

// 6. сервер ставит class="noanim" в страницу при выключенных анимациях, а без настройки — не ставит
(async function () {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sth-splash-'));
	fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({ anim: 0 }));
	const srv = await S.start({ webDir: path.join(root, 'web'), dataDir: dir, version: '0.0.0-test' });
	const page = await (await fetch(srv.url)).text();
	srv.close();
	assert.ok(page.indexOf('class="noanim"') >= 0, 'anim:0 — страница без class="noanim"');
	const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'sth-splash-'));
	const srv2 = await S.start({ webDir: path.join(root, 'web'), dataDir: dir2, version: '0.0.0-test' });
	const page2 = await (await fetch(srv2.url)).text();
	srv2.close();
	assert.ok(page2.indexOf('noanim') < 0, 'без настройки class="noanim" быть не должно');
	ok('сервер ставит class="noanim" только при anim:0');
	console.log('проверок ' + n + ' | ошибок нет');
})().catch(function (e) { console.error(e); process.exit(1); });
