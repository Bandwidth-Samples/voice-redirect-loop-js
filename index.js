import { CallsApi, Configuration, Bxml } from 'bandwidth-sdk';
import express from 'express';

const BW_ACCOUNT_ID = process.env.BW_ACCOUNT_ID;
const BW_CLIENT_ID = process.env.BW_CLIENT_ID;
const BW_CLIENT_SECRET = process.env.BW_CLIENT_SECRET;
const BASE_CALLBACK_URL = process.env.BASE_CALLBACK_URL;
const LOCAL_PORT = process.env.LOCAL_PORT;

if([
    BW_ACCOUNT_ID,
    BW_CLIENT_ID,
    BW_CLIENT_SECRET,
    BASE_CALLBACK_URL,
    LOCAL_PORT
].some(item => item === undefined) || !Number.isInteger(Number(LOCAL_PORT))) {
    throw new Error('Please set the environment variables defined in the README');
}

const config = new Configuration({
    clientId: BW_CLIENT_ID,
    clientSecret: BW_CLIENT_SECRET
});

const app = express();
app.use(express.json());

const activeCalls = new Set();

app.post('/callbacks/inbound/voice', async (req, res) => {
    const callback = req.body;
    if (callback?.eventType !== 'initiate' && callback?.eventType !== 'redirect') {
        return res.sendStatus(400);
    }

    if (callback.eventType === 'initiate') {
        activeCalls.add(callback.callId);
    }

    const speakSentence = new Bxml.SpeakSentence('Redirecting call, please wait.');
    const ring = new Bxml.Ring({ duration: 30 });
    const redirect = new Bxml.Redirect({ redirectUrl: '/callbacks/inbound/voice' });
    const response = new Bxml.Response([speakSentence, ring, redirect]);

    res.set('Content-Type', 'application/xml');
    res.status(200).send(response.toBxml());
});

app.post('/callbacks/inbound/voice/callEnded', async (req, res) => {
    const callback = req.body;
    if (callback?.eventType !== 'redirect') {
        return res.sendStatus(400);
    }

    const speakSentence = new Bxml.SpeakSentence('The call has been ended. Goodbye.');
    const hangup = new Bxml.Hangup();
    const response = new Bxml.Response([speakSentence, hangup]);

    res.set('Content-Type', 'application/xml');
    res.status(200).send(response.toBxml());
});

app.post('/callbacks/inbound/voice/disconnect', async (req, res) => {
    const callback = req.body;
    if (callback?.eventType !== 'disconnect') {
        return res.sendStatus(400);
    }

    activeCalls.delete(callback.callId);
    res.sendStatus(204);
});

app.get('/calls', async (req, res) => {
    res.status(200).json([...activeCalls]);
});

app.delete('/calls/:callId', async (req, res) => {
    const callId = req.params.callId;
    if (!activeCalls.has(callId)) {
        return res.sendStatus(404);
    }

    try {
        const callsApi = new CallsApi(config);
        await callsApi.updateCall(BW_ACCOUNT_ID, callId, {
            redirectUrl: `${BASE_CALLBACK_URL}/callbacks/inbound/voice/callEnded`
        });
    } catch (err) {
        console.error('Failed to update call:', err.message);
        return res.sendStatus(500);
    }

    activeCalls.delete(callId);
    res.sendStatus(204);
});

app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') {
        return res.sendStatus(400);
    }
    next(err);
});

app.listen(LOCAL_PORT);
