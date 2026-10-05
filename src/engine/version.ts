/** Tracks in-place pixel modifications of canvases so caches keyed by canvas stay correct. */
const versions = new WeakMap<object, number>();

export const canvasVersion = (c: object) => versions.get(c) || 0;

/** Call after mutating a canvas in place (e.g. during brush strokes). */
export const touchCanvas = (c: object) => {
  versions.set(c, canvasVersion(c) + 1);
};
