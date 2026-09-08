const assert = require('node:assert/strict');
const test = require('node:test');
const { signToken, verifyToken } = require('../utils/token');

test('verifyToken rejects malformed signatures without throwing', () => {
    assert.equal(verifyToken('not-a-valid-token'), null);
    assert.equal(verifyToken('a.b.short'), null);
});

test('signToken creates a token that can be verified', () => {
    const token = signToken({ id: 'user-1', role: 'driver' });
    assert.deepEqual(verifyToken(token).role, 'driver');
});
