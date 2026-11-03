// STHGroup 2.0: три выбранные темы доступны через штатные настройки окна
const assert = require('assert'), fs = require('fs');
for (const f of ['geom', 'cut', 'project', 'sth_themes']) require('../web/core/' + f + '.js');
const expected = [
  ['sth-workshop', 'Светлая мастерская', 'light'],
  ['sth-nordic', 'Северный синий', 'light'],
  ['sth-graphite', 'Графит', 'dark']
];
expected.forEach(x => {
  const t = BM.theme(x[0]);
  assert.ok(t && t.id === x[0] && t.name === x[1] && t.base === x[2]);
});
const css = fs.readFileSync(__dirname + '/../web/sth_v2.css', 'utf8');
expected.forEach(x => assert.ok(css.includes('html[data-skin="' + x[0] + '"]')));
const html = fs.readFileSync(__dirname + '/../web/index.html', 'utf8');
assert.ok(html.indexOf('core/project.js') < html.indexOf('core/sth_themes.js') && html.indexOf('core/sth_themes.js') < html.indexOf('ui/dialogs.js') && html.indexOf('core/sth_themes.js') < html.indexOf('ui/app.js'));
console.log('проверок 3 | ошибок нет: каталог тем, стили, загрузка до окна и настроек');
