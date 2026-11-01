package ru.procityservice.gps;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

/**
 * Автозапуск фонового трекинга после перезагрузки телефона:
 * если водитель включал слежение (wanted) и токен ещё жив —
 * сервис поднимается сам, без открытия приложений.
 */
public class BootReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context ctx, Intent intent) {
        if (intent == null || !Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) return;
        SharedPreferences p = ctx.getSharedPreferences("pro_gps", Context.MODE_PRIVATE);
        if (!p.getBoolean("wanted", false)) return;
        if (p.getString("token", "").isEmpty()) return;
        Intent i = new Intent(ctx, TrackService.class);
        if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(i);
        else ctx.startService(i);
    }
}
