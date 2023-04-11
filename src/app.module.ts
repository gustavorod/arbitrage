import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { BinanceModule } from './binance/binance.module';
import { TradeModule } from './trade/trade.module';
import { BitfinexModule } from './bitfinex/bitfinex.module';
import { ConfigModule } from '@nestjs/config';
import { MercadoModule } from './mercadobitcoin/mercado.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    BinanceModule,
    BitfinexModule,
    //MercadoModule,
    TradeModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
