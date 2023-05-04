import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { CqrsModule } from "@nestjs/cqrs";
import { generateNumericId, mockedConfigService } from "../utils/config";
import { OrderEvent } from "../trade/entities/order.entity";
import { BinanceGateway } from "./binance.gateway";
import { HttpModule } from "@nestjs/axios";
import { TransferEvent } from "../trade/entities/transfer.entity";

describe("BinanceGateway", () => {
  let gateway: BinanceGateway;

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  beforeAll(async () => {
    const app: TestingModule = await Test.createTestingModule({
      imports: [CqrsModule, HttpModule],
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
    await sleep(7500);
  }, 15000);

  it("should be defined", () => {
    expect(gateway).toBeDefined();
  });

  it("should place a buy order", () => {
    const amount = 78.1;
    const price = 0.384;

    const event: OrderEvent = {
      data: {
        exchange: "BINANCE",
        id: generateNumericId(),
        type: "BUY",
        symbol: "ADAUSDT",
        timestamp: Date.now(),
        amount,
        price,
      },
    };

    const tradeSent = gateway.trade(event);
    expect(tradeSent).toBeTruthy();
  });

  it("should transfer to wallet", async () => {
    expect(gateway).toBeDefined();
    const event: TransferEvent = {
      data: {
        exchange: "BINANCE",
        id: generateNumericId(),
        symbol: "XRP",
        timestamp: Date.now(),
        amount: 30,
        toAddress: "rLW9gnQo7BQhU6igk5keqYnH3TVrCxGRzm",
        toAddressTag: "412613242",
      },
    };

    await gateway.transferTo(event);
  });

  it("should generate signature", async () => {
    const payload = {
      symbol: "LTCBTC",
      side: "BUY",
      type: "LIMIT",
      timeInForce: "GTC",
      quantity: "1",
      price: "0.1",
      recvWindow: "5000",
      timestamp: "1499827319559",
    };

    const signature = gateway.sign(
      payload,
      "NhqPtmdSJYdKjVHjA7PZj4Mge3R5YNiP1e3UZjInClVN65XAbvqqM6A7H5fATj0j",
      false
    ).signature;

    expect(signature).toBe(
      "c8db56825ae71d6d79447849e617115f4a920fa2acdcab2b053c4b2838bd6b71"
    );
  });
});
