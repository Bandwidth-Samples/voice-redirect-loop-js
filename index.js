import { CallsApi, Configuration, Bxml } from 'bandwidth-sdk';
import express from 'express';

const BW_ACCOUNT_ID = process.env.BW_ACCOUNT_ID;
const BW_VOICE_APPLICATION_ID = process.env.BW_VOICE_APPLICATION_ID;
const BW_NUMBER = process.env.BW_NUMBER;
const BW_USERNAME = process.env.BW_USERNAME;
const BW_PASSWORD = process.env.BW_PASSWORD;
const LOCAL_PORT = process.env.LOCAL_PORT;
const BASE_CALLBACK_URL = process.env.BASE_CALLBACK_URL;

if([
    BW_ACCOUNT_ID,
    BW_VOICE_APPLICATION_ID,
    BW_NUMBER,
    BW_USERNAME,
    BW_PASSWORD,
    LOCAL_PORT,
    BASE_CALLBACK_URL
].some(item => item === undefined)) {
    throw new Error('Please set the environment variables defined in the README');
}

const config = new Configuration({
    username: BW_USERNAME,
    password: BW_PASSWORD
});

const app = express();
app.use(express.json());

const activeCalls = new Set();

app.post('/callbacks/inboundCall', async (req, res) => {
    const callback = req.body;

    if (callback.eventType === 'initiate') { activeCalls.add(callback.callId); }

    const response = new Bxml.Response();

    if (callback.eventType === 'initiate' || callback.eventType === 'redirect') {
        const speakSentence = new Bxml.SpeakSentence('Hello, this call will be updated in 10 seconds.');
        const ring = new Bxml.Ring({ duration: 30 });
        const redirect = new Bxml.Redirect({ redirectUrl: '/callbacks/inboundCall' });
        response.addVerbs([speakSentence, ring, redirect]);
    }

    res.status(200).send(response.toBxml());
});

app.post('/callbacks/callEnded', async (req, res) => {
    const callback = req.body;

    const response = new Bxml.Response();

    if (callback.eventType === 'redirect') {
        const speakSentence = new Bxml.SpeakSentence('The call has been ended. Goodbye');
        response.addVerbs(speakSentence);
    }

    res.status(200).send(response.toBxml());
});

app.delete('/calls/:callId', async (req, res) => {
    const callId = req.params.callId;
    const callsApi = new CallsApi(config);

    if (!activeCalls.has(callId)) {
        res.sendStatus(404);
    } else {
        try {
            const { status } = await callsApi.updateCall(
                BW_ACCOUNT_ID,
                callId,
                {
                    redirectUrl: `${BASE_CALLBACK_URL}/callbacks/callEnded`
                }
            );
            res.status(status).send();
        } catch(e) {
            res.status(500).send(e.message);
        }        
    }
});

app.get('/calls', async (req, res) => {
    res.status(200).send([...activeCalls]);
});

app.listen(LOCAL_PORT);
