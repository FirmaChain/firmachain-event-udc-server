import App from './app';

import StoreService from './services/store.service';

import IndexRoute from './routes/index.route';
import EventRoute from './routes/event.route';
import validateEnv from './utils/validateEnv';

import * as dotenv from 'dotenv';

dotenv.config();
validateEnv();

const storeService = new StoreService({ url: process.env.REDIS!, password: process.env.REDIS_PASS! });

const app = new App([new IndexRoute(), new EventRoute(storeService)]);

app.listen();
