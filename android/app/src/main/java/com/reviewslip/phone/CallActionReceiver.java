package com.reviewslip.phone;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.webkit.CookieManager;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * Decline, from the ring: stop ringing here and tell the server "not me", with
 * the page's own sign-in, so the caller hears sooner when nobody will answer.
 */
public class CallActionReceiver extends BroadcastReceiver {

    static final String DECLINE = BuildConfig.APPLICATION_ID + ".DECLINE";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (!DECLINE.equals(intent.getAction())) return;
        String callId = intent.getStringExtra(Ringer.EXTRA_CALL);
        String phone = intent.getStringExtra(Ringer.EXTRA_PHONE);
        Ringer.stop(context, callId);
        if (callId == null) return;

        String cookie;
        try {
            cookie = CookieManager.getInstance().getCookie(BuildConfig.SITE);
        } catch (Exception e) {
            return;
        }
        if (cookie == null) return;

        PendingResult done = goAsync();
        new Thread(() -> {
            try {
                String which = "reviewslip".equals(phone) ? "reviewslip" : "venues";
                URL url = new URL(BuildConfig.SITE + "/api/voice/decline?phone=" + which);
                HttpURLConnection http = (HttpURLConnection) url.openConnection();
                http.setRequestMethod("POST");
                http.setConnectTimeout(8000);
                http.setReadTimeout(8000);
                http.setDoOutput(true);
                http.setRequestProperty("Content-Type", "application/json");
                http.setRequestProperty("Cookie", cookie);
                byte[] body = ("{\"callId\":\"" + callId.replaceAll("[^A-Za-z0-9-]", "") + "\"}").getBytes(StandardCharsets.UTF_8);
                try (OutputStream out = http.getOutputStream()) {
                    out.write(body);
                }
                http.getResponseCode();
                http.disconnect();
            } catch (Exception ignored) {
                // the ring times out on the server as it always did
            } finally {
                done.finish();
            }
        }).start();
    }
}
