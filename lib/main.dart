import 'package:flutter/material.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'firebase_options.dart';


void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp(
    options: DefaultFirebaseOptions.currentPlatform,
  );
  runApp(const IzhEventsApp());
}

class IzhEventsApp extends StatelessWidget {
  const IzhEventsApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Что сегодня в городе',
      theme: ThemeData(useMaterial3: true, colorSchemeSeed: Colors.indigo),
      home: const EventsHome(),
    );
  }
}

class EventsHome extends StatelessWidget {
  const EventsHome({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Что сегодня в городе ( News )')),
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
            itemCount: events.length,
            itemBuilder: (context, index) {
              final event = events[index];
              final title = event['title'] ?? 'Без названия';
              final summary = event['summary'] ?? '';
              final venue = event['venue'] ?? '';
              final tags = List<String>.from(event['tags'] ?? []);
              final url = event['originalPostUrl'] ?? '';

              return Card(
                margin: const EdgeInsets.all(8),
                elevation: 2,
                child: ListTile(
                  title: Text(title),
                  subtitle: Text('$summary\n$venue'),
                  trailing: Wrap(
                    spacing: 4,
                    children: tags.map((t) => Chip(label: Text(t))).toList(),
                  ),
                  onTap: () {
                    if (url.isNotEmpty) {
                      // will open the link in future update
                    }
                  },
                ),
              );
            },
          );
        },
      ),
    );
  }
}
