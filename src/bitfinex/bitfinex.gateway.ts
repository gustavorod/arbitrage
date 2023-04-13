import { WebSocketGateway, OnGatewayInit } from "@nestjs/websockets";
import { Logger } from "@nestjs/common";
import * as WebSocket from "ws";
import { EventBus, EventsHandler, IEventHandler } from "@nestjs/cqrs";
import { TickerEvent } from "../trade/entities/ticker.entity";
import { ConfigService } from "@nestjs/config";
import * as crypto from "crypto-js";
import { OrderEvent } from "../trade/entities/order.entity";

@EventsHandler(OrderEvent)
@WebSocketGateway()
export class BitfinexGateway
  implements OnGatewayInit, IEventHandler<OrderEvent>
{
  private readonly logger: Logger = new Logger(BitfinexGateway.name);
  private tradingSymbols: Array<String>;
  private clientSocket: WebSocket;
  private channelTradingPairs: Map<number, string> = new Map();
  private isSubscribed: boolean = false;
  private balances: Map<string, number> = new Map();

  constructor(
    private readonly configService: ConfigService,
    private readonly eventBus: EventBus
  ) {
    this.tradingSymbols = this.configService.get<string>("SYMBOLS").split(",");
  }

  handle(event: OrderEvent): any {
    this.trade(event);
  }

  trade(event: OrderEvent) {
    const { id, timestamp, type, symbol, amount, price } = event.data;

    if (!this.balances.has(symbol)) {
      throw new Error(`Balance for ${symbol} not found`);
    }

    const balance = this.balances.get(symbol);
    const maxAmount = amount > balance ? balance : amount;
    const pair = type === "BUY" ? `tUSD${symbol}` : `t${symbol}USD`;

    if (maxAmount <= 0) {
      throw new Error(`Insufficient balance for ${symbol}`);
    }

    const newOrder = [
      0,
      "on",
      null,
      {
        cid: id,
        type: "LIMIT",
        symbol: pair,
        amount: maxAmount,
        price: price,
      },
    ];

    console.log(`Sending order: ${JSON.stringify(newOrder)}`);
    this.clientSocket.send(JSON.stringify(newOrder));

    return true;
  }

  subscribeToChannels() {
    this.tradingSymbols.forEach((symbol) => {
      const tradingPair = `t${symbol}USD`;
      this.clientSocket.send(
        JSON.stringify({
          event: "subscribe",
          channel: "ticker",
          symbol: tradingPair,
        })
      );
    });
  }

  authenticate() {
    //Authenticate
    const apiKey = this.configService.get<string>("BITFINEX_CLIENT_ID"); // Users API credentials are defined here
    const apiSecret = this.configService.get<string>("BITFINEX_CLIENT_SECRET");

    const authNonce = Date.now() * 1000; // Generate an ever increasing, single use value. (a timestamp satisfies this criteria)
    const authPayload = "AUTH" + authNonce; // Compile the authentication payload, this is simply the string 'AUTH' prepended to the nonce value
    const authSig = crypto
      .HmacSHA384(authPayload, apiSecret)
      .toString(crypto.enc.Hex); // The authentication payload is hashed using the private key, the resulting hash is output as a hexadecimal string

    const payload = {
      apiKey, //API key
      authSig, //Authentication Sig
      authNonce,
      authPayload,
      event: "auth", // The connection event, will always equal 'auth'
    };

    this.clientSocket.send(JSON.stringify(payload));
  }

  afterInit(): void {
    this.logger.log("WebSocket gateway initialized");

    // Connect to the Binance WebSocket API
    this.clientSocket = new WebSocket("wss://api.bitfinex.com/ws/2");

    this.clientSocket.on("open", (event) => {
      this.authenticate();
    });

    // Listen for messages from the Binance WebSocket API
    this.clientSocket.on("message", (event) => {
      if (!this.isSubscribed) {
        this.subscribeToChannels();
        this.isSubscribed = true;
      } else {
        this.message(event);
      }
    });

    // Log any errors from the Binance WebSocket API
    this.clientSocket.addEventListener("error", (error) => {
      this.logger.error(`WebSocket error: ${error}`);
    });
  }

  updateBalances(data) {
    data.forEach((balance) => {
      this.balances.set(balance[1], balance[2]);
    });
  }

  message(data) {
    const message = JSON.parse(data.toString());

    if (message.event === "subscribed") {
      this.channelTradingPairs.set(message.chanId, message.pair);
    } else if (Array.isArray(message)) {
      // Wallet balances
      if (message[1] === "ws") {
        this.updateBalances(message[2]);
        console.log("balances: ", this.balances);
      } else if (message.length === 2) {
        const channel = message[0];
        const payload = message[1];
        const symbol = this.channelTradingPairs.get(channel);

        if (payload !== "hb") {
          const normalized = {
            exchange: "Bitfinex", // exchange
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
}
