#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";

const usage = `Usage:
  orientation-cache.mjs status --repo <path> --library <name> --version <version> [--upstream-revision <revision>] [--max-age-days <days>]
  orientation-cache.mjs changed-files --repo <path> --since <revision>
  orientation-cache.mjs write --repo <path> --library <name> --metadata <metadata.json> --content <orientation.md>
`;

const fail = (message) => {
  process.stderr.write(`${JSON.stringify({ error: message })}\n`);
  process.exitCode = 1;
};

const output = (value) => process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);

const parseOptions = (args) => {
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (!flag?.startsWith("--") || value === undefined || value.startsWith("--")) {
      throw new Error(`Expected --name value pairs, received ${flag ?? "end of input"}`);
    }
    const name = flag.slice(2);
    if (options[name] !== undefined) {
      throw new Error(`Duplicate option --${name}`);
    }
    options[name] = value;
  }
  return options;
};

const requireOption = (options, name) => {
  const value = options[name];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Missing required option --${name}`);
  }
  return value;
};

const rejectUnknownOptions = (options, allowed) => {
  for (const name of Object.keys(options)) {
    if (!allowed.has(name)) {
      throw new Error(`Unknown option --${name}`);
    }
  }
};

const git = (repo, args) =>
  execFileSync("git", ["-C", repo, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trimEnd();

const repositoryContext = (repoInput) => {
  const repo = realpathSync(resolve(repoInput));
  const commonDirectoryOutput = git(repo, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  const commonDirectory = realpathSync(
    isAbsolute(commonDirectoryOutput)
      ? commonDirectoryOutput
      : resolve(repo, commonDirectoryOutput),
  );
  const revision = git(repo, ["rev-parse", "HEAD"]);
  const worktreeFiles = git(repo, [
    "status",
    "--porcelain=v1",
    "--untracked-files=all",
  ])
    .split("\n")
    .filter(Boolean)
    .map((line) => line.slice(3).split(" -> ").at(-1));
  const repositoryKey = createHash("sha256").update(commonDirectory).digest("hex").slice(0, 24);
  return { repo, commonDirectory, revision, repositoryKey, worktreeFiles };
};

const libraryDirectoryName = (library) => {
  if (
    !/^(?:@?[A-Za-z0-9][A-Za-z0-9._-]*)(?:\/[A-Za-z0-9][A-Za-z0-9._-]*)?$/.test(library)
  ) {
    throw new Error(`Invalid library name: ${library}`);
  }
  return library.replace(/^@/, "at-").replace("/", "--");
};

const cacheRoot = () =>
  join(process.env.XDG_CACHE_HOME ? resolve(process.env.XDG_CACHE_HOME) : join(homedir(), ".cache"), "pi", "library-orientation");

const cachePaths = (context, library) => {
  const directory = join(cacheRoot(), context.repositoryKey, libraryDirectoryName(library));
  return {
    directory,
    metadata: join(directory, "metadata.json"),
    content: join(directory, "orientation.md"),
  };
};

const sha256 = (content) => createHash("sha256").update(content).digest("hex");

const isNonEmptyString = (value) => typeof value === "string" && value.length > 0;

const validateMetadata = (value, expectedLibrary, requireGeneratedFields) => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Metadata must be a JSON object");
  }
  if (value.schema !== 1) {
    throw new Error("Metadata schema must be 1");
  }
  if (value.library !== expectedLibrary) {
    throw new Error(`Metadata library must be ${expectedLibrary}`);
  }
  for (const field of ["installedVersion", "upstreamRevision"]) {
    if (!isNonEmptyString(value[field])) {
      throw new Error(`Metadata ${field} must be a non-empty string`);
    }
  }
  if (
    !Array.isArray(value.sources) ||
    value.sources.length === 0 ||
    !value.sources.every(isNonEmptyString)
  ) {
    throw new Error("Metadata sources must be a non-empty array of strings");
  }
  if (value.upstreamProbe !== undefined) {
    const probe = value.upstreamProbe;
    if (
      probe === null ||
      typeof probe !== "object" ||
      Array.isArray(probe) ||
      probe.kind !== "git-ls-remote" ||
      !isNonEmptyString(probe.url) ||
      !isNonEmptyString(probe.ref)
    ) {
      throw new Error("Metadata upstreamProbe must define git-ls-remote url and ref");
    }
    const url = new URL(probe.url);
    if (url.protocol !== "https:") {
      throw new Error("Metadata upstreamProbe url must use https");
    }
    if (!/^(?!-)[A-Za-z0-9._/-]+$/.test(probe.ref)) {
      throw new Error("Metadata upstreamProbe ref is invalid");
    }
  }
  if (requireGeneratedFields) {
    for (const field of [
      "repositoryKey",
      "repositoryCommonDirectory",
      "repositoryRevision",
      "verifiedAt",
      "contentSha256",
    ]) {
      if (!isNonEmptyString(value[field])) {
        throw new Error(`Cached metadata ${field} must be a non-empty string`);
      }
    }
    if (Number.isNaN(Date.parse(value.verifiedAt))) {
      throw new Error("Cached metadata verifiedAt must be an ISO timestamp");
    }
  }
  return value;
};

const readCache = (paths, library) => {
  const metadataExists = existsSync(paths.metadata);
  const contentExists = existsSync(paths.content);
  if (!metadataExists && !contentExists) {
    return { state: "missing" };
  }
  if (!metadataExists || !contentExists) {
    return { state: "invalid", reason: "cache_entry_incomplete" };
  }
  try {
    const metadata = validateMetadata(
      JSON.parse(readFileSync(paths.metadata, "utf8")),
      library,
      true,
    );
    const content = readFileSync(paths.content, "utf8");
    if (sha256(content) !== metadata.contentSha256) {
      return { state: "invalid", reason: "content_integrity_failed" };
    }
    return { state: "valid", metadata, content };
  } catch (error) {
    return {
      state: "invalid",
      reason: error instanceof Error ? error.message : String(error),
    };
  }
};

const writeAtomically = (path, content) => {
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporaryPath, content, { encoding: "utf8", mode: 0o600 });
    renameSync(temporaryPath, path);
  } finally {
    rmSync(temporaryPath, { force: true });
  }
};

const status = (options) => {
  rejectUnknownOptions(
    options,
    new Set(["repo", "library", "version", "upstream-revision", "max-age-days"]),
  );
  const context = repositoryContext(requireOption(options, "repo"));
  const library = requireOption(options, "library");
  const version = requireOption(options, "version");
  let currentUpstreamRevision = options["upstream-revision"];
  const maxAgeDays = Number(options["max-age-days"] ?? "90");
  if (!Number.isFinite(maxAgeDays) || maxAgeDays <= 0) {
    throw new Error("--max-age-days must be a positive number");
  }
  const paths = cachePaths(context, library);
  const cache = readCache(paths, library);

  if (cache.state === "missing" || cache.state === "invalid") {
    output({
      state: cache.state,
      reasons: [cache.state === "missing" ? "cache_missing" : cache.reason],
      cachePath: paths.directory,
      cacheContentPath: paths.content,
      currentProjectRevision: context.revision,
    });
    return;
  }

  const reasons = [];
  let state = "fresh";
  if (cache.metadata.installedVersion !== version) {
    state = "full_refresh";
    reasons.push("installed_version_changed");
  }
  if (
    currentUpstreamRevision !== undefined &&
    cache.metadata.upstreamRevision !== currentUpstreamRevision
  ) {
    if (state === "fresh") {
      state = "partial_refresh";
    }
    reasons.push("upstream_revision_changed");
  }
  const ageDays = (Date.now() - Date.parse(cache.metadata.verifiedAt)) / 86_400_000;
  if (ageDays > maxAgeDays) {
    if (state === "fresh") {
      state = "partial_refresh";
    }
    reasons.push("verification_expired");
  }

  output({
    state,
    reasons,
    cachePath: paths.directory,
    cacheContentPath: paths.content,
    cachedProjectRevision: cache.metadata.repositoryRevision,
    currentProjectRevision: context.revision,
    cachedInstalledVersion: cache.metadata.installedVersion,
    currentInstalledVersion: version,
    cachedUpstreamRevision: cache.metadata.upstreamRevision,
    currentUpstreamRevision,
    upstreamProbe: cache.metadata.upstreamProbe,
    cachedSources: cache.metadata.sources,
    verifiedAt: cache.metadata.verifiedAt,
    maxAgeDays,
  });
};

const changedFiles = (options) => {
  rejectUnknownOptions(options, new Set(["repo", "since"]));
  const context = repositoryContext(requireOption(options, "repo"));
  const since = requireOption(options, "since");
  git(context.repo, ["rev-parse", "--verify", `${since}^{commit}`]);
  const changed = execFileSync(
    "git",
    [
      "-C",
      context.repo,
      "diff",
      "--name-only",
      "--diff-filter=ACDMRTUXB",
      "-z",
      `${since}..${context.revision}`,
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  const committedFiles = changed.length === 0 ? [] : changed.split("\0").filter(Boolean);
  output({
    since,
    currentProjectRevision: context.revision,
    files: [...new Set([...committedFiles, ...context.worktreeFiles])].sort(),
    includesWorktree: context.worktreeFiles.length > 0,
  });
};

const writeCache = (options) => {
  rejectUnknownOptions(options, new Set(["repo", "library", "metadata", "content"]));
  const context = repositoryContext(requireOption(options, "repo"));
  const library = requireOption(options, "library");
  const metadataInputPath = resolve(requireOption(options, "metadata"));
  const contentInputPath = resolve(requireOption(options, "content"));
  const suppliedMetadata = validateMetadata(
    JSON.parse(readFileSync(metadataInputPath, "utf8")),
    library,
    false,
  );
  const content = readFileSync(contentInputPath, "utf8");
  if (content.trim().length === 0) {
    throw new Error("Orientation content must not be empty");
  }
  const metadata = {
    ...suppliedMetadata,
    repositoryKey: context.repositoryKey,
    repositoryCommonDirectory: context.commonDirectory,
    repositoryRevision: context.revision,
    verifiedAt: new Date().toISOString(),
    contentSha256: sha256(content),
  };
  const paths = cachePaths(context, library);
  writeAtomically(paths.content, content);
  writeAtomically(paths.metadata, `${JSON.stringify(metadata, null, 2)}\n`);
  output({
    state: "written",
    cachePath: paths.directory,
    repositoryRevision: context.revision,
    contentSha256: metadata.contentSha256,
  });
};

const main = () => {
  const [command, ...args] = process.argv.slice(2);
  if (command === undefined || command === "--help" || command === "help") {
    process.stdout.write(usage);
    return;
  }
  const options = parseOptions(args);
  if (command === "status") {
    status(options);
    return;
  }
  if (command === "changed-files") {
    changedFiles(options);
    return;
  }
  if (command === "write") {
    writeCache(options);
    return;
  }
  throw new Error(`Unknown command: ${command}`);
};

try {
  main();
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
