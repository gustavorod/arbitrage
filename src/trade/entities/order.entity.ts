import { IEvent } from "@nestjs/cqrs";

export interface IOrderEventData {
  id: number;
  timestamp: number;
  type: string;
  symbol: string;
  amount: number;
  price: number;
}

export class OrderEvent implements IEvent {
  constructor(public readonly data: IOrderEventData) {}
}
