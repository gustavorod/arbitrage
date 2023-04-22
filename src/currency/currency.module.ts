import { Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";
import { CurrencyGateway } from "./currency.gateway";

@Module({
  imports: [CqrsModule],
  providers: [CurrencyGateway],
})
export class CurrencyModule {}
