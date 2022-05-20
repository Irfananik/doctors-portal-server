const express = require('express')
const cors = require('cors')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config()
const nodemailer = require('nodemailer');
const sgTransport = require('nodemailer-sendgrid-transport');

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)

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

const emailSenderOptions = {
    auth: {
        api_key: process.env.EMAIL_SENDER_KEY
    }
}

const emailClient = nodemailer.createTransport(sgTransport(emailSenderOptions))

function sendAppointmentEmail(booking) {
    const { patient, patientName, treatment, date, slot } = booking
    const email = {
        from: process.env.EMAIL_SENDER,
        to: patient,
        subject: `Your appointment for is on ${date} at ${slot} is selected`,
        text: `Hello Deare ${patientName}, Your appointment for ${treatment} is on ${date} at ${slot} is selected.`,
        html: `
            <div>
                <p> Hello ${patientName}, </p>
                <h3>Your Appointment for ${treatment} is selected. Please pay amounts of this appointment using your credit card.</h3>
                <p>Looking forward to seeing you on ${date} at ${slot}.</p>
                
                <h3>Our Address</h3>
                <p>bashundhara, dhaka</p>
                <p>Bangladesh</p>
                <a href="https://web.programming-hero.com/">unsubscribe</a>
            </div>
        `
    }
    emailClient.sendMail(email, function (err, info) {
        if (err) {
            console.log(err);
        }
        else {
            console.log('Message sent: ', info);
        }
    })
}


function sendPaymentEmail(booking) {
    const { patient, patientName, treatment, date, slot } = booking
    const email = {
        from: process.env.EMAIL_SENDER,
        to: patient,
        subject: `We have received your payment for ${treatment} is on ${date} at ${slot} is confirmed`,
        text: `Hello Deare, Your payment for this appointment ${treatment} is on ${date} at ${slot} is confirmed`,
        html: `
            <div>
                <p> Hello ${patientName}, </p>
                <h3>Your Appointment for ${treatment} is confirmed</h3>
                <p>Looking forward to seeing you on ${date} at ${slot}.</p>

                <h3>Our Address</h3>
                <p>bashundhara, dhaka</p>
                <p>Bangladesh</p>
                <a href="https://web.programming-hero.com/">unsubscribe</a>
            </div>
        `
    }
    emailClient.sendMail(email, function (err, info) {
        if (err) {
            console.log(err);
        }
        else {
            console.log('Message sent: ', info);
        }
    })
}

//build api with mongodb
async function run() {
    try {
        await client.connect()
        const serviceCollection = client.db('doctors_portal').collection('services')
        const bookingCollection = client.db('doctors_portal').collection('bookings')
        const userCollection = client.db('doctors_portal').collection('users')
        const doctorCollection = client.db('doctors_portal').collection('doctors')
        const paymentCollection = client.db('doctors_portal').collection('payments')

        const jwtAdmin = async (req, res, next) => {
            const requester = req.decoded.email
            const requesterAccount = await userCollection.findOne({ email: requester })
            if (requesterAccount.role === 'admin') {
                next()
            } else {
                res.status(403).send({ message: 'Forbidden' })
            }
        }

        app.post('/create-payment-intent',jwtToken, async (req, res) => {
            const service = req.body;
            const price = service.price;
            const amount = price * 100;
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: ['card']
            });
            res.send({ clientSecret: paymentIntent.client_secret })
        });

        app.get('/services', async (req, res) => {
            const query = {}
            const cursor = serviceCollection.find(query).project({ name: 1 })
            const service = await cursor.toArray()
            res.send(service)
        })

        app.get('/user', jwtToken, async (req, res) => {
            const users = await userCollection.find().toArray()
            res.send(users)
        })

        app.get('/user/:email', async (req, res) => {
            const email = req.params.email
            const user = await userCollection.findOne({ email: email })
            const isAdmin = user.role === 'admin'
            res.send({ admin: isAdmin })
        })

        app.put('/user/admin/:email', jwtToken, jwtAdmin, async (req, res) => {
            const email = req.params.email
            const filter = { email: email }
            const updateDoc = {
                $set: { role: 'admin' },
            }
            const result = await userCollection.updateOne(filter, updateDoc)
            res.send(result)
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
            } else {
                return res.status(403).send({ message: 'Forbidden access' })
            }
            //const authorization = req.headers.authorization
            //console.log('auth headers', authorization)
        })

        app.get('/booking/:id', jwtToken, async (req, res) => {
            const id = req.params.id
            const query = { _id: ObjectId(id) }
            const booking = await bookingCollection.findOne(query)
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
            console.log('sending email')
            sendAppointmentEmail(booking)
            return res.send({ success: true, result })
        })

        app.patch('/booking/:id', async (req, res) => {
            const id = req.params.id
            const payment = req.body
            const filter = {_id: ObjectId(id)}
            const updatedDoc = {
                $set:{
                    paid: true,
                    transactionId: payment.transactionId
                }
            }
            const result = await paymentCollection.insertOne(payment)
            const updatedBooking = await bookingCollection.updateOne(filter, updatedDoc)
            res.send(updatedDoc)
        })

        app.get('/doctor', async (req, res) => {
            const doctors = await doctorCollection.find().toArray()
            res.send(doctors)
        })

        app.post('/doctor', jwtToken, jwtAdmin, async (req, res) => {
            const doctor = req.body
            const result = await doctorCollection.insertOne(doctor)
            res.send(result)
        })

        app.delete('/doctor/:email', jwtToken, jwtAdmin, async (req, res) => {
            const email = req.params.email
            const filter = { email: email }
            const result = await doctorCollection.deleteOne(filter)
            res.send(result)
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