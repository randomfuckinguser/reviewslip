package com.reviewslip.phone;

import androidx.annotation.NonNull;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

/**
 * What the server sends: "ring" when a guest calls a line this person takes,
 * "settled" when that call stops ringing. A high-priority message wakes the
 * app even on a phone that is asleep, so this runs either way.
 */
public class CallMessagingService extends FirebaseMessagingService {

    @Override
    public void onMessageReceived(@NonNull RemoteMessage message) {
        Map<String, String> d = message.getData();
        String t = d.get("t");
        if ("ring".equals(t)) Ringer.ring(this, d);
        else if ("settled".equals(t)) Ringer.stop(this, d.get("callId"));
    }

    @Override
    public void onNewToken(@NonNull String token) {
        // The page sends it to the server the next time it opens.
        Prefs.setToken(this, token);
        MainActivity.tokenChanged(token);
    }
}
