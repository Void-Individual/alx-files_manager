import express from 'express';
import routes from './routes/index';

const app = express();
const port = process.env.PORT || 5000;

// Middleware to parse JSON bodies
app.use(express.json());

// Load the routes from the routes dir
app.use('/', routes);

// Start the server and listen at selected port
app.listen(port, () => {
  console.log(`Server runing at localhost:${port}`);
});
