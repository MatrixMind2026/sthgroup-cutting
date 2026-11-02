// Модели-образцы для проверок: имитация БАЗИСа (mock_bazis.js) исполняет скрипт выгрузки bazis/STHGroup_Export.js
const { execFileSync } = require('child_process'), path = require('path'), fs = require('fs');
const out = path.join(__dirname, 'out'); fs.mkdirSync(out, { recursive: true });
[['sample', ''], ['noarc', 'noarc'], ['nohole', 'nohole'], ['big', 'big'], ['est', 'est'], ['fac', 'fac']].forEach(function (m) {
  execFileSync(process.execPath, [path.join(__dirname, 'mock_bazis.js'), path.join(out, m[0] + '.bmk')].concat(m[1] ? [m[1]] : []), { stdio: 'ignore' });
});
console.log('образцы моделей готовы');
