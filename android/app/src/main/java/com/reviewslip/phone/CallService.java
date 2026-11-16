package com.reviewslip.phone;

import android.app.Notification;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;

import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;
import androidx.core.content.ContextCompat;

/**
 * Held for the length of a call, so Android keeps the app — and the call —
 * running with the screen off or another app in front. Shows as "On a call".
 */
public class CallService extends Service {

    private static final int ID = 1;

    static void start(Context c) {
        try {
            ContextCompat.startForegroundService(c, new Intent(c, CallService.class));
        } catch (Exception ignored) {
            // not allowed from here: the call goes on while the app is open
        }
    }

    static void stop(Context c) {
        c.stopService(new Intent(c, CallService.class));
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Ringer.channels(this);
        PendingIntent back = PendingIntent.getActivity(this, 0,
                new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
                PendingIntent.FLAG_IMMUTABLE);
        Notification n = new NotificationCompat.Builder(this, Ringer.CHANNEL_ONGOING)
                .setSmallIcon(R.drawable.ic_call)
                .setContentTitle(getString(R.string.on_a_call))
                .setContentText(getString(R.string.on_a_call_note))
                .setCategory(NotificationCompat.CATEGORY_CALL)
                .setOngoing(true)
                .setContentIntent(back)
                .build();
        try {
            ServiceCompat.startForeground(this, ID, n,
                    Build.VERSION.SDK_INT >= 30 ? ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE : 0);
        } catch (Exception e) {
            stopSelf();
        }
        return START_NOT_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
