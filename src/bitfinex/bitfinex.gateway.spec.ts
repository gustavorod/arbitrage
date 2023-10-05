import { Test, TestingModule } from "@nestjs/testing";
import { BitfinexGateway } from "./bitfinex.gateway";
import { ConfigService } from "@nestjs/config";
import { CqrsModule } from "@nestjs/cqrs";
import { generateNumericId, mockedConfigService } from "../utils/config";
import { OrderEvent } from "../trade/entities/order.entity";
import { TransferEvent } from "../trade/entities/transfer.entity";
import { HttpModule } from "@nestjs/axios";
import { EventEmitter2 } from "@nestjs/event-emitter";

describe("BitfinexGateway", () => {
  let gateway: BitfinexGateway;

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  beforeAll(async () => {
    const app: TestingModule = await Test.createTestingModule({
      imports: [CqrsModule, HttpModule],
      providers: [
        BitfinexGateway,
        {
          provide: ConfigService,
          useValue: mockedConfigService,
        },
        {
          provide: EventEmitter2,
          useValue: {
            emit: jest.fn(),
          },
        },
      ],
    }).compile();

    gateway = app.get<BitfinexGateway>(BitfinexGateway);
    gateway.afterInit();
    await sleep(7500);
  }, 15000);

  it("should be defined", () => {
    expect(gateway).toBeDefined();
  });

  it("should place a buy order", () => {
    const event: OrderEvent = {
      data: {
        exchange: "BITFINEX",
        id: generateNumericId(),
        type: "BUY",
        symbol: "ADAUST",
        timestamp: Date.now(),
        amount: 30,
        price: 0.38,
      },
    };

    const tradeSent = gateway.trade(event);
    expect(tradeSent).toBeTruthy();
  });

  it("should transfer to wallet", async () => {
    expect(gateway).toBeDefined();
    const event: TransferEvent = {
      data: {
        exchange: "BITFINEX",
        id: generateNumericId(),
        symbol: "XRP",
        timestamp: Date.now(),
        amount: 30.5,
        toAddress: "rNxp4h8apvRis6mJf9Sh8C6iRxfrDWN7AV",
        toAddressTag: "414874511",
      },
    };

    await gateway.transferTo(event);
  });
});
