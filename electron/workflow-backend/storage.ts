import fs from "node:fs";
import path from "node:path";

export class WorkflowJsonStore {
  readonly root: string;

  constructor(root: string) {
    this.root = root;
    fs.mkdirSync(root, { recursive: true });
  }

  path(name: string) {
    return path.join(this.root, name + ".json");
  }

  read<T>(name: string, fallback: T): T {
    try {
      const value = JSON.parse(fs.readFileSync(this.path(name), "utf8"));
      return value as T;
    } catch {
      return fallback;
    }
  }

  write<T>(name: string, value: T) {
    fs.mkdirSync(this.root, { recursive: true });
    const target = this.path(name);
    const temporary = target + ".tmp";
    fs.writeFileSync(temporary, JSON.stringify(value, null, 2));
    fs.renameSync(temporary, target);
    return value;
  }

  update<T>(name: string, fallback: T, updater: (value: T) => T) {
    return this.write(name, updater(this.read(name, fallback)));
  }
}
