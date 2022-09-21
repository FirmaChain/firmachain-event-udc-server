import moment from 'moment';
import { v4 } from 'uuid';
import { EncodeObject } from '@cosmjs/proto-signing';
import { BankTxClient } from '@firmachain/firma-js';

import StoreService from './store.service';
import { ConnectService } from './connect.service';
import { logger } from '../utils/logger';
import {
  SUCCESS,
  INVALID,
  RELAY,
  PROJECT_SECRET_KEY,
  EVENT_REQUEST,
  EVENT_TICKET_RESULT,
  EVENT_REWARD_QUEUE,
  ADDRESSBOOK,
  LOGIN_MESSAGE,
  PLAY_MESSAGE,
  REWARD_MESSAGE,
  REQUEST_EXPIRE_SECOND,
  EVENT_WALLET_ADDRESS,
  EVENT_TICKET_AMOUNT,
  EVENT_REWARD_NFT_DATA,
  EVENT_REWARD_NFT_QUEUE,
  EVENT_REWARD_TOKEN_QUEUE,
} from '../constants/event';

class EventService {
  constructor(public storeService: StoreService, private connectService: ConnectService = new ConnectService(RELAY)) {}

  public async getStatus(
    requestKey: string
  ): Promise<{ message: string; status: number; signer: string; addedAt: string }> {
    try {
      const requestData = await this.getRequest(requestKey);

      return requestData;
    } catch (error) {
      console.log(error);
      throw error;
    }
  }

  public async getUserInfo(signer: string) {
    try {
      const rewardData = await this.getTicketResult(signer);

      return { rewardData };
    } catch (error) {
      console.log(error);
      throw error;
    }
  }

  public async arbitarySignForLogin(): Promise<{ requestKey: string; qrcode: string }> {
    try {
      const message: string = v4();
      const info: string = LOGIN_MESSAGE;

      const session = await this.connectService.connect(PROJECT_SECRET_KEY);
      const qrcode = await this.connectService.getQRCodeForArbitarySign(session, message, info);
      const requestKey = qrcode.replace('sign://', '');

      await this.addRequest('LOGIN', requestKey, message);

      return {
        requestKey,
        qrcode,
      };
    } catch (error) {
      console.log(error);
      throw error;
    }
  }

  public async directSignForPlay(signer: string, nftType: string): Promise<{ requestKey: string; qrcode: string }> {
    try {
      if ((await this.isPlayable(signer, nftType)) === true) {
        const message = this.createSampleMessage(signer);
        const info: string = PLAY_MESSAGE;
        const pubkey = await this.getPubkey(signer);

        const session = await this.connectService.connect(PROJECT_SECRET_KEY);
        const signDoc = await this.connectService.getSignDoc(signer, pubkey, message);

        const qrcode = await this.connectService.getQRCodeForDirectSign(session, signer, signDoc, info, {
          fctPrice: 1,
        });
        const requestKey = qrcode.replace('sign://', '');

        await this.addRequest('PLAY', requestKey, signDoc, signer, nftType);

        return {
          requestKey,
          qrcode,
        };
      } else {
        throw new Error('NOT PLAYABLE');
      }
    } catch (error) {
      console.log(error);
      throw error;
    }
  }

  public async arbitarySignForReward(
    signer: string
  ): Promise<{ requestKey: string; qrcode: string; nftName: string; nftImageURI: string }> {
    try {
      let requestKey = '';
      let qrcode = '';
      let nftName = '';
      let nftImageURI = '';

      // if ((await this.isRewardable(signer)) === true) {
      //   const message: string = v4();
      //   const info: string = REWARD_MESSAGE;

      //   const session = await this.connectService.connect(PROJECT_SECRET_KEY);
      //   qrcode = await this.connectService.getQRCodeForArbitarySign(session, message, info, signer);
      //   requestKey = qrcode.replace('sign://', '');

      //   const rewardData = await this.getTicketResult(signer);
      //   const rewardJSON = JSON.parse(rewardData);
      //   nftName = rewardJSON.nftData.name;
      //   nftImageURI = rewardJSON.nftData.imageURL;

      //   await this.addRequest('REWARD', requestKey, message);
      // }

      return {
        requestKey,
        qrcode,
        nftName,
        nftImageURI,
      };
    } catch (error) {
      console.log(error);
      throw error;
    }
  }

  public async callback(requestKey: string, approve: boolean, signData: any): Promise<void> {
    const requestData = await this.getRequest(requestKey);

    if (approve === false) {
      await this.changeRequestStatus(requestKey, INVALID);
      return;
    }

    try {
      switch (requestData.type) {
        case 'LOGIN':
          await this.callbackLogin(signData, requestKey, requestData.message);
          break;
        case 'PLAY':
          await this.callbackPlay(requestKey, signData, requestData.signer, requestData.extra);
          break;
        case 'REWARD':
          // await this.callbackReward(signData, requestKey, requestData.message);
          break;
      }
    } catch (error) {
      console.log(error);
      await this.changeRequestStatus(requestKey, INVALID);
    }
  }

  private async callbackLogin(signData: any, requestKey: string, originMessage: string) {
    const signRawData = signData.rawData;

    if (await this.connectService.verifyArbitary(signRawData, originMessage)) {
      const signer = signData.address;
      const pubkey = this.connectService.getSingerPubkeyFromSignRaw(signRawData);

      await this.changeRequestStatus(requestKey, SUCCESS);
      await this.changeRequestSigner(requestKey, signer);

      if ((await this.isDuplicateAddress(signer)) === false) {
        await this.addAddress(signer, pubkey);
      }
    } else {
      await this.changeRequestStatus(requestKey, INVALID);
    }
  }

  private async callbackPlay(requestKey: string, signData: any, signer: string, nftType: string) {
    await this.changeRequestStatus(requestKey, SUCCESS);
    await this.changeRequestSignData(requestKey, signData);

    const currentReward = await this.getCurrentReward(nftType);
    currentReward.isQueue = true;

    await this.addTicketResult(signer, JSON.stringify(currentReward));
    await this.addRewardQueue(signer, currentReward);
  }

  private async getCurrentReward(nftType: string): Promise<any> {
    const nftData: any = await this.popNft(nftType);
    const tokenData = await this.popToken();

    const nftJSON = JSON.parse(nftData);
    const imageURL = await this.connectService.getNftImageURI(nftJSON.nftId);

    const nftMetaData = await this.getNftData(nftJSON.dappNftId);
    const nftMetaJSON = JSON.parse(nftMetaData);
    const name = nftMetaJSON.name;

    return {
      nftData,
      tokenData,
      imageURL,
      name,
    };
  }

  private async callbackReward(signData: any, requestKey: string, originMessage: string) {
    const signRawData = signData.rawData;

    if (await this.connectService.verifyArbitary(signRawData, originMessage)) {
      const signer = signData.address;

      const rewardData = await this.getTicketResult(signer);
      if (rewardData === null) {
        // INVALID REWARD
        logger.error('INVALID NFT');
      } else {
        const rewardJSON = JSON.parse(rewardData);
        rewardJSON.isQueue = true;
        await this.addTicketResult(signer, JSON.stringify(rewardJSON));

        await this.addRewardQueue(signer, rewardData);
        await this.changeRequestStatus(requestKey, SUCCESS);
      }
    } else {
      await this.changeRequestStatus(requestKey, INVALID);
    }
  }

  public async verify(
    requestKey: string,
    signature: string
  ): Promise<{ requestKey: string; signature: string; isValid: boolean }> {
    const requestData = await this.getRequest(requestKey);
    const signDoc = this.connectService.parseSignDocValues(requestData.message);
    const address = requestData.signer;

    const isValid = await this.connectService.verifyDirectSignature(address, signature, signDoc);

    return {
      requestKey,
      signature,
      isValid,
    };
  }

  public async getNftList() {
    let result = [];
    for (let i = 0; i < 3; i++) {
      const ticketCount = await this.getRemainingTicketCount(i.toString());
      result.push(ticketCount);
    }

    return {
      nftTicketCountList: result,
    };
  }

  public async getNftMetadata(dappNftId: string) {
    const nft = await this.getNftData(dappNftId);
    if (nft === null) {
      throw new Error('INVALID REWARD');
    }

    const nftJSON = JSON.parse(nft);

    return {
      nftId: nftJSON.nftId,
      name: nftJSON.name.replace('2022', 'EVENT'),
      description: nftJSON.description,
      attributes: nftJSON.attributes,
    };
  }

  private createSampleMessage(address: string): Array<EncodeObject> {
    const userAddress = address;
    const dappAddress = EVENT_WALLET_ADDRESS;
    const sendAmount = { denom: 'ufct', amount: EVENT_TICKET_AMOUNT };

    let msgSend = BankTxClient.msgSend({
      fromAddress: userAddress,
      toAddress: dappAddress,
      amount: [sendAmount],
    });

    return [msgSend];
  }

  private async isPlayable(signer: string, nftType: string) {
    // Already Play Event
    const ticketResult = await this.getTicketResult(signer);
    if (ticketResult !== null) return false;

    // Sold out
    const ticketCount = await this.getRemainingTicketCount(nftType);
    if (ticketCount === 0) return false;

    return true;
  }

  private async isRewardable(signer: string) {
    const reward = await this.getTicketResult(signer);
    const rewardJSON = JSON.parse(reward);

    // Already Reward Queue or Sent
    if (rewardJSON.isQueue === true) return false;

    return true;
  }

  private async addRequest(type: string, requestKey: string, message: string, signer = '', extra = ''): Promise<void> {
    const addedAt = moment.utc().format('YYYY-MM-DD HH:mm:ss');

    await this.storeService.hsetMessage(`${EVENT_REQUEST}${requestKey}`, 'type', type);
    await this.storeService.hsetMessage(`${EVENT_REQUEST}${requestKey}`, 'message', message);
    await this.storeService.hsetMessage(`${EVENT_REQUEST}${requestKey}`, 'status', 0);
    await this.storeService.hsetMessage(`${EVENT_REQUEST}${requestKey}`, 'signer', signer);
    await this.storeService.hsetMessage(`${EVENT_REQUEST}${requestKey}`, 'signData', '');
    await this.storeService.hsetMessage(`${EVENT_REQUEST}${requestKey}`, 'extra', extra);
    await this.storeService.hsetMessage(`${EVENT_REQUEST}${requestKey}`, 'addedAt', addedAt);

    await this.storeService.expireKey(`${EVENT_REQUEST}${requestKey}`, Number(REQUEST_EXPIRE_SECOND));
  }

  private async getRequest(requestKey: string): Promise<{
    message: string;
    type: string;
    status: number;
    signer: string;
    signData: string;
    extra: string;
    addedAt: string;
  }> {
    const result = await this.storeService.hgetAll(`${EVENT_REQUEST}${requestKey}`);
    if (result.status) result.status = Number(result.status);
    else result.status = -1;

    return result;
  }

  private async changeRequestStatus(requestKey: string, status: number): Promise<void> {
    await this.storeService.hsetMessage(`${EVENT_REQUEST}${requestKey}`, 'status', status);
  }

  private async changeRequestSigner(requestKey: string, signer: string): Promise<void> {
    await this.storeService.hsetMessage(`${EVENT_REQUEST}${requestKey}`, 'signer', signer);
  }

  private async changeRequestSignData(requestKey: string, signData: any): Promise<void> {
    await this.storeService.hsetMessage(`${EVENT_REQUEST}${requestKey}`, 'signData', JSON.stringify(signData));
  }

  private async addAddress(address: string, pubkey: string): Promise<void> {
    await this.storeService.hsetMessage(ADDRESSBOOK, address, pubkey);
  }

  private async getPubkey(address: string): Promise<string> {
    return await this.storeService.hget(ADDRESSBOOK, address);
  }

  private async isDuplicateAddress(address: string): Promise<boolean> {
    const pubkey = await this.storeService.hget(ADDRESSBOOK, address);
    return pubkey !== null;
  }

  private async addTicketResult(signer: string, nftType: string) {
    await this.storeService.hsetMessage(EVENT_TICKET_RESULT, signer, nftType);
  }

  private async getTicketResult(signer: string): Promise<any> {
    return await this.storeService.hget(EVENT_TICKET_RESULT, signer);
  }

  private async addRewardQueue(address: string, rewardData: string) {
    await this.storeService.push(EVENT_REWARD_QUEUE, JSON.stringify({ address, rewardData }));
  }

  private async getNftData(dappNftId: string) {
    return await this.storeService.hget(EVENT_REWARD_NFT_DATA, dappNftId);
  }

  private async getRemainingTicketCount(nftType: string) {
    return await this.storeService.queueLength(`${EVENT_REWARD_NFT_QUEUE}${nftType}`);
  }

  private async popNft(nftType: string) {
    return await this.storeService.pop(`${EVENT_REWARD_NFT_QUEUE}${nftType}`);
  }

  private async popToken() {
    const token = await this.storeService.pop(`${EVENT_REWARD_TOKEN_QUEUE}`);
    return Number(token);
  }
}

export default EventService;
