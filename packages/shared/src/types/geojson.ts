/** Subconjunto de GeoJSON (RFC 7946) usado por el contrato. Coordenadas [lng, lat]. */
export type Position = [lng: number, lat: number];

export interface PointGeometry {
  type: 'Point';
  coordinates: Position;
}

export interface LineStringGeometry {
  type: 'LineString';
  coordinates: Position[];
}

export interface PolygonGeometry {
  type: 'Polygon';
  coordinates: Position[][];
}

export interface MultiPolygonGeometry {
  type: 'MultiPolygon';
  coordinates: Position[][][];
}

export type Geometry = PointGeometry | LineStringGeometry | PolygonGeometry | MultiPolygonGeometry;

export interface Feature<G, P> {
  type: 'Feature';
  id: string;
  geometry: G;
  properties: P;
}

export interface FeatureCollection<G, P> {
  type: 'FeatureCollection';
  features: Feature<G, P>[];
}

/** bbox = [minLng, minLat, maxLng, maxLat] */
export type BBox = [number, number, number, number];
