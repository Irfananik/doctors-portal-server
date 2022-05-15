const express = require('express')
const cors = require('cors')
const { MongoClient, ServerApiVersion } = require('mongodb');
require('dotenv').config()
const jwt = require('jsonwebtoken');
const app = express()
const port = process.env.PORT || 5000

//midleware
app.use(cors())
app.use(express.json())

//connect with mongodb
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.mlvfx.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;

const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 })

function jwtToken(req, res, next) {
    const authHeader = req.headers.authorization
    if (!authHeader) {
        return res.status(401).send({ message: 'UnAuthorized' })
    }
    const token = authHeader.split(' ')[1]
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
        if (err) {
            return res.status(403).send({ message: 'Forbidden access' })
        }
        //console.log(decoded) // bar
        req.decoded = decoded
        next()
    });
}

//build api with mongodb
async function run() {
    try {
        await client.connect()
        const serviceCollection = client.db('doctors_portal').collection('services')
        const bookingCollection = client.db('doctors_portal').collection('bookings')
        const userCollection = client.db('doctors_portal').collection('users')

        app.get('/services', async (req, res) => {
            const query = {}
            const cursor = serviceCollection.find(query)
            const service = await cursor.toArray()
            res.send(service)
        })

        app.put('/user/:email', async (req, res) => {
            const email = req.params.email
            const user = req.body
            const filter = { email: email }
            const options = { upsert: true }
            const updateDoc = {
                $set: user,
            }
            const result = await userCollection.updateOne(filter, updateDoc, options)
            const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' })
            res.send({ result, token })
        })

        app.get('/available', async (req, res) => {
            const date = req.query.date || 'May 14, 2022'

            //get all services - 01
            const services = await serviceCollection.find().toArray()

            //get booking service - 02
            const query = { date: date }
            const booking = await bookingCollection.find(query).toArray()

            //for each service, find booking that service
            services.forEach(service => {
                const serviceBooking = booking.filter(b => b.treatment === service.name)
                const bookedSlots = serviceBooking.map(s => s.slot)
                //service.booked = serviceBooking.map(s => s.slot)
                const available = service.slots.filter(slot => !bookedSlots.includes(slot))
                service.slots = available
            })
            res.send(services)
        })

        app.get('/booking', jwtToken, async (req, res) => {
            const patient = req.query.patient
            const decodedEmail = req.decoded.email
            if (patient === decodedEmail) {
                const query = { patient: patient }
                const booking = await bookingCollection.find(query).toArray()
                return res.send(booking)
            }else{
                return res.status(403).send({ message: 'Forbidden access' }) 
            }
            //const authorization = req.headers.authorization
            //console.log('auth headers', authorization)
        })

        app.post('/booking', async (req, res) => {
            const booking = req.body
            const query = { treatment: booking.treatment, date: booking.date, patient: booking.patient }
            const exist = await bookingCollection.findOne(query)
            if (exist) {
                return res.send({ success: false, booking: exist })
            }
            const result = await bookingCollection.insertOne(booking)
            return res.send({ success: true, result })
        })
    }
    finally {

    }
}
run().catch(console.dir)

app.get('/', (req, res) => {
    res.send('Hello World from doctors portal!')
})

app.listen(port, () => {
    console.log(`Doctors app listening on port ${port}`)
})