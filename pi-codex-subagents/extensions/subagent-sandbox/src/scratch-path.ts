import { lstatSync, realpathSync } from "node:fs";
import path from "node:path";

function isStrictlyInside(candidate: string, directory: string) {
  const relative = path.relative(directory, candidate);
  return (
    relative !== "" &&
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

export function isScratchMutationPath(
  requestedPath: string,
  scratchDir: string,
) {
  if (!path.isAbsolute(requestedPath)) return false;

  try {
    const lexicalScratch = path.resolve(scratchDir);
    const target = path.resolve(requestedPath);
    if (!isStrictlyInside(target, lexicalScratch)) return false;

    const canonicalScratch = realpathSync(lexicalScratch);
    const relativeParts = path.relative(lexicalScratch, target).split(path.sep);
    let current = lexicalScratch;

    for (const part of relativeParts) {
      current = path.join(current, part);
      try {
        const metadata = lstatSync(current);
        if (metadata.isSymbolicLink()) return false;
        const canonicalCurrent = realpathSync(current);
        if (
          canonicalCurrent !== canonicalScratch &&
          !isStrictlyInside(canonicalCurrent, canonicalScratch)
        ) {
          return false;
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") break;
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}
