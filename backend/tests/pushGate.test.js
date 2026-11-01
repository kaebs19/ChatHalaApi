// اختبارات بوابة الإشعارات — سوكت حقيقي بلا قاعدة بيانات
// التشغيل: node --test tests/pushGate.test.js
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const { io: connectClient } = require('socket.io-client');

process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'error';
const { hasForegroundDevice, pushUnlessForeground } = require(path.join(__dirname, '..', 'utils', 'pushGate'));

describe('push gate', () => {
    let server, port;
    const clients = [];

    before(async () => {
        server = http.createServer();
        global.io = new Server(server);
        global.connectedUsers = new Map();
        global.io.on('connection', socket => {
            socket.data.supportsPresenceProbe = socket.handshake.auth.presenceProbe === true;
            const id = socket.handshake.auth.userId;
            const entry = global.connectedUsers.get(id);
            if (entry) entry.sockets.add(socket.id);
            else global.connectedUsers.set(id, { sockets: new Set([socket.id]) });
        });
        await new Promise(resolve => server.listen(0, resolve));
        port = server.address().port;
    });

    after(async () => {
        clients.forEach(c => c.close());
        await global.io.close();
        delete global.io;
        delete global.connectedUsers;
    });

    const connect = (auth, onProbe) => new Promise(resolve => {
        const client = connectClient(`http://127.0.0.1:${port}`, { auth, transports: ['websocket'] });
        clients.push(client);
        if (onProbe) client.on('presence-probe', onProbe);
        client.on('connect', () => setTimeout(() => resolve(client), 20));
    });

    test('offline user gets the push immediately', async () => {
        assert.equal(await hasForegroundDevice('nobody'), false);
    });

    test('foreground device suppresses the push', async () => {
        await connect({ userId: 'fg', presenceProbe: true }, ack => ack({ active: true }));
        let sent = 0;
        await pushUnlessForeground('fg', async () => { sent++; });
        assert.equal(sent, 0);
    });

    test('backgrounded device gets the push', async () => {
        await connect({ userId: 'bg', presenceProbe: true }, ack => ack({ active: false }));
        let sent = 0;
        await pushUnlessForeground('bg', async () => { sent++; });
        assert.equal(sent, 1);
    });

    test('suspended device that never answers gets the push', async () => {
        await connect({ userId: 'zombie', presenceProbe: true }, () => {});
        let sent = 0;
        await pushUnlessForeground('zombie', async () => { sent++; });
        assert.equal(sent, 1);
    });

    test('one foreground device among several suppresses the push', async () => {
        await connect({ userId: 'multi', presenceProbe: true }, () => {});
        await connect({ userId: 'multi', presenceProbe: true }, ack => ack({ active: true }));
        assert.equal(await hasForegroundDevice('multi'), true);
    });

    test('old app versions keep the previous behaviour', async () => {
        await connect({ userId: 'old' });
        let sent = 0;
        await pushUnlessForeground('old', async () => { sent++; });
        assert.equal(sent, 0);
    });

    test('a failed send never rejects', async () => {
        await assert.doesNotReject(pushUnlessForeground('nobody', async () => { throw new Error('fcm down'); }));
    });
});
