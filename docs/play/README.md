# Reviewslip Phone on Google Play

Everything the Play Console asks for, in the order it asks. The app itself is
described in [../phone-app.md](../phone-app.md).

| File | What it is |
| --- | --- |
| `android/app/build/outputs/bundle/release/app-release.aab` | The upload: `./gradlew bundleRelease` |
| `icon-512.png` | App icon, 512 × 512 |
| `feature-graphic-1024x500.png` | Feature graphic, 1024 × 500 |

The organization account (with the D-U-N-S number) does not have to run a
14-day closed test before production; personal accounts do.

## 1. Create the app

- **App name:** Reviewslip Phone
- **Default language:** English (United States) – en-US
- **App or game:** App
- **Free or paid:** Free

## 2. App signing: keep the key staff already have

Staff have the APK from reviewslip.com/phone/app, signed with
`~/.reviewslip/phone-release.jks` (alias `reviewslip-phone`). If Play signs
with that same key, the Play version updates over it. If Play makes its own
key, everyone has to uninstall once before Play can install.

When creating the first release: **App integrity → Change app signing key →
Export and upload a key from Java keystore**. Play gives a `pepk.jar` and the
exact command. Run it against `phone-release.jks` with alias
`reviewslip-phone`. It asks for the passwords in
`phone-keystore.properties`. Upload the zip it writes. Then upload the
`.aab`; the same key signs uploads, which is allowed.

## 3. Store listing

**Short description** (80 max):

> Answer guests' calls to your venue, even when your phone is locked.

**Full description:**

> Reviewslip Phone rings when a guest calls your venue from its Reviewslip page
> or table card: full screen over the lock screen, at ring volume, like a
> normal phone call. Answer, talk, and the call keeps going with the screen off.
>
> • Rings while the app is closed or the phone is asleep
> • Answer or decline from the lock screen
> • Go on duty and off duty, or set your hours, so calls ring only when you work
> • Several people can share a venue's line: the first to answer takes the call
> • When nobody can answer, the guest writes instead, and you answer their
>   message from the app
>
> You need a Reviewslip account for your venue, or to be added to one by its
> owner. Calls are over the internet: no phone number, no call charges, and
> guests never see your number.

- **App category:** Business
- **Contact email:** a support address for the business (shown publicly)
- **Website:** https://reviewslip.com
- **Graphics:** `icon-512.png` and `feature-graphic-1024x500.png`
- **Phone screenshots** (2 to 8, portrait): take these on a phone that is
  signed in, with the phone's own screenshot button. Good ones: the phone on
  duty, a call ringing over the lock screen, a call in progress, a guest's
  message.

## 4. App content

**Privacy policy:** https://reviewslip.com/legal/privacy

**Ads:** No, the app has no ads.

**App access:** All or some functionality is restricted. Add one set of
instructions:

- Name: Reviewer account
- Username and password: an account made for Google's reviewers, owning a
  test venue with the phone turned on. Use a password sign-in, not a code:
  reviewers cannot read the email.
- Instructions: "Tap Sign in to Reviewslip, sign in with the details above,
  then tap Go on duty. To ring the phone, open
  https://reviewslip.com/stays/<test venue> in any browser and tap Call. The
  call rings in the app; tap Answer."

**Content rating** (IARC questionnaire): category *All Other App Types*.
Answer No to violence, sexual content, language, drugs, gambling and
location sharing. **Users can interact or exchange content: Yes** (venue
staff talk to and message guests). Digital purchases: No.

**Target audience:** 18 and over. Not designed for children.

**News app:** No. **Government app:** No. **Financial features:** none.
**Health:** none.

### Data safety

Collected; none of it is shared with third parties (Firebase only delivers the
ring, as Reviewslip's service provider). All of it is encrypted in transit.

| Data type | Purpose | Optional? |
| --- | --- | --- |
| Personal info → Name | App functionality, Account management | Required |
| Personal info → Email address | App functionality, Account management | Required |
| Personal info → User IDs | App functionality, Account management | Required |
| Messages → Other in-app messages (answers to guests) | App functionality | Required |
| Audio → Voice or sound recordings (the live call; never recorded or stored) | App functionality; tick **processed ephemerally** | Required |
| App activity → App interactions (on or off duty, answered, declined) | App functionality | Required |
| Device or other IDs (the Firebase token that rings this phone) | App functionality | Required |

Not collected: location, contacts, photos, files, payment info, health,
browsing history, crash logs, diagnostics.

**Account creation:** choose *My app does not allow users to create an
account*. The app shows only the phone and the sign-in page; signing up,
prices and the dashboard open in the browser (`MainActivity.inApp`). Staff
sign in with an account made on reviewslip.com, or one an owner shared with
them there. That is also why Play's account-deletion rule does not apply, and
why nothing is sold inside the app. Keep it that way: a sign-up or checkout
page inside the app brings both rules back.

### Permission declarations

**Full-screen intent** (`USE_FULL_SCREEN_INTENT`): core functionality is
**Calling**. "Incoming calls from guests ring full screen over the lock
screen, like a phone call, so staff can answer a locked phone."

**Foreground service** (`FOREGROUND_SERVICE_MICROPHONE`), type
**Microphone**:

- Task: "Keeps a voice call going after the user answers it, while the
  screen is off or the user switches to another app. It starts when a call is
  answered and stops when the call ends. The ongoing notification reads 'On a
  call' and returns to the call."
- User-initiated: yes, the user answers the call.
- Video link: a short screen recording uploaded to YouTube as Unlisted.
  Answer a call, press the power button or go home, keep talking, then show
  the "On a call" notification.

## 5. Release

**Production → Create new release.** Upload the `.aab`. Release notes:

> First release on Google Play.

Countries: wherever venues are, at least Thailand. Then **Send for review**.

## Every later release

1. Raise `versionCode` (and `versionName`) in `android/app/build.gradle`.
2. `./gradlew bundleRelease assembleRelease`.
3. Upload the `.aab` to Play.
4. Copy the APK to `downloads/ReviewslipPhone.apk` for anyone installing from
   reviewslip.com, then deploy.

Each year Google Play raises the Android version new builds must target
(API 36 from 31 Aug 2026). Raise `targetSdk` and `compileSdk` to match.
