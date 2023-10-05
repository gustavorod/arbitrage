import { Module } from "@nestjs/common";
import { BybitGateway } from "./bybit.gateway";

@Module({
  providers: [BybitGateway],
})
export class BybitModule {}
