export interface ITickerEventData {
  exchange: string; // exchange
  timestamp: number; // timestamp
  symbol: string; // symbol
  bid: number; // best bid price
  bidQty: number; // best bid qty
  ask: number; // best ask price
  askQty: number; // best ask qty
}

export class TickerEvent {
  constructor(public readonly data: ITickerEventData) {}
}
