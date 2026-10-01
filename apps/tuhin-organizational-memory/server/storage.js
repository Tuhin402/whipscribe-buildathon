import fs from "node:fs";
import path from "node:path";

export class MemoryStore {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.file = path.join(dataDir, "memory.json");
    fs.mkdirSync(dataDir, { recursive: true });

    if (!fs.existsSync(this.file)) {
      fs.writeFileSync(this.file, JSON.stringify(this.empty(), null, 2));
    }
  }

  empty() {
    return {
      meetings: [],
      decisions: [],
      promises: [],
      drift: [],
      openQuestions: []
    };
  }

  load() {
    try {
      const raw = fs.readFileSync(this.file, "utf8");
      return { ...this.empty(), ...JSON.parse(raw) };
    } catch {
      return this.empty();
    }
  }

  save(data) {
    fs.writeFileSync(this.file, JSON.stringify(data, null, 2));
  }

  getAll() {
    return this.load();
  }

  replace(data) {
    this.save(data);
    return data;
  }
}
