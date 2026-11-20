package tw.pk.ledger;

import android.Manifest;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * 橋接（第七批）：App 網頁端呼叫 update(json)，這裡把小工具要顯示的內容存進手機，
 * 並叫桌面上所有拖拖記帳小工具立刻重畫。內容的格式見 src/widget.ts 的 WidgetSnapshot。
 *
 * 2.3：
 * - updateBar：通知欄快捷列的內容（BarSnapshot），存起來後發出或收掉通知。
 * - requestNotifPermission：Android 13 以上向使用者要通知權限。
 * - 點小工具（條碼區以外）、通知欄按鈕要去哪（entry／todo／detail／search）：
 *   App 已經開著 → notifyNav 發 openNav 事件；冷啟動 → 網頁端還沒準備好，先記在 pendingTarget，之後用 takePending 領走。
 */
@CapacitorPlugin(
    name = "LedgerWidget",
    permissions = { @Permission(strings = { Manifest.permission.POST_NOTIFICATIONS }, alias = "notifications") }
)
public class LedgerWidgetPlugin extends Plugin {

    private static LedgerWidgetPlugin instance;
    private static String pendingTarget = null;

    @Override
    public void load() {
        instance = this;
    }

    @PluginMethod
    public void update(PluginCall call) {
        String json = call.getString("json");
        if (json == null) {
            call.reject("缺少小工具資料");
            return;
        }
        LedgerWidgetProvider.saveSnapshot(getContext(), json);
        LedgerWidgetProvider.updateAll(getContext());
        call.resolve();
    }

    @PluginMethod
    public void updateBar(PluginCall call) {
        String json = call.getString("json");
        if (json == null) {
            call.reject("缺少通知欄資料");
            return;
        }
        QuickBar.saveSnapshot(getContext(), json);
        QuickBar.refresh(getContext());
        call.resolve();
    }

    @PluginMethod
    public void requestNotifPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT < 33 || getPermissionState("notifications") == PermissionState.GRANTED) {
            resolveGranted(call, true);
            return;
        }
        requestPermissionForAlias("notifications", call, "notifPermissionResult");
    }

    @PermissionCallback
    private void notifPermissionResult(PluginCall call) {
        resolveGranted(call, getPermissionState("notifications") == PermissionState.GRANTED);
    }

    private void resolveGranted(PluginCall call, boolean granted) {
        JSObject r = new JSObject();
        r.put("granted", granted);
        call.resolve(r);
    }

    /**
     * 2.5：換手機桌面的 App 圖示。AndroidManifest 裡每種圖示是一個「入口別名」（activity-alias），
     * 打開選中的那個、關掉其他的。DONT_KILL_APP＝不強制關 App（但有些手機桌面還是會重整、把舊圖示從桌面拿掉）。
     */
    @PluginMethod
    public void setAppIcon(PluginCall call) {
        String name = call.getString("name", "original");
        String[] all = { "original", "cry", "happy", "shock", "cool", "love", "note" };
        boolean known = false;
        for (String n : all) if (n.equals(name)) known = true;
        if (!known) {
            call.reject("不認識的圖示：" + name);
            return;
        }
        android.content.pm.PackageManager pm = getContext().getPackageManager();
        String pkg = getContext().getPackageName();
        // 先打開新的，再關舊的：中間不會出現「桌面上一個圖示都沒有」
        pm.setComponentEnabledSetting(new android.content.ComponentName(pkg, pkg + ".Icon_" + name),
            android.content.pm.PackageManager.COMPONENT_ENABLED_STATE_ENABLED, android.content.pm.PackageManager.DONT_KILL_APP);
        for (String n : all) {
            if (n.equals(name)) continue;
            pm.setComponentEnabledSetting(new android.content.ComponentName(pkg, pkg + ".Icon_" + n),
                android.content.pm.PackageManager.COMPONENT_ENABLED_STATE_DISABLED, android.content.pm.PackageManager.DONT_KILL_APP);
        }
        call.resolve();
    }

    /** 網頁端準備好後呼叫：有沒有「還沒處理的要求」（領走就清掉） */
    @PluginMethod
    public void takePending(PluginCall call) {
        JSObject r = new JSObject();
        r.put("target", pendingTarget);
        pendingTarget = null;
        call.resolve(r);
    }

    /** MainActivity 收到「從小工具、通知欄打開」時呼叫；網頁端還沒載入就先記著 */
    static void notifyNav(String target) {
        if (instance != null) instance.fireNav(target);
        else pendingTarget = target;
    }

    private void fireNav(String target) {
        JSObject r = new JSObject();
        r.put("target", target);
        notifyListeners("openNav", r, true);
    }
}
