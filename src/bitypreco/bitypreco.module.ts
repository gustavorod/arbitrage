import { Module } from "@nestjs/common";
import { BityprecoGateway } from "./bitypreco.gateway";

@Module({
  providers: [BityprecoGateway],
})
export class BityprecoModule {}
