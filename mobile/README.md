# Task Manager – Android (Expo)

Mobile app for the Task Manager. Smooth UI, contained layout (no overflow), and notifications.

## Requirements

- Node.js 18+
- Android Studio (for emulator) or a physical Android device
- Expo Go app (optional, for quick testing)

## Setup

1. **Install dependencies**

   ```bash
   cd mobile
   npm install
   ```

2. **Assets (icon & splash)**

   Create or copy these into `mobile/assets/`:

   - `icon.png` – 1024×1024 app icon
   - `splash.png` – splash screen (e.g. 1284×2778)
   - `adaptive-icon.png` – 1024×1024 for Android adaptive icon

   Or run once: `npx create-expo-app@latest _temp --template blank` and copy `_temp/assets/*` into `mobile/assets/`, then remove `_temp`.

3. **API base URL**

   Edit `mobile/src/config.js`:

   - **Android emulator:** `http://10.0.2.2:3000` (already set in dev)
   - **Physical device:** use your machine’s LAN IP, e.g. `http://192.168.1.10:3000`
   - **Production:** set your deployed server URL

   Ensure the backend server is running (e.g. `npm start` in project root).

## Run

```bash
cd mobile
npm start
```

Then:

- Press **a** for Android emulator, or
- Scan the QR code with Expo Go on a physical device

Or:

```bash
npm run android
```

## Features

- **Login:** Manager or Employee (email/password). Same API as the web app.
- **Tasks:** List of tasks from the board; pull-to-refresh.
- **Task detail:** Full task info; scrollable, stays within screen.
- **Notifications:** Permission requested on start; welcome notification after login. Ready for push when backend supports it.
- **Layout:** All screens use `SafeAreaView` and `ScrollView` where needed so content stays on screen and scrolls only when necessary.

## Notifications

- Local notifications work after permission is granted.
- Welcome notification is shown shortly after login.
- To add push notifications later: register device with your backend and send via FCM/Expo Push.

## Build APK / AAB

For a standalone build:

```bash
cd mobile
npx eas build --platform android --profile preview
```

(Requires an Expo account and `eas.json` configuration.)
