import assert from 'node:assert/strict';
import test from 'node:test';
import { PaintEngine } from './engine.ts';

const uv = (x, y, size = 16) => ({ u: (x + .5) / size, v: (y + .5) / size });
const stroke = (tool = 'brush', extra = {}) => ({ tool, color: '#ff0000', radius: 1, opacity: 1, ...extra });
const surface = (size = 16) => ({ width: size, height: size, data: new Uint8ClampedArray(size * size * 4).fill(255) });

test('paints at top-origin UV and undo/redo/cancel preserve input', () => {
  const input = surface(); const engine = new PaintEngine(input);
  engine.begin(uv(2, 1), stroke()); engine.end();
  assert.equal(engine.sample(uv(2, 1)), '#ff0000');
  assert.equal(engine.sample(uv(2, 14)), '#ffffff');
  assert.equal(input.data[0], 255); assert.equal(engine.dirty, true);
  engine.undo(); assert.equal(engine.dirty, false); assert.equal(engine.canRedo, true);
  engine.redo(); assert.equal(engine.sample(uv(2, 1)), '#ff0000');
  engine.begin(uv(8, 8), stroke('brush', {color: '#000000'})); engine.end(true);
  assert.equal(engine.sample(uv(8, 8)), '#ffffff');
});

test('interpolates short paths but never bridges a UV seam', () => {
  const engine = new PaintEngine(surface());
  engine.begin(uv(1, 2), stroke()); engine.move(uv(4, 2)); engine.move(uv(14, 2)); engine.end();
  assert.equal(engine.sample(uv(3, 2)), '#ff0000');
  assert.equal(engine.sample(uv(8, 2)), '#ffffff');
});

test('clones immutable pre-stroke pixels and restores original alpha', () => {
  const pixels = surface(); pixels.data.set([20, 40, 60, 128], (2 * 16 + 2) * 4);
  const engine = new PaintEngine(pixels);
  engine.begin(uv(8, 8), stroke('clone', {cloneSource: uv(2, 2)})); engine.end();
  assert.deepEqual([...engine.pixels.data.slice((8 * 16 + 8) * 4, (8 * 16 + 8) * 4 + 4)], [20, 40, 60, 128]);
  engine.begin(uv(2, 2), stroke()); engine.end();
  engine.begin(uv(2, 2), stroke('restore')); engine.end();
  assert.deepEqual([...engine.pixels.data.slice((2 * 16 + 2) * 4, (2 * 16 + 2) * 4 + 4)], [20, 40, 60, 128]);
});

test('no-op strokes have no history and alpha-composite brush colors', () => {
  const engine = new PaintEngine(surface());
  engine.begin(uv(2, 2), stroke('brush', {opacity: 0})); engine.end();
  assert.equal(engine.dirty, false); assert.equal(engine.canUndo, false);
  engine.begin(uv(2, 2), stroke('brush', {opacity: .5})); engine.end();
  assert.equal(engine.sample(uv(2, 2)), '#ff8080');
});

test('validates bounded surfaces and stroke parameters before allocation', () => {
  assert.throws(() => new PaintEngine({...surface(), width: 2049}), /paint.resolutionLimit/);
  const engine = new PaintEngine(surface());
  assert.throws(() => engine.begin({u: NaN, v: 0}, stroke()), /paint.uv/);
  assert.throws(() => engine.begin(uv(2, 2), stroke('brush', {radius: 0})), /paint.stroke/);
});

test('clone reads untouched source when the path overlaps previous destination', () => {
  const pixels = surface(); pixels.data.set([0,0,0,255], (2 * 16 + 2) * 4);
  const engine = new PaintEngine(pixels);
  engine.begin(uv(4,2),stroke('clone',{cloneSource:uv(2,2)}));
  engine.move(uv(6,2)); engine.end();
  assert.equal(engine.sample(uv(4,2)),'#000000');
  assert.equal(engine.sample(uv(6,2)),'#ffffff');
});

test('dirty remains exact after history pruning and while a stroke is active', () => {
  const engine = new PaintEngine(surface(1024));
  const point = uv(2,2,1024);
  for (let index=0;index<10;index++) {
    engine.begin(point,stroke('brush',{color:index%2?'#000000':'#ff0000'}));
    assert.equal(engine.dirty,true); engine.end();
  }
  engine.begin(point,stroke('restore')); engine.end();
  assert.equal(engine.dirty,false);
  engine.undo();assert.equal(engine.dirty,true);
  engine.redo();assert.equal(engine.dirty,false);
  let undoCount=0;
  while(engine.canUndo){engine.undo();undoCount++;}
  assert.ok(undoCount<=8);
});
