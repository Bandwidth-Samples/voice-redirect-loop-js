require('dotenv').config()
import { Client, ApiController, Response, SpeakSentence, Ring,  Redirect } from '@bandwidth/voice'
import express from 'express'

const app = express()
app.use(express.json())

const accountId = process.env.BANDWIDTH_ACCOUNT_ID
const applicationId = process.env.BANDWIDTH_VOICE_APPLICATION_ID
const port = process.env.PORT
const username = process.env.BANDWIDTH_USERNAME
const password = process.env.BANDWIDTH_PASSWORD
const basUrl = process.env.BASE_URL

if (!accountId || !applicationId || !port || !basUrl ) {
    throw new Error(`Enviroment variables not set up properly
    accountId: ${accountId}
    applicationId: ${applicationId}
    port: ${port}`)
}

if (!username){
    throw new Error(`Username: undefined`)
}

if (!password){
    throw new Error(`Password: undefined`)
}

console.log(`Enviroment variables set to:
accountId: ${accountId}
applicationId: ${applicationId}
port: ${port}`)

// initialize the client 
const client = new Client({
    basicAuthPassword: password,
    basicAuthUserName: username
})

// The controller is the main API to the SDK
const controller = new ApiController(client)

// a set to keep track of currently active calls.
const activeCalls = new Set<string>();

app.post('/callbacks/inbound', async (req, res) => {
    const callback = req.body

    const response = new Response()

    if ('initiate' == callback.eventType || 'redirect' == callback.eventType) {
        const ring = new Ring({
            duration: 30
        })

        const redirect = new Redirect({
            redirectUrl: '/callbacks/inbound'
        })
        response.add(ring, redirect)
    }

    if ('initiate' == callback.eventType) {
        activeCalls.add(callback.callId)
    }

    res.status(200).send(response.toBxml())
})

app.post('/callbacks/goodbye', async (req, res) => {
    const callback = req.body

    const response = new Response()

    if ('redirect' == callback.eventType) {
        
        const speakSentence = new SpeakSentence({
            sentence: 'The call has been updated.  Goodbye'
        })
        response.add(speakSentence)

        activeCalls.delete(callback.callId)
    }

    res.status(200).send(response.toBxml())
})

app.delete('/calls/:callId', async (req, res) => {

    const callId = req.params.callId

    if (!activeCalls.has(callId)) {
        res.sendStatus(404)
    } else {
        try {
            const response = await controller.modifyCall(accountId, callId, {
                redirectUrl: `${basUrl}/callbacks/goodbye`
            })
            res.status(response.statusCode).send()
        } catch(e) {
            res.status(500).send(e.message)
        }

        
    }
})

app.get('/activeCalls', async (req, res) => {
    res.status(200).send([...activeCalls])
})

app.listen(port)