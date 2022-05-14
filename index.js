const express = require('express')
const cors = require('cors')
const { MongoClient, ServerApiVersion } = require('mongodb');
require('dotenv').config()
const app = express()
const port = process.env.PORT || 5000

//midleware
app.use(cors())
app.use(express.json())

//connect with mongodb
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.mlvfx.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;

const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 })

//build api with mongodb
async function run() {
    try {
        await client.connect()
        const serviceCollection = client.db('doctors_portal').collection('services')
        const bookingCollection = client.db('doctors_portal').collection('bookings')

        app.get('/services', async (req, res) => {
            const query = {}
            const cursor = serviceCollection.find(query)
            const service = await cursor.toArray()
            res.send(service)
        })

        app.get('/available', async (req, res) => {
            const date = req.query.date || 'May 14, 2022'

            //get all services - 01
            const services = await serviceCollection.find().toArray()

            //get booking service - 02
            const query = { date: date }
            const booking = await bookingCollection.find(query).toArray()

            //for each service, find booking that service
            services.forEach(service =>{
                const serviceBooking = booking.filter(b => b.treatment === service.name)
                const bookedSlots = serviceBooking.map(s => s.slot)
                //service.booked = serviceBooking.map(s => s.slot)
                const available = service.slots.filter(slot => !bookedSlots.includes(slot))
                service.slots = available
            })
            res.send(services)
        })

        app.get('/booking', async (req, res) => {
            const patient = req.query.patient
            const query = {patient: patient}
            const booking = await bookingCollection.find(query).toArray()
            res.send(booking)

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