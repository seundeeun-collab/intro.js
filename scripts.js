async function fetchStatus() {
  try {
    const response = await fetch("/status");
    const status = await response.json();

    document.getElementById("status-text").textContent = status.status;
    document.getElementById("status-time").textContent = status.lastUpdated || "n/a";
    document.getElementById("record-count").textContent = status.summary?.recordCount ?? "0";
    document.getElementById("mean-odds").textContent = status.summary?.meanOdds?.toFixed(2) ?? "n/a";
  } catch (error) {
    document.getElementById("status-text").textContent = "error";
    document.getElementById("status-time").textContent = "n/a";
    document.getElementById("record-count").textContent = "n/a";
    document.getElementById("mean-odds").textContent = "n/a";
  }
}

fetchStatus();
setInterval(fetchStatus, 15000);
