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
console.log(uri)
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 })

//build api with mongodb
async function run() {
    try {
        await client.connect()
        const serviceCollection = client.db('doctors_portal').collection('services')

        app.get('/services', async (req, res) => {
            const query = {}
            const cursor = serviceCollection.find(query)
            const service = await cursor.toArray()
            res.send(service)
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