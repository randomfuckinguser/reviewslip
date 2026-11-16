package com.reviewslip.phone;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import androidx.core.content.ContextCompat;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

import com.google.firebase.FirebaseApp;
import com.google.firebase.messaging.FirebaseMessaging;

import org.json.JSONObject;

import java.lang.ref.WeakReference;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * The Reviewslip Phone: the phone page itself, in the app. Everything people
 * see and do — signing in, duty, hours, calls, messages — is the page, so it
 * changes with the site and never needs an app update. The app adds what a
 * page cannot do: ring through a sleeping phone, answer from the lock screen,
 * and keep a call going with the screen off.
 */
public class MainActivity extends Activity {

    static final String ACTION_ANSWER = BuildConfig.APPLICATION_ID + ".ANSWER";
    private static final int ASK = 1;
    private static final int ASK_MIC = 2;

    private static WeakReference<MainActivity> current = new WeakReference<>(null);

    private WebView web;
    private PermissionRequest waitingForMic;
    private boolean inCall;
    private boolean askedFullScreen;
    private final Handler later = new Handler(Looper.getMainLooper());

    /** Opens the phone on a call that is ringing, and answers it. */
    static Intent answerIntent(Context c, Map<String, String> d) {
        return Ringer.with(new Intent(c, MainActivity.class).setAction(ACTION_ANSWER), d)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
    }

    /** A new Firebase token, handed to the page if it is open. */
    static void tokenChanged(String token) {
        MainActivity a = current.get();
        if (a == null) return;
        a.runOnUiThread(() -> a.web.evaluateJavascript(
                "window.rsAppToken && window.rsAppToken(" + JSONObject.quote(token) + ")", null));
    }

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        current = new WeakReference<>(this);
        Ringer.channels(this);

        boolean night = (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
        WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView()).setAppearanceLightStatusBars(!night);
        WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView()).setAppearanceLightNavigationBars(!night);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(night ? 0xFF09090B : 0xFFFFFFFF);
        web = new WebView(this);
        root.addView(web, new FrameLayout.LayoutParams(-1, -1));
        // Android 15 draws under the status and navigation bars: keep the page
        // between them, and above the keyboard.
        ViewCompat.setOnApplyWindowInsetsListener(root, (v, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.ime());
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            return WindowInsetsCompat.CONSUMED;
        });
        setContentView(root);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        // The ringtone and the caller's voice play without a tap first.
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setUserAgentString(s.getUserAgentString() + " ReviewslipPhone/" + BuildConfig.VERSION_NAME);
        web.addJavascriptInterface(new Bridge(), "ReviewslipApp");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                if (ours(u)) return false;
                // Anywhere else opens in the browser.
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, u));
                } catch (Exception ignored) {
                    // nothing can open it
                }
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                // Opens next time on the phone last used: a venue's or Reviewslip's.
                Uri u = Uri.parse(url);
                String path = u.getPath() == null ? "" : u.getPath();
                if (ours(u) && path.startsWith("/phone/")) {
                    Prefs.setHome(MainActivity.this, path.startsWith("/phone/reviewslip/") ? "reviewslip" : "venues");
                }
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest req, WebResourceError err) {
                if (!req.isForMainFrame()) return;
                // No network: say so, and try again shortly.
                String retry = req.getUrl().toString();
                view.loadDataWithBaseURL(null, offlinePage(), "text/html", "utf-8", null);
                later.postDelayed(() -> web.loadUrl(retry), 5000);
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(PermissionRequest req) {
                boolean audio = false;
                for (String r : req.getResources()) if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(r)) audio = true;
                if (!audio || !ours(req.getOrigin())) {
                    req.deny();
                    return;
                }
                if (granted(Manifest.permission.RECORD_AUDIO)) {
                    req.grant(new String[] {PermissionRequest.RESOURCE_AUDIO_CAPTURE});
                } else {
                    waitingForMic = req;
                    requestPermissions(new String[] {Manifest.permission.RECORD_AUDIO}, ASK_MIC);
                }
            }
        });

        if (state != null) web.restoreState(state);
        if (!open(getIntent()) && state == null) web.loadUrl(Prefs.phoneUrl(Prefs.home(this)));

        askOnce();
        firebase();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        open(intent);
    }

    @Override
    protected void onResume() {
        super.onResume();
        fullScreenCheck();
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    protected void onDestroy() {
        if (current.get() == this) current = new WeakReference<>(null);
        later.removeCallbacksAndMessages(null);
        CallService.stop(this);
        web.destroy();
        super.onDestroy();
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        // Back to the home screen, still on duty: never closed by Back.
        else moveTaskToBack(true);
    }

    /** Answer from the ring: open the right phone on that call. */
    private boolean open(Intent intent) {
        if (intent == null || !ACTION_ANSWER.equals(intent.getAction())) return false;
        String callId = intent.getStringExtra(Ringer.EXTRA_CALL);
        if (callId == null) return false;
        Ringer.stop(this, callId);
        // Answered on a locked phone, the call shows over the lock screen until
        // it ends; the rest of the app stays behind the lock.
        setShowWhenLocked(true);
        setTurnScreenOn(true);
        later.postDelayed(() -> {
            if (!inCall) setShowWhenLocked(false);
        }, 60_000);
        web.loadUrl(Prefs.phoneUrl(intent.getStringExtra(Ringer.EXTRA_PHONE)) + "?answer=" + Uri.encode(callId));
        intent.setAction(Intent.ACTION_MAIN);
        return true;
    }

    private static boolean ours(Uri u) {
        Uri site = Uri.parse(BuildConfig.SITE);
        return u != null && site.getHost() != null && site.getHost().equalsIgnoreCase(u.getHost())
                && site.getScheme().equalsIgnoreCase(u.getScheme());
    }

    private boolean granted(String permission) {
        return ContextCompat.checkSelfPermission(this, permission) == PackageManager.PERMISSION_GRANTED;
    }

    /** Notifications to ring, the microphone to talk: asked for up front. */
    private void askOnce() {
        List<String> want = new ArrayList<>();
        if (Build.VERSION.SDK_INT >= 33 && !granted(Manifest.permission.POST_NOTIFICATIONS)) want.add(Manifest.permission.POST_NOTIFICATIONS);
        if (!granted(Manifest.permission.RECORD_AUDIO)) want.add(Manifest.permission.RECORD_AUDIO);
        if (!want.isEmpty()) requestPermissions(want.toArray(new String[0]), ASK);
    }

    /**
     * Android 14 lets a user switch off the full-screen ring for an app. Without
     * it a call on a locked phone is only a notification: say so, once.
     */
    private void fullScreenCheck() {
        if (Build.VERSION.SDK_INT < 34 || askedFullScreen) return;
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm.canUseFullScreenIntent()) return;
        askedFullScreen = true;
        new AlertDialog.Builder(this)
                .setTitle(R.string.full_screen_title)
                .setMessage(R.string.full_screen_note)
                .setPositiveButton(R.string.open_settings, (d, w) -> {
                    try {
                        startActivity(new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT,
                                Uri.parse("package:" + getPackageName())));
                    } catch (Exception ignored) {
                        // no such screen on this phone
                    }
                })
                .setNegativeButton(R.string.not_now, null)
                .show();
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(code, permissions, results);
        if (waitingForMic == null) return;
        if (granted(Manifest.permission.RECORD_AUDIO)) waitingForMic.grant(new String[] {PermissionRequest.RESOURCE_AUDIO_CAPTURE});
        else waitingForMic.deny();
        waitingForMic = null;
    }

    private void firebase() {
        try {
            // Built without google-services.json: no ringing while closed.
            if (FirebaseApp.getApps(this).isEmpty() && FirebaseApp.initializeApp(this) == null) return;
            FirebaseMessaging.getInstance().getToken().addOnSuccessListener(token -> {
                Prefs.setToken(this, token);
                tokenChanged(token);
            });
        } catch (Exception ignored) {
            // Firebase not set up
        }
    }

    private String offlinePage() {
        boolean night = (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
        return "<!doctype html><meta name=viewport content='width=device-width,initial-scale=1'>"
                + "<body style='margin:0;display:grid;place-items:center;height:100vh;font:16px system-ui;"
                + (night ? "background:#09090b;color:#a1a1aa" : "background:#fff;color:#52525b") + "'>"
                + "<p style='text-align:center;padding:24px'>" + getString(R.string.offline) + "</p>";
    }

    /** What the page can ask of the app, as window.ReviewslipApp. */
    private class Bridge {
        @JavascriptInterface
        public String pushToken() {
            return Prefs.token(MainActivity.this);
        }

        @JavascriptInterface
        public String version() {
            return BuildConfig.VERSION_NAME;
        }

        @JavascriptInterface
        public void inCall(boolean on) {
            runOnUiThread(() -> {
                inCall = on;
                if (on) {
                    CallService.start(MainActivity.this);
                } else {
                    CallService.stop(MainActivity.this);
                    setShowWhenLocked(false);
                }
            });
        }
    }
}
