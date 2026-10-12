import UIKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        _ = SeatSensorOwner.shared // Register CoreBluetooth restoration before the WebView loads.
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default Configuration",
                                          sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }
}

// Native BLE owner. Upstream posture rules: MIT © 2026 MinSup Kim, commit 3ddc5ec.
// Runs independently of WebView timers. See vendor/esp32_telecommunication/LICENSE.
import CoreBluetooth
import UserNotifications

struct SensorRules {
    static let keys = ["center", "left", "right", "front", "back", "away", "unavailable"]
    static let labels = ["기준 범위", "왼쪽 쏠림", "오른쪽 쏠림", "앞쪽 쏠림", "뒤쪽 쏠림", "미착석", "미측정"]
    static func parse(_ text: String) -> [Double]? {
        guard text.hasPrefix("P:") else { return nil }
        let parts = text.dropFirst(2).split(separator: ",", omittingEmptySubsequences: false)
        guard parts.count == 5 else { return nil }
        let values = parts.compactMap { part -> Double? in
            let p = String(part).trimmingCharacters(in: .whitespaces)
            guard p.range(of: #"^\d+(?:\.\d+)?$"#, options: .regularExpression) != nil,
                  let v = Double(p), v.isFinite, v >= 0, v <= 65535 else { return nil }
            return v
        }
        return values.count == 5 ? values : nil
    }
    static func assess(_ v: [Double]?) -> Int {
        guard let v = v, v.count == 5, v.allSatisfy({ $0.isFinite && $0 >= 0 && $0 <= 65535 }) else { return 6 }
        let total = v.reduce(0, +)
        if total < 125 { return 5 }
        let left = (v[0]+v[2])/2, right = (v[1]+v[3])/2
        let front = (v[0]+v[1])/2, back = (v[2]+v[3]+v[4])/3
        let lateral = (right-left)/max(1,right+left), longitudinal = (front-back)/max(1,front+back)
        let ls = (v[0]+v[2])/total, rs = (v[1]+v[3])/total
        let edge = ls >= 0.5 || rs >= 0.5, side = abs(lateral) >= 0.14 || edge, fore = abs(longitudinal) >= 0.20
        if !side && !fore { return 0 }
        if side && (!fore || abs(lateral) >= abs(longitudinal)) { return (edge ? rs > ls : lateral > 0) ? 2 : 1 }
        return longitudinal > 0 ? 3 : 4
    }
    static func guidance(_ lean: Int) -> String {
        if lean == 3 { return "가능한 범위에서 엉덩이를 뒤로 옮겨 주세요." }
        if lean == 4 { return "편안한 범위에서 상체를 세워 주세요." }
        return "가능한 범위에서 몸을 중앙 쪽으로 옮겨 주세요."
    }
}

final class SensorAlertTracker {
    var candidate = -1, since = 0.0, last: Double? = nil
    var sent: [Int: Double] = [:]
    func reset() { candidate = -1; since = 0; last = nil }
    func update(_ lean: Int, _ now: Double, _ ready: Bool) -> Bool {
        if !ready || lean == 0 || lean >= 5 { reset(); return false }
        if let previous = last, now-previous >= 2 || now < previous { reset() }
        last = now
        if candidate != lean { candidate = lean; since = now; return false }
        if now-since < 3 || now-(sent[lean] ?? -60) < 60 { return false }
        sent[lean] = now
        return true
    }
}

final class NativeSensorHistory {
    var records: [String: Any] = [:]
    var lastSecond: Int64 = -1, lastSlot: Int64 = -1, lastSave = 0.0
    private let formatter: DateFormatter = { let f = DateFormatter(); f.locale = Locale(identifier: "en_US_POSIX"); f.dateFormat = "yyyy-MM-dd"; return f }()
    private let url: URL = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("sensor-history.json")
    init() {
        try? FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        if let data = try? Data(contentsOf: url), let r = try? JSONSerialization.jsonObject(with: data) as? [String: Any] { records = r }
    }
    func sample(at: Date, values: [Double]?, device: String) {
        let second = Int64(at.timeIntervalSince1970)
        guard second > lastSecond else { return }; lastSecond = second
        let key = formatter.string(from: at)
        let empty = Dictionary(uniqueKeysWithValues: SensorRules.keys.map { ($0,0) })
        var record = records[key] as? [String: Any] ?? ["date": key, "hours": Array(repeating: empty, count: 24), "frames": [[String: Any]]()]
        var hours = record["hours"] as? [[String: Int]] ?? Array(repeating: empty, count: 24)
        let hour = Calendar.current.component(.hour, from: at), state = SensorRules.keys[SensorRules.assess(values)]
        hours[hour][state, default: 0] += 1; record["hours"] = hours
        if second/5 != lastSlot {
            lastSlot = second/5
            var frames = record["frames"] as? [[String: Any]] ?? []
            frames.append(["at": at.timeIntervalSince1970*1000, "values": values.map { $0 as Any } ?? NSNull(), "source": "sensor", "device": device])
            record["frames"] = frames
        }
        records[key] = record
        if at.timeIntervalSince1970-lastSave >= 5 { lastSave = at.timeIntervalSince1970; save() }
    }
    func save() {
        let now = Date(), cutoff = formatter.string(from: Calendar.current.date(byAdding: .day, value: -89, to: now)!), detail = formatter.string(from: Calendar.current.date(byAdding: .day, value: -6, to: now)!)
        for key in Array(records.keys) {
            if key < cutoff { records.removeValue(forKey: key) }
            else if key < detail, var record = records[key] as? [String: Any] { record["frames"] = [[String: Any]](); records[key] = record }
        }
        do { let data = try JSONSerialization.data(withJSONObject: records); try data.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication]) }
        catch { NotificationCenter.default.post(name: .seatSensorEvent, object: nil, userInfo: ["type": "error", "message": "기록을 저장하지 못했어요. 저장 공간을 확인해 주세요."]) }
    }
}

extension Notification.Name { static let seatSensorEvent = Notification.Name("SeatSensorEvent") }

final class SeatSensorOwner: NSObject, CBCentralManagerDelegate, CBPeripheralDelegate, UNUserNotificationCenterDelegate {
    static let shared = SeatSensorOwner()
    static let service = CBUUID(string: "6E400001-B5A3-F393-E0A9-E50E24DCCA9E")
    static let rxID = CBUUID(string: "6E400002-B5A3-F393-E0A9-E50E24DCCA9E")
    static let txID = CBUUID(string: "6E400003-B5A3-F393-E0A9-E50E24DCCA9E")
    var central: CBCentralManager!, peripheral: CBPeripheral?, rx: CBCharacteristic?
    var connected = false, degraded = false, restoring = false, writing = false
    var status = "disconnected", code = "", device = "", values: [Double]?, lastAt = 0.0, lastEmit = 0.0
    var timeout: DispatchWorkItem?
    let tracker = SensorAlertTracker(), history = NativeSensorHistory()
    override init() {
        super.init()
        UNUserNotificationCenter.current().delegate = self
        central = CBCentralManager(delegate: self, queue: .main, options: [CBCentralManagerOptionRestoreIdentifierKey: "seat-care-sensor"])
        NotificationCenter.default.addObserver(forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main) { [weak self] _ in self?.history.save() }
    }
    func emit(_ data: [String: Any]) { NotificationCenter.default.post(name: .seatSensorEvent, object: nil, userInfo: data) }
    func snapshot() -> [String: Any] { ["type": "connection", "connected": connected, "status": status, "device": device, "degraded": degraded, "at": lastAt, "values": values.map { $0 as Any } ?? NSNull()] }
    func begin(_ code: String) throws {
        guard central.state == .poweredOn else { throw NSError(domain: "SeatCare", code: 1, userInfo: [NSLocalizedDescriptionKey: "Bluetooth 권한을 허용하고 전원을 켜 주세요."]) }
        disconnect(); self.code = code; status = "checking"; emit(snapshot())
        central.scanForPeripherals(withServices: [Self.service], options: [CBCentralManagerScanOptionAllowDuplicatesKey: false])
        let work = DispatchWorkItem { [weak self] in self?.fail("방석 연결 시간이 초과됐어요. 전원과 거리를 확인해 주세요.") }; timeout = work; DispatchQueue.main.asyncAfter(deadline: .now()+15, execute: work)
    }
    func disconnect() {
        timeout?.cancel(); timeout = nil; central.stopScan()
        if let p = peripheral { central.cancelPeripheralConnection(p) }
        peripheral = nil; rx = nil; connected = false; values = nil; lastAt = 0; status = "disconnected"; tracker.reset(); writing = false
        UserDefaults.standard.set(false, forKey: "seat-active"); UserDefaults.standard.set(false, forKey: "seat-ready")
        history.save(); emit(snapshot())
    }
    func fail(_ message: String) { emit(["type": "error", "message": message]); disconnect() }
    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        if central.state != .poweredOn && connected { fail("Bluetooth 연결이 중단됐어요. 앱에서 다시 연결해 주세요.") }
    }
    func centralManager(_ central: CBCentralManager, willRestoreState dict: [String: Any]) {
        guard UserDefaults.standard.bool(forKey: "seat-active"), let items = dict[CBCentralManagerRestoredStatePeripheralsKey] as? [CBPeripheral], let p = items.first else { return }
        peripheral = p; p.delegate = self; device = p.name ?? "ESP32"; restoring = true
        degraded = UserDefaults.standard.bool(forKey: "seat-degraded")
        status = UserDefaults.standard.bool(forKey: "seat-ready") ? "READY" : "checking"
        if p.state == .connected { p.discoverServices([Self.service]) } else { central.connect(p) }
    }
    func centralManager(_ central: CBCentralManager, didDiscover p: CBPeripheral, advertisementData: [String: Any], rssi RSSI: NSNumber) {
        let name = advertisementData[CBAdvertisementDataLocalNameKey] as? String ?? p.name ?? ""
        guard peripheral == nil, name.uppercased() == "ESP32-P-"+code else { return }
        central.stopScan(); peripheral = p; p.delegate = self; device = name; central.connect(p)
    }
    func centralManager(_ central: CBCentralManager, didConnect p: CBPeripheral) { p.discoverServices([Self.service]) }
    func centralManager(_ central: CBCentralManager, didFailToConnect p: CBPeripheral, error: Error?) { if p === peripheral { fail("방석 연결에 실패했어요.") } }
    func centralManager(_ central: CBCentralManager, didDisconnectPeripheral p: CBPeripheral, error: Error?) {
        guard p === peripheral else { return }
        notify("Seat Care · 연결 확인", "방석 연결이 끊겨 자세 감지가 중단됐어요. 앱을 열어 다시 연결해 주세요.")
        fail("방석 연결이 끊겼어요.")
    }
    func peripheral(_ p: CBPeripheral, didDiscoverServices error: Error?) {
        guard let service = p.services?.first(where: { $0.uuid == Self.service }), error == nil else { fail("Seat Care 서비스를 찾지 못했어요."); return }
        p.discoverCharacteristics([Self.rxID, Self.txID], for: service)
    }
    func peripheral(_ p: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
        rx = service.characteristics?.first(where: { $0.uuid == Self.rxID })
        guard rx != nil, let tx = service.characteristics?.first(where: { $0.uuid == Self.txID }), error == nil else { fail("센서 통신 채널을 찾지 못했어요."); return }
        p.setNotifyValue(true, for: tx)
    }
    func peripheral(_ p: CBPeripheral, didUpdateNotificationStateFor characteristic: CBCharacteristic, error: Error?) {
        guard error == nil, characteristic.isNotifying else { fail("센서 수신을 시작하지 못했어요."); return }
        timeout?.cancel(); connected = true; UserDefaults.standard.set(true, forKey: "seat-active"); emit(snapshot())
        if !restoring || status != "READY" { try? command("GET_CALIBRATION_STATUS") }
        restoring = false
    }
    func command(_ command: String) throws {
        let allowed = ["GET_CALIBRATION_STATUS", "CALIBRATE_ZERO", "CALIBRATE_BALANCE", "CONTINUE_ZERO_CALIBRATION", "CONTINUE_BALANCE_CALIBRATION"]
        guard allowed.contains(command), connected, let p = peripheral, let rx = rx, !writing else { throw NSError(domain: "SeatCare", code: 2, userInfo: [NSLocalizedDescriptionKey: "방석 연결과 명령 처리 상태를 확인해 주세요."]) }
        if command.hasPrefix("CONTINUE") { degraded = true }
        if command == "CALIBRATE_ZERO" { degraded = false; status = "ZERO_CALIBRATING" }
        if command == "CALIBRATE_BALANCE" { status = "BALANCE_CALIBRATING" }
        UserDefaults.standard.set(degraded, forKey: "seat-degraded"); UserDefaults.standard.set(status == "READY", forKey: "seat-ready")
        tracker.reset(); writing = true; p.writeValue(Data(command.utf8), for: rx, type: .withResponse)
    }
    func peripheral(_ peripheral: CBPeripheral, didWriteValueFor characteristic: CBCharacteristic, error: Error?) { writing = false; if error != nil { emit(["type": "error", "message": "보정 명령을 보내지 못했어요. 다시 시도해 주세요."]) } }
    func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
        guard error == nil, let data = characteristic.value, let raw = String(data: data, encoding: .utf8) else { return }
        let packet = raw.trimmingCharacters(in: .whitespacesAndNewlines), now = Date(), at = now.timeIntervalSince1970*1000
        if packet.range(of: #"^S:(SETUP_REQUIRED|ZERO_REQUIRED|ZERO_CALIBRATING|CALIBRATING|BALANCE_REQUIRED|BALANCE_CALIBRATING|READY|ZERO_FAILED|CALIBRATION_FAILED|ZERO_WARNING|BALANCE_WARNING)(?::[1-5](?:,[1-5])*)?$"#, options: .regularExpression) != nil {
            status = String(packet.dropFirst(2).split(separator: ":")[0]); tracker.reset()
            UserDefaults.standard.set(status == "READY", forKey: "seat-ready")
            emit(["type": "packet", "packet": packet, "at": at]); return
        }
        guard let parsed = SensorRules.parse(packet) else { return }
        values = parsed; lastAt = at
        let ready = connected && status == "READY" && !degraded, lean = SensorRules.assess(parsed)
        history.sample(at: now, values: ready ? parsed : nil, device: device)
        if tracker.update(lean, ProcessInfo.processInfo.systemUptime, ready) {
            let body = SensorRules.labels[lean]+"이 이어지고 있어요. "+SensorRules.guidance(lean)
            notify("Seat Care · 자세 주의", body); emit(["type": "alert", "message": body])
        }
        if at-lastEmit >= 100 { lastEmit = at; emit(["type": "packet", "packet": packet, "at": at]) }
    }
    func notify(_ title: String, _ body: String) {
        let content = UNMutableNotificationContent(); content.title = title; content.body = body; content.sound = .default
        UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: "seat-care-alert", content: content, trigger: nil))
    }
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) { completionHandler([.banner, .sound]) }
}

@objc(SeatSensorPlugin)
public class SeatSensorPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SeatSensorPlugin"
    public let jsName = "SeatSensor"
    public let pluginMethods: [CAPPluginMethod] = ["connect", "disconnect", "command", "getState", "getHistory", "enableNotifications", "testNotification"].map { CAPPluginMethod(name: $0, returnType: CAPPluginReturnPromise) }
    private var observer: NSObjectProtocol?
    public override func load() {
        observer = NotificationCenter.default.addObserver(forName: .seatSensorEvent, object: nil, queue: .main) { [weak self] note in
            guard let event = note.userInfo as? [String: Any] else { return }; self?.notifyListeners("sensor", data: event)
        }
    }
    deinit { if let observer = observer { NotificationCenter.default.removeObserver(observer) } }
    @objc func connect(_ call: CAPPluginCall) { DispatchQueue.main.async {
        let code = call.getString("code", "").uppercased()
        guard code.range(of: "^[0-9A-F]{6}$", options: .regularExpression) != nil else { call.reject("기기 코드 6자리를 입력해 주세요."); return }
        do { try SeatSensorOwner.shared.begin(code); call.resolve() } catch { call.reject(error.localizedDescription) }
    } }
    @objc func disconnect(_ call: CAPPluginCall) { DispatchQueue.main.async { SeatSensorOwner.shared.disconnect(); call.resolve() } }
    @objc func command(_ call: CAPPluginCall) { DispatchQueue.main.async { do { try SeatSensorOwner.shared.command(call.getString("command", "")); call.resolve() } catch { call.reject(error.localizedDescription) } } }
    @objc func getState(_ call: CAPPluginCall) { DispatchQueue.main.async { call.resolve(SeatSensorOwner.shared.snapshot()) } }
    @objc func getHistory(_ call: CAPPluginCall) { DispatchQueue.main.async { call.resolve(["records": SeatSensorOwner.shared.history.records]) } }
    @objc func enableNotifications(_ call: CAPPluginCall) { UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, error in
        if let error = error { call.reject(error.localizedDescription) } else { call.resolve(["granted": granted]) }
    } }
    @objc func testNotification(_ call: CAPPluginCall) { UNUserNotificationCenter.current().getNotificationSettings { settings in
        guard settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional else { call.reject("먼저 휴대폰 알림을 허용해 주세요."); return }
        SeatSensorOwner.shared.notify("Seat Care · 테스트", "알림이 이렇게 표시됩니다. 실제 자세 경고가 아니에요."); call.resolve()
    } }
}

class SeatBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() { bridge?.registerPluginInstance(SeatSensorPlugin()) }
}
