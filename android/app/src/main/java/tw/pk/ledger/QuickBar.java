package tw.pk.ledger;

import android.Manifest;
import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.view.View;
import android.widget.RemoteViews;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;
import org.json.JSONObject;

/**
 * 通知欄快捷列（2.3 段6）。
 * 兩排：第一排 剩餘可用｜今日支出｜今日收入；第二排按鈕 待辦｜明細｜搜尋｜記一筆。
 * - 低優先、無聲、不震動的常駐通知；不使用前景服務。使用者滑掉後，下次開 App（網頁端會重送）或手機重開機時重新發出。
 * - 數字由網頁端用首頁同一套算法算好送來（LedgerWidgetPlugin.updateBar），這裡不做任何計算，
 *   只判斷「跨日」：今天不是那份數字的日期 → 今日支出、今日收入顯示 0。午夜用 AlarmManager 叫醒一次重畫。
 * - 縮起來只看得到第一排數字；展開才有第二排按鈕（Android 縮起來的通知高度有限）。
 * - 顏色全部放在 res/values/notification_colors.xml（深色模式另有 values-night 一份），版面不用 ?android:attr：
 *   通知是在 App 的淺色佈景裡畫的，用系統文字色在深色通知欄會變成深灰字貼深色底。
 * - 鎖定畫面隱藏金額開啟時，鎖定畫面只顯示「拖拖記帳　已隱藏金額」，沒有任何數字。
 */
final class QuickBar {
    private QuickBar() {}

    static final String CHANNEL_ID = "quick_bar";
    static final int NOTIFICATION_ID = 2301;
    static final String ACTION_MIDNIGHT = "tw.pk.ledger.BAR_MIDNIGHT";

    private static final String PREFS = "ledger_widget";
    private static final String KEY = "bar";

    static void saveSnapshot(Context ctx, String json) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, json).apply();
    }

    private static JSONObject readSnapshot(Context ctx) {
        SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String json = p.getString(KEY, null);
        if (json == null) return null;
        try {
            JSONObject o = new JSONObject(json);
            return o.optInt("v", 0) == 1 ? o : null;
        } catch (Exception e) {
            return null;
        }
    }

    /** 有沒有通知權限（Android 13 以上要使用者允許；13 以下一律有） */
    static boolean hasPermission(Context ctx) {
        if (Build.VERSION.SDK_INT < 33) return true;
        return ctx.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
    }

    /** 依最新存的內容發出（或收掉）通知，並排好午夜的重畫。開機、更新 App、午夜、網頁端送來新數字時都走這裡 */
    static void refresh(Context ctx) {
        JSONObject s = readSnapshot(ctx);
        if (s == null || !s.optBoolean("enabled", false)) {
            cancel(ctx);
            return;
        }
        post(ctx, s);
        scheduleMidnight(ctx);
    }

    static void cancel(Context ctx) {
        try {
            NotificationManagerCompat.from(ctx).cancel(NOTIFICATION_ID);
        } catch (Exception ignored) {
            // 取消失敗不影響其他功能
        }
        cancelMidnight(ctx);
    }

    private static void ensureChannel(Context ctx) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        if (nm == null || nm.getNotificationChannel(CHANNEL_ID) != null) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL_ID, ctx.getString(R.string.nb_channel_name), NotificationManager.IMPORTANCE_LOW);
        ch.setDescription(ctx.getString(R.string.nb_channel_desc));
        ch.setSound(null, null);
        ch.enableVibration(false);
        ch.enableLights(false);
        ch.setShowBadge(false);
        nm.createNotificationChannel(ch);
    }

    private static PendingIntent navIntent(Context ctx, String target, int code) {
        Intent i = new Intent(ctx, MainActivity.class);
        i.setAction(Intent.ACTION_MAIN);
        i.addCategory(Intent.CATEGORY_LAUNCHER);
        i.putExtra(LedgerWidgetProvider.EXTRA_NAV, target);
        i.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(ctx, code, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static void fillNumbers(RemoteViews v, JSONObject s) {
        String today = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
        boolean dayStale = !today.equals(s.optString("day", ""));
        String zero = s.optString("zero", "$0");
        String left = s.optString("left", "—");
        // 負數：改顯示紅色那顆（顏色在 res/values*/notification_colors.xml，深色模式用較亮的紅）；
        // 不在這裡設色，系統切換淺色／深色時顏色才會自己跟著換
        boolean neg = s.optBoolean("leftNeg", false);
        v.setTextViewText(R.id.nb_left, left);
        v.setTextViewText(R.id.nb_left_neg, left);
        v.setViewVisibility(R.id.nb_left, neg ? View.GONE : View.VISIBLE);
        v.setViewVisibility(R.id.nb_left_neg, neg ? View.VISIBLE : View.GONE);
        v.setTextViewText(R.id.nb_expense, dayStale ? zero : s.optString("todayExpense", "—"));
        v.setTextViewText(R.id.nb_income, dayStale ? zero : s.optString("todayIncome", "—"));
    }

    private static void post(Context ctx, JSONObject s) {
        if (!hasPermission(ctx)) return;
        ensureChannel(ctx);

        RemoteViews small = new RemoteViews(ctx.getPackageName(), R.layout.nb_small);
        RemoteViews big = new RemoteViews(ctx.getPackageName(), R.layout.nb_big);
        fillNumbers(small, s);
        fillNumbers(big, s);
        big.setOnClickPendingIntent(R.id.nb_btn_todo, navIntent(ctx, "todo", 11));
        big.setOnClickPendingIntent(R.id.nb_btn_detail, navIntent(ctx, "detail", 12));
        big.setOnClickPendingIntent(R.id.nb_btn_search, navIntent(ctx, "search", 13));
        big.setOnClickPendingIntent(R.id.nb_btn_entry, navIntent(ctx, "entry", 14));

        boolean hide = s.optBoolean("hideOnLock", true);

        // 鎖定畫面的版本：沒有任何數字
        NotificationCompat.Builder pub = new NotificationCompat.Builder(ctx, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_ledger)
            .setContentTitle(ctx.getString(R.string.nb_public_title))
            .setContentText(ctx.getString(R.string.nb_public_text))
            .setShowWhen(false)
            .setSilent(true);

        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_ledger)
            .setStyle(new NotificationCompat.DecoratedCustomViewStyle())
            .setCustomContentView(small)
            .setCustomBigContentView(big)
            .setContentIntent(navIntent(ctx, "home", 10))
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_STATUS)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setShowWhen(false)
            .setLocalOnly(true)
            .setVisibility(hide ? NotificationCompat.VISIBILITY_PRIVATE : NotificationCompat.VISIBILITY_PUBLIC);
        if (hide) b.setPublicVersion(pub.build());

        try {
            NotificationManagerCompat.from(ctx).notify(NOTIFICATION_ID, b.build());
        } catch (SecurityException ignored) {
            // 沒有通知權限：不發
        }
    }

    // ---- 午夜重畫 ----

    private static PendingIntent midnightIntent(Context ctx) {
        Intent i = new Intent(ctx, QuickBarReceiver.class);
        i.setAction(ACTION_MIDNIGHT);
        return PendingIntent.getBroadcast(ctx, 2, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** 排下一次本地午夜（+3 秒）的重畫；用不精準的鬧鐘，不需要特別權限，差幾分鐘沒關係 */
    private static void scheduleMidnight(Context ctx) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        Calendar c = Calendar.getInstance();
        c.add(Calendar.DAY_OF_YEAR, 1);
        c.set(Calendar.HOUR_OF_DAY, 0);
        c.set(Calendar.MINUTE, 0);
        c.set(Calendar.SECOND, 3);
        c.set(Calendar.MILLISECOND, 0);
        try {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, c.getTimeInMillis(), midnightIntent(ctx));
        } catch (Exception ignored) {
            // 排不到鬧鐘：開 App 時網頁端還是會重送
        }
    }

    private static void cancelMidnight(Context ctx) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am != null) am.cancel(midnightIntent(ctx));
    }
}
