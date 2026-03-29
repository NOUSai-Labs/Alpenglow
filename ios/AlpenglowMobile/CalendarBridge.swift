import Foundation
import EventKit
import React

@objc(CalendarBridge)
class CalendarBridge: NSObject {
  
  private let store = EKEventStore()
  
  @objc func getEvents(_ startDateStr: String, endDate endDateStr: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    requestAccess { granted in
      guard granted else {
        reject("PERMISSION", "Calendar access denied", nil)
        return
      }
      
      let formatter = ISO8601DateFormatter()
      guard let startDate = formatter.date(from: startDateStr),
            let endDate = formatter.date(from: endDateStr) else {
        reject("DATE", "Invalid date format", nil)
        return
      }
      
      let predicate = self.store.predicateForEvents(withStart: startDate, end: endDate, calendars: nil)
      let events = self.store.events(matching: predicate)
      
      let mapped = events.map { event -> [String: Any] in
        return [
          "id": event.eventIdentifier ?? "",
          "title": event.title ?? "",
          "startDate": formatter.string(from: event.startDate),
          "endDate": formatter.string(from: event.endDate),
          "location": event.location ?? "",
          "notes": event.notes ?? "",
          "allDay": event.isAllDay,
          "calendar": event.calendar.title,
        ]
      }
      resolve(mapped)
    }
  }
  
  @objc func createEvent(_ details: NSDictionary, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    requestAccess { granted in
      guard granted else {
        reject("PERMISSION", "Calendar access denied", nil)
        return
      }
      
      let event = EKEvent(eventStore: self.store)
      event.title = details["title"] as? String ?? ""
      
      let formatter = ISO8601DateFormatter()
      if let startStr = details["startDate"] as? String {
        event.startDate = formatter.date(from: startStr)
      }
      if let endStr = details["endDate"] as? String {
        event.endDate = formatter.date(from: endStr)
      }
      event.location = details["location"] as? String
      event.notes = details["notes"] as? String
      event.isAllDay = details["allDay"] as? Bool ?? false
      event.calendar = self.store.defaultCalendarForNewEvents
      
      do {
        try self.store.save(event, span: .thisEvent)
        resolve(event.eventIdentifier)
      } catch {
        reject("SAVE", "Failed to save event: \(error.localizedDescription)", error)
      }
    }
  }
  
  @objc func deleteEvent(_ eventId: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    requestAccess { granted in
      guard granted else {
        reject("PERMISSION", "Calendar access denied", nil)
        return
      }
      
      guard let event = self.store.event(withIdentifier: eventId) else {
        reject("NOT_FOUND", "Event not found", nil)
        return
      }
      
      do {
        try self.store.remove(event, span: .thisEvent)
        resolve(true)
      } catch {
        reject("DELETE", "Failed to delete: \(error.localizedDescription)", error)
      }
    }
  }
  
  private func requestAccess(completion: @escaping (Bool) -> Void) {
    if #available(iOS 17.0, *) {
      store.requestFullAccessToEvents { granted, _ in completion(granted) }
    } else {
      store.requestAccess(to: .event) { granted, _ in completion(granted) }
    }
  }
  
  @objc static func requiresMainQueueSetup() -> Bool { return false }
}

  @objc func updateEvent(_ eventId: String, details: NSDictionary, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    requestAccess { granted in
      guard granted else {
        reject("PERMISSION", "Calendar access denied", nil)
        return
      }
      
      guard let event = self.store.event(withIdentifier: eventId) else {
        reject("NOT_FOUND", "Event not found", nil)
        return
      }
      
      if let title = details["title"] as? String { event.title = title }
      if let location = details["location"] as? String { event.location = location }
      if let notes = details["notes"] as? String { event.notes = notes }
      
      let formatter = ISO8601DateFormatter()
      if let startStr = details["startDate"] as? String {
        event.startDate = formatter.date(from: startStr)
      }
      if let endStr = details["endDate"] as? String {
        event.endDate = formatter.date(from: endStr)
      }
      if let allDay = details["allDay"] as? Bool {
        event.isAllDay = allDay
      }
      
      do {
        try self.store.save(event, span: .thisEvent)
        resolve(event.eventIdentifier)
      } catch {
        reject("UPDATE", "Failed to update event: \(error.localizedDescription)", error)
      }
    }
  }
