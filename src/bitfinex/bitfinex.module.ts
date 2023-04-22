import { Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";
import { BitfinexGateway } from "./bitfinex.gateway";
import { HttpModule } from "@nestjs/axios";

@Module({
  imports: [CqrsModule, HttpModule],
  providers: [BitfinexGateway],
})
export class BitfinexModule {}
