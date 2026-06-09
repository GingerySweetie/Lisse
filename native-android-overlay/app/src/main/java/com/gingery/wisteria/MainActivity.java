package com.gingery.wisteria;

import android.content.Intent;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Plugin;
import com.gingery.wisteria.plugins.ShareIntentPlugin;
import com.gingery.wisteria.plugins.SleepPlugin;
import com.gingery.wisteria.plugins.StepCounterPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(StepCounterPlugin.class);
        registerPlugin(SleepPlugin.class);
        registerPlugin(ShareIntentPlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        // Forward warm-start shares to ShareIntentPlugin so it can fire the
        // shareReceived event to the web layer.
        Plugin p = getBridge().getPlugin("ShareIntent").getInstance();
        if (p instanceof ShareIntentPlugin) {
            ((ShareIntentPlugin) p).handleNewIntent(intent);
        }
    }
}
