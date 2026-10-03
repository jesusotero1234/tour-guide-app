// Loads a TypeScript module of src/ for a node --test script, without a bundler: transpiles with the project's own TypeScript,
// resolves "@/..." and relative imports to other files of src/, and gives the module a fake browser (localStorage etc.) if asked.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('../../node_modules/typescript');
const SRC = path.resolve(__dirname, '../../src');
const nodeRequire = require;

function resolveFile(from, request) {
  const base = request.startsWith('@/') ? path.join(SRC, request.slice(2)) : path.resolve(path.dirname(from), request);
  for (const candidate of [base + '.ts', base + '.tsx', path.join(base, 'index.ts')]) if (fs.existsSync(candidate)) return candidate;
  return null;
}

/** loadTs('lib/routeOrder.ts', { globals: { localStorage } }) -> the module's exports. */
function loadTs(relative, { globals = {} } = {}) {
  const cache = new Map();
  const load = file => {
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} };
    cache.set(file, module);
    const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    const require = request => {
      const resolved = resolveFile(file, request);
      return resolved ? load(resolved) : nodeRequire(request);
    };
    // Same realm as the test (not a separate vm context) so that arrays and objects compare equal under deepStrictEqual.
    const names = Object.keys(globals);
    vm.compileFunction(output, ['module', 'exports', 'require', ...names], { filename: file })(module, module.exports, require, ...names.map(name => globals[name]));
    return module.exports;
  };
  return load(path.join(SRC, relative));
}

/** A localStorage with the real behaviour tests care about: string values, key enumeration with Object.keys, failures on demand. */
function fakeStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  const storage = { failures: false,
    getItem(key) { if (storage.failures) throw new Error('blocked'); return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { if (storage.failures) throw new Error('blocked'); data.set(key, String(value)); },
    removeItem(key) { if (storage.failures) throw new Error('blocked'); data.delete(key); },
    get length() { return data.size; }, key(i) { return [...data.keys()][i] ?? null; }, snapshot() { return Object.fromEntries(data); } };
  return new Proxy(storage, { ownKeys: () => [...data.keys()], getOwnPropertyDescriptor: (target, key) => (data.has(key) ? { enumerable: true, configurable: true, value: data.get(key) } : Reflect.getOwnPropertyDescriptor(target, key)) });
}

module.exports = { loadTs, fakeStorage };
