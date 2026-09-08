const crypto = require('crypto');

const TOKEN_TTL_MS = 1000 * 60 * 60 * 12;

function getSecret() {
    return process.env.JWT_SECRET || process.env.SESSION_SECRET || 'apnibus-dev-secret';
}

function base64UrlEncode(value) {
    return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function base64UrlDecode(value) {
    return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
}

function signToken(payload) {
    const header = { alg: 'HS256', typ: 'JWT' };
    const body = {
        ...payload,
        exp: Date.now() + TOKEN_TTL_MS
    };
    const encodedHeader = base64UrlEncode(header);
    const encodedBody = base64UrlEncode(body);
    const signature = crypto
        .createHmac('sha256', getSecret())
        .update(`${encodedHeader}.${encodedBody}`)
        .digest('base64url');

    return `${encodedHeader}.${encodedBody}.${signature}`;
}

function verifyToken(token) {
    try {
        if (!token || typeof token !== 'string') {
            return null;
        }

        const [encodedHeader, encodedBody, signature] = token.split('.');
        if (!encodedHeader || !encodedBody || !signature) {
            return null;
        }

        const header = base64UrlDecode(encodedHeader);
        if (header.alg !== 'HS256' || header.typ !== 'JWT') {
            return null;
        }

        const expectedSignature = crypto
            .createHmac('sha256', getSecret())
            .update(`${encodedHeader}.${encodedBody}`)
            .digest('base64url');

        const signatureBuffer = Buffer.from(signature);
        const expectedBuffer = Buffer.from(expectedSignature);
        if (
            signatureBuffer.length !== expectedBuffer.length ||
            !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
        ) {
            return null;
        }

        const payload = base64UrlDecode(encodedBody);
        if (payload.exp && payload.exp < Date.now()) {
            return null;
        }

        return payload;
    } catch (_error) {
        return null;
    }
}

module.exports = {
    signToken,
    verifyToken
};
