package ru.procityservice.gps;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * Фоновый трекинг геопозиции: foreground-сервис с постоянным уведомлением
 * слушает GPS (сеть — запасной источник) и шлёт координаты на сервер «Про»
 * тем же API, что и PWA-страница трекинга:
 *   POST /api/executors/{id}/position  {"lat":…, "lon":…}  Bearer-токен,
 * не чаще одного раза в 5 секунд (частота GPS — раз в 4 секунды). 401 от сервера означает истёкшую
 * сессию — сервис гаснет и просит запросить новый код в миниаппе.
 */
public class TrackService extends Service {
    public static final String API = "https://procityservice.ru/api";
    private static final String CHANNEL_ID = "gps";
    private static final int NOTIF_ID = 1;
    private static final long SEND_INTERVAL_MS = 5_000;

    public static volatile boolean running = false;
    public static volatile double lastLat = 0;
    public static volatile double lastLon = 0;
    public static volatile int sentCount = 0;
    public static volatile long lastSentAt = 0;
    public static volatile String lastError = "";

    public interface Listener { void onStateChanged(); }
    public static volatile Listener listener = null;

    private LocationManager lm;
    private final Handler main = new Handler(Looper.getMainLooper());
    private long lastAttemptAt = 0;

    private final LocationListener locListener = new LocationListener() {
        @Override public void onLocationChanged(Location location) {
            lastLat = location.getLatitude();
            lastLon = location.getLongitude();
            notifyUi();
            long now = System.currentTimeMillis();
            if (now - lastAttemptAt >= SEND_INTERVAL_MS) {
                lastAttemptAt = now;
                send(lastLat, lastLon);
            }
        }
        @Override public void onProviderEnabled(String provider) {}
        @Override public void onProviderDisabled(String provider) {}
    };

    @Override public void onCreate() {
        super.onCreate();
        createChannel();
        running = true;
        startAsForeground("Запуск…");
        lm = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
        startUpdates();
        notifyUi();
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        running = true;
        prefs().edit().putBoolean("wanted", true).apply();
        startAsForeground("Координаты передаются");
        startUpdates();
        notifyUi();
        return START_STICKY;
    }

    @Override public void onDestroy() {
        if (lm != null) {
            try { lm.removeUpdates(locListener); } catch (Exception ignored) {}
        }
        running = false;
        notifyUi();
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent intent) { return null; }

    private SharedPreferences prefs() {
        return getSharedPreferences("pro_gps", MODE_PRIVATE);
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = new NotificationChannel(
                CHANNEL_ID, "Передача координат", NotificationManager.IMPORTANCE_LOW);
            ch.setShowBadge(false);
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.createNotificationChannel(ch);
        }
    }

    private Notification buildNotification(String text) {
        Notification.Builder b = Build.VERSION.SDK_INT >= 26
            ? new Notification.Builder(this, CHANNEL_ID)
            : new Notification.Builder(this);
        return b
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setContentTitle("Про GPS")
            .setContentText(text)
            .setOngoing(true)
            .setPriority(Notification.PRIORITY_LOW)
            .build();
    }

    private void startAsForeground(String text) {
        Notification n = buildNotification(text);
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
        } else {
            startForeground(NOTIF_ID, n);
        }
    }

    private void updateNotification(String text) {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.notify(NOTIF_ID, buildNotification(text));
    }

    private void startUpdates() {
        if (lm == null) return;
        try {
            if (checkSelfPermission("android.permission.ACCESS_FINE_LOCATION")
                    != PackageManager.PERMISSION_GRANTED) {
                lastError = "Нет доступа к геолокации";
                return;
            }
            lm.requestLocationUpdates(LocationManager.GPS_PROVIDER,
                4000, 0, locListener, Looper.getMainLooper());
            lm.requestLocationUpdates(LocationManager.NETWORK_PROVIDER,
                10000, 0, locListener, Looper.getMainLooper());
        } catch (Exception e) {
            lastError = "Ошибка геолокации";
        }
    }

    private void send(final double lat, final double lon) {
        new Thread(new Runnable() {
            @Override public void run() {
                SharedPreferences p = prefs();
                String token = p.getString("token", "");
                int execId = p.getInt("exec_id", 0);
                if (token.isEmpty() || execId == 0) return;
                try {
                    HttpURLConnection c = (HttpURLConnection)
                        new URL(API + "/executors/" + execId + "/position").openConnection();
                    c.setRequestMethod("POST");
                    c.setConnectTimeout(15000);
                    c.setReadTimeout(15000);
                    c.setRequestProperty("Content-Type", "application/json");
                    c.setRequestProperty("Authorization", "Bearer " + token);
                    c.setDoOutput(true);
                    byte[] body = ("{\"lat\":" + lat + ",\"lon\":" + lon + "}")
                        .getBytes(StandardCharsets.UTF_8);
                    OutputStream os = c.getOutputStream();
                    os.write(body);
                    os.close();
                    int rc = c.getResponseCode();
                    drain(rc >= 400 ? c.getErrorStream() : c.getInputStream());
                    c.disconnect();
                    if (rc == 200) {
                        sentCount++;
                        lastSentAt = System.currentTimeMillis();
                        lastError = "";
                        updateNotification("Последняя отправка " + time(lastSentAt));
                        notifyUi();
                    } else if (rc == 401) {
                        lastError = "Сессия устарела — откройте «Про» и нажмите «Включить GPS»";
                        p.edit().putBoolean("wanted", false).apply();
                        stopSelf();
                        notifyUi();
                    } else {
                        lastError = "Сервер ответил " + rc + " — повторю";
                        notifyUi();
                    }
                } catch (Exception e) {
                    lastError = "Нет связи — повторю";
                    notifyUi();
                }
            }
        }).start();
    }

    private static void drain(InputStream in) {
        if (in == null) return;
        try {
            byte[] buf = new byte[2048];
            while (in.read(buf) > 0) { /* читаем до конца, чтобы соединение закрылось */ }
            in.close();
        } catch (Exception ignored) {}
    }

    private static String time(long ms) {
        return new SimpleDateFormat("HH:mm:ss", Locale.getDefault()).format(new Date(ms));
    }

    private void notifyUi() {
        if (listener == null) return;
        main.post(new Runnable() {
            @Override public void run() {
                Listener l = listener;
                if (l != null) l.onStateChanged();
            }
        });
    }
}
