/**
 * The few runtime features TV mode uses that webOS 4 / Chromium 53 lacks.
 * esbuild lowers syntax; library methods have to be filled in here.
 */

if (!Promise.prototype.finally) {
  Object.defineProperty(Promise.prototype, 'finally', {
    configurable: true,
    writable: true,
    value(this: Promise<unknown>, onFinally?: () => void) {
      return this.then(
        (value) => Promise.resolve(onFinally && onFinally()).then(() => value),
        (reason) => Promise.resolve(onFinally && onFinally()).then(() => { throw reason; }),
      );
    },
  });
}

if (!Object.values) {
  Object.defineProperty(Object, 'values', {
    configurable: true,
    writable: true,
    value: (obj: Record<string, unknown>) => Object.keys(obj).map((key) => obj[key]),
  });
}

if (!Object.entries) {
  Object.defineProperty(Object, 'entries', {
    configurable: true,
    writable: true,
    value: (obj: Record<string, unknown>) => Object.keys(obj).map((key) => [key, obj[key]]),
  });
}

if (!String.prototype.padStart) {
  Object.defineProperty(String.prototype, 'padStart', {
    configurable: true,
    writable: true,
    value(this: string, length: number, fill = ' ') {
      let result = String(this);
      while (result.length < length) result = fill + result;
      return result.slice(result.length - Math.max(length, this.length));
    },
  });
}

export {};
