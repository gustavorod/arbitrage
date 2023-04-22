import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { CqrsModule } from "@nestjs/cqrs";
import { generateNumericId, mockedConfigService } from "../utils/config";
import { OrderEvent } from "../trade/entities/order.entity";
import { BinanceGateway } from "./binance.gateway";

describe("BinanceGateway", () => {
  let gateway: BinanceGateway;

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  beforeAll(async () => {
    const app: TestingModule = await Test.createTestingModule({
      imports: [CqrsModule],
      providers: [
        BinanceGateway,
        {
          provide: ConfigService,
          useValue: mockedConfigService,
        },
      ],
    }).compile();

    gateway = app.get<BinanceGateway>(BinanceGateway);
    gateway.afterInit();
    await sleep(10000);
  }, 15000);

  it("should be defined", () => {
    expect(gateway).toBeDefined();
  });

  it("should place a buy order", () => {
    const amount = 0.00006;
    const price = 31000;

    const event: OrderEvent = {
      data: {
        exchange: "BINANCE",
        id: generateNumericId(),
        type: "SELL",
        symbol: "BTC",
        timestamp: Date.now(),
        amount,
        price,
      },
    };

    const tradeSent = gateway.trade(event);
    expect(tradeSent).toBeTruthy();
  });
});
