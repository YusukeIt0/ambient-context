/** Great-circle distance in metres (haversine, mean Earth radius 6,371 km). */
export function distanceMeters(a: {latitude: number; longitude: number}, b: {latitude: number; longitude: number}): number {
  const radians = Math.PI / 180;
  const lat = (b.latitude - a.latitude) * radians;
  const lon = (b.longitude - a.longitude) * radians;
  const h = Math.sin(lat / 2) ** 2 + Math.cos(a.latitude * radians) * Math.cos(b.latitude * radians) * Math.sin(lon / 2) ** 2;
  return 6_371_000 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}
