import express from "express";
import fetch from "node-fetch";
import fs from "fs";
import https from "https";

const app = express();
app.use(express.json());

// Disable SSL verification only for PHIVOLCS
const insecureAgent = new https.Agent({
  rejectUnauthorized: false,
});

// Load tokens
let tokens = [];
if (fs.existsSync("tokens.json")) {
  tokens = JSON.parse(fs.readFileSync("tokens.json"));
}

// Save tokens to file
function saveTokens() {
  fs.writeFileSync("tokens.json", JSON.stringify(tokens, null, 2));
}

// DEBUG root route
app.get("/", (req, res) => {
  res.send("AlertAID backend is running.");
});

// Register push token
app.post("/register", (req, res) => {
  const { token } = req.body;

  if (!token) return res.status(400).send("Missing token");

  if (!tokens.includes(token)) {
    tokens.push(token);
    saveTokens();
    console.log("New token saved:", token);
  } else {
    console.log("Token already exists:", token);
  }

  res.send("Token saved");
});

// Weather + Earthquake alerts
app.get("/run-alerts", async (req, res) => {
  console.log("Running automated alert scan...");

  try {
    // --- WEATHER ---
    const weatherURL =
      "https://api.open-meteo.com/v1/forecast?latitude=10.387&longitude=123.6502&hourly=temperature_2m,rain,wind_speed_10m";

    const weatherRes = await fetch(weatherURL);
    const weatherData = await weatherRes.json();

    const rain = weatherData.hourly?.rain?.[0] ?? 0;
    console.log("Rain level:", rain);

    let message = null;

    if (rain > 20) {
      message =
        "Severe rainfall detected in Toledo City. Stay alert for possible flooding.";
    }

    // --- EARTHQUAKE ---
    console.log("Fetching PHIVOLCS earthquake data...");

    const quakeRes = await fetch(
      "https://earthquake.phivolcs.dost.gov.ph/php/latest/earthquake_events.json",
      { agent: insecureAgent }    // SSL bypass fix
    );

    const quakeData = await quakeRes.json();

    console.log("PHIVOLCS response:", quakeData);

    const latestQuake =
      quakeData?.latest_earthquake || quakeData[0];

    if (latestQuake && latestQuake.magnitude >= 4.5) {
      message = `Earthquake Alert: Magnitude ${latestQuake.magnitude} near ${latestQuake.location}.`;
    }

    if (!message) {
      console.log("No alerts triggered.");
      return res.send("No alerts triggered.");
    }

    // --- SEND PUSH NOTIFICATIONS ---
    console.log("Sending alerts to", tokens.length, "devices...");

    for (const token of tokens) {
      console.log("Sending to:", token);

      await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: token,
          title: "AlertAID Emergency Update",
          body: message,
        }),
      });
    }

    console.log("Alerts sent.");
    res.send("Alerts sent.");

  } catch (err) {
    console.error("Error in run-alerts:", err);
    res.status(500).send("Error processing alerts");
  }
});

// Render Port
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("AlertAID backend running on port", PORT));
