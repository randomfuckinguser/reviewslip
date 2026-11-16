package com.reviewslip.phone;

import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.core.content.ContextCompat;

import java.util.HashMap;
import java.util.Map;

/**
 * The ring over the lock screen: who is calling, for which venue, and two
 * buttons. It lights a sleeping phone's screen; the notification behind it
 * plays the ringtone.
 */
public class IncomingCallActivity extends Activity {

    private String callId;
    private final Handler later = new Handler(Looper.getMainLooper());

    private final BroadcastReceiver settled = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            String id = intent.getStringExtra(Ringer.EXTRA_CALL);
            if (id == null || id.equals(callId)) finish();
        }
    };

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        setShowWhenLocked(true);
        setTurnScreenOn(true);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        build(getIntent());
        ContextCompat.registerReceiver(this, settled, new IntentFilter(Ringer.ACTION_SETTLED), ContextCompat.RECEIVER_NOT_EXPORTED);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        build(intent);
    }

    @Override
    protected void onDestroy() {
        unregisterReceiver(settled);
        later.removeCallbacksAndMessages(null);
        super.onDestroy();
    }

    private Map<String, String> data(Intent i) {
        Map<String, String> d = new HashMap<>();
        d.put("callId", i.getStringExtra(Ringer.EXTRA_CALL));
        d.put("title", i.getStringExtra(Ringer.EXTRA_TITLE));
        d.put("caller", i.getStringExtra(Ringer.EXTRA_CALLER));
        d.put("phone", i.getStringExtra(Ringer.EXTRA_PHONE));
        d.put("seconds", i.getStringExtra(Ringer.EXTRA_SECONDS));
        return d;
    }

    private void build(Intent intent) {
        Map<String, String> d = data(intent);
        callId = d.get("callId");
        if (callId == null) {
            finish();
            return;
        }
        long seconds = 45;
        try {
            seconds = Long.parseLong(d.get("seconds"));
        } catch (Exception ignored) {
            // the default
        }
        later.removeCallbacksAndMessages(null);
        later.postDelayed(this::finish, seconds * 1000);

        float dp = getResources().getDisplayMetrics().density;
        String who = d.get("caller");
        if (who == null || who.isEmpty()) who = getString(R.string.a_guest);

        LinearLayout top = new LinearLayout(this);
        top.setOrientation(LinearLayout.VERTICAL);
        top.setGravity(Gravity.CENTER_HORIZONTAL);

        TextView eyebrow = text(getString(R.string.incoming), 15, 0xFFA1A1AA, false);
        top.addView(eyebrow);

        TextView avatar = text(who.substring(0, 1).toUpperCase(), 40, Color.WHITE, true);
        avatar.setGravity(Gravity.CENTER);
        GradientDrawable circle = new GradientDrawable();
        circle.setShape(GradientDrawable.OVAL);
        circle.setColor(0xFF27272A);
        avatar.setBackground(circle);
        LinearLayout.LayoutParams ap = new LinearLayout.LayoutParams((int) (112 * dp), (int) (112 * dp));
        ap.topMargin = (int) (32 * dp);
        top.addView(avatar, ap);

        TextView name = text(who, 30, Color.WHITE, true);
        LinearLayout.LayoutParams np = new LinearLayout.LayoutParams(-2, -2);
        np.topMargin = (int) (24 * dp);
        top.addView(name, np);

        String title = d.get("title");
        if (title != null && !title.isEmpty()) top.addView(text(title, 17, 0xFFA1A1AA, false));

        LinearLayout buttons = new LinearLayout(this);
        buttons.setOrientation(LinearLayout.HORIZONTAL);
        buttons.setGravity(Gravity.CENTER);
        buttons.addView(button(R.string.decline, 0xFFDC2626, R.drawable.ic_hang_up, v -> decline(d)), weight());
        buttons.addView(button(R.string.answer, 0xFF16A34A, R.drawable.ic_call, v -> answer(d)), weight());

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(0xFF09090B);
        int pad = (int) (24 * dp);
        root.setPadding(pad, (int) (96 * dp), pad, (int) (64 * dp));
        root.addView(top, new FrameLayout.LayoutParams(-1, -2, Gravity.TOP));
        root.addView(buttons, new FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM));
        setContentView(root);
    }

    private static LinearLayout.LayoutParams weight() {
        return new LinearLayout.LayoutParams(0, -2, 1);
    }

    private TextView text(String s, int sp, int color, boolean bold) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextSize(sp);
        t.setTextColor(color);
        t.setGravity(Gravity.CENTER);
        if (bold) t.setTypeface(Typeface.DEFAULT_BOLD);
        return t;
    }

    private View button(int label, int color, int icon, View.OnClickListener click) {
        float dp = getResources().getDisplayMetrics().density;
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setGravity(Gravity.CENTER_HORIZONTAL);

        ImageView round = new ImageView(this);
        round.setImageResource(icon);
        round.setColorFilter(Color.WHITE);
        int p = (int) (20 * dp);
        round.setPadding(p, p, p, p);
        GradientDrawable bg = new GradientDrawable();
        bg.setShape(GradientDrawable.OVAL);
        bg.setColor(color);
        round.setBackground(bg);
        round.setContentDescription(getString(label));
        round.setOnClickListener(click);
        box.addView(round, new LinearLayout.LayoutParams((int) (76 * dp), (int) (76 * dp)));

        TextView t = text(getString(label), 15, Color.WHITE, false);
        LinearLayout.LayoutParams tp = new LinearLayout.LayoutParams(-2, -2);
        tp.topMargin = (int) (10 * dp);
        box.addView(t, tp);
        return box;
    }

    private void answer(Map<String, String> d) {
        startActivity(MainActivity.answerIntent(this, d));
        finish();
    }

    private void decline(Map<String, String> d) {
        Intent no = Ringer.with(new Intent(this, CallActionReceiver.class).setAction(CallActionReceiver.DECLINE), d);
        sendBroadcast(no);
        finish();
    }
}
