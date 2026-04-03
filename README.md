# Alpenglow

A local-first AI agent platform. Your data stays on your devices. Your agent remembers everything. No cloud required.

## What It Is

Alpenglow is an AI agent runtime that runs entirely on your hardware. Persistent memory, cross-device sync, encrypted storage, and autonomous agent capabilities — all local, all private.

## Features

- **Persistent memory** — your agent remembers across sessions. Not a chatbot that forgets. A companion that knows you.
- **Local-first** — everything runs on your machine. No API calls. No cloud storage. No data leaving your devices.
- **Cross-device sync** — encrypted delta synchronization between desktop and mobile. Your agent follows you.
- **Defense-in-depth security** — three independent protection layers on all stored data
- **Developer marketplace** — third-party tools and integrations
- **Automation** — scheduled tasks, multi-step workflows, proactive agent execution
- **Web UI** — runs in your browser at localhost, not in a terminal

## Getting Started

```sh
# Clone the repository
git clone https://github.com/NOUSai-Labs/Alpenglow.git

# Install dependencies
npm install

# Launch Alpenglow
npm run dev -- start
```

The dashboard opens at `http://localhost:19820`

## Platform Support

- **macOS (Desktop)** — Primary platform. Fully supported.
- **iOS (Mobile)** — Companion app for cross-device sync. React Native.
- **Android** — Not currently supported.
- **Windows/Linux** — Not currently supported.

## Known Issues

- **Electron wrapper respawn loop** — The packaged desktop app (.dmg) may launch multiple instances in a loop. Use the development server (`npm run dev -- start`) as the primary interface until this is resolved.

## Status

Active development. Private beta.

## License

Proprietary. All rights reserved.

---

S3 | Freedom in Code
