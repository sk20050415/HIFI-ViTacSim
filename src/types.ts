export type Vec3Tuple = [number, number, number];

export interface CapturedView {
  id: string;
  label: string;
  real: string;
  gaussian: string;
  camera: {
    width: number;
    height: number;
    fx: number;
    fy: number;
    position: Vec3Tuple;
    rotation: [Vec3Tuple, Vec3Tuple, Vec3Tuple];
    target: Vec3Tuple;
    up: Vec3Tuple;
    verticalFov: number;
  };
}

export interface SceneManifest {
  version: number;
  scene: string;
  models: {
    gaussian: { url: string; gaussians: number; bytes: number; shBands: number };
    neural: {
      high: { url: string; vertices: number; triangles: number; bytes: number };
      mobile: { url: string; vertices: number; triangles: number; bytes: number };
    };
  };
  table: { center: Vec3Tuple; sizeMeters: [number, number] };
  orbit: {
    yawMin: number;
    yawMax: number;
    pitchMin: number;
    pitchMax: number;
    distanceMinMeters: number;
    distanceMaxMeters: number;
    panHalfExtentMeters: [number, number];
    worldUp?: Vec3Tuple;
    unitsPerMeter?: number;
    referencePosition?: Vec3Tuple;
  };
  views: CapturedView[];
}
