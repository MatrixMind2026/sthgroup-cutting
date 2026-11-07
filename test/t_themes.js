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
// 2.6.2: страница базы знает те же темы и цвета, что и окно программы; выбор материала — панелью внутри окна
const mb = fs.readFileSync(__dirname + '/../web/matbase.html', 'utf8');
assert.ok(mb.includes('href="sth_v2.css"') && mb.indexOf('href="sth_v2.css"') < mb.indexOf('href="sth_glass.css"'));
assert.ok(mb.indexOf('core/project.js') < mb.indexOf('core/sth_themes.js') && mb.indexOf('core/sth_themes.js') < mb.indexOf('ui/matbase_ui.js'));
for (const f of ['sth.js', 'sth_replace.js']) {
  const s = fs.readFileSync(__dirname + '/../web/ui/' + f, 'utf8');
  assert.ok(!/window\.open\(url, 'sth(pick|replace)'/.test(s), f + ': выбор материала не должен открывать отдельное окно');
}
assert.ok(fs.readFileSync(__dirname + '/../web/ui/sth_embed.js', 'utf8').includes('function placeOverlay'));
// 2.6.3: внутри окна программы у панелей базы нет внешних теней (иначе прямоугольная серая подложка)
assert.ok(mb.includes("dataset.sthFramed = '1'"));
assert.ok(fs.readFileSync(__dirname + '/../web/sth_visual_repairs.css', 'utf8').includes('[data-sth-framed="1"]{--sg-shadow:inset'));
console.log('проверок 15 | ошибок нет: каталог тем, стили, загрузка до окна и настроек');
