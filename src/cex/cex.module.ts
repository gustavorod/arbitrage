import { Module } from "@nestjs/common";
import { CexGateway } from "./cex.gateway";

@Module({
  providers: [CexGateway],
})
export class CexModule {}
