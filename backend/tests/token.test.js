const assert = require('node:assert/strict');
const test = require('node:test');
const { signToken, verifyToken } = require('../utils/token');

test('verifyToken rejects malformed signatures without throwing', () => {
    assert.equal(verifyToken('not-a-valid-token'), null);
    assert.equal(verifyToken('a.b.short'), null);
});

test('verifyToken rejects tokens with an unsupported header algorithm', () => {
    const token = signToken({ id: 'user-1', role: 'driver' });
    const [encodedHeader, encodedBody, signature] = token.split('.');
    const invalidHeader = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    assert.equal(verifyToken(`${invalidHeader}.${encodedBody}.${signature}`), null);
    assert.ok(encodedHeader);
});

test('signToken creates a token that can be verified', () => {
    const token = signToken({ id: 'user-1', role: 'driver' });
    assert.deepEqual(verifyToken(token).role, 'driver');
});
