import { Module } from "@nestjs/common";
import { TickerEventHandler } from "./trade.handler";
import { CqrsModule } from "@nestjs/cqrs";

@Module({
  imports: [CqrsModule],
  providers: [TickerEventHandler],
})
export class TradeModule {}
