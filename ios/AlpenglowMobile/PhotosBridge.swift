import Foundation
import Photos
import React

@objc(PhotosBridge)
class PhotosBridge: NSObject {
  
  @objc func getRecent(_ count: Int, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    PHPhotoLibrary.requestAuthorization(for: .readWrite) { status in
      guard status == .authorized || status == .limited else {
        reject("PERMISSION", "Photos access denied", nil); return
      }
      
      let options = PHFetchOptions()
      options.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: false)]
      options.fetchLimit = count
      
      let assets = PHAsset.fetchAssets(with: .image, options: options)
      var results: [[String: Any]] = []
      let formatter = ISO8601DateFormatter()
      
      assets.enumerateObjects { asset, _, _ in
        var entry: [String: Any] = [
          "id": asset.localIdentifier,
          "width": asset.pixelWidth,
          "height": asset.pixelHeight,
          "date": asset.creationDate.map { formatter.string(from: $0) } ?? "",
          "favorite": asset.isFavorite,
        ]
        if let location = asset.location {
          entry["location"] = "\(location.coordinate.latitude), \(location.coordinate.longitude)"
        }
        results.append(entry)
      }
      resolve(results)
    }
  }
  
  @objc func getAlbums(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    PHPhotoLibrary.requestAuthorization(for: .readWrite) { status in
      guard status == .authorized || status == .limited else {
        reject("PERMISSION", "Photos access denied", nil); return
      }
      
      var albums: [[String: Any]] = []
      let collections = PHAssetCollection.fetchAssetCollections(with: .album, subtype: .any, options: nil)
      collections.enumerateObjects { collection, _, _ in
        let assets = PHAsset.fetchAssets(in: collection, options: nil)
        albums.append([
          "name": collection.localizedTitle ?? "Untitled",
          "count": assets.count,
          "id": collection.localIdentifier,
        ])
      }
      
      // Add smart albums
      let smartAlbums = PHAssetCollection.fetchAssetCollections(with: .smartAlbum, subtype: .any, options: nil)
      smartAlbums.enumerateObjects { collection, _, _ in
        let assets = PHAsset.fetchAssets(in: collection, options: nil)
        if assets.count > 0 {
          albums.append([
            "name": collection.localizedTitle ?? "Untitled",
            "count": assets.count,
            "id": collection.localIdentifier,
            "smart": true,
          ])
        }
      }
      resolve(albums)
    }
  }
  
  @objc func search(_ query: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    // PHAsset doesn't have built-in text search — use date/location/media type
    // For real search, would need Core ML vision to tag photos
    let options = PHFetchOptions()
    options.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: false)]
    options.fetchLimit = 20
    
    let assets = PHAsset.fetchAssets(with: .image, options: options)
    resolve(["count": assets.count, "note": "Full text search requires vision model — returning recent photos"])
  }
  
  @objc static func requiresMainQueueSetup() -> Bool { return false }
}
