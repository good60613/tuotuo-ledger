package tw.pk.ledger;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * 通知欄快捷列（2.3）的重畫時機：手機重開機、App 更新後、午夜跨日、時區或時間被改。
 * 只是用存起來的最新內容重新發出通知（見 QuickBar.refresh），不使用前景服務。
 */
public class QuickBarReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context ctx, Intent intent) {
        if (intent == null || intent.getAction() == null) return;
        QuickBar.refresh(ctx);
    }
}
