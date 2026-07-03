const assert = require('node:assert/strict');
const test = require('node:test');
const { validateCoordinates } = require('../middleware/validate');

test('validateCoordinates accepts valid lat/lon', () => {
    assert.equal(validateCoordinates(28.197, 76.617), true);
    assert.equal(validateCoordinates('28.197', '76.617'), true);
});

test('validateCoordinates rejects invalid lat/lon', () => {
    assert.equal(validateCoordinates(91, 76.617), false);
    assert.equal(validateCoordinates(28.197, 181), false);
    assert.equal(validateCoordinates('abc', 76.617), false);
});
