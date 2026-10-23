import 'dart:convert';
import 'dart:io';
import 'package:path_provider/path_provider.dart';

class LocalStore {
  File? _file;
  bool _writable = false;
  Future<void> _pending = Future.value();
  Future<Map<String, dynamic>> load() async {
    final directory = await getApplicationSupportDirectory();
    _file = File('${directory.path}/seat-care-v1.json');
    if (!await _file!.exists()) {
      _writable = true;
      return {};
    }
    final data =
        jsonDecode(await _file!.readAsString()) as Map<String, dynamic>;
    if (data['events'] is! List || data['pendingIds'] is! List) {
      throw const FormatException('Invalid saved record');
    }
    _writable = true;
    return data;
  }

  Future<void> save(Map<String, dynamic> state) {
    final encoded = jsonEncode(state);
    // Serial, atomic replacements: older asynchronous writes cannot win.
    _pending = _pending.catchError((Object _) {}).then((_) async {
      if (_file == null || !_writable) throw StateError('기록 저장소가 준비되지 않았어요.');
      final temporary = File('${_file!.path}.tmp');
      await temporary.writeAsString(encoded, flush: true);
      await temporary.rename(_file!.path);
    });
    return _pending;
  }
}
