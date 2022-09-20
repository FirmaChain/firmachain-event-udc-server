import * as dotenv from 'dotenv';
dotenv.config();

import TelegramBot from 'node-telegram-bot-api';
import { FirmaSDK } from '@firmachain/firma-js';

import StoreService from './services/store.service';

import { FIRMA_CONFIG } from './config';
import { logger } from './utils/logger';
import { getNowTime } from './utils/date';
import { getDecryptString } from './utils/crypto';

import {
  EVENT_WALLET_MNEMONIC,
  EVENT_TOKEN_ID,
  EVENT_REWARD_QUEUE,
  EVENT_REWARD_RESULT,
  SECRET,
} from './constants/event';

const REDIS = process.env.REDIS!;
const REDIS_PASS = process.env.REDIS_PASS!;
const BOT_TOKEN = process.env.BOT_TOKEN!;
const CHAT_ID = process.env.CHAT_ID!;
const EXPLORER_HOST = process.env.EXPLORER_HOST!;

const telegrambot = new TelegramBot(BOT_TOKEN, { polling: false });

class EventScheduler {
  constructor(
    private storeService = new StoreService({ url: REDIS, password: REDIS_PASS }),
    private firmaSDK = new FirmaSDK(FIRMA_CONFIG)
  ) {
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

        const decryptMnemonic = getDecryptString(EVENT_WALLET_MNEMONIC, SECRET);
        const eventWallet = await this.firmaSDK.Wallet.fromMnemonic(decryptMnemonic);

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

          telegrambot.sendMessage(CHAT_ID, `[GAME][FAILED] ${tokenAmount} UET ${address} ${sendTokenResult}`, {
            disable_web_page_preview: true,
          });
        } else {
          await this.writeResult(address, sendTokenResult.transactionHash);
          logger.info(`🚀[EVENT] ${address} : ${sendTokenResult.transactionHash}`);

          telegrambot.sendMessage(
            CHAT_ID,
            `[GAME][SUCCESS] ${tokenAmount} UET ${address}\n${EXPLORER_HOST}/transactions/${sendTokenResult.transactionHash}`,
            { disable_web_page_preview: true }
          );
        }

        logger.info(`🚀[EVENT] SEND NFT ${nftId}`);

        const sendNFTResult = await this.firmaSDK.Nft.transfer(eventWallet, address, nftId);

        if (sendNFTResult.code !== 0) {
          logger.info(`🚀[EVENT] !!!FAILED!!! SEND NFT ${address} code : ${sendNFTResult.code}`);
          logger.info(sendNFTResult);

          telegrambot.sendMessage(CHAT_ID, `[GAME][FAILED] NFT #${nftId} ${address} ${sendNFTResult}`, {
            disable_web_page_preview: true,
          });
        } else {
          await this.writeResult(address, sendNFTResult.transactionHash);
          logger.info(`🚀[EVENT] ${address} : ${sendNFTResult.transactionHash}`);

          telegrambot.sendMessage(
            CHAT_ID,
            `[GAME][SUCCESS] NFT #${nftId} ${address}\n${EXPLORER_HOST}/transactions/${sendNFTResult.transactionHash}`,
            { disable_web_page_preview: true }
          );
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
