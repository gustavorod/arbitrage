import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { BinanceGateway } from './binance.gateway';

@Module({
  imports: [CqrsModule],
  providers: [BinanceGateway],
})
export class BinanceModule {}
