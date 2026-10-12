package com.seatcare.worker;
import android.content.Context;
import android.util.AtomicFile;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.*;

final class SensorHistory {
    private final AtomicFile file;private JSONObject records=new JSONObject();private long lastSecond=-1,lastSlot=-1,lastSave=0;
    SensorHistory(Context context){file=new AtomicFile(new File(context.getFilesDir(),"sensor-history.json"));try{records=new JSONObject(new String(file.readFully(),StandardCharsets.UTF_8));}catch(Exception ignored){}}
    private String date(long at){return new SimpleDateFormat("yyyy-MM-dd",Locale.US).format(new Date(at));}
    void sample(long at,double[] values,String device){
        if(at/1000<=lastSecond)return;lastSecond=at/1000;
        try{String key=date(at);JSONObject record=records.optJSONObject(key);if(record==null){record=new JSONObject();record.put("date",key);JSONArray hours=new JSONArray();for(int i=0;i<24;i++){JSONObject h=new JSONObject();for(String k:SensorLogic.KEYS)h.put(k,0);hours.put(h);}record.put("hours",hours);record.put("frames",new JSONArray());records.put(key,record);}
            Calendar calendar=Calendar.getInstance();calendar.setTimeInMillis(at);JSONObject bucket=record.getJSONArray("hours").getJSONObject(calendar.get(Calendar.HOUR_OF_DAY));String state=SensorLogic.KEYS[SensorLogic.assess(values)];bucket.put(state,bucket.optInt(state)+1);
            if(at/5000!=lastSlot){lastSlot=at/5000;JSONObject frame=new JSONObject().put("at",at).put("device",device).put("source","sensor");frame.put("values",values==null?JSONObject.NULL:new JSONArray(values));record.getJSONArray("frames").put(frame);}
            if(at-lastSave>=5000){lastSave=at;save();}
        }catch(JSONException ignored){}
    }
    JSONObject get(){return records;}
    void save(){
        try{Calendar c=Calendar.getInstance();c.add(Calendar.DAY_OF_YEAR,-89);String cutoff=date(c.getTimeInMillis());c=Calendar.getInstance();c.add(Calendar.DAY_OF_YEAR,-6);String framesCutoff=date(c.getTimeInMillis());List<String> keys=new ArrayList<>();records.keys().forEachRemaining(keys::add);for(String key:keys){if(key.compareTo(cutoff)<0)records.remove(key);else if(key.compareTo(framesCutoff)<0)records.getJSONObject(key).put("frames",new JSONArray());}
            FileOutputStream out=null;try{out=file.startWrite();out.write(records.toString().getBytes(StandardCharsets.UTF_8));file.finishWrite(out);}catch(Exception e){if(out!=null)file.failWrite(out);SeatSensorPlugin.emit(new com.getcapacitor.JSObject().put("type","error").put("message","기록을 저장하지 못했어요. 기기 저장 공간을 확인해 주세요."));}
        }catch(JSONException ignored){}
    }
}
