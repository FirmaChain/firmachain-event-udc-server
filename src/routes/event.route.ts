import { Router } from 'express';
import { Routes } from '../interfaces/routes.interface';

import StoreService from '../services/store.service';
import EventController from '../controllers/event.controller';

class EventRoute implements Routes {
  constructor(
    public storeService: StoreService,
    public path = '/event',
    public router = Router(),
    private eventController = new EventController(storeService)
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes() {
    this.router.get(`${this.path}/requests/:requestKey`, this.eventController.getStatus);
    this.router.get(`${this.path}/users/:signer`, this.eventController.getUserInfo);

    this.router.post(`${this.path}/sign/login`, this.eventController.arbitarySignForLogin);
    this.router.post(`${this.path}/sign/play`, this.eventController.directSignForPlay);
    this.router.post(`${this.path}/sign/reward`, this.eventController.arbitarySignForReward);
    this.router.post(`${this.path}/callback`, this.eventController.callback);
    this.router.post(`${this.path}/verify`, this.eventController.verify);

    this.router.get(`${this.path}/nft`, this.eventController.getNftList);
    this.router.get(`${this.path}/nft/:nftId`, this.eventController.getNftMetadata);
  }
}

export default EventRoute;
