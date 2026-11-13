package tw.pk.ledger;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.Resources;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.os.Build;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.view.View;
import android.widget.RemoteViews;
import android.widget.Toast;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * 桌面小工具 3×2（第七批）。
 * 上半：手機載具條碼（粗細條紋由網頁端算好，這裡只畫）；未設定時顯示提示。
 * 下半：剩餘可用（大）、今日支出、本月支出；角落 App 圖示。
 * 2.3：點條碼區＝把載具碼（含開頭的「/」）複製到剪貼簿＋輕震動，不開 App；點其他地方＝打開 App 的新增記帳畫面（支出）。
 * 數字由網頁端用首頁同一套算法算好、格式化後送來（LedgerWidgetPlugin），這裡不做任何計算，
 * 只判斷「過期」：今天不是那份數字的日期 → 今日支出顯示 0；到了下一期 → 本月顯示「—」。
 * 外觀數值：res/values/widget_dimens.xml、res/values/widget_colors.xml。
 */
public class LedgerWidgetProvider extends AppWidgetProvider {

    /** 點小工具其他地方：開 App 的新增記帳（2.3；以前是回首頁） */
    static final String EXTRA_NAV = "tw.pk.ledger.NAV";
    /** 點條碼區：複製載具碼 */
    static final String ACTION_COPY_CARRIER = "tw.pk.ledger.COPY_CARRIER";
    private static final String PREFS = "ledger_widget";
    private static final String KEY = "snapshot";

    static void saveSnapshot(Context ctx, String json) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, json).apply();
    }

    /** 叫桌面上所有拖拖記帳小工具重畫 */
    static void updateAll(Context ctx) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, LedgerWidgetProvider.class));
        for (int id : ids) render(ctx, mgr, id);
    }

    @Override
    public void onReceive(Context ctx, Intent intent) {
        if (intent != null && ACTION_COPY_CARRIER.equals(intent.getAction())) {
            copyCarrier(ctx);
            return;
        }
        super.onReceive(ctx, intent);
    }

    /** 把載具碼（含開頭的「/」）放進剪貼簿，輕震動一下。Android 13 以上系統自己會提示，12 以下才補一個小提示 */
    private static void copyCarrier(Context ctx) {
        JSONObject s = readSnapshot(ctx);
        String carrier = s == null ? "" : s.optString("carrier", "");
        if (carrier.isEmpty()) return;
        ClipboardManager cm = (ClipboardManager) ctx.getSystemService(Context.CLIPBOARD_SERVICE);
        if (cm == null) return;
        cm.setPrimaryClip(ClipData.newPlainText(ctx.getString(R.string.widget_code_desc), carrier));
        buzz(ctx);
        if (Build.VERSION.SDK_INT < 33) {
            Toast.makeText(ctx, ctx.getString(R.string.widget_copied), Toast.LENGTH_SHORT).show();
        }
    }

    private static void buzz(Context ctx) {
        try {
            Vibrator vib = (Vibrator) ctx.getSystemService(Context.VIBRATOR_SERVICE);
            if (vib == null || !vib.hasVibrator()) return;
            vib.vibrate(VibrationEffect.createOneShot(25, VibrationEffect.DEFAULT_AMPLITUDE));
        } catch (Exception ignored) {
            // 震動失敗不影響複製
        }
    }

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) render(ctx, mgr, id);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context ctx, AppWidgetManager mgr, int id, Bundle newOptions) {
        render(ctx, mgr, id);
    }

    private static void render(Context ctx, AppWidgetManager mgr, int id) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_ledger);
        Resources res = ctx.getResources();

        // 點其他地方：打開 App 的新增記帳（App 已在背景時，MainActivity 會叫網頁端開記帳畫面）
        Intent open = new Intent(ctx, MainActivity.class);
        open.setAction(Intent.ACTION_MAIN);
        open.addCategory(Intent.CATEGORY_LAUNCHER);
        open.putExtra(EXTRA_NAV, "entry");
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(ctx, 0, open,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        v.setOnClickPendingIntent(R.id.widget_root, pi);

        // 點條碼區：複製載具碼（交給自己的接收器，不開 App）
        Intent copy = new Intent(ctx, LedgerWidgetProvider.class);
        copy.setAction(ACTION_COPY_CARRIER);
        v.setOnClickPendingIntent(R.id.widget_code_box,
            PendingIntent.getBroadcast(ctx, 1, copy, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));

        JSONObject s = readSnapshot(ctx);
        if (s == null) {
            // 還沒開過 App（或資料格式看不懂）
            v.setViewVisibility(R.id.widget_code_box, View.GONE);
            v.setViewVisibility(R.id.widget_code_hint, View.VISIBLE);
            v.setTextViewText(R.id.widget_code_hint, res.getString(R.string.widget_no_data));
            v.setTextViewText(R.id.widget_left, "—");
            v.setTextViewText(R.id.widget_today, "—");
            v.setTextViewText(R.id.widget_month, "—");
            v.setViewVisibility(R.id.widget_stale, View.GONE);
            mgr.updateAppWidget(id, v);
            return;
        }

        // ---- 上半：載具條碼 ----
        JSONArray bars = s.optJSONArray("bars");
        String carrier = s.optString("carrier", "");
        Bitmap code = (bars != null && bars.length() > 0) ? drawBarcode(ctx, mgr, id, bars, s.optInt("quiet", 10)) : null;
        if (code != null) {
            v.setViewVisibility(R.id.widget_code_box, View.VISIBLE);
            v.setViewVisibility(R.id.widget_code_hint, View.GONE);
            v.setImageViewBitmap(R.id.widget_code, code);
            v.setTextViewText(R.id.widget_code_text, carrier);
        } else {
            v.setViewVisibility(R.id.widget_code_box, View.GONE);
            v.setViewVisibility(R.id.widget_code_hint, View.VISIBLE);
            v.setTextViewText(R.id.widget_code_hint, res.getString(R.string.widget_no_carrier));
        }

        // ---- 下半：金額（過期判斷）----
        String today = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
        boolean dayStale = !today.equals(s.optString("day", ""));
        boolean periodStale = today.compareTo(s.optString("periodEnd", "")) >= 0;
        v.setTextViewText(R.id.widget_left, s.optString("left", "—"));
        v.setTextColor(R.id.widget_left, res.getColor(s.optBoolean("leftNeg", false) ? R.color.widget_negative : R.color.widget_text, null));
        v.setTextViewText(R.id.widget_today, dayStale ? s.optString("zero", "0") : s.optString("todayExpense", "—"));
        v.setTextViewText(R.id.widget_month, periodStale ? "—" : s.optString("monthExpense", "—"));
        v.setViewVisibility(R.id.widget_stale, (dayStale || periodStale) ? View.VISIBLE : View.GONE);

        mgr.updateAppWidget(id, v);
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

    /**
     * 畫 Code 39 條碼：細條取整數像素，讓條紋邊緣清楚（掃描槍比較好讀）。
     * 寬度依小工具實際寬度算出能用的最大細條寬；畫不下就回傳 null。
     */
    private static Bitmap drawBarcode(Context ctx, AppWidgetManager mgr, int id, JSONArray bars, int quiet) {
        Resources res = ctx.getResources();
        float density = res.getDisplayMetrics().density;
        Bundle opt = mgr.getAppWidgetOptions(id);
        int widthDp = opt != null ? opt.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0) : 0;
        if (widthDp <= 0) widthDp = res.getInteger(R.integer.widget_fallback_width_dp);
        float pad = res.getDimension(R.dimen.widget_padding) * 2 + res.getDimension(R.dimen.widget_code_box_padding) * 2;
        int availPx = (int) (widthDp * density - pad);

        int modules = quiet * 2;
        for (int i = 0; i < bars.length(); i++) modules += bars.optInt(i, 1);
        int narrow = Math.max(1, availPx / modules);
        int maxNarrow = (int) (res.getDimension(R.dimen.widget_code_max_narrow));
        if (maxNarrow > 0) narrow = Math.min(narrow, maxNarrow);
        int w = modules * narrow;
        int h = (int) res.getDimension(R.dimen.widget_code_height);
        if (w <= 0 || h <= 0) return null;

        Bitmap bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(bmp);
        c.drawColor(Color.WHITE);
        Paint black = new Paint();
        black.setColor(Color.BLACK);
        black.setAntiAlias(false);
        int x = quiet * narrow;
        for (int i = 0; i < bars.length(); i++) {
            int bw = bars.optInt(i, 1) * narrow;
            if (i % 2 == 0) c.drawRect(x, 0, x + bw, h, black);
            x += bw;
        }
        return bmp;
    }
}
