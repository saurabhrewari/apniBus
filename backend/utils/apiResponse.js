function sendSuccess(res, data = {}, message = 'OK', statusCode = 200) {
    return res.status(statusCode).json({
        success: true,
        message,
        ...data
    });
}

function sendError(res, message = 'Server Error', statusCode = 500, details = null) {
    const payload = {
        success: false,
        msg: message,
        message
    };

    if (details) {
        payload.details = details;
    }

    return res.status(statusCode).json(payload);
}

module.exports = {
    sendError,
    sendSuccess
};
