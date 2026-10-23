import 'dart:convert';
import 'package:http/http.dart' as http;

class ShareInvite {
  ShareInvite(this.endpoint, this.token, this.room);
  final Uri endpoint;
  final String token, room;
  static ShareInvite parse(String input, {bool allowLocal = false}) {
    final url = Uri.tryParse(input.trim());
    if (url == null ||
        url.userInfo.isNotEmpty ||
        url.query.isNotEmpty ||
        (url.scheme != 'https' &&
            !(allowLocal &&
                url.scheme == 'http' &&
                ['127.0.0.1', 'localhost', '10.0.2.2'].contains(url.host)))) {
      throw const FormatException('HTTPS 사용자 초대 링크를 입력해 주세요.');
    }
    final token = Uri.splitQueryString(url.fragment)['key'] ?? '';
    final parts = token.split('.');
    if (parts.length != 2) throw const FormatException('사용자용 초대 링크를 확인해 주세요.');
    try {
      final data =
          jsonDecode(
                utf8.decode(base64Url.decode(base64Url.normalize(parts[0]))),
              )
              as Map<String, dynamic>;
      if (data['role'] != 'worker' ||
          data['v'] != 1 ||
          data['exp'] is! int ||
          data['exp'] <= DateTime.now().millisecondsSinceEpoch ||
          data['room'] is! String ||
          !RegExp(r'^[a-zA-Z0-9_-]{16,80}$').hasMatch(data['room'])) {
        throw const FormatException('만료되었거나 사용자용이 아닌 초대예요.');
      }
      return ShareInvite(
        url.replace(path: '/api/telemetry', query: null).removeFragment(),
        token,
        data['room'],
      );
    } catch (_) {
      throw const FormatException('만료되었거나 사용자용이 아닌 초대예요.');
    }
  }
}

class SharingClient {
  SharingClient({http.Client? client}) : _client = client ?? http.Client();
  final http.Client _client;
  Future<Map<String, dynamic>> request(
    ShareInvite invite, [
    Map<String, dynamic>? body,
  ]) async {
    // Never follow redirects with a credential to another host.
    final request = http.Request(body == null ? 'GET' : 'POST', invite.endpoint)
      ..followRedirects = false;
    request.headers['Authorization'] = 'Bearer ${invite.token}';
    if (body != null) {
      request.headers['Content-Type'] = 'application/json';
      request.body = jsonEncode(body);
    }
    final response = await http.Response.fromStream(
      await _client.send(request).timeout(const Duration(seconds: 12)),
    ).timeout(const Duration(seconds: 12));
    Map<String, dynamic> data;
    try {
      data = jsonDecode(response.body) as Map<String, dynamic>;
    } catch (_) {
      throw StateError('공유 서버 주소와 응답을 확인해 주세요.');
    }
    if (response.statusCode != 200) {
      throw StateError(data['error'] as String? ?? '공유 요청에 실패했어요.');
    }
    if (data['role'] != 'worker' || data['room'] != invite.room) {
      throw StateError('초대의 사용자 권한과 공유방이 일치하지 않아요.');
    }
    return data;
  }

  void close() => _client.close();
}
