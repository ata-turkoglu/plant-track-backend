import cors from 'cors';
import express from 'express';
import morgan from 'morgan';

import healthRoutes from './routes/health.js';
import authRoutes from './routes/auth.js';
import organizationsRoutes from './routes/organizations.js';
import locationsRoutes from './routes/locations.js';
import warehousesRoutes from './routes/warehouses.js';

const app = express();
const port = Number(process.env.PORT ?? 3001);

app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

app.use('/api', healthRoutes);
app.use('/api', authRoutes);
app.use('/api', organizationsRoutes);
app.use('/api', locationsRoutes);
app.use('/api', warehousesRoutes);

app.use((_req, res) => {
  res.status(404).json({ message: 'Not found' });
});

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Backend listening on http://localhost:${port}`);
});
