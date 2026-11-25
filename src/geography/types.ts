export type Position = [number, number];
export type Geometry =
  | { type: 'Point'; coordinates: Position }
  | { type: 'MultiPoint' | 'LineString'; coordinates: Position[] }
  | { type: 'MultiLineString' | 'Polygon'; coordinates: Position[][] }
  | { type: 'MultiPolygon'; coordinates: Position[][][] };

/** Downloaded map evidence. Never a recorded phone fix or an inferred visit. */
export interface GeographicFeature {
  id: string;
  kind: string;
  category: 'area' | 'line' | 'landmark';
  name?: string;
  names?: Record<string, string>;
  geometry: Geometry;
}
export interface GeographicDataset {
  source: string;
  release: string;
  attribution: string;
  license_url: string;
  features: GeographicFeature[];
  /** Missing themes/bounded omissions must not be represented as complete coverage. */
  limitations: string[];
}
export interface GeographicReference {
  id: string;
  kind: string;
  name?: string;
  names?: Record<string, string>;
  relation: 'within_mapped_area' | 'near' | 'boundary_uncertain';
  distance_m: number;
  /** Compass bearing from the fix toward the feature, not travel direction. */
  bearing_degrees?: number;
}
export interface GeographicEvidence {
  source: string;
  release: string;
  attribution: string;
  license_url: string;
  areas: GeographicReference[];
  lines: GeographicReference[];
  landmarks: GeographicReference[];
  limitations: string[];
}
/** A measured position. `accuracy` is the horizontal radius in metres (for example a phone's reported accuracy). */
export interface GeographicFix { latitude: number; longitude: number; accuracy: number }
