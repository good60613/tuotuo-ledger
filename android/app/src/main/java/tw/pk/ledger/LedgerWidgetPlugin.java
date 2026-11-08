package tw.pk.ledger;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * 橋接（第七批）：App 網頁端呼叫 update(json)，這裡把小工具要顯示的內容存進手機，
 * 並叫桌面上所有拖拖記帳小工具立刻重畫。點了小工具時，通知網頁端回首頁（openHome 事件）。
 * 內容的格式見 src/widget.ts 的 WidgetSnapshot。
 */
@CapacitorPlugin(name = "LedgerWidget")
public class LedgerWidgetPlugin extends Plugin {

    private static LedgerWidgetPlugin instance;

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

    /** MainActivity 收到「從小工具打開」時呼叫 */
    static void notifyOpenHome() {
        if (instance != null) instance.fireOpenHome();
    }

    private void fireOpenHome() {
        notifyListeners("openHome", new JSObject(), true);
    }
}
