/**
 * Coût/km auto-calculé : carburant + entretien.
 *
 * Période : depuis le premier plein/entretien enregistré, ou les 12 derniers mois
 * si aucun plein/entretien.
 */

import type { FuelEntry } from '@/types/fuel';
import type { MaintenanceItem, Trip, Vehicle } from '@/types/trips';
import { getFuelEntries } from '@/utils/fuelStorage';
import { getTrips } from '@/utils/tripStorage';
import { computeOdometer } from '@/utils/tripStorage';

const MS_12_MONTHS = 365 * 24 * 3_600_000;

export interface CostBreakdown {
  fuelCostPerKm: number;
  fuelCostPer100km: number;
  fuelTotalLiters: number;
  fuelLPer100km: number;
  maintenanceCostPerKm: number;
  maintenanceCostPer100km: number;
  insuranceCostPerKm: number;
  insuranceCostPer100km: number;
  totalCostPerKm: number;
  totalCostPer100km: number;
  kmInPeriod: number;
  fuelTotalEUR: number;
  maintenanceTotalEUR: number;
  insuranceTotalEUR: number;
  periodStartMs: number;
}

/**
 * Calculate auto cost-per-km for a vehicle.
 * Returns null when there is no trip data to compute against.
 */
export async function computeAutoCostPerKm(vehicle: Vehicle): Promise<CostBreakdown | null> {
  const [trips, fuelEntries] = await Promise.all([getTrips(), getFuelEntries()]);

  const vehicleTrips = trips.filter(t => t.vehicle === vehicle.id);
  const vehicleFuel  = fuelEntries.filter(e => e.vehicleId === vehicle.id && !e.isExternal);

  // Determine period start: earliest fuel entry or earliest maintenance reset, or 12 months ago
  const firstFuelMs   = vehicleFuel.length > 0 ? Math.min(...vehicleFuel.map(e => e.timestamp)) : Infinity;
  const maintResets   = vehicle.maintenanceItems
    .filter(i => i.lastResetDate && i.cost != null && i.cost > 0)
    .map(i => i.lastResetDate!);
  const firstMaintMs  = maintResets.length > 0 ? Math.min(...maintResets) : Infinity;

  let periodStartMs = Math.min(firstFuelMs, firstMaintMs);
  if (periodStartMs === Infinity) {
    periodStartMs = Date.now() - MS_12_MONTHS;
  }

  // KM in period: use odometer delta from period start to now
  const odoNow    = computeOdometer(trips, vehicle.id, vehicle.odometerBaseKm, vehicle.odometerAdjustments);
  const tripsBefore = vehicleTrips.filter(t => t.endTime < periodStartMs);
  const kmBefore  = tripsBefore.reduce((s, t) => s + t.distanceKm, 0);
  const kmInPeriod = Math.max(0, odoNow - vehicle.odometerBaseKm - kmBefore);

  if (kmInPeriod <= 0) return null;

  // Fuel cost in period
  const fuelInPeriod = vehicleFuel.filter(e => e.timestamp >= periodStartMs);
  const fuelTotalEUR    = fuelInPeriod.reduce((s, e) => s + e.totalCost, 0);
  const fuelTotalLiters = fuelInPeriod.reduce((s, e) => s + e.liters, 0);

  // Maintenance cost in period (items with a cost that were reset within the period)
  const maintInPeriod = vehicle.maintenanceItems.filter(
    i => i.cost != null && i.cost > 0 && i.lastResetDate && i.lastResetDate >= periodStartMs,
  );
  const maintenanceTotalEUR = maintInPeriod.reduce((s, i) => s + (i.cost ?? 0), 0);

  // Insurance cost in period: annual premium prorated over period length
  const periodDays = (Date.now() - periodStartMs) / (24 * 3_600_000);
  const insuranceTotalEUR = vehicle.insurance?.annualCost
    ? vehicle.insurance.annualCost * (periodDays / 365)
    : 0;

  // ── Consommation L/100 — méthode des pleins (dernier intervalle valide) ───
  // On cherche le dernier couple de pleins consécutifs avec km > 5 entre eux.
  // Fallback sur total_litres / total_km si un seul plein enregistré.
  const vehicleFuelSorted = [...vehicleFuel].sort((a, b) => a.timestamp - b.timestamp);
  let fuelLPer100km = 0;
  for (let i = vehicleFuelSorted.length - 1; i >= 1; i--) {
    const fNew  = vehicleFuelSorted[i]!;
    const fPrev = vehicleFuelSorted[i - 1]!;
    const kmBetween = vehicleTrips
      .filter(t => t.startTime >= fPrev.timestamp && t.startTime < fNew.timestamp)
      .reduce((s, t) => s + t.distanceKm, 0);
    if (kmBetween > 5) {
      fuelLPer100km = (fNew.liters / kmBetween) * 100;
      break;
    }
  }
  if (fuelLPer100km === 0 && kmInPeriod > 0) {
    fuelLPer100km = (fuelTotalLiters / kmInPeriod) * 100; // fallback 1 seul plein
  }

  const fuelCostPerKm        = fuelTotalEUR / kmInPeriod;
  const maintenanceCostPerKm = maintenanceTotalEUR / kmInPeriod;
  const insuranceCostPerKm   = insuranceTotalEUR / kmInPeriod;
  const totalCostPerKm       = fuelCostPerKm + maintenanceCostPerKm + insuranceCostPerKm;

  return {
    fuelCostPerKm,
    fuelCostPer100km:          fuelCostPerKm * 100,
    fuelTotalLiters,
    fuelLPer100km,
    maintenanceCostPerKm,
    maintenanceCostPer100km:   maintenanceCostPerKm * 100,
    insuranceCostPerKm,
    insuranceCostPer100km:     insuranceCostPerKm * 100,
    totalCostPerKm,
    totalCostPer100km:         totalCostPerKm * 100,
    kmInPeriod,
    fuelTotalEUR,
    maintenanceTotalEUR,
    insuranceTotalEUR,
    periodStartMs,
  };
}

/**
 * Convenience: returns the effective cost-per-km for a vehicle.
 * - Manual mode (or no mode set) → returns the stored costPerKm.
 * - Auto mode → computes fuel + maintenance / km.
 */
export async function getEffectiveCostPerKm(vehicle: Vehicle): Promise<number> {
  if (vehicle.costMode !== 'auto') return vehicle.costPerKm;
  const computed = await computeAutoCostPerKm(vehicle);
  return computed?.totalCostPerKm ?? vehicle.costPerKm;
}
