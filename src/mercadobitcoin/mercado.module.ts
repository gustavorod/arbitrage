import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { MercadoGateway } from './mercado.gateway';

@Module({
  imports: [CqrsModule],
  providers: [MercadoGateway],
})
export class MercadoModule {}
