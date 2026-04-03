# Alpenglow Mobile

The mobile companion for the Alpenglow AI agent platform. Native iOS app with local-first architecture — your data stays on your device.

## Features

- **Native iOS app** — compiled native performance via React Native, not a web wrapper
- **Cross-device sync** — your AI agent follows you between phone and desktop with encrypted delta synchronization
- **Local inference routing** — mobile devices route computation to your local hardware over encrypted channels
- **Offline-first** — full functionality without internet. Sync happens when connectivity returns
- **Persistent memory** — your agent remembers across sessions with the same memory architecture as desktop
- **12 phone tools** — injected at boot for mobile-specific agent capabilities

## Requirements

- iOS 15.0+
- Node.js 18+
- CocoaPods
- Xcode 15+

## Setup

```sh
# Install dependencies
npm install

# Install iOS pods
cd ios && pod install && cd ..

# Start Metro bundler
npm start

# Run on iOS (separate terminal)
npm run ios
```

## Architecture

The mobile app connects to the Alpenglow backend running on your desktop/server via encrypted channels. The cognitive engine runs as a compiled native binary delivered via FFI bridge — not a cloud API call.

## Platform Support

- **iOS** — Supported, actively developed
- **Android** — Not currently supported

## Known Issues

- **Electron desktop wrapper respawn loop** — The Electron-packaged desktop app (.dmg) may launch multiple instances in a loop. Use the local development server (`npm run dev -- start`) as the primary desktop interface until this is resolved. This does not affect the mobile app.

---

Part of the [Alpenglow](https://github.com/NOUSai-Labs/Alpenglow) platform.
