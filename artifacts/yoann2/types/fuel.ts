export interface FuelEntry {
  id: string;
  timestamp: number;
  date: string;
  vehicleId: string | null;
  vehicleName: string;
  vehicleType: 'car' | 'moto' | 'other' | 'walk' | null;
  fuelType: 'gazole' | 'sp95' | 'sp98';
  liters: number;
  totalCost: number;
  pricePerLiter: number;
  isExternal: boolean;
  financeTransactionId?: string;
}
