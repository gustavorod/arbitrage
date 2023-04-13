import { EventsHandler, IEventHandler } from "@nestjs/cqrs";
import { TickerEvent } from "./entities/ticker.entity";

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

@EventsHandler(TickerEvent)
export class TickerEventHandler implements IEventHandler<TickerEvent> {
  private bestDeals: Map<string, Deal> = new Map();
  private pairExchangeOffers: Map<string, Map<string, TickerEvent>> = new Map();
  private minMargin: number = 0.1;
  private minSeconds: number = 60;

  handle(event: TickerEvent): any {
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
      if (deal.margin > bestDeal.margin && diffSeconds > 300) {
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
      if (newBestDeal.margin > this.minMargin) {
        newBestDeal.totalTrades++;
        newBestDeal.totalMargins.push(newBestDeal.margin);
      }

      if (newBestDeal.margin > this.minMargin || isFirst) {
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

    if (a.data.ask < b.data.bid) {
      profit = b.data.bid - a.data.ask;
      buyAt = a;
      sellAt = b;
    } else if (b.data.ask < a.data.bid) {
      profit = a.data.bid - b.data.ask;
      buyAt = b;
      sellAt = a;
    } else {
      return null;
    }

    if (timeDiffSeconds > this.minSeconds) {
      /*console.log(
        `No deal ${timeDiffSeconds} seconds => Buy: ${buyAt.data.symbol}@${
          buyAt.data.exchange
        }@${new Date(buyAt.data.timestamp).toISOString()} Sell: ${
          sellAt.data.symbol
        }@${sellAt.data.exchange}@${new Date(
          sellAt.data.timestamp
        ).toISOString()} `
      );*/
      return null;
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
}
