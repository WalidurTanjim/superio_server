require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const cloudinary = require('./cloudinary/cloudinary');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const app = express();
const port = process.env.PORT || 5000;

// middlewares
app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true
}));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(cookieParser());


// verifyToken
const verifyToken = async(req, res, next) => {
  const token = req?.cookies?.token;
  
  if(!token){
    return res.status(401).send({ message: "Unauthorized access" });
  };

  jwt.verify(token, process.env.TOKEN_SECRET, (err, decoded) => {
    if(err){
      return res.status(401).send({ message: "Unauthorized access" });
    }

    req.user = decoded;
    next();
  })
}


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
    const applyJobsCollection = client.db('Superio').collection('applyJobs');


    // jwt related api
    app.post('/createToken', async(req, res) => {
      const userInfo = req.body;
      const token = jwt.sign(userInfo, process.env.TOKEN_SECRET, { expiresIn: '1h' });
      res.cookie('token', token, {
          httpOnly: true,
          secure: false
        }).send({ success: true })
    })


    // categories related api (get all categories)
    app.get('/categories', async(req, res) => {
      const result = await categoriesCollection.find().toArray();
      res.send(result);
    });
    
    // jobs related api
    app.get('/findJobs/:category/:id', async(req, res) => { // get a single job base on category & id
        const category = req.params.category;
        const id = req.params.id;
        const query = { $and: [{ _id: new ObjectId(id) }, { category: category }] };
        const result = await jobsCollection.findOne(query);
        res.send(result);
    })

    // app.get('/updateJob/:category/:id', async(req, res) => {  // unknown api
    //   const category = req.params.category;
    //   const id = req.params.id;
    //   const email = req.query.email;
    //   const query = { $and: [{ _id: new ObjectId(id) }, { category: category }] };
    //   const result = await jobsCollection.findOne(query);
    //   if(email !== result?.hr_email){
    //     return res.status(403).send({ message: 'Forbidden access' })
    //   }else{
    //     res.send(result);
    //   }
    // })

    app.get('/jobs', async(req, res) => {   // get all jobs with pagination
      // get currentPage & itemsPerPage from client side as query
      const page = parseInt(req?.query?.page);
      const size = parseInt(req?.query?.size);
      const search = req?.query?.search;
      const categorySearch = req?.query?.categorySearch;
      let query = {};
      if(search){
        query.title = { $regex: search, $options: 'i' };
      }

      if(categorySearch){
        query.category = { $regex: categorySearch, $options: 'i' };
      }

      // skip jobs 
      const skip = page * size;
      
      const result = await jobsCollection.find(query).skip(skip).limit(size).toArray();
      res.send(result);
    })

    // addJob
    app.post('/addJob', async(req, res) => { // add a new job
      const job = req.body;
      const result = await jobsCollection.insertOne(job);
      res.send(result);
    })
    
    // jobs-posted-by-user related api
    app.get('/myPostedJobs', verifyToken, async(req, res) => { //get all posted jobs by with total apply using aggregate
      const email = req.query.email;  // query email
      const decodedEmail = req?.user?.email;  // decoded email from verifyToken

      // verify user with query email & user info of token
      if(decodedEmail !== email){
        return res.status(403).send({ message: "Forbidden access"});
      }

      const query = { hr_email: email };
      const result = await jobsCollection.find(query).toArray();  // jobs i have posted

      const jobIds = result?.map(job => job?._id.toString()); // get all ids of my posted jobs

      // fetch the count of applicants for each job
      const applicationCounts = await applyJobsCollection.aggregate([
        { $match: { job_id: { $in: jobIds } } },
        { $group: { _id: "$job_id", count: { $sum: 1 } } }
      ]).toArray();
      // console.log(applicationCounts);

      // get application count for each job
      const jobWithApplications = result?.map(job => {
        const applicationData = applicationCounts?.find(appliedJob => appliedJob?._id === job?._id.toString());
        // console.log(applicationData);
        return {
          ...job,
          applicants: applicationData ? applicationData.count : 0
        };
      });
      // console.log(jobWithApplications);


      // send my posted job with applicationCount as response to the client side
      res.send(jobWithApplications);
    })

    app.delete('/myPostedJobs/:id', verifyToken, async(req, res) => { // delete a single job posted by me
      const email = req.query.email;
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await jobsCollection.findOne(query);
      if(email !== result?.hr_email){
        console.log('validation failed')
        return res.status(403).send({ message: "Forbidden access" });
      }else{
        console.log('delete successfully')
        const deletedJob = await jobsCollection.deleteOne(query);
        res.send(deletedJob);
      }
    })

    app.put('/updateJob/:category/:id', async(req, res) => {  // update a single job posted by me
      const category = req.params.category;
      const id = req.params.id;
      const job = req.body;

      const query = { $and: [{ _id: new ObjectId(id) }, { category: category }] };
      const options = { upsert: true };
      const updatedJob = {
        $set: job
      };
      const result = await jobsCollection.updateOne(query, updatedJob, options);
      res.send(result);
    })



    // applyJob related apis
    app.get('/applyJob', verifyToken, async(req, res) => {  // get my all applied jobs
      const decodedEmail = req?.user?.email;
      const email = req.query.email;
      
      if(decodedEmail !== email){
        return res.status(403).send({ message: "Forbidden access" });
      }

      const query = { email: email };
      const result = await applyJobsCollection.find(query).toArray();
      let jobsResult = [];
      if(!result){
        return res.status(400).send({ message: 'No job applications available' })
      }else{
        for(const jobId of result){
          const id = jobId?.job_id;

          const jobQuery = { _id: new ObjectId(id) };
          const result = await jobsCollection.findOne(jobQuery);
          if(result){
            jobsResult.push(result);
          }
        }
      }
      // console.log('Jobs result:', jobsResult);
      res.send(jobsResult);
    })

    app.post('/applyJob', async(req, res) => {   // apply a single job
      const job = req.body;
      const result = await applyJobsCollection.insertOne(job);
      res.send(result);
    })


    // get jobs length
    app.get('/jobsCount', async(req, res) => {
      const count = await jobsCollection.estimatedDocumentCount();
      res.send({ count });
    })



    // logout
    app.post('/logout', (req, res) => {
      res.clearCookie('token', {
        httpOnly: true,
        secure: false
      }).send({ success: true });
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

// cloudinary related api
app.post('/', async(req, res) => {
  const { company_logo } = req.body;
  cloudinary.uploader
      .upload(company_logo, {
          upload_preset: "superio_company_logo_preset",
          allowed_formats: ['png', 'jpg', 'jpeg', 'svg', 'ico', 'jfif', 'webp']
      })
      .then(result => {
          console.log(result);
          res.status(200).send(result);
      })
});


app.listen(port, () => {
    console.log('Superio server is running...');
})