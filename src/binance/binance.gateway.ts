import { WebSocketGateway, OnGatewayInit } from "@nestjs/websockets";
import { Logger } from "@nestjs/common";
import * as WebSocket from "ws";
import { TickerEvent } from "../trade/entities/ticker.entity";
import { ConfigService } from "@nestjs/config";
import { OrderEvent } from "../trade/entities/order.entity";
import { generateNumericId } from "../utils/config";
import * as crypto from "crypto";
import { HttpService } from "@nestjs/axios";
import { AxiosError } from "axios";
import { firstValueFrom, catchError } from "rxjs";
import { TransferEvent } from "../trade/entities/transfer.entity";
import { EventEmitter2, OnEvent } from "@nestjs/event-emitter";

@WebSocketGateway()
export class BinanceGateway implements OnGatewayInit {
  private readonly logger: Logger = new Logger(BinanceGateway.name);
  private tradingSymbols: Array<String>;
  private exchangeCode: string = "BINANCE";
  private balances: Map<string, number> = new Map();
  private clientSocket: WebSocket;
  private publicSocket: WebSocket;
  private clientId: string;
  private clientSecret: string;
  private isSubscribed: boolean = false;
  private isBalanceUpdated;
  boolean = false;

  constructor(
    private readonly configService: ConfigService,
    private eventEmitter: EventEmitter2,
    private readonly httpService: HttpService
  ) {
    this.tradingSymbols = this.configService.get<string>("SYMBOLS").split(",");
    this.clientId = this.configService.get<string>("BINANCE_CLIENT_ID");
    this.clientSecret = this.configService.get<string>("BINANCE_CLIENT_SECRET");
  }

  getBalanceAll(): Map<string, number> {
    return this.balances;
  }

  getBalance(symbol: string) {
    if (!this.balances.has(symbol)) {
      throw new Error(`Balance for ${symbol} not found`);
    }

    return this.balances.get(symbol);
  }

  @OnEvent("order.created")
  order(event: OrderEvent): any {
    if (event.data.exchange === this.exchangeCode) {
      this.trade(event);
    }
  }

  @OnEvent("transfer.created")
  transfer(event: TransferEvent): any {
    if (event.data.exchange === this.exchangeCode) {
      this.transferTo(event);
    }
  }

  sign(payload, secret?, sort = true) {
    const keys = sort ? Object.keys(payload).sort() : Object.keys(payload);
    let params = "";

    for (let key of keys) {
      params += `${key}=${payload[key]}&`;
    }
    params = params.slice(0, -1);

    const secretToUse = secret || this.clientSecret;
    const signature = crypto
      .createHmac("sha256", secretToUse)
      .update(params)
      .digest("hex");

    return {
      params,
      signature,
    };
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
      this.logger.error(`WebSocket@${this.exchangeCode}: ${error}`);
    });

    this.publicSocket = new WebSocket("wss://data-stream.binance.com/ws");
    this.publicSocket.on("open", (event) => {
      this.subscribe();
    });

    this.publicSocket.on("message", (event) => {
      this.message(event);
    });

    this.publicSocket.addEventListener("error", (error) => {
      this.logger.error(`WebSocketPublic@${this.exchangeCode}: ${error}`);
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
    this.isBalanceUpdated = true;
    // Account status
    const payload = {
      apiKey: this.configService.get<string>("BINANCE_CLIENT_ID"),
      recvWindow: 5000,
      timestamp: Date.now(),
    };

    const params = {
      ...payload,
      signature: this.sign(payload).signature,
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
      const asset = balance.asset; //.replace("USDT", "USD");
      this.balances.set(asset, parseFloat(balance.free));
    });
  }

  message(data) {
    const message = JSON.parse(data.toString());
    const code = message.code || message.error?.code || 0;

    if (!this.isBalanceUpdated) {
      this.accountStatus();
    }

    if (code < 0) {
      console.error(`ERROR@${this.exchangeCode}: ${JSON.stringify(message)}`);
    } else if (code === 0) {
      if (message.result?.balances) {
        this.updateBalances(message.result.balances);
      } else if (message.s) {
        let tradingPair: string = message["s"];
        //tradingPair = tradingPair.replace("USDT", "USD");

        const normalized = {
          exchange: this.exchangeCode, // exchange
          timestamp: Date.now(), // timestamp
          symbol: tradingPair, // symbol
          bid: message.b, // best bid price
          bidQty: message.B, // best bid qty
          ask: message.a, // best ask price
          askQty: message.A, // best ask qty
        };

        this.eventEmitter.emit("ticker.created", new TickerEvent(normalized));
      } else if (message.result) {
        console.log(`RESULT@${this.exchangeCode}: ${JSON.stringify(message)}`);
      }
    }
  }

  trade(event: OrderEvent) {
    const { id, timestamp, type, symbol, amount, price } = event.data;

    const balanceSymbol = type === "BUY" ? "USDT" : symbol.replace("USDT", "");
    const balance = this.getBalance(balanceSymbol);
    let maxAmount = 0;

    if (type === "BUY") {
      maxAmount =
        amount * price > balance ? Math.floor(balance / price) : amount;
    } else {
      maxAmount = amount > balance ? balance : amount;
    }

    if (maxAmount <= 0) {
      throw new Error(`Insufficient balance for ${symbol}`);
    }

    const payload = {
      symbol,
      side: type, // BUY or SELL
      type: "LIMIT",
      price,
      quantity: amount,
      timeInForce: "GTC",
      timestamp: Date.now(),
      recvWindow: 5000,
      apiKey: this.clientId,
    };

    const newOrder = {
      ...payload,
      signature: this.sign(payload).signature,
    };

    const final = {
      id,
      method: "order.place",
      params: newOrder,
    };

    console.log(`ORDER@${this.exchangeCode}: ${JSON.stringify(final)}`);
    this.clientSocket.send(JSON.stringify(final));
    this.isBalanceUpdated = false;

    return true;
  }

  async transferTo(event: TransferEvent) {
    const eventData = event.data;

    const balance = this.getBalance(eventData.symbol.replace("USDT", "USD"));
    if (eventData.amount > balance) {
      throw new Error(
        `ERROR@${this.exchangeCode}: Insufficient balance for ${eventData.symbol} | ${balance} < ${eventData.amount}`
      );
    }

    let payload: any = {
      coin: eventData.symbol,
      address: eventData.toAddress,
      amount: eventData.amount,
      timestamp: Date.now(),
      recvWindow: 5000,
    };

    if (eventData.toAddressTag) {
      payload = {
        ...payload,
        payment_id: eventData.toAddressTag,
      };
    }

    const signParams = this.sign(payload, null, false);
    const query = signParams.params + "&signature=" + signParams.signature;

    const { data } = await firstValueFrom(
      this.httpService
        .post(
          `https://api.binance.com/sapi/v1/capital/withdraw/apply?${query}`,
          {},
          {
            headers: {
              "X-MBX-APIKEY": this.clientId,
            },
          }
        )
        .pipe(
          catchError((error: AxiosError) => {
            console.error(
              `ERROR@${this.exchangeCode}: ${JSON.stringify(
                error.response.data
              )}`
            );
            throw "An error happened!";
          })
        )
    );

    return data.id;
  }
}
