package tw.pk.ledger;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // 自寫的小工具橋接（第七批）要在 super.onCreate 之前登記
        registerPlugin(LedgerWidgetPlugin.class);
        super.onCreate(savedInstanceState);
        // 2.3：冷啟動時點小工具 → 先記著，網頁端準備好後會來領。系統還原畫面時不重複處理
        if (savedInstanceState == null) handleWidgetIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        // App 在背景時點了小工具：通知網頁端開新增記帳
        handleWidgetIntent(intent);
    }

    private void handleWidgetIntent(Intent intent) {
        if (intent != null && intent.getBooleanExtra(LedgerWidgetProvider.EXTRA_FROM_WIDGET, false)) {
            intent.removeExtra(LedgerWidgetProvider.EXTRA_FROM_WIDGET);
            LedgerWidgetPlugin.notifyOpenEntry();
        }
    }
}
