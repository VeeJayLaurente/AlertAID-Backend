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
  const weatherURL = "https://api.open-meteo.com/v1/forecast?latitude=10.387&longitude=123.6502&current=temperature_2m,is_day,wind_speed_10m,wind_direction_10m,wind_gusts_10m,relative_humidity_2m,rain,showers,apparent_temperature,pressure_msl,precipitation";

const weatherRes = await fetch(weatherURL);
const weatherData = await weatherRes.json();
const current = weatherData.current;

const rain = current?.rain ?? 0;
const showers = current?.showers ?? 0;
const windSpeed = current?.wind_speed_10m ?? 0;
const temperature = current?.temperature_2m ?? 0;
const humidity = current?.relative_humidity_2m ?? 0;
const pressure = current?.pressure_msl ?? 0;

console.log("Rain level:", rain, showers, windSpeed, temperature, pressure);

// Determine temperature description
let tempDesc = "";
if (temperature >= 30) {
  tempDesc = "🌡️ It's hot outside.";
} else if (temperature >= 25) {
  tempDesc = "🌡️ The weather is warm.";
} else if (temperature >= 18) {
  tempDesc = "🌡️ The weather is mild.";
} else {
  tempDesc = "🌡️ It's cold outside.";
}

// Build user-friendly weather message
let messages = [];

// Warnings
if (rain + showers > 20) {
  messages.push("⚠️ Heavy rainfall expected. Please stay indoors and stay safe.");
}
if (windSpeed > 20) {
  messages.push("💨 High winds detected. Secure outdoor items and stay cautious.");
}

// Weather stats with temperature description
messages.push(
  `${tempDesc} Current stats: Temperature: ${temperature.toFixed(1)}°C, 💧 Rain: ${rain + showers}mm, 🌬️ Wind: ${windSpeed.toFixed(1)} km/h, 💦 Humidity: ${humidity}%`
);

message = messages.join("\n");

console.log("Weather message prepared:", message);




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
  const quakeTime = new Date(quake.properties.time).toLocaleString("en-PH", { timeZone: "Asia/Manila" });

  message = `🌎 Earthquake detected near ${quake.properties.place}
📏 Magnitude: ${quake.properties.mag}
⏰ Time: ${quakeTime}
⚠️ Safety tip: Stay away from buildings and heavy objects. Follow local safety instructions.`;

  console.log("Earthquake message prepared:", message);
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
