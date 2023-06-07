import { WebSocketGateway, OnGatewayInit } from "@nestjs/websockets";
import { Logger } from "@nestjs/common";
import * as WebSocket from "ws";
import { TickerEvent } from "../trade/entities/ticker.entity";
import { ConfigService } from "@nestjs/config";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { generateNumericId } from "../utils/config";

@WebSocketGateway()
export class CexGateway implements OnGatewayInit {
  private readonly logger: Logger = new Logger(CexGateway.name);
  private tradingSymbols: Array<String>;

  constructor(
    private readonly configService: ConfigService,
    private eventEmitter: EventEmitter2
  ) {
    this.tradingSymbols = this.configService.get<string>("SYMBOLS").split(",");
  }

  afterInit(): void {
    this.logger.log("WebSocket gateway initialized");

    // Connect to WebSocket API
    const websocket = new WebSocket("wss://ws.cex.io/ws/");

    websocket.on("open", (event) => {
      const tradingPairs = this.tradingSymbols.map((symbol) => {
        return `pair-${symbol}-USDT`;
      });

      const config = {
        e: "subscribe",
        rooms: tradingPairs,
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

    if (message.e === "md") {
      const { buy, sell, pair } = message.data;
      const bid = buy[0];
      const ask = sell[0];

      if (bid && ask) {
        const normalized = {
          exchange: "CEX", // exchange
          timestamp: Date.now(), // timestamp
          symbol: pair.replace(":", ""), // symbol
          bid: bid[0], // best bid price
          bidQty: bid[1], // best bid qty
          ask: ask[0], // best ask price
          askQty: ask[1], // best ask qty
        };

        this.eventEmitter.emitAsync(
          "ticker.created",
          new TickerEvent(normalized)
        );
      }
    }
  }
}
