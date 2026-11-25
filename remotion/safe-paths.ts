// @remotion/paths returns null for points/tangents of zero-length paths.
// All paths in this project are static and non-empty, so fall back to the origin.
import {
  getPointAtLength as getPointAtLengthOrNull,
  getTangentAtLength as getTangentAtLengthOrNull,
} from "@remotion/paths";

type Point = { x: number; y: number };

const ORIGIN: Point = { x: 0, y: 0 };

export const getPointAtLength = (path: string, length: number): Point =>
  getPointAtLengthOrNull(path, length) ?? ORIGIN;

export const getTangentAtLength = (path: string, length: number): Point =>
  getTangentAtLengthOrNull(path, length) ?? ORIGIN;
