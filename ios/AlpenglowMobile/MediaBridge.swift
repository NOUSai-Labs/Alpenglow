import AVFoundation
import UIKit
import Foundation
import MediaPlayer
import React

@objc(MediaBridge)
class MediaBridge: NSObject {
  
  private let player = MPMusicPlayerController.systemMusicPlayer
  
  @objc func play(_ query: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    let descriptor = MPMusicPlayerMediaItemCollection(query: MPMediaQuery.songs().addFilterPredicate(MPMediaPropertyPredicate(value: query, forProperty: MPMediaItemPropertyTitle, comparisonType: .contains)))
    // For simplicity, search and play
    let songQuery = MPMediaQuery.songs()
    songQuery.addFilterPredicate(MPMediaPropertyPredicate(value: query, forProperty: MPMediaItemPropertyTitle, comparisonType: .contains))
    
    if let items = songQuery.items, !items.isEmpty {
      player.setQueue(with: MPMediaItemCollection(items: items))
      player.play()
      resolve("Playing: \(items[0].title ?? query)")
    } else {
      reject("NOT_FOUND", "No music found for: \(query)", nil)
    }
  }
  
  @objc func pause(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    player.pause()
    resolve(true)
  }
  
  @objc func skip(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    player.skipToNextItem()
    resolve(true)
  }
  
  @objc func previous(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    player.skipToPreviousItem()
    resolve(true)
  }
  
  @objc func getNowPlaying(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    if let item = player.nowPlayingItem {
      resolve([
        "title": item.title ?? "",
        "artist": item.artist ?? "",
        "album": item.albumTitle ?? "",
        "duration": item.playbackDuration,
      ])
    } else {
      resolve(NSNull())
    }
  }
  
  @objc func setVolume(_ level: Float, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.main.async {
      let volumeView = MPVolumeView(frame: .zero)
      for subview in volumeView.subviews {
        if let slider = subview as? UISlider {
          slider.value = level
          resolve(true)
          return
        }
      }
      resolve(true) // MPVolumeView not available in this context
    }
  }
  
  @objc static func requiresMainQueueSetup() -> Bool { return false }
}
