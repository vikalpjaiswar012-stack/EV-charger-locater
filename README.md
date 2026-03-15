⚡ EV Charging Hub
A premium, real-time Electric Vehicle charging station dashboard powered by the NREL Alternative Fuels Data Center API. Plan routes, discover chargers, and monitor live availability — all from one beautiful interface.

Image rendering blocked (strict mode enabled)
Alt text: HTML5
Image URL: https://img.shields.io/badge/H...

Image rendering blocked (strict mode enabled)
Alt text: CSS3
Image URL: https://img.shields.io/badge/C...

Image rendering blocked (strict mode enabled)
Alt text: JavaScript
Image URL: https://img.shields.io/badge/J...

Image rendering blocked (strict mode enabled)
Alt text: Leaflet
Image URL: https://img.shields.io/badge/L...


✨ Features
🗺️ Smart EV Route Planner

Enter Starting Point & Destination with live autocomplete suggestions

Draws the exact driving route on an interactive map using OSRM

Fetches real NREL charging stations along the route

Turf.js spatial filtering — only shows chargers within your chosen detour radius

Sorted charger list panel (nearest to farthest from start)

Click any charger in the list to pan the map to it

📍 Station Locator

Interactive Leaflet.js map with color-coded markers

🟢 Green = Fast charger available

🔵 Blue = Standard charger available

🔴 Red = All ports occupied

Click any marker for station details (name, address, connector count)

Search Area button to load chargers for any map region

⏱️ Live Wait Timers

Real-time availability dashboard with simulated heartbeat updates

Shows estimated wait times for busy stations

📊 Dashboard

Active charger count, network status, and live metrics

Premium glassmorphism UI design

🔋 Additional Features

Station reservation system

User reviews & ratings

RFID card management

Auto-charge configuration

Lead generation forms

🛠️ Tech Stack

Technology	Purpose

HTML / CSS / JS	Core frontend (no frameworks)

Leaflet.js	Interactive maps

Leaflet Routing Machine	OSRM driving route calculation

Turf.js	Spatial analysis & distance filtering

NREL API	Real EV charger data (US & Canada)

Nominatim	Address geocoding & autocomplete

Font Awesome	Icons

Google Fonts (Inter)	Typography

🚀 Getting Started

Quick Start

Simply open index.html in your browser:

bash

open index.html

Deploy to Netlify (Recommended)

For full API functionality with no CORS issues:

Push this repo to GitHub

Go to Netlify.com → Import the repo

Set Framework Preset to Other, Output Directory to ./

Click Deploy — done! 🎉

🔑 API Keys

API	Key	Notes

NREL	DEMO_KEY	Free, rate-limited. Get your own at developer.nrel.gov

OSRM	None needed	Uses the free public routing server

Nominatim	None needed	Free OpenStreetMap geocoding

To use your own NREL key, replace DEMO_KEY in script.js with your key.

📁 Project Structure

cosmic-crater/

├── index.html      # Main HTML structure

├── style.css       # All styles (glassmorphism, animations, responsive)

├── script.js       # Core logic (API, routing, maps, filtering)

└── README.md       # This file

📄 License

This project is open source and available under the 

MIT License
.
