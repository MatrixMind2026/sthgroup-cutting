// STHGroup 2.0: две темы (светлая и тёмная) доступны через штатные настройки окна
const assert = require('assert'), fs = require('fs');
for (const f of ['geom', 'cut', 'project', 'sth_themes']) require('../web/core/' + f + '.js');
const expected = [
  ['sth-workshop', 'Светлая', 'light'],
  ['sth', 'Темная', 'dark']
];
const removed = ['sth-nordic', 'sth-graphite', 'sth-est-light', 'sth-est-graphite', 'sth-est-total'];
assert.deepStrictEqual(BM.THEMES.map(x => x.id), expected.map(x => x[0]));
assert.ok(removed.every(id => BM.THEMES.every(x => x.id !== id)));
assert.strictEqual(BM.theme('light').id, 'sth-workshop');
assert.strictEqual(BM.theme('sth-nordic').id, 'sth-workshop');
assert.strictEqual(BM.theme(undefined).id, 'sth-workshop');
expected.forEach(x => {
  const t = BM.theme(x[0]);
  assert.ok(t && t.id === x[0] && t.name === x[1] && t.base === x[2]);
});
const css = fs.readFileSync(__dirname + '/../web/sth_v2.css', 'utf8');
expected.filter(x => x[0] !== 'sth').forEach(x => assert.ok(css.includes('html[data-skin="' + x[0] + '"]')));
const html = fs.readFileSync(__dirname + '/../web/index.html', 'utf8');
assert.ok(html.indexOf('core/project.js') < html.indexOf('core/sth_themes.js') && html.indexOf('core/sth_themes.js') < html.indexOf('ui/dialogs.js') && html.indexOf('core/sth_themes.js') < html.indexOf('ui/app.js'));
console.log('проверок 9 | ошибок нет: каталог тем, стили, загрузка до окна и настроек');
