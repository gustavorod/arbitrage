import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { BinanceModule } from "./binance/binance.module";
import { TradeModule } from "./trade/trade.module";
import { BitfinexModule } from "./bitfinex/bitfinex.module";
import { ConfigModule } from "@nestjs/config";
import { CurrencyModule } from "./currency/currency.module";
import { BybitModule } from "./bybit/bybit.module";
import { DydxModule } from "./dydx/dydx.module";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { CexModule } from "./cex/cex.module";
import { CoinbaseModule } from "./coinbase/coinbase.module";
import { BityprecoModule } from "./bitypreco/bitypreco.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    EventEmitterModule.forRoot({
      // set this to `true` to use wildcards
      wildcard: false,
      // the delimiter used to segment namespaces
      delimiter: ".",
      // set this to `true` if you want to emit the newListener event
      newListener: false,
      // set this to `true` if you want to emit the removeListener event
      removeListener: false,
      // the maximum amount of listeners that can be assigned to an event
      maxListeners: 20,
      // show event name in memory leak message when more than maximum amount of listeners is assigned
      verboseMemoryLeak: false,
      // disable throwing uncaughtException if an error event is emitted and it has no listeners
      ignoreErrors: false,
    }),
    BityprecoModule,
    BybitModule,
    CexModule,
    CoinbaseModule,
    CurrencyModule,
    DydxModule,
    TradeModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
