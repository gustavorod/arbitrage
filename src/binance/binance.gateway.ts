import { WebSocketGateway, OnGatewayInit } from "@nestjs/websockets";
import { Logger } from "@nestjs/common";
import * as WebSocket from "ws";
import { EventBus, EventsHandler, IEventHandler } from "@nestjs/cqrs";
import { TickerEvent } from "../trade/entities/ticker.entity";
import { ConfigService } from "@nestjs/config";
import { OrderEvent } from "../trade/entities/order.entity";
import { generateNumericId } from "../utils/config";
import * as crypto from "crypto";

@EventsHandler(OrderEvent)
@WebSocketGateway()
export class BinanceGateway
  implements OnGatewayInit, IEventHandler<OrderEvent>
{
  private readonly logger: Logger = new Logger(BinanceGateway.name);
  private tradingSymbols: Array<String>;
  private exchangeCode: string = "BINANCE";
  private balances: Map<string, number> = new Map();
  private clientSocket: WebSocket;
  private publicSocket: WebSocket;
  private clientId: string;
  private clientSecret: string;
  private isSubscribed: boolean = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly eventBus: EventBus
  ) {
    this.tradingSymbols = this.configService.get<string>("SYMBOLS").split(",");
    this.clientId = this.configService.get<string>("BINANCE_CLIENT_ID");
    this.clientSecret = this.configService.get<string>("BINANCE_CLIENT_SECRET");
  }

  handle(event: OrderEvent): any {
    if (event.data.exchange === this.exchangeCode) {
      this.trade(event);
    }
  }

  sign(payload): string {
    const sortedKeys = Object.keys(payload).sort();
    let params = "";

    for (let key of sortedKeys) {
      params += `${key}=${payload[key]}&`;
    }

    params = params.slice(0, -1);
    const signature = crypto
      .createHmac("sha256", this.clientSecret)
      .update(params)
      .digest("hex");

    return signature;
  }

  afterInit(): void {
    this.logger.log("WebSocket gateway initialized");

    // Connect to the Binance WebSocket API
    this.clientSocket = new WebSocket("wss://ws-api.binance.com:443/ws-api/v3");
    this.clientSocket.on("open", (event) => {
      this.accountStatus();
    });

    // Listen for messages from the Binance WebSocket API
    this.clientSocket.on("message", (event) => {
      this.message(event);
    });

    // Log any errors from the Binance WebSocket API
    this.clientSocket.addEventListener("error", (error) => {
      this.logger.error(`WebSocket error: ${error}`);
    });

    this.publicSocket = new WebSocket("wss://data-stream.binance.com/ws");
    this.publicSocket.on("message", (event) => {
      this.message(event);
    });
  }

  subscribe() {
    if (this.isSubscribed) return;

    const tradingPairs = this.tradingSymbols.map((symbol) => {
      return `${symbol.toLowerCase()}usdt@bookTicker`;
    });

    const config = {
      method: "SUBSCRIBE",
      params: tradingPairs,
      id: 1,
    };

    this.publicSocket.send(JSON.stringify(config));

    this.isSubscribed = true;
  }

  accountStatus() {
    // Account status
    const payload = {
      apiKey: this.configService.get<string>("BINANCE_CLIENT_ID"),
      recvWindow: 5000,
      timestamp: Date.now(),
    };

    const params = {
      ...payload,
      signature: this.sign(payload),
    };

    this.clientSocket.send(
      JSON.stringify({
        id: generateNumericId(),
        method: "account.status",
        params,
      })
    );
  }

  updateBalances(balances) {
    const b = balances.filter((balance) => balance.free > 0);

    b.forEach((balance) => {
      this.balances.set(balance.asset, balance.free);
    });

    this.subscribe();
  }

  message(data) {
    const message = JSON.parse(data.toString());
    const code = message.code || message.error?.code || 0;

    if (code < 0) {
      console.error(`ERROR@${this.exchangeCode}: ${JSON.stringify(message)}`);
    } else if (code === 0) {
      if (message.result?.balances) {
        this.updateBalances(message.result.balances);
      } else if (message.s) {
        let tradingPair: string = message["s"];
        tradingPair = tradingPair.replace("USDT", "USD");

        const normalized = {
          exchange: this.exchangeCode, // exchange
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

  trade(event: OrderEvent) {
    const { id, timestamp, type, symbol, amount, price } = event.data;

    const balanceSymbol = type === "BUY" ? "USDT" : symbol.replace("USD", "");
    const pair = `${symbol}T`;

    if (!this.balances.has(balanceSymbol)) {
      throw new Error(`Balance for ${balanceSymbol} not found`);
    }

    const balance = this.balances.get(balanceSymbol);
    const maxAmount = amount > balance ? balance : amount;

    if (maxAmount <= 0) {
      throw new Error(`Insufficient balance for ${symbol}`);
    }

    const finalPrice = Number(price).toFixed(4);

    const payload = {
      symbol: pair,
      side: type, // BUY or SELL
      type: "LIMIT",
      price: finalPrice,
      quantity: amount,
      timeInForce: "GTC",
      timestamp: Date.now(),
      recvWindow: 5000,
      apiKey: this.clientId,
    };

    const newOrder = {
      ...payload,
      signature: this.sign(payload),
    };

    const final = {
      id,
      method: "order.place",
      params: newOrder,
    };

    console.log(`Sending order: ${JSON.stringify(final)}`);
    this.clientSocket.send(JSON.stringify(final));
    return true;
  }
}
