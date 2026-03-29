import Foundation
import CoreLocation
import MapKit
import React

@objc(LocationBridge)
class LocationBridge: NSObject, CLLocationManagerDelegate {
  
  private let locationManager = CLLocationManager()
  private var locationCallback: ((CLLocation?) -> Void)?
  
  override init() {
    super.init()
    locationManager.delegate = self
    locationManager.desiredAccuracy = kCLLocationAccuracyBest
  }
  
  @objc func getCurrent(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    locationManager.requestWhenInUseAuthorization()
    
    locationCallback = { location in
      if let loc = location {
        let geocoder = CLGeocoder()
        geocoder.reverseGeocodeLocation(loc) { placemarks, _ in
          let address = placemarks?.first.flatMap { p in
            [p.name, p.locality, p.administrativeArea].compactMap { $0 }.joined(separator: ", ")
          } ?? ""
          resolve([
            "latitude": loc.coordinate.latitude,
            "longitude": loc.coordinate.longitude,
            "altitude": loc.altitude,
            "accuracy": loc.horizontalAccuracy,
            "address": address,
          ])
        }
      } else {
        reject("LOCATION", "Could not get location", nil)
      }
    }
    locationManager.requestLocation()
  }
  
  @objc func getDirections(_ from: String, to: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    let request = MKDirections.Request()
    
    if from == "current" {
      request.source = MKMapItem.forCurrentLocation()
    }
    
    // Geocode destination
    let geocoder = CLGeocoder()
    geocoder.geocodeAddressString(to) { placemarks, error in
      guard let placemark = placemarks?.first else {
        reject("GEOCODE", "Could not find: \(to)", error); return
      }
      
      request.destination = MKMapItem(placemark: MKPlacemark(placemark: placemark))
      request.transportType = .automobile
      
      let directions = MKDirections(request: request)
      directions.calculate { response, error in
        guard let route = response?.routes.first else {
          reject("DIRECTIONS", "No route found", error); return
        }
        resolve([
          "distance": String(format: "%.1f miles", route.distance / 1609.34),
          "duration": String(format: "%.0f minutes", route.expectedTravelTime / 60),
          "summary": route.name,
        ])
      }
    }
  }
  
  @objc func searchNearby(_ query: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    let request = MKLocalSearch.Request()
    request.naturalLanguageQuery = query
    
    if let location = locationManager.location {
      request.region = MKCoordinateRegion(center: location.coordinate, latitudinalMeters: 5000, longitudinalMeters: 5000)
    }
    
    let search = MKLocalSearch(request: request)
    search.start { response, error in
      guard let items = response?.mapItems else {
        reject("SEARCH", "Search failed", error); return
      }
      let mapped = items.prefix(10).map { item -> [String: Any] in
        return [
          "name": item.name ?? "",
          "address": item.placemark.title ?? "",
          "phone": item.phoneNumber ?? "",
          "distance": "nearby",
        ]
      }
      resolve(mapped)
    }
  }
  
  func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
    locationCallback?(locations.last)
    locationCallback = nil
  }
  
  func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
    locationCallback?(nil)
    locationCallback = nil
  }
  
  @objc static func requiresMainQueueSetup() -> Bool { return false }
}
