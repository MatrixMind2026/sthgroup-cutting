// Кладёт собранный выпуск (dist/latest.yml, установщик и .blockmap) в папку обновлений — программы увидят его при проверке.
//   npm run dist:folder            — собрать и положить в папку по умолчанию (E:\AI Разработка\Обновления\STHGroup)
//   node tools/to_folder.js <папка> — положить готовую сборку из dist в другую папку
'use strict';
const fs = require('fs'), path = require('path');
const FU = require('../sth_folder_update');
const dist = path.join(__dirname, '..', 'dist');
const dir = process.argv[2] || FU.DEFAULT_DIR;
const yml = fs.readFileSync(path.join(dist, 'latest.yml'), 'utf8');
const ver = (/^version:\s*(.+)$/m.exec(yml) || [])[1], exe = path.basename(((/^path:\s*(.+)$/m.exec(yml) || [])[1] || '').trim());
if (!ver || !exe) throw new Error('в dist/latest.yml нет version или path');
const old = FU.folderVersion(dir);
if (old && FU.cmpVer(ver, old) <= 0) throw new Error('в папке уже версия ' + old + ', эта (' + ver + ') не новее — поднимите version в package.json');
fs.mkdirSync(dir, { recursive: true });
for (const n of fs.readdirSync(dir)) if (/^STHGroup-Cutting-Setup-.*\.(exe|blockmap)$/i.test(n)) fs.unlinkSync(path.join(dir, n)); // старые установщики
for (const n of [exe, exe + '.blockmap']) if (fs.existsSync(path.join(dist, n))) fs.copyFileSync(path.join(dist, n), path.join(dir, n));
fs.copyFileSync(path.join(dist, 'latest.yml'), path.join(dir, 'latest.yml')); // последним — пока его нет, программы не видят полусобранный выпуск
console.log('Версия ' + ver + ' положена в ' + dir);
