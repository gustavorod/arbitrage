import { Test, TestingModule } from "@nestjs/testing";
import { BitfinexGateway } from "./bitfinex.gateway";
import { ConfigService } from "@nestjs/config";
import { CqrsModule } from "@nestjs/cqrs";
import { generateNumericId, mockedConfigService } from "../utils/config";
import { OrderEvent } from "../trade/entities/order.entity";

describe("BitfinexGateway", () => {
  let gateway: BitfinexGateway;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      imports: [CqrsModule],
      providers: [
        BitfinexGateway,
        {
          provide: ConfigService,
          useValue: mockedConfigService,
        },
      ],
    }).compile();

    gateway = app.get<BitfinexGateway>(BitfinexGateway);
  });

  it("should be defined", () => {
    expect(gateway).toBeDefined();
  });

  it("should place a buy order", () => {
    const amount = 0.00006;
    const price = 30190;
    const balance = [[0, "BTC", 1]];
    gateway.updateBalances(balance);

    const event: OrderEvent = {
      data: {
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
