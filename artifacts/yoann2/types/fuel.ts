export interface FuelEntry {
  id: string;
  timestamp: number;
  vehicle: 'car' | 'moto';
  liters: number;
  pricePerLiter: number;
}
