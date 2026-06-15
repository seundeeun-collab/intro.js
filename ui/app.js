const logEl = document.getElementById("log");
const form = document.getElementById("instrForm");
const instructionsEl = document.getElementById("instructions");

function appendEvent(name, data) {
  const d = document.createElement("div");
  d.className = "event";
  d.innerHTML = `<strong>${name}</strong>: <pre style="white-space:pre-wrap">${JSON.stringify(data, null, 2)}</pre>`;
  logEl.prepend(d);
}

const es = new EventSource("/events");
es.addEventListener("action:done", (e) => { appendEvent("done", JSON.parse(e.data)); });
es.addEventListener("action:error", (e) => { appendEvent("error", JSON.parse(e.data)); });
es.addEventListener("action:start", (e) => { appendEvent("start", JSON.parse(e.data)); });
es.addEventListener("actions:complete", (e) => { appendEvent("complete", JSON.parse(e.data)); });

form.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  let payload = instructionsEl.value;
  try { payload = JSON.parse(payload); } catch (e) { payload = instructionsEl.value; }

  const res = await fetch('/api/instructions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const json = await res.json();
  appendEvent('instructions:sent', json);
});

document.getElementById('runBot').addEventListener('click', async () => {
  document.getElementById('runStatus').textContent = 'Sending run request...';
  const payload = { actions: [] };
  const res = await fetch('/api/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const json = await res.json();
  appendEvent('run:response', json);
  document.getElementById('runStatus').textContent = json.ok ? `Run started; executed ${json.ran || 0} actions.` : `Run failed: ${json.error}`;
});
