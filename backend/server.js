const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

const combosRouter = require('./routes/combos');
app.use('/api/combos', combosRouter);

app.get('/', (req, res) => {
  res.json({ message: 'BuffBites API is running' });
});

app.listen(process.env.PORT, () => {
  console.log(`Server running on port ${process.env.PORT}`);
});