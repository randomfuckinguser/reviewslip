import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Download, Smartphone } from "lucide-react";

import { REVIEW_API } from "@/lib/customer";
import { isLocale } from "@/lib/i18n/config";
import { qrCode } from "@/lib/qr";
import styles from "./app.module.css";

export const metadata: Metadata = {
  title: "Reviewslip Phone for Android",
  description:
    "The Reviewslip Phone app for venue staff: calls ring like a normal phone call, even when the phone is locked.",
  robots: { index: false, follow: true },
};

/** Where the file itself is: the review app serves it, on this site's address. */
const FILE = "/phone/app";
const PAGE = "https://reviewslip.com/app";

/** The file's size, for the button's small print. Best effort: none is fine. */
async function size(): Promise<string | null> {
  try {
    const res = await fetch(`${REVIEW_API}${FILE}`, { method: "HEAD", next: { revalidate: 3600 } });
    const bytes = Number(res.headers.get("content-length"));
    if (!res.ok || !bytes) return null;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  } catch {
    return null;
  }
}

/**
 * The phone app's download page: reviewslip.com/app.
 *
 * The address staff are sent, and what the phone page's Download the App
 * opens. Until the app is on Google Play an Android phone shows two warnings
 * on the way in (a "harmful file" note, then "install unknown apps"), and
 * nothing a page does can remove them. So the page says what each one will
 * look like and which button to press, before anyone meets it. On a computer
 * the code takes it to the phone.
 */
export default async function PhoneAppPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();

  const bytes = await size();
  const code = qrCode(PAGE);
  const side = code.count + 8;

  return (
    <>
      <section className={styles.hero}>
        <div className={`wrap ${styles.grid}`}>
          <div className={styles.copy}>
            <span className="eyebrow">For your staff</span>
            <h1 className={styles.title}>Reviewslip Phone for Android</h1>
            <p className="lede">
              Take your venue&apos;s calls on your own phone. It rings like a normal call, full screen,
              even when the phone is locked or asleep.
            </p>

            <a className={`btn btn-go ${styles.download}`} href={FILE} download="ReviewslipPhone.apk">
              <Download size={20} aria-hidden="true" />
              Download for Android
            </a>
            <p className={styles.meta}>
              Version 1.0{bytes ? ` · ${bytes}` : ""} · Android 8 or newer · free
            </p>

            <p className={styles.ios}>
              <Smartphone size={16} aria-hidden="true" />
              <span>
                On an iPhone? There is no app to install: open{" "}
                {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- the review app serves it, not this router */}
                <a href="/phone/">reviewslip.com/phone</a> in Safari, then Share, then{" "}
                <b>Add to Home Screen</b>.
              </span>
            </p>
          </div>

          {/* For somebody reading this on a computer: the phone is what needs it. */}
          <figure className={styles.qr}>
            <svg
              viewBox={`-4 -4 ${side} ${side}`}
              width={176}
              height={176}
              shapeRendering="crispEdges"
              role="img"
              aria-label="QR code for reviewslip.com/app"
            >
              <rect x={-4} y={-4} width={side} height={side} fill="#fff" />
              <path d={code.path} fill="#000" />
            </svg>
            <figcaption>On a computer? Scan this with your phone&apos;s camera.</figcaption>
          </figure>
        </div>
      </section>

      <section className={styles.stepsSection} aria-labelledby="steps-h">
        <div className="wrap">
          <h2 id="steps-h" className={styles.stepsTitle}>
            Installing it, step by step
          </h2>
          <p className={styles.stepsLede}>
            Until it is on Google Play, Android asks twice before it installs an app from a website.
            Both are expected. Here is what you will see.
          </p>

          <ol className={styles.steps}>
            <li>
              <h3>Download</h3>
              <p>Tap Download for Android. Chrome may warn that the file could be harmful.</p>
              <div className={styles.mock} aria-hidden="true">
                <span>File might be harmful</span>
                <b>Download anyway</b>
              </div>
              <p className={styles.press}>
                Tap <b>Download anyway</b>.
              </p>
            </li>
            <li>
              <h3>Open it</h3>
              <p>When it finishes, tap Open, or find ReviewslipPhone.apk in your Downloads.</p>
              <div className={styles.mock} aria-hidden="true">
                <span>ReviewslipPhone.apk</span>
                <b>Open</b>
              </div>
              <p className={styles.press}>
                Tap <b>Open</b>.
              </p>
            </li>
            <li>
              <h3>Allow it</h3>
              <p>Android asks whether Chrome may install apps. This is once only.</p>
              <div className={styles.mock} aria-hidden="true">
                <span>Allow from this source</span>
                <i className={styles.toggle} />
              </div>
              <p className={styles.press}>
                Tap <b>Settings</b>, turn on <b>Allow from this source</b>, go back, then tap{" "}
                <b>Install</b>.
              </p>
            </li>
            <li>
              <h3>Sign in</h3>
              <p>Open Reviewslip Phone, allow notifications and the microphone, and sign in.</p>
              <div className={styles.mock} aria-hidden="true">
                <span>Off duty</span>
                <b>Go on duty</b>
              </div>
              <p className={styles.press}>
                Tap <b>Go on duty</b>. Calls now ring this phone.
              </p>
            </li>
          </ol>

          <div className={styles.tips}>
            <h3>So it rings every time</h3>
            <ul>
              <li>
                On Android 14 and newer, allow <b>full-screen notifications</b> if the app asks, or a
                locked phone shows a call as a notification only.
              </li>
              <li>
                On Xiaomi, Oppo, Vivo and Huawei phones, set the app&apos;s battery use to{" "}
                <b>No restrictions</b> and turn on <b>Autostart</b>, or the phone may stop it ringing
                while asleep.
              </li>
              <li>The phone&apos;s ring volume and silent switch apply, as for any call.</li>
            </ul>
          </div>
        </div>
      </section>
    </>
  );
}
