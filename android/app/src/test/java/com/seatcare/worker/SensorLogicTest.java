package com.seatcare.worker;
import org.junit.Test;import static org.junit.Assert.*;
public class SensorLogicTest {
 @Test public void upstreamVectors(){assertEquals(0,SensorLogic.assess(new double[]{100,100,100,100,100}));assertEquals(1,SensorLogic.assess(new double[]{220,80,220,80,100}));assertEquals(2,SensorLogic.assess(new double[]{80,220,80,220,100}));assertEquals(3,SensorLogic.assess(new double[]{220,220,70,70,70}));assertEquals(4,SensorLogic.assess(new double[]{70,70,200,200,200}));assertEquals(5,SensorLogic.assess(new double[]{5,5,5,5,5}));assertEquals(6,SensorLogic.assess(null));}
 @Test public void continuityAndCooldown(){SensorLogic t=new SensorLogic();for(long at=0;at<3000;at+=50)assertFalse(t.update(1,at,true));assertTrue(t.update(1,3000,true));assertFalse(t.update(1,4000,true));assertFalse(t.update(2,7000,true));assertFalse(t.update(2,11000,true));assertFalse(t.update(2,14000,false));}
 @Test public void malformedPackets(){assertNull(SensorLogic.parse("P:1,2,3,4,"));assertNull(SensorLogic.parse("P:1,2,3,4,-1"));assertNull(SensorLogic.parse("P:1,2,3,4,65536"));assertNotNull(SensorLogic.parse("P:1,2,3,4,5"));}
}
