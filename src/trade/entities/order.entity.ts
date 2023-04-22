import { IEvent } from "@nestjs/cqrs";

export interface IOrderEventData {
  id: number;
  timestamp: number;
  type: string; // BUY or SELL
  symbol: string;
  amount: number;
  price: number;
  exchange: string;
}

export class OrderEvent implements IEvent {
  constructor(public readonly data: IOrderEventData) {}
}
