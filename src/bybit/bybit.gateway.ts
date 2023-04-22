import { WebSocketGateway, OnGatewayInit } from "@nestjs/websockets";
import { Logger } from "@nestjs/common";
import * as WebSocket from "ws";
import { EventBus } from "@nestjs/cqrs";
import { TickerEvent } from "../trade/entities/ticker.entity";
import { ConfigService } from "@nestjs/config";

@WebSocketGateway()
export class BybitGateway implements OnGatewayInit {
  private readonly logger: Logger = new Logger(BybitGateway.name);
  private tradingSymbols: Array<String>;

  constructor(
    private readonly configService: ConfigService,
    private readonly eventBus: EventBus
  ) {
    this.tradingSymbols = this.configService.get<string>("SYMBOLS").split(",");
  }

  afterInit(): void {
    this.logger.log("WebSocket gateway initialized");

    // Connect to WebSocket API
    const websocket = new WebSocket("wss://stream.bybit.com/v5/public/spot");

    websocket.on("open", (event) => {
      const tradingPairs = this.tradingSymbols
        .filter((s) => s !== "XRD")
        .map((symbol) => {
          return `orderbook.50.${symbol}USDT`;
        });

      const config = {
        op: "subscribe",
        args: tradingPairs,
      };

      websocket.send(JSON.stringify(config));
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

    if (message.data) {
      const { s, b, a } = message.data;
      if (b.length > 0 && a.length > 0) {
        const symbolNormalized = s.replace("USDT", "USD");
        const ask = a[0];
        const bid = b[0];

        const normalized = {
          exchange: "BYBIT", // exchange
          timestamp: message.ts, // timestamp
          symbol: symbolNormalized, // symbol
          bid: bid[0], // best bid price
          bidQty: bid[1], // best bid qty
          ask: ask[0], // best ask price
          askQty: ask[1], // best ask qty
        };

        this.eventBus.publish(new TickerEvent(normalized));
      }
    }
  }
}
