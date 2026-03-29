import Foundation
import React

@objc(NousMemoryBridge)
class NousMemoryBridge: NSObject {
  
  @objc func initialize(_ licenseKey: String, fingerprint: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    let result = nous_init(licenseKey, fingerprint)
    if result == 0 {
      resolve(true)
    } else {
      reject("INIT", "Memory engine initialization failed (code: \(result))", nil)
    }
  }
  
  @objc func store(_ text: String, layer: String, source: String, score: Double, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    guard let resultPtr = nous_store(text, layer, source, score) else {
      reject("STORE", "Store returned null", nil)
      return
    }
    let jsonStr = String(cString: resultPtr)
    nous_free_string(resultPtr)
    
    if let data = jsonStr.data(using: .utf8),
       let json = try? JSONSerialization.jsonObject(with: data) {
      resolve(json)
    } else {
      resolve(["id": jsonStr])
    }
  }
  
  @objc func recall(_ query: String, topK: Int, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    guard let resultPtr = nous_recall(query, Int32(topK)) else {
      resolve([])
      return
    }
    let jsonStr = String(cString: resultPtr)
    nous_free_string(resultPtr)
    
    if let data = jsonStr.data(using: .utf8),
       let json = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] {
      resolve(json)
    } else {
      resolve([])
    }
  }
  
  @objc func getHealth(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    guard let resultPtr = nous_health() else {
      resolve(["diversity": 0, "isCollapsing": false, "memoryCount": 0, "capacity": 0])
      return
    }
    let jsonStr = String(cString: resultPtr)
    nous_free_string(resultPtr)
    
    if let data = jsonStr.data(using: .utf8),
       let json = try? JSONSerialization.jsonObject(with: data) {
      resolve(json)
    } else {
      resolve(["diversity": 0, "isCollapsing": false, "memoryCount": 0, "capacity": 0])
    }
  }
  
  @objc func getMemoryCount(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    let count = nous_memory_count()
    resolve(count)
  }
  
  @objc func serialize(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    guard let resultPtr = nous_serialize() else {
      reject("SERIALIZE", "Serialization failed", nil)
      return
    }
    let jsonStr = String(cString: resultPtr)
    nous_free_string(resultPtr)
    resolve(jsonStr)
  }
  
  @objc func deserialize(_ jsonData: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    let result = nous_deserialize(jsonData)
    if result == 0 {
      resolve(true)
    } else {
      reject("DESERIALIZE", "Failed to load memory data (code: \(result))", nil)
    }
  }
  
  @objc static func requiresMainQueueSetup() -> Bool { return false }
}
