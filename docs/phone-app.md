# Reviewslip Phone for Android

The softphone as an installed app. A phone that is asleep, locked or has the
app closed still rings like a phone call: full screen over the lock screen,
the phone's own ringtone at ring volume, looping until someone answers, the
caller hangs up or the ring times out (45 seconds). On a phone in use the call
drops down from the top with **Answer** and **Decline**.

Everything inside the app is the phone page (`/phone/`), so the page's changes
reach the app without an app update. The app adds only what a page cannot do:

| Piece | Where |
| --- | --- |
| The page, signed in with the site's own session | `MainActivity` (a WebView on `https://reviewslip.com/phone/`) |
| Being rung while closed or asleep | Firebase high-priority message → `CallMessagingService` → `Ringer` |
| The ring over the lock screen | `IncomingCallActivity` |
| Answer | opens the page at `?answer=<call id>`, which answers as soon as the ring arrives |
| Decline | `CallActionReceiver` → `POST /api/voice/decline` with the page's cookie |
| A call going on with the screen off | `CallService` (foreground, "On a call") |

Duty works exactly as on the page: only **Go off duty** or the end of My hours
takes someone off. With the app installed and signed in, they stay ringable
while the phone sleeps.

## The server

`fcm.js` sends the rings (Firebase HTTP v1, no SDK). The app's token is kept
in `voice_push` beside browsers' web push subscriptions, as `fcm:<token>`, so
someone with both rings on both. A token Firebase reports gone (app
uninstalled) is deleted on the next ring.

Set one of these in the review app's environment, then restart it:

```
FCM_SERVICE_ACCOUNT=/opt/reviewslip/firebase-phone.json   # path to the key file
# or
FCM_SERVICE_ACCOUNT_JSON={"type":"service_account",...}   # the JSON itself
```

Without it the app works while open and just cannot be rung while closed.

## One-time Firebase setup

1. Go to <https://console.firebase.google.com>, **Create a project** (e.g.
   "Reviewslip"). Google Analytics is not needed.
2. In the project, **Add app → Android**. Package name:
   `com.reviewslip.phone`. Download **google-services.json** and put it in
   `android/app/`.
3. **Project settings → Service accounts → Generate new private key.** This
   downloads a JSON key: copy it to the server (e.g.
   `/opt/reviewslip/firebase-phone.json`, readable only by the app's user) and
   set `FCM_SERVICE_ACCOUNT` as above. Never commit this file.

## Building

Needs JDK 17 or 21 and the Android SDK (platform 35).

```
cd android
./gradlew assembleRelease     # app/build/outputs/apk/release/app-release.apk
```

The release key is read from `~/.reviewslip/phone-keystore.properties`
(`storeFile`, `storePassword`, `keyAlias`, `keyPassword`), or the file named
by `RS_PHONE_KEYS`. **Back up the key file and its properties.** Android only
installs an update signed with the same key; lose it and every phone has to
uninstall and reinstall.

`-PsiteUrl=http://localhost:3002` points a build at another server (debug
builds allow plain http). Debug builds can also ring without Firebase:

```
adb shell am broadcast -a com.reviewslip.phone.debug.RING -p com.reviewslip.phone \
  --es callId c1 --es caller Anna --es title "Baanpong Lodge" --es phone venues --es seconds 45
```

## Publishing a build

The review app serves the APK at **`/phone/app`** (reviewslip.com/phone/app),
from `downloads/ReviewslipPhone.apk`. After a release build, copy it there,
raise `versionCode` for the next one, commit and deploy:

```
cp android/app/build/outputs/apk/release/app-release.apk downloads/ReviewslipPhone.apk
```

The phone page offers it to anyone on Android in a browser (a note under the
duty status and **Get the Android app** in the menu), in place of the browser's
own "ring when closed" note. Inside the app neither shows.

## Installing on staff phones

Until it is on Google Play: open **reviewslip.com/phone/app** on the phone (or
tap **Get the app** on the phone page), download it, open it and allow
**Install unknown apps** for the browser. Then:

1. Open **Reviewslip Phone**, allow notifications and the microphone.
2. Sign in, tap **Go on duty**.
3. On Android 14 and later, if the app asks, allow **full-screen
   notifications** — without it a locked phone shows the call as a
   notification only.
4. Some phones (Xiaomi, Oppo, Vivo, Huawei) stop apps in the background to save
   battery. On those, set Reviewslip Phone's battery use to **No
   restrictions** / allow **Autostart**, or it may not ring while asleep.

The phone's ring volume and silent switch apply, as for any call.
