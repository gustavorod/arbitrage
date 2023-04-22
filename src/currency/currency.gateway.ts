import { WebSocketGateway, OnGatewayInit } from "@nestjs/websockets";
import { Logger } from "@nestjs/common";
import * as WebSocket from "ws";
import { EventBus } from "@nestjs/cqrs";
import { TickerEvent } from "../trade/entities/ticker.entity";
import { ConfigService } from "@nestjs/config";

@WebSocketGateway()
export class CurrencyGateway implements OnGatewayInit {
  private readonly logger: Logger = new Logger(CurrencyGateway.name);
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
    const websocket = new WebSocket(
      "wss://api-adapter.backend.currency.com/connect"
    );

    websocket.on("open", (event) => {
      const tradingPairs = this.tradingSymbols.map((symbol) => {
        return `${symbol}/USD`;
      });

      const config = {
        destination: "marketData.subscribe",
        payload: {
          symbols: tradingPairs,
        },
        //correlationId: 1,
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
    const status = message["status"] || "";

    if (status === "OK") {
      if (message.payload?.subscriptions) {
        console.log(message.payload.subscriptions);
      } else {
        const symbolNormalized = (message.payload.symbolName as string).replace(
          "/",
          ""
        );

        const normalized = {
          exchange: "CURRENCY", // exchange
          timestamp: message.payload.timestamp, // timestamp
          symbol: symbolNormalized, // symbol
          bid: message.payload.bid, // best bid price
          bidQty: message.payload.bidQty, // best bid qty
          ask: message.payload.ofr, // best ask price
          askQty: message.payload.ofrQty, // best ask qty
        };

        this.eventBus.publish(new TickerEvent(normalized));
      }
    }
  }
}
