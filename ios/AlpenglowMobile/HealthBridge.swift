import Foundation
import HealthKit
import React

@objc(HealthBridge)
class HealthBridge: NSObject {
  
  private let healthStore = HKHealthStore()
  
  @objc func getSteps(_ dateStr: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    guard HKHealthStore.isHealthDataAvailable() else {
      reject("UNAVAILABLE", "Health data not available", nil); return
    }
    
    let formatter = DateFormatter()
    formatter.dateFormat = "yyyy-MM-dd"
    guard let date = formatter.date(from: dateStr) else {
      reject("DATE", "Invalid date", nil); return
    }
    
    let start = Calendar.current.startOfDay(for: date)
    let end = Calendar.current.date(byAdding: .day, value: 1, to: start)!
    
    guard let stepsType = HKQuantityType.quantityType(forIdentifier: .stepCount) else {
      reject("TYPE", "Step count not available", nil); return
    }
    
    let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)
    let query = HKStatisticsQuery(quantityType: stepsType, quantitySamplePredicate: predicate, options: .cumulativeSum) { _, result, error in
      if let error = error {
        reject("QUERY", error.localizedDescription, error); return
      }
      let steps = result?.sumQuantity()?.doubleValue(for: .count()) ?? 0
      resolve(Int(steps))
    }
    
    healthStore.requestAuthorization(toShare: [], read: [stepsType]) { granted, _ in
      if granted { self.healthStore.execute(query) }
      else { reject("PERMISSION", "Health access denied", nil) }
    }
  }
  
  @objc func getHeartRate(_ hours: Double, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    guard let hrType = HKQuantityType.quantityType(forIdentifier: .heartRate) else {
      reject("TYPE", "Heart rate not available", nil); return
    }
    
    let start = Date().addingTimeInterval(-hours * 3600)
    let predicate = HKQuery.predicateForSamples(withStart: start, end: Date(), options: .strictStartDate)
    let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)
    
    let query = HKSampleQuery(sampleType: hrType, predicate: predicate, limit: 100, sortDescriptors: [sort]) { _, samples, error in
      if let error = error {
        reject("QUERY", error.localizedDescription, error); return
      }
      let mapped = (samples as? [HKQuantitySample])?.map { s -> [String: Any] in
        return [
          "value": s.quantity.doubleValue(for: HKUnit(from: "count/min")),
          "date": ISO8601DateFormatter().string(from: s.startDate),
        ]
      } ?? []
      resolve(mapped)
    }
    
    healthStore.requestAuthorization(toShare: [], read: [hrType]) { granted, _ in
      if granted { self.healthStore.execute(query) }
      else { reject("PERMISSION", "Health access denied", nil) }
    }
  }
  
  @objc func getSleep(_ dateStr: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    guard let sleepType = HKCategoryType.categoryType(forIdentifier: .sleepAnalysis) else {
      reject("TYPE", "Sleep not available", nil); return
    }
    
    let formatter = DateFormatter()
    formatter.dateFormat = "yyyy-MM-dd"
    guard let date = formatter.date(from: dateStr) else {
      reject("DATE", "Invalid date", nil); return
    }
    
    let start = Calendar.current.date(byAdding: .day, value: -1, to: Calendar.current.startOfDay(for: date))!
    let end = Calendar.current.date(byAdding: .day, value: 1, to: Calendar.current.startOfDay(for: date))!
    let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)
    
    let query = HKSampleQuery(sampleType: sleepType, predicate: predicate, limit: 100, sortDescriptors: nil) { _, samples, error in
      if let error = error {
        reject("QUERY", error.localizedDescription, error); return
      }
      
      var totalSeconds: TimeInterval = 0
      var deepSeconds: TimeInterval = 0
      var remSeconds: TimeInterval = 0
      
      for sample in (samples as? [HKCategorySample]) ?? [] {
        let duration = sample.endDate.timeIntervalSince(sample.startDate)
        totalSeconds += duration
        if sample.value == HKCategoryValueSleepAnalysis.asleepDeep.rawValue { deepSeconds += duration }
        if sample.value == HKCategoryValueSleepAnalysis.asleepREM.rawValue { remSeconds += duration }
      }
      
      resolve([
        "totalHours": round(totalSeconds / 3600 * 10) / 10,
        "deepHours": round(deepSeconds / 3600 * 10) / 10,
        "remHours": round(remSeconds / 3600 * 10) / 10,
      ])
    }
    
    healthStore.requestAuthorization(toShare: [], read: [sleepType]) { granted, _ in
      if granted { self.healthStore.execute(query) }
      else { reject("PERMISSION", "Health access denied", nil) }
    }
  }
  
  @objc func getWorkouts(_ days: Int, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    let workoutType = HKWorkoutType.workoutType()
    let start = Calendar.current.date(byAdding: .day, value: -days, to: Date())!
    let predicate = HKQuery.predicateForSamples(withStart: start, end: Date(), options: .strictStartDate)
    let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)
    
    let query = HKSampleQuery(sampleType: workoutType, predicate: predicate, limit: 50, sortDescriptors: [sort]) { _, samples, error in
      if let error = error {
        reject("QUERY", error.localizedDescription, error); return
      }
      let mapped = (samples as? [HKWorkout])?.map { w -> [String: Any] in
        return [
          "type": String(describing: w.workoutActivityType),
          "date": ISO8601DateFormatter().string(from: w.startDate),
          "duration": Int(w.duration / 60),
          "calories": Int(w.totalEnergyBurned?.doubleValue(for: .kilocalorie()) ?? 0),
        ]
      } ?? []
      resolve(mapped)
    }
    
    healthStore.requestAuthorization(toShare: [], read: [workoutType]) { granted, _ in
      if granted { self.healthStore.execute(query) }
      else { reject("PERMISSION", "Health access denied", nil) }
    }
  }
  
  @objc static func requiresMainQueueSetup() -> Bool { return false }
}
