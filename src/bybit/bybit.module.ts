import { Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";
import { BybitGateway } from "./bybit.gateway";

@Module({
  imports: [CqrsModule],
  providers: [BybitGateway],
})
export class BybitModule {}
