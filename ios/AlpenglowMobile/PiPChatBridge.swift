import Foundation
import AVKit
import UIKit
import React

/// PiP Chat Overlay — Renders a chat UI as "video" frames in Picture-in-Picture.
/// This lets the chat float over other apps on iOS.
///
/// How it works:
/// 1. We create an AVSampleBufferDisplayLayer that renders UIView snapshots as video frames
/// 2. We wrap it in AVPictureInPictureController which gives us the floating window
/// 3. React Native sends message updates; we re-render the overlay view and push new frames
/// 4. Tap events on the PiP window bring the user back to the app
///
@objc(PiPChatBridge)
class PiPChatBridge: NSObject {

  private var pipController: AVPictureInPictureController?
  private var displayLayer: AVSampleBufferDisplayLayer?
  private var pipContentSource: Any? // AVPictureInPictureController.ContentSource (iOS 15+)
  private var frameTimer: Timer?
  private var overlayView: PiPOverlayView?
  private var isActive = false

  // Chat state
  private var messages: [(role: String, text: String)] = []
  private var agentName: String = "Silas"
  private var agentEmoji: String = "⚡"

  @objc static func requiresMainQueueSetup() -> Bool { return true }

  /// Start PiP with the current chat state
  @objc func startPiP(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.main.async { [weak self] in
      guard let self = self else { return }

      // Check PiP support
      guard AVPictureInPictureController.isPictureInPictureSupported() else {
        reject("PIP_UNSUPPORTED", "Picture-in-Picture is not supported on this device", nil)
        return
      }

      // Configure audio session for PiP (required even though we don't play audio)
      do {
        try AVAudioSession.sharedInstance().setCategory(.playback, mode: .moviePlayback)
        try AVAudioSession.sharedInstance().setActive(true)
      } catch {
        print("[PiP] Audio session setup failed: \(error)")
      }

      // Create the overlay view that we'll render as "video"
      let overlaySize = CGSize(width: 320, height: 180)
      self.overlayView = PiPOverlayView(frame: CGRect(origin: .zero, size: overlaySize))
      self.overlayView?.agentName = self.agentName
      self.overlayView?.agentEmoji = self.agentEmoji
      self.overlayView?.updateMessages(self.messages)

      // Create sample buffer display layer
      let layer = AVSampleBufferDisplayLayer()
      layer.frame = CGRect(origin: .zero, size: overlaySize)
      layer.videoGravity = .resizeAspect
      self.displayLayer = layer

      // Create PiP controller (iOS 15+ content source API)
      if #available(iOS 15.0, *) {
        let source = AVPictureInPictureController.ContentSource(
          sampleBufferDisplayLayer: layer,
          playbackDelegate: self
        )
        let controller = AVPictureInPictureController(contentSource: source)
        controller.delegate = self
        controller.canStartPictureInPictureAutomaticallyFromInline = true
        self.pipController = controller

        // Small delay to let the system initialize
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
          controller.startPictureInPicture()
        }
      } else {
        reject("PIP_VERSION", "Requires iOS 15+", nil)
        return
      }

      // Start frame rendering timer (push new frames at 1 fps — we're showing text, not video)
      self.frameTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
        self?.pushFrame()
      }
      self.pushFrame() // Initial frame

      self.isActive = true
      resolve(["status": "started"])
    }
  }

  /// Stop PiP
  @objc func stopPiP(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.main.async { [weak self] in
      self?.tearDown()
      resolve(["status": "stopped"])
    }
  }

  /// Update the chat messages shown in PiP
  @objc func updateMessages(_ messageArray: [[String: String]], resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    let parsed = messageArray.map { (role: $0["role"] ?? "user", text: $0["text"] ?? "") }
    self.messages = parsed

    DispatchQueue.main.async { [weak self] in
      self?.overlayView?.updateMessages(parsed)
      self?.pushFrame()
      resolve(["updated": true])
    }
  }

  /// Update agent info
  @objc func setAgent(_ name: String, emoji: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    self.agentName = name
    self.agentEmoji = emoji
    DispatchQueue.main.async { [weak self] in
      self?.overlayView?.agentName = name
      self?.overlayView?.agentEmoji = emoji
      self?.pushFrame()
      resolve(["ok": true])
    }
  }

  /// Check if PiP is currently active
  @objc func isRunning(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    resolve(["running": isActive])
  }

  // MARK: - Frame Rendering

  private func pushFrame() {
    guard let overlayView = overlayView, let displayLayer = displayLayer else { return }

    // Render the UIView to a pixel buffer
    let size = overlayView.bounds.size
    guard size.width > 0 && size.height > 0 else { return }

    UIGraphicsBeginImageContextWithOptions(size, true, 1.0)
    overlayView.drawHierarchy(in: overlayView.bounds, afterScreenUpdates: true)
    guard let image = UIGraphicsGetImageFromCurrentImageContext() else {
      UIGraphicsEndImageContext()
      return
    }
    UIGraphicsEndImageContext()

    guard let cgImage = image.cgImage else { return }

    // Create pixel buffer from CGImage
    let width = cgImage.width
    let height = cgImage.height
    var pixelBuffer: CVPixelBuffer?
    let attrs: [String: Any] = [
      kCVPixelBufferCGImageCompatibilityKey as String: true,
      kCVPixelBufferCGBitmapContextCompatibilityKey as String: true,
    ]
    CVPixelBufferCreate(kCFAllocatorDefault, width, height, kCVPixelFormatType_32ARGB, attrs as CFDictionary, &pixelBuffer)

    guard let buffer = pixelBuffer else { return }
    CVPixelBufferLockBaseAddress(buffer, [])
    let context = CGContext(
      data: CVPixelBufferGetBaseAddress(buffer),
      width: width, height: height,
      bitsPerComponent: 8, bytesPerRow: CVPixelBufferGetBytesPerRow(buffer),
      space: CGColorSpaceCreateDeviceRGB(),
      bitmapInfo: CGImageAlphaInfo.noneSkipFirst.rawValue
    )
    context?.draw(cgImage, in: CGRect(x: 0, y: 0, width: width, height: height))
    CVPixelBufferUnlockBaseAddress(buffer, [])

    // Create sample buffer
    var formatDescription: CMVideoFormatDescription?
    CMVideoFormatDescriptionCreateForImageBuffer(allocator: kCFAllocatorDefault, imageBuffer: buffer, formatDescriptionOut: &formatDescription)

    guard let format = formatDescription else { return }

    var timingInfo = CMSampleTimingInfo(
      duration: CMTime(value: 1, timescale: 1),
      presentationTimeStamp: CMTime(value: Int64(CACurrentMediaTime() * 1000), timescale: 1000),
      decodeTimeStamp: .invalid
    )

    var sampleBuffer: CMSampleBuffer?
    CMSampleBufferCreateForImageBuffer(
      allocator: kCFAllocatorDefault,
      imageBuffer: buffer,
      dataReady: true,
      makeDataReadyCallback: nil,
      refcon: nil,
      formatDescription: format,
      sampleTiming: &timingInfo,
      sampleBufferOut: &sampleBuffer
    )

    if let sample = sampleBuffer {
      displayLayer.enqueue(sample)
    }
  }

  private func tearDown() {
    frameTimer?.invalidate()
    frameTimer = nil
    pipController?.stopPictureInPicture()
    pipController = nil
    displayLayer = nil
    overlayView = nil
    isActive = false
  }
}

// MARK: - AVPictureInPictureControllerDelegate

extension PiPChatBridge: AVPictureInPictureControllerDelegate {
  func pictureInPictureControllerWillStartPictureInPicture(_ controller: AVPictureInPictureController) {
    print("[PiP] Will start")
  }

  func pictureInPictureControllerDidStartPictureInPicture(_ controller: AVPictureInPictureController) {
    print("[PiP] Started")
    isActive = true
  }

  func pictureInPictureControllerDidStopPictureInPicture(_ controller: AVPictureInPictureController) {
    print("[PiP] Stopped")
    isActive = false
  }

  func pictureInPictureController(_ controller: AVPictureInPictureController, failedToStartPictureInPictureWithError error: Error) {
    print("[PiP] Failed to start: \(error)")
    isActive = false
  }

  func pictureInPictureController(_ controller: AVPictureInPictureController, restoreUserInterfaceForPictureInPictureStopWithCompletionHandler completionHandler: @escaping (Bool) -> Void) {
    // User tapped the PiP to return to the app
    print("[PiP] Restore UI — returning to app")
    completionHandler(true)
  }
}

// MARK: - AVPictureInPictureSampleBufferPlaybackDelegate

@available(iOS 15.0, *)
extension PiPChatBridge: AVPictureInPictureSampleBufferPlaybackDelegate {
  func pictureInPictureController(_ controller: AVPictureInPictureController, setPlaying playing: Bool) {
    // No-op — we're rendering text, not playing media
  }

  func pictureInPictureControllerTimeRangeForPlayback(_ controller: AVPictureInPictureController) -> CMTimeRange {
    return CMTimeRange(start: .negativeInfinity, duration: .positiveInfinity)
  }

  func pictureInPictureControllerIsPlaybackPaused(_ controller: AVPictureInPictureController) -> Bool {
    return false
  }

  func pictureInPictureController(_ controller: AVPictureInPictureController, didTransitionToRenderSize newRenderSize: CMVideoDimensions) {
    // Update overlay size if PiP window is resized
    let newSize = CGSize(width: CGFloat(newRenderSize.width), height: CGFloat(newRenderSize.height))
    DispatchQueue.main.async { [weak self] in
      self?.overlayView?.frame = CGRect(origin: .zero, size: newSize)
      self?.overlayView?.setNeedsLayout()
      self?.pushFrame()
    }
  }

  func pictureInPictureController(_ controller: AVPictureInPictureController, skipByInterval skipInterval: CMTime, completion completionHandler: @escaping () -> Void) {
    completionHandler()
  }
}

// MARK: - PiP Overlay View (the "video" content)

class PiPOverlayView: UIView {
  var agentName: String = "Silas"
  var agentEmoji: String = "⚡"

  private let headerLabel = UILabel()
  private let messageStack = UIStackView()
  private let inputHint = UILabel()

  override init(frame: CGRect) {
    super.init(frame: frame)
    setupUI()
  }

  required init?(coder: NSCoder) { fatalError() }

  private func setupUI() {
    backgroundColor = UIColor(red: 0.08, green: 0.09, blue: 0.14, alpha: 1.0)
    layer.cornerRadius = 12
    clipsToBounds = true

    // Header
    headerLabel.font = .boldSystemFont(ofSize: 13)
    headerLabel.textColor = .white
    headerLabel.text = "\(agentEmoji) \(agentName)"
    addSubview(headerLabel)

    // Message area
    messageStack.axis = .vertical
    messageStack.spacing = 4
    messageStack.alignment = .leading
    addSubview(messageStack)

    // Input hint
    inputHint.font = .systemFont(ofSize: 10)
    inputHint.textColor = UIColor(white: 0.5, alpha: 1.0)
    inputHint.text = "Tap to open Alpenglow"
    inputHint.textAlignment = .center
    addSubview(inputHint)
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    let pad: CGFloat = 10
    let w = bounds.width - pad * 2

    headerLabel.frame = CGRect(x: pad, y: pad, width: w, height: 16)
    let inputH: CGFloat = 16
    inputHint.frame = CGRect(x: pad, y: bounds.height - inputH - 6, width: w, height: inputH)
    let msgTop = headerLabel.frame.maxY + 6
    let msgBottom = inputHint.frame.minY - 4
    messageStack.frame = CGRect(x: pad, y: msgTop, width: w, height: max(0, msgBottom - msgTop))
  }

  func updateMessages(_ messages: [(role: String, text: String)]) {
    headerLabel.text = "\(agentEmoji) \(agentName)"

    // Clear old messages
    messageStack.arrangedSubviews.forEach { $0.removeFromSuperview() }

    // Show last 3 messages that fit
    let recent = messages.suffix(3)
    for msg in recent {
      let label = UILabel()
      label.numberOfLines = 2
      label.lineBreakMode = .byTruncatingTail

      if msg.role == "user" {
        label.font = .systemFont(ofSize: 11)
        label.textColor = UIColor(red: 0.3, green: 0.6, blue: 1.0, alpha: 1.0)
        label.text = "You: \(msg.text)"
      } else {
        label.font = .systemFont(ofSize: 11)
        label.textColor = UIColor(white: 0.85, alpha: 1.0)
        label.text = "\(agentEmoji) \(msg.text)"
      }

      messageStack.addArrangedSubview(label)
    }

    setNeedsLayout()
  }
}
