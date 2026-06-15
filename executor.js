import fs from "fs";
import path from "path";
import axios from "axios";
import EventEmitter from "events";
import eventBus from "./eventBus.js";

const DEFAULT_DATA_DIR = process.env.BOT_DATA_DIR || "bot-data";

export class Executor extends EventEmitter {
  constructor({ dataDir = DEFAULT_DATA_DIR } = {}) {
    super();
    this.dataDir = dataDir;
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }

  async executeActions(actions = [], page = null, { rules = {}, apiInspector = null, trainer = null } = {}) {
    for (let i = 0; i < actions.length; i += 1) {
      const action = actions[i];
      this.emit("action:start", { index: i, action });

      try {
        let result = null;

        switch ((action.type || action.action || "").toLowerCase()) {
          case "navigate":
          case "goto":
            if (!page) throw new Error("No page provided for navigate action");
            result = await page.goto(action.url, { waitUntil: action.waitUntil || "networkidle2", timeout: action.timeout || 30000 });
            break;
          case "click":
          case "humanclick":
            if (!page) throw new Error("No page provided for click action");
            // prefer page.$eval or mouse interactions; let caller provide humanClick/clickSelector
            result = await page.click(action.selector, { delay: action.delay || 0 });
            break;
          case "http":
          case "httprequest":
            result = await axios({ method: action.method || "GET", url: action.url, data: action.body || null, headers: action.headers || {}, timeout: action.timeout || 15000 });
            break;
          case "inspectapi":
            if (!apiInspector) throw new Error("No apiInspector available for inspectApi action");
            result = await apiInspector.inspectApi(action.url, action);
            break;
          case "evaluate":
            if (!page) throw new Error("No page provided for evaluate action");
            if (!action.script && !action.expression) throw new Error("evaluate action needs script/expression");
            result = await page.evaluate(new Function(action.script || action.expression));
            break;
          case "inspect":
          case "inspectelement":
            if (!page) throw new Error("No page provided for inspect action");
            result = await page.evaluate((sel) => {
              const el = document.querySelector(sel || "html");
              if (!el) return null;
              return { outerHTML: el.outerHTML.slice(0, 3000), text: el.innerText?.slice(0, 1000) || "" };
            }, action.selector);
            break;
          default:
            // unknown action type: echo back
            result = { message: `unknown action type: ${action.type || action.action}` };
        }

        const payload = { index: i, action, result, timestamp: new Date().toISOString() };
        this.emit("action:done", payload);
        try { eventBus.emit("action:done", payload); } catch (e) {}

        // record training signal if present
        if (trainer && action.outcome) {
          if (action.outcome === "win") trainer.recordWin({ action, result });
          if (action.outcome === "loss") trainer.recordLoss({ action, result });
        }

      } catch (error) {
        const payload = { index: i, action, error: error.message, timestamp: new Date().toISOString() };
        this.emit("action:error", payload);
        try { eventBus.emit("action:error", payload); } catch (e) {}
      }
    }

    this.emit("actions:complete", { count: actions.length });
    try { eventBus.emit("actions:complete", { count: actions.length }); } catch (e) {}
  }

  saveExecutionLog(name, data) {
    const p = path.join(this.dataDir, name);
    fs.writeFileSync(p, JSON.stringify(data, null, 2), "utf8");
    return p;
  }
}

export default Executor;
