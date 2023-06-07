import { WebSocketGateway, OnGatewayInit } from "@nestjs/websockets";
import { Logger } from "@nestjs/common";
import * as WebSocket from "ws";
import { TickerEvent } from "../trade/entities/ticker.entity";
import { ConfigService } from "@nestjs/config";
import { EventEmitter2 } from "@nestjs/event-emitter";

/* Needs to be refactored for books */
@WebSocketGateway()
export class DydxGateway implements OnGatewayInit {
  private readonly logger: Logger = new Logger(DydxGateway.name);
  private tradingSymbols: Array<String>;
  private currentBids: Map<String, Array<any>> = new Map();
  private currentAsks: Map<String, Array<any>> = new Map();

  constructor(
    private readonly configService: ConfigService,
    private eventEmitter: EventEmitter2
  ) {
    this.tradingSymbols = this.configService.get<string>("SYMBOLS").split(",");
  }

  afterInit(): void {
    this.logger.log("WebSocket gateway initialized");

    // Connect to WebSocket API
    const websocket = new WebSocket("wss://api.dydx.exchange/v3/ws");

    websocket.on("open", (event) => {
      this.tradingSymbols.map((symbol) => {
        const config = {
          type: "subscribe",
          channel: "v3_orderbook",
          id: `${symbol}-USD`,
        };

        return websocket.send(JSON.stringify(config));
      });
    });

    // Listen for messages from the Binance WebSocket API
    websocket.on("message", (event) => {
      this.message(event);
    });

    // Log any errors from the Binance WebSocket API
    websocket.addEventListener("error", (error) => {
      this.logger.error(`WebSocket error: ${error}`);
    });
  }

  message(data) {
    const message = JSON.parse(data.toString());
    if (!message.contents) {
      return;
    }

    const { bids, asks } = message.contents;

    if (bids) {
      this.currentBids.set(message.id, bids);
    }

    if (asks) {
      this.currentAsks.set(message.id, asks);
    }

    const currentBids = this.currentBids.get(message.id) || [];
    const currentAsks = this.currentAsks.get(message.id) || [];

    if (currentAsks.length > 0 && currentBids.length > 0) {
      const bestBid = currentBids[0];
      const bestAsk = currentAsks[0];
      const symbolNormalized = message.id
        .replace("-", "")
        .replace("USD", "USDT");

      const normalized = {
        exchange: "DYDX", // exchange
        timestamp: Date.now(), // timestamp
        symbol: symbolNormalized, // symbol
        bid: bestBid.price, // best bid price
        bidQty: bestBid.size, // best bid qty
        ask: bestAsk.price, // best ask price
        askQty: bestAsk.size, // best ask qty
      };

      this.eventEmitter.emitAsync(
        "ticker.created",
        new TickerEvent(normalized)
      );
    }
  }
}
