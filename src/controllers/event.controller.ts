import { Request, Response } from 'express';

import StoreService from '../services/store.service';
import EventService from '../services/event.service';

import { resultLog } from '../utils/logger';
import { SUCCESS, INVALID_KEY } from '../constants/httpResult';

class EventController {
  constructor(public storeService: StoreService, private eventService = new EventService(storeService)) {}

  public getStatus = (req: Request, res: Response): void => {
    const { requestKey } = req.params;

    this.eventService
      .getStatus(requestKey)
      .then((result) => {
        res.send({ ...SUCCESS, result });
      })
      .catch(() => {
        res.send({ ...INVALID_KEY, result: {} });
      });
  };

  public getUserInfo = (req: Request, res: Response): void => {
    const { signer } = req.params;

    this.eventService
      .getUserInfo(signer)
      .then((result) => {
        resultLog(result);
        res.send({ ...SUCCESS, result });
      })
      .catch(() => {
        res.send({ ...INVALID_KEY, result: {} });
      });
  };

  public arbitarySignForLogin = (req: Request, res: Response): void => {
    this.eventService
      .arbitarySignForLogin()
      .then((result) => {
        resultLog(result);
        res.send({ ...SUCCESS, result });
      })
      .catch(() => {
        res.send({ ...INVALID_KEY, result: {} });
      });
  };

  public directSignForPlay = (req: Request, res: Response): void => {
    const { signer, nftType } = req.body;

    this.eventService
      .directSignForPlay(signer, nftType)
      .then((result) => {
        resultLog(result);
        res.send({ ...SUCCESS, result });
      })
      .catch(() => {
        res.send({ ...INVALID_KEY, result: {} });
      });
  };

  public arbitarySignForReward = (req: Request, res: Response): void => {
    const { signer } = req.body;

    this.eventService
      .arbitarySignForReward(signer)
      .then((result) => {
        resultLog(result);
        res.send({ ...SUCCESS, result });
      })
      .catch(() => {
        res.send({ ...INVALID_KEY, result: {} });
      });
  };

  public callback = (req: Request, res: Response): void => {
    const { requestKey, approve, signData } = req.body;

    this.eventService
      .callback(requestKey, approve, signData)
      .then((result) => {
        resultLog(result);
        res.send({ ...SUCCESS, result });
      })
      .catch(() => {
        res.send({ ...INVALID_KEY, result: {} });
      });
  };

  public verify = (req: Request, res: Response): void => {
    const { requestKey, signature } = req.body;

    this.eventService
      .verify(requestKey, signature)
      .then((result) => {
        resultLog(result);
        res.send(result);
      })
      .catch(() => {
        res.send({ requestKey, signature, isValid: false });
      });
  };

  public getNftList = (req: Request, res: Response): void => {
    this.eventService
      .getNftList()
      .then((result) => {
        res.send({ ...SUCCESS, result });
      })
      .catch(() => {
        res.send({ ...INVALID_KEY, result: {} });
      });
  };

  public getNftMetadata = (req: Request, res: Response): void => {
    const { nftId } = req.params;

    this.eventService
      .getNftMetadata(nftId)
      .then((result) => {
        resultLog(result);
        res.send(result);
      })
      .catch(() => {
        res.send({ ...INVALID_KEY, result: {} });
      });
  };
}

export default EventController;
