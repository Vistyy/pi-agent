import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

export interface CalmPreferences {
  load(): Promise<boolean>;
  save(on: boolean): Promise<void>;
}

/** A scalar file avoids read/modify/write races with unrelated Pi settings. */
export function calmPreferences(path = join(getAgentDir(), "calm-default")): CalmPreferences {
  return {
    async load() {
      let text: string;

      try {
        text = await readFile(path, "utf8");
      } catch (error: unknown) {
        if (error instanceof Error && "code" in error && error.code === "ENOENT") return true;
        throw error;
      }

      if (text.trim() === "on") return true;
      if (text.trim() === "off") return false;
      throw new Error(`Invalid Calm default in ${path}. Expected on or off.`);
    },
    async save(on) {
      await mkdir(dirname(path), { recursive: true });
      const temporary = `${path}.${randomUUID()}.tmp`;
      const file = await open(temporary, "wx", 0o600);

      try {
        try {
          await file.writeFile(on ? "on\n" : "off\n");
        } finally {
          await file.close();
        }
        await rename(temporary, path);
      } finally {
        await rm(temporary, { force: true });
      }
    },
  };
}
