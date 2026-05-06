/**
 * Shared geofence and session constants for the attendance module.
 * Single source of truth — used by AttendanceSessionService and AttendanceFinalizationService.
 */

export const OFFICE_LATITUDE = 11.982748317280704;
export const OFFICE_LONGITUDE = 75.36459629666871;
export const ALLOWED_RADIUS_METERS = 200;
export const MAX_SESSION_HOURS = 10;

/**
 * Calculate distance between two GPS coordinates using the Haversine formula.
 * @returns distance in meters
 */
export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
