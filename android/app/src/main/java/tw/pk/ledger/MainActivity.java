package tw.pk.ledger;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // 自寫的小工具橋接（第七批）要在 super.onCreate 之前登記
        registerPlugin(LedgerWidgetPlugin.class);
        // 3.5 雲端備份的 Google 授權
        registerPlugin(CloudAuthPlugin.class);
        super.onCreate(savedInstanceState);
        // 2.3：冷啟動時點小工具、通知欄按鈕 → 先記著，網頁端準備好後會來領。系統還原畫面時不重複處理
        if (savedInstanceState == null) handleNavIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        // App 在背景時點了小工具、通知欄按鈕：通知網頁端去對應的畫面
        handleNavIntent(intent);
    }

    private void handleNavIntent(Intent intent) {
        if (intent == null) return;
        String target = intent.getStringExtra(LedgerWidgetProvider.EXTRA_NAV);
        if (target == null) return;
        intent.removeExtra(LedgerWidgetProvider.EXTRA_NAV);
        // 點通知本體（home）只是打開 App，不用跳頁
        if (target.equals("entry") || target.equals("todo") || target.equals("detail") || target.equals("search")) {
            LedgerWidgetPlugin.notifyNav(target);
        }
    }
}
