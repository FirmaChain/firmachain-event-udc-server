import * as dotenv from 'dotenv';
dotenv.config();

import { FirmaSDK } from '@firmachain/firma-js';

import StoreService from './services/store.service';

import { FIRMA_CONFIG } from './config';
import { logger } from './utils/logger';
import { getNowTime } from './utils/date';

import { EVENT_WALLET_MNEMONIC, EVENT_TOKEN_ID, EVENT_REWARD_QUEUE, EVENT_REWARD_RESULT } from './constants/event';

const REDIS = process.env.REDIS!;

class EventScheduler {
  constructor(private storeService = new StoreService({ url: REDIS }), private firmaSDK = new FirmaSDK(FIRMA_CONFIG)) {
    this.start();
  }

  private start() {
    this.work();
  }

  private async work() {
    let reward = null;

    try {
      reward = await this.popAddress();

      if (reward !== null) {
        const rewardJSON = JSON.parse(reward);
        const rewadDataJSON = JSON.parse(rewardJSON.rewardData);
        const address = rewardJSON.address;
        const nftId = JSON.parse(rewadDataJSON.nftData).nftId;
        const tokenAmount = rewadDataJSON.tokenData;

        logger.info(`🚀[EVENT] SEND START ${address}`);

        const eventWallet = await this.firmaSDK.Wallet.fromMnemonic(EVENT_WALLET_MNEMONIC);

        logger.info(`🚀[EVENT] SEND TOKEN ${tokenAmount}`);

        const sendTokenResult = await this.firmaSDK.Bank.sendToken(
          eventWallet,
          address,
          EVENT_TOKEN_ID,
          tokenAmount,
          6
        );

        if (sendTokenResult.code !== 0) {
          logger.info(`🚀[EVENT] !!!FAILED!!! SEND TOKEN ${address} code : ${sendTokenResult.code}`);
          logger.info(sendTokenResult);
        } else {
          await this.writeResult(address, sendTokenResult.transactionHash);
          logger.info(`🚀[EVENT] ${address} : ${sendTokenResult.transactionHash}`);
        }

        logger.info(`🚀[EVENT] SEND NFT ${nftId}`);

        const sendNFTResult = await this.firmaSDK.Nft.transfer(eventWallet, address, nftId);

        if (sendNFTResult.code !== 0) {
          logger.info(`🚀[EVENT] !!!FAILED!!! SEND NFT ${address} code : ${sendNFTResult.code}`);
          logger.info(sendNFTResult);
        } else {
          await this.writeResult(address, sendNFTResult.transactionHash);
          logger.info(`🚀[EVENT] ${address} : ${sendNFTResult.transactionHash}`);
        }

        logger.info(`🚀[EVENT] SEND END ${address}`);

        await this.work();
        return;
      } else {
        logger.info(`🚀[EVENT] NO ADDRESS`);
      }
    } catch (error) {
      logger.error(error);
    }

    setTimeout(async () => {
      await this.work();
    }, 3000);
  }

  private async popAddress(): Promise<string | null> {
    return await this.storeService.pop(EVENT_REWARD_QUEUE);
  }

  private async writeResult(address: string, transactionHash: string): Promise<void> {
    await this.storeService.zAdd(EVENT_REWARD_RESULT, getNowTime(), JSON.stringify({ address, transactionHash }));
  }
}

new EventScheduler();
