import { IEvent } from '@nestjs/cqrs';

export interface ITickerEventData {
  exchange: string; // exchange
  timestamp: number; // timestamp
  symbol: string; // symbol
  bid: number; // best bid price
  bidQty: string; // best bid qty
  ask: number; // best ask price
  askQty: string; // best ask qty
}

export class TickerEvent implements IEvent {
  constructor(public readonly data: ITickerEventData) {}
}
