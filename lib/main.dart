import 'package:flutter/material.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import 'firebase_options.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp(
    options: DefaultFirebaseOptions.currentPlatform,
  );

  // Russian locale for dates
  Intl.defaultLocale = 'ru_RU';

  runApp(const IzhEventsApp());
}

class IzhEventsApp extends StatelessWidget {
  const IzhEventsApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Что сегодня в городе',
      theme: ThemeData(
        useMaterial3: true,
        colorSchemeSeed: Colors.indigo,
        scaffoldBackgroundColor: const Color(0xfff4f4f9),
        cardTheme: CardTheme(
          surfaceTintColor: Colors.white,
          elevation: 2,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
          ),
        ),
      ),
      home: const EventsHome(),
    );
  }
}

class EventsHome extends StatelessWidget {
  const EventsHome({super.key});

  DateTime? _parseDate(dynamic value) {
    if (value == null) return null;
    if (value is Timestamp) return value.toDate();
    if (value is String) return DateTime.tryParse(value);
    return null;
  }

  String _formatDate(dynamic value) {
    final dt = _parseDate(value);
    if (dt == null) return 'Время не указано';
    // toLocal() so it shows local timezone
    return DateFormat('d MMM yyyy, HH:mm').format(dt.toLocal());
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Что сегодня в городе (News)'),
        centerTitle: true,
      ),
      body: StreamBuilder<QuerySnapshot>(
        stream: FirebaseFirestore.instance
            .collection('events')
            .orderBy('startTime', descending: false)
            .snapshots(),
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (!snapshot.hasData || snapshot.data!.docs.isEmpty) {
            return const Center(child: Text('Нет событий 😴'));
          }

          final events = snapshot.data!.docs;

          return ListView.builder(
            padding: const EdgeInsets.all(12),
            itemCount: events.length,
            itemBuilder: (context, index) {
              final doc = events[index];
              final data = doc.data() as Map<String, dynamic>;

              final title = (data['title'] ?? 'Без названия').toString();
              final summary = (data['summary'] ?? '').toString();
              final venue = (data['venue'] ?? '').toString();
              final city = (data['city'] ?? '').toString();

              final tags = (data['tags'] is Iterable)
                  ? List<String>.from(data['tags'])
                  : <String>[];

              final url = (data['originalPostUrl'] ?? '').toString();

              final dateText = _formatDate(data['startTime']);

              return Card(
                margin: const EdgeInsets.symmetric(vertical: 8),
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Title
                      Text(
                        title,
                        style: const TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 6),
                      // Date & time
                      Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(Icons.access_time, size: 16),
                          const SizedBox(width: 4),
                          Text(
                            dateText,
                            style: const TextStyle(fontSize: 13),
                          ),
                        ],
                      ),
                      const SizedBox(height: 4),

                      // Place / venue
                      if (venue.isNotEmpty || city.isNotEmpty) ...[
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Icon(Icons.place, size: 16),
                            const SizedBox(width: 4),
                            Expanded(
                              child: Text(
                                [
                                  if (venue.isNotEmpty) venue,
                                  if (city.isNotEmpty) city,
                                ].join(', '),
                                style: const TextStyle(fontSize: 13),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 8),
                      ] else
                        const SizedBox(height: 8),

                      // Summary / description
                      if (summary.isNotEmpty) ...[
                        Text(
                          summary,
                          style: const TextStyle(fontSize: 14),
                        ),
                        const SizedBox(height: 8),
                      ],

                      // Tags
                      if (tags.isNotEmpty)
                        Wrap(
                          spacing: 6,
                          runSpacing: -4,
                          children: tags
                              .map(
                                (t) => Chip(
                                  label: Text(t),
                                  materialTapTargetSize:
                                      MaterialTapTargetSize.shrinkWrap,
                                  visualDensity: VisualDensity.compact,
                                ),
                              )
                              .toList(),
                        ),

                      const SizedBox(height: 8),

                      // Open VK button
                      Align(
                        alignment: Alignment.centerRight,
                        child: TextButton.icon(
                          onPressed: url.isEmpty ? null : () => _launchUrl(url),
                          icon: const Icon(Icons.open_in_new),
                          label: const Text('Открыть пост'),
                        ),
                      ),
                    ],
                  ),
                ),
              );
            },
          );
        },
      ),
    );
  }
}

/// Opens a URL (VK post) in browser
Future<void> _launchUrl(String url) async {
  try {
    final uri = Uri.parse(url);
    if (!await launchUrl(uri, mode: LaunchMode.externalApplication)) {
      debugPrint('Could not launch $url');
    }
  } catch (e) {
    debugPrint('Error launching $url: $e');
  }
}
