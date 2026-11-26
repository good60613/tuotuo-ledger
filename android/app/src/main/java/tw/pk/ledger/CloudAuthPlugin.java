package tw.pk.ledger;

import android.app.Activity;
import androidx.activity.result.ActivityResult;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.IntentSenderRequest;
import androidx.activity.result.contract.ActivityResultContracts;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.auth.api.identity.AuthorizationClient;
import com.google.android.gms.auth.api.identity.AuthorizationRequest;
import com.google.android.gms.auth.api.identity.AuthorizationResult;
import com.google.android.gms.auth.api.identity.Identity;
import com.google.android.gms.common.api.ApiException;
import com.google.android.gms.common.api.Scope;
import java.util.Collections;

/**
 * 3.5 雲端備份：用 Android 內建的 Google 授權拿 access token（只要「App 專用隱藏區」這一個權限）。
 *
 * - authorize({ scope, interactive })：
 *   使用者同意過 → 直接拿到 token（背景、不跳畫面），這就是 APK 版的「自動重連」。
 *   還沒同意 → interactive=true 時跳出 Google 的同意畫面；interactive=false 時丟 NEED_INTERACTION。
 * - Google 靠「套件名稱＋簽章指紋」認這個 App：Google Cloud 專案裡要登記一組 Android 用戶端（見 文件/雲端備份設定.md）。
 */
@CapacitorPlugin(name = "CloudAuth")
public class CloudAuthPlugin extends Plugin {

    private ActivityResultLauncher<IntentSenderRequest> consentLauncher;
    /** 正在等同意畫面結果的那一次呼叫（同一時間只會有一個） */
    private PluginCall waiting;

    @Override
    public void load() {
        // 要在畫面啟動前登記（Capacitor 在 MainActivity.onCreate 裡載入外掛，時間點剛好）
        consentLauncher = getActivity().registerForActivityResult(
            new ActivityResultContracts.StartIntentSenderForResult(),
            this::onConsentResult
        );
    }

    @PluginMethod
    public void authorize(PluginCall call) {
        String scope = call.getString("scope");
        boolean interactive = Boolean.TRUE.equals(call.getBoolean("interactive", false));
        if (scope == null) {
            call.reject("缺少 scope");
            return;
        }
        AuthorizationRequest req = AuthorizationRequest.builder()
            .setRequestedScopes(Collections.singletonList(new Scope(scope)))
            .build();
        Identity.getAuthorizationClient(getActivity())
            .authorize(req)
            .addOnSuccessListener(result -> {
                if (!result.hasResolution()) {
                    resolveToken(call, result);
                    return;
                }
                if (!interactive || result.getPendingIntent() == null) {
                    call.reject("需要使用者同意", "NEED_INTERACTION");
                    return;
                }
                if (waiting != null) waiting.reject("cancelled", "CANCELLED");
                waiting = call;
                consentLauncher.launch(new IntentSenderRequest.Builder(result.getPendingIntent().getIntentSender()).build());
            })
            .addOnFailureListener(e -> call.reject("Google 授權失敗：" + e.getMessage(), "FAILED", e));
    }

    private void onConsentResult(ActivityResult r) {
        PluginCall call = waiting;
        waiting = null;
        if (call == null) return;
        if (r.getResultCode() != Activity.RESULT_OK || r.getData() == null) {
            call.reject("cancelled", "CANCELLED");
            return;
        }
        try {
            AuthorizationClient client = Identity.getAuthorizationClient(getActivity());
            resolveToken(call, client.getAuthorizationResultFromIntent(r.getData()));
        } catch (ApiException e) {
            call.reject("Google 授權失敗：" + e.getMessage(), "FAILED", e);
        }
    }

    private void resolveToken(PluginCall call, AuthorizationResult result) {
        String token = result.getAccessToken();
        if (token == null) {
            call.reject("Google 沒有給授權", "FAILED");
            return;
        }
        JSObject ret = new JSObject();
        ret.put("accessToken", token);
        call.resolve(ret);
    }
}
