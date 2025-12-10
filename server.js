// Utility function to retry fetch
async function fetchWithRetry(url, options = {}, retries = 3, delayMs = 1000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, options);
      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        const text = await res.text();
        throw new Error(`Non-JSON response: ${text}`);
      }
      return await res.json();
    } catch (err) {
      console.warn(`Attempt ${attempt} failed: ${err.message}`);
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, delayMs));
      } else {
        throw err;
      }
    }
  }
}

app.get("/run-alerts", async (req, res) => {
  console.log("Running automated alert scan...");
  try {
    let message = null;

    // --- WEATHER ---
    const weatherURL =
      "https://api.open-meteo.com/v1/forecast?latitude=10.387&longitude=123.6502&hourly=temperature_2m,rain,wind_speed_10m";

    const weatherData = await fetch(weatherURL).then((r) => r.json());
    const rain = weatherData.hourly?.rain?.[0] ?? 0;
    console.log("Rain level:", rain);

    if (rain > 20) {
      message = "Severe rainfall detected in Toledo City. Stay alert for possible flooding.";
    }

    // --- EARTHQUAKE ---
    console.log("Fetching PHIVOLCS earthquake data...");
    let quakeData;
    try {
      quakeData = await fetchWithRetry(
        "https://earthquake.phivolcs.dost.gov.ph/php/latest/earthquake_events.json",
        { agent: insecureAgent },
        3,
        2000
      );
      console.log("PHIVOLCS JSON received:", quakeData);
    } catch (err) {
      console.error("Failed to fetch PHIVOLCS data after retries:", err.message);
    }

    const latestQuake = quakeData?.latest_earthquake || quakeData?.[0];

    if (latestQuake && latestQuake.magnitude >= 4.5) {
      message = `Earthquake Alert: Magnitude ${latestQuake.magnitude} near ${latestQuake.location}.`;
    }

    if (!message) {
      console.log("No alerts triggered.");
      return res.send("No alerts triggered.");
    }

    // --- SEND PUSH NOTIFICATIONS ---
    console.log("Sending alerts to", tokens.length, "devices...");

    await Promise.all(
      tokens.map(async (token) => {
        try {
          const response = await fetch("https://exp.host/--/api/v2/push/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              to: token,
              title: "AlertAID Emergency Update",
              body: message,
            }),
          });
          const result = await response.json();
          console.log("Sent to:", token, "Response:", result);
        } catch (err) {
          console.error("Failed to send to token:", token, err);
        }
      })
    );

    console.log("All alerts processed.");
    res.send("Alerts processed.");

  } catch (err) {
    console.error("Error in run-alerts:", err);
    res.status(500).send("Error processing alerts");
  }
});
