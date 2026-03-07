import cors from 'cors';
import express from 'express';
import morgan from 'morgan';

import healthRoutes from './routes/health.js';
import authRoutes from './routes/auth.js';
import organizationsRoutes from './routes/organizations.js';
import locationsRoutes from './routes/locations.js';
import warehousesRoutes from './routes/warehouses.js';
import warehouseTypesRoutes from './routes/warehouseTypes.js';
import inventoryItemsRoutes from './routes/inventoryItems.js';
import inventoryItemCardsRoutes from './routes/inventoryItemCards.js';
import inventoryMovementsRoutes from './routes/inventoryMovements.js';
import unitsRoutes from './routes/units.js';
import currenciesRoutes from './routes/currencies.js';
import nodesRoutes from './routes/nodes.js';
import firmsRoutes from './routes/firms.js';
import translationsRoutes from './routes/translations.js';
import assetsRoutes from './routes/assets.js';
import assetCardsRoutes from './routes/assetCards.js';
import maintenanceWorkOrdersRoutes from './routes/maintenanceWorkOrders.js';

const app = express();
const port = Number(process.env.PORT ?? 3001);

app.use(cors());
app.use(morgan('dev'));
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT ?? '12mb' }));
app.use(express.urlencoded({ extended: true, limit: process.env.JSON_BODY_LIMIT ?? '12mb' }));

app.use((err, _req, res, next) => {
  if (err && (err.type === 'entity.too.large' || err.name === 'PayloadTooLargeError')) {
    return res.status(413).json({ message: 'Request entity too large' });
  }
  return next(err);
});

app.use('/api', healthRoutes);
app.use('/api', authRoutes);
app.use('/api', organizationsRoutes);
app.use('/api', locationsRoutes);
app.use('/api', warehousesRoutes);
app.use('/api', warehouseTypesRoutes);
app.use('/api', inventoryItemsRoutes);
app.use('/api', inventoryItemCardsRoutes);
app.use('/api', inventoryMovementsRoutes);
app.use('/api', unitsRoutes);
app.use('/api', currenciesRoutes);
app.use('/api', nodesRoutes);
app.use('/api', firmsRoutes);
app.use('/api', translationsRoutes);
app.use('/api', assetsRoutes);
app.use('/api', assetCardsRoutes);
app.use('/api', maintenanceWorkOrdersRoutes);

app.use((_req, res) => {
  res.status(404).json({ message: 'Not found' });
});

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Backend listening on http://localhost:${port}`);
});
