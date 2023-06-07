import { WebSocketGateway, OnGatewayInit } from "@nestjs/websockets";
import { Logger } from "@nestjs/common";
import * as WebSocket from "ws";
import { TickerEvent } from "../trade/entities/ticker.entity";
import { ConfigService } from "@nestjs/config";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { Book } from "../utils/book";

@WebSocketGateway()
export class CoinbaseGateway implements OnGatewayInit {
  private readonly logger: Logger = new Logger(CoinbaseGateway.name);
  private tradingSymbols: Array<String>;
  private bids: Map<string, Book[]> = new Map();
  private asks: Map<string, Book[]> = new Map();

  constructor(
    private readonly configService: ConfigService,
    private eventEmitter: EventEmitter2
  ) {
    this.tradingSymbols = this.configService.get<string>("SYMBOLS").split(",");
  }

  afterInit(): void {
    this.logger.log("WebSocket gateway initialized");

    // Connect to WebSocket API
    const websocket = new WebSocket("wss://ws-feed.exchange.coinbase.com");

    websocket.on("open", (event) => {
      const tradingPairs = this.tradingSymbols.map((symbol) => {
        return `${symbol}-USDT`;
      });

      const config = {
        type: "subscribe",
        channels: ["level2"],
        product_ids: tradingPairs,
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

    const symbol = message.product_id?.replace("-", "");

    if (message.type === "snapshot") {
      this.bids.set(symbol, message.bids);
      this.asks.set(symbol, message.asks);
    } else if (message.type === "l2update") {
      const now = Date.now();

      let bidsTemp = (this.bids.get(symbol) || []).filter(
        (book) => (now - book.timestamp) / 1000 <= 300
      );
      let asksTemp = (this.asks.get(symbol) || []).filter(
        (book) => (now - book.timestamp) / 1000 <= 300
      );

      //Update order book
      message.changes.forEach((book) => {
        const isBuy = book[0] === "buy";
        const price = book[1];
        const amount = book[2];

        let newBook: Book = {
          price,
          count: 1,
          amount,
          timestamp: Date.now(),
        };

        if (parseFloat(amount) <= 0) {
          if (isBuy) {
            bidsTemp = bidsTemp.filter((bid) => bid.price !== price);
          } else {
            asksTemp = asksTemp.filter((ask) => ask.price !== price);
          }
        } else {
          if (isBuy) {
            bidsTemp = bidsTemp.filter((item) => item.price !== price);
            bidsTemp.push(newBook);
          } else {
            asksTemp = asksTemp.filter((item) => item.price !== price);
            asksTemp.push(newBook);
          }
        }
      });

      bidsTemp.sort((a, b) => {
        if (a.price < b.price) {
          return 1;
        }
        if (a.price > b.price) {
          return -1;
        }
        return 0;
      });

      asksTemp.sort((a, b) => {
        if (a.price < b.price) {
          return -1;
        }
        if (a.price > b.price) {
          return 1;
        }
        return 0;
      });

      this.bids.set(symbol, bidsTemp); //descending
      this.asks.set(symbol, asksTemp); //ascending

      let bidSelected = bidsTemp[0];
      let askSelected = asksTemp[0];

      if (bidSelected && askSelected) {
        /*console.log(
          `BID: ${bidSelected.price} | ASK: ${
            askSelected.price
          } @ ${Date.now()}`
        );*/

        const normalized = {
          exchange: "COINBASE", // exchange
          timestamp: Date.now(), // timestamp
          symbol: symbol,
          bid: bidSelected.price, // best bid price
          bidQty: bidSelected.amount, // best bid qty
          ask: askSelected.price, // best ask price
          askQty: askSelected.amount, // best ask qty
        };

        this.eventEmitter.emitAsync(
          "ticker.created",
          new TickerEvent(normalized)
        );
      }
    }
  }
}
