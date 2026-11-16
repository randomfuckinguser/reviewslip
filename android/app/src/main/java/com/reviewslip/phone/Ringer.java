package com.reviewslip.phone;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.app.Person;
import androidx.core.content.ContextCompat;

import java.util.Map;

/**
 * The ring: one notification per call, drawn the way Android draws a phone
 * call. On a sleeping or locked phone it opens the full-screen ring over the
 * lock screen; on a phone in use it drops down with Answer and Decline. Its
 * sound is the phone's ringtone, at the ring volume, looping until the call is
 * answered, declined, taken by someone else or given up.
 */
final class Ringer {

    static final String CHANNEL = "calls";
    static final String CHANNEL_ONGOING = "ongoing";

    /** Sent inside the app when a call stops ringing, so its screen closes. */
    static final String ACTION_SETTLED = BuildConfig.APPLICATION_ID + ".SETTLED";

    static final String EXTRA_CALL = "callId";
    static final String EXTRA_TITLE = "title";
    static final String EXTRA_CALLER = "caller";
    static final String EXTRA_PHONE = "phone";
    static final String EXTRA_SECONDS = "seconds";

    private Ringer() {}

    static void channels(Context c) {
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm.getNotificationChannel(CHANNEL) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, c.getString(R.string.channel_calls), NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription(c.getString(R.string.channel_calls_note));
            Uri tone = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
            ch.setSound(tone, new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build());
            ch.enableVibration(true);
            ch.setVibrationPattern(new long[] {0, 1000, 1000});
            ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            ch.setBypassDnd(true);
            nm.createNotificationChannel(ch);
        }
        if (nm.getNotificationChannel(CHANNEL_ONGOING) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL_ONGOING, c.getString(R.string.channel_ongoing), NotificationManager.IMPORTANCE_LOW);
            ch.setShowBadge(false);
            nm.createNotificationChannel(ch);
        }
    }

    static int idFor(String callId) {
        return callId.hashCode() & 0x3fffffff;
    }

    /** The call's details as extras, for the ring screen and the answer. */
    static Intent with(Intent i, Map<String, String> d) {
        return i.putExtra(EXTRA_CALL, d.get("callId"))
                .putExtra(EXTRA_TITLE, d.get("title"))
                .putExtra(EXTRA_CALLER, d.get("caller"))
                .putExtra(EXTRA_PHONE, d.get("phone"))
                .putExtra(EXTRA_SECONDS, d.get("seconds"));
    }

    static void ring(Context c, Map<String, String> d) {
        String callId = d.get("callId");
        if (callId == null || callId.isEmpty()) return;
        if (ContextCompat.checkSelfPermission(c, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
                && android.os.Build.VERSION.SDK_INT >= 33) return;
        channels(c);

        int id = idFor(callId);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
        long seconds = 45;
        try {
            seconds = Long.parseLong(d.get("seconds"));
        } catch (Exception ignored) {
            // the default
        }

        Intent screen = with(new Intent(c, IncomingCallActivity.class), d)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_NO_USER_ACTION);
        PendingIntent full = PendingIntent.getActivity(c, id, screen, flags);

        PendingIntent answer = PendingIntent.getActivity(c, id + 1, MainActivity.answerIntent(c, d), flags);

        Intent no = with(new Intent(c, CallActionReceiver.class).setAction(CallActionReceiver.DECLINE), d);
        PendingIntent decline = PendingIntent.getBroadcast(c, id + 2, no, flags);

        String who = d.get("caller");
        if (who == null || who.isEmpty()) who = c.getString(R.string.a_guest);
        Person caller = new Person.Builder().setName(who).setImportant(true).build();

        NotificationCompat.Builder b = new NotificationCompat.Builder(c, CHANNEL)
                .setSmallIcon(R.drawable.ic_call)
                .setContentTitle(who)
                .setContentText(d.get("title"))
                .setCategory(NotificationCompat.CATEGORY_CALL)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setOngoing(true)
                .setAutoCancel(false)
                .setContentIntent(full)
                .setFullScreenIntent(full, true)
                .setTimeoutAfter(seconds * 1000)
                .setStyle(NotificationCompat.CallStyle.forIncomingCall(caller, decline, answer));

        Notification n = b.build();
        // The ringtone loops, as a call's does, until the notification goes.
        n.flags |= Notification.FLAG_INSISTENT;
        try {
            NotificationManagerCompat.from(c).notify(id, n);
        } catch (SecurityException ignored) {
            // notifications turned off for the app
        }
    }

    /** Stops the ring: answered, declined, taken by someone else or given up. */
    static void stop(Context c, String callId) {
        if (callId == null) return;
        NotificationManagerCompat.from(c).cancel(idFor(callId));
        c.sendBroadcast(new Intent(ACTION_SETTLED).setPackage(c.getPackageName()).putExtra(EXTRA_CALL, callId));
    }
}
