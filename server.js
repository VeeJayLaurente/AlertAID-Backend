import express from "express";
import fetch from "node-fetch";
import fs from "fs";

const app = express();
app.use(express.json());

// Load tokens
let tokens = [];
if (fs.existsSync("tokens.json")) {
  tokens = JSON.parse(fs.readFileSync("tokens.json"));
}

// Save tokens to file
function saveTokens() {
  fs.writeFileSync("tokens.json", JSON.stringify(tokens, null, 2));
}

app.get("/", (req, res) => {
  res.send("AlertAID backend is running.");
});

// 1. Register push token from your Expo app
app.post("/register", (req, res) => {
  const { token } = req.body;

  if (!token) return res.status(400).send("Missing token");

  if (!tokens.includes(token)) {
    tokens.push(token);
    saveTokens();
  }

  res.send("Token saved");
});

// 2. Weather + Earthquake Check & Send Alerts
app.get("/run-alerts", async (req, res) => {
  try {
    // Weather API (Open-Meteo)
    const weatherURL =
      "https://api.open-meteo.com/v1/forecast?latitude=10.387&longitude=123.6502&hourly=temperature_2m,rain,wind_speed_10m";

    const weatherRes = await fetch(weatherURL);
    const weatherData = await weatherRes.json();

    const rain = weatherData.hourly?.rain?.[0] ?? 0;

    let message = null;

    if (rain > 20) {
      message = "Severe rainfall detected in Toledo City. Stay alert for flooding.";
    }

    // OPTIONAL: PHIVOLCS Earthquake Data
    const quakeRes = await fetch("https://earthquake.phivolcs.dost.gov.ph/php/latest/earthquake_events.json");
    const quakeData = await quakeRes.json();
    const latestQuake = quakeData?.latest_earthquake || quakeData[0];

    if (latestQuake && latestQuake.magnitude >= 4.5) {
      message = `Earthquake Alert: M${latestQuake.magnitude} reported near ${latestQuake.location}.`;
    }

    if (!message) {
      return res.send("No alerts triggered.");
    }

    // Send notification to all registered users
    for (const token of tokens) {
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

    res.send("Alerts sent.");

  } catch (err) {
    console.error(err);
    res.status(500).send("Error processing alerts");
  }
});

// Render requires a PORT
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("AlertAID backend running on port", PORT));
