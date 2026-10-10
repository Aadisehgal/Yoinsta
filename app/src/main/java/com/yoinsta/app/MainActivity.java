package com.yoinsta.app;

import android.content.ActivityNotFoundException;
import android.content.ContentValues;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;
import androidx.browser.customtabs.CustomTabsIntent;
import androidx.core.content.ContextCompat;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;

public class MainActivity extends AppCompatActivity {

    // The deployed site. Only this host loads inside the app; every other link opens outside it.
    private static final String WEB_APP_URL = "https://yoinsta.vercel.app";
    private static final String APP_HOST = "yoinsta.vercel.app";

    // Google refuses sign-in inside an embedded WebView ("This browser or app may not be
    // secure"), so any Google account page is handed to a real browser (Chrome Custom Tab).
    private static final String[] GOOGLE_AUTH_HOSTS = { "accounts.google.com" };

    // Sign-in state that has to survive the trip to Chrome (and the app being killed meanwhile).
    private static final String PREFS = "yoinsta_native";
    private static final String KEY_VERIFIER = "login_verifier";
    private static final String KEY_STARTED_AT = "login_started_at";
    private static final long LOGIN_WINDOW_MS = 10 * 60 * 1000L;

    private WebView webView;
    private RewardedAdManager rewardedAdManager;
    private boolean reloadOnResume = false;

    // <input type="file"> support (thumbnail upload on the Videos page).
    private ValueCallback<Uri[]> filePathCallback;
    private ActivityResultLauncher<Intent> fileChooserLauncher;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Draw edge-to-edge on every Android version (Android 15 forces it anyway), then pad
        // the root by the system bars / keyboard so the site's top bar isn't hidden under them.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        setContentView(R.layout.activity_main);
        setUpWindowInsets();

        rewardedAdManager = new RewardedAdManager(this);
        rewardedAdManager.preload();

        // Must be registered before the activity starts, so it lives in onCreate.
        fileChooserLauncher = registerForActivityResult(
            new ActivityResultContracts.StartActivityForResult(),
            result -> {
                Uri[] picked = WebChromeClient.FileChooserParams.parseResult(
                    result.getResultCode(), result.getData());
                if (filePathCallback != null) {
                    filePathCallback.onReceiveValue(picked); // null = cancelled
                    filePathCallback = null;
                }
            });

        webView = findViewById(R.id.webView);
        webView.setBackgroundColor(ContextCompat.getColor(this, R.color.yoinsta_ink));
        configureWebView();

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (webView.canGoBack()) {
                    webView.goBack();
                } else {
                    setEnabled(false);
                    getOnBackPressedDispatcher().onBackPressed();
                }
            }
        });

        boolean handled = false;
        if (savedInstanceState == null) {
            handled = handleDeepLink(getIntent());
        } else {
            handled = webView.restoreState(savedInstanceState) != null;
        }
        if (!handled) {
            webView.loadUrl(WEB_APP_URL);
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleDeepLink(intent);
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        webView.saveState(outState);
    }

    @Override
    protected void onResume() {
        super.onResume();
        webView.onResume();
        if (reloadOnResume) {
            // Came back from Chrome after connecting YouTube: refresh so the new state shows.
            reloadOnResume = false;
            webView.reload();
        }
    }

    @Override
    protected void onPause() {
        // Persist the session cookie right away so a swiped-away app doesn't log the user out.
        CookieManager.getInstance().flush();
        webView.onPause();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        webView.destroy();
        super.onDestroy();
    }

    // ---------------------------------------------------------------- window / webview setup

    private void setUpWindowInsets() {
        FrameLayout root = findViewById(R.id.root);
        ViewCompat.setOnApplyWindowInsetsListener(root, (v, insets) -> {
            Insets bars = insets.getInsets(
                WindowInsetsCompat.Type.systemBars()
                    | WindowInsetsCompat.Type.displayCutout()
                    | WindowInsetsCompat.Type.ime());
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            return WindowInsetsCompat.CONSUMED;
        });

        // The site is dark, so use light (white) status / navigation bar icons.
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(getWindow(), root);
        controller.setAppearanceLightStatusBars(false);
        controller.setAppearanceLightNavigationBars(false);
    }

    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);

        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(webView, false);

        webView.addJavascriptInterface(new RewardedAdBridge(), "AndroidAds");
        webView.addJavascriptInterface(new AuthBridge(), "AndroidAuth");

        // Thumbnail "Download" is a data: URL link — WebView ignores it unless we save it ourselves.
        webView.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) -> {
            if (url == null) return;
            if (url.startsWith("data:")) {
                saveDataUrl(url);
            } else {
                openExternally(Uri.parse(url));
            }
        });

        // A plain WebChromeClient also turns on the default alert/confirm dialogs.
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                             FileChooserParams params) {
                if (filePathCallback != null) {
                    filePathCallback.onReceiveValue(null); // drop any chooser still waiting
                }
                filePathCallback = callback;
                try {
                    fileChooserLauncher.launch(params.createIntent());
                } catch (ActivityNotFoundException e) {
                    filePathCallback = null;
                    toast("No file picker found on this device.");
                    return false;
                }
                return true;
            }
        });

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return routeNavigation(request.getUrl());
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    showOfflinePage();
                }
            }
        });
    }

    private void showOfflinePage() {
        String html = "<html><head><meta name='viewport' content='width=device-width,initial-scale=1'></head>"
            + "<body style='margin:0;height:100vh;display:flex;flex-direction:column;align-items:center;"
            + "justify-content:center;background:#0F1320;color:#fff;font-family:sans-serif;text-align:center'>"
            + "<h3>No connection</h3>"
            + "<p style='color:#8A93AD'>Check your internet and try again.</p>"
            + "<a href='" + WEB_APP_URL + "' style='margin-top:12px;background:#F5A524;color:#0F1320;"
            + "padding:12px 28px;border-radius:10px;text-decoration:none;font-weight:600'>Retry</a>"
            + "</body></html>";
        webView.loadDataWithBaseURL(WEB_APP_URL, html, "text/html", "UTF-8", null);
    }

    // ---------------------------------------------------------------- navigation routing

    /** Returns true when the URL was handled outside the WebView. */
    private boolean routeNavigation(Uri uri) {
        String scheme = uri.getScheme();
        if (scheme == null) return false;

        // Local schemes the page itself may use.
        if (scheme.equals("about") || scheme.equals("data") || scheme.equals("blob") || scheme.equals("javascript")) {
            return false;
        }

        if (scheme.equals("http") || scheme.equals("https")) {
            String host = uri.getHost();
            if (APP_HOST.equals(host)) {
                String path = uri.getPath();
                if (path != null && (path.startsWith("/api/youtube/connect") || path.startsWith("/api/instagram/connect"))) {
                    // Google / Instagram sign-in has to happen in a real browser. The connection is saved
                    // on the server, so the app just refreshes when the person comes back.
                    openInCustomTab(uri, true);
                    return true;
                }
                return false; // our own site stays inside the app
            }
            for (String authHost : GOOGLE_AUTH_HOSTS) {
                if (authHost.equals(host)) {
                    openInCustomTab(uri, false);
                    return true;
                }
            }
        }

        // Everything else (YouTube links, mailto:, tel: ...) opens outside the app.
        openExternally(uri);
        return true;
    }

    private void openInCustomTab(Uri uri, boolean reloadWhenBack) {
        try {
            reloadOnResume = reloadWhenBack;
            new CustomTabsIntent.Builder().build().launchUrl(this, uri);
        } catch (ActivityNotFoundException e) {
            reloadOnResume = false;
            toast("No browser found to continue.");
        }
    }

    private void openExternally(Uri uri) {
        String scheme = uri.getScheme();
        boolean allowed = "http".equals(scheme) || "https".equals(scheme)
            || "mailto".equals(scheme) || "tel".equals(scheme);
        if (!allowed) return;
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (ActivityNotFoundException e) {
            toast("No app found to open this link.");
        }
    }

    // ---------------------------------------------------------------- Google sign-in (via Chrome)

    /**
     * Step 1: make a secret verifier, keep it, and open the site's /native/login page in Chrome
     * with only its SHA-256 challenge. Chrome does the Google sign-in; the site then opens
     * yoinsta://auth?code=... which lands in handleDeepLink() below.
     */
    private void beginGoogleLogin() {
        byte[] raw = new byte[32];
        new SecureRandom().nextBytes(raw);
        int flags = Base64.URL_SAFE | Base64.NO_PADDING | Base64.NO_WRAP;
        String verifier = Base64.encodeToString(raw, flags);

        String challenge;
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                .digest(verifier.getBytes(StandardCharsets.US_ASCII));
            challenge = Base64.encodeToString(digest, flags);
        } catch (NoSuchAlgorithmException e) {
            toast("Sign-in isn't available on this device.");
            return;
        }

        getSharedPreferences(PREFS, MODE_PRIVATE).edit()
            .putString(KEY_VERIFIER, verifier)
            .putLong(KEY_STARTED_AT, System.currentTimeMillis())
            .apply();

        Uri url = Uri.parse(WEB_APP_URL + "/native/login").buildUpon()
            .appendQueryParameter("challenge", challenge)
            .build();
        openInCustomTab(url, false);
    }

    /**
     * Step 2: yoinsta://auth?code=... arrived. Pair the code with OUR verifier and let the
     * WebView load the exchange URL — the server sets the session cookie in this WebView.
     * A code that was made for some other sign-in attempt can't be paired with our verifier,
     * so it is rejected by the server.
     */
    private boolean handleDeepLink(Intent intent) {
        Uri data = intent == null ? null : intent.getData();
        if (data == null || !"yoinsta".equals(data.getScheme()) || !"auth".equals(data.getHost())) {
            return false;
        }

        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        String verifier = prefs.getString(KEY_VERIFIER, null);
        long startedAt = prefs.getLong(KEY_STARTED_AT, 0L);
        prefs.edit().remove(KEY_VERIFIER).remove(KEY_STARTED_AT).apply(); // single use

        String code = data.getQueryParameter("code");
        boolean fresh = System.currentTimeMillis() - startedAt <= LOGIN_WINDOW_MS;
        if (code == null || verifier == null || !fresh) {
            toast("Sign-in expired — please try again.");
            return false;
        }

        Uri exchange = Uri.parse(WEB_APP_URL + "/api/native/exchange").buildUpon()
            .appendQueryParameter("code", code)
            .appendQueryParameter("verifier", verifier)
            .build();
        webView.loadUrl(exchange.toString());
        return true;
    }

    // ---------------------------------------------------------------- saving downloads

    private void saveDataUrl(String dataUrl) {
        new Thread(() -> {
            try {
                int comma = dataUrl.indexOf(',');
                if (comma < 0) throw new IOException("Malformed data URL");

                String header = dataUrl.substring(5, comma); // e.g. "image/png;base64"
                if (!header.endsWith(";base64")) throw new IOException("Unsupported data URL");

                String mime = header.substring(0, header.length() - ";base64".length());
                if (mime.isEmpty()) mime = "application/octet-stream";

                byte[] bytes = Base64.decode(dataUrl.substring(comma + 1), Base64.DEFAULT);
                String name = "yoinsta-" + System.currentTimeMillis() + extensionFor(mime);
                String where = writeToDownloads(name, mime, bytes);
                toast("Saved to " + where);
            } catch (IOException | IllegalArgumentException e) {
                toast("Couldn't save the file.");
            }
        }).start();
    }

    private static String extensionFor(String mime) {
        switch (mime) {
            case "image/png":  return ".png";
            case "image/jpeg": return ".jpg";
            case "image/webp": return ".webp";
            default:           return ".bin";
        }
    }

    private String writeToDownloads(String name, String mime, byte[] bytes) throws IOException {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ContentValues values = new ContentValues();
            values.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
            values.put(MediaStore.MediaColumns.MIME_TYPE, mime);
            values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Yoinsta");

            Uri item = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            if (item == null) throw new IOException("Couldn't create the file");
            try (OutputStream out = getContentResolver().openOutputStream(item)) {
                if (out == null) throw new IOException("Couldn't open the file");
                out.write(bytes);
            }
            return "Downloads/Yoinsta";
        }

        // Android 8 / 9: app-specific folder (no storage permission needed).
        File dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
        if (dir == null) throw new IOException("No storage available");
        File file = new File(dir, name);
        try (FileOutputStream out = new FileOutputStream(file)) {
            out.write(bytes);
        }
        return file.getAbsolutePath();
    }

    private void toast(String message) {
        runOnUiThread(() -> Toast.makeText(this, message, Toast.LENGTH_LONG).show());
    }

    // ---------------------------------------------------------------- JavaScript bridges

    /**
     * Exposed to the web app as window.AndroidAds. Contract matches what
     * components/ad-gate.tsx (in the Next.js repo) already expects:
     *   window.AndroidAds.showRewardedAd(nonce)
     *   -> later calls window.onNativeAdResult(nonce, true|false) in the page
     */
    private class RewardedAdBridge {
        @JavascriptInterface
        public void showRewardedAd(final String nonce) {
            runOnUiThread(() -> rewardedAdManager.show(MainActivity.this, nonce, (resultNonce, earned) -> {
                String js = "window.onNativeAdResult && window.onNativeAdResult("
                    + JSONObject.quote(resultNonce) + ", " + earned + ")";
                webView.evaluateJavascript(js, null);
            }));
        }
    }

    /**
     * Exposed as window.AndroidAuth. The login page (app/(auth)/login/page.tsx) calls
     * startGoogleLogin() instead of signIn() when this exists.
     */
    private class AuthBridge {
        @JavascriptInterface
        public void startGoogleLogin() {
            runOnUiThread(MainActivity.this::beginGoogleLogin);
        }
    }
}
