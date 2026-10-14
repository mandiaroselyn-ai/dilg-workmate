import assert from 'node:assert/strict';
import test from 'node:test';
import { takeAccuratePosition } from './accuratePosition.js';

const reading = accuracy => ({ coords: { latitude: 13.4, longitude: 121.8, accuracy } });

// Readings in order, and a clock that moves 5 seconds per pause.
const setup = (accuracies, { failWith } = {}) => {
  let time = 0;
  const rough = [];
  const queue = accuracies.map(reading);
  return {
    rough,
    options: {
      first: async () => queue.shift(),
      again: async () => {
        if (failWith && !queue.length) throw failWith;
        return queue.shift();
      },
      requiredMeters: 50,
      onRough: accuracy => rough.push(accuracy),
      now: () => time,
      sleep: async ms => { time += ms * 5; }
    }
  };
};

test('an accurate first reading is used at once', async () => {
  const { options, rough } = setup([12]);
  assert.equal((await takeAccuratePosition(options)).coords.accuracy, 12);
  assert.deepEqual(rough, []);
});

test('rough readings are taken again until one is accurate enough', async () => {
  const { options, rough } = setup([180, 90, 35]);
  assert.equal((await takeAccuratePosition(options)).coords.accuracy, 35);
  assert.deepEqual(rough, [180, 90]);
});

test('the most accurate reading is kept when time runs out', async () => {
  // 40 seconds at 5 seconds per pause allows 8 more readings.
  const { options } = setup([200, 70, 120, 90, 110, 95, 100, 130, 140]);
  assert.equal((await takeAccuratePosition(options)).coords.accuracy, 70);
});

test('it stops asking when location permission is refused', async () => {
  const { options, rough } = setup([200], { failWith: { code: 1 } });
  assert.equal((await takeAccuratePosition(options)).coords.accuracy, 200);
  assert.deepEqual(rough, [200]);
});

test('a reading that fails for another reason is tried again', async () => {
  let calls = 0;
  const { options } = setup([200]);
  options.again = async () => {
    calls += 1;
    if (calls === 1) throw { code: 3 };
    return reading(20);
  };
  assert.equal((await takeAccuratePosition(options)).coords.accuracy, 20);
});
