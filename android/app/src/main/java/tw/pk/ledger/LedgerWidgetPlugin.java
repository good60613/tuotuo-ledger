package tw.pk.ledger;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * 橋接（第七批）：App 網頁端呼叫 update(json)，這裡把小工具要顯示的內容存進手機，
 * 並叫桌面上所有拖拖記帳小工具立刻重畫。內容的格式見 src/widget.ts 的 WidgetSnapshot。
 *
 * 2.3：點小工具（條碼區以外）要開「新增記帳」。
 * - App 已經開著：MainActivity 收到後呼叫 notifyOpenEntry，網頁端收到 openEntry 事件。
 * - App 是冷啟動：這時網頁端還沒準備好，先記在 pendingEntry，網頁端準備好後用 takePending 領走。
 */
@CapacitorPlugin(name = "LedgerWidget")
public class LedgerWidgetPlugin extends Plugin {

    private static LedgerWidgetPlugin instance;
    private static boolean pendingEntry = false;

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

    /** 網頁端準備好後呼叫：有沒有「還沒處理的開記帳要求」（領走就清掉） */
    @PluginMethod
    public void takePending(PluginCall call) {
        JSObject r = new JSObject();
        r.put("entry", pendingEntry);
        pendingEntry = false;
        call.resolve(r);
    }

    /** MainActivity 收到「從小工具打開」時呼叫；網頁端還沒載入就先記著 */
    static void notifyOpenEntry() {
        if (instance != null) instance.fireOpenEntry();
        else pendingEntry = true;
    }

    private void fireOpenEntry() {
        notifyListeners("openEntry", new JSObject(), true);
    }
}
