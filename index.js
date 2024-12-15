require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion } = require('mongodb');
const app = express();
const port = process.env.PORT || 5000;

// middlewares
app.use(cors());
app.use(express.json());




const uri = `mongodb+srv://${process.env.DB_name}:${process.env.DB_pass}@cluster0.a1a1zbo.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    await client.connect();

    
    // database collections
    const categoriesCollection = client.db('Superio').collection('categories');
    const jobsCollection = client.db('Superio').collection('jobs');



    // categories related api
    app.get('/categories', async(req, res) => {
        const result = await categoriesCollection.find().toArray();
        res.send(result);
    });


    // jobs related api
    app.get('/jobs', async(req, res) => {
        const result = await jobsCollection.find().toArray();
        res.send(result);
    })


    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);




app.get('/', (req, res) => {
    res.send('Superio server is running...')
})

app.listen(port, () => {
    console.log('Superio server is running...');
})