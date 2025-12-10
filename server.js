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

// DEBUG root route
app.get("/", (req, res) => {
  res.send("AlertAID backend is running.");
});

// --- REGISTER ROUTE ---
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

// --- RUN ALERTS ROUTE ---
app.get("/run-alerts", async (req, res) => {
  console.log("Running automated alert scan...");
  try {
    let message = null;

    // --- WEATHER FETCH ---
    const weatherURL =
      "https://api.open-meteo.com/v1/forecast?latitude=10.387&longitude=123.6502&hourly=rain";
    const weatherRes = await fetch(weatherURL);
    const weatherData = await weatherRes.json();
    const rain = weatherData.hourly?.rain?.[0] ?? 0;
    console.log("Rain level:", rain);

    if (rain > 20) {
      message = "Severe rainfall detected in Toledo City. Stay alert for possible flooding.";
    }

    // --- EARTHQUAKE FETCH (USGS) ---
    console.log("Fetching USGS earthquake data...");
    const usgsUrl =
      "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson";
    const quakeRes = await fetch(usgsUrl);
    const quakeData = await quakeRes.json();

    // Filter earthquakes for the Philippines and mag >= 4.5
    const phEarthquakes = quakeData.features.filter(
      (f) =>
        f.properties.place.toLowerCase().includes("philippines") &&
        f.properties.mag >= 4.5
    );

    if (phEarthquakes.length > 0) {
      const quake = phEarthquakes[0];
      message = `Earthquake Alert: Magnitude ${quake.properties.mag} near ${quake.properties.place}.`;
      console.log("Earthquake detected:", message);
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

   // --- TEST ALERT ROUTE ---
app.get("/send-test-alert", async (req, res) => {
  if (!tokens.length) {
    console.log("No tokens registered for test alert.");
    return res.send("No tokens registered.");
  }

  const message = "This is a test AlertAID notification. Everything is working!";
  console.log("Sending test alert to", tokens.length, "devices...");

  await Promise.all(
    tokens.map(async (token) => {
      try {
        const response = await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: token,
            title: "AlertAID Test Notification",
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

  console.log("Test alerts sent.");
  res.send("Test alerts sent to all registered devices.");
});
// RENDER PORT
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("AlertAID backend running on port", PORT));
