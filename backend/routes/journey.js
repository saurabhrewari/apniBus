// backend/routes/journey.js
const express = require('express');
const router = express.Router();
const Bus = require('../models/Bus');
const Stop = require('../models/Stop'); // <-- ADD THIS MISSING LINE
const { requireAuth } = require('../middleware/auth');

function stopQuery(name) {
    return {
        $or: [
            { stopName: name },
            { name }
        ]
    };
}

function stopName(stop) {
    return stop?.stopName || stop?.name;
}

// ... the rest of your code is correct and remains the same // <-- ADD THIS LINE

// ... the rest of your code remains the same

// @route   POST /api/journey/start
// @desc    Start a journey for a bus
// @route   POST /api/journey/start
// @desc    Start a journey for a bus (Final Correct Version)
router.post('/start', requireAuth(['authority', 'driver']), async (req, res) => {
    try {
        const { busNumber, busRoute } = req.body;
        if (!busNumber || !busRoute) {
            return res.status(400).json({ msg: 'Bus number and route are required' });
        }

        // Find the IDs for the stops in the new route
        const stopNames = busRoute.split(',').map(name => name.trim());
        const stopDocs = await Stop.find({
            $or: [
                { stopName: { $in: stopNames } },
                { name: { $in: stopNames } }
            ]
        });

        if (stopDocs.length !== stopNames.length) {
            return res.status(400).json({ msg: 'One or more stops were not found in the database.' });
        }
        
        // Put the stops in the correct order as entered by the user
        const orderedStopIds = stopNames.map(name => {
            const found = stopDocs.find(doc => stopName(doc) === name);
            return found._id;
        });

        // Find the bus by its number and update it, or create a new one if it doesn't exist.
        // This is a robust way to handle both new and existing buses.
        const updatedBus = await Bus.findOneAndUpdate(
            { busNumber: busNumber },
            {
                $set: {
                    stops: orderedStopIds, // Set the new route
                    isJourneyActive: true,
                    currentStopIndex: 0
                }
            },
            {
                new: true, // Return the updated document
                upsert: true // Create the bus if it does not exist
            }
        );

        res.json({ msg: 'Journey started successfully', bus: updatedBus });

    } catch (err) {
        console.error("Error in /start route:", err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
});


// @route   POST /api/journey/findbus
// @desc    Find buses between two stops
// @route   POST /api/journey/findbus
// @desc    Find buses between two stops (using a more robust method)
// @route   POST /api/journey/findbus
// @desc    Find buses between two stops (Final Correct Version)
router.post('/findbus', async (req, res) => {
    try {
        const { from, to } = req.body;

        if (!from || !to) {
            return res.status(400).json({ msg: "Please provide both 'from' and 'to' stops." });
        }

        // Step 1: Find the actual documents for the 'from' and 'to' stops to get their IDs.
        const fromStop = await Stop.findOne(stopQuery(from));
        const toStop = await Stop.findOne(stopQuery(to));

        if (!fromStop || !toStop) {
            return res.status(404).json({ msg: 'One or both stops could not be found.' });
        }

        // Step 2: Now, use the IDs of the stops to find the buses.
        const buses = await Bus.find({
            stops: { $all: [fromStop._id, toStop._id] }
        }).populate('stops'); // Populate to get full stop details

        if (!buses || buses.length === 0) {
            return res.status(404).json({ msg: 'No buses found for this route.' });
        }
        
        // Step 3: Filter to ensure the 'from' stop comes before the 'to' stop.
        const validBuses = buses.filter(bus => {
            const fromIndex = bus.stops.findIndex(stop => stopName(stop) === from);
            const toIndex = bus.stops.findIndex(stop => stopName(stop) === to);
            return fromIndex < toIndex;
        });

        if (validBuses.length === 0) {
            return res.status(404).json({ msg: 'No buses found traveling in the correct direction.' });
        }

        res.json(validBuses);

    } catch (err) {
        console.error("Error in /findbus route:", err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
});

// @route   GET /api/journey/status
// @desc    Get the status of the currently active journey
router.get('/status', async (req, res) => {
    try {
        const activeBus = await Bus.findOne({ isJourneyActive: true }).populate('stops');
        if (!activeBus) {
            return res.status(404).json({ msg: 'No active journey found' });
        }
        res.json(activeBus);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});


// @route   POST /api/journey/end
// @desc    End a journey for a specific bus
router.post('/end', requireAuth(['authority', 'driver']), async (req, res) => {
    try {
        const { busNumber } = req.body; // Assuming busNumber is sent to end the journey
        const bus = await Bus.findOneAndUpdate(
            { busNumber: busNumber, isJourneyActive: true },
            { isJourneyActive: false },
            { new: true }
        );
        if (!bus) {
            return res.status(404).json({ msg: 'Active bus not found' });
        }
        res.json({ msg: 'Journey ended successfully', bus });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});


// @route   PATCH /api/journey/seats
// @desc    Update the number of available seats
router.patch('/seats', requireAuth(['authority', 'driver']), async (req, res) => {
    try {
        const { busNumber, seats } = req.body;
        const bus = await Bus.findOneAndUpdate(
            { busNumber: busNumber, isJourneyActive: true },
            { seatsAvailable: seats },
            { new: true }
        );
        if (!bus) {
            return res.status(404).json({ msg: 'Active bus not found' });
        }
        res.json({ msg: 'Seat count updated', bus });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});


module.exports = router;
