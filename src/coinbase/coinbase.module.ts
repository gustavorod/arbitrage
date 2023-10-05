import { Module } from "@nestjs/common";
import { CoinbaseGateway } from "./coinbase.gateway";

@Module({
  providers: [CoinbaseGateway],
})
export class CoinbaseModule {}
