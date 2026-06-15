package com.gingery.wisteria.plugins

import android.annotation.SuppressLint
import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.text.InputType
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.view.inputmethod.EditorInfo
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.app.AlertDialog
import org.json.JSONArray
import org.json.JSONException

/**
 * In-app browser host. Built programmatically (no layout XML) and
 * declared as singleTask in the manifest so the user can switch out and
 * back without losing WebView state — solves the "CC tunnel reconnects
 * every time I switch apps" problem.
 *
 * Capabilities:
 *   - persistent cookies (CookieManager default store)
 *   - JavaScript + DOM storage on
 *   - custom UA (intent extra "ua")
 *   - auto-inject scripts (intent extra "autoInjects": JSON list of
 *     {pattern, code}) — applied in onPageFinished when current URL
 *     contains pattern
 *   - manual inject via toolbar button: list of saved bookmarklets +
 *     free-form JS pad
 *
 * Hands off the heavy UI to native Android views so it feels like a
 * native browser, not a web overlay.
 */
class InAppBrowserActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var urlBar: EditText
    private lateinit var progress: ProgressBar
    private var autoInjects: JSONArray = JSONArray()
    private var savedScripts: JSONArray = JSONArray()

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE)
        // Status-bar / nav-bar light theme so toolbar text is readable.
        window.statusBarColor = Color.parseColor("#f5eef8")

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.WHITE)
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            )
        }

        root.addView(buildToolbar())
        root.addView(buildProgress())
        root.addView(buildWebView())

        setContentView(root)

        // Parse intent extras.
        val initialUrl = intent.getStringExtra("url") ?: "about:blank"
        intent.getStringExtra("ua")?.let { webView.settings.userAgentString = it }
        intent.getStringExtra("autoInjects")?.let {
            try { autoInjects = JSONArray(it) } catch (_: JSONException) {}
        }
        intent.getStringExtra("savedScripts")?.let {
            try { savedScripts = JSONArray(it) } catch (_: JSONException) {}
        }

        urlBar.setText(initialUrl)
        webView.loadUrl(initialUrl)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        // singleTask: a second open() while we're already running. Replace
        // the WebView's URL but keep the Activity alive (preserves cookies +
        // back/forward stack semantics within session).
        intent.getStringExtra("url")?.let {
            urlBar.setText(it)
            webView.loadUrl(it)
        }
        intent.getStringExtra("autoInjects")?.let { s ->
            try { autoInjects = JSONArray(s) } catch (_: JSONException) {}
        }
        intent.getStringExtra("savedScripts")?.let { s ->
            try { savedScripts = JSONArray(s) } catch (_: JSONException) {}
        }
    }

    override fun onBackPressed() {
        if (webView.canGoBack()) webView.goBack() else super.onBackPressed()
    }

    private fun buildToolbar(): View {
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setBackgroundColor(Color.parseColor("#f5eef8"))
            setPadding(dp(6), dp(6), dp(6), dp(6))
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
            )
        }
        row.addView(iconBtn("‹") { if (webView.canGoBack()) webView.goBack() })
        row.addView(iconBtn("›") { if (webView.canGoForward()) webView.goForward() })
        row.addView(iconBtn("↻") { webView.reload() })

        urlBar = EditText(this).apply {
            inputType = InputType.TYPE_TEXT_VARIATION_URI or InputType.TYPE_CLASS_TEXT
            imeOptions = EditorInfo.IME_ACTION_GO
            setSingleLine()
            setBackgroundColor(Color.parseColor("#ffffff"))
            setPadding(dp(10), dp(6), dp(10), dp(6))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
            setTextColor(Color.parseColor("#4a4458"))
            layoutParams = LinearLayout.LayoutParams(
                0,
                ViewGroup.LayoutParams.WRAP_CONTENT,
                1f,
            ).apply {
                leftMargin = dp(4); rightMargin = dp(4)
            }
            setOnEditorActionListener { _, actionId, _ ->
                if (actionId == EditorInfo.IME_ACTION_GO ||
                    actionId == EditorInfo.IME_ACTION_DONE
                ) {
                    val raw = text.toString().trim()
                    val url = if (raw.startsWith("http")) raw else "https://$raw"
                    webView.loadUrl(url)
                    clearFocus()
                    true
                } else false
            }
        }
        row.addView(urlBar)

        row.addView(iconBtn("</>") { showInjectMenu() })
        row.addView(iconBtn("✕") { finish() })
        return row
    }

    private fun buildProgress(): View {
        progress = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
            isIndeterminate = false
            max = 100
            progress = 0
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(2),
            )
        }
        return progress
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun buildWebView(): View {
        val container = FrameLayout(this).apply {
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                0,
                1f,
            )
        }
        webView = WebView(this).apply {
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                databaseEnabled = true
                cacheMode = WebSettings.LOAD_DEFAULT
                loadWithOverviewMode = true
                useWideViewPort = true
                @Suppress("DEPRECATION")
                builtInZoomControls = true
                displayZoomControls = false
                allowFileAccess = false
                allowContentAccess = false
                mediaPlaybackRequiresUserGesture = false
                mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
            }
            CookieManager.getInstance().apply {
                setAcceptCookie(true)
                setAcceptThirdPartyCookies(this@apply, true)
            }
            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(
                    view: WebView?,
                    request: WebResourceRequest?,
                ): Boolean = false  // load all inside this WebView
                override fun onPageStarted(
                    view: WebView?, url: String?, favicon: android.graphics.Bitmap?
                ) {
                    urlBar.setText(url ?: "")
                    progress.visibility = View.VISIBLE
                }
                override fun onPageFinished(view: WebView?, url: String?) {
                    progress.visibility = View.GONE
                    if (url != null) applyAutoInjects(url)
                }
            }
            webChromeClient = object : WebChromeClient() {
                override fun onProgressChanged(view: WebView?, newProgress: Int) {
                    progress.progress = newProgress
                }
                override fun onReceivedTitle(view: WebView?, title: String?) {
                    title?.let { this@InAppBrowserActivity.title = it }
                }
            }
            layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            )
        }
        container.addView(webView)
        return container
    }

    private fun applyAutoInjects(url: String) {
        for (i in 0 until autoInjects.length()) {
            val rule = autoInjects.optJSONObject(i) ?: continue
            val pattern = rule.optString("pattern")
            if (pattern.isNotEmpty() && url.contains(pattern, ignoreCase = true)) {
                val code = rule.optString("code")
                if (code.isNotEmpty()) webView.evaluateJavascript(code, null)
            }
        }
    }

    private fun showInjectMenu() {
        if (savedScripts.length() == 0) {
            showInjectDialog(null)
            return
        }
        val names = arrayOfNulls<String>(savedScripts.length() + 1)
        for (i in 0 until savedScripts.length()) {
            names[i] = savedScripts.optJSONObject(i)?.optString("name") ?: "(无名)"
        }
        names[names.size - 1] = "… 自定义 JS"
        AlertDialog.Builder(this)
            .setTitle("注入脚本")
            .setItems(names) { _, which ->
                if (which == names.size - 1) {
                    showInjectDialog(null)
                } else {
                    val code = savedScripts.optJSONObject(which)?.optString("code") ?: ""
                    runScript(code)
                }
            }
            .setNegativeButton("取消", null)
            .show()
    }

    private fun showInjectDialog(prefill: String?) {
        val edit = EditText(this).apply {
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_MULTI_LINE
            minLines = 4
            maxLines = 12
            hint = "粘贴 JS / bookmarklet …"
            setText(prefill ?: "")
        }
        val padded = FrameLayout(this).apply {
            setPadding(dp(16), dp(8), dp(16), dp(8))
            addView(edit)
        }
        AlertDialog.Builder(this)
            .setTitle("自定义 JS")
            .setView(padded)
            .setPositiveButton("跑") { _, _ ->
                runScript(edit.text.toString())
            }
            .setNegativeButton("取消", null)
            .show()
    }

    private fun runScript(raw: String) {
        var code = raw.trim()
        if (code.isEmpty()) return
        // Bookmarklets typically start with javascript: — strip that.
        if (code.startsWith("javascript:", ignoreCase = true)) {
            code = code.substring("javascript:".length)
        }
        webView.evaluateJavascript(code) { result ->
            val msg = if (result == null || result == "null") "✓ 注入完成"
                      else "✓ 返回: ${result.take(60)}"
            Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()
        }
    }

    private fun iconBtn(label: String, onClick: () -> Unit): View {
        return TextView(this).apply {
            text = label
            gravity = Gravity.CENTER
            setTextColor(Color.parseColor("#6f5990"))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
            setPadding(dp(10), dp(4), dp(10), dp(4))
            isClickable = true
            isFocusable = true
            setOnClickListener { onClick() }
        }
    }

    private fun dp(v: Int): Int =
        (v * resources.displayMetrics.density).toInt()
}
