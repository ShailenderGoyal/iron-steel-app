# Rohini Ispat — Android app

A thin Android wrapper around the live website, built as a **Trusted Web Activity (TWA)**:
the app opens `https://iron-steel-app-production.up.railway.app/` full-screen in Chrome's
engine, with no address bar. There is no app code of our own — the launcher comes from
Google's `android-browser-helper` library, configured in
`app/src/main/AndroidManifest.xml`.

Because the app *is* the website, **normal deploys need no new APK** — push to `main`
and every phone picks up the change on next launch. Rebuild the APK only to change the
icon, name, colours or URL.

## How the "no address bar" part works

Android only hides the address bar once the site proves it owns the app. The site does
this at `/.well-known/assetlinks.json` (served by `backend/src/index.js`), which lists the
SHA-256 fingerprint of the key the APK is signed with. If the fingerprint doesn't match,
the app still works but shows a thin address bar at the top.

## Signing key — back this up

The APK is signed with `android/release.keystore`; its passwords are in
`android/keystore.properties`. **Both are git-ignored and exist only on the machine that
created them.** Copy both somewhere safe (e.g. a password manager or private drive).

If they are lost, a new key must be made, its fingerprint added to `assetlinks.json`, and
every phone must uninstall the old app before installing the new one (Android refuses
updates signed with a different key).

Current fingerprint (SHA-256):
`81:8B:87:7C:B6:04:8B:D4:F4:9C:64:45:A0:36:D7:7F:9F:03:17:54:BE:64:5B:13:CB:3D:82:17:AB:A4:E9:27`

To print it from the keystore:

```powershell
& "$env:LOCALAPPDATA\Programs\Temurin\jdk-21.0.12.1+1\bin\keytool.exe" -list -v -keystore android\release.keystore
```

## Building the APK

Needs JDK 17+ and the Android SDK (platform 36). On this machine:

```powershell
cd android
$env:JAVA_HOME = "$env:LOCALAPPDATA\Programs\Temurin\jdk-21.0.12.1+1"
.\gradlew.bat assembleRelease
Copy-Item app\build\outputs\apk\release\app-release.apk ..\frontend\public\rohini-ispat.apk
```

Before a rebuild meant to replace an installed app, bump `versionCode` (and
`versionName`) in `app/build.gradle`, or phones won't accept it as an update.

The copy in `frontend/public/` is what the website serves at `/rohini-ispat.apk` once
committed and deployed.

## Installing on a phone

1. On the phone, open `https://iron-steel-app-production.up.railway.app/rohini-ispat.apk`
   in Chrome (or send the APK over WhatsApp / USB).
2. Tap the downloaded file. Android asks to allow "Install unknown apps" for Chrome (or
   whichever app opened it) — allow it once.
3. Open **Rohini Ispat** from the home screen and log in as usual.

The app needs Google Chrome on the phone (preinstalled on almost all Android phones). If
there's no compatible browser, it falls back to a built-in WebView.
