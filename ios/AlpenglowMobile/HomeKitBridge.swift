import Foundation
import HomeKit
import React

@objc(HomeKitBridge)
class HomeKitBridge: NSObject, HMHomeManagerDelegate {
  
  private var homeManager: HMHomeManager?
  private var managerReady = false
  private var pendingCallbacks: [() -> Void] = []
  
  override init() {
    super.init()
    homeManager = HMHomeManager()
    homeManager?.delegate = self
  }
  
  func homeManagerDidUpdateHomes(_ manager: HMHomeManager) {
    managerReady = true
    pendingCallbacks.forEach { $0() }
    pendingCallbacks.removeAll()
  }
  
  @objc func listAccessories(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    whenReady {
      guard let home = self.homeManager?.primaryHome else {
        resolve([]); return
      }
      let mapped = home.accessories.map { a -> [String: Any] in
        return [
          "name": a.name,
          "category": a.category.localizedDescription,
          "reachable": a.isReachable,
          "room": a.room?.name ?? "Default Room",
          "id": a.uniqueIdentifier.uuidString,
        ]
      }
      resolve(mapped)
    }
  }
  
  @objc func setValue(_ deviceName: String, characteristic charName: String, value: Any, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    whenReady {
      guard let home = self.homeManager?.primaryHome,
            let accessory = home.accessories.first(where: { $0.name.lowercased() == deviceName.lowercased() }) else {
        reject("NOT_FOUND", "Device not found: \(deviceName)", nil); return
      }
      
      for service in accessory.services {
        for char in service.characteristics {
          if char.localizedDescription.lowercased().contains(charName.lowercased()) {
            char.writeValue(value) { error in
              if let error = error {
                reject("WRITE", "Failed: \(error.localizedDescription)", error)
              } else {
                resolve(true)
              }
            }
            return
          }
        }
      }
      reject("CHAR_NOT_FOUND", "Characteristic \(charName) not found on \(deviceName)", nil)
    }
  }
  
  @objc func executeScene(_ sceneName: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    whenReady {
      guard let home = self.homeManager?.primaryHome else {
        reject("NO_HOME", "No home configured", nil); return
      }
      
      // Search action sets (scenes)
      guard let scene = home.actionSets.first(where: { $0.name.lowercased() == sceneName.lowercased() }) else {
        reject("NOT_FOUND", "Scene not found: \(sceneName)", nil); return
      }
      
      home.executeActionSet(scene) { error in
        if let error = error {
          reject("EXECUTE", "Failed: \(error.localizedDescription)", error)
        } else {
          resolve(true)
        }
      }
    }
  }
  
  @objc func getStatus(_ deviceName: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    whenReady {
      guard let home = self.homeManager?.primaryHome,
            let accessory = home.accessories.first(where: { $0.name.lowercased() == deviceName.lowercased() }) else {
        reject("NOT_FOUND", "Device not found", nil); return
      }
      
      var status: [String: Any] = [
        "name": accessory.name,
        "reachable": accessory.isReachable,
        "room": accessory.room?.name ?? "",
      ]
      
      var chars: [[String: Any]] = []
      for service in accessory.services {
        for char in service.characteristics where char.isReadable {
          chars.append([
            "name": char.localizedDescription,
            "value": char.value ?? NSNull(),
          ])
        }
      }
      status["characteristics"] = chars
      resolve(status)
    }
  }
  
  private func whenReady(_ callback: @escaping () -> Void) {
    if managerReady { callback() }
    else { pendingCallbacks.append(callback) }
  }
  
  @objc static func requiresMainQueueSetup() -> Bool { return true }
}
