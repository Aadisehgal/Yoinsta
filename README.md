# Yoinsta Android — WebView wrapper + AdMob rewarded ads

Wraps the deployed Yoinsta web app in a WebView and bridges AdMob rewarded ads to it. The web
side's `<AdGate>` component (in the main `yoinsta` repo) already knows how to call into this —
see "How the bridge works" below.

**Honest disclaimer:** this sandbox has no Android SDK and no network access, so none of this has
been compiled or run on a device. The code follows AdMob's and Android's documented APIs closely,
but expect to fix a small thing or two on your first build — that's normal for any Android project
written without a compiler in the loop.

## Before you build

1. `WEB_APP_URL` and `APP_HOST` in `MainActivity.java` already point at
   `https://yoinsta.vercel.app`. Change both if you move to a custom domain.
2. If you want your own package name instead of `com.yoinsta.app`, change `applicationId` and
   `namespace` in `app/build.gradle`, and move the Java files to match the new package path.

## Google sign-in inside the app

Google **blocks sign-in inside an embedded WebView** ("This browser or app may not be secure"), and a
sign-in started in the WebView can't be finished in Chrome either (the WebView's cookies don't exist
there, so NextAuth rejects the callback). So the whole sign-in runs in Chrome, and the app receives
the finished session through a one-time code:

1. The login page sees `window.AndroidAuth` and calls `startGoogleLogin()`. The app makes a random
   `verifier`, stores it, and opens `/native/login?challenge=SHA256(verifier)` in a Chrome Custom Tab.
2. Chrome does the normal Google sign-in. `/native/handoff` then shows an **Open Yoinsta** button
   carrying a single-use code (valid 2 minutes, bound to the challenge).
3. The button opens `yoinsta://auth?code=...`. The app loads `/api/native/exchange?code=...&verifier=...`
   in the WebView; the server checks code + verifier and sets the session cookie in the WebView.

A code made for someone else's sign-in can't be paired with this app's verifier, so intercepting the
deep link doesn't help an attacker. No `assetlinks.json`, SHA fingerprints or Google Cloud changes needed.

**Connect YouTube** works the same way: `MainActivity` opens `/api/youtube/connect` in a Custom Tab
(Google consent has to be in a real browser). The channel link is saved on the server, and the app
reloads its page when you come back.

Other routing rules in `MainActivity`: only `yoinsta.vercel.app` loads inside the app (YouTube links,
`mailto:` etc. open outside it), the thumbnail "Download" button saves to `Downloads/Yoinsta`, and
`<input type="file">` (thumbnail upload on the Videos page) opens Android's file picker via
`WebChromeClient.onShowFileChooser`.

Server side of all this lives in the Next.js repo: `app/native/login`, `app/native/handoff`,
`app/api/native/exchange`, and the `AndroidAuth` branch in `app/(auth)/login/page.tsx`.

## How the bridge works

- Web page calls `window.AndroidAds.showRewardedAd(nonce)` (only exists inside this app, not in a
  regular browser — `<AdGate>` already checks for it and falls back to its mock ad otherwise).
- `RewardedAdBridge` (in `MainActivity.java`) hands off to `RewardedAdManager`, which shows the
  preloaded AdMob rewarded ad and immediately starts loading the next one.
- When the ad is dismissed, the native side calls `window.onNativeAdResult(nonce, true|false)`
  back into the page, which `<AdGate>` listens for and then calls `/api/ads/complete`.

## Building in Termux

```bash
pkg update && pkg upgrade
pkg install openjdk-17 gradle aapt aapt2 git wget unzip

# Android SDK command-line tools (Termux doesn't ship these)
mkdir -p ~/android-sdk/cmdline-tools
cd ~/android-sdk/cmdline-tools
wget https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip
unzip commandlinetools-linux-*.zip && mv cmdline-tools latest

export ANDROID_HOME=~/android-sdk
export PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools

yes | sdkmanager --licenses
sdkmanager "platform-tools" "platforms;android-35" "build-tools;35.0.0"
```

Termux's `aapt2` is ARM-native, but Gradle downloads an x86 one by default — override it globally
(one-time, in your Termux home, not in this repo):

```bash
mkdir -p ~/.gradle
echo "android.aapt2FromMavenOverride=$PREFIX/bin/aapt2" >> ~/.gradle/gradle.properties
```

Then, from this project's folder:

```bash
gradle assembleDebug --no-daemon
```

(Use the globally-installed `gradle` command, not `./gradlew` — this project doesn't ship a
wrapper, since generating the wrapper jar needs network access this environment didn't have. If
you'd rather use the wrapper, run `gradle wrapper --gradle-version 8.10.2` once yourself.)

The APK lands at `app/build/outputs/apk/debug/app-debug.apk`. Copy it to your device (or you're
likely already on it in Termux) and install it — you'll need to allow "install from unknown
sources" for whichever file manager/browser you use to open it.

## Pushing to GitHub

```bash
git init
git add .
git commit -m "Yoinsta Android wrapper — WebView + AdMob rewarded ads (test IDs)"
git remote add origin https://github.com/YOUR_USERNAME/yoinsta-android.git
git push -u origin main
```

## Going live: swapping in your real AdMob IDs

Two places have Google's public **test** IDs — replace both before publishing:

1. `AndroidManifest.xml` → the `com.google.android.gms.ads.APPLICATION_ID` meta-data value
   (your AdMob **App ID**).
2. `RewardedAdManager.java` → the `AD_UNIT_ID` constant (your **rewarded ad unit ID**).

Get both from the AdMob console after creating your app and a rewarded ad unit there. Test with
the test IDs until everything works end-to-end — AdMob can suspend accounts for accidentally
clicking your own real ads during development, which is exactly what the test IDs are for.

## App icon

The launcher icon is the Yoinsta logo. `mipmap-*/ic_launcher*.png` are the legacy (Android 7 and older)
and round versions; `drawable/ic_launcher_foreground.png` + the solid-black `ic_launcher_background.xml`
make the adaptive icon used on Android 8+ (the logo is scaled to stay inside the safe zone, so no launcher
shape can crop it). `store-assets/play-store-icon-512.png` is the 512x512 icon for the Play Store listing.
After installing a build with a new icon, a launcher may keep showing the old one until you reinstall or
restart it.
