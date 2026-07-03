const express = require('express');
const router = express.Router();
const Bus = require('../models/Bus');
const Stop = require('../models/Stop');

function stopQuery(name) {
    return {
        $or: [
            { stopName: name },
            { name }
        ]
    };
}

// @route   POST /api/passenger/find-bus
// @desc    Find buses between two stops
router.post('/find-bus', async (req, res) => {
    try {
        const { from, to } = req.body;
        if (!from || !to) {
            return res.status(400).json({ msg: 'Please provide both From and To stops' });
        }

        // Find the IDs for the from and to stops
        const fromStop = await Stop.findOne(stopQuery(from));
        const toStop = await Stop.findOne(stopQuery(to));

        if (!fromStop || !toStop) {
            return res.status(404).json({ msg: 'One or both stops not found' });
        }

        // Find buses that contain both stops in their route
        const buses = await Bus.find({
            stops: { $all: [fromStop._id, toStop._id] }
        }).populate('stops');

        // Further filter to ensure the 'from' stop comes before the 'to' stop in the route
        const validBuses = buses.filter(bus => {
            const stopIds = bus.stops.map(stop => stop._id.toString());
            const fromIndex = stopIds.indexOf(fromStop._id.toString());
            const toIndex = stopIds.indexOf(toStop._id.toString());
            return fromIndex !== -1 && toIndex !== -1 && fromIndex < toIndex;
        });

        res.json(validBuses);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

module.exports = router;
