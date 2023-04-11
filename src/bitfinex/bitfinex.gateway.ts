import { WebSocketGateway, OnGatewayInit } from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import * as WebSocket from 'ws';
import { EventBus } from '@nestjs/cqrs';
import { TickerEvent } from '../trade/entities/ticker.entity';
import { ConfigService } from '@nestjs/config';

@WebSocketGateway()
export class BitfinexGateway implements OnGatewayInit {
  private readonly logger: Logger = new Logger(BitfinexGateway.name);
  private tradingSymbols: Array<String>;
  private clientSocket: WebSocket;
  private channelTradingPairs: Map<number, string> = new Map();

  constructor(
    private readonly configService: ConfigService,
    private readonly eventBus: EventBus,
  ) {
    this.tradingSymbols = this.configService.get<string>('SYMBOLS').split(',');
  }

  subscribeToChannels() {
    this.tradingSymbols.forEach((symbol) => {
      const tradingPair = `t${symbol}USD`;
      this.clientSocket.send(
        JSON.stringify({
          event: 'subscribe',
          channel: 'ticker',
          symbol: tradingPair,
        }),
      );
    });
  }

  afterInit(): void {
    this.logger.log('WebSocket gateway initialized');

    // Connect to the Binance WebSocket API
    this.clientSocket = new WebSocket('wss://api-pub.bitfinex.com/ws/2');
    this.clientSocket.on('open', (event) => {
      this.subscribeToChannels();
    });

    // Listen for messages from the Binance WebSocket API
    this.clientSocket.on('message', (event) => {
      this.message(event);
    });

    // Log any errors from the Binance WebSocket API
    this.clientSocket.addEventListener('error', (error) => {
      this.logger.error(`WebSocket error: ${error}`);
    });
  }

  message(data) {
    const message = JSON.parse(data.toString());

    if (message.event === 'subscribed') {
      this.channelTradingPairs.set(message.chanId, message.pair);
    } else if (Array.isArray(message) && message.length === 2) {
      const channel = message[0];
      const payload = message[1];
      const symbol = this.channelTradingPairs.get(channel);

      if (payload !== 'hb') {
        const normalized = {
          exchange: 'Bitfinex', // exchange
          timestamp: Date.now(), // timestamp
          symbol, // symbol
          bid: payload[0], // best bid price
          bidQty: payload[1], // best bid qty
          ask: payload[2], // best ask price
          askQty: payload[3], // best ask qty
        };

        this.eventBus.publish(new TickerEvent(normalized));
      }
    }
  }
}
