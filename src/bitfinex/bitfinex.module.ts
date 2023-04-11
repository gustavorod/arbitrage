import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { BitfinexGateway } from './bitfinex.gateway';

@Module({
  imports: [CqrsModule],
  providers: [BitfinexGateway],
})
export class BitfinexModule {}
