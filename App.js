const express = require('express');
const app = express();
const mongoose = require('mongoose');
const cors = require('cors')
const uploadsRouter = require('./Routes/uploadRouts')
const commitmentRoute = require('./Routes/commitmentRoute')
const paymentRoute = require('./Routes/PaymentsRoute')
const campainRoute = require('./Routes/campainsRoute')
const transactionRoute = require('./Routes/transactionRoute')
const reportsRoute = require('./Routes/reportsRoute')
const globalErrorHandler = require('./utils/GlobalErrorHandler')
const authRoute = require('./Routes/AuthRoute')
const cookieParser = require("cookie-parser");
const helmet = require('helmet');


require('dotenv').config();
const corsOptions = {
  origin: ['http://localhost:5174', 'http://localhost:5173','https://menegmentapp.netlify.app','https://campain-2-front-production.up.railway.app'],  // Add both dev and prod URLs here
  
  credentials:true
}
app.use(cors(corsOptions))
app.use(helmet());


app.use(express.json( { limit: '5mb' }));
app.use(cookieParser())

app.use('/api/alfon', uploadsRouter);
app.use('/api/commitment', commitmentRoute);
app.use('/api/payments', paymentRoute);
app.use('/api/campain', campainRoute);
app.use('/api/transaction', transactionRoute);
app.use('/api/auth', authRoute);
app.use('/api/reports', reportsRoute);
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'success', message: 'Server is active' });
});


const port = process.env.PORT || 4000;
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
  });
  app.all('*', (req, res) => {
    //change
    res.status(404).json({
        status: 'fail',
        message: 'The requested route is not exist on this server'
    })
})
app.use(globalErrorHandler)


// const dbURI = `mongodb://${process.env.MONGO_INITDB_ROOT_USERNAME}:${process.env.MONGO_INITDB_ROOT_PASSWORD}@${process.env.RAILWAY_PRIVATE_DOMAIN}:27017`;
// const dbURI = `mongodb://mongo:xbFPDoPBcLEJebLrrxgzcCZPKmQkCIQu@${process.env.RAILWAY_PRIVATE_DOMAIN}:27017`;












const connectDB = async (url)=>{
  try{
    await mongoose.connect(url);
    console.log(`Connected to database: ${mongoose.connection.name}`);
    console.log(url);
  }
  catch(err){
    console.log(err.message)
  }

  
}
connectDB(process.env.DB_URI)
.then(()=>{
  console.log("The data base has been connected");
})
.catch(err=> console.log(err.message))
module.exports = app 

  
