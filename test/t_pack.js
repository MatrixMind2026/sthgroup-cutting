// Скрипт выгрузки 1.11: проект одним файлом (.bmk — zip без сжатия) — на имитации БАЗИСа, который читает файлы байтами.
const { execFileSync } = require('child_process'), fs = require('fs'), path = require('path'), zlib = require('zlib');
const out = path.join(__dirname, 'out', 'pack.bmk');
let bad = 0; const ok = (w, v, i) => { console.log((v ? 'ок     ' : 'НЕ ТАК ') + w + (v || i === undefined ? '' : ' → ' + JSON.stringify(i).slice(0, 300))); if (!v) bad++; };
function entries(p) {
	const b = fs.readFileSync(p); if (b.readUInt32LE(0) !== 0x04034b50) return null;
	let e = b.length - 22; while (e >= 0 && b.readUInt32LE(e) !== 0x06054b50) e--;
	let n = b.readUInt16LE(e + 10), o = b.readUInt32LE(e + 16); const r = {};
	for (let i = 0; i < n; i++) { const crc = b.readUInt32LE(o + 16), sz = b.readUInt32LE(o + 24), nl = b.readUInt16LE(o + 28), lo = b.readUInt32LE(o + 42), fl = b.readUInt16LE(o + 8), nm = b.slice(o + 46, o + 46 + nl).toString('utf8'); const st = lo + 30 + b.readUInt16LE(lo + 26) + b.readUInt16LE(lo + 28), d = b.slice(st, st + sz); r[nm] = { d, crcOk: zlib.crc32(d) === crc, utf8: !!(fl & 0x800) }; o += 46 + nl + b.readUInt16LE(o + 30) + b.readUInt16LE(o + 32); }
	return r;
}
try { fs.unlinkSync(out); } catch (e) { }
const log = execFileSync('node', [path.join(__dirname, 'mock_bazis.js'), out, 'pack'], { encoding: 'utf8' });
const E = entries(out), names = E ? Object.keys(E) : [];
ok('один файл: .bmk — архив', !!E, log.slice(0, 200));
ok('внутри — проект, 3D, развёртка, текстура (имена — как раньше рядом с моделью)', names[0] === 'project.json' && names.some(n => /— 3D\.glb$/.test(n)) && names.some(n => /— 3D\.uv$/.test(n)) && names.some(n => /_textures\/Дерево\/дуб\.jpg$/.test(n)), names);
ok('контрольные суммы верны, имена в UTF-8', names.every(n => E[n].crcOk && E[n].utf8));
const doc = JSON.parse(E['project.json'].d.toString('utf8'));
ok('проект внутри читается, 3D указан', doc.format === 'benchmark-project' && /— 3D\.glb$/.test(doc.model.mesh) && doc.exporter === 'bazis-export 1.11');
ok('отдельных файлов рядом с моделью не осталось', /отдельных файлов осталось: 0/.test(log), log.match(/отдельных.*$/m));
/* программа поработала с проектом (раскрой) — повторная выгрузка его сохраняет */
const z = fs.readFileSync(out); doc.work = { note: 'раскрой сохранён' };
const pj = Buffer.from(JSON.stringify(doc)), rest = Object.keys(E).filter(n => n !== 'project.json');
/* пересобрать архив тем же скриптом — простым zip без сжатия */
function zip(files) { const parts = [], cd = []; let off = 0; for (const [n, d] of files) { const nb = Buffer.from(n), h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x800, 6); h.writeUInt32LE(zlib.crc32(d), 14); h.writeUInt32LE(d.length, 18); h.writeUInt32LE(d.length, 22); h.writeUInt16LE(nb.length, 26); const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x800, 8); c.writeUInt32LE(zlib.crc32(d), 16); c.writeUInt32LE(d.length, 20); c.writeUInt32LE(d.length, 24); c.writeUInt16LE(nb.length, 28); c.writeUInt32LE(off, 42); parts.push(h, nb, d); cd.push(c, nb); off += 30 + nb.length + d.length; } const cdb = Buffer.concat(cd), e = Buffer.alloc(22); e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(files.length, 8); e.writeUInt16LE(files.length, 10); e.writeUInt32LE(cdb.length, 12); e.writeUInt32LE(off, 16); return Buffer.concat(parts.concat([cdb, e])); }
fs.writeFileSync(out, zip([['project.json', pj]].concat(rest.map(n => [n, E[n].d]))));
const log2 = execFileSync('node', [path.join(__dirname, 'mock_bazis.js'), out, 'resave'], { encoding: 'utf8', env: Object.assign({}, process.env, { BM_MOCK_PACK: '1' }) });
const E2 = entries(out), d2 = E2 && JSON.parse(E2['project.json'].d.toString('utf8'));
ok('повторная выгрузка в тот же один файл: раскрой из прежнего сохранён', !!d2 && d2.work && d2.work.note === 'раскрой сохранён', log2.slice(0, 200));
/* БАЗИС не читает байтами — по-старому, текстом */
const plain = path.join(__dirname, 'out', 'plain.bmk'); execFileSync('node', [path.join(__dirname, 'mock_bazis.js'), plain], { encoding: 'utf8' });
ok('без чтения байтами — проект текстом, как раньше', fs.readFileSync(plain, 'utf8').startsWith('{'));
console.log(bad ? 'ОШИБКИ: ' + bad : 'ошибок нет');
process.exit(bad ? 1 : 0);
