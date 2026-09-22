import { catalogEntry } from "./catalog.ts";

export type NodeShape = "rect" | "pill" | "circle" | "deep" | "point" | "particle" | "input" | "output";

// Strings returned by DD::Image::Op::node_shape in Nuke 17.0v3:
// [] rect, () round-ended box, O circle, \) deep, << pointed, [) particle.

const CIRCLE = new Set([
  "Axis",
  "Axis2",
  "Axis3",
  "Axis4",
  "Camera",
  "Camera2",
  "Camera3",
  "Camera4",
  "GeoCamera",
  "Light",
  "Light2",
  "Light3",
  "Light4",
  "Direct",
  "Spot",
  "Point",
  "Environment",
  "Scene",
  "GeoScene",
  "GeoDiskLight",
  "GeoDistantLight",
  "GeoDomeLight",
  "GeoSphereLight",
  "GeoEditLight",
]);

const POINT = new Set([
  "Viewer",
  "BasicMaterial",
  "Phong",
  "Diffuse",
  "Emission",
  "Specular",
  "BlendMat",
  "FillMat",
  "MergeMat",
  "Displacement",
]);

const PILL = new Set([
  "Card",
  "Card2",
  "Card3D",
  "Cube",
  "Sphere",
  "Cylinder",
  "ReadGeo",
  "ReadGeo2",
  "WriteGeo",
  "MergeGeo",
  "TransformGeo",
  "DisplaceGeo",
  "EditGeo",
  "Normals",
  "CrosstalkGeo",
  "LogGeo",
  "LookupGeo",
  "UVProject",
  "ApplyMaterial",
  "DepthToPoints",
  "PositionToPoints",
]);

export function nodeShape(className: string): NodeShape {
  // Group ends are pointed. Input is wide at the top; Output is wide at the bottom.
  if (className === "Input") return "input";
  if (className === "Output") return "output";
  if (
    className === "Group" ||
    className === "Gizmo" ||
    className === "LiveGroup" ||
    className === "VariableGroup"
  ) {
    return "point";
  }
  const listed = catalogEntry(className)?.shape;
  if (listed) return listed;
  if (CIRCLE.has(className)) return "circle";
  if (POINT.has(className)) return "point";
  if (className.startsWith("Deep")) return "deep";
  if (className.startsWith("Particle")) return "particle";
  if (PILL.has(className) || className.startsWith("Geo")) return "pill";
  return "rect";
}
