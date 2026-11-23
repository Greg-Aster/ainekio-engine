import { readFile, readdir } from "node:fs/promises";
import { dirname, join, normalize, relative, sep } from "node:path";

const repoRoot = new URL("..", import.meta.url).pathname;
const forbiddenFrameworkPackages = [
	"astro",
	"svelte",
	"three",
	"@threlte/",
	"@dimforge/rapier",
	"peerjs",
];
const browserGlobalPattern =
	/\b(document|window|localStorage|sessionStorage|indexedDB|requestAnimationFrame|cancelAnimationFrame|navigator|HTMLElement|HTMLCanvasElement|Worker)\b/g;

const files = await collectFiles(join(repoRoot, "src"));
const violations = [];

for (const file of files) {
	const source = await readFile(file, "utf8");
	const rel = relative(repoRoot, file).replaceAll(sep, "/");
	const imports = extractImportSpecifiers(source).map((specifier) =>
		resolveSpecifier(rel, specifier),
	);

	if (rel === "src/index.ts") {
		for (const match of importsPath(imports, "src/adapters")) {
			violations.push(
				`${rel}: root engine API must not re-export adapters (${match.specifier})`,
			);
		}
	}

	if (!pathStartsWith(rel, "src/adapters")) {
		for (const specifier of importsPackage(
			imports,
			forbiddenFrameworkPackages,
		)) {
			violations.push(
				`${rel}: framework-neutral engine layer must not import "${specifier}"`,
			);
		}

		for (const match of importsPath(imports, "src/adapters")) {
			violations.push(
				`${rel}: framework-neutral engine layer must not import adapters (${match.specifier})`,
			);
		}
	}

	if (!pathStartsWith(rel, "src/adapters/browser")) {
		const globals = [
			...new Set([...source.matchAll(browserGlobalPattern)].map((m) => m[1])),
		].sort();
		if (globals.length > 0) {
			violations.push(
				`${rel}: browser globals must stay inside src/adapters/browser (${globals.join(", ")})`,
			);
		}
	}
}

if (violations.length > 0) {
	console.error("Engine boundary audit failed:");
	for (const violation of violations) {
		console.error(`- ${violation}`);
	}
	process.exitCode = 1;
} else {
	console.log(`Engine boundary audit passed for ${files.length} source files.`);
}

async function collectFiles(dir) {
	const entries = await readdir(dir, { withFileTypes: true });
	const out = [];
	for (const entry of entries) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			out.push(...(await collectFiles(full)));
		} else if (entry.name.endsWith(".ts")) {
			out.push(full);
		}
	}
	return out;
}

function extractImportSpecifiers(source) {
	const specifiers = new Set();
	const patterns = [
		/\bfrom\s*["']([^"']+)["']/g,
		/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
		/^\s*import\s*["']([^"']+)["']/gm,
	];
	for (const pattern of patterns) {
		for (const match of source.matchAll(pattern)) {
			specifiers.add(match[1]);
		}
	}
	return [...specifiers];
}

function resolveSpecifier(relFile, specifier) {
	if (!specifier.startsWith(".")) {
		return { kind: "package", specifier };
	}
	return {
		kind: "relative",
		specifier,
		resolved: normalize(join(dirname(relFile), specifier))
			.replaceAll(sep, "/")
			.replace(/\.(ts|js|mjs|mts)$/, ""),
	};
}

function pathStartsWith(path, prefix) {
	return path === prefix || path.startsWith(`${prefix}/`);
}

function importsPath(imports, prefix) {
	return imports
		.filter((entry) => entry.kind === "relative")
		.filter((entry) => pathStartsWith(entry.resolved, prefix));
}

function importsPackage(imports, prefixes) {
	return imports
		.filter((entry) => entry.kind === "package")
		.map((entry) => entry.specifier)
		.filter((specifier) =>
			prefixes.some(
				(prefix) => specifier === prefix || specifier.startsWith(`${prefix}/`),
			),
		);
}
