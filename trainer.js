import fs from "fs";
import path from "path";

const DEFAULT_PATH = path.join(process.cwd(), process.env.BOT_DATA_DIR || "bot-data", "training.json");

export class Trainer {
  constructor(storePath = DEFAULT_PATH) {
    this.storePath = storePath;
    this.store = { wins: [], losses: [], stats: {} };
    this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this.storePath)) {
        this.store = JSON.parse(fs.readFileSync(this.storePath, "utf8"));
      }
    } catch (e) {
      console.warn("Trainer load failed:", e.message);
    }
  }

  _save() {
    try {
      fs.mkdirSync(path.dirname(this.storePath), { recursive: true });
      fs.writeFileSync(this.storePath, JSON.stringify(this.store, null, 2), "utf8");
    } catch (e) {
      console.warn("Trainer save failed:", e.message);
    }
  }

  recordWin(payload = {}) {
    const entry = { timestamp: new Date().toISOString(), payload };
    this.store.wins.push(entry);
    this._recompute();
    this._save();
  }

  recordLoss(payload = {}) {
    const entry = { timestamp: new Date().toISOString(), payload };
    this.store.losses.push(entry);
    this._recompute();
    this._save();
  }

  _recompute() {
    const w = this.store.wins.length;
    const l = this.store.losses.length;
    const total = w + l || 1;
    this.store.stats.winRate = Math.round((w / total) * 10000) / 100;
    this.store.stats.total = w + l;
    this.store.stats.wins = w;
    this.store.stats.losses = l;
  }

  metrics() {
    return this.store.stats;
  }
}

export default Trainer;
