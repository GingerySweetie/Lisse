package com.gingery.wisteria;

import com.getcapacitor.BridgeActivity;
import com.gingery.wisteria.plugins.StepCounterPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(StepCounterPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
