import fs from "node:fs";
import path from "node:path";

const SCHEMA_VERSION = 2;

export class MemoryStore {
  constructor(dataDir, logger = console) {
    this.dataDir = dataDir;
    this.file = path.join(dataDir, "memory.json");
    this.logger = logger;
    fs.mkdirSync(dataDir, { recursive: true });
    if (!fs.existsSync(this.file)) {
      this.writeSync(this.empty());
    }
  }

  empty() {
    return {
      schemaVersion: SCHEMA_VERSION,
      meetings: [],
      decisions: [],
      promises: [],
      drift: [],
      openQuestions: [],
      workflows: []
    };
  }

  load() {
    try {
      const raw = fs.readFileSync(this.file, "utf8");
      return normalizeData(JSON.parse(raw));
    } catch (error) {
      this.logger.warn?.("memory store read failed; returning empty store", { error: error.message });
      return this.empty();
    }
  }

  getAll() {
    return this.load();
  }

  replace(data) {
    const normalized = normalizeData(data);
    this.writeSync(normalized);
    return normalized;
  }

  update(mutator) {
    const current = this.load();
    const next = normalizeData(mutator(structuredClone(current)) || current);
    this.writeSync(next);
    return next;
  }

  appendWorkflow(workflow) {
    const data = this.load();
    data.workflows = [workflow, ...(data.workflows || []).filter((item) => item.id !== workflow.id)].slice(0, 100);
    this.writeSync(data);
    return workflow;
  }

  updateWorkflow(id, patch) {
    const data = this.load();
    const index = data.workflows.findIndex((item) => item.id === id);
    if (index === -1) return null;
    data.workflows[index] = { ...data.workflows[index], ...patch, updatedAt: new Date().toISOString() };
    data.workflows = data.workflows.slice(0, 100);
    this.writeSync(data);
    return data.workflows[index];
  }

  writeSync(data) {
    const temp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(normalizeData(data), null, 2));
    fs.renameSync(temp, this.file);
  }

}

function normalizeData(input) {
  const base = {
    schemaVersion: SCHEMA_VERSION,
    meetings: [],
    decisions: [],
    promises: [],
    drift: [],
    openQuestions: [],
    workflows: []
  };

  const value = input && typeof input === "object" ? input : {};
  return {
    ...base,
    ...value,
    schemaVersion: SCHEMA_VERSION,
    meetings: Array.isArray(value.meetings) ? value.meetings : [],
    decisions: Array.isArray(value.decisions) ? value.decisions : [],
    promises: Array.isArray(value.promises) ? value.promises : [],
    drift: Array.isArray(value.drift) ? value.drift : [],
    openQuestions: Array.isArray(value.openQuestions) ? value.openQuestions : [],
    workflows: Array.isArray(value.workflows) ? value.workflows : []
  };
}
