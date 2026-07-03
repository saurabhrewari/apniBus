const assert = require('node:assert/strict');
const test = require('node:test');
const { calculateEtaForBus, haversineDistanceKm } = require('../utils/tracking');

test('haversineDistanceKm returns zero for same point', () => {
    const distance = haversineDistanceKm(
        { latitude: 28.197, longitude: 76.617 },
        { latitude: 28.197, longitude: 76.617 }
    );

    assert.equal(distance, 0);
});

test('haversineDistanceKm returns approximate distance between Rewari and Dharuhera', () => {
    const distance = haversineDistanceKm(
        { latitude: 28.197, longitude: 76.617 },
        { latitude: 28.205, longitude: 76.796 }
    );

    assert.ok(distance > 17);
    assert.ok(distance < 19);
});

test('calculateEtaForBus moves to next stop when bus is at current stop', () => {
    const now = new Date('2026-07-02T08:00:00.000Z');
    const eta = calculateEtaForBus(
        {
            averageSpeedKmph: 30,
            currentStopIndex: 0,
            stops: [
                {
                    _id: 'stop-a',
                    stopName: 'Rewari Stand',
                    coordinates: { latitude: 28.197, longitude: 76.617 }
                },
                {
                    _id: 'stop-b',
                    stopName: 'Dharuhera',
                    coordinates: { latitude: 28.205, longitude: 76.796 }
                }
            ]
        },
        [{ stopSequence: 1, arrivalTime: '09:00' }],
        { latitude: 28.197, longitude: 76.617 },
        now
    );

    assert.equal(eta.nextStopIndex, 1);
    assert.equal(eta.nextStopName, 'Dharuhera');
    assert.ok(eta.etaMinutes > 30);
});
