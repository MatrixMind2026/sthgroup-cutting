// STHGroup: геометрия главного окна отдельно от настроек расчёта.
'use strict';
const fs = require('fs');
function rect(r) { return r && ['x', 'y', 'width', 'height'].every(k => Number.isFinite(r[k])) && r.width > 0 && r.height > 0; }
function overlap(a, b) { return Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)); }
function restore(state, displays, primary) {
  const list = (displays || []).filter(d => rect(d.workArea));
  const fallback = primary && rect(primary.workArea) ? primary : list[0];
  if (!fallback) return { bounds: { width: 1440, height: 900 }, minWidth: 1000, minHeight: 640, maximized: !!(state && state.maximized), fullscreen: !!(state && state.fullscreen) };
  const old = state && state.bounds;
  let display = list.find(d => state && String(d.id) === String(state.displayId));
  if (!display && rect(old)) display = list.slice().sort((a, b) => overlap(old, b.workArea) - overlap(old, a.workArea)).find(d => overlap(old, d.workArea) > 0);
  display = display || fallback;
  const area = display.workArea, minWidth = Math.min(1000, area.width), minHeight = Math.min(640, area.height);
  const width = Math.round(Math.min(area.width, Math.max(minWidth, rect(old) ? old.width : 1440)));
  const height = Math.round(Math.min(area.height, Math.max(minHeight, rect(old) ? old.height : 900)));
  let x = rect(old) ? old.x : area.x + (area.width - width) / 2;
  let y = rect(old) ? old.y : area.y + (area.height - height) / 2;
  x = Math.round(Math.max(area.x, Math.min(x, area.x + area.width - width)));
  y = Math.round(Math.max(area.y, Math.min(y, area.y + area.height - height)));
  return { bounds: { x, y, width, height }, minWidth, minHeight, maximized: !!(state && state.maximized), fullscreen: !!(state && state.fullscreen) };
}
function read(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return null; } }
function track(win, file, screen, initial) {
  let state = initial || {}, timer;
  function save() {
    clearTimeout(timer);
    if (win.isDestroyed && win.isDestroyed()) return;
    if (win.isMinimized && win.isMinimized()) return; // свёрнутое окно не является видом для следующего запуска
    const bounds = win.getNormalBounds(); if (!rect(bounds)) return;
    const display = screen && screen.getDisplayMatching ? screen.getDisplayMatching(bounds) : null;
    state = { bounds, displayId: display && display.id, maximized: win.isMaximized(), fullscreen: win.isFullScreen() };
    try { fs.writeFileSync(file + '.tmp', JSON.stringify(state)); fs.renameSync(file + '.tmp', file); } catch (_) { /* не мешать закрытию программы */ }
  }
  ['resize', 'move'].forEach(event => win.on(event, () => { clearTimeout(timer); timer = setTimeout(save, 300); }));
  ['maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen'].forEach(event => win.on(event, save));
  win.on('close', save);
  win.on('closed', () => clearTimeout(timer));
  return save;
}
module.exports = { restore, read, track };
