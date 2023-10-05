import { WebSocketGateway, OnGatewayInit } from "@nestjs/websockets";
import { Logger } from "@nestjs/common";
import * as WebSocket from "ws";
import { TickerEvent } from "../trade/entities/ticker.entity";
import { ConfigService } from "@nestjs/config";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { generateNumericId } from "../utils/config";
import { Socket } from "phoenix-channels";
import { Book } from "../utils/book";

@WebSocketGateway()
export class BityprecoGateway implements OnGatewayInit {
  private readonly logger: Logger = new Logger(BityprecoGateway.name);
  private tradingSymbols: Array<String>;
  private bids: Map<string, Book[]> = new Map();
  private asks: Map<string, Book[]> = new Map();
  private conversion = 0;

  constructor(
    private readonly configService: ConfigService,
    private eventEmitter: EventEmitter2
  ) {
    this.tradingSymbols = new Array(); //this.configService.get<string>("SYMBOLS").split(",");
    this.tradingSymbols.push("BTC");
    this.tradingSymbols.push("USDT");
  }

  afterInit(): void {
    console.log("WebSocket gateway initialized");

    // Connect to WebSocket API
    const socket = new Socket(
      "wss://bp-channels.gigalixirapp.com/orderbook/socket"
    );
    socket.connect();

    // O client nos oferece callbacks de sucesso e erro de conexão
    socket.onOpen(() => {
      console.log("Connected successfully");
    });
    socket.onError((e) => {
      console.log("Failed to connect to socket");
    });

    const channel = socket.channel("orderbook:BTC-BRL", {});
    channel
      .join()
      .receive("ok", (resp) => {
        console.log("Joined successfully", resp);
      })
      .receive("error", (resp) => {
        console.log("Unable to join", resp);
      });

    channel.on("snapshot", (payload) => {
      this.message(payload);
    });

    const channelUSDT = socket.channel("orderbook:USDT-BRL", {});
    channelUSDT
      .join()
      .receive("ok", (resp) => {
        console.log("Joined successfully", resp);
      })
      .receive("error", (resp) => {
        console.log("Unable to join", resp);
      });

    channelUSDT.on("snapshot", (payload) => {
      this.messageUSDT(payload);
    });
  }
  messageUSDT(data) {
    if (data.success) {
      this.conversion = data.asks[0].price;
    }
  }

  message(data) {
    const message = data;

    const symbol = "BTCUSDT";

    if (message.success && this.conversion > 4) {
      let bidsTemp: Array<Book> = message.bids.map((book) => {
        return {
          price: Math.floor(book.price / this.conversion),
          count: 1,
          amount: book.amount,
          timestamp: Date.now(),
        };
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

      let asksTemp: Array<Book> = message.asks.map((book) => {
        return {
          price: Math.floor(book.price / this.conversion),
          count: 1,
          amount: book.amount,
          timestamp: Date.now(),
        };
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
          exchange: "BITYPRECO", // exchange
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
