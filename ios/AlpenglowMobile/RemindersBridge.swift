import Foundation
import EventKit
import React

@objc(RemindersBridge)
class RemindersBridge: NSObject {
  
  private let store = EKEventStore()
  
  @objc func getAll(_ showCompleted: Bool, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    requestAccess { granted in
      guard granted else { reject("PERMISSION", "Reminders access denied", nil); return }
      
      let predicate = self.store.predicateForReminders(in: nil)
      self.store.fetchReminders(matching: predicate) { reminders in
        let filtered = (reminders ?? []).filter { showCompleted || !$0.isCompleted }
        let formatter = ISO8601DateFormatter()
        let mapped = filtered.map { r -> [String: Any] in
          return [
            "id": r.calendarItemIdentifier,
            "title": r.title ?? "",
            "completed": r.isCompleted,
            "dueDate": r.dueDateComponents.flatMap { Calendar.current.date(from: $0) }.map { formatter.string(from: $0) } ?? "",
            "priority": r.priority,
            "notes": r.notes ?? "",
            "list": r.calendar.title,
          ]
        }
        resolve(mapped)
      }
    }
  }
  
  @objc func create(_ details: NSDictionary, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    requestAccess { granted in
      guard granted else { reject("PERMISSION", "Reminders access denied", nil); return }
      
      let reminder = EKReminder(eventStore: self.store)
      reminder.title = details["title"] as? String ?? ""
      reminder.notes = details["notes"] as? String
      reminder.priority = details["priority"] as? Int ?? 0
      reminder.calendar = self.store.defaultCalendarForNewReminders()
      
      if let dueDateStr = details["dueDate"] as? String,
         let dueDate = ISO8601DateFormatter().date(from: dueDateStr) {
        reminder.dueDateComponents = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute], from: dueDate)
      }
      
      do {
        try self.store.save(reminder, commit: true)
        resolve(reminder.calendarItemIdentifier)
      } catch {
        reject("SAVE", "Failed to save: \(error.localizedDescription)", error)
      }
    }
  }
  
  @objc func complete(_ reminderId: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    requestAccess { granted in
      guard granted else { reject("PERMISSION", "Reminders access denied", nil); return }
      
      let predicate = self.store.predicateForReminders(in: nil)
      self.store.fetchReminders(matching: predicate) { reminders in
        guard let reminder = reminders?.first(where: { $0.calendarItemIdentifier == reminderId }) else {
          reject("NOT_FOUND", "Reminder not found", nil); return
        }
        reminder.isCompleted = true
        do {
          try self.store.save(reminder, commit: true)
          resolve(true)
        } catch {
          reject("SAVE", "Failed: \(error.localizedDescription)", error)
        }
      }
    }
  }
  
  @objc func remove(_ reminderId: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    requestAccess { granted in
      guard granted else { reject("PERMISSION", "Reminders access denied", nil); return }
      
      let predicate = self.store.predicateForReminders(in: nil)
      self.store.fetchReminders(matching: predicate) { reminders in
        guard let reminder = reminders?.first(where: { $0.calendarItemIdentifier == reminderId }) else {
          reject("NOT_FOUND", "Reminder not found", nil); return
        }
        do {
          try self.store.remove(reminder, commit: true)
          resolve(true)
        } catch {
          reject("DELETE", "Failed: \(error.localizedDescription)", error)
        }
      }
    }
  }
  
  private func requestAccess(completion: @escaping (Bool) -> Void) {
    if #available(iOS 17.0, *) {
      store.requestFullAccessToReminders { granted, _ in completion(granted) }
    } else {
      store.requestAccess(to: .reminder) { granted, _ in completion(granted) }
    }
  }
  
  @objc static func requiresMainQueueSetup() -> Bool { return false }
}
