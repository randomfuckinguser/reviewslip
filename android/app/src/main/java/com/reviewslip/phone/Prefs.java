package com.reviewslip.phone;

import android.content.Context;
import android.content.SharedPreferences;

/** The little the app remembers: its Firebase token, and which phone it opens on. */
final class Prefs {
    private Prefs() {}

    private static SharedPreferences of(Context c) {
        return c.getSharedPreferences("phone", Context.MODE_PRIVATE);
    }

    static String token(Context c) {
        return of(c).getString("token", "");
    }

    static void setToken(Context c, String token) {
        of(c).edit().putString("token", token).apply();
    }

    static String home(Context c) {
        return of(c).getString("home", "venues");
    }

    static void setHome(Context c, String phone) {
        of(c).edit().putString("home", phone).apply();
    }

    /** The phone page for a ring: a venue's line, or Reviewslip's own. */
    static String phoneUrl(String phone) {
        return BuildConfig.SITE + ("reviewslip".equals(phone) ? "/phone/reviewslip/" : "/phone/");
    }
}
