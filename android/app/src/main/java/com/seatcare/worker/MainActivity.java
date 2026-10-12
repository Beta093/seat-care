package com.seatcare.worker;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
public class MainActivity extends BridgeActivity {
 @Override public void onCreate(Bundle savedInstanceState){registerPlugin(SeatSensorPlugin.class);super.onCreate(savedInstanceState);}
}
