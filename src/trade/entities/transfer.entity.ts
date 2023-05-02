export interface ITransferEventData {
  id: number;
  exchange: string;
  timestamp: number;
  symbol: string;
  amount: number;
  toAddress: string;
  toAddressTag?: string;
}

export class TransferEvent {
  constructor(public readonly data: ITransferEventData) {}
}
