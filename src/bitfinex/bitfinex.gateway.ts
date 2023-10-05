import { WebSocketGateway, OnGatewayInit } from "@nestjs/websockets";
import { Logger } from "@nestjs/common";
import * as WebSocket from "ws";
import { EventBus, EventsHandler, IEventHandler } from "@nestjs/cqrs";
import { TickerEvent } from "../trade/entities/ticker.entity";
import { ConfigService } from "@nestjs/config";
import * as crypto from "crypto-js";
import { OrderEvent } from "../trade/entities/order.entity";
import { HttpService } from "@nestjs/axios";
import { catchError, firstValueFrom } from "rxjs";
import { AxiosError } from "axios";
import { TransferEvent } from "../trade/entities/transfer.entity";
import { EventEmitter2, OnEvent } from "@nestjs/event-emitter";

type Book = {
  price: number;
  count: number;
  amount: number;
  timestamp: number;
};

@WebSocketGateway()
export class BitfinexGateway implements OnGatewayInit {
  private CAN_TRADE: boolean = true;

  private readonly logger: Logger = new Logger(BitfinexGateway.name);
  private tradingSymbols: Array<String>;
  private clientSocket: WebSocket;
  private channelTradingPairs: Map<number, string> = new Map();
  private isSubscribed: boolean = false;
  private balances: Map<string, number> = new Map();
  private exchangeCode: string = "BITFINEX";
  private apiKey: string;
  private apiSecret: string;
  private bids: Map<string, Book[]> = new Map();
  private asks: Map<string, Book[]> = new Map();

  constructor(
    private readonly configService: ConfigService,
    private eventEmitter: EventEmitter2,
    private readonly httpService: HttpService
  ) {
    this.tradingSymbols = this.configService.get<string>("SYMBOLS").split(",");
    this.apiKey = this.configService.get<string>("BITFINEX_CLIENT_ID"); // Users API credentials are defined here
    this.apiSecret = this.configService.get<string>("BITFINEX_CLIENT_SECRET");
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

  subscribeToChannels() {
    if (this.isSubscribed) {
      return;
    }

    this.tradingSymbols.forEach((symbol) => {
      const tradingPair = `t${symbol}UST`;
      this.clientSocket.send(
        JSON.stringify({
          event: "subscribe",
          channel: "book",
          symbol: tradingPair,
          prec: "P1",
          freq: "F0",
        })
      );
    });

    this.isSubscribed = true;
  }

  authenticate() {
    if (this.apiSecret) {
      const authNonce = Date.now() * 1000; // Generate an ever increasing, single use value. (a timestamp satisfies this criteria)
      const authPayload = "AUTH" + authNonce; // Compile the authentication payload, this is simply the string 'AUTH' prepended to the nonce value
      const authSig = crypto
        .HmacSHA384(authPayload, this.apiSecret)
        .toString(crypto.enc.Hex); // The authentication payload is hashed using the private key, the resulting hash is output as a hexadecimal string

      const payload = {
        apiKey: this.apiKey, //API key
        authSig, //Authentication Sig
        authNonce,
        authPayload,
        event: "auth", // The connection event, will always equal 'auth'
      };

      this.clientSocket.send(JSON.stringify(payload));
    }
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
      this.message(event);
    });

    // Log any errors from the Binance WebSocket API
    this.clientSocket.addEventListener("error", (error) => {
      this.logger.error(`WebSocket error: ${error}`);
    });
  }

  updateBalances(data) {
    data.forEach((balance) => {
      if (balance[0] === "exchange") {
        this.balances.set(balance[1].replace("UST", "USDT"), balance[2]);
      }
    });

    let temp = "";
    this.balances.forEach((value, key) => {
      if (key != undefined && value != undefined && value > 1) {
        temp += key + ": " + value + " | ";
      }
    });

    //console.log(`BALANCE@${this.exchangeCode}: ${temp}`);
  }

  message(data) {
    const message = JSON.parse(data.toString());

    if (message.event === "subscribed") {
      this.channelTradingPairs.set(message.chanId, message.pair);
    } else if (Array.isArray(message)) {
      // Wallet balances
      if (message[1] === "ws" || message[1] === "wu") {
        const balances = message[1] === "wu" ? [message[2]] : message[2];
        this.updateBalances(balances);
        this.subscribeToChannels();
      } else if (message[1] === "n") {
        console.log("Order request: ", message);
      } else if (message.length === 2) {
        const channel = message[0];
        const payload = message[1];
        const symbol = this.channelTradingPairs.get(channel);

        if (payload !== "hb") {
          const now = Date.now();
          let bidsTemp = (this.bids.get(symbol) || []).filter(
            (book) => (now - book.timestamp) / 1000 <= 300
          ); //2 seconds
          let asksTemp = (this.asks.get(symbol) || []).filter(
            (book) => (now - book.timestamp) / 1000 <= 300
          );

          let payloarNormalized;
          if (Array.isArray(payload[0])) {
            payloarNormalized = payload;
          } else {
            payloarNormalized = [payload];
          }

          //Update order book
          payloarNormalized.forEach((book) => {
            const price = book[0];
            const count = book[1];
            const amount = book[2];

            let newBook: Book = {
              price,
              count,
              amount,
              timestamp: Date.now(),
            };

            if (count == 0) {
              if (amount > 0) {
                bidsTemp = bidsTemp.filter((bid) => bid.price !== price);
              } else {
                asksTemp = asksTemp.filter((ask) => ask.price !== price);
              }
            } else {
              if (amount > 0) {
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
              exchange: this.exchangeCode, // exchange
              timestamp: Date.now(), // timestamp
              symbol: symbol.replace("UST", "USDT"), // symbol
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
      } /*else {
        console.log("Unhandled message: ", message);
      }*/
    }
  }

  trade(event: OrderEvent) {
    if (!this.CAN_TRADE) {
      return false;
    }

    const { id, timestamp, type, symbol, amount, price } = event.data;

    const balanceSymbol = type === "BUY" ? "USDT" : symbol.replace("USDT", "");
    const pair = `t${symbol.replace("USDT", "UST")}`;

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

    const amountSignal = type === "BUY" ? maxAmount : -maxAmount;
    const expiration = Date.now() + 1000 * 60 * 30; // 30 minutes

    const body = {
      cid: id,
      type: "EXCHANGE LIMIT",
      symbol: pair,
      amount: amountSignal.toString(),
      price: price.toString(),
      tif: new Date(expiration).toISOString(),
      meta: { aff_code: "hSrbqgLPN" },
    };

    const newOrder = [0, "on", null, body];

    console.log(`ORDER@${this.exchangeCode}: ${JSON.stringify(newOrder)}`);
    this.clientSocket.send(JSON.stringify(newOrder));

    return true;
  }

  sign(apiPath, body) {
    const nonce = (Date.now() * 1000).toString();
    const params = `/api/${apiPath}${nonce}${JSON.stringify(body)}`;

    const signature = crypto
      .HmacSHA384(params, this.apiSecret)
      .toString(crypto.enc.Hex); // The authentication payload is hashed using the private key, the resulting hash is output as a hexadecimal string

    return {
      params,
      signature,
      nonce,
    };
  }

  async transferTo(event: TransferEvent) {
    const eventData = event.data;

    const balance = this.getBalance(eventData.symbol);
    if (eventData.amount > balance) {
      throw new Error(
        `ERROR@${this.exchangeCode}: Insufficient balance for ${eventData.symbol} | ${balance} < ${eventData.amount}`
      );
    }

    let method;
    if (eventData.symbol === "XRP") {
      method = "RIPPLE";
    } else if (eventData.symbol === "USDT") {
      method = "TETHERUSDTPLY";
    } else {
      method = eventData.symbol;
    }

    let payload: any = {
      wallet: "exchange",
      method,
      amount: eventData.amount.toString(),
      address: eventData.toAddress,
      fee_deduct: 1,
    };

    if (eventData.toAddressTag) {
      payload = {
        ...payload,
        payment_id: eventData.toAddressTag,
      };
    }

    const apiPath = "v2/auth/w/withdraw";
    const signParams = this.sign(apiPath, payload);
    const { data } = await firstValueFrom(
      this.httpService
        .post(`https://api.bitfinex.com/${apiPath}`, payload, {
          headers: {
            "Content-Type": "application/json",
            "bfx-nonce": signParams.nonce,
            "bfx-apikey": this.apiKey,
            "bfx-signature": signParams.signature,
          },
        })
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

    console.log(data);

    return data[0];
  }
}
