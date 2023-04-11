import { Module } from '@nestjs/common';
import { TickerEventHandler } from './trade.handler';

@Module({
  providers: [TickerEventHandler],
})
export class TradeModule {}
