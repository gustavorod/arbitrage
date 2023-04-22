import { Module } from "@nestjs/common";
import { CqrsModule } from "@nestjs/cqrs";
import { DydxGateway } from "./dydx.gateway";

@Module({
  imports: [CqrsModule],
  providers: [DydxGateway],
})
export class DydxModule {}
