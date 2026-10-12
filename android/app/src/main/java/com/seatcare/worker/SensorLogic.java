package com.seatcare.worker;

import java.util.HashMap;
import java.util.Map;

/** Port of upstream 3ddc5ec, MIT © 2026 MinSup Kim. See vendor license. */
public final class SensorLogic {
    public static final String[] LABELS={"기준 범위","왼쪽 쏠림","오른쪽 쏠림","앞쪽 쏠림","뒤쪽 쏠림","미착석","미측정"};
    public static final String[] KEYS={"center","left","right","front","back","away","unavailable"};
    public static String guidance(int lean) {
        if(lean==3)return "가능한 범위에서 엉덩이를 뒤로 옮겨 주세요.";
        if(lean==4)return "편안한 범위에서 상체를 세워 주세요.";
        return "가능한 범위에서 몸을 중앙 쪽으로 옮겨 주세요.";
    }
    public static double[] parse(String packet) {
        if(!packet.startsWith("P:"))return null;
        String[] parts=packet.substring(2).trim().split(",",-1);if(parts.length!=5)return null;
        double[] values=new double[5];
        try{for(int i=0;i<5;i++){if(!parts[i].trim().matches("\\d+(?:\\.\\d+)?"))return null;values[i]=Double.parseDouble(parts[i]);if(!Double.isFinite(values[i])||values[i]<0||values[i]>65535)return null;}}catch(Exception e){return null;}
        return values;
    }
    public static int assess(double[] v) {
        if(v==null||v.length!=5)return 6;
        double total=0;for(double x:v){if(!Double.isFinite(x)||x<0||x>65535)return 6;total+=x;}if(total<125)return 5;
        double left=(v[0]+v[2])/2,right=(v[1]+v[3])/2,front=(v[0]+v[1])/2,back=(v[2]+v[3]+v[4])/3;
        double lateral=(right-left)/Math.max(1,right+left),longitudinal=(front-back)/Math.max(1,front+back),ls=(v[0]+v[2])/total,rs=(v[1]+v[3])/total;
        boolean edge=ls>=.5||rs>=.5,side=Math.abs(lateral)>=.14||edge,fore=Math.abs(longitudinal)>=.20;
        if(!side&&!fore)return 0;
        if(side&&(!fore||Math.abs(lateral)>=Math.abs(longitudinal)))return (edge?rs>ls:lateral>0)?2:1;
        return longitudinal>0?3:4;
    }
    private int candidate=-1;private long since=0,last=-1;private final Map<Integer,Long> sent=new HashMap<>();
    public void reset(){candidate=-1;since=0;last=-1;}
    public boolean update(int lean,long now,boolean ready){
        if(!ready||lean==0||lean>=5){reset();return false;}
        if(last>=0&&(now-last>=2000||now<last))reset();last=now;
        if(candidate!=lean){candidate=lean;since=now;return false;}
        if(now-since<3000||now-sent.getOrDefault(lean,-60000L)<60000)return false;
        sent.put(lean,now);return true;
    }
}
