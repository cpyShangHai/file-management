export const dragSession = {
  paths: [],
};

export function setDragPaths(paths) {
  dragSession.paths = Array.isArray(paths) ? [...paths] : [];
}

export function clearDragPaths() {
  dragSession.paths = [];
}

export function getDragPaths() {
  return dragSession.paths.length ? [...dragSession.paths] : null;
}
