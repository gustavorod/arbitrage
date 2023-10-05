import { Module } from "@nestjs/common";
import { BitfinexGateway } from "./bitfinex.gateway";
import { HttpModule } from "@nestjs/axios";

@Module({
  imports: [HttpModule],
  providers: [BitfinexGateway],
  exports: [BitfinexGateway],
})
export class BitfinexModule {}
