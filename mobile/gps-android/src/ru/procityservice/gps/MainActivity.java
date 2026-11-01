package ru.procityservice.gps;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Одноэкранное приложение: статус трекинга и кнопка включения/остановки.
 * Основной сценарий — запуск из миниаппа «Про» по deep link
 *   procityservice-gps://track?code=XXXX-XXXX
 * Одноразовый код меняется на токен (POST /api/track/session), стартует
 * фоновый сервис — и пользователь возвращается в MAX. Без кода (иконка
 * на экране телефона) приложение само возобновляет трекинг, если его
 * включали раньше и токен ещё жив.
 */
public class MainActivity extends Activity implements TrackService.Listener {
    private static final int REQ_PERMS = 10;
    private static final String[] ALL_PERMS = {
        "android.permission.ACCESS_FINE_LOCATION",
        "android.permission.ACCESS_COARSE_LOCATION",
        "android.permission.POST_NOTIFICATIONS",
    };

    private TextView statusView;
    private TextView coordsView;
    private TextView sentView;
    private Button actionBtn;
    private Button permBtn;
    private Runnable pendingAfterPerms = null;
    private final Handler main = new Handler(Looper.getMainLooper());

    @Override protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        buildUi();
        handleIntent(getIntent());
        refreshUi();
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIntent(intent);
    }

    @Override protected void onResume() {
        super.onResume();
        TrackService.listener = this;
        refreshUi();
    }

    @Override protected void onPause() {
        super.onPause();
        if (TrackService.listener == this) TrackService.listener = null;
    }

    @Override public void onStateChanged() { refreshUi(); }

    private SharedPreferences prefs() {
        return getSharedPreferences("pro_gps", MODE_PRIVATE);
    }

    private boolean missingLocation() {
        return checkSelfPermission("android.permission.ACCESS_FINE_LOCATION")
            != PackageManager.PERMISSION_GRANTED;
    }

    private void handleIntent(Intent intent) {
        Uri data = intent != null ? intent.getData() : null;
        String code = data != null ? data.getQueryParameter("code") : null;
        if (code != null && !code.isEmpty()) {
            if (missingLocation()) {
                pendingAfterPerms = () -> exchangeCode(code);
                requestPerms();
            } else {
                exchangeCode(code);
            }
            return;
        }
        // Обычный запуск (иконка): трекинг возобновляем сами, если его
        // включали и токен ещё жив
        if (!prefs().getBoolean("wanted", false)) return;
        if (prefs().getString("token", "").isEmpty()) return;
        if (missingLocation()) {
            pendingAfterPerms = this::startTracking;
            requestPerms();
            return;
        }
        startTracking();
    }

    // --- разрешения ----------------------------------------------------------

    private void requestPerms() {
        List<String> need = new ArrayList<>();
        for (String p : ALL_PERMS) {
            if (checkSelfPermission(p) != PackageManager.PERMISSION_GRANTED) need.add(p);
        }
        if (need.isEmpty()) {
            Runnable r = pendingAfterPerms;
            pendingAfterPerms = null;
            if (r != null) r.run();
            refreshUi();
            return;
        }
        requestPermissions(need.toArray(new String[0]), REQ_PERMS);
    }

    @Override public void onRequestPermissionsResult(int requestCode,
            String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != REQ_PERMS) return;
        if (missingLocation()) {
            pendingAfterPerms = null;
            refreshUi();
            return;
        }
        Runnable r = pendingAfterPerms;
        pendingAfterPerms = null;
        if (r != null) r.run();
        refreshUi();
    }

    // --- вход по одноразовому коду ------------------------------------------

    private void exchangeCode(final String code) {
        statusView.setText("Проверяю код…");
        statusView.setTextColor(Color.parseColor("#c9c9cf"));
        new Thread(new Runnable() {
            @Override public void run() {
                try {
                    HttpURLConnection c = (HttpURLConnection)
                        new URL(TrackService.API + "/track/session").openConnection();
                    c.setRequestMethod("POST");
                    c.setConnectTimeout(15000);
                    c.setReadTimeout(15000);
                    c.setRequestProperty("Content-Type", "application/json");
                    c.setDoOutput(true);
                    byte[] body = ("{\"code\":\"" + code + "\"}")
                        .getBytes(StandardCharsets.UTF_8);
                    OutputStream os = c.getOutputStream();
                    os.write(body);
                    os.close();
                    int rc = c.getResponseCode();
                    String resp = readAll(rc >= 400 ? c.getErrorStream() : c.getInputStream());
                    c.disconnect();
                    if (rc == 200) {
                        JSONObject d = new JSONObject(resp);
                        String token = d.getString("token");
                        JSONObject ex = d.optJSONObject("executor");
                        int execId = ex != null ? ex.optInt("id", 0) : 0;
                        String name = ex != null
                            ? ex.optString("name", "Исполнитель") : "Исполнитель";
                        if (token.isEmpty() || execId == 0) throw new Exception("bad response");
                        prefs().edit()
                            .putString("token", token)
                            .putInt("exec_id", execId)
                            .putString("exec_name", name)
                            .putBoolean("wanted", true)
                            .apply();
                        main.post(new Runnable() {
                            @Override public void run() {
                                statusView.setText("Код принят — стартую…");
                                startTracking();
                                refreshUi();
                            }
                        });
                    } else {
                        final String msg = (rc == 400 || rc == 401)
                            ? "Код недействителен или истёк"
                            : "Сервер ответил " + rc;
                        main.post(new Runnable() {
                            @Override public void run() {
                                statusView.setText(msg);
                                statusView.setTextColor(Color.parseColor("#ff6961"));
                            }
                        });
                    }
                } catch (Exception e) {
                    main.post(new Runnable() {
                        @Override public void run() {
                            statusView.setText("Нет связи с сервером — попробуйте ещё раз");
                            statusView.setTextColor(Color.parseColor("#ff6961"));
                        }
                    });
                }
            }
        }).start();
    }

    private static String readAll(InputStream in) throws Exception {
        if (in == null) return "";
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[4096];
        int n;
        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        in.close();
        return new String(out.toByteArray(), StandardCharsets.UTF_8);
    }

    // --- сервис ---------------------------------------------------------------

    private void startTracking() {
        Intent i = new Intent(this, TrackService.class);
        if (Build.VERSION.SDK_INT >= 26) startForegroundService(i);
        else startService(i);
    }

    private void onAction() {
        if (TrackService.running) {
            prefs().edit().putBoolean("wanted", false).apply();
            stopService(new Intent(this, TrackService.class));
            TrackService.lastError = "";
            refreshUi();
            return;
        }
        if (prefs().getString("token", "").isEmpty()) {
            statusView.setText("Откройте «Про» и нажмите «Включить GPS»");
            statusView.setTextColor(Color.parseColor("#ffd60a"));
            return;
        }
        if (missingLocation()) {
            pendingAfterPerms = this::startTracking;
            requestPerms();
            return;
        }
        startTracking();
    }

    // --- UI -------------------------------------------------------------------

    private void buildUi() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        int pad = dp(24);
        root.setPadding(pad, dp(48), pad, dp(24));
        root.setBackgroundColor(Color.parseColor("#17181c"));

        TextView title = new TextView(this);
        title.setText("Про GPS");
        title.setTextSize(24);
        title.setTextColor(Color.parseColor("#f2f2f7"));
        title.setTypeface(null, Typeface.BOLD);
        root.addView(title);

        TextView sub = new TextView(this);
        sub.setText("Передача координат на сервер «Про»");
        sub.setTextSize(13);
        sub.setTextColor(Color.parseColor("#98989e"));
        sub.setPadding(0, dp(4), 0, dp(20));
        root.addView(sub);

        statusView = new TextView(this);
        statusView.setTextSize(17);
        statusView.setTypeface(null, Typeface.BOLD);
        statusView.setPadding(0, 0, 0, dp(14));
        root.addView(statusView);

        coordsView = new TextView(this);
        coordsView.setText("Координаты: —");
        coordsView.setTextSize(14);
        coordsView.setTextColor(Color.parseColor("#c9c9cf"));
        coordsView.setPadding(0, 0, 0, dp(4));
        root.addView(coordsView);

        sentView = new TextView(this);
        sentView.setText("Отправлено: 0");
        sentView.setTextSize(14);
        sentView.setTextColor(Color.parseColor("#c9c9cf"));
        sentView.setPadding(0, 0, 0, dp(24));
        root.addView(sentView);

        actionBtn = new Button(this);
        styleBtn(actionBtn, true);
        actionBtn.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { onAction(); }
        });
        root.addView(actionBtn, matchWrap());

        permBtn = new Button(this);
        permBtn.setText("Разрешить доступ к геолокации");
        styleBtn(permBtn, false);
        permBtn.setVisibility(View.GONE);
        permBtn.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) {
                pendingAfterPerms = MainActivity.this::startTracking;
                requestPerms();
            }
        });
        root.addView(permBtn, matchWrap());

        TextView hint = new TextView(this);
        hint.setText("Приложение передаёт координаты в фоне — можно закрывать «Про». "
            + "Остановите трекинг кнопкой выше.");
        hint.setTextSize(12);
        hint.setTextColor(Color.parseColor("#98989e"));
        hint.setPadding(0, dp(20), 0, 0);
        root.addView(hint);

        setContentView(root);
    }

    private LinearLayout.LayoutParams matchWrap() {
        return new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT);
    }

    private void styleBtn(Button b, boolean primary) {
        GradientDrawable bg = new GradientDrawable();
        bg.setCornerRadius(dp(14));
        if (primary) {
            bg.setColor(Color.parseColor("#2f7bff"));
        } else {
            bg.setColor(Color.TRANSPARENT);
            bg.setStroke(dp(1), Color.parseColor("#3a3a41"));
        }
        b.setBackground(bg);
        b.setAllCaps(false);
        b.setTextColor(Color.parseColor(primary ? "#ffffff" : "#c9c9cf"));
        b.setTextSize(16);
        b.setPadding(dp(16), dp(14), dp(16), dp(14));
        LinearLayout.LayoutParams lp = matchWrap();
        lp.bottomMargin = dp(10);
        b.setLayoutParams(lp);
    }

    private void refreshUi() {
        boolean running = TrackService.running;
        String err = TrackService.lastError;
        boolean sessionGone = err != null && err.contains("устарела");
        if (missingLocation()) {
            statusView.setText("Нет доступа к геолокации");
            statusView.setTextColor(Color.parseColor("#ff6961"));
            permBtn.setVisibility(View.VISIBLE);
            actionBtn.setVisibility(View.GONE);
        } else if (running && sessionGone) {
            statusView.setText(err);
            statusView.setTextColor(Color.parseColor("#ff6961"));
            permBtn.setVisibility(View.GONE);
            actionBtn.setVisibility(View.VISIBLE);
            actionBtn.setText("Включить");
        } else if (running) {
            String text = (err != null && !err.isEmpty()) ? err : "Координаты передаются";
            statusView.setText(text);
            statusView.setTextColor(
                Color.parseColor((err != null && !err.isEmpty()) ? "#ffd60a" : "#30d158"));
            permBtn.setVisibility(View.GONE);
            actionBtn.setVisibility(View.VISIBLE);
            actionBtn.setText("Остановить");
        } else {
            statusView.setText(sessionGone ? err : "Трекинг выключен");
            statusView.setTextColor(
                Color.parseColor(sessionGone ? "#ff6961" : "#98989e"));
            permBtn.setVisibility(View.GONE);
            actionBtn.setVisibility(View.VISIBLE);
            actionBtn.setText("Включить");
        }
        if (running && TrackService.lastSentAt > 0) {
            coordsView.setText(String.format(Locale.getDefault(),
                "Координаты: %.5f, %.5f", TrackService.lastLat, TrackService.lastLon));
        } else {
            coordsView.setText("Координаты: —");
        }
        sentView.setText("Отправлено: " + TrackService.sentCount);
    }

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }
}
