import axios from "axios";
import fs from "fs";
import path from "path";

const DATA_DIR = process.env.BOT_DATA_DIR || "bot-data";

export async function inspectApi(url, options = {}) {
  const start = Date.now();
  try {
    const resp = await axios({ method: options.method || "GET", url, headers: options.headers || {}, timeout: options.timeout || 10000, data: options.body || null });
    const elapsed = Date.now() - start;
    const record = {
      url,
      status: resp.status,
      statusText: resp.statusText,
      elapsed,
      size: resp.headers["content-length"] || JSON.stringify(resp.data || "").length,
      timestamp: new Date().toISOString()
    };

    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(path.join(DATA_DIR, `api-inspect-${Date.now()}.json`), JSON.stringify({ request: { url }, record, body: resp.data }, null, 2), "utf8");
    } catch (e) {
      // ignore write errors
    }

    return record;
  } catch (error) {
    const elapsed = Date.now() - start;
    const record = { url, error: error.message, elapsed, timestamp: new Date().toISOString() };
    return record;
  }
}

export default { inspectApi };
