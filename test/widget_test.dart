import 'package:flutter_test/flutter_test.dart';
import 'package:izh_events/main.dart'; // make sure this matches your package name

void main() {
  testWidgets('app starts', (tester) async {
    await tester.pumpWidget(const IzhEventsApp());
    expect(find.text('Что сегодня в городе'), findsOneWidget);
  });
}
