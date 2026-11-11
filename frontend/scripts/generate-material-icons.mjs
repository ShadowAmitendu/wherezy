import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(__dirname, "..");
const iconsDir = path.join(frontendRoot, "node_modules", "@mui", "icons-material");
const outPath = path.join(
  frontendRoot,
  "src",
  "components",
  "shared",
  "materialIconData.json"
);

const VARIANT_SUFFIX_RE = /(Outlined|Rounded|Sharp|TwoTone)\.js$/;
const FRAGMENT_SYMBOL = Symbol("Fragment");

function jsx(type, props) {
  if (type === FRAGMENT_SYMBOL) {
    return props?.children ?? [];
  }
  const attrs = {};
  let children;
  for (const [k, v] of Object.entries(props || {})) {
    if (k === "key") continue;
    if (k === "children") {
      children = v;
      continue;
    }
    if (v !== undefined && v !== null) {
      attrs[k] = v;
    }
  }
  if (children !== undefined) {
    return [type, attrs, flattenNodes(children)];
  }
  return [type, attrs];
}

function flattenNodes(node) {
  if (!node) return [];
  if (Array.isArray(node)) {
    // Check if this is an element tuple: [tagName, attrs, children?]
    if (typeof node[0] === "string") {
      return [node];
    }
    const out = [];
    for (const item of node) {
      out.push(...flattenNodes(item));
    }
    return out;
  }
  return [];
}

function interopRequireDefault(mod) {
  return mod && mod.__esModule ? mod : { default: mod };
}
interopRequireDefault.default = interopRequireDefault;

function interopRequireWildcard(mod) {
  if (mod && mod.__esModule) return mod;
  return { default: mod, ...mod };
}
interopRequireWildcard.default = interopRequireWildcard;

const reactStub = {
  __esModule: true,
  Fragment: FRAGMENT_SYMBOL,
  createElement(type, props, ...children) {
    const mergedProps =
      children.length > 0
        ? { ...(props || {}), children: children.length === 1 ? children[0] : children }
        : props || {};
    return jsx(type, mergedProps);
  },
};

function extractIconShape(filePath) {
  const code = fs.readFileSync(filePath, "utf8");
  const mod = { exports: {} };
  let captured = null;

  const createSvgIconFn = (node) => {
    captured = node;
    return node;
  };

  const customRequire = (id) => {
    if (id === "react") return reactStub;
    if (id === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: FRAGMENT_SYMBOL };
    if (id === "@babel/runtime/helpers/interopRequireDefault") {
      return interopRequireDefault;
    }
    if (id === "@babel/runtime/helpers/interopRequireWildcard") {
      return interopRequireWildcard;
    }
    if (id === "./utils/createSvgIcon") {
      return { __esModule: true, default: createSvgIconFn };
    }
    throw new Error(`Unexpected require inside icon module: ${id}`);
  };

  vm.runInNewContext(
    `(function(exports, require, module) { ${code}\n})`,
    { exports: mod.exports, require: customRequire, module: mod }
  )(mod.exports, customRequire, mod);

  const elements = flattenNodes(captured);
  if (elements.length === 0) {
    throw new Error(`No SVG elements captured in ${path.basename(filePath)}`);
  }

  // Compact representation for the common single-path icon without extra attributes
  if (elements.length === 1 && elements[0].length === 2) {
    const [tag, attrs] = elements[0];
    const keys = Object.keys(attrs);
    if (tag === "path" && keys.length === 1 && keys[0] === "d") {
      return attrs.d;
    }
  }

  return elements;
}

function main() {
  if (!fs.existsSync(iconsDir)) {
    throw new Error(`@mui/icons-material directory not found at ${iconsDir}`);
  }

  const files = fs
    .readdirSync(iconsDir)
    .filter(
      (f) =>
        f.endsWith(".js") &&
        f !== "index.js" &&
        !VARIANT_SUFFIX_RE.test(f)
    )
    .sort((a, b) => a.localeCompare(b));

  const catalog = {};
  const failures = [];

  for (const file of files) {
    const iconName = file.slice(0, -3);
    try {
      catalog[iconName] = extractIconShape(path.join(iconsDir, file));
    } catch (err) {
      failures.push({ file, message: err instanceof Error ? err.message : String(err) });
    }
  }

  if (failures.length > 0) {
    console.error("Failed to extract some Material Icons:", failures.slice(0, 10));
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(catalog));
  const stats = fs.statSync(outPath);
  console.log(
    `Generated ${Object.keys(catalog).length} Material Icons -> ${path.relative(
      frontendRoot,
      outPath
    )} (${stats.size} bytes)`
  );
}

main();
