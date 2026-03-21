<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/bc417007-b207-4a04-88ad-088a628866a7

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
   `npm run dev`

## Tauri Commands

You can run the application as a desktop app using Tauri:

1. Start the Tauri development window:
   `npm run tauri:dev`
2. Build the Tauri application for production:
   `npm run tauri:build`
3. View Tauri environment information:
   `npm run tauri info`

## Android Build

To build the application for Android, ensure you have the Android SDK and NDK installed via Android Studio, and then run:

1. Connect your device or start an emulator and run in development mode:
   `npm run tauri android dev`
2. Build the production Android APK / AAB:
   `npm run tauri android build`
