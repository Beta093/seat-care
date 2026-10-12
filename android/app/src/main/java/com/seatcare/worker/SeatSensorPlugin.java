package com.seatcare.worker;
import android.Manifest;
import android.os.Build;
import android.content.Intent;
import androidx.core.content.ContextCompat;
import androidx.core.app.NotificationManagerCompat;
import com.getcapacitor.*;
import com.getcapacitor.annotation.*;
import java.lang.ref.WeakReference;

@CapacitorPlugin(name="SeatSensor",permissions={
 @Permission(alias="bluetooth",strings={Manifest.permission.BLUETOOTH_SCAN,Manifest.permission.BLUETOOTH_CONNECT}),
 @Permission(alias="location",strings={Manifest.permission.ACCESS_FINE_LOCATION}),
 @Permission(alias="notifications",strings={Manifest.permission.POST_NOTIFICATIONS})
})
public class SeatSensorPlugin extends Plugin {
 private static WeakReference<SeatSensorPlugin> current=new WeakReference<>(null);
 @Override public void load(){current=new WeakReference<>(this);}
 static void emit(JSObject event){SeatSensorPlugin p=current.get();if(p!=null)p.getActivity().runOnUiThread(()->p.notifyListeners("sensor",event));}
 @PluginMethod public void connect(PluginCall call){String code=call.getString("code","");if(!code.matches("[0-9A-Fa-f]{6}")){call.reject("기기 코드 6자리를 입력해 주세요.");return;}String alias=Build.VERSION.SDK_INT>=31?"bluetooth":"location";if(getPermissionState(alias)!=PermissionState.GRANTED){requestPermissionForAlias(alias,call,"afterBluetooth");return;}start(call);}
 @PermissionCallback private void afterBluetooth(PluginCall call){String alias=Build.VERSION.SDK_INT>=31?"bluetooth":"location";if(getPermissionState(alias)!=PermissionState.GRANTED){call.reject("Bluetooth 권한이 필요해요.");return;}start(call);}
 private void start(PluginCall call){try{Intent intent=new Intent(getContext(),SeatSensorService.class).putExtra("code",call.getString("code","").toUpperCase());ContextCompat.startForegroundService(getContext(),intent);call.resolve();}catch(Exception e){call.reject("감지를 시작하지 못했어요. 앱을 열고 다시 연결해 주세요.");}}
 @PluginMethod public void disconnect(PluginCall call){SeatSensorService service=SeatSensorService.instance;if(service!=null)service.stopMonitoring();call.resolve();}
 @PluginMethod public void command(PluginCall call){SeatSensorService service=SeatSensorService.instance;if(service==null){call.reject("방석을 먼저 연결해 주세요.");return;}getActivity().runOnUiThread(()->{try{service.command(call.getString("command",""));call.resolve();}catch(Exception e){call.reject(e.getMessage());}});}
 @PluginMethod public void getState(PluginCall call){getActivity().runOnUiThread(()->{SeatSensorService s=SeatSensorService.instance;call.resolve(s==null?new JSObject().put("type","connection").put("connected",false):s.snapshot());});}
 @PluginMethod public void getHistory(PluginCall call){getActivity().runOnUiThread(()->{SensorHistory h=SeatSensorService.instance==null?new SensorHistory(getContext()):SeatSensorService.instance.history;call.resolve(new JSObject().put("records",h.get()));});}
 @PluginMethod public void enableNotifications(PluginCall call){if(Build.VERSION.SDK_INT>=33&&getPermissionState("notifications")!=PermissionState.GRANTED){requestPermissionForAlias("notifications",call,"afterNotifications");return;}afterNotifications(call);}
 @PermissionCallback private void afterNotifications(PluginCall call){call.resolve(new JSObject().put("granted",NotificationManagerCompat.from(getContext()).areNotificationsEnabled()));}
 @PluginMethod public void testNotification(PluginCall call){if(!NotificationManagerCompat.from(getContext()).areNotificationsEnabled()){call.reject("먼저 휴대폰 알림을 허용해 주세요.");return;}SeatSensorService.notifyUser(getContext(),"Seat Care · 테스트","알림이 이렇게 표시됩니다. 실제 자세 경고가 아니에요.");call.resolve();}
}
