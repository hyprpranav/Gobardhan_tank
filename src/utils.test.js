import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateGasProductionHours } from './utils.js';

test('estimateGasProductionHours returns a healthy runtime in stable conditions', () => {
  const result = estimateGasProductionHours({
    methane: 1500,
    pressure: 1020,
    slurryTemp: 36,
    outsideTemp: 28,
  });

  assert.equal(typeof result.hours, 'number');
  assert.ok(result.hours > 30 && result.hours < 80);
  assert.match(result.label, /STABLE|GOOD|RECOMMENDED/);
});

test('estimateGasProductionHours reduces runtime in poor operating conditions', () => {
  const result = estimateGasProductionHours({
    methane: 250,
    pressure: 850,
    slurryTemp: 12,
    outsideTemp: 18,
  });

  assert.ok(result.hours < 20);
  assert.match(result.label, /LOW|POOR|CRITICAL/);
});
