import type { RoundedPin } from "./types";

/** Round to hundredths of a degree (about 1 km). The precise point never leaves the device. */
export function roundPin(lat: number, lng: number): RoundedPin {
  return { lat_centi: Math.round(lat * 100), lng_centi: Math.round(lng * 100) };
}

export function pinCenter(pin: RoundedPin): [number, number] {
  return [pin.lat_centi / 100, pin.lng_centi / 100];
}

/** Great-circle distance in km between two rounded pins. */
export function distanceKm(a: RoundedPin, b: RoundedPin): number {
  const [lat1, lng1] = pinCenter(a).map((d) => (d * Math.PI) / 180);
  const [lat2, lng2] = pinCenter(b).map((d) => (d * Math.PI) / 180);
  const h = Math.sin((lat2 - lat1) / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin((lng2 - lng1) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** Pins are only accurate to about 1 km, so don't pretend otherwise. */
export function describeDistance(km: number): string {
  if (km < 1) return "Very close by";
  return `About ${Math.round(km)} km away`;
}
