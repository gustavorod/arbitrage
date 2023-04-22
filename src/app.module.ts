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

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    //BybitModule,
    BinanceModule,
    //BitfinexModule,
    //CurrencyModule,
    //DydxModule,
    TradeModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
