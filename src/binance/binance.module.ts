import { Module } from "@nestjs/common";
import { BinanceGateway } from "./binance.gateway";
import { HttpModule } from "@nestjs/axios";

@Module({
  imports: [HttpModule],
  providers: [BinanceGateway],
  exports: [BinanceGateway],
})
export class BinanceModule {}
