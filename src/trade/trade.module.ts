import { Module } from "@nestjs/common";
import { TickerEventHandler } from "./trade.handler";
import { BitfinexModule } from "../bitfinex/bitfinex.module";
import { BinanceModule } from "../binance/binance.module";

@Module({
  imports: [BitfinexModule, BinanceModule],
  providers: [TickerEventHandler],
})
export class TradeModule {}
