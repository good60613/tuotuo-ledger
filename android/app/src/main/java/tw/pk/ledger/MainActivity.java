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
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        // App 在背景時點了小工具：通知網頁端回首頁（第一次打開本來就在首頁，不用處理）
        if (intent != null && intent.getBooleanExtra(LedgerWidgetProvider.EXTRA_FROM_WIDGET, false)) {
            LedgerWidgetPlugin.notifyOpenHome();
        }
    }
}
