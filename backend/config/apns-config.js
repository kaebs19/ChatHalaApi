// Apple Push Notification Service (APNs) Configuration

module.exports = {
    apns: {
        keyId: process.env.APNS_KEY_ID,
        teamId: process.env.APPLE_TEAM_ID,
        bundleId: process.env.APPLE_BUNDLE_ID || 'com.alsaplel.octadevtn.HalaChat',
        keyPath: process.env.APNS_KEY_PATH || __dirname + '/AuthKey_' + (process.env.APNS_KEY_ID || '') + '.p8',
        production: process.env.NODE_ENV === 'production',
        server: process.env.NODE_ENV === 'production'
            ? 'api.push.apple.com:443'
            : 'api.sandbox.push.apple.com:443'
    }
};
