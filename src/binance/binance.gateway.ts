import { WebSocketGateway, OnGatewayInit } from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import * as WebSocket from 'ws';
import { EventBus } from '@nestjs/cqrs';
import { TickerEvent } from '../trade/entities/ticker.entity';
import { ConfigService } from '@nestjs/config';

@WebSocketGateway()
export class BinanceGateway implements OnGatewayInit {
  private readonly logger: Logger = new Logger(BinanceGateway.name);
  private tradingSymbols: Array<String>;

  constructor(
    private readonly configService: ConfigService,
    private readonly eventBus: EventBus,
  ) {
    this.tradingSymbols = this.configService.get<string>('SYMBOLS').split(',');
  }

  afterInit(): void {
    this.logger.log('WebSocket gateway initialized');

    // Connect to the Binance WebSocket API
    const binanceWebSocket = new WebSocket('wss://data-stream.binance.com/ws');
    binanceWebSocket.on('open', (event) => {
      const tradingPairs = this.tradingSymbols.map((symbol) => {
        return `${symbol.toLowerCase()}usdt@bookTicker`;
      });

      const config = {
        method: 'SUBSCRIBE',
        params: tradingPairs,
        id: 1,
      };

      binanceWebSocket.send(JSON.stringify(config));
    });

    // Listen for messages from the Binance WebSocket API
    binanceWebSocket.on('message', (event) => {
      this.message(event);
    });

    // Log any errors from the Binance WebSocket API
    binanceWebSocket.addEventListener('error', (error) => {
      this.logger.error(`WebSocket error: ${error}`);
    });
  }

  message(data) {
    const message = JSON.parse(data.toString());
    const code = message['code'] || 0;

    if (code === 0 && message.s) {
      let tradingPair: string = message['s'];
      tradingPair = tradingPair.replace('USDT', 'USD');

      const normalized = {
        exchange: 'Binance', // exchange
        timestamp: Date.now(), // timestamp
        symbol: tradingPair, // symbol
        bid: message.b, // best bid price
        bidQty: message.B, // best bid qty
        ask: message.a, // best ask price
        askQty: message.A, // best ask qty
      };

      this.eventBus.publish(new TickerEvent(normalized));
    }
  }
}
