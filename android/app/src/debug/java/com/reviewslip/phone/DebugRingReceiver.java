package com.reviewslip.phone;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import java.util.HashMap;
import java.util.Map;

/**
 * Debug builds only: the server's "ring" and "settled" without Firebase.
 *
 *   adb shell am broadcast -a com.reviewslip.phone.debug.RING -p com.reviewslip.phone \
 *     --es callId c1 --es caller Anna --es title "Baanpong Lodge" --es phone venues --es seconds 45
 */
public class DebugRingReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        Map<String, String> d = new HashMap<>();
        for (String k : new String[] {"callId", "title", "caller", "phone", "seconds"}) d.put(k, intent.getStringExtra(k));
        if (intent.getAction().endsWith(".RING")) Ringer.ring(context, d);
        else Ringer.stop(context, d.get("callId"));
    }
}
