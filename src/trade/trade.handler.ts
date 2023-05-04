import { TickerEvent } from "./entities/ticker.entity";
import { ConfigService } from "@nestjs/config";
import { OrderEvent } from "./entities/order.entity";
import { generateNumericId } from "../utils/config";
import { BinanceGateway } from "../binance/binance.gateway";
import { BitfinexGateway } from "../bitfinex/bitfinex.gateway";
import { TransferEvent } from "./entities/transfer.entity";
import { EventEmitter2, OnEvent } from "@nestjs/event-emitter";
import { WebSocketGateway, OnGatewayInit } from "@nestjs/websockets";

type Deal = {
  tradingPair: string;
  timestamp: number;
  spread: number;
  margin: number;
  totalMargins: number[];
  totalTrades: number;
  totalProfit: number;
  buyAt: TickerEvent;
  sellAt: TickerEvent;
};

@WebSocketGateway()
export class TickerEventHandler implements OnGatewayInit {
  private bestDeals: Map<string, Deal> = new Map();
  private pairExchangeOffers: Map<string, Map<string, TickerEvent>> = new Map();
  private MIN_MARGIN: number = 0.7;
  private MIN_SECONDS: number = 2;
  private MIN_SECONDS_TRADE: number = 20;
  private MIN_SECONDS_TRANSFER: number = 60 * 21;
  private TRANSFER_DIFF: number = 20;
  private MAX_BUY_USDT: number = 50;
  private MIN_BUY_USDT: number = 10;
  private canTrade: boolean = true;
  private canTransfer: boolean = true;
  private tradingSymbols: Array<string>;
  private lastTransfer: number;
  private lastTrade: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
    private readonly binanceGateway: BinanceGateway,
    private readonly bitfinexGateway: BitfinexGateway
  ) {
    this.tradingSymbols = this.configService.get<string>("SYMBOLS").split(",");
    this.tradingSymbols.push("USDT");
    this.lastTrade = Date.now() - this.MIN_SECONDS_TRADE * 1000;
    this.lastTransfer = Date.now(); // - this.MIN_SECONDS_TRANSFER * 1000;
  }

  afterInit(server: any) {
    console.log("TickerEventHandler initialized", this.tradingSymbols);
  }

  @OnEvent("ticker.created")
  ticker(event: TickerEvent): any {
    const { exchange, symbol, ask, bid } = event.data;

    // Initialize the object for the symbol if it doesn't exist
    if (!this.pairExchangeOffers[symbol]) {
      this.pairExchangeOffers[symbol] = {};
    }

    this.pairExchangeOffers[symbol][exchange] = event;
    const pairExchangeOffers: Map<string, TickerEvent> =
      this.pairExchangeOffers[symbol];

    Object.entries(pairExchangeOffers).forEach(([key, ticker]) => {
      if (ticker.data.exchange !== exchange) {
        const deal = this.comparePrices(event, ticker);

        if (deal !== null) {
          this.challengeBestDeal(deal);
        }
      }
    });

    //this.equilibrateBalancesHalfHalf();
  }

  printDeal(deal: Deal) {
    const sum = deal.totalMargins.reduce(
      (accumulator, currentValue) => accumulator + currentValue,
      0
    );
    const length = deal.totalMargins.length;
    const avg = length == 0 ? 0 : sum / deal.totalMargins.length;

    console.log(`--------------------------------`);
    console.log(`TradingPair@${deal.tradingPair}`);
    console.log(`Timestamp@${new Date().toISOString()}`);
    console.log(
      `Buy@${deal.buyAt.data.exchange}: ${deal.buyAt.data.ask}@${new Date(
        deal.buyAt.data.timestamp
      ).toISOString()}`
    );
    console.log(
      `Sell@${deal.sellAt.data.exchange}: ${deal.sellAt.data.bid}@${new Date(
        deal.sellAt.data.timestamp
      ).toISOString()}`
    );
    console.log(
      `Trades: ${deal.totalTrades} => ${deal.totalMargins.map((m) =>
        m.toFixed(4)
      )}`
    );
    console.log(
      `Margin: ${deal.spread.toFixed(4)} / ${deal.margin.toFixed(
        4
      )}% / ${avg.toFixed(4)}%`
    );
  }

  challengeBestDeal(deal: Deal) {
    if (deal.buyAt === undefined || deal.sellAt === undefined) {
      throw new Error("Buy and sell events must be defined");
    }

    const bestDeal = this.bestDeals.get(deal.tradingPair);
    let newBestDeal;
    let isFirst = false;

    if (bestDeal) {
      const diffSeconds = (deal.timestamp - bestDeal.timestamp) / 1000;
      if (
        deal.margin > this.MIN_MARGIN /*bestDeal.margin*/ &&
        diffSeconds > this.MIN_SECONDS_TRADE
      ) {
        newBestDeal = deal;
        newBestDeal.totalTrades = bestDeal.totalTrades;
        newBestDeal.totalMargins = bestDeal.totalMargins;
      }
    } else {
      newBestDeal = deal;
      isFirst = true;
    }

    if (newBestDeal) {
      // Simulate a trade
      if (newBestDeal.margin > this.MIN_MARGIN) {
        newBestDeal.totalTrades++;
        newBestDeal.totalMargins.push(newBestDeal.margin);
        this.closeDeal(newBestDeal);
      }

      if (/*newBestDeal.margin > this.MIN_MARGIN ||*/ isFirst) {
        this.printDeal(newBestDeal);
      }

      this.bestDeals.set(deal.tradingPair, newBestDeal);
    }
  }

  comparePrices(a: TickerEvent, b: TickerEvent) {
    let profit = 0;
    let buyAt: TickerEvent;
    let sellAt: TickerEvent;

    if (a.data.symbol !== b.data.symbol) {
      throw new Error("Trading pairs must be the same");
    }

    if (a.data.exchange === b.data.exchange) {
      throw new Error("Exchanges must be different");
    }

    const timeDiffSeconds = Math.abs(
      (a.data.timestamp - b.data.timestamp) / 1000
    );

    // Maximum time difference between the two prices
    if (timeDiffSeconds > this.MIN_SECONDS) {
      return null;
    }

    const profitOne = b.data.bid - a.data.ask;
    const profitTwo = a.data.bid - b.data.ask;

    if (profitOne <= 0 && profitTwo <= 0) {
      return null;
    }

    if (profitOne > profitTwo) {
      profit = profitOne;
      buyAt = a;
      sellAt = b;
    } else {
      profit = profitTwo;
      buyAt = b;
      sellAt = a;
    }

    if (profit > 0) {
      const margin: number = (profit / buyAt.data.ask) * 100;
      const deal: Deal = {
        tradingPair: a.data.symbol,
        timestamp: Date.now(),
        spread: profit,
        margin,
        totalMargins: [],
        totalTrades: 0,
        totalProfit: profit,
        buyAt,
        sellAt,
      };
      return deal;
    } else {
      return null; // no deal
    }
  }

  getBalance(exchange: string, symbol: string) {
    if (exchange === "BINANCE") {
      return this.binanceGateway.getBalance(symbol);
    } else if (exchange === "BITFINEX") {
      return this.bitfinexGateway.getBalance(symbol);
    } else {
      throw new Error("Exchange not supported");
    }
  }

  closeDeal(deal: Deal) {
    if (!this.canTrade) {
      return;
    }

    const timeDiffSeconds = Math.abs((Date.now() - this.lastTrade) / 1000);

    if (timeDiffSeconds < this.MIN_SECONDS_TRADE) {
      return;
    }

    const buyData = deal.buyAt.data;
    const sellData = deal.sellAt.data;

    const priceBuy: number = Number((buyData.ask + 0.0002).toFixed(4));
    const priceSell: number = Number((sellData.bid - 0.002).toFixed(4));

    const buyUsdBalance = Math.min(
      this.getBalance(buyData.exchange, "USDT") * 0.95,
      this.MAX_BUY_USDT
    );

    // Calculate the max amount to buy based on price
    const buyMaxAmount = buyUsdBalance / priceBuy;
    const sellSymbolBalance = this.getBalance(
      sellData.exchange,
      sellData.symbol.replace("USDT", "")
    );

    // Buy and sell the same amount respecting the limits
    const amount: number = Number(
      Math.min(
        buyMaxAmount,
        sellSymbolBalance,
        Math.abs(buyData.askQty),
        Math.abs(sellData.bidQty)
      ).toFixed(1)
    );

    if (amount * priceBuy < this.MIN_BUY_USDT) {
      console.log(
        `Error@MIN_BUY_USDT: was not achieved ${amount} x ${priceBuy} < ${this.MIN_BUY_USDT}`
      );
    } else {
      const buyAtEvent = new OrderEvent({
        exchange: buyData.exchange,
        type: "BUY",
        amount,
        price: priceBuy,
        symbol: buyData.symbol,
        timestamp: Date.now(),
        id: generateNumericId(),
      });

      const sellAtEvent = new OrderEvent({
        exchange: sellData.exchange,
        type: "SELL",
        amount,
        price: priceSell,
        symbol: sellData.symbol,
        timestamp: Date.now(),
        id: generateNumericId(),
      });

      this.lastTrade = Date.now();

      this.eventEmitter.emitAsync("order.created", buyAtEvent);
      this.eventEmitter.emitAsync("order.created", sellAtEvent);

      console.log("Trade Done: ", deal);
    }
  }

  equilibrateBalancesHalfHalf() {
    if (!this.canTransfer) {
      return;
    }

    const timeDiffSeconds = Math.abs((Date.now() - this.lastTransfer) / 1000);

    if (timeDiffSeconds < this.MIN_SECONDS_TRANSFER) {
      return;
    }

    const balanceBinance = this.binanceGateway.getBalanceAll();
    const balanceBitfinex = this.bitfinexGateway.getBalanceAll();

    if (balanceBinance.size === 0 || balanceBitfinex.size === 0) {
      return;
    }

    this.tradingSymbols.forEach((key) => {
      const valueBinance: number = balanceBinance.get(key) || 0;
      const valueBitfinex: number = balanceBitfinex.get(key) || 0;

      const difference = valueBinance - valueBitfinex;
      const transferFrom = difference > 0 ? "BINANCE" : "BITFINEX";
      const transferAmount = Math.floor(Math.abs(difference) / 2);
      const perc = (transferAmount / (valueBinance + valueBitfinex)) * 100;

      if (perc > this.TRANSFER_DIFF && transferAmount > 1) {
        const toAddressExchange =
          transferFrom === "BINANCE" ? "BITFINEX" : "BINANCE";
        const envKey = `${toAddressExchange}_ADDRESS_${key}`;
        const toAddress = this.configService.get(envKey);

        if (!toAddress) {
          throw new Error(`Missing env variable ${envKey}`);
        }

        const transferEvent = new TransferEvent({
          id: generateNumericId(),
          exchange: transferFrom,
          timestamp: Date.now(),
          symbol: key,
          amount: transferAmount,
          toAddress,
        });

        this.eventEmitter.emitAsync("transfer.created", transferEvent);
        this.lastTransfer = Date.now();
      }
    });
  }
}
